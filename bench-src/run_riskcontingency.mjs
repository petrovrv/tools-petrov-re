// Benchmark driver for riskcontingency.html (Cost & Schedule Risk, Monte Carlo).
// Reference: bench-src/ref/gen_riskcontingency.py (independent numpy Monte Carlo written from _tnd/riskcontingency/SPEC.md: PERT as beta, triangular, uniform,
// Bernoulli risk events, own Iman–Conover, max over parallel paths, time cost, capped delay damages; 400 000 runs per case) -> ref/riskcontingency_ref.json.
// Deterministic values exact (1e-9), Monte Carlo values within 4 standard errors of the page's own 10 000-run sample + 0.3 % (tolerance computed by the reference).
// Run: BENCH_BASE=http://127.0.0.1:8798 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_riskcontingency.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Base estimates, plan durations, EMV and analytic means are recomputed exactly; Monte Carlo statistics come from an independent 400 000-run numpy simulation by bench-src/ref/gen_riskcontingency.py with tolerances from the sampling error of the page run; hand cases carry analytic answers.' };
const P = benchPaths({ name: 'riskcontingency', page: 'riskcontingency.html', ref: 'riskcontingency_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_riskcontingency', '1'); localStorage.removeItem('tnd.project.v1'); } catch (e) { /* private mode */ } });
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__diagramReady && window.__riskcontingency && window.__riskcontingency.last() && window.__riskcontingency.last().ok, null, { timeout: 120000 });
const BUILD = await readPageManifestRevision(p);
const ENGINE = await p.evaluate(() => ({ risk: window.TndRisk && window.TndRisk.version, core: window.TndCore && window.TndCore.version }));

/* the page's analysis reduced to the reference's shape (runs in the page) */
const REDUCE = `(function (r) {
  if (!r || !r.ok) return { ok: false, errors: r && r.errors };
  var o = { ok: true, via: r.via, ms: r.ms, det: { base: r.det.base, D0: r.det.D, emv: r.det.emv, items_mean: r.det.itemsMean, ld_plan: r.det.ldPlan }, mc: {} }, m = o.mc, c = r.cost.stats;
  m['cost.mean'] = c.mean; m['cost.p50'] = c.p50; m['cost.p80'] = c.p80; m['cost.p90'] = c.p90; m['cost.sd'] = c.sd; m.pBase = r.pBase; m.pBaseEmv = r.pBaseEmv;
  if (r.dur) { m['dur.mean'] = r.dur.stats.mean; m['dur.p50'] = r.dur.stats.p50; m['dur.p80'] = r.dur.stats.p80; m.joint = r.joint; m['ld.mean'] = r.ld.mean;
    Object.keys(r.criticality).forEach(function (k) { m['crit.' + k] = r.criticality[k]; }); if (r.pTargetDays != null) m.pTargetDays = r.pTargetDays; }
  o.share = {}; r.tornadoCost.forEach(function (t) { if (t.share != null) o.share[t.name] = t.share; });
  return o;
})`;
function compare(g, e) {
  const bad = [];
  if (!g || !g.ok) return ['not ok ' + JSON.stringify(g && g.errors)];
  for (const k of Object.keys(e.det)) if (Math.abs(g.det[k] - e.det[k]) > 1e-9 * Math.max(1, Math.abs(e.det[k]))) bad.push(k + ' ' + g.det[k] + ' vs ' + e.det[k]);
  for (const k of Object.keys(e.mc)) { const v = g.mc[k]; if (v == null || Math.abs(v - e.mc[k].v) > e.mc[k].tol) bad.push(k + ' ' + v + ' vs ' + e.mc[k].v + ' ±' + e.mc[k].tol.toPrecision(3)); }
  /* covariance (Euler) shares of the cost variance (review R-1); a part the page does not list counts as 0 */
  for (const k of Object.keys(e.share || {})) { const v = g.share[k] || 0; if (Math.abs(v - e.share[k].v) > e.share[k].tol) bad.push('share ' + k + ' ' + v + ' vs ' + e.share[k].v + ' ±' + e.share[k].tol.toPrecision(3)); }
  return bad;
}
const results = [];
const presetIds = ['be-sewer', 'epc-fidic', 'equip-trafo', 'client-budget'];

