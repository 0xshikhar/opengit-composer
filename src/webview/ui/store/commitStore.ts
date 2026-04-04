import { create } from 'zustand';
import { ComposerErrorAction, ComposerErrorCode } from '../../../types/messages';

// Types duplicated for webview context (no vscode imports)
export interface FileChange {
    path: string;
    changeType: string;
    diff: string;
    additions: number;
    deletions: number;
}

export type CommitState = 'draft' | 'generated' | 'edited' | 'confirmed' | 'committed';

export interface DraftCommit {
    id: string;
    message: string;
    description?: string;
    files: FileChange[];
    state: CommitState;
    confidence: number;
    type?: string;
    scope?: string;
    rationale?: string;
    impact?: string;
    verificationSteps?: string[];
    risks?: string[];
}

export interface ProviderConfig {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
    additionalInstructions?: string;
}

export interface StoredKeyDisplay {
    label: string;
    masked: string;
    lastUsed?: number;
}

export interface ComposeSnapshot {
    fingerprint: string;
    generatedAt: number;
    fileCount: number;
    paths: string[];
}

export interface ComposeMeta {
    usedFallback: boolean;
    fallbackReason?: string;
    excludedFileCount: number;
    redactedMatchCount: number;
    invalidExcludePatterns?: string[];
    invalidRedactPatterns?: string[];
    parserFallbackStrategy?: string;
    parserFallbackDetails?: string;
    parserQualityScore?: number;
}

export interface PrivacyPreview {
    excludedCount: number;
    redactedCount: number;
    invalidExcludePatterns: string[];
    invalidRedactPatterns: string[];
    warnings: string[];
}

export interface ProviderDiagnostics {
    provider: string;
    code: ComposerErrorCode;
    message: string;
    status?: number;
    requestId?: string;
    model?: string;
    details?: string;
    hint?: string;
}

export interface ConnectionTestResult {
    provider: string;
    available: boolean;
    modelAvailable: boolean;
    message: string;
    models?: string[];
}

export interface ErrorAction {
    label: string;
    command: ComposerErrorAction['command'];
}

interface CommitStoreState {
    // Data
    stagedFiles: FileChange[];
    unstagedFiles: FileChange[];
    drafts: DraftCommit[];
    summary: string | null;
    reasoning: string | null;
    composeSnapshot: ComposeSnapshot | null;
    composeMeta: ComposeMeta | null;
    privacyPreview: PrivacyPreview | null;
    connectionTest: ConnectionTestResult | null;
    diagnostics: ProviderDiagnostics | null;

    // UI state
    selectedDraftId: string | null;
    selectedFilePath: string | null;
    isLoading: boolean;
    isCommitting: boolean;
    error: string | null;
    errorAction: ErrorAction | null;
    commitProgress: { current: number; total: number } | null;

    // Provider config
    providerConfig: ProviderConfig;

    // Keys management
    savedKeys: Record<string, StoredKeyDisplay[]>;
    showKeyInput: boolean;

    // Ollama models
    ollamaModels: string[];

    // View mode
    activeView: 'tree' | 'diff' | 'editor' | 'compose';

    // Actions
    setStagedFiles: (files: FileChange[]) => void;
    setUnstagedFiles: (files: FileChange[]) => void;
    setDrafts: (
        drafts: DraftCommit[],
        reasoning?: string | null,
        summary?: string | null,
        snapshot?: ComposeSnapshot | null,
        meta?: ComposeMeta | null
    ) => void;
    selectDraft: (id: string | null) => void;
    selectFile: (path: string | null) => void;
    setLoading: (loading: boolean) => void;
    setCommitting: (committing: boolean) => void;
    setError: (error: string | null, action?: ErrorAction | null, diagnostics?: ProviderDiagnostics | null) => void;
    setCommitProgress: (progress: { current: number; total: number } | null) => void;
    setProviderConfig: (config: Partial<ProviderConfig>) => void;
    setActiveView: (view: 'tree' | 'diff' | 'editor' | 'compose') => void;
    setSavedKeys: (provider: string, keys: StoredKeyDisplay[]) => void;
    setShowKeyInput: (show: boolean) => void;
    setOllamaModels: (models: string[]) => void;
    setPrivacyPreview: (preview: PrivacyPreview | null) => void;
    setConnectionTest: (result: ConnectionTestResult | null) => void;
    setDiagnostics: (diagnostics: ProviderDiagnostics | null) => void;

    // Draft manipulation
    updateDraftMessage: (id: string, message: string) => void;
    removeDraft: (id: string) => void;
    mergeDrafts: (ids: string[]) => void;
    splitDraft: (id: string, filePaths: string[][]) => void;
    reorderDrafts: (fromIndex: number, toIndex: number) => void;
    confirmDraft: (id: string) => void;
    markCommitted: (id: string) => void;

    // Reset
    reset: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 10);

