import * as vscode from 'vscode';
import axios from 'axios';
import { GitService } from '../core/git/gitService';
import {
    Orchestrator,
    ComposeProviderConfig,
    ComposeSnapshot,
} from '../core/orchestrator';
import { CommitExecutor } from '../core/commitExecutor';
import { ConfigLoader } from '../core/configLoader';
import { KeyManager } from '../core/keyManager';
import { DraftCommit } from '../types/commits';
import { Logger } from '../utils/logger';
import { OllamaProvider } from '../ai/providers/ollama';
import { applyPrivacyPolicyToChanges } from '../core/privacyPolicy';
import { AIProviderFactory } from '../ai/aiProviderFactory';

type WebviewSource = 'sidebar' | 'panel';

interface WebviewBootstrapPayload {
    mode: WebviewSource;
    autoCompose?: boolean;
    providerConfig?: ComposeProviderConfig;
    logoUri?: string;
}

type ErrorActionCommand = 'refresh' | 'compose' | 'retryCompose' | 'copySanitizedLogs' | 'testConnection';

interface ComposeMessageError extends Error {
    code?: string;
    action?: {
        label: string;
        command: ErrorActionCommand;
    };
    diagnostics?: {
        provider: string;
        code: string;
        message: string;
        status?: number;
        requestId?: string;
        model?: string;
        details?: string;
        hint?: string;
    };
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
                        await this.openComposerPanel(
                            message.providerConfig as ComposeProviderConfig,
                            typeof message.autoCompose === 'boolean' ? message.autoCompose : true
                        );
                        return;
                    case 'copySanitizedLogs':
                        await Logger.copySanitizedLogs();
                        return;
                    case 'testProviderConnection':
                        await this.handleTestProviderConnection(
                            message.providerConfig as ComposeProviderConfig | undefined,
                            webview
                        );
                        return;
                    case 'triggerCompose':
                    case 'compose':
                        await this.handleComposeWithKeyRotation(
                            message.providerConfig as ComposeProviderConfig | undefined,
                            webview
                        );
                        return;
                    case 'retryCompose':
                        await this.handleComposeWithKeyRotation(
                            message.providerConfig as ComposeProviderConfig | undefined,
                            webview
                        );
                        return;
                    case 'testConnection':
                        await this.handleTestProviderConnection(
                            message.providerConfig as ComposeProviderConfig | undefined,
                            webview
                        );
                        return;
                    case 'commitSingle':
                        await this.handleCommitSingle(
                            message.draft as DraftCommit,
                            message.snapshot as ComposeSnapshot | undefined,
                            webview
                        );
                        return;
                    case 'commitAll':
                        await this.handleCommitAll(
                            message.drafts as DraftCommit[],
                            message.snapshot as ComposeSnapshot | undefined,
                            webview
                        );
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
                    case 'saveProviderPreference':
                        await this.handleSaveProviderPreference(
                            String(message.provider || ''),
                            String(message.model || ''),
                            String(message.baseUrl || ''),
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
        const staged = await this.getOrchestrator().getStagedChanges();
        const unstaged = await this.getOrchestrator().getUnstagedChanges();
        const config = this.getConfigLoader().getConfig();
        const providerConfig = {
            provider: config.provider,
            model: config.model,
            baseUrl: config.baseUrl || (config.provider === 'ollama' ? config.ollamaHost : undefined),
        };
        const privacyResult = applyPrivacyPolicyToChanges(staged, {
            excludePatterns: config.excludePatterns,
            redactPatterns: config.redactPatterns,
        });

        await webview.postMessage({
            command: 'dataLoaded',
            data: {
                staged,
                unstaged,
                providerConfig,
                privacyPreview: {
                    excludedCount: privacyResult.excludedPaths.length,
                    redactedCount: privacyResult.redactedMatches,
                    invalidExcludePatterns: privacyResult.invalidExcludePatterns,
                    invalidRedactPatterns: privacyResult.invalidRedactPatterns,
                    warnings: privacyResult.warnings.map(warning => warning.message),
                },
            },
        });
    }

