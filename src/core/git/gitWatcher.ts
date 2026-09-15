import type * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

function getVscode(): typeof import('vscode') | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('vscode');
    } catch {
        return undefined;
    }
}

/**
 * GitWatcher maintains real-time synchronization with workspace files and Git state.
 *
 * Inspired by GitLens and VS Code's native Source Control architecture:
 * 1. Subscribes to VS Code's built-in Git extension (`vscode.git` API) to catch
 *    staging, unstaging, commits, rebases, branch switches, and merges.
 * 2. Watches `.git/index` and `.git/HEAD` via file system watchers for CLI Git operations.
 * 3. Listens to document save and file create/delete/rename events to detect working tree changes.
 * 4. Debounces refresh triggers (default 250ms) to prevent thrashing during rapid edits or batch git operations.
 */
export class GitWatcher implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private debounceTimer?: NodeJS.Timeout;
    private readonly debounceMs: number;

    constructor(
        private readonly onTrigger: () => void,
        debounceMs: number = 250
    ) {
        this.debounceMs = debounceMs;
        this.init();
    }

    private trigger(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            try {
                this.onTrigger();
            } catch (error) {
                Logger.error('GitWatcher: Error executing onTrigger callback', error);
            }
        }, this.debounceMs);
    }

    private init(): void {
        const vs = getVscode();
        if (!vs) {
            return;
        }

        // 1. Workspace document & file lifecycle events
        this.disposables.push(
            vs.workspace.onDidSaveTextDocument((doc) => {
                // Ignore output or git-internal scheme documents
                if (doc.uri.scheme === 'file') {
                    this.trigger();
                }
            }),
            vs.workspace.onDidCreateFiles(() => this.trigger()),
            vs.workspace.onDidDeleteFiles(() => this.trigger()),
            vs.workspace.onDidRenameFiles(() => this.trigger())
        );

        // 2. Watch .git/index and .git/HEAD for external Git CLI changes
        try {
            const indexWatcher = vs.workspace.createFileSystemWatcher('**/.git/index');
            indexWatcher.onDidChange(() => this.trigger());
            indexWatcher.onDidCreate(() => this.trigger());
            indexWatcher.onDidDelete(() => this.trigger());

            const headWatcher = vs.workspace.createFileSystemWatcher('**/.git/HEAD');
            headWatcher.onDidChange(() => this.trigger());
            headWatcher.onDidCreate(() => this.trigger());

            this.disposables.push(indexWatcher, headWatcher);
        } catch (error) {
            Logger.warn('GitWatcher: Unable to create .git filesystem watchers', error);
        }

        // 3. Hook into native VS Code Git extension (vscode.git API)
        this.hookVsCodeGit(vs);
    }

    private hookVsCodeGit(vs: typeof import('vscode')): void {
        try {
            const gitExtension = vs.extensions.getExtension<any>('vscode.git');
            if (!gitExtension) {
                return;
            }

            const attachApi = (api: any) => {
                if (!api) return;

                const attachRepo = (repo: any) => {
                    if (repo?.state?.onDidChange) {
                        const sub = repo.state.onDidChange(() => this.trigger());
                        this.disposables.push(sub);
                    }
                };

                for (const repo of api.repositories || []) {
                    attachRepo(repo);
                }

                if (api.onDidOpenRepository) {
                    this.disposables.push(
                        api.onDidOpenRepository((repo: any) => {
                            attachRepo(repo);
                            this.trigger();
                        })
                    );
                }
            };

            if (gitExtension.isActive) {
                attachApi(gitExtension.exports?.getAPI?.(1));
            } else {
                gitExtension.activate().then(
                    (ext: any) => attachApi(ext?.getAPI?.(1)),
                    (err: unknown) => Logger.warn('GitWatcher: Failed to activate vscode.git extension', err)
                );
            }
        } catch (error) {
            Logger.warn('GitWatcher: Error hooking vscode.git API', error);
        }
    }

    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        for (const d of this.disposables) {
            try {
                d.dispose();
            } catch {
                // Ignore disposal errors
            }
        }
        this.disposables.length = 0;
    }
}
