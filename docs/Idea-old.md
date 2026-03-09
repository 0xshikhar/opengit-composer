VS Code OpenGit Composer - Detailed Implementation Plan
Project Overview
A VS Code extension that intelligently groups staged changes into logical commits using AI models with user-provided API keys.
Tech Stack

Language: TypeScript
Runtime: Node.js
Framework: VS Code Extension API
Git Integration: simple-git library
AI Integration: Direct API calls (OpenAI, Anthropic, Google, etc.)
UI: VS Code Webview API + React
State Management: Zustand or Context API
Styling: Tailwind CSS or VS Code's Codicons

Project Structure
vscode-commit-composer/
├── src/
│ ├── extension.ts # Entry point
│ ├── commands/
│ │ ├── autoComposeCommits.ts # Main command
│ │ ├── configureAI.ts # AI settings
│ │ └── manualCompose.ts # Manual grouping
│ ├── git/
│ │ ├── gitService.ts # Git operations wrapper
│ │ ├── diffParser.ts # Parse git diffs
│ │ ├── changeAnalyzer.ts # Analyze change patterns
│ │ └── commitExecutor.ts # Execute commits safely
│ ├── ai/
│ │ ├── aiProvider.ts # Abstract AI interface
│ │ ├── providers/
│ │ │ ├── openai.ts
│ │ │ ├── anthropic.ts
│ │ │ ├── google.ts
│ │ │ └── ollama.ts
│ │ ├── promptBuilder.ts # Build AI prompts
│ │ └── responseParser.ts # Parse AI responses
│ ├── grouping/
│ │ ├── commitGrouper.ts # Grouping logic
│ │ ├── heuristics.ts # Pre-AI heuristics
│ │ └── validator.ts # Validate groupings
│ ├── webview/
│ │ ├── CommitComposerPanel.ts # Webview controller
│ │ └── ui/
│ │ ├── App.tsx # React root
│ │ ├── components/
│ │ │ ├── FileList.tsx
│ │ │ ├── CommitGroup.tsx
│ │ │ ├── DiffViewer.tsx
│ │ │ └── AISettings.tsx
│ │ └── styles/
│ │ └── main.css
│ ├── config/
│ │ ├── settings.ts # Extension settings
│ │ └── constants.ts # Constants
│ ├── utils/
│ │ ├── logger.ts # Logging utility
│ │ ├── cache.ts # Response caching
│ │ └── tokenCounter.ts # Token estimation
│ └── types/
│ ├── git.ts # Git-related types
│ ├── ai.ts # AI-related types
│ └── commits.ts # Commit grouping types
├── media/ # Icons, CSS
├── test/
│ ├── suite/
│ │ ├── extension.test.ts
│ │ ├── git.test.ts
│ │ └── ai.test.ts
│ └── fixtures/ # Test data
├── .vscode/
│ ├── launch.json # Debug config
│ └── settings.json
├── package.json # Extension manifest
├── tsconfig.json
├── webpack.config.js # Bundle config
└── README.md
Phase-by-Phase Implementation
Phase 1: Foundation & Git Integration (Week 1-2)
1.1 Project Setup
bash# Initialize project
npm install -g yo generator-code
yo code

# Choose:

# - New Extension (TypeScript)

# - Name: commit-composer

# - Enable webpack: Yes

1.2 Core Dependencies
json{
"dependencies": {
"simple-git": "^3.22.0",
"diff-match-patch": "^1.0.5",
"axios": "^1.6.0",
"uuid": "^9.0.1"
},
"devDependencies": {
"@types/vscode": "^1.85.0",
"@types/node": "^20.10.0",
"@typescript-eslint/eslint-plugin": "^6.15.0",
"@typescript-eslint/parser": "^6.15.0",
"webpack": "^5.89.0",
"webpack-cli": "^5.1.4",
"ts-loader": "^9.5.1"
}
}
1.3 Extension Activation
src/extension.ts
typescriptimport \* as vscode from 'vscode';
import { GitService } from './git/gitService';
import { CommitComposerPanel } from './webview/CommitComposerPanel';

