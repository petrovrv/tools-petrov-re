/* vt-core.js — global VTCore: shared core of the tools.petrov.re Vertical Transport package
   (liftwait, lifttraffic, liftenergy).
   Sections: 1 language helpers (L, t, fmt), 2 seeded RNG, 3 kinematics (jerk-limited S-curve flight time, motion profile,
   stopping distance), 4 car capacity (EN 81-20), 5 SOURCES + design criteria, 6 names of roles/uses/templates/control,
   7 up-peak round-trip-time formulas, 8 scenario document (validate / normalize / import / export / storage / CSV),
   9 traffic templates + passenger generator, 10 preset buildings, 11 ui.scenarioBar widget.
   Pure data + functions, no dependencies, UMD (browser global VTCore, node module.exports).
   Every number carries provenance through `source` ids (VTCore.SOURCES); values without a public source are tagged
   kind `learning_assumption`. Planning aid only — final lift design per EN 81-20 / ISO 8100-32 by a qualified lift consultant. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VTCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
'use strict';

var VERSION = '0.2.0';
var SCHEMA = 'tools.petrov.re/vertical-transport/v1';
var STORAGE_KEY = 'vt.scenario.v1';
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
   Same behaviour as MEPCore.fmt / DiagramUI.num: en 1,402.5; de/nl 1.402,5; uk/fr/pl space groups + decimal comma; es/pl group from 5 digits.
   Without Intl locale data: literal fallback with the same separators. */
var FMT_FALLBACK = { en: [',', '.', 4], uk: [' ', ',', 4], de: ['.', ',', 4], nl: ['.', ',', 4], fr: [' ', ',', 4], es: ['.', ',', 5], pl: [' ', ',', 5] };
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

/* clock('08:00', 125) -> '08:02' ; seconds since the start of the run; wraps at 24 h */
function clock(start, tSec, withSeconds) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(start || '00:00')) || [0, 0, 0];
  var s = Math.floor((+m[1] * 3600 + +m[2] * 60 + Math.max(0, tSec || 0)) % 86400);
  var hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
  function p(x) { return (x < 10 ? '0' : '') + x; }
  return p(hh) + ':' + p(mm) + (withSeconds ? ':' + p(ss) : '');
}

/* =====================================================================================
   2. Seeded RNG — mulberry32 (public domain, Tommy Ettinger). Everything stochastic in the package uses it.
   ===================================================================================== */
function rng(seed) {
  var s = (seed >>> 0) || 0x6d2b79f5;
  function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    var r = s;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next: next,
    /* exponential variate with the given rate (mean 1/rate) */
    exp: function (rate) { return -Math.log(1 - next()) / rate; },
    /* integer 0..n-1 */
    int: function (n) { return Math.floor(next() * n); },
    /* Poisson variate (Knuth; fine for the small per-second means used here, split for large means) */
    poisson: function (mean) {
      var tot = 0;
      while (mean > 30) { tot += knuth(30); mean -= 30; } /* large means: sum of Poisson(30) draws */
      return tot + knuth(mean);
      function knuth(m) { if (m <= 0) return 0; var Lm = Math.exp(-m), p = 1, c = 0; do { c++; p *= next(); } while (p > Lm); return c - 1; }
    },
    /* pick one element; weights optional (non-negative); returns undefined for an empty array or zero total weight */
    pick: function (arr, weights) {
      if (!arr || !arr.length) return undefined;
      if (!weights) return arr[Math.floor(next() * arr.length)];
      var tot = 0, i;
      for (i = 0; i < arr.length; i++) tot += Math.max(0, weights[i] || 0);
      if (!(tot > 0)) return undefined;
      var r = next() * tot;
      for (i = 0; i < arr.length; i++) { r -= Math.max(0, weights[i] || 0); if (r < 0) return arr[i]; }
      for (i = arr.length - 1; i >= 0; i--) if ((weights[i] || 0) > 0) return arr[i];
      return undefined;
    }
  };
}

/* =====================================================================================
   3. Kinematics — jerk-limited (S-curve) motion from rest to rest over distance d.
   v rated speed (m/s), a acceleration (m/s²), j jerk (m/s³). Peters (1996) "Ideal lift kinematics";
   the same cases in CIBSE Guide D ch. 4 and ISO 8100-32. Cases:
   A) rated speed reached (d ≥ v²/a' + v·a'/j, a' = min(a, √(v·j))): T = d/v + v/a' + a'/j
   B) rated speed not reached, full acceleration reached (d ≥ 2a³/j²): peak speed from v_p² + v_p·a²/j − a·d = 0,
      T = 2(v_p/a + a/j)
   C) neither reached: T = (32·d/j)^(1/3)
   ===================================================================================== */
