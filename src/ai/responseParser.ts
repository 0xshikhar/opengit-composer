import { AIResponse } from './aiProvider';
import { CommitGroup } from '../types/commits';
import { FileChange } from '../types/git';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';

type ParsedGroup = {
    files: string[];
    type: string;
    scope?: string;
    subject: string;
    body?: string;
    confidence: number;
    rationale?: string;
    impact?: string;
    verification: string[];
    risks: string[];
};

type ParsedPayload = {
    summary?: string;
    reasoning?: string;
    groups: ParsedGroup[];
};

const ALLOWED_TYPES = new Set([
    'feat',
    'fix',
    'refactor',
    'docs',
    'style',
    'test',
    'chore',
    'perf',
    'ci',
    'build',
]);

export class ResponseParser {
    static parseGroupingResponse(response: string, allChanges: FileChange[]): AIResponse {
        Logger.debug('ResponseParser: Raw AI response', { preview: response.slice(0, 1200) });

        const parsedPayload = this.tryParsePayload(response);
        if (parsedPayload && parsedPayload.groups.length > 0) {
            const composed = this.buildResponse(parsedPayload, allChanges);
            Logger.info('ResponseParser: Parsed AI response using structured JSON', {
                groups: composed.groups.length,
            });
            composed.parserMeta = {
                usedFallback: false,
                strategy: parsedPayload.parseStrategy || 'structured-json',
                qualityScore: parsedPayload.qualityScore ?? 90,
                details: parsedPayload.details,
            };
            return composed;
        }

        Logger.warn('ResponseParser: Falling back to heuristic grouping due to unparseable response');
        const fallback = this.fallbackHeuristicGrouping(allChanges);
        fallback.parserMeta = {
            usedFallback: true,
            strategy: 'heuristic-fallback',
            qualityScore: 35,
            details: 'The model output could not be parsed into valid commit groups, so files were regrouped heuristically.',
        };
        return fallback;
    }

    static parseMessageResponse(response: string): string {
        const trimmed = response.trim();
        if (!trimmed) return '';

        const normalized = trimmed
            .replace(/```(?:\w+)?\s*([\s\S]*?)\s*```/g, (_match, content: string) => content.trim())
            .replace(/```(?:\w+)?\n?/g, '')
            .replace(/```/g, '')
            .trim();

        const [subjectLine, ...rest] = normalized.split('\n');
        const cleanSubjectLine = this.normalizeCommitSubjectLine(subjectLine || '');
        return [cleanSubjectLine, ...rest].join('\n').trim();
    }

    private static tryParsePayload(response: string): (ParsedPayload & { parseStrategy?: string; qualityScore?: number; details?: string }) | null {
        const cleaned = this.extractLikelyJson(response);
        const candidates = this.buildJsonCandidates(cleaned);

        for (const candidate of candidates) {
            try {
                const rawParsed = JSON.parse(candidate) as unknown;
                const parsed = this.normalizePayloadRoot(rawParsed);
                if (!parsed) continue;

                const groupsSource = this.pickGroupSource(parsed);
                if (!Array.isArray(groupsSource) || groupsSource.length === 0) continue;

                const groups = groupsSource
                    .map(group => this.normalizeGroup(group))
                    .filter((group): group is ParsedGroup => group !== null);

                if (groups.length === 0) continue;

                const summary = this.getString(parsed.summary);
                const reasoning = this.getString(parsed.reasoning);
                const parseStrategy =
                    candidate === response.trim()
                        ? 'structured-json'
                        : candidate.includes('```')
                            ? 'fenced-json-repaired'
                            : 'repaired-json';
                const qualityScore =
                    parseStrategy === 'structured-json' ? 95 :
                    parseStrategy === 'fenced-json-repaired' ? 85 : 80;
                const details =
                    parseStrategy === 'structured-json'
                        ? 'Model output was already valid JSON.'
                        : 'Model output required JSON repair before grouping could be applied.';
                return { summary, reasoning, groups, parseStrategy, qualityScore, details };
            } catch {
                // Try next candidate
            }
        }

        return null;
    }

