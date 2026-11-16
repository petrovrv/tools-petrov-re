/* glz-window.js — global GlzWindow: engine of the tool `windowclasses` (Window Performance Classes, BE) of the tools.petrov.re Glazing & Windows package.
   Which air / water / wind classes (and operating-force, misuse, endurance, impact, burglary classes) a window or a curtain wall must have
   on a Belgian site, and whether its frame and glass edge risk surface condensation, per
   NBN B 25-002-1:2019 §6.2, §6.5.2–6.5.7 (Tab. 2 via GlazingCore.windowExposure, Tab. 3 + notes 1–5), §6.5.5 (deflection 1/300 test, 1/225 calculation),
   Annex C (deflection-class equivalence), §6.6 Tab. 4, §6.7 Tab. 5, §6.8.3.3 Method II (fRsi, Tab. 7), §6.10 Tab. 8, §6.15 Tab. 10 / Tab. 11,
   §6.16 Tab. 12, §7.4–7.5 (curtain walls, Tab. 13 / Tab. 14, wK / wU); ISO 10077-1:2006 §5.1 eq. (1) + Annex E Tab. E.1 / E.2 (Uw, optional).
   Class rules are short data with clause references (D-BW-13); no norm text or table is reproduced on the page.
   Pure functions, no DOM. UMD: browser global GlzWindow (needs GlazingCore loaded first), node module.exports.
   Planning aid only — the window specification is made by a qualified person per the cited NBN / EN. */
