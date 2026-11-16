/* acu-impact.js — global AcuImpact: engine of the tool `impactsound` (Impact Sound Between Rooms) of the tools.petrov.re Acoustics BE package.
   EN ISO 12354-2:2017 §4.3 simplified model: weighted normalized impact sound pressure level L′n,w of a heavy floor with the direct path
   (Formula (15): Ln,d,w = Ln,eq,0,w − ΔLw − ΔLd,w) and the flanking paths (Formula (16): Ln,ij,w = Ln,eq,0,w − ΔLw + (Ri,w − Rj,w)/2 − ΔRj,w − Kij
   − 10 lg(Si/(l0·lij))), summed by Formula (18) for the room below and by Formula (19) for rooms beside / diagonally below.
   Bare floor by Annex B.2 Formula (B.5) (164 − 35 lg m′) and EN ISO 12354-1 B.11 for Rw, or lab values; floating floors by Annex C
   (f0 = 160 √(s′/m′) (C.2), ΔLw (C.4) wet / (C.5) dry) or a lab ΔLw; Kij by EN ISO 12354-1 Annex E.3 (AcuCore.kij).
   L′nT,w = L′n,w − 10 lg(0,032·V) (Formula (3), T0 0,5 s). Belgian check (NBN S 01-400-1:2022 §6): L′nT,w ≤ limit whatever the floor covering
   (§6.1) — a soft covering is shown but not counted; LI,50 = Ln,w + CI,50-2500 of the floor ELEMENT (lab value, D-BW-27).
   Pure functions, no DOM. UMD: browser global AcuImpact (AcuCore loaded first), node module.exports.
   Planning aid only — acoustic design and in-situ verification by a qualified acoustician per NBN S 01-400-1 / -3. */
