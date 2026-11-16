// Benchmark driver — spectrum.html (thermal-reactor neutron flux spectrum)
// Reference: bench-src/ref/spectrum_ref.json from bench-src/ref/gen_spectrum_ref.py
// (independent python: analytic Watt / Maxwellian / 1-over-E components, closed forms
//  cross-checked against numerical quadrature and root finding).
//
// 2026-10-02 adaptation (locators and transport only; no tolerance, case, reference
// value or comparison was changed):
//   usage: node run_spectrum.mjs --base http://127.0.0.1:8321 [--tool spectrum.html]
//                                 [--out <artifact>] [--out2 <control>] [--ref-dir <dir>]
//   The three positional arguments the 2026-10-02 adaptation took (baseUrl, toolPath,
//   outDir) are still accepted, in that order, as the fallbacks behind the flags.
// The page was ported to the DiagramUI shell after the 2026-08-11 run. The controls
// #tmod and #ratio and the readout nodes #r_t, #r_kt, #r_mp, #r_mean, #r_watt and
// #r_frac are not in the rendered page at all — the first run of this driver against
// today's build threw on document.getElementById('r_frac') being null. They are the
// framework controls #f-T-c and #f-r-c and the framework result tiles .dgu-tile,
// located by each tile's own English label. Every case asserts, from
// window.Diagram.record.build(), that the page state really is (T, r) before any
// output is read.
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths, parseFlags } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is the manifest_revision read out of the
   live DOM of the page this run loaded, so the artifact names the build it graded and
   not whichever page happens to sit beside the driver; stampProvenance() writes it
   together with reference_provenance, provenance_note and run_at, and refuses to
   write anything without it. Every path resolves through benchPaths() against this
   driver's own tree. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_spectrum_ref.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 350 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* http transport, unchanged: the origin and the tool path were positional arguments with
   a hard-coded default, and the reference path defaulted into another tree
   (/home/claude/integ/bench-src/ref). Both now resolve through benchPaths against this
   driver's own tree; the positional arguments are kept as the fallbacks behind the flags. */
const FLAGS = parseFlags(process.argv.slice(2));
const POS = FLAGS._;
const P = benchPaths({
  name: 'spectrum',
  page: (typeof FLAGS.tool === 'string' ? FLAGS.tool : POS[1]) || 'spectrum.html',
  ref: 'spectrum_ref.json',
  env: { ...process.env,
         BENCH_BASE: process.env.BENCH_BASE || POS[0] || 'http://127.0.0.1:8321',
         BENCH_OUT: process.env.BENCH_OUT
                    || (POS[2] ? path.join(POS[2], 'spectrum.json') : undefined) },
});
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
/* the positive control sits beside the artifact unless --out2 names somewhere else */
const OUT2 = P.out2 || P.out.replace(/\.json$/, '.control.json');
const URL0 = P.pageUrl;
const pageErrors = [], cases = [], consoleAll = [];

const TOL_SHAPE = 1e-9;   // pure shape ratios: both sides are the same closed form
const TOL_ABS = 3e-4;     // absolute normalised values (tool normalises by the grid maximum,
                          // which is up to 1.1e-4 below the true maximum on a 0.01-decade grid)
const FLOOR = 1e-30;      // below this the component has underflowed and a ratio is meaningless

function cmpAdd(cmp, name, got, ref, tol) {
  const rel = Math.abs(ref) > 0 ? Math.abs(got - ref) / Math.abs(ref) : Math.abs(got - ref);
  cmp[name] = { got, ref, rel, ok: rel <= tol, tol };
}
function finish(id, note, inputs, cmp, extra) {
  let worst = 0, pass = true;
  for (const k of Object.keys(cmp)) { worst = Math.max(worst, cmp[k].rel); if (!cmp[k].ok) pass = false; }
  cases.push(Object.assign({ id, note, inputs, cmp, worst_rel: worst, pass }, extra || {}));
}
/* the framework prints a grouped thousands separator (T_mod = 1200 renders as
   "1 200"), which the pre-port readout nodes did not, so the separators are
   stripped before parsing. The comparison and its tolerance are unchanged. */
