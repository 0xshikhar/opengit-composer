import type * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../../../core/git/gitService';
import { GitContentProvider } from '../../../core/git/gitContentProvider';
import { WebviewToHostMessage } from '../../../types/messages';
import { WebviewCommandRegistry } from './types';
import { Logger } from '../../../utils/logger';
import { AIProviderFactory } from '../../../ai/aiProviderFactory';
import { ConfigLoader } from '../../../core/configLoader';
import { KeyManager } from '../../../core/keyManager';
import { Orchestrator } from '../../../core/orchestrator';

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
    getOrchestrator?: () => Orchestrator;
    getConfigLoader?: () => ConfigLoader;
    keyManager?: KeyManager;
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

        discardFiles: async (message: WebviewToHostMessage) => {
            const paths: string[] = Array.isArray(message.paths)
                ? (message.paths as unknown[]).filter((p): p is string => typeof p === 'string' && Boolean(p))
                : typeof message.path === 'string' && message.path
                ? [message.path]
                : [];

            if (paths.length === 0) return;

            const vs = getVscode();
            const label = paths.length === 1 ? `"${paths[0]}"` : `${paths.length} files`;
            const confirmation = vs
                ? await vs.window.showWarningMessage(
                    `Are you sure you want to discard changes in ${label}? This cannot be undone.`,
                    { modal: true },
                    'Discard Changes'
                )
                : 'Discard Changes';

            if (confirmation !== 'Discard Changes') return;

            try {
                const gitService = deps.getGitService();
                await gitService.discardFiles(paths);
                await deps.refreshVisibleViews();
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to discard files', error);
                vs?.window?.showErrorMessage(`Failed to discard changes: ${error instanceof Error ? error.message : String(error)}`);
            }
        },

        discardAll: async () => {
            const vs = getVscode();
            const confirmation = vs
                ? await vs.window.showWarningMessage(
                    'Are you sure you want to discard ALL working changes? This cannot be undone.',
                    { modal: true },
                    'Discard All Changes'
                )
                : 'Discard All Changes';

            if (confirmation !== 'Discard All Changes') return;

            try {
                const gitService = deps.getGitService();
                await gitService.discardAll();
                await deps.refreshVisibleViews();
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to discard all files', error);
                vs?.window?.showErrorMessage(`Failed to discard changes: ${error instanceof Error ? error.message : String(error)}`);
            }
        },

        commitDirect: async (message: WebviewToHostMessage, webview: vscode.Webview) => {
            const commitMessage = typeof message.message === 'string' ? message.message.trim() : '';
            if (!commitMessage) return;

            try {
                const gitService = deps.getGitService();
                const staged = await gitService.getStagedChanges();

                // If no files are staged, ask user if they want to stage all and commit
                if (staged.length === 0) {
                    const vs = getVscode();
                    const action = vs
                        ? await vs.window.showInformationMessage(
                            'There are no staged changes to commit. Would you like to stage all your changes and commit them?',
                            { modal: true },
                            'Stage All and Commit'
                        )
                        : 'Stage All and Commit';
                    if (action !== 'Stage All and Commit') {
                        return;
                    }
                    await gitService.stageFiles(['.']);
                }

                await gitService.createCommit(commitMessage);
                await deps.refreshVisibleViews();
                await webview.postMessage({ command: 'commitAllDone' });

                const vs = getVscode();
                vs?.window.showInformationMessage(`Committed: ${commitMessage.split('\n')[0]}`);
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to commit directly', error);
                const vs = getVscode();
                vs?.window?.showErrorMessage(`Commit failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        },

        generateQuickCommit: async (_message: WebviewToHostMessage, webview: vscode.Webview) => {
            try {
                await webview.postMessage({ command: 'quickCommitGenerating', isGenerating: true });

                const gitService = deps.getGitService();
                const staged = await gitService.getStagedChanges();
                const changes = staged.length > 0 ? staged : await gitService.getUnstagedChanges();

                if (changes.length === 0) {
                    const vs = getVscode();
                    vs?.window.showInformationMessage('No changes detected to generate a commit message for.');
                    await webview.postMessage({ command: 'quickCommitGenerating', isGenerating: false });
                    return;
                }

                const configLoader = deps.getConfigLoader?.();
                const config = configLoader?.getConfig();
                const providerName = config?.provider || 'openai';
                const apiKey = (await deps.keyManager?.getCurrentKey(providerName)) || config?.apiKey || '';

                const provider = AIProviderFactory.create(providerName, {
                    apiKey,
                    model: config?.model || '',
                    baseUrl: providerName === 'lmstudio' ? config?.lmStudioHost : config?.ollamaHost,
                });

                const generated = await provider.generateCommitMessage(changes, {
                    commitFormat: config?.commitFormat || 'conventional',
                    maxSubjectLength: config?.maxSubjectLength || 72,
                });

                await webview.postMessage({
                    command: 'quickCommitMessageGenerated',
                    message: generated.trim(),
                });
            } catch (error) {
                Logger.error('GitActionHandlers: Failed to generate quick commit message', error);
                const vs = getVscode();
                vs?.window?.showErrorMessage(`Failed to generate commit message: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                await webview.postMessage({ command: 'quickCommitGenerating', isGenerating: false });
            }
        },
    };
}
