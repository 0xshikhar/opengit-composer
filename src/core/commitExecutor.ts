import { GitService } from './git/gitService';
import { DraftCommit } from '../types/commits';
import { Logger } from '../utils/logger';

export interface CommitProgress {
    current: number;
    total: number;
    message: string;
    success: boolean;
    error?: string;
}

export type ProgressCallback = (progress: CommitProgress) => void;

/**
 * Executes commits atomically — commits only the staged changes for the
 * files assigned to each draft, leaving any other staged changes intact.
 */
export class CommitExecutor {
    private gitService: GitService;

    constructor(gitService: GitService) {
        this.gitService = gitService;
    }

    /**
     * Execute a single draft commit.
     */
    async executeSingle(draft: DraftCommit): Promise<void> {
        const filePaths = draft.files.map(f => f.path);
        await this.gitService.createCommit(draft.message, filePaths);
    }

    /**
     * Execute multiple draft commits in sequence and roll back cleanly if any
     * commit fails partway through the batch.
     */
    async executeAll(
        drafts: DraftCommit[],
        onProgress?: ProgressCallback
    ): Promise<CommitProgress[]> {
        if (drafts.length === 0) {
            return [];
        }

        const results: CommitProgress[] = [];
        const batchLabel = `OpenGit Composer batch commit (${drafts.length} drafts)`;
        const originalHead = await this.gitService.getCurrentHead();
        const stashedLooseChanges = await this.gitService.snapshotLooseChanges(batchLabel);
        let failure: Error | undefined;
        let cleanupError: unknown;

        try {
            for (let i = 0; i < drafts.length; i++) {
                const draft = drafts[i];
                const progress: CommitProgress = {
                    current: i + 1,
                    total: drafts.length,
                    message: draft.message,
                    success: false,
                };

                try {
                    Logger.info(`CommitExecutor: Executing commit ${i + 1}/${drafts.length}`, {
                        message: draft.message,
                        files: draft.files.map(f => f.path),
                    });

                    // Commit only the staged changes for this draft's files.
                    // This preserves any other staged changes, enabling true "atomic" commit sequences
                    // without destroying partial staging.
                    await this.gitService.createCommit(draft.message, draft.files.map(f => f.path));

                    progress.success = true;
                    Logger.info(`CommitExecutor: Commit ${i + 1} succeeded`);
                } catch (error) {
                    progress.error = error instanceof Error ? error.message : 'Unknown error';
                    failure = error instanceof Error ? error : new Error(progress.error);
                    Logger.error(`CommitExecutor: Commit ${i + 1} failed`, error);
                    results.push(progress);
                    onProgress?.(progress);
                    break;
                }

                results.push(progress);
                onProgress?.(progress);
            }
        } finally {
            if (failure) {
                try {
                    await this.gitService.resetHard(originalHead);
                    if (stashedLooseChanges) {
                        await this.gitService.applyLatestStash(stashedLooseChanges, true);
                        await this.gitService.dropLatestStash(stashedLooseChanges);
                    }
                } catch (rollbackError) {
                    Logger.error('CommitExecutor: Failed to roll back batch commit', rollbackError);
                    cleanupError = rollbackError;
                }
            } else if (stashedLooseChanges) {
                try {
                    await this.gitService.applyLatestStash(stashedLooseChanges, false);
                    await this.gitService.dropLatestStash(stashedLooseChanges);
                } catch (restoreError) {
                    Logger.error('CommitExecutor: Failed to restore unstaged changes after batch commit', restoreError);
                    cleanupError = restoreError;
                }
            }
        }

        if (cleanupError) {
            throw cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
        }

        if (failure) {
            throw failure;
        }

        return results;
    }
}
