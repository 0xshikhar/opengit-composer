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
import InlineCommitBox from './components/InlineCommitBox';
import DraftTimeline from './components/DraftTimeline';
import WorkingChangesOverview from './components/WorkingChangesOverview';
import AIProviderSettingsModal from './components/AIProviderSettingsModal';
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
        selectedDraftId,
        selectDraft,
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
                        clearWarning(); // Reset force commit state on session reset
                    } else if (useCommitStore.getState().error?.code === 'STAGED_SNAPSHOT_STALE') {
                        setDrafts([], null, null, null, null);
                        setActiveView('tree');
                        clearWarning(); // Reset force commit state on STALE error
                    }
                    setStagedFiles(message.data?.staged || []);
                    setUnstagedFiles(message.data?.unstaged || []);
                    if (message.data?.privacyPreview) {
                        setPrivacyPreview(message.data.privacyPreview);
                    }
                    setError(null);
                    setDiagnostics(null);
                    clearWarning(); // Always clear warning on fresh data load
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
                    useCommitStore.getState().setIsGeneratingQuickCommit(false);
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

    const handleCommitSingle = () => {
        const selected = drafts.find(d => d.id === selectedDraftId) || drafts[0];
        if (!selected) return;
        const { forceCommit } = useCommitStore.getState();
        const force = forceCommit.pending && forceCommit.type === 'single';
        postMessage('commitSingle', { draft: selected, snapshot: composeSnapshot, force });
    };

    const handleRefresh = () => {
        postMessage('refresh');
    };

    const pendingCount = drafts.filter(d => d.state !== 'committed').length;

    return (
        <div className={`git-composer ${isPanelMode ? 'gc-panel-mode' : 'gc-sidebar-mode'}`}>
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
                        <div className="gc-title-row">
                            <h2 className="gc-title">OpenGit Composer</h2>
                            <span className="gc-header-pill">STUDIO</span>
                        </div>
                        <div className="gc-subtitle">
                            {isPanelMode
                                ? `${stagedFiles.length} staged file${stagedFiles.length !== 1 ? 's' : ''} • AI Commit Workspace`
                                : 'Sidebar launcher'}
                        </div>
                    </div>
                </div>
                <div className="gc-header-actions">
                    <button className="btn btn-icon" onClick={handleRefresh} title="Refresh workspace state">↻</button>
                </div>
            </div>

            {/* Status Bar */}
            <StatusBar />

            {/* Content area: Adaptive studio layout for panel, standard list for sidebar */}
            {isPanelMode ? (
                <div className="gc-studio-layout">
                    <aside className="gc-studio-sidebar">
                        <AIControls />

                        <div className="gc-compose-action-card">
                            <button
                                className="btn btn-primary btn-full gc-auto-compose-btn"
                                onClick={() => composeInCurrentView(providerConfig)}
                                disabled={isLoading || stagedFiles.length === 0}
                            >
                                {isLoading ? (
                                    <>
                                        <span className="gc-loading-spinner gc-spinner-sm" /> Analyzing Changes...
                                    </>
                                ) : (
                                    '⚡ Auto-Compose Commits'
                                )}
                            </button>
                            <div className="gc-compose-hint">
                                {stagedFiles.length === 0
                                    ? 'Stage files in Git to compose commits'
                                    : 'AI will group changes into reviewable commits'}
                            </div>
                        </div>

                        {drafts.length > 0 && (
                            <DraftTimeline
                                drafts={drafts}
                                selectedDraftId={selectedDraftId}
                                onSelectDraft={selectDraft}
                                isCommitting={isCommitting}
                                onCommitSingle={handleCommitSingle}
                                onCommitAll={handleCommitAll}
                            />
                        )}
                    </aside>

                    <main className="gc-studio-main">
                        {drafts.length > 0 ? (
                            <ComposeWorkspace isPanelMode={isPanelMode} />
                        ) : (
                            <WorkingChangesOverview
                                onAutoCompose={() => composeInCurrentView(providerConfig)}
                                isLoading={isLoading}
                            />
                        )}
                    </main>
                </div>
            ) : (
                <>
                    <section className="sidebar-launch-card">
                        <InlineCommitBox />
                        <div className="sidebar-launch-footer">
                            <div className="sidebar-launch-meta">
                                {stagedFiles.length} staged • {unstagedFiles.length} unstaged
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleComposeInPanel(false)}
                                disabled={stagedFiles.length === 0}
                                title={stagedFiles.length === 0 ? 'Stage changes to compose multi-commit sets' : 'Opens the full composer panel for intelligent splitting'}
                            >
                                ⚡ Split Commits
                            </button>
                        </div>
                    </section>

                    {activeView === 'diff' ? (
                        <DiffViewer />
                    ) : (
                        <FileList />
                    )}
                </>
            )}

            {/* AI Provider & Models Settings Modal */}
            <AIProviderSettingsModal />
        </div>
    );
}
