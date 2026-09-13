import axios from 'axios';
import * as vscode from 'vscode';
import { AIProviderFactory } from '../../ai/aiProviderFactory';
import { LMStudioProvider } from '../../ai/providers/lmstudio';
import { OllamaProvider } from '../../ai/providers/ollama';
import { ConfigLoader } from '../../core/configLoader';
import { KeyManager } from '../../core/keyManager';
import { ComposeProviderConfig } from '../../core/orchestrator';
import { isLocalProvider, resolveProviderHostAndModel } from '../../utils/constant';
import { Logger } from '../../utils/logger';

export interface ProviderHealthSliceDeps {
    keyManager?: KeyManager;
    configLoader: ConfigLoader;
    refreshVisibleViews?: () => Promise<void>;
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

export async function loadLocalModels(provider: string, baseUrl: string, webview: vscode.Webview): Promise<void> {
    try {
        const localProvider = provider === 'lmstudio'
            ? new LMStudioProvider({ apiKey: '', model: '', baseUrl })
            : new OllamaProvider({ apiKey: '', model: '', baseUrl });
        const reachable = await localProvider.validateApiKey();
        if (!reachable) {
            throw new Error(`Unable to reach ${provider === 'lmstudio' ? 'LM Studio' : 'Ollama'} at ${baseUrl}. Check the host and whether the local server is running.`);
        }
        const models = await localProvider.getAvailableModels();
        await webview.postMessage({ command: 'ollamaModelsLoaded', models });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await webview.postMessage({ command: 'ollamaModelsLoaded', models: [], error: message });
    }
}

export async function loadOllamaModels(baseUrl: string, webview: vscode.Webview): Promise<void> {
    await loadLocalModels('ollama', baseUrl, webview);
}

export async function testProviderConnection(
    deps: ProviderHealthSliceDeps,
    providerConfig: ComposeProviderConfig | undefined,
    webview: vscode.Webview
): Promise<void> {
    const resolvedConfig = providerConfig || getDefaultProviderConfig(deps.configLoader);
    const model = resolvedConfig.model || '';
    const apiKey = await resolveApiKeyForProvider(deps, resolvedConfig.provider, resolvedConfig.apiKey);
    const provider = AIProviderFactory.create(resolvedConfig.provider, {
        apiKey,
        model,
        baseUrl: resolvedConfig.baseUrl,
    });

    const authOk = await provider.validateApiKey();
    if (!authOk) {
        await webview.postMessage({
            command: 'connectionTested',
            result: {
                provider: resolvedConfig.provider,
                available: false,
                modelAvailable: false,
                message: 'Provider connection failed.',
                models: [],
            },
        });
        return;
    }

    const modelCheck = await provider.validateModelAvailability();

    await webview.postMessage({
        command: 'connectionTested',
        result: {
            provider: resolvedConfig.provider,
            available: authOk,
            modelAvailable: modelCheck.available,
            message: modelCheck.available
                ? 'Connection and model check passed.'
                : modelCheck.reason || 'Connection passed, but model availability is uncertain.',
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
        const vscodeApi = require('vscode');
        const vsConfig = vscodeApi.workspace.getConfiguration('commitComposer');
        const resolvedModel = model;

        await vsConfig.update('aiProvider', provider, true);
        await vsConfig.update('model', resolvedModel, true);

        if (baseUrl && (provider === 'ollama' || provider === 'lmstudio')) {
            await vsConfig.update(provider === 'lmstudio' ? 'lmStudioHost' : 'ollamaHost', baseUrl, true);
        }

        // Reload the cached config so all subsequent reads immediately reflect the new provider & model
        deps.configLoader.load();

        if (deps.refreshVisibleViews) {
            await deps.refreshVisibleViews();
        }

        await webview.postMessage({
            command: 'providerPreferenceSaved',
            success: true,
            provider,
            model: resolvedModel,
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

export async function saveLocalEndpoints(
    deps: ProviderHealthSliceDeps,
    endpoints: any[],
    webview: vscode.Webview
): Promise<void> {
    try {
        const vscodeApi = require('vscode');
        const vsConfig = vscodeApi.workspace.getConfiguration('commitComposer');
        await vsConfig.update('customLocalEndpoints', endpoints, true);
        deps.configLoader.load();
        if (deps.refreshVisibleViews) {
            await deps.refreshVisibleViews();
        }
        await webview.postMessage({
            command: 'localEndpointsLoaded',
            endpoints,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error('Failed to save local endpoints', error);
        await webview.postMessage({
            command: 'localEndpointsLoaded',
            endpoints: [],
            error: message,
        });
    }
}

export async function loadLocalEndpoints(
    deps: ProviderHealthSliceDeps,
    webview: vscode.Webview
): Promise<void> {
    try {
        void deps;
        const vscodeApi = require('vscode');
        const vsConfig = vscodeApi.workspace.getConfiguration('commitComposer');
        const endpoints = (vsConfig.get('customLocalEndpoints') as any[] | undefined) || [];
        await webview.postMessage({
            command: 'localEndpointsLoaded',
            endpoints,
        });
    } catch {
        await webview.postMessage({
            command: 'localEndpointsLoaded',
            endpoints: [],
        });
    }
}

function getDefaultProviderConfig(configLoader: ConfigLoader): ComposeProviderConfig {
    const config = configLoader.getConfig();
    const resolved = resolveProviderHostAndModel(
        config,
        AIProviderFactory.getDefaultModel(config.provider)
    );
    return {
        provider: config.provider,
        model: resolved.model,
        baseUrl: resolved.baseUrl,
    };
}

async function resolveApiKeyForProvider(
    deps: ProviderHealthSliceDeps,
    provider: string,
    preferredKey?: string
): Promise<string> {
    if (isLocalProvider(provider)) {
        return '';
    }

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
