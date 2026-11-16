// Benchmark driver — thermaloptimizer.html (Thermal System Optimizer, thermal-core v0.71).
// Loads the page in Chromium and calls the benchmark suite the page's own core ships,
// globalThis.ThermalCore.runBenchmarks(): 13 cases against published references (PsychroLib,
// CIBSE/EN 1264, EN 442, Gnielinski, pygfunction, ASHRAE, CoolProp) and closed-form identities.
// Every actual value is computed in this run by the core the page loaded. The expected values are
// literals inside that core; each is checked against bench-src/ref/thermaloptimizer_ref.json (the
// 2026-09-04 accepted artifact), and the run refuses to write when a reference moved or a case
// appeared or vanished.
//   usage: node bench-src/run_thermaloptimizer.mjs --base http://127.0.0.1:8321 [--site <tree>] [--out <file>]
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
import { collect, toArtifactCases } from './thermaloptimizer_cases.mjs';

const P = benchPaths({ name: 'thermaloptimizer', page: 'thermaloptimizer.html', ref: 'thermaloptimizer_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const ORIGIN = (P.base || 'http://127.0.0.1:8321').replace(/\/+$/, '');
const URL0 = ORIGIN + '/thermaloptimizer.html?lang=en';
const PN = 'Expected values are published reference figures and closed-form identities carried as literals in '
  + 'ThermalCore.runBenchmarks() of the page core and recorded in bench-src/ref/thermaloptimizer_ref.json '
  + '(accepted 2026-09-04); every actual value is computed in this run by the core thermaloptimizer.html loaded in Chromium.';

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
  await page.waitForFunction(() => globalThis.ThermalCore && typeof globalThis.ThermalCore.runBenchmarks === 'function', null, { timeout: 60000 });
  const BUILD = await readPageManifestRevision(page);

  const raw = await collect(page);
  const { cases, refDrift, missing, added } = toArtifactCases(raw, REF.cases);
  if (refDrift.length || missing.length || added.length)
    throw new Error('reference corpus mismatch — moved: ' + refDrift.join(',') + '; missing: ' + missing.join(',')
      + '; added: ' + added.join(',') + '. Review the core change before writing an artifact.');
  for (const c of cases) console.log((c.pass ? 'PASS ' : 'FAIL ') + c.id + '  |d|=' + c.absolute_error);
  const total = cases.length, passed = cases.filter(c => c.pass).length;
  const art = {
    schema: 'tools.petrov.re/benchmark/v1', tool: 'thermaloptimizer', file: 'thermaloptimizer.html',
    reference: REF.reference, reference_citations: REF.reference_citations,
    tolerance: 'Per-case absolute or relative tolerances recorded in each benchmark case.',
    driver: 'bench-src/run_thermaloptimizer.mjs', driven: URL0,
    run_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    total, passed, failed: total - passed, flagged: 0, page_errors, console_errors,
    independent_validation: raw.independentlyValidated === true,
    cases, not_benchmarked: REF.not_benchmarked,
    notes: ['The suite is the page core\'s own ThermalCore.runBenchmarks(); this driver runs it in the browser and checks its expected values against the recorded corpus. Independent validation remains false.']
  };
  stampProvenance(art, { build: BUILD, reference_provenance: 'recorded', provenance_note: PN });
  fs.writeFileSync(P.out, JSON.stringify(art, null, 2) + '\n');
  console.log(`thermaloptimizer: ${passed}/${total} passed, page_errors ${page_errors.length}`);
} catch (e) {
  console.error(e && e.stack || e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
