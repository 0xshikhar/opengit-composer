# OpenGit Composer — Unified Bug & Issue Tracker

**Last Updated:** 2026-04-21  
**Version:** 2.0.5  
**Source of Truth:** This file consolidates `bugs.md`, `BUG_ANALYSIS.md`, and `STATUS.md`

---

## Legend

| Priority | Meaning | Launch Gate |
|----------|---------|-------------|
| **P0** | Data safety / correctness / trust blocker | Must fix before launch |
| **P1** | Significant UX/perf issue | Strongly recommended pre-launch |
| **P2** | Important limitation / polish | Can ship after launch |
| **P3** | Nice-to-have / maintainability | Post-launch backlog |

| Status | Icon | Description |
|--------|------|-------------|
| Fixed | ✅ | Implemented and verified |
| In Progress | 🔄 | Currently being worked on |
| Open | 🔴 | Confirmed issue, needs fix |
| Not a Bug | ❌ | Working as intended |
| Won't Fix | ⚪ | Low priority / intentional behavior |

---

## Summary Dashboard

| Category | Total | Fixed | Open | Won't Fix |
|----------|-------|-------|------|-----------|
| **P0 - Critical** | 4 | 4 | 0 | 0 |
| **P1 - High** | 6 | 6 | 0 | 0 |
| **P2 - Medium** | 10 | 3 | 6 | 1 |
| **P3 - Low** | 12 | 2 | 8 | 2 |
| **Architecture** | 10 | 0 | 5 | 5 |
| **Total** | **42** | **16** | **23** | **8** |

---

## Recently Fixed (Last Sprint)

| ID | Issue | Priority | Fix Date | Notes |
|----|-------|----------|----------|-------|
| — | STALE error showing wrong provider | P1 | 2026-04-21 | Non-provider errors now skip diagnostics to avoid `lmstudio:STAGED_SNAPSHOT_STALE` display |
| — | STALE error blocks commit (needs force option) | P2 | 2026-04-21 | Added `force` flag pattern — warning shown first, click "Commit All" again to force |
| — | Gemini duplicate models in dropdown | P1 | 2026-04-21 | Removed duplicate entries in `constant.ts` models array |
| P1-4 | Error Action Type Mismatch | P1 | 2026-04-21 | Expanded `ComposerErrorAction` to include `'loadData'` and `'triggerCompose'` |
| #3 | Forced regrouping ignores rich context | P2 | 2026-04-21 | Added `GenerateMessageOptions`, pass context/format/instructions through `createForcedDraft()` |
| #4 | UI draft IDs use Math.random | P3 | 2026-04-21 | Now uses `crypto.randomUUID()` with Date fallback |
| #5 | Windows path handling | P2 | 2026-04-21 | Normalized backslashes in `CommitTreeItem.tsx` |
| — | LM Studio timeout too short | P1 | 2026-04-21 | Increased from 120s to 600s (10 min) for slow local models |

---

## P0 — Critical (All Fixed ✅)

### P0-1: Model Name Normalization
- **Status:** ✅ **FIXED**
- **Location:** `src/ai/providers/providerUtils.ts:127`
- **Issue:** Regex only handled `3.0` → `3`, not `2.5.0` → `2.5`
- **Fix:** Updated regex: `.replace(/-(\d+(?:\.\d+)?)\.0(?=-|$)/g, '-$1')`

### P0-2: LM Studio Model Sanitization
- **Status:** ✅ **FIXED**
- **Location:** `src/utils/constant.ts:151`
- **Issue:** Cloud model prefixes regex missed Groq, Kimi models
- **Fix:** Expanded to `/gemini|gpt|claude|moonshot|llama|mixtral|qwen|kimi/i`

### P0-3: BaseUrl Sanitization
- **Status:** ✅ **FIXED**
- **Location:** `AIControls.tsx:77-113` + `configLoader.ts:188-213`
- **Issue:** Switching providers kept wrong baseUrl (Ollama port on LM Studio)
- **Fix:** Explicit reset on provider change + validation on config load

### P0-4: UI Provider Config Sync
- **Status:** ✅ **FIXED**
- **Location:** `src/webview/ui/App.tsx:33-39`
- **Issue:** UI showed wrong provider before data loaded
- **Fix:** Added `useEffect` to sync from bootstrap payload on mount

