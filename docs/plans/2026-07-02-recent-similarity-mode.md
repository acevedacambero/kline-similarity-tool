# 近期相似区间模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 K线结构相似度分析工具增加可调近期交易日范围的第三种匹配模式。

**Architecture:** 在 Worker 增加纯函数 `recentWindowStarts` 统一计算近期滑窗边界，并让 `runMatch` 的近期分支复用历史模式的粗筛、特征评分和精排管线。主线程只负责模式控件、近期范围配置、提示、元数据和 CSV。

**Tech Stack:** HTML5、JavaScript、Web Worker、Node.js `node:test`。

---

## 文件

- 修改：`D:\tdx\K线结构相似度分析工具.html`
- 修改：`D:\AIAPP\tests\kline\algorithm.test.cjs`
- 修改：`D:\AIAPP\tests\kline\integration.test.cjs`
- 使用：`D:\AIAPP\tests\kline\verify.ps1`
- 创建备份：`D:\AIAPP\backups\K线结构相似度分析工具.before-recent-mode.html`

### Task 1: 近期滑窗纯算法

**Files:**
- Modify: `D:\AIAPP\tests\kline\algorithm.test.cjs`
- Modify: `D:\tdx\K线结构相似度分析工具.html`

- [ ] **Step 1: 保存当前版本备份和哈希**

```powershell
Copy-Item 'D:\tdx\K线结构相似度分析工具.html' 'D:\AIAPP\backups\K线结构相似度分析工具.before-recent-mode.html'
Get-FileHash 'D:\AIAPP\backups\K线结构相似度分析工具.before-recent-mode.html' -Algorithm SHA256
```

- [ ] **Step 2: 写失败测试**

```js
test('recent windows default to L and always include latest window', () => {
  const { api } = loadWorker(HTML);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, null, 3)), [80]);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, 50, 7)), [50,57,64,71,78,80]);
  assert.deepEqual(Array.from(api.recentWindowStarts(10, 20, 50, 3)), []);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, 10, 3)), [80]);
});
```

- [ ] **Step 3: 运行测试确认 RED**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: FAIL，`recentWindowStarts` 不存在。

- [ ] **Step 4: 实现纯函数并导出**

```js
function recentWindowStarts(n,L,recentBars,step){
  if(n<L)return [];
  const N=Math.max(L,Number.isFinite(recentBars)?Math.floor(recentBars):L);
  const first=Math.max(0,n-N),last=n-L,out=[];
  for(let s=first;s<=last;s+=Math.max(1,step||1))out.push(s);
  if(out[out.length-1]!==last)out.push(last);
  return out;
}
```

将函数加入 `self.__KLINE_TEST_API__`。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs`

Expected: 全部通过。

### Task 2: Worker 近期匹配管线

**Files:**
- Modify: `D:\AIAPP\tests\kline\integration.test.cjs`
- Modify: `D:\tdx\K线结构相似度分析工具.html`

- [ ] **Step 1: 写 Worker 接入失败测试**

```js
test('recent mode uses bounded windows and returns actual range', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /mode==="recent"/);
  assert.match(html, /recentWindowStarts\(n,L,cfg\.recentBars,cfg\.step\)/);
  assert.match(html, /recentBars:effectiveRecentBars/);
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `node --test D:\AIAPP\tests\kline\integration.test.cjs`

Expected: FAIL，近期分支尚不存在。

- [ ] **Step 3: 接入 `runMatch`**

计算 `effectiveRecentBars=Math.max(L,cfg.recentBars||L)`。近期分支使用 `recentWindowStarts` 产生起点，复用历史分支的32点粗筛、`subScores`、候选分散及DTW精排。目标证券候选与参考区间重叠超过70%时跳过。`meta` 返回 `recentBars:effectiveRecentBars`。

- [ ] **Step 4: 验证近期与原模式**

Run: `node --test D:\AIAPP\tests\kline\algorithm.test.cjs D:\AIAPP\tests\kline\integration.test.cjs`

Expected: 全部通过。

### Task 3: 页面控件、提示和 CSV

**Files:**
- Modify: `D:\AIAPP\tests\kline\integration.test.cjs`
- Modify: `D:\tdx\K线结构相似度分析工具.html`

- [ ] **Step 1: 写 UI 失败测试**

```js
test('recent mode controls and metadata are wired', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /value="recent"/);
  assert.match(html, /id="recentBars"/);
  assert.match(html, /name="mode".*change/);
  assert.match(html, /近期范围/);
});
```

- [ ] **Step 2: 运行确认 RED**

Expected: FAIL，页面没有第三模式和范围输入。

- [ ] **Step 3: 实现页面行为**

增加单选项和数字输入，空值传 `null`，数字限制15至5000。模式变化时：近期模式禁用防前视并显示说明；历史模式恢复用户此前选择；同期模式禁用无关防前视。标题显示实际近期范围，风险提示说明其不等价于历史回测。CSV 增加 `模式` 和 `近期范围` 两列。

- [ ] **Step 4: 运行集成测试确认 GREEN**

Run: `node --test D:\AIAPP\tests\kline\integration.test.cjs`

Expected: 全部通过。

### Task 4: 完整验证与交付备份

**Files:**
- Use: `D:\AIAPP\tests\kline\verify.ps1`
- Create: `D:\AIAPP\backups\K线结构相似度分析工具.with-recent-mode.html`

- [ ] **Step 1: 执行完整验证**

Run: `powershell -ExecutionPolicy Bypass -File D:\AIAPP\tests\kline\verify.ps1`

Expected: 全部测试通过；Worker/Main语法、关键控件和无联网策略通过。

- [ ] **Step 2: 保存最终备份并核对哈希**

```powershell
Copy-Item 'D:\tdx\K线结构相似度分析工具.html' 'D:\AIAPP\backups\K线结构相似度分析工具.with-recent-mode.html'
Get-FileHash 'D:\tdx\K线结构相似度分析工具.html','D:\AIAPP\backups\K线结构相似度分析工具.with-recent-mode.html' -Algorithm SHA256
```

Expected: 两份 SHA256 完全一致。

## 规格覆盖检查

- 自动/自定义范围、最小窗口、最新窗口：Task 1。
- Worker近期搜索、自身重叠排除、元数据：Task 2。
- 模式控件、防前视状态、提示、CSV：Task 3。
- 原模式回归和最终交付：Task 4。
