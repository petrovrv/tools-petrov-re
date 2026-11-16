// Benchmark driver for lasersafety.html (Laser Safety: MPE, NOHD, class, eyewear).
// Reference: bench-src/ref/gen_lasersafety.py (independent Python: Directive 2006/25/EC Annex II tables transcribed from the
// Official Journal and evaluated by an interpreter, Gaussian aperture power by numerical integration, DGUV 203-042 LB table)
// -> ref/lasersafety_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_lasersafety.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected exposure limits, pulse-train limits, hazard distances, optical densities, EN 207 scale numbers and indicative classes were computed by bench-src/ref/gen_lasersafety.py from the Directive 2006/25/EC Annex II tables transcribed cell by cell from the Official Journal images (lasersafety_directive_annexII.json), independent of the JavaScript engine.' };
const P = benchPaths({ name: 'lasersafety', page: 'lasersafety.html', ref: 'lasersafety_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const TOL = { mpe_rel: 1e-9, dist_rel: 1e-6, dist_abs_m: 1e-6, od_abs: 1e-6 };

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_lasersafety', '1'); } catch (e) { /* private mode */ } });
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__diagramReady && window.__lasersafety && window.__lasersafety.last(), null, { timeout: 120000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);
const ENGINE = await p.evaluate(() => ({ laser: window.OptLaser && window.OptLaser.version, core: window.OptCore && window.OptCore.version }));

const rel = (g, e) => (e === 0 ? Math.abs(g) : Math.abs(g - e) / Math.abs(e));
const distOk = (g, e) => g === e || Math.abs(g - e) <= Math.max(TOL.dist_abs_m, TOL.dist_rel * Math.abs(e));
const results = [];

/* 1+2: exposure limits and pulse trains through the engine the page loaded */
const engineCases = ref.cases.filter(c => c.kind === 'mpe' || c.kind === 'train');
const got = await p.evaluate(cs => cs.map(c => {
  const L = window.OptLaser;
  if (c.kind === 'mpe') { const m = c.organ === 'skin' ? L.mpeSkin(c.lambda, c.t) : L.mpeEye(c.lambda, c.t, c.alpha); return m ? { H: m.H, row: m.row } : null; }
  const tr = L.mpeTrain(c.lambda, c.tau, c.prf, c.T, 0, 'eye'); return tr ? { H: tr.H, governing: tr.governing, N: tr.N } : null;
}), engineCases);
engineCases.forEach((c, i) => {
  const g = got[i], e = c.expect;
  const d = g ? rel(g.H, e.H) : null;
  let pass = !!g && d <= TOL.mpe_rel;
  if (c.kind === 'train') pass = pass && g.governing === e.governing && g.N === e.N;
  results.push({ id: c.id, kind: c.kind, cmp: { H: { got: g && g.H, exp: e.H, rel_dev: d, tol_rel: TOL.mpe_rel }, governing: c.kind === 'train' ? { got: g && g.governing, exp: e.governing } : undefined, row: g && g.row }, pass });
});

/* 3: full assessments through the page: state set like a user would, results read from the page and from the screen */
for (const c of ref.cases.filter(c => c.kind === 'assess')) {
  const i = c.input, e = c.expect;
  const st = { lambda: i.lambda, mode: i.mode, a: i.a * 1000, phi: i.phi * 1000, def: i.def || '1/e', alpha: 0, intended: false,
               tsel: i.T ? 'custom' : 'auto', T: i.T || 10, optics: 'none' };
  if (i.mode === 'cw') st.P = i.P; else { st.Q = i.Q * 1000; st.tau = i.tau * 1e9; if (i.prf) st.prf = i.prf; }
  if (i.optics) st.optics = 'b750';
  let r = null;
  try {
    r = await p.evaluate(s => {
      const W = window.__lasersafety; Object.assign(W.state, s); W.ui.sync(); W.ui.run();
      const L = W.last(); if (!L || !L.ok) return { err: L && L.errors };
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { cls: L.cls.cls, NOHD: L.NOHD, NOHD_classic: L.NOHDclassic, ENOHD: L.ENOHD == null ? null : L.ENOHD, OD: L.OD, ratio: L.ratio, mpe: L.mpeLimit,
               LB: L.lb.LB ? L.lb.mode + ' LB' + L.lb.LB : null, governing: L.train ? L.train.governing : null, tileClass: tiles[0] };
    }, st);
  } catch (err) { errs.push('driver ' + c.id + ': ' + err.message); }
  const cmp = {}; let pass = !!r && !r.err;
  if (pass) {
    cmp.cls = { got: r.cls, exp: e.cls, ok: r.cls === e.cls && r.tileClass === e.cls };
    cmp.mpe = { got: r.mpe, exp: e.mpe, ok: rel(r.mpe, e.mpe) <= TOL.mpe_rel };
    cmp.NOHD = { got: r.NOHD, exp: e.NOHD, ok: distOk(r.NOHD, e.NOHD) };
    cmp.NOHD_classic = { got: r.NOHD_classic, exp: e.NOHD_classic, ok: distOk(r.NOHD_classic, e.NOHD_classic) };
    if (e.ENOHD != null) cmp.ENOHD = { got: r.ENOHD, exp: e.ENOHD, ok: r.ENOHD != null && distOk(r.ENOHD, e.ENOHD) };
    cmp.OD = { got: r.OD, exp: e.OD, ok: Math.abs(r.OD - e.OD) <= TOL.od_abs };
    cmp.LB = { got: r.LB, exp: e.LB, ok: r.LB === e.LB };
    if (e.governing != null) cmp.governing = { got: r.governing, exp: e.governing, ok: r.governing === e.governing };
    pass = Object.values(cmp).every(x => x.ok);
  }
  results.push({ id: c.id, kind: 'assess', input: i, cmp, pass, err: r && r.err });
}

/* 4: preset ahas through the Examples panel (the reader's path) */
const ahas = await p.evaluate(async () => {
  const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]'), out = {};
  for (const id of ['pointer532', 'hene633', 'fibre1064', 'diode445', 'qswitch1064', 'co2_10600', 'er1550', 'binoculars', 'class1_1064']) {
    sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click();
    await new Promise(r => setTimeout(r, 120));
    const L = window.__lasersafety.last();
    out[id] = { cls: L.cls.cls, NOHD: L.NOHD, ENOHD: L.ENOHD, NSHD: L.NSHD, OD: L.OD, T: L.T, gov: L.train && L.train.governing, ael1: L.cls.AEL1.P, mpe: L.mpeLimit };
  }
  const W = window.__lasersafety; W.state.tsel = '10'; W.ui.sync(); W.ui.run();      /* HeNe stare */
  sel.value = 'hene633'; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 120));
  W.state.tsel = '10'; W.ui.sync(); W.ui.run(); out.hene10 = { ratio: W.last().ratio };
  return out;
});
const A = ahas, aha = [
  ['aha-pointer', A.pointer532.cls === '3R' && A.pointer532.NOHD > 8 && A.pointer532.NOHD < 20, '5 mW pointer: class 3R, NOHD about 12 m'],
  ['aha-hene', A.hene633.cls === '2' && A.hene10.ratio > 2, 'HeNe 1 mW: class 2, a 10 s stare exceeds the MPE more than 2x'],
  ['aha-fibre', A.fibre1064.cls === '4' && A.fibre1064.T === 10 && Math.ceil(A.fibre1064.OD) >= 4 && A.fibre1064.NOHD > 300, '10 W 1064: class 4, 10 s, OD 4, NOHD hundreds of m'],
  ['aha-engraver', A.diode445.cls === '4' && Math.ceil(A.diode445.OD) >= 4 && A.diode445.ael1 < 1e-4, '5 W 445: OD 4+, class 1 limit 39 µW'],
  ['aha-qswitch', A.qswitch1064.gov === 3 && A.qswitch1064.NOHD > 1000, 'Q-switch: rule 3 governs, NOHD km'],
  ['aha-co2', Math.abs(A.co2_10600.NSHD / A.co2_10600.NOHD - 1) < 0.01, 'CO2: skin distance = NOHD'],
  ['aha-1550', A.er1550.cls === '4' && Math.abs(A.er1550.mpe / 50 - 20) < 1e-9, '1550: MPE 20x of 1064, still class 4'],
  ['aha-binoculars', A.binoculars.ENOHD / A.binoculars.NOHD > 5 && A.binoculars.ENOHD / A.binoculars.NOHD < 9, '7x50: ENOHD about 7 x NOHD'],
  ['aha-class1', A.class1_1064.cls === '1' && A.class1_1064.NOHD === 0, 'class 1: no hazard distance']
];
aha.forEach(([id, ok, note]) => results.push({ id, kind: 'aha', note, pass: !!ok }));

