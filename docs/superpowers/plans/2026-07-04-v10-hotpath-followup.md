# v10 Hot-Path Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove placebo/cache write amplification and make benchmark degradation explicit and statistically consistent.

**Architecture:** Keep the single Worker and current result protocol. Extract scalar forward-return computation, make random sampling O(limit), update only touched cache records, and carry one selected return family through matched and placebo summaries.

**Tech Stack:** Vanilla JavaScript, Web Worker, IndexedDB, Node test runner.

---

### Task 1: Lightweight placebo collection and bounded sampling

**Files:** Modify `src/algorithm.js`; test `tests/algorithm.test.cjs`, `tests/integration.test.cjs`.

- [ ] Add failing tests proving `forwardReturns` matches expected stock/index/excess values and `samplePlaceboStarts` reads at most `limit` random positions.
- [ ] Run `node --test --test-name-pattern="forward returns|partial placebo" tests/algorithm.test.cjs` and confirm RED.
- [ ] Add `forwardReturns(stk,e,benchmarkSeries)` and replace `packStk` inside `addPlacebos`; implement partial Fisher-Yates for only `limit` swaps.
- [ ] Assert generated HTML no longer contains `packed=packStk` in `addPlacebos` and run the targeted tests GREEN.
- [ ] Commit as `优化随机基线采样热路径`.

### Task 2: Touched-only cache maintenance

**Files:** Modify `src/algorithm.js`; test `tests/algorithm.test.cjs`, `tests/integration.test.cjs`.

- [ ] Add a failing pure test for `cacheWriteBackKeys(records,touched,evicted)` returning only touched, non-evicted keys.
- [ ] Confirm RED with `node --test --test-name-pattern="cache write-back" tests/algorithm.test.cjs`.
- [ ] Add the selector, use a Set for evictions, write back only selected records, and remove the unused `gone` variable from `selectCacheEvictions`.
- [ ] Run targeted tests GREEN and commit as `减少缓存维护写放大`.

### Task 3: Explicit benchmark status and consistent placebo fallback

**Files:** Modify `src/algorithm.js`, `src/page.template.html`; test `tests/algorithm.test.cjs`, `tests/integration.test.cjs`.

- [ ] Add failing tests for `selectReturnFamily(rows,horizon)` choosing `excess` only when available, otherwise `fut`, and for benchmark status metadata/UI markers.
- [ ] Confirm RED with `node --test --test-name-pattern="return family|benchmark status" tests/algorithm.test.cjs tests/integration.test.cjs`.
- [ ] Use the selected family in both clustered match statistics and `placeboSummary`; emit loaded/missing benchmark keys and render missing-index/absolute-return warnings.
- [ ] Build and run targeted tests GREEN.
- [ ] Run `npm test`, `npm audit --json`, `git diff --check`, and `node scripts/build.cjs --check`; commit as `明确基准缺失与随机基线降级`.
