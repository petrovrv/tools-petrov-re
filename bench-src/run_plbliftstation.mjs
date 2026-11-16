// Benchmark driver for plbliftstation.html (wastewater lifting station, EN 12056-4).
// Reference: bench-src/ref/gen_plbliftstation.py (independent implementation of _plb/lift/METHOD.md) -> ref/plbliftstation_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbliftstation.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected inflow, rising-main size, required pump flow and head, duty point, sump useful volume, worst-case starts, input power and rule flags were computed by bench-src/ref/gen_plbliftstation.py, an independent Python implementation written from the published method (_plb/lift/METHOD.md: EN 12056-2 Qww = K·√ΣDU, EN 12056-4 velocity 0.7–2.3 m/s and minimum DN, Darcy–Weisbach with Colebrook solved by scipy brentq, pump parabola intersection by brentq, V = Qp·Tc/4, EN 12056-4:2000 §6.3 T·Qp (Table 5), V > rising-main volume and V ≥ 20 l, §5.1 surface water not mixed with domestic wastewater), not from the page code. Pipe series dimensions are input data from EN 12201-2, EN ISO 1452-2 and EN 10255. Consistency with METHOD + 10 external anchors worked by hand from the cited formulas (EN 12056-2 Qww = K·√ΣDU and the largest-DU floor, EN 12056-4 0.7 m/s on PE d90, sump V = Qp·Tc/4, Darcy–Weisbach with the Swamee–Jain friction factor, closed-form duty point on a fittings-dominated main, DIN 1986-100 ramp rain at r(5,100) 600 l/(s·ha) as a separate surface-water plant, EN 12056-4 §5.1 mixed streams, §6.3 20 l minimum and volume greater than the rising main); the generator refuses to write the reference unless its model reproduces the anchors. No published manufacturer sizing example was available to the author, so none is claimed.' };
const P = benchPaths({ name: 'plbliftstation', page: 'plbliftstation.html', ref: 'plbliftstation_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbliftstation, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const REL = 0.005;
const rel = (g, e) => Math.abs(g - e) <= REL * Math.max(Math.abs(e), 1e-9) || Math.abs(g - e) < 1e-9;
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbliftstation, st = M.state, base = M.presetState('house_basement'), D = window.PLBLift.DEFAULTS;
      Object.keys(D).forEach(k => { st[k] = D[k]; });
      Object.keys(cc.inputs).forEach(k => { st[k] = cc.inputs[k]; });
      st.chart = base.chart; M.ui.sync(); M.ui.run();
      const L = M.last;
      if (!L.valid) return { valid: false, errors: L.errors };
      const tile = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { valid: true, q_in: L.q_in, od: L.pipe.od, q_req: L.q_req, H_req: L.H_req, q_p: L.q_p, H_p: L.H_p, V_req_l: L.V_req_l, z_worst_pump: L.z_worst_pump,
        P1_W: L.P1_W, q_dw: L.q_dw, q_sw: L.q_sw, V_req_strict: L.V_req_strict, flags: L.flags.slice().sort(), tiles: tile.slice(0, 6) };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!(read && read.valid);
  const add = (k, g, x, ok) => { cmp[k] = { got: g, exp: x, ok }; if (!ok) pass = false; };
  if (read && read.valid) {
    for (const k of ['q_in', 'q_req', 'H_req', 'q_p', 'H_p', 'V_req_l', 'z_worst_pump', 'P1_W']) add(k, read[k], e[k], rel(read[k], e[k]));
    for (const k of ['q_dw', 'q_sw']) add(k, read[k], e[k], rel(read[k], e[k]));
    add('V_req_strict', read.V_req_strict, e.V_req_strict, read.V_req_strict === e.V_req_strict);
    add('od', read.od, e.od, read.od === e.od);
    add('flags', read.flags, e.flags, JSON.stringify(read.flags) === JSON.stringify(e.flags));
    /* what the reader sees: headline tiles inflow (l/s, 2 dp), pump flow (l/s, 2 dp), head (m, 2 dp), useful volume (l, 0 dp) */
    const num = s => Number(String(s).replace(/[\s\u202f\u00a0,]/g, ''));
    const tq = num(read.tiles[1]), th = num(read.tiles[2]), tv = num(read.tiles[5]);
    add('screen', [read.tiles[1], read.tiles[2], read.tiles[5]], [+e.q_p.toFixed(2), +e.H_p.toFixed(2), Math.round(e.V_req_l)],
      Math.abs(tq - e.q_p) <= 0.005 + 1e-9 && Math.abs(th - e.H_p) <= 0.005 + 1e-9 && Math.abs(tv - e.V_req_l) <= Math.max(0.5, REL * e.V_req_l));
  } else add('valid', read && read.errors, 'valid', false);
  results.push({ id: c.id, note: c.note, inputs: c.inputs, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
const anchors = results.filter(r => r.id.startsWith('anchor_')), anchorsPassed = anchors.filter(r => r.pass).length;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbliftstation',
  file: 'plbliftstation.html',
  reference: 'bench-src/ref/gen_plbliftstation.py — independent Python implementation of the published method _plb/lift/METHOD.md',
  reference_citations: [
    'EN 12056-4:2000 Gravity drainage systems inside buildings — Wastewater lifting plants — Layout and calculation (0.7–2.3 m/s, minimum DN 80 faecal / DN 32, backflow loop, duplex; §5.1 separate surface-water plant; §6.3 V = T·Qp, V > discharge-pipe volume, V ≥ 20 l)',
    'EN 12056-2:2000 Sanitary pipework — Qww = K·√ΣDU, at least the largest DU',
    'EN 12050-1/-2/-3:2001 Wastewater lifting plants for buildings and sites',
    'Pump sump volume V = Qp·Tc/4 (on/off pump, worst cycle at inflow Qp/2); Colebrook (1939); EN 12201-2; EN ISO 1452-2; EN 10255',
    '_plb/lift/METHOD.md revision plblift-1.2',
    'External anchors (D-PLB-10): hand calculations in bench-src/ref/gen_plbliftstation.py ANCHORS (cases anchor_*)'
  ],
  tolerance: 'relative 0.5 % on inflow, the two streams (domestic wastewater, surface water), required flow and head, duty flow and head, useful volume, worst-case starts and input power; exact on the selected rising-main size, the open limit V > rising main (V_req_strict) and the set of rule flags; the headline tiles must show the pump flow and head (±0.005, 2 dp) and the useful volume (±0.5 %, ≥ 0.5 l)',
  total, passed, failed,
  external_anchors: { total: anchors.length, passed: anchorsPassed },
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbliftstation: ${passed}/${total} passed, external anchors ${anchorsPassed}/${anchors.length}`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