/* 5: published worked examples, FIXED expected values with source and page (review R-4; _opt/laser/published-examples.md, read 13.11.2026).
   Tolerances follow the rounding printed in the source. ANSI-based OSHA cells are used only where the ANSI and Directive values coincide. */
const TROS = 'TROS Laserstrahlung Teil 2 (2015)', OSHA = 'OSHA Technical Manual Sec. III Ch. 6', DGUV = 'DGUV Information 203-042 (2018)';
const PUB = [
  { id: 'pub-tros-A2.5-b1', src: TROS + ' Anlage 2 A2.5, Beispiel 1, Gl. A2.27, p. 39', f: 'hd', args: [4, 10, 1e-3, 0.7e-3], exp: 1018, tol: 1e-3 },
  { id: 'pub-tros-A2.5-b2', src: TROS + ' Anlage 2 A2.5, Beispiel 2, Gl. A2.28, p. 39', f: 'hd', args: [4, 10, 7e-3, 0.1e-3], exp: 7068, tol: 1e-3 },
  { id: 'pub-tros-5.1-mpe', src: TROS + ' 5.1, Gl. 5.3, p. 15 (1064 nm, 10 s)', f: 'mpeE', args: [1064, 10, 0], exp: 50, tol: 1e-9 },
  { id: 'pub-tros-5.1-E', src: TROS + ' 5.1, Gl. 5.2, p. 15 (0.1 W, d63 2 mm, 7 mm aperture)', f: 'avg', args: [0.1, 2e-3, 0, 0, 7e-3], exp: 2597, tol: 1e-3 },
  { id: 'pub-tros-5.2-eye', src: TROS + ' 5.2, Gl. 5.7, p. 16 (950 nm, 100 s, C_A 3.16)', f: 'mpeE', args: [950, 100, 0], exp: 31.6, tol: 2e-3 },
  { id: 'pub-tros-5.2-skin', src: TROS + ' 5.2, Gl. 5.10, p. 17 (skin 950 nm, 100 s)', f: 'skinE', args: [950, 100], exp: 6320, tol: 2e-3 },
  { id: 'pub-tros-5.4-mpe', src: TROS + ' 5.4, Gl. 5.15, p. 19 (670 nm, 100 s, α 12.5 mrad)', f: 'mpeE', args: [670, 100, 12.5e-3], exp: 79.07, tol: 1e-3 },
  { id: 'pub-tros-5.4-CE', src: TROS + ' 5.4, Gl. 5.13, p. 19', f: 'CE', args: [12.5e-3], exp: 8.33, tol: 1e-3 },
  { id: 'pub-tros-5.4-T2', src: TROS + ' 5.4, Gl. 5.14, p. 19', f: 'T2', args: [12.5e-3], exp: 12.93, tol: 1e-3 },
  { id: 'pub-tros-5.5-1064-2s', src: TROS + ' 5.5, Gl. 5.19, p. 20 (1064 nm, 2 s)', f: 'mpeH', args: [1064, 2, 0], exp: 151.4, tol: 1e-3 },
  { id: 'pub-tros-5.5-532-2s', src: TROS + ' 5.5, Gl. 5.21, p. 20 (532 nm, 2 s)', f: 'mpeH', args: [532, 2, 0], exp: 30.3, tol: 2e-3 },
  { id: 'pub-tros-5.5-532-10s', src: TROS + ' 5.5, Gl. 5.25, p. 21 (532 nm, 10 s)', f: 'mpeE', args: [532, 10, 0], exp: 10, tol: 1e-9 },
  { id: 'pub-tros-5.7-mpe', src: TROS + ' 5.7, Gl. 5.48, p. 25 (650 nm, α 56.25 mrad, t > T2)', f: 'mpeE', args: [650, 100, 56.25e-3], exp: 275.6, tol: 1e-3 },
  { id: 'pub-tros-5.7-T2', src: TROS + ' 5.7, Gl. 5.47, p. 25', f: 'T2', args: [56.25e-3], exp: 36.0, tol: 2e-3 },
  { id: 'pub-essex-ex1', src: 'University of Essex, Calculating NOHD Guidance (after HPA 2012), Example 1', f: 'hd', args: [0.1, 25, 1e-3, 3e-3], exp: 23.5, tol: 3e-3 },
  { id: 'pub-essex-ex2', src: 'University of Essex, Calculating NOHD Guidance (after HPA 2012), Example 2', f: 'hd', args: [0.004, 25.4, 3e-3, 2e-3], exp: 5.58, tol: 2e-3 },
  { id: 'pub-osha-nhz-yag', src: OSHA + ', Table III:6-7 (Nd:YAG 100 W, 2 mm, 2 mrad, 10 s; ANSI MPE 5.06 mW/cm²)', f: 'hd', args: [100, 18 * 5 * Math.pow(10, 0.75) / 10, 2e-3, 2e-3], exp: 792, tol: 2e-3 },
  { id: 'pub-tcd-mpe-0.25s', src: 'Trinity College Dublin laser short course (2017), 7.3, p. 31 (visible 0.25 s)', f: 'mpeH', args: [532, 0.25, 0], exp: 6.36, tol: 2e-3 },
  /* OD table of OSHA (7 mm aperture), cells where ANSI 1993 and the Directive give the same MPE; published to 1 decimal */
  { id: 'pub-osha-od-hene-0.25', src: OSHA + ', Table III:6-8 (HeNe 5 mW, 0.25 s)', f: 'od', st: { lambda: 632.8, mode: 'cw', P: 5e-3, a: 1, phi: 1, tsel: '0.25' }, exp: 0.7, tol: 0.05 },
  { id: 'pub-osha-od-hene-10', src: OSHA + ', Table III:6-8 (HeNe 5 mW, 10 s)', f: 'od', st: { lambda: 632.8, mode: 'cw', P: 5e-3, a: 1, phi: 1, tsel: '10' }, exp: 1.1, tol: 0.05 },
  { id: 'pub-osha-od-ar-0.25', src: OSHA + ', Table III:6-8 (argon 1 W, 0.25 s)', f: 'od', st: { lambda: 514.5, mode: 'cw', P: 1, a: 1.5, phi: 1, tsel: '0.25' }, exp: 3.0, tol: 0.05 },
  { id: 'pub-osha-od-ar-10', src: OSHA + ', Table III:6-8 (argon 1 W, 10 s)', f: 'od', st: { lambda: 514.5, mode: 'cw', P: 1, a: 1.5, phi: 1, tsel: '10' }, exp: 3.4, tol: 0.05 },
  { id: 'pub-osha-od-yag-10', src: OSHA + ', Table III:6-8 (Nd:YAG 100 W, 10 s)', f: 'od', st: { lambda: 1064, mode: 'cw', P: 100, a: 2, phi: 2, tsel: '10' }, exp: 4.7, tol: 0.05 },
  /* EN 207 scale numbers */
  { id: 'pub-dguv-A5-I', src: DGUV + ' Anhang 5, A5.3, p. 29 (940 nm, 10 µs, 25 kHz, 4 mJ, d63 42 mm at 10 cm)', f: 'lb', st: { lambda: 940, mode: 'rep', Q: 4, tau: 1e4, prf: 25e3, a: 42, phi: 0.001, tsel: 'auto' }, exp: 'I LB5' },
  { id: 'pub-dguv-A5-D', src: DGUV + ' Anhang 5, A5.5, p. 29 (same laser, average 100 W, F(d63) = 100)', f: 'lbD', st: { lambda: 940, mode: 'rep', Q: 4, tau: 1e4, prf: 25e3, a: 42, phi: 0.001, tsel: 'auto' }, exp: 'D LB6' },
  { id: 'pub-uibk-D', src: 'Univ. Innsbruck, Introduction to Laser Safety Goggles (10 mW 632 nm CW, 5 mm)', f: 'lb', st: { lambda: 632, mode: 'cw', P: 0.01, a: 5, phi: 1, tsel: 'auto' }, exp: 'D LB2' }
];
const pubGot = await p.evaluate(async cases => {
  const L = window.OptLaser, W = window.__lasersafety, out = [];
  for (const c of cases) {
    const a = c.args || [];
    if (c.f === 'hd') out.push(L.hazardDistance(a[0], a[1], a[2], a[3]));
    else if (c.f === 'mpeE') out.push(L.mpeEye(a[0], a[1], a[2]).E);
    else if (c.f === 'mpeH') out.push(L.mpeEye(a[0], a[1], a[2]).H);
    else if (c.f === 'skinE') out.push(L.mpeSkin(a[0], a[1]).E);
    else if (c.f === 'CE') out.push(L.CE(a[0]));
    else if (c.f === 'T2') out.push(L.T2(a[0]));
    else if (c.f === 'avg') out.push(L.averaged(a[0], a[1], a[2], a[3], a[4]));
    else {
      Object.assign(W.state, { def: '1/e', alpha: 0, optics: 'none', intended: false }, c.st); W.ui.sync(); W.ui.run();
      const R = W.last();
      out.push(c.f === 'od' ? R.OD : c.f === 'lb' ? (R.lb.LB ? R.lb.mode + ' LB' + R.lb.LB : null) : (R.lbD && R.lbD.LB ? 'D LB' + R.lbD.LB : null));
    }
  }
  return out;
}, PUB);
PUB.forEach((c, i) => {
  const g = pubGot[i];
  const ok = typeof c.exp === 'string' ? g === c.exp : (c.f === 'od' ? Math.abs(g - c.exp) <= c.tol : Math.abs(g - c.exp) <= c.tol * Math.abs(c.exp));
  results.push({ id: c.id, kind: 'published', source: c.src, cmp: { got: g, exp: c.exp, tol: c.tol == null ? 'exact' : (c.f === 'od' ? 'abs ' + c.tol : 'rel ' + c.tol) }, pass: ok });
});

