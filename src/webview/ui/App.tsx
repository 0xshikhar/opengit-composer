import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCommitStore } from './store/commitStore';
import { useVSCodeAPI } from './hooks/useVSCodeAPI';
import { HostToWebviewMessage } from '../../types/messages';
import AIControls from './components/AIControls';
import FileList from './components/FileList';
import CommitTree from './components/CommitTree';
import DiffViewer from './components/DiffViewer';
import CommitEditor from './components/CommitEditor';
import ComposeWorkspace from './components/ComposeWorkspace';
import StatusBar from './components/StatusBar';
import './index.css';

type BootstrapPayload = {
    mode?: 'sidebar' | 'panel';
    autoCompose?: boolean;
    providerConfig?: Partial<ReturnType<typeof useCommitStore.getState>['providerConfig']>;
    logoUri?: string;
};

function readBootstrapPayload(): BootstrapPayload {
    const payload = (window as unknown as { __OPENGIT_BOOTSTRAP__?: BootstrapPayload }).__OPENGIT_BOOTSTRAP__;
    return payload || { mode: 'sidebar', autoCompose: false };
}

export default function App() {
    const bootstrap = useMemo(readBootstrapPayload, []);
    const isPanelMode = bootstrap.mode === 'panel';
    const autoComposeTriggered = useRef(false);
    const logoUri = bootstrap.logoUri;

    const {
        stagedFiles,
        unstagedFiles,
        drafts,
        isLoading,
        isCommitting,
        providerConfig,
        activeView,
        composeSnapshot,
        setStagedFiles,
        setUnstagedFiles,
        setDrafts,
        setLoading,
        setCommitting,
        setError,
        setCommitProgress,
        markCommitted,
        setProviderConfig,
        setActiveView,
        setPrivacyPreview,
        setConnectionTest,
        setDiagnostics,
    } = useCommitStore();

    const { postMessage, onMessage } = useVSCodeAPI();

    const composeInCurrentView = useCallback(
        (override?: Partial<typeof providerConfig>) => {
            const currentConfig = useCommitStore.getState().providerConfig;
            const resolvedConfig = { ...currentConfig, ...override };
            setProviderConfig(override || {});
            setError(null);
            setLoading(true);
            setActiveView('compose');
            postMessage('compose', { providerConfig: resolvedConfig });
        },
        [postMessage, setActiveView, setError, setLoading, setProviderConfig]
    );

    // Listen for messages from the extension host
    useEffect(() => {
        const unsub = onMessage((message: HostToWebviewMessage) => {
            const payload = message as HostToWebviewMessage & Record<string, any>;
            switch (payload.command) {
                case 'dataLoaded':
                    if (useCommitStore.getState().error?.code === 'STAGED_SNAPSHOT_STALE') {
                        setDrafts([], null, null, null, null);
                        setActiveView('tree');
                    }
                    setStagedFiles(payload.data?.staged || []);
                    setUnstagedFiles(payload.data?.unstaged || []);
                    if (payload.data?.privacyPreview) {
                        setPrivacyPreview(payload.data.privacyPreview);
                    }
                    setError(null);
                    setDiagnostics(null);
                    if (payload.data?.providerConfig) {
                        setProviderConfig(payload.data.providerConfig);
                    }
                    if (bootstrap.autoCompose && !autoComposeTriggered.current) {
                        autoComposeTriggered.current = true;
                        composeInCurrentView({
                            ...(payload.data?.providerConfig || {}),
                            ...(bootstrap.providerConfig || {}),
                        });
                    }
                    break;

                case 'composing':
                    setLoading(true);
                    setError(null);
                    break;

                case 'composed':
                    setDrafts(
                        payload.drafts || [],
                        payload.reasoning,
                        payload.summary || null,
                        payload.snapshot || null,
                        payload.meta || null
                    );
                    setLoading(false);
                    setActiveView('compose');
                    setDiagnostics(null);
                    if ((payload.drafts || []).length > 0) {
                        const firstId = payload.drafts[0].id;
                        useCommitStore.getState().selectDraft(firstId);
                    }
                    break;

                case 'triggerCompose':
                    composeInCurrentView(payload.providerConfig || bootstrap.providerConfig || {});
                    break;

                case 'commitSuccess':
                    markCommitted(payload.draftId);
                    setCommitting(false);
                    break;

                case 'commitProgress':
                    setCommitting(true);
                    setCommitProgress(payload.progress);
                    break;

                case 'commitAllDone':
                    setCommitting(false);
                    setCommitProgress(null);
                    break;

                case 'error':
                    setError(payload.error || null);
                    setLoading(false);
                    setCommitting(false);
                    break;
                case 'connectionTested':
                    if (payload.result) {
                        setConnectionTest(payload.result);
                    }
                    break;
            }
        });

        // Request initial data
        postMessage('loadData');

        return unsub;
    }, [
        bootstrap.autoCompose,
        bootstrap.providerConfig,
        composeInCurrentView,
        markCommitted,
        onMessage,
        postMessage,
        setActiveView,
        setCommitting,
        setCommitProgress,
        setDrafts,
        setError,
        setLoading,
        setProviderConfig,
        setPrivacyPreview,
        setConnectionTest,
        setDiagnostics,
        setStagedFiles,
        setUnstagedFiles,
    ]);

    const handleComposeInPanel = (autoCompose: boolean) => {
        postMessage('openComposerPanel', { providerConfig, autoCompose });
    };

    const handleCommitAll = () => {
        const pending = drafts.filter(d => d.state !== 'committed');
        if (pending.length === 0) return;
        postMessage('commitAll', { drafts: pending, snapshot: composeSnapshot });
    };

    const handleRefresh = () => {
        postMessage('refresh');
    };

    const pendingCount = drafts.filter(d => d.state !== 'committed').length;

    // Determine if we should show the setup wizard
    const hasGitRepo = stagedFiles.length > 0 || unstagedFiles.length > 0;
    const hasStagedChanges = stagedFiles.length > 0;
    const providerConfigured = Boolean(providerConfig.apiKey) && providerConfig.provider !== 'openai';

    return (
        <div className="git-composer">
            {/* Header */}
            <div className="gc-header">
                <div className="gc-brand">
                    <div className="gc-brand-mark" aria-hidden="true">
                        {logoUri ? (
                            <img className="gc-brand-logo" src={logoUri} alt="" />
                        ) : (
                            <span className="gc-brand-fallback">OC</span>
                        )}
                    </div>
                    <div className="gc-brand-copy">
                        <h2 className="gc-title">OpenGit Composer</h2>
                        <div className="gc-subtitle">
                            {isPanelMode ? 'Compose and review staged changes' : 'Sidebar launcher'}
                        </div>
                    </div>
                </div>
                <button className="btn btn-icon" onClick={handleRefresh} title="Refresh">↻</button>
            </div>

            {isPanelMode ? (
                <>
                    {/* AI Controls */}
                    <AIControls />

                    {/* Compose Button */}
                    <div className="gc-compose-section">
                        <button
                            className="btn btn-primary btn-full"
                            onClick={() => composeInCurrentView(providerConfig)}
                            disabled={isLoading || stagedFiles.length === 0}
                        >
                            {isLoading ? '⏳ Analyzing…' : '⚡ Auto-Compose Commits'}
                        </button>
                    </div>
                </>
            ) : (
                <section className="sidebar-launch-card">
                    <div className="sidebar-launch-title">Working Changes</div>
                    <div className="sidebar-launch-meta">
                        {stagedFiles.length} staged • {unstagedFiles.length} unstaged
                    </div>
                    <button
                        className="btn btn-primary btn-full"
                        onClick={() => handleComposeInPanel(false)}
                        disabled={stagedFiles.length === 0}
                        title={stagedFiles.length === 0 ? 'Stage changes to compose commits' : 'Opens the full composer panel'}
                    >
                        Compose commit
                    </button>
                </section>
            )}

            {/* Status Bar */}
            <StatusBar />

            {/* Main Content */}
            {!isPanelMode ? (
                activeView === 'diff' ? (
                    <DiffViewer />
                ) : (
                    <FileList />
                )
            ) : activeView === 'compose' ? (
                <ComposeWorkspace isPanelMode={isPanelMode} />
            ) : activeView === 'diff' ? (
                <DiffViewer />
            ) : activeView === 'editor' ? (
                <CommitEditor />
            ) : (
                <>
                    <CommitTree />
                    {pendingCount > 0 && (
                        <div className="gc-commit-all-section">
                            <button
                                className="btn btn-success btn-full"
                                onClick={handleCommitAll}
                                disabled={isCommitting}
                            >
                                {isCommitting
                                    ? '⏳ Committing…'
                                    : `✅ Commit All (${pendingCount})`}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
