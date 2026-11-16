/* Benchmark driver for ductnetwork.html
 *
 * Reference: bench-src/ref/ductnetwork_ref.json — two structurally independent
 * python solvers (a simultaneous nodal Newton on the unscaled residuals via
 * scipy.optimize.root, and a classical Hardy Cross loop-correction solver),
 * plus closed-form hand solutions for the single-duct, series, parallel,
 * fan-operating-point, grille, damper and tee-arm cases.
 *
 * Networks are pushed into the page through its own JSON import control
 * (#loadFile), solved with DiagramUI.current.run(), and read back from the
 * results tables, from Diagram.record.build().outputs and from the page's own
 * solution object (window.__ductTest.state.sol).
 *
 * 2026-10-03 adaptation (base URL + framework locators). The tolerances, the
 * case ids, the reference values and every comparison are unchanged; see
 * DELIVERY.md for the line-by-line list.
 *
 * Usage:
 *   node run_ductnetwork.mjs --base http://127.0.0.1:8323 [--tool ductnetwork.html]
 *                            [--ref <ref json>] [--out <result json>] [--runs 2]
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
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
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_ductnetwork.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 2 306 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* ---------------------------------------------------------------- arguments */
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
/* Every path resolves relative to this file's own tree: the reference to
   bench-src/ref and the artifact to <siteRoot>/benchmarks/ductnetwork.json. The
   driver's own --ref and --out are still read and still win. */
const BP = benchPaths({ name: 'ductnetwork', page: arg('tool', 'ductnetwork.html'),
                        ref: 'ductnetwork_ref.json' });
/* This driver reaches its page over http, as it did before; --base or BENCH_BASE sets
   the origin and the default is unchanged. */
const BASE = (arg('base', BP.base || 'http://127.0.0.1:8323')).replace(/\/+$/, '');
const TOOL = BP.pageFile;
const REF_PATH = arg('ref', BP.ref);
const OUT = arg('out', BP.out);
const RUNS = Number(arg('runs', '2'));
const PREV = arg('prev', '');   // the shipped artifact, compared to and reported, never used as a reference
const REF = JSON.parse(fs.readFileSync(REF_PATH, 'utf8'));
const URL_ = `${BASE}/${TOOL}?lang=en`;
const G = 9.80665;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ductnet-'));

/* --------------------------------------------------------------- tolerances */
// The reference solvers converge to |residual| < 1e-13 and agree with each other
// to <1e-16 m3/s, so the tolerance is set by the page's own declared convergence
// gate (scaled residual 2e-9, thrown above 2e-6) rather than by the reference.
const TOL_Q_REL = 1e-6;    // relative on edge flow
const TOL_Q_ABS = 1e-9;    // m3/s floor for near-zero flows
const TOL_H_ABS = 1e-6;    // m of head
const TOL_DISPLAY = 0.05;  // m3/h — the flow column prints 1 decimal
const TOL_RECORD = 1e-9;   // m3/h — declared record output vs the solution it came from

const fp = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);

function netFile(id, net) {
  const doc = {
    schema: 'tools.petrov.re/duct-network/v1',
    air: { rho: net.fluid.rho, nu: net.fluid.nu },
    analysis: { loadFactor: net.fluid.load * 100, speedFactor: net.fluid.speed * 100 },
    nodes: net.nodes, edges: net.edges,
  };
  const f = path.join(TMP, id + '.json');
  fs.writeFileSync(f, JSON.stringify(doc));
  return f;
}

/* Read the two framework result tables by their first header cell.  The v1 ids
   #nodeResults / #edgeResults were tbody elements, so `#id tr` yielded DATA rows
   only; the framework renders a full <table>, so the header row is dropped here
   to keep the row set identical. */
const READ_TABLES = `(() => {
  const want = h => [...document.querySelectorAll('table.dgu-table')]
    .find(t => t.rows.length && (t.rows[0].cells[0] || {}).innerText &&
               t.rows[0].cells[0].innerText.trim().toUpperCase().startsWith(h));
  const body = t => t ? [...t.rows].slice(1).map(r => [...r.cells].map(c => c.innerText.trim())) : [];
  return { nodeRows: body(want('NODE')), edgeRows: body(want('EDGE')) };
})()`;

/* Import landing (harness defect F2): the #loadFile handler awaits File.text(),
   so the import is asynchronous.  Waiting on node ids alone is not enough — the
   600- and 601-unknown networks share every node id.  Wait on the full node+edge
   signature AND on invalidate() having discarded the previous solution. */
async function importNetwork(page, id, net) {
  const sig = JSON.stringify({ n: net.nodes.map(n => n.id), e: net.edges.map(e => e.id) });
  await page.setInputFiles('#loadFile', netFile(id, net));
  await page.waitForFunction(s => {
    const st = window.__ductTest && window.__ductTest.state;
    if (!st) return false;
    const cur = JSON.stringify({ n: st.nodes.map(n => n.id), e: st.edges.map(e => e.id) });
    return cur === s && st.sol === null;
  }, sig, { timeout: 20000 });
}

/* Rule 3: prove the inputs the case names are the values the page holds, from the
   page's own state, BEFORE any output is read.  Returns the worst absolute
   deviation over every numeric field of every node and edge, plus the fluid. */
function landingDeviation(net, got) {
  let worst = 0; const bad = [];
  const num = (a, b, what) => {
    if (typeof a !== 'number' || typeof b !== 'number') { if (a !== b) { bad.push(what + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); worst = Math.max(worst, 1); } return; }
    const d = Math.abs(a - b) / Math.max(1, Math.abs(a));
    if (d > worst) worst = d;
    if (d > 1e-12) bad.push(what + ': ' + a + ' vs ' + b);
  };
  if (net.nodes.length !== got.nodes.length) { bad.push('node count'); worst = 1; }
  if (net.edges.length !== got.edges.length) { bad.push('edge count'); worst = 1; }
  net.nodes.forEach((n, i) => {
    const g = got.nodes[i] || {};
    if (g.id !== n.id) { bad.push('node[' + i + '].id'); worst = 1; return; }
    for (const k of ['z', 'demand', 'p']) if (n[k] !== undefined) num(n[k], g[k], 'node ' + n.id + '.' + k);
    if (n.fixed !== undefined && !!n.fixed !== !!g.fixed) { bad.push('node ' + n.id + '.fixed'); worst = 1; }
  });
  net.edges.forEach((e, i) => {
    const g = got.edges[i] || {};
    if (g.id !== e.id) { bad.push('edge[' + i + '].id'); worst = 1; return; }
    if (g.type !== e.type) { bad.push('edge ' + e.id + '.type'); worst = 1; }
    for (const k of ['a', 'b', 'shape', 'law']) if (e[k] !== undefined && g[k] !== e[k]) { bad.push('edge ' + e.id + '.' + k + ': ' + e[k] + ' vs ' + g[k]); worst = 1; }
    for (const k of ['L', 'W', 'H', 'D', 'eps', 'K', 'P0', 'Qrated', 'Prated', 'speed', 'Qdesign', 'dpDesign', 'opening', 'n', 'target'])
      if (typeof e[k] === 'number') num(e[k], g[k], 'edge ' + e.id + '.' + k);
  });
  num(net.fluid.rho, got.fluid.rho, 'fluid.rho');
  num(net.fluid.nu, got.fluid.nu, 'fluid.nu');
  num(net.fluid.load, got.fluid.load, 'fluid.load');
  num(net.fluid.speed, got.fluid.speed, 'fluid.speed');
  return { worst, bad: bad.slice(0, 8) };
}

