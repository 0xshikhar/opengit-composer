# OpenGit Composer — Product Status & Launch Readiness Plan

This document is the single source of truth for:
- The current functional status of the extension.
- Known UI/functional gaps and launch blockers.
- A phase-wise implementation plan (with acceptance criteria) for a product-grade launch.

> Last updated: **2026-04-20**  
> Extension: **OpenGit Composer** (`opengit-composer`) **v2.0.5**  
> VS Code engine: `^1.85.0`

---

## 0) Metadata

| Item | Value |
|---|---|
| Primary UX surface | Activity Bar container (`commitComposerContainer`) + webview view (`commitComposer.sidebarView`) |
| Command palette entry | `Commit Composer: Auto Compose` (`commitComposer.autoCompose`) |
| Webview UI | React + Zustand (`src/webview/ui/`) |
| Git integration | `simple-git` (`src/core/git/gitService.ts`) |
| AI providers | OpenAI, Anthropic, Gemini, Groq, Google, Kimi, LM Studio, Ollama (`src/ai/providers/`) |
| Key storage | VS Code SecretStorage (`src/core/keyManager.ts`) |
| Build | Webpack bundles to `dist/` (`webpack.config.js`) |
| Tests | Mocha unit tests + optional integration tests (`docs/TESTING.md`) |

---

## 1) Executive Summary

OpenGit Composer is usable for the “happy path” (stage → compose → review → commit). Pre-launch work should focus on:
1) **Data safety** (staged state drift + commit verification),
2) **Reliability** (provider health checks + actionable errors),
3) **UX clarity** (single coherent flow; docs aligned with actual behavior),
4) **Marketplace readiness** (real screenshots, privacy statement, troubleshooting).

Branch review note:
- The current tree does not show a new P0 blocker.
- The remaining confirmed issues in the bug register are P2/P3 follow-ups: local-provider naming, refresh vs auto-compose behavior, forced regroup context, draft ID generation risk, and a few Windows-path/UI polish gaps.
- Keep those in a follow-up branch unless you explicitly want this branch to absorb UX and maintenance cleanup.

Bug register snapshot:
- Open bugs: `5`
- Recently fixed bugs: `8`
- Architecture/testability risks tracked separately: `5`

Priority order for the open bugs:
1. Local-provider naming cleanup, because it affects the model/host UX and diagnostics.
2. Forced regroup context, because it affects the quality of multi-commit fallback output.
3. Windows path handling, because it can produce incorrect labels on Windows-derived paths.
4. Local-provider refresh behavior, if you want refresh to mean "reload and compose" instead of just reload.
5. Draft ID generation hardening, because it is a low-probability collision risk rather than a common breakage.

### Recent Product Changes (Since 2026-04-10)

| Change | Why it matters | Status | Notes |
|---|---|---:|---|
| Snapshot drift detection (R-001) | Blocks unsafe commits when staged state changes | ✅ | assertSnapshotFresh() validates before commit |
| Fallback mode visibility (R-002) | Shows when AI falls back to heuristics | ✅ | Badge displays fallback reason in UI |
| Refresh clears stale drafts (R-010) | Allows recompose after snapshot stale | ✅ | User can recover after staged changes |
| API key masking (R-012) | Keys never exposed in UI | ✅ | getKeysForDisplay() returns masked only |
| Sidebar staged/unstaged tree (R-011) | GitLens-like file listing | ✅ | Grouped by folder with collapse/filter |
| Subject length enforcement (R-006) | Keeps commit subjects within limit | ✅ | truncateToLength() in orchestrator |
| Sanitized logs (R-007) | Safe to share | ✅ | getSanitizedOutput() redacts keys/diffs |
| Exclude/redact patterns (R-008) | Privacy controls | ✅ | excludePatterns + redactPatterns in config |
| Normalize duplicate prefixes (R-009) | Cleaner commit subjects | ✅ | normalizeSubjectLine() removes dupes |
| Provider settings toggle (R-013) | Better discoverability | ✅ | Larger hitbox with labels |
| OpenAI GPT-5 structured-output routing | Prevents fallback degradation | ✅ | Responses API for GPT-5 models |
| Typed host/webview messages | Hardens message boundary and rejects unknown payloads | ✅ | Shared `src/types/messages.ts` + runtime guards |
| Phase 2 feature slices started | Begins modular host extraction | 🟡 | Compose/provider-health/commit/privacy slices added |
| Provider shell thin-out | Moves preflight/error helpers out of provider | ✅ | Provider delegates to feature slices and shared error mapper |
| Table-driven host dispatch | Reduces message switch coupling | ✅ | `src/webview/host/webviewCommandRouter.ts` |
| Domain handler registries | Splits router by workflow | ✅ | `src/webview/host/handlers/*` |
| Structured error contract | Single recoverable error payload | ✅ | `code`, `severity`, `recoverable`, `action`, `diagnostics` |
| Multi-commit enforcement | Prevents single giant commit | 🟡 | Needs better grouping quality |
| Provider resolution cleanup | Keeps local hosts, hosted defaults, and explicit base URLs consistent | ✅ | Shared helper now resolves model/baseUrl across host + webview code |
| Workspace guard on data load | Prevents refresh/load paths from bypassing repo selection | ✅ | Workspace handlers now resolve the repo before loading staged data |
| Commit payload validation | Rejects malformed commit messages before execution | ✅ | Host handlers now validate `draft`/`drafts` before calling commit logic |
| LM Studio retry divergence | Retry can now drop `response_format` when needed | ✅ | First attempt and fallback request bodies are no longer identical |
| Provider health short-circuit | Avoids model probing after auth failure | ✅ | Connection test returns early when `validateApiKey()` fails |
| Subject normalization | Preserves breaking-change markers in nested prefixes | ✅ | `!` is retained when collapsing repeated conventional prefixes |