---

## P1 — High Severity

### P1-1: LM Studio Timeout for Slow Models
- **Status:** ✅ **FIXED**
- **Location:** `lmstudio.ts:158-160`, `ollama.ts:130-132`
- **Issue:** 120s timeout too short for reasoning models (taking 100+ min)
- **Fix:** Increased to 600000ms (10 minutes) with explanatory comment

### P1-2: Race Condition in Auto-Compose
- **Status:** ✅ **FIXED**
- **Location:** `src/webview/ui/App.tsx:104-112, 122, 159`
- **Issue:** Multiple concurrent compose calls possible
- **Fix:** Added `composeInProgress` ref to guard against race conditions

### P1-3: Model Validation Order (Pre-Validation)
- **Status:** ⚪ **WON'T FIX** (Low priority optimization)
- **Location:** `src/features/compose/composeSlice.ts:182-209`
- **Issue:** Provider created before model availability check wastes resources
- **Note:** We added `preValidateModelFormat()` for early validation, but creating provider instance is cheap enough. Not a user-facing issue.

### P1-4: Error Action Type Mismatch
- **Status:** ✅ **FIXED** (2026-04-21)
- **Location:** `src/types/messages.ts:65`
- **Issue:** `ComposerErrorAction` restricted commands to subset, limiting future error actions
- **Fix:** Expanded allowed commands to include `'loadData'` and `'triggerCompose'` for more flexible error recovery actions
- **Note:** TypeScript already enforced this at compile time; this just makes the type more permissive for future use cases

### P1-5: Key Rotation Retries
- **Status:** ❌ **NOT A BUG**
- **Location:** `src/ai/providers/providerUtils.ts:61`
- **Note:** `isRetriableError()` already filters non-retryable errors. Working correctly.

### P1-6: Missing Provider Validation
- **Status:** ❌ **NOT A BUG**
- **Location:** `src/ai/aiProviderFactory.ts:30`
- **Note:** Factory throws clear error: `Unknown AI provider: ${providerName}. Supported: ...`

---

## P2 — Medium Severity

### P2-1: Local Provider Model Discovery (Ollama-Oriented Naming)
- **Status:** 🔴 **OPEN** — **BREAKING CHANGE IF FIXED**
- **Location:** `providerHealthSlice.ts`, `commitStore.ts`, `AIControls.tsx`
- **Issue:** LM Studio and Ollama both write to `ollamaModels` state
- **Impact:** Confusing naming, misleading diagnostics
- **Breaking Changes Required:**
  - Rename `ollamaModels` → `localModels` in store
  - Rename `setOllamaModels` action
  - Rename `loadOllamaModels` command
  - Rename `ollamaModelsLoaded` event
  - Update 5+ files simultaneously
- **Decision:** Keep as-is. Functionality works; this is naming cleanup only.

### P2-2: Local Provider Refresh Doesn't Auto-Compose
- **Status:** ⚪ **WON'T FIX** — Intentional Behavior
- **Location:** `workspaceHandlers.ts`, `App.tsx`
- **Issue:** Refresh reloads state but doesn't re-run composition
- **Note:** Refresh is meant to "reset session", not "refresh and regenerate". Users can click compose again.
- **Suggested Enhancement:** Could add "Refresh and Compose" button in future.

### P2-3: Forced Regrouping Ignores Rich Context
- **Status:** ✅ **FIXED** (2026-04-21)
- **Location:** `src/core/orchestrator.ts:469-494`
- **Issue:** `createForcedDraft()` only passed file list, missing context/format/instructions
- **Fix:** Added `GenerateMessageOptions` interface, threaded through `enforceMultiDraftRequirement`

