/* COORDINATOR, 2026-10-04 — READ THIS BEFORE RE-RUNNING THIS DRIVER INTO THE TREE.
 *
 * `benchmarks/decayheat.json`, as the site serves it, is evidence produced by a driver generation
 * that NO LONGER EXISTS IN THIS TREE. Measured: the shipped artifact carries 195 ENDF/B-VIII.0
 * crosscheck leaves over 65 of its 205 cases — `crosscheck_endf80_summation_W`,
 * `crosscheck_endf80_over_ans51`, `tool_over_endf80` — and `grep -rl endf80 bench-src/` returns
 * NOTHING. It also carries a sixth `reference_citations` entry naming that sublibrary and the
 * direct summation over the decay network, four prose fields, and 196 per-case leaves this driver
 * does not write. `ref/gen_decayheat.py` reads only `decayheat_ensdf.json` and
 * `decayheat_chainparams.json`, neither of which holds a fission-product yield, so the generator
 * cannot produce that crosscheck either.
 *
 * SO: RUNNING THIS DRIVER AND PUBLISHING ITS ARTIFACT WOULD TRADE RICHER, UNREPRODUCIBLE EVIDENCE
 * FOR POORER, REPRODUCIBLE EVIDENCE, and would drop a real second independent reference from what
 * the register prints. The shipped artifact is therefore held at its shipped bytes, and `decayheat`
 * is recorded as benchmarked on evidence this tree cannot regenerate — the same class as
 * `reactionbuilder`, and stated rather than hidden. To close it, the ENDF/B-VIII.0 summation
 * reference has to be rebuilt: independent yields from the ENDF-349 / MF=8 MT=457 sublibraries,
 * summed over the full decay network. Until then this driver is the regression harness for the
 * ANS-5.1, Bateman, ENSDF, SF-yield and identity cases, and not the source of the published artifact.
 *
 * I first read the generator, found no ENDF data in it, and concluded the sixth citation was false
 * and the re-run right to drop it. Counting the leaves in the artifact showed the opposite. The
 * validator's reading was correct and mine was not; the leaves are what settled it.
 */
/* Benchmark driver for decayheat.html  ("Spent Fuel Decay Heat & Source Terms")
 *
 * References (all independent of the tool's own code, see ref/gen_decayheat.py):
 *   ANSI/ANS-5.1-1979 fission-product decay-heat shape functions,
 *   Bateman closed form (mpmath path-sum, crosschecked with scipy expm),
 *   IAEA NDS spontaneous-fission neutron yields,
 *   IAEA Live Chart / ENSDF decay data.
 *
 * The page's top-level script is NOT wrapped in an IIFE, so its functions and
 * its `state` object are reachable from page.evaluate().  Inputs are driven
 * through the DOM where the DOM offers a control (case UI-*), and through
 * `state` + calculate() where the case needs a composition the preset list
 * does not contain.  Outputs used for grading always come from the same
 * functions the UI renders from (sourceTerms / evalAt), and case UI-SUMMARY
 * proves those agree with what the page actually prints.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* Every path this driver uses — site root, reference file, output — resolves relative to
   this file's own tree, so the driver run in a workspace drives that workspace. The
   output defaults to <siteRoot>/benchmarks/decayheat.json and takes --out. */
const P = benchPaths({ name: 'decayheat', page: 'decayheat.html',
                       ref: 'decayheat_ref.json' });

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is read out of the live DOM of the page the
   browser loaded and passed to stampProvenance(), which writes build,
   manifest_revision, reference_provenance and provenance_note, and refuses to write
   anything when the observed build is absent or disagrees with the page on disk. This
   artifact dates its own run, so the stamp keeps that run_at. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_decayheat.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 3 573 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const OUT = P.out;

const TOL = {
  ans_fp: 0.05,          // fission-product decay heat vs ANSI/ANS-5.1-1979
  bateman: 1e-6,         // decay solver vs closed-form Bateman
  identity: 1e-12,       // exact arithmetic identities inside one source-term call
  halflife: 0.01,        // library half-life vs ENSDF
  decay_energy: 0.03,    // library decay energy per decay vs Q - <E_nu>
  branch: 1e-9,          // branching ratios summing to one
  sf_yield: 0.05,        // specific SF neutron yield vs IAEA table (or its 1 sigma)
};

