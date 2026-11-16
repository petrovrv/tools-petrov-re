/* glz-thickness.js — global GlzThickness: engine of the tool `glassthickness` (Glass Thickness for Wind, Snow & Climate Loads)
   of the tools.petrov.re Glazing & Windows package. Part of unit r2-thick: single and laminated panes on 4 / 3 / 2 edges,
   actions (NBN S 23-002-2:2020 §7), combinations and load cases for single glazing in façades (§10.3) and roofs (§10.5 Tab. 41),
   partial and combination factors (§9.3 Tab. 37, §9.4 Tab. 38), criteria (§10.2: ELS deflection, ELU stress), natural frequency
   (§5.5, n1 ≥ 4 Hz as in NBN S 23-002-3 §3.1), façade wind pressures of NBN S 23-002-3:2020 §3.2 / Tab. 2–3 (cp by load area),
   laminated glass by part 2 §4.3 (ω, Tab. 5) or NBN S 23-002-4:2025 §5 (coupling η with Ψp of Tab. 1.a and Gint,d of the
   NBN S 23-002-5:2025 Tab. 1 PVB minimum values), catalogue search for the thinnest passing composition.
   Insulating glass units (0.2.0, unit r2-thick-igu): double / triple, load sharing and gas coupling §4.4–4.5 (eq. (28) linear system),
   isochoric pressure §8.5 eq. (66)–(76) from the Tab. 21 / 29 components, load cases §10.4 (façade) / §10.6 (roof), criterion §10.2.2.
   Plate formulas, fgd, hef, kmod, qp classes come from GlazingCore (glazing-core.js). Short values with clause references only (D-BW-13).
   Pure functions, no DOM. UMD: browser global GlzThickness (needs GlazingCore loaded first), node module.exports.
   Planning aid only — final glazing design by a qualified engineer per the cited NBN / EN. */
