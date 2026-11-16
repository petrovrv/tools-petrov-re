/* acoustics-be-core.js — global AcuCore: shared core of the tools.petrov.re Acoustics BE package
   (acousticreqbe, airbornesound, impactsound, facadesound).
   Sections: 1 language helpers (L, t, fmt), 2 dB algebra and room / façade conversions (EN ISO 12354-1/-2/-3 §3–4),
   3 single-number rating EN ISO 717-1 (airborne, + Annex B enlarged range) and EN ISO 717-2 (impact, ΔLw of coverings),
   4 mass law and junctions (EN ISO 12354-1 Annex B.4, Annex E.3; EN ISO 12354-2 Annex B, Annex C), 5 Belgian quantities
   (NBN S 01-400-1:2022 §4: DA, DAtr, D2m,A, RA,50, LI,50), 6 project document acu.project.v1, 7 SOURCES, 8 ui.projectBar.
   Pure data + functions, no dependencies, UMD (browser global AcuCore, node module.exports). Units SI: dB, m, m², m³, kg/m², MN/m³, s, Hz.
   Norm data are short computational values with their clause / table reference (D-BW-13); the norm text is not reproduced.
   Planning aid only — acoustic design and in-situ verification by a qualified acoustician per NBN S 01-400-1 / -3. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AcuCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
'use strict';

var VERSION = '0.1.1';
var SCHEMA = 'tools.petrov.re/acoustics-be/v1';
var STORAGE_KEY = 'acu.project.v1';
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
   (same behaviour as VTCore.fmt / GlazingCore.fmt). */
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
function lg(x) { return Math.log(x) / Math.LN10; }

/* =====================================================================================
   2. dB algebra and conversions
   ===================================================================================== */
/* energetic sum of levels: 10 lg Σ 10^(Li/10); null / non-finite entries are skipped; empty -> -Infinity */
function dbSum(arr) {
  var s = 0, n = 0;
  (arr || []).forEach(function (x) { if (isNum(x)) { s += Math.pow(10, x / 10); n++; } });
  return n ? 10 * lg(s) : -Infinity;
}
/* energetic difference 10 lg(10^(a/10) − 10^(b/10)); NaN when b ≥ a */
function dbDiff(a, b) { var d = Math.pow(10, a / 10) - Math.pow(10, b / 10); return d > 0 ? 10 * lg(d) : NaN; }
function tauFromR(R) { return Math.pow(10, -R / 10); }
function RfromTau(tau) { return -10 * lg(tau); }
/* R' of parallel paths / elements expressed as R values: −10 lg Σ 10^(−Ri/10)  (EN ISO 12354-1:2017 Formula (18), -3 Formula (1)) */
function sumR(arr) {
  var s = 0;
  (arr || []).forEach(function (r) { if (isNum(r)) s += Math.pow(10, -r / 10); });
  return s > 0 ? -10 * lg(s) : Infinity;
}

var CSAB = 0.16, T0 = 0.5, A0 = 10, L0 = 1;   /* Sabine constant s/m, reference T0 s (dwellings), reference A0 m², reference length l0 m */
/* EN ISO 12354-1 §3 / Formula (2)-(3): DnT = R' + 10 lg(0,16·V/(T0·S)) = R' + 10 lg(0,32·V/S) */
function DnTfromR(Rp, V, S) { return Rp + 10 * lg(CSAB * V / (T0 * S)); }
function RfromDnT(DnT, V, S) { return DnT - 10 * lg(CSAB * V / (T0 * S)); }
/* Dn = R' + 10 lg(A0/S);  DnT = Dn + 10 lg(0,16·V/(A0·T0)) = Dn + 10 lg(0,032·V) */
function DnfromR(Rp, S) { return Rp + 10 * lg(A0 / S); }
function DnTfromDn(Dn, V) { return Dn + 10 * lg(CSAB * V / (A0 * T0)); }
/* EN ISO 12354-2 Formula (3): L'nT = L'n − 10 lg(0,16·V/(A0·T0)) = L'n − 10 lg(0,032·V) */
function LnTfromLn(Ln, V) { return Ln - 10 * lg(CSAB * V / (A0 * T0)); }
function LnfromLnT(LnT, V) { return LnT + 10 * lg(CSAB * V / (A0 * T0)); }
/* EN ISO 12354-3 Formula (4): D2m,nT = R' + ΔLfs + 10 lg(0,16·V/(T0·S)); Formula (5): D2m,n = D2m,nT − 10 lg(0,16·V/(A0·T0)) */
function D2mnT(Rp, dLfs, V, S) { return Rp + (isNum(dLfs) ? dLfs : 0) + 10 * lg(CSAB * V / (T0 * S)); }
function D2mnfromD2mnT(D, V) { return D - 10 * lg(CSAB * V / (A0 * T0)); }

/* Façade of elements, EN ISO 12354-3 §4.2 Formulae (7)-(8) + Formula (1) (direct transmission, flanking neglected):
   elements [{id?, S_m2, R_dB} | {id?, Dne_dB, n?}] ; S = total façade area seen from inside (default Σ S_m2 of area elements).
   R values may be single numbers (Rw + Ctr for RAtr) — exact for (Rw + Ctr) per §4.1 NOTE 6.  -> {R, tau, S, parts[{id, tau, share, Rp}]} */
function facadeR(elements, S) {
  var list = elements || [];
  var Stot = isNum(S) && S > 0 ? S : list.reduce(function (s, e) { return s + (isNum(e.S_m2) && !isNum(e.Dne_dB) ? e.S_m2 : 0); }, 0);
  if (!(Stot > 0)) return { ok: false, reason: 'no_area' };
  var parts = list.map(function (e, i) {
    var tau;
    if (isNum(e.Dne_dB)) tau = (isNum(e.n) ? e.n : 1) * A0 / Stot * Math.pow(10, -e.Dne_dB / 10);
    else tau = e.S_m2 / Stot * Math.pow(10, -e.R_dB / 10);
    return { id: e.id != null ? e.id : String(i), tau: tau };
  });
  var tot = parts.reduce(function (s, p) { return s + p.tau; }, 0);
  parts.forEach(function (p) { p.share = tot > 0 ? p.tau / tot : 0; p.Rp = -10 * lg(p.tau); });
  return { ok: true, R: -10 * lg(tot), tau: tot, S: Stot, parts: parts };
}

/* =====================================================================================
   3. Single-number rating — EN ISO 717-1:2020 (airborne) and EN ISO 717-2:2020 (impact)
   ===================================================================================== */
var F_THIRD = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150];
var F_OCT = [125, 250, 500, 1000, 2000];
var F_THIRD_EXT = [50, 63, 80].concat(F_THIRD, [4000, 5000]);
var F_OCT_EXT = [63].concat(F_OCT, [4000]);
/* 717-1 §4.2 Table 3 reference values; §4.3 Table 4 spectra No. 1 (C) / No. 2 (Ctr), 100–3150 / 125–2000 */
var REF717_1 = { third: [33, 36, 39, 42, 45, 48, 51, 52, 53, 54, 55, 56, 56, 56, 56, 56], octave: [36, 45, 52, 55, 56] };
var SPEC717_1 = {
  third: { c: [-29, -26, -23, -21, -19, -17, -15, -13, -12, -11, -10, -9, -9, -9, -9, -9], ctr: [-20, -20, -18, -16, -15, -14, -13, -12, -11, -9, -8, -9, -10, -11, -13, -15] },
  octave: { c: [-21, -14, -8, -5, -4], ctr: [-14, -10, -7, -4, -6] }
};
/* 717-1 Annex B Table B.1 (enlarged range): keyed by frequency; c3150 = column C50-3150, c5000 = column C50-5000 / C100-5000, ctr = spectrum No. 2 */
var SPEC717_1_EXT = {
  third: {
    c3150: { 50: -40, 63: -36, 80: -33, 100: -29, 125: -26, 160: -23, 200: -21, 250: -19, 315: -17, 400: -15, 500: -13, 630: -12, 800: -11, 1000: -10, 1250: -9, 1600: -9, 2000: -9, 2500: -9, 3150: -9 },
    c5000: { 50: -41, 63: -37, 80: -34, 100: -30, 125: -27, 160: -24, 200: -22, 250: -20, 315: -18, 400: -16, 500: -14, 630: -13, 800: -12, 1000: -11, 1250: -10, 1600: -10, 2000: -10, 2500: -10, 3150: -10, 4000: -10, 5000: -10 },
    ctr: { 50: -25, 63: -23, 80: -21, 100: -20, 125: -20, 160: -18, 200: -16, 250: -15, 315: -14, 400: -13, 500: -12, 630: -11, 800: -9, 1000: -8, 1250: -9, 1600: -10, 2000: -11, 2500: -13, 3150: -15, 4000: -16, 5000: -18 }
  },
  octave: {
    c3150: { 63: -31, 125: -21, 250: -14, 500: -8, 1000: -5, 2000: -4 },
    c5000: { 63: -32, 125: -22, 250: -15, 500: -9, 1000: -6, 2000: -5, 4000: -5 },
    ctr: { 63: -18, 125: -14, 250: -10, 500: -7, 1000: -4, 2000: -6, 4000: -11 }
  }
};
/* 717-2 §4.2 Table 3 reference values; §5.2 Table 4 Ln,r,0 of the heavyweight reference floor (100–3150 Hz) */
var REF717_2 = { third: [62, 62, 62, 62, 62, 62, 61, 60, 59, 58, 57, 54, 51, 48, 45, 42], octave: [67, 67, 65, 62, 49] };
var LNR0_717_2 = [67, 67.5, 68, 68.5, 69, 69.5, 70, 70.5, 71, 71.5, 72, 72, 72, 72, 72, 72];
var LNR0W = 78, CIR0 = -11;   /* 717-2 A.2.2: Ln,r,0,w = 78 dB, CI,r,0 = −11 dB */

