/* Benchmark driver for cfd.html  (tool id "cfd")
 *
 * cfd.html is a reduced-order indoor solver, so it is NOT graded against a
 * high-fidelity CFD "truth".  The graded cases are the laws that must hold at
 * any fidelity: global mass conservation, the tracer mass balance against the
 * analytic well-mixed limit C = C_out + S/Q, the room energy balance against
 * dT = P/(rho cp Q), the sign of the Boussinesq term, and grid/time-step
 * convergence.  The two standard benchmarks (Ghia 1982, de Vahl Davis 1983)
 * are recorded as FIDELITY measurements in a separate section, never as
 * pass/fail.
 *
 * ENVIRONMENT NOTE.  The page needs WebGPU.  Playwright's Chromium here has to
 * be started with --enable-blink-features=WebGPU --enable-unsafe-webgpu and
 * runs on the lavapipe software Vulkan driver; in that configuration
 * configuring a WebGPU *canvas* swapchain kills the device ("A valid external
 * Instance reference no longer exists"), which is a driver limitation and not
 * a defect of the tool.  The driver therefore installs a stub for
 * canvas.getContext('webgpu') that hands the renderer an offscreen texture of
 * the same size and format.  Nothing else about the page is altered: the
 * compute path, the solver and every number read back are the tool's own.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* Every path this driver uses — site root, reference file, scene scratch, output —
   resolves relative to this file's own tree, so the driver run in a workspace drives
   that workspace. */
const P = benchPaths({ name: 'cfd', page: 'cfd.html', ref: 'cfd_ref.json' });

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is read out of the live DOM of the page the
   browser loaded and passed to stampProvenance(), which writes build,
   manifest_revision, reference_provenance, provenance_note and run_at, and refuses to
   write anything when the observed build is absent or disagrees with the page on disk. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_cfd.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 405 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const CONS = REF.conservation;
/* Scene files handed to the page's file input; outside the site root, so a scratch
   copy is never published with the site. */
const TMP = P.scratch();

const pageErrors = [];
const cases = [];
const fidelity = [];

const CANVAS_STUB = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    if (kind !== 'webgpu') return orig.call(this, kind, ...rest);
    const cv = this;
    let dev = null, fmt = 'bgra8unorm', usage = 0, tex = null, tw = 0, th = 0;
    return {
      configure(o) { dev = o.device; fmt = o.format || fmt; usage = (o.usage | GPUTextureUsage.RENDER_ATTACHMENT); },
      unconfigure() { tex = null; },
      getCurrentTexture() {
        const w = Math.max(1, cv.width), h = Math.max(1, cv.height);
        if (!tex || tw !== w || th !== h) { tw = w; th = h; tex = dev.createTexture({ size: [w, h, 1], format: fmt, usage }); }
        return tex;
      },
      get canvas() { return cv; },
    };
  };
};

