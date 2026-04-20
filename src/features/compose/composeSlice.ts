import * as vscode from 'vscode';
import { AIProviderFactory } from '../../ai/aiProviderFactory';
import { ConfigLoader, ComposerConfig } from '../../core/configLoader';
import { KeyManager } from '../../core/keyManager';
import { Orchestrator, ComposeProviderConfig } from '../../core/orchestrator';
import { Logger } from '../../utils/logger';
import { buildPrivacyPreview } from '../privacy/privacyService';
import { isLocalProvider, resolveProviderHostAndModel } from '../../utils/constant';

interface ComposeMessageError extends Error {
    code?: string;
}

export interface ComposeSliceDeps {
    orchestrator: Orchestrator;
    configLoader: ConfigLoader;
    keyManager?: KeyManager;
}

export interface LoadComposeDataOptions {
    resetSession?: boolean;
}

export async function loadComposeData(
    deps: ComposeSliceDeps,
    webview: vscode.Webview,
    options: LoadComposeDataOptions = {}
): Promise<void> {
    const staged = await deps.orchestrator.getStagedChanges();
    const unstaged = await deps.orchestrator.getUnstagedChanges();
    const config = deps.configLoader.getConfig();
    const resolvedProviderConfig = resolveProviderHostAndModel(
        config,
        AIProviderFactory.getDefaultModel(config.provider)
    );
    const providerConfig = {
        provider: config.provider,
        model: resolvedProviderConfig.model,
        baseUrl: resolvedProviderConfig.baseUrl,
    };
    const privacy = buildPrivacyPreview(staged, config.excludePatterns, config.redactPatterns);

    await webview.postMessage({
        command: 'dataLoaded',
        data: {
            staged,
            unstaged,
            providerConfig,
            privacyPreview: privacy.preview,
            resetSession: options.resetSession ?? false,
        },
    });
}

export async function composeWithKeyRotation(
    deps: ComposeSliceDeps,
    providerConfig: ComposeProviderConfig | undefined,
    webview: vscode.Webview
): Promise<void> {
    const resolvedConfig: ComposeProviderConfig = providerConfig || getDefaultProviderConfig(deps.configLoader);
    const attemptCompose = async (candidateConfig: ComposeProviderConfig) => {
        await runComposePreflight(deps, candidateConfig);
        await compose(deps, candidateConfig, webview);
    };
    let explicitAttemptError: unknown;

    if (isLocalProvider(resolvedConfig.provider) || !deps.keyManager) {
        await attemptCompose(resolvedConfig);
        return;
    }

    if (resolvedConfig.apiKey) {
        const hasStoredKey = await deps.keyManager.hasKey(resolvedConfig.provider);
        if (!hasStoredKey) {
            await deps.keyManager.addKey(resolvedConfig.provider, resolvedConfig.apiKey, 'Default');
        }

        try {
            await attemptCompose(resolvedConfig);
            return;
        } catch (error) {
            explicitAttemptError = error;
            Logger.warn('ComposeSlice: Compose failed with explicit key, falling back to rotated stored keys', {
                provider: resolvedConfig.provider,
                message: error instanceof Error ? error.message : String(error),
            });
            // Continue to rotated keys below.
        }
    }

    const availableKeys = await deps.keyManager.getKeys(resolvedConfig.provider);
    const rotatedKeys = resolvedConfig.apiKey
        ? availableKeys.filter(key => key.key !== resolvedConfig.apiKey)
        : availableKeys;
    if (rotatedKeys.length === 0) {
        if (resolvedConfig.apiKey) {
            throw explicitAttemptError instanceof Error
                ? explicitAttemptError
                : new Error('All configured API keys failed for compose request.');
        }
        await attemptCompose(resolvedConfig);
        return;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= rotatedKeys.length; attempt++) {
        const rotatedKey = await deps.keyManager.getNextKey(resolvedConfig.provider);
        if (!rotatedKey) break;

        // Add delay between retries to prevent rapid successive failures
        if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        try {
            await attemptCompose({ ...resolvedConfig, apiKey: rotatedKey });
            return;
        } catch (error) {
            lastError = error;
            Logger.warn('ComposeSlice: Compose attempt failed, rotating to next key', {
                provider: resolvedConfig.provider,
                attempt,
                totalAttempts: rotatedKeys.length,
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
    const providerModel = (providerConfig.model || '').trim();
    const configuredModel = resolveProviderHostAndModel(
        config,
        AIProviderFactory.getDefaultModel(provider)
    ).model.trim();
    const model = providerModel || configuredModel;

    if (!isLocalProvider(provider)) {
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
        model,
        baseUrl: providerConfig.baseUrl || resolveProviderHostAndModel(config, AIProviderFactory.getDefaultModel(provider)).baseUrl,
    });

    const reachable = await providerInstance.validateApiKey();
    if (!reachable) {
        const error = new Error(
            isLocalProvider(provider)
                ? `Unable to reach ${provider === 'lmstudio' ? 'LM Studio' : 'Ollama'} at ${providerConfig.baseUrl || config.baseUrl || (provider === 'lmstudio' ? config.lmStudioHost : config.ollamaHost)}. Check the host and whether the local server is running.`
                : `Unable to validate credentials for provider "${provider}". Check your API key and network access.`
        ) as ComposeMessageError;
        error.code = isLocalProvider(provider) ? 'PRECHECK_LOCAL_PROVIDER_UNREACHABLE' : 'AUTH_ERROR';
        throw error;
    }

    const modelCheck = await providerInstance.validateModelAvailability();
    if (!modelCheck.available) {
        const availableModels = modelCheck.models?.length
            ? ` Available models: ${modelCheck.models.slice(0, 5).join(', ')}${modelCheck.models.length > 5 ? '...' : ''}.`
            : '';
        const error = new Error(
            (modelCheck.reason || `Model "${model}" is not available for provider "${provider}".`) + availableModels
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