const num = s => parseFloat(String(s).replace(/[,\s ]/g, '').replace(/[^0-9eE+.\-].*$/, ''));

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  consoleAll.push(m.type() + ': ' + m.text());
  if (m.type() === 'error') pageErrors.push('console: ' + m.text());
});
await page.goto(URL0 + '?lang=en');
// #r_frac belonged to the pre-port readout; the framework renders result tiles
await page.waitForFunction(() => !!window.Diagram && !!window.DiagramUI
  && !!document.querySelector('.dgu-tile')
  && window.Diagram.record.build() !== null, null, { timeout: 60000 });
/* the build this run graded, out of the document the browser loaded */
const BUILD = await readPageManifestRevision(page);

// the printed readout: .dgu-tile, located by the tile's own English label
const TILE = { r_t: 'T_mod', r_kt: 'k_B · T', r_mp: 'Most probable E',
               r_mean: 'Mean E and', r_watt: 'Mean E,', r_frac: 'Thermal fraction' };
const readTiles = async () => {
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.dgu-tile')].map(t => ({
    l: ((t.querySelector('.dgu-tile-l') || {}).innerText || '').replace(/\?$/, '').trim(),
    v: ((t.querySelector('.dgu-tile-v') || {}).innerText || '').trim()
  })));
  const out = {};
  for (const [k, label] of Object.entries(TILE)) {
    // the framework upper-cases the tile label in CSS, so innerText is matched case-insensitively
    const hit = tiles.filter(t => t.l.toLowerCase().startsWith(label.toLowerCase()));
    if (hit.length !== 1)
      throw new Error('readout tile "' + label + '" (was #' + k + ') matched ' + hit.length
        + ' tiles; tiles present: ' + JSON.stringify(tiles.map(t => t.l)));
    out[k] = hit[0].v;
  }
  return out;
};

async function setState(T, r) {
  await page.evaluate(([t, rr]) => {
    // #tmod and #ratio belonged to the pre-port page; these are the framework controls
    const a = document.getElementById('f-T-c'), c = document.getElementById('f-r-c');
    if (!a) throw new Error('moderator-temperature control #f-T-c is absent from the rendered page');
    if (!c) throw new Error('thermalization control #f-r-c is absent from the rendered page');
    a.focus(); a.value = String(t);
    a.dispatchEvent(new Event('input', { bubbles: true }));
    a.dispatchEvent(new Event('change', { bubbles: true }));
    a.blur();
    c.focus(); c.value = String(rr);
    c.dispatchEvent(new Event('input', { bubbles: true }));
    c.dispatchEvent(new Event('change', { bubbles: true }));
    c.blur();
  }, [T, r]);
  // the record reads the solved state (LAST.T, LAST.r) and compute is debounced, so wait
  // for the page's own record rather than for a fixed delay
  try {
    await page.waitForFunction(([t, rr]) => {
      const q = window.Diagram.record.build();
      return !!q && Number(q.inputs.T_mod) === Number(t) && Number(q.inputs.ratio) === Number(rr);
    }, [T, r], { timeout: 15000 });
  } catch (e) { /* the assertion below reports the real state */ }
  // INPUT ASSERTION: the page's own state must be the (T, r) this case names
  const st = await page.evaluate(() => ({
    rec: window.Diagram.record.build().inputs,
    ser: window.Diagram.state.current(),
    ctlT: document.getElementById('f-T-c').value,
    ctlR: document.getElementById('f-r-c').value
  }));
  if (Number(st.rec.T_mod) !== Number(T) || Number(st.rec.ratio) !== Number(r)
      || Number(st.ser.T) !== Number(T) || Number(st.ser.r) !== Number(r))
    throw new Error('inputs not applied: case asks T = ' + T + ' K, ratio = ' + r
      + '; page state is ' + JSON.stringify(st));
  const tiles = await readTiles();
  if (num(tiles.r_t) !== Number(T))
    throw new Error('printed T_mod tile reads ' + tiles.r_t + ' while the case names ' + T + ' K');
  return st;
}
const readRecord = () => page.evaluate(() => window.Diagram.record.build());

const W = REF.watt;
const COMP = [['thermal', 'u_thermal'], ['epithermal', 'u_epithermal'], ['fast', 'u_fast']];
const REFTAG = { thermal: '1e-1', epithermal: '1e+3', fast: '1e+6' };

