import { applyPrivacyPolicyToChanges, PrivacyPolicyResult } from '../../core/privacyPolicy';
import { FileChange } from '../../types/git';

export interface PrivacyPreview {
    excludedCount: number;
    redactedCount: number;
    invalidExcludePatterns: string[];
    invalidRedactPatterns: string[];
    warnings: string[];
}

export function buildPrivacyPreview(
    changes: FileChange[],
    excludePatterns: string[] = [],
    redactPatterns: string[] = []
): { changes: FileChange[]; preview: PrivacyPreview; policyResult: PrivacyPolicyResult } {
    const policyResult = applyPrivacyPolicyToChanges(changes, {
        excludePatterns,
        redactPatterns,
    });

    return {
        changes: policyResult.changes,
        preview: {
            excludedCount: policyResult.excludedPaths.length,
            redactedCount: policyResult.redactedMatches,
            invalidExcludePatterns: policyResult.invalidExcludePatterns,
            invalidRedactPatterns: policyResult.invalidRedactPatterns,
            warnings: policyResult.warnings.map(warning => warning.message),
        },
        policyResult,
    };
}
