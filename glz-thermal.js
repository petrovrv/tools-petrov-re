/* glz-thermal.js — global GlzThermal: engine of the tool `glassthermalbreak` (Thermal Breakage Risk of Glass) of the tools.petrov.re Glazing & Windows package.
   Will a pane crack because its sunlit centre is hotter than its edge (frame, partial shade, blind behind the glass)?
   1 optics: solar absorption of each pane in the unit (multiple reflections between layers = NBN EN 410:2011 §5.4.6 principle, also with a blind);
   2 glass temperatures: steady-state energy balance of NBN S 23-002-2:2020 Annex A (he = 4 + 4·v, gas-gap conductance per NBN EN 673 eq. (4)–(8),
     gas coefficients recalculated at the gap temperature until stable); the closed forms A.3 / A.4 are the special case without a blind;
   3 edge / shade temperatures and ΔT: frame, shadow and blind factors = learning assumptions (FIV 01, the method NBN S 23-002:2007 §4.4.1.3 refers to,
     is not available) — every factor is visible and can be overridden;
   4 stress σ = E·αT·ΔT·k against the edge strength of EN 16612:2019 §8 (ke Table A.5, kmod by duration, eq. (4) / (6)) via GlazingCore.fgd.
   Pane order: panes[0] = outer (exterior side), last = inner (room side). Pure functions, no DOM. UMD: browser global GlzThermal (needs GlazingCore
   loaded first), node module.exports. Planning aid only — the final thermal-stress check is made by a qualified person / the glass supplier. */
