import * as vscode from 'vscode';
import simpleGit from 'simple-git';
import { GitService } from '../core/git/gitService';
import {
    Orchestrator,
    ComposeProviderConfig,
} from '../core/orchestrator';
import { CommitExecutor } from '../core/commitExecutor';
import { ConfigLoader } from '../core/configLoader';
import { KeyManager } from '../core/keyManager';
import { Logger } from '../utils/logger';
import {
    isWebviewToHostMessage,
    WebviewToHostMessage,
} from '../types/messages';
import { loadComposeData } from '../features/compose/composeSlice';
import { postError } from '../features/support/errorMapper';
import { createWebviewCommandRouter } from './host/webviewCommandRouter';
import { resolveProviderHostAndModel } from '../utils/constant';
import { AIProviderFactory } from '../ai/aiProviderFactory';

type WebviewSource = 'sidebar' | 'panel';

interface WebviewBootstrapPayload {
    mode: WebviewSource;
    autoCompose?: boolean;
    providerConfig?: ComposeProviderConfig;
    logoUri?: string;
}

export class CommitComposerProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'commitComposer.sidebarView';

    private _view?: vscode.WebviewView;
    private _panel?: vscode.WebviewPanel;
    private _extensionUri: vscode.Uri;
    private _orchestrator?: Orchestrator;
    private _commitExecutor?: CommitExecutor;
    private _workspacePath?: string;
    private _configLoader?: ConfigLoader;
    private _keyManager?: KeyManager;
    private _messageRouter?: ReturnType<typeof createWebviewCommandRouter>;

    constructor(extensionUri: vscode.Uri, keyManager?: KeyManager) {
        this._extensionUri = extensionUri;
        this._keyManager = keyManager;
        Logger.info('CommitComposerProvider: Initialized');
    }

    public setKeyManager(keyManager: KeyManager) {
        this._keyManager = keyManager;
    }

    public async openComposerPanel(providerConfig?: ComposeProviderConfig, autoCompose: boolean = true): Promise<void> {
        const resolvedProviderConfig = providerConfig || this.getDefaultProviderConfig();
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;

        if (this._panel) {
            this._panel.reveal(column);
            if (autoCompose) {
                const workspacePath = await this.ensureWorkspacePath(true);
                if (!workspacePath) {
                    await postError(
                        this._panel.webview,
                        Object.assign(new Error('Select a folder containing a git repository to continue.'), {
                            code: 'NO_GIT_REPOSITORY',
                        }),
                        this.getConfigLoader()
                    );
                    return;
                }
                await this._panel.webview.postMessage({
                    command: 'triggerCompose',
                    providerConfig: resolvedProviderConfig,
                });
            }
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            'commitComposer.composePanel',
            'OpenGit Composer',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this._extensionUri, 'dist'),
                    vscode.Uri.joinPath(this._extensionUri, 'media'),
                ],
            }
        );

        this._panel.onDidDispose(() => {
            this._panel = undefined;
        });

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, {
            mode: 'panel',
            autoCompose,
            providerConfig: resolvedProviderConfig,
        });
        this._setWebviewMessageListener(this._panel.webview, 'panel');

        if (!autoCompose) {
            await this.loadChanges(this._panel.webview);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        Logger.info('CommitComposerProvider: resolveWebviewView called');

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'media'),
            ],
        };

        this._view = webviewView;
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, {
            mode: 'sidebar',
            autoCompose: false,
        });
        this._setWebviewMessageListener(webviewView.webview, 'sidebar');

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                void this.loadChanges(webviewView.webview);
            }
        });

        if (webviewView.visible) {
            void this.loadChanges(webviewView.webview);
        }
    }

    private getOrchestrator(): Orchestrator {
        if (!this._orchestrator) {
            this._orchestrator = new Orchestrator(new GitService(this._workspacePath));
        }
        return this._orchestrator;
    }

    private getCommitExecutor(): CommitExecutor {
        if (!this._commitExecutor) {
            this._commitExecutor = new CommitExecutor(new GitService(this._workspacePath));
        }
        return this._commitExecutor;
    }

    private getConfigLoader(): ConfigLoader {
        if (!this._configLoader) {
            this._configLoader = new ConfigLoader();
        }
        return this._configLoader;
    }

    private getDefaultProviderConfig(): ComposeProviderConfig {
        const config = this.getConfigLoader().getConfig();
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

    private getMessageRouter() {
        if (!this._messageRouter) {
            this._messageRouter = createWebviewCommandRouter({
                getOrchestrator: () => this.getOrchestrator(),
                getConfigLoader: () => this.getConfigLoader(),
                getCommitExecutor: () => this.getCommitExecutor(),
                keyManager: this._keyManager,
                openComposerPanel: (providerConfig, autoCompose) => this.openComposerPanel(providerConfig, autoCompose),
                openWorkspace: () => this.openWorkspace(),
                refreshVisibleViews: () => this.refreshAllVisibleViews(),
                ensureWorkspacePath: () => this.ensureWorkspacePath(true),
            });
        }
        return this._messageRouter;
    }

    private async ensureWorkspacePath(promptIfMissing: boolean, forcePrompt: boolean = false): Promise<string | undefined> {
        if (this._workspacePath && !forcePrompt) {
            return this._workspacePath;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const gitCandidates: string[] = [];

        for (const folder of workspaceFolders) {
            try {
                const git = simpleGit(folder.uri.fsPath);
                if (await git.checkIsRepo()) {
                    gitCandidates.push(folder.uri.fsPath);
                }
            } catch {
                // Ignore folders that are not git repositories.
            }
        }

        if (gitCandidates.length === 1) {
            this._workspacePath = gitCandidates[0];
            return this._workspacePath;
        }

        if (gitCandidates.length > 1) {
            const selected = await vscode.window.showQuickPick(
                gitCandidates.map((workspacePath) => ({
                    label: vscode.workspace.asRelativePath(workspacePath, false) || workspacePath,
                    description: workspacePath,
                    workspacePath,
                })),
                {
                    placeHolder: 'Select the git repository to use with OpenGit Composer',
                    ignoreFocusOut: true,
                }
            );

            if (selected?.workspacePath) {
                this._workspacePath = selected.workspacePath;
                return this._workspacePath;
            }
        }

        if (!promptIfMissing) {
            return undefined;
        }

        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Git Repository',
            title: 'Select a folder containing a git repository',
        });

        const selectedPath = picked?.[0]?.fsPath;
        if (!selectedPath) {
            return undefined;
        }

        try {
            if (!(await simpleGit(selectedPath).checkIsRepo())) {
                await vscode.window.showErrorMessage('The selected folder is not a git repository. Choose a folder that contains a .git directory.');
                return this.ensureWorkspacePath(true);
            }
        } catch {
            await vscode.window.showErrorMessage('The selected folder is not a git repository. Choose a folder that contains a .git directory.');
            return this.ensureWorkspacePath(true);
        }

        this._workspacePath = selectedPath;
        return this._workspacePath;
    }

    private resetWorkspaceBindings(): void {
        this._orchestrator = undefined;
        this._commitExecutor = undefined;
        this._messageRouter = undefined;
    }

    private async openWorkspace(): Promise<void> {
        const previousPath = this._workspacePath;
        this._workspacePath = undefined;

        const selectedPath = await this.ensureWorkspacePath(true, true);
        if (!selectedPath) {
            this._workspacePath = previousPath;
            return;
        }

        this.resetWorkspaceBindings();
        await this.refreshAllVisibleViews();
    }

    private _setWebviewMessageListener(webview: vscode.Webview, source: WebviewSource) {
        webview.onDidReceiveMessage(async (message: WebviewToHostMessage | unknown) => {
            if (!isWebviewToHostMessage(message)) {
                Logger.warn('CommitComposerProvider: Ignoring unknown webview message', {
                    source,
                    hasPayload: message !== null && typeof message === 'object',
                    messageType: message && typeof message === 'object'
                        ? String((message as { command?: unknown }).command || 'unknown')
                        : typeof message,
                });
                return;
            }
            Logger.debug('CommitComposerProvider: Message received', { source, command: message.command });

            try {
                await this.getMessageRouter()(message, webview);
            } catch (error) {
                Logger.error('CommitComposerProvider: Message handler failed', error);
                await postError(webview, error, this.getConfigLoader());
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview, bootstrap: WebviewBootstrapPayload): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );
        const logoUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
        );
        const nonce = getNonce();
        const cspSource = webview.cspSource;
        const bootstrapJson = JSON.stringify({
            ...bootstrap,
            logoUri: logoUri.toString(),
        }).replace(/</g, '\\u003c');

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource} data:; img-src ${cspSource} data: https:;">
                <title>OpenGit Composer</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        background-color: var(--vscode-sideBar-background, #1e1e1e);
                        color: var(--vscode-foreground, #cccccc);
                        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
                    }
                    .gc-loading {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        gap: 12px;
                    }
                    .gc-loading-spinner {
                        width: 22px;
                        height: 22px;
                        border: 2px solid #3a3d41;
                        border-top-color: #007acc;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    .gc-error {
                        padding: 16px;
                        color: #f85149;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div id="root">
                    <div class="gc-loading">
                        <div class="gc-loading-spinner"></div>
                        <span>Loading OpenGit Composer...</span>
                    </div>
                </div>
                <script nonce="${nonce}">
                    window.__OPENGIT_BOOTSTRAP__ = ${bootstrapJson};
                    window.onerror = function(msg, url, line) {
                        var root = document.getElementById('root');
                        if (root) {
                            root.innerHTML = '<div class="gc-error">Error loading: ' + String(msg || 'Unknown error') + '<br>Line: ' + String(line || 'unknown') + '</div>';
                        }
                    };
                </script>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async loadChanges(webview: vscode.Webview): Promise<void> {
        try {
            const workspacePath = await this.ensureWorkspacePath(true);
            if (!workspacePath) {
                throw Object.assign(new Error('Select a folder containing a git repository to continue.'), {
                    code: 'NO_GIT_REPOSITORY',
                });
            }

            await loadComposeData(
                {
                    orchestrator: this.getOrchestrator(),
                    configLoader: this.getConfigLoader(),
                    keyManager: this._keyManager,
                },
                webview
            );
        } catch (error) {
            Logger.error('CommitComposerProvider: Failed to load changes', error);
            await postError(webview, error, this.getConfigLoader());
        }
    }

    private async refreshAllVisibleViews(): Promise<void> {
        const targets: vscode.Webview[] = [];
        if (this._view) targets.push(this._view.webview);
        if (this._panel) targets.push(this._panel.webview);

        for (const target of targets) {
            try {
                await this.loadChanges(target);
            } catch (error) {
                Logger.error('CommitComposerProvider: Failed to refresh target webview', error);
            }
        }
    }
}

function getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