export const useCommitStore = create<CommitStoreState>((set, get) => ({
    // Initial state
    stagedFiles: [],
    unstagedFiles: [],
    drafts: [],
    summary: null,
    reasoning: null,
    composeSnapshot: null,
    composeMeta: null,
    privacyPreview: null,
    connectionTest: null,
    diagnostics: null,
    selectedDraftId: null,
    selectedFilePath: null,
    isLoading: false,
    isCommitting: false,
    error: null,
    errorAction: null,
    commitProgress: null,
    providerConfig: {
        provider: 'openai',
        apiKey: '',
        model: '',
    },
    savedKeys: {},
    showKeyInput: false,
    ollamaModels: [],
    activeView: 'tree',

    // Setters
    setStagedFiles: (files) => set({ stagedFiles: files }),
    setUnstagedFiles: (files) => set({ unstagedFiles: files }),
    setDrafts: (drafts, reasoning = null, summary = null, snapshot = null, meta = null) =>
        set({
            drafts,
            reasoning,
            summary,
            composeSnapshot: snapshot,
            composeMeta: meta,
            error: null,
            errorAction: null,
            diagnostics: null,
        }),
    selectDraft: (id) => set({ selectedDraftId: id }),
    selectFile: (path) => set({ selectedFilePath: path, activeView: 'diff' }),
    setLoading: (loading) => set({ isLoading: loading }),
    setCommitting: (committing) => set({ isCommitting: committing }),
    setError: (error, action = null, diagnostics = null) => set({ error, errorAction: action, diagnostics }),
    setCommitProgress: (progress) => set({ commitProgress: progress }),
    setProviderConfig: (config) =>
        set((state) => ({
            providerConfig: { ...state.providerConfig, ...config },
        })),
    setActiveView: (view) => set({ activeView: view }),
    setSavedKeys: (provider, keys) =>
        set((state) => ({
            savedKeys: { ...state.savedKeys, [provider]: keys },
        })),
    setShowKeyInput: (show) => set({ showKeyInput: show }),
    setOllamaModels: (models) => set({ ollamaModels: models }),
    setPrivacyPreview: (preview) => set({ privacyPreview: preview }),
    setConnectionTest: (result) => set({ connectionTest: result }),
    setDiagnostics: (diagnostics) => set({ diagnostics }),

    // Draft manipulation
    updateDraftMessage: (id, message) =>
        set((state) => ({
            drafts: state.drafts.map((d) =>
                d.id === id ? { ...d, message, state: 'edited' as CommitState } : d
            ),
        })),

    removeDraft: (id) =>
        set((state) => ({
            drafts: state.drafts.filter((d) => d.id !== id),
            selectedDraftId: state.selectedDraftId === id ? null : state.selectedDraftId,
        })),

    mergeDrafts: (ids) =>
        set((state) => {
            if (ids.length < 2) return state;
            const toMerge = state.drafts.filter((d) => ids.includes(d.id));
            if (toMerge.length < 2) return state;

            const merged: DraftCommit = {
                id: generateId(),
                message: toMerge.map((d) => d.message).join('\n\n'),
                files: toMerge.flatMap((d) => d.files),
                state: 'edited',
                confidence: Math.min(...toMerge.map((d) => d.confidence)),
            };

            const remaining = state.drafts.filter((d) => !ids.includes(d.id));
            // Insert merged at the position of the first removed
            const firstIdx = state.drafts.findIndex((d) => ids.includes(d.id));
            remaining.splice(firstIdx, 0, merged);

            return { drafts: remaining, selectedDraftId: merged.id };
        }),

    splitDraft: (id, filePaths) =>
        set((state) => {
            const draft = state.drafts.find((d) => d.id === id);
            if (!draft || filePaths.length < 2) return state;

            const newDrafts: DraftCommit[] = filePaths.map((paths, i) => ({
                id: generateId(),
                message: `${draft.message} (part ${i + 1})`,
                files: draft.files.filter((f) => paths.includes(f.path)),
                state: 'edited' as CommitState,
                confidence: draft.confidence,
            }));

            const idx = state.drafts.findIndex((d) => d.id === id);
            const result = [...state.drafts];
            result.splice(idx, 1, ...newDrafts);

            return { drafts: result };
        }),

    reorderDrafts: (fromIndex, toIndex) =>
        set((state) => {
            const newDrafts = [...state.drafts];
            const [moved] = newDrafts.splice(fromIndex, 1);
            newDrafts.splice(toIndex, 0, moved);
            return { drafts: newDrafts };
        }),

    confirmDraft: (id) =>
        set((state) => ({
            drafts: state.drafts.map((d) =>
                d.id === id ? { ...d, state: 'confirmed' as CommitState } : d
            ),
        })),

    markCommitted: (id) =>
        set((state) => ({
            drafts: state.drafts.map((d) =>
                d.id === id ? { ...d, state: 'committed' as CommitState } : d
            ),
        })),

    reset: () =>
        set({
            stagedFiles: [],
            unstagedFiles: [],
            drafts: [],
            summary: null,
            reasoning: null,
            composeSnapshot: null,
            composeMeta: null,
            privacyPreview: null,
            connectionTest: null,
            diagnostics: null,
            selectedDraftId: null,
            selectedFilePath: null,
            isLoading: false,
            isCommitting: false,
            error: null,
            errorAction: null,
            commitProgress: null,
            activeView: 'tree',
            ollamaModels: [],
        }),
}));
