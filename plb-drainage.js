/* plb-drainage.js — PLBDrain: sanitary drainage and venting after EN 12056-2:2000 (systems I–IV).
   Pure functions, no DOM, deterministic. UMD: window.PLBDrain / module.exports.
   Discharge units DU and frequency factor K come from plumbing-core.js (PLBCore.FIXTURES[].du_lps, BUILDING_TYPES[].drainage_K).
   Method and sources: _plb/drain/METHOD.md. Tool id: plbdrainage. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, function () { try { return require('./plumbing-core.js'); } catch (e) { return null; } });
  else root.PLBDrain = factory(root, function () { return root.PLBCore || null; });
}(typeof self !== 'undefined' ? self : this, function (root, getCore) {
'use strict';
var VERSION = 'plbdrainage-1.6';
var G = 9.81;
var SYSTEMS = ['I', 'II', 'III', 'IV'];

/* Sources of the tables below (in addition to PLBCore.SOURCES). Tables checked against the EN 12056-2:2000 standard text (bw-r1);
   the national edition (NBN EN 12056-2, DIN EN 12056-2 with DIN 1986-100, BS EN 12056-2) is binding and may add national rules. */
var SOURCES = {
  en12056_2_t4: { title: 'EN 12056-2:2000 §6.4.1 Table 4 / Table 5 — unventilated branch discharge pipes: Qmax per DN with the WC footnotes (systems I, II, IV) and limits (length, 90° bends, drop, gradient); system III: Table 6 (per appliance, not checked)', edition: 'EN 12056-2:2000', kind: 'standard' },
  en12056_2_t6: { title: 'EN 12056-2:2000 §6.4.2 Table 7 / Table 8 — ventilated branch discharge pipes: Qmax per DN with the WC footnotes (systems I, II, IV) and limits; system III: Table 9 (not checked)', edition: 'EN 12056-2:2000', kind: 'standard' },
  en12056_2_t11: { title: 'EN 12056-2:2000 Table 11 — primary ventilated stacks: Qmax per DN for square and swept entries; minimum stack DN with WCs', edition: 'EN 12056-2:2000', kind: 'standard' },
  en12056_2_t12: { title: 'EN 12056-2:2000 Table 12 — secondary ventilated stacks: Qmax per stack / vent DN for square and swept entries', edition: 'EN 12056-2:2000', kind: 'standard' },
  en12056_2_t1: { title: 'EN 12056-2:2000 Table 1 — DN and minimum internal diameter of drainage pipes', edition: 'EN 12056-2:2000', kind: 'standard' },
  en12056_2_b: { title: 'EN 12056-2:2000 Annex B — capacity of drains by Prandtl–Colebrook, operational roughness kb = 1.0 mm, ν = 1.31·10⁻⁶ m²/s, filling degree h/d 0.5 or 0.7', edition: 'EN 12056-2:2000', kind: 'standard' },
  en12380: { title: 'EN 12380:2002 Air admittance valves for drainage systems — product requirements and air-flow test (Qa at −250 Pa); EN 12056-2:2000 permits AAVs as part of the ventilation; at least one vent open to the atmosphere per connected drainage network (positive pressure relief)', edition: 'EN 12380:2002', kind: 'standard' },
  aav_sizing: { title: 'EN 12056-2:2000 §6.4.3 Table 10 — air admittance valves on branches: minimum air flow Qa ≥ 1 × Qtot (systems I and IV), ≥ 2 × Qtot (systems II and III); §6.5.3 — air admittance valves on stacks: Qa ≥ 8 × Qtot; Qtot = Qww + Qc + Qp; valves to EN 12380 (CR-55, D-PLB-23)', edition: 'EN 12056-2:2000', kind: 'standard' },
  aav_sizing_mfr: { title: 'Secondary: EN 12056 dimensioning guide of a manufacturer (Durgo, “Dimensioning in accordance with EN 12056”, worked stack example ΣDU 19.2, K 0.5 -> Qtot 2.19 l/s -> Qa 17.5 l/s = 8 × Qtot); the guide uses 2 × Qtot on branches for every system, which is the system II/III value of Table 10', edition: 'Durgo AAV brochure', url: 'https://inspectapedia.com/plumbing/Durgo-Air-Admittance-Valve-Instructions.pdf', kind: 'manufacturer' },
  aav_open_vent: { title: 'AAVs should not be used where there is no open ventilation on a drainage system or through connected drains (illustrations from BS EN 12056-2:2000; McAlpine AAV brochure); plbdrainage checks this per outlet network (the tree that ends at one outlet), because the page does not know whether outlets join outside (CR-55)', edition: 'McAlpine AAV brochure', url: 'https://www.mytub.co.uk/product_images/McAlpine_AirAdmittanceValve_Brochure.pdf', kind: 'manufacturer' },
  din1986_100: { title: 'DIN 1986-100:2016-12 Entwässerungsanlagen für Gebäude und Grundstücke — minimum gradient 0.5 % for collecting pipes inside buildings, filling degree 0.5 inside / 0.7 outside, minimum velocity 0.5 m/s', edition: 'DIN 1986-100:2016', kind: 'standard' },
  din1986_100_buried: { title: 'DIN 1986-100:2016-12 — buried drains (Grundleitungen) at least DN 100; optional rule of plbdrainage (national rules elsewhere may differ)', edition: 'DIN 1986-100:2016', kind: 'standard' },
  la_flushvalve: { title: 'Learning assumption of plbdrainage: EN 12056-2:2000 Table 2 lists WCs by cistern volume only; a flush-valve WC uses the DU of the 9 l cistern WC (2.5 / 2.0 / 1.7 / 2.5 l/s, systems I–IV) — the largest Table 2 WC value in systems I, II and IV; in system III 1.7 lies inside the printed 9 l range 1.6–2.0 and is not its upper value (not conservative there); replace with the national table', edition: VERSION, kind: 'learning_assumption' },
  la_drain: { title: 'Learning assumption of plbdrainage: self-cleansing velocity 0.7 m/s at design flow (common practice, EN 752 range 0.6–0.7 m/s); replace with the national rule', edition: VERSION, kind: 'learning_assumption' }
};

