import { ConfigLoader } from '../../core/configLoader';
import { applyPrivacyPolicyToChanges } from '../../core/privacyPolicy';
import { ComposeSnapshot } from '../../core/orchestrator';
import { FileChange } from '../../types/git';

export interface SnapshotCheckResult {
    fresh: boolean;
    warning?: {
        code: 'STAGED_SNAPSHOT_STALE';
        message: string;
        addedFiles: string[];
        removedFiles: string[];
    };
}

export function buildSnapshotFingerprintFromChanges(
    changes: { path: string; changeType: string; additions: number; deletions: number }[]
): string {
    return [...changes]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map(change => `${change.path}|${change.changeType}|${change.additions}|${change.deletions}`)
        .join('\n');
}

export async function checkSnapshotFresh(
    configLoader: ConfigLoader,
    getCurrentStagedChanges: () => Promise<FileChange[]>,
    snapshot: ComposeSnapshot | undefined
): Promise<SnapshotCheckResult> {
    if (!snapshot) {
        return { fresh: true };
    }

    const currentStaged = await getCurrentStagedChanges();
    const config = configLoader.getConfig();
    const eligible = applyPrivacyPolicyToChanges(currentStaged, {
        excludePatterns: snapshot.excludePatterns ?? config.excludePatterns,
        redactPatterns: [],
    }).changes;

    const currentFingerprint = buildSnapshotFingerprintFromChanges(eligible);
    if (snapshot.fingerprint === currentFingerprint) {
        return { fresh: true };
    }

    // Calculate what changed
    const snapshotPaths = new Set(snapshot.paths);
    const currentPaths = new Set(eligible.map(e => e.path));
    const addedFiles = eligible.filter(e => !snapshotPaths.has(e.path)).map(e => e.path);
    const removedFiles = snapshot.paths.filter(p => !currentPaths.has(p));

    return {
        fresh: false,
        warning: {
            code: 'STAGED_SNAPSHOT_STALE',
            message: `Staged changes have changed since composition (${addedFiles.length} added, ${removedFiles.length} removed).`,
            addedFiles,
            removedFiles,
        },
    };
}

/** @deprecated Use checkSnapshotFresh with force flag pattern instead */
export async function assertSnapshotFresh(
    configLoader: ConfigLoader,
    getCurrentStagedChanges: () => Promise<FileChange[]>,
    snapshot: ComposeSnapshot | undefined,
    _force?: boolean
): Promise<void> {
    const result = await checkSnapshotFresh(configLoader, getCurrentStagedChanges, snapshot);
    if (!result.fresh) {
        const error = new Error(result.warning?.message || 'Staged changes have changed.') as Error & {
            code?: string;
            action?: { label: string; command: 'refresh' };
            warning?: SnapshotCheckResult['warning'];
        };
        error.code = 'STAGED_SNAPSHOT_STALE';
        error.action = { label: 'Refresh', command: 'refresh' };
        error.warning = result.warning;
        throw error;
    }
}
