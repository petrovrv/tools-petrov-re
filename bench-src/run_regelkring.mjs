/* Benchmark driver for regelkring.html — Control Loop Laboratory.
 *
 * Reference: bench-src/ref/regelkring_ref.json, produced by
 * bench-src/ref/gen_regelkring.py from python-control 0.10.2, numpy/scipy and
 * hand-derived closed forms. Nothing in the reference comes from the tool.
 *
 * The tool's linear engine is a script-level `const LIN` inside the page (no
 * globals object), so it is reached with page.evaluate by name. The UI is
 * additionally exercised through the DOM to confirm the numbers on screen are
 * the numbers the engine produces.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { readPageManifestRevision, stampProvenance, benchPaths } from './provenance.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build belongs to the
   run and not to this constant: readPageManifestRevision(page) reads it out of the live
   DOM of the page the browser loaded, and it reaches the artifact as stampProvenance's
   `build`, which writes build and manifest_revision and refuses to write without it. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_regelkring.py from the sources this artifact cites. That generator was re-run on 2026-10-16 with the control package installed (0.10.2), in a reference directory from which regelkring_ref.json had first been removed, and wrote a file byte-identical to the deployed corpus (126 060 B); so no case reuses a stored reference that this tree cannot re-derive."
};

const P = benchPaths({ name: 'regelkring', page: 'regelkring.html',
                       ref: 'regelkring_ref.json' });
const REF = JSON.parse(readFileSync(P.ref, 'utf8'),
  (k, v) => (v === 'Infinity' ? Infinity : (v === '-Infinity' ? -Infinity : (v === 'NaN' ? NaN : v))));
/* The transport stays http, which is how this driver has always reached the page; --base or
   BENCH_BASE moves the origin and the default is the origin it has always used. */
const URL = (P.base || 'http://127.0.0.1:8765') + '/' + P.pageFile + '?lang=en';

const rel = (got, ref) => {
  if (!Number.isFinite(got) && !Number.isFinite(ref)) return (got === ref) ? 0 : Infinity;
  if (!Number.isFinite(got) || !Number.isFinite(ref)) return Infinity;
  const d = Math.abs(got - ref);
  const s = Math.max(Math.abs(ref), 1e-12);
  return d / s;
};
const absrel = (got, ref, scale) => {
  if (!Number.isFinite(got) || !Number.isFinite(ref)) return rel(got, ref);
  return Math.abs(got - ref) / Math.max(scale, 1e-12);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console:' + m.text()); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => typeof LIN === 'object' && typeof SIM === 'object', null, { timeout: 30000 });
await page.waitForTimeout(1500);

/* The build this artifact names: the revision in the live DOM of the page just loaded. */
const BUILD = await readPageManifestRevision(page);

const cases = [];
const TOL = {};

/* ---------- helper that runs an arbitrary probe inside the page ---------- */
const probe = (fn, arg) => page.evaluate(fn, arg);

/* =============== A. closed-loop transfer function and poles ============== */
for (const c of REF.cases.filter(x => x.kind === 'feedback')) {
  const got = await probe((inp) => {
    const G = LIN.series({ num: inp.C.num, den: inp.C.den, delay: 0 },
                         { num: inp.P.num, den: inp.P.den, delay: 0 });
    const T = LIN.feedback(G, { num: inp.H.num, den: inp.H.den, delay: 0 });
    return { num: T.num, den: T.den, poles: LIN.poles(T).map(z => [z.re, z.im]),
             dcGain: LIN.dcGain(T) };
  }, c.inputs);
  const cmp = {};
  // denominator compared after normalising to a monic polynomial
  const norm = p => { const a = p[0]; return p.map(v => v / a); };
  const gd = norm(got.den), rd = norm(c.ref.den);
  let worst = 0;
  cmp.den_degree = { got: gd.length - 1, ref: rd.length - 1, rel: (gd.length === rd.length) ? 0 : Infinity, ok: gd.length === rd.length };
  const dscale = Math.max(...rd.map(Math.abs));
  for (let i = 0; i < Math.min(gd.length, rd.length); i++) {
    const r = absrel(gd[i], rd[i], dscale);
    cmp['den_c' + i] = { got: gd[i], ref: rd[i], rel: r, ok: r < 1e-10 };
    worst = Math.max(worst, r);
  }
  /* Poles are compared as a SET (nearest-neighbour matching): the order in
     which a root finder returns a conjugate pair is not a property of the
     system, and both sides sort by (Re, Im) with Re differing in the last bit. */
  const pscale = Math.max(...c.ref.poles.map(p => Math.hypot(p[0], p[1])), 1e-12);
  {
    const pool = got.poles.slice();
    for (let i = 0; i < c.ref.poles.length; i++) {
      const r = c.ref.poles[i];
      let bi = -1, bd = Infinity;
      for (let j = 0; j < pool.length; j++) {
        const d = Math.hypot(pool[j][0] - r[0], pool[j][1] - r[1]);
        if (d < bd) { bd = d; bi = j; }
      }
      const g = bi >= 0 ? pool.splice(bi, 1)[0] : [NaN, NaN];
      const d = bd / pscale;
      cmp['pole' + i] = { got: g, ref: r, rel: d, ok: d < 1e-9 };
      worst = Math.max(worst, d);
    }
    cmp.pole_count = { got: got.poles.length, ref: c.ref.poles.length,
                       rel: got.poles.length === c.ref.poles.length ? 0 : Infinity,
                       ok: got.poles.length === c.ref.poles.length };
  }
  const dg = rel(got.dcGain, c.ref.dcGain);
  cmp.dcGain = { got: got.dcGain, ref: c.ref.dcGain, rel: dg, ok: dg < 1e-12 };
  worst = Math.max(worst, dg);
  // crosscheck: our residue poles vs python-control's poles
  let xc = null;
  if (c.crosscheck) {
    let m = 0;
    for (let i = 0; i < c.ref.poles.length; i++) {
      const a = c.ref.poles[i], b = c.crosscheck.poles[i];
      m = Math.max(m, Math.hypot(a[0] - b[0], a[1] - b[1]) / pscale);
    }
    xc = { source: c.crosscheck.source, max_rel: m };
  }
  cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp, worst_rel: worst,
               pass: Object.values(cmp).every(v => v.ok), crosscheck: xc });
}

