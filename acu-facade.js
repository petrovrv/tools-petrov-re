/* acu-facade.js — global AcuFacade: engine of the tool `facadesound` (Façade Sound Insulation) of the tools.petrov.re Acoustics BE package.
   1. Outdoor level per façade pane (NBN S 01-400-1:2022): LA,day / LA,night given (Annex C.2 method 1), or LAref by Annex B (B.1 site
      measurement + 3 dB, B.2 measurement in front of an existing building, B.3 road typology classes 1–4 with the two-road correction) and the
      pane correction of Annex C.3 method 2 (Figures C.1–C.16, interpolation over α allowed), or from noise-map indicators by Annex D (D.4–D.6).
   2. Requirement DAtr (and D2m,A for galleries) by NBN S 01-400-1 §7.2 Tab. 3 through AcuReq.facade (acu-req.js), or a target from the project.
   3. Prediction by EN ISO 12354-3:2017 §4: τe = (Si/S)·10^(−Ri/10) (8), small elements τe = (A0/S)·10^(−Dn,e/10) (7), R′ = −10 lg Στ (1),
      D2m,nT = R′ + ΔLfs + 10 lg(0,16·V/(T0·S)) (4) with single numbers RAtr = Rw + Ctr (exact, §4.1 NOTE 6); ΔLfs by Annex C Table C.1.
   4. Quick rule of NBN S 01-400-1 Annex A Tab. A.1: RAtr ≥ DAtr + 3 + 10 lg[3(Snet + 5n)/V], Dne,Atr ≥ RAtr + 3 (and RA / DneA for galleries).
   Table cells transcribed from the rendered pages into short computational data with the clause reference; no norm table is shown on the page.
   Pure functions, no DOM. UMD: browser global AcuFacade (AcuCore and AcuReq loaded first), node module.exports.
   Planning aid only — acoustic design and in-situ verification by a qualified acoustician per NBN S 01-400-1 / -3. */
