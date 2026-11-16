/* glazing-core.js — global GlazingCore: shared core of the tools.petrov.re Glazing & Windows package
   (windowclasses, glassthickness, glasssafety, glassthermalbreak).
   Sections: 1 language helpers (L, t, fmt), 2 glass data + design strength (NBN S 23-002-2 §4.1–4.2 / EN 16612 §8),
   3 laminated glass effective thickness (NBN S 23-002-2 §4.3, NBN S 23-002-4 §5), 4 plates on 4 / 3 / 2 edges + natural frequency
   (NBN S 23-002-2 §5.2–5.5 = EN 16612 Annex B), 5 wind (EN 1991-1-4 qp, NBN S 23-002-3 Tab. 1 classes 1–7, NBN B 25-002-1 Tab. 2 W1–W8),
   6 project document (validate / import / export / storage / modules), 7 SOURCES, 8 ui.projectBar widget.
   Pure data + functions, no dependencies, UMD (browser global GlazingCore, node module.exports). Units: SI at the interface
   (m, Pa, K, W/m²); glass thicknesses in mm and stresses in MPa (N/mm²) as in the norms.
   Norm data are short computational values with their clause / table reference (D-BW-13); the norm text is not reproduced.
   Planning aid only — final glazing design / specification by a qualified engineer per the cited NBN / EN. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GlazingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
'use strict';

var VERSION = '0.1.1';
var SCHEMA = 'tools.petrov.re/glazing/v1';
var STORAGE_KEY = 'glz.project.v1';
var LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];

/* =====================================================================================
   1. Language helpers
   ===================================================================================== */
/* 7-language string in the fixed order en uk de nl fr es pl */
function L(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }

function t(dict, lang) {
  if (dict == null) return '';
  if (typeof dict === 'string') return dict;
  if (lang && dict[lang] != null) return dict[lang];
  return dict.en != null ? dict.en : '';
}

/* fmt: Intl.NumberFormat(lang) with fixed digits (default by magnitude), U+2212 minus, no negative zero, null/non-finite -> '—'
   (same behaviour as VTCore.fmt / MEPCore.fmt). */