    private async handleComposeWithKeyRotation(
        providerConfig: ComposeProviderConfig | undefined,
        webview: vscode.Webview
    ): Promise<void> {
        let resolvedConfig: ComposeProviderConfig = providerConfig || this.getDefaultProviderConfig();
        await this.runComposePreflight(resolvedConfig);

        if (resolvedConfig.provider === 'ollama' || !this._keyManager) {
            await this.handleCompose(resolvedConfig, webview);
            return;
        }

        // If user entered an explicit key, try it first and persist it if this provider has no saved keys yet.
        if (resolvedConfig.apiKey) {
            const hasStoredKey = await this._keyManager.hasKey(resolvedConfig.provider);
            if (!hasStoredKey) {
                await this._keyManager.addKey(resolvedConfig.provider, resolvedConfig.apiKey, 'Default');
            }

            try {
                await this.handleCompose(resolvedConfig, webview);
                return;
            } catch (error) {
                Logger.warn('CommitComposerProvider: Compose failed with explicit key, falling back to rotated stored keys', {
                    provider: resolvedConfig.provider,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }

        const availableKeys = await this._keyManager.getKeys(resolvedConfig.provider);
        if (availableKeys.length === 0) {
            await this.handleCompose(resolvedConfig, webview);
            return;
        }

        let lastError: unknown;
        for (let attempt = 1; attempt <= availableKeys.length; attempt++) {
            const rotatedKey = await this._keyManager.getNextKey(resolvedConfig.provider);
            if (!rotatedKey) break;

            try {
                await this.handleCompose({ ...resolvedConfig, apiKey: rotatedKey }, webview);
                return;
            } catch (error) {
                lastError = error;
                Logger.warn('CommitComposerProvider: Compose attempt failed, rotating to next key', {
                    provider: resolvedConfig.provider,
                    attempt,
                    totalAttempts: availableKeys.length,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new Error('All configured API keys failed for compose request.');
    }

    private async handleTestProviderConnection(
        providerConfig: ComposeProviderConfig | undefined,
        webview: vscode.Webview
    ): Promise<void> {
        const resolvedConfig = providerConfig || this.getDefaultProviderConfig();
        const apiKey = await this.resolveApiKeyForProvider(resolvedConfig.provider, resolvedConfig.apiKey);
        const provider = AIProviderFactory.create(resolvedConfig.provider, {
            apiKey,
            model: resolvedConfig.model || '',
            baseUrl: resolvedConfig.baseUrl,
        });

        const authOk = await provider.validateApiKey();
        const modelCheck = await provider.validateModelAvailability();

        await webview.postMessage({
            command: 'connectionTested',
            result: {
                provider: resolvedConfig.provider,
                available: authOk,
                modelAvailable: modelCheck.available,
                message: authOk
                    ? (modelCheck.available
                        ? 'Connection and model check passed.'
                        : modelCheck.reason || 'Connection passed, but model availability is uncertain.')
                    : 'Provider connection failed.',
                models: modelCheck.models,
            },
        });
    }

    private async handleCompose(providerConfig: ComposeProviderConfig, webview: vscode.Webview): Promise<void> {
        await webview.postMessage({ command: 'composing' });
        const result = await this.getOrchestrator().compose(providerConfig);

        await webview.postMessage({
            command: 'composed',
            drafts: result.drafts,
            reasoning: result.reasoning,
            summary: result.summary,
            snapshot: result.snapshot,
            meta: result.meta,
        });
    }

    private async handleCommitSingle(
        draft: DraftCommit,
        snapshot: ComposeSnapshot | undefined,
        webview: vscode.Webview
    ): Promise<void> {
        await this.assertSnapshotFresh(snapshot);
        await this.getCommitExecutor().executeSingle(draft);
        vscode.window.showInformationMessage(`Committed: ${draft.message.split('\n')[0]}`);
        await webview.postMessage({ command: 'commitSuccess', draftId: draft.id });
        await this.refreshAllVisibleViews();
    }

    private async handleCommitAll(
        drafts: DraftCommit[],
        snapshot: ComposeSnapshot | undefined,
        webview: vscode.Webview
    ): Promise<void> {
        await this.assertSnapshotFresh(snapshot);
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

    private async handleSaveProviderPreference(
        provider: string,
        model: string,
        baseUrl: string,
        webview: vscode.Webview
    ): Promise<void> {
        try {
            const config = this.getConfigLoader();
            const currentConfig = config.getConfig();
            
            // Update VS Code settings for provider preference
            const vscode = require('vscode');
            const vsConfig = vscode.workspace.getConfiguration('commitComposer');
            
            await vsConfig.update('aiProvider', provider, true);
            await vsConfig.update('model', model, true);
            
            if (provider === 'ollama' && baseUrl) {
                await vsConfig.update('ollamaHost', baseUrl, true);
            }
            
            await webview.postMessage({ 
                command: 'providerPreferenceSaved', 
                success: true,
                provider,
                model,
                baseUrl 
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await webview.postMessage({ 
                command: 'providerPreferenceSaved', 
                success: false, 
                error: message 
            });
        }
    }

    private async postError(webview: vscode.Webview, error: unknown): Promise<void> {
        const mapped = this.mapErrorToMessage(error);
        await webview.postMessage({
            command: 'error',
            message: mapped.message,
            code: mapped.code,
            action: mapped.action,
            diagnostics: mapped.diagnostics,
        });
    }

    private async runComposePreflight(providerConfig: ComposeProviderConfig): Promise<void> {
        const provider = providerConfig.provider || this.getConfigLoader().getConfig().provider;
        const config = this.getConfigLoader().getConfig();
        const explicitApiKey = (providerConfig.apiKey || '').trim();
        const configuredApiKey = (config.apiKey || '').trim();

        if (provider !== 'ollama') {
            let storedKeys = 0;
            if (this._keyManager) {
                storedKeys = await this._keyManager.getKeyCount(provider);
            }
            if (!explicitApiKey && !configuredApiKey && storedKeys === 0) {
                const error = new Error(
                    `Missing API key for provider "${provider}". Add one in AI Controls before composing.`
                ) as ComposeMessageError;
                error.code = 'PRECHECK_MISSING_API_KEY';
                error.action = {
                    label: 'Recompose',
                    command: 'compose',
                };
                throw error;
            }
        }

        const resolvedApiKey = await this.resolveApiKeyForProvider(provider, explicitApiKey || configuredApiKey);
        const providerInstance = AIProviderFactory.create(provider, {
            apiKey: resolvedApiKey,
            model: providerConfig.model || config.model || '',
            baseUrl: providerConfig.baseUrl || config.baseUrl || (provider === 'ollama' ? config.ollamaHost : undefined),
        });

        const reachable = await providerInstance.validateApiKey();
        if (!reachable) {
            const error = new Error(
                provider === 'ollama'
                    ? `Unable to reach Ollama at ${providerConfig.baseUrl || config.baseUrl || config.ollamaHost}. Check the host and whether Ollama is running.`
                    : `Unable to validate credentials for provider "${provider}". Check your API key and network access.`
            ) as ComposeMessageError;
            error.code = provider === 'ollama' ? 'PRECHECK_OLLAMA_UNREACHABLE' : 'AUTH_ERROR';
            error.action = {
                label: 'Test Connection',
                command: 'testConnection',
            };
            throw error;
        }

        const modelCheck = await providerInstance.validateModelAvailability();
        if (!modelCheck.available) {
            const error = new Error(
                modelCheck.reason || `Model "${providerConfig.model || config.model}" is not available for provider "${provider}".`
            ) as ComposeMessageError;
            error.code = 'PRECHECK_MODEL_UNAVAILABLE';
            error.action = {
                label: 'Test Connection',
                command: 'testConnection',
            };
            throw error;
        }
    }

    private async resolveApiKeyForProvider(provider: string, preferredKey?: string): Promise<string> {
        const trimmed = (preferredKey || '').trim();
        if (trimmed) {
            return trimmed;
        }

        if (!this._keyManager) {
            return trimmed;
        }

        const currentKey = await this._keyManager.getCurrentKey(provider);
        if (currentKey) {
            return currentKey;
        }

        const keys = await this._keyManager.getKeys(provider);
        return keys[0]?.key || '';
    }

    private buildSnapshotFingerprintFromChanges(changes: { path: string; changeType: string; additions: number; deletions: number }[]): string {
        return [...changes]
            .sort((left, right) => left.path.localeCompare(right.path))
            .map(change => `${change.path}|${change.changeType}|${change.additions}|${change.deletions}`)
            .join('\n');
    }

    private async assertSnapshotFresh(snapshot: ComposeSnapshot | undefined): Promise<void> {
        if (!snapshot) {
            return;
        }

        const currentStaged = await this.getOrchestrator().getStagedChanges();
        const config = this.getConfigLoader().getConfig();
        const eligible = applyPrivacyPolicyToChanges(currentStaged, {
            excludePatterns: config.excludePatterns,
            redactPatterns: [],
        }).changes;

        const currentFingerprint = this.buildSnapshotFingerprintFromChanges(eligible);
        if (snapshot.fingerprint !== currentFingerprint) {
            const error = new Error(
                'Staged changes have changed since composition. Refresh and re-compose before committing.'
            ) as ComposeMessageError;
            error.code = 'STAGED_SNAPSHOT_STALE';
            error.action = {
                label: 'Refresh',
                command: 'refresh',
            };
            throw error;
        }
    }

    private mapErrorToMessage(error: unknown): {
        code: string;
        message: string;
        action?: { label: string; command: ErrorActionCommand };
        diagnostics?: ComposeMessageError['diagnostics'];
    } {
        const err = error as ComposeMessageError;
        const message = error instanceof Error ? error.message : String(error);
        const code = err?.code || 'UNKNOWN_ERROR';
        const diagnostics = this.buildDiagnostics(error, code, message);

        if (err?.action) {
            return { code, message, action: err.action, diagnostics };
        }

        if (code === 'ONLY_EXCLUDED_FILES') {
            return {
                code,
                message: 'All staged files are excluded by your privacy policy. Update exclude patterns or stage different files.',
                action: { label: 'Refresh', command: 'refresh' },
                diagnostics,
            };
        }

        if (/No API key configured|missing api key/i.test(message)) {
            return {
                code: 'PRECHECK_MISSING_API_KEY',
                message: 'API key is missing for the selected provider. Add a key in AI Controls and compose again.',
                action: { label: 'Test Connection', command: 'testConnection' },
                diagnostics,
            };
        }

        if (/401|403|unauthorized|invalid api key|forbidden/i.test(message)) {
            return {
                code: 'AUTH_ERROR',
                message: 'Authentication failed for the selected provider. Verify your API key and model access.',
                action: { label: 'Test Connection', command: 'testConnection' },
                diagnostics,
            };
        }

        if (/429|rate limit|quota/i.test(message)) {
            return {
                code: 'RATE_LIMIT',
                message: 'Provider rate limit reached. Retry compose with backoff or rotate to another key.',
                action: { label: 'Retry Compose', command: 'retryCompose' },
                diagnostics,
            };
        }

        if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network|timeout|timed out|TLS|ssl/i.test(message)) {
            const codeMatch =
                /ENOTFOUND|EAI_AGAIN/i.test(message) ? 'DNS_ERROR' :
                /ECONNREFUSED/i.test(message) ? 'CONNECTION_REFUSED' :
                /TLS|ssl/i.test(message) ? 'TLS_ERROR' :
                'NETWORK_ERROR';
            const hint =
                /ENOTFOUND|EAI_AGAIN/i.test(message) ? 'DNS lookup failed.' :
                /ECONNREFUSED/i.test(message) ? 'The provider endpoint refused the connection.' :
                /TLS|ssl/i.test(message) ? 'TLS or certificate negotiation failed.' :
                'The request timed out or the network is unstable.';
            return {
                code: codeMatch,
                message: `Network or provider endpoint is unreachable. ${hint}`,
                action: { label: 'Refresh', command: 'refresh' },
                diagnostics,
            };
        }

        return { code, message, diagnostics };
    }

    private buildDiagnostics(
        error: unknown,
        code: string,
        message: string
    ): ComposeMessageError['diagnostics'] {
        const diagnostics: ComposeMessageError['diagnostics'] = {
            provider: this.getConfigLoader().getConfig().provider || 'unknown',
            code,
            message,
        };

        if (axios.isAxiosError(error)) {
            diagnostics.status = error.response?.status;
            diagnostics.requestId = String(
                error.response?.headers?.['x-request-id'] ||
                error.response?.headers?.['request-id'] ||
                error.response?.headers?.['x-correlation-id'] ||
                ''
            ) || undefined;
            diagnostics.details = typeof error.response?.data === 'string'
                ? error.response.data
                : error.response?.data?.error?.message || error.response?.data?.message;
            diagnostics.hint = error.response?.status === 429
                ? 'Wait and retry, or rotate to a different key.'
                : error.response?.status && error.response.status >= 500
                    ? 'The provider service is temporarily failing.'
                    : undefined;
        }

        return diagnostics;
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
