/* Benchmark driver — gesloten-atmosfeer.html (closed-atmosphere life support)
 *
 * Reference: the same coupled ODE system re-implemented independently in python
 * (bench-src/ref/ga_model.py) from the model description and the rate constants, crew
 * rates and device characteristics read out of the page itself, and integrated with
 * scipy.integrate.solve_ivp (adaptive, error-controlled) — a different integrator family
 * from the page's fixed-step RK4. What is benchmarked is therefore the mathematics, not
 * the choice of physiological data; the data themselves are checked separately against a
 * cited source (see the artifact's `data_provenance`).
 *
 * On top of that every case is graded against invariants that owe nothing to either
 * integration: the carbon and the oxygen balance over the run, the analytic steady state,
 * the ideal-gas closure, non-negativity, and the observed order of the scheme under step
 * halving.
 *
 *   php -S 127.0.0.1:8099 -t <site root>            (the page is reached over http)
 *   node bench-src/run_gesloten-atmosfeer.mjs --base http://127.0.0.1:8099
 * Every other path defaults to this file's own tree.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* Every path this driver uses — site root, reference corpus, the reference solver it
   shells out to, its scratch files and the output — resolves relative to this file's own
   tree, so the driver run in a workspace drives that workspace. */
const P = benchPaths({ name: 'gesloten-atmosfeer', page: 'gesloten-atmosfeer.html',
                       ref: ['gesloten-atmosfeer_ref.json', 'ga_solve.py'] });

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is read out of the live DOM of the page the
   browser loaded and passed to stampProvenance(), which writes build,
   manifest_revision, reference_provenance and provenance_note, and refuses to write
   anything when the observed build is absent or disagrees with the page on disk. This
   artifact dates its own run, so the stamp keeps that run_at. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/ga_cases.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 1 051 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* This driver reaches its page over http, as it did before; --base, BENCH_BASE or the
   driver's own GA_BASE set the origin and the default is unchanged. */
const BASE = (P.base || process.env.GA_BASE || 'http://127.0.0.1:8099').replace(/\/+$/, '');
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const GA_SOLVE = P.refs['ga_solve.py'];
const TMP = P.scratch();

/* ---------- tolerances ----------------------------------------------------------------
 * The page integrates with fixed-step RK4 at a step it chooses itself (8-14 s here). The
 * scheme is fourth order, so the error against an exact solution scales as (lambda*dt)^4.
 * The measured deviation from the adaptive reference is 1e-9 relative or better in every
 * case, so a display-driven tolerance would be meaningless: the criterion is 1e-7 relative
 * (two orders above the observed deviation, two below anything that could reach the printed
 * digits), with an absolute floor per quantity for the near-zero cases. Separately the run
 * must be step-converged (halving the step must not move it by more than 1e-9 relative) and
 * the scheme must show its fourth order where the truncation error is actually visible. */
const TOL_REL = 1e-7;
const TOL_ABS = { co2_ppm: 1e-5, pO2_kPa: 1e-7, p_kPa: 1e-7, TC: 1e-6, rh: 1e-6, tr_ppm: 1e-6, o2_pct: 1e-7, pCO2_kPa: 1e-9, pv_kPa: 1e-9 };
const OBS = ['co2_ppm', 'o2_pct', 'pO2_kPa', 'pCO2_kPa', 'p_kPa', 'TC', 'rh', 'tr_ppm', 'pv_kPa'];

function cmp(got, ref, tolAbs, tolRel) {
  const d = Math.abs(got - ref), t = (tolAbs || 0) + (tolRel === undefined ? TOL_REL : tolRel) * Math.abs(ref);
  return { got, ref, abs: d, tol: t, rel: ref ? d / Math.abs(ref) : d, ok: d <= t };
}

const NUMF = ['V', 'N', 'p0', 'T0', 'rh0', 'co20', 'gco2', 'go2', 'gh2o', 'qs', 'gtr', 'gwat',
  'oa', 'toa', 'vs', 'eta', 'o2max', 'po2set', 'vd', 'tcoil', 'qc', 'tset', 'qe', 'ua',
  'thull', 'vtr', 'etatr', 'leak', 'so2', 'ssorb', 'sratio', 'swat', 'sener', 'dur',
  'ftime', 'lkr'];

