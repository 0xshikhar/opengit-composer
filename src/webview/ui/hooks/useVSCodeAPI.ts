import { useCallback } from 'react';
import { useCommitStore } from '../store/commitStore';
import {
    HostToWebviewMessage,
    isHostToWebviewMessage,
    WebviewToHostCommand,
    WebviewToHostMessage,
} from '../../../types/messages';
import { DEFAULT_LOCAL_ENDPOINTS, LocalEndpointConfig } from '../../../utils/constant';

interface VSCodeAPI {
    postMessage: (msg: WebviewToHostMessage) => void;
    getState: () => any;
    setState: (state: any) => void;
}

let vscodeApi: VSCodeAPI | null = null;

function getVSCodeAPI(): VSCodeAPI {
    if (vscodeApi) return vscodeApi;

    if ((window as any).acquireVsCodeApi) {
        vscodeApi = (window as any).acquireVsCodeApi();
    } else {
        // Mock for development
        vscodeApi = {
            postMessage: (_msg: WebviewToHostMessage) => console.log('[Mock postMessage]'),
            getState: () => ({}),
            setState: () => { },
        };
    }

    return vscodeApi!;
}

/**
 * Hook to communicate with the VS Code extension host.
 */
export function useVSCodeAPI() {
    const api = getVSCodeAPI();
    const { setSavedKeys, setOllamaModels, setPrivacyPreview, setConnectionTest, setDiagnostics } = useCommitStore();

    const postMessage = useCallback((command: WebviewToHostCommand, data?: Record<string, unknown>) => {
        api.postMessage({ command, ...(data || {}) });
    }, [api]);

    const onMessage = useCallback((handler: (message: HostToWebviewMessage) => void) => {
        const listener = (event: MessageEvent) => {
            const msg = event.data;
            if (!isHostToWebviewMessage(msg)) {
                return;
            }
            const payload = msg as HostToWebviewMessage & Record<string, any>;

            // Handle key management messages automatically
            if (payload.command === 'keysLoaded' && payload.keys) {
                setSavedKeys(payload.provider, payload.keys);
            }
            if (payload.command === 'keySaved' && payload.keys) {
                setSavedKeys(payload.provider, payload.keys);
            }
            if (payload.command === 'keyRemoved' && payload.keys) {
                setSavedKeys(payload.provider, payload.keys);
            }
            if (payload.command === 'keysReset') {
                setSavedKeys(payload.provider, []);
            }

            // Handle Ollama models
            if (payload.command === 'ollamaModelsLoaded' && payload.models) {
                setOllamaModels(payload.models);
            }

            if (payload.command === 'privacyPreviewLoaded' && payload.preview) {
                setPrivacyPreview(payload.preview);
            }

            if (payload.command === 'connectionTested' && payload.result) {
                setConnectionTest(payload.result);
            }

            if (payload.command === 'quickCommitGenerating') {
                useCommitStore.getState().setIsGeneratingQuickCommit(true);
            }

            if (payload.command === 'quickCommitMessageGenerated' && typeof payload.message === 'string') {
                useCommitStore.getState().setQuickCommitMessage(payload.message);
                useCommitStore.getState().setIsGeneratingQuickCommit(false);
            }

            if (payload.command === 'diagnostics' && payload.diagnostics) {
                setDiagnostics(payload.diagnostics);
            }

            if (payload.command === 'localEndpointsLoaded' && Array.isArray(payload.endpoints)) {
                const custom = payload.endpoints as LocalEndpointConfig[];
                const merged = [
                    ...DEFAULT_LOCAL_ENDPOINTS,
                    ...custom.filter(c => !DEFAULT_LOCAL_ENDPOINTS.some(d => d.id === c.id))
                ];
                useCommitStore.getState().setLocalEndpoints(merged);
            }

            if (payload.command === 'dataLoaded' && Array.isArray(payload.data?.customLocalEndpoints)) {
                const custom = payload.data.customLocalEndpoints as LocalEndpointConfig[];
                const merged = [
                    ...DEFAULT_LOCAL_ENDPOINTS,
                    ...custom.filter(c => !DEFAULT_LOCAL_ENDPOINTS.some(d => d.id === c.id))
                ];
                useCommitStore.getState().setLocalEndpoints(merged);
            }

            handler(payload);
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [setSavedKeys, setOllamaModels, setPrivacyPreview, setConnectionTest, setDiagnostics]);

    // Helper functions for key management
    const loadKeys = useCallback((provider: string) => {
        postMessage('loadKeys', { provider });
    }, [postMessage]);

    const saveKey = useCallback((provider: string, key: string, label?: string) => {
        postMessage('saveKey', { provider, key, label });
    }, [postMessage]);

    const removeKey = useCallback((provider: string, keyIndex: number) => {
        postMessage('removeKey', { provider, keyIndex });
    }, [postMessage]);

    const resetKeys = useCallback((provider: string) => {
        postMessage('resetKeys', { provider });
    }, [postMessage]);

    const saveProviderPreference = useCallback((provider: string, model: string, baseUrl: string) => {
        postMessage('saveProviderPreference', { provider, model, baseUrl });
    }, [postMessage]);

    const saveLocalEndpoints = useCallback((endpoints: LocalEndpointConfig[]) => {
        const customOnly = endpoints.filter(e => !e.isPreset);
        postMessage('saveLocalEndpoints', { endpoints: customOnly });
    }, [postMessage]);

    return { postMessage, onMessage, api, loadKeys, saveKey, removeKey, resetKeys, saveProviderPreference, saveLocalEndpoints };
}
