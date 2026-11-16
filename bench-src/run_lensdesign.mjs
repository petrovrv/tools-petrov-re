// Benchmark driver for lensdesign.html (Lens Design & Image Quality).
// Reference: bench-src/ref/gen_lensdesign.py -> ref/lensdesign_ref.json. Oracle ray-optics 0.9.10 (first-order data, Seidel sums,
// exact ray refraction with SCHOTT catalogue indices) plus an independent Python implementation of ray aiming, spot RMS, best focus,
// OPD on the reference sphere, Strehl, FFT MTF and a scipy least-squares optimiser — not the page code.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_lensdesign.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_lensdesign.py: first-order data, third-order (Seidel) sums and exact real-ray refraction by the ray-optics package (M. Hayford, v0.9.10) with its SCHOTT glass catalogue; chief-ray aiming, pupil grids, RMS spot, best focus (scipy minimize_scalar), OPD on the reference sphere, Strehl, FFT MTF and the optimiser (scipy least_squares, Levenberg-Marquardt) written in Python from W. T. Welford, Aberrations of Optical Systems (1986) and J. W. Goodman, Introduction to Fourier Optics (2017) — not the page code. Since review R-5 (2026-11-13) seven cases reach the same quantities by OTHER methods than the page: on-axis OPD from the transverse ray aberration W = ∫ε dM (4001 meridional rays), RMS and Strehl as continuous pupil integrals, MTF by direct autocorrelation of the pupil function (no FFT), chief-ray aiming by a brentq root on the real stop height, a stigmatic plano-hyperbolic lens (Airy radius 0.61 λ/NA′, Strehl 1, circular-pupil MTF), Seidel W040 against the fitted ρ⁴ term, and Monte Carlo tolerancing (zero tolerances = nominal, index errors keep the dispersion). Still convention-matched (same definitions as the page, not an independent method): ray start plane and secant aiming of the spot/wave/field cases, the 21×21 square pupil grid of the RMS spots, the 64-sample FFT OPD/MTF of the wave cases and the ±0.02 close-ray pairs of the field curves. Prescriptions: Thorlabs public catalogue (LA1509, LBF254-100, AC254-100-A, read 2026-11-13) and the Cooke triplet sample of the ray-optics documentation.' };
const P = benchPaths({ name: 'lensdesign', page: 'lensdesign.html', ref: 'lensdesign_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_lensdesign', '1'); } catch (e) {} });
for (let attempt = 1; ; attempt++) {
  try { await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'commit', timeout: 90000 }); break; }
  catch (e) { if (attempt >= 3) throw e; }
}
await p.waitForFunction(() => window.__diagramReady && window.__lensdesign && window.__lensdesign.last, null, { timeout: 240000 });
const BUILD = await readPageManifestRevision(p);

const near = (got, exp, abs, rel) => typeof got === 'number' && isFinite(got) && Math.abs(got - exp) <= Math.max(abs || 0, (rel || 0) * Math.abs(exp));
const printed = (v, digits) => Number(v.toFixed(digits));

