import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import { FileChange, ChangeType, RepoContext } from '../../types/git';

export class GitService {
    private git: SimpleGit;
    private workspacePath: string;
    private repoRootResolved = false;

    constructor(workspacePath?: string) {
        if (workspacePath) {
            this.workspacePath = workspacePath;
        } else {
            // Only import vscode as a runtime dependency (not in pure unit test context)
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const vscode = require('vscode');
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            this.workspacePath = workspaceFolder.uri.fsPath;
        }
        this.git = simpleGit(this.workspacePath);
    }

    private async ensureRepoRoot(): Promise<void> {
        if (this.repoRootResolved) return;
        try {
            if (typeof this.git.revparse === 'function') {
                const topLevel = (await this.git.revparse(['--show-toplevel'])).trim();
                if (topLevel) {
                    this.workspacePath = topLevel;
                    this.git = simpleGit(topLevel);
                }
            }
            this.repoRootResolved = true;
        } catch {
            this.repoRootResolved = true;
        }
    }

    private toTopPathspecs(files: string[]): string[] {
        return files.filter(Boolean).map(f => {
            if (f === '.' || f.startsWith(':/') || f.startsWith(':(')) {
                return f;
            }
            return `:/${f.replace(/^\/+/, '')}`;
        });
    }

    getWorkspacePath(): string {
        return this.workspacePath;
    }

    // --- Staged / Unstaged ---

    async getStagedChanges(): Promise<FileChange[]> {
        await this.ensureRepoRoot();
        const status = await this.git.status();
        const changes: FileChange[] = [];

        for (const file of status.files) {
            if (file.index !== ' ' && file.index !== '?') {
                const diff = await this.getFileDiff(file.path, true);
                changes.push({
                    path: file.path,
                    changeType: this.mapChangeType(file.index),
                    diff,
                    additions: this.countAdditions(diff),
                    deletions: this.countDeletions(diff)
                });
            }
        }
        return changes;
    }

    async getUnstagedChanges(): Promise<FileChange[]> {
        await this.ensureRepoRoot();
        const status = await this.git.status();
        const changes: FileChange[] = [];

        for (const file of status.files) {
            if (file.working_dir !== ' ' && file.working_dir !== '?') {
                const diff = await this.getFileDiff(file.path, false);
                changes.push({
                    path: file.path,
                    changeType: this.mapChangeType(file.working_dir),
                    diff,
                    additions: this.countAdditions(diff),
                    deletions: this.countDeletions(diff)
                });
            }
        }
        return changes;
    }

    // --- File diffs ---

    async getFileDiff(filePath: string, staged: boolean): Promise<string> {
        await this.ensureRepoRoot();
        const args = staged ? ['--cached'] : [];
        const pathspec = this.toTopPathspecs([filePath])[0] || filePath;
        return this.git.diff([...args, '--', pathspec]);
    }

    async getStagedDiff(): Promise<string> {
        await this.ensureRepoRoot();
        return this.git.diff(['--cached', '--patch', '--no-color']);
    }

    async showFile(refAndPath: string): Promise<string> {
        await this.ensureRepoRoot();
        try {
            return await this.git.show([refAndPath]);
        } catch {
            return '';
        }
    }

    // --- Stage / Unstage ---

    async stageFiles(files: string[]): Promise<void> {
        await this.ensureRepoRoot();
        const pathspecs = this.toTopPathspecs(files);
        if (pathspecs.length === 0) return;
        await this.git.add(pathspecs);
    }

    async unstageFiles(files: string[]): Promise<void> {
        await this.ensureRepoRoot();
        const pathspecs = this.toTopPathspecs(files);
        if (pathspecs.length === 0) return;
        await this.git.reset(['HEAD', '--', ...pathspecs]);
    }

    async unstageAll(): Promise<void> {
        await this.ensureRepoRoot();
        await this.git.reset(['HEAD']);
    }

    // --- Discard Changes ---

    async discardFiles(files: string[]): Promise<void> {
        await this.ensureRepoRoot();
        const normalizedFiles = files.filter(Boolean);
        if (normalizedFiles.length === 0) return;

        const status = await this.git.status();
        const untracked: string[] = [];
        const tracked: string[] = [];

        for (const file of normalizedFiles) {
            const isUntracked = status.not_added.includes(file) ||
                status.files.some(f => f.path === file && (f.working_dir === '?' || f.index === '?'));
            if (isUntracked) {
                untracked.push(file);
            } else {
                tracked.push(file);
            }
        }

        if (tracked.length > 0) {
            await this.git.checkout(['--', ...this.toTopPathspecs(tracked)]);
        }
        if (untracked.length > 0) {
            await this.git.raw(['clean', '-f', '-d', '--', ...untracked]);
        }
    }

