import { ComposeProviderConfig } from '../../../core/orchestrator';
import {
    loadKeys,
    loadOllamaModels,
    removeKey,
    resetKeys,
    saveKey,
    saveProviderPreference,
    testProviderConnection,
} from '../../../features/provider-health/providerHealthSlice';
import { WebviewToHostMessage } from '../../../types/messages';
import { WebviewCommandRegistry } from './types';
import { ProviderHealthSliceDeps } from '../../../features/provider-health/providerHealthSlice';

export interface ProviderHealthHandlerDeps extends ProviderHealthSliceDeps {}

export function createProviderHealthHandlers(deps: ProviderHealthHandlerDeps): WebviewCommandRegistry {
    const resolveProviderConfig = (message: WebviewToHostMessage) => message.providerConfig as ComposeProviderConfig | undefined;

    return {
        loadKeys: async (message, webview) => loadKeys(
            deps,
            String(message.provider || ''),
            webview
        ),
        saveKey: async (message, webview) => saveKey(
            deps,
            String(message.provider || ''),
            String(message.key || ''),
            typeof message.label === 'string' ? message.label : undefined,
            webview
        ),
        removeKey: async (message, webview) => {
            const parsed = message.keyIndex !== undefined ? parseInt(String(message.keyIndex), 10) : NaN;
            if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
                await webview.postMessage({
                    command: 'keyRemoved',
                    provider: String(message.provider || ''),
                    success: false,
                    error: 'Invalid key index.',
                });
                return;
            }

            return removeKey(
                deps,
                String(message.provider || ''),
                parsed,
                webview
            );
        },
        resetKeys: async (message, webview) => resetKeys(
            deps,
            String(message.provider || ''),
            webview
        ),
        testProviderConnection: async (message, webview) => testProviderConnection(deps, resolveProviderConfig(message), webview),
        testConnection: async (message, webview) => testProviderConnection(deps, resolveProviderConfig(message), webview),
        loadOllamaModels: async (message, webview) => loadOllamaModels(
            String(message.baseUrl || 'http://localhost:11434'),
            webview
        ),
        saveProviderPreference: async (message, webview) => saveProviderPreference(
            deps,
            String(message.provider || ''),
            String(message.model || ''),
            String(message.baseUrl || ''),
            webview
        ),
    };
}
