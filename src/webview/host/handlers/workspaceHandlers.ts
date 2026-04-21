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
    openWorkspace: () => Promise<void>;
    ensureWorkspacePath?: () => Promise<string | undefined>;
}

export function createWorkspaceHandlers(deps: WorkspaceHandlerDeps): WebviewCommandRegistry {
    const loadChanges = async (webview: vscode.Webview, resetSession: boolean = false) => {
        const workspacePath = await (deps.ensureWorkspacePath || (async () => undefined))();
        if (!workspacePath) {
            return;
        }
        await loadComposeData(
            {
                orchestrator: deps.getOrchestrator(),
                configLoader: deps.getConfigLoader(),
                keyManager: deps.keyManager,
            },
            webview,
            { resetSession }
        );
    };

    return {
        openComposerPanel: async (message) => deps.openComposerPanel(
            message.providerConfig as ComposeProviderConfig,
            typeof message.autoCompose === 'boolean' ? message.autoCompose : true
        ),
        openWorkspace: async () => deps.openWorkspace(),
        copySanitizedLogs: async () => Logger.copySanitizedLogs(),
        refresh: async (_message, webview) => loadChanges(webview, true),
        openKeyInput: async (message) => {
            Logger.info('WorkspaceHandlers: openKeyInput received', {
                provider: String(message.provider || ''),
                model: String(message.model || ''),
            });
        },
        loadData: async (_message, webview) => loadChanges(webview),
    };
}
