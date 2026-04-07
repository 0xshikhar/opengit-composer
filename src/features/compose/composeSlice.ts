import * as vscode from 'vscode';
import { AIProviderFactory } from '../../ai/aiProviderFactory';
import { ConfigLoader, ComposerConfig } from '../../core/configLoader';
import { KeyManager } from '../../core/keyManager';
import { Orchestrator, ComposeProviderConfig } from '../../core/orchestrator';
import { Logger } from '../../utils/logger';
import { buildPrivacyPreview } from '../privacy/privacyService';

interface ComposeMessageError extends Error {
    code?: string;
}

export interface ComposeSliceDeps {
    orchestrator: Orchestrator;
    configLoader: ConfigLoader;
    keyManager?: KeyManager;
}

export async function loadComposeData(
    deps: ComposeSliceDeps,
    webview: vscode.Webview
): Promise<void> {
    const staged = await deps.orchestrator.getStagedChanges();
    const unstaged = await deps.orchestrator.getUnstagedChanges();
    const config = deps.configLoader.getConfig();
    const providerConfig = {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl || (config.provider === 'ollama' ? config.ollamaHost : undefined),
    };
    const privacy = buildPrivacyPreview(staged, config.excludePatterns, config.redactPatterns);

    await webview.postMessage({
        command: 'dataLoaded',
        data: {
            staged,
            unstaged,
            providerConfig,
            privacyPreview: privacy.preview,
        },
    });
}

export async function composeWithKeyRotation(
    deps: ComposeSliceDeps,
    providerConfig: ComposeProviderConfig | undefined,
    webview: vscode.Webview
): Promise<void> {
    const resolvedConfig: ComposeProviderConfig = providerConfig || getDefaultProviderConfig(deps.configLoader);
    await runComposePreflight(deps, resolvedConfig);

    if (resolvedConfig.provider === 'ollama' || !deps.keyManager) {
        await compose(deps, resolvedConfig, webview);
        return;
    }

    if (resolvedConfig.apiKey) {
        const hasStoredKey = await deps.keyManager.hasKey(resolvedConfig.provider);
        if (!hasStoredKey) {
            await deps.keyManager.addKey(resolvedConfig.provider, resolvedConfig.apiKey, 'Default');
        }

        try {
            await compose(deps, resolvedConfig, webview);
            return;
        } catch (error) {
            Logger.warn('ComposeSlice: Compose failed with explicit key, falling back to rotated stored keys', {
                provider: resolvedConfig.provider,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const availableKeys = await deps.keyManager.getKeys(resolvedConfig.provider);
    if (availableKeys.length === 0) {
        await compose(deps, resolvedConfig, webview);
        return;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= availableKeys.length; attempt++) {
        const rotatedKey = await deps.keyManager.getNextKey(resolvedConfig.provider);
        if (!rotatedKey) break;

        try {
            await compose(deps, { ...resolvedConfig, apiKey: rotatedKey }, webview);
            return;
        } catch (error) {
            lastError = error;
            Logger.warn('ComposeSlice: Compose attempt failed, rotating to next key', {
                provider: resolvedConfig.provider,
                attempt,
                totalAttempts: availableKeys.length,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error('All configured API keys failed for compose request.');
}

export async function compose(
    deps: ComposeSliceDeps,
    providerConfig: ComposeProviderConfig,
    webview: vscode.Webview
): Promise<void> {
    await webview.postMessage({ command: 'composing' });
    const result = await deps.orchestrator.compose(providerConfig);

    await webview.postMessage({
        command: 'composed',
        drafts: result.drafts,
        reasoning: result.reasoning,
        summary: result.summary,
        snapshot: result.snapshot,
        meta: result.meta,
    });
}

export async function runComposePreflight(
    deps: ComposeSliceDeps,
    providerConfig: ComposeProviderConfig
): Promise<void> {
    const provider = providerConfig.provider || deps.configLoader.getConfig().provider;
    const config = deps.configLoader.getConfig();
    const explicitApiKey = (providerConfig.apiKey || '').trim();
    const configuredApiKey = (config.apiKey || '').trim();

    if (provider !== 'ollama') {
        let storedKeys = 0;
        if (deps.keyManager) {
            storedKeys = await deps.keyManager.getKeyCount(provider);
        }
        if (!explicitApiKey && !configuredApiKey && storedKeys === 0) {
            const error = new Error(
                `Missing API key for provider "${provider}". Add one in AI Controls before composing.`
            ) as ComposeMessageError;
            error.code = 'PRECHECK_MISSING_API_KEY';
            throw error;
        }
    }

    const resolvedApiKey = await resolveApiKeyForProvider(deps, provider, explicitApiKey || configuredApiKey);
    const providerInstance = AIProviderFactory.create(provider, {
        apiKey: resolvedApiKey,
        model: providerConfig.model || config.model || '',
        baseUrl: providerConfig.baseUrl || config.baseUrl || (provider === 'ollama' ? config.ollamaHost : undefined),
    });

    const reachable = await providerInstance.validateApiKey();
    if (!reachable) {
        const error = new Error(
            provider === 'ollama'
                ? `Unable to reach Ollama at ${providerConfig.baseUrl || config.baseUrl || config.ollamaHost}. Check the host and whether Ollama is running.`
                : `Unable to validate credentials for provider "${provider}". Check your API key and network access.`
        ) as ComposeMessageError;
        error.code = provider === 'ollama' ? 'PRECHECK_OLLAMA_UNREACHABLE' : 'AUTH_ERROR';
        throw error;
    }

    const modelCheck = await providerInstance.validateModelAvailability();
    if (!modelCheck.available) {
        const error = new Error(
            modelCheck.reason || `Model "${providerConfig.model || config.model}" is not available for provider "${provider}".`
        ) as ComposeMessageError;
        error.code = 'PRECHECK_MODEL_UNAVAILABLE';
        throw error;
    }
}

export async function resolveApiKeyForProvider(
    deps: ComposeSliceDeps,
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

export function getDefaultProviderConfig(configLoader: ConfigLoader): ComposeProviderConfig {
    const config = configLoader.getConfig();
    return {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl || (config.provider === 'ollama' ? config.ollamaHost : undefined),
    };
}
