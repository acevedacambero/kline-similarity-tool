# Statistical Validity and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add benchmark-relative returns, a reproducible matched-placebo baseline, recent-sample maturity, amplitude scoring, bounded caching, stronger `gbbq` validation, and a visible matching funnel while preserving the offline single-HTML product.

**Architecture:** Keep the existing source template plus embedded Worker architecture. Add pure functions to `src/algorithm.js`, pass index files and storage quota through the existing Worker protocol, and render only summarized metadata in `src/page.template.html`. Every behavior change is introduced test-first and the generated root/public HTML files are rebuilt only from source.

**Tech Stack:** Vanilla JavaScript, Web Worker, IndexedDB, File System Access API, Canvas/DOM, Node.js built-in test runner, Cloudflare Static Assets.

---

## File map

- `src/algorithm.js`: benchmark alignment, excess returns, placebo sampling, maturity statistics, amplitude score, cache eviction, rights diagnostics, funnel counters.
- `src/page.template.html`: index-file discovery, new controls, Worker configuration, result/funnel/statistics rendering, CSV fields and warnings.
- `tests/algorithm.test.cjs`: pure-function and Worker-level regression tests.
- `tests/integration.test.cjs`: generated HTML, controls, protocol, local-only and export assertions.
- `tests/load-worker.cjs`: Worker test context additions for storage quota when required.
- `tests/load-page.cjs`: page test context additions for new controls and storage calls.
- `README.md`: explain benchmarks, placebo statistics, degradation behavior and cache limits.
- `K线结构相似度分析工具.html`, `public/index.html`: generated artifacts; never edit manually.

### Task 1: Discover local benchmark indexes and align benchmark returns

**Files:**
- Modify: `src/page.template.html:158-290`
- Modify: `src/algorithm.js:120-270`
- Test: `tests/algorithm.test.cjs`
- Test: `tests/integration.test.cjs`

- [ ] **Step 1: Write failing pure-function tests for benchmark mapping and date alignment**

Add tests that require these exported APIs:

```js
test('board benchmark mapping uses the approved local indexes', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.benchmarkKeyFor('sh600000'), 'sh000300');
  assert.equal(api.benchmarkKeyFor('sz000001'), 'sh000300');
  assert.equal(api.benchmarkKeyFor('sz300001'), 'sz399006');
  assert.equal(api.benchmarkKeyFor('sh688001'), 'sh000688');
  assert.equal(api.benchmarkKeyFor('bj899001'), 'bj899050');
  assert.equal(api.benchmarkKeyFor('sh510300'), 'sh000300');
});

test('benchmark return aligns each endpoint to the nearest prior date', () => {
  const { api } = loadWorker(HTML);
  const benchmark = {
    dates: Int32Array.from([20260105, 20260107, 20260109]),
    closes: Float64Array.from([100, 102, 105])
  };
  const out = api.benchmarkReturn(benchmark, 20260106, 20260110);
  assert.ok(Math.abs(out - .05) < 1e-12);
  assert.equal(api.benchmarkReturn(benchmark, 20250101, 20260110), null);
});
```

