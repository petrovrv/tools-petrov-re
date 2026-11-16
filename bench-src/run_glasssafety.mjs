// Benchmark driver for glasssafety.html (Safety Glazing Selector, BE — NBN S 23-002/A1:2010 + NBN B 03-004:2017 + EN 12600:2002).
// Reference: bench-src/ref/gen_glasssafety.py (independent Python decision table re-typed from the rendered norm pages) -> ref/glasssafety_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_glasssafety.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected case, required classes per pane, pane verdicts and overall verdict were computed by bench-src/ref/gen_glasssafety.py, an independent Python decision table written from the rendered pages of NBN S 23-002/A1:2010 (Tableau 5 p. 12, Tableau 6 p. 13, case texts §4.4.2.2.1–4.4.2.2.2 incl. AC:2010), NBN B 03-004:2017 §9.2 and EN 12600:2002 §6, not from the page code. NBN B 03-004 Tab. 1 heights are checked against hand values; the visibility rule of NBN S 23-002:2007 §4.4.2.2.5 is re-typed. Not independent (shared reading with the engine): the EN 12600 class algebra, the class inference of undeclared products (learning assumption), the B → verify override, the insulating-glass adjacent-pane rule and the case-4 lower-pane choice. The norm example of §4.4.2.2.1 (case 2 → 1B1 → 33.2 PVB meets it) is the external anchor.' };
const P = benchPaths({ name: 'glasssafety', page: 'glasssafety.html', ref: 'glasssafety_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__glasssafety, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const results = [];
let npts = 0, anchorsTotal = 0, anchorsPassed = 0;
for (const c of ref) {
  let reads = null;
  try {
    reads = await p.evaluate(cc => cc.points.map(pt => {
      const G = window.__glasssafety; G.setInput(pt.input); const L = G.last;
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      if (!L) return { ok: false };
      if (!L.ok) return { ok: false, refused: L.reason };
      return { ok: true, case: L.caseKey, panes: L.panes.map(x => x.verdict), verdict: L.verdict,
        alts: L.reqs.map(rq => rq.map(x => x.alts.slice().sort()).sort()), tiles: tiles.slice(0, 3), stateIn: G.calcInput(G.state),
        Hp_mm: L.protection ? L.protection.Hp_mm : null, marking: !!(L.marking && L.marking.required) };
    }), c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!reads, bad = 0;
  const add = (k, g, x, ok) => { if (!ok) { pass = false; bad++; if (Object.keys(cmp).length < 20) cmp[k] = { got: g, exp: x }; } };
  (reads || []).forEach((g, i) => {
    const pt = c.points[i], e = pt.expect, k = pt.comp;
    npts++;
    if (e.refused) { add(k + '.refused', g.refused || null, e.refused, !g.ok && g.refused === e.refused); return; }
    if (!g.ok) { add(k + '.ok', false, true, false); return; }
    if (e.Hp_mm != null) add(k + '.Hp_mm', g.Hp_mm, e.Hp_mm, g.Hp_mm === e.Hp_mm);
    if (e.marking != null) add(k + '.marking', g.marking, e.marking, g.marking === e.marking);
    add(k + '.case', g.case, e.case, g.case === e.case);
    add(k + '.panes', g.panes, e.panes, JSON.stringify(g.panes) === JSON.stringify(e.panes));
    add(k + '.verdict', g.verdict, e.verdict, g.verdict === e.verdict);
    add(k + '.alts', g.alts, e.alts, JSON.stringify(g.alts) === JSON.stringify(e.alts));
    /* the page read the input as given (panes and declared classes survive the state round trip) */
    add(k + '.input', g.stateIn.glazing.panes, pt.input.glazing.panes, JSON.stringify(g.stateIn.glazing.panes.map(q => [q.plies_mm, q.interlayer_mm, q.glass])) === JSON.stringify(pt.input.glazing.panes.map(q => [q.plies_mm, q.interlayer_mm, q.glass])));
    /* what the reader sees: the 'panes checked' tile counts the panes that meet or have no requirement */
    const okN = e.panes.filter(v => v === 'pass' || v === 'free').length;
    add(k + '.screen', g.tiles[2], okN + ' / ' + e.panes.length, String(g.tiles[2]).replace(/\s/g, '') === okN + '/' + e.panes.length);
  });
  if (c.anchor) { anchorsTotal++; if (pass) anchorsPassed++; }
  results.push({ id: c.id, note: c.note, points: c.points.length, anchor: c.anchor || undefined, checks_failed: bad, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'glasssafety',
  file: 'glasssafety.html',
  reference: 'bench-src/ref/gen_glasssafety.py — independent Python decision table of NBN S 23-002/A1:2010 Tableau 5 / Tableau 6 and the case rules (re-typed from the rendered norm pages, not from the engine) over 9 building categories × 13 situations + Tableau 6 uses + balustrades, each with 4–8 glass compositions, plus the branches added by r2-fix: NBN B 03-004 Tab. 1 protection heights (thin / thick / ≥ 12 m / H′, checked against hand values) and a too-low guard, barrier options, a public outdoor side, partitions (two sides), case 4 by overhang and with the room side in case 2, the > 30° refusals, case 3 C with other impacts (recommendation), H = 1,10 m, triple glazing, the small-pane width / area rule and the visibility marking; + the norm example (case 2 → 1B1 → 33.2 PVB) as external anchor (' + anchorsPassed + '/' + anchorsTotal + '). The EN 12600 class algebra, the class inference of undeclared products, the insulating-glass rule and the case-4 lower pane are a shared reading with the engine, not an independent check',
  external_anchors: { total: anchorsTotal, passed: anchorsPassed },
  reference_citations: [
    'NBN S 23-002/A1:2010 (+AC:2010) Vitrerie — Amendement n°1, §4.4.2.1 Tab. 3–4, §4.4.2.2.1 (human-activity zones, insulating glass, example), §4.4.2.2.2 cases 1–9, Tableau 5, Tableau 6',
    'NBN B 03-004:2017 Garde-corps, §5.3.1 Tab. 1 (protection height H, H′ = H + y) and §9.2 (laminated 1B1 only; all-toughened laminate needs a top rail or a post-breakage test)',
    'NBN S 23-002:2007 Vitrerie §4.4.2.2.5 (visibility marking)',
    'EN 12600:2002 Pendulum test, §6.2 drop height class, §6.3 mode of breakage',
    'Learning assumption of both engine and reference (labelled on the page): undeclared laminated PVB ≥ 0,76 mm ≈ 1B1, 0,38 mm ≈ 2B2; monolithic toughened = C of unknown class (verify)'
  ],
  tolerance: 'exact on the refusal reason (> 30°), the protection height H′ and the marking flag where expected, the case, the required alternatives per pane, every pane verdict (pass / verify / fail / free) and the overall verdict; the page state must carry the input panes unchanged; the headline tile must show the count of panes that meet or have no requirement',
  total, passed, failed, points: npts,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`glasssafety: ${passed}/${total} passed (${npts} points; external anchors ${anchorsPassed}/${anchorsTotal})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(r.cmp).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