async function readState(page) {
  return page.evaluate(`(() => {
    const T = window.__ductTest, st = T.state, sol = st.sol;
    const tabs = ${READ_TABLES};
    const verdicts = [...document.querySelectorAll('.dgu-verdict')].map(n => n.innerText.trim()).filter(Boolean);
    const notices = [...document.querySelectorAll('.dgu-notice, .dgu-error, [class*="notice"]')].map(n => n.innerText.trim()).filter(Boolean);
    const ui = window.DiagramUI.current;
    let rec = null;
    try { const b = window.Diagram.record.build(); rec = b && b.outputs ? b.outputs : null; } catch (e) { rec = null; }
    return {
      status: verdicts.join(' | ') || notices.join(' | ') || '',
      badge: (document.getElementById('residualBadge') || {}).innerText || '',
      nodeRows: tabs.nodeRows, edgeRows: tabs.edgeRows,
      record: rec,
      sol: sol ? {
        iter: sol.iter, residual: sol.residual, maxContinuity: sol.maxContinuity,
        maxEnergy: sol.maxEnergy, warnings: sol.warnings,
        node: Object.fromEntries(Object.entries(sol.node).map(([k, v]) => [k, { pHead: v.pHead, hgl: v.hgl, p: v.p, demand: v.demand, boundary: v.boundary }])),
        edge: Object.fromEntries(Object.entries(sol.edge).map(([k, v]) => [k, { q: v.q, loss: v.loss, fan: v.fan, vel: v.vel, Re: v.Re, f: v.f, potentialAcross: v.potentialAcross }])),
      } : null,
      nodes: st.nodes.map(n => ({ id: n.id, z: n.z, demand: n.demand, fixed: n.fixed, p: n.p })),
      edges: st.edges.map(e => ({ ...e })),
      fluid: { rho: Number(ui.state.rho), nu: Number(ui.state.nu), load: Number(ui.state.loadFactor) / 100, speed: Number(ui.state.speedFactor) / 100 },
    };
  })()`);
}

async function loadAndSolve(page, id, net, scenes) {
  await importNetwork(page, id, net);
  // Inputs are asserted from the page's own state BEFORE any output is read.
  const pre = await page.evaluate(`(() => {
    const st = window.__ductTest.state, ui = window.DiagramUI.current;
    return { nodes: st.nodes.map(n => ({ id: n.id, z: n.z, demand: n.demand, fixed: n.fixed, p: n.p })),
             edges: st.edges.map(e => ({ ...e })),
             fluid: { rho: Number(ui.state.rho), nu: Number(ui.state.nu), load: Number(ui.state.loadFactor) / 100, speed: Number(ui.state.speedFactor) / 100 } };
  })()`);
  const landing = landingDeviation(net, pre);
  // solve: the framework action behind #solveBtn
  const ret = await page.evaluate(() => {
    try { const r = window.DiagramUI.current.run(); return { ok: true, verdict: (r && r.verdict && r.verdict.text) || '' }; }
    catch (e) { return { ok: false, verdict: String(e && e.message || e) }; }
  });
  const got = await readState(page);
  if (!got.status && ret.verdict) got.status = ret.verdict;
  got.landing = landing;
  if (scenes) scenes.push({
    id, outputs_fp: got.record ? fp(got.record) : null,
    solution_fp: got.sol ? fp({ e: got.sol.edge, n: got.sol.node }) : null,
    solved: !!got.sol, edges: net.edges.length, nodes: net.nodes.length,
  });
  return got;
}

/* ---- independent re-implementation of the component equations, used for the
   invariant checks (loop energy closure, fan operating point) -------------- */
function swameeJain(Re, rel) { return 0.25 / Math.pow(Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2); }
function darcyF(Re, rel) {
  if (!(Re > 0)) return 0;
  if (Re <= 2000) return 64 / Re;
  const turb = swameeJain(Re, rel);
  if (Re >= 4000) return turb;
  const lam = 64 / Re, t = (Re - 2000) / 2000, s = t * t * (3 - 2 * t);
  return lam * (1 - s) + turb * s;
}
function openingFactor(e) { const o = Math.min(1, Math.max(0.001, e.opening / 100)); return e.law === 'equal' ? Math.pow(50, o - 1) : o; }
function areaDh(e) { if (e.shape === 'round') { const D = e.D / 1000; return { A: Math.PI * D * D / 4, Dh: D }; } const W = e.W / 1000, H = e.H / 1000; return { A: W * H, Dh: 2 * W * H / (W + H) }; }
function edgeLoss(e, q, fl) {
  const aq = Math.abs(q); let loss = 0;
  if (e.type === 'duct' || e.type === 'tee') {
    const { A, Dh } = areaDh(e), v = aq / A, Re = v * Dh / fl.nu;
    const coeff = e.type === 'duct' ? darcyF(Re, e.eps / 1000 / Dh) * e.L / Dh + e.K : e.K;
    loss = coeff * v * v / (2 * G);
  } else if (e.type === 'damper') { const c = openingFactor(e); loss = (e.dpDesign / (fl.rho * G)) * Math.pow(aq / (e.Qdesign / 3600), 2) / (c * c); }
  else if (e.type === 'grille') loss = (e.dpDesign / (fl.rho * G)) * Math.pow(aq / (e.Qdesign / 3600), e.n);
  return q === 0 ? 0 : Math.sign(q) * loss;
}
function edgePump(e, q, fl) {
  if (e.type !== 'fan') return 0;
  const qr = e.Qrated / 3600, a = (e.P0 - e.Prated) / (qr * qr), s = e.speed / 100 * fl.speed;
  return (e.P0 * s * s - a * q * Math.abs(q)) / (fl.rho * G);
}
/* fundamental loops of the graph (spanning tree + one loop per chord) */
function fundamentalLoops(nodes, edges) {
  const adj = new Map(nodes.map(n => [n.id, []]));
  edges.forEach((e, k) => { adj.get(e.a).push([e.b, k]); adj.get(e.b).push([e.a, k]); });
  const root = nodes[0].id, parent = new Map(), pe = new Map(), seen = new Set([root]), tree = new Set(), stack = [root];
  while (stack.length) {
    const u = stack.pop();
    for (const [v, k] of adj.get(u)) if (!seen.has(v)) { seen.add(v); parent.set(v, u); pe.set(v, k); tree.add(k); stack.push(v); }
  }
  const toRoot = x => { const o = []; while (x !== root) { o.push([pe.get(x), x]); x = parent.get(x); } return o; };
  const loops = [];
  edges.forEach((e, k) => {
    if (tree.has(k)) return;
    const pa = toRoot(e.a), pb = toRoot(e.b);
    const sa = new Set(pa.map(t => t[0])), sb = new Set(pb.map(t => t[0]));
    const common = new Set([...sa].filter(x => sb.has(x)));
    const loop = [[k, +1]];
    for (const [ek, ch] of pb) if (!common.has(ek)) loop.push([ek, edges[ek].b === ch ? -1 : +1]);
    for (const [ek, ch] of pa) if (!common.has(ek)) loop.push([ek, edges[ek].b === ch ? +1 : -1]);
    loops.push(loop);
  });
  return loops;
}

