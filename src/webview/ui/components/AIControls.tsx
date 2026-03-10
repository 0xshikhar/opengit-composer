import React, { useState, useEffect } from 'react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';

const PROVIDERS = [
    { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
    { value: 'anthropic', label: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-3-haiku-20240307'] },
    { value: 'gemini', label: 'Google Gemini', models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'] },
    { value: 'kimi', label: 'Kimi (Moonshot)', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
    { value: 'ollama', label: 'Ollama (Local)', models: [] },
];

export default function AIControls() {
    const { providerConfig, setProviderConfig, isLoading, savedKeys, showKeyInput, setShowKeyInput, ollamaModels, setOllamaModels } = useCommitStore();
    const { loadKeys, saveKey, removeKey, resetKeys, postMessage } = useVSCodeAPI();
    const [newKey, setNewKey] = useState('');
    const [newKeyLabel, setNewKeyLabel] = useState('');

    const selectedProvider = PROVIDERS.find(p => p.value === providerConfig.provider) || PROVIDERS[0];
    const isLocal = providerConfig.provider === 'ollama';
    const keys = savedKeys[providerConfig.provider] || [];
    const hasKeys = keys.length > 0;

    const loadOllamaModels = () => {
        const baseUrl = providerConfig.baseUrl || 'http://localhost:11434';
        postMessage('loadOllamaModels', { baseUrl });
    };

    useEffect(() => {
        loadKeys(providerConfig.provider);
    }, [loadKeys, providerConfig.provider]);

    useEffect(() => {
        if (isLocal) {
            loadOllamaModels();
        } else {
            setOllamaModels([]);
        }
    }, [isLocal, providerConfig.baseUrl, setOllamaModels]);

    const handleProviderChange = (provider: string) => {
        setProviderConfig({ provider, model: '', apiKey: '' });
        setShowKeyInput(false);
        setNewKey('');
        setNewKeyLabel('');
    };

    const handleHostChange = (host: string) => {
        setProviderConfig({ baseUrl: host });
        if (isLocal) {
            loadOllamaModels();
        }
    };

    const handleSaveKey = () => {
        if (!newKey.trim()) return;
        saveKey(providerConfig.provider, newKey.trim(), newKeyLabel.trim() || undefined);
        setNewKey('');
        setNewKeyLabel('');
        setShowKeyInput(false);
    };

    const handleRemoveKey = (index: number) => {
        removeKey(providerConfig.provider, index);
    };

    const handleResetAll = () => {
        if (window.confirm('Are you sure you want to remove all saved API keys for this provider?')) {
            resetKeys(providerConfig.provider);
        }
    };

    return (
        <div className="ai-controls">
            <div className="ai-controls-header">
                <span className="section-label">⚡ AI Provider</span>
            </div>

            <div className="ai-control-row">
                <label className="ai-label">Provider</label>
                <select
                    className="ai-select"
                    value={providerConfig.provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    disabled={isLoading}
                >
                    {PROVIDERS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                </select>
            </div>

            {!isLocal && (
                <>
                    {/* Saved Keys Display */}
                    {hasKeys && !showKeyInput && (
                        <div className="ai-control-row">
                            <label className="ai-label">Saved Keys</label>
                            <div className="saved-keys-list">
                                {keys.map((key, idx) => (
                                    <div key={idx} className="saved-key-item">
                                        <span className="key-masked" title={key.label}>
                                            {key.label}: {key.masked}
                                        </span>
                                        <button
                                            className="btn-remove-key"
                                            onClick={() => handleRemoveKey(idx)}
                                            title="Remove this key"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                                {keys.length > 1 && (
                                    <div className="key-rotation-hint">
                                        🔄 Keys rotate automatically on compose (and on retries)
                                    </div>
                                )}
                            </div>
                            <div className="key-actions">
                                <button
                                    className="btn btn-sm"
                                    onClick={() => setShowKeyInput(true)}
                                >
                                    + Add Key
                                </button>
                                <button
                                    className="btn btn-sm btn-danger"
                                    onClick={handleResetAll}
                                >
                                    Reset All
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Add Key Input */}
                    {showKeyInput && (
                        <div className="ai-control-row key-input-section">
                            <label className="ai-label">Add New Key</label>
                            <input
                                type="password"
                                className="ai-input"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                placeholder="Enter API Key"
                                disabled={isLoading}
                                autoFocus
                            />
                            <input
                                type="text"
                                className="ai-input"
                                value={newKeyLabel}
                                onChange={(e) => setNewKeyLabel(e.target.value)}
                                placeholder="Label (optional, e.g., 'Work')"
                                disabled={isLoading}
                            />
                            <div className="key-input-actions">
                                <button
                                    className="btn btn-sm btn-primary"
                                    onClick={handleSaveKey}
                                    disabled={!newKey.trim() || isLoading}
                                >
                                    Save
                                </button>
                                <button
                                    className="btn btn-sm"
                                    onClick={() => {
                                        setShowKeyInput(false);
                                        setNewKey('');
                                        setNewKeyLabel('');
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* No keys saved - show input */}
                    {!hasKeys && !showKeyInput && (
                        <div className="ai-control-row">
                            <label className="ai-label">API Key</label>
                            <input
                                type="password"
                                className="ai-input"
                                value={providerConfig.apiKey}
                                onChange={(e) => setProviderConfig({ apiKey: e.target.value })}
                                placeholder="Enter API Key"
                                disabled={isLoading}
                            />
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                    if (providerConfig.apiKey) {
                                        saveKey(providerConfig.provider, providerConfig.apiKey.trim(), 'Default');
                                        setProviderConfig({ apiKey: '' }); // Clear field so rotation uses saved key
                                    }
                                }}
                                disabled={isLoading || !providerConfig.apiKey}
                            >
                                Save Key
                            </button>
                        </div>
                    )}
                </>
            )}

            {isLocal && (
                <div className="ai-control-row">
                    <label className="ai-label">Host</label>
                    <input
                        type="text"
                        className="ai-input"
                        value={providerConfig.baseUrl || 'http://localhost:11434'}
                        onChange={(e) => handleHostChange(e.target.value)}
                        placeholder="http://localhost:11434"
                        disabled={isLoading}
                    />
                </div>
            )}

            <div className="ai-control-row">
                <label className="ai-label">Model</label>
                <select
                    className="ai-select"
                    value={providerConfig.model}
                    onChange={(e) => setProviderConfig({ model: e.target.value })}
                    disabled={isLoading}
                >
                    <option value="">Default</option>
                    {(isLocal ? ollamaModels : selectedProvider.models).map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </div>

            <div className="ai-control-row">
                <label className="ai-label">Additional Instructions (Optional)</label>
                <textarea
                    className="ai-input ai-textarea"
                    rows={3}
                    value={providerConfig.additionalInstructions || ''}
                    onChange={(e) => setProviderConfig({ additionalInstructions: e.target.value })}
                    placeholder="Example: prefer separating refactor from behavior changes; mention migrations explicitly."
                    disabled={isLoading}
                />
            </div>
        </div>
    );
}
