import React, { useEffect, useMemo, useState } from 'react';
import { useCommitStore } from '../store/commitStore';

/**
 * DiffViewer — shows a styled diff output for the selected file.
 * (Monaco editor is not easily embeddable in a VS Code sidebar webview
 *  due to CSP restrictions. We use a lightweight syntax-highlighted diff view instead.)
 */
export default function DiffViewer() {
    const { selectedFilePath, drafts, stagedFiles, unstagedFiles, activeView, setActiveView } = useCommitStore();
    const [lineLimit, setLineLimit] = useState(600);

    if (activeView !== 'diff' || !selectedFilePath) {
        return null;
    }

    // Find the diff string from staged files or drafts
    const file = stagedFiles.find(f => f.path === selectedFilePath)
        || unstagedFiles.find(f => f.path === selectedFilePath)
        || drafts.flatMap(d => d.files).find(f => f.path === selectedFilePath);

    if (!file) {
        return (
            <div className="diff-viewer">
                <div className="diff-header">
                    <span>No diff available</span>
                    <button className="btn btn-sm" onClick={() => setActiveView('tree')}>✕</button>
                </div>
            </div>
        );
    }

    const lines = useMemo(() => {
        if (!file.diff || file.diff.trim() === '') return [];
        return file.diff.split('\n');
    }, [file.diff]);

    useEffect(() => {
        setLineLimit(600);
    }, [file.path]);

    const renderDiffLines = () => {
        if (lines.length === 0) {
            return <div className="diff-empty">Binary file or no text diff available.</div>;
        }

        return lines.slice(0, lineLimit).map((line, i) => {
            let cls = 'diff-line';
            if (line.startsWith('+') && !line.startsWith('+++')) cls += ' diff-add';
            else if (line.startsWith('-') && !line.startsWith('---')) cls += ' diff-del';
            else if (line.startsWith('@@')) cls += ' diff-hunk';
            else if (line.startsWith('diff ') || line.startsWith('index ')) cls += ' diff-meta';

            return (
                <div key={i} className={cls}>
                    <span className="diff-line-num">{i + 1}</span>
                    <span className="diff-line-content">{line || ' '}</span>
                </div>
            );
        });
    };

    return (
        <div className="diff-viewer">
            <div className="diff-header">
                <span className="diff-file-name">{selectedFilePath}</span>
                <div className="diff-header-stats">
                    <span className="stat-add">+{file.additions}</span>
                    <span className="stat-del">−{file.deletions}</span>
                </div>
                <button className="btn btn-sm" onClick={() => setActiveView('tree')}>✕ Close</button>
            </div>
            <div className="diff-content">
                {renderDiffLines()}
            </div>
            {lines.length > lineLimit && (
                <div className="diff-footer">
                    <span className="diff-footer-text">
                        Showing {lineLimit} of {lines.length} lines
                    </span>
                    <button className="btn btn-sm" onClick={() => setLineLimit(limit => limit + 600)}>
                        Show More
                    </button>
                </div>
            )}
            {lineLimit > 600 && (
                <div className="diff-footer">
                    <button className="btn btn-sm" onClick={() => setLineLimit(600)}>
                        Collapse
                    </button>
                </div>
            )}
            {lines.length > 3000 && (
                <div className="diff-footer">
                    <span className="diff-footer-text">Large diff detected. Use file-level review for best performance.</span>
                </div>
            )}
        </div>
    );
}
