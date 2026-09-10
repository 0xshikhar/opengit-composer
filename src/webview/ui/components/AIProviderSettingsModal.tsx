import React, { useState, useEffect } from 'react';
import {
    X,
    Server,
    Cloud,
    Radio,
    Check,
    AlertCircle,
    Plus,
    Trash2,
    RotateCw,
    Shield,
    Sliders,
    CheckCircle2,
    SlidersHorizontal,
    Code,
    CheckCircle,
} from 'lucide-react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';
import {
    getProviderBaseUrl,
    getProviderDisplayName,
    getProviderModelOptions,
    isLocalProvider,
    LocalEndpointConfig,
    modelIdsMatch,
    type ProviderName,
} from '../../../utils/constant';

const CLOUD_PROVIDER_VALUES = ['openai', 'anthropic', 'groq', 'gemini', 'kimi'] as const;

const CLOUD_PROVIDERS = CLOUD_PROVIDER_VALUES.map((value) => ({
    value,
    label: getProviderDisplayName(value),
    models: getProviderModelOptions(value),
}));

export default function AIProviderSettingsModal() {
    const {
        providerConfig,
        setProviderConfig,
        savedKeys,
        showKeyInput,
        setShowKeyInput,
        ollamaModels,
        localEndpoints,
        setLocalEndpoints,
        activeLocalEndpointId,
        setActiveLocalEndpointId,
        isSettingsModalOpen,
        setIsSettingsModalOpen,
        privacyPreview,
        connectionTest,
    } = useCommitStore();

    const {
        loadKeys,
        saveKey,
        removeKey,
        postMessage,
        saveProviderPreference,
        saveLocalEndpoints,
    } = useVSCodeAPI();

    const isCurrentLocal = isLocalProvider(providerConfig.provider);
    const [activeTab, setActiveTab] = useState<'local' | 'cloud' | 'prompt'>(
        isCurrentLocal ? 'local' : 'cloud'
    );
    const [newKey, setNewKey] = useState('');
    const [newKeyLabel, setNewKeyLabel] = useState('');
    const [testingConnection, setTestingConnection] = useState(false);

    // Custom endpoint form state
    const [showAddEndpoint, setShowAddEndpoint] = useState(false);
    const [newEndpointName, setNewEndpointName] = useState('');
    const [newEndpointUrl, setNewEndpointUrl] = useState('');
    const [newEndpointType, setNewEndpointType] = useState<'lmstudio' | 'ollama'>('lmstudio');
    const [newEndpointModel, setNewEndpointModel] = useState('');

    // Sync tab with current provider on open
    useEffect(() => {
        if (isSettingsModalOpen) {
            setActiveTab(isLocalProvider(providerConfig.provider) ? 'local' : 'cloud');
            // Auto fetch models if local
            if (isLocalProvider(providerConfig.provider)) {
                const baseUrl = providerConfig.baseUrl || getProviderBaseUrl(providerConfig.provider) || 'http://localhost:1234/v1';
                postMessage('loadOllamaModels', { provider: providerConfig.provider, baseUrl });
            }
        }
    }, [isSettingsModalOpen, providerConfig.provider, providerConfig.baseUrl, postMessage]);

    // Handle Escape key to close modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isSettingsModalOpen) {
                setIsSettingsModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSettingsModalOpen, setIsSettingsModalOpen]);

    // Load keys when cloud provider changes
    useEffect(() => {
        if (!isLocalProvider(providerConfig.provider)) {
            loadKeys(providerConfig.provider);
        }
    }, [loadKeys, providerConfig.provider]);

    if (!isSettingsModalOpen) {
        return null;
    }

    const keys = savedKeys[providerConfig.provider] || [];
    const hasKeys = keys.length > 0;

    const handleTestConnection = () => {
        setTestingConnection(true);
        postMessage('testProviderConnection', { providerConfig });
        window.setTimeout(() => setTestingConnection(false), 2000);
    };

    const handleCloudProviderChange = (provider: string) => {
        setProviderConfig({
            provider,
            model: '',
            apiKey: '',
            baseUrl: undefined,
        });
        setShowKeyInput(false);
        setNewKey('');
        setNewKeyLabel('');
        saveProviderPreference(provider, '', '');
    };

    const handleSelectLocalEndpoint = (endpoint: LocalEndpointConfig) => {
        setActiveLocalEndpointId(endpoint.id);
        const nextProvider = endpoint.providerType;
        const nextBaseUrl = endpoint.baseUrl;
        const rawModel = endpoint.model || '';
        const isFilePath = /\.(gturbo|gguf|bin|safetensors)$/i.test(rawModel) || rawModel.includes('/') || rawModel.includes('\\');
        const nextModel = isFilePath ? '' : rawModel;

        setProviderConfig({
            provider: nextProvider,
            baseUrl: nextBaseUrl,
            model: nextModel,
        });

        saveProviderPreference(nextProvider, nextModel, nextBaseUrl);

        // Fetch models from the selected local server
        postMessage('loadOllamaModels', {
            provider: nextProvider,
            baseUrl: nextBaseUrl,
        });
    };

    const handleAddCustomEndpoint = () => {
        if (!newEndpointName.trim() || !newEndpointUrl.trim()) return;

        const newEndpoint: LocalEndpointConfig = {
            id: `custom-${Date.now()}`,
            name: newEndpointName.trim(),
            providerType: newEndpointType,
            baseUrl: newEndpointUrl.trim(),
            model: newEndpointModel.trim() || undefined,
            isPreset: false,
        };

        const updated = [...localEndpoints, newEndpoint];
        setLocalEndpoints(updated);
        saveLocalEndpoints(updated);

        // Reset form
        setNewEndpointName('');
        setNewEndpointUrl('');
        setNewEndpointModel('');
        setShowAddEndpoint(false);

        // Switch to the newly created endpoint
        handleSelectLocalEndpoint(newEndpoint);
    };

    const handleDeleteCustomEndpoint = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = localEndpoints.filter((ep) => ep.id !== id);
        setLocalEndpoints(updated);
        saveLocalEndpoints(updated);
        if (activeLocalEndpointId === id && updated.length > 0) {
            handleSelectLocalEndpoint(updated[0]);
        }
    };

    const handleSaveKey = () => {
        if (!newKey.trim()) return;
        saveKey(providerConfig.provider, newKey.trim(), newKeyLabel.trim() || undefined);
        setNewKey('');
        setNewKeyLabel('');
        setShowKeyInput(false);
    };

    const handleRefreshModels = () => {
        if (isCurrentLocal) {
            const baseUrl =
                providerConfig.baseUrl ||
                getProviderBaseUrl(providerConfig.provider) ||
                'http://localhost:1234/v1';
            postMessage('loadOllamaModels', { provider: providerConfig.provider, baseUrl });
        }
    };

    const isTestMatching = connectionTest && connectionTest.provider === providerConfig.provider;
    const isConnOk = isTestMatching && connectionTest.available && connectionTest.modelAvailable;
    const isConnFailed = isTestMatching && (!connectionTest.available || !connectionTest.modelAvailable);

    return (
        <div className="gc-modal-backdrop" onClick={() => setIsSettingsModalOpen(false)}>
            <div
                className="gc-modal-dialog gc-gitlens-settings"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="gc-settings-modal-title"
            >
                {/* Modal Title Bar */}
                <div className="gc-gl-header">
                    <div className="gc-gl-title-row">
                        <span className="gc-gl-title-tag">AI CONFIGURATION</span>
                        <h2 id="gc-settings-modal-title" className="gc-gl-title">
                            OpenGit Composer Settings
                        </h2>
                    </div>
                    <button
                        className="gc-gl-close-btn"
                        onClick={() => setIsSettingsModalOpen(false)}
                        title="Close (Esc)"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Master-Detail Layout */}
                <div className="gc-gl-body">
                    {/* Left Sidebar Navigation */}
                    <nav className="gc-gl-nav">
                        <div className="gc-gl-nav-group-label">PROVIDER TYPE</div>
                        <button
                            type="button"
                            className={`gc-gl-nav-item ${activeTab === 'local' ? 'active' : ''}`}
                            onClick={() => setActiveTab('local')}
                        >
                            <Server size={15} />
                            <div className="gc-gl-nav-text">
                                <span className="gc-gl-nav-title">Local Runtimes</span>
                                <span className="gc-gl-nav-subtitle">TurboFieldfare, LM Studio, Ollama</span>
                            </div>
                        </button>
                        <button
                            type="button"
                            className={`gc-gl-nav-item ${activeTab === 'cloud' ? 'active' : ''}`}
                            onClick={() => setActiveTab('cloud')}
                        >
                            <Cloud size={15} />
                            <div className="gc-gl-nav-text">
                                <span className="gc-gl-nav-title">Cloud Providers</span>
                                <span className="gc-gl-nav-subtitle">OpenAI, Anthropic, Gemini...</span>
                            </div>
                        </button>

                        <div className="gc-gl-nav-group-label" style={{ marginTop: '16px' }}>CONFIGURATION</div>
                        <button
                            type="button"
                            className={`gc-gl-nav-item ${activeTab === 'prompt' ? 'active' : ''}`}
                            onClick={() => setActiveTab('prompt')}
                        >
                            <SlidersHorizontal size={15} />
                            <div className="gc-gl-nav-text">
                                <span className="gc-gl-nav-title">Prompt Rules</span>
                                <span className="gc-gl-nav-subtitle">Instructions & Style</span>
                            </div>
                        </button>
                    </nav>

                    {/* Right Content Pane */}
                    <main className="gc-gl-content">
                        {/* TAB 1: LOCAL RUNTIMES */}
                        {activeTab === 'local' && (
                            <div className="gc-gl-pane">
                                <div className="gc-gl-pane-header">
                                    <h3>Local AI Runtimes</h3>
                                    <p>Connect to local model servers running on your machine or private network.</p>
                                </div>

                                {/* Endpoint Profile List */}
                                <div className="gc-gl-section-title">Select Endpoint Profile</div>
                                <div className="gc-gl-endpoint-list">
                                    {localEndpoints.map((ep) => {
                                        const isSelected =
                                            providerConfig.baseUrl === ep.baseUrl ||
                                            activeLocalEndpointId === ep.id;
                                        return (
                                            <div
                                                key={ep.id}
                                                className={`gc-gl-endpoint-row ${isSelected ? 'selected' : ''}`}
                                                onClick={() => handleSelectLocalEndpoint(ep)}
                                            >
                                                <div className="gc-gl-endpoint-radio">
                                                    <span className={`gc-radio-dot ${isSelected ? 'active' : ''}`} />
                                                </div>
                                                <div className="gc-gl-endpoint-info">
                                                    <div className="gc-gl-endpoint-name-row">
                                                        <span className="gc-gl-endpoint-title">{ep.name}</span>
                                                        {ep.isPreset && <span className="gc-gl-badge">Preset</span>}
                                                        {isSelected && <span className="gc-gl-badge-active">Active</span>}
                                                    </div>
                                                    <div className="gc-gl-endpoint-url-code">{ep.baseUrl}</div>
                                                </div>
                                                {!ep.isPreset && (
                                                    <button
                                                        type="button"
                                                        className="gc-gl-icon-btn-danger"
                                                        onClick={(e) => handleDeleteCustomEndpoint(ep.id, e)}
                                                        title="Delete custom endpoint"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {!showAddEndpoint ? (
                                        <button
                                            type="button"
                                            className="gc-gl-add-btn"
                                            onClick={() => setShowAddEndpoint(true)}
                                        >
                                            <Plus size={14} /> Add Custom Local Endpoint
                                        </button>
                                    ) : (
                                        <div className="gc-gl-form-card">
                                            <div className="gc-gl-form-title">Add Custom Endpoint</div>
                                            <div className="gc-gl-form-row">
                                                <label>Friendly Name</label>
                                                <input
                                                    type="text"
                                                    className="gc-gl-input"
                                                    placeholder="e.g. TurboFieldfare (Port 8080)"
                                                    value={newEndpointName}
                                                    onChange={(e) => setNewEndpointName(e.target.value)}
                                                />
                                            </div>
                                            <div className="gc-gl-form-row">
                                                <label>Base URL</label>
                                                <input
                                                    type="text"
                                                    className="gc-gl-input"
                                                    placeholder="http://127.0.0.1:8080/v1"
                                                    value={newEndpointUrl}
                                                    onChange={(e) => setNewEndpointUrl(e.target.value)}
                                                />
                                            </div>
                                            <div className="gc-gl-form-row">
                                                <label>Server Protocol</label>
                                                <select
                                                    className="gc-gl-select"
                                                    value={newEndpointType}
                                                    onChange={(e) => setNewEndpointType(e.target.value as 'lmstudio' | 'ollama')}
                                                >
                                                    <option value="lmstudio">OpenAI-Compatible (TurboFieldfare, LM Studio, vLLM, llama.cpp)</option>
                                                    <option value="ollama">Ollama Native API</option>
                                                </select>
                                            </div>
                                            <div className="gc-gl-btn-row">
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    onClick={handleAddCustomEndpoint}
                                                    disabled={!newEndpointName.trim() || !newEndpointUrl.trim()}
                                                >
                                                    Save Endpoint
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => setShowAddEndpoint(false)}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Active Endpoint Details Form */}
                                <div className="gc-gl-section-title" style={{ marginTop: '20px' }}>Active Endpoint Settings</div>
                                <div className="gc-gl-form-card">
                                    <div className="gc-gl-form-row">
                                        <div className="gc-gl-label-row">
                                            <label>Server Host URL</label>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm gc-gl-test-btn"
                                                onClick={handleTestConnection}
                                                disabled={testingConnection}
                                            >
                                                {testingConnection ? (
                                                    <><RotateCw size={12} className="gc-spin" /> Verifying...</>
                                                ) : (
                                                    <><Radio size={12} /> Test Connection</>
                                                )}
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            className="gc-gl-input"
                                            value={providerConfig.baseUrl || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setProviderConfig({ baseUrl: val });
                                                saveProviderPreference(providerConfig.provider, providerConfig.model, val);
                                            }}
                                            placeholder="http://127.0.0.1:8080/v1"
                                        />
                                    </div>

                                    <div className="gc-gl-form-row">
                                        <div className="gc-gl-label-row">
                                            <label>Active Model</label>
                                            <button
                                                type="button"
                                                className="gc-gl-icon-refresh"
                                                onClick={handleRefreshModels}
                                                title="Fetch active models from server"
                                            >
                                                <RotateCw size={12} />
                                            </button>
                                        </div>
                                        {ollamaModels.length > 0 ? (
                                            <select
                                                className="gc-gl-select"
                                                value={
                                                    ollamaModels.includes(providerConfig.model)
                                                        ? providerConfig.model
                                                        : (providerConfig.model && ollamaModels.find(m => modelIdsMatch(providerConfig.model, m)))
                                                            ? (ollamaModels.find(m => modelIdsMatch(providerConfig.model, m)) || '')
                                                            : ''
                                                }
                                                onChange={(e) => {
                                                    const model = e.target.value;
                                                    setProviderConfig({ model });
                                                    saveProviderPreference(providerConfig.provider, model, providerConfig.baseUrl || '');
                                                }}
                                            >
                                                <option value="">Use Server Loaded Model ({ollamaModels[0]})</option>
                                                {ollamaModels.map((m) => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                className="gc-gl-input"
                                                placeholder="Leave empty for active loaded model"
                                                value={providerConfig.model}
                                                onChange={(e) => {
                                                    const model = e.target.value;
                                                    setProviderConfig({ model });
                                                    saveProviderPreference(providerConfig.provider, model, providerConfig.baseUrl || '');
                                                }}
                                            />
                                        )}
                                        <span className="gc-gl-hint">
                                            {ollamaModels.length > 0
                                                ? `Server loaded model: "${ollamaModels[0]}"`
                                                : 'Leaving model blank will automatically use the active loaded model.'}
                                        </span>
                                    </div>

                                    {/* Connection Verification Status Callout */}
                                    {isTestMatching && (
                                        <div className={`gc-gl-status-callout ${isConnOk ? 'success' : 'error'}`}>
                                            {isConnOk ? (
                                                <CheckCircle2 size={15} />
                                            ) : (
                                                <AlertCircle size={15} />
                                            )}
                                            <div className="gc-gl-callout-text">
                                                <strong>{isConnOk ? 'Connected and Ready' : 'Connection Check Failed'}</strong>
                                                <p>{connectionTest.message}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TAB 2: CLOUD PROVIDERS */}
                        {activeTab === 'cloud' && (
                            <div className="gc-gl-pane">
                                <div className="gc-gl-pane-header">
                                    <h3>Cloud AI Providers</h3>
                                    <p>Configure hosted foundation model providers and manage authentication credentials.</p>
                                </div>

                                <div className="gc-gl-form-card">
                                    <div className="gc-gl-form-row">
                                        <label>Provider</label>
                                        <select
                                            className="gc-gl-select"
                                            value={isCurrentLocal ? 'openai' : providerConfig.provider}
                                            onChange={(e) => handleCloudProviderChange(e.target.value)}
                                        >
                                            {CLOUD_PROVIDERS.map((p) => (
                                                <option key={p.value} value={p.value}>{p.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="gc-gl-form-row">
                                        <label>Model</label>
                                        <select
                                            className="gc-gl-select"
                                            value={providerConfig.model}
                                            onChange={(e) => {
                                                const model = e.target.value;
                                                setProviderConfig({ model });
                                                saveProviderPreference(providerConfig.provider, model, '');
                                            }}
                                        >
                                            <option value="">Default Recommended Model</option>
                                            {getProviderModelOptions(providerConfig.provider as ProviderName).map((m) => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="gc-gl-form-row">
                                        <div className="gc-gl-label-row">
                                            <label>API Key</label>
                                            {!showKeyInput && (
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => setShowKeyInput(true)}
                                                >
                                                    <Plus size={12} /> Add Key
                                                </button>
                                            )}
                                        </div>

                                        {hasKeys && !showKeyInput && (
                                            <div className="gc-gl-keys-list">
                                                {keys.map((k, index) => (
                                                    <div key={index} className="gc-gl-key-row">
                                                        <div className="gc-gl-key-info">
                                                            <span className="gc-gl-key-label">{k.label}</span>
                                                            <code className="gc-gl-key-masked">{k.masked}</code>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="gc-gl-icon-btn-danger"
                                                            onClick={() => removeKey(providerConfig.provider, index)}
                                                            title="Delete API key"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!hasKeys && !showKeyInput && (
                                            <div className="gc-gl-empty-box">
                                                <span>No API key currently stored for {getProviderDisplayName(providerConfig.provider)}.</span>
                                            </div>
                                        )}

                                        {showKeyInput && (
                                            <div className="gc-gl-add-key-form">
                                                <input
                                                    type="password"
                                                    className="gc-gl-input"
                                                    placeholder="Enter API Key"
                                                    value={newKey}
                                                    onChange={(e) => setNewKey(e.target.value)}
                                                />
                                                <input
                                                    type="text"
                                                    className="gc-gl-input"
                                                    placeholder="Key Name / Label (Optional)"
                                                    value={newKeyLabel}
                                                    onChange={(e) => setNewKeyLabel(e.target.value)}
                                                />
                                                <div className="gc-gl-btn-row">
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        onClick={handleSaveKey}
                                                        disabled={!newKey.trim()}
                                                    >
                                                        Save Securely
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => setShowKeyInput(false)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {privacyPreview && (
                                        <div className="gc-gl-privacy-box">
                                            <Shield size={14} />
                                            <span>
                                                Privacy Guard active: {privacyPreview.excludedCount} files excluded, {privacyPreview.redactedCount} secrets redacted.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TAB 3: PROMPT RULES */}
                        {activeTab === 'prompt' && (
                            <div className="gc-gl-pane">
                                <div className="gc-gl-pane-header">
                                    <h3>Commit Generation Rules</h3>
                                    <p>Customize the prompt instructions provided to the AI model during commit composition.</p>
                                </div>

                                <div className="gc-gl-form-card">
                                    <div className="gc-gl-form-row">
                                        <label>Additional System Instructions</label>
                                        <textarea
                                            className="gc-gl-textarea"
                                            rows={4}
                                            placeholder="e.g. Prefer conventional commits (feat:, fix:), separate refactoring from functional changes, mention Jira issue keys if found in branch name."
                                            value={providerConfig.additionalInstructions || ''}
                                            onChange={(e) => setProviderConfig({ additionalInstructions: e.target.value })}
                                        />
                                        <span className="gc-gl-hint">These instructions will be appended to the AI commit message prompts.</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </div>

                {/* Modal Footer */}
                <div className="gc-gl-footer">
                    <div className="gc-gl-footer-status">
                        <span>Active: <strong>{getProviderDisplayName(providerConfig.provider)}</strong> {providerConfig.model ? `(${providerConfig.model})` : ''}</span>
                    </div>
                    <div className="gc-gl-footer-actions">
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setIsSettingsModalOpen(false)}
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
