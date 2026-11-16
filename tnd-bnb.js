/* tnd-bnb.js — engine of bidnobid.html (Bid / No-Bid Decision), tools.petrov.re Tendering & Contracts.
   Pure functions, no DOM, UMD (browser global TndBnb, node require).
   Decision tree with expected value (Raiffa 1968; Clemen 1996 ch. 3–4): net contribution if won M = V·(m − r) − C;
   single gate EV = p2·M − B2; two gates (qualification, then tender) EV = p1·max(p2·M − B2, 0) − B1 (the bidder may withdraw at gate 2).
   Attractiveness scoring and knock-outs follow bid/no-bid practice (Shipley Associates, APMP Body of Knowledge) and are labelled as practice;
   the decision rule combining money, score and knock-outs is a stated policy heuristic with editable thresholds. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TndBnb = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.1.0';
  var GROUPS = ['client', 'capability', 'capacity', 'risk', 'strategy'];
  var DECISIONS = ['bid', 'conditions', 'strategic', 'nobid'];
  var DEF = { go: 65, review: 45, dp: 0.10, dm: 0.02, dB: 0.30, dV: 0.15 };

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function num(x, d) { return isNum(x) ? x : d; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  /* knock-out 'met': only true / 1 / "true" / "1" count as met; false / 0 / "false" / "0" as not met; anything else is unclear and fails safe (not met, flag) */
  var MET_YES = [true, 1, 'true', '1'], MET_NO = [false, 0, 'false', '0'];

  /* normalised copy of the input; fractions (m, r, p1, p2, h, swings) are 0..1 */
  function norm(inp) {
    var i = inp || {}, two = i.procedure === 'two';
    var o = {
      procedure: two ? 'two' : 'single',
      V: Math.max(0, num(i.V, 0)), m: num(i.m, 0), r: num(i.r, 0), C: Math.max(0, num(i.C, 0)), S: Math.max(0, num(i.S, 0)),
      rate: Math.max(0, num(i.rate, 0)), h1: Math.max(0, num(i.h1, 0)), x1: Math.max(0, num(i.x1, 0)), h2: Math.max(0, num(i.h2, 0)), x2: Math.max(0, num(i.x2, 0)),
      p1: two ? clamp(num(i.p1, 1), 0, 1) : 1, p2: clamp(num(i.p2, 0), 0, 1),
      N: isNum(i.N) && i.N >= 1 ? Math.round(i.N) : null, h: isNum(i.h) && i.h > 0 ? clamp(i.h, 0, 1) : null,
      go: clamp(num(i.go, DEF.go), 0, 100), review: clamp(num(i.review, DEF.review), 0, 100), swapped: false,
      dp: Math.max(0, num(i.dp, DEF.dp)), dm: Math.max(0, num(i.dm, DEF.dm)), dB: Math.max(0, num(i.dB, DEF.dB)), dV: Math.max(0, num(i.dV, DEF.dV)),
      criteria: [], ko: []
    };
    /* review must not exceed go: a swapped pair is put back in order and flagged */
    if (o.review > o.go) { var t = o.go; o.go = o.review; o.review = t; o.swapped = true; }
    (Array.isArray(i.criteria) ? i.criteria : []).forEach(function (c, k) {
      if (!c) return;
      o.criteria.push({ id: c.id || 'K' + (k + 1), name: String(c.name == null ? '' : c.name), group: GROUPS.indexOf(c.group) >= 0 ? c.group : 'client',
                        weight: Math.max(0, num(c.weight, 0)), score: clamp(num(c.score, 0), 0, 10) });
    });
    (Array.isArray(i.ko) ? i.ko : []).forEach(function (c, k) {
      if (!c) return;
      var yes = MET_YES.indexOf(c.met) >= 0, no = MET_NO.indexOf(c.met) >= 0;
      o.ko.push({ id: c.id || 'KO' + (k + 1), name: String(c.name == null ? '' : c.name), met: yes, unclear: !yes && !no });
    });
    return o;
  }

  /* the money: decision tree of one or two gates */
  function money(n) {
    var B1 = n.procedure === 'two' ? n.h1 * n.rate + n.x1 : 0, B2 = n.h2 * n.rate + n.x2;
    var p1 = n.p1, p2 = n.p2, M = n.V * (n.m - n.r) - n.C, Mgross = n.V * (n.m - n.r);
    var EV2 = p2 * M - B2;
    var EV = n.procedure === 'two' ? p1 * Math.max(EV2, 0) - B1 : EV2;
    var submit = EV2 >= 0;
    var naive = p1 * p2 * M - B1 - B2;
    /* strategic value S counts only if won; it also enters the decision at gate 2 */
    var EV2s = p2 * (M + n.S) - B2;
    var EVs = n.procedure === 'two' ? p1 * Math.max(EV2s, 0) - B1 : EV2s;
    /* the policy the verdict follows at gate 2: on money, or on money + S for a strategic bid; spend and win chance follow it (withdraw → no tender cost, no win) */
    var go2 = n.procedure !== 'two' ? true : (EV < 0 && EVs >= 0 ? EV2s >= 0 : submit);
    var Pwin = go2 ? p1 * p2 : 0;
    var spend = B1 + (go2 ? p1 * B2 : 0);
    var be = M > 0 && p1 > 0 ? (B2 + B1 / p1) / M : null;          /* breakeven p2 */
    var Sneed = EV >= 0 ? 0 : (p1 > 0 && p2 > 0 ? Math.max(0, (B2 + B1 / p1) / p2 - M) : null);
    return {
      B1: B1, B2: B2, Btot: B1 + B2, M: M, Mgross: Mgross, EV2: EV2, EV: EV, EVs: EVs, submit: submit, go2: go2, Pwin: Pwin, naive: naive,
      EVnoC: n.procedure === 'two' ? p1 * Math.max(p2 * Mgross - B2, 0) - B1 : p2 * Mgross - B2,
      breakeven: be, breakevenOk: be != null && be <= 1, Sneed: Sneed,
      affordableB2: p1 > 0 ? p2 * M - B1 / p1 : null, spend: spend,
      perWin: Pwin > 0 ? spend / Pwin : null, roi: spend > 0 ? Pwin * M / spend : null,
      costPct: n.V > 0 ? (B1 + B2) / n.V : null,
      base: n.N ? 1 / n.N : null
    };
  }
  /* EV for an arbitrary p2 (curve on the stage) */
  function evAt(n, p2) { var c = JSON.parse(JSON.stringify(n)); c.p2 = clamp(p2, 0, 1); return money(c).EV; }

  /* attractiveness score 0..100 and group subtotals */
  function scoring(n) {
    var sw = 0, sws = 0, g = {};
    GROUPS.forEach(function (k) { g[k] = { weight: 0, points: 0, score: null }; });
    n.criteria.forEach(function (c) { sw += c.weight; sws += c.weight * c.score; g[c.group].weight += c.weight; g[c.group].points += c.weight * c.score; });
    GROUPS.forEach(function (k) { var x = g[k]; x.score = x.weight > 0 ? 10 * x.points / x.weight : null; x.share = sw > 0 ? x.weight / sw : 0; });
    var rows = n.criteria.map(function (c) { return { id: c.id, name: c.name, group: c.group, weight: c.weight, score: c.score, weighted: sw > 0 ? 100 * c.weight * c.score / (10 * sw) : 0 }; });
    return { score: sw > 0 ? 100 * sws / (10 * sw) : null, weight: sw, groups: g, rows: rows };
  }

  /* the stated policy: knock-outs, then money, then fit */
  function decide(n, mo, sc) {
    var failed = n.ko.filter(function (k) { return !k.met; }).map(function (k) { return k.id; });
    var s = sc.score;
    if (failed.length) return { decision: 'nobid', reason: 'ko', failed: failed };
    if (mo.EV < 0 && mo.EVs < 0) return { decision: 'nobid', reason: 'money', failed: [] };
    if (mo.EV < 0) return { decision: 'strategic', reason: 'strategic', failed: [] };
    /* no criteria or all weights 0: the fit step cannot be judged — a paying bid goes ahead with conditions, never 'poor fit' */
    if (s == null) return { decision: 'conditions', reason: 'unscored', failed: [] };
    if (s >= n.go) return { decision: 'bid', reason: 'ok', failed: [] };
    if (s >= n.review) return { decision: 'conditions', reason: 'fit', failed: [] };
    return { decision: 'nobid', reason: 'fit', failed: [] };
  }

  /* one-at-a-time swings of the expected value */
  function tornado(n) {
    var base = money(n).EV, out = [];
    function run(id, f) {
      var lo = JSON.parse(JSON.stringify(n)), hi = JSON.parse(JSON.stringify(n));
      f(lo, -1); f(hi, 1);
      var a = money(lo).EV, b = money(hi).EV;
      out.push({ id: id, low: a, high: b, swing: Math.abs(b - a), flips: (a < 0) !== (b < 0) || (a < 0) !== (base < 0) || (b < 0) !== (base < 0) });
    }
    run('p2', function (x, s) { x.p2 = clamp(x.p2 + s * n.dp, 0, 1); });
    if (n.procedure === 'two') run('p1', function (x, s) { x.p1 = clamp(x.p1 + s * n.dp, 0, 1); });
    run('m', function (x, s) { x.m = x.m + s * n.dm; });
    run('V', function (x, s) { x.V = x.V * (1 + s * n.dV); });
    run('B', function (x, s) { var f = 1 + s * n.dB; x.h1 *= f; x.x1 *= f; x.h2 *= f; x.x2 *= f; });
    out.sort(function (a, b) { return b.swing - a.swing || (a.id < b.id ? -1 : 1); });
    return { base: base, bars: out };
  }

  function flags(n, mo) {
    var f = [];
    if (n.N && n.p2 > 2 / n.N) f.push('optimism-base');
    if (n.h && n.p2 > 2 * n.h) f.push('optimism-hit');
    if (mo.M <= 0) f.push('no-margin');
    if (n.procedure === 'two' && !mo.submit) f.push('withdraw');
    if (n.criteria.length && Math.abs(scoringWeight(n) - 100) > 1e-9) f.push('weights');
    if (n.swapped) f.push('thresholds');
    if (n.ko.some(function (k) { return k.unclear; })) f.push('ko-unclear');
    return f;
  }
  function scoringWeight(n) { var s = 0; n.criteria.forEach(function (c) { s += c.weight; }); return s; }

  function analyse(inp) {
    var n = norm(inp);
    var errors = [];
    if (!(n.V > 0)) errors.push('value');
    if (errors.length) return { ok: false, errors: errors, input: n };
    var mo = money(n), sc = scoring(n), d = decide(n, mo, sc), tor = tornado(n);
    return { ok: true, input: n, money: mo, scoring: sc, decision: d.decision, reason: d.reason, failed: d.failed, tornado: tor, flags: flags(n, mo), version: VERSION };
  }
  function curve(inp, pts) {
    var n = norm(inp), out = [], k = pts || 50;
    for (var i = 0; i <= k; i++) out.push([i / k, evAt(n, i / k)]);
    return out;
  }

  /* presets: numbers only; texts live in the page. Each aha is checked in _tnd/bidnobid/test.mjs and the bench. */
  function C10(s) {
    var K = [['rel', 'client', 10], ['comp', 'client', 15], ['tech', 'capability', 15], ['staff', 'capability', 10], ['load', 'capacity', 10],
             ['terms', 'risk', 15], ['pay', 'risk', 10], ['margin', 'risk', 5], ['fit', 'strategy', 5], ['follow', 'strategy', 5]];
    return K.map(function (k, j) { return { id: 'K' + (j + 1), key: k[0], group: k[1], weight: k[2], score: s[j] }; });
  }
  var PRESETS = [
    { id: 'be-school', group: 'be', procedure: 'single', V: 4200000, m: 0.06, r: 0.005, C: 0, S: 0, rate: 85, h1: 0, x1: 0, h2: 320, x2: 6000, p1: 1, p2: 0.18, N: 7, h: 0.15,
      criteria: C10([7, 5, 8, 6, 6, 6, 8, 4, 6, 4]), ko: [{ id: 'KO1', key: 'erkenning', met: true }, { id: 'KO2', key: 'bond', met: true }, { id: 'KO3', key: 'exclusion', met: true }] },
    { id: 'utility-dnb', group: 'be', procedure: 'two', V: 18000000, m: 0.07, r: 0.01, C: 0, S: 0, rate: 95, h1: 120, x1: 3000, h2: 1500, x2: 45000, p1: 0.6, p2: 0.25, N: 5, h: 0.22,
      criteria: C10([7, 6, 8, 7, 6, 6, 8, 6, 8, 7]), ko: [{ id: 'KO1', key: 'refs', met: true }, { id: 'KO2', key: 'bond', met: true }, { id: 'KO3', key: 'exclusion', met: true }] },
    { id: 'epc-fidic', group: 'epc', procedure: 'single', V: 65000000, m: 0.09, r: 0.035, C: 1500000, S: 0, rate: 110, h1: 0, x1: 0, h2: 4500, x2: 180000, p1: 1, p2: 0.30, N: 4, h: 0.25,
      criteria: C10([6, 6, 8, 3, 3, 3, 6, 7, 6, 5]), ko: [{ id: 'KO1', key: 'refs', met: true }, { id: 'KO2', key: 'bond', met: true }, { id: 'KO3', key: 'jv', met: true }] },
    { id: 'equip-rfq', group: 'eq', procedure: 'single', V: 1800000, m: 0.18, r: 0.02, C: 0, S: 0, rate: 75, h1: 0, x1: 0, h2: 140, x2: 1500, p1: 1, p2: 0.25, N: 4, h: 0.3,
      criteria: C10([8, 7, 9, 7, 5, 6, 7, 8, 7, 6]), ko: [{ id: 'KO1', key: 'slot', met: false }, { id: 'KO2', key: 'certs', met: true }, { id: 'KO3', key: 'export', met: true }] },
    { id: 'framework-entry', group: 'epc', procedure: 'single', V: 6000000, m: 0.05, r: 0.01, C: 0, S: 800000, rate: 90, h1: 0, x1: 0, h2: 900, x2: 25000, p1: 1, p2: 0.12, N: 8, h: null,
      criteria: C10([3, 5, 7, 7, 8, 6, 8, 5, 10, 9]), ko: [{ id: 'KO1', key: 'refs', met: true }, { id: 'KO2', key: 'bond', met: true }, { id: 'KO3', key: 'exclusion', met: true }] }
  ];

  return { version: VERSION, GROUPS: GROUPS, DECISIONS: DECISIONS, DEF: DEF, PRESETS: PRESETS,
           norm: norm, money: money, evAt: evAt, scoring: scoring, decide: decide, tornado: tornado, flags: flags, analyse: analyse, curve: curve };
});
