import React, { useState } from 'react';
import { useCommitStore, DraftCommit } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';

interface Props {
    draft: DraftCommit;
    isSelected: boolean;
    onSelect: () => void;
}

export default function CommitTreeItem({ draft, isSelected, onSelect }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editMessage, setEditMessage] = useState(draft.message);
    const { updateDraftMessage, removeDraft, confirmDraft, selectFile, composeSnapshot } = useCommitStore();
    const { postMessage } = useVSCodeAPI();

    const handleSave = () => {
        updateDraftMessage(draft.id, editMessage);
        setEditing(false);
    };

    const handleCommitSingle = () => {
        confirmDraft(draft.id);
        postMessage('commitSingle', { draft, snapshot: composeSnapshot });
    };

    const stateIcon = {
        draft: '○',
        generated: '◉',
        edited: '✎',
        confirmed: '✓',
        committed: '✔',
    }[draft.state];

    const stateClass = `state-${draft.state}`;
    const subjectLine = draft.message.split('\n')[0];
    const addCount = draft.files.reduce((acc, f) => acc + f.additions, 0);
    const delCount = draft.files.reduce((acc, f) => acc + f.deletions, 0);

    return (
        <div className={`commit-tree-item ${isSelected ? 'selected' : ''} ${stateClass}`}>
            <div className="commit-item-header" onClick={onSelect}>
                <button
                    className="expand-btn"
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                >
                    {expanded ? '▾' : '▸'}
                </button>
                <span className="state-icon">{stateIcon}</span>
                <span className="commit-message-preview" title={draft.message}>
                    {subjectLine}
                </span>
                <span className="confidence-badge" title={`Confidence: ${draft.confidence}%`}>
                    {draft.confidence}%
                </span>
            </div>

            {expanded && (
                <div className="commit-item-details">
                    <div className="commit-stats">
                        <span className="stat-add">+{addCount}</span>
                        <span className="stat-del">−{delCount}</span>
                        <span className="stat-files">{draft.files.length} file{draft.files.length !== 1 ? 's' : ''}</span>
                    </div>

                    <div className="commit-files">
                        {draft.files.map(f => (
                            <div
                                key={f.path}
                                className="file-entry"
                                onClick={() => selectFile(f.path)}
                                title={f.path}
                            >
                                <span className={`change-badge ${f.changeType}`}>
                                    {f.changeType[0].toUpperCase()}
                                </span>
                                <span className="file-name">{f.path.replace(/\\/g, '/').split('/').pop()}</span>
                                <span className="file-path">{f.path}</span>
                            </div>
                        ))}
                    </div>

                    {editing ? (
                        <div className="commit-edit">
                            <textarea
                                className="commit-edit-textarea"
                                value={editMessage}
                                onChange={(e) => setEditMessage(e.target.value)}
                                rows={4}
                            />
                            <div className="commit-edit-actions">
                                <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); setEditMessage(draft.message); }}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className="commit-actions">
                            <button className="btn btn-sm" onClick={() => setEditing(true)} title="Edit">✏️ Edit</button>
                            <button className="btn btn-sm" onClick={() => removeDraft(draft.id)} title="Delete">🗑️</button>
                            <button className="btn btn-primary btn-sm" onClick={handleCommitSingle} title="Commit">✅ Commit</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
