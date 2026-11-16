// Benchmark driver — doppler.html (U-238 6.673 eV capture resonance, Doppler broadening)
// Reference: bench-src/ref/doppler_ref.json, produced by bench-src/ref/gen_doppler_ref.py
// (independent python: SLBW psi function via adaptive quadrature AND via scipy.special.wofz).
//
// 2026-10-02 adaptation (locators and transport only; no tolerance, case, reference value
// or comparison was changed):
//   usage: node run_doppler.mjs [--base <origin>] [--site <tree>] [--out <artifact>.json]
//   e.g.   node run_doppler.mjs --base http://127.0.0.1:8321 --out work/doppler.json
//   A bare positional origin is still accepted. Every other path defaults to this
//   file's own tree: the reference to bench-src/ref, the artifact to
//   <siteRoot>/benchmarks/doppler.json and the control file beside it.
// The page was ported to the DiagramUI shell after the 2026-08-11 run, so the controls
// and the readout the old driver addressed are gone from the rendered page:
//   - the temperature box #temp exists only in bootBare(), the diagram-ui.js-missing
//     fallback. It is driven through the framework control #f-T-c instead.
//   - the readout is no longer #readout .stat[data-q]; it is .dgu-tile, read by the
//     tile's own English label.
//   - the resonance-parameter block #params is now the footer note .dop-note.
// Every case asserts, from window.Diagram.record.build(), that the page state really is
// the temperature the case names before any output is read, and throws if it is not.
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is read out of the live DOM of the page the
   browser loaded and passed to stampProvenance(), which writes build,
   manifest_revision, reference_provenance and provenance_note, and refuses to write
   anything when the observed build is absent or disagrees with the page on disk. This
   artifact dates its own run, so the stamp keeps that run_at. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_doppler_ref.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 221 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* Every path resolves relative to this file's own tree. */
const P = benchPaths({ name: 'doppler', page: 'doppler.html', ref: 'doppler_ref.json' });

/* This driver reaches its page over http, as it did before: --base or BENCH_BASE sets
   the origin, a bare positional argument is still read, and the default is unchanged. */
const BASE = (P.base || P.flags._[0] || 'http://127.0.0.1:8321').replace(/\/+$/, '');
const TOOL = P.pageFile;

const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const OUT = P.out;
/* The control file is this driver's second output and sits beside the artifact, as it
   did when both were written into one output directory; --out2 or BENCH_OUT2 moves it. */
const OUT2 = P.out2 || path.join(path.dirname(OUT), 'doppler.control.json');
const URL0 = BASE + '/' + TOOL;

const TOL_REC = 1e-4;      // relative, record (full double precision) vs exact psi
const pageErrors = [];
const consoleAll = [];
const cases = [];

function cmpAdd(cmp, name, got, ref, tol) {
  const rel = Math.abs(ref) > 0 ? Math.abs(got - ref) / Math.abs(ref) : Math.abs(got - ref);
  cmp[name] = { got, ref, rel, ok: rel <= tol, tol };
  return cmp[name].ok;
}
function finish(id, note, inputs, cmp, extra) {
  let worst = 0, pass = true;
  for (const k of Object.keys(cmp)) { worst = Math.max(worst, cmp[k].rel); if (!cmp[k].ok) pass = false; }
  cases.push(Object.assign({ id, note, inputs, cmp, worst_rel: worst, pass }, extra || {}));
}
const num = s => parseFloat(String(s).replace(/[,\s ]/g, '').replace(/[^0-9eE+.\-].*$/, ''));

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  consoleAll.push(m.type() + ': ' + m.text());
  if (m.type() === 'error') pageErrors.push('console: ' + m.text());
});
await page.goto(URL0 + '?lang=en');
// the framework shell replaces #readout .stat with .dgu-tile
await page.waitForFunction(() => !!window.Diagram && !!window.DiagramUI
  && !!document.querySelector('.dgu-tile')
  && window.Diagram.record.build() !== null, null, { timeout: 60000 });

/* The build this artifact names, observed in the document the browser loaded. */
const BUILD = await readPageManifestRevision(page);