/* data to one decimal place: multiply by 10, add 0,5, integer part (717-1 §4.4 footnote 1 / 717-2 §4.3.1 footnote 1); kept in tenths */
function tenths(x) { return Math.floor(x * 10 + 0.5 + 1e-9); }
function round1(x) { return tenths(x) / 10; }
/* integer rounding of XA / Lsum (ISO 80000-1 as in the footnotes: ≥ ,5 up) */
function roundInt(x) { return Math.floor(x + 0.5 + 1e-9); }

/* bands: array aligned to F_THIRD / F_OCT, or an object {freq: value} (may hold enlarged-range bands 50/63/80/4000/5000).
   -> {range, freqs, map{f: value in tenths-rounded dB}} ; throws on missing core bands */
function normBands(bands, range, who) {
  var core = range === 'octave' ? F_OCT : F_THIRD, ext = range === 'octave' ? F_OCT_EXT : F_THIRD_EXT, map = {};
  if (Array.isArray(bands)) {
    if (bands.length === core.length) core.forEach(function (f, i) { map[f] = bands[i]; });
    else if (bands.length === ext.length) ext.forEach(function (f, i) { map[f] = bands[i]; });
    else throw new Error('AcuCore.' + who + ': ' + core.length + ' (or ' + ext.length + ') band values expected for range ' + range);
  } else if (isObj(bands)) Object.keys(bands).forEach(function (k) { map[Number(k)] = bands[k]; });
  else throw new Error('AcuCore.' + who + ': bands expected');
  var out = {};
  ext.forEach(function (f) { if (isNum(map[f])) out[f] = round1(map[f]); });
  core.forEach(function (f) { if (!isNum(out[f])) throw new Error('AcuCore.' + who + ': band ' + f + ' Hz missing'); });
  return out;
}
function hasBands(map, fs) { return fs.every(function (f) { return isNum(map[f]); }); }
/* XA = −10 lg Σ 10^((Li − Xi)/10) over the frequencies of spectrum spec{f: Li}; null if a band is missing */
function XA(map, spec, fs) {
  if (!hasBands(map, fs)) return null;
  var s = 0;
  fs.forEach(function (f) { s += Math.pow(10, (spec[f] - map[f]) / 10); });
  return -10 * lg(s);
}

/* rate717_1(bands, {range:'third'|'octave'}) -> {Xw, C, Ctr, C50_3150, Ctr50_3150, C50_5000, Ctr50_5000, C100_5000, Ctr100_5000,
   shift, sumUnfav, deviations[], XA1, XA2, range}. Shift of the reference curve in 1-dB steps so that the sum of unfavourable deviations
   (X below the curve) is as large as possible but ≤ 32,0 dB (16 third-octave bands) / ≤ 10,0 dB (5 octave bands) — §4.4;
   Xw = shifted reference value at 500 Hz; C = round(XA1) − Xw, Ctr = round(XA2) − Xw — §4.5 Formula (1)–(2); enlarged terms Annex B
   (null when the bands are not given). */
function rate717_1(bands, o) {
  o = o || {};
  var range = o.range === 'octave' ? 'octave' : 'third';
  var map = normBands(bands, range, 'rate717_1');
  var fs = range === 'octave' ? F_OCT : F_THIRD, ref = REF717_1[range], lim = range === 'octave' ? 100 : 320;
  var X = fs.map(function (f) { return tenths(map[f]); });
  function unfav(s) { var sum = 0; for (var i = 0; i < fs.length; i++) { var d = (ref[i] + s) * 10 - X[i]; if (d > 0) sum += d; } return sum; }
  var s = Math.ceil((Math.min.apply(null, X) / 10) - ref[0]) - 80;
  while (unfav(s + 1) <= lim) s++;
  while (unfav(s) > lim) s--;
  var i500 = fs.indexOf(500), Xw = ref[i500] + s;
  var dev = fs.map(function (f, i) { var d = (ref[i] + s) * 10 - X[i]; return d > 0 ? d / 10 : 0; });
  var sp = SPEC717_1[range], specC = {}, specT = {};
  fs.forEach(function (f, i) { specC[f] = sp.c[i]; specT[f] = sp.ctr[i]; });
  var xa1 = XA(map, specC, fs), xa2 = XA(map, specT, fs);
  var E = SPEC717_1_EXT[range];
  var lo = range === 'octave' ? [63] : [50, 63, 80], hi = range === 'octave' ? [4000] : [4000, 5000];
  var f3150 = lo.concat(fs), f5000 = lo.concat(fs, hi), f100_5000 = fs.concat(hi);
  function term(spec, list) { var x = XA(map, spec, list); return x == null ? null : roundInt(x) - Xw; }
  return { range: range, Xw: Xw, shift: s, sumUnfav: unfav(s) / 10, deviations: dev, XA1: xa1, XA2: xa2,
    C: roundInt(xa1) - Xw, Ctr: roundInt(xa2) - Xw,
    C50_3150: term(E.c3150, f3150), Ctr50_3150: term(E.ctr, f3150),
    C50_5000: term(E.c5000, f5000), Ctr50_5000: term(E.ctr, f5000),
    C100_5000: term(E.c5000, f100_5000), Ctr100_5000: term(E.ctr, f100_5000), source: 'iso717_1' };
}

/* rate717_2(bands, {range}) -> {Lw, CI, CI50_2500, Lsum, shift, sumUnfav, deviations[], range}. Shift the reference curve in 1-dB steps
   so that the sum of unfavourable deviations (L above the curve) is as large as possible but ≤ 32,0 dB (third) / ≤ 10,0 dB (octave);
   Lw = shifted reference at 500 Hz (octave: minus 5 dB) — §4.3; CI = Lsum − 15 − Lw with Lsum the energetic sum 100–2500 Hz
   (125–2000 Hz octave) rounded to an integer — Annex A.2.1 (A.1)–(A.3); CI50_2500 adds 50/63/80 Hz (octave CI,63-2000 adds 63 Hz). */
function rate717_2(bands, o) {
  o = o || {};
  var range = o.range === 'octave' ? 'octave' : 'third';
  var map = normBands(bands, range, 'rate717_2');
  var fs = range === 'octave' ? F_OCT : F_THIRD, ref = REF717_2[range], lim = range === 'octave' ? 100 : 320;
  var X = fs.map(function (f) { return tenths(map[f]); });
  function unfav(s) { var sum = 0; for (var i = 0; i < fs.length; i++) { var d = X[i] - (ref[i] + s) * 10; if (d > 0) sum += d; } return sum; }
  var s = Math.floor(Math.max.apply(null, X) / 10) - ref[ref.length - 1] + 2;
  while (unfav(s - 1) <= lim) s--;
  while (unfav(s) > lim) s++;
  var i500 = fs.indexOf(500), Lw = ref[i500] + s - (range === 'octave' ? 5 : 0);
  var dev = fs.map(function (f, i) { var d = X[i] - (ref[i] + s) * 10; return d > 0 ? d / 10 : 0; });
  var sumF = range === 'octave' ? F_OCT : F_THIRD.slice(0, 15);
  var Lsum = dbSum(sumF.map(function (f) { return map[f]; }));
  var extF = (range === 'octave' ? [63] : [50, 63, 80]).concat(sumF);
  var Lsum50 = hasBands(map, extF) ? dbSum(extF.map(function (f) { return map[f]; })) : null;
  return { range: range, Lw: Lw, shift: s, sumUnfav: unfav(s) / 10, deviations: dev, Lsum: Lsum,
    CI: roundInt(Lsum) - 15 - Lw, CI50_2500: Lsum50 == null ? null : roundInt(Lsum50) - 15 - Lw, source: 'iso717_2' };
}

/* dLw(deltaL) — 717-2 §5 (+ Annex A.2.2): ΔL of a covering in 16 third-octave bands 100–3150 Hz -> Ln,r = Ln,r,0 − ΔL (Table 4),
   rated -> {dLw = 78 − Ln,r,w, Lnrw, CIr, CIdelta = −11 − CI,r, dLlin = ΔLw + CIΔ} */
function dLw(deltaL) {
  var map = normBands(deltaL, 'third', 'dLw');
  var Lnr = F_THIRD.map(function (f, i) { return round1(LNR0_717_2[i] - map[f]); });
  var r = rate717_2(Lnr, { range: 'third' });
  var CIdelta = CIR0 - r.CI;
  return { dLw: LNR0W - r.Lw, Lnrw: r.Lw, CIr: r.CI, CIdelta: CIdelta, dLlin: LNR0W - r.Lw + CIdelta, Lnr: Lnr, source: 'iso717_2_5' };
}

/* =====================================================================================
   4. Mass law, junctions, floors — EN ISO 12354-1 Annex B.4 / E.3, EN ISO 12354-2 Annex B / C
   ===================================================================================== */
/* EN ISO 12354-1 Annex B.4 Formula (B.11): Rw = 37,5 lg(m'/m'0) − 42 dB (m'0 = 1 kg/m²), homogeneous elements, valid for m' > 150 kg/m² */
function RwMass(m) { return 37.5 * lg(m) - 42; }
/* Formula (B.12): Ctr = 16 − 9 lg(m'/m'0), limited to −7 … −1 dB */
function CtrMass(m) { return Math.max(-7, Math.min(-1, 16 - 9 * lg(m))); }
/* "C is about constant: −1 till −2 dB for the higher masses" (B.4) — taken as −1 up to 400 kg/m², −2 above (learning assumption) */
function CMass(m) { return m > 400 ? -2 : -1; }
/* massLaw(m') -> {ok, Rw, C, Ctr, sources} ; m' ≤ 150 kg/m² -> ok:false reason 'below_150' (B.11 not valid; lab data needed) */
function massLaw(m) {
  if (!isNum(m) || m <= 0) return { ok: false, reason: 'bad_mass' };
  if (m <= 150) return { ok: false, reason: 'below_150', Rw: null };
  return { ok: true, Rw: RwMass(m), C: CMass(m), Ctr: CtrMass(m), sources: { Rw: 'iso12354_1_b11', Ctr: 'iso12354_1_b12', C: 'la_acu_c' } };
}