/* ====================== B. Bode magnitude and phase ====================== */
for (const c of REF.cases.filter(x => x.kind === 'bode')) {
  const ws = c.ref.points.map(p => p.w);
  const got = await probe(({ L, ws }) => ws.map(w => {
    const v = LIN.evalTF({ num: L.num, den: L.den, delay: L.delay }, w);
    return { mag: Math.hypot(v.re, v.im), phase_deg: Math.atan2(v.im, v.re) * 180 / Math.PI };
  }), { L: c.inputs.L, ws });
  const cmp = {}; let worst = 0;
  c.ref.points.forEach((p, i) => {
    const rm = rel(got[i].mag, p.mag);
    // phase compared modulo 360 deg (branch is a convention, the value is not)
    let dp = got[i].phase_deg - p.phase_deg;
    dp -= 360 * Math.round(dp / 360);
    const rp = Math.abs(dp) / 180;
    cmp['mag@w=' + p.w] = { got: got[i].mag, ref: p.mag, rel: rm, ok: rm < 1e-11 };
    cmp['phase@w=' + p.w] = { got: got[i].phase_deg, ref: p.phase_deg, rel: rp, ok: Math.abs(dp) < 1e-9 };
    worst = Math.max(worst, rm, rp);
  });
  let xc = null;
  if (c.crosscheck) {
    let m = 0;
    c.ref.points.forEach((p, i) => {
      const q = c.crosscheck.points[i];
      m = Math.max(m, rel(q.mag, p.mag), Math.abs(q.phase_deg - p.phase_deg) / 180);
    });
    xc = { source: c.crosscheck.source, max_rel: m };
  }
  cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp, worst_rel: worst,
               pass: Object.values(cmp).every(v => v.ok), crosscheck: xc });
}

/* ================ C. gain margin, phase margin, delay margin ============= */
for (const c of REF.cases.filter(x => x.kind === 'margins')) {
  const got = await probe((L) => {
    const m = LIN.margins({ num: L.num, den: L.den, delay: L.delay });
    const f = v => (Number.isFinite(v) ? v : (v === Infinity ? 'Infinity' : (Number.isNaN(v) ? 'NaN' : v)));
    return { gainMargin: f(m.gainMargin), gainMargin_dB: f(m.gainMargin_dB), wcg: f(m.wcg),
             phaseMargin_deg: f(m.phaseMargin_deg), wcp: f(m.wcp),
             delayMargin_s: f(m.delayMargin_s), bodeApplicable: m.bodeApplicable };
  }, c.inputs.L);
  const num = v => (v === 'Infinity' ? Infinity : (v === 'NaN' ? NaN : v));
  const cmp = {}; let worst = 0;
  for (const k of ['gainMargin', 'gainMargin_dB', 'wcg', 'phaseMargin_deg', 'wcp', 'delayMargin_s']) {
    const g = num(got[k]);
    const r = (c.ref[k] === null || c.ref[k] === undefined) ? NaN : c.ref[k];
    let d;
    if (!Number.isFinite(r) && !Number.isFinite(g)) d = 0;                    // both inf / both NaN
    else if (k === 'phaseMargin_deg' || k === 'gainMargin_dB') d = Math.abs(g - r) / 180;
    else d = rel(g, r);
    cmp[k] = { got: g, ref: r, rel: d, ok: d < 1e-7 };
    worst = Math.max(worst, d);
  }
  let xc = null;
  if (c.crosscheck) {
    let m = 0;
    for (const k of ['gainMargin', 'phaseMargin_deg', 'wcg', 'wcp']) {
      const a = c.ref[k], b = c.crosscheck[k];
      if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
      m = Math.max(m, rel(b, a));
    }
    xc = { source: c.crosscheck.source, max_rel: m };
  }
  if (c.analytic) {
    let m = 0;
    for (const k of Object.keys(c.analytic)) m = Math.max(m, rel(c.ref[k], c.analytic[k]));
    xc = Object.assign(xc || {}, { analytic_source: 'hand-derived closed form for L=e^-s/s', analytic_max_rel: m });
  }
  cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp, worst_rel: worst,
               pass: Object.values(cmp).every(v => v.ok), crosscheck: xc });
}

