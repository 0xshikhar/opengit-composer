import * as vscode from 'vscode';
import { CommitExecutor } from '../../core/commitExecutor';
import { ConfigLoader } from '../../core/configLoader';
import { KeyManager } from '../../core/keyManager';
import { Orchestrator, ComposeProviderConfig } from '../../core/orchestrator';
import { Logger } from '../../utils/logger';
import { WebviewToHostMessage, WebviewToHostCommand } from '../../types/messages';
import { WebviewCommandRegistry } from './handlers/types';

export interface WebviewCommandRouterDeps {
    getOrchestrator: () => Orchestrator;
    getConfigLoader: () => ConfigLoader;
    getCommitExecutor: () => CommitExecutor;
    keyManager?: KeyManager;
    openComposerPanel: (providerConfig?: ComposeProviderConfig, autoCompose?: boolean) => Promise<void>;
    refreshVisibleViews: () => Promise<void>;
}

type CommandHandler = (message: WebviewToHostMessage, webview: vscode.Webview) => Promise<void>;

export interface WebviewCommandRegistrySet {
    compose: WebviewCommandRegistry;
    commit: WebviewCommandRegistry;
    providerHealth: WebviewCommandRegistry;
    workspace: WebviewCommandRegistry;
}

export interface WebviewCommandRouterOptions {
    registries?: Partial<WebviewCommandRegistrySet>;
}

export function createWebviewCommandRouter(deps: WebviewCommandRouterDeps, options: WebviewCommandRouterOptions = {}) {
    let defaultRegistries: WebviewCommandRegistrySet | null = null;
    const getDefaults = () => defaultRegistries || (defaultRegistries = createDefaultRegistries(deps));
    const composeHandlers = options.registries?.compose || getDefaults().compose;
    const commitHandlers = options.registries?.commit || getDefaults().commit;
    const providerHealthHandlers = options.registries?.providerHealth || getDefaults().providerHealth;
    const workspaceHandlers = options.registries?.workspace || getDefaults().workspace;

    const handlers: Partial<Record<WebviewToHostCommand, CommandHandler>> = {
        ...composeHandlers,
        ...commitHandlers,
        ...providerHealthHandlers,
        ...workspaceHandlers,
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

function createDefaultRegistries(deps: WebviewCommandRouterDeps): WebviewCommandRegistrySet {
    const { createComposeHandlers } = require('./handlers/composeHandlers');
    const { createCommitHandlers } = require('./handlers/commitHandlers');
    const { createProviderHealthHandlers } = require('./handlers/providerHealthHandlers');
    const { createWorkspaceHandlers } = require('./handlers/workspaceHandlers');

    return {
        compose: createComposeHandlers({
            orchestrator: deps.getOrchestrator(),
            configLoader: deps.getConfigLoader(),
            keyManager: deps.keyManager,
            openComposerPanel: deps.openComposerPanel,
        }),
        commit: createCommitHandlers({
            commitExecutor: deps.getCommitExecutor(),
            configLoader: deps.getConfigLoader(),
            getCurrentStagedChanges: () => deps.getOrchestrator().getStagedChanges(),
            refreshVisibleViews: deps.refreshVisibleViews,
        }),
        providerHealth: createProviderHealthHandlers({
            keyManager: deps.keyManager,
            configLoader: deps.getConfigLoader(),
        }),
        workspace: createWorkspaceHandlers({
            getOrchestrator: () => deps.getOrchestrator(),
            getConfigLoader: () => deps.getConfigLoader(),
            keyManager: deps.keyManager,
            openComposerPanel: deps.openComposerPanel,
        }),
    };
}