var FMT_FALLBACK = { en: [',', '.', 4], uk: [' ', ',', 4], de: ['.', ',', 4], nl: ['.', ',', 4], fr: [' ', ',', 4], es: ['.', ',', 5], pl: [' ', ',', 5] };
var FMT_CACHE = {};
function fmt(n, lang, digits) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '—';
  var a = Math.abs(n);
  if (digits == null) digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a === 0 ? 0 : 3;
  digits = Math.max(0, Math.min(10, digits | 0));
  var l = LANGS.indexOf(lang) >= 0 ? lang : 'en';
  var s = a.toFixed(digits);
  var neg = n < 0 && Number(s) !== 0;
  var out = null, key = l + '|' + digits;
  try {
    var nf = FMT_CACHE[key];
    if (nf === undefined) {
      nf = (typeof Intl !== 'undefined' && Intl.NumberFormat) ? new Intl.NumberFormat(l, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : false;
      if (nf && String(nf.resolvedOptions().locale).split('-')[0] !== l) nf = false;
      FMT_CACHE[key] = nf;
    }
    if (nf) out = nf.format(Number(s));
  } catch (e) { out = null; }
  if (out == null) {
    var f = FMT_FALLBACK[l], parts = s.split('.'), ip = parts[0];
    if (ip.length >= f[2]) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, f[0]);
    out = ip + (parts[1] ? f[1] + parts[1] : '');
  }
  return (neg ? '−' : '') + out;
}

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function lerp(x, x0, x1, y0, y1) { return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
/* piecewise-linear interpolation in sorted xs, clamped to the ends */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (var i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(x, xs[i - 1], xs[i], ys[i - 1], ys[i]);
  return ys[ys.length - 1];
}

/* =====================================================================================
   2. Glass data and design bending strength
   ===================================================================================== */
/* NBN S 23-002-2:2020 §4.1 (= EN 16612:2019 §6.2) */
var GLASS = { E: 70000e6, nu: 0.23, rho: 2500, alphaT: 9e-6, fgk: 45, rhoPVB: 1070, source: 'nbn2_41' };
/* rhoPVB: interlayer density (PVB, learning assumption, typical product data) for eq. (57)/(60); alphaT per EN 572-1 (thermal expansion) */

/* kmod(t) = 0,663·t^(−1/16), t in hours, 0,25 ≤ kmod ≤ 1 — NBN S 23-002-2 §4.2.2 */
function kmod(tHours) {
  if (!isNum(tHours) || tHours <= 0) return 1;
  return Math.max(0.25, Math.min(1, 0.663 * Math.pow(tHours, -1 / 16)));
}
/* characteristic durations and kmod — NBN S 23-002-2 Tab. 1 (BE) and EN 16612:2019 Table 5 (EN16612 set) */
var KMOD_TABLE = {
  BE: {
    wind: { t_h: 1 / 6, kmod: 0.74 }, snow: { t_h: 21 * 24, kmod: 0.44 }, maintenance: { t_h: 0.5, kmod: 0.69 },
    igu_pressure: { t_h: 2, kmod: 0.635 }, self_weight: { t_h: 25 * 8760, kmod: 0.31 }, source: 'nbn2_t1' },
  EN16612: {
    wind_gust: { t_h: 3 / 3600, kmod: 1.0 }, wind: { t_h: 1 / 6, kmod: 0.74 }, barrier: { t_h: 30 / 3600, kmod: 0.89 }, barrier_crowd: { t_h: 5 / 60, kmod: 0.77 },
    maintenance: { t_h: 0.5, kmod: 0.69 }, snow: { t_h: 21 * 24, kmod: 0.45 }, igu_pressure: { t_h: 8, kmod: 0.58 }, self_weight: { t_h: 50 * 8760, kmod: 0.29 }, source: 'en16612_t5' }
};
/* kmod of an action in a set; combination -> highest kmod of the actions in it (NBN S 23-002-2 §4.2.2: of the dominant action;
   EN 16612 §8.1.4: highest value in the combination) */
function kmodFor(action, set) {
  var tab = KMOD_TABLE[set === 'EN16612' ? 'EN16612' : 'BE'];
  if (Array.isArray(action)) return action.reduce(function (m, a) { var k = kmodFor(a, set); return k > m ? k : m; }, 0);
  if (tab[action]) return tab[action].kmod;
  if (action === 'self_weight_igu' || action === 'altitude') return tab.self_weight.kmod;
  throw new Error('GlazingCore.kmodFor: unknown action ' + action);
}
/* ksp — NBN S 23-002-2 Tab. 2 = EN 16612 Table 4: [as produced, sandblasted] */
var KSP = { float: [1.0, 0.6], drawn: [1.0, 0.6], enamelled: [1.0, 0.6], patterned: [0.75, 0.45], enamelled_patterned: [0.75, 0.45], wired_polished: [0.75, 0.45], wired_patterned: [0.6, 0.36] };
/* fb;k MPa — NBN S 23-002-2 Tab. 3 = EN 16612 Table 6: toughened (EN 12150 / EN 14179), heat strengthened (EN 1863), chemically (EN 12337) */
var FBK = {
  float: { toughened: 120, heat_strengthened: 70, chemically: 150 }, drawn: { toughened: 120, heat_strengthened: 70, chemically: 150 },
  patterned: { toughened: 90, heat_strengthened: 55, chemically: 100 }, enamelled: { toughened: 75, heat_strengthened: 45 }, enamelled_patterned: { toughened: 75, heat_strengthened: 45 }
};
/* kv — NBN S 23-002-2 Tab. 4 = EN 16612 Table 7 */
var KV = { horizontal: 1.0, vertical: 0.6 };
/* ke edge strength factor of annealed glass — EN 16612 Annex A Table A.5 (NDP; NBN S 23-002-2 has no ke -> 1):
   [as-cut / arrissed / ground, seamed, polished] */
var KE = { float: [0.8, 0.9, 1.0], drawn: [0.8, 0.9, 1.0], patterned: [0.8, 0.8, 0.8], wired_polished: [0.8, 0.8, 0.8], wired_patterned: [0.8, 0.8, 0.8] };
var EDGE_FINISH = ['cut', 'seamed', 'polished'];
/* partial factors — NBN S 23-002-2 §4.2.1 / §4.2.3 (γM;A 1,8, γM;v 1,2) and EN 16612 Table 1 (same recommended values, NDP) */
var SETS = {
  BE: { id: 'BE', gammaMA: 1.8, gammaMv: 1.2, edgeFactor: false, source: 'nbn2_42' },
  EN16612: { id: 'EN16612', gammaMA: 1.8, gammaMv: 1.2, edgeFactor: true, source: 'en16612_t1' }
};
var GLASS_TYPES = ['annealed', 'heat_strengthened', 'toughened', 'chemically'];

/* fgd({glass, surface, finish, process, kmod | action, set, edge, ke, gammaMA, gammaMv}) -> {fgd, ...parts} MPa
   annealed: NBN eq. (1) / EN 16612 eq. (4) fg;d = [ke]·kmod·ksp·fg;k/γM;A ; prestressed: NBN eq. (2) / EN 16612 eq. (6)
   fg;d = kmod·ksp·fg;k/γM;A + kv·(fb;k − fg;k)/γM;v. ke only in the EN16612 set, annealed glass, stressed edges (opts.edge). */
function fgd(o) {
  o = o || {};
  var set = SETS[o.set === 'EN16612' ? 'EN16612' : 'BE'];
  var glass = o.glass || 'annealed', surface = o.surface || 'float';
  if (GLASS_TYPES.indexOf(glass) < 0) throw new Error('GlazingCore.fgd: glass must be ' + GLASS_TYPES.join('|'));
  if (!KSP[surface]) throw new Error('GlazingCore.fgd: unknown surface ' + surface);
  var ksp = KSP[surface][o.finish === 'sandblasted' ? 1 : 0];
  var km = isNum(o.kmod) ? o.kmod : kmodFor(o.action || 'wind', set.id);
  var gMA = isNum(o.gammaMA) ? o.gammaMA : set.gammaMA, gMv = isNum(o.gammaMv) ? o.gammaMv : set.gammaMv;
  var ke = 1;
  if (glass === 'annealed' && set.edgeFactor && o.edge) {
    ke = isNum(o.ke) ? o.ke : (KE[surface] || KE.float)[Math.max(0, EDGE_FINISH.indexOf(o.edgeFinish || 'cut'))];
  }
  var base = ke * km * ksp * GLASS.fgk / gMA, pre = 0, fbk = null, kv = 1;
  if (glass !== 'annealed') {
    fbk = FBK[surface] && FBK[surface][glass];
    if (fbk == null) throw new Error('GlazingCore.fgd: ' + glass + ' not available for ' + surface + ' glass (NBN S 23-002-2 Tab. 3)');
    kv = glass === 'chemically' ? 1 : (KV[o.process || 'horizontal'] || 1);
    pre = kv * (fbk - GLASS.fgk) / gMv;
  }
  return { fgd: base + pre, annealed_part: base, prestress_part: pre, kmod: km, ksp: ksp, ke: ke, kv: kv, fbk: fbk, fgk: GLASS.fgk, gammaMA: gMA, gammaMv: gMv, set: set.id,
    source: glass === 'annealed' ? (set.id === 'BE' ? 'nbn2_eq1' : 'en16612_eq4') : (set.id === 'BE' ? 'nbn2_eq2' : 'en16612_eq6') };
}

/* =====================================================================================
   3. Laminated glass — effective thickness
   ===================================================================================== */
/* shear transfer coefficient ω — NBN S 23-002-2 Tab. 5: wind on façades 0,2; roofs / inclined / other actions 0,0; natural frequency 0,65 (PVB, §5.5.2) */
var OMEGA = { wind: 0.2, other: 0.0, frequency: 0.65, source: 'nbn2_t5' };
function omegaFor(action, place) { if (action === 'frequency') return OMEGA.frequency; return action === 'wind' && place !== 'roof' ? OMEGA.wind : OMEGA.other; }

/* centre distances of each ply to the mid-thickness of the laminate (signed: + above), mm */
function plyOffsets(plies, inter) {
  var ht = plies.reduce(function (s, h) { return s + h; }, 0) + inter.reduce(function (s, h) { return s + h; }, 0);
  var z = 0, out = [];
  for (var i = 0; i < plies.length; i++) { out.push(ht / 2 - (z + plies[i] / 2)); z += plies[i] + (i < inter.length ? inter[i] : 0); }
  return { d: out, ht: ht };
}
function checkPlies(plies, inter) {
  if (!Array.isArray(plies) || !plies.length || plies.some(function (h) { return !isNum(h) || h <= 0; })) throw new Error('GlazingCore.hef: plies [mm] expected');
  inter = inter || [];
  if (plies.length > 1 && inter.length !== plies.length - 1) throw new Error('GlazingCore.hef: interlayers must be plies − 1');
  return inter;
}
/* hef({plies:[mm], interlayers:[mm], omega}) — NBN S 23-002-2 §4.3 eq. (3) hef;w and eq. (4) hef;σ;i, hef;σ = min_i hef;σ;i */
function hef(o) {
  var plies = o.plies, inter = checkPlies(plies, o.interlayers);
  var w = isNum(o.omega) ? Math.max(0, Math.min(1, o.omega)) : 0;
  if (plies.length === 1) return { hef_w: plies[0], hef_sigma: plies[0], hef_sigma_i: [plies[0]], omega: w, model: 'monolithic' };
  var off = plyOffsets(plies, inter), s3 = 0, sd = 0;
  plies.forEach(function (h, i) { s3 += h * h * h; sd += h * off.d[i] * off.d[i]; });
  var hw = Math.cbrt(s3 + 12 * w * sd);
  var hs = plies.map(function (h, i) { return Math.sqrt(hw * hw * hw / (h + 2 * w * Math.abs(off.d[i]))); });
  return { hef_w: hw, hef_sigma: Math.min.apply(null, hs), hef_sigma_i: hs, omega: w, hm: off.d.map(Math.abs), model: 'part2', source: 'nbn2_43' };
}
/* hefPart4({plies, interlayers, eta}) — NBN S 23-002-4:2025 §5.2 eq. (1) hef,w and eq. (2) hef,σ,i with the coupling coefficient η (§5.4) */
function hefPart4(o) {
  var plies = o.plies, inter = checkPlies(plies, o.interlayers);
  var eta = isNum(o.eta) ? Math.max(0, Math.min(1, o.eta)) : 0;
  if (plies.length === 1) return { hef_w: plies[0], hef_sigma: plies[0], hef_sigma_i: [plies[0]], eta: eta, model: 'monolithic' };
  var off = plyOffsets(plies, inter), s3 = 0, sd = 0;
  plies.forEach(function (h, i) { s3 += h * h * h; sd += h * off.d[i] * off.d[i]; });
  var full = s3 + 12 * sd;
  var hw = Math.cbrt(1 / (eta / full + (1 - eta) / s3));
  var hs = plies.map(function (h, i) { return Math.sqrt(1 / (2 * eta * Math.abs(off.d[i]) / full + h / (hw * hw * hw))); });
  return { hef_w: hw, hef_sigma: Math.min.apply(null, hs), hef_sigma_i: hs, eta: eta, d: off.d, model: 'part4', source: 'nbn4_52' };
}
/* etaP2({plies:[h1,h2] mm, interlayer mm, G MPa (interlayer shear modulus Gint,d), psi mm⁻² (Ψp of NBN S 23-002-4 Tab. 1, ×1e-6 already applied)})
   — NBN S 23-002-4 §5.4.2 eq. (5)–(7), two plies */
function etaP2(o) {
  var h1 = o.plies[0], h2 = o.plies[1], hint = o.interlayer, E = GLASS.E / 1e6, nu = GLASS.nu;
  if (!(isNum(h1) && isNum(h2) && isNum(hint) && isNum(o.G) && o.G > 0 && isNum(o.psi) && o.psi >= 0)) throw new Error('GlazingCore.etaP2: plies, interlayer, G, psi expected');
  var off = plyOffsets([h1, h2], [hint]);
  var Dabs = E * (h1 * h1 * h1 + h2 * h2 * h2) / (12 * (1 - nu * nu));
  var Dfull = Dabs + E * (h1 * off.d[0] * off.d[0] + h2 * off.d[1] * off.d[1]) / (1 - nu * nu);
  return 1 / (1 + hint * E / (o.G * (1 - nu * nu)) * (Dabs / Dfull) * (h1 * h2 / (h1 + h2)) * o.psi);
}
/* laminated(o) with laminatedModel 'part2' (default, ω) or 'part4' (η) */
function laminated(o) { return o.laminatedModel === 'part4' ? hefPart4(o) : hef(o); }

/* =====================================================================================
   4. Plates (rectangular, uniformly loaded, simply supported)
   ===================================================================================== */
/* Four edges — NBN S 23-002-2 §5.2 eq. (45)/(46) with k1, k4 as in Tab. 15/16; closed form as printed in EN 16612:2019 Annex B Tables B.1/B.2
   (z3 and z4 carry the factor 1/λ there; the NBN print omits it in §5.2.2 but its own Tab. 15 matches the EN form — D-BW-15).
   z2 has NO λ: the NBN text layer of §5.2.2 prints z2 = 24·λ·[…], which contradicts NBN Tab. 15 and EN 16612 Table B.1 (λ 0,5, p* → 0: k1 0,600) —
   do not "fix" z2 to the NBN print, it would halve k1 at λ 0,5 (R2-REVIEW CR-26).
   λ = a/b ≤ 1 (a short side); p* = (A/(4h²))²·Fd/E (EN 16612 eq. (B.4), h = hef;w for laminated); linear model p* → 0. */
var PSTAR_MAX = 300, LAMBDA_MIN = 0.1;
function k1(lambda, pstar) {
  var l = Math.max(LAMBDA_MIN, Math.min(1, lambda)), p = Math.max(1e-3, pstar || 0), r = 1 / l - 1;
  var z2 = 24 * (0.0447 + 0.0803 * (1 - Math.exp(-1.17 * Math.pow(r, 1.073))));
  var z3 = (4.5 * r * r + 4.5) / l, z4 = (0.585 - 0.05 * r) / l;
  return 1 / (4 * Math.sqrt(1 / (z2 * z2) + p * p / (z3 * z3 + (z4 * p) * (z4 * p))));
}
function k4(lambda, pstar) {
  var l = Math.max(LAMBDA_MIN, Math.min(1, lambda)), p = pstar || 0, r = 1 / l - 1, nu = GLASS.nu;
  var z1 = 192 * (1 - nu * nu) * l * l * (0.00406 + 0.00896 * (1 - Math.exp(-1.123 * Math.pow(r, 1.097))));
  if (p < 1e-9) return z1 / (16 * l * l);
  return Math.sqrt((Math.sqrt(1 / Math.pow(z1, 4) + 4 * p * p) - 1 / (z1 * z1)) / 2) / (16 * l * l * p);
}
/* plate4({a_m, b_m, h_mm | h_sigma_mm + h_w_mm, p_Pa, linear}) -> {ok, sigma_MPa, w_mm, pstar, k1, k4, lambda} ; refuses p* > 300 (end of Tab. 15/16) */
function plate4(o) {
  var a = Math.min(o.a_m, o.b_m) * 1000, b = Math.max(o.a_m, o.b_m) * 1000;
  var hs = isNum(o.h_sigma_mm) ? o.h_sigma_mm : o.h_mm, hw = isNum(o.h_w_mm) ? o.h_w_mm : o.h_mm;
  if (!(a > 0 && hs > 0 && hw > 0 && isNum(o.p_Pa))) throw new Error('GlazingCore.plate4: a_m, b_m, h_mm, p_Pa expected');
  var F = Math.abs(o.p_Pa) / 1e6, E = GLASS.E / 1e6, lambda = a / b;
  var pstar = o.linear ? 0 : Math.pow(a * b / (4 * hw * hw), 2) * F / E;
  if (pstar > PSTAR_MAX) return { ok: false, reason: 'pstar_out_of_range', pstar: pstar, lambda: lambda, source: 'nbn2_52' };
  var c1 = k1(lambda, pstar), c4 = k4(lambda, pstar);
  return { ok: true, sigma_MPa: c1 * a * a / (hs * hs) * F, w_mm: c4 * Math.pow(a, 4) / Math.pow(hw, 3) * F / E, pstar: pstar, k1: c1, k4: c4, lambda: lambda,
    linear: !!o.linear, lambda_clamped: lambda < LAMBDA_MIN, source: 'nbn2_52' };
}
/* Three edges — NBN S 23-002-2 §5.3 eq. (48)/(50), Tab. 17 (αw, βσ by λ; linear interpolation; λ > 3 -> last row);
   span_m = free span L of §5.3.4, other_m = the other side, λ = other / L */
var T17 = { lambda: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 2, 3],
  aw: [0.0038, 0.0163, 0.0327, 0.0519, 0.0711, 0.0884, 0.1028, 0.1143, 0.1239, 0.1316, 0.1374, 0.1422, 0.1460, 0.1489, 0.1508, 0.1557, 0.1576],
  bs: [0.0173, 0.0682, 0.1470, 0.2392, 0.3305, 0.4141, 0.4862, 0.5448, 0.5928, 0.6274, 0.6591, 0.6812, 0.6985, 0.7129, 0.7235, 0.7485, 0.7562], bs_gt3: 0.7571, aw_gt3: 0.1576 };
