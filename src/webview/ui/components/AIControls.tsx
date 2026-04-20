import React, { useState, useEffect } from 'react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';
import { getProviderBaseUrl, getProviderDisplayName, getProviderModelOptions, isLocalProvider, type ProviderName } from '../../../utils/constant';

const PROVIDER_VALUES = ['openai', 'anthropic', 'groq', 'gemini', 'lmstudio', 'kimi', 'ollama'] as const satisfies readonly ProviderName[];

const PROVIDERS: { value: ProviderName; label: string; models: readonly string[] }[] = PROVIDER_VALUES.map((value) => ({
    value,
    label: getProviderDisplayName(value),
    models: getProviderModelOptions(value),
}));

export default function AIControls() {
    const {
        providerConfig,
        setProviderConfig,
        isLoading,
        savedKeys,
        showKeyInput,
        setShowKeyInput,
        ollamaModels,
        setOllamaModels,
        privacyPreview,
        connectionTest,
    } = useCommitStore();
    const { loadKeys, saveKey, removeKey, resetKeys, postMessage, saveProviderPreference } = useVSCodeAPI();
    const [newKey, setNewKey] = useState('');
    const [newKeyLabel, setNewKeyLabel] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);

    const selectedProvider = PROVIDERS.find(p => p.value === providerConfig.provider) || PROVIDERS[0];
    const isLocal = isLocalProvider(providerConfig.provider);
    const keys = savedKeys[providerConfig.provider] || [];
    const hasKeys = keys.length > 0;

    const loadOllamaModels = () => {
        const baseUrl = providerConfig.baseUrl || getProviderBaseUrl(providerConfig.provider) || 'http://localhost:11434';
        postMessage('loadOllamaModels', { provider: providerConfig.provider, baseUrl });
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
    }, [isLocal, providerConfig.provider, providerConfig.baseUrl, setOllamaModels]);

    useEffect(() => {
        if (!isLocal || !providerConfig.model) {
            return;
        }

        const looksHosted = /^(gpt|gemini|claude|moonshot|groq\/)/i.test(providerConfig.model);
        const mismatchedLocalModel = ollamaModels.length > 0 && !ollamaModels.includes(providerConfig.model);

        if (looksHosted || mismatchedLocalModel) {
            setProviderConfig({ model: '' });
            saveProviderPreference(providerConfig.provider, '', providerConfig.baseUrl || '');
        }
    }, [
        isLocal,
        ollamaModels,
        providerConfig.baseUrl,
        providerConfig.model,
        providerConfig.provider,
        saveProviderPreference,
        setProviderConfig,
    ]);

    const handleProviderChange = (provider: string) => {
        const nextBaseUrl = isLocalProvider(provider)
            ? getProviderBaseUrl(provider) || ''
            : '';
        setProviderConfig({
            provider,
            model: '',
            apiKey: '',
            baseUrl: isLocalProvider(provider) ? nextBaseUrl : undefined,
        });
        setShowKeyInput(false);
        setNewKey('');
        setNewKeyLabel('');
        // Save preference immediately when switching provider
        saveProviderPreference(provider, '', nextBaseUrl);
    };

    const handleModelChange = (model: string) => {
        setProviderConfig({ model });
        // Save preference when model changes
        saveProviderPreference(providerConfig.provider, model, providerConfig.baseUrl || '');
    };

    const handleHostChange = (host: string) => {
        setProviderConfig({ baseUrl: host });
        // Save preference when host changes
        saveProviderPreference(providerConfig.provider, providerConfig.model, host);
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

    const handleTestConnection = () => {
        setTestingConnection(true);
        postMessage('testProviderConnection', { providerConfig });
        window.setTimeout(() => setTestingConnection(false), 1500);
    };

    return (
        <div className="ai-controls">
            <div className="ai-controls-header">
                <span className="section-label">⚡ AI Provider</span>
                <button
                    className="btn btn-sm"
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isLoading || testingConnection}
                    title="Validate provider access and model availability"
                >
                    {testingConnection ? 'Testing…' : 'Test Connection'}
                </button>
                <button
                    className="btn btn-icon ai-settings-toggle"
                    type="button"
                    onClick={() => setSettingsOpen(value => !value)}
                    title={settingsOpen ? 'Hide model and key settings' : 'Show model and key settings'}
                    aria-label={settingsOpen ? 'Hide AI provider settings' : 'Show AI provider settings'}
                >
                    ⚙
                </button>
            </div>

            <div className="ai-provider-summary">
                <span className="ai-provider-pill">{selectedProvider.label}</span>
                <span className="ai-provider-meta">
                    {isLocal ? 'Local runtime' : hasKeys ? `Keys configured: ${keys.length}` : 'No keys configured'}
                </span>
                <span className="ai-provider-meta">
                    Model: {providerConfig.model || 'Default'}
                </span>
                {connectionTest && connectionTest.provider === providerConfig.provider && (
                    <span className="ai-provider-meta">
                        Connection: {connectionTest.available ? 'ready' : 'blocked'} • Model: {connectionTest.modelAvailable ? 'available' : 'unavailable'}
                    </span>
                )}
            </div>

            {privacyPreview && (
                <div className="api-key-empty-state">
                    <span className="ai-provider-meta">
                        Privacy preview: {privacyPreview.excludedCount} excluded, {privacyPreview.redactedCount} redacted.
                    </span>
                    {privacyPreview.invalidExcludePatterns.length > 0 && (
                        <span className="ai-provider-meta">
                            Invalid exclude patterns: {privacyPreview.invalidExcludePatterns.join(', ')}
                        </span>
                    )}
                    {privacyPreview.invalidRedactPatterns.length > 0 && (
                        <span className="ai-provider-meta">
                            Invalid redact patterns: {privacyPreview.invalidRedactPatterns.join(', ')}
                        </span>
                    )}
                    {privacyPreview.warnings.length > 0 && (
                        <span className="ai-provider-meta">
                            {privacyPreview.warnings.join(' ')}
                        </span>
                    )}
                </div>
            )}

            {!settingsOpen && (
                <div className="ai-collapsed-note">
                    Use the settings toggle to configure provider keys, model, host, and instructions.
                </div>
            )}

            {settingsOpen && (
                <>
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
                            <label className="ai-label">API Keys</label>
                            <div className="api-key-empty-state">
                                <span className="api-key-hint">{keys.length} keys are securely stored for this provider.</span>
                            </div>
                            <div className="key-actions">
                                <button
                                    className="btn btn-sm"
                                    onClick={() => setShowKeyInput(true)}
                                >
                                    + Add Key
                                </button>
                                {keys.length > 1 && (
                                    <button
                                        className="btn btn-sm"
                                        onClick={() => handleRemoveKey(keys.length - 1)}
                                    >
                                        Remove Last
                                    </button>
                                )}
                                <button className="btn btn-sm btn-danger" onClick={handleResetAll}>Reset All</button>
                            </div>
                            {keys.length > 1 && (
                                <div className="key-rotation-hint">
                                    Keys rotate automatically on compose retries.
                                </div>
                            )}
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
                    {!hasKeys && !showKeyInput && !isLocal && (
                        <div className="ai-control-row">
                            <label className="ai-label">API Key</label>
                            <div className="api-key-empty-state">
                                <span className="api-key-hint">No API key set. Add one above to enable AI compose.</span>
                            </div>
                            <div className="key-actions">
                                <button
                                    className="btn btn-sm btn-primary"
                                    type="button"
                                    onClick={() => setShowKeyInput(true)}
                                >
                                    + Add Key
                                </button>
                            </div>
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
                        value={providerConfig.baseUrl || getProviderBaseUrl(providerConfig.provider) || 'http://localhost:11434'}
                        onChange={(e) => handleHostChange(e.target.value)}
                        placeholder={getProviderBaseUrl(providerConfig.provider) || 'http://localhost:11434'}
                        disabled={isLoading}
                    />
                </div>
            )}

            <div className="ai-control-row">
                <label className="ai-label">Model</label>
                <select
                    className="ai-select"
                    value={providerConfig.model}
                    onChange={(e) => handleModelChange(e.target.value)}
                    disabled={isLoading}
                >
                    <option value="">{isLocal ? 'Active model' : 'Default'}</option>
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
                </>
            )}
        </div>
    );
}
