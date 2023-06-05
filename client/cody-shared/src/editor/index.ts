export interface ActiveTextEditor {
    content: string
    filePath: string
    repoName?: string
    revision?: string
}

export interface ActiveTextEditorSelection {
    fileName: string
    repoName?: string
    revision?: string
    precedingText: string
    selectedText: string
    followingText: string
}

export interface ActiveTextEditorVisibleContent {
    content: string
    fileName: string
    repoName?: string
    revision?: string
}

interface VsCodeInlineController {
    selection: ActiveTextEditorSelection | null
    error(): Promise<void>
}

// TODO: Move this interface to client/cody
interface VsCodeTaskController {
    add(input: string, selection: ActiveTextEditorSelection): string | null
    stop(taskID: string): void
}

export interface ActiveTextEditorViewControllers {
    inline: VsCodeInlineController
    // TODO: Remove this field once the fixup task view moves to client/cody
    task: VsCodeTaskController
}

export interface Editor {
    controllers?: ActiveTextEditorViewControllers
    getWorkspaceRootPath(): Promise<string | null>
    getActiveTextEditor(): Promise<ActiveTextEditor | null>
    getActiveTextEditorSelection(): Promise<ActiveTextEditorSelection | null>

    /**
     * Gets the active text editor's selection, or the entire file if the selected range is empty.
     */
    getActiveTextEditorSelectionOrEntireFile(): Promise<ActiveTextEditorSelection | null>

    getActiveTextEditorVisibleContent(): Promise<ActiveTextEditorVisibleContent | null>
    replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void>
    showQuickPick(labels: string[]): Promise<string | null>
    showWarningMessage(message: string): Promise<void>
    showInputBox(prompt?: string): Promise<string | undefined>

    // TODO: When Non-Stop Fixup doesn't depend directly on the chat view,
    // move the recipe to client/cody and remove this entrypoint.
    didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void>
}

export class NoopEditor implements Editor {
    public getWorkspaceRootPath(): Promise<string | null> {
        return Promise.resolve(null)
    }

    public getActiveTextEditor(): Promise<ActiveTextEditor | null> {
        return Promise.resolve(null)
    }

    public getActiveTextEditorSelection(): Promise<ActiveTextEditorSelection | null> {
        return Promise.resolve(null)
    }

    public getActiveTextEditorSelectionOrEntireFile(): Promise<ActiveTextEditorSelection | null> {
        return Promise.resolve(null)
    }

    public getActiveTextEditorVisibleContent(): Promise<ActiveTextEditorVisibleContent | null> {
        return Promise.resolve(null)
    }

    public replaceSelection(_fileName: string, _selectedText: string, _replacement: string): Promise<void> {
        return Promise.resolve()
    }

    public showQuickPick(_labels: string[]): Promise<string | null> {
        return Promise.resolve(null)
    }

    public showWarningMessage(_message: string): Promise<void> {
        return Promise.resolve()
    }

    public showInputBox(_prompt?: string): Promise<string | null> {
        return Promise.resolve(null)
    }

    public didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
        return Promise.resolve()
    }
}
