// Benchmark driver for plbdrainage.html (Drainage & Venting, EN 12056-2).
// Reference: bench-src/ref/gen_plbdrainage.py (independent implementation of _plb/drain/METHOD.md) -> ref/plbdrainage_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbdrainage.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'The Table 4/5/7/8 values and footnote readings used by both the engine and the ref were checked against the licensed EN 12056-2:2000 text by an independent reviewer (bw-r1), not by the ref itself. Expected ΣDU, Qww/Qtot, the chosen DN of every branch, stack and drain, the drain capacity at the filling limit, filling degree h/d and velocity, vent DN, AAV air flow of stacks and branches and the set of rule flags were computed by bench-src/ref/gen_plbdrainage.py, an independent Python implementation written from the published method (_plb/drain/METHOD.md: Qww = K·√ΣDU floored at the largest DU, EN 12056-2 Tables 1, 4–7, 11, 12, Prandtl–Colebrook for partly filled drains with the hydraulic diameter solved by scipy brentq; AAV air flow per EN 12056-2 §6.4.3 Table 10 and §6.5.3), not from the page code. Discharge units (EN 12056-2 Table 2) and pipe series are input data from the published method.' };
const P = benchPaths({ name: 'plbdrainage', page: 'plbdrainage.html', ref: 'plbdrainage_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbdrainage, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const REL = 0.005, ABS_HD = 0.002;
const rel = (g, e, t = REL) => (g == null && e == null) || (g != null && e != null && Math.abs(g - e) <= t * Math.max(Math.abs(e), 1e-9));
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbdrainage;
      const inp = {}; Object.keys(cc).forEach(k => { if (!['id', 'note', 'expect', 'anchor'].includes(k)) inp[k] = cc[k]; });
      M.loadEngine(inp);
      const L = M.last;
      const tile = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      if (!L.valid) return { valid: false, errors: L.errors };
      const rows = {}; L.rows.forEach(r => { rows[r.id] = { kind: r.kind, dn: r.dn, q_tot: r.q_tot, sum_du: r.sum_du, hd: r.hd, v: r.v, q_max: r.q_max, vent_dn: r.vent_dn, aav_air_lps: r.aav_air_lps, od_mm: r.od_mm }; });
      return { valid: true, sum_du: L.totals.sum_du, q_tot: L.totals.q_tot, flags: L.flags.slice().sort(), rows, tiles: tile.slice(0, 4) };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = e.valid === false ? !!(read && read.valid === false) : !!(read && read.valid);
  const add = (k, g, x, ok) => { cmp[k] = { got: g, exp: x, ok }; if (!ok) pass = false; };
  if (e.valid === false) { /* plb-r3 X3-2/X3-3: invalid input must be rejected with exactly the expected error codes */
    const g = read && Array.isArray(read.errors) ? read.errors.slice().sort() : null, x = e.errors.slice().sort();
    add('valid', read && read.valid, false, !!read && read.valid === false);
    add('errors', g, x, JSON.stringify(g) === JSON.stringify(x));
  } else if (read && read.valid) {
    add('sum_du', read.sum_du, e.sum_du, rel(read.sum_du, e.sum_du, 1e-9));
    add('q_tot', read.q_tot, e.q_tot, rel(read.q_tot, e.q_tot));
    add('flags', read.flags, e.flags, JSON.stringify(read.flags) === JSON.stringify(e.flags));
    for (const id of Object.keys(e.rows)) {
      const g = read.rows[id], x = e.rows[id];
      add(id + '.dn', g && g.dn, x.dn, !!g && g.dn === x.dn);
      add(id + '.q_tot', g && g.q_tot, x.q_tot, !!g && rel(g.q_tot, x.q_tot));
      if ('hd' in x) add(id + '.hd', g && g.hd, x.hd, !!g && (x.hd == null ? g.hd == null : g.hd != null && Math.abs(g.hd - x.hd) <= ABS_HD));
      if ('v' in x) add(id + '.v', g && g.v, x.v, !!g && rel(g.v, x.v));
      if ('q_max' in x && g && g.kind === 'drain') add(id + '.q_max', g.q_max, x.q_max, rel(g.q_max, x.q_max));
      if ('vent_dn' in x) add(id + '.vent_dn', g && g.vent_dn, x.vent_dn, !!g && g.vent_dn === x.vent_dn);
      if ('aav_air_lps' in x) add(id + '.aav', g && g.aav_air_lps, x.aav_air_lps, !!g && rel(g.aav_air_lps, x.aav_air_lps));
      if ('od_mm' in x) add(id + '.od_mm', g && g.od_mm, x.od_mm, !!g && g.od_mm === x.od_mm);
    }
    /* what the reader sees: tiles 1-2 show ΣDU (1 dp) and Qtot (2 dp) */
    const num = s => Number(String(s).replace(/[\s\u202f\u00a0,]/g, m => (m === ',' ? '' : '')));
    const tdu = num(read.tiles[0]), tq = num(read.tiles[1]);
    add('screen', [read.tiles[0], read.tiles[1]], [Math.round(e.sum_du * 10) / 10, Math.round(e.q_tot * 100) / 100],
      Math.abs(tdu - e.sum_du) <= 0.05 + 1e-9 && Math.abs(tq - e.q_tot) <= 0.005 + 1e-9);
  } else add('valid', read && read.errors, 'valid', false);
  const { expect, ...inputs } = c;
  results.push({ id: c.id, note: c.note, anchor: !!c.anchor, inputs, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbdrainage',
  file: 'plbdrainage.html',
  reference: 'bench-src/ref/gen_plbdrainage.py — consistency with an independent Python implementation of the published method _plb/drain/METHOD.md + ' + ref.filter(c => c.anchor).length + ' external anchors (cases anchor_*): worked by hand from EN 12056-2:2000 (eq. (1) and its largest-DU floor, Tables 4, 6, 11, 12, Annex B full pipe at h/d 0.5) and AAV air flow (EN 12056-2 §6.5.3 stack 8·Qtot: Durgo worked example; §6.4.3 Table 10 branch 1·Qtot systems I/IV, 2·Qtot systems II/III: hand cases); ' + ref.filter(c => c.expect && c.expect.valid === false).length + ' invalid-input cases (METHOD §1 input rules: unknown or inherited fixture key, negative length/drop/bends/gradient, fractional bends) must be rejected with exactly the expected error codes',
  external_anchors: { total: ref.filter(c => c.anchor).length, passed: results.filter(r => r.anchor && r.pass).length },
  reference_citations: [
    'EN 12056-2:2000 Gravity drainage systems inside buildings — Part 2: Sanitary pipework, layout and calculation (Tables 1–7, 11, 12; §6.4.3 Table 10 and §6.5.3 air admittance valves; Annex B, Prandtl–Colebrook, kb = 1.0 mm)',
    'EN 12380:2002 Air admittance valves for drainage systems',
    'DIN 1986-100:2016-12 Entwässerungsanlagen für Gebäude und Grundstücke (gradient ≥ 0.5 %, filling 0.5 / 0.7)',
    'EN 1329-1, EN 1451-1, EN 1519-1, EN 877 drainage pipe series (via plumbing-core.js)',
    'Secondary for AAVs: stack worked example (8·Qtot) and the open-vent rule: Durgo, Dimensioning in accordance with EN 12056 (https://inspectapedia.com/plumbing/Durgo-Air-Admittance-Valve-Instructions.pdf); McAlpine AAV brochure (https://www.mytub.co.uk/product_images/McAlpine_AirAdmittanceValve_Brochure.pdf)',
    '_plb/drain/METHOD.md revision plbdrainage-1.5'
  ],
  tolerance: 'exact on every chosen DN, pipe outer diameter, vent DN and on the set of rule flags; ΣDU exact; relative 0.5 % on flows, drain capacity, velocity and AAV air flow; ±0.002 on the filling degree h/d; the headline tiles must show ΣDU (±0.05) and Qtot (±0.005 l/s)',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbdrainage: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