async function setT(T) {
  await page.evaluate(t => {
    // #temp lives only in the bare fallback; the framework control is #f-T-c
    const e = document.getElementById('f-T-c');
    if (!e) throw new Error('temperature control #f-T-c is absent from the rendered page');
    e.focus();
    e.value = String(t);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.blur();
  }, T);
  // compute:'live' is debounced and the record reads the solved state (LAST.T), so wait
  // for the page's own record to carry the new temperature rather than for a fixed delay
  try {
    await page.waitForFunction(t => {
      const r = window.Diagram.record.build();
      return !!r && Number(r.inputs.T_fuel) === Number(t);
    }, T, { timeout: 15000 });
  } catch (e) { /* fall through to the assertion, which reports the actual state */ }
  // INPUT ASSERTION: the page's own state must be the temperature this case names
  const st = await page.evaluate(() => ({
    rec: window.Diagram.record.build().inputs,
    ser: window.Diagram.state.current(),
    ctl: document.getElementById('f-T-c').value
  }));
  if (Number(st.rec.T_fuel) !== Number(T) || Number(st.ser.T) !== Number(T)
      || Number(String(st.ctl).replace(/[\s ]/g, '')) !== Number(T))
    throw new Error('input not applied: asked T = ' + T + ' K, page state is '
      + JSON.stringify({ record: st.rec, serialized: st.ser, control: st.ctl }));
  return st;
}
const readRecord = () => page.evaluate(() => window.Diagram.record.build());
// the printed readout: .dgu-tile, located by the tile's own English label
const TILE = { T: 'Temperature', DeltaD: 'Doppler width', peak: 'Peak σγ(T)',
               peak0K: '0 K peak', fwhm: 'FWHM', area: 'Area ∫σ dE' };
const readStats = async () => {
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.dgu-tile')].map(t => ({
    l: ((t.querySelector('.dgu-tile-l') || {}).innerText || '').replace(/\?$/, '').trim(),
    v: ((t.querySelector('.dgu-tile-v') || {}).innerText || '').trim()
  })));
  const out = {};
  for (const [k, label] of Object.entries(TILE)) {
    // the tile label is upper-cased by the framework's CSS, so innerText is matched case-insensitively
    const hit = tiles.filter(t => t.l.toLowerCase().startsWith(label.toLowerCase()));
    if (hit.length !== 1)
      throw new Error('readout tile "' + label + '" matched ' + hit.length
        + ' tiles; tiles present: ' + JSON.stringify(tiles.map(t => t.l)));
    out[k] = hit[0].v;
  }
  return out;
};

// ---------------------------------------------------------------- per-temperature cases
const peaks = [], areas = [];
for (const rc of REF.cases) {
  const T = rc.T;
  await setT(T);
  const rec = await readRecord();
  const o = rec.outputs, st = await readStats();
  if (num(st.T) !== T)
    throw new Error('printed temperature tile reads ' + st.T + ' while the case names ' + T + ' K');

  // (a) full-precision calculation record vs the exact psi solution
  const cmp = {};
  cmpAdd(cmp, 'Delta_D_meV', o.Delta_D, rc.Delta_D * 1000, TOL_REC);
  cmpAdd(cmp, 'xi', o.xi, rc.xi, TOL_REC);
  cmpAdd(cmp, 'sigma_peak_T', o.sigma_peak_T, rc.sigma_peak, TOL_REC);
  cmpAdd(cmp, 'E_peak', o.E_peak, rc.E_peak, 1e-4);
  cmpAdd(cmp, 'fwhm_meV', o.fwhm, rc.fwhm * 1000, TOL_REC);
  cmpAdd(cmp, 'resonance_integral', o.resonance_integral, rc.area, TOL_REC);
  cmpAdd(cmp, 'sigma_0', o.sigma_0, REF.parameters.sigma_0, 1e-9);
  cmpAdd(cmp, 'sigma_peak_0K', o.sigma_peak_0K, REF.parameters.sigma_peak_0K, 1e-9);
  for (const E of REF.sample_energies) {
    const k = 'sigma_gamma_at_' + E.toFixed(3) + '_eV';
    cmpAdd(cmp, 'sigma(' + E.toFixed(3) + ')', o[k], rc.sigma[E.toFixed(3)], TOL_REC);
  }
  finish('rec_T' + T, 'calculation record vs exact SLBW psi solution at T = ' + T + ' K',
    { T_fuel: T }, cmp, { crosscheck: { psi_quadrature_vs_wofz: rc.crosscheck_psi_routes } });

  // (b) the numbers actually printed on the page, at their printed precision
  const cmp2 = {};
  cmpAdd(cmp2, 'T_K', num(st.T), T, 1e-12);
  cmpAdd(cmp2, 'Delta_D_meV', num(st.DeltaD), rc.Delta_D * 1000, 0.005 / (rc.Delta_D * 1000));
  cmpAdd(cmp2, 'peak_barn', num(st.peak), rc.sigma_peak, 0.5 / rc.sigma_peak);
  cmpAdd(cmp2, 'peak0K_barn', num(st.peak0K), REF.parameters.sigma_peak_0K, 0.5 / REF.parameters.sigma_peak_0K);
  cmpAdd(cmp2, 'fwhm_meV', num(st.fwhm), rc.fwhm * 1000, 0.005 / (rc.fwhm * 1000));
  cmpAdd(cmp2, 'area_barn_eV', num(st.area), rc.area, 0.005 / rc.area);
  finish('readout_T' + T, 'printed readout at T = ' + T + ' K, tolerance = half of the last printed digit',
    { T_fuel: T }, cmp2);

  peaks.push([T, o.sigma_peak_T]);
  areas.push([T, o.resonance_integral]);
}