    private static buildResponse(payload: ParsedPayload, allChanges: FileChange[]): AIResponse {
        const remaining = new Map<string, FileChange>(
            allChanges.map(change => [change.path.toLowerCase(), change])
        );

        const groups: CommitGroup[] = payload.groups.map(parsedGroup => {
            const files = this.resolveFiles(parsedGroup.files, allChanges, remaining);
            return {
                id: uuidv4(),
                message: this.formatCommitMessage(parsedGroup),
                description: parsedGroup.body || parsedGroup.rationale,
                files,
                confidence: parsedGroup.confidence,
                rationale: parsedGroup.rationale,
                impact: parsedGroup.impact,
                verificationSteps: parsedGroup.verification,
                risks: parsedGroup.risks,
            };
        }).filter(group => group.files.length > 0);

        const leftovers = [...remaining.values()];
        if (leftovers.length > 0) {
            if (groups.length > 0) {
                groups[groups.length - 1].files.push(...leftovers);
                groups[groups.length - 1].risks = [
                    ...(groups[groups.length - 1].risks || []),
                    `Auto-assigned ${leftovers.length} leftover file(s) to preserve full coverage.`,
                ];
            } else {
                groups.push(this.createFallbackGroup(leftovers));
            }
        }

        return {
            groups,
            summary: payload.summary,
            reasoning: payload.reasoning,
            parserMeta: {
                usedFallback: false,
                strategy: 'structured-json',
            },
        };
    }

    private static fallbackHeuristicGrouping(allChanges: FileChange[]): AIResponse {
        if (allChanges.length === 0) {
            return {
                groups: [],
                summary: 'No staged changes were available.',
                reasoning: 'The staged set was empty.',
            };
        }

        if (allChanges.length <= 3) {
            return {
                groups: [this.createFallbackGroup(allChanges)],
                summary: 'The staged changes were treated as one atomic commit.',
                reasoning: 'Small change set, so splitting would likely reduce clarity.',
            };
        }

        const byTopFolder = new Map<string, FileChange[]>();
        for (const change of allChanges) {
            const topFolder = change.path.split('/')[0] || 'root';
            if (!byTopFolder.has(topFolder)) byTopFolder.set(topFolder, []);
            byTopFolder.get(topFolder)!.push(change);
        }

        const groups: CommitGroup[] = [];
        for (const [folder, files] of byTopFolder.entries()) {
            const message = `chore(${folder}): update ${files.length} related file${files.length === 1 ? '' : 's'}`;
            groups.push({
                id: uuidv4(),
                message,
                description: `Heuristic fallback grouped files under ${folder}.`,
                files,
                confidence: 55,
                rationale: `Files share the same top-level area (${folder}).`,
                verificationSteps: ['Review staged diff for each file in this group.'],
                risks: ['Manual review recommended because AI response could not be parsed.'],
            });
        }

        return {
            groups,
            summary: 'A heuristic fallback grouping was generated.',
            reasoning: 'The AI response was malformed or empty, so files were grouped by top-level area. Review the generated commit boundaries before committing.',
        };
    }

    private static createFallbackGroup(files: FileChange[]): CommitGroup {
        return {
            id: uuidv4(),
            message: 'chore: update staged changes',
            description: 'Fallback grouping for staged changes.',
            files,
            confidence: 60,
            rationale: 'Single fallback group to guarantee all files are included.',
            verificationSteps: ['Review grouped files before committing.'],
            risks: ['This fallback may not reflect ideal semantic grouping.'],
        };
    }

