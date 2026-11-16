/* opt-lens.js — OptLens: sequential lens design engine of lensdesign.html (tools.petrov.re, optics package).
   Pure module (no DOM), UMD: browser global OptLens, node require('./opt-lens.js'). Needs OptCore (opt-core.js) for glass indices.
   Units: mm, wavelengths in nm, field angles in degrees. Light travels along +z; R > 0 = centre of curvature to the right.
   Methods: paraxial y–u trace and Seidel sums after W. T. Welford, Aberrations of Optical Systems (1986) ch. 7–8;
   real rays by vector refraction (Snell) on conic + even-asphere surfaces (Spencer & Murty 1962 style iteration);
   wavefront OPD on the reference sphere about the chief-ray image point; PSF / MTF from the pupil function (Goodman, Fourier Optics, ch. 6);
   optimiser = damped least squares (Levenberg–Marquardt) on curvatures and thicknesses (Kingslake & Johnson, Lens Design Fundamentals, ch. 14). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./opt-core.js'));
  else root.OptLens = factory(root.OptCore);
})(typeof self !== 'undefined' ? self : this, function (OptCore) {
  'use strict';
  var VERSION = '1.1.0';
  var LIM = { surfaces: 40, fields: 6, wl: 5, grid: 41, nPupil: 64 };
  var LINES = { F: 486.1327, d: 587.5618, C: 656.2725, e: 546.074, g: 435.8343 };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isAir(m) { return m == null || m === '' || /^air$/i.test(m) || /^vacuum$/i.test(m); }
  /* index of a medium; air = 1 (lens-design convention: indices relative to air) */
  function nOf(m, nm) {
    if (typeof m === 'number') return m;
    if (m && typeof m === 'object') return nOf(m.base, nm) + (m.dn || 0);   /* perturbed glass (tolerancing): dispersion kept, index offset */
    if (isAir(m)) return 1;
    var v = OptCore.n(m, nm / 1000);
    if (!isFinite(v)) throw new Error('unknown material ' + m);
    return v;
  }
  function curv(s) { return isNum(s.c) ? s.c : (s.R == null || !isFinite(s.R) || s.R === 0 ? 0 : 1 / s.R); }

  /* ------------------------------------------------------------ system normalisation */
  /* sys: {surfaces:[{R|c, t, material, sd, k, A:[A4,A6,A8,A10], stop}], object:{inf:true}|{dist}, aperture:{kind:'epd'|'fno'|'na', value},
          fields:[…] (deg for infinite object, object height mm for finite), wl:[nm…], primary: index, image:'paraxial'|'fixed'|'best'} */
  function normalize(sys) {
    var S = {
      surfaces: (sys.surfaces || []).map(function (s) {
        return { c: curv(s), t: isNum(s.t) ? s.t : 0, material: isAir(s.material) ? 'air' : s.material, sd: isNum(s.sd) && s.sd > 0 ? s.sd : null,
                 k: isNum(s.k) ? s.k : 0, A: Array.isArray(s.A) ? s.A.map(function (a) { return isNum(a) ? a : 0; }) : [], stop: !!s.stop };
      }),
      inf: !sys.object || sys.object.inf !== false && !isNum(sys.object.dist),
      objDist: sys.object && isNum(sys.object.dist) ? sys.object.dist : Infinity,
      aperture: sys.aperture || { kind: 'epd', value: 10 },
      fields: (sys.fields && sys.fields.length ? sys.fields : [0]).slice(0, LIM.fields),
      wl: (sys.wl && sys.wl.length ? sys.wl : [LINES.F, LINES.d, LINES.C]).slice(0, LIM.wl),
      primary: isNum(sys.primary) ? sys.primary : 1,
      image: sys.image || 'paraxial'
    };
    if (S.primary >= S.wl.length) S.primary = Math.floor(S.wl.length / 2);
    if (!S.surfaces.length) throw new Error('no surfaces');
    if (S.surfaces.length > LIM.surfaces) throw new Error('too many surfaces');
    var st = S.surfaces.findIndex(function (s) { return s.stop; });
    S.stop = st < 0 ? 0 : st;
    if (!S.inf && !(S.objDist > 0)) throw new Error('object distance must be positive');
    /* every glass at every wavelength inside the range of its dispersion data (no silent extrapolation, e.g. N-BK7 at 10.6 µm) */
    S.surfaces.forEach(function (s, i) {
      var m = s.material && typeof s.material === 'object' ? s.material.base : s.material;
      if (isAir(m) || typeof m === 'number') return;
      S.wl.forEach(function (nm) {
        if (!isFinite(OptCore.n(m, nm / 1000))) throw new Error('unknown material ' + m);
        if (!OptCore.inRange(m, nm / 1000)) {
          var g = glassOf(m), e = new Error('wavelength outside glass data: ' + m + ' at ' + nm + ' nm');
          e.code = 'range'; e.surface = i; e.material = m; e.nm = nm; e.range_um = g && g.range_um ? g.range_um.slice() : null;
          throw e;
        }
      });
    });
    S.__norm = true;
    return S;
  }
  function glassOf(m) { return OptCore.glass ? OptCore.glass(m) : (OptCore.GLASS && OptCore.GLASS[m]); }
  /* common valid wavelength range (nm) of all glasses of the system */
  function validRange(sys) {
    var S = sys.__norm ? sys : normalize(sys), lo = 0, hi = Infinity;
    S.surfaces.forEach(function (s) {
      var m = s.material && typeof s.material === 'object' ? s.material.base : s.material;
      if (isAir(m) || typeof m === 'number') return;
      var g = glassOf(m);
      if (g && g.range_um) { lo = Math.max(lo, g.range_um[0] * 1000); hi = Math.min(hi, g.range_um[1] * 1000); }
    });
    return [lo, hi];
  }
  function indices(S, nm) {
    var n = [1];
    S.surfaces.forEach(function (s) { n.push(nOf(s.material, nm)); });
    return n; /* n[i] = medium before surface i (n[0] object space), n[i+1] after */
  }

  /* ------------------------------------------------------------ paraxial */
  /* trace a paraxial ray (y, u in object space at surface 0) through surfaces; returns rows {y, u (before), u2 (after), n, n2} */
  function ytrace(S, n, y, u) {
    var rows = [];
    for (var i = 0; i < S.surfaces.length; i++) {
      var s = S.surfaces[i], n1 = n[i], n2 = n[i + 1];
      var u2 = (n1 * u - y * s.c * (n2 - n1)) / n2;
      rows.push({ y: y, u: u, u2: u2, n: n1, n2: n2, c: s.c });
      if (i < S.surfaces.length - 1) y = y + s.t * u2;
      u = u2;
    }
    return rows;
  }
  function paraxial(sys, nm) {
    var S = sys.__norm ? sys : normalize(sys);
    nm = nm || S.wl[S.primary];
    var n = indices(S, nm), last = S.surfaces.length - 1;
    var a = ytrace(S, n, 1, 0), b = ytrace(S, n, 0, 1);
    var ra = a[last], rb = b[last];
    var phi = -ra.u2 * n[last + 1];                   /* system power from the collimated ray (y=1) */
    var efl = phi !== 0 ? 1 / phi : Infinity;
    var bfl = ra.u2 !== 0 ? -ra.y / ra.u2 : Infinity;  /* last vertex to rear focal point */
    /* front focal distance: ray from the left with y such that it exits parallel; use reversed solve via the b ray */
    var ffl = (function () {
      /* object-space ray (y0=?, u0) at surface 0 exiting with u2 = 0: y0*a.u2 + u0*b.u2 = 0 -> take u0 = 1, y0 = -b.u2/a.u2; FFL = y0/u0 (distance of crossing in front) */
      if (ra.u2 === 0) return Infinity;
      var y0 = -rb.u2 / ra.u2; return y0; })();
    /* entrance pupil (paraxial image of the stop in object space), z from surface 0 */
    var ya = a[S.stop].y, yb = b[S.stop].y;
    /* chief ray through the stop centre: y0 * ya + u0 * yb = 0 -> with u0 = 1: y0 = -yb/ya; it crosses the axis at z = -y0/u0 = yb/ya */
    var zEP = ya !== 0 ? yb / ya : Infinity;
    var ap = S.aperture, epd, uM0 = 0, yM0, objNA = null;
    if (S.inf) {
      epd = ap.kind === 'fno' ? Math.abs(efl) / ap.value : (ap.kind === 'epd' ? ap.value : Math.abs(efl) / 4);
      yM0 = epd / 2;
    } else {
      var L = S.objDist;
      if (ap.kind === 'na') { uM0 = Math.tan(Math.asin(Math.min(0.95, ap.value))); epd = 2 * uM0 * (L + zEP); }
      else if (ap.kind === 'epd') { epd = ap.value; uM0 = (epd / 2) / (L + zEP); }
      else { epd = Math.abs(efl) / ap.value; uM0 = (epd / 2) / (L + zEP); }
      yM0 = uM0 * L; objNA = Math.sin(Math.atan(uM0));
    }
    var marg = ytrace(S, n, yM0, uM0);
    var fmax = Math.max.apply(null, S.fields.map(Math.abs)) || 0;
    var uC0, yC0;
    if (S.inf) { uC0 = Math.tan(fmax * Math.PI / 180); yC0 = -uC0 * zEP; }
    else { uC0 = -fmax / (S.objDist + zEP); yC0 = fmax + uC0 * S.objDist; }
    var chief = ytrace(S, n, yC0, uC0);
    var mk = marg[last], ck = chief[last];
    var imgDist = mk.u2 !== 0 ? -mk.y / mk.u2 : Infinity;    /* paraxial image distance after the last surface */
    var H = n[0] * (uC0 * yM0 - uM0 * yC0);                    /* Lagrange invariant */
    var nImg = n[last + 1], uImg = mk.u2;
    var hImg = ck.y + imgDist * ck.u2;                         /* paraxial image height (max field) */
    /* exit pupil from the last surface: a paraxial ray through the stop centre (independent of the field size) */
    var pr = ytrace(S, n, isFinite(zEP) ? -0.01 * zEP : 0, isFinite(zEP) ? 0.01 : 0)[last];
    var zXP = pr.u2 !== 0 ? -pr.y / pr.u2 : Infinity;
    var xpd = 2 * Math.abs(mk.y + zXP * mk.u2);
    var mag = S.inf ? 0 : n[0] * uM0 / (n[last + 1] * mk.u2);            /* lateral magnification (Lagrange) */
    /* Petzval sum and radius */
    var petz = 0;
    for (var i = 0; i <= last; i++) { var s = S.surfaces[i]; petz += s.c * (n[i + 1] - n[i]) / (n[i] * n[i + 1]); }
    var fnoW = Math.abs(1 / (2 * nImg * Math.sin(Math.atan(uImg))));
    return { nm: nm, n: n, efl: efl, power: phi, bfl: bfl, ffl: ffl, zEP: zEP, epd: epd, zXP: zXP, xpd: xpd, imgDist: imgDist,
             fno: S.inf ? Math.abs(efl) / epd : null, fnoW: fnoW, naImg: Math.abs(nImg * Math.sin(Math.atan(uImg))), naObj: objNA, H: H, hImg: hImg,
             mag: mag, petzval: petz, petzR: petz !== 0 ? -1 / (petz * nImg) : Infinity, marg: marg, chief: chief, uM0: uM0, yM0: yM0, uC0: uC0, yC0: yC0,
             fmax: fmax, totalTrack: S.surfaces.slice(0, last).reduce(function (q, s) { return q + s.t; }, 0) };
  }
  /* image distance chosen by sys.image: paraxial focus of the primary wavelength, the user's last thickness, or best RMS focus */
  function withImage(S) {
    var P = paraxial(S), last = S.surfaces.length - 1;
    if (S.image === 'paraxial') S.surfaces[last].t = P.imgDist;
    else if (S.image === 'best') {
      S.surfaces[last].t = P.imgDist;
      var dz = bestFocus(S, P);
      if (isFinite(dz)) S.surfaces[last].t = P.imgDist + dz;
    }
    return P;
  }

  /* ------------------------------------------------------------ Seidel sums (Welford) */
  function seidel(sys) {
    var S = sys.__norm ? sys : normalize(sys);
    var P = paraxial(S), wF = LINES.F, wC = LINES.C, prim = S.wl[S.primary];
    if (S.wl.length >= 2) { wF = Math.min.apply(null, S.wl); wC = Math.max.apply(null, S.wl); }
    var nF = indices(S, wF), nC = indices(S, wC), n = P.n, H = P.H;
    var rows = [], tot = { SI: 0, SII: 0, SIII: 0, SIV: 0, SV: 0, CI: 0, CII: 0 };
    for (var i = 0; i < S.surfaces.length; i++) {
      var s = S.surfaces[i], m = P.marg[i], ch = P.chief[i];
      var n1 = n[i], n2 = n[i + 1], c = s.c;
      var A = n1 * (m.u + m.y * c), Ab = n1 * (ch.u + ch.y * c);
      var dun = m.u2 / n2 - m.u / n1, d1n = 1 / n2 - 1 / n1;
      var SI = -A * A * m.y * dun, SII = -A * Ab * m.y * dun, SIII = -Ab * Ab * m.y * dun, SIV = -H * H * c * d1n;
      /* S_V = (Ā/A)(S_III + S_IV) rewritten with H = hĀ − h̄A so that it stays finite when A = 0 (marginal ray normal to the surface) */
      var SV = -Ab * Ab * Ab * m.y * (1 / (n2 * n2) - 1 / (n1 * n1)) + Ab * c * d1n * ch.y * (2 * m.y * Ab - ch.y * A);
      /* aspheric / conic part: fourth-order sag coefficient beyond the sphere = k c^3/8 + A4 */
      var a4 = s.k * c * c * c / 8 + (s.A[0] || 0);
      if (a4 !== 0) {
        var dS = 8 * a4 * Math.pow(m.y, 4) * (n2 - n1), r = m.y !== 0 ? ch.y / m.y : 0;
        SI += dS; SII += dS * r; SIII += dS * r * r; SV += dS * r * r * r;
      }
      var dn1 = nF[i] - nC[i], dn2 = nF[i + 1] - nC[i + 1];
      var CI = A * m.y * (dn2 / n2 - dn1 / n1), CII = Ab * m.y * (dn2 / n2 - dn1 / n1);
      var row = { i: i, SI: SI, SII: SII, SIII: SIII, SIV: SIV, SV: SV, CI: CI, CII: CII };
      rows.push(row);
      Object.keys(tot).forEach(function (k) { tot[k] += row[k]; });
    }
    /* third-order transverse aberrations at the image (Welford 8.x): divide by -2 n' u' (TSA) etc. */
    var last = S.surfaces.length - 1, nk = n[last + 1], uk = P.marg[last].u2;
    var lam = prim * 1e-6;
    return { rows: rows, total: tot, H: H, nImg: nk, uImg: uk,
             waves: { W040: tot.SI / 8 / lam, W131: tot.SII / 2 / lam, W222: tot.SIII / 2 / lam, W220: (tot.SIII + tot.SIV) / 4 / lam, W311: tot.SV / 2 / lam },
             transverse: { TSA: tot.SI / (2 * nk * uk), coma: tot.SII / (2 * nk * uk), TAch: tot.CI / (nk * uk), TLat: tot.CII / (nk * uk) },
             longitudinal: { LSA: -tot.SI / (2 * nk * uk * uk), LAch: -tot.CI / (nk * uk * uk) } };
  }

  /* ------------------------------------------------------------ real rays */
  function sag(s, r2) {
    var c = s.c, q = 1 - (1 + s.k) * c * c * r2;
    if (q < 0) return NaN;
    var z = c * r2 / (1 + Math.sqrt(q)), p = r2 * r2;
    for (var j = 0; j < s.A.length; j++) { z += s.A[j] * p; p *= r2; }
    return z;
  }
  function normalAt(s, x, y) {
    /* gradient of F = z - sag(r): (-dz/dx, -dz/dy, 1) */
    var r2 = x * x + y * y, c = s.c, q = 1 - (1 + s.k) * c * c * r2;
    var dzdr2 = q > 0 ? c / (2 * Math.sqrt(q)) * (1 + 0) : NaN;
    /* exact: z = c r2/(1+sqrt(q)); dz/dr2 = c / (2 sqrt(q)) * ... use closed form for conic: dz/dr = c r / sqrt(1-(1+k)c^2 r^2) */
    dzdr2 = q > 0 ? c / (2 * Math.sqrt(q)) : NaN;
    var p = r2, k = 2;
    for (var j = 0; j < s.A.length; j++) { dzdr2 += s.A[j] * k * p; p *= r2; k++; }
    var nx = -2 * x * dzdr2, ny = -2 * y * dzdr2, nz = 1, L = Math.sqrt(nx * nx + ny * ny + 1);
    return [nx / L, ny / L, nz / L];
  }
  /* intersect a ray (p in the surface frame: vertex at origin, d unit) with the surface; returns distance or NaN */
  function intersect(s, p, d) {
    var c = s.c, t;
    if (c === 0 && s.k === 0) t = -p[2] / d[2];
    else {
      /* conic: c (x²+y²+(1+k)z²) - 2z = 0 */
      var k1 = 1 + s.k;
      var A = c * (d[0] * d[0] + d[1] * d[1] + k1 * d[2] * d[2]);
      var B = 2 * (c * (p[0] * d[0] + p[1] * d[1] + k1 * p[2] * d[2]) - d[2]);
      var C = c * (p[0] * p[0] + p[1] * p[1] + k1 * p[2] * p[2]) - 2 * p[2];
      if (Math.abs(A) < 1e-14) t = -C / B;
      else {
        var D = B * B - 4 * A * C;
        if (D < 0) return NaN;
        var sq = Math.sqrt(D);
        /* root nearest to the vertex plane crossing (the branch with z small) */
        var t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A);
        var q = (B > 0 ? -B - sq : -B + sq) / 2;            /* stable form */
        t1 = q / A; t2 = C / q;
        var z1 = p[2] + t1 * d[2], z2 = p[2] + t2 * d[2];
        t = Math.abs(z1) < Math.abs(z2) ? t1 : t2;
        if (!isFinite(t)) t = isFinite(t1) ? t1 : t2;
      }
    }
    if (s.A.length) {
      /* Newton on F(t) = z(t) - sag(r(t)) */
      for (var it = 0; it < 30; it++) {
        var x = p[0] + t * d[0], y = p[1] + t * d[1], z = p[2] + t * d[2];
        var zs = sag(s, x * x + y * y);
        if (!isFinite(zs)) return NaN;
        var F = z - zs;
        if (Math.abs(F) < 1e-12) break;
        var nrm = normalAt(s, x, y);
        var dF = (nrm[0] * d[0] + nrm[1] * d[1] + nrm[2] * d[2]) / nrm[2];
        if (Math.abs(dF) < 1e-14) return NaN;
        t -= F / dF;
      }
    }
    return t;
  }
  /* trace one real ray. p0, d0 in global coordinates (surface 0 vertex at z = 0). Returns {ok, pts, p, d, opl, fail, vignetted} at the image plane. */
  function traceRay(S, n, p0, d0, opts) {
    opts = opts || {};
    var p = p0.slice(), d = d0.slice(), opl = 0, z0 = 0, pts = opts.keep ? [p.slice()] : null, vig = false;
    var N = S.surfaces.length;
    for (var i = 0; i < N; i++) {
      var s = S.surfaces[i];
      var lp = [p[0], p[1], p[2] - z0];
      var t = intersect(s, lp, d);
      if (!isFinite(t)) return { ok: false, fail: i, pts: pts };
      p = [p[0] + t * d[0], p[1] + t * d[1], p[2] + t * d[2]];
      opl += n[i] * t;
      if (pts) pts.push(p.slice());
      var r = Math.hypot(p[0], p[1]);
      if (s.sd && r > s.sd * (1 + 1e-9)) { vig = true; if (opts.clip) return { ok: false, fail: i, vignetted: true, pts: pts }; }
      var nr = normalAt(s, p[0], p[1]);
      var n1 = n[i], n2 = n[i + 1], mu = n1 / n2;
      var cosI = nr[0] * d[0] + nr[1] * d[1] + nr[2] * d[2];
      var sgn = cosI < 0 ? -1 : 1;
      cosI = Math.abs(cosI);
      var k2 = 1 - mu * mu * (1 - cosI * cosI);
      if (k2 < 0) return { ok: false, fail: i, tir: true, pts: pts };
      var g = Math.sqrt(k2) - mu * cosI;
      d = [mu * d[0] + g * nr[0] * sgn, mu * d[1] + g * nr[1] * sgn, mu * d[2] + g * nr[2] * sgn];
      var L = Math.hypot(d[0], d[1], d[2]); d = [d[0] / L, d[1] / L, d[2] / L];
      z0 += s.t;
    }
    /* last thickness = distance to the image plane */
    var zi = z0 - 0; /* image plane z */
    var tt = (zi - p[2]) / d[2];
    var pI = [p[0] + tt * d[0], p[1] + tt * d[1], zi];
    if (pts) pts.push(pI.slice());
    return { ok: true, p: pI, d: d, opl: opl + n[N] * tt, pLast: p, oplLast: opl, vignetted: vig, pts: pts };
  }
  /* z of every vertex; the image plane at the end */
  function vertexZ(S) { var z = [0]; S.surfaces.forEach(function (s, i) { z.push(z[i] + s.t); }); return z; }

  /* starting point and direction of a ray for field value f, pupil (px, py) in [-1, 1] on the paraxial entrance pupil,
     shifted by the chief-ray aim offset (aim: [ax, ay] on the EP plane) */
  function rayStart(S, P, f, px, py, aim) {
    var R = P.epd / 2, ax = aim ? aim[0] : 0, ay = aim ? aim[1] : 0;
    var ex = px * R + ax, ey = py * R + ay, zE = P.zEP;
    if (S.inf) {
      var th = f * Math.PI / 180, d = [0, Math.sin(th), Math.cos(th)];
      var zs = Math.min(0, zE) - 10;                     /* start plane in front of everything */
      var s = (zs - zE) / d[2];
      return { p: [ex + s * d[0], ey + s * d[1], zs], d: d };
    }
    var o = [0, f, -S.objDist], v = [ex - o[0], ey - o[1], zE - o[2]], L = Math.hypot(v[0], v[1], v[2]);
    return { p: o, d: [v[0] / L, v[1] / L, v[2] / L] };
  }
  /* real chief ray aimed at the centre of the stop (secant iteration on the EP offset) */
  function aimChief(S, P, n, f) {
    if (f === 0) return [0, 0];
    var zS = vertexZ(S)[S.stop];
    function hStop(ay) {
      var st = rayStart(S, P, f, 0, 0, [0, ay]);
      var sub = { surfaces: S.surfaces.slice(0, S.stop + 1).map(function (s, i, a) { return i === a.length - 1 ? Object.assign({}, s, { t: 0 }) : s; }) };
      var r = traceRay(sub, n, st.p, st.d);
      return r.ok ? r.pLast[1] : NaN;
    }
    if (S.stop === 0 && S.surfaces[0].c === 0 && S.surfaces[0].k === 0 && !S.surfaces[0].A.length && Math.abs(P.zEP) < 1e-12) return [0, 0];
    var a0 = 0, h0 = hStop(a0), a1 = P.epd * 0.01 + 1e-3, h1 = hStop(a1);
    for (var it = 0; it < 40 && isFinite(h1) && Math.abs(h1) > 1e-12; it++) {
      if (h1 === h0) break;
      var a2 = a1 - h1 * (a1 - a0) / (h1 - h0);
      a0 = a1; h0 = h1; a1 = a2; h1 = hStop(a1);
    }
    return isFinite(h1) ? [0, a1] : [0, 0];
  }
  /* reference geometry of one field at one wavelength (chief ray at primary λ defines the image point) */
  function fieldRef(S, P, f) {
    var nP = indices(S, S.wl[S.primary]), aim = aimChief(S, P, nP, f);
    var st = rayStart(S, P, f, 0, 0, aim), ch = traceRay(S, nP, st.p, st.d);
    return { aim: aim, chief: ch };
  }
  function pupilGrid(nr) {
    /* square grid inside the unit circle, nr points across */
    var pts = [], h = nr > 1 ? 2 / (nr - 1) : 0;
    for (var i = 0; i < nr; i++) for (var j = 0; j < nr; j++) {
      var x = -1 + i * h, y = -1 + j * h;
      if (x * x + y * y <= 1 + 1e-12) pts.push([x, y]);
    }
    return pts;
  }
  /* spot diagram: per field × wavelength the image-plane points relative to the primary chief ray */
  function spots(sys, opts) {
    opts = opts || {};
    var S = prepared(sys);
    var P = paraxial(S), grid = pupilGrid(opts.grid || 21), out = [];
    S.fields.forEach(function (f, fi) {
      var ref = fieldRef(S, P, f), c0 = ref.chief.ok ? ref.chief.p : [0, 0, 0];
      var perW = S.wl.map(function (nm) {
        var n = indices(S, nm), pts = [], lost = 0;
        grid.forEach(function (g) {
          var st = rayStart(S, P, f, g[0], g[1], ref.aim), r = traceRay(S, n, st.p, st.d, { clip: opts.clip });
          if (r.ok) pts.push([r.p[0] - c0[0], r.p[1] - c0[1]]); else lost++;
        });
        return { nm: nm, pts: pts, lost: lost, stat: spotStat(pts, grid.length) };
      });
      var all = []; perW.forEach(function (w) { all = all.concat(w.pts); });
      out.push({ field: f, fi: fi, chief: c0, perW: perW, stat: spotStat(all, grid.length * perW.length) });
    });
    return out;
  }
  /* statistics of the traced points; with fewer than 25 % of the launched rays (nLaunched) the numbers are not representative: valid = false */
  function spotStat(pts, nLaunched) {
    var frac = nLaunched ? pts.length / nLaunched : 1;
    if (!pts.length) return { n: 0, cx: NaN, cy: NaN, rms: NaN, geo: NaN, rmsChief: NaN, frac: 0, valid: false };
    var cx = 0, cy = 0; pts.forEach(function (q) { cx += q[0]; cy += q[1]; }); cx /= pts.length; cy /= pts.length;
    var s2 = 0, s2c = 0, g = 0;
    pts.forEach(function (q) { var dx = q[0] - cx, dy = q[1] - cy, r2 = dx * dx + dy * dy; s2 += r2; s2c += q[0] * q[0] + q[1] * q[1]; if (r2 > g) g = r2; });
    return { n: pts.length, cx: cx, cy: cy, rms: Math.sqrt(s2 / pts.length), geo: Math.sqrt(g), rmsChief: Math.sqrt(s2c / pts.length), frac: frac, valid: pts.length >= 2 && frac >= 0.25 };
  }
  /* best focus shift (closed form, all fields × wavelengths weighted equally) that minimises the RMS spot about the centroids */
  function bestFocus(S, P) {
    var grid = pupilGrid(13), num = 0, den = 0;
    S.fields.forEach(function (f) {
      var ref = fieldRef(S, P, f);
      S.wl.forEach(function (nm) {
        var n = indices(S, nm), rs = [];
        grid.forEach(function (g) { var st = rayStart(S, P, f, g[0], g[1], ref.aim), r = traceRay(S, n, st.p, st.d); if (r.ok) rs.push(r); });
        if (rs.length < 2) return;
        var mx = 0, my = 0, sx = 0, sy = 0;
        rs.forEach(function (r) { mx += r.p[0]; my += r.p[1]; sx += r.d[0] / r.d[2]; sy += r.d[1] / r.d[2]; });
        mx /= rs.length; my /= rs.length; sx /= rs.length; sy /= rs.length;
        rs.forEach(function (r) { var ax = r.p[0] - mx, ay = r.p[1] - my, bx = r.d[0] / r.d[2] - sx, by = r.d[1] / r.d[2] - sy; num += ax * bx + ay * by; den += bx * bx + by * by; });
      });
    });
    return den > 0 ? -num / den : NaN;
  }
  /* ray fans: transverse error (image plane, relative to the primary chief ray) against the pupil coordinate */
  function fans(sys, opts) {
    opts = opts || {};
    var S = prepared(sys), P = paraxial(S), m = opts.n || 41, out = [];
    S.fields.forEach(function (f) {
      var ref = fieldRef(S, P, f), c0 = ref.chief.ok ? ref.chief.p : [0, 0, 0];
      var perW = S.wl.map(function (nm) {
        var n = indices(S, nm), tan = [], sag = [];
        for (var i = 0; i < m; i++) {
          var q = -1 + 2 * i / (m - 1);
          var st = rayStart(S, P, f, 0, q, ref.aim), r = traceRay(S, n, st.p, st.d);
          tan.push([q, r.ok ? r.p[1] - c0[1] : NaN]);
          st = rayStart(S, P, f, q, 0, ref.aim); r = traceRay(S, n, st.p, st.d);
          sag.push([q, r.ok ? r.p[0] - c0[0] : NaN]);
        }
        return { nm: nm, tan: tan, sag: sag };
      });
      out.push({ field: f, perW: perW });
    });
    return out;
  }

  /* ------------------------------------------------------------ wavefront, PSF, MTF */
  /* OPD map (waves) of one field at one wavelength on an N×N pupil grid; reference sphere centred on the chief-ray image point of THIS wavelength,
     radius = distance exit-pupil point of the chief ray -> image point; piston and tilt removed (best-fit reference). */
  function wavefront(sys, fi, wi, opts) {
    opts = opts || {};
    var S = prepared(sys), P = paraxial(S), N = opts.N || LIM.nPupil;
    var f = S.fields[fi || 0], nm = S.wl[wi == null ? S.primary : wi], n = indices(S, nm), nI = n[S.surfaces.length];
    var ref = fieldRef(S, P, f);
    var st = rayStart(S, P, f, 0, 0, ref.aim), ch = traceRay(S, n, st.p, st.d);
    if (!ch.ok) return null;
    var Ip = ch.p, zImg = Ip[2];
    /* exit pupil point on the chief ray: paraxial XP plane (z = last vertex + zXP) */
    var zLast = zImg - S.surfaces[S.surfaces.length - 1].t, zX = zLast + P.zXP;
    var tC = (zX - ch.pLast[2]) / ch.d[2];
    var E = [ch.pLast[0] + tC * ch.d[0], ch.pLast[1] + tC * ch.d[1], zX];
    var Rref = Math.hypot(Ip[0] - E[0], Ip[1] - E[1], Ip[2] - E[2]);
    function oplToSphere(r) {
      /* from the last surface point, go along d to the sphere |x - Ip| = Rref on the pupil side */
      var o = [r.pLast[0] - Ip[0], r.pLast[1] - Ip[1], r.pLast[2] - Ip[2]], d = r.d;
      var b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - Rref * Rref, D = b * b - c;
      if (D < 0) return NaN;
      var sq = Math.sqrt(D), t1 = -b - sq, t2 = -b + sq;
      /* the intersection before the image point (sphere point between XP and image) */
      var t = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
      return r.oplLast + nI * t;
    }
    var W0 = oplToSphere(ch);
    var lam = nm * 1e-6, map = new Float64Array(N * N), mask = new Uint8Array(N * N), cnt = 0;
    var sx = 0, sy = 0, sw = 0, sxx = 0, syy = 0, swx = 0, swy = 0;
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var px = -1 + (i + 0.5) * 2 / N, py = -1 + (j + 0.5) * 2 / N;
      if (px * px + py * py > 1) continue;
      var s0 = rayStart(S, P, f, px, py, ref.aim), r = traceRay(S, n, s0.p, s0.d, { clip: opts.clip });
      if (!r.ok) continue;
      var w = (W0 - oplToSphere(r)) / lam;                 /* positive = wavefront ahead of the reference */
      if (!isFinite(w)) continue;
      map[j * N + i] = w; mask[j * N + i] = 1; cnt++;
      sx += px; sy += py; sw += w; sxx += px * px; syy += py * py; swx += w * px; swy += w * py;
    }
    if (!cnt) return null;
    /* remove piston + tilt by least squares (pupil symmetric grid: normal equations decouple approximately; solve 3x3 exactly) */
    var sxy = 0;
    for (var k = 0; k < N * N; k++) if (mask[k]) { var ii = k % N, jj = (k / N) | 0; sxy += (-1 + (ii + 0.5) * 2 / N) * (-1 + (jj + 0.5) * 2 / N); }
    var M = [[cnt, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], rhs = [sw, swx, swy], co = solve3(M, rhs);
    var rmsRaw = 0, mean = sw / cnt, pv0 = -Infinity, pv1 = Infinity, s2 = 0;
    for (k = 0; k < N * N; k++) if (mask[k]) {
      var X = -1 + ((k % N) + 0.5) * 2 / N, Y = -1 + (((k / N) | 0) + 0.5) * 2 / N;
      rmsRaw += (map[k] - mean) * (map[k] - mean);
      if (opts.keepTilt !== true) map[k] -= co[0] + co[1] * X + co[2] * Y;
      else map[k] -= mean;
      s2 += map[k] * map[k]; if (map[k] > pv0) pv0 = map[k]; if (map[k] < pv1) pv1 = map[k];
    }
    return { N: N, map: map, mask: mask, n: cnt, rms: Math.sqrt(s2 / cnt), pv: pv0 - pv1, rmsRaw: Math.sqrt(rmsRaw / cnt), nm: nm, field: f, Rref: Rref,
             naImg: P.naImg, tilt: [co[1], co[2]] };
  }
  function solve3(A, b) {
    var M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < 3; c++) {
      var piv = c; for (var r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      if (Math.abs(M[c][c]) < 1e-300) return [b[0] / (A[0][0] || 1), 0, 0];
      for (r = 0; r < 3; r++) if (r !== c) { var q = M[r][c] / M[c][c]; for (var k = c; k < 4; k++) M[r][k] -= q * M[c][k]; }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }
  /* radix-2 complex FFT in place (re, im Float64Array, length power of 2) */
  function fft1(re, im, inv) {
    var n = re.length, i, j, k;
    for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  function fft2(re, im, M, inv) {
    var rr = new Float64Array(M), ri = new Float64Array(M), x, y;
    for (y = 0; y < M; y++) { for (x = 0; x < M; x++) { rr[x] = re[y * M + x]; ri[x] = im[y * M + x]; } fft1(rr, ri, inv); for (x = 0; x < M; x++) { re[y * M + x] = rr[x]; im[y * M + x] = ri[x]; } }
    for (x = 0; x < M; x++) { for (y = 0; y < M; y++) { rr[y] = re[y * M + x]; ri[y] = im[y * M + x]; } fft1(rr, ri, inv); for (y = 0; y < M; y++) { re[y * M + x] = rr[y]; im[y * M + x] = ri[y]; } }
  }
  /* PSF and MTF from a wavefront (pupil N, padded to 2N so the OTF has no wrap-around). Frequencies in cycles/mm:
     one pupil sample of shear = dρ·NA'/λ with dρ = 2/N (pupil mapped by the paraxial image-space NA). Strehl = peak ratio. */
  function psfMtf(wf) {
    var N = wf.N, M = 2 * N;
    if (N & (N - 1)) throw new Error('pupil grid must be a power of two');
    var re = new Float64Array(M * M), im = new Float64Array(M * M), ampSum = 0, x, y;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var k = y * N + x; if (!wf.mask[k]) continue;
      var ph = 2 * Math.PI * wf.map[k];
      re[y * M + x] = Math.cos(ph); im[y * M + x] = Math.sin(ph); ampSum += 1;
    }
    var cr = 0, ci = 0;
    for (k = 0; k < M * M; k++) { cr += re[k]; ci += im[k]; }
    var strehl = (cr * cr + ci * ci) / (ampSum * ampSum);
    fft2(re, im, M, false);
    var psf = new Float64Array(M * M), tot = 0;
    for (k = 0; k < M * M; k++) { psf[k] = re[k] * re[k] + im[k] * im[k]; tot += psf[k]; }
    /* OTF = FT of PSF */
    var ore = Float64Array.from(psf), oim = new Float64Array(M * M);
    fft2(ore, oim, M, true);
    var o0 = Math.hypot(ore[0], oim[0]), lam = wf.nm * 1e-6, dnu = (2 / N) * wf.naImg / lam;
    var tan = [], sag = [];
    for (var s = 0; s <= N; s++) {
      var iy = s % M, ix = s % M;
      tan.push([s * dnu, Math.hypot(ore[iy * M], oim[iy * M]) / o0]);       /* shear along pupil y = tangential */
      sag.push([s * dnu, Math.hypot(ore[ix], oim[ix]) / o0]);               /* shear along pupil x = sagittal */
    }
    return { strehl: strehl, cutoff: 2 * wf.naImg / lam, tan: tan, sag: sag, psfTotal: tot, M: M, psf: psf };
  }
  /* largest OPD difference between neighbouring pupil samples (waves); > 0.5 wave per sample = the sampled pupil function aliases */
  function phaseStep(wf) {
    var N = wf.N, mx = 0;
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var k = j * N + i; if (!wf.mask[k]) continue;
      if (i + 1 < N && wf.mask[k + 1]) mx = Math.max(mx, Math.abs(wf.map[k + 1] - wf.map[k]));
      if (j + 1 < N && wf.mask[k + N]) mx = Math.max(mx, Math.abs(wf.map[k + N] - wf.map[k]));
    }
    return mx;
  }
  /* wavefront + PSF/MTF on a pupil grid refined (64 → 128 → 256) until the phase step is ≤ 0.25 wave (MTF converged to ~0.003 on the presets);
     the step reached is returned, > 0.5 wave at the cap = not resolved (aliased) */
  function waveAdaptive(S, fi, wi, opts) {
    var N = opts.N || LIM.nPupil, maxN = Math.max(N, opts.maxN || 256), wf, step;
    for (;;) {
      wf = wavefront(S, fi, wi, { N: N, clip: opts.clip });
      if (!wf) return null;
      step = phaseStep(wf);
      if (step <= 0.25 || N * 2 > maxN) break;
      N *= 2;
    }
    return { wf: wf, pm: psfMtf(wf), step: step };
  }
  function mtfAt(curve, nu) {
    for (var i = 1; i < curve.length; i++) if (curve[i][0] >= nu) {
      var a = curve[i - 1], b = curve[i], t = (nu - a[0]) / (b[0] - a[0]); return a[1] + t * (b[1] - a[1]);
    }
    return 0;
  }
  function mtfDiffraction(nu, cutoff) { var x = nu / cutoff; return x >= 1 ? 0 : (2 / Math.PI) * (Math.acos(x) - x * Math.sqrt(1 - x * x)); }

  /* ------------------------------------------------------------ field curves */
  /* tangential/sagittal focus (along z, relative to the image plane) and distortion versus field (fraction of the max field) */
  function fieldCurves(sys, opts) {
    opts = opts || {};
    var S = prepared(sys), P = paraxial(S), nP = indices(S, S.wl[S.primary]), steps = opts.steps || 11, out = [];
    var fmax = P.fmax; if (!fmax) return [];
    var h = 0.02;
    for (var k = 0; k < steps; k++) {
      var f = fmax * k / (steps - 1);
      var aim = aimChief(S, P, nP, f), st = rayStart(S, P, f, 0, 0, aim), ch = traceRay(S, nP, st.p, st.d);
      if (!ch.ok) { out.push({ frac: k / (steps - 1), f: f, zT: NaN, zS: NaN, dist: NaN }); continue; }
      function cross(px, py, axis) {
        var a = rayStart(S, P, f, px, py, aim), b = rayStart(S, P, f, -px, -py, aim);
        var ra = traceRay(S, nP, a.p, a.d), rb = traceRay(S, nP, b.p, b.d);
        if (!ra.ok || !rb.ok) return NaN;
        /* where the two rays meet in the given axis: pa + t*sa = pb + t*sb (t along z) */
        var sa = ra.d[axis] / ra.d[2], sb = rb.d[axis] / rb.d[2];
        return sa !== sb ? -(ra.p[axis] - rb.p[axis]) / (sa - sb) : NaN;
      }
      var zT = cross(0, h, 1), zS = cross(h, 0, 0);
      /* paraxial chief-ray height of this field on the image plane in use (not on the paraxial focus: with a fixed or best-focus plane they differ) */
      var ck = P.chief[S.surfaces.length - 1], hPlane = ck.y + S.surfaces[S.surfaces.length - 1].t * ck.u2;
      var yPar = S.inf ? hPlane * Math.tan(f * Math.PI / 180) / Math.tan(fmax * Math.PI / 180) : hPlane * f / fmax;
      out.push({ frac: k / (steps - 1), f: f, zT: zT, zS: zS, y: ch.p[1], yPar: yPar, dist: f === 0 ? 0 : 100 * (ch.p[1] - yPar) / yPar });
    }
    return out;
  }
  /* chromatic focal shift: paraxial image distance vs λ relative to the primary */
  function chromaticFocus(sys, nm0, nm1, steps) {
    var S = prepared(sys), ref = paraxial(S).imgDist, out = [];
    nm0 = nm0 || 420; nm1 = nm1 || 700; steps = steps || 29;
    var vr = validRange(S); nm0 = Math.max(nm0, vr[0]); nm1 = Math.min(nm1, vr[1]);
    if (!(nm1 > nm0)) return [];
    for (var i = 0; i < steps; i++) { var nm = nm0 + (nm1 - nm0) * i / (steps - 1); out.push([nm, paraxial(S, nm).imgDist - ref]); }
    return out;
  }

  /* ------------------------------------------------------------ helpers */
  function prepared(sys) {
    if (sys && sys.__prepared) return sys;
    var S = normalize(sys); withImage(S); S.__prepared = true; return S;
  }
  /* thick-lens elements = pairs glass->air in the prescription; f of each in air */
  function elements(sys) {
    var S = sys.__norm ? sys : normalize(sys), out = [], i = 0, nm = S.wl[S.primary];
    while (i < S.surfaces.length) {
      if (!isAir(S.surfaces[i].material)) {
        var j = i; while (j < S.surfaces.length && !isAir(S.surfaces[j].material)) j++;
        if (j >= S.surfaces.length) break;
        var sub = { surfaces: S.surfaces.slice(i, j + 1).map(function (s, q, a) { return Object.assign({}, s, { t: q === a.length - 1 ? 0 : s.t, stop: false }); }),
                    inf: true, aperture: { kind: 'epd', value: 1 }, fields: [0], wl: [nm], primary: 0, stop: 0 };
        var p = paraxial(sub);
        out.push({ first: i, last: j, cemented: j - i > 1, efl: p.efl, glass: S.surfaces.slice(i, j).map(function (s) { return s.material; }),
                   sd: Math.min.apply(null, S.surfaces.slice(i, j + 1).map(function (s) { return s.sd || Infinity; })) });
        i = j + 1;
      } else i++;
    }
    return out;
  }
  /* edge thickness of every glass gap at its semi-diameter (warning when ≤ 0) */
  function edgeCheck(S) {
    var warn = [];
    for (var i = 0; i < S.surfaces.length - 1; i++) {
      var a = S.surfaces[i], b = S.surfaces[i + 1], r = Math.min(a.sd || Infinity, b.sd || Infinity);
      if (!isFinite(r)) continue;
      var et = a.t - sag(a, r * r) + sag(b, r * r);
      if (!isFinite(et)) warn.push({ code: 'sd', i: i }); else if (et <= 0) warn.push({ code: isAir(a.material) ? 'airgap' : 'edge', i: i, et: et });
    }
    S.surfaces.forEach(function (s, i) { if (s.sd && !isFinite(sag(s, s.sd * s.sd))) warn.push({ code: 'sd', i: i }); });
    var seen = {};
    return warn.filter(function (w) { var k = w.code + ':' + w.i; if (seen[k]) return false; seen[k] = true; return true; });
  }

  /* ------------------------------------------------------------ full analysis (one call for the page) */
  function analyze(sys, opts) {
    opts = opts || {};
    var S = prepared(sys), P = paraxial(S), sd = seidel(S);
    var sp = spots(S, { grid: opts.grid || 21, clip: opts.clip });
    /* radius of the first dark ring of the Airy pattern: 0.61 λ / NA′ (= 1.22 λ N for a lens in air at infinite conjugate) */
    var airy = 0.61 * S.wl[S.primary] * 1e-6 / P.naImg;
    var warns = edgeCheck(S);
    if (isFinite(P.imgDist) && P.imgDist < 0) warns.push({ code: 'virtual', i: S.surfaces.length - 1, d: P.imgDist });
    var res = { paraxial: P, seidel: sd, spots: sp, airy: airy, imageDist: S.surfaces[S.surfaces.length - 1].t, warnings: warns, sys: S };
    if (opts.wave !== false) {
      res.wave = S.fields.map(function (f, fi) {
        var wr = waveAdaptive(S, fi, S.primary, { N: opts.N || 64, maxN: opts.maxN || 256, clip: opts.clip });
        if (!wr) return null;
        return { rms: wr.wf.rms, pv: wr.wf.pv, strehl: wr.pm.strehl, mtf: wr.pm, wf: wr.wf, N: wr.wf.N, step: wr.step, resolved: wr.step <= 0.5 };
      });
    }
    return res;
  }

  /* ------------------------------------------------------------ optimiser (damped least squares) */
  /* vars: [{i, what:'c'|'t'}]; targets: {efl?, wEfl?}; merit = ray errors (relative to centroid, all fields × wavelengths, coarse grid) + efl term.
     Image distance follows sys.image ('paraxial' or 'best'). Returns {sys (new surfaces), merit0, merit, iters, history}. */
  function optimize(sys, vars, targets, opts) {
    opts = opts || {}; targets = targets || {};
    var base = normalize(sys), grid = pupilGrid(opts.grid || 7), iters = opts.iters || 30;
    function apply(x) {
      var S = normalize(sys);
      vars.forEach(function (v, k) { if (v.what === 'c') S.surfaces[v.i].c = x[k]; else S.surfaces[v.i].t = x[k]; });
      return S;
    }
    function resid(x) {
      var S;
      try { S = apply(x); withImage(S); } catch (e) { return null; }
      var P = paraxial(S), r = [];
      if (!isFinite(P.efl)) return null;
      /* ray errors of every wavelength about ONE reference per field (centroid of the primary wavelength), so lateral colour counts */
      S.fields.forEach(function (f) {
        var ref = fieldRef(S, P, f), perW = S.wl.map(function (nm) {
          var n = indices(S, nm), pts = [];
          grid.forEach(function (g) { var st = rayStart(S, P, f, g[0], g[1], ref.aim), q = traceRay(S, n, st.p, st.d); pts.push(q.ok ? q.p : null); });
          return pts;
        });
        var ok = perW[S.primary].filter(Boolean), mx = 0, my = 0;
        if (ok.length < 2) { perW.forEach(function (pts) { pts.forEach(function () { r.push(10, 10); }); }); return; }
        ok.forEach(function (p) { mx += p[0]; my += p[1]; }); mx /= ok.length; my /= ok.length;
        perW.forEach(function (pts) { pts.forEach(function (p) { if (p) r.push(p[0] - mx, p[1] - my); else r.push(1, 1); }); });
      });
      if (isNum(targets.efl)) r.push((targets.wEfl || 0.05) * (P.efl - targets.efl) * Math.sqrt(r.length));
      return r;
    }
    var x = vars.map(function (v) { return v.what === 'c' ? base.surfaces[v.i].c : base.surfaces[v.i].t; });
    var r = resid(x); if (!r) throw new Error('start system cannot be traced');
    function ss(v) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i] * v[i]; return s; }
    var f0 = ss(r), fcur = f0, lam = 1e-3, hist = [Math.sqrt(f0 / r.length)];
    for (var it = 0; it < iters; it++) {
      /* Jacobian by forward differences */
      var J = vars.map(function (v, k) {
        var h = v.what === 'c' ? Math.max(1e-7, Math.abs(x[k]) * 1e-4) : 1e-4, xp = x.slice(); xp[k] += h;
        var rp = resid(xp); if (!rp) return null;
        return rp.map(function (q, i) { return (q - r[i]) / h; });
      });
      if (J.some(function (c) { return !c; })) break;
      var nv = vars.length, A = [], g = [];
      for (var a = 0; a < nv; a++) { A.push([]); g.push(0); for (var b = 0; b < nv; b++) { var s = 0; for (var i = 0; i < r.length; i++) s += J[a][i] * J[b][i]; A[a].push(s); } for (i = 0; i < r.length; i++) g[a] += J[a][i] * r[i]; }
      var improved = false;
      for (var tries = 0; tries < 12; tries++) {
        var Ad = A.map(function (row, p) { return row.map(function (v, q) { return p === q ? v * (1 + lam) + 1e-18 : v; }); });
        var dx = gauss(Ad, g.map(function (v) { return -v; }));
        if (!dx) { lam *= 10; continue; }
        var xn = x.map(function (v, k) { return v + dx[k]; });
        vars.forEach(function (v, k) { if (v.what === 't' && xn[k] < (v.min != null ? v.min : 0.1)) xn[k] = v.min != null ? v.min : 0.1; });
        var rn = resid(xn);
        if (rn && ss(rn) < fcur) { x = xn; r = rn; fcur = ss(rn); lam = Math.max(1e-7, lam / 3); improved = true; break; }
        lam *= 6;
      }
      hist.push(Math.sqrt(fcur / r.length));
      if (!improved || (hist.length > 2 && hist[hist.length - 2] - hist[hist.length - 1] < 1e-9 * hist[hist.length - 2])) break;
    }
    var S = apply(x); withImage(S);
    return { surfaces: S.surfaces.map(function (s) { return { R: s.c === 0 ? null : 1 / s.c, t: s.t, material: s.material, sd: s.sd, k: s.k, A: s.A.slice(), stop: s.stop }; }),
             x: x, merit0: hist[0], merit: hist[hist.length - 1], iters: hist.length - 1, history: hist };
  }
  function gauss(A, b) {
    var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return null;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      for (r = 0; r < n; r++) if (r !== c) { var q = M[r][c] / M[c][c]; for (var k = c; k <= n; k++) M[r][k] -= q * M[c][k]; }
    }
    return M.map(function (row, i) { return row[n] / row[i]; });
  }

  /* ------------------------------------------------------------ tolerancing (Monte Carlo) */
  /* tol: {dR (fraction of R, e.g. 0.005), dt (mm), dn (index error)}; centred perturbations only (decentre/tilt would need a non-symmetric trace).
     A perturbed glass keeps its dispersion: n_trial(λ) = n_glass(λ) + Δn. With refocus (default) every trial AND the nominal are evaluated at
     their own best focus (back-focus compensator), so zero tolerances reproduce the nominal exactly. Returns RMS spot statistics per field (all λ). */
  function tolerance(sys, tol, opts) {
    opts = opts || {}; tol = tol || {};
    var trials = Math.min(opts.trials || 50, 500), seed = (opts.seed || 12345) >>> 0, refocus = opts.refocus !== false;
    function rnd() { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 1) / 0x7fffffff; }
    function gaussR() { var u = Math.max(1e-12, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    var nomSys = normalize(sys); if (refocus) nomSys.image = 'best';
    var N0 = prepared(nomSys), tImg = N0.surfaces[N0.surfaces.length - 1].t;
    var nom = spots(N0, { grid: 9 }), nomR = nom.map(function (s) { return s.stat.rms; }), res = [];
    for (var k = 0; k < trials; k++) {
      var S = normalize(sys);
      S.image = 'fixed'; S.surfaces[S.surfaces.length - 1].t = tImg;
      S.surfaces.forEach(function (s, i) {
        if (s.c !== 0 && tol.dR) { var R = 1 / s.c; s.c = 1 / (R * (1 + tol.dR * gaussR() / 2)); }
        if (i < S.surfaces.length - 1 && tol.dt) s.t += tol.dt * gaussR() / 2;
        if (!isAir(s.material) && tol.dn) s.material = { base: s.material, dn: tol.dn * gaussR() / 2 };
      });
      if (refocus) { S.image = 'best'; withImage(S); }
      S.__prepared = true;
      var sp = spots(S, { grid: 9 });
      res.push(sp.map(function (s) { return s.stat.rms; }));
    }
    var perField = nomR.map(function (r0, fi) {
      var v = res.map(function (r) { return r[fi]; }).filter(isFinite).sort(function (a, b) { return a - b; });
      return { nominal: r0, mean: v.reduce(function (a, b) { return a + b; }, 0) / v.length, p50: v[Math.floor(v.length * 0.5)], p90: v[Math.min(v.length - 1, Math.floor(v.length * 0.9))], max: v[v.length - 1], all: v };
    });
    return { trials: trials, perField: perField, refocus: refocus, note: 'tolerances are ±2σ ranges (σ = half the given value); a perturbed glass keeps its dispersion (index offset); nominal and trials at their own best focus when refocus is on' };
  }

  /* ------------------------------------------------------------ stock finder */
  function stockFor(sys, k) {
    if (!OptCore.stock) return [];
    return elements(sys).map(function (e) {
      var type = e.cemented ? (e.efl > 0 ? 'achromat' : 'achromat-neg') : null;
      var cands = OptCore.stock.nearest({ f: e.efl, type: type || undefined }, k || 3);
      if (!e.cemented) cands = cands.filter(function (c) { return !/^achromat/.test(c.part.type); });
      return { element: e, cands: cands };
    });
  }
  /* replace one element (surfaces first..last) by a stock part; flip to turn it round */
  function replaceWithStock(surfaces, first, last, id, flip) {
    var st = OptCore.stock.surfaces(id, flip);
    if (!st) return null;
    var tail = surfaces[last].t, out = surfaces.slice(0, first);
    st.forEach(function (s, q) { out.push({ R: s.R, t: q === st.length - 1 ? tail : s.t, material: s.material, sd: s.sd, k: s.k || 0, A: s.asph || [], stop: q === 0 && surfaces.slice(first, last + 1).some(function (x) { return x.stop; }) }); });
    return out.concat(surfaces.slice(last + 1));
  }


  /* ------------------------------------------------------------ preset systems (shared by the page and the tests; claims checked in _opt/lens/test.mjs) */
  var FdC = [LINES.F, LINES.d, LINES.C];
  function sysOf(surfaces, o) { return Object.assign({ surfaces: surfaces, object: { inf: true }, aperture: { kind: 'epd', value: 24 }, fields: [0], wl: [LINES.d], primary: 0, image: 'best' }, o || {}); }
  var PRESETS = {
    /* Thorlabs LA1509 (N-BK7, f 100 mm, Ø 25.4 mm; R 51.5, CT 3.6 — public catalogue page, read 2026-11-13) at f/4.2, d line */
    pcxCurved: function () { return sysOf([{ R: 51.5, t: 3.6, material: 'N-BK7', sd: 12.7, stop: true }, { R: null, t: 97, material: 'air', sd: 12.7 }]); },
    pcxFlat: function () { return sysOf([{ R: null, t: 3.6, material: 'N-BK7', sd: 12.7, stop: true }, { R: -51.5, t: 97, material: 'air', sd: 12.7 }]); },
    /* Thorlabs LBF254-100 best-form (R1 60.02, R2 −353.3, CT 4.0) */
    bestForm: function () { return sysOf([{ R: 60.02, t: 4, material: 'N-BK7', sd: 12.7, stop: true }, { R: -353.3, t: 97, material: 'air', sd: 12.7 }]); },
    /* LA1509 stopped down to f/8.3 */
    stopDown: function () { return sysOf([{ R: 51.5, t: 3.6, material: 'N-BK7', sd: 12.7, stop: true }, { R: null, t: 97, material: 'air', sd: 12.7 }], { aperture: { kind: 'epd', value: 12 } }); },
    /* Thorlabs AC254-100-A cemented achromat (N-BK7 / SF5; R 62.8, −45.7, −128.2; CT 4.0, 2.5) at f/4.2, F d C, field ±3° */
    achromat: function () { return sysOf([{ R: 62.8, t: 4, material: 'N-BK7', sd: 12.7, stop: true }, { R: -45.7, t: 2.5, material: 'SF5', sd: 12.7 }, { R: -128.2, t: 97, material: 'air', sd: 12.7 }], { fields: [0, 2.1, 3], wl: FdC, primary: 1 }); },
    singletPoly: function () { return sysOf([{ R: 51.5, t: 3.6, material: 'N-BK7', sd: 12.7, stop: true }, { R: null, t: 97, material: 'air', sd: 12.7 }], { fields: [0, 2.1, 3], wl: FdC, primary: 1 }); },
    /* Cooke triplet f = 50 mm f/4 ±20° — the "Cooke 40 degree field" sample prescription used in the ray-optics (M. Hayford) documentation */
    cooke: function () { return sysOf([{ R: 23.713, t: 4.831, material: 'N-LAK9', sd: 10 }, { R: 7331.288, t: 5.86, material: 'air', sd: 10 }, { R: -24.456, t: 0.975, material: 'N-SF5', sd: 5, stop: true },
      { R: 21.896, t: 4.822, material: 'air', sd: 5 }, { R: 86.759, t: 3.127, material: 'N-LAK9', sd: 8 }, { R: -20.4942, t: 41.2365, material: 'air', sd: 8 }], { aperture: { kind: 'epd', value: 12.5 }, fields: [0, 14, 20], wl: FdC, primary: 1, image: 'fixed' }); },
    /* landscape lens: N-BK7 meniscus (R −30, −18.5, CT 3; a learning design, f ≈ 86 mm) at f/10.7, ±20°, stop 10.6 mm in front (coma-free stop position) */
    landscape: function () { return sysOf([{ R: null, t: 10.6, material: 'air', sd: 4.5, stop: true }, { R: -30, t: 3, material: 'N-BK7', sd: 12 }, { R: -18.5, t: 90, material: 'air', sd: 12 }], { aperture: { kind: 'epd', value: 8 }, fields: [0, 14, 20] }); },
    landscapeAtLens: function () { return sysOf([{ R: null, t: 0.5, material: 'air', sd: 4.5, stop: true }, { R: -30, t: 3, material: 'N-BK7', sd: 12 }, { R: -18.5, t: 90, material: 'air', sd: 12 }], { aperture: { kind: 'epd', value: 8 }, fields: [0, 14, 20] }); },
    /* a badly bent cemented doublet N-BK7/SF5 (R 80, −80, −300) as the optimiser's start; target EFL 100 mm */
    optimStart: function () { return sysOf([{ R: 80, t: 4, material: 'N-BK7', sd: 12.7, stop: true }, { R: -80, t: 2.5, material: 'SF5', sd: 12.7 }, { R: -300, t: 97, material: 'air', sd: 12.7 }], { fields: [0, 2.1, 3], wl: FdC, primary: 1 }); }
  };

  return { version: VERSION, PRESETS: PRESETS, LIMITS: LIM, LINES: LINES, normalize: normalize, prepared: prepared, paraxial: paraxial, seidel: seidel,
           traceRay: traceRay, rayStart: rayStart, aimChief: aimChief, indices: indices, spots: spots, spotStat: spotStat, fans: fans,
           wavefront: wavefront, psfMtf: psfMtf, mtfAt: mtfAt, mtfDiffraction: mtfDiffraction, fieldCurves: fieldCurves, chromaticFocus: chromaticFocus,
           bestFocus: function (sys) { var S = normalize(sys); var P = paraxial(S); S.surfaces[S.surfaces.length - 1].t = P.imgDist; return P.imgDist + bestFocus(S, P); },
           sag: sag, elements: elements, edgeCheck: edgeCheck, analyze: analyze, optimize: optimize, tolerance: tolerance, stockFor: stockFor,
           replaceWithStock: replaceWithStock, pupilGrid: pupilGrid, vertexZ: vertexZ, fft2: fft2, validRange: validRange, phaseStep: phaseStep, waveAdaptive: waveAdaptive };
});
