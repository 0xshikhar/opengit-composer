import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface ComposerConfig {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
    commitFormat: 'conventional' | 'angular' | 'gitmoji' | 'custom';
    maxSubjectLength: number;
    splitThreshold: number;
    contextLines: number;
    includeRecentCommits: boolean;
    recentCommitCount: number;
    ollamaHost: string;
    lmStudioHost: string;
    excludePatterns: string[];
    redactPatterns: string[];
}

const DEFAULT_CONFIG: ComposerConfig = {
    provider: 'openai',
    model: '',
    apiKey: '',
    commitFormat: 'conventional',
    maxSubjectLength: 72,
    splitThreshold: 3,
    contextLines: 5,
    includeRecentCommits: true,
    recentCommitCount: 10,
    ollamaHost: 'http://localhost:11434',
    lmStudioHost: 'http://localhost:1234/v1',
    excludePatterns: [],
    redactPatterns: [],
};

/**
 * Loads configuration from `.gitcomposer.json` (workspace root) and
 * VS Code settings, merging them with defaults.
 * Priority: .gitcomposer.json > VS Code settings > defaults.
 *
 * vscode is imported lazily so this class stays unit-testable without VS Code.
 */
export class ConfigLoader {
    private config: ComposerConfig = { ...DEFAULT_CONFIG };
    private loaded: boolean = false;

    constructor() {
        this.load();
    }

    /**
     * Load and merge config from all sources.
     */
    load(): ComposerConfig {
        // Start with defaults
        this.config = { ...DEFAULT_CONFIG };

        // Layer 1: VS Code settings (only when running inside vscode)
        this.loadVSCodeSettings();

        // Layer 2: .gitcomposer.json (overrides VS Code settings)
        this.loadFileConfig();

        this.loaded = true;
        Logger.info('ConfigLoader: Configuration loaded', {
            provider: this.config.provider,
            model: this.config.model,
            commitFormat: this.config.commitFormat,
        });

        return this.config;
    }

    getConfig(): ComposerConfig {
        if (!this.loaded) {
            this.load();
        }
        return this.config;
    }

    /**
     * Save current config to .gitcomposer.json in workspace root.
     */
    saveToFile(workspacePath?: string): void {
        const rootPath = workspacePath || this.getWorkspacePath();
        if (!rootPath) return;

        const configPath = path.join(rootPath, '.gitcomposer.json');
        const toSave: Partial<ComposerConfig> = { ...this.config };
        // Don't save apiKey to file for security
        delete (toSave as any).apiKey;

        fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), 'utf-8');
        Logger.info('ConfigLoader: Saved config to .gitcomposer.json');
    }

    private getWorkspacePath(): string | undefined {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const vscode = require('vscode');
            return vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        } catch {
            return undefined;
        }
    }

    private loadVSCodeSettings(): void {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const vscode = require('vscode');
            const vsConfig = vscode.workspace.getConfiguration('commitComposer');

            const provider = vsConfig.get('aiProvider') as string | undefined;
            if (provider) this.config.provider = provider;

            const apiKey = vsConfig.get('apiKey') as string | undefined;
            if (apiKey) this.config.apiKey = apiKey;

            const model = vsConfig.get('model') as string | undefined;
            if (model) this.config.model = model;

            const ollamaHost = vsConfig.get('ollamaHost') as string | undefined;
            if (ollamaHost) this.config.ollamaHost = ollamaHost;

            const lmStudioHost = vsConfig.get('lmStudioHost') as string | undefined;
            if (lmStudioHost) this.config.lmStudioHost = lmStudioHost;

            const commitFormat = vsConfig.get('commitFormat') as string | undefined;
            if (commitFormat) this.config.commitFormat = commitFormat as ComposerConfig['commitFormat'];

            const maxSubjectLength = vsConfig.get('maxSubjectLength') as number | undefined;
            if (typeof maxSubjectLength === 'number' && Number.isFinite(maxSubjectLength)) {
                this.config.maxSubjectLength = maxSubjectLength;
            }

            const splitThreshold = vsConfig.get('splitThreshold') as number | undefined;
            if (typeof splitThreshold === 'number' && Number.isFinite(splitThreshold)) {
                this.config.splitThreshold = splitThreshold;
            }

            const excludePatterns = vsConfig.get('excludePatterns') as string[] | undefined;
            if (Array.isArray(excludePatterns)) {
                this.config.excludePatterns = excludePatterns.filter(pattern => typeof pattern === 'string');
            }

            const redactPatterns = vsConfig.get('redactPatterns') as string[] | undefined;
            if (Array.isArray(redactPatterns)) {
                this.config.redactPatterns = redactPatterns.filter(pattern => typeof pattern === 'string');
            }
        } catch {
            // Not in VS Code context (e.g. unit tests) — use defaults
        }
    }

    private loadFileConfig(): void {
        const workspacePath = this.getWorkspacePath() || process.cwd();
        const configPath = path.join(workspacePath, '.gitcomposer.json');
        if (!fs.existsSync(configPath)) return;

        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const fileConfig = JSON.parse(raw);

            if (fileConfig.provider) this.config.provider = fileConfig.provider;
            if (fileConfig.model) this.config.model = fileConfig.model;
            // Never load API keys from file config to avoid accidental plaintext secret persistence.
            if (fileConfig.baseUrl) this.config.baseUrl = fileConfig.baseUrl;
            if (fileConfig.commitFormat) this.config.commitFormat = fileConfig.commitFormat;
            if (fileConfig.maxSubjectLength) this.config.maxSubjectLength = fileConfig.maxSubjectLength;
            if (fileConfig.splitThreshold) this.config.splitThreshold = fileConfig.splitThreshold;
            if (fileConfig.contextLines) this.config.contextLines = fileConfig.contextLines;
            if (fileConfig.includeRecentCommits !== undefined) this.config.includeRecentCommits = fileConfig.includeRecentCommits;
            if (fileConfig.recentCommitCount) this.config.recentCommitCount = fileConfig.recentCommitCount;
            if (fileConfig.ollamaHost) this.config.ollamaHost = fileConfig.ollamaHost;
            if (fileConfig.lmStudioHost) this.config.lmStudioHost = fileConfig.lmStudioHost;
            if (Array.isArray(fileConfig.excludePatterns)) this.config.excludePatterns = fileConfig.excludePatterns;
            if (Array.isArray(fileConfig.redactPatterns)) this.config.redactPatterns = fileConfig.redactPatterns;

            Logger.info('ConfigLoader: Loaded .gitcomposer.json', { configPath });
        } catch (e) {
            Logger.warn('ConfigLoader: Failed to parse .gitcomposer.json', e);
        }
    }
}
