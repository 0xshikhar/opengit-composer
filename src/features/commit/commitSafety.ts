import { ConfigLoader } from '../../core/configLoader';
import { applyPrivacyPolicyToChanges } from '../../core/privacyPolicy';
import { ComposeSnapshot } from '../../core/orchestrator';
import { FileChange } from '../../types/git';

export function buildSnapshotFingerprintFromChanges(
    changes: { path: string; changeType: string; additions: number; deletions: number }[]
): string {
    return [...changes]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map(change => `${change.path}|${change.changeType}|${change.additions}|${change.deletions}`)
        .join('\n');
}

export async function assertSnapshotFresh(
    configLoader: ConfigLoader,
    getCurrentStagedChanges: () => Promise<FileChange[]>,
    snapshot: ComposeSnapshot | undefined
): Promise<void> {
    if (!snapshot) {
        return;
    }

    const currentStaged = await getCurrentStagedChanges();
    const config = configLoader.getConfig();
    const eligible = applyPrivacyPolicyToChanges(currentStaged, {
        excludePatterns: config.excludePatterns,
        redactPatterns: [],
    }).changes;

    const currentFingerprint = buildSnapshotFingerprintFromChanges(eligible);
    if (snapshot.fingerprint !== currentFingerprint) {
        const error = new Error(
            'Staged changes have changed since composition. Refresh and re-compose before committing.'
        ) as Error & { code?: string; action?: { label: string; command: 'refresh' } };
        error.code = 'STAGED_SNAPSHOT_STALE';
        error.action = {
            label: 'Refresh',
            command: 'refresh',
        };
        throw error;
    }
}
