import * as vscode from 'vscode';
import { GitService } from '../core/git/gitService';
import { Orchestrator, ComposeProviderConfig } from '../core/orchestrator';
import { CommitExecutor } from '../core/commitExecutor';
import { ConfigLoader } from '../core/configLoader';
import { KeyManager } from '../core/keyManager';
import { DraftCommit } from '../types/commits';
import { Logger } from '../utils/logger';
import { OllamaProvider } from '../ai/providers/ollama';

type WebviewSource = 'sidebar' | 'panel';

interface WebviewBootstrapPayload {
    mode: WebviewSource;
    autoCompose?: boolean;
    providerConfig?: ComposeProviderConfig;
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

    private _setWebviewMessageListener(webview: vscode.Webview, source: WebviewSource) {
        webview.onDidReceiveMessage(async (message: { command?: string; [key: string]: unknown }) => {
            const command = typeof message.command === 'string' ? message.command : '';
            Logger.debug('CommitComposerProvider: Message received', { source, command });

            try {
                switch (command) {
                    case 'loadData':
                        await this.loadChanges(webview);
                        return;
                    case 'loadKeys':
                        await this.handleLoadKeys(String(message.provider || ''), webview);
                        return;
                    case 'saveKey':
                        await this.handleSaveKey(
                            String(message.provider || ''),
                            String(message.key || ''),
                            typeof message.label === 'string' ? message.label : undefined,
                            webview
                        );
                        return;
                    case 'removeKey':
                        await this.handleRemoveKey(
                            String(message.provider || ''),
                            Number(message.keyIndex ?? -1),
                            webview
                        );
                        return;
                    case 'resetKeys':
                        await this.handleResetKeys(String(message.provider || ''), webview);
                        return;
                    case 'openComposerPanel':
                        await this.openComposerPanel(message.providerConfig as ComposeProviderConfig, true);
                        return;
                    case 'triggerCompose':
                    case 'compose':
                        await this.handleComposeWithKeyRotation(
                            message.providerConfig as ComposeProviderConfig | undefined,
                            webview
                        );
                        return;
                    case 'commitSingle':
                        await this.handleCommitSingle(message.draft as DraftCommit, webview);
                        return;
                    case 'commitAll':
                        await this.handleCommitAll(message.drafts as DraftCommit[], webview);
                        return;
                    case 'refresh':
                        await this.loadChanges(webview);
                        return;
                    case 'loadOllamaModels':
                        await this.handleLoadOllamaModels(
                            String(message.baseUrl || 'http://localhost:11434'),
                            webview
                        );
                        return;
                    default:
                        Logger.warn('CommitComposerProvider: Unknown message command', { source, command });
                        return;
                }
            } catch (error) {
                Logger.error('CommitComposerProvider: Message handler failed', error);
                await this.postError(webview, error);
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview, bootstrap: WebviewBootstrapPayload): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );
        const nonce = getNonce();
        const cspSource = webview.cspSource;
        const bootstrapJson = JSON.stringify(bootstrap).replace(/</g, '\\u003c');

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
        const staged = await this.getOrchestrator().getStagedChanges();
        const config = this.getConfigLoader().getConfig();
        const providerConfig = {
            provider: config.provider,
            model: config.model,
            baseUrl: config.baseUrl || (config.provider === 'ollama' ? config.ollamaHost : undefined),
        };

        await webview.postMessage({
            command: 'dataLoaded',
            data: { staged, providerConfig },
        });
    }

    private async handleComposeWithKeyRotation(
        providerConfig: ComposeProviderConfig | undefined,
        webview: vscode.Webview
    ): Promise<void> {
        let resolvedConfig: ComposeProviderConfig = providerConfig || this.getDefaultProviderConfig();

        if (resolvedConfig.provider !== 'ollama' && this._keyManager) {
            if (!resolvedConfig.apiKey) {
                const rotatedKey = await this._keyManager.getNextKey(resolvedConfig.provider);
                if (rotatedKey) {
                    resolvedConfig = { ...resolvedConfig, apiKey: rotatedKey };
                }
            } else {
                const hasStoredKey = await this._keyManager.hasKey(resolvedConfig.provider);
                if (!hasStoredKey) {
                    await this._keyManager.addKey(resolvedConfig.provider, resolvedConfig.apiKey, 'Default');
                }
            }
        }

        await this.handleCompose(resolvedConfig, webview);
    }

    private async handleCompose(providerConfig: ComposeProviderConfig, webview: vscode.Webview): Promise<void> {
        await webview.postMessage({ command: 'composing' });
        const result = await this.getOrchestrator().compose(providerConfig);

        await webview.postMessage({
            command: 'composed',
            drafts: result.drafts,
            reasoning: result.reasoning,
            summary: result.summary,
        });
    }

    private async handleCommitSingle(draft: DraftCommit, webview: vscode.Webview): Promise<void> {
        await this.getCommitExecutor().executeSingle(draft);
        vscode.window.showInformationMessage(`Committed: ${draft.message.split('\n')[0]}`);
        await webview.postMessage({ command: 'commitSuccess', draftId: draft.id });
        await this.refreshAllVisibleViews();
    }

    private async handleCommitAll(drafts: DraftCommit[], webview: vscode.Webview): Promise<void> {
        const results = await this.getCommitExecutor().executeAll(drafts, progress => {
            void webview.postMessage({
                command: 'commitProgress',
                progress,
            });
        });

        const successCount = results.filter(result => result.success).length;
        vscode.window.showInformationMessage(
            `Committed ${successCount}/${results.length} commits successfully.`
        );

        await webview.postMessage({ command: 'commitAllDone', results });
        await this.refreshAllVisibleViews();
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

    private async handleLoadKeys(provider: string, webview: vscode.Webview): Promise<void> {
        if (!this._keyManager) {
            await webview.postMessage({
                command: 'keysLoaded',
                provider,
                keys: [],
                error: 'Key manager not initialized',
            });
            return;
        }

        const keys = await this._keyManager.getKeysForDisplay(provider);
        await webview.postMessage({ command: 'keysLoaded', provider, keys });
    }

    private async handleSaveKey(
        provider: string,
        key: string,
        label: string | undefined,
        webview: vscode.Webview
    ): Promise<void> {
        if (!this._keyManager) {
            await webview.postMessage({
                command: 'keySaved',
                provider,
                success: false,
                error: 'Key manager not initialized',
            });
            return;
        }

        await this._keyManager.addKey(provider, key, label);
        const keys = await this._keyManager.getKeysForDisplay(provider);
        await webview.postMessage({ command: 'keySaved', provider, success: true, keys });
    }

    private async handleRemoveKey(provider: string, keyIndex: number, webview: vscode.Webview): Promise<void> {
        if (!this._keyManager) {
            await webview.postMessage({
                command: 'keyRemoved',
                provider,
                success: false,
                error: 'Key manager not initialized',
            });
            return;
        }

        await this._keyManager.removeKey(provider, keyIndex);
        const keys = await this._keyManager.getKeysForDisplay(provider);
        await webview.postMessage({ command: 'keyRemoved', provider, success: true, keys });
    }

    private async handleResetKeys(provider: string, webview: vscode.Webview): Promise<void> {
        if (!this._keyManager) {
            await webview.postMessage({
                command: 'keysReset',
                provider,
                success: false,
                error: 'Key manager not initialized',
            });
            return;
        }

        await this._keyManager.resetProvider(provider);
        await webview.postMessage({ command: 'keysReset', provider, success: true, keys: [] });
    }

    private async handleLoadOllamaModels(baseUrl: string, webview: vscode.Webview): Promise<void> {
        try {
            const ollamaProvider = new OllamaProvider({ apiKey: '', model: '', baseUrl });
            const models = await ollamaProvider.getAvailableModels();
            await webview.postMessage({ command: 'ollamaModelsLoaded', models });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await webview.postMessage({ command: 'ollamaModelsLoaded', models: [], error: message });
        }
    }

    private async postError(webview: vscode.Webview, error: unknown): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);
        await webview.postMessage({ command: 'error', message });
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
