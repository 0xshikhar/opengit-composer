import * as assert from 'assert';

suite('KeyManager Test Suite', () => {
    class MockSecrets {
        private storage: Map<string, string> = new Map();
        
        async get(key: string): Promise<string | undefined> {
            return this.storage.get(key);
        }
        
        async store(key: string, value: string): Promise<void> {
            this.storage.set(key, value);
        }
        
        async delete(key: string): Promise<void> {
            this.storage.delete(key);
        }
    }

    class MockContext {
        secrets = new MockSecrets();
    }

    test('should create empty storage on initialization', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        const keys = await keyManager.getKeys('openai');
        assert.deepStrictEqual(keys, []);
    });

    test('should add key to provider storage', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-test-key-123', 'Work');
        
        const keys = await keyManager.getKeys('openai');
        assert.strictEqual(keys.length, 1);
        assert.strictEqual(keys[0].key, 'sk-test-key-123');
        assert.strictEqual(keys[0].label, 'Work');
    });

    test('should not add duplicate keys', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-test-key-123', 'First');
        await keyManager.addKey('openai', 'sk-test-key-123', 'Second');
        
        const keys = await keyManager.getKeys('openai');
        assert.strictEqual(keys.length, 1, 'Duplicate key should not be added');
    });

    test('should add keys to different providers independently', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-openai-key', 'OpenAI Key');
        await keyManager.addKey('anthropic', 'sk-anthropic-key', 'Anthropic Key');
        
        const openaiKeys = await keyManager.getKeys('openai');
        const anthropicKeys = await keyManager.getKeys('anthropic');
        
        assert.strictEqual(openaiKeys.length, 1);
        assert.strictEqual(anthropicKeys.length, 1);
    });

    test('should remove key by index', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-key-1', 'First');
        await keyManager.addKey('openai', 'sk-key-2', 'Second');
        
        await keyManager.removeKey('openai', 0);
        
        const keys = await keyManager.getKeys('openai');
        assert.strictEqual(keys.length, 1);
        assert.strictEqual(keys[0].key, 'sk-key-2');
    });

    test('should rotate keys and track current index', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-key-1');
        await keyManager.addKey('openai', 'sk-key-2');
        
        const firstKey = await keyManager.getNextKey('openai');
        const secondKey = await keyManager.getNextKey('openai');
        const thirdKey = await keyManager.getNextKey('openai');
        
        assert.strictEqual(firstKey, 'sk-key-1');
        assert.strictEqual(secondKey, 'sk-key-2');
        assert.strictEqual(thirdKey, 'sk-key-1', 'Should wrap around to first key');
    });

    test('should return null when no keys available', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        const key = await keyManager.getNextKey('openai');
        assert.strictEqual(key, null);
    });

    test('should check if key exists for provider', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        const hasKeyBefore = await keyManager.hasKey('openai');
        assert.strictEqual(hasKeyBefore, false);
        
        await keyManager.addKey('openai', 'sk-test-key');
        
        const hasKeyAfter = await keyManager.hasKey('openai');
        assert.strictEqual(hasKeyAfter, true);
    });

    test('should get masked key for display', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-very-long-key-12345678', 'Test Key');
        
        const displayKeys = await keyManager.getKeysForDisplay('openai');
        assert.strictEqual(displayKeys.length, 1);
        assert.ok(displayKeys[0].masked.startsWith('sk-v'));
        assert.ok(displayKeys[0].masked.endsWith('5678'));
        assert.ok(displayKeys[0].masked.includes('***'), 'Should contain masked asterisks');
    });

    test('should reset all keys for a provider', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-key-1');
        await keyManager.addKey('anthropic', 'sk-key-2');
        
        await keyManager.resetProvider('openai');
        
        const openaiKeys = await keyManager.getKeys('openai');
        const anthropicKeys = await keyManager.getKeys('anthropic');
        
        assert.strictEqual(openaiKeys.length, 0);
        assert.strictEqual(anthropicKeys.length, 1);
    });

    test('should get key count for provider', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-key-1');
        await keyManager.addKey('openai', 'sk-key-2');
        
        const count = await keyManager.getKeyCount('openai');
        assert.strictEqual(count, 2);
    });

    test('should handle short keys in maskKey', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext) as any;
        
        const shortMasked = keyManager.maskKey('abc');
        assert.strictEqual(shortMasked, '***');
        
        const longMasked = keyManager.maskKey('verylongkey');
        // verylongkey = 11 chars: first 4 + 3 asterisks + last 4 = 4 + 3 + 4 = 11
        assert.strictEqual(longMasked.length, 11);
        assert.ok(longMasked.startsWith('very'));
        assert.ok(longMasked.endsWith('gkey'));
    });

    test('should get current key without rotation', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-current-key');
        
        const currentKey = await keyManager.getCurrentKey('openai');
        assert.strictEqual(currentKey, 'sk-current-key');
    });

    test('should get all providers that have keys', async () => {
        const { KeyManager } = require('../../core/keyManager');
        
        const mockContext = new MockContext() as any;
        const keyManager = new KeyManager(mockContext);
        
        await keyManager.addKey('openai', 'sk-key-1');
        await keyManager.addKey('anthropic', 'sk-key-2');
        
        const providers = await keyManager.getAllProviders();
        assert.strictEqual(providers.length, 2);
        assert.ok(providers.includes('openai'));
        assert.ok(providers.includes('anthropic'));
    });
});