/* EN ISO 12354-1 Formula (22)/(23): combined improvement of two linings ΔR1, ΔR2 (one layer -> itself; two layers -> higher + half of
   the lower; both negative -> lower + half of the higher) */
function dRcombine(d1, d2) {
  var a = isNum(d1) ? d1 : null, b = isNum(d2) ? d2 : null;
  if (a == null) return b == null ? 0 : b;
  if (b == null) return a;
  var hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi < 0 && lo < 0) ? lo + hi / 2 : hi + lo / 2;
}
/* EN ISO 12354-1 §4.4.2 Formula (20): Rij,w = Ri,w/2 + Rj,w/2 + ΔRij,w + Kij + 10 lg(Ss/(l0·lf)), l0 = 1 m */
function Rij(Ri, Rj, dRij, Kij, Ss, lf) { return Ri / 2 + Rj / 2 + (isNum(dRij) ? dRij : 0) + Kij + 10 * lg(Ss / (L0 * lf)); }

/* Kij of EN ISO 12354-1 Annex E.3 (empirical, in-situ based); M = lg(m'⊥i / m'i) — Formula (E.3).
   kij({junction, path, m_i, m_perp | M, f?, joints?, load_kNm2?, Cc?, fl?}) -> {ok, K, M, freqDependent, source, warnings[]}
   junction: 'rigid_cross' (E.3.2) | 'rigid_T' (E.3.3) | 'flexible_cross' | 'flexible_T' (E.3.4: rigid + joints·Δl) |
             'lightweight' (E.3.5, double-leaf lightweight wall meeting homogeneous elements) | 'corner' | 'thickness_change' (E.3.6)
   path: 'straight' (K13: through the junction in the same plane) | 'corner' (K12 = K23: around the corner)
         | for 'lightweight' also 'light_straight' (K24 of Fig. E.7: path 2→4 along the continuous homogeneous element
           past the lightweight leaves 1/3, valid m2/m1 > 3; M = lg(m'light/m'continuous) < 0)
   m_i: element of the path whose plane continues (element 1 of the figures); m_perp: the perpendicular element (2).
   Frequency-dependent values (E.3.4 Δl, E.3.5) at f; without f the arithmetic mean over the third-octave bands 250–1000 Hz
   is taken (§4.4.3 b, simplified model). */
var KIJ_AVG_F = [250, 315, 400, 500, 630, 800, 1000];
var JUNCTIONS = ['rigid_cross', 'rigid_T', 'flexible_cross', 'flexible_T', 'lightweight', 'corner', 'thickness_change'];
function kijAt(o, M, f, warn) {
  var j = o.junction, p = o.path;
  if (j === 'rigid_cross' || j === 'flexible_cross' || j === 'rigid_T' || j === 'flexible_T') {
    var cross = j.indexOf('cross') >= 0, base = cross ? 8.7 : 5.7, k1 = cross ? 17.1 : 14.1;
    var K = p === 'straight' ? base + k1 * M + 5.7 * M * M : base + 5.7 * M * M;
    if (j.indexOf('flexible') === 0) {
      var Cc = isNum(o.Cc) ? o.Cc : (!isNum(o.load_kNm2) ? 20 : o.load_kNm2 < 80 ? 20 : o.load_kNm2 <= 750 ? 15 : 10);
      var fl = isNum(o.fl) ? o.fl : 110;
      var dl = Math.max(5, Cc * lg(f / fl));
      var n = o.joints === 2 ? 2 : o.joints === 0 ? 0 : 1;
      K += n * dl;
    }
    return K;
  }
  if (j === 'lightweight') {
    if (p === 'straight') return Math.max(10, 10 + 20 * M - 3.3 * lg(f / 500));
    if (p === 'light_straight') { if (warn && M > -lg(3)) warn.push('lightweight_k24_ratio'); return 3.0 + 14.1 * M + 5.7 * M * M; }
    return 10 + 10 * Math.abs(M) + 3.3 * lg(f / 500);
  }
  if (j === 'corner') return Math.max(-2, 15 * Math.abs(M) - 3);
  if (j === 'thickness_change') return 5 * M * M - 5;
  throw new Error('AcuCore.kij: unknown junction ' + j);
}
function kij(o) {
  o = o || {};
  if (JUNCTIONS.indexOf(o.junction) < 0) return { ok: false, reason: 'junction' };
  var paths = o.junction === 'lightweight' ? ['straight', 'corner', 'light_straight'] : (o.junction === 'corner' || o.junction === 'thickness_change') ? ['corner', 'straight'] : ['straight', 'corner'];
  if (paths.indexOf(o.path) < 0) return { ok: false, reason: 'path' };
  var M = isNum(o.M) ? o.M : (isNum(o.m_i) && isNum(o.m_perp) && o.m_i > 0 && o.m_perp > 0 ? lg(o.m_perp / o.m_i) : null);
  if (M == null) return { ok: false, reason: 'mass' };
  var warnings = [];
  var fdep = o.junction === 'lightweight' && o.path !== 'light_straight' || (o.junction.indexOf('flexible') === 0 && o.joints !== 0);
  var K;
  if (!fdep) K = kijAt(o, M, 500, warnings);
  else if (isNum(o.f)) K = kijAt(o, M, o.f, warnings);
  else K = KIJ_AVG_F.reduce(function (s, f) { return s + kijAt(o, M, f, null); }, 0) / KIJ_AVG_F.length;
  if (Math.abs(M) > lg(30) + 1e-9) warnings.push('mass_ratio_range');
  var src = { rigid_cross: 'iso12354_1_e32', rigid_T: 'iso12354_1_e33', flexible_cross: 'iso12354_1_e34', flexible_T: 'iso12354_1_e34', lightweight: 'iso12354_1_e35', corner: 'iso12354_1_e36', thickness_change: 'iso12354_1_e36' }[o.junction];
  return { ok: true, K: K, M: M, freqDependent: fdep, f: isNum(o.f) ? o.f : (fdep ? 'avg250_1000' : null), source: src, warnings: warnings };
}

/* EN ISO 12354-2 Annex B.2 Formula (B.5): Ln,eq,0,w = 164 − 35 lg(m'/1 kg/m²), homogeneous floors, 100–600 kg/m² */
function LnEq0w(m) { return 164 - 35 * lg(m); }
function lnEq0(m) {
  if (!isNum(m) || m <= 0) return { ok: false, reason: 'bad_mass' };
  return { ok: true, Lneq0w: LnEq0w(m), inRange: m >= 100 && m <= 600, source: 'iso12354_2_b5' };
}
/* Annex C Formula (C.2): f0 = 160 √(s'/m') Hz (s' MN/m³, m' kg/m²); (C.1) ΔL = 30 lg(f/f0) cement / calcium-sulfate screeds,
   (C.3) ΔL = 40 lg(f/f0) asphalt or dry floating floors (0 below f0) */
function floatingF0(s, m) { return 160 * Math.sqrt(s / m); }
function dLFloating(f, f0, type) { return f <= f0 ? 0 : (type === 'dry' ? 40 : 30) * lg(f / f0); }
/* (C.6) s'tot = (Σ 1/s'i)^−1 for stacked resilient layers covering the whole floor */
function sTot(list) { var s = 0; (list || []).forEach(function (x) { if (isNum(x) && x > 0) s += 1 / x; }); return s > 0 ? 1 / s : NaN; }
/* ΔLw of floating floors: (C.4) wet (sand/cement, calcium-sulfate) ΔLw = 13 lg m' − 14,2 lg s' + 20,8 (Fig. C.1: m' 60–160, s' 4–50);
   (C.5) dry / asphalt ΔLw = (−0,21 m' − 5,45) lg s' + 0,46 m' + 23,8 (Fig. C.2: m' 15–60, s' 10–50) -> {ok, dLw, f0, inRange} */
function dLwFloating(m, s, type) {
  if (!isNum(m) || !isNum(s) || m <= 0 || s <= 0) return { ok: false, reason: 'bad_input' };
  var dry = type === 'dry';
  var v = dry ? (-0.21 * m - 5.45) * lg(s) + 0.46 * m + 23.8 : 13 * lg(m) - 14.2 * lg(s) + 20.8;
  var inRange = dry ? (m >= 15 && m <= 60 && s >= 10 && s <= 50) : (m >= 60 && m <= 160 && s >= 4 && s <= 50);
  return { ok: true, dLw: v, f0: floatingF0(s, m), inRange: inRange, source: dry ? 'iso12354_2_c5' : 'iso12354_2_c4' };
}

/* =====================================================================================
   5. Belgian single-number quantities — NBN S 01-400-1:2022 §4.1–4.3 (same in NBN S 01-400-3:2026)
   ===================================================================================== */
/* DA = DnT,w + C (between rooms, in situ); DAtr = D2m,nT,w + Ctr (façade); D2m,A = D2m,nT,w + C (galleries);
   RA,50 = Rw + C50-3150 and LI,50 = Ln,w + CI,50-2500 are ELEMENT (laboratory) quantities, not in-situ ones (§4.1 / §4.2). */
function DA(DnTw, C) { return DnTw + C; }
function DAtr(D2mnTw, Ctr) { return D2mnTw + Ctr; }
function D2mA(D2mnTw, C) { return D2mnTw + C; }
function RA50(Rw, C50_3150) { return isNum(C50_3150) ? Rw + C50_3150 : null; }
function LI50(Lnw, CI50_2500) { return isNum(CI50_2500) ? Lnw + CI50_2500 : null; }

/* =====================================================================================
   6. Project document (hand-off between the four tools), localStorage acu.project.v1
   ===================================================================================== */
