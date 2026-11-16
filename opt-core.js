/* opt-core.js — global OptCore: shared core of the tools.petrov.re Optics & Photonics package
   (opticbench, gaussbeam, lensdesign, thinfilm, lasersafety, mvlens).
   Sections: 1 language helpers (L, t, fmt, fmtLen), 2 SOURCES, 3 optical materials (GLASS, n(λ), Abbe numbers),
   4 wavelength helpers (CIE 1931 colour, spectral and laser lines), 5 paraxial optics (ABCD matrices, cardinal points,
   y–nu trace), 6 Gaussian beams (complex q, M², Self 1983), 7 stock lens catalogue (STOCK, nearest), 8 project document
   (validate / import / export / storage / CSV), 9 ui.projectBar widget.
   Pure data + functions, no dependencies, UMD (browser global OptCore, node module.exports).
   Conventions: wavelengths in µm for n(λ) (the unit of the dispersion formulas), in nm elsewhere when the name says _nm;
   paraxial matrices act on (y, n·u) — reduced angles, det = 1; lengths in any consistent unit (the pages use mm).
   Every material and catalogue value carries its source and read date. Learning and pre-design aid only — verify final designs
   with a qualified optical engineer / laser safety officer and the manufacturer's data. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OptCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
'use strict';

var VERSION = '1.0.0';
var SCHEMA = 'tools.petrov.re/optics/v1';
var STORAGE_KEY = 'opt.project.v1';
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

/* fmt: Intl.NumberFormat(lang) with fixed digits (default by magnitude), U+2212 minus, no negative zero, null/non-finite -> '—'.
   Same behaviour as VTCore.fmt / MEPCore.fmt: en 1,402.5; de/nl 1.402,5; uk/fr/pl space groups + decimal comma; es/pl group from 5 digits. */
var FMT_FALLBACK = { en: [',', '.', 4], uk: [' ', ',', 4], de: ['.', ',', 4], nl: ['.', ',', 4], fr: [' ', ',', 4], es: ['.', ',', 5], pl: [' ', ',', 5] };
var FMT_CACHE = {};
function fmt(n, lang, digits) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '—';
  var a = Math.abs(n);
  if (digits == null) digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a === 0 ? 0 : a >= 0.01 ? 3 : Math.min(10, 2 - Math.floor(Math.log10(a)));
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

/* significant-digit variant: fmtSig(0.0012345, 'de', 3) -> '0,00123' */
function fmtSig(n, lang, sig) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '—';
  sig = sig == null ? 3 : Math.max(1, Math.min(12, sig | 0));
  if (n === 0) return fmt(0, lang, 0);
  var e = Math.floor(Math.log10(Math.abs(n)));
  var d = Math.max(0, sig - 1 - e);
  return fmt(Number(n.toPrecision(sig)), lang, Math.min(10, d));
}

/* fmtLen(m, lang, sig): length in metres -> '633 nm', '2,5 µm', '12,7 mm', '1,25 m', '3,1 km' (unit chosen by magnitude, NBSP before the unit) */
var LEN_UNITS = [[1e-9, 'nm'], [1e-6, 'µm'], [1e-3, 'mm'], [1, 'm'], [1e3, 'km']];
function lenUnit(m) {
  var a = Math.abs(m);
  if (a < 1e-6) return LEN_UNITS[0];
  if (a < 1e-3) return LEN_UNITS[1];
  if (a < 1) return LEN_UNITS[2];
  if (a < 1e4) return LEN_UNITS[3];
  return LEN_UNITS[4];
}
function fmtLen(m, lang, sig) {
  if (m == null || typeof m !== 'number' || !isFinite(m)) return '—';
  var u = lenUnit(m);
  return fmtSig(m / u[0], lang, sig == null ? 3 : sig) + ' ' + u[1];
}

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

/* =====================================================================================
   2. Sources (public references; ids are used by data entries and pages)
   ===================================================================================== */