### Launch Readiness Dashboard (Gated)

| Area | Status | Launch Gate | What's missing |
|---|---:|---|---|
| Commit correctness & safety | 🟢 | No "wrong commit" paths | Snapshot drift detection fully implemented |
| Provider reliability | 🟢 | Preflight + clear errors | Fallback badge + error visibility implemented |
| UX polish & clarity | 🟡 | One coherent flow | Both surfaces available, some UX polish remains |
| Performance | 🟡 | Large diffs usable | Truncation done (chars+lines), but no virtualization |
| Security & privacy | 🟢 | Keys safe, privacy clear | Keys masked, exclude/redact patterns, sanitized logs |
| Testing | 🟡 | Regression-proof basics | Expand tests for commit execution + message contracts |
| Marketplace readiness | 🔴 | Store-ready artifacts | Replace placeholder assets; add support + privacy + changelog |

Legend: 🟢 ready / 🟡 needs work / 🔴 blocker

---

## 2) Current Capabilities (Feature Inventory)

### 2.1 User Journeys (End-to-End)

| Journey | Steps | Status | Risks |
|---|---|---:|---|
| First-run setup | Install → open sidebar → pick provider → add API key → compose | ✅ | Clear empty states + "Add Key" flow implemented |
| Compose (AI) | Stage files → compose → drafts appear | ✅ | Fallback badge visible in UI |
| Compose (heuristic) | Stage files → compose (or fallback) | ✅ | Subject length enforcement in orchestrator |
| Review | Select draft → inspect files/diffs → edit message | ✅ | Diff viewer with search + wrap |
| Commit single | Commit a draft | ✅ | Snapshot drift detection blocks unsafe commits |
| Commit all | Commit all drafts in order | ✅ | Snapshot check + progress feedback |

### 2.2 Feature Matrix

| Capability | UX Surface | Implementation | Status | Notes / Risks |
|---|---|---:|---:|---|
| List staged changes | Sidebar webview | `GitService.getStagedChanges()` | ✅ | Per-file diff can be expensive on big repos |
| Compose (AI) | Panel + sidebar trigger | `Orchestrator.composeWithAI()` | ✅ | Parser fallback exists; needs “fallback used” badge + guidance |
| Compose (heuristic) | Same | `CommitSplitter.split()` | ✅ | Subject length enforcement needs strengthening |
| View diffs | Webview | `DiffViewer` | ✅ | Needs “huge diff” handling + search/wrap |
| Commit one draft | Webview | `CommitExecutor.executeSingle()` | ✅ | Should block commit when staged drift detected |
| Commit all drafts | Webview | `CommitExecutor.executeAll()` | ✅ | Should support skip/retry; staged drift must block |
| Key storage (multi-key) | Webview | `KeyManager` | ✅ | Add “last used” + validation + copy-safe UI |
| Ollama models | Webview | `OllamaProvider.getAvailableModels()` | ✅ | Add status indicator + refresh + error help |
| Debug logs | Output channel | `Logger` | ✅ | Needs redaction + “copy logs” UX |

---

## 3) Known Issues / Gaps (Risk Register)

### 3.1 Severity Definitions

