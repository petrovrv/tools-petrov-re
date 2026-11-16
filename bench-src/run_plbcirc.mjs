// Benchmark driver for plbcirc.html (DHW circulation & balancing).
// Reference: bench-src/ref/gen_plbcirc.py (independent implementation of _plb/circ/METHOD.md) -> ref/plbcirc_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbcirc.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Consistency with METHOD + 3 external anchors. Expected pump flow, return and minimum temperatures, loop heat loss, pump pressure, annual cost, per-loop flow, return temperature and valve kv, the index loop and the sections below the minimum were computed by bench-src/ref/gen_plbcirc.py, an independent Python implementation written from the published method (_plb/circ/METHOD.md: DVGW W 553 proportional split, exponential pipe cooling with mixing of returns, thermostatic valve balance, Darcy-Weisbach/Colebrook, unbalanced network solved with scipy fsolve), not from the page code, so it checks consistency with METHOD rather than proving the method. Four external anchor cases (A1 single loop with the flow-pipe rule — return 51.44 °C, a hard fail; A1L the same loop sized to 5 K over the whole loop, DVGW W 553 preface / W 551 — 0.0122417 kg/s, return 55.0 °C; A2 W 553 two-riser split; A3 thermostatic loop) carry hand-calculated values typed in from a worked calculation with the standard formulas (EN ISO 12241 cylindrical layer, GEG Anlage 8, DVGW W 553 flow and split, exponential cooling); both the generator and the page are checked against them. Two invalid-input cases (bad_ins_*: insulation class outside none/geg50/geg100/custom, METHOD 8a) check that the engine refuses them with ins:<id> and the page shows no result; ins_missing_default checks that an omitted class means geg100. Pipe series (= plumbing-core MATERIALS) and GEG Anlage 8 thicknesses are input data.' };
const P = benchPaths({ name: 'plbcirc', page: 'plbcirc.html', ref: 'plbcirc_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbcirc, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const REL = 0.005, ABS_T = 0.05;
const rel = (g, e) => Math.abs(g - e) <= REL * Math.max(Math.abs(e), 1e-9);
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbcirc, st = M.state, base = M.presetState('apt24_w553');
      Object.keys(base).forEach(k => { st[k] = base[k]; });
      Object.keys(cc).forEach(k => { if (!['id', 'note', 'expect', 'sections'].includes(k)) st[k] = cc[k]; });
      st.sections = cc.sections.map(s => ({ id: s.id, parent: s.parent == null ? '' : s.parent, Lf: s.Lf, odf: s.odf, Lr: s.Lr, odr: s.odr, ins: s.ins, Ta: s.Ta }));
      const cm = cc.sections.find(s => s.ins === 'custom'); st.ins_mm = cm ? cm.ins_mm : 30;
      st.selLeaf = ''; M.ui.sync(); M.ui.run();
      const L = M.last;
      const tile = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      if (!L.valid) return { valid: false, errors: L.errors, tiles: document.querySelectorAll('.dgu-tile').length, verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim() };
      const leaves = {}; L.rows.filter(r => r.leaf).forEach(r => { leaves[r.id] = { V_lph: r.V_lph, T_r_out: r.T_r_out, kv: r.kv, m_kgs: r.m_kgs, T_f_end: r.T_f_end }; });
      return { valid: true, converged: L.converged, V_total_lph: L.V_total_lph, m_total_kgs: L.m_total_kgs, m_return_min_kgs: L.design.m_return_min_kgs, fails: L.fails, verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim(), QW_design_W: L.design.QW_flow_W, flags: L.flags, T_return: L.T_return, T_min_seen: L.T_min_seen, Q_loss_W: L.Q_loss_W,
        dp_pump_kpa: L.dp_pump_pa / 1000, total_eur: L.annual.total_eur, below_min: L.below_min.slice().sort(), index_leaf: L.index_leaf, leaves, tiles: tile.slice(0, 4) };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!(read && (e.valid === false ? read.valid === false : read.valid && read.converged));
  const add = (k, g, x, ok) => { cmp[k] = { got: g, exp: x, ok }; if (!ok) pass = false; };
  if (e.valid === false) {
    /* r3 X2-3 invalid input: the engine refuses it with the expected codes; the page shows the invalid verdict, the ins note and no tiles */
    add('valid', read && read.valid, false, !!read && read.valid === false);
    add('errors', read && read.errors, e.errors, !!read && Array.isArray(read.errors) && e.errors.every(x => read.errors.includes(x)));
    add('screen', read && [read.tiles, read.verdict], ['0 tiles', 'invalid + ins note'], !!read && read.tiles === 0 && /not valid/.test(read.verdict || '') && e.errors.every(x => (read.verdict || '').includes(x)) && /Insulation must be/.test(read.verdict || ''));
  } else if (read && read.valid) {
    for (const k of ['V_total_lph', 'Q_loss_W', 'dp_pump_kpa', 'total_eur']) add(k, read[k], e[k], rel(read[k], e[k]));
    for (const k of ['T_return', 'T_min_seen']) add(k, read[k], e[k], Math.abs(read[k] - e[k]) <= ABS_T);
    add('below_min', read.below_min, e.below_min, JSON.stringify(read.below_min) === JSON.stringify(e.below_min));
    if (c.method !== 'none') add('index_leaf', read.index_leaf, e.index_leaf, read.index_leaf === e.index_leaf);
    for (const id of Object.keys(e.leaves)) {
      const g = read.leaves[id], x = e.leaves[id];
      add(id + '.V_lph', g && g.V_lph, x.V_lph, !!g && rel(g.V_lph, x.V_lph));
      add(id + '.T_r_out', g && g.T_r_out, x.T_r_out, !!g && Math.abs(g.T_r_out - x.T_r_out) <= ABS_T);
      if (x.kv != null) add(id + '.kv', g && g.kv, x.kv, !!g && g.kv != null && rel(g.kv, x.kv));
    }
    /* external hand anchors (D-PLB-10): page value vs the hand-calculated literal */
    for (const [k, [val, tol]] of Object.entries(c.anchor || {})) {
      const g = k.includes('.') ? (read.leaves[k.split('.')[0]] || {})[k.split('.')[1]] : read[k];
      add('anchor:' + k, g, val, typeof g === 'number' && Math.abs(g - val) <= tol * Math.abs(val));
    }
    /* r4 Y3-1: a return below T_min is a hard fail (engine flag + fails list + 'Not compliant' verdict); the flow for a T_min return is reported */
    const rb = read.flags.includes('return_below_min') && read.fails.includes('return_below_min') && /Not compliant/.test(read.verdict);
    const rn = !read.flags.includes('return_below_min') && !/Not compliant/.test(read.verdict);
    add('return_below_min', [read.flags.includes('return_below_min'), read.fails.includes('return_below_min')], e.return_below_min, e.return_below_min ? rb : rn);
    add('m_return_min_kgs', read.m_return_min_kgs, e.m_return_min_kgs, rel(read.m_return_min_kgs, e.m_return_min_kgs));
    if (c.dT_basis === 'flow' && c.method !== 'thermo') add('flag:flow_basis_approx', read.flags, 'flow_basis_approx', read.flags.includes('flow_basis_approx'));
    if (c.id === 'thermo_cap_vmax') add('flag:setpoint_unreachable', read.flags, 'setpoint_unreachable', read.flags.includes('setpoint_unreachable'));
    if (c.id === 'od_snapped') add('flag:od_snapped', read.flags, 'od_snapped', read.flags.includes('od_snapped'));
    /* what the reader sees: headline tiles show the pump flow (L/h, 0 dp) and the return temperature (°C, 1 dp) */
    const num = s => Number(String(s).replace(/[\s\u202f\u00a0,]/g, ''));
    const tf = num(read.tiles[0]), tr = num(read.tiles[2]);
    add('screen', [read.tiles[0], read.tiles[2]], [Math.round(e.V_total_lph), Math.round(e.T_return * 10) / 10],
      Math.abs(tf - e.V_total_lph) <= Math.max(1, REL * e.V_total_lph) && Math.abs(tr - e.T_return) <= 0.1 + 1e-9);
  } else add('valid', read && read.errors, 'valid', false);
  const { expect, ...inputs } = c;
  results.push({ id: c.id, note: c.note, inputs, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbcirc',
  file: 'plbcirc.html',
  reference: 'bench-src/ref/gen_plbcirc.py — consistency with METHOD (separate Python implementation of _plb/circ/METHOD.md) + 4 external anchors worked by hand',
  external_anchors: ref.filter(c => c.anchor).map(c => c.id),
  reference_citations: [
    'DVGW W 553:1998-12 Bemessung von Zirkulationssystemen in zentralen Trinkwassererwärmungsanlagen (proportional split of flow-pipe losses; Vorwort: cooling ≤ 5 K from the heater outlet to the circulation inlet into the heater, anywhere in the loop)',
    'DIN 1988-300:2012-05 Ermittlung der Rohrdurchmesser (circulation part replacing W 553)',
    'DVGW W 551:2004-04 (60 °C outlet, ≥ 55 °C circulation, interruption ≤ 8 h/day); CEN/TR 16355:2012; Flemish Legionellabesluit 9.2.2007',
    'GEG 2020 Anlage 8 insulation thicknesses; EN ISO 12241:2022 cylindrical insulation layer; Colebrook (1939); EN 1057; EN 10312',
    'External anchors A1, A1L, A2, A3: hand calculations written out in gen_plbcirc.py anchor_cases()',
    '_plb/circ/METHOD.md revision plbcirc-1.3'
  ],
  tolerance: 'invalid-input cases (bad_ins_*): valid false with the expected error codes, invalid verdict with the insulation note and no result tiles; relative 0.5 % on flows, heat loss, pump pressure, annual cost and valve kv; ±0.05 K on temperatures; exact on the return_below_min hard flag (engine flag, fails list, Not compliant verdict) and the flow_basis_approx flag, relative 0.5 % on the flow for a T_min return; exact on the set of sections below the minimum and on the index loop (not defined without valves); the headline tiles must show the pump flow (±0.5 %, ≥ 1 L/h) and the return temperature (±0.1 K)',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbcirc: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
