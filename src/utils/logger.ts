type OutputChannel = { appendLine(val: string): void; show(): void };

const DEBUG_STORAGE_KEY = 'git-composer-debug-mode';

function isDebugEnabled(): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vscode = require('vscode');
        return vscode.workspace.getConfiguration('commitComposer')?.get('debugMode', false) ?? false;
    } catch {
        return process.env.DEBUG === 'true';
    }
}

/**
 * Logger that works in both VS Code extension context and plain Node.js (tests).
 * It lazy-requires vscode so it doesn't crash when running unit tests without VS Code.
 */
export class Logger {
    private static outputChannel: OutputChannel | null = null;
    private static debugEnabled: boolean = false;
    private static readonly maxBufferedLines: number = 1500;
    private static recentLines: string[] = [];

    private static writeLine(line: string) {
        this.outputChannel!.appendLine(line);
        this.recentLines.push(line);
        if (this.recentLines.length > this.maxBufferedLines) {
            this.recentLines = this.recentLines.slice(this.recentLines.length - this.maxBufferedLines);
        }
    }

    static initialize() {
        if (this.outputChannel) return;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const vscode = require('vscode');
            this.outputChannel = vscode.window.createOutputChannel('Git Composer');
            this.debugEnabled = isDebugEnabled();
        } catch {
            // In a pure Node.js / test context vscode does not exist — use a console shim
            this.outputChannel = {
                appendLine: (val: string) => console.log(val),
                show: () => { },
            };
            this.debugEnabled = process.env.DEBUG === 'true';
        }
    }

    static info(message: string, data?: any) {
        this.initialize();
        const msg = `[INFO  ${ts()}] ${message}`;
        this.writeLine(msg);
        if (data) this.writeLine(this.stringifyData(data));
        console.log(msg, data ?? '');
    }

    static error(message: string, error?: any) {
        this.initialize();
        const msg = `[ERROR ${ts()}] ${message}`;
        this.writeLine(msg);
        
        if (error instanceof Error) {
            this.writeLine(`Error: ${error.message}`);
            this.writeLine(`Stack: ${error.stack || ''}`);
        } else if (error) {
            this.writeLine(this.stringifyData(error));
        }
        console.error(msg, error ?? '');
    }

    static debug(message: string, data?: any) {
        if (!this.debugEnabled) return;
        this.initialize();
        const msg = `[DEBUG ${ts()}] ${message}`;
        this.writeLine(msg);
        if (data) this.writeLine(this.stringifyData(data));
        console.debug(msg, data ?? '');
    }

    static aiRequest(provider: string, model: string, promptLength: number) {
        this.initialize();
        const msg = `[AI REQUEST ${ts()}]`;
        this.writeLine(msg);
        this.writeLine(`  Provider: ${provider}`);
        this.writeLine(`  Model: ${model}`);
        this.writeLine(`  Prompt Length: ${promptLength} chars`);
    }

    static aiResponse(provider: string, statusCode: number, contentLength: number, responseTime: number) {
        this.initialize();
        const msg = `[AI RESPONSE ${ts()}]`;
        this.writeLine(msg);
        this.writeLine(`  Provider: ${provider}`);
        this.writeLine(`  Status: ${statusCode}`);
        this.writeLine(`  Content Length: ${contentLength} chars`);
        this.writeLine(`  Response Time: ${responseTime}ms`);
    }

    static aiRawResponse(content: string) {
        if (!this.debugEnabled) return;
        this.initialize();
        const msg = `[AI RAW RESPONSE ${ts()}]`;
        this.writeLine(msg);
        this.writeLine('━'.repeat(50));
        this.writeLine(content);
        this.writeLine('━'.repeat(50));
    }

    static aiError(provider: string, error: any) {
        this.initialize();
        const msg = `[AI ERROR ${ts()}]`;
        this.writeLine(msg);
        this.writeLine(`  Provider: ${provider}`);
        
        if (error instanceof Error) {
            this.writeLine(`  Error: ${error.message}`);
            this.writeLine(`  Stack: ${error.stack || ''}`);
        } else if (error.response) {
            this.writeLine(`  Status: ${error.response.status}`);
            this.writeLine(`  StatusText: ${error.response.statusText}`);
            this.writeLine(`  Data: ${this.stringifyData(error.response.data)}`);
        } else {
            this.writeLine(this.stringifyData(error));
        }
    }

    static parseAttempt(attempt: number, strategy: string, data?: any) {
        this.initialize();
        const msg = `[PARSE ATTEMPT ${attempt}] ${strategy}`;
        this.writeLine(msg);
        if (data) this.writeLine(this.stringifyData(data));
    }

    static parseSuccess(strategy: string, groupsCount: number) {
        this.initialize();
        const msg = `[PARSE SUCCESS ${ts()}] Using: ${strategy}, Groups: ${groupsCount}`;
        this.writeLine(msg);
    }

    static parseFailure(attempt: number, error: string) {
        this.initialize();
        const msg = `[PARSE FAILED ${ts()}] Attempt ${attempt}: ${error}`;
        this.writeLine(msg);
    }

    static warn(message: string, data?: any) {
        this.initialize();
        const msg = `[WARN  ${ts()}] ${message}`;
        this.writeLine(msg);
        if (data) this.writeLine(this.stringifyData(data));
        console.warn(msg, data ?? '');
    }

    static show() {
        this.initialize();
        this.outputChannel!.show();
    }

    static showDebugInfo() {
        this.initialize();
        this.writeLine('');
        this.writeLine('═'.repeat(60));
        this.writeLine('DEBUG INFO - Git Composer Extension');
        this.writeLine('═'.repeat(60));
        this.writeLine(`Debug Mode: ${this.debugEnabled ? 'ENABLED' : 'DISABLED'}`);
        this.writeLine(`Enable in: Settings > commitComposer.debugMode`);
        this.writeLine('═'.repeat(60));
        this.outputChannel!.show();
    }

    static async copySanitizedLogs(): Promise<void> {
        this.initialize();
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const vscode = require('vscode');
            const content = this.recentLines
                .map(line => this.sanitizeLogLine(line))
                .join('\n');
            await vscode.env.clipboard.writeText(content);
            vscode.window.showInformationMessage('Sanitized logs copied to clipboard.');
        } catch (error) {
            this.error('Logger: Failed to copy sanitized logs', error);
        }
    }

    private static stringifyData(data: any): string {
        if (typeof data === 'string') {
            // Truncate very long strings
            if (data.length > 10000) {
                return data.substring(0, 5000) + '\n... [truncated ' + (data.length - 10000) + ' chars]';
            }
            return data;
        }
        try {
            const str = JSON.stringify(data, null, 2);
            if (str.length > 10000) {
                return str.substring(0, 5000) + '\n... [truncated]';
            }
            return str;
        } catch {
            return String(data);
        }
    }

    private static sanitizeLogLine(line: string): string {
        let output = line;

        output = output.replace(/sk-[a-zA-Z0-9_-]{16,}/g, '[REDACTED_KEY]');
        output = output.replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"'\s]+/gi, '$1[REDACTED]');
        output = output.replace(/(authorization["']?\s*[:=]\s*["']?bearer\s+)[^"'\s]+/gi, '$1[REDACTED]');

        if (/^\s*[\+\-](?![\+\-])/.test(output) || /^\s*@@/.test(output) || /^\s*diff --git/.test(output)) {
            return '[DIFF_CONTENT_REDACTED]';
        }

        if (output.length > 500) {
            return `${output.slice(0, 500)}...[truncated]`;
        }
        return output;
    }
}

function ts() {
    return new Date().toISOString();
}
