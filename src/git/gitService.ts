import simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileChange, ChangeType } from '../types/git';

export class GitService {
    private git: SimpleGit;

    constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        this.git = simpleGit(workspaceFolder.uri.fsPath);
    }

    async getStagedChanges(): Promise<FileChange[]> {
        const status = await this.git.status();
        const changes: FileChange[] = [];

        for (const file of status.files) {
            // 'index' represents the status of the file in the index (staged)
            if (file.index !== ' ' && file.index !== '?') {
                const diff = await this.getFileDiff(file.path, true);
                changes.push({
                    path: file.path,
                    changeType: this.mapChangeType(file.index),
                    diff: diff,
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
        const seenPaths = new Set<string>();

        for (const file of status.files) {
            if (file.working_dir !== ' ') {
                seenPaths.add(file.path);
                let diff = '';
                let additions = 0;
                let deletions = 0;

                if (file.working_dir === '?') {
                    const untracked = await this.getUntrackedFileInfo(file.path);
                    diff = untracked.diff;
                    additions = untracked.additions;
                    deletions = untracked.deletions;
                } else {
                    diff = await this.getFileDiff(file.path, false);
                    additions = this.countAdditions(diff);
                    deletions = this.countDeletions(diff);
                }

                changes.push({
                    path: file.path,
                    changeType: this.mapChangeType(file.working_dir),
                    diff,
                    additions,
                    deletions
                });
            }
        }

        if (Array.isArray(status.not_added)) {
            for (const notAddedPath of status.not_added) {
                if (!seenPaths.has(notAddedPath)) {
                    seenPaths.add(notAddedPath);
                    const untracked = await this.getUntrackedFileInfo(notAddedPath);
                    changes.push({
                        path: notAddedPath,
                        changeType: ChangeType.Untracked,
                        diff: untracked.diff,
                        additions: untracked.additions,
                        deletions: untracked.deletions
                    });
                }
            }
        }

        return changes;
    }

    async getFileDiff(filePath: string, staged: boolean): Promise<string> {
        const args = staged ? ['--cached'] : [];
        const diff = await this.git.diff([...args, '--', filePath]);
        if (!diff && !staged) {
            const untracked = await this.getUntrackedFileInfo(filePath);
            if (untracked.diff) {
                return untracked.diff;
            }
        }
        return diff;
    }

    async stageFiles(files: string[]): Promise<void> {
        await this.git.add(files);
    }

    async unstageFiles(files: string[]): Promise<void> {
        await this.git.reset(['HEAD', '--', ...files]);
    }

    async createCommit(message: string, files: string[]): Promise<void> {
        // Stage only specified files
        // First we need to know what is currently staged to restore it later?
        // Or we assume the user wants to commit ONLY these files as a group.
        // The Idea.md says "intelligently groups staged changes".
        // So they are ALREADY staged.
        // If we want to commit a SUBSET of staged changes, we effectively need to:
        // 1. Unstage everything? No, that loses the intent of what was staged vs unstaged.
        // 2. Commit --only <files>? Does git support commit only specific files from index?
        //    Git commit <files> stages them and commits them. But if they are ALREADY staged, it works.
        //    However, if we have files A, B, C staged, and we want to commit only A and B.
        //    We can run `git commit -m "msg" -- A B`.

        await this.git.commit(message, files);
    }

    private mapChangeType(gitStatus: string): ChangeType {
        switch (gitStatus) {
            case 'M': return ChangeType.Modified;
            case 'A': return ChangeType.Added;
            case 'D': return ChangeType.Deleted;
            case 'R': return ChangeType.Renamed;
            case '?': return ChangeType.Untracked;
            default: return ChangeType.Modified;
        }
    }

    private countAdditions(diff: string): number {
        return (diff.match(/^\+(?!\+\+)/gm) || []).length;
    }

    private countDeletions(diff: string): number {
        return (diff.match(/^-(?!--)/gm) || []).length;
    }

    private async getUntrackedFileInfo(filePath: string): Promise<{ diff: string; additions: number; deletions: number }> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return { diff: '', additions: 0, deletions: 0 };
        }
        const fullPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.isDirectory()) {
                return { diff: '', additions: 0, deletions: 0 };
            }
            if (stat.size > 1024 * 1024) {
                return {
                    diff: `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1 @@\n+[Large file: ${(stat.size / 1024).toFixed(1)} KB]`,
                    additions: 1,
                    deletions: 0
                };
            }
            const buffer = await fs.promises.readFile(fullPath);
            const checkLen = Math.min(buffer.length, 8000);
            let isBinary = false;
            for (let i = 0; i < checkLen; i++) {
                if (buffer[i] === 0) {
                    isBinary = true;
                    break;
                }
            }
            if (isBinary) {
                return {
                    diff: `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\nBinary files /dev/null and b/${filePath} differ`,
                    additions: 0,
                    deletions: 0
                };
            }
            const content = buffer.toString('utf8');
            const trimmed = content.endsWith('\r\n') ? content.slice(0, -2) : content.endsWith('\n') ? content.slice(0, -1) : content;
            const lines = trimmed.length === 0 ? [] : trimmed.split(/\r?\n/);
            const lineCount = lines.length;
            const header = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lineCount} @@\n`;
            const body = lines.map(line => `+${line}`).join('\n');
            return {
                diff: header + body,
                additions: lineCount,
                deletions: 0
            };
        } catch {
            return { diff: '', additions: 0, deletions: 0 };
        }
    }
}
