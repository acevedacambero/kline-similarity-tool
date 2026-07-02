# K线算法模块重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构单文件 K 线工具的算法模块，修正复权、匹配候选与统计口径，并建立可重复运行的回归测试。

**Architecture:** 保持 `D:\tdx\K线结构相似度分析工具.html` 为唯一运行产物；Worker 内算法改造成边界清晰的纯函数，并在测试环境通过 `self.__KLINE_TEST_API__` 暴露。Node 测试提取 Worker 文本后在 `vm` 沙箱中执行，不引入第三方依赖。

**Tech Stack:** HTML5、浏览器 Web Worker、IndexedDB、JavaScript、Node.js `node:test` / `assert` / `vm`。

---

## 文件映射

- 修改：`D:\tdx\K线结构相似度分析工具.html` — 页面、Worker、算法与运行时交付物。
- 创建：`D:\AIAPP\tests\kline\load-worker.cjs` — 从 HTML 提取并加载 Worker 测试接口。
- 创建：`D:\AIAPP\tests\kline\algorithm.test.cjs` — 纯算法、复权、候选和统计回归测试。
- 创建：`D:\AIAPP\tests\kline\integration.test.cjs` — Worker 消息、HTML 完整性和缓存行为测试。
- 创建：`D:\AIAPP\tests\kline\verify.ps1` — 一键执行测试及脚本语法检查。
- 创建：`D:\AIAPP\backups\K线结构相似度分析工具.before-refactor.html` — 原始文件恢复点。

由于相关目录没有 Git 仓库，每个阶段用 `Copy-Item` 生成备份，并用 `Get-FileHash` 记录校验值，不执行 Git 提交。

### Task 1: 建立测试夹具与基线

**Files:**
- Create: `D:\AIAPP\tests\kline\load-worker.cjs`
- Create: `D:\AIAPP\tests\kline\algorithm.test.cjs`
- Create: `D:\AIAPP\backups\K线结构相似度分析工具.before-refactor.html`

- [ ] **Step 1: 保存原文件与 SHA256**

```powershell
Copy-Item -LiteralPath 'D:\tdx\K线结构相似度分析工具.html' -Destination 'D:\AIAPP\backups\K线结构相似度分析工具.before-refactor.html'
Get-FileHash 'D:\AIAPP\backups\K线结构相似度分析工具.before-refactor.html' -Algorithm SHA256
```

- [ ] **Step 2: 创建 Worker 加载器**

加载器读取 HTML，提取 `workerSrc`，在提供 `self`、TypedArray、`atob`、`indexedDB` 占位对象的 `vm` 上下文中运行，并返回 `self.__KLINE_TEST_API__`。

```js
const fs = require('node:fs');
const vm = require('node:vm');
function loadWorker(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script id="workerSrc"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('workerSrc not found');
  const self = { postMessage() {}, onmessage: null };
  const context = vm.createContext({ self, postMessage: self.postMessage, console,
    setTimeout, clearTimeout, Map, Array, Object, Math, Date, Promise,
    ArrayBuffer, DataView, Uint8Array, Int32Array, Float64Array,
    atob: s => Buffer.from(s, 'base64').toString('binary'), indexedDB: { open() { throw new Error('disabled in unit tests'); } } });
  vm.runInContext(match[1], context, { filename: 'workerSrc.js' });
  return { api: self.__KLINE_TEST_API__, self, context };
}
module.exports = { loadWorker };
```

- [ ] **Step 3: 写第一个失败测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./load-worker.cjs');
const HTML = 'D:\\tdx\\K线结构相似度分析工具.html';
test('worker exposes versioned pure algorithm API', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.version, 5);
  assert.equal(typeof api.parseDayBuffer, 'function');
  assert.equal(typeof api.applyCorporateActions, 'function');
});
```

- [ ] **Step 4: 运行并确认 RED**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: FAIL，原因是 `__KLINE_TEST_API__` 尚不存在。

### Task 2: 数据解析与权息状态

**Files:**
- Modify: `D:\tdx\K线结构相似度分析工具.html`
- Modify: `D:\AIAPP\tests\kline\algorithm.test.cjs`

- [ ] **Step 1: 增加失败测试**

测试构造两条32字节 `.day` 记录，断言正常解析；另断言31字节截断尾部被忽略、日期或 OHLC 非法记录被拒绝。测试 `resolveRightsState(null)` 为 `raw`、空 Map 为 `error`、含有效事件的 Map 为 `valid`。

```js
assert.deepEqual(api.resolveRightsState(null), { status: 'raw', reason: 'missing', count: 0 });
assert.equal(api.resolveRightsState(new Map()).status, 'error');
assert.equal(api.resolveRightsState(new Map([['000001', [{ d: 20240101, cash: 1, bonus: 0, rights: 0, rightsPrice: 0 }]]])).status, 'valid');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: FAIL，缺少解析及状态接口。

