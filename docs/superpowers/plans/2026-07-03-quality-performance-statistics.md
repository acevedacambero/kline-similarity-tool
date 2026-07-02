# K-line Quality, Performance, and Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve correctness, observability, performance, statistical conservatism, and maintainability without changing the local-only single-file user experience.

**Architecture:** Introduce tested pure functions first, wire them into the existing page, then extract them into build-time modules. Every behavior change is protected by a failing test before implementation.

**Tech Stack:** Browser JavaScript, Web Worker, Node.js test runner, PowerShell verification, Cloudflare static assets.

---

### Task 1: Canonical market-data parsing and adjustment

**Files:**
- Modify: `tests/algorithm.test.cjs`
- Modify: `tests/integration.test.cjs`
- Modify: `K线结构相似度分析工具.html`

- [ ] Add failing tests for full OHLC/amount parsing, invalid records, duplicate/descending dates, and daily adjustment factors.
- [ ] Replace the two parsers with one canonical record representation.
- [ ] Return explicit adjustment alignment status and show it in the UI.
- [ ] Add structured skip-reason counters to Worker result metadata.
- [ ] Run the full verification suite.

### Task 2: Peer performance and parameter presets

**Files:**
- Modify: `tests/algorithm.test.cjs`
- Modify: `tests/integration.test.cjs`
- Modify: `K线结构相似度分析工具.html`

- [ ] Add failing tests for binary date slicing and preset values.
- [ ] Slice peer candidates to the target range before alignment.
- [ ] Add stable/balanced/loose presets and advanced controls for coarse threshold, candidate limits, DTW count, and bandwidth.
- [ ] Export effective settings and rejection counters in metadata and CSV.
- [ ] Run the full verification suite.

### Task 3: Cluster-aware statistics

**Files:**
- Modify: `tests/algorithm.test.cjs`
- Modify: `tests/integration.test.cjs`
- Modify: `K线结构相似度分析工具.html`

- [ ] Add failing tests for cross-stock time clustering and deterministic bootstrap intervals.
- [ ] Cluster statistical rows by nearby end dates and aggregate one return per time cluster.
- [ ] Display raw valid sample count, independent period count, and cluster bootstrap interval.
- [ ] Exclude rows without the requested future horizon.
- [ ] Run the full verification suite.

### Task 4: Build-source modularization

**Files:**
- Create: `src/algorithm.js`
- Create: `scripts/build.cjs`
- Modify: `package.json`
- Modify: `tests/load-worker.cjs`
- Modify: `tests/verify.ps1`
- Generate: `K线结构相似度分析工具.html`
- Generate: `public/index.html`

- [ ] Move pure algorithm source to an independently loadable module without changing the browser API.
- [ ] Add a deterministic build that injects the Worker source and writes both HTML outputs.
- [ ] Make verification rebuild and fail on generated drift.
- [ ] Run the full verification suite.

### Task 5: Privacy, compatibility, documentation, and release

**Files:**
- Modify: `tests/verify.ps1`
- Modify: `tests/integration.test.cjs`
- Modify: `README.md`

- [ ] Add failing checks for Beacon, external script/style/image URLs, dynamic script loading, and external form actions.
- [ ] Add explicit browser capability diagnostics and document supported fallbacks.
- [ ] Run all tests and compare generated/local/deployed copies.
- [ ] Publish through a GitHub pull request and deploy Cloudflare only after verification succeeds.
