import * as assert from 'assert';
import { createWebviewCommandRouter, WebviewCommandRegistrySet } from '../../webview/host/webviewCommandRouter';

suite('Webview Command Router Test Suite', () => {
    test('routes commands to the compose registry', async () => {
        const calls: string[] = [];
        const router = createWebviewCommandRouter(
            {
                getOrchestrator: () => ({} as any),
                getConfigLoader: () => ({} as any),
                getCommitExecutor: () => ({} as any),
                openComposerPanel: async () => {},
                openWorkspace: async () => {},
                refreshVisibleViews: async () => {},
            },
            {
                registries: {
                    compose: {
                        loadData: async () => { calls.push('compose:loadData'); },
                        compose: async () => { calls.push('compose:compose'); },
                    },
                    commit: {},
                    providerHealth: {},
                    workspace: {},
                } satisfies Partial<WebviewCommandRegistrySet>,
            }
        );

        await router({ command: 'loadData' } as any, {} as any);
        await router({ command: 'compose' } as any, {} as any);

        assert.deepStrictEqual(calls, ['compose:loadData', 'compose:compose']);
    });

    test('routes commands to the commit registry', async () => {
        const calls: string[] = [];
        const router = createWebviewCommandRouter(
            {
                getOrchestrator: () => ({} as any),
                getConfigLoader: () => ({} as any),
                getCommitExecutor: () => ({} as any),
                openComposerPanel: async () => {},
                openWorkspace: async () => {},
                refreshVisibleViews: async () => {},
            },
            {
                registries: {
                    compose: {},
                    commit: {
                        commitSingle: async () => { calls.push('commit:single'); },
                        commitAll: async () => { calls.push('commit:all'); },
                    },
                    providerHealth: {},
                    workspace: {},
                } satisfies Partial<WebviewCommandRegistrySet>,
            }
        );

        await router({ command: 'commitSingle' } as any, {} as any);
        await router({ command: 'commitAll' } as any, {} as any);

        assert.deepStrictEqual(calls, ['commit:single', 'commit:all']);
    });

    test('routes commands to the provider-health registry', async () => {
        const calls: string[] = [];
        const router = createWebviewCommandRouter(
            {
                getOrchestrator: () => ({} as any),
                getConfigLoader: () => ({} as any),
                getCommitExecutor: () => ({} as any),
                openComposerPanel: async () => {},
                openWorkspace: async () => {},
                refreshVisibleViews: async () => {},
            },
            {
                registries: {
                    compose: {},
                    commit: {},
                    providerHealth: {
                        loadKeys: async () => { calls.push('provider:loadKeys'); },
                        saveKey: async () => { calls.push('provider:saveKey'); },
                    },
                    workspace: {},
                } satisfies Partial<WebviewCommandRegistrySet>,
            }
        );

        await router({ command: 'loadKeys' } as any, {} as any);
        await router({ command: 'saveKey' } as any, {} as any);

        assert.deepStrictEqual(calls, ['provider:loadKeys', 'provider:saveKey']);
    });

    test('routes commands to the workspace registry', async () => {
        const calls: string[] = [];
        const router = createWebviewCommandRouter(
            {
                getOrchestrator: () => ({} as any),
                getConfigLoader: () => ({} as any),
                getCommitExecutor: () => ({} as any),
                openComposerPanel: async () => {},
                openWorkspace: async () => {},
                refreshVisibleViews: async () => {},
            },
            {
                registries: {
                    compose: {},
                    commit: {},
                    providerHealth: {},
                    workspace: {
                        refresh: async () => { calls.push('workspace:refresh'); },
                        openComposerPanel: async () => { calls.push('workspace:openComposerPanel'); },
                        openWorkspace: async () => { calls.push('workspace:openWorkspace'); },
                    },
                } satisfies Partial<WebviewCommandRegistrySet>,
            }
        );

        await router({ command: 'refresh' } as any, {} as any);
        await router({ command: 'openComposerPanel' } as any, {} as any);
        await router({ command: 'openWorkspace' } as any, {} as any);

        assert.deepStrictEqual(calls, ['workspace:refresh', 'workspace:openComposerPanel', 'workspace:openWorkspace']);
    });

    test('ignores unknown commands', async () => {
        const calls: string[] = [];
        const router = createWebviewCommandRouter(
            {
                getOrchestrator: () => ({} as any),
                getConfigLoader: () => ({} as any),
                getCommitExecutor: () => ({} as any),
                openComposerPanel: async () => {},
                openWorkspace: async () => {},
                refreshVisibleViews: async () => {},
            },
            {
                registries: {
                    compose: { loadData: async () => { calls.push('compose:loadData'); } },
                    commit: {},
                    providerHealth: {},
                    workspace: {},
                } satisfies Partial<WebviewCommandRegistrySet>,
            }
        );

        await router({ command: 'doesNotExist' } as any, {} as any);

        assert.deepStrictEqual(calls, []);
    });
});