/* EN 12056-2:2000 Table 4 (unventilated branches) and Table 7 (ventilated branches), systems I, II, IV: rows [Qmax l/s, DN, note];
   note (footnotes of the tables): nowc = no WCs, wc2 = ≤ 2 WCs and a total change in direction ≤ 90° (≤ 1 bend), wc1 = ≤ 1 WC (r1-drain, D-BW-3) */
var BRANCH = {
  unvented: { I: [[0.50, 40], [0.80, 50], [1.00, 60], [1.50, 70], [2.00, 80, 'nowc'], [2.25, 90, 'wc2'], [2.50, 100]],
              II: [[0.40, 30], [0.50, 40], [1.00, 50], [1.50, 60], [2.00, 70, 'nowc'], [2.25, 80, 'wc1'], [2.50, 90]],
              IV: [[0.40, 30], [0.50, 40], [1.00, 50], [1.50, 60], [2.00, 70, 'nowc'], [2.25, 80, 'wc1'], [2.50, 100]] },
  vented: { I: [[0.75, 50], [1.50, 60], [2.25, 70], [3.00, 80, 'nowc'], [3.40, 90, 'wc2'], [3.75, 100]],
            II: [[0.60, 30], [0.75, 40], [1.50, 50], [2.25, 60], [3.00, 70, 'nowc'], [3.40, 80, 'wc1'], [3.75, 90]],
            IV: [[0.60, 30], [0.75, 40], [1.50, 50], [2.25, 60], [3.00, 70, 'nowc'], [3.40, 80, 'wc1'], [3.75, 90]] }
};
/* EN 12056-2:2000 Table 7: vent DN paired with the ventilated branch DN (Branch/Vent column) — plb-r4 Y5-4; system IV as system II */
var BRANCH_VENT = { I: { 50: 40, 60: 40, 70: 50, 80: 50, 90: 60, 100: 60 }, II: { 30: 30, 40: 30, 50: 30, 60: 30, 70: 40, 80: 40, 90: 50 },
                    IV: { 30: 30, 40: 30, 50: 30, 60: 30, 70: 40, 80: 40, 90: 50 } };
/* EN 12056-2:2000 Table 5 (unventilated) / Table 8 (ventilated) limits, systems I, II, IV (length m, 90° bends excl. connection bend, drop m at ≥ 45°,
   minimum gradient %); null = no limit; system II unventilated drop 6.0 m for DN > 70, 3.0 m for DN 70 (also used below DN 70) */
var BRANCH_LIMITS = {
  I: { unvented: { L: 4.0, bends: 3, drop: 1.0, slope: 1.0 }, vented: { L: 10.0, bends: null, drop: 3.0, slope: 0.5 } },
  II: { unvented: { L: 10.0, bends: 1, drop: 6.0, drop_small: 3.0, slope: 1.5 }, vented: { L: null, bends: null, drop: 3.0, slope: 1.5 } },
  IV: { unvented: { L: 10.0, bends: 3, drop: 1.0, slope: 1.0 }, vented: { L: 10.0, bends: null, drop: 3.0, slope: 0.5 } }
};
/* Table 11 primary ventilation: [DN, Qmax square entries, Qmax swept entries] */
var STACK_PRIMARY = [[60, 0.5, 0.7], [70, 1.5, 2.0], [80, 2.0, 2.6], [90, 2.7, 3.5], [100, 4.0, 5.2], [125, 5.8, 7.6], [150, 9.5, 12.4], [200, 16.0, 21.0]];
/* Table 12 secondary ventilation: [stack DN, vent DN, Qmax square, Qmax swept] */
var STACK_SECONDARY = [[60, 50, 0.7, 0.9], [70, 50, 2.0, 2.6], [80, 50, 2.6, 3.4], [90, 50, 3.5, 4.6], [100, 50, 5.6, 7.3], [125, 70, 7.6, 10.0], [150, 80, 12.4, 18.3], [200, 100, 21.0, 27.3]];
/* Table 1: DN -> minimum internal diameter mm */
var DI_MIN = { 30: 26, 40: 34, 50: 44, 56: 49, 60: 56, 70: 68, 80: 75, 90: 79, 100: 96, 125: 113, 150: 146, 200: 184, 225: 207, 250: 230, 300: 290 };
var DN_LIST = Object.keys(DI_MIN).map(Number).sort(function (a, b) { return a - b; });

var DEFAULTS = {
  system: 'I', K: 0.5, material: 'pvc_u', entry: 'square', buried: false, fill_max: 0.5, v_min: 0.7, slope_min_pct: 0.5,
  kb_mm: 1.0, nu: 1.31e-6, aav_factor: 8, aav_branch_factor: null
};
/* EN 12056-2:2000 §6.4.3 Table 10: minimum air flow of a branch AAV as a multiple of Qtot of the branch, per system; used when aav_branch_factor is null */
var AAV_BRANCH_T10 = { I: 1, II: 2, III: 2, IV: 1 };
var KINDS = ['branch', 'stack', 'drain'];
var VENTS = ['no', 'yes', 'primary', 'secondary', 'aav'];
/* admissible ventilation per pipe kind (CR-54): branch unvented / vented / AAV; stack primary / secondary / AAV; drain none. null or '' = default of the kind */
var VENT_BY_KIND = { branch: ['no', 'yes', 'aav'], stack: ['primary', 'secondary', 'aav'], drain: ['no'] };
/* discharge direction (CR-57): branch -> stack -> drain; a pipe must not discharge into a pipe of a lower rank */
var RANK = { branch: 0, stack: 1, drain: 2 };