var SOURCES = {
  born_wolf: { title: 'M. Born, E. Wolf: Principles of Optics', edition: '7th (expanded) ed., Cambridge University Press 1999', url: 'https://doi.org/10.1017/CBO9781139644181', kind: 'book' },
  hecht: { title: 'E. Hecht: Optics', edition: '5th ed., Pearson 2017', url: 'https://www.pearson.com/', kind: 'book' },
  siegman: { title: 'A. E. Siegman: Lasers', edition: 'University Science Books 1986 (ch. 15–21 Gaussian beams, ABCD, M²)', url: 'https://www.uscibooks.com/siegman.htm', kind: 'book' },
  kogelnik_li: { title: 'H. Kogelnik, T. Li: Laser beams and resonators', edition: 'Applied Optics 5(10), 1550–1567 (1966)', url: 'https://doi.org/10.1364/AO.5.001550', kind: 'paper' },
  self1983: { title: 'S. A. Self: Focusing of spherical Gaussian beams', edition: 'Applied Optics 22(5), 658–661 (1983)', url: 'https://doi.org/10.1364/AO.22.000658', kind: 'paper' },
  saleh_teich: { title: 'B. E. A. Saleh, M. C. Teich: Fundamentals of Photonics', edition: '3rd ed., Wiley 2019', url: 'https://www.wiley.com/', kind: 'book' },
  smith_moe: { title: 'W. J. Smith: Modern Optical Engineering', edition: '4th ed., McGraw-Hill 2008', url: 'https://www.mheducation.com/', kind: 'book' },
  kingslake: { title: 'R. Kingslake, R. B. Johnson: Lens Design Fundamentals', edition: '2nd ed., Academic Press / SPIE 2010', url: 'https://doi.org/10.1016/C2009-0-17868-8', kind: 'book' },
  welford: { title: 'W. T. Welford: Aberrations of Optical Systems', edition: 'Adam Hilger 1986', url: 'https://doi.org/10.1201/9781315136530', kind: 'book' },
  macleod: { title: 'H. A. Macleod: Thin-Film Optical Filters', edition: '5th ed., CRC Press 2018', url: 'https://doi.org/10.1201/9781351110983', kind: 'book' },
  goodman: { title: 'J. W. Goodman: Introduction to Fourier Optics', edition: '4th ed., W. H. Freeman 2017', url: 'https://www.macmillanlearning.com/', kind: 'book' },
  dir2006_25: { title: 'Directive 2006/25/EC on artificial optical radiation, Annex II (laser radiation: exposure limit values)', edition: 'OJ L 114, 27.4.2006', url: 'https://eur-lex.europa.eu/eli/dir/2006/25/oj', kind: 'law' },
  en60825_1: { title: 'EN 60825-1 Safety of laser products — Part 1: Equipment classification and requirements', edition: '2014 + A11:2021 (IEC 60825-1:2014)', url: 'https://webstore.iec.ch/publication/3587', kind: 'standard' },
  iec_tr60825_14: { title: 'IEC TR 60825-14 Safety of laser products — Part 14: A user’s guide', edition: '2022', url: 'https://webstore.iec.ch/', kind: 'standard' },
  en207: { title: 'EN 207 Personal eye-protection equipment — Filters and eye-protectors against laser radiation (laser eye-protectors)', edition: '2017', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
  en208: { title: 'EN 208 Personal eye-protection — Eye-protectors for adjustment work on lasers and laser systems (laser adjustment eye-protectors)', edition: '2009', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
  iso11146_1: { title: 'EN ISO 11146-1 Lasers and laser-related equipment — Test methods for laser beam widths, divergence angles and beam propagation ratios — Part 1: Stigmatic and simple astigmatic beams', edition: '2021', url: 'https://www.iso.org/standard/77768.html', kind: 'standard' },
  schott_agf: { title: 'SCHOTT optical glass data (Zemax catalogue 2017-01-20b, via refractiveindex.info)', edition: '2017-01-20', url: 'https://www.schott.com/en-us/products/optical-glass-p1000267/downloads', kind: 'catalog' },
  ohara_agf: { title: 'OHARA optical glass data (Zemax catalogue 2017-11-30, via refractiveindex.info)', edition: '2017-11-30', url: 'https://www.oharacorp.com/', kind: 'catalog' },
  cdgm_agf: { title: 'CDGM optical glass data (Zemax catalogue 2022-06, via refractiveindex.info)', edition: '2022-06', url: 'http://www.cdgmgd.com/', kind: 'catalog' },
  rii: { title: 'M. N. Polyanskiy: refractiveindex.info database (CC0), Scientific Data 11, 94 (2024)', edition: 'GitHub main branch, read 2026-11-13', url: 'https://github.com/polyanskiy/refractiveindex.info-database', kind: 'dataset' },
  malitson1965: { title: 'I. H. Malitson: Interspecimen comparison of the refractive index of fused silica', edition: 'J. Opt. Soc. Am. 55, 1205–1209 (1965)', url: 'https://doi.org/10.1364/JOSA.55.001205', kind: 'paper' },
  ciddor1996: { title: 'P. E. Ciddor: Refractive index of air: new equations for the visible and near infrared', edition: 'Applied Optics 35, 1566–1573 (1996)', url: 'https://doi.org/10.1364/AO.35.001566', kind: 'paper' },
  cie1931: { title: 'CIE 1931 2° standard colorimetric observer — analytic multi-lobe fit by C. Wyman, P.-P. Sloan, P. Shirley: Simple analytic approximations to the CIE XYZ colour matching functions', edition: 'JCGT 2(2), 1–11 (2013)', url: 'https://jcgt.org/published/0002/02/01/', kind: 'paper' },
  srgb: { title: 'IEC 61966-2-1 sRGB colour space (XYZ→sRGB matrix and transfer function)', edition: '1999', url: 'https://webstore.iec.ch/publication/6169', kind: 'standard' },
  nist_lines: { title: 'NIST Atomic Spectra Database (Fraunhofer and lamp lines)', edition: 'ASD v5', url: 'https://physics.nist.gov/asd', kind: 'dataset' },
  thorlabs: { title: 'Thorlabs public catalogue pages (lens specifications)', edition: 'read 2026-11-13', url: 'https://www.thorlabs.com/', kind: 'catalog' },
  edmund: { title: 'Edmund Optics public catalogue pages (lens specifications)', edition: 'read 2026-11-13', url: 'https://www.edmundoptics.com/', kind: 'catalog' },
  la_opt: { title: 'Learning assumption of this tool package (engineering judgement; replace with project or catalogue data)', edition: 'opt-core ' + VERSION + ', 2026-11', url: '', kind: 'learning_assumption' }
};

/* =====================================================================================
   3. Optical materials — dispersion formulas of the refractiveindex.info database (CC0), generated by _opt/core/gen_glass.py
   formula codes (λ in µm): 1 Sellmeier n²−1 = c0 + Σ c(2i−1) λ²/(λ² − c(2i)²); 2 Sellmeier-2 n²−1 = c0 + Σ c(2i−1) λ²/(λ² − c(2i));
   3 polynomial n² = c0 + Σ c(2i−1) λ^c(2i); 4 RefractiveIndex.INFO n² = c0 + Σ(2 terms) c λ^c/(λ² − c^c) + Σ c λ^c;
   5 Cauchy n = c0 + Σ c(2i−1) λ^c(2i); 6 gases n − 1 = c0 + Σ c(2i−1)/(c(2i) − λ⁻²); 7 Herzberger.
   ===================================================================================== */
/*@GLASS_BEGIN*/
var GLASS = {
  "N-BK7": {"name":"N-BK7","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.03961212,0.00600069867,0.231792344,0.0200179144,1.01046945,103.560653],"range_um":[0.3,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-BK7.yml","read":"2026-11-13","nd_cat":1.5168,"vd_cat":64.17,"T_K":293.0},
  "N-BAK1": {"name":"N-BAK1","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.12365662,0.00644742752,0.309276848,0.0222284402,0.881511957,107.297751],"range_um":[0.3,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-BAK1.yml","read":"2026-11-13","nd_cat":1.5725,"vd_cat":57.55,"T_K":293.0},
  "N-BAK2": {"name":"N-BAK2","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.01662154,0.00592383763,0.319903051,0.0203828415,0.937232995,113.118417],"range_um":[0.3,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-BAK2.yml","read":"2026-11-13","nd_cat":1.53996,"vd_cat":59.71,"T_K":293.0},
  "N-BAK4": {"name":"N-BAK4","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.28834642,0.00779980626,0.132817724,0.0315631177,0.945395373,105.965875],"range_um":[0.334,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-BAK4.yml","read":"2026-11-13","nd_cat":1.56883,"vd_cat":55.98,"T_K":293.0},
  "N-K5": {"name":"N-K5","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.08511833,0.00661099503,0.199562005,0.024110866,0.930511663,111.982777],"range_um":[0.31,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-K5.yml","read":"2026-11-13","nd_cat":1.52249,"vd_cat":59.48,"T_K":293.0},
  "N-SK2": {"name":"N-SK2","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.28189012,0.0072719164,0.257738258,0.0242823527,0.96818604,110.377773],"range_um":[0.31,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SK2.yml","read":"2026-11-13","nd_cat":1.60738,"vd_cat":56.65,"T_K":293.0},
  "N-SK11": {"name":"N-SK11","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.17963631,0.00680282081,0.229817295,0.0219737205,0.935789652,101.513232],"range_um":[0.3,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SK11.yml","read":"2026-11-13","nd_cat":1.56384,"vd_cat":60.8,"T_K":293.0},
  "N-SK16": {"name":"N-SK16","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.34317774,0.00704687339,0.241144399,0.0229005,0.994317969,92.7508526],"range_um":[0.31,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SK16.yml","read":"2026-11-13","nd_cat":1.62041,"vd_cat":60.32,"T_K":293.0},
  "N-SSK8": {"name":"N-SSK8","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.44857867,0.00869310149,0.117965926,0.0421566593,1.06937528,111.300666],"range_um":[0.35,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SSK8.yml","read":"2026-11-13","nd_cat":1.61773,"vd_cat":49.83,"T_K":293.0},
  "N-SF1": {"name":"N-SF1","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.60865158,0.0119654879,0.237725916,0.0590589722,1.51530653,135.521676],"range_um":[0.37,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF1.yml","read":"2026-11-13","nd_cat":1.71736,"vd_cat":29.62,"T_K":293.0},
  "N-SF2": {"name":"N-SF2","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.47343127,0.0109019098,0.163681849,0.0585683687,1.36920899,127.404933],"range_um":[0.365,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF2.yml","read":"2026-11-13","nd_cat":1.64769,"vd_cat":33.82,"T_K":293.0},
  "N-SF5": {"name":"N-SF5","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.52481889,0.011254756,0.187085527,0.0588995392,1.42729015,129.141675],"range_um":[0.37,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF5.yml","read":"2026-11-13","nd_cat":1.67271,"vd_cat":32.25,"T_K":293.0},
  "N-SF6": {"name":"N-SF6","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.77931763,0.0133714182,0.338149866,0.0617533621,2.08734474,174.01759],"range_um":[0.37,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF6.yml","read":"2026-11-13","nd_cat":1.80518,"vd_cat":25.36,"T_K":293.0},
  "N-SF8": {"name":"N-SF8","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.55075812,0.0114338344,0.209816918,0.0582725652,1.46205491,133.24165],"range_um":[0.37,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF8.yml","read":"2026-11-13","nd_cat":1.68894,"vd_cat":31.31,"T_K":293.0},
  "N-SF10": {"name":"N-SF10","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.62153902,0.0122241457,0.256287842,0.0595736775,1.64447552,147.468793],"range_um":[0.38,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF10.yml","read":"2026-11-13","nd_cat":1.72828,"vd_cat":28.53,"T_K":293.0},
  "N-SF11": {"name":"N-SF11","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.73759695,0.013188707,0.313747346,0.0623068142,1.89878101,155.23629],"range_um":[0.37,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF11.yml","read":"2026-11-13","nd_cat":1.78472,"vd_cat":25.68,"T_K":293.0},
  "N-SF57": {"name":"N-SF57","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.87543831,0.0141749518,0.37375749,0.0640509927,2.30001797,177.389795],"range_um":[0.37,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF57.yml","read":"2026-11-13","nd_cat":1.84666,"vd_cat":23.78,"T_K":293.0},
  "N-SF66": {"name":"N-SF66","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,2.0245976,0.0147053225,0.470187196,0.0692998276,2.59970433,161.817601],"range_um":[0.39,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SF66.yml","read":"2026-11-13","nd_cat":1.92286,"vd_cat":20.88,"T_K":293.0},
  "N-F2": {"name":"N-F2","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.39757037,0.00995906143,0.159201403,0.0546931752,1.2686543,119.248346],"range_um":[0.365,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-F2.yml","read":"2026-11-13","nd_cat":1.62005,"vd_cat":36.43,"T_K":293.0},
  "F2": {"name":"F2","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.34533359,0.00997743871,0.209073176,0.0470450767,0.937357162,111.886764],"range_um":[0.32,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/F2.yml","read":"2026-11-13","nd_cat":1.62004,"vd_cat":36.37,"T_K":293.0},
  "SF10": {"name":"SF10","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.61625977,0.0127534559,0.259229334,0.0581983954,1.07762317,116.60768],"range_um":[0.38,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/SF10.yml","read":"2026-11-13","nd_cat":1.72825,"vd_cat":28.41,"T_K":293.0},
  "SF2": {"name":"SF2","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.40301821,0.0105795466,0.231767504,0.0493226978,0.939056586,112.405955],"range_um":[0.35,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/SF2.yml","read":"2026-11-13","nd_cat":1.64769,"vd_cat":33.85,"T_K":293.0},
  "SF5": {"name":"SF5","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.46141885,0.0111826126,0.247713019,0.0508594669,0.949995832,112.041888],"range_um":[0.35,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/SF5.yml","read":"2026-11-13","nd_cat":1.6727,"vd_cat":32.21,"T_K":293.0},
  "N-LAK22": {"name":"N-LAK22","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.14229781,0.00585778594,0.535138441,0.0198546147,1.04088385,100.834017],"range_um":[0.31,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-LAK22.yml","read":"2026-11-13","nd_cat":1.65113,"vd_cat":55.89,"T_K":293.0},
  "N-LAK9": {"name":"N-LAK9","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.46231905,0.00724270156,0.344399589,0.0243353131,1.15508372,85.4686868],"range_um":[0.3,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-LAK9.yml","read":"2026-11-13","nd_cat":1.691,"vd_cat":54.71,"T_K":293.0},
  "N-LASF9": {"name":"N-LASF9","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,2.00029547,0.0121426017,0.298926886,0.0538736236,1.80691843,156.530829],"range_um":[0.365,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-LASF9.yml","read":"2026-11-13","nd_cat":1.85025,"vd_cat":32.17,"T_K":293.0},
  "N-LASF44": {"name":"N-LASF44","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.78897105,0.00872506277,0.38675867,0.0308085023,1.30506243,92.7743824],"range_um":[0.334,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-LASF44.yml","read":"2026-11-13","nd_cat":1.8042,"vd_cat":46.5,"T_K":293.0},
  "N-LAF2": {"name":"N-LAF2","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.80984227,0.0101711622,0.15729555,0.0442431765,1.0930037,100.687748],"range_um":[0.35,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-LAF2.yml","read":"2026-11-13","nd_cat":1.74397,"vd_cat":44.85,"T_K":293.0},
  "N-BAF10": {"name":"N-BAF10","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.5851495,0.00926681282,0.143559385,0.0424489805,1.08521269,105.613573],"range_um":[0.35,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-BAF10.yml","read":"2026-11-13","nd_cat":1.67003,"vd_cat":47.11,"T_K":293.0},
  "N-BALF4": {"name":"N-BALF4","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.31004128,0.0079659645,0.142038259,0.0330672072,0.964929351,109.19732],"range_um":[0.35,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-BALF4.yml","read":"2026-11-13","nd_cat":1.57956,"vd_cat":53.87,"T_K":293.0},
  "N-BASF64": {"name":"N-BASF64","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.65554268,0.0104485644,0.17131977,0.0499394756,1.33664448,118.961472],"range_um":[0.365,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-BASF64.yml","read":"2026-11-13","nd_cat":1.704,"vd_cat":39.38,"T_K":293.0},
  "N-PSK53A": {"name":"N-PSK53A","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.38121836,0.00706416337,0.196745645,0.0233251345,0.886089205,97.4847345],"range_um":[0.32,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-PSK53A.yml","read":"2026-11-13","nd_cat":1.618,"vd_cat":63.39,"T_K":293.0},
  "N-FK51A": {"name":"N-FK51A","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,0.971247817,0.00472301995,0.216901417,0.0153575612,0.904651666,168.68133],"range_um":[0.29,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-FK51A.yml","read":"2026-11-13","nd_cat":1.48656,"vd_cat":84.47,"T_K":293.0},
  "N-KZFS4": {"name":"N-KZFS4","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.35055424,0.0087628207,0.197575506,0.0371767201,1.09962992,90.3866994],"range_um":[0.334,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-KZFS4.yml","read":"2026-11-13","nd_cat":1.61336,"vd_cat":44.49,"T_K":293.0},
  "N-KZFS8": {"name":"N-KZFS8","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.62693651,0.010880863,0.24369876,0.0494207753,1.62007141,131.009163],"range_um":[0.334,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-KZFS8.yml","read":"2026-11-13","nd_cat":1.72047,"vd_cat":34.7,"T_K":293.0},
  "N-ZK7": {"name":"N-ZK7","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.07715032,0.00676601657,0.168079109,0.0230642817,0.851889892,89.0498778],"range_um":[0.3,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-ZK7.yml","read":"2026-11-13","nd_cat":1.50847,"vd_cat":61.19,"T_K":293.0},
  "FUSED-SILICA": {"name":"Fused silica (Malitson)","kind":"glass","vendor":null,"formula":1,"coef":[0.0,0.6961663,0.0684043,0.4079426,0.1162414,0.8974794,9.896161],"range_um":[0.21,6.7],"ref":"1) I. H. Malitson. Interspecimen comparison of the refractive index of fused silica. J. Opt. Soc. Am. 55, 1205-1208 (1965) 2) C. Z. Tan. Determination of refractive index of silica glass for infrared wavelengths by IR spectroscopy. J. Non-Cryst. Solids 223, 158-163 (1998) * Sellmeier formula is repo","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/SiO2/nk/Malitson.yml","read":"2026-11-13","T_K":293.0},
  "CAF2": {"name":"CaF2 (Malitson)","kind":"crystal","vendor":null,"formula":1,"coef":[0.0,0.5675888,0.050263605,0.4710914,0.1003909,3.8484723,34.64904],"range_um":[0.23,9.7],"ref":"I. H. Malitson. A redetermination of some optical properties of calcium fluoride. Appl. Opt. 2, 1103-1107 (1963)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/CaF2/nk/Malitson.yml","read":"2026-11-13"},
  "MGF2-O": {"name":"MgF2 ordinary (Dodge)","kind":"crystal","vendor":null,"formula":1,"coef":[0.0,0.48755108,0.04338408,0.39875031,0.09461442,2.3120353,23.793604],"range_um":[0.2,7.0],"ref":"M. J. Dodge. Refractive properties of magnesium fluoride. Appl. Opt. 23, 1980-1985 (1984)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/MgF2/nk/Dodge-o.yml","read":"2026-11-13","T_K":292.0,"axis":"o","pair":"MGF2-E"},
  "MGF2-E": {"name":"MgF2 extraordinary (Dodge)","kind":"crystal","vendor":null,"formula":1,"coef":[0.0,0.41344023,0.03684262,0.50497499,0.09076162,2.4904862,23.771995],"range_um":[0.2,7.0],"ref":"M. J. Dodge. Refractive properties of magnesium fluoride. Appl. Opt. 23, 1980-1985 (1984)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/MgF2/nk/Dodge-e.yml","read":"2026-11-13","T_K":292.0,"axis":"e","pair":"MGF2-O"},
  "BAF2": {"name":"BaF2 (Malitson)","kind":"crystal","vendor":null,"formula":1,"coef":[0.0,0.643356,0.057789,0.506762,0.10968,3.8261,46.3864],"range_um":[0.2652,10.346],"ref":"I. H. Malitson. Refractive properties of barium fluoride. J. Opt. Soc. Am. 54, 628-630 (1964)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/BaF2/nk/Malitson.yml","read":"2026-11-13","T_K":298.0},
  "SAPPHIRE-O": {"name":"Sapphire ordinary (Malitson)","kind":"crystal","vendor":null,"formula":1,"coef":[0.0,1.4313493,0.0726631,0.65054713,0.1193242,5.3414021,18.028251],"range_um":[0.2,5.0],"ref":"1) I. H. Malitson and M. J. Dodge. Refractive index and birefringence of synthetic sapphire. J. Opt. Soc. Am. 62, 1405 (1972) 2) M. J. Dodge. \"Refractive index\" in Handbook of Laser Science and Technology, Volume IV, Optical Materials: Part 2, CRC Press, Boca Raton, 1986, p. 30 * Ref. 1 is a talk ab","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/Al2O3/nk/Malitson-o.yml","read":"2026-11-13","T_K":293.0,"axis":"o","pair":"SAPPHIRE-E"},
  "SAPPHIRE-E": {"name":"Sapphire extraordinary (Malitson)","kind":"crystal","vendor":null,"formula":1,"coef":[0.0,1.5039759,0.0740288,0.55069141,0.1216529,6.5927379,20.072248],"range_um":[0.2,5.0],"ref":"1) I. H. Malitson and M. J. Dodge. Refractive index and birefringence of synthetic sapphire. J. Opt. Soc. Am. 62, 1405 (1972) 2) M. J. Dodge. \"Refractive index\" in Handbook of Laser Science and Technology, Volume IV, Optical Materials: Part 2, CRC Press, Boca Raton, 1986, p. 30 * Ref. 1 is a talk ab","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/Al2O3/nk/Malitson-e.yml","read":"2026-11-13","T_K":293.0,"axis":"e","pair":"SAPPHIRE-O"},
  "ZNSE": {"name":"ZnSe (Connolly)","kind":"crystal","vendor":null,"formula":1,"coef":[0.0,4.45813734,0.200859853,0.467216334,0.391371166,2.8956629,47.1362108],"range_um":[0.54,18.2],"ref":"1) J. Connolly, B. diBenedetto, R. Donadio. Specifications of Raytran material. Proc. SPIE, 181, 141-144 (1979) 2) B. Tatian. Fitting refractive-index data with the Sellmeier dispersion formula. Appl. Opt. 23, 4477-4485 (1984) *Ref. 2 provides a dispersion formula based on data from Ref. 1","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/ZnSe/nk/Connolly.yml","read":"2026-11-13"},
  "GE": {"name":"Germanium (Burnett)","kind":"crystal","vendor":null,"formula":2,"coef":[0.0,0.4886331,1.393959,14.5142535,0.1626427,0.0091224,752.19],"range_um":[2.0,14.0],"ref":"J. H. Burnett, S. G. Kaplan, E. Stover, A. Phenis. Refractive index measurements of Ge. Proc. SPIE 9974, 99740X (2016)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/Ge/nk/Burnett.yml","read":"2026-11-13","T_K":295.0},
  "SI": {"name":"Silicon (Salzberg)","kind":"crystal","vendor":null,"formula":1,"coef":[0.0,10.6684293,0.301516485,0.0030434748,1.13475115,1.54133408,1104.0],"range_um":[1.357,11.04],"ref":"1) C. D. Salzberg and J. J. Villa. Infrared refractive indexes of silicon, germanium and modified selenium glass. J. Opt. Soc. Am., 47, 244-246 (1957) 2) B. Tatian. Fitting refractive-index data with the Sellmeier dispersion formula. Appl. Opt. 23, 4477-4485 (1984) * Ref. 2 provides a dispersion for","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/Si/nk/Salzberg.yml","read":"2026-11-13"},
  "PMMA": {"name":"PMMA (Sultanova)","kind":"polymer","vendor":null,"formula":2,"coef":[0.0,1.1819,0.011313],"range_um":[0.4368,1.052],"ref":"N. Sultanova, S. Kasarova, I. Nikolov. Dispersion properties of optical polymers. Acta Physica Polonica A 116, 585-587 (2009) (fit of the experimental data with the Sellmeier dispersion formula: Mikhail Polyanskiy)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/organic/(C5H8O2)n%20-%20poly(methyl%20methacrylate)/nk/Sultanova.yml","read":"2026-11-13","T_K":293.0},
  "PC": {"name":"Polycarbonate (Sultanova)","kind":"polymer","vendor":null,"formula":2,"coef":[0.0,1.4182,0.021304],"range_um":[0.4368,1.052],"ref":"N. Sultanova, S. Kasarova, I. Nikolov. Dispersion properties of optical polymers. Acta Physica Polonica A 116, 585-587 (2009) (fit of the experimental data with the Sellmeier dispersion formula: Mikhail Polyanskiy)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/organic/(C16H14O3)n%20-%20polycarbonate/nk/Sultanova.yml","read":"2026-11-13","T_K":293.0},
  "ZEONEX-E48R": {"name":"Zeonex E48R (Sultanova)","kind":"polymer","vendor":null,"formula":2,"coef":[0.0,1.2969,0.011721],"range_um":[0.4368,1.052],"ref":"N. Sultanova, S. Kasarova and I. Nikolov. Dispersion properties of optical polymers, Acta Physica Polonica A 116, 585-587 (2009) (fit of the experimental data with the Sellmeier dispersion formula: Mikhail Polyanskiy)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/other/commercial%20polymers/ZeonexE48R/nk/Sultanova.yml","read":"2026-11-13","T_K":293.0},
  "AIR": {"name":"Air, standard 15 °C (Ciddor)","kind":"gas","vendor":null,"formula":6,"coef":[0.0,0.05792105,238.0185,0.00167917,57.362],"range_um":[0.23,1.69],"ref":"P. E. Ciddor. Refractive index of air: new equations for the visible and near infrared. Appl. Optics 35, 1566-1573 (1996) [Calculation script (Python) - can be used to calculate the refractive index of air for specific values of humidity, temperature, pressure, and CO2 concentration]","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/other/mixed%20gases/air/nk/Ciddor.yml","read":"2026-11-13","T_K":288.15},
  "WATER": {"name":"Water 20 °C (Daimon)","kind":"liquid","vendor":null,"formula":2,"coef":[0.0,0.5684027565,0.005101829712,0.1726177391,0.01821153936,0.02086189578,0.02620722293,0.1130748688,10.69792721],"range_um":[0.182,1.129],"ref":"M. Daimon and A. Masumura. Measurement of the refractive index of distilled water from the near-infrared region to the ultraviolet region. Appl. Opt. 46, 3811-3820 (2007)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/H2O/nk/Daimon-20.0C.yml","read":"2026-11-13","T_K":293.15,"note":"Daimon & Masumura 2007 lies about 3.6e-4 above IAPWS R9-97 (n_D = 1.33299 at 20 °C)"},
  "QUARTZ-O": {"name":"Crystal quartz ordinary (Ghosh)","kind":"crystal","vendor":null,"formula":2,"coef":[0.28604141,1.07044083,0.0100585997,1.10202242,100.0],"range_um":[0.198,2.0531],"ref":"G. Ghosh. Dispersion-equation coefficients for the refractive index and birefringence of calcite and quartz crystals. Opt. Commun. 163, 95-102 (1999)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/SiO2/nk/Ghosh-o.yml","read":"2026-11-13","axis":"o","pair":"QUARTZ-E"},
  "QUARTZ-E": {"name":"Crystal quartz extraordinary (Ghosh)","kind":"crystal","vendor":null,"formula":2,"coef":[0.28851804,1.09509924,0.0102101864,1.15662475,100.0],"range_um":[0.198,2.0531],"ref":"G. Ghosh. Dispersion-equation coefficients for the refractive index and birefringence of calcite and quartz crystals. Opt. Commun. 163, 95-102 (1999)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/SiO2/nk/Ghosh-e.yml","read":"2026-11-13","axis":"e","pair":"QUARTZ-O"},
  "CALCITE-O": {"name":"Calcite ordinary (Ghosh)","kind":"crystal","vendor":null,"formula":2,"coef":[0.73358749,0.96464345,0.0194325203,1.82831454,120.0],"range_um":[0.204,2.172],"ref":"G. Ghosh. Dispersion-equation coefficients for the refractive index and birefringence of calcite and quartz crystals. Opt. Commun. 163, 95-102 (1999)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/CaCO3/nk/Ghosh-o.yml","read":"2026-11-13","axis":"o","pair":"CALCITE-E"},
  "CALCITE-E": {"name":"Calcite extraordinary (Ghosh)","kind":"crystal","vendor":null,"formula":2,"coef":[0.35859695,0.8242783,0.0106689543,0.14429128,120.0],"range_um":[0.204,2.172],"ref":"G. Ghosh. Dispersion-equation coefficients for the refractive index and birefringence of calcite and quartz crystals. Opt. Commun. 163, 95-102 (1999)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/CaCO3/nk/Ghosh-e.yml","read":"2026-11-13","axis":"e","pair":"CALCITE-O"},
  "YVO4-O": {"name":"YVO4 ordinary (Birnbaum)","kind":"crystal","vendor":null,"formula":2,"coef":[0.0,2.7665,0.026884],"range_um":[0.488,3.39],"ref":"1) M. Birnbaum, L. G. DeShazer. Low threshold CW Nd laser oscillator at 1060 nm study. NASA Report, Contract Number NAS 5-22387 (1976) 2) T. S. Lomheim. L. G. DeShazer. Optical-absorption intensities of trivalent neodymium in the uniaxial crystal yttrium orthovanadate. J. Appl. Phys. 49, 5517-5522 (","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/YVO4/nk/Birnbaum-o.yml","read":"2026-11-13","axis":"o","pair":"YVO4-E"},
  "YVO4-E": {"name":"YVO4 extraordinary (Birnbaum)","kind":"crystal","vendor":null,"formula":2,"coef":[0.0,3.593,0.032103],"range_um":[0.488,3.39],"ref":"1) M. Birnbaum, L. G. DeShazer. Low threshold CW Nd laser oscillator at 1060 nm study. NASA Report, Contract Number NAS 5-22387 (1976) 2) T. S. Lomheim. L. G. DeShazer. Optical-absorption intensities of trivalent neodymium in the uniaxial crystal yttrium orthovanadate. J. Appl. Phys. 49, 5517-5522 (","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/YVO4/nk/Birnbaum-e.yml","read":"2026-11-13","axis":"e","pair":"YVO4-O"},
  "BBO-O": {"name":"BBO ordinary (Eimerl)","kind":"crystal","vendor":null,"formula":4,"coef":[2.7405,0.0184,0.0,0.0179,1.0,0.0,0.0,0.0,1.0,-0.0155,2.0],"range_um":[0.22,1.06],"ref":"D. Eimerl, L. Davis, S. Velsko, E. K. Graham, A. Zalkin. Optical, mechanical, and thermal properties of barium borate. J. Appl. Phys., 62, 1968-1983 (1987)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/BaB2O4/nk/Eimerl-o.yml","read":"2026-11-13","axis":"o","pair":"BBO-E"},
  "BBO-E": {"name":"BBO extraordinary (Eimerl)","kind":"crystal","vendor":null,"formula":4,"coef":[2.373,0.0128,0.0,0.0156,1.0,0.0,0.0,0.0,1.0,-0.0044,2.0],"range_um":[0.22,1.06],"ref":"D. Eimerl, L. Davis, S. Velsko, E. K. Graham, A. Zalkin. Optical, mechanical, and thermal properties of barium borate. J. Appl. Phys., 62, 1968-1983 (1987)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/main/BaB2O4/nk/Eimerl-e.yml","read":"2026-11-13","axis":"e","pair":"BBO-O"},
  "H-K9L": {"name":"H-K9L (CDGM)","kind":"glass","vendor":"CDGM","formula":2,"coef":[0.0,0.614555251,0.0145987884,0.656775017,0.00287769588,1.02699346,107.653051],"range_um":[0.302,2.325],"ref":"CDGM Zemax catalog 2022-06 (obtained from http://www.cdgmgd.com) See also CDGM optical glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/cdgm/optical/H-K9L.yml","read":"2026-11-13","nd_cat":1.5168,"vd_cat":64.198732,"T_K":293.0},
  "S-BSL7": {"name":"S-BSL7 (OHARA)","kind":"glass","vendor":"OHARA","formula":2,"coef":[0.0,1.1515019,0.010598413,0.118583612,-0.011822519,1.26301359,129.617662],"range_um":[0.29,2.4],"ref":"OHARA Zemax catalog 2017-11-30 (obtained from http://www.ohara-inc.co.jp) See also OHARA glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/ohara/optical/S-BSL7.yml","read":"2026-11-13","nd_cat":1.51633,"vd_cat":64.142022,"T_K":298.0},
  "N-SSK5": {"name":"N-SSK5","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.59222659,0.00920284626,0.103520774,0.0423530072,1.05174016,106.927374],"range_um":[0.35,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/N-SSK5.yml","read":"2026-11-13","nd_cat":1.65844,"vd_cat":50.88,"T_K":293.0},
  "E-BAF11": {"name":"E-BAF11 (HIKARI)","kind":"glass","vendor":"HIKARI","formula":3,"coef":[2.71954649,-0.0100472501,2.0,0.0200301385,-2.0,0.000465868302,-4.0,-7.51633336e-06,-6.0,1.77544989e-06,-8.0],"range_um":[0.4,0.7],"ref":"NIKON Zemax catalog 2017-11 (obtained from http://www.nikon.com) See also HIKARI glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/hikari/optical/E-BAF11.yml","read":"2026-11-13","nd_cat":1.666718,"vd_cat":48.315694,"T_K":296.0},
  "LAFN7": {"name":"LAFN7","kind":"glass","vendor":"SCHOTT","formula":2,"coef":[0.0,1.66842615,0.0103159999,0.298512803,0.0469216348,1.0774376,82.5078509],"range_um":[0.35,2.5],"ref":"SCHOTT Zemax catalog 2017-01-20b (obtained from http://www.schott.com) See also SCHOTT glass data sheets","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/schott/optical/LAFN7.yml","read":"2026-11-13","nd_cat":1.7495,"vd_cat":34.95,"T_K":293.0},
  "E-FD10": {"name":"E-FD10 (HOYA)","kind":"glass","vendor":"HOYA","formula":3,"coef":[2.881518,-0.013228312,2.0,0.03145559,-2.0,0.0026851666,-4.0,-0.00022577544,-6.0,2.4693268e-05,-8.0],"range_um":[0.36501,1.01398],"ref":"HOYA Zemax catalog 2017-04-01 (obtained from http://www.hoya-opticalworld.com)","url":"https://github.com/polyanskiy/refractiveindex.info-database/blob/main/database/data/specs/hoya/optical/E-FD10.yml","read":"2026-11-13","nd_cat":1.72825,"vd_cat":28.32,"T_K":293.0}
};
/*@GLASS_END*/

var GLASS_ALIASES = {
  'BK7': 'N-BK7', 'NBK7': 'N-BK7', 'SILICA': 'FUSED-SILICA', 'FUSED SILICA': 'FUSED-SILICA', 'FUSEDSILICA': 'FUSED-SILICA', 'UVFS': 'FUSED-SILICA', 'SIO2': 'FUSED-SILICA',
  'CAF2': 'CAF2', 'MGF2': 'MGF2-O', 'BAF2': 'BAF2', 'SAPPHIRE': 'SAPPHIRE-O', 'AL2O3': 'SAPPHIRE-O', 'ZNSE': 'ZNSE', 'GERMANIUM': 'GE', 'SILICON': 'SI',
  'ACRYLIC': 'PMMA', 'POLYCARBONATE': 'PC', 'E48R': 'ZEONEX-E48R', 'ZEONEX': 'ZEONEX-E48R', 'H2O': 'WATER', 'QUARTZ': 'QUARTZ-O', 'CALCITE': 'CALCITE-O',
  'YVO4': 'YVO4-O', 'BBO': 'BBO-O', 'N-BK7HT': 'N-BK7'
};
var VACUUM = { name: 'Vacuum', kind: 'gas', formula: 0, coef: [], range_um: [0, Infinity], ref: 'n = 1 exactly', url: '', read: '' };

function glassKey(id) {
  if (id == null) return null;
  if (GLASS[id]) return id;
  var u = String(id).trim().toUpperCase();
  if (GLASS[u]) return u;
  if (GLASS_ALIASES[u]) return GLASS_ALIASES[u];
  if (GLASS['N-' + u]) return 'N-' + u;
  return null;
}
function glass(id) {
  if (id === 'vacuum' || id === 'VACUUM') return VACUUM;
  var k = glassKey(id); return k ? GLASS[k] : null;
}
/* raw formula evaluation (no range check) */
function evalFormula(f, c, l) {
  var l2 = l * l, s, i;
  switch (f) {
    case 0: return 1;
    case 1: s = 1 + c[0]; for (i = 1; i + 1 < c.length; i += 2) s += c[i] * l2 / (l2 - c[i + 1] * c[i + 1]); return Math.sqrt(s);
    case 2: s = 1 + c[0]; for (i = 1; i + 1 < c.length; i += 2) s += c[i] * l2 / (l2 - c[i + 1]); return Math.sqrt(s);
    case 3: s = c[0]; for (i = 1; i + 1 < c.length; i += 2) s += c[i] * Math.pow(l, c[i + 1]); return Math.sqrt(s);
    case 4:
      s = c[0];
      for (i = 1; i < Math.min(c.length, 9); i += 4) if (i + 3 < c.length) s += c[i] * Math.pow(l, c[i + 1]) / (l2 - Math.pow(c[i + 2], c[i + 3]));
      for (i = 9; i + 1 < c.length; i += 2) s += c[i] * Math.pow(l, c[i + 1]);
      return Math.sqrt(s);
    case 5: s = c[0]; for (i = 1; i + 1 < c.length; i += 2) s += c[i] * Math.pow(l, c[i + 1]); return s;
    case 6: s = 1 + c[0]; for (i = 1; i + 1 < c.length; i += 2) s += c[i] / (c[i + 1] - 1 / l2); return s;
    case 7: var L0 = 1 / (l2 - 0.028); return c[0] + c[1] * L0 + c[2] * L0 * L0 + c[3] * l2 + c[4] * l2 * l2 + (c[5] || 0) * l2 * l2 * l2;
    default: return NaN;
  }
}
/* n(material, λ_µm, opts) -> refractive index; NaN for unknown material; outside the valid range: value with opts.strict -> NaN.
   material may be a number (constant index) or an id / alias ('N-BK7', 'BK7', 'fused silica', 'air', 'vacuum'). */
function n(material, lambda_um, opts) {
  if (typeof material === 'number') return material;
  var g = glass(material);
  if (!g || !isNum(lambda_um) || lambda_um <= 0) return NaN;
  if (opts && opts.strict && !inRange(material, lambda_um)) return NaN;
  return evalFormula(g.formula, g.coef, lambda_um);
}
function inRange(material, lambda_um) {
  if (typeof material === 'number') return true;
  var g = glass(material); if (!g) return false;
  return lambda_um >= g.range_um[0] - 1e-9 && lambda_um <= g.range_um[1] + 1e-9;
}
/* group index n_g = n − λ dn/dλ and dn/dλ (central difference) */
function dndl(material, l) { var h = 1e-4 * l; return (n(material, l + h) - n(material, l - h)) / (2 * h); }
function ng(material, l) { return n(material, l) - l * dndl(material, l); }

/* spectral lines in nm (NIST ASD; Fraunhofer/lamp designations as in glass catalogues) */
var LINES = {
  i: { nm: 365.0146, el: 'Hg' }, h: { nm: 404.6561, el: 'Hg' }, g: { nm: 435.8343, el: 'Hg' }, "F'": { nm: 479.9914, el: 'Cd' }, F: { nm: 486.1327, el: 'H' },
  e: { nm: 546.0740, el: 'Hg' }, d: { nm: 587.5618, el: 'He' }, D: { nm: 589.2938, el: 'Na' }, "C'": { nm: 643.8469, el: 'Cd' }, C: { nm: 656.2725, el: 'H' },
  r: { nm: 706.5188, el: 'He' }, s: { nm: 852.11, el: 'Cs' }, t: { nm: 1013.98, el: 'Hg' }
};
var LASER_LINES = [
  { nm: 405, name: 'GaN diode 405' }, { nm: 445, name: 'blue diode 445' }, { nm: 488, name: 'Ar⁺ 488' }, { nm: 515, name: 'Yb SHG 515' }, { nm: 532, name: 'Nd:YAG SHG 532' },
  { nm: 632.8, name: 'HeNe 632.8' }, { nm: 650, name: 'red diode 650' }, { nm: 780, name: 'diode 780' }, { nm: 808, name: 'pump diode 808' }, { nm: 850, name: 'VCSEL 850' },
  { nm: 980, name: 'pump diode 980' }, { nm: 1030, name: 'Yb:YAG 1030' }, { nm: 1064, name: 'Nd:YAG 1064' }, { nm: 1310, name: 'telecom O 1310' },
  { nm: 1550, name: 'telecom C / Er 1550' }, { nm: 2940, name: 'Er:YAG 2940' }, { nm: 10600, name: 'CO₂ 10.6 µm' }
];
function nAtLine(material, line) { return n(material, LINES[line].nm / 1000); }
function nd(material) { return nAtLine(material, 'd'); }
function ne(material) { return nAtLine(material, 'e'); }
/* Abbe number V_d = (n_d − 1)/(n_F − n_C); abbe(m, 'e') -> V_e = (n_e − 1)/(n_F' − n_C') */
function abbe(material, which) {
  if (which === 'e') return (ne(material) - 1) / (nAtLine(material, "F'") - nAtLine(material, "C'"));
  return (nd(material) - 1) / (nAtLine(material, 'F') - nAtLine(material, 'C'));
}
/* relative partial dispersion P_g,F = (n_g − n_F)/(n_F − n_C) */
function partialDispersion(material) { return (nAtLine(material, 'g') - nAtLine(material, 'F')) / (nAtLine(material, 'F') - nAtLine(material, 'C')); }
/* list of materials: [{id, name, kind, vendor, range_um, nd, vd}] optionally filtered by kind and wavelength (µm) */
function materials(filter) {
  filter = filter || {};
  return Object.keys(GLASS).filter(function (k) {
    var g = GLASS[k];
    if (filter.kind && (Array.isArray(filter.kind) ? filter.kind.indexOf(g.kind) < 0 : g.kind !== filter.kind)) return false;
    if (filter.lambda_um != null && !inRange(k, filter.lambda_um)) return false;
    if (filter.isotropic && g.axis) return false;
    return true;
  }).map(function (k) {
    var g = GLASS[k], vis = inRange(k, 0.4861) && inRange(k, 0.6563);
    return { id: k, name: g.name, kind: g.kind, vendor: g.vendor || null, range_um: g.range_um.slice(), nd: vis ? nd(k) : null, vd: vis ? abbe(k) : null, axis: g.axis || null };
  });
}

/* =====================================================================================
   4. Wavelength → colour. CIE 1931 2° colour-matching functions by the Wyman–Sloan–Shirley (2013) multi-lobe fit,
   XYZ → linear sRGB (IEC 61966-2-1); single wavelengths are out of the sRGB gamut: negative primaries are clipped (keeps the hue vivid),
   then normalised to max = 1; spectra (spectrumColour) are desaturated toward white instead, to keep their chromaticity.
   Outside 380–780 nm a false colour is returned (UV violet, IR dark red) with falseColour: true.
   ===================================================================================== */
function g3(x, mu, s1, s2) { var s = x < mu ? s1 : s2, u = (x - mu) / s; return Math.exp(-0.5 * u * u); }
function cieXYZ(nm) {
  return {
    x: 1.056 * g3(nm, 599.8, 37.9, 31.0) + 0.362 * g3(nm, 442.0, 16.0, 26.7) - 0.065 * g3(nm, 501.1, 20.4, 26.2),
    y: 0.821 * g3(nm, 568.8, 46.9, 40.5) + 0.286 * g3(nm, 530.9, 16.3, 31.1),
    z: 1.217 * g3(nm, 437.0, 11.8, 36.0) + 0.681 * g3(nm, 459.0, 26.0, 13.8)
  };
}
function srgbGamma(c) { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function hex2(v) { var s = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return s.length < 2 ? '0' + s : s; }
function rgbObj(r, g, b, fc) { return { r: r, g: g, b: b, hex: '#' + hex2(r) + hex2(g) + hex2(b), css: 'rgb(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ')', falseColour: !!fc }; }
var UV_FALSE = [0.62, 0.35, 1.0], IR_FALSE = [0.62, 0.12, 0.16];
/* rgb(λ_nm) -> {r,g,b (0..1, gamma-encoded), hex, css, falseColour} — display colour of a monochromatic ray */
function rgb(nm) {
  if (!isNum(nm)) return rgbObj(0.5, 0.5, 0.5, true);
  if (nm < 380) return rgbObj(UV_FALSE[0], UV_FALSE[1], UV_FALSE[2], true);
  if (nm > 780) return rgbObj(IR_FALSE[0], IR_FALSE[1], IR_FALSE[2], true);
  var c = cieXYZ(nm);
  var r = 3.2406 * c.x - 1.5372 * c.y - 0.4986 * c.z, g = -0.9689 * c.x + 1.8758 * c.y + 0.0415 * c.z, b = 0.0557 * c.x - 0.2040 * c.y + 1.0570 * c.z;
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  var mx = Math.max(r, g, b) || 1;
  return rgbObj(srgbGamma(r / mx), srgbGamma(g / mx), srgbGamma(b / mx), false);
}
/* colour of a spectrum [{nm, w}] (relative spectral weights): XYZ integral -> sRGB normalised to max = 1, plus chromaticity x,y */
function spectrumColour(spec) {
  var X = 0, Y = 0, Z = 0;
  (spec || []).forEach(function (p) { if (!isNum(p.nm) || !isNum(p.w) || p.nm < 360 || p.nm > 830) return; var c = cieXYZ(p.nm); X += p.w * c.x; Y += p.w * c.y; Z += p.w * c.z; });
  var S = X + Y + Z;
  if (!(S > 0)) return null;
  var r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  var m = Math.min(r, g, b); if (m < 0) { r -= m; g -= m; b -= m; }
  var mx = Math.max(r, g, b) || 1;
  var o = rgbObj(srgbGamma(r / mx), srgbGamma(g / mx), srgbGamma(b / mx), false);
  o.X = X; o.Y = Y; o.Z = Z; o.cx = X / S; o.cy = Y / S;
  return o;
}

/* =====================================================================================
   5. Paraxial optics. Ray vector (y, n·u) — height and reduced angle; matrices [[A,B],[C,D]] with det = 1.
   Sign convention: light travels +z; R > 0 when the centre of curvature lies to the right of the surface;
   mirror(R): unfolded equivalent lens with focal length R/2, R > 0 = concave (converging).
   ===================================================================================== */
var abcd = {
  identity: function () { return [[1, 0], [0, 1]]; },
  space: function (d, nn) { return [[1, d / (nn || 1)], [0, 1]]; },
  thinLens: function (f) { return [[1, 0], [-1 / f, 1]]; },
  interface: function (n1, n2, R) { var c = (R == null || !isFinite(R) || R === 0) ? 0 : 1 / R; return [[1, 0], [-(n2 - n1) * c, 1]]; },
  mirror: function (R) { var c = (R == null || !isFinite(R) || R === 0) ? 0 : 2 / R; return [[1, 0], [-c, 1]]; },
  /* thick lens {R1, R2, t, n, n1 (before, default 1), n2 (after, default n1)} */
  thick: function (o) {
    var n1 = o.n1 == null ? 1 : o.n1, n2 = o.n2 == null ? n1 : o.n2;
    return mul(abcd.interface(o.n, n2, o.R2), abcd.space(o.t, o.n), abcd.interface(n1, o.n, o.R1));
  },
  mul: function () { return mul.apply(null, arguments); },
  apply: function (M, y, nu) { return [M[0][0] * y + M[0][1] * nu, M[1][0] * y + M[1][1] * nu]; }
};
/* mul(M3, M2, M1) = M3·M2·M1 (matrix product, rightmost acts first) */
function mul() {
  var r = [[1, 0], [0, 1]];
  for (var i = 0; i < arguments.length; i++) {
    var M = arguments[i];
    r = [[r[0][0] * M[0][0] + r[0][1] * M[1][0], r[0][0] * M[0][1] + r[0][1] * M[1][1]], [r[1][0] * M[0][0] + r[1][1] * M[1][0], r[1][0] * M[0][1] + r[1][1] * M[1][1]]];
  }
  return r;
}
/* system(list) — list in the order the light meets the elements -> product M_n···M_1 */
function system(list) { var M = [[1, 0], [0, 1]]; (list || []).forEach(function (E) { M = mul(E, M); }); return M; }
abcd.system = system;

/* cardinal points of a system matrix between its first and last vertex (n_in object space, n_out image space).
   Positions zF, zP, zN relative to the first vertex, zF2, zP2, zN2 relative to the last vertex (positive = toward +z).
   efl = 1/φ (equivalent focal length), f_front = −n_in/φ, f_rear = n_out/φ, bfl = zF2, ffl = −zF (distance in front of the first vertex). */
function cardinal(M, n_in, n_out) {
  n_in = n_in || 1; n_out = n_out || 1;
  var A = M[0][0], D = M[1][1], C = M[1][0], phi = -C;
  if (Math.abs(phi) < 1e-15) return { afocal: true, power: 0, efl: Infinity, angularMagnification: D };
  var zF = -D * n_in / phi, zF2 = A * n_out / phi;
  var zP = (1 - D) * n_in / phi, zP2 = (A - 1) * n_out / phi;
  return { afocal: false, power: phi, efl: 1 / phi, f_front: -n_in / phi, f_rear: n_out / phi,
    zF: zF, zF2: zF2, bfl: zF2, ffl: -zF, zP: zP, zP2: zP2, zN: zP + (n_out - n_in) / phi, zN2: zP2 + (n_out - n_in) / phi };
}
/* imaging by a system matrix: object at distance s_o in front of the first vertex (positive, real object) ->
   image distance s_i after the last vertex (positive = real image) and lateral magnification m */
function image(M, s_o, n_in, n_out) {
  n_in = n_in || 1; n_out = n_out || 1;
  var T = mul(M, abcd.space(s_o, n_in));
  var A = T[0][0], B = T[0][1], C = T[1][0], D = T[1][1];
  if (Math.abs(D) < 1e-15) return { s_i: Infinity, m: Infinity };
  var si = -B * n_out / D;
  return { s_i: si, m: A + C * si / n_out };
}
/* lensmaker (thick): f of a lens with radii R1, R2 (null = flat), centre thickness t, index nn, in a medium n0 (default 1) */
function lensmaker(R1, R2, t_, nn, n0) {
  var c = cardinal(abcd.thick({ R1: R1, R2: R2, t: t_ || 0, n: nn, n1: n0 || 1 }), n0 || 1, n0 || 1);
  return c.efl * (n0 || 1);
}

/* y–nu paraxial trace through a sequential surface list.
   surfaces: [{R | c, t (to the next surface), material (medium AFTER the surface; null/'air' = 1) | n, mirror?}]
   opts: {lambda_um (default d line), n0 (object-space index, default 1), y (default 1), u (default 0)}.
   Index of 'air' is taken as 1 (lens-design convention: relative to air). Mirrors flip the sign of n after them.
   Returns {rows:[{y, nu, n}], M (vertex-to-vertex matrix), n_in, n_out, cardinal}. */
function surfIndex(s, lam) {
  if (isNum(s.n)) return s.n;
  var m = s.material;
  if (m == null || m === '' || /^air$/i.test(m) || /^vacuum$/i.test(m)) return 1;
  return n(m, lam);
}
function paraxialTrace(surfaces, opts) {
  opts = opts || {};
  var lam = opts.lambda_um || LINES.d.nm / 1000, n0 = opts.n0 || 1;
  var y = opts.y == null ? 1 : opts.y, nu = (opts.u == null ? 0 : opts.u) * n0, nCur = n0, sign = 1;
  var M = [[1, 0], [0, 1]], rows = [];
  for (var i = 0; i < surfaces.length; i++) {
    var s = surfaces[i];
    var c = isNum(s.c) ? s.c : (s.R == null || !isFinite(s.R) || s.R === 0 ? 0 : 1 / s.R);
    var nNext;
    if (s.mirror) { nNext = -nCur; sign = -sign; }
    else nNext = sign * surfIndex(s, lam);
    var P = (nNext - nCur) * c;
    nu = nu - y * P;
    M = mul([[1, 0], [-P, 1]], M);
    rows.push({ y: y, nu: nu, n: nNext, power: P });
    nCur = nNext;
    if (i < surfaces.length - 1) {
      var d = s.t || 0;
      y = y + d * nu / nCur;
      M = mul([[1, d / nCur], [0, 1]], M);
    }
  }
  return { rows: rows, M: M, n_in: n0, n_out: nCur, cardinal: cardinal(M, n0, nCur) };
}

/* =====================================================================================
   6. Gaussian beams (Kogelnik & Li 1966; Siegman 1986; embedded Gaussian with M²).
   q is the complex beam parameter in the medium of index n: q = z + i·z_R, z_R = π w0² n /(M² λ0), λ0 vacuum wavelength,
   w(z)² = w0² (1 + (z/z_R)²). The ABCD law is applied to the reduced q̂ = q/n with the (y, n·u) matrices of section 5.
   Lengths in any consistent unit (λ0 in the same unit as w0!). Complex numbers are {re, im}.
   ===================================================================================== */
function cx(re, im) { return { re: re, im: im || 0 }; }
function cdiv(a, b) { var d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); }
function cmulS(a, s) { return cx(a.re * s, a.im * s); }
var gauss = {
  zR: function (w0, lambda0, M2, nn) { return Math.PI * w0 * w0 * (nn || 1) / ((M2 || 1) * lambda0); },
  /* far-field half-angle divergence θ = M² λ0 /(π n w0) */
  divergence: function (w0, lambda0, M2, nn) { return (M2 || 1) * lambda0 / (Math.PI * (nn || 1) * w0); },
  /* q at distance z after the waist (z < 0: before the waist) */
  q: function (w0, z, lambda0, M2, nn) { return cx(z || 0, gauss.zR(w0, lambda0, M2, nn)); },
  /* q from the beam radius w and wavefront radius R at a plane (R = Infinity at a waist) */
  qFromWR: function (w, R, lambda0, M2, nn) {
    var invR = (R == null || !isFinite(R) || R === 0) ? 0 : 1 / R;
    var inv = cx(invR, -(M2 || 1) * lambda0 / (Math.PI * (nn || 1) * w * w));
    return cdiv(cx(1, 0), inv);
  },
  w: function (q, lambda0, M2, nn) { var inv = cdiv(cx(1, 0), q); return Math.sqrt(-(M2 || 1) * lambda0 / (Math.PI * (nn || 1) * inv.im)); },
  R: function (q) { var inv = cdiv(cx(1, 0), q); return Math.abs(inv.re) < 1e-300 ? Infinity : 1 / inv.re; },
  /* waist data of q: {w0, z: distance from the plane to the waist (positive = waist ahead), zR} */
  waist: function (q, lambda0, M2, nn) { var zR = q.im; return { w0: Math.sqrt(zR * (M2 || 1) * lambda0 / (Math.PI * (nn || 1))), z: -q.re, zR: zR }; },
  /* propagate q through a (y, n·u) matrix from a medium n1 into a medium n2 */
  propagate: function (q, M, n1, n2) {
    n1 = n1 || 1; n2 = n2 == null ? n1 : n2;
    var qh = cmulS(q, 1 / n1);
    var num = cx(M[0][0] * qh.re + M[0][1], M[0][0] * qh.im), den = cx(M[1][0] * qh.re + M[1][1], M[1][0] * qh.im);
    return cmulS(cdiv(num, den), n2);
  },
  /* Gouy phase (rad) at distance z from the waist */
  gouy: function (z, zR) { return Math.atan2(z, zR); },
  /* Self (1983), thin lens of focal length f in air: input waist at distance s before the lens with Rayleigh range zR
     -> output waist distance s2 after the lens and magnification m = w0'/w0. Valid for M² beams with zR of the embedded Gaussian. */
  self: function (s, zR, f) {
    var a = s / f - 1;
    var s2 = f * (1 + a / (a * a + (zR / f) * (zR / f)));
    var m = 1 / Math.sqrt(a * a + (zR / f) * (zR / f));
    return { s2: s2, m: m };
  },
  /* diffraction-limited focused waist of a collimated beam of radius W on a lens f: w0' ≈ M² λ0 f /(π W) (far-field limit) */
  focusSpot: function (W, f, lambda0, M2) { return (M2 || 1) * lambda0 * f / (Math.PI * W); },
  complex: { cx: cx, div: cdiv, scale: cmulS }
};

/* =====================================================================================
   7. Stock lens catalogue (public catalogue pages; generated by _opt/core/gen_stock.py). Lengths in mm, f at the design wavelength.
   entry: {id (part no.), vendor, type (plano-convex|plano-concave|bi-convex|bi-concave|best-form|meniscus-pos|meniscus-neg|achromat|asphere),
   D, f, lambda_nm (design), R1, R2 (null = flat; achromats R1,R2,R3 + CT1,CT2 + glass1, glass2), CT, ET, glass, coating, bfl, url, source, read}
   ===================================================================================== */
/*@STOCK_BEGIN*/
var STOCK = [
  {"id":"LA1024","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":4.0,"lambda_nm":587.6,"R1":2.1,"CT":1.0,"ET":0.7,"glass":"N-BK7","bfl":3.34,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1026","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":6.0,"lambda_nm":587.6,"R1":3.1,"CT":1.0,"ET":0.8,"glass":"N-BK7","bfl":5.34,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1036","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":6.0,"lambda_nm":587.6,"R1":3.1,"CT":1.5,"ET":1.0,"glass":"N-BK7","bfl":5.01,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1039","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":9.0,"lambda_nm":587.6,"R1":4.7,"CT":1.5,"ET":1.2,"glass":"N-BK7","bfl":8.01,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1116","vendor":"Thorlabs","type":"plano-convex","D":6.0,"f":10.0,"lambda_nm":587.6,"R1":5.2,"CT":2.5,"ET":1.5,"glass":"N-BK7","bfl":8.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1470","vendor":"Thorlabs","type":"plano-convex","D":6.0,"f":12.0,"lambda_nm":587.6,"R1":6.2,"CT":2.3,"ET":1.5,"glass":"N-BK7","bfl":10.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1222","vendor":"Thorlabs","type":"plano-convex","D":6.0,"f":14.9,"lambda_nm":587.6,"R1":7.7,"CT":2.1,"ET":1.5,"glass":"N-BK7","bfl":13.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1700","vendor":"Thorlabs","type":"plano-convex","D":6.0,"f":29.9,"lambda_nm":587.6,"R1":15.5,"CT":1.8,"ET":1.5,"glass":"N-BK7","bfl":28.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1576","vendor":"Thorlabs","type":"plano-convex","D":9.0,"f":12.0,"lambda_nm":587.6,"R1":6.2,"CT":3.4,"ET":1.5,"glass":"N-BK7","bfl":9.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1472","vendor":"Thorlabs","type":"plano-convex","D":9.0,"f":19.9,"lambda_nm":587.6,"R1":10.3,"CT":2.5,"ET":1.5,"glass":"N-BK7","bfl":18.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1540","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":14.9,"lambda_nm":587.6,"R1":7.7,"CT":5.1,"ET":1.8,"glass":"N-BK7","bfl":11.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1074","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":19.9,"lambda_nm":587.6,"R1":10.3,"CT":4.0,"ET":1.8,"glass":"N-BK7","bfl":17.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1560","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":24.9,"lambda_nm":587.6,"R1":12.9,"CT":3.5,"ET":1.8,"glass":"N-BK7","bfl":22.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1289","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":29.9,"lambda_nm":587.6,"R1":15.5,"CT":3.2,"ET":1.8,"glass":"N-BK7","bfl":27.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1610","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":35.0,"lambda_nm":587.6,"R1":18.1,"CT":3.0,"ET":1.8,"glass":"N-BK7","bfl":33.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1304","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":39.9,"lambda_nm":587.6,"R1":20.6,"CT":2.8,"ET":1.8,"glass":"N-BK7","bfl":38.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1213","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":49.8,"lambda_nm":587.6,"R1":25.8,"CT":2.6,"ET":1.8,"glass":"N-BK7","bfl":48.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1611","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":60.0,"lambda_nm":587.6,"R1":31.0,"CT":3.0,"ET":2.3,"glass":"N-BK7","bfl":58.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1612","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":75.0,"lambda_nm":587.6,"R1":38.8,"CT":2.5,"ET":2.0,"glass":"N-BK7","bfl":73.4,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1207","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":99.7,"lambda_nm":587.6,"R1":51.5,"CT":2.2,"ET":1.8,"glass":"N-BK7","bfl":98.2,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1613","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":125.0,"lambda_nm":587.6,"R1":64.6,"CT":2.2,"ET":1.9,"glass":"N-BK7","bfl":123.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1614","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":150.0,"lambda_nm":587.6,"R1":77.5,"CT":2.2,"ET":1.9,"glass":"N-BK7","bfl":148.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1615","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":175.0,"lambda_nm":587.6,"R1":90.4,"CT":2.2,"ET":2.0,"glass":"N-BK7","bfl":173.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1616","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":200.0,"lambda_nm":587.6,"R1":103.4,"CT":2.2,"ET":2.0,"glass":"N-BK7","bfl":198.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1617","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":250.0,"lambda_nm":587.6,"R1":129.2,"CT":2.2,"ET":2.0,"glass":"N-BK7","bfl":248.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1618","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":300.0,"lambda_nm":587.6,"R1":155.0,"CT":2.2,"ET":2.1,"glass":"N-BK7","bfl":298.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1619","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":350.0,"lambda_nm":587.6,"R1":180.9,"CT":2.2,"ET":2.1,"glass":"N-BK7","bfl":348.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1620","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":400.0,"lambda_nm":587.6,"R1":206.7,"CT":2.2,"ET":2.1,"glass":"N-BK7","bfl":398.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1621","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":450.0,"lambda_nm":587.6,"R1":232.6,"CT":2.2,"ET":2.1,"glass":"N-BK7","bfl":448.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1622","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":500.0,"lambda_nm":587.6,"R1":258.4,"CT":2.2,"ET":2.1,"glass":"N-BK7","bfl":498.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1623","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":600.0,"lambda_nm":587.6,"R1":310.1,"CT":2.0,"ET":1.9,"glass":"N-BK7","bfl":598.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1624","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":750.0,"lambda_nm":587.6,"R1":387.6,"CT":2.0,"ET":1.9,"glass":"N-BK7","bfl":748.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1625","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":850.0,"lambda_nm":587.6,"R1":439.3,"CT":2.0,"ET":2.0,"glass":"N-BK7","bfl":848.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1626","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":1000.0,"lambda_nm":587.6,"R1":516.8,"CT":2.0,"ET":2.0,"glass":"N-BK7","bfl":998.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1627","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":1500.0,"lambda_nm":587.6,"R1":775.2,"CT":2.0,"ET":2.0,"glass":"N-BK7","bfl":1498.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1628","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":2000.0,"lambda_nm":587.6,"R1":1033.6,"CT":2.0,"ET":2.0,"glass":"N-BK7","bfl":1998.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1629","vendor":"Thorlabs","type":"plano-convex","D":12.7,"f":2500.0,"lambda_nm":587.6,"R1":1292.0,"CT":2.0,"ET":2.0,"glass":"N-BK7","bfl":2498.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1859","vendor":"Thorlabs","type":"plano-convex","D":18.0,"f":19.9,"lambda_nm":587.6,"R1":10.3,"CT":7.1,"ET":1.8,"glass":"N-BK7","bfl":15.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1270","vendor":"Thorlabs","type":"plano-convex","D":18.0,"f":24.9,"lambda_nm":587.6,"R1":12.9,"CT":5.5,"ET":1.8,"glass":"N-BK7","bfl":21.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1085","vendor":"Thorlabs","type":"plano-convex","D":18.0,"f":29.9,"lambda_nm":587.6,"R1":15.5,"CT":4.7,"ET":1.8,"glass":"N-BK7","bfl":26.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1119","vendor":"Thorlabs","type":"plano-convex","D":18.0,"f":49.8,"lambda_nm":587.6,"R1":25.8,"CT":3.4,"ET":1.8,"glass":"N-BK7","bfl":47.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1252","vendor":"Thorlabs","type":"plano-convex","D":25.0,"f":25.4,"lambda_nm":587.6,"R1":13.1,"CT":11.7,"ET":2.5,"glass":"N-BK7","bfl":17.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1255","vendor":"Thorlabs","type":"plano-convex","D":25.0,"f":50.1,"lambda_nm":587.6,"R1":25.8,"CT":5.3,"ET":2.07,"glass":"N-BK7","bfl":46.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1257","vendor":"Thorlabs","type":"plano-convex","D":25.0,"f":74.9,"lambda_nm":587.6,"R1":38.6,"CT":4.1,"ET":2.02,"glass":"N-BK7","bfl":72.2,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1251","vendor":"Thorlabs","type":"plano-convex","D":25.0,"f":100.0,"lambda_nm":587.6,"R1":51.5,"CT":3.6,"ET":2.06,"glass":"N-BK7","bfl":97.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1253","vendor":"Thorlabs","type":"plano-convex","D":25.0,"f":200.0,"lambda_nm":587.6,"R1":103.0,"CT":2.8,"ET":2.04,"glass":"N-BK7","bfl":198.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1951","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":25.3,"lambda_nm":587.6,"R1":13.1,"CT":11.7,"ET":1.8,"glass":"N-BK7","bfl":17.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1805","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":29.9,"lambda_nm":587.6,"R1":15.5,"CT":8.6,"ET":2.0,"glass":"N-BK7","bfl":24.2,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1027","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":34.9,"lambda_nm":587.6,"R1":18.0,"CT":7.2,"ET":2.0,"glass":"N-BK7","bfl":30.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1422","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":39.9,"lambda_nm":587.6,"R1":20.6,"CT":6.4,"ET":2.0,"glass":"N-BK7","bfl":35.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1131","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":49.8,"lambda_nm":587.6,"R1":25.8,"CT":5.3,"ET":2.0,"glass":"N-BK7","bfl":46.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1134","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":59.8,"lambda_nm":587.6,"R1":30.9,"CT":4.7,"ET":2.0,"glass":"N-BK7","bfl":56.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1608","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":74.8,"lambda_nm":587.6,"R1":38.6,"CT":4.1,"ET":2.0,"glass":"N-BK7","bfl":72.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1509","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":99.7,"lambda_nm":587.6,"R1":51.5,"CT":3.6,"ET":2.0,"glass":"N-BK7","bfl":97.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1986","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":124.6,"lambda_nm":587.6,"R1":64.4,"CT":3.3,"ET":2.0,"glass":"N-BK7","bfl":122.4,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1433","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":149.5,"lambda_nm":587.6,"R1":77.3,"CT":3.1,"ET":2.0,"glass":"N-BK7","bfl":147.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1229","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":174.4,"lambda_nm":587.6,"R1":90.1,"CT":2.9,"ET":2.0,"glass":"N-BK7","bfl":172.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1708","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":199.3,"lambda_nm":587.6,"R1":103.0,"CT":2.8,"ET":2.0,"glass":"N-BK7","bfl":197.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1461","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":249.2,"lambda_nm":587.6,"R1":128.8,"CT":2.6,"ET":2.0,"glass":"N-BK7","bfl":247.4,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1484","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":299.0,"lambda_nm":587.6,"R1":154.5,"CT":2.5,"ET":2.0,"glass":"N-BK7","bfl":297.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1630","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":350.0,"lambda_nm":587.6,"R1":180.9,"CT":2.5,"ET":2.1,"glass":"N-BK7","bfl":348.4,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1172","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":398.7,"lambda_nm":587.6,"R1":206.0,"CT":2.4,"ET":2.0,"glass":"N-BK7","bfl":397.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1631","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":450.0,"lambda_nm":587.6,"R1":232.6,"CT":2.4,"ET":2.1,"glass":"N-BK7","bfl":448.4,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1908","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":498.3,"lambda_nm":587.6,"R1":257.5,"CT":2.3,"ET":2.0,"glass":"N-BK7","bfl":496.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1632","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":600.0,"lambda_nm":587.6,"R1":310.1,"CT":2.2,"ET":1.9,"glass":"N-BK7","bfl":598.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1978","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":747.5,"lambda_nm":587.6,"R1":386.3,"CT":2.2,"ET":2.0,"glass":"N-BK7","bfl":746.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1633","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":850.0,"lambda_nm":587.6,"R1":439.3,"CT":2.2,"ET":2.0,"glass":"N-BK7","bfl":848.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1464","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":996.7,"lambda_nm":587.6,"R1":515.1,"CT":2.2,"ET":2.0,"glass":"N-BK7","bfl":995.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1254","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":1500.0,"lambda_nm":587.6,"R1":775.2,"CT":2.1,"ET":2.0,"glass":"N-BK7","bfl":1498.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1258","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":2000.0,"lambda_nm":587.6,"R1":1033.6,"CT":2.1,"ET":2.0,"glass":"N-BK7","bfl":1998.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1259","vendor":"Thorlabs","type":"plano-convex","D":25.4,"f":2500.0,"lambda_nm":587.6,"R1":1292.0,"CT":2.1,"ET":2.0,"glass":"N-BK7","bfl":2498.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1274","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":39.9,"lambda_nm":587.6,"R1":20.6,"CT":9.0,"ET":2.5,"glass":"N-BK7","bfl":34.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1102","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":49.8,"lambda_nm":587.6,"R1":25.8,"CT":7.3,"ET":2.5,"glass":"N-BK7","bfl":45.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1765","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":74.8,"lambda_nm":587.6,"R1":38.6,"CT":5.5,"ET":2.5,"glass":"N-BK7","bfl":71.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1031","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":99.7,"lambda_nm":587.6,"R1":51.5,"CT":4.7,"ET":2.5,"glass":"N-BK7","bfl":96.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1907","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":149.5,"lambda_nm":587.6,"R1":77.3,"CT":3.1,"ET":1.6,"glass":"N-BK7","bfl":147.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1541","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":199.3,"lambda_nm":587.6,"R1":103.0,"CT":2.8,"ET":1.7,"glass":"N-BK7","bfl":197.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1832","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":249.2,"lambda_nm":587.6,"R1":128.8,"CT":2.6,"ET":1.7,"glass":"N-BK7","bfl":247.4,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1419","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":299.0,"lambda_nm":587.6,"R1":154.5,"CT":2.5,"ET":1.8,"glass":"N-BK7","bfl":297.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1237","vendor":"Thorlabs","type":"plano-convex","D":30.0,"f":498.3,"lambda_nm":587.6,"R1":257.5,"CT":2.3,"ET":1.8,"glass":"N-BK7","bfl":496.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1385","vendor":"Thorlabs","type":"plano-convex","D":38.1,"f":50.0,"lambda_nm":587.6,"R1":25.8,"CT":10.9,"ET":2.5,"glass":"N-BK7","bfl":42.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1386","vendor":"Thorlabs","type":"plano-convex","D":38.1,"f":75.0,"lambda_nm":587.6,"R1":38.8,"CT":7.5,"ET":2.5,"glass":"N-BK7","bfl":70.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1387","vendor":"Thorlabs","type":"plano-convex","D":38.1,"f":100.0,"lambda_nm":587.6,"R1":51.7,"CT":6.1,"ET":2.5,"glass":"N-BK7","bfl":96.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1388","vendor":"Thorlabs","type":"plano-convex","D":38.1,"f":150.0,"lambda_nm":587.6,"R1":77.5,"CT":4.9,"ET":2.5,"glass":"N-BK7","bfl":146.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1389","vendor":"Thorlabs","type":"plano-convex","D":38.1,"f":200.0,"lambda_nm":587.6,"R1":103.4,"CT":4.3,"ET":2.5,"glass":"N-BK7","bfl":197.2,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1401","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":59.8,"lambda_nm":587.6,"R1":30.9,"CT":16.3,"ET":3.0,"glass":"N-BK7","bfl":49.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1145","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":74.8,"lambda_nm":587.6,"R1":38.6,"CT":12.5,"ET":3.0,"glass":"N-BK7","bfl":66.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1050","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":99.7,"lambda_nm":587.6,"R1":51.5,"CT":9.7,"ET":3.0,"glass":"N-BK7","bfl":93.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1384","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":124.6,"lambda_nm":587.6,"R1":64.4,"CT":8.2,"ET":3.0,"glass":"N-BK7","bfl":119.2,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1417","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":149.5,"lambda_nm":587.6,"R1":77.3,"CT":7.3,"ET":3.0,"glass":"N-BK7","bfl":144.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1399","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":174.4,"lambda_nm":587.6,"R1":90.1,"CT":6.7,"ET":3.0,"glass":"N-BK7","bfl":170.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1979","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":199.3,"lambda_nm":587.6,"R1":103.0,"CT":6.2,"ET":3.0,"glass":"N-BK7","bfl":195.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1301","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":249.2,"lambda_nm":587.6,"R1":128.8,"CT":5.5,"ET":3.0,"glass":"N-BK7","bfl":245.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1256","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":299.0,"lambda_nm":587.6,"R1":154.5,"CT":5.1,"ET":3.0,"glass":"N-BK7","bfl":295.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1634","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":350.0,"lambda_nm":587.6,"R1":180.9,"CT":4.8,"ET":3.0,"glass":"N-BK7","bfl":346.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1725","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":398.7,"lambda_nm":587.6,"R1":206.0,"CT":4.6,"ET":3.0,"glass":"N-BK7","bfl":395.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1635","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":450.0,"lambda_nm":587.6,"R1":232.6,"CT":4.5,"ET":3.1,"glass":"N-BK7","bfl":447.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1380","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":498.3,"lambda_nm":587.6,"R1":257.5,"CT":4.3,"ET":3.0,"glass":"N-BK7","bfl":495.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1636","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":600.0,"lambda_nm":587.6,"R1":310.1,"CT":4.0,"ET":3.0,"glass":"N-BK7","bfl":597.4,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1727","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":747.5,"lambda_nm":587.6,"R1":386.3,"CT":3.8,"ET":3.0,"glass":"N-BK7","bfl":745.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1637","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":850.0,"lambda_nm":587.6,"R1":439.3,"CT":3.8,"ET":3.1,"glass":"N-BK7","bfl":847.5,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1779","vendor":"Thorlabs","type":"plano-convex","D":50.8,"f":996.7,"lambda_nm":587.6,"R1":515.1,"CT":3.6,"ET":3.0,"glass":"N-BK7","bfl":994.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1740","vendor":"Thorlabs","type":"plano-convex","D":75.0,"f":84.7,"lambda_nm":587.6,"R1":43.8,"CT":24.2,"ET":3.0,"glass":"N-BK7","bfl":68.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1238","vendor":"Thorlabs","type":"plano-convex","D":75.0,"f":99.7,"lambda_nm":587.6,"R1":51.5,"CT":19.2,"ET":3.0,"glass":"N-BK7","bfl":87.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1002","vendor":"Thorlabs","type":"plano-convex","D":75.0,"f":149.5,"lambda_nm":587.6,"R1":77.3,"CT":12.7,"ET":3.0,"glass":"N-BK7","bfl":141.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA1353","vendor":"Thorlabs","type":"plano-convex","D":75.0,"f":199.3,"lambda_nm":587.6,"R1":103.0,"CT":10.1,"ET":3.0,"glass":"N-BK7","bfl":192.7,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC020-004-A","vendor":"Thorlabs","type":"achromat","D":2.0,"f":4.0,"lambda_nm":587.6,"R1":2.38,"R2":-2.18,"R3":-7.87,"CT1":1.11,"CT2":1.3,"ET":2.13,"glass1":"N-SK16","glass2":"N-LASF9","bfl":2.92,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC050-008-A","vendor":"Thorlabs","type":"achromat","D":5.0,"f":7.5,"lambda_nm":587.6,"R1":5.3,"R2":-3.9,"R3":-17.1,"CT1":2.8,"CT2":1.7,"ET":3.7,"glass1":"N-BAF10","glass2":"N-SF6","bfl":5.2,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC050-010-A","vendor":"Thorlabs","type":"achromat","D":5.0,"f":10.0,"lambda_nm":587.6,"R1":6.6,"R2":-4.3,"R3":-15.4,"CT1":2.5,"CT2":1.9,"ET":3.7,"glass1":"N-BAK4","glass2":"SF5","bfl":7.9,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC050-015-A","vendor":"Thorlabs","type":"achromat","D":5.0,"f":15.0,"lambda_nm":587.6,"R1":12.5,"R2":-5.3,"R3":-12.1,"CT1":2.7,"CT2":2.1,"ET":4.3,"glass1":"N-BK7","glass2":"SF2","bfl":13.6,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC060-010-A","vendor":"Thorlabs","type":"achromat","D":6.0,"f":10.0,"lambda_nm":587.6,"R1":6.2,"R2":-4.6,"R3":-19.6,"CT1":2.5,"CT2":1.5,"ET":3.0,"glass1":"N-BAK4","glass2":"SF5","bfl":7.9,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC064-013-A","vendor":"Thorlabs","type":"achromat","D":6.35,"f":12.7,"lambda_nm":587.6,"R1":7.1,"R2":-5.9,"R3":-40.4,"CT1":2.5,"CT2":1.5,"ET":3.1,"glass1":"N-BAK4","glass2":"N-SF5","bfl":10.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC064-015-A","vendor":"Thorlabs","type":"achromat","D":6.35,"f":15.0,"lambda_nm":587.6,"R1":8.8,"R2":-6.6,"R3":-21.7,"CT1":2.5,"CT2":1.5,"ET":3.2,"glass1":"N-BK7","glass2":"N-SF2","bfl":13.0,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC080-010-A","vendor":"Thorlabs","type":"achromat","D":8.0,"f":10.0,"lambda_nm":587.6,"R1":7.1,"R2":-5.3,"R3":-22.7,"CT1":4.5,"CT2":2.0,"ET":4.9,"glass1":"N-BAF10","glass2":"N-SF6","bfl":6.7,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC080-016-A","vendor":"Thorlabs","type":"achromat","D":8.0,"f":16.0,"lambda_nm":587.6,"R1":11.0,"R2":-9.2,"R3":-46.8,"CT1":2.5,"CT2":1.5,"ET":3.1,"glass1":"N-BAF10","glass2":"N-SF6","bfl":13.9,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC080-020-A","vendor":"Thorlabs","type":"achromat","D":8.0,"f":20.0,"lambda_nm":587.6,"R1":11.1,"R2":-9.2,"R3":-34.8,"CT1":2.5,"CT2":1.5,"ET":3.0,"glass1":"N-BK7","glass2":"SF2","bfl":17.8,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC080-030-A","vendor":"Thorlabs","type":"achromat","D":8.0,"f":30.0,"lambda_nm":587.6,"R1":16.0,"R2":-13.5,"R3":-59.4,"CT1":2.5,"CT2":1.5,"ET":3.4,"glass1":"N-BK7","glass2":"N-SF2","bfl":27.8,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACN127-050-A","vendor":"Thorlabs","type":"achromat-neg","D":12.7,"f":-50.0,"lambda_nm":587.6,"R1":-25.6,"R2":25.6,"R3":372.7,"CT1":1.5,"CT2":2.2,"ET":4.6,"glass1":"N-BAK4","glass2":"SF5","bfl":-52.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACN127-030-A","vendor":"Thorlabs","type":"achromat-neg","D":12.7,"f":-30.0,"lambda_nm":587.6,"R1":-16.2,"R2":16.5,"R3":154.2,"CT1":1.5,"CT2":2.3,"ET":5.2,"glass1":"N-BAK4","glass2":"SF5","bfl":-32.2,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACN127-025-A","vendor":"Thorlabs","type":"achromat-neg","D":12.7,"f":-25.0,"lambda_nm":587.6,"R1":-16.9,"R2":16.5,"R3":97.7,"CT1":1.5,"CT2":2.5,"ET":5.4,"glass1":"N-BAF10","glass2":"N-SF6","bfl":-27.0,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACN127-020-A","vendor":"Thorlabs","type":"achromat-neg","D":12.7,"f":-20.0,"lambda_nm":587.6,"R1":-13.5,"R2":14.3,"R3":87.9,"CT1":1.5,"CT2":3.0,"ET":6.3,"glass1":"N-BAF10","glass2":"N-SF6","bfl":-22.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC127-019-A","vendor":"Thorlabs","type":"achromat","D":12.7,"f":19.0,"lambda_nm":587.6,"R1":12.9,"R2":-11.0,"R3":-59.3,"CT1":4.5,"CT2":1.5,"ET":4.0,"glass1":"N-BAF10","glass2":"N-SF6","bfl":15.7,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC127-025-A","vendor":"Thorlabs","type":"achromat","D":12.7,"f":25.0,"lambda_nm":587.6,"R1":18.8,"R2":-10.6,"R3":-68.1,"CT1":5.0,"CT2":2.0,"ET":5.6,"glass1":"N-BAF10","glass2":"N-SF10","bfl":21.5,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC127-030-A","vendor":"Thorlabs","type":"achromat","D":12.7,"f":30.0,"lambda_nm":587.6,"R1":17.9,"R2":-13.5,"R3":-44.2,"CT1":3.5,"CT2":1.5,"ET":3.4,"glass1":"N-BK7","glass2":"SF2","bfl":27.5,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC127-050-A","vendor":"Thorlabs","type":"achromat","D":12.7,"f":50.0,"lambda_nm":587.6,"R1":27.4,"R2":-22.5,"R3":-91.8,"CT1":3.5,"CT2":1.5,"ET":4.0,"glass1":"N-BK7","glass2":"SF2","bfl":47.2,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC127-075-A","vendor":"Thorlabs","type":"achromat","D":12.7,"f":75.0,"lambda_nm":587.6,"R1":41.3,"R2":-34.0,"R3":-137.1,"CT1":2.5,"CT2":1.5,"ET":3.4,"glass1":"N-BK7","glass2":"SF2","bfl":72.9,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACN254-100-A","vendor":"Thorlabs","type":"achromat-neg","D":25.4,"f":-100.1,"lambda_nm":587.6,"R1":-52.0,"R2":49.9,"R3":600.0,"CT1":2.0,"CT2":4.0,"ET":7.7,"glass1":"N-BAK4","glass2":"SF5","bfl":-103.6,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACN254-075-A","vendor":"Thorlabs","type":"achromat-neg","D":25.4,"f":-75.1,"lambda_nm":587.6,"R1":-39.0,"R2":39.2,"R3":489.8,"CT1":2.0,"CT2":4.3,"ET":8.6,"glass1":"N-BAK4","glass2":"SF5","bfl":-78.8,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACN254-050-A","vendor":"Thorlabs","type":"achromat-neg","D":25.4,"f":-50.0,"lambda_nm":587.6,"R1":-34.0,"R2":32.5,"R3":189.2,"CT1":2.0,"CT2":4.5,"ET":9.4,"glass1":"N-BAF10","glass2":"N-SF6","bfl":-53.2,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACN254-040-A","vendor":"Thorlabs","type":"achromat-neg","D":25.4,"f":-40.1,"lambda_nm":587.6,"R1":-27.1,"R2":27.1,"R3":189.2,"CT1":2.0,"CT2":5.0,"ET":10.6,"glass1":"N-BAF10","glass2":"N-SF11","bfl":-43.6,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-030-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":30.0,"lambda_nm":587.6,"R1":20.9,"R2":-16.7,"R3":-79.8,"CT1":12.0,"CT2":2.0,"ET":8.8,"glass1":"N-BAF10","glass2":"N-SF6","bfl":22.9,"coating":"A (400–700 nm)","note":"catalogue back focal length 22.9 mm; the listed rounded prescription gives 22.25 mm paraxially (f agrees within 0.1 %)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-035-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":35.2,"lambda_nm":587.6,"R1":24.0,"R2":-19.1,"R3":-102.1,"CT1":12.0,"CT2":2.0,"ET":9.6,"glass1":"N-BAF10","glass2":"N-SF6","bfl":27.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-040-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":40.1,"lambda_nm":587.6,"R1":23.7,"R2":-20.1,"R3":-57.7,"CT1":10.0,"CT2":2.5,"ET":7.4,"glass1":"N-BK7","glass2":"SF5","bfl":33.4,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-045-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":45.0,"lambda_nm":587.6,"R1":31.2,"R2":-25.9,"R3":-130.6,"CT1":7.0,"CT2":2.0,"ET":5.7,"glass1":"N-BAF10","glass2":"N-SF6","bfl":40.2,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-050-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":50.2,"lambda_nm":587.6,"R1":33.3,"R2":-22.3,"R3":-291.1,"CT1":9.0,"CT2":2.5,"ET":8.7,"glass1":"N-BAF10","glass2":"N-SF10","bfl":43.4,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-060-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":60.1,"lambda_nm":587.6,"R1":41.7,"R2":-25.9,"R3":-230.7,"CT1":8.0,"CT2":2.5,"ET":8.2,"glass1":"E-BAF11","glass2":"E-FD10","glass_note":"FD10 modelled with E-FD10 data","bfl":54.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-075-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":74.9,"lambda_nm":587.6,"R1":46.5,"R2":-33.9,"R3":-95.5,"CT1":7.0,"CT2":2.5,"ET":6.9,"glass1":"N-BK7","glass2":"SF5","bfl":70.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-080-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":80.0,"lambda_nm":587.6,"R1":49.6,"R2":-35.5,"R3":-101.2,"CT1":7.0,"CT2":3.0,"ET":7.3,"glass1":"N-BK7","glass2":"N-SF5","bfl":75.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-100-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":100.1,"lambda_nm":587.6,"R1":62.8,"R2":-45.7,"R3":-128.2,"CT1":4.0,"CT2":2.5,"ET":4.7,"glass1":"N-BK7","glass2":"SF5","bfl":97.1,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-125-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":125.0,"lambda_nm":587.6,"R1":77.6,"R2":-55.9,"R3":-160.8,"CT1":4.0,"CT2":2.8,"ET":5.0,"glass1":"N-BK7","glass2":"N-SF5","bfl":122.0,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-150-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":150.0,"lambda_nm":587.6,"R1":91.6,"R2":-66.7,"R3":-197.7,"CT1":5.7,"CT2":2.2,"ET":6.6,"glass1":"N-BK7","glass2":"SF5","bfl":146.1,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-200-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":200.2,"lambda_nm":587.6,"R1":77.4,"R2":-87.6,"R3":291.1,"CT1":4.0,"CT2":2.5,"ET":5.7,"glass1":"N-SSK5","glass2":"LAFN7","bfl":194.0,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-250-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":250.0,"lambda_nm":587.6,"R1":137.1,"R2":-111.5,"R3":-459.2,"CT1":4.0,"CT2":2.0,"ET":5.2,"glass1":"N-BK7","glass2":"SF2","bfl":246.7,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-300-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":300.2,"lambda_nm":587.6,"R1":165.2,"R2":-137.1,"R3":-557.4,"CT1":4.0,"CT2":2.0,"ET":5.4,"glass1":"N-BK7","glass2":"SF2","bfl":297.0,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-400-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":399.3,"lambda_nm":587.6,"R1":219.8,"R2":-181.6,"R3":-738.5,"CT1":4.0,"CT2":2.0,"ET":5.5,"glass1":"N-BK7","glass2":"SF2","bfl":396.0,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC254-500-A","vendor":"Thorlabs","type":"achromat","D":25.4,"f":502.5,"lambda_nm":587.6,"R1":337.3,"R2":-186.8,"R3":-557.4,"CT1":4.0,"CT2":2.0,"ET":5.6,"glass1":"N-BK7","glass2":"SF2","bfl":499.9,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC300-050-A","vendor":"Thorlabs","type":"achromat","D":30.0,"f":50.0,"lambda_nm":587.6,"R1":34.0,"R2":-29.4,"R3":-161.5,"CT1":8.5,"CT2":2.0,"ET":6.3,"glass1":"N-BAF10","glass2":"N-SF6","bfl":44.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC300-080-A","vendor":"Thorlabs","type":"achromat","D":30.0,"f":80.0,"lambda_nm":587.6,"R1":56.0,"R2":-44.2,"R3":-219.8,"CT1":8.5,"CT2":2.0,"ET":7.9,"glass1":"N-BAF10","glass2":"N-SF6","bfl":74.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC300-100-A","vendor":"Thorlabs","type":"achromat","D":30.0,"f":100.0,"lambda_nm":587.6,"R1":70.0,"R2":-57.0,"R3":-284.4,"CT1":5.0,"CT2":2.0,"ET":5.0,"glass1":"N-BAF10","glass2":"N-SF6","bfl":96.4,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC508-075-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":74.9,"lambda_nm":587.6,"R1":50.8,"R2":-41.7,"R3":-247.7,"CT1":20.0,"CT2":3.0,"ET":14.9,"glass1":"E-BAF11","glass2":"N-SF11","bfl":61.8,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC508-080-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":80.0,"lambda_nm":587.6,"R1":54.9,"R2":-46.4,"R3":-247.2,"CT1":16.0,"CT2":2.0,"ET":10.5,"glass1":"N-BAF10","glass2":"N-SF6","bfl":69.9,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC508-100-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":100.0,"lambda_nm":587.6,"R1":71.1,"R2":-44.2,"R3":-363.1,"CT1":16.0,"CT2":4.0,"ET":14.4,"glass1":"N-BAF10","glass2":"N-SF10","bfl":89.0,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC508-150-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":150.0,"lambda_nm":587.6,"R1":83.2,"R2":-72.1,"R3":-247.7,"CT1":12.0,"CT2":3.0,"ET":9.7,"glass1":"N-BK7","glass2":"SF5","bfl":140.4,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"AC508-180-Ag","vendor":"Thorlabs","type":"achromat","D":50.8,"f":180.0,"lambda_nm":587.6,"R1":109.7,"R2":-80.7,"R3":-238.5,"CT1":12.0,"CT2":2.0,"ET":9.4,"glass1":"N-BK7","glass2":"N-SF5","bfl":172.7,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACT508-200-Ag","vendor":"Thorlabs","type":"achromat","D":50.8,"f":200.0,"lambda_nm":587.6,"R1":106.2,"R2":-92.1,"R3":-409.4,"CT1":10.6,"CT2":6.0,"ET":12.8,"glass1":"N-BK7","glass2":"N-SF2","bfl":190.6,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACT508-250-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":250.0,"lambda_nm":587.6,"R1":131.2,"R2":-116.0,"R3":-538.1,"CT1":9.3,"CT2":6.0,"ET":12.3,"glass1":"N-BK7","glass2":"N-SF2","bfl":241.4,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACT508-300-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":300.0,"lambda_nm":587.6,"R1":153.7,"R2":-139.9,"R3":-706.8,"CT1":8.4,"CT2":7.0,"ET":12.4,"glass1":"N-BK7","glass2":"N-SF2","bfl":291.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACT508-400-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":400.0,"lambda_nm":587.6,"R1":292.3,"R2":-148.9,"R3":-398.5,"CT1":8.0,"CT2":8.0,"ET":14.1,"glass1":"N-BK7","glass2":"N-SF2","bfl":394.6,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACT508-500-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":500.0,"lambda_nm":587.6,"R1":382.5,"R2":-182.1,"R3":-471.2,"CT1":6.0,"CT2":6.0,"ET":10.5,"glass1":"N-BK7","glass2":"N-SF2","bfl":496.3,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACT508-750-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":750.0,"lambda_nm":587.6,"R1":398.6,"R2":-343.7,"R3":-1544.5,"CT1":6.0,"CT2":6.0,"ET":11.0,"glass1":"N-BK7","glass2":"N-SF2","bfl":743.9,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"ACT508-1000-A","vendor":"Thorlabs","type":"achromat","D":50.8,"f":1000.0,"lambda_nm":587.6,"R1":757.9,"R2":-364.7,"R3":-954.2,"CT1":6.0,"CT2":6.0,"ET":11.3,"glass1":"N-BK7","glass2":"N-SF2","bfl":996.4,"coating":"A (400–700 nm)","url":"https://www.thorlabs.com/unmounted-achromatic-doublets-ar-coated-400---700-nm","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1234","vendor":"Thorlabs","type":"meniscus-pos","D":25.4,"f":100.0,"lambda_nm":587.6,"R1":32.1,"R2":82.2,"CT":3.6,"ET":2.0,"glass":"N-BK7","bfl":95.9,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1156","vendor":"Thorlabs","type":"meniscus-pos","D":25.4,"f":125.0,"lambda_nm":587.6,"R1":40.6,"R2":106.9,"CT":3.3,"ET":2.0,"glass":"N-BK7","bfl":121.2,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1104","vendor":"Thorlabs","type":"meniscus-pos","D":25.4,"f":150.0,"lambda_nm":587.6,"R1":49.1,"R2":131.6,"CT":3.1,"ET":2.0,"glass":"N-BK7","bfl":146.3,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1202","vendor":"Thorlabs","type":"meniscus-pos","D":25.4,"f":200.0,"lambda_nm":587.6,"R1":66.2,"R2":182.2,"CT":2.8,"ET":2.0,"glass":"N-BK7","bfl":196.5,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1929","vendor":"Thorlabs","type":"meniscus-pos","D":25.4,"f":300.0,"lambda_nm":587.6,"R1":100.9,"R2":288.2,"CT":2.5,"ET":2.0,"glass":"N-BK7","bfl":296.5,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1076","vendor":"Thorlabs","type":"meniscus-pos","D":50.8,"f":100.0,"lambda_nm":587.6,"R1":30.3,"R2":65.8,"CT":9.7,"ET":1.1,"glass":"N-BK7","bfl":88.8,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1418","vendor":"Thorlabs","type":"meniscus-pos","D":50.8,"f":150.0,"lambda_nm":587.6,"R1":47.9,"R2":119.3,"CT":7.3,"ET":2.7,"glass":"N-BK7","bfl":141.7,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1015","vendor":"Thorlabs","type":"meniscus-pos","D":50.8,"f":200.0,"lambda_nm":587.6,"R1":65.2,"R2":171.6,"CT":6.2,"ET":2.9,"glass":"N-BK7","bfl":192.9,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1613","vendor":"Thorlabs","type":"meniscus-pos","D":50.8,"f":250.0,"lambda_nm":587.6,"R1":82.5,"R2":224.7,"CT":5.5,"ET":2.9,"glass":"N-BK7","bfl":243.5,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LE1985","vendor":"Thorlabs","type":"meniscus-pos","D":50.8,"f":300.0,"lambda_nm":587.6,"R1":100.1,"R2":279.1,"CT":5.1,"ET":3.0,"glass":"N-BK7","bfl":293.8,"url":"https://www.thorlabs.com/n-bk7-positive-meniscus-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LBF254-040","vendor":"Thorlabs","type":"best-form","D":25.4,"f":40.0,"lambda_nm":587.6,"R1":24.02,"R2":-134.6,"CT":6.5,"ET":2.3,"glass":"N-BK7","bfl":36.3,"coating":"uncoated","url":"https://www.thorlabs.com/1-inch-n-bk7-best-form-spherical-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LBF254-050","vendor":"Thorlabs","type":"best-form","D":25.4,"f":50.0,"lambda_nm":587.6,"R1":30.06,"R2":-172.0,"CT":6.5,"ET":3.2,"glass":"N-BK7","bfl":46.4,"coating":"uncoated","url":"https://www.thorlabs.com/1-inch-n-bk7-best-form-spherical-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LBF254-075","vendor":"Thorlabs","type":"best-form","D":25.4,"f":75.0,"lambda_nm":587.6,"R1":44.5,"R2":-289.0,"CT":5.0,"ET":2.9,"glass":"N-BK7","bfl":72.1,"coating":"uncoated","url":"https://www.thorlabs.com/1-inch-n-bk7-best-form-spherical-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LBF254-100","vendor":"Thorlabs","type":"best-form","D":25.4,"f":100.0,"lambda_nm":587.6,"R1":60.02,"R2":-353.3,"CT":4.0,"ET":2.4,"glass":"N-BK7","bfl":97.3,"coating":"uncoated","url":"https://www.thorlabs.com/1-inch-n-bk7-best-form-spherical-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LBF254-150","vendor":"Thorlabs","type":"best-form","D":25.4,"f":150.0,"lambda_nm":587.6,"R1":89.35,"R2":-570.49,"CT":4.0,"ET":3.0,"glass":"N-BK7","bfl":147.5,"coating":"uncoated","url":"https://www.thorlabs.com/1-inch-n-bk7-best-form-spherical-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LBF254-200","vendor":"Thorlabs","type":"best-form","D":25.4,"f":200.0,"lambda_nm":587.6,"R1":121.5,"R2":-684.5,"CT":4.0,"ET":3.2,"glass":"N-BK7","bfl":197.8,"coating":"uncoated","url":"https://www.thorlabs.com/1-inch-n-bk7-best-form-spherical-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2024","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":4.0,"lambda_nm":587.6,"R1":3.1,"CT":1.0,"ET":0.8,"glass":"N-SF11","bfl":3.44,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2026","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":6.0,"lambda_nm":587.6,"R1":4.7,"CT":1.0,"ET":0.8,"glass":"N-SF11","bfl":5.44,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2036","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":6.0,"lambda_nm":587.6,"R1":4.7,"CT":1.5,"ET":1.2,"glass":"N-SF11","bfl":5.16,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2039","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":9.0,"lambda_nm":587.6,"R1":7.1,"CT":1.5,"ET":1.2,"glass":"N-SF11","bfl":8.16,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2024-A","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":4.0,"lambda_nm":587.6,"R1":3.1,"CT":1.0,"ET":0.8,"glass":"N-SF11","bfl":3.44,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2026-A","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":6.0,"lambda_nm":587.6,"R1":4.7,"CT":1.0,"ET":0.8,"glass":"N-SF11","bfl":5.44,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2036-A","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":6.0,"lambda_nm":587.6,"R1":4.7,"CT":1.5,"ET":1.2,"glass":"N-SF11","bfl":5.16,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2039-A","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":9.0,"lambda_nm":587.6,"R1":7.1,"CT":1.5,"ET":1.2,"glass":"N-SF11","bfl":8.16,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2024-B","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":4.0,"lambda_nm":587.6,"R1":3.1,"CT":1.0,"ET":0.8,"glass":"N-SF11","bfl":3.44,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2026-B","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":6.0,"lambda_nm":587.6,"R1":4.7,"CT":1.0,"ET":0.8,"glass":"N-SF11","bfl":5.44,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2036-B","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":6.0,"lambda_nm":587.6,"R1":4.7,"CT":1.5,"ET":1.2,"glass":"N-SF11","bfl":5.16,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2039-B","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":9.0,"lambda_nm":587.6,"R1":7.1,"CT":1.5,"ET":1.2,"glass":"N-SF11","bfl":8.16,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2024-C","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":4.0,"lambda_nm":587.6,"R1":3.1,"CT":1.0,"ET":0.8,"glass":"N-SF11","bfl":3.44,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2026-C","vendor":"Thorlabs","type":"plano-convex","D":2.0,"f":6.0,"lambda_nm":587.6,"R1":4.7,"CT":1.0,"ET":0.8,"glass":"N-SF11","bfl":5.44,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2036-C","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":6.0,"lambda_nm":587.6,"R1":4.7,"CT":1.5,"ET":1.2,"glass":"N-SF11","bfl":5.16,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LA2039-C","vendor":"Thorlabs","type":"plano-convex","D":3.0,"f":9.0,"lambda_nm":587.6,"R1":7.1,"CT":1.5,"ET":1.2,"glass":"N-SF11","bfl":8.16,"url":"https://www.thorlabs.com/n-sf11-plano-convex-lenses","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1975","vendor":"Thorlabs","type":"plano-concave","D":6.0,"f":-23.9,"lambda_nm":587.6,"R1":-12.4,"CT":2.0,"ET":2.4,"glass":"N-BK7","coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1906","vendor":"Thorlabs","type":"plano-concave","D":9.0,"f":-26.9,"lambda_nm":587.6,"R1":-13.9,"CT":2.0,"ET":2.7,"glass":"N-BK7","coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1054","vendor":"Thorlabs","type":"plano-concave","D":12.7,"f":-24.9,"lambda_nm":587.6,"R1":-12.9,"CT":3.0,"ET":4.7,"glass":"N-BK7","bfl":-26.9,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1060","vendor":"Thorlabs","type":"plano-concave","D":12.7,"f":-29.9,"lambda_nm":587.6,"R1":-15.4,"CT":3.0,"ET":4.4,"glass":"N-BK7","bfl":-31.8,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1439","vendor":"Thorlabs","type":"plano-concave","D":12.7,"f":-49.8,"lambda_nm":587.6,"R1":-25.7,"CT":3.5,"ET":4.3,"glass":"N-BK7","bfl":-52.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1259","vendor":"Thorlabs","type":"plano-concave","D":25.0,"f":-49.9,"lambda_nm":587.6,"R1":-25.7,"CT":3.5,"ET":6.7,"glass":"N-BK7","bfl":-52.2,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1258","vendor":"Thorlabs","type":"plano-concave","D":25.0,"f":-74.9,"lambda_nm":587.6,"R1":-38.6,"CT":3.5,"ET":5.6,"glass":"N-BK7","bfl":-77.3,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1254","vendor":"Thorlabs","type":"plano-concave","D":25.0,"f":-100.0,"lambda_nm":587.6,"R1":-51.5,"CT":4.0,"ET":5.5,"glass":"N-BK7","bfl":-102.6,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1715","vendor":"Thorlabs","type":"plano-concave","D":25.4,"f":-49.8,"lambda_nm":587.6,"R1":-25.7,"CT":3.5,"ET":6.9,"glass":"N-BK7","bfl":-52.1,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1582","vendor":"Thorlabs","type":"plano-concave","D":25.4,"f":-74.7,"lambda_nm":587.6,"R1":-38.6,"CT":3.5,"ET":5.6,"glass":"N-BK7","bfl":-77.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1120","vendor":"Thorlabs","type":"plano-concave","D":25.4,"f":-99.6,"lambda_nm":587.6,"R1":-51.5,"CT":4.0,"ET":5.6,"glass":"N-BK7","bfl":-102.2,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1315","vendor":"Thorlabs","type":"plano-concave","D":50.8,"f":-74.7,"lambda_nm":587.6,"R1":-38.6,"CT":3.5,"ET":13.0,"glass":"N-BK7","bfl":-77.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1093","vendor":"Thorlabs","type":"plano-concave","D":50.8,"f":-99.6,"lambda_nm":587.6,"R1":-51.5,"CT":4.0,"ET":10.7,"glass":"N-BK7","bfl":-102.2,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"},
  {"id":"LC1611","vendor":"Thorlabs","type":"plano-concave","D":50.8,"f":-149.4,"lambda_nm":587.6,"R1":-77.2,"CT":4.0,"ET":8.3,"glass":"N-BK7","bfl":-152.0,"coating":"uncoated","url":"https://www.thorlabs.com/n-bk7-plano-concave-lenses-uncoated","source":"thorlabs","read":"2026-11-13"}
];
/*@STOCK_END*/
var STOCK_TYPES = ['plano-convex', 'plano-concave', 'bi-convex', 'bi-concave', 'best-form', 'meniscus-pos', 'meniscus-neg', 'achromat', 'achromat-neg', 'asphere'];
var stock = {
  list: function (filter) {
    filter = filter || {};
    return STOCK.filter(function (s) {
      if (filter.type && (Array.isArray(filter.type) ? filter.type.indexOf(s.type) < 0 : s.type !== filter.type)) return false;
      if (filter.vendor && s.vendor !== filter.vendor) return false;
      if (filter.D != null && Math.abs(s.D - filter.D) > 0.6) return false;
      if (filter.glass && s.glass !== filter.glass) return false;
      return true;
    });
  },
  get: function (id) { for (var i = 0; i < STOCK.length; i++) if (STOCK[i].id === id) return STOCK[i]; return null; },
  /* nearest({type?, f, D?, lambda?}) -> entries sorted by |Δf|/|f| (and diameter match), each with df (mm) and rel; f negative for negative lenses */
  nearest: function (q, k) {
    q = q || {};
    var cand = stock.list({ type: q.type, vendor: q.vendor, D: q.D });
    if (!cand.length && q.D != null) cand = stock.list({ type: q.type, vendor: q.vendor });
    if (!isNum(q.f)) return cand.slice(0, k || 5);
    var out = cand.filter(function (s) { return Math.sign(s.f) === Math.sign(q.f); }).map(function (s) {
      var rel = Math.abs(s.f - q.f) / Math.abs(q.f);
      return { part: s, df: s.f - q.f, rel: rel, score: rel + (q.D != null ? Math.abs(s.D - q.D) / 1000 : 0) };
    });
    out.sort(function (a, b) { return a.score - b.score; });
    return out.slice(0, k || 5);
  },
  /* sequential surfaces (lensdesign/trace format) of a catalogue singlet or achromat, light entering surface R1 first; flip = reverse orientation */
  surfaces: function (id, flip) {
    var s = typeof id === 'string' ? stock.get(id) : id;
    if (!s) return null;
    var surf;
    if (s.type === 'achromat' || s.type === 'achromat-neg') {
      surf = [{ R: s.R1, t: s.CT1, material: s.glass1, sd: s.D / 2 }, { R: s.R2, t: s.CT2, material: s.glass2, sd: s.D / 2 }, { R: s.R3, t: 0, material: 'air', sd: s.D / 2 }];
      if (flip) surf = [{ R: neg(s.R3), t: s.CT2, material: s.glass2, sd: s.D / 2 }, { R: neg(s.R2), t: s.CT1, material: s.glass1, sd: s.D / 2 }, { R: neg(s.R1), t: 0, material: 'air', sd: s.D / 2 }];
    } else {
      surf = [{ R: s.R1, t: s.CT, material: s.glass, sd: s.D / 2 }, { R: s.R2, t: 0, material: 'air', sd: s.D / 2 }];
      if (flip) surf = [{ R: neg(s.R2), t: s.CT, material: s.glass, sd: s.D / 2 }, { R: neg(s.R1), t: 0, material: 'air', sd: s.D / 2 }];
    }
    surf.forEach(function (x) { if (s.k1 != null && x === surf[0] && !flip) { x.k = s.k1; if (s.asph) x.asph = s.asph.slice(); } });
    return surf;
    function neg(R) { return R == null ? null : -R; }
  }
};

/* =====================================================================================
   8. Project document (exchange between the six tools)
   ===================================================================================== */
var TOOLS = [
  { id: 'opticbench', order: 10, live: true, name: L('Optical Bench 3D', 'Оптичний стіл 3D', 'Optische Bank 3D', 'Optische bank 3D', 'Banc optique 3D', 'Banco óptico 3D', 'Ława optyczna 3D') },
  { id: 'gaussbeam', order: 20, live: true, name: L('Gaussian Beam & Mode Matching', 'Гауссів пучок і узгодження мод', 'Gauß-Strahl & Modenanpassung', 'Gaussische bundel & modematching', 'Faisceau gaussien et adaptation de mode', 'Haz gaussiano y adaptación de modos', 'Wiązka gaussowska i dopasowanie modów') },
  { id: 'lensdesign', order: 30, live: true, name: L('Lens Design & Image Quality', 'Проєктування лінз і якість зображення', 'Linsendesign & Bildqualität', 'Lensontwerp & beeldkwaliteit', 'Conception optique et qualité d’image', 'Diseño de lentes y calidad de imagen', 'Projektowanie soczewek i jakość obrazu') },
  { id: 'thinfilm', order: 40, live: true, name: L('Thin-Film Coatings', 'Тонкоплівкові покриття', 'Dünnschichtbeschichtungen', 'Dunnefilmcoatings', 'Revêtements en couches minces', 'Recubrimientos de capa fina', 'Powłoki cienkowarstwowe') },
  { id: 'lasersafety', order: 50, live: true, name: L('Laser Safety (MPE, NOHD, Class, Eyewear)', 'Лазерна безпека (MPE, NOHD, клас, захисні окуляри)', 'Lasersicherheit (MZB, NOHD, Klasse, Schutzbrillen)', 'Laserveiligheid (MPE, NOHD, klasse, laserbril)', 'Sécurité laser (EMP, DNRO, classe, lunettes)', 'Seguridad láser (EMP, DNRO, clase, gafas)', 'Bezpieczeństwo laserowe (MDE, NOHD, klasa, okulary)') },
  { id: 'mvlens', order: 60, live: true, name: L('Machine-Vision Lens Selector', 'Підбір об’єктива для машинного зору', 'Objektivauswahl für die Bildverarbeitung', 'Lenskeuze voor machine vision', 'Choix d’objectif pour la vision industrielle', 'Selector de objetivos para visión artificial', 'Dobór obiektywu do systemów wizyjnych') }
];
/* live: the tool is deployed on tools.petrov.re; projectBar links only live tools (others shown as plain text). Each deploy unit sets live: true for its tool. */
var TOOL_IDS = TOOLS.map(function (x) { return x.id; });
/* top-level blocks and the tool that owns each; 'source' is shared (last writer wins, recorded in source.updatedBy) */
var OWNERS = { bench: 'opticbench', lens: 'lensdesign', coating: 'thinfilm', camera: 'mvlens', source: '*' };
var ENUMS = {
  units: ['mm'],
  source_kind: ['laser', 'led', 'white', 'point', 'collimated'],
  pulse_mode: ['cw', 'single', 'repetitive']
};
var LIMITS = { bytes: 2000000, depth: 64, nodes: 100000, wavelengths: 64, elements: 2000, surfaces: 400, layers: 1000 };
var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };

/* Field meanings (contract, agreed with lasersafety 13.11): source.w0_mm = 1/e² waist RADIUS in mm; source.divergence_mrad = FULL-angle
   1/e² far-field divergence in mrad (null = from w0, M², λ); lambda_nm = list of wavelengths, lambda_nm[0] is the primary/laser line
   (there is no source.lambda_nm); source.power_W average power; pulse.tau_s pulse duration, pulse.prf_Hz repetition rate, pulse.energy_J per pulse. */
function emptyProject(opts) {
  opts = opts || {};
  return {
    schema: SCHEMA, revision: 1, name: opts.name || '', units: 'mm', lambda_nm: [632.8],
    source: { kind: 'laser', power_W: 0.005, w0_mm: 0.4, M2: 1.0, divergence_mrad: null, pulse: { mode: 'cw', tau_s: null, prf_Hz: null, energy_J: null } },
    bench: { table: { grid_mm: 25, thread: 'M6', size_mm: [900, 600] }, elements: [] },
    lens: { surfaces: [], fields_deg: [0], fno: null },
    coating: { layers: [], substrate: 'N-BK7', incident: 'air' },
    camera: { sensor: '', pixel_um: null, res: null },
    modules: {}
  };
}

var MSG = {
  too_many_nodes: L('more than {n} nodes', 'понад {n} вузлів', 'mehr als {n} Knoten', 'meer dan {n} knooppunten', 'plus de {n} nœuds', 'más de {n} nodos', 'ponad {n} węzłów'),
  too_deep: L('nesting deeper than {n}', 'вкладеність глибша за {n}', 'Verschachtelung tiefer als {n}', 'nesting dieper dan {n}', 'imbrication plus profonde que {n}', 'anidamiento de más de {n} niveles', 'zagnieżdżenie głębsze niż {n}'),
  non_finite: L('non-finite number', 'нескінченне або нечислове значення', 'keine endliche Zahl', 'geen eindig getal', 'nombre non fini', 'número no finito', 'liczba nieskończona lub nieokreślona'),
  bad_type: L('unsupported type {t}', 'непідтримуваний тип {t}', 'nicht unterstützter Typ {t}', 'niet-ondersteund type {t}', 'type {t} non pris en charge', 'tipo {t} no admitido', 'nieobsługiwany typ {t}'),
  not_plain: L('not a plain object', 'не простий об’єкт JSON', 'kein einfaches Objekt', 'geen gewoon object', 'pas un objet simple', 'no es un objeto simple', 'to nie jest zwykły obiekt'),
  forbidden_key: L('forbidden key {k}', 'заборонений ключ {k}', 'verbotener Schlüssel {k}', 'verboden sleutel {k}', 'clé interdite {k}', 'clave prohibida {k}', 'niedozwolony klucz {k}'),
  not_object: L('document is not an object', 'документ не є об’єктом', 'das Dokument ist kein Objekt', 'het document is geen object', 'le document n’est pas un objet', 'el documento no es un objeto', 'dokument nie jest obiektem'),
  number: L('number expected', 'очікується число', 'Zahl erwartet', 'getal verwacht', 'nombre attendu', 'se espera un número', 'oczekiwano liczby'),
  range: L('must be {lo}..{hi}', 'має бути в межах {lo}..{hi}', 'muss zwischen {lo} und {hi} liegen', 'moet tussen {lo} en {hi} liggen', 'doit être compris entre {lo} et {hi}', 'debe estar entre {lo} y {hi}', 'musi mieścić się w zakresie {lo}..{hi}'),
  string: L('string expected', 'очікується текст', 'Text erwartet', 'tekst verwacht', 'texte attendu', 'se espera un texto', 'oczekiwano tekstu'),
  object: L('object expected', 'очікується об’єкт', 'Objekt erwartet', 'object verwacht', 'objet attendu', 'se espera un objeto', 'oczekiwano obiektu'),
  array: L('array expected', 'очікується масив', 'Liste (Array) erwartet', 'lijst (array) verwacht', 'tableau attendu', 'se espera una lista (array)', 'oczekiwano tablicy'),
  too_many: L('more than {n} entries', 'понад {n} записів', 'mehr als {n} Einträge', 'meer dan {n} items', 'plus de {n} entrées', 'más de {n} entradas', 'ponad {n} pozycji'),
  schema: L('schema must be {s}', 'схема має бути {s}', 'Schema muss {s} sein', 'schema moet {s} zijn', 'le schéma doit être {s}', 'el esquema debe ser {s}', 'schemat musi mieć wartość {s}'),
  revision: L('revision must be a non-negative integer', 'ревізія має бути цілим невід’ємним числом', 'Revision muss eine nichtnegative ganze Zahl sein', 'revisie moet een niet-negatief geheel getal zijn', 'la révision doit être un entier positif ou nul', 'la revisión debe ser un entero no negativo', 'rewizja musi być nieujemną liczbą całkowitą'),
  enum: L('{k} must be one of {list}', '{k}: допустимі значення {list}', '{k} muss einer der Werte {list} sein', '{k} moet een van {list} zijn', '{k} doit valoir {list}', '{k} debe ser uno de {list}', '{k} musi mieć jedną z wartości {list}'),
  wavelength: L('wavelength 100..1 000 000 nm expected', 'очікується довжина хвилі 100..1 000 000 нм', 'Wellenlänge 100..1 000 000 nm erwartet', 'golflengte 100..1 000 000 nm verwacht', 'longueur d’onde de 100 à 1 000 000 nm attendue', 'se espera una longitud de onda de 100..1 000 000 nm', 'oczekiwano długości fali 100..1 000 000 nm'),
  positive: L('positive number expected', 'очікується додатне число', 'positive Zahl erwartet', 'positief getal verwacht', 'nombre positif attendu', 'se espera un número positivo', 'oczekiwano liczby dodatniej'),
  nonneg: L('non-negative number expected', 'очікується невід’ємне число', 'nichtnegative Zahl erwartet', 'niet-negatief getal verwacht', 'nombre positif ou nul attendu', 'se espera un número no negativo', 'oczekiwano liczby nieujemnej'),
  m2: L('M² must be ≥ 1', 'M² має бути ≥ 1', 'M² muss ≥ 1 sein', 'M² moet ≥ 1 zijn', 'M² doit être ≥ 1', 'M² debe ser ≥ 1', 'M² musi być ≥ 1'),
  element_id: L('element id: 1–40 characters A-Z a-z 0-9 _ . + -', 'id елемента: 1–40 символів A-Z a-z 0-9 _ . + -', 'Element-ID: 1–40 Zeichen A-Z a-z 0-9 _ . + -', 'element-id: 1–40 tekens A-Z a-z 0-9 _ . + -', 'identifiant d’élément : 1 à 40 caractères A-Z a-z 0-9 _ . + -', 'id del elemento: 1–40 caracteres A-Z a-z 0-9 _ . + -', 'id elementu: 1–40 znaków A-Z a-z 0-9 _ . + -'),
  duplicate_id: L('duplicate element id {id}', 'повторний id елемента {id}', 'doppelte Element-ID {id}', 'dubbele element-id {id}', 'identifiant d’élément en double {id}', 'id de elemento duplicado {id}', 'powtórzony id elementu {id}'),
  unknown_material: L('unknown material {m} (kept; the tools will ask for a replacement)', 'невідомий матеріал {m} (збережено; інструменти попросять замінити)', 'unbekanntes Material {m} (beibehalten; die Werkzeuge fragen nach Ersatz)', 'onbekend materiaal {m} (behouden; de tools vragen om vervanging)', 'matériau inconnu {m} (conservé ; les outils demanderont un remplacement)', 'material desconocido {m} (se conserva; las herramientas pedirán un sustituto)', 'nieznany materiał {m} (zachowany; narzędzia poproszą o zamiennik)'),
  modules: L('modules must be an object', 'modules має бути об’єктом', 'modules muss ein Objekt sein', 'modules moet een object zijn', 'modules doit être un objet', 'modules debe ser un objeto', 'modules musi być obiektem'),
  module_id: L('bad module id', 'неприпустимий id модуля', 'ungültige Modul-ID', 'ongeldige module-id', 'identifiant de module invalide', 'id de módulo no válido', 'nieprawidłowy id modułu'),
  module: L('module must be an object', 'модуль має бути об’єктом', 'Modul muss ein Objekt sein', 'module moet een object zijn', 'le module doit être un objet', 'el módulo debe ser un objeto', 'moduł musi być obiektem'),
  iso_date: L('ISO date string expected', 'очікується дата у форматі ISO', 'Datum im ISO-Format erwartet', 'datum in ISO-formaat verwacht', 'date au format ISO attendue', 'se espera una fecha en formato ISO', 'oczekiwano daty w formacie ISO'),
  unknown_module: L('module from another tool kept as is', 'модуль іншого інструмента збережено без змін', 'Modul eines anderen Werkzeugs unverändert übernommen', 'module van een ander hulpmiddel ongewijzigd behouden', 'module d’un autre outil conservé tel quel', 'módulo de otra herramienta conservado tal cual', 'moduł innego narzędzia zachowany bez zmian'),
  not_text: L('text expected', 'очікується текст', 'Text erwartet', 'tekst verwacht', 'texte attendu', 'se espera un texto', 'oczekiwano tekstu'),
  too_large: L('file larger than 2 MB', 'файл більший за 2 МБ', 'Datei größer als 2 MB', 'bestand groter dan 2 MB', 'fichier de plus de 2 Mo', 'archivo de más de 2 MB', 'plik większy niż 2 MB'),
  json: L('invalid JSON: {e}', 'некоректний JSON: {e}', 'ungültiges JSON: {e}', 'ongeldige JSON: {e}', 'JSON invalide : {e}', 'JSON no válido: {e}', 'nieprawidłowy JSON: {e}'),
  not_owner: L('tool {tool} may not write block {b}', 'інструмент {tool} не може записувати блок {b}', 'Werkzeug {tool} darf Block {b} nicht schreiben', 'tool {tool} mag blok {b} niet schrijven', 'l’outil {tool} ne peut pas écrire le bloc {b}', 'la herramienta {tool} no puede escribir el bloque {b}', 'narzędzie {tool} nie może zapisywać bloku {b}')
};
var msgLang = 'en';
/* setLang(lang|fn): language of validation messages (e.msg); projectBar sets it to its own language. e.msg_en always stays English. */
function setLang(l) { msgLang = l; }
function curMsgLang(o) { var l = o && o.lang != null ? o.lang : msgLang; if (typeof l === 'function') { try { l = l(); } catch (e) { l = 'en'; } } return LANGS.indexOf(l) >= 0 ? l : 'en'; }
function fillMsg(key, args, lang) {
  var tpl = MSG[key] ? t(MSG[key], lang) : key;
  return tpl.replace(/\{(\w+)\}/g, function (m, k) { return args && args[k] != null ? String(args[k]) : m; });
}
function mkErr(code, path, key, args, lang) {
  return { code: code, path: path, msg: fillMsg(key, args, lang), msg_en: fillMsg(key, args, 'en'), key: key, args: args || {} };
}
function errorText(e, lang) {
  if (!e) return '';
  var m = e.key ? fillMsg(e.key, e.args, LANGS.indexOf(lang) >= 0 ? lang : 'en') : (e.msg || String(e));
  return (e.path ? e.path + ' ' : '') + m;
}

/* structural walk: depth, node count, finite numbers, forbidden keys, plain JSON types only */
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

/* validate(doc) -> {ok, errors, warnings}. Unknown fields are allowed (they survive round trips). */
function validate(doc, vopts) {
  var errors = [], warnings = [], lang = curMsgLang(vopts);
  function E(code, path, key, args) { errors.push(mkErr(code, path, key, args, lang)); }
  function Wn(code, path, key, args) { warnings.push(mkErr(code, path, key, args, lang)); }
  function num(v, path, kind, lo, hi) {
    if (v == null) return;
    if (!isNum(v)) { E('type', path, 'number'); return; }
    if (kind === 'pos' && !(v > 0)) E('range', path, 'positive');
    else if (kind === 'nonneg' && !(v >= 0)) E('range', path, 'nonneg');
    else if (kind === 'range' && (v < lo || v > hi)) E('range', path, 'range', { lo: lo, hi: hi });
  }
  function str(v, path) { if (v != null && typeof v !== 'string') E('type', path, 'string'); }
  function obj(v, path) { if (v != null && !isObj(v)) { E('type', path, 'object'); return false; } return v != null; }
  function arr(v, path, max) { if (v == null) return false; if (!Array.isArray(v)) { E('type', path, 'array'); return false; } if (v.length > max) { E('too_many', path, 'too_many', { n: max }); return false; } return true; }
  function mat(v, path) { if (v == null || v === '') return; if (typeof v !== 'string') { E('type', path, 'string'); return; } if (!/^(air|vacuum)$/i.test(v) && !glass(v)) Wn('unknown_material', path, 'unknown_material', { m: v }); }
  if (!isObj(doc)) return { ok: false, errors: [mkErr('not_object', '$', 'not_object', null, lang)], warnings: warnings };
  walk(doc, errors, lang);
  if (errors.length) return { ok: false, errors: errors, warnings: warnings };
  if (doc.schema !== SCHEMA) E('schema', '$.schema', 'schema', { s: SCHEMA });
  if (doc.revision != null && !(isNum(doc.revision) && doc.revision >= 0 && Math.floor(doc.revision) === doc.revision)) E('revision', '$.revision', 'revision');
  str(doc.name, '$.name');
  if (doc.units != null && ENUMS.units.indexOf(doc.units) < 0) E('enum', '$.units', 'enum', { k: 'units', list: ENUMS.units.join('|') });
  if (arr(doc.lambda_nm, '$.lambda_nm', LIMITS.wavelengths)) doc.lambda_nm.forEach(function (l, i) { if (!isNum(l) || l < 100 || l > 1e6) E('range', '$.lambda_nm[' + i + ']', 'wavelength'); });
  var s = doc.source;
  if (obj(s, '$.source')) {
    if (s.kind != null && ENUMS.source_kind.indexOf(s.kind) < 0) E('enum', '$.source.kind', 'enum', { k: 'kind', list: ENUMS.source_kind.join('|') });
    num(s.power_W, '$.source.power_W', 'nonneg');
    num(s.w0_mm, '$.source.w0_mm', 'pos');
    if (s.M2 != null) { if (!isNum(s.M2)) E('type', '$.source.M2', 'number'); else if (s.M2 < 1) E('range', '$.source.M2', 'm2'); }
    num(s.divergence_mrad, '$.source.divergence_mrad', 'nonneg');
    if (obj(s.pulse, '$.source.pulse')) {
      var p = s.pulse;
      if (p.mode != null && ENUMS.pulse_mode.indexOf(p.mode) < 0) E('enum', '$.source.pulse.mode', 'enum', { k: 'mode', list: ENUMS.pulse_mode.join('|') });
      num(p.tau_s, '$.source.pulse.tau_s', 'pos'); num(p.prf_Hz, '$.source.pulse.prf_Hz', 'pos'); num(p.energy_J, '$.source.pulse.energy_J', 'nonneg');
    }
  }
  var b = doc.bench;
  if (obj(b, '$.bench')) {
    if (obj(b.table, '$.bench.table')) num(b.table.grid_mm, '$.bench.table.grid_mm', 'pos');
    if (arr(b.elements, '$.bench.elements', LIMITS.elements)) {
      var ids = {};
      b.elements.forEach(function (e, i) {
        var pth = '$.bench.elements[' + i + ']';
        if (!isObj(e)) { E('type', pth, 'object'); return; }
        if (typeof e.id !== 'string' || !/^[A-Za-z0-9_.+-]{1,40}$/.test(e.id)) E('element_id', pth + '.id', 'element_id');
        else if (ids[e.id]) E('duplicate_id', pth + '.id', 'duplicate_id', { id: e.id });
        else ids[e.id] = 1;
        str(e.kind, pth + '.kind'); str(e.stock, pth + '.stock');
        if (obj(e.pose, pth + '.pose')) ['x', 'y', 'z', 'rx', 'ry', 'rz'].forEach(function (k) { num(e.pose[k], pth + '.pose.' + k); });
        obj(e.params, pth + '.params');
      });
    }
  }
  var ln = doc.lens;
  if (obj(ln, '$.lens')) {
    if (arr(ln.surfaces, '$.lens.surfaces', LIMITS.surfaces)) ln.surfaces.forEach(function (x, i) {
      var pth = '$.lens.surfaces[' + i + ']';
      if (!isObj(x)) { E('type', pth, 'object'); return; }
      num(x.R, pth + '.R'); num(x.t, pth + '.t'); num(x.sd, pth + '.sd', 'nonneg'); num(x.k, pth + '.k'); mat(x.material, pth + '.material');
    });
    if (arr(ln.fields_deg, '$.lens.fields_deg', 64)) ln.fields_deg.forEach(function (v, i) { num(v, '$.lens.fields_deg[' + i + ']', 'range', -90, 90); });
    num(ln.fno, '$.lens.fno', 'pos');
  }
  var c = doc.coating;
  if (obj(c, '$.coating')) {
    if (arr(c.layers, '$.coating.layers', LIMITS.layers)) c.layers.forEach(function (x, i) {
      var pth = '$.coating.layers[' + i + ']';
      if (!isObj(x)) { E('type', pth, 'object'); return; }
      str(x.material, pth + '.material'); num(x.d_nm, pth + '.d_nm', 'nonneg');
    });
    mat(c.substrate, '$.coating.substrate'); mat(c.incident, '$.coating.incident');
  }
  var cam = doc.camera;
  if (obj(cam, '$.camera')) {
    str(cam.sensor, '$.camera.sensor'); num(cam.pixel_um, '$.camera.pixel_um', 'pos');
    if (cam.res != null) { if (!Array.isArray(cam.res) || cam.res.length !== 2) E('type', '$.camera.res', 'array'); else cam.res.forEach(function (v, i) { num(v, '$.camera.res[' + i + ']', 'pos'); }); }
  }
  if (doc.modules != null) {
    if (!isObj(doc.modules)) E('modules', '$.modules', 'modules');
    else Object.keys(doc.modules).forEach(function (k) {
      var pth = '$.modules.' + k, m = doc.modules[k];
      if (!/^[a-z][a-z0-9_-]{0,79}$/.test(k)) { E('module_id', pth, 'module_id'); return; }
      if (!isObj(m)) { E('module', pth, 'module'); return; }
      if (m.updatedAt != null && (typeof m.updatedAt !== 'string' || isNaN(Date.parse(m.updatedAt)))) E('iso_date', pth + '.updatedAt', 'iso_date');
      if (TOOL_IDS.indexOf(k) < 0) Wn('unknown_module', pth, 'unknown_module');
    });
  }
  return { ok: !errors.length, errors: errors, warnings: warnings };
}

/* normalize(doc): fills missing blocks with defaults (never removes unknown fields) */
function normalize(doc) {
  var d = clone(doc), e = emptyProject();
  Object.keys(e).forEach(function (k) { if (d[k] == null) d[k] = clone(e[k]); });
  ['source', 'bench', 'lens', 'coating', 'camera'].forEach(function (k) {
    if (isObj(d[k])) Object.keys(e[k]).forEach(function (kk) { if (d[k][kk] === undefined) d[k][kk] = clone(e[k][kk]); });
  });
  if (isObj(d.source) && isObj(d.source.pulse)) Object.keys(e.source.pulse).forEach(function (kk) { if (d.source.pulse[kk] === undefined) d.source.pulse[kk] = null; });
  if (!isObj(d.modules)) d.modules = {};
  return d;
}

function importJSON(text, iopts) {
  var lang = curMsgLang(iopts);
  if (typeof text !== 'string') return { ok: false, doc: null, errors: [mkErr('not_text', '$', 'not_text', null, lang)], warnings: [] };
  if (text.length > LIMITS.bytes) return { ok: false, doc: null, errors: [mkErr('too_large', '$', 'too_large', null, lang)], warnings: [] };
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
  if (!v.ok) throw new Error('OptCore.project.exportJSON: invalid document: ' + v.errors.map(function (e) { return e.path + ' ' + e.msg_en; }).join('; '));
  return JSON.stringify(doc, null, 2);
}
/* withModule(doc, toolId, {state, results, summary, blocks?:{bench|lens|coating|camera|source: value}}) -> new document.
   A tool writes only modules.<toolId> and the top-level blocks it owns (OWNERS); 'source' is shared and stamped with updatedBy/updatedAt. revision + 1. */
function withModule(doc, toolId, payload, opts) {
  if (typeof toolId !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(toolId)) throw new Error('OptCore.project.withModule: bad tool id');
  var next = clone(doc);
  payload = payload || {};
  var now = payload.updatedAt || (opts && opts.now) || new Date().toISOString();
  if (!isObj(next.modules)) next.modules = {};
  var prev = isObj(next.modules[toolId]) ? next.modules[toolId] : {};
  var mod = clone(prev);
  ['state', 'results', 'summary'].forEach(function (k) { mod[k] = payload[k] !== undefined ? clone(payload[k]) : (prev[k] !== undefined ? prev[k] : {}); });
  Object.keys(payload).forEach(function (k) { if (['state', 'results', 'summary', 'updatedAt', 'blocks'].indexOf(k) < 0 && !BAD_KEYS[k]) mod[k] = clone(payload[k]); });
  mod.updatedAt = now;
  next.modules[toolId] = mod;
  if (isObj(payload.blocks)) Object.keys(payload.blocks).forEach(function (bk) {
    var owner = OWNERS[bk];
    if (!owner || (owner !== '*' && owner !== toolId)) throw new Error('OptCore.project.withModule: ' + fillMsg('not_owner', { tool: toolId, b: bk }, 'en'));
    var val = clone(payload.blocks[bk]);
    if (bk === 'source' && isObj(val)) { val.updatedBy = toolId; val.updatedAt = now; }
    next[bk] = val;
  });
  next.revision = (isNum(next.revision) ? next.revision : 0) + 1;
  var v = validate(next);
  if (!v.ok) throw new Error('OptCore.project.withModule: result invalid: ' + v.errors[0].path + ' ' + v.errors[0].msg_en);
  return next;
}
function storage() {
  try { return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null; } catch (e) { return null; }
}
function load() {
  var ls = storage(); if (!ls) return null;
  var raw; try { raw = ls.getItem(STORAGE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  var r = importJSON(raw);
  return r.ok ? r.doc : null;
}
/* save(doc) -> {ok} ; never throws (storage may be blocked or full) */
function save(doc) {
  var ls = storage(); if (!ls) return { ok: false, error: 'storage_unavailable' };
  var text;
  try { text = exportJSON(doc); } catch (e) { return { ok: false, error: 'invalid', detail: e.message }; }
  try { ls.setItem(STORAGE_KEY, text); return { ok: true }; } catch (e) { return { ok: false, error: 'storage_blocked', detail: String(e && e.message || e) }; }
}
function fileName(name, ext) {
  var b = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
  if (b.length > 60) b = b.slice(0, 60).replace(/[_.]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(b)) b = '_' + b;
  return (b || 'optics-project') + (ext || '');
}

/* CSV (RFC 4180, CRLF), formula-injection guard: string cells starting with = + - @ TAB CR get a leading '.
   cols: ['key', ...] or [{key, label}]; rows: objects or arrays. Numbers are written raw (dot decimal). */
function csvCell(v) {
  if (v == null) return '';
  var s;
  if (typeof v === 'number') s = isFinite(v) ? String(v) : '';
  else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = '\'' + s;
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csv(rows, cols, opts) {
  opts = opts || {};
  rows = rows || [];
  if (!cols) cols = rows.length && !Array.isArray(rows[0]) ? Object.keys(rows[0]) : [];
  var defs = cols.map(function (c, i) { return typeof c === 'string' ? { key: c, label: c, i: i } : { key: c.key, label: c.label != null ? c.label : c.key, i: i }; });
  var lines = [];
  if (opts.header !== false && defs.length) lines.push(defs.map(function (d) { return csvCell(d.label); }).join(','));
  rows.forEach(function (r) { lines.push(defs.map(function (d) { return csvCell(Array.isArray(r) ? r[d.i] : (r ? r[d.key] : null)); }).join(',')); });
  return lines.join('\r\n') + (lines.length ? '\r\n' : '');
}

/* =====================================================================================
   9. UI strings + projectBar widget (DOM only when called)
   ===================================================================================== */
var UI = {
  project: L('Project', 'Проєкт', 'Projekt', 'Project', 'Projet', 'Proyecto', 'Projekt'),
  unnamed: L('(unnamed)', '(без назви)', '(ohne Namen)', '(naamloos)', '(sans nom)', '(sin nombre)', '(bez nazwy)'),
  wavelengths: L('wavelengths', 'довжини хвиль', 'Wellenlängen', 'golflengten', 'longueurs d’onde', 'longitudes de onda', 'długości fali'),
  elements: L('bench elements', 'елементів на столі', 'Elemente auf der Bank', 'elementen op de bank', 'éléments sur le banc', 'elementos en el banco', 'elementów na ławie'),
  surfaces: L('lens surfaces', 'поверхонь лінз', 'Linsenflächen', 'lensvlakken', 'surfaces de lentille', 'superficies de lente', 'powierzchni soczewek'),
  layers: L('coating layers', 'шарів покриття', 'Schichten', 'coatinglagen', 'couches de revêtement', 'capas de recubrimiento', 'warstw powłoki'),
  importJson: L('Import JSON', 'Імпорт JSON', 'JSON importieren', 'JSON importeren', 'Importer JSON', 'Importar JSON', 'Importuj JSON'),
  exportJson: L('Export JSON', 'Експорт JSON', 'JSON exportieren', 'JSON exporteren', 'Exporter JSON', 'Exportar JSON', 'Eksportuj JSON'),
  newProject: L('New', 'Новий', 'Neu', 'Nieuw', 'Nouveau', 'Nuevo', 'Nowy'),
  rename: L('Rename', 'Перейменувати', 'Umbenennen', 'Hernoemen', 'Renommer', 'Renombrar', 'Zmień nazwę'),
  renamePrompt: L('Project name', 'Назва проєкту', 'Projektname', 'Projectnaam', 'Nom du projet', 'Nombre del proyecto', 'Nazwa projektu'),
  use: L('Use', 'Використати', 'Verwenden', 'Gebruiken', 'Utiliser', 'Usar', 'Użyj'),
  hasData: L('Project has data from', 'Проєкт містить дані з', 'Das Projekt enthält Daten aus', 'Het project bevat gegevens uit', 'Le projet contient des données de', 'El proyecto tiene datos de', 'Projekt zawiera dane z'),
  otherModule: L('Data of another tool (kept, not used here):', 'Дані іншого інструмента (збережено, тут не використовуються):', 'Daten eines anderen Werkzeugs (erhalten, hier nicht genutzt):', 'Gegevens van een ander hulpmiddel (bewaard, hier niet gebruikt):', 'Données d’un autre outil (conservées, non utilisées ici) :', 'Datos de otra herramienta (conservados, no se usan aquí):', 'Dane innego narzędzia (zachowane, tu nieużywane):'),
  noModules: L('No data from the other optics tools yet', 'Даних з інших оптичних інструментів ще немає', 'Noch keine Daten aus den anderen Optik-Werkzeugen', 'Nog geen gegevens uit de andere optica-tools', 'Pas encore de données des autres outils d’optique', 'Aún no hay datos de las otras herramientas de óptica', 'Brak jeszcze danych z innych narzędzi optycznych'),
  sourceBy: L('Light source last set by', 'Джерело світла востаннє задав', 'Lichtquelle zuletzt gesetzt von', 'Lichtbron het laatst ingesteld door', 'Source lumineuse définie en dernier par', 'Fuente de luz definida por última vez en', 'Źródło światła ostatnio ustawione w'),
  invalid: L('File rejected', 'Файл відхилено', 'Datei abgelehnt', 'Bestand geweigerd', 'Fichier refusé', 'Archivo rechazado', 'Plik odrzucony'),
  imported: L('Project imported', 'Проєкт імпортовано', 'Projekt importiert', 'Project geïmporteerd', 'Projet importé', 'Proyecto importado', 'Zaimportowano projekt'),
  storageOff: L('Browser storage unavailable — keep the exported file', 'Сховище браузера недоступне — збережіть експортований файл', 'Browserspeicher nicht verfügbar — Exportdatei aufbewahren', 'Browseropslag niet beschikbaar — bewaar het exportbestand', 'Stockage du navigateur indisponible — conservez le fichier exporté', 'Almacenamiento no disponible: conserve el archivo exportado', 'Pamięć przeglądarki niedostępna — zachowaj wyeksportowany plik'),
  confirmNew: L('Start a new project? The project stored in this browser will be replaced.', 'Почати новий проєкт? Проєкт, збережений у цьому браузері, буде замінено.', 'Neues Projekt beginnen? Das in diesem Browser gespeicherte Projekt wird ersetzt.', 'Nieuw project beginnen? Het in deze browser opgeslagen project wordt vervangen.', 'Commencer un nouveau projet ? Le projet enregistré dans ce navigateur sera remplacé.', '¿Empezar un proyecto nuevo? Se reemplazará el proyecto guardado en este navegador.', 'Rozpocząć nowy projekt? Projekt zapisany w tej przeglądarce zostanie zastąpiony.'),
  soon: L('soon', 'незабаром', 'bald', 'binnenkort', 'bientôt', 'próximamente', 'wkrótce'),
  siblings: L('Optics tools', 'Оптичні інструменти', 'Optik-Werkzeuge', 'Optica-tools', 'Outils d’optique', 'Herramientas de óptica', 'Narzędzia optyczne'),
  privacy: L('Everything is computed in your browser; the project never leaves this device unless you export it.', 'Усе обчислюється у вашому браузері; проєкт не залишає цей пристрій, доки ви його не експортуєте.', 'Alles wird in Ihrem Browser berechnet; das Projekt verlässt dieses Gerät nur, wenn Sie es exportieren.', 'Alles wordt in uw browser berekend; het project verlaat dit apparaat alleen als u het exporteert.', 'Tout est calculé dans votre navigateur ; le projet ne quitte cet appareil que si vous l’exportez.', 'Todo se calcula en su navegador; el proyecto solo sale de este dispositivo si usted lo exporta.', 'Wszystko jest liczone w przeglądarce; projekt opuszcza to urządzenie tylko wtedy, gdy go wyeksportujesz.'),
  learningAssumption: L('learning assumption — replace with project or catalogue data', 'навчальне припущення — замініть даними проєкту або каталогу', 'Lernannahme — durch Projekt- oder Katalogdaten ersetzen', 'leeraanname — vervang door project- of catalogusgegevens', 'hypothèse pédagogique — à remplacer par les données du projet ou du catalogue', 'supuesto didáctico: sustitúyalo por datos del proyecto o del catálogo', 'założenie szkoleniowe — zastąp danymi projektu lub katalogu'),
  outOfRange: L('outside the validity range of the dispersion formula', 'поза межами чинності формули дисперсії', 'außerhalb des Gültigkeitsbereichs der Dispersionsformel', 'buiten het geldigheidsbereik van de dispersieformule', 'hors du domaine de validité de la formule de dispersion', 'fuera del rango de validez de la fórmula de dispersión', 'poza zakresem ważności wzoru dyspersyjnego'),
  disclaimer: L('Learning and pre-design aid. Verify final designs with a qualified optical engineer / laser safety officer and the manufacturer’s data.',
    'Навчальний інструмент і засіб попереднього проєктування. Остаточні рішення перевіряйте з кваліфікованим інженером-оптиком / відповідальним за лазерну безпеку та за даними виробника.',
    'Lern- und Vorentwurfshilfe. Endgültige Auslegungen mit einer qualifizierten Optikingenieurin bzw. einem Optikingenieur / Laserschutzbeauftragten und den Herstellerdaten prüfen.',
    'Leer- en voorontwerphulpmiddel. Controleer definitieve ontwerpen met een gekwalificeerde optisch ingenieur / laserveiligheidsfunctionaris en de gegevens van de fabrikant.',
    'Aide à l’apprentissage et à l’avant-projet. Faites vérifier les conceptions définitives par un ingénieur opticien qualifié / un responsable de la sécurité laser et d’après les données du fabricant.',
    'Ayuda didáctica y de anteproyecto. Verifique los diseños definitivos con un ingeniero óptico cualificado / un responsable de seguridad láser y con los datos del fabricante.',
    'Narzędzie do nauki i projektowania wstępnego. Ostateczne rozwiązania sprawdź z wykwalifikowanym inżynierem optykiem / inspektorem bezpieczeństwa laserowego i z danymi producenta.')
};
function toolName(id, lang) { var x = TOOLS.filter(function (q) { return q.id === id; })[0]; return x ? t(x.name, lang) : id; }

/* projectBar({mount, toolId, lang (string|fn), doc?, getDoc?, onChange(doc), onUse(moduleId, module, doc), syncTabs?})
   Shows project name, counts, Import/Export JSON, New, Rename, data of other tools with an explicit "Use" button, links to the sibling tools. */
function projectBar(opts) {
  opts = opts || {};
  if (typeof document === 'undefined') return null;
  var host = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!host) return null;
  var lang = function () { var v = typeof opts.lang === 'function' ? opts.lang() : opts.lang; return LANGS.indexOf(v) >= 0 ? v : 'en'; };
  var tx = function (k) { return t(UI[k], lang()); };
  setLang(lang);
  var doc = opts.doc ? clone(opts.doc) : (load() || emptyProject());
  var storageOk = !!storage();
  function el(tag, attrs, text) {
    var x = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'style') x.style.cssText = attrs[k]; else x.setAttribute(k, attrs[k]); });
    if (text != null) x.textContent = text;
    return x;
  }
  var box = el('section', { 'class': 'opt-project-bar', 'aria-label': 'project', style: 'border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel,#fff);padding:var(--sp-3,12px);margin:var(--sp-3,12px) 0;font-size:var(--fs-small,13px);display:flex;flex-direction:column;gap:var(--sp-2,8px)' });
  var head = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' });
  var title = el('strong'), count = el('span', { style: 'color:var(--muted,#5b6675)' });
  var btnStyle = 'min-height:var(--ctl-h,32px);padding:0 10px;border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel-2,#f9fafc);color:var(--ink,#12161d);cursor:pointer;font:inherit';
  var bImport = el('button', { type: 'button', style: btnStyle, 'data-opt': 'import' }), bExport = el('button', { type: 'button', style: btnStyle, 'data-opt': 'export' });
  var bNew = el('button', { type: 'button', style: btnStyle, 'data-opt': 'new' }), bRename = el('button', { type: 'button', style: btnStyle, 'data-opt': 'rename' });
  var file = el('input', { type: 'file', accept: '.json,application/json', hidden: 'hidden', tabindex: '-1' });
  var modules = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  var nav = el('nav', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
  var status = el('div', { role: 'status', 'aria-live': 'polite', style: 'color:var(--muted,#5b6675);min-height:1em' });
  [title, count, bRename, bImport, bExport, bNew, file].forEach(function (x) { head.appendChild(x); });
  box.appendChild(head); box.appendChild(modules); box.appendChild(nav); box.appendChild(status);
  host.appendChild(box);

  function setDoc(next, silent, noSave) {
    doc = next;
    if (!noSave) { var r = save(doc); storageOk = r.ok; if (!r.ok) status.textContent = tx('storageOff'); }
    render();
    if (!silent && typeof opts.onChange === 'function') opts.onChange(clone(doc));
  }
  function stamp(d) {
    var m = d && d.modules || {}, best = '';
    Object.keys(m).forEach(function (k) { var u = m[k] && m[k].updatedAt; if (typeof u === 'string' && u > best) best = u; });
    return best;
  }
  function newerStored(cur) {
    var st = load(); if (!st) return cur;
    var a = stamp(st), b = stamp(cur);
    if (!(a > b || (a === b && (st.revision || 0) > (cur.revision || 0)))) return cur;
    doc = st; render();
    return st;
  }
  function render() {
    var L_ = lang();
    box.setAttribute('aria-label', tx('project'));
    title.textContent = tx('project') + ': ' + (doc.name || tx('unnamed'));
    var parts = [];
    var lam = Array.isArray(doc.lambda_nm) ? doc.lambda_nm : [];
    if (lam.length) parts.push(lam.slice(0, 4).map(function (x) { return fmt(x, L_, x % 1 ? 1 : 0); }).join(', ') + (lam.length > 4 ? '…' : '') + ' nm');
    var ne_ = doc.bench && doc.bench.elements ? doc.bench.elements.length : 0, ns = doc.lens && doc.lens.surfaces ? doc.lens.surfaces.length : 0, nl = doc.coating && doc.coating.layers ? doc.coating.layers.length : 0;
    if (ne_) parts.push(ne_ + ' ' + tx('elements'));
    if (ns) parts.push(ns + ' ' + tx('surfaces'));
    if (nl) parts.push(nl + ' ' + tx('layers'));
    count.textContent = parts.join(' · ');
    file.setAttribute('aria-label', tx('importJson'));
    bImport.textContent = tx('importJson'); bExport.textContent = tx('exportJson'); bNew.textContent = tx('newProject'); bRename.textContent = tx('rename');
    modules.textContent = '';
    var mids = Object.keys(doc.modules || {}).filter(function (k) { return k !== opts.toolId; });
    if (!mids.length) modules.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('noModules')));
    mids.forEach(function (k) {
      var m = doc.modules[k], known = TOOL_IDS.indexOf(k) >= 0;
      var date = m && m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
      var chip = el('span', { style: 'display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:var(--radius-pill,999px);background:var(--weak,rgba(55,99,230,.1))' });
      chip.appendChild(el('span', known ? null : { 'data-foreign': k }, (known ? tx('hasData') + ' ' + toolName(k, L_) : tx('otherModule') + ' ' + k) + (date ? ' (' + date + ')' : '')));
      if (typeof opts.onUse === 'function' && known) {
        var bu = el('button', { type: 'button', style: btnStyle, 'data-module': k }, tx('use'));
        bu.addEventListener('click', function () { opts.onUse(k, clone(doc.modules[k]), clone(doc)); });
        chip.appendChild(bu);
      }
      modules.appendChild(chip);
    });
    var src = doc.source;
    if (isObj(src) && src.updatedBy && src.updatedBy !== opts.toolId) {
      modules.appendChild(el('span', { style: 'color:var(--muted,#5b6675)', 'data-opt': 'source-by' }, tx('sourceBy') + ' ' + toolName(src.updatedBy, L_) + (src.updatedAt ? ' (' + String(src.updatedAt).slice(0, 10) + ')' : '')));
    }
    nav.textContent = '';
    nav.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('siblings') + ':'));
    TOOLS.forEach(function (tool) {
      if (tool.id === opts.toolId) { nav.appendChild(el('strong', { 'aria-current': 'page' }, t(tool.name, L_))); return; }
      if (!tool.live) { nav.appendChild(el('span', { style: 'color:var(--muted,#5b6675)', 'data-opt': 'soon' }, t(tool.name, L_) + ' (' + tx('soon') + ')')); return; }
      nav.appendChild(el('a', { href: tool.id + '.html' + (L_ !== 'en' ? '?lang=' + L_ : '') }, t(tool.name, L_)));
    });
  }
  bImport.addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () {
    var f = file.files && file.files[0]; if (!f) return;
    if (f.size > LIMITS.bytes) { status.textContent = tx('invalid') + ': > 2 MB'; file.value = ''; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var r = importJSON(String(rd.result), { lang: lang() });
      if (!r.ok) status.textContent = tx('invalid') + ': ' + r.errors.slice(0, 3).map(function (e) { return e.path + ' ' + e.msg; }).join('; ');
      else { setDoc(r.doc); status.textContent = tx('imported') + (r.warnings.length ? ' — ' + r.warnings.slice(0, 2).map(function (e) { return e.path + ' ' + e.msg; }).join('; ') : ''); }
      file.value = '';
    };
    rd.readAsText(f);
  });
  bExport.addEventListener('click', function () {
    var cur = typeof opts.getDoc === 'function' ? opts.getDoc() : newerStored(doc);
    var text = exportJSON(cur);
    var a = el('a'); var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = url; a.download = fileName(cur.name || 'optics-project', '.opt.json');
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  bNew.addEventListener('click', function () {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(tx('confirmNew'))) return;
    setDoc(emptyProject());
  });
  bRename.addEventListener('click', function () {
    if (typeof window === 'undefined' || !window.prompt) return;
    var v = window.prompt(tx('renamePrompt'), doc.name || '');
    if (v == null) return;
    var next = clone(doc); next.name = String(v).slice(0, 120); next.revision = (next.revision || 0) + 1;
    setDoc(next);
  });
  function onStorage(e) {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    var r = importJSON(e.newValue);
    if (r.ok) { doc = r.doc; render(); if (typeof opts.onChange === 'function') opts.onChange(clone(doc)); }
  }
  if (typeof window !== 'undefined' && opts.syncTabs !== false) window.addEventListener('storage', onStorage);
  render();
  if (!storageOk) status.textContent = tx('storageOff');
  return {
    element: box,
    /* refresh() re-renders (e.g. after a language change); refresh(doc) also shows doc without saving it */
    refresh: function (next) { if (next && typeof next === 'object') { if (!validate(next).ok) throw new Error('invalid project'); doc = clone(next); } status.textContent = ''; render(); },
    getDoc: function () { return clone(doc); },
    /* setDoc(doc) saves to localStorage; setDoc(doc, {save:false}) only displays (e.g. a preset) */
    setDoc: function (next, o) { var v = validate(next); if (!v.ok) throw new Error('invalid project'); setDoc(clone(next), true, !!(o && o.save === false)); },
    /* commit(toolId payload) = withModule + save + render (no onChange callback) */
    commit: function (payload) { var next = withModule(doc, opts.toolId, payload); setDoc(next, true); return clone(next); },
    status: function (text) { status.textContent = text || ''; },
    destroy: function () { if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); box.remove(); }
  };
}

