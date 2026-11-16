// Benchmark driver for glassthermalbreak.html (Thermal Breakage Risk of Glass — NBN S 23-002-2:2020 Annex A + EN 16612:2019 §8).
// Reference: bench-src/ref/gen_glassthermalbreak.py (independent Python solver of Annex A A.3 / A.4 + EN 673 gaps + flux linear solve) -> ref/glassthermalbreak_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_glassthermalbreak.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Glass centre, edge and shadow temperatures, ΔT, edge design strength, utilisation and risk level were computed by bench-src/ref/gen_glassthermalbreak.py, written from NBN S 23-002-2:2020 Annex A (closed forms A.3 / A.4 with the A.2 iteration), the NBN EN 673 gap-conductance equations and EN 16612:2019 §8 / Table A.5, not from the page code (the page solves a nodal network and iterates the optical fluxes; the reference uses the closed forms and a direct linear solve). The closed forms are independent of the page only in the cases without a blind; in the cases with a blind (22 of 42) the reference solves the blind with the same learning-assumption network as the page (hrb with blind ε 0,9, ventilation table, 8 W/m²K to the room) — a shared assumption, not an independent check. The edge / shadow / blind factors and generic optical data are learning assumptions shared by both (FIV 01 not available) — re-typed, not imported. The hand case (single clear 6 mm) is built from the same model, not an external published value.' };
const P = benchPaths({ name: 'glassthermalbreak', page: 'glassthermalbreak.html', ref: 'glassthermalbreak_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__glassthermalbreak, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const results = [];
let npts = 0, anchorsTotal = 0, anchorsPassed = 0, maxDev = 0;
for (const c of ref) {
  let g = null;
  try {
    g = await p.evaluate(inp => {
      const G = window.__glassthermalbreak; G.setInput(inp); const L = G.last;
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { panes: L.panes.map(x => ({ theta_c: x.theta_c, theta_edge: x.theta_edge, theta_shade: x.theta_shade, dT: x.dT, alphaE: x.alphaE, fd: x.fd, util: x.util, risk: x.risk })),
        worst: L.worst, util: L.util, risk: L.risk, tiles, n: G.calcInput(G.state).panes.length };
    }, c.input);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!g, bad = 0;
  const add = (k, got, exp, ok) => { npts++; if (!ok) { pass = false; bad++; if (Object.keys(cmp).length < 12) cmp[k] = { got, exp }; } };
  if (g) {
    add('n', g.n, e.panes.length, g.n === e.panes.length);
    e.panes.forEach((x, i) => { const q = g.panes[i] || {};
      for (const k of ['theta_c', 'theta_edge', 'dT']) add(k + i, q[k], x[k], Math.abs(q[k] - x[k]) <= 0.02);
      if (x.theta_shade != null) add('theta_shade' + i, q.theta_shade, x.theta_shade, Math.abs(q.theta_shade - x.theta_shade) <= 0.02);
      add('alphaE' + i, q.alphaE, x.alphaE, Math.abs(q.alphaE - x.alphaE) <= 1e-6);
      add('fd' + i, q.fd, x.fd, Math.abs(q.fd - x.fd) <= 1e-6);
      const dev = Math.abs(q.util - x.util) / Math.max(x.util, 0.2); maxDev = Math.max(maxDev, dev);
      add('util' + i, q.util, x.util, dev <= 0.005);
      const border = [0.5, 1].some(b => Math.abs(x.util - b) <= 0.01) || Math.abs(x.util_k - 1) <= 0.01;
      if (!border) add('risk' + i, q.risk, x.risk, q.risk === x.risk);
    });
    add('worst', g.worst, e.worst, g.worst === e.worst);
    /* what the reader sees: the utilisation tile shows the governing utilisation to 2 decimals */
    add('screen', g.tiles[2], e.util.toFixed(2), String(g.tiles[2]).replace(',', '.') === e.util.toFixed(2));
  }
  if (c.anchor) { anchorsTotal++; if (pass) anchorsPassed++; }
  results.push({ id: c.id, note: c.note, anchor: c.anchor || undefined, checks_failed: bad, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'glassthermalbreak',
  file: 'glassthermalbreak.html',
  reference: 'bench-src/ref/gen_glassthermalbreak.py — independent Python steady-state solver (NBN S 23-002-2:2020 Annex A closed forms A.3 / A.4 with the A.2 gap iteration, NBN EN 673 eq. (4)–(8), absorbed fractions by a direct flux linear solve checked against the EN 410 double-glazing closed form) and EN 16612:2019 edge strength; 42 cases: 7 page presets, 30 grid cases (6 glazings × 5 situations, irradiance 500–950 W/m², annealed cut / polished / heat-strengthened), 4 parameter sweeps (k, duration, γM, extra ΔT) and a hand case built from the same model, not an external published value (' + anchorsPassed + '/' + anchorsTotal + ')',
  external_anchors: { total: anchorsTotal, passed: anchorsPassed },
  reference_citations: [
    'NBN S 23-002-2:2020 Annex A (A.1 he = 4 + 4·v, A.2 iteration of the gap conductances, A.3 double glazing, A.4 triple glazing)',
    'NBN EN 673:2011 eq. (4)–(8) gap conductance (cited by Annex A; copy not read) with ISO 15099 / ISO 52022-3 Annex F gas coefficients as published',
    'NBN EN 410:2011 §5.4.6 effective absorptance (cited by Annex A; principle of multiple reflections)',
    'EN 16612:2019 §8.1 eq. (4), §8.2 eq. (6), Table A.5 (ke), kmod = 0,663·t^(−1/16)',
    'Learning assumptions of both engine and reference (labelled on the page; FIV 01 of NBN S 23-002:2007 §4.4.1.3 not available): generic optical data, frame share r / cold-mass lag / rebate lag, shadow factors 1,0 / 1,25 and diffuse share 0,15, blind optics and gap coupling, restraint k = 1, 5 h peak'
  ],
  tolerance: 'temperatures and ΔT ≤ 0,02 K, αe and fg;d ≤ 10⁻⁶, utilisation ≤ 0,5 % (relative, floor 0,2), risk level exact away from the 0,5 / 1,0 borders, governing pane exact; the utilisation tile must show the reference value to 2 decimals; max utilisation deviation ' + (maxDev * 100).toFixed(4) + ' %',
  total, passed, failed, points: npts,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`glassthermalbreak: ${passed}/${total} passed (${npts} points; external anchors ${anchorsPassed}/${anchorsTotal}; max util dev ${(maxDev * 100).toFixed(4)} %)`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(r.cmp).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