function plate3(o) {
  var Lm = o.span_m * 1000, lambda = o.other_m / o.span_m, hs = isNum(o.h_sigma_mm) ? o.h_sigma_mm : o.h_mm, hw = isNum(o.h_w_mm) ? o.h_w_mm : o.h_mm;
  if (!(Lm > 0 && lambda > 0 && hs > 0 && hw > 0 && isNum(o.p_Pa))) throw new Error('GlazingCore.plate3: span_m, other_m, h_mm, p_Pa expected');
  var F = Math.abs(o.p_Pa) / 1e6, E = GLASS.E / 1e6;
  var bs = lambda > 3 ? T17.bs_gt3 : interp(T17.lambda, T17.bs, lambda), aw = lambda > 3 ? T17.aw_gt3 : interp(T17.lambda, T17.aw, lambda);
  return { ok: true, sigma_MPa: bs * Lm * Lm / (hs * hs) * F, w_mm: aw * Math.pow(Lm, 4) * F / (E * Math.pow(hw, 3)), beta_sigma: bs, alpha_w: aw, lambda: lambda, lambda_clamped: lambda < 0.1, source: 'nbn2_53' };
}
/* Two edges — NBN S 23-002-2 §5.4 eq. (52) σ = 0,75·(L/h)²·Fd and eq. (54) y = 60/384·L⁴·Fd/(E·h³) (beam strip, linear) */
function plate2(o) {
  var Lm = o.span_m * 1000, hs = isNum(o.h_sigma_mm) ? o.h_sigma_mm : o.h_mm, hw = isNum(o.h_w_mm) ? o.h_w_mm : o.h_mm;
  if (!(Lm > 0 && hs > 0 && hw > 0 && isNum(o.p_Pa))) throw new Error('GlazingCore.plate2: span_m, h_mm, p_Pa expected');
  var F = Math.abs(o.p_Pa) / 1e6, E = GLASS.E / 1e6;
  return { ok: true, sigma_MPa: 0.75 * Lm * Lm / (hs * hs) * F, w_mm: 60 / 384 * Math.pow(Lm, 4) * F / (E * Math.pow(hw, 3)), source: 'nbn2_54' };
}
/* minimum thickness helpers for 3 / 2 edges — eq. (49)/(51), (53)/(55): e_min = sqrt(β·L²·Fd/fg;d), cbrt(α·Fd·L⁴/(E·ymax)) */
function emin(o) {
  var Lm = o.span_m * 1000, F = Math.abs(o.p_Pa) / 1e6, E = GLASS.E / 1e6, bs, aw;
  if (o.edges === 2) { bs = 0.75; aw = 60 / 384; }
  else { var l = o.other_m / o.span_m; bs = l > 3 ? T17.bs_gt3 : interp(T17.lambda, T17.bs, l); aw = l > 3 ? T17.aw_gt3 : interp(T17.lambda, T17.aw, l); }
  return { e_sigma_mm: Math.sqrt(bs * Lm * Lm * F / o.fgd_MPa), e_w_mm: o.ymax_mm > 0 ? Math.cbrt(aw * F * Math.pow(Lm, 4) / (E * o.ymax_mm)) : null, source: o.edges === 2 ? 'nbn2_54' : 'nbn2_53' };
}
/* natural frequency, mode 1 — NBN S 23-002-2 §5.5.2 eq. (56) (single / laminated with hef;w at ω 0,65, density eq. (57)) and §5.5.3
   eq. (58)–(60) (IGU: hIG = cbrt(Σh³), ρIG); Ω per §5.5.4. o: {a_m, b_m, edges 4|3|2, span:'a'|'b' (free span for 3/2 edges),
   panes:[{plies, interlayers}] (one pane = single glass)} -> {n1_Hz, h_m, rho, ok: n1 ≥ 4 Hz (§5.5.5)} */
function freq1(o) {
  var a = Math.min(o.a_m, o.b_m), b = Math.max(o.a_m, o.b_m), lambda = a / b, edges = o.edges || 4, oi, oj;
  if (edges === 4) { oi = 1; oj = 1; }
  else if (edges === 3) { if (o.span === 'b') { oi = 0.5 * Math.pow(lambda, 0.275); oj = 1; } else { oi = 1; oj = 0.5; } }
  else { if (o.span === 'b') { oi = 0; oj = 1; } else { oi = 1; oj = 0; } }
  var panes = o.panes && o.panes.length ? o.panes : [{ plies: [o.h_mm] }];
  var s3 = 0, mass = 0;
  panes.forEach(function (p) {
    var inter = p.interlayers || p.interlayer_mm || [];
    var plies = p.plies || p.plies_mm;
    var h = hef({ plies: plies, interlayers: inter, omega: OMEGA.frequency }).hef_w;
    s3 += h * h * h;
    mass += plies.reduce(function (s, x) { return s + x; }, 0) * GLASS.rho + inter.reduce(function (s, x) { return s + x; }, 0) * GLASS.rhoPVB;
  });
  var hmm = Math.cbrt(s3), rho = mass / hmm, h = hmm / 1000;
  var n1 = Math.PI * h / (2 * a * a * b * b) * (b * b * oi * oi + a * a * oj * oj) * Math.sqrt(GLASS.E / (12 * rho * (1 - GLASS.nu * GLASS.nu)));
  return { n1_Hz: n1, h_mm: hmm, rho: rho, omega_i: oi, omega_j: oj, ok: n1 >= 4, limit_Hz: 4, source: panes.length > 1 ? 'nbn2_553' : 'nbn2_552' };
}
/* edge seal (IGU) — NBN S 23-002-2 §6 eq. (61) qs = ps·a·k6, k6 = 0,5 − 1,2·e^(−2,2/λ) + 0,177·e^(−1,01/λ) (Tab. 18 formula) */
function k6(lambda) { var l = Math.max(0.1, Math.min(1, lambda)); return 0.5 - 1.2 * Math.exp(-2.2 / l) + 0.177 * Math.exp(-1.01 / l); }

/* =====================================================================================
   5. Wind
   ===================================================================================== */
/* EN 1991-1-4:2005 Table 4.1 terrain parameters (recommended; NBN EN 1991-1-4 ANB:2010 not available in the licensed set — D-BW-15) */
var TERRAIN = { '0': { z0: 0.003, zmin: 1 }, 'I': { z0: 0.01, zmin: 1 }, 'II': { z0: 0.05, zmin: 2 }, 'III': { z0: 0.3, zmin: 5 }, 'IV': { z0: 1.0, zmin: 10 } };
var ROUGHNESS = ['0', 'I', 'II', 'III', 'IV'];
var VB0 = [23, 24, 25, 26]; /* NBN B 25-002-1 §6.5.3 Fig. 9 (= ANB map): Belgian basic wind velocity 23…26 m/s */
/* cprob(T years) — EN 1991-1-4 eq. (4.2), K 0,2, n 0,5 (25 years -> 0,96 as used in NBN S 23-002-3 §3.2.1) */
function cprob(T) { if (!isNum(T) || T <= 0 || T === 50) return 1; var p = 1 / T; return Math.sqrt((1 - 0.2 * Math.log(-Math.log(1 - p))) / (1 - 0.2 * Math.log(-Math.log(0.98)))); }
/* qp(ze, vb0, cat, {cprob, c0, rho}) Pa — EN 1991-1-4 §4.3–4.5: vm = cr·c0·vb, cr = kr·ln(z/z0), kr = 0,19·(z0/0,05)^0,07, Iv = 1/(c0·ln(z/z0)),
   qp = (1 + 7·Iv)·½·ρ·vm², ρ 1,25 kg/m³, z ≥ zmin. Close to NBN S 23-002-3 Tab. 1 but not equal: within −3,7 … +4,0 % for roughness 0–III
   (cprob = 1 there; the negative side is unconservative), +10 … +12 % for IV (ANB terrain IV, not available) -> use glassExposure()/windowExposure()
   (the Belgian class qp) for classes and hand-offs. */
function qp(ze, vb0, cat, o) {
  o = o || {};
  var tp = TERRAIN[String(cat)];
  if (!tp) throw new Error('GlazingCore.qp: roughness must be 0|I|II|III|IV');
  if (!(isNum(ze) && ze > 0 && isNum(vb0) && vb0 > 0)) throw new Error('GlazingCore.qp: ze, vb0 expected');
  var z = Math.max(ze, tp.zmin), c0 = isNum(o.c0) ? o.c0 : 1, rho = isNum(o.rho) ? o.rho : 1.25;
  var vb = vb0 * (isNum(o.cprob) ? o.cprob : 1) * (isNum(o.cdir) ? o.cdir : 1) * (isNum(o.cseason) ? o.cseason : 1);
  var lnz = Math.log(z / tp.z0), kr = 0.19 * Math.pow(tp.z0 / 0.05, 0.07), vm = kr * lnz * c0 * vb, Iv = 1 / (c0 * lnz);
  return (1 + 7 * Iv) * 0.5 * rho * vm * vm;
}
/* NBN S 23-002-3:2020 §4 Tab. 1 — wind exposure classes 1–7 of glass: qp per class and the reference height ze "up to" which a
   (roughness, vb0) combination stays in the class. Columns vb0 26, 25, 24, 23 m/s; null = combination never in that class;
   negative = height limit marked * (above it a terrain-roughness analysis is required, CSTC report 11 §4.1.2.3). */
