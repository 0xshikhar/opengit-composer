import * as assert from 'assert';
import { createWorkspaceHandlers } from '../../webview/host/handlers/workspaceHandlers';
import { ChangeType } from '../../types/git';

suite('Workspace Handlers Test Suite', () => {
    test('refresh should reload data and reset the current session', async () => {
        const messages: any[] = [];
        const webview = {
            postMessage: async (message: any) => {
                messages.push(message);
            },
        } as any;

        const handlers = createWorkspaceHandlers({
            getOrchestrator: () => ({
                getStagedChanges: async () => ([
                    {
                        path: 'src/app.ts',
                        changeType: ChangeType.Modified,
                        diff: '',
                        additions: 1,
                        deletions: 0,
                    },
                ]),
                getUnstagedChanges: async () => [],
            } as any),
            getConfigLoader: () => ({
                getConfig: () => ({
                    provider: 'openai',
                    model: '',
                    apiKey: '',
                    baseUrl: '',
                    ollamaHost: 'http://localhost:11434',
                    lmStudioHost: 'http://localhost:1234/v1',
                    excludePatterns: [],
                    redactPatterns: [],
                }),
            } as any),
            openComposerPanel: async () => {},
            openWorkspace: async () => {},
            ensureWorkspacePath: async () => '/repo',
        });

        await handlers.refresh?.({ command: 'refresh' } as any, webview);

        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0].command, 'dataLoaded');
        assert.strictEqual(messages[0].data.resetSession, true);
    });
});
