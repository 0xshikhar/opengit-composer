import React, { useState } from 'react';
import { useCommitStore } from '../store/commitStore';

export default function CommitEditor() {
    const { selectedDraftId, drafts, updateDraftMessage, setActiveView } = useCommitStore();
    const draft = drafts.find(d => d.id === selectedDraftId) || null;
    const [message, setMessage] = useState(() => draft?.message || '');

    React.useEffect(() => {
        setMessage(draft?.message || '');
    }, [draft?.id, draft?.message]);

    if (!selectedDraftId || !draft) {
        return null;
    }

    const subjectLength = message.split('\n')[0].length;
    const isOverLimit = subjectLength > 72;

    const handleSave = () => {
        updateDraftMessage(draft.id, message);
    };

    return (
        <div className="commit-editor">
            <div className="commit-editor-header">
                <span className="section-label">Edit Commit Message</span>
                <button className="btn btn-sm" onClick={() => setActiveView('tree')}>✕</button>
            </div>
            <div className="commit-editor-body">
                <textarea
                    className="commit-editor-textarea"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={6}
                    placeholder="type(scope): subject&#10;&#10;body"
                    spellCheck={false}
                />
                <div className="commit-editor-hints">
                    <span className={`char-count ${isOverLimit ? 'over-limit' : ''}`}>
                        Subject: {subjectLength}/72
                    </span>
                    <span className="format-hint">
                        Format: type(scope): subject
                    </span>
                </div>
                <div className="commit-editor-actions">
                    <button className="btn btn-primary" onClick={handleSave}>
                        💾 Save Message
                    </button>
                    <button className="btn btn-secondary" onClick={() => setMessage(draft.message)}>
                        ↩ Reset
                    </button>
                </div>
            </div>
        </div>
    );
}
