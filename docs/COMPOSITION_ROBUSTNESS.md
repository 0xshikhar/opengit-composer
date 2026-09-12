# Composition Robustness Guide

This document explains how OpenGit Composer guarantees multi-commit output for multi-file staged changes using AI, and how to keep composition behavior robust as the project evolves.

## 1. Problem

In some scenarios, AI providers return a single grouped commit even when many files are staged. This breaks the core purpose of OpenGit Composer (atomic multi-commit planning).

## 2. Current Guarantee

Hard rule now enforced in orchestrator:

- If staged eligible file count is `1`: a single draft is allowed.
- If staged eligible file count is `> 1`: at least `2` drafts are always produced.

The guarantee is applied after AI/heuristic composition to ensure model output cannot collapse to a single draft.

Implementation:
- `src/core/orchestrator.ts`
  - `enforceMultiDraftRequirement(...)`
  - `groupFilesByTopFolder(...)`
  - fallback strategy per file if grouping still yields one bucket

## 3. Multi-Draft Enforcement Strategy

When draft count from AI/heuristics is less than 2 for multi-file changes:

1. Build semantic groups (domain-first, then folder grouping).
2. Run AI regrouping pass (`generateCommitMessage`) per group when provider is available.
3. If AI regrouping is unavailable or fails, use heuristic commit messages.
4. If semantic grouping still cannot split, split evenly into at least two groups.
5. Annotate reasoning/summary with applied strategy.

This ensures:
- deterministic behavior,
- predictable user outcome,
- no single-draft collapse for multi-file staging.

## 4. Why This Is Safe

- It runs after privacy filtering (`excludePatterns`, `redactPatterns`), so enforcement reflects only eligible files.
- It does not bypass snapshot safety checks.
- It remains review-first: generated drafts can still be edited before commit.

## 5. Tradeoffs

Pros:
- Guarantees product intent (atomic commit planning).
- Preserves AI involvement during regrouping instead of defaulting to per-file mechanics.
- Gives consistent behavior across providers.

Cons:
- Regrouping may still not match ideal human intent for tightly coupled cross-cutting changes.
- Multiple AI regrouping calls can add latency on large change sets.

## 6. Message Quality Safeguards

To avoid malformed subjects like duplicated conventional prefixes:
- `feat(core): feat(core): ...`
- `fix(ui): fix(ui): ...`

The orchestrator normalizes the subject line and collapses repeated prefixes to a single prefix before showing drafts.

## 7. Refresh and Stale Snapshot UX

When staged files change after composition:

1. commit is blocked,
2. stale snapshot error is shown,
3. refresh action reloads staged/unstaged state,
4. stale drafts are cleared from UI to force fresh re-compose.

This prevents users from repeatedly interacting with stale draft plans.

## 6. Recommended Next Improvements

1. Add user strategy setting:
   - `strictMulti` (always >=2 drafts for multi-file),
   - `semanticPreferred` (allow single only with confidence threshold + explicit reason).
2. Add minimum/maximum draft count controls.
3. Add stronger semantic regrouping:
   - diff-aware clustering,
   - file dependency scoring,
   - commit type confidence thresholds.
4. Add UI explanation panel when forced strategy is used.

## 7. Testing Coverage

Added regression in:
- `src/test/suite/orchestrator.test.ts`

Test validates:
- multi-file staged changes produce at least two drafts,
- reasoning contains forced strategy note.

## 8. Operational Guidance

If users still report weak grouping quality:

1. Verify forced strategy applied in reasoning.
2. Confirm privacy exclusions are not removing most files.
3. Check provider fallback frequency in status/meta.
4. Use additional instructions to bias grouping intent.

This keeps composition behavior predictable while allowing iterative quality improvements.

## 9. OpenAI GPT-5 Compatibility

GPT-5-family OpenAI models should use the Responses API with structured outputs. Legacy Chat Completions JSON mode is not the right path for those models and can trigger provider errors or fallback behavior.

Current implementation:
- `src/ai/providers/openai.ts`
  - GPT-5 models route through `https://api.openai.com/v1/responses`
  - analysis uses JSON Schema structured outputs
  - older OpenAI models continue to use Chat Completions

Practical rule:
- If the selected OpenAI model starts with `gpt-5`, use Responses API structured outputs.
- If the model is a legacy `gpt-4o` or older OpenAI chat model, the existing Chat Completions path remains valid.