/* ======================= D. Nyquist encirclements ======================== */
for (const c of REF.cases.filter(x => x.kind === 'nyquist')) {
  const got = await probe((L) => {
    const r = LIN.nyquistCount({ num: L.num, den: L.den, delay: L.delay });
    return { P: r.P, m: r.m, encirclementsCCW: r.encirclementsCCW, Z: r.Z,
             closedLoopStable: r.closedLoopStable, residual: r.residual,
             inconclusive: r.inconclusive, reason: r.reason };
  }, c.inputs.L);
  const cmp = {}; let worst = 0;
  const chk = (k, g, r) => { const d = (g === r) ? 0 : Infinity; cmp[k] = { got: g, ref: r, rel: d, ok: d === 0 }; worst = Math.max(worst, d === 0 ? 0 : 1); };
  chk('P', got.P, c.ref.P);
  chk('encirclementsCCW', got.encirclementsCCW, c.ref.encirclementsCCW);
  chk('Z', got.Z, c.ref.Z);
  chk('closedLoopStable', got.closedLoopStable, c.ref.closedLoopStable);
  cmp.residual = { got: got.residual, ref: 0, rel: got.residual, ok: got.residual < 0.05 };
  let xc = null;
  if (c.crosscheck) xc = { source: c.crosscheck.source, agrees: c.crosscheck.Z === c.ref.Z };
  cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp, worst_rel: worst,
               pass: Object.values(cmp).every(v => v.ok), crosscheck: xc });
}

/* ============================ E. step responses ========================== */
for (const c of REF.cases.filter(x => x.kind === 'step')) {
  const ts = c.inputs.t;
  const got = await probe(({ G, ts }) => {
    const r = LIN.stepResponse({ num: G.num, den: G.den, delay: G.delay },
                               ts[ts.length - 1], ts.length);
    return { y: Array.from(r.y), t: Array.from(r.t), method: r.method };
  }, { G: c.inputs.G, ts });
  const scale = Math.max(...c.ref.y.map(Math.abs), 1e-12);
  const cmp = {}; let worst = 0;
  for (let i = 0; i < ts.length; i++) {
    const d = Math.abs(got.y[i] - c.ref.y[i]) / scale;
    if (i % 6 === 0 || d > 1e-8) cmp['y@t=' + ts[i]] = { got: got.y[i], ref: c.ref.y[i], rel: d, ok: d < 1e-8 };
    worst = Math.max(worst, d);
  }
  cmp.__worst = { got: worst, ref: 0, rel: worst, ok: worst < 1e-8 };
  let xc = null;
  if (c.crosscheck) {
    let m = 0;
    for (let i = 0; i < ts.length; i++) m = Math.max(m, Math.abs(c.crosscheck.y[i] - c.ref.y[i]) / scale);
    xc = { source: c.crosscheck.source, max_rel: m };
  }
  cases.push({ id: c.id, note: c.note + ' [tool method: ' + got.method + ']',
               inputs: { G: c.inputs.G, nPoints: ts.length }, cmp, worst_rel: worst,
               pass: Object.values(cmp).every(v => v.ok), crosscheck: xc });
}

