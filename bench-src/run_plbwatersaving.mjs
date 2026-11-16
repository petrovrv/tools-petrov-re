// Benchmark driver for plbwatersaving.html (water saving & fixture efficiency).
// Reference: bench-src/ref/gen_plbwatersaving.py (independent implementation of _plb/save/METHOD.md) -> ref/plbwatersaving_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbwatersaving.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected annual volumes before/after, mains water after greywater, litres per person and day, hot-water energy and CO2 saved, money saved, investment, simple payback per measure and in total, the payback ranking, greywater used and the hand-off flows were computed by bench-src/ref/gen_plbwatersaving.py, an independent Python implementation written from the published method (_plb/save/METHOD.md: persons x uses x days x litres per use, EU Ecolabel dual-flush mean, fill + flow x duration, uses shared between the rows of a class by count, the fixture inventory converted to one row per existing product with its own count, timed urinal cisterns 10 l/h single bowl or 7.5 l/h per bowl x 8760 h, hot share x 1.163 kWh/(m3 K) x dT / efficiency, simple payback only for a positive saving, greywater min(yield, flushing demand)), not from the page code; plus 14 external anchors worked by hand from Commission Decision 2013/641/EU (volumes and criterion 1 conformity), UK WSR 1999 Sch. 2 para 25, the heat capacity of water, one hand-worked office case and the hand-worked mixed-inventory cases of review Y6-2 (bench-src/ref/plbwatersaving_anchors.json). The product catalogue and the default uses are input data of the published method.' };
const P = benchPaths({ name: 'plbwatersaving', page: 'plbwatersaving.html', ref: 'plbwatersaving_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const anchors = JSON.parse(fs.readFileSync(P.ref.replace('plbwatersaving_ref.json', 'plbwatersaving_anchors.json'), 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbwatersaving, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const REL = 1e-4;
const rel = (g, e) => (g == null && e == null) || (g != null && e != null && Math.abs(g - e) <= REL * Math.max(Math.abs(e), 1));
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbwatersaving, st = M.state;
      Object.keys(cc).forEach(k => { if (!['id', 'note', 'expect', 'lines', 'fixtures'].includes(k)) st[k] = cc[k]; });
      M.setLastBt(cc.building_type);
      st.lines = cc.lines.map(l => ({ cls: l.cls, count: l.count, base: l.base, eff: l.eff, uses: l.uses, hot_share: l.hot_share,
        dur_s: l.dur_s == null ? null : l.dur_s, fill_l: l.fill_l == null ? null : l.fill_l, capex: l.capex, opex: l.opex }));
      M.ui.sync(); M.ui.run();
      const L = M.last;
      const conv = cc.fixtures && window.PLBSave ? window.PLBSave.linesFromFixtures(cc.fixtures, cc.building_type).lines.map(l => ({ cls: l.cls, count: l.count, base: l.base, eff: l.eff, uses: l.uses })) : null;
      if (!L.valid) return { valid: false, errors: L.errors };
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { valid: true, t: L.totals, gw: L.greywater.used_m3, order: L.order, rows: L.rows.map(r => ({ saved_m3: r.saved_m3, saved_eur: r.saved_eur, payback_y: r.change || r.payback_y != null ? r.payback_y : null })), tiles: tiles.slice(0, 4), conv };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!(read && read.valid);
  const add = (k, g, x, ok) => { cmp[k] = { got: g, exp: x, ok }; if (!ok) pass = false; };
  if (read && read.valid) {
    for (const k of ['base_m3', 'eff_m3', 'mains_m3', 'saved_m3', 'mains_lpd', 'saved_kwh', 'saved_co2', 'saved_eur', 'capex', 'payback_y', 'flush_l_day', 'hot_l_day']) add(k, read.t[k], e[k], rel(read.t[k], e[k]));
    if (e.lines_from_fixtures) add('lines_from_fixtures', read.conv, e.lines_from_fixtures, JSON.stringify(read.conv) === JSON.stringify(e.lines_from_fixtures));
    add('gw_used_m3', read.gw, e.gw_used_m3, rel(read.gw, e.gw_used_m3));
    add('order', read.order, e.order, JSON.stringify(read.order) === JSON.stringify(e.order));
    e.rows.forEach((x, i) => {
      const g = read.rows[i] || {};
      add(i + '.' + x.cls + '.saved_m3', g.saved_m3, x.saved_m3, rel(g.saved_m3, x.saved_m3));
      add(i + '.' + x.cls + '.saved_eur', g.saved_eur, x.saved_eur, rel(g.saved_eur, x.saved_eur));
      add(i + '.' + x.cls + '.payback_y', g.payback_y, x.payback_y, rel(g.payback_y, x.payback_y));
    });
    /* what the reader sees: the headline tiles show water saved (m³/a, 0 dp) and the money saved (EUR/a, 0 dp) */
    const num = s => Number(String(s).replace(/[\s\u202f\u00a0,]/g, ''));
    const tm = num(read.tiles[0]), te = num(read.tiles[2]);
    add('screen', [read.tiles[0], read.tiles[2]], [Math.round(e.saved_m3), Math.round(e.saved_eur)], Math.abs(tm - e.saved_m3) <= 0.5 + 1e-9 && Math.abs(te - e.saved_eur) <= 0.5 + 1e-9);
  } else add('valid', read && read.errors, 'valid', false);
  const { expect, ...inputs } = c;
  results.push({ id: c.id, note: c.note, inputs, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbwatersaving',
  file: 'plbwatersaving.html',
  reference: 'bench-src/ref/gen_plbwatersaving.py — independent Python implementation of the published method _plb/save/METHOD.md',
  reference_citations: [
    'Commission Decision 2013/641/EU — EU Ecolabel flushing toilets and urinals (criterion 1: average flush volume = one full + three reduced flushes ≤ 3.5 l, full ≤ 4.0 l exempt)',
    'Commission Decision 2013/250/EU — EU Ecolabel sanitary tapware (flow classes of taps and showerheads)',
    'Water Supply (Water Fittings) Regulations 1999, Schedule 2 para. 25 — automatic urinal cisterns ≤ 10 l/h for a single bowl, ≤ 7.5 l/h per bowl',
    'IPCC 2006 Guidelines Vol. 2 Table 2.2 — natural gas 56 100 kg CO2/TJ (0.202 kg/kWh)',
    '_plb/save/METHOD.md revision plbsaving-1.2'
  ],
  tolerance: 'relative 1e-4 on every volume, energy, CO2, money, investment and payback value (per measure and total); exact on the payback ranking and on "never pays back" (null); the headline tiles must show the water saved and the money saved to the nearest unit',
  total, passed, failed,
  validation_scope: 'consistency with METHOD (plbsaving-1.2) + ' + anchors.length + ' external anchors',
  external_anchors: { passed: anchors.filter(a => a.ok).length, total: anchors.length, items: anchors },
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbwatersaving: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