// ---------------------------------------------------------------- resonance-integral conservation
{
  const vals = areas.map(a => a[1]);
  const mn = Math.min(...vals), mx = Math.max(...vals), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const spread = (mx - mn) / mean;
  const cmp = {};
  cmpAdd(cmp, 'spread_over_300_3000K', spread, 0, 2e-5);
  cmpAdd(cmp, 'mean_vs_reference', mean, REF.cases[0].area, TOL_REC);
  cmpAdd(cmp, 'fraction_of_infinite_BW_area', mean / REF.analytic_area_infinite, 0.992284, 1e-4);
  finish('area_conservation',
    'the E0 +/- 1 eV resonance integral must be invariant under broadening; the infinite-range Breit-Wigner area is (pi/2) sigma_peak Gamma = ' +
    REF.analytic_area_infinite.toFixed(3) + ' barn eV', { T_fuel: '300..3000 K' }, cmp);
}

// ---------------------------------------------------------------- peak ~ 1/sqrt(T)
{
  const cmp = {};
  for (const [T, p] of peaks) {
    const rc = REF.cases.find(c => c.T === T);
    cmpAdd(cmp, 'peak*sqrt(T)@' + T, p * Math.sqrt(T), rc.sigma_peak * Math.sqrt(T), TOL_REC);
  }
  // asymptotic 1/sqrt(T): psi(xi,0) -> sqrt(pi)/2 * xi as xi -> 0, so peak*sqrt(T) tends to a constant
  const first = peaks[0][1] * Math.sqrt(peaks[0][0]), last = peaks[peaks.length - 1][1] * Math.sqrt(peaks[peaks.length - 1][0]);
  cmp['peak_sqrtT_drift_300_to_3000K'] = { got: last / first, ref: 1.0, rel: Math.abs(last / first - 1), ok: Math.abs(last / first - 1) < 0.25, tol: 0.25 };
  finish('peak_scaling',
    'peak height falls as roughly 1/sqrt(T): peak*sqrt(T) is constant to within the finite-xi correction of psi(xi,0)',
    { T_fuel: '300..3000 K' }, cmp);
}

// ---------------------------------------------------------------- wing behaviour
{
  await setT(3000);
  const o3000 = (await readRecord()).outputs;
  await setT(300);
  const o300 = (await readRecord()).outputs;
  const cmp = {};
  // Far from the resonance the broadened Lorentzian tail follows the moment expansion
  //   (L*G)(u)/L(u) = 1 + 3 r + 15 r^2 + 105 r^3 + ...,  r = (s/u)^2, u = E - E0, s = Delta_D/sqrt(2),
  // from E[f(u-t)] = SUM f^(2m)(u) s^2m (2m-1)!!/(2m)! with f = (Gamma/2)^2/u^2. The series is
  // asymptotic: the reference keeps terms to r^2 and the tolerance is twice the first neglected
  // term (105 r^3), with a 5e-6 floor for the neglected (Gamma/2u)^2 corrections to the tail.
  const sOf = T => REF.cases.find(c => c.T === T).Delta_D / Math.SQRT2;
  for (const E of [5.700, 7.600]) {
    const k = 'sigma_gamma_at_' + E.toFixed(3) + '_eV';
    const x = 2 * (E - REF.parameters.E0) / REF.parameters.Gamma;
    const bw = REF.parameters.sigma_peak_0K * Math.sqrt(REF.parameters.E0 / E) / (1 + x * x);
    for (const [T, o] of [[300, o300], [3000, o3000]]) {
      const r = Math.pow(sOf(T) / (E - REF.parameters.E0), 2);
      cmpAdd(cmp, 'sigma(' + E + ')/BW_0K@' + T + 'K', o[k] / bw, 1 + 3 * r + 15 * r * r, Math.max(5e-6, 210 * r * r * r));
    }
  }
  // near-wing: broadening must raise the wings (the other half of "peak down, wings up")
  const w = 'sigma_gamma_at_6.500_eV';
  cmp['wing_rise_6.5eV_3000K_over_300K'] = (() => {
    const r = o3000[w] / o300[w];
    return { got: r, ref: REF.cases[REF.cases.length - 1].sigma['6.500'] / REF.cases[0].sigma['6.500'], rel: 0, ok: true, tol: TOL_REC };
  })();
  const rr = cmp['wing_rise_6.5eV_3000K_over_300K'];
  rr.rel = Math.abs(rr.got - rr.ref) / rr.ref; rr.ok = rr.rel <= TOL_REC;
  finish('wings',
    'wing behaviour: sigma returns to the unbroadened Breit-Wigner tail far from E0, and rises with T close in',
    { T_fuel: '300 and 3000 K' }, cmp);
}

