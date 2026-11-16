// Benchmark driver for plbfixtures.html.
// Reference: bench-src/ref/gen_plbfixtures.py (independent implementation of _plb/fix/METHOD.md) -> ref/plbfixtures_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbfixtures.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected WCs per sex, urinals, washbasins, washing taps, showers, accessible WCs, the project inventory and the pooled comparison were computed by bench-src/ref/gen_plbfixtures.py, an independent Python implementation written from the published method (_plb/fix/METHOD.md: Belgian Codex welzijn op het werk Book III Title 1 as published by FOD WASO, ASR A4.1 Table 2, HSE L24 Tables 1-2), not from the page code.' };
const P = benchPaths({ name: 'plbfixtures', page: 'plbfixtures.html', ref: 'plbfixtures_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbfixtures, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const ZKEYS = ['female', 'male', 'wc_women', 'wc_men', 'wc_mixed', 'urinals', 'washbasins', 'washing_taps', 'showers', 'accessible_wc', 'positions'];
const FKEYS = ['wc_cistern', 'urinal_flush', 'basin', 'shower'];
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbfixtures, st = M.state;
      const opts = Object.assign({}, cc.opts); delete opts.female_pct;
      st.doc = { schema: 'tools.petrov.re/plumbing/v1', revision: 1, project: { name: 'bench', region: 'be_flanders', building_type: 'office', currency: 'EUR', year: 2026 },
                 zones: JSON.parse(JSON.stringify(cc.zones)), modules: { plbfixtures: { state: { opts }, results: {}, summary: {} } } };
      st.sel = 0; st.origin = 'preset'; st.applied = false;
      M.ui.sync(); M.ui.run();
      const L = M.last;
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      const vEl = document.querySelector('.dgu-verdict'); const verdictWarn = !!vEl && vEl.classList.contains('warn');
      let applied = null;
      if (cc.apply) {
        M.applyInventory(); M.ui.sync(); M.ui.run();
        applied = st.doc.zones.map(z => ({ fixtures: z.fixtures, workplace_min: z.workplace_min ? Object.fromEntries(['wc_cistern', 'urinal_flush', 'basin', 'shower'].map(k => [k, z.workplace_min[k]])) : null }));
        localStorage.removeItem('tools.petrov.re/plumbing/project');
      }
      return { zones: L.zones.map(r => r.valid ? { female: r.female, male: r.male, wc_women: r.women.wc, wc_men: r.men.wc, wc_mixed: r.unisex.wc, urinals: r.men.urinals,
                 washbasins: r.women.washbasins + r.men.washbasins + r.unisex.washbasins, washing_taps: r.washing_taps, showers: r.showers, accessible_wc: r.accessible_wc, positions: r.positions, fixtures: r.fixtures, incomplete: r.incomplete } : { status: r.status, errors: r.errors }),
               totals: L.totals, pooled: L.pooled ? L.pooled.positions : null, incomplete: L.incomplete, verdictWarn, tiles, applied };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!read;
  c.expect.zones.forEach((ex, i) => {
    const g = read && read.zones[i];
    if (ex.status === 'invalid') {
      // r3 X1-3: invalid input -> zone listed as invalid with the expected error code, not counted
      const ok = !!g && g.status === 'invalid' && JSON.stringify(g.errors) === JSON.stringify(ex.errors);
      cmp[c.zones[i].id + '.invalid'] = { got: g ? (g.errors || g.status || null) : null, exp: ex.errors, ok }; if (!ok) pass = false;
      return;
    }
    for (const k of ZKEYS) { const ok = !!g && g[k] === ex[k]; cmp[c.zones[i].id + '.' + k] = { got: g ? g[k] : null, exp: ex[k], ok }; if (!ok) pass = false; }
    for (const k of FKEYS) { const ok = !!g && g.fixtures[k] === ex.fixtures[k]; cmp[c.zones[i].id + '.' + k] = { got: g ? g.fixtures[k] : null, exp: ex.fixtures[k], ok }; if (!ok) pass = false; }
    /* r4 Y1-4/Y1-5: requested items the rule set does not compute */
    { const ok = !!g && JSON.stringify(g.incomplete) === JSON.stringify(ex.incomplete); cmp[c.zones[i].id + '.incomplete'] = { got: g ? g.incomplete : null, exp: ex.incomplete, ok }; if (!ok) pass = false; }
  });
  { const ok = !!read && JSON.stringify(read.incomplete) === JSON.stringify(c.expect.incomplete); cmp['total.incomplete'] = { got: read ? read.incomplete : null, exp: c.expect.incomplete, ok }; if (!ok) pass = false; }
  /* an incomplete result must not look like a complete minimum: the verdict carries the warning tone */
  if (c.expect.incomplete.length) { const ok = !!read && read.verdictWarn === true; cmp['screen.incomplete_warn'] = { got: read ? read.verdictWarn : null, exp: true, ok }; if (!ok) pass = false; }
  for (const k of FKEYS.concat(['positions', 'persons', 'accessible_wc'])) { const ok = !!read && read.totals[k] === c.expect.totals[k]; cmp['total.' + k] = { got: read ? read.totals[k] : null, exp: c.expect.totals[k], ok }; if (!ok) pass = false; }
  { const ok = !!read && read.pooled === c.expect.pooled_positions; cmp.pooled_positions = { got: read ? read.pooled : null, exp: c.expect.pooled_positions, ok }; if (!ok) pass = false; }
  /* what the reader sees: when anyone is present, the first tiles carry the total WCs and urinals */
  if (c.expect.totals.persons > 0) {
    const t = read ? read.tiles : [];
    const num = s => String(s || '').replace(/[^\d]/g, '');
    const ok = !!read && num(t[0]) === String(c.expect.totals.wc_cistern) && num(t[1]) === String(c.expect.totals.urinal_flush);
    cmp.screen = { got: t.slice(0, 2), exp: [c.expect.totals.wc_cistern, c.expect.totals.urinal_flush], ok }; if (!ok) pass = false;
  }
  /* D-PLB-6: Apply = max(existing, minimum), nothing lowered or deleted, minimum kept as workplace_min */
  if (c.apply) {
    c.expect.apply.forEach((ex, i) => {
      const g = read && read.applied && read.applied[i];
      const ok = !!g && JSON.stringify(Object.entries(g.fixtures).sort()) === JSON.stringify(Object.entries(ex.fixtures).sort()) && JSON.stringify(g.workplace_min) === JSON.stringify(ex.workplace_min);
      cmp[c.zones[i].id + '.apply'] = { got: g || null, exp: ex, ok }; if (!ok) pass = false;
    });
  }
  results.push({ id: c.id, note: c.note, inputs: { zones: c.zones, opts: c.opts }, anchor: c.anchor || undefined, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbfixtures',
  file: 'plbfixtures.html',
  reference: 'bench-src/ref/gen_plbfixtures.py — consistency with the published method _plb/fix/METHOD.md (Python, not ported from the page) + ' + ref.filter(c => c.anchor).length + ' external anchors typed by hand from the cited table rows / reading examples (ASR A4.1 Tabelle 2, Abb. 1 and Nr. 4 (6); HSE L24 Tables 1-2; Codex Book III Title 1) + ' + ref.filter(c => c.apply).length + ' Apply cases (D-PLB-6: never lower or delete) + ' + ref.filter(c => c.id.startsWith('x13-')).length + ' input-rule cases (r3 X1-3: fractional or out-of-range headcount -> zone invalid with its error code, not counted) + 11 r4 cases (Codex Y1-3 ASR Nr. 4 (6) on the establishment headcount; Y1-4/Y1-5 incomplete flag with warning verdict, L24 para 201 dirty-work washbasins; Y1-8 L24 para 200 increments)',
  external_anchors: { total: ref.filter(c => c.anchor).length, passed: results.filter(r => r.anchor && r.pass).length },
  reference_citations: [
    'Codex over het welzijn op het werk, Boek III Titel 1 Arbeidsplaatsen — sanitaire voorzieningen (FOD WASO, werk.belgie.be, consulted 2026-11-05)',
    'ASR A4.1 Sanitärräume, Tabelle 2 Mindestanzahl von Toiletten einschließlich Urinale, Handwaschgelegenheiten; Abb. 1 Ablesebeispiel',
    'ASR A4.1 Nr. 4 Abs. 6: up to nine employees, separate toilet rooms may be omitted with time-separated use (vorschriften.bgn-branchenwissen.de/daten/tr/asr_a4_1/4.htm, consulted 2026-11-06)',
    'HSE ACOP L24 Workplace health, safety and welfare (3rd ed. 2013), Tables 1 and 2, para 200 (above 100 people) and para 201 (dirty work washbasins), pp. 39-40 (hse.gov.uk/pubns/priced/l24.pdf, read 2026-11-06)',
    '_plb/fix/METHOD.md revision plbfixtures-1.3 (ASR rows beyond 250 and the accessible-WC counting stated as assumptions)'
  ],
  tolerance: 'exact: every count (integers from table look-ups and ceilings) of every zone, the project totals and the pooled comparison must equal the reference; the headline tiles must show the total WCs and urinals',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbfixtures: ${passed}/${total} passed (external anchors ${results.filter(r => r.anchor && r.pass).length}/${ref.filter(c => c.anchor).length})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