/* 1: presets through the Examples panel (the reader's path; computed in the Web Worker) */
for (const c of ref.cases.filter(c => presetIds.includes(c.input.id))) {
  const g = await p.evaluate(async ({ id, red }) => {
    const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
    sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click();
    await new Promise(r => setTimeout(r, 200)); await window.__riskcontingency.whenReady();
    return { red: eval(red)(window.__riskcontingency.last()), verdict: (document.querySelector('.dgu-verdict') || {}).textContent || '' };
  }, { id: c.input.id, red: REDUCE });
  const bad = compare(g.red, c.expect);
  if (!/^P80 contingency /.test(g.verdict)) bad.push('verdict ' + g.verdict.slice(0, 60));
  if (g.red.via !== 'worker') bad.push('not computed in the Web Worker: ' + g.red.via);
  if (!(g.red.ms < 2000)) bad.push('slow ' + g.red.ms + ' ms');
  results.push({ id: 'preset-' + c.input.id, kind: 'preset', pass: !bad.length, bad: bad.slice(0, 6), ms: g.red.ms });
}

/* 2: hand and random cases through the engine the page loaded (same input contract as the worker) */
const rest = ref.cases.filter(c => !presetIds.includes(c.input.id));
const got = await p.evaluate(({ cs, red }) => cs.map(c => eval(red)(window.__riskcontingency.analyse(c))), { cs: rest.map(c => c.input), red: REDUCE });
rest.forEach((c, k) => {
  const g = got[k], bad = compare(g, c.expect), h = c.hand || {};
  if (g && g.ok) {
    if (h.D0 != null && g.det.D0 !== h.D0) bad.push('hand D0 ' + g.det.D0);
    if (h.mean != null && Math.abs(g.det.items_mean + g.det.emv - h.mean) > 1e-9 * Math.max(1, h.mean)) bad.push('hand analytic mean ' + (g.det.items_mean + g.det.emv));
    if (h.p80 != null && Math.abs(g.mc['cost.p80'] - h.p80) > Math.max(1e-9, c.expect.mc['cost.p80'].tol)) bad.push('hand P80 ' + g.mc['cost.p80']);
    if (h.p50 != null && Math.abs(g.mc['cost.p50'] - h.p50) > 1e-9) bad.push('hand P50 ' + g.mc['cost.p50']);
    if (h.ld != null && Math.abs(g.mc['ld.mean'] - h.ld) > Math.max(6, c.expect.mc['ld.mean'].tol)) bad.push('hand damages ' + g.mc['ld.mean']);
    if (h.dur_mean != null && Math.abs(g.mc['dur.mean'] - h.dur_mean) > c.expect.mc['dur.mean'].tol) bad.push('hand merge bias E[max] ' + g.mc['dur.mean'] + ' vs ' + h.dur_mean);
    if (h.crit_A != null && g.mc['crit.A'] !== h.crit_A) bad.push('hand tie criticality ' + g.mc['crit.A']);
  }
  results.push({ id: c.input.id, kind: /^hand-/.test(c.input.id) ? 'hand' : 'random', pass: !bad.length, bad: bad.slice(0, 4) });
});

/* 3: invalid input is refused, not simulated */
const inval = await p.evaluate(() => { const A = window.__riskcontingency.analyse; return [A({ items: [{ dist: 'pert', min: 10, ml: 5, max: 20 }] }).ok, A({ items: [{ dist: 'fixed', ml: 1 }], risks: [{ p: 1.5, cost: { min: 1, ml: 1, max: 1 } }] }).ok, A({}).ok]; });
results.push({ id: 'invalid-input', kind: 'normalisation', pass: inval.every(x => x === false) });