var GLASS_CLASS_QP = [544, 693, 815, 950, 1086, 1224, 1364];
var GLASS_CLASS_ZE = [
  { '0': [null, null, null, null], 'I': [null, null, null, null], 'II': [null, null, 2, 3], 'III': [5, 6, 7, 9], 'IV': [15, 17, 21, 25] },
  { '0': [null, null, null, null], 'I': [null, null, null, null], 'II': [3, 3, 4, 6], 'III': [9, 12, 15, 19], 'IV': [25, -30, -30, -30] },
  { '0': [null, null, null, null], 'I': [2, 2, 4, 5], 'II': [5, 6, 8, 11], 'III': [15, 19, -21, -21], 'IV': [-30, -30, -30, -30] },
  { '0': [3, null, null, null], 'I': [4, 5, 8, 11], 'II': [8, 11, 15, -16], 'III': [-21, -21, -21, -21], 'IV': [-30, -30, -30, -30] },
  { '0': [5, null, null, null], 'I': [7, 10, 14, 22], 'II': [14, -16, -16, 22], 'III': [-21, -21, -21, 22], 'IV': [-30, -30, -30, -30] },
  { '0': [8, null, null, null], 'I': [12, 14, 27, 42], 'II': [-16, -16, 27, 42], 'III': [-21, -21, 27, 42], 'IV': [-30, -30, -30, 42] },
  { '0': [15, null, null, null], 'I': [21, 31, 48, 78], 'II': [21, 31, 48, 78], 'III': [-21, 31, 48, 78], 'IV': [-30, 31, 48, 78] }
];
/* NBN B 25-002-1:2019 §6.5.6 Tab. 2 — window wind exposure classes W1–W8 (same layout, no * limits) */
var WINDOW_CLASS_ZE = [
  { '0': [null, null, null, null], 'I': [null, null, null, null], 'II': [null, null, null, 3], 'III': [null, 6, 8, 9], 'IV': [15, 18, 21, 26] },
  { '0': [null, null, null, null], 'I': [null, null, null, null], 'II': [null, 3, 4, 6], 'III': [9, 11, 14, 18], 'IV': [23, 28, 36, 44] },
  { '0': [null, null, null, null], 'I': [null, 3, 4, 6], 'II': [5, 6, 8, 12], 'III': [15, 19, 25, 33], 'IV': [39, 48, 60, 79] },
  { '0': [8, null, null, null], 'I': [12, 17, 26, 40], 'II': [22, 31, 44, 65], 'III': [55, 75, 100, 100], 'IV': [100, 100, 100, 100] },
  { '0': [42, null, null, null], 'I': [52, 81, 100, 100], 'II': [80, 100, 100, 100], 'III': [100, 100, 100, 100], 'IV': [100, 100, 100, 100] },
  { '0': [133, null, null, null], 'I': [133, 133, 133, 133], 'II': [133, 133, 133, 133], 'III': [133, 133, 133, 133], 'IV': [133, 133, 133, 133] },
  { '0': [167, null, null, null], 'I': [167, 167, 167, 167], 'II': [167, 167, 167, 167], 'III': [167, 167, 167, 167], 'IV': [167, 167, 167, 167] },
  { '0': [200, null, null, null], 'I': [200, 200, 200, 200], 'II': [200, 200, 200, 200], 'III': [200, 200, 200, 200], 'IV': [200, 200, 200, 200] }
];
/* vb0 column: Belgian map values 23…26; a value between two lines -> the higher one (conservative) */
function vbColumn(vb0) {
  if (!isNum(vb0) || vb0 < 22.5 || vb0 > 26) return -1;
  var v = Math.max(23, Math.ceil(vb0 - 1e-9));
  return 26 - v;
}
function lookupClass(table, ze, vb0, cat) {
  var col = vbColumn(vb0);
  if (col < 0) return { ok: false, reason: 'vb0_range' };
  if (ROUGHNESS.indexOf(String(cat)) < 0) return { ok: false, reason: 'roughness' };
  if (String(cat) === '0' && col !== 0) return { ok: false, reason: 'coast_vb0', note: 'roughness 0 (coast) only with vb0 26 m/s' };
  if (!(isNum(ze) && ze > 0)) return { ok: false, reason: 'ze' };
  var starred = false;
  for (var i = 0; i < table.length; i++) {
    var v = table[i][String(cat)][col];
    if (v == null) continue;
    var lim = Math.abs(v);
    if (ze <= lim + 1e-9) return { ok: true, index: i, limit_m: lim, starred: v < 0, roughness_analysis: starred, vb0_column: 26 - col };
    if (v < 0) starred = true;
  }
  return { ok: false, reason: 'ze_above_table', max_m: Math.abs(table[table.length - 1][String(cat)][col] || 0) };
}
/* glassExposure({ze, vb0, roughness}) -> {ok, cls 1..7, qp_Pa (class value), roughness_analysis} — NBN S 23-002-3 Tab. 1 */
function glassExposure(o) {
  var r = lookupClass(GLASS_CLASS_ZE, o.ze, o.vb0, o.roughness);
  if (!r.ok) return r;
  r.cls = r.index + 1; r.qp_Pa = GLASS_CLASS_QP[r.index]; r.source = 'nbn3_t1';
  return r;
}
/* glassClassFromQp(qp Pa) -> 1..7 (smallest class whose qp covers it) or null above class 7 */
function glassClassFromQp(q) { for (var i = 0; i < GLASS_CLASS_QP.length; i++) if (q <= GLASS_CLASS_QP[i] + 1e-9) return i + 1; return null; }
/* windowExposure({ze, vb0, roughness}) -> {ok, cls 'W1'..'W8', index 1..8} — NBN B 25-002-1 Tab. 2; ze > 100 m: EN 13050 advised (§6.5.7 note) */
function windowExposure(o) {
  var r = lookupClass(WINDOW_CLASS_ZE, o.ze, o.vb0, o.roughness);
  if (!r.ok) return r;
  r.cls = 'W' + (r.index + 1); r.index = r.index + 1; r.above100 = o.ze > 100; r.source = 'b25_t2';
  return r;
}
/* façade edge zone width e/5, e = min(b, 2h) — NBN S 23-002-3 §3.2.2 */
function edgeZoneWidth(b_m, h_m) { return Math.min(b_m, 2 * h_m) / 5; }

/* =====================================================================================
   6. Project document (hand-off between the four tools)
   ===================================================================================== */
var TOOLS = [
  { id: 'windowclasses', name: L('Window Performance Classes (BE)', 'Класи характеристик вікон (BE)', 'Leistungsklassen von Fenstern (BE)', 'Prestatieklassen van ramen (BE)', 'Classes de performance des fenêtres (BE)', 'Clases de prestaciones de ventanas (BE)', 'Klasy właściwości okien (BE)') },
  { id: 'glassthickness', name: L('Glass Thickness for Wind, Snow & Climate Loads', 'Товщина скла під вітер, сніг і кліматичні навантаження', 'Glasdicke für Wind-, Schnee- und Klimalasten', 'Glasdikte voor wind-, sneeuw- en klimaatbelasting', 'Épaisseur de verre — vent, neige et charges climatiques', 'Espesor de vidrio para viento, nieve y cargas climáticas', 'Grubość szkła na wiatr, śnieg i obciążenia klimatyczne') },
  { id: 'glasssafety', name: L('Safety Glazing Selector (BE)', 'Вибір безпечного скління (BE)', 'Auswahl von Sicherheitsverglasung (BE)', 'Keuze van veiligheidsbeglazing (BE)', 'Choix du vitrage de sécurité (BE)', 'Selección de acristalamiento de seguridad (BE)', 'Dobór szyb bezpiecznych (BE)') },
  { id: 'glassthermalbreak', name: L('Thermal Breakage Risk of Glass', 'Ризик термічного розтріскування скла', 'Thermobruchrisiko von Glas', 'Risico op thermische breuk van glas', 'Risque de casse thermique du verre', 'Riesgo de rotura térmica del vidrio', 'Ryzyko pęknięć termicznych szkła') }
];
var TOOL_IDS = TOOLS.map(function (x) { return x.id; });
var ENUMS = {
  roughness: ROUGHNESS,
  building_use: ['A', 'B', 'C1', 'C2', 'C3', 'C4', 'C5', 'D', 'E'],
  kind: ['window', 'door', 'curtainwall', 'roof', 'balustrade', 'partition', 'shower'],
  public_side: ['in', 'out', 'none'],
  gtype: ['single', 'double', 'triple'],
  glass: ['float', 'heat_strengthened', 'toughened'],
  coating: ['none', 'lowe', 'solar']
};
var LIMITS = { bytes: 2000000, depth: 64, nodes: 100000, openings: 200, plies: 6, label: 60 };
var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
var SITE_RANGES = { vb0: [20, 30], ze_m: [0.5, 300] };
var OPENING_RANGES = { w_m: [0.05, 12], h_m: [0.05, 12], sill_m: [0, 20], fall_m: [0, 300], tilt_deg: [0, 90] };
var PANES_OF = { single: 1, double: 2, triple: 3 };

function emptyProject(opts) {
  opts = opts || {};
  return { schema: SCHEMA, revision: 1,
    site: { vb0: 25, roughness: 'II', ze_m: 10, building_use: 'A', facade_zone: 1 },
    openings: [defaultOpening('W1')], modules: {}, name: opts.name || '' };
}
function defaultOpening(id) {
  return { id: id, label: '', kind: 'window', w_m: 1.2, h_m: 1.5, sill_m: 0.9, fall_m: 3.0, tilt_deg: 0, edges: 4, public_side: 'none',
    glazing: { type: 'double', panes: [{ plies_mm: [4], interlayer_mm: [], glass: 'float', coating: 'none', absorptance: 0.1 }, { plies_mm: [4], interlayer_mm: [], glass: 'float', coating: 'lowe', absorptance: 0.15 }], cavity_mm: [16] } };
}
/* tilt_deg: deviation of the pane from the vertical (0 = vertical façade, 90 = horizontal roof glazing), as the angle bands of NBN S 23-002/A1 */

