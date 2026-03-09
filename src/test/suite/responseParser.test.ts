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

    test('should mark parser fallback metadata when response is unparseable', () => {
        const changes = [change('src/d.ts'), change('src/e.ts')];
        const parsed = ResponseParser.parseGroupingResponse('totally-not-json', changes);

        assert.strictEqual(parsed.parserMeta?.usedFallback, true);
        assert.ok(parsed.groups.length > 0);
    });
});