(function (root, factory) {
  var core = (root && root.GlazingCore) || (typeof require === 'function' ? require('./glazing-core.js') : null);
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GlzThermal = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C) {
'use strict';

var VERSION = '0.1.1';

/* ---------------------------------------------------------------- 1. sources (norm + clause) */
var S07 = 'NBN S 23-002:2007 Vitrerie (STS 38)', NBN2 = 'NBN S 23-002-2 Vitrerie — Partie 2 : Calcul des épaisseurs de verre',
  NBN3 = 'NBN S 23-002-3 Vitrerie — Partie 3 : Épaisseurs de verre en façade',
  EN16612 = 'EN 16612 Glass in building — Determination of the lateral load resistance of glass panes by calculation';
var Src = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var SOURCES = {
  s07_risk: Src(S07, '2007', '§4.4.1.3 (thermal shock risk; data to specify; method FIV 01 — not available here)'),
  s07_soak: Src(S07, '2007', '§4.4.1.4 (heat soak of toughened glass)'),
  nbn2_a: Src(NBN2, '2020', 'Annex A (A.1 he = 4 + 4·v, A.2 iteration, A.3 / A.4 glass temperatures)'),
  nbn2_b: Src(NBN2, '2020', 'Annex B (strongly absorbing glass αe ≥ 45 %, short side 350–700 mm)'),
  nbn3_1: Src(NBN3, '2020', '§1 scope (αe ≥ 45 % not heat-treated excluded)'),
  en410: Src('NBN EN 410 Glass in building — Determination of luminous and solar characteristics of glazing', '2011', '§5.4.6 (effective absorptance) — referred to by NBN S 23-002-2 Annex A; copy not read here, multiple-reflection principle applied'),
  en673: Src('NBN EN 673 Glass in building — Determination of thermal transmittance (U value)', '2011', 'eq. (4)–(8) (gap conductance hs = hr + hg, Nu = 0,035·(Gr·Pr)^0,38) — referred to by NBN S 23-002-2 Annex A; copy not read here'),
  iso15099: Src('ISO 15099 / ISO 52022-3 Annex F gas property coefficients (air, argon, krypton)', '2003 / 2017', 'linear λ(T), μ(T), cp(T) as published; copies not read here', 'learning_assumption'),
  en16612_e: Src(EN16612, '2019', '§8.1 eq. (4) and §8.2 eq. (6), Table A.5 (ke, edge under stress — proposed values, nationally determined parameter per A.1.2; no Belgian value in NBN S 23-002-2), Table 5 / eq. kmod = 0,663·t^(−1/16)'),
  nbn2_41: Src(NBN2, '2020', '§4.1 (E 70 000 MPa) — αT 9·10⁻⁶ K⁻¹ (EN 572-1)'),
  la_optic: Src('Learning assumption: typical solar optical data of generic glass products (τ, ρ, ε) — use the supplier’s EN 410 / EN 673 data', 'glz-thermal ' + VERSION, '', 'learning_assumption'),
  la_edge: Src('Learning assumption: edge, shade and blind factors (frame warming share, cold-mass lag, rebate depth, shadow factor, blind gap coupling), after glass-industry thermal-safety guidance — FIV 01 not available', 'glz-thermal ' + VERSION, '', 'learning_assumption'),
  la_k: Src('Learning assumption: restraint factor k = 1 (cold edge band fully restrained by the warm centre) and a 5 h duration of the daily peak for kmod (EN 16612 Table 5 gives 8 h / kmod 0,58 for the daily climatic cycle, note e 6 h 0,59 … 12 h 0,57: the 5 h peak gives 0,599, ≈ 3 % less conservative — set the duration to 8 h for the Table 5 value)', 'glz-thermal ' + VERSION, '', 'learning_assumption')
};

/* ---------------------------------------------------------------- 2. data */
var SIGMA = 5.67e-8, P_ATM = 101325, R_GAS = 8314.51, G = 9.81, EPS_GLASS = 0.837;
/* gas coefficients λ = a + b·T (W/mK), μ = a + b·T (Pa·s), cp = a + b·T (J/kgK), M kg/kmol — ISO 15099 Table B.1 values (= ISO 52022-3 Annex F) */
var GAS = {
  air: { lam: [2.873e-3, 7.760e-5], mu: [3.723e-6, 4.940e-8], cp: [1002.737, 1.2324e-2], M: 28.97 },
  argon: { lam: [2.285e-3, 5.149e-5], mu: [3.379e-6, 6.451e-8], cp: [521.9285, 0], M: 39.948 },
  krypton: { lam: [9.443e-4, 2.826e-5], mu: [2.213e-6, 7.777e-8], cp: [248.0907, 0], M: 83.80 }
};
/* generic optical sets (learning assumption): tau, rho of the coated side rc, rho of the glass side rg, emissivity of the coated side ec.
   clear float: tau by thickness, rho 0,08 / 0,07, both faces ε 0,837. A coating faces the cavity (outer pane: face 2, inner / middle pane: front face). */
var OPTICS = {
  clear: { clear: true },
  extraclear: { tau: 0.89, rc: 0.08, rg: 0.08, ec: EPS_GLASS },
  lowe: { tau: 0.62, rc: 0.26, rg: 0.22, ec: 0.037 },
  solar: { tau: 0.40, rc: 0.36, rg: 0.25, ec: 0.037 },
  solar_strong: { tau: 0.30, rc: 0.25, rg: 0.18, ec: 0.05 },
  tinted: { tau: 0.45, rc: 0.05, rg: 0.05, ec: EPS_GLASS },
  custom: { custom: true }
};
var CLEAR_T = [3, 4, 6, 8, 10, 12, 15, 19, 25], CLEAR_TAU = [0.86, 0.84, 0.80, 0.77, 0.74, 0.71, 0.67, 0.62, 0.55];
/* blinds (learning assumption): tau, rho of the slats / fabric */
var BLINDS = { none: null, light: { tau: 0.10, rho: 0.70 }, mid: { tau: 0.08, rho: 0.40 }, dark: { tau: 0.05, rho: 0.10 } };
/* frames (learning assumption): r = share of the centre's solar temperature rise that reaches the glass edge through a sunlit frame; lag = cold-mass lag K */
var FRAMES = { light: { r: 0.25, lag: 0 }, metal_tb: { r: 0.15, lag: 0 }, heavy: { r: 0, lag: 6 } };
var DARK_FRAME_R = 0.10, COVER_REF_MM = 15, COVER_K_PER_MM = 0.2, COVER_MAX_K = 5;
/* shadow (learning assumption): factor on the centre-to-shadow difference */
var SHADE = { none: 0, edge: 1.0, strip: 1.25 };
var DEFAULTS = { I: 750, Te: 5, Ti: 20, v: 2, diffuse: 0.15, k: 1, duration_h: 5, gammaMA: 1.8, gammaMv: 1.2, set: 'EN16612' };
var GLASS = ['annealed', 'heat_strengthened', 'toughened'], EDGES = ['cut', 'seamed', 'polished'];
var LIM = { I: [0, 1200], Te: [-30, 45], Ti: [5, 45], v: [0, 20], diffuse: [0, 0.6], k: [0.3, 1.5], duration_h: [0.05, 24], gammaMA: [1, 3], gammaMv: [1, 3],
  t_mm: [3, 40], cavity_mm: [4, 30], gap_mm: [10, 300], cover_mm: [5, 40], extra_K: [0, 40], dim_m: [0.1, 10] };

/* ---------------------------------------------------------------- 3. helpers */
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function clamp(v, r) { return Math.min(r[1], Math.max(r[0], v)); }
function lin(c, T) { return c[0] + c[1] * T; }
function num(v, d, r) { return isNum(v) ? (r ? clamp(v, r) : v) : d; }

/* layer optics of a pane: {tau, rf (from outside), rb (from inside), ef, eb} */
function paneOptics(p, index, n) {
  var o = OPTICS[p.optic] || OPTICS.clear, t = num(p.t_mm, 6, LIM.t_mm);
  if (o.custom) { var tc = num(p.tau, 0.8, [0, 1]);              // supplier EN 410 data; τ + ρ ≤ 1 enforced so that the absorptance is never negative
    return { tau: tc, rf: num(p.rho_f, 0.07, [0, 1 - tc]), rb: num(p.rho_b, 0.07, [0, 1 - tc]), ef: num(p.eps_f, EPS_GLASS, [0.01, 1]), eb: num(p.eps_b, EPS_GLASS, [0.01, 1]) }; }
  if (o.clear) { var tau = C.interp(CLEAR_T, CLEAR_TAU, t), r = t <= 4 ? 0.08 : 0.07; return { tau: tau, rf: r, rb: r, ef: EPS_GLASS, eb: EPS_GLASS }; }
  var coatBack = n > 1 ? index === 0 : true;          // IGU: outer pane face 2, others front face; single glazing: room face
  if (p.coat === 'front') coatBack = false; else if (p.coat === 'back') coatBack = true;
  return coatBack ? { tau: o.tau, rf: o.rg, rb: o.rc, ef: EPS_GLASS, eb: o.ec } : { tau: o.tau, rf: o.rc, rb: o.rg, ef: o.ec, eb: EPS_GLASS };
}
/* absorbed fraction of each layer (multiple reflections; forward flux F_j on layer j from outside, backward B_j from inside) */
function absorptances(layers) {
  var n = layers.length, F = new Array(n).fill(0), B = new Array(n).fill(0);
  for (var it = 0; it < 500; it++) {
    var dmax = 0, Fn = new Array(n), Bn = new Array(n);
    for (var j = 0; j < n; j++) {
      Fn[j] = j === 0 ? 1 : layers[j - 1].tau * F[j - 1] + layers[j - 1].rb * B[j - 1];
      Bn[j] = j === n - 1 ? 0 : layers[j + 1].tau * B[j + 1] + layers[j + 1].rf * F[j + 1];
    }
    for (j = 0; j < n; j++) { dmax = Math.max(dmax, Math.abs(Fn[j] - F[j]), Math.abs(Bn[j] - B[j])); F[j] = Fn[j]; B[j] = Bn[j]; }
    if (dmax < 1e-12) break;
  }
  var A = layers.map(function (L, j) { return (1 - L.tau - L.rf) * F[j] + (1 - L.tau - L.rb) * B[j]; });
  var last = layers[n - 1], T = last.tau * F[n - 1], R = layers[0].rf + layers[0].tau * B[0];
  return { A: A, tau: T, rho: R };
}
/* gap conductance hs = hr + hg (EN 673 eq. (4)–(8)), vertical gap, gas properties at Tm */
function gapH(gas, s_m, e1, e2, T1, T2) {
  var g = GAS[gas] || GAS.air, Tm = (T1 + T2) / 2 + 273.15, dT = Math.max(Math.abs(T1 - T2), 0.1);
  var lam = lin(g.lam, Tm), mu = lin(g.mu, Tm), cp = lin(g.cp, Tm), rho = P_ATM * g.M / (R_GAS * Tm);
  var hr = 4 * SIGMA / (1 / e1 + 1 / e2 - 1) * Math.pow(Tm, 3);
  var Gr = G * Math.pow(s_m, 3) * dT * rho * rho / (Tm * mu * mu), Pr = mu * cp / lam, Nu = Math.max(1, 0.035 * Math.pow(Gr * Pr, 0.38));
  return { hs: hr + Nu * lam / s_m, hr: hr, hg: Nu * lam / s_m, Nu: Nu, Tm: Tm };
}
function hiOf(eps) { return 3.6 + 4.4 * eps / EPS_GLASS; }             // EN 673 §5.3 (hi = 3,6 + 4,4·ε/0,837), corrected emissivity of the room face
function solveLinear(M, b) {
  var n = b.length, a = M.map(function (r, i) { return r.concat([b[i]]); });
  for (var c = 0; c < n; c++) {
    var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    var tmp = a[c]; a[c] = a[p]; a[p] = tmp;
    for (r = c + 1; r < n; r++) { var f = a[r][c] / a[c][c]; for (var k = c; k <= n; k++) a[r][k] -= f * a[c][k]; }
  }
  var x = new Array(n);
  for (var i = n - 1; i >= 0; i--) { var s = a[i][n]; for (var j = i + 1; j < n; j++) s -= a[i][j] * x[j]; x[i] = s / a[i][i]; }
  return x;
}
/* blind gap coupling (learning assumption): ventilation of the glass-to-blind gap to the room, W/m²K, by gap width mm */
function blindVent(gap) { return C.interp([30, 50, 100, 150], [1.0, 2.0, 3.0, 3.6], gap); }
var H_BLIND_ROOM = 8;

/* ---------------------------------------------------------------- 4. glass temperatures (Annex A network) */
/* temps({panes, cavities, I, Te, Ti, v, blind:{type,gap_mm}}) -> {theta[], blind, alphaE[], hs[], he, hi, iterations} */
function temps(o, I) {
  var n = o.panes.length, layers = o.panes.map(function (p, i) { return paneOptics(p, i, n); });
  var bl = o.blind && BLINDS[o.blind.type] ? BLINDS[o.blind.type] : null, gap = num(o.blind && o.blind.gap_mm, 100, LIM.gap_mm);
  var optLayers = bl ? layers.concat([{ tau: bl.tau, rf: bl.rho, rb: bl.rho }]) : layers;
  var ab = absorptances(optLayers), aGlass = ab.A.slice(0, n), aBlind = bl ? ab.A[n] : 0;
  var he = 4 + 4 * o.v, hi = hiOf(layers[n - 1].eb);
  var th = []; for (var i = 0; i < n; i++) th.push(10 - i);  // start: Tm ≈ 283 K
  var tb = o.Ti, hs = [], gaps = [], it;
  for (it = 1; it <= 60; it++) {
    gaps = []; for (i = 0; i < n - 1; i++) { var cv = (o.cavities && o.cavities[i]) || {}; gaps.push(gapH(cv.gas || 'air', num(cv.s_mm, 16, LIM.cavity_mm) / 1000, layers[i].eb, layers[i + 1].ef, th[i], th[i + 1])); }
    hs = gaps.map(function (g) { return g.hs; });
    var m = n + (bl ? 1 : 0), M = [], b = [];
    for (i = 0; i < m; i++) { M.push(new Array(m).fill(0)); b.push(0); }
    for (i = 0; i < n; i++) b[i] = I * aGlass[i];
    M[0][0] += he; b[0] += he * o.Te;
    for (i = 0; i < n - 1; i++) { M[i][i] += hs[i]; M[i + 1][i + 1] += hs[i]; M[i][i + 1] -= hs[i]; M[i + 1][i] -= hs[i]; }
    var hrb = 0, hv = 0;
    if (!bl) { M[n - 1][n - 1] += hi; b[n - 1] += hi * o.Ti; }
    else {
      var Tmb = (th[n - 1] + tb) / 2 + 273.15; hrb = 4 * SIGMA / (1 / layers[n - 1].eb + 1 / 0.9 - 1) * Math.pow(Tmb, 3); hv = blindVent(gap);
      M[n - 1][n - 1] += hrb + hv; b[n - 1] += hv * o.Ti; M[n - 1][n] -= hrb; M[n][n - 1] -= hrb; M[n][n] += hrb + H_BLIND_ROOM; b[n] = I * aBlind + H_BLIND_ROOM * o.Ti;
    }
    var x = solveLinear(M, b), d = 0;
    for (i = 0; i < n; i++) { d = Math.max(d, Math.abs(x[i] - th[i])); th[i] = x[i]; }
    if (bl) { d = Math.max(d, Math.abs(x[n] - tb)); tb = x[n]; }
    if (d < 1e-4) break;
  }
  return { theta: th, blind: bl ? tb : null, alphaE: aGlass, alphaBlind: aBlind, tauSys: ab.tau, rhoSys: ab.rho, hs: hs, gaps: gaps, he: he, hi: hi, iterations: it, layers: layers };
}

/* ---------------------------------------------------------------- 5. strength and evaluation */
function strength(glass, edge, o) {
  var km = C.kmod(o.duration_h);
  var base = { glass: glass, surface: 'float', kmod: km, set: 'EN16612', edge: true, edgeFinish: edge };
  var d = C.fgd(Object.assign({}, base, { gammaMA: o.gammaMA, gammaMv: o.gammaMv })), k = C.fgd(Object.assign({}, base, { gammaMA: 1, gammaMv: 1 }));
  return { fd: d.fgd, fk: k.fgd, kmod: km, ke: d.ke, kv: d.kv };
}
function norm(inp) {
  inp = inp || {};
  var o = {};
  Object.keys(DEFAULTS).forEach(function (k) { o[k] = num(inp[k], DEFAULTS[k], LIM[k]); });
  o.set = 'EN16612';
  var panes = Array.isArray(inp.panes) && inp.panes.length ? inp.panes.slice(0, 3) : [{ optic: 'clear', t_mm: 6, glass: 'annealed', edge: 'cut' }];
  o.panes = panes.map(function (p) {
    p = p || {};
    return { optic: OPTICS[p.optic] ? p.optic : 'clear', t_mm: num(p.t_mm, 6, LIM.t_mm), glass: GLASS.indexOf(p.glass) >= 0 ? p.glass : 'annealed', edge: EDGES.indexOf(p.edge) >= 0 ? p.edge : 'cut',
      coat: p.coat === 'front' || p.coat === 'back' ? p.coat : 'auto', tau: p.tau, rho_f: p.rho_f, rho_b: p.rho_b, eps_f: p.eps_f, eps_b: p.eps_b };
  });
  o.cavities = []; for (var i = 0; i < o.panes.length - 1; i++) { var c = (inp.cavities && inp.cavities[i]) || {}; o.cavities.push({ gas: GAS[c.gas] ? c.gas : 'air', s_mm: num(c.s_mm, 16, LIM.cavity_mm) }); }
  var f = inp.frame || {};
  o.frame = { type: FRAMES[f.type] ? f.type : 'light', colour: f.colour === 'dark' ? 'dark' : 'light', cover_mm: num(f.cover_mm, 15, LIM.cover_mm) };
  o.shade = SHADE[inp.shade] != null ? inp.shade : 'none';
  var b = inp.blind || {};
  o.blind = { type: BLINDS[b.type] !== undefined ? b.type : 'none', gap_mm: num(b.gap_mm, 100, LIM.gap_mm) };
  o.extra_K = num(inp.extra_K, 0, LIM.extra_K);
  o.w_m = num(inp.w_m, 1.2, LIM.dim_m); o.h_m = num(inp.h_m, 1.5, LIM.dim_m);
  /* user overrides of the learning-assumption factors */
  var fo = inp.factors || {};
  o.factors = { r: num(fo.r, null, [0, 0.9]), lag_K: num(fo.lag_K, null, [0, 30]), shadeF: num(fo.shadeF, null, [0.5, 2]) };
  return o;
}
function frameFactors(o) {
  var fr = FRAMES[o.frame.type], r = fr.r + (o.frame.colour === 'dark' && o.frame.type !== 'heavy' ? DARK_FRAME_R : 0);
  var lag = fr.lag + Math.min(COVER_MAX_K, COVER_K_PER_MM * Math.max(0, o.frame.cover_mm - COVER_REF_MM));
  if (o.factors.r != null) r = o.factors.r;
  if (o.factors.lag_K != null) lag = o.factors.lag_K;
  var sf = o.factors.shadeF != null && o.shade !== 'none' ? o.factors.shadeF : SHADE[o.shade];
  return { r: r, lag: lag, shadeF: sf };
}
function risk(u, uk) { return uk > 1 ? 'high' : u > 1 ? 'elevated' : u > 0.5 ? 'low' : 'negligible'; }
var RISK_ORDER = ['negligible', 'low', 'elevated', 'high'];

/* evaluate(input) -> {ok, panes[{theta_c, theta_edge, theta_shade, dT_frame, dT_shade, dT, govern, sigma, fd, fk, util, util_k, dTallow_d, dTallow_k, risk}], worst, risk, notes, fixes} */
function evaluate(inp, opts) {
  var o = norm(inp), n = o.panes.length;
  var sun = temps(o, o.I), dark = temps(o, 0), shade = o.shade !== 'none' ? temps(o, o.I * o.diffuse) : null;
  var ff = frameFactors(o), Ea = C.GLASS.E / 1e6 * C.GLASS.alphaT;  // MPa/K
  var panes = o.panes.map(function (p, i) {
    var tc = sun.theta[i], t0 = dark.theta[i];
    var tEdge = t0 + ff.r * (tc - t0) - ff.lag, dTf = tc - tEdge;
    var tSh = shade ? shade.theta[i] : null, dTs = shade ? ff.shadeF * (tc - tSh) : 0;
    var govern = dTs > dTf ? 'shade' : 'frame', dT = Math.max(dTf, dTs, 0) + o.extra_K;
    var st = strength(p.glass, p.edge, o), sigma = Ea * dT * o.k;
    var u = sigma / st.fd, uk = sigma / st.fk;
    return { index: i, glass: p.glass, edge: p.edge, optic: p.optic, t_mm: p.t_mm, alphaE: sun.alphaE[i], theta_c: tc, theta_0: t0, theta_edge: tEdge, theta_shade: tSh,
      dT_frame: dTf, dT_shade: dTs, dT: dT, govern: govern, sigma: sigma, fd: st.fd, fk: st.fk, kmod: st.kmod, ke: st.ke, util: u, util_k: uk,
      dTallow_d: st.fd / (Ea * o.k), dTallow_k: st.fk / (Ea * o.k), risk: risk(u, uk) };
  });
  var worst = panes.reduce(function (a, b) { return b.util > a.util ? b : a; }, panes[0]);
  var notes = [], src = ['s07_risk', 'nbn2_a', 'en410', 'en673', 'iso15099', 'en16612_e', 'nbn2_41', 'la_optic', 'la_edge', 'la_k'];
  notes.push({ key: 'fiv01', src: 's07_risk' });
  panes.forEach(function (p) {
    if (p.glass === 'annealed' && p.alphaE >= 0.45) notes.push({ key: 'absorbing', vars: { pane: p.index, a: p.alphaE * 100 }, src: n > 1 ? 'nbn2_b' : 'nbn3_1' });
    if (p.glass === 'toughened') notes.push({ key: 'heatsoak', vars: { pane: p.index }, src: 's07_soak' });
  });
  var shortSide = Math.min(o.w_m, o.h_m) * 1000, lam = Math.max(o.w_m, o.h_m) / Math.min(o.w_m, o.h_m);
  if (n > 1 && panes.some(function (p) { return p.glass === 'annealed' && p.alphaE >= 0.45; }) && shortSide >= 350 && shortSide <= 700 && lam >= 2 && lam <= 3.5)
    notes.push({ key: 'annexB', vars: { s: shortSide, l: lam }, src: 'nbn2_b' });
  if (o.blind.type !== 'none' && o.blind.gap_mm < 50) notes.push({ key: 'blindgap', vars: { gap: o.blind.gap_mm }, src: 'la_edge' });
  if (src.indexOf('s07_soak') < 0 && notes.some(function (x) { return x.key === 'heatsoak'; })) src.push('s07_soak');
  if (notes.some(function (x) { return x.key === 'absorbing' || x.key === 'annexB'; })) src.push('nbn2_b', 'nbn3_1');
  var res = { ok: true, version: VERSION, input: o, factors: ff, panes: panes, worst: worst.index, risk: worst.risk, util: worst.util, util_k: worst.util_k,
    tauSys: sun.tauSys, gaps: sun.gaps.map(function (g) { return { hs: g.hs, hr: g.hr, hg: g.hg, Nu: g.Nu }; }), he: sun.he, hi: sun.hi, theta_blind: sun.blind,
    iterations: sun.iterations, notes: notes, src: src };
  if (!opts || !opts.noFixes) res.fixes = fixes(o, worst, panes);
  return res;
}
/* "what fixes it": variants applied to every pane over the design limit (or the worst pane), ranked by the resulting worst utilisation */
var LIGHTER = { solar_strong: 'solar', solar: 'lowe', tinted: 'clear' };
function fixes(o, worst, panes) {
  var over = panes.filter(function (p) { return p.util > 1; }).map(function (p) { return p.index; }), out = [];
  if (!over.length) over = [worst.index];
  function variant(id, idx, mut) { var x = JSON.parse(JSON.stringify(o)); idx.forEach(function (i) { mut(x, i); }); var r = evaluate(x, { noFixes: true });
    out.push({ id: id, panes: idx.slice(), util: r.util, util_k: r.util_k, risk: r.risk, dT: r.panes[r.worst].dT }); }
  var ann = over.filter(function (i) { return o.panes[i].glass === 'annealed'; });
  if (ann.length) variant('heat_strengthened', ann, function (x, i) { x.panes[i].glass = 'heat_strengthened'; });
  var pol = ann.filter(function (i) { return o.panes[i].edge !== 'polished'; });
  if (pol.length) variant('polished', pol, function (x, i) { x.panes[i].edge = 'polished'; });
  var nt = over.filter(function (i) { return o.panes[i].glass !== 'toughened'; });
  if (nt.length) variant('toughened', nt, function (x, i) { x.panes[i].glass = 'toughened'; });
  if (o.shade !== 'none') variant('noshade', [0], function (x) { x.shade = 'none'; });
  if (o.blind.type !== 'none' && (o.blind.type !== 'light' || o.blind.gap_mm < 100)) variant('blind', [0], function (x) { x.blind = { type: 'light', gap_mm: Math.max(100, o.blind.gap_mm) }; });
  var lt = over.filter(function (i) { return LIGHTER[o.panes[i].optic]; });
  if (lt.length) variant('lighter', lt, function (x, i) { x.panes[i].optic = LIGHTER[o.panes[i].optic]; });
  if (o.frame.type === 'heavy' || o.frame.cover_mm > 20) variant('frame', [0], function (x) { x.frame = { type: 'light', colour: 'light', cover_mm: 15 }; });
  out.forEach(function (f) { if (['noshade', 'blind', 'frame'].indexOf(f.id) >= 0) f.panes = []; });
  /* ranked by utilisation; when both pass, toughened ranks after every other passing fix (NiS breakage, heat soak — NBN S 23-002:2007 §4.4.1.4;
     heat-strengthened is the usual thermal fix) — R2-REVIEW CR-42 */
  out.forEach(function (f) { if (f.id === 'toughened') f.heatsoak = true; });
  out.sort(function (a, b) {
    var pa = a.util <= 1, pb = b.util <= 1;
    if (pa && pb && (a.id === 'toughened') !== (b.id === 'toughened')) return a.id === 'toughened' ? 1 : -1;
    return a.util - b.util;
  });
  return out;
}

/* ---------------------------------------------------------------- 6. presets (claims checked in _bw/r2/thermal/test.mjs) */
var IGU = function (a, b) { return { panes: [a, b], cavities: [{ gas: 'argon', s_mm: 15 }] }; };
var SOL6 = { optic: 'solar', t_mm: 6, glass: 'annealed', edge: 'cut' }, LOWE4 = { optic: 'lowe', t_mm: 4, glass: 'annealed', edge: 'cut' },
  CL4 = { optic: 'clear', t_mm: 4, glass: 'annealed', edge: 'cut' };
function P(id, base, extra) { return { id: id, input: Object.assign(JSON.parse(JSON.stringify(base)), extra || {}) }; }
var BASE = Object.assign({ w_m: 1.5, h_m: 2.0, frame: { type: 'light', colour: 'light', cover_mm: 15 }, shade: 'none', blind: { type: 'none', gap_mm: 100 } }, IGU(SOL6, LOWE4));
var PRESETS = [
  P('balcony-shade', BASE, { shade: 'strip', blind: { type: 'dark', gap_mm: 30 } }),
  P('balcony-shade-hs', BASE, { shade: 'strip', blind: { type: 'dark', gap_mm: 30 }, panes: [Object.assign({}, SOL6, { glass: 'heat_strengthened' }), Object.assign({}, LOWE4, { glass: 'heat_strengthened' })] }),
  P('open-sun', BASE, { blind: { type: 'light', gap_mm: 100 } }),
  P('clear-lowe-pvc', BASE, { panes: [CL4, LOWE4] }),
  P('heavy-reveal', BASE, { panes: [CL4, LOWE4], frame: { type: 'heavy', colour: 'light', cover_mm: 30 } }),
  P('toughened', BASE, { shade: 'strip', blind: { type: 'dark', gap_mm: 30 }, panes: [Object.assign({}, SOL6, { glass: 'toughened' }), Object.assign({}, LOWE4, { glass: 'toughened' })] }),
  P('tinted-8', { w_m: 1.2, h_m: 1.5, panes: [{ optic: 'tinted', t_mm: 8, glass: 'annealed', edge: 'cut' }], cavities: [], frame: { type: 'metal_tb', colour: 'dark', cover_mm: 15 }, shade: 'edge', blind: { type: 'none', gap_mm: 100 } })
];

return { VERSION: VERSION, SOURCES: SOURCES, GAS: GAS, OPTICS: OPTICS, BLINDS: BLINDS, FRAMES: FRAMES, SHADE: SHADE, DEFAULTS: DEFAULTS, GLASS_TYPES: GLASS, EDGES: EDGES, LIM: LIM,
  RISK_ORDER: RISK_ORDER, PRESETS: PRESETS,
  paneOptics: paneOptics, absorptances: absorptances, gapH: gapH, hiOf: hiOf, temps: temps, strength: strength, norm: norm, frameFactors: frameFactors, evaluate: evaluate };
});