function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
/* own key only (X3-2): user keys such as 'constructor' must not resolve to Object.prototype members */
function own(o, k) { return o != null && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null; }
function dict() { return Object.create(null); }
function r6(x) { return x == null || !isFinite(x) ? x : Math.round(x * 1e6) / 1e6; }

/* ---------- hydraulics of a partly filled circular pipe (Prandtl–Colebrook with the hydraulic diameter 4R) ---------- */
function section(d, hd) {
  hd = Math.max(1e-9, Math.min(1, hd));
  var th = 2 * Math.acos(1 - 2 * hd);
  var A = d * d / 8 * (th - Math.sin(th)), P = d * th / 2;
  return { A: A, P: P, R: A / P, theta: th };
}
/* velocity m/s and flow l/s; d m, J m/m, kb m, nu m²/s */
function partFlow(d, hd, J, kb, nu) {
  var s = section(d, hd), Dh = 4 * s.R;
  if (!(J > 0)) return { v: 0, q_lps: 0, A: s.A };
  var a = Math.sqrt(2 * G * Dh * J);
  var v = -2 * a * Math.log(kb / (3.71 * Dh) + 2.51 * nu / (Dh * a)) / Math.LN10;
  return { v: v, q_lps: v * s.A * 1000, A: s.A };
}
/* filling degree for a flow: bisection on (0, hmax]; returns null when q exceeds the capacity at hmax */
function fillFor(q_lps, d, J, kb, nu, hmax) {
  hmax = hmax || 0.93;
  if (!(q_lps > 0)) return { hd: 0, v: 0 };
  var top = partFlow(d, hmax, J, kb, nu);
  if (top.q_lps < q_lps) return null;
  var lo = 1e-6, hi = hmax;
  for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (partFlow(d, m, J, kb, nu).q_lps < q_lps) lo = m; else hi = m; }
  var hd = (lo + hi) / 2, s = section(d, hd);
  return { hd: hd, v: q_lps / 1000 / s.A };
}

/* ---------- data helpers ---------- */
function core() { return getCore(); }
function fixture(id) { var c = core(); return c && c.FIXTURES ? own(c.FIXTURES, id) || null : null; }
function sysCol(system) { return system === 'II' ? 'II' : 'I'; } /* branch_dn_min has columns I and II; III/IV use I */
function branchCol(system) { return system === 'II' || system === 'IV' ? system : 'I'; } /* Tables 4 / 7 have columns I, II, IV */
var WC_BRANCH_MIN = { I: 90, IV: 80 }; /* EN 12056-2 Tables 4 / 7, footnotes *** (I) and **** (IV) */
function wcLike(f) { return !!(f && f.branch_dn_min && f.branch_dn_min.I >= 100); }
function series(material) {
  var c = core(), m = c && c.MATERIALS ? own(c.MATERIALS, material) : null;
  return m && m.use !== 'supply' && Array.isArray(m.series) ? m.series.slice().sort(function (a, b) { return a.id_mm - b.id_mm; }) : null;
}
/* standard DN that a pipe of internal diameter id_mm may carry (largest DN whose minimum internal diameter is met) */
function dnOfId(id_mm) { var dn = null; DN_LIST.forEach(function (d) { if (DI_MIN[d] <= id_mm + 1e-9) dn = d; }); return dn; }
/* smallest pipe of the series that satisfies the minimum internal diameter of DN */
function pipeForDN(ser, dn) {
  var need = DI_MIN[dn] != null ? DI_MIN[dn] : dn * 0.9;
  for (var i = 0; i < ser.length; i++) if (ser[i].id_mm + 1e-9 >= need) return ser[i];
  return null;
}
function pipeByDn(ser, dn) { for (var i = 0; i < ser.length; i++) if (ser[i].dn === dn) return ser[i]; return null; }
function wcMinDN(system) { return system === 'II' ? 80 : 100; }
/* a manual DN is accepted as given when it is a DN of EN 12056-2 Table 1 or a size of the series; otherwise it is snapped (QA-25) */
function dnKnown(ser, dn) { return DI_MIN[dn] != null || !!pipeByDn(ser, dn); }

