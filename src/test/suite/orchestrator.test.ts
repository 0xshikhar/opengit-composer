import * as assert from 'assert';
import { CommitSplitter } from '../../core/commit/commitSplitter';
import { CommitExecutor } from '../../core/commitExecutor';
import { Orchestrator } from '../../core/orchestrator';
import { ChangeType, FileChange, RepoContext } from '../../types/git';
import { DraftCommit } from '../../types/commits';
import { AIProviderFactory } from '../../ai/aiProviderFactory';

// Minimal in-memory mock for GitService — doesn't import vscode at all
class StubGitService {
    async getStagedChanges(): Promise<FileChange[]> {
        return [
            {
                path: 'src/components/Button.tsx',
                changeType: ChangeType.Modified,
                diff: '--- a/Button.tsx\n+++ b/Button.tsx\n@@ -1,3 +1,4 @@\n line\n-old\n+new',
                additions: 1,
                deletions: 1
            }
        ];
    }

    async getRepoContext(): Promise<RepoContext> {
        return {
            repoName: 'mock-repo',
            branch: 'main',
            recentCommits: ['fix: previous fix'],
            projectType: 'TypeScript'
        };
    }

    // stubs for CommitExecutor
    async stageFiles(_files: string[]): Promise<void> { }
    async createCommit(_message: string, _files: string[]): Promise<void> { }
    async unstageAll(): Promise<void> { }
}

suite('Orchestrator Test Suite', () => {
    test('should produce draft commits via heuristic fallback (no AI)', async () => {
        // Orchestrator.constructor expects a GitService, we use a structural mock
        const mockGit = new StubGitService() as any;
        const orchestrator = new Orchestrator(mockGit);

        // No providerConfig → heuristic fallback
        const result = await orchestrator.compose();

        assert.ok(result.drafts, 'Should return drafts array');
        assert.ok(result.drafts.length > 0, 'Should have at least one draft');

        const draft = result.drafts[0];
        assert.ok(draft.id, 'Draft should have id');
        assert.ok(draft.message, 'Draft should have message');
        assert.ok(draft.files.length > 0, 'Draft should include files');
        assert.strictEqual(draft.state, 'draft', "State should be 'draft'");
        assert.strictEqual(draft.files[0].path, 'src/components/Button.tsx');
    });

    test('should throw when there are no staged changes', async () => {
        const emptyStagedGit = {
            getStagedChanges: async () => [],
            getRepoContext: async () => ({
                repoName: 'mock', branch: 'main', recentCommits: [], projectType: 'node'
            }),
            stageFiles: async () => { },
            createCommit: async () => { },
            unstageAll: async () => { },
        } as any;

        const orchestrator = new Orchestrator(emptyStagedGit);
        await assert.rejects(
            () => orchestrator.compose(),
            /No staged changes/,
            'Should throw when there are no staged changes'
        );
    });

    test('should force multi-draft output when multiple files are staged', async () => {
        const multiFileGit = {
            getStagedChanges: async () => ([
                {
                    path: 'src/components/Button.tsx',
                    changeType: ChangeType.Modified,
                    diff: '--- a/src/components/Button.tsx\n+++ b/src/components/Button.tsx\n@@ -1,1 +1,1 @@\n-old\n+new',
                    additions: 1,
                    deletions: 1,
                },
                {
                    path: 'docs/README.md',
                    changeType: ChangeType.Modified,
                    diff: '--- a/docs/README.md\n+++ b/docs/README.md\n@@ -1,1 +1,1 @@\n-old\n+new',
                    additions: 1,
                    deletions: 1,
                },
            ]),
            getRepoContext: async () => ({
                repoName: 'mock',
                branch: 'main',
                recentCommits: ['chore: baseline'],
                projectType: 'node',
            }),
            getUnstagedChanges: async () => [],
            stageFiles: async () => { },
            createCommit: async () => { },
            unstageAll: async () => { },
        } as any;

        const orchestrator = new Orchestrator(multiFileGit);
        const result = await orchestrator.compose();

        assert.ok(result.drafts.length >= 2, 'Should force at least 2 drafts for multiple staged files');
        assert.ok(
            result.reasoning?.includes('Multi-commit strategy applied'),
            'Reasoning should mention multi-commit strategy'
        );
    });

    test('should normalize duplicate conventional prefixes in AI messages', async () => {
        const multiFileGit = {
            getStagedChanges: async () => ([
                {
                    path: 'src/core/a.ts',
                    changeType: ChangeType.Modified,
                    diff: '--- a/src/core/a.ts\n+++ b/src/core/a.ts\n@@ -1,1 +1,1 @@\n-old\n+new',
                    additions: 1,
                    deletions: 1,
                },
                {
                    path: 'src/core/b.ts',
                    changeType: ChangeType.Modified,
                    diff: '--- a/src/core/b.ts\n+++ b/src/core/b.ts\n@@ -1,1 +1,1 @@\n-old\n+new',
                    additions: 1,
                    deletions: 1,
                },
            ]),
            getRepoContext: async () => ({
                repoName: 'mock',
                branch: 'main',
                recentCommits: ['feat: baseline'],
                projectType: 'node',
            }),
            getUnstagedChanges: async () => [],
            stageFiles: async () => { },
            createCommit: async () => { },
            unstageAll: async () => { },
        } as any;

        const createOriginal = AIProviderFactory.create;
        (AIProviderFactory as any).create = () => ({
            analyzeChanges: async () => ({
                groups: [{
                    id: 'g1',
                    message: 'feat(core): feat(core): improve compose path',
                    files: await multiFileGit.getStagedChanges(),
                    confidence: 90,
                }],
                summary: 'mock',
                reasoning: 'mock',
            }),
            generateCommitMessage: async () => 'feat(core): feat(core): regroup files',
            validateApiKey: async () => true,
        });

        try {
            const orchestrator = new Orchestrator(multiFileGit);
            const result = await orchestrator.compose({
                provider: 'openai',
                apiKey: 'test',
                model: 'mock',
            });
            const subjects = result.drafts.map(draft => draft.message.split('\n')[0]);
            assert.ok(
                subjects.every(subject => !subject.includes('feat(core): feat(core):')),
                'Duplicate conventional prefix should be normalized'
            );
        } finally {
            (AIProviderFactory as any).create = createOriginal;
        }
    });
});