var MSG = {
  too_many_nodes: L('more than {n} nodes', 'понад {n} вузлів', 'mehr als {n} Knoten', 'meer dan {n} knooppunten', 'plus de {n} nœuds', 'más de {n} nodos', 'ponad {n} węzłów'),
  too_deep: L('nesting deeper than {n}', 'вкладеність глибша за {n}', 'Verschachtelung tiefer als {n}', 'nesting dieper dan {n}', 'imbrication plus profonde que {n}', 'anidamiento de más de {n} niveles', 'zagnieżdżenie głębsze niż {n}'),
  non_finite: L('non-finite number', 'нескінченне або нечислове значення', 'keine endliche Zahl', 'geen eindig getal', 'nombre non fini', 'número no finito', 'liczba nieskończona lub nieokreślona'),
  bad_type: L('unsupported type {t}', 'непідтримуваний тип {t}', 'nicht unterstützter Typ {t}', 'niet-ondersteund type {t}', 'type {t} non pris en charge', 'tipo {t} no admitido', 'nieobsługiwany typ {t}'),
  not_plain: L('not a plain object', 'не простий об’єкт JSON', 'kein einfaches Objekt', 'geen gewoon object', 'pas un objet simple', 'no es un objeto simple', 'to nie jest zwykły obiekt'),
  forbidden_key: L('forbidden key {k}', 'заборонений ключ {k}', 'verbotener Schlüssel {k}', 'verboden sleutel {k}', 'clé interdite {k}', 'clave prohibida {k}', 'niedozwolony klucz {k}'),
  not_object: L('document is not an object', 'документ не є об’єктом', 'das Dokument ist kein Objekt', 'het document is geen object', 'le document n’est pas un objet', 'el documento no es un objeto', 'dokument nie jest obiektem'),
  schema: L('schema must be {s}', 'схема має бути {s}', 'Schema muss {s} sein', 'schema moet {s} zijn', 'le schéma doit être {s}', 'el esquema debe ser {s}', 'schemat musi mieć wartość {s}'),
  revision: L('revision must be a non-negative integer', 'ревізія має бути цілим невід’ємним числом', 'Revision muss eine nichtnegative ganze Zahl sein', 'revisie moet een niet-negatief geheel getal zijn', 'la révision doit être un entier positif ou nul', 'la revisión debe ser un entero no negativo', 'rewizja musi być nieujemną liczbą całkowitą'),
  object: L('object expected', 'очікується об’єкт', 'Objekt erwartet', 'object verwacht', 'objet attendu', 'se espera un objeto', 'oczekiwano obiektu'),
  array: L('array expected', 'очікується масив', 'Liste (Array) erwartet', 'lijst (array) verwacht', 'tableau attendu', 'se espera una lista (array)', 'oczekiwano tablicy'),
  number: L('number expected', 'очікується число', 'Zahl erwartet', 'getal verwacht', 'nombre attendu', 'se espera un número', 'oczekiwano liczby'),
  range: L('must be {lo}..{hi}', 'має бути в межах {lo}..{hi}', 'muss zwischen {lo} und {hi} liegen', 'moet tussen {lo} en {hi} liggen', 'doit être compris entre {lo} et {hi}', 'debe estar entre {lo} y {hi}', 'musi mieścić się w zakresie {lo}..{hi}'),
  string: L('string expected', 'очікується текст', 'Text erwartet', 'tekst verwacht', 'texte attendu', 'se espera un texto', 'oczekiwano tekstu'),
  label: L('string ≤ {n} chars expected', 'очікується текст до {n} символів', 'Text mit höchstens {n} Zeichen erwartet', 'tekst van hoogstens {n} tekens verwacht', 'texte de {n} caractères au plus attendu', 'se espera un texto de {n} caracteres como máximo', 'oczekiwano tekstu do {n} znaków'),
  enum: L('{k} must be one of {list}', '{k}: допустимі значення {list}', '{k} muss einer der Werte {list} sein', '{k} moet een van {list} zijn', '{k} doit valoir {list}', '{k} debe ser uno de {list}', '{k} musi mieć jedną z wartości {list}'),
  opening_id: L('id: 1–24 characters A-Z a-z 0-9 _ . + -', 'id: 1–24 символи A-Z a-z 0-9 _ . + -', 'id: 1–24 Zeichen A-Z a-z 0-9 _ . + -', 'id: 1–24 tekens A-Z a-z 0-9 _ . + -', 'id : 1 à 24 caractères A-Z a-z 0-9 _ . + -', 'id: 1–24 caracteres A-Z a-z 0-9 _ . + -', 'id: 1–24 znaki A-Z a-z 0-9 _ . + -'),
  duplicate_id: L('duplicate opening id {id}', 'повторний id прорізу {id}', 'doppelte Öffnungs-ID {id}', 'dubbele id van opening {id}', 'identifiant d’ouverture en double {id}', 'id de hueco duplicado {id}', 'powtórzony id otworu {id}'),
  too_many: L('more than {n} openings', 'понад {n} прорізів', 'mehr als {n} Öffnungen', 'meer dan {n} openingen', 'plus de {n} ouvertures', 'más de {n} huecos', 'ponad {n} otworów'),
  edges: L('edges must be 2, 3 or 4', 'кількість опертих країв: 2, 3 або 4', 'gelagerte Kanten: 2, 3 oder 4', 'ondersteunde randen: 2, 3 of 4', 'bords appuyés : 2, 3 ou 4', 'bordes apoyados: 2, 3 o 4', 'podparte krawędzie: 2, 3 lub 4'),
  zone: L('facade zone must be 1 or 2', 'зона фасаду має бути 1 або 2', 'Fassadenzone muss 1 oder 2 sein', 'gevelzone moet 1 of 2 zijn', 'la zone de façade doit valoir 1 ou 2', 'la zona de fachada debe ser 1 o 2', 'strefa fasady musi wynosić 1 lub 2'),
  panes_count: L('{type} glazing needs {n} panes', 'склопакет {type} потребує {n} скла', '{type}-Verglasung braucht {n} Scheiben', '{type} beglazing vraagt {n} bladen', 'un vitrage {type} demande {n} verres', 'un acristalamiento {type} necesita {n} vidrios', 'oszklenie {type} wymaga {n} szyb'),
  cavity_count: L('{n} cavities expected', 'очікується {n} міжскляних проміжків', '{n} Scheibenzwischenräume erwartet', '{n} spouwen verwacht', '{n} lames d’air attendues', 'se esperan {n} cámaras', 'oczekiwano {n} przestrzeni międzyszybowych'),
  plies: L('1–{n} plies of 2–25 mm expected', 'очікується 1–{n} шарів скла по 2–25 мм', '1–{n} Glaslagen zu 2–25 mm erwartet', '1–{n} glasbladen van 2–25 mm verwacht', '1 à {n} feuilles de 2 à 25 mm attendues', 'se esperan 1–{n} hojas de 2–25 mm', 'oczekiwano 1–{n} tafli po 2–25 mm'),
  interlayers: L('one interlayer (0,1–10 mm) between each two plies expected', 'між кожними двома шарами очікується одна плівка (0,1–10 мм)', 'zwischen je zwei Lagen eine Zwischenschicht (0,1–10 mm) erwartet', 'tussen elke twee bladen één tussenlaag (0,1–10 mm) verwacht', 'un intercalaire (0,1 à 10 mm) attendu entre deux feuilles', 'se espera una lámina intermedia (0,1–10 mm) entre cada dos hojas', 'między każdymi dwiema taflami oczekiwano jednej warstwy pośredniej (0,1–10 mm)'),
  modules: L('modules must be an object of objects', 'modules має бути об’єктом з об’єктів', 'modules muss ein Objekt aus Objekten sein', 'modules moet een object van objecten zijn', 'modules doit être un objet d’objets', 'modules debe ser un objeto de objetos', 'modules musi być obiektem obiektów'),
  vb0_be: L('vb0 outside the Belgian map 23–26 m/s', 'vb0 поза бельгійською картою 23–26 м/с', 'vb0 außerhalb der belgischen Karte 23–26 m/s', 'vb0 buiten de Belgische kaart 23–26 m/s', 'vb0 hors de la carte belge 23–26 m/s', 'vb0 fuera del mapa belga 23–26 m/s', 'vb0 poza mapą belgijską 23–26 m/s'),
  not_text: L('text expected', 'очікується текст', 'Text erwartet', 'tekst verwacht', 'texte attendu', 'se espera un texto', 'oczekiwano tekstu'),
  too_large: L('file larger than 2 MB', 'файл більший за 2 МБ', 'Datei größer als 2 MB', 'bestand groter dan 2 MB', 'fichier de plus de 2 Mo', 'archivo de más de 2 MB', 'plik większy niż 2 MB'),
  json: L('invalid JSON: {e}', 'некоректний JSON: {e}', 'ungültiges JSON: {e}', 'ongeldige JSON: {e}', 'JSON invalide : {e}', 'JSON no válido: {e}', 'nieprawidłowy JSON: {e}')
};
var msgLang = 'en';
function setLang(l) { msgLang = l; }
function curMsgLang(o) { var l = o && o.lang != null ? o.lang : msgLang; if (typeof l === 'function') { try { l = l(); } catch (e) { l = 'en'; } } return LANGS.indexOf(l) >= 0 ? l : 'en'; }
function fillMsg(key, args, lang) {
  var tpl = MSG[key] ? t(MSG[key], lang) : key;
  return tpl.replace(/\{(\w+)\}/g, function (m, k) { return args && args[k] != null ? String(args[k]) : m; });
}
function mkErr(code, path, key, args, lang) { return { code: code, path: path, msg: fillMsg(key, args, lang), msg_en: fillMsg(key, args, 'en'), key: key, args: args || {} }; }
function errorText(e, lang) {
  if (!e) return '';
  var m = e.key ? fillMsg(e.key, e.args, LANGS.indexOf(lang) >= 0 ? lang : 'en') : (e.msg || String(e));
  return (e.path ? e.path + ' ' : '') + m;
}
function walk(doc, errors, lang) {
  var nodes = 0, stopped = false;
  function W(code, path, key, args) { errors.push(mkErr(code, path, key, args, lang)); }
  function w(v, d, path) {
    if (stopped) return;
    if (++nodes > LIMITS.nodes) { W('too_many_nodes', path, 'too_many_nodes', { n: LIMITS.nodes }); stopped = true; return; }
    if (d > LIMITS.depth) { W('too_deep', path, 'too_deep', { n: LIMITS.depth }); stopped = true; return; }
    if (v === null) return;
    var ty = typeof v;
    if (ty === 'number') { if (!isFinite(v)) W('non_finite', path, 'non_finite'); return; }
    if (ty === 'string' || ty === 'boolean') return;
    if (ty !== 'object') { W('bad_type', path, 'bad_type', { t: ty }); return; }
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) w(v[i], d + 1, path + '[' + i + ']'); return; }
    var proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) { W('bad_type', path, 'not_plain'); return; }
    var keys = Object.keys(v);
    for (var k = 0; k < keys.length; k++) {
      if (BAD_KEYS[keys[k]]) { W('forbidden_key', path + '.' + keys[k], 'forbidden_key', { k: keys[k] }); continue; }
      w(v[keys[k]], d + 1, path + '.' + keys[k]);
    }
  }
  w(doc, 0, '$');
  return errors;
}

