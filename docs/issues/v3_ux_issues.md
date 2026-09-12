# OpenGit Composer v3 UX/UI Issues and Improvements Roadmap

This document captures UX/UI issues, behavioral differences from native VS Code SCM, and tracked improvements planned or implemented for OpenGit Composer v3.

---

## Implemented in v3.0 Milestone

### 1. File Selection and Native Diff Viewing Behavior
- **Status:** ✅ **COMPLETED**
- **Issue:** Previously, clicking on a staged or unstaged file in the OpenGit Composer sidebar opened the custom inline diff viewer inside the narrow sidebar itself. The inline diff was illegible and broke the workflow.
- **Solution:** 
  - Registered `GitContentProvider` with custom scheme `opengit-diff://` to dynamically serve file contents for `HEAD`, git index (`:path`), or empty (`/dev/null`).
  - Added `openDiff` command handler on the extension host invoking `vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title)`.
  - For staged files: diffs `Index ↔ HEAD`.
  - For unstaged files: diffs `Index ↔ Working Tree`.
  - Clicking any file in the sidebar now directly launches the full-screen VS Code diff editor tab while preserving the sidebar file list.
  - Added dedicated "Open File in Editor" button on hover (`openFile`).

### 2. Missing Quick Actions for Staging / Unstaging (Add / Remove)
- **Status:** ✅ **COMPLETED**
- **Issue:** No quick buttons were available in the sidebar to stage (`git add`) or unstage (`git reset HEAD`) files without running terminal commands.
- **Solution:**
  - Added hover action buttons on file items:
    - Unstaged files show `+` button to stage changes immediately.
    - Staged files show `-` button to unstage changes immediately.
  - Added directory-level actions:
    - Hovering on folder headers shows `+` (stage all files in folder) or `-` (unstage all files in folder).
  - Added section-level actions:
    - Header for "Staged Changes" has a `-` (Unstage All Changes) button.
    - Header for "Changes" has a `+` (Stage All Changes) button.
  - Added `stageFiles`, `unstageFiles`, `stageAll`, and `unstageAll` message handlers that immediately refresh git status and update the UI.

### 3. Hierarchical File Tree Styling and Native Layout
- **Status:** ✅ **COMPLETED**
- **Issue:** File changes were grouped only by top-level folder names using custom text arrows (`▸`, `▾`) and flat indentation.
- **Solution:**
  - Implemented `buildFileTree` to convert file lists into true hierarchical nested directory trees with recursive level indentation.
  - Replaced text glyphs with clean, modern icons (`Folder`, `FolderOpen`, `FileCode`, `ChevronDown`, `ChevronRight`, `Plus`, `Minus`, `ExternalLink`).
  - Styled hover action buttons with VS Code standard opacity, hover backgrounds, and layout mirroring the native Source Control view.
  - Added change badges (`M`, `A`, `D`, `U`, `R`) matching VS Code git decoration colors.

### 4. LM Studio False "Model Failover" Warning and Active Model Resolution
- **Status:** ✅ **COMPLETED**
- **Issue:** When using LM Studio local models that do not support OpenAI-style `response_format: { type: "json_object" }` (such as `qwen3.5-4b-claude-4.6-opus-reasoning-distilled`), the provider retried without the parameter and succeeded, but set `failover: true`. This caused the UI to show an alarming orange warning: `"AI model failover active: X switched to X"` and a `MODEL FAILOVER` badge, even though the exact same model produced the commits. Additionally, the model summary card displayed `"Model: Default"` instead of identifying the loaded local model.
- **Solution:**
  - In `LMStudioProvider`, updated the compatibility retry so `failover: false` remains set when the model itself has not changed.
  - Added an in-memory compatibility cache (`unsupportedResponseFormatKeys`) to skip `response_format` immediately on subsequent calls, eliminating latency and 400 errors.
  - Guarded `ComposeWorkspace.tsx`, `StatusBar.tsx`, and `Orchestrator.ts` so `aiModelFailover` is only active when `requestedModel !== usedModel`.
  - Updated `AIControls.tsx` to display `Model: Active (<modelName>)` when using the active local model.