var TOOLS = [
  { id: 'acousticreqbe', name: L('Acoustic Requirements BE (NBN S 01-400-1/-3)', 'Акустичні вимоги BE (NBN S 01-400-1/-3)', 'Akustische Anforderungen BE (NBN S 01-400-1/-3)', 'Akoestische eisen BE (NBN S 01-400-1/-3)', 'Exigences acoustiques BE (NBN S 01-400-1/-3)', 'Requisitos acústicos BE (NBN S 01-400-1/-3)', 'Wymagania akustyczne BE (NBN S 01-400-1/-3)') },
  { id: 'airbornesound', name: L('Airborne Sound Insulation Between Rooms', 'Звукоізоляція від повітряного шуму між приміщеннями', 'Luftschalldämmung zwischen Räumen', 'Luchtgeluidisolatie tussen ruimten', 'Isolation aux bruits aériens entre locaux', 'Aislamiento a ruido aéreo entre recintos', 'Izolacyjność od dźwięków powietrznych między pomieszczeniami') },
  { id: 'impactsound', name: L('Impact Sound Between Rooms', 'Ударний шум між приміщеннями', 'Trittschall zwischen Räumen', 'Contactgeluid tussen ruimten', 'Bruits de choc entre locaux', 'Ruido de impacto entre recintos', 'Dźwięki uderzeniowe między pomieszczeniami') },
  { id: 'facadesound', name: L('Façade Sound Insulation', 'Звукоізоляція фасаду', 'Schalldämmung der Fassade', 'Geluidisolatie van de gevel', 'Isolation acoustique des façades', 'Aislamiento acústico de fachada', 'Izolacyjność akustyczna fasady') }
];
var TOOL_IDS = TOOLS.map(function (x) { return x.id; });
var ENUMS = {
  norm: ['S01-400-1', 'S01-400-3'],
  type: ['dwelling', 'hotel', 'office', 'retirement', 'student', 'healthcare', 'generic'],
  cls: ['A', 'B', 'C'],
  use: ['bedroom', 'living', 'kitchen', 'study', 'bath', 'wc', 'storage', 'circulation', 'technical', 'garage', 'shop', 'horeca', 'office', 'meeting',
    'open_office', 'hotel_room', 'patient_room', 'classroom', 'atrium', 'restaurant', 'other'],
  relation: ['other_dwelling', 'same_dwelling', 'circulation_1door', 'circulation_lobby', 'nonres_same_bldg', 'nonres_other_bldg', 'same_unit', 'other_unit'],
  element: ['wall', 'floor'],
  ekind: ['wall', 'window', 'door', 'vent', 'shutter_box', 'roof', 'other']
};
var LIMITS = { bytes: 2000000, depth: 64, nodes: 100000, rooms: 300, pairs: 600, facades: 300, elements: 40, label: 60 };
var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
var ROOM_RANGES = { V_m3: [1, 100000], floor_m2: [0.5, 20000], T_s: [0.05, 20] };
var PAIR_RANGES = { S_m2: [0.5, 1000], LAeq15_dB: [30, 130], LAF5_dB: [30, 130] };
var FACADE_RANGES = { S_m2: [0.5, 2000], LAday_dB: [20, 100], LAnight_dB: [20, 100], LAmax3x_night_dB: [20, 130] };
var ELEMENT_RANGES = { S_m2: [0.01, 2000], n: [0.1, 100], RAtr_dB: [0, 90], RA_dB: [0, 90], Rw_dB: [0, 90], Ctr_dB: [-30, 5], DneAtr_dB: [0, 100], DneA_dB: [0, 100] };
var TARGET_RANGES = { DA_min: [0, 100], RA50_min: [0, 100], LnTw_max: [0, 120], LI50_max: [0, 120], DAtr_min: [0, 100], D2mA_min: [0, 100] };
var ID_RE = /^[A-Za-z0-9_.+-]{1,24}$/;

