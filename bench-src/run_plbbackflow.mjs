// Benchmark driver for plbbackflow.html (EN 1717 backflow protection selector).
// Reference: bench-src/ref/gen_plbbackflow.py (independent implementation of _plb/bf/METHOD.md) -> ref/plbbackflow_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plbbackflow.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected fluid category, admissible units, every exclusion reason, preferred unit, air-gap size, booster and integrated flags were computed by bench-src/ref/gen_plbbackflow.py, an independent Python implementation written from the published method (_plb/bf/METHOD.md: EN 1717 category chain, protection matrix as reproduced in the Honeywell/Resideo EN 1717 brochure, published exclusion order and preference order), not from the page code. The library of applications is read from the METHOD.md table as input data.' };
const P = benchPaths({ name: 'plbbackflow', page: 'plbbackflow.html', ref: 'plbbackflow_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const xcheck = JSON.parse(fs.readFileSync(P.ref.replace('plbbackflow_ref.json', 'plbbackflow_xcheck.json'), 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plbbackflow, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const sortObj = o => Object.fromEntries(Object.entries(o || {}).sort());
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plbbackflow, st = M.state;
      st.points = cc.points.map(M.cleanRow); st.sel = st.points[0].id;
      M.ui.sync(); M.ui.run();
      const L = M.last;
      if (!L.valid) return { valid: false, errors: L.errors };
      const pts = {};
      L.points.forEach(r => { pts[r.id] = { cat: r.cat, adm: r.admissible.map(a => a.code).sort(), pref: r.preferred, booster: r.booster, gap: r.air_gap_mm == null ? null : r.air_gap_mm,
        integrated: !!r.integrated, excl: Object.fromEntries(r.excluded.map(x => [x.code, x.why])),
        bp_assumed: r.flags.indexOf('bp_assumed') >= 0, gap_insufficient: r.flags.indexOf('air_gap_insufficient') >= 0, errors: r.errors.slice().sort(), n: r.n }; });
      let units = 0; [L.devices, L.integrated].forEach(o => Object.values(o).forEach(v => { units += v; }));
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { valid: true, pts, max_cat: L.max_cat, n: L.points.length, units, counts: L.counts.slice(1), points_total: L.points_total, tiles: tiles.slice(0, 2) };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!(read && read.valid);
  let bad = 0;
  const add = (k, g, x, ok) => { if (!ok) { pass = false; bad++; if (Object.keys(cmp).length < 30) cmp[k] = { got: g, exp: x, ok }; } };
  if (read && read.valid) {
    for (const id of Object.keys(e.points)) {
      const g = read.pts[id], x = e.points[id];
      if (!g) { add(id, null, x, false); continue; }
      for (const k of ['cat', 'pref', 'booster', 'integrated', 'bp_assumed', 'gap_insufficient']) add(id + '.' + k, g[k], x[k], g[k] === x[k]);
      add(id + '.errors', g.errors, x.errors, JSON.stringify(g.errors) === JSON.stringify(x.errors));
      if ('n' in x) add(id + '.n', g.n, x.n, g.n === x.n);
      const an = c.anchor && c.anchor[id];
      if (an) {
        const a = an.check, bad = [];
        if (g.cat !== a.cat) bad.push('cat');
        (a.must || []).forEach(u => { if (!g.adm.includes(u)) bad.push('must ' + u); });
        (a.mustnot || []).forEach(u => { if (g.adm.includes(u)) bad.push('mustnot ' + u); });
        if ('booster' in a && g.booster !== a.booster) bad.push('booster');
        if ('pref' in a && g.pref !== a.pref) bad.push('pref');
        if ('pref_family' in a && !String(g.pref || '').startsWith(a.pref_family)) bad.push('pref_family');
        if ('integrated' in a && g.integrated !== a.integrated) bad.push('integrated');
        add(id + '.anchor', bad, [], bad.length === 0);
      }
      add(id + '.adm', g.adm, x.adm, JSON.stringify(g.adm) === JSON.stringify(x.adm));
      add(id + '.gap', g.gap, x.gap, (g.gap == null && x.gap == null) || (g.gap != null && x.gap != null && Math.abs(g.gap - x.gap) < 1e-9));
      add(id + '.excl', g.excl, x.excl, JSON.stringify(sortObj(g.excl)) === JSON.stringify(sortObj(x.excl)));
    }
    add('max_cat', read.max_cat, e.max_cat, read.max_cat === e.max_cat);
    /* X2-6: number per point (null = invalid, not counted) and the counted units (devices + integrated) */
    if ('units_total' in e) add('units_total', read.units, e.units_total, read.units === e.units_total);
    /* Y4-4: points per category count connection points (sum of n) */
    if ('counts' in e) add('counts', read.counts, e.counts, JSON.stringify(read.counts) === JSON.stringify(e.counts));
    if ('points_total' in e) add('points_total', read.points_total, e.points_total, read.points_total === e.points_total);
    /* what the reader sees: headline tiles show the number of points and the highest category */
    const num = s => Number(String(s).replace(/[^\d]/g, ''));
    const scrN = 'points_total' in e ? e.points_total : e.n_points;
    add('screen', read.tiles, [scrN, e.max_cat], num(read.tiles[0]) === scrN && num(read.tiles[1]) === e.max_cat);
  } else add('valid', read && read.errors, 'valid', false);
  results.push({ id: c.id, note: c.note, points: c.points.length, anchor: c.anchor ? Object.keys(c.anchor).length : undefined, checks_failed: bad, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
const anchorCase = results.find(r => r.anchor), nAnchors = ref.filter(c => c.anchor).reduce((s, c) => s + Object.keys(c.anchor).length, 0);
const anchorsPassed = anchorCase ? nAnchors - Object.keys(anchorCase.cmp).filter(k => k.endsWith('.anchor')).length : 0;
const npts = results.reduce((s, r) => s + r.points, 0);
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plbbackflow',
  file: 'plbbackflow.html',
  reference: 'bench-src/ref/gen_plbbackflow.py — consistency with the published method _plb/bf/METHOD.md (Python, matrix re-typed from METHOD, so the sweeps alone cannot catch a wrong cell) + ' + nAnchors + ' external anchors worked by hand from the Resideo EN 1717 brochure ch. 7 (pp. 37-44) + second-source cross-check of the matrix X cells per category and the library categories against the SYR guide (' + xcheck.passed + '/' + xcheck.total + ')',
  external_anchors: { total: nAnchors, passed: anchorsPassed },
  second_source: { source: xcheck.source, scope: xcheck.scope, total: xcheck.total, passed: xcheck.passed },
  reference_citations: [
    'EN 1717:2000 Protection against pollution of potable water in water installations and general requirements of devices to prevent pollution by backflow (§4 fluid categories, protection matrix)',
    'Honeywell / Resideo EN 1717 brochure: matrix pp. 45–46, installation dimensions p. 34, application examples ch. 7 (external anchors)',
    'SYR (Hans Sasserath GmbH & Co. KG) guide "Drinking water protection in installations", pp. 3–10 (second source: device per category, practical examples)',
    'Belgaqua TVBI/PTI (EN 806-5:2012 Annex A Table A.1 maintenance intervals are not part of this bench; they are covered by the engine test)',
    'WaterRegsUK / WRAS Backflow protection ratings (Jan 2024), FAQs Type AF / Type AG: AF fluid category ≤ 4, AG ≤ 3 (CR-60)',
    '_plb/bf/METHOD.md revision plbbackflow-1.4'
  ],
  tolerance: 'exact on category, admissible set, every exclusion reason, preferred unit, booster, integrated and air-gap-insufficient flags, points per category (sum of n) and their total, number per point (X2-6), counted units and the highest category; air gap to 1e-9 mm; the headline tiles must show the number of points and the highest category',
  total, passed, failed, points: npts,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plbbackflow: ${passed}/${total} passed (${npts} connection points; external anchors ${anchorsPassed}/${nAnchors}; second source ${xcheck.passed}/${xcheck.total})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(r.cmp).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