### 5. Git Discard Changes Action
- **Status:** ✅ **COMPLETED**
- **Issue:** In native VS Code SCM, unstaged files have an "undo / discard changes" button to quickly revert unwanted changes.
- **Solution:**
  - Added `discardFiles(files: string[])` and `discardAll()` in `gitService.ts`. Tracked files are restored with `git checkout -- <file>` and untracked files/folders are safely cleaned with `git clean -f -d -- <file>`.
  - Added safety modal confirmation dialogs in `gitActionHandlers.ts` via `vscode.window.showWarningMessage` with `{ modal: true }` to prevent accidental data loss.
  - Added discard buttons (`Undo2` icon with danger hover styling) on unstaged file rows, unstaged folder headers, and the "Changes" section header.

### 6. Multi-File Selection & Batch Actions
- **Status:** ✅ **COMPLETED**
- **Issue:** Users could not Shift-click or Cmd/Ctrl-click multiple files to stage, unstage, or discard custom selections.
- **Solution:**
  - Added multi-selection state (`selectedFilePaths: string[]`) and actions (`toggleFileSelection`, `setSelectedFilePaths`, `clearFileSelection`) in `commitStore.ts`.
  - Implemented `Cmd/Ctrl+click` toggle and `Shift+click` contiguous range selection in `FileList.tsx`.
  - Implemented a floating/sticky batch action toolbar showing selected file count with bulk "Stage", "Unstage", "Discard", and "Clear Selection" buttons.

### 7. Native Inline Commit Message Input & AI Generator
- **Status:** ✅ **COMPLETED**
- **Issue:** In native VS Code SCM, the commit message textarea is permanently accessible at the top of the sidebar with a primary Commit button, whereas OpenGit Composer previously only provided a "Compose commit" button.
- **Solution:**
  - Created `InlineCommitBox.tsx` mounted at the top of the sidebar view.
  - Features an inline commit message textarea with keyboard shortcut support (`⌘Enter` on macOS, `Ctrl+Enter` on Windows/Linux).
  - Features an inline `Generate 🪄` AI commit button that generates concise commit messages for working changes on the fly.
  - Features a primary `✓ Commit` button that commits directly (with automatic staging prompt if no files are staged yet).
  - Preserves the secondary `⚡ Split Commits` button for opening the full multi-commit decomposition workspace.

---

## Future Roadmap / Planned Enhancements

### 8. Drag-and-Drop File Reassignment Between Drafts
- **Issue:** In the full composer view, moving files between generated draft commits requires clicking through dropdowns or manual editing.
- **Proposed Solution:** Support drag-and-drop of files between draft commit cards in `ComposeWorkspace.tsx`.

### 9. Keyboard Accessibility & Tree Navigation
- **Issue:** Navigating the file list and draft commits currently requires mouse interaction; arrow keys do not navigate the tree.
- **Proposed Solution:** Implement keyboard focus rings, `ArrowUp`/`ArrowDown` item traversal, `Enter` to open diff, and `Space` to toggle staging.

### 10. Real-Time File System & Git Watcher Sync
- **Issue:** If files are modified or staged outside VS Code (e.g. in the terminal), the composer webview may require a manual refresh or window refocus.
- **Proposed Solution:** Hook into `vscode.workspace.createFileSystemWatcher` or VS Code Git extension API events to trigger automatic background refreshes when `.git/index` or repo files change.

### 11. Dark/Light/High-Contrast Theme Tuning
- **Issue:** Some custom color values (`#2c3450`, `#8f6f0012`) do not adapt gracefully to VS Code Light or High Contrast themes.
- **Proposed Solution:** Replace all hardcoded hex values with semantic CSS variables (`var(--vscode-gitDecoration-*)`, `var(--vscode-sideBarSectionHeader-*)`, `var(--vscode-list-*)`).
