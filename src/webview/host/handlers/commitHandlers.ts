import * as vscode from 'vscode';
import { ComposeSnapshot } from '../../../core/orchestrator';
import { DraftCommit } from '../../../types/commits';
import { CommitSliceDeps, commitAll, commitSingle } from '../../../features/commit/commitSlice';
import { WebviewToHostMessage } from '../../../types/messages';
import { WebviewCommandRegistry } from './types';
import { Logger } from '../../../utils/logger';

export interface CommitHandlerDeps extends CommitSliceDeps {}

export function createCommitHandlers(deps: CommitHandlerDeps): WebviewCommandRegistry {
    const resolveSnapshot = (message: WebviewToHostMessage) => message.snapshot as ComposeSnapshot | undefined;
    const isDraftCommit = (value: unknown): value is DraftCommit => {
        if (!value || typeof value !== 'object') return false;
        const draft = value as Record<string, unknown>;
        return typeof draft.id === 'string'
            && typeof draft.message === 'string'
            && Array.isArray(draft.files)
            && typeof draft.state === 'string'
            && typeof draft.confidence === 'number';
    };
    const isDraftCommitArray = (value: unknown): value is DraftCommit[] =>
        Array.isArray(value) && value.every(isDraftCommit);

    return {
        commitSingle: async (message, webview) => {
            if (!isDraftCommit(message.draft)) {
                Logger.warn('CommitHandlers: Rejecting malformed commitSingle payload', {
                    hasDraft: message.draft !== undefined,
                    draftType: typeof message.draft,
                });
                await webview.postMessage({
                    command: 'error',
                    error: {
                        code: 'COMPOSE_ERROR',
                        severity: 'error',
                        recoverable: false,
                        message: 'Invalid draft payload received for commitSingle.',
                    },
                });
                return;
            }

            return commitSingle(
                deps,
                message.draft,
                resolveSnapshot(message),
                webview
            );
        },
        commitAll: async (message, webview) => {
            if (!isDraftCommitArray(message.drafts)) {
                Logger.warn('CommitHandlers: Rejecting malformed commitAll payload', {
                    hasDrafts: Array.isArray(message.drafts),
                    draftCount: Array.isArray(message.drafts) ? message.drafts.length : 0,
                });
                await webview.postMessage({
                    command: 'error',
                    error: {
                        code: 'COMPOSE_ERROR',
                        severity: 'error',
                        recoverable: false,
                        message: 'Invalid drafts payload received for commitAll.',
                    },
                });
                return;
            }

            return commitAll(
                deps,
                message.drafts,
                resolveSnapshot(message),
                webview
            );
        },
    };
}
