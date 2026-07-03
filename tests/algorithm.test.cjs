const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findHtml, loadWorker } = require('./load-worker.cjs');
const HTML = findHtml();
const fixtureBuf = name => {
  const b = fs.readFileSync(path.join(__dirname, 'fixtures', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

test('worker exposes versioned pure algorithm API', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.version, 8);
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
  const series = {
    dates: Int32Array.from([20231229, 20240102]),
    opens: Float64Array.from([9.8, 8.2]), highs: Float64Array.from([10.2, 8.6]), lows: Float64Array.from([9.7, 8.1]),
    closes: Float64Array.from([10, 8.4]), vols: Float64Array.from([1200, 1000])
  };
  api.applyCorporateActions(series, [{ d: 20240102, cash: 0, bonus: 2, rights: 0, rightsPrice: 0 }]);
  assert.ok(Math.abs(series.closes[0] - 10 / 1.2) < 1e-9);
  assert.ok(Math.abs(series.opens[0] - 9.8 / 1.2) < 1e-9);
  assert.ok(Math.abs(series.highs[0] - 10.2 / 1.2) < 1e-9);
  assert.ok(Math.abs(series.lows[0] - 9.7 / 1.2) < 1e-9);
  assert.ok(Math.abs(series.vols[0] - 1440) < 1e-9);
  assert.ok(Math.abs(series.closes[0] * series.vols[0] - 10 * 1200) < 1e-9);
});

test('day parser returns full records and rejects invalid or non-increasing dates', () => {
  const { api } = loadWorker(HTML);
  const buf = new ArrayBuffer(32 * 4);
  const dv = new DataView(buf);
  const put = (i, d, o, h, l, c, amount, v) => {
    const p = i * 32;
    dv.setUint32(p, d, true); dv.setUint32(p + 4, o, true); dv.setUint32(p + 8, h, true);
    dv.setUint32(p + 12, l, true); dv.setUint32(p + 16, c, true); dv.setFloat32(p + 20, amount, true); dv.setUint32(p + 24, v, true);
  };
  put(0, 20260102, 1000, 1100, 900, 1050, 12345, 100);
  put(1, 20260102, 1050, 1150, 1000, 1100, 15000, 120); // duplicate
  put(2, 20251231, 1000, 1100, 900, 1000, 10000, 90);   // descending
  put(3, 20260105, 1100, 1080, 1000, 1050, 18000, 130); // high < open
  const out = api.parseDayBuffer(buf);
  assert.deepEqual(Array.from(out.dates), [20260102]);
  assert.deepEqual(Array.from(out.opens), [10]);
  assert.deepEqual(Array.from(out.highs), [11]);
  assert.deepEqual(Array.from(out.lows), [9]);
  assert.deepEqual(Array.from(out.closes), [10.5]);
  assert.deepEqual(Array.from(out.amounts), [12345]);
  assert.deepEqual(Array.from(out.vols), [100]);
  assert.equal(out.rejected, 3);
});

test('daily series aggregates to canonical weekly and monthly OHLCV bars', () => {
  const { api } = loadWorker(HTML);
  const series = {
    dates: Int32Array.from([20260105, 20260106, 20260109, 20260112, 20260113, 20260116, 20260202]),
    opens: Float64Array.from([10, 11, 12, 13, 14, 15, 16]),
    highs: Float64Array.from([11, 12, 13, 14, 15, 16, 17]),
    lows: Float64Array.from([9, 10, 11, 12, 13, 14, 15]),
    closes: Float64Array.from([10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5]),
    amounts: Float64Array.from([100, 200, 300, 400, 500, 600, 700]),
    vols: Float64Array.from([10, 20, 30, 40, 50, 60, 70])
  };
  const weekly = api.aggregateSeries(series, 'week');
  assert.deepEqual(Array.from(weekly.dates), [20260109, 20260116, 20260202]);
  assert.deepEqual(Array.from(weekly.opens), [10, 13, 16]);
  assert.deepEqual(Array.from(weekly.highs), [13, 16, 17]);
  assert.deepEqual(Array.from(weekly.lows), [9, 12, 15]);
  assert.deepEqual(Array.from(weekly.closes), [12.5, 15.5, 16.5]);
  assert.deepEqual(Array.from(weekly.amounts), [600, 1500, 700]);
  assert.deepEqual(Array.from(weekly.vols), [60, 150, 70]);
  assert.equal(weekly.periods[0], api.periodKey(20260105, 'week'));
  const partial = api.aggregateSeries(series, 'week', 20260113);
  assert.deepEqual(Array.from(partial.dates), [20260109, 20260113]);
  assert.equal(partial.closes[1], 14.5);
  const monthly = api.aggregateSeries(series, 'month');
  assert.deepEqual(Array.from(monthly.dates), [20260116, 20260202]);
  assert.deepEqual(Array.from(monthly.closes), [15.5, 16.5]);
  assert.deepEqual(Array.from(monthly.vols), [210, 70]);
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
  const weeklyA = { dates: [20260109], periods: [100], closes: [10], vols: [1] };
  const weeklyB = { dates: [20260108], periods: [100], closes: [20], vols: [2] };
  const weekly = api.alignCommonDates(weeklyA, weeklyB);
  assert.deepEqual(Array.from(weekly.dates), [20260109]);
  assert.deepEqual(Array.from(weekly.bCloses), [20]);
});

test('date slicing narrows peer data before common-date alignment', () => {
  const { api } = loadWorker(HTML);
  const stk = { dates: Int32Array.from([1, 3, 5, 7, 9]), closes: Float64Array.from([10, 11, 12, 13, 14]), vols: Float64Array.from([1, 2, 3, 4, 5]) };
  const out = api.sliceSeriesByDate(stk, 4, 8);
  assert.deepEqual(Array.from(out.dates), [5, 7]);
  assert.deepEqual(Array.from(out.closes), [12, 13]);
  assert.deepEqual(Array.from(out.vols), [3, 4]);
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

test('cross-stock returns are clustered by nearby market periods', () => {
  const { api } = loadWorker(HTML);
  const rows = [
    { endD: 20260102, fut: { r5: .10 } }, { endD: 20260103, fut: { r5: -.02 } },
    { endD: 20260220, fut: { r5: .03 } }, { endD: 20260221, fut: { r5: null } }
  ];
  assert.deepEqual(Array.from(api.clusterHorizonValues(rows, 'r5', 7)), [.04, .03]);
  const chained = [20260102, 20260107, 20260112].map((endD, i) => ({ endD, fut: { r5: (i + 1) / 100 } }));
  assert.deepEqual(Array.from(api.clusterHorizonValues(chained, 'r5', 7)), [.015, .03]);
  const a = api.bootstrapWinInterval([.04, -.03, .02], 500, 7);
  const b = api.bootstrapWinInterval([.04, -.03, .02], 500, 7);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.ok(a[0] >= 0 && a[1] <= 1 && a[0] <= a[1]);
});

test('cache validity includes algorithm and rights fingerprint', () => {
  const { api } = loadWorker(HTML);
  const rec = { ver: 8, rv: 'abc', size: 32, mtime: 9 };
  assert.equal(api.isCacheValid(rec, { size: 32, lastModified: 9 }, 'abc', 8), true);
  assert.equal(api.isCacheValid(rec, { size: 32, lastModified: 9 }, 'xyz', 8), false);
  assert.equal(api.isCacheValid({ ...rec, ver: 7 }, { size: 32, lastModified: 9 }, 'abc', 8), false);
});

test('recent windows default to L and always include latest window', () => {
  const { api } = loadWorker(HTML);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, null, 3)), [80]);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, 50, 7)), [50, 57, 64, 71, 78, 80]);
  assert.deepEqual(Array.from(api.recentWindowStarts(10, 20, 50, 3)), []);
  assert.deepEqual(Array.from(api.recentWindowStarts(100, 20, 10, 3)), [80]);
});

