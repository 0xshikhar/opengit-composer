# OpenGit Composer Architecture

## 1. Overview

OpenGit Composer is a VS Code extension that:
1. reads staged git changes,
2. groups them into draft commits (AI or heuristic),
3. lets the user review/edit drafts,
4. executes single or batch commits.

The runtime is split between:
- extension host (TypeScript, Node runtime in VS Code),
- webview UI (React + Zustand),
- git/AI service layer.

## 2. High-Level Components

| Layer | Main Files | Responsibility |
|---|---|---|
| Extension entry | `src/extension.ts` | Activates extension, registers webview provider and commands |
| Webview bridge | `src/webview/CommitComposerProvider.ts` | Loads webview HTML, handles host↔UI messages, orchestrates compose/commit |
| Core orchestration | `src/core/orchestrator.ts` | Compose pipeline, fallback behavior, snapshot/meta generation |
| Git operations | `src/core/git/gitService.ts` | Staged diff retrieval, commit execution primitives |
| Commit execution | `src/core/commitExecutor.ts` | Single/all commit workflows |
| AI layer | `src/ai/*` | Provider abstraction, prompts, parsing, retries/error shaping |
| Privacy policy | `src/core/privacyPolicy.ts` | Exclude/redact policy before AI request |
| UI state | `src/webview/ui/store/commitStore.ts` | Shared webview state + actions |
| UI components | `src/webview/ui/components/*` | Compose, review, diff, status, key management views |
| Logging | `src/utils/logger.ts` | Output channel logging + sanitized log export |

## 3. Compose Flow

1. UI sends `compose` with provider config.
2. Host runs preflight checks:
   - API key presence for cloud providers.
   - Ollama reachability for local provider.
3. Orchestrator loads staged files via `GitService`.
4. Privacy policy is applied:
   - `excludePatterns` removes matching files.
   - `redactPatterns` masks sensitive text in diffs.
5. Composition runs:
   - AI path (`composeWithAI`) or heuristic fallback.
6. Orchestrator returns:
   - `drafts`, `reasoning`, `summary`,
   - `snapshot` fingerprint of staged state,
   - `meta` (fallback used, privacy stats).
7. UI renders drafts and status badges.

## 4. Commit Safety Model

Before `commitSingle` and `commitAll`, host verifies the compose snapshot against current staged state.

If snapshot mismatch is detected:
- commit is blocked,
- UI receives `STAGED_SNAPSHOT_STALE`,
- status bar shows a recovery action (`Refresh` / re-compose).

This prevents committing stale plans after user stage/unstage changes.

## 5. Error Handling Model

Errors are normalized in host (`mapErrorToMessage`) into:
- `code`,
- `message`,
- optional `action` (`refresh`, `compose`, `copySanitizedLogs`).

UI shows these through `StatusBar` with inline action buttons.

Common mapped classes:
- auth failures,
- rate limit/quota failures,
- network/provider endpoint failures,
- preflight failures (missing key, unreachable Ollama),
- excluded-files-only compose case.

## 6. Webview Message Contract

### UI to Host

| Command | Payload |
|---|---|
| `loadData` | none |
| `compose` | `{ providerConfig }` |
| `commitSingle` | `{ draft, snapshot }` |
| `commitAll` | `{ drafts, snapshot }` |
| `refresh` | none |
| `loadKeys` / `saveKey` / `removeKey` / `resetKeys` | key management payload |
| `loadOllamaModels` | `{ baseUrl }` |
| `openComposerPanel` | `{ providerConfig }` |
| `copySanitizedLogs` | none |

### Host to UI

| Command | Payload |
|---|---|
| `dataLoaded` | `{ staged, providerConfig }` |
| `composing` | none |
| `composed` | `{ drafts, reasoning, summary, snapshot, meta }` |
| `commitProgress` | `{ current, total, ... }` |
| `commitSuccess` / `commitAllDone` | result payload |
| `error` | `{ code, message, action? }` |
| key management events | provider/key payload |
| `ollamaModelsLoaded` | models/error payload |

## 7. UI Structure

Main webview app: `src/webview/ui/App.tsx`

Primary views:
- staged + draft tree (default),
- compose workspace,
- diff viewer,
- commit editor.

`StatusBar` is the global health surface:
- composing / committing progress,
- fallback badge,
- privacy stats,
- inline error action,
- sanitized log copy action.

## 8. Build and Packaging

Webpack builds:
- extension bundle: `dist/extension.js`
- webview bundle: `dist/webview.js`

Scripts:
- `pnpm run compile`
- `pnpm run test`
- `pnpm run package:vsix`

## 9. Design Constraints

- Works in VS Code webview CSP constraints (no Monaco dependency in active flow).
- Secret values stored via VS Code SecretStorage (`KeyManager`).
- No server-side relay; provider calls happen directly from extension runtime.
