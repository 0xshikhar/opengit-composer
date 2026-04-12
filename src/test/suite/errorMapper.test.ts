import * as assert from 'assert';
import { mapErrorToMessage } from '../../features/support/errorMapper';

suite('Error Mapper Test Suite', () => {
    const configLoader = {
        getConfig: () => ({
            provider: 'openai',
            model: 'gpt-5',
        }),
    } as any;

    test('maps stale snapshot errors to recoverable warnings', () => {
        const error = new Error('Staged changes have changed since composition. Refresh and re-compose before committing.');
        (error as any).code = 'STAGED_SNAPSHOT_STALE';
        const mapped = mapErrorToMessage(error, configLoader);

        assert.strictEqual(mapped.code, 'STAGED_SNAPSHOT_STALE');
        assert.strictEqual(mapped.severity, 'warning');
        assert.strictEqual(mapped.recoverable, true);
        assert.ok(mapped.action);
        assert.strictEqual(mapped.action?.command, 'refresh');
    });

    test('maps missing api key errors to recoverable errors', () => {
        const mapped = mapErrorToMessage(new Error('Missing API key for provider "openai"'), configLoader);

        assert.strictEqual(mapped.code, 'PRECHECK_MISSING_API_KEY');
        assert.strictEqual(mapped.severity, 'error');
        assert.strictEqual(mapped.recoverable, true);
        assert.ok(mapped.action);
        assert.strictEqual(mapped.action?.command, 'testConnection');
    });

    test('keeps local provider unreachable errors provider-specific', () => {
        const error = new Error('Unable to reach LM Studio at http://localhost:1234/v1. Check the host and whether the local server is running.');
        (error as any).code = 'PRECHECK_LOCAL_PROVIDER_UNREACHABLE';
        const mapped = mapErrorToMessage(error, configLoader);

        assert.strictEqual(mapped.code, 'PRECHECK_LOCAL_PROVIDER_UNREACHABLE');
        assert.strictEqual(mapped.severity, 'error');
        assert.strictEqual(mapped.recoverable, true);
    });

    test('maps rate limit errors to warning severity', () => {
        const error = new Error('429 rate limit exceeded');
        (error as any).code = 'RATE_LIMIT';
        const mapped = mapErrorToMessage(error, configLoader);

        assert.strictEqual(mapped.code, 'RATE_LIMIT');
        assert.strictEqual(mapped.severity, 'warning');
        assert.strictEqual(mapped.recoverable, true);
        assert.ok(mapped.action);
        assert.strictEqual(mapped.action?.command, 'retryCompose');
    });

    test('maps missing git repository errors to a directory selection action', () => {
        const mapped = mapErrorToMessage(new Error('fatal: not a git repository (or any of the parent directories): .git'), configLoader);

        assert.strictEqual(mapped.code, 'NO_GIT_REPOSITORY');
        assert.strictEqual(mapped.severity, 'warning');
        assert.strictEqual(mapped.recoverable, true);
        assert.ok(mapped.action);
        assert.strictEqual(mapped.action?.command, 'openWorkspace');
    });
});
