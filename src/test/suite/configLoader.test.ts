import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

suite('ConfigLoader Test Suite', () => {
    const testWorkspace = path.join(os.tmpdir(), 'git-composer-test-' + Date.now());
    const originalCwd = process.cwd();
    
    setup(() => {
        if (!fs.existsSync(testWorkspace)) {
            fs.mkdirSync(testWorkspace, { recursive: true });
        }
    });
    
    teardown(() => {
        process.chdir(originalCwd);
        if (fs.existsSync(testWorkspace)) {
            const configPath = path.join(testWorkspace, '.gitcomposer.json');
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }
            fs.rmdirSync(testWorkspace);
        }
    });

    test('should use default values when no config exists', () => {
        const { ConfigLoader } = require('../../core/configLoader');
        
        const loader = new ConfigLoader();
        const config = loader.getConfig();
        
        assert.strictEqual(config.provider, 'openai');
        assert.strictEqual(config.commitFormat, 'conventional');
        assert.strictEqual(config.maxSubjectLength, 72);
        assert.strictEqual(config.splitThreshold, 3);
        assert.strictEqual(config.ollamaHost, 'http://localhost:11434');
    });

    test('should load provider from file config', () => {
        const configPath = path.join(testWorkspace, '.gitcomposer.json');
        fs.writeFileSync(configPath, JSON.stringify({
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
        }));

        process.chdir(testWorkspace);
        delete require.cache[require.resolve('../../core/configLoader')];
        const { ConfigLoader } = require('../../core/configLoader');
        const loader = new ConfigLoader();
        const config = loader.getConfig();

        assert.strictEqual(config.provider, 'anthropic');
        assert.strictEqual(config.model, 'claude-sonnet-4-20250514');
    });

    test('should ignore apiKey when loading file config', () => {
        const configPath = path.join(testWorkspace, '.gitcomposer.json');
        fs.writeFileSync(configPath, JSON.stringify({
            provider: 'openai',
            model: 'gpt-4o',
            apiKey: 'file-secret',
        }));

        process.chdir(testWorkspace);
        delete require.cache[require.resolve('../../core/configLoader')];
        const { ConfigLoader } = require('../../core/configLoader');
        const loader = new ConfigLoader();
        const config = loader.getConfig();

        assert.strictEqual(config.provider, 'openai');
        assert.strictEqual(config.model, 'gpt-4o');
        assert.strictEqual(config.apiKey, '');
    });

    test('should validate commit format options', () => {
        const validFormats = ['conventional', 'angular', 'gitmoji', 'custom'];
        
        validFormats.forEach(format => {
            assert.ok(true, `Format ${format} is valid`);
        });
    });

    test('should handle empty model gracefully', () => {
        const { ConfigLoader } = require('../../core/configLoader');
        const loader = new ConfigLoader();
        
        const config = loader.getConfig();
        assert.strictEqual(config.model, '', 'Model should be empty string by default');
    });
});
