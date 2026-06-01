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
    openWorkspace: () => Promise<void>;
    refreshVisibleViews: () => Promise<void>;
    ensureWorkspacePath?: () => Promise<string | undefined>;
}

type CommandHandler = (message: WebviewToHostMessage, webview: vscode.Webview) => Promise<void>;

export interface WebviewCommandRegistrySet {
    compose: WebviewCommandRegistry;
    commit: WebviewCommandRegistry;
    providerHealth: WebviewCommandRegistry;
    workspace: WebviewCommandRegistry;
    gitActions: WebviewCommandRegistry;
}

export interface WebviewCommandRouterOptions {
    registries?: Partial<WebviewCommandRegistrySet>;
}

export function createWebviewCommandRouter(deps: WebviewCommandRouterDeps, options: WebviewCommandRouterOptions = {}) {
    let defaultRegistries: WebviewCommandRegistrySet | null = null;
    const getDefaults = () => defaultRegistries || (defaultRegistries = createDefaultRegistries(deps));
    const hasExplicitRegistries = Boolean(options.registries);
    const composeHandlers = options.registries?.compose || (hasExplicitRegistries ? {} : getDefaults().compose);
    const commitHandlers = options.registries?.commit || (hasExplicitRegistries ? {} : getDefaults().commit);
    const providerHealthHandlers = options.registries?.providerHealth || (hasExplicitRegistries ? {} : getDefaults().providerHealth);
    const workspaceHandlers = options.registries?.workspace || (hasExplicitRegistries ? {} : getDefaults().workspace);
    const gitActionHandlers = options.registries?.gitActions || (hasExplicitRegistries ? {} : getDefaults().gitActions);

    const handlers: Partial<Record<WebviewToHostCommand, CommandHandler>> = {
        ...composeHandlers,
        ...commitHandlers,
        ...providerHealthHandlers,
        ...workspaceHandlers,
        ...gitActionHandlers,
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
    const { createGitActionHandlers } = require('./handlers/gitActionHandlers');

    return {
        compose: createComposeHandlers({
            getOrchestrator: () => deps.getOrchestrator(),
            getConfigLoader: () => deps.getConfigLoader(),
            keyManager: deps.keyManager,
            openComposerPanel: deps.openComposerPanel,
        }),
        commit: createCommitHandlers({
            getCommitExecutor: () => deps.getCommitExecutor(),
            getConfigLoader: () => deps.getConfigLoader(),
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
            openWorkspace: deps.openWorkspace,
            ensureWorkspacePath: deps.ensureWorkspacePath || (async () => undefined),
        }),
        gitActions: createGitActionHandlers({
            getGitService: () => deps.getOrchestrator().getGitService(),
            refreshVisibleViews: deps.refreshVisibleViews,
        }),
    };
}
