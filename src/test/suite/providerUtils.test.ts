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

    test('should throw when chat completion content is null', () => {
        assert.throws(
            () => extractChatCompletionContent({
                choices: [{ message: { content: null } }],
            }, 'OpenAI'),
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

    test('should throw when gemini candidate has no parts but a finish reason', () => {
        assert.throws(
            () => extractGeminiContent({
                candidates: [
                    {
                        content: {
                            parts: [],
                        },
                        finishReason: 'SAFETY',
                    },
                ],
            }, 'Google'),
            /Google response had no text content \(finish reason: SAFETY\)/
        );
    });

    test('should surface gemini block reasons', () => {
        assert.throws(
            () => extractGeminiContent({
                promptFeedback: { blockReason: 'SAFETY' },
            }, 'Google'),
            /Google response blocked: SAFETY/
        );
    });

    test('should match file paths to canonical server model ids', () => {
        const { modelIdsMatch, extractModelIds } = require('../../ai/providers/providerUtils');
        
        // Exact and fuzzy match tests
        assert.strictEqual(modelIdsMatch('scratch/gemma4.gturbo', 'gemma-4-26b-a4b-it'), true);
        assert.strictEqual(modelIdsMatch('gemma4', 'gemma-4-26b-a4b-it'), true);
        assert.strictEqual(modelIdsMatch('llama3', 'meta-llama-3-8b-instruct'), true);
        assert.strictEqual(modelIdsMatch('models/mistral.gguf', 'mistral-7b-instruct-v0.2'), true);
        assert.strictEqual(modelIdsMatch('scratch/gemma4.gturbo', 'qwen-2.5-coder'), false);

        // Test extractModelIds on TurboFieldfare response format
        const turboPayload = {
            object: 'list',
            data: [
                {
                    object: 'model',
                    id: 'gemma-4-26b-a4b-it',
                    owned_by: 'turbofieldfare',
                    created: 0
                }
            ]
        };
        const extracted = extractModelIds(turboPayload);
        assert.deepStrictEqual(extracted, ['gemma-4-26b-a4b-it']);
    });
});
