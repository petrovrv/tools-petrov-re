// Benchmark driver for airbornesound.html (Airborne Sound Insulation Between Rooms — EN ISO 12354-1:2017 §4.4 simplified model).
// Reference: bench-src/ref/gen_airbornesound.py (independent Python implementation written from the rendered norm pages) -> ref/airbornesound_ref.json.
// Every point runs through the engine the page loaded (window.AcuAir.calc); the preset cases also run through the page (preset button state ->
// engine -> result tiles). External anchor: the printed results of EN ISO 12354-1 Annex L.1.4 (Table L.10).
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_airbornesound.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_airbornesound.py, an independent Python implementation of EN ISO 12354-1:2017 §4.4.2 Formula (18)–(21), Formula (22)/(23), Annex B.4 (B.11)/(B.12), Annex D.2 (D.1)/(D.2) with Table D.1, Annex E.3.2–E.3.5 and of the EN ISO 717-1:2020 rating (Table 3, Table 4, Annex B), written from the rendered norm pages, not from the page code. External anchor: the printed R′w = 57,0 dB and the 13 printed path values of Annex L.1.4 (Table L.10). r3-fix rules written from the clauses, not from the JS: Fig. E.7 geometry (light separating wall → Ff = K24 along the continuous homogeneous element, Fd / Df = K12; heavy separating element crossed by a light leaf → Ff = K13), Formula (10) in-situ floor of Kij, E.3.4 load classes. Shared reading with the engine (labelled on the page): C of the mass law −1 / −2 dB, ΔRA = ΔRw of linings in the A-weighted run, flexible interlayers = joints on both sides of the junction line (Ff crosses two joints, Fd / Df one), load not given → Cc 15, flanking element areas taken = S of the separating element in the Formula (10) floor, the flanking element continues through the junction, pass / fail on the value rounded to 0,1 dB.' };
const P = benchPaths({ name: 'airbornesound', page: 'airbornesound.html', ref: 'airbornesound_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__airbornesound && window.AcuAir, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const KEYS = ['Rpw', 'DnTw', 'RpA', 'DA', 'DnTtr', 'RA50', 'Rw_sep'];
const results = [];
let npts = 0, nscreen = 0, anchorsTotal = 0, anchorsPassed = 0;
for (const c of ref) {
  let reads = null;
  try {
    reads = await p.evaluate(cc => {
      const A = window.AcuAir;
      const got = cc.points.map(pt => {
        const r = A.calc(pt.input);
        if (!r.ok) return { ok: false };
        const g = { ok: true, Rpw: r.Rpw, DnTw: r.DnTw, RpA: r.RpA, DA: r.DA, DnTtr: r.DnTtr, RA50: r.RA50, Rw_sep: r.sep.Rw, dominant: r.dominant, paths: {} };
        r.paths.forEach(q => { g.paths[q.id] = q.R; });
        (r.checks || []).forEach(k => { g['pass_' + k.q] = k.pass; });
        return g;
      });
      let screen = null;
      if (cc.preset) {
        const W = window.__airbornesound; W.applyPreset(cc.preset);
        const r = W.last;
        const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').replace(/\s+/g, ' ').trim());
        screen = { DnTw: r.DnTw, DA: r.DA, Rpw: r.Rpw, tiles };
      }
      return { got, screen };
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
    Object.keys(e.paths).forEach(k => add(i + ' path ' + k, g.paths[k], e.paths[k], same(g.paths[k], e.paths[k], 0.01)));
    Object.keys(g.paths).forEach(k => { if (!(k in e.paths)) add(i + ' extra path ' + k, g.paths[k], 'absent', false); });
    ['pass_DA', 'pass_RA50'].forEach(k => { if (k in e) add(i + ' ' + k, g[k.replace('pass_', 'pass_')], e[k], g[k] === e[k]); });
  });
  if (reads && reads.screen) {
    const e = c.points[0].expect, s = reads.screen; nscreen++;
    ['DnTw', 'DA', 'Rpw'].forEach(k => add('screen ' + k, s[k], e[k], same(s[k], e[k], 0.01)));
    const want = (Math.round(e.DnTw * 10) / 10).toFixed(1) + ' dB';
    add('screen tile DnT,w', s.tiles, want, s.tiles.some(t => t === want));
  }
  if (c.anchor && reads) {
    anchorsTotal++;
    const g = reads.got[0]; let ok = g.ok && Math.abs(g.Rpw - c.anchor.Rpw) <= c.anchor.tol_Rpw;
    Object.keys(c.anchor.paths).forEach(k => { if (!(Math.abs(g.paths[k] - c.anchor.paths[k]) <= c.anchor.tol_paths)) ok = false; });
    if (ok) anchorsPassed++; else add('anchor (printed L.1.4)', g.Rpw, c.anchor.Rpw, false);
  }
  results.push({ id: c.id, note: c.note, points: c.points.length, anchor: c.anchor ? true : undefined, preset: c.preset || undefined, checks_failed: bad, cmp, pass });
}
await browser.close();
const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'airbornesound',
  file: 'airbornesound.html',
  reference: 'bench-src/ref/gen_airbornesound.py — independent Python implementation of EN ISO 12354-1:2017 §4.4.2 Formula (18)–(21), Formula (22)/(23), Annex B.4 (B.11)/(B.12), Annex D.2 (D.1)/(D.2) Table D.1, Annex E.3.2–E.3.5 and of the EN ISO 717-1:2020 rating, over: the Annex L.1.4 worked example (printed R′w and path values as external anchor, ' + anchorsPassed + '/' + anchorsTotal + '), the presets, a grid of separating mass × junction type × flanking mass × room volume, linings on both sides of the separating and the flanking elements, lab values, lightweight double walls (E.3.5), 1/3-octave spectra from 50 and from 100 Hz, Dn,f,w flanking (Formula (21)), small elements, flexible-interlayer load classes (incl. load not given), both E.3.5 geometries (Fig. E.7), a Kij grid over M −1…+1, the Formula (10) floor, DA at the limit and the mass-law refusals. Shared reading with the engine: C of the mass law, ΔRA = ΔRw, joints crossed by each path at a flexible junction, load not given → Cc 15, flanking areas = S in the Formula (10) floor, the flanking element continuing through the junction, verdict on the rounded value',
  external_anchors: { total: anchorsTotal, passed: anchorsPassed },
  reference_citations: [
    'EN ISO 12354-1:2017 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 1: Airborne sound insulation between rooms, §4.4.2 Formula (18)–(21), §4.4.3 b), d), e) Formula (22)/(23), Annex B.4 Formula (B.11)/(B.12), Annex D.2.1 Formula (D.1)/(D.2), D.2.2 Table D.1, Annex E.3.2–E.3.5 (Fig. E.7), §4.2.2 Formula (10), Annex J Formula (J.3), Annex L.1.4 Table L.10',
    'EN ISO 717-1:2020 Rating of sound insulation — Part 1: Airborne sound insulation, §4.2 Table 3, §4.3 Table 4, §4.4, Annex B Table B.1',
    'Learning assumptions / interpretations of both engine and reference (labelled on the page): C of the mass law −1 dB up to 400 kg/m², −2 dB above; ΔRA = ΔRw in the A-weighted run; a flanking wall on flexible interlayers (elastic joints on both sides of the junction line): Ff crosses two joints, Fd / Df one; load not given → Cc 15; flanking element areas = S of the separating element in the Formula (10) floor; the flanking element continues through the junction; verdict on the value rounded to 0,1 dB'
  ],
  tolerance: '±0,01 dB on R′w, DnT,w, R′A, DA, DnT,w + Ctr, RA,50, Rw of the separating element and on every path value; exact dominant path, refusals and target verdicts; the printed Annex L.1.4 values within ±0,5 dB (R′w) and ±0,15 dB (paths, printed from rounded intermediate values); the page path (preset → state → engine → DnT,w tile) for every preset case',
  total, passed, failed, points: npts, screen_points: nscreen,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`airbornesound: ${passed}/${total} passed (${npts} points, ${nscreen} through the page; external anchors ${anchorsPassed}/${anchorsTotal})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, r.checks_failed, JSON.stringify(r.cmp).slice(0, 900));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
