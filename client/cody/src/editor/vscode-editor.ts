import * as vscode from 'vscode'

import {
    ActiveTextEditor,
    ActiveTextEditorSelection,
    ActiveTextEditorVisibleContent,
    Editor,
} from '@sourcegraph/cody-shared/src/editor'
import { SURROUNDING_LINES } from '@sourcegraph/cody-shared/src/prompt/constants'

import { FixupController } from '../non-stop/FixupController'
import { InlineController } from '../services/InlineController'

export class VSCodeEditor implements Editor {
    constructor(
        public controllers: {
            inline: InlineController
            // TODO: Rename this from "task" to "fixup" when the fixup data
            // model moves from client/cody-shared to client/cody
            task: FixupController
        }
    ) {}

    public get fileName(): Promise<string> {
        return Promise.resolve(vscode.window.activeTextEditor?.document.fileName ?? '')
    }

    public getWorkspaceRootPath(): Promise<string | null> {
        const uri = vscode.window.activeTextEditor?.document?.uri
        if (uri) {
            const wsFolder = vscode.workspace.getWorkspaceFolder(uri)
            if (wsFolder) {
                return Promise.resolve(wsFolder.uri.fsPath)
            }
        }
        return Promise.resolve(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? null)
    }

    public getActiveTextEditor(): Promise<ActiveTextEditor | null> {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return Promise.resolve(null)
        }
        const documentUri = activeEditor.document.uri
        const documentText = activeEditor.document.getText()
        return Promise.resolve({ content: documentText, filePath: documentUri.fsPath })
    }

    private getActiveTextEditorInstance(): vscode.TextEditor | null {
        const activeEditor = vscode.window.activeTextEditor
        return activeEditor && activeEditor.document.uri.scheme === 'file' ? activeEditor : null
    }

    public getActiveTextEditorSelection(): Promise<ActiveTextEditorSelection | null> {
        if (this.controllers.inline.isInProgress) {
            return Promise.resolve(null)
        }
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return Promise.resolve(null)
        }
        const selection = activeEditor.selection
        if (!selection || selection?.start.isEqual(selection.end)) {
            return Promise.resolve(null)
        }
        return Promise.resolve(this.createActiveTextEditorSelection(activeEditor, selection))
    }

    public getActiveTextEditorSelectionOrEntireFile(): Promise<ActiveTextEditorSelection | null> {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return Promise.resolve(null)
        }
        let selection = activeEditor.selection
        if (!selection || selection.isEmpty) {
            selection = new vscode.Selection(0, 0, activeEditor.document.lineCount, 0)
        }
        return Promise.resolve(this.createActiveTextEditorSelection(activeEditor, selection))
    }

    private createActiveTextEditorSelection(
        activeEditor: vscode.TextEditor,
        selection: vscode.Selection
    ): ActiveTextEditorSelection {
        const precedingText = activeEditor.document.getText(
            new vscode.Range(
                new vscode.Position(Math.max(0, selection.start.line - SURROUNDING_LINES), 0),
                selection.start
            )
        )
        const followingText = activeEditor.document.getText(
            new vscode.Range(selection.end, new vscode.Position(selection.end.line + SURROUNDING_LINES, 0))
        )

        return {
            fileName: vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath),
            selectedText: activeEditor.document.getText(selection),
            precedingText,
            followingText,
        }
    }

    public getActiveTextEditorVisibleContent(): Promise<ActiveTextEditorVisibleContent | null> {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return Promise.resolve(null)
        }

        const visibleRanges = activeEditor.visibleRanges
        if (visibleRanges.length === 0) {
            return Promise.resolve(null)
        }

        const visibleRange = visibleRanges[0]
        const content = activeEditor.document.getText(
            new vscode.Range(
                new vscode.Position(visibleRange.start.line, 0),
                new vscode.Position(visibleRange.end.line + 1, 0)
            )
        )

        return Promise.resolve({
            fileName: vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath),
            content,
        })
    }

    public async replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void> {
        const activeEditor = this.getActiveTextEditorInstance()
        if (this.controllers.inline.isInProgress) {
            await this.controllers.inline.replace(fileName, replacement, selectedText)
            return
        }
        if (!activeEditor || vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath) !== fileName) {
            // TODO: should return something indicating success or failure
            console.error('Missing file')
            return
        }
        const selection = activeEditor.selection
        if (!selection) {
            console.error('Missing selection')
            return
        }
        if (activeEditor.document.getText(selection) !== selectedText) {
            // TODO: Be robust to this.
            await vscode.window.showInformationMessage(
                'The selection changed while Cody was working. The text will not be edited.'
            )
            return
        }

        // Editing the document
        await activeEditor.edit(edit => {
            edit.replace(selection, replacement)
        })

        return
    }

    public async showQuickPick(labels: string[]): Promise<string | null> {
        const label = (await vscode.window.showQuickPick(labels)) ?? null
        return label
    }

    public async showWarningMessage(message: string): Promise<void> {
        await vscode.window.showWarningMessage(message)
    }

    public async showInputBox(prompt?: string): Promise<string | null> {
        return (
            (await vscode.window.showInputBox({
                placeHolder: prompt || 'Enter here...',
            })) ?? null
        )
    }

    // TODO: When Non-Stop Fixup doesn't depend directly on the chat view,
    // move the recipe to client/cody and remove this entrypoint.
    public async didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
        await this.controllers.task.didReceiveFixupText(id, text, state)
    }
}