    async discardAll(): Promise<void> {
        await this.ensureRepoRoot();
        await this.git.checkout(['--', '.']);
        await this.git.raw(['clean', '-f', '-d']);
    }

    // --- Commit ---

    async createCommit(message: string, files?: string[]): Promise<void> {
        await this.ensureRepoRoot();
        const normalizedFiles = (files || []).filter(Boolean);
        if (normalizedFiles.length === 0) {
            await this.git.commit(message);
            return;
        }

        // Use raw to ensure correct `--` pathspec handling and avoid surprising behaviors.
        // This commits only the currently-staged changes for the provided paths, leaving other
        // staged changes intact (critical for composing multiple atomic commits).
        const pathspecs = this.toTopPathspecs(normalizedFiles);
        await this.git.raw(['commit', '-m', message, '--', ...pathspecs]);
    }

    async getCurrentHead(): Promise<string> {
        return (await this.git.revparse(['HEAD'])).trim();
    }

    async snapshotLooseChanges(label: string): Promise<string | undefined> {
        const status = await this.git.status();
        const hasLooseChanges = status.files.some(file => file.index === '?' || file.working_dir !== ' ');
        if (!hasLooseChanges) {
            return undefined;
        }

        await this.git.raw(['stash', 'push', '--keep-index', '-u', '-m', label]);
        const stashList = await this.git.raw(['stash', 'list', '--format=%gd', '-n', '1']);
        const stashRef = `${stashList}`.split(/\r?\n/)[0]?.trim();
        return stashRef || undefined;
    }

    async applyLatestStash(stashRef: string, includeIndex: boolean): Promise<void> {
        const args = ['stash', 'apply'];
        if (includeIndex) {
            args.push('--index');
        }
        args.push(stashRef);
        await this.git.raw(args);
    }

    async dropLatestStash(stashRef: string): Promise<void> {
        await this.git.raw(['stash', 'drop', stashRef]);
    }

    async resetHard(ref: string): Promise<void> {
        await this.git.raw(['reset', '--hard', ref]);
    }

    // --- Repository context ---

    async getRepoContext(): Promise<RepoContext> {
        const [branchResult, logResult] = await Promise.all([
            this.git.branch(),
            this.git.log({ maxCount: 10 }),
        ]);

        const repoName = path.basename(this.workspacePath) || 'unknown';
        const branch = branchResult.current;
        const recentCommits = logResult.all.map(c => c.message);

        // Detect project type from common config files
        const projectType = await this.detectProjectType();

        return { repoName, branch, recentCommits, projectType };
    }

    async getRecentCommits(count: number = 10): Promise<string[]> {
        const log = await this.git.log({ maxCount: count });
        return log.all.map(c => c.message);
    }

    // --- Helpers ---

    private async detectProjectType(): Promise<string> {
        try {
            const status = await this.git.raw(['ls-files']);
            const files = status.split('\n');
            if (files.some(f => f === 'package.json')) return 'node';
            if (files.some(f => f === 'Cargo.toml')) return 'rust';
            if (files.some(f => f === 'go.mod')) return 'go';
            if (files.some(f => f === 'requirements.txt' || f === 'pyproject.toml')) return 'python';
            if (files.some(f => f === 'pom.xml' || f === 'build.gradle')) return 'java';
            return 'unknown';
        } catch {
            return 'unknown';
        }
    }

    private mapChangeType(gitStatus: string): ChangeType {
        switch (gitStatus) {
            case 'M': return ChangeType.Modified;
            case 'A': return ChangeType.Added;
            case 'D': return ChangeType.Deleted;
            case 'R': return ChangeType.Renamed;
            case 'C': return ChangeType.Copied;
            default: return ChangeType.Modified;
        }
    }

    private countAdditions(diff: string): number {
        return (diff.match(/^\+(?!\+\+)/gm) || []).length;
    }

    private countDeletions(diff: string): number {
        return (diff.match(/^-(?!--)/gm) || []).length;
    }
}
