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
        this.outputChannel!.appendLine(msg);
        if (data) this.outputChannel!.appendLine(this.stringifyData(data));
        console.log(msg, data ?? '');
    }

    static error(message: string, error?: any) {
        this.initialize();
        const msg = `[ERROR ${ts()}] ${message}`;
        this.outputChannel!.appendLine(msg);
        
        if (error instanceof Error) {
            this.outputChannel!.appendLine(`Error: ${error.message}`);
            this.outputChannel!.appendLine(`Stack: ${error.stack || ''}`);
        } else if (error) {
            this.outputChannel!.appendLine(this.stringifyData(error));
        }
        console.error(msg, error ?? '');
    }

    static debug(message: string, data?: any) {
        if (!this.debugEnabled) return;
        this.initialize();
        const msg = `[DEBUG ${ts()}] ${message}`;
        this.outputChannel!.appendLine(msg);
        if (data) this.outputChannel!.appendLine(this.stringifyData(data));
        console.debug(msg, data ?? '');
    }

    static aiRequest(provider: string, model: string, promptLength: number) {
        this.initialize();
        const msg = `[AI REQUEST ${ts()}]`;
        this.outputChannel!.appendLine(msg);
        this.outputChannel!.appendLine(`  Provider: ${provider}`);
        this.outputChannel!.appendLine(`  Model: ${model}`);
        this.outputChannel!.appendLine(`  Prompt Length: ${promptLength} chars`);
    }

    static aiResponse(provider: string, statusCode: number, contentLength: number, responseTime: number) {
        this.initialize();
        const msg = `[AI RESPONSE ${ts()}]`;
        this.outputChannel!.appendLine(msg);
        this.outputChannel!.appendLine(`  Provider: ${provider}`);
        this.outputChannel!.appendLine(`  Status: ${statusCode}`);
        this.outputChannel!.appendLine(`  Content Length: ${contentLength} chars`);
        this.outputChannel!.appendLine(`  Response Time: ${responseTime}ms`);
    }

    static aiRawResponse(content: string) {
        if (!this.debugEnabled) return;
        this.initialize();
        const msg = `[AI RAW RESPONSE ${ts()}]`;
        this.outputChannel!.appendLine(msg);
        this.outputChannel!.appendLine('━'.repeat(50));
        this.outputChannel!.appendLine(content);
        this.outputChannel!.appendLine('━'.repeat(50));
    }

    static aiError(provider: string, error: any) {
        this.initialize();
        const msg = `[AI ERROR ${ts()}]`;
        this.outputChannel!.appendLine(msg);
        this.outputChannel!.appendLine(`  Provider: ${provider}`);
        
        if (error instanceof Error) {
            this.outputChannel!.appendLine(`  Error: ${error.message}`);
            this.outputChannel!.appendLine(`  Stack: ${error.stack || ''}`);
        } else if (error.response) {
            this.outputChannel!.appendLine(`  Status: ${error.response.status}`);
            this.outputChannel!.appendLine(`  StatusText: ${error.response.statusText}`);
            this.outputChannel!.appendLine(`  Data: ${this.stringifyData(error.response.data)}`);
        } else {
            this.outputChannel!.appendLine(this.stringifyData(error));
        }
    }

    static parseAttempt(attempt: number, strategy: string, data?: any) {
        this.initialize();
        const msg = `[PARSE ATTEMPT ${attempt}] ${strategy}`;
        this.outputChannel!.appendLine(msg);
        if (data) this.outputChannel!.appendLine(this.stringifyData(data));
    }

    static parseSuccess(strategy: string, groupsCount: number) {
        this.initialize();
        const msg = `[PARSE SUCCESS ${ts()}] Using: ${strategy}, Groups: ${groupsCount}`;
        this.outputChannel!.appendLine(msg);
    }

    static parseFailure(attempt: number, error: string) {
        this.initialize();
        const msg = `[PARSE FAILED ${ts()}] Attempt ${attempt}: ${error}`;
        this.outputChannel!.appendLine(msg);
    }

    static warn(message: string, data?: any) {
        this.initialize();
        const msg = `[WARN  ${ts()}] ${message}`;
        this.outputChannel!.appendLine(msg);
        if (data) this.outputChannel!.appendLine(this.stringifyData(data));
        console.warn(msg, data ?? '');
    }

    static show() {
        this.initialize();
        this.outputChannel!.show();
    }

    static showDebugInfo() {
        this.initialize();
        this.outputChannel!.appendLine('');
        this.outputChannel!.appendLine('═'.repeat(60));
        this.outputChannel!.appendLine('DEBUG INFO - Git Composer Extension');
        this.outputChannel!.appendLine('═'.repeat(60));
        this.outputChannel!.appendLine(`Debug Mode: ${this.debugEnabled ? 'ENABLED' : 'DISABLED'}`);
        this.outputChannel!.appendLine(`Enable in: Settings > commitComposer.debugMode`);
        this.outputChannel!.appendLine('═'.repeat(60));
        this.outputChannel!.show();
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
}

function ts() {
    return new Date().toISOString();
}
