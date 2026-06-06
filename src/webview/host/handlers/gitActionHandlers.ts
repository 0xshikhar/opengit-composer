import type * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../../../core/git/gitService';
import { GitContentProvider } from '../../../core/git/gitContentProvider';
import { WebviewToHostMessage } from '../../../types/messages';
import { WebviewCommandRegistry } from './types';
import { Logger } from '../../../utils/logger';

function getVscode(): typeof import('vscode') | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('vscode');
    } catch {
        return undefined;
    }
}

export interface GitActionHandlerDeps {
    getGitService: () => GitService;
    refreshVisibleViews: () => Promise<void>;
}

export function createGitActionHandlers(deps: GitActionHandlerDeps): WebviewCommandRegistry {
    const resolveWorkspacePath = (gitService: GitService): string => {
        try {
            return gitService.getWorkspacePath();
        } catch {
            const vs = getVscode();
            return vs?.workspace?.workspaceFolders?.[0]?.uri.fsPath || '';
        }
    };

    return {
        openDiff: async (message: WebviewToHostMessage) => {
            const relPath = typeof message.path === 'string' ? message.path : '';
            if (!relPath) return;

            const vs = getVscode();
            if (!vs) return;

            const isStaged = Boolean(message.staged);
            const gitService = deps.getGitService();
            const workspacePath = resolveWorkspacePath(gitService);
            const fullPath = path.resolve(workspacePath, relPath);
            const fileName = path.basename(relPath);

            try {
                if (isStaged) {
                    const leftUri = GitContentProvider.toUri(relPath, 'HEAD');
                    const rightUri = GitContentProvider.toUri(relPath, 'index');
                    const title = `${fileName} (Index ↔ HEAD)`;
                    await vs.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
                        preview: true,
                    });
                } else {
                    const leftUri = GitContentProvider.toUri(relPath, 'index');
                    const rightUri = vs.Uri.file(fullPath);
                    const title = `${fileName} (Working Tree)`;
                    await vs.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
                        preview: true,
                    });
                }
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to open diff', error);
                try {
                    await vs.commands.executeCommand('vscode.open', vs.Uri.file(fullPath));
                } catch (fallbackErr) {
                    Logger.error('GitActionHandlers: Fallback file open failed', fallbackErr);
                }
            }
        },

        openFile: async (message: WebviewToHostMessage) => {
            const relPath = typeof message.path === 'string' ? message.path : '';
            if (!relPath) return;

            const vs = getVscode();
            if (!vs) return;

            const gitService = deps.getGitService();
            const workspacePath = resolveWorkspacePath(gitService);
            const fullPath = path.resolve(workspacePath, relPath);

            try {
                await vs.commands.executeCommand('vscode.open', vs.Uri.file(fullPath));
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to open file', error);
            }
        },

        stageFiles: async (message: WebviewToHostMessage) => {
            const paths: string[] = Array.isArray(message.paths)
                ? (message.paths as unknown[]).filter((p): p is string => typeof p === 'string' && Boolean(p))
                : typeof message.path === 'string' && message.path
                ? [message.path]
                : [];

            if (paths.length === 0) return;

            try {
                const gitService = deps.getGitService();
                await gitService.stageFiles(paths);
                await deps.refreshVisibleViews();
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to stage files', error);
                const vs = getVscode();
                vs?.window?.showErrorMessage(`Failed to stage files: ${error instanceof Error ? error.message : String(error)}`);
            }
        },

        unstageFiles: async (message: WebviewToHostMessage) => {
            const paths: string[] = Array.isArray(message.paths)
                ? (message.paths as unknown[]).filter((p): p is string => typeof p === 'string' && Boolean(p))
                : typeof message.path === 'string' && message.path
                ? [message.path]
                : [];

            if (paths.length === 0) return;

            try {
                const gitService = deps.getGitService();
                await gitService.unstageFiles(paths);
                await deps.refreshVisibleViews();
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to unstage files', error);
                const vs = getVscode();
                vs?.window?.showErrorMessage(`Failed to unstage files: ${error instanceof Error ? error.message : String(error)}`);
            }
        },

        stageAll: async () => {
            try {
                const gitService = deps.getGitService();
                await gitService.stageFiles(['.']);
                await deps.refreshVisibleViews();
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to stage all files', error);
                const vs = getVscode();
                vs?.window?.showErrorMessage(`Failed to stage changes: ${error instanceof Error ? error.message : String(error)}`);
            }
        },

        unstageAll: async () => {
            try {
                const gitService = deps.getGitService();
                await gitService.unstageAll();
                await deps.refreshVisibleViews();
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to unstage all files', error);
                const vs = getVscode();
                vs?.window?.showErrorMessage(`Failed to unstage changes: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
    };
}
