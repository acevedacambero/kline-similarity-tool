# 两台电脑接力开发流程

GitHub 是唯一交接点。两台电脑可以使用不同的本地目录，但不要同时修改同一个未合并分支。

## 每次开始工作

```powershell
Set-Location <本机仓库路径>
git switch main
git pull --ff-only origin main
git status
npm install
npm test
git switch -c codex/<任务名称>
```

只有工作区干净且测试通过后才开始修改。

## 完成任务并交棒

```powershell
npm run build
npm test
git add <本次修改的明确文件>
git commit -m "修改说明"
git push -u origin HEAD
gh pr create
```

合并拉取请求后更新本机主分支：

```powershell
git switch main
git pull --ff-only origin main
```

下一台电脑从“每次开始工作”继续。

## 未完成任务中途交棒

电脑 A 在当前功能分支保存进度：

```powershell
git add <本次修改的明确文件>
git commit -m "WIP: 当前进度"
git push -u origin HEAD
git branch --show-current
```

将最后输出的分支名告诉电脑 B。电脑 B 接续：

```powershell
git fetch origin --prune
git switch <分支名>
git pull --ff-only
npm install
npm test
```

完成后由电脑 B 创建并合并拉取请求。

## 冲突保护规则

- 不在 `main` 上直接开发或提交。
- 开始前必须执行 `git pull --ff-only`，禁止用强制推送覆盖另一台电脑。
- `git status` 有未知改动时先停止，确认改动来源后再同步。
- 本地行情、浏览器缓存、目录授权和个人设置不进入 GitHub，需要在每台电脑分别配置。
- 发布只使用已经合并到 `main` 的版本。
