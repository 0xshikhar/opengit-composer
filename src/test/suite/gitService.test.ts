import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitService } from '../../core/git/gitService';
import { ChangeType } from '../../types/git';
import { GitWatcher } from '../../core/git/gitWatcher';

suite('GitService Untracked Files & GitWatcher Test Suite', () => {
    let tempDir: string;

    setup(async () => {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-service-test-'));
    });

    teardown(async () => {
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore teardown errors
        }
    });

    test('getUnstagedChanges includes untracked files with ChangeType.Untracked and diff stats', async () => {
        const untrackedFileName = 'new_untracked_file.txt';
        const fileContent = 'line 1\nline 2\nline 3\n';
        await fs.promises.writeFile(path.join(tempDir, untrackedFileName), fileContent, 'utf8');

        const gitService = new GitService(tempDir);
        (gitService as any).repoRootResolved = true;

        // Stub simple-git on gitService
        (gitService as any).git = {
            status: async () => ({
                not_added: [untrackedFileName],
                files: [
                    { path: 'modified.ts', index: ' ', working_dir: 'M' },
                    { path: untrackedFileName, index: '?', working_dir: '?' },
                ],
            }),
            diff: async (args: string[]) => {
                if (args.some(a => a.includes('modified.ts'))) {
                    return '--- a/modified.ts\n+++ b/modified.ts\n@@ -1 +1 @@\n-old\n+new\n';
                }
                return '';
            },
            revparse: async () => tempDir,
        };

        const unstaged = await gitService.getUnstagedChanges();

        assert.strictEqual(unstaged.length, 2, 'Should include both modified and untracked files');

        const untracked = unstaged.find(f => f.path === untrackedFileName);
        assert.ok(untracked, 'Untracked file must be in unstaged changes list');
        assert.strictEqual(untracked.changeType, ChangeType.Untracked);
        assert.strictEqual(untracked.additions, 3);
        assert.strictEqual(untracked.deletions, 0);
        assert.ok(untracked.diff.includes('+++ b/' + untrackedFileName));
        assert.ok(untracked.diff.includes('+line 1'));

        const modified = unstaged.find(f => f.path === 'modified.ts');
        assert.ok(modified, 'Modified file must be in unstaged changes list');
        assert.strictEqual(modified.changeType, ChangeType.Modified);
        assert.strictEqual(modified.additions, 1);
        assert.strictEqual(modified.deletions, 1);
    });

    test('getUnstagedChanges handles untracked binary files safely without corruption', async () => {
        const binaryFileName = 'image.png';
        const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
        await fs.promises.writeFile(path.join(tempDir, binaryFileName), binaryBuffer);

        const gitService = new GitService(tempDir);
        (gitService as any).repoRootResolved = true;
        (gitService as any).git = {
            status: async () => ({
                not_added: [binaryFileName],
                files: [
                    { path: binaryFileName, index: '?', working_dir: '?' },
                ],
            }),
            diff: async () => '',
            revparse: async () => tempDir,
        };

        const unstaged = await gitService.getUnstagedChanges();
        assert.strictEqual(unstaged.length, 1);
        assert.strictEqual(unstaged[0].path, binaryFileName);
        assert.strictEqual(unstaged[0].changeType, ChangeType.Untracked);
        assert.strictEqual(unstaged[0].additions, 0);
        assert.ok(unstaged[0].diff.includes('Binary files'));
    });

    test('GitWatcher debounces rapid events into a single notification', async () => {
        let triggerCount = 0;
        const watcher = new GitWatcher(() => {
            triggerCount++;
        }, 50);

        // Rapid triggers
        (watcher as any).trigger();
        (watcher as any).trigger();
        (watcher as any).trigger();

        // Immediately count should still be 0
        assert.strictEqual(triggerCount, 0);

        // Wait for debounce timer to fire
        await new Promise(resolve => setTimeout(resolve, 80));

        assert.strictEqual(triggerCount, 1, 'Debounced watcher should fire exactly once for rapid triggers');
        watcher.dispose();
    });
});