/* 6: project round trip (review R-1/R-2): save -> use restores the same laser; an absurd project source is refused */
const rt = await p.evaluate(() => {
  const W = window.__lasersafety, C = window.OptCore, out = {};
  const lasers = {
    yag10W: { lambda: 1064, mode: 'cw', P: 10, a: 5, phi: 1, def: '1/e', tsel: 'auto', optics: 'none' },
    co2: { lambda: 10600, mode: 'cw', P: 100, a: 10, phi: 2, def: '1/e', tsel: 'auto', optics: 'none' },
    qsw: { lambda: 1064, mode: 'rep', Q: 100, tau: 10, prf: 10, a: 6, phi: 0.5, def: '1/e', tsel: 'auto', optics: 'none' }
  };
  for (const k of Object.keys(lasers)) {
    Object.assign(W.state, lasers[k]); W.ui.sync(); W.ui.run();
    const before = W.last(), doc = C.project.withModule(C.project.empty(), 'lasersafety', W.projectPayload());
    const docBack = C.project.importJSON(C.project.exportJSON(doc));
    Object.assign(W.state, { lambda: 532, mode: 'cw', P: 0.005, a: 1, phi: 1.2, def: '1/e' }); W.ui.sync(); W.ui.run();
    const u = W.useSource(docBack.doc || docBack), after = W.last();
    out[k] = { ok: u.ok, lam: W.state.lambda, cls: [before.cls.cls, after.cls.cls], NOHD: [before.NOHD, after.NOHD], OD: [before.OD, after.OD], mpe: [before.mpeLimit, after.mpeLimit] };
  }
  const bad = C.project.empty(); bad.source.power_W = 1e9; bad.source.w0_mm = 1e-6; bad.source.lambda_nm = 1064;
  const st0 = JSON.stringify(W.state), ub = W.useSource(bad);
  out.bad = { ok: ub.ok, unchanged: JSON.stringify(W.state) === st0, msg: (document.querySelector('[data-opt="use-msg"]') || {}).textContent || '' };
  const nolam = C.project.empty(); nolam.source.power_W = 0.002;
  const lam0 = W.state.lambda, un = W.useSource(nolam);
  out.nolam = { ok: un.ok, lamKept: W.state.lambda === lam0, warn: un.warn && un.warn.length };
  return out;
});
const same = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
for (const k of ['yag10W', 'co2', 'qsw']) {
  const x = rt[k];
  results.push({ id: 'roundtrip-' + k, kind: 'project', cmp: x, pass: x.ok && x.lam === (k === 'co2' ? 10600 : 1064) && x.cls[0] === x.cls[1] && same(x.NOHD[0], x.NOHD[1]) && same(x.OD[0], x.OD[1]) && same(x.mpe[0], x.mpe[1]) });
}
results.push({ id: 'project-absurd-refused', kind: 'project', cmp: rt.bad, pass: rt.bad.ok === false && rt.bad.unchanged && rt.bad.msg.length > 0 });
results.push({ id: 'project-no-lambda-flagged', kind: 'project', cmp: rt.nolam, pass: rt.nolam.ok && rt.nolam.lamKept && rt.nolam.warn === 1 });
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'lasersafety',
  file: 'lasersafety.html',
  engine: ENGINE,
  reference: 'bench-src/ref/gen_lasersafety.py — independent Python from Directive 2006/25/EC Annex II (table cells transcribed from the Official Journal and evaluated by an interpreter), NOHD by numerical integration of the Gaussian over the limiting aperture, DGUV 203-042 LB table, indicative class from public AEL summaries',
  reference_citations: [
    'Directive 2006/25/EC of the European Parliament and of the Council (artificial optical radiation), Annex II Tables 2.2-2.6, OJ L 114, 27.4.2006 (CELEX 32006L0025, read 13.11.2026)',
    'ICNIRP Guidelines on limits of exposure to laser radiation of wavelengths between 180 nm and 1,000 µm, Health Physics 71 (1996) 804-819; revision Health Physics 79 (2000) 431-440',
    'IEC TR 60825-14:2004 Safety of laser products - Part 14: A user\'s guide (NOHD, optical aids)',
    'DGUV Information 203-042 Auswahl und Benutzung von Laser-Schutzbrillen (2018), after DIN EN 207:2017',
    'EMSD Hong Kong, Laser Safety Guidance Notes (2005), Tables C.1-C.6 (AEL of IEC 60825-1:2001)',
    'K. Schulmeister, The new edition of IEC 60825-1:2014, Seibersdorf Laboratories white paper (2017)',
    'TROS Laserstrahlung Teil 2 (BAuA/ABS, April 2015, GMBl 2015 S. 249), Anlage 2 and sec. 5 worked examples',
    'OSHA Technical Manual Section III Chapter 6 Laser Hazards, Tables III:6-7 and III:6-8 (https://www.osha.gov/otm/section-3-health-hazards/chapter-6)',
    'University of Essex, Calculating Nominal Ocular Hazard Distance Guidance (after HPA Laser Safety Refresher 2012)',
    'Trinity College Dublin, Guidance on the safe use of lasers - short course (Ed. 2017), sec. 7.3',
    'Universitaet Innsbruck, Introduction to Laser Safety Goggles (tutorial)'
  ],
  tolerance: 'exposure limits and pulse-train limits relative 1e-9; hazard distances relative 1e-6 (the reference integrates the Gaussian numerically) or 1 µm; optical density 1e-6 absolute; class, EN 207 scale number and governing pulse rule exact; preset ahas as stated; published worked examples within the rounding printed in the source (per case); project round trip identical to 1e-9',
  independence: 'Independent of the JavaScript: the MPE (table interpreter over the transcribed law), the Gaussian aperture integral, and the 26 published worked examples (TROS Laserstrahlung Teil 2, OSHA Technical Manual, DGUV 203-042, Essex/HPA, TCD, Innsbruck) with fixed expected values. Shared interpretation (same author, re-typed in Python; cannot catch interpretation errors): pulse-train grouping inside T_min, UV-B row choice between the 1-nm rows, per-rule apertures, indicative class logic (1e-9 tolerance, 1M/2M tests, 3B table), EN 207 rules incl. F(d63).',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`lasersafety: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass).slice(0, 15)) console.log('FAIL', r.id, JSON.stringify(r.cmp || r.note || r.err));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