    private static normalizeGroup(raw: unknown): ParsedGroup | null {
        if (!raw || typeof raw !== 'object') return null;

        const source = raw as Record<string, unknown>;
        const files = this.normalizeFiles(source.files ?? source.paths ?? source.filePaths ?? source.file);
        if (files.length === 0) return null;

        const rawCommitMessage =
            this.getString(source.commit_message) ||
            this.getString(source.commitMessage) ||
            this.getString(source.message);
        const parsedCommitMessage = rawCommitMessage
            ? this.parseCommitMessage(rawCommitMessage)
            : null;

        const type = this.normalizeType(
            this.getString(source.type) ||
            this.getString(source.commitType) ||
            this.getString(source.kind) ||
            parsedCommitMessage?.type ||
            'chore'
        );

        const scope = this.normalizeScope(
            this.getString(source.scope) ||
            this.getString(source.module) ||
            this.getString(source.area) ||
            parsedCommitMessage?.scope
        );

        const subject = this.normalizeSubject(
            this.getString(source.subject) ||
            this.getString(source.title) ||
            parsedCommitMessage?.subject ||
            rawCommitMessage ||
            'update staged changes'
        );

        const body =
            this.getString(source.body) ||
            this.getString(source.description) ||
            parsedCommitMessage?.body;
        const confidence = this.normalizeConfidence(source.confidence ?? source.score);
        const rationale = this.getString(source.rationale) || this.getString(source.why);
        const impact = this.getString(source.impact);
        const verification = this.normalizeStringArray(source.verification ?? source.checks);
        const risks = this.normalizeStringArray(source.risks ?? source.risk);

        return {
            files,
            type,
            scope,
            subject,
            body,
            confidence,
            rationale,
            impact,
            verification,
            risks,
        };
    }

    private static resolveFiles(
        requestedPaths: string[],
        allChanges: FileChange[],
        remaining: Map<string, FileChange>
    ): FileChange[] {
        const resolved: FileChange[] = [];

        for (const requested of requestedPaths) {
            const normalized = requested.toLowerCase();
            const exact = remaining.get(normalized);
            if (exact) {
                resolved.push(exact);
                remaining.delete(normalized);
                continue;
            }

            const bySuffix = [...remaining.values()].find(change => {
                const candidate = change.path.toLowerCase();
                return candidate.endsWith(`/${normalized}`) || candidate.endsWith(normalized);
            });

            if (bySuffix) {
                resolved.push(bySuffix);
                remaining.delete(bySuffix.path.toLowerCase());
                continue;
            }

            const requestedBase = requested.split('/').pop()?.toLowerCase() || '';
            if (!requestedBase) continue;

            const baseMatches = [...remaining.values()].filter(
                change => change.path.split('/').pop()?.toLowerCase() === requestedBase
            );

            if (baseMatches.length === 1) {
                const matched = baseMatches[0];
                resolved.push(matched);
                remaining.delete(matched.path.toLowerCase());
            }
        }

        return resolved;
    }

