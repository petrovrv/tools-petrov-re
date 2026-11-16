/* opt-gauss.js — Gaussian beam engine of tools.petrov.re Optics & Photonics (unit gauss).
 * Pure: no DOM, no strings for the screen. UMD → global OptGauss / module.exports.
 *
 * Conventions (stated once, used everywhere):
 *  - lengths in metres, angles in radians, λ0 = vacuum wavelength;
 *  - embedded Gaussian (Siegman, "Lasers", 1986, §17.1; ISO 11146-1): a real beam of quality M²
 *    behaves like a Gaussian of wavelength M²·λ0 — w(z)² = w0²[1 + ((z−z0)/zR)²], zR = π n w0² /(M² λ0);
 *  - reduced complex beam parameter q̂ = q/n (Siegman §15.2): 1/q̂ = n/R − i M² λ0/(π w²); in reduced form a
 *    plane interface is the identity and free space of length d in index n is [[1, d/n],[0, 1]];
 *  - transverse axes x (tangential, in the plane of a folded path) and y (sagittal) are independent
 *    (simple astigmatic beams); cylindrical lenses act on one axis, a curved mirror at incidence θ has
 *    f_x = f·cosθ, f_y = f/cosθ (Kogelnik & Li 1966; Siegman §21);
 *  - a curved mirror is unfolded into a thin lens of focal length f = R/2 (concave: f > 0);
 *  - f is the PHYSICAL focal length in the medium the element sits in (a collimated beam focuses a distance f
 *    behind it); in reduced form a thin lens in index n is [[1, 0],[−n/f, 1]] (review R-4, 0.3.0);
 *  - plates may overlap or contain lenses: the local index is that of the innermost (last entered) plate that is
 *    still open; overlapping plates raise the warning 'overlap' (review R-15, 0.3.0).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OptGauss = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.3.0';
  var PI = Math.PI;
  var C0 = 299792458;

  /* ---------------------------------------------------------------- complex */
  function cx(re, im) { return { re: re, im: im || 0 }; }
  function cadd(a, b) { return cx(a.re + b.re, a.im + b.im); }
  function csub(a, b) { return cx(a.re - b.re, a.im - b.im); }
  function cmul(a, b) { return cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
  function cdiv(a, b) { var d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); }
  function cinv(a) { return cdiv(cx(1, 0), a); }
  function cscale(a, s) { return cx(a.re * s, a.im * s); }
  function cexp(a) { var e = Math.exp(a.re); return cx(e * Math.cos(a.im), e * Math.sin(a.im)); }
  function csqrt(a) { var r = Math.hypot(a.re, a.im), t = Math.atan2(a.im, a.re) / 2, s = Math.sqrt(r); return cx(s * Math.cos(t), s * Math.sin(t)); }
  function cabs2(a) { return a.re * a.re + a.im * a.im; }
  function cconj(a) { return cx(a.re, -a.im); }

  /* ------------------------------------------------------- beam parameter */
  /* q̂ at distance dz = z − z0 from the waist, Rayleigh range zR (both physical lengths), index n */
  function qAtWaistOffset(dz, zR, n) { return cx(dz / n, zR / n); }
  function rayleigh(w0, lambda, M2, n) { return PI * (n || 1) * w0 * w0 / ((M2 || 1) * lambda); }
  /* w from q̂ (reduced), λ0, M² */
  function wOf(q, lambda, M2) {
    var iq = cinv(q);
    return Math.sqrt(-(M2 || 1) * lambda / (PI * iq.im));
  }
  /* wavefront radius R (physical, +∞ at a waist), index n */
  function ROf(q, n) {
    var iq = cinv(q);
    if (Math.abs(iq.re) < 1e-300) return Infinity;
    return (n || 1) / iq.re;
  }
  /* waist of the beam that has parameter q̂ here: distance to the waist (physical, + = waist lies downstream) and size */
  function waistOf(q, lambda, M2, n) {
    n = n || 1;
    var zR = q.im * n;                    // physical Rayleigh range
    var dzToWaist = -q.re * n;            // waist is where Re q̂ = 0
    var w0 = Math.sqrt((M2 || 1) * lambda * zR / (PI * n));
    return { w0: w0, zR: zR, dz: dzToWaist };
  }
  function abcd(M, q) {                   // q' = (A q + B)/(C q + D)
    return cdiv(cadd(cscale(q, M[0]), cx(M[1], 0)), cadd(cscale(q, M[2]), cx(M[3], 0)));
  }
  function mmul(a, b) {                   // a·b (b acts first)
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
  }
  var M_ID = [1, 0, 0, 1];
  function Mspace(d, n) { return [1, d / (n || 1), 0, 1]; }
  function Mlens(f) { return isFinite(f) && f !== 0 ? [1, 0, -1 / f, 1] : M_ID; }

  /* ---------------------------------------------------------- elements
   * element: { id, kind, z, f, t, n, aoi_deg, D, label }
   *  kind 'lens'   thin lens, focal length f (both axes)
   *       'cylx'   cylindrical thin lens acting on x only;  'cyly' on y only
   *       'mirror' curved mirror unfolded: focal length f (= R/2), angle of incidence aoi_deg (astigmatism)
   *       'slab'   plane-parallel plate / crystal of thickness t and index n starting at z
   *       'aperture' clear aperture only (no change of q)
   *  D: clear aperture diameter (optional, all kinds) → clipping check.
   */
  function focalFor(el, axis) {
    var f = Number(el.f);
    if (el.kind === 'lens') return f;
    if (el.kind === 'cylx') return axis === 'x' ? f : Infinity;
    if (el.kind === 'cyly') return axis === 'y' ? f : Infinity;
    if (el.kind === 'mirror') {
      var c = Math.cos((Number(el.aoi_deg) || 0) * PI / 180);
      return axis === 'x' ? f * c : f / c;
    }
    return Infinity;
  }
  function elementLength(el) { return el.kind === 'slab' ? Math.max(0, Number(el.t) || 0) : 0; }

  function sortElements(list) {
    return (list || []).map(function (e, i) { return Object.assign({ _i: i }, e); })
      .filter(function (e) { return isFinite(Number(e.z)); })
      .sort(function (a, b) { return a.z - b.z || a._i - b._i; });
  }

  /* -------------------------------------------------- propagate (core)
   * cfg: { lambda, n0, beam:{x:{w0,z0,M2}, y:{w0,z0,M2}}, elements:[…], zStart, zEnd, samples }
   * The source waist position z0 is measured in the medium n0 before the first element.
   * Returns sampled curves and per-segment waists. */
  function propagate(cfg) {
    var lam = cfg.lambda, n0 = cfg.n0 || 1;
    var els = sortElements(cfg.elements);
    var z0 = cfg.zStart, z1 = cfg.zEnd;
    var N = Math.max(50, Math.min(4000, cfg.samples || 600));
    var warnings = [];
    var out = { x: null, y: null, segments: [], at: [], warnings: warnings, elements: els };

    /* build segments: piecewise media between element planes */
    var bounds = [];                       // events along z: {z, type:'el'|'slabEnd', el}
    els.forEach(function (e) {
      bounds.push({ z: e.z, type: 'el', el: e });
      if (e.kind === 'slab' && elementLength(e) > 0) bounds.push({ z: e.z + elementLength(e), type: 'slabEnd', el: e });
    });
    bounds.sort(function (a, b) { return a.z - b.z || (a.type === 'slabEnd' ? -1 : 1); });

    ['x', 'y'].forEach(function (ax) {
      var b = cfg.beam[ax];
      var M2 = b.M2 || 1;
      var zR = rayleigh(b.w0, lam, M2, n0);
      var zc = Math.min(z0, b.z0, els.length ? els[0].z : z0);
      var q = qAtWaistOffset(zc - b.z0, zR, n0);   // q̂ at zc in medium n0
      var n = n0, zcur = zc;
      var segs = [];                                    // {zA, zB, qA, n, gouyA, cut}
      var gouy = 0, open = [], cut = null;
      function phaseOf(qq) { return Math.atan2(qq.re, qq.im); }   // arctan((z−zw)/zR)
      for (var k = 0; k <= bounds.length; k++) {
        var ev = bounds[k];
        var zNext = ev ? ev.z : Infinity;
        segs.push({ zA: zcur, zB: zNext, qA: q, n: n, gouyA: gouy, cut: cut });
        if (!ev) break;
        var d = zNext - zcur;
        var qEnd = abcd(Mspace(d, n), q);
        gouy += phaseOf(qEnd) - phaseOf(q);
        q = qEnd; zcur = zNext;
        cut = { id: ev.el.id, type: ev.type };
        if (ev.type === 'el') {
          q = abcd(Mlens(focalFor(ev.el, ax) / n), q);          // physical f in the local medium n
          if (ev.el.kind === 'slab' && elementLength(ev.el) > 0) {
            if (open.length && ax === 'x') warnings.push({ code: 'overlap', id: ev.el.id, with: open[open.length - 1].id });
            open.push(ev.el); n = Number(ev.el.n) || 1.5;
          }
        } else if (ev.type === 'slabEnd') {
          var oi = open.indexOf(ev.el); if (oi >= 0) open.splice(oi, 1);
          n = open.length ? (Number(open[open.length - 1].n) || 1.5) : n0;
        }
      }
      /* sampling */
      var zs = [], ws = [], Rs = [], gs = [];
      var si = 0;
      for (var i = 0; i <= N; i++) {
        var z = z0 + (z1 - z0) * i / N;
        while (si < segs.length - 1 && z >= segs[si].zB) si++;
        while (si > 0 && z < segs[si].zA) si--;
        var sg = segs[si];
        var qz = abcd(Mspace(z - sg.zA, sg.n), sg.qA);
        zs.push(z); ws.push(wOf(qz, lam, M2)); Rs.push(ROf(qz, sg.n));
        gs.push(sg.gouyA + phaseOf(qz) - phaseOf(sg.qA));
      }
      out[ax] = { z: zs, w: ws, R: Rs, gouy: gs, M2: M2, segs: segs };
    });

    /* per-segment waist table (x and y) */
    var sx = out.x.segs, sy = out.y.segs;
    for (var s = 0; s < sx.length; s++) {
      var row = { zA: sx[s].zA, zB: sx[s].zB, n: sx[s].n, cut: sx[s].cut };
      ['x', 'y'].forEach(function (ax) {
        var sg = out[ax].segs[s];
        var wst = waistOf(sg.qA, lam, out[ax].M2, sg.n);
        var zw = sg.zA + wst.dz;
        row[ax] = { w0: wst.w0, zR: wst.zR, z0: zw, inside: zw >= sg.zA - 1e-12 && zw <= sg.zB + 1e-12,
                    theta: wst.w0 > 0 ? out[ax].M2 * lam / (PI * sg.n * wst.w0) : NaN };
      });
      out.segments.push(row);
    }
    /* beam at each element plane (incoming side) + clipping */
    els.forEach(function (e) {
      var rec = { id: e.id, kind: e.kind, z: e.z };
      ['x', 'y'].forEach(function (ax) {
        var segs = out[ax].segs, j = 0;
        while (j < segs.length - 1 && !(e.z >= segs[j].zA && e.z <= segs[j].zB)) j++;
        var qz = abcd(Mspace(e.z - segs[j].zA, segs[j].n), segs[j].qA);
        rec['w' + ax] = wOf(qz, lam, out[ax].M2);
        rec['R' + ax] = ROf(qz, segs[j].n);
      });
      var D = Number(e.D);
      if (D > 0) {
        var a = D / 2;
        rec.clipT = clipTransmission(a, rec.wx, rec.wy);
        if (rec.clipT < 0.99) warnings.push({ code: 'clip', id: e.id, T: rec.clipT });
      }
      out.at.push(rec);
    });
    /* paraxial validity */
    out.segments.forEach(function (sg) {
      ['x', 'y'].forEach(function (ax) { if (sg[ax].theta > 0.25) warnings.push({ code: 'paraxial', theta: sg[ax].theta, axis: ax }); });
    });
    return out;
  }

  /* power through a circular aperture of radius a centred on an elliptical Gaussian (wx, wy)
     exact for wx = wy: 1 − exp(−2a²/w²); for wx ≠ wy a 64×64 polar quadrature */
  function clipTransmission(a, wx, wy) {
    if (Math.abs(wx - wy) <= 1e-9 * wx) return 1 - Math.exp(-2 * a * a / (wx * wx));
    var NR = 64, NT = 64, sum = 0;
    for (var i = 0; i < NR; i++) {
      var r = a * (i + 0.5) / NR;
      for (var j = 0; j < NT; j++) {
        var t = 2 * PI * (j + 0.5) / NT, x = r * Math.cos(t), y = r * Math.sin(t);
        sum += Math.exp(-2 * x * x / (wx * wx) - 2 * y * y / (wy * wy)) * r;
      }
    }
    return sum * (a / NR) * (2 * PI / NT) * 2 / (PI * wx * wy);
  }

  /* --------------------------------------------- focusing by a thin lens
   * Self, S. A. (1983) "Focusing of spherical Gaussian beams", Appl. Opt. 22(5) 658–661, eqs (9)–(11), with M²:
   *   s  = distance input waist → lens (positive in front of the lens), zR = Rayleigh range of the input
   *   1/(s + zR²/(s − f)) + 1/s'' = 1/f ;   m = 1/√((1 − s/f)² + (zR/f)²) ;  w0'' = m w0 ;  zR'' = m² zR
   * Far-field approximation for comparison: w0'' ≈ M² λ f /(π w_lens)  (w_lens = beam radius at the lens). */
  function focus(o) {
    var lam = o.lambda, M2 = o.M2 || 1, f = o.f, s = o.s, w0 = o.w0;
    var zR = rayleigh(w0, lam, M2, 1);
    var sp;
    if (Math.abs(s - f) < 1e-15) sp = f;
    else sp = 1 / (1 / f - 1 / (s + zR * zR / (s - f)));
    var m = 1 / Math.sqrt(Math.pow(1 - s / f, 2) + Math.pow(zR / f, 2));
    var wLens = w0 * Math.sqrt(1 + Math.pow(s / zR, 2));
    var approx = M2 * lam * f / (PI * wLens);
    return { s2: sp, m: m, w0: m * w0, zR: m * m * zR, wLens: wLens, approx: approx, zRin: zR,
             theta: M2 * lam / (PI * m * w0) };
  }

  /* ------------------------------------------ single-lens waist matching
   * Kogelnik & Li (1966) Appl. Opt. 5, 1550, eq. (36): to transform waist w1 into waist w2 with a lens f,
   *   f0 = π w1 w2 /(M² λ),  d1 = f ± (w1/w2)√(f² − f0²),  d2 = f ± (w2/w1)√(f² − f0²)  (same sign). */
  function kogelnik(o) {
    var lam = o.lambda, M2 = o.M2 || 1, f0 = PI * o.w1 * o.w2 / (M2 * lam);
    if (Math.abs(o.f) < f0) return { f0: f0, solutions: [] };
    var r = Math.sqrt(o.f * o.f - f0 * f0);
    return { f0: f0, solutions: [
      { d1: o.f + (o.w1 / o.w2) * r, d2: o.f + (o.w2 / o.w1) * r },
      { d1: o.f - (o.w1 / o.w2) * r, d2: o.f - (o.w2 / o.w1) * r } ] };
  }

  /* ----------------------------------------------- mode overlap (1 axis)
   * Overlap of two fundamental Gaussian fields on the same plane, per transverse axis:
   *   E_k(x) = exp(−i k x²/(2 q_k)),  E2 additionally shifted by d and tilted by θ.
   *   η = |∫E1 E2*|² / (∫|E1|² ∫|E2|²)  — closed form of the Gaussian integral.
   * q given as physical (not reduced) parameters in a medium of index n, k = 2π n/λ0.
   * With d = θ = 0 this reduces to η = 4 / ((w1/w2 + w2/w1)² + (π w1 w2/λ)²(1/R1 − 1/R2)²) per 2-D beam,
   * i.e. the square root of it per axis (Kogelnik 1964; Joyce & DeLoach 1984, Appl. Opt. 23, 4187). */
  function overlap1D(w1, R1, w2, R2, lambda, n, d, theta) {
    n = n || 1; d = d || 0; theta = theta || 0;
    var k = 2 * PI * n / lambda;
    // E(x) = exp(−x²/w² − i k x²/(2R)) ; a_k = 1/w² + i k/(2R)
    var a1 = cx(1 / (w1 * w1), isFinite(R1) ? k / (2 * R1) : 0);
    var a2 = cx(1 / (w2 * w2), isFinite(R2) ? k / (2 * R2) : 0);
    // E1 E2* = exp(−a1 x² − conj(a2)(x−d)² − i k θ x)
    var A = cadd(a1, cconj(a2));                                  // coefficient of x²
    var B = cadd(cscale(cconj(a2), 2 * d), cx(0, -k * theta));    // coefficient of x
    var Cc = cscale(cconj(a2), -d * d);
    // ∫exp(−A x² + B x + C) dx = √(π/A) exp(B²/(4A) + C)
    var I = cmul(csqrt(cdiv(cx(PI, 0), A)), cexp(cadd(cdiv(cmul(B, B), cscale(A, 4)), Cc)));
    var n1 = Math.sqrt(PI / 2) * w1, n2 = Math.sqrt(PI / 2) * w2;   // ∫|E|² = w √(π/2)
    return cabs2(I) / (n1 * n2);
  }
  /* coupling of a beam (wx,Rx,wy,Ry) into a circular fibre mode (wf, flat phase) at the fibre face,
     with lateral offset dx and tilt tx (in x) */
  function fibreCoupling(o) {
    var ex = overlap1D(o.wx, o.Rx, o.wf, Infinity, o.lambda, o.n || 1, o.dx || 0, o.tx || 0);
    var ey = overlap1D(o.wy, o.Ry, o.wf, Infinity, o.lambda, o.n || 1, o.dy || 0, o.ty || 0);
    return { eta: ex * ey, etaX: ex, etaY: ey };
  }
  /* textbook special cases at matched waists (Marcuse 1977 BSTJ 56, 703): used by tests and the learn text */
  function lateralLoss(w1, w2, d) { var s = w1 * w1 + w2 * w2; return Math.pow(2 * w1 * w2 / s, 2) * Math.exp(-2 * d * d / s); }

  /* ------------------------------------------------- ISO 11146 fit
   * Hyperbolic fit of second-moment radii (ISO 11146-1:2021 §9): least squares of w² = a + b z + c z²
   * (radii w = d/2, d = D4σ diameters). w0² = a − b²/(4c), z0 = −b/(2c), θ = √c, M² = π w0 θ / λ. */
  function fitHyperbola(points, lambda) {
    var P = (points || []).filter(function (p) { return isFinite(p.z) && isFinite(p.w) && p.w > 0; });
    if (P.length < 3) return { ok: false, reason: 'points' };
    var S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Y = [0, 0, 0];
    P.forEach(function (p) {
      var v = [1, p.z, p.z * p.z], y = p.w * p.w;
      for (var i = 0; i < 3; i++) { Y[i] += v[i] * y; for (var j = 0; j < 3; j++) S[i][j] += v[i] * v[j]; }
    });
    var sol = solve3(S, Y);
    if (!sol) return { ok: false, reason: 'singular' };
    var a = sol[0], b = sol[1], c = sol[2];
    if (!(c > 0)) return { ok: false, reason: 'curvature' };
    var w02 = a - b * b / (4 * c);
    if (!(w02 > 0)) return { ok: false, reason: 'waist' };
    var w0 = Math.sqrt(w02), z0 = -b / (2 * c), th = Math.sqrt(c), M2 = PI * w0 * th / lambda;
    var zR = w0 / th, rss = 0;
    P.forEach(function (p) { var m = Math.sqrt(a + b * p.z + c * p.z * p.z); rss += (p.w - m) * (p.w - m); });
    var inNear = P.filter(function (p) { return Math.abs(p.z - z0) <= zR; }).length;
    var inFar = P.filter(function (p) { return Math.abs(p.z - z0) >= 2 * zR; }).length;
    return { ok: true, w0: w0, z0: z0, theta: th, M2: M2, zR: zR, rms: Math.sqrt(rss / P.length), n: P.length,
             isoNear: inNear, isoFar: inFar, isoOk: P.length >= 10 && inNear >= 5 && inFar >= 5 };
  }
  function solve3(A, y) {
    var M = A.map(function (r, i) { return r.concat([y[i]]); });
    for (var c = 0; c < 3; c++) {
      var p = c;
      for (var r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return null;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      for (var r2 = 0; r2 < 3; r2++) if (r2 !== c) {
        var fct = M[r2][c] / M[c][c];
        for (var k = c; k < 4; k++) M[r2][k] -= fct * M[c][k];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }

  /* --------------------------------------------- two-mirror resonator
   * Kogelnik & Li (1966) §3, Siegman ch. 19: g_i = 1 − L/R_i (R > 0 concave, R = ∞ flat),
   * stable for 0 ≤ g1 g2 ≤ 1;  w0⁴ = (λL/π)² g1 g2 (1 − g1 g2)/(g1 + g2 − 2 g1 g2)²,
   * waist at z1 = L g2 (1 − g1)/(g1 + g2 − 2 g1 g2) from mirror 1, w1⁴ = (λL/π)² g2 /(g1 (1 − g1 g2)),
   * transverse mode spacing Δν_T = FSR · arccos(±√(g1 g2))/π (sign of g1), FSR = c/(2 n L). */
  function cavity(o) {
    var lam = o.lambda, L = o.L, n = o.n || 1;
    var g1 = isFinite(o.R1) ? 1 - L / o.R1 : 1, g2 = isFinite(o.R2) ? 1 - L / o.R2 : 1;
    var G = g1 * g2, den = g1 + g2 - 2 * G;
    var confocal = Math.abs(g1) < 1e-12 && Math.abs(g2) < 1e-12;   // symmetric confocal: on the boundary but stable
    var r = { g1: g1, g2: g2, G: G, stable: (G > 0 && G < 1) || confocal, FSR: C0 / (2 * n * L) };
    var lamN = lam / n;                    // wavelength in the medium filling the cavity
    if (confocal) {
      r.w0 = Math.sqrt(lamN * L / (2 * PI)); r.z1 = L / 2; r.w1 = r.w2 = Math.sqrt(lamN * L / PI);
      r.zR = L / 2; r.gouyRT = PI; r.dnuT = r.FSR / 2;
    } else if (r.stable && Math.abs(den) > 1e-15) {
      r.w0 = Math.sqrt((lamN * L / PI) * Math.sqrt(G * (1 - G) / (den * den)));
      r.z1 = L * g2 * (1 - g1) / den;
      r.w1 = Math.sqrt((lamN * L / PI) * Math.sqrt(g2 / (g1 * (1 - G))));
      r.w2 = Math.sqrt((lamN * L / PI) * Math.sqrt(g1 / (g2 * (1 - G))));
      r.zR = PI * r.w0 * r.w0 / lamN;
      var acos = Math.acos(Math.sqrt(G));
      r.gouyRT = 2 * (g1 >= 0 ? acos : PI - acos);   // round-trip Gouy phase
      r.dnuT = r.FSR * r.gouyRT / (2 * PI);
    }
    return r;
  }
  /* eigen-q of a round trip M (reduced), for cross-checks: q = (A − D ± √((A−D)² + 4BC))/(2C), Im q > 0 */
  function eigenQ(M) {
    var A = M[0], B = M[1], C = M[2], D = M[3];
    if (Math.abs(C) < 1e-300) return null;
    var disc = (A - D) * (A - D) + 4 * B * C;
    if (disc >= 0) return null;
    var q = cx((A - D) / (2 * C), Math.sqrt(-disc) / (2 * Math.abs(C)));
    return q;
  }

  /* --------------------------------------------- mode matching solver
   * Two thin lenses (focal lengths from a list) placed at x1 < x2 between zMin and zMax turn the
   * input beam into the target waist (w2 at z2). Unknowns x1, x2; residual
   *   F = ( ln(w_out/w_target), (z_out − z_target)/zR_target ).
   * Coarse grid in (x1, x2), Newton refinement, deduplication; ranked by mode-matching efficiency η
   * at the target plane, then by total length. Single-lens solutions (Kogelnik & Li) are reported too.
   * opts: { lambda, M2, n0, inW0, inZ0, tW0, tZ0, focals:[{f,label}], zMin, zMax, minGap, grid, max } */
  function beamAfter(lam, M2, inW0, inZ0, lenses) {
    var zR = rayleigh(inW0, lam, M2, 1);
    var z = lenses[0].z, q = qAtWaistOffset(z - inZ0, zR, 1);
    for (var i = 0; i < lenses.length; i++) {
      if (i) { q = abcd(Mspace(lenses[i].z - z, 1), q); z = lenses[i].z; }
      q = abcd(Mlens(lenses[i].f), q);
    }
    var w = waistOf(q, lam, M2, 1);
    return { w0: w.w0, z0: z + w.dz, zR: w.zR, q: q, zLast: z };
  }
  function matchEfficiency(lam, M2, a, b) {
    /* η of two Gaussians described by their waists (w0, z0), evaluated on any common plane (z = b.z0) */
    var zRa = rayleigh(a.w0, lam, M2, 1);
    var qa = qAtWaistOffset(b.z0 - a.z0, zRa, 1);
    var wa = wOf(qa, lam, M2), Ra = ROf(qa, 1);
    var e = overlap1D(wa, Ra, b.w0, Infinity, lam * M2, 1, 0, 0);
    return e * e;                                   // both axes
  }
  function modeMatch(o) {
    /* Complete search through the INTERMEDIATE waist w_m between the lenses: lens 1 maps (w_in → w_m) and lens 2
       maps (w_m → w_target), each by Kogelnik & Li eq. (36) with branch signs s1, s2; the total path
       z_in + d1 + d1' + d2 + d3 must equal z_target. w_m is scanned on a log grid, roots are bisected, and every
       candidate is re-propagated with the ABCD law before it is accepted. */
    var lam = o.lambda, M2 = o.M2 || 1, w1 = o.inW0, w2 = o.tW0, z1 = o.inZ0, z2 = o.tZ0;
    var zMin = o.zMin, gap = o.minGap || 0, hi = Math.min(o.zMax, z2);
    var N = o.grid || 1500, maxSol = o.max || 12, focals = (o.focals || []).slice(0, 64), sols = [];
    var k = PI / (M2 * lam);
    for (var a = 0; a < focals.length; a++) for (var c = 0; c < focals.length; c++) {
      var f1 = focals[a].f, f2 = focals[c].f;
      var wmMax = Math.min(Math.abs(f1) / (k * w1), Math.abs(f2) / (k * w2));
      for (var s1 = 1; s1 >= -1; s1 -= 2) for (var s2 = 1; s2 >= -1; s2 -= 2) {
        var geo = function (wm) {
          var r1 = Math.sqrt(Math.max(0, f1 * f1 - Math.pow(k * w1 * wm, 2))), r2 = Math.sqrt(Math.max(0, f2 * f2 - Math.pow(k * wm * w2, 2)));
          var x1 = z1 + f1 + s1 * (w1 / wm) * r1;
          var x2 = x1 + f1 + s1 * (wm / w1) * r1 + f2 + s2 * (wm / w2) * r2;
          return [x1, x2, x2 + f2 + s2 * (w2 / wm) * r2 - z2];
        };
        var prevW = null, prevG = null;
        for (var i = 0; i <= N; i++) {
          var wm = wmMax * Math.pow(10, -6 + 6 * i / N), g = geo(wm)[2];
          if (prevW !== null && isFinite(g) && isFinite(prevG) && (g === 0 || (g > 0) !== (prevG > 0))) {
            var lo = prevW, hiW = wm, glo = prevG;
            for (var it = 0; it < 64; it++) {               // the log grid brackets the root; 64 halvings reach double precision
              var mid = Math.sqrt(lo * hiW), gm = geo(mid)[2];
              if ((gm > 0) === (glo > 0)) { lo = mid; glo = gm; } else hiW = mid;
            }
            var X = geo(Math.sqrt(lo * hiW));
            if (Math.abs(X[2]) < 1e-9 && X[0] >= zMin - 1e-9 && X[1] <= hi + 1e-9 && X[1] - X[0] >= gap - 1e-9) {
              var bt = beamAfter(lam, M2, w1, z1, [{ z: X[0], f: f1 }, { z: X[1], f: f2 }]);
              var okB = Math.abs(bt.w0 / w2 - 1) < 1e-6 && Math.abs(bt.z0 - z2) < 1e-6 * Math.max(1, rayleigh(w2, lam, M2, 1));
              var dup = sols.some(function (s) { return s.f1 === f1 && s.f2 === f2 && Math.abs(s.x1 - X[0]) < 1e-7 && Math.abs(s.x2 - X[1]) < 1e-7; });
              if (okB && !dup) {
                var bs = beamAfter(lam, M2, w1, z1, [{ z: X[0], f: f1 }, { z: X[1] + 1e-3, f: f2 }]);
                var b1 = beamAfter(lam, M2, w1, z1, [{ z: X[0] + 1e-3, f: f1 }, { z: X[1], f: f2 }]);
                sols.push({ f1: f1, f2: f2, l1: focals[a].label, l2: focals[c].label, x1: X[0], x2: X[1], sep: X[1] - X[0], length: z2 - X[0], wm: Math.sqrt(lo * hiW),
                            eta: 1, eta1mm: matchEfficiency(lam, M2, { w0: bs.w0, z0: bs.z0 }, { w0: w2, z0: z2 }),
                            eta1mmL1: matchEfficiency(lam, M2, { w0: b1.w0, z0: b1.z0 }, { w0: w2, z0: z2 }),
                            kind: (f1 > 0 && f2 > 0) ? 'kepler' : ((f1 < 0) !== (f2 < 0) ? 'galileo' : 'other') });
              }
            }
          }
          prevW = wm; prevG = g;
        }
      }
    }
    /* rank: alignment tolerance = the worse of "lens 1 +1 mm" and "lens 2 +1 mm", in steps of 0.1 %, then the shorter path */
    sols.forEach(function (s) { s.etaTol = Math.min(s.eta1mm, s.eta1mmL1); });
    sols.sort(function (p, q) { return (Math.round(q.etaTol * 1000) - Math.round(p.etaTol * 1000)) || (p.length - q.length); });
    return o.all ? sols : sols.slice(0, maxSol);
  }

  /* ------------------------------------------------- beam expander list
   * Afocal telescopes from a focal-length list: Keplerian (f1, f2 > 0, L = f1 + f2, image inverted,
   * internal focus) and Galilean (f1 < 0 < f2, L = f2 − |f1|, no internal focus). M = −f2/f1. */
  function expanders(o) {
    var out = [], F = o.focals || [], M = o.M;
    F.forEach(function (a) { F.forEach(function (b) {
      if (a.f === b.f) return;
      var mag = -b.f / a.f, L = a.f + b.f;
      if (!(L > 0) || Math.abs(mag) < 1) return;
      if (a.f > 0 && b.f > 0) out.push({ f1: a.f, f2: b.f, l1: a.label, l2: b.label, M: Math.abs(mag), L: L, kind: 'kepler', err: Math.abs(mag) / Math.abs(M) - 1 });
      else if (a.f < 0 && b.f > 0) out.push({ f1: a.f, f2: b.f, l1: a.label, l2: b.label, M: Math.abs(mag), L: L, kind: 'galileo', err: Math.abs(mag) / Math.abs(M) - 1 });
    }); });
    out.sort(function (p, q) { return Math.abs(p.err) - Math.abs(q.err) || p.L - q.L; });
    return out.slice(0, o.max || 10);
  }

  /* typical catalogue focal lengths (mm) used when the stock catalogue of opt-core.js is absent.
     Plain values, no part numbers: learning_assumption — a round-number series in which most vendors
     offer N-BK7 singlets. */
  var FOCALS_FALLBACK_MM = [-200, -150, -100, -75, -50, -40, -30, -25, -20, -15, 15, 20, 25, 30, 35, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000];

  return {
    VERSION: VERSION, C0: C0,
    cx: cx, cinv: cinv, abcd: abcd, mmul: mmul, Mspace: Mspace, Mlens: Mlens,
    rayleigh: rayleigh, qAtWaistOffset: qAtWaistOffset, wOf: wOf, ROf: ROf, waistOf: waistOf,
    focalFor: focalFor, sortElements: sortElements, propagate: propagate, clipTransmission: clipTransmission,
    focus: focus, kogelnik: kogelnik, overlap1D: overlap1D, fibreCoupling: fibreCoupling, lateralLoss: lateralLoss,
    fitHyperbola: fitHyperbola, cavity: cavity, eigenQ: eigenQ,
    beamAfter: beamAfter, matchEfficiency: matchEfficiency, modeMatch: modeMatch, expanders: expanders,
    FOCALS_FALLBACK_MM: FOCALS_FALLBACK_MM
  };
});
