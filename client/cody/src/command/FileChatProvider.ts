import * as vscode from 'vscode'

import { ActiveTextEditorSelection } from '@sourcegraph/cody-shared/src/editor'

import { SURROUNDING_LINES } from '../editor/vscode-editor'

export class FileChatMessage implements vscode.Comment {
    private id = 0
    public label: string | undefined
    public markdownBody: string | vscode.MarkdownString

    constructor(
        public body: string | vscode.MarkdownString,
        public mode: vscode.CommentMode,
        public author: vscode.CommentAuthorInformation,
        public parent?: vscode.CommentThread,
        public contextValue?: string
    ) {
        this.id = this.id++
        this.markdownBody = this.body
    }
}

export class FileChatProvider {
    private readonly codyIcon: vscode.Uri = this.getIconPath('cody')
    private readonly userIcon: vscode.Uri = this.getIconPath('user')

    private readonly id = 'cody-file-chat'
    private readonly label = 'Cody: File Chat'
    private readonly threadLabel = 'Ask Cody...'
    private options = {
        prompt: 'Click here to ask Cody.',
        placeHolder:
            'Ask Cody a question, or start with /fix to have it perform edits. e.g. “How could you rewrite this in less lines?” or “/fix make the logo bigger”.',
    }

    private commentController: vscode.CommentController

    public threads: vscode.CommentReply | null = null
    public thread: vscode.CommentThread | null = null
    public editor: vscode.TextEditor | null = null
    public selection: ActiveTextEditorSelection | null = null
    public selectionRange: vscode.Range | null = null

    // Status trackers
    public addedLines = 0
    public isInProgress = false

    constructor(private extensionPath: string) {
        // Init
        this.commentController = vscode.comments.createCommentController(this.id, this.label)
        this.commentController.options = this.options
        this.commentController.commentingRangeProvider = {
            provideCommentingRanges: (document: vscode.TextDocument) => {
                const lineCount = document.lineCount
                return [new vscode.Range(0, 0, lineCount - 1, 0)]
            },
        }
        // Track and update line of changes when the task for the current selected range is being processed
        vscode.workspace.onDidChangeTextDocument(e => {
            if (!this.isInProgress || !this.selectionRange) {
                return
            }
            for (const change of e.contentChanges) {
                if (this.selectionRange.end.line < change.range.start.line) {
                    return
                }
                let addedLines = 0
                if (change.text.includes('\n')) {
                    addedLines = change.text.split('\n').length - 1
                } else if (change.range.end.line - change.range.start.line > 0) {
                    addedLines -= change.range.end.line - change.range.start.line
                }
                this.selectionRange = new vscode.Range(
                    new vscode.Position(this.selectionRange.start.line + addedLines, 0),
                    new vscode.Position(this.selectionRange.end.line + addedLines, 0)
                )
            }
        })
    }

    public get(): vscode.CommentController {
        return this.commentController
    }

    /**
     * List response from Human as comment
     */
    public async chat(threads: vscode.CommentReply, isFixMode: boolean = false): Promise<void> {
        this.isInProgress = true
        this.addedLines = 0
        const humanInput = threads.text
        const thread = threads.thread
        thread.label = this.threadLabel
        const newComment = new FileChatMessage(
            this.markdown(humanInput),
            vscode.CommentMode.Preview,
            { name: 'Me', iconPath: this.userIcon },
            thread,
            'loading'
        )
        thread.comments = [...thread.comments, newComment]
        // disable reply until the task is completed
        thread.canReply = false
        this.threads = threads
        this.thread = thread
        this.selection = await this.getSelection(isFixMode)
        void vscode.commands.executeCommand('setContext', 'cody.replied', false)
    }

    /**
     * List response from Cody as comment
     */
    public reply(text: string): void {
        if (!this.thread) {
            return
        }
        const codyReply = new FileChatMessage(
            this.markdown(text.replace(/:$/, '.')),
            vscode.CommentMode.Preview,
            { name: 'Cody', iconPath: this.codyIcon },
            this.thread,
            undefined
        )
        this.thread.comments = [...this.thread.comments, codyReply]
        this.thread.canReply = true
        this.thread.collapsibleState = 0
        void vscode.commands.executeCommand('setContext', 'cody.replied', true)
    }

    /**
     * Remove comment thread / conversation
     */
    public delete(thread: vscode.CommentThread): void {
        this.removeDecorate()
        thread.dispose()
        this.thread?.dispose()
        this.reset()
    }

