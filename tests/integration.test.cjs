const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findHtml } = require('./load-worker.cjs');
const { loadPage } = require('./load-page.cjs');
const HTML_PATH = findHtml();

test('page uses algorithm version ten', () => {
  assert.match(fs.readFileSync(HTML_PATH,'utf8'),/UI_ALGO_VER=10/);
});

test('main page script starts without a runtime exception', () => {
  assert.doesNotThrow(() => loadPage(HTML_PATH));
});

test('matching pipeline uses diversified merge and inner-loop cancellation', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /mergePerStockCandidates\(coarse,10,K_COARSE\)/);
  assert.match(html, /slideChecks%256===0/);
  assert.match(html, /historicalMaxEnd\(stk\.dates,refStartD\)/);
  assert.match(html, /alignCommonDates\(refWin,peerSlice\)/);
  assert.match(html, /vols:p\.vols/);
});

test('peer mode slices dates and advanced presets feed effective matching settings', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /sliceSeriesByDate\(stk,refStartD,refEndD\)/);
  for (const id of ['matchPreset', 'coarseTh', 'coarseLimit', 'dtwLimit', 'dtwBand']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /coarseThreshold:Math\.min/);
  assert.match(html, /settings:\{preset:cfg\.preset\|\|"custom",coarseThreshold,coarseThresholdEffective,K_COARSE,K_DTW,dtwBand\}/);
});

test('UI analysis consumes the canonical worker OHLC series', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /function parseDayLocal\(/);
  assert.match(html, /opens:p\.opens,highs:p\.highs,lows:p\.lows,closes:p\.closes,amounts:p\.amounts/);
  assert.match(html, /const rows=Array\.from\(adj\.dates/);
});

test('TongdaXin is the only local data source and legacy Eastmoney cache is removed', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /id="dataSource"|东方财富|SOURCE==="em"|emReady|scanEmRoot/);
  assert.match(html, /function cleanupLegacyEastmoneyCache\(/);
  assert.match(html, /cleanupLegacyEastmoneyCache\(\)/);
});

test('local benchmark indexes are discovered outside the stock universe', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  assert.match(html,/const INDEX_KEYS=new Set\(\["sh000300","sz399006","sh000688","bj899050"\]\)/);
  assert.match(html,/benchmarks:\[\.\.\.benchmarkFiles\.entries\(\)\]/);
});

test('result UI and CSV expose excess returns and sample maturity', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  for(const marker of ['超额簇级胜率','完整率','中位滞后','基准收益r5','超额收益r5'])assert.ok(html.includes(marker),marker);
});

test('amplitude similarity has a default weight of ten', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  assert.match(html,/id="wAmp" value="10"/);
  assert.match(html,/amp:\+\$\("wAmp"\)\.value/);
});

test('cache maintenance uses the approved count and quota limits', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  assert.match(html,/maxCount:7000/);
  assert.match(html,/quota\s*\*\s*\.2/);
  assert.match(html,/targetRatio:\.9/);
  assert.ok(html.includes('cacheStatus'));
});

test('matching funnel is visible and exportable', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  assert.match(html,/id="funnel"/);
  for(const marker of ['证券','窗口','粗筛','全局','精排','去重','展示'])assert.ok(html.includes(marker),marker);
});

test('placebo baseline is shown with its fixed round count', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  assert.ok(html.includes('随机基线（200轮）'));
});

test('placebo collection stays lightweight and sampling uses partial shuffle', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  assert.doesNotMatch(html,/addPlacebos=.*packStk/);
  assert.match(html,/for\(let i=0;i<k;i\+\+\)/);
});

test('benchmark status explicitly reports missing local indexes', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  assert.ok(html.includes('missingBenchmarkKeys'));
  assert.ok(html.includes('缺少本地指数'));
  assert.ok(html.includes('展示绝对收益'));
});

test('placebo simulation precomputes rankings outside the round loop', () => {
  const html=fs.readFileSync(HTML_PATH,'utf8');
  assert.match(html,/const prepared=preparePlaceboRankings\(matches,pool,horizon,family\)/);
  assert.doesNotMatch(html,/for\(let r=0;r<rounds;r\+\+\)[\s\S]{0,500}rankPlacebos\(/);
});

test('result protocol contains effective statistical samples', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /statRows/);
  assert.match(html, /有效n=/);
  assert.match(html, /skipReasons/);
  assert.match(html, /skipDetails/);
  assert.match(html, /clusterHorizonValues\(statRows,hk,7\)/);
  assert.match(html, /meta\.statSummary\[hk\]/);
  assert.match(html, /独立时段n=/);
});

test('quick ranges use loaded trading dates and CSV records algorithm metadata', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /referenceDates/);
  assert.match(html, /function lastIndexOnOrBefore\(/);
  assert.doesNotMatch(html, /\.findLastIndex\(/);
  assert.match(html, /权息状态/);
  assert.match(html, /统计样本/);
  assert.match(html, /算法版本/);
});

test('empty-result guidance reports the effective coarse threshold', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /meta\.settings\.coarseThresholdEffective\?\?meta\.settings\.coarseThreshold/);
  assert.doesNotMatch(html, /当前要求32点形态余弦>0\.75/);
});

test('coarse scan keeps lightweight candidates and defers full scoring', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /coarse\.push\(\{key,s,e:s\+L-1,coarse:cs,warn:stk\.warn\}\)/);
  assert.match(html, /adaptiveCoarseThreshold\(coarseThreshold,L\)/);
  assert.match(html, /cs>coarseThresholdEffective/);
  assert.doesNotMatch(html, /function pushCand\(/);
});