(function (root, factory) {
  var core = (root && root.GlazingCore) || (typeof require === 'function' ? require('./glazing-core.js') : null);
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GlzWindow = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C) {
'use strict';

var VERSION = '0.1.1';

/* ---------------------------------------------------------------- 1. sources (norm + clause) */
var B25 = 'NBN B 25-002-1:2019 Menuiserie extérieure — Fenêtres, portes extérieures et façades rideaux', ISO = 'ISO 10077-1:2006 Thermal performance of windows, doors and shutters — Part 1: General';
var Src = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var SOURCES = {
  b25_site: Src(B25, '2019', '§6.5.2 (ze ≈ h), §6.5.3 Fig. 9 (vb0 23–26 m/s), §6.5.4 Tab. 1 (roughness 0–IV)'),
  b25_t2: Src(B25, '2019', '§6.5.6 Tab. 2 (wind exposure classes W1–W8)'),
  b25_t3: Src(B25, '2019', '§6.5.7 Tab. 3 (air NBN EN 12207, water NBN EN 12208, wind NBN EN 12210 class C)'),
  b25_n1: Src(B25, '2019', '§6.5.7 note 1 (air-conditioned rooms, W1–W4 → air class 4)'),
  b25_n2: Src(B25, '2019', '§6.5.7 note 2 + (i) (not protected from run-off → next water class; W8 stays E1050)'),
  b25_n3: Src(B25, '2019', '§6.5.7 note 3 + (ii)(iii), Fig. 10 (protected L ≥ H/4 or street < 2,50 m → B classes)'),
  b25_n4: Src(B25, '2019', '§6.5.7 note 4 / §7.5.5 note 3 (ze > 100 m → NBN EN 13050 test recommended)'),
  b25_655: Src(B25, '2019', '§6.5.5 (class C 1/300 at P1 by test; 1/225 by calculation with P2 / P3 tested at the same class)'),
  b25_annC: Src(B25, '2019', 'Annex C Fig. C.1 (equivalence of deflection classes A / B / C)'),
  b25_62: Src(B25, '2019', '§6.2 (n50 < 2 h⁻¹: 1,2 m³/(h·m²) at 100 Pa, 2,5 at 300 Pa)'),
  b25_t4: Src(B25, '2019', '§6.6 Tab. 4 (operating forces NBN EN 13115, classes 0 / 1 / 2, additional class A)'),
  b25_t5: Src(B25, '2019', '§6.7 Tab. 5 (misuse NBN EN 13115, classes 1–4, note 100 N)'),
  b25_t12: Src(B25, '2019', '§6.16 Tab. 12 (mechanical durability NBN EN 12400, classes 1–3, E)'),
  b25_t8: Src(B25, '2019', '§6.10.1 Tab. 8 (NBN EN 1627 class → minimum NBN EN 356 glazing class)'),
  b25_t10: Src(B25, '2019', '§6.15.1 Tab. 10 (NBN EN 13049 drop heights)'),
  b25_t11: Src(B25, '2019', '§6.15.2.1 cases 1–3, H and Hf = h + 0,5·l, he < H, human-activity zones; §6.15.2.2 Tab. 11 and note (1)'),
  b25_t7: Src(B25, '2019', '§6.8.3.3.2 fRsi, §6.8.3.3.3 Tab. 6 / Fig. 11 (indoor climate classes), §6.8.3.3.4 Fig. 13 (θe), §6.8.3.3.5 Tab. 7 (minimum fRsi) and notes 1–5'),
  b25_832: Src(B25, '2019', '§6.8.3.2 (Rsi = 0,13 m²K/W)'),
  b25_cw: Src(B25, '2019', '§7.5.4 Tab. 13 (CW3–CW8), §7.5.5 Tab. 14 + notes 1–4 (air NBN EN 12152, water NBN EN 12154)'),
  b25_74: Src(B25, '2019', '§7.4.2 wK = 0,80·ce(z)·qref·cp, §7.4.3 wU = 1,25·ce(z)·qref·cp (NBN EN 12179 / NBN EN 13116)'),
  b25_618: Src(B25, '2019', '§6.18 (inclined windows 15° < α ≤ 30°: water tested in project condition; > 30° special study)'),
  iso_eq1: Src(ISO, '2006', '§5.1 eq. (1) Uw = (Ag·Ug + Af·Uf + lg·Ψg)/(Ag + Af)'),
  iso_e: Src(ISO, '2006', 'Annex E Tab. E.1 / E.2 (default Ψg; single glazing Ψg = 0)'),
  core_qp: Src('EN 1991-1-4:2005 §4.3–4.5 with recommended terrain parameters (NBN EN 1991-1-4 ANB:2010 not available — D-BW-15)', '2005', 'qp(ze) = ce(ze)·qb', 'standard'),
  la_frsi: Src('Learning assumption: typical fRsi of frames and of the glass edge by frame type and spacer — use the value of an ISO 10077-2 / EN ISO 10211 calculation of the real profile', 'glz-window ' + VERSION, '', 'learning_assumption'),
  la_cp: Src('Learning assumption: cp = 1,0 as a default net pressure coefficient for the curtain-wall test pressures (CSTC report n° 11 not available) — enter the project value', 'glz-window ' + VERSION, '', 'learning_assumption')
};

/* ---------------------------------------------------------------- 2. data (short values with clause refs) */
/* Tab. 3 by W1..W8 */
var T3 = {
  air: [3, 3, 3, 3, 4, 4, 4, 4],
  water: ['5A', '6A', '7A', '8A', '9A', 'E750', 'E900', 'E1050'],
  wind: [1, 2, 2, 2, 3, 4, 4, 5]                                 // NBN EN 12210 class number, deflection class C
};
/* NBN EN 12208 water classes as quoted in Tab. 3 (test pressure Pa); B classes exist up to 7B (method B) */
var WATER = [['1A', 0], ['2A', 50], ['3A', 100], ['4A', 150], ['5A', 200], ['6A', 250], ['7A', 300], ['8A', 450], ['9A', 600], ['E750', 750], ['E900', 900], ['E1050', 1050]];
var WIND_P1 = [null, 400, 800, 1200, 1600, 2000];                // NBN EN 12210 class 1..5, P1 Pa (Tab. 3); P2 = P1/2, P3 = 1,5·P1
var DEFL = { A: 150, B: 200, C: 300 };                           // relative frontal deflection L/n (Annex C)
/* curtain walls Tab. 14 by CW3..CW8 */
var T14 = { air: ['A3', 'A3', 'A4', 'A4', 'A4', 'A4'], water: [['R5', 300], ['R6', 450], ['R7', 600], ['RE750', 750], ['RE900', 900], ['RE1050', 1050]] };
var CW_WATER_SEQ = [['R4', 150], ['R5', 300], ['R6', 450], ['R7', 600], ['RE750', 750], ['RE900', 900], ['RE1050', 1050]];
/* Tab. 4 operating forces (class: closing / hand hardware force N, torque Nm, finger force N, torque Nm) */
var T4 = { 1: { close_N: 100, hand_N: 100, hand_Nm: 10, finger_N: 50, finger_Nm: 5 }, 2: { close_N: 30, hand_N: 30, hand_Nm: 5, finger_N: 20, finger_Nm: 2 }, A: { lock_N: 150, start_N: 150, move_N: 150 } };
/* Tab. 5 misuse (racking / static torsion N) and Tab. 12 durability (cycles) */
var T5 = { 1: [200, 200], 2: [400, 250], 3: [600, 300], 4: [800, 350] };
var T12 = { 1: 5000, 2: 10000, 3: 20000, E: 500 };
var USE = { maintenance: { force: 'A', misuse: 2, durability: 'E' }, occasional: { force: 1, misuse: 1, durability: 1 },
  normal: { force: 1, misuse: 3, durability: 2 }, intensive: { force: 1, misuse: 4, durability: 3 } };
/* Tab. 8 EN 1627 → EN 356 */
var T8 = { none: null, CR1N: '-', CR2N: '-', CR2: 'P4A', CR3: 'P5A', CR4: 'P6B', CR5: 'P7B', CR6: 'P8B' };
/* Tab. 10 EN 13049 drop height mm */
var T10 = [null, 200, 300, 450, 700, 950];
/* Tab. 11: per category, cases 1..3 × [exterior public, exterior not public, interior]; 0 = no requirement, negative = note (1) recommendation only */
var T11 = {
  A: [[4, 2, 2], [4, 2, 2], [4, 2, 0]], B: [[4, 2, 3], [4, 2, 3], [4, 2, 0]],
  C1: [[4, 3, 4], [4, 4, 4], [4, 3, -4]], C2: [[4, 3, 3], [4, 3, 4], [4, 3, -3]], C3: [[4, 3, 3], [4, 3, 4], [4, 3, -3]],
  C4: [[4, 3, 4], [4, 3, 4], [4, 3, -4]], C5: [[4, 3, 4], [4, 3, 4], [4, 3, -4]], D: [[4, 3, 4], [4, 3, 4], [4, 3, 0]], E: [[4, 3, 3], [4, 3, 3], [4, 3, 0]]
};
var CATEGORIES = ['A', 'B', 'C1', 'C2', 'C3', 'C4', 'C5', 'D', 'E'];
/* Tab. 7 minimum fRsi: θe −2…−8 °C × indoor climate classes 1..5; reference indoor climates (θi, φ, θsi) of the table head */
var T7 = { '-2': [0.45, 0.50, 0.59, 0.65, 0.75], '-3': [0.48, 0.53, 0.61, 0.67, 0.76], '-4': [0.50, 0.55, 0.63, 0.68, 0.77], '-5': [0.52, 0.57, 0.64, 0.69, 0.77],
  '-6': [0.54, 0.58, 0.65, 0.70, 0.78], '-7': [0.56, 0.60, 0.67, 0.71, 0.79], '-8': [0.58, 0.61, 0.68, 0.72, 0.79] };
var T7_REF = [[18, 48, 7], [19, 51, 8.6], [20, 55, 11], [22, 58, 13.7], [26, 65, 19]];
var THETA_E = [-2, -3, -4, -5, -6, -7, -8];
/* ISO 10077-1 Annex E Ψg (W/(m·K)): frame type × spacer × [uncoated, low-e] */
var PSI = { wood_pvc: { alu: [0.06, 0.08], warm: [0.05, 0.06] }, metal_tb: { alu: [0.08, 0.11], warm: [0.06, 0.08] }, metal_nb: { alu: [0.02, 0.05], warm: [0.01, 0.04] } };
/* learning assumption: typical fRsi (frame inner surface; glass edge by frame × spacer; triple glazing +0,03 at the edge) */
var FRSI_FRAME = { metal_nb: 0.35, metal_tb: 0.62, pvc: 0.72, wood: 0.72 };
var FRSI_EDGE = { metal_nb: { alu: 0.40, warm: 0.45 }, metal_tb: { alu: 0.58, warm: 0.66 }, pvc: { alu: 0.60, warm: 0.69 }, wood: { alu: 0.60, warm: 0.69 } };
var FRAMES = ['metal_nb', 'metal_tb', 'pvc', 'wood'];
var RSI = 0.13;

/* ---------------------------------------------------------------- 3. helpers */
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function waterIndex(c) { for (var i = 0; i < WATER.length; i++) if (WATER[i][0] === c) return i; return -1; }
function nextWater(c) { var i = waterIndex(c); if (i < 0) return c; if (i + 1 < WATER.length) return WATER[i + 1][0]; return 'E' + (WATER[i][1] + 150); }
function waterPa(c) { var i = waterIndex(c); if (i >= 0) return WATER[i][1]; var m = /^E(\d+)$/.exec(c); return m ? +m[1] : (/^(\d)B$/.test(c) ? WATER[+c[0] - 1][1] : null); }
/* method B class with the same pressure, only up to 7B (NBN EN 12208 as referred by note 3) */
function bClass(c) { var m = /^([1-7])A$/.exec(c); return m ? m[1] + 'B' : null; }
function windClass(n) { return n ? { cls: 'C' + n, n: n, P1: WIND_P1[n], P2: WIND_P1[n] / 2, P3: WIND_P1[n] * 1.5 } : null; }
/* Annex C: deflection proportional to pressure → class C at P equals class B at 1,5·P and class A at 2·P; class = highest EN 12210 class whose P1 ≤ that pressure */
function equivalence(n) {
  var P = WIND_P1[n], out = { C: { cls: 'C' + n, P: P } };
  ['B', 'A'].forEach(function (k) {
    var p = P * DEFL.C / DEFL[k], c = 0; for (var i = 1; i <= 5; i++) if (WIND_P1[i] <= p + 1e-9) c = i;
    out[k] = { cls: k + c, P: p, above5: p > WIND_P1[5] + 1e-9 };
  });
  return out;
}
/* §6.5.5 calculation route: simply supported profile, uniform load P1 on the load width → midspan deflection */
function profileDeflection(o, P1) {
  if (!o || !(isNum(o.span_m) && o.span_m > 0 && isNum(o.width_m) && o.width_m > 0 && isNum(o.E_GPa) && o.E_GPa > 0 && isNum(o.I_cm4) && o.I_cm4 > 0)) return null;
  var EI = o.E_GPa * 1e9 * o.I_cm4 * 1e-8, L = o.span_m, q = P1 * o.width_m;
  var w = 5 * q * Math.pow(L, 4) / (384 * EI);                    // m
  var lim225 = L / 225, lim300 = L / 300, pmax = lim225 * 384 * EI / (5 * o.width_m * Math.pow(L, 4));
  var reach = 0; for (var i = 1; i <= 5; i++) if (WIND_P1[i] <= pmax + 1e-9) reach = i;
  return { w_mm: w * 1000, lim225_mm: lim225 * 1000, lim300_mm: lim300 * 1000, ratio: L / w, ok225: w <= lim225 + 1e-12, ok300: w <= lim300 + 1e-12, util: w / lim225, P1max_Pa: pmax, reach: reach };
}
/* Magnus formula (ISO 13788 Annex E form, θ ≥ 0 °C over water) */
function psat(t) { return 610.5 * Math.exp(17.269 * t / (237.3 + t)); }
function dewPoint(t, rh) { var x = Math.log(rh / 100 * psat(t) / 610.5); return 237.3 * x / (17.269 - x); }

/* ---------------------------------------------------------------- 4. evaluate */
/* input: { kind:'window'|'curtainwall', site:{ze_m, vb0, roughness}, aircon, rain:'normal'|'unprotected'|'protected'|'narrow', tilt_deg,
     route:'test'|'calc', profile:{span_m, width_m, E_GPa, I_cm4}, cp, use:'maintenance'|'occasional'|'normal'|'intensive', reduced_force,
     burglary:'none'|'CR1N'..'CR6', lowenergy,
     impact:{ on, category, h_m, hc_m, H_m, l_m, he_m, outside:'public'|'private' },
     condensation:{ on, climate 1..5, theta_e, own:{theta_i, rh}, frame, spacer, triple, frsi_frame, frsi_edge, Ug },
     uw:{ on, w_m, h_m, bf_m, Uf, Ug, frame:'wood_pvc'|'metal_tb'|'metal_nb', spacer:'alu'|'warm', lowe, single } } */
function evaluate(inp) {
  inp = inp || {};
  var site = inp.site || {}, kind = inp.kind === 'curtainwall' ? 'curtainwall' : 'window';
  var notes = [], src = ['b25_site', 'b25_t2'];
  var note = function (key, s, vars) { notes.push({ key: key, src: s, vars: vars || {} }); if (src.indexOf(s) < 0) src.push(s); };
  var tilt = isNum(inp.tilt_deg) ? Math.abs(inp.tilt_deg) : 0;
  if (tilt > 30) return { ok: false, reason: 'tilt_special', notes: [{ key: 'tilt_special', src: 'b25_618', vars: {} }], src: ['b25_618'] };
  var ex = C.windowExposure({ ze: site.ze_m, vb0: site.vb0, roughness: site.roughness });
  if (!ex.ok) return { ok: false, reason: ex.reason, max_m: ex.max_m, notes: [], src: src };
  var W = ex.index, r = { ok: true, version: VERSION, kind: kind, exposure: { cls: ex.cls, index: W, limit_m: ex.limit_m, vb0_column: ex.vb0_column } };
  var ze = site.ze_m, qp = C.qp(ze, site.vb0, site.roughness);
  r.qp_Pa = qp;
  /* Belgian class qp of NBN S 23-002-3 Tab. 1 at the same site, handed off next to the EN 1991-1-4 qp (R2-REVIEW CR-23) */
  var gx = C.glassExposure({ ze: ze, vb0: site.vb0, roughness: site.roughness });
  if (gx && gx.ok) { r.exposure.glass_cls = gx.cls; r.exposure.glass_qp_Pa = gx.qp_Pa; }
  var rain = inp.rain || 'normal';
  if (kind === 'window') {
    src.push('b25_t3');
    var air = T3.air[W - 1], air0 = air;
    if (inp.aircon && W <= 4) { air = 4; note('aircon', 'b25_n1', { from: air0 }); }
    var water0 = T3.water[W - 1], water = water0, alt = null;
    if (rain === 'unprotected') { if (W < 8) { water = nextWater(water0); note('unprotected', 'b25_n2', { from: water0, to: water }); } else note('unprotected_w8', 'b25_n2', {}); }
    else if (rain === 'protected' || rain === 'narrow') { alt = bClass(water0); note(alt ? 'protected' : 'protected_noB', 'b25_n3', { from: water0, to: alt || water0 }); }
    var wn = T3.wind[W - 1];
    r.air = { cls: air, base: air0 }; r.water = { cls: water, base: water0, Pa: waterPa(water), alt_B: alt }; r.wind = windClass(wn);
    r.equivalence = equivalence(wn);
    src.push('b25_annC');
    var route = inp.route === 'calc' ? 'calc' : 'test';
    r.route = route;
    if (route === 'calc') note('calc_route', 'b25_655', { cls: r.wind.cls, P2: r.wind.P2, P3: r.wind.P3 });
    var pd = profileDeflection(inp.profile, r.wind.P1);
    if (pd) { r.profile = pd; if (src.indexOf('b25_655') < 0) src.push('b25_655'); }
    if (tilt > 15) note('tilt', 'b25_618', {});
    r.spec = 'Air ' + air + ' · ' + water + (alt ? ' (' + alt + ')' : '') + ' · ' + r.wind.cls + ' — NBN B 25-002-1:2019 Tab. 3';
  } else {
    src.push('b25_cw'); src.push('b25_74');
    var k = Math.max(3, W), ci = k - 3, cair0 = T14.air[ci], cair = cair0;
    if (inp.aircon && k <= 4) { cair = 'A4'; note('cw_aircon', 'b25_cw', { from: cair0 }); }
    var cw0 = T14.water[ci], cw = cw0.slice();
    if (rain === 'unprotected') {
      if (k < 8) { var j = -1; CW_WATER_SEQ.forEach(function (x, i) { if (x[0] === cw0[0]) j = i; }); cw = CW_WATER_SEQ[j + 1].slice(); note('cw_unprotected', 'b25_cw', { from: cw0[0], to: cw[0] }); }
      else note('cw_unprotected_8', 'b25_cw', {});
    }
    var cp = isNum(inp.cp) && inp.cp > 0 ? inp.cp : 1.0;
    /* cp 1,0 is the default learning assumption unless the caller marks it as the project value (cp_project: true) — R2-REVIEW CR-6 */
    var cpAssumed = !(isNum(inp.cp) && inp.cp > 0) || (cp === 1.0 && inp.cp_project !== true);
    if (cpAssumed) src.push('la_cp');
    src.push('core_qp');
    r.cw = { cls: 'CW' + k, index: k, fromW: W, air: cair, air_base: cair0, water: cw[0], water_Pa: cw[1], water_base: cw0[0], cp: cp, cp_assumed: cpAssumed, wK_Pa: 0.8 * qp * cp, wU_Pa: 1.25 * qp * cp };
    if (W < 3) note('cw_min3', 'b25_cw', { w: ex.cls });
    note('cw_openings', 'b25_cw', {});
    r.spec = cair + ' · ' + cw[0] + ' · wK ' + Math.round(r.cw.wK_Pa) + ' Pa / wU ' + Math.round(r.cw.wU_Pa) + ' Pa — NBN B 25-002-1:2019 Tab. 14, §7.4';
  }
  if (ze > 100) note('above100', 'b25_n4', {});
  /* use classes (windows and opening parts of curtain walls) */
  var u = USE[inp.use] || USE.normal, force = u.force;
  if (inp.reduced_force && force !== 'A') force = 2;
  r.use = { force: force, force_values: T4[force], misuse: u.misuse, misuse_N: T5[u.misuse], durability: u.durability, cycles: T12[u.durability] };
  ['b25_t4', 'b25_t5', 'b25_t12'].forEach(function (s) { src.push(s); });
  if (inp.use === 'maintenance') note('maint_100N', 'b25_t5', {});
  if (inp.burglary && inp.burglary !== 'none' && T8.hasOwnProperty(inp.burglary)) { r.burglary = { cls: inp.burglary, glass: T8[inp.burglary] }; src.push('b25_t8'); }
  if (inp.lowenergy) { r.lowenergy = { q100: 1.2, q300: 2.5, ql100: 0.3, ql300: 0.62 }; note('lowenergy', 'b25_62', {}); }
  if (inp.impact && inp.impact.on) r.impact = impact(inp.impact, note, src);
  if (inp.condensation && inp.condensation.on) r.condensation = condensation(inp.condensation, src);
  if (inp.uw && inp.uw.on) r.uw = uw(inp.uw, src);
  r.notes = notes; r.src = src;
  return r;
}

/* §6.15.2: case 1 (hc ≤ 1,5 m, h < H), case 2 (hc > 1,5 m, h < H), case 3 (h ≥ H, or h ≥ 0,80 m with Hf = h + 0,5·l ≥ 1,0 m); exterior impacts when he < H */
function impact(o, note, src) {
  var cat = CATEGORIES.indexOf(o.category) >= 0 ? o.category : 'A';
  var H = isNum(o.H_m) ? Math.min(1.2, Math.max(0.9, o.H_m)) : 0.9, h = isNum(o.h_m) ? o.h_m : 0, hc = isNum(o.hc_m) ? o.hc_m : 0, l = isNum(o.l_m) ? o.l_m : 0;
  var Hf = h + 0.5 * l, viaHf = h < H && h >= 0.8 - 1e-9 && Hf >= 1.0 - 1e-9;
  var cs = (h >= H - 1e-9 || viaHf) ? 3 : (hc <= 1.5 + 1e-9 ? 1 : 2);
  var row = T11[cat][cs - 1], he = isNum(o.he_m) ? o.he_m : 99, extOn = he < H - 1e-9;
  var ext = extOn ? (o.outside === 'public' ? row[0] : row[1]) : null, inn = row[2];
  src.push('b25_t10'); src.push('b25_t11');
  if (viaHf) note('hf', 'b25_t11', { hf: Hf });
  if (cs === 1) note('case1_reco', 'b25_t11', {});
  if (cs === 2) note('case2_barrier', 'b25_t11', {});
  if (inn < 0) note('note1', 'b25_t11', {});
  var cls = function (n) { return n ? { cls: Math.abs(n), drop_mm: T10[Math.abs(n)], reco: n < 0 } : null; };
  return { case: cs, category: cat, H_m: H, Hf_m: Hf, viaHf: viaHf, exterior: cls(ext), exteriorApplies: extOn, outside: o.outside === 'public' ? 'public' : 'private', interior: cls(inn) };
}

/* §6.8.3.3 Method II: fRsi = (θsi − θe)/(θi − θe) ≥ minimum of Tab. 7 (or, own climate, the dew point by the same definition) */
function condensation(o, src) {
  var cl = Math.min(5, Math.max(1, Math.round(isNum(o.climate) ? o.climate : 3))), te = THETA_E.indexOf(o.theta_e) >= 0 ? o.theta_e : -3;
  var min = T7[String(te)][cl - 1], basis = 'table', ti = T7_REF[cl - 1][0], rh = T7_REF[cl - 1][1], tdew = T7_REF[cl - 1][2];
  if (o.own && isNum(o.own.theta_i) && isNum(o.own.rh) && o.own.rh > 1 && o.own.rh <= 100 && o.own.theta_i > te + 1) {
    ti = o.own.theta_i; rh = o.own.rh; tdew = dewPoint(ti, rh); min = (tdew - te) / (ti - te); basis = 'own';
  }
  var frame = FRAMES.indexOf(o.frame) >= 0 ? o.frame : 'metal_tb', spacer = o.spacer === 'warm' ? 'warm' : 'alu';
  var laF = !isNum(o.frsi_frame), laE = !isNum(o.frsi_edge);
  var fF = laF ? FRSI_FRAME[frame] : o.frsi_frame, fE = laE ? FRSI_EDGE[frame][spacer] + (o.triple ? 0.03 : 0) : o.frsi_edge;
  var fG = isNum(o.Ug) && o.Ug > 0 ? 1 - o.Ug * RSI : null;
  src.push('b25_t7'); if (fG != null) src.push('b25_832'); if (laF || laE) src.push('la_frsi');
  var items = [{ id: 'frame', f: fF, la: laF }, { id: 'edge', f: fE, la: laE }];
  if (fG != null) items.push({ id: 'glass', f: fG, la: false });
  items.forEach(function (it) { it.ok = it.f >= min - 1e-9; it.theta_si = te + it.f * (ti - te); });
  return { climate: cl, theta_e: te, theta_i: ti, rh: rh, theta_dew: tdew, frsi_min: min, basis: basis, frame: frame, spacer: spacer, items: items, ok: items.every(function (x) { return x.ok; }) };
}

/* ISO 10077-1 §5.1 eq. (1) for a single rectangular window with a uniform frame width bf */
function uw(o, src) {
  var w = o.w_m, h = o.h_m, bf = o.bf_m;
  if (!(isNum(w) && isNum(h) && isNum(bf) && w > 2 * bf && h > 2 * bf && bf > 0 && isNum(o.Uf) && isNum(o.Ug))) return { ok: false };
  var Ag = (w - 2 * bf) * (h - 2 * bf), Aw = w * h, Af = Aw - Ag, lg = 2 * ((w - 2 * bf) + (h - 2 * bf));
  var fr = PSI[o.frame] ? o.frame : 'wood_pvc', sp = o.spacer === 'warm' ? 'warm' : 'alu';
  var psi = o.single ? 0 : (isNum(o.psi) ? o.psi : PSI[fr][sp][o.lowe ? 1 : 0]);
  src.push('iso_eq1'); if (!isNum(o.psi)) src.push('iso_e');
  var U = (Ag * o.Ug + Af * o.Uf + lg * psi) / Aw;
  return { ok: true, Ag: Ag, Af: Af, Aw: Aw, lg: lg, psi: psi, Uw: U, frame_share: Af / Aw, parts: { glass: Ag * o.Ug / Aw, frame: Af * o.Uf / Aw, edge: lg * psi / Aw } };
}

/* hand-off: what glassthickness / glasssafety can use (written into modules.windowclasses.results) */
function handoff(r) {
  if (!r || !r.ok) return null;
  return { exposure: r.exposure.cls, qp_Pa: Math.round(r.qp_Pa), wind_P1_Pa: r.wind ? r.wind.P1 : null, wind_P3_Pa: r.wind ? r.wind.P3 : null,
    cw_wK_Pa: r.cw ? Math.round(r.cw.wK_Pa) : null, cw_wU_Pa: r.cw ? Math.round(r.cw.wU_Pa) : null, cw_cp: r.cw ? r.cw.cp : null, cw_cp_assumed: r.cw ? r.cw.cp_assumed : null,
    qp_class_Pa: r.exposure && r.exposure.glass_qp_Pa != null ? r.exposure.glass_qp_Pa : null, impact_case: r.impact ? r.impact.case : null, spec: r.spec };
}

/* ---------------------------------------------------------------- 5. presets (claims are checked in _bw/r2/window/test.mjs) */
var SITE = function (ze, vb0, rough) { return { ze_m: ze, vb0: vb0, roughness: rough }; };
var PRESETS = [
  { id: 'house-bocage', input: { kind: 'window', site: SITE(9, 25, 'II'), use: 'normal' } },
  { id: 'house-coast', input: { kind: 'window', site: SITE(9, 26, '0'), use: 'normal' } },
  { id: 'house-city', input: { kind: 'window', site: SITE(9, 25, 'IV'), use: 'normal' } },
  { id: 'office-45', input: { kind: 'window', site: SITE(45, 25, 'IV'), aircon: true, route: 'calc', use: 'normal', profile: { span_m: 2.7, width_m: 1.35, E_GPa: 70, I_cm4: 95 } } },
  { id: 'flush-6m', input: { kind: 'window', site: SITE(6, 25, 'II'), rain: 'unprotected', use: 'normal' } },
  { id: 'canopy-6m', input: { kind: 'window', site: SITE(6, 25, 'II'), rain: 'protected', use: 'normal' } },
  { id: 'flat-alu', input: { kind: 'window', site: SITE(15, 25, 'III'), use: 'normal', condensation: { on: true, climate: 3, theta_e: -3, frame: 'metal_nb', spacer: 'alu', Ug: 1.1 } } },
  { id: 'flat-alu-tb', input: { kind: 'window', site: SITE(15, 25, 'III'), use: 'normal', condensation: { on: true, climate: 3, theta_e: -3, frame: 'metal_tb', spacer: 'warm', Ug: 1.1 },
      uw: { on: true, w_m: 1.2, h_m: 1.5, bf_m: 0.11, Uf: 2.2, Ug: 1.1, frame: 'metal_tb', spacer: 'warm', lowe: true } } },
  { id: 'cw-coast-30', input: { kind: 'curtainwall', site: SITE(30, 26, '0'), aircon: true, use: 'maintenance', cp: 1.0 } },
  { id: 'school-ground', input: { kind: 'window', site: SITE(8, 24, 'III'), use: 'intensive', reduced_force: true, burglary: 'CR2',
      impact: { on: true, category: 'C1', h_m: 0.3, hc_m: 0.3, H_m: 0.9, l_m: 0.1, he_m: 0.3, outside: 'public' } } }
];

return { VERSION: VERSION, SOURCES: SOURCES, T3: T3, WATER: WATER, WIND_P1: WIND_P1, DEFL: DEFL, T14: T14, T4: T4, T5: T5, T12: T12, USE: USE, T8: T8, T10: T10, T11: T11,
  T7: T7, T7_REF: T7_REF, THETA_E: THETA_E, PSI: PSI, FRSI_FRAME: FRSI_FRAME, FRSI_EDGE: FRSI_EDGE, FRAMES: FRAMES, CATEGORIES: CATEGORIES, RSI: RSI, PRESETS: PRESETS,
  nextWater: nextWater, bClass: bClass, waterPa: waterPa, windClass: windClass, equivalence: equivalence, profileDeflection: profileDeflection, psat: psat, dewPoint: dewPoint,
  evaluate: evaluate, impact: function (o) { var s = []; return impact(o, function () {}, s); }, condensation: function (o) { return condensation(o, []); }, uw: function (o) { return uw(o, []); }, handoff: handoff };
});
