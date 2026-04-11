import * as vscode from 'vscode';
import { WebviewToHostCommand, WebviewToHostMessage } from '../../../types/messages';

export type WebviewCommandHandler = (message: WebviewToHostMessage, webview: vscode.Webview) => Promise<void>;

export type WebviewCommandRegistry = Partial<Record<WebviewToHostCommand, WebviewCommandHandler>>;
