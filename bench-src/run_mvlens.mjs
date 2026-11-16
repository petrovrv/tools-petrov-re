// Benchmark driver for mvlens.html (Machine-Vision Lens Selector).
// Reference: bench-src/ref/gen_mvlens.py (independent Python: paraxial ray trace through a thin lens, depth of field by
// bisection on the traced blur, MTF as the numerically integrated pupil overlap, Airy radius from the first root of J1,
// motion and perspective by chief-ray projection) -> ref/mvlens_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_mvlens.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_mvlens.py, an independent Python implementation written from W. J. Smith, Modern Optical Engineering (2008) ch. 2-6 and J. W. Goodman, Introduction to Fourier Optics (2017) sec. 7.4; it traces paraxial rays through the thin lens, finds the depth-of-field limits by bisection on the traced blur, integrates the pupil overlap numerically for the MTF, takes the Airy radius from the first root of J1 and projects chief rays for motion and perspective — not the page code. Sensor geometry from Sony\u2019s public industrial image-sensor list (read 2026-11-13).' };
const P = benchPaths({ name: 'mvlens', page: 'mvlens.html', ref: 'mvlens_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_mvlens', '1'); } catch (e) {} });
for (let attempt = 1; ; attempt++) {
  try { await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'commit', timeout: 90000 }); break; }
  catch (e) { if (attempt >= 3) throw e; }
}
await p.waitForFunction(() => window.__diagramReady && window.__mvlens && window.__mvlens.last, null, { timeout: 240000 });
const BUILD = await readPageManifestRevision(p);

const rel = (got, exp, tol) => (exp === null || exp === undefined) ? (got === null || got === undefined || !isFinite(got)) : (typeof got === 'number' && Math.abs(got - exp) <= Math.max(tol.abs || 0, tol.rel * Math.abs(exp)));
/* the number printed in a preset note, rounded as printed */
const printed = (v, digits) => Number(v.toFixed(digits));

