# OpenGit Composer Architecture Comparison

This document compares architecture and design-principle options for OpenGit Composer and recommends a practical target architecture for this codebase.

## 1. Decision Context

OpenGit Composer is a VS Code extension with:
- host runtime logic (compose, commit, provider calls),
- webview UI (React + Zustand),
- local git operations,
- provider integrations with privacy and safety constraints.

Architecture decisions should optimize for:
1. correctness and data safety,
2. reliability and debuggability,
3. incremental delivery speed,
4. maintainability under feature growth.

## 2. Current Baseline

Current model:
- layered, message-driven architecture,
- host orchestrator (`Orchestrator`) coordinating git + AI + privacy,
- webview state store handling interaction state,
- command-based host↔UI contract in `CommitComposerProvider`.

Strengths:
- simple and shippable,
- low infrastructure cost,
- easy to run locally.

Pain points:
- message contract is implicit (not strongly typed end-to-end),
- orchestration logic can become large over time,
- feature growth risks state/flow complexity.

## 3. Architecture Options

### Option A: Keep Layered Monolith (Refined Current Model)

Description:
- Keep current extension-host + webview split.
- Improve boundaries and type contracts.

Pros:
- lowest migration cost,
- fastest iteration for near-term roadmap,
- minimal operational risk.

Cons:
- long-term growth can create "god orchestrator" pressure,
- requires discipline to avoid coupling drift.

Best for:
- next 1-2 release cycles,
- fast feature delivery with controlled complexity.

### Option B: Vertical Slice Modules (Feature-Oriented Inside Monolith)

Description:
- Organize by feature slices (`compose`, `commit`, `provider-health`, `privacy`, `keys`, `status`) rather than by technical layer only.
- Each slice contains host handlers, domain logic, and UI adapters.

Pros:
- better ownership and change locality,
- easier onboarding by workflow,
- improved testability around user journeys.

Cons:
- moderate refactor cost,
- requires clear module conventions.

Best for:
- medium-term scaling of team/features,
- reducing cross-module regressions.

### Option C: Event-Driven Internal Core (Command/Event Bus)

Description:
- Introduce internal command/event bus in host.
- UI and host handlers exchange typed commands/events.

Pros:
- clean extensibility for telemetry, retries, audit trails,
- easier to attach observers (status, analytics, replay in tests).

Cons:
- additional abstraction overhead,
- can be over-engineered for a small team.

Best for:
- high plugin complexity, many asynchronous workflows, richer background operations.

### Option D: External Service Architecture (Remote Backend)

Description:
- Move AI orchestration/privacy logic to a remote service.

Pros:
- centralized control, policy updates, shared caching.

Cons:
- major privacy/trust tradeoff,
- operational overhead and latency,
- conflicts with local-first and offline Ollama use cases.

Best for:
- enterprise managed SaaS model, not current local-first product posture.

## 4. Design Principles Comparison

### Principle Set P1: Pragmatic Layered Design

Characteristics:
- thin UI, explicit orchestration layer, service adapters.

Benefits:
- straightforward debugging,
- minimal accidental complexity.

Risks:
- orchestration layer bloat.

Fit:
- excellent near term.

### Principle Set P2: Domain-Driven Boundaries (Lightweight DDD)

Characteristics:
- model explicit domain concepts: `ComposePlan`, `Snapshot`, `PolicyResult`, `CommitExecutionResult`.
- isolate domain logic from transport/UI.

Benefits:
- stronger correctness semantics,
- easier unit testing and refactoring.

Risks:
- additional upfront modeling effort.

Fit:
- strong medium-term fit.

### Principle Set P3: Functional Core, Imperative Shell

Characteristics:
- pure functions for compose planning/validation,
- side effects isolated in adapters (git, provider, clipboard, vscode APIs).

Benefits:
- high testability,
- deterministic behavior in critical safety logic.

Risks:
- requires disciplined separation and signatures.

Fit:
- very good for safety-critical flows (snapshot validation, privacy policy).

### Principle Set P4: CQRS/Event Sourcing Style

Characteristics:
- strict command/query separation and persisted event stream.

Benefits:
- auditability and time-travel debugging.

Risks:
- complexity likely exceeds current product needs.

