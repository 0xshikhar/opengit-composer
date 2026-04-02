import { FileChange } from '../types/git';

export interface PrivacyPolicyConfig {
    excludePatterns: string[];
    redactPatterns: string[];
}

export interface PrivacyPolicyWarning {
    kind: 'invalid-exclude-pattern' | 'invalid-redact-pattern';
    pattern: string;
    message: string;
}

export interface PrivacyPolicyResult {
    changes: FileChange[];
    excludedPaths: string[];
    redactedMatches: number;
    invalidExcludePatterns: string[];
    invalidRedactPatterns: string[];
    warnings: PrivacyPolicyWarning[];
}

function normalizePath(input: string): string {
    return input.replace(/\\/g, '/');
}

function globToRegExp(pattern: string): RegExp {
    let output = '^';
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === '*') {
            if (pattern[i + 1] === '*') {
                output += '.*';
                i++;
            } else {
                output += '[^/]*';
            }
            continue;
        }
        if (char === '?') {
            output += '[^/]';
            continue;
        }
        if ('\\^$+?.()|{}[]'.includes(char)) {
            output += `\\${char}`;
            continue;
        }
        output += char;
    }
    output += '$';
    return new RegExp(output);
}

function compileRedactionPatterns(patterns: string[]): { patterns: RegExp[]; invalidPatterns: string[] } {
    const compiled: RegExp[] = [];
    const invalidPatterns: string[] = [];
    for (const rawPattern of patterns) {
        const pattern = rawPattern.trim();
        if (!pattern) continue;
        try {
            compiled.push(new RegExp(pattern, 'g'));
        } catch {
            invalidPatterns.push(pattern);
            continue;
        }
    }
    return { patterns: compiled, invalidPatterns };
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
    const redactionCompilation = compileRedactionPatterns(config.redactPatterns || []);
    const redactionRegex = redactionCompilation.patterns;

    const filtered: FileChange[] = [];
    const excludedPaths: string[] = [];
    let redactedMatches = 0;
    const invalidExcludePatterns: string[] = [];
    const warnings: PrivacyPolicyWarning[] = [];

    for (const file of changes) {
        const normalizedPath = normalizePath(file.path);
        const matchedExclude = excludePatterns.some(pattern => {
            const trimmed = pattern.trim();
            if (!trimmed) return false;
            try {
                return globToRegExp(trimmed).test(normalizedPath);
            } catch {
                invalidExcludePatterns.push(trimmed);
                warnings.push({
                    kind: 'invalid-exclude-pattern',
                    pattern: trimmed,
                    message: `Ignoring invalid exclude pattern "${trimmed}".`,
                });
                return false;
            }
        });

        if (matchedExclude) {
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
        invalidExcludePatterns: [...new Set(invalidExcludePatterns)],
        invalidRedactPatterns: redactionCompilation.invalidPatterns,
        warnings: [
            ...warnings,
            ...redactionCompilation.invalidPatterns.map(pattern => ({
                kind: 'invalid-redact-pattern' as const,
                pattern,
                message: `Ignoring invalid redact pattern "${pattern}".`,
            })),
        ],
    };
}
