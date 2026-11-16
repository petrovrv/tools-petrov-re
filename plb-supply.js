/* plb-supply.js — drinking water pipe sizing engine of tools.petrov.re (Plumbing & Sanitary package).
 * Global PLBSupply (browser) / module.exports (node). Pure functions, no DOM, deterministic.
 * Method: _plb/sup/METHOD.md (plbsupply-1.3); EN 806-3 Annex B Fig. B.1 lines since plbsupply-1.4 (bw-r1).
 *   design flow  : DIN 1988-300 peak flow Qs = a·(ΣQa)^b − c per building type, bounded by the largest single Qa and ΣQa,
 *                  plus non-diversified (continuous / simultaneous) flows;
 *                  or EN 806-3 loading units with the ΣLU → QD lines of EN 806-3:2006 Annex B Figure B.1 (digitised, see METHOD.md);
 *   pipe loss    : Darcy–Weisbach with Colebrook–White (Swamee–Jain start), Σζ·ρv²/2, water properties at the circuit temperature;
 *   tree         : service pipe → meter/filter/backflow → basement main → one riser (floor segments) → floor branch per zone;
 *   sizing       : smallest size of the series within the velocity limit of the segment kind, then (optional) upsizing of the
 *                  largest-loss segment on the critical path until the worst fixture has its minimum flow pressure;
 *   result       : DN per segment, residual pressure at every branch end, worst fixture, booster flag + required head.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var core = null;
    try { core = require('./plumbing-core.js'); } catch (e) { core = null; }
    module.exports = factory(core);
  } else root.PLBSupply = factory(root.PLBCore || null);
})(typeof self !== 'undefined' ? self : this, function (CORE) {
  'use strict';
  var VERSION = 'plbsupply-1.4';
  var G = 9.80665;
  function has(o, k) { return o != null && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }

  var SOURCES = {
    din1988_300: { title: 'DIN 1988-300:2012-05 Codes of practice for drinking water installations — Pipe sizing (design-flow table with minimum flow pressures, peak-flow constants, velocity limits), values as reproduced in trade literature (SHK Profi, SBZ Monteur, Geberit/Kemper guides)', url: 'https://www.din.de/en/wdc-beuth:din21:151964210', kind: 'standard' },
    en806_3: { title: 'EN 806-3:2006 Specifications for installations inside buildings conveying water for human consumption — Part 3: Pipe sizing, simplified method (Table 2 loading units, 1 LU = 0.1 l/s)', url: 'https://standards.iteh.ai/catalog/standards/cen/c600c378-b062-40b9-a0fa-f6a8b719ead1/en-806-3-2006', kind: 'standard' },
    en806_fig: { title: 'EN 806-3:2006 Annex B Figure B.1 (design flow QD against ΣLU for standard installations), digitised: QD = 0.1·ΣLU up to the highest single LU, then a straight line on the log–log chart from (LUmax, 0.1·LUmax) to the common point 300 LU / 1.7 l/s, then one line to 5000 LU / 8.9 l/s (reading accuracy about ±2 %); LUmax below 2 uses the 2 LU line, above 15 the 15 LU line, ΣLU above 5000 is extrapolated', url: 'https://standards.iteh.ai/catalog/standards/cen/c600c378-b062-40b9-a0fa-f6a8b719ead1/en-806-3-2006', kind: 'standard' },
    en1057: { title: 'EN 1057:2006+A1:2010 Copper tubes for water and gas (common outside diameter × wall series)', kind: 'standard' },
    en10312: { title: 'EN 10312:2002 Welded stainless steel tubes for water (series 2 press-fitting dimensions)', kind: 'standard' },
    en10255: { title: 'EN 10255:2004 Non-alloy steel tubes suitable for welding and threading, medium series', kind: 'standard' },
    en12201: { title: 'EN 12201-2 PE100 SDR 11 pipes for water supply', kind: 'standard' },
    multilayer: { title: 'Typical PE-X/Al/PE-X multilayer series 16×2 … 63×4.5 (dimensions vary by manufacturer — check the system catalogue)', kind: 'learning_assumption' },
    roughness: { title: 'Typical absolute roughness for design: drawn copper / stainless 0.0015 mm, plastics 0.007 mm, galvanised steel 0.15 mm (textbook values)', kind: 'learning_assumption' },
    plbcore_water: { title: 'PLBCore.water(): density Kell (1975), viscosity IAPWS 2008 — see plumbing-core METHOD', kind: 'public_guide' },
    colebrook: { title: 'Colebrook C.F. (1939) Turbulent flow in pipes, J. ICE 11, 133–156; laminar 64/Re below Re 2300, linear blend 2300–4000 (PLBCore.friction)', kind: 'public_guide' },
    apparatus: { title: 'Default pressure losses of water meter 0.3 bar, filter 0.2 bar, backflow preventer EA 0.1 bar, water heater 0.3 bar — typical values; replace by the product data', kind: 'learning_assumption' },
    din_range: { title: 'Warning threshold ΣQa > 500 l/s: the peak-flow constants come from measurements in ordinary buildings; far above that the curve is extrapolated (threshold is a learning assumption)', kind: 'learning_assumption' },
    din_unit: { title: 'DIN 1988-300:2012 utilisation units (Nutzungseinheiten): the peak flow inside one utilisation unit is the sum of its two largest design flows; a second basin, a shower tray in addition to a bath, a bidet and a urinal are not counted; several units: Σ unit peaks if smaller than the curve. Secondary sources quoting DIN: SHK Profi 8/2012 "DIN 1988-300 Einführung von Nutzungseinheiten" (examples 1–2) and KELOX handbook 2018 "Extract from DIN 1988-300" (exceptions)', url: 'https://www.shk-profi.de/download/495181/SHK_Profi_Technik_19813_136_1_2_3.pdf', kind: 'secondary' },
    en806_2: { title: 'EN 806-2:2005 §3.5/§3.6: static pressure at draw-off points should not exceed 500 kPa (5 bar) except outside taps — pressure reducing valve otherwise', kind: 'standard' }
  };

  /* Fixtures come from the package library PLBCore.FIXTURES (D-PLB-7): qa = DIN 1988-300 design flow (l/s) cold / hot,
   * pmin = minimum flow pressure (bar), lu = EN 806-3 loading units on the cold and on the hot pipe. */
  var FIXTURES = {}, FIXTURE_IDS = [];
  if (CORE && CORE.FIXTURES) {
    (CORE.FIXTURE_IDS || Object.keys(CORE.FIXTURES)).forEach(function (id) {
      if (!has(CORE.FIXTURES, id)) return;
      var f = CORE.FIXTURES[id], qa = f.qa_lps || {}, lu = f.lu || {};
      FIXTURES[id] = { qa: [+qa.cold || 0, +qa.hot || 0], pmin: (typeof f.pmin_flow_bar === 'number' ? f.pmin_flow_bar : 0), lu: [+lu.cold || 0, +lu.hot || 0], src: (f.sources || []).slice() };
      FIXTURE_IDS.push(id);
    });
  }

  /* DIN 1988-300 peak-flow constants Qs = a·(ΣQa)^b − c (l/s) per building type, from PLBCore.BUILDING_TYPES.din_peak.
   * Types without constants (sports, retail, restaurant, industrial) need an explicit curve `din_curve` or the EN 806 method. */
  var BUILDING = {}, BUILDING_TYPES = [], DIN_TYPES = [];
  if (CORE && CORE.BUILDING_TYPES) Object.keys(CORE.BUILDING_TYPES).forEach(function (k) {
    var p = CORE.BUILDING_TYPES[k].din_peak; BUILDING_TYPES.push(k);
    if (p) { BUILDING[k] = { a: p.a, b: p.b, c: p.c, src: 'din1988_300' }; DIN_TYPES.push(k); }
  });
  /* EN 806-3:2006 Fig. B.1 read on the licensed copy (D-BW-5): the branch for the highest single LU starts on the diagonal
   * QD = 0.1·ΣLU and runs straight (log–log) to the node; above the node one line to the end of the chart. */
  var EN806_FIG = { node_lu: 300, node_q: 1.7, end_lu: 5000, end_q: 8.9, branch_min: 2, branch_max: 15, src: 'en806_fig' };
  var EN806_CURVE = EN806_FIG;  /* old export name */
  var DIN_QA_WARN = 500;

  function S(od, w) { return { od: od, wall: w, id: Math.round((od - 2 * w) * 1000) / 1000, label: od + '×' + w }; }
  var MATERIALS = {
    copper:     { rough_mm: 0.0015, src: ['en1057', 'roughness'], series: [S(12, 1), S(15, 1), S(18, 1), S(22, 1), S(28, 1), S(35, 1.2), S(42, 1.2), S(54, 1.5), S(64, 2), S(76.1, 2), S(88.9, 2), S(108, 2.5)] },
    stainless:  { rough_mm: 0.0015, src: ['en10312', 'roughness'], series: [S(15, 1), S(18, 1), S(22, 1.2), S(28, 1.2), S(35, 1.5), S(42, 1.5), S(54, 1.5), S(76.1, 2), S(88.9, 2), S(108, 2)] },
    multilayer: { rough_mm: 0.007, src: ['multilayer', 'roughness'], series: [S(16, 2), S(20, 2), S(26, 3), S(32, 3), S(40, 3.5), S(50, 4), S(63, 4.5)] },
    pe100:      { rough_mm: 0.007, src: ['en12201', 'roughness'], series: [S(25, 2.3), S(32, 2.9), S(40, 3.7), S(50, 4.6), S(63, 5.8), S(75, 6.8), S(90, 8.2), S(110, 10)] },
    galvanised: { rough_mm: 0.15, src: ['en10255', 'roughness'], series: [S(21.3, 2.6), S(26.9, 2.6), S(33.7, 3.2), S(42.4, 3.2), S(48.3, 3.2), S(60.3, 3.6), S(76.1, 3.6), S(88.9, 4), S(114.3, 4.5)] }
  };
  var KINDS = ['service', 'main', 'riser', 'branch'];
  /* DIN 1988-300 velocity limits (D-PLB-7): 2 m/s service connection; in consumer pipes 5 m/s only where the fittings of the
   * segment have Σζ < 2.5, otherwise 2.5 m/s; 2 m/s where the flow lasts > 15 min (simultaneous zones, continuous flows) and
   * for the EN 806-3 method. A value in vmax[kind] is a user cap that replaces the derived limit. */
  var VMAX_DEFAULT = { service: 2.0, main: 2.5, riser: 2.5, branch: 5.0 };
  function vmaxDerived(kind, zeta, longFlow, method) {
    if (kind === 'service') return { v: 2.0, basis: 'din_service' };
    if (method === 'en806') return { v: 2.0, basis: 'en806' };
    if (longFlow) return { v: 2.0, basis: 'din_long' };
    return zeta < 2.5 ? { v: 5.0, basis: 'din_zeta_low' } : { v: 2.5, basis: 'din_zeta_high' };
  }

  var DEFAULTS = {
    method: 'din', building_type: 'residential', din_curve: null, circuit: 'total', material: 'copper', service_material: 'pe100', sizing: 'pressure',
    T_cold_c: 10, T_hot_c: 60, p_supply_bar: 3.0, p_static_bar: null, friction_allowance_bar: 1.0,
    dp_meter_bar: 0.3, dp_filter_bar: 0.2, dp_backflow_bar: 0.1, dp_heater_bar: 0.3,
    service_length_m: 15, service_zeta: 2, main_length_m: 20, main_zeta: 6, meter_level_m: -1.0,
    floor_height_m: 3.0, riser_zeta: 1.5, branch_length_m: 12, branch_zeta: 8, outlet_height_m: 1.0,
    vmax: { service: null, main: null, riser: null, branch: null },
    zones: []
  };
  /* physical ranges (D-PLB-14): [min, max, minExclusive] */
  var RANGES = {
    T_cold_c: [0, 90], T_hot_c: [0, 90], p_supply_bar: [0, 16, true], friction_allowance_bar: [0, 10],
    dp_meter_bar: [0, 5], dp_filter_bar: [0, 5], dp_backflow_bar: [0, 5], dp_heater_bar: [0, 5],
    service_length_m: [0, 2000], service_zeta: [0, 200], main_length_m: [0, 2000], main_zeta: [0, 200], meter_level_m: [-30, 30],
    floor_height_m: [0, 10, true], riser_zeta: [0, 200], branch_length_m: [0, 2000], branch_zeta: [0, 200], outlet_height_m: [-2, 10]
  };
  var FLOOR_MIN = -5, FLOOR_MAX = 300, UNITS_MAX = 100000, ZONES_MAX = 2000, QCONT_MAX = 100;

  function missing(v) { return v === undefined || v === null || v === ''; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }

  /* ---- water properties and friction: the package core (CR-40) ---- */
  function water(T) {
    var w = CORE.water(T);
    return { rho: w.rho, mu: w.mu, nu: w.nu };
  }
  function friction(Re, rel) { return CORE.friction(Re, rel); }
  function pipeLoss(q_lps, id_mm, L, zeta, rough_mm, T) {
    var w = water(T), d = id_mm / 1000, A = Math.PI * d * d / 4, v = q_lps / 1000 / A;
    var Re = v * d / w.nu, lam = friction(Re, rough_mm / id_mm);
    var R = lam / d * w.rho * v * v / 2;             // Pa/m
    var Z = zeta * w.rho * v * v / 2;                // Pa
    return { v: v, Re: Re, lambda: lam, R_pa_m: R, dp_fric_bar: R * L / 1e5, dp_zeta_bar: Z / 1e5, dp_bar: (R * L + Z) / 1e5 };
  }

  /* ---- design flows ---- */
  function peakFlowDIN(sumQa, qaMax, type) {
    if (!has(BUILDING, type)) return null;
    var k = BUILDING[type];
    if (!(sumQa > 0)) return 0;
    var f = k.a * Math.pow(sumQa, k.b) - k.c;
    return Math.min(sumQa, Math.max(qaMax, f));
  }
  /* DIN 1988-300 utilisation unit (Y2-2): two largest design flows of one unit, after the DIN exclusions
   * (shower when a bath is present, second basin, bidet, urinal). Used as a floor where a segment serves exactly one unit. */
  var UNIT_TYPES = { residential: 1, care_home: 1, hotel: 1, hospital: 1 };  /* dwelling-like use: flat, hotel / care / ward bathroom */
  var UNIT_BASIN = { basin: 1, handbasin_small: 1 }, UNIT_SKIP = { bidet: 1, urinal_flush: 1 };
  function unitTwoLargest(fixtures, circuit) {
    var qs = [], basin = false, bath = has(fixtures, 'bath') && fixtures.bath > 0;
    Object.keys(fixtures).forEach(function (fid) {
      if (has(UNIT_SKIP, fid) || (fid === 'shower' && bath)) return;
      var f = fixtureFlow(fid, circuit); if (!f || !(f.qa > 0)) return;
      var n = fixtures[fid];
      if (has(UNIT_BASIN, fid)) { if (basin) return; basin = true; n = 1; }
      for (var k = 0; k < Math.min(n, 2); k++) qs.push(f.qa);
    });
    qs.sort(function (a, b) { return b - a; });
    return (qs[0] || 0) + (qs[1] || 0);
  }
  function flowEN806(sumLU, maxLU) {
    if (!(sumLU > 0)) return 0;
    var F = EN806_FIG, l0 = Math.min(F.branch_max, Math.max(F.branch_min, maxLU || 0)), q0 = 0.1 * l0, f;
    if (sumLU <= l0) f = 0.1 * sumLU;
    else if (sumLU <= F.node_lu) f = q0 * Math.pow(sumLU / l0, Math.log(F.node_q / q0) / Math.log(F.node_lu / l0));
    else f = F.node_q * Math.pow(sumLU / F.node_lu, Math.log(F.end_q / F.node_q) / Math.log(F.end_lu / F.node_lu));
    return Math.min(0.1 * sumLU, Math.max(0.1 * maxLU, f));
  }

  function fixtureFlow(fid, circuit) {
    if (!has(FIXTURES, fid)) return null;
    var f = FIXTURES[fid];
    var qa = circuit === 'cold' ? f.qa[0] : circuit === 'hot' ? f.qa[1] : f.qa[0] + f.qa[1];
    var lu = circuit === 'cold' ? f.lu[0] : circuit === 'hot' ? f.lu[1] : Math.max(f.lu[0], f.lu[1]);  /* EN 806-3: one LU value per draw-off point */
    return { qa: qa, lu: lu, pmin: (qa > 0 ? f.pmin : 0) };
  }

  /* ---- input normalisation and validation (D-PLB-14: missing -> default with a note, wrong type / out of range -> error) ---- */
  function normalise(inp) {
    var o = {}, errors = [], defaults = [], k;
    if (inp == null || typeof inp !== 'object' || Array.isArray(inp)) { inp = {}; errors.push('input'); }
    for (k in DEFAULTS) if (k !== 'vmax' && k !== 'zones') o[k] = has(inp, k) ? inp[k] : undefined;
    Object.keys(RANGES).forEach(function (key) {
      var v = o[key], r = RANGES[key];
      if (missing(v)) { o[key] = DEFAULTS[key]; defaults.push(key); return; }
      if (typeof v !== 'number' || !isFinite(v)) { errors.push('not_number:' + key); o[key] = DEFAULTS[key]; return; }
      if (v < r[0] || v > r[1] || (r[2] && v <= r[0])) errors.push('range:' + key);
    });
    if (missing(o.p_static_bar)) o.p_static_bar = null;
    else if (typeof o.p_static_bar !== 'number' || !isFinite(o.p_static_bar)) { errors.push('not_number:p_static_bar'); o.p_static_bar = null; }
    else if (!(o.p_static_bar > 0 && o.p_static_bar <= 16)) errors.push('range:p_static_bar');
    o.vmax = {}; o.vmax_override = {};
    var vin = (inp.vmax && typeof inp.vmax === 'object') ? inp.vmax : {};
    KINDS.forEach(function (kd) {
      var v = has(vin, kd) ? vin[kd] : null;
      if (missing(v) || v !== v) { o.vmax[kd] = null; return; }  /* cleared field = per DIN */
      if (typeof v !== 'number' || !isFinite(v) || v < 0.1 || v > 10) { errors.push('range:vmax.' + kd); o.vmax[kd] = null; return; }
      o.vmax[kd] = v; o.vmax_override[kd] = true;
    });
    function opt(key, list) {
      if (missing(o[key])) { o[key] = DEFAULTS[key]; defaults.push(key); return; }
      if (list.indexOf(o[key]) < 0) { errors.push('option:' + key); o[key] = DEFAULTS[key]; }
    }
    opt('material', Object.keys(MATERIALS)); opt('service_material', Object.keys(MATERIALS));
    opt('method', ['din', 'en806']); opt('circuit', ['total', 'cold', 'hot']); opt('sizing', ['pressure', 'velocity']);
    opt('building_type', BUILDING_TYPES.length ? BUILDING_TYPES : Object.keys(BUILDING));
    if (missing(o.din_curve)) o.din_curve = null;
    else if (DIN_TYPES.indexOf(o.din_curve) < 0) { errors.push('option:din_curve'); o.din_curve = null; }
    o.curve = o.din_curve || o.building_type;
    o.din_curve_assumed = !!(o.din_curve && o.din_curve !== o.building_type);
    if (o.method === 'din' && !has(BUILDING, o.curve)) errors.push('no_din_constants:' + o.building_type);
    var zin = has(inp, 'zones') ? inp.zones : [];
    if (!Array.isArray(zin)) { errors.push('zones'); zin = []; }
    if (zin.length > ZONES_MAX) { errors.push('too_many_zones'); zin = zin.slice(0, ZONES_MAX); }
    var seen = {};
    o.zones = [];
    zin.forEach(function (z, i) {
      if (z == null || typeof z !== 'object' || Array.isArray(z)) { errors.push('zone_item:' + (i + 1)); return; }
      var id = missing(z.id) ? ('Z' + (i + 1)) : String(z.id);
      if (has(seen, id)) errors.push('duplicate_zone_id:' + id);
      seen[id] = true;
      var floor = 0;
      if (!missing(z.floor)) {
        if (typeof z.floor !== 'number' || !isFinite(z.floor)) errors.push('not_number:zone.floor:' + id);
        else if (z.floor % 1 !== 0 || z.floor < FLOOR_MIN || z.floor > FLOOR_MAX) errors.push('range:zone.floor:' + id);  /* integer floor, no rounding (X1-1) */
        else floor = z.floor;
      }
      var units = 1;
      if (!missing(z.units)) {
        if (typeof z.units !== 'number' || !isFinite(z.units)) errors.push('not_number:zone.units:' + id);
        else if (z.units % 1 !== 0 || z.units < 1 || z.units > UNITS_MAX) errors.push('range:zone.units:' + id);  /* integer count, no rounding (X1-1) */
        else units = z.units;
      }
      var qc = 0;
      if (!missing(z.q_cont_lps)) {
        if (typeof z.q_cont_lps !== 'number' || !isFinite(z.q_cont_lps) || z.q_cont_lps < 0 || z.q_cont_lps > QCONT_MAX) errors.push('range:zone.q_cont_lps:' + id);
        else qc = z.q_cont_lps;
      }
      var fx = {}, src = z.fixtures;
      if (src != null && (typeof src !== 'object' || Array.isArray(src))) { errors.push('fixtures:' + id); src = {}; }
      Object.keys(src || {}).forEach(function (fid) {
        if (!has(FIXTURES, fid)) { errors.push('unknown_fixture:' + fid); return; }
        var n = src[fid];
        if (missing(n)) return;
        if (typeof n !== 'number' || !isFinite(n) || n % 1 !== 0 || n < 0 || n > UNITS_MAX) { errors.push('fixture_count:' + id + ':' + fid); return; }  /* integer count, no rounding (X1-1) */
        if (n > 0) fx[fid] = n;
      });
      o.zones.push({ id: id, name: String(z.name == null ? '' : z.name), floor: floor, units: units, fixtures: fx, simultaneous: z.simultaneous === true, q_cont_lps: qc });
    });
    o.errors = errors; o.defaults_used = defaults;
    return o;
  }

  /* ---- loads of a set of zones ---- */
  function loads(zones, circuit) {
    var s = { sumQa: 0, qaMax: 0, sumLU: 0, luMax: 0, qCont: 0, pmin: 0, pminFixture: null, count: 0, units: 0, unitFloor: 0 };
    zones.forEach(function (z) {
      if (!z.simultaneous && Object.keys(z.fixtures).some(function (fid) { var f = fixtureFlow(fid, circuit); return f && f.qa > 0; })) { s.units += z.units; s.unitFloor = unitTwoLargest(z.fixtures, circuit); }
      var zq = 0;
      Object.keys(z.fixtures).forEach(function (fid) {
        var f = fixtureFlow(fid, circuit), n = z.fixtures[fid] * z.units;
        if (!f || f.qa <= 0) return;
        s.count += n;
        if (z.simultaneous) zq += n * f.qa; else { s.sumQa += n * f.qa; s.sumLU += n * f.lu; }
        if (f.qa > s.qaMax) s.qaMax = f.qa;
        if (f.lu > s.luMax) s.luMax = f.lu;
        if (f.pmin > s.pmin) { s.pmin = f.pmin; s.pminFixture = fid; }
      });
      s.qCont += zq + z.q_cont_lps;
    });
    return s;
  }
  function designFlow(L, o) {
    var div = o.method === 'en806' ? flowEN806(L.sumLU, L.luMax) : peakFlowDIN(L.sumQa, L.qaMax, o.curve);
    L.unit_floor = false;
    if (o.method === 'din' && has(UNIT_TYPES, o.building_type) && L.units === 1 && L.unitFloor > div + 1e-12) { div = Math.min(L.sumQa, L.unitFloor); L.unit_floor = true; }
    return div + L.qCont;
  }

  /* ---- the tree: service pipe and basement main carry cold + hot up to the heater tee (CR-6); downstream of the tee the
   * 'total' circuit has a cold and a hot riser / branch system, the hot one behind the water heater (Y2-1) ---- */
  function servesCircuit(z, circuit) {
    if (z.q_cont_lps > 0) return true;
    return Object.keys(z.fixtures).some(function (fid) { var f = fixtureFlow(fid, circuit); return f && f.qa > 0; });
  }
  function buildTree(o) {
    var segs = [], all = o.zones.slice();
    segs.push({ id: 'SVC', kind: 'service', parent: null, L: o.service_length_m, dz: 0, zeta: o.service_zeta, zones: all, apparatus: 0, circuit: 'total', T: o.T_cold_c });
    var app = o.dp_meter_bar + o.dp_filter_bar + o.dp_backflow_bar + (o.circuit === 'hot' ? o.dp_heater_bar : 0);
    segs.push({ id: 'MAIN', kind: 'main', parent: 'SVC', L: o.main_length_m, dz: 0, zeta: o.main_zeta, zones: all, apparatus: app, circuit: 'total', T: o.T_cold_c });
    var systems = o.circuit === 'total' ? [{ c: 'cold', sfx: '.C', heater: 0 }, { c: 'hot', sfx: '.H', heater: o.dp_heater_bar }] : [{ c: o.circuit, sfx: '', heater: 0 }];
    systems.forEach(function (sy) {
      var zs = o.circuit === 'total' ? all.filter(function (z) { return servesCircuit(z, sy.c); }) : all;
      if (!zs.length) return;
      var T = sy.c === 'hot' ? o.T_hot_c : o.T_cold_c, maxFloor = -Infinity, minFloor = 0;
      zs.forEach(function (z) { if (z.floor > maxFloor) maxFloor = z.floor; if (z.floor < minFloor) minFloor = z.floor; });
      var prev = 'MAIN', zPrev = o.meter_level_m, up = zs, first = true;
      for (var f = minFloor; f <= maxFloor; f++) {
        up = up.filter(function (z) { return z.floor >= f; });
        if (!up.length) break;
        var zf = f * o.floor_height_m + o.outlet_height_m, dz = zf - zPrev;
        segs.push({ id: 'R' + f + sy.sfx, kind: 'riser', parent: prev, L: Math.abs(dz), dz: dz, zeta: o.riser_zeta, zones: up, apparatus: first ? sy.heater : 0, floor: f, circuit: sy.c, T: T });
        prev = 'R' + f + sy.sfx; zPrev = zf; first = false;
      }
      zs.forEach(function (z) {
        segs.push({ id: 'B-' + z.id + sy.sfx, kind: 'branch', parent: 'R' + z.floor + sy.sfx, L: o.branch_length_m, dz: 0, zeta: o.branch_zeta, zones: [z], apparatus: 0, floor: z.floor, zone: z.id, circuit: sy.c, T: T });
      });
    });
    return segs;
  }

  function evaluate(o, segs, sizeIdx) {
    segs.forEach(function (s, i) {
      var mat = MATERIALS[s.mat], pipe = mat.series[sizeIdx[i]];
      var pl = pipeLoss(s.q_lps, pipe.id, s.L, s.zeta, mat.rough_mm, s.T);
      var pin = s.pi >= 0 ? segs[s.pi].p_end_bar : o.p_supply_bar;
      var dpg = s.rho * G * s.dz / 1e5;
      s.size = pipe.label; s.od_mm = pipe.od; s.wall_mm = pipe.wall; s.id_mm = pipe.id; s.v = pl.v; s.Re = pl.Re; s.lambda = pl.lambda; s.R_pa_m = pl.R_pa_m;
      s.dp_fric_bar = pl.dp_fric_bar; s.dp_zeta_bar = pl.dp_zeta_bar; s.dp_bar = pl.dp_bar; s.dp_geo_bar = dpg;
      s.p_start_bar = pin; s.p_end_bar = pin - s.apparatus - pl.dp_bar - dpg;
      s.v_ok = pl.v <= s.vmax + 1e-9;
    });
  }

  /* QA-7: a pipe is never larger than the pipe of the same material that feeds it — raise the feeders */
  function harmonise(segs, sizeIdx, i) {
    var c = i;
    while (segs[c].pi >= 0) {
      var p = segs[c].pi;
      if (segs[p].mat !== segs[c].mat) break;
      var ser = MATERIALS[segs[p].mat].series, odc = ser[sizeIdx[c]].od;
      if (ser[sizeIdx[p]].od >= odc) break;
      while (sizeIdx[p] < ser.length - 1 && ser[sizeIdx[p]].od < odc) sizeIdx[p]++;
      c = p;
    }
  }

  function solve(input) {
    if (!CORE || !CORE.water || !FIXTURE_IDS.length) return { valid: false, errors: ['core_missing'], version: VERSION };
    var o = normalise(input), warnings = [];
    if (o.errors.length) return { valid: false, errors: o.errors, version: VERSION, input: o };
    if (!o.zones.length) return { valid: false, errors: ['no_zones'], version: VERSION, input: o };
    var segs = buildTree(o), index = {};
    segs.forEach(function (s, i) { index[s.id] = i; });
    segs.forEach(function (s) {
      s.pi = s.parent ? index[s.parent] : -1;
      s.mat = s.kind === 'service' ? o.service_material : o.material;
      s.rho = water(s.T).rho;
      var L = loads(s.zones, s.circuit);
      s.units = L.units; s.sumQa = L.sumQa; s.qaMax = L.qaMax; s.sumLU = L.sumLU; s.luMax = L.luMax; s.qCont = L.qCont; s.pmin = L.pmin; s.pminFixture = L.pminFixture; s.count = L.count;
      s.q_lps = designFlow(L, o); s.unit_floor = L.unit_floor;
      var d = vmaxDerived(s.kind, s.zeta, L.qCont > 0, o.method);
      if (o.vmax_override[s.kind]) { s.vmax = o.vmax[s.kind]; s.vmax_basis = 'override'; } else { s.vmax = d.v; s.vmax_basis = d.basis; }
    });
    var root = segs[0];
    if (!(root.q_lps > 0)) return { valid: false, errors: ['no_flow'], version: VERSION, input: o };
    var paths = {};
    function pathIdx(i) { if (paths[i]) return paths[i]; var p = [], c = i; while (c >= 0) { p.unshift(c); c = segs[c].pi; } paths[i] = p; return p; }
    /* 1. velocity sizing, then no pipe larger than its feeder */
    var sizeIdx = segs.map(function (s) {
      var mat = MATERIALS[s.mat];
      for (var j = 0; j < mat.series.length; j++) { var d = mat.series[j].id / 1000; if (s.q_lps / 1000 / (Math.PI * d * d / 4) <= s.vmax + 1e-9) return j; }
      return mat.series.length - 1;
    });
    for (var hi = segs.length - 1; hi > 0; hi--) harmonise(segs, sizeIdx, hi);
    evaluate(o, segs, sizeIdx);
    var branches = [];
    segs.forEach(function (s, i) { if (s.kind === 'branch') branches.push(i); });
    function worst() { var w = null; branches.forEach(function (i) { var m = segs[i].p_end_bar - segs[i].pmin; if (!w || m < w.margin - 1e-12) w = { i: i, id: segs[i].id, margin: m }; }); return w; }
    /* 2. pressure sizing: upsizing cannot beat height + apparatus; only try when the pipes are the problem */
    var upsized = 0, w0 = worst(), staticMin = Infinity;
    branches.forEach(function (bi) {
      var stat = o.p_supply_bar;
      pathIdx(bi).forEach(function (i) { stat -= segs[i].apparatus + segs[i].dp_geo_bar; });
      if (stat - segs[bi].pmin < staticMin) staticMin = stat - segs[bi].pmin;
    });
    var staticOK = staticMin >= 0;
    /* when height + apparatus already exceed the supply, a booster is unavoidable: size the pipes for the stated
       friction allowance downstream of it instead of leaving them at the velocity limit */
    var offset = staticOK ? 0 : -staticMin + o.friction_allowance_bar;
    if (o.sizing === 'pressure') {
      var guard = 0;
      while (guard++ < 3000) {
        var wv = worst();
        if (wv.margin + offset >= 0) break;
        var best = -1, bdp = -1;
        pathIdx(wv.i).forEach(function (i) {
          if (sizeIdx[i] >= MATERIALS[segs[i].mat].series.length - 1) return;
          if (segs[i].dp_bar > bdp + 1e-12) { bdp = segs[i].dp_bar; best = i; }
        });
        if (best < 0) break;
        sizeIdx[best]++; upsized++;
        harmonise(segs, sizeIdx, best);
        evaluate(o, segs, sizeIdx);
      }
    }
    var wv2 = worst(), wb = segs[wv2.i];
    var rhoC = water(o.T_cold_c).rho;
    var booster = wv2.margin < -1e-9;
    var head_m = booster ? -wv2.margin * 1e5 / (rhoC * G) : 0;
    /* Y2-4: no size of the series meets the velocity limit -> the segment is unsized (hard flag, verdict not OK) */
    var noSize = [];
    segs.forEach(function (s) { if (!s.v_ok) { warnings.push({ code: 'velocity', seg: s.id }); noSize.push(s.id); } });
    /* static pressure at the lowest outlet (EN 806-2: ≤ 5 bar at draw-off points) */
    var pStaticLow = null;
    if (o.p_static_bar != null) {
      var fmin = Math.min.apply(null, o.zones.map(function (z) { return z.floor; }));
      var zLow = fmin * o.floor_height_m + o.outlet_height_m;
      pStaticLow = o.p_static_bar - rhoC * G * (zLow - o.meter_level_m) / 1e5;
      if (pStaticLow > 5 + 1e-9) warnings.push({ code: 'prv', value: pStaticLow });
    }
    if (booster) warnings.push({ code: staticOK ? 'booster_pipes' : 'booster_static', value: head_m });
    if (o.method === 'en806') {
      warnings.push({ code: 'en806_curve' });
      if (root.sumLU > EN806_FIG.end_lu || root.luMax > EN806_FIG.branch_max) warnings.push({ code: 'en806_extrapolated', value: root.sumLU });
    }
    if (o.method === 'din' && root.sumQa > DIN_QA_WARN) warnings.push({ code: 'din_range', value: root.sumQa });
    if (o.method === 'din' && o.din_curve_assumed) warnings.push({ code: 'din_curve_assumed', value: o.curve });
    if (o.zones.some(function (z) { return z.simultaneous; })) warnings.push({ code: 'simultaneous' });
    var circ = loads(o.zones, o.circuit), qCirc = designFlow(circ, o);
    var flags = [];
    if (o.method === 'din' && o.din_curve_assumed) flags.push('din_curve_assumed');
    noSize.forEach(function (id) { flags.push('no_size_v:' + id); });
    var unitSegs = segs.filter(function (s) { return s.unit_floor; }).map(function (s) { return s.id; });
    if (unitSegs.length) warnings.push({ code: 'unit_floor', segs: unitSegs });
    return {
      valid: true, version: VERSION, input: o, flags: flags, defaults_used: o.defaults_used,
      ok: !booster && !noSize.length, sized: !noSize.length, unsized_segments: noSize,
      segments: segs.map(function (s, i) {
        return { id: s.id, kind: s.kind, parent: s.parent, floor: s.floor == null ? null : s.floor, zone: s.zone || null, circuit: s.circuit, T_c: s.T, L_m: s.L, dz_m: r6(s.dz), zeta: s.zeta,
          fixtures: s.count, units: s.units, unit_floor: !!s.unit_floor, sumQa_lps: r6(s.sumQa), qaMax_lps: s.qaMax, sumLU: s.sumLU, luMax: s.luMax, qCont_lps: r6(s.qCont), q_lps: s.q_lps,
          material: s.mat, size: s.size, od_mm: s.od_mm, wall_mm: s.wall_mm, size_index: sizeIdx[i], id_mm: s.id_mm, v_ms: s.v, vmax_ms: s.vmax, vmax_basis: s.vmax_basis, v_ok: s.v_ok,
          Re: s.Re, lambda: s.lambda, R_pa_m: s.R_pa_m, dp_fric_bar: s.dp_fric_bar, dp_zeta_bar: s.dp_zeta_bar, dp_bar: s.dp_bar, dp_geo_bar: s.dp_geo_bar,
          apparatus_bar: s.apparatus, p_start_bar: s.p_start_bar, p_end_bar: s.p_end_bar, pmin_bar: s.kind === 'branch' ? s.pmin : null, pmin_fixture: s.kind === 'branch' ? s.pminFixture : null,
          margin_bar: s.kind === 'branch' ? s.p_end_bar - s.pmin : null };
      }),
      totals: { sumQa_lps: r6(root.sumQa), sumLU: root.sumLU, qCont_lps: r6(root.qCont), q_design_lps: root.q_lps, q_circuit_lps: qCirc, sumQa_circuit_lps: r6(circ.sumQa),
        q_din_lps: has(BUILDING, o.curve) ? peakFlowDIN(root.sumQa, root.qaMax, o.curve) + root.qCont : null, q_en806_lps: flowEN806(root.sumLU, root.luMax) + root.qCont,
        diversity: root.sumQa + root.qCont > 0 ? root.q_lps / (root.sumQa + root.qCont) : null, fixtures: root.count, din_curve: o.method === 'din' ? o.curve : null },
      worst: { branch: wb.id, zone: wb.zone, floor: wb.floor, fixture: wb.pminFixture, p_bar: wb.p_end_bar, pmin_bar: wb.pmin, margin_bar: wv2.margin },
      initial_worst_margin_bar: w0.margin, upsized_steps: upsized, static_feasible: staticOK, static_margin_bar: staticMin, sizing_offset_bar: offset,
      booster: { needed: booster, q_lps: root.q_lps, head_m: head_m, dp_bar: booster ? -wv2.margin : 0 },
      p_static_lowest_bar: pStaticLow, prv_needed: pStaticLow != null && pStaticLow > 5 + 1e-9,
      critical_path: pathIdx(wv2.i).map(function (i) { return segs[i].id; }),
      warnings: warnings
    };
  }

  /* handoff for plbbooster / operatingpoint (SI): the total (cold + hot) flow of the service pipe (CR-6) */
  function handoff(res) {
    if (!res || !res.valid) return null;
    return { q_m3_s: res.booster.q_lps / 1000, q_lps: res.booster.q_lps, head_m: res.booster.head_m, booster_needed: res.booster.needed, flow_basis: 'total_cold_hot',
             p_supply_bar: res.input.p_supply_bar, worst_fixture: res.worst.fixture, worst_branch: res.worst.branch };
  }

  /* parse "wc_cistern:2, basin 2; shower×1" */
  function parseFixtures(text) {
    var o = {}, bad = [];
    String(text || '').split(/[,;\n]+/).forEach(function (p) {
      p = p.trim(); if (!p) return;
      var m = p.match(/^([a-z_]+)\s*(?:[:×x*=\s]\s*(\d+))?$/i);
      if (!m || !has(FIXTURES, m[1].toLowerCase())) { bad.push(p); return; }
      var id = m[1].toLowerCase(); o[id] = (has(o, id) ? o[id] : 0) + (m[2] ? parseInt(m[2], 10) : 1);
    });
    return { fixtures: o, bad: bad };
  }
  function formatFixtures(fx) { return Object.keys(fx || {}).filter(function (k) { return has(fx, k) && fx[k] > 0; }).map(function (k) { return k + ':' + fx[k]; }).join(', '); }

  /* ---- preset buildings (zones per floor) ---- */
  function flats(floors, perFloor, extra) {
    var z = [];
    for (var f = 0; f < floors; f++) z.push({ id: 'F' + f, name: 'Floor ' + f, floor: f, units: perFloor, fixtures: Object.assign({ wc_cistern: 1, basin: 1, shower: 1, sink_kitchen: 1, washing_machine: 1, dishwasher_dom: 1 }, extra || {}) });
    return z;
  }
  var PRESETS = {
    apartments_24: function () { return Object.assign({}, DEFAULTS, { building_type: 'residential', p_supply_bar: 4.0, zones: flats(6, 4) }); },
    apartments_low_pressure: function () { return Object.assign({}, DEFAULTS, { building_type: 'residential', p_supply_bar: 3.0, zones: flats(6, 4) }); },
    office_8f_cistern: function () {
      var z = []; for (var f = 0; f < 8; f++) z.push({ id: 'O' + f, name: 'Office ' + f, floor: f, units: 1, fixtures: { wc_cistern: 8, urinal_flush: 3, basin: 8, sink_kitchen: 1, dishwasher_dom: 1 } });
      return Object.assign({}, DEFAULTS, { building_type: 'office', p_supply_bar: 4.0, circuit: 'cold', floor_height_m: 3.6, zones: z });
    },
    office_8f_flushvalve: function () {
      var d = PRESETS.office_8f_cistern(); d.zones.forEach(function (z) { z.fixtures.wc_flushvalve = z.fixtures.wc_cistern; delete z.fixtures.wc_cistern; }); return d;
    },
    hotel_120: function () {
      var z = []; for (var f = 1; f <= 6; f++) z.push({ id: 'H' + f, name: 'Rooms ' + f, floor: f, units: 20, fixtures: { wc_cistern: 1, basin: 1, shower: 1 } });
      z.push({ id: 'H0', name: 'Lobby / kitchen', floor: 0, units: 1, fixtures: { wc_cistern: 6, basin: 6, urinal_flush: 2, sink_kitchen: 4, dishwasher_dom: 2 } });
      return Object.assign({}, DEFAULTS, { building_type: 'hotel', p_supply_bar: 3.5, zones: z });
    },
    sports_showers: function () {
      return Object.assign({}, DEFAULTS, { building_type: 'sports', din_curve: 'school', p_supply_bar: 3.0, floor_height_m: 4.0, main_length_m: 30,
        zones: [{ id: 'S1', name: 'Changing rooms (team showers)', floor: 0, units: 1, simultaneous: true, fixtures: { shower: 16 } },
                { id: 'S2', name: 'Toilets / bar', floor: 0, units: 1, fixtures: { wc_cistern: 6, urinal_flush: 4, basin: 6, sink_kitchen: 2 } }] });
    },
    velocity_only: function () { return Object.assign(PRESETS.apartments_24(), { sizing: 'velocity' }); },
    multilayer_flats: function () { return Object.assign(PRESETS.apartments_24(), { material: 'multilayer' }); }
  };

  return {
    version: VERSION, SOURCES: SOURCES, FIXTURES: FIXTURES, FIXTURE_IDS: FIXTURE_IDS, BUILDING: BUILDING, EN806_CURVE: EN806_CURVE, EN806_FIG: EN806_FIG, MATERIALS: MATERIALS,
    KINDS: KINDS, VMAX_DEFAULT: VMAX_DEFAULT, DEFAULTS: DEFAULTS, RANGES: RANGES, PRESETS: PRESETS, BUILDING_TYPES: BUILDING_TYPES, DIN_TYPES: DIN_TYPES,
    FLOOR_MIN: FLOOR_MIN, FLOOR_MAX: FLOOR_MAX, vmaxDerived: vmaxDerived, has: has,
    water: water, friction: friction, pipeLoss: pipeLoss, peakFlowDIN: peakFlowDIN, flowEN806: flowEN806, fixtureFlow: fixtureFlow,
    normalise: normalise, loads: loads, buildTree: buildTree, solve: solve, handoff: handoff, parseFixtures: parseFixtures, formatFixtures: formatFixtures
  };
});
