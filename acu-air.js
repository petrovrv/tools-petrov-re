/* acu-air.js — global AcuAir: engine of the tool `airbornesound` (Airborne Sound Insulation Between Rooms) of the tools.petrov.re Acoustics BE package.
   EN ISO 12354-1:2017 §4.4 simplified model: R′w of a separating wall / floor with its direct path Dd and, per edge (normally 4), the flanking paths
   Ff, Fd, Df (Formula (18)–(20)), lightweight flanking elements through Dn,f,w (Formula (21)), small technical elements through Dn,e,w (Formula (18)),
   linings by Formula (22)/(23) with ΔRw from Annex D.2.2 Table D.1 (resonance frequency by Formula (D.1)/(D.2)) or from a lab value; element Rw by
   the mass law of Annex B.4 (B.11/B.12) or from a lab value / 1/3-octave bands rated by EN ISO 717-1; Kij by Annex E.3 (AcuCore.kij).
   DnT,w = R′w + 10 lg(0,32·V/S); the single numbers with C / Ctr come from the same model run with RA = Rw + C (Note 2 of §4.4.2: exact for R′A).
   Belgian quantities (NBN S 01-400-1:2022 §4): DA = DnT,w + C; RA,50 = Rw + C50-3150 of the separating ELEMENT (lab value, D-BW-27).
   Pure functions, no DOM. UMD: browser global AcuAir (AcuCore loaded first), node module.exports.
   Planning aid only — acoustic design and in-situ verification by a qualified acoustician per NBN S 01-400-1 / -3. */
