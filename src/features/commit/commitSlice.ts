import * as vscode from 'vscode';
import { CommitExecutor } from '../../core/commitExecutor';
import { ConfigLoader } from '../../core/configLoader';
import { DraftCommit } from '../../types/commits';
import { ComposeSnapshot } from '../../core/orchestrator';
import { FileChange } from '../../types/git';
import { checkSnapshotFresh } from './commitSafety';

export interface CommitSliceDeps {
    commitExecutor: CommitExecutor;
    configLoader: ConfigLoader;
    getCurrentStagedChanges: () => Promise<FileChange[]>;
    refreshVisibleViews: () => Promise<void>;
}

export async function commitSingle(
    deps: CommitSliceDeps,
    draft: DraftCommit,
    snapshot: ComposeSnapshot | undefined,
    webview: vscode.Webview,
    force: boolean = false
): Promise<void> {
    const check = await checkSnapshotFresh(deps.configLoader, deps.getCurrentStagedChanges, snapshot);

    if (!check.fresh && !force) {
        // Send warning instead of throwing error
        await webview.postMessage({
            command: 'warning',
            warning: {
                code: 'STAGED_SNAPSHOT_STALE',
                severity: 'warning',
                recoverable: true,
                message: check.warning?.message || 'Staged changes have changed. Click "Commit" again to force.',
                action: { label: 'Force Commit', command: 'commitSingle' },
                addedFiles: check.warning?.addedFiles,
                removedFiles: check.warning?.removedFiles,
            },
        });
        return;
    }

    await deps.commitExecutor.executeSingle(draft);
    vscode.window.showInformationMessage(`Committed: ${draft.message.split('\n')[0]}`);
    await webview.postMessage({ command: 'commitSuccess', draftId: draft.id });
    await deps.refreshVisibleViews();
}

export async function commitAll(
    deps: CommitSliceDeps,
    drafts: DraftCommit[],
    snapshot: ComposeSnapshot | undefined,
    webview: vscode.Webview,
    force: boolean = false
): Promise<void> {
    const check = await checkSnapshotFresh(deps.configLoader, deps.getCurrentStagedChanges, snapshot);

    if (!check.fresh && !force) {
        // Send warning instead of throwing error
        await webview.postMessage({
            command: 'warning',
            warning: {
                code: 'STAGED_SNAPSHOT_STALE',
                severity: 'warning',
                recoverable: true,
                message: check.warning?.message || 'Staged changes have changed. Click "Commit All" again to force.',
                action: { label: 'Force Commit All', command: 'commitAll' },
                addedFiles: check.warning?.addedFiles,
                removedFiles: check.warning?.removedFiles,
            },
        });
        return;
    }

    const results = await deps.commitExecutor.executeAll(drafts, progress => {
        void webview.postMessage({
            command: 'commitProgress',
            progress,
        });
    });

    const successCount = results.filter(result => result.success).length;
    vscode.window.showInformationMessage(
        `Committed ${successCount}/${results.length} commits successfully.`
    );

    await webview.postMessage({ command: 'commitAllDone', results });
    await deps.refreshVisibleViews();
}
