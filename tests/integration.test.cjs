const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findHtml } = require('./load-worker.cjs');
const HTML_PATH = findHtml();

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

test('result protocol contains effective statistical samples', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /statRows/);
  assert.match(html, /wilsonInterval/);
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

test('Eastmoney local data source is selectable and wired end to end', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /id="dataSource"/);
  assert.match(html, /<option value="em">\u4e1c\u65b9\u8d22\u5bcc<\/option>|<option value="em">东方财富<\/option>/);
  assert.match(html, /sqliteScanTable\(buf,"dists_day_bar",9/);
  assert.match(html, /sqliteScanTable\(buf,"dists_instrument",12/);
  assert.match(html, /"em:__meta__"/);
  assert.match(html, /type:"emReady"/);
  assert.match(html, /async function scanEmRoot\(/);
  assert.match(html, /StkQuoteList_V/);
  assert.match(html, /SOURCE==="em"/);
  assert.match(html, /source:"em"/);
  assert.match(html, /emApplyFactors\(/);
});
