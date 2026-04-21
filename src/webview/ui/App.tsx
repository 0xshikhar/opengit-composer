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
    const composeInProgress = useRef(false);
    const logoUri = bootstrap.logoUri;

    // Initialize provider config from bootstrap on mount to prevent showing wrong provider
    useEffect(() => {
        if (bootstrap.providerConfig) {
            const { setProviderConfig } = useCommitStore.getState();
            setProviderConfig(bootstrap.providerConfig);
        }
    }, [bootstrap.providerConfig]);

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
        setWarning,
        setForceCommit,
        clearWarning,
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
        const unsub = onMessage((message: HostToWebviewMessage & Record<string, any>) => {
            switch (message.command) {
                case 'dataLoaded':
                    if (message.data?.resetSession) {
                        setDrafts([], null, null, null, null);
                        useCommitStore.getState().selectDraft(null);
                        useCommitStore.getState().selectFile(null);
                        setActiveView('tree');
                    } else if (useCommitStore.getState().error?.code === 'STAGED_SNAPSHOT_STALE') {
                        setDrafts([], null, null, null, null);
                        setActiveView('tree');
                    }
                    setStagedFiles(message.data?.staged || []);
                    setUnstagedFiles(message.data?.unstaged || []);
                    if (message.data?.privacyPreview) {
                        setPrivacyPreview(message.data.privacyPreview);
                    }
                    setError(null);
                    setDiagnostics(null);
                    if (message.data?.providerConfig) {
                        setProviderConfig(message.data.providerConfig);
                    }
                    if (bootstrap.autoCompose && !autoComposeTriggered.current && !composeInProgress.current) {
                        autoComposeTriggered.current = true;
                        composeInProgress.current = true;
                        composeInCurrentView({
                            ...(message.data?.providerConfig || {}),
                            ...(bootstrap.providerConfig || {}),
                        });
                        // Note: composeInCurrentView is synchronous (posts message)
                        // The flag will be reset when 'composed' or 'error' message is received
                    }
                    break;

                case 'composing':
                    setLoading(true);
                    setError(null);
                    break;

                case 'composed':
                    composeInProgress.current = false;
                    setDrafts(
                        message.drafts || [],
                        message.reasoning,
                        message.summary || null,
                        message.snapshot || null,
                        message.meta || null
                    );
                    setLoading(false);
                    setActiveView('compose');
                    setDiagnostics(null);
                    if ((message.drafts || []).length > 0) {
                        const firstId = message.drafts[0].id;
                        useCommitStore.getState().selectDraft(firstId);
                    }
                    break;

                case 'triggerCompose':
                    composeInCurrentView(message.providerConfig || bootstrap.providerConfig || {});
                    break;

                case 'commitSuccess':
                    markCommitted(message.draftId);
                    setCommitting(false);
                    break;

                case 'commitProgress':
                    setCommitting(true);
                    setCommitProgress(message.progress);
                    break;

                case 'commitAllDone':
                    setCommitting(false);
                    setCommitProgress(null);
                    clearWarning();
                    break;

                case 'warning':
                    setWarning(message.warning || null);
                    if (message.warning?.code === 'STAGED_SNAPSHOT_STALE') {
                        // Track that we need force commit on next attempt
                        const isCommitAll = message.warning?.action?.command === 'commitAll';
                        setForceCommit({
                            pending: true,
                            type: isCommitAll ? 'all' : 'single',
                            draftId: useCommitStore.getState().selectedDraftId || undefined,
                        });
                    }
                    setLoading(false);
                    setCommitting(false);
                    break;

                case 'error':
                    composeInProgress.current = false;
                    setError(message.error || null);
                    clearWarning();
                    setLoading(false);
                    setCommitting(false);
                    break;
                case 'connectionTested':
                    if (message.result) {
                        setConnectionTest(message.result);
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
        setWarning,
        setForceCommit,
        clearWarning,
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

        // Check if we have a pending force commit warning
        const { forceCommit } = useCommitStore.getState();
        const force = forceCommit.pending && forceCommit.type === 'all';

        postMessage('commitAll', { drafts: pending, snapshot: composeSnapshot, force });
    };

    const handleRefresh = () => {
        postMessage('refresh');
    };

    const pendingCount = drafts.filter(d => d.state !== 'committed').length;

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
