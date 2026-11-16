// Benchmark driver for gaussbeam.html.
// Reference: bench-src/ref/gen_gaussbeam.py (independent Python: physical-q ABCD with interface matrices, Self 1983,
// numerical 2-D overlap integrals, ISO 11146-1 least squares, round-trip eigenmodes, intermediate-waist mode matching)
// -> ref/gaussbeam_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_gaussbeam.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_gaussbeam.py, an independent Python implementation written from Siegman, Lasers (1986) ch. 15-21, Kogelnik & Li, Appl. Opt. 5 (1966) 1550, Self, Appl. Opt. 22 (1983) 658, Joyce & DeLoach, Appl. Opt. 23 (1984) 4187 and ISO 11146-1:2021 section 9; it uses the physical q with interface matrices, numerical overlap integrals and an intermediate-waist mode-matching search, not the page code.' };
const P = benchPaths({ name: 'gaussbeam', page: 'gaussbeam.html', ref: 'gaussbeam_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_gaussbeam', '1'); } catch (e) {} });
for (let attempt = 1; ; attempt++) {           // a busy local server occasionally stalls the first request
  try { await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'commit', timeout: 90000 }); break; }
  catch (e) { if (attempt >= 3) throw e; }
}
await p.waitForFunction(() => window.__diagramReady && window.__gaussbeam && window.__gaussbeam.last, null, { timeout: 240000 });
const BUILD = await readPageManifestRevision(p);