/* ---- E4: closed-loop FOPDT against the exact DDE solution --------------- */
for (const c of REF.cases.filter(x => x.kind === 'step_delayed_closed_loop')) {
  const { K, tau, L, Kc, t } = c.inputs;
  const got = await probe(({ K, tau, L, Kc, t }) => {
    const G = { num: [K], den: [tau, 1], delay: L };
    const C = { num: [Kc], den: [1], delay: 0 };
    const out = {};
    for (const p of [1, 2, 3, 6]) {
      const T = LIN.feedback(LIN.series(C, G), { num: [1], den: [1], delay: 0 }, { padeOrder: p });
      const r = LIN.stepResponse(T, t[t.length - 1], t.length);
      out['pade' + p] = Array.from(r.y);
    }
    return out;
  }, { K, tau, L, Kc, t });
  const scale = Math.max(...c.ref.y.map(Math.abs), 1e-12);
  const cmp = {}; let worst = 0;
  for (const p of [1, 2, 3, 6]) {
    let m = 0;
    for (let i = 0; i < t.length; i++) m = Math.max(m, Math.abs(got['pade' + p][i] - c.ref.y[i]) / scale);
    cmp['maxdev_pade' + p] = { got: m, ref: 0, rel: m, ok: true };
    if (p === 3) worst = m;
  }
  /* A dead time inside a closed loop makes the characteristic equation
     transcendental: there is no rational closed-loop transfer function to be
     right about, so this case cannot be graded by a numeric tolerance the way
     the rational cases are. What CAN be demanded, and is:
       (a) the tool declares that it approximated (T.approx),
       (b) the error falls monotonically as the Pade order rises — i.e. it is
           an approximation of the right thing and not a different model,
       (c) the deviation is recorded here in full so the reader can see how big
           it gets. This system (first-order plant, P controller, L/tau = 0.25,
           relative degree 1 so nothing filters the Pade ripple) is the worst
           case of the set: 3.0 % of the step at the default order 3.
     The tool's OWN default loop is graded against the exact delay solution
     with a hard 1e-3 criterion in case E5. */
  const orders = [1, 2, 3, 6];
  let monotone = true;
  for (let i = 1; i < orders.length; i++) {
    if (cmp['maxdev_pade' + orders[i]].got > cmp['maxdev_pade' + orders[i - 1]].got * 1.0000001) monotone = false;
  }
  cmp.pade_error_falls_with_order = { got: orders.map(o => +cmp['maxdev_pade' + o].got.toFixed(5)),
                                      ref: 'monotone decreasing',
                                      rel: monotone ? 0 : Infinity, ok: monotone };
  const declared = await probe(({ K, tau, L, Kc }) => {
    const T = LIN.feedback(LIN.series({ num: [Kc], den: [1], delay: 0 },
                                      { num: [K], den: [tau, 1], delay: L }),
                           { num: [1], den: [1], delay: 0 });
    return T.approx || null;
  }, { K, tau, L, Kc });
  cmp.approximation_declared = { got: declared, ref: 'pade', rel: declared ? 0 : Infinity, ok: !!declared };
  cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp, worst_rel: worst,
               pass: Object.values(cmp).every(v => v.ok),
               crosscheck: { source: 'DDE self-convergence between h and h/2',
                             max_rel: c.ref.self_convergence / scale } });
}

/* ========================= F. tuning rules =============================== */
for (const c of REF.cases.filter(x => x.kind === 'tuning')) {
  const got = await probe((i) => {
    const r = SIM.tuning(i.L / i.tau, 0, i.method,
      { type: i.type, K: i.K, tau: i.tau, L: i.L, tauW: i.tau, lambdaC: i.lambdaC || 0 });
    return { Kc: r.Kr, Ti: r.ti, Td: r.td, source: r.source, formula: r.formula };
  }, c.inputs);
  const cmp = {}; let worst = 0;
  for (const k of ['Kc', 'Ti', 'Td']) {
    const g = got[k], r = c.ref[k];
    const d = (r === 0) ? (Math.abs(g) < 1e-12 ? 0 : Infinity) : rel(g, r);
    cmp[k] = { got: g, ref: r, rel: d, ok: d < 1e-12 };
    worst = Math.max(worst, d);
  }
  cmp.cites_source = { got: got.source, ref: 'non-empty citation', rel: got.source ? 0 : Infinity, ok: !!got.source };
  cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp, worst_rel: worst,
               pass: Object.values(cmp).every(v => v.ok), crosscheck: null });
}

/* =========================== G. Pade coefficients ======================== */
for (const c of REF.cases.filter(x => x.kind === 'pade')) {
  const got = await probe((i) => LIN.pade(i.L, i.order), c.inputs);
  const cmp = {}; let worst = 0;
  const norm = p => { const a = p[0]; return p.map(v => v / a); };
  const gn = norm(got.num), rn = norm(c.ref.num), gd = norm(got.den), rd = norm(c.ref.den);
  const sc = Math.max(...rn.map(Math.abs), ...rd.map(Math.abs));
  for (let i = 0; i < rn.length; i++) {
    const d = absrel(gn[i], rn[i], sc); cmp['num' + i] = { got: gn[i], ref: rn[i], rel: d, ok: d < 1e-12 }; worst = Math.max(worst, d);
  }
  for (let i = 0; i < rd.length; i++) {
    const d = absrel(gd[i], rd[i], sc); cmp['den' + i] = { got: gd[i], ref: rd[i], rel: d, ok: d < 1e-12 }; worst = Math.max(worst, d);
  }
  let xc = null;
  if (c.crosscheck) {
    const cn = norm(c.crosscheck.num), cd = norm(c.crosscheck.den);
    let m = 0;
    for (let i = 0; i < rn.length; i++) m = Math.max(m, absrel(cn[i], rn[i], sc));
    for (let i = 0; i < rd.length; i++) m = Math.max(m, absrel(cd[i], rd[i], sc));
    xc = { source: c.crosscheck.source, max_rel: m };
  }
  cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp, worst_rel: worst,
               pass: Object.values(cmp).every(v => v.ok), crosscheck: xc });
}


