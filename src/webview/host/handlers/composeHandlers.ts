import * as vscode from 'vscode';
import { ComposeProviderConfig } from '../../../core/orchestrator';
import { WebviewToHostMessage } from '../../../types/messages';
import { ComposeSliceDeps, loadComposeData, composeWithKeyRotation } from '../../../features/compose/composeSlice';
import { WebviewCommandRegistry } from './types';

export interface ComposeHandlerDeps extends ComposeSliceDeps {
    openComposerPanel: (providerConfig?: ComposeProviderConfig, autoCompose?: boolean) => Promise<void>;
}

export function createComposeHandlers(deps: ComposeHandlerDeps): WebviewCommandRegistry {
    const loadChanges = async (webview: vscode.Webview) => {
        await loadComposeData(deps, webview);
    };

    const compose = async (providerConfig: ComposeProviderConfig | undefined, webview: vscode.Webview) => {
        await composeWithKeyRotation(deps, providerConfig, webview);
    };

    const resolveProviderConfig = (message: WebviewToHostMessage) => message.providerConfig as ComposeProviderConfig | undefined;

    return {
        loadData: async (_message, webview) => loadChanges(webview),
        triggerCompose: async (message, webview) => compose(resolveProviderConfig(message), webview),
        compose: async (message, webview) => compose(resolveProviderConfig(message), webview),
        retryCompose: async (message, webview) => compose(resolveProviderConfig(message), webview),
    };
}