export function activate(context: vscode.ExtensionContext) {
console.log('Commit Composer activated');

    // Initialize services
    const gitService = new GitService();

    // Register commands
    const autoComposeCommand = vscode.commands.registerCommand(
        'commitComposer.autoCompose',
        async () => {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                // Show panel
                CommitComposerPanel.createOrShow(
                    context.extensionUri,
                    gitService
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    context.subscriptions.push(autoComposeCommand);

}

export function deactivate() {}
1.4 Git Service Implementation
src/git/gitService.ts
typescriptimport simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import \* as vscode from 'vscode';
import { FileChange, ChangeType } from '../types/git';

export class GitService {
private git: SimpleGit;

    constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        this.git = simpleGit(workspaceFolder.uri.fsPath);
    }

    async getStagedChanges(): Promise<FileChange[]> {
        const status = await this.git.status();
        const changes: FileChange[] = [];

        for (const file of status.files) {
            if (file.index !== ' ' && file.index !== '?') {
                const diff = await this.getFileDiff(file.path, true);
                changes.push({
                    path: file.path,
                    changeType: this.mapChangeType(file.index),
                    diff: diff,
                    additions: this.countAdditions(diff),
                    deletions: this.countDeletions(diff)
                });
            }
        }

        return changes;
    }

    async getUnstagedChanges(): Promise<FileChange[]> {
        const status = await this.git.status();
        const changes: FileChange[] = [];

        for (const file of status.files) {
            if (file.working_dir !== ' ' && file.working_dir !== '?') {
                const diff = await this.getFileDiff(file.path, false);
                changes.push({
                    path: file.path,
                    changeType: this.mapChangeType(file.working_dir),
                    diff: diff,
                    additions: this.countAdditions(diff),
                    deletions: this.countDeletions(diff)
                });
            }
        }

        return changes;
    }

    async getFileDiff(filePath: string, staged: boolean): Promise<string> {
        const args = staged ? ['--cached'] : [];
        const diff = await this.git.diff([...args, '--', filePath]);
        return diff;
    }

    async stageFiles(files: string[]): Promise<void> {
        await this.git.add(files);
    }

    async unstageFiles(files: string[]): Promise<void> {
        await this.git.reset(['HEAD', '--', ...files]);
    }

    async createCommit(message: string, files: string[]): Promise<void> {
        // Stage only specified files
        await this.unstageAll();
        await this.stageFiles(files);
        await this.git.commit(message);
    }

    async unstageAll(): Promise<void> {
        await this.git.reset(['HEAD']);
    }

    private mapChangeType(gitStatus: string): ChangeType {
        switch (gitStatus) {
            case 'M': return ChangeType.Modified;
            case 'A': return ChangeType.Added;
            case 'D': return ChangeType.Deleted;
            case 'R': return ChangeType.Renamed;
            default: return ChangeType.Modified;
        }
    }

    private countAdditions(diff: string): number {
        return (diff.match(/^\+(?!\+\+)/gm) || []).length;
    }

    private countDeletions(diff: string): number {
        return (diff.match(/^-(?!--)/gm) || []).length;
    }

}
src/types/git.ts
typescriptexport enum ChangeType {
Modified = 'modified',
Added = 'added',
Deleted = 'deleted',
Renamed = 'renamed'
}

export interface FileChange {
path: string;
changeType: ChangeType;
diff: string;
additions: number;
deletions: number;
}

export interface CommitGroup {
id: string;
message: string;
description?: string;
files: FileChange[];
confidence: number;
}
Phase 2: AI Integration (Week 2-3)
2.1 AI Provider Interface
src/ai/aiProvider.ts
typescriptimport { CommitGroup } from '../types/commits';
import { FileChange } from '../types/git';

export interface AIProviderConfig {
apiKey: string;
model: string;
baseUrl?: string;
maxTokens?: number;
temperature?: number;
}

export interface AIResponse {
groups: CommitGroup[];
reasoning?: string;
tokensUsed?: number;
}

export abstract class AIProvider {
protected config: AIProviderConfig;

    constructor(config: AIProviderConfig) {
        this.config = config;
    }

    abstract analyzeChanges(changes: FileChange[]): Promise<AIResponse>;
    abstract generateCommitMessage(files: FileChange[]): Promise<string>;
    abstract validateApiKey(): Promise<boolean>;

    protected abstract makeRequest(prompt: string): Promise<any>;

}
2.2 OpenAI Provider
src/ai/providers/openai.ts
typescriptimport axios from 'axios';
import { AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';

export class OpenAIProvider extends AIProvider {
private readonly endpoint = 'https://api.openai.com/v1/chat/completions';

    constructor(config: AIProviderConfig) {
        super(config);
    }

    async analyzeChanges(changes: FileChange[]): Promise<AIResponse> {
        const prompt = PromptBuilder.buildGroupingPrompt(changes);

        const response = await this.makeRequest(prompt);

        return ResponseParser.parseGroupingResponse(
            response.choices[0].message.content,
            changes
        );
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        const prompt = PromptBuilder.buildMessagePrompt(files);

        const response = await this.makeRequest(prompt);

        return ResponseParser.parseMessageResponse(
            response.choices[0].message.content
        );
    }

    async validateApiKey(): Promise<boolean> {
        try {
            await axios.get('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                timeout: 5000
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const response = await axios.post(
                this.endpoint,
                {
                    model: this.config.model || 'gpt-4-turbo-preview',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert at analyzing code changes and organizing them into logical commits.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: this.config.temperature || 0.3,
                    max_tokens: this.config.maxTokens || 2000,
                    response_format: { type: 'json_object' }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(
                    `OpenAI API Error: ${error.response?.data?.error?.message || error.message}`
                );
            }
            throw error;
        }
    }

}
2.3 Anthropic Provider
src/ai/providers/anthropic.ts
typescriptimport axios from 'axios';
import { AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';

export class AnthropicProvider extends AIProvider {
private readonly endpoint = 'https://api.anthropic.com/v1/messages';

    async analyzeChanges(changes: FileChange[]): Promise<AIResponse> {
        const prompt = PromptBuilder.buildGroupingPrompt(changes);
        const response = await this.makeRequest(prompt);

        return ResponseParser.parseGroupingResponse(
            response.content[0].text,
            changes
        );
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        return ResponseParser.parseMessageResponse(response.content[0].text);
    }

    async validateApiKey(): Promise<boolean> {
        try {
            await this.makeRequest('Test');
            return true;
        } catch (error) {
            return false;
        }
    }

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const response = await axios.post(
                this.endpoint,
                {
                    model: this.config.model || 'claude-sonnet-4-20250514',
                    max_tokens: this.config.maxTokens || 2000,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: this.config.temperature || 0.3
                },
                {
                    headers: {
                        'x-api-key': this.config.apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(
                    `Anthropic API Error: ${error.response?.data?.error?.message || error.message}`
                );
            }
            throw error;
        }
    }

}
2.4 Prompt Builder
src/ai/promptBuilder.ts
typescriptimport { FileChange } from '../types/git';

export class PromptBuilder {
static buildGroupingPrompt(changes: FileChange[]): string {
const filesInfo = changes.map(change => {
// Truncate large diffs to save tokens
const truncatedDiff = this.truncateDiff(change.diff, 100);

            return {
                path: change.path,
                type: change.changeType,
                additions: change.additions,
                deletions: change.deletions,
                diff: truncatedDiff
            };
        });

        return `Analyze these git changes and group them into logical commits.

Files changed:
${JSON.stringify(filesInfo, null, 2)}

Requirements:

1. Group related changes together (e.g., feature files, bug fixes, refactoring)
2. Keep commits focused and atomic
3. Separate unrelated changes
4. Follow conventional commit format
5. Consider file dependencies and relationships

Return a JSON object with this structure:
{
"groups": [
{
"files": ["path1", "path2"],
"type": "feat|fix|refactor|docs|style|test|chore",
"scope": "optional scope",
"subject": "short description",
"body": "detailed explanation (optional)",
"confidence": 0-100
}
],
"reasoning": "Explanation of grouping decisions"
}`;
}

    static buildMessagePrompt(files: FileChange[]): string {
        const filesInfo = files.map(f => ({
            path: f.path,
            type: f.changeType,
            additions: f.additions,
            deletions: f.deletions,
            diff: this.truncateDiff(f.diff, 50)
        }));

        return `Generate a clear, conventional commit message for these changes:

${JSON.stringify(filesInfo, null, 2)}

Format: <type>(<scope>): <subject>

<body>

Where:

- type: feat, fix, refactor, docs, style, test, chore
- scope: optional, affected module/component
- subject: imperative mood, lowercase, no period
- body: optional, explain what and why (not how)

Return only the commit message, no JSON.`;
}

    private static truncateDiff(diff: string, maxLines: number): string {
        const lines = diff.split('\n');
        if (lines.length <= maxLines) {
            return diff;
        }
        return lines.slice(0, maxLines).join('\n') + '\n... (truncated)';
    }

    static estimateTokens(text: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

}
2.5 Response Parser
src/ai/responseParser.ts
typescriptimport { AIResponse } from './aiProvider';
import { CommitGroup } from '../types/commits';
import { FileChange } from '../types/git';
import { v4 as uuidv4 } from 'uuid';

export class ResponseParser {
static parseGroupingResponse(
response: string,
allChanges: FileChange[]
): AIResponse {
try {
// Try to extract JSON from markdown code blocks if present
const jsonMatch = response.match(/`json\s*([\s\S]*?)\s*`/) ||
response.match(/`\s*([\s\S]*?)\s*`/);

            const jsonStr = jsonMatch ? jsonMatch[1] : response;
            const parsed = JSON.parse(jsonStr);

            const groups: CommitGroup[] = parsed.groups.map((group: any) => {
                const files = allChanges.filter(change =>
                    group.files.includes(change.path)
                );

                const message = this.formatConventionalCommit(
                    group.type,
                    group.scope,
                    group.subject,
                    group.body
                );

                return {
                    id: uuidv4(),
                    message: message,
                    description: group.body,
                    files: files,
                    confidence: group.confidence || 80
                };
            });

            return {
                groups,
                reasoning: parsed.reasoning
            };
        } catch (error) {
            throw new Error(
                `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    static parseMessageResponse(response: string): string {
        // Remove markdown code blocks if present
        const cleaned = response
            .replace(/```[\s\S]*?```/g, '')
            .trim();

        return cleaned;
    }

    private static formatConventionalCommit(
        type: string,
        scope: string | undefined,
        subject: string,
        body?: string
    ): string {
        let message = `${type}`;

        if (scope) {
            message += `(${scope})`;
        }

        message += `: ${subject}`;

        if (body) {
            message += `\n\n${body}`;
        }

        return message;
    }

}
Phase 3: Webview UI (Week 3-4)
3.1 Webview Panel Controller
src/webview/CommitComposerPanel.ts
typescriptimport \* as vscode from 'vscode';
import { GitService } from '../git/gitService';
import { AIProviderFactory } from '../ai/aiProviderFactory';
import { CommitGrouper } from '../grouping/commitGrouper';
import { FileChange } from '../types/git';
import { CommitGroup } from '../types/commits';

export class CommitComposerPanel {
public static currentPanel: CommitComposerPanel | undefined;
private readonly \_panel: vscode.WebviewPanel;
private readonly \_extensionUri: vscode.Uri;
private \_disposables: vscode.Disposable[] = [];
private gitService: GitService;
private grouper: CommitGrouper;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gitService: GitService
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.gitService = gitService;
        this.grouper = new CommitGrouper();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview();
        this._setWebviewMessageListener();

        // Load initial data
        this.loadChanges();
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        gitService: GitService
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (CommitComposerPanel.currentPanel) {
            CommitComposerPanel.currentPanel._panel.reveal(column);
            CommitComposerPanel.currentPanel.loadChanges();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'commitComposer',
            'Commit Composer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out')
                ]
            }
        );

        CommitComposerPanel.currentPanel = new CommitComposerPanel(
            panel,
            extensionUri,
            gitService
        );
    }

    private async loadChanges() {
        try {
            const stagedChanges = await this.gitService.getStagedChanges();
            const unstagedChanges = await this.gitService.getUnstagedChanges();

            this._panel.webview.postMessage({
                type: 'changesLoaded',
                stagedChanges,
                unstagedChanges
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Failed to load changes'
            });
        }
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'autoCompose':
                        await this.handleAutoCompose(message.changes);
                        break;
                    case 'createCommit':
                        await this.handleCreateCommit(message.group);
                        break;
                    case 'stageFiles':
                        await this.handleStageFiles(message.files);
                        break;
                    case 'unstageFiles':
                        await this.handleUnstageFiles(message.files);
                        break;
                    case 'generateMessage':
                        await this.handleGenerateMessage(message.files);
                        break;
                    case 'refresh':
                        await this.loadChanges();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async handleAutoCompose(changes: FileChange[]) {
        try {
            this._panel.webview.postMessage({ type: 'composing', status: 'started' });

            const config = vscode.workspace.getConfiguration('commitComposer');
            const provider = AIProviderFactory.create(config);

            const result = await provider.analyzeChanges(changes);

            this._panel.webview.postMessage({
                type: 'composing',
                status: 'completed',
                groups: result.groups,
                reasoning: result.reasoning
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Auto-compose failed'
            });
        }
    }

    private async handleCreateCommit(group: CommitGroup) {
        try {
            const filePaths = group.files.map(f => f.path);
            await this.gitService.createCommit(group.message, filePaths);

            vscode.window.showInformationMessage('Commit created successfully');
            await this.loadChanges();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to create commit: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private async handleStageFiles(files: string[]) {
        try {
            await this.gitService.stageFiles(files);
            await this.loadChanges();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stage files: ${error}`);
        }
    }

    private async handleUnstageFiles(files: string[]) {
        try {
            await this.gitService.unstageFiles(files);
            await this.loadChanges();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to unstage files: ${error}`);
        }
    }

    private async handleGenerateMessage(files: FileChange[]) {
        try {
            const config = vscode.workspace.getConfiguration('commitComposer');
            const provider = AIProviderFactory.create(config);

            const message = await provider.generateCommitMessage(files);

            this._panel.webview.postMessage({
                type: 'messageGenerated',
                message
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Message generation failed'
            });
        }
    }

    private _getHtmlForWebview(): string {
        const scriptUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview.js')
        );
        const styleUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>

<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Commit Composer</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    public dispose() {
        CommitComposerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

}

function getNonce() {
let text = '';
const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
for (let i = 0; i < 32; i++) {
text += possible.charAt(Math.floor(Math.random() \* possible.length));
}
return text;
}
3.2 React UI Setup
src/webview/ui/App.tsx
typescriptimport React, { useState, useEffect } from 'react';
import { FileList } from './components/FileList';
import { CommitGroup } from './components/CommitGroup';
import { AISettings } from './components/AISettings';
import { FileChange, CommitGroup as CommitGroupType } from '../../types';

const vscode = acquireVsCodeApi();

export const App: React.FC = () => {
const [stagedChanges, setStagedChanges] = useState<FileChange[]>([]);
const [unstagedChanges, setUnstagedChanges] = useState<FileChange[]>([]);
const [commitGroups, setCommitGroups] = useState<CommitGroupType[]>([]);
const [isComposing, setIsComposing] = useState(false);
const [reasoning, setReasoning] = useState<string>('');
const [selectedTab, setSelectedTab] = useState<'staged' | 'unstaged'>('staged');

    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data;

            switch (message.type) {
                case 'changesLoaded':
                    setStagedChanges(message.stagedChanges);
                    setUnstagedChanges(message.unstagedChanges);
                    break;
                case 'composing':
                    if (message.status === 'started') {
                        setIsComposing(true);
                        setCommitGroups([]);
                    } else if (message.status === 'completed') {
                        setIsComposing(false);
                        setCommitGroups(message.groups);
                        setReasoning(message.reasoning);
                    }
                    break;
                case 'error':
                    setIsComposing(false);
                    alert(message.message);
                    break;
            }This response paused because Claude reached its max length for a message. Hit continue to nudge Claude along.Continue
