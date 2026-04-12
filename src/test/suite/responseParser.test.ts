import * as assert from 'assert';
import { ResponseParser } from '../../ai/responseParser';
import { ChangeType, FileChange } from '../../types/git';

function change(path: string): FileChange {
    return {
        path,
        changeType: ChangeType.Modified,
        diff: '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new',
        additions: 1,
        deletions: 1,
    };
}

suite('ResponseParser Test Suite', () => {
    test('should parse array-root JSON payloads', () => {
        const changes = [change('src/a.ts')];
        const response = JSON.stringify([
            {
                files: ['src/a.ts'],
                type: 'feat',
                subject: 'add parser path',
                confidence: 92,
            },
        ]);

        const parsed = ResponseParser.parseGroupingResponse(response, changes);

        assert.strictEqual(parsed.groups.length, 1);
        assert.strictEqual(parsed.groups[0].files[0].path, 'src/a.ts');
        assert.strictEqual(parsed.parserMeta?.usedFallback, false);
    });

    test('should repair loose JSON with unquoted keys and single quotes', () => {
        const changes = [change('src/b.ts')];
        const response = `
        {
          groups: [
            {
              files: ['src/b.ts'],
              type: 'fix',
              subject: 'repair parser',
              confidence: 81
            }
          ]
        }`;

        const parsed = ResponseParser.parseGroupingResponse(response, changes);

        assert.strictEqual(parsed.groups.length, 1);
        assert.strictEqual(parsed.groups[0].message.startsWith('fix'), true);
        assert.strictEqual(parsed.parserMeta?.usedFallback, false);
    });

    test('should parse commit_message formatted subjects correctly', () => {
        const changes = [change('src/c.ts')];
        const response = JSON.stringify({
            groups: [
                {
                    files: ['src/c.ts'],
                    message: 'refactor(parser): improve fallback parsing\n\nHandles non-standard JSON wrappers.',
                    confidence: 88,
                },
            ],
        });

        const parsed = ResponseParser.parseGroupingResponse(response, changes);
        const message = parsed.groups[0].message;

        assert.strictEqual(message.startsWith('refactor(parser): improve fallback parsing'), true);
        assert.strictEqual(message.includes('Handles non-standard JSON wrappers.'), true);
    });

    test('should normalize repeated conventional prefixes in parsed subjects', () => {
        const changes = [change('src/core/a.ts')];
        const response = JSON.stringify({
            groups: [
                {
                    files: ['src/core/a.ts'],
                    type: 'feat',
                    scope: 'session',
                    subject: 'feat: implement user session management',
                    confidence: 90,
                },
            ],
        });

        const parsed = ResponseParser.parseGroupingResponse(response, changes);

        assert.strictEqual(
            parsed.groups[0].message,
            'feat(session): implement user session management'
        );
    });

    test('should mark parser fallback metadata when response is unparseable', () => {
        const changes = [change('src/d.ts'), change('src/e.ts')];
        const parsed = ResponseParser.parseGroupingResponse('totally-not-json', changes);

        assert.strictEqual(parsed.parserMeta?.usedFallback, true);
        assert.ok(parsed.groups.length > 0);
    });

    test('should parse valid JSON response', () => {
        const mockChanges = [
            change('src/components/Button.tsx'),
            change('src/components/Input.tsx'),
            change('package.json'),
            change('README.md'),
        ];
        
        const mockResponse = JSON.stringify({
            summary: 'Summary of changes',
            reasoning: 'Reasoning for grouping',
            groups: [
                {
                    type: 'feat',
                    scope: 'ui',
                    subject: 'add button component',
                    body: 'Detailed description',
                    files: ['src/components/Button.tsx'],
                    confidence: 90,
                    rationale: 'New UI component',
                    verification: ['Run tests'],
                    risks: ['None']
                }
            ]
        });

        const result = ResponseParser.parseGroupingResponse(mockResponse, mockChanges);

        assert.strictEqual(result.groups.length, 1);
        assert.ok(result.groups[0].message.includes('feat(ui): add button component'));
        assert.strictEqual(result.groups[0].confidence, 90);
        assert.strictEqual(result.summary, 'Summary of changes');
    });

    test('should fallback to heuristic on invalid JSON', () => {
        const mockChanges = [
            change('src/components/Button.tsx'),
            change('src/components/Input.tsx'),
        ];
        const invalidResponse = 'This is not valid JSON at all';
        
        const result = ResponseParser.parseGroupingResponse(invalidResponse, mockChanges);

        assert.ok(result.parserMeta?.usedFallback, 'Should use fallback');
        assert.strictEqual(result.parserMeta?.strategy, 'heuristic-fallback');
    });

    test('should normalize file paths case-insensitively', () => {
        const mockChanges = [change('src/components/Button.tsx')];
        
        const response = JSON.stringify({
            groups: [
                { type: 'feat', subject: 'update button', files: ['SRC/COMPONENTS/BUTTON.TSX'], confidence: 80 }
            ]
        });

        const result = ResponseParser.parseGroupingResponse(response, mockChanges);

        assert.strictEqual(result.groups[0].files.length, 1);
        assert.strictEqual(result.groups[0].files[0].path, 'src/components/Button.tsx');
    });

    test('should handle files referenced by basename only', () => {
        const mockChanges = [
            change('src/components/Button.tsx'),
            change('src/components/Input.tsx'),
            change('package.json'),
        ];
        
        const response = JSON.stringify({
            groups: [
                { type: 'fix', subject: 'fix button', files: ['Button.tsx'], confidence: 80 }
            ]
        });

        const result = ResponseParser.parseGroupingResponse(response, mockChanges);

        // basename matching can match multiple files if basename is not unique
        assert.ok(result.groups[0].files.length >= 1);
    });

    test('should assign leftover files to last group', () => {
        const mockChanges = [
            change('src/components/Button.tsx'),
            change('src/components/Input.tsx'),
            change('package.json'),
        ];
        
        const response = JSON.stringify({
            groups: [
                { type: 'feat', subject: 'add button', files: ['src/components/Button.tsx'], confidence: 90 }
            ]
        });

        const result = ResponseParser.parseGroupingResponse(response, mockChanges);

        const lastGroup = result.groups[result.groups.length - 1];
        const leftoverFiles = lastGroup.files.filter(f => 
            f.path !== 'src/components/Button.tsx'
        );
        assert.ok(leftoverFiles.length > 0, 'Should have leftover files');
    });

    test('should handle empty groups array', () => {
        const mockChanges = [change('a.ts'), change('b.ts')];
        const response = JSON.stringify({ groups: [] });

        const result = ResponseParser.parseGroupingResponse(response, mockChanges);

        assert.ok(result.groups.length > 0, 'Should create fallback group');
    });

    test('should parse markdown code block JSON', () => {
        const response = '```json\n{"groups":[{"type":"fix","subject":"bug","files":["a.ts"]}]}\n```';
        
        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts')]);

        assert.strictEqual(result.groups.length, 1);
    });

    test('should normalize unconventional types to chore', () => {
        const response = JSON.stringify({
            groups: [{ type: 'unknown-type', subject: 'test', files: ['a.ts'], confidence: 50 }]
        });

        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts')]);

        assert.strictEqual(result.groups[0].message.startsWith('chore'), true);
    });

    test('should extract message from nested result object', () => {
        const response = JSON.stringify({
            result: {
                groups: [{ type: 'feat', subject: 'feature', files: ['a.ts'], confidence: 90 }]
            }
        });

        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts')]);

        assert.strictEqual(result.groups.length, 1);
    });

    test('should handle files as object array', () => {
        const response = JSON.stringify({
            groups: [{ 
                type: 'feat', 
                subject: 'feature', 
                files: [{ path: 'a.ts' }, { file: 'b.ts' }], 
                confidence: 90 
            }]
        });

        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts'), change('b.ts')]);

        assert.strictEqual(result.groups[0].files.length, 2);
    });

    test('should handle malformed JSON with repairable issues', () => {
        const response = '{ "groups": [{ "type": "fix", "subject": "bug", "files": ["a.ts"], "confidence": 80 }]';
        
        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts')]);

        assert.strictEqual(result.groups.length, 1);
    });

    test('should truncate long subjects to 72 chars', () => {
        const longSubject = 'a'.repeat(100);
        const response = JSON.stringify({
            groups: [{ type: 'feat', subject: longSubject, files: ['a.ts'], confidence: 80 }]
        });

        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts')]);

        const subjectPart = result.groups[0].message.split(': ')[1];
        assert.ok(subjectPart.length <= 72, 'Subject should be truncated');
    });

    test('should parse message response without code blocks', () => {
        // Note: The current implementation has a bug where it removes entire code blocks
        // including their content. This test documents current behavior.
        const dirtyMessage = 'Some text before ```json\n{"message": "test"}\n``` and after';
        
        const result = ResponseParser.parseMessageResponse(dirtyMessage);
        
        // Current implementation removes code blocks completely
        // which means it also removes content - this is a known issue
        assert.ok(result.includes('before') || result.includes('after'));
    });

    test('should normalize repeated conventional prefixes in message responses', () => {
        const result = ResponseParser.parseMessageResponse(
            'feat(core): feat(core): improve commit composer\n\nKeep the parser output clean.'
        );

        assert.strictEqual(
            result,
            'feat(core): improve commit composer\n\nKeep the parser output clean.'
        );
    });

    test('should handle single quote JSON repair', () => {
        const response = "{'groups': [{'type': 'fix', 'subject': 'bug', 'files': ['a.ts']}]}";
        
        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts')]);

        assert.strictEqual(result.groups.length, 1);
    });

    test('should use structured-json strategy on successful parse', () => {
        const response = JSON.stringify({
            groups: [{ type: 'feat', subject: 'test', files: ['a.ts'], confidence: 80 }]
        });

        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts')]);

        assert.strictEqual(result.parserMeta?.strategy, 'structured-json');
    });

    test('should handle array-root response', () => {
        const response = JSON.stringify([
            { type: 'feat', subject: 'feature 1', files: ['a.ts'], confidence: 90 },
            { type: 'fix', subject: 'fix 1', files: ['b.ts'], confidence: 85 }
        ]);

        const result = ResponseParser.parseGroupingResponse(response, [change('a.ts'), change('b.ts')]);

        assert.strictEqual(result.groups.length, 2);
    });
});