const cases = [];
function rel(got, ref) {
  if (ref === 0) return got === 0 ? 0 : Infinity;
  return Math.abs(got - ref) / Math.abs(ref);
}
function add(id, note, inputs, cmp, extra) {
  let worst = 0, pass = true, flagged = false;
  for (const k in cmp) {
    const c = cmp[k];
    if (c.rel === undefined) c.rel = rel(c.got, c.ref);
    if (c.graded === false) { flagged = true; c.ok = null; continue; }
    c.ok = c.rel <= c.tol;
    if (c.rel > worst) worst = c.rel;
    if (!c.ok) pass = false;
  }
  cases.push(Object.assign({ id, note, inputs, cmp, worst_rel: worst,
    pass, flagged: flagged && pass ? true : false }, extra || {}));
}

const page_errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => page_errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') page_errors.push('console.error: ' + m.text()); });
await page.goto(P.pageUrl + '?lang=en');
await page.waitForFunction(() => typeof state === 'object' && state.result);

/* The build this artifact names, observed in the document the browser loaded. The
   German page of case LANG-DE is the same file and is not what the artifact grades. */
const BUILD = await readPageManifestRevision(page);

/* ------------------------------------------------------------------ *
 * 0. UI wiring: the numbers the page prints must be the numbers the
 *    graded functions produce.                                        *
 * ------------------------------------------------------------------ */
{
  /* The preset list is the framework field #f-preset-c; the page's former #inputs
     container id is gone. */
  await page.selectOption('#f-preset-c', 'pwr_w17');
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    /* The printed decay heat is the framework result tile labelled "Decay heat"
       (.dgu-tile > .dgu-tile-l label, .dgu-tile-v value); the page's former
       #summary-list id is gone. The lookup is keyed on the English label under
       ?lang=en, so a renamed tile reads null and the case fails instead of
       silently grading another tile. */
    const tileValue = (label) => {
      const want = label.replace(/\?\s*$/, '').trim().toLowerCase();
      for (const n of document.querySelectorAll('.dgu-tile')) {
        const l = (n.querySelector('.dgu-tile-l') || {}).textContent || '';
        if (l.replace(/\?\s*$/, '').trim().toLowerCase() === want)
          return ((n.querySelector('.dgu-tile-v') || {}).textContent || '').trim();
      }
      return null;
    };
    const txt = tileValue('Decay heat');
    const S = sourceTerms(evalAt(state.result.sol, TGRID[state.tIndex]), state.result.opt);
    return { txt, heat: S.heat, act: S.act, n: S.nTot, t: TGRID[state.tIndex] };
  });
  const heatTxt = r.txt || '';
  const m = heatTxt.match(/([\d.]+)\s*([kMG]?)W/);
  const scale = { '': 1, k: 1e3, M: 1e6, G: 1e9 }[(m && m[2]) || ''];
  const heatPrinted = m ? parseFloat(m[1]) * scale : NaN;
  add('UI-SUMMARY', 'The decay heat printed in the summary panel for the PWR 17x17 preset at the '
      + 'default slider position equals sourceTerms(evalAt(...)).heat, i.e. the functions the '
      + 'graded cases call are the ones the page renders from. Read from the framework result '
      + 'tile labelled "Decay heat".',
      { preset: 'pwr_w17', t_s: r.t },
      { heat_W: { got: heatPrinted, ref: r.heat, tol: 2e-3 } },
      { printed: heatTxt });
}

