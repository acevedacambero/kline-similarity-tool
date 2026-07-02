# Recent Default and CSV Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recent similarity the first/default mode and remove ranking from CSV exports.

**Architecture:** Change only HTML control ordering/default state and the CSV serializer. Protect both behaviors with source-level integration tests.

**Tech Stack:** Single-file HTML/JavaScript, Node.js built-in test runner, PowerShell verification.

---

### Task 1: Define behavior with failing tests

**Files:**
- Modify: `tests/integration.test.cjs`

- [ ] Assert the first mode radio is `recent` and it owns the only `checked` attribute.
- [ ] Assert the CSV header starts with `代码` and row serialization no longer starts with `i+1`.
- [ ] Run the integration tests and confirm failure against current behavior.

### Task 2: Implement and synchronize

**Files:**
- Modify: `K线结构相似度分析工具.html`
- Modify: `public/index.html`

- [ ] Reorder mode controls and move `checked` to recent mode.
- [ ] Remove ranking from CSV header and row values.
- [ ] Apply identical edits to the Cloudflare public entry and local TDX copy.

### Task 3: Verify and publish

**Files:**
- Test: `tests/verify.ps1`

- [ ] Run the complete verification suite.
- [ ] Confirm all HTML copies match.
- [ ] Commit, merge through GitHub, deploy Cloudflare, and verify the live page.
