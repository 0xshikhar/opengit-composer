import * as vscode from 'vscode';
import { GitService } from '../git/gitService';
import { AIProviderFactory } from '../ai/aiProviderFactory';
import { AIProvider } from '../ai/aiProvider';
import { CommitGroup } from '../types/commits';
import { FileChange } from '../types/git';
import { Logger } from '../utils/logger';
import { isWebviewToHostMessage, WebviewToHostMessage } from '../types/messages';

export class CommitComposerPanel {
    public static currentPanel: CommitComposerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private gitService: GitService;
    private aiProvider: AIProvider | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gitService: GitService
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.gitService = gitService;

        Logger.info('CommitComposerPanel: Panel created');

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview();
        this._setWebviewMessageListener();
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        gitService: GitService
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (CommitComposerPanel.currentPanel) {
            Logger.info('CommitComposerPanel: Revealing existing panel');
            CommitComposerPanel.currentPanel._panel.reveal(column);
            return;
        }

        Logger.info('CommitComposerPanel: Creating new panel');
        const panel = vscode.window.createWebviewPanel(
            'commitComposer',
            'Commit Composer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist'),
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        CommitComposerPanel.currentPanel = new CommitComposerPanel(
            panel,
            extensionUri,
            gitService
        );
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, gitService: GitService) {
        Logger.info('CommitComposerPanel: Reviving panel');
        CommitComposerPanel.currentPanel = new CommitComposerPanel(panel, extensionUri, gitService);
    }

    public dispose() {
        Logger.info('CommitComposerPanel: Disposing panel');
        CommitComposerPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview() {
        const scriptUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );

        const styleMainUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'main.css')
        ); // If we have CSS extracted or we can rely on style-loader injecting it.

        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
                <title>Commit Composer</title>
                <!-- <link href="${styleMainUri}" rel="stylesheet"> --> 
                <!-- Style loader usually injects styles, but if we used MiniCssExtractPlugin we'd need a link. 
                     Since we used style-loader, no link needed for main.css if it's imported in js. -->
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async (message: WebviewToHostMessage | unknown) => {
                if (!isWebviewToHostMessage(message)) {
                    Logger.warn('CommitComposerPanel: Ignoring unknown webview message', { message });
                    return;
                }

                Logger.debug('CommitComposerPanel: Received message from webview', { command: message.command });

                const payload = message as WebviewToHostMessage & Record<string, any>;
                switch (payload.command) {
                    case 'loadData':
                        await this.loadChanges();
                        break;
                    case 'generate':
                        await this.handleGenerate(payload.providerConfig);
                        break;
                    case 'commit':
                        await this.handleCommit(payload.group as CommitGroup);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async loadChanges() {
        try {
            Logger.info('CommitComposerPanel: Loading staged changes');
            const staged = await this.gitService.getStagedChanges();
            Logger.info('CommitComposerPanel: Staged changes loaded', { count: staged.length });

            this._panel.webview.postMessage({
                command: 'dataLoaded',
                data: { staged }
            });
        } catch (e) {
            Logger.error('CommitComposerPanel: Failed to load changes', e);
            this._panel.webview.postMessage({
                command: 'error',
                message: (e as Error).message
            });
        }
    }

    private async handleGenerate(config: any) {
        try {
            Logger.info('CommitComposerPanel: Generating commits', {
                provider: config.provider,
                model: config.model
            });

            // Use factory to create provider
            this.aiProvider = AIProviderFactory.create(config.provider, {
                apiKey: config.apiKey,
                model: config.model
            });

            const changes = await this.gitService.getStagedChanges();
            if (changes.length === 0) {
                Logger.warn('CommitComposerPanel: No staged changes to analyze');
                throw new Error('No staged changes to analyze');
            }

            Logger.info('CommitComposerPanel: Analyzing changes with AI', { fileCount: changes.length });
            const result = await this.aiProvider.analyzeChanges(changes);
            Logger.info('CommitComposerPanel: AI analysis complete', { groupCount: result.groups.length });

            this._panel.webview.postMessage({
                command: 'generated',
                groups: result.groups
            });

        } catch (e) {
            Logger.error('CommitComposerPanel: Failed to generate commits', e);
            this._panel.webview.postMessage({
                command: 'error',
                message: (e as Error).message
            });
        }
    }

    private async handleCommit(group: CommitGroup) {
        try {
            Logger.info('CommitComposerPanel: Creating commit', {
                message: group.message,
                fileCount: group.files.length
            });

            const files = group.files.map(f => f.path);
            await this.gitService.createCommit(group.message, files);

            Logger.info('CommitComposerPanel: Commit created successfully');
            vscode.window.showInformationMessage(`Committed: ${group.message}`);
            await this.loadChanges(); // Refresh
        } catch (e) {
            Logger.error('CommitComposerPanel: Failed to create commit', e);
            vscode.window.showErrorMessage(`Commit failed: ${(e as Error).message}`);
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
