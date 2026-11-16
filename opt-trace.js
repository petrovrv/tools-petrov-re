/* opt-trace.js — global OptTrace: 3D vector ray tracer of the tools.petrov.re Optics & Photonics package
   (opticbench uses it non-sequentially, lensdesign uses OptTrace.seq for cross-checks).
   Pure functions, no DOM, no dependencies (uses OptCore.n / OptCore.STOCK when present), UMD (browser global OptTrace, node module.exports).
   Physics: Snell's law in 3D vector form with dispersion, Fresnel amplitude coefficients for s and p (Born & Wolf §1.5, Hecht ch. 4),
   total internal reflection with its phase, polarisation carried as a 3x3 complex coherency matrix J = <E E^H> (trace = power in W)
   so unpolarised, partially and fully polarised light go through the same code; grating equation in vector form (tangential momentum + m·K);
   ideal Jones elements (polariser, retarder, Faraday rotator — non-reciprocal); exact ray–quadric intersection (Spencer & Murty 1962 form)
   with Newton refinement for even aspheres. Lengths in mm, wavelengths in nm (refractive index looked up in µm), power in W.
   Learning and pre-design aid only — verify final designs with a qualified optical engineer and the manufacturers' data. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OptTrace = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
'use strict';

var VERSION = '1.0.0';
var EPS_T = 1e-7;            /* mm — minimum travel before the next hit (self-intersection guard) */
var DEG = Math.PI / 180;

/* =====================================================================================
   1. Refractive index — OptCore.n when available; small fallback table (used only while opt-core.js is absent)
   ===================================================================================== */
/* Fallback Sellmeier coefficients n^2 = 1 + sum B_i L^2 / (L^2 - C_i), L in µm.
   N-BK7, N-SF11: SCHOTT optical glass data sheets (via refractiveindex.info, read 13.11.2026);
   fused silica: I. H. Malitson, JOSA 55, 1205 (1965); CaF2: I. H. Malitson, Appl. Opt. 2, 1103 (1963). */
var FALLBACK_GLASS = {
  'N-BK7': { B: [1.03961212, 0.231792344, 1.01046945], C: [0.00600069867, 0.0200179144, 103.560653], range: [0.3, 2.5] },
  'N-SF11': { B: [1.73759695, 0.313747346, 1.89878101], C: [0.013188707, 0.0623068142, 155.23629], range: [0.37, 2.5] },
  'FUSED SILICA': { B: [0.6961663, 0.4079426, 0.8974794], C: [0.0684043 * 0.0684043, 0.1162414 * 0.1162414, 9.896161 * 9.896161], range: [0.21, 6.7] },
  'CAF2': { B: [0.5675888, 0.4710914, 3.8484723], C: [0.050263605 * 0.050263605, 0.1003909 * 0.1003909, 34.649040 * 34.649040], range: [0.23, 9.7] }
};
var FALLBACK_ALIAS = { 'FUSEDSILICA': 'FUSED SILICA', 'F_SILICA': 'FUSED SILICA', 'SIO2': 'FUSED SILICA', 'UVFS': 'FUSED SILICA', 'BK7': 'N-BK7', 'CAF2': 'CAF2' };

function fallbackN(name, lamUm) {
  var key = String(name).toUpperCase().replace(/^\s+|\s+$/g, '');
  key = FALLBACK_ALIAS[key.replace(/[\s-]/g, '')] || FALLBACK_ALIAS[key] || key;
  var g = FALLBACK_GLASS[key];
  if (!g) return NaN;
  var L2 = lamUm * lamUm, s = 1;
  for (var i = 0; i < 3; i++) s += g.B[i] * L2 / (L2 - g.C[i]);
  return Math.sqrt(s);
}

function isAir(m) { return m == null || m === '' || (typeof m === 'string' && /^(air|ambient|vacuum)$/i.test(m)); }

/* index(material, lambda_nm, ctx) — material: number | {n:number} | name (OptCore.n first, then fallback) | 'air' (= ctx.ambientN, default 1) */
function indexOf(mat, lamNm, ctx) {
  if (typeof mat === 'number') return mat;
  if (ctx && typeof mat === 'string') {
    var cache = ctx.cache || (ctx.cache = {}), key = mat + '|' + lamNm, v = cache[key];
    if (v === undefined) v = cache[key] = indexRaw(mat, lamNm, ctx);
    return v;
  }
  return indexRaw(mat, lamNm, ctx);
}
function indexRaw(mat, lamNm, ctx) {
  if (typeof mat === 'number') return mat;
  if (mat && typeof mat === 'object' && typeof mat.n === 'number') return mat.n;
  if (isAir(mat)) return ctx && typeof ctx.ambientN === 'number' ? ctx.ambientN : 1;
  var lamUm = lamNm / 1000, n = NaN;
  var core = root && root.OptCore;
  if (core && typeof core.n === 'function') {
    try { n = core.n(mat, lamUm); } catch (e) { n = NaN; }
  }
  if (!(n > 0)) n = fallbackN(mat, lamUm);
  if (!(n > 0) || !isFinite(n)) throw new Error('OptTrace: unknown material "' + mat + '"');
  return n;
}

/* =====================================================================================
   2. Small vector / matrix helpers (3-vectors as arrays, 3x3 real as 9 numbers row-major,
      3x3 complex as 18-number arrays: [re00, im00, re01, im01, ...])
   ===================================================================================== */
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { var l = Math.sqrt(dot(a, a)); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function axpy(a, s, b) { return [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]]; }
function mulMV(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
function mulMtV(M, v) { return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; }
function mulMM(A, B) {
  var C = new Array(9);
  for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
}
function cols(ex, ey, ez) { return [ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]]; }
function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
var IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/* base frame: element local z (optical axis) -> world +x, local x -> world +y, local y -> world +z (up) */
var BASE = [0, 0, 1, 1, 0, 0, 0, 1, 0];
var FLIP = [-1, 0, 0, 0, 1, 0, 0, 0, -1];

/* rotation taking unit vector a onto unit vector b (Rodrigues) */
function rotBetween(a, b) {
  var v = cross(a, b), c = dot(a, b), s2 = dot(v, v);
  if (s2 < 1e-30) {
    if (c > 0) return IDENT.slice();
    var p = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    var ax = norm(cross(a, p));
    return rotAxis(ax, Math.PI);
  }
  var k = 1 / (1 + c);
  return [
    c + v[0] * v[0] * k, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1],
    v[1] * v[0] * k + v[2], c + v[1] * v[1] * k, v[1] * v[2] * k - v[0],
    v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], c + v[2] * v[2] * k
  ];
}
function rotAxis(u, ang) {
  var c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, x = u[0], y = u[1], z = u[2];
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
          t * x * y + s * z, t * y * y + c, t * y * z - s * x,
          t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
function perp(d) {
  var p = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return norm(cross(d, p));
}

/* complex 3x3 */
function cz() { return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }   /* plain array: much faster than small typed arrays in hot loops */
function cOuterAdd(M, u, v, re, im) {           /* M += (re + i im) u v^T, u v real */
  for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
    var k = (r * 3 + c) * 2, uv = u[r] * v[c];
    M[k] += re * uv; M[k + 1] += im * uv;
  }
}
function cFromReal(R) { var M = cz(); for (var i = 0; i < 9; i++) M[2 * i] = R[i]; return M; }
function cMul(A, B) {
  var C = cz();
  for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
    var re = 0, im = 0;
    for (var k = 0; k < 3; k++) {
      var a = (r * 3 + k) * 2, b = (k * 3 + c) * 2;
      re += A[a] * B[b] - A[a + 1] * B[b + 1];
      im += A[a] * B[b + 1] + A[a + 1] * B[b];
    }
    C[(r * 3 + c) * 2] = re; C[(r * 3 + c) * 2 + 1] = im;
  }
  return C;
}
function cAdj(A) {
  var C = cz();
  for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) { C[(r * 3 + c) * 2] = A[(c * 3 + r) * 2]; C[(r * 3 + c) * 2 + 1] = -A[(c * 3 + r) * 2 + 1]; }
  return C;
}
function sandwich(M, J) { return cMul(cMul(M, J), cAdj(M)); }
/* J' = M J M^H for M = c1 u1 v1^T + c2 u2 v2^T (u, v real unit vectors, c complex [re, im]) — the form of every
   interface / mirror / polariser / retarder matrix; ~3x cheaper than two full complex 3x3 products */
var W1 = [0, 0, 0, 0, 0, 0], W2 = [0, 0, 0, 0, 0, 0];   /* scratch: J v (complex 3-vectors) */
function jv(J, v, w) {
  for (var i = 0; i < 3; i++) {
    var k = i * 6;
    w[2 * i] = J[k] * v[0] + J[k + 2] * v[1] + J[k + 4] * v[2];
    w[2 * i + 1] = J[k + 1] * v[0] + J[k + 3] * v[1] + J[k + 5] * v[2];
  }
}
function rank2(c1r, c1i, u1, v1, c2r, c2i, u2, v2, J) {
  jv(J, v1, W1); jv(J, v2, W2);
  /* q_kl = v_k^T J v_l */
  var q11r = v1[0] * W1[0] + v1[1] * W1[2] + v1[2] * W1[4], q11i = v1[0] * W1[1] + v1[1] * W1[3] + v1[2] * W1[5];
  var q12r = v1[0] * W2[0] + v1[1] * W2[2] + v1[2] * W2[4], q12i = v1[0] * W2[1] + v1[1] * W2[3] + v1[2] * W2[5];
  var q21r = v2[0] * W1[0] + v2[1] * W1[2] + v2[2] * W1[4], q21i = v2[0] * W1[1] + v2[1] * W1[3] + v2[2] * W1[5];
  var q22r = v2[0] * W2[0] + v2[1] * W2[2] + v2[2] * W2[4], q22i = v2[0] * W2[1] + v2[1] * W2[3] + v2[2] * W2[5];
  /* a_kl = c_k conj(c_l) q_kl */
  var m11 = c1r * c1r + c1i * c1i, m22 = c2r * c2r + c2i * c2i;
  var xr = c1r * c2r + c1i * c2i, xi = c1i * c2r - c1r * c2i;          /* c1 conj(c2) */
  var a11r = m11 * q11r, a11i = m11 * q11i, a22r = m22 * q22r, a22i = m22 * q22i;
  var a12r = xr * q12r - xi * q12i, a12i = xr * q12i + xi * q12r;
  var a21r = xr * q21r + xi * q21i, a21i = xr * q21i - xi * q21r;      /* c2 conj(c1) = conj(c1 conj(c2)) */
  var R = cz();
  for (var r = 0; r < 3; r++) {
    var u1r = u1[r], u2r = u2[r];
    for (var c = 0; c < 3; c++) {
      var k = (r * 3 + c) * 2, p11 = u1r * u1[c], p12 = u1r * u2[c], p21 = u2r * u1[c], p22 = u2r * u2[c];
      R[k] = a11r * p11 + a12r * p12 + a21r * p21 + a22r * p22;
      R[k + 1] = a11i * p11 + a12i * p12 + a21i * p21 + a22i * p22;
    }
  }
  return R;
}
function cTrace(J) { return J[0] + J[8] + J[16]; }
function cScale(J, s) { var C = cz(); for (var i = 0; i < 18; i++) C[i] = J[i] * s; return C; }
/* J = P e e^H for complex 3-vector e given as [re0, im0, re1, im1, re2, im2] (normalised here) */
function jonesToJ(e, P) {
  var n2 = 0, i;
  for (i = 0; i < 6; i++) n2 += e[i] * e[i];
  var J = cz(), s = n2 > 0 ? P / n2 : 0;
  for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) {
    var ar = e[2 * a], ai = e[2 * a + 1], br = e[2 * b], bi = e[2 * b + 1];
    J[(a * 3 + b) * 2] = (ar * br + ai * bi) * s;
    J[(a * 3 + b) * 2 + 1] = (ai * br - ar * bi) * s;
  }
  return J;
}
function unpolJ(d, P) {
  var e1 = perp(d), e2 = cross(d, e1), J = cz();
  cOuterAdd(J, e1, e1, P / 2, 0); cOuterAdd(J, e2, e2, P / 2, 0);
  return J;
}
/* complex helpers for Fresnel */
function cdiv(ar, ai, br, bi) { var d = br * br + bi * bi; return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d]; }

