import React, { useEffect, useMemo, useState } from 'react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';

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

    const pendingCount = drafts.filter(draft => draft.state !== 'committed').length;

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

    return (
        <section className="compose-workspace">
            <header className="compose-header">
                <div>
                    <h3 className="compose-title">Generated Commits</h3>
                    {summary && <p className="compose-summary">{summary}</p>}
                </div>
                <div className="compose-header-actions">
                    {!isPanelMode && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setActiveView('tree')}>
                            Back
                        </button>
                    )}
                    <button
                        className="btn btn-success btn-sm"
                        onClick={handleCommitAll}
                        disabled={isCommitting || pendingCount === 0}
                    >
                        Commit All ({pendingCount})
                    </button>
                </div>
            </header>

            {reasoning && (
                <article className="compose-reasoning-card">
                    <div className="section-label">Composition Reasoning</div>
                    <p>{reasoning}</p>
                </article>
            )}

            <div className="compose-grid">
                <aside className="compose-list">
                    <div className="section-label">Draft Commits ({drafts.length})</div>
                    <div className="compose-list-items">
                        {drafts.map((draft, index) => {
                            const subject = draft.message.split('\n')[0];
                            const add = draft.files.reduce((acc, file) => acc + file.additions, 0);
                            const del = draft.files.reduce((acc, file) => acc + file.deletions, 0);
                            return (
                                <button
                                    key={draft.id}
                                    className={`compose-list-item ${selectedDraft?.id === draft.id ? 'selected' : ''}`}
                                    onClick={() => selectDraft(draft.id)}
                                >
                                    <div className="compose-list-index">Commit {index + 1}</div>
                                    <div className="compose-list-subject" title={subject}>
                                        {subject}
                                    </div>
                                    <div className="compose-list-meta">
                                        <span>{draft.files.length} files</span>
                                        <span className="stat-add">+{add}</span>
                                        <span className="stat-del">-{del}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <article className="compose-detail">
                    {selectedDraft ? (
                        <>
                            <div className="compose-detail-header">
                                <h4>{selectedDraft.message.split('\n')[0]}</h4>
                                <span className="confidence-badge">{selectedDraft.confidence}% confidence</span>
                            </div>

                            <div className="compose-editor-block">
                                <label className="section-label">Commit Message</label>
                                <textarea
                                    className="commit-editor-textarea"
                                    rows={5}
                                    value={editorMessage}
                                    onChange={event => setEditorMessage(event.target.value)}
                                />
                                <div className="compose-editor-actions">
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={handleSaveMessage}
                                        disabled={!hasMessageEdits}
                                    >
                                        Save Message
                                    </button>
                                    <button
                                        className="btn btn-success btn-sm"
                                        onClick={handleCommitCurrent}
                                        disabled={isCommitting}
                                    >
                                        Commit This Draft
                                    </button>
                                </div>
                            </div>

                            {(selectedDraft.rationale || selectedDraft.description || selectedDraft.impact) && (
                                <section className="compose-text-block">
                                    <div className="section-label">Why This Commit</div>
                                    {selectedDraft.rationale && <p>{selectedDraft.rationale}</p>}
                                    {!selectedDraft.rationale && selectedDraft.description && <p>{selectedDraft.description}</p>}
                                    {selectedDraft.impact && <p className="compose-impact">{selectedDraft.impact}</p>}
                                </section>
                            )}

                            {selectedDraft.verificationSteps && selectedDraft.verificationSteps.length > 0 && (
                                <section className="compose-text-block">
                                    <div className="section-label">Verification Checklist</div>
                                    <ul className="compose-list-bullets">
                                        {selectedDraft.verificationSteps.map((step, idx) => (
                                            <li key={`${selectedDraft.id}-verify-${idx}`}>{step}</li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {selectedDraft.risks && selectedDraft.risks.length > 0 && (
                                <section className="compose-text-block">
                                    <div className="section-label">Risks</div>
                                    <ul className="compose-list-bullets">
                                        {selectedDraft.risks.map((risk, idx) => (
                                            <li key={`${selectedDraft.id}-risk-${idx}`}>{risk}</li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            <section className="compose-files-block">
                                <div className="section-label">Files In Commit ({selectedDraft.files.length})</div>
                                <div className="compose-files-table">
                                    {selectedDraft.files.map(file => (
                                        <div className="compose-file-row" key={`${selectedDraft.id}-${file.path}`}>
                                            <span className={`change-badge ${file.changeType}`}>{file.changeType[0]?.toUpperCase() || '?'}</span>
                                            <span className="file-name" title={file.path}>{file.path}</span>
                                            <span className="stat-add">+{file.additions}</span>
                                            <span className="stat-del">-{file.deletions}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </>
                    ) : (
                        <p className="empty-hint">Select a draft to inspect details.</p>
                    )}
                </article>
            </div>
        </section>
    );
}
