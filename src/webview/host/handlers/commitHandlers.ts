import * as vscode from 'vscode';
import { ComposeSnapshot } from '../../../core/orchestrator';
import { DraftCommit } from '../../../types/commits';
import { CommitSliceDeps, commitAll, commitSingle } from '../../../features/commit/commitSlice';
import { WebviewToHostMessage } from '../../../types/messages';
import { WebviewCommandRegistry } from './types';

export interface CommitHandlerDeps extends CommitSliceDeps {}

export function createCommitHandlers(deps: CommitHandlerDeps): WebviewCommandRegistry {
    const resolveSnapshot = (message: WebviewToHostMessage) => message.snapshot as ComposeSnapshot | undefined;

    return {
        commitSingle: async (message, webview) => commitSingle(
            deps,
            message.draft as DraftCommit,
            resolveSnapshot(message),
            webview
        ),
        commitAll: async (message, webview) => commitAll(
            deps,
            message.drafts as DraftCommit[],
            resolveSnapshot(message),
            webview
        ),
    };
}