/* ---------- validation ---------- */
function validate(inp) {
  var e = [];
  if (!inp || typeof inp !== 'object') return ['input'];
  if (SYSTEMS.indexOf(inp.system) < 0) e.push('system');
  if (!(num(inp.K, -1) > 0 && inp.K <= 2)) e.push('K');
  if (!series(inp.material)) e.push('material');
  if (['swept', 'square'].indexOf(inp.entry) < 0) e.push('entry');
  if (!(inp.fill_max >= 0.3 && inp.fill_max <= 0.8)) e.push('fill_max');
  if (!(inp.v_min >= 0 && inp.v_min <= 3)) e.push('v_min');
  if (!(inp.kb_mm > 0 && inp.kb_mm <= 5)) e.push('kb_mm');
  if (!(inp.nu > 1e-7 && inp.nu < 1e-5)) e.push('nu');
  if (typeof inp.buried !== 'boolean') e.push('buried');
  if (!(inp.aav_factor >= 1 && inp.aav_factor <= 20)) e.push('aav_factor');
  if (inp.aav_branch_factor != null && !(inp.aav_branch_factor >= 1 && inp.aav_branch_factor <= 20)) e.push('aav_branch_factor'); /* null = Table 10 by system */
  if (!core()) e.push('no_core');
  var nodes = inp.nodes;
  if (!Array.isArray(nodes) || !nodes.length) { e.push('nodes'); return e; }
  if (nodes.length > 500) e.push('too_many_nodes');
  var ids = dict();
  nodes.forEach(function (n, i) {
    var id = n && typeof n.id === 'string' ? n.id.trim() : '';
    if (!id) { e.push('id_empty:' + (i + 1)); return; }
    if (ids[id]) e.push('id_duplicate:' + id); ids[id] = n;
    if (KINDS.indexOf(n.kind) < 0) e.push('kind:' + id);
    else if (n.vent != null && n.vent !== '' && VENT_BY_KIND[n.kind].indexOf(n.vent) < 0) e.push('vent:' + id);
    if (n.fixtures && typeof n.fixtures === 'object') Object.keys(n.fixtures).forEach(function (f) {
      var c = n.fixtures[f];
      if (!fixture(f)) e.push('fixture:' + id + ':' + f);
      if (!(typeof c === 'number' && c >= 0 && c <= 10000 && Math.floor(c) === c)) e.push('count:' + id + ':' + f);
    });
    if (n.kind === 'drain' && !(num(n.slope, 0) > 0 && n.slope <= 20)) e.push('slope:' + id);
    /* X3-3 geometry: where given, length and drop are finite and >= 0, bends an integer >= 0, a branch gradient 0–20 % (0 = flat, flagged by the limits) */
    if (n.L != null && !(num(n.L, -1) >= 0)) e.push('L:' + id);
    if (n.drop != null && !(num(n.drop, -1) >= 0)) e.push('drop:' + id);
    if (n.bends != null && !(num(n.bends, -1) >= 0 && Math.floor(n.bends) === n.bends)) e.push('bends:' + id);
    if (n.kind === 'branch' && n.slope != null && !(num(n.slope, -1) >= 0 && n.slope <= 20)) e.push('slope:' + id);
    if (n.qx != null && !(num(n.qx, -1) >= 0 && n.qx <= 200)) e.push('qx:' + id);
    if (n.dn != null && n.dn !== 0 && !(num(n.dn, 0) > 0)) e.push('dn:' + id);
  });
  nodes.forEach(function (n) {
    if (!n || !n.id) return;
    var to = n.to == null ? '' : String(n.to).trim();
    if (to && !ids[to]) e.push('to_missing:' + n.id + '>' + to);
    if (to === n.id) e.push('to_self:' + n.id);
  });
  if (!e.length) { /* cycles */
    nodes.forEach(function (n) {
      var seen = dict(), cur = n, k = 0;
      while (cur && cur.to && k++ < 1000) { if (seen[cur.id]) { e.push('cycle:' + n.id); break; } seen[cur.id] = 1; cur = ids[String(cur.to).trim()]; }
    });
    if (!nodes.some(function (n) { return !n.to; })) e.push('no_outlet');
  }
  return e.filter(function (v, i, a) { return a.indexOf(v) === i; });
}

/* ---------- one design flow: Qww = K·√ΣDU, not less than the largest single DU; Qtot = Qww + Qc + Qp ---------- */
function qww(K, sumDU, maxDU) {
  if (!(sumDU > 0)) return 0;
  return Math.max(K * Math.sqrt(sumDU), maxDU || 0);
}

function tableBranch(system, vented) { return BRANCH[vented ? 'vented' : 'unvented'][branchCol(system)]; }
function noteOk(note, wc, bends) { return !note || (note === 'nowc' ? wc === 0 : note === 'wc2' ? wc <= 2 && (bends || 0) <= 1 : note === 'wc1' ? wc <= 1 : true); }

