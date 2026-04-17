import * as assert from 'assert';
import {
    extractChatCompletionContent,
    extractGeminiContent,
} from '../../ai/providers/providerUtils';

suite('Provider Utils Test Suite', () => {
    test('should extract chat completion content safely', () => {
        const content = extractChatCompletionContent({
            choices: [{ message: { content: '  hello world  ' } }],
        }, 'OpenAI');

        assert.strictEqual(content, '  hello world  ');
    });

    test('should throw when chat completion content is missing', () => {
        assert.throws(
            () => extractChatCompletionContent({ choices: [] }, 'OpenAI'),
            /OpenAI response did not include commit message content/
        );
    });

    test('should extract gemini content from candidate parts', () => {
        const content = extractGeminiContent({
            candidates: [
                {
                    content: {
                        parts: [
                            { text: 'first line' },
                            { text: 'second line' },
                        ],
                    },
                },
            ],
        }, 'Google');

        assert.strictEqual(content, 'first line\nsecond line');
    });

    test('should surface gemini block reasons', () => {
        assert.throws(
            () => extractGeminiContent({
                promptFeedback: { blockReason: 'SAFETY' },
            }, 'Google'),
            /Google response blocked: SAFETY/
        );
    });
});