- [ ] **Step 3: 实现最小纯函数接口**

新增 `parseDayBuffer(buf)`、`resolveRightsState(rights, decodeError)`；将 `ALGO_VER` 提升为5。Worker 初始化时保存 `{status, reason, count}`，序列消息返回该状态，不再用文件时间戳推断复权成功。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: 全部 PASS。

- [ ] **Step 5: 保存阶段备份与哈希**

```powershell
Copy-Item 'D:\tdx\K线结构相似度分析工具.html' 'D:\AIAPP\backups\K线结构相似度分析工具.stage2.html'
Get-FileHash 'D:\AIAPP\backups\K线结构相似度分析工具.stage2.html' -Algorithm SHA256
```

### Task 3: 价格与成交量复权

**Files:**
- Modify: `D:\tdx\K线结构相似度分析工具.html`
- Modify: `D:\AIAPP\tests\kline\algorithm.test.cjs`

- [ ] **Step 1: 写现金分红、送股和配股失败测试**

构造除权日前收盘10元、除权日数据，测试理论除权因子：

```js
const cash = api.corporateActionFactor(10, { cash: 1, bonus: 0, rights: 0, rightsPrice: 0 });
assert.equal(cash.priceFactor, 0.99);
assert.equal(cash.volumeFactor, 1);
const bonus = api.corporateActionFactor(10, { cash: 0, bonus: 2, rights: 0, rightsPrice: 0 });
assert.ok(Math.abs(bonus.priceFactor - 1 / 1.2) < 1e-12);
assert.equal(bonus.volumeFactor, 1.2);
```

组合事件测试使用公式 `(prev-cash/10+rightsPrice*rights/10)/(prev*(1+bonus/10+rights/10))`，并断言历史成交量除以股本扩张倍数。

- [ ] **Step 2: 运行并确认 RED**

Expected: FAIL，缺少 `corporateActionFactor` 或成交量未变化。

- [ ] **Step 3: 实现复权**

实现 `corporateActionFactor` 与 `applyCorporateActions(series, events)`；价格向历史方向累计乘 `priceFactor`，历史成交量累计除以 `volumeFactor`，纯现金分红保持成交量不变。替换原 `parseDayQfq` 内联逻辑。

- [ ] **Step 4: 运行全部算法测试并确认 GREEN**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: 全部 PASS。

### Task 4: 相似度特征与同期日期对齐

**Files:**
- Modify: `D:\tdx\K线结构相似度分析工具.html`
- Modify: `D:\AIAPP\tests\kline\algorithm.test.cjs`

- [ ] **Step 1: 写失败测试**

断言相同序列余弦为1、反向序列截断为0、相同序列 DTW 为0、常量序列不会产生 NaN；ZigZag 对空序列和单点序列返回稳定结果。构造参考日期 `[1,2,3,4]` 与候选日期 `[1,3,4]`，断言 `alignCommonDates` 只返回日期 `[1,3,4]` 和一一对应的价格/成交量。

- [ ] **Step 2: 运行并确认 RED**

Expected: FAIL，缺少 `alignCommonDates` 或边界条件不满足。

- [ ] **Step 3: 实现统一特征管线**

新增 `safeZscore`、`alignCommonDates`、`extractFeatures`；历史与同期模式都调用 `extractFeatures`。同期模式只使用共同日期数组，不再以首尾索引构造错位连续切片。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: 全部 PASS，且结果不含 NaN/Infinity。

### Task 5: 分散候选池、防前视和响应式取消

**Files:**
- Modify: `D:\tdx\K线结构相似度分析工具.html`
- Modify: `D:\AIAPP\tests\kline\algorithm.test.cjs`

- [ ] **Step 1: 写候选失败测试**

构造A股20个高分窗口、B股3个次高分窗口；断言 `mergePerStockCandidates(..., localLimit=3)` 合并结果包含A、B两股。断言 `historicalMaxEnd` 返回严格早于参考开始日期的最后索引。断言取消探针在滑窗迭代指定次数后抛出 `CancelledError`。

- [ ] **Step 2: 运行并确认 RED**

Expected: FAIL，缺少局部池和滑窗取消接口。

- [ ] **Step 3: 实现候选管线**

每只股票维护最多10个局部候选并先做70%重叠去重，再按基础分合并、裁剪全市场候选。历史边界统一由 `lastIdxBefore(refStartD)-1` 计算。滑窗每256次检查 `cancelled`，并 `await new Promise(resolve => setTimeout(resolve, 0))` 让出执行权。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: 全部 PASS。