/* ---------- solve ---------- */
function solve(input) {
  var inp = {};
  Object.keys(DEFAULTS).forEach(function (k) { inp[k] = input && input[k] != null && input[k] !== '' ? input[k] : DEFAULTS[k]; /* null / '' = default (D-PLB-14) */ });
  inp.nodes = input && input.nodes;
  var errors = validate(inp);
  if (errors.length) return { valid: false, errors: errors, version: VERSION };
  var sys = inp.system, ser = series(inp.material), kb = inp.kb_mm / 1000, nu = inp.nu;
  var aavBranch = inp.aav_branch_factor != null ? inp.aav_branch_factor : AAV_BRANCH_T10[sys]; /* user override 1–20 wins over Table 10 */
  var byId = dict(), kids = dict(), order = [];
  inp.nodes.forEach(function (n) { var id = n.id.trim(); byId[id] = n; kids[id] = []; });
  inp.nodes.forEach(function (n) { var to = n.to ? String(n.to).trim() : ''; if (to) kids[to].push(n.id.trim()); });
  var flags = [], rows = dict(), duMissing = [];
  function flag(f) { if (flags.indexOf(f) < 0) flags.push(f); }

  function visit(id) {
    var n = byId[id];
    var r = { id: id, kind: n.kind, to: n.to ? String(n.to).trim() : '', own_du: 0, sum_du: 0, max_du: 0, wc: 0, fixtures: 0, qx: num(n.qx, 0),
      dn_fix: 0, dn_up: 0, issues: [] };
    var f = n.fixtures || {};
    Object.keys(f).forEach(function (fid) {
      var c = f[fid]; if (!(c > 0)) return;
      var fx = fixture(fid), du = fx.du_lps[sys];
      if (du == null) { if (fx.du_lps.I != null && duMissing.indexOf(fid) < 0) duMissing.push(fid); du = 0; }
      r.own_du += c * du; r.max_du = Math.max(r.max_du, du); r.fixtures += c;
      if (wcLike(fx)) r.wc += c;
      var dmin = fx.branch_dn_min ? fx.branch_dn_min[sysCol(sys)] : null;
      /* a WC in systems I / IV: the Table 4 / 7 WC rows govern (I DN 90 with ≤ 2 WCs and ≤ 90° change, IV DN 80 with ≤ 1 WC; noteOk steps up
         when the footnote is not met) instead of the generic fixture minimum DN 100 (bw-r1 review CR-2) */
      if (dmin && wcLike(fx) && (sys === 'I' || sys === 'IV')) dmin = WC_BRANCH_MIN[sys];
      if (dmin) r.dn_fix = Math.max(r.dn_fix, dmin);
    });
    r.sum_du = r.own_du;
    kids[id].forEach(function (k) {
      var c = visit(k);
      r.sum_du += c.sum_du; r.max_du = Math.max(r.max_du, c.max_du); r.wc += c.wc; r.fixtures += c.fixtures; r.qx += c.qx;
      r.dn_fix = Math.max(r.dn_fix, c.dn_fix); r.dn_up = Math.max(r.dn_up, c.dn || 0);
      if (RANK[c.kind] > RANK[n.kind]) r.issues.push(c.kind + '_into_' + n.kind + ':' + k);
    });
    r.q_ww = qww(inp.K, r.sum_du, r.max_du);
    r.q_tot = r.q_ww + r.qx;
    if (!(r.q_tot > 0)) r.issues.push('no_flow:' + id);
    if (n.kind === 'branch') sizeBranch(n, r);
    else if (n.kind === 'stack') sizeStack(n, r);
    else sizeDrain(n, r);
    r.issues.forEach(function (x) { flag(x.split(':')[0]); });
    rows[id] = r; order.push(id);
    return r;
  }

  /* manual DN of a branch or stack: kept when known, else the DN of the smallest series pipe that meets it (issue dn_not_in_series) */
  function manualDN(n, r) {
    if (dnKnown(ser, n.dn)) return n.dn;
    var p = pipeForDN(ser, n.dn), d = p ? dnOfId(p.id_mm) : null;
    r.issues.push('dn_not_in_series:' + n.id); r.dn_given = n.dn;
    return d || n.dn;
  }
  function attachPipe(r, dn) {
    var p = dn ? pipeForDN(ser, dn) : null;
    r.dn = dn; r.od_mm = p ? p.od_mm : null; r.id_mm = p ? p.id_mm : null;
    if (dn && !p) r.issues.push('no_pipe_in_series');
  }

  function sizeBranch(n, r) {
    var vented = n.vent === 'yes' || n.vent === 'aav';
    r.vented = vented; r.vent = vented ? (n.vent === 'aav' ? 'aav' : 'yes') : 'no';
    var need = Math.max(r.dn_fix, r.dn_up);
    r.L = num(n.L, 0); r.bends = num(n.bends, 0); r.drop = num(n.drop, 0); r.slope = num(n.slope, 1);
    if (sys === 'III') { /* system III: EN 12056-2 Tables 6 / 9 give per-appliance limits, no Qmax table */
      r.issues.push('branch_tables_I_II:' + n.id); /* system III: capacity not checked (CR-53); the key keeps its old name (I/II/IV are table-checked) */
      attachPipe(r, n.dn > 0 ? manualDN(n, r) : (need || null)); r.q_max = null; r.ratio = null; r.table = null;
    } else {
      var t = tableBranch(sys, vented), pick = null;
      if (n.dn > 0) {
        var dnb = manualDN(n, r);
        t.forEach(function (row) { if (row[1] <= dnb && noteOk(row[2], r.wc, r.bends)) pick = row; });
        if (!pick || pick[0] < r.q_tot - 1e-12) r.issues.push('override_small:' + n.id);
        if (dnb < need) r.issues.push('dn_below_min:' + n.id);
        attachPipe(r, dnb); r.q_max = pick ? pick[0] : 0;
      } else {
        for (var i = 0; i < t.length; i++) { var row = t[i]; if (row[0] + 1e-12 >= r.q_tot && row[1] >= need && noteOk(row[2], r.wc, r.bends)) { pick = row; break; } }
        if (!pick) { r.issues.push('branch_over_table:' + n.id); attachPipe(r, need || null); r.q_max = null; }
        else { attachPipe(r, pick[1]); r.q_max = pick[0]; }
      }
      r.ratio = r.q_max ? r.q_tot / r.q_max : null; r.table = vented ? 'T7' : 'T4';
      if (r.vent === 'yes' && r.dn != null) r.vent_dn = own(BRANCH_VENT[branchCol(sys)], String(r.dn)) || null; /* Table 7 Branch/Vent (Y5-4); an AAV branch has no vent pipe */
    }
    /* limits — EN 12056-2 Table 5 (unventilated) / Table 8 (ventilated), systems I, II, IV (r1-drain, D-BW-3) */
    r.limit = null;
    if (BRANCH_LIMITS[sys]) {
      var lim = BRANCH_LIMITS[sys][vented ? 'vented' : 'unvented'], dropMax = lim.drop_small != null && !(r.dn > 70) ? lim.drop_small : lim.drop;
      r.limit = { L: lim.L, bends: lim.bends, drop: dropMax, slope: lim.slope };
      if (lim.L != null && r.L > lim.L + 1e-9) r.issues.push((vented ? 'vented' : 'unvented') + '_length:' + n.id);
      if (lim.bends != null && r.bends > lim.bends) r.issues.push('unvented_bends:' + n.id);
      if (r.drop > dropMax + 1e-9) r.issues.push((vented ? 'vented' : 'unvented') + '_drop:' + n.id);
      if (r.slope + 1e-9 < lim.slope) r.issues.push('branch_slope:' + n.id);
    }
    /* CR-55 / D-PLB-23: a branch vented by an AAV needs Qa >= f x Qtot of the branch, f from EN 12056-2 Table 10 (I, IV: 1; II, III: 2)
       unless aav_branch_factor is given (SOURCES.aav_sizing); key only on AAV branches */
    if (r.vent === 'aav') r.aav_air_lps = aavBranch * r.q_tot;
  }

  /* A stack whose vent terminates in an AAV is a primary-ventilated stack (EN 12056-2 system configuration with the stack vent ending in an AAV):
     it has no separate ventilation pipe, so Table 12 does not apply; Table 11 holds only if the AAV admits Qa >= aav_factor x Qtot (EN 12056-2 §6.5.3: 8) and the
     network keeps an open vent elsewhere for positive pressures (aav_no_open_vent) (CR-55). */
  function sizeStack(n, r) {
    var vent = n.vent === 'secondary' ? 'secondary' : n.vent === 'aav' ? 'aav' : 'primary';
    r.vent = vent;
    var need = Math.max(r.dn_up, r.wc > 0 ? wcMinDN(sys) : 0), col = inp.entry === 'square' ? 0 : 1;
    var tab = vent === 'secondary' ? STACK_SECONDARY.map(function (x) { return [x[0], x[2 + col], x[1]]; }) : STACK_PRIMARY.map(function (x) { return [x[0], x[1 + col], x[0]]; });
    var pick = null;
    if (n.dn > 0) {
      var dns = manualDN(n, r);
      tab.forEach(function (row) { if (row[0] <= dns) pick = row; });
      if (!pick || pick[1] < r.q_tot - 1e-12) r.issues.push('override_small:' + n.id);
      if (dns < need) r.issues.push('dn_below_min:' + n.id);
      attachPipe(r, dns); r.q_max = pick ? pick[1] : 0; r.vent_dn = pick ? pick[2] : null;
    } else {
      for (var i = 0; i < tab.length; i++) if (tab[i][1] + 1e-12 >= r.q_tot && tab[i][0] >= need) { pick = tab[i]; break; }
      if (!pick) { r.issues.push('stack_over_table:' + n.id); attachPipe(r, Math.max(need, 200)); r.q_max = null; r.vent_dn = null; }
      else { attachPipe(r, pick[0]); r.q_max = pick[1]; r.vent_dn = pick[2]; }
    }
    if (vent !== 'secondary' && r.dn) r.vent_dn = r.dn; /* primary vent continues at stack size */
    r.ratio = r.q_max ? r.q_tot / r.q_max : null;
    r.aav_air_lps = vent === 'aav' ? inp.aav_factor * r.q_tot : null;
    r.table = vent === 'secondary' ? 'T12' : 'T11';
    r.L = num(n.L, 0);
  }

  function sizeDrain(n, r) {
    r.slope = num(n.slope, 1); var J = r.slope / 100;
    var need = Math.max(r.dn_up, r.wc > 0 ? wcMinDN(sys) : 0, r.dn_fix);
    var buried = typeof n.buried === 'boolean' ? n.buried : inp.buried; /* CR-52: optional DIN 1986-100 minimum DN 100 for buried drains */
    r.buried = buried;
    if (buried && n.dn > 0 && n.dn < 100) r.issues.push('buried_dn100:' + n.id);
    if (buried) need = Math.max(need, 100);
    var p = null, cap = null;
    if (n.dn > 0) {
      p = pipeByDn(ser, n.dn) || pipeForDN(ser, n.dn);
      if (!dnKnown(ser, n.dn)) { r.issues.push('dn_not_in_series:' + n.id); r.dn_given = n.dn; }
      if (!p) r.issues.push('no_pipe_in_series');
    } else {
      var minId = need && DI_MIN[need] != null ? DI_MIN[need] : 0;
      for (var i = 0; i < ser.length; i++) {
        if (ser[i].id_mm + 1e-9 < minId) continue;
        cap = partFlow(ser[i].id_mm / 1000, inp.fill_max, J, kb, nu).q_lps;
        if (cap + 1e-12 >= r.q_tot) { p = ser[i]; break; }
      }
      if (!p) { r.issues.push('drain_over_series:' + n.id); p = ser[ser.length - 1]; }
    }
    r.L = num(n.L, 0);
    if (!p) { r.dn = null; return; }
    r.od_mm = p.od_mm; r.id_mm = p.id_mm; r.dn = dnOfId(p.id_mm); r.series_dn = p.dn;
    var d = p.id_mm / 1000;
    var full = partFlow(d, inp.fill_max, J, kb, nu);
    r.q_max = full.q_lps; r.v_cap = full.v; r.ratio = r.q_tot / r.q_max;
    if (n.dn > 0 && r.q_max < r.q_tot - 1e-12) r.issues.push('override_small:' + n.id);
    if (r.dn != null && r.dn < need) r.issues.push('dn_below_min:' + n.id);
    var f = fillFor(r.q_tot, d, J, kb, nu, 0.93);
    if (f) { r.hd = f.hd; r.v = f.v; } else { r.hd = null; r.v = null; r.issues.push('drain_surcharged:' + n.id); }
    if (r.v != null && r.q_tot > 0 && r.v + 1e-9 < inp.v_min) r.issues.push('self_cleansing:' + n.id);
    if (r.slope + 1e-9 < inp.slope_min_pct) r.issues.push('drain_slope:' + n.id);
  }

  var roots = inp.nodes.filter(function (n) { return !n.to; }).map(function (n) { return n.id.trim(); });
  roots.forEach(visit);
  if (duMissing.length) flag('du_missing');
  if (order.some(function (id) { var f = byId[id].fixtures; return f && f.wc_flushvalve > 0; })) flag('du_flushvalve_assumed');
  /* venting (CR-55): every outlet network (the tree ending at one outlet) that uses AAVs needs at least one stack with an open vent
     (primary or secondary); the issue is attached to the outlet pipe. AAV air-flow requirements -> info flag aav_air */
  var stacks = order.filter(function (id) { return rows[id].kind === 'stack'; });
  function subtree(id, acc) { acc.push(id); kids[id].forEach(function (k) { subtree(k, acc); }); return acc; }
  roots.forEach(function (rt) {
    var ids = subtree(rt, []);
    if (ids.some(function (id) { return rows[id].vent === 'aav'; }) && !ids.some(function (id) { return rows[id].kind === 'stack' && rows[id].vent !== 'aav'; })) {
      rows[rt].issues.push('aav_no_open_vent:' + rt); flag('aav_no_open_vent');
    }
  });
  if (order.some(function (id) { return rows[id].vent === 'aav'; })) flag('aav_air');
  /* CR-56: the swept column of Tables 11/12 holds only with swept (≥ 45° / radius) connections at every stack junction */
  if (stacks.length && inp.entry === 'swept') flag('entry_swept');
  /* plb-r4 Y5-2: h/d above 0.5 is for drains outside the building only (DIN 1986-100: 0.5 inside, 0.7 outside) */
  if (inp.fill_max > 0.5 + 1e-9 && order.some(function (id) { return rows[id].kind === 'drain'; })) flag('fill_above_half');
  /* direction: a pipe must not be smaller than any pipe that discharges into it */
  order.forEach(function (id) { var r = rows[id]; if (r.dn != null && r.dn_up > r.dn) { r.issues.push('reduction:' + id); flag('reduction'); } });

  var list = order.map(function (id) {
    var r = rows[id], o = {};
    Object.keys(r).forEach(function (k) { o[k] = typeof r[k] === 'number' ? r6(r[k]) : r[k]; });
    return o;
  });
  var tot = { sum_du: 0, q_ww: 0, q_tot: 0, qx: 0 };
  roots.forEach(function (id) { tot.sum_du += rows[id].sum_du; tot.qx += rows[id].qx; tot.q_tot += rows[id].q_tot; });
  /* the whole building at its single outlet (one √ over all DU when several outlets join outside) */
  var maxAll = 0; roots.forEach(function (id) { maxAll = Math.max(maxAll, rows[id].max_du); });
  tot.q_ww = qww(inp.K, tot.sum_du, maxAll);
  tot.q_building = tot.q_ww + tot.qx;
  Object.keys(tot).forEach(function (k) { tot[k] = r6(tot[k]); });
  var issues = [];
  list.forEach(function (r) { r.issues.forEach(function (x) { if (x.indexOf(':') > 0) issues.push(x); }); });
  var worst = null;
  list.forEach(function (r) { if (r.ratio != null && (!worst || r.ratio > worst.ratio)) worst = r; });
  return { valid: true, version: VERSION, system: sys, K: inp.K, aav_branch_factor: aavBranch, aav_branch_source: inp.aav_branch_factor != null ? 'user' : 'en12056_2_t10', entry: inp.entry, material: inp.material, fill_max: inp.fill_max, v_min: inp.v_min,
    rows: list, roots: roots, totals: tot, flags: flags, issues: issues, du_missing: duMissing,
    worst: worst ? { id: worst.id, ratio: worst.ratio } : null,
    counts: { branch: list.filter(function (r) { return r.kind === 'branch'; }).length, stack: stacks.length, drain: list.filter(function (r) { return r.kind === 'drain'; }).length } };
}

