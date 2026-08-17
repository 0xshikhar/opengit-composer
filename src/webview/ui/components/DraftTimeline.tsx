import React from 'react';
import { Check, Clock, FileCode, Sparkles, CheckCircle2, ChevronRight } from 'lucide-react';
import { DraftCommit, FileChange } from '../store/commitStore';

interface DraftTimelineProps {
    drafts: DraftCommit[];
    selectedDraftId: string | null;
    onSelectDraft: (id: string) => void;
    isCommitting?: boolean;
    onCommitSingle?: () => void;
    onCommitAll?: () => void;
}

export default function DraftTimeline({
    drafts,
    selectedDraftId,
    onSelectDraft,
    isCommitting = false,
    onCommitSingle,
    onCommitAll,
}: DraftTimelineProps) {
    const pendingCount = drafts.filter((d) => d.state !== 'committed').length;
    const selectedDraft = drafts.find((d) => d.id === selectedDraftId) || drafts[0];

    return (
        <div className="gc-timeline-container">
            <div className="gc-timeline-header">
                <div className="gc-timeline-title-row">
                    <span className="gc-timeline-title">Draft Commits</span>
                    <span className="gc-timeline-badge">{drafts.length}</span>
                </div>
                <div className="gc-timeline-subtitle">
                    {pendingCount === 0 ? 'All commits applied' : `${pendingCount} pending commit${pendingCount > 1 ? 's' : ''}`}
                </div>
            </div>

            <div className="gc-timeline-stepper">
                {drafts.map((draft, index) => {
                    const isSelected = selectedDraft?.id === draft.id;
                    const isCommitted = draft.state === 'committed';
                    const isLast = index === drafts.length - 1;
                    const subject = draft.message.split('\n')[0] || `Commit ${index + 1}`;
                    const additions = draft.files.reduce((acc: number, f: FileChange) => acc + (f.additions || 0), 0);
                    const deletions = draft.files.reduce((acc: number, f: FileChange) => acc + (f.deletions || 0), 0);

                    return (
                        <div
                            key={draft.id}
                            className={`gc-timeline-item ${isSelected ? 'selected' : ''} ${isCommitted ? 'committed' : ''}`}
                            onClick={() => onSelectDraft(draft.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    onSelectDraft(draft.id);
                                }
                            }}
                        >
                            <div className="gc-timeline-node-col">
                                <div className={`gc-timeline-node ${isCommitted ? 'node-committed' : isSelected ? 'node-selected' : 'node-pending'}`}>
                                    {isCommitted ? (
                                        <Check size={12} strokeWidth={3} />
                                    ) : (
                                        <span className="gc-node-num">{index + 1}</span>
                                    )}
                                </div>
                                {!isLast && <div className="gc-timeline-connector" />}
                            </div>

                            <div className="gc-timeline-card">
                                <div className="gc-timeline-card-header">
                                    <span className="gc-timeline-step-label">Commit {index + 1}</span>
                                    {isCommitted ? (
                                        <span className="status-chip chip-committed">Committed</span>
                                    ) : (
                                        <span className="status-chip chip-draft">Draft</span>
                                    )}
                                </div>

                                <div className="gc-timeline-subject" title={subject}>
                                    {subject}
                                </div>

                                <div className="gc-timeline-meta">
                                    <span className="gc-meta-files">
                                        <FileCode size={12} />
                                        {draft.files.length} file{draft.files.length !== 1 ? 's' : ''}
                                    </span>
                                    {(additions > 0 || deletions > 0) && (
                                        <span className="gc-meta-diff">
                                            {additions > 0 && <span className="stat-add">+{additions}</span>}
                                            {deletions > 0 && <span className="stat-del">−{deletions}</span>}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {pendingCount > 0 && (
                <div className="gc-timeline-actions">
                    {onCommitSingle && selectedDraft && selectedDraft.state !== 'committed' && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-full"
                            onClick={onCommitSingle}
                            disabled={isCommitting}
                        >
                            {isCommitting ? 'Committing...' : 'Commit Selected Draft'}
                        </button>
                    )}
                    {onCommitAll && (
                        <button
                            type="button"
                            className="btn btn-success btn-full"
                            onClick={onCommitAll}
                            disabled={isCommitting}
                        >
                            {isCommitting ? 'Applying Commits...' : `Commit All (${pendingCount})`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