test('stock files are prefetched concurrently and ST filter uses a Set', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /const PREFETCH=4,inflight=new Map\(\)/);
  assert.match(html, /stSet=new Set\(/);
  assert.match(html, /stSet\.has\(k\)/);
  assert.doesNotMatch(html, /cfg\.stKeys\.includes\(k\)/);
});

test('UI persists preferences and injects build metadata', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /kline_prefs_v1/);
  assert.match(html, /function savePrefs\(/);
  assert.match(html, /function loadPrefs\(/);
  assert.match(html, /id="buildInfo"/);
  assert.doesNotMatch(html, /__KLINE_BUILD_META__/);
  assert.match(html, /URL\.revokeObjectURL\(workerUrl\)/);
  assert.match(html, /id="moBox"/);
});

test('critical HTML controls remain present', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  for (const id of ['dir', 'btnA', 'btnM', 'matchTable', 'workerSrc']) assert.match(html, new RegExp(`id="${id}"`));
});

test('recent mode uses bounded windows and returns actual range', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /mode==="recent"/);
  assert.match(html, /recentWindowStarts\(n,L,cfg\.recentBars,cfg\.step\)/);
  assert.match(html, /recentBars:effectiveRecentBars/);
});

test('recent mode excludes stale securities using timeframe-aware freshness', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /freshnessBars=timeframe==="month"\?2:timeframe==="week"\?6:30/);
  assert.match(html, /recentFreshnessCutoff\(refStk\.dates,re,freshnessBars\)/);
  assert.match(html, /mode==="recent"&&stk\.dates\[n-1\]<recentCutoff/);
});

test('recent mode controls and metadata are wired', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /value="recent"/);
  assert.match(html, /id="recentBars"/);
  assert.match(html, /querySelectorAll\('input\[name=mode\]'\)/);
  assert.match(html, /近期范围/);
});

test('recent mode is first and selected by default', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const radios = [...html.matchAll(/<input type="radio" name="mode" value="(hist|peer|recent)"([^>]*)>/g)];
  assert.deepEqual(radios.map(x => x[1]), ['recent', 'hist', 'peer']);
  assert.deepEqual(radios.filter(x => /\bchecked\b/.test(x[2])).map(x => x[1]), ['recent']);
  assert.match(html, /forEach\(r=>r\.addEventListener\("change",syncModeControls\)\);\s*syncModeControls\(\);/);
});

test('CSV export starts with code and omits ranking values', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /const head=\["代码","名称","开始","结束"/);
  assert.match(html, /lines\.push\(\[r\.key\.slice\(2\),/);
  assert.doesNotMatch(html, /const head=\["排名"/);
  assert.doesNotMatch(html, /lines\.push\(\[i\+1,/);
  assert.match(html, /"粗筛阈值","粗筛候选","DTW候选","DTW带宽","跳过原因"/);
  assert.doesNotMatch(html, /lastStatRows\.includes\(r\)/);
  assert.match(html, /statSampleKeys\.has\(rowKey\(r\)\)/);
});

test('result note exposes the leading rejection reasons', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /Object\.entries\(meta\.skipReasons\|\|\{\}\)/);
  assert.match(html, /主要淘汰：/);
});

test('Cloudflare public entry is identical to the source HTML', () => {
  const publicHtml = path.resolve(__dirname, '..', 'public', 'index.html');
  assert.deepEqual(fs.readFileSync(publicHtml), fs.readFileSync(HTML_PATH));
});

test('Wrangler serves public as a single-page static site', () => {
  const configPath = path.resolve(__dirname, '..', 'wrangler.jsonc');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.name, 'kline-similarity-tool');
  assert.equal(config.assets.directory, './public');
  assert.equal(config.assets.not_found_handling, 'single-page-application');
});

test('browser capability failures are reported before file processing', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /function checkBrowserCapabilities\(/);
  assert.match(html, /Web Worker、Blob 或本地文件读取能力/);
  assert.match(html, /不支持 GBK 证券名称解码/);
});

test('single-file artifacts are generated from a page template and algorithm source', () => {
  const root = path.resolve(__dirname, '..');
  assert.equal(fs.existsSync(path.join(root, 'src', 'page.template.html')), true);
  assert.equal(fs.existsSync(path.join(root, 'src', 'algorithm.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'build.cjs')), true);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.build, 'node scripts/build.cjs');
});

test('IndexedDB cache is read lazily per security', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /function idbGet\(db,key\)/);
  assert.match(html, /DB\?await idbGet\(DB,key\):null/);
  assert.doesNotMatch(html, /function idbLoadAll\(/);
});

test('daily weekly and monthly matching use one canonical timeframe pipeline', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /id="timeframe"/);
  assert.match(html, /<option value="week">周线<\/option>/);
  assert.match(html, /<option value="month">月线<\/option>/);
  assert.match(html, /timeframe:\$\("timeframe"\)\.value/);
  assert.match(html, /aggregateSeries\(refDaily,timeframe,cfg\.d2\)/);
  assert.match(html, /aggregateSeries\(daily,timeframe\)/);
  assert.match(html, /meta:\{mode,timeframe,recentBars/);
});

test('Cloudflare build runs tests and the shared policy gate', () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['build:cf'], /^node scripts\/build\.cjs --stamp && node --test/);
  assert.match(pkg.scripts['build:cf'], /policy-check\.cjs --require-stamp/);
  assert.match(pkg.scripts.test, /^node scripts\/build\.cjs --check/);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'policy-check.cjs')), true);
});

test('legacy cache cleanup is bounded and only runs once', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /kline_em_cache_cleaned_v1/);
  assert.match(html, /IDBKeyRange\.bound\("em:","em:\\uffff"\)/);
});

test('worker replacement settles pending series requests and CSV URLs are revoked', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /function settleSeriesWaiters\(/);
  assert.match(html, /URL\.revokeObjectURL\(csvUrl\)/);
});
