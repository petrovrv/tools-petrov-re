#!/usr/bin/env node
/**
 * tools.petrov.re — benchmark runner
 *
 * Loads each tool HTML in headless Chromium from the local filesystem and calls the
 * tool's own calculation functions with the inputs from benchmarks/<tool-id>.json,
 * comparing against published reference values.
 *
 * Usage:
 *   node tools/bench-runner.mjs [--site DIR] [--bench DIR] [--out FILE] [--only tool-id]
 *
 * Exit code 0 if every asserted case passes, 1 otherwise.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const SITE  = resolve(arg('--site',  'site'));
const BENCH = resolve(arg('--bench', 'benchmarks'));
const OUT   = resolve(arg('--out',   'benchmarks/results.json'));
const ONLY  = arg('--only', null);

// Map tool_id -> deployed filename. Kept explicit so a rename is a visible edit.
const FILE_OF = {
  'steam-tables':        'steam_tables.html',
  'mollier':             'mollier.html',
  'iron-carbon-diagram': 'iron_carbon_diagram.html',
  'kinetics':            'kinetics.html',
  'fourier-series':      'fourier_series.html',
  'beam-diagrams':       'beam_diagrams.html',
};

const deviation = (got, exp) =>
  (exp === 0) ? Math.abs(got) : Math.abs((got - exp) / exp);

/** Resolve "harmonics[0].b" / "phases[1].frac" against a returned object. */
function atPath(obj, path) {
  return String(path).replace(/\[(\d+)\]/g, '.$1').split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function tolFor(suite, kase, key) {
  const pick = t => {
    if (t == null) return null;
    if (typeof t.abs === 'object' && t.abs && key in t.abs) return { abs: t.abs[key] };
    if (typeof t.rel === 'object' && t.rel && key in t.rel) return { rel: t.rel[key] };
    if (typeof t.abs === 'number') return { abs: t.abs };
    if (typeof t.rel === 'number') return { rel: t.rel };
    return null;
  };
  return pick(kase.tolerance) || pick(suite.tolerance) || { rel: 1e-8 };
}

const suites = readdirSync(BENCH)
  .filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'results.json')
  .map(f => JSON.parse(readFileSync(join(BENCH, f), 'utf8')))
  .filter(s => s.schema === 'tools.petrov.re/benchmark-suite/v1')
  .filter(s => !ONLY || s.tool_id === ONLY);

const browser = await chromium.launch();
const report = { schema: 'tools.petrov.re/benchmark-results/v1', generated: null, runner: 'bench-runner.mjs', tools: [] };
let hardFail = 0;

for (const suite of suites) {
  const file = FILE_OF[suite.tool_id];
  if (!file) { console.error(`! no file mapping for tool_id=${suite.tool_id}`); hardFail++; continue; }

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));
  await page.goto('file://' + join(SITE, file), { waitUntil: 'load' });
  await page.waitForTimeout(250);

  const entry = {
    tool_id: suite.tool_id, file, suite_title: suite.title, revision: suite.revision,
    sources: suite.sources, coverage_gaps: suite.coverage_gaps || [],
    passed: 0, failed: 0, skipped: 0, cases: []
  };

  for (const kase of suite.cases) {
    // A case is either `call` + `args` (a named function reachable as a global)
    // or `expr` — a JavaScript expression evaluated in the page's own lexical scope,
    // which is how top-level `const` tables (BETA, LAM, CEM, ...) are reached.
    let raw;
    const scalarKey = kase.scalar || 'value';
    try {
      if (kase.expr) {
        raw = await page.evaluate(({ src, scalarKey }) => {
          try {
            const r = (0, eval)('(' + src + ')');
            return (r !== null && typeof r === 'object') ? r : { [scalarKey]: r };
          } catch (e) { return { __error: String(e).slice(0, 200) }; }
        }, { src: kase.expr, scalarKey });
      } else {
        raw = await page.evaluate(({ call, args, scalarKey }) => {
          const fn = window[call];
          if (typeof fn !== 'function') return { __missing: call };
          const r = fn(...args);
          return (r !== null && typeof r === 'object') ? r : { [scalarKey]: r };
        }, { call: kase.call, args: kase.args, scalarKey });
      }
    } catch (e) {
      raw = { __error: String(e).slice(0, 200) };
    }

    const rec = { id: kase.id, call: kase.call || kase.expr, args: kase.args, source: kase.source, checks: [], status: 'pass' };

    if (raw.__missing) { rec.status = 'skip'; rec.reason = `window.${raw.__missing} is not a function`; entry.skipped++; entry.cases.push(rec); continue; }
    if (raw.__error)   { rec.status = 'fail'; rec.reason = raw.__error; entry.failed++; hardFail++; entry.cases.push(rec); continue; }

    for (const [key, exp] of Object.entries(kase.expected)) {
      const got = atPath(raw, key);
      const tol = tolFor(suite, kase, key);
      if (typeof got !== 'number' || !isFinite(got)) {
        rec.checks.push({ key, expected: exp, got: got ?? null, ok: false, reason: 'not a finite number' });
        rec.status = 'fail'; continue;
      }
      const dev = deviation(got, exp);
      const ok = tol.abs != null ? Math.abs(got - exp) <= tol.abs : dev <= tol.rel;
      rec.checks.push({ key, expected: exp, got, rel_dev: dev, tol, ok });
      if (!ok) rec.status = 'fail';
    }

    if (rec.status === 'fail') { entry.failed++; hardFail++; } else entry.passed++;
    entry.cases.push(rec);
  }

  entry.page_errors = pageErrors;
  entry.verdict = (entry.failed === 0 && entry.passed > 0) ? 'benchmarked' : 'failing';
  report.tools.push(entry);
  await page.close();

  const bar = entry.failed === 0 ? 'PASS' : 'FAIL';
  console.log(`${bar}  ${suite.tool_id.padEnd(22)} ${entry.passed} passed, ${entry.failed} failed, ${entry.skipped} skipped`);
  for (const c of entry.cases.filter(c => c.status !== 'pass')) {
    console.log(`      ${c.status.toUpperCase()} ${c.id}${c.reason ? ' — ' + c.reason : ''}`);
    for (const ch of (c.checks || []).filter(x => !x.ok))
      console.log(`         ${ch.key}: got ${ch.got}, expected ${ch.expected}` +
                  (ch.rel_dev != null ? `  (rel dev ${ch.rel_dev.toExponential(3)})` : '') +
                  (ch.reason ? `  [${ch.reason}]` : ''));
  }
}

await browser.close();
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nwrote ${OUT}`);
process.exit(hardFail ? 1 : 0);
