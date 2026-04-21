import * as assert from 'assert';
import { isHostToWebviewMessage, isWebviewToHostMessage } from '../../types/messages';

suite('Messages Test Suite', () => {
    test('should accept known webview-to-host messages', () => {
        assert.strictEqual(isWebviewToHostMessage({ command: 'compose' }), true);
        assert.strictEqual(isWebviewToHostMessage({ command: 'commitAll', drafts: [] }), true);
    });

    test('should reject unknown webview-to-host messages', () => {
        assert.strictEqual(isWebviewToHostMessage({ command: 'not-a-command' }), false);
        assert.strictEqual(isWebviewToHostMessage({}), false);
    });

    test('should accept known host-to-webview messages', () => {
        assert.strictEqual(isHostToWebviewMessage({ command: 'dataLoaded' }), true);
        assert.strictEqual(isHostToWebviewMessage({ command: 'error', message: 'boom' }), true);
    });

    test('should reject unknown host-to-webview messages', () => {
        assert.strictEqual(isHostToWebviewMessage({ command: 'random' }), false);
        assert.strictEqual(isHostToWebviewMessage(null), false);
    });
});
