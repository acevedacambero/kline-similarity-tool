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
  assert.match(html, /alignCommonDates\(refWin,stk\)/);
  assert.match(html, /vols:p\.vols/);
});

test('result protocol contains effective statistical samples', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /statRows/);
  assert.match(html, /wilsonInterval/);
  assert.match(html, /有效n=/);
});

test('quick ranges use loaded trading dates and CSV records algorithm metadata', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /referenceDates/);
  assert.match(html, /权息状态/);
  assert.match(html, /统计样本/);
  assert.match(html, /算法版本/);
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

test('recent mode excludes securities stale by more than 30 reference trading days', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /recentFreshnessCutoff\(refStk\.dates,re,30\)/);
  assert.match(html, /mode==="recent"&&stk\.dates\[n-1\]<recentCutoff/);
});

test('recent mode controls and metadata are wired', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /value="recent"/);
  assert.match(html, /id="recentBars"/);
  assert.match(html, /querySelectorAll\('input\[name=mode\]'\)/);
  assert.match(html, /近期范围/);
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
