# GitHub 公开发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建并发布公开仓库 `acevedacambero/kline-similarity-tool`，将工具纳入安全、可测试的 Git 版本管理。

**Architecture:** 在 `D:\AIAPP\kline-similarity-tool` 建立独立仓库，只复制正式 HTML、测试和相关文档。先在本地完成验证和敏感信息检查，再创建 GitHub 远程仓库并推送 `main`。

**Tech Stack:** Git、GitHub CLI、HTML/JavaScript、Node.js `node:test`、PowerShell。

---

### Task 1: 创建独立仓库结构

**Files:**
- Create: `D:\AIAPP\kline-similarity-tool\K线结构相似度分析工具.html`
- Create: `D:\AIAPP\kline-similarity-tool\.gitignore`
- Create: `D:\AIAPP\kline-similarity-tool\README.md`
- Create: `D:\AIAPP\kline-similarity-tool\LICENSE`

- [ ] 复制正式 HTML，并确认与 `D:\tdx` 版本 SHA256 一致。
- [ ] 创建 `.gitignore`，排除 `vipdoc/`、`T0002/`、`backups/`、`*.day`、`*.tnf`、`gbbq`、缓存和系统文件。
- [ ] 编写 README，说明功能、三种模式、本地数据选择、隐私、测试与投资风险。
- [ ] 添加 MIT License，版权人为 `acevedacambero`。

### Task 2: 迁移并适配测试

**Files:**
- Create: `D:\AIAPP\kline-similarity-tool\tests\load-worker.cjs`
- Create: `D:\AIAPP\kline-similarity-tool\tests\algorithm.test.cjs`
- Create: `D:\AIAPP\kline-similarity-tool\tests\integration.test.cjs`
- Create: `D:\AIAPP\kline-similarity-tool\tests\verify.ps1`
- Create: `D:\AIAPP\kline-similarity-tool\docs\specs\*`
- Create: `D:\AIAPP\kline-similarity-tool\docs\plans\*`

- [ ] 复制现有测试与相关设计/计划文档。
- [ ] 将测试中的 HTML 路径改为由 `__dirname` 解析仓库根目录。
- [ ] 将验证脚本改为从 `$PSScriptRoot\..` 定位仓库。
- [ ] 先运行测试确认路径适配问题可被捕获，再修正至全部通过。

Run: `powershell -ExecutionPolicy Bypass -File D:\AIAPP\kline-similarity-tool\tests\verify.ps1`

Expected: 全部测试、脚本语法、关键控件和无联网策略通过。

### Task 3: Git 初始化与发布前审计

- [ ] 运行 `git init -b main`。
- [ ] 用 `git status --short` 列出全部文件，确认均在规格范围内。
- [ ] 扫描 token、密码、Cookie、私钥和通达信数据扩展名。
- [ ] 检查是否存在大于5 MB的异常文件。
- [ ] 显式暂存批准的文件并提交：`Initial release of K-line similarity tool`。
- [ ] 确认提交后工作树干净。

### Task 4: 创建 GitHub 仓库并推送

- [ ] 确认 `acevedacambero/kline-similarity-tool` 尚不存在；若已存在则停止并报告。
- [ ] 创建公开仓库并设置 `origin`：

```powershell
& 'C:\Program Files\GitHub CLI\gh.exe' repo create acevedacambero/kline-similarity-tool --public --source . --remote origin
```

- [ ] 推送：`git push -u origin main`。
- [ ] 用 `gh repo view` 验证仓库可见性、默认分支和网页地址。
- [ ] 报告仓库URL、提交哈希、验证结果和本地仓库路径。

## 规格覆盖检查

- 独立仓库与文件范围：Task 1、2。
- 隐私、敏感信息与大文件检查：Task 3。
- Git版本管理、公开仓库和推送验证：Task 4。
