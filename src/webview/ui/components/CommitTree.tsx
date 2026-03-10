import React from 'react';
import { useCommitStore } from '../store/commitStore';
import CommitTreeItem from './CommitTreeItem';

export default function CommitTree() {
    const { drafts, selectedDraftId, selectDraft, reorderDrafts } = useCommitStore();

    if (drafts.length === 0) {
        return (
            <div className="commit-tree-empty">
                <p className="empty-text">No draft commits yet.</p>
                <p className="empty-hint">Stage changes and click <strong>Auto-Compose</strong> to generate intelligent commit proposals.</p>
            </div>
        );
    }

    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (fromIndex !== toIndex) {
            reorderDrafts(fromIndex, toIndex);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    return (
        <div className="commit-tree">
            <div className="commit-tree-header">
                <span className="section-label">Draft Commits ({drafts.length})</span>
            </div>
            <div className="commit-tree-list">
                {drafts.map((draft, index) => (
                    <div
                        key={draft.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragOver={handleDragOver}
                    >
                        <CommitTreeItem
                            draft={draft}
                            isSelected={selectedDraftId === draft.id}
                            onSelect={() => selectDraft(draft.id)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