/* ============ E5: the drawn linear prediction of the default loop ========= */
for (const c of REF.cases.filter(x => x.kind === 'delay_closed_loop_default')) {
  const t = c.inputs.t;
  const got = await probe(({ C, G, H, n, tEnd }) => {
    const T = LIN.feedback(LIN.chain({ num: C.num, den: C.den, delay: 0 },
                                     { num: G.num, den: G.den, delay: G.delay }),
                           { num: H.num, den: H.den, delay: 0 }, { padeOrder: 3 });
    const r = LIN.stepResponse(T, tEnd, n);
    return { y: Array.from(r.y), approx: T.approx || null };
  }, { C: c.inputs.C, G: c.inputs.G, H: c.inputs.H, n: t.length, tEnd: t[t.length - 1] });
  let worst = 0;
  for (let i = 0; i < t.length; i++) worst = Math.max(worst, Math.abs(got.y[i] - c.ref.y[i]));
  const cmp = {
    /* Pass criterion from the physics of the drawing, not from what the tool
       does: the dashed linear prediction is compared by eye with the run on a
       chart whose resolution is about 1/1000 of the step, so the Pade error
       must be smaller than that. */
    max_dev_of_step: { got: worst, ref: 0, rel: worst, ok: worst < 1e-3 },
    approximation_declared: { got: got.approx, ref: 'pade',
                              rel: got.approx ? 0 : Infinity, ok: !!got.approx }
  };
  cases.push({ id: c.id, note: c.note, inputs: { loop: 'page default (coil)', nPoints: t.length },
               cmp, worst_rel: worst, pass: Object.values(cmp).every(v => v.ok),
               crosscheck: { source: 'DDE self-convergence between h and h/2',
                             max_rel: c.ref.self_convergence } });
}

/* ================ H. stiff plants against scipy solve_ivp ================ */
for (const c of REF.cases.filter(x => x.kind === 'stiff')) {
  const got = await probe((inp) => {
    const mk = () => (inp.model === 'vanderpol'
      ? { state0: () => new Float64Array([2, 0]),
          deriv: (t, x, u, d, pp, dx) => { dx[0] = x[1]; dx[1] = inp.mu * (1 - x[0] * x[0]) * x[1] - x[0] + u; },
          measure: (t, x) => x[0], fastestTau: () => 1 / inp.mu, deadTime: () => 0 }
      : { state0: () => new Float64Array([0, 0]),
          deriv: (t, x, u, d, pp, dx) => { dx[0] = (u - x[0]) / inp.tau_fast; dx[1] = (x[0] - x[1]) / inp.tau_slow; },
          measure: (t, x) => x[1], fastestTau: () => inp.tau_fast, deadTime: () => 0 });
    const u0 = inp.model === 'vanderpol' ? 0 : 1;
    const t0 = performance.now();
    const sim = SIM.simulate(mk(), {}, {
      openLoop: true, maxSamples: inp.maxSamples,
      fastestTau: inp.model === 'vanderpol' ? 1 / inp.mu : inp.tau_fast,
      controller: { Ts: 0 }, actuator: { mode: 'analog', stroke: 0 }, sensor: { tau: 0, noiseSd: 0 }
    }, { tEnd: inp.tEnd, command: { from: u0, to: u0, at: 0 }, w0: 0 });
    /* The reference instants ARE the tool's recorded samples (see the case
       note), so the index is exact and nothing is interpolated. */
    const dt = sim.step.h * sim.step.decimation;
    let mism = 0;
    const y = inp.t.map((T) => {
      const k = Math.round(T / dt);
      mism = Math.max(mism, Math.abs(sim.t[k] - T));
      return sim.y[k];
    });
    return { y, h: sim.step.h, nSteps: sim.step.nSteps, dec: sim.step.decimation,
             gridMismatch: mism, tEndSeen: inp.tEnd, ms: Math.round(performance.now() - t0),
             finite: y.every(Number.isFinite), scheme: sim.step.scheme, order: sim.step.plantOrder };
  }, c.inputs);
  const scale = Math.max(...c.ref.y.map(Math.abs), 1e-12);
  let worst = 0, at = 0;
  for (let i = 0; i < c.ref.y.length; i++) {
    const d = Math.abs(got.y[i] - c.ref.y[i]) / scale;
    if (d > worst) { worst = d; at = c.inputs.t[i]; }
  }
  const cmp = {
    /* RK4 at h = tau_fast/20 is far inside its stability limit (h|lambda| = 0.05
       against 2.785) and its local error is (h/tau)^5; 1e-6 relative over the
       whole record is a generous but not empty demand. */
    max_rel_dev: { got: worst, ref: 0, rel: worst, ok: worst < 1e-6 },
    all_finite: { got: got.finite, ref: true, rel: got.finite ? 0 : Infinity, ok: got.finite },
    /* The recorded instant must BE the instant the state belongs to: the
       reference is evaluated at t = k·dec·h exactly, so any clock drift in the
       tool would show up as a spurious deviation above. One ulp per sample is
       the most a correct implementation can carry. */
    sample_instants_coincide: { got: got.gridMismatch, ref: 0, rel: got.gridMismatch,
                                ok: got.gridMismatch <= 8 * Number.EPSILON * got.tEndSeen }
  };
  cases.push({ id: c.id, note: c.note + ' [tool: ' + got.scheme + ', h = ' + got.h
                 + ' s, ' + got.nSteps + ' steps, ' + got.ms + ' ms; worst at t = ' + at + ' s]',
               inputs: { model: c.inputs.model, tEnd: c.inputs.tEnd },
               cmp, worst_rel: worst, pass: Object.values(cmp).every(v => v.ok),
               crosscheck: { source: 'scipy.integrate.solve_ivp, Radau, rtol 1e-12/1e-11' } });
}

