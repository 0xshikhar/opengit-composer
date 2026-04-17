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
import { applyPrivacyPolicyToChanges } from './privacyPolicy';
import { FileClassifier } from './parser/fileClassifier';
import { describeProviderError } from '../ai/providers/providerUtils';
import { isLocalProvider, resolveProviderHostAndModel } from '../utils/constant';

export interface ComposeProviderConfig {
    provider: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    additionalInstructions?: string;
}

export interface ComposeSnapshot {
    fingerprint: string;
    generatedAt: number;
    fileCount: number;
    paths: string[];
    excludePatterns?: string[];
}

export interface ComposeMeta {
    usedFallback: boolean;
    fallbackReason?: string;
    aiRequestedModel?: string;
    aiUsedModel?: string;
    aiModelFailover?: boolean;
    aiModelFailoverReason?: string;
    aiRequestError?: string;
    aiRequestCode?: string;
    aiRequestStatus?: number;
    excludedFileCount: number;
    redactedMatchCount: number;
    invalidExcludePatterns?: string[];
    invalidRedactPatterns?: string[];
    parserFallbackStrategy?: string;
    parserFallbackDetails?: string;
    parserQualityScore?: number;
}

export interface ComposeResult {
    drafts: DraftCommit[];
    reasoning?: string;
    summary?: string;
    snapshot: ComposeSnapshot;
    meta: ComposeMeta;
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
    async compose(providerConfig?: ComposeProviderConfig): Promise<ComposeResult> {

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
        const privacyResult = applyPrivacyPolicyToChanges(stagedChanges, {
            excludePatterns: config.excludePatterns,
            redactPatterns: config.redactPatterns,
        });
        const eligibleChanges = privacyResult.changes;

        if (eligibleChanges.length === 0) {
            const err = new Error(
                'No staged files eligible for composition after applying exclude patterns.'
            ) as Error & { code?: string };
            err.code = 'ONLY_EXCLUDED_FILES';
            throw err;
        }

        // 4. If we have an AI provider request, use it for intelligent grouping.
        //    Settings are used as fallback for unset fields.
        let composeResult: {
            drafts: DraftCommit[];
            reasoning?: string;
            summary?: string;
            meta?: Pick<
                ComposeMeta,
                | 'usedFallback'
                | 'fallbackReason'
                | 'aiRequestedModel'
                | 'aiUsedModel'
                | 'aiModelFailover'
                | 'aiModelFailoverReason'
                | 'aiRequestError'
                | 'aiRequestCode'
                | 'aiRequestStatus'
                | 'parserFallbackStrategy'
                | 'parserFallbackDetails'
                | 'parserQualityScore'
            >;
        };
        if (providerConfig) {
            const resolvedProviderConfig = this.resolveProviderConfig(providerConfig, config);
            composeResult = await this.composeWithAI(eligibleChanges, context, resolvedProviderConfig, config);
        } else {
            // 5. Fallback: use heuristic splitter only
            composeResult = await this.composeWithHeuristics(eligibleChanges, context, config);
        }

        const multiDraftNormalization = await this.enforceMultiDraftRequirement(
            eligibleChanges,
            composeResult.drafts,
            config
        );
        composeResult.drafts = multiDraftNormalization.drafts;
        if (multiDraftNormalization.applied) {
            const note = `Multi-commit strategy applied (${multiDraftNormalization.strategy}) because ${eligibleChanges.length} files were staged.`;
            composeResult.reasoning = composeResult.reasoning
                ? `${composeResult.reasoning}\n\n${note}`
                : note;
            composeResult.summary = `Prepared ${composeResult.drafts.length} draft commits (${multiDraftNormalization.strategy}).`;
        }

        const snapshot = this.buildComposeSnapshot(eligibleChanges, config.excludePatterns);
        const meta: ComposeMeta = {
            usedFallback: composeResult.meta?.usedFallback ?? false,
            fallbackReason: composeResult.meta?.fallbackReason,
            aiRequestedModel: composeResult.meta?.aiRequestedModel,
            aiUsedModel: composeResult.meta?.aiUsedModel,
            aiModelFailover: composeResult.meta?.aiModelFailover,
            aiModelFailoverReason: composeResult.meta?.aiModelFailoverReason,
            aiRequestError: composeResult.meta?.aiRequestError,
            aiRequestCode: composeResult.meta?.aiRequestCode,
            aiRequestStatus: composeResult.meta?.aiRequestStatus,
            excludedFileCount: privacyResult.excludedPaths.length,
            redactedMatchCount: privacyResult.redactedMatches,
            invalidExcludePatterns: privacyResult.invalidExcludePatterns,
            invalidRedactPatterns: privacyResult.invalidRedactPatterns,
            parserFallbackStrategy: composeResult.meta?.parserFallbackStrategy,
            parserFallbackDetails: composeResult.meta?.parserFallbackDetails,
            parserQualityScore: composeResult.meta?.parserQualityScore,
        };

        return {
            drafts: composeResult.drafts,
            reasoning: composeResult.reasoning,
            summary: composeResult.summary,
            snapshot,
            meta,
        };
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
        const resolved = resolveProviderHostAndModel(
            {
                provider,
                model: config.model,
                baseUrl: config.baseUrl,
                ollamaHost: config.ollamaHost,
                lmStudioHost: config.lmStudioHost,
            },
            AIProviderFactory.getDefaultModel(provider)
        );
        const model = isLocalProvider(provider)
            ? (providerConfig.model || resolved.model)
            : (providerConfig.model || resolved.model);
        const baseUrl = providerConfig.baseUrl || resolved.baseUrl;

        if (!isLocalProvider(provider) && !apiKey) {
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
    ): Promise<{
        drafts: DraftCommit[];
        reasoning?: string;
        summary?: string;
        meta?: Pick<
            ComposeMeta,
            | 'usedFallback'
            | 'fallbackReason'
            | 'aiRequestedModel'
            | 'aiUsedModel'
            | 'aiModelFailover'
            | 'aiModelFailoverReason'
            | 'aiRequestError'
            | 'aiRequestCode'
            | 'aiRequestStatus'
            | 'parserFallbackStrategy'
            | 'parserFallbackDetails'
            | 'parserQualityScore'
        >;
    }> {
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

            const requestMeta = this.aiProvider?.consumeRequestMeta();
            if (requestMeta?.failover) {
                Logger.warn('Orchestrator: AI provider model failover occurred', {
                    provider: providerConfig.provider,
                    requestedModel: requestMeta.requestedModel,
                    usedModel: requestMeta.usedModel,
                    reason: requestMeta.failoverReason,
                });
            }
            const drafts: DraftCommit[] = result.groups.map(group => ({
                id: group.id || uuidv4(),
                message: this.normalizeCommitMessage(group.message),
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
                meta: {
                    usedFallback: result.parserMeta?.usedFallback ?? false,
                    fallbackReason: result.parserMeta?.usedFallback
                        ? `parser:${result.parserMeta.strategy}`
                        : undefined,
                    aiRequestedModel: requestMeta?.requestedModel,
                    aiUsedModel: requestMeta?.usedModel,
                    aiModelFailover: requestMeta?.failover,
                    aiModelFailoverReason: requestMeta?.failoverReason,
                    parserFallbackStrategy: result.parserMeta?.usedFallback ? result.parserMeta.strategy : undefined,
                    parserFallbackDetails: result.parserMeta?.details,
                    parserQualityScore: result.parserMeta?.qualityScore,
                },
            };
        } catch (error) {
            const failure = describeProviderError(error);
            Logger.warn('Orchestrator: AI request failed; falling back to heuristics', {
                provider: providerConfig.provider,
                model: providerConfig.model,
                status: failure.status,
                code: failure.code,
                message: failure.message,
                details: failure.details,
            });
            Logger.error('Orchestrator: AI composition failed, falling back to heuristics', error);
            // Fall back to heuristic grouping instead of throwing
            const heuristicResult = await this.composeWithHeuristics(changes, context, config);
            return {
                ...heuristicResult,
                meta: {
                    usedFallback: true,
                    fallbackReason: 'ai_request_failed',
                    aiRequestedModel: providerConfig.model,
                    aiRequestError: failure.message,
                    aiRequestCode: failure.code,
                    aiRequestStatus: failure.status,
                },
            };
        }
    }

    /**
     * Heuristic-only composition (no AI).
     */
    private composeWithHeuristics(
        changes: FileChange[],
        _context: RepoContext,
        config: ComposerConfig
    ): Promise<{ drafts: DraftCommit[]; reasoning?: string; summary?: string }> {
        const clusters = this.commitSplitter.split(changes);

        const drafts: DraftCommit[] = clusters.map(cluster => {
            const message = this.buildHeuristicCommitMessage(
                cluster.suggestedType,
                cluster.suggestedScope,
                cluster.files.map(file => file.path),
                config.maxSubjectLength
            );

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

    private buildHeuristicCommitMessage(
        type: string,
        scope: string | undefined,
        filePaths: string[],
        maxSubjectLength: number
    ): string {
        const scopedType = scope ? `${type}(${scope})` : type;
        const shortFileNames = filePaths
            .map(path => path.split('/').pop() || path)
            .slice(0, 3)
            .join(', ');
        const overflowCount = Math.max(0, filePaths.length - 3);
        const suffix = overflowCount > 0 ? ` +${overflowCount} more` : '';
        let subject = `${scopedType}: update ${shortFileNames}${suffix}`;

        if (subject.length <= maxSubjectLength) {
            return subject;
        }

        subject = `${scopedType}: update related files`;
        if (subject.length > maxSubjectLength) {
            subject = subject.slice(0, Math.max(0, maxSubjectLength - 3)).trimEnd() + '...';
        }

        const body = ['Files:', ...filePaths.map(filePath => `- ${filePath}`)].join('\n');
        return `${subject}\n\n${body}`;
    }

    private async enforceMultiDraftRequirement(
        changes: FileChange[],
        drafts: DraftCommit[],
        config: ComposerConfig
    ): Promise<{ drafts: DraftCommit[]; applied: boolean; strategy: string }> {
        if (changes.length <= 1) {
            return { drafts, applied: false, strategy: 'single-file-noop' };
        }

        const nonEmptyDrafts = drafts.filter(draft => draft.files.length > 0);
        if (nonEmptyDrafts.length >= 2) {
            return { drafts: nonEmptyDrafts, applied: false, strategy: 'already-multi' };
        }

        const semanticGroups = this.buildSemanticGroups(changes);
        if (semanticGroups.length < 2) {
            semanticGroups.push(...this.splitEvenly(changes, 2).slice(1));
        }

        const semanticDrafts = await Promise.all(
            semanticGroups.map((group, index) => this.createForcedDraft(group.name, group.files, index, config.maxSubjectLength))
        );

        return {
            drafts: semanticDrafts,
            applied: true,
            strategy: this.aiProvider ? 'ai-regrouped' : 'heuristic-regrouped',
        };
    }

    private groupFilesByTopFolder(files: FileChange[]): Map<string, FileChange[]> {
        const groups = new Map<string, FileChange[]>();
        for (const file of files) {
            const key = this.getTopFolder(file.path);
            const existing = groups.get(key) || [];
            existing.push(file);
            groups.set(key, existing);
        }
        return groups;
    }

    private getTopFolder(filePath: string): string {
        const normalized = filePath.replace(/\\/g, '/');
        const [first] = normalized.split('/');
        return first || 'root';
    }

    private createForcedDraft(
        groupName: string,
        files: FileChange[],
        index: number,
        maxSubjectLength: number
    ): Promise<DraftCommit> | DraftCommit {
        let message = this.buildHeuristicCommitMessage(
            'chore',
            groupName !== 'root' ? groupName : undefined,
            files.map(file => file.path),
            maxSubjectLength
        );

        if (this.aiProvider) {
            return this.aiProvider.generateCommitMessage(files)
                .then(aiMessage => {
                    if (aiMessage && aiMessage.trim()) {
                        message = this.normalizeCommitMessage(aiMessage.trim());
                    }
                    return this.buildForcedDraftPayload(groupName, files, index, message, true);
                })
                .catch(() => this.buildForcedDraftPayload(groupName, files, index, message, false));
        }

        return this.buildForcedDraftPayload(groupName, files, index, message, false);
    }

    private normalizeCommitMessage(message: string): string {
        const lines = message.split('\n');
        const subject = lines[0]?.trim() || '';
        lines[0] = this.normalizeConventionalSubject(subject);
        return lines.join('\n').trim();
    }

    private normalizeConventionalSubject(subject: string): string {
        const parsedPrefix = this.parseConventionalPrefix(subject);
        if (!parsedPrefix) {
            return subject;
        }

        let remainder = parsedPrefix.remainder.trimStart();

        while (true) {
            const nestedPrefix = this.parseConventionalPrefix(remainder);
            if (!nestedPrefix) {
                break;
            }

            const sameType = nestedPrefix.type === parsedPrefix.type;
            const sameScope =
                !parsedPrefix.scope ||
                !nestedPrefix.scope ||
                nestedPrefix.scope === parsedPrefix.scope;

            if (!sameType || !sameScope) {
                break;
            }

            remainder = nestedPrefix.remainder.trimStart();
        }

        return remainder ? `${parsedPrefix.prefix} ${remainder}` : parsedPrefix.prefix;
    }

    private parseConventionalPrefix(subject: string): { type: string; scope?: string; prefix: string; remainder: string } | null {
        const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*/i);
        if (!match) {
            return null;
        }

        return {
            type: match[1].toLowerCase(),
            scope: match[2]?.toLowerCase(),
            prefix: match[0].trimEnd(),
            remainder: subject.slice(match[0].length),
        };
    }

    private buildForcedDraftPayload(
        groupName: string,
        files: FileChange[],
        index: number,
        message: string,
        usedAiMessage: boolean
    ): DraftCommit {
        return {
            id: uuidv4(),
            message,
            description: usedAiMessage
                ? 'Auto-generated by AI regrouping pass.'
                : 'Auto-generated by multi-commit safeguard.',
            files,
            state: usedAiMessage ? 'generated' : 'draft',
            confidence: usedAiMessage ? 72 : 55,
            type: 'chore',
            scope: groupName !== 'root' ? groupName : undefined,
            rationale: usedAiMessage
                ? `Commit group ${index + 1} created by AI regrouping pass.`
                : `Commit group ${index + 1} created by multi-commit safeguard.`,
            risks: ['Grouping may differ from ideal semantic intent; review before committing.'],
        };
    }

    private buildSemanticGroups(changes: FileChange[]): Array<{ name: string; files: FileChange[] }> {
        const domainGroups = Array.from(FileClassifier.groupByDomain(changes).entries())
            .map(([domain, classified]) => ({ name: domain, files: classified.map(item => item.file) }))
            .filter(group => group.files.length > 0);

        if (domainGroups.length >= 2) {
            return domainGroups;
        }

        const folderGroups = Array.from(this.groupFilesByTopFolder(changes).entries())
            .map(([folder, files]) => ({ name: folder, files }))
            .filter(group => group.files.length > 0);

        if (folderGroups.length >= 2) {
            return folderGroups;
        }

        return this.splitEvenly(changes, 2);
    }

    private splitEvenly(files: FileChange[], desiredGroups: number): Array<{ name: string; files: FileChange[] }> {
        const groups: Array<{ name: string; files: FileChange[] }> = [];
        const safeGroupCount = Math.min(desiredGroups, files.length);
        if (safeGroupCount <= 1) {
            return [{ name: this.getTopFolder(files[0]?.path || 'root'), files }];
        }

        const chunkSize = Math.ceil(files.length / safeGroupCount);
        for (let i = 0; i < files.length; i += chunkSize) {
            const chunk = files.slice(i, i + chunkSize);
            const chunkName = this.getTopFolder(chunk[0].path);
            groups.push({ name: chunkName, files: chunk });
        }
        return groups;
    }

    private buildComposeSnapshot(changes: FileChange[], excludePatterns?: string[]): ComposeSnapshot {
        const sorted = [...changes].sort((left, right) => left.path.localeCompare(right.path));
        const fingerprint = sorted
            .map(change => `${change.path}|${change.changeType}|${change.additions}|${change.deletions}`)
            .join('\n');

        return {
            fingerprint,
            generatedAt: Date.now(),
            fileCount: sorted.length,
            paths: sorted.map(change => change.path),
            excludePatterns: excludePatterns ? [...excludePatterns] : undefined,
        };
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
     * Get unstaged changes.
     */
    async getUnstagedChanges(): Promise<FileChange[]> {
        return this.gitService.getUnstagedChanges();
    }

    /**
     * Get repo context.
     */
    async getRepoContext(): Promise<RepoContext> {
        return this.gitService.getRepoContext();
    }
}