/* ---------- curves for the charts ---------- */
function qwwCurve(K, duMax, nPts) {
  var out = [], n = nPts || 60;
  for (var i = 0; i <= n; i++) { var du = duMax * i / n; out.push({ du: du, q: K * Math.sqrt(du) }); }
  return out;
}
function drainCapacity(material, fill, slopes, kb_mm, nu) {
  var ser = series(material) || [], kb = (kb_mm || 1) / 1000;
  return ser.filter(function (p) { return p.id_mm >= 68; }).map(function (p) {
    return { dn: dnOfId(p.id_mm), od_mm: p.od_mm, id_mm: p.id_mm, pts: slopes.map(function (s) { return { slope: s, q: partFlow(p.id_mm / 1000, fill, s / 100, kb, nu || 1.31e-6).q_lps }; }) };
  });
}

/* ---------- from the plumbing project document: all fixtures of floors ≥ 1 into one stack, ground/basement fixtures directly into the drain ---------- */
function fromProject(doc) {
  var c = core(); if (!doc || !Array.isArray(doc.zones)) return null;
  var up = {}, low = {}, any = false;
  doc.zones.forEach(function (z) {
    if (!z || !z.fixtures) return;
    var tgt = (typeof z.floor === 'number' && z.floor >= 1) ? up : low;
    Object.keys(z.fixtures).forEach(function (f) { var n = z.fixtures[f]; if (typeof n === 'number' && n > 0 && fixture(f) && fixture(f).du_lps.I != null) { tgt[f] = (tgt[f] || 0) + Math.round(n); any = true; } });
  });
  if (!any) return null;
  var bt = doc.project && c && c.BUILDING_TYPES ? own(c.BUILDING_TYPES, doc.project.building_type) : null;
  var nodes = [{ id: 'D1', kind: 'drain', to: '', fixtures: low, L: 20, slope: 1, qx: 0, dn: 0 }];
  if (Object.keys(up).length) nodes.push({ id: 'ST1', kind: 'stack', to: 'D1', fixtures: up, vent: 'primary', L: (doc.project && doc.project.floors || 3) * (doc.project && doc.project.floor_height_m || 3), qx: 0, dn: 0 });
  return { K: bt && bt.drainage_K ? bt.drainage_K : DEFAULTS.K, nodes: nodes, building_type: doc.project ? doc.project.building_type : null };
}