/* 4: preset findings (ahas) — reference verdicts and the page's own path (edit a field as the reader would) */
const pageAha = await p.evaluate(async () => {
  const W = window.__riskcontingency, out = {}, ex = async id => { DiagramUI.current.example(id); await new Promise(r => setTimeout(r, 150)); await W.whenReady(); };
  const run = async () => { W.ui.sync(); W.ui.run(); await new Promise(r => setTimeout(r, 150)); await W.whenReady(); };
  await ex('be-sewer'); let L = W.last();
  const sh = {}; L.tornadoCost.forEach(function (t) { sh[t.name] = t.share; });
  out['be-sewer'] = L.det.base === 5640000 && Math.abs(L.pBase - 0.12) < 0.02 && Math.abs(L.atQ.contingency - 564000) < 15000 && L.tornadoCost[1].name === 'I2'
    && Math.abs(sh.I2 - 0.25) < 0.025 && Math.abs(sh.I1 - 0.30) < 0.025 && sh.I4 < 0.05 && Math.abs(L.ld.mean - 2500) < 400;
  await ex('epc-fidic'); const e1 = W.last(); W.state.rhoCost = 0; await run(); const e0 = W.last();
  out['epc-fidic'] = Math.abs(e1.atQ.contingency - 3320000) < 60000 && Math.abs(e0.atQ.contingency - 2550000) < 60000;
  await ex('equip-trafo'); const t = W.last(); W.state.acts = W.state.acts.filter(a => !a.path || a.path === 'W'); await run(); const t1 = W.last();
  out['equip-trafo'] = t.det.D === 215 && Math.abs(t.pTargetDays - 0.13) < 0.02 && Math.abs(t.ld.mean - 97000) < 5000 && Math.abs(t1.pTargetDays - 0.35) < 0.03;
  await ex('client-budget'); L = W.last();
  out['client-budget'] = Math.abs(L.det.emv - 211583.33) < 1 && Math.abs(L.pBaseEmv - 0.32) < 0.02 && Math.abs(L.atQ.contingency / L.det.emv - 2.6) < 0.1;
  return out;
});
for (const id of presetIds) results.push({ id: 'aha-' + id, kind: 'aha', pass: ref.aha[id] === true && pageAha[id] === true, cmp: { reference: ref.aha[id], page: pageAha[id] } });

/* 4b: speed at the tool's limits (review R-3): 40 cost lines, 30 activities, 40 risks, 10 000 runs in the Web Worker < 2 s; 100 000 requested -> capped */
const speed = await p.evaluate(async () => {
  const W = window.__riskcontingency, st = W.state;
  const run = async () => { W.ui.sync(); W.ui.run(); await new Promise(r => setTimeout(r, 150)); await W.whenReady(); };
  st.iterations = 10000; st.seed = 7; st.rhoCost = 0.4; st.rhoTime = 0.3; st.timeCost = 3000; st.ldMode = 'linear'; st.ld = 5000; st.ldCap = 200000; st.targetDays = 120;
  st.items = Array.from({ length: 40 }, (_, k) => ({ name: 'L' + k, dist: ['pert', 'triangular', 'uniform'][k % 3], min: 90000 + k, ml: 100000 + k, max: 140000 + 3 * k }));
  st.acts = Array.from({ length: 30 }, (_, k) => ({ name: 'A' + k, path: k < 6 ? '' : 'ABCD'[k % 4], dist: 'pert', min: 8, ml: 10 + (k % 5), max: 20 + (k % 7) }));
  st.risks = Array.from({ length: 40 }, (_, k) => ({ name: 'R' + k, p: 5 + 100 * (k % 9) / 30, dist: 'pert', cmin: 10000, cml: 20000 + 1000 * k, cmax: 90000, tmin: k % 2 ? 1 : null, tml: k % 2 ? 3 : null, tmax: k % 2 ? 9 : null, path: k % 3 ? 'ABCD'[k % 4] : '', owner: '' }));
  await run(); const a = W.last();
  st.iterations = 100000; await run(); const b = W.last();
  return { ms: a.ms, via: a.via, ok: a.ok, capped: b.input.iterations, flag: b.flags.indexOf('iter-capped') >= 0, ms2: b.ms };
});
results.push({ id: 'speed-max-model', kind: 'speed', pass: speed.ok && speed.via === 'worker' && speed.ms < 2000 && speed.capped === 18000 && speed.flag && speed.ms2 < 4000, cmp: speed, ms: speed.ms });

