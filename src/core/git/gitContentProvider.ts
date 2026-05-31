import type * as vscode from 'vscode';
import { GitService } from './gitService';

export const OPENGIT_DIFF_SCHEME = 'opengit-diff';

function getVscode(): typeof import('vscode') | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('vscode');
    } catch {
        return undefined;
    }
}

export class GitContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange?: vscode.EventEmitter<vscode.Uri>;

    get onDidChange(): vscode.Event<vscode.Uri> | undefined {
        if (!this._onDidChange) {
            const vs = getVscode();
            if (vs) {
                this._onDidChange = new vs.EventEmitter<vscode.Uri>();
            }
        }
        return this._onDidChange?.event;
    }

    constructor(private readonly getGitService: () => GitService | undefined) {}

    refresh(uri?: vscode.Uri): void {
        if (uri && this._onDidChange) {
            this._onDidChange.fire(uri);
        }
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        if (uri.path === '/dev/null') {
            return '';
        }

        const gitService = this.getGitService();
        if (!gitService) {
            return '';
        }

        const cleanPath = uri.path.replace(/^\/+/, '');
        const params = new URLSearchParams(uri.query || '');
        const ref = params.get('ref') || 'HEAD';

        if (ref === 'empty') {
            return '';
        }

        // For index ref, git show syntax is ":path"
        const gitRefSpec = ref === 'index' ? `:${cleanPath}` : `${ref}:${cleanPath}`;

        try {
            return await gitService.showFile(gitRefSpec);
        } catch {
            return '';
        }
    }

    static toUri(filePath: string, ref: 'HEAD' | 'index' | 'empty'): vscode.Uri {
        const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
        const vs = getVscode();
        if (!vs) {
            return {
                scheme: OPENGIT_DIFF_SCHEME,
                path: `/${normalized}`,
                query: `ref=${ref}`,
            } as any;
        }
        return vs.Uri.from({
            scheme: OPENGIT_DIFF_SCHEME,
            path: `/${normalized}`,
            query: `ref=${ref}`,
        });
    }
}
