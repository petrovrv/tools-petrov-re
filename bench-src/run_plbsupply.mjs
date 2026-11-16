// Benchmark driver for plbsupply.html.
// Reference: bench-src/ref/gen_plbsupply.py (independent implementation of _plb/sup/METHOD.md) -> ref/plbsupply_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbsupply.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected design flows, pipe sizes of every segment, the worst branch and its pressure reserve, the booster flag and head and the number of upsizing steps were computed by bench-src/ref/gen_plbsupply.py, an independent Python implementation written from the published method (_plb/sup/METHOD.md plbsupply-1.3: DIN 1988-300 design flows, peak-flow constants and velocity limits, EN 806-3 loading units with the Annex B Fig. B.1 lines (digitised from the licensed copy; since engine plbsupply-1.4), Kell density, IAPWS 2008 viscosity, Colebrook-White solved by Newton iteration, the stated tree and sizing rules), not from the page code. Revision 1.3 (r4) adds the cold and hot systems downstream of the heater tee in the cold + hot mode (Y2-1), the DIN 1988-300 utilisation-unit floor (two largest draw-offs, Y2-2) and the unsized-segment flag no_size_v (Y2-4); their cases are y21-*, y22-*, y24-*. Three invalid-input cases (bad-*: fractional fixture count, units, floor) check that the engine refuses them with the METHOD error codes and the page shows no result. Honest scope: this is consistency with METHOD plus 6 external anchors (cases anchor-*) computed by hand from the DIN 1988-300 peak-flow formula and velocity limits with EN 1057 / EN 12201 bores, one of them (anchor-unit-two-largest) from the DIN utilisation-unit example quoted by SHK Profi 8/2012 (secondary source), one (anchor-flats-en806-fig) from the EN 806-3 Fig. B.1 lines by hand; no DIN 1988-300 Beiblatt or EN 806-3 annex worked example was available to the authors. Case inputs are defined in the generator.' };
const P = benchPaths({ name: 'plbsupply', page: 'plbsupply.html', ref: 'plbsupply_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbsupply, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const fmt2 = v => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const results = [];
for (const c of ref) {
  let read = null;
  if (c.expect && c.expect.valid === false) {
    /* X1-1 invalid input: the engine must refuse it with the expected codes, and the page must show "invalid" without result tiles */
    try {
      read = await p.evaluate(cc => {
        const M = window.__plbsupply, st = M.state, inp = JSON.parse(JSON.stringify(cc.input));
        const eng = window.PLBSupply.solve(JSON.parse(JSON.stringify(cc.input)));
        const zones = inp.zones; delete inp.zones;
        st.inp = inp;
        st.zones = zones.map(z => ({ id: z.id, floor: z.floor, units: z.units, fx: Object.keys(z.fixtures).map(k => k + ':' + z.fixtures[k]).join(', '), sim: !!z.simultaneous, q_cont_lps: z.q_cont_lps || 0 }));
        st.origin = 'preset';
        M.ui.sync(); M.ui.run();
        return { valid: eng.valid, errors: eng.errors || [], tiles: document.querySelectorAll('.dgu-tile').length,
                 verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim(), invalidText: M.strings().I18N['v.invalid'] };
      }, c);
    } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
    const cmp = {}; let pass = !!read;
    const chk = (k, got, exp, ok) => { cmp[k] = { got, exp, ok }; if (!ok) pass = false; };
    if (read) {
      chk('valid', read.valid, false, read.valid === false);
      chk('errors', read.errors, c.expect.errors, c.expect.errors.every(x => read.errors.includes(x)));
      const inv = read.invalidText && typeof read.invalidText === 'object' ? (read.invalidText.en || '') : String(read.invalidText || '');
      chk('screen', [read.tiles, read.verdict], [0, inv], read.tiles === 0 && (!inv || read.verdict.includes(inv)));
    }
    results.push({ id: c.id, note: c.note, inputs: c.input, cmp, pass });
    continue;
  }
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbsupply, st = M.state, inp = JSON.parse(JSON.stringify(cc.input));
      const zones = inp.zones; delete inp.zones;
      st.inp = inp;
      st.zones = zones.map(z => ({ id: z.id, floor: z.floor, units: z.units || 1, fx: Object.keys(z.fixtures).map(k => k + ':' + z.fixtures[k]).join(', '), sim: !!z.simultaneous, q_cont_lps: z.q_cont_lps || 0 }));
      st.origin = 'preset';
      M.ui.sync(); M.ui.run();
      const L = M.last;
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { valid: L.valid, q: L.totals.q_design_lps, sizes: Object.fromEntries(L.segments.map(s => [s.id, s.size])), worst_branch: L.worst.branch, margin: L.worst.margin_bar,
               fixture: L.worst.fixture, ok: L.ok, unsized: L.unsized_segments, flags: L.flags, qc: L.totals.q_circuit_lps, verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim(), booster: L.booster.needed, head: L.booster.head_m, steps: L.upsized_steps, static_feasible: L.static_feasible, tileQ: tiles[0] || null, tileSvc: tiles[3] || null };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!read && read.valid;
  const chk = (k, got, exp, ok) => { cmp[k] = { got, exp, ok }; if (!ok) pass = false; };
  if (read) {
    chk('q_design_lps', read.q, e.q_design_lps, Math.abs(read.q - e.q_design_lps) <= 1e-3 * Math.max(1, e.q_design_lps));
    for (const k of Object.keys(e.sizes)) chk('size.' + k, read.sizes[k], e.sizes[k], read.sizes[k] === e.sizes[k]);
    if (!c.anchor) {
    chk('worst_branch', read.worst_branch, e.worst_branch, read.worst_branch === e.worst_branch);
    chk('worst_fixture', read.fixture, e.worst_fixture, read.fixture === e.worst_fixture);
    chk('worst_margin_bar', read.margin, e.worst_margin_bar, Math.abs(read.margin - e.worst_margin_bar) <= 0.005);
    chk('booster', read.booster, e.booster, read.booster === e.booster);
    chk('head_m', read.head, e.head_m, Math.abs(read.head - e.head_m) <= 0.05);
    chk('upsized_steps', read.steps, e.upsized_steps, read.steps === e.upsized_steps);
    chk('static_feasible', read.static_feasible, e.static_feasible, read.static_feasible === e.static_feasible);
    chk('ok', read.ok, e.ok, read.ok === e.ok);
    }
    if (e.q_circuit_lps != null) chk('q_circuit_lps', read.qc, e.q_circuit_lps, Math.abs(read.qc - e.q_circuit_lps) <= 1e-3);
    /* Y2-4: unsized segments carry the hard flag no_size_v:<seg> and the verdict says "Not sized" */
    const expUns = e.unsized || [];
    chk('unsized', read.unsized, expUns, JSON.stringify(read.unsized) === JSON.stringify(expUns) && expUns.every(x => read.flags.includes('no_size_v:' + x)) && (expUns.length > 0) === read.verdict.startsWith('Not sized'));
    /* what the reader sees: the headline tiles carry the design flow and the service pipe */
    chk('screen', [read.tileQ, read.tileSvc], [fmt2(e.q_design_lps), e.sizes.SVC], String(read.tileQ).startsWith(fmt2(e.q_design_lps)) && String(read.tileSvc).startsWith(e.sizes.SVC));
  }
  results.push({ id: c.id, note: c.note, anchor: c.anchor || undefined, inputs: c.input, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbsupply',
  file: 'plbsupply.html',
  reference: 'bench-src/ref/gen_plbsupply.py — independent Python implementation of the published method _plb/sup/METHOD.md',
  reference_citations: [
    'DIN 1988-300:2012-05 Codes of practice for drinking water installations — pipe sizing: design flows and minimum flow pressures, peak-flow constants, velocity limits (as reproduced in trade literature)',
    'EN 806-3:2006 Pipe sizing — simplified method: Table 2 loading units (1 LU = 0.1 l/s), §4.4 velocity 2 m/s, Annex B Figure B.1 ΣLU → QD (read on the licensed copy)',
    'Colebrook C.F. (1939) Turbulent flow in pipes; Kell G.S. (1975) J. Chem. Eng. Data 20 — water density; IAPWS R12-08 (2008) — viscosity',
    '_plb/sup/METHOD.md revision plbsupply-1.3 (tree, sizing and booster rules; apparatus losses stated as learning assumptions); EN 806-3:2006 Annex B Fig. B.1 lines (digitised from the licensed copy) since engine plbsupply-1.4',
    'External anchors (D-PLB-10): hand calculations from the DIN 1988-300 peak-flow formula (hotel and residential constants) and velocity limits (2 m/s service and long-duration flows, 2.5 m/s with Σζ ≥ 2.5) — cases anchor-hotel-din, anchor-flat-din, anchor-showers-2ms, anchor-no-size-v',
    'DIN 1988-300 utilisation units as quoted by SHK Profi 8/2012 "Einführung von Nutzungseinheiten" (example 1: bath 0.15 + basin 0.07 = 0.22 l/s) and the KELOX handbook 2018 "Extract from DIN 1988-300" (exceptions) — secondary sources; case anchor-unit-two-largest'
  ],
  tolerance: 'invalid-input cases: valid false, every expected error code present, no result tiles and the invalid verdict on screen; anchor cases: design flow ±0.1 % and the hand-derived pipe sizes exact; method cases: design flow ±0.1 %; every pipe size, the worst branch and fixture, the booster flag, the OK verdict and the number of upsizing steps exact; unsized segments (flag no_size_v) exact with the “Not sized” verdict on screen; worst pressure reserve ±0.005 bar; booster head ±0.05 m; the headline tiles must show the design flow and the service pipe size',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbsupply: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