function emptyProject(opts) {
  opts = opts || {};
  return { schema: SCHEMA, revision: 1, name: opts.name || '',
    building: { norm: 'S01-400-1', type: 'dwelling', 'class': 'C', two_new_houses: false },
    rooms: [defaultRoom('R1', 'bedroom', 'D1'), defaultRoom('R2', 'living', 'D2')],
    pairs: [defaultPair('P1', 'R2', 'R1')],
    facades: [defaultFacade('F1', 'R1')],
    targets: {}, modules: {} };
}
function defaultRoom(id, use, dwelling) { return { id: id, label: '', use: use || 'bedroom', dwelling: dwelling || 'D1', V_m3: 40, floor_m2: 16, T_s: 0.5 }; }
function defaultPair(id, from, to) { return { id: id, from: from, to: to, relation: 'other_dwelling', element: 'wall', S_m2: 12, door: false, confidential: false, LAeq15_dB: null, LAF5_dB: null }; }
function defaultFacade(id, room) {
  return { id: id, room: room, S_m2: 11.3, LAday_dB: 65, LAnight_dB: 58, LAmax3x_night_dB: null, second_facade_vents: false, gallery: false,
    elements: [{ kind: 'wall', S_m2: 6.8, n: 1, RAtr_dB: 52, DneAtr_dB: null }, { kind: 'window', S_m2: 4.5, n: 1, RAtr_dB: 30, DneAtr_dB: null }, { kind: 'vent', S_m2: 0.1, n: 1, RAtr_dB: null, DneAtr_dB: 34 }] };
}

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
  modules: L('modules must be an object of objects', 'modules має бути об’єктом з об’єктів', 'modules muss ein Objekt aus Objekten sein', 'modules moet een object van objecten zijn', 'modules doit être un objet d’objets', 'modules debe ser un objeto de objetos', 'modules musi być obiektem obiektów'),
  not_text: L('text expected', 'очікується текст', 'Text erwartet', 'tekst verwacht', 'texte attendu', 'se espera un texto', 'oczekiwano tekstu'),
  too_large: L('file larger than 2 MB', 'файл більший за 2 МБ', 'Datei größer als 2 MB', 'bestand groter dan 2 MB', 'fichier de plus de 2 Mo', 'archivo de más de 2 MB', 'plik większy niż 2 MB'),
  json: L('invalid JSON: {e}', 'некоректний JSON: {e}', 'ungültiges JSON: {e}', 'ongeldige JSON: {e}', 'JSON invalide : {e}', 'JSON no válido: {e}', 'nieprawidłowy JSON: {e}'),
  item_id: L('id: 1–24 characters A-Z a-z 0-9 _ . + -', 'id: 1–24 символи A-Z a-z 0-9 _ . + -', 'id: 1–24 Zeichen A-Z a-z 0-9 _ . + -', 'id: 1–24 tekens A-Z a-z 0-9 _ . + -', 'id : 1 à 24 caractères A-Z a-z 0-9 _ . + -', 'id: 1–24 caracteres A-Z a-z 0-9 _ . + -', 'id: 1–24 znaki A-Z a-z 0-9 _ . + -'),
  duplicate_id: L('duplicate id {id}', 'повторний id {id}', 'doppelte ID {id}', 'dubbele id {id}', 'identifiant en double {id}', 'id duplicado {id}', 'powtórzony id {id}'),
  too_many: L('more than {n} items', 'понад {n} елементів', 'mehr als {n} Einträge', 'meer dan {n} items', 'plus de {n} éléments', 'más de {n} elementos', 'ponad {n} pozycji'),
  unknown_room: L('unknown room {id}', 'невідоме приміщення {id}', 'unbekannter Raum {id}', 'onbekende ruimte {id}', 'local inconnu {id}', 'recinto desconocido {id}', 'nieznane pomieszczenie {id}'),
  same_room: L('a pair needs two different rooms', 'пара потребує двох різних приміщень', 'ein Paar braucht zwei verschiedene Räume', 'een paar vraagt twee verschillende ruimten', 'une paire demande deux locaux différents', 'un par necesita dos recintos distintos', 'para wymaga dwóch różnych pomieszczeń'),
  element_value: L('element needs RAtr_dB (or Rw_dB + Ctr_dB) or DneAtr_dB', 'елемент потребує RAtr_dB (або Rw_dB + Ctr_dB) чи DneAtr_dB', 'Element braucht RAtr_dB (oder Rw_dB + Ctr_dB) oder DneAtr_dB', 'element vraagt RAtr_dB (of Rw_dB + Ctr_dB) of DneAtr_dB', 'l’élément demande RAtr_dB (ou Rw_dB + Ctr_dB) ou DneAtr_dB', 'el elemento necesita RAtr_dB (o Rw_dB + Ctr_dB) o DneAtr_dB', 'element wymaga RAtr_dB (lub Rw_dB + Ctr_dB) albo DneAtr_dB'),
  unknown_target: L('target for unknown pair / façade {id}', 'ціль для невідомої пари / фасаду {id}', 'Zielwert für unbekanntes Paar / Fassade {id}', 'doelwaarde voor onbekend paar / gevel {id}', 'objectif pour une paire / façade inconnue {id}', 'objetivo para un par / fachada desconocido {id}', 'cel dla nieznanej pary / fasady {id}'),
  boolean: L('true or false expected', 'очікується true або false', 'true oder false erwartet', 'true of false verwacht', 'true ou false attendu', 'se espera true o false', 'oczekiwano true lub false')
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
  function rng(v, path, lo, hi, required) {
    if (v == null) { if (required) E('type', path, 'number'); return; }
    if (!isNum(v)) E('type', path, 'number'); else if (v < lo || v > hi) E('range', path, 'range', { lo: lo, hi: hi });
  }
  function en(v, path, k, list, required) { if (v == null) { if (required) E('enum', path, 'enum', { k: k, list: list.join('|') }); return; } if (list.indexOf(String(v)) < 0) E('enum', path, 'enum', { k: k, list: list.join('|') }); }
  function bool(v, path) { if (v != null && typeof v !== 'boolean') E('type', path, 'boolean'); }
  function lbl(v, path) { if (v != null && (typeof v !== 'string' || v.length > LIMITS.label)) E('label', path, 'label', { n: LIMITS.label }); }
  function list(arr, path, max, fn) {
    var ids = {};
    if (!Array.isArray(arr)) { E('array', path, 'array'); return ids; }
    if (arr.length > max) E('too_many', path, 'too_many', { n: max });
    arr.forEach(function (x, i) {
      var p = path + '[' + i + ']';
      if (!isObj(x)) { E('object', p, 'object'); return; }
      if (typeof x.id !== 'string' || !ID_RE.test(x.id)) E('item_id', p + '.id', 'item_id');
      else if (ids[x.id]) E('duplicate_id', p + '.id', 'duplicate_id', { id: x.id }); else ids[x.id] = 1;
      lbl(x.label, p + '.label');
      fn(x, p);
    });
    return ids;
  }
  if (!isObj(doc)) { E('not_object', '$', 'not_object'); return { ok: false, errors: errors, warnings: warnings }; }
  walk(doc, errors, lang);
  if (errors.length) return { ok: false, errors: errors, warnings: warnings };
  if (doc.schema !== SCHEMA) E('schema', '$.schema', 'schema', { s: SCHEMA });
  if (doc.revision != null && !(isNum(doc.revision) && doc.revision >= 0 && Math.floor(doc.revision) === doc.revision)) E('revision', '$.revision', 'revision');
  lbl(doc.name, '$.name');
  var b = doc.building;
  if (!isObj(b)) E('object', '$.building', 'object');
  else {
    en(b.norm, '$.building.norm', 'norm', ENUMS.norm, true);
    en(b.type, '$.building.type', 'type', ENUMS.type, true);
    en(b['class'], '$.building.class', 'class', ENUMS.cls, false);
    bool(b.two_new_houses, '$.building.two_new_houses');
  }
  var rooms = list(doc.rooms, '$.rooms', LIMITS.rooms, function (r, p) {
    en(r.use, p + '.use', 'use', ENUMS.use, true);
    lbl(r.dwelling, p + '.dwelling');
    Object.keys(ROOM_RANGES).forEach(function (k) { rng(r[k], p + '.' + k, ROOM_RANGES[k][0], ROOM_RANGES[k][1], k === 'V_m3'); });
  });
  var pairs = list(doc.pairs == null ? [] : doc.pairs, '$.pairs', LIMITS.pairs, function (x, p) {
    ['from', 'to'].forEach(function (k) { if (typeof x[k] !== 'string' || !rooms[x[k]]) E('unknown_room', p + '.' + k, 'unknown_room', { id: String(x[k]) }); });
    if (x.from === x.to && x.from != null) E('same_room', p, 'same_room');
    en(x.relation, p + '.relation', 'relation', ENUMS.relation, true);
    en(x.element, p + '.element', 'element', ENUMS.element, true);
    Object.keys(PAIR_RANGES).forEach(function (k) { rng(x[k], p + '.' + k, PAIR_RANGES[k][0], PAIR_RANGES[k][1], k === 'S_m2'); });
    bool(x.door, p + '.door'); bool(x.confidential, p + '.confidential');
  });
  var facades = list(doc.facades == null ? [] : doc.facades, '$.facades', LIMITS.facades, function (f, p) {
    if (typeof f.room !== 'string' || !rooms[f.room]) E('unknown_room', p + '.room', 'unknown_room', { id: String(f.room) });
    Object.keys(FACADE_RANGES).forEach(function (k) { rng(f[k], p + '.' + k, FACADE_RANGES[k][0], FACADE_RANGES[k][1], k === 'S_m2'); });
    bool(f.second_facade_vents, p + '.second_facade_vents'); bool(f.gallery, p + '.gallery');
    if (f.elements == null) return;
    if (!Array.isArray(f.elements)) { E('array', p + '.elements', 'array'); return; }
    if (f.elements.length > LIMITS.elements) E('too_many', p + '.elements', 'too_many', { n: LIMITS.elements });
    f.elements.forEach(function (e, i) {
      var q = p + '.elements[' + i + ']';
      if (!isObj(e)) { E('object', q, 'object'); return; }
      en(e.kind, q + '.kind', 'kind', ENUMS.ekind, true);
      lbl(e.label, q + '.label');
      Object.keys(ELEMENT_RANGES).forEach(function (k) { rng(e[k], q + '.' + k, ELEMENT_RANGES[k][0], ELEMENT_RANGES[k][1], false); });
      var hasR = isNum(e.RAtr_dB) || (isNum(e.Rw_dB) && isNum(e.Ctr_dB));
      if (!hasR && !isNum(e.DneAtr_dB)) E('element_value', q, 'element_value');
      if (hasR && !isNum(e.DneAtr_dB) && !isNum(e.S_m2)) E('type', q + '.S_m2', 'number');
    });
  });
  if (doc.targets != null) {
    if (!isObj(doc.targets)) E('object', '$.targets', 'object');
    else Object.keys(doc.targets).forEach(function (k) {
      var tg = doc.targets[k], p = '$.targets.' + k;
      if (!isObj(tg)) { E('object', p, 'object'); return; }
      if (!pairs[k] && !facades[k]) E('unknown_target', p, 'unknown_target', { id: k });
      Object.keys(TARGET_RANGES).forEach(function (q) { rng(tg[q], p + '.' + q, TARGET_RANGES[q][0], TARGET_RANGES[q][1], false); });
      if (tg.source != null && (typeof tg.source !== 'string' || tg.source.length > 400)) E('string', p + '.source', 'string');
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
  var nBytes = text.length;
  try { if (typeof TextEncoder === 'function') nBytes = new TextEncoder().encode(text).length; else if (typeof Blob === 'function') nBytes = new Blob([text]).size; } catch (e) { nBytes = text.length; }
  if (nBytes > LIMITS.bytes) return { ok: false, doc: null, errors: [mkErr('too_large', '$', 'too_large', null, lang)], warnings: [] };
  var doc;
  try { doc = JSON.parse(text); } catch (e) { return { ok: false, doc: null, errors: [mkErr('json', '$', 'json', { e: e.message }, lang)], warnings: [] }; }
  var v = validate(doc, { lang: lang });
  if (!v.ok) return { ok: false, doc: null, errors: v.errors, warnings: v.warnings };
  if (!isObj(doc.modules)) doc.modules = {};
  if (!isObj(doc.targets)) doc.targets = {};
  if (!Array.isArray(doc.pairs)) doc.pairs = [];
  if (!Array.isArray(doc.facades)) doc.facades = [];
  if (doc.revision == null) doc.revision = 1;
  return { ok: true, doc: doc, errors: [], warnings: v.warnings };
}
function exportJSON(doc) {
  var v = validate(doc);
  if (!v.ok) throw new Error('AcuCore.project.exportJSON: invalid document: ' + v.errors.map(function (e) { return e.path + ' ' + e.msg_en; }).join('; '));
  return JSON.stringify(doc, null, 2);
}
function bump(next, what) {
  next.revision = (isNum(next.revision) ? next.revision : 0) + 1;
  var v = validate(next);
  if (!v.ok) throw new Error('AcuCore.project.' + what + ': result invalid: ' + v.errors[0].path + ' ' + v.errors[0].msg_en);
  return next;
}
/* withModule(doc, toolId, {state, results, summary}) -> new document; a tool writes only modules.<toolId>; revision + 1 */
function withModule(doc, toolId, payload, opts) {
  if (typeof toolId !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(toolId)) throw new Error('AcuCore.project.withModule: bad tool id');
  var next = clone(doc);
  payload = payload || {};
  if (!isObj(next.modules)) next.modules = {};
  var prev = isObj(next.modules[toolId]) ? next.modules[toolId] : {};
  var mod = clone(prev);
  ['state', 'results', 'summary'].forEach(function (k) { mod[k] = payload[k] !== undefined ? clone(payload[k]) : (prev[k] !== undefined ? prev[k] : {}); });
  Object.keys(payload).forEach(function (k) { if (['state', 'results', 'summary', 'updatedAt'].indexOf(k) < 0 && !BAD_KEYS[k]) mod[k] = clone(payload[k]); });
  mod.updatedAt = payload.updatedAt || (opts && opts.now) || new Date().toISOString();
  next.modules[toolId] = mod;
  return bump(next, 'withModule');
}
/* withTargets(doc, {<pairId|facadeId>: {DA_min, RA50_min, LnTw_max, LI50_max, DAtr_min, D2mA_min, source, ...}}) -> new document;
   only acousticreqbe writes targets (other fields of a target survive; a null target removes it) */
function withTargets(doc, targets) {
  var next = clone(doc);
  if (!isObj(next.targets)) next.targets = {};
  Object.keys(targets || {}).forEach(function (k) {
    if (BAD_KEYS[k]) return;
    if (targets[k] == null) { delete next.targets[k]; return; }
    var prev = isObj(next.targets[k]) ? next.targets[k] : {}, tg = clone(prev);
    Object.keys(targets[k]).forEach(function (q) { if (!BAD_KEYS[q]) tg[q] = clone(targets[k][q]); });
    next.targets[k] = tg;
  });
  return bump(next, 'withTargets');
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
function byId(arr, id) { arr = arr || []; for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i]; return null; }
function room(doc, id) { return byId(doc && doc.rooms, id); }
function pair(doc, id) { return byId(doc && doc.pairs, id); }
function facade(doc, id) { return byId(doc && doc.facades, id); }
function target(doc, id) { var tg = doc && doc.targets; return isObj(tg) && isObj(tg[id]) ? tg[id] : null; }
/* element RAtr of a façade element: RAtr_dB, else Rw_dB + Ctr_dB */
function elementRAtr(e) { return isNum(e.RAtr_dB) ? e.RAtr_dB : (isNum(e.Rw_dB) && isNum(e.Ctr_dB) ? e.Rw_dB + e.Ctr_dB : null); }
function fileName(name, ext) {
  var s = String(name || 'acoustics-project');
  if (s.normalize) s = s.normalize('NFKD');
  s = s.replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'acoustics-project';
  return s + ext;
}

/* =====================================================================================
   7. SOURCES (norm + clause, never norm text)
   ===================================================================================== */
var S = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var I7171 = 'EN ISO 717-1 Acoustics — Rating of sound insulation in buildings and of building elements — Part 1: Airborne sound insulation',
  I7172 = 'EN ISO 717-2 Acoustics — Rating of sound insulation in buildings and of building elements — Part 2: Impact sound insulation',
  I1 = 'EN ISO 12354-1 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 1: Airborne sound insulation between rooms',
  I2 = 'EN ISO 12354-2 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 2: Impact sound insulation between rooms',
  I3 = 'EN ISO 12354-3 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 3: Airborne sound insulation against outdoor sound',
  NBN1 = 'NBN S 01-400-1 Critères acoustiques pour les immeubles d’habitation', NBN3 = 'NBN S 01-400-3 Acoustic requirements in non-residential buildings';
var SOURCES = {
  iso717_1: S(I7171, '2020', '§4.2 Table 3, §4.3 Table 4, §4.4, §4.5 Formula (1)–(2)'), iso717_1_b: S(I7171, '2020', 'Annex B Table B.1 (enlarged frequency range)'),
  iso717_2: S(I7172, '2020', '§4.2 Table 3, §4.3, Annex A.2.1 Formula (A.1)–(A.3)'), iso717_2_5: S(I7172, '2020', '§5 Table 4 (Ln,r,0), Annex A.2.2 Formula (A.4)–(A.5)'),
  iso12354_1_3: S(I1, '2017', '§3 / §4 (DnT = R′ + 10 lg(0,16·V/(T0·S)), T0 = 0,5 s)'), iso12354_1_442: S(I1, '2017', '§4.4.2 Formula (18)–(23), §4.4.3 b) (Kij averaged 250–1 000 Hz)'),
  iso12354_1_b11: S(I1, '2017', 'Annex B.4 Formula (B.11)'), iso12354_1_b12: S(I1, '2017', 'Annex B.4 Formula (B.12)'),
  iso12354_1_e32: S(I1, '2017', 'Annex E.3.2 Figure E.1 (rigid cross-junction)'), iso12354_1_e33: S(I1, '2017', 'Annex E.3.3 Figure E.3 (rigid T-junction)'),
  iso12354_1_e34: S(I1, '2017', 'Annex E.3.4 (flexible interlayers, Δl)'), iso12354_1_e35: S(I1, '2017', 'Annex E.3.5 Figure E.7 (lightweight double-leaf wall)'),
  iso12354_1_e36: S(I1, '2017', 'Annex E.3.6 Figure E.9 (corner / thickness change)'),
  iso12354_2_3: S(I2, '2017', '§4.1 Formula (3) (L′nT = L′n − 10 lg(0,16·V/(A0·T0)))'), iso12354_2_b5: S(I2, '2017', 'Annex B.2 Formula (B.5)'),
  iso12354_2_c: S(I2, '2017', 'Annex C.1 Formula (C.1)–(C.3)'), iso12354_2_c4: S(I2, '2017', 'Annex C.2 Formula (C.4), Figure C.1'), iso12354_2_c5: S(I2, '2017', 'Annex C.2 Formula (C.5)–(C.6), Figure C.2'),
  iso12354_3_4: S(I3, '2017', '§4.1 Formula (1)–(5), §4.2 Formula (7)–(8)'),
  nbn1_4: S(NBN1, '2022', '§4.1–4.3 (DA, RA,50, LI,50, DAtr, D2m,A)'), nbn3_3: S(NBN3, '2026', 'definitions (same quantities as part 1)'),
  la_acu_c: S('Learning assumption of this tool package (EN ISO 12354-1 B.4 gives C ≈ −1 … −2 dB: −1 up to 400 kg/m², −2 above)', 'acoustics-be-core ' + VERSION + ', 2026-11', '', 'learning_assumption')
};

/* =====================================================================================
   8. UI strings + projectBar widget (DOM only when called)
   ===================================================================================== */
var UI = {
  project: L('Project', 'Проєкт', 'Projekt', 'Project', 'Projet', 'Proyecto', 'Projekt'),
  importJson: L('Import JSON', 'Імпорт JSON', 'JSON importieren', 'JSON importeren', 'Importer JSON', 'Importar JSON', 'Importuj JSON'),
  exportJson: L('Export JSON', 'Експорт JSON', 'JSON exportieren', 'JSON exporteren', 'Exporter JSON', 'Exportar JSON', 'Eksportuj JSON'),
  newProject: L('New', 'Новий', 'Neu', 'Nieuw', 'Nouveau', 'Nuevo', 'Nowy'),
  use: L('Use', 'Використати', 'Verwenden', 'Gebruiken', 'Utiliser', 'Usar', 'Użyj'),
  otherModule: L('Data of another tool (kept, not used here):', 'Дані іншого інструмента (збережено, тут не використовуються):', 'Daten eines anderen Werkzeugs (erhalten, hier nicht genutzt):', 'Gegevens van een ander hulpmiddel (bewaard, hier niet gebruikt):', 'Données d’un autre outil (conservées, non utilisées ici) :', 'Datos de otra herramienta (conservados, no se usan aquí):', 'Dane innego narzędzia (zachowane, tu nieużywane):'),
  resultsFrom: L('Project has results from', 'Проєкт містить результати з', 'Projekt enthält Ergebnisse aus', 'Project bevat resultaten uit', 'Le projet contient des résultats de', 'El proyecto tiene resultados de', 'Projekt zawiera wyniki z'),
  savedHere: L('Saved in this tool', 'Збережено в цьому інструменті', 'In diesem Werkzeug gespeichert', 'Opgeslagen in deze tool', 'Enregistré dans cet outil', 'Guardado en esta herramienta', 'Zapisano w tym narzędziu'),
  useOwn: L('Restore the inputs saved in the project for this tool', 'Відновити вхідні дані цього інструмента, збережені в проєкті', 'Die im Projekt gespeicherten Eingaben dieses Werkzeugs wiederherstellen', 'De in het project opgeslagen invoer van deze tool herstellen', 'Restaurer les données de cet outil enregistrées dans le projet', 'Restaurar los datos de esta herramienta guardados en el proyecto', 'Przywróć dane tego narzędzia zapisane w projekcie'),
  storedNewer: L('A newer project stored in this browser (other tab) was taken', 'Узято новіший проєкт, збережений у цьому браузері (інша вкладка)', 'Ein neueres, in diesem Browser gespeichertes Projekt (anderer Tab) wurde übernommen', 'Een nieuwer project uit deze browser (ander tabblad) is overgenomen', 'Un projet plus récent enregistré dans ce navigateur (autre onglet) a été repris', 'Se tomó un proyecto más reciente guardado en este navegador (otra pestaña)', 'Przyjęto nowszy projekt zapisany w tej przeglądarce (inna karta)'),
  noModules: L('No results from the other tools yet', 'Результатів інших інструментів ще немає', 'Noch keine Ergebnisse der anderen Werkzeuge', 'Nog geen resultaten van de andere tools', 'Pas encore de résultats des autres outils', 'Aún no hay resultados de las otras herramientas', 'Brak jeszcze wyników innych narzędzi'),
  invalid: L('File rejected', 'Файл відхилено', 'Datei abgelehnt', 'Bestand geweigerd', 'Fichier refusé', 'Archivo rechazado', 'Plik odrzucony'),
  imported: L('Project imported', 'Проєкт імпортовано', 'Projekt importiert', 'Project geïmporteerd', 'Projet importé', 'Proyecto importado', 'Zaimportowano projekt'),
  storageOff: L('Browser storage unavailable — keep the exported file', 'Сховище браузера недоступне — збережіть експортований файл', 'Browserspeicher nicht verfügbar — Exportdatei aufbewahren', 'Browseropslag niet beschikbaar — bewaar het exportbestand', 'Stockage du navigateur indisponible — conservez le fichier exporté', 'Almacenamiento no disponible: conserve el archivo exportado', 'Pamięć przeglądarki niedostępna — zachowaj wyeksportowany plik'),
  confirmNew: L('Start a new project? The project stored in this browser will be replaced.', 'Почати новий проєкт? Проєкт, збережений у цьому браузері, буде замінено.', 'Neues Projekt beginnen? Das in diesem Browser gespeicherte Projekt wird ersetzt.', 'Nieuw project beginnen? Het in deze browser opgeslagen project wordt vervangen.', 'Commencer un nouveau projet ? Le projet enregistré dans ce navigateur sera remplacé.', '¿Empezar un proyecto nuevo? Se reemplazará el proyecto guardado en este navegador.', 'Rozpocząć nowy projekt? Projekt zapisany w tej przeglądarce zostanie zastąpiony.'),
  siblings: L('Package tools', 'Інструменти пакета', 'Werkzeuge des Pakets', 'Tools van het pakket', 'Outils du paquet', 'Herramientas del paquete', 'Narzędzia pakietu'),
  unnamed: L('(unnamed project)', '(проєкт без назви)', '(Projekt ohne Namen)', '(naamloos project)', '(projet sans nom)', '(proyecto sin nombre)', '(projekt bez nazwy)'),
  learningAssumption: L('learning assumption — replace with project data', 'навчальне припущення — замініть даними проєкту', 'Lernannahme — durch Projektdaten ersetzen', 'leeraanname — vervang door projectgegevens', 'hypothèse pédagogique — à remplacer par les données du projet', 'supuesto didáctico: sustitúyalo por datos del proyecto', 'założenie szkoleniowe — zastąp danymi projektu'),
  building: L('Building', 'Будівля', 'Gebäude', 'Gebouw', 'Bâtiment', 'Edificio', 'Budynek'),
  cls: L('class', 'клас', 'Klasse', 'klasse', 'classe', 'clase', 'klasa'),
  rooms: L('rooms', 'приміщень', 'Räume', 'ruimten', 'locaux', 'recintos', 'pomieszczeń'),
  pairs: L('room pairs', 'пар приміщень', 'Raumpaare', 'ruimteparen', 'paires de locaux', 'pares de recintos', 'par pomieszczeń'),
  facades: L('façade panes', 'ділянок фасаду', 'Fassadenflächen', 'gevelvlakken', 'pans de façade', 'paños de fachada', 'fragmentów fasady'),
  selectPair: L('Room pair in use', 'Поточна пара приміщень', 'Aktives Raumpaar', 'Actief ruimtepaar', 'Paire de locaux active', 'Par de recintos activo', 'Aktywna para pomieszczeń'),
  selectFacade: L('Façade pane in use', 'Поточна ділянка фасаду', 'Aktive Fassadenfläche', 'Actief gevelvlak', 'Pan de façade actif', 'Paño de fachada activo', 'Aktywny fragment fasady'),
  targetFrom: L('Target from the requirements tool', 'Ціль з інструмента вимог', 'Zielwert aus dem Anforderungswerkzeug', 'Doelwaarde uit de eisentool', 'Objectif issu de l’outil des exigences', 'Objetivo de la herramienta de requisitos', 'Cel z narzędzia wymagań'),
  noTarget: L('No target from the requirements tool for this item yet', 'Для цього елемента ще немає цілі з інструмента вимог', 'Noch kein Zielwert aus dem Anforderungswerkzeug für diesen Eintrag', 'Nog geen doelwaarde uit de eisentool voor dit item', 'Pas encore d’objectif de l’outil des exigences pour cet élément', 'Aún no hay objetivo de la herramienta de requisitos para este elemento', 'Brak jeszcze celu z narzędzia wymagań dla tej pozycji'),
  norm1: L('NBN S 01-400-1 (dwellings)', 'NBN S 01-400-1 (житло)', 'NBN S 01-400-1 (Wohnungen)', 'NBN S 01-400-1 (woningen)', 'NBN S 01-400-1 (logements)', 'NBN S 01-400-1 (viviendas)', 'NBN S 01-400-1 (mieszkania)'),
  norm3: L('NBN S 01-400-3 (non-residential)', 'NBN S 01-400-3 (нежитлові)', 'NBN S 01-400-3 (Nichtwohngebäude)', 'NBN S 01-400-3 (niet-residentieel)', 'NBN S 01-400-3 (non résidentiel)', 'NBN S 01-400-3 (no residencial)', 'NBN S 01-400-3 (niemieszkalne)'),
  disclaimer: L('Planning aid; acoustic design and in-situ verification by a qualified acoustician per NBN S 01-400-1 / -3 (the norms require it); regional regulations prevail.',
    'Допоміжний інструмент планування; акустичне проєктування та перевірку на об’єкті виконує кваліфікований акустик за NBN S 01-400-1 / -3 (цього вимагають норми); регіональні правила мають пріоритет.',
    'Planungshilfe; akustische Planung und Messung vor Ort durch einen qualifizierten Akustiker nach NBN S 01-400-1 / -3 (von den Normen verlangt); regionale Vorschriften gehen vor.',
    'Planningshulpmiddel; akoestisch ontwerp en meting ter plaatse door een gekwalificeerd akoestisch adviseur volgens NBN S 01-400-1 / -3 (de normen vragen dit); regionale regels hebben voorrang.',
    'Aide à la conception ; l’étude acoustique et la vérification in situ reviennent à un acousticien qualifié selon les NBN S 01-400-1 / -3 (les normes l’exigent) ; les réglementations régionales prévalent.',
    'Ayuda a la planificación; el diseño acústico y la verificación in situ corresponden a un acústico cualificado según NBN S 01-400-1 / -3 (las normas lo exigen); prevalecen las normativas regionales.',
    'Narzędzie wspomagające planowanie; projekt akustyczny i weryfikację na miejscu wykonuje wykwalifikowany akustyk wg NBN S 01-400-1 / -3 (wymagają tego normy); pierwszeństwo mają przepisy regionalne.')
};
var TYPE_NAMES = {
  dwelling: L('dwellings', 'житло', 'Wohnungen', 'woningen', 'logements', 'viviendas', 'mieszkania'),
  hotel: L('hotel', 'готель', 'Hotel', 'hotel', 'hôtel', 'hotel', 'hotel'),
  office: L('offices', 'офіси', 'Büros', 'kantoren', 'bureaux', 'oficinas', 'biura'),
  retirement: L('retirement home', 'будинок для літніх людей', 'Seniorenheim', 'woonzorgcentrum', 'maison de repos', 'residencia de mayores', 'dom seniora'),
  student: L('student / co-housing', 'студентське / спільне житло', 'Studenten- / Co-Housing', 'studenten- / co-housing', 'logement étudiant / co-housing', 'residencia de estudiantes / co-housing', 'akademik / co-housing'),
  healthcare: L('healthcare', 'заклад охорони здоров’я', 'Gesundheitswesen', 'zorggebouw', 'soins de santé', 'sanitario', 'ochrona zdrowia'),
  generic: L('other (generic tables)', 'інше (загальні таблиці)', 'sonstige (allgemeine Tabellen)', 'overig (algemene tabellen)', 'autre (tableaux génériques)', 'otro (tablas genéricas)', 'inne (tabele ogólne)')
};
var ELEMENT_NAMES = {
  wall: L('wall', 'стіна', 'Wand', 'wand', 'mur', 'muro', 'ściana'),
  floor: L('floor', 'перекриття', 'Decke', 'vloer', 'plancher', 'forjado', 'strop')
};
var TARGET_LABELS = { DA_min: 'DA ≥', RA50_min: 'RA,50 ≥', LnTw_max: 'L′nT,w ≤', LI50_max: 'LI,50 ≤', DAtr_min: 'DAtr ≥', D2mA_min: 'D2m,A ≥' };
function targetText(tg, lang) {
  if (!isObj(tg)) return '';
  return Object.keys(TARGET_LABELS).filter(function (k) { return isNum(tg[k]); }).map(function (k) { return TARGET_LABELS[k] + ' ' + fmt(tg[k], lang, 0) + ' dB'; }).join(' · ');
}

/* projectBar({mount, toolId, lang (string|fn), select:'pair'|'facade'|'none', doc?, getDoc?, onChange(doc), onUse(moduleId, module, doc),
   onSelect(id, item), onTarget(id, target, doc), selected?, syncTabs?})
   Shows: project name + building summary + counts, pair or façade selector, the target of the selected item from acousticreqbe
   (banner + Use), import / export / new, results of the sibling tools (banner + Use), links to the 3 sibling tools.
   Nothing from another module or from the targets is applied without the user pressing Use. */
function projectBar(opts) {
  opts = opts || {};
  if (typeof document === 'undefined') return null;
  var host = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!host) return null;
  var lang = function () { var v = typeof opts.lang === 'function' ? opts.lang() : opts.lang; return LANGS.indexOf(v) >= 0 ? v : 'en'; };
  var tx = function (k) { return t(UI[k], lang()); };
  var mode = opts.select === 'facade' ? 'facade' : opts.select === 'none' ? 'none' : 'pair';
  setLang(lang);
  var doc = opts.doc ? clone(opts.doc) : (load() || emptyProject());
  function items() { return mode === 'facade' ? (doc.facades || []) : mode === 'pair' ? (doc.pairs || []) : []; }
  var selected = opts.selected || (items()[0] && items()[0].id) || null;
  var storageOk = !!storage();
  function el(tag, attrs, text) {
    var x = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'style') x.style.cssText = attrs[k]; else x.setAttribute(k, attrs[k]); });
    if (text != null) x.textContent = text;
    return x;
  }
  var box = el('section', { 'class': 'acu-project-bar', 'aria-label': 'project', style: 'border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel,#fff);padding:var(--sp-3,12px);margin:var(--sp-3,12px) 0;font-size:var(--fs-small,13px);display:flex;flex-direction:column;gap:var(--sp-2,8px)' });
  var head = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' });
  var title = el('strong'), count = el('span', { style: 'color:var(--muted,#5b6675)' });
  var btnStyle = 'min-height:var(--ctl-h,32px);padding:0 10px;border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel-2,#f9fafc);color:var(--ink,#12161d);cursor:pointer;font:inherit';
  var selLabel = el('label', { style: 'display:inline-flex;gap:6px;align-items:center' }), selText = el('span'), sel = el('select', { style: btnStyle, 'data-acu': 'item' });
  selLabel.appendChild(selText); selLabel.appendChild(sel);
  var bImport = el('button', { type: 'button', style: btnStyle, 'data-acu': 'import' }), bExport = el('button', { type: 'button', style: btnStyle, 'data-acu': 'export' }), bNew = el('button', { type: 'button', style: btnStyle, 'data-acu': 'new' });
  var file = el('input', { type: 'file', accept: '.json,application/json', hidden: 'hidden', tabindex: '-1' });
  var tgtRow = el('div', { 'data-acu': 'target', style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  var modules = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  var nav = el('nav', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
  var status = el('div', { role: 'status', 'aria-live': 'polite', style: 'color:var(--muted,#5b6675);min-height:1em' });
  [title, count].concat(mode === 'none' ? [] : [selLabel], [bImport, bExport, bNew, file]).forEach(function (x) { head.appendChild(x); });
  box.appendChild(head); if (mode !== 'none') box.appendChild(tgtRow); box.appendChild(modules); box.appendChild(nav); box.appendChild(status);
  host.appendChild(box);

  function current() { var it = items(); for (var i = 0; i < it.length; i++) if (it[i].id === selected) return it[i]; return null; }
  function setDoc(next, silent, noSave) {
    doc = next;
    if (!current()) selected = items()[0] ? items()[0].id : null;
    if (!noSave) { var r = save(doc); storageOk = r.ok; if (!r.ok) status.textContent = tx('storageOff'); }
    render();
    if (!silent && typeof opts.onChange === 'function') opts.onChange(clone(doc));
  }
  function stamp(d) { var m = d && d.modules || {}, best = ''; Object.keys(m).forEach(function (k) { var u = m[k] && m[k].updatedAt; if (typeof u === 'string' && u > best) best = u; }); return best; }
  function newerStored(cur) {
    var st = load(); if (!st) return cur;
    var a = stamp(st), b = stamp(cur);
    if (!(a > b || (a === b && (st.revision || 0) > (cur.revision || 0)))) return cur;
    doc = st; render(); status.textContent = tx('storedNewer'); return st;
  }
  function itemText(x, L_) {
    if (mode === 'facade') { var r = room(doc, x.room); return x.id + (x.label ? ' — ' + x.label : '') + ' · ' + (r ? r.id + (r.label ? ' ' + r.label : '') : x.room) + ' · ' + fmt(x.S_m2, L_, 1) + ' m²'; }
    return x.id + (x.label ? ' — ' + x.label : '') + ' · ' + x.from + ' → ' + x.to + ' · ' + t(ELEMENT_NAMES[x.element], L_) + ' ' + fmt(x.S_m2, L_, 1) + ' m²';
  }
  function moduleSummaryText(k, sm, L_) {
    if (!sm || typeof sm !== 'object') return '';
    var parts = [], id = sm.pairId || sm.facadeId;
    function q(lbl, v) { if (typeof v === 'number' && isFinite(v)) parts.push(lbl + ' ' + fmt(v, L_, 1) + ' dB'); }
    if (k === 'airbornesound') { q('DnT,w', sm.DnTw); q('DA', sm.DA); }
    else if (k === 'impactsound') { q('L′nT,w', sm.LnTw); }
    else if (k === 'facadesound') { q('DAtr', sm.DAtr); q('D2m,A', sm.D2mA); }
    return parts.length ? (id ? id + ' · ' : '') + parts.join(' · ') : '';
  }
  function render() {
    var L_ = lang(), b = doc.building || {};
    box.setAttribute('aria-label', tx('project'));
    title.textContent = tx('project') + ': ' + (doc.name || tx('unnamed'));
    count.textContent = tx('building') + ': ' + tx(b.norm === 'S01-400-3' ? 'norm3' : 'norm1') + (b.norm === 'S01-400-3' || b.type !== 'dwelling' ? ' · ' + t(TYPE_NAMES[b.type], L_) : '') +
      (b.norm !== 'S01-400-3' && b['class'] ? ' · ' + tx('cls') + ' ' + b['class'] : '') + ' · ' + (doc.rooms || []).length + ' ' + tx('rooms') +
      ' · ' + (doc.pairs || []).length + ' ' + tx('pairs') + ' · ' + (doc.facades || []).length + ' ' + tx('facades');
    selText.textContent = tx(mode === 'facade' ? 'selectFacade' : 'selectPair');
    sel.textContent = '';
    items().forEach(function (x) { var op = el('option', { value: x.id }, itemText(x, L_)); if (x.id === selected) op.selected = true; sel.appendChild(op); });
    sel.disabled = !items().length;
    tgtRow.textContent = '';
    var tg = selected ? target(doc, selected) : null, tt = targetText(tg, L_);
    if (!tt) tgtRow.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('noTarget')));
    else {
      var chip = el('span', { style: 'display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:var(--radius-pill,999px);background:var(--weak,rgba(55,99,230,.1))' });
      chip.appendChild(el('span', null, tx('targetFrom') + ': ' + tt));
      if (typeof opts.onTarget === 'function') {
        var bt = el('button', { type: 'button', style: btnStyle, 'data-acu': 'use-target' }, tx('use'));
        bt.addEventListener('click', function () { opts.onTarget(selected, clone(tg), clone(doc)); });
        chip.appendChild(bt);
      }
      tgtRow.appendChild(chip);
    }
    file.setAttribute('aria-label', tx('importJson'));
    bImport.textContent = tx('importJson'); bExport.textContent = tx('exportJson'); bNew.textContent = tx('newProject');
    modules.textContent = '';
    /* own saved module first, with Use (restores this page's saved inputs); sibling modules as read-only chips with their key result (CR-12) */
    var all = Object.keys(doc.modules || {}), own = all.filter(function (k) { return k === opts.toolId; }), mids = all.filter(function (k) { return k !== opts.toolId; });
    if (!mids.length) modules.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('noModules')));
    own.concat(mids).forEach(function (k) {
      var m = doc.modules[k], tool = TOOLS.filter(function (x) { return x.id === k; })[0], isOwn = k === opts.toolId;
      var date = m && m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
      var chip = el('span', { style: 'display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:var(--radius-pill,999px);background:var(--weak,rgba(55,99,230,.1))' });
      var sm = !isOwn && tool ? moduleSummaryText(k, m && m.summary, L_) : '';
      var attrs = tool ? (isOwn ? { 'data-own': k } : { 'data-module': k }) : { 'data-foreign': k };
      chip.appendChild(el('span', attrs, (isOwn ? tx('savedHere') : tool ? tx('resultsFrom') + ' ' + t(tool.name, L_) : tx('otherModule') + ' ' + k) + (date ? ' (' + date + ')' : '') + (sm ? ': ' + sm : '')));
      if (isOwn && typeof opts.onUse === 'function') {
        var bu = el('button', { type: 'button', style: btnStyle, 'data-module': k, title: tx('useOwn') }, tx('use'));
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
  sel.addEventListener('change', function () { selected = sel.value; render(); if (typeof opts.onSelect === 'function') opts.onSelect(selected, clone(current())); });
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
    var cur, text;
    try { cur = typeof opts.getDoc === 'function' ? opts.getDoc() : newerStored(doc); text = exportJSON(cur); }
    catch (e) { status.textContent = tx('invalid') + ': ' + (e && e.message ? e.message : e); return; }
    var a = el('a'); var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = url; a.download = fileName(cur.name || 'acoustics-project', '.acu.json');
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  bNew.addEventListener('click', function () {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(tx('confirmNew'))) return;
    setDoc(emptyProject());
  });
  box.addEventListener('keydown', function (e) { if (e.key === 'Escape' && e.target === sel) sel.blur(); });
  function onStorage(e) {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    var r = importJSON(e.newValue);
    if (r.ok) { doc = r.doc; if (!current()) selected = items()[0] ? items()[0].id : null; render(); if (typeof opts.onChange === 'function') opts.onChange(clone(doc)); }
  }
  if (typeof window !== 'undefined' && opts.syncTabs !== false) window.addEventListener('storage', onStorage);
  render();
  if (!storageOk) status.textContent = tx('storageOff');
  return {
    element: box,
    refresh: function (next) { if (next && typeof next === 'object') { if (!validate(next).ok) throw new Error('invalid project'); doc = clone(next); if (!current()) selected = items()[0] ? items()[0].id : null; } status.textContent = ''; render(); },
    getDoc: function () { return clone(doc); },
    selected: function () { return selected; },
    setDoc: function (next, o) { var v = validate(next); if (!v.ok) throw new Error('invalid project'); setDoc(clone(next), true, !!(o && o.save === false)); },
    destroy: function () { if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); box.remove(); }
  };
}

