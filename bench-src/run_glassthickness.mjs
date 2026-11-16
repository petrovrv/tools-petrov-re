// Benchmark driver for glassthickness.html (Glass Thickness for Wind, Snow & Climate Loads — NBN S 23-002-2:2020, NBN S 23-002-3:2020).
// Reference: bench-src/ref/gen_glassthickness.py (independent Python: printed Tab. 24 / 32 isochoric pressures, eq. (9)(10) φ, Tab. 7 sharing,
// direct 2 × 2 cavity solve for triple units, EN 16612 Annex B plate form) -> ref/glassthickness_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_glassthickness.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Utilisation per pane and load case, governing case and pane were computed by bench-src/ref/gen_glassthickness.py, written from NBN S 23-002-2:2020 (§4.2–4.5, §8.5, §9.2, §10.2–10.4, Tab. 1, 5, 7, 24, 32, 39), NBN S 23-002-3:2020 (§3.2, Tab. 1–3) and EN 16612:2019 Annex B, not from the page code: the reference takes the printed extreme isochoric pressures of Tab. 24 / 32 (the page recombines the Tab. 21 / 29 components with eq. (69)–(76)), the printed φ of eq. (9)(10) and the closed form of Tab. 7 for double units, and solves the two cavity balances of eq. (28) directly for triple units. Three cells of the NBN S 23-002-3 §5 tables (composition printed for that size) must pass. r2-fix: part 4 cases (eq. (1)(2)(5)–(7), Ψp from the printed Tab. 1.a rows, Gint,d of NBN S 23-002-5 Tab. 1 log-linear, pane temperatures 11 / 20,2 °C), single roof panes (§10.5 Tab. 41 + uplift + self-weight alone; the roof cp, snow defaults and s·cos²θ are the tool learning assumptions and are taken over as inputs, so they are shared, not checked), printed Tab. 6 hef and Tab. 1 kmod values, and 26 tabulated cells of NBN S 23-002-3 / -5 §5 (the tabulated composition passes, the next thinner of the same row fails; cells taken in a fixed order from the middle of each table, none skipped). Not in the independent path: 3-edge plates (§5.3 Tab. 17), roof insulating units (§10.6) and the EN 16612 set — covered by the engine tests only. The triple-unit cavity balance has the same structure as the page (solved directly, not by the Tab. 10 closed forms).' };
const P = benchPaths({ name: 'glassthickness', page: 'glassthickness.html', ref: 'glassthickness_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__glassthickness, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const results = [];
let npts = 0, anchorsTotal = 0, anchorsPassed = 0, maxDev = 0;
const probe = inp => p.evaluate(i => {
  const G = window.__glassthickness; G.setInput(i); const L = G.last;
  const panes = L.igu ? L.igu.panes : [{ position: 'single', cases: L.pane.cases }];
  return { pass: !!L.pass, util: L.util, basis: !(L.warnings || []).includes('freq_table_basis'),
    cases: [].concat(...panes.map(q => q.cases.map(x => ({ pane: q.position, id: x.id, util: x.util, kmod: x.kmod, hef_w_mm: x.hef_w_mm, hef_sigma_mm: x.hef_sigma_mm })))) };
}, inp);
let tableTotal = 0, tablePassed = 0, ptsTotal = 0;
for (const c of ref) {
  if (c.anchor === 'table' || c.points) {   /* r2-fix: tabulated cells (pass at size, next thinner fails) and printed Tab. 6 / Tab. 1 values */
    const cmp = {}; let pass = true, bad = 0;
    const add = (k, got, exp, ok) => { npts++; if (!ok) { pass = false; bad++; if (Object.keys(cmp).length < 12) cmp[k] = { got, exp }; } };
    try {
      if (c.anchor === 'table') {
        const a = await probe(c.input), b = await probe(c.input_thinner);
        add('tabulated_passes', a.util, 'pass', a.pass && a.basis);
        add('thinner_fails', b.util, 'fail', !(b.pass && b.basis));
        tableTotal++; anchorsTotal++; if (pass) { tablePassed++; anchorsPassed++; }
      } else {
        const a = await probe(c.input);
        for (const [id, want] of Object.entries(c.points)) {
          const q = a.cases.find(x => x.id === id) || {};
          for (const [k, v] of Object.entries(want)) { ptsTotal++; add(id + ':' + k, q[k], v, Math.abs((q[k] ?? NaN) - v) <= (k === 'kmod' ? 1e-9 : 0.006)); }
        }
      }
    } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); pass = false; }
    results.push({ id: c.id, note: c.note, anchor: c.anchor || undefined, checks_failed: bad, cmp, pass });
    continue;
  }
  let g = null;
  try {
    g = await p.evaluate(inp => {
      const G = window.__glassthickness; G.setInput(inp); const L = G.last;
      const panes = L.igu ? L.igu.panes : [{ position: 'single', cases: L.pane.cases }];
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { util: L.util, governing: L.governing, governing_pane: L.governing_pane || 'single', tiles,
        cases: [].concat(...panes.map(q => q.cases.map(x => ({ pane: q.position, id: x.id, util: x.util })))) };
    }, c.input);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!g, bad = 0;
  const add = (k, got, exp, ok) => { npts++; if (!ok) { pass = false; bad++; if (Object.keys(cmp).length < 12) cmp[k] = { got, exp }; } };
  if (g) {
    const dev = Math.abs(g.util - e.util) / Math.max(e.util, 0.2); maxDev = Math.max(maxDev, dev);
    add('util', g.util, e.util, dev <= 0.005);
    add('governing', g.governing, e.governing, g.governing === e.governing);
    add('governing_pane', g.governing_pane, e.governing_pane, g.governing_pane === e.governing_pane);
    e.cases.forEach(x => { const q = g.cases.find(y => y.pane === x.pane && y.id === x.id);
      const d = q ? Math.abs(q.util - x.util) / Math.max(x.util, 0.2) : 1; maxDev = Math.max(maxDev, d);
      add(x.pane + ':' + x.id, q ? q.util : null, x.util, d <= 0.005); });
    /* what the reader sees: the utilisation tile to 2 decimals */
    add('screen', g.tiles[0], e.util.toFixed(2), Math.abs(parseFloat(String(g.tiles[0]).replace(',', '.')) - e.util) <= 0.006);
    if (c.anchor) add('anchor', g.util, '<= 1', g.util <= 1 + 1e-9);
  }
  if (c.anchor) { anchorsTotal++; if (pass) anchorsPassed++; }
  results.push({ id: c.id, note: c.note, anchor: c.anchor || undefined, checks_failed: bad, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'glassthickness',
  file: 'glassthickness.html',
  reference: 'bench-src/ref/gen_glassthickness.py — independent Python check of NBN S 23-002-2:2020 façade cases (single, laminated, double and triple insulating glass on 4 or 2 edges, Tab. 39 with the printed Tab. 24 / 32 isochoric pressures) with EN 16612 Annex B plates; ' + total + ' cases; NBN S 23-002-4 / -5:2025 part 4 cases (pane temperatures 11 / 20,2 °C), single roof panes (Tab. 41), printed Tab. 6 hef and Tab. 1 kmod (' + ptsTotal + ' points), ' + tableTotal + ' tabulated cells of NBN S 23-002-3 / -5 §5 (tabulated composition passes, next thinner fails: ' + tablePassed + '/' + tableTotal + ') and 3 more cells that must pass; external anchors ' + anchorsPassed + '/' + anchorsTotal,
  external_anchors: { total: anchorsTotal, passed: anchorsPassed, table_cells: { total: tableTotal, passed: tablePassed }, printed_points: ptsTotal },
  reference_citations: [
    'NBN S 23-002-2:2020 §4.2 eq. (1)(2), Tab. 1 (kmod), §4.3 eq. (3)(4), Tab. 5 (ω)',
    'NBN S 23-002-2:2020 §4.4.1 eq. (5)–(11), Tab. 7, Tab. 8; §4.5.3 eq. (25)–(28); §4.4.2 / §4.5.4 (Δd = φ·p0)',
    'NBN S 23-002-2:2020 §8.5.2 Tab. 24 (double) and Tab. 32 (triple) extreme isochoric pressures; §9.2; §10.2.1 / §10.2.2; §10.4 Tab. 39; §5.4 eq. (52)(54); §8.5.2.1',
    'NBN S 23-002-3:2020 §3.2.1 (cprob 0,96, cpi +0,2 / −0,3, γQ 1,1), §4 Tab. 1 (class qp), Tab. 2–3 (net cp), §5 tabulated compositions (anchors)',
    'EN 16612:2019 Annex B (non-linear plate coefficients k1, k4)',
    'NBN S 23-002-2:2020 §10.5 Tab. 41 (single roof panes), Tab. 6 (printed hef of laminated glass), Tab. 1 (kmod)',
    'NBN S 23-002-4:2025 §5.2 eq. (1)(2), §5.4.2 eq. (5)–(7), Tab. 1.a (Ψp); NBN S 23-002-5:2025 Tab. 1 (Gint,d 600 s, glass temperature per pane)',
    'NBN S 23-002-3:2020 §5 and NBN S 23-002-5:2025 tabulated compositions: 26 cells (classes 1, 4, 6/7; zones 1, 2; single, laminated, double, triple, part 4) — the tabulated composition passes, the next thinner of the same row fails'
  ],
  tolerance: 'utilisation ≤ 0,5 % (relative, floor 0,2) for the worst case and for every pane × load case; governing case and pane exact; the utilisation tile shows the reference value to 2 decimals; anchors: util ≤ 1; max deviation ' + (maxDev * 100).toFixed(4) + ' %',
  total, passed, failed, points: npts,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`glassthickness: ${passed}/${total} passed (${npts} points; external anchors ${anchorsPassed}/${anchorsTotal}, table cells ${tablePassed}/${tableTotal}, printed points ${ptsTotal}; max util dev ${(maxDev * 100).toFixed(4)} %)`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(r.cmp).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