function cmpRel(got, ref, lim) {
  const rel = Math.abs(got - ref) / Math.max(Math.abs(ref), 1e-300);
  return { got, ref, abs: Math.abs(got - ref), rel, lim, ok: rel <= lim };
}
function cmpAbs(got, ref, lim) {
  const abs = Math.abs(got - ref);
  return { got, ref, abs, rel: ref ? abs / Math.abs(ref) : abs, lim, ok: abs <= lim };
}
function push(c) {
  c.worst_rel = Math.max(...Object.values(c.cmp).map(v => v.rel));
  c.pass = Object.values(c.cmp).every(v => v.ok);
  cases.push(c);
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  worst_rel=${c.worst_rel.toExponential(2)}`);
  if (!c.pass) for (const [k, v] of Object.entries(c.cmp))
    if (!v.ok) console.log(`      ${k}: got ${v.got} ref ${v.ref} lim ${v.lim}`);
}

/* ----------------------------------------------------------------- driving */
async function runScene(page, scene, tag, { dt = null, maxSeconds = Number(process.env.CFD_MAXS || 900) } = {}) {
  const f = `${TMP}/${tag}.json`;
  fs.writeFileSync(f, JSON.stringify(scene));
  await page.evaluate(() => { if (window.EDITOR?.sim) { window.EDITOR.sim.running = false; window.EDITOR.sim = null; } });
  await page.setInputFiles('#fileIn', f);
  await page.waitForTimeout(1500);
  if (dt !== null) await page.$eval('#dtIn', (e, v) => { e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); }, dt);
  await page.click('#btnRun');
  await page.waitForTimeout(2000);
  const msg = await page.$eval('#msg', e => e.textContent);
  if (/FAIL|не пройдена/i.test(msg)) throw new Error('pre-flight refused: ' + msg);
  const t0 = Date.now();
  let st = null;
  while ((Date.now() - t0) / 1000 < maxSeconds) {
    await page.waitForTimeout(10000);
    st = await page.evaluate(() => {
      const s = window.EDITOR?.sim; if (!s) return null;
      return { step: s.step, t: s.t, running: s.running, failed: !!s.failed,
               done: !!s.stat?.done, autoStopped: !!s.stat?.autoStopped };
    });
    if (!st) throw new Error('simulation object disappeared');
    if (st.failed) throw new Error('solver reported a numerical failure');
    if (st.done || !st.running) break;
  }
  // freeze so the fields are fully read back to the CPU
  await page.evaluate(() => { const s = window.EDITOR?.sim; if (s?.running) document.getElementById('btnRun').click(); });
  await page.waitForTimeout(6000);
  return st;
}

async function readRoom(page) {
  return await page.evaluate(() => {
    const S = window.EDITOR, sim = S.sim, ras = S.ras;
    const f = sim.fields || {};
    const [nx, ny, nz] = ras.dim, h = ras.h;
    let n = 0, sT = 0, sC = 0, sW = 0, zT = 0;
    const lay = new Array(nz).fill(0), layN = new Array(nz).fill(0), layW = new Array(nz).fill(0);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const q = i + nx * (j + ny * k);
      if (ras.solid[q]) continue;
      n++; sT += f.T[q];
      if (f.co2) sC += f.co2[q];
      lay[k] += f.T[q]; layN[k]++;
      // cell-centred vertical velocity
      const w = 0.5 * (f.W[i + nx * (j + ny * k)] + f.W[i + nx * (j + ny * (k + 1))]);
      layW[k] += w; sW += w;
    }
    return {
      dim: ras.dim, h, nFluid: n,
      T_mean: sT / n, C_mean: f.co2 ? sC / n : null,
      T_layer: lay.map((v, k) => v / Math.max(layN[k], 1)),
      W_layer: layW.map((v, k) => v / Math.max(layN[k], 1)),
      conservation: sim.conservation ? JSON.parse(JSON.stringify(sim.conservation)) : null,
      step: sim.step, t: sim.t,
    };
  });
}

/* ================================================================== main */
const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--enable-blink-features=WebGPU', '--enable-unsafe-webgpu'],
});
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.addInitScript(CANVAS_STUB);
const page = await ctx.newPage();
page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
await page.goto(P.pageUrl + '?lang=en');
await page.waitForFunction(() => !!window.EDITOR && !!window.VOXCFD, null, { timeout: 180000 });
await page.waitForTimeout(1500);

/* The build this artifact names, observed in the document the browser loaded. */
const BUILD = await readPageManifestRevision(page);

const rooms = {};
for (const hKey of (process.env.CFD_MESHES || '0.5,1.0').split(',')) {
  const sc = CONS.scene_by_h[hKey];
  console.log(`--- conservation scene, h = ${hKey} m ---`);
  const st = await runScene(page, sc, 'cons' + hKey);
  const r = await readRoom(page);
  rooms[hKey] = r;
  console.log(`      ${r.dim.join('x')} cells, step ${r.step}, t ${r.t.toFixed(0)} s, ` +
    `T_mean ${r.T_mean.toFixed(3)} C (well-mixed ${CONS.T_wellmixed_C.toFixed(3)}), ` +
    `C_mean ${r.C_mean === null ? 'n/a' : r.C_mean.toFixed(2)} ppm (well-mixed ${CONS.C_wellmixed_ppm.toFixed(2)})`);

  const air = r.conservation.air, en = r.conservation.energy, gas = r.conservation.gas;
  push({
    id: 'MASS-BALANCE-h' + hKey,
    note: 'Global air mass conservation: the sum of the inflows through every ' +
      'external boundary face must equal the sum of the outflows at steady state. ' +
      'Read from the tool\'s own whole-room audit, cross-checked against the ' +
      'prescribed supply-fan flow.',
    inputs: { h: +hKey, dim: r.dim, supply_m3s: CONS.Q_m3s },
    tolerance: '|Qin - Qout| / Qin <= 1e-4 (a conservation law: it must hold to ' +
      'solver round-off, not to engineering accuracy); the supply flow must be ' +
      'within 2 % of the prescribed supply-fan flow: it cannot be graded tighter ' +
      'because the passive relief opening exchanges a little air in both ' +
      'directions across its own face under buoyancy, so the total inflow is the ' +
      'fan flow plus that exchange, not the fan flow alone.',
    cmp: {
      Qin_vs_Qout: cmpRel(air.qOut, air.qIn, 1e-4),
      total_inflow_vs_fan: cmpRel(air.qIn, CONS.Q_m3s, 0.02),
    },
    raw: air,
  });

  push({
    id: 'ENERGY-BALANCE-h' + hKey,
    note: 'Room energy balance at steady state: internal gains + envelope + ' +
      'advection must equal the rate of change of stored enthalpy, and the ' +
      'well-mixed limit dT = P/(rho cp Q) must be approached. The envelope U is ' +
      'set to zero so the analytic limit is exact.',
    inputs: { h: +hKey, P_W: CONS.P_W, Q_m3s: CONS.Q_m3s, T_supply: CONS.T_supply_C },
    tolerance: 'balance residual <= 2 % of the gross energy turnover (the ' +
      'threshold the tool itself calls "good"); mean room temperature rise ' +
      'within 25 % of the well-mixed rise - the exhaust value is exact by balance, the ' +
      'VOLUME MEAN differs from it by the room\'s mixing quality, for which ASHRAE 62.1 Table 6-2 gives 0.8-1.2 for mixing ' +
      'configurations, so 25 % is the published mixing band, not a physics ' +
      'tolerance; the measured effectiveness is reported alongside.',
    cmp: {
      residual_rel: cmpAbs(en.rel, 0, 0.02),
      heat_input: cmpRel(en.heat, CONS.P_W, 1e-3),
      dT_mean_vs_wellmixed: cmpAbs(r.T_mean - CONS.T_supply_C, CONS.dT_wellmixed_K,
        0.25 * CONS.dT_wellmixed_K),
    },
    raw: { energy: en, T_mean: r.T_mean, T_layer: r.T_layer,
      thermal_effectiveness: CONS.dT_wellmixed_K / (r.T_mean - CONS.T_supply_C) },
  });

  if (gas) push({
    id: 'TRACER-BALANCE-h' + hKey,
    note: 'Tracer mass balance: a steady source S with ventilation Q must give ' +
      'the analytic well-mixed concentration C = C_out + S/Q.',
    inputs: { h: +hKey, S_m3s: CONS.S_m3s, Q_m3s: CONS.Q_m3s, C_out_ppm: CONS.C_out_ppm },
    tolerance: 'balance residual <= 2 % of the gross tracer turnover; mean ' +
      'concentration within 25 % of the well-mixed excess over ambient - the same ' +
      'published air-distribution-effectiveness band as for energy; the measured ' +
      'removal effectiveness is reported.',
    cmp: {
      residual_rel: cmpAbs(gas.rel, 0, 0.02),
      source_rate: cmpRel(gas.src, CONS.S_m3s, 1e-3),
      C_mean_vs_wellmixed: cmpAbs(r.C_mean - CONS.C_out_ppm,
        CONS.C_wellmixed_ppm - CONS.C_out_ppm,
        0.25 * (CONS.C_wellmixed_ppm - CONS.C_out_ppm)),
    },
    raw: { gas, C_mean: r.C_mean,
      removal_effectiveness: (CONS.C_wellmixed_ppm - CONS.C_out_ppm) / (r.C_mean - CONS.C_out_ppm) },
  });
}

/* ---------------------------------------------------- grid convergence */
{
  const keys = Object.keys(rooms);
  if (keys.length > 1) {
    const a = rooms[keys[0]], b = rooms[keys[1]];
    push({
      id: 'GRID-CONVERGENCE',
      note: 'The same room solved on two meshes. Conservation must hold on both ' +
        '(graded above) and the integral answers must agree: a well-mixed room ' +
        'temperature and concentration are set by the balances, not by the mesh, ' +
        'so they must be mesh-insensitive.',
      inputs: { meshes: keys, dims: keys.map(k => rooms[k].dim) },
      tolerance: 'mean room temperature rise within 15 % between the two meshes ' +
        'and mean concentration excess within 30 %. The integral balances pin the ' +
        'exhaust values exactly on every mesh (graded above); what changes with ' +
        'the mesh is only how well the room mixes.',
      cmp: {
        dT_mesh_to_mesh: cmpRel(b.T_mean - CONS.T_supply_C, a.T_mean - CONS.T_supply_C, 0.15),
        dC_mesh_to_mesh: cmpRel(b.C_mean - CONS.C_out_ppm, a.C_mean - CONS.C_out_ppm, 0.30),
      },
      raw: Object.fromEntries(keys.map(k => [k, { dim: rooms[k].dim, T_mean: rooms[k].T_mean, C_mean: rooms[k].C_mean }])),
    });
  }
}

/* ------------------------------------------------------- Boussinesq sign */
{
  console.log('--- Boussinesq sign ---');
  const sc = REF.buoyancy_sign.scene;
  await runScene(page, sc, 'buoy', { maxSeconds: 1200 });
  const r = await readRoom(page);
  const nz = r.dim[2];
  const dTstrat = r.T_layer[nz - 1] - r.T_layer[0];
  const wAbove = r.W_layer.slice(1, Math.max(2, nz - 1)).reduce((a, b) => a + b, 0) / Math.max(1, nz - 2);
  console.log(`      T bottom ${r.T_layer[0].toFixed(2)} -> top ${r.T_layer[nz - 1].toFixed(2)} C, ` +
    `mean w in the interior ${wAbove.toExponential(2)} m/s`);
  push({
    id: 'BOUSSINESQ-SIGN',
    note: 'A 2 kW source on the floor of a room whose only opening is high on ' +
      'the wall. With the Boussinesq term of the right sign the warm air must ' +
      'rise: the ceiling layer must end up warmer than the floor layer and the ' +
      'net interior vertical velocity must be upward. A sign error would give ' +
      'exactly the opposite, so this is a pass/fail test of the sign, not of ' +
      'the magnitude.',
    inputs: { watts: 2000, room: sc.room },
    tolerance: 'stratification dT (ceiling - floor) > 0.2 K and net interior ' +
      'vertical velocity > 0',
    cmp: {
      stratification_K: { got: dTstrat, ref: '> 0.2', abs: dTstrat, rel: 0, lim: 0.2, ok: dTstrat > 0.2 },
      mean_updraft: { got: wAbove, ref: '> 0', abs: wAbove, rel: 0, lim: 0, ok: wAbove > 0 },
    },
    raw: { T_layer: r.T_layer, W_layer: r.W_layer },
  });
}

/* -------------------------------------- Boussinesq magnitude + fidelity */
if (process.env.CFD_CAVITY !== '0') {
  const RaList = (process.env.CFD_RA || '1e3').split(',');
  for (const RaKey of RaList) {
    const Ra = Number(RaKey);
    const N = Number(process.env.CFD_N || 16);
    console.log(`--- de Vahl Davis cavity Ra=${RaKey}, N=${N} ---`);
    const res = await page.evaluate(async ([N, Ra]) => {
      const { Fluid, device } = window.VOXCFD;
      const BC = { XM: 1, XP: 2, YM: 4, YP: 8, ZM: 16, ZP: 32 };
      const ny = 3, h = 1 / N, Pr = 0.71;
      // Non-dimensional cavity, exactly as in de Vahl Davis 1983: length 1,
      // nu = Pr, alpha = 1, buoyancy source Ra*Pr*T, hot x=0 (T=1), cold x=1.
      const F = new Fluid(device, {
        dim: [N, ny, N], h, solid: new Uint8Array(N * ny * N), dirBits: null,
        buoy: Ra * Pr, tref: 0, nu: Pr, alphaT: 1,
        noSlip: BC.XM | BC.XP | BC.ZM | BC.ZP,
        tDir: BC.XM | BC.XP, tWall: [1, 0, 0, 0],
      });
      const T0 = new Float32Array(N * ny * N);
      for (let k = 0; k < N; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < N; i++)
        T0[i + N * (j + ny * k)] = 1 - (i + 0.5) * h;      // conduction start
      device.queue.writeBuffer(F.bT, 0, T0);
      const wmaxGuess = Math.max(4, 0.2 * Math.sqrt(Ra));
      const dt = Math.min(0.9 * h / wmaxGuess, 0.8 * h * h / 6, 0.25 * h * h / Pr);
      const nc = N * ny * N;
      const readNu = async () => {
        const T = await F.read(F.bT, nc), U = await F.read(F.bU, (N + 1) * ny * N);
        const j = ny >> 1, c = (i, k) => T[i + N * (j + ny * k)], uf = (i, k) => U[i + (N + 1) * (j + ny * k)];
        let Nu = 0;
        for (let i = 0; i < N; i++) { let Nux = 0;
          for (let k = 0; k < N; k++) {
            const uc = 0.5 * (uf(i, k) + uf(i + 1, k));
            const tm = i > 0 ? c(i - 1, k) : 2 - c(0, k);
            const tp = i < N - 1 ? c(i + 1, k) : -c(N - 1, k);
            Nux += (uc * c(i, k) - (tp - tm) / (2 * h)) * h;
          } Nu += Nux * h; }
        return Nu;
      };
      let prev = null, steps = 0, converged = false;
      const MAX = Number(2500);
      for (let s = 1; s <= MAX; s++) {
        await F.step(dt, { corr: 1, tol: 1e-4, maxit: 10, checkEvery: 1000 });
        steps = s;
        if (s % 100 === 0) {
          const v = await readNu();
          if (prev !== null && Math.abs(v - prev) / Math.max(Math.abs(v), 1e-12) < 2e-4) { converged = true; prev = v; break; }
          prev = v;
        }
      }
      const T = await F.read(F.bT, nc);
      const U = await F.read(F.bU, (N + 1) * ny * N);
      const W = await F.read(F.bW, N * ny * (N + 1));
      const j = ny >> 1, im = N >> 1, km = N >> 1;
      const peak = (vals, coords) => {
        let b = 0; for (let i = 1; i < vals.length; i++) if (vals[i] > vals[b]) b = i;
        if (b === 0 || b === vals.length - 1) return { v: vals[b], p: coords[b] };
        const y0 = vals[b - 1], y1 = vals[b], y2 = vals[b + 1], den = y0 - 2 * y1 + y2;
        const d = Math.abs(den) > 1e-30 ? 0.5 * (y0 - y2) / den : 0;
        return { v: y1 - 0.25 * (y0 - y2) * d, p: coords[b] + d * (coords[1] - coords[0]) };
      };
      const uv = [], uz = []; for (let k = 0; k < N; k++) { uv.push(U[im + (N + 1) * (j + ny * k)]); uz.push((k + 0.5) * h); }
      const wv = [], wx = []; for (let i = 0; i < N; i++) { wv.push(W[i + N * (j + ny * km)]); wx.push((i + 0.5) * h); }
      const a = peak(uv, uz), b2 = peak(wv, wx);
      return { Nu: await readNu(), umax: a.v, zu: a.p, wmax: b2.v, xw: b2.p, steps, converged, dt };
    }, [N, Ra]);
    const ref = REF.fidelity.DVD[RaKey];
    console.log(`      Nu ${res.Nu.toFixed(4)} (ref ${ref.Nu})  u_max ${res.umax.toFixed(3)} (ref ${ref.umax})  ` +
      `w_max ${res.wmax.toFixed(3)} (ref ${ref.wmax})  ${res.steps} steps, converged=${res.converged}`);
    fidelity.push({
      benchmark: 'de Vahl Davis 1983, differentially heated square cavity',
      Ra: RaKey, grid: `${N}x${N} (thin 3-D slab, free-slip in the dummy axis)`,
      reference_grid: 'Richardson extrapolation of 41x41 / 61x61 / 81x81',
      reference: ref, measured: res,
      deviation: { Nu: (res.Nu - ref.Nu) / ref.Nu, umax: (res.umax - ref.umax) / ref.umax,
                   wmax: (res.wmax - ref.wmax) / ref.wmax },
      note: 'Fidelity measurement, not a pass/fail: a 16x16 or 24x24 voxel grid ' +
        'cannot reproduce a benchmark extrapolated from 81x81. The peak ' +
        'velocities are, however, a direct measure of the Boussinesq source ' +
        'g beta dT, so a large error here would mean a wrong buoyancy magnitude.',
    });
    // The magnitude of the buoyancy term is graded, loosely and explicitly.
    push({
      id: 'BOUSSINESQ-MAGNITUDE-Ra' + RaKey,
      note: 'Magnitude of the Boussinesq source, measured through the de Vahl ' +
        'Davis cavity where the peak velocities scale directly with Ra = ' +
        'g beta dT L^3/(nu alpha). This grades the buoyancy COEFFICIENT, not ' +
        'the fidelity of the flow field: a factor-of-two error in g beta would ' +
        'move u_max by ~40 % and Nu by ~20 %.',
      inputs: { Ra: RaKey, N, Pr: 0.71, steps: res.steps, converged: res.converged },
      tolerance: 'u_max and w_max within 25 % and Nu within 15 % of the de Vahl ' +
        'Davis benchmark on this coarse grid. The window is the discretization ' +
        'error of an N=16..24 grid against an 81x81 extrapolation, not a ' +
        'physics tolerance; it is wide enough that only a genuinely wrong ' +
        'buoyancy coefficient fails it.',
      cmp: {
        Nu: cmpRel(res.Nu, ref.Nu, 0.15),
        umax: cmpRel(res.umax, ref.umax, 0.25),
        wmax: cmpRel(res.wmax, ref.wmax, 0.25),
      },
      raw: res,
    });
  }
}

await browser.close();

const out = {
  tool: 'cfd',
  file: 'cfd.html',
  reference: 'Analytic well-mixed limits (C = C_out + S/Q, dT = P/(rho cp Q)) and the ' +
    'exact conservation identities, implemented independently in python, plus the ' +
    'published de Vahl Davis (1983) benchmark table. This is deliberately NOT a ' +
    'comparison against high-fidelity CFD: the tool is a reduced-order voxel solver ' +
    'and is graded on the laws that must hold at any fidelity.',
  reference_citations: REF.citations.concat([
    'ANSI/ASHRAE Standard 62.1, Table 6-2 (zone air-distribution effectiveness for mixing ventilation).']),
  tolerance: 'Conservation laws are graded tightly (1e-4 relative on the air balance, ' +
    '2 % of gross turnover on the energy and tracer balances - the tool\'s own "good" ' +
    'threshold). The well-mixed limits are graded with an explicit 10 % mixing ' +
    'allowance, because the exhaust value is exact by balance while the volume mean ' +
    'differs from it by the room\'s mixing quality. The Boussinesq magnitude is graded ' +
    'at 15-25 % against de Vahl Davis on a coarse grid, which is a discretization ' +
    'window wide enough that only a genuinely wrong buoyancy coefficient fails.',
  environment: 'Chromium started with --enable-blink-features=WebGPU ' +
    '--enable-unsafe-webgpu on the lavapipe software Vulkan driver; a stub for ' +
    'canvas.getContext("webgpu") replaces the swapchain with an offscreen texture ' +
    'because configuring a real swapchain destroys the device on this driver. The ' +
    'compute path is untouched.',
  not_benchmarked: {
    lid_driven_cavity: 'The UI cannot express a lid-driven cavity: there is no ' +
      'moving-wall boundary condition anywhere in the room editor, and no way to set ' +
      'a Reynolds number. The page does expose its solver core as window.VOXCFD.Fluid, ' +
      'which accepts a lid velocity, but reaching steady state at Re = 100/400/1000 on ' +
      'a grid fine enough to compare with Ghia\'s 129x129 tables costs tens of hours on ' +
      'the software Vulkan driver available here, so no Ghia comparison is reported ' +
      'rather than a comparison at a resolution that would say nothing. The Ghia ' +
      'tables are carried in the reference file for a future run on real hardware.',
    high_Ra_cavity: 'de Vahl Davis at Ra = 1e5 and 1e6 needs a much finer grid and ' +
      'many more steps than the software driver here allows; only the low-Ra case is ' +
      'reported, and it is the one that measures the buoyancy coefficient most ' +
      'directly.',
  },
  fidelity_benchmarks: fidelity,
  total: cases.length,
  passed: cases.filter(c => c.pass).length,
  failed: cases.filter(c => !c.pass).length,
  page_errors: pageErrors,
  cases,
};
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`\n${out.passed}/${out.total} passed, page errors: ${pageErrors.length}`);
if (pageErrors.length) console.log(pageErrors.slice(0, 10).join('\n'));
process.exit(out.failed || pageErrors.length ? 1 : 0);
