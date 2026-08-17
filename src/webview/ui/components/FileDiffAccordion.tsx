import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode, ChevronsUpDown, ExternalLink } from 'lucide-react';
import { FileChange } from '../store/commitStore';

interface FileDiffAccordionProps {
    files: FileChange[];
    onOpenFile?: (path: string) => void;
}

export default function FileDiffAccordion({ files, onOpenFile }: FileDiffAccordionProps) {
    // Default the first 3 files to open, rest collapsed
    const [openFiles, setOpenFiles] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        files.slice(0, 3).forEach((f) => {
            initial[f.path] = true;
        });
        return initial;
    });

    const toggleFile = (filePath: string) => {
        setOpenFiles((prev) => ({
            ...prev,
            [filePath]: !prev[filePath],
        }));
    };

    const expandAll = () => {
        const all: Record<string, boolean> = {};
        files.forEach((f) => {
            all[f.path] = true;
        });
        setOpenFiles(all);
    };

    const collapseAll = () => {
        setOpenFiles({});
    };

    const renderDiffContent = (diff: string) => {
        if (!diff || diff.trim() === '') {
            return <div className="gc-diff-binary">Binary file or no text diff available.</div>;
        }

        const lines = diff.split('\n');
        let oldLineNum = 0;
        let newLineNum = 0;

        return (
            <div className="gc-diff-table">
                {lines.map((line, idx) => {
                    let typeClass = 'gc-diff-context';
                    let lineOld = '';
                    let lineNew = '';

                    if (line.startsWith('@@')) {
                        typeClass = 'gc-diff-hunk';
                        // Parse hunk header @@ -old,count +new,count @@
                        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
                        if (match) {
                            oldLineNum = parseInt(match[1], 10);
                            newLineNum = parseInt(match[2], 10);
                        }
                    } else if (line.startsWith('+') && !line.startsWith('+++')) {
                        typeClass = 'gc-diff-add';
                        lineNew = String(newLineNum++);
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                        typeClass = 'gc-diff-del';
                        lineOld = String(oldLineNum++);
                    } else if (line.startsWith('diff ') || line.startsWith('index ')) {
                        typeClass = 'gc-diff-meta';
                    } else {
                        lineOld = String(oldLineNum++);
                        lineNew = String(newLineNum++);
                    }

                    return (
                        <div key={idx} className={`gc-diff-row ${typeClass}`}>
                            <span className="gc-diff-num gc-diff-num-old">{lineOld}</span>
                            <span className="gc-diff-num gc-diff-num-new">{lineNew}</span>
                            <span className="gc-diff-line-content">{line || ' '}</span>
                        </div>
                    );
                })}
            </div>
        );
    };

    const allExpanded = files.length > 0 && files.every((f) => openFiles[f.path]);

    return (
        <div className="gc-diff-accordion-container">
            <div className="gc-diff-accordion-header">
                <span className="gc-diff-section-label">Files Changed ({files.length})</span>
                <div className="gc-diff-controls">
                    <button
                        type="button"
                        className="btn-text-action"
                        onClick={allExpanded ? collapseAll : expandAll}
                    >
                        <ChevronsUpDown size={13} />
                        {allExpanded ? 'Collapse All' : 'Expand All'}
                    </button>
                </div>
            </div>

            <div className="gc-diff-accordion-list">
                {files.map((file) => {
                    const isOpen = Boolean(openFiles[file.path]);
                    const changeType = file.changeType || 'modified';
                    const badgeText = changeType.toUpperCase();

                    return (
                        <div key={file.path} className={`gc-diff-file-card ${isOpen ? 'open' : ''}`}>
                            <div
                                className="gc-diff-file-header"
                                onClick={() => toggleFile(file.path)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        toggleFile(file.path);
                                    }
                                }}
                            >
                                <span className="gc-diff-chevron">
                                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                                <FileCode size={14} className="gc-file-icon" />
                                <span className="gc-diff-file-path" title={file.path}>
                                    {file.path}
                                </span>

                                <span className={`gc-change-badge badge-${changeType}`}>
                                    {badgeText}
                                </span>

                                {(file.additions > 0 || file.deletions > 0) && (
                                    <span className="gc-diff-stat-pills">
                                        {file.additions > 0 && <span className="stat-add">+{file.additions}</span>}
                                        {file.deletions > 0 && <span className="stat-del">−{file.deletions}</span>}
                                    </span>
                                )}

                                {onOpenFile && (
                                    <button
                                        type="button"
                                        className="btn-icon-action gc-diff-open-btn"
                                        title="Open file in editor"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenFile(file.path);
                                        }}
                                    >
                                        <ExternalLink size={13} />
                                    </button>
                                )}
                            </div>

                            {isOpen && (
                                <div className="gc-diff-file-body">
                                    {renderDiffContent(file.diff)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
