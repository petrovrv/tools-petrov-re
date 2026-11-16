// Benchmark driver for plbdhw.html.
// Reference: bench-src/ref/gen_plbdhw.py (independent implementation of _plb/dhw/METHOD.md) -> ref/plbdhw_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbdhw.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'r4 rev 2 (plbdhw-1.3, deep review Y3-2/Y3-3/Y3-4): store energy = max over cyclic windows of the net deficit plus the part of the ONE daily design peak inside the window, the peak being the excess of the peak flow above the step mean draw (1.2 meaning; 0 in steps without draw, the full P_inst if the day has no draw) at its worst moment, accumulated in the cyclic depletion, evaluated exactly at every step and draw-event boundary (the reference simulates the periodic day with the peak at every candidate start and a running deficit at every breakpoint; the page uses prefix minimum / suffix maximum / sliding minimum); the largest excess energy of the peak is counted in the daily volume, energy and feasibility; the DVGW 3-litre rule is flagged also in one-/two-family houses. Anchor A2 re-derived by hand (excess 10.467 kW for 10 min inside the draw hour: 12.6785 kWh, 218.03 L, 300 L), 7 hand cases r4_* added (160 L in 10 min against 5 kW: 4.7491 kWh, 81.67 L, 100 L, also across a step boundary; the same with q_peak 0.2667 L/s x 10 min: excess 1.8608 kWh above the step mean, 6.6099 kWh, 113.67 L, 120 L; with t_peak 0: 100 L; peak without profile 3.1401 kWh against 0.1 kW: infeasible, minimum 0.13084 kW; 80 L store: 0.13084 kW; one-family house 500 L / 5 L pipe: small + w551_pipe_3l). Earlier: consistency with METHOD + 7 external anchors + 11 input-rule cases (plbdhw-1.2: X2-4 draw events validated with the event index, X2-5 DVGW W 551 one-/two-family house = small; expected errors and classes from the rule as written in METHOD §4, not from the page). 57 cases: expected values computed by bench-src/ref/gen_plbdhw.py, a Python implementation written from the published method (_plb/dhw/METHOD.md plbdhw-1.3, store energy as above; Ecodesign 814/2013 standing-loss limit; heat-pump/booster series share; fixed point and bisection re-derived), not from the page code; it shares the method with the page, so it checks consistency, not the method itself. 7 anchor cases (id anchor_*): expected values derived by hand arithmetic in the generator from the energy balance (EN 12831-3 cumulative demand/supply principle), the Ecodesign 814/2013 Annex II formula and the DVGW W 551 400 L / 3 L definition, independent of the model code; the generator also checks its own model against them. The hourly profile shapes are input data dumped from plb-dhw.js into ref/plbdhw_shapes.json.' };
const P = benchPaths({ name: 'plbdhw', page: 'plbdhw.html', ref: 'plbdhw_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const REL = 1e-6;

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbdhw, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const NUM = ['daily_volume_l', 'daily_energy_kwh', 'p_inst_kw', 't_store_eff_c', 'hp_share', 'hours_available', 'p_eff_kw', 'p_main_kw', 'store_loss_w', 'p_min_kw', 'e_store_kwh', 'peak_volume_l', 'peak_energy_kwh',
  'v_store_l', 'v_nominal_l', 'loss_kw', 'loss_share', 'booster_kwh_day', 'reheat_h', 'mixed_capacity_l'];
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbdhw, st = M.state, D = window.PLBDhw.DEFAULTS;
      Object.keys(st).forEach(k => { delete st[k]; });
      Object.assign(st, JSON.parse(JSON.stringify(D)), JSON.parse(JSON.stringify(cc.state)));
      M.ui.sync(); M.ui.run();
      const L = M.last, o = {};
      Object.keys(L).forEach(k => { const v = L[k]; if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' || v === null) o[k] = (typeof v === 'number' && !isFinite(v)) ? null : v; });
      o.errors = L.errors.slice().sort();
      o.flags = L.flags.filter(f => f === 'hp_cannot_reach' || f === 'legionella_below_60' || f === 'w551_pipe_3l').sort();
      const tile = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      o.tile0 = tile[0] || null;
      return o;
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!read;
  for (const k of Object.keys(e)) {
    const exp = e[k], got = read ? read[k] : undefined;
    let ok;
    if (k === 'flags' || k === 'errors') ok = !!read && JSON.stringify(got) === JSON.stringify(exp);
    else if (typeof exp === 'number' && NUM.includes(k)) ok = typeof got === 'number' && Math.abs(got - exp) <= REL * Math.max(1, Math.abs(exp));
    else ok = got === exp;
    cmp[k] = { got: got === undefined ? null : got, exp, ok };
    if (!ok) pass = false;
  }
  /* what the reader sees: the first headline tile is the nominal store (power mode) or the required power (volume mode) */
  if (e.feasible && (c.state.mode === 'volume' ? typeof e.p_main_kw === 'number' : typeof e.v_nominal_l === 'number')) {
    /* the framework groups thousands with a thin space in tiles; compare the number the reader sees */
    const want = c.state.mode === 'volume' ? Math.round(e.p_main_kw * 10) / 10 : Math.round(e.v_nominal_l);
    const seen = read && read.tile0 != null ? Number(String(read.tile0).replace(/[\s\u00a0\u202f\u2009,]/g, '')) : NaN;
    const ok = seen === want;
    cmp.screen = { got: read ? read.tile0 : null, exp: want, ok };
    if (!ok) pass = false;
  }
  results.push({ id: c.id, note: c.note, inputs: c.state, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbdhw',
  file: 'plbdhw.html',
  reference: 'bench-src/ref/gen_plbdhw.py — Python implementation of the published method _plb/dhw/METHOD.md (consistency) + 7 hand-computed external anchors + 11 input-rule cases + 7 hand-computed r4 cases (Y3-2/Y3-3/Y3-4)',
  reference_citations: [
    'EN 12831-3:2017 Energy performance of buildings — design heat load — Part 3: domestic hot water systems heat load and characterisation of needs (cumulative demand/supply curves)',
    'CIBSE Guide G (2014) Public health and plumbing engineering — hot water storage and recovery',
    'Commission Regulation (EU) No 814/2013, Annex II (standing-loss limit S = 16.66 + 8.33·V^0.4 W)',
    'Thomas & Burden (1963) sequent-peak algorithm for storage sizing',
    'DVGW W 551 (2004) Trinkwassererwärmungs- und Trinkwasserleitungsanlagen — large installation: store > 400 L or > 3 L in a pipe run; DVGW consumer information (Heizungsraum): the 3-litre rule applies to all installations, also one- and two-family houses',
    '_plb/dhw/METHOD.md revision plbdhw-1.3 (profile shapes and litres per user stated as learning assumptions)'
  ],
  tolerance: 'relative 1e-6 on every numeric output (volume, powers, energies, losses, shares, reheat time, mixed-water capacity); exact on feasibility, governing criterion (none/day/peak/combined), nominal size, DVGW W 551 class (and its one-/two-family reason), validity and the sorted error codes of invalid inputs, and the legionella/heat-pump/3-litre flags; the first headline tile must show the nominal store volume (power mode) or the required heater power to 0.1 kW (volume mode)',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbdhw: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
