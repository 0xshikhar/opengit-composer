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
    const [query, setQuery] = useState('');
    const [wrap, setWrap] = useState(false);
    const [activeMatchIndex, setActiveMatchIndex] = useState(0);

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
        setQuery('');
        setActiveMatchIndex(0);
    }, [file.path]);

    const matchLineIndexes = useMemo(() => {
        const trimmed = query.trim();
        if (!trimmed) return [];
        const needle = trimmed.toLowerCase();
        const visible = lines.slice(0, lineLimit);
        const indexes: number[] = [];
        for (let i = 0; i < visible.length; i++) {
            if (visible[i].toLowerCase().includes(needle)) {
                indexes.push(i);
            }
        }
        return indexes;
    }, [lines, lineLimit, query]);

    useEffect(() => {
        if (matchLineIndexes.length === 0) return;
        const clamped = Math.max(0, Math.min(activeMatchIndex, matchLineIndexes.length - 1));
        if (clamped !== activeMatchIndex) setActiveMatchIndex(clamped);
    }, [activeMatchIndex, matchLineIndexes.length]);

    const focusMatch = (index: number) => {
        if (matchLineIndexes.length === 0) return;
        const wrappedIndex = ((index % matchLineIndexes.length) + matchLineIndexes.length) % matchLineIndexes.length;
        setActiveMatchIndex(wrappedIndex);
        const lineIdx = matchLineIndexes[wrappedIndex];
        const el = document.getElementById(`diff-line-${lineIdx}`);
        if (el) el.scrollIntoView({ block: 'center' });
    };

    const renderHighlighted = (line: string) => {
        const trimmed = query.trim();
        if (!trimmed) return line || ' ';
        const needle = trimmed.toLowerCase();
        const lower = line.toLowerCase();
        const idx = lower.indexOf(needle);
        if (idx === -1) return line || ' ';

        const before = line.slice(0, idx);
        const match = line.slice(idx, idx + trimmed.length);
        const after = line.slice(idx + trimmed.length);
        return (
            <>
                {before}
                <mark className="diff-mark">{match}</mark>
                {after}
            </>
        );
    };

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
                <div key={i} id={`diff-line-${i}`} className={cls}>
                    <span className="diff-line-num">{i + 1}</span>
                    <span className="diff-line-content">{renderHighlighted(line)}</span>
                </div>
            );
        });
    };

    return (
        <div className={`diff-viewer ${wrap ? 'diff-wrap' : ''}`}>
            <div className="diff-header">
                <span className="diff-file-name">{selectedFilePath}</span>
                <div className="diff-header-stats">
                    <span className="stat-add">+{file.additions}</span>
                    <span className="stat-del">−{file.deletions}</span>
                </div>
                <div className="diff-search">
                    <input
                        className="diff-search-input"
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search diff…"
                        spellCheck={false}
                    />
                    {query.trim() ? (
                        <span className="diff-search-count" title="Matches in the currently visible lines">
                            {matchLineIndexes.length ? `${activeMatchIndex + 1}/${matchLineIndexes.length}` : '0/0'}
                        </span>
                    ) : null}
                    <button
                        className="btn btn-sm"
                        onClick={() => focusMatch(activeMatchIndex - 1)}
                        disabled={matchLineIndexes.length === 0}
                        title="Previous match"
                    >
                        ↑
                    </button>
                    <button
                        className="btn btn-sm"
                        onClick={() => focusMatch(activeMatchIndex + 1)}
                        disabled={matchLineIndexes.length === 0}
                        title="Next match"
                    >
                        ↓
                    </button>
                    <button
                        className="btn btn-sm"
                        onClick={() => setWrap(value => !value)}
                        title={wrap ? 'Disable line wrapping' : 'Enable line wrapping'}
                    >
                        {wrap ? 'Wrap: On' : 'Wrap: Off'}
                    </button>
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
