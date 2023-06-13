/* eslint-disable no-void */
import { Client, ClientInitConfig, createClient } from '@sourcegraph/cody-shared/src/chat/client'
import { registeredRecipes } from '@sourcegraph/cody-shared/src/chat/recipes/agent-recipes'
import {
    ActiveTextEditor,
    ActiveTextEditorSelection,
    ActiveTextEditorViewControllers,
    ActiveTextEditorVisibleContent,
    Editor,
} from '@sourcegraph/cody-shared/src/editor'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { StaticEditor } from './protocol'
import { MessageHandler } from './rpc'

export class AgentIntentDetector implements IntentDetector {
    constructor(private agent: Agent) {}

    public isCodebaseContextRequired(input: string): Promise<boolean | Error> {
        return this.agent.request('intent/isCodebaseContextRequired', input)
    }
    public isEditorContextRequired(input: string): Promise<boolean | Error> {
        return this.agent.request('intent/isEditorContextRequired', input)
    }
}

export class AgentEditor implements Editor {
    // TODO
    public controllers?: ActiveTextEditorViewControllers | undefined

    constructor(private agent: Agent, private staticEditor: StaticEditor) {}

    public didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
        throw new Error('Method not implemented.')
    }

    public getWorkspaceRootPath(): Promise<string | null> {
        return Promise.resolve(this.staticEditor.workspaceRoot)
    }

    public getActiveTextEditor(): Promise<ActiveTextEditor | null> {
        return this.agent.request('editor/active', void {})
    }

    public getActiveTextEditorSelection(): Promise<ActiveTextEditorSelection | null> {
        return this.agent.request('editor/selection', void {})
    }

    public getActiveTextEditorSelectionOrEntireFile(): Promise<ActiveTextEditorSelection | null> {
        return this.agent.request('editor/selectionOrEntireFile', void {})
    }

    public getActiveTextEditorVisibleContent(): Promise<ActiveTextEditorVisibleContent | null> {
        return this.agent.request('editor/visibleContent', void {})
    }

    public async replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void> {
        // Handle possible failure
        await this.agent.request('editor/replaceSelection', {
            fileName,
            selectedText,
            replacement,
        })
    }

    public showQuickPick(labels: string[]): Promise<string | null> {
        return this.agent.request('editor/quickPick', labels)
    }

    public showWarningMessage(message: string): Promise<void> {
        this.agent.notify('editor/warning', message)
        return Promise.resolve()
    }

    public showInputBox(prompt?: string | undefined): Promise<string | null> {
        return this.agent.request('editor/prompt', prompt || '')
    }
}

export class Agent extends MessageHandler {
    private client: Promise<Client>

    constructor() {
        super()

        const config: ClientInitConfig = {
            customHeaders: {},
            accessToken: process.env.SRC_ACCESS_TOKEN!,
            serverEndpoint: process.env.SRC_ENDPOINT || 'https://sourcegraph.sourcegraph.com',
            useContext: 'none',
        }
        this.client = createClient({
            editor: new AgentEditor(this, {
                workspaceRoot: null,
            }),
            config,
            setMessageInProgress: messageInProgress => {
                this.notify('chat/updateMessageInProgress', messageInProgress)
            },
            setTranscript: transcript => {
                transcript.toJSON().then(
                    value => this.notify('chat/updateTranscript', value),
                    () => {}
                )
            },
            CompletionsClient: config => new SourcegraphNodeCompletionsClient(config),
        })

        this.registerRequest('initialize', client => {
            process.stderr.write(`Beginning handshake with client ${client.name}\n`)
            return Promise.resolve({
                name: 'cody-agent',
            })
        })

        this.registerRequest('shutdown', async client => {})

        this.registerNotification('exit', client => {
            process.exit(0)
        })

        this.registerRequest('recipes/list', data =>
            Promise.resolve(
                Object.values(registeredRecipes).map(({ id, title }) => ({
                    id,
                    title,
                }))
            )
        )

        this.registerRequest('recipes/execute', async data => {
            const client = await this.client
            await client.executeRecipe(data.id, {
                humanChatInput: data.humanChatInput,
            })
        })
    }
}