/* =====================================================================================
   3. Surfaces: shape intersection in the surface frame, aperture test
   ===================================================================================== */
/* conic / even asphere / cylinder sag: z = c r^2 / (1 + sqrt(1 - (1+k) c^2 r^2)) + A4 r^4 + A6 r^6 + ...
   cyl: null (rotational), 'x' (sag depends on x only — power in x), 'y' (power in y). */
function sagOf(sh, x, y) {
  var r2 = (sh.mx ? x * x : 0) + (sh.my ? y * y : 0), c = sh.c, k = sh.k;
  var q = 1 - (1 + k) * c * c * r2;
  if (q < 0) return NaN;
  var z = c * r2 / (1 + Math.sqrt(q));
  if (sh.A) { var rp = r2; for (var i = 0; i < sh.A.length; i++) { rp *= r2; z += sh.A[i] * rp; } }
  return z;
}
function sagGrad(sh, x, y) {                     /* [dz/dx, dz/dy] */
  var r2 = (sh.mx ? x * x : 0) + (sh.my ? y * y : 0), c = sh.c, k = sh.k;
  var q = 1 - (1 + k) * c * c * r2;
  if (q <= 0) return null;
  var g = c / Math.sqrt(q);
  if (sh.A) { var rp = 1; for (var i = 0; i < sh.A.length; i++) { rp *= r2; g += 2 * (i + 2) * sh.A[i] * rp; } }
  return [sh.mx ? g * x : 0, sh.my ? g * y : 0];
}

function branchOK(c, k1, p, d, t) {
  if (!(t > EPS_T)) return false;
  return c === 0 || k1 * c * (p[2] + t * d[2]) < 1;   /* on the vertex branch of the quadric */
}
function intersectConic(sh, p, d) {
  var c = sh.c, k1 = 1 + sh.k, mx = sh.mx ? 1 : 0, my = sh.my ? 1 : 0;
  var A = c * (mx * d[0] * d[0] + my * d[1] * d[1] + k1 * d[2] * d[2]);
  var B = 2 * (c * (mx * p[0] * d[0] + my * p[1] * d[1] + k1 * p[2] * d[2]) - d[2]);
  var C = c * (mx * p[0] * p[0] + my * p[1] * p[1] + k1 * p[2] * p[2]) - 2 * p[2];
  var t1 = -1, t2 = -1;
  if (Math.abs(A) < 1e-14 * (Math.abs(B) + 1e-300)) {
    if (Math.abs(B) > 1e-300) t1 = -C / B;
  } else {
    var disc = B * B - 4 * A * C;
    if (disc < 0) return -1;
    var sq = Math.sqrt(disc), qq = -0.5 * (B + (B >= 0 ? sq : -sq));
    t1 = qq / A; if (qq !== 0) t2 = C / qq;
  }
  var ok1 = branchOK(c, k1, p, d, t1), ok2 = branchOK(c, k1, p, d, t2);
  if (ok1 && ok2) return t1 < t2 ? t1 : t2;
  return ok1 ? t1 : ok2 ? t2 : -1;
}

/* distance along the ray to the surface (-1 = no hit); allocation-free except for aspheres */
function intersectT(sh, p, d) {
  var t;
  if (sh.type === 'conic') {
    t = intersectConic(sh, p, d);
    if (sh.A && sh.A.length) {
      /* Newton refinement on g(t) = z(t) - sag(x(t), y(t)); start from the conic (or base plane) solution */
      if (t < 0) { if (Math.abs(d[2]) < 1e-12) return -1; t = -p[2] / d[2]; if (!(t > EPS_T)) return -1; }
      for (var it = 0; it < 30; it++) {
        var qx = p[0] + t * d[0], qy = p[1] + t * d[1], qz = p[2] + t * d[2];
        var s = sagOf(sh, qx, qy), gr = sagGrad(sh, qx, qy);
        if (!isFinite(s) || !gr) return -1;
        var g = qz - s, dg = d[2] - gr[0] * d[0] - gr[1] * d[1];
        if (Math.abs(dg) < 1e-14) return -1;
        var dt = g / dg; t -= dt;
        if (Math.abs(dt) < 1e-12) break;
      }
      if (!(t > EPS_T)) return -1;
    }
    return t;
  }
  if (sh.type === 'barrel') {                    /* x^2 + y^2 = r^2, z0 <= z <= z1 */
    var a = d[0] * d[0] + d[1] * d[1];
    if (a < 1e-20) return -1;
    var b = 2 * (p[0] * d[0] + p[1] * d[1]), cc = p[0] * p[0] + p[1] * p[1] - sh.r * sh.r;
    var disc = b * b - 4 * a * cc;
    if (disc < 0) return -1;
    var sq = Math.sqrt(disc);
    for (var j = 0; j < 2; j++) {
      t = j === 0 ? (-b - sq) / (2 * a) : (-b + sq) / (2 * a);
      if (!(t > EPS_T)) continue;
      var z = p[2] + t * d[2];
      if (z < sh.z0 - 1e-9 || z > sh.z1 + 1e-9) continue;
      return t;
    }
    return -1;
  }
  return -1;
}
/* local point and unit normal (towards the + side) at distance t */
function hitAt(sh, p, d, t) {
  var q = [p[0] + t * d[0], p[1] + t * d[1], p[2] + t * d[2]];
  if (sh.type === 'barrel') return { t: t, l: q, n: [q[0] / sh.r, q[1] / sh.r, 0] };
  var gg = sagGrad(sh, q[0], q[1]);
  if (!gg) return null;
  return { t: t, l: q, n: norm([-gg[0], -gg[1], 1]) };
}
/* returns {t, l:[x,y,z] local point, n:[nx,ny,nz] local unit normal towards the + side} or null */
function intersectShape(sh, p, d) {
  var t = intersectT(sh, p, d);
  return t > 0 ? hitAt(sh, p, d, t) : null;
}

function inPoly(pts, x, y) {
  var inside = false;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function inAperture(ap, x, y) {
  if (!ap) return true;
  var u = x - (ap.dx || 0), v = y - (ap.dy || 0);
  switch (ap.type) {
    case 'circle': { var r2 = u * u + v * v; return r2 <= ap.r * ap.r * (1 + 1e-12) && (!ap.r0 || r2 > ap.r0 * ap.r0 * (1 + 1e-12)); }   /* r0: open hole (iris), edge counts as open */
    case 'rect': return Math.abs(u) <= ap.hw * (1 + 1e-12) && Math.abs(v) <= ap.hh * (1 + 1e-12);
    case 'frame': return Math.abs(u) <= ap.hw && Math.abs(v) <= ap.hh && !(Math.abs(u) <= ap.iw * (1 + 1e-12) && Math.abs(v) <= ap.ih * (1 + 1e-12));
    case 'poly': return inPoly(ap.pts, u, v);
    default: return true;
  }
}
function apRadius(ap) {
  if (!ap) return 0;
  var o = Math.hypot(ap.dx || 0, ap.dy || 0);
  if (ap.type === 'circle') return o + ap.r;
  if (ap.type === 'rect' || ap.type === 'frame') return o + Math.hypot(ap.hw, ap.hh);
  if (ap.type === 'poly') { var m = 0; for (var i = 0; i < ap.pts.length; i++) m = Math.max(m, Math.hypot(ap.pts[i][0], ap.pts[i][1])); return o + m; }
  return 0;
}

/* =====================================================================================
   4. Element kinds → surfaces (in the element frame: local z = optical axis, local x = horizontal, local y = up)
   ===================================================================================== */
function num(v, def) { var x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof x === 'number' && isFinite(x) ? x : def; }
function curv(R) { R = num(R, 0); return R === 0 || !isFinite(R) ? 0 : 1 / R; }
function conicShape(c, k, A, cyl) {
  var sh = { type: 'conic', c: c, k: num(k, 0), mx: cyl !== 'y', my: cyl !== 'x' };
  if (A && A.length) { var a = []; for (var i = 0; i < A.length; i++) a.push(num(A[i], 0)); sh.A = a; }
  return sh;
}
function surf(o, R, shape, ap, act, extra) {
  var s = { o: o, R: R || IDENT, shape: shape, ap: ap, act: act };
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) s[k] = extra[k];
  return s;
}
function plane() { return conicShape(0, 0); }
function apOf(p, defD) {
  if (num(p.W, 0) > 0 || num(p.H, 0) > 0) return { type: 'rect', hw: num(p.W, num(p.H, defD)) / 2, hh: num(p.H, num(p.W, defD)) / 2 };
  return { type: 'circle', r: num(p.D, defD) / 2 };
}

