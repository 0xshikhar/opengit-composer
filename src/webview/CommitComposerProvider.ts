import * as vscode from 'vscode';
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
            this._orchestrator = new Orchestrator(new GitService());
        }
        return this._orchestrator;
    }

    private getCommitExecutor(): CommitExecutor {
        if (!this._commitExecutor) {
            this._commitExecutor = new CommitExecutor(new GitService());
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
        return {
            provider: config.provider,
            model: config.model,
            baseUrl: config.baseUrl || (config.provider === 'ollama' ? config.ollamaHost : undefined),
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
                refreshVisibleViews: () => this.refreshAllVisibleViews(),
            });
        }
        return this._messageRouter;
    }

    private _setWebviewMessageListener(webview: vscode.Webview, source: WebviewSource) {
        webview.onDidReceiveMessage(async (message: WebviewToHostMessage | unknown) => {
            if (!isWebviewToHostMessage(message)) {
                Logger.warn('CommitComposerProvider: Ignoring unknown webview message', { source, message });
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
        await loadComposeData(
            {
                orchestrator: this.getOrchestrator(),
                configLoader: this.getConfigLoader(),
                keyManager: this._keyManager,
            },
            webview
        );
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
