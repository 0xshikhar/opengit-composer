# OpenGit Composer AI Issues List

This document tracks AI/provider reliability and UX issues based on current code paths, mapped error codes, and fallback behavior.

## 1. Current Error Signals

Host-level mapped error codes:
- `PRECHECK_MISSING_API_KEY`
- `PRECHECK_OLLAMA_UNREACHABLE`
- `AUTH_ERROR`
- `RATE_LIMIT`
- `NETWORK_ERROR`
- `DNS_ERROR`
- `CONNECTION_REFUSED`
- `TLS_ERROR`
- `STAGED_SNAPSHOT_STALE`
- `ONLY_EXCLUDED_FILES`
- `NO_STAGED_CHANGES`
- `COMPOSE_ERROR`

Key locations:
- `src/webview/CommitComposerProvider.ts` (`runComposePreflight`, `mapErrorToMessage`)
- `src/core/orchestrator.ts` (`composeWithAI`, fallback metadata)
- `src/ai/providers/*` (provider API wrappers, parse repair attempts)

## 2. Issue Register

State as of 2026-04-17:
- Fixed in current tree: AI-001, AI-004, AI-005, AI-006, AI-009, AI-011.
- Still open and worth tracking: AI-002, AI-003, AI-007, AI-008, AI-010.

| ID | Issue | Evidence | Impact | Current Handling | Recommendation |
|---|---|---|---|---|---|
| AI-001 | Cloud preflight does not validate credentials before compose | Cloud preflight checks key presence only | User gets failure after compose request instead of early feedback | Compose preflight now validates API keys and provider health flows expose `Test Connection` | Keep the preflight path and add provider-specific guidance only if needed |
| AI-002 | Fallback reason is visible but not deeply explained | `usedFallback` + short reason only | Low trust in generated draft quality | Fallback badge shown in UI | Show fallback details panel with parser strategy and suggestions |
| AI-003 | Rate-limit handling is generic | `RATE_LIMIT` mapped broadly | Poor recovery path for heavy users | Message asks retry/rotate key | Add exponential backoff + "Retry Compose" action + key health indicators |
| AI-004 | Network and endpoint errors are merged | `NETWORK_ERROR` catches multiple patterns | Troubleshooting is slower | Error mapper now distinguishes DNS, refused connection, TLS, and generic network failures | Keep the split codes and expand docs/examples if users still struggle |
| AI-005 | Provider model availability not verified for cloud | Model is selected but not pre-validated | Compose can fail with unclear model errors | Compose preflight now checks provider model availability before running the full compose | Keep the current fail-fast path |
| AI-006 | Redaction regex misconfiguration is silent | Invalid redaction regex is ignored | User assumes protection that may not apply | Privacy preview and status UI now surface invalid pattern warnings | Keep the warnings visible and tighten copy if users miss them |
| AI-007 | Exclusion policy can remove all files silently until compose | `ONLY_EXCLUDED_FILES` thrown on compose | User confusion on why no drafts generated | Clear error appears | Add pre-compose policy preview ("N files excluded") |
| AI-008 | Parse repair path can still return weak grouping | Provider parse repair logs fallback retention | Draft quality variance | Heuristic fallback available | Add quality score + "Regenerate with stricter format" action |
| AI-009 | Provider-specific error metadata is not surfaced in UI | Host maps message text patterns | Hard to debug provider-specific edge cases | Error payloads now carry provider/status/request-id diagnostics in the status bar | Keep the diagnostics payload and consider a dedicated details panel later |
| AI-010 | No persisted issue telemetry for repeated provider failures | Logs only in output channel | Hard to identify top production pain points | Manual log copy only | Add local issue counters and optional anonymized telemetry (opt-in) |
| AI-011 | OpenAI GPT-5-family models were using Chat Completions JSON mode | `response_format: { type: 'json_object' }` is not the recommended path for GPT-5 models | AI requests can fail or degrade into heuristic fallback | OpenAI provider now routes GPT-5 through Responses API structured outputs | Keep GPT-5 on Responses API; keep chat completions only for legacy OpenAI models |

Current handling notes:
- Provider preflight now validates API keys and model availability before compose.
- Provider diagnostics are surfaced in the status bar and error payloads.
- Redaction preview warnings are shown in the UI when regex patterns are invalid.
- GPT-5-family requests use the modern structured-output path instead of legacy JSON mode.

## 3. Priority Plan

### P0 (Reliability UX)

1. `Test Connection` is already available; keep its per-provider guidance and loading/error copy aligned.
2. Structured diagnostics payloads are already emitted; consider a dedicated details panel only if support load justifies it.
3. Add retry compose action for transient failures.

### P1 (Quality + Policy Transparency)

1. Pre-compose policy preview is already visible; keep the excluded-file/redaction counts and invalid regex warnings discoverable.
2. Expand fallback explanations with remediation:
   - regenerate,
   - simplify diff scope,
   - check model config.

### P2 (Observability)

1. Track local counters for issue classes.
2. Add optional telemetry (if product policy allows).

## 4. Logging Improvements Backlog

| Item | Why |
|---|---|
| Include request correlation ID in compose logs | Easier cross-step tracing |
| Capture provider latency histograms | Detect slow/failing models |
| Separate transport vs provider vs parsing errors | Better user-facing guidance |
| Add compact "diagnostics copy" action in UI | Faster support triage |

## 5. Acceptance Criteria For AI Reliability

1. Users can validate provider setup before first compose.
2. Every failure maps to a deterministic error code + concrete recovery action.
3. Fallback mode explains why it happened and how to proceed.
4. Policy issues (exclude/redact) are visible before compose execution.
5. GPT-5-family OpenAI models use the Responses API structured-output path, not legacy JSON mode.
