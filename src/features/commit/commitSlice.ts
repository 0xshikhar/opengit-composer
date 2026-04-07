import * as vscode from 'vscode';
import { CommitExecutor } from '../../core/commitExecutor';
import { ConfigLoader } from '../../core/configLoader';
import { DraftCommit } from '../../types/commits';
import { ComposeSnapshot } from '../../core/orchestrator';
import { FileChange } from '../../types/git';
import { assertSnapshotFresh } from './commitSafety';

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
    webview: vscode.Webview
): Promise<void> {
    await assertSnapshotFresh(deps.configLoader, deps.getCurrentStagedChanges, snapshot);
    await deps.commitExecutor.executeSingle(draft);
    vscode.window.showInformationMessage(`Committed: ${draft.message.split('\n')[0]}`);
    await webview.postMessage({ command: 'commitSuccess', draftId: draft.id });
    await deps.refreshVisibleViews();
}

export async function commitAll(
    deps: CommitSliceDeps,
    drafts: DraftCommit[],
    snapshot: ComposeSnapshot | undefined,
    webview: vscode.Webview
): Promise<void> {
    await assertSnapshotFresh(deps.configLoader, deps.getCurrentStagedChanges, snapshot);
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
