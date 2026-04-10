import * as vscode from 'vscode';
import { ConfigLoader } from '../../../core/configLoader';
import { KeyManager } from '../../../core/keyManager';
import { Orchestrator } from '../../../core/orchestrator';
import { WebviewToHostMessage } from '../../../types/messages';
import { loadComposeData, composeWithKeyRotation } from '../../../features/compose/composeSlice';

export interface ComposeHandlerDeps {
    getOrchestrator: () => Orchestrator;
    getConfigLoader: () => ConfigLoader;
    keyManager?: KeyManager;
}

export function createComposeHandlers(deps: ComposeHandlerDeps) {
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

    const compose = async (message: WebviewToHostMessage, webview: vscode.Webview) => {
        await composeWithKeyRotation(
            {
                orchestrator: deps.getOrchestrator(),
                configLoader: deps.getConfigLoader(),
                keyManager: deps.keyManager,
            },
            message.providerConfig as any,
            webview
        );
    };

    return {
        loadData: async (message: WebviewToHostMessage, webview: vscode.Webview) => loadChanges(webview),
        refresh: async (message: WebviewToHostMessage, webview: vscode.Webview) => loadChanges(webview),
        compose: async (message: WebviewToHostMessage, webview: vscode.Webview) => compose(message, webview),
        triggerCompose: async (message: WebviewToHostMessage, webview: vscode.Webview) => compose(message, webview),
        retryCompose: async (message: WebviewToHostMessage, webview: vscode.Webview) => compose(message, webview),
    };
}