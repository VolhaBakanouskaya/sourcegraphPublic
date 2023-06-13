import { BotResponseMultiplexer } from '../chat/bot-response-multiplexer'
import { RecipeContext } from '../chat/recipes/recipe'
import { CodebaseContext } from '../codebase-context'
import { ActiveTextEditor, ActiveTextEditorSelection, ActiveTextEditorVisibleContent, Editor } from '../editor'
import { EmbeddingsSearch } from '../embeddings'
import { IntentDetector } from '../intent-detector'
import { KeywordContextFetcher, ContextResult } from '../local-context'
import { EmbeddingsSearchResults } from '../sourcegraph-api/graphql'

export class MockEmbeddingsClient implements EmbeddingsSearch {
    constructor(private mocks: Partial<EmbeddingsSearch> = {}) {}

    public search(
        query: string,
        codeResultsCount: number,
        textResultsCount: number
    ): Promise<EmbeddingsSearchResults | Error> {
        return (
            this.mocks.search?.(query, codeResultsCount, textResultsCount) ??
            Promise.resolve({ codeResults: [], textResults: [] })
        )
    }
}

export class MockIntentDetector implements IntentDetector {
    constructor(private mocks: Partial<IntentDetector> = {}) {}

    public isCodebaseContextRequired(input: string): Promise<boolean | Error> {
        return this.mocks.isCodebaseContextRequired?.(input) ?? Promise.resolve(false)
    }

    public isEditorContextRequired(input: string): Promise<boolean | Error> {
        return Promise.resolve(this.mocks.isEditorContextRequired?.(input) ?? false)
    }
}

export class MockKeywordContextFetcher implements KeywordContextFetcher {
    constructor(private mocks: Partial<KeywordContextFetcher> = {}) {}

    public getContext(query: string, numResults: number): Promise<ContextResult[]> {
        return this.mocks.getContext?.(query, numResults) ?? Promise.resolve([])
    }

    public getSearchContext(query: string, numResults: number): Promise<ContextResult[]> {
        return this.mocks.getSearchContext?.(query, numResults) ?? Promise.resolve([])
    }
}

export class MockEditor implements Editor {
    constructor(private mocks: Partial<Editor> = {}) {}

    public fileName = ''
    public getWorkspaceRootPath(): Promise<string | null> {
        return this.mocks.getWorkspaceRootPath?.() ?? Promise.resolve(null)
    }

    public getActiveTextEditorSelection(): Promise<ActiveTextEditorSelection | null> {
        return this.mocks.getActiveTextEditorSelection?.() ?? Promise.resolve(null)
    }

    public getActiveTextEditorSelectionOrEntireFile(): Promise<ActiveTextEditorSelection | null> {
        return this.mocks.getActiveTextEditorSelection?.() ?? Promise.resolve(null)
    }

    public getActiveTextEditor(): Promise<ActiveTextEditor | null> {
        return this.mocks.getActiveTextEditor?.() ?? Promise.resolve(null)
    }

    public getActiveTextEditorVisibleContent(): Promise<ActiveTextEditorVisibleContent | null> {
        return this.mocks.getActiveTextEditorVisibleContent?.() ?? Promise.resolve(null)
    }

    public replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void> {
        return this.mocks.replaceSelection?.(fileName, selectedText, replacement) ?? Promise.resolve()
    }

    public showQuickPick(labels: string[]): Promise<string | null> {
        return this.mocks.showQuickPick?.(labels) ?? Promise.resolve(null)
    }

    public showWarningMessage(message: string): Promise<void> {
        return this.mocks.showWarningMessage?.(message) ?? Promise.resolve()
    }

    public showInputBox(prompt?: string): Promise<string | null> {
        return this.mocks.showInputBox?.(prompt) ?? Promise.resolve(null)
    }

    public didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
        return this.mocks.didReceiveFixupText?.(id, text, state) ?? Promise.resolve(undefined)
    }
}

export const defaultEmbeddingsClient = new MockEmbeddingsClient()

export const defaultIntentDetector = new MockIntentDetector()

export const defaultKeywordContextFetcher = new MockKeywordContextFetcher()

export const defaultEditor = new MockEditor()

export function newRecipeContext(args?: Partial<RecipeContext>): RecipeContext {
    args = args || {}
    return {
        editor: args.editor || defaultEditor,
        intentDetector: args.intentDetector || defaultIntentDetector,
        codebaseContext:
            args.codebaseContext ||
            new CodebaseContext(
                { useContext: 'none', serverEndpoint: 'https://example.com' },
                'dummy-codebase',
                defaultEmbeddingsClient,
                defaultKeywordContextFetcher,
                null
            ),
        responseMultiplexer: args.responseMultiplexer || new BotResponseMultiplexer(),
        firstInteraction: args.firstInteraction ?? false,
    }
}
