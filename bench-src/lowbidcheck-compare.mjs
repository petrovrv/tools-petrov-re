// Comparator shared by bench-src/run_lowbidcheck.mjs and _tnd/lowbidcheck/cmp.mjs: engine result (TndLowbid.analyse) vs the Python reference.
export const TOL = { rel: 1e-9, abs: 1e-6 };
const close = (g, e) => (g == null && e == null) || (g != null && e != null && Math.abs(g - e) <= Math.max(TOL.abs, TOL.rel * Math.abs(e)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function compareCase(r, e) {
  const bad = [];
  const chk = (name, ok, got, exp) => { if (!ok) bad.push({ name, got, exp }); };
  chk('n', r.stats && r.stats.n === e.n, r.stats && r.stats.n, e.n);
  if (r.stats) for (const k of ['mean', 'median', 'q1', 'q3', 'fence', 'sd']) chk('stats.' + k, close(r.stats[k], e.stats[k]), r.stats[k], e.stats[k]);
  if (e.mode !== undefined) {
    chk('mode', r.mode && r.mode.mode === e.mode, r.mode && r.mode.mode, e.mode);
    chk('reasons', r.mode && same(r.mode.reasons, e.reasons), r.mode && r.mode.reasons, e.reasons);
    chk('threshold', close(r.mode && r.mode.threshold, e.threshold), r.mode && r.mode.threshold, e.threshold);
    chk('art36_mean', close(r.art36 ? r.art36.mean : null, e.art36_mean), r.art36 && r.art36.mean, e.art36_mean);
    chk('limit', close(r.art36 ? r.art36.limit : null, e.limit), r.art36 && r.art36.limit, e.limit);
  }
  for (const id of Object.keys(e.bids)) {
    const g = r.bids.find(b => String(b.id) === id), x = e.bids[id];
    if (!g) { bad.push({ name: 'bid ' + id + ' missing' }); continue; }
    chk(id + '.flag', g.flag === x.flag, g.flag, x.flag);
    if (x.reasons) {
      chk(id + '.reasons', same(g.reasons, x.reasons), g.reasons, x.reasons);
      for (const k of ['devMean', 'devOthers', 'devArt36', 'totalAtMedian', 'gapExplained']) chk(id + '.' + k, close(g[k], x[k]), g[k], x[k]);
      chk(id + '.linesLow', same(g.linesLow, x.linesLow), g.linesLow, x.linesLow);
      chk(id + '.linesHigh', same(g.linesHigh, x.linesHigh), g.linesHigh, x.linesHigh);
    }
  }
  (e.lines || []).forEach((x, i) => {
    const g = r.lines[i];
    if (!g || String(g.id) !== String(x.id)) { bad.push({ name: 'line ' + x.id + ' missing' }); return; }
    chk('line ' + x.id + '.median', close(g.median, x.median), g.median, x.median);
    chk('line ' + x.id + '.share', close(g.share, x.share), g.share, x.share);
    chk('line ' + x.id + '.negligible', g.negligible === x.negligible, g.negligible, x.negligible);
    for (const id of Object.keys(x.flags)) {
      const c = g.cells[id];
      chk('line ' + x.id + '.' + id + '.flag', c && c.flag === x.flags[id], c && c.flag, x.flags[id]);
      chk('line ' + x.id + '.' + id + '.dev', c && close(c.dev, x.devs[id]), c && c.dev, x.devs[id]);
    }
  });
  return { pass: !bad.length, bad };
}
