import { CommitGroup } from '../types/commits';
import { FileChange, RepoContext } from '../types/git';

export interface AIProviderConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
}

export interface AIResponse {
    groups: CommitGroup[];
    summary?: string;
    reasoning?: string;
    tokensUsed?: number;
    parserMeta?: {
        usedFallback: boolean;
        strategy: string;
    };
}

export interface AIAnalyzeOptions {
    context?: RepoContext;
    commitFormat?: 'conventional' | 'angular' | 'gitmoji' | 'custom';
    maxSubjectLength?: number;
    splitThreshold?: number;
    additionalInstructions?: string;
}

export abstract class AIProvider {
    protected config: AIProviderConfig;

    constructor(config: AIProviderConfig) {
        this.config = config;
    }

    abstract analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse>;
    abstract generateCommitMessage(files: FileChange[]): Promise<string>;
    abstract validateApiKey(): Promise<boolean>;

    protected abstract makeRequest(prompt: string): Promise<any>;
}