for (const rc of REF.cases) {
  const { T, r } = rc;
  await setState(T, r);
  const rec = await readRecord(), o = rec.outputs, tiles = await readTiles();

  // (1) component shapes — ratios are independent of any normalisation
  const cmpS = {};
  for (const [cn, key] of COMP) {
    const t0 = REFTAG[cn], base = o[key + '_at_' + t0 + '_eV'], rbase = rc.samples[t0][cn];
    for (const tg of REF.sample_tags) {
      const rv = rc.samples[tg][cn];
      if (rv < FLOOR || rbase < FLOOR || tg === t0) continue;   // underflowed or the reference point itself
      cmpAdd(cmpS, cn + '(' + tg + ')/' + cn + '(' + t0 + ')',
        o[key + '_at_' + tg + '_eV'] / base, rv / rbase, TOL_SHAPE);
    }
  }
  finish('shape_T' + T + '_r' + r,
    'shape of each per-lethargy component vs the analytic Maxwellian / windowed 1-over-E / Watt forms, as ratios to a reference energy (normalisation-free)',
    { T_mod: T, ratio: r }, cmpS);

  // (2) absolute values, i.e. the "each component normalised to its own maximum" claim
  const cmpA = {};
  for (const [cn, key] of COMP)
    for (const tg of REF.sample_tags) {
      const rv = rc.samples[tg][cn];
      if (rv < 1e-14) continue;
      cmpAdd(cmpA, cn + '@' + tg, o[key + '_at_' + tg + '_eV'], rv, TOL_ABS);
    }
  cmpAdd(cmpA, 'amplitude_thermal', o.amplitude_thermal, r, 1e-12);
  cmpAdd(cmpA, 'amplitude_epithermal', o.amplitude_epithermal, REF.constants.A_epithermal, 1e-12);
  cmpAdd(cmpA, 'amplitude_fast', o.amplitude_fast, 1, 1e-12);
  finish('normalisation_T' + T + '_r' + r,
    'absolute per-lethargy values vs the analytic components normalised to their true maxima, and the amplitude of each weighted component',
    { T_mod: T, ratio: r }, cmpA);

  // (3) scalar diagnostics
  const cmpD = {};
  cmpAdd(cmpD, 'kT', o.kT, rc.kT, 1e-12);
  cmpAdd(cmpD, 'E_most_probable_is_kT', o.E_most_probable, rc.kT, 1e-12);
  cmpAdd(cmpD, 'E_mean_2kT', o.E_mean_2kT, 2 * rc.kT, 1e-12);
  // peak of the plotted per-lethargy Maxwellian must sit at 2kT, not kT
  cmpAdd(cmpD, 'peak_of_plotted_thermal_curve_vs_2kT', o.E_peak_thermal_curve, 2 * rc.kT, 1e-3);
  cmpAdd(cmpD, 'peak_of_plotted_thermal_curve_vs_kT_is_NOT', o.E_peak_thermal_curve / rc.kT, 2, 1e-3);
  cmpAdd(cmpD, 'mean_E_of_maxwellian_flux', o.E_mean_maxwellian, 2 * rc.kT, 1e-4);
  cmpAdd(cmpD, 'mean_E_watt_vs_3a2_plus_a2b4', o.E_mean_watt, W.mean_MeV_closed_form, 1e-5);
  cmpAdd(cmpD, 'peak_of_watt_chi', o.E_peak_watt_chi, W.peak_chi_MeV, 1e-3);
  cmpAdd(cmpD, 'peak_of_watt_per_lethargy', o.E_peak_watt_lethargy, W.peak_lethargy_MeV, 1e-3);
  cmpAdd(cmpD, 'plateau_flatness', o.plateau_flatness, rc.plateau_flatness, 1e-3);
  cmpAdd(cmpD, 'peak_ratio_thermal_fast_equals_ratio_control', o.peak_ratio_thermal_fast, r, 1e-12);
  cmpAdd(cmpD, 'thermal_fraction_below_0.625eV', o.thermal_fraction_below_cutoff, rc.thermal_fraction, 2e-4);
  // continuity of the join: the steepest logarithmic slope of the summed curve
  cmpAdd(cmpD, 'max_dln_u_dlnE', o.max_dln_u_dlnE, rc.max_dln_u_dlnE, 3e-3);
  finish('diagnostics_T' + T + '_r' + r,
    'peak positions, mean energies, plateau flatness, the ratio control and the thermal fraction vs closed forms and adaptive quadrature',
    { T_mod: T, ratio: r }, cmpD,
    { crosscheck: { watt_mean_closed_form_vs_quadrature: W.crosscheck.mean,
                    watt_norm_closed_form_vs_quadrature: W.crosscheck.C,
                    watt_peak_brentq_vs_minimize: W.crosscheck.peak_chi } });

  // (4) the printed readout, at its printed precision
  const cmpR = {};
  cmpAdd(cmpR, 'T_mod_K', num(tiles.r_t), T, 1e-12);
  cmpAdd(cmpR, 'kT_eV', num(tiles.r_kt), rc.kT, 0.00005 / rc.kT);
  cmpAdd(cmpR, 'most_probable_E_eV', num(tiles.r_mp), rc.kT, 0.00005 / rc.kT);
  cmpAdd(cmpR, 'mean_E_eV', num(tiles.r_mean), 2 * rc.kT, 0.00005 / (2 * rc.kT));
  cmpAdd(cmpR, 'watt_mean_MeV', num(tiles.r_watt), W.mean_MeV_closed_form, 0.0005 / W.mean_MeV_closed_form);
  cmpAdd(cmpR, 'thermal_fraction', num(tiles.r_frac), rc.thermal_fraction, 0.0005 / rc.thermal_fraction);
  finish('readout_T' + T + '_r' + r,
    'printed readout tiles, tolerance = half of the last printed digit', { T_mod: T, ratio: r }, cmpR);
}

