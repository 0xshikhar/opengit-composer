export type WebviewToHostCommand =
    | 'loadData'
    | 'loadKeys'
    | 'saveKey'
    | 'removeKey'
    | 'resetKeys'
    | 'openComposerPanel'
    | 'copySanitizedLogs'
    | 'testProviderConnection'
    | 'triggerCompose'
    | 'compose'
    | 'retryCompose'
    | 'testConnection'
    | 'commitSingle'
    | 'commitAll'
    | 'refresh'
    | 'loadOllamaModels'
    | 'saveProviderPreference'
    | 'openWorkspace'
    | 'openKeyInput'
    | 'generate'
    | 'commit';

export type HostToWebviewCommand =
    | 'dataLoaded'
    | 'composing'
    | 'composed'
    | 'triggerCompose'
    | 'commitSuccess'
    | 'commitProgress'
    | 'commitAllDone'
    | 'keysLoaded'
    | 'keySaved'
    | 'keyRemoved'
    | 'keysReset'
    | 'ollamaModelsLoaded'
    | 'providerPreferenceSaved'
    | 'error'
    | 'connectionTested'
    | 'privacyPreviewLoaded'
    | 'diagnostics';

export type ComposerErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export type ComposerErrorCode =
    | 'PRECHECK_MISSING_API_KEY'
    | 'PRECHECK_LOCAL_PROVIDER_UNREACHABLE'
    | 'PRECHECK_OLLAMA_UNREACHABLE'
    | 'PRECHECK_MODEL_UNAVAILABLE'
    | 'NO_GIT_REPOSITORY'
    | 'AUTH_ERROR'
    | 'RATE_LIMIT'
    | 'NETWORK_ERROR'
    | 'DNS_ERROR'
    | 'CONNECTION_REFUSED'
    | 'TLS_ERROR'
    | 'ONLY_EXCLUDED_FILES'
    | 'STAGED_SNAPSHOT_STALE'
    | 'NO_STAGED_CHANGES'
    | 'COMPOSE_ERROR'
    | 'UNKNOWN_ERROR';

export interface ComposerErrorAction {
    label: string;
    command: Extract<WebviewToHostCommand, 'refresh' | 'compose' | 'retryCompose' | 'copySanitizedLogs' | 'testConnection' | 'openWorkspace'>;
}

export interface ComposerErrorPayload {
    code: ComposerErrorCode;
    severity: ComposerErrorSeverity;
    recoverable: boolean;
    message: string;
    action?: ComposerErrorAction;
    diagnostics?: ComposerDiagnostics;
}

export interface ComposerDiagnostics {
    provider: string;
    code: ComposerErrorCode;
    message: string;
    status?: number;
    requestId?: string;
    model?: string;
    details?: string;
    hint?: string;
}

export interface WebviewToHostMessage {
    command: WebviewToHostCommand;
    [key: string]: unknown;
}

export interface HostToWebviewMessage {
    command: HostToWebviewCommand;
    [key: string]: unknown;
}

const WEBVIEW_COMMANDS = new Set<WebviewToHostCommand>([
    'loadData',
    'loadKeys',
    'saveKey',
    'removeKey',
    'resetKeys',
    'openComposerPanel',
    'copySanitizedLogs',
    'testProviderConnection',
    'triggerCompose',
    'compose',
    'retryCompose',
    'testConnection',
    'commitSingle',
    'commitAll',
    'refresh',
    'loadOllamaModels',
    'saveProviderPreference',
    'openWorkspace',
    'openKeyInput',
    'generate',
    'commit',
]);

const HOST_COMMANDS = new Set<HostToWebviewCommand>([
    'dataLoaded',
    'composing',
    'composed',
    'triggerCompose',
    'commitSuccess',
    'commitProgress',
    'commitAllDone',
    'keysLoaded',
    'keySaved',
    'keyRemoved',
    'keysReset',
    'ollamaModelsLoaded',
    'providerPreferenceSaved',
    'error',
    'connectionTested',
    'privacyPreviewLoaded',
    'diagnostics',
]);

export function isWebviewToHostMessage(message: unknown): message is WebviewToHostMessage {
    if (!message || typeof message !== 'object') return false;
    const candidate = message as { command?: unknown };
    return typeof candidate.command === 'string' && WEBVIEW_COMMANDS.has(candidate.command as WebviewToHostCommand);
}

export function isHostToWebviewMessage(message: unknown): message is HostToWebviewMessage {
    if (!message || typeof message !== 'object') return false;
    const candidate = message as { command?: unknown };
    return typeof candidate.command === 'string' && HOST_COMMANDS.has(candidate.command as HostToWebviewCommand);
}
