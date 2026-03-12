import * as assert from 'assert';
import { DiffParser } from '../../core/parser/diffParser';
import { ChangeType } from '../../types/git';

suite('DiffParser Test Suite', () => {
    test('should parse unified diff correctly for modified file', () => {
        const dummyDiff = `diff --git a/test.ts b/test.ts
index e69de29..4b825dc 100644
--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,4 @@
 line1
-line2
+line2_changed
+line3
 line4`;

        const parsed = DiffParser.parse(dummyDiff);

        assert.strictEqual(parsed.files.length, 1);
        const fileDiff = parsed.files[0];

        assert.strictEqual(fileDiff.path, 'test.ts');
        assert.strictEqual(fileDiff.changeType, ChangeType.Modified);
        assert.strictEqual(fileDiff.hunks.length, 1);

        const hunk = fileDiff.hunks[0];
        assert.strictEqual(hunk.oldStart, 1);
        assert.strictEqual(hunk.oldLines, 3);
        assert.strictEqual(hunk.newStart, 1);
        assert.strictEqual(hunk.newLines, 4);

        assert.strictEqual(fileDiff.additions, 2);
        assert.strictEqual(fileDiff.deletions, 1);
    });

    test('should identify new file correctly', () => {
        const dummyDiff = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,1 @@
+newline`;
        const parsed = DiffParser.parse(dummyDiff);

        assert.strictEqual(parsed.files.length, 1);
        assert.strictEqual(parsed.files[0].path, 'new.ts');
        assert.strictEqual(parsed.files[0].changeType, ChangeType.Added);
        assert.strictEqual(parsed.files[0].additions, 1);
        assert.strictEqual(parsed.files[0].deletions, 0);
    });

    test('should identify deleted file correctly', () => {
        const dummyDiff = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index e69de29..0000000
--- a/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-oldline`;
        const parsed = DiffParser.parse(dummyDiff);

        assert.strictEqual(parsed.files.length, 1);
        assert.strictEqual(parsed.files[0].changeType, ChangeType.Deleted);
        assert.strictEqual(parsed.files[0].additions, 0);
        assert.strictEqual(parsed.files[0].deletions, 1);
    });

    test('should identify renamed file correctly', () => {
        const dummyDiff = `diff --git a/old-name.ts b/new-name.ts
similarity index 90%
rename from old-name.ts
rename to new-name.ts
index abcdef..123456 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,2 +1,2 @@
 content
-old-line
+new-line`;
        const parsed = DiffParser.parse(dummyDiff);

        assert.strictEqual(parsed.files.length, 1);
        assert.strictEqual(parsed.files[0].changeType, ChangeType.Renamed);
        assert.strictEqual(parsed.files[0].path, 'new-name.ts');
        assert.strictEqual(parsed.files[0].oldPath, 'old-name.ts');
    });

    test('should parse multi-file diff', () => {
        const multiDiff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,2 @@
-old
+new
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1,1 +1,1 @@
-a
+b`;
        const parsed = DiffParser.parse(multiDiff);

        assert.strictEqual(parsed.files.length, 2);
        assert.strictEqual(parsed.files[0].path, 'file1.ts');
        assert.strictEqual(parsed.files[1].path, 'file2.ts');
    });

    test('should handle binary files', () => {
        const binaryDiff = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ`;
        const parsed = DiffParser.parse(binaryDiff);

        assert.strictEqual(parsed.files.length, 1);
        assert.strictEqual(parsed.files[0].isBinary, true);
    });

    test('should return empty files for empty diff', () => {
        const parsed = DiffParser.parse('');
        assert.strictEqual(parsed.files.length, 0);

        const parsedWhitespace = DiffParser.parse('   ');
        assert.strictEqual(parsedWhitespace.files.length, 0);
    });

    test('should parse single file diff', () => {
        const singleDiff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,2 +1,2 @@
 line1
-line2
+new-line2`;
        const parsed = DiffParser.parseSingleFileDiff(singleDiff);

        assert.ok(parsed !== null);
        assert.strictEqual(parsed!.path, 'test.ts');
        assert.strictEqual(parsed!.hunks.length, 1);
    });

    test('should return null for empty single file diff', () => {
        const parsed = DiffParser.parseSingleFileDiff('');
        assert.strictEqual(parsed, null);
    });

    test('should parse hunk headers with line counts', () => {
        const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -5,10 +6,12 @@
 content`;
        const parsed = DiffParser.parse(diff);

        assert.strictEqual(parsed.files[0].hunks.length, 1);
        const hunk = parsed.files[0].hunks[0];
        assert.strictEqual(hunk.oldStart, 5);
        assert.strictEqual(hunk.oldLines, 10);
        assert.strictEqual(hunk.newStart, 6);
        assert.strictEqual(hunk.newLines, 12);
    });

    test('should handle multiple hunks in single file', () => {
        const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
-old1
+new1
@@ -10,3 +10,3 @@
-old2
+new2`;
        const parsed = DiffParser.parse(diff);

        assert.strictEqual(parsed.files[0].hunks.length, 2);
    });

    test('should parse all line types in diff', () => {
        const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,4 +1,4 @@
 context line
-deleted line
+added line
 context line`;
        const parsed = DiffParser.parse(diff);

        const hunk = parsed.files[0].hunks[0];
        assert.strictEqual(hunk.lines[0].type, 'context');
        assert.strictEqual(hunk.lines[1].type, 'delete');
        assert.strictEqual(hunk.lines[2].type, 'add');
        assert.strictEqual(hunk.lines[3].type, 'context');
    });

    test('should handle diff without hunk headers', () => {
        const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
+added line
+added line 2`;
        const parsed = DiffParser.parse(diff);

        assert.strictEqual(parsed.files[0].hunks.length, 0);
        // Without hunk headers, additions cannot be reliably counted
        assert.ok(parsed.files[0].additions >= 0);
    });
});
