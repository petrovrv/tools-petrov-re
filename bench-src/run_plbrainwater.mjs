// Benchmark driver for plbrainwater.html (rainwater reuse & infiltration, Flanders GSV Hemelwater 2023).
// Reference: bench-src/ref/gen_plbrainwater.py (independent implementation of _plb/rain/METHOD.md) -> ref/plbrainwater_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbrainwater.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected annual rain, inflow, demand, yield, overflow volume and days, empty days, coverage, efficiency, savings, the DIN 1989-1 simplified tank and the GSV Hemelwater 2023 minimum tank, infiltration and buffer volumes were computed by bench-src/ref/gen_plbrainwater.py, an independent Python implementation written from the published method (_plb/rain/METHOD.md: Markov-chain synthetic daily rain from the KMI Uccle 1991-2020 normals with the Park-Miller minstd generator, yield-after-spillage daily balance of EN 16941-1, DIN 1989-1 6 % rule, GSV Hemelwater 2023 articles as quoted in METHOD.md §4), not from the page code. Honest scope (D-PLB-10): consistency with METHOD + 10 external anchors whose expected values were written down by hand from the decree text (BVR 10.02.2023 art. 7 §1, §2, §3, §6, art. 8, art. 9), from the DIN 1989-1 simplified formula and from the sum of the KMI monthly normals (r4 Y6-5: one-year series, every month meets its normal); the generator stops if the method disagrees with an anchor, and the bench checks the page against the anchor numbers separately. Six r3 input cases (X3-1): the reference applies the input rule of METHOD §7 itself (an unrecognised choice -> valid:false, error choice:<field>) and the page must refuse them with the same code and show no result. The KMI normals and the DIN 1989-1 Table 3 yield coefficients are input data of the method.' };
const P = benchPaths({ name: 'plbrainwater', page: 'plbrainwater.html', ref: 'plbrainwater_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbrainwater, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const REL = 0.001;
const rel = (g, e) => typeof g === 'number' && Math.abs(g - e) <= REL * Math.max(Math.abs(e), 1e-9) + 1e-9;
const SIM = ['rain_mm', 'inflow', 'demand', 'yield', 'overflow', 'overflow_days', 'empty_days', 'coverage', 'efficiency', 'savings_eur', 'din_V_m3'];
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbrainwater, st = M.state, base = M.presetState(M.PRESET_IDS[0]);
      Object.keys(base).forEach(k => { st[k] = base[k]; });
      Object.keys(cc).forEach(k => { if (!['id', 'note', 'expect', 'anchors'].includes(k)) st[k] = cc[k]; });
      st.preset = ''; M.ui.sync(); M.ui.run();
      const L = M.last;
      if (!L || !L.valid) return { valid: false, errors: L && L.errors, tiles: document.querySelectorAll('.dgu-tile').length,
        verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim() };
      const tile = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      const s = L.sim;
      return { valid: true, rain_mm: s.rain_mm, inflow: s.inflow, demand: s.demand, yield: s.yield, overflow: s.overflow, overflow_days: s.overflow_days,
        empty_days: s.empty_days, coverage: s.coverage, efficiency: s.efficiency, savings_eur: L.savings_eur, din_V_m3: L.din.V_m3,
        gsv: L.gsv ? M.gsvCompare(L.gsv) : null, tiles: tile.slice(0, 3) };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!(read && read.valid);
  const add0 = (k, g, x, ok) => { cmp[k] = { got: g, exp: x, ok }; };
  if (e.valid === false) {
    /* r3 X3-1: an unrecognised choice must be refused with the reference error code; the page shows no result tiles and names the field */
    const codes = read && read.errors ? [...read.errors].sort() : null, want = [...e.errors].sort();
    const okCodes = !!read && read.valid === false && JSON.stringify(codes) === JSON.stringify(want);
    const okScreen = !!read && read.tiles === 0 && /Input not valid/.test(read.verdict || '') && !/choice:/.test(read.verdict || '');
    add0('errors', codes, want, okCodes); add0('screen', read && [read.tiles, read.verdict], 'no tiles, invalid verdict with field label', okScreen);
    const { expect, ...inputs } = c;
    results.push({ id: c.id, note: c.note, inputs, expect_invalid: want, cmp, pass: okCodes && okScreen });
    continue;
  }
  const add = (k, g, x, ok) => { cmp[k] = { got: g, exp: x, ok }; if (!ok) pass = false; };
  if (read && read.valid) {
    for (const k of SIM) add(k, read[k], e[k], rel(read[k], e[k]));
    /* external anchors: hand values from the decree / DIN 1989-1 text */
    for (const [k, x] of Object.entries(c.anchors || {})) {
      const g = k.startsWith('gsv.') ? (read.gsv || {})[k.slice(4)] : read[k];
      add('anchor.' + k, g, x, typeof x === 'number' ? Math.abs(g - x) <= 1e-6 * Math.max(1, Math.abs(x)) : g === x);
    }
    for (const k of Object.keys(e.gsv || {})) {
      const g = read.gsv ? read.gsv[k] : undefined, x = e.gsv[k];
      add('gsv.' + k, g, x, typeof x === 'number' ? rel(g, x) : JSON.stringify(g) === JSON.stringify(x));
    }
    /* what the reader sees: tile 1 coverage % (0 dp), tile 2 yield m³/a (1 dp) */
    const num = s => Number(String(s).replace(/[\s\u202f\u00a0,%]/g, ''));
    const t0 = num(read.tiles[0]), t1 = num(read.tiles[1]);
    add('screen', [read.tiles[0], read.tiles[1]], [Math.round(e.coverage * 100), Math.round(e.yield * 10) / 10],
      Math.abs(t0 - e.coverage * 100) <= 0.5 + 1e-9 && Math.abs(t1 - e.yield) <= 0.05 + 1e-9);
  } else add('valid', read && read.errors, 'valid', false);
  const { expect, ...inputs } = c;
  results.push({ id: c.id, note: c.note, inputs, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbrainwater',
  file: 'plbrainwater.html',
  reference: 'bench-src/ref/gen_plbrainwater.py — independent Python implementation of the published method _plb/rain/METHOD.md',
  reference_citations: [
    'KMI/IRM climate normals Uccle 1991–2020 (monthly precipitation, days with ≥ 1 mm)',
    'EN 16941-1:2018 On-site non-potable water systems — rainwater (daily behavioural model, yield after spillage)',
    'DIN 1989-1:2002-04 Regenwassernutzungsanlagen (Table 3 yield coefficients, filter efficiency 0.9, simplified tank 6 %)',
    'Gewestelijke stedenbouwkundige verordening hemelwater (GSV Hemelwater), BVR 10 February 2023, in force 2 October 2023 (art. 22)',
    'Park & Miller (1988) minimal standard generator; _plb/rain/METHOD.md revision plbrain-1.3'
  ],
  tolerance: 'relative 0.1 % on all simulated annual values, the DIN 1989-1 volume and the GSV volumes/areas; exact on GSV applicability and pass/fail; the headline tiles must show the coverage (±0.5 %-point) and the yield (±0.05 m³/a)',
  total, passed, failed,
  invalid_input_cases: { cases: results.filter(r => r.expect_invalid).length, passed: results.filter(r => r.expect_invalid && r.pass).length },
  external_anchors: { cases: results.filter(r => Object.keys(r.cmp).some(k => k.startsWith('anchor.'))).length, passed: results.filter(r => Object.keys(r.cmp).some(k => k.startsWith('anchor.')) && r.pass).length },
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbrainwater: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
