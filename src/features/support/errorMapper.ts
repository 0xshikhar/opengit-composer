import * as vscode from 'vscode';
import axios from 'axios';
import { ComposerDiagnostics, ComposerErrorAction, ComposerErrorCode, ComposerErrorPayload, ComposerErrorSeverity } from '../../types/messages';
import { ConfigLoader } from '../../core/configLoader';

export interface ComposeMessageError extends Error {
    code?: ComposerErrorCode;
    action?: ComposerErrorAction;
    diagnostics?: ComposerDiagnostics;
}

export function mapErrorToMessage(
    error: unknown,
    configLoader: ConfigLoader
): ComposerErrorPayload {
    const err = error as ComposeMessageError;
    const message = error instanceof Error ? error.message : String(error);
    const code = err?.code || 'UNKNOWN_ERROR';
    const diagnostics = buildDiagnostics(error, code, message, configLoader);

    if (err?.action) {
        return {
            code,
            severity: severityForCode(code),
            recoverable: isRecoverableCode(code),
            message,
            action: err.action,
            diagnostics,
        };
    }

    if (code === 'ONLY_EXCLUDED_FILES') {
        return {
            code,
            severity: 'warning',
            recoverable: true,
            message: 'All staged files are excluded by your privacy policy. Update exclude patterns or stage different files.',
            action: { label: 'Refresh', command: 'refresh' },
            diagnostics,
        };
    }

    if (code === 'STAGED_SNAPSHOT_STALE') {
        return {
            code,
            severity: 'warning',
            recoverable: true,
            message,
            action: { label: 'Refresh', command: 'refresh' },
            diagnostics,
        };
    }

    if (code === 'NO_GIT_REPOSITORY' || /not a git repository|No workspace folder found|repository not found/i.test(message)) {
        return {
            code: 'NO_GIT_REPOSITORY',
            severity: 'warning',
            recoverable: true,
            message: 'OpenGit Composer could not find a git repository in the current workspace. Select a directory that contains a .git repository.',
            action: { label: 'Select Directory', command: 'openWorkspace' },
            diagnostics,
        };
    }

    if (/No API key configured|missing api key/i.test(message)) {
        return {
            code: 'PRECHECK_MISSING_API_KEY',
            severity: 'error',
            recoverable: true,
            message: 'API key is missing for the selected provider. Add a key in AI Controls and compose again.',
            action: { label: 'Test Connection', command: 'testConnection' },
            diagnostics,
        };
    }

    if (/401|403|unauthorized|invalid api key|forbidden/i.test(message)) {
        return {
            code: 'AUTH_ERROR',
            severity: 'error',
            recoverable: true,
            message: 'Authentication failed for the selected provider. Verify your API key and model access.',
            action: { label: 'Test Connection', command: 'testConnection' },
            diagnostics,
        };
    }

    if (/429|rate limit|quota/i.test(message)) {
        return {
            code: 'RATE_LIMIT',
            severity: 'warning',
            recoverable: true,
            message: 'Provider rate limit reached. Retry compose with backoff or rotate to another key.',
            action: { label: 'Retry Compose', command: 'retryCompose' },
            diagnostics,
        };
    }

    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network|timeout|timed out|TLS|ssl/i.test(message)) {
        const codeMatch: ComposerErrorCode =
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
            severity: 'error',
            recoverable: true,
            message: `Network or provider endpoint is unreachable. ${hint}`,
            action: { label: 'Refresh', command: 'refresh' },
            diagnostics,
        };
    }

    return {
        code,
        severity: severityForCode(code),
        recoverable: isRecoverableCode(code),
        message,
        diagnostics,
    };
}

export function buildDiagnostics(
    error: unknown,
    code: ComposerErrorCode,
    message: string,
    configLoader: ConfigLoader
): ComposerDiagnostics {
    const diagnostics: ComposerDiagnostics = {
        provider: configLoader.getConfig().provider || 'unknown',
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

export async function postError(
    webview: vscode.Webview,
    error: unknown,
    configLoader: ConfigLoader
): Promise<void> {
    const mapped = mapErrorToMessage(error, configLoader);
    await webview.postMessage({
        command: 'error',
        error: mapped,
    });
}

function severityForCode(code: ComposerErrorCode): ComposerErrorSeverity {
    switch (code) {
        case 'PRECHECK_MISSING_API_KEY':
        case 'PRECHECK_LOCAL_PROVIDER_UNREACHABLE':
        case 'PRECHECK_OLLAMA_UNREACHABLE':
        case 'PRECHECK_MODEL_UNAVAILABLE':
        case 'NO_GIT_REPOSITORY':
        case 'AUTH_ERROR':
        case 'NETWORK_ERROR':
        case 'DNS_ERROR':
        case 'CONNECTION_REFUSED':
        case 'TLS_ERROR':
            return 'error';
        case 'RATE_LIMIT':
        case 'ONLY_EXCLUDED_FILES':
        case 'STAGED_SNAPSHOT_STALE':
            return 'warning';
        default:
            return 'error';
    }
}

function isRecoverableCode(code: ComposerErrorCode): boolean {
    return code !== 'UNKNOWN_ERROR';
}