/* stock lookup: OptCore.stock.get(id) (entries {id, type, D, f, R1, R2, CT, glass | achromat: R1, R2, R3, CT1, CT2, glass1, glass2, k1?, asph?}) */
function stockPart(id) {
  var core = root && root.OptCore;
  if (!core || !id) return null;
  if (core.stock && typeof core.stock.get === 'function') { var g = core.stock.get(id); if (g) return g; }
  var S = core.STOCK;
  if (!S) return null;
  var list = Array.isArray(S) ? S : Object.keys(S).map(function (k) { return S[k]; });
  for (var i = 0; i < list.length; i++) { var e = list[i]; if (e && (e.id === id || e.part === id || e.pn === id)) return e; }
  return null;
}
function fromStock(p) {
  var e = stockPart(p.stock);
  if (!e) return p;
  var q = {}, k;
  for (k in p) q[k] = p[k];
  function pick() { for (var i = 0; i < arguments.length; i++) { var v = e[arguments[i]]; if (v !== undefined) return v; } return undefined; }
  var map = { R1: pick('R1'), R2: pick('R2'), R3: pick('R3'), CT: pick('CT', 'tc'), CT1: pick('CT1'), CT2: pick('CT2'),
    D: pick('D', 'diameter'), material: pick('glass', 'material'), mat1: pick('glass1'), mat2: pick('glass2'), k1: pick('k1'), A1: pick('asph', 'A1') };
  /* catalogue values replace the defaults; explicit user values other than the stock id are kept only for pose-independent options (flip, ar) */
  for (k in map) if (map[k] !== undefined) q[k] = map[k] === null ? 0 : map[k];
  q._stock = { id: e.id || p.stock, vendor: e.vendor, type: e.type, f: e.f, url: e.url };
  return q;
}
/* default parameters of every kind (the page builds its inspector from these) */
/* lens default = plano-convex R 51.5 mm, CT 3.6 mm, N-BK7, Ø25.4 (f ≈ 100 mm; geometry of a common catalogue PCX lens — use stock ids for real parts) */
var KINDS = {
  source:     { cat: 'source', defaults: { type: 'laser', P: 0.001, lambdaNm: 633, n: 9, pattern: 'fan', D: 2, w0: 0.5, M2: 1, profile: 'uniform', halfAngle: 10, pol: 'linear', polAngle: 0, divergence: false } },
  lens:       { cat: 'lens', defaults: { R1: 51.5, R2: 0, CT: 3.6, D: 25.4, material: 'N-BK7', k1: 0, k2: 0, flip: false, ar: false } },
  /* default doublet: cemented achromat derived from the thin-lens achromat condition (N-BAK4 / N-SF10, equi-convex crown, f ≈ 100 mm) — a worked example, not a catalogue part */
  doublet:    { cat: 'lens', defaults: { R1: 55.8, R2: -55.8, R3: -273.8, CT1: 4.0, CT2: 2.5, D: 25.4, mat1: 'N-BAK4', mat2: 'N-SF10', flip: false, ar: false } },
  thinlens:   { cat: 'lens', defaults: { f: 100, D: 25.4 } },
  idealmirror: { cat: 'mirror', defaults: { f: 100, D: 25.4, reflectance: 1 } },
  mirror:     { cat: 'mirror', defaults: { R: 0, k: 0, D: 25.4, reflectance: 1 } },
  bsplate:    { cat: 'splitter', defaults: { W: 25.4, H: 25.4, t: 3, material: 'N-BK7', R: 0.5 } },
  bscube:     { cat: 'splitter', defaults: { a: 12.7, material: 'N-BK7', R: 0.5, pbs: false, extinction: 0, ar: true } },
  window:     { cat: 'splitter', defaults: { D: 25.4, t: 3, material: 'N-BK7', ar: false } },
  prism:      { cat: 'prism', defaults: { shape: 'equilateral', a: 25, h: 25, material: 'N-BK7', ar: false } },
  grating:    { cat: 'grating', defaults: { lpmm: 600, mode: 'reflect', W: 25, H: 25, maxOrder: 3 } },
  polarizer:  { cat: 'polarisation', defaults: { angle: 0, D: 25.4, extinction: 0 } },
  waveplate:  { cat: 'polarisation', defaults: { waves: 0.25, angle: 45, lambda0Nm: 633, D: 25.4, dispersive: true } },
  faraday:    { cat: 'polarisation', defaults: { rotation: 45, D: 10 } },
  iris:       { cat: 'stop', defaults: { D: 5, Dout: 50 } },
  slit:       { cat: 'stop', defaults: { w: 0.1, h: 10, Wout: 50, Hout: 50 } },
  blocker:    { cat: 'stop', defaults: { D: 25.4 } },
  screen:     { cat: 'detector', defaults: { W: 25, H: 25, transparent: false } },
  powermeter: { cat: 'detector', defaults: { D: 9.5 } },
  fiber:      { cat: 'detector', defaults: { coreD: 0.05, NA: 0.22, Dferrule: 2.5, outRays: 1 } },
  retro:      { cat: 'mirror', defaults: { a: 25.4 } }
};
function withDefaults(kind, params) {
  var d = KINDS[kind] ? KINDS[kind].defaults : {}, p = {}, k;
  for (k in d) p[k] = d[k];
  if (params) for (k in params) if (params[k] !== undefined && params[k] !== null && params[k] !== '') p[k] = params[k];
  return p;
}

/* polygon prism: pts [[x,z],...] in the element frame, extruded along local y over height h */
function polySurfaces(pts, h, mat, faceOpts) {
  var n = pts.length, cx = 0, cz = 0, i, out = [];
  for (i = 0; i < n; i++) { cx += pts[i][0]; cz += pts[i][1]; }
  cx /= n; cz /= n;
  for (i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n];
    var ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez);
    if (len < 1e-12) continue;
    var nx = ez / len, nz = -ex / len, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
    var Rf = cols([nz, 0, -nx], [0, 1, 0], [nx, 0, nz]);
    var fo = (faceOpts && faceOpts[i]) || {};
    out.push(surf([mx, 0, mz], Rf, plane(), { type: 'rect', hw: len / 2, hh: h / 2 }, fo.act || 'refract',
      { mNeg: mat, mPos: null, coat: fo.coat, face: i }));
  }
  var top = [], bot = [];
  for (i = 0; i < n; i++) { top.push([pts[i][1], pts[i][0]]); bot.push([pts[i][0], pts[i][1]]); }
  out.push(surf([0, h / 2, 0], cols([0, 0, 1], [1, 0, 0], [0, 1, 0]), plane(), { type: 'poly', pts: top }, 'refract', { mNeg: mat, mPos: null, face: 'top' }));
  out.push(surf([0, -h / 2, 0], cols([1, 0, 0], [0, 0, 1], [0, -1, 0]), plane(), { type: 'poly', pts: bot }, 'refract', { mNeg: mat, mPos: null, face: 'bottom' }));
  return out;
}
function centred(pts) {
  var cx = 0, cz = 0, n = pts.length;
  for (var i = 0; i < n; i++) { cx += pts[i][0]; cz += pts[i][1]; }
  cx /= n; cz /= n;
  return pts.map(function (p) { return [p[0] - cx, p[1] - cz]; });
}
/* walk a polygon by interior angles (deg) with given edge lengths (null = solved for closure; exactly two nulls) */
function polyByAngles(angles, lengths) {
  var n = angles.length, headings = [], h = 0, i;
  for (i = 0; i < n; i++) { headings.push(h); h += (180 - angles[(i + 1) % n]) * DEG; }
  var known = [0, 0], unk = [];
  for (i = 0; i < n; i++) {
    var dv = [Math.cos(headings[i]), Math.sin(headings[i])];
    if (lengths[i] == null) unk.push(dv); else { known[0] += lengths[i] * dv[0]; known[1] += lengths[i] * dv[1]; }
  }
  var a = unk[0], b = unk[1], det = a[0] * b[1] - a[1] * b[0];
  var l1 = (-known[0] * b[1] + known[1] * b[0]) / det, l2 = (-a[0] * known[1] + a[1] * known[0]) / det;
  var L = lengths.slice(), u = 0;
  for (i = 0; i < n; i++) if (L[i] == null) L[i] = u++ === 0 ? l1 : l2;
  var pts = [[0, 0]], p = [0, 0];
  for (i = 0; i < n - 1; i++) { p = [p[0] + L[i] * Math.cos(headings[i]), p[1] + L[i] * Math.sin(headings[i])]; pts.push(p); }
  return pts;
}

function prismPts(p, lamNm, ctx) {
  var a = num(p.a, 25);
  switch (p.shape) {
    case 'equilateral': { var hh = a * Math.sqrt(3) / 2; return centred([[2 * hh / 3, 0], [-hh / 3, -a / 2], [-hh / 3, a / 2]]).map(function (q) { return q; }); }
    case 'isosceles': {                          /* apex angle p.apex (deg) pointing to local +x, equal sides a */
      var A = num(p.apex, 60) * DEG, half = a * Math.sin(A / 2), ht = a * Math.cos(A / 2);
      return centred([[ht, 0], [0, -half], [0, half]]);
    }
    case 'rightangle': return centred([[-a / 2, -a / 2], [a / 2, -a / 2], [-a / 2, a / 2]]);
    case 'dove': {
      /* 45° Dove prism; default length from the design index so the axial ray reflects at the base centre: L = a (1 + 1/tan(45° - θt)) */
      var n = indexOf(p.material, lamNm || 587.6, ctx), tt = Math.asin(Math.sin(45 * DEG) / n);
      var L = num(p.L, a * (1 + 1 / Math.tan(45 * DEG - tt)));
      return centred([[-a / 2, -L / 2], [-a / 2, L / 2], [a / 2, L / 2 - a], [a / 2, -L / 2 + a]]);
    }
    case 'pellinbroca': {
      /* interior angles 90°, 75°, 135°, 60° (constant 90° deviation prism); two sides = a (proportions: learning geometry) */
      return centred(polyByAngles([90, 75, 135, 60], [a, null, null, a]));
    }
    case 'polygon': default: {
      if (Array.isArray(p.pts) && p.pts.length >= 3) return centred(p.pts.map(function (q) { return [num(q[0], 0), num(q[1], 0)]; }));
      var h2 = a * Math.sqrt(3) / 2; return centred([[2 * h2 / 3, 0], [-h2 / 3, -a / 2], [-h2 / 3, a / 2]]);
    }
  }
}

function lensSurfaces(list, D, warn, id, extra) {
  /* list: [{c, k, A, z, matAfter}], first matBefore = ambient; returns surfaces + barrel */
  var out = [], r = D / 2, zs = [];
  for (var i = 0; i < list.length; i++) {
    var L = list[i], sh = conicShape(L.c, L.k, L.A, L.cyl);
    var rr = r;
    if (L.c !== 0 && (1 + sh.k) * L.c * L.c * r * r > 1) { rr = 1 / Math.abs(L.c) / Math.sqrt(Math.max(1 + sh.k, 1e-9)) * 0.999; warn.push(id + ': aperture larger than the surface allows — clipped'); }
    out.push(surf([0, 0, L.z], IDENT, sh, { type: 'circle', r: rr }, 'refract', { mNeg: i === 0 ? null : list[i - 1].mat, mPos: L.mat, coat: L.coat, face: i }));
    var sg = sagOf(sh, L.cyl === 'y' ? 0 : rr, L.cyl === 'y' ? rr : 0);
    zs.push(L.z + (isFinite(sg) ? sg : 0));
  }
  /* note mNeg/mPos: light travels +z; material before surface i is on the -z (Neg) side */
  for (i = 0; i < out.length; i++) { out[i].mNeg = i === 0 ? null : list[i - 1].mat; out[i].mPos = list[i].mat; }
  var z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
  for (i = 1; i < zs.length; i++) if (zs[i] < zs[i - 1] - 1e-9) warn.push(id + ': negative edge thickness');
  out.push(surf([0, 0, 0], IDENT, { type: 'barrel', r: r, z0: z0, z1: z1 }, null, 'absorb', { edge: true }));
  return out;
}

function arCoat(on) { return on ? { R: 0 } : undefined; }

