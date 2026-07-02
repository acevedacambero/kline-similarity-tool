# Recent Freshness Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude stale securities from recent-similarity results using a 30-trading-day cutoff derived from the reference security.

**Architecture:** Add a pure cutoff helper beside the existing window helpers, export it for tests, and apply it only in the recent-mode candidate loop. Keep the other two modes unchanged.

**Tech Stack:** Single-file HTML/JavaScript, Node.js built-in test runner, PowerShell verification wrapper.

---

### Task 1: Add regression coverage

**Files:**
- Modify: `tests/algorithm.test.cjs`
- Test: `tests/algorithm.test.cjs`

- [ ] Add a test that expects the reference date 30 indexes before `refEnd` and verifies stale candidate dates fail the boundary.
- [ ] Run `node --test tests/algorithm.test.cjs` and confirm it fails because the helper is absent.

### Task 2: Implement the recent-mode cutoff

**Files:**
- Modify: `K线结构相似度分析工具.html`
- Modify: `public/index.html`

- [ ] Add `recentFreshnessCutoff(dates, refEndIndex, lookback=30)`.
- [ ] Compute the cutoff from the reference series and skip stale candidates only when `mode === "recent"`.
- [ ] Export the helper through `self.__KLINE_TEST_API__`.
- [ ] Synchronize the Cloudflare public entry with the source HTML.

### Task 3: Verify and publish

**Files:**
- Test: `tests/verify.ps1`

- [ ] Run `powershell -ExecutionPolicy Bypass -File .\tests\verify.ps1` and require all tests to pass.
- [ ] Review the diff for scope and syntax.
- [ ] Commit the focused change and publish it through the repository workflow.
