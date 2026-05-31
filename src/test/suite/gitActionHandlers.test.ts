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
});