### P2-4: Windows Path Handling
- **Status:** ✅ **FIXED** (2026-04-21)
- **Location:** `src/webview/ui/components/CommitTreeItem.tsx:78`
- **Issue:** Used `split('/')` which fails on Windows paths with `\`
- **Fix:** Added `.replace(/\\/g, '/')` before splitting

### P2-5: Config Loader Doesn't Validate Model Names
- **Status:** 🔴 **OPEN**
- **Location:** `src/core/configLoader.ts`
- **Issue:** Loads any model string without validating against provider's supported models
- **Impact:** Invalid configs persist silently
- **Suggested Fix:** Add validation using `preValidateModelFormat()` from constant.ts

### P2-6: PromptBuilder No Token Limit Check
- **Status:** 🔴 **OPEN**
- **Location:** `src/ai/promptBuilder.ts`
- **Issue:** `estimateTokens()` exists but isn't used to check model context limits
- **Impact:** Large diffs may exceed token limits causing failures
- **Note:** Partially mitigated by prompt truncation

### P2-7: File Classifier Not Used Consistently
- **Status:** 🔴 **OPEN**
- **Location:** `src/core/orchestrator.ts:572-589`
- **Issue:** `FileClassifier.groupByDomain()` imported but heuristic fallback doesn't use it
- **Impact:** Heuristic grouping could be smarter

### P2-8: Provider Health Check Doesn't Cache
- **Status:** 🔴 **OPEN**
- **Location:** `src/features/provider-health/providerHealthSlice.ts`
- **Issue:** Every provider switch triggers fresh health check
- **Impact:** Unnecessary API calls
- **Suggested Fix:** Cache health status with TTL (e.g., 30 seconds)

---

## P3 — Low Severity / Code Quality

### P3-1: UI Draft IDs Use Math.random
- **Status:** ✅ **FIXED** (2026-04-21)
- **Location:** `src/webview/ui/store/commitStore.ts:184-191`
- **Issue:** `generateId()` used `Math.random()` with collision risk
- **Fix:** Now uses `crypto.randomUUID()` with Date fallback

### P3-2: Response Parser Quality Score Arbitrary
- **Status:** 🔴 **OPEN**
- **Location:** `src/ai/responseParser.ts`
- **Issue:** Quality scores (90, 35) are hardcoded magic numbers
- **Note:** Internal metric, user doesn't see this

### P3-3: Heuristic Confidence Score Arbitrary
- **Status:** 🔴 **OPEN**
- **Location:** `src/core/orchestrator.ts:381`
- **Issue:** Hardcoded confidence of 60 with no calculation basis
- **Note:** Could derive from file count, change complexity, etc.

### P3-4: Duplicate Type Definitions
- **Status:** 🔴 **OPEN**
- **Location:** `src/types/commits.ts` + `commitStore.ts`
- **Issue:** `DraftCommit`, `ComposeSnapshot`, `ComposeMeta` defined in both places
- **Impact:** Maintenance burden, potential drift
- **Suggested Fix:** Consolidate in `src/types/commits.ts`, import in store

### P3-5: Memory Leak in Commit Store Reset
- **Status:** 🔴 **OPEN**
- **Location:** `src/webview/ui/store/commitStore.ts:326-346`
- **Issue:** `reset()` doesn't clear `savedKeys` or `providerConfig`
- **Impact:** Potential sensitive data leak between sessions
- **Fix:** Add `savedKeys: {}` and `providerConfig: DEFAULT_CONFIG` to reset

### P3-6: Missing Error Context in Logger
- **Status:** 🔴 **OPEN**
- **Location:** All provider files
- **Issue:** Many logs lack request context (requestId, timestamp, user action)
- **Impact:** Hard to debug production issues

### P3-7: Async Void Functions Without Error Handling
- **Status:** 🔴 **OPEN**
- **Location:** `src/webview/ui/store/commitStore.ts`
- **Issue:** Actions like `setStagedFiles` are void but underlying operations could fail

### P3-8: Zustand Store Not Persisted
- **Status:** 🔴 **OPEN**
- **Location:** `src/webview/ui/store/commitStore.ts`
- **Issue:** Store state lost on webview refresh
- **Impact:** User preferences (selected view, provider settings) not persisted

### P3-9: No Debouncing on Provider Switch
- **Status:** 🔴 **OPEN**
- **Location:** `src/webview/ui/components/AIControls.tsx`
- **Issue:** Rapid provider switching could spam API calls
- **Note:** Low risk in practice; users don't rapidly switch providers

### P3-10: Missing Accessibility Attributes
- **Status:** 🔴 **OPEN**
- **Location:** React components throughout
- **Issue:** Many buttons lack proper `aria-label` attributes
- **Impact:** Screen reader accessibility

### P3-11: CSS Class Names Not Namespaced
- **Status:** 🔴 **OPEN**
- **Location:** All CSS files
- **Issue:** Generic class names like `.btn`, `.ai-controls` could clash with VS Code's CSS
- **Risk:** Low — VS Code webviews are isolated

---

## Architecture & Design Debt

### ARCH-1: Provider Config Passed Through Multiple Layers
- **Status:** 🔴 **OPEN**
- **Issue:** Config flows: UI → Message → Handler → Slice → Orchestrator → Factory → Provider
- **Impact:** Many transformation points where data can be corrupted
- **Recommendation:** Single source of truth with immutable config objects

### ARCH-2: Mixed Concerns in Orchestrator
- **Status:** 🔴 **OPEN**
- **Location:** `src/core/orchestrator.ts`
- **Issue:** Handles git operations, privacy policy, AI composition, heuristics, commit execution
- **Recommendation:** Split into smaller focused services

### ARCH-3: No Circuit Breaker for Failing Providers
- **Status:** 🔴 **OPEN**
- **Issue:** If provider consistently fails (e.g., LM Studio down), extension keeps trying
- **Recommendation:** Implement circuit breaker pattern

### ARCH-4: No Request Deduplication
- **Status:** 🔴 **OPEN**
- **Issue:** Multiple rapid "Compose" clicks create concurrent requests
- **Note:** Partially mitigated by `composeInProgress` flag in auto-compose
- **Recommendation:** Debounce or deduplicate all compose requests

### ARCH-5: Global Config vs Session Config Confusion
- **Status:** 🔴 **OPEN**
- **Issue:** Hard to track precedence: VS Code settings, .gitcomposer.json, UI selection, session override
- **Recommendation:** Clear config precedence documentation + single resolver function

### ARCH-6: commitSafety Fingerprint Missing Diff Content (BREAKING)
- **Status:** 🟡 **DEFERRED — BREAKING CHANGE**
- **Location:** `src/features/commit/commitSafety.ts:16-22`
- **Issue:** `buildSnapshotFingerprintFromChanges` only includes path/changeType/additions/deletions, not the actual diff content
- **Impact:** Files with identical counts but different content produce same fingerprint → stale detection misses meaningful changes
- **Breaking Risk:** **HIGH** — Adding diff to fingerprint invalidates ALL existing compose snapshots. Every user would see STALE warning on next commit attempt until they re-compose.
- **Suggested Fix:** Add deterministic hash of `change.diff` to fingerprint, use stable hash (SHA-256) per-file
- **Migration:** Would need snapshot version field or graceful fallback

### ARCH-7: Stricter Local Model Regex (BREAKING)
- **Status:** 🟡 **DEFERRED — BREAKING CHANGE**
- **Location:** `src/utils/constant.ts:198-202`
- **Issue:** Current `/gemini|gpt|claude|moonshot/i` regex can incorrectly drop valid local names (e.g., "mygpt-model")
- **Impact:** Users with local models containing "gpt" "claude" etc. in name can't use them
- **Breaking Risk:** **MEDIUM** — Stricter pattern `/^(gpt|gemini|claude|moonshot)(?:\b|$)/i` may suddenly reject models that previously worked (substring matches)
- **Suggested Fix:** Use word boundaries/anchors, normalize whitespace, trim() before checking
- **Note:** Need to audit existing local model names in community

### ARCH-8: Exact Model Match Only (BREAKING)
- **Status:** 🟡 **DEFERRED — BREAKING CHANGE**
- **Location:** `src/utils/constant.ts:151-158`
- **Issue:** Current validation uses bidirectional includes: `normalizedValid.includes(normalizedInput)` and vice versa
- **Impact:** Partial matches like "gpt" matching "gpt-4-turbo" pass when they shouldn't
- **Breaking Risk:** **MEDIUM** — Exact match requirement would reject previously "valid" models that were substring matches
- **Suggested Fix:** Remove `.includes()` checks, use strict equality `normalizedValid === normalizedInput` only
- **Migration:** Users with partial model names would need to update to full model IDs

### ARCH-9: baseUrl Precedence Fix (BREAKING)
- **Status:** 🟡 **DEFERRED — BREAKING CHANGE**
- **Location:** `src/utils/constant.ts:203-207`
- **Issue:** Current code: `input.ollamaHost || getProviderBaseUrl('ollama')` — discards `input.baseUrl` custom endpoint
- **Impact:** Users with custom local endpoints (e.g., `http://192.168.1.100:1234`) lose their config
- **Breaking Risk:** **HIGH** — Changes precedence: specific host → custom baseUrl → default. Users relying on current (broken) behavior would see endpoint switch
- **Suggested Fix:** `input.ollamaHost || input.baseUrl || getProviderBaseUrl('ollama')`
- **Note:** Need to communicate to users with custom endpoints