/* ---------- presets (learning examples; fixture counts from PLBCore.PRESET_PROJECTS where they fit) ---------- */
function N(id, kind, to, fixtures, o) { var n = { id: id, kind: kind, to: to || '', fixtures: fixtures || {}, L: 0, slope: 1, bends: 0, drop: 0, vent: kind === 'stack' ? 'primary' : 'no', qx: 0, dn: 0 }; if (o) Object.keys(o).forEach(function (k) { n[k] = o[k]; }); return n; }
var FLAT = { wc_cistern: 1, basin: 1, shower: 1, bath: 1, sink_kitchen: 1, dishwasher_dom: 1, washing_machine: 1 };
function times(o, k) { var r = {}; Object.keys(o).forEach(function (x) { r[x] = o[x] * k; }); return r; }
/* one flat in detail (bathroom + kitchen branches) on the top floor, 11 flats below lumped on the stack */
function flatStack(bathL, bathVent, sys) {
  return [
    N('D1', 'drain', '', {}, { L: 18, slope: 2 }),
    N('ST1', 'stack', 'D1', times(FLAT, 11), { L: 17 }),
    N('WC', 'branch', 'ST1', { wc_cistern: 1 }, { L: 1.2, slope: 2, bends: 1 }),
    N('BATH', 'branch', 'ST1', { bath: 1 }, { L: bathL, slope: 2, bends: bathL > 4 ? 3 : 2, vent: bathVent || 'no' }),
    N('BAS', 'branch', 'BATH', { basin: 1 }, { L: 0.8, slope: 2, bends: 1 }),
    N('SHW', 'branch', 'BATH', { shower: 1 }, { L: 1.5, slope: 2, bends: 1 }),
    N('KIT', 'branch', 'ST1', { sink_kitchen: 1 }, { L: 3.0, slope: 1.5, bends: 2 }),
    N('DW', 'branch', 'KIT', { dishwasher_dom: 1 }, { L: 0.6, slope: 2 }),
    N('WM', 'branch', 'KIT', { washing_machine: 1 }, { L: 1.0, slope: 2, bends: 1 })
  ];
}
var PRESETS = {
  apt_stack: function () { return { system: 'I', K: 0.5, entry: 'swept', material: 'pvc_u', project: 'apartments_24', nodes: flatStack(2.4) }; },
  apt_square: function () { var p = PRESETS.apt_stack(); p.entry = 'square'; p.nodes[0].slope = 1; return p; },
  bath_far: function () { return { system: 'I', K: 0.5, entry: 'swept', material: 'pvc_u', project: 'apartments_24', nodes: flatStack(5.5) }; },
  apt_sys2: function () { var p = PRESETS.apt_stack(); p.system = 'II'; return p; },
  office_core: function () {
    var fl = { wc_cistern: 6, urinal_flush: 3, basin: 6, handbasin_small: 1, sink_kitchen: 1, dishwasher_dom: 1, cleaner_sink: 1 };
    return { system: 'I', K: 0.5, entry: 'swept', material: 'pe_hd', project: 'office_8f', nodes: [
      N('D1', 'drain', '', { shower: 6, wc_cistern: 2, basin: 2 }, { L: 25, slope: 1 }),
      N('ST1', 'stack', 'D1', times(fl, 7), { L: 29, vent: 'primary' }),
      N('WCR', 'branch', 'ST1', { wc_cistern: 6 }, { L: 6, slope: 1, bends: 1, vent: 'yes' }),
      N('URI', 'branch', 'ST1', { urinal_flush: 3 }, { L: 3, slope: 1.5, bends: 1 }),
      N('BAS', 'branch', 'ST1', { basin: 6, handbasin_small: 1 }, { L: 5, slope: 1.5, bends: 2, vent: 'yes' }),
      N('PAN', 'branch', 'ST1', { sink_kitchen: 1, dishwasher_dom: 1, cleaner_sink: 1 }, { L: 3.5, slope: 1.5, bends: 2 })
    ] };
  },
  sports_k: function () {
    var room = { shower: 8, wc_cistern: 2, basin: 3, floor_drain: 2 };
    return { system: 'I', K: 1.0, entry: 'swept', material: 'pvc_u', project: 'sports_hall', nodes: [
      N('D1', 'drain', '', { wc_cistern: 4, urinal_flush: 3, basin: 4, sink_kitchen: 1, cleaner_sink: 1 }, { L: 30, slope: 1 }),
      N('CR12', 'drain', 'D1', times(room, 2), { L: 15, slope: 1 }),
      N('CR34', 'drain', 'D1', times(room, 2), { L: 15, slope: 1 })
    ] };
  },
  hotel_kitchen: function () {
    return { system: 'I', K: 0.7, entry: 'swept', material: 'pvc_u', project: 'hotel_120', nodes: [
      N('KD', 'drain', '', { sink_commercial: 3, dishwasher_com: 1, handbasin_small: 2, floor_drain: 4 }, { L: 22, slope: 0.5, dn: 150 })
    ] };
  }
};
var PRESET_IDS = Object.keys(PRESETS);

return { VERSION: VERSION, SOURCES: SOURCES, BRANCH: BRANCH, BRANCH_LIMITS: BRANCH_LIMITS, STACK_PRIMARY: STACK_PRIMARY, STACK_SECONDARY: STACK_SECONDARY,
  DI_MIN: DI_MIN, DEFAULTS: DEFAULTS, AAV_BRANCH_T10: AAV_BRANCH_T10, KINDS: KINDS, VENTS: VENTS, VENT_BY_KIND: VENT_BY_KIND, SYSTEMS: SYSTEMS,
  section: section, partFlow: partFlow, fillFor: fillFor, qww: qww, dnOfId: dnOfId, series: series, validate: validate, solve: solve,
  qwwCurve: qwwCurve, drainCapacity: drainCapacity, fromProject: fromProject, PRESETS: PRESETS, PRESET_IDS: PRESET_IDS };
}));
