/* ogh-integrity.js - Oil, Gas & Hydrogen package: pipeline integrity tools
 * corrosion_defect_ffs (ASME B31G-2012, DNV-RP-F101 2019-09), dent_strain (ASME B31.8 App. R),
 * cathodic_protection (DNV-RP-B401 / ISO 15589-2), co2_corrosion_rate (NORSOK M-506 / de Waard-Milliams)
 * Generated from Claude chunks in _ogh/integrity/; assembled mechanically.
 */
(function (root) {
  'use strict';
  var OGH = root.OGH = root.OGH || {};

  function b31gNum(x) { return typeof x === 'number' && isFinite(x); }

  function b31g(g) {
    if (!g) return { error: 'No input object provided' };
    var D = g.D, t = g.t, d = g.d, L = g.L, SMYS = g.SMYS, SMTS = g.SMTS;
    var F = (g.F == null) ? 0.72 : g.F, T = (g.T == null) ? 1 : g.T;
    if (!b31gNum(D) || D <= 0) return { error: 'D must be a positive number' };
    if (!b31gNum(t) || t <= 0) return { error: 't must be a positive number' };
    if (!b31gNum(SMYS) || SMYS <= 0) return { error: 'SMYS must be a positive number' };
    if (!b31gNum(d) || d < 0) return { error: 'd must be a non-negative number' };
    if (!b31gNum(L) || L < 0) return { error: 'L must be a non-negative number' };
    if (d >= t) return { error: 'd must be less than t' };
    if (!b31gNum(F) || F <= 0) return { error: 'F must be a positive number' };
    if (!b31gNum(T) || T <= 0) return { error: 'T must be a positive number' };

    var dt = d / t, z = (L * L) / (D * t), k = F * T, warnings = [];
    if (dt > 0.8) warnings.push('B31G not applicable for d/t > 0.8');
    if (dt < 0.1) warnings.push('Shallow defect (d/t < 0.1): generally acceptable per B31G');

    function pack(method, Sflow, M, Sf, eqn) {
      var Pf = 2 * Sf * t / D;
      return { method: method, Sflow: Sflow, z: z, M: M, Sf: Sf, Pf: Pf, Psafe: Pf * k, d_t: dt, eqn: eqn };
    }

    // Original B31G
    var So = 1.1 * SMYS, Mo, Sfo, eo, a = (2 / 3) * dt;
    if (z <= 20) {
      Mo = Math.sqrt(1 + 0.8 * z);
      Sfo = So * (1 - a) / (1 - a / Mo);
      eo = 'z<=20 parabolic';
    } else {
      Mo = Infinity;
      Sfo = So * (1 - dt);
      eo = 'z>20 flat';
    }

    // Modified B31G (0.85dL)
    var Sm = SMYS + 68.95e6, Mm, em;
    if (b31gNum(SMTS) && SMTS > 0 && Sm > SMTS) {
      Sm = SMTS;
      warnings.push('Sflow capped at SMTS');
    }
    if (z <= 50) {
      Mm = Math.sqrt(1 + 0.6275 * z - 0.003375 * z * z);
      em = 'z<=50 0.85dL two-term Folias';
    } else {
      Mm = 0.032 * z + 3.3;
      em = 'z>50 0.85dL linear Folias';
    }
    var Sfm = Sm * (1 - 0.85 * dt) / (1 - 0.85 * dt / Mm);

    return {
      original: pack('Original B31G', So, Mo, Sfo, eo),
      modified: pack('Modified B31G', Sm, Mm, Sfm, em),
      warnings: warnings
    };
  }

  function b31gAllowableLength(g) {
    if (!g || !b31gNum(g.MAOP) || g.MAOP <= 0) return { error: 'MAOP must be a positive number' };
    function run(L) {
      var o = {}, key;
      for (key in g) { if (Object.prototype.hasOwnProperty.call(g, key)) o[key] = g[key]; }
      o.L = L;
      return b31g(o);
    }
    var r0 = run(0);
    if (r0.error) return { error: r0.error };
    if (r0.modified.Psafe < g.MAOP) return 0;
    var Lmax = 50 * Math.sqrt(g.D * g.t);
    if (run(Lmax).modified.Psafe >= g.MAOP) return Infinity;
    var lo = 0, hi = Lmax, i, mid;
    for (i = 0; i < 60; i++) {
      mid = 0.5 * (lo + hi);
      if (run(mid).modified.Psafe >= g.MAOP) lo = mid; else hi = mid;
    }
    return lo;
  }

  /*
   * DNV-RP-F101 (2019-09) single longitudinal corrosion defect, internal pressure only.
   * Relative depth sizing (inspection tool reports d/t) only.
   * Table values used:
   *  gamma_m (relative sizing)  low 0.79  medium 0.74  high 0.70
   *  StD[d/t]             <=0.04  0.08  0.16   (linear interpolation in between)
   *    epsilon_d            0.0   1.0   2.0
   *    gamma_d low          1.00  1.20  1.20
   *    gamma_d medium       1.00  1.28  1.38
   *    gamma_d high         1.00  1.32  1.58
   *  Part B: F = F1 * F2 (default 0.72 * 0.9 = 0.648)
   *  (glue fix 22.10: gamma_d = 1.00 at StD <= 0.04 per RP table; absolute sizing removed)
   */
  function dnvF101(g) {
    g = g || {};
    var D = g.D, t = g.t, d = g.d, L = g.L, SMTS = g.SMTS;
    var fuTemp = g.fuTemp != null ? g.fuTemp : 0;
    var alphaU = g.alphaU != null ? g.alphaU : 0.96;
    var sc = g.safetyClass || 'medium';
    var sizing = 'relative';
    var StD = g.StD != null ? g.StD : 0.08;
    var F1 = g.Fdesign != null ? g.Fdesign : 0.72;
    var F2 = g.F2 != null ? g.F2 : 0.9;
    var warnings = [];

    function num(x) { return typeof x === 'number' && isFinite(x); }
    if (!num(D) || D <= 0) return { error: 'D must be a positive number' };
    if (!num(t) || t <= 0) return { error: 't must be a positive number' };
    if (!num(SMTS) || SMTS <= 0) return { error: 'SMTS must be a positive number' };
    if (!num(d) || d < 0) return { error: 'd must be >= 0' };
    if (!num(L) || L < 0) return { error: 'L must be >= 0' };
    if (d >= t) return { error: 'd must be smaller than t' };
    if (D <= t) return { error: 'D must be greater than t' };
    if (!num(StD) || StD < 0) return { error: 'StD must be >= 0' };

    var GM = { relative: { low: 0.79, medium: 0.74, high: 0.70 } };
    var GD = { low: [1.00, 1.00, 1.20, 1.20], medium: [1.00, 1.00, 1.28, 1.38],
               high: [1.00, 1.00, 1.32, 1.58] };
    var XS = [0, 0.04, 0.08, 0.16], ED = [0, 0, 1.0, 2.0];
    if (!GD[sc]) return { error: "safetyClass must be 'low', 'medium' or 'high'" };

    function interp(xs, ys, x) {
      if (x <= xs[0]) return ys[0];
      for (var i = 1; i < xs.length; i++) {
        if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      }
      return ys[ys.length - 1];
    }
    if (StD > 0.16) {
      warnings.push('StD[d/t] > 0.16: outside Table 3-3, values clamped at StD = 0.16');
    }

    var dt = d / t;
    if (dt > 0.85) warnings.push('d/t > 0.85: outside DNV-RP-F101 validity');
    warnings.push('Combined longitudinal compressive loads are not checked');

    var Q = Math.sqrt(1 + 0.31 * Math.pow(L / Math.sqrt(D * t), 2));

    // Part B: allowable stress design
    var Pf = 2 * t * SMTS * (1 - dt) / ((D - t) * (1 - dt / Q));
    var F = F1 * F2;
    var partB = { Pf: Pf, F: F, Psafe: Pf * F };

    // Part A: partial safety factor method
    var gm = GM[sizing][sc];
    var gd = interp(XS, GD[sc], StD);
    var ed = interp(XS, ED, StD);
    var dtStar = dt + ed * StD;
    var fu = (SMTS - fuTemp) * alphaU;
    var Pcorr;
    if (gd * dtStar >= 1) {
      Pcorr = 0;
      warnings.push('gamma_d*(d/t)* >= 1: Pcorr set to 0');
    } else {
      Pcorr = gm * 2 * t * fu * (1 - gd * dtStar) / ((D - t) * (1 - gd * dtStar / Q));
    }
    var partA = { gamma_m: gm, gamma_d: gd, epsilon_d: ed, dtStar: dtStar, fu: fu, Pcorr: Pcorr };

    return { partA: partA, partB: partB, Q: Q, warnings: warnings };
  }

  var CDF_DEFAULTS = { level: 'simple', D: 0.6096, t: 0.0127, d: 0.005, L: 0.2, SMYS: 359e6, SMTS: 455e6, MAOP: 7.0e6, F: 0.72, T: 1, safetyClass: 'medium', StD: 0.08, alphaU: 0.96, fuTemp: 0, F2: 0.9 };

  var CDF_PRESETS = [
    { id: 'x52_24in', label: 'API 5L X52 24 in x 0.5 in (defaults)', values: {} },
    { id: 'x65_32in_dnv', label: 'X65 32 in, d = 25% t', values: { D: 0.8128, t: 0.0191, SMYS: 448e6, SMTS: 531e6, d: 0.25 * 0.0191, L: 0.2, MAOP: 15e6 } },
    { id: 'x42_shallow_long', label: 'X42 12.75 in, shallow long defect', values: { D: 0.3239, t: 0.00635, SMYS: 290e6, SMTS: 414e6, d: 0.0015, L: 1.0, MAOP: 5e6 } },
    { id: 'x70_deep_short', label: 'X70 42 in, deep short pit', values: { D: 1.067, t: 0.0159, SMYS: 483e6, SMTS: 565e6, d: 0.011, L: 0.05, MAOP: 10e6 } },
    { id: 'x60_reject', label: 'X60 20 in, expected reject', values: { D: 0.508, t: 0.00953, SMYS: 414e6, SMTS: 517e6, d: 0.006, L: 0.5, MAOP: 9e6 } }
  ];

  function cdfSolve(inp) {
    var g = {}, k, i;
    for (k in CDF_DEFAULTS) { if (CDF_DEFAULTS.hasOwnProperty(k)) { g[k] = CDF_DEFAULTS[k]; } }
    if (inp) { for (k in inp) { if (inp.hasOwnProperty(k)) { g[k] = inp[k]; } } }

    var bg = b31g({ D: g.D, t: g.t, d: g.d, L: g.L, SMYS: g.SMYS, SMTS: g.SMTS, F: g.F, T: g.T });
    if (!bg || bg.error) { return { ok: false, error: bg ? bg.error : 'b31g failed', warnings: [] }; }
    var dn = dnvF101({ D: g.D, t: g.t, d: g.d, L: g.L, SMTS: g.SMTS, fuTemp: g.fuTemp, alphaU: g.alphaU, safetyClass: g.safetyClass, StD: g.StD, Fdesign: g.F, F2: g.F2 });
    if (!dn || dn.error) { return { ok: false, error: dn ? dn.error : 'dnvF101 failed', warnings: [] }; }

    var SB = 'ASME B31G-2012 (2012-10)', SD = 'DNV-RP-F101 (2019-09)', MAOP = g.MAOP;
    function row(id, label, std, Pf, Psafe) {
      return { id: id, label: label, standard: std, Pf: Pf, Psafe: Psafe, ERF: Psafe > 0 ? MAOP / Psafe : Infinity, pass: Psafe >= MAOP };
    }
    var rows = [
      row('b31g_orig', 'B31G Original (Level 1)', SB, bg.original.Pf, bg.original.Psafe),
      row('b31g_mod', 'B31G Modified (0.85dL)', SB, bg.modified.Pf, bg.modified.Psafe),
      row('dnv_a', 'DNV Part A (partial safety factors)', SD, null, dn.partA.Pcorr),
      row('dnv_b', 'DNV Part B (allowable stress)', SD, dn.partB.Pf, dn.partB.Psafe)
    ];

    var governing = rows[0], nPass = 0, ERF_max = -Infinity;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].Psafe < governing.Psafe) { governing = rows[i]; }
      if (rows[i].pass) { nPass++; }
      if (rows[i].ERF > ERF_max) { ERF_max = rows[i].ERF; }
    }
    var verdict = nPass === rows.length ? 'acceptable' : (nPass === 0 ? 'reject' : 'marginal');

    var gl = {};
    for (k in g) { if (g.hasOwnProperty(k)) { gl[k] = g[k]; } }
    var la = b31gAllowableLength(gl);
    var Lallow = (typeof la === 'number') ? la : null;

    var warnings = [], seen = {}, src = (bg.warnings || []).concat(dn.warnings || []);
    for (i = 0; i < src.length; i++) {
      if (!seen[src[i]]) { seen[src[i]] = true; warnings.push(src[i]); }
    }

    var z = (g.L * g.L) / (g.D * g.t);
    var breakdown = [
      { label: 'z = L^2/(D t)', value: z, unit: '-', note: 'Defect length parameter' },
      { label: 'd/t', value: g.d / g.t, unit: '-', note: 'Relative defect depth' },
      { label: 'M (original)', value: bg.original.M, unit: '-', note: 'Folias factor, B31G original' },
      { label: 'M (modified)', value: bg.modified.M, unit: '-', note: 'Folias factor, B31G modified' },
      { label: 'Sflow (original)', value: bg.original.Sflow, unit: 'Pa', note: '1.1 x SMYS' },
      { label: 'Sflow (modified)', value: bg.modified.Sflow, unit: 'Pa', note: 'SMYS + 69 MPa' },
      { label: 'Q', value: dn.Q, unit: '-', note: 'DNV length correction factor' },
      { label: 'gamma_m', value: dn.partA.gamma_m, unit: '-', note: 'Partial safety factor, model' },
      { label: 'gamma_d', value: dn.partA.gamma_d, unit: '-', note: 'Partial safety factor, depth' },
      { label: 'epsilon_d', value: dn.partA.epsilon_d, unit: '-', note: 'Fractile for depth uncertainty' },
      { label: '(d/t)*', value: dn.partA.dtStar, unit: '-', note: 'Characteristic relative depth' },
      { label: 'fu', value: dn.partA.fu, unit: 'Pa', note: 'Design tensile strength' }
    ];

    return {
      ok: true, warnings: warnings, rows: rows, governing: governing,
      Pf_B31Gmod: bg.modified.Pf, Psafe_min: governing.Psafe, ERF_max: ERF_max,
      Lallow: Lallow, verdict: verdict, d_t: g.d / g.t, z: z, Q: dn.Q,
      b31g: bg, dnv: dn, breakdown: breakdown
    };
  }

  var DENT_DEFAULTS = { level: 'simple', D: 0.6096, t: 0.0127, d: 0.012, L: 0.30, R1: 0.25, R2: 0.40, epsLim: 0.06, depthLim: 0.06 };

  var DENT_PRESETS = [
    { id: 'default', label: 'Default case (24in, d = 12 mm)', values: { level: 'simple', D: 0.6096, t: 0.0127, d: 0.012, L: 0.30, R1: 0.25, R2: 0.40, epsLim: 0.06, depthLim: 0.06 } },
    { id: 'shallow_smooth', label: 'Shallow smooth dent (2% D)', values: { level: 'simple', D: 0.6096, t: 0.0127, d: 0.012192, L: 0.60, R1: 0.35, R2: 1.50, epsLim: 0.06, depthLim: 0.06 } },
    { id: 'sharp_reversed', label: 'Sharp dent, reversed curvature (R1 = -0.05 m)', values: { level: 'simple', D: 0.6096, t: 0.0127, d: 0.020, L: 0.15, R1: -0.05, R2: 0.10, epsLim: 0.06, depthLim: 0.06 } },
    { id: 'deep_repair', label: 'Deep dent (7% D), repair expected', values: { level: 'simple', D: 0.6096, t: 0.0127, d: 0.042672, L: 0.35, R1: 0.15, R2: 0.25, epsLim: 0.06, depthLim: 0.06 } }
  ];

  function dentSolve(inp) {
    var p = {}, k, i, w = [];
    for (k in DENT_DEFAULTS) { if (DENT_DEFAULTS.hasOwnProperty(k)) { p[k] = DENT_DEFAULTS[k]; } }
    if (inp) { for (k in inp) { if (inp.hasOwnProperty(k) && inp[k] !== undefined && inp[k] !== null && inp[k] !== '') { p[k] = inp[k]; } } }
    var nk = ['D', 't', 'd', 'L', 'R1', 'R2', 'epsLim', 'depthLim'];
    for (i = 0; i < nk.length; i++) {
      p[nk[i]] = Number(p[nk[i]]);
      if (!isFinite(p[nk[i]])) { return { ok: false, error: 'Input ' + nk[i] + ' must be a finite number.', warnings: [] }; }
    }
    function fail(m) { return { ok: false, error: m, warnings: [] }; }
    if (!(p.D > 0)) { return fail('Outside diameter D must be > 0.'); }
    if (!(p.t > 0)) { return fail('Wall thickness t must be > 0.'); }
    if (!(p.t < p.D / 2)) { return fail('Wall thickness t must be < D/2.'); }
    if (!(p.d >= 0)) { return fail('Dent depth d must be >= 0.'); }
    if (!(p.L > 0)) { return fail('Dent axial length L must be > 0.'); }
    if (p.R1 === 0) { return fail('Circumferential radius R1 must be non-zero.'); }
    if (!(p.R2 > 0)) { return fail('Longitudinal radius R2 must be > 0.'); }

    var R0 = p.D / 2;
    var eps1 = (p.t / 2) * (1 / R0 - 1 / p.R1);
    var eps2 = -(p.t / 2) / p.R2;
    var eps3 = 0.5 * Math.pow(p.d / p.L, 2);
    var c = 2 / Math.sqrt(3);
    var a = eps2 + eps3, b = -eps2 + eps3;
    var eps_i = c * Math.sqrt(Math.max(0, eps1 * eps1 + eps1 * a + a * a));
    var eps_o = c * Math.sqrt(Math.max(0, eps1 * eps1 - eps1 * b + b * b));
    var eps_max = Math.max(eps_i, eps_o);
    var governing = eps_i >= eps_o ? 'inside' : 'outside';
    var d_D = p.d / p.D;
    var strainPass = eps_max <= p.epsLim;
    var depthPass = d_D <= p.depthLim;

    if (p.d / p.L > 0.2) { w.push('d/L = ' + (p.d / p.L).toFixed(3) + ' > 0.2: longitudinal membrane strain is large; consider detailed (FEA) assessment.'); }
    if (p.R1 < 0) { w.push('R1 < 0: reversed (inward) circumferential curvature in the dent increases bending strain.'); }
    if (d_D > p.depthLim) { w.push('d/D = ' + (d_D * 100).toFixed(2) + '% exceeds plain-dent depth limit of ' + (p.depthLim * 100).toFixed(1) + '% D (ASME B31.8 851.4.1).'); }
    w.push('Not covered: dents containing gouges, cracks or metal loss, or dents affecting welds; these require separate assessment.');

    return {
      ok: true,
      warnings: w,
      R0: R0,
      eps1: eps1,
      eps2: eps2,
      eps3: eps3,
      eps_i: eps_i,
      eps_o: eps_o,
      eps_max: eps_max,
      governing: governing,
      d_D: d_D,
      strainPass: strainPass,
      depthPass: depthPass,
      verdict: (strainPass && depthPass) ? 'acceptable' : 'repair',
      breakdown: [
        { label: 'Circumferential bending strain eps1', value: eps1, unit: 'm/m' },
        { label: 'Longitudinal bending strain eps2', value: eps2, unit: 'm/m' },
        { label: 'Longitudinal membrane strain eps3', value: eps3, unit: 'm/m' },
        { label: 'Inside-surface equivalent strain eps_i', value: eps_i, unit: 'm/m' },
        { label: 'Outside-surface equivalent strain eps_o', value: eps_o, unit: 'm/m' },
        { label: 'Maximum equivalent strain eps_max (' + governing + ')', value: eps_max, unit: 'm/m' },
        { label: 'Dent depth ratio d/D', value: d_D, unit: '-' }
      ],
      standard: 'ASME B31.8-2022 App. R'
    };
  }

  var CP_DEFAULTS = {
    level: 'simple', D: 0.3239, Lp: 10000, tf: 25, icm: 0.05, icf: 0.05, a: 0.001, b: 0.0003,
    eps: 2000, u: 0.80, Ec: -0.80, Ea: -1.05, rho: 1.3, anodeMass: 150, anodeArea: 0.6
  };
  var CP_PRESETS = [
    { id: 'sediment_12in', label: '12 in pipeline buried in sediment (defaults)',
      values: { D: 0.3239, Lp: 10000, tf: 25, icm: 0.05, icf: 0.05, rho: 1.3, anodeMass: 150, anodeArea: 0.6 } },
    { id: 'seawater_24in', label: '24 in pipeline exposed to seawater',
      values: { D: 0.6496, Lp: 10000, tf: 25, icm: 0.07, icf: 0.09, rho: 0.3, anodeMass: 250, anodeArea: 1.1 } },
    { id: 'life_40y', label: '12 in pipeline, 40 years design life',
      values: { D: 0.3239, Lp: 10000, tf: 40, icm: 0.05, icf: 0.05, rho: 1.3, anodeMass: 200, anodeArea: 0.7 } },
    { id: 'flowline_8in', label: 'Short 8 in flowline, 2 km',
      values: { D: 0.2391, Lp: 2000, tf: 25, icm: 0.05, icf: 0.05, rho: 1.3, anodeMass: 60, anodeArea: 0.35 } }
  ];
  function cpSolve(inp) {
    var p = {}, k, i, v, w = [];
    inp = inp || {};
    for (k in CP_DEFAULTS) {
      if (CP_DEFAULTS.hasOwnProperty(k)) {
        p[k] = (inp[k] !== undefined && inp[k] !== null && inp[k] !== '') ? inp[k] : CP_DEFAULTS[k];
      }
    }
    var pos = ['D', 'Lp', 'tf', 'icm', 'icf', 'a', 'b', 'eps', 'u', 'rho', 'anodeMass', 'anodeArea'];
    for (i = 0; i < pos.length; i++) {
      v = Number(p[pos[i]]);
      if (!isFinite(v) || v <= 0) return { ok: false, error: 'Input ' + pos[i] + ' must be a positive number', warnings: [] };
      p[pos[i]] = v;
    }
    p.Ec = Number(p.Ec); p.Ea = Number(p.Ea);
    if (!isFinite(p.Ec) || !isFinite(p.Ea)) return { ok: false, error: 'Potentials Ec and Ea must be numeric', warnings: [] };
    if (p.Ec <= p.Ea) return { ok: false, error: 'Ec must be greater than Ea (positive driving voltage required)', warnings: [] };
    if (p.u > 1) return { ok: false, error: 'Utilization factor u must not exceed 1', warnings: [] };
    var Ac = Math.PI * p.D * p.Lp;
    var fcm = Math.min(1, p.a + 0.5 * p.b * p.tf);
    var fcf = Math.min(1, p.a + p.b * p.tf);
    var Icm = Ac * fcm * p.icm, Icf = Ac * fcf * p.icf;
    var M = Icm * p.tf * 8760 / (p.u * p.eps);
    var Nm = Math.max(1, Math.ceil(M / p.anodeMass));
    var Raf = 0.315 * p.rho / Math.sqrt(p.anodeArea);
    var dE = p.Ec - p.Ea, Iaf = dE / Raf;
    var Nc = Math.max(1, Math.ceil(Icf / Iaf));
    var N = Math.max(Nm, Nc), governing = Nm >= Nc ? 'mass' : 'current';
    var spacing = p.Lp / N;
    if (spacing > 300) w.push('Anode spacing ' + spacing.toFixed(0) + ' m exceeds about 300 m recommended by DNV-RP-F103 for bracelet anodes');
    if (fcf > 0.3) w.push('Final coating breakdown factor ' + fcf.toFixed(3) + ' > 0.3 suggests poor coating performance');
    w.push('Anode resistance is a simplified McCoy estimate (same area at end of life)');
    w.push('Check potential attenuation and field joint coating separately');
    return {
      ok: true, warnings: w, Ac: Ac, fcm: fcm, fcf: fcf, Icm: Icm, Icf: Icf, M: M, Nm: Nm, Nc: Nc, N: N,
      governing: governing, spacing: spacing, Raf: Raf, Iaf: Iaf, dE: dE,
      breakdown: [
        { label: 'Coated surface area Ac', value: Ac, unit: 'm2' },
        { label: 'Mean coating breakdown fcm', value: fcm, unit: '-' },
        { label: 'Final coating breakdown fcf', value: fcf, unit: '-' },
        { label: 'Mean current demand Icm', value: Icm, unit: 'A' },
        { label: 'Final current demand Icf', value: Icf, unit: 'A' },
        { label: 'Total net anode mass M', value: M, unit: 'kg' },
        { label: 'Anodes by mass Nm', value: Nm, unit: '-' },
        { label: 'Anode resistance Raf', value: Raf, unit: 'ohm' },
        { label: 'Driving voltage dE', value: dE, unit: 'V' },
        { label: 'Anode output Iaf', value: Iaf, unit: 'A' },
        { label: 'Anodes by current Nc', value: Nc, unit: '-' },
        { label: 'Number of anodes N (' + governing + ' governs)', value: N, unit: '-' },
        { label: 'Anode spacing', value: spacing, unit: 'm' }
      ],
      standard: 'DNV-RP-F103 / DNV-RP-B401 / ISO 15589-2'
    };
  }

  var CO2_DEFAULTS = { level: 'simple', T: 333.15, P: 50e5, yCO2: 0.02, U: 2.0, Dh: 0.3, life: 25, CA_avail: 0, Fcorr: 1 };
  var CO2_PRESETS = [
    { id: 'wet_gas', label: 'Wet gas (defaults): 60 C, 50 bar, 2% CO2, 2 m/s', values: { T: 333.15, P: 50e5, yCO2: 0.02, U: 2.0, Dh: 0.3, life: 25, CA_avail: 0, Fcorr: 1 } },
    { id: 'oil_line', label: 'Oil line: 80 C, 100 bar, 5% CO2, 1 m/s', values: { T: 353.15, P: 100e5, yCO2: 0.05, U: 1.0, Dh: 0.3, life: 25, CA_avail: 0, Fcorr: 1 } },
    { id: 'ccus_dense', label: 'CCUS dense phase with free water: 30 C, 100 bar, 95% CO2', values: { T: 303.15, P: 100e5, yCO2: 0.95, U: 2.0, Dh: 0.3, life: 25, CA_avail: 0, Fcorr: 1 } },
    { id: 'low_temp_gas', label: 'Low-temperature gas: 15 C, 70 bar, 1% CO2', values: { T: 288.15, P: 70e5, yCO2: 0.01, U: 2.0, Dh: 0.3, life: 25, CA_avail: 0, Fcorr: 1 } }
  ];
  function co2Solve(inp) {
    var k, i, d = {}, w = [];
    function fail(m) { return { ok: false, error: m, warnings: [] }; }
    function log10(x) { return Math.log(x) / Math.LN10; }
    for (k in CO2_DEFAULTS) { if (CO2_DEFAULTS.hasOwnProperty(k)) { d[k] = CO2_DEFAULTS[k]; } }
    if (inp) { for (k in inp) { if (inp.hasOwnProperty(k) && inp[k] !== undefined && inp[k] !== null && inp[k] !== '') { d[k] = inp[k]; } } }
    var nums = ['T', 'P', 'yCO2', 'U', 'Dh', 'life', 'CA_avail', 'Fcorr'];
    for (i = 0; i < nums.length; i++) {
      d[nums[i]] = Number(d[nums[i]]);
      if (!isFinite(d[nums[i]])) { return fail('Invalid numeric value for ' + nums[i]); }
    }
    if (d.T < 273.15 || d.T > 423.15) { return fail('Temperature must be between 273.15 and 423.15 K (0-150 C, NORSOK/dWM range)'); }
    if (d.P <= 0) { return fail('Total pressure must be > 0'); }
    if (d.yCO2 <= 0 || d.yCO2 > 1) { return fail('CO2 mole fraction must satisfy 0 < yCO2 <= 1'); }
    if (d.U < 0) { return fail('Flow velocity must be >= 0'); }
    if (d.Dh <= 0) { return fail('Hydraulic diameter must be > 0'); }
    if (d.life <= 0) { return fail('Design life must be > 0'); }
    if (d.CA_avail < 0 || d.CA_avail >= 1) { return fail('Inhibitor efficiency must satisfy 0 <= CA_avail < 1'); }
    if (d.Fcorr <= 0 || d.Fcorr > 1) { return fail('Correction factor must satisfy 0 < Fcorr <= 1'); }
    var Tk = d.T, Tc = Tk - 273.15, Pbar = d.P / 1e5, pCO2 = d.yCO2 * Pbar;
    var a = Math.pow(10, Pbar * (0.0031 - 1.4 / Tk)), fCO2 = a * pCO2;
    var V91 = Math.pow(10, 5.8 - 1710 / Tk + 0.67 * log10(fCO2));
    var den = 6.7 + 0.6 * log10(fCO2), Tscale = den > 0 ? 2400 / den : Infinity, Fscale = 1;
    if (Tk > Tscale) { Fscale = Math.min(1, Math.pow(10, 2400 / Tk - 2400 / Tscale)); }
    var V91s = V91 * Fscale;
    var Vr = Math.pow(10, 4.93 - 1119 / Tk + 0.58 * log10(pCO2)), Vm, V95;
    if (d.U === 0) {
      Vm = 0; V95 = 0;
      w.push('stagnant: flow model not applicable, 1991 model governs');
    } else {
      Vm = 2.45 * Math.pow(d.U, 0.8) / Math.pow(d.Dh, 0.2) * pCO2;
      V95 = 1 / (1 / Vr + 1 / Vm);
    }
    var V95s = V95 * Fscale;
    var governing = V91s >= V95s ? 'dWM 1991' : 'dWM 1995';
    var Vdes = Math.max(V91s, V95s) * d.Fcorr, Vinh = Vdes * (1 - d.CA_avail), CA = Vinh * d.life;
    var severity = Vinh < 0.1 ? 'low' : (Vinh < 1 ? 'medium' : (Vinh < 10 ? 'high' : 'very high'));
    if (CA > 6) { w.push('Corrosion allowance ' + CA.toFixed(1) + ' mm exceeds 6 mm: consider CRA or chemical inhibition'); }
    if (pCO2 > 10) { w.push('pCO2 = ' + pCO2.toFixed(1) + ' bar > 10 bar: outside de Waard-Milliams validity range'); }
    w.push('H2S, organic acids, top-of-line corrosion and pH buffering are not modelled');
    var breakdown = [
      { label: 'Temperature', value: Tc, unit: 'degC' },
      { label: 'CO2 partial pressure', value: pCO2, unit: 'bar' },
      { label: 'Fugacity coefficient', value: a, unit: '-' },
      { label: 'CO2 fugacity', value: fCO2, unit: 'bar' },
      { label: 'dWM 1991 base rate', value: V91, unit: 'mm/y' },
      { label: 'Scale temperature', value: Tscale, unit: 'K' },
      { label: 'Scale factor', value: Fscale, unit: '-' },
      { label: 'dWM 1991 scaled rate', value: V91s, unit: 'mm/y' },
      { label: 'Reaction-limited rate Vr', value: Vr, unit: 'mm/y' },
      { label: 'Mass-transfer rate Vm', value: Vm, unit: 'mm/y' },
      { label: 'dWM 1995 scaled rate', value: V95s, unit: 'mm/y' },
      { label: 'Design rate', value: Vdes, unit: 'mm/y' },
      { label: 'Inhibited rate', value: Vinh, unit: 'mm/y' },
      { label: 'Corrosion allowance', value: CA, unit: 'mm' }
    ];
    return { ok: true, warnings: w, Tc: Tc, pCO2: pCO2, fCO2: fCO2, a: a, V91: V91, Tscale: Tscale, Fscale: Fscale, V91s: V91s,
      Vr: Vr, Vm: Vm, V95: V95, V95s: V95s, Vdes: Vdes, Vinh: Vinh, CA: CA, CA_m: CA / 1000, governing: governing, severity: severity,
      breakdown: breakdown, standard: 'de Waard-Milliams 1991/1995 (NORSOK M-506 basis)' };
  }

  OGH.integrity = { VERSION: '0.2.0', tools: ['corrosion_defect_ffs'] };
  OGH.corrosion_defect_ffs = { solve: cdfSolve, defaults: CDF_DEFAULTS, presets: CDF_PRESETS,
    _internal: { b31g: b31g, b31gAllowableLength: b31gAllowableLength, dnvF101: dnvF101 } };
  if (typeof dentSolve === 'function') { OGH.dent_strain = { solve: dentSolve, defaults: DENT_DEFAULTS, presets: DENT_PRESETS }; OGH.integrity.tools.push('dent_strain'); }
  if (typeof cpSolve === 'function') { OGH.cathodic_protection = { solve: cpSolve, defaults: CP_DEFAULTS, presets: CP_PRESETS }; OGH.integrity.tools.push('cathodic_protection'); }
  if (typeof co2Solve === 'function') { OGH.co2_corrosion_rate = { solve: co2Solve, defaults: CO2_DEFAULTS, presets: CO2_PRESETS }; OGH.integrity.tools.push('co2_corrosion_rate'); }
  if (typeof module !== 'undefined' && module.exports) module.exports = OGH;
})(typeof window !== 'undefined' ? window : globalThis);
