/* tnd-risk.js — engine of riskcontingency.html (Cost & Schedule Risk, Monte Carlo), tools.petrov.re Tendering & Contracts.
   Pure functions, no DOM, UMD (browser global TndRisk, node require); in a Web Worker it answers {id, input} messages with {id, result}.
   Method (structure of AACE RP 41R-08 range estimating, 57R-09 integrated cost and schedule risk analysis, 40R-08 contingency; ISO 31000 / IEC 31010 Monte Carlo):
   cost lines and activity durations are three-point ranges (PERT λ = 4, triangular, uniform or fixed), discrete risk events occur with probability p
   and then cost money and/or delay a path; one rank correlation for all cost lines and one for all activities (Iman & Conover 1982);
   duration = common activities + the longest of the parallel paths (each with the delays of its risks) + delays at the end;
   total cost = cost lines + risk costs + time-dependent cost × (duration − deterministic duration) + delay damages beyond the contract duration (capped);
   delay damages are linear €/day with a cap, or the Belgian works formula of KB 14.01.2013 (AUR) art. 86: R = 0.45·M·n²/N², N = 0.7 × contract days (§3), total ≤ 5 % of M (§6);
   contingency at confidence q = P_q(total cost) − base estimate (sum of the most likely values + delay damages of the plan).
   1.1.0 (review R-1/R-3/R-9/R-13): typed-array ranks and Iman–Conover (same method as TndCore, much faster), cost tornado with covariance (Euler) shares that add up to 100 %,
   exact path ties shared 1/m, AUR art. 86 damages mode, flag ld-no-duration, time-dependent cost ≥ 0. */