/* validate(doc, {lang}) -> {ok, errors[], warnings[]}; unknown fields are allowed (and survive) */
function validate(doc, vopts) {
  var lang = curMsgLang(vopts), errors = [], warnings = [];
  function E(code, path, key, args) { errors.push(mkErr(code, path, key, args, lang)); }
  function Wn(code, path, key, args) { warnings.push(mkErr(code, path, key, args, lang)); }
  function rng(v, path, lo, hi, required) {
    if (v == null) { if (required) E('type', path, 'number'); return; }
    if (!isNum(v)) E('type', path, 'number'); else if (v < lo || v > hi) E('range', path, 'range', { lo: lo, hi: hi });
  }
  function en(v, path, k, list, required) { if (v == null) { if (required) E('enum', path, 'enum', { k: k, list: list.join('|') }); return; } if (list.indexOf(String(v)) < 0) E('enum', path, 'enum', { k: k, list: list.join('|') }); }
  if (!isObj(doc)) { E('not_object', '$', 'not_object'); return { ok: false, errors: errors, warnings: warnings }; }
  walk(doc, errors, lang);
  if (errors.length) return { ok: false, errors: errors, warnings: warnings };
  if (doc.schema !== SCHEMA) E('schema', '$.schema', 'schema', { s: SCHEMA });
  if (doc.revision != null && !(isNum(doc.revision) && doc.revision >= 0 && Math.floor(doc.revision) === doc.revision)) E('revision', '$.revision', 'revision');
  if (doc.name != null && (typeof doc.name !== 'string' || doc.name.length > LIMITS.label)) E('label', '$.name', 'label', { n: LIMITS.label });
  var s = doc.site;
  if (!isObj(s)) E('object', '$.site', 'object');
  else {
    rng(s.vb0, '$.site.vb0', SITE_RANGES.vb0[0], SITE_RANGES.vb0[1], true);
    if (isNum(s.vb0) && (s.vb0 < 22.5 || s.vb0 > 26)) Wn('vb0_be', '$.site.vb0', 'vb0_be');
    en(s.roughness, '$.site.roughness', 'roughness', ENUMS.roughness, true);
    rng(s.ze_m, '$.site.ze_m', SITE_RANGES.ze_m[0], SITE_RANGES.ze_m[1], true);
    en(s.building_use, '$.site.building_use', 'building_use', ENUMS.building_use, false);
    if (s.facade_zone != null && s.facade_zone !== 1 && s.facade_zone !== 2) E('zone', '$.site.facade_zone', 'zone');
  }
  if (!Array.isArray(doc.openings)) E('array', '$.openings', 'array');
  else {
    if (doc.openings.length > LIMITS.openings) E('too_many', '$.openings', 'too_many', { n: LIMITS.openings });
    var ids = {};
    doc.openings.forEach(function (o, i) {
      var p = '$.openings[' + i + ']';
      if (!isObj(o)) { E('object', p, 'object'); return; }
      if (typeof o.id !== 'string' || !/^[A-Za-z0-9_.+-]{1,24}$/.test(o.id)) E('opening_id', p + '.id', 'opening_id');
      else if (ids[o.id]) E('duplicate_id', p + '.id', 'duplicate_id', { id: o.id }); else ids[o.id] = 1;
      if (o.label != null && (typeof o.label !== 'string' || o.label.length > LIMITS.label)) E('label', p + '.label', 'label', { n: LIMITS.label });
      en(o.kind, p + '.kind', 'kind', ENUMS.kind, false);
      Object.keys(OPENING_RANGES).forEach(function (k) { rng(o[k], p + '.' + k, OPENING_RANGES[k][0], OPENING_RANGES[k][1], k === 'w_m' || k === 'h_m'); });
      if (o.edges != null && [2, 3, 4].indexOf(o.edges) < 0) E('edges', p + '.edges', 'edges');
      en(o.public_side, p + '.public_side', 'public_side', ENUMS.public_side, false);
      var g = o.glazing;
      if (g == null) return;
      if (!isObj(g)) { E('object', p + '.glazing', 'object'); return; }
      en(g.type, p + '.glazing.type', 'type', ENUMS.gtype, true);
      if (!Array.isArray(g.panes)) { E('array', p + '.glazing.panes', 'array'); return; }
      var n = PANES_OF[g.type];
      if (n && g.panes.length !== n) E('panes_count', p + '.glazing.panes', 'panes_count', { type: g.type, n: n });
      if (n && n > 1 && (!Array.isArray(g.cavity_mm) || g.cavity_mm.length !== n - 1)) E('cavity_count', p + '.glazing.cavity_mm', 'cavity_count', { n: n - 1 });
      if (Array.isArray(g.cavity_mm)) g.cavity_mm.forEach(function (c, k) { rng(c, p + '.glazing.cavity_mm[' + k + ']', 4, 40, true); });
      g.panes.forEach(function (pa, k) {
        var q = p + '.glazing.panes[' + k + ']';
        if (!isObj(pa)) { E('object', q, 'object'); return; }
        var pl = pa.plies_mm, il = pa.interlayer_mm == null ? [] : pa.interlayer_mm;
        if (!Array.isArray(pl) || pl.length < 1 || pl.length > LIMITS.plies || pl.some(function (h) { return !isNum(h) || h < 2 || h > 25; })) E('plies', q + '.plies_mm', 'plies', { n: LIMITS.plies });
        else if (!Array.isArray(il) || il.length !== pl.length - 1 || il.some(function (h) { return !isNum(h) || h < 0.1 || h > 10; })) E('interlayers', q + '.interlayer_mm', 'interlayers');
        en(pa.glass, q + '.glass', 'glass', ENUMS.glass, false);
        en(pa.coating, q + '.coating', 'coating', ENUMS.coating, false);
        rng(pa.absorptance, q + '.absorptance', 0, 1, false);
      });
    });
  }
  if (doc.modules != null) {
    if (!isObj(doc.modules)) E('modules', '$.modules', 'modules');
    else Object.keys(doc.modules).forEach(function (k) { if (!isObj(doc.modules[k])) E('modules', '$.modules.' + k, 'modules'); });
  }
  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

function importJSON(text, iopts) {
  var lang = curMsgLang(iopts);
  if (typeof text !== 'string') return { ok: false, doc: null, errors: [mkErr('not_text', '$', 'not_text', null, lang)], warnings: [] };
  /* size in UTF-8 bytes (LIMITS.bytes), not UTF-16 code units; length as fallback where Blob/TextEncoder are missing (R2-REVIEW CR-27) */
  var nBytes = text.length;
  try { if (typeof TextEncoder === 'function') nBytes = new TextEncoder().encode(text).length; else if (typeof Blob === 'function') nBytes = new Blob([text]).size; } catch (e) { nBytes = text.length; }
  if (nBytes > LIMITS.bytes) return { ok: false, doc: null, errors: [mkErr('too_large', '$', 'too_large', null, lang)], warnings: [] };
  var doc;
  try { doc = JSON.parse(text); } catch (e) { return { ok: false, doc: null, errors: [mkErr('json', '$', 'json', { e: e.message }, lang)], warnings: [] }; }
  var v = validate(doc, { lang: lang });
  if (!v.ok) return { ok: false, doc: null, errors: v.errors, warnings: v.warnings };
  if (!isObj(doc.modules)) doc.modules = {};
  if (doc.revision == null) doc.revision = 1;
  return { ok: true, doc: doc, errors: [], warnings: v.warnings };
}
function exportJSON(doc) {
  var v = validate(doc);
  if (!v.ok) throw new Error('GlazingCore.project.exportJSON: invalid document: ' + v.errors.map(function (e) { return e.path + ' ' + e.msg_en; }).join('; '));
  return JSON.stringify(doc, null, 2);
}
/* withModule(doc, toolId, {state, results, summary}) -> new document; a tool writes only modules.<toolId>; revision + 1 */
function withModule(doc, toolId, payload, opts) {
  if (typeof toolId !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(toolId)) throw new Error('GlazingCore.project.withModule: bad tool id');
  var next = clone(doc);
  payload = payload || {};
  if (!isObj(next.modules)) next.modules = {};
  var prev = isObj(next.modules[toolId]) ? next.modules[toolId] : {};
  var mod = clone(prev);
  ['state', 'results', 'summary'].forEach(function (k) { mod[k] = payload[k] !== undefined ? clone(payload[k]) : (prev[k] !== undefined ? prev[k] : {}); });
  Object.keys(payload).forEach(function (k) { if (['state', 'results', 'summary', 'updatedAt'].indexOf(k) < 0 && !BAD_KEYS[k]) mod[k] = clone(payload[k]); });
  mod.updatedAt = payload.updatedAt || (opts && opts.now) || new Date().toISOString();
  next.modules[toolId] = mod;
  next.revision = (isNum(next.revision) ? next.revision : 0) + 1;
  var v = validate(next);
  if (!v.ok) throw new Error('GlazingCore.project.withModule: result invalid: ' + v.errors[0].path + ' ' + v.errors[0].msg_en);
  return next;
}
function storage() { try { return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null; } catch (e) { return null; } }
function load() {
  var ls = storage(); if (!ls) return null;
  var raw; try { raw = ls.getItem(STORAGE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  var r = importJSON(raw);
  return r.ok ? r.doc : null;
}
function save(doc) {
  var ls = storage(); if (!ls) return { ok: false, error: 'storage_unavailable' };
  var text;
  try { text = exportJSON(doc); } catch (e) { return { ok: false, error: 'invalid', detail: e.message }; }
  try { ls.setItem(STORAGE_KEY, text); return { ok: true }; } catch (e) { return { ok: false, error: 'storage_blocked', detail: String(e && e.message || e) }; }
}
function opening(doc, id) { var o = doc && doc.openings || []; for (var i = 0; i < o.length; i++) if (o[i].id === id) return o[i]; return null; }
function fileName(name, ext) {
  var s = String(name || 'glazing-project').normalize ? String(name || 'glazing-project').normalize('NFKD') : String(name || 'glazing-project');
  s = s.replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'glazing-project';
  return s + ext;
}
/* pane composition label, e.g. 4-16-44.2 ; laminated plies "44.2" when equal plies with 0,38-mm multiples, else "4+4 (0.76)" */
function paneLabel(p) {
  var pl = p.plies_mm || [], il = p.interlayer_mm || [];
  if (pl.length === 1) return String(pl[0]);
  var n = il.length ? Math.round(il[0] / 0.38) : 0;
  var std = pl.length === 2 && il.length === 1 && n >= 1 && Math.abs(il[0] - n * 0.38) < 0.01;
  return std ? String(pl[0]) + String(pl[1]) + '.' + n : pl.join('+') + ' (' + il.join('+') + ')';
}
function glazingLabel(g) {
  if (!g || !g.panes) return '';
  var out = [];
  g.panes.forEach(function (p, i) { out.push(paneLabel(p)); if (i < g.panes.length - 1) out.push(String((g.cavity_mm || [])[i] || '?')); });
  return out.join('-');
}

/* =====================================================================================
   7. SOURCES (norm + clause, never norm text)
   ===================================================================================== */
var S = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var NBN2 = 'NBN S 23-002-2 Vitrerie — Partie 2 : Calcul des épaisseurs de verre', NBN3 = 'NBN S 23-002-3 Vitrerie — Partie 3 : Épaisseurs de verre en façade',
  NBN4 = 'NBN S 23-002-4 Vitrerie — Partie 4 : Verre feuilleté, calcul détaillé', EN16612 = 'EN 16612 Glass in building — Determination of the lateral load resistance of glass panes by calculation',
  B25 = 'NBN B 25-002-1 Menuiserie extérieure — Partie 1 : Exigences de performance', EN1991 = 'EN 1991-1-4 Eurocode 1 — Actions on structures — Part 1-4: Wind actions';
var SOURCES = {
  nbn2_41: S(NBN2, '2020', '§4.1 (E, ν, ρ)'), nbn2_42: S(NBN2, '2020', '§4.2.1 / §4.2.3 (γM;A 1,8 / γM;v 1,2)'), nbn2_eq1: S(NBN2, '2020', '§4.2.1 eq. (1)'), nbn2_eq2: S(NBN2, '2020', '§4.2.3 eq. (2), Tab. 2–4'),
  nbn2_t1: S(NBN2, '2020', '§4.2.2, Tab. 1 (kmod)'), nbn2_43: S(NBN2, '2020', '§4.3 eq. (3)(4), Tab. 5–6'), nbn2_t5: S(NBN2, '2020', '§4.3 Tab. 5, §5.5.2 (ω)'),
  nbn2_52: S(NBN2, '2020', '§5.2 eq. (45)(46), Tab. 15–16'), nbn2_53: S(NBN2, '2020', '§5.3 eq. (48)–(51), Tab. 17'), nbn2_54: S(NBN2, '2020', '§5.4 eq. (52)–(55)'),
  nbn2_552: S(NBN2, '2020', '§5.5.2 eq. (56)(57), §5.5.4–5.5.5'), nbn2_553: S(NBN2, '2020', '§5.5.3 eq. (58)–(60), §5.5.4–5.5.5'), nbn2_6: S(NBN2, '2020', '§6 eq. (61)(62), Tab. 18'),
  nbn3_32: S(NBN3, '2020', '§3.2.1–3.2.2 (cprob 0,96, cpi +0,2/−0,3, zones e/5)'), nbn3_t1: S(NBN3, '2020', '§4 Tab. 1 (classes 1–7)'),
  nbn4_52: S(NBN4, '2025', '§5.2 eq. (1)(2)'), nbn4_54: S(NBN4, '2025', '§5.4.2 eq. (5)–(7)'),
  en16612_t1: S(EN16612, '2019', '§5.2 Table 1 (NDP)'), en16612_t5: S(EN16612, '2019', '§8.1.4 Table 5 (kmod)'), en16612_eq4: S(EN16612, '2019', '§8.1 eq. (4), Annex A Table A.5 (ke)'),
  en16612_eq6: S(EN16612, '2019', '§8.2 eq. (6), Tables 6–7'), en16612_b: S(EN16612, '2019', 'Annex B eq. (B.1)–(B.4), Tables B.1–B.2'),
  b25_653: S(B25, '2019', '§6.5.2–6.5.4 (ze, vb0 Fig. 9, roughness Tab. 1)'), b25_t2: S(B25, '2019', '§6.5.6 Tab. 2 (W1–W8)'),
  en1991_4: S(EN1991, '2005 (+A1:2010)', '§4.2 eq. (4.2), §4.3–4.5, Table 4.1 — recommended values; Belgian ANB:2010 not available here'),
  la_glz: S('Learning assumption of this tool package (engineering judgement; replace with project or product data)', 'glazing-core ' + VERSION + ', 2026-11', '', 'learning_assumption')
};

/* =====================================================================================
   8. UI strings + projectBar widget (DOM only when called)
   ===================================================================================== */
var UI = {
  project: L('Project', 'Проєкт', 'Projekt', 'Project', 'Projet', 'Proyecto', 'Projekt'),
  openings: L('openings', 'прорізів', 'Öffnungen', 'openingen', 'ouvertures', 'huecos', 'otworów'),
  opening: L('Opening', 'Проріз', 'Öffnung', 'Opening', 'Ouverture', 'Hueco', 'Otwór'),
  site: L('Site', 'Ділянка', 'Standort', 'Locatie', 'Site', 'Emplazamiento', 'Lokalizacja'),
  importJson: L('Import JSON', 'Імпорт JSON', 'JSON importieren', 'JSON importeren', 'Importer JSON', 'Importar JSON', 'Importuj JSON'),
  exportJson: L('Export JSON', 'Експорт JSON', 'JSON exportieren', 'JSON exporteren', 'Exporter JSON', 'Exportar JSON', 'Eksportuj JSON'),
  newProject: L('New', 'Новий', 'Neu', 'Nieuw', 'Nouveau', 'Nuevo', 'Nowy'),
  use: L('Use', 'Використати', 'Verwenden', 'Gebruiken', 'Utiliser', 'Usar', 'Użyj'),
  otherModule: L('Data of another tool (kept, not used here):', 'Дані іншого інструмента (збережено, тут не використовуються):', 'Daten eines anderen Werkzeugs (erhalten, hier nicht genutzt):', 'Gegevens van een ander hulpmiddel (bewaard, hier niet gebruikt):', 'Données d’un autre outil (conservées, non utilisées ici) :', 'Datos de otra herramienta (conservados, no se usan aquí):', 'Dane innego narzędzia (zachowane, tu nieużywane):'),
  resultsFrom: L('Project has results from', 'Проєкт містить результати з', 'Projekt enthält Ergebnisse aus', 'Project bevat resultaten uit', 'Le projet contient des résultats de', 'El proyecto tiene resultados de', 'Projekt zawiera wyniki z'),
  noModules: L('No results from the other tools yet', 'Результатів інших інструментів ще немає', 'Noch keine Ergebnisse der anderen Werkzeuge', 'Nog geen resultaten van de andere tools', 'Pas encore de résultats des autres outils', 'Aún no hay resultados de las otras herramientas', 'Brak jeszcze wyników innych narzędzi'),
  invalid: L('File rejected', 'Файл відхилено', 'Datei abgelehnt', 'Bestand geweigerd', 'Fichier refusé', 'Archivo rechazado', 'Plik odrzucony'),
  imported: L('Project imported', 'Проєкт імпортовано', 'Projekt importiert', 'Project geïmporteerd', 'Projet importé', 'Proyecto importado', 'Zaimportowano projekt'),
  storageOff: L('Browser storage unavailable — keep the exported file', 'Сховище браузера недоступне — збережіть експортований файл', 'Browserspeicher nicht verfügbar — Exportdatei aufbewahren', 'Browseropslag niet beschikbaar — bewaar het exportbestand', 'Stockage du navigateur indisponible — conservez le fichier exporté', 'Almacenamiento no disponible: conserve el archivo exportado', 'Pamięć przeglądarki niedostępna — zachowaj wyeksportowany plik'),
  confirmNew: L('Start a new project? The project stored in this browser will be replaced.', 'Почати новий проєкт? Проєкт, збережений у цьому браузері, буде замінено.', 'Neues Projekt beginnen? Das in diesem Browser gespeicherte Projekt wird ersetzt.', 'Nieuw project beginnen? Het in deze browser opgeslagen project wordt vervangen.', 'Commencer un nouveau projet ? Le projet enregistré dans ce navigateur sera remplacé.', '¿Empezar un proyecto nuevo? Se reemplazará el proyecto guardado en este navegador.', 'Rozpocząć nowy projekt? Projekt zapisany w tej przeglądarce zostanie zastąpiony.'),
  siblings: L('Package tools', 'Інструменти пакета', 'Werkzeuge des Pakets', 'Tools van het pakket', 'Outils du paquet', 'Herramientas del paquete', 'Narzędzia pakietu'),
  unnamed: L('(unnamed project)', '(проєкт без назви)', '(Projekt ohne Namen)', '(naamloos project)', '(projet sans nom)', '(proyecto sin nombre)', '(projekt bez nazwy)'),
  selectOpening: L('Opening in use', 'Поточний проріз', 'Aktive Öffnung', 'Actieve opening', 'Ouverture active', 'Hueco activo', 'Aktywny otwór'),
  roughness: L('roughness', 'шорсткість', 'Rauigkeit', 'ruwheid', 'rugosité', 'rugosidad', 'chropowatość'),
  learningAssumption: L('learning assumption — replace with project data', 'навчальне припущення — замініть даними проєкту', 'Lernannahme — durch Projektdaten ersetzen', 'leeraanname — vervang door projectgegevens', 'hypothèse pédagogique — à remplacer par les données du projet', 'supuesto didáctico: sustitúyalo por datos del proyecto', 'założenie szkoleniowe — zastąp danymi projektu'),
  disclaimer: L('Planning aid; final glazing design / specification by a qualified engineer per the cited NBN / EN; national and regional regulations prevail.',
    'Допоміжний інструмент планування; остаточний розрахунок і специфікацію скління виконує кваліфікований інженер за наведеними NBN / EN; національні та регіональні норми мають пріоритет.',
    'Planungshilfe; die endgültige Bemessung / Ausschreibung der Verglasung erstellt ein qualifizierter Ingenieur nach den zitierten NBN / EN; nationale und regionale Vorschriften gehen vor.',
    'Planningshulpmiddel; het definitieve ontwerp / de bestekbeschrijving van de beglazing maakt een gekwalificeerd ingenieur volgens de geciteerde NBN / EN; nationale en regionale regels hebben voorrang.',
    'Aide à la conception ; le dimensionnement et la prescription définitifs du vitrage reviennent à un ingénieur qualifié selon les NBN / EN citées ; les réglementations nationales et régionales prévalent.',
    'Ayuda a la planificación; el cálculo y la especificación definitivos del acristalamiento corresponden a un ingeniero cualificado según las NBN / EN citadas; prevalecen las normativas nacionales y regionales.',
    'Narzędzie wspomagające planowanie; ostateczny projekt i specyfikację oszklenia wykonuje wykwalifikowany inżynier wg przywołanych NBN / EN; pierwszeństwo mają przepisy krajowe i regionalne.')
};

/* projectBar({mount, toolId, lang (string|fn), doc?, getDoc?, onChange(doc), onUse(moduleId, module, doc), onSelect(openingId), selected?, syncTabs?})
   Shows: project name + site summary + opening count, opening selector, import / export / new, results of the sibling tools (banner + Use),
   links to the 3 sibling tools. Nothing from another module is applied without the user pressing Use. */
function projectBar(opts) {
  opts = opts || {};
  if (typeof document === 'undefined') return null;
  var host = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!host) return null;
  var lang = function () { var v = typeof opts.lang === 'function' ? opts.lang() : opts.lang; return LANGS.indexOf(v) >= 0 ? v : 'en'; };
  var tx = function (k) { return t(UI[k], lang()); };
  setLang(lang);
  var doc = opts.doc ? clone(opts.doc) : (load() || emptyProject());
  var selected = opts.selected || (doc.openings[0] && doc.openings[0].id) || null;
  var storageOk = !!storage();
  function el(tag, attrs, text) {
    var x = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'style') x.style.cssText = attrs[k]; else x.setAttribute(k, attrs[k]); });
    if (text != null) x.textContent = text;
    return x;
  }
  var box = el('section', { 'class': 'glz-project-bar', 'aria-label': 'project', style: 'border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel,#fff);padding:var(--sp-3,12px);margin:var(--sp-3,12px) 0;font-size:var(--fs-small,13px);display:flex;flex-direction:column;gap:var(--sp-2,8px)' });
  var head = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' });
  var title = el('strong'), count = el('span', { style: 'color:var(--muted,#5b6675)' });
  var btnStyle = 'min-height:var(--ctl-h,32px);padding:0 10px;border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel-2,#f9fafc);color:var(--ink,#12161d);cursor:pointer;font:inherit';
  var selLabel = el('label', { style: 'display:inline-flex;gap:6px;align-items:center' }), selText = el('span'), sel = el('select', { style: btnStyle, 'data-glz': 'opening' });
  selLabel.appendChild(selText); selLabel.appendChild(sel);
  var bImport = el('button', { type: 'button', style: btnStyle, 'data-glz': 'import' }), bExport = el('button', { type: 'button', style: btnStyle, 'data-glz': 'export' }), bNew = el('button', { type: 'button', style: btnStyle, 'data-glz': 'new' });
  var file = el('input', { type: 'file', accept: '.json,application/json', hidden: 'hidden', tabindex: '-1' });
  var modules = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  var nav = el('nav', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
  var status = el('div', { role: 'status', 'aria-live': 'polite', style: 'color:var(--muted,#5b6675);min-height:1em' });
  [title, count, selLabel, bImport, bExport, bNew, file].forEach(function (x) { head.appendChild(x); });
  box.appendChild(head); box.appendChild(modules); box.appendChild(nav); box.appendChild(status);
  host.appendChild(box);

  function setDoc(next, silent, noSave) {
    doc = next;
    if (!opening(doc, selected)) selected = doc.openings[0] ? doc.openings[0].id : null;
    if (!noSave) { var r = save(doc); storageOk = r.ok; if (!r.ok) status.textContent = tx('storageOff'); }
    render();
    if (!silent && typeof opts.onChange === 'function') opts.onChange(clone(doc));
  }
  function stamp(d) { var m = d && d.modules || {}, best = ''; Object.keys(m).forEach(function (k) { var u = m[k] && m[k].updatedAt; if (typeof u === 'string' && u > best) best = u; }); return best; }
  function newerStored(cur) {
    var st = load(); if (!st) return cur;
    var a = stamp(st), b = stamp(cur);
    if (!(a > b || (a === b && (st.revision || 0) > (cur.revision || 0)))) return cur;
    doc = st; render(); return st;
  }
  function render() {
    var L_ = lang(), s = doc.site || {};
    box.setAttribute('aria-label', tx('project'));
    title.textContent = tx('project') + ': ' + (doc.name || tx('unnamed'));
    count.textContent = tx('site') + ' vb0 ' + fmt(s.vb0, L_, 0) + ' m/s · ' + tx('roughness') + ' ' + s.roughness + ' · ze ' + fmt(s.ze_m, L_, 1) + ' m · ' + (doc.openings || []).length + ' ' + tx('openings');
    selText.textContent = tx('selectOpening');
    sel.textContent = '';
    (doc.openings || []).forEach(function (o) {
      var op = el('option', { value: o.id }, o.id + (o.label ? ' — ' + o.label : '') + ' · ' + fmt(o.w_m, L_, 2) + ' × ' + fmt(o.h_m, L_, 2) + ' m' + (o.glazing ? ' · ' + glazingLabel(o.glazing) : ''));
      if (o.id === selected) op.selected = true;
      sel.appendChild(op);
    });
    sel.disabled = !(doc.openings || []).length;
    file.setAttribute('aria-label', tx('importJson'));
    bImport.textContent = tx('importJson'); bExport.textContent = tx('exportJson'); bNew.textContent = tx('newProject');
    modules.textContent = '';
    var mids = Object.keys(doc.modules || {}).filter(function (k) { return k !== opts.toolId; });
    if (!mids.length) modules.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('noModules')));
    mids.forEach(function (k) {
      var m = doc.modules[k], tool = TOOLS.filter(function (x) { return x.id === k; })[0];
      var date = m && m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
      var chip = el('span', { style: 'display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:var(--radius-pill,999px);background:var(--weak,rgba(55,99,230,.1))' });
      chip.appendChild(el('span', tool ? null : { 'data-foreign': k }, (tool ? tx('resultsFrom') + ' ' + t(tool.name, L_) : tx('otherModule') + ' ' + k) + (date ? ' (' + date + ')' : '')));
      if (typeof opts.onUse === 'function' && TOOL_IDS.indexOf(k) >= 0) {
        var bu = el('button', { type: 'button', style: btnStyle, 'data-module': k }, tx('use'));
        bu.addEventListener('click', function () { opts.onUse(k, clone(doc.modules[k]), clone(doc)); });
        chip.appendChild(bu);
      }
      modules.appendChild(chip);
    });
    nav.textContent = '';
    nav.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('siblings') + ':'));
    TOOLS.forEach(function (tool) {
      if (tool.id === opts.toolId) { nav.appendChild(el('strong', { 'aria-current': 'page' }, t(tool.name, L_))); return; }
      nav.appendChild(el('a', { href: tool.id + '.html' + (L_ !== 'en' ? '?lang=' + L_ : '') }, t(tool.name, L_)));
    });
  }
  sel.addEventListener('change', function () { selected = sel.value; if (typeof opts.onSelect === 'function') opts.onSelect(selected, clone(opening(doc, selected))); });
  bImport.addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () {
    var f = file.files && file.files[0]; if (!f) return;
    if (f.size > LIMITS.bytes) { status.textContent = tx('invalid') + ': > 2 MB'; file.value = ''; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var r = importJSON(String(rd.result), { lang: lang() });
      if (!r.ok) status.textContent = tx('invalid') + ': ' + r.errors.slice(0, 3).map(function (e) { return e.path + ' ' + e.msg; }).join('; ');
      else { setDoc(r.doc); status.textContent = tx('imported'); }
      file.value = '';
    };
    rd.readAsText(f);
  });
  bExport.addEventListener('click', function () {
    var cur = typeof opts.getDoc === 'function' ? opts.getDoc() : newerStored(doc);
    var text = exportJSON(cur);
    var a = el('a'); var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = url; a.download = fileName(cur.name || 'glazing-project', '.glz.json');
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  bNew.addEventListener('click', function () {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(tx('confirmNew'))) return;
    setDoc(emptyProject());
  });
  function onKey(e) { if (e.key === 'Escape' && e.target === sel) sel.blur(); }
  box.addEventListener('keydown', onKey);
  function onStorage(e) {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    var r = importJSON(e.newValue);
    if (r.ok) { doc = r.doc; if (!opening(doc, selected)) selected = doc.openings[0] ? doc.openings[0].id : null; render(); if (typeof opts.onChange === 'function') opts.onChange(clone(doc)); }
  }
  if (typeof window !== 'undefined' && opts.syncTabs !== false) window.addEventListener('storage', onStorage);
  render();
  if (!storageOk) status.textContent = tx('storageOff');
  return {
    element: box,
    refresh: function (next) { if (next && typeof next === 'object') { if (!validate(next).ok) throw new Error('invalid project'); doc = clone(next); } status.textContent = ''; render(); },
    getDoc: function () { return clone(doc); },
    selected: function () { return selected; },
    setDoc: function (next, o) { var v = validate(next); if (!v.ok) throw new Error('invalid project'); setDoc(clone(next), true, !!(o && o.save === false)); },
    destroy: function () { if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); box.remove(); }
  };
}