// ---------------------------------------------------------------- the ratio control
{
  const cmp = {};
  for (const r of [0.2, 0.5, 1, 2, 3.5, 5]) {
    await setState(600, r);
    const o = (await readRecord()).outputs;
    cmpAdd(cmp, 'thermal_peak_over_fast_peak@ratio=' + r, o.peak_ratio_thermal_fast, r, 1e-12);
  }
  finish('ratio_control',
    'the "thermalization" control is labelled "thermal peak height vs. fast bump": the ratio of the two plotted peaks must equal the control value exactly',
    { T_mod: 600, ratio: '0.2..5' }, cmp);
}

// ---------------------------------------------------------------- permalink round trip
{
  await setState(750, 2.35);
  const before = await readRecord();
  const link = await page.evaluate(() => window.Diagram.state.link());
  const p2 = await browser.newPage();
  p2.on('pageerror', e => pageErrors.push(String(e)));
  p2.on('console', m => { consoleAll.push('p2 ' + m.type() + ': ' + m.text()); if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
  await p2.goto(URL0 + '?' + link.split('?').slice(1).join('?'));
  await p2.waitForFunction(() => !!window.Diagram && window.Diagram.record.build() !== null,
    null, { timeout: 60000 });
  await p2.waitForTimeout(150);
  const after = await p2.evaluate(() => window.Diagram.record.build());
  const cmp = {};
  cmpAdd(cmp, 'T_mod', after.inputs.T_mod, before.inputs.T_mod, 0);
  cmpAdd(cmp, 'ratio', after.inputs.ratio, before.inputs.ratio, 0);
  for (const k of ['kT', 'thermal_fraction_below_cutoff', 'E_mean_watt', 'u_total_at_1e+0_eV'])
    cmpAdd(cmp, k, after.outputs[k], before.outputs[k], 0);
  await p2.close();
  finish('permalink_roundtrip', 'state permalink reopened in a fresh page reproduces identical inputs and outputs',
    { T_mod: 750, ratio: 2.35 }, cmp);
}

// ---------------------------------------------------------------- positive control
// A run whose cases all pass at the page's default state has measured nothing: perturb
// each input by a visible amount and confirm the compared outputs move. Reported, not graded.
const control = await (async () => {
  await setState(300, 1);
  const a = (await readRecord()).outputs, at = await readTiles();
  await setState(1200, 1);
  const b = (await readRecord()).outputs, bt = await readTiles();
  await setState(1200, 5);
  const c = (await readRecord()).outputs, ct = await readTiles();
  return {
    perturbations: ['T_mod 300 K -> 1200 K at ratio = 1', 'ratio 1 -> 5 at T_mod = 1200 K'],
    kT: { T300: a.kT, T1200: b.kT },
    thermal_fraction_below_cutoff: { T300_r1: a.thermal_fraction_below_cutoff,
                                     T1200_r1: b.thermal_fraction_below_cutoff,
                                     T1200_r5: c.thermal_fraction_below_cutoff },
    peak_ratio_thermal_fast: { r1: b.peak_ratio_thermal_fast, r5: c.peak_ratio_thermal_fast },
    printed_kT: { T300: at.r_kt, T1200: bt.r_kt },
    printed_thermal_fraction: { T1200_r1: bt.r_frac, T1200_r5: ct.r_frac },
    outputs_moved: a.kT !== b.kT && at.r_kt !== bt.r_kt
                   && b.thermal_fraction_below_cutoff !== c.thermal_fraction_below_cutoff
                   && bt.r_frac !== ct.r_frac
                   && b.peak_ratio_thermal_fast !== c.peak_ratio_thermal_fast
  };
})();

await browser.close();

const total = cases.length, passed = cases.filter(c => c.pass).length;
const result = {
  tool: 'spectrum',
  file: 'spectrum.html',
  run_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  reference: 'Independent python implementation of the three analytic spectral components the tool claims to draw: the U-235 thermal-fission Watt spectrum chi(E) = C exp(-E/a) sinh(sqrt(bE)) with the evaluated parameters a = 0.988 MeV, b = 2.249 1/MeV; the Maxwellian flux phi(E) = C E exp(-E/kT); and the 1/E slowing-down flux (flat per unit lethargy) inside the sigmoid window the tool documents. The Watt normalisation constant, its mean energy and the positions of the maxima of chi(E) and of E chi(E) are each computed twice by structurally different routes — the closed forms C = 2 exp(-ab/4)/sqrt(pi a^3 b), <E> = 3a/2 + a^2 b/4, and Brent root-finding on dchi/dE — versus adaptive quadrature (scipy.integrate.quad) and scipy.optimize.minimize_scalar; the two routes agree to 3e-14 (recorded as crosscheck). The thermal fraction below the cadmium cutoff is obtained by adaptive quadrature of the same stated composite, which tests the tool trapezoid and its normalisation, not a physical prediction: the weighting of the three components is an illustrative recipe, not a slowing-down calculation, and the benchmark says so.',
  reference_citations: [
    'Watt parameters for thermal-neutron-induced fission of U-235, a = 0.988 MeV and b = 2.249 1/MeV: ENDF/B evaluated Watt fission-spectrum parameters, as tabulated in the MCNP manual (LA-UR-03-1987, Appendix "Fission spectra") and in J.R. Lamarsh & A.J. Baratta, "Introduction to Nuclear Engineering", 3rd ed., Sec. 3.7.',
    'B.E. Watt, "Energy Spectrum of Neutrons from Thermal Fission of U-235", Phys. Rev. 87, 1037 (1952) — the chi(E) = C exp(-E/a) sinh(sqrt(bE)) form and its mean energy 3a/2 + a^2 b/4.',
    'J.J. Duderstadt and L.J. Hamilton, "Nuclear Reactor Analysis", Wiley (1976), Sec. 8-II — the three-region thermal-reactor spectrum, the 1/E slowing-down flux, the Maxwellian flux phi(E) ~ E exp(-E/kT) with its peak at kT and mean energy 2kT, and flux per unit lethargy.',
    'CODATA 2018: k = 8.617333262e-5 eV/K.'
  ],
  tolerance: 'Component shapes are compared as ratios to a reference energy, which removes every normalisation constant: 1e-9 relative (both sides evaluate the same closed form in double precision). Absolute per-lethargy values: 3e-4, because the tool normalises each component by its maximum on the 0.01-decade grid, which is up to 1.1e-4 below the true continuum maximum (computed in the reference). Peak positions read off the grid by parabolic interpolation: 1e-3. Mean energies: 1e-4 (Maxwellian, integrated on the plot grid) and 1e-5 (Watt, dedicated 0-20 MeV grid) against the closed forms. Thermal fraction: 2e-4 against adaptive quadrature of the same definition (measured deviation 5e-5, set by the trapezoid on 0.01-decade log spacing). Steepest logarithmic slope: 3e-3, the second-order error of a forward difference on a 0.01-decade grid at an interior extremum of the slope. Printed tiles: half of the last printed digit. Amplitudes and the ratio control: 1e-12, they are exact by construction.',
  total, passed, failed: total - passed,
  page_errors: pageErrors,
  cases
};
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(OUT2, JSON.stringify({ positive_control: control, console: consoleAll }, null, 1));
console.log(`spectrum: ${passed}/${total} passed, ${pageErrors.length} page errors`);
console.log('positive control:', JSON.stringify(control));
for (const c of cases) if (!c.pass)
  console.log(' FAIL', c.id, JSON.stringify(Object.fromEntries(Object.entries(c.cmp).filter(([, v]) => !v.ok)), null, 1));
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