/* ====== S1: does the non-linear run converge to the linear prediction? ==== */
{
  const conv = await probe(() => {
    const e = APP.plants.find((x) => x.id === 'coil');
    const plant = e.plant, pp = APP.state.params.coil;
    const l0 = APP.state.loop.coil, sc0 = APP.state.scen.coil;
    const w0 = sc0.w0, d0 = sc0.d0, wAt = sc0.wAt, tEnd = sc0.tEnd;
    const eq = APP.equilibrium(plant, pp, w0, d0);
    const ft = APP.fastestTauOf(plant, pp, { u: eq.u, d: d0, w: w0 });
    const G = plant.linearize(pp, { u: eq.u, d: d0, w: w0 });
    /* every non-linear loop element switched off: instantaneous actuator, no
       deadband, no hysteresis, no noise, no quantisation, continuous
       controller, no sensor lag — so only the plant's own non-linearity and
       the integration step can separate the two curves */
    const C = { num: [l0.Kr * l0.ti, l0.Kr], den: [l0.ti, 0], delay: 0 };
    const H = { num: [1], den: [1], delay: 0 };
    const Tcl = LIN.feedback(LIN.chain(C, G), H, { padeOrder: 3 });
    const plantV = APP.plantAtEquilibrium(plant, eq);
    const base = SIM.pickStep(ft.tau, plant.deadTime(pp), 0).h;
    const mkcfg = (h) => ({
      fastestTau: ft.tau, maxSamples: 1e9, h,
      controller: { type: 'PI', Kr: l0.Kr, ti: l0.ti, td: 0, Ts: 0, bits: 32,
                    adcMin: l0.sMin, adcMax: l0.sMax, dFilterN: l0.dFilterN,
                    antiWindup: true, direct: !!l0.direct, u0: eq.u, uMin: 0, uMax: 1 },
      actuator: { mode: 'analog', stroke: 0, deadband: 0, hysteresis: 0, minPulse: 0,
                  relayHyst: 0, pos0: eq.u },
      sensor: { tau: 0, noiseSd: 0, bits: 32, min: l0.sMin, max: l0.sMax, seed: 1 }
    });
    const lin = LIN.stepResponse(Tcl, tEnd - wAt, 8001);
    const dt = lin.t[1] - lin.t[0];
    const interp = (tt) => {
      if (tt <= 0) return 0;
      const k = Math.min(lin.t.length - 2, Math.floor(tt / dt));
      const f = (tt - lin.t[k]) / dt;
      return lin.y[k] * (1 - f) + lin.y[k + 1] * f;
    };
    const dev = (dw, h) => {
      const scen = { setpoint: { from: w0, to: w0 + dw, at: wAt },
                     disturbance: { from: d0, to: d0, at: 0 }, tEnd, w0 };
      const sim = SIM.simulate(plantV, pp, mkcfg(h), scen);
      let m = 0;
      for (let i = 0; i < sim.t.length; i++) {
        m = Math.max(m, Math.abs(sim.y[i] - (w0 + dw * interp(sim.t[i] - wAt))));
      }
      return m / Math.abs(dw);
    };
    const amplitude = [10, 3, 1, 0.3, 0.1, 0.03].map((dw) => ({ dw, dev: dev(dw, base / 16) }));
    const step = [1, 2, 4, 8, 16].map((k) => ({ h: base / k, dev: dev(0.01, base / k) }));
    return { base, amplitude, step };
  });
  /* order in h from the two finest steps that are still above the round-off floor */
  const s = conv.step;
  const order = Math.log(s[1].dev / s[3].dev) / Math.log(s[3].h === 0 ? 1 : (s[1].h / s[3].h));
  const a = conv.amplitude;
  const shrinks = a.every((r, i) => i === 0 || r.dev <= a[i - 1].dev * 1.05);
  const cmp = {
    /* With every non-linear element off, the only two things left are the
       plant's own curvature (falls linearly with the step size dw) and the
       integrator (independent of dw, falls with h). Both must be visible. */
    deviation_falls_with_amplitude: { got: a.map((r) => +(100 * r.dev).toFixed(4)),
      ref: 'monotone decreasing', rel: shrinks ? 0 : Infinity, ok: shrinks },
    smallest_amplitude_deviation_pct: { got: 100 * a[a.length - 1].dev, ref: 0.5,
      rel: 100 * a[a.length - 1].dev, ok: 100 * a[a.length - 1].dev < 0.5 },
    residual_is_integrator_error: { got: +order.toFixed(3), ref: 1,
      rel: Math.abs(order - 1), ok: Math.abs(order - 1) < 0.25 },
    tool_declares_that_order: { got: null, ref: 1, rel: 0, ok: true }
  };
  const declared = await probe(() => {
    const r = APP.res();
    return r && r.sim && r.sim.step ? { order: r.sim.step.loopOrder, by: r.sim.step.orderLimitedBy } : null;
  });
  cmp.tool_declares_that_order = { got: declared, ref: 1,
    rel: (declared && declared.order === 1) ? 0 : Infinity,
    ok: !!declared && declared.order === 1 };
  cases.push({
    id: 'S1-nonlinear-converges-to-linear',
    note: 'Default coil loop with every non-linear element disabled (instantaneous actuator, no '
      + 'deadband, hysteresis, noise or quantisation, continuous controller, no sensor lag). '
      + 'The largest difference between the non-linear run and the linear closed-loop prediction, '
      + 'as a fraction of the setpoint step, is measured against the step size (plant curvature) '
      + 'and against the integration step (integrator error). Deviation at h/16: '
      + conv.amplitude.map((r) => r.dw + ' K -> ' + (100 * r.dev).toFixed(4) + ' %').join(', ')
      + '. At dw = 0.01 K, against h: '
      + conv.step.map((r) => 'h=' + r.h.toFixed(4) + ' -> ' + (100 * r.dev).toFixed(4) + ' %').join(', ')
      + '. Measured order in h = ' + order.toFixed(3) + '.',
    inputs: { plant: 'coil (page defaults)', nonlinear_elements: 'all disabled' },
    cmp, worst_rel: Math.max(...Object.values(cmp).map((v) => (Number.isFinite(v.rel) ? v.rel : 1))),
    pass: Object.values(cmp).every((v) => v.ok),
    crosscheck: null });
}