- [ ] **Step 2: Run the targeted tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="benchmark" tests/algorithm.test.cjs
```

Expected: FAIL because `benchmarkKeyFor` and `benchmarkReturn` are not exported.

- [ ] **Step 3: Implement board mapping and benchmark alignment**

Add pure functions near `normalizeTimeframe`:

```js
function boardOfKey(key){
  const mkt=key.slice(0,2),c=key.slice(2);
  if(mkt==="bj")return "bj";
  if(c.startsWith("68"))return "kcb";
  if(c.startsWith("30"))return "cyb";
  if(mkt==="sh"&&/^(51|56|58)/.test(c)||mkt==="sz"&&/^(15|16)/.test(c))return "etf";
  if(mkt==="sh"&&c.startsWith("60")||mkt==="sz"&&c.startsWith("00"))return "main";
  return null;
}
function benchmarkKeyFor(key){
  return {main:"sh000300",cyb:"sz399006",kcb:"sh000688",bj:"bj899050",etf:"sh000300"}[boardOfKey(key)]||null;
}
function indexOnOrBefore(dates,d){
  let lo=0,hi=dates.length-1,ans=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(dates[m]<=d){ans=m;lo=m+1}else hi=m-1}
  return ans;
}
function benchmarkReturn(series,startD,endD){
  if(!series)return null;
  const s=indexOnOrBefore(series.dates,startD),e=indexOnOrBefore(series.dates,endD);
  return s<0||e<=s||series.closes[s]<=0||series.closes[e]<=0?null:series.closes[e]/series.closes[s]-1;
}
```

Export the four functions in `__KLINE_TEST_API__`.

- [ ] **Step 4: Add failing integration assertions for index discovery**

Require the page to define `INDEX_KEYS`, keep index files outside `files`, and send them as `benchmarks`:

```js
assert.match(html, /const INDEX_KEYS=new Set\(\["sh000300","sz399006","sh000688","bj899050"\]\)/);
assert.match(html, /benchmarks:\[\.\.\.benchmarkFiles\.entries\(\)\]/);
```

Run:

```powershell
node --test --test-name-pattern="benchmark|index discovery" tests/integration.test.cjs
```

Expected: FAIL because the page only collects `A_PREFIX` securities.

- [ ] **Step 5: Implement index discovery and Worker loading**

In the page state add `benchmarkFiles=new Map()` and:

```js
const INDEX_KEYS=new Set(["sh000300","sz399006","sh000688","bj899050"]);
```

When scanning `.day` files, place matching index keys in `benchmarkFiles` before applying `A_PREFIX`. Send `benchmarks:[...benchmarkFiles.entries()]` in the `files` message. In the Worker add `BENCHMARK_FILES` and `BENCHMARKS`, parse each benchmark with `parseDayBuffer`, and keep it outside `FILES`.

- [ ] **Step 6: Build and run benchmark tests**

```powershell
node scripts/build.cjs
node --test --test-name-pattern="benchmark|index discovery" tests/algorithm.test.cjs tests/integration.test.cjs
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/algorithm.js src/page.template.html tests/algorithm.test.cjs tests/integration.test.cjs 'K线结构相似度分析工具.html' public/index.html
git commit -m "增加本地指数基准读取"
```

### Task 2: Compute absolute, benchmark and excess returns plus sample maturity

**Files:**
- Modify: `src/algorithm.js:245-620`
- Modify: `src/page.template.html:585-740`
- Test: `tests/algorithm.test.cjs`
- Test: `tests/integration.test.cjs`

- [ ] **Step 1: Write failing tests for excess returns and maturity**

```js
test('excess return uses log-return subtraction and preserves missing benchmarks', () => {
  const { api } = loadWorker(HTML);
  assert.ok(Math.abs(api.excessReturn(.10,.04) - (1.10/1.04-1)) < 1e-12);
  assert.equal(api.excessReturn(.10,null), null);
});

