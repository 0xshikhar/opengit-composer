import React from 'react';
import { Sparkles, Layers, Plus, FileCode, CheckCircle2, ArrowRight } from 'lucide-react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';
import FileDiffAccordion from './FileDiffAccordion';

interface WorkingChangesOverviewProps {
    onAutoCompose: () => void;
    isLoading: boolean;
}

export default function WorkingChangesOverview({ onAutoCompose, isLoading }: WorkingChangesOverviewProps) {
    const { stagedFiles, unstagedFiles } = useCommitStore();
    const { postMessage } = useVSCodeAPI();

    const stagedAdd = stagedFiles.reduce((acc, f) => acc + (f.additions || 0), 0);
    const stagedDel = stagedFiles.reduce((acc, f) => acc + (f.deletions || 0), 0);

    const handleOpenFile = (path: string) => {
        postMessage('openFile', { path });
    };

    const handleStageAll = () => {
        postMessage('stageAll');
    };

    const handleStageFile = (path: string) => {
        postMessage('stageFiles', { paths: [path] });
    };

    if (stagedFiles.length === 0) {
        return (
            <div className="gc-working-overview empty-state">
                <div className="gc-overview-empty-card">
                    <div className="gc-overview-empty-icon">
                        <Layers size={36} />
                    </div>
                    <h3>No Staged Changes Yet</h3>
                    <p className="gc-overview-empty-desc">
                        OpenGit Composer groups staged changes into clean, semantic commits. Stage your working changes to start composing.
                    </p>

                    {unstagedFiles.length > 0 ? (
                        <div className="gc-overview-unstaged-section">
                            <div className="gc-unstaged-header">
                                <span className="section-label">Working Directory Changes ({unstagedFiles.length})</span>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleStageAll}
                                >
                                    <Plus size={13} /> Stage All Changes
                                </button>
                            </div>
                            <div className="gc-unstaged-list">
                                {unstagedFiles.slice(0, 8).map((file) => (
                                    <div key={file.path} className="gc-unstaged-row">
                                        <FileCode size={13} className="gc-file-icon" />
                                        <span className="gc-unstaged-name" title={file.path}>{file.path}</span>
                                        <span className={`change-badge ${file.changeType}`}>{file.changeType[0]?.toUpperCase()}</span>
                                        <button
                                            type="button"
                                            className="btn-icon-action"
                                            title="Stage this file"
                                            onClick={() => handleStageFile(file.path)}
                                        >
                                            <Plus size={13} />
                                        </button>
                                    </div>
                                ))}
                                {unstagedFiles.length > 8 && (
                                    <div className="gc-unstaged-more">
                                        + {unstagedFiles.length - 8} more files in sidebar
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="gc-overview-clean-box">
                            <CheckCircle2 size={16} />
                            <span>Working tree clean. Modify code or switch branches to begin.</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="gc-working-overview">
            <div className="gc-overview-banner">
                <div className="gc-overview-banner-copy">
                    <div className="gc-overview-badge">Ready For AI Analysis</div>
                    <h3>{stagedFiles.length} Staged File{stagedFiles.length !== 1 ? 's' : ''} Ready to Compose</h3>
                    <p>
                        Review your staged changes below. Click <strong>Auto-Compose Commits</strong> on the left to analyze diffs and group them into atomic commits.
                    </p>
                </div>
                <button
                    type="button"
                    className="btn btn-primary gc-banner-btn"
                    onClick={onAutoCompose}
                    disabled={isLoading}
                >
                    {isLoading ? 'Analyzing Changes...' : '⚡ Auto-Compose Commits'}
                </button>
            </div>

            <div className="gc-overview-stats-bar">
                <div className="gc-stat-item">
                    <span className="gc-stat-label">Files Staged</span>
                    <span className="gc-stat-val">{stagedFiles.length}</span>
                </div>
                <div className="gc-stat-item">
                    <span className="gc-stat-label">Additions</span>
                    <span className="gc-stat-val stat-add">+{stagedAdd}</span>
                </div>
                <div className="gc-stat-item">
                    <span className="gc-stat-label">Deletions</span>
                    <span className="gc-stat-val stat-del">−{stagedDel}</span>
                </div>
            </div>

            <FileDiffAccordion
                files={stagedFiles}
                onOpenFile={handleOpenFile}
            />
        </div>
    );
}