const results = [];
for (const c of ref) {
  let g = null;
  try {
    g = await p.evaluate(([c]) => {
      const M = window.__mvlens, s = M.state, ui = M.ui;
      if (c.kind === 'mtf') {
        const st = c.state;
        return { diff: st.nus.map(nu => window.OptMV.mtfDiff(nu, st.lam, st.Nw)), pix: st.nus.map(nu => window.OptMV.mtfPixel(nu, st.p)) };
      }
      if (c.kind === 'aha') DiagramUI.current.example(c.preset);
      else { Object.keys(c.state).forEach(k => { s[k] = JSON.parse(JSON.stringify(c.state[k])); }); ui.sync(); ui.run(); }
      const L = M.last;
      if (!L || L.err) return { err: L ? L.err : 'none' };
      const o = L.main;
      const r = { state: JSON.parse(JSON.stringify(s)), fIdeal: L.fIdeal, recommended: L.recommended, f: L.fChosen, opt: L.opt,
        main: { m: o.m, fovW: o.fovW, fovH: o.fovH, sImg: o.sImg, ext: o.ext, Nw: o.Nw, umPerPx: o.umPerPx, featPx: isFinite(o.featPx) ? o.featPx : null, airy_um: o.airy_um,
                nyq: o.nyq, cut: o.cut, mtfDiff: o.mtfDiff, mtfPix: o.mtfPix, dof_near: o.dof.near, dof_far: isFinite(o.dof.far) ? o.dof.far : null, geo_um: o.geo_um, blur_um: o.blur_um,
                motionPx: o.motionPx, tMax_us: o.tMax_s * 1e6, depthOk: o.depthOk, blurPx: o.blurPx },
        tele: L.tele || null, warn: L.warn.slice(), verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim(),
        diag: L.diag, format: L.format ? L.format.type : null, mounts: L.mounts.slice(), depthMax: L.depthMax_mm };
      const cmpOf = o => ({ f: o.f, m: o.m, cutObj: o.cut * o.m, nyqObj: o.nyq * o.m, mtfSys: o.mtfSys });
      if (L.cmpA && L.cmpB) {
        r.cmpData = { [L.cmpA.sensor.id]: cmpOf(L.cmpA), [L.cmpB.sensor.id]: cmpOf(L.cmpB) };
        const A = L.cmpA, nu = L.cmpB.nyq * L.cmpB.m / A.m;
        r.cmpData[A.sensor.id].mtfAtB = window.OptMV.mtfDiff(nu, c.state.lambda_nm * 1e-6, A.Nw) * window.OptMV.mtfPixel(nu, A.sensor.pitch_um / 1000);
      }
      r.noteText = c.kind === 'aha' ? ((document.querySelector('.dgu-example-note, [data-dgu-example-note]') || {}).textContent || document.body.innerText) : '';
      if (c.kind === 'aha' && c.preset === 'mp') {
        r.cmp = L.cmpA && L.cmpB ? { a: L.cmpA.sensor.id, b: L.cmpB.sensor.id } : null;
        s.N = 2.8; ui.sync(); ui.run(); r.mtf_f28 = M.last.main.mtfDiff; DiagramUI.current.example(c.preset);
      }
      return r;
    }, [c]);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!g && !g.err;
  const chk = (k, ok, got, exp) => { cmp[k] = { got, exp, ok: !!ok }; if (!ok) pass = false; };
  const e = c.expect;
  if (pass && c.kind === 'mtf') {
    const bd = e.diff.findIndex((v, i) => Math.abs(g.diff[i] - v) > 2e-6), bp = e.pix.findIndex((v, i) => Math.abs(g.pix[i] - v) > 1e-9);
    chk('lens MTF (pupil overlap)', bd < 0, bd < 0 ? 'all ' + e.diff.length : g.diff[bd], bd < 0 ? 'all' : e.diff[bd]);
    chk('pixel MTF', bp < 0, bp < 0 ? 'all' : g.pix[bp], bp < 0 ? 'all' : e.pix[bp]);
  } else if (pass && c.kind === 'setup') {
    const m = g.main, x = e.main, T = { rel: 1e-9 };
    chk('fIdeal', rel(g.fIdeal, e.fIdeal, T), g.fIdeal, e.fIdeal);
    chk('recommended', g.recommended === e.recommended, g.recommended, e.recommended);
    chk('focal used', rel(g.f, e.f, T), g.f, e.f);
    for (const k of ['m', 'fovW', 'fovH', 'sImg', 'ext', 'Nw', 'umPerPx', 'nyq', 'cut', 'mtfPix']) chk(k, rel(m[k], x[k], T), m[k], x[k]);
    chk('featPx', rel(m.featPx, x.featPx, T), m.featPx, x.featPx);
    chk('airy_um (J1 root)', rel(m.airy_um, x.airy_um, { rel: 1e-9 }), m.airy_um, x.airy_um);
    chk('mtfDiff (pupil overlap)', Math.abs(m.mtfDiff - x.mtfDiff) <= 2e-6, m.mtfDiff, x.mtfDiff);
    chk('dof_near (bisection)', rel(m.dof_near, x.dof_near, { rel: 1e-9 }), m.dof_near, x.dof_near);
    chk('dof_far (bisection)', rel(m.dof_far, x.dof_far, { rel: 1e-9 }), m.dof_far, x.dof_far);
    chk('defocus blur (traced)', rel(m.geo_um, x.geo_um, { rel: 1e-9, abs: 1e-9 }), m.geo_um, x.geo_um);
    chk('total blur', rel(m.blur_um, x.blur_um, { rel: 1e-9 }), m.blur_um, x.blur_um);
    if ('motionPx' in x) { chk('motion px (chief rays)', rel(m.motionPx, x.motionPx, T), m.motionPx, x.motionPx); chk('max exposure', rel(m.tMax_us, x.tMax_us, { rel: 1e-9 }), m.tMax_us, x.tMax_us); }
    if ('persp_err_mm' in x) { chk('perspective error', g.tele && rel(g.tele.err_mm, x.persp_err_mm, { rel: 1e-9 }), g.tele && g.tele.err_mm, x.persp_err_mm); chk('telecentric error', g.tele && rel(g.tele.teleErr_mm, x.tele_err_mm, T), g.tele && g.tele.teleErr_mm, x.tele_err_mm); }
    if (e.opt) { chk('sharpest f-number', g.opt && rel(g.opt.N, e.opt.N, { rel: 2e-4 }), g.opt && g.opt.N, e.opt.N); chk('sharpest stop', g.opt && g.opt.stop === e.opt.stop, g.opt && g.opt.stop, e.opt.stop); chk('blur at the optimum', g.opt && rel(g.opt.blur_um, e.opt.blur_um, { rel: 1e-7 }), g.opt && g.opt.blur_um, e.opt.blur_um); }
  } else if (pass && c.kind === 'extra') {
    chk('focal used', rel(g.f, e.f, { rel: 1e-9 }), g.f, e.f);
    chk('recommended', g.recommended === e.recommended, g.recommended, e.recommended);
    chk('warnings', JSON.stringify(g.warn.slice().sort()) === JSON.stringify(e.warn), g.warn.slice().sort(), e.warn);
    if ('format' in e) { chk('image circle (listed diagonal)', rel(g.diag, e.diag, { rel: 1e-12 }), g.diag, e.diag); chk('lens format', g.format === e.format, g.format, e.format); chk('mounts', JSON.stringify(g.mounts) === JSON.stringify(e.mounts), g.mounts, e.mounts); }
    if ('depthMax' in e) chk('depth limit 2 (s − f)', rel(g.depthMax, e.depthMax, { rel: 1e-12 }), g.depthMax, e.depthMax);
    if (e.noOpt) { chk('no optimum beyond the limit', g.opt === null, g.opt, null); chk('blur infinite (no NaN)', g.main.blurPx === Infinity, String(g.main.blurPx), 'Infinity'); }
    if (e.cmp) for (const sid of Object.keys(e.cmp)) for (const k of ['f', 'm', 'cutObj', 'nyqObj']) chk(sid + ' ' + k, g.cmpData && rel(g.cmpData[sid][k], e.cmp[sid][k], { rel: 1e-9 }), g.cmpData && g.cmpData[sid][k], e.cmp[sid][k]);
    if (e.cmp) for (const sid of Object.keys(e.cmp)) chk(sid + ' system MTF at Nyquist', g.cmpData && Math.abs(g.cmpData[sid].mtfSys - e.cmp[sid].mtfSys) <= 2e-6, g.cmpData && g.cmpData[sid].mtfSys, e.cmp[sid].mtfSys);
  } else if (pass && c.kind === 'aha') {
    const m = g.main, x = e.main;
    chk('preset state as reference', Object.keys(c.state).every(k => JSON.stringify(g.state[k]) === JSON.stringify(c.state[k])), null, null);
    chk('focal ' + e.f + ' mm', g.f === e.f, g.f, e.f);
    switch (c.preset) {
      case 'conveyor': chk('6.7 px at 1 ms', rel(m.motionPx, x.motionPx, { rel: 1e-9 }) && printed(m.motionPx, 1) === 6.7, m.motionPx, x.motionPx);
        chk('≤ 150 µs for 1 px', rel(m.tMax_us, x.tMax_us, { rel: 1e-9 }) && Math.round(m.tMax_us / 10) * 10 === 150, m.tMax_us, x.tMax_us); chk('motion warning', g.warn.includes('motion'), g.warn, 'motion'); break;
      case 'pcb': chk('f/16 blurs 7 px', rel(m.blurPx, e.blurPx_f16, { rel: 1e-7 }) && Math.round(m.blurPx) === 7, m.blurPx, e.blurPx_f16);
        chk('sharpest f/5.6', g.opt.stop === 5.6 && e.opt.stop === 5.6, g.opt.stop, e.opt.stop);
        chk('3.5 px at f/5.6', rel(g.opt.stopBlur_um / 3.45, e.blurPx_stop, { rel: 1e-7 }) && printed(e.blurPx_stop, 1) === 3.5, g.opt.stopBlur_um / 3.45, e.blurPx_stop); break;
      case 'bin': chk('0.84 × 0.61 m', printed(m.fovW / 1000, 2) === 0.84 && printed(m.fovH / 1000, 2) === 0.61 && rel(m.fovW, x.fovW, { rel: 1e-9 }), [m.fovW, m.fovH], [x.fovW, x.fovH]);
        chk('geometric DOF (c = 2 px) covers 300 mm', m.depthOk && e.depth_ok, m.depthOk, e.depth_ok);
        chk('diffraction alone 3.2 px', printed(m.airy_um / 3.45, 1) === 3.2 && rel(m.airy_um / 3.45, e.airyPx, { rel: 1e-9 }), m.airy_um / 3.45, e.airyPx);
        chk('total ≈ 3.6 px at f/8', printed(m.blurPx, 1) === 3.6 && rel(m.blurPx, e.blurPx, { rel: 1e-9 }), m.blurPx, e.blurPx);
        chk('sharpest f/5.6 at 3.3 px', g.opt.stop === 5.6 && e.opt.stop === 5.6 && printed(g.opt.stopBlur_um / 3.45, 1) === 3.3 && rel(g.opt.stopBlur_um / 3.45, e.stopBlurPx, { rel: 1e-7 }), g.opt.stopBlur_um / 3.45, e.stopBlurPx); chk('0.2 mm/px', printed(m.umPerPx / 1000, 1) === 0.2 && rel(m.umPerPx, x.umPerPx, { rel: 1e-9 }), m.umPerPx, x.umPerPx); break;
      case 'shaft': chk('0.10 mm error', printed(g.tele.err_mm, 2) === 0.10 && rel(g.tele.err_mm, x.persp_err_mm, { rel: 1e-9 }), g.tele.err_mm, x.persp_err_mm);
        chk('10× tolerance', Math.round(g.tele.err_mm / 0.01) === 10, g.tele.err_mm / 0.01, 10);
        chk('telecentric 3.5 µm', printed(g.tele.teleErr_mm * 1000, 1) === 3.5 && rel(g.tele.teleErr_mm, x.tele_err_mm, { rel: 1e-9 }), g.tele.teleErr_mm * 1000, x.tele_err_mm * 1000); break;
      case 'barcode': chk('≈ 100 µs max', Math.round(m.tMax_us / 10) * 10 === 100 && rel(m.tMax_us, x.tMax_us, { rel: 1e-9 }), m.tMax_us, x.tMax_us);
        chk('1.6 px per bar', printed(m.featPx, 1) === 1.6 && rel(m.featPx, x.featPx, { rel: 1e-9 }), m.featPx, x.featPx); chk('0.84 m field', printed(m.fovW / 1000, 2) === 0.84, m.fovW, x.fovW);
        chk('feature warning', g.warn.includes('feature'), g.warn, 'feature'); break;
      case 'mp': chk('Nyquist 270 lp/mm', Math.round(m.nyq) === 270 && rel(m.nyq, x.nyq, { rel: 1e-9 }), m.nyq, x.nyq);
        chk('cut-off 205 lp/mm', Math.round(m.cut / 5) * 5 === 205 && rel(m.cut, x.cut, { rel: 1e-9 }), m.cut, x.cut);
        chk('no detail at f/8 (MTF 0)', m.mtfDiff === 0 && x.mtfDiff === 0, m.mtfDiff, x.mtfDiff);
        chk('detail at f/2.8', g.mtf_f28 > 0.3 && Math.abs(g.mtf_f28 - e.mtf_f28) <= 2e-6, g.mtf_f28, e.mtf_f28);
        chk('comparison IMX226 vs IMX264 shown', g.cmp && g.cmp.a === 'IMX226' && g.cmp.b === 'IMX264', g.cmp, 'IMX226/IMX264');
        { const A = g.cmpData && g.cmpData.IMX226, B = g.cmpData && g.cmpData.IMX264, EA = e.cmp.IMX226, EB = e.cmp.IMX264;
          chk('12 MP passes ≤ 25.3 lp/mm on the object', A && printed(A.cutObj, 1) === 25.3 && rel(A.cutObj, EA.cutObj, { rel: 1e-9 }), A && A.cutObj, EA.cutObj);
          chk('5 MP Nyquist 20.5 lp/mm on the object', B && printed(B.nyqObj, 1) === 20.5 && rel(B.nyqObj, EB.nyqObj, { rel: 1e-9 }), B && B.nyqObj, EB.nyqObj);
          chk('~23 % finer at most', A && B && Math.round(100 * (A.cutObj / B.nyqObj - 1)) === 23, A && B && A.cutObj / B.nyqObj - 1, EA.cutObj / EB.nyqObj - 1);
          chk('under 10 % contrast there', A && A.mtfAtB < 0.1 && Math.abs(A.mtfAtB - EA.mtfAtB) <= 2e-6, A && A.mtfAtB, EA.mtfAtB); }
        break;
      case 'macro': chk('0.71×', printed(m.m, 2) === 0.71 && rel(m.m, x.m, { rel: 1e-9 }), m.m, x.m);
        chk('17.9 mm extension', printed(m.ext, 1) === 17.9 && rel(m.ext, x.ext, { rel: 1e-9 }), m.ext, x.ext);
        chk('f/4 → f/6.9', printed(m.Nw, 1) === 6.9 && rel(m.Nw, x.Nw, { rel: 1e-9 }), m.Nw, x.Nw); break;
    }
  }
  results.push({ id: c.id, kind: c.kind, cmp, pass: pass && Object.values(cmp).every(v => v.ok) });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'mvlens', file: 'mvlens.html',
  reference: 'bench-src/ref/gen_mvlens.py — independent Python implementation (paraxial ray trace through a thin lens; DOF by bisection on the traced blur; MTF by Simpson integration of the pupil overlap; J1 root for the Airy disc; chief-ray projection for motion blur and perspective error)',
  reference_citations: [
    'W. J. Smith, Modern Optical Engineering, 4th ed., McGraw-Hill 2008, ch. 2-6 (Gaussian lens equation, paraxial ray trace, working f-number, depth of field)',
    'J. W. Goodman, Introduction to Fourier Optics, 4th ed., W. H. Freeman 2017, sec. 7.4 (incoherent OTF = normalised pupil autocorrelation; Airy pattern)',
    'Sony Semiconductor Solutions, industrial image-sensor list (CSV behind https://www.sony-semicon.com/en/products/is/industry/global-shutter.html), read 2026-11-13'
  ],
  tolerance: 'relative 1e-9 on geometry, magnification, resolution, Airy disc, DOF limits, blur, motion and perspective (same physics, different algorithms: ray trace and bisection against closed forms); lens MTF within 2e-6 absolute of the numerically integrated pupil overlap; sharpest f-number within 2e-4 relative of a dense scan; preset claims within the rounding of their printed text',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`mvlens: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