test('horizon summary reports completeness and median lag bars', () => {
  const { api } = loadWorker(HTML);
  const rows=[
    {endD:20260101,fut:{r5:.1},excess:{r5:.05},lagBars:{r5:8}},
    {endD:20260102,fut:{r5:null},excess:{r5:null},lagBars:{r5:null}},
    {endD:20260120,fut:{r5:.2},excess:{r5:.12},lagBars:{r5:12}}
  ];
  const s=api.summarizeHorizon(rows,'r5');
  assert.equal(s.totalN,3);
  assert.equal(s.rawN,2);
  assert.equal(s.completeRate,2/3);
  assert.equal(s.medianLagBars,10);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test --test-name-pattern="excess return|maturity|horizon summary" tests/algorithm.test.cjs
```

Expected: FAIL because the APIs do not exist.

- [ ] **Step 3: Implement return and maturity helpers**

```js
function excessReturn(stockReturn,indexReturn){
  return Number.isFinite(stockReturn)&&Number.isFinite(indexReturn)?(1+stockReturn)/(1+indexReturn)-1:null;
}
function medianOf(values){
  if(!values.length)return null;
  const a=[...values].sort((x,y)=>x-y),m=a.length>>1;
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function summarizeHorizon(rows,horizon){
  const valid=rows.filter(r=>Number.isFinite(r.fut?.[horizon]));
  const excess=rows.filter(r=>Number.isFinite(r.excess?.[horizon]));
  const lags=valid.map(r=>r.lagBars?.[horizon]).filter(Number.isFinite);
  return {totalN:rows.length,rawN:valid.length,excessN:excess.length,missingN:rows.length-valid.length,
    completeRate:rows.length?valid.length/rows.length:0,medianLagBars:medianOf(lags)};
}
```

Extend `packStk(stk,s,e,benchmark)` so each horizon stores `fut`, `benchmark`, `excess`, and `lagBars`; the lag for a valid horizon is `stk.dates.length-1-e`.

- [ ] **Step 4: Integrate benchmark series into final rows and summaries**

When packing a candidate, resolve `benchmarkKeyFor(key)`, aggregate its series to the active timeframe, and calculate benchmark returns using the candidate's actual end and future endpoint dates. Merge `summarizeHorizon` with existing cluster/bootstrap fields in `statSummary`.

- [ ] **Step 5: Add UI and CSV assertions, then implement rendering**

Add failing assertions for `超额胜率`, `完整率`, `中位滞后`, `基准收益`, and `超额收益`. Update the four horizon cards to default to excess statistics when `excessN>0`, show absolute-only degradation otherwise, and export the three return families.

- [ ] **Step 6: Build and run Task 2 tests**

```powershell
node scripts/build.cjs
node --test --test-name-pattern="excess|maturity|完整率|基准收益" tests/algorithm.test.cjs tests/integration.test.cjs
```

Expected: selected tests PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/algorithm.js src/page.template.html tests/algorithm.test.cjs tests/integration.test.cjs 'K线结构相似度分析工具.html' public/index.html
git commit -m "增加超额收益与样本成熟度"
```

### Task 3: Add deterministic matched-placebo baseline

**Files:**
- Modify: `src/algorithm.js:400-590`
- Modify: `src/page.template.html:585-625`
- Test: `tests/algorithm.test.cjs`
- Test: `tests/integration.test.cjs`

- [ ] **Step 1: Write failing tests for deterministic sampling and matching**

```js
test('placebo window sampling is deterministic and capped per stock', () => {
  const { api } = loadWorker(HTML);
  const starts=Array.from({length:40},(_,i)=>i);
  assert.deepEqual(api.samplePlaceboStarts('sh600000',starts,8,20260703),api.samplePlaceboStarts('sh600000',starts,8,20260703));
  assert.equal(api.samplePlaceboStarts('sh600000',starts,8,20260703).length,8);
});

test('placebo matching prioritizes board then date and volatility', () => {
  const { api } = loadWorker(HTML);
  const target={key:'sh600000',board:'main',endD:20260110,sd:.02};
  const pool=[
    {key:'sz300001',board:'cyb',endD:20260110,sd:.02,id:'wrong-board'},
    {key:'sh600001',board:'main',endD:20260109,sd:.08,id:'near-date'},
    {key:'sh600002',board:'main',endD:20260109,sd:.021,id:'best'}
  ];
  assert.equal(api.rankPlacebos(target,pool)[0].id,'best');
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test --test-name-pattern="placebo" tests/algorithm.test.cjs
```

Expected: FAIL because placebo helpers do not exist.

- [ ] **Step 3: Implement deterministic sampling and ranking**

Use xorshift32 seeded by a stable hash of `key + seed`, Fisher-Yates shuffle a copy of starts, and take at most eight. Implement ranking as lexicographic `[boardMismatch, abs(dateOrdinal difference), abs(log sd ratio), key, endD]`, excluding the target security.

- [ ] **Step 4: Collect compact placebo records during scan**

For each stock, derive legal starts using the active mode rules, sample at most eight, and store compact records containing `id,key,board,timeframe,startD,endD,sd,fut,benchmark,excess,lagBars`. Do not require shape coarse-screen success.

- [ ] **Step 5: Write failing tests for 200-round reproducible summaries**

```js
test('matched placebo summary is reproducible for a fixed seed', () => {
  const { api } = loadWorker(HTML);
  const matches=[{key:'sh600000',board:'main',endD:20260110,sd:.02,excess:{r5:.03}}];
  const pool=[{id:'p1',key:'sh600001',board:'main',endD:20260110,sd:.02,excess:{r5:.01}}];
  assert.deepEqual(api.placeboSummary(matches,pool,'r5',200,20260703),api.placeboSummary(matches,pool,'r5',200,20260703));
});
```

- [ ] **Step 6: Implement and render placebo summaries**

Each round must avoid duplicate placebo IDs, report actual paired count, and calculate placebo win rate, median excess return, match-minus-placebo differences, and the proportion of rounds where the match statistic is greater. Add a compact “随机基线” card and export summary metadata to CSV.

- [ ] **Step 7: Build, run and commit Task 3**

```powershell
node scripts/build.cjs
node --test --test-name-pattern="placebo|随机基线" tests/algorithm.test.cjs tests/integration.test.cjs
git add src/algorithm.js src/page.template.html tests/algorithm.test.cjs tests/integration.test.cjs 'K线结构相似度分析工具.html' public/index.html
git commit -m "增加配对随机窗口基线"
```

### Task 4: Add amplitude similarity as an adjustable score

**Files:**
- Modify: `src/algorithm.js:185-330,365-570`
- Modify: `src/page.template.html:95-115,295-335,525-740`
- Test: `tests/algorithm.test.cjs`
- Test: `tests/integration.test.cjs`

- [ ] **Step 1: Write failing amplitude-score tests**

```js
test('amplitude similarity is symmetric and neutral for invalid scales', () => {
  const { api } = loadWorker(HTML);
  assert.ok(Math.abs(api.ratioSimilarity(2,1)-api.ratioSimilarity(1,2))<1e-12);
  assert.equal(api.ratioSimilarity(0,1),.5);
  assert.equal(api.amplitudeSimilarity({sd:.02,range:.10},{sd:.02,range:.10}),1);
});
```

- [ ] **Step 2: Verify RED and implement the pure functions**

```js
function ratioSimilarity(a,b){return a>0&&b>0?Math.exp(-Math.abs(Math.log(a/b))):.5}
function amplitudeSimilarity(a,b){return .7*ratioSimilarity(a.sd,b.sd)+.3*ratioSimilarity(a.range,b.range)}
```

Extend `windowStats` with `range = max(log close)-min(log close)`, add `amp` in `subScores`, and include `W.amp` in score normalization.

- [ ] **Step 3: Add the weight control and metadata**

Add `<input id="wAmp" value="10">`, include it in `PREF_IDS`, the Worker configuration, result table, CSV and regression assertions. Setting zero must remove its contribution without changing score range.

- [ ] **Step 4: Build, test and commit Task 4**

```powershell
node scripts/build.cjs
node --test --test-name-pattern="amplitude|wAmp|幅度" tests/algorithm.test.cjs tests/integration.test.cjs
git add src/algorithm.js src/page.template.html tests/algorithm.test.cjs tests/integration.test.cjs 'K线结构相似度分析工具.html' public/index.html
git commit -m "增加幅度相似度评分"
```

### Task 5: Bound IndexedDB cache by count, quota and LRU batch

**Files:**
- Modify: `src/algorithm.js:268-307,350-590`
- Modify: `src/page.template.html:172-190,275-290`
- Modify: `tests/load-worker.cjs`
- Test: `tests/algorithm.test.cjs`
- Test: `tests/integration.test.cjs`

- [ ] **Step 1: Write failing tests for deterministic eviction selection**

```js
test('cache eviction removes stale versions then least-recently-used records', () => {
  const { api } = loadWorker(HTML);
  const records=[
    {key:'a',ver:8,lastAccess:9,bytes:10},
    {key:'b',ver:10,lastAccess:1,bytes:10},
    {key:'c',ver:10,lastAccess:2,bytes:10}
  ];
  assert.deepEqual(api.selectCacheEvictions(records,{ver:10,maxCount:3,maxBytes:25,targetRatio:.9}),['a']);
  assert.deepEqual(api.selectCacheEvictions(records.slice(1),{ver:10,maxCount:1,maxBytes:25,targetRatio:.9}),['b']);
});
```

- [ ] **Step 2: Verify RED and implement byte accounting plus selection**

Estimate record bytes as the sum of ArrayBuffer byte lengths plus 256 metadata bytes. `selectCacheEvictions` must sort version mismatches first, then ascending `lastAccess`, and stop once both target count and target bytes are met. Target count is `Math.max(1,Math.floor(maxCount*targetRatio))`.

- [ ] **Step 3: Upgrade the database schema safely**

Open `kline_tool_v2` at version2 in the Worker. Preserve the `stocks` store and add a `meta` store keyed by `key`. Change page-side legacy cleanup to open the database without an explicit version so it cannot downgrade or race the Worker upgrade.

- [ ] **Step 4: Batch cache touches and run maintenance after completed matches**

Collect hit keys in `CACHE_TOUCHES`, assign one incremented batch number per match, and update touched records in one transaction. Query `navigator.storage.estimate()` inside the Worker when available, derive `maxBytes=quota*.2`, select evictions, delete in one transaction, and post a non-fatal `cacheStatus` message.

- [ ] **Step 5: Add integration tests for fallback and warnings**

Require the Worker to use `maxCount:7000`, `targetRatio:.9`, quota20%, and the page to render cache maintenance warnings without aborting results.

- [ ] **Step 6: Build, test and commit Task 5**

```powershell
node scripts/build.cjs
node --test --test-name-pattern="cache|IndexedDB|quota|LRU" tests/algorithm.test.cjs tests/integration.test.cjs
git add src/algorithm.js src/page.template.html tests/load-worker.cjs tests/algorithm.test.cjs tests/integration.test.cjs 'K线结构相似度分析工具.html' public/index.html
git commit -m "限制本地行情缓存容量"
```

### Task 6: Strengthen gbbq structural and continuity validation

**Files:**
- Modify: `src/algorithm.js:75-185,328-340`
- Modify: `src/page.template.html:558-570,715-735`
- Test: `tests/algorithm.test.cjs`
- Test: `tests/integration.test.cjs`

- [ ] **Step 1: Write failing structural-diagnostic tests**

```js
test('rights diagnostics reject sparse, invalid and implausible records', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.validateRightsDiagnostics({validEvents:99,codes:30,invalid:0,candidates:99}).status,'error');
  assert.equal(api.validateRightsDiagnostics({validEvents:100,codes:29,invalid:0,candidates:100}).status,'error');
  assert.equal(api.validateRightsDiagnostics({validEvents:100,codes:30,invalid:12,candidates:112}).status,'error');
  assert.equal(api.validateRightsDiagnostics({validEvents:100,codes:30,invalid:11,candidates:111}).status,'valid');
});
```

- [ ] **Step 2: Refactor decoding to return records plus diagnostics**

Return `{rights,diagnostics}` from `decodeGbbq`. Count candidate category-1 records before validation, invalid dates/codes/parameters, valid events and unique codes. Apply the exact bounds from the design document and return explicit Chinese failure reasons.

- [ ] **Step 3: Write failing continuity tests**

```js
test('rights continuity rejects material worsening and allows insufficient samples', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.validateContinuity([{raw:.04,adjusted:.08},{raw:.03,adjusted:.07},{raw:.02,adjusted:.06},{raw:.03,adjusted:.07},{raw:.02,adjusted:.06}]).status,'error');
  assert.equal(api.validateContinuity([{raw:.04,adjusted:.01}]).status,'unchecked');
});
```

- [ ] **Step 4: Implement a maximum-50-event continuity sample**

For locally available securities, find the closes immediately before and on/after each event, compute raw and adjusted absolute log gaps, and validate at least five samples. Reject if adjusted median exceeds raw median by more than `.03` or adjusted p90 exceeds raw p90 by more than `.10`.

- [ ] **Step 5: Integrate global degradation and UI/CSV reasons**

Only set `RIGHTS_STATE.status="valid"` after structural and continuity checks. On failure clear `RIGHTS`, use raw prices globally, and include `rightsReason` and `continuityStatus` in UI and CSV. “unchecked” continuity is allowed but visible.

- [ ] **Step 6: Build, test and commit Task 6**

```powershell
node scripts/build.cjs
node --test --test-name-pattern="rights|gbbq|continuity|权息" tests/algorithm.test.cjs tests/integration.test.cjs
git add src/algorithm.js src/page.template.html tests/algorithm.test.cjs tests/integration.test.cjs 'K线结构相似度分析工具.html' public/index.html
git commit -m "强化通达信权息数据自检"
```

### Task 7: Expose the complete matching funnel

**Files:**
- Modify: `src/algorithm.js:410-590`
- Modify: `src/page.template.html:130-145,575-670`
- Test: `tests/algorithm.test.cjs`
- Test: `tests/integration.test.cjs`

- [ ] **Step 1: Write a failing funnel-conservation test**

```js
test('funnel stages are monotonic after coarse screening', () => {
  const { api } = loadWorker(HTML);
  const f=api.normalizeFunnel({stocks:100,windows:10000,coarsePassed:800,globalKept:500,refined:480,dtw:20,deduped:60,shown:50});
  assert.deepEqual(f,{stocks:100,windows:10000,coarsePassed:800,globalKept:500,refined:480,dtw:20,deduped:60,shown:50});
  assert.throws(()=>api.normalizeFunnel({stocks:1,windows:10,coarsePassed:11,globalKept:1,refined:1,dtw:1,deduped:1,shown:1}));
});
```

- [ ] **Step 2: Implement counters at exact pipeline boundaries**

Increment `windows` for every legal compared window and `coarsePassed` for every threshold pass before the per-stock top10 cap. Capture counts after diversified global merge, successful refinement, DTW selection, per-stock overlap dedupe, and final top-N truncation. Validate `dtw<=refined` independently because DTW is a reranked subset, while dedupe still considers every refined candidate; therefore `deduped` may exceed `dtw`. Send the current funnel in progress messages and the complete funnel in result metadata.

- [ ] **Step 3: Render a compact funnel and threshold hints**

Add `<div id="funnel"></div>` to the result panel. Render:

```text
证券 5,234 → 窗口 812,430 → 粗筛 4,120 → 全局 600 → 精排 586（其中DTW重排200）→ 去重 71 → 展示 50
```

If `coarsePassed/windows < .001`, suggest lowering the threshold; if greater than `.20`, suggest raising it. Do not modify controls automatically.

- [ ] **Step 4: Add CSV funnel metadata and integration assertions**

Export each funnel count as metadata columns and verify every named stage appears in generated HTML.

- [ ] **Step 5: Build, test and commit Task 7**

```powershell
node scripts/build.cjs
node --test --test-name-pattern="funnel|漏斗|粗筛" tests/algorithm.test.cjs tests/integration.test.cjs
git add src/algorithm.js src/page.template.html tests/algorithm.test.cjs tests/integration.test.cjs 'K线结构相似度分析工具.html' public/index.html
git commit -m "展示匹配数量漏斗"
```

### Task 8: Version, documentation and complete regression verification

**Files:**
- Modify: `src/algorithm.js:1-3`
- Modify: `src/page.template.html:155-160`
- Modify: `README.md`
- Modify: `tests/algorithm.test.cjs`
- Modify: `tests/integration.test.cjs`
- Generated: `K线结构相似度分析工具.html`
- Generated: `public/index.html`

- [ ] **Step 1: Write the failing version assertion**

Change the algorithm test to expect version10 and add an integration assertion that `UI_ALGO_VER=10`.

Run:

```powershell
node scripts/build.cjs
node --test --test-name-pattern="version" tests/algorithm.test.cjs tests/integration.test.cjs
```

Expected: FAIL with version9.

- [ ] **Step 2: Bump both versions and document behavior**

Set `ALGO_VER=10` and `UI_ALGO_VER=10`. Update README with benchmark files, excess-return definitions, placebo interpretation, maturity fields, amplitude weight, cache limits, rights degradation and funnel meanings.

- [ ] **Step 3: Run the complete build and verification suite**

```powershell
node scripts/build.cjs
node "$env:USERPROFILE\.local\nodejs\node_modules\npm\bin\npm-cli.js" test
node "$env:USERPROFILE\.local\nodejs\node_modules\npm\bin\npm-cli.js" audit --json
git diff --check
```

Expected: all Node tests PASS, `POLICY_OK` appears, audit reports zero vulnerabilities, and `git diff --check` prints nothing.

- [ ] **Step 4: Inspect generated invariants**

```powershell
rg -n "ALGO_VER=10|超额收益|随机基线|完整率|wAmp|funnel|cacheStatus|continuityStatus" src K线结构相似度分析工具.html public/index.html
node scripts/build.cjs --check
```

Expected: all feature markers appear and generated artifacts are current.

- [ ] **Step 5: Commit Task 8**

```powershell
git add src/algorithm.js src/page.template.html README.md tests/algorithm.test.cjs tests/integration.test.cjs 'K线结构相似度分析工具.html' public/index.html
git commit -m "发布统计有效性增强版本"
```

- [ ] **Step 6: Prepare review handoff**

```powershell
git status -sb
git log --oneline --max-count=10
```

Expected: clean feature branch with the design commit, plan commit and eight implementation commits ready for code review and publication.
