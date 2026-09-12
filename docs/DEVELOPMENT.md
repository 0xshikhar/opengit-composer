# OpenGit Composer Development Guide

## 1. Prerequisites

- Node.js 18+
- `pnpm` 10+
- VS Code 1.85+

## 2. Install and Build

```bash
pnpm install
pnpm run compile
```

Webpack outputs:
- `dist/extension.js`
- `dist/webview.js`

## 3. Local Commands

```bash
# watch mode
pnpm run watch

# lint
pnpm run lint

# unit tests
pnpm run test

# integration test harness
pnpm run test:integration

# package extension
pnpm run package:vsix
```

## 4. Codebase Layout

| Path | Purpose |
|---|---|
| `src/extension.ts` | activation, command registration |
| `src/webview/` | provider bridge + webview bootstrap |
| `src/webview/ui/` | React UI and Zustand store |
| `src/core/` | orchestrator, config, commit executor, privacy policy |
| `src/ai/` | provider adapters, prompts, parsing |
| `src/types/` | shared types |
| `src/test/` | unit + integration tests |

## 5. Typical Change Workflow

1. Update core behavior in `src/core/*` or provider in `src/ai/*`.
2. Update host bridge message handling in `src/webview/CommitComposerProvider.ts` if needed.
3. Update UI store/components in `src/webview/ui/*`.
4. Run `pnpm run lint && pnpm run test && pnpm run compile`.
5. Update docs in `docs/` when behavior or configuration changes.

## 6. Adding a New Webview Message

1. Define the command sender in `useVSCodeAPI` or component.
2. Handle it in provider `onDidReceiveMessage`.
3. Return success/error event back to UI.
4. Update `docs/ARCHITECTURE.md` message contract.

## 7. Adding/Updating AI Provider

1. Add provider class in `src/ai/providers/`.
2. Implement:
   - `analyzeChanges`,
   - `validateApiKey`,
   - request + error mapping.
3. Register provider in factory.
4. Add provider model defaults/UI options if necessary.
5. Add or update tests for parser/flow compatibility.

## 8. Release Checklist

1. Update docs (`README`, `docs/STATUS.md`, `docs/TESTING.md`).
2. Run quality bar:
   - `pnpm run lint`
   - `pnpm run test`
   - `pnpm run compile`
3. Generate VSIX:
   - `pnpm run package:vsix`
4. Install VSIX locally and run manual smoke tests from `docs/TESTING.md`.