test('coarse threshold adapts to short weekly/monthly windows', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.adaptiveCoarseThreshold(0.75, 120), 0.75);
  assert.equal(api.adaptiveCoarseThreshold(0.75, 48), 0.75);
  assert.ok(Math.abs(api.adaptiveCoarseThreshold(0.75, 28) - 0.65) < 1e-12);
  assert.ok(Math.abs(api.adaptiveCoarseThreshold(0.75, 8) - 0.60) < 1e-12);
  assert.equal(api.adaptiveCoarseThreshold(0.35, 8), 0.3);
});

test('recent mode freshness cutoff is 30 reference trading days before target end', () => {
  const { api } = loadWorker(HTML);
  const dates = Int32Array.from(Array.from({ length: 50 }, (_, i) => 20260001 + i));
  assert.equal(api.recentFreshnessCutoff(dates, 49), dates[19]);
  assert.equal(api.recentFreshnessCutoff(dates, 20), dates[0]);
  assert.equal(api.recentFreshnessCutoff(dates, 49, 10), dates[39]);
});

test('pure-JS SQLite reader scans EM tables with column early-stop', () => {
  const { api } = loadWorker(HTML);
  const rows = [];
  api.sqliteScanTable(fixtureBuf('em_day_bar.dat'), 'dists_day_bar', 9, v => rows.push(v));
  assert.equal(rows.length, 7);
  const r = rows.find(v => v[0] === 'SHSE.600001' && v[1] === '2026-01-05');
  assert.deepEqual([r[3], r[4], r[5], r[6], r[7], r[8]], [10, 11, 9.5, 10.5, 1000, 10500]);
  const inst = [];
  api.sqliteScanTable(fixtureBuf('em_instrument.dat'), 'dists_instrument', 12, v => inst.push(v));
  assert.equal(inst.length, 6);
  const i7 = inst.find(v => v[0] === 'SHSE.600001' && v[1] === '2026-01-07');
  assert.equal(i7[12], 2.2);
  const st = inst.find(v => v[0] === 'SZSE.000010' && v[1] === '2026-01-06');
  assert.equal(st[3], 1);
  assert.throws(() => api.sqliteScanTable(fixtureBuf('em_day_bar.dat'), 'no_such_table', null, () => {}));
});

