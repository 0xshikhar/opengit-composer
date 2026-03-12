import * as assert from 'assert';

suite('CommitExecutor Test Suite', () => {
    test('should execute single draft commit', async () => {
        const { CommitExecutor } = require('../../core/commitExecutor');
        
        const mockGit = {
            async getStagedChanges() { return []; },
            async getRepoContext() { return { repoName: 'test', branch: 'main', recentCommits: [], projectType: 'node' }; },
            async getUnstagedChanges() { return []; },
            async stageFiles(_files: string[]) { return Promise.resolve(); },
            async unstageAll() { return Promise.resolve(); },
            async createCommit(message: string, files: string[]) { 
                return Promise.resolve();
            },
        } as any;
        
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
        
        const mockGit = {
            async getStagedChanges() { return []; },
            async getRepoContext() { return { repoName: 'test', branch: 'main', recentCommits: [], projectType: 'node' }; },
            async getUnstagedChanges() { return []; },
            async stageFiles(_files: string[]) { return Promise.resolve(); },
            async unstageAll() { return Promise.resolve(); },
            async createCommit() { return Promise.resolve(); },
        } as any;
        
        const executor = new CommitExecutor(mockGit);
        
        const results = await executor.executeAll([]);
        
        assert.strictEqual(results.length, 0);
    });

    test('should track progress for multiple drafts', async () => {
        const { CommitExecutor } = require('../../core/commitExecutor');
        
        let progressCalled = false;
        
        const mockGit = {
            async getStagedChanges() { return []; },
            async getRepoContext() { return { repoName: 'test', branch: 'main', recentCommits: [], projectType: 'node' }; },
            async getUnstagedChanges() { return []; },
            async stageFiles(_files: string[]) { return Promise.resolve(); },
            async unstageAll() { return Promise.resolve(); },
            async createCommit() { return Promise.resolve(); },
        } as any;
        
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
});