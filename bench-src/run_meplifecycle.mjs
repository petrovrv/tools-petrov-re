// Benchmark driver for meplifecycle.html.
// Reference: bench-src/ref/gen_meplifecycle.py (independent implementation of _mep/life/METHOD.md) -> ref/meplifecycle_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8794 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_meplifecycle.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected renewal years, governing drivers, effective ages, ranges, capped schedules, deferrals, added risk, yearly need/capped/backlog profiles, the backlog wall and bundle decisions were computed by bench-src/ref/gen_meplifecycle.py, an independent Python implementation written from the published method (_mep/life/METHOD.md: effective age from condition evidence, trigger by criticality class, Regulation (EU) 2024/573 Art. 13 / Annex VI and Regulation (EC) 1005/2009 refrigerant drivers, greedy budget-cap smoothing with Weibull wear-out risk), not from the page code. Class-library typical values are input data dumped from mep-core.js into ref/meplifecycle_classes.json; criticality classes are given per case through the register (modules.mepcriticality.results).' };
const P = benchPaths({ name: 'meplifecycle', page: 'meplifecycle.html', ref: 'meplifecycle_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__meplifecycle, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const REL = 1e-9;
const near = (a, b) => (a === null || b === null) ? a === b : Math.abs(a - b) <= REL * Math.max(1, Math.abs(b));
const results = [];
for (const c of ref) {
  let got = null;
  try {
    got = await p.evaluate(cc => {
      const M = window.__meplifecycle, st = M.state;
      const results = {}; Object.keys(cc.crit).forEach(id => { results[id] = { class: cc.crit[id] }; });
      const ms = Object.assign({ budget_cap_eur_y: null, carry_over: false, defer_class_A: false, bundle_window_y: 3, bundle_saving_pct: 10, trigger_A: 0.9, trigger_B: 1.0, trigger_C: 1.15, scarcity_high: 2030, scarcity_mid: 2035 }, cc.opts, { used_crit: '2026-11-05T00:00:00Z' });   /* the case classes come in as Used register results (D-MEP-13) */
      st.doc = { schema: 'tools.petrov.re/mep-maintenance/v1', revision: 1, site: { name: 'bench', currency: 'EUR', labour_rate_eur_h: 75, year: cc.year },
        assets: JSON.parse(JSON.stringify(cc.assets)), modules: { mepcriticality: { results }, meplifecycle: { state: ms } } };
      st.sel = 0; st.origin = 'preset';
      M.ui.sync(); M.ui.run();
      const L = M.last;
      const tile = (Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim()))[0] || null;
      return { assets: Object.fromEntries(L.assets.map(r => [r.id, { renewal_year: r.renewal_year, due_year: r.due_year, governing: r.governing.code, range: r.range, eff_age: r.eff_age, grade_used: r.grade_used,
                 cycle_y: r.cycle_y, scheduled_year: r.scheduled_year, deferred_years: r.deferred_years, added_risk_eur: r.added_risk_eur || 0, unbooked: r.unbooked }])),
               survey_needed: L.summary.survey_needed, cost_unknown: L.summary.cost_unknown,
               need: L.years.map(y => y.unconstrained), capped: L.years.map(y => y.capped), backlog: L.years.map(y => y.backlog_eur),
               total_need: L.summary.total_unconstrained_eur, total_capped: L.summary.total_capped_eur, wall: L.summary.wall,
               bundles: L.bundles.map(b => ({ tag: b.tag, applied: b.applied, year: b.year })), tile, sel: st.doc.assets[0] && st.doc.assets[0].id };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!got;
  const ex = c.expect;
  if (got) {
    for (const id of Object.keys(ex.assets)) {
      const e = ex.assets[id], g = got.assets[id];
      for (const k of Object.keys(e)) {
        let ok;
        if (!g) ok = false;
        else if (k === 'eff_age' || k === 'added_risk_eur') ok = near(g[k], e[k]);
        else ok = JSON.stringify(g[k]) === JSON.stringify(e[k]);
        if (!ok) { pass = false; cmp[id + '.' + k] = { got: g ? g[k] : null, exp: e[k], ok }; }
      }
    }
    for (const k of ['need', 'capped', 'backlog']) { const ok = ex[k].length === got[k].length && ex[k].every((v, i) => near(got[k][i], v)); cmp[k] = { ok }; if (!ok) { pass = false; cmp[k].got = got[k]; cmp[k].exp = ex[k]; } }
    for (const k of ['total_need', 'total_capped']) { const ok = near(got[k], ex[k]); cmp[k] = { got: got[k], exp: ex[k], ok }; if (!ok) pass = false; }
    const wOk = (ex.wall === null && got.wall === null) || (ex.wall && got.wall && ex.wall.year === got.wall.year && ex.wall.waiting === got.wall.waiting && near(got.wall.backlog_eur, ex.wall.backlog_eur));
    cmp.wall = { got: got.wall, exp: ex.wall, ok: !!wOk }; if (!wOk) pass = false;
    for (const k of ['survey_needed', 'cost_unknown']) { const ok = JSON.stringify(got[k]) === JSON.stringify(ex[k]); cmp[k] = { got: got[k], exp: ex[k], ok }; if (!ok) pass = false; }
    const bOk = JSON.stringify(got.bundles) === JSON.stringify(ex.bundles); cmp.bundles = { got: got.bundles, exp: ex.bundles, ok: bOk }; if (!bOk) pass = false;
    /* what the reader sees: the first tile shows the renewal year of the selected (first) asset */
    const first = c.assets[0].id, exTile = String(ex.assets[first].renewal_year), sOk = got.tile === exTile;
    cmp.screen = { got: got.tile, exp: exTile, ok: sOk }; if (!sOk) pass = false;
    Object.keys(cmp).forEach(k => { if (cmp[k].ok && k !== 'screen' && k !== 'wall' && k !== 'total_need') delete cmp[k]; });
  }
  results.push({ id: c.id, note: c.note, inputs: { year: c.year, opts: c.opts, crit: c.crit, assets: c.assets.length }, cmp, pass });
}
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'meplifecycle',
  file: 'meplifecycle.html',
  reference: 'bench-src/ref/gen_meplifecycle.py — independent Python implementation of the published method _mep/life/METHOD.md',
  reference_citations: [
    'Regulation (EU) 2024/573 on fluorinated greenhouse gases, Art. 13(3)–(5), Annex IV, Annex VII, Annex I and Annex VI (OJ L, 20.2.2024)',
    'Regulation (EC) No 1005/2009 on substances that deplete the ozone layer, Art. 11(3)',
    'ISO 55000:2024 Asset management — vocabulary, overview and principles',
    'ANSI/ASHRAE Standard 34 — refrigerant blend compositions',
    '_mep/life/METHOD.md revision meplifecycle-1.1 (condition table, triggers, Weibull wear-out and scarcity horizons stated as learning assumptions)'
  ],
  tolerance: 'exact for every year, governing driver code, grade, cycle, range, deferral, booked/unbooked reason (survey needed, cost unknown), wall year/waiting count and bundle decision; relative 1e-9 for effective ages, added risk, yearly need/capped/backlog euros and totals; the first headline tile must show the renewal year of the selected asset',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`meplifecycle: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(r.cmp).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