Fit:
- low fit now, maybe later for enterprise/audit requirements.

## 5. Evaluation Matrix

Scoring: 1 (poor) to 5 (strong)

| Option | Delivery Speed | Maintainability | Correctness Safety | Debuggability | Complexity Cost | Overall |
|---|---:|---:|---:|---:|---:|---:|
| A. Refined layered monolith | 5 | 3 | 4 | 4 | 5 | 4.2 |
| B. Vertical slice monolith | 4 | 5 | 4 | 4 | 3 | 4.0 |
| C. Internal event-driven core | 3 | 4 | 4 | 5 | 2 | 3.6 |
| D. External service backend | 2 | 3 | 3 | 3 | 1 | 2.4 |

Recommended interpretation:
- Option A for immediate releases,
- evolve to Option B incrementally,
- borrow selective patterns from Option C (typed events) only where needed.

## 6. Recommended Target Architecture

Recommended path: **A -> B hybrid**

### Phase 1 (Now): Hardening Current Architecture

Keep current structure, add strict contracts:
1. Typed message schema for host↔webview commands.
2. Explicit error taxonomy (`code`, `message`, `action`, `severity`, `recoverable`).
3. Keep safety logic centralized and unit-tested (snapshot, privacy policy, format checks).

Current implementation status:
- typed host↔webview message contract and runtime guards are now in place,
- error codes are normalized into a shared taxonomy,
- snapshot/privacy/format safety logic remains centralized in the host orchestrator layer.
- feature slices have started to move out of the monolith (`src/features/compose`, `src/features/commit`, `src/features/provider-health`, `src/features/privacy`).
- host/provider routing is now thin; preflight, commit safety, privacy preview, and provider-health helpers live in feature modules.
- host message dispatch is now table-driven in `src/webview/host/webviewCommandRouter.ts`.
- command handling is further split into domain registries under `src/webview/host/handlers/`.
- error handling is now emitted as one structured payload with `code`, `severity`, `recoverable`, `action`, and `diagnostics`.

### Phase 2 (Next): Vertical Slice Refactor

Introduce feature modules:
- `src/features/compose/*`
- `src/features/commit/*`
- `src/features/provider-health/*`
- `src/features/privacy/*`
- `src/features/support/*`

Each slice should contain:
- host command handlers,
- domain services,
- mapper/DTO contract,
- tests.

### Phase 3 (Optional): Typed Internal Events

Add internal event publishing for:
- compose started/completed/fallback,
- commit blocked/succeeded/failed,
- provider preflight outcomes.

Use this for:
- richer status UI,
- diagnostics,
- targeted analytics hooks (if added later).

## 7. Concrete Best Practices For This Project

1. Keep side effects at boundaries:
   - git/provider/vscode APIs only in adapters.
2. Treat snapshot validation and privacy policy as pure domain rules first.
3. Define command/message types in one place and generate/validate payloads at runtime.
4. Use "error codes first" UX handling, not string matching.
5. Add ADRs for major architecture decisions to avoid drift.

## 8. Suggested ADR Backlog

1. `ADR-001`: Host-Webview message contract strategy (schema + runtime validation).
2. `ADR-002`: Error taxonomy and user recovery action model.
3. `ADR-003`: Feature slice module boundaries.
4. `ADR-004`: Privacy policy precedence and defaults.
5. `ADR-005`: Performance budget and progressive rendering limits.

## 9. Implementation Plan (Actionable)

### Sprint A

- Add `docs/adr/` structure and ADR template.
- Introduce `types/messages.ts` with typed commands/events.
- Add runtime payload guards for incoming webview messages.

### Sprint B

- Refactor compose flow into `features/compose`.
- Refactor commit safety into `features/commit-safety`.
- Expand unit tests around domain rules.

### Sprint C

- Refactor provider preflight/error mapping into `features/provider-health`.
- Introduce optional internal event dispatcher for status diagnostics.

## 10. Final Recommendation

Best option for OpenGit Composer now:
- **Use refined layered architecture immediately (Option A)**,
- **evolve to vertical slices (Option B) over 2-3 iterations**,
- **adopt selective event-driven patterns only where they reduce real complexity**.

This provides the strongest balance of delivery velocity, safety, and long-term maintainability for your current product stage.