// ---------------------------------------------------------------- resonance parameters on the page
{
  await setT(900);
  // #params was the pre-port node; the same paramsHTML() block is now the footer note
  const txt = await page.evaluate(() => {
    const n = [...document.querySelectorAll('.dop-note')];
    if (!n.length) throw new Error('resonance-parameter note .dop-note is absent from the rendered page');
    return n.map(e => e.textContent).join('\n');
  });
  const g = re => { const m = txt.match(re); return m ? parseFloat(m[1].replace(/[\s ,]/g, '')) : NaN; };
  const cmp = {};
  cmpAdd(cmp, 'E0_eV', g(/E0\s*=\s*([\d.]+)\s*eV/), REF.parameters.E0, 1e-9);
  cmpAdd(cmp, 'Gamma_n_meV', g(/Γn\s*=\s*([\d.]+)\s*meV/), REF.parameters.Gamma_n * 1000, 1e-6);
  cmpAdd(cmp, 'Gamma_gamma_meV', g(/Γγ\s*=\s*([\d.]+)\s*meV/), REF.parameters.Gamma_gamma * 1000, 1e-6);
  cmpAdd(cmp, 'Gamma_meV', g(/Γ\s*=\s*([\d.]+)\s*meV/), REF.parameters.Gamma * 1000, 1e-6);
  cmpAdd(cmp, 'A_mass_ratio', g(/mn\s*=\s*([\d.]+)/), REF.parameters.mass_ratio_A, 1e-6);
  cmpAdd(cmp, 'sigma_0_barn', g(/σ0\s*=\s*4πƛ²gΓn\/Γ\s*=\s*([\d\s,]+)\s*barn/), REF.parameters.sigma_0, 5e-5);
  cmpAdd(cmp, 'sigma_peak_0K_barn', g(/σγ\(E0\)\s*=\s*σ0ΓγΓ?\/?Γ?\s*=\s*([\d\s,]+)\s*barn/), REF.parameters.sigma_peak_0K, 5e-5);
  finish('resonance_parameters',
    'resonance parameters printed by the page vs ENDF/B-VIII.0 (ORNL/TM-2005/241 Table 8) and the SLBW peak formula sigma_0 = 4 pi lambdabar^2 g Gamma_n/Gamma',
    {}, cmp);
}

// ---------------------------------------------------------------- permalink round trip
{
  await setT(1650);
  const before = await readRecord();
  const link = await page.evaluate(() => window.Diagram.state.link());
  const p2 = await browser.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(String(e)));
  p2.on('console', m => { consoleAll.push('p2 ' + m.type() + ': ' + m.text()); if (m.type() === 'error') e2.push('console: ' + m.text()); });
  // the link is an absolute production URL; only its query is portable to the tree under test
  await p2.goto(URL0 + '?' + link.split('?').slice(1).join('?'));
  await p2.waitForFunction(() => !!window.Diagram && !!document.querySelector('.dgu-tile')
    && window.Diagram.record.build() !== null, null, { timeout: 60000 });
  await p2.waitForTimeout(120);
  const after = await p2.evaluate(() => window.Diagram.record.build());
  const cmp = {};
  cmpAdd(cmp, 'T_fuel', after.inputs.T_fuel, before.inputs.T_fuel, 0);
  for (const k of ['Delta_D', 'sigma_peak_T', 'fwhm', 'resonance_integral'])
    cmpAdd(cmp, k, after.outputs[k], before.outputs[k], 0);
  pageErrors.push(...e2);
  await p2.close();
  finish('permalink_roundtrip', 'state permalink reopened in a fresh page reproduces identical inputs and outputs',
    { T_fuel: 1650 }, cmp);
}