(function (root, factory) {
  var core = (root && root.AcuCore) || (typeof require === 'function' ? require('./acoustics-be-core.js') : null);
  var req = (root && root.AcuReq) || (typeof require === 'function' ? require('./acu-req.js') : null);
  var api = factory(core, req);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AcuFacade = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C, R) {
'use strict';

var VERSION = '0.1.1';
var lg = function (x) { return Math.log(x) / Math.LN10; };
function isNum(v) { return typeof v === 'number' && isFinite(v); }

var I3 = 'EN ISO 12354-3 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 3: Airborne sound insulation against outdoor sound';
var N1 = 'NBN S 01-400-1 Critères acoustiques pour les immeubles d’habitation';
var S = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var SOURCES = {
  fac_1: S(I3, '2017', '§4.1 Formula (1) (R′ = −10 lg Σ τ), §4.2 Formula (7) small elements, (8) other elements'),
  fac_4: S(I3, '2017', '§4.1 Formula (4) (D2m,nT = R′ + ΔLfs + 10 lg(0,16·V/(T0·S)), T0 = 0,5 s); NOTE 5–6 (single numbers Rw + Ctr exact)'),
  fac_43: S(I3, '2017', '§4.3 flanking transmission neglected (direct transmission of the façade elements only)'),
  fac_c1: S(I3, '2017', 'Annex C Table C.1 (façade shape level difference ΔLfs; interpolation over αw)'),
  fac_g1: S(I3, '2017', 'Annex G.1 Tables G.1–G.2 (worked example)'),
  s1_t3: S(N1, '2022', '§7.2 Tab. 3 and notes a–c (DAtr, D2m,A)'),
  s1_a: S(N1, '2022', 'Annex A Tab. A.1 (quick rule for element minima RAtr, Dne,Atr, RA, Dne,A)'),
  s1_b: S(N1, '2022', 'Annex B (LAref: B.1 measurement before construction + 3 dB, B.2 in front of the existing building, B.3 road typology classes 1–4, two roads +2/+1/0 dB)'),
  s1_c2: S(N1, '2022', 'Annex C.2 method 1 (LA per pane by a qualified acoustician)'),
  s1_c3: S(N1, '2022', 'Annex C.3 method 2 Figures C.1–C.16 (LA per pane from LAref; buildings > 20 m split in parts ≤ 20 m)'),
  s1_d: S(N1, '2022', 'Annex D.4–D.6 (LA,day = Lday + 4 dB; LA,day = Lden + 2 dB road / air, Lden − 2 dB rail; LA,night = Lnight + 8 dB)'),
  s1_73: S(N1, '2022', '§7.3.2 (the cahier des charges states LA,day / LA,night per pane and the method used)'),
  en14351: S('EN 14351-1 Windows and doors — Product standard (cited by NBN S 01-400-1 Annex A NOTE: correction for large glazed panels)', '', 'cited only', 'standard'),
  la_fac_c3: S('Interpretation of this tool: the horizontal correction (Figures C.1–C.10, sides a/b/c) and the vertical one (Figures C.12, C.14–C.16) are added; class 4 of Annex B taken at its lower bound 77 / 72 dB', 'acu-facade ' + VERSION, '', 'learning_assumption'),
  la_fac_a1: S('Interpretation of this tool: Annex A counts every small element (vents and roller-shutter boxes) in n and checks each against Dn,e,Atr ≥ RAtr + 3 dB; Tab. A.1 names only external air-transfer devices — conservative for shutter boxes', 'acu-facade ' + VERSION, '', 'learning_assumption'),
  la_fac_typ: S('Learning assumption of this tool: typical RAtr / Dn,e,Atr values offered as starting points (heavy wall 50–55, insulating double glazing 28–30, acoustic glazing 33–38 dB, trickle vent Dn,e,Atr 30–34, acoustic vent 38–44 dB) — replace by the product data', 'acu-facade ' + VERSION, '', 'learning_assumption')
};

/* ---------- 1. outdoor level per pane ---------- */
/* Annex B.3 typology classes: [LAref,day, LAref,night]; class 4 is "≥ 77 / ≥ 72" (lower bound used) */
var TYPO = { 1: [60, 55], 2: [65, 60], 3: [70, 65], 4: [77, 72] };
function twoRoads(dc) { return dc <= 0 ? 2 : dc === 1 ? 1 : 0; }   /* B.3 b): class difference 0 → +2, 1 → +1, ≥ 2 → 0 */
/* Annex C.3 Figures C.1–C.10: [a, b, c] at α = 0/15/30/45°; front pane (L = LAref) = 0.
   a = side pane that turns towards the main road as α grows, b = back pane, c = the other side (towards the second road where there is one) */
var FIG = {
  one:      [[-3, -13, -3], [-2, -10, -3], [-1, -7, -4], [0, -4, -4]],   /* C.1 / C.2 one main road */
  side_minor: [[-3, -7, -1], [-2, -7, -2], [-1, -5, -2], [0, -4, -3]],   /* C.3 / C.4 + quieter road on side c */
  corner:   [[-4, -4, 0], [-3, -4, 0], [-2, -4, -1], [-1, -4, -1]],     /* C.5 / C.6 + second main road on side c */
  back_minor: [[-2, -4, -2], [-1, -4, -2], [0, -3, -2], [0, -2, -2]],     /* C.7 / C.8 + quieter road behind */
  opposite: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]                 /* C.9 / C.10 main roads front and back */
};
var FIG_IDS = Object.keys(FIG), PANES = ['front', 'a', 'b', 'c'];
var VERT = ['none', 'roof', 'above', 'balc15', 'balc16'];
function c3Horizontal(fig, pane, alpha) {
  var t = FIG[fig]; if (!t) return null;
  if (pane === 'front') return 0;
  var k = { a: 0, b: 1, c: 2 }[pane]; if (k == null) return null;
  var al = Math.max(0, Math.min(45, isNum(alpha) ? alpha : 0)), i = Math.min(2, Math.floor(al / 15)), f = (al - 15 * i) / 15;
  return t[i][k] + f * (t[i + 1][k] - t[i][k]);
}
/* Figures C.12 (roof pane: angle β between the roof plane and the line of sight), C.14 (+1), C.15 (a: 0 / −2), C.16 (b: +1 / −1) by l < / > 2,5 m */
function c3Vertical(v, beta, l) {
  if (!v || v === 'none') return 0;
  if (v === 'roof') { var b = isNum(beta) ? beta : 0; return b <= 15 ? -3 : b <= 30 ? -5 : b <= 45 ? -8 : b <= 90 ? -10 : -15; }
  if (v === 'above') return 1;
  var short = !(isNum(l) && l > 2.5);   /* tie at 2,5 m -> the '< 2,5 m' value (higher exposure, conservative) */
  if (v === 'balc15') return short ? 0 : -2;
  if (v === 'balc16') return short ? 1 : -1;
  return null;
}
/* outdoor({method:'direct'|'typology'|'site_new'|'site_existing'|'map', LAday, LAnight, cls1, cls2 (0 = one road), mDay, mNight,
            fig, pane, alpha, vert, beta, l, src:'road'|'rail'|'air', mapKind:'lden'|'lday', Lden, Lday, Lnight})
   -> {ok, method, LAday, LAnight, LArefDay, LArefNight, corr, steps[], sources[]} */
function outdoor(o) {
  o = o || {};
  var m = o.method || 'direct', out = { ok: true, method: m, steps: [], sources: [] };
  function st(code, v) { out.steps.push({ code: code, v: v }); }
  if (m === 'direct') {
    out.LAday = isNum(o.LAday) ? o.LAday : null; out.LAnight = isNum(o.LAnight) ? o.LAnight : null; out.sources.push('s1_c2');
  } else if (m === 'map') {
    var air = o.src !== 'rail';
    if (o.mapKind === 'lday') { out.LAday = isNum(o.Lday) ? o.Lday + 4 : null; st('lday4', 4); }
    else { out.LAday = isNum(o.Lden) ? o.Lden + (air ? 2 : -2) : null; st(air ? 'lden2' : 'lden_2', air ? 2 : -2); }
    out.LAnight = isNum(o.Lnight) ? o.Lnight + 8 : null; if (out.LAnight != null) st('lnight8', 8);
    out.sources.push('s1_d', 's1_c2');
  } else {
    var rd, rn;
    if (m === 'typology') {
      var t1 = TYPO[o.cls1]; if (!t1) return { ok: false, reason: 'typology' };
      rd = t1[0]; rn = t1[1];
      var t2 = TYPO[o.cls2];
      if (t2) { var dc = Math.abs(o.cls1 - o.cls2), add = twoRoads(dc); rd = Math.max(t1[0], t2[0]) + add; rn = Math.max(t1[1], t2[1]) + add; st('two_roads', add); }
      if (o.cls1 === 4 || o.cls2 === 4) out.sources.push('la_fac_c3');
    } else if (m === 'site_new') { rd = isNum(o.mDay) ? o.mDay + 3 : null; rn = isNum(o.mNight) ? o.mNight + 3 : null; st('site3', 3); }
    else if (m === 'site_existing') { rd = isNum(o.mDay) ? o.mDay : null; rn = isNum(o.mNight) ? o.mNight : null; }
    else return { ok: false, reason: 'method' };
    out.LArefDay = rd; out.LArefNight = rn; out.sources.push('s1_b');
    var h = c3Horizontal(o.fig || 'one', o.pane || 'front', o.alpha), v = c3Vertical(o.vert, o.beta, o.l);
    if (h == null || v == null) return { ok: false, reason: 'pane' };
    out.corrH = h; out.corrV = v; out.corr = h + v;
    if (h) st('c3_h', h); if (v) st('c3_v', v);
    out.LAday = rd == null ? null : rd + out.corr; out.LAnight = rn == null ? null : rn + out.corr;
    out.sources.push('s1_c3'); if (v && h) out.sources.push('la_fac_c3');
  }
  if (out.LAday == null && out.LAnight == null) return { ok: false, reason: 'level' };
  return out;
}

/* ---------- 2. façade shape ΔLfs (EN ISO 12354-3 Annex C Table C.1) ---------- */
/* rows: line of sight < 1,5 m / 1,5–2,5 m / > 2,5 m; columns αw ≤ 0,3 / 0,6 / ≥ 0,9; null = does not apply */
var N = null;
var SHAPE = {
  plane:          [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  gallery2:       [[-1, -1, 0], [N, N, N], [N, N, N]],
  gallery3:       [[-1, -1, 0], [-1, 0, 2], [1, 1, 2]],
  gallery4:       [[0, 0, 1], [0, 1, 3], [2, 2, 3]],
  gallery5:       [[N, N, N], [N, N, N], [3, 4, 6]],
  balcony6:       [[-1, -1, 0], [-1, 1, 3], [1, 2, 3]],
  balcony7:       [[0, 0, 1], [0, 2, 4], [2, 3, 4]],
  balcony8:       [[1, 1, 2], [1, 1, 2], [1, 1, 2]],
  terrace_open:   [[1, 1, 1], [3, 4, 5], [4, 4, 5]],
  terrace_closed: [[3, 3, 3], [5, 6, 7], [6, 6, 7]]
};
var SHAPE_IDS = Object.keys(SHAPE), LOS = ['low', 'mid', 'high'];
function dLfs(shape, los, alpha) {
  var t = SHAPE[shape]; if (!t) return { ok: false };
  var li = LOS.indexOf(los); if (li < 0) return { ok: false, reason: 'los' };
  var row = t[li];
  var a = isNum(alpha) ? Math.max(0.3, Math.min(0.9, alpha)) : 0.3;
  var i = a <= 0.6 ? 0 : 1, f = (a - (i ? 0.6 : 0.3)) / 0.3;
  if (row[i] == null || row[i + 1] == null) return { ok: false, na: true };
  return { ok: true, v: Math.round((row[i] + f * (row[i + 1] - row[i])) * 1e9) / 1e9 };
}

/* ---------- 3. façade prediction + Annex A quick rule ---------- */
var KINDS = ['wall', 'window', 'door', 'roof', 'vent', 'shutter_box'];
/* calc(input):
   { V_m3, S_m2 (façade area seen from inside; default Σ areas), T0 0,5,
     elements:[{id, kind, small:boolean, S_m2, RAtr, RA, n, DneAtr, DneA}]   small = small technical element (Formula (7), n pieces or metres)
     shape:{mode:'table'|'value', shape, los, alpha, value}, gallery:boolean,
     req:{ use, cls, LAday, LAnight, LAmax3xNight, secondPane, gallery } (NBN S 01-400-1 Tab. 3 by AcuReq), target:{DAtr_min, D2mA_min} (overrides req) }
   -> {ok, R, D2mnT (= DAtr achieved), DAtrMin, checks[], parts[], weakest, annexA{...}, warnings[], sources[]} */
function calc(inp) {
  inp = inp || {};
  var warnings = [], sources = ['fac_1', 'fac_4', 'fac_43'];
  function warn(w) { if (warnings.indexOf(w) < 0) warnings.push(w); }
  var V = inp.V_m3;
  if (!isNum(V) || V <= 0) return { ok: false, reason: 'volume' };
  var els = (inp.elements || []).filter(function (e) { return e && e.on !== false; });
  if (!els.length) return { ok: false, reason: 'no_elements' };
  var area = 0, list = [], listA = [], allA = true, nVent = 0;
  for (var i = 0; i < els.length; i++) {
    var e = els[i], id = e.id || String(i + 1);
    if (e.small) {
      var n = isNum(e.n) && e.n > 0 ? e.n : 1;
      if (!isNum(e.DneAtr)) return { ok: false, reason: 'element_data', id: id };
      list.push({ id: id, Dne_dB: e.DneAtr, n: n }); nVent += n;
      if (isNum(e.DneA)) listA.push({ id: id, Dne_dB: e.DneA, n: n }); else allA = false;
    } else {
      if (!isNum(e.S_m2) || e.S_m2 <= 0) return { ok: false, reason: 'element_area', id: id };
      if (!isNum(e.RAtr)) return { ok: false, reason: 'element_data', id: id };
      area += e.S_m2;
      list.push({ id: id, S_m2: e.S_m2, R_dB: e.RAtr });
      if (isNum(e.RA)) listA.push({ id: id, S_m2: e.S_m2, R_dB: e.RA }); else allA = false;
    }
  }
  if (!(area > 0)) return { ok: false, reason: 'no_area' };
  var Sf = isNum(inp.S_m2) && inp.S_m2 > 0 ? inp.S_m2 : area;
  if (Math.abs(Sf - area) > 0.01 * Sf) warn('area_mismatch');
  var fr = C.facadeR(list, Sf);
  if (!fr.ok) return { ok: false, reason: fr.reason };
  /* ΔLfs */
  var sh = inp.shape || { mode: 'table', shape: 'plane', los: 'high' }, dL = 0;
  if (sh.mode === 'value') dL = isNum(sh.value) ? sh.value : 0;
  else { var d = dLfs(sh.shape || 'plane', sh.los || 'high', sh.alpha); if (!d.ok) return { ok: false, reason: 'shape_na' }; dL = d.v; if ((sh.shape || 'plane') !== 'plane') sources.push('fac_c1'); }
  var term = 10 * lg(C.CSAB * V / (C.T0 * Sf));
  var D = fr.R + dL + term;   /* D2m,nT,w + Ctr = DAtr */
  var out = { ok: true, version: VERSION, V_m3: V, S_m2: Sf, area: area, R: fr.R, dLfs: dL, term: term, DAtr: D,
    parts: fr.parts.map(function (p, k) { var e0 = els[k]; return { id: p.id, kind: e0.kind, small: !!e0.small, tau: p.tau, share: p.share, Rp: p.Rp, S_m2: e0.S_m2, n: e0.n, RAtr: e0.RAtr, DneAtr: e0.DneAtr }; }) };
  if (inp.gallery && allA && listA.length === list.length) { var fa = C.facadeR(listA, Sf); out.RA = fa.R; out.D2mA = fa.R + dL + term; }
  var top = out.parts.slice().sort(function (a, b) { return b.share - a.share; })[0];
  out.weakest = top.id; out.weakestShare = top.share; out.weakestKind = top.kind;
  /* requirement */
  var tg = inp.target || {}, req = null;
  if (isNum(tg.DAtr_min)) { out.DAtrMin = tg.DAtr_min; out.reqSource = 'target'; if (isNum(tg.D2mA_min)) out.D2mAMin = tg.D2mA_min; }
  else if (inp.req && R && R.facade) {
    req = R.facade({ cls: inp.req.cls, use: inp.req.use, LAday: inp.req.LAday, LAnight: inp.req.LAnight, LAmax3xNight: inp.req.LAmax3xNight,
      secondPane: inp.req.secondPane, gallery: inp.req.gallery });
    out.req = req; out.reqSource = 'tab3'; sources.push('s1_t3');
    if (req.ok) { if (isNum(req.target.DAtr_min)) out.DAtrMin = req.target.DAtr_min; if (isNum(req.target.D2mA_min)) out.D2mAMin = req.target.D2mA_min; }
  }
  out.checks = [];
  if (isNum(out.DAtrMin)) out.checks.push({ q: 'DAtr', limit: out.DAtrMin, value: D, pass: D >= out.DAtrMin - 1e-9, margin: D - out.DAtrMin });
  if (isNum(out.D2mAMin)) out.checks.push({ q: 'D2mA', limit: out.D2mAMin, value: out.D2mA == null ? null : out.D2mA,
    pass: out.D2mA == null ? null : out.D2mA >= out.D2mAMin - 1e-9, margin: out.D2mA == null ? null : out.D2mA - out.D2mAMin });
  /* Annex A quick rule (needs the required DAtr): Snet = area of elements with RAtr < 48 dB, n = number (or metres) of external air transfer devices */
  if (isNum(out.DAtrMin)) {
    var Snet = els.reduce(function (s, e) { return s + (!e.small && e.RAtr < 48 ? e.S_m2 : 0); }, 0);
    var k = 10 * lg(3 * (Snet + 5 * nVent) / V);
    var Rmin = out.DAtrMin + 3 + k;
    var A = { Snet: Snet, n: nVent, k: k, RAtrMin: Rmin, DneAtrMin: Rmin + 3, items: [] };
    if (isNum(out.D2mAMin)) { A.RAMin = out.D2mAMin + 3 + k; A.DneAMin = A.RAMin + 3; }
    els.forEach(function (e, j) {
      var lim = e.small ? A.DneAtrMin : A.RAtrMin, val = e.small ? e.DneAtr : e.RAtr;
      A.items.push({ id: e.id || String(j + 1), kind: e.kind, small: !!e.small, q: e.small ? 'DneAtr' : 'RAtr', limit: lim, value: val, pass: val >= lim - 1e-9 });
    });
    A.allPass = A.items.every(function (x) { return x.pass; });
    out.annexA = A; sources.push('s1_a');
    if (els.some(function (e) { return e.small && e.kind !== 'vent'; })) sources.push('la_fac_a1');
    if (Snet === 0 && nVent === 0) warn('annexA_empty');
  }
  if (out.weakestShare > 0.5 && top.small) warn('vent_governs');
  if (els.some(function (e) { return !e.small && e.kind === 'window' && e.S_m2 > 5; })) { warn('large_glazing'); sources.push('en14351'); }
  out.warnings = warnings;
  out.sources = sources.filter(function (v, i2, a) { return a.indexOf(v) === i2; });
  return out;
}

/* what the weakest element would need so that the façade just reaches DAtr (others unchanged) -> {id, need} or null */
function needWeakest(r) {
  if (!r || !r.ok || !isNum(r.DAtrMin)) return null;
  var p = r.parts.filter(function (x) { return x.id === r.weakest; })[0]; if (!p) return null;
  var tauT = Math.pow(10, -(r.DAtrMin - r.dLfs - r.term) / 10), rest = r.parts.reduce(function (s, x) { return s + (x.id === p.id ? 0 : x.tau); }, 0);
  var room = tauT - rest;
  if (!(room > 0)) return { id: p.id, small: p.small, need: null };   /* the other elements alone already exceed the budget */
  var need = p.small ? -10 * lg(room * r.S_m2 / (C.A0 * (p.n || 1))) : -10 * lg(room * r.S_m2 / p.S_m2);
  return { id: p.id, small: p.small, need: need };
}

function round1(x) { return Math.round(x * 10) / 10; }

return {
  VERSION: VERSION, SOURCES: SOURCES, TYPO: TYPO, FIG: FIG, FIG_IDS: FIG_IDS, PANES: PANES, VERT: VERT, SHAPE: SHAPE, SHAPE_IDS: SHAPE_IDS, LOS: LOS, KINDS: KINDS,
  twoRoads: twoRoads, c3Horizontal: c3Horizontal, c3Vertical: c3Vertical, outdoor: outdoor, dLfs: dLfs, calc: calc, needWeakest: needWeakest, round1: round1
};
});