(function (root, factory) {
  var core = (root && root.AcuCore) || (typeof require === 'function' ? require('./acoustics-be-core.js') : null);
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AcuAir = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C) {
'use strict';

var VERSION = '0.2.0';
var lg = function (x) { return Math.log(x) / Math.LN10; };
function isNum(v) { return typeof v === 'number' && isFinite(v); }

var I1 = 'EN ISO 12354-1 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 1: Airborne sound insulation between rooms';
var S = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var SOURCES = {
  air_18: S(I1, '2017', '§4.4.2 Formula (18) (R′w = energy sum of Dd, Ff, Fd, Df and small elements)'),
  air_19: S(I1, '2017', '§4.4.2 Formula (19)–(20) (RDd,w; RFf,w, RFd,w, RDf,w)'),
  air_21: S(I1, '2017', '§4.4.2 Formula (21) (lightweight flanking element from Dn,f,w; Fd and Df neglected)'),
  air_22: S(I1, '2017', '§4.4.3 d)–e) Formula (22)–(23) (two linings: higher value + half of the lower)'),
  air_d2: S(I1, '2017', 'Annex D.2.1 Formula (D.1)–(D.2), D.2.2 Table D.1 (interior linings, 20 ≤ Rw ≤ 60 dB)'),
  air_dnt: S(I1, '2017', '§3 / Formula (3)–(4) with T0 = 0,5 s: DnT = R′ + 10 lg(0,32·V/S)'),
  air_442: S(I1, '2017', '§4.4.1, §4.4.3 b) (Kij averaged over 250–1 000 Hz), §4.4.4 limitations'),
  air_5: S(I1, '2017', '§5 accuracy (simplified model ≈ 2 dB standard deviation)'),
  air_10: S(I1, '2017', '§4.2.2 Formula (10) (Dv,ij,situ ≥ 0 dB) and Annex J Formula (J.3) (minimum Kij ≈ −5 dB)'),
  la_air_flex: S('Interpretation of this tool: the flanking element is separated from the separating element by elastic joints on both sides of their junction line (wall flanking a party wall: vertical joints on both sides; party floor: walls above and below stand on / carry elastic strips) — Ff crosses two joints, Fd and Df one (EN ISO 12354-1 E.3.4 a/b, Fig. E.5)', 'acu-air ' + VERSION, '', 'learning_assumption'),
  la_air_cc: S('Learning assumption of this tool: load on the interlayer not given → Cc = 15 dB (load class 80–750 kN/m², usual for load-bearing walls; E.3.4 gives 20 dB only below 80 kN/m²)', 'acu-air ' + VERSION, '', 'learning_assumption'),
  la_air_e35: S('Learning assumption of this tool: the E.3.5 lightweight junction (light double-leaf separating wall: Ff along the continuous homogeneous element K24, Fd / Df K12; light flanking leaf crossing a heavy separating element: Ff K13) is used inside the simplified model, although §4.4.1 treats lightweight constructions through Dn,f (Formula (21)) — prefer a measured Dn,f,w when available', 'acu-air ' + VERSION, '', 'learning_assumption'),
  la_air_kmin: S('Learning assumption of this tool: Kij is not taken below the in-situ minimum of Formula (10) with ai = aj = S/l0 and the flanking element areas taken equal to the separating area, Kij,min = 10 lg(lf·l0/S) (Annex J (J.3): ≈ −5 dB)', 'acu-air ' + VERSION, '', 'learning_assumption'),
  la_air_ca: S('Learning assumption of this tool: the A-weighted run (R′A = R′w + C) uses the linings’ ΔRw also for ΔRA and the mass-law C of AcuCore (−1 / −2 dB)', 'acu-air ' + VERSION, '', 'learning_assumption'),
  la_air_whatif: S('Learning assumption of this tool: what-if lining = 12,5 mm board 10 kg/m² on free-standing studs, 50 mm cavity with mineral wool (Formula (D.2)); doubling = 2 × m′ of the separating element by B.11', 'acu-air ' + VERSION, '', 'learning_assumption')
};

/* ---------- linings (Annex D.2) ---------- */
var THIRD_C = [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300];
/* centre of the 1/3-octave band in which f0 falls (band edges at fc·2^(±1/6)) — D.2.2 "rounded to the centre frequency" */
function bandOf(f0) {
  var best = THIRD_C[0];
  THIRD_C.forEach(function (fc) { if (f0 >= fc * Math.pow(2, -1 / 6)) best = fc; });
  return best;
}
/* resonance frequency: D.1 (layer fixed directly, s′ in MN/m³) or D.2 (studs not connected, porous filling, cavity d in m) — f0 in Hz */
function liningF0(o) {
  var m1 = o.m1, m2 = o.m2;
  if (!isNum(m1) || !isNum(m2) || m1 <= 0 || m2 <= 0) return null;
  var s = o.type === 'studs' ? (isNum(o.d) && o.d > 0 ? 0.111 / o.d : null) : (isNum(o.s) && o.s > 0 ? o.s : null);
  if (s == null) return null;
  return Math.sqrt(1e6 * s * (1 / m1 + 1 / m2)) / (2 * Math.PI);
}
/* Table D.1: ΔRw from the band of f0 and the Rw of the bare element */
function dRwTableD1(f0, Rw) {
  var warnings = [], fb = bandOf(f0), dR;
  if (f0 < 30 * Math.pow(2, -1 / 6) || fb < 31.5) { warnings.push('lining_f0_low'); fb = 31.5; }
  if (fb <= 160) dR = Math.max(0, 74.4 - 20 * lg(fb) - Rw / 2);
  else if (fb === 200) dR = -1; else if (fb === 250) dR = -3; else if (fb === 315) dR = -5; else if (fb === 400) dR = -7; else if (fb === 500) dR = -9;
  else if (fb <= 1600) dR = -10;
  else { dR = -5; if (fb > 5000) warnings.push('lining_f0_high'); }
  if (Rw < 20 || Rw > 60) warnings.push('lining_rw_range');
  return { dRw: dR, f0: f0, band: fb, warnings: warnings };
}
/* lining spec {type:'none'|'lab'|'direct'|'studs', dR, m2, s, d} on an element of mass m1 and bare Rw -> {dR, f0, band, warnings} */
function lining(spec, m1, Rw) {
  if (!spec || !spec.type || spec.type === 'none') return { dR: null };
  if (spec.type === 'lab') return isNum(spec.dR) ? { dR: spec.dR, src: 'lab' } : { dR: null, warnings: ['lining_missing'] };
  var f0 = liningF0({ type: spec.type, m1: m1, m2: spec.m2, s: spec.s, d: spec.d });
  if (f0 == null) return { dR: null, warnings: ['lining_missing'] };
  var t = dRwTableD1(f0, Rw);
  return { dR: t.dRw, f0: f0, band: t.band, src: 'air_d2', warnings: t.warnings };
}

/* ---------- element single numbers ---------- */
/* el {src:'mass'|'lab'|'bands', m, Rw, C, Ctr, C50, bands} -> {ok, Rw, C, Ctr, C50, m, src, reason, rating} */
function element(el) {
  el = el || {};
  var m = el.m;
  if (!isNum(m) || m <= 0) return { ok: false, reason: 'mass' };
  if (el.src === 'bands') {
    var r;
    try { r = C.rate717_1(el.bands, { range: 'third' }); } catch (e) { return { ok: false, reason: 'bands', detail: e.message }; }
    return { ok: true, m: m, Rw: r.Xw, C: r.C, Ctr: r.Ctr, C50: r.C50_3150, src: 'bands', rating: r };
  }
  if (el.src === 'lab') {
    if (!isNum(el.Rw)) return { ok: false, reason: 'rw' };
    return { ok: true, m: m, Rw: el.Rw, C: isNum(el.C) ? el.C : null, Ctr: isNum(el.Ctr) ? el.Ctr : null, C50: isNum(el.C50) ? el.C50 : null, src: 'lab' };
  }
  var ml = C.massLaw(m);
  if (!ml.ok) return { ok: false, reason: ml.reason };
  return { ok: true, m: m, Rw: ml.Rw, C: ml.C, Ctr: ml.Ctr, C50: null, src: 'mass' };
}

/* ---------- Kij per edge ---------- */
var EDGE_JUNCTIONS = ['rigid_cross', 'rigid_T', 'flexible_cross', 'flexible_T', 'lightweight', 'dnf'];
/* flanking element continues through the junction (element 1–3 of Annex E), the separating element is perpendicular:
   Ff = straight path (M = lg(m′s/m′F)), Fd / Df = corner paths. flexible_*: flanking element cut by elastic joints on both sides of its junction
   line with the separating element (Fig. E.5) → Ff 2 joints, Fd/Df 1; load not given → Cc 15 (la_air_cc).
   lightweight (E.3.5, Fig. E.7: 1/3 = lightweight double-leaf wall, 2/4 = continuous homogeneous element): a light separating wall (< 150 kg/m²)
   meeting a continuous homogeneous flanking element → Ff runs along the homogeneous element past the light wall = K24 (path 'light_straight',
   valid m′F/m′s > 3), Fd / Df = K12; a heavy separating element crossed by a light double-leaf flanking element → Ff = K13 (path 'straight'). */
function edgeK(edge, mSep, opt) {
  var j = edge.junction, mF = edge.m;
  var base = { m_i: mF, m_perp: mSep, f: opt && isNum(opt.f) ? opt.f : undefined, load_kNm2: edge.load_kNm2, fl: edge.fl };
  if ((j === 'flexible_cross' || j === 'flexible_T') && !isNum(edge.load_kNm2)) base.Cc = 15;
  function k(path, joints) { var o = Object.assign({}, base, { junction: j, path: path }); if (joints != null) o.joints = joints; return C.kij(o); }
  var flex = j === 'flexible_cross' || j === 'flexible_T';
  var ffPath = j === 'lightweight' && mSep < 150 ? 'light_straight' : 'straight';
  var Ff = k(ffPath, flex ? 2 : undefined), Fd = k('corner', flex ? 1 : undefined), Df = k('corner', flex ? 1 : undefined);
  return { Ff: Ff, Fd: Fd, Df: Df };
}

/* ---------- the model ---------- */
function round1(x) { return Math.round(x * 10) / 10; }
/* one run of Formula (18)–(20) with a given single-number field ('w' → Rw, 'A' → Rw + C, 'tr' → Rw + Ctr); returns null if a term is missing */
function runModel(sep, edges, smalls, Ss, which) {
  function val(e) { if (which === 'w') return e.Rw; var c = which === 'A' ? e.C : e.Ctr; return isNum(c) ? e.Rw + c : null; }
  var Rs = val(sep.el); if (Rs == null) return null;
  var paths = [{ id: 'Dd', edge: null, R: Rs + (sep.dRDd || 0) }];
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    if (e.dnf) {
      var dn = which === 'w' ? e.Dnf : (which === 'A' ? (isNum(e.DnfC) ? e.Dnf + e.DnfC : null) : (isNum(e.DnfCtr) ? e.Dnf + e.DnfCtr : null));
      if (dn == null) return null;
      paths.push({ id: 'Ff' + e.n, edge: e.n, R: dn + 10 * lg((e.llab / e.lf) * (Ss / C.A0)) });
      continue;
    }
    var RF = val(e.el); if (RF == null) return null;
    paths.push({ id: 'Ff' + e.n, edge: e.n, R: C.Rij(RF, RF, e.dRFf, e.K.Ff, Ss, e.lf) });
    paths.push({ id: 'Fd' + e.n, edge: e.n, R: C.Rij(RF, Rs, e.dRFd, e.K.Fd, Ss, e.lf) });
    paths.push({ id: 'Df' + e.n, edge: e.n, R: C.Rij(Rs, RF, e.dRDf, e.K.Df, Ss, e.lf) });
  }
  var tau = 0;
  paths.forEach(function (p) { p.tau = Math.pow(10, -p.R / 10); tau += p.tau; });
  smalls.forEach(function (s, i) {
    var dne = which === 'w' ? s.Dne : (which === 'A' ? (isNum(s.C) ? s.Dne + s.C : null) : (isNum(s.Ctr) ? s.Dne + s.Ctr : null));
    if (dne == null) { tau = NaN; return; }
    var t = (s.n || 1) * (C.A0 / Ss) * Math.pow(10, -dne / 10);
    paths.push({ id: 'e' + (i + 1), edge: null, R: -10 * lg(t), tau: t }); tau += t;
  });
  if (!isFinite(tau)) return null;
  paths.forEach(function (p) { p.share = p.tau / tau; });
  return { R: -10 * lg(tau), paths: paths };
}

/* calc(input) — input:
   { S_m2 (separating area), V_m3 (receiving room), element:'wall'|'floor',
     sep: {src:'mass'|'lab'|'bands', m, Rw, C, Ctr, C50, bands, liningS:{…}, liningR:{…}},
     edges: [{on, junction, m, src:'mass'|'lab', Rw, C, Ctr, lf, liningF:{…}, liningf:{…}, load_kNm2, Dnf, DnfC, DnfCtr, llab}] (normally 4),
     smalls: [{Dne, C, Ctr, n}], target: {DA_min, RA50_min} }
   -> {ok, Rpw, RpA, Rptr, C, Ctr, DnTw, DA, DnTtr, RA50, paths[], edges[], dominant, target checks, warnings[], sources[]} */
function calc(inp) {
  inp = inp || {};
  var warnings = [], sources = ['air_18', 'air_19', 'air_dnt', 'air_442', 'air_5'];
  var Ss = inp.S_m2, V = inp.V_m3;
  if (!isNum(Ss) || Ss <= 0 || !isNum(V) || V <= 0) return { ok: false, reason: 'geometry' };
  var sepIn = inp.sep || {};
  var sepEl = element(sepIn);
  if (!sepEl.ok) return { ok: false, reason: 'sep_' + sepEl.reason };
  if (sepEl.src === 'mass') sources.push('iso12354_1_b11', 'iso12354_1_b12', 'la_acu_c');
  if (sepEl.src === 'bands') sources.push('iso717_1', 'iso717_1_b');
  var linS = lining(sepIn.liningS, sepEl.m, sepEl.Rw), linR = lining(sepIn.liningR, sepEl.m, sepEl.Rw);
  [linS, linR].forEach(function (l) { (l.warnings || []).forEach(function (w) { if (warnings.indexOf(w) < 0) warnings.push(w); }); if (l.src === 'air_d2') sources.push('air_d2'); });
  var sep = { el: sepEl, dRDd: C.dRcombine(linS.dR, linR.dR), linS: linS, linR: linR };
  if (linS.dR != null || linR.dR != null) sources.push('air_22');
  var lightSep = sepEl.m < 150;
  var edges = [], eOut = [];
  (inp.edges || []).forEach(function (ed, idx) {
    if (!ed || ed.on === false) return;
    var n = idx + 1;
    if (!isNum(ed.lf) || ed.lf <= 0) { warnings.push('edge_length'); return; }
    if (ed.junction === 'dnf') {
      if (!isNum(ed.Dnf)) { warnings.push('dnf_missing'); return; }
      sources.push('air_21');
      edges.push({ n: n, dnf: true, Dnf: ed.Dnf, DnfC: ed.DnfC, DnfCtr: ed.DnfCtr, llab: isNum(ed.llab) && ed.llab > 0 ? ed.llab : 4.5, lf: ed.lf });
      eOut.push({ n: n, junction: 'dnf', lf: ed.lf, Dnf: ed.Dnf });
      return;
    }
    if (EDGE_JUNCTIONS.indexOf(ed.junction) < 0) { warnings.push('edge_junction'); return; }
    var el = element(ed);
    if (!el.ok) return void eOut.push({ n: n, refused: el.reason });
    var K = edgeK(ed, sepEl.m, null);
    if (!K.Ff.ok || !K.Fd.ok || !K.Df.ok) return void eOut.push({ n: n, refused: 'kij' });
    var kw = [];
    ['Ff', 'Fd', 'Df'].forEach(function (p) { K[p].warnings.forEach(function (w) { if (kw.indexOf(w) < 0) kw.push(w); }); });
    kw.forEach(function (w) { if (warnings.indexOf(w) < 0) warnings.push(w); });
    if (ed.junction === 'lightweight') { sources.push('la_air_e35'); if (!lightSep) warnings.push('lightweight_heavy_sep'); }
    if (lightSep && ed.junction !== 'lightweight') warnings.push('light_sep_rigid');
    sources.push(K.Ff.source);
    if (ed.junction.indexOf('flexible') === 0) { sources.push('la_air_flex'); if (!isNum(ed.load_kNm2)) sources.push('la_air_cc'); }
    if (el.src === 'mass') sources.push('iso12354_1_b11', 'iso12354_1_b12', 'la_acu_c');
    /* in-situ floor of Formula (10): Dv,ij,situ ≥ 0 with a = S/l0 → Kij ≥ 10 lg(lf·l0/S) (flanking areas taken = S, la_air_kmin) */
    var kmin = 10 * lg(ed.lf * 1 / Ss), floored = false;
    ['Ff', 'Fd', 'Df'].forEach(function (p) { if (K[p].K < kmin) { K[p] = Object.assign({}, K[p], { K: kmin, floored: true }); floored = true; } });
    if (floored) { sources.push('air_10', 'la_air_kmin'); if (warnings.indexOf('kij_floor') < 0) warnings.push('kij_floor'); }
    var lF = lining(ed.liningF, el.m, el.Rw), lf = lining(ed.liningf, el.m, el.Rw);
    [lF, lf].forEach(function (l) { (l.warnings || []).forEach(function (w) { if (warnings.indexOf(w) < 0) warnings.push(w); }); if (l.src === 'air_d2') sources.push('air_d2'); });
    if (lF.dR != null || lf.dR != null) sources.push('air_22');
    var e = { n: n, el: el, lf: ed.lf, K: { Ff: K.Ff.K, Fd: K.Fd.K, Df: K.Df.K }, M: K.Ff.M,
      dRFf: C.dRcombine(lF.dR, lf.dR), dRFd: C.dRcombine(lF.dR, linR.dR), dRDf: C.dRcombine(linS.dR, lf.dR) };
    edges.push(e);
    eOut.push({ n: n, junction: ed.junction, lf: ed.lf, m: el.m, Rw: el.Rw, src: el.src, M: e.M, K: e.K, dR: { Ff: e.dRFf, Fd: e.dRFd, Df: e.dRDf }, linF: lF, linf: lf });
  });
  if (eOut.some(function (e) { return e.refused; })) return { ok: false, reason: 'edge_' + eOut.filter(function (e) { return e.refused; })[0].refused, edge: eOut.filter(function (e) { return e.refused; })[0].n };
  var smalls = (inp.smalls || []).filter(function (s) { return s && isNum(s.Dne); });
  if (smalls.length) sources.push('air_18');
  var w = runModel(sep, edges, smalls, Ss, 'w');
  var A = runModel(sep, edges, smalls, Ss, 'A');
  var tr = runModel(sep, edges, smalls, Ss, 'tr');
  if (A || tr) sources.push('la_air_ca');
  var corr = 10 * lg(0.32 * V / Ss);
  var out = { ok: true, version: VERSION, S_m2: Ss, V_m3: V, corr: corr, sep: { m: sepEl.m, Rw: sepEl.Rw, C: sepEl.C, Ctr: sepEl.Ctr, C50: sepEl.C50, src: sepEl.src, dRDd: sep.dRDd, linS: linS, linR: linR, rating: sepEl.rating || null },
    edges: eOut, paths: w.paths, Rpw: w.R, RpA: A ? A.R : null, Rptr: tr ? tr.R : null };
  out.C = A ? A.R - w.R : null; out.Ctr = tr ? tr.R - w.R : null;
  out.DnTw = w.R + corr; out.DA = A ? A.R + corr : null; out.DnTtr = tr ? tr.R + corr : null;
  out.RA50 = isNum(sepEl.C50) ? sepEl.Rw + sepEl.C50 : null;
  if (out.RA50 != null && (linS.dR != null || linR.dR != null)) warnings.push('ra50_lining');
  if (corr < 0) warnings.push('small_room');
  /* dominant flanking edge / path */
  var fl = w.paths.filter(function (p) { return p.id !== 'Dd'; }).sort(function (a, b) { return b.share - a.share; });
  out.dominant = fl.length ? fl[0].id : 'Dd';
  out.flankShare = fl.reduce(function (s, p) { return s + p.share; }, 0);
  var perEdge = {};
  w.paths.forEach(function (p) { if (p.edge != null) perEdge[p.edge] = (perEdge[p.edge] || 0) + p.share; });
  out.edgeShare = perEdge;
  var domEdge = null; Object.keys(perEdge).forEach(function (k) { if (domEdge == null || perEdge[k] > perEdge[domEdge]) domEdge = k; });
  out.domEdge = domEdge == null ? null : Number(domEdge);
  /* target checks (DA ≥, RA,50 ≥) */
  var tg = inp.target || {};
  out.checks = [];
  if (isNum(tg.DA_min)) out.checks.push({ q: 'DA', limit: tg.DA_min, value: out.DA, pass: out.DA == null ? null : round1(out.DA) >= tg.DA_min, margin: out.DA == null ? null : out.DA - tg.DA_min });
  if (isNum(tg.RA50_min)) out.checks.push({ q: 'RA50', limit: tg.RA50_min, value: out.RA50, pass: out.RA50 == null ? null : out.RA50 >= tg.RA50_min, margin: out.RA50 == null ? null : out.RA50 - tg.RA50_min });
  out.warnings = warnings;
  out.sources = sources.filter(function (v, i, a) { return a.indexOf(v) === i; });
  return out;
}

/* what-if variants of the same input: doubled separating mass (mass law only), flexible joints at the dominant flanking edge (rigid → flexible),
   a standard dry lining (12,5 mm board 10 kg/m², 50 mm cavity, mineral wool, D.2) on the receiving side of the dominant flanking element */
var WHATIF_LINING = { type: 'studs', m2: 10, d: 0.05 };
function whatIf(inp) {
  var base = calc(inp); if (!base.ok) return [];
  var out = [];
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function push(id, x) { var r = calc(x); if (r.ok) out.push({ id: id, DnTw: r.DnTw, dDnTw: r.DnTw - base.DnTw, DA: r.DA, dDA: r.DA != null && base.DA != null ? r.DA - base.DA : null, edge: x.__edge || null }); }
  if ((inp.sep || {}).src === 'mass') { var x1 = clone(inp); x1.sep.m = 2 * inp.sep.m; push('mass2', x1); }
  var de = base.domEdge, ed = de != null ? (inp.edges || [])[de - 1] : null;
  if (ed && (ed.junction === 'rigid_cross' || ed.junction === 'rigid_T')) {
    var x2 = clone(inp); x2.edges[de - 1].junction = ed.junction === 'rigid_cross' ? 'flexible_cross' : 'flexible_T'; x2.__edge = de; push('flex', x2);
  }
  if (ed && ed.junction !== 'dnf' && ed.junction !== 'lightweight' && (!ed.liningf || ed.liningf.type === 'none')) {
    var x3 = clone(inp); x3.edges[de - 1].liningf = clone(WHATIF_LINING); x3.__edge = de; push('lining', x3);
  }
  return out;
}

return {
  VERSION: VERSION, SOURCES: SOURCES, EDGE_JUNCTIONS: EDGE_JUNCTIONS, THIRD_C: THIRD_C, WHATIF_LINING: WHATIF_LINING,
  bandOf: bandOf, liningF0: liningF0, dRwTableD1: dRwTableD1, lining: lining, element: element, edgeK: edgeK, calc: calc, whatIf: whatIf, round1: round1
};
});
