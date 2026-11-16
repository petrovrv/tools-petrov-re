// Benchmark driver for mepcriticality.html.
// Reference: bench-src/ref/gen_mepcriticality.py (independent implementation of _mep/crit/METHOD.md) -> ref/mepcriticality_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8794 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_mepcriticality.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected classes, priorities, consequence/likelihood levels, the four dimension scores, the redundancy credit and the class range were computed by bench-src/ref/gen_mepcriticality.py, an independent Python implementation written from the published method (_mep/crit/METHOD.md: NASA RCM Guide 2008 consequence ranking, SAE JA1011 hidden-function logic, stated thresholds), not from the page code. Class-library typical values are input data dumped from mep-core.js into ref/mepcriticality_classes.json.' };
const P = benchPaths({ name: 'mepcriticality', page: 'mepcriticality.html', ref: 'mepcriticality_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__mepcriticality, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const KEYS = ['class', 'priority', 'consequence', 'likelihood', 'credited', 'class_best', 'class_worst', 'safety', 'environment', 'service', 'financial'];
const results = [];
for (const c of ref) {
  const assets = c.assets || [c.asset];
  const expects = c.expect_rows || [c.expect];
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__mepcriticality, st = M.state;
      const list = cc.assets || [cc.asset];
      const ov = {}; if (cc.override && cc.asset) ov[cc.asset.id] = cc.override;
      st.doc = { schema: 'tools.petrov.re/mep-maintenance/v1', revision: 1, site: { name: 'bench', currency: 'EUR', labour_rate_eur_h: 75, year: cc.year },
                 assets: JSON.parse(JSON.stringify(list)), modules: { mepcriticality: { state: { overrides: ov, financial_bands: [1000, 10000, 50000, 250000], repair_share_pct: 15 } } } };
      st.sel = 0; st.origin = 'preset';
      M.ui.sync(); M.ui.run();
      const tile = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { rows: M.last.rows.map(r => ({ valid: r.valid, errors: r.errors || null, class: r['class'], priority: r.priority, consequence: r.consequence, likelihood: r.likelihood, credited: r.credited_redundancy,
               class_best: r.class_range && r.class_range.best, class_worst: r.class_range && r.class_range.worst,
               safety: r.scores && r.scores.safety, environment: r.scores && r.scores.environment, service: r.scores && r.scores.service, financial: r.scores && r.scores.financial })),
               tileClass: tile[0] || null, tilePriority: tile[1] || null };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!read;
  expects.forEach((ex, i) => {
    const e = Object.assign({}, ex, ex.scores), g = read && read.rows[i];
    if (!g || !g.valid) pass = false;
    for (const k of KEYS) { const ok = !!g && g[k] === e[k]; cmp[(expects.length > 1 ? assets[i].id + '.' : '') + k] = { got: g ? g[k] : null, exp: e[k], ok }; if (!ok) pass = false; }
  });
  /* what the reader sees: the headline tiles carry the class and priority of the selected (first) asset */
  const e0 = expects[0];
  const tileOk = !!read && read.tileClass === e0['class'] && String(read.tilePriority).replace(/\D/g, '') === String(e0.priority);
  cmp.screen = { got: read ? [read.tileClass, read.tilePriority] : null, exp: [e0['class'], e0.priority], ok: tileOk };
  if (!tileOk) pass = false;
  results.push({ id: c.id, note: c.note, inputs: { assets, override: c.override || null, year: c.year }, rows: expects.length, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'mepcriticality',
  file: 'mepcriticality.html',
  reference: 'bench-src/ref/gen_mepcriticality.py — independent Python implementation of the published method _mep/crit/METHOD.md',
  reference_citations: [
    'NASA (2008) Reliability-Centered Maintenance Guide for Facilities and Collateral Equipment, §3 (criticality and consequence ranking)',
    'SAE JA1011:2009 Evaluation Criteria for RCM Processes; SAE JA1012:2011 A Guide to the RCM Standard (hidden functions, failure-finding)',
    'ISO 55000:2024 Asset management — vocabulary, overview and principles (asset criticality)',
    '_mep/crit/METHOD.md revision mepcriticality-1.0 (thresholds stated as learning assumptions)'
  ],
  tolerance: 'exact: every class, ordinal level, score and flag of every asset must equal the reference (ordinal quantities have no numerical tolerance); the headline tiles must show the class and priority of the selected asset',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`mepcriticality: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
