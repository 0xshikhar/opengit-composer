import * as assert from 'assert';
import { createGitActionHandlers } from '../../webview/host/handlers/gitActionHandlers';

suite('Git Action Handlers Test Suite', () => {
    test('stages files and refreshes views', async () => {
        const stagedPaths: string[][] = [];
        let refreshed = false;

        const fakeGitService = {
            getWorkspacePath: () => '/fake/workspace',
            stageFiles: async (paths: string[]) => {
                stagedPaths.push(paths);
            },
            unstageFiles: async () => {},
            unstageAll: async () => {},
            showFile: async () => '',
        } as any;

        const handlers = createGitActionHandlers({
            getGitService: () => fakeGitService,
            refreshVisibleViews: async () => {
                refreshed = true;
            },
        });

        await handlers.stageFiles!({ command: 'stageFiles', paths: ['src/app.ts', 'src/util.ts'] } as any, {} as any);

        assert.deepStrictEqual(stagedPaths, [['src/app.ts', 'src/util.ts']]);
        assert.strictEqual(refreshed, true);
    });

    test('unstages files and refreshes views', async () => {
        const unstagedPaths: string[][] = [];
        let refreshed = false;

        const fakeGitService = {
            getWorkspacePath: () => '/fake/workspace',
            stageFiles: async () => {},
            unstageFiles: async (paths: string[]) => {
                unstagedPaths.push(paths);
            },
            unstageAll: async () => {},
            showFile: async () => '',
        } as any;

        const handlers = createGitActionHandlers({
            getGitService: () => fakeGitService,
            refreshVisibleViews: async () => {
                refreshed = true;
            },
        });

        await handlers.unstageFiles!({ command: 'unstageFiles', paths: ['src/app.ts'] } as any, {} as any);

        assert.deepStrictEqual(unstagedPaths, [['src/app.ts']]);
        assert.strictEqual(refreshed, true);
    });

    test('handles stageAll and unstageAll', async () => {
        let stagedAll = false;
        let unstagedAll = false;
        let refreshCount = 0;

        const fakeGitService = {
            getWorkspacePath: () => '/fake/workspace',
            stageFiles: async (paths: string[]) => {
                if (paths.includes('.')) stagedAll = true;
            },
            unstageFiles: async () => {},
            unstageAll: async () => {
                unstagedAll = true;
            },
            showFile: async () => '',
        } as any;

        const handlers = createGitActionHandlers({
            getGitService: () => fakeGitService,
            refreshVisibleViews: async () => {
                refreshCount++;
            },
        });

        await handlers.stageAll!({ command: 'stageAll' } as any, {} as any);
        await handlers.unstageAll!({ command: 'unstageAll' } as any, {} as any);

        assert.strictEqual(stagedAll, true);
        assert.strictEqual(unstagedAll, true);
        assert.strictEqual(refreshCount, 2);
    });

    test('discards files and refreshes views', async () => {
        const discarded: string[][] = [];
        let refreshed = false;

        const fakeGitService = {
            getWorkspacePath: () => '/fake/workspace',
            discardFiles: async (paths: string[]) => {
                discarded.push(paths);
            },
        } as any;

        const handlers = createGitActionHandlers({
            getGitService: () => fakeGitService,
            refreshVisibleViews: async () => {
                refreshed = true;
            },
        });

        await handlers.discardFiles!({ command: 'discardFiles', paths: ['src/temp.ts'] } as any, {} as any);

        assert.deepStrictEqual(discarded, [['src/temp.ts']]);
        assert.strictEqual(refreshed, true);
    });

    test('discards all changes and refreshes views', async () => {
        let discardedAll = false;
        let refreshed = false;

        const fakeGitService = {
            getWorkspacePath: () => '/fake/workspace',
            discardAll: async () => {
                discardedAll = true;
            },
        } as any;

        const handlers = createGitActionHandlers({
            getGitService: () => fakeGitService,
            refreshVisibleViews: async () => {
                refreshed = true;
            },
        });

        await handlers.discardAll!({ command: 'discardAll' } as any, {} as any);

        assert.strictEqual(discardedAll, true);
        assert.strictEqual(refreshed, true);
    });

    test('commits directly with staged files and refreshes', async () => {
        let committedMessage = '';
        let refreshed = false;
        let postedCommand = '';

        const fakeGitService = {
            getWorkspacePath: () => '/fake/workspace',
            getStagedChanges: async () => [{ path: 'test.ts', additions: 1, deletions: 0, changeType: 'modified', diff: '' }],
            createCommit: async (msg: string) => {
                committedMessage = msg;
            },
        } as any;

        const handlers = createGitActionHandlers({
            getGitService: () => fakeGitService,
            refreshVisibleViews: async () => {
                refreshed = true;
            },
        });

        const fakeWebview = {
            postMessage: async (msg: any) => {
                postedCommand = msg.command;
            },
        } as any;

        await handlers.commitDirect!({ command: 'commitDirect', message: 'feat: quick commit' } as any, fakeWebview);

        assert.strictEqual(committedMessage, 'feat: quick commit');
        assert.strictEqual(refreshed, true);
        assert.strictEqual(postedCommand, 'commitAllDone');
    });
});

