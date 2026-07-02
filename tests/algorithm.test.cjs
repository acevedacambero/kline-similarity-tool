const test = require('node:test');
const assert = require('node:assert/strict');
const { findHtml, loadWorker } = require('./load-worker.cjs');
const HTML = findHtml();

test('worker exposes versioned pure algorithm API', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.version, 5);
  assert.equal(typeof api.parseDayBuffer, 'function');
  assert.equal(typeof api.applyCorporateActions, 'function');
});

test('rights state requires valid decoded records', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.resolveRightsState(null).status, 'raw');
  assert.equal(api.resolveRightsState(new Map()).status, 'error');
  assert.equal(api.resolveRightsState(new Map([['000001', [{ d: 20240101 }]]])).status, 'valid');
  assert.equal(api.resolveRightsState(new Map(), new Error('bad')).reason, 'bad');
});

test('corporate actions adjust price and share-changing volume', () => {
  const { api } = loadWorker(HTML);
  const cash = api.corporateActionFactor(10, { cash: 1, bonus: 0, rights: 0, rightsPrice: 0 });
  assert.ok(Math.abs(cash.priceFactor - 0.99) < 1e-12);
  assert.equal(cash.volumeFactor, 1);
  const bonus = api.corporateActionFactor(10, { cash: 0, bonus: 2, rights: 0, rightsPrice: 0 });
  assert.ok(Math.abs(bonus.priceFactor - 1 / 1.2) < 1e-12);
  assert.equal(bonus.volumeFactor, 1.2);
  const series = { dates: Int32Array.from([20231229, 20240102]), closes: Float64Array.from([10, 8.4]), vols: Float64Array.from([1200, 1000]) };
  api.applyCorporateActions(series, [{ d: 20240102, cash: 0, bonus: 2, rights: 0, rightsPrice: 0 }]);
  assert.ok(Math.abs(series.closes[0] - 10 / 1.2) < 1e-9);
  assert.ok(Math.abs(series.vols[0] - 1000) < 1e-9);
});

test('similarity primitives are stable on edge cases', () => {
  const { api } = loadWorker(HTML);
  assert.deepEqual(Array.from(api.zscore([3, 3, 3])), [0, 0, 0]);
  assert.ok(Math.abs(api.cosine([1, 2], [1, 2]) - 1) < 1e-12);
  assert.equal(api.dtwDist([1, 2, 3], [1, 2, 3], 1), 0);
  assert.deepEqual(Array.from(api.zigAmps([], 0.08)), []);
});

test('common-date alignment never uses positional slices', () => {
  const { api } = loadWorker(HTML);
  const a = { dates: [1, 2, 3, 4], closes: [10, 11, 12, 13], vols: [1, 2, 3, 4] };
  const b = { dates: [1, 3, 4], closes: [20, 22, 23], vols: [5, 7, 8] };
  const out = api.alignCommonDates(a, b);
  assert.deepEqual(Array.from(out.dates), [1, 3, 4]);
  assert.deepEqual(Array.from(out.aCloses), [10, 12, 13]);
  assert.deepEqual(Array.from(out.bCloses), [20, 22, 23]);
});

test('candidate merge is diversified and overlap is deduplicated', () => {
  const { api } = loadWorker(HTML);
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => ({ key: 'A', s: i * 100, e: i * 100 + 19, score: 1 - i / 100 })),
    { key: 'B', s: 0, e: 19, score: 0.8 },
    { key: 'B', s: 2, e: 21, score: 0.7 }
  ];
  const merged = api.mergePerStockCandidates(rows, 3, 20);
  assert.deepEqual([...new Set(merged.map(x => x.key))].sort(), ['A', 'B']);
  assert.equal(api.dedupeOverlaps(rows.filter(x => x.key === 'B'), 0.7, 20).length, 1);
  assert.equal(api.historicalMaxEnd([1, 2, 5, 9], 5), 1);
});

test('Wilson interval handles empty and small samples', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.wilsonInterval(0, 0), null);
  const [lo, hi] = api.wilsonInterval(5, 10);
  assert.ok(Math.abs(lo - 0.2366) < 0.001);
  assert.ok(Math.abs(hi - 0.7634) < 0.001);
});

test('cache validity includes algorithm and rights fingerprint', () => {
  const { api } = loadWorker(HTML);
  const rec = { ver: 5, rv: 'abc', size: 32, mtime: 9 };
  assert.equal(api.isCacheValid(rec, { size: 32, lastModified: 9 }, 'abc', 5), true);
  assert.equal(api.isCacheValid(rec, { size: 32, lastModified: 9 }, 'xyz', 5), false);
});

test('recent windows default to L and always include latest window', () => {
  const { api } = loadWorker(HTML);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, null, 3)), [80]);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, 50, 7)), [50, 57, 64, 71, 78, 80]);
  assert.deepEqual(Array.from(api.recentWindowStarts(10, 20, 50, 3)), []);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, 10, 3)), [80]);
});

test('recent mode freshness cutoff is 30 reference trading days before target end', () => {
  const { api } = loadWorker(HTML);
  const dates = Int32Array.from(Array.from({ length: 50 }, (_, i) => 20260001 + i));
  assert.equal(api.recentFreshnessCutoff(dates, 49), dates[19]);
  assert.equal(api.recentFreshnessCutoff(dates, 20), dates[0]);
  assert.equal(api.recentFreshnessCutoff(dates, 49, 10), dates[39]);
});