| Priority | Meaning | Launch Rule |
|---:|---|---|
| P0 | Data safety / correctness / trust blocker | Must fix before launch |
| P1 | Significant UX/perf issue | Strongly recommended pre-launch |
| P2 | Useful feature / polish | Can ship after launch |
| P3 | Nice-to-have | Post-launch backlog |

### 3.2 Issue Table (Pre-Launch)

| ID | Area | Priority | Symptom | Likely Root Cause | Fix Approach | Acceptance Criteria | Phase |
|---|---|---:|---|---|---|---|---|
| R-001 | Correctness | P0 | Drafts don’t reflect current staged state | User staged/unstaged after compose | Snapshot staged set at compose; re-check before commit | Unsafe commit is blocked with clear CTA to refresh/re-compose | ✅ Implemented
| R-002 | Reliability | P0 | Provider errors are generic; fallback unclear | Errors not mapped; fallback not surfaced | Preflight + error mapping + visible fallback badge | User sees provider + actionable next step | ✅ Implemented |
| R-003 | UX | P0 | Sidebar opens panel for full workflow unexpectedly | Two-surface design not communicated | Pick a primary surface; improve CTAs + navigation | Users understand where to work; no surprise transitions | 🟡 Partial |
| R-004 | Docs | P0 | Docs/README claims SCM integration | Messaging drift | Align docs and screenshots (or implement SCM integration) | Marketplace listing matches behavior | ✅ Verified |
| R-005 | Perf | P1 | Large diffs cause UI jank | Rendering too much; no virtualization | Progressive render + truncation + virtualization | UI remains responsive on big diffs | 🟡 Partial |
| R-006 | Formatting | P1 | Heuristic commits exceed subject length | No enforcement | Enforce subject cap; overflow into body | ✅ Implemented - truncateToLength() in orchestrator | 0 |
| R-007 | Supportability | P1 | Logs hard to share safely | No redaction | Provide "Copy sanitized logs" | ✅ Implemented - getSanitizedOutput() with redaction | 2 |
| R-008 | Privacy | P1/P2 | No redaction/exclusion controls | No policy layer | Add exclude globs + redaction rules | ✅ Implemented - excludePatterns + redactPatterns in config | 2 |
| R-009 | Formatting | P1 | Commit subjects repeat conventional prefix (e.g. `feat(core): feat(core): …`) | AI output (or post-processing) can include a full conventional subject; drafts store it verbatim | Normalize subject line; dedupe repeated prefix tokens | ✅ Implemented - normalizeSubjectLine() removes duplicates | 0 |
| R-010 | Correctness | P0 | "Refresh" CTA on stale snapshot error doesn't unblock user | Refresh reloads changes but stale drafts remain; user keeps hitting the same error | Clear stale drafts on refresh and/or offer "Recompose" CTA | ✅ Implemented - refresh clears drafts, allows recompose | 0 |
| R-011 | UX | P1 | Sidebar lacks staged/unstaged tree (design target) | Sidebar currently acts as a launcher card | Add staged + unstaged sections (GitLens-like) + top CTA "Compose commit" | ✅ Implemented - staged/unstaged grouped by folder with filter | 1 |
| R-012 | Security/UX | P1 | Saved API keys feel "visible" and confusing | Key configuration UI and "status" UI are not cleanly separated | Hide keys entirely; show only key count/labels; settings toggle opens configuration | ✅ Implemented - getKeysForDisplay() returns masked keys only | 1 |
| R-013 | UX | P2 | Provider settings icon is too small / hard to discover | Icon size + hitbox too small | Increase icon size + hitbox; add tooltip and keyboard focus | ✅ Implemented - larger hitbox in UI | 1 |

Implementation status notes (as of **2026-04-20**):
- R-009 implemented (subject normalization); needs manual QA across providers.
- R-010 implemented (refresh clears stale drafts); needs manual QA on stale snapshot flow.

Verification pass notes (2026-04-20):
- Confirmed and fixed: provider factory error text drift, LM Studio retry body/logging, retry-backoff logging, stale snapshot fingerprinting, workspace refresh/load guarding, provider-health auth short-circuiting, malformed commit payload rejection, redacted unknown-message logging, and provider enum schema drift.
- This pass also fixed the remaining concrete code-review gaps: stash ref capture for batch rollback, per-attempt compose preflight, local-provider health probing, provider base URL fallback defaults, router/key-manager cache invalidation, and provider repair-response extraction errors.
- Follow-up runtime fix: LM Studio compatibility errors now inspect structured Axios response bodies, and Gemini now stays on the selected 2.5 model instead of falling over to an old preview-lite candidate.
- UI fix: switching into a local provider now clears any hosted-model carryover so LM Studio/Ollama do not inherit Gemini/OpenAI model names, and LM Studio only surfaces chat-capable models from its `/models` list.
- Commit-message normalization now strips prompt-artifact angle brackets as well as duplicate conventional prefixes, so malformed `<refactor>`-style output does not leak into saved drafts.
- Heuristic fallback commit headers now synthesize area-aware subjects from the staged files instead of defaulting to `update related files`.
- Commit scopes are now normalized to a maximum of two tokens, with generic leading prefixes trimmed, so `shared-ui-components` collapses to a shorter scope like `ui-components`.
- Verified but did not change the code path: the new-panel auto-compose flow is already gated by the host `loadData`/workspace resolution path, so it was not a user-visible bug in practice.

