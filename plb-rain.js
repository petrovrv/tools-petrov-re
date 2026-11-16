/* plb-rain.js — rainwater reuse & infiltration engine for plbrainwater.html (tools.petrov.re, plumbing package).
 * Global PLBRain (browser) / module.exports (node). Pure functions, no DOM, deterministic.
 * Method: _plb/rain/METHOD.md (plbrain-1.3). Independent reference: bench-src/ref/gen_plbrainwater.py.
 *
 * 1. Rain: monthly normals (KMI/IRM Uccle 1991–2020) -> a deterministic synthetic daily series
 *    (two-state Markov chain of wet days, amounts 1 mm + exponential excess, Park–Miller minstd generator, fixed seed),
 *    each calendar month rescaled (excess above 1 mm) so that the series mean equals the monthly normal × rain factor.
 * 2. Tank: daily behavioural balance, yield-after-spillage (YAS, EN 16941-1 detailed approach):
 *    Y_t = min(D_t, V_{t-1}); V_t = min(V_{t-1} + Q_t − Y_t, S − Y_t); O_t = V_{t-1} + Q_t − Y_t − V_t;
 *    the first year of the series is run once as a warm-up (not counted), counting starts with its final storage.
 * 3. DIN 1989-1 simplified tank: V = 6 % × min(annual yield, annual demand).
 * 4. Flemish GSV Hemelwater 2023: minimum tank, infiltration and buffer volumes (see gsv()).
 * Volumes in m³ unless the name ends in _L, areas in m², rain in mm.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PLBRain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'plbrain-1.3';

  var SOURCES = {
    kmi_uccle: { title: 'KMI/IRM — Klimaatstatistieken Ukkel (INS 21016), normalen 1991–2020: maandneerslag en dagen met ≥ 1 mm', edition: 'normals 1991–2020', url: 'https://opendata.meteo.be/ftp/climate/climate_statistics/climate_INS21016_9120_nl.pdf', kind: 'public_guide' },
    vl_gsv_hemelwater: { title: 'Besluit van de Vlaamse Regering van 10 februari 2023 houdende vaststelling van een gewestelijke stedenbouwkundige verordening inzake hemelwater (Hemelwaterverordening 2023), art. 4, 7, 8, 9, 21, 22', edition: 'BVR 10.02.2023, in force 2 October 2023 (consolidated text Codex Vlaanderen, checked 2026-11-06)', url: 'https://codex.vlaanderen.be/PrintDocument.ashx?id=1038166', kind: 'regulation' },
    vl_gsv_info: { title: 'Omgeving Vlaanderen — Hemelwaterverordening (information page; municipalities and provinces may be stricter)', edition: '2025', url: 'https://www.omgeving.vlaanderen.be/nl/hemelwater-verordening', kind: 'public_guide' },
    din1989: { title: 'DIN 1989-1 Regenwassernutzungsanlagen — Planung, Ausführung, Betrieb und Wartung: Tabelle 3 Ertragsbeiwerte e (hard pitched roof 0.8, flat roof without gravel 0.8, with gravel 0.6, green roof intensive 0.3, extensive 0.5), filter efficiency 0.9, simplified tank size 6 %', edition: '2002-04', url: 'https://www.din.de/', kind: 'standard' },
    en16941: { title: 'EN 16941-1 On-site non-potable water systems — Part 1: Systems for the use of rainwater (daily behavioural simulation)', edition: '2018', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    minstd: { title: 'Park, S. K.; Miller, K. W. (1988) Random number generators: good ones are hard to find. Comm. ACM 31(10) — minimal standard generator x ← 16807·x mod (2³¹ − 1)', edition: '1988', url: '', kind: 'public_guide' },
    learning: { title: 'Learning assumption of this tool — typical value, replace with project data', edition: VERSION, url: '', kind: 'learning_assumption' }
  };

  /* KMI/IRM Uccle (INS 21016) normals 1991–2020: monthly precipitation mm (year 837.1) and days with ≥ 1 mm (year 133.0) */
  var RAIN = {
    uccle: { P_mm: [75.5, 65.1, 59.3, 46.7, 59.7, 70.8, 76.9, 86.5, 65.3, 67.8, 76.2, 87.4],
      wet: [13.1, 12.0, 11.3, 9.1, 10.0, 10.2, 10.4, 10.3, 9.6, 10.7, 12.4, 13.8], source: 'kmi_uccle' }
  };
  var DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var WET_MM = 1; /* KMI wet-day threshold: every generated wet day is ≥ 1 mm (r4 Y6-4) */
  var PERSISTENCE = 0.35; /* lag-1 persistence of wet days — learning assumption (typical 0.3–0.4 for Western Europe) */

  /* yield coefficients e (Ertragsbeiwert) of DIN 1989-1 Table 3, filter efficiency 0.9 (D-PLB-11) — not the
   * DIN 1986-100 runoff coefficients of drainage design (green roofs 0.3 / 0.1 there) */
  var ROOF_TYPES = {
    pitched_hard: { e: 0.8, source: 'din1989' },
    flat_bare: { e: 0.8, source: 'din1989' },
    flat_gravel: { e: 0.6, source: 'din1989' },
    green_extensive: { e: 0.5, source: 'din1989' },
    green_intensive: { e: 0.3, source: 'din1989' }
  };

  var DEFAULTS = {
    rain: 'uccle', rain_factor: 1.0, seed: 20231001, years: 30, persistence: 0.35,
    roof_m2: 120, roof_type: 'pitched_hard', filter_eta: 0.9, tank_m3: 5,
    persons: 4, wc_lpd: 24, laundry_lpd: 12, days_week: 7, garden_m2: 0, garden_mm: 100, other_m3y: 0,
    water_price: 5.5,
    /* GSV Hemelwater 2023 inputs */
    gsv_on: true, gsv_use: 'single', units: 1, gsv_works: 'new', existing_roof_m2: 0, existing_paved_m2: 0, existing_tank: false,
    green_m2: 0, green_50: true, paved_m2: 30, plot_m2: 500, gsv_infiltration: 'possible', units_connected: 1,
    no_use_justified: false /* art. 7 §3 exception, an explicit determination (r4 Y6-3), never inferred from zero demand */
  };

  /* ---------- 1. synthetic daily rain ---------- */
  function minstd(seed) {
    var x = Math.floor(Math.abs(seed)) % 2147483647; if (x === 0) x = 1;
    return function () { x = (x * 16807) % 2147483647; return x / 2147483647; };
  }
  /* Two-state Markov chain of wet (≥ 1 mm) and dry days per month with lag-1 persistence r:
   *   π = wet days / days in month; P(wet | wet) = π + r(1 − π); P(wet | dry) = π(1 − r).
   * Wet-day amount (r4 Y6-4): c + exponential excess with mean μ − c, μ = P_m / N_m, c = 1 mm (the KMI threshold) when μ ≥ 2 mm,
   * else c = 0: P = c − (μ − c)·ln(u). One generator draw decides the state, a second (wet days only) the amount.
   * Y6-5: a calendar month without any wet day in the whole series is redrawn (all its years, in order, same generator stream continued,
   * entering state = the stored previous day) until it has one. Then every calendar month is rescaled to years · P_m · rain factor:
   * the excess above c by (T − c·n)/(S − c·n) when T > c·n (wet days stay ≥ c), else the whole amount by T/S (D-PLB-11).
   * Returns {P:[365·years], month:[...], redrawn:[calendar months redrawn]}. */
  function dailySeries(rainId, factor, seed, years, persistence) {
    var R = RAIN[rainId] || RAIN.uccle, rnd = minstd(seed), P = [], M = [], wet = false, m, y, d, i;
    var r = persistence == null ? PERSISTENCE : persistence, MU = [], C = [], START = [], s0 = 0;
    for (m = 0; m < 12; m++) {
      MU.push(R.wet[m] > 0 ? R.P_mm[m] * factor / R.wet[m] : 0); C.push(MU[m] >= 2 * WET_MM ? WET_MM : 0); START.push(s0); s0 += DAYS[m];
    }
    function month(m, i0, wetBefore) {
      var pi = Math.max(0, Math.min(1, R.wet[m] / DAYS[m])), p11 = pi + r * (1 - pi), p01 = pi * (1 - r), w = wetBefore;
      for (var k = 0; k < DAYS[m]; k++) {
        w = rnd() < (w ? p11 : p01);
        P[i0 + k] = w ? C[m] - (MU[m] - C[m]) * Math.log(rnd()) : 0; M[i0 + k] = m;
      }
      return w;
    }
    for (y = 0; y < years; y++) for (m = 0; m < 12; m++) wet = month(m, y * 365 + START[m], wet);
    var tot = [], n = [], redrawn = [];
    function sums(m) {
      tot[m] = 0; n[m] = 0;
      for (y = 0; y < years; y++) for (d = 0; d < DAYS[m]; d++) { i = y * 365 + START[m] + d; if (P[i] > 0) { tot[m] += P[i]; n[m]++; } }
    }
    for (m = 0; m < 12; m++) {
      sums(m);
      for (var pass = 0; n[m] === 0 && R.wet[m] > 0 && pass < 1000; pass++) {
        for (y = 0; y < years; y++) { i = y * 365 + START[m]; month(m, i, i > 0 && P[i - 1] > 0); }
        sums(m); if (pass === 0) redrawn.push(m);
      }
    }
    for (m = 0; m < 12; m++) {
      var T = years * R.P_mm[m] * factor, c = C[m], ex = T > c * n[m] && tot[m] > c * n[m];
      var k = tot[m] > 0 ? (ex ? (T - c * n[m]) / (tot[m] - c * n[m]) : T / tot[m]) : 1;
      for (y = 0; y < years; y++) for (d = 0; d < DAYS[m]; d++) {
        i = y * 365 + START[m] + d;
        if (P[i] > 0) P[i] = ex ? c + (P[i] - c) * k : P[i] * k;
      }
    }
    return { P: P, month: M, redrawn: redrawn };
  }

  /* ---------- 2. demand and balance ---------- */
  /* D-PLB-14: undefined / null / '' = missing -> default (null and '' listed in o.defaulted, never 0); a numeric string
   * is read, anything else (text, boolean, ±Infinity, NaN) stays NaN and becomes a validation error */
  var NUMS = ['rain_factor', 'persistence', 'seed', 'years', 'roof_m2', 'filter_eta', 'tank_m3', 'persons', 'wc_lpd', 'laundry_lpd', 'days_week', 'garden_m2', 'garden_mm', 'other_m3y', 'water_price', 'units', 'existing_roof_m2', 'existing_paved_m2', 'green_m2', 'paved_m2', 'plot_m2', 'units_connected'];
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'string' && v.trim() !== '' && isFinite(+v)) return +v;
    return NaN;
  }
  function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function bool(v, d) { return v === true || v === 'true' ? true : (v === false || v === 'false' ? false : d); }
  function normalise(inp) {
    var o = {}, def = []; inp = inp && typeof inp === 'object' ? inp : {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = own(inp, k) ? inp[k] : undefined;
      if (v === undefined || v === null || v === '') { o[k] = DEFAULTS[k]; if (v === null || v === '') def.push(k); }
      else o[k] = v;
    });
    NUMS.forEach(function (k) { o[k] = num(o[k]); });
    o.defaulted = def;
    if (isFinite(o.years)) o.years = Math.max(1, Math.min(50, Math.round(o.years)));
    o.gsv_on = bool(o.gsv_on, true); o.existing_tank = bool(o.existing_tank, false); o.green_50 = bool(o.green_50, true);
    o.no_use_justified = bool(o.no_use_justified, false);
    if (isFinite(o.units)) o.units = Math.max(0, Math.round(o.units));
    if (isFinite(o.units_connected)) o.units_connected = Math.round(o.units_connected);
    return o;
  }
  /* X3-1: a present but unrecognised choice is an input error 'choice:<field>', never replaced by a default
     (a typo in gsv_infiltration must not remove the buffer obligation); missing values got the default in normalise() */
  var CHOICES = { rain: function (v) { return own(RAIN, v); }, roof_type: function (v) { return own(ROOF_TYPES, v); },
    gsv_use: ['single', 'multi', 'none'], gsv_works: ['new', 'extension'], gsv_infiltration: ['possible', 'impossible'] };
  function validate(o) {
    var e = [];
    Object.keys(CHOICES).forEach(function (k) {
      var c = CHOICES[k], ok = typeof o[k] === 'string' && (typeof c === 'function' ? c(o[k]) : c.indexOf(o[k]) >= 0);
      if (!ok) e.push('choice:' + k);
    });
    NUMS.forEach(function (k) { if (!isFinite(o[k])) e.push(k); });
    if (e.length) return e;
    if (!(o.roof_m2 >= 0 && o.roof_m2 <= 1e6)) e.push('roof_m2');
    if (!(o.tank_m3 >= 0 && o.tank_m3 <= 1e5)) e.push('tank_m3');
    if (!(o.filter_eta > 0 && o.filter_eta <= 1)) e.push('filter_eta');
    if (!(o.rain_factor > 0 && o.rain_factor <= 3)) e.push('rain_factor');
    if (!(o.persistence >= 0 && o.persistence < 1)) e.push('persistence');
    if (!(o.persons >= 0 && o.persons <= 1e5)) e.push('persons');
    if (!(o.days_week >= 0 && o.days_week <= 7)) e.push('days_week');
    var MAX = { wc_lpd: 500, laundry_lpd: 500, garden_m2: 1e6, garden_mm: 3000, other_m3y: 1e7, water_price: 100, units: 1e5, existing_roof_m2: 1e6,
      existing_paved_m2: 1e6, green_m2: 1e6, paved_m2: 1e7, plot_m2: 1e8 };
    Object.keys(MAX).forEach(function (k) { if (!(o[k] >= 0 && o[k] <= MAX[k])) e.push(k); });
    if (!(o.units_connected >= 1 && o.units_connected <= 1e5)) e.push('units_connected');
    return e;
  }
  /* daily demand m³ for day-of-year index (0..364) */
  function demandParts(o) {
    var house = o.persons * (o.wc_lpd + o.laundry_lpd) * (o.days_week / 7) / 1000;
    var gardenYear = o.garden_m2 * o.garden_mm / 1000, gardenDays = 183; /* 1 April – 30 September */
    return { house_m3d: house, garden_m3d: gardenYear / gardenDays, other_m3d: o.other_m3y / 365,
      annual_m3: house * 365 + gardenYear + o.other_m3y };
  }
  var GARDEN_FIRST = 90, GARDEN_LAST = 272; /* day index 90 = 1 April, 272 = 30 September (non-leap) */

  /* roof connected to the tank: the roof, plus the existing roof for an extension */
  function connectedRoof(o) { return o.roof_m2 + (o.gsv_works === 'extension' ? o.existing_roof_m2 : 0); }
  function simulate(o, series, tank) {
    var S = Math.max(0, tank), A = connectedRoof(o) * ROOF_TYPES[o.roof_type].e * o.filter_eta / 1000;
    var dp = demandParts(o), V = 0, tot = { rain_mm: 0, inflow: 0, demand: 0, yield: 0, overflow: 0, overflow_days: 0, empty_days: 0 };
    var monthly = []; for (var m = 0; m < 12; m++) monthly.push({ inflow: 0, demand: 0, yield: 0, overflow: 0 });
    var n = series.P.length, years = n / 365, t, doy, P, Q, D, Y, Vn, O;
    function dem(d) { return dp.house_m3d + dp.other_m3d + (d >= GARDEN_FIRST && d <= GARDEN_LAST ? dp.garden_m3d : 0); }
    /* warm-up: the first year once, not counted (CR-70) */
    for (t = 0; t < Math.min(365, n); t++) { Y = Math.min(dem(t), V); V = Math.min(V + A * series.P[t] - Y, S - Y); }
    var V0 = V;
    for (t = 0; t < n; t++) {
      doy = t % 365; P = series.P[t]; Q = A * P; D = dem(doy);
      /* yield after spillage in the published form (EN 16941-1 behavioural model, Jenkins et al. 1978 / Fewkes YAS) */
      Y = Math.min(D, V); Vn = Math.min(V + Q - Y, S - Y); O = Math.max(0, V + Q - Y - Vn);
      V = Vn;
      tot.rain_mm += P; tot.inflow += Q; tot.demand += D; tot.yield += Y; tot.overflow += O;
      if (O > 1e-12) tot.overflow_days++;
      if (V <= 1e-12) tot.empty_days++;
      var mm = series.month[t]; monthly[mm].inflow += Q; monthly[mm].demand += D; monthly[mm].yield += Y; monthly[mm].overflow += O;
    }
    var r = {}; Object.keys(tot).forEach(function (k) { r[k] = tot[k] / years; });
    r.monthly = monthly.map(function (x) { return { inflow: x.inflow / years, demand: x.demand / years, yield: x.yield / years, overflow: x.overflow / years }; });
    r.storage_start = V0; r.storage_end = V;
    r.mains = r.demand - r.yield;
    r.coverage = r.demand > 0 ? r.yield / r.demand : 0;
    r.efficiency = r.inflow > 0 ? r.yield / r.inflow : 0;
    return r;
  }

  /* ---------- 3. DIN 1989-1 simplified ---------- */
  function din1989(o) {
    var R = RAIN[o.rain] || RAIN.uccle, Pyear = 0; R.P_mm.forEach(function (p) { Pyear += p; }); Pyear *= o.rain_factor;
    var yieldY = connectedRoof(o) * ROOF_TYPES[o.roof_type].e * o.filter_eta * Pyear / 1000, dem = demandParts(o).annual_m3;
    return { P_year_mm: Pyear, yield_m3: yieldY, demand_m3: dem, V_m3: 0.06 * Math.min(yieldY, dem), limited_by: yieldY < dem ? 'yield' : 'demand' };
  }

  /* ---------- 4. GSV Hemelwater 2023 (Flanders), BVR 10.02.2023, in force 2.10.2023 ----------
   * Pre-check of the minimum volumes for one permit application; returns codes + numbers, the page words them.
   * Tank (art. 7): counted roof A_t (§6) = raw new roof incl. green roof (extension: + min(2 × raw extension, existing roof)),
 *   then the green roof part ≥ 50 L/m² halved (§6 third paragraph applies to the first and second paragraph, r4 Y6-1);
   *   one dwelling (§1): < 80 m² 5000 L, < 120 m² 7500 L, < 200 m² 10 000 L, ≥ 200 m² 100 L/m²;
   *   several dwellings (§2): 100 L/m², one dwelling connected per started 5000 L of tank (min 1, ≤ dwellings);
   *   no dwelling (§3): 100 L/m² unless no use is demonstrated (explicit input no_use_justified, r4 Y6-3); existing tank + rebuild/extension: no extra tank (§1, §2),
   *   or (§3) only when the extra tank would be ≥ 10 000 L.
   * Infiltration (art. 8): plot ≥ 120 m²; A_i = paving (new, or extension + min(2 × ext., existing)) + A_t − 30 m² per connected
   *   dwelling (30 m² without dwellings) when a compliant tank is present; area ≥ 8 % A_i, buffer volume ≥ 33 L/m² A_i.
   * Buffer (art. 9): infiltration technically impossible and A_i ≥ 1000 m²: 43 L/m², outflow ≤ 5 l/s/ha. */
  function gsvCheck(o) {
    if (!o.gsv_on) return { applies: false };
    var ext = o.gsv_works === 'extension';
    /* r4 Y6-1: the existing-roof share is taken on raw areas, then only the qualifying green part is halved
       (the existing roof is counted fully: its green share is not an input) */
    var roofRaw = o.roof_m2 + o.green_m2, greenCut = o.green_m2 > 0 && o.green_50 ? o.green_m2 / 2 : 0;
    var roofCounted = roofRaw + (ext ? Math.min(2 * roofRaw, o.existing_roof_m2) : 0) - greenCut;
    var pavedCounted = ext ? o.paved_m2 + Math.min(2 * o.paved_m2, o.existing_paved_m2) : o.paved_m2;
    var tankL = o.tank_m3 * 1000;
    var rule, req = 0, need = true;
    if (o.gsv_use === 'single') {
      if (ext && o.existing_tank) { rule = 'existing_tank'; need = false; }
      else if (roofCounted < 80) { rule = 'lt80'; req = 5000; }
      else if (roofCounted < 120) { rule = 'r80_120'; req = 7500; }
      else if (roofCounted < 200) { rule = 'r120_200'; req = 10000; }
      else { rule = 'ge200'; req = 100 * roofCounted; }
    } else if (o.gsv_use === 'multi') {
      if (ext && o.existing_tank) { rule = 'existing_tank'; need = false; }
      else { rule = 'multi'; req = 100 * roofCounted; }
    } else {
      if (o.no_use_justified) { rule = 'no_use'; need = false; }
      else if (ext && o.existing_tank && 100 * roofCounted < 10000) { rule = 'existing_lt10000'; need = false; }
      else { rule = 'nodwelling'; req = 100 * roofCounted; }
    }
    if (roofCounted <= 0 && need) { need = false; req = 0; rule = 'no_roof'; }
    var tankOk = !need || tankL + 1e-9 >= req;
    var unitsMin = o.gsv_use === 'single' ? 1 : (o.gsv_use === 'multi' && need ? Math.min(Math.max(1, o.units), Math.max(1, Math.ceil(Math.max(tankL, req) / 5000 - 1e-9))) : 0);
    /* infiltration: the 30 m² deduction needs a compliant (or existing, connected) tank */
    var tankPresent = need ? tankOk : (rule === 'existing_tank' || rule === 'existing_lt10000');
    /* dwellings connected to the tank (CR-69, input, default 1): at least units_min when a tank is required, at most the dwellings */
    var uc = Math.min(Math.max(1, o.units), o.units_connected);
    var connected = o.gsv_use === 'single' ? 1 : (o.gsv_use === 'multi' ? (need ? Math.max(unitsMin, uc) : uc) : 0);
    var gross = pavedCounted + roofCounted;
    var deduction = tankPresent ? Math.min(gross, o.gsv_use === 'none' ? 30 : 30 * connected) : 0;
    var Ai = gross - deduction;
    var inf = { applies: false, reason: '', area_counted_m2: Ai, deduction_m2: deduction, area_min_m2: 0, volume_min_L: 0 };
    var buf = { applies: false, reason: '', volume_L: 0, q_max_ls: 0 };
    if (o.plot_m2 < 120) inf.reason = 'plot_lt120';
    else if (Ai <= 0) inf.reason = 'no_area';
    else if (o.gsv_infiltration === 'possible') { inf.applies = true; inf.area_min_m2 = 0.08 * Ai; inf.volume_min_L = 33 * Ai; }
    else {
      inf.reason = 'impossible';
      if (Ai >= 1000) { buf.applies = true; buf.volume_L = 43 * Ai; buf.q_max_ls = 5 * Ai / 10000; }
      else buf.reason = 'lt1000';
    }
    return { applies: true, roof_counted_m2: roofCounted, paved_counted_m2: pavedCounted, tank_rule: rule, tank_required: need,
      tank_min_L: req, tank_provided_L: tankL, tank_ok: tankOk, units_min: unitsMin, units_connected: connected, infiltration: inf, buffer: buf,
      source: 'vl_gsv_hemelwater' };
  }
  /* flat view used by the bench and the CSV */
  function gsvFlat(g) {
    if (!g || !g.applies) return { applies: false };
    return { applies: true, roof_counted_m2: g.roof_counted_m2, tank_rule: g.tank_rule, tank_min_L: g.tank_min_L, tank_ok: g.tank_ok, units_min: g.units_min,
      inf_applies: g.infiltration.applies, inf_reason: g.infiltration.reason, inf_area_counted_m2: g.infiltration.area_counted_m2,
      inf_area_min_m2: g.infiltration.area_min_m2, inf_volume_min_L: g.infiltration.volume_min_L,
      buffer_applies: g.buffer.applies, buffer_volume_L: g.buffer.volume_L, buffer_q_ls: g.buffer.q_max_ls };
  }
  var GSV = gsvCheck;

  /* ---------- curve: yield vs tank volume ---------- */
  function curveVolumes(o, din) {
    var top = Math.max(10, Math.ceil(Math.max(o.tank_m3, din.V_m3) * 3)), v = [], steps = 24;
    for (var i = 0; i <= steps; i++) v.push(Math.round(top * i / steps * 1000) / 1000);
    return v;
  }
  function curve(o, series, vols) {
    return vols.map(function (S) { var r = simulate(o, series, S); return { V: S, yield: r.yield, coverage: r.coverage, overflow_days: r.overflow_days, efficiency: r.efficiency }; });
  }

  function solve(inp) {
    var o = normalise(inp), errors = validate(o);
    if (errors.length) return { valid: false, errors: errors, input: o };
    var series = dailySeries(o.rain, o.rain_factor, o.seed, o.years, o.persistence);
    var sim = simulate(o, series, o.tank_m3), din = din1989(o), dp = demandParts(o);
    var vols = curveVolumes(o, din), cv = curve(o, series, vols);
    var g = GSV ? GSV(o) : null;
    var flags = [];
    if (sim.coverage < 0.5 && sim.demand > 0) flags.push('low_coverage');
    if (o.tank_m3 > 0 && sim.overflow_days < 3 && sim.efficiency > 0.97) flags.push('roof_limited');
    if (g && g.applies && !g.tank_ok) flags.push('tank_below_gsv');
    if (sim.demand <= 0) flags.push('no_demand');
    if (g && g.applies && o.gsv_use === 'none' && sim.demand <= 0 && !o.no_use_justified && g.tank_required) flags.push('gsv_no_use_unproven');
    if (series.redrawn.length) flags.push('dry_month_redrawn');
    if (o.defaulted.length) flags.push('defaults_used');
    return { valid: true, version: VERSION, input: o, sim: sim, din: din, demand: dp, curve: cv, gsv: g,
      savings_eur: sim.yield * o.water_price, flags: flags };
  }

  /* presets with an "aha" (inputs only; the page adds labels). Persons/roofs follow PLBCore.PRESET_PROJECTS where it fits. */
  function P(o) { return function () { var r = {}; Object.keys(DEFAULTS).forEach(function (k) { r[k] = DEFAULTS[k]; }); Object.keys(o).forEach(function (k) { r[k] = o[k]; }); return r; }; }
  var PRESETS = {
    /* 120 m² roof -> GSV 10 000 L, yet 5 m³ already covers ~98 % of WC + laundry: the legal volume buys storm buffering, not water */
    house_gsv: P({ roof_m2: 120, tank_m3: 10, persons: 4, paved_m2: 30, plot_m2: 500 }),
    /* garden irrigation peaks when the tank is empty: coverage drops, empty days in summer */
    house_garden: P({ roof_m2: 119, tank_m3: 7.5, persons: 4, garden_m2: 200, garden_mm: 150, paved_m2: 30, plot_m2: 600 }),
    /* green roof (≥ 50 L/m²) counts half for GSV and gives no water to the tank */
    green_roof: P({ roof_m2: 60, green_m2: 60, green_50: true, tank_m3: 7.5, persons: 4, paved_m2: 25, plot_m2: 450 }),
    /* 24 flats: 100 L/m² -> 45 m³, one flat per started 5000 L -> 9 flats connected; the roof, not the tank, limits reuse */
    apartments_24: P({ roof_m2: 450, tank_m3: 45, gsv_use: 'multi', units: 24, persons: 22, wc_lpd: 24, laundry_lpd: 12, paved_m2: 200, plot_m2: 1500 }),
    /* office: demand 5× the yield, the tank never fills; clay soil -> 43 L/m² buffer with 5 l/s/ha */
    office_buffer: P({ roof_m2: 900, roof_type: 'flat_gravel', tank_m3: 90, gsv_use: 'none', units: 0, persons: 600, wc_lpd: 15, laundry_lpd: 0, days_week: 5,
      other_m3y: 50, paved_m2: 1200, plot_m2: 4000, gsv_infiltration: 'impossible' }),
    /* 30 m² extension with an existing tank: no extra tank, but the paving and roof count up to three times for infiltration */
    house_extension: P({ roof_m2: 30, tank_m3: 5, gsv_works: 'extension', existing_tank: true, existing_roof_m2: 110, paved_m2: 20, existing_paved_m2: 60, persons: 4, plot_m2: 700 })
  };

  return { VERSION: VERSION, SOURCES: SOURCES, RAIN: RAIN, DAYS: DAYS, ROOF_TYPES: ROOF_TYPES, DEFAULTS: DEFAULTS, PRESETS: PRESETS,
    minstd: minstd, connectedRoof: connectedRoof, dailySeries: dailySeries, demandParts: demandParts, simulate: simulate, din1989: din1989,
    normalise: normalise, solve: solve, curve: curve, gsvFlat: gsvFlat,
    gsv: function (inp) { var o = normalise(inp), e = validate(o); return e.length ? { applies: false, valid: false, errors: e } : gsvCheck(o); } };
});