/* ------------------------------------------------------------------ *
 * 1. Fission-product decay heat vs ANSI/ANS-5.1-1979                  *
 * ------------------------------------------------------------------ */
{
  const cfgs = {};
  for (const c of REF.fp_decay_heat_cases) {
    (cfgs[c.cfg] = cfgs[c.cfg] || { spec: c, times: [] }).times.push(c);
  }
  for (const cfg in cfgs) {
    const spec = cfgs[cfg].spec;
    const got = await page.evaluate((s) => {
      state.preset = ''; state.hm = s.hm_kg; state.mat = 'oxide';
      state.comp = [{ id: s.fissile, w: 100 }];
      state.str = []; state.mode = 'years'; state.years = s.T_years; state.pw = s.P0_MW;
      state.s = s.s; state.d = s.d; state.steps = 60; state.strFlux = 0; state.nImp = 0;
      calculate();
      const R = state.result, w = spectrumWeights(s.s, s.d);
      /* fission-rate fractions at end of irradiation, to prove the single-nuclide
         assumption behind the ANS-5.1 table actually holds for this case */
      let ftot = 0; const fper = {};
      for (let i = 0; i < NN; i++) {
        const u = NUC[IDS[i]]; if (!u.SF) continue;
        const r = xsAt(u.SF, w) * R.irr.fuel[i];
        if (r > 0) { fper[IDS[i]] = r; ftot += r; }
      }
      const mix = Object.keys(fper).map(k => [k, fper[k] / ftot])
        .sort((a, b) => b[1] - a[1]).slice(0, 3);
      const out = { mix, burnup: derivedBurnup(), backCut: R.sol.backCut, t: {} };
      for (const tt of s.times) {
        const N = evalAt(R.sol, tt); const S = sourceTerms(N, R.opt);
        let fp = 0, act = 0, str = 0, lump = 0;
        for (let i = 0; i < NN; i++) {
          const u = NUC[IDS[i]], v = S.per.heat[i];
          if (u.cat === 'fp') { fp += v; if (u.lump) lump += v; }
          else if (u.cat === 'act') act += v; else str += v;
        }
        out.t[String(tt)] = { fp, act, str, lump, tot: S.heat };
      }
      return out;
    }, { hm_kg: spec.hm_kg, fissile: spec.fissile, T_years: spec.T_years, P0_MW: spec.P0_MW,
         s: spec.s, d: spec.d, times: cfgs[cfg].times.map(c => c.t_s) });

    const purity = got.mix[0][1];
    for (const c of cfgs[cfg].times) {
      const g = got.t[String(c.t_s)];
      add('ANS51-' + c.id,
        'Fission-product decay heat ' + c.t_s + ' s after ' + c.T_years + ' y of constant '
        + c.P0_MW + ' MW operation on ' + c.fissile + ' fuel, against the ANSI/ANS-5.1-1979 '
        + '23-term shape function for ' + c.fissile
        + '.  Fission rate from the operating power with Q = ' + c.Q_MeV + ' MeV/fission.  '
        + 'Fissions in this case are ' + (purity * 100).toFixed(1) + ' % ' + got.mix[0][0]
        + ', so the single-nuclide table applies.',
        { fissile: c.fissile, T_years: c.T_years, P0_MW: c.P0_MW, hm_kg: c.hm_kg,
          burnup_GWd_t: got.burnup, t_s: c.t_s, spectral_index: c.s, hump: c.d },
        { fp_decay_heat_W: { got: g.fp, ref: c.ans51_fp_heat_W, tol: TOL.ans_fp } },
        { fission_mix: got.mix, lumped_group_share: g.lump / g.fp,
          actinide_heat_W: g.act, activation_heat_W: g.str, total_heat_W: g.tot,
          crosscheck_way_wigner_over_ans51: c.way_wigner_over_ans });
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2. Decay solver vs closed-form Bateman                              *
 * ------------------------------------------------------------------ */
for (const ch of REF.bateman_chains) {
  const got = await page.evaluate((c) => {
    const N0 = new Float64Array(NN);
    c.nuclides.forEach((id, k) => { if (c.N0[k]) N0[IDX[id]] = c.N0[k]; });
    const sol = coolSolution(N0);
    const out = { backCut: sol.backCut, t: {} };
    for (const p of c.points) {
      const N = evalAt(sol, p.t_s);
      out.t[String(p.t_s)] = c.nuclides.map(id => N[IDX[id]]);
    }
    return out;
  }, ch);
  for (const p of ch.points) {
    const g = got.t[String(p.t_s)];
    const cmp = {};
    ch.nuclides.forEach((id, k) => {
      if (p.N[k] <= 1e-12 * ch.N0[0]) return;   // below double precision of the reference
      cmp['N_' + id] = { got: g[k], ref: p.N[k], tol: TOL.bateman };
    });
    add('BATEMAN-' + ch.id + '-t' + p.t_s,
      'Post-shutdown decay of a pure ' + ch.nuclides[0] + ' inventory (1e24 atoms) after '
      + p.t_s + ' s, chain ' + ch.nuclides.join(' -> ')
      + '.  Reference: generalised Bateman path-sum in 50-digit arithmetic, crosschecked '
      + 'against scipy.linalg.expm of the same generator (mutual deviation '
      + p.crosscheck_rel.toExponential(2) + ').  Decay constants and branching ratios are the '
      + 'ones the tool declares; they are graded against ENSDF separately (cases ENSDF-*).',
      { chain: ch.id, N0_atoms: ch.N0[0], t_s: p.t_s },
      cmp, { crosscheck_rel: p.crosscheck_rel, feedback_edges_cut: got.backCut });
  }
}

/* ------------------------------------------------------------------ *
 * 3. Source-term identities                                           *
 * ------------------------------------------------------------------ */
{
  const ids = await page.evaluate(() => {
    /* The page renamed applyPreset() to applyPresetState(), which now writes the
       preset's keys into state and leaves recomputing to the framework, so the
       driver calls calculate() itself to get the result this block grades. */
    state.preset = 'pwr_w17'; applyPresetState('pwr_w17'); calculate();
    const R = state.result;
    const res = [];
    for (const tt of [1e2, 1e6, 3.15576e8, 3.15576e10, 3.15576e12]) {
      const N = evalAt(R.sol, tt); const S = sourceTerms(N, R.opt);
      let act = 0, heat = 0, gMeV = 0, perHeat = 0, perG = 0, perN = 0;
      for (let i = 0; i < NN; i++) {
        const u = NUC[IDS[i]];
        if (!u.lam || !(N[i] > 0)) continue;
        const A = u.lam * N[i];
        act += A;
        heat += A * (u.a + u.b + u.g);
        gMeV += A * u.g;
        if (u.sfb) { heat += A * u.sfb * 185.0; gMeV += A * u.sfb * 6.7; }
      }
      for (let i = 0; i < NN; i++) { perHeat += S.per.heat[i]; perG += S.per.g[i]; perN += S.per.n[i]; }
      /* actinide / fission-product share of the heat */
      let hAct = 0, hFp = 0, hStr = 0, nCm244 = 0;
      for (let i = 0; i < NN; i++) {
        const c = NUC[IDS[i]].cat;
        if (c === 'act') hAct += S.per.heat[i]; else if (c === 'fp') hFp += S.per.heat[i];
        else hStr += S.per.heat[i];
      }
      nCm244 = S.per.n[IDX.Cm244] || 0;
      res.push({ t: tt, act: S.act, heat: S.heat, gMeV: S.gMeV, nTot: S.nTot,
        nSF: S.nSF, nAN: S.nAN, sumAct: act, sumHeat: heat * 1.602176634e-13,
        sumG: gMeV, perHeat, perG, perN, hAct, hFp, hStr, nCm244 });
    }
    return res;
  });
  for (const r of ids) {
    add('IDENT-t' + r.t,
      'Internal consistency of the source terms at ' + r.t + ' s of cooling for the PWR 17x17 '
      + 'preset: total activity must be the sum of lambda*N over the library, decay heat must be '
      + 'the sum of (mean decay energy) x (activity) plus the local energy of spontaneous fission, '
      + 'the photon energy source must be the sum of A*E_gamma, and the per-nuclide breakdown the '
      + 'chart draws must add up to the totals the summary prints.',
      { preset: 'pwr_w17', t_s: r.t },
      { activity_Bq: { got: r.act, ref: r.sumAct, tol: TOL.identity },
        heat_W: { got: r.heat, ref: r.sumHeat, tol: TOL.identity },
        gamma_MeV_per_s: { got: r.gMeV, ref: r.sumG, tol: TOL.identity },
        per_nuclide_heat_sum_W: { got: r.perHeat, ref: r.heat, tol: TOL.identity },
        per_nuclide_gamma_sum: { got: r.perG, ref: r.gMeV, tol: TOL.identity },
        per_nuclide_neutron_sum: { got: r.perN, ref: r.nTot, tol: TOL.identity },
        neutron_SF_plus_alpha_n: { got: r.nSF + r.nAN, ref: r.nTot, tol: TOL.identity } },
      { actinide_heat_W: r.hAct, fission_product_heat_W: r.hFp, activation_heat_W: r.hStr,
        actinide_share: r.hAct / r.heat, Cm244_neutron_share: r.nCm244 / r.nTot });
  }
  /* long-time behaviour: actinides must take over from the fission products */
  const at500y = ids.find(r => Math.abs(r.t - 3.15576e10) < 1);
  const at100ky = ids.find(r => Math.abs(r.t - 3.15576e12) < 1);
  add('LONGTIME-ACTINIDE',
    'Long-time behaviour: fission products (Cs-137 / Sr-90, ~30 y half-lives) must have handed the '
    + 'decay heat over to the actinides well before 1000 y, and the actinides must still dominate '
    + 'at 100 000 y.  Graded as a share, not against a tabulated number: the physics statement is '
    + 'that the actinide share exceeds 0.5 at 1000 y and 0.9 at 100 000 y.',
    { preset: 'pwr_w17' },
    { actinide_share_1000y: { got: at500y.hAct / at500y.heat, ref: 1.0,
        rel: Math.max(0, 0.5 - at500y.hAct / at500y.heat), tol: 1e-12 },
      actinide_share_100ky: { got: at100ky.hAct / at100ky.heat, ref: 1.0,
        rel: Math.max(0, 0.9 - at100ky.hAct / at100ky.heat), tol: 1e-12 } });
}

/* ------------------------------------------------------------------ *
 * 4. Library decay data vs ENSDF                                      *
 * ------------------------------------------------------------------ */
const LIB = await page.evaluate(() => {
  const o = {};
  IDS.forEach(id => { const u = NUC[id];
    o[id] = { Z: u.Z, A: u.A, t: u.t, lam: u.lam, b: u.b, g: u.g, a: u.a, ph: u.ph,
      d: u.d, sfb: u.sfb || 0, nu: u.nu || 0, cat: u.cat, lump: !!u.lump }; });
  return o;
});
{
  /* A metastable daughter that the tool carries as its own library entry takes
     part of the parent's decay energy with it: ENSDF puts the whole cascade in
     the parent's decay data set, so the reference must be compared against the
     tool's parent PLUS the branch-weighted energy of any isomer it feeds that
     de-excites purely by internal transition. */
  /* nuclides whose IAEA-API gamma list is internally inconsistent with the
     evaluated line intensities, so the reference itself cannot be trusted */
  const UNRELIABLE_GAMMA = { Y92: 'The API gamma list for 92Y contains 315 keV at 63 % and '
    + '492 keV at 78 %, which are not 92Y transitions and would make 92Y a far stronger gamma '
    + 'emitter than any evaluation shows; the reference is rejected rather than the tool.' };
  const isomerShare = (id) => {
    let extra = 0; const via = [];
    for (const dd of (LIB[id].d || [])) {
      const tgt = LIB[dd[1]];
      if (!tgt || !/m$/.test(dd[1])) continue;
      via.push([dd[1], dd[2]]);
      const onlyIT = (tgt.d || []).length && (tgt.d || []).every(x => x[0] === 'it');
      if (onlyIT) extra += dd[2] * (tgt.a + tgt.b + tgt.g);
    }
    return [extra, via];
  };
  /* ENSDF key '137cs' -> library id 'Cs137' */
  const MAP = {};
  for (const k of Object.keys(REF.ensdf)) {
    const m = k.match(/^(\d+)([a-z]+)$/);
    if (!m) continue;
    const id = m[2][0].toUpperCase() + m[2].slice(1) + m[1];
    if (LIB[id] && LIB[id].t) MAP[k] = id;
  }
  for (const k in MAP) {
    const id = MAP[k], e = REF.ensdf[k], u = LIB[id];
    if (!u || !e) continue;
    /* Energy deposited locally per decay = the sum of every emission ENSDF
       lists except the neutrino: mean beta, mean photon (the API's gamma list
       already carries the X-rays), mean conversion/Auger electron, and the
       mean alpha scaled by A/(A-4) to add the recoil of the daughter. */
    const a_recoil = e.mean_alpha_MeV > 0 ? e.mean_alpha_MeV * u.A / (u.A - 4) : 0;
    const ref_E = e.mean_beta_minus_MeV + e.mean_beta_plus_MeV + e.mean_gamma_MeV
      + e.mean_electron_MeV + a_recoil;
    const mode = a_recoil > 0
      ? 'mean alpha with daughter recoil + gamma/X + conversion electrons'
      : 'mean beta + gamma/X + conversion and Auger electrons';
    const [extra, via] = isomerShare(id);
    const got_E = u.a + u.b + u.g + extra;
    /* When the parent feeds a metastable state that the tool carries as its own
       library entry, ENSDF may or may not put that isomer's de-excitation in the
       parent's data set (it does for Cs-137 -> Ba-137m, it does not for
       I-135 -> Xe-135m).  The API's summed radiation lists do not say which,
       so the split cannot be attributed and the comparison is FLAGGED, not
       graded.  The half-life and the branching sum are still graded. */
    const ambiguous = via.length > 0;
    const note_extra = ambiguous
      ? '  The tool carries ' + via.map(v => v[0] + ' (branch ' + v[1] + ')').join(', ')
        + ' as separate library entries; ENSDF does not say unambiguously whether the isomer '
        + 'de-excitation is inside the parent data set, so the decay energy is flagged, not graded.'
      : '';
    /* branching ratios of this nuclide must sum to one */
    let brs = 0;
    (u.d || []).forEach(dd => { brs += dd[2]; });
    const cmp = {
      half_life_s: { got: u.t, ref: e.half_life_s, tol: TOL.halflife },
      branching_sum: { got: brs, ref: 1.0, tol: 1e-6 },
    };
    if (ref_E > 0) cmp.decay_energy_MeV = { got: got_E, ref: ref_E, tol: TOL.decay_energy,
      graded: !ambiguous && !UNRELIABLE_GAMMA[id] };
    add('ENSDF-' + id,
      'Library decay data for ' + id + ' against ENSDF (IAEA Live Chart): half-life, and the '
      + 'energy deposited locally per decay, taken as ' + mode + '.' + note_extra
      + '  Branching ratios of the modes the tool models must sum to one.',
      { nuclide: id },
      cmp,
      { ensdf_half_life_unc_s: e.unc_half_life_s, ensdf_decay_modes: e.decays,
        tool_modes: u.d, isomer_energy_added_MeV: extra, ensdf_components: { beta: e.mean_beta_minus_MeV,
          gamma_and_x: e.mean_gamma_MeV, conversion_electrons: e.mean_electron_MeV,
          alpha_with_recoil: a_recoil } });
  }
  /* every nuclide in the library: branching ratios must sum to one */
  let bad = [];
  for (const id in LIB) {
    const u = LIB[id];
    if (!u.d || !u.d.length) continue;
    let s = 0; u.d.forEach(dd => { s += dd[2]; });
    if (Math.abs(s - 1) > 1e-6) bad.push([id, s]);
  }
  add('BRANCH-ALL',
    'Every nuclide in the library that has decay modes at all must have branching ratios summing '
    + 'to one, otherwise atoms are created or destroyed by the decay solver.',
    { nuclides_with_decay_modes: Object.keys(LIB).filter(k => LIB[k].d && LIB[k].d.length).length },
    { nuclides_with_bad_branching: { got: bad.length, ref: 0, rel: bad.length, tol: TOL.branch } },
    { offenders: bad });
}

/* ------------------------------------------------------------------ *
 * 5. Spontaneous-fission neutron yields vs the IAEA table             *
 * ------------------------------------------------------------------ */
{
  const NAV = 6.02214076e23;
  for (const id in REF.sf_yield_n_per_s_g) {
    const u = LIB[id]; if (!u) continue;
    const got = u.lam * NAV / u.A * u.sfb * u.nu;
    const ref = REF.sf_yield_n_per_s_g[id];
    const unc = REF.sf_yield_unc[id] / ref;
    const tol = Math.max(TOL.sf_yield, unc);
    add('SFN-' + id,
      'Specific spontaneous-fission neutron yield of ' + id + ', lambda * (N_A/A) * b_SF * nu_SF, '
      + 'against IAEA NDS Table 1 (Simakov et al. 2015).  Tolerance is the larger of 5 % and the '
      + 'quoted 1 sigma of the table itself (' + (unc * 100).toFixed(1) + ' %), because the table '
      + 'is an evaluation with its own uncertainty.',
      { nuclide: id, sf_branch: u.sfb, nu_sf: u.nu, half_life_s: u.t },
      { specific_neutron_yield_n_per_s_g: { got, ref, tol } },
      { iaea_1sigma_rel: unc });
  }
}

/* ------------------------------------------------------------------ *
 * 6. Neutron source composition of real spent fuel                    *
 * ------------------------------------------------------------------ */
{
  const r = await page.evaluate(() => {
    applyPresetState('pwr_w17'); calculate();
    const R = state.result, out = [];
    for (const y of [5, 10, 30]) {
      const tt = y * 3.15576e7;
      const N = evalAt(R.sol, tt); const S = sourceTerms(N, R.opt);
      const top = [];
      for (let i = 0; i < NN; i++) if (S.per.n[i] > 0) top.push([IDS[i], S.per.n[i] / S.nTot]);
      top.sort((a, b) => b[1] - a[1]);
      out.push({ y, nTot: S.nTot, sfFrac: S.nSF / S.nTot, anFrac: S.nAN / S.nTot,
        top: top.slice(0, 4), heat: S.heat, tHM: R.tHM });
    }
    return out;
  });
  for (const x of r) {
    add('NSRC-' + x.y + 'y',
      'Neutron source of a 50 GWd/tHM PWR 17x17 assembly at ' + x.y + ' y of cooling.  Published '
      + 'assays and depletion analyses of LWR fuel of this burnup put Cm-244 at roughly 80-95 % of '
      + 'the total neutron emission over the first decades, with spontaneous fission dominating '
      + 'over (alpha,n) in an oxide matrix (PNNL-23561, "Spent Nuclear Fuel Measurements", '
      + 'sec. on neutron emission).  Graded as a range: Cm-244 share between 0.7 and 0.99, SF '
      + 'share above 0.8, and Cm-244 ranked first.',
      { preset: 'pwr_w17', burnup_GWd_t: 50, cooling_y: x.y },
      { Cm244_share: { got: x.top[0][0] === 'Cm244' ? x.top[0][1] : 0, ref: 1,
          rel: (function (v) { return v < 0.7 ? 0.7 - v : (v > 0.99 ? v - 0.99 : 0); })
            (x.top[0][0] === 'Cm244' ? x.top[0][1] : 0), tol: 1e-12 },
        spontaneous_fission_share: { got: x.sfFrac, ref: 1,
          rel: Math.max(0, 0.8 - x.sfFrac), tol: 1e-12 } },
      { total_n_per_s: x.nTot, per_tHM: x.nTot / x.tHM, top_emitters: x.top,
        alpha_n_share: x.anFrac });
  }
}

/* ------------------------------------------------------------------ *
 * 7. The page must work in another language with no errors            *
 * ------------------------------------------------------------------ */
{
  const before = page_errors.length;
  const p2 = await browser.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(String(e)));
  await p2.goto(P.pageUrl + '?lang=de');
  await p2.waitForFunction(() => typeof state === 'object' && state.result);
  const de = await p2.evaluate(() => ({
    lang: document.documentElement.lang,
    /* The page title is the framework header node .dgu-title and the result summary is
       its .dgu-verdict line; the page's former #app-title and #summary-list ids are gone. */
    title: ((document.querySelector('.dgu-title') || {}).textContent || ''),
    summary: ((document.querySelector('.dgu-verdict') || {}).innerText || ''),
  }));
  await p2.close();
  add('LANG-DE',
    'The tool honours ?lang=de: it renders German labels and produces a result with no page error.',
    { lang: 'de' },
    { page_errors: { got: e2.length, ref: 0, rel: e2.length, tol: 1e-12 },
      german_title: { got: /Nachzerfall/.test(de.title) ? 1 : 0, ref: 1, tol: 1e-12 } },
    { title: de.title, errors: e2 });
}

await browser.close();

const passed = cases.filter(c => c.pass).length;
/* COORDINATOR 2026-10-04: these two were typed into the tolerance sentence and its own cases
   contradicted them - the artifact said "26 of the 65" where 2 of 65 fail. A count a reader is
   invited to check must be derived from the cases the run graded, never retyped. */
const ans51Cases   = cases.filter(c => /^ANS51/.test(c.id));
const ans51Total   = ans51Cases.length;
const ans51Failing = ans51Cases.filter(c => !c.pass).length;
const result = {
  tool: 'decayheat',
  file: 'decayheat.html',
  reference: 'ANSI/ANS-5.1-1979 fission-product decay-heat shape functions (23-term fits for '
    + 'thermal U-235, thermal Pu-239 and fast U-238); a generalised Bateman solution for branching '
    + 'decay chains implemented independently in 50-digit arithmetic and crosschecked against '
    + 'scipy.linalg.expm; the IAEA Nuclear Data Section evaluation of spontaneous-fission neutron '
    + 'yields; and ENSDF half-lives, Q values, branching ratios and mean decay energies retrieved '
    + 'from the IAEA Live Chart API.  The Way-Wigner correlation is carried as an '
    + 'order-of-magnitude crosscheck only and is never graded.',
  reference_citations: REF.citations,
  tolerance:
    '5 % relative on fission-product decay heat against ANSI/ANS-5.1-1979.  That is one combined '
    + 'standard deviation: the standard is itself a fit whose evaluated uncertainty on f(t,T) is a '
    + 'few per cent, and a reduced ~330-nuclide library with ten lumped short-lived groups cannot '
    + 'do better than the calorimetric datasets (about 4 % 1 sigma) such groups are tuned to.  It '
    + `is not chosen from the tool: ${ans51Failing} of the ${ans51Total} decay-heat cases fail it.  ` 
    + '1e-6 relative on the decay solver against the closed-form Bateman solution, because that is '
    + 'exact mathematics and the two independent reference implementations agree to 3e-11.  '
    + '1e-12 relative on the source-term identities, which are exact arithmetic within one call.  '
    + '1 % on half-lives and 3 % on energy deposited per decay against ENSDF, which is the level at '
    + 'which an engineering decay library is normally rounded.  On spontaneous-fission neutron '
    + 'yields, the larger of 5 % and the 1 sigma the IAEA table quotes for that nuclide.',
  independence_note:
    'The ANS-5.1 comparison is only partly a blind test for U-235: the tool states in its own '
    + 'source that its ten lumped short-lived fission-product groups were calibrated so that total '
    + 'fission-product decay heat follows the Way-Wigner / ANS-5.1 law for U-235 thermal fission. '
    + 'The U-235 cases therefore verify faithful implementation of a correlation the author fitted '
    + 'to, not independent prediction.  The Pu-239 and U-238 cases ARE blind, because the tool '
    + 'gives the lumped groups the same yields for every fissioning nuclide, and so are the '
    + 'Bateman, ENSDF, SF-yield and identity cases.',
  environment: 'Chromium (Playwright), page opened from file:// with no network access. '
    + 'Node ' + process.version + '.',
  not_benchmarked: {
    gamma_dose_rate:
      'The dose panel (Sv/h at a distance) uses a single-energy point-kernel with a lumped '
      + 'self-absorption thickness and no build-up factor.  There is no published verification case '
      + 'that matches that geometry closely enough to grade it, and the tool itself calls the model '
      + 'coarse, so it is left untested here rather than graded against a shielding calculation it '
      + 'does not claim to be.',
    alpha_n_yields:
      '(alpha,n) production is a single power law in the alpha energy times a matrix factor. '
      + 'Evaluated thick-target yields exist per matrix (Perry & Wilson, LA-8869-MS) but the tool '
      + 'does not expose the per-matrix yield, only the summed neutron source, and in oxide fuel '
      + 'the (alpha,n) share is a few per cent, so the SF cases dominate any comparison.  Not graded.',
    activation_products:
      'The structural-activation part of the inventory (Co-60, Ni-63, Nb-94 ...) depends on trace '
      + 'impurity levels the user enters; there is no reference inventory to compare against '
      + 'without adopting the tool\'s own impurity assumptions.',
    fission_product_yields:
      'The fission-yield sets themselves are not graded against JEFF/ENDF here; only their '
      + 'aggregate effect through the decay-heat comparison is.',
  },
  total: cases.length,
  passed,
  failed: cases.length - passed,
  flagged: cases.filter(c => c.flagged).length,
  page_errors,
  run_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  cases,
};
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1));
console.log('total %d  passed %d  failed %d  page_errors %d',
  result.total, result.passed, result.failed, page_errors.length);
for (const c of cases) if (!c.pass) {
  const worst = Object.entries(c.cmp).filter(([, v]) => v.ok === false)
    .map(([k, v]) => k + ' got=' + Number(v.got).toPrecision(6) + ' ref=' + Number(v.ref).toPrecision(6)
      + ' rel=' + (v.rel * 100).toFixed(2) + '%').join('; ');
  console.log('FAIL %s  %s', c.id, worst);
}
