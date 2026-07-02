# Cloudflare 域名迁移设计

## 目标

将自定义域名 `skyland.us.ci` 从 Cloudflare Worker `acevedacambero-man-city-hono-site` 迁移到 GitHub 仓库 `acevedacambero/kline-similarity-tool` 对应的新 Cloudflare Worker，同时保留旧 Worker 和旧 GitHub 仓库。

## 已确认现状

- `man-city-site` 不是 GitHub Pages 项目。
- 旧仓库使用 Hono 与 Wrangler，Worker 名称为 `acevedacambero-man-city-hono-site`。
- 域名绑定和 GitHub 仓库连接位于 Cloudflare 侧，而非 GitHub 仓库的 `CNAME` 文件。
- 本机没有可复用的 Wrangler 登录状态或 Cloudflare API Token，因此 Cloudflare 操作需要浏览器登录授权。

## 新部署结构

在 `kline-similarity-tool` 仓库增加：

- `public/index.html`：正式工具页面的部署副本。
- `wrangler.jsonc`：新 Worker 名称 `kline-similarity-tool`，静态资源目录为 `./public`，SPA 访问回退到 `index.html`。
- `package.json`：包含固定主版本的 Wrangler 开发依赖及 `dev`、`deploy` 脚本。
- README 中增加 Cloudflare 本地预览与部署说明。
- 回归测试改为校验根目录正式 HTML 与 `public/index.html` 内容一致。

## 安全迁移顺序

1. 在功能分支添加部署配置和测试。
2. 本地运行全部回归测试及静态部署配置检查。
3. 提交、推送并合并到 `main`。
4. 在 Cloudflare 创建或连接新 Worker，先获得独立的 `workers.dev` 预览地址。
5. 在预览地址验证工具页面、三种模式控件和本地目录选择控件。
6. 从旧 Worker 移除 `skyland.us.ci` 自定义域名。
7. 将 `skyland.us.ci` 绑定到新 Worker。
8. 验证 HTTPS、页面标题、近期模式控件和根路径访问。

只有第5步成功后才能执行第6步。若域名绑定失败，应立即将域名重新绑定旧 Worker。

## 旧站处理

- 不删除 `acevedacambero/man-city-site` GitHub 仓库。
- 不删除旧 Cloudflare Worker。
- 仅移除其 `skyland.us.ci` 自定义域名。
- 旧站继续通过其 `workers.dev` 地址访问。

## Git 工作流

- 本地仓库：`D:\AIAPP\kline-similarity-tool`。
- 新分支：`codex/cloudflare-deployment`。
- 提交部署配置、测试和 README 更新。
- 运行完整验证后推送并创建 PR；合并后再配置 Cloudflare Git 集成。

## 验收标准

- `https://skyland.us.ci/` 返回 K线结构相似度工具。
- 页面包含“历史滑窗搜索”“同期联动”和“近期相似区间”。
- 浏览器可触发通达信目录选择；数据仍只在用户本机读取。
- 新 Worker 的 `workers.dev` 地址可用。
- 旧 Worker 与旧 GitHub 仓库仍存在，但不再占用该域名。
- GitHub `main` 包含可复现的 Cloudflare 部署配置，全部测试通过。