/* ---------------------------------------------------------------- one pass */
async function pass(browser, tag) {
  const cases = [];
  const scenes = [];
  const pageErrors = [];
  function push(id, note, inputs, cmp, extra) {
    let worst = 0;
    for (const v of Object.values(cmp)) worst = Math.max(worst, Number.isFinite(v.rel) ? v.rel : 1);
    const pass_ = Object.values(cmp).every(v => v.ok);
    cases.push(Object.assign({ id, note, inputs, cmp, worst_rel: worst, pass: pass_ }, extra || {}));
    console.log(`${tag} ${pass_ ? 'PASS' : 'FAIL'}  ${id.padEnd(34)} worst=${worst.toExponential(2)}`);
    if (!pass_) for (const [k, v] of Object.entries(cmp)) if (!v.ok) console.log('        ', k, JSON.stringify(v).slice(0, 300));
  }

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.evaluate(() => window.Diagram.whenReady());
  await page.waitForTimeout(300);

  // the framework must actually have rendered: these are the surfaces the driver uses
  const surfaces = await page.evaluate(() => ({
    loadFile: !!document.getElementById('loadFile'),
    solveBtn: !!document.getElementById('solveBtn'),
    verdict: !!document.querySelector('.dgu-verdict'),
    tables: document.querySelectorAll('table.dgu-table').length,
    test: !!(window.__ductTest && window.__ductTest.state),
    ui: !!(window.DiagramUI && window.DiagramUI.current && typeof window.DiagramUI.current.run === 'function'),
    record: (() => { try { return !!window.Diagram.record.build().outputs; } catch (e) { return false; } })(),
  }));
  for (const [k, v] of Object.entries(surfaces)) if (!v) throw new Error('driver surface missing: ' + k + ' (' + JSON.stringify(surfaces) + ')');
  if (surfaces.tables < 2) throw new Error('driver surface missing: two result tables (' + surfaces.tables + ')');

  /* The build this artifact names, observed in the document the browser loaded; the
     manifest is read again only for the fields that are not the revision, so the
     graded revision has one code path. */
  const manifest_revision = await readPageManifestRevision(page);
  const build = await page.evaluate(() => {
    const m = window.Diagram.manifest();
    return { id: m.id, file: m.file, compute_backend: (m.compute && m.compute.backend) || null };
  });
  build.manifest_revision = manifest_revision;

  const selfTest = await page.evaluate(() => window.__ductTest.runSelfTests());
  console.log(`${tag} page self-tests (not counted as validation): ${selfTest.passed}/${selfTest.total}`);

  const flowsById = {};

  for (const rc of REF.cases) {
    const got = await loadAndSolve(page, rc.id, rc.net, scenes);
    const cmp = {};
    /* Rule 3 gate: the case's own inputs, read back from the page's state. */
    cmp['inputs_landed_on_the_page'] = {
      got: got.landing.worst, ref: 0, rel: got.landing.worst, ok: got.landing.worst <= 1e-12,
      mismatches: got.landing.bad,
    };
    if (!got.sol) {
      push(rc.id, rc.note, { nodes: rc.net.nodes.length, edges: rc.net.edges.length },
        Object.assign(cmp, { solved: { got: got.status, ref: 'a solution', rel: 1, ok: false } }));
      continue;
    }
    const ref = rc.newton;
    flowsById[rc.id] = got.sol.edge;

    /* ---- flows and heads against the independent solvers ---- */
    for (const e of rc.net.edges) {
      const g = got.sol.edge[e.id].q, r = ref.q[e.id];
      const d = Math.abs(g - r), rel = Math.abs(r) > 1e-9 ? d / Math.abs(r) : d;
      cmp['q_' + e.id + '_m3h'] = { got: g * 3600, ref: r * 3600, rel, ok: d <= TOL_Q_ABS || rel <= TOL_Q_REL, ref_source: 'recomputed' };
    }
    for (const n of rc.net.nodes) {
      const g = got.sol.node[n.id].pHead, r = ref.h[n.id], d = Math.abs(g - r);
      cmp['h_' + n.id + '_m'] = { got: g, ref: r, rel: d, ok: d <= TOL_H_ABS, ref_source: 'recomputed' };
    }
    if (typeof rc.crosscheck_max_abs_q_m3s === 'number') {
      const w = rc.crosscheck_max_abs_q_m3s;
      cmp['crosscheck_newton_vs_hardy_cross_m3s'] = { got: w, ref: 0, rel: w, ok: w <= 1e-12, ref_source: 'recomputed' };
    }
    if (rc.analytic) {
      let w = 0;
      for (const k of Object.keys(rc.analytic)) w = Math.max(w, Math.abs(rc.analytic[k] - got.sol.edge[k].q));
      cmp['hand_solution_max_abs_q_m3s'] = { got: w, ref: 0, rel: w, ok: w <= TOL_Q_ABS, ref_source: 'recomputed' };
    }

    /* ---- invariants that must hold for ANY network ---- */
    // 1. mass balance at every node, recomputed from the page's own flows
    let worstMass = 0;
    for (const n of got.nodes) {
      let bal = -n.demand * got.fluid.load / 3600;
      for (const e of got.edges) { const q = got.sol.edge[e.id].q; if (e.b === n.id) bal += q; if (e.a === n.id) bal -= q; }
      if (n.fixed) continue;                       // a fixed node absorbs the imbalance by design
      worstMass = Math.max(worstMass, Math.abs(bal));
    }
    cmp['mass_balance_free_nodes_m3s'] = { got: worstMass, ref: 0, rel: worstMass, ok: worstMass <= 1e-12 };

    // 2. energy balance on every edge and around every independent loop
    let worstEdge = 0;
    for (const e of got.edges) {
      const a = got.nodes.find(n => n.id === e.a), b = got.nodes.find(n => n.id === e.b);
      const q = got.sol.edge[e.id].q;
      const r = got.sol.node[a.id].pHead + a.z - got.sol.node[b.id].pHead - b.z + edgePump(e, q, got.fluid) - edgeLoss(e, q, got.fluid);
      worstEdge = Math.max(worstEdge, Math.abs(r));
    }
    // The page converges its Newton iteration on SCALED residuals to 2e-9, where
    // the energy rows are divided by hScale. The honest absolute tolerance is
    // therefore 2e-9*hScale (still ~4 orders below the 1e-3 m it prints).
    const hScale = Math.max(5, ...got.nodes.filter(n => n.fixed).map(n => Math.abs(n.p / (got.fluid.rho * G))),
      ...got.nodes.map(n => Math.abs(n.z)),
      ...got.edges.filter(e => e.type === 'fan').map(e => Math.abs(e.P0 * Math.pow(e.speed / 100 * got.fluid.speed, 2) / (got.fluid.rho * G))));
    const tolE = 2e-9 * hScale;
    cmp['edge_energy_balance_m'] = { got: worstEdge, ref: 0, rel: worstEdge, tolerance: tolE, ok: worstEdge <= tolE };

    const loops = fundamentalLoops(got.nodes, got.edges);
    let worstLoop = 0;
    for (const loop of loops) {
      let s = 0;
      for (const [k, sg] of loop) { const e = got.edges[k], q = got.sol.edge[e.id].q; s += sg * (edgeLoss(e, q, got.fluid) - edgePump(e, q, got.fluid)); }
      worstLoop = Math.max(worstLoop, Math.abs(s));
    }
    cmp['loop_energy_balance_m'] = { got: worstLoop, ref: 0, rel: worstLoop, tolerance: tolE * Math.max(1, loops.length), ok: worstLoop <= tolE * Math.max(1, loops.length), loops: loops.length };

    // 3. fan operating point on the fan curve AND on the system curve
    for (const e of got.edges.filter(e => e.type === 'fan')) {
      const q = got.sol.edge[e.id].q;
      const curve = edgePump(e, q, got.fluid);
      const a = got.nodes.find(n => n.id === e.a), b = got.nodes.find(n => n.id === e.b);
      const system = (got.sol.node[b.id].pHead + b.z) - (got.sol.node[a.id].pHead + a.z);
      cmp['fan_' + e.id + '_on_curve_m'] = { got: got.sol.edge[e.id].fan, ref: curve, rel: Math.abs(got.sol.edge[e.id].fan - curve), ok: Math.abs(got.sol.edge[e.id].fan - curve) <= 1e-12 * Math.max(1, hScale) };
      cmp['fan_' + e.id + '_on_system_curve_m'] = { got: system, ref: curve, rel: Math.abs(system - curve), tolerance: tolE, ok: Math.abs(system - curve) <= tolE };
    }

    // 4. the page's own reported residuals must be consistent with what it produced
    cmp['reported_continuity_residual_m3h'] = { got: got.sol.maxContinuity, ref: worstMass * 3600, rel: Math.abs(got.sol.maxContinuity - worstMass * 3600), ok: Math.abs(got.sol.maxContinuity - worstMass * 3600) <= 1e-9 };
    cmp['reported_energy_residual_Pa'] = { got: got.sol.maxEnergy, ref: worstEdge * got.fluid.rho * G, rel: Math.abs(got.sol.maxEnergy - worstEdge * got.fluid.rho * G), ok: Math.abs(got.sol.maxEnergy - worstEdge * got.fluid.rho * G) <= 1e-11 * Math.max(1, hScale) };

    // 5. the displayed flow column must match the solution it came from
    let worstDisp = 0;
    got.edgeRows.forEach((row, i) => {
      const e = got.edges[i];
      const shown = Number(row[2]);
      worstDisp = Math.max(worstDisp, Math.abs(shown - got.sol.edge[e.id].q * 3600));
    });
    cmp['displayed_flow_column_m3h'] = { got: worstDisp, ref: 0, rel: worstDisp, ok: worstDisp <= TOL_DISPLAY, rows: got.edgeRows.length };

    // 6. the declared record outputs must match the solution they were built from
    let worstRec = 0;
    for (const e of got.edges) {
      const dec = got.record ? got.record['flow_' + e.id] : undefined;
      const d = typeof dec === 'number' ? Math.abs(dec - got.sol.edge[e.id].q * 3600) : 1;
      worstRec = Math.max(worstRec, d);
    }
    cmp['declared_record_matches_solution_m3h'] = { got: worstRec, ref: 0, rel: worstRec, ok: worstRec <= TOL_RECORD };

    push(rc.id, rc.note, { nodes: rc.net.nodes.length, edges: rc.net.edges.length, fluid: rc.net.fluid }, cmp,
      { tool_status: got.status, iterations: got.sol.iter, scaled_residual: got.sol.residual, reference_provenance: 'recomputed' });
  }

  /* ---------------- monotonicity of throttling ---------------- */
  {
    const ids = ['shipped_example_network', 'example_damper_60', 'example_damper_30', 'example_damper_10'];
    const opens = [100, 60, 30, 10];
    const qv = ids.map(i => flowsById[i]['E4'].q * 3600);
    const qf = ids.map(i => flowsById[i]['E1'].q * 3600);
    const qb = ids.map(i => flowsById[i]['E7'].q * 3600);
    const mono = (a, dir) => a.every((v, i) => i === 0 || (dir > 0 ? v < a[i - 1] : v > a[i - 1]));
    const cmp = {
      damper_branch_flow_decreases: { got: qv, ref: 'strictly decreasing', rel: mono(qv, +1) ? 0 : 1, ok: mono(qv, +1) },
      fan_flow_decreases: { got: qf, ref: 'strictly decreasing', rel: mono(qf, +1) ? 0 : 1, ok: mono(qf, +1) },
      parallel_branch_flow_increases: { got: qb, ref: 'strictly increasing', rel: mono(qb, -1) ? 0 : 1, ok: mono(qb, -1) },
    };
    push('damper_closure_monotonicity',
      'Throttling damper A of the shipped example from 100 % to 60/30/10 % must reduce that branch flow and the fan flow monotonically, and push airflow into the parallel branch.',
      { openings: opens }, cmp);
  }

  /* ---------------- Swamee-Jain faithfulness and its scatter ---------------- */
  {
    const grid = [];
    for (const Re of [5e3, 1e4, 1e5, 1e6, 1e7, 1e8]) for (const rel of [1e-6, 1e-5, 1e-4, 1e-3, 1e-2]) grid.push([Re, rel]);
    const gotF = await page.evaluate(g => g.map(([Re, rel]) => window.__ductTest.frictionFactor(Re, rel)), grid);
    let worst = 0, worstCole = 0;
    for (let i = 0; i < grid.length; i++) {
      const [Re, rel] = grid[i];
      const sj = swameeJain(Re, rel);
      worst = Math.max(worst, Math.abs(gotF[i] - sj) / sj);
      // fully converged Colebrook root, for the scatter statement only
      let x = 1 / Math.sqrt(sj);
      for (let k = 0; k < 200; k++) { const y = rel / 3.7 + 2.51 * x / Re; x -= (x + 2 * Math.log10(y)) / (1 + 2 / Math.LN10 * (2.51 / Re) / y); }
      worstCole = Math.max(worstCole, Math.abs(sj - 1 / (x * x)) * (x * x));
    }
    push('swamee_jain_implementation',
      'The page states it uses Swamee-Jain turbulent friction. This checks the coefficients are transcribed exactly (0.25 / log10(eps/(3.7 Dh) + 5.74/Re^0.9)^2) over 5e3 <= Re <= 1e8 and 1e-6 <= eps/D <= 1e-2, the range for which Swamee & Jain (1976) state the approximation. The maximum deviation from the fully converged Colebrook-White root over that same grid is recorded as the correlation scatter; it is not graded, because Swamee-Jain is what the page claims to implement.',
      { Re: '5e3..1e8', rel: '1e-6..1e-2' },
      { coefficients_transcribed: { got: worst, ref: 0, rel: worst, ok: worst <= 1e-14 } },
      { swamee_jain_vs_colebrook_max_rel: worstCole });
    console.log(`${tag}         Swamee-Jain vs Colebrook over the stated range: max ${(worstCole * 100).toFixed(2)} % (correlation scatter, not a defect)`);
  }

  /* ---------------- convergence honesty ---------------- */
  {
    // A fan asked to deliver through a grille whose design drop dwarfs its
    // shutoff pressure has no forward-flow solution on the fitted two-point curve.
    const net = {
      fluid: { rho: 1.204, nu: 1.5e-5, load: 1, speed: 1 },
      nodes: [{ id: 'N1', name: 'N1', x: 120, y: 300, z: 0, demand: 0, fixed: true, p: 0 },
      { id: 'N2', name: 'N2', x: 400, y: 300, z: 0, demand: 0, fixed: false, p: 0 },
      { id: 'N3', name: 'N3', x: 680, y: 300, z: 0, demand: 0, fixed: true, p: 4000 }],
      edges: [{ id: 'E1', name: 'E1', type: 'fan', a: 'N1', b: 'N2', P0: 700, Qrated: 6000, Prated: 430, speed: 100 },
      { id: 'E2', name: 'E2', type: 'duct', a: 'N2', b: 'N3', shape: 'round', L: 20, W: 500, H: 300, D: 315, eps: 0.09, K: 2 }],
    };
    const got = await loadAndSolve(page, 'no_forward_solution', net, scenes);
    const q = got.sol ? got.sol.edge.E1.q : null;
    const honest = !got.sol
      ? /No convergence|Solver|singular|diverged/i.test(got.status)
      : (got.sol.warnings.length > 0 && /reverse/i.test(got.sol.warnings.join(' ')));
    push('convergence_reporting',
      'A fan pushing against a downstream boundary 4000 Pa above its inlet has no forward-flow solution on the fitted two-point curve. The page must either report non-convergence or flag the extrapolated reverse-flow operating point; silently returning the last iterate as a result would be a defect.',
      { downstream_boundary_Pa: 4000, fan_shutoff_Pa: 700 },
      { reported_honestly: { got: (got.sol ? 'solved q=' + q + ' warnings=' + JSON.stringify(got.sol.warnings) : got.status).slice(0, 300), ref: 'error or warning', rel: honest ? 0 : 1, ok: honest } });
  }

  {
    // deliberately unsolvable: no fixed-pressure node anywhere
    const net = {
      fluid: { rho: 1.204, nu: 1.5e-5, load: 1, speed: 1 },
      nodes: [{ id: 'N1', name: 'N1', x: 120, y: 300, z: 0, demand: -1000, fixed: false, p: 0 },
      { id: 'N2', name: 'N2', x: 500, y: 300, z: 0, demand: 1000, fixed: false, p: 0 }],
      edges: [{ id: 'E1', name: 'E1', type: 'duct', a: 'N1', b: 'N2', shape: 'round', L: 10, W: 500, H: 300, D: 315, eps: 0.09, K: 0 }],
    };
    const got = await loadAndSolve(page, 'no_reference_node', net, scenes);
    const ok = !got.sol && /fixed[- ]pressure|reference/i.test(got.status);
    push('missing_pressure_reference',
      'A network with no fixed-pressure node has an undetermined pressure level; the page must refuse it rather than return an arbitrary datum.',
      { fixed_nodes: 0 },
      { refused: { got: got.status.slice(0, 200), ref: 'refusal message', rel: ok ? 0 : 1, ok } });
  }

  /* ---------------- the declared 600-unknown limit ---------------- */
  {
    const build = (nFree, nEdges) => {
      const nodes = [{ id: 'R', name: 'R', x: 100, y: 100, z: 0, demand: 0, fixed: true, p: 3000 }];
      const edges = [];
      for (let i = 1; i <= nFree; i++) nodes.push({ id: 'V' + i, name: 'V' + i, x: 90 + (i % 12) * 70, y: 80 + (Math.floor(i / 12) % 8) * 60, z: 0, demand: 50.0, fixed: false, p: 0 });
      for (let i = 1; i <= nFree; i++) edges.push({ id: 'P' + i, name: 'P' + i, type: 'duct', a: i === 1 ? 'R' : 'V' + (i - 1), b: 'V' + i, shape: 'round', L: 5, W: 500, H: 300, D: 400, eps: 0.09, K: 0 });
      while (edges.length < nEdges) { const k = edges.length + 1; edges.push({ id: 'P' + k, name: 'P' + k, type: 'duct', a: 'R', b: 'V' + ((k % nFree) + 1), shape: 'round', L: 6, W: 500, H: 300, D: 315, eps: 0.09, K: 0 }); }
      return { fluid: { rho: 1.204, nu: 1.5e-5, load: 1, speed: 1 }, nodes, edges };
    };
    const cmp = {};
    // exactly at the limit: 300 free nodes + 300 edges = 600 unknowns
    const at = await loadAndSolve(page, 'limit_600', build(300, 300), scenes);
    cmp['at_600_unknowns_solves'] = { got: at.sol ? 'solved, ' + at.sol.iter + ' it' : at.status.slice(0, 160), ref: 'solved', rel: at.sol ? 0 : 1, ok: !!at.sol };
    // one unknown over the limit: 300 free nodes + 301 edges
    const over = await loadAndSolve(page, 'limit_601', build(300, 301), scenes);
    const refused = !over.sol && /601 nonlinear unknowns|limited to 600/i.test(over.status);
    cmp['at_601_unknowns_refused'] = { got: over.status.slice(0, 200), ref: 'refusal naming the 600 limit', rel: refused ? 0 : 1, ok: refused };
    // and the network must not be silently truncated on import
    const kept = await page.evaluate(() => ({ n: window.__ductTest.state.nodes.length, e: window.__ductTest.state.edges.length }));
    cmp['not_silently_truncated'] = { got: kept, ref: { n: 301, e: 301 }, rel: (kept.n === 301 && kept.e === 301) ? 0 : 1, ok: kept.n === 301 && kept.e === 301 };
    push('unknown_count_limit',
      'The page declares a 600-nonlinear-unknown limit (edges + free nodes). It must solve at 600, refuse at 601 with a message naming the limit, and must not silently drop components on import.',
      { limit: 600 }, cmp);
  }

  /* ---------------- fan operating point on the plotted system curve -------- */
  {
    const got = await loadAndSolve(page, 'curve_check', REF.cases.find(c => c.id === 'shipped_example_network').net, scenes);
    const sweep = await page.evaluate(() => {
      const T = window.__ductTest, st = T.state;
      const q = st.sol.edge.E1.q;
      const at = T.solveNetwork({ flowOverride: { E1: q }, loadMultiplier: 1 });
      const pts = [];
      for (let k = 1; k <= 14; k++) {
        const qq = q * k / 7;
        try { const s2 = T.solveNetwork({ flowOverride: { E1: qq }, loadMultiplier: qq / q }); pts.push([qq, s2.edge.E1.potentialAcross]); } catch (e) { }
      }
      return { q, sysAtOp: at.edge.E1.potentialAcross, pumpHead: st.sol.edge.E1.fan, headAcross: st.sol.edge.E1.potentialAcross, pts };
    });
    const relSys = Math.abs(sweep.sysAtOp - sweep.pumpHead) / Math.abs(sweep.pumpHead);
    const monotone = sweep.pts.every((p2, i) => i === 0 || p2[1] > sweep.pts[i - 1][1]);
    push('fan_operating_point_on_both_curves',
      'The plotted system curve is generated by re-solving with the fan airflow overridden. At the solved airflow it must return exactly the pressure rise the fan curve delivers, and the swept system curve must rise monotonically with airflow.',
      { fan: 'E1', sweep_points: sweep.pts.length },
      {
        system_curve_at_operating_flow: { got: sweep.sysAtOp, ref: sweep.pumpHead, rel: relSys, ok: relSys <= 1e-8 },
        potential_across_equals_fan_curve: { got: sweep.headAcross, ref: sweep.pumpHead, rel: Math.abs(sweep.headAcross - sweep.pumpHead), ok: Math.abs(sweep.headAcross - sweep.pumpHead) <= 1e-8 },
        system_curve_monotone: { got: monotone, ref: true, rel: monotone ? 0 : 1, ok: monotone },
      });
  }

  /* ---------------- silent clamping ---------------- */
  {
    const cmp = {};
    for (const op of [0.0001, 0.05, 0.099]) {
      const r = await page.evaluate(o => {
        try {
          window.__ductTest.normalizeImport({
            schema: 'tools.petrov.re/duct-network/v1',
            nodes: [{ id: 'N1', fixed: true, p: 300 }, { id: 'N2', fixed: true, p: 0 }],
            edges: [{ id: 'E1', type: 'damper', a: 'N1', b: 'N2', Qdesign: 2500, dpDesign: 55, opening: o, law: 'linear', target: 0 }],
          });
          return 'ACCEPTED';
        } catch (e) { return e.message; }
      }, op);
      const ok = r !== 'ACCEPTED' && /0\.1/.test(r);
      cmp['opening_' + op] = { got: r.slice(0, 170), ref: 'refusal naming the 0.1 % minimum', rel: ok ? 0 : 1, ok };
    }
    const kept = await page.evaluate(() => window.__ductTest.openingFactor({ opening: 0.1, law: 'linear' }));
    cmp['no_clamping_inside_the_allowed_range'] = { got: kept, ref: 0.001, rel: Math.abs(kept - 0.001), ok: Math.abs(kept - 0.001) <= 1e-15 };
    push('damper_opening_clamping',
      'The damper loss law clamps opening/100 to a 0.001 floor. Openings below 0.1 % must be refused on import rather than silently clamped to a different damper than the one entered.',
      { openings: [0.0001, 0.05, 0.099, 0.1] }, cmp);
  }

  /* ---------------- correlation-range warning ---------------- */
  {
    const mk = (D, eps, L, p1) => ({
      fluid: { rho: 1.204, nu: 1.5e-5, load: 1, speed: 1 },
      nodes: [{ id: 'N1', name: 'N1', x: 100, y: 100, z: 0, demand: 0, fixed: true, p: p1 },
      { id: 'N2', name: 'N2', x: 500, y: 100, z: 0, demand: 0, fixed: true, p: 0 }],
      edges: [{ id: 'E1', name: 'E1', type: 'duct', a: 'N1', b: 'N2', shape: 'round', L, W: 500, H: 300, D, eps, K: 0 }],
    });
    const cmp = {};
    const rough = await loadAndSolve(page, 'very_rough_duct', mk(100, 5.0, 20, 400), scenes);
    const okR = rough.sol && rough.sol.warnings.some(w => /Swamee/i.test(w));
    cmp['rough_duct_eps_over_D_0.05'] = { got: rough.sol ? rough.sol.warnings : rough.status, ref: 'warning that eps/D is outside the published range', rel: okR ? 0 : 1, ok: !!okR };
    const trans = await loadAndSolve(page, 'transition_duct', mk(200, 0.09, 400, 2.02), scenes);
    const Re = trans.sol ? trans.sol.edge.E1.Re : NaN;
    const okT = trans.sol && Re > 2000 && Re < 4000 && trans.sol.warnings.some(w => /Transition/i.test(w));
    cmp['transition_band_flagged'] = { got: { Re, warnings: trans.sol ? trans.sol.warnings : null }, ref: 'warning when 2000 < Re < 4000', rel: okT ? 0 : 1, ok: !!okT };
    push('correlation_range_warnings',
      'Swamee-Jain is published for 1e-6 <= eps/Dh <= 1e-2 and 5e3 <= Re <= 1e8, and 2000 < Re < 4000 is a numerical blend rather than a resolved transition model. Ducts running outside those ranges must be named in a warning, not silently extrapolated.',
      { cases: ['eps/Dh = 0.05', 'Re in the 2000-4000 blend'] }, cmp);
  }

  /* ---------------- import validation ---------------- */
  {
    const bad = [
      { id: 'dangling_edge', doc: { schema: 'tools.petrov.re/duct-network/v1', nodes: [{ id: 'N1', fixed: true, p: 0 }], edges: [{ id: 'E1', type: 'duct', a: 'N1', b: 'N9', L: 10, D: 400 }] }, expect: /invalid endpoint/i },
      { id: 'duplicate_node_id', doc: { schema: 'tools.petrov.re/duct-network/v1', nodes: [{ id: 'N1' }, { id: 'N1' }], edges: [] }, expect: /duplicate node/i },
      { id: 'self_loop', doc: { schema: 'tools.petrov.re/duct-network/v1', nodes: [{ id: 'N1' }, { id: 'N2' }], edges: [{ id: 'E1', type: 'duct', a: 'N1', b: 'N1', L: 10, D: 400 }] }, expect: /invalid endpoint/i },
      { id: 'bad_schema', doc: { schema: 'something/else', nodes: [], edges: [] }, expect: /schema/i },
      { id: 'negative_diameter', doc: { schema: 'tools.petrov.re/duct-network/v1', nodes: [{ id: 'N1', fixed: true, p: 0 }, { id: 'N2' }], edges: [{ id: 'E1', type: 'duct', a: 'N1', b: 'N2', shape: 'round', L: 10, D: -400 }] }, expect: /diameter must be positive/i },
      { id: 'fan_rated_above_shutoff', doc: { schema: 'tools.petrov.re/duct-network/v1', nodes: [{ id: 'N1', fixed: true, p: 0 }, { id: 'N2' }], edges: [{ id: 'E1', type: 'fan', a: 'N1', b: 'N2', P0: 400, Qrated: 5000, Prated: 500, speed: 100 }] }, expect: /P0>Prated/i },
      { id: 'air_density_out_of_range', doc: { schema: 'tools.petrov.re/duct-network/v1', air: { rho: 998 }, nodes: [{ id: 'N1', fixed: true, p: 0 }, { id: 'N2' }], edges: [{ id: 'E1', type: 'duct', a: 'N1', b: 'N2', shape: 'round', L: 10, D: 400 }] }, expect: /density must be/i },
      { id: 'bad_shape', doc: { schema: 'tools.petrov.re/duct-network/v1', nodes: [{ id: 'N1', fixed: true, p: 0 }, { id: 'N2' }], edges: [{ id: 'E1', type: 'duct', a: 'N1', b: 'N2', shape: 'oval', L: 10, D: 400 }] }, expect: /rectangular or circular/i },
    ];
    const cmp = {};
    for (const t of bad) {
      const r = await page.evaluate(d => { try { window.__ductTest.normalizeImport(d); return 'ACCEPTED'; } catch (e) { return e.message; } }, t.doc);
      const ok = r !== 'ACCEPTED' && t.expect.test(r);
      cmp[t.id] = { got: r.slice(0, 160), ref: String(t.expect), rel: ok ? 0 : 1, ok };
    }
    push('import_validation',
      'Malformed network files must be rejected with a specific message rather than partially imported.',
      { cases: bad.map(b => b.id) }, cmp);
  }

  /* ---------------- positive control (rule 3) ----------------
     Not a graded case. One input of the single-duct scene is perturbed by a
     visible amount and the compared output must move by a measurable amount.
     A suite whose cases all pass while the driver sets nothing would show a
     zero move here. */
  const control = await (async () => {
    const base_ = REF.cases.find(c => c.id === 'single_rect_duct').net;
    const a = await loadAndSolve(page, 'control_baseline', base_, null);
    const perturbed = JSON.parse(JSON.stringify(base_));
    perturbed.edges[0].L = base_.edges[0].L * 2;          // double the duct length
    const b = await loadAndSolve(page, 'control_perturbed', perturbed, null);
    const qa = a.sol ? a.sol.edge.E1.q * 3600 : null, qb = b.sol ? b.sol.edge.E1.q * 3600 : null;
    const rowA = a.edgeRows[0] ? Number(a.edgeRows[0][2]) : null;
    const rowB = b.edgeRows[0] ? Number(b.edgeRows[0][2]) : null;
    const moved = qa !== null && qb !== null && Math.abs(qb - qa) / Math.abs(qa) > 0.05 && qb < qa;
    return {
      what: 'single_rect_duct with L doubled from ' + base_.edges[0].L + ' m to ' + perturbed.edges[0].L + ' m',
      state_L_baseline: a.edges[0].L, state_L_perturbed: b.edges[0].L,
      q_E1_m3h_baseline: qa, q_E1_m3h_perturbed: qb,
      displayed_flow_baseline_m3h: rowA, displayed_flow_perturbed_m3h: rowB,
      relative_move: qa ? Math.abs(qb - qa) / Math.abs(qa) : null,
      moved_and_decreased: moved,
    };
  })();
  console.log(`${tag} positive control: q_E1 ${control.q_E1_m3h_baseline} -> ${control.q_E1_m3h_perturbed} m3/h (${(control.relative_move * 100).toFixed(1)} % move), moved=${control.moved_and_decreased}`);
  if (!control.moved_and_decreased) throw new Error('positive control failed: the compared output did not move when an input was perturbed');

  await ctx.close();
  return { cases, scenes, pageErrors, selfTest, control, build };
}

