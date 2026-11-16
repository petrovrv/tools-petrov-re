// Benchmark driver for plbbooster.html (booster set sizing).
// Reference: bench-src/ref/gen_plbbooster.py (independent implementation of _plb/boost/METHOD.md) -> ref/plbbooster_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbbooster.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected booster need, floors on the mains, set pressure, boost and head, design flow of the boosted part, membrane vessel, break tank, starts per hour, annual energy, floors needing a pressure reducing valve, pressure zones and warning flags were computed by bench-src/ref/gen_plbbooster.py, an independent Python implementation written from the published method (_plb/boost/METHOD.md: EN 806-2 / DIN 1988-500 pressure balance in SI units, DIN 1988-300 peak flow, vessel found by bisection on the isothermal gas law, zones built by walking the floors top-down), not from the page code. DIN 1988-300 constants are input data from the published method. Consistency with METHOD + 8 external anchors worked by hand from the formulas of the standards (EN 806-2 / DIN 1988-500 pressure balance, also with a suction-line loss, Boyle-Mariotte vessel, DIN 1988-300 peak-flow formula incl. the utilisation-unit rule and the SHK Profi worked example 0.25 l/s, the 0.2-500 l/s curve range, DIN 1988-200 5 bar static limit with the mains night pressure, D-PLB-13); the generator refuses to write the reference unless its model reproduces the anchors. No published manufacturer worked example was available to the author.' };
const P = benchPaths({ name: 'plbbooster', page: 'plbbooster.html', ref: 'plbbooster_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbbooster, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const REL = 0.001;
const rel = (g, e) => (e == null ? g == null : (g != null && Math.abs(g - e) <= REL * Math.max(Math.abs(e), 1e-9)));
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbbooster, st = M.state, base = M.presetState(cc.preset);
      Object.keys(base).forEach(k => { st[k] = base[k]; });
      Object.keys(cc).forEach(k => { if (!['id', 'note', 'expect', 'preset', 'peak', 'two_largest_lps'].includes(k)) st[k] = cc[k]; });
      if ('two_largest_lps' in cc) st.tl = cc.two_largest_lps == null ? 0 : cc.two_largest_lps;
      if ('peak' in cc) {
        if (cc.peak) { st.q_mode = 'din'; st.bt = cc.peak.bt || st.bt; st.sumQa = cc.peak.sumQa; st.qmax = cc.peak.maxSingle || 0; }
        else st.q_mode = 'input';
      }
      M.ui.sync(); M.ui.run();
      const L = M.last;
      if (!L.valid) return { valid: false, errors: L.errors };
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { valid: true, booster_needed: L.booster_needed, n_direct: L.n_direct, p_set: L.p_set, dp_boost: L.dp_boost, head_m: L.head_m, q_boost: L.q_boost,
        vessel_l: L.vessel ? L.vessel.V_req_l : null, starts_h: L.vessel ? L.vessel.starts_h : null, tank_l: L.tank ? L.tank.V_l : null, kwh: L.energy.kwh,
        stat_max: Math.max.apply(null, L.rows.map(r => r.p_static)), prv_floors: L.prv_floors.slice(), zones: L.zones.map(z => [z.top, z.bottom]), flags: L.flags.slice().sort(), tiles: tiles.slice(0, 3),
        verdict: (document.querySelector('.dgu-verdict') || {}).textContent || '' };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = e.valid === false ? !!read : !!(read && read.valid);
  const add = (k, g, x, ok) => { cmp[k] = { got: g, exp: x, ok }; if (!ok) pass = false; };
  if (e.valid === false) {
    add('refused', read && read.errors, e.errors, !!read && read.valid === false && JSON.stringify(read.errors) === JSON.stringify(e.errors));
  } else if (read && read.valid) {
    add('booster_needed', read.booster_needed, e.booster_needed, read.booster_needed === e.booster_needed);
    add('n_direct', read.n_direct, e.n_direct, read.n_direct === e.n_direct);
    for (const k of ['stat_max', 'p_set', 'head_m', 'q_boost', 'vessel_l', 'tank_l', 'starts_h']) add(k, read[k], e[k], rel(read[k], e[k]));
    for (const k of ['dp_boost', 'kwh']) add(k, read[k], e[k], e[k] === 0 ? Math.abs(read[k]) < 1e-12 : rel(read[k], e[k]));
    for (const k of ['prv_floors', 'zones', 'flags']) add(k, read[k], e[k], JSON.stringify(read[k]) === JSON.stringify(e[k]));
    /* what the reader sees: the first tile shows the set pressure (2 dp, bar) when a booster is needed */
    if (e.booster_needed) {
      const num = s => Number(String(s).replace(/[\s\u202f\u00a0,]/g, ''));
      add('screen', read.tiles[0], Math.round(e.p_set * 100) / 100, Math.abs(num(read.tiles[0]) - e.p_set) <= 0.005 + 1e-9);
    } else add('screen', read.verdict.slice(0, 40), 'No booster needed', read.verdict.startsWith('No booster needed'));
  } else add('valid', read && read.errors, 'valid', false);
  const { expect, ...inputs } = c;
  results.push({ id: c.id, note: c.note, inputs, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbbooster',
  file: 'plbbooster.html',
  reference: 'bench-src/ref/gen_plbbooster.py — independent Python implementation of the published method _plb/boost/METHOD.md',
  reference_citations: [
    'EN 806-2:2005 Specifications for installations inside buildings conveying water for human consumption — Part 2: Design',
    'DIN 1988-500:2021-05 Druckerhöhungsanlagen mit drehzahlgesteuerten Pumpen (replaces 2011-02); EN 806-2:2005 §15 for fixed-speed sets; DIN 1988-200:2012-05 (5 bar static limit); DIN 1988-300:2012-05 (peak flow)',
    'KELOX technical handbook 2018 and SHK Profi 8/2012 on DIN 1988-300: curve range 0.2–500 l/s; utilisation unit = sum of the two largest draw-offs (worked example 0.25 / 0.29 l/s)',
    'EN 1717:2000 (air gap AB for break tanks); VDI 6023 (stagnation)',
    'Tanaka M. et al. (2001) Metrologia 38, 301–309 (water density); isothermal gas law for membrane vessels',
    'External anchors (D-PLB-10): hand calculations in bench-src/ref/gen_plbbooster.py ANCHORS (cases anchor_*)',
    '_plb/boost/METHOD.md revision plbbooster-1.3'
  ],
  tolerance: 'relative 0.1 % on the highest static pressure, set pressure, boost, head, design flow, vessel, break tank, starts per hour and energy; exact on booster need, floors on the mains, PRV floors, pressure zones and warning flags; the first tile must show the set pressure (±0.005 bar) or the verdict must say that no booster is needed; refused inputs must be refused with the same error key',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbbooster: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