function rel(got, exp, tol) {
  if (exp === null || exp === undefined) return got === null || got === undefined || !isFinite(got) || Math.abs(got) > 1e12;
  return typeof got === 'number' && Math.abs(got - exp) <= Math.max(tol.abs_m || 0, (tol.rel || 1e-9) * Math.abs(exp));
}
const results = [];
for (const c of ref) {
  let g = null;
  try {
    g = await p.evaluate(([c]) => {
      const M = window.__gaussbeam, s = M.state, ui = M.ui;
      if (c.kind === 'aha') { DiagramUI.current.example(c.preset); }
      else { Object.keys(c.state).forEach(k => { s[k] = JSON.parse(JSON.stringify(c.state[k])); }); ui.sync(); ui.run(); }
      const L = M.last;
      if (!L || L.err) return { err: L ? L.err : 'none' };
      const r = { verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim() };
      if (c.kind === 'propagate') {
        const pick = c.expect.pick;
        ['x', 'y'].forEach(ax => {
          r['w_' + ax] = pick.map(i => L.prop[ax].w[i]);
          r['R_' + ax] = pick.map(i => L.prop[ax].R[i]);
          r['final_w0_' + ax] = L.out[ax].w0; r['final_z0_' + ax] = L.out[ax].z0; r['final_zR_' + ax] = L.out[ax].zR;
        });
        r.tile = (document.querySelector('.dgu-tile-v') || {}).textContent;
      } else if (c.kind === 'self') {
        r.w0 = L.prop.segments[1].x.w0; r.z0 = L.prop.segments[1].x.z0;
        r.self_w0 = L.self ? L.self.w0 : null; r.self_z0 = L.self ? c.state.elements[0].z_mm / 1000 + L.self.s2 : null;
      } else if (c.kind === 'gouy') {
        r.gouy = L.prop.x.gouy[L.prop.x.gouy.length - 1] - L.prop.x.gouy[0];
      } else if (c.kind === 'clip') {
        r.clipT = L.prop.at.filter(a => a.clipT != null).map(a => a.clipT);
      } else if (c.kind === 'fibre') {
        r.eta = L.fib.eta; r.w_face = L.fib.wx;
      } else if (c.kind === 'iso') {
        r.w0 = L.B.fit.w0; r.z0 = L.B.fit.z0; r.M2 = L.B.fit.M2;
      } else if (c.kind === 'cavity') {
        const k = L.cav; r.g1g2 = k.G; r.stable = k.stable; r.FSR = k.FSR;
        if (k.stable) { r.w1 = k.w1; r.w0 = k.w0; r.z1 = k.z1; r.dnuT_frac = k.dnuT / k.FSR; }
      } else if (c.kind === 'match') {
        r.page = L.match.map(m => ({ f1: m.f1, f2: m.f2, x1: m.x1, x2: m.x2 })); r.pageTotal = L.matchTotal;
        r.verdictHasTotal = r.verdict.indexOf(String(L.matchTotal)) >= 0;
        const B = L.B, st = s;
        const foc = st.focals.split(/\s+/).map(Number).map(v => ({ f: v / 1000, label: String(v) }));
        r.full = window.OptGauss.modeMatch({ lambda: B.lambda, M2: B.x.M2, inW0: B.x.w0, inZ0: B.x.z0, tW0: st.tW0_um * 1e-6, tZ0: st.tZ0_mm / 1000, focals: foc,
          zMin: st.mzMin_mm / 1000, zMax: st.mzMax_mm / 1000, minGap: st.mGap_mm / 1000, max: 100000 }).map(m => ({ f1: m.f1, f2: m.f2, x1: m.x1, x2: m.x2 }));
      } else if (c.kind === 'aha') {
        r.state = JSON.parse(JSON.stringify(s));
        const segs = L.prop ? L.prop.segments : null;
        switch (c.preset) {
          case 'hene100': r.shift_mm = (L.out.x.z0 - 0.3) * 1000; r.w0_um = L.out.x.w0 * 1e6; break;
          case 'm2spot': { const a = L.out.x.w0; s.M2 = 1; ui.sync(); ui.run(); r.w0_m1_um = M.last.out.x.w0 * 1e6; r.ratio = a / M.last.out.x.w0; break; }
          case 'harder': { const a = L.out.x; s.elements[0].f_mm = 40; ui.sync(); ui.run(); const b = M.last.out.x; r.spot_ratio = a.w0 / b.w0; r.zR_ratio = a.zR / b.zR; break; }
          case 'galileo': case 'kepler': r.length_mm = (s.elements[s.elements.length - 1].z_mm - s.elements[0].z_mm); r.internal_real = segs[1].x.inside; r.internal_w0_um = segs[1].x.w0 * 1e6; r.mag = L.out.x.w0 / segs[0].x.w0; r.clip_ok = !L.prop.warnings.some(w => w.code === 'clip'); break;
          case 'smf28': r.eta0 = L.fib.eta0; r.loss3_dB = -10 * Math.log10(L.fib.eta); break;
          case 'match': { const B = L.B; const foc = s.focals.split(/\s+/).map(Number).map(v => ({ f: v / 1000, label: String(v) })); const all = window.OptGauss.modeMatch({ lambda: B.lambda, M2: 1, inW0: B.x.w0, inZ0: B.x.z0, tW0: s.tW0_um * 1e-6, tZ0: s.tZ0_mm / 1000, focals: foc, zMin: s.mzMin_mm / 1000, zMax: s.mzMax_mm / 1000, minGap: s.mGap_mm / 1000, max: 100000 }); r.n = all.length; r.min_len_mm = Math.min(...all.map(m => m.length)) * 1000; r.max_len_mm = Math.max(...all.map(m => m.length)) * 1000; r.shown = L.match.length; break; }
          case 'fold': r.split_mm = (L.out.y.z0 - L.out.x.z0) * 1000; break;
          case 'edge': { const a = L.cav.w1; s.L_mm = 500; ui.sync(); ui.run(); r.spot_ratio = a / M.last.cav.w1; break; }
          case 'iso': r.M2 = L.B.fit.M2; r.isoOk = L.B.fit.isoOk; break;
        }
        DiagramUI.current.example(c.preset);    // leave the preset as shipped
      }
      return r;
    }, [c]);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!g && !g.err;
  const e = c.expect, tol = c.tol || {};
  const chk = (k, ok, got, exp) => { cmp[k] = { got, exp, ok }; if (!ok) pass = false; };
  if (pass) {
    if (c.kind === 'propagate') {
      for (const ax of ['x', 'y']) {
        const bw = e['w_' + ax].findIndex((v, i) => !rel(g['w_' + ax][i], v, tol));
        chk('w_' + ax, bw < 0, bw < 0 ? 'all ' + e['w_' + ax].length : g['w_' + ax][bw], bw < 0 ? 'all' : e['w_' + ax][bw]);
        const bR = e['R_' + ax].findIndex((v, i) => !rel(g['R_' + ax][i], v, { rel: 1e-7 }));
        chk('R_' + ax, bR < 0, bR < 0 ? 'all' : g['R_' + ax][bR], bR < 0 ? 'all' : e['R_' + ax][bR]);
        for (const k of ['final_w0_', 'final_z0_', 'final_zR_']) chk(k + ax, rel(g[k + ax], e[k + ax], { rel: 1e-8, abs_m: 1e-11 }), g[k + ax], e[k + ax]);
      }
    } else if (c.kind === 'self') {
      chk('w0', rel(g.w0, e.w0, tol), g.w0, e.w0); chk('z0', rel(g.z0, e.z0, { rel: 1e-9, abs_m: 1e-12 }), g.z0, e.z0);
      chk('self_w0', rel(g.self_w0, e.w0, tol), g.self_w0, e.w0); chk('self_z0', rel(g.self_z0, e.z0, { rel: 1e-9, abs_m: 1e-12 }), g.self_z0, e.z0);
    } else if (c.kind === 'gouy') {
      chk('gouy', rel(g.gouy, e.gouy, tol), g.gouy, e.gouy);
    } else if (c.kind === 'clip') {
      chk('n', g.clipT.length === e.clipT.length, g.clipT.length, e.clipT.length);
      e.clipT.forEach((v, i) => chk('clipT' + i, Math.abs(g.clipT[i] - v) <= tol.abs, g.clipT[i], v));
    } else if (c.kind === 'fibre') {
      chk('eta', Math.abs(g.eta - e.eta) <= tol.abs_eta, g.eta, e.eta); chk('w_face', rel(g.w_face, e.w_face, { rel: 1e-9 }), g.w_face, e.w_face);
    } else if (c.kind === 'iso') {
      for (const k of ['w0', 'z0', 'M2']) chk(k, rel(g[k], e[k], tol), g[k], e[k]);
    } else if (c.kind === 'cavity') {
      chk('stable', g.stable === e.stable, g.stable, e.stable);
      for (const k of ['g1g2', 'FSR', 'w1', 'w0', 'z1', 'dnuT_frac']) if (k in e) chk(k, rel(g[k], e[k], { rel: 1e-8, abs_m: 1e-12 }), g[k], e[k]);
    } else if (c.kind === 'match') {
      const same = (a, b) => a.f1 === b.f1 && a.f2 === b.f2 && Math.abs(a.x1 - b.x1) < tol.pos_m && Math.abs(a.x2 - b.x2) < tol.pos_m;
      const shownOk = g.page.every(s => e.solutions.some(r => same(s, r)));
      chk('shown_solutions_exact', shownOk && g.page.length === Math.min(12, e.count), g.page.length, Math.min(12, e.count));
      const missing = e.solutions.filter(r => !g.full.some(s => same(s, r))).length, extra = g.full.filter(s => !e.solutions.some(r => same(s, r))).length;
      chk('full_set', missing === 0 && extra === 0, { found: g.full.length, missing, extra }, e.count);
      chk('page_total = both reference methods (review R-6, R-13)', g.pageTotal === e.count && e.count === e.count_equal_size_method && g.verdictHasTotal, g.pageTotal, [e.count, e.count_equal_size_method]);
    } else if (c.kind === 'aha') {
      const sameState = Object.keys(c.state).every(k => JSON.stringify(g.state[k]) === JSON.stringify(c.state[k]));
      chk('preset_state_as_reference', sameState, null, null);
      switch (c.preset) {
        case 'hene100': chk('shift_mm', rel(g.shift_mm, e.shift_mm, { rel: 1e-6 }) && g.shift_mm > 1.5 && g.shift_mm < 1.7, g.shift_mm, e.shift_mm); chk('w0_um≈50', Math.abs(g.w0_um - 50) < 2.5 && rel(g.w0_um, e.w0_um, { rel: 1e-6 }), g.w0_um, e.w0_um); break;
        case 'm2spot': chk('ratio 1.30', rel(g.ratio, e.ratio, { rel: 1e-6 }) && Math.abs(g.ratio - 1.3) < 0.005, g.ratio, e.ratio); chk('M2=1 → 13.5 µm', Math.abs(g.w0_m1_um - 13.5) < 0.05 && rel(g.w0_m1_um, e.w0_m1_um, { rel: 1e-6 }), g.w0_m1_um, e.w0_m1_um); break;
        case 'harder': chk('spot 0.5×', rel(g.spot_ratio, e.spot_ratio, { rel: 1e-6 }) && Math.abs(g.spot_ratio - 0.5) < 0.01, g.spot_ratio, e.spot_ratio); chk('zR 0.25×', rel(g.zR_ratio, e.zR_ratio, { rel: 1e-6 }) && Math.abs(g.zR_ratio - 0.25) < 0.01, g.zR_ratio, e.zR_ratio); break;
        case 'galileo': chk('length 75', g.length_mm === 75, g.length_mm, 75); chk('no real internal waist', g.internal_real === false && e.internal_real === false, g.internal_real, e.internal_real); chk('×4', rel(g.mag, e.mag, { rel: 1e-6 }) && Math.abs(g.mag - 4) < 0.05, g.mag, e.mag); break;
        case 'kepler': chk('length 125', g.length_mm === 125, g.length_mm, 125); chk('real internal waist 12.5 µm', g.internal_real && e.internal_real && rel(g.internal_w0_um, e.internal_w0_um, { rel: 1e-6 }) && Math.abs(g.internal_w0_um - 12.5) < 0.05, g.internal_w0_um, e.internal_w0_um); chk('×4', rel(g.mag, e.mag, { rel: 1e-6 }) && Math.abs(g.mag - 4) < 0.05, g.mag, e.mag); chk('pinhole passes > 99 %', g.clip_ok, g.clip_ok, true); break;
        case 'smf28': chk('aligned > 99 %', g.eta0 > 0.99 && Math.abs(g.eta0 - e.eta0) < 2e-6, g.eta0, e.eta0); chk('3 µm ≈ 1.4 dB', Math.abs(g.loss3_dB - e.loss3_dB) < 1e-4 && g.loss3_dB > 1.3 && g.loss3_dB < 1.55, g.loss3_dB, e.loss3_dB); break;
        case 'match': chk('dozens of solutions', g.n === e.count && g.n >= 24, g.n, e.count); chk('path 90…540 mm', Math.abs(g.min_len_mm - e.min_len_mm) < 1e-3 && Math.abs(g.max_len_mm - e.max_len_mm) < 1e-3 && Math.round(g.min_len_mm / 10) * 10 === 90 && Math.round(g.max_len_mm / 10) * 10 === 540, [g.min_len_mm, g.max_len_mm], [e.min_len_mm, e.max_len_mm]); break;
        case 'fold': chk('split 1.5 mm', rel(g.split_mm, e.split_mm, { rel: 1e-6 }) && Math.abs(g.split_mm - 1.5) < 0.1, g.split_mm, e.split_mm); break;
        case 'edge': chk('spots ≈ 3×', rel(g.spot_ratio, e.spot_ratio, { rel: 1e-6 }) && g.spot_ratio > 2.9 && g.spot_ratio < 3.3, g.spot_ratio, e.spot_ratio); break;
        case 'iso': chk('M2 1.3', Math.abs(g.M2 - 1.3) < 1e-3, g.M2, 1.3); chk('ISO plan ok', g.isoOk === true, g.isoOk, true); break;
      }
    }
  }
  results.push({ id: c.id, kind: c.kind, note: c.note, cmp, pass: pass && Object.values(cmp).every(v => v.ok) });
}
/* project hand-over (review R-1, R-2, R-3): lasersafety-style source → Use; absurd values refused; save writes source.lambda_nm */
const ho = await p.evaluate(() => {
  const M = window.__gaussbeam, C = window.OptCore, out = {};
  DiagramUI.current.example('hene100');
  for (const [k, lam] of [['yag', 1064], ['co2', 10600]]) {
    const d = C.project.empty(); Object.assign(d.source, { kind: 'laser', lambda_nm: lam, w0_mm: 2.5, divergence_mrad: lam === 1064 ? 1.2 : 4 });
    const back = C.project.importJSON(C.project.exportJSON(d)); const doc = back.doc || back;
    const r = M.useModule('lasersafety', { summary: {} }, doc);
    const sv = M.projectPayload(doc.source).blocks.source;
    out[k] = { lam: M.state.lambda_nm, M2: M.state.M2, M2exp: Math.PI * 2.5e-3 * (d.source.divergence_mrad / 2000) / (lam * 1e-9), saved: sv.lambda_nm, bad: r.bad.length };
  }
  const bad = C.project.empty(); Object.assign(bad.source, { lambda_nm: -1, w0_mm: 1e-9, M2: 1e9 });
  const st0 = JSON.stringify(M.state), rb = M.useModule('lasersafety', { summary: {} }, bad);
  out.absurd = { refused: rb.bad.length >= 3, unchanged: JSON.stringify(M.state) === st0 };
  DiagramUI.current.example('hene100');
  return out;
});
for (const k of ['yag', 'co2']) {
  const x = ho[k], lam = k === 'yag' ? 1064 : 10600;
  results.push({ id: 'project-' + k, kind: 'project', note: 'lasersafety source (exit radius + divergence) -> Use -> save: lambda and derived M2', cmp: x,
                 pass: x.lam === lam && x.saved === lam && x.bad === 0 && Math.abs(x.M2 - Math.max(1, Math.round(x.M2exp * 1000) / 1000)) < 1e-9 });
}
results.push({ id: 'project-absurd-refused', kind: 'project', note: 'out-of-range project source refused, nothing applied', cmp: ho.absurd, pass: ho.absurd.refused && ho.absurd.unchanged });
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'gaussbeam', file: 'gaussbeam.html',
  reference: 'bench-src/ref/gen_gaussbeam.py — independent Python implementation (physical-q ABCD with interface matrices; Self 1983; numerical overlap integral; ISO 11146-1 least squares; round-trip eigenmode; intermediate-waist mode-matching search)',
  reference_citations: [
    'A. E. Siegman, Lasers, University Science Books 1986, ch. 15 (ABCD, reduced q), 17 (embedded Gaussian, M²), 19-21 (resonators, astigmatism)',
    'H. Kogelnik, T. Li, Laser beams and resonators, Appl. Opt. 5 (1966) 1550-1567, eq. (36) and section 3',
    'S. A. Self, Focusing of spherical Gaussian beams, Appl. Opt. 22 (1983) 658-661, eqs (9)-(11)',
    'W. B. Joyce, B. C. DeLoach, Alignment of Gaussian beams, Appl. Opt. 23 (1984) 4187-4196; D. Marcuse, Bell Syst. Tech. J. 56 (1977) 703',
    'ISO 11146-1:2021 Lasers and laser-related equipment — Test methods for laser beam widths, divergence angles and beam propagation ratios, section 9 (hyperbolic fit)',
    'Corning SMF-28 Ultra data sheet: mode field diameter 10.4 µm at 1550 nm (preset value)'
  ],
  tolerance: 'relative 1e-9 on w(z) at 21 planes per axis and 1e-8 on waists (same physics, double precision, different algebra); 1e-7 on wavefront radii; overlap efficiency within 2e-6 absolute of a 801-point numerical integral; ISO fit 1e-6 relative; mode-matching solutions within 1 µm in lens position and the complete solution set equal; preset claims within the rounding of their printed text',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`gaussbeam: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
