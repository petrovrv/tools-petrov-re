/* opt-laser.js — laser safety engine of tools.petrov.re (Optics & Photonics, tool lasersafety).
 * Pure functions, no DOM, UMD (browser global OptLaser, node module.exports).
 *
 * Basis
 *  - Exposure limits (MPE) for eye and skin: Directive 2006/25/EC, Annex II (laser radiation), Tables 2.2–2.6
 *    (= ICNIRP 1996/2000 guidelines). Public EU law, read on EUR-Lex 13.11.2026.
 *  - Hazard distances: the classic far-field formula NOHD = (sqrt(4 P / (pi MPE)) - a) / phi
 *    (IEC TR 60825-14, ANSI Z136.1 style), a and phi at the 1/e irradiance points.
 *  - Laser class: INDICATIVE only. Accessible emission limits rebuilt from the Directive MPE x limiting aperture
 *    (the construction of EN 60825-1:2001 for small sources: rule 3 C_P = N^-0.25 over the time base, T_min 18/50 µs,
 *    C_C = 8 above 1200 nm) with public summary values. NOT the AEL tables of EN 60825-1:2014, which relaxed pulse trains
 *    (C5 = 1 up to 600 pulses, T_i 5/13 µs) and 1250–1400 nm (C7) — so this class is conservative there (D-OPT-6).
 *    A formal classification needs the standard, its measurement conditions and the manufacturer.
 *  - Eyewear: OD = log10(H0 / MPE); scale number LB per EN 207 from the public summary tables (see LB_TABLE).
 * Units inside: SI (m, s, W, J, W/m2, J/m2, rad); wavelength in nm.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OptLaser = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.2.0';
  var LOG10 = Math.log(10);
  function pow10(x) { return Math.exp(x * LOG10); }
  function log10(x) { return Math.log(x) / LOG10; }
  function fin(x) { return typeof x === 'number' && isFinite(x); }

  /* ------------------------------------------------------------ correction factors (Directive Table 2.5) */
  function CA(l) { return l < 700 ? 1 : (l < 1050 ? pow10(0.002 * (l - 700)) : 5); }
  function CB(l) { return l < 450 ? 1 : pow10(0.02 * (l - 450)); }
  function CC(l) { return l < 1150 ? 1 : (l < 1200 ? pow10(0.018 * (l - 1150)) : 8); }
  var ALPHA_MIN = 1.5e-3, ALPHA_MAX = 100e-3;
  function CE(alpha) {
    if (!(alpha > ALPHA_MIN)) return 1;
    if (alpha <= ALPHA_MAX) return alpha / ALPHA_MIN;
    return alpha * alpha / (ALPHA_MIN * ALPHA_MAX);
  }
  function T1uv(l) { return pow10(0.8 * (l - 295)) * 1e-15; }               /* 302.5–315 nm */
  function T2(alpha) {
    var am = (alpha || 0) * 1e3;
    if (am <= 1.5) return 10;
    if (am >= 100) return 100;
    return 10 * pow10((am - 1.5) / 98.5);
  }
  function gammaPh(t) { return t <= 100 ? 11e-3 : (t < 1e4 ? 1.1e-3 * Math.sqrt(t) : 110e-3); }
  function C1(t) { return 5.6e3 * Math.pow(t, 0.25); }
  function C2(l) { return pow10(0.2 * (l - 295)); }

  function factors(l, t, alpha) {
    return { CA: CA(l), CB: CB(l), CC: CC(l), CE: CE(alpha || 0), T1: (l >= 302.5 && l < 315) ? T1uv(l) : null,
             T2: T2(alpha || 0), gamma: gammaPh(t), alpha: alpha || 0 };
  }

  /* ------------------------------------------------------------ limiting apertures (Directive Table 2.1 note / ICNIRP) */
  /* Directive Table 2.2/2.3 aperture column and notes: 1 mm for t <= 0.3 s, 1.5 t^0.375 mm for 0.3–10 s, 3.5 mm for t >= 10 s
     (180–400 nm and 1400 nm–100 µm); 7 mm for 400–1400 nm; 11 mm for 100 µm–1 mm. Skin (Table 2.4): 3.5 mm. */
  function apertureEye(l, t) {
    if (l >= 400 && l < 1400) return 7e-3;
    if (l >= 1e5) return 11e-3;
    return t <= 0.3 ? 1e-3 : (t < 10 ? 1.5e-3 * Math.pow(t, 0.375) : 3.5e-3);
  }
  function apertureSkin(l, t) { return l >= 1e5 ? 11e-3 : 3.5e-3; }
  /* Table 2.5: T1 for the 400–600 nm dual limits */
  function T1vis(l) { return l < 450 ? 10 : (l < 500 ? 10 * pow10(0.02 * (l - 450)) : 100); }
  /* Tables 2.2/2.3: UV-B 303–314 nm, one row per nanometre */
  var UVB = { 303: 40, 304: 60, 305: 100, 306: 160, 307: 250, 308: 400, 309: 630, 310: 1e3, 311: 1.6e3, 312: 2.5e3, 313: 4.0e3, 314: 6.3e3 };

  /* helpers that build an MPE result */
  function H(v, row, f, th) { return { q: 'H', v: v, row: row, f: f, thermal: th !== false }; }
  function E(v, row, f, th) { return { q: 'E', v: v, row: row, f: f, thermal: th !== false }; }
  function finish(r, t, what) {
    if (!r) return null;
    var Hv = r.q === 'H' ? r.v : r.v * t, Ev = r.q === 'E' ? r.v : r.v / t;
    return { quantity: r.q, value: r.v, unit: r.q === 'H' ? 'J/m2' : 'W/m2', H: Hv, E: Ev, row: r.row, formula: r.f, t: t, kind: what, thermal: r.thermal };
  }
  function minOf(a, b, t) {
    if (!a) return b; if (!b) return a;
    var ha = a.q === 'H' ? a.v : a.v * t, hb = b.q === 'H' ? b.v : b.v * t;
    return ha <= hb ? a : b;
  }

  /* ------------------------------------------------------------ eye MPE (Directive Annex II Tables 2.2 and 2.3) */
  function mpeEyeRaw(l, t, alpha, dual) {
    var ce = CE(alpha || 0), ca = CA(l), cc = CC(l), t2 = T2(alpha || 0), r, th, ph;
    if (!(l >= 180 && l <= 1e6) || !(t > 0)) return null;
    if (t > 3e4) t = 3e4;
    /* ultraviolet */
    if (l < 400) {
      if (t < 1e-9) return E(3e10, '2.2 UV <1 ns', 'E = 3·10¹⁰ W/m²');
      if (l < 302.5) return H(30, (t < 10 ? '2.2' : '2.3') + ' 180–302', 'H = 30 J/m²', false);
      if (l < 315) {
        /* the law prints one row per nanometre; between rows the lower (more protective) row is used: row = floor(λ),
           302.5–303 nm -> 303 nm row (review R-9; the ICNIRP C2 = 10^(0.2(λ−295)) J/m² lies between the bracketing rows) */
        var rowNm = Math.min(314, Math.max(303, Math.floor(l))), hc = UVB[rowNm];
        if (t < 10 && C1(t) < hc) return H(C1(t), '2.2 ' + rowNm + ' nm, short pulse', 'H = 5.6·10³ t^0.25 J/m²');
        return H(hc, (t < 10 ? '2.2 ' : '2.3 ') + rowNm + ' nm', 'H = ' + hc + ' J/m²', false);
      }
      if (t < 10) return H(C1(t), '2.2 315–400', 'H = C1 = 5.6·10³ t^0.25 J/m²');
      return H(1e4, '2.3 315–400', 'H = 10⁴ J/m²', false);
    }
    /* retinal hazard region 400–1400 nm */
    if (l < 1400) {
      if (t < 1e-13) t = 1e-13;
      if (t < 10) {
        if (l < 1050) {
          var k = l < 700 ? 1 : ca, tag = l < 700 ? '400–700' : '700–1050', fk = l < 700 ? ' C_E' : ' C_A C_E';
          if (t < 1e-11) return H(1.5e-4 * k * ce, '2.2 ' + tag, 'H = 1.5·10⁻⁴' + fk + ' J/m²');
          if (t < 1e-9) return H(2.7e4 * Math.pow(t, 0.75) * k * ce, '2.2 ' + tag, 'H = 2.7·10⁴ t^0.75' + fk + ' J/m²');
          if (t < 1.8e-5) return H(5e-3 * k * ce, '2.2 ' + tag, 'H = 5·10⁻³' + fk + ' J/m²');
          return H(18 * Math.pow(t, 0.75) * k * ce, '2.2 ' + tag, 'H = 18 t^0.75' + fk + ' J/m²');
        }
        if (t < 1e-11) return H(1.5e-3 * cc * ce, '2.2 1050–1400', 'H = 1.5·10⁻³ C_C C_E J/m²');
        if (t < 1e-9) return H(2.7e5 * Math.pow(t, 0.75) * cc * ce, '2.2 1050–1400', 'H = 2.7·10⁵ t^0.75 C_C C_E J/m²');
        if (t < 5e-5) return H(5e-2 * cc * ce, '2.2 1050–1400', 'H = 5·10⁻² C_C C_E J/m²');
        return H(90 * Math.pow(t, 0.75) * cc * ce, '2.2 1050–1400', 'H = 90 t^0.75 C_C C_E J/m²');
      }
      /* t >= 10 s */
      if (l < 700) {
        if (!(alpha > ALPHA_MIN)) th = E(10, '2.3 400–700 thermal α<1.5 mrad', 'E = 10 W/m²');
        else if (t <= t2) th = H(18 * ce * Math.pow(t, 0.75), '2.3 400–700 thermal t≤T2', 'H = 18 C_E t^0.75 J/m²');
        else th = E(18 * ce * Math.pow(t2, -0.25), '2.3 400–700 thermal t>T2', 'E = 18 C_E T2^−0.25 W/m²');
        if (l < 600) {
          if (t <= 100) ph = H(100 * CB(l), '2.3 400–600 photochemical', 'H = 100 C_B J/m² (γ = 11 mrad)', false);
          else ph = E(1 * CB(l), '2.3 400–600 photochemical', 'E = 1 C_B W/m² (γ = 1.1 t^0.5 mrad, max 110 mrad)', false);
          /* Table 2.3 note b: for sources <= 1.5 mrad the dual limits reduce to thermal for 10 s <= t < T1, photochemical after */
          if (!(alpha > ALPHA_MIN) && !dual) return t < T1vis(l) ? th : ph;
          return minOf(th, ph, t);
        }
        return th;
      }
      if (!(alpha > ALPHA_MIN)) return E(10 * ca * cc, '2.3 700–1400 α<1.5 mrad', 'E = 10 C_A C_C W/m²');
      if (t <= t2) return H(18 * ca * cc * ce * Math.pow(t, 0.75), '2.3 700–1400 t≤T2', 'H = 18 C_A C_C C_E t^0.75 J/m²');
      return E(Math.min(1000, 18 * ca * cc * ce * Math.pow(t2, -0.25)), '2.3 700–1400 t>T2', 'E = 18 C_A C_C C_E T2^−0.25 W/m² (≤ 1000 W/m²)');
    }
    /* far infrared 1400 nm – 1 mm: cornea */
    if (t < 1e-9) {
      if (l < 1500 || (l >= 1800 && l < 2600)) return E(1e12, '2.2 IR <1 ns', 'E = 10¹² W/m²');
      if (l < 1800) return E(1e13, '2.2 1500–1800 <1 ns', 'E = 10¹³ W/m²');
      return E(1e11, '2.2 2600 nm–1 mm <1 ns', 'E = 10¹¹ W/m²');
    }
    if (t >= 10) return E(1000, '2.3 1400 nm–1 mm', 'E = 1000 W/m²');
    if (l < 1500 || (l >= 1800 && l < 2600)) {
      if (t < 1e-3) return H(1e3, '2.2 ' + (l < 1500 ? '1400–1500' : '1800–2600'), 'H = 10³ J/m²');
      return H(C1(t), '2.2 ' + (l < 1500 ? '1400–1500' : '1800–2600'), 'H = 5.6·10³ t^0.25 J/m²');
    }
    if (l < 1800) return H(1e4, '2.2 1500–1800', 'H = 10⁴ J/m²');
    if (t < 1e-7) return H(100, '2.2 2600 nm–1 mm', 'H = 100 J/m²');
    return H(C1(t), '2.2 2600 nm–1 mm', 'H = 5.6·10³ t^0.25 J/m²');
  }
  function mpeEye(l, t, alpha, dual) { return finish(mpeEyeRaw(l, t, alpha, dual), Math.min(t, 3e4), "eye"); }

  /* ------------------------------------------------------------ skin MPE (Directive Annex II Table 2.4) */
  function mpeSkinRaw(l, t) {
    if (!(l >= 180 && l <= 1e6) || !(t > 0)) return null;
    if (t > 3e4) t = 3e4;
    if (l < 400) {
      var e = mpeEyeRaw(l, t, 0);
      if (e) e.row = 'skin = eye ' + e.row;
      return e;
    }
    if (l < 1400) {
      var ca = CA(l);
      if (t < 1e-9) return E(2e11 * ca, '2.4 400–1400 <1 ns', 'E = 2·10¹¹ C_A W/m²');
      if (t < 1e-7) return H(200 * ca, '2.4 400–1400', 'H = 200 C_A J/m²');
      if (t < 10) return H(1.1e4 * ca * Math.pow(t, 0.25), '2.4 400–1400', 'H = 1.1·10⁴ C_A t^0.25 J/m²');
      return E(2000 * ca, '2.4 400–1400', 'E = 2000 C_A W/m²');
    }
    var r = mpeEyeRaw(l, t, 0);
    if (r) r.row = 'skin = eye ' + r.row;
    return r;
  }
  function mpeSkin(l, t) { return finish(mpeSkinRaw(l, t), Math.min(t, 3e4), 'skin'); }

  /* ------------------------------------------------------------ repetitive pulses (Directive Annex II, three rules) */
  var TMIN = [ [315, 400, 1e-9], [400, 1050, 18e-6], [1050, 1400, 50e-6], [1400, 1500, 1e-3], [1500, 1800, 10],
               [1800, 2600, 1e-3], [2600, 1e6, 1e-7] ];
  function Tmin(l) { for (var i = 0; i < TMIN.length; i++) if (l >= TMIN[i][0] && l < TMIN[i][1]) return TMIN[i][2]; return null; }
  /* thermal limits: rule 3 applies only to limits that protect against thermal injury */
  function isThermal(l, mpe) { return !!(mpe && mpe.thermal); }

  /* Per-pulse MPE (J/m2) for a pulse train: tau pulse duration, prf Hz, T exposure duration s. */
  function mpeTrain(l, tau, prf, T, alpha, organ) {
    var f = organ === 'skin' ? function (tt) { return mpeSkin(l, tt); } : function (tt) { return mpeEye(l, tt, alpha); };
    var single = f(tau), Ntot = Math.max(1, Math.floor(prf * T + 1e-9)), out = { N: Ntot, rules: [] };
    if (!single) return null;
    out.rules.push({ id: 1, H: single.H, text: 'single pulse ≤ MPE(τ)', mpe: single });
    var avg = f(T);
    out.rules.push({ id: 2, H: avg.H / Ntot, text: 'average: N·H ≤ MPE(T)', mpe: avg });
    if (isThermal(l, single) && Ntot > 1) {
      var tm = Tmin(l), n = 1, Hgroup = single.H, Neff = Ntot, Cp;
      if (tm && prf * tm > 1) {                       /* pulses inside T_min are summed into one pulse of duration T_min */
        n = Math.ceil(prf * tm);
        Hgroup = f(tm).H / n;
        Neff = Math.max(1, Math.floor(Ntot / n));
      }
      /* grouping: when several pulses fall inside T_min they count as one effective pulse of duration T_min
         (Directive Annex II, repetitive exposure, rule c: "pulses within T_min are treated as a single pulse"); N in C_P
         is then the number of such groups (Neff), not the number of pulses (review R-15, documented interpretation). */
      Cp = Math.pow(Neff, -0.25);
      out.rules.push({ id: 3, H: Math.min(single.H, Hgroup) * Cp, Cp: Cp, Neff: Neff, grouped: n, Tmin: tm, text: 'C_P = N^−0.25 × MPE(τ)' });
    }
    var g = out.rules[0];
    for (var i = 1; i < out.rules.length; i++) if (out.rules[i].H < g.H) g = out.rules[i];
    out.governing = g.id; out.H = g.H;
    return out;
  }

  /* ------------------------------------------------------------ beam geometry */
  /* diameter (1/e) at distance r: far-field linear growth, as in the NOHD formula */
  function diam(a, phi, r) { return a + phi * r; }
  /* fraction of a Gaussian beam (1/e diameter d) passing a centred circular aperture of diameter D */
  function frac(d, D) { if (!(d > 0)) return 1; return 1 - Math.exp(-(D / d) * (D / d)); }
  /* classic distance where the peak exposure falls to the limit; Q in J or W, lim in J/m2 or W/m2 */
  function hazardDistance(Q, lim, a, phi, gain) {
    gain = gain || 1;
    if (!(Q > 0) || !(lim > 0)) return 0;
    var d = Math.sqrt(4 * Q * gain / (Math.PI * lim));
    if (d <= a) return 0;
    if (!(phi > 0)) return Infinity;
    return (d - a) / phi;
  }
  /* peak exposure at distance r (1/e diameter definition) */
  function peak(Q, a, phi, r) { var d = diam(a, phi, r); return 4 * Q / (Math.PI * d * d); }
  /* exposure averaged over the limiting aperture D; with a collecting optic of entrance diameter Dc (>= D) the
     power through Dc is delivered into the pupil (gain tau) */
  function averaged(Q, a, phi, r, D, Dc, tau) {
    var d = diam(a, phi, r);
    return Q * (tau > 0 ? tau : 1) * frac(d, Dc > D ? Dc : D) / (Math.PI * D * D / 4);
  }
  /* distance beyond which the averaged exposure stays below lim (it decreases monotonically with r) */
  function hazardDistanceAvg(Q, lim, a, phi, D, Dc, tau) {
    if (!(Q > 0) || !(lim > 0)) return 0;
    if (averaged(Q, a, phi, 0, D, Dc, tau) <= lim) return 0;
    if (!(phi > 0)) return Infinity;
    var lo = 0, hi = 1;
    while (averaged(Q, a, phi, hi, D, Dc, tau) > lim) { hi *= 2; if (hi > 1e9) return Infinity; }
    for (var i = 0; i < 200 && hi - lo > 1e-9 * hi; i++) {
      var mid = (lo + hi) / 2;
      if (averaged(Q, a, phi, mid, D, Dc, tau) > lim) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ------------------------------------------------------------ public API version tag & sources */
  var SOURCES = {
    dir2006: { title: 'Directive 2006/25/EC (artificial optical radiation), Annex II — laser exposure limit values', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0025', kind: 'law', read: '2026-11-13' },
    icnirp: { title: 'ICNIRP Guidelines on limits of exposure to laser radiation 180 nm–1 mm (Health Physics 71, 1996; 79, 2000)', kind: 'paper' },
    tr14: { title: 'IEC TR 60825-14:2004 Safety of laser products — a user\'s guide (NOHD formula, optical aids)', kind: 'standard' },
    en60825: { title: 'EN 60825-1 — classification; the indicative class here follows the 2001 construction (public summaries), not the AEL tables of the 2014 edition (+A11:2021)', kind: 'standard' },
    en207: { title: 'EN 207:2017 — laser eye protection, scale numbers LB (public summary tables)', kind: 'standard' },
    dguv: { title: 'DGUV Information 203-042 Auswahl und Benutzung von Laser-Schutzbrillen (2018, after DIN EN 207:2017) — LB table, modes, N^0.25 in 5 s, 1 mm rule', url: 'https://publikationen.dguv.de/widgets/pdf/download/article/249', kind: 'standard', read: '2026-11-13' },
    emsd: { title: 'EMSD Hong Kong, Laser Safety Guidance Notes (2005) — reproduces the AEL tables of IEC 60825-1 (2001) incl. class 3B', url: 'https://www.emsd.gov.hk/filemanager/en/content_656/laser_safety_guidance_notes_2005_eng.pdf', kind: 'learning_assumption', read: '2026-11-13' },
    schulmeister: { title: 'K. Schulmeister, The new edition of IEC 60825-1:2014 (Seibersdorf Laboratories white paper, 2017)', url: 'https://www.seibersdorf-laboratories.at/fileadmin/user_upload/docs/le/las/publ/whitepaper_iec-60825-1.pdf', kind: 'paper', read: '2026-11-13' }
  };

  /* ------------------------------------------------------------ eyewear: EN 207 scale numbers */
  /* LB_TABLE[band] = {D: W/m2 at LB1, I/R/M: J/m2 at LB1}; every next LB is x10 (public summary of EN 207:2017 Table B.1). */
  /* DGUV Information 203-042 (2018, after DIN EN 207:2017) Table: LB1 values, each LB step x10 */
  var LB_TABLE = [
    { D: 0.01, I: 3e2, R: 3e2, M: 3e11 },    /* 180–315 nm: D W/m2, I/R J/m2, M W/m2 */
    { D: 1e2, I: 5e-2, R: 5e-2, M: 1.5e-3 }, /* >315–1400 nm: D W/m2, I/R/M J/m2 */
    { D: 1e4, I: 1e3, R: 1e3, M: 1e12 }      /* >1400 nm–1 mm: D W/m2, I/R J/m2, M W/m2 */
  ];
  var LB_M_IS_E = [true, false, true];
  function lbMode(mode, tau) {
    if (mode === 'cw' || !(tau > 0) || tau >= 0.25) return 'D';
    if (tau >= 1e-6) return 'I';
    if (tau >= 1e-9) return 'R';
    return 'M';
  }
  function lbBand(l) { return l <= 315 ? 0 : (l <= 1400 ? 1 : 2); }
  function lbNumber(l, mode, value) {
    var row = LB_TABLE[lbBand(l)], base = row && row[mode];
    if (!(base > 0) || !(value > 0)) return null;
    var n = Math.ceil(log10(value / base) - 1e-9) + 1;
    return Math.max(1, n);
  }

  /* ------------------------------------------------------------ indicative laser class */
  /* AEL of class 1 rebuilt as MPE x area of the limiting aperture over the time base (the construction of
     EN 60825-1 for small sources, dual visible limits both applied); class 2 = 1 mW (400–700 nm, t >= 0.25 s);
     3R = 5 x class 1 (5 x class 2 in the visible); 3B = 0.5 W CW 315 nm–1 mm. Public summary values; NOT a formal classification. */
  function timeBase(l, intended) { if (intended) return 3e4; return l < 400 ? 3e4 : 100; }
  function ael1(l, mode, tau, prf, tb, alpha) {
    var D = apertureEye(l, tb), A = Math.PI * D * D / 4, out = {};
    var m = mpeEye(l, tb, alpha, true);
    out.P = m.H * A / tb;
    if (mode !== 'cw') {
      var Dp = apertureEye(l, tau), Ap = Math.PI * Dp * Dp / 4;
      if (mode === 'single') out.Q = mpeEye(l, tau, alpha, true).H * Ap;
      else { var tr = mpeTrain(l, tau, prf, tb, alpha, 'eye'); out.Q = tr ? tr.H * Ap : null; out.N = tr && tr.N; }
    }
    out.D = D; out.tb = tb;
    return out;
  }
  /* class 3B limits, EN 60825-1 (2001 edition values reproduced in EMSD Laser Safety Guidance Notes 2005, Table C.6;
     the 2014 edition changed classes 1–3R, not 3B, per Schulmeister 2017) */
  function ael3B(l, mode, tau) {
    var pulsed = mode !== 'cw' && tau < 0.25;
    if (l < 302.5) return { P: 1.5e-3, Q: pulsed ? 3.8e-4 : null };
    if (l < 315) { var c2 = C2(l); return { P: 5e-5 * c2, Q: pulsed ? 1.25e-5 * c2 : null }; }
    var o = { P: 0.5, Q: null };
    if (pulsed) {
      if (l < 400) o.Q = 0.125;
      else if (l < 700) o.Q = tau < 0.06 ? 0.03 : 0.5 * tau;
      else if (l < 1050) o.Q = 0.03 * CA(l);
      else if (l < 1400) o.Q = 0.15;
      else o.Q = 0.125;
    }
    return o;
  }
  function within(ae, lim, k) {
    k = k || 1;
    if (!lim) return false;
    if (lim.P != null && ae.P > lim.P * k * (1 + 1e-9)) return false;
    if (lim.Q != null && ae.Q != null && ae.Q > lim.Q * k * (1 + 1e-9)) return false;
    return true;
  }
  /* accessible emission through an aperture D at distance z from the exit (Gaussian, 1/e diameter) */
  function accessible(inp, D, z) {
    var d = diam(inp.a, inp.phi, z), f = frac(d, D);
    return { P: inp.Pavg * f, Q: inp.mode === 'cw' ? null : inp.Q * f, f: f, d: d, D: D, z: z };
  }
  function classify(inp) {
    var l = inp.lambda, vis = l >= 400 && l <= 700;
    var tb = timeBase(l, inp.intended);
    var L1 = ael1(l, inp.mode, inp.tau, inp.prf, tb, inp.alpha);
    var ae3 = accessible(inp, L1.D, 0.1);
    var cond1 = l >= 302.5 && l <= 4000, ae1 = cond1 ? accessible(inp, 50e-3, 2.0) : ae3;
    var L2 = vis ? { P: 1e-3, Q: L1.Q } : null;
    var L3R = vis ? { P: 5e-3, Q: L1.Q != null ? 5 * L1.Q : null } : (l >= 302.5 ? { P: 5 * L1.P, Q: L1.Q != null ? 5 * L1.Q : null } : null);
    var L3B = ael3B(l, inp.mode, inp.tau), cls;
    if (within(ae3, L1) && within(ae1, L1)) cls = '1';
    else if (within(ae3, L1) && (!L3B || within(ae1, L3B))) cls = '1M';
    else if (L2 && within(ae3, L2) && within(ae1, L2)) cls = '2';
    else if (L2 && within(ae3, L2)) cls = '2M';
    else if (L3R && within(ae3, L3R) && within(ae1, L3R)) cls = '3R';
    else if (L3B && within(ae3, L3B) && within(ae1, L3B)) cls = '3B';
    else cls = '4';
    return { cls: cls, timeBase: tb, AEL1: L1, AEL2: L2, AEL3R: L3R, AEL3B: L3B, AE3: ae3, AE1: cond1 ? ae1 : null, cond1: cond1 };
  }

  /* ------------------------------------------------------------ full assessment */
  /* inp: lambda nm, mode cw|single|rep, P (W, CW power), Q (J/pulse), tau (s), prf (Hz),
     a (m, beam diameter at the exit), phi (rad, full divergence), def '1/e'|'1/e2', T (s, eye exposure, 0 = auto),
     Tskin (s), alpha (rad, source subtense, 0 = point), optics {M, Dobj (m), tau} or null, intended (bool) */
  function normalise(inp) {
    var o = {}, k;
    for (k in inp) if (Object.prototype.hasOwnProperty.call(inp, k)) o[k] = inp[k];
    o.mode = o.mode === 'single' || o.mode === 'rep' ? o.mode : 'cw';
    if (o.mode === 'cw') { o.Pavg = o.P; o.Q = null; }
    else if (o.mode === 'single') o.Pavg = 0;
    else o.Pavg = o.Q * o.prf;
    if (o.def === '1/e2') { o.a = o.a / Math.SQRT2; o.phi = o.phi / Math.SQRT2; }
    o.alpha = o.alpha || 0;
    return o;
  }
  function autoT(l) { return (l >= 400 && l <= 700) ? 0.25 : (l < 400 ? 3e4 : 10); }

  function assess(raw) {
    var inp = normalise(raw || {}), l = inp.lambda, errs = [];
    if (!(l >= 180 && l <= 1e6)) errs.push('lambda');
    if (inp.mode === 'cw' && !(inp.P > 0)) errs.push('P');
    if (inp.mode !== 'cw' && !(inp.Q > 0)) errs.push('Q');
    if (inp.mode !== 'cw' && !(inp.tau > 0 && inp.tau < 10)) errs.push('tau');
    if (inp.mode === 'rep' && !(inp.prf > 0)) errs.push('prf');
    if (inp.mode === 'rep' && inp.tau * inp.prf >= 1) errs.push('duty');
    /* physical sanity (review R-2): beam 1 µm – 10 m, divergence ≤ π rad, power ≤ 1 GW, energy ≤ 1 MJ, PRF ≤ 10 GHz */
    if (!(inp.a >= 1e-6 && inp.a <= 10)) errs.push('a');
    if (!(inp.phi >= 0 && inp.phi <= Math.PI)) errs.push('phi');
    if (inp.mode === 'cw' && !(inp.P <= 1e9)) errs.push('P');
    if (inp.mode !== 'cw' && !(inp.Q <= 1e6)) errs.push('Q');
    if (inp.mode === 'rep' && !(inp.prf <= 1e10)) errs.push('prf');
    if (errs.length) return { ok: false, errors: errs };
    var T = inp.T > 0 ? inp.T : autoT(l), Ts = inp.Tskin > 0 ? inp.Tskin : Math.max(10, T);
    var r = { ok: true, input: inp, T: T, Tskin: Ts, factors: factors(l, T, inp.alpha) };
    var De = apertureEye(l, inp.mode === 'single' ? inp.tau : T), Ds = apertureSkin(l, Ts), e0, s0;
    r.apEye = De; r.apSkin = Ds;
    if (inp.mode === 'cw') {
      var m = mpeEye(l, T, inp.alpha), ms = mpeSkin(l, Ts);
      e0 = { Q: inp.P, lim: m.E, unit: 'W/m2', mpe: m };
      s0 = { Q: inp.P, lim: ms.E, unit: 'W/m2', mpe: ms };
    } else if (inp.mode === 'single') {
      var m1 = mpeEye(l, inp.tau, inp.alpha), s1 = mpeSkin(l, inp.tau);
      e0 = { Q: inp.Q, lim: m1.H, unit: 'J/m2', mpe: m1 };
      s0 = { Q: inp.Q, lim: s1.H, unit: 'J/m2', mpe: s1 };
    } else {
      var tr = mpeTrain(l, inp.tau, inp.prf, T, inp.alpha, 'eye'), ts = mpeTrain(l, inp.tau, inp.prf, Ts, 0, 'skin');
      r.train = tr; r.trainSkin = ts;
      e0 = { Q: inp.Q, lim: tr.H, unit: 'J/m2', mpe: mpeEye(l, inp.tau, inp.alpha) };
      /* each rule with its own limiting aperture (review R-10): rule 1 (single pulse) with the aperture of the pulse duration,
         rules 2 and 3 with that of the exposure duration T; the rule with the highest exitance ratio governs the exposure, the hazard
         distance is the largest of the three (aperture sizes differ only outside 400–1400 nm) */
      var Dtau = apertureEye(l, inp.tau), best = null, nohdMax = 0;
      tr.rules.forEach(function (x) {
        var Dx = x.id === 1 ? Dtau : De, rx = averaged(inp.Q, inp.a, inp.phi, 0, Dx) / x.H, nx = hazardDistanceAvg(inp.Q, x.H, inp.a, inp.phi, Dx);
        x.D = Dx; x.ratio = rx; x.nohd = nx;
        if (nx > nohdMax) nohdMax = nx;
        if (!best || rx > best.ratio * (1 + 1e-12)) best = x;
      });
      tr.governingExposure = best.id;
      if (best.D !== De || best.H !== tr.H) { e0.lim = best.H; De = best.D; }
      r.nohdRules = nohdMax;
      s0 = { Q: inp.Q, lim: ts.H, unit: 'J/m2', mpe: mpeSkin(l, inp.tau) };
    }
    r.mpe = e0.mpe; r.mpeLimit = e0.lim; r.mpeUnit = e0.unit;
    r.mpeSkin = s0.mpe; r.mpeSkinLimit = s0.lim;
    r.exitAvg = averaged(e0.Q, inp.a, inp.phi, 0, De);
    r.exitPeak = peak(e0.Q, inp.a, inp.phi, 0);
    r.ratio = r.exitAvg / e0.lim;
    r.OD = r.ratio > 1 ? log10(r.ratio) : 0;
    r.ODpeak = r.exitPeak > e0.lim ? log10(r.exitPeak / e0.lim) : 0;
    r.apEye = De;
    r.NOHD = hazardDistanceAvg(e0.Q, e0.lim, inp.a, inp.phi, De);
    if (r.nohdRules != null && r.nohdRules > r.NOHD) r.NOHD = r.nohdRules;
    r.NOHDclassic = hazardDistance(e0.Q, e0.lim, inp.a, inp.phi, 1);
    r.NSHD = hazardDistanceAvg(s0.Q, s0.lim, inp.a, inp.phi, Ds);
    r.skinRatio = averaged(s0.Q, inp.a, inp.phi, 0, Ds) / s0.lim;
    if (inp.optics && inp.optics.M > 1) {
      var op = inp.optics, Dc = Math.min(op.Dobj || 0.05, op.M * De), tauO = op.tau > 0 ? op.tau : 1;
      r.opticsDc = Dc; r.opticsGain = tauO * (Dc / De) * (Dc / De);
      /* condition-1 band of EN 60825-1 / TR 60825-14 (review R-11): 302.5–4000 nm. Ordinary glass blocks above about 2.7 µm,
         so 2.7–4 µm assumes IR-transmitting optics (conservative) */
      r.opticsTransmit = l >= 302.5 && l <= 4000;
      r.opticsIRonly = l > 2700 && l <= 4000;
      r.ENOHD = r.opticsTransmit ? Math.max(r.NOHD, hazardDistanceAvg(e0.Q, e0.lim, inp.a, inp.phi, De, Dc, tauO)) : r.NOHD;
      r.ENOHDclassic = r.opticsTransmit ? hazardDistance(e0.Q, e0.lim, inp.a, inp.phi, r.opticsGain) : r.NOHDclassic;
    }
    /* EN 207: power/energy density over the beam cross-section, not less than 1 mm diameter; trains: x N^0.25, N = PRF x 5 s */
    /* beam smaller than 1 mm: 1 mm for D and I, the real diameter for R and M (DGUV 203-042) */
    /* D mode, 315 nm – 1 mm: for P > 10 W or E > 1e5 W/m2 and d63 >= 1 mm the irradiance is raised by F(d63) = (d63/mm)^1.7,
       100 above 15 mm (DGUV 203-042 sec. 5.2 after EN 207:2017; worked example Anhang 5: 940 nm -> D LB6) */
    var Fd = 1;
    function fD(Pw, A) {
      var E0 = Pw / A, dmm = inp.a * 1000;
      Fd = (l > 315 && dmm >= 1 && (Pw > 10 || E0 > 1e5)) ? (dmm <= 15 ? Math.pow(dmm, 1.7) : 100) : 1;
      return E0 * Fd;
    }
    var mode = lbMode(inp.mode, inp.tau), Dlb = (mode === 'D' || mode === 'I') ? Math.max(inp.a, 1e-3) : inp.a, Alb = Math.PI * Dlb * Dlb / 4, band = lbBand(l), Elb;
    if (mode === 'D') Elb = fD((inp.mode === 'cw' ? inp.P : inp.Pavg), Alb);
    else if (mode === 'M' && LB_M_IS_E[band]) Elb = inp.Q / inp.tau / Alb;
    else Elb = inp.Q / Alb;
    if (inp.mode === 'rep' && mode !== 'D') Elb = Elb * Math.pow(Math.max(1, inp.prf * 5), 0.25);
    r.lb = { mode: mode, value: Elb, LB: lbNumber(l, mode, Elb), D: Dlb, F: mode === 'D' ? Fd : 1 };
    if (inp.mode === 'rep') { var Ad = Math.PI * Math.pow(Math.max(inp.a, 1e-3), 2) / 4, Edc = fD(inp.Pavg, Ad); r.lbD = { mode: 'D', value: Edc, LB: lbNumber(l, 'D', Edc), F: Fd }; }
    r.cls = classify(inp);
    var rmax = Math.max(1, (r.ENOHD || r.NOHD || 1) * 1.6), pts = [], i, z;
    if (!isFinite(rmax)) rmax = 1e4;
    for (i = 0; i <= 120; i++) {
      z = rmax * i / 120;
      pts.push([z, averaged(e0.Q, inp.a, inp.phi, z, De) / e0.lim,
                r.opticsDc ? averaged(e0.Q, inp.a, inp.phi, z, De, r.opticsDc, inp.optics.tau) / e0.lim : null]);
    }
    r.curve = pts; r.rmax = rmax;
    return r;
  }

  /* ------------------------------------------------------------ presets (inputs only; texts live in the page; each aha is a test) */
  /* beam data marked la = learning_assumption: typical values of the device type, not a datasheet */
  var PRESETS = [
    { id: 'pointer532', la: true, inp: { lambda: 532, mode: 'cw', P: 5e-3, a: 1e-3, phi: 1.2e-3, def: '1/e', T: 0 } },
    { id: 'hene633', la: true, inp: { lambda: 633, mode: 'cw', P: 1e-3, a: 0.7e-3, phi: 1.2e-3, def: '1/e', T: 0 } },
    { id: 'fibre1064', la: true, inp: { lambda: 1064, mode: 'cw', P: 10, a: 5e-3, phi: 1e-3, def: '1/e', T: 0 } },
    { id: 'diode445', la: true, inp: { lambda: 445, mode: 'cw', P: 5, a: 2e-3, phi: 3e-3, def: '1/e', T: 0 } },
    { id: 'qswitch1064', la: true, inp: { lambda: 1064, mode: 'rep', Q: 0.1, tau: 10e-9, prf: 10, a: 6e-3, phi: 0.5e-3, def: '1/e', T: 0 } },
    { id: 'co2_10600', la: true, inp: { lambda: 10600, mode: 'cw', P: 100, a: 10e-3, phi: 2e-3, def: '1/e', T: 0 } },
    { id: 'er1550', la: true, inp: { lambda: 1550, mode: 'cw', P: 2, a: 3e-3, phi: 1e-3, def: '1/e', T: 0 } },
    { id: 'binoculars', la: true, inp: { lambda: 532, mode: 'cw', P: 5e-3, a: 1e-3, phi: 1.2e-3, def: '1/e', T: 0, optics: { M: 7, Dobj: 0.05, tau: 1 } } },
    { id: 'class1_1064', la: true, inp: { lambda: 1064, mode: 'cw', P: 1.5e-3, a: 1e-3, phi: 1e-3, def: '1/e', T: 0 } }
  ];

  return {
    version: VERSION, SOURCES: SOURCES, PRESETS: PRESETS,
    CA: CA, CB: CB, CC: CC, CE: CE, T2: T2, T1uv: T1uv, gamma: gammaPh, factors: factors,
    apertureEye: apertureEye, apertureSkin: apertureSkin, Tmin: Tmin, T1vis: T1vis, UVB: UVB,
    mpeEye: mpeEye, mpeSkin: mpeSkin, mpeTrain: mpeTrain,
    diam: diam, frac: frac, peak: peak, averaged: averaged, hazardDistance: hazardDistance, hazardDistanceAvg: hazardDistanceAvg,
    lbMode: lbMode, lbNumber: lbNumber, classify: classify, assess: assess, autoT: autoT, timeBase: timeBase,
    LB_TABLE: LB_TABLE,
    _: { pow10: pow10, log10: log10, fin: fin }
  };
}));
