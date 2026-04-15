import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import { FileChange, ChangeType, RepoContext } from '../../types/git';

export class GitService {
    private git: SimpleGit;
    private workspacePath: string;

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

    // --- Staged / Unstaged ---

    async getStagedChanges(): Promise<FileChange[]> {
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
        const args = staged ? ['--cached'] : [];
        return this.git.diff([...args, '--', filePath]);
    }

    async getStagedDiff(): Promise<string> {
        return this.git.diff(['--cached', '--patch', '--no-color']);
    }

    // --- Stage / Unstage ---

    async stageFiles(files: string[]): Promise<void> {
        await this.git.add(files);
    }

    async unstageFiles(files: string[]): Promise<void> {
        await this.git.reset(['HEAD', '--', ...files]);
    }

    async unstageAll(): Promise<void> {
        await this.git.reset(['HEAD']);
    }

    // --- Commit ---

    async createCommit(message: string, files?: string[]): Promise<void> {
        const normalizedFiles = (files || []).filter(Boolean);
        if (normalizedFiles.length === 0) {
            await this.git.commit(message);
            return;
        }

        // Use raw to ensure correct `--` pathspec handling and avoid surprising behaviors.
        // This commits only the currently-staged changes for the provided paths, leaving other
        // staged changes intact (critical for composing multiple atomic commits).
        await this.git.raw(['commit', '-m', message, '--', ...normalizedFiles]);
    }

    async getCurrentHead(): Promise<string> {
        return (await this.git.revparse(['HEAD'])).trim();
    }

    async snapshotLooseChanges(label: string): Promise<boolean> {
        const status = await this.git.status();
        const hasLooseChanges = status.files.some(file => file.index === '?' || file.working_dir !== ' ');
        if (!hasLooseChanges) {
            return false;
        }

        await this.git.raw(['stash', 'push', '--keep-index', '-u', '-m', label]);
        return true;
    }

    async applyLatestStash(includeIndex: boolean): Promise<void> {
        const args = ['stash', 'apply'];
        if (includeIndex) {
            args.push('--index');
        }
        args.push('stash@{0}');
        await this.git.raw(args);
    }

    async dropLatestStash(): Promise<void> {
        await this.git.raw(['stash', 'drop', 'stash@{0}']);
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
