// Benchmark driver for windowclasses.html (Window Performance Classes, BE — NBN B 25-002-1:2019 + ISO 10077-1:2006).
// Reference: bench-src/ref/gen_windowclasses.py (independent Python: Tab. 2 re-typed from the rendered page, Tab. 3 / 14 + notes, EN 1991-1-4 qp, Tab. 11,
// minimum fRsi recomputed from the reference climates of Tab. 7, ISO 10077-1 eq. (1)) -> ref/windowclasses_ref.json. Comparison: bench-src/windowclasses_cmp.mjs.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_windowclasses.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
import { compareWindow } from './windowclasses_cmp.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Exposure class, air / water / wind classes with P1–P3, Annex C equivalents, curtain-wall classes and test pressures, impact case and classes, minimum fRsi and surface temperatures, Uw and mullion deflection were computed by bench-src/ref/gen_windowclasses.py, written from NBN B 25-002-1:2019 (Tab. 2 re-typed from the rendered page, Tab. 3, 11, 13, 14, §6.5.5, §7.4, Annex C; the Tab. 7 minimum fRsi recomputed from its reference climates, not copied), EN 1991-1-4:2005 §4.3–4.5 and ISO 10077-1:2006 eq. (1) / Annex E, not from the page code. The typical fRsi of frames and glass edges and the default cp are learning assumptions shared by both (re-typed, not imported). The norm’s own Tab. 2 example (W4: roughness I 17 m 25 m/s = roughness II 44 m 24 m/s) and a hand reading are external anchors.' };
const P = benchPaths({ name: 'windowclasses', page: 'windowclasses.html', ref: 'windowclasses_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__windowclasses, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const results = [];
let npts = 0, anchorsTotal = 0, anchorsPassed = 0;
for (const c of ref) {
  let g = null;
  try {
    g = await p.evaluate(inp => {
      const G = window.__windowclasses; G.setInput(inp);
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { last: JSON.parse(JSON.stringify(G.last)), tiles };
    }, c.input);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const k = g ? compareWindow(g.last, c.expect) : { n: 1, nbad: 1, bad: { driver: 'no result' } };
  /* what the reader sees: the first tile shows the exposure class (window: W n; curtain wall: W n → CW n) */
  if (g && g.last && g.last.ok) {
    k.n++;
    const want = c.expect.cw ? c.expect.cw.W + ' → ' + c.expect.cw.CW : (c.expect.window ? c.expect.window.W : g.last.exposure.cls);
    if (g.tiles[0] !== want) { k.nbad++; k.bad.screen = { got: g.tiles[0], exp: want }; }
  }
  npts += k.n;
  const pass = k.nbad === 0;
  if (c.anchor) { anchorsTotal++; if (pass) anchorsPassed++; }
  results.push({ id: c.id, note: c.note, anchor: c.anchor || undefined, checks_failed: k.nbad, cmp: k.bad, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'windowclasses',
  file: 'windowclasses.html',
  reference: 'bench-src/ref/gen_windowclasses.py — independent Python transcription of NBN B 25-002-1:2019 Tab. 2 (every height cell at its printed limit and 1 m above), Tab. 3 with notes 1–4, Annex C, §6.5.5 mullion deflection, Tab. 13 / 14 with §7.4 wK / wU (qp by EN 1991-1-4:2005), §6.15.2 cases and Tab. 11, Method II with the minimum fRsi recomputed from the Tab. 7 reference climates, ISO 10077-1:2006 eq. (1) with Annex E Ψg; ' + total + ' cases, external anchors ' + anchorsPassed + '/' + anchorsTotal,
  external_anchors: { total: anchorsTotal, passed: anchorsPassed },
  reference_citations: [
    'NBN B 25-002-1:2019 §6.5.6 Tab. 2 (wind exposure classes W1–W8) and the example under it (W4: I 17 m 25 m/s = II 44 m 24 m/s)',
    'NBN B 25-002-1:2019 §6.5.7 Tab. 3 and notes 1–4; §6.5.5; Annex C Fig. C.1',
    'NBN B 25-002-1:2019 §7.4.2 / 7.4.3 (wK, wU), §7.5.4 Tab. 13, §7.5.5 Tab. 14 and notes 1–3',
    'NBN B 25-002-1:2019 §6.15.2.1 (cases 1–3, Hf = h + 0,5·l, he < H), §6.15.2.2 Tab. 11 and note (1), §6.15.1 Tab. 10',
    'NBN B 25-002-1:2019 §6.8.3.3.2 (fRsi), §6.8.3.3.5 Tab. 7 (reference indoor climates θi / θsi per class) — minimum recomputed as (θsi − θe)/(θi − θe), 2 decimals',
    'EN 1991-1-4:2005 §4.3–4.5, Table 4.1 recommended terrain parameters (NBN EN 1991-1-4 ANB:2010 not available — D-BW-15)',
    'ISO 10077-1:2006 §5.1 eq. (1), Annex E Tables E.1 / E.2',
    'Learning assumptions of both page and reference (labelled on the page): typical fRsi of frames and glass edges by frame type and spacer, default cp 1,0'
  ],
  tolerance: 'classes exact; qp, wK, wU ≤ 0,5 %; fRsi, θsi, Uw, deflection ≤ 10⁻⁶ relative; the first tile must show the reference exposure class',
  total, passed, failed, points: npts,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`windowclasses: ${passed}/${total} passed (${npts} points; external anchors ${anchorsPassed}/${anchorsTotal})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(r.cmp).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
