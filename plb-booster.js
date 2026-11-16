/* plb-booster.js — PLBBooster: booster set sizing for drinking-water installations (tools.petrov.re, plbbooster).
 * Pure functions, no DOM, deterministic. UMD: global PLBBooster in the browser, module.exports in node.
 * Method: _plb/boost/METHOD.md (revision plbbooster-1.3).
 *   per floor     : outlet height above the pump h_i, losses dp_i (branch + share of the riser), required flow pressure
 *                   p_req,i = p_minflow + ρ·g·h_i + dp_i (EN 806-2 / DIN 1988-500 pressure balance)
 *   mains         : inlet pressure at design flow p_in = p_supply,min − Δp_meter − Δp_apparatus + ρ·g·(−z_pump);
 *                   booster inlet p_inlet = (p_in or ρ·g·h_tank) − Δp_suction (suction line at design flow, r4 Y2-5)
 *                   a floor works on the mains when p_in − ρ·g·h_i − dp_i ≥ p_minflow
 *   booster       : p_set = max p_req over boosted floors; Δp = p_set − p_inlet (mains, or break tank level); H = Δp/(ρ·g)
 *   peak flow     : DIN 1988-300 Q = a·(ΣQa)^b − c for the boosted share of the building when the constants are given;
 *                   optional floor: Q ≥ sum of the two largest draw-offs of one utilisation unit (r4 Y2-3); flag din_range outside ΣQa 0.2–500 l/s (Y2-6)
 *   static check  : at zero flow the booster stops at p_off = p_set + Δp_switch; with a direct connection the mains night pressure
 *                   passes the stopped pumps: p_static,i = max(p_off, p_supply,max − ρ·g·z_pump) − ρ·g·h_i ≤ p_max (5 bar) (D-PLB-13)
 *                   -> floors that need a pressure reducing valve, or pressure zones (greedy from the top)
 *   vessel        : Boyle–Mariotte, drawdown V_d = Q_step·T/4 with T = 3600/z; V = V_d / (p0·(1/p_on − 1/p_off)) absolute
 *   break tank    : V = max(0, Q − Q_fill)·t_peak + Q·t_buffer; turnover = daily volume / V
 *   energy        : E = V_year·Δp / (η·3.6e6) kWh
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PLBBooster = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'plbbooster-1.3';
  var G = 9.80665, PATM = 1.01325;
  var DIN_QA_MIN = 0.2, DIN_QA_MAX = 500;            /* validity range of the DIN 1988-300 curve (KELOX handbook), as in plb-supply.js */

  var SOURCES = {
    en806_2: { title: 'EN 806-2:2005 Specifications for installations inside buildings conveying water for human consumption — Part 2: Design', kind: 'standard' },
    din1988_500: { title: 'DIN 1988-500:2021-05 Technische Regeln für Trinkwasser-Installationen — Teil 500: Druckerhöhungsanlagen mit drehzahlgesteuerten Pumpen (replaces DIN 1988-500:2011-02; constant-speed operation: DIN EN 806-2:2005-06 §15)', kind: 'standard' },
    en806_2_s15: { title: 'EN 806-2:2005 §15 Pressure booster installations — basis for fixed-speed (cascade) booster sets, which DIN 1988-500 does not cover', kind: 'standard' },
    din1988_300: { title: 'DIN 1988-300:2012-05 Ermittlung der Rohrdurchmesser (peak flow Qs = a·(ΣQa)^b − c)', kind: 'standard' },
    kelox_din300: { title: 'KELOX Technical handbook (2018) summarising DIN 1988-300: curve valid for ΣQa 0.2–500 l/s; utilisation unit — peak of a partial section = sum of its two largest draw-offs; several units: sum of unit peaks if below the curve', kind: 'public_guide' },
    din1988_200: { title: 'DIN 1988-200:2012-05 Installation Typ A — pressure reducing valve when the static pressure at outlets exceeds 5 bar', kind: 'standard' },
    en1717: { title: 'EN 1717:2000 Protection against pollution of potable water — air gap AB for break tanks', kind: 'standard' },
    tanaka2001: { title: 'Tanaka M. et al., Recommended table for the density of water between 0 °C and 40 °C, Metrologia 38 (2001) 301–309', kind: 'public_guide' },
    boyle: { title: 'Isothermal gas law (Boyle–Mariotte) for a pre-charged membrane vessel; drawdown Q·T/4 for on/off cycling', kind: 'public_guide' },
    la_boost: { title: 'Learning assumption of this tool (replace with manufacturer or utility data)', kind: 'learning_assumption' }
  };

  var DEFAULTS = {
    floors: 8, floor_h: 3.6, h_out: 1.2, z_pump: -3.5,
    p_minflow: 1.0, dp_dist: 0.6, dp_branch: 0.25,
    p_sup_min: 3.5, p_sup_max: 4.5, dp_meter: 0.25, dp_app: 0.35, p_in_min: 1.0, suction_loss_bar: 0,
    connection: 'direct', h_tank: 0.5, zoning: 'all',
    p_max: 5.0, q_design: 3.5, peak: null, two_largest_lps: null,
    control: 'vsd', n_duty: 2, n_standby: 1, eta: 0.55,
    z_max: 20, dp_sw: 0.5, dp_pre: 0.3, f_stop: 0.1, vessel_l: 0,
    q_fill: 2.0, t_peak: 20, t_buf: 2,
    v_day: 30, price_el: 0.30, T_c: 10
  };

  /* density of air-free water, Tanaka et al. 2001 (0–40 °C) */
  function rho(T) {
    var t = Number(T);
    return 999.97495 * (1 - (t - 3.983035) * (t - 3.983035) * (t + 301.797) / (522528.9 * (t + 69.34881)));
  }
  function dinPeak(x, pk) {
    if (!(x > 0)) return 0;
    var v = pk.a * Math.pow(x, pk.b) - pk.c;
    return Math.min(x, Math.max(v, pk.maxSingle || 0));
  }

  function num(v) { return typeof v === 'number' && isFinite(v); }
  function normalise(inp) {
    var o = {}, k;
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) o[k] = DEFAULTS[k];
    if (inp && typeof inp === 'object') for (k in inp) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && inp[k] !== undefined) o[k] = inp[k];
    return o;
  }
  function validate(o) {
    var e = [];
    var rng = function (k, lo, hi) { if (!num(o[k]) || o[k] < lo || o[k] > hi) e.push(k); };
    /* counts (floors, duty and standby pumps) are whole numbers (X1-2) */
    var whole = function (k) { if (num(o[k]) && Math.round(o[k]) !== o[k] && e.indexOf(k) < 0) e.push(k); };
    rng('floors', 1, 80); whole('floors');
    rng('floor_h', 2, 8); rng('h_out', 0, 3); rng('z_pump', -30, 30);
    rng('p_minflow', 0.2, 5); rng('dp_dist', 0, 10); rng('dp_branch', 0, 10);
    if (num(o.dp_dist) && num(o.dp_branch) && o.dp_branch > o.dp_dist) e.push('dp_branch');
    rng('p_sup_min', 0, 16); rng('p_sup_max', 0, 16); if (num(o.p_sup_min) && num(o.p_sup_max) && o.p_sup_max < o.p_sup_min) e.push('p_sup_max');
    rng('dp_meter', 0, 5); rng('dp_app', 0, 5); rng('p_in_min', 0, 5); rng('h_tank', 0, 10); rng('suction_loss_bar', 0, 5);
    if (o.two_largest_lps != null && (!num(o.two_largest_lps) || o.two_largest_lps <= 0 || o.two_largest_lps > 100)) e.push('two_largest_lps');
    rng('p_max', 1, 16); rng('q_design', 0.01, 200);
    rng('n_duty', 1, 6); whole('n_duty'); rng('n_standby', 0, 3); whole('n_standby'); rng('eta', 0.05, 1);
    rng('z_max', 1, 200); rng('dp_sw', 0.05, 5); rng('dp_pre', 0, 3); rng('f_stop', 0.01, 1); rng('vessel_l', 0, 100000);
    rng('q_fill', 0, 200); rng('t_peak', 0, 240); rng('t_buf', 0, 120);
    rng('v_day', 0, 100000); rng('price_el', 0, 5); rng('T_c', 0, 40);
    if (['direct', 'indirect'].indexOf(o.connection) < 0) e.push('connection');
    if (['all', 'split'].indexOf(o.zoning) < 0) e.push('zoning');
    if (['vsd', 'cascade'].indexOf(o.control) < 0) e.push('control');
    if (o.peak != null) {
      var p = o.peak;
      if (typeof p !== 'object' || !num(p.a) || !num(p.b) || !num(p.c) || !num(p.sumQa) || p.sumQa <= 0 || p.a <= 0 ||
        (p.maxSingle != null && (!num(p.maxSingle) || p.maxSingle < 0))) e.push('peak');
    }
    /* pump below the lowest outlet; a pump above the outlets (roof tank) is a different system (CR-46) */
    if (num(o.h_out) && num(o.z_pump) && o.h_out - o.z_pump < 0 && e.indexOf('z_pump') < 0) e.push('z_pump');
    return e;
  }

  function solve(inp) {
    var o = normalise(inp), errors = validate(o);
    if (errors.length) return { valid: false, errors: errors, input: o, version: VERSION };
    var r = rho(o.T_c), bar_m = r * G / 1e5;           /* bar per metre of water column */
    var N = o.floors, flags = [];
    var hTop = (N - 1) * o.floor_h + o.h_out - o.z_pump;
    var pRef = o.p_sup_min - o.dp_meter - o.dp_app;     /* at ground level (supply reference), design flow */
    var pInMains = pRef - bar_m * o.z_pump;              /* at the pump level */
    var rows = [];
    for (var i = 0; i < N; i++) {
      var zOut = i * o.floor_h + o.h_out, h = zOut - o.z_pump;
      var share = hTop > 0 ? h / hTop : 1;
      var dp = o.dp_branch + (o.dp_dist - o.dp_branch) * share;
      var pReq = o.p_minflow + bar_m * h + dp;
      var pMains = pInMains - bar_m * h - dp;
      rows.push({ floor: i, z_out: zOut, h: h, dp: dp, p_req: pReq, p_mains: pMains, direct_ok: pMains >= o.p_minflow - 1e-12,
        boosted: false, p_dyn: null, p_static: null, prv: false, zone: null });
    }
    /* which floors are boosted */
    var firstFail = -1;
    for (i = 0; i < N; i++) if (!rows[i].direct_ok) { firstFail = i; break; }
    var anyFail = rows.some(function (x) { return !x.direct_ok; });
    var needed = anyFail;
    var lo = !needed ? N : (o.zoning === 'split' ? firstFail : 0);
    if (o.connection === 'indirect' && o.zoning === 'all') { lo = 0; needed = true; }
    if (o.connection === 'indirect' && o.zoning === 'split' && !anyFail) { lo = N; needed = false; }
    for (i = lo; i < N; i++) rows[i].boosted = true;
    var nB = N - lo;

    var res = { valid: true, errors: [], version: VERSION, input: o, rho: r, bar_per_m: bar_m, rows: rows,
      p_ref: pRef, p_in_mains: pInMains, n_direct: lo, n_boosted: nB, booster_needed: needed && nB > 0, h_top: hTop, flags: flags };

    /* direct floors: static at night on the mains */
    var mainsStatic = [];
    for (i = 0; i < lo; i++) { rows[i].p_static = o.p_sup_max - bar_m * rows[i].z_out; if (rows[i].p_static > o.p_max + 1e-12) { rows[i].prv = true; mainsStatic.push(i); } }
    if (mainsStatic.length) flags.push('mains_static_high');

    if (!res.booster_needed) {
      flags.unshift('booster_not_needed');
      res.p_set = null; res.dp_boost = 0; res.head_m = 0; res.q_boost = 0; res.pumps = null; res.vessel = null; res.tank = null; res.zones = [];
      res.prv_floors = mainsStatic.slice(); res.energy = { v_year_m3: 0, kwh: 0, eur: 0 };
      res.margin_min = Math.min.apply(null, rows.map(function (x) { return x.p_mains - o.p_minflow; }));
      res.handoff = null;
      return res;
    }

    /* booster pressure */
    var pSet = -Infinity;
    for (i = lo; i < N; i++) pSet = Math.max(pSet, rows[i].p_req);
    /* suction line (break tank or mains connection → pump) at design flow (r4 Y2-5); NPSH is a separate check */
    var pInlet = (o.connection === 'indirect' ? bar_m * o.h_tank : pInMains) - o.suction_loss_bar;
    var dpB = pSet - pInlet;
    if (dpB < 0) { flags.push('inlet_above_set'); dpB = 0; }
    var head = dpB / bar_m;
    if (o.connection === 'direct' && pInlet < o.p_in_min - 1e-12) flags.push('inlet_low');
    if (o.connection === 'direct' && pInlet <= 0) flags.push('inlet_negative');
    if (o.connection === 'indirect' && pInlet < -1e-12) flags.push('tank_suction_negative');
    /* membrane pre-charge must stay above atmospheric (CR-45) */
    if (pSet - o.dp_pre <= 0) return { valid: false, errors: ['dp_pre'], input: o, version: VERSION };

    /* design flow of the boosted part */
    var qB = o.q_design, qNote = 'input', qCurve = null, xQa = null;
    if (o.peak) {
      var frac = nB / N, pk = { a: o.peak.a, b: o.peak.b, c: o.peak.c, maxSingle: o.peak.maxSingle || 0 };
      xQa = o.peak.sumQa * frac;
      qB = qCurve = dinPeak(xQa, pk); qNote = 'din_peak';
      /* utilisation unit (r4 Y2-3): the boosted part carries at least the two largest draw-offs of one unit, never more than ΣQa */
      if (o.two_largest_lps != null) {
        var qNe = Math.min(xQa, o.two_largest_lps);
        if (qNe > qB + 1e-12) { qB = qNe; qNote = 'din_unit'; }
      }
      if (xQa < DIN_QA_MIN - 1e-12 || xQa > DIN_QA_MAX + 1e-12) flags.push('din_range');
    }
    /* DIN curve below zero without a largest single draw-off: nothing to size for (QA-24, CR-45) */
    if (!(qB > 0)) return { valid: false, errors: ['q_zero'], input: o, version: VERSION };
    var qEach = qB / o.n_duty;
    var Phyd = qEach / 1000 * dpB * 1e5;                 /* W per pump */
    var pumps = { n_duty: o.n_duty, n_standby: o.n_standby, n_total: o.n_duty + o.n_standby, q_each_lps: qEach, q_total_lps: qB,
      P_hyd_kW: Phyd / 1000, P_shaft_kW: Phyd / o.eta / 1000, P_total_kW: Phyd * o.n_duty / o.eta / 1000 };
    if (o.n_standby < 1) flags.push('no_standby');

    /* static pressure and zoning */
    var pOff = pSet + o.dp_sw, prvFloors = mainsStatic.slice();
    /* direct connection: the mains night pressure reaches the boosted floors through the stopped pumps (D-PLB-13) */
    var pStatIn = o.connection === 'direct' ? o.p_sup_max - bar_m * o.z_pump : null;
    var pStatSrc = pStatIn != null ? Math.max(pOff, pStatIn) : pOff;
    /* flag only when the mains, not the booster, puts a floor above p_max */
    if (pStatIn != null && pStatIn > pOff + 1e-12 && pStatIn - bar_m * rows[lo].h > o.p_max + 1e-12) flags.push('inlet_static_high');
    for (i = lo; i < N; i++) {
      rows[i].p_dyn = pSet - bar_m * rows[i].h - rows[i].dp;
      rows[i].p_static = pStatSrc - bar_m * rows[i].h;
      if (rows[i].p_static > o.p_max + 1e-12) { rows[i].prv = true; prvFloors.push(i); }
    }
    prvFloors.sort(function (a, b) { return a - b; });
    if (prvFloors.length > mainsStatic.length) flags.push('prv_floors');
    var zones = [], top = N - 1, src = pStatSrc, k = 1, infeasible = false;
    while (top >= lo) {
      var bottom = top;
      if (src - bar_m * rows[top].h > o.p_max + 1e-12) { infeasible = true; }
      while (bottom - 1 >= lo && src - bar_m * rows[bottom - 1].h <= o.p_max + 1e-12) bottom--;
      zones.push({ zone: k, top: top, bottom: bottom, p_set: k === 1 ? pSet : src, p_static_bottom: src - bar_m * rows[bottom].h, source: k === 1 ? 'booster' : 'prv' });
      for (i = bottom; i <= top; i++) rows[i].zone = k;
      top = bottom - 1; k++;
      if (top >= lo) src = rows[top].p_req;
      if (k > 100) break;
    }
    if (infeasible) flags.push('zone_infeasible');
    if (zones.length > 1) flags.push('zones_needed');

    /* membrane vessel */
    var pOn = pSet, p0 = pOn - o.dp_pre;
    var qStep = o.control === 'cascade' ? qEach : o.f_stop * qEach;
    var T = 3600 / o.z_max, Vd = qStep * T / 4;          /* litres */
    var fac = (p0 + PATM) * (1 / (pOn + PATM) - 1 / (pOff + PATM));
    var vessel = { q_step_lps: qStep, cycle_s: T, V_draw_l: Vd, V_req_l: Vd / fac, p_on: pOn, p_off: pOff, p0: p0, factor: fac,
      V_inst_l: o.vessel_l > 0 ? o.vessel_l : null, starts_h: null };
    if (o.vessel_l > 0) {
      var VdA = o.vessel_l * fac;
      vessel.starts_h = 900 * qStep / VdA;
      if (vessel.starts_h > o.z_max + 1e-9) flags.push('starts_exceeded');
    }

    /* break tank */
    var shareV = nB / N, tank = null;
    if (o.connection === 'indirect') {
      var Vt = Math.max(0, qB - o.q_fill) * o.t_peak * 60 + qB * o.t_buf * 60;
      var vday = o.v_day * 1000 * shareV;
      tank = { V_l: Vt, q_fill_lps: o.q_fill, turnover_per_day: Vt > 0 ? vday / Vt : null, residence_h: vday > 0 ? 24 * Vt / vday : null };
      if (o.q_fill <= 0) flags.push('no_fill');
      if (tank.turnover_per_day != null && tank.turnover_per_day < 1 - 1e-12) flags.push('tank_stagnation');
    }

    var vYear = o.v_day * 365 * shareV, kwh = vYear * dpB * 1e5 / (o.eta * 3.6e6);
    res.p_set = pSet; res.p_inlet = pInlet; res.p_off = pOff; res.p_static_inlet = pStatIn; res.p_static_src = pStatSrc; res.dp_boost = dpB; res.head_m = head;
    res.q_boost = qB; res.q_note = qNote; res.q_curve = qCurve; res.sumQa_boosted = xQa; res.suction_loss = o.suction_loss_bar; res.pumps = pumps; res.vessel = vessel; res.tank = tank; res.zones = zones; res.prv_floors = prvFloors;
    res.energy = { v_year_m3: vYear, kwh: kwh, eur: kwh * o.price_el };
    res.handoff = handoff(res);
    return res;
  }

  /* handoff for operatingpoint (accepts Vdot, dp, rho, T) — per duty pump */
  function handoff(res) {
    if (!res || !res.valid || !res.booster_needed) return null;
    return { Vdot: res.pumps.q_each_lps / 1000, dp: res.dp_boost * 1e5, rho: res.rho, T: res.input.T_c + 273.15,
      head_m: res.head_m, q_total_lps: res.q_boost, n_duty: res.pumps.n_duty, n_standby: res.pumps.n_standby, p_set_bar: res.p_set };
  }

  /* pressure-vs-height profile for the chart */
  function profile(res) {
    if (!res || !res.valid) return [];
    return res.rows.map(function (x) { return { floor: x.floor, h: x.h, req: x.p_req, mains: x.p_mains, dyn: x.p_dyn, stat: x.p_static, boosted: x.boosted, zone: x.zone }; });
  }

  /* presets: building data from PLBCore.PRESET_PROJECTS where it fits; peak flow constants DIN 1988-300 (as in plumbing-core 0.1.0) */
  var PEAK = { residential: { a: 1.48, b: 0.19, c: 0.94 }, office: { a: 0.91, b: 0.31, c: 0.38 }, hotel: { a: 0.70, b: 0.48, c: 0.13 }, care_home: { a: 1.40, b: 0.14, c: 0.92 }, school: { a: 0.91, b: 0.31, c: 0.38 } };
  function pk(bt, sumQa, maxSingle) { var p = PEAK[bt]; return { a: p.a, b: p.b, c: p.c, sumQa: sumQa, maxSingle: maxSingle, bt: bt }; }
  var PRESETS = {
    office_8f: function () { return { floors: 8, floor_h: 3.6, p_sup_min: 3.5, p_sup_max: 4.5, zoning: 'all', peak: pk('office', 28, 0.3), v_day: 30 }; },
    office_8f_split: function () { return { floors: 8, floor_h: 3.6, p_sup_min: 3.5, p_sup_max: 4.5, zoning: 'split', peak: pk('office', 28, 0.3), v_day: 30 }; },
    office_8f_cascade: function () { return { floors: 8, floor_h: 3.6, p_sup_min: 3.5, p_sup_max: 4.5, zoning: 'all', peak: pk('office', 28, 0.3), v_day: 30, control: 'cascade', dp_sw: 1.0 }; },
    tower_20f: function () { return { floors: 20, floor_h: 3.0, z_pump: -3, p_sup_min: 3.0, p_sup_max: 4.0, dp_dist: 0.9, zoning: 'all', peak: pk('residential', 89, 0.3), v_day: 21, n_duty: 2 }; },
    apartments_24: function () { return { floors: 6, floor_h: 3.0, z_pump: -3, p_sup_min: 3.0, p_sup_max: 4.0, dp_dist: 0.5, dp_meter: 0.2, dp_app: 0.2, zoning: 'all', peak: pk('residential', 26.64, 0.3), v_day: 6.5, n_duty: 1 }; },
    hotel_120_tank: function () { return { floors: 6, floor_h: 3.1, z_pump: -3.5, p_sup_min: 3.2, p_sup_max: 4.2, dp_dist: 0.6, connection: 'indirect', zoning: 'all', peak: pk('hotel', 95.44, 0.3), v_day: 40, n_duty: 2, q_fill: 1.5, t_peak: 30, t_buf: 2 }; },
    hotel_120_bigtank: function () { return { floors: 6, floor_h: 3.1, z_pump: -3.5, p_sup_min: 3.2, p_sup_max: 4.2, dp_dist: 0.6, connection: 'indirect', zoning: 'all', peak: pk('hotel', 95.44, 0.3), v_day: 40, n_duty: 2, q_fill: 0.3, t_peak: 120, t_buf: 10 }; }
  };

  return { VERSION: VERSION, DIN_QA_MIN: DIN_QA_MIN, DIN_QA_MAX: DIN_QA_MAX, SOURCES: SOURCES, DEFAULTS: DEFAULTS, PRESETS: PRESETS, PEAK: PEAK, rho: rho, dinPeak: dinPeak, normalise: normalise,
    validate: function (inp) { return validate(normalise(inp)); }, solve: solve, handoff: handoff, profile: profile };
}));