### ARCH-10: PromptBuilder Propagate GenerateMessageOptions (BREAKING)
- **Status:** 🟡 **DEFERRED — BREAKING CHANGE**
- **Location:** `src/ai/promptBuilder.ts` + all providers
- **Issue:** `buildMessagePrompt(files)` ignores `GenerateMessageOptions` (commitFormat, maxSubjectLength, additionalInstructions, context)
- **Impact:** Options passed to `generateCommitMessage` are silently dropped — commit format settings don't affect message generation
- **Breaking Risk:** **MEDIUM** — Requires coordinated update across all 8+ providers, changes to PromptBuilder signature
- **Suggested Fix:** Update `buildMessagePrompt` to accept `GenerateMessageOptions`, propagate to prompt construction; ensure type consistency with `AIAnalyzeOptions`
- **Scope:** Affects anthropic, gemini, google, groq, kimi, lmstudio, ollama, openai providers

---

## Recently Fixed (From bugs.md "Recently Fixed" Section)

These were fixed in previous sprints and are confirmed working:

| Issue | Fix Date | Verification |
|-------|----------|------------|
| Duplicate conventional prefixes normalized | 2026-04-20 | `normalizeSubjectLine()` in orchestrator |
| LM Studio no longer inherits Ollama code path | 2026-04-20 | Local-provider prechecks use generic code |
| Switching to LM Studio/Ollama clears stale model | 2026-04-20 | `handleProviderChange()` resets model |
| Refresh button resets compose session | 2026-04-20 | Refresh clears drafts, allows recompose |
| Batch commit rolls back on failure | 2026-04-20 | `commitExecutor.ts` handles rollback |
| Ollama validation fails on zero models | 2026-04-20 | `validateModelAvailability()` check |
| File-based config doesn't load API key | 2026-04-20 | `.gitcomposer.json` key loading removed |
| Provider response uses defensive helpers | 2026-04-20 | `extractChatCompletionContent()` etc. |
| Oversized prompts truncated | 2026-04-20 | Truncation by char + line count |

