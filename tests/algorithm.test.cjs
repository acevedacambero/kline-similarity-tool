const test = require('node:test');
const assert = require('node:assert/strict');
const { findHtml, loadWorker } = require('./load-worker.cjs');
const HTML = findHtml();

test('worker exposes versioned pure algorithm API', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.version, 10);
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
  const benchmark={dates:Int32Array.from([20260105,20260107,20260109]),closes:Float64Array.from([100,102,105])};
  assert.ok(Math.abs(api.benchmarkReturn(benchmark,20260106,20260110)-.05)<1e-12);
  assert.equal(api.benchmarkReturn(benchmark,20250101,20260110),null);
});

test('excess return uses compounded subtraction and preserves missing benchmarks', () => {
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

test('amplitude similarity is symmetric and neutral for invalid scales', () => {
  const { api } = loadWorker(HTML);
  assert.ok(Math.abs(api.ratioSimilarity(2,1)-api.ratioSimilarity(1,2))<1e-12);
  assert.equal(api.ratioSimilarity(0,1),.5);
  assert.equal(api.amplitudeSimilarity({sd:.02,range:.10},{sd:.02,range:.10}),1);
});

test('cache eviction removes stale versions then least-recently-used records', () => {
  const { api } = loadWorker(HTML);
  const records=[
    {key:'a',ver:8,lastAccess:9,bytes:10},
    {key:'b',ver:10,lastAccess:1,bytes:10},
    {key:'c',ver:10,lastAccess:2,bytes:10}
  ];
  assert.deepEqual(Array.from(api.selectCacheEvictions(records,{ver:10,maxCount:3,maxBytes:25,targetRatio:.9})),['a']);
  assert.deepEqual(Array.from(api.selectCacheEvictions(records.slice(1),{ver:10,maxCount:1,maxBytes:25,targetRatio:.9})),['b']);
});

test('rights diagnostics reject sparse, invalid and implausible records', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.validateRightsDiagnostics({validEvents:99,codes:30,invalid:0,candidates:99}).status,'error');
  assert.equal(api.validateRightsDiagnostics({validEvents:100,codes:29,invalid:0,candidates:100}).status,'error');
  assert.equal(api.validateRightsDiagnostics({validEvents:100,codes:30,invalid:12,candidates:112}).status,'error');
  assert.equal(api.validateRightsDiagnostics({validEvents:100,codes:30,invalid:11,candidates:111}).status,'valid');
});

test('rights continuity rejects material worsening and allows insufficient samples', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.validateContinuity([{raw:.04,adjusted:.08},{raw:.03,adjusted:.07},{raw:.02,adjusted:.06},{raw:.03,adjusted:.07},{raw:.02,adjusted:.06}]).status,'error');
  assert.equal(api.validateContinuity([{raw:.04,adjusted:.01}]).status,'unchecked');
});

test('funnel stages are monotonic after coarse screening', () => {
  const { api } = loadWorker(HTML);
  const f=api.normalizeFunnel({stocks:100,windows:10000,coarsePassed:800,globalKept:500,refined:480,dtw:20,deduped:60,shown:50});
  assert.deepEqual(JSON.parse(JSON.stringify(f)),{stocks:100,windows:10000,coarsePassed:800,globalKept:500,refined:480,dtw:20,deduped:60,shown:50});
  assert.throws(()=>api.normalizeFunnel({stocks:1,windows:10,coarsePassed:11,globalKept:1,refined:1,dtw:1,deduped:1,shown:1}));
});

test('placebo window sampling is deterministic and capped per stock', () => {
  const { api } = loadWorker(HTML);
  const starts=Array.from({length:40},(_,i)=>i);
  assert.deepEqual(Array.from(api.samplePlaceboStarts('sh600000',starts,8,20260703)),Array.from(api.samplePlaceboStarts('sh600000',starts,8,20260703)));
  assert.equal(api.samplePlaceboStarts('sh600000',starts,8,20260703).length,8);
});

test('placebo matching prioritizes board then date and volatility', () => {
  const { api } = loadWorker(HTML);
  const target={key:'sh600000',board:'main',endD:20260110,sd:.02};
  const pool=[{key:'sz300001',board:'cyb',endD:20260110,sd:.02,id:'wrong-board'},{key:'sh600001',board:'main',endD:20260109,sd:.08,id:'near-date'},{key:'sh600002',board:'main',endD:20260109,sd:.021,id:'best'}];
  assert.equal(api.rankPlacebos(target,pool)[0].id,'best');
});

test('matched placebo summary is reproducible for a fixed seed', () => {
  const { api } = loadWorker(HTML);
  const matches=[{key:'sh600000',board:'main',endD:20260110,sd:.02,excess:{r5:.03}}];
  const pool=[{id:'p1',key:'sh600001',board:'main',endD:20260110,sd:.02,excess:{r5:.01}}];
  assert.deepEqual(JSON.parse(JSON.stringify(api.placeboSummary(matches,pool,'r5',200,20260703))),JSON.parse(JSON.stringify(api.placeboSummary(matches,pool,'r5',200,20260703))));
});

test('forward returns computes stock benchmark excess and lag without display arrays', () => {
  const { api } = loadWorker(HTML);
  const stk={dates:Int32Array.from(Array.from({length:70},(_,i)=>20260101+i)),closes:Float64Array.from(Array.from({length:70},(_,i)=>100+i))};
  const benchmark={dates:stk.dates,closes:Float64Array.from(Array.from({length:70},(_,i)=>200+i))};
  const out=api.forwardReturns(stk,0,benchmark);
  assert.ok(Math.abs(out.fut.r5-.05)<1e-12);
  assert.ok(Math.abs(out.benchmark.r5-.025)<1e-12);
  assert.ok(Math.abs(out.excess.r5-(1.05/1.025-1))<1e-12);
  assert.equal(out.lagBars.r5,69);
  assert.equal('win' in out,false);
});

test('cache write-back keeps only touched records that survive eviction', () => {
  const { api } = loadWorker(HTML);
  const records=[{key:'a'},{key:'b'},{key:'c'}];
  assert.deepEqual(Array.from(api.cacheWriteBackKeys(records,new Set(['a','b']),new Set(['b']))),['a']);
});

test('return family falls back to absolute returns when excess is unavailable', () => {
  const { api } = loadWorker(HTML);
  assert.equal(api.selectReturnFamily([{fut:{r5:.1},excess:{r5:null}}],'r5'),'fut');
  assert.equal(api.selectReturnFamily([{fut:{r5:.1},excess:{r5:.03}}],'r5'),'excess');
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

test('period alignment returns candidate indices when weekly closing dates differ', () => {
  const { api } = loadWorker(HTML);
  const a = { dates: Int32Array.from([20260109, 20260116]), periods: Int32Array.from([20461, 20468]), closes: Float64Array.from([1, 2]), vols: Float64Array.from([10, 20]) };
  const b = { dates: Int32Array.from([20260108, 20260116]), periods: Int32Array.from([20461, 20468]), closes: Float64Array.from([3, 4]), vols: Float64Array.from([30, 40]) };
  const out = api.alignCommonDates(a, b);
  assert.deepEqual(Array.from(out.bIndices), [0, 1]);
  assert.deepEqual(Array.from(out.bDates), [20260108, 20260116]);
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