(function (root, factory) {
  var core = (root && root.GlazingCore) || (typeof require === 'function' ? require('./glazing-core.js') : null);
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GlzThickness = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C) {
'use strict';

var VERSION = '0.3.0';
var L = C.L;
function isNum(v) { return typeof v === 'number' && isFinite(v); }

/* ---------------------------------------------------------------- 1. sources (norm + clause) */
var N2 = 'NBN S 23-002-2:2020 Vitrerie — Calcul des épaisseurs de verre', N3 = 'NBN S 23-002-3:2020 Vitrerie — Épaisseurs de verre en façade',
  N4 = 'NBN S 23-002-4:2025 Vitrerie — Verre feuilleté, calcul détaillé', N5 = 'NBN S 23-002-5:2025 Vitrerie — Verre feuilleté en façade';
var Src = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var SOURCES = {
  n2_71: Src(N2, '2020', '§7.1.1 Tab. 19 (25 years: cprob 0,96, rsk 0,88), §7.1.2 eq. (63), §7.1.3 eq. (64)'),
  n2_72: Src(N2, '2020', '§7.2 eq. (65) (self-weight 25 kN/m³ × nominal thickness)'),
  n2_9: Src(N2, '2020', '§9.2 (favourable actions), §9.3 Tab. 37 (γQ = γG = 1,10 infill panels; γG,inf 1,0), §9.4 Tab. 38 (ψ0 0,3)'),
  n2_103: Src(N2, '2020', '§10.3 eq. (100)(101) (single glazing, façade)'),
  n2_105: Src(N2, '2020', '§10.5 Tab. 41 (single glazing, roof: load cases 1–4)'),
  n2_102: Src(N2, '2020', '§10.2.1 eq. (96) (ymax = d/125, < 5 mm neglected), §10.2.3 eq. (99) (Ed ≤ fg;d), NOTE 2 (min. 4 mm / 33.x)'),
  n2_422: Src(N2, '2020', '§4.2.2 Tab. 1 (kmod of the dominant variable action in a combination)'),
  n2_55: Src(N2, '2020', '§5.5 eq. (56)(57) (first natural frequency)'),
  n3_31: Src(N3, '2020', '§3.1 (n1 ≥ 4 Hz, non-linear model, ω 0 / 0,2, interlayer 0,38 mm)'),
  n3_32: Src(N3, '2020', '§3.2.1 (cprob 0,96, cpi +0,2/−0,3, load area A, γQ 1,1), §3.2.2 (zones 1/2, e/5), §4 Tab. 2–3 (cp by A)'),
  n4_54: Src(N4, '2025', '§5.2 eq. (1)(2), §5.4.2 eq. (5)–(8), Tab. 1.a (Ψp, uniform load, 4 edges), Tab. 3 (load durations)'),
  n5_t1: Src(N5, '2025', '§4.1 Tab. 1 (minimum Gint,d of PVB by duration and temperature, log-linear between the printed temperatures; glass temperature per pane of the mid-season cyclone: single 11 °C, double 11 / 20,2 °C, triple 10,5 / 21,5 / 22 °C — warmer than the winter cyclone for every pane, so it governs the wind cases), NBN S 23-002-4:2025 §7 / Tab. 3'),
  la_roofcp: Src('Learning assumption: default net pressure coefficients of a glass roof (+0,5 / −1,0); for an insulating unit the net value is split with the façade cpi +0,2 / −0,3 of NBN S 23-002-3 §3.2.1 (outer pane cpe, inner pane −cpi) — take cpe, cpi for your roof from NBN EN 1991-1-4 §7.2 / §7.2.9', 'glz-thickness ' + VERSION, '', 'learning_assumption'),
  la_snow: Src('Learning assumption: snow on an inclined pane acts as s·cos²θ normal to the glass (load per horizontal m², θ slope from horizontal); default sk 0,5 kN/m², μ 0,8 — use NBN EN 1991-1-3 + ANB', 'glz-thickness ' + VERSION, '', 'learning_assumption'),
  la_eta: Src('Learning assumption: part 4 coupling η = 0 for snow and self-weight (no Gint,d for 3 weeks / 25 years in NBN S 23-002-5 Tab. 1); part 4 used for 4-edge panes only', 'glz-thickness ' + VERSION, '', 'learning_assumption')
};

/* ---------------------------------------------------------------- 2. data */
/* NBN S 23-002-3:2020 Tab. 2 / Tab. 3: net cp (cpe − cpi, cpi +0,2/−0,3) at load area 1 m² and 10 m²; log10 interpolation between
   (as printed for 3, 5, 8 m²). e ≥ 5d: zones 1 and 2 use the edge values. */
var CP_FACADE = {
  suction: { zone1: [-1.30, -1.00], zone2: [-1.60, -1.40] },
  pressure: { zone1: [1.30, 1.10], zone2: [1.30, 1.10] }
};
/* NBN S 23-002-4:2025 Tab. 1.a, uniform load, 4 edges simply supported: Ψp·b² (b in mm) by λ = a/b — the printed values follow
   Ψp = c(λ)/b² exactly (b 500…6000 mm, ×10⁶ in the table); b below 500 -> 500, above 6000 -> 6000 (§5.4.2) */
var PSI4 = { lambda: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], c: [1004.5, 260.698, 121.582, 72.6055, 49.9366, 37.653, 30.2676, 25.4866, 22.2163, 19.882] };
/* NBN S 23-002-5:2025 Tab. 1: minimum Gint,d [MPa] of the PVB interlayers the tables assume, by load duration and temperature */
var GINT = { T: [-20, 0, 10, 20, 30], '600s': [90, 50, 4, 0.5, 0.3], '2h': [82, 30, 3, 0.4, 0.3], '6h': [53, 14, 1, 0, 0], '12h': [42, 10, 0.8, 0, 0] };
/* load factors — Tab. 19 / Tab. 37 / Tab. 38 (CC0, infill panels) */
var FACTORS = { cprob: 0.96, rsk: 0.88, gammaQ: 1.1, gammaG: 1.1, gammaGinf: 1.0, psi0: 0.3, selfWeight_Pa_per_mm: 25 };
var MONO = [4, 5, 6, 8, 10, 12, 15, 19, 25];
var LAMI = [3, 4, 5, 6, 8, 10, 12, 15, 19];
var LIM = { side_min: 0.1, side_max: 10, ply_min: 2, ply_max: 25, plies_max: 4, tilt_max: 90 };

var CASE_LABEL = {
  wind_suction: L('wind suction', 'вітрове відсмоктування', 'Windsog', 'windzuiging', 'dépression du vent', 'succión de viento', 'ssanie wiatru'),
  wind_pressure: L('wind pressure', 'вітровий тиск', 'Winddruck', 'winddruk', 'pression du vent', 'presión de viento', 'parcie wiatru'),
  g_wind: L('self-weight + wind', 'власна вага + вітер', 'Eigengewicht + Wind', 'eigen gewicht + wind', 'poids propre + vent', 'peso propio + viento', 'ciężar własny + wiatr'),
  g_snow: L('self-weight + snow', 'власна вага + сніг', 'Eigengewicht + Schnee', 'eigen gewicht + sneeuw', 'poids propre + neige', 'peso propio + nieve', 'ciężar własny + śnieg'),
  g_wind_snow: L('self-weight + wind + snow (accomp.)', 'власна вага + вітер + сніг (супутн.)', 'Eigengewicht + Wind + Schnee (Begleit.)', 'eigen gewicht + wind + sneeuw (begeleidend)', 'poids propre + vent + neige (accomp.)', 'peso propio + viento + nieve (acomp.)', 'ciężar własny + wiatr + śnieg (tow.)'),
  g_snow_wind: L('self-weight + snow + wind (accomp.)', 'власна вага + сніг + вітер (супутн.)', 'Eigengewicht + Schnee + Wind (Begleit.)', 'eigen gewicht + sneeuw + wind (begeleidend)', 'poids propre + neige + vent (accomp.)', 'peso propio + nieve + viento (acomp.)', 'ciężar własny + śnieg + wiatr (tow.)'),
  uplift: L('wind uplift − self-weight', 'підйом вітром − власна вага', 'Windsog − Eigengewicht', 'windzuiging − eigen gewicht', 'soulèvement du vent − poids propre', 'succión de viento − peso propio', 'ssanie wiatru − ciężar własny'),
  g_only: L('self-weight alone (25 years)', 'лише власна вага (25 років)', 'nur Eigengewicht (25 Jahre)', 'alleen eigen gewicht (25 jaar)', 'poids propre seul (25 ans)', 'solo peso propio (25 años)', 'tylko ciężar własny (25 lat)')
};

/* ---------------------------------------------------------------- 3. helpers */
/* cpFacade({geometry 'e_lt_5d'|'e_ge_5d', zone 1|2, A_m2, sign 'suction'|'pressure'}) — NBN S 23-002-3 Tab. 2/3 */
function cpFacade(o) {
  var z = (o.geometry === 'e_ge_5d' || o.zone === 2) ? 'zone2' : 'zone1';
  var v = CP_FACADE[o.sign === 'pressure' ? 'pressure' : 'suction'][z];
  var A = Math.max(1, Math.min(10, o.A_m2 || 1));
  return v[0] + (v[1] - v[0]) * Math.log10(A);
}
/* Gint,d by duration and temperature: log-linear between the printed temperatures (the modulus falls roughly exponentially; linear
   interpolation would overstate it between the points), linear where a printed value is 0, clamped at the ends */
function gint(duration, T) {
  var row = GINT[duration] || GINT['600s'], t = isNum(T) ? T : 11, X = GINT.T;
  if (t <= X[0]) return row[0];
  if (t >= X[X.length - 1]) return row[row.length - 1];
  for (var i = 0; i < X.length - 1; i++) if (t <= X[i + 1]) {
    var u = (t - X[i]) / (X[i + 1] - X[i]), g0 = row[i], g1 = row[i + 1];
    return g0 > 0 && g1 > 0 ? g0 * Math.pow(g1 / g0, u) : g0 + (g1 - g0) * u;
  }
  return row[row.length - 1];
}
/* glass temperature of pane i for the part 4 wind cases — NBN S 23-002-5 Tab. 1, mid-season cyclone (the wind situation with the
   warmest panes); for an insulating unit a user value glassTemp_C can only raise it (conservative), glassTemps_C [outer … inner]
   replaces it per pane */
var PANE_T = { single: [11], double: [11, 20.2], triple: [10.5, 21.5, 22] };
function paneTemp(o, i) {
  var type = o.glazing && (o.glazing.type === 'double' || o.glazing.type === 'triple') ? o.glazing.type : 'single';
  if (Array.isArray(o.glassTemps_C) && isNum(o.glassTemps_C[i])) return o.glassTemps_C[i];
  if (type === 'single') return isNum(o.glassTemp_C) ? o.glassTemp_C : 11;
  var t = PANE_T[type][i];
  return isNum(o.glassTemp_C) ? Math.max(t, o.glassTemp_C) : t;
}
/* Ψp [mm⁻²] for a 4-edge plate a×b (m), NBN S 23-002-4 Tab. 1.a */
function psi4(a_m, b_m) {
  var a = Math.min(a_m, b_m) * 1000, b = Math.max(a_m, b_m) * 1000;
  var bb = Math.max(500, Math.min(6000, b));
  return C.interp(PSI4.lambda, PSI4.c, a / b) / (bb * bb);
}
/* coupling coefficient ηp — NBN S 23-002-4 §5.4.2 eq. (5) (2 plies, GlazingCore.etaP2) and eq. (8) (3 plies, equal G) */
function etaP(plies, inter, G, psi) {
  if (plies.length === 1 || !(G > 0)) return 0;
  if (plies.length === 2) return C.etaP2({ plies: plies, interlayer: inter[0], G: G, psi: psi });
  if (plies.length !== 3) return 0;
  var E = C.GLASS.E / 1e6, nu = C.GLASS.nu, ht = 0, z = 0, d = [];
  plies.forEach(function (h) { ht += h; }); inter.forEach(function (h) { ht += h; });
  plies.forEach(function (h, i) { d.push(ht / 2 - (z + h / 2)); z += h + (i < inter.length ? inter[i] : 0); });
  var s3 = 0, sd = 0;
  plies.forEach(function (h, i) { s3 += h * h * h; sd += h * d[i] * d[i]; });
  var den = (1 - nu * nu) * G * (s3 + 12 * sd) * ((d[0] - d[1]) * (d[0] - d[1]) / inter[0] + (d[1] - d[2]) * (d[1] - d[2]) / inter[1]);
  return 1 / (1 + E * s3 * sd * psi / den);
}
function sum(a) { return (a || []).reduce(function (s, x) { return s + x; }, 0); }
function label(p) {
  var pl = p.plies_mm, il = p.interlayer_mm || [];
  if (pl.length === 1) return String(pl[0]);
  var n = Math.round(il[0] / 0.38);
  return pl.join('') + '.' + (Math.abs(il[0] - n * 0.38) < 0.011 && il.every(function (x) { return Math.abs(x - il[0]) < 1e-9; }) ? n : il.join('/'));
}

/* ---------------------------------------------------------------- 4. normalise input */
/* in: {w_m, h_m, edges 4|3|2, free_side 'w'|'h' (2/3 edges: the unsupported side), tilt_deg (from vertical), place 'auto'|'facade'|'roof',
        pane:{plies_mm, interlayer_mm, glass, surface, process, finish, edgeFinish}, glazing:{type:'single'|'double'|'triple'},
        set 'BE'|'EN16612', laminatedModel 'part2'|'part4', omega (override), Gint_MPa (override), glassTemp_C (11),
        wind:{cls 1..7 | qp_Pa | site:{ze, vb0, roughness} | w_Pa (net 50-yr pressure, both signs), geometry, zone, cp_suction, cp_pressure},
        snow:{sk_kNm2, mu}, factors:{cprob, rsk, gammaQ, gammaG, psi0}} */
function normalise(inp) {
  var errs = [];
  var o = JSON.parse(JSON.stringify(inp || {}));
  ['w_m', 'h_m'].forEach(function (k) { if (!isNum(o[k]) || o[k] < LIM.side_min || o[k] > LIM.side_max) errs.push({ key: 'range', field: k, lo: LIM.side_min, hi: LIM.side_max }); });
  o.edges = o.edges === 2 || o.edges === 3 ? o.edges : 4;
  o.free_side = o.free_side === 'h' ? 'h' : 'w';
  o.tilt_deg = isNum(o.tilt_deg) ? o.tilt_deg : 0;
  if (o.tilt_deg < 0 || o.tilt_deg > LIM.tilt_max) errs.push({ key: 'range', field: 'tilt_deg', lo: 0, hi: LIM.tilt_max });
  var p = o.pane || {};
  if (!Array.isArray(p.plies_mm) || !p.plies_mm.length || p.plies_mm.length > LIM.plies_max || p.plies_mm.some(function (h) { return !isNum(h) || h < LIM.ply_min || h > LIM.ply_max; })) errs.push({ key: 'plies', field: 'pane.plies_mm' });
  p.interlayer_mm = Array.isArray(p.interlayer_mm) ? p.interlayer_mm : [];
  if (p.plies_mm && p.plies_mm.length > 1 && (p.interlayer_mm.length !== p.plies_mm.length - 1 || p.interlayer_mm.some(function (h) { return !isNum(h) || h <= 0 || h > 5; }))) errs.push({ key: 'interlayers', field: 'pane.interlayer_mm' });
  p.glass = ['annealed', 'heat_strengthened', 'toughened', 'chemically'].indexOf(p.glass) >= 0 ? p.glass : (p.glass === 'float' ? 'annealed' : 'annealed');
  p.surface = p.surface || 'float';
  o.pane = p;
  o.set = o.set === 'EN16612' ? 'EN16612' : 'BE';
  o.laminatedModel = o.laminatedModel === 'part4' ? 'part4' : 'part2';
  o.place = o.place === 'facade' || o.place === 'roof' ? o.place : (o.tilt_deg > 15 ? 'roof' : 'facade');
  var f = o.factors || {};
  o.factors = {};
  Object.keys(FACTORS).forEach(function (k) { o.factors[k] = isNum(f[k]) ? f[k] : FACTORS[k]; });
  o.wind = o.wind || {};
  o.snow = o.snow || {};
  return { o: o, errors: errs };
}

/* wind basis: {qp_Pa, cls, source, warnings} — class qp of NBN S 23-002-3 Tab. 1 (cls or site), or a given qp, or a given net pressure */
function windBasis(w) {
  var out = { warnings: [] };
  if (isNum(w.w_Pa)) { out.w_net = Math.abs(w.w_Pa); out.mode = 'net'; return out; }
  if (isNum(w.qp_Pa)) { out.qp_Pa = w.qp_Pa; out.cls = C.glassClassFromQp(w.qp_Pa); out.mode = 'qp'; return out; }
  if (w.site) {
    var r = C.glassExposure(w.site);
    if (r.ok) { out.qp_Pa = r.qp_Pa; out.cls = r.cls; out.mode = 'site'; if (r.roughness_analysis || r.starred) out.warnings.push('roughness_analysis'); return out; }
    out.qp_Pa = C.qp(w.site.ze, w.site.vb0, w.site.roughness); out.cls = null; out.mode = 'site_qp'; out.warnings.push('site_off_table:' + r.reason); return out;
  }
  var cls = isNum(w.cls) ? Math.max(1, Math.min(7, Math.round(w.cls))) : 4;
  out.qp_Pa = C.GLASS_CLASS_QP[cls - 1]; out.cls = cls; out.mode = 'class';
  return out;
}

/* ---------------------------------------------------------------- 5. pane response */
function geometry(o) {
  var a = Math.min(o.w_m, o.h_m), b = Math.max(o.w_m, o.h_m);
  var L = o.free_side === 'h' ? o.h_m : o.w_m, other = o.free_side === 'h' ? o.w_m : o.h_m;
  return { a: a, b: b, L: L, other: other, A: o.w_m * o.h_m, d: o.edges === 4 ? a : L, span: L === a ? 'a' : 'b' };
}
/* effective thicknesses of the pane for one action ('wind' | 'snow' | 'self_weight') */
function thickness(o, p, action, g, paneIdx) {
  var plies = p.plies_mm, inter = p.interlayer_mm;
  if (plies.length === 1) return { hw: plies[0], hs: plies[0], model: 'monolithic' };
  var part4 = o.laminatedModel === 'part4' && o.edges === 4;
  if (part4) {
    /* η only for wind (600 s); an explicit Gint_MPa replaces the 600 s value and is never applied to snow / self-weight */
    var T = paneTemp(o, paneIdx || 0);
    var G = action === 'wind' ? (isNum(o.Gint_MPa) ? o.Gint_MPa : gint('600s', T)) : 0;
    var eta = action === 'wind' ? etaP(plies, inter, G, psi4(g.a, g.b)) : 0;
    var r4 = C.hefPart4({ plies: plies, interlayers: inter, eta: eta });
    return { hw: r4.hef_w, hs: r4.hef_sigma, model: 'part4', eta: eta, G: G, T_C: action === 'wind' ? T : null };
  }
  var om = isNum(o.omega) ? o.omega : C.omegaFor(action, o.place === 'roof' ? 'roof' : 'facade');
  var r2 = C.hef({ plies: plies, interlayers: inter, omega: om });
  return { hw: r2.hef_w, hs: r2.hef_sigma, model: 'part2', omega: om };
}
/* first natural frequency, NBN S 23-002-2 §5.5.2 eq. (56)(57): as GlazingCore.freq1 (ω 0,65 = §5.5.2) but with the laminated
   stiffness of a chosen ω, or of the wind design case (freqOmega 'design' — the basis the NBN S 23-002-3 / -5 tables were computed on) */
function freqPane(o, p, g, thWind) {
  var fo = o.freqOmega;
  if ((fo == null || fo === 0.65) || p.plies_mm.length === 1) return C.freq1({ a_m: g.a, b_m: g.b, edges: o.edges, span: g.span, panes: [{ plies: p.plies_mm, interlayers: p.interlayer_mm }] });
  var hw = fo === 'design' ? thWind.hw : C.hef({ plies: p.plies_mm, interlayers: p.interlayer_mm, omega: fo }).hef_w;
  var base = C.freq1({ a_m: g.a, b_m: g.b, edges: o.edges, span: g.span, panes: [{ plies: p.plies_mm, interlayers: p.interlayer_mm }] });
  /* n1 ∝ h·sqrt(1/ρ) with ρ = mass/h -> n1 ∝ h^1.5 at equal mass */
  var n1 = base.n1_Hz * Math.pow(hw / base.h_mm, 1.5);
  return { n1_Hz: n1, h_mm: hw, rho: base.rho * base.h_mm / hw, omega_i: base.omega_i, omega_j: base.omega_j, ok: n1 >= 4, limit_Hz: 4, source: base.source, freqOmega: fo };
}
function respond(o, g, th, F) {
  if (o.edges === 4) return C.plate4({ a_m: g.a, b_m: g.b, h_sigma_mm: th.hs, h_w_mm: th.hw, p_Pa: F, linear: !!o.linear });
  if (o.edges === 3) return C.plate3({ span_m: g.L, other_m: g.other, h_sigma_mm: th.hs, h_w_mm: th.hw, p_Pa: F });
  return C.plate2({ span_m: g.L, h_sigma_mm: th.hs, h_w_mm: th.hw, p_Pa: F });
}

/* ---------------------------------------------------------------- 6. load cases */
/* each case: {id, dominant ('wind'|'snow'|'self_weight'), uls Pa, sls Pa (normal to the glass, absolute), actions [...] } */
function loadCases(o, p, g) {
  var f = o.factors, cp2 = f.cprob * f.cprob, wb = windBasis(o.wind), cases = [];
  var wn = function (sign) {
    if (wb.mode === 'net') return wb.w_net;
    var cp = sign === 'pressure' ? (isNum(o.wind.cp_pressure) ? o.wind.cp_pressure : (o.place === 'roof' ? 0.5 : cpFacade({ geometry: o.wind.geometry, zone: o.wind.zone, A_m2: g.A, sign: 'pressure' })))
      : (isNum(o.wind.cp_suction) ? o.wind.cp_suction : (o.place === 'roof' ? -1.0 : cpFacade({ geometry: o.wind.geometry, zone: o.wind.zone, A_m2: g.A, sign: 'suction' })));
    return Math.abs(cp) * wb.qp_Pa;
  };
  var ws = wn('suction'), wp = wn('pressure');
  if (o.place === 'facade') {
    cases.push({ id: 'wind_suction', dominant: 'wind', uls: f.gammaQ * cp2 * ws, sls: cp2 * ws, w50: ws, src: 'n2_103' });
    cases.push({ id: 'wind_pressure', dominant: 'wind', uls: f.gammaQ * cp2 * wp, sls: cp2 * wp, w50: wp, src: 'n2_103' });
  } else {
    var th = (90 - o.tilt_deg) * Math.PI / 180, ct = Math.cos(th);
    var gk = f.selfWeight_Pa_per_mm * sum(p.plies_mm) * ct;
    var sk = (isNum(o.snow.sk_kNm2) ? o.snow.sk_kNm2 : 0.5) * 1000, mu = isNum(o.snow.mu) ? o.snow.mu : 0.8;
    var s = f.rsk * mu * sk * ct * ct, W = cp2 * wp;
    var uplift = cp2 * ws;
    cases.push({ id: 'g_wind', dominant: 'wind', uls: f.gammaG * gk + f.gammaQ * W, sls: gk + W, src: 'n2_105' });
    cases.push({ id: 'g_snow', dominant: 'snow', uls: f.gammaG * gk + f.gammaQ * s, sls: gk + s, src: 'n2_105' });
    cases.push({ id: 'g_wind_snow', dominant: 'wind', uls: f.gammaG * gk + f.gammaQ * W + f.psi0 * f.gammaQ * s, sls: gk + W + f.psi0 * s, src: 'n2_105' });
    cases.push({ id: 'g_snow_wind', dominant: 'snow', uls: f.gammaG * gk + f.gammaQ * s + f.psi0 * f.gammaQ * W, sls: gk + s + f.psi0 * W, src: 'n2_105' });
    cases.push({ id: 'uplift', dominant: 'wind', uls: Math.max(0, f.gammaQ * uplift - f.gammaGinf * gk), sls: Math.max(0, uplift - gk), src: 'n2_9' });
    cases.push({ id: 'g_only', dominant: 'self_weight', uls: f.gammaG * gk, sls: gk, src: 'n2_422' });
    cases.forEach(function (c) { c.gk = gk; c.s = s; c.w = W; });
  }
  return { cases: cases, wind: wb, w_suction: ws, w_pressure: wp };
}

/* ---------------------------------------------------------------- 7. check one composition */
function checkPane(o, p, g, lc) {
  var ymaxCrit = g.d * 1000 / 125;
  var out = lc.cases.map(function (c) {
    var actionKey = c.dominant;
    var th = thickness(o, p, actionKey === 'wind' ? 'wind' : (actionKey === 'snow' ? 'snow' : 'self_weight'), g);
    var kmod = o.set === 'EN16612' ? C.kmodFor(c.id === 'g_only' ? 'self_weight' : (c.id.indexOf('snow') >= 0 && c.id !== 'g_snow' ? ['wind', 'snow'] : c.dominant), 'EN16612') : C.kmodFor(c.dominant, 'BE');
    var fg = C.fgd({ glass: p.glass, surface: p.surface, process: p.process, finish: p.finish, kmod: kmod, set: o.set, edge: true, edgeFinish: p.edgeFinish });
    var ru = respond(o, g, th, c.uls), rs = respond(o, g, th, c.sls);
    var r = { id: c.id, dominant: c.dominant, F_uls_Pa: c.uls, F_sls_Pa: c.sls, kmod: kmod, fgd_MPa: fg.fgd, model: th.model, hef_w_mm: th.hw, hef_sigma_mm: th.hs, omega: th.omega, eta: th.eta, G_MPa: th.G, T_C: th.T_C, src: c.src };
    if (!ru.ok || !rs.ok) { r.ok = false; r.reason = ru.reason || rs.reason; r.util = Infinity; return r; }
    r.sigma_MPa = ru.sigma_MPa; r.w_mm = rs.w_mm; r.pstar = ru.pstar;
    r.util_uls = ru.sigma_MPa / fg.fgd;
    r.ymax_mm = ymaxCrit; r.deflection_neglected = rs.w_mm < 5;
    r.util_sls = r.deflection_neglected ? 0 : rs.w_mm / ymaxCrit;
    r.util = Math.max(r.util_uls, r.util_sls);
    r.ok = r.util <= 1 + 1e-9;
    return r;
  });
  var fr = freqPane(o, p, g, thickness(o, p, 'wind', g));
  var gov = out.reduce(function (m, r) { return !m || r.util > m.util ? r : m; }, null);
  var minOk = p.plies_mm.length === 1 ? p.plies_mm[0] >= 4 : p.plies_mm.every(function (h) { return h >= 3; });
  return { label: label(p), cases: out, governing: gov ? gov.id : null, util: gov ? gov.util : 0, freq: fr, minThicknessOk: minOk,
    ok: out.every(function (r) { return r.ok; }) && fr.ok && minOk };
}

/* catalogue of the same family (monolithic / 2-ply laminated with the same interlayer), thinnest first */
function catalogue(p) {
  if (p.plies_mm.length === 1) return MONO.map(function (h) { return { plies_mm: [h], interlayer_mm: [], glass: p.glass, surface: p.surface, process: p.process, finish: p.finish, edgeFinish: p.edgeFinish }; });
  if (p.plies_mm.length === 2) return LAMI.map(function (h) { return { plies_mm: [h, h], interlayer_mm: p.interlayer_mm.slice(), glass: p.glass, surface: p.surface, process: p.process, finish: p.finish, edgeFinish: p.edgeFinish }; });
  return [];
}

/* ---------------------------------------------------------------- 8. insulating glass units (unit r2-thick-igu) */
/* NBN S 23-002-2:2020 §8.5: isochoric pressure components. Tab. 20 reference parameters → Tab. 21 (double, cavity 16 mm, Ug 1,05) and
   Tab. 29 (triple, 2 × 12 mm, Ug 0,85): pC0,T = cT·(Tcavity − Tp) for Tp 18…23 °C, pC0,P = Pp − P, pH,0 = cH·(H − Hp) (reference ±150 m).
   Stored as the two printed pC0,T values per situation and cavity [Pa]; the combinations (69)–(76) are evaluated here (they give Tab. 22–24, 32). */
var P0_REF = {
  cH: 12, cT: 340, dH_m: 150, psiT: 0.3, psiP: 0.3,
  P: { mid: [0, 5000], anti: [-5000, 0], cyc_w: [0, 5000] },
  T: { double: { mid: [[-2720, -1020]], anti: [[-4420, -6120]], cyc_w: [[-2890, -4590]] },
       triple: { mid: [[-2550, -850], [-1020, 680]], anti: [[-7400, -5700], [-3540, -1840]], cyc_w: [[-5525, -3825], [-2805, -1105]] } },
  cavity_ref_mm: { double: 16, triple: 12 }
};
var IGU_LABEL = {
  igu_wind_suction: L('wind suction + cavity pressure', 'відсмоктування + тиск у камері', 'Windsog + Scheibenzwischenraumdruck', 'windzuiging + spouwdruk', 'dépression du vent + pression interne', 'succión de viento + presión de cámara', 'ssanie wiatru + ciśnienie w komorze'),
  igu_wind_pressure: L('wind pressure + cavity pressure', 'вітровий тиск + тиск у камері', 'Winddruck + Scheibenzwischenraumdruck', 'winddruk + spouwdruk', 'pression du vent + pression interne', 'presión de viento + presión de cámara', 'parcie wiatru + ciśnienie w komorze'),
  igu_anticyclone: L('climatic load alone (winter anticyclone)', 'кліматичне навантаження (зимовий антициклон)', 'Klimalast allein (Winterhoch)', 'klimaatbelasting alleen (winteranticycloon)', 'charge climatique seule (anticyclone hivernal)', 'carga climática sola (anticiclón invernal)', 'obciążenie klimatyczne (wyż zimowy)'),
  igu_g_wind: L('self-weight + wind + cavity pressure', 'власна вага + вітер + тиск у камері', 'Eigengewicht + Wind + Innendruck', 'eigen gewicht + wind + spouwdruk', 'poids propre + vent + pression interne', 'peso propio + viento + presión de cámara', 'ciężar własny + wiatr + ciśnienie w komorze'),
  igu_uplift: L('wind uplift − self-weight + cavity pressure', 'підйом вітром − власна вага + тиск у камері', 'Windsog − Eigengewicht + Innendruck', 'windzuiging − eigen gewicht + spouwdruk', 'soulèvement − poids propre + pression interne', 'succión − peso propio + presión de cámara', 'ssanie − ciężar własny + ciśnienie w komorze'),
  igu_g_snow: L('self-weight + snow + cavity pressure', 'власна вага + сніг + тиск у камері', 'Eigengewicht + Schnee + Innendruck', 'eigen gewicht + sneeuw + spouwdruk', 'poids propre + neige + pression interne', 'peso propio + nieve + presión de cámara', 'ciężar własny + śnieg + ciśnienie w komorze'),
  igu_g_wind_snow: L('self-weight + wind + snow (accomp.) + cavity pressure', 'власна вага + вітер + сніг (супутн.) + тиск', 'Eigengewicht + Wind + Schnee (Begleit.) + Innendruck', 'eigen gewicht + wind + sneeuw (begel.) + spouwdruk', 'poids propre + vent + neige (acc.) + pression interne', 'peso propio + viento + nieve (acomp.) + presión', 'ciężar własny + wiatr + śnieg (tow.) + ciśnienie'),
  igu_g_snow_wind: L('self-weight + snow + wind (accomp.) + cavity pressure', 'власна вага + сніг + вітер (супутн.) + тиск', 'Eigengewicht + Schnee + Wind (Begleit.) + Innendruck', 'eigen gewicht + sneeuw + wind (begel.) + spouwdruk', 'poids propre + neige + vent (acc.) + pression interne', 'peso propio + nieve + viento (acomp.) + presión', 'ciężar własny + śnieg + wiatr (tow.) + ciśnienie'),
  igu_g_anticyclone: L('self-weight + climatic load (anticyclone) + snow', 'власна вага + кліматичне (антициклон) + сніг', 'Eigengewicht + Klimalast (Hoch) + Schnee', 'eigen gewicht + klimaatbelasting (anticycloon) + sneeuw', 'poids propre + charge climatique (anticyclone) + neige', 'peso propio + carga climática (anticiclón) + nieve', 'ciężar własny + klimat (wyż) + śnieg'),
  igu_g_only: L('self-weight alone (25 years)', 'лише власна вага (25 років)', 'nur Eigengewicht (25 Jahre)', 'alleen eigen gewicht (25 jaar)', 'poids propre seul (25 ans)', 'solo peso propio (25 años)', 'tylko ciężar własny (25 lat)')
};
Object.keys(IGU_LABEL).forEach(function (k) { CASE_LABEL[k] = IGU_LABEL[k]; });
SOURCES.n2_44 = Src(N2, '2020', '§4.4.1 eq. (5)–(11), Tab. 7 (load sharing), Tab. 8 (k5), §4.4.2 eq. (12)–(19) (Δd = φ·p0)');
SOURCES.n2_45 = Src(N2, '2020', '§4.5.1–4.5.4 Tab. 9–11, eq. (20)–(28) (triple: load sharing, cavity factors φk, αk, β)');
SOURCES.n2_85 = Src(N2, '2020', '§8.5 eq. (66)–(76), Tab. 20, Tab. 21 / 29 (components), Tab. 22–24 / 30–32 (extreme P0)');
SOURCES.n2_104 = Src(N2, '2020', '§10.4 eq. (102)–(105), Tab. 39 / 40 (IGU façade: wind + Δd accompanying, anticyclone alone), §8.5.2.1 (2/3 edges: Δd on the 4-edge model, summed)');
SOURCES.n2_106 = Src(N2, '2020', '§10.6.1 combinations 1–5, Tab. 42 / 43 (IGU roof)');
SOURCES.n2_1022 = Src(N2, '2020', '§10.2.2 eq. (97)(98) (IGU: ymax = 15·10⁻⁷·d² + 0,0025·d + 2,5 mm, 2/3 edges ≤ 25 mm, < 5 mm neglected)');
SOURCES.n2_6 = Src(N2, '2020', '§6 eq. (61), Tab. 18 (edge-seal line load qs = Δd·a·k6, information)');
SOURCES.la_igu_net = Src('Learning assumption: a given net wind pressure (w_Pa) acts on the outer pane only; with class / qp / site the cpi share (+0,2 / −0,3 of NBN S 23-002-3 §3.2.1) acts on the inner pane as in Tab. 39', 'glz-thickness ' + VERSION, '', 'learning_assumption');

/* k5 — eq. (11) with z1 of §5.2.3 (Tab. 8) */
function k5(lambda) {
  var l = Math.max(0.1, Math.min(1, lambda)), r = 1 / l - 1, nu = C.GLASS.nu;
  var z1 = 192 * (1 - nu * nu) * l * l * (0.00406 + 0.00896 * (1 - Math.exp(-1.123 * Math.pow(r, 1.097))));
  return z1 / (16 * l * l) * (0.4198 + 0.22 * Math.exp(-6.8 * Math.pow(l, 1.33)));
}
/* φ of a double unit — eq. (9)(10): φ = 1/(1 + (a/a*)⁴), a* = 28,9·(sc·h1³·h2³/((h1³+h2³)·k5))^0,25 (mm) */
function phiDouble(a_m, b_m, h1, h2, sc_mm) {
  var a = Math.min(a_m, b_m) * 1000, lam = Math.min(a_m, b_m) / Math.max(a_m, b_m);
  var as = 28.9 * Math.pow(sc_mm * h1 * h1 * h1 * h2 * h2 * h2 / ((h1 * h1 * h1 + h2 * h2 * h2) * k5(lam)), 0.25);
  return { phi: 1 / (1 + Math.pow(a / as, 4)), a_star_mm: as, k5: k5(lam) };
}
/* gas coupling — eq. (28): vp,i = k5·λ²·A³/(hi³·E) volume change per unit pressure of pane i, αk = vp,k·Pa/Vk, αk+ = vp,k+1·Pa/Vk (Pa 101 325);
   Δk = p0,k + αk·Fd,k − αk+·Fd,k+1 with Fd,1 = F1 − Δ1, Fd,i = Fi + Δi−1 − Δi, Fd,n = Fn + Δn−1 (sign: + towards the inside).
   Solving this linear system is §4.4.1.2 Tab. 7 / eq. (12)–(19) (double) and §4.5 Tab. 9–11 (triple). h in mm (hef;w for laminated). */
function coupling(a_m, b_m, h, cav_mm) {
  /* double units: Pa such that α + α⁺ = (a/a*)⁴ with the printed constant 28,9 of eq. (10) (= (E/Pa)^¼ rounded; 101 325 Pa gives 28,83) */
  var a = Math.min(a_m, b_m), b = Math.max(a_m, b_m), lam = a / b, A = a * b, E = C.GLASS.E, Pa = h.length === 2 ? E / Math.pow(28.9, 4) : 101325, kk = k5(lam);
  var v = h.map(function (hi) { return kk * lam * lam * A * A * A / (Math.pow(hi / 1000, 3) * E); });
  var al = [], alp = [];
  cav_mm.forEach(function (s, k) { var V = A * s / 1000; al.push(v[k] * Pa / V); alp.push(v[k + 1] * Pa / V); });
  return { v: v, alpha: al, alphaPlus: alp, k5: kk, lambda: lam };
}
function solveIgu(cp, F, p0) {
  var n = F.length, al = cp.alpha, ap = cp.alphaPlus, D;
  if (n === 2) D = [(p0[0] + al[0] * F[0] - ap[0] * F[1]) / (1 + al[0] + ap[0])];
  else {
    var a11 = 1 + al[0] + ap[0], a12 = -ap[0], a21 = -al[1], a22 = 1 + al[1] + ap[1];
    var r1 = p0[0] + al[0] * F[0] - ap[0] * F[1], r2 = p0[1] + al[1] * F[1] - ap[1] * F[2], det = a11 * a22 - a12 * a21;
    D = [(r1 * a22 - a12 * r2) / det, (a11 * r2 - a21 * r1) / det];
  }
  var Fd = F.map(function (f, i) { return f + (i > 0 ? D[i - 1] : 0) - (i < n - 1 ? D[i] : 0); });
  return { delta: D, Fd: Fd };
}
/* δi — eq. (5) / (20) */
function deltas(h) { var s = sum(h.map(function (x) { return x * x * x; })); return h.map(function (x) { return x * x * x / s; }); }

/* extreme isochoric pressures per cavity — eq. (69)–(76) with the components of Tab. 21 / 29 (or a given altitude difference) and §9.2
   (a favourable variable component is dropped). mode 'd' dominant | 'a' accompanying; ls 'S' | 'U'; situations: list of 'mid'|'anti'|'cyc_w'.
   igu: {dH_m (± altitude difference, default 150) | site_alt_m + prod_alt_m (one signed value), p0_scale (× pC0 = pC0,T + pC0,P, Tab. 21 / 29
   footnote ± 10 %, clamped 0,9–1,1), no_climate (internal: no isochoric pressure, for the climate-share run)}
   -> [{max, min} per cavity] (max over the situations of the maxima, min of the minima) */
function p0Extremes(type, igu, mode, ls, situations, f) {
  var R = P0_REF, nc = type === 'triple' ? 2 : 1, out = [];
  igu = igu || {};
  var scale = igu.no_climate ? 0 : (isNum(igu.p0_scale) ? igu.p0_scale : 1);
  var hMax, hMin;
  if (isNum(igu.site_alt_m) && isNum(igu.prod_alt_m)) { hMax = hMin = R.cH * (igu.site_alt_m - igu.prod_alt_m); }
  else { var dH = isNum(igu.dH_m) ? Math.abs(igu.dH_m) : R.dH_m; hMax = R.cH * dH; hMin = -R.cH * dH; }
  var gG = ls === 'U' ? f.gammaG : 1, gQ = ls === 'U' ? f.gammaQ : 1;
  for (var k = 0; k < nc; k++) {
    var mx = -Infinity, mn = Infinity;
    situations.forEach(function (s) {
      var T = R.T[type][s][k].map(function (x) { return x * scale; }), P = R.P[s].map(function (x) { return x * scale; });
      var Tp = Math.max(0, T[0], T[1]), Pp = Math.max(0, P[0], P[1]);
      var Tn = Math.min(0, T[0], T[1]), Pn = Math.min(0, P[0], P[1]);
      var vp, vn;
      if (mode === 'd') { vp = gQ * Math.max(Tp + R.psiP * Pp, Pp + R.psiT * Tp); vn = gQ * Math.min(Tn + R.psiP * Pn, Pn + R.psiT * Tn); }
      else { vp = gQ * (R.psiP * Pp + R.psiT * Tp); vn = gQ * (R.psiP * Pn + R.psiT * Tn); }
      /* permanent pH,0: γG when unfavourable for the extreme sought, γG,inf = 1 when favourable (§9.2) */
      mx = Math.max(mx, (hMax > 0 ? gG : 1) * hMax + vp); mn = Math.min(mn, (hMin < 0 ? gG : 1) * hMin + vn);
    });
    out.push({ max: mx, min: mn });
  }
  return out;
}

function iguNormalise(o, errs) {
  var gl = o.glazing, n = gl.type === 'triple' ? 3 : 2;
  if (!Array.isArray(gl.panes) || gl.panes.length !== n) { errs.push({ key: 'panes_count', field: 'glazing.panes', n: n }); return; }
  gl.panes = gl.panes.map(function (p, i) {
    p = p || {};
    if (!Array.isArray(p.plies_mm) || !p.plies_mm.length || p.plies_mm.length > LIM.plies_max || p.plies_mm.some(function (h) { return !isNum(h) || h < LIM.ply_min || h > LIM.ply_max; })) errs.push({ key: 'plies', field: 'glazing.panes[' + i + '].plies_mm' });
    p.interlayer_mm = Array.isArray(p.interlayer_mm) ? p.interlayer_mm : [];
    if (p.plies_mm && p.plies_mm.length > 1 && (p.interlayer_mm.length !== p.plies_mm.length - 1 || p.interlayer_mm.some(function (h) { return !isNum(h) || h <= 0 || h > 5; }))) errs.push({ key: 'interlayers', field: 'glazing.panes[' + i + '].interlayer_mm' });
    p.glass = ['annealed', 'heat_strengthened', 'toughened', 'chemically'].indexOf(p.glass) >= 0 ? p.glass : 'annealed';
    p.surface = p.surface || 'float';
    return p;
  });
  var cav = Array.isArray(gl.cavity_mm) ? gl.cavity_mm.slice() : [];
  while (cav.length < n - 1) cav.push(P0_REF.cavity_ref_mm[gl.type]);
  cav = cav.slice(0, n - 1);
  if (cav.some(function (s) { return !isNum(s) || s < 4 || s > 40; })) errs.push({ key: 'range', field: 'glazing.cavity_mm', lo: 4, hi: 40 });
  gl.cavity_mm = cav;
  gl.igu = gl.igu || {};
  if (isNum(gl.igu.p0_scale) && (gl.igu.p0_scale < 0.9 || gl.igu.p0_scale > 1.1)) { gl.igu.p0_scale = Math.max(0.9, Math.min(1.1, gl.igu.p0_scale)); gl.igu.p0_clamped = true; }
  delete gl.igu.no_climate;
}

/* IGU load cases: external loads per pane [outer … inner] (signed, + towards the inside), p0 situations, dominant action */
function iguCases(o, g) {
  var f = o.factors, cp2 = f.cprob * f.cprob, wb = windBasis(o.wind), n = o.glazing.panes.length, gl = o.glazing, cases = [];
  var cpi = { suction: 0.2, pressure: -0.3 };
  var split = function (sign) {   /* [outer, inner] 50-year external pressures, signed */
    if (wb.mode === 'net') return sign === 'pressure' ? [wb.w_net, 0] : [-wb.w_net, 0];
    var net = sign === 'pressure' ? (isNum(o.wind.cp_pressure) ? o.wind.cp_pressure : (o.place === 'roof' ? 0.5 : cpFacade({ geometry: o.wind.geometry, zone: o.wind.zone, A_m2: g.A, sign: 'pressure' })))
      : (isNum(o.wind.cp_suction) ? o.wind.cp_suction : (o.place === 'roof' ? -1.0 : cpFacade({ geometry: o.wind.geometry, zone: o.wind.zone, A_m2: g.A, sign: 'suction' })));
    net = sign === 'pressure' ? Math.abs(net) : -Math.abs(net);
    var ci = cpi[sign];   /* net = cpe − cpi ; outer gets cpe, inner −cpi (Tab. 39) */
    return [(net + ci) * wb.qp_Pa, -ci * wb.qp_Pa];
  };
  var vec = function (outer, inner, mid) { var v = [outer]; if (n === 3) v.push(mid || 0); v.push(inner); return v; };
  var Ws = split('suction'), Wp = split('pressure');
  var add = function (id, dominant, uls, sls, sit, mode, src) { cases.push({ id: id, dominant: dominant, uls: uls, sls: sls, p0sit: sit, p0mode: mode, src: src }); };
  var sc = function (v, k) { return v.map(function (x) { return x * k; }); };
  var plus = function () { var a = arguments, r = a[0].slice(); for (var j = 1; j < a.length; j++) r = r.map(function (x, i) { return x + a[j][i]; }); return r; };
  if (o.place === 'facade') {
    add('igu_wind_suction', 'wind', sc(vec(Ws[0], Ws[1]), f.gammaQ * cp2), sc(vec(Ws[0], Ws[1]), cp2), ['mid', 'cyc_w'], 'a', 'n2_104');
    add('igu_wind_pressure', 'wind', sc(vec(Wp[0], Wp[1]), f.gammaQ * cp2), sc(vec(Wp[0], Wp[1]), cp2), ['mid', 'cyc_w'], 'a', 'n2_104');
    add('igu_anticyclone', 'igu_pressure', vec(0, 0), vec(0, 0), ['anti'], 'd', 'n2_104');
  } else {
    var th = (90 - o.tilt_deg) * Math.PI / 180, ct = Math.cos(th);
    var G = gl.panes.map(function (p) { return f.selfWeight_Pa_per_mm * sum(p.plies_mm) * ct; });
    var sk = (isNum(o.snow.sk_kNm2) ? o.snow.sk_kNm2 : 0.5) * 1000, mu = isNum(o.snow.mu) ? o.snow.mu : 0.8;
    var s = f.rsk * mu * sk * ct * ct, S = vec(s, 0), W = sc(vec(Wp[0], Wp[1]), cp2), U = sc(vec(Ws[0], Ws[1]), cp2);
    var gU = sc(G, f.gammaG), gQ = f.gammaQ, ps = f.psi0;
    add('igu_g_wind', 'wind', plus(gU, sc(W, gQ)), plus(G, W), ['mid', 'cyc_w'], 'a', 'n2_106');
    add('igu_uplift', 'wind', plus(sc(G, f.gammaGinf), sc(U, gQ)), plus(G, U), ['mid', 'cyc_w'], 'a', 'n2_106');
    add('igu_g_snow', 'snow', plus(gU, sc(S, gQ)), plus(G, S), ['anti', 'cyc_w'], 'a', 'n2_106');
    add('igu_g_wind_snow', 'wind', plus(gU, sc(W, gQ), sc(S, ps * gQ)), plus(G, W, sc(S, ps)), ['cyc_w'], 'a', 'n2_106');
    add('igu_g_snow_wind', 'snow', plus(gU, sc(S, gQ), sc(W, ps * gQ)), plus(G, S, sc(W, ps)), ['cyc_w'], 'a', 'n2_106');
    add('igu_g_anticyclone', 'igu_pressure', plus(gU, sc(S, ps * gQ)), plus(G, sc(S, ps)), ['anti'], 'd', 'n2_106');
    add('igu_g_only', 'self_weight', gU, G, [], null, 'n2_422');
  }
  return { cases: cases, wind: wb, w_suction: Math.abs(Ws[0] + Ws[1]), w_pressure: Math.abs(Wp[0] + Wp[1]) };
}

/* response of every pane for one external load vector and one p0 vector (§10.4.2.1 / §10.4.2.2 / §8.5.2.1) */
function iguRespond(o, g, ths, cpl, F, p0) {
  if (o.edges === 4) {
    var r4 = solveIgu(cpl, F, p0);
    return r4.Fd.map(function (fd, i) { var r = respond(o, g, ths[i], fd); return { ok: r.ok, reason: r.reason, sigma: r.sigma_MPa * (fd < 0 ? -1 : 1), w: r.w_mm * (fd < 0 ? -1 : 1), Fd: fd, pstar: r.pstar }; });
  }
  var d = deltas(ths.map(function (t) { return t.hw; })), Ft = sum(F), rin = solveIgu(cpl, F.map(function () { return 0; }), p0);
  return d.map(function (di, i) {
    var fe = di * Ft, fi = rin.Fd[i], re = respond(o, g, ths[i], fe), ri = C.plate4({ a_m: g.a, b_m: g.b, h_sigma_mm: ths[i].hs, h_w_mm: ths[i].hw, p_Pa: fi, linear: !!o.linear });
    var se = fe < 0 ? -1 : 1, si = fi < 0 ? -1 : 1;
    return { ok: re.ok && ri.ok, reason: re.reason || ri.reason, sigma: re.sigma_MPa * se + (ri.ok ? ri.sigma_MPa * si : 0), w: re.w_mm * se + (ri.ok ? ri.w_mm * si : 0), Fd: fe + fi, Fde: fe, Fdin: fi };
  });
}

function iguCheck(o, g, lc) {
  var gl = o.glazing, n = gl.panes.length;
  var d = g.d * 1000, ymax = 15e-7 * d * d + 0.0025 * d + 2.5;
  if (o.edges !== 4) ymax = Math.min(ymax, 25);
  var per = gl.panes.map(function () { return []; });
  var meta = [];
  lc.cases.forEach(function (c) {
    /* ω / η by the dominant action: wind 0,2 (façade, Tab. 5); climatic pressure (hours), snow, self-weight 0 */
    var action = c.dominant === 'snow' ? 'snow' : (c.dominant === 'self_weight' ? 'self_weight' : (c.dominant === 'igu_pressure' ? 'igu_pressure' : 'wind'));
    var ths = gl.panes.map(function (p, i) { return thickness(o, p, action, g, i); });
    var cpl = coupling(g.a, g.b, ths.map(function (t) { return t.hw; }), gl.cavity_mm);
    var kmod = o.set === 'EN16612' ? C.kmodFor(c.id === 'igu_g_only' ? 'self_weight' : (c.dominant === 'igu_pressure' ? (o.place === 'roof' ? ['igu_pressure', 'snow'] : 'igu_pressure') : (c.id === 'igu_g_wind_snow' || c.id === 'igu_g_snow_wind' ? ['wind', 'snow', 'igu_pressure'] : [c.dominant, 'igu_pressure'])), 'EN16612') : C.kmodFor(c.dominant, 'BE');
    var alt = function (ls) {   /* p0 vectors: maxima, minima, none (§9.2: a favourable variable action is dropped, per pane) */
      if (!c.p0mode) return [gl.panes.slice(1).map(function () { return 0; })];
      var e = p0Extremes(gl.type, gl.igu, c.p0mode, ls, c.p0sit, o.factors);
      var A = [e.map(function (x) { return x.max; }), e.map(function (x) { return x.min; })];
      if (c.p0mode === 'a') A.push(e.map(function () { return 0; }));
      return A;
    };
    var aU = alt('U'), aS = alt('S');
    var Ru = aU.map(function (p0) { return iguRespond(o, g, ths, cpl, c.uls, p0); }), Rs = aS.map(function (p0) { return iguRespond(o, g, ths, cpl, c.sls, p0); });
    meta.push({ id: c.id, p0_uls: aU, p0_sls: aS, phi: n === 2 ? 1 / (1 + cpl.alpha[0] + cpl.alphaPlus[0]) : null, alpha: cpl.alpha, alphaPlus: cpl.alphaPlus });
    gl.panes.forEach(function (p, i) {
      var fg = C.fgd({ glass: p.glass, surface: p.surface, process: p.process, finish: p.finish, kmod: kmod, set: o.set, edge: true, edgeFinish: p.edgeFinish });
      var r = { id: c.id, dominant: c.dominant, kmod: kmod, fgd_MPa: fg.fgd, model: ths[i].model, hef_w_mm: ths[i].hw, hef_sigma_mm: ths[i].hs, omega: ths[i].omega, eta: ths[i].eta, G_MPa: ths[i].G, T_C: ths[i].T_C, src: c.src, ymax_mm: ymax };
      var bad = Ru.concat(Rs).filter(function (R) { return !R[i].ok; })[0];
      if (bad) { r.ok = false; r.reason = bad[i].reason; r.util = Infinity; per[i].push(r); return; }
      var wu = Ru.reduce(function (m, R, j) { return Math.abs(R[i].sigma) > Math.abs(m.R[i].sigma) ? { R: R, j: j } : m; }, { R: Ru[0], j: 0 });
      var ws = Rs.reduce(function (m, R, j) { return Math.abs(R[i].w) > Math.abs(m.R[i].w) ? { R: R, j: j } : m; }, { R: Rs[0], j: 0 });
      r.sigma_MPa = Math.abs(wu.R[i].sigma); r.F_uls_Pa = wu.R[i].Fd; r.F_ext_uls_Pa = c.uls[i]; r.p0_uls_Pa = aU[wu.j]; r.pstar = wu.R[i].pstar;
      r.w_mm = Math.abs(ws.R[i].w); r.F_sls_Pa = ws.R[i].Fd; r.F_ext_sls_Pa = c.sls[i]; r.p0_sls_Pa = aS[ws.j];
      r.util_uls = r.sigma_MPa / fg.fgd;
      r.deflection_neglected = r.w_mm < 5;
      r.util_sls = r.deflection_neglected ? 0 : r.w_mm / ymax;
      r.util = Math.max(r.util_uls, r.util_sls);
      r.ok = r.util <= 1 + 1e-9;
      per[i].push(r);
    });
  });
  var fr = C.freq1({ a_m: g.a, b_m: g.b, edges: o.edges, span: g.span, panes: gl.panes.map(function (p) { return { plies: p.plies_mm, interlayers: p.interlayer_mm }; }) });
  var panes = gl.panes.map(function (p, i) {
    var gov = per[i].reduce(function (m, r) { return !m || r.util > m.util ? r : m; }, null);
    var minOk = p.plies_mm.length === 1 ? p.plies_mm[0] >= 4 : p.plies_mm.every(function (h) { return h >= 3; });
    return { index: i, position: i === 0 ? 'outer' : (i === n - 1 ? 'inner' : 'middle'), label: label(p), cases: per[i], governing: gov ? gov.id : null, util: gov ? gov.util : 0, minThicknessOk: minOk, ok: per[i].every(function (r) { return r.ok; }) && minOk };
  });
  var worst = panes.reduce(function (m, p) { return !m || p.util > m.util ? p : m; }, null);
  /* edge seal (§6, information): qs = Δd·a·k6 with the largest Δd of the outer cavity over the cases (SLS) */
  var dmax = 0, cw = coupling(g.a, g.b, gl.panes.map(function (p, i) { return thickness(o, p, 'wind', g, i).hw; }), gl.cavity_mm);
  meta.forEach(function (m) { (m.p0_sls || []).forEach(function (p0) { var r = solveIgu(cw, gl.panes.map(function () { return 0; }), p0); dmax = Math.max(dmax, Math.abs(r.delta[0])); }); });
  var seal = { delta_Pa: dmax, k6: C.k6(g.a / g.b), qs_N_per_m: dmax * g.a * C.k6(g.a / g.b) };
  var lbl = [];
  gl.panes.forEach(function (p, i) { lbl.push(label(p)); if (i < n - 1) lbl.push(String(gl.cavity_mm[i])); });
  return { label: lbl.join('-'), panes: panes, cases: worst ? worst.cases : [], governing: worst ? worst.governing : null, governing_pane: worst ? worst.position : null, util: worst ? worst.util : 0,
    freq: fr, minThicknessOk: panes.every(function (p) { return p.minThicknessOk; }), ok: panes.every(function (p) { return p.ok; }) && fr.ok, ymax_mm: ymax, coupling: meta, seal: seal };
}

/* catalogue of IGU: all panes stepped together within their family (monolithic MONO[i], 2-ply laminated LAMI[i] with the same interlayer) */
function iguCatalogue(gl) {
  var out = [];
  for (var i = 0; i < MONO.length - 1; i++) {
    out.push({ type: gl.type, cavity_mm: gl.cavity_mm.slice(), igu: gl.igu, panes: gl.panes.map(function (p) {
      var q = JSON.parse(JSON.stringify(p));
      if (p.plies_mm.length === 1) q.plies_mm = [MONO[i]]; else if (p.plies_mm.length === 2) q.plies_mm = [LAMI[i], LAMI[i]];
      return q;
    }) });
  }
  return out;
}

function iguRun(o) {
  var g = geometry(o), lc = iguCases(o, g), res = iguCheck(o, g, lc);
  var list = [], smallest = null;
  iguCatalogue(o.glazing).forEach(function (gq) {
    var oq = JSON.parse(JSON.stringify(o)); oq.glazing = gq;
    var r = iguCheck(oq, g, o.place === 'roof' ? iguCases(oq, g) : lc);
    list.push({ label: r.label, ok: r.ok, util: r.util, governing: r.governing, governing_pane: r.governing_pane, n1_Hz: r.freq.n1_Hz });
    if (!smallest && r.ok) smallest = r.label;
  });
  var linear = null;
  if (o.edges === 4) {
    var ol = JSON.parse(JSON.stringify(o)); ol.linear = true;
    var rl = iguCheck(ol, g, lc), wp = res.panes.reduce(function (m, p) { return !m || p.util > m.util ? p : m; }, null);
    var gv = wp && wp.cases.filter(function (c) { return c.id === wp.governing; })[0], lv = wp && rl.panes[wp.index].cases.filter(function (c) { return c.id === wp.governing; })[0];
    if (gv && lv && gv.sigma_MPa) linear = { sigma_linear_MPa: lv.sigma_MPa, sigma_MPa: gv.sigma_MPa, ratio: lv.sigma_MPa / gv.sigma_MPa, w_linear_mm: lv.w_mm, w_mm: gv.w_mm };
  }
  /* climatic share: the same unit without any isochoric pressure (p0 = 0) */
  var o0 = JSON.parse(JSON.stringify(o)); o0.glazing.igu = { no_climate: true, dH_m: 0 };
  var r0 = iguCheck(o0, g, iguCases(o0, g));
  var warnings = (lc.wind.warnings || []).slice();
  if (!res.minThicknessOk) warnings.push('min_thickness');
  if (o.laminatedModel === 'part4' && o.edges !== 4) warnings.push('part4_edges');
  if (o.place === 'roof') warnings.push('roof_cp_assumed');
  if (lc.wind.mode === 'net') warnings.push('igu_net_outer');
  if (Math.min(g.a, g.b) <= 0.5) warnings.push('igu_small_annexA');
  if (o.glazing.igu.p0_clamped) warnings.push('p0_scale_clamped');
  var cref = P0_REF.cavity_ref_mm[o.glazing.type];
  if (o.glazing.cavity_mm.some(function (s) { return Math.abs(s - cref) > 4; })) warnings.push('igu_cavity_ref');
  var sources = ['n2_71', 'n2_9', 'n2_44', o.glazing.type === 'triple' ? 'n2_45' : null, 'n2_85', o.place === 'roof' ? 'n2_106' : 'n2_104', 'n2_1022', 'n2_422', 'n2_55', 'n2_6', 'n3_31', 'n3_32'].filter(Boolean);
  if (o.laminatedModel === 'part4') sources.push('n4_54', 'n5_t1', 'la_eta');
  if (o.place === 'roof') sources.push('n2_72', 'la_roofcp', 'la_snow');
  if (lc.wind.mode === 'net') sources.push('la_igu_net');
  if (o.set === 'EN16612') sources.push('en16612_t5', 'en16612_eq4', 'en16612_eq6');
  if (o.edges === 4) sources.push('en16612_b');
  if (o.glazing.panes.some(function (p) { return p.plies_mm.length > 1; })) sources.push('la_glz');   /* interlayer density in n1 (GlazingCore.freq1) */
  return { ok: true, version: VERSION, input: o, geometry: g, wind: lc.wind, w_suction_Pa: lc.w_suction, w_pressure_Pa: lc.w_pressure,
    igu: res, pane: res, pass: res.ok, util: res.util, governing: res.governing, governing_pane: res.governing_pane, smallest: smallest, catalogue: list, linear: linear,
    util_without_climate: r0.util, climate_share: res.util > 0 ? 1 - r0.util / res.util : 0, warnings: warnings, sources: sources };
}


/* presets of the page (r2 PLAN §5, restated in D-BW-17 / D-BW-20; every claim is checked in _bw/r2/thick-igu/test.mjs) */
var PRESETS = [
  { id: 'zone2-corner', input: { w_m: 1.2, h_m: 1.8, edges: 4, pane: { plies_mm: [6] }, wind: { cls: 4, geometry: 'e_lt_5d', zone: 2 } } },
  { id: 'laminate-wind-snow', input: { w_m: 1.0, h_m: 1.5, edges: 4, tilt_deg: 80, pane: { plies_mm: [4, 4], interlayer_mm: [0.76] }, snow: { sk_kNm2: 0.5, mu: 0.8 }, wind: { cls: 3 } } },
  { id: 'small-igu-climate', input: { w_m: 0.4, h_m: 0.5, edges: 4, wind: { cls: 4, geometry: 'e_lt_5d', zone: 1 }, glazing: { type: 'double', panes: [{ plies_mm: [4] }, { plies_mm: [4] }], cavity_mm: [16], igu: { dH_m: 300 } } } },
  { id: 'large-linear', input: { w_m: 2.0, h_m: 3.0, edges: 4, pane: { plies_mm: [8] }, wind: { cls: 4, geometry: 'e_lt_5d', zone: 1 } } },
  { id: 'toughened-narrow', input: { w_m: 0.5, h_m: 2.0, edges: 4, pane: { plies_mm: [4], glass: 'toughened' }, wind: { cls: 6, geometry: 'e_lt_5d', zone: 2 } } },
  { id: 'roof-igu-snow', input: { w_m: 1.0, h_m: 2.0, edges: 4, tilt_deg: 80, snow: { sk_kNm2: 0.5, mu: 0.8 }, wind: { cls: 4 }, glazing: { type: 'double', panes: [{ plies_mm: [6] }, { plies_mm: [4, 4], interlayer_mm: [0.76] }], cavity_mm: [16] } } },
  { id: 'triple-middle', input: { w_m: 1.2, h_m: 1.5, edges: 4, wind: { cls: 4, geometry: 'e_lt_5d', zone: 1 }, glazing: { type: 'triple', panes: [{ plies_mm: [4] }, { plies_mm: [4] }, { plies_mm: [4] }], cavity_mm: [12, 12] } } },
  { id: 'tall-2edges', input: { w_m: 0.6, h_m: 3.0, edges: 2, free_side: 'h', pane: { plies_mm: [6] }, wind: { cls: 4, geometry: 'e_lt_5d', zone: 1 } } }
];
/* check(input) -> result. Errors -> {ok:false, errors}. */
function check(inp) {
  var isIgu = inp && inp.glazing && (inp.glazing.type === 'double' || inp.glazing.type === 'triple');
  if (isIgu && !(inp.pane && inp.pane.plies_mm)) { inp = JSON.parse(JSON.stringify(inp)); inp.pane = (inp.glazing.panes && inp.glazing.panes[0]) || { plies_mm: [4] }; }
  var n = normalise(inp);
  if (isIgu) iguNormalise(n.o, n.errors);
  if (n.errors.length) return { ok: false, errors: n.errors };
  var o = n.o;
  if (isIgu) return iguRun(o);
  var g = geometry(o), lc = loadCases(o, o.pane, g);
  var res = checkPane(o, o.pane, g, lc);
  var cat = catalogue(o.pane), smallest = null, list = [];
  /* laminated entries are also checked for n1 ≥ 4 Hz with the design coupling (the basis of the NBN S 23-002-3 / -5 tables);
     'smallest' skips an entry that passes only with ω 0,65 of part 2 §5.5.2 — that one is reported as smallest_omega065 */
  var smallest065 = null;
  cat.forEach(function (q) {
    var r = checkPane(o, q, g, o.place === 'roof' ? loadCases(o, q, g) : lc), fd = null;
    if (q.plies_mm.length > 1 && o.freqOmega !== 'design') { var oq = JSON.parse(JSON.stringify(o)); oq.freqOmega = 'design'; fd = freqPane(oq, q, g, thickness(o, q, 'wind', g)); }
    var okD = r.ok && (!fd || fd.ok);
    list.push({ label: r.label, ok: r.ok, util: r.util, governing: r.governing, n1_Hz: r.freq.n1_Hz, n1_design_Hz: fd ? fd.n1_Hz : null, ok_table_basis: okD });
    if (!smallest && r.ok && !okD && !smallest065) smallest065 = r.label;
    if (!smallest && okD) smallest = r.label;
  });
  var linear = null;
  if (o.edges === 4) {
    var ol = JSON.parse(JSON.stringify(o)); ol.linear = true;
    var rl = checkPane(ol, ol.pane, g, lc), gv = res.cases.filter(function (c) { return c.id === res.governing; })[0], lv = rl.cases.filter(function (c) { return c.id === res.governing; })[0];
    if (gv && lv && gv.sigma_MPa) linear = { sigma_linear_MPa: lv.sigma_MPa, sigma_MPa: gv.sigma_MPa, ratio: lv.sigma_MPa / gv.sigma_MPa, w_linear_mm: lv.w_mm, w_mm: gv.w_mm };
  }
  var warnings = (lc.wind.warnings || []).slice();
  if (!res.minThicknessOk) warnings.push('min_thickness');
  if (o.laminatedModel === 'part4' && o.edges !== 4 && o.pane.plies_mm.length > 1) warnings.push('part4_edges');
  if (o.place === 'roof') warnings.push('roof_cp_assumed');
  var frDesign = null;
  if (o.pane.plies_mm.length > 1 && o.freqOmega !== 'design') {
    var od = JSON.parse(JSON.stringify(o)); od.freqOmega = 'design';
    frDesign = freqPane(od, o.pane, g, thickness(o, o.pane, 'wind', g));
    if (!frDesign.ok && res.freq.ok) warnings.push('freq_table_basis');
  }
  if (smallest065) warnings.push('smallest_freq_basis');
  var sources = ['n2_71', 'n2_9', o.place === 'roof' ? 'n2_105' : 'n2_103', 'n2_102', 'n2_422', 'n2_55', 'n3_31', 'n3_32'];
  if (o.laminatedModel === 'part4') sources.push('n4_54', 'n5_t1', 'la_eta');
  if (o.place === 'roof') sources.push('n2_72', 'la_roofcp', 'la_snow');
  if (o.set === 'EN16612') sources.push('en16612_t5', 'en16612_eq4', 'en16612_eq6');
  if (o.edges === 4) sources.push('en16612_b');
  if (o.pane.plies_mm.length > 1) sources.push('la_glz');   /* interlayer density in n1 (GlazingCore.freq1) */
  return { ok: true, version: VERSION, input: o, geometry: g, wind: lc.wind, w_suction_Pa: lc.w_suction, w_pressure_Pa: lc.w_pressure,
    pane: res, pass: res.ok, util: res.util, governing: res.governing, smallest: smallest, smallest_omega065: smallest065, catalogue: list, linear: linear, freq_design_basis: frDesign, warnings: warnings, sources: sources };
}

/* summary for the project document module (modules.glassthickness) */
function summary(r) {
  if (!r || !r.ok) return null;
  return { pass: r.pass, util: Math.round(r.util * 1000) / 1000, governing: r.governing, composition: r.pane.label, smallest: r.smallest, n1_Hz: Math.round(r.pane.freq.n1_Hz * 10) / 10 };
}

return { VERSION: VERSION, SOURCES: SOURCES, CP_FACADE: CP_FACADE, PSI4: PSI4, GINT: GINT, FACTORS: FACTORS, MONO: MONO, LAMI: LAMI, LIM: LIM, CASE_LABEL: CASE_LABEL,
  cpFacade: cpFacade, gint: gint, paneTemp: paneTemp, PANE_T: PANE_T, psi4: psi4, etaP: etaP, label: label, windBasis: windBasis, normalise: normalise, loadCases: loadCases,
  checkPane: checkPane, catalogue: catalogue, check: check, summary: summary, _geometry: geometry, _thickness: thickness,
  P0_REF: P0_REF, k5: k5, phiDouble: phiDouble, coupling: coupling, solveIgu: solveIgu, deltas: deltas, p0Extremes: p0Extremes, iguCases: iguCases, iguCheck: iguCheck, iguCatalogue: iguCatalogue, PRESETS: PRESETS };
});