    public reset(): void {
        this.selectionRange = null
        this.addedLines = 0
        this.thread = null
    }

    /**
     * Turns string into Markdown string
     */
    private markdown(text: string): vscode.MarkdownString {
        const markdownText = new vscode.MarkdownString(text)
        markdownText.isTrusted = true
        markdownText.supportHtml = true
        return markdownText
    }

    /**
     * When a comment thread is open, the Editor will be switched to the comment input editor.
     * Get the current editor using the comment thread uri instead
     */
    public async getEditor(): Promise<vscode.TextEditor | null> {
        if (!this.thread) {
            return null
        }
        await vscode.window.showTextDocument(this.thread.uri)
        this.editor = vscode.window.activeTextEditor || null
        return this.editor
    }

    /**
     * Get current selected lines from the comment thread.
     * Add an extra line to the end line to prevent empty selection on single line selection
     */
    public async getSelection(isFixMode: boolean): Promise<ActiveTextEditorSelection | null> {
        if (!this.thread) {
            return null
        }
        const activeDocument = await vscode.workspace.openTextDocument(this.thread.uri)
        const lineLength = activeDocument.lineAt(this.thread.range.end.line).text.length
        const endPostFix = new vscode.Position(this.thread.range.end.line, lineLength)
        const endPostAsk = new vscode.Position(this.thread.range.end.line + 1, 0)
        const selectionRange = new vscode.Range(this.thread.range.start, isFixMode ? endPostFix : endPostAsk)
        const precedingText = activeDocument.getText(
            new vscode.Range(
                new vscode.Position(Math.max(0, this.thread.range.start.line - SURROUNDING_LINES), 0),
                this.thread.range.start
            )
        )
        const followingText = activeDocument.getText(
            new vscode.Range(
                this.thread.range.end,
                new vscode.Position(this.thread.range.end.line + 1 + SURROUNDING_LINES, 0)
            )
        )
        const selection = {
            fileName: vscode.workspace.asRelativePath(this.thread.uri.fsPath),
            selectedText: activeDocument.getText(selectionRange),
            precedingText,
            followingText,
        }
        this.selectionRange = selectionRange
        this.selection = selection
        return selection
    }

    /**
     * Highlights line where the codes updated by Cody are located.
     */
    public async decorate(updatedLength: number): Promise<void> {
        if (!this.thread) {
            return
        }
        const doc = vscode.window.activeTextEditor?.document
        if (doc?.fileName.startsWith('/commentinput')) {
            return
        }
        const currentFile = doc || (await vscode.workspace.openTextDocument(this.thread?.uri))
        if (!currentFile) {
            return
        }
        const mdText = this.markdown(this.selection?.selectedText || '')
        const decorations: vscode.DecorationOptions[] = []
        if (this.selectionRange) {
            const start = new vscode.Position(this.selectionRange.start.line, 0)
            const end = new vscode.Position(this.selectionRange.end.line - updatedLength + 1, 0)
            decorations.push({
                range: new vscode.Range(start, end),
                hoverMessage: mdText,
            })
        }
        if (this.thread && this.thread.uri.toString() === '') {
            await vscode.window.showTextDocument(this.thread.uri)
        }
        vscode.window.activeTextEditor?.setDecorations(this.decorationType, decorations)
    }

    /**
     * Remove all decorations on save / accept button click
     */
    public removeDecorate(): void {
        if (!this.thread) {
            return
        }
        const editor = vscode.window.activeTextEditor
        editor?.setDecorations(this.decorationType, [])
    }

    /**
     * Define styles
     */
    private decorationType = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: '1px',
        borderStyle: 'solid',
        backgroundColor: 'rgba(161, 18, 255, 0.33)',
        overviewRulerColor: 'rgba(161, 18, 255, 0.33)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
            borderColor: 'rgba(161, 18, 255, 0.33)',
        },
        dark: {
            borderColor: 'rgba(161, 18, 255, 0.33)',
        },
    })

    /**
     * Generate icon path for each speaker
     */
    private getIconPath(speaker: string): vscode.Uri {
        const extensionPath = vscode.Uri.file(this.extensionPath)
        const webviewPath = vscode.Uri.joinPath(extensionPath, 'dist')
        return vscode.Uri.joinPath(webviewPath, speaker === 'cody' ? 'cody.png' : 'sourcegraph.png')
    }
}
