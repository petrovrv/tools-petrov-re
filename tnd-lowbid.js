/* tnd-lowbid.js — engine of lowbidcheck.html (Abnormally Low Tender Check), tools.petrov.re Tendering & Contracts.
   Pure, no DOM, UMD (browser global TndLowbid, node require). Method: _tnd/lowbidcheck/SPEC.md.
   KB 18.04.2017 art. 35 (price examination of every offer), art. 36 §1 (enquiry when prices appear abnormally low or high),
   §2 (12 days, grounds 1°–4°, art. 7 Wet social/labour/environmental law, negligible items), §3 (outcome), §4 (mandatory enquiry at
   15 % below the trimmed mean), §5 (notifications), §6 (negotiated procedures below thresholds); Dir. 2014/24/EU art. 69.
   Periods: Wet 17.06.2016 art. 167 -> Reg. (EEC, Euratom) 1182/71 art. 3 (calendar days, end on a Saturday, Sunday or public holiday
   moves to the next working day, a period of two days or more holds at least two working days; read on EUR-Lex 15.11.2026).
   Statistical screens (IQR fence, line median check, mean of the others, owner's estimate) are practice: learning assumptions, editable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TndLowbid = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.1.0';
  var REL = 1e-9;
  var PROCEDURES = ['open', 'restricted', 'competitive-negotiation', 'negotiated-with-publication', 'negotiated-without-publication', 'competitive-dialogue', 'innovation-partnership'];
  var NEGOTIATED = ['competitive-negotiation', 'negotiated-with-publication', 'negotiated-without-publication'];
  var KINDS = ['works', 'supplies', 'services'];
  var REGIMES = ['be', 'eu', 'private'];
  /* KB 18.04.2017 art. 36 values (read on ejustice 14.11.2026). Taken from tnd-rules.json abnormal.* through TndCore.rules when the core
     is loaded; these literals are the fallback (a test checks that both agree). */
  var BE = { threshold: 0.15, minBids: 4, priceWeightMin: 0.5, negotiatedWorksBelow: 500000, days: 12 };
  var BE_FALLBACK = JSON.parse(JSON.stringify(BE)), BE_SOURCE = 'engine';
  (function () {
    var C = null;
    try { C = typeof self !== 'undefined' && self.TndCore ? self.TndCore : (typeof require === 'function' ? require('./tnd-core.js') : null); } catch (e) { C = null; }
    if (!C || !C.rules || typeof C.rules.value !== 'function') return;
    var map = { threshold: 'abnormal.be_15pct.threshold', minBids: 'abnormal.be_15pct.min_bids', priceWeightMin: 'abnormal.be_15pct.price_weight_min',
                negotiatedWorksBelow: 'abnormal.be_15pct.negotiated_exemption_works_below', days: 'abnormal.justification_days' }, all = true;
    Object.keys(map).forEach(function (k) { var v; try { v = C.rules.value(map[k]); } catch (e) { v = undefined; } if (typeof v === 'number' && isFinite(v) && v > 0) BE[k] = v; else all = false; });
    BE_SOURCE = all ? 'tnd-rules.json' : 'engine+tnd-rules.json';
  })();
  var MAX_TOTAL = 1e12;
  /* screen defaults: practice, not law (learning_assumption) */
  var SCREEN = { lineLow: 0.30, lineHigh: 0.50, lineMinShare: 0.01, iqrK: 1.5, othersDev: 0.15, estDev: 0.20, minLinePrices: 3 };

  /* numbers: finite numbers, or decimal strings only (no hex '0x10', no '1e400') */
  var DEC = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d{1,3})?\s*$/;
  function num(v) { if (typeof v === 'number') return isFinite(v) ? v : null; if (typeof v === 'string' && DEC.test(v)) { var x = +v; return isFinite(x) ? x : null; } return null; }
  function has(a, x) { return a.indexOf(x) >= 0; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function sorted(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  /* percentile, linear interpolation between order statistics (Hyndman–Fan type 7, numpy default) */
  function quantile(a, p) {
    var s = sorted(a), n = s.length; if (!n) return null;
    var h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  }
  function median(a) { return quantile(a, 0.5); }
  function le(x, lim) { return x <= lim + REL * Math.abs(lim); }

  /* KB 18.04.2017 art. 36 §4 mean: n ≥ 7 -> exclude the lowest offer and the highest offers forming a quarter of the number of offers
     (rounded up); n < 7 -> exclude the lowest and the highest. items [{id, v}] -> {mean, kept, low, high} */
  function art36Mean(items) {
    var s = items.slice().sort(function (a, b) { return a.v - b.v; }), n = s.length;
    if (n < 3) return null;
    var nh = n >= 7 ? Math.ceil(n / 4) : 1;
    var kept = s.slice(1, n - nh);
    if (!kept.length) return null;
    return { mean: sum(kept.map(function (x) { return x.v; })) / kept.length, kept: kept.map(function (x) { return x.id; }),
             low: [s[0].id], high: s.slice(n - nh).map(function (x) { return x.id; }), nHigh: nh };
  }

  /* applicability of art. 36 under Belgian law -> {mode:'mandatory'|'indicative'|'exempt', reasons[], threshold, negotiated} */
  function beMode(be, nValid) {
    be = be || {};
    /* a missing procedure reads as open (old inputs); an unknown one is never treated as open: §4 is then only indicative */
    var unknown = be.procedure != null && be.procedure !== '' && !has(PROCEDURES, be.procedure);
    var proc = has(PROCEDURES, be.procedure) ? be.procedure : (unknown ? 'unknown' : 'open'), kind = has(KINDS, be.kind) ? be.kind : 'works';
    var priceOnly = be.priceOnly !== false, pw = num(be.priceWeight), val = num(be.valueEst);
    var negotiated = has(NEGOTIATED, proc), reasons = [];
    /* §6: not applicable to the negotiated procedures for supplies/services below the EU threshold and works below 500 000 €, unless the documents say otherwise */
    if (negotiated && !be.keepInNegotiated) {
      if (kind === 'works' && val != null && val < BE.negotiatedWorksBelow) return { mode: 'exempt', reasons: ['s6_works'], threshold: null, negotiated: true, proc: proc, kind: kind };
      if (kind !== 'works' && be.belowEU === true) return { mode: 'exempt', reasons: ['s6_eu'], threshold: null, negotiated: true, proc: proc, kind: kind };
    }
    /* competitive dialogue and innovation partnership: §1–§3 apply, §4 does not (open/restricted only), §6 does not exempt them
       (Verslag aan de Koning on art. 36 §6, kb20170418_nl.txt:2156) */
    if (unknown) reasons.push('procedure_unknown');
    else if (proc !== 'open' && proc !== 'restricted') reasons.push('procedure');
    var scope = kind === 'works' || (kind === 'services' && !!be.fraudSensitive);
    if (!scope) { if (!(be.madeApplicable && priceOnly)) reasons.push(be.madeApplicable ? 'made_needs_price_only' : 'kind'); }
    if (!priceOnly && !(pw != null && pw >= BE.priceWeightMin - 1e-12)) reasons.push('price_weight');
    if (nValid < BE.minBids) reasons.push('min_bids');
    var t = BE.threshold, dt = num(be.threshold);
    if (!priceOnly && dt != null && dt > BE.threshold) t = dt;   /* only in the price-quality case may the documents set a higher percentage */
    return { mode: reasons.length ? 'indicative' : 'mandatory', reasons: reasons, threshold: t, negotiated: negotiated, proc: proc, kind: kind };
  }

  /* main analysis. inp = {regime, be:{...}, bids:[{id,name,total,irregular}], lines:[{id,desc,qty,unit,prices:{bidId:up}}], screen:{...}} */
  function analyse(inp) {
    inp = inp || {};
    var errors = [], warnings = [];
    var regime = has(REGIMES, inp.regime) ? inp.regime : 'be';
    var sc = {}; Object.keys(SCREEN).forEach(function (k) { var v = num((inp.screen || {})[k]); sc[k] = v != null && v >= 0 ? v : SCREEN[k]; });
    var est = num((inp.screen || {}).estimate); if (!(est > 0)) est = null;
    var bids = (inp.bids || []).filter(function (b) { return b && b.id != null && String(b.id) !== ''; });
    var seen = {};
    bids.forEach(function (b) { if (seen[b.id]) warnings.push({ k: 'dupBid', bid: b.id }); seen[b.id] = 1; });
    bids.forEach(function (b) { var t = num(b.total); if (t != null && t > MAX_TOTAL) warnings.push({ k: 'tooLarge', bid: b.id }); });
    var valid = bids.filter(function (b) { var t = num(b.total); return t != null && t > 0 && t <= MAX_TOTAL && !b.irregular; });
    if (!valid.length) errors.push('nobids');
    var vals = valid.map(function (b) { return num(b.total); }), n = vals.length;
    var stats = null;
    if (n) {
      var mean = sum(vals) / n, sd = n > 1 ? Math.sqrt(sum(vals.map(function (v) { return (v - mean) * (v - mean); })) / (n - 1)) : 0;
      var q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75);
      stats = { n: n, mean: mean, median: median(vals), sd: sd, cv: mean ? sd / mean : null, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals),
                q1: q1, q3: q3, iqr: q3 - q1, fence: n >= 4 ? q1 - sc.iqrK * (q3 - q1) : null, fenceHigh: n >= 4 ? q3 + sc.iqrK * (q3 - q1) : null };
    }
    /* Belgian rule */
    var mode = null, a36 = null, limit = null;
    if (regime === 'be') {
      mode = beMode(inp.be, n);
      if (mode.mode !== 'exempt') {
        a36 = art36Mean(valid.map(function (b) { return { id: b.id, v: num(b.total) }; }));
        if (a36) limit = a36.mean * (1 - mode.threshold);
      }
    }
    /* lines: median unit price per line over the valid offers that priced it */
    var validIds = valid.map(function (b) { return b.id; });
    var lines = (inp.lines || []).filter(function (l) { return l && l.id != null; }).map(function (l) {
      /* empty quantity = 1 lump sum (as bidnormalize, D-TND-6 d), so a lump-sum line is never silently negligible */
      var q0 = num(l.qty), qty = q0 == null ? 1 : q0, cells = {}, ups = [];
      if (q0 == null) warnings.push({ k: 'qtyLS', line: l.id });
      validIds.forEach(function (id) { var up = num((l.prices || {})[id]); if (up != null && up >= 0) { cells[id] = { up: up }; ups.push(up); } });
      var med = ups.length >= sc.minLinePrices ? median(ups) : null;
      return { id: l.id, desc: l.desc || '', unit: l.unit || '', qty: qty, qtyAssumed: q0 == null, nPrices: ups.length, median: med, cells: cells };
    });
    var medTotal = sum(lines.map(function (l) { return l.median != null && l.qty != null ? l.qty * l.median : 0; }));
    lines.forEach(function (l) {
      l.amount = l.median != null && l.qty != null ? l.qty * l.median : null;
      l.share = l.amount != null && medTotal > 0 ? l.amount / medTotal : null;
      l.negligible = l.share == null || l.share < sc.lineMinShare - 1e-12;
      Object.keys(l.cells).forEach(function (id) {
        var c = l.cells[id];
        c.dev = l.median > 0 ? c.up / l.median - 1 : null;
        c.flag = '';
        if (c.dev != null && !l.negligible) {
          if (c.dev <= -sc.lineLow + 1e-12) c.flag = 'low';
          else if (c.dev >= sc.lineHigh - 1e-12) c.flag = 'high';
        }
      });
    });
    /* per offer */
    var order = valid.slice().sort(function (a, b) { return num(a.total) - num(b.total); });
    var rank = {}; order.forEach(function (b, i) { rank[b.id] = i + 1; });
    var out = bids.map(function (b) {
      var t = num(b.total), r = { id: b.id, name: b.name || String(b.id), total: t, irregular: !!b.irregular, valid: has(validIds, b.id), reasons: [], flag: '' };
      if (!r.valid) { r.flag = b.irregular ? 'irregular' : 'invalid'; return r; }
      var others = vals.length > 1 ? (sum(vals) - t) / (vals.length - 1) : null;
      r.rank = rank[b.id];
      r.devMean = stats.mean ? t / stats.mean - 1 : null;
      r.devMedian = stats.median ? t / stats.median - 1 : null;
      r.meanOthers = others;
      r.devOthers = others ? t / others - 1 : null;
      r.devArt36 = a36 ? t / a36.mean - 1 : null;
      var nxt = order[r.rank]; r.gapNext = nxt ? 1 - t / num(nxt.total) : null;
      r.belowLimit = limit != null && le(t, limit);
      r.iqrLow = stats.fence != null && t < stats.fence - REL * Math.abs(stats.fence);
      r.iqrHigh = stats.fenceHigh != null && t > stats.fenceHigh + REL * Math.abs(stats.fenceHigh);
      r.othersHigh = r.devOthers != null && r.devOthers >= sc.othersDev - 1e-12;
      r.othersLow = r.devOthers != null && r.devOthers <= -sc.othersDev + 1e-12;
      r.estLow = est != null && le(t, est * (1 - sc.estDev));
      r.devEst = est != null ? t / est - 1 : null;
      var lo = [], hi = [], atMed = t, priced = 0, cover = 0;
      lines.forEach(function (l) {
        var c = l.cells[b.id]; if (!c) return; priced++; cover += l.qty * c.up;
        if (c.flag === 'low') { lo.push(l.id); if (l.qty != null) atMed += l.qty * (l.median - c.up); }
        if (c.flag === 'high') hi.push(l.id);
      });
      r.linesLow = lo; r.linesHigh = hi; r.linesPriced = priced;
      /* share of the offer total that the priced lines cover (sum of qty x unit price / total) */
      r.lineCoverage = priced ? cover / t : null;
      if (priced && r.lineCoverage < 0.9) warnings.push({ k: 'coverage', bid: b.id, share: r.lineCoverage });
      r.totalAtMedian = lo.length ? atMed : t;
      r.gapExplained = lo.length && others != null && others > t ? (atMed - t) / (others - t) : null;
      if (r.belowLimit) r.reasons.push('art36');
      if (r.iqrLow) r.reasons.push('iqr');
      if (r.othersLow) r.reasons.push('others');
      if (r.estLow) r.reasons.push('estimate');
      if (lo.length) r.reasons.push('lines_low');
      if (hi.length) r.reasons.push('lines_high');
      var nLow = r.reasons.length;
      /* art. 36 §1 also covers abnormally high prices: mirror screens on the total (practice), reported apart from the low signals */
      if (r.iqrHigh) r.reasons.push('iqr_high');
      if (r.othersHigh) r.reasons.push('others_high');
      if (regime === 'be' && mode.mode === 'mandatory' && r.belowLimit) r.flag = 'must';
      else if (nLow) r.flag = regime === 'be' && mode.mode === 'exempt' ? 'watch' : 'should';
      else if (r.reasons.length) r.flag = 'high';
      return r;
    });
    var must = out.filter(function (r) { return r.flag === 'must'; }).map(function (r) { return r.id; });
    var should = out.filter(function (r) { return r.flag === 'should'; }).map(function (r) { return r.id; });
    var watch = out.filter(function (r) { return r.flag === 'watch'; }).map(function (r) { return r.id; });
    var high = out.filter(function (r) { return r.flag === 'high'; }).map(function (r) { return r.id; });
    return { ok: !errors.length, errors: errors, warnings: warnings, version: VERSION, regime: regime, screen: sc, estimate: est,
             stats: stats, mode: mode, art36: a36 ? { mean: a36.mean, kept: a36.kept, low: a36.low, high: a36.high, nHigh: a36.nHigh, threshold: mode.threshold, limit: limit } : null,
             bids: out, lines: lines, lineBase: medTotal, must: must, should: should, watch: watch, high: high, enquire: must.concat(should), rules: BE_SOURCE };
  }

  /* outcome of the enquiry, art. 36 §3 and notifications §5 (KB text NL/FR, read in _tnd/core/dl/kb20170418_nl.txt:574-592).
     j = {grounds:{g1,g2,g3,g4,social: 'na'|'open'|'ok'|'weak'}, lineAbnormal, totalAbnormal, high (the abnormal price is high, not low),
          socialBreach, envOnly (the art. 7 breach is in environmental law only), stateAidIncompatible, received}, ctx = {kind, aboveEU}
     §3 al. 1 = 1°–3°, al. 2 = art. 7 breach (mandatory rejection), al. 3 = information from others, al. 4 = State aid.
     §5: al. 1 auditor-general on every rejection for an abnormal (low or high) price; al. 2 SIOD only for federal social or labour law;
     al. 3 European Commission for incompatible State aid; al. 4 accreditation commission only for works rejected for an abnormally LOW price. */
  var GROUNDS = ['g1', 'g2', 'g3', 'g4', 'social'];
  function outcome(j, ctx) {
    j = j || {}; ctx = ctx || {};
    var g = j.grounds || {}, open = GROUNDS.filter(function (k) { return g[k] === 'open'; }), weak = GROUNDS.filter(function (k) { return g[k] === 'weak'; });
    var dec, art, low = true;
    if (j.socialBreach) { dec = 'reject_social'; art = 'art. 36 §3 al. 2'; }
    else if (j.stateAidIncompatible) { dec = 'reject_aid'; art = 'art. 36 §3 al. 4'; }
    else if (j.lineAbnormal) { dec = 'reject_line'; art = 'art. 36 §3, 1°'; low = !j.high; }
    else if (j.totalAbnormal) { dec = 'reject_total'; art = 'art. 36 §3, 2°'; low = !j.high; }
    else if (!j.received || open.length) { dec = 'pending'; art = 'art. 36 §2'; }
    else { dec = 'motivate'; art = 'art. 36 §3, 3°'; }
    var notify = [];
    if (dec.indexOf('reject') === 0) {
      notify.push('bma');
      if (dec === 'reject_social' && !j.envOnly) notify.push('siod');
      if (dec === 'reject_aid') notify.push('ec');
      if (ctx.kind === 'works' && low) notify.push('erkenning');
    }
    return { decision: dec, article: art, direction: dec.indexOf('reject') === 0 ? (low ? 'low' : 'high') : '', open: open, weak: weak, notify: notify,
             caution: dec === 'motivate' && weak.length ? 'weak_grounds' : (dec === 'reject_aid' && ctx.aboveEU === false ? 'aid_rule_above_eu_only' : '') };
  }

  /* calendar: Belgian public holidays (Wet 04.01.1974 + KB 18.04.1974: ten days, Easter by the anonymous Gregorian algorithm) */
  function easterUTC(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(y, mo - 1, da);
  }
  var DAY = 86400000, HOL = {};
  function holidaySet(y) {
    if (HOL[y]) return HOL[y];
    var e = easterUTC(y), set = {};
    [Date.UTC(y, 0, 1), e + DAY, Date.UTC(y, 4, 1), e + 39 * DAY, e + 50 * DAY, Date.UTC(y, 6, 21), Date.UTC(y, 7, 15), Date.UTC(y, 10, 1), Date.UTC(y, 10, 11), Date.UTC(y, 11, 25)]
      .forEach(function (t) { set[t] = 1; });
    return (HOL[y] = set);
  }
  function isWorkingUTC(t) { var d = new Date(t), w = d.getUTCDay(); return w !== 0 && w !== 6 && !holidaySet(d.getUTCFullYear())[t]; }
  function iso(t) { var x = new Date(t); function p(v) { return (v < 10 ? '0' : '') + v; } return x.getUTCFullYear() + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate()); }
  /* 'YYYY-MM-DD' that is a real calendar date -> UTC ms, else null */
  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]), x = new Date(t);
    return x.getUTCFullYear() === +m[1] && x.getUTCMonth() === +m[2] - 1 && x.getUTCDate() === +m[3] ? t : null;
  }
  /* answer period of art. 36 §2 counted per Reg. 1182/71 art. 3 (Wet 17.06.2016 art. 167): the request day is not counted (3(1)), calendar
     days including weekends and holidays (3(3)); a last day on a Saturday, Sunday or Belgian public holiday moves to the next working day
     (3(4)); a period of two days or more holds at least two working days (3(5)).
     -> {start, days, calendar, due, rolled, rule: ''|'art3_4'|'art3_5'} or null */
  function deadlineInfo(isoDate, days) {
    var t0 = parseISO(isoDate); if (t0 == null) return null;
    var d = num(days); d = d == null || d < 0 ? BE.days : Math.round(d);
    var cal = t0 + d * DAY, end = cal, rule = '', guard = 0;
    while (!isWorkingUTC(end) && guard++ < 30) { end += DAY; rule = 'art3_4'; }
    if (d >= 2) {
      var wd = 0; for (var t = t0 + DAY; t <= end; t += DAY) if (isWorkingUTC(t)) wd++;
      while (wd < 2 && guard++ < 60) { end += DAY; if (isWorkingUTC(end)) { wd++; rule = 'art3_5'; } }
    }
    return { start: iso(t0), days: d, calendar: iso(cal), due: iso(end), rolled: end !== cal, rule: rule };
  }
  function deadline(isoDate, days) { var r = deadlineInfo(isoDate, days); return r ? r.due : null; }

  /* ---- presets (labels and ahas live in the page; every aha is a test in _tnd/lowbidcheck/test.mjs) ---- */
  function L9(id, desc, qty, unit, p) { return { id: id, desc: desc, qty: qty, unit: unit, prices: p }; }
  function P5(a, b, c, d, e) { return { B1: a, B2: b, B3: c, B4: d, B5: e }; }
  var PRESETS = [
    { id: 'be-works-open8', regime: 'be', title: 'Road and sewer renewal, municipality, open procedure, price only',
      be: { kind: 'works', procedure: 'open', priceOnly: true, valueEst: 2100000 },
      bids: [ { id: 'B1', name: 'Aannemer A', total: 1790000 }, { id: 'B2', name: 'Aannemer B', total: 1948900 }, { id: 'B3', name: 'Aannemer C', total: 2015300 },
              { id: 'B4', name: 'Aannemer D', total: 2064700 }, { id: 'B5', name: 'Aannemer E', total: 2101800 }, { id: 'B6', name: 'Aannemer F', total: 2187500 },
              { id: 'B7', name: 'Aannemer G', total: 2655000 }, { id: 'B8', name: 'Aannemer H', total: 2790000 } ],
      lines: [], screen: { estimate: 2100000 } },
    { id: 'be-works-pq-lines', regime: 'be', title: 'School renovation, open procedure, price 60 % / quality 40 %, documents set 20 %',
      be: { kind: 'works', procedure: 'open', priceOnly: false, priceWeight: 0.6, threshold: 0.20, valueEst: 3900000 },
      bids: [ { id: 'B1', name: 'Bouwbedrijf A', total: 3350000 }, { id: 'B2', name: 'Bouwbedrijf B', total: 3910000 }, { id: 'B3', name: 'Bouwbedrijf C', total: 4020000 },
              { id: 'B4', name: 'Bouwbedrijf D', total: 4105000 }, { id: 'B5', name: 'Bouwbedrijf E', total: 4390000 } ],
      lines: [ L9('01', 'Earthworks / grondwerken', 2400, 'm³', P5(28, 31, 30, 33, 35)),
               L9('02', 'Concrete C30/37 / beton', 1150, 'm³', P5(165, 172, 168, 175, 181)),
               L9('03', 'Reinforcement steel BE500 / wapening', 98000, 'kg', P5(0.78, 1.42, 1.45, 1.48, 1.55)),
               L9('04', 'Masonry / metselwerk', 3800, 'm²', P5(62, 66, 64, 69, 71)),
               L9('05', 'Air handling unit with heat recovery / ventilatiegroep met WTW', 4, 'pc', P5(21500, 41000, 43500, 42800, 46000)),
               L9('06', 'Electrical installation / elektrische installatie', 1, 'LS', P5(410000, 445000, 452000, 438000, 470000)),
               L9('07', 'Windows / buitenschrijnwerk', 620, 'm²', P5(395, 410, 402, 425, 440)),
               L9('08', 'Floor finishes / vloerafwerking', 2900, 'm²', P5(54, 58, 57, 61, 60)),
               L9('09', 'Site establishment / werfinrichting', 1, 'LS', P5(85000, 120000, 118000, 125000, 131000)) ],
      screen: {} },
    { id: 'be-supplies-gensets', regime: 'be', title: 'Three 1 250 kVA standby generator sets for a public hospital, open procedure, price only',
      be: { kind: 'supplies', procedure: 'open', priceOnly: true, valueEst: 950000 },
      bids: [ { id: 'G1', name: 'Supplier 1', total: 612000 }, { id: 'G2', name: 'Supplier 2', total: 905000 }, { id: 'G3', name: 'Supplier 3', total: 948000 },
              { id: 'G4', name: 'Supplier 4', total: 962000 }, { id: 'G5', name: 'Supplier 5', total: 1010000 }, { id: 'G6', name: 'Supplier 6', total: 1075000 } ],
      lines: [], screen: { estimate: 950000 } },
    { id: 'private-epc-unbalanced', regime: 'private', title: 'Private EPC (FIDIC Yellow style) for a process unit, 4 offers, owner\'s estimate 48 M€',
      be: {},
      bids: [ { id: 'E1', name: 'EPC 1', total: 45600000 }, { id: 'E2', name: 'EPC 2', total: 47600000 }, { id: 'E3', name: 'EPC 3', total: 48300000 }, { id: 'E4', name: 'EPC 4', total: 49900000 } ],
      lines: [ { id: 'A', desc: 'Engineering', qty: 1, unit: 'LS', prices: { E1: 5900000, E2: 5600000, E3: 5800000, E4: 6100000 } },
               { id: 'B', desc: 'Main equipment', qty: 1, unit: 'LS', prices: { E1: 17600000, E2: 17900000, E3: 18200000, E4: 18700000 } },
               { id: 'C', desc: 'Bulk materials', qty: 1, unit: 'LS', prices: { E1: 7700000, E2: 7900000, E3: 7800000, E4: 8100000 } },
               { id: 'D', desc: 'Construction and erection', qty: 1, unit: 'LS', prices: { E1: 12100000, E2: 12400000, E3: 12700000, E4: 12900000 } },
               { id: 'E', desc: 'Commissioning and start-up', qty: 1, unit: 'LS', prices: { E1: 180000, E2: 1450000, E3: 1520000, E4: 1380000 } },
               { id: 'F', desc: 'Two-year operating spares', qty: 1, unit: 'LS', prices: { E1: 60000, E2: 640000, E3: 610000, E4: 700000 } },
               { id: 'G', desc: 'Training and documentation', qty: 1, unit: 'LS', prices: { E1: 2060000, E2: 1710000, E3: 1670000, E4: 2020000 } } ],
      screen: { estimate: 48000000 } },
    { id: 'be-negotiated-small', regime: 'be', title: 'Works of 420 000 € by negotiated procedure without prior publication',
      be: { kind: 'works', procedure: 'negotiated-without-publication', priceOnly: true, valueEst: 420000 },
      bids: [ { id: 'B1', name: 'Aannemer 1', total: 312500 }, { id: 'B2', name: 'Aannemer 2', total: 386000 }, { id: 'B3', name: 'Aannemer 3', total: 401200 },
              { id: 'B4', name: 'Aannemer 4', total: 415800 }, { id: 'B5', name: 'Aannemer 5', total: 447300 } ],
      lines: [], screen: {} }
  ];
  function preset(id) { var p = PRESETS.filter(function (x) { return x.id === id; })[0]; return p ? JSON.parse(JSON.stringify(p)) : null; }

  return { version: VERSION, BE: BE, BE_FALLBACK: BE_FALLBACK, BE_SOURCE: BE_SOURCE, MAX_TOTAL: MAX_TOTAL, SCREEN: SCREEN, PROCEDURES: PROCEDURES, NEGOTIATED: NEGOTIATED, KINDS: KINDS, REGIMES: REGIMES, GROUNDS: GROUNDS,
           quantile: quantile, median: median, art36Mean: art36Mean, beMode: beMode, analyse: analyse, outcome: outcome, deadline: deadline, deadlineInfo: deadlineInfo, parseISO: parseISO, isWorkingDay: function (s) { var t = parseISO(s); return t != null && isWorkingUTC(t); }, num: num,
           PRESETS: PRESETS, preset: preset };
}));