test('EM symbol/date mapping and first-seen GBK name parsing', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.emSymKey('SHSE.600001'), 'sh600001');
  assert.equal(api.emSymKey('SZSE.000010'), 'sz000010');
  assert.equal(api.emSymKey('BKBK.900001'), null);
  assert.equal(api.emSymKey('SHSE.60000A'), null);
  assert.equal(api.emDateInt('2026-01-05'), 20260105);
  const bufs = ['em_names_0.dat', 'em_names_1.dat'].map(n => new Uint8Array(fixtureBuf(n)));
  const names = api.parseEmNames(bufs);
  assert.equal(names['600001'], '测试银行');
  assert.equal(names['000010'], 'ST测试');
});

test('EM adj_factor forward adjustment keeps price*volume invariant', () => {
  const { api } = loadWorker(HTML);
  const rec = {
    dates: Int32Array.from([20260105, 20260106, 20260107, 20260108]),
    opens: Float64Array.from([10, 10.5, 11, 10]),
    highs: Float64Array.from([11, 12, 11.5, 10.6]),
    lows: Float64Array.from([9.5, 10.4, 10, 9.9]),
    closes: Float64Array.from([10.5, 11, 10, 10.4]),
    vols: Float64Array.from([1000, 2000, 3000, 1500])
  };
  const events = api.emApplyFactors(rec, [20260105, 20260107], [2.0, 2.2]);
  assert.equal(events, 1);
  const r = 2.0 / 2.2;
  assert.ok(Math.abs(rec.closes[0] - 10.5 * r) < 1e-12);
  assert.ok(Math.abs(rec.vols[0] - 1000 / r) < 1e-9);
  assert.ok(Math.abs(rec.closes[0] * rec.vols[0] - 10.5 * 1000) < 1e-6);
  assert.equal(rec.closes[2], 10);
  assert.equal(rec.vols[3], 1500);
  assert.equal(api.emApplyFactors(rec, [], []), 0);
});

test('EM series sorter fixes out-of-order and duplicate bars', () => {
  const { api } = loadWorker(HTML);
  const a = { d: [20260106, 20260105, 20260106], o: [2, 1, 3], h: [2, 1, 3], l: [2, 1, 3], c: [2, 1, 3], am: [2, 1, 3], v: [2, 1, 3] };
  const out = api.emSortSeries(a);
  assert.deepEqual(Array.from(out.d), [20260105, 20260106]);
  assert.deepEqual(Array.from(out.c), [1, 3]);
});

test('EM worker pipeline: files -> emReady -> adjusted series end to end', async () => {
  const { self, messages } = loadWorker(HTML);
  const fakeFile = name => ({
    name, size: 1, lastModified: 1,
    arrayBuffer: async () => fixtureBuf(name)
  });
  await self.onmessage({ data: { type: 'files', source: 'em',
    emDayBar: [fakeFile('em_day_bar.dat')],
    emInstrument: [fakeFile('em_instrument.dat')],
    emNames: [fakeFile('em_names_0.dat'), fakeFile('em_names_1.dat')] } });
  const ready = messages.find(m => m.type === 'emReady');
  assert.ok(ready, 'emReady missing: ' + JSON.stringify(messages.map(m => m.type)));
  assert.equal(ready.error, undefined);
  assert.deepEqual(Array.from(ready.keys), ['sh600001', 'sz000010']);
  assert.equal(ready.names['600001'], '测试银行');
  assert.deepEqual(Array.from(ready.stKeys), ['sz000010']);
  await self.onmessage({ data: { type: 'series', reqId: 7, key: 'sh600001', timeframe: 'day' } });
  const ser = messages.find(m => m.type === 'series' && m.reqId === 7);
  assert.ok(ser && !ser.error, ser && ser.error);
  assert.deepEqual(Array.from(ser.dates), [20260105, 20260106, 20260107, 20260108]);
  const r = 2.0 / 2.2;
  assert.ok(Math.abs(ser.closes[0] - 10.5 * r) < 1e-9);
  assert.ok(Math.abs(ser.vols[0] - 1000 / r) < 1e-6);
  assert.equal(ser.closes[2], 10);
  assert.equal(ser.qStatus, 'qfq');
  assert.equal(ser.qEvents, 1);
});