/* 5: exports and project round trip (risks block + module) */
const io = await p.evaluate(async () => {
  const W = window.__riskcontingency; DiagramUI.current.example('client-budget'); await new Promise(r => setTimeout(r, 150)); await W.whenReady();
  const csv = W.csv(), rec = W.record(), P = W.projectPayload();
  const d = TndCore.project.withModule(TndCore.project.empty({ name: 'bench' }), 'riskcontingency', P);
  const v = TndCore.project.validate(d);
  DiagramUI.current.example('be-sewer'); await new Promise(r => setTimeout(r, 150)); await W.whenReady();
  const u = W.useProject(d, 'riskcontingency'); await new Promise(r => setTimeout(r, 150)); await W.whenReady();
  const back = u.ok && Math.abs(W.last().det.emv - 211583.33) < 1;
  const d2 = JSON.parse(JSON.stringify(d)); delete d2.modules.riskcontingency;
  DiagramUI.current.example('be-sewer'); await new Promise(r => setTimeout(r, 150)); await W.whenReady();
  const u2 = W.useProject(d2, 'risks'); await new Promise(r => setTimeout(r, 150)); await W.whenReady();
  return { csv: /risk_register/.test(csv) && /P80_contingency/.test(csv), rec: rec.outputs.P80_contingency > 0 && rec.model.equations.length >= 5,
           valid: v.ok && Array.isArray(d.risks) && d.risks.length === 5 && d.risks[0].impact.ml === 120000, back, risks: u2.ok && W.state.risks.length === 5 && W.state.items.length === 7 };
});
for (const [k, v] of Object.entries(io)) results.push({ id: 'io-' + k, kind: 'io', pass: v === true });
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'riskcontingency',
  file: 'riskcontingency.html',
  engine: ENGINE,
  reference: 'bench-src/ref/gen_riskcontingency.py — independent numpy Monte Carlo written from the method definitions (PERT as beta, triangular, uniform, Bernoulli events, own Iman–Conover, max over parallel paths, time cost, capped delay damages), 400 000 runs per case, not ported from tnd-risk.js',
  reference_citations: [
    'AACE International RP 40R-08 (contingency estimating), 41R-08 (range estimating), 57R-09 (integrated cost and schedule risk analysis) — method by structure only',
    'IEC 31010:2019 Risk management — risk assessment techniques (Monte Carlo simulation); ISO 31000:2018',
    'R. L. Iman, W. J. Conover, A distribution-free approach to inducing rank correlation among input variables, Commun. Statist. B 11(3), 1982, 311-334',
    'D. Vose, Risk Analysis: A Quantitative Guide, 3rd ed., Wiley 2008 (PERT with lambda 4, discrete risk events)'
  ],
  tolerance: 'base estimate, plan duration, EMV, analytic means relative 1e-9; Monte Carlo mean, P50, P80, P90, sd, confidence of base and base+EMV, duration mean/P50/P80, JCL, expected damages, path criticality and confidence of the contract duration within 4 standard errors of the page run (10 000 iterations) + 0.3 % of the value; hand cases against analytic answers',
  independence: 'Independent of the JavaScript: numpy generators, beta sampling of PERT, numpy triangular, own Iman–Conover with scipy normal scores, vectorised path maxima; seeds and random streams differ from the page, so agreement is statistical, as it must be for Monte Carlo.',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`riskcontingency: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass).slice(0, 15)) console.log('FAIL', r.id, JSON.stringify(r.bad || r.cmp));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
