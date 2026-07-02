# Cloudflare 域名迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `skyland.us.ci` 安全迁移到 K线结构相似度工具的新 Cloudflare Worker，并保留旧站作为可回滚目标。

**Architecture:** 新仓库用 Cloudflare Workers Static Assets 发布 `public/index.html`。先通过独立 `workers.dev` 地址验证，再执行自定义域名切换；域名失败时恢复旧 Worker 绑定。

**Tech Stack:** Git、GitHub、Cloudflare Workers、Wrangler、HTML/JavaScript、Node.js、PowerShell。

---

### Task 1: 部署配置测试与静态资源

**Files:**
- Modify: `tests/integration.test.cjs`
- Create: `public/index.html`
- Create: `wrangler.jsonc`
- Create: `package.json`

- [ ] 写失败测试：断言 `public/index.html` 与根 HTML 字节一致，Wrangler assets目录为 `./public`，`not_found_handling` 为 `single-page-application`。
- [ ] 运行测试确认因文件不存在而失败。
- [ ] 复制正式 HTML 到 `public/index.html`。
- [ ] 创建 `wrangler.jsonc`：Worker名称 `kline-similarity-tool`，兼容日期为当前日期，静态目录 `./public`。
- [ ] 创建 `package.json`，脚本为 `wrangler dev` 和 `wrangler deploy`，开发依赖 Wrangler 4.x。
- [ ] 运行测试确认通过。

### Task 2: 文档与完整验证

**Files:**
- Modify: `README.md`
- Modify: `tests/verify.ps1`
- Create: `docs/specs/2026-07-02-cloudflare-domain-migration-design.md`
- Create: `docs/plans/2026-07-02-cloudflare-domain-migration.md`

- [ ] README 增加 Cloudflare 本地预览、部署和自定义域名说明。
- [ ] 验证脚本增加 `public/index.html` 同步和 Wrangler配置检查。
- [ ] 复制已批准规格与计划至仓库。
- [ ] 执行完整验证。

Run: `powershell -ExecutionPolicy Bypass -File .\tests\verify.ps1`

Expected: 全部测试、语法、控件、静态副本、Wrangler配置及无联网策略通过。

### Task 3: GitHub 分支与合并

- [ ] 从干净 `main` 创建 `codex/cloudflare-deployment`。
- [ ] 审查 `git diff`，只包含部署配置、测试和文档。
- [ ] 提交：`Add Cloudflare Workers deployment`。
- [ ] 推送分支并创建 PR。
- [ ] 验证PR差异和检查后合并到 `main`。
- [ ] 更新本地 `main` 并重新运行完整验证。

### Task 4: Cloudflare 新 Worker 预览部署

- [ ] 打开 Cloudflare Dashboard并由用户完成登录或授权。
- [ ] 创建新 Workers项目 `kline-similarity-tool`，连接 GitHub仓库或从 `main` 部署。
- [ ] 记录独立 `workers.dev` 地址。
- [ ] 在预览地址验证页面标题、三种模式和近期范围输入框。
- [ ] 若预览失败，停止，不修改旧域名。

### Task 5: 自定义域名切换与回滚验证

- [ ] 记录旧 Worker 名称和当前自定义域名绑定作为回滚依据。
- [ ] 从旧 Worker 移除 `skyland.us.ci`。
- [ ] 将 `skyland.us.ci` 添加到新 Worker。
- [ ] 验证 HTTPS、根页面标题和三种模式控件。
- [ ] 若失败，将域名重新绑定旧 Worker并报告。
- [ ] 成功后确认旧 Worker和旧仓库仍存在。

## 规格覆盖检查

- 静态部署结构与可复现配置：Task 1、2。
- Git版本与审核：Task 3。
- 先预览后切域名：Task 4、5。
- 旧站保留与失败回滚：Task 5。
