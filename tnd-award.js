/* tnd-award.js — engine of awardcriteria.html (Award Criteria & Price Scoring Designer), tools.petrov.re Tendering & Contracts.
   Pure functions, no DOM, UMD (browser global TndAward, node require). Methods 1–6 are the price formulas of TndCore.score (same definitions,
   cross-checked in _tnd/awardcriteria/test.mjs); 7 "absolute" (fixed anchors stated in the procurement documents) and 8 "monetised"
   (quality converted into a fictitious discount on the price) are the two methods whose ranking does not depend on the other bids.
   Points: price weight W and quality weights w_i are points of a total (normally 100). Price score s in 0..1, price points = W·s.
   Formulas are methods of practice, not rules of law: the documents must state the criteria and their weighting (Dir. 2014/24/EU art. 67(5),
   Wet 17.06.2016 art. 81 §4); the evaluation method must not alter them (CJEU C-6/15 TNS Dimarso, 14.07.2016). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TndAward = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.1.0';
  var METHOD_IDS = ['proportional', 'linear_zero', 'linear_pct', 'interpolation', 'mean_relative', 'floor', 'absolute', 'monetised'];
  /* methods whose ranking cannot change when another bid is added or removed (with absolute quality scoring) */
  var INDEPENDENT = { absolute: true, monetised: true };
  var MEAN_BASED = { mean_relative: true, floor: true };
  var TIE_ORDER = ['absolute', 'monetised', 'proportional', 'linear_zero', 'linear_pct', 'floor', 'mean_relative', 'interpolation'];
  var DEF = { zeroFactor: 2, slope: 2, slopeMean: 1, floorFactor: 0.85, lo: 0.8, hi: 1.3 };
  var PENALTY = { reversal: 40, dependent: 15, zero: 15, mean: 10, outside: 20, refOff: 30 };
  /* reference price plausibility band (× median bid): outside it the absolute anchors / monetised value of quality no longer fit the bids */
  var REF_BAND = [0.5, 2];
  /* two scores closer than this (relative to max(1,|score|)) are a tie */
  var TIE_TOL = 1e-9;

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function num(x, d) { return isNum(x) ? x : d; }

  /* statistics of the price set that the relative formulas read */
  function priceStats(prices) {
    var v = prices.filter(function (x) { return isNum(x) && x > 0; });
    if (!v.length) return null;
    var s = 0; v.forEach(function (x) { s += x; });
    return { min: Math.min.apply(null, v), max: Math.max.apply(null, v), mean: s / v.length, n: v.length };
  }
  /* anchors of the absolute method and the value of full quality of the monetised method */
  function refOf(inp) {
    var r = inp.ref || {}, P = isNum(r.price) && r.price > 0 ? r.price : null;
    var lo = num(r.lo, DEF.lo), hi = num(r.hi, DEF.hi);
    var qw = qualityWeight(inp), W = num(inp.W, 0);
    var V = isNum(r.V) && r.V >= 0 ? r.V : (P && W > 0 ? P * qw / W : null);
    return { price: P, lo: lo, hi: hi, Plo: P ? P * lo : null, Phi: P ? P * hi : null, V: V };
  }
  function qualityWeight(inp) { var s = 0; (inp.items || []).forEach(function (it) { s += Math.max(0, num(it.weight, 0)); }); return s; }

  /* price score 0..1 of a price P for method m given the set statistics st (formulas of SPEC.md §Method) */
  function priceScore(m, P, st, params, ref) {
    params = params || {};
    if (!(isNum(P) && P > 0) || !st) return null;
    var mn = st.min, mx = st.max, mean = st.mean;
    switch (m) {
      case 'proportional': return mn / P;
      case 'linear_zero': { var Z = num(params.zeroFactor, DEF.zeroFactor) * mn; return Z > mn ? clamp01((Z - P) / (Z - mn)) : (P <= mn ? 1 : 0); }
      case 'linear_pct': return clamp01(1 - num(params.slope, DEF.slope) * (P - mn) / mn);
      case 'interpolation': return mx > mn ? clamp01((mx - P) / (mx - mn)) : 1;
      case 'mean_relative': return clamp01(0.5 + num(params.slopeMean, DEF.slopeMean) * (mean - P) / mean);
      case 'floor': { var F = num(params.floorFactor, DEF.floorFactor) * mean, r = Math.max(mn, F); return clamp01(r / Math.max(P, F)); }
      case 'absolute': {
        if (!ref || !isNum(ref.Plo) || !isNum(ref.Phi) || !(ref.Phi > ref.Plo)) return null;
        return clamp01((ref.Phi - P) / (ref.Phi - ref.Plo));
      }
      default: return null;
    }
  }

  /* quality points of each bid: Σ w_i · q_i/max_i ('scale', absolute) or Σ w_i · q_i/best_i ('best', relative to the best bid) */
  function qualityPoints(bids, items, qnorm) {
    var best = {};
    items.forEach(function (it) {
      var b = 0; bids.forEach(function (x) { var v = x.q ? x.q[it.id] : null; if (isNum(v) && v > b) b = v; });
      best[it.id] = b;
    });
    return bids.map(function (x) {
      var pts = 0, per = {};
      items.forEach(function (it) {
        var v = x.q ? x.q[it.id] : null, w = Math.max(0, num(it.weight, 0)), f = 0;
        if (isNum(v)) {
          if (qnorm === 'best') f = best[it.id] > 0 ? v / best[it.id] : 0;
          else f = num(it.max, 10) > 0 ? clamp01(v / num(it.max, 10)) : 0;
        }
        per[it.id] = f; pts += w * f;
      });
      return { pts: pts, per: per };
    });
  }

  function validBids(inp) {
    return (inp.bids || []).filter(function (b) { return b && b.included !== false && isNum(b.price) && b.price > 0; });
  }

  /* evaluate(inp, m) -> {method, rows[{id,name,price,s,pricePts,qualityPts,Q,E,score,total,rank}] in input order, order[ids best first], winner, runner, margin, unit}
     score = total points (higher is better) or, for 'monetised', −E (E = evaluated price = P − V·Q, lower is better). */
  function evaluate(inp, m, bidsOverride) {
    var bids = bidsOverride || validBids(inp), items = inp.items || [], W = num(inp.W, 0);
    var st = priceStats(bids.map(function (b) { return b.price; }));
    var ref = refOf(inp), qw = qualityWeight(inp);
    var qp = qualityPoints(bids, items, inp.qnorm);
    var params = inp.params || {};
    var avail = !(m === 'absolute' && !(ref.Phi > ref.Plo)) && !(m === 'monetised' && !isNum(ref.V));
    var rows = bids.map(function (b, i) {
      var Q = qw > 0 ? qp[i].pts / qw : 0, row = { id: b.id, name: b.name || b.id, price: b.price, qualityPts: qp[i].pts, qPer: qp[i].per, Q: Q, s: null, pricePts: null, total: null, E: null, score: null };
      if (!avail) return row;
      if (m === 'monetised') {
        row.E = b.price - ref.V * Q;
        row.score = -row.E;
      } else {
        row.s = priceScore(m, b.price, st, params, ref);
        row.pricePts = row.s == null ? null : W * row.s;
        row.total = row.pricePts == null ? null : row.pricePts + qp[i].pts;
        row.score = row.total;
      }
      return row;
    });
    var ord = rows.filter(function (r) { return r.score != null; }).slice().sort(function (a, b) {
      return (b.score - a.score) || (a.price - b.price) || (String(a.id) < String(b.id) ? -1 : 1);
    });
    ord.forEach(function (r, k) {
      /* competition rank with a tolerance (1e-9 of the scale) so that float noise does not split a real tie */
      var prev = ord[k - 1];
      r.rank = prev && Math.abs(prev.score - r.score) <= TIE_TOL * Math.max(1, Math.abs(r.score)) ? prev.rank : k + 1;
    });
    var winner = ord[0] ? ord[0].id : null, runner = ord[1] ? ord[1].id : null;
    var margin = ord.length > 1 ? ord[0].score - ord[1].score : null;
    /* ids sharing rank 1 (the order inside a tie is only price then id; the documents' tie-break rule decides, KB 18.04.2017 art. 87 §2) */
    var tie = ord.filter(function (r) { return r.rank === 1; }).map(function (r) { return r.id; });
    if (tie.length < 2) tie = [];
    else margin = 0;
    var ranks = {}; ord.forEach(function (r) { ranks[r.id] = r.rank; });
    return { method: m, available: avail, rows: rows, order: ord.map(function (r) { return r.id; }), ranks: ranks, tie: tie, winner: winner, runner: runner, margin: margin,
             unit: m === 'monetised' ? 'money' : 'points', stats: st, ref: ref, qualityWeight: qw, W: W };
  }

  /* pairs (a strictly ahead of b in the base ranking) that come out strictly reversed (b ahead of a); tied pairs never count as a reversal */
  function flips(baseRanks, ord, ranks) {
    var out = [];
    for (var i = 0; i < ord.length; i++) for (var j = i + 1; j < ord.length; j++) {
      var x = ord[i], y = ord[j];
      if (!(x in baseRanks) || !(y in baseRanks)) continue;
      if (baseRanks[y] < baseRanks[x] && ranks[x] < ranks[y]) out.push([y, x]);
    }
    return out;
  }
  /* rank-reversal (independence of irrelevant alternatives) test: remove each bidder in turn; add the optional test bidder.
     -> {base, cases[{action, id, order, swaps[[a,b]] (a was ahead of b before)}], any, count} */
  function reversal(inp, m, test) {
    var bids = validBids(inp), base = evaluate(inp, m, bids);
    var cases = [];
    if (!base.available) return { base: [], cases: [], any: false, count: 0, available: false };
    if (bids.length >= 3) bids.forEach(function (b) {
      var ev = evaluate(inp, m, bids.filter(function (x) { return x !== b; }));
      cases.push({ action: 'remove', id: b.id, order: ev.order, swaps: flips(base.ranks, ev.order, ev.ranks) });
    });
    if (test && isNum(test.price) && test.price > 0) {
      var tb = { id: test.id || '__test', name: test.name || 'test', price: test.price, q: test.q || {} };
      var ev2 = evaluate(inp, m, bids.concat([tb]));
      var ord = ev2.order.filter(function (x) { return x !== tb.id; });
      cases.push({ action: 'add', id: tb.id, order: ord, swaps: flips(base.ranks, ord, ev2.ranks), testRank: ev2.ranks[tb.id] });
    }
    var cnt = 0; cases.forEach(function (c) { cnt += c.swaps.length ? 1 : 0; });
    return { base: base.order, cases: cases, any: cnt > 0, count: cnt, available: true };
  }

  /* € value of one point: the price rise ΔP of the winner that removes exactly one point of its lead over the runner-up (both re-evaluated in the set).
     For 'monetised' one quality point is worth V/Σw by construction. -> {perPoint, pctOfPrice} or null */
  function eurPerPoint(inp, m) {
    var bids = validBids(inp), ev = evaluate(inp, m, bids);
    if (!ev.available || !ev.winner || !ev.runner) return null;
    if (m === 'monetised') { var v = ev.qualityWeight > 0 ? ev.ref.V / ev.qualityWeight : null; return v == null ? null : { perPoint: v, pctOfPrice: v / priceOf(bids, ev.winner) }; }
    var wi = ev.winner, ru = ev.runner, P0 = priceOf(bids, wi);
    function lead(dP) {
      var bb = bids.map(function (b) { return b.id === wi ? Object.assign({}, b, { price: P0 + dP }) : b; });
      var e = evaluate(inp, m, bb), a = rowOf(e, wi), b = rowOf(e, ru);
      return a.score - b.score;
    }
    var L0 = lead(0), lo = 0, hi = P0, k;
    for (k = 0; k < 40 && L0 - lead(hi) < 1; k++) hi *= 2;
    if (L0 - lead(hi) < 1) return null;
    for (k = 0; k < 200; k++) { var mid = (lo + hi) / 2; if (L0 - lead(mid) < 1) lo = mid; else hi = mid; if (hi - lo <= 1e-12 * P0) break; }
    var d = (lo + hi) / 2;
    return { perPoint: d, pctOfPrice: d / P0 };
  }
  function priceOf(bids, id) { for (var i = 0; i < bids.length; i++) if (bids[i].id === id) return bids[i].price; return null; }
  function rowOf(ev, id) { for (var i = 0; i < ev.rows.length; i++) if (ev.rows[i].id === id) return ev.rows[i]; return null; }

  /* inputs with price weight w (points), quality weights scaled to (total − w) in their proportions; total = W + Σw of the input */
  function withPriceWeight(inp, w) {
    var qw = qualityWeight(inp), total = num(inp.W, 0) + qw;
    var items = (inp.items || []).map(function (it) { return Object.assign({}, it, { weight: qw > 0 ? (total - w) * Math.max(0, num(it.weight, 0)) / qw : 0 }); });
    var ref = Object.assign({}, inp.ref || {});
    delete ref.V; /* monetised: V follows the weights (P_ref · Σw / W) */
    return Object.assign({}, inp, { W: w, items: items, ref: ref });
  }
  /* weight-sensitivity map: winner per method for price weight 0..total in `steps` steps -> {weights[], grid{m: [ids]}, switches{m: [{w, from, to}]}} */
  function sensitivity(inp, opts) {
    opts = opts || {};
    var steps = opts.steps || 20, total = num(inp.W, 0) + qualityWeight(inp), methods = opts.methods || METHOD_IDS;
    var weights = [], grid = {}, sw = {};
    for (var k = 0; k <= steps; k++) weights.push(total * k / steps);
    methods.forEach(function (m) {
      grid[m] = []; sw[m] = [];
      weights.forEach(function (w, k) {
        var x = withPriceWeight(inp, w), win;
        if (m === 'monetised' && w <= 0) win = evaluate(x, 'proportional').order.length ? orderByQuality(x)[0] : null;
        else if (m === 'monetised' && w >= total) win = orderByPrice(x)[0];
        else { var e = evaluate(x, m); win = e.tie.length ? e.tie.join('=') : e.winner; }
        grid[m].push(win);
        if (k > 0 && grid[m][k - 1] !== win) sw[m].push({ w: w, wPrev: weights[k - 1], from: grid[m][k - 1], to: win });
      });
    });
    return { weights: weights, grid: grid, switches: sw, total: total };
  }
  function orderByQuality(inp) { var b = validBids(inp), q = qualityPoints(b, inp.items || [], inp.qnorm); return b.map(function (x, i) { return { id: x.id, q: q[i].pts, p: x.price }; }).sort(function (a, c) { return (c.q - a.q) || (a.p - c.p); }).map(function (x) { return x.id; }); }
  function orderByPrice(inp) { return validBids(inp).slice().sort(function (a, b) { return a.price - b.price; }).map(function (x) { return x.id; }); }

  /* recommendation: penalties per method (SPEC.md), lowest penalty wins, ties by TIE_ORDER -> [{method, penalty, flags{...}, available}] best first */
  /* median of the valid bid prices and whether the reference price lies within REF_BAND × median */
  function refCheck(inp) {
    var v = validBids(inp).map(function (b) { return b.price; }).sort(function (a, b) { return a - b; }), ref = refOf(inp);
    if (!v.length || !ref.price) return { median: null, ratio: null, off: false };
    var n = v.length, med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2, r = ref.price / med;
    return { median: med, ratio: r, off: r < REF_BAND[0] || r > REF_BAND[1] };
  }
  function recommend(inp, test) {
    var bids = validBids(inp), st = priceStats(bids.map(function (b) { return b.price; })), ref = refOf(inp), rc = refCheck(inp);
    var out = METHOD_IDS.map(function (m) {
      var ev = evaluate(inp, m, bids), f = { reversal: false, dependent: !INDEPENDENT[m] || inp.qnorm === 'best', zero: false, mean: !!MEAN_BASED[m], outside: false, refOff: false, qualityRelative: inp.qnorm === 'best' };
      if (!ev.available) return { method: m, available: false, penalty: Infinity, flags: f };
      var rv = reversal(inp, m, test);
      f.reversal = rv.any; f.reversalCases = rv.count;
      /* interpolation gives 0 price points to the highest bid by construction, however close it is */
      if (m === 'interpolation' && bids.length >= 2) f.zero = true;
      if (m !== 'monetised') ev.rows.forEach(function (r) { if (r.s === 0 && st && r.price <= 1.5 * st.min) f.zero = true; });
      if (m === 'absolute') bids.forEach(function (b) { if (b.price < ref.Plo || b.price > ref.Phi) f.outside = true; });
      /* the absolute anchors and the monetised value of quality are derived from P_ref: a P_ref far from the bids (stale estimate) makes them meaningless */
      if ((m === 'absolute' || m === 'monetised') && rc.off && !(m === 'monetised' && isNum((inp.ref || {}).V) && inp.ref.V >= 0)) f.refOff = true;
      var p = (f.reversal ? PENALTY.reversal : 0) + (f.dependent ? PENALTY.dependent : 0) + (f.zero ? PENALTY.zero : 0) + (f.mean ? PENALTY.mean : 0) + (f.outside ? PENALTY.outside : 0) + (f.refOff ? PENALTY.refOff : 0);
      return { method: m, available: true, penalty: p, flags: f, winner: ev.winner };
    });
    return out.sort(function (a, b) { return (a.penalty - b.penalty) || (TIE_ORDER.indexOf(a.method) - TIE_ORDER.indexOf(b.method)); });
  }

  /* price-score curve of method m against P/Pmin (the other bids fixed) for the stage */
  function curve(inp, m, ratios) {
    var bids = validBids(inp), st = priceStats(bids.map(function (b) { return b.price; })), ref = refOf(inp);
    if (!st) return [];
    return ratios.map(function (r) {
      var P = r * st.min;
      if (m === 'monetised') return [r, null];
      return [r, priceScore(m, P, st, inp.params, ref)];
    });
  }

  /* full analysis for the page: every method evaluated, reversal, € per point, spreads, sensitivity, recommendation */
  function analyse(inp, opts) {
    opts = opts || {};
    var chosen = METHOD_IDS.indexOf(inp.method) >= 0 ? inp.method : 'proportional';
    var bids = validBids(inp), res = { ok: true, errors: [], warnings: [], method: chosen, methods: {}, n: bids.length };
    if (bids.length < 2) { res.ok = false; res.errors.push('bids'); return res; }
    var total = num(inp.W, 0) + qualityWeight(inp);
    if (Math.abs(total - 100) > 1e-9) res.warnings.push('total');
    var ref = refOf(inp);
    METHOD_IDS.forEach(function (m) {
      var ev = evaluate(inp, m, bids);
      var r = { ev: ev, available: ev.available };
      if (ev.available) {
        r.reversal = reversal(inp, m, opts.test);
        r.eur = eurPerPoint(inp, m);
        var pp = ev.rows.map(function (x) { return x.pricePts; }).filter(isNum), qq = ev.rows.map(function (x) { return x.qualityPts; });
        r.priceSpread = pp.length ? Math.max.apply(null, pp) - Math.min.apply(null, pp) : null;
        r.qualitySpread = Math.max.apply(null, qq) - Math.min.apply(null, qq);
        r.zeroBids = ev.rows.filter(function (x) { return x.s === 0; }).map(function (x) { return x.id; });
      }
      res.methods[m] = r;
    });
    var cw = res.methods[chosen];
    res.chosen = cw;
    /* same winner = same top set (a tie counts as agreement only with the same tie) */
    var top = function (e) { return e.tie.length ? e.tie.slice().sort().join('=') : e.winner; };
    res.agree = METHOD_IDS.filter(function (m) { return res.methods[m].available && top(res.methods[m].ev) === top(cw.ev); }).length;
    res.tie = cw.ev.tie;
    res.available = METHOD_IDS.filter(function (m) { return res.methods[m].available; }).length;
    res.reversalMethods = METHOD_IDS.filter(function (m) { return res.methods[m].available && res.methods[m].reversal.any; });
    res.recommend = recommend(inp, opts.test);
    res.sensitivity = sensitivity(inp, { steps: opts.steps || 20 });
    res.ref = ref;
    res.refCheck = refCheck(inp);
    if (res.refCheck.off) res.warnings.push('ref');
    if (ref.price && isNum(ref.V) && ref.V > ref.price) res.warnings.push('vhigh');
    if (ref.price && chosen === 'absolute') bids.forEach(function (b) { if (b.price < ref.Plo || b.price > ref.Phi) res.warnings.push('outside:' + b.id); });
    return res;
  }


  /* presets (numbers only; labels and "aha" texts live in awardcriteria.html; every aha is a test in _tnd/awardcriteria/test.mjs and a bench case) */
  var PRESETS = [
    { id: 'be-school', W: 60, method: 'proportional', qnorm: 'scale', ref: { price: 2000000, lo: 0.8, hi: 1.3 },
      items: [{ id: 'Q1', key: 'method', weight: 25, max: 10 }, { id: 'Q2', key: 'site', weight: 15, max: 10 }],
      bids: [{ id: 'A', price: 1450000, q: { Q1: 2, Q2: 2 } }, { id: 'B', price: 2000000, q: { Q1: 8, Q2: 7 } }, { id: 'C', price: 2168000, q: { Q1: 9, Q2: 8 } }, { id: 'D', price: 2290000, q: { Q1: 7, Q2: 6 } }] },
    { id: 'utility-epc', W: 50, method: 'interpolation', qnorm: 'scale', ref: { price: 105000000, lo: 0.8, hi: 1.3 },
      items: [{ id: 'Q1', key: 'perf', weight: 30, max: 10 }, { id: 'Q2', key: 'plan', weight: 20, max: 10 }],
      bids: [{ id: 'A', price: 98000000, q: { Q1: 6.5, Q2: 6 } }, { id: 'B', price: 104000000, q: { Q1: 8.5, Q2: 8.2 } }, { id: 'C', price: 131000000, q: { Q1: 9, Q2: 8 } }] },
    { id: 'trafo', W: 70, method: 'proportional', qnorm: 'scale', ref: { price: 3200000, lo: 0.8, hi: 1.3 },
      items: [{ id: 'Q1', key: 'losses', weight: 20, max: 10 }, { id: 'Q2', key: 'delivery', weight: 10, max: 10 }],
      bids: [{ id: 'A', price: 3100000, q: { Q1: 6, Q2: 7 } }, { id: 'B', price: 3180000, q: { Q1: 8, Q2: 8 } }, { id: 'C', price: 3250000, q: { Q1: 9, Q2: 9 } }] },
    { id: 'two-bids', W: 60, method: 'interpolation', qnorm: 'scale', ref: { price: 1250000, lo: 0.8, hi: 1.3 },
      items: [{ id: 'Q1', key: 'maint', weight: 40, max: 10 }],
      bids: [{ id: 'A', price: 1250000, q: { Q1: 6 } }, { id: 'B', price: 1275000, q: { Q1: 9 } }] },
    { id: 'eng-framework', W: 30, method: 'monetised', qnorm: 'best', ref: { price: 1000000, lo: 0.8, hi: 1.3 },
      items: [{ id: 'Q1', key: 'team', weight: 40, max: 10 }, { id: 'Q2', key: 'approach', weight: 30, max: 10 }],
      bids: [{ id: 'X', price: 880000, q: { Q1: 8, Q2: 6.5 } }, { id: 'Y', price: 1000000, q: { Q1: 6.5, Q2: 9 } }, { id: 'Z', price: 1150000, q: { Q1: 9.5, Q2: 7 } }] }
  ];

  return { version: VERSION, PRESETS: PRESETS, METHOD_IDS: METHOD_IDS, INDEPENDENT: INDEPENDENT, MEAN_BASED: MEAN_BASED, TIE_ORDER: TIE_ORDER, DEF: DEF, PENALTY: PENALTY, REF_BAND: REF_BAND, TIE_TOL: TIE_TOL, refCheck: refCheck,
           priceStats: priceStats, priceScore: priceScore, qualityPoints: qualityPoints, refOf: refOf, evaluate: evaluate, reversal: reversal,
           eurPerPoint: eurPerPoint, sensitivity: sensitivity, withPriceWeight: withPriceWeight, recommend: recommend, curve: curve, analyse: analyse, validBids: validBids };
});
