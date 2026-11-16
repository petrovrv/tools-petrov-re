// Benchmark driver for facadesound.html (Façade Sound Insulation — NBN S 01-400-1:2022 §7 + Annex A–D, EN ISO 12354-3:2017 §4 + Annex C).
// Reference: bench-src/ref/gen_facadesound.py (independent Python implementation written from the rendered norm pages) -> ref/facadesound_ref.json.
// Every point runs through the engine the page loaded (window.AcuFacade.calc / .outdoor, with AcuReq for Tab. 3); the preset cases also run
// through the page (preset -> state -> engine -> DAtr tile). External anchors: the printed results of EN ISO 12354-3 Annex G.1 (Table G.2).
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_facadesound.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_facadesound.py, an independent Python implementation of EN ISO 12354-3:2017 §4.1 Formula (1), (4), §4.2 Formula (7), (8) and Annex C Table C.1, and of NBN S 01-400-1:2022 §7.2 Tab. 3 (notes a–c), Annex A Tab. A.1, Annex B, Annex C.3 Figures C.1–C.16 and Annex D, transcribed a second time from the rendered norm pages, not from the page code. External anchor: the printed R′(Rw + Ctr) = 27,8 dB and D2m,nT,Atr = 29,3 dB of Annex G.1 (Table G.2) and the printed rounded R′w 31 / D2m,nT,w 33 dB. Shared reading with the engine (labelled on the page): horizontal and vertical corrections of Annex C.3 added, class 4 of Annex B at its lower bound, flanking neglected (§4.3).' };
const P = benchPaths({ name: 'facadesound', page: 'facadesound.html', ref: 'facadesound_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__facadesound && window.AcuFacade, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const NUM = ['R', 'DAtr', 'dLfs', 'D2mA', 'RAtrMin', 'DneAtrMin', 'DAtrMin', 'D2mAMin', 'LAday', 'LAnight'];
const results = [];
let npts = 0, nscreen = 0, anchorsTotal = 0, anchorsPassed = 0;
for (const c of ref) {
  let reads = null;
  try {
    reads = await p.evaluate(cc => {
      const A = window.AcuFacade;
      const got = cc.points.map(pt => {
        if (pt.fn === 'outdoor') { const o = A.outdoor(pt.input); return o.ok ? { ok: true, LAday: o.LAday, LAnight: o.LAnight } : { ok: false }; }
        const r = A.calc(pt.input);
        if (!r.ok) return { ok: false, reason: r.reason };
        const g = { ok: true, R: r.R, DAtr: r.DAtr, dLfs: r.dLfs, D2mA: r.D2mA == null ? null : r.D2mA, weakest: r.weakest, share: r.weakestShare,
          DAtrMin: r.DAtrMin == null ? null : r.DAtrMin, D2mAMin: r.D2mAMin == null ? null : r.D2mAMin };
        (r.checks || []).forEach(k => { g['pass_' + k.q] = k.pass; });
        if (r.annexA) { g.RAtrMin = r.annexA.RAtrMin; g.DneAtrMin = r.annexA.DneAtrMin; g.annex = r.annexA.items.map(x => x.pass); }
        return g;
      });
      let screen = null;
      if (cc.preset) {
        const W = window.__facadesound; W.applyPreset(cc.preset);
        const r = W.last;
        const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').replace(/\s+/g, ' ').trim());
        screen = { DAtr: r.DAtr, R: r.R, DAtrMin: r.DAtrMin == null ? null : r.DAtrMin, tiles };
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
    if (!e.ok || !g.ok) { if (e.reason && g.reason !== e.reason) add(i + ' reason', g.reason, e.reason, false); return; }
    NUM.forEach(k => { if (k in e) add(i + ' ' + k, g[k], e[k], same(g[k] == null ? null : g[k], e[k] == null ? null : e[k], 0.01)); });
    if ('weakest' in e) { add(i + ' weakest', g.weakest, e.weakest, g.weakest === e.weakest); add(i + ' share', g.share, e.share, same(g.share, e.share, 1e-4)); }
    ['pass_DAtr', 'pass_D2mA'].forEach(k => { if (k in e) add(i + ' ' + k, g[k], e[k], g[k] === e[k]); });
    if ('annex' in e) add(i + ' annexA verdicts', g.annex, e.annex, JSON.stringify(g.annex) === JSON.stringify(e.annex));
  });
  if (reads && reads.screen) {
    const e = c.points[0].expect, s = reads.screen; nscreen++;
    ['DAtr', 'R', 'DAtrMin'].forEach(k => add('screen ' + k, s[k], e[k], same(s[k], e[k] == null ? null : e[k], 0.01)));
    const want = (Math.round(e.DAtr * 10) / 10).toFixed(1) + ' dB';
    add('screen tile DAtr', s.tiles, want, s.tiles.some(t => t === want));
  }
  if (c.anchor && reads) {
    anchorsTotal++;
    const g = reads.got[0], a = c.anchor;
    const ok = g.ok && (a.tol < 0.5 ? Math.abs(g.R - a.R) <= a.tol && Math.abs(g.DAtr - a.DAtr) <= a.tol : Math.round(g.R) === a.R && Math.round(g.DAtr) === a.DAtr);
    if (ok) anchorsPassed++; else add('anchor (printed G.1)', [g.R, g.DAtr], [a.R, a.DAtr], false);
  }
  results.push({ id: c.id, note: c.note, points: c.points.length, anchor: c.anchor ? true : undefined, preset: c.preset || undefined, checks_failed: bad, cmp, pass });
}
await browser.close();
const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'facadesound',
  file: 'facadesound.html',
  reference: 'bench-src/ref/gen_facadesound.py — independent Python implementation of EN ISO 12354-3:2017 §4.1 Formula (1), (4), §4.2 Formula (7), (8), Annex C Table C.1 and of NBN S 01-400-1:2022 §7.2 Tab. 3, Annex A Tab. A.1, Annex B, Annex C.3 Figures C.1–C.16, Annex D, over: the Annex G.1 worked example (printed values as external anchors, ' + anchorsPassed + '/' + anchorsTotal + '), the presets, a grid of 4 element sets × classes A/B/C × 4 room uses × 3 volumes × 4 exposures (notes a and c), boundaries of notes a / c, galleries D2m,A, façade area ≠ Σ Si and small elements, every Table C.1 shape × line of sight × αw, Annex B typology and two roads, all Annex C.3 figures × panes × α, vertical situations, Annex D map conversions and the refusals. Shared reading with the engine: Annex C.3 horizontal + vertical corrections added, class 4 at its lower bound, flanking neglected',
  external_anchors: { total: anchorsTotal, passed: anchorsPassed },
  reference_citations: [
    'EN ISO 12354-3:2017 Building acoustics — Estimation of acoustic performance of buildings from the performance of elements — Part 3: Airborne sound insulation against outdoor sound, §4.1 Formula (1)–(4), §4.2 Formula (7), (8), Annex C Table C.1, Annex G.1 Tables G.1–G.2',
    'NBN S 01-400-1:2022 Critères acoustiques pour les immeubles d’habitation, §7.2 Tab. 3 (notes a–c), §7.3.2, Annex A Tab. A.1, Annex B (B.1–B.3), Annex C (C.2, C.3 Figures C.1–C.16), Annex D (D.4–D.6)',
    'Learning assumptions / interpretations of both engine and reference (labelled on the page): Annex C.3 horizontal and vertical corrections added; Annex B class 4 at its lower bound 77 / 72 dB; flanking neglected (EN ISO 12354-3 §4.3)'
  ],
  tolerance: '±0,01 dB on R′Atr, DAtr (D2m,nT,Atr), D2m,A, ΔLfs, LA,day / LA,night, required DAtr / D2m,A and the Annex A element minima; exact weakest element (share ±1e-4), verdicts, Annex A verdicts per element and refusals; the printed Annex G.1 values within ±0,05 dB (R′Atr, D2m,nT,Atr) and the rounded R′w / D2m,nT,w exactly; the page path (preset → state → engine → DAtr tile) for every preset case',
  total, passed, failed, points: npts, screen_points: nscreen,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`facadesound: ${passed}/${total} passed (${npts} points, ${nscreen} through the page; external anchors ${anchorsPassed}/${anchorsTotal})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, r.checks_failed, JSON.stringify(r.cmp).slice(0, 900));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
