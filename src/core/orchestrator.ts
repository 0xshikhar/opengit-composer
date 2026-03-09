import { GitService } from './git/gitService';
import { CommitSplitter } from './commit/commitSplitter';
import { CommitExecutor, CommitProgress, ProgressCallback } from './commitExecutor';
import { AIProviderFactory } from '../ai/aiProviderFactory';
import { AIProvider, AIProviderConfig } from '../ai/aiProvider';
import { DraftCommit } from '../types/commits';
import { FileChange, RepoContext } from '../types/git';
import { ConfigLoader, ComposerConfig } from './configLoader';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ComposeProviderConfig {
    provider: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    additionalInstructions?: string;
}

/**
 * Orchestrator — coordinates the full pipeline:
 *   getStagedChanges → parseDiff → classifyFiles → splitIntoClusters → generateCommitsWithAI → DraftCommit[]
 */
export class Orchestrator {
    private gitService: GitService;
    private commitSplitter: CommitSplitter;
    private commitExecutor: CommitExecutor;
    private configLoader: ConfigLoader;
    private aiProvider: AIProvider | undefined;

    constructor(gitService: GitService) {
        this.gitService = gitService;
        this.commitSplitter = new CommitSplitter();
        this.commitExecutor = new CommitExecutor(gitService);
        this.configLoader = new ConfigLoader();
    }

    /**
     * Full pipeline: staged changes → draft commits via AI.
     */
    async compose(providerConfig?: ComposeProviderConfig): Promise<{ drafts: DraftCommit[]; reasoning?: string; summary?: string }> {

        // 1. Get staged changes
        const stagedChanges = await this.gitService.getStagedChanges();
        if (stagedChanges.length === 0) {
            throw new Error('No staged changes to compose.');
        }

        Logger.info('Orchestrator: Composing commits', { fileCount: stagedChanges.length });

        // 2. Get repo context
        const context = await this.gitService.getRepoContext();

        // 3. Load config
        const config = this.configLoader.getConfig();

        // 4. If we have an AI provider request, use it for intelligent grouping.
        //    Settings are used as fallback for unset fields.
        if (providerConfig) {
            const resolvedProviderConfig = this.resolveProviderConfig(providerConfig, config);
            return this.composeWithAI(stagedChanges, context, resolvedProviderConfig, config);
        }

        // 5. Fallback: use heuristic splitter only
        return this.composeWithHeuristics(stagedChanges, context, config);
    }

    private resolveProviderConfig(
        providerConfig: ComposeProviderConfig,
        config: ComposerConfig
    ): {
        provider: string;
        apiKey: string;
        model: string;
        baseUrl?: string;
        additionalInstructions?: string;
    } {
        const provider = providerConfig.provider || config.provider;
        const apiKey = providerConfig.apiKey || config.apiKey || '';
        const model =
            providerConfig.model ||
            config.model ||
            AIProviderFactory.getDefaultModel(provider);
        const baseUrl =
            providerConfig.baseUrl ||
            config.baseUrl ||
            (provider === 'ollama' ? config.ollamaHost : undefined);

        if (provider !== 'ollama' && !apiKey) {
            throw new Error(
                `No API key configured for ${provider}. Set commitComposer.apiKey in Settings or enter it in the OpenGit Composer panel.`
            );
        }

        return {
            provider,
            apiKey,
            model,
            baseUrl,
            additionalInstructions: providerConfig.additionalInstructions,
        };
    }

    /**
     * AI-powered composition.
     */
    private async composeWithAI(
        changes: FileChange[],
        context: RepoContext,
        providerConfig: {
            provider: string;
            apiKey: string;
            model: string;
            baseUrl?: string;
            additionalInstructions?: string;
        },
        config: ComposerConfig
    ): Promise<{ drafts: DraftCommit[]; reasoning?: string; summary?: string }> {
        const aiConfig: AIProviderConfig = {
            apiKey: providerConfig.apiKey,
            model: providerConfig.model,
            baseUrl: providerConfig.baseUrl,
        };

        this.aiProvider = AIProviderFactory.create(providerConfig.provider, aiConfig);

        Logger.info('Orchestrator: Analyzing with AI', {
            provider: providerConfig.provider,
            model: providerConfig.model,
        });

        try {
            const result = await this.aiProvider.analyzeChanges(changes, {
                context,
                commitFormat: config.commitFormat,
                maxSubjectLength: config.maxSubjectLength,
                splitThreshold: config.splitThreshold,
                additionalInstructions: providerConfig.additionalInstructions,
            });

            if (result.parserMeta?.usedFallback) {
                Logger.warn('Orchestrator: AI response required parser fallback', {
                    provider: providerConfig.provider,
                    strategy: result.parserMeta.strategy,
                });
            }

            const drafts: DraftCommit[] = result.groups.map(group => ({
                id: group.id || uuidv4(),
                message: group.message,
                description: group.description,
                files: group.files,
                state: 'generated' as const,
                confidence: group.confidence,
                rationale: group.rationale,
                impact: group.impact,
                verificationSteps: group.verificationSteps,
                risks: group.risks,
            }));

            Logger.info('Orchestrator: AI generated drafts', { count: drafts.length });

            return {
                drafts,
                reasoning: result.reasoning,
                summary: result.summary,
            };
        } catch (error) {
            Logger.error('Orchestrator: AI composition failed, falling back to heuristics', error);
            // Fall back to heuristic grouping instead of throwing
            return this.composeWithHeuristics(changes, context, config);
        }
    }

    /**
     * Heuristic-only composition (no AI).
     */
    private composeWithHeuristics(
        changes: FileChange[],
        context: RepoContext,
        config: ComposerConfig
    ): Promise<{ drafts: DraftCommit[]; reasoning?: string; summary?: string }> {
        const clusters = this.commitSplitter.split(changes);

        const drafts: DraftCommit[] = clusters.map(cluster => {
            const scope = cluster.suggestedScope ? `(${cluster.suggestedScope})` : '';
            const fileNames = cluster.files.map(f => f.path.split('/').pop()).join(', ');
            const message = `${cluster.suggestedType}${scope}: update ${fileNames}`;

            return {
                id: uuidv4(),
                message,
                description: undefined,
                files: cluster.files,
                state: 'draft' as const,
                confidence: 60,
                type: cluster.suggestedType,
                scope: cluster.suggestedScope,
            };
        });

        return Promise.resolve({
            drafts,
            reasoning: 'Generated using heuristic file clustering (no AI).',
            summary: `Prepared ${drafts.length} heuristic draft commit${drafts.length === 1 ? '' : 's'}.`,
        });
    }

    /**
     * Execute a single draft commit.
     */
    async commitSingle(draft: DraftCommit): Promise<void> {
        await this.commitExecutor.executeSingle(draft);
    }

    /**
     * Execute all draft commits in sequence.
     */
    async commitAll(
        drafts: DraftCommit[],
        onProgress?: ProgressCallback
    ): Promise<CommitProgress[]> {
        return this.commitExecutor.executeAll(drafts, onProgress);
    }

    /**
     * Get staged changes.
     */
    async getStagedChanges(): Promise<FileChange[]> {
        return this.gitService.getStagedChanges();
    }

    /**
     * Get repo context.
     */
    async getRepoContext(): Promise<RepoContext> {
        return this.gitService.getRepoContext();
    }
}
