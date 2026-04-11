import * as vscode from 'vscode';
import { Logger } from '../../../utils/logger';
import { ComposeProviderConfig, Orchestrator } from '../../../core/orchestrator';
import { loadComposeData } from '../../../features/compose/composeSlice';
import { WebviewCommandRegistry } from './types';
import { ConfigLoader } from '../../../core/configLoader';
import { KeyManager } from '../../../core/keyManager';

export interface WorkspaceHandlerDeps {
    getOrchestrator: () => Orchestrator;
    getConfigLoader: () => ConfigLoader;
    keyManager?: KeyManager;
    openComposerPanel: (providerConfig?: ComposeProviderConfig, autoCompose?: boolean) => Promise<void>;
}

export function createWorkspaceHandlers(deps: WorkspaceHandlerDeps): WebviewCommandRegistry {
    const loadChanges = async (webview: vscode.Webview) => {
        await loadComposeData(
            {
                orchestrator: deps.getOrchestrator(),
                configLoader: deps.getConfigLoader(),
                keyManager: deps.keyManager,
            },
            webview
        );
    };

    return {
        openComposerPanel: async (message) => deps.openComposerPanel(
            message.providerConfig as ComposeProviderConfig,
            typeof message.autoCompose === 'boolean' ? message.autoCompose : true
        ),
        copySanitizedLogs: async () => Logger.copySanitizedLogs(),
        refresh: async (_message, webview) => loadChanges(webview),
        openKeyInput: async (message) => {
            Logger.info('WorkspaceHandlers: openKeyInput received', {
                provider: String(message.provider || ''),
                model: String(message.model || ''),
            });
        },
        loadData: async (_message, webview) => loadChanges(webview),
    };
}