---

## 4) Pre-Launch Improvement Catalog (What to Build)

### 4.1 UX / UI

| Category | Improvements | Impact |
|---|---|---|
| Information architecture | Decide sidebar-first vs panel-first; unify “review” UX; eliminate surprise transitions | High |
| Sidebar design | Staged + Unstaged sections; top CTA “Compose commit”; richer file metadata (adds/dels, type icons) | High |
| Panel design | Composition-first: provider config + “Auto-compose”; no staged/unstaged lists in the panel | High |
| Draft review | Clear per-draft summary cards, better states (generated/edited/committed) | High |
| Diff viewer | Search, wrap toggle, “show more” for truncated diffs | High |
| Empty states | Setup wizard-like guidance (no repo / no staged / missing key) | High |
| Accessibility | Keyboard navigation, focus rings, semantic labels | Medium |

### 4.2 Functionality

| Category | Improvements | Impact |
|---|---|---|
| Safety | Staged snapshot drift detection; warnings; forced refresh/re-compose | High |
| Draft tools | Merge/split drafts, file reassignment, skip/retry in batch | High |
| Provider tooling | Validate API key, test connection, model discovery UX | High |
| Composition quality | “Why this split” reasoning; stronger heuristics; “regroup” action | High |
| Formatting | Conventional commit helpers; strict subject/body rules | Medium |
| Config | UI editor for `.gitcomposer.json` (without keys) | Medium |

### 4.3 Security / Privacy

| Improvement | Description | Priority |
|---|---|---:|
| Privacy statement | Explain what is sent to providers and when | P0 |
| Redaction/exclusion | Glob patterns + “never send” files | P1/P2 |
| Log sanitization | Remove keys; avoid printing raw diffs | P1 |

### 4.4 Performance

| Improvement | Description | Priority |
|---|---|---:|
| Diff truncation | Limit prompt + UI diff length with “expand” | P1 |
| UI virtualization | Virtualize staged list and draft list | P1 |
| Git IO caching | Cache diffs per staged file until refresh | P2 |

### 4.5 AI Reliability (Tracked Separately)

AI/provider issues evolve quickly and should be tracked as a dedicated reliability register:
- See `docs/AI_ISSUES.md` for error codes, known failure modes, and a prioritized reliability plan.
- Current code now covers credential validation, model-availability checks, provider diagnostics, and GPT-5 routing; the remaining AI follow-ups are mostly fallback-explanation depth, retry UX, exclusion-policy preview polish, and issue telemetry.

---

## 5) Phase-Wise Implementation Plan (Before Launch)

Phases are ordered to reduce launch risk early. Each phase includes deliverables and acceptance criteria.

### Phase 0 — Stability & Safety (P0)

| Workstream | Deliverables | Acceptance Criteria |
|---|---|---|
| Staged snapshot safety | Capture snapshot on compose; verify before commit | Commit actions are blocked if staged set changed; UI guides recovery |
| Provider preflight | “Missing key” + “Ollama unreachable” checks; clearer errors | User sees provider-specific fixes; no silent failures |
| Formatting guardrails | Enforce subject length in heuristic; validate empty subjects | Drafts never generate invalid empty subjects; subject limit enforced |
| Message normalization | Normalize draft subjects (dedupe conventional prefix; trim noise) | Subjects are clean and review-friendly; no duplicated prefix; no empty subject |

Suggested tasks (Phase 0):
- Add `stagedSnapshot` to store + host messages, compare on commit.
- Surface “snapshot stale” banner with a “Refresh staged files” button.
- Add provider `validateApiKey()` flow and expose “Test connection” for each provider where possible.
- Explicitly mark fallback mode (AI failed → heuristics) in the UI.
- Normalize commit message subject line before storing drafts (and before commit execution as a backstop).

### Phase 1 — UX Coherence + Marketplace Docs (P1)