function motion(d, v, a, j) {
  d = +d; v = +v; a = +a; j = +j;
  if (!(d > 0) || !(v > 0) || !(a > 0) || !(j > 0)) {
    return { d: Math.max(0, d || 0), T: 0, vp: 0, ap: 0, cruise: 0, reached: { speed: false, accel: false }, segs: [],
      x: function () { return 0; }, v: function () { return 0; }, a: function () { return 0; }, tAt: function () { return 0; } };
  }
  var aEff = Math.min(a, Math.sqrt(v * j));
  var dTh = v * v / aEff + v * aEff / j;
  var vp, ap, cruise = 0;
  if (d >= dTh) { vp = v; ap = aEff; cruise = (d - dTh) / v; }
  else if (d >= 2 * a * a * a / (j * j)) { ap = a; vp = (-a * a / j + Math.sqrt(a * a * a * a / (j * j) + 4 * a * d)) / 2; }
  else { vp = Math.pow(d * Math.sqrt(j) / 2, 2 / 3); ap = Math.sqrt(vp * j); }
  var t1 = ap / j, t2 = Math.max(0, vp / ap - ap / j);
  /* segments: [duration, jerk] */
  var spec = [[t1, j], [t2, 0], [t1, -j], [cruise, 0], [t1, -j], [t2, 0], [t1, j]];
  var segs = [], x0 = 0, v0 = 0, a0 = 0, t0 = 0;
  spec.forEach(function (sp) {
    var dt = sp[0], jj = sp[1];
    segs.push({ t0: t0, dt: dt, x0: x0, v0: v0, a0: a0, j: jj });
    x0 = x0 + v0 * dt + a0 * dt * dt / 2 + jj * dt * dt * dt / 6;
    v0 = v0 + a0 * dt + jj * dt * dt / 2;
    a0 = a0 + jj * dt;
    t0 += dt;
  });
  var T = t0;
  function seg(tt) {
    for (var i = segs.length - 1; i >= 0; i--) if (tt >= segs[i].t0) return segs[i];
    return segs[0];
  }
  function xAt(tt) {
    if (tt <= 0) return 0; if (tt >= T) return d;
    var s = seg(tt), u = tt - s.t0;
    return Math.min(d, Math.max(0, s.x0 + s.v0 * u + s.a0 * u * u / 2 + s.j * u * u * u / 6));
  }
  function vAt(tt) {
    if (tt <= 0 || tt >= T) return 0;
    var s = seg(tt), u = tt - s.t0;
    return Math.max(0, s.v0 + s.a0 * u + s.j * u * u / 2);
  }
  function aAt(tt) {
    if (tt <= 0 || tt >= T) return 0;
    var s = seg(tt), u = tt - s.t0;
    return s.a0 + s.j * u;
  }
  /* time at which the car passes position x (0..d) — bisection on the monotonic x(t) */
  function tAt(x) {
    if (x <= 0) return 0; if (x >= d) return T;
    var lo = 0, hi = T;
    for (var k = 0; k < 60; k++) { var mid = (lo + hi) / 2; if (xAt(mid) < x) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  return { d: d, T: T, vp: vp, ap: ap, cruise: cruise, reached: { speed: vp >= v - 1e-9, accel: ap >= a - 1e-9 }, segs: segs, x: xAt, v: vAt, a: aAt, tAt: tAt };
}

/* flight time (s) door-closed to door-open-start, without start delay */
function flightTime(d, v, a, j) { return motion(d, v, a, j).T; }

/* sampled profile for animation and the "why short trips are slow" chart: n+1 points */
function profile(d, v, a, j, n) {
  var m = motion(d, v, a, j); n = Math.max(2, Math.min(5000, n | 0 || 200));
  var out = { T: m.T, vp: m.vp, ap: m.ap, reached: m.reached, t: [], x: [], v: [], a: [] };
  for (var i = 0; i <= n; i++) { var tt = m.T * i / n; out.t.push(tt); out.x.push(m.x(tt)); out.v.push(m.v(tt)); out.a.push(m.a(tt)); }
  return out;
}

/* time to pass point x of a rest-to-rest run over d */
function ttop(d, v, a, j, x) { return motion(d, v, a, j).tAt(x); }

/* jerk-limited stopping distance from speed v0 at zero acceleration (cruise) to rest:
   v0 ≥ a²/j: v0²/(2a) + v0·a/(2j);  else v0·√(v0/j) */
function stopDistance(v0, a, j) {
  if (!(v0 > 0)) return 0;
  if (v0 >= a * a / j) return v0 * v0 / (2 * a) + v0 * a / (2 * j);
  return v0 * Math.sqrt(v0 / j);
}

/* =====================================================================================
   4. Car capacity — EN 81-20:2020 5.4.2: number of passengers = rated load / 75 kg, rounded down to the whole number
   (and not more than the car area allows, Table 8). MAX_CAR_AREA = Table 6 maximum available car area vs rated load
   (identical to EN 81-1:1998 Table 1.1), linear interpolation between rows as the standard allows.
   ===================================================================================== */
var MAX_CAR_AREA = [[100, 0.37], [180, 0.58], [225, 0.70], [300, 0.90], [375, 1.10], [400, 1.17], [450, 1.30], [525, 1.45], [600, 1.60], [630, 1.66],
  [675, 1.75], [750, 1.90], [800, 2.00], [825, 2.05], [900, 2.20], [975, 2.35], [1000, 2.40], [1050, 2.50], [1125, 2.65], [1200, 2.80], [1250, 2.90],
  [1275, 2.95], [1350, 3.10], [1425, 3.25], [1500, 3.40], [1600, 3.56], [2000, 4.20], [2500, 5.00]];
function maxCarArea(q) {
  if (!(q > 0)) return null;
  var T = MAX_CAR_AREA;
  if (q <= T[0][0]) return T[0][1] * q / T[0][0];
  for (var i = 1; i < T.length; i++) if (q <= T[i][0]) return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * (q - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
  return 5.0 + (q - 2500) / 100 * 0.16; /* EN 81-20 Table 6 note: above 2500 kg add 0.16 m² per 100 kg */
}
function carCapacity(ratedLoadKg) {
  var q = +ratedLoadKg;
  if (!(q > 0)) return 0;
  return Math.floor(q / 75 + 1e-9);
}
/* CIBSE Guide D / Barney: the average up-peak car load used for design is 80 % of the rated capacity */
var ACTUAL_LOAD_FACTOR = 0.8;

/* =====================================================================================
   5. SOURCES + design criteria
   ===================================================================================== */
var SOURCES = {
  cibse_d: { title: 'CIBSE Guide D: Transportation systems in buildings', edition: '2020 (6th edition)', url: 'https://www.cibse.org/knowledge-research/knowledge-portal/guide-d-transportation-systems-in-buildings-2020', kind: 'guide' },
  iso8100_32: { title: 'ISO 8100-32 Lifts for the transportation of persons and goods — Part 32: Planning and selection of passenger lifts to be installed in office, hotel and residential buildings', edition: '2020 (formerly ISO 4190-6)', url: 'https://www.iso.org/standard/72722.html', kind: 'standard' },
  en81_20: { title: 'EN 81-20 Safety rules for the construction and installation of lifts — Part 20: Passenger and goods passenger lifts (5.4.2 rated load, number of passengers, car area)', edition: '2020', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
  iso25745_1: { title: 'ISO 25745-1 Energy performance of lifts, escalators and moving walks — Part 1: Energy measurement and verification', edition: '2012', url: 'https://www.iso.org/standard/53337.html', kind: 'standard' },
  iso25745_2: { title: 'ISO 25745-2 Energy performance of lifts, escalators and moving walks — Part 2: Energy calculation and classification for lifts (elevators)', edition: '2015', url: 'https://www.iso.org/standard/53338.html', kind: 'standard' },
  vdi4707_1: { title: 'VDI 4707 Blatt 1 Aufzüge — Energieeffizienz', edition: '2009-03', url: 'https://www.vdi.de/richtlinien/details/vdi-4707-blatt-1-aufzuege-energieeffizienz', kind: 'standard' },
  barney: { title: 'G. Barney, L. Al-Sharif: Elevator Traffic Handbook — Theory and Practice', edition: '2nd ed., Routledge 2016', url: 'https://www.routledge.com/Elevator-Traffic-Handbook-Theory-and-Practice/Barney-Al-Sharif/p/book/9781138852327', kind: 'guide' },
  peters_kin: { title: 'R. D. Peters: Ideal lift kinematics — derivation of formulae for the equations of motion of a lift', edition: 'Elevator Technology 6, IAEE 1996', url: 'https://www.peters-research.com/index.php/papers', kind: 'paper' },
  alsharif_h: { title: 'L. Al-Sharif et al.: derivation of the highest reversal floor H and probable stops S for unequal floor populations (Barney/Al-Sharif general formulae)', edition: 'Elevator Technology / Building Services Engineering Research & Technology, 1990s–2010s', url: 'https://www.peters-research.com/index.php/papers', kind: 'paper' },
  siikonen: { title: 'M.-L. Siikonen: On traffic planning methodology (modern office traffic: incoming / outgoing / inter-floor shares over the day)', edition: 'Elevator Technology 10, IAEE 2000', url: 'https://www.kone.com/', kind: 'paper' },
  strakosch: { title: 'G. R. Strakosch, R. S. Caporale: The Vertical Transportation Handbook', edition: '4th ed., Wiley 2010', url: 'https://www.wiley.com/', kind: 'guide' },
  la_vt: { title: 'Learning assumption of this tool package (engineering judgement; replace with project data)', edition: 'vt-core ' + VERSION + ', 2026-11', url: '', kind: 'learning_assumption' }
};

/* Design criteria by building use (up-peak handling capacity HC5 in % of population per 5 min, interval INT and
   average waiting time AWT in s). The ranges are those commonly quoted in lift planning guidance (CIBSE Guide D,
   Barney) but the exact table values could not be checked against the paid editions here -> kind learning_assumption. */
var CRITERIA = {
  office: { hc5_min: 12, hc5_good: 15, int_max: 30, int_good: 25, awt_max: 25, source: 'la_vt' },
  residential: { hc5_min: 5, hc5_good: 7, int_max: 60, int_good: 45, awt_max: 40, source: 'la_vt' },
  hotel: { hc5_min: 10, hc5_good: 12, int_max: 40, int_good: 30, awt_max: 30, source: 'la_vt' },
  hospital: { hc5_min: 8, hc5_good: 10, int_max: 50, int_good: 40, awt_max: 35, source: 'la_vt' },
  mixed: { hc5_min: 11, hc5_good: 13, int_max: 35, int_good: 30, awt_max: 30, source: 'la_vt' }
};
/* traffic light: 'green' meets the good value, 'amber' meets the minimum, 'red' fails. kind: 'hc5' higher is better; 'int'/'awt' lower is better */
function light(use, kind, value) {
  var c = CRITERIA[use] || CRITERIA.office;
  if (value == null || !isFinite(value)) return 'grey';
  if (kind === 'hc5') return value >= c.hc5_good ? 'green' : value >= c.hc5_min ? 'amber' : 'red';
  if (kind === 'int') return value <= c.int_good ? 'green' : value <= c.int_max ? 'amber' : 'red';
  if (kind === 'awt') return value <= c.awt_max * 0.8 ? 'green' : value <= c.awt_max ? 'amber' : 'red';
  return 'grey';
}

/* =====================================================================================
   6. Names (7 languages) shared by the three pages
   ===================================================================================== */
var ROLES = {
  lobby: L('Lobby', 'Вестибюль', 'Eingangshalle', 'Lobby', 'Hall d’entrée', 'Vestíbulo', 'Hol wejściowy'),
  parking: L('Parking', 'Паркінг', 'Parkgeschoss', 'Parkeergarage', 'Parking', 'Aparcamiento', 'Parking'),
  canteen: L('Canteen / restaurant', 'Їдальня / ресторан', 'Kantine / Restaurant', 'Bedrijfsrestaurant', 'Restaurant d’entreprise', 'Comedor / restaurante', 'Stołówka / restauracja'),
  office: L('Offices', 'Офіси', 'Büros', 'Kantoren', 'Bureaux', 'Oficinas', 'Biura'),
  residential: L('Apartments', 'Квартири', 'Wohnungen', 'Appartementen', 'Logements', 'Viviendas', 'Mieszkania'),
  hotel: L('Hotel rooms', 'Номери готелю', 'Hotelzimmer', 'Hotelkamers', 'Chambres d’hôtel', 'Habitaciones de hotel', 'Pokoje hotelowe'),
  meeting: L('Meeting rooms', 'Переговорні', 'Besprechungsräume', 'Vergaderzalen', 'Salles de réunion', 'Salas de reuniones', 'Sale konferencyjne'),
  plant: L('Plant room', 'Технічний поверх', 'Technikgeschoss', 'Technische verdieping', 'Étage technique', 'Planta técnica', 'Kondygnacja techniczna'),
  retail: L('Retail', 'Торгівля', 'Einzelhandel', 'Winkels', 'Commerces', 'Comercio', 'Handel'),
  ward: L('Hospital wards', 'Палати', 'Pflegestationen', 'Verpleegafdelingen', 'Services d’hospitalisation', 'Plantas de hospitalización', 'Oddziały szpitalne')
};
var USES = {
  office: L('Office building', 'Офісна будівля', 'Bürogebäude', 'Kantoorgebouw', 'Immeuble de bureaux', 'Edificio de oficinas', 'Biurowiec'),
  residential: L('Residential building', 'Житловий будинок', 'Wohngebäude', 'Woongebouw', 'Immeuble d’habitation', 'Edificio residencial', 'Budynek mieszkalny'),
  hotel: L('Hotel', 'Готель', 'Hotel', 'Hotel', 'Hôtel', 'Hotel', 'Hotel'),
  hospital: L('Hospital', 'Лікарня', 'Krankenhaus', 'Ziekenhuis', 'Hôpital', 'Hospital', 'Szpital'),
  mixed: L('Mixed use', 'Багатофункціональна будівля', 'Gemischte Nutzung', 'Gemengd gebruik', 'Usage mixte', 'Uso mixto', 'Funkcja mieszana')
};
var TEMPLATE_NAMES = {
  up_peak: L('Morning up-peak', 'Ранковий пік на підйом', 'Morgendliche Aufwärtsspitze', 'Ochtendspits omhoog', 'Pointe montante du matin', 'Punta de subida matinal', 'Poranny szczyt w górę'),
  down_peak: L('Evening down-peak', 'Вечірній пік на спуск', 'Abendliche Abwärtsspitze', 'Avondspits omlaag', 'Pointe descendante du soir', 'Punta de bajada vespertina', 'Wieczorny szczyt w dół'),
  lunch: L('Lunch time', 'Обідня перерва', 'Mittagszeit', 'Lunchtijd', 'Pause de midi', 'Hora de comer', 'Przerwa obiadowa'),
  interfloor: L('Inter-floor (mid-morning)', 'Міжповерховий рух (до обіду)', 'Zwischengeschossverkehr (Vormittag)', 'Verkeer tussen verdiepingen (ochtend)', 'Trafic interétages (matinée)', 'Tráfico entre plantas (media mañana)', 'Ruch międzypiętrowy (przedpołudnie)'),
  day: L('Whole working day', 'Увесь робочий день', 'Ganzer Arbeitstag', 'Hele werkdag', 'Journée de travail entière', 'Jornada laboral completa', 'Cały dzień pracy'),
  custom: L('Custom', 'Власний', 'Benutzerdefiniert', 'Aangepast', 'Personnalisé', 'Personalizado', 'Własny')
};
var CALL_SYSTEMS = {
  single: L('Single hall button', 'Одна кнопка виклику', 'Einzelruftaste', 'Eén oproepknop', 'Bouton d’appel unique', 'Pulsador único', 'Jeden przycisk wezwania'),
  updown: L('Up / down hall buttons', 'Кнопки «вгору / вниз»', 'Auf-/Ab-Ruftasten', 'Knoppen omhoog / omlaag', 'Boutons montée / descente', 'Pulsadores subir / bajar', 'Przyciski w górę / w dół'),
  dcs: L('Destination keypad in the hall (DCS)', 'Вибір поверху призначення в холі (DCS)', 'Zielwahltastatur in der Halle (DCS)', 'Bestemmingskeuze in de hal (DCS)', 'Clavier de destination au palier (DCS)', 'Teclado de destino en el rellano (DCS)', 'Klawiatura wyboru celu na przystanku (DCS)')
};
var DISPATCH = {
  collective: L('Directional collective', 'Збірне керування за напрямком', 'Richtungs-Sammelsteuerung', 'Richtingsafhankelijke verzamelbesturing', 'Collective sélective', 'Colectivo selectivo', 'Sterowanie zbiorcze kierunkowe'),
  nearest: L('Nearest car', 'Найближча кабіна', 'Nächste Kabine', 'Dichtstbijzijnde kooi', 'Cabine la plus proche', 'Cabina más cercana', 'Najbliższa kabina'),
  eta: L('Estimated time of arrival (minimum cost)', 'Найменший очікуваний час прибуття (ETA)', 'Kürzeste Ankunftszeit (ETA, Kostenminimum)', 'Kortste aankomsttijd (ETA, minimale kosten)', 'Temps d’arrivée estimé (coût minimal)', 'Tiempo estimado de llegada (coste mínimo)', 'Najkrótszy szacowany czas przybycia (min. koszt)'),
  dcs: L('Destination assignment', 'Призначення кабіни за поверхом призначення', 'Zielzuweisung', 'Bestemmingstoewijzing', 'Affectation par destination', 'Asignación por destino', 'Przydział kabiny według celu')
};
var PARKING = {
  lobby: L('Return to the lobby', 'Повернення у вестибюль', 'Rückkehr in die Eingangshalle', 'Terug naar de lobby', 'Retour au hall d’entrée', 'Volver al vestíbulo', 'Powrót do holu'),
  distributed: L('Spread over the building', 'Розподіл по висоті будівлі', 'Über das Gebäude verteilt', 'Verdeeld over het gebouw', 'Réparties dans le bâtiment', 'Repartidas por el edificio', 'Rozmieszczone w całym budynku'),
  stay: L('Stay where it stopped', 'Залишатися там, де зупинилася', 'Bleibt, wo sie hielt', 'Blijft waar hij stopte', 'Reste où elle s’est arrêtée', 'Se queda donde paró', 'Zostaje tam, gdzie stanęła')
};
var TOOLS = [
  { id: 'liftwait', order: 10, name: L('Lift Waiting Time Simulator', 'Симулятор очікування ліфта', 'Aufzug-Wartezeitsimulator', 'Simulator wachttijd liften', 'Simulateur d’attente d’ascenseur', 'Simulador de espera de ascensores', 'Symulator czasu oczekiwania na dźwig') },
  { id: 'lifttraffic', order: 20, name: L('Lift Traffic Design (round-trip time)', 'Розрахунок ліфтового транспорту (час кругового рейсу)', 'Aufzugsverkehrsplanung (Umlaufzeit)', 'Liftverkeersontwerp (rondgangstijd)', 'Dimensionnement du trafic d’ascenseurs (temps d’aller-retour)', 'Diseño del tráfico de ascensores (tiempo de ida y vuelta)', 'Projekt ruchu dźwigowego (czas cyklu)') },
  { id: 'liftenergy', order: 30, name: L('Lift Energy & Efficiency Class', 'Енергоспоживання та клас ефективності ліфта', 'Aufzug: Energiebedarf und Effizienzklasse', 'Liftenergie en efficiëntieklasse', 'Énergie et classe d’efficacité d’un ascenseur', 'Energía y clase de eficiencia del ascensor', 'Energia i klasa efektywności dźwigu') }
];
var TOOL_IDS = TOOLS.map(function (x) { return x.id; });

/* =====================================================================================
   7. Up-peak round-trip time (classical formula, CIBSE Guide D ch. 4 / Barney ch. 7 / ISO 8100-32)
   in: { populations:[effective persons per served floor above the main terminal, bottom->top],
         n_cars, rated_load_kg (or CC persons), P (persons per trip; default 0.8·CC), speed, accel, jerk,
         floor_height_m (average interfloor d_f), express_m (extra run from the main terminal to the zone, one way),
         door_open_s, door_close_s, start_delay_s, transfer_s }
   S = N − Σ(1 − U_i)^P ; H = N − Σ_{j=1}^{N−1} (Σ_{i≤j} U_i)^P (unequal populations, U_i = pop_i / Σpop)
   t_v = d_f / v ; t_s = t_f(d_f) − t_v + t_sd + t_o + t_c
   RTT = 2H·t_v + 2·express/v + (S+1)·t_s + 2P·t_p ; INT = RTT/L ; HC5 = 300·P·L/RTT ; %POP = 100·HC5/POP
   AWT (Barney/CIBSE up-peak, valid 0.5 ≤ P/CC ≤ 0.8): AWT = INT·(0.4 + (1.8·P/CC − 0.77)²); below 0.5: 0.4·INT
   ATT (average transit time, Barney): 0.5·H·t_v + express/v + 0.5·S·t_s + P·t_p  (estimate, flagged as such)
   ===================================================================================== */
function SH(pops, P) {
  var N = pops.length, tot = 0, i;
  for (i = 0; i < N; i++) tot += Math.max(0, pops[i] || 0);
  if (!N || !(tot > 0)) return { S: 0, H: 0, N: N, U: [] };
  var U = pops.map(function (p) { return Math.max(0, p || 0) / tot; });
  var S = N, H = N, cum = 0;
  for (i = 0; i < N; i++) S -= Math.pow(1 - U[i], P);
  for (i = 0; i < N - 1; i++) { cum += U[i]; H -= Math.pow(Math.min(1, cum), P); }
  return { S: S, H: H, N: N, U: U };
}

function upPeak(o) {
  o = o || {};
  var pops = (o.populations || []).map(function (x) { return +x || 0; });
  var POP = pops.reduce(function (s, x) { return s + Math.max(0, x); }, 0);
  var CC = o.CC != null ? +o.CC : carCapacity(o.rated_load_kg != null ? o.rated_load_kg : 1275);
  var P = o.P != null ? +o.P : ACTUAL_LOAD_FACTOR * CC;
  /* n_cars omitted -> 1; n_cars = 0 (every car out of service) -> no_cars: INT, HC5, %POP, AWT, AJT = null (CR-8) */
  var Lc = o.n_cars == null ? 1 : Math.floor(+o.n_cars);
  var noCars = !(Lc > 0);
  if (noCars) Lc = 0;
  var v = +o.speed || 1, a = +o.accel || 1, j = +o.jerk || 1.5;
  var df = o.floor_height_m != null ? +o.floor_height_m : 3.5;
  var ex = Math.max(0, +o.express_m || 0);
  var to = o.door_open_s != null ? +o.door_open_s : 2, tc = o.door_close_s != null ? +o.door_close_s : 3;
  var tsd = o.start_delay_s != null ? +o.start_delay_s : 0.5, tp = o.transfer_s != null ? +o.transfer_s : 1.2;
  var sh = SH(pops, P);
  var tv = df / v;
  var tf1 = flightTime(df, v, a, j);
  var ts = tf1 - tv + tsd + to + tc;
  var travel = 2 * sh.H * tv + 2 * ex / v;
  var stops = (sh.S + 1) * (tf1 - tv + tsd);
  var doors = (sh.S + 1) * (to + tc);
  var transfer = 2 * P * tp;
  var RTT = travel + stops + doors + transfer;
  var INT = noCars ? null : RTT / Lc;
  var HC5 = noCars ? null : (RTT > 0 ? 300 * P * Lc / RTT : 0);
  var pctPOP = POP > 0 && HC5 != null ? 100 * HC5 / POP : null;
  var r = CC > 0 ? P / CC : null, awtFlag = 'ok', AWT;
  if (noCars) { AWT = null; awtFlag = 'no_cars'; }
  else if (r == null) { AWT = null; awtFlag = 'no_capacity'; }
  else if (r < 0.5) { AWT = 0.4 * INT; awtFlag = 'below_range'; }
  else { AWT = INT * (0.4 + Math.pow(1.8 * r - 0.77, 2)); if (r > 0.8 + 1e-9) awtFlag = 'above_range'; }
  var ATT = 0.5 * sh.H * tv + ex / v + 0.5 * sh.S * ts + P * tp;
  return { N: sh.N, POP: POP, CC: CC, P: P, L: Lc, S: sh.S, H: sh.H, t_v: tv, t_f1: tf1, t_s: ts, RTT: RTT, INT: INT, HC5: HC5, pctPOP: pctPOP,
    AWT_est: AWT, awt_flag: awtFlag, no_cars: noCars, load_ratio: r, ATT_est: ATT, AJT_est: AWT != null ? AWT + ATT : null,
    breakdown: { travel: travel, stops: stops, doors: doors, transfer: transfer },
    sources: ['cibse_d', 'barney', 'iso8100_32', 'alsharif_h', 'peters_kin'] };
}

/* mainTerminal(doc, group?) -> floor index of the main terminal (D-VT-13, one definition for core, sim, traffic and the refs):
   among the floors served by `group` (all floors when no group is given) the lowest floor with role 'lobby';
   else the entrance floor with the largest entrance_share (ties -> the lower floor); else the lowest served floor.
   Works on raw or normalized documents; returns -1 when the group serves no known floor. */
function mainTerminal(doc, group) {
  var floors = doc && doc.building && doc.building.floors || [];
  if (typeof group === 'string') group = (doc.groups || []).filter(function (x) { return x.id === group; })[0];
  var served = null;
  if (group && Array.isArray(group.served)) { served = {}; group.served.forEach(function (id) { served[id] = 1; }); }
  var idx = []; floors.forEach(function (f, i) { if (!served || served[f.id]) idx.push(i); });
  if (!idx.length) return -1;
  for (var k = 0; k < idx.length; k++) if (floors[idx[k]].role === 'lobby') return idx[k];
  var best = -1, bs = 0;
  idx.forEach(function (i) { var f = floors[i]; var sh = f.entrance ? (f.entrance_share != null ? +f.entrance_share || 0 : 1) : 0; if (f.entrance && (best < 0 || sh > bs)) { best = i; bs = sh; } });
  return best >= 0 ? best : idx[0];
}

/* upPeakGeometry(doc, group) -> classical up-peak geometry of one group (D-VT-13):
   main = mainTerminal(doc, group); zone = served floors above it (ALL of them, also floors with zero population such as a
   canteen: they count for N and the interfloor height, their U_i = 0); below = served floors under the main terminal
   (basement parking; not part of the up-peak formula). d_f = (level(top zone floor) − level(first zone floor)) / (n_zone − 1)
   (one zone floor: its height above the main terminal); express_m = max(0, level(first zone floor) − level(main) − d_f).
   pops = population · presence per zone floor. Returns null for an unknown group or one without served floors. */
function upPeakGeometry(doc, group) {
  var d = doc && doc.building && doc.building.floors ? doc : null;
  if (!d) return null;
  var g = typeof group === 'string' ? (d.groups || []).filter(function (x) { return x.id === group; })[0] : (group || (d.groups || [])[0]);
  if (!g) return null;
  var floors = d.building.floors, served = {};
  (g.served || []).forEach(function (id) { served[id] = 1; });
  var idx = floors.map(function (f, i) { return served[f.id] ? i : -1; }).filter(function (i) { return i >= 0; });
  if (!idx.length) return null;
  var main = mainTerminal(d, g);
  var above = idx.filter(function (i) { return i > main; });
  var below = idx.filter(function (i) { return i < main; });
  var pres = d.building.presence != null ? d.building.presence : 1;
  var pops = above.map(function (i) { return (floors[i].population || 0) * pres; });
  var df = above.length > 1 ? (floors[above[above.length - 1]].level_m - floors[above[0]].level_m) / (above.length - 1) : (above.length ? floors[above[0]].level_m - floors[main].level_m : 3.5);
  var ex = above.length ? Math.max(0, floors[above[0]].level_m - floors[main].level_m - df) : 0;
  return { group: g.id, main: main, main_terminal: floors[main].id, zone_idx: above, zone: above.map(function (i) { return floors[i].id; }),
    below_idx: below, below: below.map(function (i) { return floors[i].id; }), pops: pops, floor_height_m: df, express_m: ex, presence: pres };
}

/* upPeakFromDoc(doc, groupId) -> upPeak() inputs and result for one group of a scenario, geometry from upPeakGeometry().
   Cars out of service are not counted (all out -> n_cars 0 -> no_cars). */
function upPeakFromDoc(doc, groupId, over) {
  var d = normalize(doc);
  var g = (d.groups || []).filter(function (x) { return x.id === groupId; })[0] || d.groups[0];
  if (!g) return null;
  var geo = upPeakGeometry(d, g);
  if (!geo) return null;
  var floors = d.building.floors, main = geo.main, above = geo.zone_idx, below = geo.below_idx, pops = geo.pops, df = geo.floor_height_m, ex = geo.express_m;
  var cars = g.cars.filter(function (c) { return c.in_service !== false; });
  var c0 = cars[0] || g.cars[0];
  var inp = { populations: pops, n_cars: cars.length, rated_load_kg: c0.rated_load_kg, speed: c0.speed, accel: c0.accel, jerk: c0.jerk,
    floor_height_m: df, express_m: ex, door_open_s: c0.door_open_s, door_close_s: c0.door_close_s, start_delay_s: c0.start_delay_s, transfer_s: d.traffic.transfer_s };
  if (over) Object.keys(over).forEach(function (k) { inp[k] = over[k]; });
  var r = upPeak(inp);
  r.inputs = inp; r.group = g.id; r.main_terminal = floors[main].id; r.zone = above.map(function (i) { return floors[i].id; });
  r.ignored_below = below.map(function (i) { return floors[i].id; });
  r.mixed_cars = cars.some(function (c) { return c.rated_load_kg !== c0.rated_load_kg || c.speed !== c0.speed; });
  return r;
}

/* =====================================================================================
   8. Scenario document
   ===================================================================================== */
var ENUMS = {
  use: ['office', 'residential', 'hotel', 'hospital', 'mixed'],
  role: ['lobby', 'parking', 'canteen', 'office', 'residential', 'hotel', 'meeting', 'plant', 'retail', 'ward'],
  call_system: ['single', 'updown', 'dcs'],
  dispatch: ['collective', 'nearest', 'eta', 'dcs'],
  parking: ['lobby', 'distributed', 'stay'],
  template: ['up_peak', 'down_peak', 'lunch', 'interfloor', 'day', 'custom']
};
var LIMITS = { bytes: 2000000, depth: 64, nodes: 100000, floors: 200, groups: 12, cars: 16, profile: 500 };
var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
/* car defaults: typical modern traction lift values (learning_assumption; CIBSE Guide D gives similar typical door and motion times) */
var CAR_DEFAULTS = { rated_load_kg: 1275, speed: 2.5, accel: 1.0, jerk: 1.5, door_open_s: 2.0, door_close_s: 3.0, start_delay_s: 0.5, door_dwell_s: 2.0, in_service: true };
/* numeric ranges [min, max] checked by validate() */
var CAR_RANGES = { rated_load_kg: [100, 10000], speed: [0.1, 20], accel: [0.1, 3], jerk: [0.1, 10], door_open_s: [0, 30], door_close_s: [0, 30], start_delay_s: [0, 10], door_dwell_s: [0, 60] };
var TRAFFIC_DEFAULTS = { template: 'up_peak', arrival_pct_5min: 12, duration_min: 60, start: '08:00', transfer_s: 1.2, both_buttons_share: 0, group_size: { mean: 1.0 } };

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

function emptyScenario(opts) {
  opts = opts || {};
  var floors = [];
  for (var i = 0; i <= 5; i++) floors.push({ id: 'F' + i, label: String(i), level_m: i === 0 ? 0 : 4.5 + (i - 1) * 3.6, role: i === 0 ? 'lobby' : 'office', population: i === 0 ? 0 : 80, entrance: i === 0, entrance_share: i === 0 ? 1 : 0, attractor_share: 0 });
  return { schema: SCHEMA, revision: 1,
    building: { name: opts.name || '', use: 'office', floors: floors, presence: 0.85 },
    groups: [{ id: 'A', name: 'A', served: floors.map(function (f) { return f.id; }), express_zone: false,
      cars: [car('A1'), car('A2')], call_system: 'updown', dispatch: 'collective', parking: 'lobby', load_limit: 0.8 }],
    traffic: clone(TRAFFIC_DEFAULTS), modules: {} };
  function car(id) { var c = clone(CAR_DEFAULTS); c.id = id; c.home = 'F0'; return c; }
}

/* validation message templates (QA-10): key -> L(en, uk, de, nl, fr, es, pl); {x} = argument. The JSON path is printed before the message unchanged. */
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
  label: L('string ≤ 24 chars expected', 'очікується текст до 24 символів', 'Text mit höchstens 24 Zeichen erwartet', 'tekst van hoogstens 24 tekens verwacht', 'texte de 24 caractères au plus attendu', 'se espera un texto de 24 caracteres como máximo', 'oczekiwano tekstu do 24 znaków'),
  boolean: L('true or false expected', 'очікується true або false', 'true oder false erwartet', 'true of false verwacht', 'true ou false attendu', 'se espera true o false', 'oczekiwano true lub false'),
  object: L('object expected', 'очікується об’єкт', 'Objekt erwartet', 'object verwacht', 'objet attendu', 'se espera un objeto', 'oczekiwano obiektu'),
  array: L('array expected', 'очікується масив', 'Liste (Array) erwartet', 'lijst (array) verwacht', 'tableau attendu', 'se espera una lista (array)', 'oczekiwano tablicy'),
  schema: L('schema must be {s}', 'схема має бути {s}', 'Schema muss {s} sein', 'schema moet {s} zijn', 'le schéma doit être {s}', 'el esquema debe ser {s}', 'schemat musi mieć wartość {s}'),
  revision: L('revision must be a non-negative integer', 'ревізія має бути цілим невід’ємним числом', 'Revision muss eine nichtnegative ganze Zahl sein', 'revisie moet een niet-negatief geheel getal zijn', 'la révision doit être un entier positif ou nul', 'la revisión debe ser un entero no negativo', 'rewizja musi być nieujemną liczbą całkowitą'),
  building: L('building must be an object', 'будівля (building) має бути об’єктом', 'building muss ein Objekt sein', 'building moet een object zijn', 'building doit être un objet', 'building debe ser un objeto', 'building musi być obiektem'),
  enum: L('{k} must be one of {list}', '{k}: допустимі значення {list}', '{k} muss einer der Werte {list} sein', '{k} moet een van {list} zijn', '{k} doit valoir {list}', '{k} debe ser uno de {list}', '{k} musi mieć jedną z wartości {list}'),
  floors_min: L('at least 2 floors expected', 'потрібно щонайменше 2 поверхи', 'mindestens 2 Geschosse erforderlich', 'minstens 2 verdiepingen nodig', 'au moins 2 niveaux requis', 'se necesitan al menos 2 plantas', 'wymagane są co najmniej 2 kondygnacje'),
  too_many_floors: L('more than {n} floors', 'понад {n} поверхів', 'mehr als {n} Geschosse', 'meer dan {n} verdiepingen', 'plus de {n} niveaux', 'más de {n} plantas', 'ponad {n} kondygnacji'),
  floor: L('floor must be an object', 'поверх має бути об’єктом', 'Geschoss muss ein Objekt sein', 'verdieping moet een object zijn', 'le niveau doit être un objet', 'la planta debe ser un objeto', 'kondygnacja musi być obiektem'),
  floor_id: L('id: 1–24 characters A-Z a-z 0-9 _ . + -', 'id: 1–24 символи A-Z a-z 0-9 _ . + -', 'id: 1–24 Zeichen A-Z a-z 0-9 _ . + -', 'id: 1–24 tekens A-Z a-z 0-9 _ . + -', 'id : 1 à 24 caractères A-Z a-z 0-9 _ . + -', 'id: 1–24 caracteres A-Z a-z 0-9 _ . + -', 'id: 1–24 znaki A-Z a-z 0-9 _ . + -'),
  duplicate_floor: L('duplicate floor id {id}', 'повторний id поверху {id}', 'doppelte Geschoss-ID {id}', 'dubbele verdiepings-id {id}', 'identifiant de niveau en double {id}', 'id de planta duplicado {id}', 'powtórzony id kondygnacji {id}'),
  level_order: L('levels must increase from the lowest floor up', 'відмітки мають зростати від нижнього поверху вгору', 'Höhen müssen vom untersten Geschoss aufwärts zunehmen', 'peilen moeten van de laagste verdieping omhoog toenemen', 'les cotes doivent croître du niveau le plus bas vers le haut', 'las cotas deben aumentar desde la planta más baja hacia arriba', 'rzędne muszą rosnąć od najniższej kondygnacji w górę'),
  tall_gap: L('more than 50 m between floors', 'понад 50 м між поверхами', 'mehr als 50 m zwischen Geschossen', 'meer dan 50 m tussen verdiepingen', 'plus de 50 m entre niveaux', 'más de 50 m entre plantas', 'ponad 50 m między kondygnacjami'),
  population: L('population 0..100000 expected', 'кількість людей має бути 0..100000', 'Personenzahl 0..100000 erwartet', 'bezetting 0..100000 verwacht', 'effectif 0..100000 attendu', 'se espera una población de 0..100000', 'oczekiwano liczby osób 0..100000'),
  no_entrance: L('no entrance floor: incoming and outgoing traffic is impossible', 'немає вхідного поверху: вхідний і вихідний потоки неможливі', 'kein Eingangsgeschoss: kein Zu- und Abgangsverkehr möglich', 'geen entreeverdieping: inkomend en uitgaand verkeer onmogelijk', 'aucun niveau d’accès : trafic montant et descendant impossible', 'no hay planta de acceso: el tráfico de entrada y de salida es imposible', 'brak kondygnacji wejściowej: ruch wejściowy i wyjściowy niemożliwy'),
  groups_min: L('at least one lift group expected', 'потрібна щонайменше одна група ліфтів', 'mindestens eine Aufzugsgruppe erforderlich', 'minstens één liftgroep nodig', 'au moins un groupe d’ascenseurs requis', 'se necesita al menos un grupo de ascensores', 'wymagana jest co najmniej jedna grupa dźwigów'),
  too_many_groups: L('more than {n} groups', 'понад {n} груп', 'mehr als {n} Gruppen', 'meer dan {n} groepen', 'plus de {n} groupes', 'más de {n} grupos', 'ponad {n} grup'),
  group: L('group must be an object', 'група має бути об’єктом', 'Gruppe muss ein Objekt sein', 'groep moet een object zijn', 'le groupe doit être un objet', 'el grupo debe ser un objeto', 'grupa musi być obiektem'),
  group_id: L('bad group id', 'неприпустимий id групи', 'ungültige Gruppen-ID', 'ongeldige groeps-id', 'identifiant de groupe invalide', 'id de grupo no válido', 'nieprawidłowy id grupy'),
  duplicate_group: L('duplicate group id {id}', 'повторний id групи {id}', 'doppelte Gruppen-ID {id}', 'dubbele groeps-id {id}', 'identifiant de groupe en double {id}', 'id de grupo duplicado {id}', 'powtórzony id grupy {id}'),
  served_min: L('a group must serve at least 2 floors', 'група має обслуговувати щонайменше 2 поверхи', 'eine Gruppe muss mindestens 2 Geschosse bedienen', 'een groep moet minstens 2 verdiepingen bedienen', 'un groupe doit desservir au moins 2 niveaux', 'un grupo debe dar servicio al menos a 2 plantas', 'grupa musi obsługiwać co najmniej 2 kondygnacje'),
  unknown_floor: L('unknown floor {id}', 'невідомий поверх {id}', 'unbekanntes Geschoss {id}', 'onbekende verdieping {id}', 'niveau inconnu {id}', 'planta desconocida {id}', 'nieznana kondygnacja {id}'),
  dcs_dispatch: L('a destination keypad needs destination assignment; dispatch is treated as dcs', 'панель вибору поверху потребує призначення кабіни за поверхом призначення; керування вважається dcs', 'eine Zielwahltastatur braucht Zielzuweisung; die Steuerung wird als dcs behandelt', 'een bestemmingskeuzepaneel vraagt bestemmingstoewijzing; de besturing wordt als dcs behandeld', 'un clavier de destination exige l’affectation par destination ; la manœuvre est traitée comme dcs', 'un teclado de destino requiere asignación por destino; la maniobra se trata como dcs', 'panel wyboru celu wymaga przydziału kabiny według celu; sterowanie traktowane jako dcs'),
  dcs_calls: L('destination assignment needs a destination keypad; call system is treated as dcs', 'призначення кабіни за поверхом призначення потребує панелі вибору поверху; система викликів вважається dcs', 'Zielzuweisung braucht eine Zielwahltastatur; das Rufsystem wird als dcs behandelt', 'bestemmingstoewijzing vraagt een bestemmingskeuzepaneel; het oproepsysteem wordt als dcs behandeld', 'l’affectation par destination exige un clavier de destination ; le système d’appel est traité comme dcs', 'la asignación por destino requiere un teclado de destino; el sistema de llamadas se trata como dcs', 'przydział kabiny według celu wymaga panelu wyboru celu; system wezwań traktowany jako dcs'),
  cars_min: L('at least one car expected', 'потрібна щонайменше одна кабіна', 'mindestens eine Kabine erforderlich', 'minstens één kooi nodig', 'au moins une cabine requise', 'se necesita al menos una cabina', 'wymagana jest co najmniej jedna kabina'),
  too_many_cars: L('more than {n} cars in a group', 'понад {n} кабін у групі', 'mehr als {n} Kabinen in einer Gruppe', 'meer dan {n} kooien in een groep', 'plus de {n} cabines dans un groupe', 'más de {n} cabinas en un grupo', 'ponad {n} kabin w grupie'),
  car: L('car must be an object', 'кабіна має бути об’єктом', 'Kabine muss ein Objekt sein', 'kooi moet een object zijn', 'la cabine doit être un objet', 'la cabina debe ser un objeto', 'kabina musi być obiektem'),
  car_id: L('bad car id', 'неприпустимий id кабіни', 'ungültige Kabinen-ID', 'ongeldige kooi-id', 'identifiant de cabine invalide', 'id de cabina no válido', 'nieprawidłowy id kabiny'),
  duplicate_car: L('duplicate car id {id}', 'повторний id кабіни {id}', 'doppelte Kabinen-ID {id}', 'dubbele kooi-id {id}', 'identifiant de cabine en double {id}', 'id de cabina duplicado {id}', 'powtórzony id kabiny {id}'),
  home_not_served: L('home floor not served by the group', 'поверх стоянки кабіни не обслуговується групою', 'Parkgeschoss wird von der Gruppe nicht bedient', 'thuisverdieping wordt niet door de groep bediend', 'niveau d’attente non desservi par le groupe', 'la planta de espera no tiene servicio del grupo', 'kondygnacja postojowa nie jest obsługiwana przez grupę'),
  traffic: L('traffic must be an object', 'трафік (traffic) має бути об’єктом', 'traffic muss ein Objekt sein', 'traffic moet een object zijn', 'traffic doit être un objet', 'traffic debe ser un objeto', 'traffic musi być obiektem'),
  hhmm: L('HH:MM expected', 'очікується ГГ:ХХ', 'HH:MM erwartet', 'UU:MM verwacht', 'HH:MM attendu', 'se espera HH:MM', 'oczekiwano GG:MM'),
  mix_sum: L('shares must add up to more than 0', 'сума часток має бути більшою за 0', 'die Anteile müssen zusammen mehr als 0 ergeben', 'de aandelen moeten samen meer dan 0 zijn', 'la somme des parts doit dépasser 0', 'la suma de las proporciones debe ser mayor que 0', 'suma udziałów musi być większa od 0'),
  too_long: L('more than {n} points', 'понад {n} точок', 'mehr als {n} Punkte', 'meer dan {n} punten', 'plus de {n} points', 'más de {n} puntos', 'ponad {n} punktów'),
  nonneg: L('non-negative number expected', 'очікується невід’ємне число', 'nichtnegative Zahl erwartet', 'niet-negatief getal verwacht', 'nombre positif ou nul attendu', 'se espera un número no negativo', 'oczekiwano liczby nieujemnej'),
  t_order: L('t_min must not decrease', 't_min не може зменшуватися', 't_min darf nicht abnehmen', 't_min mag niet afnemen', 't_min ne doit pas diminuer', 't_min no debe disminuir', 't_min nie może maleć'),
  modules: L('modules must be an object', 'modules має бути об’єктом', 'modules muss ein Objekt sein', 'modules moet een object zijn', 'modules doit être un objet', 'modules debe ser un objeto', 'modules musi być obiektem'),
  module_id: L('bad module id', 'неприпустимий id модуля', 'ungültige Modul-ID', 'ongeldige module-id', 'identifiant de module invalide', 'id de módulo no válido', 'nieprawidłowy id modułu'),
  module: L('module must be an object', 'модуль має бути об’єктом', 'Modul muss ein Objekt sein', 'module moet een object zijn', 'le module doit être un objet', 'el módulo debe ser un objeto', 'moduł musi być obiektem'),
  iso_date: L('ISO date string expected', 'очікується дата у форматі ISO', 'Datum im ISO-Format erwartet', 'datum in ISO-formaat verwacht', 'date au format ISO attendue', 'se espera una fecha en formato ISO', 'oczekiwano daty w formacie ISO'),
  unknown_module: L('module from another tool kept as is', 'модуль іншого інструмента збережено без змін', 'Modul eines anderen Werkzeugs unverändert übernommen', 'module van een ander hulpmiddel ongewijzigd behouden', 'module d’un autre outil conservé tel quel', 'módulo de otra herramienta conservado tal cual', 'moduł innego narzędzia zachowany bez zmian'),
  not_text: L('text expected', 'очікується текст', 'Text erwartet', 'tekst verwacht', 'texte attendu', 'se espera un texto', 'oczekiwano tekstu'),
  too_large: L('file larger than 2 MB', 'файл більший за 2 МБ', 'Datei größer als 2 MB', 'bestand groter dan 2 MB', 'fichier de plus de 2 Mo', 'archivo de más de 2 MB', 'plik większy niż 2 MB'),
  json: L('invalid JSON: {e}', 'некоректний JSON: {e}', 'ungültiges JSON: {e}', 'ongeldige JSON: {e}', 'JSON invalide : {e}', 'JSON no válido: {e}', 'nieprawidłowy JSON: {e}')
};
var msgLang = 'en';
/* setLang(lang|fn): language of validation messages (e.msg); scenarioBar sets it to its own language. e.msg_en always stays English. */
function setLang(l) { msgLang = l; }
function curMsgLang(o) { var l = o && o.lang != null ? o.lang : msgLang; if (typeof l === 'function') { try { l = l(); } catch (e) { l = 'en'; } } return LANGS.indexOf(l) >= 0 ? l : 'en'; }
function fillMsg(key, args, lang) {
  var tpl = MSG[key] ? t(MSG[key], lang) : key;
  return tpl.replace(/\{(\w+)\}/g, function (m, k) { return args && args[k] != null ? String(args[k]) : m; });
}
function mkErr(code, path, key, args, lang) {
  return { code: code, path: path, msg: fillMsg(key, args, lang), msg_en: fillMsg(key, args, 'en'), key: key, args: args || {} };
}
/* errorText(e, lang) -> "path message" in that language (for pages that render errors themselves) */
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

function validate(doc, vopts) {
  var errors = [], warnings = [], lang = curMsgLang(vopts);
  function E(code, path, key, args) { errors.push(mkErr(code, path, key, args, lang)); }
  function Wn(code, path, key, args) { warnings.push(mkErr(code, path, key, args, lang)); }
  function rng01(v, path, lo, hi) { if (v == null) return; if (!isNum(v)) E('type', path, 'number'); else if (v < lo || v > hi) E('range', path, 'range', { lo: lo, hi: hi }); }
  if (!isObj(doc)) return { ok: false, errors: [mkErr('not_object', '$', 'not_object', null, lang)], warnings: warnings };
  walk(doc, errors, lang);
  if (errors.length) return { ok: false, errors: errors, warnings: warnings };
  if (doc.schema !== SCHEMA) E('schema', '$.schema', 'schema', { s: SCHEMA });
  if (doc.revision != null && !(isNum(doc.revision) && doc.revision >= 0 && Math.floor(doc.revision) === doc.revision)) E('revision', '$.revision', 'revision');
  var b = doc.building, ids = {};
  if (!isObj(b)) E('building', '$.building', 'building');
  else {
    if (b.name != null && typeof b.name !== 'string') E('type', '$.building.name', 'string');
    if (b.use != null && ENUMS.use.indexOf(b.use) < 0) E('enum', '$.building.use', 'enum', { k: 'use', list: ENUMS.use.join('|') });
    rng01(b.presence, '$.building.presence', 0, 1);
    if (!Array.isArray(b.floors) || b.floors.length < 2) E('floors', '$.building.floors', 'floors_min');
    else if (b.floors.length > LIMITS.floors) E('too_many_floors', '$.building.floors', 'too_many_floors', { n: LIMITS.floors });
    else {
      var prev = -Infinity, ent = 0;
      b.floors.forEach(function (f, i) {
        var p = '$.building.floors[' + i + ']';
        if (!isObj(f)) { E('floor', p, 'floor'); return; }
        if (typeof f.id !== 'string' || !/^[A-Za-z0-9_.+-]{1,24}$/.test(f.id)) E('floor_id', p + '.id', 'floor_id');
        else if (ids[f.id] != null) E('duplicate_id', p + '.id', 'duplicate_floor', { id: f.id });
        else ids[f.id] = i;
        if (f.label != null && (typeof f.label !== 'string' || f.label.length > 24)) E('type', p + '.label', 'label');
        if (!isNum(f.level_m)) E('type', p + '.level_m', 'number');
        else { if (f.level_m <= prev) E('level_order', p + '.level_m', 'level_order'); if (f.level_m - prev > 50 && prev > -Infinity) Wn('tall_gap', p + '.level_m', 'tall_gap'); prev = f.level_m; }
        if (f.role != null && ENUMS.role.indexOf(f.role) < 0) E('enum', p + '.role', 'enum', { k: 'role', list: ENUMS.role.join('|') });
        if (f.population != null && !(isNum(f.population) && f.population >= 0 && f.population <= 100000)) E('range', p + '.population', 'population');
        if (f.entrance != null && typeof f.entrance !== 'boolean') E('type', p + '.entrance', 'boolean');
        if (f.entrance) ent++;
        rng01(f.entrance_share, p + '.entrance_share', 0, 1);
        rng01(f.attractor_share, p + '.attractor_share', 0, 1);
      });
      if (!ent) Wn('no_entrance', '$.building.floors', 'no_entrance');
    }
  }
  if (!Array.isArray(doc.groups) || !doc.groups.length) E('groups', '$.groups', 'groups_min');
  else if (doc.groups.length > LIMITS.groups) E('too_many_groups', '$.groups', 'too_many_groups', { n: LIMITS.groups });
  else {
    var gids = {}, cids = {};
    doc.groups.forEach(function (g, gi) {
      var p = '$.groups[' + gi + ']';
      if (!isObj(g)) { E('group', p, 'group'); return; }
      if (typeof g.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(g.id)) E('group_id', p + '.id', 'group_id');
      else if (gids[g.id]) E('duplicate_id', p + '.id', 'duplicate_group', { id: g.id }); else gids[g.id] = 1;
      if (!Array.isArray(g.served) || g.served.length < 2) E('served', p + '.served', 'served_min');
      else g.served.forEach(function (id, k) { if (typeof id !== 'string' || ids[id] == null) E('served_ref', p + '.served[' + k + ']', 'unknown_floor', { id: id }); });
      ['call_system', 'dispatch', 'parking'].forEach(function (k) { if (g[k] != null && ENUMS[k].indexOf(g[k]) < 0) E('enum', p + '.' + k, 'enum', { k: k, list: ENUMS[k].join('|') }); });
      if (g.call_system === 'dcs' && g.dispatch != null && g.dispatch !== 'dcs') Wn('dcs_dispatch', p + '.dispatch', 'dcs_dispatch');
      if (g.dispatch === 'dcs' && g.call_system != null && g.call_system !== 'dcs') Wn('dcs_calls', p + '.call_system', 'dcs_calls');
      rng01(g.load_limit, p + '.load_limit', 0.1, 1);
      if (!Array.isArray(g.cars) || !g.cars.length) E('cars', p + '.cars', 'cars_min');
      else if (g.cars.length > LIMITS.cars) E('too_many_cars', p + '.cars', 'too_many_cars', { n: LIMITS.cars });
      else g.cars.forEach(function (c, ci) {
        var q = p + '.cars[' + ci + ']';
        if (!isObj(c)) { E('car', q, 'car'); return; }
        if (typeof c.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(c.id)) E('car_id', q + '.id', 'car_id');
        else if (cids[c.id]) E('duplicate_id', q + '.id', 'duplicate_car', { id: c.id }); else cids[c.id] = 1;
        Object.keys(CAR_RANGES).forEach(function (k) { rng01(c[k], q + '.' + k, CAR_RANGES[k][0], CAR_RANGES[k][1]); });
        if (c.in_service != null && typeof c.in_service !== 'boolean') E('type', q + '.in_service', 'boolean');
        if (c.home != null && (typeof c.home !== 'string' || ids[c.home] == null)) E('home_ref', q + '.home', 'unknown_floor', { id: c.home });
        else if (c.home != null && Array.isArray(g.served) && g.served.indexOf(c.home) < 0) E('home_ref', q + '.home', 'home_not_served');
      });
    });
  }
  var tr = doc.traffic;
  if (tr != null && !isObj(tr)) E('traffic', '$.traffic', 'traffic');
  else if (isObj(tr)) {
    if (tr.template != null && ENUMS.template.indexOf(tr.template) < 0) E('enum', '$.traffic.template', 'enum', { k: 'template', list: ENUMS.template.join('|') });
    rng01(tr.arrival_pct_5min, '$.traffic.arrival_pct_5min', 0, 100);
    rng01(tr.duration_min, '$.traffic.duration_min', 1, 1440);
    rng01(tr.transfer_s, '$.traffic.transfer_s', 0, 20);
    rng01(tr.both_buttons_share, '$.traffic.both_buttons_share', 0, 1);
    if (tr.start != null && !(typeof tr.start === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(tr.start))) E('type', '$.traffic.start', 'hhmm');
    if (tr.mix != null) {
      if (!isObj(tr.mix)) E('type', '$.traffic.mix', 'object');
      else { var ms = 0; MIX_KEYS.forEach(function (k) { rng01(tr.mix[k], '$.traffic.mix.' + k, 0, 1); if (isNum(tr.mix[k])) ms += tr.mix[k]; }); if (!(ms > 0)) E('mix', '$.traffic.mix', 'mix_sum'); }
    }
    if (tr.group_size != null) { if (!isObj(tr.group_size)) E('type', '$.traffic.group_size', 'object'); else rng01(tr.group_size.mean, '$.traffic.group_size.mean', 1, 10); }
    if (tr.profile != null) {
      if (!Array.isArray(tr.profile)) E('type', '$.traffic.profile', 'array');
      else if (tr.profile.length > LIMITS.profile) E('too_long', '$.traffic.profile', 'too_long', { n: LIMITS.profile });
      else { var pt = -Infinity; tr.profile.forEach(function (x, i) {
        var p = '$.traffic.profile[' + i + ']';
        if (!isObj(x)) { E('type', p, 'object'); return; }
        if (!isNum(x.t_min) || x.t_min < 0) E('type', p + '.t_min', 'nonneg'); else { if (x.t_min < pt) E('order', p + '.t_min', 't_order'); pt = x.t_min; }
        rng01(x.pct_5min, p + '.pct_5min', 0, 100);
        MIX_KEYS.forEach(function (k) { rng01(x[k], p + '.' + k, 0, 1); });
      }); }
    }
  }
  if (doc.modules != null && !isObj(doc.modules)) E('modules', '$.modules', 'modules');
  else if (isObj(doc.modules)) {
    Object.keys(doc.modules).forEach(function (k) {
      var m = doc.modules[k], p = '$.modules.' + k;
      if (!/^[a-z][a-z0-9_-]{0,79}$/.test(k)) E('module_id', p, 'module_id');
      if (!isObj(m)) { E('module', p, 'module'); return; }
      if (m.updatedAt != null && (typeof m.updatedAt !== 'string' || !isFinite(Date.parse(m.updatedAt)))) E('updatedAt', p + '.updatedAt', 'iso_date');
      if (TOOL_IDS.indexOf(k) < 0) Wn('unknown_module', p, 'unknown_module');
    });
  }
  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/* normalize(doc): copy with every optional field filled with its default (car defaults, group control, traffic, roles);
   unknown fields survive. Throws on an invalid document. Engines read normalized documents only. */
function normalize(doc) {
  var v = validate(doc);
  if (!v.ok) throw new Error('VTCore.scenario.normalize: invalid document: ' + v.errors.slice(0, 3).map(function (e) { return e.path + ' ' + e.msg_en; }).join('; '));
  var d = clone(doc);
  if (d.revision == null) d.revision = 1;
  var b = d.building;
  if (b.name == null) b.name = '';
  if (b.use == null) b.use = 'office';
  if (b.presence == null) b.presence = 1;
  b.floors.forEach(function (f) {
    if (f.label == null) f.label = f.id;
    if (f.role == null) f.role = 'office';
    if (f.population == null) f.population = 0;
    if (f.entrance == null) f.entrance = false;
    if (f.entrance_share == null) f.entrance_share = f.entrance ? 1 : 0;
    if (!f.entrance) f.entrance_share = 0;
    if (f.attractor_share == null) f.attractor_share = 0;
  });
  var first = b.floors[0].id;
  d.groups.forEach(function (g) {
    if (g.name == null) g.name = g.id;
    if (g.express_zone == null) g.express_zone = false;
    if (g.call_system == null) g.call_system = g.dispatch === 'dcs' ? 'dcs' : 'updown';
    if (g.dispatch == null) g.dispatch = g.call_system === 'dcs' ? 'dcs' : 'collective';
    if (g.call_system === 'dcs') g.dispatch = 'dcs';
    if (g.dispatch === 'dcs') g.call_system = 'dcs';
    if (g.parking == null) g.parking = 'lobby';
    if (g.load_limit == null) g.load_limit = 0.8;
    /* served in building order */
    g.served = b.floors.map(function (f) { return f.id; }).filter(function (id) { return g.served.indexOf(id) >= 0; });
    var lobby = b.floors.filter(function (f) { return g.served.indexOf(f.id) >= 0 && f.role === 'lobby'; })[0];
    g.cars.forEach(function (c) {
      Object.keys(CAR_DEFAULTS).forEach(function (k) { if (c[k] == null) c[k] = CAR_DEFAULTS[k]; });
      if (c.home == null) c.home = lobby ? lobby.id : (g.served.indexOf(first) >= 0 ? first : g.served[0]);
      c.capacity = carCapacity(c.rated_load_kg);
    });
  });
  var tr = d.traffic = isObj(d.traffic) ? d.traffic : {};
  Object.keys(TRAFFIC_DEFAULTS).forEach(function (k) { if (tr[k] == null) tr[k] = clone(TRAFFIC_DEFAULTS[k]); });
  if (tr.group_size.mean == null) tr.group_size.mean = 1;
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
  if (!v.ok) throw new Error('VTCore.scenario.exportJSON: invalid document: ' + v.errors.map(function (e) { return e.path + ' ' + e.msg_en; }).join('; '));
  return JSON.stringify(doc, null, 2);
}

/* withModule(doc, toolId, {state, results, summary}) -> new document; the tool writes only modules.<toolId>, revision + 1 */
function withModule(doc, toolId, payload, opts) {
  if (typeof toolId !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(toolId)) throw new Error('VTCore.scenario.withModule: bad tool id');
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
  if (!v.ok) throw new Error('VTCore.scenario.withModule: result invalid: ' + v.errors[0].path + ' ' + v.errors[0].msg_en);
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
function save(doc) {
  var ls = storage(); if (!ls) return { ok: false, error: 'storage_unavailable' };
  var text;
  try { text = exportJSON(doc); } catch (e) { return { ok: false, error: 'invalid', detail: e.message }; }
  try { ls.setItem(STORAGE_KEY, text); return { ok: true }; } catch (e) { return { ok: false, error: 'storage_blocked', detail: String(e && e.message || e) }; }
}

/* small helpers for the engines and pages */
function floorIndex(doc, id) { var f = doc && doc.building && doc.building.floors || []; for (var i = 0; i < f.length; i++) if (f[i].id === id) return i; return -1; }
function carCount(doc) { return (doc && doc.groups || []).reduce(function (s, g) { return s + (g.cars ? g.cars.length : 0); }, 0); }
function population(doc) { var b = doc && doc.building; if (!b || !b.floors) return 0; return b.floors.reduce(function (s, f) { return s + (f.population || 0); }, 0) * (b.presence != null ? b.presence : 1); }
/* percentile p (0..100) of numbers, linear interpolation between order statistics (type 7, as numpy/Excel PERCENTILE.INC) */
function percentile(arr, p) {
  var a = (arr || []).filter(isNum).slice().sort(function (x, y) { return x - y; });
  if (!a.length) return null;
  var h = (a.length - 1) * Math.max(0, Math.min(100, p)) / 100, lo = Math.floor(h);
  return lo + 1 < a.length ? a[lo] + (h - lo) * (a[lo + 1] - a[lo]) : a[lo];
}
function mean(arr) { var a = (arr || []).filter(isNum); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

/* =====================================================================================
   CSV (RFC 4180, CRLF), formula-injection guard: string cells starting with = + - @ TAB CR get a leading '.
   cols: ['key', ...] or [{key, label}]; rows: objects or arrays. Numbers are written raw (dot decimal).
   ===================================================================================== */
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
  rows.forEach(function (r) {
    lines.push(defs.map(function (d) { return csvCell(Array.isArray(r) ? r[d.i] : (r ? r[d.key] : null)); }).join(','));
  });
  return lines.join('\r\n') + (lines.length ? '\r\n' : '');
}

/* =====================================================================================
   9. Traffic templates + passenger generator
   Profiles: `rel` = arrival rate relative to the peak (the peak equals traffic.arrival_pct_5min, % of the present
   population arriving per 5 min). Mix keys: incoming (entrance -> occupied floor), outgoing (occupied -> entrance),
   interfloor (occupied -> occupied), to_attractor (occupied -> canteen etc.), from_attractor (canteen -> occupied).
   Shapes follow the published description of modern office traffic (Siikonen 2000; CIBSE Guide D ch. 4: up-peak
   dominated by incoming traffic with some outgoing and inter-floor, lunch time two-way with the restaurant as attractor);
   the exact numbers are learning assumptions of this package (kind learning_assumption) — replace with survey data.
   ===================================================================================== */
var MIX_KEYS = ['incoming', 'outgoing', 'interfloor', 'to_attractor', 'from_attractor'];
function P_(t, rel, mix) { var o = { t_min: t, rel: rel }; if (mix) { o.incoming = mix[0]; o.outgoing = mix[1]; o.interfloor = mix[2]; o.to_attractor = mix[3] || 0; o.from_attractor = mix[4] || 0; } return o; }
var TEMPLATES = {
  up_peak: { name: TEMPLATE_NAMES.up_peak, start: '08:00', duration_min: 60, arrival_pct_5min: 12, mix: { incoming: 0.85, outgoing: 0.10, interfloor: 0.05 },
    profile: [P_(0, 0.4), P_(10, 0.7), P_(20, 1), P_(35, 1), P_(45, 0.7), P_(60, 0.4)], sources: ['cibse_d', 'siikonen', 'la_vt'] },
  down_peak: { name: TEMPLATE_NAMES.down_peak, start: '17:00', duration_min: 60, arrival_pct_5min: 12, mix: { incoming: 0.05, outgoing: 0.90, interfloor: 0.05 },
    profile: [P_(0, 0.5), P_(15, 1), P_(30, 1), P_(45, 0.6), P_(60, 0.3)], sources: ['cibse_d', 'la_vt'] },
  lunch: { name: TEMPLATE_NAMES.lunch, start: '11:45', duration_min: 75, arrival_pct_5min: 11, mix: { incoming: 0.45, outgoing: 0.45, interfloor: 0.10 },
    profile: [P_(0, 0.5, [0.10, 0.20, 0.10, 0.60, 0]), P_(15, 1, [0.10, 0.15, 0.05, 0.65, 0.05]), P_(35, 1, [0.15, 0.10, 0.05, 0.30, 0.40]),
      P_(55, 0.9, [0.25, 0.05, 0.05, 0.05, 0.60]), P_(75, 0.4, [0.30, 0.05, 0.15, 0, 0.50])], sources: ['siikonen', 'cibse_d', 'la_vt'] },
  interfloor: { name: TEMPLATE_NAMES.interfloor, start: '10:00', duration_min: 60, arrival_pct_5min: 4, mix: { incoming: 0.10, outgoing: 0.10, interfloor: 0.80 },
    profile: [P_(0, 1), P_(60, 1)], sources: ['la_vt'] },
  day: { name: TEMPLATE_NAMES.day, start: '07:00', duration_min: 720, arrival_pct_5min: 12, mix: { incoming: 0.5, outgoing: 0.4, interfloor: 0.1 },
    profile: [P_(0, 0.15, [0.90, 0.05, 0.05]), P_(60, 0.7, [0.85, 0.05, 0.10]), P_(90, 1, [0.85, 0.05, 0.10]), P_(120, 0.5, [0.60, 0.10, 0.30]),
      P_(180, 0.3, [0.30, 0.15, 0.55]), P_(270, 0.6, [0.15, 0.20, 0.15, 0.50, 0]), P_(300, 0.8, [0.15, 0.15, 0.10, 0.35, 0.25]),
      P_(345, 0.7, [0.20, 0.10, 0.10, 0.05, 0.55]), P_(420, 0.3, [0.25, 0.20, 0.55]), P_(540, 0.35, [0.10, 0.45, 0.45]),
      P_(600, 0.9, [0.05, 0.85, 0.10]), P_(660, 0.5, [0.05, 0.85, 0.10]), P_(720, 0.1, [0.05, 0.90, 0.05])], sources: ['siikonen', 'la_vt'] },
  custom: { name: TEMPLATE_NAMES.custom, start: '08:00', duration_min: 60, arrival_pct_5min: 10, mix: { incoming: 0.5, outgoing: 0.4, interfloor: 0.1 },
    profile: [P_(0, 1), P_(60, 1)], sources: ['la_vt'] }
};

function mixAt(pts, tMin, base) {
  /* linear interpolation of rate and mix between profile points; outside: nearest point */
  var a = pts[0], b = pts[pts.length - 1], i;
  for (i = 0; i < pts.length - 1; i++) if (tMin >= pts[i].t_min && tMin <= pts[i + 1].t_min) { a = pts[i]; b = pts[i + 1]; break; }
  if (tMin < pts[0].t_min) b = a; if (tMin > pts[pts.length - 1].t_min) a = b;
  var w = b.t_min > a.t_min ? (tMin - a.t_min) / (b.t_min - a.t_min) : 0;
  function lerp(k, dflt) { var x = a[k] != null ? a[k] : dflt, y = b[k] != null ? b[k] : dflt; return x + (y - x) * w; }
  var hasMix = MIX_KEYS.some(function (k) { return a[k] != null || b[k] != null; });
  var mix = {};
  MIX_KEYS.forEach(function (k) { mix[k] = hasMix ? lerp(k, 0) : (base[k] || 0); });
  return { rate: a.pct_5min != null || b.pct_5min != null ? lerp('pct_5min', 0) : lerp('rel', 0), abs: a.pct_5min != null || b.pct_5min != null, mix: mix };
}

/* traffic plan of a scenario: profile points, mix, duration — resolved from the template or the explicit profile */
function trafficPlan(doc) {
  var d = normalize(doc), tr = d.traffic, tpl = TEMPLATES[tr.template] || TEMPLATES.custom;
  var explicit = Array.isArray(tr.profile) && tr.profile.length > 0;
  var base = {};
  var mixSrc = isObj(tr.mix) && (tr.template === 'custom' || !tpl.profile.some(function (p) { return p.incoming != null; })) ? tr.mix : tpl.mix;
  MIX_KEYS.forEach(function (k) { base[k] = isNum(mixSrc[k]) ? mixSrc[k] : 0; });
  return { template: tr.template, explicit: explicit, points: explicit ? tr.profile : tpl.profile, base: base, peak_pct: tr.arrival_pct_5min,
    duration_s: Math.round(tr.duration_min * 60), start: tr.start, sources: tpl.sources };
}

/* arrival rate (persons/s) and normalised mix at time tSec of the run */
function rateAt(plan, presentPop, tSec) {
  var m = mixAt(plan.points, tSec / 60, plan.base);
  var pct = m.abs ? m.rate : m.rate * plan.peak_pct;
  var s = 0; MIX_KEYS.forEach(function (k) { s += Math.max(0, m.mix[k]); });
  var mix = {}; MIX_KEYS.forEach(function (k) { mix[k] = s > 0 ? Math.max(0, m.mix[k]) / s : 0; });
  return { rate: Math.max(0, pct) / 100 * presentPop / 300, pct_5min: Math.max(0, pct), mix: mix };
}

/* passengers(doc, seed, {withBoth}) -> sorted [{id, t, origin, dest, group, kind[, both]}] for the whole run.
   `both` (presses both hall buttons) is emitted only with opts.withBoth: VTSim draws the habit itself from ITS document's
   both_buttons_share, so one shared list serves an A/B pair with different shares.
   origin/dest are floor indices (0 = lowest floor). Poisson arrivals per 1 s; independent RNG streams for arrival times,
   trip choice, group choice and the both-buttons habit, so changing one setting (e.g. both_buttons_share) leaves the
   rest of the list identical. Same doc + seed -> identical list.
   OPEN STREAM (D-VT-12, CR-21): arrivals are an open Poisson process with rate arrival_pct_5min/100 · present population / 300 s
   (scaled by the template profile) over the whole duration. The total is NOT capped at the present population: office15 at
   9 %/5 min for 60 min gives about 1.08 × the people present (1240 arrivals for 1190). This is the usual practice of
   CIBSE Guide D / Barney traffic simulation (a rate held for the period, people may make several trips); read long runs
   at high rates as a stress test, not as a head count. */
function passengers(doc, seed, opts) {
  opts = opts || {};
  var d = normalize(doc), floors = d.building.floors, nF = floors.length;
  var plan = trafficPlan(d);
  var present = population(d);
  seed = (seed >>> 0) || 1;
  var rA = rng(seed), rC = rng(seed ^ 0x9E3779B9), rG = rng(seed ^ 0x85EBCA6B), rB = rng(seed ^ 0xC2B2AE35);
  var idx = floors.map(function (f, i) { return i; });
  var wPop = floors.map(function (f) { return f.population > 0 ? f.population : 0; });
  var wEnt = floors.map(function (f) { return f.entrance ? (f.entrance_share > 0 ? f.entrance_share : 0) : 0; });
  var wAtt = floors.map(function (f) { return f.attractor_share > 0 ? f.attractor_share : 0; });
  var hasAtt = wAtt.some(function (x) { return x > 0; }), hasEnt = wEnt.some(function (x) { return x > 0; });
  /* groups serving each floor; reachable[i][k] = some group serves both i and k */
  var servedBy = idx.map(function () { return []; });
  d.groups.forEach(function (g) {
    /* a group whose cars are all out of service still receives passengers (they wait — the simulator shows it) */
    g.served.forEach(function (id) { var i = floorIndex(d, id); if (i >= 0) servedBy[i].push(g.id); });
  });
  function common(i, k) { return servedBy[i].filter(function (g) { return servedBy[k].indexOf(g) >= 0; }); }
  function masked(w, origin) { return w.map(function (x, k) { return k !== origin && x > 0 && common(origin, k).length ? x : 0; }); }
  var both = d.traffic.both_buttons_share || 0, gmean = d.traffic.group_size.mean || 1;
  var out = [];
  var dur = plan.duration_s;
  for (var s = 0; s < dur; s++) {
    var r = rateAt(plan, present, s + 0.5);
    var n = rA.poisson(r.rate);
    for (var q = 0; q < n; q++) {
      var tArr = s + rA.next();
      var kind = rC.pick(MIX_KEYS, MIX_KEYS.map(function (k) { return r.mix[k]; }));
      if (kind === 'to_attractor' && !hasAtt) kind = 'outgoing';
      if (kind === 'from_attractor' && !hasAtt) kind = 'incoming';
      if ((kind === 'incoming' || kind === 'outgoing') && !hasEnt) kind = 'interfloor';
      var o, de;
      if (kind === 'incoming') { o = rC.pick(idx, wEnt); de = o == null ? undefined : rC.pick(idx, masked(wPop, o)); }
      else if (kind === 'outgoing') { o = rC.pick(idx, wPop); de = o == null ? undefined : rC.pick(idx, masked(wEnt, o)); }
      else if (kind === 'to_attractor') { o = rC.pick(idx, wPop.map(function (x, k) { return wAtt[k] > 0 ? 0 : x; })); de = o == null ? undefined : rC.pick(idx, masked(wAtt, o)); }
      else if (kind === 'from_attractor') { o = rC.pick(idx, wAtt); de = o == null ? undefined : rC.pick(idx, masked(wPop.map(function (x, k) { return wAtt[k] > 0 ? 0 : x; }), o)); }
      else { o = rC.pick(idx, wPop); de = o == null ? undefined : rC.pick(idx, masked(wPop, o)); }
      var size = gmean > 1 ? 1 + rC.poisson(gmean - 1) : 1;
      var gs = (o != null && de != null) ? common(o, de) : [];
      var grp = gs.length ? gs[rG.int(gs.length)] : null;
      for (var m = 0; m < size; m++) {
        var bb = rB.next() < both;
        if (o == null || de == null || grp == null) continue; /* no feasible trip (e.g. no occupied floor reachable) */
        var rec = { id: 0, t: tArr + m * 0.5, origin: o, dest: de, group: grp, kind: kind };
        if (opts.withBoth) rec.both = bb;
        out.push(rec);
      }
    }
  }
  out.sort(function (a, b) { return a.t - b.t || a.origin - b.origin; });
  out.forEach(function (p, i) { p.id = i + 1; p.t = Math.round(p.t * 1000) / 1000; });
  return out;
}

/* expected number of arrivals of a scenario (integral of the rate) — for statistical checks and page summaries */
function expectedArrivals(doc) {
  var d = normalize(doc), plan = trafficPlan(d), present = population(d), tot = 0;
  for (var s = 0; s < plan.duration_s; s++) tot += rateAt(plan, present, s + 0.5).rate;
  return tot * (d.traffic.group_size.mean || 1);
}

/* =====================================================================================
   10. Preset buildings — the same demo buildings in all three tools. Building data are illustrative
   (kind learning_assumption); lift data are typical catalogue values for modern traction lifts. Every `aha`
   line is reproduced by _vt/core/test.mjs (formula or passenger-list checks).
   ===================================================================================== */
function mkFloors(list) {
  /* list: [id, label, level_m, role, population, entrance_share, attractor_share] */
  return list.map(function (x) { return { id: x[0], label: x[1], level_m: x[2], role: x[3], population: x[4] || 0, entrance: (x[5] || 0) > 0, entrance_share: x[5] || 0, attractor_share: x[6] || 0 }; });
}
function stack(from, to, level0, step, role, pop) {
  var out = [];
  for (var k = from; k <= to; k++) out.push(['F' + k, String(k), Math.round((level0 + (k - from) * step) * 100) / 100, role, pop, 0, 0]);
  return out;
}
function mkCars(prefix, n, over, home) {
  var out = [];
  for (var i = 1; i <= n; i++) { var c = clone(CAR_DEFAULTS); c.id = prefix + i; c.home = home || 'F0'; Object.keys(over || {}).forEach(function (k) { c[k] = over[k]; }); out.push(c); }
  return out;
}
function mkDoc(name, use, floors, presence, groups, traffic) {
  var tr = clone(TRAFFIC_DEFAULTS); Object.keys(traffic || {}).forEach(function (k) { tr[k] = clone(traffic[k]); });
  return { schema: SCHEMA, revision: 1, building: { name: name, use: use, floors: floors, presence: presence }, groups: groups, traffic: tr, modules: {} };
}
function ids(floors) { return floors.map(function (f) { return f.id; }); }
function grp(id, name, served, cars, o) {
  var g = { id: id, name: name, served: served, express_zone: false, cars: cars, call_system: 'updown', dispatch: 'collective', parking: 'lobby', load_limit: 0.8 };
  Object.keys(o || {}).forEach(function (k) { g[k] = o[k]; });
  return g;
}

function buildPresets() {
  var P = {};
  /* office15: basement parking P-1, lobby F0, canteen F1, offices F2–F15 (14 × 100 people), 6 × 1275 kg, 2.5 m/s */
  var f15 = mkFloors([['P-1', '-1', -3.5, 'parking', 0, 0.15], ['F0', '0', 0, 'lobby', 0, 0.85], ['F1', '1', 4.5, 'canteen', 0, 0, 1]].concat(stack(2, 15, 8.25, 3.75, 'office', 100)));
  P.office15 = mkDoc('Office 15', 'office', f15, 0.85, [grp('A', 'A', ids(f15), mkCars('A', 6))], { template: 'up_peak', arrival_pct_5min: 12, duration_min: 60, start: '08:00' });
  /* office30 zoned: low group F0–F15, high group F0 + F16–F30 with an express run, 6 + 6 cars */
  var f30 = mkFloors([['F0', '0', 0, 'lobby', 0, 1]].concat(stack(1, 30, 4.5, 3.75, 'office', 90)));
  var low = ['F0'].concat(stack(1, 15, 0, 0, '', 0).map(function (x) { return x[0]; }));
  var high = ['F0'].concat(stack(16, 30, 0, 0, '', 0).map(function (x) { return x[0]; }));
  P.office30_zoned = mkDoc('Office 30 (zoned)', 'office', f30, 0.85, [
    grp('L', 'Low rise F1–F15', low, mkCars('L', 6, { speed: 2.5 })),
    grp('H', 'High rise F16–F30', high, mkCars('H', 6, { speed: 4.0 }), { express_zone: true })
  ], { template: 'up_peak', arrival_pct_5min: 12, duration_min: 60, start: '08:00' });
  /* office30 one group: the same building and 12 cars (all 4 m/s, generous to the single group) serving every floor */
  P.office30_onegroup = mkDoc('Office 30 (one group)', 'office', clone(f30), 0.85, [grp('A', 'All floors', ids(f30), mkCars('A', 12, { speed: 4.0 }))],
    { template: 'up_peak', arrival_pct_5min: 12, duration_min: 60, start: '08:00' });
  /* residential10: lobby + 10 floors of flats (25 residents each), one 630 kg 1.0 m/s lift; evening return */
  var fr = mkFloors([['F0', '0', 0, 'lobby', 0, 1]].concat(stack(1, 10, 3.2, 3.0, 'residential', 25)));
  var resCar = { rated_load_kg: 630, speed: 1.0, accel: 0.7, jerk: 1.0, door_open_s: 2.5, door_close_s: 3.5, door_dwell_s: 3.0 };
  var resTr = { template: 'custom', arrival_pct_5min: 6, duration_min: 60, start: '17:30', mix: { incoming: 0.55, outgoing: 0.35, interfloor: 0.10 } };
  P.residential10 = mkDoc('Residential 10 (1 lift)', 'residential', fr, 0.9, [grp('A', 'A', ids(fr), mkCars('A', 1, resCar))], resTr);
  P.residential10_2 = mkDoc('Residential 10 (2 lifts)', 'residential', clone(fr), 0.9, [grp('A', 'A', ids(fr), mkCars('A', 2, resCar))], resTr);
  /* hotel20: lobby, breakfast restaurant F1, rooms F2–F20 (36 guests per floor), 4 × 1275 kg 2.5 m/s; breakfast hour */
  var fh = mkFloors([['F0', '0', 0, 'lobby', 0, 1], ['F1', '1', 5.0, 'canteen', 0, 0, 1]].concat(stack(2, 20, 8.5, 3.3, 'hotel', 36)));
  P.hotel20 = mkDoc('Hotel 20', 'hotel', fh, 0.8, [grp('A', 'A', ids(fh), mkCars('A', 4))],
    { template: 'custom', arrival_pct_5min: 10, duration_min: 60, start: '07:30', mix: { incoming: 0.15, outgoing: 0.30, interfloor: 0.05, to_attractor: 0.30, from_attractor: 0.20 } });
  /* hospital8: lobby + 8 ward floors (60 people each incl. staff and visitors), 3 bed lifts 2500 kg 1.6 m/s, slow wide doors */
  var fho = mkFloors([['F0', '0', 0, 'lobby', 0, 1]].concat(stack(1, 8, 5.0, 4.2, 'ward', 60)));
  P.hospital8 = mkDoc('Hospital 8', 'hospital', fho, 1.0, [grp('A', 'A', ids(fho), mkCars('A', 3, { rated_load_kg: 2500, speed: 1.6, accel: 0.8, jerk: 1.0, door_open_s: 3.5, door_close_s: 5.0, door_dwell_s: 4.0 }))],
    { template: 'custom', arrival_pct_5min: 8, duration_min: 60, start: '14:00', transfer_s: 2.0, mix: { incoming: 0.45, outgoing: 0.35, interfloor: 0.20 } });
  /* campus_canteen: lobby, offices F1–F12 (100 each), canteen on the top floor F13; 5 × 1275 kg 2.5 m/s; lunch time */
  var fc = mkFloors([['F0', '0', 0, 'lobby', 0, 1]].concat(stack(1, 12, 4.5, 3.75, 'office', 100)).concat([['F13', '13', 49.5, 'canteen', 0, 0, 1]]));
  P.campus_canteen = mkDoc('Campus canteen', 'office', fc, 0.85, [grp('A', 'A', ids(fc), mkCars('A', 5))], { template: 'lunch', arrival_pct_5min: 11, duration_min: 75, start: '11:45' });
  return P;
}
var PRESET_DOCS = buildPresets();

var PRESETS = {
  office15: { doc: PRESET_DOCS.office15,
    name: L('Office, 15 floors', 'Офіс, 15 поверхів', 'Büro, 15 Geschosse', 'Kantoor, 15 verdiepingen', 'Bureaux, 15 étages', 'Oficinas, 15 plantas', 'Biurowiec, 15 kondygnacji'),
    aha: L('6 lifts move about 13 % of the people present in 5 min at a 27 s interval — enough for an office; with one car out of service it drops to about 11 % (below the 12 % office minimum).',
      '6 ліфтів перевозять близько 13 % присутніх людей за 5 хв з інтервалом 27 с — достатньо для офісу; якщо одна кабіна не працює, лише близько 11 % (нижче мінімуму 12 % для офісу).',
      '6 Aufzüge befördern rund 13 % der Anwesenden in 5 min bei 27 s Intervall — genug für ein Büro; fällt eine Kabine aus, sind es nur noch etwa 11 % (unter dem Büro-Minimum von 12 %).',
      '6 liften vervoeren ongeveer 13 % van de aanwezigen per 5 min bij een interval van 27 s — genoeg voor een kantoor; met één kooi buiten dienst zakt dat naar ongeveer 11 % (onder het kantoorminimum van 12 %).',
      '6 ascenseurs transportent environ 13 % des présents en 5 min avec un intervalle de 27 s — suffisant pour des bureaux ; avec une cabine hors service, on tombe à environ 11 % (sous le minimum de 12 % pour des bureaux).',
      '6 ascensores trasladan cerca del 13 % de los presentes en 5 min con un intervalo de 27 s, suficiente para oficinas; con una cabina fuera de servicio baja a cerca del 11 % (por debajo del mínimo del 12 % para oficinas).',
      '6 dźwigów przewozi ok. 13 % obecnych w 5 min przy interwale 27 s — wystarczy dla biurowca; gdy jedna kabina jest wyłączona, spada to do ok. 11 % (poniżej minimum 12 % dla biur).') },
  office30_zoned: { doc: PRESET_DOCS.office30_zoned,
    name: L('Office, 30 floors — two zones', 'Офіс, 30 поверхів — дві зони', 'Büro, 30 Geschosse — zwei Zonen', 'Kantoor, 30 verdiepingen — twee zones', 'Bureaux, 30 étages — deux zones', 'Oficinas, 30 plantas — dos zonas', 'Biurowiec, 30 kondygnacji — dwie strefy'),
    aha: L('Two zones with an express run: each car makes about 9 stops per trip instead of 11, so the same 12 cars move about 15 % more people per 5 min than one big group — at the price of a longer interval.',
      'Дві зони з експресним перегоном: кожна кабіна робить близько 9 зупинок за рейс замість 11, тож ті самі 12 кабін перевозять приблизно на 15 % більше людей за 5 хв, ніж одна велика група, — ціною довшого інтервалу.',
      'Zwei Zonen mit Expressfahrt: jede Kabine hält pro Fahrt etwa 9-mal statt 11-mal, daher befördern dieselben 12 Kabinen rund 15 % mehr Personen in 5 min als eine große Gruppe — um den Preis eines längeren Intervalls.',
      'Twee zones met een expresrit: elke kooi stopt ongeveer 9 keer per rit in plaats van 11, dus dezelfde 12 kooien vervoeren ongeveer 15 % meer mensen per 5 min dan één grote groep — ten koste van een langer interval.',
      'Deux zones avec trajet express : chaque cabine s’arrête environ 9 fois par voyage au lieu de 11, donc les mêmes 12 cabines transportent environ 15 % de personnes en plus en 5 min qu’un seul grand groupe — au prix d’un intervalle plus long.',
      'Dos zonas con recorrido exprés: cada cabina hace unas 9 paradas por viaje en lugar de 11, así que las mismas 12 cabinas trasladan cerca de un 15 % más de personas en 5 min que un solo grupo grande, a cambio de un intervalo más largo.',
      'Dwie strefy z przejazdem ekspresowym: każda kabina zatrzymuje się ok. 9 razy na kurs zamiast 11, więc te same 12 kabin przewozi ok. 15 % więcej osób w 5 min niż jedna duża grupa — kosztem dłuższego interwału.') },
  office30_onegroup: { doc: PRESET_DOCS.office30_onegroup,
    name: L('Office, 30 floors — one group', 'Офіс, 30 поверхів — одна група', 'Büro, 30 Geschosse — eine Gruppe', 'Kantoor, 30 verdiepingen — één groep', 'Bureaux, 30 étages — un seul groupe', 'Oficinas, 30 plantas — un solo grupo', 'Biurowiec, 30 kondygnacji — jedna grupa'),
    aha: L('The same 12 cars (all 4 m/s) serving all 30 floors: a car comes every 16 s, but each round trip has about 11 stops and the group carries only about 11 % of the people per 5 min — less than the two zones.',
      'Ті самі 12 кабін (усі 4 м/с) обслуговують усі 30 поверхів: кабіна приходить кожні 16 с, але за рейс близько 11 зупинок, і група перевозить лише близько 11 % людей за 5 хв — менше, ніж дві зони.',
      'Dieselben 12 Kabinen (alle 4 m/s) bedienen alle 30 Geschosse: alle 16 s kommt eine Kabine, aber jede Rundfahrt hat etwa 11 Halte, und die Gruppe befördert nur etwa 11 % der Personen in 5 min — weniger als die zwei Zonen.',
      'Dezelfde 12 kooien (alle 4 m/s) bedienen alle 30 verdiepingen: elke 16 s komt er een kooi, maar elke rondgang heeft ongeveer 11 stops en de groep vervoert slechts ongeveer 11 % van de mensen per 5 min — minder dan de twee zones.',
      'Les mêmes 12 cabines (toutes à 4 m/s) desservent les 30 étages : une cabine passe toutes les 16 s, mais chaque aller-retour compte environ 11 arrêts et le groupe ne transporte qu’environ 11 % des personnes en 5 min — moins que les deux zones.',
      'Las mismas 12 cabinas (todas a 4 m/s) sirven las 30 plantas: llega una cabina cada 16 s, pero cada viaje de ida y vuelta tiene unas 11 paradas y el grupo solo traslada cerca del 11 % de las personas en 5 min, menos que las dos zonas.',
      'Te same 12 kabin (wszystkie 4 m/s) obsługuje wszystkie 30 kondygnacji: kabina przyjeżdża co 16 s, ale każdy kurs ma ok. 11 postojów i grupa przewozi tylko ok. 11 % osób w 5 min — mniej niż dwie strefy.') },
  residential10: { doc: PRESET_DOCS.residential10,
    name: L('Residential, 10 floors — 1 lift', 'Житловий будинок, 10 поверхів — 1 ліфт', 'Wohnhaus, 10 Geschosse — 1 Aufzug', 'Woongebouw, 10 verdiepingen — 1 lift', 'Logements, 10 étages — 1 ascenseur', 'Residencial, 10 plantas — 1 ascensor', 'Budynek mieszkalny, 10 kondygnacji — 1 dźwig'),
    aha: L('One small lift: at full design load a round trip takes about 2 minutes, so the interval is about 120 s — twice the usual 60 s residential limit.',
      'Один малий ліфт: при розрахунковому завантаженні круговий рейс триває близько 2 хвилин, тож інтервал близько 120 с — удвічі більше за звичну межу 60 с для житла.',
      'Ein kleiner Aufzug: bei Auslegungslast dauert eine Rundfahrt etwa 2 Minuten, das Intervall liegt also bei rund 120 s — doppelt so lang wie die übliche Grenze von 60 s im Wohnbau.',
      'Eén kleine lift: bij ontwerpbelasting duurt een rondgang ongeveer 2 minuten, dus het interval is ongeveer 120 s — twee keer de gebruikelijke grens van 60 s voor woningbouw.',
      'Un seul petit ascenseur : à la charge de calcul, un aller-retour dure environ 2 minutes, l’intervalle est donc d’environ 120 s — le double de la limite habituelle de 60 s en logement.',
      'Un solo ascensor pequeño: con la carga de cálculo una vuelta completa dura unos 2 minutos, así que el intervalo es de unos 120 s, el doble del límite habitual de 60 s en viviendas.',
      'Jeden mały dźwig: przy obciążeniu obliczeniowym kurs w obie strony trwa ok. 2 minut, więc interwał wynosi ok. 120 s — dwa razy więcej niż typowa granica 60 s dla budynków mieszkalnych.') },
  residential10_2: { doc: PRESET_DOCS.residential10_2,
    name: L('Residential, 10 floors — 2 lifts', 'Житловий будинок, 10 поверхів — 2 ліфти', 'Wohnhaus, 10 Geschosse — 2 Aufzüge', 'Woongebouw, 10 verdiepingen — 2 liften', 'Logements, 10 étages — 2 ascenseurs', 'Residencial, 10 plantas — 2 ascensores', 'Budynek mieszkalny, 10 kondygnacji — 2 dźwigi'),
    aha: L('A second lift halves the interval to about 60 s — and the building still has a lift when one is under maintenance.',
      'Другий ліфт удвічі скорочує інтервал — до близько 60 с, і будинок не лишається без ліфта, коли один на обслуговуванні.',
      'Ein zweiter Aufzug halbiert das Intervall auf etwa 60 s — und das Haus hat noch einen Aufzug, wenn einer gewartet wird.',
      'Een tweede lift halveert het interval tot ongeveer 60 s — en het gebouw heeft nog een lift als er één in onderhoud is.',
      'Un deuxième ascenseur divise l’intervalle par deux, à environ 60 s — et l’immeuble garde un ascenseur quand l’autre est en maintenance.',
      'Un segundo ascensor reduce el intervalo a la mitad, a unos 60 s, y el edificio sigue teniendo ascensor cuando uno está en mantenimiento.',
      'Drugi dźwig skraca interwał o połowę, do ok. 60 s — a budynek ma nadal dźwig, gdy jeden jest w konserwacji.') },
  hotel20: { doc: PRESET_DOCS.hotel20,
    name: L('Hotel, 20 floors', 'Готель, 20 поверхів', 'Hotel, 20 Geschosse', 'Hotel, 20 verdiepingen', 'Hôtel, 20 étages', 'Hotel, 20 plantas', 'Hotel, 20 kondygnacji'),
    aha: L('Breakfast restaurant on floor 1: about half of the trips in the breakfast hour start or end there, so traffic runs both ways at once.',
      'Ресторан для сніданків на 1 поверсі: близько половини поїздок у годину сніданку починаються або закінчуються там, тож рух іде в обидва боки одночасно.',
      'Frühstücksrestaurant im 1. Geschoss: etwa die Hälfte der Fahrten in der Frühstücksstunde beginnt oder endet dort, der Verkehr läuft also gleichzeitig in beide Richtungen.',
      'Ontbijtrestaurant op verdieping 1: ongeveer de helft van de ritten in het ontbijtuur begint of eindigt daar, dus het verkeer loopt tegelijk in beide richtingen.',
      'Restaurant du petit-déjeuner au 1er étage : environ la moitié des trajets de l’heure du petit-déjeuner y commencent ou s’y terminent : le trafic circule dans les deux sens à la fois.',
      'Restaurante de desayunos en la planta 1: cerca de la mitad de los viajes en la hora del desayuno empiezan o terminan allí, así que el tráfico va en ambos sentidos a la vez.',
      'Restauracja śniadaniowa na 1. kondygnacji: ok. połowa przejazdów w porze śniadania zaczyna się lub kończy właśnie tam, więc ruch odbywa się jednocześnie w obu kierunkach.') },
  hospital8: { doc: PRESET_DOCS.hospital8,
    name: L('Hospital, 8 floors — bed lifts', 'Лікарня, 8 поверхів — ліжкові ліфти', 'Krankenhaus, 8 Geschosse — Bettenaufzüge', 'Ziekenhuis, 8 verdiepingen — bedliften', 'Hôpital, 8 étages — monte-lits', 'Hospital, 8 plantas — montacamas', 'Szpital, 8 kondygnacji — dźwigi szpitalne'),
    aha: L('Large bed lifts with slow wide doors: door operation and loading take about 70 % of the round trip — a faster drive would hardly help.',
      'Великі ліжкові ліфти з повільними широкими дверима: робота дверей і посадка займають близько 70 % кругового рейсу — швидший привод майже не допоможе.',
      'Große Bettenaufzüge mit langsamen breiten Türen: Türbetrieb und Ein-/Aussteigen machen etwa 70 % der Umlaufzeit aus — ein schnellerer Antrieb brächte kaum etwas.',
      'Grote bedliften met trage brede deuren: deurbediening en in- en uitstappen nemen ongeveer 70 % van de rondgangstijd in beslag — een snellere aandrijving helpt nauwelijks.',
      'Grands monte-lits aux portes larges et lentes : portes et transfert des passagers occupent environ 70 % du temps d’aller-retour — un entraînement plus rapide n’aiderait guère.',
      'Montacamas grandes con puertas anchas y lentas: las puertas y la entrada y salida ocupan cerca del 70 % del tiempo de ida y vuelta; un accionamiento más rápido apenas ayudaría.',
      'Duże dźwigi szpitalne z wolnymi, szerokimi drzwiami: praca drzwi i wsiadanie zajmują ok. 70 % czasu cyklu — szybszy napęd prawie nic nie da.') },
  campus_canteen: { doc: PRESET_DOCS.campus_canteen,
    name: L('Office, 12 floors — canteen on top', 'Офіс, 12 поверхів — їдальня нагорі', 'Büro, 12 Geschosse — Kantine ganz oben', 'Kantoor, 12 verdiepingen — restaurant bovenin', 'Bureaux, 12 étages — restaurant au dernier étage', 'Oficinas, 12 plantas — comedor en la última planta', 'Biurowiec, 12 kondygnacji — stołówka na górze'),
    aha: L('Canteen on the top floor: about two thirds of lunch-time trips go to or from it, so at lunch the canteen floor, not the lobby, is the busiest stop.',
      'Їдальня на верхньому поверсі: близько двох третин обідніх поїздок ведуть до неї або від неї, тож в обід найзавантаженіша зупинка — поверх їдальні, а не вестибюль.',
      'Kantine im obersten Geschoss: etwa zwei Drittel der Mittagsfahrten führen dorthin oder von dort weg — mittags ist das Kantinengeschoss, nicht die Eingangshalle, der meistbediente Halt.',
      'Bedrijfsrestaurant op de bovenste verdieping: ongeveer twee derde van de lunchritten gaat ernaartoe of komt ervandaan — tijdens de lunch is die verdieping, niet de lobby, de drukste stopplaats.',
      'Restaurant d’entreprise au dernier étage : environ deux tiers des trajets de midi y vont ou en viennent — à midi, c’est cet étage et non le hall qui est l’arrêt le plus fréquenté.',
      'Comedor en la última planta: cerca de dos tercios de los viajes del mediodía van a él o vienen de él, así que a mediodía la parada más concurrida es esa planta y no el vestíbulo.',
      'Stołówka na najwyższej kondygnacji: ok. dwie trzecie przejazdów w porze lunchu prowadzi do niej lub z niej — w południe najbardziej obleganym przystankiem jest ta kondygnacja, a nie hol.') }
};
/* group / zone names of the presets in 7 languages (QA-9); the documents keep the English name, pages translate at display */
var GROUP_NAMES = [
  L('Low rise F1–F15', 'Нижня зона F1–F15', 'Untere Zone F1–F15', 'Lage zone F1–F15', 'Zone basse F1–F15', 'Zona baja F1–F15', 'Strefa niska F1–F15'),
  L('High rise F16–F30', 'Верхня зона F16–F30', 'Obere Zone F16–F30', 'Hoge zone F16–F30', 'Zone haute F16–F30', 'Zona alta F16–F30', 'Strefa wysoka F16–F30'),
  L('All floors', 'Усі поверхи', 'Alle Geschosse', 'Alle verdiepingen', 'Tous les niveaux', 'Todas las plantas', 'Wszystkie kondygnacje')
];
function findL(list, name) {
  if (typeof name !== 'string' || !name) return null;
  for (var i = 0; i < list.length; i++) for (var k = 0; k < LANGS.length; k++) if (list[i][LANGS[k]] === name) return list[i];
  return null;
}
/* groupName(group, lang): a known preset group name in `lang` (from any of the 7 languages), else group.name || group.id */
function groupName(g, lang) {
  if (!g) return '';
  var hit = findL(GROUP_NAMES, g.name);
  return hit ? t(hit, lang) : (g.name || g.id || '');
}
/* buildingName(doc, lang): the preset title in `lang` when the building is a preset (its stored English or any localised
   preset name), else the stored name as is (user names are never translated) */
function buildingName(doc, lang) {
  var n = doc && doc.building && doc.building.name;
  if (typeof n !== 'string' || !n) return '';
  var ids = Object.keys(PRESETS);
  for (var i = 0; i < ids.length; i++) {
    var P = PRESETS[ids[i]];
    if (P.doc.building.name === n) return t(P.name, lang);
  }
  var hit = findL(ids.map(function (k) { return PRESETS[k].name; }), n);
  return hit ? t(hit, lang) : n;
}
/* preset(id[, lang]) -> document copy; with `lang` the building and group names are localised (QA-8/QA-9) */
function preset(id, lang) {
  if (!PRESETS[id]) return null;
  var d = clone(PRESETS[id].doc);
  if (lang && LANGS.indexOf(lang) >= 0) {
    d.building.name = t(PRESETS[id].name, lang);
    d.groups.forEach(function (g) { var hit = findL(GROUP_NAMES, g.name); if (hit) g.name = t(hit, lang); });
  }
  return d;
}
/* fileName(name, ext): keeps Unicode letters and digits, replaces only characters forbidden in Windows/macOS/Linux file
   names, control characters and whitespace by '_' (QA-8) */
function fileName(name, ext) {
  var b = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
  if (b.length > 60) b = b.slice(0, 60).replace(/[_.]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(b)) b = '_' + b;
  return (b || 'lift-scenario') + (ext || '');
}

/* =====================================================================================
   11. UI strings + scenarioBar widget (DOM only when called)
   ===================================================================================== */
var UI = {
  scenario: L('Scenario', 'Сценарій', 'Szenario', 'Scenario', 'Scénario', 'Escenario', 'Scenariusz'),
  floors: L('floors', 'поверхів', 'Geschosse', 'verdiepingen', 'niveaux', 'plantas', 'kondygnacji'),
  cars: L('cars', 'кабін', 'Kabinen', 'kooien', 'cabines', 'cabinas', 'kabin'),
  people: L('people', 'осіб', 'Personen', 'personen', 'personnes', 'personas', 'osób'),
  importJson: L('Import JSON', 'Імпорт JSON', 'JSON importieren', 'JSON importeren', 'Importer JSON', 'Importar JSON', 'Importuj JSON'),
  exportJson: L('Export JSON', 'Експорт JSON', 'JSON exportieren', 'JSON exporteren', 'Exporter JSON', 'Exportar JSON', 'Eksportuj JSON'),
  newScenario: L('New', 'Новий', 'Neu', 'Nieuw', 'Nouveau', 'Nuevo', 'Nowy'),
  use: L('Use', 'Використати', 'Verwenden', 'Gebruiken', 'Utiliser', 'Usar', 'Użyj'),
  otherModule: L('Data of another tool (kept, not used here):', 'Дані іншого інструмента (збережено, тут не використовуються):', 'Daten eines anderen Werkzeugs (erhalten, hier nicht genutzt):', 'Gegevens van een ander hulpmiddel (bewaard, hier niet gebruikt):', 'Données d’un autre outil (conservées, non utilisées ici) :', 'Datos de otra herramienta (conservados, no se usan aquí):', 'Dane innego narzędzia (zachowane, tu nieużywane):'),
  resultsFrom: L('Scenario has results from', 'Сценарій містить результати з', 'Szenario enthält Ergebnisse aus', 'Scenario bevat resultaten uit', 'Le scénario contient des résultats de', 'El escenario tiene resultados de', 'Scenariusz zawiera wyniki z'),
  noModules: L('No results from the other tools yet', 'Результатів інших інструментів ще немає', 'Noch keine Ergebnisse der anderen Werkzeuge', 'Nog geen resultaten van de andere tools', 'Pas encore de résultats des autres outils', 'Aún no hay resultados de las otras herramientas', 'Brak jeszcze wyników innych narzędzi'),
  invalid: L('File rejected', 'Файл відхилено', 'Datei abgelehnt', 'Bestand geweigerd', 'Fichier refusé', 'Archivo rechazado', 'Plik odrzucony'),
  imported: L('Scenario imported', 'Сценарій імпортовано', 'Szenario importiert', 'Scenario geïmporteerd', 'Scénario importé', 'Escenario importado', 'Zaimportowano scenariusz'),
  storageOff: L('Browser storage unavailable — keep the exported file', 'Сховище браузера недоступне — збережіть експортований файл', 'Browserspeicher nicht verfügbar — Exportdatei aufbewahren', 'Browseropslag niet beschikbaar — bewaar het exportbestand', 'Stockage du navigateur indisponible — conservez le fichier exporté', 'Almacenamiento no disponible: conserve el archivo exportado', 'Pamięć przeglądarki niedostępna — zachowaj wyeksportowany plik'),
  confirmNew: L('Start a new scenario? The scenario stored in this browser will be replaced.', 'Почати новий сценарій? Сценарій, збережений у цьому браузері, буде замінено.', 'Neues Szenario beginnen? Das in diesem Browser gespeicherte Szenario wird ersetzt.', 'Nieuw scenario beginnen? Het in deze browser opgeslagen scenario wordt vervangen.', 'Commencer un nouveau scénario ? Le scénario enregistré dans ce navigateur sera remplacé.', '¿Empezar un escenario nuevo? Se reemplazará el escenario guardado en este navegador.', 'Rozpocząć nowy scenariusz? Scenariusz zapisany w tej przeglądarce zostanie zastąpiony.'),
  siblings: L('Package tools', 'Інструменти пакета', 'Werkzeuge des Pakets', 'Tools van het pakket', 'Outils du paquet', 'Herramientas del paquete', 'Narzędzia pakietu'),
  unnamed: L('(unnamed building)', '(будівля без назви)', '(Gebäude ohne Namen)', '(naamloos gebouw)', '(bâtiment sans nom)', '(edificio sin nombre)', '(budynek bez nazwy)'),
  presetLabel: L('Example building', 'Приклад будівлі', 'Beispielgebäude', 'Voorbeeldgebouw', 'Bâtiment d’exemple', 'Edificio de ejemplo', 'Przykładowy budynek'),
  learningAssumption: L('learning assumption — replace with project data', 'навчальне припущення — замініть даними проєкту', 'Lernannahme — durch Projektdaten ersetzen', 'leeraanname — vervang door projectgegevens', 'hypothèse pédagogique — à remplacer par les données du projet', 'supuesto didáctico: sustitúyalo por datos del proyecto', 'założenie szkoleniowe — zastąp danymi projektu'),
  disclaimer: L('Planning aid. Final lift design per EN 81-20 / ISO 8100-32 by a qualified lift consultant; manufacturers’ control algorithms are proprietary — the strategies here are textbook versions.',
    'Допоміжний інструмент планування. Остаточний проєкт ліфтів — за EN 81-20 / ISO 8100-32 кваліфікованим ліфтовим консультантом; алгоритми керування виробників закриті — тут реалізовано їхні підручникові версії.',
    'Planungshilfe. Die endgültige Aufzugsplanung nach EN 81-20 / ISO 8100-32 gehört in die Hände eines qualifizierten Aufzugsplaners; die Steuerungsalgorithmen der Hersteller sind proprietär — hier sind Lehrbuchfassungen umgesetzt.',
    'Planningshulpmiddel. Het definitieve liftontwerp volgens EN 81-20 / ISO 8100-32 hoort bij een gekwalificeerde liftadviseur; de besturingsalgoritmen van fabrikanten zijn niet openbaar — hier staan leerboekversies.',
    'Aide à la planification. La conception définitive des ascenseurs selon EN 81-20 / ISO 8100-32 revient à un bureau d’études ascenseurs qualifié ; les algorithmes de manœuvre des fabricants sont propriétaires — ce sont ici des versions de manuel.',
    'Ayuda a la planificación. El diseño definitivo de los ascensores según EN 81-20 / ISO 8100-32 corresponde a un consultor de ascensores cualificado; los algoritmos de maniobra de los fabricantes son propietarios: aquí se usan versiones de manual.',
    'Narzędzie wspomagające planowanie. Ostateczny projekt dźwigów wg EN 81-20 / ISO 8100-32 powinien wykonać wykwalifikowany projektant dźwigów; algorytmy sterowania producentów są zastrzeżone — tu zastosowano wersje podręcznikowe.')
};

/* scenarioBar({mount, toolId, lang (string|fn), doc?, getDoc?, onChange(doc), onUse(moduleId, module, doc), syncTabs?}) */
function scenarioBar(opts) {
  opts = opts || {};
  if (typeof document === 'undefined') return null;
  var host = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!host) return null;
  var lang = function () { var v = typeof opts.lang === 'function' ? opts.lang() : opts.lang; return LANGS.indexOf(v) >= 0 ? v : 'en'; };
  var tx = function (k) { return t(UI[k], lang()); };
  setLang(lang);
  var doc = opts.doc ? clone(opts.doc) : (load() || emptyScenario());
  var storageOk = !!storage();
  function el(tag, attrs, text) {
    var x = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'style') x.style.cssText = attrs[k]; else x.setAttribute(k, attrs[k]); });
    if (text != null) x.textContent = text;
    return x;
  }
  var box = el('section', { 'class': 'vt-scenario-bar', 'aria-label': 'scenario', style: 'border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel,#fff);padding:var(--sp-3,12px);margin:var(--sp-3,12px) 0;font-size:var(--fs-small,13px);display:flex;flex-direction:column;gap:var(--sp-2,8px)' });
  var head = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' });
  var title = el('strong'), count = el('span', { style: 'color:var(--muted,#5b6675)' });
  var btnStyle = 'min-height:var(--ctl-h,32px);padding:0 10px;border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel-2,#f9fafc);color:var(--ink,#12161d);cursor:pointer;font:inherit';
  var bImport = el('button', { type: 'button', style: btnStyle, 'data-vt': 'import' }), bExport = el('button', { type: 'button', style: btnStyle, 'data-vt': 'export' }), bNew = el('button', { type: 'button', style: btnStyle, 'data-vt': 'new' });
  var file = el('input', { type: 'file', accept: '.json,application/json', hidden: 'hidden', tabindex: '-1' });
  var modules = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  var nav = el('nav', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
  var status = el('div', { role: 'status', 'aria-live': 'polite', style: 'color:var(--muted,#5b6675);min-height:1em' });
  head.appendChild(title); head.appendChild(count); head.appendChild(bImport); head.appendChild(bExport); head.appendChild(bNew); head.appendChild(file);
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
    var newer = a > b || (a === b && (st.revision || 0) > (cur.revision || 0));
    if (!newer) return cur;
    doc = st; render();
    return st;
  }
  function render() {
    var L_ = lang(), b = doc.building || {};
    box.setAttribute('aria-label', tx('scenario'));
    title.textContent = tx('scenario') + ': ' + (buildingName(doc, L_) || tx('unnamed'));
    count.textContent = (b.floors ? b.floors.length : 0) + ' ' + tx('floors') + ' · ' + carCount(doc) + ' ' + tx('cars') + ' · ' + fmt(Math.round(population(doc)), L_, 0) + ' ' + tx('people');
    file.setAttribute('aria-label', tx('importJson'));
    bImport.textContent = tx('importJson'); bExport.textContent = tx('exportJson'); bNew.textContent = tx('newScenario');
    modules.textContent = '';
    var mids = Object.keys(doc.modules || {}).filter(function (k) { return k !== opts.toolId; });
    if (!mids.length) modules.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('noModules')));
    mids.forEach(function (k) {
      var m = doc.modules[k], tool = TOOLS.filter(function (x) { return x.id === k; })[0];
      var date = m && m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
      var chip = el('span', { style: 'display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:var(--radius-pill,999px);background:var(--weak,rgba(55,99,230,.1))' });
      chip.appendChild(el('span', tool ? null : { 'data-foreign': k }, (tool ? tx('resultsFrom') + ' ' + t(tool.name, L_) : tx('otherModule') + ' ' + k) + (date ? ' (' + date + ')' : '')));
      /* QA-11: modules of other (non-VT) tools are listed without a Use button */
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
    a.href = url; a.download = fileName(buildingName(cur, lang()) || 'lift-scenario', '.vt.json');
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  bNew.addEventListener('click', function () {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(tx('confirmNew'))) return;
    setDoc(emptyScenario());
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
    refresh: function (next) { if (next && typeof next === 'object') { if (!validate(next).ok) throw new Error('invalid scenario'); doc = clone(next); } status.textContent = ''; render(); },
    getDoc: function () { return clone(doc); },
    /* setDoc(doc) saves to localStorage; setDoc(doc, {save:false}) only displays (e.g. a preset) */
    setDoc: function (next, o) { var v = validate(next); if (!v.ok) throw new Error('invalid scenario'); setDoc(clone(next), true, !!(o && o.save === false)); },
    destroy: function () { if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); box.remove(); }
  };
}

return {
  version: VERSION, SCHEMA: SCHEMA, STORAGE_KEY: STORAGE_KEY, LANGS: LANGS.slice(), LIMITS: LIMITS, ENUMS: ENUMS,
  L: L, t: t, fmt: fmt, clock: clock, rng: rng,
  motion: motion, flightTime: flightTime, profile: profile, ttop: ttop, stopDistance: stopDistance,
  carCapacity: carCapacity, maxCarArea: maxCarArea, MAX_CAR_AREA: MAX_CAR_AREA, ACTUAL_LOAD_FACTOR: ACTUAL_LOAD_FACTOR,
  SOURCES: SOURCES, CRITERIA: CRITERIA, light: light,
  ROLES: ROLES, USES: USES, TEMPLATE_NAMES: TEMPLATE_NAMES, CALL_SYSTEMS: CALL_SYSTEMS, DISPATCH: DISPATCH, PARKING: PARKING, TOOLS: TOOLS, TOOL_IDS: TOOL_IDS, UI: UI,
  SH: SH, upPeak: upPeak, upPeakFromDoc: upPeakFromDoc, mainTerminal: mainTerminal, upPeakGeometry: upPeakGeometry, setLang: setLang, errorText: errorText, MSG: MSG, GROUP_NAMES: GROUP_NAMES, groupName: groupName, buildingName: buildingName, fileName: fileName,
  CAR_DEFAULTS: CAR_DEFAULTS, CAR_RANGES: CAR_RANGES, TRAFFIC_DEFAULTS: TRAFFIC_DEFAULTS,
  scenario: { empty: emptyScenario, validate: validate, normalize: normalize, load: load, save: save, exportJSON: exportJSON, importJSON: importJSON, withModule: withModule },
  MIX_KEYS: MIX_KEYS, TEMPLATES: TEMPLATES, trafficPlan: trafficPlan, rateAt: rateAt, passengers: passengers, expectedArrivals: expectedArrivals,
  PRESETS: PRESETS, preset: preset,
  floorIndex: floorIndex, carCount: carCount, population: population, percentile: percentile, mean: mean,
  csv: csv,
  ui: { scenarioBar: scenarioBar }
};
});
