import React, { useMemo, useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    ExternalLink,
    FileCode,
    Folder,
    FolderOpen,
    Minus,
    Plus,
    Undo2,
    X,
} from 'lucide-react';
import { useCommitStore, FileChange } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';

interface FileTreeNode {
    name: string;
    path: string;
    isFolder: boolean;
    file?: FileChange;
    children: FileTreeNode[];
    fileCount: number;
    additions: number;
    deletions: number;
}

function buildFileTree(files: FileChange[]): FileTreeNode[] {
    const rootMap: Record<string, any> = {};

    for (const file of files) {
        const segments = file.path.replace(/\\/g, '/').split('/').filter(Boolean);
        let current = rootMap;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const isLast = i === segments.length - 1;
            const subPath = segments.slice(0, i + 1).join('/');

            if (!current[segment]) {
                current[segment] = {
                    node: {
                        name: segment,
                        path: subPath,
                        isFolder: !isLast,
                        file: isLast ? file : undefined,
                        children: [],
                        fileCount: isLast ? 1 : 0,
                        additions: isLast ? file.additions : 0,
                        deletions: isLast ? file.deletions : 0,
                    } as FileTreeNode,
                    children: {},
                };
            } else if (isLast) {
                current[segment].node.file = file;
                current[segment].node.isFolder = false;
                current[segment].node.additions = file.additions;
                current[segment].node.deletions = file.deletions;
            }

            current = current[segment].children;
        }
    }

    function convertChildren(map: Record<string, any>): FileTreeNode[] {
        const nodes: FileTreeNode[] = [];

        for (const key of Object.keys(map)) {
            const entry = map[key];
            const node = entry.node as FileTreeNode;

            if (node.isFolder) {
                node.children = convertChildren(entry.children);
                node.fileCount = node.children.reduce((acc, c) => acc + c.fileCount, 0);
                node.additions = node.children.reduce((acc, c) => acc + c.additions, 0);
                node.deletions = node.children.reduce((acc, c) => acc + c.deletions, 0);
            }

            nodes.push(node);
        }

        nodes.sort((a, b) => {
            if (a.isFolder !== b.isFolder) {
                return a.isFolder ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        return nodes;
    }

    return convertChildren(rootMap);
}

function getAllFilesUnderNode(node: FileTreeNode): string[] {
    if (!node.isFolder && node.file) {
        return [node.file.path];
    }
    const paths: string[] = [];
    for (const child of node.children) {
        paths.push(...getAllFilesUnderNode(child));
    }
    return paths;
}

interface TreeItemProps {
    node: FileTreeNode;
    level: number;
    isStaged: boolean;
    selectedFilePaths: string[];
    collapsedFolders: Record<string, boolean>;
    onToggleFolder: (path: string) => void;
    onOpenFile: (path: string, e: React.MouseEvent) => void;
    onRowClick: (file: FileChange, isStaged: boolean, e: React.MouseEvent) => void;
    onStage: (paths: string[], e?: React.MouseEvent) => void;
    onUnstage: (paths: string[], e?: React.MouseEvent) => void;
    onDiscard: (paths: string[], e?: React.MouseEvent) => void;
}

function FileTreeNodeItem({
    node,
    level,
    isStaged,
    selectedFilePaths,
    collapsedFolders,
    onToggleFolder,
    onOpenFile,
    onRowClick,
    onStage,
    onUnstage,
    onDiscard,
}: TreeItemProps) {
    const isCollapsed = Boolean(collapsedFolders[node.path]);

    if (node.isFolder) {
        return (
            <div className="file-tree-group">
                <div
                    className="file-tree-row file-tree-folder"
                    style={{ paddingLeft: `${8 + level * 14}px` }}
                    onClick={() => onToggleFolder(node.path)}
                    title={node.path}
                >
                    <span className="file-tree-chevron">
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                    <span className="file-tree-folder-icon">
                        {isCollapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
                    </span>
                    <span className="file-tree-name folder-name">{node.name}</span>
                    <span className="file-tree-badge">{node.fileCount}</span>

                    <div className="file-tree-actions" onClick={(e) => e.stopPropagation()}>
                        {isStaged ? (
                            <button
                                type="button"
                                className="btn-icon-action"
                                title="Unstage folder changes"
                                onClick={(e) => onUnstage(getAllFilesUnderNode(node), e)}
                            >
                                <Minus size={13} />
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="btn-icon-action btn-icon-danger"
                                    title="Discard folder changes"
                                    onClick={(e) => onDiscard(getAllFilesUnderNode(node), e)}
                                >
                                    <Undo2 size={13} />
                                </button>
                                <button
                                    type="button"
                                    className="btn-icon-action"
                                    title="Stage folder changes"
                                    onClick={(e) => onStage(getAllFilesUnderNode(node), e)}
                                >
                                    <Plus size={13} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {!isCollapsed &&
                    node.children.map((child) => (
                        <FileTreeNodeItem
                            key={child.path}
                            node={child}
                            level={level + 1}
                            isStaged={isStaged}
                            selectedFilePaths={selectedFilePaths}
                            collapsedFolders={collapsedFolders}
                            onToggleFolder={onToggleFolder}
                            onOpenFile={onOpenFile}
                            onRowClick={onRowClick}
                            onStage={onStage}
                            onUnstage={onUnstage}
                            onDiscard={onDiscard}
                        />
                    ))}
            </div>
        );
    }

    const isSelected = selectedFilePaths.includes(node.path);
    const changeType = node.file?.changeType || 'modified';
    const badgeChar = changeType[0]?.toUpperCase() || 'M';

    return (
        <div
            className={`file-tree-row file-tree-file ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${20 + level * 14}px` }}
            onClick={(e) => node.file && onRowClick(node.file, isStaged, e)}
            title={node.path}
        >
            <span className="file-tree-file-icon">
                <FileCode size={13} />
            </span>
            <span className="file-tree-name file-name">{node.name}</span>

            {(node.additions > 0 || node.deletions > 0) && (
                <span className="file-tree-stats">
                    {node.additions > 0 && <span className="stat-add">+{node.additions}</span>}
                    {node.deletions > 0 && <span className="stat-del">−{node.deletions}</span>}
                </span>
            )}

            <div className="file-tree-actions" onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    className="btn-icon-action"
                    title="Open file in editor"
                    onClick={(e) => onOpenFile(node.path, e)}
                >
                    <ExternalLink size={13} />
                </button>

                {isStaged ? (
                    <button
                        type="button"
                        className="btn-icon-action"
                        title="Unstage changes"
                        onClick={(e) => onUnstage([node.path], e)}
                    >
                        <Minus size={13} />
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            className="btn-icon-action btn-icon-danger"
                            title="Discard changes"
                            onClick={(e) => onDiscard([node.path], e)}
                        >
                            <Undo2 size={13} />
                        </button>
                        <button
                            type="button"
                            className="btn-icon-action"
                            title="Stage changes"
                            onClick={(e) => onStage([node.path], e)}
                        >
                            <Plus size={13} />
                        </button>
                    </>
                )}
            </div>

            <span className={`change-badge ${changeType}`} title={changeType}>
                {badgeChar}
            </span>
        </div>
    );
}

export default function FileList() {
    const {
        stagedFiles,
        unstagedFiles,
        selectedFilePaths,
        setSelectedFilePaths,
        toggleFileSelection,
        clearFileSelection,
        selectFile,
    } = useCommitStore();
    const { postMessage } = useVSCodeAPI();

    const [showStaged, setShowStaged] = useState(true);
    const [showUnstaged, setShowUnstaged] = useState(true);
    const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
    const [query, setQuery] = useState('');

    const normalizedQuery = query.trim().toLowerCase();

    const stagedFiltered = useMemo(() => {
        if (!normalizedQuery) return stagedFiles;
        return stagedFiles.filter((f) => f.path.toLowerCase().includes(normalizedQuery));
    }, [normalizedQuery, stagedFiles]);

    const unstagedFiltered = useMemo(() => {
        if (!normalizedQuery) return unstagedFiles;
        return unstagedFiles.filter((f) => f.path.toLowerCase().includes(normalizedQuery));
    }, [normalizedQuery, unstagedFiles]);

    const totalStagedAdd = stagedFiltered.reduce((acc, f) => acc + f.additions, 0);
    const totalStagedDel = stagedFiltered.reduce((acc, f) => acc + f.deletions, 0);
    const totalUnstagedAdd = unstagedFiltered.reduce((acc, f) => acc + f.additions, 0);
    const totalUnstagedDel = unstagedFiltered.reduce((acc, f) => acc + f.deletions, 0);

    const stagedTree = useMemo(() => buildFileTree(stagedFiltered), [stagedFiltered]);
    const unstagedTree = useMemo(() => buildFileTree(unstagedFiltered), [unstagedFiltered]);

    const selectedStagedPaths = useMemo(() => {
        const stagedSet = new Set(stagedFiles.map((f) => f.path));
        return selectedFilePaths.filter((p) => stagedSet.has(p));
    }, [selectedFilePaths, stagedFiles]);

    const selectedUnstagedPaths = useMemo(() => {
        const unstagedSet = new Set(unstagedFiles.map((f) => f.path));
        return selectedFilePaths.filter((p) => unstagedSet.has(p));
    }, [selectedFilePaths, unstagedFiles]);

    const toggleFolder = (folderPath: string) => {
        setCollapsedFolders((prev) => ({
            ...prev,
            [folderPath]: !prev[folderPath],
        }));
    };

    const handleRowClick = (file: FileChange, isStaged: boolean, e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
            toggleFileSelection(file.path, true);
        } else if (e.shiftKey && selectedFilePaths.length > 0) {
            const allPaths = [...stagedFiltered.map((f) => f.path), ...unstagedFiltered.map((f) => f.path)];
            const lastSelected = selectedFilePaths[selectedFilePaths.length - 1];
            const lastIdx = allPaths.indexOf(lastSelected);
            const currIdx = allPaths.indexOf(file.path);
            if (lastIdx !== -1 && currIdx !== -1) {
                const start = Math.min(lastIdx, currIdx);
                const end = Math.max(lastIdx, currIdx);
                const range = allPaths.slice(start, end + 1);
                const union = Array.from(new Set([...selectedFilePaths, ...range]));
                setSelectedFilePaths(union);
            } else {
                toggleFileSelection(file.path, false);
            }
        } else {
            setSelectedFilePaths([file.path]);
            selectFile(file.path);
            postMessage('openDiff', { path: file.path, staged: isStaged });
        }
    };

    const handleOpenFile = (filePath: string, e: React.MouseEvent) => {
        e.stopPropagation();
        postMessage('openFile', { path: filePath });
    };

    const handleStage = (paths: string[], e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (paths.length === 0) return;
        postMessage('stageFiles', { paths });
    };

    const handleUnstage = (paths: string[], e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (paths.length === 0) return;
        postMessage('unstageFiles', { paths });
    };

    const handleDiscard = (paths: string[], e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (paths.length === 0) return;
        postMessage('discardFiles', { paths });
    };

    const handleStageAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        postMessage('stageAll');
    };

    const handleUnstageAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        postMessage('unstageAll');
    };

    const handleDiscardAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        postMessage('discardAll');
    };

    if (stagedFiles.length === 0 && unstagedFiles.length === 0) {
        return (
            <div className="file-list-empty">
                <p className="empty-text">No working changes.</p>
                <p className="empty-hint">Edit files or stage changes to begin composing.</p>
            </div>
        );
    }

    return (
        <div className="file-list-container">
            {/* Filter toolbar */}
            <div className="file-list-toolbar">
                <input
                    className="file-filter-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter files…"
                    spellCheck={false}
                />
                {query.trim() ? (
                    <button className="btn btn-sm" type="button" onClick={() => setQuery('')} title="Clear filter">
                        Clear
                    </button>
                ) : null}
            </div>

            {/* Batch actions bar for multi-selection */}
            {selectedFilePaths.length > 1 && (
                <div className="file-list-batch-bar">
                    <span className="batch-count">{selectedFilePaths.length} selected</span>
                    <div className="batch-actions">
                        {selectedUnstagedPaths.length > 0 && (
                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleStage(selectedUnstagedPaths)}
                                title="Stage Selected"
                            >
                                <Plus size={12} /> Stage
                            </button>
                        )}
                        {selectedStagedPaths.length > 0 && (
                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleUnstage(selectedStagedPaths)}
                                title="Unstage Selected"
                            >
                                <Minus size={12} /> Unstage
                            </button>
                        )}
                        {selectedUnstagedPaths.length > 0 && (
                            <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={() => handleDiscard(selectedUnstagedPaths)}
                                title="Discard Selected Changes"
                            >
                                <Undo2 size={12} /> Discard
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn-icon-action"
                            onClick={clearFileSelection}
                            title="Clear selection"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Staged Changes Section */}
            <div className="file-section-header">
                <button
                    className="file-section-toggle"
                    type="button"
                    onClick={() => setShowStaged((v) => !v)}
                    title={showStaged ? 'Collapse Staged Changes' : 'Expand Staged Changes'}
                >
                    <span className="file-section-chevron">
                        {showStaged ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="section-label">Staged Changes</span>
                    <span className="file-section-count">
                        {stagedFiltered.length}
                        {normalizedQuery ? `/${stagedFiles.length}` : ''}
                    </span>
                </button>

                <div className="file-section-right">
                    <div className="file-section-actions">
                        {stagedFiltered.length > 0 && (
                            <button
                                type="button"
                                className="btn-icon-action"
                                title="Unstage All Changes"
                                onClick={handleUnstageAll}
                            >
                                <Minus size={14} />
                            </button>
                        )}
                    </div>
                    {(totalStagedAdd > 0 || totalStagedDel > 0) && (
                        <div className="file-list-stats">
                            {totalStagedAdd > 0 && <span className="stat-add">+{totalStagedAdd}</span>}
                            {totalStagedDel > 0 && <span className="stat-del">−{totalStagedDel}</span>}
                        </div>
                    )}
                </div>
            </div>

            {showStaged && (
                <div className="file-list-tree-items">
                    {stagedTree.length === 0 ? (
                        <div className="file-list-subempty">No staged changes</div>
                    ) : (
                        stagedTree.map((node) => (
                            <FileTreeNodeItem
                                key={`staged-${node.path}`}
                                node={node}
                                level={0}
                                isStaged={true}
                                selectedFilePaths={selectedFilePaths}
                                collapsedFolders={collapsedFolders}
                                onToggleFolder={toggleFolder}
                                onOpenFile={handleOpenFile}
                                onRowClick={handleRowClick}
                                onStage={handleStage}
                                onUnstage={handleUnstage}
                                onDiscard={handleDiscard}
                            />
                        ))
                    )}
                </div>
            )}

            {/* Changes (Unstaged) Section */}
            <div className="file-section-header file-list-sub-header">
                <button
                    className="file-section-toggle"
                    type="button"
                    onClick={() => setShowUnstaged((v) => !v)}
                    title={showUnstaged ? 'Collapse Changes' : 'Expand Changes'}
                >
                    <span className="file-section-chevron">
                        {showUnstaged ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="section-label">Changes</span>
                    <span className="file-section-count">
                        {unstagedFiltered.length}
                        {normalizedQuery ? `/${unstagedFiles.length}` : ''}
                    </span>
                </button>

                <div className="file-section-right">
                    <div className="file-section-actions">
                        {unstagedFiltered.length > 0 && (
                            <>
                                <button
                                    type="button"
                                    className="btn-icon-action btn-icon-danger"
                                    title="Discard All Changes"
                                    onClick={handleDiscardAll}
                                >
                                    <Undo2 size={14} />
                                </button>
                                <button
                                    type="button"
                                    className="btn-icon-action"
                                    title="Stage All Changes"
                                    onClick={handleStageAll}
                                >
                                    <Plus size={14} />
                                </button>
                            </>
                        )}
                    </div>
                    {(totalUnstagedAdd > 0 || totalUnstagedDel > 0) && (
                        <div className="file-list-stats">
                            {totalUnstagedAdd > 0 && <span className="stat-add">+{totalUnstagedAdd}</span>}
                            {totalUnstagedDel > 0 && <span className="stat-del">−{totalUnstagedDel}</span>}
                        </div>
                    )}
                </div>
            </div>

            {showUnstaged && (
                <div className="file-list-tree-items">
                    {unstagedTree.length === 0 ? (
                        <div className="file-list-subempty">No unstaged changes</div>
                    ) : (
                        unstagedTree.map((node) => (
                            <FileTreeNodeItem
                                key={`unstaged-${node.path}`}
                                node={node}
                                level={0}
                                isStaged={false}
                                selectedFilePaths={selectedFilePaths}
                                collapsedFolders={collapsedFolders}
                                onToggleFolder={toggleFolder}
                                onOpenFile={handleOpenFile}
                                onRowClick={handleRowClick}
                                onStage={handleStage}
                                onUnstage={handleUnstage}
                                onDiscard={handleDiscard}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