return {
  VERSION: VERSION, SCHEMA: SCHEMA, STORAGE_KEY: STORAGE_KEY, LANGS: LANGS,
  L: L, t: t, fmt: fmt, clone: clone, interp: interp,
  GLASS: GLASS, KMOD_TABLE: KMOD_TABLE, KSP: KSP, FBK: FBK, KV: KV, KE: KE, SETS: SETS, GLASS_TYPES: GLASS_TYPES,
  kmod: kmod, kmodFor: kmodFor, fgd: fgd,
  OMEGA: OMEGA, omegaFor: omegaFor, hef: hef, hefPart4: hefPart4, etaP2: etaP2, laminated: laminated,
  k1: k1, k4: k4, plate4: plate4, plate3: plate3, plate2: plate2, emin: emin, freq1: freq1, k6: k6, T17: T17, PSTAR_MAX: PSTAR_MAX,
  TERRAIN: TERRAIN, ROUGHNESS: ROUGHNESS, VB0: VB0, cprob: cprob, qp: qp,
  GLASS_CLASS_QP: GLASS_CLASS_QP, GLASS_CLASS_ZE: GLASS_CLASS_ZE, WINDOW_CLASS_ZE: WINDOW_CLASS_ZE,
  glassExposure: glassExposure, glassClassFromQp: glassClassFromQp, windowExposure: windowExposure, edgeZoneWidth: edgeZoneWidth,
  TOOLS: TOOLS, TOOL_IDS: TOOL_IDS, ENUMS: ENUMS, LIMITS: LIMITS, MSG: MSG, UI: UI, SOURCES: SOURCES,
  project: { empty: emptyProject, defaultOpening: defaultOpening, validate: validate, importJSON: importJSON, exportJSON: exportJSON, withModule: withModule,
    load: load, save: save, opening: opening, setLang: setLang, errorText: errorText, fileName: fileName, paneLabel: paneLabel, glazingLabel: glazingLabel },
  ui: { projectBar: projectBar }
};
});
