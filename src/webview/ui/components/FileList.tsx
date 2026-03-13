import React, { useMemo, useState } from 'react';
import { useCommitStore } from '../store/commitStore';

type Group = {
    name: string;
    files: ReturnType<typeof useCommitStore.getState>['stagedFiles'];
    additions: number;
    deletions: number;
};

function getTopFolder(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const [first] = normalized.split('/');
    return first || 'root';
}

function groupByTopFolder(files: Group['files']): Group[] {
    const map = new Map<string, Group>();
    for (const file of files) {
        const name = getTopFolder(file.path);
        const existing = map.get(name);
        if (existing) {
            existing.files.push(file);
            existing.additions += file.additions;
            existing.deletions += file.deletions;
        } else {
            map.set(name, { name, files: [file], additions: file.additions, deletions: file.deletions });
        }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export default function FileList() {
    const { stagedFiles, unstagedFiles, selectedFilePath, selectFile } = useCommitStore();
    const [expanded, setExpanded] = useState(false);
    const [showStaged, setShowStaged] = useState(true);
    const [showUnstaged, setShowUnstaged] = useState(true);
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
    const [query, setQuery] = useState('');

    const normalizedQuery = query.trim().toLowerCase();
    const stagedFiltered = useMemo(() => {
        if (!normalizedQuery) return stagedFiles;
        return stagedFiles.filter(f => f.path.toLowerCase().includes(normalizedQuery));
    }, [normalizedQuery, stagedFiles]);

    const unstagedFiltered = useMemo(() => {
        if (!normalizedQuery) return unstagedFiles;
        return unstagedFiles.filter(f => f.path.toLowerCase().includes(normalizedQuery));
    }, [normalizedQuery, unstagedFiles]);

    const totalAdd = stagedFiltered.reduce((acc, f) => acc + f.additions, 0);
    const totalDel = stagedFiltered.reduce((acc, f) => acc + f.deletions, 0);
    const visibleFiles = expanded ? stagedFiltered : stagedFiltered.slice(0, 200);
    const unstagedAdd = unstagedFiltered.reduce((acc, f) => acc + f.additions, 0);
    const unstagedDel = unstagedFiltered.reduce((acc, f) => acc + f.deletions, 0);

    const stagedGroups = useMemo(() => groupByTopFolder(visibleFiles), [visibleFiles]);
    const unstagedGroups = useMemo(() => groupByTopFolder(unstagedFiltered), [unstagedFiltered]);

    const toggleGroup = (section: 'staged' | 'unstaged', name: string) => {
        const key = `${section}:${name}`;
        setCollapsedGroups((state) => ({ ...state, [key]: !state[key] }));
    };

    if (stagedFiles.length === 0 && unstagedFiles.length === 0) {
        return (
            <div className="file-list-empty">
                <p className="empty-text">No working changes.</p>
                <p className="empty-hint">Stage files with <code>git add</code> to begin composing.</p>
            </div>
        );
    }

    return (
        <div className="file-list">
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

            <div className="file-section-header">
                <button
                    className="file-section-toggle"
                    type="button"
                    onClick={() => setShowStaged(v => !v)}
                    title={showStaged ? 'Collapse staged changes' : 'Expand staged changes'}
                >
                    <span className="file-section-chevron">{showStaged ? '▾' : '▸'}</span>
                    <span className="section-label">Staged</span>
                    <span className="file-section-count">{stagedFiltered.length}{normalizedQuery ? `/${stagedFiles.length}` : ''}</span>
                </button>
                <div className="file-list-stats">
                    <span className="stat-add">+{totalAdd}</span>
                    <span className="stat-del">−{totalDel}</span>
                </div>
            </div>

            {showStaged ? (
                <div className="file-list-items">
                    {stagedGroups.map(group => {
                        const key = `staged:${group.name}`;
                        const isCollapsed = Boolean(collapsedGroups[key]);
                        return (
                            <div key={key} className="file-group">
                                <div
                                    className="file-group-header"
                                    onClick={() => toggleGroup('staged', group.name)}
                                    title={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                                >
                                    <span className="file-group-toggle">{isCollapsed ? '▸' : '▾'}</span>
                                    <span className="file-group-name">{group.name}</span>
                                    <span className="file-group-count">{group.files.length}</span>
                                    <span className="file-stats">
                                        <span className="stat-add">+{group.additions}</span>
                                        <span className="stat-del">−{group.deletions}</span>
                                    </span>
                                </div>
                                {!isCollapsed && group.files.map(file => {
                                    const fileName = file.path.split('/').pop() || file.path;
                                    const dir = file.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
                                    const isSelected = selectedFilePath === file.path;
                                    return (
                                        <div
                                            key={file.path}
                                            className={`file-list-item file-list-item-indent ${isSelected ? 'selected' : ''}`}
                                            onClick={() => selectFile(file.path)}
                                            title={file.path}
                                        >
                                            <span className={`change-badge ${file.changeType}`}>
                                                {file.changeType[0].toUpperCase()}
                                            </span>
                                            <div className="file-text">
                                                <span className="file-name">{fileName}</span>
                                                {dir ? <span className="file-subpath">{dir}</span> : null}
                                            </div>
                                            <span className="file-stats">
                                                <span className="stat-add">+{file.additions}</span>
                                                <span className="stat-del">−{file.deletions}</span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                    {!expanded && stagedFiltered.length > 200 && (
                        <div className="file-list-load-more">
                            <span className="empty-hint">Showing 200 of {stagedFiltered.length} files</span>
                            <button className="btn btn-sm" type="button" onClick={() => setExpanded(true)}>
                                Show All
                            </button>
                        </div>
                    )}
                </div>
            ) : null}

            <div className="file-section-header file-list-sub-header">
                <button
                    className="file-section-toggle"
                    type="button"
                    onClick={() => setShowUnstaged(value => !value)}
                    title={showUnstaged ? 'Collapse unstaged changes' : 'Expand unstaged changes'}
                >
                    <span className="file-section-chevron">{showUnstaged ? '▾' : '▸'}</span>
                    <span className="section-label">Unstaged</span>
                    <span className="file-section-count">{unstagedFiltered.length}{normalizedQuery ? `/${unstagedFiles.length}` : ''}</span>
                </button>
                <div className="file-list-stats">
                    <span className="stat-add">+{unstagedAdd}</span>
                    <span className="stat-del">−{unstagedDel}</span>
                </div>
            </div>
            {showUnstaged && (
                <div className="file-list-items">
                    {unstagedGroups.map(group => {
                        const key = `unstaged:${group.name}`;
                        const isCollapsed = Boolean(collapsedGroups[key]);
                        return (
                            <div key={key} className="file-group">
                                <div
                                    className="file-group-header file-group-header-unstaged"
                                    onClick={() => toggleGroup('unstaged', group.name)}
                                    title={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                                >
                                    <span className="file-group-toggle">{isCollapsed ? '▸' : '▾'}</span>
                                    <span className="file-group-name">{group.name}</span>
                                    <span className="file-group-count">{group.files.length}</span>
                                    <span className="file-stats">
                                        <span className="stat-add">+{group.additions}</span>
                                        <span className="stat-del">−{group.deletions}</span>
                                    </span>
                                </div>
                                {!isCollapsed && group.files.map(file => {
                                    const fileName = file.path.split('/').pop() || file.path;
                                    const dir = file.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
                                    const isSelected = selectedFilePath === file.path;
                                    return (
                                        <div
                                            key={`unstaged-${file.path}`}
                                            className={`file-list-item file-list-item-indent unstaged ${isSelected ? 'selected' : ''}`}
                                            onClick={() => selectFile(file.path)}
                                            title={file.path}
                                        >
                                            <span className={`change-badge ${file.changeType}`}>
                                                {file.changeType[0].toUpperCase()}
                                            </span>
                                            <div className="file-text">
                                                <span className="file-name">{fileName}</span>
                                                {dir ? <span className="file-subpath">{dir}</span> : null}
                                            </div>
                                            <span className="file-stats">
                                                <span className="stat-add">+{file.additions}</span>
                                                <span className="stat-del">−{file.deletions}</span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