/* build surfaces of one element in its frame */
function buildElement(el, ctx, warn) {
  var p = withDefaults(el.kind, el.params), S = [], k = el.kind, D;
  if (p.stock) p = fromStock(p);
  switch (k) {
    case 'source': break;
    case 'lens': {
      D = num(p.D, 25.4);
      if (p.R3 != null && p.CT1 != null) { p.kind = 'doublet'; return buildElement({ id: el.id, kind: 'doublet', params: p }, ctx, warn); }   /* stock achromat */
      var CT = num(p.CT, 3), c1 = curv(p.R1), c2 = curv(p.R2);
      S = lensSurfaces([
        { c: c1, k: p.k1, A: p.A1, z: -CT / 2, mat: p.material, cyl: p.cyl, coat: arCoat(p.ar) },
        { c: c2, k: p.k2, A: p.A2, z: CT / 2, mat: null, cyl: p.cyl, coat: arCoat(p.ar) }], D, warn, el.id);
      break;
    }
    case 'doublet': {
      D = num(p.D, 25.4);
      var t1 = num(p.CT1, 4), t2 = num(p.CT2, 2.5), z0 = -(t1 + t2) / 2;
      S = lensSurfaces([
        { c: curv(p.R1), z: z0, mat: p.mat1, coat: arCoat(p.ar) },
        { c: curv(p.R2), z: z0 + t1, mat: p.mat2 },
        { c: curv(p.R3), z: z0 + t1 + t2, mat: null, coat: arCoat(p.ar) }], D, warn, el.id);
      break;
    }
    case 'idealmirror':
      S.push(surf([0, 0, 0], IDENT, plane(), apOf(p, 25.4), 'idealmirror', { f: num(p.f, 100), reflectance: num(p.reflectance, 1) }));
      break;
    case 'thinlens':
      S.push(surf([0, 0, 0], IDENT, plane(), { type: 'circle', r: num(p.D, 25.4) / 2 }, 'thinlens', { f: num(p.f, 100) }));
      break;
    case 'mirror': {
      var R = num(p.R, 0), cm = R === 0 ? 0 : -1 / R;       /* R > 0: concave towards the incoming light (from local -z) */
      var ap = apOf(p, 25.4);
      if (Array.isArray(p.offset)) { ap.dx = num(p.offset[0], 0); ap.dy = num(p.offset[1], 0); }
      S.push(surf([0, 0, 0], IDENT, conicShape(cm, p.k, p.A), ap, 'mirror', { reflectance: num(p.reflectance, 1), coat: p.coat }));
      break;
    }
    case 'window': case 'bsplate': {
      var t = num(p.t, 3), front = k === 'bsplate' ? (p.coat || { R: num(p.R, 0.5) }) : (p.coatFront || arCoat(p.ar));
      var back = k === 'bsplate' ? (p.coatBack || { R: 0 }) : (p.coatBack || arCoat(p.ar));
      if (num(p.W, 0) > 0 || num(p.H, 0) > 0 || k === 'bsplate') {
        var W = num(p.W, num(p.D, 25.4)), H = num(p.H, W);
        /* rectangle in (x,z): faces 0: z=-t/2 (front), 1: x=+W/2, 2: z=+t/2 (back), 3: x=-W/2 */
        var pts = [[-W / 2, -t / 2], [W / 2, -t / 2], [W / 2, t / 2], [-W / 2, t / 2]];
        S = polySurfaces(pts, H, p.material, { 0: { coat: front }, 2: { coat: back } });
      } else {
        S = lensSurfaces([{ c: 0, z: -t / 2, mat: p.material, coat: front }, { c: 0, z: t / 2, mat: null, coat: back }], num(p.D, 25.4), warn, el.id);
      }
      break;
    }
    case 'bscube': {
      var a = num(p.a, 12.7), half = a / 2, arF = p.ar !== false ? { R: 0 } : undefined;
      var fo = { 0: { coat: arF }, 1: { coat: arF }, 2: { coat: arF }, 3: { coat: arF } };
      S = polySurfaces([[-half, -half], [half, -half], [half, half], [-half, half]], a, p.material, fo);
      var s2 = Math.SQRT1_2, ext = Math.max(0, Math.min(1, num(p.extinction, 0)));
      var coat = p.pbs ? { Rs: 1 - ext, Rp: 0, Ts: ext, Tp: 1 } : (p.coat || { R: num(p.R, 0.5) });
      /* hypotenuse x = z: reflected port = local +x */
      S.push(surf([0, 0, 0], cols([-s2, 0, -s2], [0, 1, 0], [s2, 0, -s2]), plane(), { type: 'rect', hw: a * s2, hh: half }, 'coat',
        { mNeg: p.material, mPos: p.material, coat: coat, diag: true }));
      break;
    }
    case 'prism': {
      var h = num(p.h, num(p.a, 25)), pp = prismPts(p, ctx.designNm, ctx), fopts = {};
      if (p.ar) for (var fi = 0; fi < pp.length; fi++) fopts[fi] = { coat: { R: 0 } };
      if (Array.isArray(p.mirrorFaces)) p.mirrorFaces.forEach(function (fi2) { fopts[fi2] = { act: 'mirrorIn' }; });
      S = polySurfaces(pp, h, p.material, fopts);
      break;
    }
    case 'grating': {
      S.push(surf([0, 0, 0], IDENT, plane(), apOf(p, 25), 'grating', {
        lpmm: num(p.lpmm, 600), mode: p.mode === 'transmit' ? 'transmit' : 'reflect', maxOrder: Math.max(0, Math.min(10, Math.round(num(p.maxOrder, 3)))),
        orders: Array.isArray(p.orders) ? p.orders.map(function (m) { return Math.round(num(m, 0)); }) : null, eff: p.eff || null, blazeNm: num(p.blazeNm, 0) }));
      break;
    }
    case 'polarizer':
      S.push(surf([0, 0, 0], IDENT, plane(), apOf(p, 25.4), 'polarizer', { angle: num(p.angle, 0) * DEG, ext: Math.max(0, Math.min(1, num(p.extinction, 0))) }));
      break;
    case 'waveplate':
      S.push(surf([0, 0, 0], IDENT, plane(), apOf(p, 25.4), 'waveplate', { angle: num(p.angle, 45) * DEG, waves: num(p.waves, 0.25), lambda0: num(p.lambda0Nm, 633), dispersive: p.dispersive !== false }));
      break;
    case 'faraday':
      S.push(surf([0, 0, 0], IDENT, plane(), apOf(p, 10), 'faraday', { rot: num(p.rotation, 45) * DEG }));
      break;
    case 'iris':
      S.push(surf([0, 0, 0], IDENT, plane(), { type: 'circle', r: num(p.Dout, 50) / 2, r0: num(p.D, 5) / 2 }, 'absorb'));
      break;
    case 'slit':
      S.push(surf([0, 0, 0], IDENT, plane(), { type: 'frame', hw: num(p.Wout, 50) / 2, hh: num(p.Hout, 50) / 2, iw: num(p.w, 0.1) / 2, ih: num(p.h, 10) / 2 }, 'absorb'));
      break;
    case 'blocker':
      S.push(surf([0, 0, 0], IDENT, plane(), apOf(p, 25.4), 'absorb'));
      break;
    case 'screen': case 'powermeter':
      S.push(surf([0, 0, 0], IDENT, plane(), apOf(p, k === 'powermeter' ? 9.5 : 25), 'detect', { transparent: !!p.transparent }));
      break;
    case 'fiber':
      S.push(surf([0, 0, 0], IDENT, plane(), { type: 'circle', r: num(p.Dferrule, 2.5) / 2 }, 'fiber', { core: num(p.coreD, 0.05) / 2, NA: num(p.NA, 0.22) }));
      break;
    case 'retro': {
      /* hollow corner cube: three mutually perpendicular mirrors, apex at the element origin, opening towards local -z */
      var a2 = num(p.a, 25.4), w = [0, 0, -1], u = [], r3 = Math.sqrt(2 / 3), i3 = 1 / Math.sqrt(3);
      for (var j = 0; j < 3; j++) { var ph = j * 2 * Math.PI / 3; u.push([r3 * Math.cos(ph) + 0, r3 * Math.sin(ph), 0].map(function (v, ii) { return v + i3 * w[ii]; })); }
      if (dot(cross(u[0], u[1]), u[2]) < 0) { var tmp = u[1]; u[1] = u[2]; u[2] = tmp; }
      var faces = [[2, 1, 0], [0, 2, 1], [1, 0, 2]];    /* [ex, ey, normal index]: ex x ey = -u[normal] */
      for (j = 0; j < 3; j++) {
        var f = faces[j], nn = scale(u[f[2]], -1);
        S.push(surf([0, 0, 0], cols(u[f[0]], u[f[1]], nn), plane(), { type: 'rect', hw: a2 / 2, hh: a2 / 2, dx: a2 / 2, dy: a2 / 2 }, 'mirror', { reflectance: 1 }));
      }
      break;
    }
    default:
      throw new Error('OptTrace: unknown element kind "' + k + '"');
  }
  return { params: p, surfaces: S };
}

/* =====================================================================================
   5. Scene compilation (world transforms, bounding spheres) and validation
   ===================================================================================== */
function poseMatrix(pose, flip) {
  pose = pose || {};
  var M = mulMM(rotZ(num(pose.rz, 0) * DEG), mulMM(rotY(num(pose.ry, 0) * DEG), mulMM(rotX(num(pose.rx, 0) * DEG), BASE)));
  return flip ? mulMM(M, FLIP) : M;
}
function posePos(pose) { pose = pose || {}; return [num(pose.x, 0), num(pose.y, 0), num(pose.z, 0)]; }

var LIMITS = { elements: 500, raysPerSource: 20000, depth: 200, segments: 2000000 };

function validateScene(scene) {
  var errors = [];
  if (!scene || typeof scene !== 'object') return { ok: false, errors: ['scene is not an object'] };
  var els = scene.elements;
  if (!Array.isArray(els)) return { ok: false, errors: ['scene.elements must be an array'] };
  if (els.length > LIMITS.elements) errors.push('too many elements (' + els.length + ' > ' + LIMITS.elements + ')');
  var seen = {};
  els.forEach(function (e, i) {
    if (!e || typeof e !== 'object') { errors.push('element ' + i + ' is not an object'); return; }
    var id = e.id == null ? '#' + i : String(e.id);
    if (seen[id]) errors.push('duplicate id ' + id);
    seen[id] = 1;
    if (!KINDS[e.kind]) errors.push(id + ': unknown kind ' + e.kind);
    var pose = e.pose || {};
    ['x', 'y', 'z', 'rx', 'ry', 'rz'].forEach(function (k) { if (pose[k] != null && !isFinite(Number(pose[k]))) errors.push(id + ': pose.' + k + ' not finite'); });
    if (e.kind === 'source') {
      var n = num(e.params && e.params.n, 9);
      if (!(n >= 1 && n <= LIMITS.raysPerSource)) errors.push(id + ': ray count must be 1..' + LIMITS.raysPerSource);
    }
  });
  return { ok: errors.length === 0, errors: errors };
}

