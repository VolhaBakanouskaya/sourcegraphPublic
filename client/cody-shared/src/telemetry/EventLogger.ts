import * as vscode from 'vscode'

import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

function getServerEndpointFromConfig(config: vscode.WorkspaceConfiguration): string {
    return config.get<string>('cody.serverEndpoint', '')
}

function getUseContextFromConfig(config: vscode.WorkspaceConfiguration): string {
    if (!config) {
        return ''
    }
    return config.get<string>('cody.useContext', '')
}

function getChatPredictionsFromConfig(config: vscode.WorkspaceConfiguration): boolean {
    if (!config) {
        return false
    }
    return config.get<boolean>('cody.experimental.chatPredictions', false)
}

function getInlineFromConfig(config: vscode.WorkspaceConfiguration): boolean {
    if (!config) {
        return false
    }
    return config.get<boolean>('cody.experimental.inline', false)
}

function getNonStopFromConfig(config: vscode.WorkspaceConfiguration): boolean {
    if (!config) {
        return false
    }
    return config.get<boolean>('cody.experimental.nonStop', false)
}

function getSuggestionsFromConfig(config: vscode.WorkspaceConfiguration): boolean {
    if (!config) {
        return false
    }
    return config.get<boolean>('cody.experimental.suggestions', false)
}

function getGuardrailsFromConfig(config: vscode.WorkspaceConfiguration): boolean {
    if (!config) {
        return false
    }
    return config.get<boolean>('cody.experimental.guardrails', false)
}

const config = vscode.workspace.getConfiguration()

let configurationDetails = {
    contextSelection: getUseContextFromConfig(config),
    chatPredictions: getChatPredictionsFromConfig(config),
    inline: getInlineFromConfig(config),
    nonStop: getNonStopFromConfig(config),
    suggestions: getSuggestionsFromConfig(config),
    guardrails: getGuardrailsFromConfig(config),
}

export function onConfigurationChange(newconfig: any): any {
    newconfig = vscode.workspace.getConfiguration()
    configurationDetails = {
        contextSelection: getUseContextFromConfig(newconfig),
        chatPredictions: getChatPredictionsFromConfig(newconfig),
        inline: getInlineFromConfig(newconfig),
        nonStop: getNonStopFromConfig(newconfig),
        suggestions: getSuggestionsFromConfig(newconfig),
        guardrails: getGuardrailsFromConfig(newconfig),
    }
    EventLogger.setConfigurationDetails(configurationDetails)
}

export class EventLogger {
    private serverEndpoint = getServerEndpointFromConfig(config)
    private extensionDetails = { ide: 'VSCode', ideExtensionType: 'Cody' }
    public configurationDetails = configurationDetails
    private constructor(private gqlAPIClient: SourcegraphGraphQLAPIClient) {}

    public static create(gqlAPIClient: SourcegraphGraphQLAPIClient): EventLogger {
        return new EventLogger(gqlAPIClient)
    }

    public static setConfigurationDetails(newConfigurationDetails: {
        contextSelection: string
        chatPredictions: boolean
        inline: boolean
        nonStop: boolean
        suggestions: boolean
        guardrails: boolean
    }): any {
        configurationDetails = newConfigurationDetails
    }

    /**
     * Logs an event.
     *
     * PRIVACY: Do NOT include any potentially private information in this
     * field. These properties get sent to our analytics tools for Cloud, so
     * must not include private information, such as search queries or
     * repository names.
     *
     * @param eventName The name of the event.
     * @param anonymousUserID The randomly generated unique user ID.
     * @param eventProperties The additional argument information.
     * @param publicProperties Public argument information.
     */
    public log(eventName: string, anonymousUserID: string, eventProperties?: any, publicProperties?: any): void {
        const argument = {
            ...eventProperties,
            serverEndpoint: this.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails,
        }
        const publicArgument = {
            ...publicProperties,
            serverEndpoint: this.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails,
        }
        try {
            this.gqlAPIClient
                .logEvent({
                    event: eventName,
                    userCookieID: anonymousUserID,
                    source: 'IDEEXTENSION',
                    url: '',
                    argument: JSON.stringify(argument),
                    publicArgument: JSON.stringify(publicArgument),
                })
                .then(() => {})
                .catch(() => {})
        } catch (error) {
            console.log(error)
        }
    }
}
