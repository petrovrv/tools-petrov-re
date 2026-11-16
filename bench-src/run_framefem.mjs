// Benchmark driver — framefem.html (2D frame FEM: static, modal, buckling, P-Delta).
// Drives the page through the 41 cases of bench-src/ref/framefem_ref.json: 32 through the
// page's own analyze(), 9 through the page-generated Python export run with python3.
// The reference values are the closed-form figures recorded on 2026-09-05 by an independent
// harness that is no longer in this tree, so reference_provenance is "recorded"; every graded
// figure is computed in this run. Extractors and tolerances: framefem_extract.mjs; one case:
// framefem_case.mjs.
//   usage: node bench-src/run_framefem.mjs --base http://127.0.0.1:8321 [--site <tree>] [--out <file>]
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { execFileSync } from 'node:child_process';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
import { EXTRACT, TOL } from './framefem_extract.mjs';
import { runCase } from './framefem_case.mjs';

const P = benchPaths({ name: 'framefem', page: 'framefem.html', ref: 'framefem_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const ORIGIN = (P.base || 'http://127.0.0.1:8321').replace(/\/+$/, '');
const URL0 = ORIGIN + '/framefem.html?lang=en';
const NB = [
  'Large-displacement / corotational response; P-Delta is initial-stress continuation only.',
  'Dynamic time-history response and damping.',
  'Member section design checks.'];
const PN = 'Reference values are carried unchanged from bench-src/ref/framefem_ref.json, the closed-form values '
  + 'recorded on 2026-09-05 by an independent harness that is not in this tree; every graded figure is computed '
  + 'in this run by framefem.html in Chromium (the page analyze(), and for the nine Python cases the '
  + 'page-generated Python run with python3).';

const page_errors = [], console_errors = [];
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/*', r => r.request().url().startsWith(ORIGIN) ? r.continue() : r.abort());
  page.on('pageerror', e => page_errors.push(String(e && e.message || e)));
  page.on('console', m => { if (m.type() === 'error') console_errors.push(m.text()); });
  await page.goto(URL0, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__framefem && window.__framefem.analyze, null, { timeout: 60000 });
  const BUILD = await readPageManifestRevision(page);

  const cases = []; let worst = null;
  for (const c of REF.cases) {
    const r = await runCase(page, c, P, EXTRACT, TOL, execFileSync, fs);
    cases.push(r.case);
    console.log((r.case.pass ? 'PASS ' : 'FAIL ') + c.id);
    if (r.worst && (!worst || r.worst.rel > worst.rel)) worst = r.worst;
  }
  const total = cases.length, passed = cases.filter(k => k.pass).length;
  const art = {
    schema: 'tools.petrov.re/benchmark/v1', tool: 'framefem', file: 'framefem.html',
    reference: REF.reference, reference_citations: REF.reference_citations,
    external_references: REF.external_references, tolerance: TOL.statement,
    driver: 'bench-src/run_framefem.mjs', driven: URL0,
    run_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    total, passed, failed: total - passed, flagged: 0, page_errors, console_errors,
    worst_relative_error: worst ? worst.rel : null, worst_metric: worst ? worst.metric : null,
    cases, not_benchmarked: NB
  };
  stampProvenance(art, { build: BUILD, reference_provenance: 'recorded', provenance_note: PN });
  fs.writeFileSync(P.out, JSON.stringify(art, null, 2) + '\n');
  console.log(`framefem: ${passed}/${total} passed, page_errors ${page_errors.length}`);
} catch (e) {
  console.error(e && e.stack || e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