return {
  version: VERSION, SCHEMA: SCHEMA, STORAGE_KEY: STORAGE_KEY, LANGS: LANGS.slice(), LIMITS: LIMITS, ENUMS: ENUMS,
  L: L, t: t, fmt: fmt, fmtSig: fmtSig, fmtLen: fmtLen, lenUnit: lenUnit,
  SOURCES: SOURCES,
  GLASS: GLASS, GLASS_ALIASES: GLASS_ALIASES, glass: glass, glassKey: glassKey, n: n, nd: nd, ne: ne, abbe: abbe, partialDispersion: partialDispersion,
  nAtLine: nAtLine, inRange: inRange, dndl: dndl, ng: ng, materials: materials, evalFormula: evalFormula,
  LINES: LINES, LASER_LINES: LASER_LINES, rgb: rgb, cieXYZ: cieXYZ, spectrumColour: spectrumColour,
  abcd: abcd, mul: mul, system: system, cardinal: cardinal, image: image, lensmaker: lensmaker, paraxialTrace: paraxialTrace,
  gauss: gauss,
  STOCK: STOCK, STOCK_TYPES: STOCK_TYPES, stock: stock,
  TOOLS: TOOLS, TOOL_IDS: TOOL_IDS, OWNERS: OWNERS, toolName: toolName, UI: UI, MSG: MSG, setLang: setLang, errorText: errorText, fileName: fileName,
  project: { empty: emptyProject, validate: validate, normalize: normalize, load: load, save: save, exportJSON: exportJSON, importJSON: importJSON, withModule: withModule },
  csv: csv,
  ui: { projectBar: projectBar }
};
});
