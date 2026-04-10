import * as vscode from 'vscode';
import { CommitExecutor } from '../../../core/commitExecutor';
import { ConfigLoader } from '../../../core/configLoader';
import { Orchestrator, ComposeSnapshot } from '../../../core/orchestrator';
import { DraftCommit } from '../../../types/commits';
import { WebviewToHostMessage } from '../../../types/messages';
import { commitAll as commitAllSlice, commitSingle as commitSingleSlice } from '../../../features/commit/commitSlice';

export interface CommitHandlerDeps {
    getCommitExecutor: () => CommitExecutor;
    getConfigLoader: () => ConfigLoader;
    getCurrentStagedChanges: () => ReturnType<Orchestrator['getStagedChanges']>;
    refreshVisibleViews: () => Promise<void>;
}

export function createCommitHandlers(deps: CommitHandlerDeps) {
    const commitDeps = {
        commitExecutor: deps.getCommitExecutor(),
        configLoader: deps.getConfigLoader(),
        getCurrentStagedChanges: deps.getCurrentStagedChanges,
        refreshVisibleViews: deps.refreshVisibleViews,
    };

    return {
        commitSingle: async (message: WebviewToHostMessage, webview: vscode.Webview) => commitSingleSlice(
            commitDeps,
            message.draft as DraftCommit,
            message.snapshot as ComposeSnapshot | undefined,
            webview
        ),
        commitAll: async (message: WebviewToHostMessage, webview: vscode.Webview) => commitAllSlice(
            commitDeps,
            message.drafts as DraftCommit[],
            message.snapshot as ComposeSnapshot | undefined,
            webview
        ),
    };
}