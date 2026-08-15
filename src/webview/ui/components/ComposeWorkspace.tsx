import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Check, FileCheck, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';
import FileDiffAccordion from './FileDiffAccordion';

const CONVENTIONAL_TYPES = ['feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'style', 'perf'] as const;

function applyTypePrefix(current: string, newType: string): string {
    const trimmed = current.trim();
    if (!trimmed) return `${newType}: `;
    const match = trimmed.match(/^([a-z]+)(\([^)]+\))?(!)?:\s*(.*)$/is);
    if (match) {
        const scope = match[2] || '';
        const breaking = match[3] || '';
        const rest = match[4] || '';
        return `${newType}${scope}${breaking}: ${rest}`;
    }
    return `${newType}: ${trimmed}`;
}

interface ComposeWorkspaceProps {
    isPanelMode: boolean;
}

export default function ComposeWorkspace({ isPanelMode }: ComposeWorkspaceProps) {
    const {
        drafts,
        summary,
        reasoning,
        composeSnapshot,
        composeMeta,
        selectedDraftId,
        selectDraft,
        updateDraftMessage,
        setActiveView,
        isCommitting,
    } = useCommitStore();
    const { postMessage } = useVSCodeAPI();

    const [editorMessage, setEditorMessage] = useState('');
    const selectedDraft = useMemo(
        () => drafts.find(draft => draft.id === selectedDraftId) || drafts[0],
        [drafts, selectedDraftId]
    );

    useEffect(() => {
        if (!selectedDraftId && drafts.length > 0) {
            selectDraft(drafts[0].id);
        }
    }, [drafts, selectedDraftId, selectDraft]);

    useEffect(() => {
        setEditorMessage(selectedDraft?.message || '');
    }, [selectedDraft?.id, selectedDraft?.message]);

    const hasMessageEdits = !!selectedDraft && editorMessage !== selectedDraft.message;

    const handleSaveMessage = () => {
        if (!selectedDraft) return;
        updateDraftMessage(selectedDraft.id, editorMessage);
    };

    const handleCommitCurrent = () => {
        if (!selectedDraft) return;
        const draftForCommit = editorMessage !== selectedDraft.message
            ? { ...selectedDraft, message: editorMessage }
            : selectedDraft;

        if (draftForCommit.message !== selectedDraft.message) {
            updateDraftMessage(selectedDraft.id, draftForCommit.message);
        }

        postMessage('commitSingle', { draft: draftForCommit, snapshot: composeSnapshot });
    };

    const handleCommitAll = () => {
        const pending = drafts.filter(draft => draft.state !== 'committed');
        if (pending.length === 0) return;
        postMessage('commitAll', { drafts: pending, snapshot: composeSnapshot });
    };

    const handleOpenFile = (path: string) => {
        postMessage('openFile', { path });
    };

    const pendingCount = drafts.filter(draft => draft.state !== 'committed').length;
    const requestedModel = composeMeta?.aiRequestedModel;
    const usedModel = composeMeta?.aiUsedModel;
    const modelFailover = Boolean(composeMeta?.aiModelFailover && requestedModel && usedModel && requestedModel !== usedModel);
    const aiRequestFailed = composeMeta?.fallbackReason === 'ai_request_failed' || !!composeMeta?.aiRequestError;
    const aiRequestHeadline = aiRequestFailed
        ? [
            `AI request failed${requestedModel ? ` for ${requestedModel}` : ''}`,
            composeMeta?.aiRequestStatus ? `(${composeMeta.aiRequestStatus}${composeMeta.aiRequestCode ? ` ${composeMeta.aiRequestCode}` : ''})` : composeMeta?.aiRequestCode ? `(${composeMeta.aiRequestCode})` : '',
        ].filter(Boolean).join(' ')
        : '';
    const aiRequestBody = composeMeta?.aiRequestError
        ? composeMeta.aiRequestError.replace(/^Gemini API Error:\s*/i, '')
        : '';

    if (drafts.length === 0) {
        return (
            <section className="compose-workspace-empty">
                <p className="empty-text">No composed drafts yet.</p>
                <p className="empty-hint">Run composition to open a detailed review workspace.</p>
                {!isPanelMode && (
                    <button className="btn btn-secondary" onClick={() => setActiveView('tree')}>
                        Back To Tree
                    </button>
                )}
            </section>
        );
    }

    const currentSubject = editorMessage.split('\n')[0] || '';
    const subjectLength = currentSubject.length;

    return (
        <section className="compose-workspace">
            {aiRequestFailed && (
                <div className="compose-alert compose-alert-warning" role="alert">
                    <div className="compose-alert-icon">⚠️</div>
                    <div className="compose-alert-copy">
                        <strong>{aiRequestHeadline || 'AI request failed'}</strong>
                        {aiRequestBody ? <p>{aiRequestBody}</p> : <p>Falling back to heuristic draft mode.</p>}
                    </div>
                </div>
            )}

            {modelFailover && (
                <div className="compose-banner compose-banner-info">
                    AI model failover active: {requestedModel || 'primary model'} switched to {usedModel || 'a fallback model'}.
                    {composeMeta?.aiModelFailoverReason ? ` ${composeMeta.aiModelFailoverReason}` : ''}
                </div>
            )}

            <div className="compose-detail-card">
                {selectedDraft ? (
                    <>
                        <div className="compose-detail-top-bar">
                            <div className="compose-detail-title-group">
                                <span className="compose-detail-tag">Commit Proposal</span>
                                <h3 className="compose-detail-heading">{selectedDraft.message.split('\n')[0]}</h3>
                            </div>
                            <div className="compose-detail-badge-group">
                                {selectedDraft.confidence && (
                                    <span className="confidence-badge">{selectedDraft.confidence}% confidence</span>
                                )}
                                {selectedDraft.state === 'committed' ? (
                                    <span className="status-chip chip-committed">Committed</span>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn-success btn-sm"
                                        onClick={handleCommitCurrent}
                                        disabled={isCommitting}
                                    >
                                        {isCommitting ? 'Committing...' : 'Commit This Draft'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Commit Message Box */}
                        <div className="compose-editor-box">
                            <div className="compose-editor-header">
                                <label className="section-label">Commit Message</label>
                                <div className="compose-editor-meta">
                                    <span className={`char-counter ${subjectLength > 72 ? 'counter-warn' : ''}`}>
                                        {subjectLength}/72 chars
                                    </span>
                                </div>
                            </div>

                            {/* Conventional commit quick prefix chips */}
                            <div className="conventional-chips">
                                {CONVENTIONAL_TYPES.map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className="chip-btn"
                                        onClick={() => setEditorMessage((prev) => applyTypePrefix(prev, type))}
                                        title={`Prepend or change to "${type}:"`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                className="commit-editor-textarea"
                                rows={4}
                                value={editorMessage}
                                onChange={(e) => setEditorMessage(e.target.value)}
                                placeholder="Enter commit message (first line is subject, followed by blank line and body)..."
                            />

                            <div className="compose-editor-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleSaveMessage}
                                    disabled={!hasMessageEdits}
                                >
                                    Save Message Edits
                                </button>
                            </div>
                        </div>

                        {/* Why This Commit & Rationale */}
                        {(selectedDraft.rationale || selectedDraft.description || selectedDraft.impact) && (
                            <div className="compose-reasoning-card">
                                <div className="section-label">Why This Commit</div>
                                {selectedDraft.rationale && <p className="reasoning-text">{selectedDraft.rationale}</p>}
                                {!selectedDraft.rationale && selectedDraft.description && (
                                    <p className="reasoning-text">{selectedDraft.description}</p>
                                )}
                                {selectedDraft.impact && (
                                    <div className="compose-impact">
                                        <strong>Impact:</strong> {selectedDraft.impact}
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedDraft.verificationSteps && selectedDraft.verificationSteps.length > 0 && (
                            <div className="compose-checklist-card">
                                <div className="section-label">Verification Checklist</div>
                                <ul className="compose-list-bullets">
                                    {selectedDraft.verificationSteps.map((step, idx) => (
                                        <li key={`${selectedDraft.id}-verify-${idx}`}>{step}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Embedded Diff Accordion */}
                        <FileDiffAccordion
                            files={selectedDraft.files}
                            onOpenFile={handleOpenFile}
                        />
                    </>
                ) : (
                    <div className="compose-detail-empty">
                        <p className="empty-hint">Select a draft commit from the timeline on the left to inspect its message and diffs.</p>
                    </div>
                )}
            </div>
        </section>
    );
}
