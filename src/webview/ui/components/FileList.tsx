import React, { useState } from 'react';
import { useCommitStore } from '../store/commitStore';

export default function FileList() {
    const { stagedFiles, unstagedFiles, selectFile } = useCommitStore();
    const [expanded, setExpanded] = useState(false);
    const [showUnstaged, setShowUnstaged] = useState(true);

    if (stagedFiles.length === 0 && unstagedFiles.length === 0) {
        return (
            <div className="file-list-empty">
                <p className="empty-text">No working changes.</p>
                <p className="empty-hint">Stage files with <code>git add</code> to begin composing.</p>
            </div>
        );
    }

    const totalAdd = stagedFiles.reduce((acc, f) => acc + f.additions, 0);
    const totalDel = stagedFiles.reduce((acc, f) => acc + f.deletions, 0);
    const visibleFiles = expanded ? stagedFiles : stagedFiles.slice(0, 200);
    const unstagedAdd = unstagedFiles.reduce((acc, f) => acc + f.additions, 0);
    const unstagedDel = unstagedFiles.reduce((acc, f) => acc + f.deletions, 0);

    return (
        <div className="file-list">
            <div className="file-list-header">
                <span className="section-label">
                    Staged Changes ({stagedFiles.length})
                </span>
                <div className="file-list-stats">
                    <span className="stat-add">+{totalAdd}</span>
                    <span className="stat-del">−{totalDel}</span>
                </div>
            </div>
            <div className="file-list-items">
                {visibleFiles.map(file => (
                    <div
                        key={file.path}
                        className="file-list-item"
                        onClick={() => selectFile(file.path)}
                        title={file.path}
                    >
                        <span className={`change-badge ${file.changeType}`}>
                            {file.changeType[0].toUpperCase()}
                        </span>
                        <span className="file-name">
                            {file.path.split('/').pop()}
                        </span>
                        <span className="file-stats">
                            <span className="stat-add">+{file.additions}</span>
                            <span className="stat-del">−{file.deletions}</span>
                        </span>
                    </div>
                ))}
                {!expanded && stagedFiles.length > 200 && (
                    <div className="file-list-load-more">
                        <span className="empty-hint">Showing 200 of {stagedFiles.length} files</span>
                        <button className="btn btn-sm" onClick={() => setExpanded(true)}>
                            Show All
                        </button>
                    </div>
                )}
            </div>

            <div className="file-list-header file-list-sub-header">
                <span className="section-label">
                    Unstaged Changes ({unstagedFiles.length})
                </span>
                <div className="file-list-stats">
                    <span className="stat-add">+{unstagedAdd}</span>
                    <span className="stat-del">−{unstagedDel}</span>
                    <button className="btn btn-sm" onClick={() => setShowUnstaged(value => !value)}>
                        {showUnstaged ? 'Hide' : 'Show'}
                    </button>
                </div>
            </div>
            {showUnstaged && (
                <div className="file-list-items">
                    {unstagedFiles.map(file => (
                        <div
                            key={`unstaged-${file.path}`}
                            className="file-list-item unstaged"
                            onClick={() => selectFile(file.path)}
                            title={file.path}
                        >
                            <span className={`change-badge ${file.changeType}`}>
                                {file.changeType[0].toUpperCase()}
                            </span>
                            <span className="file-name">
                                {file.path.split('/').pop()}
                            </span>
                            <span className="file-stats">
                                <span className="stat-add">+{file.additions}</span>
                                <span className="stat-del">−{file.deletions}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