function compile(scene, opts) {
  var v = validateScene(scene);
  if (!v.ok) throw new Error('OptTrace: invalid scene — ' + v.errors.join('; '));
  var ctx = { ambientN: num(opts.ambientN, scene.ambientN != null ? num(scene.ambientN, 1) : 1), designNm: num(opts.designNm, 587.6) }, warn = [];
  var elements = [], sources = [];
  scene.elements.forEach(function (e, i) {
    if (e.enabled === false) return;
    var id = e.id == null ? '#' + i : String(e.id);
    var b = buildElement({ id: id, kind: e.kind, params: e.params }, ctx, warn);
    var W = poseMatrix(e.pose, !!b.params.flip), P = posePos(e.pose);
    var el = { id: id, kind: e.kind, params: b.params, W: W, pos: P, surfaces: [], bound: 0 };
    b.surfaces.forEach(function (s, si) {
      var o = add(P, mulMV(W, s.o)), R = mulMM(W, s.R);
      s.ow = o; s.Rw = R; s.el = el; s.idx = si;
      var ext;
      if (s.shape.type === 'barrel') ext = Math.hypot(s.shape.r, Math.max(Math.abs(s.shape.z0), Math.abs(s.shape.z1)));
      else {
        var ar = apRadius(s.ap) || 1e3, sg = s.shape.c ? Math.min(Math.abs(1 / s.shape.c), ar) : 0;
        if (s.shape.A) sg += Math.abs(sagOf(s.shape, Math.min(ar, 1e3), 0)) || 0;
        ext = Math.hypot(ar, sg);
      }
      el.bound = Math.max(el.bound, Math.hypot(s.o[0], s.o[1], s.o[2]) + ext + 1e-6);
      el.surfaces.push(s);
    });
    if (e.kind === 'source') sources.push(el);
    else elements.push(el);
    if (e.kind === 'fiber' && b.params.out) el.out = { W: poseMatrix(b.params.out, false), pos: posePos(b.params.out) };
  });
  return { elements: elements, sources: sources, ctx: ctx, warnings: warn };
}

/* =====================================================================================
   6. Sources → rays (deterministic sampling: sunflower disk / cap, fans, grids)
   ===================================================================================== */
var GOLD = Math.PI * (3 - Math.sqrt(5));
function spectrum(p) {
  var s = p.spectrum, out = [], i;
  if (p.type === 'white' && !s) s = { kind: 'white' };
  if (p.type === 'led' && !s && !Array.isArray(p.lambdaNm)) s = { kind: 'gauss', centre: num(p.lambdaNm, 530), fwhm: num(p.fwhmNm, 30), n: 5 };
  if (s && s.kind === 'white') {
    /* equal-energy spectrum sampled uniformly (CIE illuminant E — learning assumption for "white light") */
    var n = Math.max(2, Math.min(31, Math.round(num(s.n, 7)))), a = num(s.nm0, 400), b = num(s.nm1, 700);
    for (i = 0; i < n; i++) out.push({ nm: a + (b - a) * i / (n - 1), w: 1 / n });
    return out;
  }
  if (s && s.kind === 'gauss') {
    /* Gaussian LED spectrum (learning assumption), samples at centre ± 1.5 FWHM */
    var m = Math.max(1, Math.min(15, Math.round(num(s.n, 5)))), c = num(s.centre, 530), fw = num(s.fwhm, 30), sig = fw / 2.3548, tot = 0;
    for (i = 0; i < m; i++) { var x = m === 1 ? 0 : -1.5 * fw + 3 * fw * i / (m - 1), w = Math.exp(-x * x / (2 * sig * sig)); out.push({ nm: c + x, w: w }); tot += w; }
    out.forEach(function (o) { o.w /= tot; });
    return out;
  }
  var L = Array.isArray(p.lambdaNm) ? p.lambdaNm : [p.lambdaNm];
  var ws = Array.isArray(p.weights) ? p.weights : null, tw = 0;
  for (i = 0; i < L.length; i++) { var wi = ws ? num(ws[i], 1) : 1; out.push({ nm: num(L[i], 633), w: wi }); tw += wi; }
  out.forEach(function (o) { o.w /= tw; });
  return out;
}
/* 2D sample points in the unit disk / square for a pattern; returns [[u,v], ...] with |u|,|v| <= 1 */
function pattern2D(pat, n) {
  var pts = [], i;
  if (n <= 1) return [[0, 0]];
  switch (pat) {
    case 'fan': for (i = 0; i < n; i++) pts.push([-1 + 2 * i / (n - 1), 0]); break;
    case 'fany': for (i = 0; i < n; i++) pts.push([0, -1 + 2 * i / (n - 1)]); break;
    case 'cross': {
      var h = Math.max(2, Math.floor((n + 1) / 2));
      for (i = 0; i < h; i++) pts.push([-1 + 2 * i / (h - 1), 0]);
      for (i = 0; i < h; i++) { var y = -1 + 2 * i / (h - 1); if (Math.abs(y) > 1e-12) pts.push([0, y]); }
      break;
    }
    case 'ring': pts.push([0, 0]); for (i = 0; i < n - 1; i++) { var a = 2 * Math.PI * i / (n - 1); pts.push([Math.cos(a), Math.sin(a)]); } break;
    case 'grid': {
      var m = Math.max(2, Math.ceil(Math.sqrt(n * 4 / Math.PI)));
      for (var r = 0; r < m; r++) for (var c = 0; c < m; c++) {
        var u = -1 + 2 * (c + 0.5) / m, v = -1 + 2 * (r + 0.5) / m;
        if (u * u + v * v <= 1) pts.push([u, v]);
      }
      break;
    }
    case 'disk': default:
      for (i = 0; i < n; i++) { var rr = Math.sqrt((i + 0.5) / n), ph = i * GOLD; pts.push([rr * Math.cos(ph), rr * Math.sin(ph)]); }
  }
  return pts;
}
function polJones(p, ex, ey) {
  var pol = p.pol || 'unpolarized';
  if (pol === 'unpolarized' || pol === 'unpolarised' || pol === 'none') return null;
  if (pol === 'circular+' || pol === 'circular-') {
    var sg = pol === 'circular+' ? 1 : -1;
    return [ex[0], sg * ey[0], ex[1], sg * ey[1], ex[2], sg * ey[2]];
  }
  if (pol === 'jones' && Array.isArray(p.jones)) {
    var a = p.jones[0] || [1, 0], b = p.jones[1] || [0, 0];
    var ar = num(a[0], 0), ai = num(a[1], 0), br = num(b[0], 0), bi = num(b[1], 0), e = [];
    for (var i = 0; i < 3; i++) e.push(ar * ex[i] + br * ey[i], ai * ex[i] + bi * ey[i]);
    return e;
  }
  var th = num(p.polAngle, 0) * DEG, c = Math.cos(th), s = Math.sin(th);
  return [c * ex[0] + s * ey[0], 0, c * ex[1] + s * ey[1], 0, c * ex[2] + s * ey[2], 0];
}
function makeJ(p, d, W, P) {
  /* transverse basis from the source local x/y projected perpendicular to d */
  var lx = mulMV(W, [1, 0, 0]), ex = norm(sub(lx, scale(d, dot(lx, d))));
  if (dot(ex, ex) < 0.5) ex = perp(d);
  var ey = cross(d, ex);
  var e = polJones(p, ex, ey);
  return e ? jonesToJ(e, P) : unpolJ(d, P);
}

function emit(src, ctx) {
  var p = src.params, W = src.W, O = src.pos, type = p.type || 'laser';
  var n = Math.max(1, Math.min(LIMITS.raysPerSource, Math.round(num(p.n, 9))));
  var spec = spectrum(p), P = num(p.P, 0.001), rays = [];
  var samples = [];                              /* {lp:[x,y,0] local position, ld:[...] local direction, w} */
  var pat = p.pattern || 'fan', i;
  if (type === 'point' || type === 'led') {
    var alpha = Math.min(89.9, Math.max(0, num(p.halfAngle, type === 'led' ? 60 : 10))) * DEG;
    var dirs = [];
    if (pat === 'fan' || pat === 'fany' || pat === 'cross') {
      pattern2D(pat, n).forEach(function (q) { var tx = Math.tan(q[0] * alpha), ty = Math.tan(q[1] * alpha); dirs.push(norm([tx, ty, 1])); });
    } else {
      /* equal-solid-angle sampling of the cap: cos θ uniform in [cos α, 1] */
      var ca = Math.cos(alpha);
      for (i = 0; i < n; i++) { var cz2 = 1 - (1 - ca) * (i + 0.5) / n, sz = Math.sqrt(1 - cz2 * cz2), ph = i * GOLD; dirs.push([sz * Math.cos(ph), sz * Math.sin(ph), cz2]); }
    }
    var Rr = type === 'led' ? num(p.D, 0) / 2 : 0;
    dirs.forEach(function (dd, j) {
      var w = type === 'led' ? dd[2] : 1;          /* Lambertian: radiant intensity ∝ cos θ */
      var lp = [0, 0, 0];
      if (Rr > 0) { var rr = Math.sqrt((j + 0.5) / dirs.length) * Rr, ph = j * GOLD * 1.618; lp = [rr * Math.cos(ph), rr * Math.sin(ph), 0]; }
      samples.push({ lp: lp, ld: dd, w: w });
    });
  } else {
    /* collimated / laser / white: positions across the beam */
    var gauss = type === 'laser' || p.profile === 'gaussian';
    var wr = type === 'laser' ? num(p.w0, 0.5) : num(p.w, num(p.D, 2) / 2);
    var Rb = type === 'laser' ? num(p.clip, 1) * wr : num(p.D, 2) / 2;
    var rect = num(p.W, 0) > 0 && num(p.H, 0) > 0;
    var theta = 0;
    if (type === 'laser' && p.divergence) theta = num(p.M2, 1) * (spec[0].nm * 1e-6) / (Math.PI * wr);   /* far-field half-angle M² λ / (π w0) */
    pattern2D(pat, n).forEach(function (q) {
      var x = rect ? q[0] * num(p.W, 0) / 2 : q[0] * Rb, y = rect ? q[1] * num(p.H, 0) / 2 : q[1] * Rb;
      var w = gauss ? Math.exp(-2 * (x * x + y * y) / (wr * wr)) : 1;
      var ld = theta ? norm([x / wr * theta, y / wr * theta, 1]) : [0, 0, 1];
      samples.push({ lp: [x, y, 0], ld: ld, w: w });
    });
  }
  var tw = 0; samples.forEach(function (s) { tw += s.w; });
  if (!(tw > 0)) return rays;
  spec.forEach(function (sp) {
    var nAmb = indexOf(null, sp.nm, ctx);
    samples.forEach(function (s, j) {
      var pw = P * sp.w * s.w / tw;
      if (!(pw > 0)) return;
      var d = norm(mulMV(W, s.ld)), o = add(O, mulMV(W, s.lp));
      rays.push({ o: o, d: d, J: makeJ(p, d, W, pw), P: pw, lam: sp.nm, n: nAmb, opl: 0, depth: 0, vl: null, src: src.id, sample: j });
    });
  });
  return rays;
}

/* =====================================================================================
   7. Interactions
   ===================================================================================== */
