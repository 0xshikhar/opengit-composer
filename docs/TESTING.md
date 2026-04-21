# OpenGit Composer Testing Guide

This guide covers automated checks and manual QA for current extension behavior.

## 1. Prerequisites

- Node.js 18+
- `pnpm` 10+
- VS Code 1.85+
- A git repository with staged changes

## 2. Automated Test Commands

```bash
# lint
pnpm run lint

# unit tests
pnpm run test

# build both extension + webview
pnpm run compile

# integration harness
pnpm run test:integration
```

Minimum pre-merge quality bar:
1. `pnpm run lint`
2. `pnpm run test`
3. `pnpm run compile`

## 3. Install Extension for Manual Testing

### Option A: VSIX install

```bash
pnpm install
pnpm run compile
pnpm run package:vsix
```

Then install generated `.vsix` from VS Code Command Palette:
- `Extensions: Install from VSIX...`

### Option B: Extension Development Host

Run/debug from VS Code extension host and verify behaviors there.

## 4. Core Manual Smoke Checklist

### 4.1 Activation and UI

1. Open VS Code with a git repo.
2. Verify `OpenGit Composer` icon appears in Activity Bar.
3. Open the view and verify staged files list renders.
4. Confirm both actions are visible:
   - `Auto-Compose Commits`
   - `Open In Full Panel`

### 4.2 Compose Success Path

1. Stage 2-5 changed files.
2. Run compose.
3. Verify draft list appears with confidence and file counts.
4. Verify status bar shows draft count and no error.
5. Edit one draft message and save.

### 4.3 Commit Safety (Snapshot Drift)

1. Compose drafts from staged files.
2. Before committing, stage/unstage an additional file in source control.
3. Attempt `Commit This Draft` or `Commit All`.
4. Expected:
   - commit blocked,
   - error shown with refresh action,
   - no commit created.

### 4.4 Provider Preflight and Error UX

Test these cases:

1. Cloud provider with no key configured.
   - Expected: compose blocked with actionable key error.
2. Ollama with invalid host.
   - Expected: compose blocked with connection error and refresh guidance.
3. Invalid cloud key (if available).
   - Expected: mapped auth/permission style error.

### 4.5 Fallback Visibility

1. Force AI failure (invalid key or unreachable endpoint).
2. Compose should fallback to heuristics.
3. Verify fallback indicator is visible in:
   - compose workspace,
   - status bar.

### 4.6 Privacy Controls

Configure:
- `commitComposer.excludePatterns`
- `commitComposer.redactPatterns`

Then verify:
1. Excluded files are not used in compose.
2. Redacted tokens are masked before provider request.
3. Privacy stats appear in compose/status surfaces.

### 4.7 Sanitized Log Export

1. Trigger a compose with normal logs.
2. Run command `Commit Composer: Copy Sanitized Logs` or use status bar action.
3. Paste clipboard into a temp file and verify:
   - keys are redacted,
   - raw diff content is redacted/truncated.

## 5. Performance Scenarios

### 5.1 Large Diff Viewer

1. Stage a large file diff (1k+ lines).
2. Open diff viewer.
3. Expected:
   - initial partial render,
   - `Show More` button available,
   - UI remains responsive.

### 5.2 Large Staged File Count

1. Stage 300+ files.
2. Open staged file list.
3. Expected:
   - list loads quickly,
   - partial list shown with `Show All` action.

## 6. Command Palette Checks

Verify these commands:

1. `Commit Composer: Auto Compose`
   - opens focused compose flow.
2. `Commit Composer: Show Debug Logs`
   - opens output channel.
3. `Commit Composer: Copy Sanitized Logs`
   - copies sanitized logs to clipboard.

## 7. Troubleshooting

### Icon not visible

1. Reload VS Code window.
2. Check `package.json` activation events.
3. Inspect output channel `OpenGit Composer`.

### Blank or broken webview

1. Rebuild bundles with `pnpm run compile`.
2. Verify `dist/webview.js` exists.
3. Reload extension host or VS Code window.

### Compose fails unexpectedly

1. Confirm staged changes exist.
2. Verify provider key/host.
3. Copy sanitized logs and inspect mapped error code/message.

## 8. Regression Matrix Template

Use this table per release candidate:

| Scenario | macOS | Windows | Linux | Notes |
|---|---:|---:|---:|---|
| Activation + sidebar UI | ⬜ | ⬜ | ⬜ | |
| Compose (AI) | ⬜ | ⬜ | ⬜ | |
| Compose (fallback) | ⬜ | ⬜ | ⬜ | |
| Snapshot stale blocking | ⬜ | ⬜ | ⬜ | |
| Commit single | ⬜ | ⬜ | ⬜ | |
| Commit all | ⬜ | ⬜ | ⬜ | |
| Privacy exclude/redact | ⬜ | ⬜ | ⬜ | |
| Sanitized log copy | ⬜ | ⬜ | ⬜ | |
| Large diff responsiveness | ⬜ | ⬜ | ⬜ | |
