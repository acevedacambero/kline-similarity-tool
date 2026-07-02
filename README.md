# K线结构相似度分析工具

一个单文件、纯本地运行的通达信日线结构分析与相似形态搜索工具。行情、证券名称和权息数据均在浏览器本地读取，不上传到服务器。

## 功能

- 读取通达信 `.day` 日线、`.tnf` 名称表与 `gbbq` 权息数据
- 真实权息前复权，并同步处理送转、配股导致的成交量变化
- K线、均线、ZigZag、量价、波动率和最大回撤分析
- 多维相似度评分：收益序列、累计走势、拐点、均线、量能、波动/回撤和 DTW
- Web Worker 后台扫描、IndexedDB 本地缓存、CSV 导出和走势叠加

## 三种匹配模式

1. **历史滑窗搜索**：在全历史寻找曾经出现过的相似窗口，适合形态案例和回测研究。
2. **同期联动**：按共同交易日比较同一日期区间，适合寻找同期共振证券。
3. **近期相似区间**：在每只证券最近可调数量的交易日内滑窗搜索；范围留空时等于目标窗口长度。

## 使用

1. 下载或克隆仓库。
2. 使用 Chrome 或 Edge 打开 `K线结构相似度分析工具.html`。
3. 选择包含 `vipdoc` 与 `T0002` 的通达信根目录。
4. 输入股票代码和目标日期，先分析，再选择模式匹配。

目录选择和本地文件访问能力取决于浏览器。推荐使用较新的 Chromium 内核浏览器。

## 隐私

页面不包含 `fetch`、`XMLHttpRequest` 或 WebSocket 网络请求。通达信数据只在本机浏览器中处理。仓库不包含任何行情、权息、账户或通达信配置文件。

## 测试

需要 Node.js 和 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\verify.ps1
```

测试覆盖复权、成交量调整、相似度边界、同期日期对齐、候选分散、Wilson 区间、缓存、近期滑窗、页面接线、脚本语法和无联网策略。

## Cloudflare Workers 部署

仓库包含可复现的 Static Assets 配置。部署副本位于 `public/index.html`，并由测试保证与根目录正式 HTML 完全一致。

```powershell
npm install
npm run dev
npm run deploy
```

也可以在 Cloudflare Dashboard 中连接此 GitHub 仓库，构建命令留空，部署命令使用 `npx wrangler deploy`。自定义域名应在新的 `workers.dev` 预览地址验证通过后再绑定。

## 风险说明

本工具仅用于研究。相似形态和历史统计不构成投资建议，结果仍可能受到幸存者偏差、样本相关、参数选择和数据挖掘偏差影响。

## License

[MIT](LICENSE)