    private static pickGroupSource(parsed: Record<string, unknown>): unknown[] | null {
        const candidates: unknown[] = [
            parsed.groups,
            parsed.groupings,
            parsed.drafts,
            parsed.commits,
            parsed.commitGroups,
            parsed.commit_groups,
            parsed.items,
            (parsed.result as Record<string, unknown> | undefined)?.groups,
            (parsed.output as Record<string, unknown> | undefined)?.groups,
            (parsed.data as Record<string, unknown> | undefined)?.groups,
        ];

        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
        }
        return null;
    }

    private static buildJsonCandidates(input: string): string[] {
        const trimmed = input.trim();
        const candidates = new Set<string>();
        if (trimmed) {
            candidates.add(trimmed);
            candidates.add(this.repairJson(trimmed));
        }

        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const sliced = trimmed.slice(firstBrace, lastBrace + 1);
            candidates.add(sliced);
            candidates.add(this.repairJson(sliced));
        }

        const firstBracket = trimmed.indexOf('[');
        const lastBracket = trimmed.lastIndexOf(']');
        if (firstBracket >= 0 && lastBracket > firstBracket) {
            const arraySlice = trimmed.slice(firstBracket, lastBracket + 1);
            candidates.add(arraySlice);
            candidates.add(this.repairJson(arraySlice));
        }

        return [...candidates];
    }

    private static extractLikelyJson(text: string): string {
        const trimmed = text.trim();
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1]) {
            return fenced[1].trim();
        }
        return trimmed
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();
    }

    private static repairJson(value: string): string {
        return value
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            // Quote unquoted object keys: { foo: "bar" } -> { "foo": "bar" }
            .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3')
            // Normalize string values with single quotes: { "foo": 'bar' } -> { "foo": "bar" }
            .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"')
            // Normalize arrays with single-quoted items: [ 'a', 'b' ] -> [ "a", "b" ]
            .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
            .replace(/,\s*([}\]])/g, '$1');
    }

    private static normalizePayloadRoot(raw: unknown): Record<string, unknown> | null {
        if (Array.isArray(raw)) {
            return { groups: raw };
        }
        if (!raw || typeof raw !== 'object') return null;
        return raw as Record<string, unknown>;
    }

    private static normalizeFiles(raw: unknown): string[] {
        if (typeof raw === 'string') return [raw.trim()].filter(Boolean);
        if (!Array.isArray(raw)) return [];

        const results: string[] = [];
        for (const entry of raw) {
            if (typeof entry === 'string' && entry.trim()) {
                results.push(entry.trim());
                continue;
            }
            if (entry && typeof entry === 'object') {
                const obj = entry as Record<string, unknown>;
                const path = this.getString(obj.path) || this.getString(obj.file) || this.getString(obj.name);
                if (path) results.push(path.trim());
            }
        }
        return [...new Set(results)];
    }

    private static normalizeType(value: string): string {
        const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
        return ALLOWED_TYPES.has(normalized) ? normalized : 'chore';
    }

    private static normalizeScope(value?: string): string | undefined {
        if (!value) return undefined;
        const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9\-_/]/g, '');
        return cleaned || undefined;
    }

    private static normalizeSubject(value: string): string {
        const cleaned = value.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
        if (!cleaned) return 'update staged changes';
        return cleaned.slice(0, 72);
    }

    private static normalizeCommitSubjectLine(subjectLine: string): string {
        const parsedPrefix = this.parseConventionalPrefix(subjectLine);
        if (!parsedPrefix) {
            return subjectLine.replace(/\s+/g, ' ').trim();
        }

        let remainder = parsedPrefix.remainder.trimStart();
        while (true) {
            const nestedPrefix = this.parseConventionalPrefix(remainder);
            if (!nestedPrefix) {
                break;
            }

            const sameType = nestedPrefix.type === parsedPrefix.type;
            const sameScope =
                !parsedPrefix.scope ||
                !nestedPrefix.scope ||
                nestedPrefix.scope === parsedPrefix.scope;

            if (!sameType || !sameScope) {
                break;
            }

            remainder = nestedPrefix.remainder.trimStart();
        }

        return remainder ? `${parsedPrefix.prefix} ${remainder}` : parsedPrefix.prefix;
    }

    private static parseConventionalPrefix(subject: string): { type: string; scope?: string; prefix: string; remainder: string } | null {
        const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*/i);
        if (!match) {
            return null;
        }

        return {
            type: match[1].toLowerCase(),
            scope: match[2]?.toLowerCase(),
            prefix: match[0].trimEnd(),
            remainder: subject.slice(match[0].length),
        };
    }

    private static normalizeConfidence(value: unknown): number {
        if (typeof value !== 'number' || Number.isNaN(value)) return 70;
        return Math.max(0, Math.min(100, Math.round(value)));
    }

    private static normalizeStringArray(value: unknown): string[] {
        if (typeof value === 'string' && value.trim()) return [value.trim()];
        if (!Array.isArray(value)) return [];
        return value
            .filter((item): item is string => typeof item === 'string')
            .map(item => item.trim())
            .filter(Boolean);
    }

    private static getString(value: unknown): string | undefined {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed || undefined;
    }

    private static formatCommitMessage(group: ParsedGroup): string {
        const scope = group.scope ? `(${group.scope})` : '';
        const normalizedSubject = group.subject || 'update staged changes';
        const body = group.body?.trim();
        const message = `${group.type}${scope}: ${normalizedSubject}`;
        const normalizedMessage = this.normalizeCommitSubjectLine(message);
        return body ? `${normalizedMessage}\n\n${body}` : normalizedMessage;
    }

    private static parseCommitMessage(message: string): { type?: string; scope?: string; subject: string; body?: string } | null {
        const normalized = message.trim();
        if (!normalized) return null;

        const [subjectLineRaw, ...rest] = normalized.split('\n');
        const subjectLine = subjectLineRaw.trim();
        const body = rest.join('\n').trim() || undefined;

        const conventional = subjectLine.match(/^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
        if (conventional) {
            const [, type, scope, subject] = conventional;
            return {
                type: type?.toLowerCase(),
                scope,
                subject,
                body,
            };
        }

        return {
            subject: subjectLine,
            body,
        };
    }
}