(function (root, factory) {
  var core = (root && root.AcuCore) || (typeof require === 'function' ? require('./acoustics-be-core.js') : null);
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AcuImpact = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C) {
'use strict';

var VERSION = '0.2.0';
var lg = function (x) { return Math.log(x) / Math.LN10; };
function isNum(v) { return typeof v === 'number' && isFinite(v); }

var I2 = 'EN ISO 12354-2 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 2: Impact sound insulation between rooms';
var NBN1 = 'NBN S 01-400-1 Critères acoustiques pour les immeubles d’habitation';
var S = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var SOURCES = {
  imp_15: S(I2, '2017', '§4.3.2 Formula (15) (direct path Ln,d,w = Ln,eq,0,w − ΔLw − ΔLd,w)'),
  imp_16: S(I2, '2017', '§4.3.2 Formula (16) (flanking path Ln,ij,w; Kij averaged 250–1 000 Hz)'),
  imp_18: S(I2, '2017', '§4.3.2 Formula (18) (room below: direct + flanking) and (19) (rooms beside / diagonal: flanking only)'),
  imp_433: S(I2, '2017', '§4.3.3 a)–c) input data (half of ΔLd,w when a floor covering is present)'),
  imp_433e: S(I2, '2017', '§4.3.3 e) (half of ΔRw of a lining on the receiving side of a flanking element when a floor covering is present)'),
  imp_c_range: S(I2, '2017', 'Annex C.2 Figures C.1 (m′ 60–160 kg/m², s′ 4–50 MN/m³) and C.2 (m′ 15–60 kg/m², s′ 10–50 MN/m³): range of Formulas (C.4) / (C.5)'),
  imp_431: S(I2, '2017', '§4.3.1, §4.2.5 limitations (100–3 150 Hz; ΔL of ISO 10140-3 not for lightweight floors)'),
  imp_f: S(I2, '2017', 'Annex F (stairs — outside the simplified model of this tool)'),
  imp_g13: S(I2, '2017', 'Annex G.1.3 Table G.10 (worked example of the simplified model)'),
  nbn1_61: S(NBN1, '2022', '§6.1–6.2 Tab. 2 (L′nT,w whatever the floor covering; LI,50 of the floor element)'),
  la_imp_cover: S('Learning assumption of this tool: a soft covering on a floating floor — ΔLw of the combination = the larger of the two (no addition; lab ΔLw of coverings is measured on the bare reference floor)', 'acu-impact ' + VERSION, '', 'learning_assumption'),
  la_imp_flex: S('Interpretation of this tool: the wall stands on flexible interlayers, the slab continues through the junction (EN ISO 12354-1 E.3.4, Figure E.5) — a path from the slab into the wall crosses one joint (Kij,rigid + Δl); the path along the continuous slab crosses no joint and takes NOTE 4: K = 3,7 + 14,1 M + 5,7 M² (M = lg(m′wall/m′slab); the printed bound of NOTE 4 is not legible and is not applied)', 'acu-impact ' + VERSION, '', 'learning_assumption'),
  la_imp_cc: S('Learning assumption of this tool: Δl of a flexible joint (EN ISO 12354-1 E.3.4) with fl = 110 Hz (common resilient joints s′t 50–100 MN/m³) and Cc by the load on the interlayer — 20 below 80 kN/m², 15 for 80–750 kN/m², 10 above; an unknown load takes Cc 15 (load-bearing walls of multi-storey dwellings)', 'acu-impact ' + VERSION, '', 'learning_assumption'),
  la_imp_f0: S('Rule of thumb of this tool (not a clause of EN ISO 12354-2 Annex C): a floating floor with f0 above 100 Hz is flagged as isolating poorly in the low bands', 'acu-impact ' + VERSION, '', 'learning_assumption'),
  la_imp_whatif: S('Learning assumption of this tool: what-if floating floor = 60 mm sand-cement screed (120 kg/m²) on a resilient layer s′ = 10 MN/m³ (Formula (C.4)); doubling = 2 × m′ of the slab by (B.5) / (B.11)', 'acu-impact ' + VERSION, '', 'learning_assumption')
};

/* ---------- elements ---------- */
/* bare floor {src:'mass'|'lab', m, Lneq0w, Rw} -> {ok, m, Lneq0w, Rw, src, inRange, reason} */
function floor(fl) {
  fl = fl || {};
  var m = fl.m;
  if (!isNum(m) || m <= 0) return { ok: false, reason: 'mass' };
  if (fl.src === 'lab') {
    if (!isNum(fl.Lneq0w) || !isNum(fl.Rw)) return { ok: false, reason: 'lab' };
    return { ok: true, m: m, Lneq0w: fl.Lneq0w, Rw: fl.Rw, src: 'lab', inRange: true };
  }
  var ml = C.massLaw(m);
  if (!ml.ok) return { ok: false, reason: ml.reason };   /* below 150 kg/m²: lightweight floor, outside B.11 and §4.2.5 d) */
  var ln = C.lnEq0(m);
  return { ok: true, m: m, Lneq0w: ln.Lneq0w, Rw: ml.Rw, src: 'mass', inRange: ln.inRange };
}
/* floating floor {type:'none'|'wet'|'dry'|'lab', m, s, dLw} -> {dLw, f0, inRange, src, warnings} */
function floating(ff) {
  if (!ff || !ff.type || ff.type === 'none') return { dLw: 0, src: null, warnings: [] };
  if (ff.type === 'lab') return isNum(ff.dLw) && ff.dLw >= 0 ? { dLw: ff.dLw, src: 'lab', warnings: [] } : { dLw: 0, src: null, warnings: ['float_missing'] };
  var r = C.dLwFloating(ff.m, ff.s, ff.type);
  if (!r.ok) return { dLw: 0, src: null, warnings: ['float_missing'] };
  var w = [];
  if (!r.inRange) w.push('float_range');   /* outside Fig. C.1 / C.2: ΔLw is an extrapolation, the verdict is not determinable (CR-10) */
  if (r.f0 > 100) w.push('f0_high');
  return { dLw: Math.max(0, r.dLw), f0: r.f0, inRange: r.inRange, src: r.source, warnings: w };
}
/* flanking wall element {src:'mass'|'lab', m, Rw} */
function wall(ed) {
  if (!isNum(ed.m) || ed.m <= 0) return { ok: false, reason: 'mass' };
  if (ed.src === 'lab') return isNum(ed.Rw) ? { ok: true, m: ed.m, Rw: ed.Rw, src: 'lab' } : { ok: false, reason: 'rw' };
  var ml = C.massLaw(ed.m);
  return ml.ok ? { ok: true, m: ed.m, Rw: ml.Rw, src: 'mass' } : { ok: false, reason: ml.reason };
}

var EDGE_JUNCTIONS = ['rigid_cross', 'rigid_T', 'flexible_cross', 'flexible_T'];
/* load on the flexible interlayer -> Cc of E.3.4; unknown -> 15 (conservative learning assumption la_imp_cc) */
var FLEX_LOADS = { unknown: 15, light: 20, medium: 15, heavy: 10 };
var MODES = ['below', 'beside', 'diagonal'];

/* calc(input) — input:
   { mode:'below'|'beside'|'diagonal', S_m2 (area of the excited floor Si), V_m3 (receiving room),
     floor:{src:'mass'|'lab', m, Lneq0w, Rw}, float:{type, m, s, dLw}, cover_dLw (soft covering, shown not counted),
     ceiling_dLd (lining under the slab, direct path only, mode below),
     edges:[{on, junction, m, src, Rw, lf, dRj}]   mode below: walls of the room below meeting the slab (corner path D→f)
     junction:{junction, m, src, Rw, lf, dRwall, dRfloor}   modes beside / diagonal: the wall at the junction; paths floor→floor (straight) and floor→wall (corner)
     lab:{Lnw, CI50} (element lab values of the complete floor for LI,50), target:{LnTw_max, LI50_max} }
   -> {ok, LnwBE, LnTwBE (without covering, the Belgian value), Lnw, LnTw (with covering), paths[], dominant, f0, checks[], warnings[], sources[]} */
function calc(inp) {
  inp = inp || {};
  var warnings = [], sources = ['imp_15', 'imp_16', 'imp_18', 'imp_433', 'imp_431', 'iso12354_2_3'];
  function warn(w) { if (warnings.indexOf(w) < 0) warnings.push(w); }
  var mode = MODES.indexOf(inp.mode) >= 0 ? inp.mode : 'below';
  var Si = inp.S_m2, V = inp.V_m3;
  if (!isNum(Si) || Si <= 0 || !isNum(V) || V <= 0) return { ok: false, reason: 'geometry' };
  var fl = floor(inp.floor);
  if (!fl.ok) return { ok: false, reason: 'floor_' + fl.reason };
  if (fl.src === 'mass') { sources.push('iso12354_2_b5', 'iso12354_1_b11'); if (!fl.inRange) warn('floor_range'); }
  var ff = floating(inp.float);
  ff.warnings.forEach(warn);
  if (ff.src && ff.src !== 'lab') sources.push(ff.src, 'iso12354_2_c');
  var cover = isNum(inp.cover_dLw) && inp.cover_dLw > 0 ? inp.cover_dLw : 0;
  if (cover > 0) { sources.push('nbn1_61'); if (ff.dLw > 0) sources.push('la_imp_cover'); }
  var dLd = mode === 'below' && isNum(inp.ceiling_dLd) ? inp.ceiling_dLd : 0;
  var flexLoad = Object.prototype.hasOwnProperty.call(FLEX_LOADS, inp.flexLoad) ? inp.flexLoad : 'unknown', Cc = FLEX_LOADS[flexLoad];

  /* path definitions independent of ΔLw: base level relative to (Ln,eq,0,w − ΔLw) */
  var defs = [];
  if (mode === 'below') {
    defs.push({ id: 'Dd', edge: null, rel: 0, dLd: true });
    (inp.edges || []).forEach(function (ed, idx) {
      if (!ed || ed.on === false) return;
      var n = idx + 1;
      if (!isNum(ed.lf) || ed.lf <= 0) { warn('edge_length'); return; }
      if (EDGE_JUNCTIONS.indexOf(ed.junction) < 0) { warn('edge_junction'); return; }
      var w = wall(ed);
      if (!w.ok) { defs.push({ refused: w.reason, edge: n }); return; }
      /* the wall continues through the junction (element 1–3 of Annex E), the slab is perpendicular: corner path, M = lg(m′floor/m′wall) */
      var flex = ed.junction.indexOf('flexible') === 0;
      var k = C.kij({ junction: ed.junction, path: 'corner', m_i: w.m, m_perp: fl.m, joints: flex ? 1 : undefined, Cc: Cc });
      if (!k.ok) { defs.push({ refused: 'kij', edge: n }); return; }
      k.warnings.forEach(warn); sources.push(k.source); if (flex) sources.push('la_imp_flex', 'la_imp_cc');
      if (w.src === 'mass') sources.push('iso12354_1_b11');
      var dRj = isNum(ed.dRj) ? ed.dRj : 0;
      defs.push({ id: 'Df' + n, edge: n, Rj: w.Rw, mj: w.m, K: k.K, M: k.M, lij: ed.lf, dRj: dRj, junction: ed.junction,
        rel: (fl.Rw - w.Rw) / 2 - k.K - 10 * lg(Si / ed.lf) });
    });
  } else {
    var j = inp.junction || {};
    if (!isNum(j.lf) || j.lf <= 0) return { ok: false, reason: 'junction_length' };
    if (EDGE_JUNCTIONS.indexOf(j.junction) < 0) return { ok: false, reason: 'junction_type' };
    var wj = wall(j);
    if (!wj.ok) return { ok: false, reason: 'wall_' + wj.reason };
    if (wj.src === 'mass') sources.push('iso12354_1_b11');
    /* the slab continues through the junction (element 1–3), the wall is perpendicular */
    var flexJ = j.junction.indexOf('flexible') === 0;
    /* flexible: the wall stands on interlayers, the slab is the continuous element of Figure E.5 — the straight path along the slab crosses
       no joint (E.3.4 NOTE 4: K = 3,7 + 14,1 M + 5,7 M², CR-8); the corner path slab -> wall crosses one joint */
    var kS = flexJ ? (function () { var M = lg(wj.m / fl.m); return { ok: true, K: 3.7 + 14.1 * M + 5.7 * M * M, M: M, warnings: [], source: 'iso12354_1_e34' }; })()
      : C.kij({ junction: j.junction, path: 'straight', m_i: fl.m, m_perp: wj.m });
    var kC = C.kij({ junction: j.junction, path: 'corner', m_i: fl.m, m_perp: wj.m, joints: flexJ ? 1 : undefined, Cc: Cc });
    if (!kS.ok || !kC.ok) return { ok: false, reason: 'kij' };
    kS.warnings.concat(kC.warnings).forEach(warn); sources.push(kS.source); if (flexJ) sources.push('la_imp_flex', 'la_imp_cc');
    var dRf = isNum(j.dRfloor) ? j.dRfloor : 0, dRw = isNum(j.dRwall) ? j.dRwall : 0;
    var l10 = 10 * lg(Si / j.lf);
    defs.push({ id: 'Ff', edge: null, Rj: fl.Rw, mj: fl.m, K: kS.K, M: kS.M, lij: j.lf, dRj: dRf, junction: j.junction, rel: 0 - kS.K - l10 });
    defs.push({ id: 'Fd', edge: null, Rj: wj.Rw, mj: wj.m, K: kC.K, M: kC.M, lij: j.lf, dRj: dRw, junction: j.junction, rel: (fl.Rw - wj.Rw) / 2 - kC.K - l10 });
  }
  var ref = defs.filter(function (d) { return d.refused; });
  if (ref.length) return { ok: false, reason: 'edge_' + ref[0].refused, edge: ref[0].edge };

  /* run(ΔLw, noLining): noLining = the bare-slab comparison row without ceiling lining and wall linings (CR-34) */
  function run(dLw, noLining) {
    var dLdEff = noLining ? 0 : dLd > 0 && dLw > 0 ? dLd / 2 : dLd;   /* §4.3.3 c) */
    var paths = defs.map(function (d) {
      var dRj = d.dRj || 0, dRjEff = noLining ? 0 : dRj > 0 && dLw > 0 ? dRj / 2 : dRj;   /* §4.3.3 e): half of ΔRw with a floor covering (CR-9) */
      var L = fl.Lneq0w - dLw + d.rel - (d.dLd ? dLdEff : 0) - (d.id === 'Dd' ? 0 : dRjEff);
      var p = Object.assign({}, d, { L: L, e: Math.pow(10, L / 10) });
      if (d.id !== 'Dd') p.dRjEff = dRjEff;
      return p;
    });
    var sum = paths.reduce(function (s, p) { return s + p.e; }, 0);
    paths.forEach(function (p) { p.share = p.e / sum; delete p.e; delete p.rel; });
    var Ln = 10 * lg(sum);
    return { Lnw: Ln, LnTw: C.LnTfromLn(Ln, V), paths: paths, dLdEff: dLdEff };
  }
  var dLwBE = ff.dLw, dLwAll = Math.max(ff.dLw, cover);
  var be = run(dLwBE), all = cover > 0 ? run(dLwAll) : be;
  var corr = -10 * lg(0.032 * V);
  var out = { ok: true, version: VERSION, mode: mode, S_m2: Si, V_m3: V, corr: corr,
    floor: fl, float: ff, cover_dLw: cover, dLwBE: dLwBE, dLwAll: dLwAll, ceiling_dLd: dLd, dLdEff: be.dLdEff,
    LnwBE: be.Lnw, LnTwBE: be.LnTw, Lnw: all.Lnw, LnTw: all.LnTw, paths: be.paths, pathsCover: all.paths,
    bare: run(0, true), flexLoad: flexLoad, Cc: Cc };
  if (be.paths.some(function (p) { return p.dRj > 0 && p.dRjEff < p.dRj; })) sources.push('imp_433e');
  if (ff.warnings.indexOf('f0_high') >= 0) sources.push('la_imp_f0');
  if (ff.warnings.indexOf('float_range') >= 0) sources.push('imp_c_range');
  if (mode === 'below' && !defs.some(function (d) { return d.id !== 'Dd'; })) warn('no_flanking');   /* CR-33 */
  var fls = be.paths.filter(function (p) { return p.id !== 'Dd'; }).sort(function (a, b) { return b.share - a.share; });
  var top = be.paths.slice().sort(function (a, b) { return b.share - a.share; })[0];
  out.dominant = top ? top.id : null;
  out.flankShare = fls.reduce(function (s, p) { return s + p.share; }, 0);
  /* LI,50 of the floor element (lab Ln,w + CI,50-2500 of the complete floor) */
  var lab = inp.lab || {};
  out.LI50 = isNum(lab.Lnw) && isNum(lab.CI50) ? C.LI50(lab.Lnw, lab.CI50) : null;
  if (out.LI50 != null) sources.push('nbn1_4');
  if (cover > 0 && all.LnTw < be.LnTw - 0.05) warn('cover_not_counted');
  if (ff.dLw > 0 && fls.length && out.flankShare > 0.5) warn('flanking_dominates');
  /* target checks: L′nT,w without the covering (NBN S 01-400-1 §6.1), LI,50 */
  var tg = inp.target || {};
  out.checks = [];
  /* verdicts on the displayed 1-decimal value (CR-32); not determinable when ΔLw is extrapolated outside Fig. C.1 / C.2 (CR-10) */
  var nd = ff.warnings.indexOf('float_range') >= 0;
  out.determinable = !nd;
  var vBE = round1(out.LnTwBE), vAll = round1(out.LnTw);
  if (isNum(tg.LnTw_max)) {
    out.checks.push({ q: 'LnTw', limit: tg.LnTw_max, value: out.LnTwBE, pass: nd ? null : vBE <= tg.LnTw_max, margin: tg.LnTw_max - vBE, nr: nd ? 'float_range' : undefined });
    if (cover > 0) out.checks.push({ q: 'LnTwCover', limit: tg.LnTw_max, value: out.LnTw, pass: nd ? null : vAll <= tg.LnTw_max, margin: tg.LnTw_max - vAll, info: true });
    sources.push('nbn1_61');
  }
  if (isNum(tg.LI50_max)) out.checks.push({ q: 'LI50', limit: tg.LI50_max, value: out.LI50, pass: out.LI50 == null ? null : round1(out.LI50) <= tg.LI50_max, margin: out.LI50 == null ? null : tg.LI50_max - out.LI50 });
  out.warnings = warnings;
  out.sources = sources.filter(function (v, i, a) { return a.indexOf(v) === i; });
  return out;
}

/* the classic comparisons of the same input (L′nT,w as the Belgian value, without the covering):
   bare slab, current, slab mass doubled (mass input only), a standard floating floor if there is none, the covering alone on the bare slab (paper value) */
var WHATIF_FLOAT = { type: 'wet', m: 120, s: 10 };
function compare(inp) {
  var base = calc(inp); if (!base.ok) return [];
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var out = [{ id: 'bare', LnTw: C.LnTfromLn(base.bare.Lnw, base.V_m3) }, { id: 'current', LnTw: base.LnTwBE }];
  function push(id, x, useCover) { var r = calc(x); if (r.ok) out.push({ id: id, LnTw: useCover ? r.LnTw : r.LnTwBE, f0: r.float.f0 }); }
  if ((inp.floor || {}).src !== 'lab') { var x1 = clone(inp); x1.floor.m = 2 * inp.floor.m; push('mass2', x1); }
  if (!inp.float || !inp.float.type || inp.float.type === 'none') { var x2 = clone(inp); x2.float = clone(WHATIF_FLOAT); push('float', x2); }
  if (isNum(inp.cover_dLw) && inp.cover_dLw > 0) { var x3 = clone(inp); x3.float = { type: 'none' }; push('coverOnly', x3, true); }
  out.forEach(function (o) { o.d = o.LnTw - base.LnTwBE; });
  return out;
}

function round1(x) { return Math.round(x * 10) / 10; }

return {
  VERSION: VERSION, SOURCES: SOURCES, EDGE_JUNCTIONS: EDGE_JUNCTIONS, MODES: MODES, FLEX_LOADS: FLEX_LOADS, WHATIF_FLOAT: WHATIF_FLOAT,
  floor: floor, floating: floating, wall: wall, calc: calc, compare: compare, round1: round1
};
});
