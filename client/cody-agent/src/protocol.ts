import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import {
    ActiveTextEditor,
    ActiveTextEditorSelection,
    ActiveTextEditorVisibleContent,
} from '@sourcegraph/cody-shared/src/editor'

// The RPC is packaged in the same way as LSP:
// Content-Length: lengthInBytes\r\n
// \r\n
// ...

// The RPC initialization process is the same as LSP:
// (-- Server process started; session begins --)
// Client: initialize request
// Server: initialize response
// Client: initialized notification
// Client and server send anything they want after this point
// The RPC shutdown process is the same as LSP:
// Client: shutdown request
// Server: shutdown response
// Client: exit notification
// (-- Server process exited; session ends --)
export type Requests = {
    // Client -> Server
    initialize: [ClientInfo, ServerInfo]
    shutdown: [void, void]

    'recipes/list': [void, RecipeInfo[]]
    'recipes/execute': [ExecuteRecipeParams, void]

    // Server -> Client
    'editor/quickPick': [string[], string | null]
    'editor/prompt': [string, string | null]

    'editor/active': [void, ActiveTextEditor | null]
    'editor/selection': [void, ActiveTextEditorSelection | null]
    'editor/selectionOrEntireFile': [void, ActiveTextEditorSelection | null]
    'editor/visibleContent': [void, ActiveTextEditorVisibleContent | null]

    'intent/isCodebaseContextRequired': [string, boolean]
    'intent/isEditorContextRequired': [string, boolean]

    'editor/replaceSelection': [ReplaceSelectionParams, ReplaceSelectionResult]
}

export type Notifications = {
    // Client -> Server
    initialized: [void]
    exit: [void]

    // Server -> Client
    'editor/warning': [string]

    'chat/updateMessageInProgress': [ChatMessage | null]
    'chat/updateTranscript': [TranscriptJSON]
}

export interface RecipeInfo {
    id: RecipeID
    title: string
}

export interface StaticEditor {
    workspaceRoot: string | null
}

// Static recipe context that lots of recipes might need
// More context is obtained if necessary via server to client requests
export interface StaticRecipeContext {
    editor: StaticEditor
    firstInteraction: boolean
}

export interface ExecuteRecipeParams {
    id: RecipeID
    humanChatInput: string
    context: StaticRecipeContext
}

export interface ReplaceSelectionParams {
    fileName: string
    selectedText: string
    replacement: string
}

export interface ReplaceSelectionResult {
    applied: boolean
    failureReason: string
}

// TODO: Add some version info to prevent version incompatibilities
// TODO: Add capabilities so clients can announce what they can handle
export interface ClientInfo {
    name: string
}

export interface ServerInfo {
    name: string
}