const results = [];
for (const c of REF.cases) {
  let g = null;
  try {
    g = await p.evaluate(([c, systems]) => {
      const L = window.OptLens, M = window.__lensdesign;
      const sysOf = (name, fixedT) => {
        const d = systems[name];
        const s = { surfaces: d.s.map(q => ({ R: q.R, t: q.t, material: q.m, sd: q.sd, stop: q.stop, k: q.k, A: q.A })),
          object: d.obj ? { dist: d.obj } : { inf: true }, aperture: d.obj ? { kind: 'na', value: d.na } : { kind: 'epd', value: d.epd }, fields: d.fields, wl: d.wl, primary: d.prim, image: d.image };
        if (fixedT != null) { s.image = 'fixed'; s.surfaces[s.surfaces.length - 1].t = fixedT; }
        return s;
      };
      if (c.kind === 'parax') {
        const S = L.prepared(sysOf(c.sys)), Pp = L.paraxial(S), sd = L.seidel(S);
        return { efl: Pp.efl, bfl: Pp.bfl, ffl: Pp.ffl, zEP: Pp.zEP, epd: Pp.epd, zXP: Pp.zXP, imgDist: Pp.imgDist, imageUsed: S.surfaces[S.surfaces.length - 1].t, mag: Pp.mag,
                 n: L.indices(S, S.wl[S.primary]).slice(1), seidel: sd.total, seidelPer: sd.rows.map(r => [r.SI, r.SII, r.SIII, r.SIV, r.SV]), fmax: Pp.fmax };
      }
      if (c.kind === 'ray') {
        const S = L.prepared(sysOf(c.sys, c.input.imageT)), r = L.traceRay(S, L.indices(S, c.input.nm), c.input.p, c.input.d);
        return r.ok ? { x: r.p[0], y: r.p[1], dx: r.d[0], dy: r.d[1], dz: r.d[2] } : { err: 'ray failed' };
      }
      if (c.kind === 'spot') {
        const S2 = L.prepared(sysOf(c.sys)), sp = L.spots(L.prepared(sysOf(c.sys, c.expect.imageT)), { grid: 21 });
        return { imageT: S2.surfaces[S2.surfaces.length - 1].t, rms: sp.map(s => s.stat.rms), perW: sp.map(s => s.perW.map(w => w.stat.rms)), chief_y: sp.map(s => s.chief[1]) };
      }
      if (c.kind === 'wave') {
        const S = L.prepared(sysOf(c.sys, c.expect.imageT));
        return { fields: S.fields.map((f, i) => { const w = L.wavefront(S, i, S.primary, { N: 64 }), m = L.psfMtf(w); return { rms: w.rms, strehl: m.strehl, cutoff: m.cutoff, mtf: [0.1, 0.25, 0.5].map(q => L.mtfAt(m.tan, q * m.cutoff)) }; }) };
      }
      if (c.kind === 'field') {
        const fc = L.fieldCurves(L.prepared(sysOf(c.sys)), { steps: 11 });
        return { rows: c.expect.rows.map(r => fc.find(q => Math.abs(q.f - r.f) < 1e-9)).map(q => q && { f: q.f, dist: q.dist, zT: q.zT, zS: q.zS }) };
      }
      /* review R-5: quantities reached by a different method in the reference (see gen_lensdesign.py) — the page's own analysis */
      if (c.kind === 'airy' || c.kind === 'wave-indep') {
        const A = L.analyze(sysOf(c.sys, c.expect.imageT)), w = A.wave[0];
        return { airy: A.airy * 1e3, fnoW: A.paraxial.fnoW, rms: w.rms, strehl: w.strehl, cutoff: w.mtf.cutoff, N: w.N, resolved: w.resolved, W040: A.seidel.waves.W040,
                 mtf: c.expect.mtf_at.map(q => L.mtfAt(w.mtf.tan, q * w.mtf.cutoff)), mtfS: c.expect.mtf_at.map(q => L.mtfAt(w.mtf.sag, q * w.mtf.cutoff)) };
      }
      if (c.kind === 'aim-indep') {
        const S = L.prepared(sysOf(c.sys, c.expect.imageT)), sp = L.spots(S, { grid: 3 });
        return { rows: c.expect.rows.map(r => { const k = S.fields.findIndex(f => Math.abs(f - r.f) < 1e-9); return k < 0 ? null : sp[k].chief[1]; }) };
      }
      if (c.kind === 'tol') {
        const z = L.tolerance(sysOf(c.sys), {}, { trials: 4 }), dn = L.tolerance(sysOf(c.sys), { dn: 0.0005 }, { trials: 40 });
        return { nominal: z.perField.map(q => q.nominal), zero: z.perField.map(q => [q.p50, q.max]), dn: dn.perField.map(q => [q.nominal, q.p50]) };
      }
      if (c.kind === 'chroma') { const ch = L.chromaticFocus(L.prepared(sysOf(c.sys)), 486.1327, 656.2725, 2); return { FC: ch[1][1] - ch[0][1] }; }
      /* aha: through the page — apply the preset, read the page's own results and the printed note */
      DiagramUI.current.example(c.preset);
      const note = (M.PRESETS.find(x => x.id === c.preset).note || {}).en;
      let last = M.last;
      if (!last || last.err) return { err: last ? last.err : 'none' };
      const r = { note, rms: last.A.spots.map(s => s.stat.rms * 1e3), strehl: last.A.wave ? last.A.wave.map(w => w && w.strehl) : [], efl: last.P.efl, petzR: last.P.petzR,
                  seidel: last.A.seidel.total, verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim() };
      const ch = L.chromaticFocus(last.A.sys, 486.1327, 656.2725, 2); r.FC = ch[1][1] - ch[0][1];
      if (c.preset === 'optimise') { M.runOptimise(); r.R = M.state.surfaces.map(q => q.R); r.eflAfter = M.last.P.efl; r.rmsAfter = M.last.A.spots.map(s => s.stat.rms * 1e3); }
      if (c.preset === 'landscape') { M.state.surfaces[0].t = 0.5; M.ui.sync(); M.ui.run(); r.atlens = M.last.A.spots.map(s => s.stat.rms * 1e3); }
      if (c.preset === 'pcx-flat' || c.preset === 'pcx-curved') { DiagramUI.current.example(c.preset === 'pcx-flat' ? 'pcx-curved' : 'pcx-flat'); r.other = M.last.A.spots[0].stat.rms * 1e3; DiagramUI.current.example(c.preset); }
      if (c.preset === 'best-form') { DiagramUI.current.example('pcx-curved'); r.pcx = M.last.A.spots[0].stat.rms * 1e3; DiagramUI.current.example(c.preset); }
      if (c.preset === 'stop-down') { DiagramUI.current.example('pcx-curved'); r.full = M.last.A.spots[0].stat.rms * 1e3; DiagramUI.current.example(c.preset); }
      if (c.preset === 'achromat') { DiagramUI.current.example('singlet-white'); r.singlet = M.last.A.spots[0].stat.rms * 1e3; const c2 = L.chromaticFocus(M.last.A.sys, 486.1327, 656.2725, 2); r.singletFC = c2[1][1] - c2[0][1]; DiagramUI.current.example(c.preset); }
      if (c.preset === 'cooke') { DiagramUI.current.example('pcx-curved'); r.singletPetz = M.last.P.petzR / M.last.P.efl; DiagramUI.current.example(c.preset); }
      return r;
    }, [c, REF.systems]);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!g && !g.err;
  const chk = (k, ok, got, exp) => { cmp[k] = { got, exp, ok: !!ok }; if (!ok) pass = false; };
  const e = c.expect;
  if (pass && c.kind === 'parax') {
    const R = 1e-9, A = 1e-9;
    for (const k of ['efl', 'bfl', 'ffl', 'epd', 'zXP']) chk(k, near(g[k], e[k], A, R), g[k], e[k]);
    chk('zEP', near(g.zEP, e.zEP, 1e-9, 1e-6), g.zEP, e.zEP);   /* ray-optics puts an infinite object at 1e10 mm: its pupil position carries ~1e-7 relative */
    chk('image distance used', near(g.imageUsed, e.imageUsed, 1e-6, 0), g.imageUsed, e.imageUsed);
    if (e.mag != null) chk('magnification', near(g.mag, e.mag, 1e-12, 1e-9), g.mag, e.mag);
    const dn = Math.max(...g.n.map((v, i) => Math.abs(v - e.n[i])));
    chk('glass indices vs SCHOTT catalogue (max |Δn|)', dn <= 2e-6, dn, '≤ 2e-6');
    const keys = g.fmax > 0 ? ['SI', 'SII', 'SIII', 'SIV', 'SV'] : ['SI'];
    for (const k of keys) chk('Seidel ' + k, near(g.seidel[k], e.seidel[k], 1e-9, 1e-6), g.seidel[k], e.seidel[k]);
    if (g.fmax > 0 && e.seidelPer) {
      let worst = 0; g.seidelPer.forEach((row, i) => row.forEach((v, j) => { worst = Math.max(worst, Math.abs(v - e.seidelPer[i][j]) / Math.max(1e-3, Math.abs(e.seidelPer[i][j]))); }));
      chk('Seidel per surface (max relative |Δ|)', worst <= 1e-6, worst, '≤ 1e-6');
    }
  } else if (pass && c.kind === 'ray') {
    for (const k of ['x', 'y']) chk('image ' + k + ' (mm)', near(g[k], e[k], 1e-9, 0), g[k], e[k]);
    for (const k of ['dx', 'dy', 'dz']) chk('direction ' + k, near(g[k], e[k], 1e-12, 0), g[k], e[k]);
  } else if (pass && c.kind === 'spot') {
    chk('image plane (mm)', near(g.imageT, e.imageT, 1e-6, 0), g.imageT, e.imageT);
    e.rms.forEach((v, i) => chk('RMS field ' + i, near(g.rms[i], v, 1e-12, 1e-9), g.rms[i], v));
    e.perW.forEach((row, i) => row.forEach((v, j) => chk('RMS field ' + i + ' λ' + j, near(g.perW[i][j], v, 1e-12, 1e-9), g.perW[i][j], v)));
    e.chief_y.forEach((v, i) => chk('chief height field ' + i, near(g.chief_y[i], v, 1e-9, 0), g.chief_y[i], v));
  } else if (pass && c.kind === 'wave') {
    e.fields.forEach((f, i) => {
      const x = g.fields[i];
      chk('OPD RMS field ' + i + ' (waves)', near(x.rms, f.rms, 1e-8, 0), x.rms, f.rms);
      chk('Strehl field ' + i, near(x.strehl, f.strehl, 1e-8, 0), x.strehl, f.strehl);
      chk('cut-off field ' + i, near(x.cutoff, f.cutoff, 1e-9, 1e-9), x.cutoff, f.cutoff);
      f.mtf.forEach((v, k) => chk('MTF field ' + i + ' at ' + [0.1, 0.25, 0.5][k] + ' cut-off', near(x.mtf[k], v, 1e-8, 0), x.mtf[k], v));
    });
  } else if (pass && c.kind === 'field') {
    e.rows.forEach((r, i) => {
      const x = g.rows[i] || {};
      chk('distortion at ' + r.f + ' (%)', near(x.dist, r.dist, 1e-8, 0), x.dist, r.dist);
      chk('tangential focus at ' + r.f + ' (mm)', near(x.zT, r.zT, 1e-7, 0), x.zT, r.zT);
      chk('sagittal focus at ' + r.f + ' (mm)', near(x.zS, r.zS, 1e-7, 0), x.zS, r.zS);
    });
  } else if (pass && c.kind === 'airy') {
    chk('Airy radius = 0.61 λ/NA′ (µm)', near(g.airy, e.airy_um, 1e-9, 0), g.airy, e.airy_um);
    chk('Airy radius = 1.22 λ N (working f-number, µm)', near(1.22 * 0.5875618 * g.fnoW, e.airy_1p22_lambda_N, 1e-9, 0), 1.22 * 0.5875618 * g.fnoW, e.airy_1p22_lambda_N);
    chk('stigmatic lens: OPD RMS ≈ 0 (waves)', g.rms < 1e-6 && e.rms < 1e-6, g.rms, e.rms);
    chk('stigmatic lens: Strehl = 1', near(g.strehl, 1, 1e-9, 0) && near(e.strehl, 1, 1e-9, 0), g.strehl, e.strehl);
    e.mtf.forEach((v, k) => chk('stigmatic lens: MTF T at ' + e.mtf_at[k] + ' cut-off = circular-pupil formula (±0.02)', near(g.mtf[k], v, 0.02, 0) && near(g.mtfS[k], v, 0.02, 0), g.mtf[k], v));
  } else if (pass && c.kind === 'wave-indep') {
    chk('OPD RMS on axis vs ∫ε dM (waves, 3 %)', near(g.rms, e.rms, 0, 0.03), g.rms, e.rms);
    chk('Strehl on axis vs continuous pupil integral (±0.01)', near(g.strehl, e.strehl, 0.01, 0), g.strehl, e.strehl);
    chk('MTF cut-off 2NA′/λ', near(g.cutoff, e.cutoff, 1e-9, 1e-9), g.cutoff, e.cutoff);
    e.mtf.forEach((v, k) => chk('MTF at ' + e.mtf_at[k] + ' cut-off vs direct autocorrelation (±0.01)', near(g.mtf[k], v, 0.01, 0), g.mtf[k], v));
    chk('pupil sampling resolved', g.resolved === true, g.N, '≤ 0.5 wave/sample');
    if (c.sys === 'stopDown') chk('Seidel W040 vs ρ⁴ term fitted to the independent wavefront (5 %)', near(g.W040, e.W040_fit, 0, 0.05), g.W040, e.W040_fit);
  } else if (pass && c.kind === 'aim-indep') {
    e.rows.forEach((r, i) => chk('chief-ray image height at ' + r.f + '° vs brentq aim (mm)', near(g.rows[i], r.chief_y, 1e-7, 0), g.rows[i], r.chief_y));
  } else if (pass && c.kind === 'tol') {
    e.nominal.forEach((v, i) => chk('tolerance nominal (refocused) field ' + i + ' (mm)', near(g.nominal[i], v, 1e-9, 1e-6), g.nominal[i], v));
    chk('zero tolerances: median = max = nominal', g.zero.every((q, i) => near(q[0], g.nominal[i], 0, 1e-9) && near(q[1], g.nominal[i], 0, 1e-9)), g.zero, g.nominal);
    chk('index errors only (±0.0005, dispersion kept): median ≥ 0.99 nominal', g.dn.every(q => q[1] >= 0.99 * q[0]), g.dn, '≥ 0.99');
  } else if (pass && c.kind === 'chroma') {
    chk('F–C focal shift (mm)', near(g.FC, e.FC, 1e-9, 0), g.FC, e.FC);
  } else if (pass && c.kind === 'aha') {
    const has = s => g.note.includes(s);
    switch (c.preset) {
      case 'pcx-flat':
        chk('RMS flat side first (µm)', near(g.rms[0], e.rms_um, 1e-6, 1e-7) && has(String(printed(e.rms_um, 0)) + ' µm'), g.rms[0], e.rms_um);
        chk('RMS turned round (µm)', near(g.other, e.other_um, 1e-6, 1e-7) && has(String(printed(e.other_um, 0)) + ' µm'), g.other, e.other_um);
        chk('"four times smaller"', e.ratio > 3.5 && e.ratio < 4.5 && has('four times'), g.rms[0] / g.other, e.ratio); break;
      case 'pcx-curved':
        chk('RMS (µm)', near(g.rms[0], e.rms_um, 1e-6, 1e-7) && has(String(printed(e.rms_um, 0)) + ' µm'), g.rms[0], e.rms_um);
        chk('"fourfold"', e.ratio > 3.5 && e.ratio < 4.5 && has('fourfold'), g.other / g.rms[0], e.ratio); break;
      case 'best-form':
        chk('best-form RMS 31.0 µm', near(g.rms[0], e.rms_um, 1e-6, 1e-7) && has(printed(e.rms_um, 1).toFixed(1) + ' µm'), g.rms[0], e.rms_um);
        chk('plano-convex 33.4 µm', near(g.pcx, e.pcx_um, 1e-6, 1e-7) && has(printed(e.pcx_um, 1).toFixed(1) + ' µm'), g.pcx, e.pcx_um);
        chk('bending buys 7 %', Math.round(100 * e.gain) === 7 && has('7 %'), 1 - g.rms[0] / g.pcx, e.gain); break;
      case 'stop-down':
        chk('RMS 4.1 µm', near(g.rms[0], e.rms_um, 1e-6, 1e-7) && has(printed(e.rms_um, 1).toFixed(1) + ' µm'), g.rms[0], e.rms_um);
        chk('"eight times smaller" (cube law)', e.ratio > 7.5 && e.ratio < 8.5 && has('eight times'), g.full / g.rms[0], e.ratio);
        chk('Strehl 0.80', near(g.strehl[0], e.strehl, 1e-8, 0) && printed(e.strehl, 2) === 0.8 && has('Strehl ≈ 0.8'), g.strehl[0], e.strehl); break;
      case 'singlet-white':
        chk('F–C 1.53 mm', near(g.FC, e.FC, 1e-9, 0) && has(printed(e.FC, 2).toFixed(2) + ' mm'), g.FC, e.FC);
        chk('best spot 66 µm', near(g.rms[0], e.rms_um, 1e-6, 1e-7) && has(String(printed(e.rms_um, 0)) + ' µm'), g.rms[0], e.rms_um); break;
      case 'achromat':
        chk('F–C 0.12 mm (from 1.53)', near(g.FC, e.FC, 1e-9, 0) && has(printed(e.FC, 2).toFixed(2) + ' mm') && near(g.singletFC, 1.5312440309691766, 1e-9, 0), g.FC, e.FC);
        chk('white-light spot 16 µm (from 66)', near(g.rms[0], e.rms_um, 1e-6, 1e-7) && has(String(printed(e.rms_um, 0)) + ' µm') && has(String(printed(e.singlet_um, 0)) + ' µm'), g.rms[0], e.rms_um); break;
      case 'cooke':
        chk('Petzval radius 2.9 f', near(Math.abs(g.petzR / g.efl), e.petz_over_f, 1e-9, 1e-9) && has(printed(e.petz_over_f, 1).toFixed(1) + ' × f'), Math.abs(g.petzR / g.efl), e.petz_over_f);
        chk('singlet 1.5 f', near(Math.abs(g.singletPetz), e.singlet_petz_over_f, 1e-9, 1e-9) && has(printed(e.singlet_petz_over_f, 1).toFixed(1) + ' × f'), Math.abs(g.singletPetz), e.singlet_petz_over_f);
        chk('RMS ≤ 23 µm over ±20°', near(Math.max(...g.rms), e.max_rms_um, 1e-6, 1e-7) && e.max_rms_um <= 23 && has('≤ 23 µm'), Math.max(...g.rms), e.max_rms_um); break;
      case 'landscape':
        chk('20° spot 60 µm', near(g.rms[g.rms.length - 1], e.edge_um, 1e-6, 1e-6) && has(String(printed(e.edge_um, 0)) + ' µm'), g.rms[g.rms.length - 1], e.edge_um);
        chk('stop at the lens 261 µm', near(g.atlens[g.atlens.length - 1], e.atlens_um, 1e-6, 1e-6) && has(String(printed(e.atlens_um, 0)) + ' µm'), g.atlens[g.atlens.length - 1], e.atlens_um);
        chk('coma vanishes (|S_II| < 0.5 % of the stop-at-lens value)', near(g.seidel.SII, e.SII, 1e-9, 1e-6) && Math.abs(e.SII) < 0.005 * Math.abs(e.SII_atlens), g.seidel.SII, e.SII); break;
      case 'optimise': {
        const ok = g.R.every((v, i) => Math.abs(v / e.R[i] - 1) < 2e-3), cat = g.R.every((v, i) => Math.abs(v / e.catalogue[i] - 1) < 0.015);
        chk('optimiser = scipy least_squares (0.2 %)', ok, g.R, e.R);
        chk('≈ catalogue AC254-100-A (1.5 %) and printed R ≈ 62, −45, −129', cat && has('R ≈ 62, −45, −129 mm') && g.R.map(v => Math.round(v)).join() === '62,-45,-129', g.R, e.catalogue);
        chk('EFL reaches 100 mm', near(g.eflAfter, 100, 1e-3, 0), g.eflAfter, 100); break;
      }
    }
  }
  results.push({ id: c.id, kind: c.kind, cmp, pass: pass && Object.values(cmp).every(v => v.ok), err: g && g.err });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'lensdesign', file: 'lensdesign.html',
  reference: 'bench-src/ref/gen_lensdesign.py — ray-optics 0.9.10 oracle (first-order data, Seidel sums, exact ray refraction, SCHOTT indices) + independent Python for ray aiming, spot RMS, best focus, OPD/Strehl/FFT MTF and a scipy least-squares optimiser',
  reference_citations: [
    'W. T. Welford, Aberrations of Optical Systems, Adam Hilger 1986, ch. 7-9 (paraxial trace, Seidel sums, wavefront aberration on the reference sphere)',
    'J. W. Goodman, Introduction to Fourier Optics, 4th ed., W. H. Freeman 2017, ch. 6 (PSF, OTF as pupil autocorrelation)',
    'M. Hayford, ray-optics 0.9.10, https://github.com/mjhoptics/ray-optics (BSD-3); SCHOTT optical glass catalogue via opticalglass',
    'Thorlabs public catalogue pages (LA1509, LBF254-100, AC254-100-A), read 2026-11-13'
  ],
  tolerance: 'first-order data 1e-9 relative (entrance-pupil position 1e-6: ray-optics models the infinite object at 1e10 mm); glass indices 2e-6 against the SCHOTT catalogue of ray-optics; Seidel sums 1e-6 relative; real-ray image points 1e-9 mm and directions 1e-12; RMS spots 1e-9 relative; best focus 1e-6 mm; OPD, Strehl and MTF 1e-8 absolute; distortion 1e-8 % and T/S focus 1e-7 mm; F–C focal shift 1e-9 mm; preset claims equal to the reference within 1e-6 and printed within their rounding; optimiser within 0.2 % of scipy least_squares',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`lensdesign: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, r.err || '', JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))).slice(0, 700));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
