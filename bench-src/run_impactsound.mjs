// Benchmark driver for impactsound.html (Impact Sound Between Rooms — EN ISO 12354-2:2017 §4.3 simplified model).
// Reference: bench-src/ref/gen_impactsound.py (independent Python implementation written from the rendered norm pages) -> ref/impactsound_ref.json.
// Every point runs through the engine the page loaded (window.AcuImpact.calc); the preset cases also run through the page (preset button state ->
// engine -> result tiles); the EN ISO 717-2 cases run through the shared core the page loaded (window.AcuCore.rate717_2 / dLw).
// External anchors: the printed results of EN ISO 12354-2 Annex G.1.3 (Table G.10) and the printed rating of the Table G.1 spectrum.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_impactsound.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_impactsound.py, an independent Python implementation of EN ISO 12354-2:2017 §4.1 Formula (3), §4.3.2 Formula (15), (16), (18), (19), §4.3.3 c), Annex B.2 (B.5), Annex C (C.2), (C.4), (C.5), of EN ISO 12354-1:2017 Annex B.4 (B.11) and Annex E.3.2–E.3.4, and of the EN ISO 717-2:2020 rating (Table 3, §4.3, Annex A.2.1, §5 Table 4), written from the rendered norm pages, not from the page code. External anchors: the printed L′n,w = 39,7 dB and the five printed path values of Annex G.1.3 (Table G.10); the printed rating L′n,w (CI; CI,50-2500) = 41 (2; 7) dB of the Table G.1 spectrum. Shared reading with the engine (labelled on the page): the walls of the room below continue through the junction, the slab continues for rooms beside / diagonal, joints crossed at a flexible junction, the larger ΔLw of covering and floating floor, the Belgian value without the soft covering.' };
const P = benchPaths({ name: 'impactsound', page: 'impactsound.html', ref: 'impactsound_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__impactsound && window.AcuImpact, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const KEYS = ['LnwBE', 'LnTwBE', 'LnTw', 'Lneq0w', 'dLw', 'f0', 'LI50'];
const results = [];
let npts = 0, nscreen = 0, anchorsTotal = 0, anchorsPassed = 0;
for (const c of ref) {
  let reads = null;
  try {
    reads = await p.evaluate(cc => {
      const A = window.AcuImpact, C = window.AcuCore;
      const got = cc.points.map(pt => {
        const r = A.calc(pt.input);
        if (!r.ok) return { ok: false };
        const g = { ok: true, LnwBE: r.LnwBE, LnTwBE: r.LnTwBE, LnTw: r.LnTw, Lneq0w: r.floor.Lneq0w, dLw: r.float.dLw, f0: r.float.f0 == null ? null : r.float.f0, LI50: r.LI50,
          dominant: r.dominant, warn_f0: r.warnings.indexOf('f0_high') >= 0, paths: {} };
        r.paths.forEach(q => { g.paths[q.id] = q.L; });
        (r.checks || []).forEach(k => { if (!k.info) g['pass_' + k.q] = k.pass; });
        return g;
      });
      const rated = (cc.rating || []).map(x => {
        if (x.kind === 'rate') { const r = C.rate717_2(x.bands, { range: 'third' }); return { Lw: r.Lw, CI: r.CI, CI50: r.CI50_2500 }; }
        return { dLw: C.dLw(x.dL).dLw };
      });
      let screen = null;
      if (cc.preset) {
        const W = window.__impactsound; W.applyPreset(cc.preset);
        const r = W.last;
        const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').replace(/\s+/g, ' ').trim());
        screen = { LnTwBE: r.LnTwBE, LnwBE: r.LnwBE, tiles };
      }
      return { got, rated, screen };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!reads, bad = 0;
  const add = (k, g, x, ok) => { if (!ok) { pass = false; bad++; if (Object.keys(cmp).length < 12) cmp[k] = { got: g, exp: x }; } };
  const same = (a, b, tol) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) <= tol : a === b;
  (reads ? reads.got : []).forEach((g, i) => {
    const e = c.points[i].expect; npts++;
    add(i + ' ok', g.ok, e.ok, g.ok === e.ok);
    if (!e.ok || !g.ok) return;
    KEYS.forEach(k => add(i + ' ' + k, g[k], e[k], same(g[k] == null ? null : g[k], e[k] == null ? null : e[k], 0.01)));
    add(i + ' dominant', g.dominant, e.dominant, g.dominant === e.dominant);
    add(i + ' f0 flag', g.warn_f0, e.warn_f0, g.warn_f0 === e.warn_f0);
    Object.keys(e.paths).forEach(k => add(i + ' path ' + k, g.paths[k], e.paths[k], same(g.paths[k], e.paths[k], 0.01)));
    Object.keys(g.paths).forEach(k => { if (!(k in e.paths)) add(i + ' extra path ' + k, g.paths[k], 'absent', false); });
    ['pass_LnTw', 'pass_LI50'].forEach(k => { if (k in e) add(i + ' ' + k, g[k], e[k], g[k] === e[k]); });
  });
  (reads ? reads.rated : []).forEach((g, i) => {
    const e = c.rating[i].expect; npts++;
    Object.keys(e).forEach(k => add('rating ' + i + ' ' + k, g[k], e[k], g[k] === e[k]));
  });
  if (reads && reads.screen) {
    const e = c.points[0].expect, s = reads.screen; nscreen++;
    ['LnTwBE', 'LnwBE'].forEach(k => add('screen ' + k, s[k], e[k], same(s[k], e[k], 0.01)));
    const want = (Math.round(e.LnTwBE * 10) / 10).toFixed(1) + ' dB';
    add('screen tile L′nT,w', s.tiles, want, s.tiles.some(t => t === want));
  }
  if (c.anchor && reads) {
    anchorsTotal++;
    const g = reads.got[0]; let ok = g.ok && Math.abs(g.LnwBE - c.anchor.Lnw) <= c.anchor.tol_Lnw;
    Object.keys(c.anchor.paths).forEach(k => { if (!(Math.abs(g.paths[k] - c.anchor.paths[k]) <= c.anchor.tol_paths)) ok = false; });
    if (ok) anchorsPassed++; else add('anchor (printed G.1.3)', g.LnwBE, c.anchor.Lnw, false);
  }
  if (c.anchor717 && reads) {
    anchorsTotal++;
    const g = reads.rated[0], a = c.anchor717;
    if (g.Lw === a.Lw && g.CI === a.CI && g.CI50 === a.CI50) anchorsPassed++; else add('anchor (printed G.1 rating)', g, a, false);
  }
  results.push({ id: c.id, note: c.note, points: c.points.length + (c.rating || []).length, anchor: (c.anchor || c.anchor717) ? true : undefined, preset: c.preset || undefined, checks_failed: bad, cmp, pass });
}
await browser.close();
const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'impactsound',
  file: 'impactsound.html',
  reference: 'bench-src/ref/gen_impactsound.py — independent Python implementation of EN ISO 12354-2:2017 §4.1 Formula (3), §4.3.2 Formula (15), (16), (18), (19), §4.3.3 c), Annex B.2 (B.5), Annex C (C.2)/(C.4)/(C.5), EN ISO 12354-1:2017 Annex B.4 (B.11), Annex E.3.2–E.3.4 and of the EN ISO 717-2:2020 rating, over: the Annex G.1.3 worked example and the rating of the Table G.1 spectrum (printed values as external anchors, ' + anchorsPassed + '/' + anchorsTotal + '), the presets, a grid of slab mass × floating floor (none, wet, dry, lab) × wall mass and junction (rigid / flexible) × room volume, rooms beside and diagonally below with linings, lab floors and walls, ceiling linings with and without a covering, soft coverings on floating floors, LI,50 from lab values, ΔLw of three floating floors on the reference floor, and the refusals. Cases written from the clauses (r3-fix, R3-REVIEW CR-8..CR-11, CR-32): joints crossed at a flexible junction per EN ISO 12354-1 E.3.4 Figure E.5 / NOTE 4 (K24 along the continuous slab), Cc by load, half ΔRw per §4.3.3 e), the Figure C.1 / C.2 ranges (verdict not determinable outside), the verdict on the 0,1 dB value. Shared reading with the engine: the continuing element at each junction, a floating floor counted as the floor covering of §4.3.3 c)/e), Cc 15 for an unknown load, the larger ΔLw of covering and floating floor, the Belgian value without the soft covering, the f0 > 100 Hz flag',
  external_anchors: { total: anchorsTotal, passed: anchorsPassed },
  reference_citations: [
    'EN ISO 12354-2:2017 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 2: Impact sound insulation between rooms, §4.1 Formula (3), §4.3.2 Formula (15), (16), (18), (19), §4.3.3 c), Annex B.2 Formula (B.5), Annex C Formula (C.2), (C.4), (C.5), Annex G.1.3 Table G.10, Annex G.1.2 Table G.1',
    'EN ISO 12354-1:2017 Annex B.4 Formula (B.11), Annex E.3.2–E.3.4 (Kij)',
    'EN ISO 717-2:2020 Rating of sound insulation — Part 2: Impact sound insulation, §4.2 Table 3, §4.3, Annex A.2.1, §5 Table 4',
    'NBN S 01-400-1:2022 §6.1 (L′nT,w whatever the floor covering) and §4.2 (LI,50 = Ln,w + CI,50-2500 of the floor element)',
    'Learning assumptions / interpretations of both engine and reference (labelled on the page): walls of the room below continue through the junction, the slab continues for rooms beside / diagonal; flexible wall: one joint on the corner path, two on the straight path; a soft covering on a floating floor counts as the larger ΔLw'
  ],
  tolerance: '±0,01 dB on L′n,w, L′nT,w (without and with the covering), Ln,eq,0,w, ΔLw, f0, LI,50 and every path value; exact dominant path, f0 flag, refusals, target verdicts and EN ISO 717-2 single numbers; the printed Annex G.1.3 values within ±0,5 dB (L′n,w) and ±0,1 dB (paths), the printed G.1 rating exactly; the page path (preset → state → engine → L′nT,w tile) for every preset case',
  total, passed, failed, points: npts, screen_points: nscreen,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`impactsound: ${passed}/${total} passed (${npts} points, ${nscreen} through the page; external anchors ${anchorsPassed}/${anchorsTotal})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, r.checks_failed, JSON.stringify(r.cmp).slice(0, 900));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed ? 1 : 0;