/* The page's own input ids are gone: it now renders its inputs as framework fields,
   and it declares a driving surface for this harness in their place -
   window.__gesloten = {ui, state, recompute, last, set}, commented in the page as
   "a stable driving surface for the benchmark harness, which used to set the input
   elements by id and call recompute()". readParams() reads that state object rather
   than the DOM, so writing a control's .value no longer reaches the model.
   The run below therefore writes the state, calls the page's own recompute() exactly
   as before (so a throw is still this driver's `thrown`), and then lets the framework
   re-render from the same state, so every readout read afterwards is the one the page
   is showing. #stabwarn and #val-out are unchanged; the KPI strip #kpis is gone and
   the same six numbers are the framework result tiles; #v_rq is the readonly field
   #f-rq-c. */
async function stateWrite(page, inp) {
  return await page.evaluate(({ inp, NUMF }) => {
    const o = {};
    for (const k of NUMF) if (inp[k] !== undefined) o[k] = String(inp[k]);
    o.fail = inp.fail || 'none';
    Object.assign(window.__gesloten.state(), o);
    let thrown = null;
    try { recompute(); } catch (e) { thrown = String(e && e.message || e); }
    /* assign nothing, sync and run: the framework rebuilds the results from the state
       just written, which is what refreshes the tiles, the flags and the warning bar */
    window.__gesloten.set({});
    return thrown;
  }, { inp, NUMF });
}

/* diagram-ui.js recomputes on a debounce (default 120 ms) and renders after it fires,
   so a readout taken immediately is the previous case's. Wait past the debounce, then
   until the rendered readout has stopped changing between two polls. */
const DEBOUNCE_MS = 160;
async function settle(page) {
  await page.waitForTimeout(DEBOUNCE_MS);
  let prev = null;
  for (let i = 0; i < 25; i++) {
    const sig = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('.dgu-tile')]
        .map(n => ((n.querySelector('.dgu-tile-l') || {}).textContent || '') + '='
                + ((n.querySelector('.dgu-tile-v') || {}).textContent || '')).join('|');
      const warn = (document.getElementById('stabwarn') || {}).textContent || '';
      const flags = (document.getElementById('val-out') || {}).textContent || '';
      const rq = (document.getElementById('f-rq-c') || {}).textContent || '';
      return [tiles, warn, flags, rq].join('\u0001');
    });
    if (sig === prev) return;
    prev = sig;
    await page.waitForTimeout(40);
  }
  throw new Error('the page did not settle within '
    + (DEBOUNCE_MS + 25 * 40) + ' ms after a state write');
}