(function (root, factory) {
  var core = root && root.TndCore;
  if (typeof module === 'object' && module.exports) module.exports = factory(function () { return core || (core = require('./tnd-core.js')); });
  else root.TndRisk = factory(function () { return root.TndCore; });
})(typeof self !== 'undefined' ? self : this, function (getCore) {
  'use strict';
  var VERSION = '1.1.0';
  var DISTS = ['pert', 'triangular', 'uniform', 'fixed'];
  var LIM = { items: 40, activities: 30, risks: 40, nMin: 1000, nMax: 100000, cells: 2000000 };  /* cells: iterations × inputs budget (keeps the worker near 2 s) */
  var DEF = { iterations: 10000, seed: 20261115, q: 0.8, rhoCost: 0, rhoTime: 0, timeCost: 0, ld: 0, ldCap: 0, ldMode: 'linear', ldM: 0, ldCapPct: 5 };
  var LD_MODES = ['linear', 'aur86'];

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function num(x, d) { return isNum(x) ? x : d; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function str(x) { return x == null ? '' : String(x); }

  /* a three-point range: {dist, min, ml, max}; uniform keeps ml as the base value (midpoint when missing), fixed is ml */
  function range(o, errs, where) {
    o = o || {};
    var d = DISTS.indexOf(o.dist) >= 0 ? o.dist : 'pert';
    var min = o.min, ml = o.ml, max = o.max;
    if (d === 'fixed') { ml = num(ml, num(min, 0)); return { dist: d, min: ml, ml: ml, max: ml }; }
    if (d === 'uniform' && !isNum(ml) && isNum(min) && isNum(max)) ml = (min + max) / 2;
    if (!isNum(min) || !isNum(ml) || !isNum(max)) { errs.push({ code: 'number', where: where }); return { dist: d, min: 0, ml: 0, max: 0 }; }
    if (!(min <= ml && ml <= max)) { errs.push({ code: 'order', where: where }); return { dist: d, min: Math.min(min, ml, max), ml: ml, max: Math.max(min, ml, max) }; }
    return { dist: d, min: min, ml: ml, max: max };
  }
  function coreDist(r) {
    if (r.dist === 'fixed' || !(r.max > r.min)) return { type: 'fixed', value: r.dist === 'uniform' ? (r.min + r.max) / 2 : r.ml };
    if (r.dist === 'uniform') return { type: 'uniform', min: r.min, max: r.max };
    return { type: r.dist, min: r.min, ml: r.ml, max: r.max };
  }
  function hasRange(o) { return o && (isNum(o.min) || isNum(o.ml) || isNum(o.max)) && !(num(o.min, 0) === 0 && num(o.ml, 0) === 0 && num(o.max, 0) === 0); }

  /* normalised copy of the input; probabilities and q are fractions 0..1, correlations −0.95..0.95 */
  function norm(inp) {
    var i = inp || {}, errs = [], warn = [];
    var o = {
      iterations: Math.round(clamp(num(i.iterations, DEF.iterations), LIM.nMin, LIM.nMax)),
      seed: (num(i.seed, DEF.seed) >>> 0) || 1,
      q: clamp(num(i.q, DEF.q), 0.5, 0.99),
      rhoCost: clamp(num(i.rhoCost, 0), -0.95, 0.95), rhoTime: clamp(num(i.rhoTime, 0), -0.95, 0.95),
      timeCost: num(i.timeCost, 0), ld: Math.max(0, num(i.ld, 0)), ldCap: Math.max(0, num(i.ldCap, 0)),
      ldMode: LD_MODES.indexOf(i.ldMode) >= 0 ? i.ldMode : 'linear', ldM: Math.max(0, num(i.ldM, 0)), ldCapPct: clamp(num(i.ldCapPct, 5), 0, 10),
      targetCost: isNum(i.targetCost) && i.targetCost > 0 ? i.targetCost : null,
      targetDays: isNum(i.targetDays) && i.targetDays > 0 ? i.targetDays : null,
      items: [], activities: [], risks: [], paths: [], errors: errs, warnings: warn
    };
    (Array.isArray(i.items) ? i.items : []).slice(0, LIM.items).forEach(function (c, k) {
      if (!c || typeof c !== 'object') return;
      var id = c.id || 'I' + (k + 1);
      o.items.push({ id: id, name: str(c.name), r: range(c, errs, id) });
    });
    (Array.isArray(i.activities) ? i.activities : []).slice(0, LIM.activities).forEach(function (c, k) {
      if (!c || typeof c !== 'object') return;
      var id = c.id || 'A' + (k + 1), path = str(c.path).trim();
      if (path === '*') path = '';
      var rr = range(c, errs, id);
      if (rr.min < 0) errs.push({ code: 'negative', where: id });
      o.activities.push({ id: id, name: str(c.name), path: path, r: rr });
      if (path && o.paths.indexOf(path) < 0) o.paths.push(path);
    });
    (Array.isArray(i.risks) ? i.risks : []).slice(0, LIM.risks).forEach(function (c, k) {
      if (!c || typeof c !== 'object') return;
      var id = c.id || 'R' + (k + 1), p = num(c.p, NaN);
      if (!(p >= 0 && p <= 1)) { errs.push({ code: 'probability', where: id }); p = clamp(num(p, 0), 0, 1); }
      var dist = DISTS.indexOf(c.dist) >= 0 ? c.dist : 'pert';
      var cost = hasRange(c.cost) ? range(Object.assign({ dist: dist }, c.cost), errs, id + '.cost') : null;
      var time = hasRange(c.time) ? range(Object.assign({ dist: dist }, c.time), errs, id + '.time') : null;
      if (time && time.min < 0) errs.push({ code: 'negative', where: id + '.time' });
      var path = str(c.path).trim();
      if (path === '*') path = '';
      if (path && o.paths.indexOf(path) < 0) { warn.push({ code: 'risk-path', where: id }); path = ''; }
      o.risks.push({ id: id, name: str(c.name), p: p, dist: dist, cost: cost, time: time, path: path, owner: str(c.owner) });
    });
    if (!o.items.length && !o.risks.length) errs.push({ code: 'empty', where: 'items' });
    /* iterations × inputs above LIM.cells: cap the iterations (at least 10 000) and say so (flag iter-capped) */
    var nIn = o.items.length + o.activities.length + o.risks.length, cap = Math.max(10000, Math.floor(LIM.cells / Math.max(1, nIn) / 1000) * 1000);
    if (o.iterations > cap) { warn.push({ code: 'iter-capped', where: 'iterations', from: o.iterations, to: cap }); o.iterations = cap; }
    if (o.timeCost < 0) errs.push({ code: 'negative', where: 'timeCost' });
    if (o.ldMode === 'linear' && o.ldCap > 0 && o.ld === 0) o.ldCap = 0;
    if (o.ldMode === 'aur86') { o.ld = 0; o.ldCap = 0; }
    /* damages switched on but no contract duration: nothing to measure the delay against (flag ld-no-duration) */
    o.ldOn = o.ldMode === 'aur86' || o.ld > 0;
    if (o.ldOn && o.targetDays == null) warn.push({ code: 'ld-no-duration', where: 'targetDays' });
    return o;
  }

  /* delay damages for a duration D. linear: ld €/day beyond the contract duration, capped at ldCap (0 = no cap).
     aur86 (KB 14.01.2013 art. 86, read in _tnd/core/dl/aur_fr.txt / aur_nl.txt, ejustice copy): R = 0.45·M·n²/N², n = days of delay, N = working days of the
     contract period = floor(0.7 × calendar days) (§3; the tool's days are calendar days); M ≤ 75 000 € and N ≤ 150 → N² is replaced by 150·N (§1);
     total ≤ ldCapPct % of M (§6: 5 %, up to 10 % when the period is an award criterion); a total below 75 € is neglected (§6). M = ldM, or the base estimate when 0. */
  function damagesFn(n, baseItems) {
    if (n.targetDays == null) return null;
    if (n.ldMode === 'aur86') {
      var M = n.ldM > 0 ? n.ldM : baseItems, N = Math.floor(0.7 * n.targetDays + 1e-9);
      if (!(M > 0) || !(N > 0)) return null;
      var den = M <= 75000 && N <= 150 ? 150 * N : N * N, k = 0.45 * M / den, cap = n.ldCapPct / 100 * M;
      return { mode: 'aur86', M: M, N: N, cap: cap, f: function (D) { var d = D - n.targetDays; if (!(d > 0)) return 0; var r = k * d * d; if (r > cap) r = cap; return r < 75 ? 0 : r; } };
    }
    if (!(n.ld > 0)) return null;
    var ld = n.ld, cap2 = n.ldCap, td = n.targetDays;
    return { mode: 'linear', cap: cap2 > 0 ? cap2 : null, f: function (D) { var v = D > td ? (D - td) * ld : 0; return cap2 > 0 && v > cap2 ? cap2 : v; } };
  }

  /* deterministic figures of the plan: base estimate, deterministic duration, expected values of the risk events */
  function deterministic(n) {
    var C = getCore(), common = 0, per = {};
    n.paths.forEach(function (p) { per[p] = 0; });
    n.activities.forEach(function (a) { if (a.path) per[a.path] += a.r.ml; else common += a.r.ml; });
    var longest = 0, crit = null;
    n.paths.forEach(function (p) { if (per[p] > longest) { longest = per[p]; crit = p; } });
    var D = common + longest;
    var items = n.items.reduce(function (s, x) { return s + x.r.ml; }, 0);
    var itemsMean = n.items.reduce(function (s, x) { return s + C.dist.mean(coreDist(x.r)); }, 0);
    var emv = 0, emvTime = 0;
    var reg = n.risks.map(function (r) {
      var mc = r.cost ? C.dist.mean(coreDist(r.cost)) : 0, mt = r.time ? C.dist.mean(coreDist(r.time)) : 0;
      emv += r.p * mc; emvTime += r.p * mt;
      return { id: r.id, name: r.name, p: r.p, meanCost: mc, meanDelay: mt, emv: r.p * mc, emvDelay: r.p * mt, path: r.path };
    });
    var dmg = damagesFn(n, items), ldPlan = dmg ? dmg.f(D) : 0;
    return { base: items + ldPlan, baseItems: items, itemsMean: itemsMean, ldPlan: ldPlan, D: D, common: common, pathDays: per, critical: crit,
             emv: emv, emvTime: emvTime, register: reg, damages: dmg ? { mode: dmg.mode, M: dmg.M || null, N: dmg.N || null, cap: dmg.cap } : null };
  }

  function uniformMatrix(k, rho) {
    var M = [];
    for (var a = 0; a < k; a++) { M.push([]); for (var b = 0; b < k; b++) M[a].push(a === b ? 1 : rho); }
    return M;
  }
  /* ranks (1-based, ties get the average rank) with a native typed sort and binary search: same values as TndCore.ranks, no comparator sort */
  function lowerBound(a, x) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
  function upperBound(a, x) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] <= x) lo = m + 1; else hi = m; } return lo; }
  function fastRanks(x) {
    var n = x.length, s = Float64Array.from(x).sort(), out = new Float64Array(n);
    for (var i = 0; i < n; i++) { var v = x[i], lo = lowerBound(s, v), hi = s[lo + 1] === v ? upperBound(s, v) : lo + 1; out[i] = (lo + 1 + hi) / 2; }
    return out;
  }
  /* order positions 0..n−1 of x (argsort inverse; exact ties broken by first occurrence, as a stable sort would) */
  function positions(x) {
    var n = x.length, s = Float64Array.from(x).sort(), out = new Uint32Array(n), used = new Uint8Array(n);
    for (var i = 0; i < n; i++) { var p = lowerBound(s, x[i]); while (used[p]) p++; used[p] = 1; out[i] = p; }
    return out;
  }
  function isConst(c) { for (var t = 1; t < c.length; t++) if (c[t] !== c[0]) return false; return true; }
  /* Iman & Conover (1982), the TndCore.imanConover method (van der Waerden scores Φ⁻¹(i/(n+1)), Cholesky of the target and of the scores' own correlation,
     non-positive-definite target shrunk ×0.95 until it factors), with typed sorts; marginals preserved exactly (only the order changes) */
  function imanConoverFast(cols, target, r) {
    var C = getCore(), k = cols.length, n = cols[0].length, i, j, m;
    var fixed = C.fixCorrelation(target), P = C.cholesky(fixed.matrix);
    var base = new Float64Array(n);
    for (i = 0; i < n; i++) base[i] = C.invNorm((i + 1) / (n + 1));
    var S = [];
    for (j = 0; j < k; j++) {
      var col = Float64Array.from(base);
      for (i = n - 1; i > 0; i--) { var q = Math.floor(r() * (i + 1)), tmp = col[i]; col[i] = col[q]; col[q] = tmp; }
      S.push(col);
    }
    var E = [];
    for (i = 0; i < k; i++) { E.push([]); for (j = 0; j < k; j++) E[i].push(i === j ? 1 : (j < i ? E[j][i] : C.pearson(S[i], S[j]))); }
    var Q = C.cholesky(E);
    if (!Q) { Q = []; for (i = 0; i < k; i++) { Q.push([]); for (j = 0; j < k; j++) Q[i].push(i === j ? 1 : 0); } }
    var Qi = [];
    for (i = 0; i < k; i++) { Qi.push([]); for (j = 0; j < k; j++) Qi[i].push(0); }
    for (i = 0; i < k; i++) {
      Qi[i][i] = 1 / Q[i][i];
      for (j = 0; j < i; j++) { var s2 = 0; for (m = j; m < i; m++) s2 += Q[i][m] * Qi[m][j]; Qi[i][j] = -s2 / Q[i][i]; }
    }
    var Mx = [];
    for (i = 0; i < k; i++) { Mx.push([]); for (j = 0; j < k; j++) { var a2 = 0; for (m = 0; m < k; m++) a2 += P[i][m] * Qi[m][j]; Mx[i].push(a2); } }
    var out = [], rk = [], Tj = new Float64Array(n);
    for (j = 0; j < k; j++) {
      for (i = 0; i < n; i++) { var v = 0; for (m = 0; m <= j; m++) v += Mx[j][m] * S[m][i]; Tj[i] = v; }
      var sorted = Float64Array.from(cols[j]).sort(), pos = positions(Tj), res = new Float64Array(n), tied = false;
      for (i = 0; i < n; i++) res[i] = sorted[pos[i]];
      for (i = 1; i < n; i++) if (sorted[i] === sorted[i - 1]) { tied = true; break; }
      if (tied) rk.push(fastRanks(res));
      else { var rr = new Float64Array(n); for (i = 0; i < n; i++) rr[i] = pos[i] + 1; rk.push(rr); }  /* distinct values: the rank is the position */
      out.push(res);
    }
    var sum = 0, cnt = 0;
    for (i = 0; i < k; i++) for (j = i + 1; j < k; j++) { sum += C.pearson(rk[i], rk[j]); cnt++; }
    return { cols: out, ranks: rk, achievedMean: cnt ? sum / cnt : null, adjusted: fixed.adjusted };
  }
  /* rank-correlate the varying columns of cols; returns mean achieved off-diagonal rank correlation and the adjusted flag */
  function correlate(cols, rho, seed, rankCache) {
    var C = getCore(), idx = [];
    cols.forEach(function (c, k) { if (!isConst(c)) idx.push(k); });
    if (rho === 0 || idx.length < 2) return { achieved: null, adjusted: false, k: idx.length };
    var ic = imanConoverFast(idx.map(function (k) { return cols[k]; }), uniformMatrix(idx.length, rho), C.rng(seed));
    idx.forEach(function (k, j) { cols[k] = ic.cols[j]; rankCache.push({ c: ic.cols[j], r: ic.ranks[j] }); });
    return { achieved: ic.achievedMean, adjusted: !!ic.adjusted, k: idx.length };
  }

  function cdfPoints(sorted) {
    var C = getCore(), out = [];
    for (var p = 0; p <= 100; p++) out.push(C.percentile(sorted, p / 100, true));
    return out;
  }
  function fracLE(sorted, x) {
    /* share of samples ≤ x (binary search on the sorted array) */
    var lo = 0, hi = sorted.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid] <= x) lo = mid + 1; else hi = mid; }
    return lo / sorted.length;
  }

  /* the simulation */
  function simulate(n, det) {
    var C = getCore(), N = n.iterations, r = C.rng(n.seed), t, k;
    var itemCols = n.items.map(function (x) { return C.dist.samples(coreDist(x.r), N, r); });
    var actCols = n.activities.map(function (a) { return C.dist.samples(coreDist(a.r), N, r); });
    var riskOcc = [], riskCost = [], riskTime = [];
    n.risks.forEach(function (x) {
      var occ = new Uint8Array(N);
      for (t = 0; t < N; t++) occ[t] = r() < x.p ? 1 : 0;
      riskOcc.push(occ);
      riskCost.push(x.cost ? C.dist.samples(coreDist(x.cost), N, r) : null);
      riskTime.push(x.time ? C.dist.samples(coreDist(x.time), N, r) : null);
    });
    var rankCache = [];
    var corrCost = correlate(itemCols, n.rhoCost, (n.seed ^ 0x9E3779B9) >>> 0, rankCache);
    var corrTime = correlate(actCols, n.rhoTime, (n.seed ^ 0x85EBCA6B) >>> 0, rankCache);

    var P = n.paths.length, pIndex = {};
    n.paths.forEach(function (p, j) { pIndex[p] = j; });
    var total = new Float64Array(N), itemsOnly = new Float64Array(N), dur = new Float64Array(N), ldv = new Float64Array(N);
    var riskEff = n.risks.map(function () { return new Float64Array(N); }), riskDelay = n.risks.map(function () { return new Float64Array(N); });
    var critCount = new Float64Array(P), pathSum = new Float64Array(P);
    var hasSched = n.activities.length > 0 || n.risks.some(function (x) { return !!x.time; });
    var dmgF = (damagesFn(n, det.baseItems) || {}).f || null, schedCost = new Float64Array(N), riskC = n.risks.map(function () { return new Float64Array(N); });
    for (t = 0; t < N; t++) {
      var si = 0;
      for (k = 0; k < itemCols.length; k++) si += itemCols[k][t];
      var common = 0;
      for (k = 0; k < P; k++) pathSum[k] = 0;
      for (k = 0; k < actCols.length; k++) { var a = n.activities[k]; if (a.path) pathSum[pIndex[a.path]] += actCols[k][t]; else common += actCols[k][t]; }
      var rc = 0, endDelay = 0;
      for (k = 0; k < n.risks.length; k++) {
        if (!riskOcc[k][t]) continue;
        var x = n.risks[k], c = riskCost[k] ? riskCost[k][t] : 0, dl = riskTime[k] ? riskTime[k][t] : 0;
        rc += c;
        riskC[k][t] = c;
        riskDelay[k][t] = dl;
        riskEff[k][t] = c + n.timeCost * dl;
        if (dl) { if (x.path) pathSum[pIndex[x.path]] += dl; else endDelay += dl; }
      }
      var lp = 0, lj = -1;
      for (k = 0; k < P; k++) if (lj < 0 || pathSum[k] > lp) { lp = pathSum[k]; lj = k; }
      if (lj >= 0) {
        /* exact ties share the lead: each tied path counts 1/m (review R-9) */
        var m = 0, tol = 1e-9 * Math.max(1, Math.abs(lp));
        for (k = 0; k < P; k++) if (lp - pathSum[k] <= tol) m++;
        if (m === 1) critCount[lj]++;
        else for (k = 0; k < P; k++) if (lp - pathSum[k] <= tol) critCount[k] += 1 / m;
      }
      var D = common + (P ? lp : 0) + endDelay;
      var ld = dmgF ? dmgF(D) : 0;
      dur[t] = D; ldv[t] = ld; itemsOnly[t] = si;
      schedCost[t] = n.timeCost * (D - det.D) + ld;
      total[t] = si + rc + schedCost[t];
    }

    /* tornado (review R-1, R-3). ρ = Spearman rank correlation of each input with total cost / duration (ranking bar; for a risk its € effect = cost + time cost × delay).
       Cost share = covariance (Euler) share Cov(X_i, T)/Var(T) of the additive parts of the total: cost lines, direct risk costs and one part
       'time-related cost' = time cost × (D − D0) + damages (activities and risk delays act through it); the shares add up to 100 % and hold under correlation.
       Duration is a maximum, not a sum: its share column is ρ²/Σρ², a ranking indicator only. Ranks of a column are computed once and reused. */
    function rk(col) { for (var i = 0; i < rankCache.length; i++) if (rankCache[i].c === col) return rankCache[i].r; var r2 = fastRanks(col); rankCache.push({ c: col, r: r2 }); return r2; }
    function rho(col, ry) { return isConst(col) ? 0 : C.pearson(rk(col), ry); }
    var timeMatters = n.timeCost !== 0 || n.ldOn, rTot = fastRanks(total), meanT = 0, varT = 0;
    for (t = 0; t < N; t++) meanT += total[t];
    meanT /= N;
    for (t = 0; t < N; t++) varT += (total[t] - meanT) * (total[t] - meanT);
    function covShare(col) {
      if (!(varT > 0)) return 0;
      var mx = 0, s2 = 0;
      for (t = 0; t < N; t++) mx += col[t];
      mx /= N;
      for (t = 0; t < N; t++) s2 += (col[t] - mx) * (total[t] - meanT);
      return s2 / varT;
    }
    var torC = [];
    n.items.forEach(function (x, j) { torC.push({ name: x.id, rho: rho(itemCols[j], rTot), share: covShare(itemCols[j]) }); });
    n.risks.forEach(function (x, j) { torC.push({ name: x.id, rho: rho(riskEff[j], rTot), share: x.cost ? covShare(riskC[j]) : 0 }); });
    if (timeMatters && hasSched) {
      n.activities.forEach(function (a, j) { torC.push({ name: a.id, rho: rho(actCols[j], rTot), share: null }); });
      torC.push({ name: 'TIME', rho: rho(schedCost, rTot), share: covShare(schedCost) });
    }
    torC.sort(function (a, b) { return Math.abs(b.rho) - Math.abs(a.rho); });
    var torT = [];
    if (hasSched) {
      var rDur = fastRanks(dur);
      n.activities.forEach(function (a, j) { torT.push({ name: a.id, rho: rho(actCols[j], rDur) }); });
      n.risks.forEach(function (x, j) { if (x.time) torT.push({ name: x.id, rho: rho(riskDelay[j], rDur) }); });
      var s2 = torT.reduce(function (s3, r2) { return s3 + r2.rho * r2.rho; }, 0);
      torT.forEach(function (r2) { r2.share = s2 > 0 ? r2.rho * r2.rho / s2 : 0; });
      torT.sort(function (a, b) { return Math.abs(b.rho) - Math.abs(a.rho); });
    }

    var sc = Float64Array.from(total).sort(), sd = Float64Array.from(dur).sort(), si2 = Float64Array.from(itemsOnly).sort();
    var stC = C.stats(sc), stD = C.stats(sd), stI = C.stats(si2);
    var q = n.q, cq = C.percentile(sc, q, true), dq = C.percentile(sd, q, true), joint = 0, ldHit = 0, ldSum = 0;
    for (t = 0; t < N; t++) { if (total[t] <= cq && dur[t] <= dq) joint++; if (ldv[t] > 0) ldHit++; ldSum += ldv[t]; }
    var crit = {};
    n.paths.forEach(function (p, j) { crit[p] = critCount[j] / N; });
    return {
      cost: { stats: stC, cdf: cdfPoints(sc), hist: C.histogram(sc, 40), pq: cq, se: stC.sd / Math.sqrt(N) },
      itemsOnly: { stats: stI, pq: C.percentile(si2, q, true) },
      dur: hasSched ? { stats: stD, cdf: cdfPoints(sd), hist: C.histogram(sd, 40), pq: dq } : null,
      sorted: { cost: sc, dur: sd },
      joint: hasSched ? joint / N : null,
      ld: { mean: ldSum / N, pAny: ldHit / N },
      criticality: crit,
      tornadoCost: torC, tornadoTime: torT,
      corr: { cost: corrCost, time: corrTime },
      hasSched: hasSched
    };
  }

  /* analyse(input) -> {ok, errors, input, det, sim, cont, ...}; sim.sorted is dropped unless opts.keepSamples */
  function analyse(inp, opts) {
    opts = opts || {};
    var t0 = Date.now(), n = norm(inp);
    if (n.errors.length) return { ok: false, errors: n.errors, warnings: n.warnings, input: n, version: VERSION };
    var det = deterministic(n), sim = simulate(n, det);
    var sc = sim.sorted.cost, sd = sim.sorted.dur, C = getCore(), B = det.base;
    function cont(p) { var v = C.percentile(sc, p, true); return { p: p, value: v, contingency: v - B, pct: B !== 0 ? (v - B) / Math.abs(B) : null }; }
    var levels = [0.5, 0.8, 0.9];
    if (levels.indexOf(n.q) < 0) levels.push(n.q);
    levels.sort(function (a, b) { return a - b; });
    var res = {
      ok: true, version: VERSION, input: n, warnings: n.warnings, det: det,
      cost: sim.cost, itemsOnly: sim.itemsOnly, dur: sim.dur, joint: sim.joint, ld: sim.ld, criticality: sim.criticality,
      tornadoCost: sim.tornadoCost, tornadoTime: sim.tornadoTime, corr: sim.corr,
      contingency: levels.map(cont),
      pBase: fracLE(sc, B),
      pBaseEmv: fracLE(sc, B + det.emv),
      pDet: sim.dur ? fracLE(sd, det.D) : null,
      pTargetCost: n.targetCost != null ? fracLE(sc, n.targetCost) : null,
      pTargetDays: n.targetDays != null && sim.dur ? fracLE(sd, n.targetDays) : null,
      split: { estimate: sim.itemsOnly.pq - det.baseItems, risk: sim.cost.pq - sim.itemsOnly.pq - det.ldPlan },
      flags: [], ms: 0
    };
    var q = res.contingency.filter(function (c) { return c.p === n.q; })[0];
    res.atQ = q;
    if (sim.corr.cost.adjusted || sim.corr.time.adjusted) res.flags.push('corr-adjusted');
    if (res.pBase < 0.5) res.flags.push('base-optimistic');
    if (det.emv > 0 && res.pBaseEmv < n.q) res.flags.push('emv-short');
    if (sim.joint != null && sim.joint < n.q - 0.02) res.flags.push('joint');
    if (n.warnings.some(function (w) { return w.code === 'risk-path'; })) res.flags.push('risk-path');
    if (n.warnings.some(function (w) { return w.code === 'ld-no-duration'; })) res.flags.push('ld-no-duration');
    if (n.warnings.some(function (w) { return w.code === 'iter-capped'; })) res.flags.push('iter-capped');
    if (n.paths.length > 1) {
      var pc = Object.keys(sim.criticality).filter(function (p) { return sim.criticality[p] >= 0.1; });
      if (pc.length > 1) res.flags.push('merge');
    }
    if (opts.keepSamples) res.samples = sim.sorted;
    res.ms = Date.now() - t0;
    return res;
  }

  /* presets (each aha is a test in _tnd/riskcontingency/test.mjs and in the bench) */
  function R3(dist, min, ml, max) { return { dist: dist, min: min, ml: ml, max: max }; }
  function It(id, key, dist, min, ml, max) { return Object.assign({ id: id, key: key }, R3(dist, min, ml, max)); }
  function Ac(id, key, path, dist, min, ml, max) { return Object.assign({ id: id, key: key, path: path }, R3(dist, min, ml, max)); }
  function Rk(id, key, p, cost, time, path) { return { id: id, key: key, p: p, dist: 'pert', cost: cost, time: time, path: path || '' }; }
  var PRESETS = [
    { id: 'be-sewer', group: 'be', side: 'contractor', iterations: 10000, seed: 20261115, q: 0.8, rhoCost: 0.3, rhoTime: 0.3, timeCost: 2600, ld: 0, ldCap: 0, ldMode: 'aur86', ldM: 6200000, ldCapPct: 5, targetCost: null, targetDays: 230,
      items: [It('I1', 'sewer', 'pert', 1950000, 2100000, 2650000), It('I2', 'dewater', 'pert', 300000, 380000, 950000), It('I3', 'pscivil', 'pert', 1150000, 1250000, 1550000),
              It('I4', 'psme', 'pert', 600000, 640000, 720000), It('I5', 'roads', 'pert', 390000, 420000, 520000), It('I6', 'utilities', 'pert', 120000, 160000, 350000),
              It('I7', 'prelims', 'fixed', 690000, 690000, 690000)],
      activities: [Ac('A1', 'mob', '', 'pert', 10, 15, 20), Ac('A2', 'sewerw', 'S', 'pert', 120, 140, 190), Ac('A3', 'pswork', 'P', 'pert', 110, 125, 165), Ac('A4', 'reinst', '', 'pert', 25, 30, 45)],
      risks: [Rk('R1', 'contam', 0.25, R3('pert', 80000, 150000, 400000), R3('pert', 5, 10, 25), 'S'), Rk('R2', 'archeo', 0.10, R3('pert', 20000, 40000, 80000), R3('pert', 10, 20, 40), 'S'),
              Rk('R3', 'permit', 0.30, null, R3('pert', 10, 20, 40), '')] },
    { id: 'epc-fidic', group: 'epc', side: 'contractor', iterations: 10000, seed: 20261115, q: 0.8, rhoCost: 0.6, rhoTime: 0.3, timeCost: 18000, ld: 0, ldCap: 0, targetCost: null, targetDays: null,
      items: [It('I1', 'boiler', 'pert', 12800000, 13500000, 15200000), It('I2', 'turbine', 'pert', 6300000, 6600000, 7400000), It('I3', 'bop', 'pert', 4300000, 4800000, 5900000),
              It('I4', 'civil', 'pert', 6000000, 6900000, 8600000), It('I5', 'mech', 'pert', 4600000, 5200000, 6600000), It('I6', 'ei', 'pert', 3600000, 4000000, 4900000),
              It('I7', 'eng', 'pert', 2600000, 2900000, 3500000), It('I8', 'commiss', 'pert', 900000, 1100000, 1500000), It('I9', 'indirects', 'fixed', 3000000, 3000000, 3000000)],
      activities: [Ac('A1', 'engp', '', 'pert', 110, 130, 160), Ac('A2', 'boilerd', 'B', 'pert', 300, 330, 400), Ac('A3', 'civilw', 'C', 'pert', 260, 290, 360), Ac('A4', 'erect', '', 'pert', 140, 160, 210), Ac('A5', 'comm', '', 'pert', 50, 60, 90)],
      risks: [Rk('R1', 'soil', 0.20, R3('pert', 300000, 600000, 1500000), R3('pert', 10, 20, 45), 'C'), Rk('R2', 'grid', 0.25, R3('pert', 50000, 100000, 250000), R3('pert', 15, 30, 60), ''),
              Rk('R3', 'perf', 0.15, R3('pert', 400000, 900000, 2000000), null, '')] },
    { id: 'equip-trafo', group: 'eq', side: 'supplier', iterations: 10000, seed: 20261115, q: 0.8, rhoCost: 0.3, rhoTime: 0, timeCost: 0, ld: 9000, ldCap: 180000, targetCost: null, targetDays: 220,
      items: [It('I1', 'core', 'pert', 520000, 560000, 650000), It('I2', 'copper', 'pert', 300000, 340000, 430000), It('I3', 'tank', 'pert', 150000, 165000, 200000),
              It('I4', 'bushings', 'pert', 140000, 150000, 175000), It('I5', 'labour', 'pert', 230000, 260000, 320000), It('I6', 'fat', 'pert', 50000, 60000, 85000),
              It('I7', 'transport', 'pert', 75000, 90000, 130000), It('I8', 'docs', 'fixed', 45000, 45000, 45000)],
      activities: [Ac('A1', 'design', '', 'pert', 25, 30, 40), Ac('A2', 'corew', 'W', 'pert', 115, 125, 150), Ac('A3', 'tankf', 'T', 'pert', 110, 125, 150), Ac('A4', 'oltc', 'O', 'pert', 105, 125, 160),
                   Ac('A5', 'assy', '', 'pert', 20, 25, 35), Ac('A6', 'fatt', '', 'pert', 8, 10, 15), Ac('A7', 'ship', '', 'pert', 20, 25, 35)],
      risks: [Rk('R1', 'fatfail', 0.15, R3('pert', 20000, 40000, 90000), R3('pert', 10, 15, 30), ''), Rk('R2', 'shipping', 0.20, R3('pert', 5000, 15000, 40000), R3('pert', 5, 10, 25), '')] },
    { id: 'client-budget', group: 'be', side: 'client', iterations: 10000, seed: 20261115, q: 0.8, rhoCost: 0.4, rhoTime: 0.3, timeCost: 1500, ld: 0, ldCap: 0, targetCost: null, targetDays: null,
      items: [It('I1', 'building', 'pert', 2050000, 2250000, 2700000), It('I2', 'hvac', 'pert', 820000, 900000, 1080000), It('I3', 'elec', 'pert', 560000, 610000, 720000),
              It('I4', 'site', 'pert', 300000, 340000, 440000), It('I5', 'fees', 'fixed', 410000, 410000, 410000)],
      activities: [Ac('A1', 'design2', '', 'pert', 120, 140, 180), Ac('A2', 'tender', '', 'pert', 90, 100, 130), Ac('A3', 'works', '', 'pert', 260, 290, 350)],
      risks: [Rk('R1', 'asbestos', 0.40, R3('pert', 60000, 120000, 300000), R3('pert', 10, 20, 40), ''), Rk('R2', 'appeal', 0.15, R3('pert', 10000, 30000, 60000), R3('pert', 40, 60, 120), ''),
              Rk('R3', 'lowbids', 0.30, R3('pert', 100000, 250000, 450000), null, ''), Rk('R4', 'subsidy', 0.20, R3('pert', 50000, 100000, 200000), null, ''),
              Rk('R5', 'scope', 0.50, R3('pert', 40000, 90000, 220000), R3('pert', 0, 10, 30), '')] }
  ];
  function presetInput(id) {
    var p = PRESETS.filter(function (x) { return x.id === id; })[0];
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }

  var api = { version: VERSION, DISTS: DISTS, LIM: LIM, DEF: DEF, PRESETS: PRESETS, presetInput: presetInput,
              norm: norm, deterministic: deterministic, analyse: analyse, fracLE: fracLE };

  /* Web Worker: {id, input, coreUrl} -> {id, ok, result | error}; the core is loaded once from coreUrl (same version as the page) */
  if (typeof window === 'undefined' && typeof importScripts === 'function' && typeof self !== 'undefined' && typeof module === 'undefined') {
    self.onmessage = function (e) {
      var d = e.data || {};
      try {
        if (!self.TndCore) importScripts(d.coreUrl || 'tnd-core.js');
        self.postMessage({ id: d.id, ok: true, result: analyse(d.input) });
      } catch (err) { self.postMessage({ id: d.id, ok: false, error: String(err && err.message || err) }); }
    };
  }
  return api;
});
