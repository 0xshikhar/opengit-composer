import { FileChange } from '../types/git';

export interface PrivacyPolicyConfig {
    excludePatterns: string[];
    redactPatterns: string[];
}

export interface PrivacyPolicyResult {
    changes: FileChange[];
    excludedPaths: string[];
    redactedMatches: number;
}

function normalizePath(input: string): string {
    return input.replace(/\\/g, '/');
}

function globToRegExp(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '::DOUBLE_STAR::')
        .replace(/\*/g, '[^/]*')
        .replace(/::DOUBLE_STAR::/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
    if (!patterns.length) return false;
    const normalized = normalizePath(path);
    return patterns.some(pattern => {
        const trimmed = pattern.trim();
        if (!trimmed) return false;
        try {
            return globToRegExp(trimmed).test(normalized);
        } catch {
            return false;
        }
    });
}

function compileRedactionPatterns(patterns: string[]): RegExp[] {
    const compiled: RegExp[] = [];
    for (const rawPattern of patterns) {
        const pattern = rawPattern.trim();
        if (!pattern) continue;
        try {
            compiled.push(new RegExp(pattern, 'g'));
        } catch {
            continue;
        }
    }
    return compiled;
}

function redactDiff(diff: string, patterns: RegExp[]): { diff: string; matches: number } {
    if (!diff || patterns.length === 0) {
        return { diff, matches: 0 };
    }

    let redacted = diff;
    let totalMatches = 0;

    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const matches = redacted.match(pattern);
        if (matches && matches.length > 0) {
            totalMatches += matches.length;
            redacted = redacted.replace(pattern, '[REDACTED]');
        }
    }

    return { diff: redacted, matches: totalMatches };
}

export function applyPrivacyPolicyToChanges(
    changes: FileChange[],
    config: PrivacyPolicyConfig
): PrivacyPolicyResult {
    const excludePatterns = config.excludePatterns || [];
    const redactionRegex = compileRedactionPatterns(config.redactPatterns || []);

    const filtered: FileChange[] = [];
    const excludedPaths: string[] = [];
    let redactedMatches = 0;

    for (const file of changes) {
        if (matchesAnyPattern(file.path, excludePatterns)) {
            excludedPaths.push(file.path);
            continue;
        }

        const redaction = redactDiff(file.diff, redactionRegex);
        redactedMatches += redaction.matches;
        filtered.push({
            ...file,
            diff: redaction.diff,
        });
    }

    return {
        changes: filtered,
        excludedPaths,
        redactedMatches,
    };
}
