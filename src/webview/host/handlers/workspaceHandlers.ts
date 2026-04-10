import { ComposeProviderConfig, Orchestrator } from '../../../core/orchestrator';
import { WebviewToHostMessage } from '../../../types/messages';
import { Logger } from '../../../utils/logger';

export interface WorkspaceHandlerDeps {
    openComposerPanel: (providerConfig?: ComposeProviderConfig, autoCompose?: boolean) => Promise<void>;
    refreshVisibleViews: () => Promise<void>;
}

export function createWorkspaceHandlers(deps: WorkspaceHandlerDeps) {
    return {
        openComposerPanel: async (message: WebviewToHostMessage) => deps.openComposerPanel(
            message.providerConfig as ComposeProviderConfig,
            typeof message.autoCompose === 'boolean' ? message.autoCompose : true
        ),
        copySanitizedLogs: async () => Logger.copySanitizedLogs(),
        openKeyInput: async (message: WebviewToHostMessage) => {
            Logger.info('WorkspaceHandlers: openKeyInput received', {
                provider: String(message.provider || ''),
                model: String(message.model || ''),
            });
        },
    };
}