// ---------------------------------------------------------------- positive control
// A run whose cases all pass at the page's default state has measured nothing: perturb one
// input by a visible amount and confirm the compared output moves. Reported, not graded.
const control = await (async () => {
  await setT(600);
  const a = (await readRecord()).outputs, as = await readStats();
  await setT(2400);
  const b = (await readRecord()).outputs, bs = await readStats();
  return {
    perturbation: 'T_fuel 600 K -> 2400 K',
    sigma_peak_T: { at_600K: a.sigma_peak_T, at_2400K: b.sigma_peak_T,
                    ratio: b.sigma_peak_T / a.sigma_peak_T },
    Delta_D: { at_600K: a.Delta_D, at_2400K: b.Delta_D },
    printed_peak: { at_600K: as.peak, at_2400K: bs.peak },
    printed_fwhm: { at_600K: as.fwhm, at_2400K: bs.fwhm },
    outputs_moved: a.sigma_peak_T !== b.sigma_peak_T && a.Delta_D !== b.Delta_D
                   && as.peak !== bs.peak && as.fwhm !== bs.fwhm
  };
})();

await browser.close();

const total = cases.length, passed = cases.filter(c => c.pass).length;
const result = {
  tool: 'doppler',
  file: 'doppler.html',
  run_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  reference: 'Independent python evaluation of the single-level Breit-Wigner radiative-capture cross-section Doppler-broadened by the psi function, with the ENDF/B-VIII.0 resolved-resonance parameters of the U-238 6.673 eV resonance (E0 = 6.673 eV, Gamma_n = 1.476 meV, Gamma_gamma = 23.00 meV, g = 1). psi(xi,x) is computed two structurally different ways — adaptive quadrature of its defining convolution integral (scipy.integrate.quad) and the Faddeeva/Voigt form (sqrt(pi)*xi/2)*Re w(xi(x+i)/2) (scipy.special.wofz) — which agree to 1e-14 relative (recorded per case as crosscheck). Peak, FWHM and the resonance integral are obtained from that reference by Brent root-finding and adaptive quadrature, not by the tool grid.',
  reference_citations: [
    'H. Derrien, L.C. Leal, N.M. Larson, A. Courcelle, "Neutron Resonance Parameters of U-238 and the Calculated Cross Sections from the Reich-Moore Analysis of Experimental Data in the Neutron Energy Range from 0 keV to 20 keV", ORNL/TM-2005/241 (2005), Table 8 (E0 = 6.673 eV, Gamma_n = 1.476 meV, Gamma_gamma = 23.00 meV) — the U-238 resolved-resonance evaluation adopted by ENDF/B-VII.0 and retained in ENDF/B-VIII.0.',
    'G.I. Bell and S. Glasstone, "Nuclear Reactor Theory", Van Nostrand Reinhold (1970), Sec. 8.1b — free-gas Doppler broadening, psi(xi,x) and chi(xi,x), Delta_D = sqrt(4 E0 k T / A).',
    'J.J. Duderstadt and L.J. Hamilton, "Nuclear Reactor Analysis", Wiley (1976), Sec. 2-I-D, 10-II — SLBW resonance shape, invariance of the resonance area under Doppler broadening.',
    'M. Abramowitz and I.A. Stegun, "Handbook of Mathematical Functions" (1964), Eq. 7.1.3 — w(z) = exp(-z^2) erfc(-iz).',
    'CODATA 2018 (k = 8.617333262e-5 eV/K) and AME2020 (M(U-238) = 238.0507884 u, m_n = 1.00866491595 u).'
  ],
  tolerance: 'Calculation-record quantities: 1e-4 relative — the tool solves the same closed form on a uniform 0.5 meV grid with a Gaussian kernel truncated at 5 sigma, whose discretisation error is below 1e-5, so 1e-4 is a factor-10 margin over the numerical method and far tighter than any physical uncertainty. sigma_0 / sigma_peak_0K: 1e-9 (closed form, no discretisation). Printed readout: half of the last printed digit (2 decimals on the widths and the resonance integral, integer barns on the cross-sections). Resonance-integral conservation: 2e-5 spread over 300-3000 K.',
  total, passed, failed: total - passed,
  page_errors: pageErrors,
  cases
};
fs.mkdirSync(path.dirname(OUT2), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(OUT2,
  JSON.stringify({ positive_control: control, console: consoleAll }, null, 1));
console.log(`doppler: ${passed}/${total} passed, ${pageErrors.length} page errors`);
console.log('positive control:', JSON.stringify(control));
for (const c of cases) if (!c.pass) {
  console.log(' FAIL', c.id, JSON.stringify(Object.fromEntries(Object.entries(c.cmp).filter(([, v]) => !v.ok)), null, 1));
}
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