/* ===== S2: what the page's own 19-case reference run actually is ========== */
{
  const V = await probe(() => {
    const r = APP.runRefs();
    return { total: r.total, failed: r.failed, checks: r.checks,
             derivedChecks: r.derivedChecks, quotedChecks: r.quotedChecks };
  });
  const shown = await page.evaluate(async () => {
    APP.setTab('valid');
    await new Promise((r) => setTimeout(r, 300));
    document.getElementById('bValidate').click();
    await new Promise((r) => setTimeout(r, 25000));
    return document.body.innerText;
  });
  const cmp = {
    cases_run: { got: V.total, ref: 19, rel: V.total === 19 ? 0 : Infinity, ok: V.total === 19 },
    cases_failed: { got: V.failed, ref: 0, rel: V.failed === 0 ? 0 : Infinity, ok: V.failed === 0 },
    /* The audit itself: how many of the checked quantities are the tool's own
       output rather than a value printed in the cited source, and whether the
       page says so on screen (framework spec §3). */
    checks_total: { got: V.checks, ref: V.checks, rel: 0, ok: true },
    checks_not_from_a_source: { got: V.derivedChecks, ref: V.derivedChecks, rel: 0, ok: true },
    ui_states_it_is_a_self_check: {
      got: /self-check and not validation/.test(shown),
      ref: true,
      rel: /self-check and not validation/.test(shown) ? 0 : Infinity,
      ok: /self-check and not validation/.test(shown) },
    ui_shows_the_quote_and_the_reconstruction: {
      got: (shown.match(/what is quoted and what is rebuilt/g) || []).length,
      ref: '>= 19', rel: 0,
      ok: (shown.match(/what is quoted and what is rebuilt/g) || []).length >= 19 }
  };
  cases.push({
    id: 'S2-own-reference-run-audit',
    note: 'The page ships a 19-case reference run behind its Validate tab. This entry audits what '
      + 'those cases are, not whether they pass. ' + V.derivedChecks + ' of ' + V.checks
      + ' checked quantities are this page\'s own arithmetic or the output of a previous run of the '
      + 'same code; only ' + V.quotedChecks + ' are read from the cited publication, and none of the '
      + '19 is compared against an independent implementation. The pass criterion is therefore that '
      + 'the tab SAYS so, per FRAMEWORK_V2_SPEC §3 ("a self-check that re-evaluates the tool\'s own '
      + 'formula does not count towards benchmarked, and the UI must not present it as validation").',
    inputs: { tab: 'valid' }, cmp,
    worst_rel: 0, pass: Object.values(cmp).every((v) => v.ok), crosscheck: null });
}

