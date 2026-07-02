# K线结构相似度工具 GitHub 公开发布设计

## 目标

在 GitHub 账号 `acevedacambero` 下创建公开仓库 `kline-similarity-tool`，使用 Git 管理工具页面、回归测试和项目文档。

## 仓库范围

仓库在 `D:\AIAPP\kline-similarity-tool` 创建，包含：

- `K线结构相似度分析工具.html`：从 `D:\tdx` 复制的当前正式版本。
- `README.md`：功能、使用方式、三种模式、数据隐私、测试和风险说明。
- `LICENSE`：MIT License，版权年份2026，版权人使用 GitHub 用户名 `acevedacambero`。
- `.gitignore`：排除通达信行情、权息数据、缓存、备份、系统文件和编辑器文件。
- `tests/`：现有 Node 回归测试和 PowerShell 验证脚本；验证脚本改为定位仓库根目录中的 HTML，不依赖 `D:\tdx`。
- `docs/specs/` 与 `docs/plans/`：与该工具相关的设计和实施文档。

## 明确排除

- `vipdoc`、`T0002`、`.day`、`.tnf`、`gbbq` 等通达信本地数据。
- `D:\AIAPP\backups` 中的全部备份。
- 通达信程序、DLL、配置、账号信息和个人目录。
- GitHub 凭据、令牌、浏览器数据及环境配置。

## Git 与 GitHub

- 默认分支为 `main`。
- 首次提交信息为 `Initial release of K-line similarity tool`。
- 使用 `gh repo create acevedacambero/kline-similarity-tool --public` 创建远程仓库并设置 `origin`。
- 推送前运行仓库内完整验证，检查测试、脚本语法、关键控件和无联网 API。
- 首次发布直接推送 `main`，不创建空洞的自合并 Pull Request；后续功能使用 `codex/<description>` 分支和 Pull Request。

## 安全检查

提交前列出全部待提交文件，扫描以下内容：

- GitHub token、密码、Cookie、私钥或常见凭据格式。
- 绝对个人路径和不必要的本地环境信息。
- 大于5 MB的异常文件。
- 通达信数据扩展名与目录名。

发现任一敏感或超范围文件时停止发布并先修正。

## 验收标准

- GitHub 上存在公开仓库 `acevedacambero/kline-similarity-tool`。
- `main` 分支包含页面、README、MIT许可证、测试与相关文档。
- 本地工作树干净，`origin` 指向正确仓库。
- 仓库内验证全部通过。
- GitHub 仓库页面可访问，且没有上传通达信数据或个人文件。
