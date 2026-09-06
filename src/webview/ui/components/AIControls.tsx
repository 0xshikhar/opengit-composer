import React, { useState } from 'react';
import {
    Server,
    Cloud,
    Radio,
    Check,
    AlertCircle,
    RotateCw,
    Settings,
} from 'lucide-react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';
import {
    getProviderDisplayName,
    isLocalProvider,
} from '../../../utils/constant';

export default function AIControls() {
    const {
        providerConfig,
        isLoading,
        ollamaModels,
        localEndpoints,
        connectionTest,
        setIsSettingsModalOpen,
    } = useCommitStore();
    const { postMessage } = useVSCodeAPI();
    const [testingConnection, setTestingConnection] = useState(false);

    const isLocal = isLocalProvider(providerConfig.provider);

    // Find if the current baseUrl matches one of our local endpoint presets or custom endpoints
    const matchedLocalEndpoint = isLocal
        ? localEndpoints.find(
              (ep) =>
                  ep.baseUrl === providerConfig.baseUrl ||
                  ep.providerType === providerConfig.provider
          )
        : null;

    const displayProviderName = isLocal
        ? matchedLocalEndpoint?.name || (providerConfig.provider === 'lmstudio' ? 'LM Studio' : 'Ollama')
        : getProviderDisplayName(providerConfig.provider);

    const displayModelName =
        providerConfig.model ||
        (isLocal
            ? matchedLocalEndpoint?.model || (ollamaModels[0] ? `Active (${ollamaModels[0]})` : 'Active model')
            : 'Default model');

    const handleTestConnection = (e: React.MouseEvent) => {
        e.stopPropagation();
        setTestingConnection(true);
        postMessage('testProviderConnection', { providerConfig });
        window.setTimeout(() => setTestingConnection(false), 2000);
    };

    const isTestMatching = connectionTest && connectionTest.provider === providerConfig.provider;

    return (
        <div className="gc-provider-compact-bar">
            {/* Left: Clickable Provider Info Pill */}
            <div
                className="gc-provider-info-pill"
                onClick={() => setIsSettingsModalOpen(true)}
                role="button"
                tabIndex={0}
                title="Click to configure AI provider & models"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        setIsSettingsModalOpen(true);
                    }
                }}
            >
                <div className={`gc-provider-type-icon ${isLocal ? 'icon-local' : 'icon-cloud'}`}>
                    {isLocal ? <Server size={14} /> : <Cloud size={14} />}
                </div>
                <div className="gc-provider-text-group">
                    <div className="gc-provider-name-row">
                        <span className="gc-provider-name">{displayProviderName}</span>
                        <span className="gc-provider-category-tag">{isLocal ? 'LOCAL' : 'CLOUD'}</span>
                    </div>
                    <span className="gc-provider-model-sub">{displayModelName}</span>
                </div>
            </div>

            {/* Right: Actions Group (Test Connection Icon + Settings Icon) */}
            <div className="gc-provider-actions-group">
                <button
                    className={`btn-icon gc-test-conn-icon-btn ${
                        testingConnection
                            ? 'testing'
                            : isTestMatching
                            ? connectionTest.available
                                ? 'success'
                                : 'error'
                            : ''
                    }`}
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isLoading || testingConnection}
                    title={
                        testingConnection
                            ? 'Testing connection...'
                            : isTestMatching
                            ? connectionTest.message
                            : 'Test connection to provider'
                    }
                    aria-label="Test connection to provider"
                >
                    {testingConnection ? (
                        <RotateCw size={14} className="gc-spin" />
                    ) : isTestMatching ? (
                        connectionTest.available ? (
                            <Check size={14} className="text-success" />
                        ) : (
                            <AlertCircle size={14} className="text-error" />
                        )
                    ) : (
                        <Radio size={14} />
                    )}
                </button>

                <button
                    className="btn-icon gc-settings-icon-btn"
                    type="button"
                    onClick={() => setIsSettingsModalOpen(true)}
                    title="Configure AI Provider, Models & Keys"
                    aria-label="Open AI Provider settings"
                >
                    <Settings size={15} />
                </button>
            </div>
        </div>
    );
}
