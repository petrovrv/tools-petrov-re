// Benchmark driver for thinfilm.html.
// Reference: bench-src/ref/gen_thinfilm.py (independent Python: recursive Airy summation of Fresnel coefficients with N = n + ik,
// cross-checked against the `tmm` package of S. J. Byrnes (coh_tmm / inc_tmm); colour from the CIE CSV files; field by
// forward/backward amplitudes) -> ref/thinfilm_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_thinfilm.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_thinfilm.py, an independent Python implementation written from Born & Wolf (recursive Airy summation of Fresnel coefficients) and checked against the tmm package of S. J. Byrnes (coherent and incoherent transfer matrices); colour sums use the CIE CSV tables directly; not the page code.' };
const P = benchPaths({ name: 'thinfilm', page: 'thinfilm.html', ref: 'thinfilm_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_thinfilm', '1'); } catch (e) {} });
for (let attempt = 1; ; attempt++) {
  try { await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'commit', timeout: 90000 }); break; }
  catch (e) { if (attempt >= 3) throw e; }
}
await p.waitForFunction(() => window.__diagramReady && window.__thinfilm && window.__thinfilm.last, null, { timeout: 240000 });
const BUILD = await readPageManifestRevision(p);

const results = [];
for (const c of ref) {
  let g = null;
  try {
    g = await p.evaluate(([c]) => {
      const M = window.__thinfilm, s = M.state, ui = M.ui, F = window.OptFilm;
      function setState(st, extra) { Object.assign(s, JSON.parse(JSON.stringify(Object.assign({ view: 'spectrum', pol: 'avg', from: 380, to: 780, lambda0: 550 }, st, extra || {})))); ui.sync(); ui.run(); return M.last; }
      if (c.kind === 'engine') { const q = F.rt(c.stack, c.lambda, c.aoi); return { Rs: q.Rs, Rp: q.Rp, Ts: q.Ts, Tp: q.Tp }; }
      if (c.kind === 'spectrum') {
        const mid = c.lambdas[Math.floor(c.lambdas.length / 2)];
        const L = setState(c.state, { lambda0: mid, from: c.lambdas[0], to: c.lambdas[c.lambdas.length - 1] });
        if (L.err) return { err: L.err };
        const sp = F.spectrum(M.toStack(s), { lambdas: c.lambdas, aoi: s.aoi });
        return { Rs: sp.Rs, Rp: sp.Rp, Ts: sp.Ts, Tp: sp.Tp, tile: { lambda: mid, Rs: L.q0.Rs, Rp: L.q0.Rp, Ts: L.q0.Ts, Tp: L.q0.Tp } };
      }
      if (c.kind === 'colour') { const L = setState(c.state); return L.err ? { err: L.err } : { Y: L.col.Y, L: L.col.L, a: L.col.a, b: L.col.b }; }
      if (c.kind === 'field') { const L = setState(c.state, { lambda0: c.lambda, view: 'field', pol: 's' }); if (L.err) return { err: L.err }; const f = F.field(M.toStack(s), c.lambda, c.aoi || 0, 's', 10); return { E2: f.points.slice(0, c.expect.E2.length).map(q => q.E2), shown: L.field.points.length }; }
      if (c.kind === 'aha') {
        const r = {}, ex = id => { DiagramUI.current.example(id); return M.last; };
        let L = ex('mgf2'); r.mgf2 = { coated: L.q0.R }; s.layers = []; ui.sync(); ui.run(); r.mgf2.bare = M.last.q0.R;
        L = ex('vcoat'); r.vcoat = { R1064: L.q0.R }; s.lambda0 = 900; ui.sync(); ui.run(); r.vcoat.R900 = M.last.q0.R;
        L = ex('bbar'); r.bbar = { mean: F.bandStats(L.sp, 'R', 420, 680).mean, n: F.bandStats(L.sp, 'R', 420, 680).n };
        s.layers = [{ material: 'MgF2', t: 1, unit: 'qw' }]; ui.sync(); ui.run(); r.bbar.single = F.bandStats(M.last.sp, 'R', 420, 680).mean;
        L = ex('hr'); r.hr = { R: L.q0.R, layers: s.layers.length }; s.aoi = 45; ui.sync(); ui.run(); r.hr.Rp45 = M.last.q0.Rp;
        L = ex('hot'); { const st = M.toStack(s); const band = (aoi, centre) => { const sp = F.spectrum(st, { from: 400, to: 1200, step: 0.5, aoi }); const Lm = sp.lambda_nm, v = sp.T; let i = Lm.findIndex(l => l >= centre), a = i, b = i; while (a > 0 && v[a - 1] < 0.5) a--; while (b < Lm.length - 1 && v[b + 1] < 0.5) b++; return [Lm[a], Lm[b]]; };
          const e0 = band(0, 900), e45 = band(45, 830); r.hot = { e0, e45, shift: ((e0[0] - e45[0]) + (e0[1] - e45[1])) / 2, aoi: s.aoi }; }
        L = ex('fp'); { const sp = F.spectrum(M.toStack(s), { from: 610, to: 656, step: 0.01 }); const mx = Math.max(...sp.T), x = F.crossings(sp.lambda_nm, sp.T, mx / 2); r.fp = { peak: mx, fwhm: x[x.length - 1] - x[0] };
          s.dN = 3; M.generate(); const sp3 = F.spectrum(M.toStack(s), { from: 610, to: 656, step: 0.01 }); const m3 = Math.max(...sp3.T), x3 = F.crossings(sp3.lambda_nm, sp3.T, m3 / 2); r.fp.fwhm3 = x3[x3.length - 1] - x3[0]; }
        L = ex('metal'); { const i0 = L.sp.lambda_nm.findIndex(l => l >= 700), i1 = L.sp.lambda_nm.findIndex(l => l >= 900); const seg = L.sp.R.slice(i0, i1 + 1); const mn = Math.min(...seg); r.metal = { Al_min: mn, Al_min_at: L.sp.lambda_nm[i0 + seg.indexOf(mn)] };
          s.layers = [{ material: 'Ag', t: 150, unit: 'nm' }]; ui.sync(); ui.run(); const j0 = M.last.sp.lambda_nm.findIndex(l => l >= 780), j1 = M.last.sp.lambda_nm.findIndex(l => l >= 850); r.metal.Ag_min_780_850 = Math.min(...M.last.sp.R.slice(j0, j1 + 1)); }
        L = ex('pbs'); r.pbs = { Rs45: L.q0.Rs, Tp45: L.q0.Tp }; s.aoi = 35; ui.sync(); ui.run(); r.pbs.Rs35 = M.last.q0.Rs;
        L = ex('soap'); r.soap = { c300: { Y: L.col.Y, a: L.col.a, b: L.col.b } }; s.layers[0].t = 200; ui.sync(); ui.run(); r.soap.c200 = { Y: M.last.col.Y, a: M.last.col.a, b: M.last.col.b }; s.layers[0].t = 10; ui.sync(); ui.run(); r.soap.c10 = { Y: M.last.col.Y };
        L = ex('brewster'); { const A = L.ang; let k = 0; A.Rp.forEach((v, i) => { if (v < A.Rp[k]) k = i; }); r.brewster = { grid_min_deg: A.aoi_deg[k], view: s.view, Rs_grid: A.Rs[k], Rs_at_B: F.rt(M.toStack(s), 633, c.expect.brewster.theta_B).Rs, Rp_at_B: F.rt(M.toStack(s), 633, c.expect.brewster.theta_B).Rp }; }
        r.notes = window.__thinfilm.presets.map(x => ({ id: x.id, en: x.note.en, uk: x.note.uk }));
        DiagramUI.current.example('mgf2');
        return r;
      }
      return { err: 'unknown kind' };
    }, [c]);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!g && !g.err;
  const e = c.expect, tol = c.tol || {};
  const chk = (k, ok, got, exp) => { cmp[k] = { got, exp, ok }; if (!ok) pass = false; };
  if (pass) {
    if (c.kind === 'engine') for (const k of Object.keys(e)) chk(k, Math.abs(g[k] - e[k]) <= tol.abs, g[k], e[k]);
    else if (c.kind === 'spectrum') {
      for (const k of ['Rs', 'Rp', 'Ts', 'Tp']) { const bi = e[k].findIndex((v, i) => !(Math.abs(g[k][i] - v) <= tol.abs)); chk(k, bi < 0, bi < 0 ? 'all ' + e[k].length : g[k][bi], bi < 0 ? 'all' : e[k][bi]); }
      const mi = c.lambdas.indexOf(g.tile.lambda); for (const k of ['Rs', 'Rp', 'Ts', 'Tp']) chk('tile_' + k, Math.abs(g.tile[k] - e[k][mi]) <= tol.abs, g.tile[k], e[k][mi]);
    } else if (c.kind === 'colour') {
      chk('Y', Math.abs(g.Y - e.Y) <= tol.abs_Y, g.Y, e.Y); for (const k of ['L', 'a', 'b']) chk(k, Math.abs(g[k] - e[k]) <= tol.abs_Lab, g[k], e[k]);
    } else if (c.kind === 'field') {
      const bi = e.E2.findIndex((v, i) => !(Math.abs(g.E2[i] - v) <= tol.rel * Math.max(1, Math.abs(v)))); chk('E2', bi < 0, bi < 0 ? 'all ' + e.E2.length : g.E2[bi], bi < 0 ? 'all' : e.E2[bi]); chk('page_view_has_field', g.shown > e.E2.length, g.shown, '> ' + e.E2.length);
    } else if (c.kind === 'aha') {
      const A = e, G = g, r1 = (v, d) => Number((100 * v).toFixed(d));
      const close = (a, b, t) => Math.abs(a - b) <= t;
      chk('mgf2 4.2 → 1.2 %', close(G.mgf2.bare, A.mgf2.bare, 1e-9) && close(G.mgf2.coated, A.mgf2.coated, 1e-9) && r1(G.mgf2.bare, 1) === 4.2 && r1(G.mgf2.coated, 1) === 1.2, G.mgf2, A.mgf2);
      chk('vcoat ≈ 0 at 1064, 3.2 % at 900', close(G.vcoat.R1064, A.vcoat.R1064, 1e-9) && G.vcoat.R1064 < 1e-4 && close(G.vcoat.R900, A.vcoat.R900, 1e-9) && r1(G.vcoat.R900, 1) === 3.2, G.vcoat, A.vcoat);
      chk('bbar 0.4 % vs 1.4 %', G.bbar.n === 261 && close(G.bbar.mean, A.bbar.mean, 1e-9) && close(G.bbar.single, A.bbar.single, 1e-9) && r1(G.bbar.mean, 1) === 0.4 && r1(G.bbar.single, 1) === 1.4, G.bbar, A.bbar);
      chk('hr 99.987 %, Rp(45°) 99.4 %', G.hr.layers === 21 && close(G.hr.R, A.hr.R, 1e-9) && r1(G.hr.R, 3) === 99.987 && close(G.hr.Rp45, A.hr.Rp45, 1e-9) && r1(G.hr.Rp45, 1) === 99.4, G.hr, A.hr);
      chk('hot ≈ 75 nm blue shift', JSON.stringify(G.hot.e0) === JSON.stringify(A.hot.e0) && JSON.stringify(G.hot.e45) === JSON.stringify(A.hot.e45) && G.hot.shift > 65 && G.hot.shift < 85 && G.hot.aoi === 45, G.hot, A.hot);
      chk('fp 2.0 nm, 96 %, 5.4 nm with 3 pairs', close(G.fp.fwhm, A.fp.fwhm, 2e-3) && close(G.fp.peak, A.fp.peak, 1e-6) && G.fp.fwhm.toFixed(1) === '2.0' && r1(G.fp.peak, 0) === 96 && G.fp.fwhm3.toFixed(1) === '5.4', G.fp, A.fp);
      chk('Al 87 % near 800, Ag > 99 %', close(G.metal.Al_min, A.metal.Al_min, 1e-9) && G.metal.Al_min_at === A.metal.Al_min_at && r1(G.metal.Al_min, 0) === 87 && close(G.metal.Ag_min_780_850, A.metal.Ag_min_780_850, 1e-9) && G.metal.Ag_min_780_850 > 0.99, G.metal, A.metal);
      chk('pbs Rs 99.9 %, Tp 99.98 %, Rs(35°) 11 %', close(G.pbs.Rs45, A.pbs.Rs45, 1e-9) && close(G.pbs.Tp45, A.pbs.Tp45, 1e-9) && close(G.pbs.Rs35, A.pbs.Rs35, 1e-9) && r1(G.pbs.Rs45, 1) === 99.9 && r1(G.pbs.Tp45, 2) === 99.98 && r1(G.pbs.Rs35, 0) === 11, G.pbs, A.pbs);
      chk('soap green / purple / 0.2 %', close(G.soap.c300.a, A.soap.c300.a, 1e-5) && G.soap.c300.a < -5 && G.soap.c300.b > 5 && close(G.soap.c200.a, A.soap.c200.a, 1e-5) && G.soap.c200.a > 10 && G.soap.c200.b < -10 && close(G.soap.c10.Y, A.soap.c10.Y, 1e-6) && G.soap.c10.Y.toFixed(1) === '0.2', G.soap, A.soap);
      /* review R-15: the 13 % is read from the page (its own rt at θ_B and the angle-plot sample nearest to it), not only from the reference */
      chk('brewster 55.5°, 13 %', G.brewster.view === 'angle' && Math.abs(G.brewster.grid_min_deg - A.brewster.theta_B) <= 0.25 && A.brewster.theta_B.toFixed(1) === '55.5' && r1(A.brewster.Rs_at_B, 0) === 13
        && close(G.brewster.Rs_at_B, A.brewster.Rs_at_B, 1e-9) && G.brewster.Rp_at_B < 1e-7 && r1(G.brewster.Rs_grid, 0) === 13, G.brewster, A.brewster);
      /* each preset note carries its own numbers, in English and (decimal comma, нм) in Ukrainian */
      const NUM = { mgf2: ['4.2 %', '1.2 %'], vcoat: ['3.2 %', '900 nm'], bbar: ['0.4 %', '1.4 %', '420–680 nm'], hr: ['99.987 %', '99.4 %', '45°'], hot: ['75 nm', '45°'], fp: ['2.0 nm', '96 %', '5.4 nm'],
                    metal: ['87 %', '99 %'], pbs: ['99.9 %', '99.98 %', '11 %', '35°'], soap: ['300 nm', '200 nm', '0.2 %'], brewster: ['55.5°', '13 %'] };
      const ukOf = t => t.replace(/(\d)\.(\d)/g, '$1,$2').replace(/ nm\b/g, ' нм');
      const miss = [];
      for (const n of G.notes) for (const t of NUM[n.id] || ['?']) { if (!n.en.includes(t)) miss.push(n.id + ' en ' + t); if (!n.uk.includes(ukOf(t))) miss.push(n.id + ' uk ' + ukOf(t)); }
      chk('notes carry the numbers (each preset, en + uk)', miss.length === 0 && G.notes.length === 10, miss, null);
    }
  }
  results.push({ id: c.id, kind: c.kind, note: c.note, cmp, pass: pass && Object.values(cmp).every(v => v.ok) });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'thinfilm', file: 'thinfilm.html',
  reference: 'bench-src/ref/gen_thinfilm.py — independent Python implementation (recursive Airy summation of Fresnel coefficients, N = n + ik; tmm package of S. J. Byrnes as second oracle for every spectrum, incl. incoherent substrates; CIE CSV colour sums; forward/backward amplitude field)',
  reference_citations: [
    'H. A. Macleod, Thin-Film Optical Filters, 5th ed., CRC Press 2018, ch. 2 (characteristic matrix, tilted admittances), ch. 3-7 (designs)',
    'M. Born, E. Wolf, Principles of Optics, 7th ed., Cambridge 1999, section 1.6 (stratified media, recursive Airy summation)',
    'S. J. Byrnes, Multilayer optical calculations, arXiv:1603.02720 (tmm package, coherent and incoherent)',
    'CIE 015:2018 Colorimetry; CIE 1931 2° colour-matching functions and illuminant D65 tables, files.cie.co.at (read 2026-11-13)',
    'M. N. Polyanskiy, refractiveindex.info database (CC0), Sci. Data 11, 94 (2024): film data of the materials used'
  ],
  tolerance: 'absolute 1e-9 on R and T (same physics, double precision, different algorithm); 1e-12 on closed-form cases; luminous reflectance 1e-6 %, L*a*b* 1e-5; field |E|² relative 1e-9; preset claims within the rounding of their printed text and equal to the reference values',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`thinfilm: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))).slice(0, 700));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
