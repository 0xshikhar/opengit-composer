import * as vscode from 'vscode';
import { ConfigLoader } from '../../../core/configLoader';
import { KeyManager } from '../../../core/keyManager';
import { ComposeProviderConfig } from '../../../core/orchestrator';
import { WebviewToHostMessage } from '../../../types/messages';
import {
    loadKeys,
    loadLocalModels,
    removeKey,
    resetKeys,
    saveKey,
    saveProviderPreference,
    testProviderConnection,
} from '../../../features/provider-health/providerHealthSlice';

export interface ProviderHealthHandlerDeps {
    keyManager?: KeyManager;
    getConfigLoader: () => ConfigLoader;
}

export function createProviderHealthHandlers(deps: ProviderHealthHandlerDeps) {
    return {
        loadKeys: async (message: WebviewToHostMessage, webview: vscode.Webview) => loadKeys(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            webview
        ),
        saveKey: async (message: WebviewToHostMessage, webview: vscode.Webview) => saveKey(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            String(message.key || ''),
            typeof message.label === 'string' ? message.label : undefined,
            webview
        ),
        removeKey: async (message: WebviewToHostMessage, webview: vscode.Webview) => removeKey(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            Number(message.keyIndex ?? -1),
            webview
        ),
        resetKeys: async (message: WebviewToHostMessage, webview: vscode.Webview) => resetKeys(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            webview
        ),
        loadOllamaModels: async (message: WebviewToHostMessage, webview: vscode.Webview) => loadLocalModels(
            String(message.provider || 'ollama'),
            String(message.baseUrl || (String(message.provider || '') === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434')),
            webview
        ),
        saveProviderPreference: async (message: WebviewToHostMessage, webview: vscode.Webview) => saveProviderPreference(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            String(message.model || ''),
            String(message.baseUrl || ''),
            webview
        ),
        testConnection: async (message: WebviewToHostMessage, webview: vscode.Webview) => testProviderConnection(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            message.providerConfig as ComposeProviderConfig | undefined,
            webview
        ),
        testProviderConnection: async (message: WebviewToHostMessage, webview: vscode.Webview) => testProviderConnection(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            message.providerConfig as ComposeProviderConfig | undefined,
            webview
        ),
    };
}