| Workstream | Deliverables | Acceptance Criteria |
|---|---|---|
| Coherent flow | Choose sidebar-first or panel-first and align UI | A new user can complete end-to-end flow without confusion |
| Diff UX | Search + wrap + truncation affordances | Users can inspect diffs quickly even for large patches |
| Docs & assets | Updated README, screenshots, troubleshooting, privacy statement | Marketplace content is accurate and polished |
| Sidebar redesign | Staged/unstaged tree + top “Compose commit” CTA | Sidebar matches GitLens-style mental model; no surprise transitions |
| Provider config UX | Hide stored keys; settings toggle for configuration | Saved keys never appear; configuration is one-click discoverable |

Implementation status notes (as of **2026-04-10**):
- Sidebar has staged/unstaged lists and a top “Compose commit” button; lists are grouped by top-level folder, support section collapse, and include a file filter box.
- Diff viewer now supports line wrapping + basic search/navigation; still missing richer diff affordances (e.g. hunk folding, copy selection).
- Provider configuration uses a gear toggle and does not display stored key material; continue polishing discoverability and layout.
- Marketplace docs/assets are partially present in `docs/`, but Marketplace-ready screenshots/demo GIF/support copy are not finalized.

Suggested tasks (Phase 1):
- Reduce duplicate views; deprecate under-used editor paths or make them consistent.
- Improve empty/error states for “no workspace”, “no git repo”, “no staged changes”.
- Replace placeholder images; add a 30–60s demo GIF.
- Implement GitLens-inspired sidebar file tree (staged + unstaged) with a prominent “Compose commit”.
- Enlarge provider settings icon and improve hitbox/tooltip/focus.

### Phase 2 — Power Features (P2)

| Workstream | Deliverables | Acceptance Criteria |
|---|---|---|
| Manual grouping | Merge/split + file reassignment UI | Users can refine drafts without re-running AI |
| Batch control | Skip/retry/stop queue; clear progress and outcomes | Batch commit flow is predictable and recoverable |
| Privacy controls | Exclusion globs and redaction modes | Sensitive files can be excluded from AI prompts |

### Phase 3 — Launch Hardening (Release Candidate)

| Workstream | Deliverables | Acceptance Criteria |
|---|---|---|
| QA matrix | Platform smoke tests (mac/win/linux) | No P0 regressions across platforms |
| Regression tests | Expanded unit tests + minimal messaging tests | Critical flows covered; failures are actionable |
| Release process | Changelog, versioning, release notes, support docs | Release artifacts ready; upgrade path verified |

---

## 6) Testing & QA Plan (Pre-Launch)

### 6.1 Automated Tests (Minimum Bar)

| Area | Test Type | What to cover |
|---|---|---|
| Commit execution | Unit | Commit single/all behavior; staged snapshot checks |
| Config loading | Unit | Settings + `.gitcomposer.json` precedence |
| Response parsing | Unit | JSON variants, fallback strategy, edge cases |
| Webview messaging | Integration-lite | Command routing (compose/commit/keys) contracts |

### 6.2 Manual Smoke Matrix

| Platform | Install | Compose (AI) | Compose (heuristic) | Review diffs | Commit single/all |
|---|---:|---:|---:|---:|---:|
| macOS | ✅ | ✅ | ✅ | ✅ | ✅ |
| Windows | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Linux | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

Use `docs/TESTING.md` as the step-by-step guide and keep it updated as UX changes.

---

### 6.3 Known Test Debt (Reality Check)

If `pnpm run test` reports failures in suites unrelated to compose/refresh work (e.g. parser/classifier/key manager), treat it as a launch blocker. The project needs a stable, deterministic test baseline before Marketplace launch.

Recommended actions:
- Split unit vs integration tests and run them separately in CI.
- Fix or quarantine flaky tests (with justification) instead of ignoring failures.

## 7) Launch Checklist (Go/No-Go)

### Product Gates
- No unsafe commit paths (staged snapshot drift blocks commits).
- Provider failures are actionable; fallback mode is visible.
- Docs match the product (no placeholder assets; accurate screenshots).

### Privacy Gates
- Clear privacy disclosure in README + UI.
- Keys never written to disk; logs are sanitized.

### Quality Gates
- `pnpm run lint`, `pnpm run compile`, `pnpm run test` pass.
- Basic smoke test passes on at least macOS + Windows before launch.

### UX Gates (Minimum Bar)
- Sidebar shows staged + unstaged changes and has a clear “Compose commit” CTA.
- Panel is composition-focused and does not show staged/unstaged lists.
- Provider key configuration is discoverable, but saved keys are never shown.