return {
  VERSION: VERSION, SCHEMA: SCHEMA, STORAGE_KEY: STORAGE_KEY, LANGS: LANGS,
  L: L, t: t, fmt: fmt, clone: clone, lg: lg,
  dbSum: dbSum, dbDiff: dbDiff, tauFromR: tauFromR, RfromTau: RfromTau, sumR: sumR, CSAB: CSAB, T0: T0, A0: A0,
  DnTfromR: DnTfromR, RfromDnT: RfromDnT, DnfromR: DnfromR, DnTfromDn: DnTfromDn, LnTfromLn: LnTfromLn, LnfromLnT: LnfromLnT,
  D2mnT: D2mnT, D2mnfromD2mnT: D2mnfromD2mnT, facadeR: facadeR,
  F_THIRD: F_THIRD, F_OCT: F_OCT, F_THIRD_EXT: F_THIRD_EXT, F_OCT_EXT: F_OCT_EXT, REF717_1: REF717_1, SPEC717_1: SPEC717_1, SPEC717_1_EXT: SPEC717_1_EXT,
  REF717_2: REF717_2, LNR0_717_2: LNR0_717_2, round1: round1, rate717_1: rate717_1, rate717_2: rate717_2, dLw: dLw,
  RwMass: RwMass, CtrMass: CtrMass, CMass: CMass, massLaw: massLaw, dRcombine: dRcombine, Rij: Rij, JUNCTIONS: JUNCTIONS, KIJ_AVG_F: KIJ_AVG_F, kij: kij,
  LnEq0w: LnEq0w, lnEq0: lnEq0, floatingF0: floatingF0, dLFloating: dLFloating, sTot: sTot, dLwFloating: dLwFloating,
  DA: DA, DAtr: DAtr, D2mA: D2mA, RA50: RA50, LI50: LI50,
  TOOLS: TOOLS, TOOL_IDS: TOOL_IDS, ENUMS: ENUMS, LIMITS: LIMITS, MSG: MSG, UI: UI, TYPE_NAMES: TYPE_NAMES, ELEMENT_NAMES: ELEMENT_NAMES, SOURCES: SOURCES, targetText: targetText,
  project: { empty: emptyProject, defaultRoom: defaultRoom, defaultPair: defaultPair, defaultFacade: defaultFacade, validate: validate, importJSON: importJSON,
    exportJSON: exportJSON, withModule: withModule, withTargets: withTargets, load: load, save: save, room: room, pair: pair, facade: facade, target: target,
    elementRAtr: elementRAtr, setLang: setLang, errorText: errorText, fileName: fileName },
  ui: { projectBar: projectBar }
};
});
