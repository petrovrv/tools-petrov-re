#!/usr/bin/env node
/**
 * tools.petrov.re — framework patcher
 *
 * Applies the tool-manifest/v2 framework to tool HTML files mechanically, so the
 * 45-tool set can be migrated without hand-editing multi-megabyte pages:
 *
 *   1. injects  <script src="diagram-core.js" defer></script>  before site-disclaimer.js
 *   2. migrates the embedded manifest from schema v1 to v2
 *   3. writes the benchmark block from a bench-runner results file
 *   4. records honestly which capabilities the tool actually implements
 *
 * It never touches calculation code and never invents a capability: a tool only
 * gains capabilities.permalink / record / python / handoff once it calls
 * DiagramCore.register(), which the patcher detects rather than assumes.
 *
 * Usage:
 *   node tools/apply-core.mjs --site DIR [--results FILE] [--out DIR] [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SITE = resolve(arg('--site', 'site'));
const OUT = resolve(arg('--out', SITE));
const RESULTS = arg('--results', null);
const DRY = argv.includes('--dry');
const REVISION = arg('--revision', '2026-08-12');

const MANIFEST_RE = /(<script[^>]+id=["']diagram-tool-manifest["'][^>]*>)([\s\S]*?)(<\/script>)/i;
const CORE_TAG = '<script src="diagram-core.js" defer></script>';

const results = RESULTS && existsSync(RESULTS)
  ? JSON.parse(readFileSync(RESULTS, 'utf8'))
  : { tools: [] };
const benchOf = id => results.tools.find(t => t.tool_id === id) || null;

if (OUT !== SITE && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const report = [];

for (const file of readdirSync(SITE).filter(f => f.endsWith('.html'))) {
  const path = join(SITE, file);
  let html = readFileSync(path, 'utf8');
  const m = html.match(MANIFEST_RE);
  if (!m) continue;                                   // not a tool page

  let manifest;
  try { manifest = JSON.parse(m[2].trim()); }
  catch { report.push({ file, action: 'skipped', reason: 'manifest is not valid JSON' }); continue; }

  const changes = [];

  // --- 1. runtime script tag ------------------------------------------------
  if (!/src=["']diagram-core\.js["']/.test(html)) {
    if (/<script[^>]+src=["']site-disclaimer\.js["'][^>]*>\s*<\/script>/i.test(html)) {
      html = html.replace(/(<script[^>]+src=["']site-disclaimer\.js["'][^>]*>\s*<\/script>)/i,
                          `${CORE_TAG}\n$1`);
    } else {
      html = html.replace(/<\/head>/i, `${CORE_TAG}\n</head>`);
    }
    changes.push('injected diagram-core.js');
  }

  // --- 2. capability detection ---------------------------------------------
  // Detected, not declared: a claim in the manifest that the page cannot back up
  // is worse than no claim at all.
  const registers = /DiagramCore\s*\.\s*register\s*\(/.test(html);
  const hasJsPdf = /jspdf|jsPDF/i.test(html);
  const hasOwnPdf = /function\s+(exportPdf|expPDF|exportPDF)\b/.test(html);
  const capabilities = {
    // The runtime stamps provenance onto any jsPDF document, so a tool that
    // already exports a PDF gains the attribution requirement for free.
    pdf: hasJsPdf || hasOwnPdf || registers,
    pdf_attribution: (hasJsPdf || hasOwnPdf || registers),
    permalink: registers,
    record: registers,
    python: registers && /getPython/.test(html),
    handoff: registers && /(getQuantities|DiagramCore\s*\.\s*sendTo)/.test(html)
  };

  // --- 3. benchmark block ---------------------------------------------------
  const id = manifest.id || basename(file, '.html');
  const b = benchOf(id);
  let benchmarks;
  if (b) {
    const total = b.passed + b.failed;
    benchmarks = {
      status: (b.failed === 0 && b.passed > 0) ? 'benchmarked' : 'failing',
      suite: `benchmarks/${id}.json`,
      passed: b.passed,
      total,
      skipped: b.skipped || 0,
      run: results.generated || REVISION,
      runner: 'tools/bench-runner.mjs',
      sources: (b.sources || []).map(s => ({ name: s.name, url: s.url })),
      coverage_gaps: b.coverage_gaps || []
    };
    changes.push(`benchmarks ${benchmarks.status} ${b.passed}/${total}`);
  } else {
    benchmarks = { status: 'not_run', suite: null, passed: null, total: null, run: null,
                   sources: [], coverage_gaps: [] };
  }

  // --- 4. manifest migration ------------------------------------------------
  const wasV1 = manifest.schema === 'tools.petrov.re/tool-manifest/v1';
  manifest.schema = 'tools.petrov.re/tool-manifest/v2';
  manifest.manifest_revision = REVISION;
  manifest.id = id;
  manifest.capabilities = capabilities;
  manifest.benchmarks = benchmarks;
  // `status` stays a statement about the model, not about the test run: a tool can
  // be benchmarked and still be a prototype. `independent_validation` is untouched —
  // passing a benchmark this repository wrote is not independent validation.
  if (!('status' in manifest)) manifest.status = 'prototype';
  if (!('independent_validation' in manifest)) manifest.independent_validation = false;
  if (wasV1) changes.push('manifest v1 -> v2');

  html = html.replace(MANIFEST_RE, (_, open, __, close) =>
    open + JSON.stringify(manifest) + close);

  if (!changes.length) { report.push({ file, action: 'unchanged' }); continue; }
  if (!DRY) writeFileSync(join(OUT, file), html);
  report.push({ file, id, action: DRY ? 'would patch' : 'patched', changes, capabilities });
}

for (const r of report) {
  const tail = r.changes ? ' — ' + r.changes.join('; ') : (r.reason ? ' — ' + r.reason : '');
  console.log(`${String(r.action).padEnd(12)} ${r.file}${tail}`);
}
const patched = report.filter(r => r.action.includes('patch')).length;
console.log(`\n${patched} of ${report.length} tool pages ${DRY ? 'would be ' : ''}patched.`);