function coatValue(v, lam) {
  if (typeof v === 'number') return v;
  if (v && Array.isArray(v.lambda_nm) && Array.isArray(v.R)) return interp(v.lambda_nm, v.R, lam);
  return NaN;
}
function interp(xs, ys, x) {
  if (!xs.length) return NaN;
  if (x <= xs[0]) return ys[0];
  for (var i = 1; i < xs.length; i++) if (x <= xs[i]) { var f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + f * (ys[i] - ys[i - 1]); }
  return ys[ys.length - 1];
}
function coatRT(coat, lam) {
  /* power reflectance/transmittance for s and p; {R} | {Rs,Rp} | {R:{lambda_nm,R}} | {Rs:{..},Rp:{..}} ; A = absorptance (default 0) */
  var A = num(coat.A, 0), Rs, Rp;
  if (coat.Rs != null || coat.Rp != null) { Rs = coatValue(coat.Rs != null ? coat.Rs : coat.R, lam); Rp = coatValue(coat.Rp != null ? coat.Rp : coat.R, lam); }
  else Rs = Rp = coatValue(coat.R, lam);
  Rs = Math.max(0, Math.min(1, Rs || 0)); Rp = Math.max(0, Math.min(1, Rp || 0));
  var Ts = coat.Ts != null ? num(coat.Ts, 0) : Math.max(0, 1 - Rs - A), Tp = coat.Tp != null ? num(coat.Tp, 0) : Math.max(0, 1 - Rp - A);
  return { Rs: Rs, Rp: Rp, Ts: Ts, Tp: Tp };
}

/* Fresnel / coated interface. N = world unit normal to the + side. Returns {r:{d,J}, t:{d,J,n}|null, tir:bool, cosi, n1, n2} */
function interfaceSplit(d, J, N, nNeg, nPos, coat, lam) {
  var dn = dot(d, N), n1, n2, Nf;
  if (dn < 0) { n1 = nPos; n2 = nNeg; Nf = N; } else { n1 = nNeg; n2 = nPos; Nf = scale(N, -1); }
  var cosi = Math.min(1, -dot(d, Nf));
  var s = cross(d, Nf), sl = Math.sqrt(dot(s, s));
  s = sl > 1e-12 ? scale(s, 1 / sl) : perp(d);
  var pi = cross(s, d), dr = norm(axpy(d, 2 * cosi, Nf)), pr = cross(s, dr);
  var eta = n1 / n2, sin2t = eta * eta * (1 - cosi * cosi);
  var rs, rp;
  if (sin2t > 1) {
    var K = Math.sqrt(sin2t - 1);
    rs = cdiv(n1 * cosi, -n2 * K, n1 * cosi, n2 * K);
    rp = cdiv(n2 * cosi, -n1 * K, n2 * cosi, n1 * K);
    return { r: { d: dr, J: rank2(rs[0], rs[1], s, s, rp[0], rp[1], pr, pi, J) }, t: null, tir: true, cosi: cosi, n1: n1, n2: n2 };
  }
  var cost = Math.sqrt(1 - sin2t), dt = norm(axpy(scale(d, eta), eta * cosi - cost, Nf)), pt = cross(s, dt);
  var ts, tp, f = 1;
  if (coat) {
    var c = coatRT(coat, lam);
    rs = -Math.sqrt(c.Rs); rp = Math.sqrt(c.Rp); ts = Math.sqrt(c.Ts); tp = Math.sqrt(c.Tp);
  } else {
    var a = n1 * cosi, b = n2 * cost, a2 = n2 * cosi, b2 = n1 * cost;
    rs = (a - b) / (a + b); rp = (a2 - b2) / (a2 + b2); ts = 2 * a / (a + b); tp = 2 * a / (a2 + b2);
    f = Math.sqrt((n2 * cost) / (n1 * cosi));
  }
  return { r: { d: dr, J: rank2(rs, 0, s, s, rp, 0, pr, pi, J) }, t: { d: dt, J: rank2(ts * f, 0, s, s, tp * f, 0, pt, pi, J) }, tir: false, cosi: cosi, n1: n1, n2: n2 };
}

function rotateJ(J, d0, d1) {
  var R = rotBetween(d0, d1);
  return sandwich(cFromReal(R), J);
}

/* =====================================================================================
   8. Non-sequential trace
   ===================================================================================== */
function viaArr(vl) { var a = []; while (vl) { a.push(vl.id); vl = vl.prev; } return a.reverse(); }
var PL = [0, 0, 0], DL = [0, 0, 0], BP = [0, 0, 0], BD = [0, 0, 0];     /* scratch: ray in the surface frame, best hit */
function nearestHit(comp, o, d, skip) {
  var best = null, bt = Infinity, els = comp.elements, o0 = o[0], o1 = o[1], o2 = o[2], d0 = d[0], d1 = d[1], d2 = d[2];
  /* bounding-sphere culling: an element is tested only if its sphere is entered before the best hit so far */
  for (var e = 0; e < els.length; e++) {
    var el = els[e], pos = el.pos;
    var vx = pos[0] - o0, vy = pos[1] - o1, vz = pos[2] - o2;
    var tca = vx * d0 + vy * d1 + vz * d2, dd = vx * vx + vy * vy + vz * vz - tca * tca, rb = el.bound;
    if (dd > rb * rb || tca + rb < EPS_T || tca - Math.sqrt(rb * rb - dd) > bt) continue;
    var surfs = el.surfaces;
    for (var s = 0; s < surfs.length; s++) {
      var S = surfs[s];
      var R = S.Rw, ow = S.ow, ox = o0 - ow[0], oy = o1 - ow[1], oz = o2 - ow[2];
      PL[0] = R[0] * ox + R[3] * oy + R[6] * oz; PL[1] = R[1] * ox + R[4] * oy + R[7] * oz; PL[2] = R[2] * ox + R[5] * oy + R[8] * oz;
      DL[0] = R[0] * d0 + R[3] * d1 + R[6] * d2; DL[1] = R[1] * d0 + R[4] * d1 + R[7] * d2; DL[2] = R[2] * d0 + R[5] * d1 + R[8] * d2;
      var t = intersectT(S.shape, PL, DL);
      if (!(t > 0) || t >= bt) continue;
      if (S === skip && t < 1e-6) continue;
      if (S.shape.type !== 'barrel' && !inAperture(S.ap, PL[0] + t * DL[0], PL[1] + t * DL[1])) continue;
      bt = t; best = S; BP[0] = PL[0]; BP[1] = PL[1]; BP[2] = PL[2]; BD[0] = DL[0]; BD[1] = DL[1]; BD[2] = DL[2];
    }
  }
  if (!best) return null;
  var hh = hitAt(best.shape, BP, BD, bt);
  return hh ? { t: bt, S: best, l: hh.l, nl: hh.n } : null;
}