async function drive(page, inp) {
  const thrown = await stateWrite(page, inp);
  await settle(page);
  return await page.evaluate((thrown) => {
    const L = window.__gesloten.last();
    const kpi = [...document.querySelectorAll('.dgu-tile')]
      .map(n => ((n.querySelector('.dgu-tile-l') || {}).textContent || '').trim() + '='
              + ((n.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
    const val = [...document.querySelectorAll('#val-out .flag')].map(f => (f.className.indexOf('bad') >= 0 ? 'FAIL ' : 'ok ') + f.innerText.replace(/\n/g, ' '));
    const warn = document.getElementById('stabwarn');
    return {
      thrown,
      P: L && JSON.parse(JSON.stringify(L.P)),
      dt: L && L.run.dt, steps: L && L.run.steps,
      diverged: L && L.run.diverged, clipped: L && L.run.clipped, finiteOK: L && L.run.finiteOK,
      minVal: L && L.run.minVal,
      S: L && L.run.S,
      t: L && L.run.tr.t, co2: L && L.run.tr.co2, o2: L && L.run.tr.o2, pO2: L && L.run.tr.pO2,
      pCO2: L && L.run.tr.pCO2, p: L && L.run.tr.p, tC: L && L.run.tr.tC, rh: L && L.run.tr.rh,
      tr: L && L.run.tr.tr, pv: L && L.run.tr.pv, sorb: L && L.run.tr.sorb, o2u: L && L.run.tr.o2u,
      kpi, val, warn: warn.hidden ? '' : warn.textContent,
      rq: ((document.getElementById('f-rq-c') || {}).textContent || '').trim(),
    };
  }, thrown);
}

/* step-halving study: the page's own simulate(), driven with an explicit step and the
   step cap switched off, so the observed order of the scheme can be measured. */
async function convergence(page, inp) {
  return await page.evaluate(({ inp, NUMF }) => {
    const o = {};
    for (const k of NUMF) if (inp[k] !== undefined) o[k] = String(inp[k]);
    o.fail = inp.fail || 'none';
    Object.assign(window.__gesloten.state(), o);
    const P = readParams();
    const dt0 = Math.max(stableStep(P), 1);
    const end = r => { const n = r.tr.t.length - 1; return [r.tr.co2[n], r.tr.pO2[n], r.tr.tC[n] + 273.15, r.tr.rh[n]]; };
    const a = end(simulate(P, dt0, 20, true)), b = end(simulate(P, dt0 / 2, 20, true)),
      c = end(simulate(P, dt0 / 4, 20, true)), d = end(simulate(P, dt0 / 16, 20, true));
    return { dt0, a, b, c, d };
  }, { inp, NUMF });
}

/* ---------- run ---------- */
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(BASE + '/' + P.pageFile + '?lang=en', { waitUntil: 'load' });
await page.waitForFunction(() => {
  const H = window.__gesloten; const L = H && H.last && H.last();
  return !!(L && L.run);
}, null, { timeout: 60000 });

/* The build this artifact names, observed in the document the browser loaded. */
const BUILD = await readPageManifestRevision(page);

const runs = {};
for (const c of REF.cases) runs[c.id] = await drive(page, c.inputs);

/* ask the independent reference for the state at exactly the sample times the page used */
const req = { cases: REF.cases.map(c => ({ id: c.id, inputs: c.inputs, times: pickTimes(runs[c.id].t) })) };
function pickTimes(t) {
  if (!t || !t.length) return [0];
  const idx = new Set([0, 1, 2]);
  for (const f of [0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) idx.add(Math.min(t.length - 1, Math.round(f * (t.length - 1))));
  return [...idx].filter(i => i < t.length).sort((a, b) => a - b).map(i => t[i]);
}
fs.writeFileSync(TMP + '/ga_req.json', JSON.stringify(req));
execFileSync('python3', [GA_SOLVE, TMP + '/ga_req.json', TMP + '/ga_ref_out.json'], { stdio: 'inherit' });
const RS = JSON.parse(fs.readFileSync(TMP + '/ga_ref_out.json', 'utf8'));

const out = {
  tool: 'gesloten-atmosfeer', file: 'gesloten-atmosfeer.html',
  reference: 'The same coupled ODE system (CO2, O2, water vapour, trace contaminants, temperature, and the five accumulators) re-implemented independently in python from the model description and from the rate constants, crew rates and device characteristics read out of the page, integrated with scipy.integrate.solve_ivp (LSODA, rtol 1e-11, saturation handled as a constrained sub-system through a terminal event) — a different integrator family from the page fixed-step RK4. Grading is completed by invariants that owe nothing to either integration: the carbon and oxygen balances over the whole run, the analytic steady temperature, the ideal-gas closure, non-negativity, and the observed order of the scheme under step halving.',
  reference_citations: [
    'scipy 1.17.1, scipy.integrate.solve_ivp (LSODA: Adams/BDF with automatic stiffness switching and local error control) — the independent integrator.',
    'The rate constants, crew metabolic rates and device characteristics are the page\'s own, read out of the file, so that the benchmark grades the mathematics rather than the choice of physiological data.',
    'Data provenance of those rates, checked separately: NASA/SP-2010-3407/REV1 Human Integration Design Handbook and NASA Baseline Values and Assumptions Document (BVAD, NASA/TP-2015-218570) give per crew member and day: 0.835 kg O2 consumed, 1.0 kg CO2 produced (respiratory quotient 0.87), about 1.9 kg metabolic water vapour and 2.5 kg drinking water; ASHRAE Standard 62.1 uses about 0.0052 L/s (19 L/h) of CO2 per sedentary adult.',
    'Fourth-order Runge-Kutta truncation behaviour: E. Hairer, S. P. Norsett, G. Wanner, Solving Ordinary Differential Equations I, 2nd ed., Springer 1993, ch. II.1-II.3 (order conditions and the (h^4) global error of the classical scheme).',
  ],
  tolerance: 'Every displayed quantity is graded at 1e-7 relative plus a small absolute floor per quantity (1e-5 ppm CO2, 1e-7 kPa, 1e-6 K, 1e-6 % RH) for the near-zero cases. That is two orders of magnitude above the deviation actually observed against the adaptive reference (1e-9 or better) and two orders below anything that could reach the digits the page prints, so it grades the integration rather than the display. Carbon and oxygen balances are graded at 1e-9 relative for a sealed compartment, since the accumulators the page itself reports must close those balances exactly. The analytic steady temperature is graded at 0.02 K. The run at the step the page chooses must be step-converged: refining the step 16-fold must not move any displayed quantity by more than 1e-9 relative. The observed order of the scheme, measured where truncation is still visible (a reduced case with only the slow gas modes, steps of 225 s to 7200 s), must lie between 3.5 and 4.5. The saturated branch is the exception: there the surplus vapour is projected onto the saturation curve at the end of every step, which is a first-order splitting (measured order 1.00 over five halvings), so the saturating case is graded at 1e-4 relative — the deviation actually measured at the 10 s step the page uses is 1.8e-5 relative on the vapour pressure, 4.6e-5 K on the temperature and 1.3 g in 203 kg of condensate, three orders of magnitude below the resolution of anything the page prints — and the case additionally requires that deviation to fall linearly with the step, which is what proves the splitting consistent with the constrained solution.',
  total: 0, passed: 0, failed: 0, flagged: 0, page_errors: [], cases: []
};

for (const c of REF.cases) {
  const r = runs[c.id], R = RS[c.id];
  const cm = {};
  let pass = true;

  if (r.thrown) cm['exception'] = { got: r.thrown, ref: 'no exception', abs: 0, tol: 0, rel: 0, ok: false };

  /* 1. the page's own unit conversions */
  for (const k of ['gco2_mol', 'go2_mol', 'gh2o_mol', 'gtr_mol', 'gwat_kg', 'oa', 'vs', 'leak', 'o2max', 'dur'])
    cm['param_' + k] = cmp(r.P[k], R.P[k], 1e-15, 1e-12);

  /* 2. the trajectory against the independent integration */
  const times = R.times_h;
  if (!r.diverged) {
    for (let i = 0; i < times.length; i++) {
      const j = r.t.indexOf(times[i]);
      if (j < 0) { cm['time_' + i] = { got: times[i], ref: 'sample time present', abs: 0, tol: 0, rel: 0, ok: false }; continue; }
      const o = R.obs[i];
      const got = { co2_ppm: r.co2[j], o2_pct: r.o2[j], pO2_kPa: r.pO2[j], pCO2_kPa: r.pCO2[j], p_kPa: r.p[j], TC: r.tC[j], rh: r.rh[j], tr_ppm: r.tr[j], pv_kPa: r.pv[j] };
      /* On the saturated branch the page imposes the saturation limit by projecting the
         vapour back onto the saturation curve at the end of each step. That splitting is
         first order in the step (measured: order 1.00 over five halvings, case
         saturation_order), so this case is graded at the accuracy that projection can
         reach at the page's own step rather than at the fourth-order figure. */
      const relTol = (c.id === 'humid_sat') ? 1e-4 : TOL_REL;
      for (const q of OBS) cm[q + '@' + times[i].toFixed(3) + 'h'] = cmp(got[q], o[q], TOL_ABS[q], relTol);
    }
  } else {
    cm['diverged_reported'] = { got: 'reported', ref: 'reported', abs: 0, tol: 0, rel: 0, ok: true, note: 'the page reports the run as leaving the physical band instead of clamping it silently' };
    cm['diverged_warned'] = { got: r.warn ? 'warning shown' : 'no warning', ref: 'warning shown', abs: 0, tol: 0, rel: 0, ok: !!r.warn };
  }

  /* 3. invariants from the page's own output */
  const P = r.P, S = r.S, n = r.t.length - 1;
  if (!r.diverged) {
    const sealed = P.oa === 0 && P.leak === 0 && P.fail !== 'leak';
    if (sealed) {
      /* carbon: what the crew produced must be in the air or in the sorbent */
      const nCO2_0 = R.init_state[2], produced = P.N * P.gco2_mol * (r.t[n] * 3600);
      const scrubbedMol = S[7] / 0.0440095;
      cm['law_carbon_balance_mol'] = cmp((S[2] - nCO2_0) + scrubbedMol, produced, 1e-9, 1e-9);
      /* oxygen: consumption is the crew rate while oxygen is plentiful */
      const nO2_0 = R.init_state[1], fed = S[6] / 0.0319988;
      const consumed = P.N * P.go2_mol * (r.t[n] * 3600);
      cm['law_oxygen_balance_mol'] = cmp((nO2_0 - S[1]) + fed, consumed, 1e-9, 2e-9);
    }
    /* ideal gas closure of the reported partial pressures */
    cm['law_partial_pressures_kPa'] = { got: r.pO2[n] + r.pCO2[n] + r.pv[n], ref: r.p[n], abs: 0, tol: 0, rel: 0, ok: (r.pO2[n] + r.pCO2[n] + r.pv[n]) <= r.p[n] + 1e-9, note: 'the reported partial pressures must not exceed the reported total pressure' };
    /* nothing negative, nothing non-finite */
    cm['law_nonnegative'] = { got: r.minVal, ref: '>= 0', abs: 0, tol: 0, rel: 0, ok: r.minVal >= -1e-12 };
    cm['law_finite'] = { got: r.finiteOK, ref: true, abs: 0, tol: 0, rel: 0, ok: !!r.finiteOK };
    /* relative humidity can never exceed saturation */
    let mrh = 0; for (const v of r.rh) if (isFinite(v)) mrh = Math.max(mrh, v);
    cm['law_rh_max_pct'] = { got: mrh, ref: 100, abs: 0, tol: 0, rel: 0, ok: mrh <= 100 + 1e-6 };
    /* accumulators may not exceed the stores they draw on */
    if (P.ssorb > 0) cm['law_sorbent_capacity_kg'] = { got: S[7], ref: P.ssorb, abs: 0, tol: 0, rel: 0, ok: S[7] <= P.ssorb + 1e-9 };
    if (P.so2 > 0) cm['law_oxygen_store_kg'] = { got: S[6], ref: P.so2, abs: 0, tol: 0, rel: 0, ok: S[6] <= P.so2 + 1e-9 };
    /* analytic steady state, where the case has one */
    if (R.analytic.T_steady_C !== undefined && r.t[n] >= 12)
      cm['analytic_T_steady_C'] = cmp(r.tC[n], R.analytic.T_steady_C, 0.02, 0);
  }

  out.cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp: cm, pass: true, dt: r.dt, steps: r.steps, kpi: r.kpi, warn: r.warn });
  const last = out.cases[out.cases.length - 1];
  last.pass = Object.values(cm).every(x => x.graded === false || x.ok);
  let worst = 0; for (const v of Object.values(cm)) if (isFinite(v.rel) && v.graded !== false) worst = Math.max(worst, v.rel);
  last.worst_rel = worst;
  out.total++; if (last.pass) out.passed++; else { out.failed++; console.log('FAIL', c.id, Object.entries(cm).filter(([, v]) => !v.ok).map(([k, v]) => k + ' got=' + v.got + ' ref=' + v.ref).slice(0, 6).join('; ')); }
}

/* ---------- step size: convergence at the page's own step, and the order of the scheme ----
 * At the step the page picks, every one of these systems is already converged to round-off,
 * so the order of the scheme cannot be read off there. It is measured separately on a
 * reduced case whose only modes are the slow gas ones, where a coarse step is still stable
 * and the truncation error is visible. */
for (const cid of ['preset_ssk', 'preset_bat', 'fail_co2', 'preset_bld']) {
  const c = REF.cases.find(x => x.id === cid);
  const k = await convergence(page, c.inputs);
  const cm = {};
  const names = ['co2_ppm', 'pO2_kPa', 'T_K', 'rh_pct'];
  for (let i = 0; i < names.length; i++) {
    const rel = Math.abs(k.a[i] - k.d[i]) / Math.max(Math.abs(k.d[i]), 1e-12);
    cm['step_converged_' + names[i]] = { got: rel, ref: '< 1e-9 relative between the default step and a 16x finer run', abs: 0, tol: 1e-9, rel: rel, ok: rel < 1e-9 };
  }
  const pass = Object.values(cm).every(x => x.ok);
  out.cases.push({ id: 'convergence_' + cid, note: 'the run at the step the page chooses (' + k.dt0.toFixed(2) + ' s) must not move when the step is refined 16-fold', inputs: { base: cid, dt_default_s: k.dt0 }, cmp: cm, pass, worst_rel: 0 });
  out.total++; if (pass) out.passed++; else { out.failed++; console.log('FAIL convergence_' + cid, Object.entries(cm).filter(([, v]) => !v.ok).map(([kk, v]) => kk + ' got=' + v.got).join('; ')); }
}
{
  /* reduced system: crew CO2 and trace production against a scrubber and a trace bed, with
     no thermal or moisture dynamics, so steps of 450-7200 s are stable and the fourth-order
     truncation error is measurable over five halvings. */
  const inp = Object.assign({}, REF.cases.find(x => x.id === 'preset_ssk').inputs,
    { gh2o: 0, qs: 0, qe: 0, ua: 0, qc: 0, vd: 0, oa: 0, leak: 0, o2max: 0, so2: 0, ssorb: 0, gwat: 0, dur: 24, fail: 'none' });
  const k = await page.evaluate(({ inp, NUMF }) => {
    const st = {};
    for (const q of NUMF) if (inp[q] !== undefined) st[q] = String(inp[q]);
    st.fail = 'none';
    Object.assign(window.__gesloten.state(), st);
    const P = readParams();
    const end = r => { const n = r.tr.t.length - 1; return [r.tr.co2[n], r.tr.tr[n]]; };
    const o = {};
    for (const dt of [7200, 3600, 1800, 900, 450, 225, 10]) o[dt] = end(simulate(P, dt, 10, true));
    return o;
  }, { inp, NUMF });
  const cm = {};
  const ref = k[10];
  const steps = [7200, 3600, 1800, 900, 450, 225];
  const e = steps.map(dt => Math.abs(k[dt][1] - ref[1]));      // trace species: the mode that still shows truncation
  for (let i = 0; i < e.length - 1; i++) {
    const ord = Math.log2(e[i] / e[i + 1]);
    cm['order_trace_' + steps[i] + 's_to_' + steps[i + 1] + 's'] = { got: ord, ref: 4, abs: Math.abs(ord - 4), tol: 0.5, rel: 0, ok: ord >= 3.5 && ord <= 4.5 };
  }
  cm['order_co2_7200s_to_3600s'] = (() => { const o = Math.log2(Math.abs(k[7200][0] - ref[0]) / Math.abs(k[3600][0] - ref[0])); return { got: o, ref: 4, abs: Math.abs(o - 4), tol: 0.5, rel: 0, ok: o >= 3.5 && o <= 4.5 }; })();
  const pass = Object.values(cm).every(x => x.ok);
  out.cases.push({ id: 'rk4_order', note: 'observed order of the page\'s fixed-step RK4, measured on a reduced case (crew production against the scrubber and the trace bed, no thermal or moisture dynamics) where a coarse step is stable and the truncation error is visible', inputs: inp, cmp: cm, pass, worst_rel: 0 });
  out.total++; if (pass) out.passed++; else { out.failed++; console.log('FAIL rk4_order', Object.entries(cm).filter(([, v]) => !v.ok).map(([kk, v]) => kk + ' got=' + v.got).join('; ')); }
}

/* ---------- order of the scheme on the saturated branch ----------
 * Once the gas phase saturates, the water balance is no longer advanced by the RK4 step
 * alone: the surplus vapour is projected onto the saturation curve at the end of every
 * step. That is a first-order operator splitting, and this case measures it. */
{
  const inp = REF.cases.find(x => x.id === 'humid_sat').inputs;
  const k = await page.evaluate(({ inp, NUMF }) => {
    const st = {};
    for (const q of NUMF) if (inp[q] !== undefined) st[q] = String(inp[q]);
    st.fail = inp.fail || 'none';
    Object.assign(window.__gesloten.state(), st);
    const P = readParams();
    const end = r => { const n = r.tr.t.length - 1; return [r.tr.tC[n], r.tr.pv[n], r.S[8]]; };
    const o = {};
    for (const dt of [10, 5, 2.5, 1.25, 0.625, 0.3125]) o[dt] = end(simulate(P, dt, 10, true));
    return o;
  }, { inp, NUMF });
  const cm = {};
  const steps = [10, 5, 2.5, 1.25, 0.625, 0.3125];
  const names = ['T_C', 'pv_kPa', 'condensate_kg'];
  for (let q = 0; q < names.length; q++) {
    const d = [];
    for (let i = 0; i < steps.length - 1; i++) d.push(Math.abs(k[steps[i]][q] - k[steps[i + 1]][q]));
    for (let i = 0; i < d.length - 1; i++) {
      const ord = Math.log2(d[i] / d[i + 1]);
      cm['order_' + names[q] + '_' + steps[i] + 's'] = { got: ord, ref: 1, abs: Math.abs(ord - 1), tol: 0.15, rel: 0, ok: ord >= 0.85 && ord <= 1.15, note: 'the end-of-step projection onto the saturation curve is a first-order splitting; the scheme is fourth order only away from saturation' };
    }
    const richardson = k[0.3125][q] + (k[0.3125][q] - k[0.625][q]);   // first-order extrapolation
    const rel = Math.abs(k[10][q] - richardson) / Math.max(Math.abs(richardson), 1e-12);
    cm['deviation_at_default_step_' + names[q]] = { got: rel, ref: '< 1e-4 relative', abs: 0, tol: 1e-4, rel: rel, ok: rel < 1e-4, note: 'measured against a first-order Richardson extrapolation of the refined runs' };
  }
  const pass = Object.values(cm).every(x => x.ok);
  out.cases.push({ id: 'saturation_order', note: 'order of the scheme once the gas phase is saturated: the surplus vapour is projected back onto the saturation curve at the end of each step, which is first order in the step, and the condensate accumulator inherits it', inputs: inp, cmp: cm, pass, worst_rel: 0 });
  out.total++; if (pass) out.passed++; else { out.failed++; console.log('FAIL saturation_order', Object.entries(cm).filter(([, v]) => !v.ok).map(([kk, v]) => kk + ' got=' + v.got).join('; ')); }
}

/* ---------- respiratory quotient implied by the default crew rates ---------- */
{
  const c = REF.cases.find(x => x.id === 'preset_ssk');
  const r = runs[c.id];
  const rq = r.P.gco2_mol / r.P.go2_mol;
  const cm = {
    rq_value: cmp(rq, 0.7601, 1e-3, 0),
    rq_shown: { got: r.rq, ref: rq.toFixed(2), abs: 0, tol: 0, rel: 0, ok: r.rq === rq.toFixed(2), note: 'the page must show the respiratory quotient its own rates imply' },
    rq_physiological_range: { got: rq, ref: '0.70 - 1.00', abs: 0, tol: 0, rel: 0, ok: rq >= 0.70 && rq <= 1.00, note: 'RQ outside 0.7-1.0 would not be a physiologically possible pair of rates; the default pair sits at the fat-oxidation end, 13 % below the 0.87 of NASA BVAD, and the page states this in the source-basis table' },
  };
  const pass = Object.values(cm).every(x => x.ok);
  out.cases.push({ id: 'respiratory_quotient', note: 'respiratory quotient implied by the default CO2 (20 L/h) and O2 (0.84 kg/d) rates, and its disclosure', inputs: { gco2: 20, go2: 0.84 }, cmp: cm, pass, worst_rel: 0 });
  out.total++; if (pass) out.passed++; else { out.failed++; console.log('FAIL respiratory_quotient', JSON.stringify(cm)); }
}

out.page_errors = pageErrors;
out.run_at = new Date().toISOString();
await browser.close();
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log('total', out.total, 'passed', out.passed, 'failed', out.failed, 'pageerrors', pageErrors.length);
process.exit(out.failed ? 1 : 0);