### Task 6: 独立样本与 Wilson 统计

**Files:**
- Modify: `D:\tdx\K线结构相似度分析工具.html`
- Modify: `D:\AIAPP\tests\kline\algorithm.test.cjs`

- [ ] **Step 1: 写统计失败测试**

断言同股票重叠超过70%的两个窗口只保留高分者，不同股票均保留；断言 `wilsonInterval(0,0)` 返回空区间，`wilsonInterval(5,10)` 约为 `[0.2366,0.7634]`，大样本区间更窄。

- [ ] **Step 2: 运行并确认 RED**

Expected: FAIL，缺少聚类或 Wilson 接口。

- [ ] **Step 3: 实现并接入 UI**

实现 `dedupeStatSamples(rows, 0.7)`、`wilsonInterval(wins,n,1.96)`；Worker 同时返回 `rows` 与 `statRows`。统计卡展示 `展示n`、`有效n`、Wilson 上下界和中位数。风险提示增加重叠、相关性与数据挖掘偏差。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: 全部 PASS。

### Task 7: 交易日快捷区间、缓存和 CSV

**Files:**
- Modify: `D:\tdx\K线结构相似度分析工具.html`
- Modify: `D:\AIAPP\tests\kline\integration.test.cjs`

- [ ] **Step 1: 写集成失败测试**

从 HTML 主脚本提取并断言存在 `dateByTradingBars`；以交易日期 `[20260102,20260105,20260106]` 测试回推2日得到 `20260105`。断言缓存记录只有版本、行情大小/mtime、权息指纹全部一致时命中；CSV 表头含 `权息状态`、`统计样本`、`算法版本`。

- [ ] **Step 2: 运行并确认 RED**

Run: `node --test D:\AIAPP\tests\kline\integration.test.cjs`

Expected: FAIL，缺少交易日接口或新 CSV 字段。

- [ ] **Step 3: 实现交互与缓存升级**

分析参考股票后保存完整交易日期；快捷按钮按结束日索引回退 `n-1` 根，不足时取首日。未分析参考股票时保留自然日估算并显示“近似区间”提示。缓存命中统一调用 `isCacheValid(record, file, rightsFingerprint, ALGO_VER)`；权息错误状态不写入复权缓存。CSV 写入新字段。

- [ ] **Step 4: 运行并确认 GREEN**

Run: `node --test D:\AIAPP\tests\kline\integration.test.cjs`

Expected: 全部 PASS。

### Task 8: Worker 消息与最终验证

**Files:**
- Create: `D:\AIAPP\tests\kline\verify.ps1`
- Modify: `D:\AIAPP\tests\kline\integration.test.cjs`
- Modify: `D:\tdx\K线结构相似度分析工具.html`

- [ ] **Step 1: 写 Worker 消息失败测试**

模拟 `files`、`series`、`match`、`cancel` 消息，断言权息失败只发送一致的 `rightsStatus:error`，series 返回相同状态，cancel 最终发送 `cancelled`，错误路径发送结构化错误消息。

- [ ] **Step 2: 运行并确认 RED**

Run: `node --test D:\AIAPP\tests\kline\integration.test.cjs`

Expected: FAIL，旧 Worker 会产生状态不一致或缺少结构化字段。

- [ ] **Step 3: 统一消息协议并补充一键验证脚本**

`verify.ps1` 必须：运行两个测试文件；提取三个 `<script>` 块并用 `node --check -` 检查 Worker 与主脚本；检查 HTML 包含 `dir`、`btnA`、`btnM`、`matchTable`、`workerSrc`；比较备份与当前文件确保修改目标唯一。

- [ ] **Step 4: 运行完整验证**

Run: `powershell -ExecutionPolicy Bypass -File D:\AIAPP\tests\kline\verify.ps1`

Expected: 所有 Node 测试通过，Worker/Main 语法检查退出码为0，HTML 关键元素检查通过。

- [ ] **Step 5: 保存最终备份与 SHA256**

```powershell
Copy-Item 'D:\tdx\K线结构相似度分析工具.html' 'D:\AIAPP\backups\K线结构相似度分析工具.refactored.html'
Get-FileHash 'D:\tdx\K线结构相似度分析工具.html','D:\AIAPP\backups\K线结构相似度分析工具.refactored.html' -Algorithm SHA256
```

两份哈希必须一致。

## 最终规格核对

- 复权状态由有效解密结果决定：Task 2、3、8。
- 价格与成交量复权：Task 3。
- 特征边界和同期对齐：Task 4。
- 分散候选、防前视、取消：Task 5。
- 去重样本和 Wilson 区间：Task 6。
- 交易日快捷按钮、缓存和 CSV：Task 7。
- Worker 协议、语法与完整回归：Task 8。