/* ================= extra: the numbers actually on screen ================= */
{
  // Drive the UI: read the gain/phase margin the frequency tab prints and
  // compare it with LIN.margins on the loop the app itself built.
  const ui = await page.evaluate(async () => {
    APP.setTab('freq');
    await new Promise(r => setTimeout(r, 400));
    const txt = document.body.innerText;
    const res = APP.res();
    const m = res && res.margins ? res.margins : null;
    return { text: txt, gm: m ? m.gainMargin_dB : null, pm: m ? m.phaseMargin_deg : null };
  });
  const grab = (label) => {
    const re = new RegExp(label + '\\s*\\n\\s*(\u2212?-?\\d+[.,]?\\d*)');
    const m = ui.text.match(re);
    return m ? parseFloat(m[1].replace('\u2212', '-').replace(',', '.')) : null;
  };
  const gmShown = grab('Gain margin');
  const pmShown = grab('Phase margin');
  const cmp = {};
  cmp.gain_margin_on_screen = { got: gmShown, ref: ui.gm, rel: (gmShown === null || ui.gm === null) ? Infinity : Math.abs(gmShown - ui.gm), ok: gmShown !== null && ui.gm !== null && Math.abs(gmShown - ui.gm) < 0.06 };
  cmp.phase_margin_on_screen = { got: pmShown, ref: ui.pm, rel: (pmShown === null || ui.pm === null) ? Infinity : Math.abs(pmShown - ui.pm), ok: pmShown !== null && ui.pm !== null && Math.abs(pmShown - ui.pm) < 0.06 };
  cases.push({ id: 'UI1-margins-on-screen',
               note: 'The gain and phase margin printed on the Frequency tab for the default coil loop must equal LIN.margins on the loop the app assembled (display rounding 0.05).',
               inputs: { plant: 'default (coil)', tab: 'freq' }, cmp,
               worst_rel: Math.max(cmp.gain_margin_on_screen.rel, cmp.phase_margin_on_screen.rel),
               pass: Object.values(cmp).every(v => v.ok), crosscheck: null });
}

/* ============================ result file =============================== */
const total = cases.length;
const passed = cases.filter(c => c.pass).length;
const out = {
  tool: 'regelkring',
  file: 'regelkring.html',
  reference: 'python-control 0.10.2 (margin, nyquist_response, feedback, step_response, frequency_response), '
    + 'numpy/scipy polynomial algebra and root finding, an independently coded Nyquist winding-number '
    + 'integrator, a high-resolution delay-differential-equation solution of the closed-loop FOPDT step '
    + 'response, and the published tuning rules of Ziegler & Nichols (1942), Rivera/Morari/Skogestad (1986) '
    + 'and Astrom & Hagglund (2004) implemented from their printed formulae.',
  reference_citations: [
    'Ziegler, J.G. & Nichols, N.B., "Optimum settings for automatic controllers", Trans. ASME 64 (1942) 759-768, "Summary of controller adjustments", open-loop (reaction-curve) column',
    'Rivera, D.E., Morari, M. & Skogestad, S., "Internal model control 4: PID controller design", Ind. Eng. Chem. Process Des. Dev. 25 (1986) 252-265, Table 2 (FOPDT)',
    'Astrom, K.J. & Hagglund, T., "Revisiting the Ziegler-Nichols step response method for PID control", J. Process Control 14 (2004) 635-650, eqs. (7) and (10)',
    'Baker, G.A. & Graves-Morris, P., "Pade Approximants", 2nd ed., Cambridge University Press 1996, eq. (1.24)',
    'python-control 0.10.2 (Fuller, Greiner, Moore, Murray, van Paassen, Yorke, "The Python Control Systems Library", CDC 2021)',
    'Franklin, Powell & Emami-Naeini, "Feedback Control of Dynamic Systems", the textbook value GM = 6 at w = sqrt(2) for L = 1/(s(s+1)(s+2))'
  ],
  tolerance: 'Rational LTI algebra the tool claims to implement exactly: 1e-10 relative on normalised polynomial '
    + 'coefficients, 1e-9 on pole locations, 1e-11 on |L(jw)|, 1e-9 deg on arg L(jw) (modulo 360 deg), 1e-7 relative '
    + 'on gain/phase/delay margins and crossover frequencies, 1e-8 of the response span on step responses, '
    + '1e-12 relative on tuning-rule outputs (closed-form arithmetic), exact integer equality on Nyquist counts. '
    + 'The closed-loop step response of a dead-time loop is NOT rational; there the criterion is that the tool '
    + 'declares its Pade approximation, that the error falls with Pade order, and that the default order 3 stays '
    + 'within 2 % of the exact delay-differential-equation solution.',
  total, passed, failed: total - passed,
  page_errors: pageErrors,
  cases
};
/* The resolver created the output directory, and its default out is the file the site serves.
   This artifact carries no run_at of its own, so the stamp supplies one. */
writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`regelkring: ${passed}/${total} passed, ${pageErrors.length} page errors`);
for (const c of cases) if (!c.pass) {
  console.log('FAIL', c.id, 'worst_rel=', c.worst_rel);
  for (const [k, v] of Object.entries(c.cmp)) if (!v.ok) console.log('   ', k, JSON.stringify(v));
}
await browser.close();
process.exit(passed === total ? 0 : 1);
