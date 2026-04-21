import * as vscode from 'vscode';
import { ComposeProviderConfig } from '../../../core/orchestrator';
import { WebviewToHostMessage } from '../../../types/messages';
import { ComposeSliceDeps, loadComposeData, composeWithKeyRotation } from '../../../features/compose/composeSlice';
import { WebviewCommandRegistry } from './types';

export interface ComposeHandlerDeps {
    getOrchestrator: () => ComposeSliceDeps['orchestrator'];
    getConfigLoader: () => ComposeSliceDeps['configLoader'];
    keyManager?: ComposeSliceDeps['keyManager'];
    openComposerPanel: (providerConfig?: ComposeProviderConfig, autoCompose?: boolean) => Promise<void>;
}

export function createComposeHandlers(deps: ComposeHandlerDeps): WebviewCommandRegistry {
    const loadChanges = async (webview: vscode.Webview) => {
        await loadComposeData({
            orchestrator: deps.getOrchestrator(),
            configLoader: deps.getConfigLoader(),
            keyManager: deps.keyManager,
        }, webview);
    };

    const compose = async (providerConfig: ComposeProviderConfig | undefined, webview: vscode.Webview) => {
        await composeWithKeyRotation({
            orchestrator: deps.getOrchestrator(),
            configLoader: deps.getConfigLoader(),
            keyManager: deps.keyManager,
        }, providerConfig, webview);
    };

    const resolveProviderConfig = (message: WebviewToHostMessage) => message.providerConfig as ComposeProviderConfig | undefined;

    return {
        loadData: async (_message, webview) => loadChanges(webview),
        triggerCompose: async (message, webview) => compose(resolveProviderConfig(message), webview),
        compose: async (message, webview) => compose(resolveProviderConfig(message), webview),
        retryCompose: async (message, webview) => compose(resolveProviderConfig(message), webview),
    };
}
