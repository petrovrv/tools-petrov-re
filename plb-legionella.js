/* plb-legionella.js — PLBLeg: legionella risk screening, dead legs and control plan for drinking-water installations.
   Pure functions, no DOM, deterministic. UMD: global PLBLeg / module.exports. Method: _plb/leg/METHOD.md (plblegionella-1.3).
   Legal part: Flemish Legionellabesluit (BVR 9.2.2007, codex.vlaanderen.be DID 1015749, Art. 1 version 01.06.2023) — scope,
   obligations and the KVE/l levels are taken from the decree text; everything technical (60/55 °C, 3-litre rule, flushing interval,
   intervals, the screening points) is good practice from DVGW W 551, VDI/DVGW 6023, HSG274, CEN/TR 16355 and is labelled so.
   The risk class is ORDINAL (low < moderate < high < very_high) with reasons — never a probability (D-PLB-3). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.PLBLeg = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var VERSION = 'plblegionella-1.3';

  /* pipe series [od, wall] — same values as PLBCore.MATERIALS (EN 1057, EN 10312, ISO 15875 SDR 7.4, ISO 21003); PLBCore wins when loaded */
  var SERIES = {
    copper: [[12, 1], [15, 1], [18, 1], [22, 1], [28, 1.5], [35, 1.5], [42, 1.5], [54, 2]],
    stainless: [[15, 1], [18, 1], [22, 1.2], [28, 1.2], [35, 1.5], [42, 1.5], [54, 1.5]],
    pex_sdr74: [[16, 2.2], [20, 2.8], [25, 3.5], [32, 4.4], [40, 5.5], [50, 6.9], [63, 8.6]],
    multilayer: [[16, 2], [20, 2], [26, 3], [32, 3], [40, 3.5], [50, 4], [63, 4.5]]
  };
  var MATERIAL_IDS = ['copper', 'stainless', 'pex_sdr74', 'multilayer'];
  function core() { var c = root && root.PLBCore; if (!c && typeof require === 'function') { try { c = require('./plumbing-core.js'); } catch (e) { c = null; } } return c || null; }
  function innerDiameter(material, od) {
    var c = core(), m = c && c.MATERIALS && c.MATERIALS[material];
    if (m && Array.isArray(m.series)) { for (var i = 0; i < m.series.length; i++) if (Math.abs(m.series[i].od_mm - od) < 1e-9) return m.series[i].id_mm; }
    var s = SERIES[material] || [];
    for (var j = 0; j < s.length; j++) if (Math.abs(s[j][0] - od) < 1e-9) return s[j][0] - 2 * s[j][1];
    return null;
  }
  function sizes(material) { return (SERIES[material] || []).map(function (p) { return p[0]; }); }

  var ESTABLISHMENTS = ['hospital', 'care_home', 'assisted_living', 'hotel', 'campsite', 'youth_stay', 'sports', 'pool_sauna', 'school', 'office', 'residential', 'industrial'];
  /* susceptibility points (screening scheme, learning assumption built on the decree's "gevoelige personen", Art. 1 17°) */
  var SUSC = { hospital: 3, care_home: 3, assisted_living: 3, hotel: 2, campsite: 2, pool_sauna: 2, youth_stay: 1, sports: 1, school: 1, office: 1, residential: 1, industrial: 1 };
  var CARE = { hospital: 1, care_home: 1, assisted_living: 1 };
  /* default public access per establishment (Art. 1 28°: services to the public, care, education, sport, campsites ...) */
  var PUBLIC_DEFAULT = { hospital: true, care_home: true, assisted_living: true, hotel: true, campsite: true, youth_stay: true, sports: true, pool_sauna: true, school: true, office: false, residential: false, industrial: false };
  var REGIONS = ['be_flanders', 'be_brussels', 'be_wallonia', 'nl', 'de', 'fr', 'uk', 'other'];

  var DEFAULTS = {
    region: 'be_flanders', establishment: 'care_home', public_access: true, showers: true, hot_water: true, persons_day: 80,
    T_store: 60, preheat: 'none', circulation: true, T_return_min: 55, circ_stop_h: 0, T_cold_max: 18, cold_limit: 20,
    aerosol_points: 0, special_aerosol: false, n_stagnant: 0, flush_days: 7,
    dead_leg_L: 3, time_limit_s: 60, T_store_min: 60, T_circ_min: 55, circ_stop_max_h: 8,
    samples: [], alert_campaigns_prev: 0, same_point_3x: false,
    V_store_L: null, V_pipe_L: null,   /* DVGW W 551 class: store volume and largest pipe-run volume heater -> outlet, L; null = unknown */
    one_two_family: false,             /* DVGW W 551: installation in a one- or two-family house = small regardless of volumes (X2-5) */
    dead_legs: []
  };
  /* physical ranges, validated in the engine (D-PLB-14) */
  var RANGES = { persons_day: [0, 1e6], T_store: [0, 100], T_return_min: [0, 100], circ_stop_h: [0, 24], T_cold_max: [0, 100], cold_limit: [0, 100],
    aerosol_points: [0, 1e5], n_stagnant: [0, 1e5], flush_days: [0.5, 365], dead_leg_L: [0.01, 1000], time_limit_s: [1, 3600], T_store_min: [0, 100],
    T_circ_min: [0, 100], circ_stop_max_h: [0, 24], alert_campaigns_prev: [0, 1000], V_store_L: [0, 1e6], V_pipe_L: [0, 1e5] };
  var INTEGER = ['persons_day', 'aerosol_points', 'n_stagnant', 'alert_campaigns_prev'];
  var W551_STORE_L = 400, W551_PIPE_L = 3;
  /* fixed DVGW W 551 values, checked independently of the editable design targets (Y4-2): heater outlet 60 °C, circulation 55 °C,
     circulation stop at most 8 h per day, 3 L per hot pipe run without circulation (DVGW consumer page "Heizungsraum", read 06.11.2026) */
  var W551_T_STORE = 60, W551_T_RETURN = 55, W551_STOP_H = 8;
  /* VDI/DVGW 6023: all water exchanged at the latest after 72 h (VDI, "Wenn Gebäude lange Zeit leer stehen") -> 3 d for region 'de' (Y4-3) */
  var VDI6023_DAYS = 3;
  function stagnationDays(o) { return o.region === 'de' ? Math.min(o.flush_days, VDI6023_DAYS) : o.flush_days; }

  function num(v, d) { var x = typeof v === 'number' ? v : (v === '' || v == null ? NaN : Number(v)); return isFinite(x) ? x : d; }
  /* strict booleans (X2-2): true/false, 1/0, 'true'/'false', '1'/'0'; anything else -> null (input error, never false) */
  function bool(v) { if (v === true || v === 1 || v === '1' || v === 'true') return true; if (v === false || v === 0 || v === '0' || v === 'false') return false; return null; }
  var BOOLS = ['public_access', 'showers', 'hot_water', 'circulation', 'special_aerosol', 'same_point_3x', 'one_two_family'];

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function normalize(inp) {
    var o = {}, e = [];
    inp = inp && typeof inp === 'object' ? inp : {};
    Object.keys(DEFAULTS).forEach(function (k) { o[k] = own(inp, k) && inp[k] !== undefined ? inp[k] : DEFAULTS[k]; });
    if (REGIONS.indexOf(o.region) < 0) e.push('region');
    if (ESTABLISHMENTS.indexOf(o.establishment) < 0) e.push('establishment');
    BOOLS.forEach(function (k) { var b = bool(o[k]); if (b === null) e.push('bool:' + k); o[k] = b; });
    Object.keys(RANGES).forEach(function (k) {
      if ((k === 'V_store_L' || k === 'V_pipe_L') && (o[k] === null || o[k] === '')) { o[k] = null; return; }
      o[k] = num(o[k], NaN);
      var r = RANGES[k];
      if (!isFinite(o[k]) || o[k] < r[0] || o[k] > r[1] || (INTEGER.indexOf(k) >= 0 && Math.floor(o[k]) !== o[k])) e.push(k);
    });
    if (['none', 'daily60', 'unheated'].indexOf(o.preheat) < 0) e.push('preheat');
    o.samples = Array.isArray(o.samples) ? o.samples.map(function (v) { return num(v, NaN); }) : [];
    if (o.samples.some(function (v) { return !(v >= 0) || !isFinite(v); })) e.push('samples');
    if (o.samples.length > 500) e.push('samples');
    o.dead_legs = Array.isArray(o.dead_legs) ? o.dead_legs : [];
    if (o.dead_legs.length > 200) e.push('dead_legs');
    var legs = [];
    o.dead_legs.forEach(function (d, i) {
      if (!d || typeof d !== 'object' || Array.isArray(d)) { e.push('dead_legs.' + (i + 1)); return; }
      var r = { id: String(d.id == null || d.id === '' ? 'D' + (i + 1) : d.id).slice(0, 24), hot: bool(d.hot) === true, material: own(d, 'material') && d.material ? d.material : 'copper',
        od: num(d.od, NaN), L: num(d.L, NaN), q: num(d.q, NaN), idle_days: d.idle_days == null || d.idle_days === '' ? 0 : num(d.idle_days, NaN) };
      if (MATERIAL_IDS.indexOf(r.material) < 0) e.push('dead_legs.' + r.id + '.material');
      r.id_mm = innerDiameter(r.material, r.od);
      if (r.id_mm == null) e.push('dead_legs.' + r.id + '.od');
      if (!(r.L >= 0 && r.L <= 1000)) e.push('dead_legs.' + r.id + '.L');
      if (!(r.q > 0 && r.q <= 10)) e.push('dead_legs.' + r.id + '.q');
      if (!(r.idle_days >= 0 && r.idle_days <= 3650)) e.push('dead_legs.' + r.id + '.idle_days');
      legs.push(r);
    });
    o.dead_legs = legs;
    return { o: o, errors: e };
  }

  /* ---------- 1 legal scope (Flanders, Legionellabesluit) ---------- */
  function legalScope(o) {
    if (o.region !== 'be_flanders') return { id: 'other_region', articles: [], reason: 'region' };
    if (!o.public_access) return { id: 'none', articles: ['Art. 1 28°'], reason: 'not_public' };
    /* Art. 1 35°: excluded are only systems with nothing but toilets or washbasins without showers — no shower and no other aerosol outlet (X2-1) */
    if (!o.showers && !o.special_aerosol && o.aerosol_points < 1) return { id: 'none', articles: ['Art. 1 35°'], reason: 'no_showers' };
    if (CARE[o.establishment]) return { id: 'high', articles: ['Art. 1 18°', 'Art. 4–10'], reason: 'care' };
    if (!o.hot_water || o.persons_day < 15) return { id: 'none', articles: ['Art. 1 9°', 'Art. 1 22°'], reason: 'not_collective' };
    if (o.persons_day <= 40) return { id: 'moderate_exempt', articles: ['Art. 18'], reason: 'max40' };
    return { id: 'moderate', articles: ['Art. 1 22°', 'Art. 11–17'], reason: 'collective' };
  }
  var OBLIGATIONS = {
    high: [['bbt', 'Art. 4'], ['renovation', 'Art. 5'], ['plan', 'Art. 6 §1, §3'], ['risk', 'Art. 6 §4'], ['temp', 'Art. 6 §5'], ['review', 'Art. 6 §3'], ['scald', 'Art. 7'], ['register', 'Art. 8'],
      ['sampling', 'Art. 9 §1'], ['levels_high', 'Art. 9 §2–5'], ['attest', 'Art. 10']],
    moderate: [['bbt', 'Art. 11'], ['renovation', 'Art. 12'], ['plan', 'Art. 13 §1, §3'], ['risk', 'Art. 13 §4'], ['temp', 'Art. 13 §5'], ['review', 'Art. 13 §3'], ['scald', 'Art. 14'], ['register', 'Art. 15'],
      ['sampling', 'Art. 16 §1'], ['levels_mod', 'Art. 16 §2–3'], ['attest', 'Art. 17']],
    /* Art. 18 exempts only from Art. 13–17: Art. 11 (BBT) and Art. 12 (renovation) still apply (CR-14) */
    moderate_exempt: [['bbt', 'Art. 11'], ['renovation', 'Art. 12'], ['ex_60', 'Art. 18'], ['ex_scald', 'Art. 18'], ['ex_service', 'Art. 18'], ['ex_inform', 'Art. 18']],
    none: [], other_region: []
  };

  /* ---------- 2 sampling level ---------- */
  function samplingLevel(o, scope) {
    var n = o.samples.length, sh = function (x) { return n ? o.samples.filter(function (v) { return v > x; }).length / n : 0; };
    var r = { n: n, share_1k: sh(1000), share_10k: sh(10000), share_100k: sh(100000), max: n ? Math.max.apply(null, o.samples) : null, id: 'none', basis: '' };
    if (scope === 'high') {
      if (r.share_100k >= 0.3 || o.same_point_3x || (r.share_10k >= 0.3 && o.alert_campaigns_prev >= 2)) { r.id = 'report'; r.basis = 'Art. 9 §4–5'; }
      else if (r.share_10k >= 0.3) { r.id = 'alert_high'; r.basis = 'Art. 9 §3'; }
      else if (r.share_1k >= 0.3) { r.id = 'vigilance'; r.basis = 'Art. 9 §2'; }
    } else if (scope === 'moderate') {
      if (r.share_100k >= 0.3) { r.id = 'report'; r.basis = 'Art. 16 §3'; }
      else if (r.share_10k >= 0.3) { r.id = 'alert_high'; r.basis = 'Art. 16 §2'; }
    } else if (n && r.max > 1000) { r.id = 'above_1000'; r.basis = 'EU 2020/2184 Annex I Part D (1000 CFU/l)'; }
    return r;
  }

  /* ---------- 3 dead legs ---------- */
  function deadLeg(d, o) {
    var area_l_per_m = Math.PI / 4 * d.id_mm * d.id_mm / 1000;      /* litres per metre: π/4·d²[mm²]·1 m / 1000 */
    var V = area_l_per_m * d.L, t = V / d.q;
    /* over_volume: editable design limit dead_leg_L; w551_over_3L: the fixed W 551 3-litre rule, whatever the design limit (Y4-2) */
    var r = { id: d.id, hot: d.hot, material: d.material, od: d.od, id_mm: d.id_mm, L: d.L, q: d.q, idle_days: d.idle_days,
      l_per_m: area_l_per_m, V_L: V, t_purge_s: t, L_max_m: o.dead_leg_L / area_l_per_m, L_max_3L_m: W551_PIPE_L / area_l_per_m,
      over_volume: d.hot && V > o.dead_leg_L + 1e-12, w551_over_3L: d.hot && V > W551_PIPE_L + 1e-12, slow: t > o.time_limit_s + 1e-12,
      stagnant: d.idle_days > stagnationDays(o) + 1e-12 };
    return r;
  }

  /* ---------- 4 screening points (learning assumption; reasons keep their technical basis) ---------- */
  function band(x, edges) { for (var i = 0; i < edges.length; i++) if (x <= edges[i]) return i; return edges.length; }
  /* DVGW W 551 installation class: large if the store holds > 400 L or one pipe run heater -> outlet > 3 L (CR-30);
     one- and two-family houses are small installations regardless of store and pipe volume (X2-5) */
  function w551Class(o, legs) {
    if (o.one_two_family) return 'small';
    var pipe = o.V_pipe_L;
    legs.forEach(function (l) { if (l.hot && (pipe == null || l.V_L > pipe)) pipe = l.V_L; });
    if (o.V_store_L != null && o.V_store_L > W551_STORE_L) return 'large';
    if (pipe != null && pipe > W551_PIPE_L + 1e-12) return 'large';
    if (o.V_store_L != null && o.V_pipe_L != null) return 'small';
    return 'unknown';
  }
  function hazard(o, legs, w551) {
    var items = [], add = function (key, pts, basis, val) { if (pts > 0) items.push({ key: key, pts: pts, basis: basis, value: val }); };
    if (o.hot_water) {
      add('store', o.T_store >= o.T_store_min ? 0 : (o.T_store >= 55 ? 2 : 4), 'DVGW W 551; departementzorg.be (≥ 60 °C)', o.T_store);
      add('preheat', o.preheat === 'unheated' ? 2 : 0, 'DVGW W 551 (preheat stage heated to 60 °C daily)', null);
      if (o.circulation) {
        add('return', o.T_return_min >= o.T_circ_min ? 0 : (o.T_return_min >= 50 ? 2 : 4), 'DVGW W 551; CEN/TR 16355 (≥ 55 °C)', o.T_return_min);
        add('circ_stop', o.circ_stop_h > o.circ_stop_max_h + 1e-12 ? 2 : 0, 'DVGW W 551 (stop ≤ 8 h/day)', o.circ_stop_h);
      } else add('no_circ_large', w551 === 'large' ? 3 : 0, 'DVGW W 551 (large installation: circulation required, ≤ 3 L per run without it)', null);
    }
    add('cold', o.T_cold_max > 25 ? 3 : (o.T_cold_max > o.cold_limit ? 1 : 0), 'VDI/DVGW 6023 (≤ 25 °C); departementzorg.be, HSG274 (< 20 °C)', o.T_cold_max);
    var over = legs.filter(function (l) { return l.over_volume; }).length;
    add('dead_legs', Math.min(4, over), 'DVGW W 551 (3-litre rule)', over);
    var stag = o.n_stagnant + legs.filter(function (l) { return l.stagnant; }).length;
    add('stagnation', [0, 1, 2, 3][band(stag, [0, 5, 20])], 'VDI/DVGW 6023 (use within 72 h); HSG274 (weekly flushing)', stag);
    var pts = items.reduce(function (s, x) { return s + x.pts; }, 0);
    /* H bands (CR-15): 0 -> 1, 1–3 -> 2, 4–7 -> 3, >= 8 -> 4 */
    var level = 1 + band(pts, [0, 3, 7]);
    /* store in the growth range (CR-5, D-PLB-9): < 50 °C, or < 55 °C with highly susceptible occupants, forces H >= 3 */
    var growth = o.hot_water && (o.T_store < 50 || (o.T_store < 55 && (SUSC[o.establishment] || 1) >= 3));
    if (growth && level < 3) level = 3;
    return { items: items, points: pts, level: level, growth_store: !!growth, stagnant_total: stag, over_volume: over };
  }
  function consequence(o) {
    var S = SUSC[o.establishment] || 1;
    /* showers are aerosol points: with showers=true at least one is counted (CR-5) */
    var a = o.showers && o.aerosol_points < 1 ? 1 : o.aerosol_points;
    var E = (a <= 0 ? 0 : (a <= 10 ? 1 : 2)) + (o.special_aerosol ? 1 : 0);
    var C = Math.max(1, Math.min(4, S + E - 1));
    return { S: S, E: E, level: C, aerosol_points: a, aerosol_assumed: a !== o.aerosol_points };
  }
  var CLASSES = ['low', 'moderate', 'high', 'very_high'];
  function classOf(R) { return R <= 3 ? 'low' : (R <= 6 ? 'moderate' : (R <= 9 ? 'high' : 'very_high')); }
  var LEVEL_FLOOR = { vigilance: 'moderate', alert_high: 'high', report: 'very_high', above_1000: 'high' };

  /* ---------- 5 control plan: periodic tasks (mepplanner task format) + one-off measures ---------- */
  function plan(o, scope, lvl, cls, haz, legs, aer) {
    var tasks = [], measures = [], inScope = scope === 'high' || scope === 'moderate';
    var T = function (id, months, days, hours, statutory, basis, count) {
      tasks.push({ id: 'LEG-' + id, task_key: id, asset_id: 'DHW', kind: statutory ? 'statutory' : 'time', interval_months: months, interval_days: days, trade: 'plumber',
        hours: Math.round(hours * 100) / 100, statutory: !!statutory, basis: basis, count: count == null ? null : count, origin: 'plblegionella' });
    };
    if (o.hot_water) {
      T('temp_heater', 1, 30, 0.5, false, 'DVGW W 551; HSG274 Part 2 (monthly heater outlet/return check) — learning assumption interval');
      T('temp_sentinel', 1, 30, 1, false, 'HSG274 Part 2 (monthly sentinel outlets, hot and cold)');
    } else T('temp_sentinel', 1, 30, 1, false, 'HSG274 Part 2 (monthly sentinel outlets, cold)');
    /* flushing every flush_days (CR-13): VDI/DVGW 6023 asks for water exchange at least every 72 h, HSG274 weekly */
    /* Germany: VDI/DVGW 6023 72 h (3 d) caps the interval (Y4-3); elsewhere the input flush_days (default 7 d, HSG274 weekly) */
    var sd = stagnationDays(o);
    if (haz.stagnant_total > 0) T('flush', sd * 12 / 364, sd, 0.05 * haz.stagnant_total, false, (o.region === 'de' ? 'VDI/DVGW 6023 (water exchange at the latest every 72 h = 3 d, applied for Germany)' : 'Flushing interval ' + sd + ' d (input; HSG274 Part 2 weekly flushing of little-used outlets; VDI/DVGW 6023 72 h)') + (o.region === 'be_flanders' ? '; Art. 7/14 scald protection in Flanders' : ''), haz.stagnant_total);
    if (aer > 0) T('showerheads', 3, 91, 0.1 * aer, false, 'HSG274 Part 2 (quarterly descaling/disinfection of shower heads and hoses)', o.aerosol_points);
    if (o.hot_water) T('heater_service', 12, 365, 4, scope === 'moderate_exempt', scope === 'moderate_exempt' ? 'Legionellabesluit Art. 18 (annual maintenance by a professional incl. temperature validation)' : 'HSG274 Part 2; EN 806-5 (annual inspection, draining, cleaning)');
    var sm = { low: 12, moderate: 6, high: 3, very_high: 1 }[cls];
    var forced = lvl.id === 'alert_high' || lvl.id === 'report';
    if (forced) sm = 1;
    if (inScope) T('sampling', sm, Math.round(sm * 365.25 / 12), 2, true, (forced ? lvl.basis + ': monthly until < 10 000 KVE/l' + (lvl.id === 'report' && scope === 'high' ? '; after the restart at least 3 months on an intensive sampling plan agreed with the Afdeling Toezicht Volksgezondheid (Art. 9 §5 4°)' : '') : (scope === 'high' ? 'Art. 9 §1' : 'Art. 16 §1') + ': places and frequency set in the beheersplan, accredited lab; interval proposed by risk class (learning assumption)'));
    else if (cls === 'high' || cls === 'very_high' || lvl.id === 'above_1000') T('sampling', sm, Math.round(sm * 365.25 / 12), 2, false, 'Good practice for this risk class (learning assumption); EU 2020/2184 parameter 1000 CFU/l');
    T('review', inScope ? 24 : 24, 730, 4, false, inScope ? (scope === 'high' ? 'Art. 6 §3' : 'Art. 13 §3') + ': review at every change; 2-year routine review is a learning assumption' : 'HSG274 (review regularly, e.g. 2 years) — learning assumption');
    /* one-off measures */
    /* design target first; a laxer target never hides the fixed W 551 value (Y4-2) — then the measure names the W 551 value */
    if (o.hot_water && o.T_store < o.T_store_min) measures.push({ key: 'raise_store', t: o.T_store_min, basis: scope === 'moderate_exempt' ? 'Legionellabesluit Art. 18' : 'DVGW W 551' });
    else if (o.hot_water && o.T_store < W551_T_STORE) measures.push({ key: 'raise_store', t: W551_T_STORE, w551: true, basis: 'DVGW W 551 (60 °C at the heater outlet; design target ' + o.T_store_min + ' °C is lower)' });
    if (o.hot_water && o.preheat === 'unheated') measures.push({ key: 'preheat', basis: 'DVGW W 551' });
    if (o.hot_water && o.circulation && o.T_return_min < o.T_circ_min) measures.push({ key: 'balance', t: o.T_circ_min, basis: 'DVGW W 553; plbcirc' });
    else if (o.hot_water && o.circulation && o.T_return_min < W551_T_RETURN) measures.push({ key: 'balance', t: W551_T_RETURN, w551: true, basis: 'DVGW W 551 (55 °C in the circulation; design target ' + o.T_circ_min + ' °C is lower); DVGW W 553; plbcirc' });
    if (o.hot_water && o.circulation && o.circ_stop_h > o.circ_stop_max_h + 1e-12) measures.push({ key: 'circ_stop', h: o.circ_stop_max_h, basis: 'DVGW W 551' });
    else if (o.hot_water && o.circulation && o.circ_stop_h > W551_STOP_H + 1e-12) measures.push({ key: 'circ_stop', h: W551_STOP_H, w551: true, basis: 'DVGW W 551 (stop at most 8 h per day; design limit ' + o.circ_stop_max_h + ' h is longer)' });
    if (haz.items.some(function (i) { return i.key === 'no_circ_large'; })) measures.push({ key: 'add_circ', basis: 'DVGW W 551 (large installation)' });
    if (o.T_cold_max > o.cold_limit) measures.push({ key: 'cold', basis: 'VDI/DVGW 6023; HSG274' });
    legs.filter(function (l) { return l.over_volume; }).forEach(function (l) { measures.push({ key: 'dead_leg', id: l.id, basis: o.dead_leg_L === W551_PIPE_L ? 'DVGW W 551 (3-litre rule)' : 'Design limit ' + o.dead_leg_L + ' L (input); DVGW W 551: 3 L' }); });
    /* fixed W 551 3-litre rule, independent of the editable limit (Y4-2) */
    legs.filter(function (l) { return l.w551_over_3L && !l.over_volume; }).forEach(function (l) { measures.push({ key: 'dead_leg_w551', id: l.id, basis: 'DVGW W 551 (3-litre rule; design limit ' + o.dead_leg_L + ' L is higher)' }); });
    /* sampling levels (decree text, codex.vlaanderen.be DID 1015749): high-risk Art. 9 §2 vigilance, §3 critical review, §5 report = §2 + §3 + 1°–4°;
       moderate-risk Art. 16 §2 critical review, §3 report (Y4-1) */
    if (scope === 'high' && (lvl.id === 'vigilance' || lvl.id === 'alert_high' || lvl.id === 'report')) measures.push({ key: 'vigilance', basis: 'Legionellabesluit Art. 9 §2' });
    if (lvl.id === 'alert_high' || (lvl.id === 'report' && scope === 'high')) measures.push({ key: 'critical_review', basis: scope === 'high' ? 'Legionellabesluit Art. 9 §3' : 'Legionellabesluit Art. 16 §2' });
    if (lvl.id === 'report' && scope === 'high') {
      measures.push({ key: 'report_notify', basis: 'Legionellabesluit Art. 9 §5 1°' });
      measures.push({ key: 'stop_aerosol', basis: 'Legionellabesluit Art. 9 §5 1°' });
      measures.push({ key: 'report_reduce', basis: 'Legionellabesluit Art. 9 §5 2°' });
      measures.push({ key: 'restart_samples', basis: 'Legionellabesluit Art. 9 §5 3°' });
      measures.push({ key: 'intensive_sampling', months: 3, basis: 'Legionellabesluit Art. 9 §5 4°' });
    } else if (lvl.id === 'report' && scope === 'moderate') {
      measures.push({ key: 'report_notify', basis: 'Legionellabesluit Art. 16 §3' });
      measures.push({ key: 'inform_users', basis: 'Legionellabesluit Art. 16 §3' });
      measures.push({ key: 'report_reduce', basis: 'Legionellabesluit Art. 16 §3' });
      measures.push({ key: 'shutdown_1m', basis: 'Legionellabesluit Art. 16 §3' });
    }
    if (lvl.id === 'report' || lvl.id === 'alert_high' || haz.growth_store || (o.hot_water && (o.T_store < o.T_store_min || (o.circulation && o.T_return_min < 50)))) measures.push({ key: 'disinfect', basis: 'DVGW W 551 (≥ 70 °C, ≥ 3 min at every outlet)' });
    return { tasks: tasks, measures: measures };
  }

  function assess(inp) {
    var n = normalize(inp), o = n.o;
    if (n.errors.length) return { valid: false, errors: n.errors, version: VERSION };
    var scope = legalScope(o), lvl = samplingLevel(o, scope.id);
    var legs = o.dead_legs.map(function (d) { return deadLeg(d, o); });
    var w551 = o.hot_water ? w551Class(o, legs) : 'n/a';
    var haz = hazard(o, legs, w551), con = consequence(o);
    var R = haz.level * con.level, cls0 = classOf(R), cls = cls0;
    /* class floor "high" for a store in the growth range (D-PLB-9) */
    if (haz.growth_store && CLASSES.indexOf(cls0) < 2) cls0 = cls = 'high';
    var floor = LEVEL_FLOOR[lvl.id];
    if (floor && CLASSES.indexOf(floor) > CLASSES.indexOf(cls)) cls = floor;
    var p = plan(o, scope.id, lvl, cls, haz, legs, con.aerosol_points);
    var flags = [];
    if (haz.growth_store) flags.push('store_growth_range');
    if (con.aerosol_assumed) flags.push('aerosol_assumed');
    if (w551 === 'large') { flags.push('w551_large'); if (o.T_store < 60) flags.push('w551_large_below_60'); if (o.preheat === 'unheated') flags.push('w551_preheat_daily'); }
    if (w551 === 'unknown') flags.push('w551_unknown');
    if (w551 === 'small' && o.one_two_family) flags.push('w551_small_one_two_family');
    if (scope.id === 'moderate_exempt' && o.hot_water && o.T_store < 60) flags.push('exempt_below_60');
    if (haz.over_volume) flags.push('dead_legs_over_volume');
    if (legs.some(function (l) { return l.hot && l.slow; })) flags.push('slow_hot');
    if (lvl.id !== 'none') flags.push('sampling_' + lvl.id);
    if (o.T_cold_max > 25) flags.push('cold_over_25');
    if (cls !== cls0) flags.push('class_raised_by_sampling');
    /* fixed W 551 checks, independent of the editable targets (Y4-2) */
    var chk = { store_60: o.hot_water ? o.T_store >= W551_T_STORE : null, return_55: o.hot_water && o.circulation ? o.T_return_min >= W551_T_RETURN : null,
      circ_stop_8h: o.hot_water && o.circulation ? o.circ_stop_h <= W551_STOP_H + 1e-12 : null,
      dead_legs_over_3L: legs.filter(function (l) { return l.w551_over_3L; }).map(function (l) { return l.id; }) };
    if (chk.dead_legs_over_3L.length) flags.push('w551_dead_leg_3L');
    if (chk.store_60 === false && o.T_store >= o.T_store_min) flags.push('w551_store_target');
    if (chk.return_55 === false && o.T_return_min >= o.T_circ_min) flags.push('w551_return_target');
    if (chk.circ_stop_8h === false && o.circ_stop_h <= o.circ_stop_max_h + 1e-12) flags.push('w551_circ_stop_target');
    if (o.region === 'de' && o.flush_days > VDI6023_DAYS) flags.push('de_vdi6023_72h');
    if (lvl.id === 'report' && scope.id === 'high') flags.push('stop_aerosol_now');
    var hoursYear = p.tasks.reduce(function (s, t) { return s + t.hours * (t.task_key === 'flush' ? 364 / t.interval_days : 12 / t.interval_months); }, 0);
    return {
      valid: true, version: VERSION, input: o,
      scope: { id: scope.id, reason: scope.reason, articles: scope.articles, obligations: (OBLIGATIONS[scope.id] || []).map(function (x) { return { key: x[0], article: x[1] }; }) },
      sampling: lvl, dead_legs: legs, hazard: haz, w551_check: chk,
      stagnation: { days: stagnationDays(o), basis: o.region === 'de' ? 'VDI/DVGW 6023 (72 h)' : 'flush_days input (HSG274 weekly by default)' }, w551_class: w551, w551_reason: w551 === 'small' && o.one_two_family ? 'one_two_family' : null, consequence: con,
      H: haz.level, C: con.level, R: R, class_screen: cls0, class: cls, class_rank: CLASSES.indexOf(cls),
      tasks: p.tasks, measures: p.measures, hours_year: hoursYear, flags: flags
    };
  }

  /* ---------- presets (each with an "aha"; numbers checked in _plb/leg/test.mjs) ---------- */
  function leg(id, hot, material, od, L, q, idle) { return { id: id, hot: hot, material: material, od: od, L: L, q: q, idle_days: idle }; }
  function P(over) { var s = JSON.parse(JSON.stringify(DEFAULTS)); Object.keys(over).forEach(function (k) { s[k] = over[k]; }); return s; }
  var PRESETS = {
    care_home_ok: function () { return P({ region: 'be_flanders', establishment: 'care_home', persons_day: 80, T_store: 62, T_return_min: 57, T_cold_max: 18, aerosol_points: 84, n_stagnant: 6,
      dead_legs: [leg('Room 101 shower', true, 'multilayer', 16, 4, 0.15, 1), leg('Room 214 shower', true, 'multilayer', 16, 5, 0.15, 1), leg('Kitchen sink', true, 'copper', 15, 3, 0.07, 0)], project: 'care_home_80' }); },
    hotel_winter_wing: function () { return P({ region: 'be_flanders', establishment: 'hotel', persons_day: 180, T_store: 60, T_return_min: 55, T_cold_max: 19, aerosol_points: 98, n_stagnant: 40,
      dead_legs: [leg('Wing C riser end', true, 'copper', 15, 6, 0.15, 30), leg('Room 512 shower', true, 'multilayer', 16, 4, 0.15, 30)], project: 'hotel_120' }); },
    apartments_private: function () { return P({ region: 'be_flanders', establishment: 'residential', public_access: false, persons_day: 57, T_store: 60, T_return_min: 51, T_cold_max: 18, aerosol_points: 24,
      dead_legs: [leg('Flat 6.1 bathroom', true, 'multilayer', 16, 7, 0.15, 0), leg('Flat 6.4 bathroom', true, 'multilayer', 20, 9, 0.15, 0)], project: 'apartments_24' }); },
    sports_samples: function () { return P({ region: 'be_flanders', establishment: 'sports', persons_day: 120, T_store: 60, T_return_min: 53, circ_stop_h: 10, T_cold_max: 19, aerosol_points: 32,
      samples: [400, 800, 12000, 25000, 600, 15000, 900, 11000, 300, 700],
      dead_legs: [leg('Changing room 4 showers', true, 'copper', 22, 8, 0.15, 3)], project: 'sports_hall' }); },
    bnb_heatpump: function () { return P({ region: 'be_flanders', establishment: 'hotel', persons_day: 24, T_store: 55, T_return_min: 55, circulation: false, T_cold_max: 18, aerosol_points: 6,
      dead_legs: [leg('Room 1 shower', true, 'pex_sdr74', 20, 9, 0.15, 2), leg('Room 6 shower', true, 'pex_sdr74', 20, 14, 0.15, 5)] }); },
    school_dead_legs: function () { return P({ region: 'be_flanders', establishment: 'school', persons_day: 660, T_store: 60, T_return_min: 56, T_cold_max: 21, aerosol_points: 8, n_stagnant: 3,
      dead_legs: [leg('Gym showers (22 mm)', true, 'copper', 22, 10, 0.15, 2), leg('Gym showers (15 mm)', true, 'copper', 15, 10, 0.15, 2), leg('Lab eyewash', false, 'copper', 15, 12, 0.2, 60)], project: 'school_600' }); }
  };
  var PRESET_IDS = Object.keys(PRESETS);

  return { VERSION: VERSION, DEFAULTS: DEFAULTS, RANGES: RANGES, W551_STORE_L: W551_STORE_L, W551_PIPE_L: W551_PIPE_L, W551_T_STORE: W551_T_STORE, W551_T_RETURN: W551_T_RETURN, W551_STOP_H: W551_STOP_H,
    VDI6023_DAYS: VDI6023_DAYS, stagnationDays: stagnationDays, ESTABLISHMENTS: ESTABLISHMENTS, PUBLIC_DEFAULT: PUBLIC_DEFAULT, REGIONS: REGIONS, MATERIAL_IDS: MATERIAL_IDS, CLASSES: CLASSES,
    SUSC: SUSC, OBLIGATIONS: OBLIGATIONS, innerDiameter: innerDiameter, sizes: sizes, normalize: normalize, legalScope: legalScope, samplingLevel: samplingLevel,
    deadLeg: deadLeg, assess: assess, PRESETS: PRESETS, PRESET_IDS: PRESET_IDS };
});
