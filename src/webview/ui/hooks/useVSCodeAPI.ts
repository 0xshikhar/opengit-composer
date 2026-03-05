import { useEffect, useCallback } from 'react';
import { useCommitStore, StoredKeyDisplay } from '../store/commitStore';

interface VSCodeAPI {
    postMessage: (msg: any) => void;
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
    const { setSavedKeys, setOllamaModels } = useCommitStore();

    const postMessage = useCallback((command: string, data?: any) => {
        api.postMessage({ command, ...data });
    }, [api]);

    const onMessage = useCallback((handler: (message: any) => void) => {
        const listener = (event: MessageEvent) => {
            const msg = event.data;
            
            // Handle key management messages automatically
            if (msg.command === 'keysLoaded' && msg.keys) {
                setSavedKeys(msg.provider, msg.keys);
            }
            if (msg.command === 'keySaved' && msg.keys) {
                setSavedKeys(msg.provider, msg.keys);
            }
            if (msg.command === 'keyRemoved' && msg.keys) {
                setSavedKeys(msg.provider, msg.keys);
            }
            if (msg.command === 'keysReset') {
                setSavedKeys(msg.provider, []);
            }
            
            // Handle Ollama models
            if (msg.command === 'ollamaModelsLoaded' && msg.models) {
                setOllamaModels(msg.models);
            }
            
            handler(msg);
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [setSavedKeys, setOllamaModels]);

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

    return { postMessage, onMessage, api, loadKeys, saveKey, removeKey, resetKeys };
}
