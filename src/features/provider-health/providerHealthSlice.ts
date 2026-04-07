import * as vscode from 'vscode';
import { AIProviderFactory } from '../../ai/aiProviderFactory';
import { OllamaProvider } from '../../ai/providers/ollama';
import { ConfigLoader } from '../../core/configLoader';
import { KeyManager } from '../../core/keyManager';
import { ComposeProviderConfig } from '../../core/orchestrator';

export interface ProviderHealthSliceDeps {
    keyManager?: KeyManager;
    configLoader: ConfigLoader;
}

export async function loadKeys(
    deps: ProviderHealthSliceDeps,
    provider: string,
    webview: vscode.Webview
): Promise<void> {
    if (!deps.keyManager) {
        await webview.postMessage({
            command: 'keysLoaded',
            provider,
            keys: [],
            error: 'Key manager not initialized',
        });
        return;
    }

    const keys = await deps.keyManager.getKeysForDisplay(provider);
    await webview.postMessage({ command: 'keysLoaded', provider, keys });
}

export async function saveKey(
    deps: ProviderHealthSliceDeps,
    provider: string,
    key: string,
    label: string | undefined,
    webview: vscode.Webview
): Promise<void> {
    if (!deps.keyManager) {
        await webview.postMessage({
            command: 'keySaved',
            provider,
            success: false,
            error: 'Key manager not initialized',
        });
        return;
    }

    await deps.keyManager.addKey(provider, key, label);
    const keys = await deps.keyManager.getKeysForDisplay(provider);
    await webview.postMessage({ command: 'keySaved', provider, success: true, keys });
}

export async function removeKey(
    deps: ProviderHealthSliceDeps,
    provider: string,
    keyIndex: number,
    webview: vscode.Webview
): Promise<void> {
    if (!deps.keyManager) {
        await webview.postMessage({
            command: 'keyRemoved',
            provider,
            success: false,
            error: 'Key manager not initialized',
        });
        return;
    }

    await deps.keyManager.removeKey(provider, keyIndex);
    const keys = await deps.keyManager.getKeysForDisplay(provider);
    await webview.postMessage({ command: 'keyRemoved', provider, success: true, keys });
}

export async function resetKeys(
    deps: ProviderHealthSliceDeps,
    provider: string,
    webview: vscode.Webview
): Promise<void> {
    if (!deps.keyManager) {
        await webview.postMessage({
            command: 'keysReset',
            provider,
            success: false,
            error: 'Key manager not initialized',
        });
        return;
    }

    await deps.keyManager.resetProvider(provider);
    await webview.postMessage({ command: 'keysReset', provider, success: true, keys: [] });
}

export async function loadOllamaModels(baseUrl: string, webview: vscode.Webview): Promise<void> {
    try {
        const ollamaProvider = new OllamaProvider({ apiKey: '', model: '', baseUrl });
        const models = await ollamaProvider.getAvailableModels();
        await webview.postMessage({ command: 'ollamaModelsLoaded', models });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await webview.postMessage({ command: 'ollamaModelsLoaded', models: [], error: message });
    }
}

export async function testProviderConnection(
    deps: ProviderHealthSliceDeps,
    providerConfig: ComposeProviderConfig | undefined,
    webview: vscode.Webview
): Promise<void> {
    const resolvedConfig = providerConfig || getDefaultProviderConfig(deps.configLoader);
    const apiKey = await resolveApiKeyForProvider(deps, resolvedConfig.provider, resolvedConfig.apiKey);
    const provider = AIProviderFactory.create(resolvedConfig.provider, {
        apiKey,
        model: resolvedConfig.model || '',
        baseUrl: resolvedConfig.baseUrl,
    });

    const authOk = await provider.validateApiKey();
    const modelCheck = await provider.validateModelAvailability();

    await webview.postMessage({
        command: 'connectionTested',
        result: {
            provider: resolvedConfig.provider,
            available: authOk,
            modelAvailable: modelCheck.available,
            message: authOk
                ? (modelCheck.available
                    ? 'Connection and model check passed.'
                    : modelCheck.reason || 'Connection passed, but model availability is uncertain.')
                : 'Provider connection failed.',
            models: modelCheck.models,
        },
    });
}

export async function saveProviderPreference(
    deps: ProviderHealthSliceDeps,
    provider: string,
    model: string,
    baseUrl: string,
    webview: vscode.Webview
): Promise<void> {
    try {
        void deps;

        const vscodeApi = require('vscode');
        const vsConfig = vscodeApi.workspace.getConfiguration('commitComposer');

        await vsConfig.update('aiProvider', provider, true);
        await vsConfig.update('model', model, true);

        if (provider === 'ollama' && baseUrl) {
            await vsConfig.update('ollamaHost', baseUrl, true);
        }

        await webview.postMessage({
            command: 'providerPreferenceSaved',
            success: true,
            provider,
            model,
            baseUrl,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await webview.postMessage({
            command: 'providerPreferenceSaved',
            success: false,
            error: message,
        });
    }
}

function getDefaultProviderConfig(configLoader: ConfigLoader): ComposeProviderConfig {
    const config = configLoader.getConfig();
    return {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl || (config.provider === 'ollama' ? config.ollamaHost : undefined),
    };
}

async function resolveApiKeyForProvider(
    deps: ProviderHealthSliceDeps,
    provider: string,
    preferredKey?: string
): Promise<string> {
    const trimmed = (preferredKey || '').trim();
    if (trimmed) {
        return trimmed;
    }

    if (!deps.keyManager) {
        return trimmed;
    }

    const currentKey = await deps.keyManager.getCurrentKey(provider);
    if (currentKey) {
        return currentKey;
    }

    const keys = await deps.keyManager.getKeys(provider);
    return keys[0]?.key || '';
}
