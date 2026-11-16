/* plb-fixtures.js — Sanitary Fixture Count engine of tools.petrov.re (plumbing package), global PLBFix.
 * Required WCs, urinals, washbasins, washing taps and showers per zone from three published workplace methods:
 *   be_codex — Belgian Codex over het welzijn op het werk, Book III Title 1 (workplaces), sanitary facilities, as published by FOD WASO
 *   de_asr   — German ASR A4.1 "Sanitärräume", Table 2 (low / high simultaneity)
 *   uk_l24   — HSE ACOP L24 (Workplace (Health, Safety and Welfare) Regulations 1992, reg. 20/21), Tables 1 and 2, paras 200-201
 * Pure functions, no DOM, deterministic. Method and sources: _plb/fix/METHOD.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PLBFix = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'plbfixtures-1.3';
  var OWNED = ['wc_cistern', 'urinal_flush', 'basin', 'shower'];

  var SOURCES = {
    be_codex: { title: 'Codex over het welzijn op het werk, Boek III Titel 1 Arbeidsplaatsen — sanitaire voorzieningen (FOD WASO summary page)', edition: 'consulted 2026-11-05',
      url: 'https://werk.belgie.be/nl/themas/welzijn-op-het-werk/arbeidsplaatsen/sociale-voorzieningen/sanitaire-voorzieningen', kind: 'regulation' },
    de_asr: { title: 'ASR A4.1 Sanitärräume, Tabelle 2 Mindestanzahl von Toiletten einschließlich Urinale, Handwaschgelegenheiten', edition: 'ASR A4.1 (2013, last amended 2022)',
      url: 'https://vorschriften.bgn-branchenwissen.de/daten/tr/asr_a4_1/5.htm', kind: 'regulation' },
    de_asr_small: { title: 'ASR A4.1 Nr. 4 Abs. 6 — up to nine employees: separate toilet rooms for women and men may be omitted if time-separated use is ensured', edition: 'ASR A4.1 (2013, last amended 2022), BGN mirror consulted 2026-11-06',
      url: 'https://vorschriften.bgn-branchenwissen.de/daten/tr/asr_a4_1/4.htm', kind: 'regulation' },
    uk_l24: { title: 'HSE L24 Workplace health, safety and welfare — Approved Code of Practice, Tables 1 and 2, para 200 (above 100 people) (reg. 20/21)', edition: 'L24 3rd ed. 2013, pp. 39-40',
      url: 'https://www.hse.gov.uk/pubns/priced/l24.pdf', kind: 'regulation' },
    uk_l24_dirty: { title: 'HSE L24 para 201 — dirty work with heavy soiling of face, hands and forearms: one washbasin per 10 people up to 50, one extra per further 20', edition: 'L24 3rd ed. 2013, p. 40',
      url: 'https://www.hse.gov.uk/pubns/priced/l24.pdf', kind: 'regulation' },
    access_vl: { title: 'Gewestelijke stedenbouwkundige verordening toegankelijkheid (Flanders, 2009) — an accessible toilet where toilets are provided in publicly accessible buildings; ASR V3a.2 for workplaces with disabled employees', edition: '2009 / ASR V3a.2',
      url: 'https://www.toegankelijkgebouw.be/', kind: 'regulation' },
    la_fix: { title: 'Tool assumption (learning_assumption): stated in METHOD.md, replace with the project brief', edition: VERSION, url: '', kind: 'learning_assumption' }
  };

  /* ---------- tables ---------- */
  var ASR = { upto: [5, 10, 25, 50, 75, 100, 130, 160, 190, 220, 250],
    low: [1, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11], lowB: [1, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4],
    high: [2, 3, 4, 6, 7, 9, 11, 13, 15, 17, 19], highB: [1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7] };
  var L24_T1 = { upto: [5, 25, 50, 75, 100], wc: [1, 2, 3, 4, 5] };
  var L24_T2 = { upto: [15, 30, 45, 60, 75, 90, 100], wc: [1, 2, 2, 3, 3, 4, 4], ur: [1, 1, 2, 2, 3, 3, 4] };

  function ceilDiv(a, b) { return a <= 0 ? 0 : Math.ceil(a / b); }
  function rowIdx(upto, n) { for (var i = 0; i < upto.length; i++) if (n <= upto[i]) return i; return -1; }

  function asr(n, high) {
    if (n <= 0) return { t: 0, b: 0, beyond: false };
    var i = rowIdx(ASR.upto, n);
    if (i >= 0) return { t: (high ? ASR.high : ASR.low)[i], b: (high ? ASR.highB : ASR.lowB)[i], beyond: false };
    var ex = n - 250, k = high ? 2 : 1;
    return { t: (high ? 19 : 11) + k * ceilDiv(ex, 30), b: (high ? 7 : 4) + k * ceilDiv(ex, 90), beyond: true };
  }
  function l24t1(n) {
    if (n <= 0) return { wc: 0, beyond: false };
    var i = rowIdx(L24_T1.upto, n);
    if (i >= 0) return { wc: L24_T1.wc[i], beyond: false };
    return { wc: 5 + ceilDiv(n - 100, 25), beyond: true };
  }
  function l24t2(n) {
    if (n <= 0) return { wc: 0, ur: 0, beyond: false };
    var i = rowIdx(L24_T2.upto, n);
    if (i >= 0) return { wc: L24_T2.wc[i], ur: L24_T2.ur[i], beyond: false };
    var k = ceilDiv(n - 100, 50);
    return { wc: 4 + k, ur: 4 + k, beyond: true };
  }
  /* L24 para 201: heavily soiling work -> 1 washbasin per 10 (or fraction) up to 50, +1 per further 20 (or fraction) */
  function l24dirty(n) { return n <= 0 ? 0 : n <= 50 ? ceilDiv(n, 10) : 5 + ceilDiv(n - 50, 20); }

  var DEFAULTS = { method: 'be_codex', simultaneity: 'low', uk_mode: 'separate', urinals: true, accessible: true, washing: 'none', showers: false, female_pct: 50, asr_shared: false };
  var MAX_CURVE_N = 1000;
  var METHODS = ['be_codex', 'de_asr', 'uk_l24'];

  function methodForRegion(region) {
    if (region === 'de') return 'de_asr';
    if (region === 'uk') return 'uk_l24';
    return 'be_codex';
  }

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null); }

  /* options for one zone: project options, overridden by the zone's own fields */
  function zoneOpts(zone, opts) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    /* null / '' = not given -> default (D-PLB-14); a given but non-numeric or out-of-range share makes the zone invalid in required() */
    if (opts) for (k in opts) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) || k === 'female_count') { if (opts[k] !== undefined && opts[k] !== null && opts[k] !== '') o[k] = opts[k]; }
    if (zone && typeof zone === 'object') {
      if (zone.female_pct !== undefined && zone.female_pct !== null && zone.female_pct !== '') o.female_pct = num(zone.female_pct) != null ? num(zone.female_pct) : zone.female_pct;
      if (zone.simultaneity === 'low' || zone.simultaneity === 'high') o.simultaneity = zone.simultaneity;
      if (zone.washing === 'none' || zone.washing === 'per3' || zone.washing === 'per5') o.washing = zone.washing;
      if (typeof zone.showers === 'boolean') o.showers = zone.showers;
    }
    if (METHODS.indexOf(o.method) < 0) o.method = 'be_codex';
    return o;
  }

  /* split persons by sex: F = floor(N * pct / 100 + 0.5), M = N - F */
  function split(n, pct) {
    var p = Math.min(100, Math.max(0, pct));
    var f = Math.floor(n * p / 100 + 0.5);
    if (f > n) f = n;
    return { f: f, m: n - f };
  }

  /* core: required fixtures for N persons present at the same time */
  function required(persons, o) {
    o = zoneOpts(null, o);
    var notes = [], basis = [o.method];
    var n = num(persons);
    if (n == null) return { valid: false, status: 'unknown', errors: ['persons_unknown'] };
    if (n < 0 || n > 100000) return { valid: false, status: 'invalid', errors: ['persons_range'] };
    /* a headcount is a whole number: fractions are rejected, not rounded (r3, X1-3) */
    if (Math.floor(n) !== n) return { valid: false, status: 'invalid', errors: ['persons_integer'] };
    var fp = num(o.female_pct);
    if (fp == null || fp < 0 || fp > 100) return { valid: false, status: 'invalid', errors: ['female_pct_invalid'] };
    o.female_pct = fp;
    var s;
    if (o.female_count !== undefined && o.female_count !== null) {
      var fc = num(o.female_count);
      if (fc == null || Math.floor(fc) !== fc || fc < 0 || fc > n) return { valid: false, status: 'invalid', errors: ['female_count_invalid'] };
      s = { f: fc, m: n - fc };
    } else s = split(n, o.female_pct);
    var W = { wc: 0, washbasins: 0 }, M = { wc: 0, urinals: 0, washbasins: 0 }, U = { wc: 0, washbasins: 0 };
    var recUr = 0, taps = 0, showers = 0, incomplete = [];

    if (o.method === 'be_codex') {
      W.wc = ceilDiv(s.f, 15);
      var pos = ceilDiv(s.m, 15);
      M.wc = o.urinals ? Math.min(pos, ceilDiv(s.m, 25)) : pos;
      M.urinals = pos - M.wc;
      W.washbasins = ceilDiv(W.wc, 4);
      M.washbasins = ceilDiv(M.wc + M.urinals, 4);
      if (o.washing === 'per3' || o.washing === 'per5') { var d = o.washing === 'per3' ? 3 : 5; taps = ceilDiv(s.f, d) + ceilDiv(s.m, d); notes.push(o.washing === 'per5' ? 'washing_per5' : 'washing_per3'); }
      if (o.showers) { showers = ceilDiv(s.f, 6) + ceilDiv(s.m, 6); notes.push('showers_per6'); }
      if (s.m > 0 && o.urinals && M.urinals > 0) notes.push('be_urinal_floor');
      notes.push('be_separation');
    } else if (o.method === 'de_asr') {
      var hi = o.simultaneity === 'high';
      if (o.asr_shared === true && n <= 9) {
        /* ASR A4.1 Nr. 4 (6): up to nine employees, shared rooms with time-separated use; Table 2 row for all n persons */
        var aa = asr(n, hi);
        U.wc = aa.t; U.washbasins = aa.b;
        basis.push('de_asr_small'); notes.push('asr_shared_small');
      } else {
        if (o.asr_shared === true) notes.push('asr_shared_over9');
        var af = asr(s.f, hi), am = asr(s.m, hi);
        W.wc = af.t; W.washbasins = af.b;
        M.wc = o.urinals ? ceilDiv(am.t, 3) : am.t;
        M.urinals = am.t - M.wc;
        M.washbasins = am.b;
        if (s.m > 0 && s.m <= 10 && !hi && o.urinals) { recUr = 1; notes.push('asr_urinal_recommended'); }
        if (af.beyond || am.beyond) notes.push('asr_beyond_250');
      }
      if (hi) notes.push('asr_high');
      /* ASR A4.1 Nr. 6 wash rooms (categories A/B/C, Tables 4, 5.1, 5.2) are not modelled: the result is not a complete minimum (r4, Y1-4) */
      if (o.washing !== 'none') incomplete.push('washing');
      if (o.showers) incomplete.push('showers');
    } else {
      if (o.uk_mode === 'mixed') {
        var t = l24t1(n);
        U.wc = t.wc; U.washbasins = t.wc;
        if (t.beyond) notes.push('l24_beyond_100');
        notes.push('l24_mixed_rooms');
      } else {
        var tf = l24t1(s.f);
        W.wc = tf.wc; W.washbasins = tf.wc;
        if (o.urinals) { var t2 = l24t2(s.m); M.wc = t2.wc; M.urinals = t2.ur; if (t2.beyond) notes.push('l24_beyond_100'); }
        else { var tm = l24t1(s.m); M.wc = tm.wc; if (tm.beyond) notes.push('l24_beyond_100'); }
        M.washbasins = l24t1(s.m).wc;
        if (tf.beyond) notes.push('l24_beyond_100');
      }
      /* washing requested = dirty work (r4, Y1-5): L24 para 201 raises the washbasins per group, never below Table 1 */
      if (o.washing !== 'none') {
        if (o.uk_mode === 'mixed') U.washbasins = Math.max(U.washbasins, l24dirty(n));
        else { W.washbasins = Math.max(W.washbasins, l24dirty(s.f)); M.washbasins = Math.max(M.washbasins, l24dirty(s.m)); }
        basis.push('uk_l24_dirty'); notes.push('l24_dirty_basins');
      }
      /* L24 gives no shower numbers (only "where required by the nature of the work") */
      if (o.showers) incomplete.push('showers');
    }
    if (incomplete.length) notes.push('wash_not_in_method');
    var anyWc = W.wc + M.wc + U.wc > 0;
    var acc = (o.accessible && anyWc) ? 1 : 0;
    if (acc) { basis.push('access_vl'); notes.push('accessible_extra'); }
    var fixtures = {
      wc_cistern: W.wc + M.wc + U.wc + acc,
      urinal_flush: M.urinals,
      basin: W.washbasins + M.washbasins + U.washbasins + acc + taps,
      shower: showers
    };
    var dedup = []; notes.forEach(function (x) { if (dedup.indexOf(x) < 0) dedup.push(x); });
    return { valid: true, status: 'ok', method: o.method, persons: n, female: s.f, male: s.m, women: W, men: M, unisex: U,
      accessible_wc: acc, recommended_urinals: recUr, washing_taps: taps, showers: showers,
      positions: W.wc + M.wc + U.wc + M.urinals, fixtures: fixtures, notes: dedup, basis: basis, incomplete: incomplete };
  }

  function zoneId(z, i) { return (z && z.id != null && String(z.id) !== '') ? String(z.id) : 'Z' + (i + 1); }

  /* assess every zone of a project document; pooled = the whole building as one zone (rounding comparison) */
  function assess(doc, opts) {
    var zones = (doc && Array.isArray(doc.zones)) ? doc.zones : [];
    var o = zoneOpts(null, opts);
    /* ASR A4.1 Nr. 4 (6) is a rule for the establishment ("Betrieben mit bis zu neun Beschäftigten"): one project document = one
       establishment, so shared rooms only when the valid headcount of all zones is <= 9; otherwise every zone gets separate groups (r4, Y1-3) */
    var est = 0;
    zones.forEach(function (z) { var q = required(z ? z.persons : null, zoneOpts(z, o)); if (q.valid) est += q.persons; });
    var overEst = o.method === 'de_asr' && o.asr_shared === true && est > 9;
    var rows = zones.map(function (z, i) {
      var zo = zoneOpts(z, o), zr = zo;
      if (overEst) { zr = zoneOpts(z, o); zr.asr_shared = false; }
      var r = required(z ? z.persons : null, zr);
      if (overEst && r.valid && r.notes.indexOf('asr_shared_over9') < 0) r.notes.push('asr_shared_over9');
      r.id = zoneId(z, i); r.name = (z && z.name) || ''; r.index = i; r.opts = zo;
      return r;
    });
    var tot = { persons: 0, female: 0, male: 0, wc_cistern: 0, urinal_flush: 0, basin: 0, shower: 0, accessible_wc: 0, positions: 0, recommended_urinals: 0, washing_taps: 0 };
    var unknown = [], invalid = [], incomplete = [];
    rows.forEach(function (r) {
      if (!r.valid) { unknown.push(r.id); if (r.status === 'invalid') invalid.push({ id: r.id, errors: r.errors }); return; }
      r.incomplete.forEach(function (x) { if (incomplete.indexOf(x) < 0) incomplete.push(x); });
      tot.persons += r.persons; tot.female += r.female; tot.male += r.male; tot.positions += r.positions;
      tot.accessible_wc += r.accessible_wc; tot.recommended_urinals += r.recommended_urinals; tot.washing_taps += r.washing_taps;
      OWNED.forEach(function (k) { tot[k] += r.fixtures[k]; });
    });
    var pooled = null;
    var valid = rows.filter(function (r) { return r.valid; });
    /* pooling compares rounding only: zones with a different ASR simultaneity than the project are not poolable */
    var mixedSim = o.method === 'de_asr' && valid.some(function (r) { return r.opts.simultaneity !== o.simultaneity; });
    if (valid.length > 1 && tot.persons > 0 && !mixedSim) {
      /* the pooled case keeps the exact sex split and the project options; zone-level overrides (washing, showers, simultaneity) of the first zone are not pooled */
      var po = zoneOpts(null, o); if (overEst) po.asr_shared = false;
      var pr = requiredSplit(tot.female, tot.male, po);
      pooled = { positions: pr.positions, fixtures: pr.fixtures, extra_positions: tot.positions - pr.positions };
    }
    return { version: VERSION, method: o.method, zones: rows, totals: tot, unknown: unknown, invalid: invalid, pooled: pooled,
      establishment_persons: est, incomplete: incomplete };
  }

  /* required() with an explicit sex split (used for the pooled building) */
  function requiredSplit(f, m, o) {
    var oo = zoneOpts(null, o); oo.female_count = f;
    return required(f + m, oo);
  }

  /* step curve for the chart: total WC + urinal positions for one sex group of n persons */
  function curve(method, group, o, maxN) {
    var pts = [], oo = zoneOpts(null, o); oo.method = method; oo.accessible = false;
    oo.female_pct = group === 'women' ? 100 : 0;
    if (method === 'uk_l24' && group === 'mixed') oo.uk_mode = 'mixed';
    var top = num(maxN); top = top == null ? 0 : Math.max(0, Math.min(MAX_CURVE_N, Math.floor(top)));
    for (var n = 0; n <= top; n++) { var r = required(n, oo); pts.push([n, r.valid ? r.positions : 0]); }
    return pts;
  }

  function existingCount(z, k) {
    var f = z && z.fixtures && typeof z.fixtures === 'object' ? z.fixtures : null;
    if (!f || !Object.prototype.hasOwnProperty.call(f, k)) return 0;
    var v = num(f[k]); return v != null && v > 0 ? v : 0;
  }

  /* per zone and owned fixture: count in the project, workplace minimum, count after Apply = max(existing, minimum) (D-PLB-6) */
  function compare(doc, result) {
    var zones = (doc && Array.isArray(doc.zones)) ? doc.zones : [], out = [];
    if (!result || !Array.isArray(result.zones)) return out;
    result.zones.forEach(function (r) {
      if (!r.valid || r.persons <= 0) return;
      var z = zones[r.index]; if (!z || typeof z !== 'object') return;
      OWNED.forEach(function (k) {
        var e = existingCount(z, k), q = r.fixtures[k];
        out.push({ id: r.id, index: r.index, key: k, existing: e, minimum: q, after: Math.max(e, q), shortfall: Math.max(0, q - e), surplus: Math.max(0, e - q) });
      });
    });
    return out;
  }

  /* write the inventory into the zones: owned keys only, a count is raised to the workplace minimum but never lowered or deleted;
     the minimum itself is kept as zone.workplace_min (D-PLB-6). Other keys and zones without people stay as they are. Returns a new document. */
  function applyToDoc(doc, result) {
    var d = JSON.parse(JSON.stringify(doc || {}));
    if (!Array.isArray(d.zones) || !result) return d;
    compare(d, result).forEach(function (c) {
      var z = d.zones[c.index];
      if (!z.fixtures || typeof z.fixtures !== 'object') z.fixtures = {};
      if (c.after > 0 && c.after !== c.existing) z.fixtures[c.key] = c.after;
      if (!z.workplace_min || typeof z.workplace_min !== 'object' || Array.isArray(z.workplace_min)) z.workplace_min = {};
      z.workplace_min[c.key] = c.minimum;
    });
    result.zones.forEach(function (r) {
      var z = d.zones[r.index];
      if (r.valid && r.persons > 0 && z && z.workplace_min) { z.workplace_min.method = r.method; z.workplace_min.version = VERSION; }
    });
    return d;
  }

  /* compact, serialisable results for modules.plbfixtures.results */
  function summary(result) {
    return { version: VERSION, method: result.method, totals: result.totals, unknown: result.unknown, incomplete: result.incomplete || [],
      zones: result.zones.map(function (r) { return r.valid ? { id: r.id, persons: r.persons, female: r.female, male: r.male, fixtures: r.fixtures, accessible_wc: r.accessible_wc, notes: r.notes, incomplete: r.incomplete } : { id: r.id, status: r.status }; }),
      pooled: result.pooled };
  }

  return { VERSION: VERSION, SOURCES: SOURCES, METHODS: METHODS, DEFAULTS: DEFAULTS, OWNED: OWNED, TABLES: { ASR: ASR, L24_T1: L24_T1, L24_T2: L24_T2 },
    methodForRegion: methodForRegion, zoneOpts: zoneOpts, split: split, required: required, requiredSplit: requiredSplit,
    assess: assess, curve: curve, compare: compare, applyToDoc: applyToDoc, MAX_CURVE_N: MAX_CURVE_N, summary: summary };
}));
