# OpenGit Composer Bug & Issue Register

Last reviewed: 2026-04-20

This document is the current bug and risk register for the OpenGit Composer extension. It intentionally separates:
- issues that are confirmed and still open,
- issues that were reported earlier but are now fixed,
- and architecture or testability risks that can turn into bugs later.

Branch review note:
- I checked the current tree against this register. There are no new P0 blockers beyond the existing snapshot-safety and provider-reliability work that is already in place.
- The open items below are now mainly P2/P3 follow-ups. They are worth fixing, but they do not need to block this branch unless the goal is to spend the branch on UX and maintenance cleanup too.

Snapshot:
- Open bugs: `5`
- Fixed bugs: `8`
- Separate architecture/testability risks: `5`

## Status Legend

- `P0` - data safety, correctness, or trust blocker
- `P1` - user-visible bug or significant workflow issue
- `P2` - important limitation or polish issue
- `P3` - low-severity risk or maintainability issue

## Recently Fixed

These items were present in older notes, but the current codebase has fixes for them and they should not be treated as open bugs:

- Duplicate conventional prefixes in generated commit subjects are now normalized in the parser and orchestrator.
- LM Studio no longer inherits the Ollama-only unreachable code path; local-provider prechecks now use a generic local-provider code.
- Switching to LM Studio or Ollama clears any stale model selection before saving provider preferences.
- The manual refresh button now resets the current compose session instead of appearing to do nothing.
- Batch commit execution now rolls back the repo state if any draft fails mid-sequence.
- Ollama model validation now fails when the server reports zero models.
- File-based config no longer loads `apiKey` from `.gitcomposer.json`.
- Provider response extraction now uses defensive helpers instead of indexing directly into the first response item.
- Oversized prompt chunks are now truncated by both character count and line count.

## Confirmed Open Bugs

### 1. Local provider model discovery still uses Ollama-oriented naming

- Severity: `P2`
- Location: `src/features/provider-health/providerHealthSlice.ts`, `src/webview/ui/store/commitStore.ts`, `src/webview/ui/components/AIControls.tsx`
- Problem: LM Studio and Ollama both write to `ollamaModels` and emit `ollamaModelsLoaded`.
- Impact: The local-provider UX is confusing and the naming makes diagnostics harder to interpret. The implementation works, but the naming is misleading.
- Suggested fix: Rename the shared local-model state/commands to something provider-neutral, or split LM Studio and Ollama into explicit local-model channels.

### 2. Local provider refresh only reloads state; it does not auto-compose

- Severity: `P2`
- Location: `src/webview/host/handlers/workspaceHandlers.ts`, `src/webview/ui/App.tsx`
- Problem: Manual refresh now resets the session and reloads data, but it does not immediately re-run composition.
- Impact: This is correct for a session reset, but users who expect a "refresh and regenerate" behavior will still need to click compose again.
- Suggested fix: If desired, add a dedicated "Refresh and compose" action instead of overloading the refresh icon.

### 3. Forced regrouping can ignore the richer compose context

- Severity: `P2`
- Location: `src/core/orchestrator.ts`
- Problem: The `createForcedDraft()` fallback path asks the AI for a commit message with only the file list. It does not pass the same context and instruction set used by the main compose flow.
- Impact: Regrouped drafts can drift in style or ignore user instructions, especially when the app falls back to multi-commit enforcement.
- Suggested fix: Thread the same context, commit format, and additional instructions through the fallback draft generation path.

### 4. UI-side draft IDs are generated with `Math.random`

- Severity: `P3`
- Location: `src/webview/ui/store/commitStore.ts`
- Problem: `generateId()` uses `Math.random().toString(36).substring(2, 10)`.
- Impact: Collision risk is low, but not zero. If it happens, draft operations such as merge/split/select can target the wrong item.
- Suggested fix: Switch to `crypto.randomUUID()` where available, or use a stronger ID generator.

### 5. Windows path handling is still uneven in a few UI helpers

- Severity: `P2`
- Location: `src/webview/ui/components/CommitTreeItem.tsx`, `src/webview/ui/components/FileList.tsx`
- Problem: These components mostly assume Git-style `/` separators when extracting file names or directories.
- Impact: Git paths are usually normalized, so this is less severe than the repo-name bug, but it can still produce odd labels if a path is passed through with backslashes.
- Suggested fix: Normalize path separators at the boundary and keep the UI path helpers platform-neutral.

## Non-Issues From Older Notes

These were previously reported as bugs, but the current tree does not support them as open defects:

- "Duplicate ID generation in commit store" is a low-probability risk, not a confirmed breakage.
- "LM Studio model is not available on LMStudio" was a configuration mismatch and local-provider code-path issue; the code now distinguishes local providers correctly.
- "Refresh does nothing" was caused by session state not being reset. That path is now fixed.
- "Prompt size regression" was caused by minified build artifacts not being truncated enough. That path is fixed.
- "Unhandled promise in createForcedDraft" is not a current bug in the implementation.
- "GitService requires VS Code at construction" is a testability limitation, but not a user-facing runtime defect inside the extension host.

## Architecture And Maintenance Risks

These are not immediate user bugs, but they are worth tracking because they can turn into them:

- There are two panel-oriented code paths: the sidebar provider and the legacy `CommitComposerPanel.ts` implementation. Even if one is currently unused, duplicated logic makes drift more likely.
- Local-provider logic is split across compose preflight, provider health, and webview state naming. The user experience is correct now, but the naming still needs cleanup.
- The app depends on Git paths being normalized in a few places. Most of the code assumes forward slashes, which is okay for Git paths but still fragile for workspace-derived paths.
- The extension bundles and checks in `dist/`. If the bundle is not rebuilt after source changes, the runtime can drift from the source tree and reintroduce old bugs.

## What To Check First When A New Bug Appears

1. Determine whether the issue is in the webview UI, the host command router, the orchestrator, or a provider implementation.
2. Check whether the problem is a real runtime defect or an outdated artifact in `dist/`.
3. Compare the current provider path against the sidebar/provider-health path, since they do not all share the same code.
4. Verify whether the problem is already covered by the structured error codes in `src/types/messages.ts`.
5. Re-run the unit tests for the affected area before assuming the issue is fixed.