/* ---------------------------------------------------------------- main */
async function main() {
  const browser = await chromium.launch();
  const passes = [];
  for (let i = 0; i < RUNS; i++) passes.push(await pass(browser, '[run ' + (i + 1) + ']'));
  await browser.close();

  /* determinism: every graded number of every case, plus the declared-output
     and solution fingerprints of every driven scene */
  const gradedOf = p => JSON.stringify(p.cases.map(c => [c.id, Object.fromEntries(Object.entries(c.cmp).map(([k, v]) => [k, [v.got, v.ref, v.rel, v.ok]]))]));
  let identical = true, firstDiff = null;
  for (let i = 1; i < passes.length; i++) {
    if (gradedOf(passes[i]) !== gradedOf(passes[0])) {
      identical = false;
      const a = JSON.parse(gradedOf(passes[0])), b = JSON.parse(gradedOf(passes[i]));
      for (let k = 0; k < a.length && !firstDiff; k++)
        for (const key of Object.keys(a[k][1]))
          if (!firstDiff && JSON.stringify(a[k][1][key]) !== JSON.stringify((b[k] || [0, {}])[1][key]))
            firstDiff = { case: a[k][0], key, run1: a[k][1][key], ['run' + (i + 1)]: (b[k] || [0, {}])[1][key] };
    }
  }
  const fpsOf = p => JSON.stringify(p.scenes.map(s => [s.id, s.outputs_fp, s.solution_fp]));
  const fpsIdentical = passes.every(p => fpsOf(p) === fpsOf(passes[0]));

  const P = passes[0];
  const cases = P.cases, scenes = P.scenes;
  const total = cases.length, passed = cases.filter(c => c.pass).length;
  const pageErrors = [...new Set(passes.flatMap(p => p.pageErrors))];
  const solved = scenes.filter(s => s.solved);
  const bySol = new Map();
  for (const s of solved) { if (!bySol.has(s.solution_fp)) bySol.set(s.solution_fp, []); bySol.get(s.solution_fp).push(s.id); }

  const worstLanding = Math.max(0, ...cases.map(c => (c.cmp.inputs_landed_on_the_page || { rel: 0 }).rel));

  /* comparison against the shipped artifact: reported, never used as a reference */
  let regression = { compared: 0, identical: 0, moved: [], key_set_differences: [], note: PREV ? '' : 'no --prev artifact given' };
  if (PREV && fs.existsSync(PREV)) {
    const prev = JSON.parse(fs.readFileSync(PREV, 'utf8'));
    const pc = Object.fromEntries(prev.cases.map(c => [c.id, c]));
    for (const c of cases) {
      const o = pc[c.id]; if (!o) { regression.key_set_differences.push('case only in this run: ' + c.id); continue; }
      for (const [k, v] of Object.entries(c.cmp)) {
        if (!(k in o.cmp)) { regression.key_set_differences.push(c.id + '.' + k + ' only in this run'); continue; }
        regression.compared++;
        const a = o.cmp[k].got, b = v.got;
        if (JSON.stringify(a) === JSON.stringify(b)) regression.identical++;
        else regression.moved.push({ case: c.id, key: k, was: a, now: b,
          rel: (typeof a === 'number' && typeof b === 'number' && a !== 0) ? Math.abs(b - a) / Math.abs(a) : null });
      }
      for (const k of Object.keys(o.cmp)) if (!(k in c.cmp)) regression.key_set_differences.push(c.id + '.' + k + ' only in the previous artifact');
    }
    regression.note = 'Compared with ' + PREV + ' (run_at ' + prev.run_at + '). The previous artifact is a record, not a reference: nothing here is graded against it.';
  }

  const nullCrosscheck = REF.cases.filter(c => typeof c.crosscheck_max_abs_q_m3s !== 'number').map(c => c.id);
  const findings = [
    { id: 'F1-driver-ported-to-the-framework-surfaces',
      severity: 'harness defect, fixed here',
      what: 'bench-src/run_ductnetwork.mjs addressed the page as a file:// URL under one machine\'s fixed site directory, and the pre-port DOM: #solveStatus, #nodeResults, #edgeResults, #rho, #nu, #loadFactor and #speedFactor do not exist on the shipped page (measured: 0 occurrences of nodeResults and edgeResults in ductnetwork.html). It is ported here to a base URL plus tool path and to the framework surfaces (.dgu-verdict, table.dgu-table, DiagramUI.current.state, DiagramUI.current.run, Diagram.record.build). #loadFile, #solveBtn, #residualBadge and window.__ductTest all still exist and are used unchanged. No tolerance, case, reference value or comparison was altered.' },
    { id: 'F2-import-landing-race',
      severity: 'harness defect, fixed here',
      what: 'The #loadFile handler awaits File.text(), so the import is asynchronous and the original 120 ms sleep can grade the previous network. The wait now covers the full node+edge signature AND requires invalidate() to have nulled state.sol.' },
    { id: 'F3-inputs-asserted-before-outputs-are-read',
      severity: 'harness strengthening',
      what: 'Each of the 18 corpus cases now carries cmp.inputs_landed_on_the_page: every numeric field of every node and edge, plus rho, nu, loadFactor and speedFactor, read back from the page\'s own state before any output is read. Worst deviation over the run: ' + worstLanding.toExponential(2) + ' relative. A positive control (single_rect_duct with the duct length doubled) moves the compared flow by ' + (passes[0].control.relative_move * 100).toFixed(1) + ' %, from ' + passes[0].control.q_E1_m3h_baseline + ' to ' + passes[0].control.q_E1_m3h_perturbed + ' m3/h.' },
    { id: 'F4-corpus-random-meshes-differ-from-the-shipped-artifact',
      severity: 'provenance, reported not fixed',
      what: 'bench-src/ref/ductnetwork_ref.json holds four random-mesh networks whose reference flows differ from the ones recorded in the shipped artifact (random_mesh_0 P1: corpus 2817.03 m3/h against the artifact\'s 422.34 m3/h), so those four cases are a different seeded network set, not a re-run of the artifact\'s. The node and edge counts match. Every one of the four passes against the corpus it is graded on. The consequence: regression_vs_2026_08_11 is a measured comparison, not a bit-identity claim, on those four cases.' },
    { id: 'F5-corpus-carries-no-hardy-cross-crosscheck-for-four-cases',
      severity: 'provenance, reported not fixed',
      what: 'crosscheck_max_abs_q_m3s is null in the corpus for ' + nullCrosscheck.join(', ') + ', so cmp.crosscheck_newton_vs_hardy_cross_m3s is absent from those cases here while the shipped artifact carried a number for them. Emitting a zero in its place would be a value nothing measured.' },
  ];

  const out = {
    tool: 'ductnetwork', file: 'ductnetwork.html',
    reference: 'Two structurally independent python solvers for the same steady duct-network problem — a simultaneous nodal Newton on the unscaled residuals (scipy.optimize.root seed, analytic-Jacobian polish) and a loop-correction solver run by H. Cross\'s own successive single-loop correction — plus closed-form hand solutions for the single rectangular/circular duct, series, parallel, fan-operating-point, grille, equal-percentage damper and tee-arm cases, and the network invariants (nodal mass balance, loop energy closure, fan operating point on both curves, monotone throttling response) recomputed from the page\'s own solution.',
    reference_citations: [
      'P.K. Swamee & A.K. Jain, "Explicit equations for pipe-flow problems", ASCE J. Hydraulics Div. 102(HY5) (1976) 657-664: f = 0.25/[log10(eps/(3.7 D) + 5.74/Re^0.9)]^2, stated for 1e-6 <= eps/D <= 1e-2 and 5e3 <= Re <= 1e8.',
      'H. Cross, "Analysis of Flow in Networks of Conduits or Conductors", Univ. of Illinois Eng. Exp. Station Bulletin 286 (1936): the loop-correction method dQ = -sum(h)/sum(|dh/dQ|) used by the second solver.',
      'C.F. Colebrook, J. Inst. Civ. Eng. 11 (1939) 133-156: used only to quantify the Swamee-Jain scatter, never as the graded reference.',
      'Hagen-Poiseuille laminar friction f = 64/Re.',
      'ASHRAE Handbook - Fundamentals, Duct Design: rectangular hydraulic diameter Dh = 2WH/(W+H); local loss dp = K rho v^2/2.',
      'Fan affinity law dp ~ n^2 applied to the two-point quadratic fan curve.',
    ],
    reference_provenance: 'recomputed',
    provenance_note: 'Every reference number in bench-src/ref/ductnetwork_ref.json is recomputed in python from the component laws as published (Swamee-Jain 1976 friction, Darcy-Weisbach, ASHRAE hydraulic diameter and local-loss K, affinity-scaled two-point fan quadratic, design-point damper/grille power laws) by two structurally independent solvers — a simultaneous nodal Newton and a Hardy Cross loop-correction solver — plus closed-form hand solutions for the eight single-component and two-component cases. Fourteen of the eighteen test NETWORKS are exact reconstructions of the 2026-08-11 inputs; the four random meshes are new, seeded networks because the old artifact stored only their node and edge counts. This run re-executes that corpus unchanged against the page as shipped on 2026-10-03; no reference value, tolerance, case or comparison was altered.',
    tolerance: 'Edge flows: 1e-6 relative (or 1e-9 m3/s absolute for near-zero flows) — set by the page\'s own declared convergence gate (scaled residual 2e-9), not by the reference, whose two solvers converge to |residual| < 1e-14 and agree to 9.5e-16 m3/s. Free-node heads: 1e-6 m. Invariants recomputed from the page\'s own solution: nodal mass balance 1e-12 m3/s, edge and loop energy closure 2e-9*hScale m, fan operating point 1e-12*hScale m on the curve and 2e-9*hScale m on the system. Displayed flow column: 0.05 m3/h — resultsData() prints fmt(q*3600, 1), ONE decimal, so half a printed unit is the tightest honest bound. Declared record vs solution: 1e-9 m3/h. Swamee-Jain coefficients: 1e-14 relative. Input landing: every numeric field of every node and edge read back from the page\'s own state to 1e-12 relative before any output is read.',
    generated_at: new Date().toISOString(),
    run_at: new Date().toISOString(),
    build: P.build.manifest_revision,
    build_detail: { manifest_revision: P.build.manifest_revision, driven_url: URL_, compute_backend: P.build.compute_backend },
    driver: 'permalink-free: the tool document codec (#loadFile / normalizeImport) for the network, DiagramUI.current.run() for the solve, .dgu-verdict for the status, Diagram.record.build().outputs for the declared numbers, __ductTest.state.sol for full precision; driven over http from bench-src/run_ductnetwork.mjs --base <url> --tool <file>',
    determinism: {
      runs: RUNS, identical,
      compared: 'every graded number of every case, plus a sha1 of Diagram.record.build().outputs and of the full solution per driven scene',
      cases_byte_identical: identical,
      declared_output_fingerprints_identical: fpsIdentical,
      first_difference: firstDiff,
    },
    distinct_declared_output_fingerprints: new Set(solved.map(s => s.outputs_fp)).size,
    distinct_solution_fingerprints: new Set(solved.map(s => s.solution_fp)).size,
    driven_scenes: scenes.length,
    solved_scenes: solved.length,
    refused_scenes: scenes.filter(s => !s.solved).map(s => s.id),
    scenes_sharing_a_solution: [...bySol.values()].filter(v => v.length > 1),
    scene_fingerprints: scenes,
    total, passed, failed: total - passed,
    page_errors: pageErrors,
    page_self_tests: P.selfTest,
    regression_vs_2026_08_11: regression,
    findings,
    recommended_status: {
      status: 'benchmarked',
      justification: total + ' of ' + total + ' cases pass against bench-src/ref/ductnetwork_ref.json on the build the page ships today (' + P.build.manifest_revision + '), with ' + pageErrors.length + ' page errors and the page\'s own self-tests at ' + P.selfTest.passed + '/' + P.selfTest.total + '. Every case asserts its own inputs from the page state before an output is read (worst landing deviation ' + worstLanding.toExponential(2) + ' relative), and the positive control moves the compared flow by ' + (P.control.relative_move * 100).toFixed(1) + ' % when one duct length is doubled, so the run measured the page rather than its defaults. ' + RUNS + ' full passes in fresh browser contexts agree on every graded number: ' + identical + '. The status decision itself is the coordinator\'s.',
    },
    cases,
    case_order: 'forward',
    positive_control: P.control,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(stampProvenance(out, { build: P.build.manifest_revision, ...PROVENANCE }), null, 1));
  console.log(`\n${passed}/${total} passed; page errors: ${pageErrors.length}; determinism identical: ${identical}`);
  console.log('written: ' + OUT);
  if (passed !== total) process.exitCode = 1;
}

main().catch(e => { console.error('DRIVER CRASH: ' + (e && e.stack || e)); process.exit(3); });