function mkChild(ray, p, S, opl, vl, d, J, n, extra) {
  var c = { o: p, d: d, J: J, P: cTrace(J), lam: ray.lam, n: n, opl: opl, depth: ray.depth + 1, vl: vl, src: ray.src, lastS: S, sample: ray.sample, order: undefined, tir: false, ghost: false };
  if (extra) { if (extra.opl !== undefined) c.opl = extra.opl; if (extra.order !== undefined) c.order = extra.order; if (extra.tir) c.tir = true; if (extra.ghost) c.ghost = true; }
  return c;
}
function trace(scene, opts) {
  opts = opts || {};
  var t0 = Date.now();
  var comp = scene && scene.elements && scene.sources && scene.ctx ? scene : compile(scene, opts);
  var ctx = comp.ctx;
  var maxDepth = Math.max(1, Math.min(LIMITS.depth, Math.round(num(opts.maxDepth, 60))));
  var maxSeg = Math.max(1, Math.min(LIMITS.segments, Math.round(num(opts.maxSegments, 200000))));
  var escape = num(opts.escape, 1000);
  var ghosts = !!opts.ghosts;
  var rays = [];
  comp.sources.forEach(function (s) { rays = rays.concat(emit(s, ctx)); });
  var Psrc = 0; rays.forEach(function (r) { Psrc += r.P; });
  var minP = opts.minPower != null ? num(opts.minPower, 0) : num(opts.minRelPower, 1e-4) * (rays.length ? Psrc / rays.length : 0);
  var stride = 10, cap = 4096, segs = new Float32Array(cap * stride), nSeg = 0;
  var res = {
    version: VERSION, stride: stride, segs: null, nSeg: 0, hits: {}, absorbed: {}, detected: {}, coupled: {}, escaped: 0, dropped: 0, ghostLoss: 0, truncated: 0,
    sourcePower: Psrc, warnings: comp.warnings.slice(), stats: { rays: rays.length, interactions: 0, ms: 0 }, escapedRays: []
  };
  function pushSeg(a, b, P, lam, depth, srcIdx) {
    if (nSeg >= cap) { var g = new Float32Array(cap * 2 * stride); g.set(segs); segs = g; cap *= 2; }
    var k = nSeg * stride;
    segs[k] = a[0]; segs[k + 1] = a[1]; segs[k + 2] = a[2]; segs[k + 3] = b[0]; segs[k + 4] = b[1]; segs[k + 5] = b[2];
    segs[k + 6] = P; segs[k + 7] = lam; segs[k + 8] = depth; segs[k + 9] = srcIdx;
    nSeg++;
  }
  function addTo(map, id, v) { map[id] = (map[id] || 0) + v; }
  var srcIndex = {}; comp.sources.forEach(function (s, i) { srcIndex[s.id] = i; });
  var stack = rays.slice().reverse();
  while (stack.length) {
    var ray = stack.pop();
    if (nSeg >= maxSeg) { res.truncated += ray.P; continue; }
    if (ray.depth >= maxDepth) { res.truncated += ray.P; continue; }
    var hit = nearestHit(comp, ray.o, ray.d, ray.lastS);
    if (!hit) {
      var end = axpy(ray.o, escape, ray.d);
      pushSeg(ray.o, end, ray.P, ray.lam, ray.depth, srcIndex[ray.src]);
      res.escaped += ray.P;
      if (opts.keepEscaped) res.escapedRays.push({ o: ray.o, d: ray.d, P: ray.P, lam: ray.lam, via: viaArr(ray.vl), opl: ray.opl, J: ray.J, src: ray.src, depth: ray.depth, order: ray.order, tir: !!ray.tir, sample: ray.sample });
      continue;
    }
    var S = hit.S, el = S.el, p = axpy(ray.o, hit.t, ray.d);
    pushSeg(ray.o, p, ray.P, ray.lam, ray.depth, srcIndex[ray.src]);
    res.stats.interactions++;
    var opl = ray.opl + ray.n * hit.t;
    var N = norm(mulMV(S.Rw, hit.nl));
    var kids = [];
    var vl = { id: el.id, prev: ray.vl };
    var lam = ray.lam;
    var lost = 0;                                       /* power leaving through a sink other than absorption at el (ghost loss) */
    var sink = 0;                                       /* power booked as coupled into a fibre without output */
    switch (S.act) {
      case 'refract': case 'coat': {
        var nc = S.nc || (S.nc = new Map()), np = nc.get(lam);
        if (!np) { np = [indexOf(S.mNeg, lam, ctx), indexOf(S.mPos, lam, ctx)]; nc.set(lam, np); }
        var nNeg = np[0], nPos = np[1];
        var sp = interfaceSplit(ray.d, ray.J, N, nNeg, nPos, S.coat, lam);
        if (sp.tir) { kids.push(mkChild(ray, p, S, opl, vl, sp.r.d, sp.r.J, sp.n1, { tir: true })); break; }
        kids.push(mkChild(ray, p, S, opl, vl, sp.t.d, sp.t.J, sp.n2));
        /* reflected ray: always at beamsplitter coatings (R >= 1 %), at bare/AR faces only with ghosts on; otherwise booked as ghost loss */
        var cr = S.coat ? coatRT(S.coat, lam) : null;
        if (S.act === 'coat' || ghosts || (cr && Math.max(cr.Rs, cr.Rp) >= 0.01)) kids.push(mkChild(ray, p, S, opl, vl, sp.r.d, sp.r.J, sp.n1, { ghost: !(S.act === 'coat' || cr) }));
        else lost = cTrace(sp.r.J);
        break;
      }
      case 'mirror': case 'mirrorIn': {
        var front = S.act === 'mirrorIn' ? true : dot(ray.d, N) > 0;   /* reflecting side faces local -z; mirrorIn: polished face of a solid (both sides) */
        if (!front) break;                                              /* back of the mirror: absorbed */
        var Rm = S.coat ? coatRT(S.coat, lam) : { Rs: num(S.reflectance, 1), Rp: num(S.reflectance, 1) };
        var dnn = dot(ray.d, N), dr = norm(axpy(ray.d, -2 * dnn, N));
        var s = cross(ray.d, N), sl = Math.sqrt(dot(s, s)); s = sl > 1e-12 ? scale(s, 1 / sl) : perp(ray.d);
        kids.push(mkChild(ray, p, S, opl, vl, dr, rank2(-Math.sqrt(Rm.Rs), 0, s, s, Math.sqrt(Rm.Rp), 0, cross(s, dr), cross(s, ray.d), ray.J), ray.n));
        break;
      }
      case 'idealmirror': {
        /* perfect focusing mirror (paraxial phase surface in reflection): every ray of a collimated beam meets the focus at f in front of the mirror */
        var dlm = mulMtV(S.Rw, ray.d);
        if (!(dlm[2] > 1e-9)) break;                                   /* back side absorbs */
        var fm = S.f, uxm = dlm[0] / dlm[2] - hit.l[0] / fm, uym = dlm[1] / dlm[2] - hit.l[1] / fm;
        var dm = norm(mulMV(S.Rw, [uxm, uym, -1]));
        var Rm2 = Math.sqrt(S.reflectance), JM = rotateJ(ray.J, ray.d, dm);
        kids.push(mkChild(ray, p, S, opl, vl, dm, Rm2 === 1 ? JM : cScale(JM, S.reflectance), ray.n));
        break;
      }
      case 'thinlens': {
        var dl = mulMtV(S.Rw, ray.d), f = S.f;
        if (Math.abs(dl[2]) < 1e-9 || !f) { kids.push(mkChild(ray, p, S, opl, vl, ray.d, ray.J, ray.n)); break; }
        var az = Math.abs(dl[2]), ux = dl[0] / az - hit.l[0] / f, uy = dl[1] / az - hit.l[1] / f;
        var dn2 = norm(mulMV(S.Rw, [ux, uy, dl[2] > 0 ? 1 : -1]));
        var r2 = hit.l[0] * hit.l[0] + hit.l[1] * hit.l[1];
        kids.push(mkChild(ray, p, S, opl, vl, dn2, rotateJ(ray.J, ray.d, dn2), ray.n, { opl: opl - (f > 0 ? 1 : -1) * ray.n * (Math.sqrt(r2 + f * f) - Math.abs(f)) }));
        break;
      }
      case 'grating': {
        /* vector grating equation: n2 t' = n1 t + m (λ/Λ) g  (t = tangential part of the unit direction, g = grating vector ⊥ grooves) */
        var Nd = dot(ray.d, N), tan = axpy(ray.d, -Nd, N), g = norm(mulMV(S.Rw, [1, 0, 0]));
        var Lam = 1 / S.lpmm, lamMm = lam * 1e-6, orders = [], m;
        var mmax = S.maxOrder;
        for (m = -mmax; m <= mmax; m++) if (!S.orders || S.orders.indexOf(m) >= 0) {
          var tn = axpy(tan, m * lamMm / Lam / ray.n, g), t2 = dot(tn, tn);
          if (t2 < 1) orders.push({ m: m, tn: tn, nz: Math.sqrt(1 - t2) });
        }
        if (!orders.length) break;
        var eff = [], tot = 0;
        orders.forEach(function (o) {
          var e;
          if (S.eff && S.eff[o.m] != null) e = num(S.eff[o.m], 0);
          else if (S.blazeNm > 0) { var x = Math.PI * (o.m - S.blazeNm / lam); e = Math.abs(x) < 1e-9 ? 1 : Math.pow(Math.sin(x) / x, 2); }
          else e = 1;
          eff.push(e); tot += e;
        });
        var explicit = !!S.eff;
        var sgn = (Nd > 0 ? 1 : -1) * (S.mode === 'reflect' ? -1 : 1);
        orders.forEach(function (o, i) {
          var w = explicit ? eff[i] : (tot > 0 ? eff[i] / tot : 0);   /* without user efficiencies: normalised (learning assumption) */
          if (!(w > 0)) return;
          var dnew = norm(axpy(o.tn, sgn * o.nz, N));
          kids.push(mkChild(ray, p, S, opl, vl, dnew, cScale(rotateJ(ray.J, ray.d, dnew), w), ray.n, { order: o.m }));
        });
        break;
      }
      case 'polarizer': case 'waveplate': case 'faraday': {
        var d0 = ray.d, M2;
        if (S.act === 'faraday') {
          var sg = dot(d0, N) >= 0 ? 1 : -1;               /* rotation sense fixed by the magnet axis (local +z), not by the propagation: non-reciprocal */
          M2 = cFromReal(rotAxis(d0, sg * S.rot));
        } else {
          var ax = mulMV(S.Rw, [Math.cos(S.angle), Math.sin(S.angle), 0]);
          var a = norm(sub(ax, scale(d0, dot(ax, d0)))), b = cross(d0, a);
          var delta = S.act === 'polarizer' ? 0 : 2 * Math.PI * S.waves * (S.dispersive ? S.lambda0 / lam : 1);
          var c2r = S.act === 'polarizer' ? Math.sqrt(S.ext) : Math.cos(delta), c2i = S.act === 'polarizer' ? 0 : Math.sin(delta);
          kids.push(mkChild(ray, p, S, opl, vl, d0, rank2(1, 0, a, a, c2r, c2i, b, b, ray.J), ray.n));
          break;
        }
        kids.push(mkChild(ray, p, S, opl, vl, d0, sandwich(M2, ray.J), ray.n));
        break;
      }
      case 'detect': {
        var rec = { x: hit.l[0], y: hit.l[1], p: p, d: ray.d, P: ray.P, lam: lam, opl: opl, J: ray.J, via: viaArr(ray.vl), src: ray.src, depth: ray.depth, sample: ray.sample, back: dot(ray.d, N) < 0 };
        (res.hits[el.id] || (res.hits[el.id] = [])).push(rec);
        addTo(res.detected, el.id, ray.P);
        if (S.transparent) kids.push(mkChild(ray, p, S, opl, vl, ray.d, ray.J, ray.n));
        break;
      }
      case 'fiber': {
        var dl2 = mulMtV(S.Rw, ray.d), rr = Math.hypot(hit.l[0], hit.l[1]), sinT = Math.sqrt(Math.max(0, 1 - dl2[2] * dl2[2])) * ray.n;
        var rec2 = { x: hit.l[0], y: hit.l[1], p: p, d: ray.d, P: ray.P, lam: lam, opl: opl, J: ray.J, via: viaArr(ray.vl), src: ray.src, depth: ray.depth, sample: ray.sample, coupled: false };
        if (dl2[2] > 0 && rr <= S.core && sinT <= S.NA + 1e-12) {
          rec2.coupled = true;
          addTo(res.coupled, el.id, ray.P);
          if (!el.out) sink = ray.P;
          if (el.out) {
            /* geometric multimode model: the angle to the fibre axis is kept, the azimuth is scrambled (golden-angle steps), output unpolarised */
            var nOut = Math.max(1, Math.min(64, Math.round(num(el.params.outRays, 1)))), th = Math.asin(Math.min(1, sinT / ray.n));
            for (var q = 0; q < nOut; q++) {
              var phi = Math.atan2(hit.l[1], hit.l[0]) + (q + 1) * GOLD * 3.1, od = norm(mulMV(el.out.W, [Math.sin(th) * Math.cos(phi), Math.sin(th) * Math.sin(phi), Math.cos(th)]));
              var op = add(el.out.pos, mulMV(el.out.W, [hit.l[0], hit.l[1], 0]));
              var cj = unpolJ(od, ray.P / nOut);
              kids.push({ o: op, d: od, J: cj, P: ray.P / nOut, lam: lam, n: ray.n, opl: opl, depth: ray.depth + 1, vl: vl, src: ray.src, lastS: null, fiberOut: true, sample: ray.sample });
              pushSeg(p, op, 0, lam, ray.depth, srcIndex[ray.src]);   /* zero-power connector segment (drawn as the fibre) */
            }
          }
        }
        (res.hits[el.id] || (res.hits[el.id] = [])).push(rec2);
        break;
      }
      case 'absorb': default: break;
    }
    var out = 0;
    for (var i = 0; i < kids.length; i++) {
      var kd = kids[i];
      out += kd.P;
      if (kd.P < minP) { res.dropped += kd.P; continue; }
      stack.push(kd);
    }
    res.ghostLoss += lost;
    var abs = ray.P - out - lost - sink;
    if (S.act !== 'detect' || S.transparent) { if (Math.abs(abs) > 1e-18 * ray.P) addTo(res.absorbed, el.id, abs); }
    else if (S.act === 'detect') { /* detected power already booked */ }
  }
  res.segs = segs.subarray(0, nSeg * stride);
  res.nSeg = nSeg;
  res.stats.ms = Date.now() - t0;
  res.stats.segments = nSeg;
  var bal = res.escaped + res.dropped + res.ghostLoss + res.truncated, k;
  for (k in res.absorbed) bal += res.absorbed[k];
  for (k in res.detected) bal += res.detected[k];
  for (k in res.coupled) if (!(comp.elements.filter(function (e) { return e.id === k && e.out; }).length)) bal += res.coupled[k];
  res.balance = bal;                                 /* = sourcePower for lossless bookkeeping (fibre outputs re-emit coupled power) */
  return res;
}

/* =====================================================================================
   9. Sequential trace (lens prescription along +z) — cross-check path for lensdesign
   ===================================================================================== */
