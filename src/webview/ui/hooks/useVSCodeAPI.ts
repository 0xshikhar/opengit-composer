import { useCallback } from 'react';
import { useCommitStore } from '../store/commitStore';
import {
    HostToWebviewMessage,
    isHostToWebviewMessage,
    WebviewToHostCommand,
    WebviewToHostMessage,
} from '../../../types/messages';

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
            postMessage: (msg: any) => console.log('[Mock postMessage]', msg),
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

            if (payload.command === 'diagnostics' && payload.diagnostics) {
                setDiagnostics(payload.diagnostics);
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

    return { postMessage, onMessage, api, loadKeys, saveKey, removeKey, resetKeys, saveProviderPreference };
}
