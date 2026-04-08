import * as vscode from 'vscode';
import { CommitExecutor } from '../../core/commitExecutor';
import { ConfigLoader } from '../../core/configLoader';
import { KeyManager } from '../../core/keyManager';
import { Orchestrator, ComposeProviderConfig, ComposeSnapshot } from '../../core/orchestrator';
import { DraftCommit } from '../../types/commits';
import { Logger } from '../../utils/logger';
import { WebviewToHostMessage, WebviewToHostCommand } from '../../types/messages';
import { loadComposeData, composeWithKeyRotation } from '../../features/compose/composeSlice';
import {
    loadKeys,
    loadOllamaModels,
    removeKey,
    resetKeys,
    saveKey,
    saveProviderPreference,
    testProviderConnection,
} from '../../features/provider-health/providerHealthSlice';
import { commitAll as commitAllSlice, commitSingle as commitSingleSlice } from '../../features/commit/commitSlice';

export interface WebviewCommandRouterDeps {
    getOrchestrator: () => Orchestrator;
    getConfigLoader: () => ConfigLoader;
    getCommitExecutor: () => CommitExecutor;
    keyManager?: KeyManager;
    openComposerPanel: (providerConfig?: ComposeProviderConfig, autoCompose?: boolean) => Promise<void>;
    refreshVisibleViews: () => Promise<void>;
}

type CommandHandler = (message: WebviewToHostMessage, webview: vscode.Webview) => Promise<void>;

export function createWebviewCommandRouter(deps: WebviewCommandRouterDeps) {
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

    const compose = async (providerConfig: ComposeProviderConfig | undefined, webview: vscode.Webview) => {
        await composeWithKeyRotation(
            {
                orchestrator: deps.getOrchestrator(),
                configLoader: deps.getConfigLoader(),
                keyManager: deps.keyManager,
            },
            providerConfig,
            webview
        );
    };

    const commitDeps = {
        commitExecutor: deps.getCommitExecutor(),
        configLoader: deps.getConfigLoader(),
        getCurrentStagedChanges: () => deps.getOrchestrator().getStagedChanges(),
        refreshVisibleViews: deps.refreshVisibleViews,
    };

    const handlers: Partial<Record<WebviewToHostCommand, CommandHandler>> = {
        loadData: async (_message, webview) => loadChanges(webview),
        loadKeys: async (message, webview) => loadKeys(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            webview
        ),
        saveKey: async (message, webview) => saveKey(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            String(message.key || ''),
            typeof message.label === 'string' ? message.label : undefined,
            webview
        ),
        removeKey: async (message, webview) => removeKey(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            Number(message.keyIndex ?? -1),
            webview
        ),
        resetKeys: async (message, webview) => resetKeys(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            webview
        ),
        openComposerPanel: async (message) => deps.openComposerPanel(
            message.providerConfig as ComposeProviderConfig,
            typeof message.autoCompose === 'boolean' ? message.autoCompose : true
        ),
        copySanitizedLogs: async () => Logger.copySanitizedLogs(),
        testProviderConnection: async (message, webview) => testProviderConnection(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            message.providerConfig as ComposeProviderConfig | undefined,
            webview
        ),
        triggerCompose: async (message, webview) => compose(message.providerConfig as ComposeProviderConfig | undefined, webview),
        compose: async (message, webview) => compose(message.providerConfig as ComposeProviderConfig | undefined, webview),
        retryCompose: async (message, webview) => compose(message.providerConfig as ComposeProviderConfig | undefined, webview),
        testConnection: async (message, webview) => testProviderConnection(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            message.providerConfig as ComposeProviderConfig | undefined,
            webview
        ),
        commitSingle: async (message, webview) => commitSingleSlice(
            commitDeps,
            message.draft as DraftCommit,
            message.snapshot as ComposeSnapshot | undefined,
            webview
        ),
        commitAll: async (message, webview) => commitAllSlice(
            commitDeps,
            message.drafts as DraftCommit[],
            message.snapshot as ComposeSnapshot | undefined,
            webview
        ),
        refresh: async (_message, webview) => loadChanges(webview),
        loadOllamaModels: async (message, webview) => loadOllamaModels(
            String(message.baseUrl || 'http://localhost:11434'),
            webview
        ),
        saveProviderPreference: async (message, webview) => saveProviderPreference(
            {
                keyManager: deps.keyManager,
                configLoader: deps.getConfigLoader(),
            },
            String(message.provider || ''),
            String(message.model || ''),
            String(message.baseUrl || ''),
            webview
        ),
        openKeyInput: async (message) => {
            Logger.info('WebviewCommandRouter: openKeyInput received', {
                provider: String(message.provider || ''),
                model: String(message.model || ''),
            });
        },
    };

    return async (message: WebviewToHostMessage, webview: vscode.Webview): Promise<void> => {
        const handler = handlers[message.command];
        if (!handler) {
            Logger.warn('WebviewCommandRouter: Unknown message command', { command: message.command });
            return;
        }
        await handler(message, webview);
    };
}