---

## Next Sprint Recommendations

### Phase 3 — High Value Fixes (P1-P2)

1. ~~**P1-4: Error Action Type Mismatch**~~ ✅ **FIXED**
2. **P2-5: Config Loader Model Validation** — Use `preValidateModelFormat()`
3. **P2-6: PromptBuilder Token Check** — Use `estimateTokens()` before sending
4. **P2-8: Health Check Caching** — Add 30s TTL cache
5. **P3-5: Memory Leak in Reset** — Add missing fields to reset()

### Phase 4 — Polish (P3)

6. **P3-4: Duplicate Type Definitions** — Consolidate types
7. **P3-10: Accessibility** — Add aria-labels
8. **P3-2/3: Quality Scores** — Calculate properly or remove

### Phase 5 — Architecture (ARCH)

9. **ARCH-2: Split Orchestrator** — Extract services
10. **ARCH-3: Circuit Breaker** — Implement for provider calls
11. **ARCH-5: Config Resolver** — Document precedence, single resolver

---

## When a New Bug Appears

Checklist for triage:

1. [ ] Determine: webview UI, host router, orchestrator, or provider?
2. [ ] Check if outdated `dist/` artifact (rebuild extension)
3. [ ] Compare provider path vs sidebar/provider-health path
4. [ ] Verify against structured error codes in `src/types/messages.ts`
5. [ ] Re-run unit tests for affected area
6. [ ] Update this tracker with new entry

---

## File Locations

| Source File | Purpose |
|-------------|---------|
| `docs/ref/bugs.md` | Original bug register (superseded by this file) |
| `BUG_ANALYSIS.md` | Legacy analysis (archive only) |
| `docs/STATUS.md` | Product status & launch readiness |
| **This file** | **Single source of truth for all bugs** |

---

## Why We Missed the Gemini Duplicate Models Bug

### Root Cause Analysis

