/* plb-circ.js — DHW circulation & balancing engine for plbcirc.html (tools.petrov.re, plumbing package).
 * Global PLBCirc (browser) / module.exports (node). Pure functions, no DOM, deterministic.
 * Method: _plb/circ/METHOD.md (plbcirc-1.3). Independent reference: bench-src/ref/gen_plbcirc.py.
 *
 * The network is a tree of SECTIONS. Every section is a flow (hot) pipe plus its parallel return
 * (circulation) pipe. The root section starts at the water heater; a leaf section ends where its flow
 * pipe turns into its own return pipe (top of a riser loop) and carries one regulating valve.
 * Temperatures in °C, lengths in m, pipe sizes in mm (outer diameter of the chosen series), flows in kg/s.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PLBCirc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'plbcirc-1.4';
  var CP = 4184;          /* J/(kg K), water at 55–60 °C, constant (stated) */
  var G = 9.81;

  var SOURCES = {
    dvgw_w553: { title: 'DVGW W 553 — Bemessung von Zirkulationssystemen in zentralen Trinkwassererwärmungsanlagen (flow-split rule and 5 K flow-pipe allowance as published in trade literature; the standard text was not available to this tool — verify)', edition: '1998-12', url: 'https://www.dvgw.de/', kind: 'standard' },
    din1988_300: { title: 'DIN 1988-300 — Technische Regeln für Trinkwasser-Installationen: Ermittlung der Rohrdurchmesser (circulation part replaces W 553; cited by content from trade literature, the standard text was not available to this tool — verify)', edition: '2012-05', url: 'https://www.din.de/', kind: 'standard' },
    dvgw_w551: { title: 'DVGW W 551 — Trinkwassererwärmungs- und Trinkwasserleitungsanlagen; technische Maßnahmen zur Verminderung des Legionellenwachstums (60 °C outlet, ≥ 55 °C return, interruption ≤ 8 h/day)', edition: '2004-04', url: 'https://www.dvgw.de/', kind: 'standard' },
    vl_legionella: { title: 'Vlaams Legionellabesluit — Besluit van de Vlaamse Regering van 9 februari 2007 houdende maatregelen ter voorkoming van legionellose in publiek toegankelijke inrichtingen (as amended)', edition: '2007 + amendments', url: 'https://codex.vlaanderen.be/', kind: 'regulation' },
    cen_tr16355: { title: 'CEN/TR 16355 — Recommendations for prevention of Legionella growth in installations inside buildings conveying water for human consumption', edition: '2012', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    geg_anl8: { title: 'Gebäudeenergiegesetz (GEG 2020) Anlage 8 — Wärmedämmung von Wärmeverteilungs- und Warmwasserleitungen (20 / 30 mm / = d_i / 100 mm at λ = 0.035 W/(m K))', edition: '2020 (2023 amendment)', url: 'https://www.gesetze-im-internet.de/geg/anlage_8.html', kind: 'regulation' },
    iso12241: { title: 'EN ISO 12241 — Thermal insulation for building equipment and industrial installations — Calculation rules (cylindrical layer, outer surface coefficient)', edition: '2022', url: 'https://www.iso.org/', kind: 'standard' },
    en1057: { title: 'EN 1057 — Copper tubes for water and gas in sanitary and heating applications (OD × wall)', edition: '2006+A1:2010', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    en10312: { title: 'EN 10312 — Welded stainless steel tubes for water for human consumption (series 2, press systems)', edition: '2002/A1:2005', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    colebrook: { title: 'Colebrook, C. F. (1939) Turbulent flow in pipes… J. Inst. Civ. Eng. 11; Darcy–Weisbach', edition: '1939', url: '', kind: 'public_guide' },
    tanaka2001: { title: 'Tanaka et al. (2001) Recommended table for the density of water between 0 °C and 40 °C (Thiesen form, used to 100 °C within 0.1 %)', edition: 'Metrologia 38', url: '', kind: 'public_guide' },
    learning: { title: 'Learning assumption of this tool — typical value, replace with project data', edition: VERSION, url: '', kind: 'learning_assumption' }
  };

  /* pipe series: [outer diameter mm, wall mm]. Taken from PLBCore.MATERIALS (copper, stainless, multilayer) when
     plumbing-core.js is loaded, so circ and the other plumbing tools use the same inner diameters (CR-34);
     the embedded copy below is identical to plumbing-core.js 0.1.0 and is used only without the core. */
  var MATERIALS = {
    cu: { core: 'copper', roughness_mm: 0.0015, source: 'en1057', series: [[12, 1], [15, 1], [18, 1], [22, 1], [28, 1.5], [35, 1.5], [42, 1.5], [54, 2], [76.1, 2], [88.9, 2], [108, 2.5]] },
    ss: { core: 'stainless', roughness_mm: 0.0015, source: 'en10312', series: [[15, 1], [18, 1], [22, 1.2], [28, 1.2], [35, 1.5], [42, 1.5], [54, 1.5], [76.1, 2], [88.9, 2], [108, 2]] },
    ml: { core: 'multilayer', roughness_mm: 0.007, source: 'learning', series: [[16, 2], [20, 2], [26, 3], [32, 3], [40, 3.5], [50, 4], [63, 4.5]] }
  };
  var MATERIALS_FROM = 'embedded';
  (function () {
    var P = null;
    try { P = (typeof PLBCore !== 'undefined') ? PLBCore : (typeof require === 'function' ? require('./plumbing-core.js') : null); } catch (e) { P = null; }
    if (!P || !P.MATERIALS) return;
    Object.keys(MATERIALS).forEach(function (k) {
      var cm = P.MATERIALS[MATERIALS[k].core];
      if (!cm || !Array.isArray(cm.series) || !cm.series.length) return;
      MATERIALS[k].series = cm.series.map(function (r) { return [r.od_mm, r.wall_mm]; });
      if (typeof cm.roughness_mm === 'number') MATERIALS[k].roughness_mm = cm.roughness_mm;
    });
    MATERIALS_FROM = 'PLBCore ' + (P.version || '');
  })();

  function pipeOf(mat, od) {
    var m = MATERIALS[mat] || MATERIALS.cu, best = null, bd = Infinity;
    for (var i = 0; i < m.series.length; i++) { var d = Math.abs(m.series[i][0] - od); if (d < bd) { bd = d; best = m.series[i]; } }
    return { od: best[0], wall: best[1], id: best[0] - 2 * best[1], exact: bd < 1e-9 };
  }
  /* a size is accepted if it lies within the series range (±25 %), otherwise a validation error; inside the range a
     size that is not in the series is snapped to the nearest one and flagged od_snapped (CR-33) */
  function odInRange(mat, od) {
    var se = (MATERIALS[mat] || MATERIALS.cu).series;
    return typeof od === 'number' && isFinite(od) && od >= 0.75 * se[0][0] && od <= 1.25 * se[se.length - 1][0];
  }

  /* insulation thickness, mm, at λ = 0.035 for the GEG classes; 'custom' = given mm at the given λ */
  function insThickness(kind, di_mm, custom_mm) {
    if (kind === 'none') return 0;
    if (kind === 'custom') return Math.max(0, +custom_mm || 0);
    var full = di_mm <= 22 ? 20 : di_mm <= 35 ? 30 : di_mm <= 100 ? di_mm : 100;
    if (kind === 'geg50') return full / 2;
    return full; /* geg100 */
  }
  /* linear heat-loss coefficient U' in W/(m K) — cylindrical insulation layer + outer surface coefficient (EN ISO 12241 form) */
  function uPrime(od_mm, s_mm, lambda, ho) {
    var Do = od_mm / 1000, s = s_mm / 1000;
    if (s <= 0) return Math.PI * ho * Do;
    var Di = Do + 2 * s;
    return Math.PI / (Math.log(Di / Do) / (2 * lambda) + 1 / (ho * Di));
  }

  function rho(T) { return 1000 * (1 - (T + 288.9414) / (508929.2 * (T + 68.12963)) * (T - 3.9863) * (T - 3.9863)); }
  function mu(T) { return 2.414e-5 * Math.pow(10, 247.8 / (T + 273.15 - 140)); }

  function friction(Re, rel) {
    if (Re <= 0) return 0;
    if (Re < 2300) return 64 / Re;
    if (Re < 4000) { var w = (Re - 2300) / 1700; return (1 - w) * 64 / 2300 + w * colebrook(4000, rel); }
    return colebrook(Re, rel);
  }
  function colebrook(Re, rel) {
    var x = -2 * Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9)); /* Swamee–Jain start */
    for (var i = 0; i < 60; i++) {
      var xn = -2 * Math.log10(rel / 3.7 + 2.51 * x / Re);
      if (Math.abs(xn - x) < 1e-12) { x = xn; break; }
      x = xn;
    }
    return 1 / (x * x);
  }
  function dpPipe(m, id_mm, L, eps_mm, props) {
    var d = id_mm / 1000, A = Math.PI * d * d / 4;
    if (!(m > 0) || !(L > 0)) return { v: m > 0 ? m / props.rho / A : 0, Re: 0, lambda: 0, dp: 0 };
    var v = m / props.rho / A, Re = props.rho * v * d / props.mu, lam = friction(Re, eps_mm / id_mm);
    return { v: v, Re: Re, lambda: lam, dp: lam * L / d * props.rho * v * v / 2 };
  }

  var DEFAULTS = {
    material: 'cu', method: 'split', dT_basis: 'loop', T_out: 60, dT_design: 5, T_set: 57, T_min: 55,
    lambda_ins: 0.035, h_o: 9, fittings_pct: 40, dp_valve_min_kpa: 3, dp_fixed_kpa: 5,
    vmax: 0.5, kv_min: 0.1, hours_day: 24, eff_heat: 0.9, price_heat: 0.10, co2_heat: 0.2,
    pump_eta: 0.25, price_el: 0.30
  };

  var INS_KINDS = ['none', 'geg50', 'geg100', 'custom'];
  /* r4 Y3-1: hard (bad) flags = a W 551 temperature requirement is not met; the rest are warnings or information */
  var FLAG_LEVEL = { outlet_below_60: 'bad', return_below_min: 'bad', sections_below_min: 'bad', interruption_over_8h: 'bad',
    velocity_high: 'warn', kv_small: 'warn', setpoint_unreachable: 'bad', od_snapped: 'info', not_converged: 'bad', flow_basis_approx: 'warn' };
  function num(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; }
  function missing(x) { return x === undefined || x === null || x === ''; }

  /* D-PLB-14: null / '' = missing -> default; a present value that is not a finite number is a validation error
     (never silently replaced); a non-array `sections` and non-object sections are rejected (CR-32) */
  function normalise(inp) {
    var o = {}, k, bad = [];
    inp = (inp && typeof inp === 'object') ? inp : {};
    for (k in DEFAULTS) {
      if (k === 'material' || k === 'method' || k === 'dT_basis') { o[k] = missing(inp[k]) ? DEFAULTS[k] : inp[k]; continue; }
      if (!missing(inp[k]) && !(typeof inp[k] === 'number' && isFinite(inp[k]))) bad.push('type:' + k);
      o[k] = num(inp[k], DEFAULTS[k]);
    }
    if (!Object.prototype.hasOwnProperty.call(MATERIALS, o.material)) { bad.push('material'); o.material = 'cu'; }
    if (['split', 'thermo', 'none'].indexOf(o.method) < 0) { bad.push('method'); o.method = 'split'; }
    if (['loop', 'flow'].indexOf(o.dT_basis) < 0) { bad.push('dT_basis'); o.dT_basis = 'loop'; }
    var raw = missing(inp.sections) ? [] : inp.sections;
    if (!Array.isArray(raw)) { bad.push('sections_not_array'); raw = []; }
    raw.forEach(function (s, i) { if (!s || typeof s !== 'object' || Array.isArray(s)) bad.push('section_not_object:' + i); });
    o.input_errors = bad;
    o.sections = raw.filter(function (s) { return s && typeof s === 'object' && !Array.isArray(s); }).map(function (s) {
      ['Lf', 'Lr', 'odf', 'odr', 'ins_mm', 'Ta'].forEach(function (f) { if (!missing(s[f]) && !(typeof s[f] === 'number' && isFinite(s[f]))) bad.push('type:' + f + ':' + s.id); });
      /* X2-3: a present insulation class outside the list is an input error (never replaced by geg100); missing -> geg100 */
      if (!missing(s.ins) && INS_KINDS.indexOf(s.ins) < 0) bad.push('ins:' + s.id);
      return { id: String(s.id == null ? '' : s.id).trim(), parent: (s.parent == null || s.parent === '') ? null : String(s.parent).trim(), name: s.name || '',
        Lf: num(s.Lf, 0), odf: num(s.odf, 22), Lr: num(s.Lr, num(s.Lf, 0)), odr: num(s.odr, 15),
        ins: missing(s.ins) ? 'geg100' : s.ins, ins_mm: num(s.ins_mm, 0), Ta: num(s.Ta, 20) };
    });
    return o;
  }

  function validate(o) {
    var e = (o.input_errors || []).slice(), ids = Object.create(null), roots = [];
    if (!o.sections.length) e.push('no_sections');
    if (o.sections.length > 200) e.push('too_many_sections');
    o.sections.forEach(function (s) {
      if (!s.id) e.push('empty_id');
      else if (s.id in ids) e.push('duplicate_id:' + s.id);
      ids[s.id] = s;
      if (!(s.Lf > 0) || s.Lf > 2000) e.push('length:' + s.id);
      if (!(s.Lr >= 0) || s.Lr > 2000) e.push('length:' + s.id);
      if (!(s.Ta > -20 && s.Ta < o.T_min - 1)) e.push('ambient:' + s.id);
      if (s.ins === 'custom' && !(s.ins_mm >= 0 && s.ins_mm <= 200)) e.push('insulation:' + s.id);
      if (!odInRange(o.material, s.odf) || !odInRange(o.material, s.odr)) e.push('od:' + s.id);
    });
    o.sections.forEach(function (s) {
      if (s.parent === null) roots.push(s.id);
      else if (!(s.parent in ids) || s.parent === s.id) e.push('parent:' + s.id);
    });
    if (roots.length !== 1 && o.sections.length) e.push('roots:' + roots.length);
    /* cycles: walk up from each node */
    o.sections.forEach(function (s) {
      var seen = {}, c = s, n = 0;
      while (c && c.parent !== null && n < 500) { if (seen[c.id]) { e.push('cycle:' + s.id); break; } seen[c.id] = 1; c = ids[c.parent]; n++; }
    });
    if (!(o.T_out >= 45 && o.T_out <= 90)) e.push('T_out');
    if (!(o.T_min >= 30 && o.T_min < o.T_out)) e.push('T_min');
    if (!(o.dT_design > 0 && o.dT_design <= 20)) e.push('dT_design');
    /* r4 Y3-1: a whole-loop drop must leave the return above every ambient, else no flow reaches it */
    else if (o.dT_basis === 'loop' && o.sections.some(function (s) { return !(o.T_out - o.dT_design > s.Ta + 0.5); })) e.push('dT_loop');
    if (o.method === 'thermo' && !(o.T_set < o.T_out && o.T_set > 30)) e.push('T_set');
    if (!(o.lambda_ins > 0.01 && o.lambda_ins < 1)) e.push('lambda_ins');
    if (!(o.h_o >= 2 && o.h_o <= 50)) e.push('h_o');
    if (!(o.fittings_pct >= 0 && o.fittings_pct <= 300)) e.push('fittings_pct');
    if (!(o.dp_valve_min_kpa >= 0 && o.dp_valve_min_kpa <= 100)) e.push('dp_valve_min_kpa');
    if (!(o.dp_fixed_kpa >= 0 && o.dp_fixed_kpa <= 200)) e.push('dp_fixed_kpa');
    if (!(o.hours_day > 0 && o.hours_day <= 24)) e.push('hours_day');
    if (!(o.eff_heat > 0.1 && o.eff_heat <= 5)) e.push('eff_heat');
    if (!(o.pump_eta > 0.01 && o.pump_eta <= 1)) e.push('pump_eta');
    if (!(o.vmax > 0 && o.vmax <= 5)) e.push('vmax');
    if (!(o.kv_min >= 0 && o.kv_min <= 100)) e.push('kv_min');
    ['price_heat', 'co2_heat', 'price_el'].forEach(function (k) { if (!(o[k] >= 0 && o[k] <= 100)) e.push(k); });
    return e;
  }

  function solve(inp) {
    var o = normalise(inp), errors = validate(o);
    if (errors.length) return { valid: false, errors: errors, version: VERSION };
    var byId = {}, order = [], kids = {}, rootId = null;
    o.sections.forEach(function (s) { byId[s.id] = s; kids[s.id] = []; if (s.parent === null) rootId = s.id; });
    o.sections.forEach(function (s) { if (s.parent !== null) kids[s.parent].push(s.id); });
    (function walk(id) { order.push(id); kids[id].forEach(walk); })(rootId);
    var leaves = order.filter(function (id) { return !kids[id].length; });
    var mat = MATERIALS[o.material];
    var Tp = o.T_out - 2.5, props = { rho: rho(Tp), mu: mu(Tp) };
    var Tm = o.T_out - o.dT_design / 2;

    /* geometry and U' */
    var S = {};
    order.forEach(function (id) {
      var s = byId[id], pf = pipeOf(o.material, s.odf), pr = pipeOf(o.material, s.odr);
      var sf = insThickness(s.ins, pf.id, s.ins_mm), sr = insThickness(s.ins, pr.id, s.ins_mm);
      var lam = s.ins === 'custom' ? o.lambda_ins : 0.035; /* GEG thicknesses are defined at λ = 0.035 */
      S[id] = { s: s, pf: pf, pr: pr, sf: sf, sr: sr, Uf: uPrime(pf.od, sf, lam, o.h_o), Ur: uPrime(pr.od, sr, lam, o.h_o) };
      S[id].Qd = S[id].Uf * s.Lf * (Tm - s.Ta); /* design loss of the flow pipe (W 553) */
    });
    /* subtree design losses */
    var Qsub = {};
    order.slice().reverse().forEach(function (id) { Qsub[id] = S[id].Qd + kids[id].reduce(function (a, c) { return a + Qsub[c]; }, 0); });
    var QW = Qsub[rootId];
    var mFlow = QW / (CP * o.dT_design); /* W 553 flow-pipe rule: loss of the flow pipes only, at the mean temperature */

    /* W 553 split: flow into a junction is divided in proportion to the downstream flow-pipe losses */
    function splitFlows(mRoot) {
      var m = {}; m[rootId] = mRoot;
      order.forEach(function (id) {
        var ks = kids[id]; if (!ks.length) return;
        var tot = ks.reduce(function (a, c) { return a + Qsub[c]; }, 0);
        ks.forEach(function (c) { m[c] = tot > 0 ? m[id] * Qsub[c] / tot : m[id] / ks.length; });
      });
      return m;
    }
    function flowsFromLeaves(mLeaf) {
      var m = {};
      order.slice().reverse().forEach(function (id) { m[id] = kids[id].length ? kids[id].reduce(function (a, c) { return a + m[c]; }, 0) : mLeaf[id]; });
      return m;
    }
    function decay(Tin, Ta, UL, m) { return m > 0 ? Ta + (Tin - Ta) * Math.exp(-UL / (m * CP)) : Ta; }
    function temps(m) {
      var T = {};
      order.forEach(function (id) {
        var x = S[id], s = x.s, tin = s.parent === null ? o.T_out : T[s.parent].fEnd;
        T[id] = { fIn: tin, fEnd: decay(tin, s.Ta, x.Uf * s.Lf, m[id]) };
      });
      order.slice().reverse().forEach(function (id) {
        var x = S[id], s = x.s, t = T[id], ks = kids[id];
        t.rIn = ks.length ? ks.reduce(function (a, c) { return a + m[c] * T[c].rOut; }, 0) / m[id] : t.fEnd;
        t.rOut = decay(t.rIn, s.Ta, x.Ur * s.Lr, m[id]);
      });
      return T;
    }
    function dpOwn(id, m) {
      var x = S[id], s = x.s;
      return (1 + o.fittings_pct / 100) * (dpPipe(m, x.pf.id, s.Lf, mat.roughness_mm, props).dp + dpPipe(m, x.pr.id, s.Lr, mat.roughness_mm, props).dp);
    }
    function pathDp(m) {
      var P = {};
      order.forEach(function (id) { var s = S[id].s; P[id] = (s.parent === null ? 0 : P[s.parent]) + dpOwn(id, m[id]); });
      return P;
    }

    /* r4 Y3-1: root flow (W 553 proportions kept) for which the mixed return to the heater is T_target — the 5 K of
       W 553 / W 551 hold from the heater outlet to the circulation inlet into the heater, return pipes included.
       The return rises monotonically with the root flow, so a bracketed bisection is exact to 1e-12. */
    function rootFlowFor(Ttarget) {
      var ret = function (mr) { return temps(splitFlows(mr))[rootId].rOut; };
      var lo = mFlow > 0 ? mFlow : 1e-6, hi = lo, k;
      for (k = 0; k < 200 && ret(lo) > Ttarget; k++) lo /= 2;
      for (k = 0; k < 200 && ret(hi) < Ttarget; k++) hi *= 2;
      for (k = 0; k < 200 && (hi - lo) > 1e-12 * hi; k++) { var mid = 0.5 * (lo + hi); if (ret(mid) < Ttarget) lo = mid; else hi = mid; }
      return hi; /* the bracket end with ret >= T_target: a design return never reads 1e-12 K below its own target */
    }
    var mLoop = rootFlowFor(o.T_out - o.dT_design);
    var mTot = o.dT_basis === 'flow' ? mFlow : mLoop;
    var mRetMin = rootFlowFor(o.T_min); /* flow needed for a return of exactly T_min (shown with the flow-pipe rule) */

    var m, infeasible = [], iterations = 0, converged = true;
    var mSplit = splitFlows(mTot);
    if (o.method === 'split') m = mSplit;
    else if (o.method === 'thermo') {
      var ml = {}, mCap = {};
      leaves.forEach(function (id) {
        var dmin = Math.min(S[id].pf.id, S[id].pr.id) / 1000;
        mCap[id] = o.vmax * props.rho * Math.PI * dmin * dmin / 4;
        ml[id] = Math.min(mSplit[id], mCap[id]);
      });
      converged = false;
      for (var it = 0; it < 500; it++) {
        iterations = it + 1;
        m = flowsFromLeaves(ml);
        var T = temps(m), maxRel = 0;
        infeasible = [];
        leaves.forEach(function (id) {
          var x = S[id], s = x.s, tin = T[id].fIn, nm;
          /* setpoint unreachable, or reachable only above v_max: the valve opens fully and the flow is capped at the one
             giving v_max in the narrower of the two loop pipes; the loop is marked infeasible (CR-31) */
          if (tin - s.Ta <= (o.T_set - s.Ta) * (1 + 1e-9)) nm = Infinity;
          else nm = (x.Uf * s.Lf + x.Ur * s.Lr) / (CP * Math.log((tin - s.Ta) / (o.T_set - s.Ta)));
          if (nm > mCap[id]) { infeasible.push(id); nm = mCap[id]; }
          maxRel = Math.max(maxRel, Math.abs(nm - ml[id]) / Math.max(nm, 1e-12));
          ml[id] = 0.5 * ml[id] + 0.5 * nm; /* under-relaxed fixed point */
        });
        if (maxRel < 1e-10) { converged = true; break; }
      }
      m = flowsFromLeaves(ml);
    } else {
      /* no regulating valves: same total flow, split by equal path pressure drop (Newton on the leaf flows) */
      var n = leaves.length, q = leaves.map(function (id) { return mSplit[id]; });
      var resid = function (qv) {
        var mm = {}; leaves.forEach(function (id, i) { mm[id] = Math.max(qv[i], 1e-9); });
        var P = pathDp(flowsFromLeaves(mm)), r = [];
        for (var i = 0; i < n - 1; i++) r.push(P[leaves[i]] - P[leaves[n - 1]]);
        r.push((qv.reduce(function (a, b) { return a + b; }, 0) - mTot) * 1e6);
        return r;
      };
      converged = n === 1;
      for (var k = 0; k < 100 && n > 1; k++) {
        iterations = k + 1;
        var r0 = resid(q), J = [];
        for (var j = 0; j < n; j++) {
          var h = Math.max(Math.abs(q[j]) * 1e-6, 1e-10), qq = q.slice(); qq[j] += h;
          var r1 = resid(qq); for (var i = 0; i < n; i++) { if (!J[i]) J[i] = []; J[i][j] = (r1[i] - r0[i]) / h; }
        }
        var dq = gauss(J, r0.map(function (v) { return -v; }));
        if (!dq) break;
        var lam = 1, n0 = norm(r0), qn = q;
        for (var b = 0; b < 40; b++) {
          var ok = true; qn = q.map(function (v, j2) { if (v + lam * dq[j2] <= 0) ok = false; return v + lam * dq[j2]; });
          if (ok && norm(resid(qn)) < n0) break;
          lam /= 2;
        }
        var stepMax = 0;
        for (var j3 = 0; j3 < n; j3++) stepMax = Math.max(stepMax, Math.abs(qn[j3] - q[j3]) / qn[j3]);
        q = qn;
        if (stepMax < 1e-9 || norm(resid(q)) < 1e-9) { converged = true; break; }
      }
      var mm2 = {}; leaves.forEach(function (id, i) { mm2[id] = q[i]; });
      m = flowsFromLeaves(mm2);
    }

    var Tt = temps(m), P = pathDp(m);
    var Pindex = -Infinity, indexLeaf = null;
    leaves.forEach(function (id) { if (P[id] > Pindex) { Pindex = P[id]; indexLeaf = id; } });
    var dpPump = o.method === 'none' ? Pindex + o.dp_fixed_kpa * 1000 : Pindex + o.dp_valve_min_kpa * 1000 + o.dp_fixed_kpa * 1000;
    var Vtot = m[rootId] / props.rho; /* m3/s */

    var rows = order.map(function (id) {
      var x = S[id], s = x.s, t = Tt[id];
      var hf = dpPipe(m[id], x.pf.id, s.Lf, mat.roughness_mm, props), hr = dpPipe(m[id], x.pr.id, s.Lr, mat.roughness_mm, props);
      var r = { id: id, parent: s.parent, name: s.name, leaf: !kids[id].length, m_kgs: m[id], V_lph: m[id] / props.rho * 3600000,
        odf: x.pf.od, idf: x.pf.id, odr: x.pr.od, idr: x.pr.id, od_snapped: !x.pf.exact || !x.pr.exact, odf_given: s.odf, odr_given: s.odr, ins_f_mm: x.sf, ins_r_mm: x.sr, Uf: x.Uf, Ur: x.Ur,
        T_f_in: t.fIn, T_f_end: t.fEnd, T_r_in: t.rIn, T_r_out: t.rOut,
        Q_f: m[id] * CP * (t.fIn - t.fEnd), Q_r: m[id] * CP * (t.rIn - t.rOut), Qd_f: x.Qd,
        v_f: hf.v, v_r: hr.v, dp_f: hf.dp, dp_r: hr.dp, path_dp: P[id] };
      if (r.leaf) {
        r.valve_dp = o.method === 'none' ? 0 : Pindex + o.dp_valve_min_kpa * 1000 - P[id];
        r.kv = o.method === 'none' || !(r.valve_dp > 0) ? null : (m[id] / props.rho * 3600) / Math.sqrt(r.valve_dp / 1e5);
      }
      r.minT = Math.min(t.fEnd, t.rOut);
      r.below = r.minT < o.T_min - 1e-9;
      return r;
    });
    var Qloss = rows.reduce(function (a, r) { return a + r.Q_f + r.Q_r; }, 0);
    var Tret = Tt[rootId].rOut;
    var minRow = rows.reduce(function (a, r) { return r.minT < a.minT ? r : a; }, rows[0]);
    var hoursYear = o.hours_day * 365;
    var heat_kWh = Qloss * hoursYear / 1000, deliv_kWh = heat_kWh / o.eff_heat;
    var Phyd = dpPump * Vtot, Pel = Phyd / o.pump_eta, pump_kWh = Pel * hoursYear / 1000;
    var vMaxSeen = rows.reduce(function (a, r) { return Math.max(a, r.v_f, r.v_r); }, 0);
    var below = rows.filter(function (r) { return r.below; }).map(function (r) { return r.id; });
    var flags = [];
    if (o.T_out < 60) flags.push('outlet_below_60');
    if (Tret < o.T_min - 1e-9) flags.push('return_below_min');
    if (o.dT_basis === 'flow' && o.method !== 'thermo') flags.push('flow_basis_approx');
    if (below.length) flags.push('sections_below_min');
    if (o.hours_day < 16) flags.push('interruption_over_8h');
    if (vMaxSeen > o.vmax) flags.push('velocity_high');
    if (rows.some(function (r) { return r.leaf && r.kv != null && r.kv < o.kv_min; })) flags.push('kv_small');
    if (infeasible.length) flags.push('setpoint_unreachable');
    var snapped = rows.filter(function (r) { return r.od_snapped; }).map(function (r) { return r.id; });
    if (snapped.length) flags.push('od_snapped');
    if (!converged) flags.push('not_converged');
    return {
      valid: true, version: VERSION, method: o.method, inputs: o,
      rows: rows, leaves: leaves, index_leaf: indexLeaf, root: rootId,
      design: { QW_flow_W: QW, basis: o.dT_basis, m_design_kgs: mTot, V_design_lph: mTot / props.rho * 3600000, T_mean_design: Tm,
        m_flowrule_kgs: mFlow, V_flowrule_lph: mFlow / props.rho * 3600000, m_loop_kgs: mLoop, V_loop_lph: mLoop / props.rho * 3600000,
        m_return_min_kgs: mRetMin, V_return_min_lph: mRetMin / props.rho * 3600000 },
      m_total_kgs: m[rootId], V_total_lph: Vtot * 3600000, T_return: Tret, T_min_seen: minRow.minT, min_section: minRow.id,
      Q_loss_W: Qloss, Q_balance_W: m[rootId] * CP * (o.T_out - Tret),
      dp_index_pa: Pindex, dp_pump_pa: dpPump, head_m: dpPump / (props.rho * G), P_hyd_W: Phyd, P_el_W: Pel,
      annual: { heat_kWh: heat_kWh, delivered_kWh: deliv_kWh, heat_eur: deliv_kWh * o.price_heat, co2_kg: deliv_kWh * o.co2_heat,
        pump_kWh: pump_kWh, pump_eur: pump_kWh * o.price_el, total_eur: deliv_kWh * o.price_heat + pump_kWh * o.price_el, hours: hoursYear },
      fails: flags.filter(function (f) { return FLAG_LEVEL[f] === 'bad'; }),
      v_max_seen: vMaxSeen, below_min: below, od_snapped: snapped, materials_from: MATERIALS_FROM, infeasible: infeasible, iterations: iterations, converged: converged, flags: flags,
      props: { T: Tp, rho: props.rho, mu: props.mu, cp: CP }
    };
  }

  function norm(r) { return Math.sqrt(r.reduce(function (a, v) { return a + v * v; }, 0)); }
  function gauss(A, b) {
    var n = b.length, M = A.map(function (r, i) { return r.slice().concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return null;
      var tmp = M[c]; M[c] = M[p]; M[p] = tmp;
      for (var r2 = c + 1; r2 < n; r2++) { var f = M[r2][c] / M[c][c]; for (var k = c; k <= n; k++) M[r2][k] -= f * M[c][k]; }
    }
    var x = new Array(n);
    for (var i = n - 1; i >= 0; i--) { var sum = M[i][n]; for (var j = i + 1; j < n; j++) sum -= M[i][j] * x[j]; x[i] = sum / M[i][i]; }
    return x;
  }

  /* path of a leaf: list of section ids from the root down to the leaf */
  function pathOf(res, leafId) {
    var by = {}; res.rows.forEach(function (r) { by[r.id] = r; });
    var p = [], c = by[leafId];
    while (c) { p.unshift(c.id); c = c.parent === null ? null : by[c.parent]; }
    return p;
  }
  /* temperature profile along the loop of one leaf: [{x, T}] from the heater out and back */
  function profile(res, leafId) {
    var by = {}; res.rows.forEach(function (r) { by[r.id] = r; });
    var path = pathOf(res, leafId), pts = [], x = 0;
    path.forEach(function (id) { var r = by[id]; if (!pts.length) pts.push({ x: 0, T: r.T_f_in }); x += res.inputs.sections.filter(function (s) { return s.id === id; })[0].Lf; pts.push({ x: x, T: r.T_f_end }); });
    path.slice().reverse().forEach(function (id, i) {
      var r = by[id], L = res.inputs.sections.filter(function (s) { return s.id === id; })[0].Lr;
      if (i > 0) pts.push({ x: x, T: r.T_r_in });
      x += L; pts.push({ x: x, T: r.T_r_out });
    });
    return pts;
  }

  /* ------------------------------------------------------------ presets (learning examples) */
  /* comb: main segments M1..Mn along the basement, one riser loop Rk at each */
  function comb(o) {
    var secs = [{ id: 'M0', parent: null, name: 'plant', Lf: o.L0, odf: o.od0, Lr: o.L0, odr: o.odr0, ins: o.insMain, ins_mm: o.insMm || 0, Ta: o.TaMain }];
    for (var i = 1; i <= o.n; i++) {
      var prev = i === 1 ? 'M0' : 'M' + (i - 1);
      if (i < o.n) secs.push({ id: 'M' + i, parent: prev, name: 'main', Lf: o.Lm, odf: o.odm, Lr: o.Lm, odr: o.odrm, ins: o.insMain, ins_mm: o.insMm || 0, Ta: o.TaMain });
      secs.push({ id: 'R' + i, parent: prev, name: 'riser', Lf: o.Lr[i - 1] || o.Lr[0], odf: o.odR, Lr: (o.Lr[i - 1] || o.Lr[0]) + (o.extraRet || 0), odr: o.odrR, ins: o.insRiser, ins_mm: o.insMm || 0, Ta: o.TaRiser });
    }
    return secs;
  }
  var PRESETS = {
    apt24_w553: function () {
      return { material: 'cu', method: 'split', dT_basis: 'flow', T_out: 60, dT_design: 5, T_min: 55, hours_day: 24,
        sections: comb({ n: 4, L0: 6, od0: 42, odr0: 22, Lm: 10, odm: 35, odrm: 18, Lr: [19.2], odR: 28, odrR: 15, insMain: 'geg100', insRiser: 'geg100', TaMain: 15, TaRiser: 22 }) };
    },
    apt24_dt25: function () { var p = PRESETS.apt24_w553(); p.dT_design = 2.5; return p; },
    apt24_loop: function () { var p = PRESETS.apt24_w553(); p.dT_basis = 'loop'; return p; },
    apt24_none: function () {
      var p = PRESETS.apt24_w553(); p.method = 'none';
      p.sections = comb({ n: 4, L0: 6, od0: 42, odr0: 22, Lm: 18, odm: 35, odrm: 15, Lr: [19.2], odR: 28, odrR: 15, insMain: 'geg100', insRiser: 'geg100', TaMain: 15, TaRiser: 22 });
      return p;
    },
    apt24_thermo: function () { var p = PRESETS.apt24_none(); p.method = 'thermo'; p.T_set = 57; return p; },
    old_bare_basement: function () {
      return { material: 'ss', method: 'split', dT_basis: 'flow', T_out: 60, dT_design: 5, T_min: 55, hours_day: 24,
        sections: comb({ n: 3, L0: 8, od0: 54, odr0: 28, Lm: 15, odm: 42, odrm: 22, Lr: [16], odR: 28, odrR: 18, insMain: 'none', insRiser: 'geg100', TaMain: 15, TaRiser: 22 }) };
    },
    hotel_timer: function () {
      return { material: 'cu', method: 'thermo', T_out: 60, T_set: 57, dT_design: 5, T_min: 55, hours_day: 14,
        sections: comb({ n: 6, L0: 10, od0: 54, odr0: 28, Lm: 12, odm: 42, odrm: 22, Lr: [28], odR: 28, odrR: 15, insMain: 'geg100', insRiser: 'geg100', TaMain: 18, TaRiser: 24 }) };
    }
  };

  return { VERSION: VERSION, CP: CP, FLAG_LEVEL: FLAG_LEVEL, SOURCES: SOURCES, MATERIALS: MATERIALS, DEFAULTS: DEFAULTS, PRESETS: PRESETS,
    MATERIALS_FROM: MATERIALS_FROM, pipeOf: pipeOf, insThickness: insThickness, uPrime: uPrime, rho: rho, mu: mu, friction: friction, dpPipe: dpPipe,
    normalise: normalise, validate: function (inp) { return validate(normalise(inp)); }, solve: solve, pathOf: pathOf, profile: profile };
});