/* sys = { object: 'air', surfaces: [{ R | c, k, A:[A4..], t (to next), material (after; 'MIRROR' reflects), sd }] }
   ray = { p:[x,y,z], d:[dx,dy,dz], lambdaNm }  → { ok, pts, dirs, opl, vignetted:[i...], fail: null|'miss'|'tir', n } */
function seqTrace(sys, ray, opts) {
  opts = opts || {};
  var ctx = { ambientN: num(opts.ambientN, 1) };
  var lam = num(ray.lambdaNm, 587.6), p = ray.p.slice(), d = norm(ray.d), z = 0;
  var nPrev = indexOf(sys.object || null, lam, ctx), opl = 0, pts = [], dirs = [], vig = [], J = opts.J || null;
  var prevMat = sys.object || null;
  for (var i = 0; i < sys.surfaces.length; i++) {
    var s = sys.surfaces[i], c = s.c != null ? num(s.c, 0) : curv(s.R);
    var sh = conicShape(c, s.k, s.A || s.asph, s.cyl);
    var pl = [p[0], p[1], p[2] - z];
    var h = intersectShape(sh, pl, d);
    if (!h) {
      /* allow a hit "behind" (virtual) only for plane-like dummy surfaces at the current point */
      return { ok: false, fail: 'miss', at: i, pts: pts, dirs: dirs, opl: opl, vignetted: vig };
    }
    var q = [h.l[0], h.l[1], h.l[2] + z];
    if (s.sd != null && Math.hypot(q[0], q[1]) > num(s.sd, Infinity) * (1 + 1e-12)) { vig.push(i); if (opts.clip) return { ok: false, fail: 'vignetted', at: i, pts: pts, dirs: dirs, opl: opl, vignetted: vig }; }
    opl += nPrev * h.t;
    var N = h.n, mat = s.material;
    if (typeof mat === 'string' && /^mirror$/i.test(mat)) {
      var dn = dot(d, N); d = norm(axpy(d, -2 * dn, N));
    } else {
      var n2 = indexOf(mat == null ? null : mat, lam, ctx);
      var Nf = dot(d, N) < 0 ? N : scale(N, -1), ci = -dot(d, Nf), eta = nPrev / n2, s2 = eta * eta * (1 - ci * ci);
      if (s2 > 1) return { ok: false, fail: 'tir', at: i, pts: pts.concat([q]), dirs: dirs, opl: opl, vignetted: vig };
      d = norm(axpy(scale(d, eta), eta * ci - Math.sqrt(1 - s2), Nf));
      nPrev = n2; prevMat = mat;
    }
    p = q; pts.push(q); dirs.push(d);
    z += num(s.t, 0);
  }
  return { ok: true, pts: pts, dirs: dirs, opl: opl, vignetted: vig, p: p, d: d, n: nPrev, zLast: z };
}
/* z where a meridional (y–z) ray finally crosses the axis (y = 0) */
function axisCrossing(r) {
  if (!r.ok || Math.abs(r.d[1]) < 1e-300) return NaN;
  return r.p[2] - r.p[1] * r.d[2] / r.d[1];
}
/* paraxial focus and effective focal length from a tiny-height collimated ray (h = 1e-5 mm by default) */
function seqParaxial(sys, lambdaNm, h) {
  h = h || 1e-5;
  var r = seqTrace(sys, { p: [0, h, -1], d: [0, 0, 1], lambdaNm: lambdaNm });
  if (!r.ok) return null;
  var zf = axisCrossing(r), u = r.d[1] / r.d[2];
  return { focusZ: zf, efl: -h / u, bfl: zf - r.pts[r.pts.length - 1][2] };
}

/* =====================================================================================
   10. Analysis helpers
   ===================================================================================== */
function spot(hits, filter) {
  var P = 0, cx = 0, cy = 0, n = 0, list = [];
  (hits || []).forEach(function (h) { if (!filter || filter(h)) { list.push(h); P += h.P; cx += h.P * h.x; cy += h.P * h.y; n++; } });
  if (!n || !(P > 0)) return { n: 0, P: 0, cx: NaN, cy: NaN, rms: NaN, geo: NaN };
  cx /= P; cy /= P;
  var m2 = 0, geo = 0;
  list.forEach(function (h) { var r2 = (h.x - cx) * (h.x - cx) + (h.y - cy) * (h.y - cy); m2 += h.P * r2; geo = Math.max(geo, Math.sqrt(r2)); });
  return { n: n, P: P, cx: cx, cy: cy, rms: Math.sqrt(m2 / P), geo: geo };
}
function irradiance(hits, o) {
  o = o || {};
  var W = num(o.W, 10), H = num(o.H, W), nx = Math.max(1, Math.round(num(o.nx, 64))), ny = Math.max(1, Math.round(num(o.ny, nx)));
  var cx = num(o.cx, 0), cy = num(o.cy, 0), map = new Float64Array(nx * ny), area = (W / nx) * (H / ny), peak = 0, tot = 0;
  (hits || []).forEach(function (h) {
    var i = Math.floor((h.x - cx + W / 2) / W * nx), j = Math.floor((h.y - cy + H / 2) / H * ny);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return;
    map[j * nx + i] += h.P / area; tot += h.P;
  });
  for (var k = 0; k < map.length; k++) peak = Math.max(peak, map[k]);
  return { nx: nx, ny: ny, W: W, H: H, map: map, peak: peak, P: tot, unit: 'W/mm²' };
}
/* best focus along an axis a (unit) through point o for rays {p|o, d, P}: minimises the power-weighted RMS radius on planes ⊥ a */
function focusAlong(rays, o, a) {
  a = norm(a);
  var e1 = perp(a), e2 = cross(a, e1), W = 0, sums = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var al = [], list = [];
  rays.forEach(function (r) {
    var p = r.p || r.o, d = r.d, da = dot(d, a);
    if (Math.abs(da) < 1e-12) return;
    var q = sub(p, o), qa = dot(q, a);
    var bx = dot(d, e1) / da, by = dot(d, e2) / da, ax = dot(q, e1) - qa * bx, ay = dot(q, e2) - qa * by;
    list.push([ax, bx, ay, by, r.P || 1]);
  });
  if (list.length < 2) return null;
  var w = 0, mAx = 0, mBx = 0, mAy = 0, mBy = 0;
  list.forEach(function (l) { w += l[4]; mAx += l[4] * l[0]; mBx += l[4] * l[1]; mAy += l[4] * l[2]; mBy += l[4] * l[3]; });
  mAx /= w; mBx /= w; mAy /= w; mBy /= w;
  var cab = 0, vb = 0, va = 0;
  list.forEach(function (l) {
    var ax = l[0] - mAx, bx = l[1] - mBx, ay = l[2] - mAy, by = l[3] - mBy;
    cab += l[4] * (ax * bx + ay * by); vb += l[4] * (bx * bx + by * by); va += l[4] * (ax * ax + ay * ay);
  });
  var s = vb > 0 ? -cab / vb : 0, rms2 = (va + 2 * s * cab + s * s * vb) / w;
  return { s: s, point: axpy(o, s, a), rms: Math.sqrt(Math.max(0, rms2)), rms0: Math.sqrt(va / w) };
}
/* Stokes parameters of J in the transverse basis (ex, ey): S3 = 2 Im(Ex* Ey) */
function stokes(J, ex, ey) {
  function q(u, v) {                               /* u^T J v (complex) */
    var re = 0, im = 0;
    for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) { var k = (a * 3 + b) * 2; re += u[a] * J[k] * v[b]; im += u[a] * J[k + 1] * v[b]; }
    return [re, im];
  }
  var xx = q(ex, ex)[0], yy = q(ey, ey)[0], xy = q(ex, ey);
  var S0 = xx + yy, S1 = xx - yy, S2 = 2 * xy[0], S3 = -2 * xy[1];
  var Ip = Math.sqrt(S1 * S1 + S2 * S2 + S3 * S3);
  return { S0: S0, S1: S1, S2: S2, S3: S3, dop: S0 > 0 ? Ip / S0 : 0, azimuthDeg: 0.5 * Math.atan2(S2, S1) / DEG, ellipticityDeg: Ip > 0 ? 0.5 * Math.asin(Math.max(-1, Math.min(1, S3 / Ip))) / DEG : 0 };
}
/* transverse basis of a detector hit: surface-local x, y projected ⊥ d */
function hitBasis(comp, elId, d) {
  var el = (comp.elements || []).filter(function (e) { return e.id === elId; })[0];
  var R = el ? el.surfaces[0].Rw : BASE, lx = mulMV(R, [1, 0, 0]);
  var ex = norm(sub(lx, scale(d, dot(lx, d)))); return { ex: ex, ey: cross(d, ex) };
}
function powerBudget(res, comp) {
  var rows = [], ids = {};
  [res.absorbed, res.detected, res.coupled].forEach(function (m) { for (var k in m) ids[k] = 1; });
  (comp ? comp.elements : []).forEach(function (e) { ids[e.id] = 1; });
  Object.keys(ids).forEach(function (id) {
    rows.push({ id: id, absorbed: res.absorbed[id] || 0, detected: res.detected[id] || 0, coupled: res.coupled[id] || 0 });
  });
  rows.push({ id: '(escaped)', absorbed: res.escaped, detected: 0, coupled: 0 });
  rows.push({ id: '(ghost reflections not followed)', absorbed: res.ghostLoss, detected: 0, coupled: 0 });
  rows.push({ id: '(below threshold / limits)', absorbed: res.dropped + res.truncated, detected: 0, coupled: 0 });
  return rows;
}
/* group detector hits by path (sequence of elements) with power and mean optical path length */
function pathTable(hits) {
  var g = {};
  (hits || []).forEach(function (h) {
    var key = h.via.join(' → ');
    var e = g[key] || (g[key] = { path: key, n: 0, P: 0, opl: 0 });
    e.n++; e.P += h.P; e.opl += h.P * h.opl;
  });
  return Object.keys(g).map(function (k) { var e = g[k]; e.opl = e.P > 0 ? e.opl / e.P : NaN; return e; }).sort(function (a, b) { return b.P - a.P; });
}

return {
  version: VERSION,
  KINDS: KINDS,
  LIMITS: LIMITS,
  defaults: withDefaults,
  validateScene: validateScene,
  compile: function (scene, opts) { return compile(scene, opts || {}); },
  trace: trace,
  seq: { trace: seqTrace, axisCrossing: axisCrossing, paraxial: seqParaxial },
  analysis: { spot: spot, irradiance: irradiance, focusAlong: focusAlong, stokes: stokes, hitBasis: hitBasis, powerBudget: powerBudget, pathTable: pathTable },
  util: {
    n: function (mat, lambdaNm, ambientN) { return indexOf(mat, lambdaNm, { ambientN: ambientN == null ? 1 : ambientN }); },
    poseMatrix: poseMatrix, fresnel: interfaceSplit, sag: sagOf, intersect: intersectShape, rotBetween: rotBetween,
    jonesToJ: jonesToJ, unpolJ: unpolJ, trace3: cTrace, dot: dot, cross: cross, norm: norm, mulMV: mulMV, emit: emit, prismPoints: prismPts
  }
};
});
