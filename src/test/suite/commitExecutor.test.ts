import * as assert from 'assert';

suite('CommitExecutor Test Suite', () => {
    const createMockGit = (overrides: Record<string, any> = {}) => ({
        async getStagedChanges() { return []; },
        async getRepoContext() { return { repoName: 'test', branch: 'main', recentCommits: [], projectType: 'node' }; },
        async getUnstagedChanges() { return []; },
        async stageFiles(_files: string[]) { return Promise.resolve(); },
        async unstageAll() { return Promise.resolve(); },
        async createCommit() { return Promise.resolve(); },
        async getCurrentHead() { return 'abc123'; },
        async snapshotLooseChanges() { return false; },
        async applyLatestStash() { return Promise.resolve(); },
        async dropLatestStash() { return Promise.resolve(); },
        async resetHard() { return Promise.resolve(); },
        ...overrides,
    } as any);

    test('should execute single draft commit', async () => {
        const { CommitExecutor } = require('../../core/commitExecutor');

        const mockGit = createMockGit({
            async createCommit(_message: string, _files: string[]) {
                return Promise.resolve();
            },
        });

        const executor = new CommitExecutor(mockGit);
        
        const draft = {
            id: 'test-1',
            message: 'feat: add new feature',
            files: [
                { path: 'src/app.ts', changeType: 'modified', diff: '', additions: 10, deletions: 2 }
            ],
            state: 'confirmed' as const,
            confidence: 0.9
        };
        
        await executor.executeSingle(draft);
    });

    test('should handle empty drafts array', async () => {
        const { CommitExecutor } = require('../../core/commitExecutor');

        const mockGit = createMockGit();

        const executor = new CommitExecutor(mockGit);
        
        const results = await executor.executeAll([]);
        
        assert.strictEqual(results.length, 0);
    });

    test('should track progress for multiple drafts', async () => {
        const { CommitExecutor } = require('../../core/commitExecutor');

        let progressCalled = false;

        const mockGit = createMockGit();

        const executor = new CommitExecutor(mockGit);
        
        const drafts = [
            {
                id: '1',
                message: 'feat: first',
                files: [{ path: 'a.ts', changeType: 'modified', diff: '', additions: 1, deletions: 0 }],
                state: 'confirmed' as const,
                confidence: 0.9
            },
            {
                id: '2',
                message: 'fix: second',
                files: [{ path: 'b.ts', changeType: 'modified', diff: '', additions: 1, deletions: 0 }],
                state: 'confirmed' as const,
                confidence: 0.85
            }
        ];
        
        await executor.executeAll(drafts, (progress: any) => {
            progressCalled = true;
            assert.ok(progress.current >= 1);
            assert.ok(progress.total === 2);
        });
        
        assert.strictEqual(progressCalled, true);
    });

    test('should roll back the batch when a later draft fails', async () => {
        const { CommitExecutor } = require('../../core/commitExecutor');

        const calls: string[] = [];
        const mockGit = createMockGit({
            async getCurrentHead() {
                calls.push('getCurrentHead');
                return 'abc123';
            },
            async snapshotLooseChanges(label: string) {
                calls.push(`snapshotLooseChanges:${label}`);
                return true;
            },
            async createCommit(message: string) {
                calls.push(`createCommit:${message}`);
                if (message === 'fix: second') {
                    throw new Error('commit failed');
                }
            },
            async resetHard(ref: string) {
                calls.push(`resetHard:${ref}`);
            },
            async applyLatestStash(includeIndex: boolean) {
                calls.push(`applyLatestStash:${includeIndex}`);
            },
            async dropLatestStash() {
                calls.push('dropLatestStash');
            },
        });

        const executor = new CommitExecutor(mockGit);
        const drafts = [
            {
                id: '1',
                message: 'feat: first',
                files: [{ path: 'a.ts', changeType: 'modified', diff: '', additions: 1, deletions: 0 }],
                state: 'confirmed' as const,
                confidence: 0.9
            },
            {
                id: '2',
                message: 'fix: second',
                files: [{ path: 'b.ts', changeType: 'modified', diff: '', additions: 1, deletions: 0 }],
                state: 'confirmed' as const,
                confidence: 0.85
            }
        ];

        await assert.rejects(
            () => executor.executeAll(drafts),
            /commit failed/
        );

        assert.deepStrictEqual(calls, [
            'getCurrentHead',
            'snapshotLooseChanges:OpenGit Composer batch commit (2 drafts)',
            'createCommit:feat: first',
            'createCommit:fix: second',
            'resetHard:abc123',
            'applyLatestStash:true',
            'dropLatestStash',
        ]);
    });
});
