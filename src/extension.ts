import * as vscode from 'vscode';
import { CommitComposerProvider } from './webview/CommitComposerProvider';
import { KeyManager } from './core/keyManager';
import { Logger } from './utils/logger';

export function activate(context: vscode.ExtensionContext) {
    Logger.initialize();
    Logger.info('OpenGit Composer extension activated');

    const keyManager = new KeyManager(context);
    const provider = new CommitComposerProvider(context.extensionUri, keyManager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(CommitComposerProvider.viewType, provider)
    );

    const autoComposeCommand = vscode.commands.registerCommand(
        'commitComposer.autoCompose',
        async () => {
            // Open the dedicated panel and trigger composition immediately.
            // This provides a consistent UX from the command palette.
            await provider.openComposerPanel(undefined, true);
        }
    );

    const showDebugCommand = vscode.commands.registerCommand(
        'commitComposer.showDebug',
        () => {
            Logger.showDebugInfo();
        }
    );

    const copyLogsCommand = vscode.commands.registerCommand(
        'commitComposer.copySanitizedLogs',
        async () => {
            await Logger.copySanitizedLogs();
        }
    );

    context.subscriptions.push(autoComposeCommand, showDebugCommand, copyLogsCommand);
    Logger.info('OpenGit Composer commands registered');
}

export function deactivate() {
    Logger.info('OpenGit Composer extension deactivated');
}