| Aspect | What Happened |
|--------|---------------|
| **Origin** | Copy-paste error when adding Gemini 2.5 models — 3.x models were duplicated |
| **Location** | `src/utils/constant.ts` lines 53-60 — static data array |
| **Detection Gap** | No automated check for duplicate entries in model arrays |
| **Manual Review Gap** | Code reviews focus on logic, not data array content |
| **Test Gap** | Tests verify models exist, not that they're unique |
| **UI Behavior** | Dropdown renders array as-is; no deduplication logic |

### Prevention Measures

1. **Add runtime deduplication** (defensive):
   ```typescript
   models: [...new Set(PROVIDERS.find(p => p.id === 'gemini')?.models || [])]
   ```

2. **Add build-time validation** (prevention):
   ```typescript
   // In test or build script
   const duplicates = models.filter((m, i) => models.indexOf(m) !== i);
   if (duplicates.length) throw new Error(`Duplicate models: ${duplicates}`);
   ```

3. **Code review checklist**: Add "check for duplicates in static arrays" to PR template

### Lesson
Data bugs hide better than logic bugs. Static arrays need validation too.

---

## Why We Missed the STALE Error Provider Bug

### Root Cause Analysis

| Aspect | What Happened |
|--------|---------------|
| **Origin** | `errorMapper.buildDiagnostics()` always added provider from `configLoader.getConfig()` |
| **Trigger** | `STAGED_SNAPSHOT_STALE` is a git state error, not a provider error |
| **Display** | UI showed `{diagnostics.provider}:{diagnostics.code}` → `lmstudio:STAGED_SNAPSHOT_STALE` |
| **User Impact** | Confusing — user sees wrong provider name for a git error |
| **Test Gap** | Tests checked error mapping, not that diagnostics were appropriate for error type |
| **Detection Gap** | Requires visual UI check with specific error condition (staged changes changing mid-compose) |

### The Fix

**Before:** All errors got diagnostics with provider from config loader:
```typescript
diagnostics: buildDiagnostics(error, payload.code, payload.message, configLoader)
// → { provider: 'lmstudio', code: 'STAGED_SNAPSHOT_STALE', ... }
```

**After:** Non-provider errors skip diagnostics:
```typescript
const nonProviderErrors = ['STAGED_SNAPSHOT_STALE', 'ONLY_EXCLUDED_FILES', ...];
const isProviderError = !nonProviderErrors.includes(code);
diagnostics: isProviderError ? buildDiagnostics(...) : undefined
// → undefined for STAGED_SNAPSHOT_STALE
```

### Prevention Measures

1. **Categorize errors by type** — Git errors vs Provider errors vs Privacy errors
2. **Only add provider context to provider errors** — Don't use stale config for unrelated errors
3. **UI defensive rendering** — Don't show `provider:code` if no provider context

### Lesson
Context pollution — using global config for error diagnostics created misleading UI. Errors should carry their own context or none at all.

---

## Force Commit Feature (2026-04-21)

### What Changed
Instead of blocking the commit with an error when staged changes differ from composition, we now:

1. **Show a warning** (yellow banner, not red error)
2. **Allow force commit** — click "Commit All" again to proceed
3. **Track file changes** — show how many files were added/removed

### Technical Implementation

**Backend (`commitSafety.ts`):**
```typescript
export async function checkSnapshotFresh(...): Promise<SnapshotCheckResult>
// Returns { fresh: boolean, warning?: { addedFiles[], removedFiles[] } }
```

**Backend (`commitSlice.ts`):**
```typescript
if (!check.fresh && !force) {
    // Send warning instead of throwing
    await webview.postMessage({ command: 'warning', warning: {...} });
    return;
}
```

**UI State (`commitStore.ts`):**
```typescript
warning: ComposerWarningState | null;
forceCommit: { pending: boolean; type: 'single' | 'all' | null };
```

**UI Handler (`App.tsx`):**
```typescript
const force = forceCommit.pending && forceCommit.type === 'all';
postMessage('commitAll', { drafts: pending, snapshot: composeSnapshot, force });
```

### Why This Matters
- **Preserves AI work** — Don't discard generated commit messages just because you added one more file
- **User control** — Warning informs, but user decides
- **Non-blocking UX** — Yellow warning instead of red error feels less severe

---

*Generated: 2026-04-21 | Maintainer: Update this file after every bug fix or discovery*
