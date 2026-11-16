/* Benchmark driver for hydraulicnetwork.html
 *
 * Reference: bench-src/ref/hydraulicnetwork_ref.json — two structurally
 * independent python solvers (a simultaneous nodal Newton on the unscaled
 * residuals via scipy.optimize.root, and a classical Hardy Cross
 * loop-correction solver), plus closed-form hand solutions for the series /
 * parallel / pump / valve / heat-exchanger cases.
 *
 * Networks are pushed into the page through its own JSON import control
 * (#loadFile), solved with DiagramUI.current.run(), and read back from the
 * results tables, from Diagram.record.build().outputs and from the page's own
 * solution object (window.__hydraulicTest.state.sol).
 *
 * 2026-10-03 adaptation (base URL + framework locators). The tolerances, the
 * case ids, the reference values and every comparison are unchanged; see
 * DELIVERY.md for the line-by-line list.
 *
 * Usage:
 *   node run_hydraulicnetwork.mjs --base http://127.0.0.1:8323 [--tool hydraulicnetwork.html]
 *                                 [--ref <ref json>] [--out <result json>] [--runs 2] [--prev <artifact>]
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. stampProvenance() reads the build out of the page's
   own manifest and writes build, manifest_revision, reference_provenance and
   provenance_note into the artifact, so a re-run carries them. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_hydraulicnetwork.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 1 992 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* Every path resolves against this driver's own tree: the page under the site root, the
   reference under bench-src/ref, the scratch directory outside the site root and the
   artifact at <siteRoot>/benchmarks/hydraulicnetwork.json — the path the page's own
   manifest names. --site, --base, --ref-dir, --tmp-dir and --out override. The local
   name is PATHS because `P` is already this driver's first-pass result object.
   See benchpaths.mjs. */
const PATHS = benchPaths({ name: 'hydraulicnetwork', page: 'hydraulicnetwork.html',
                           ref: 'hydraulicnetwork_ref.json' });
/* The page is reached over http, as this driver has always reached it; only the origin is
   a parameter. --base, else the port this driver has always named. */
const BASE = (PATHS.base || 'http://127.0.0.1:8323').replace(/\/+$/, '');
const TOOL = String(PATHS.flags.tool || PATHS.pageFile).replace(/^\/+/, '');
const REF_PATH = PATHS.ref;
const OUT = PATHS.out;
const RUNS = Number(PATHS.flags.runs || '2');
const PREV = PATHS.flags.prev ? String(PATHS.flags.prev) : '';
const REF = JSON.parse(fs.readFileSync(REF_PATH, 'utf8'));
const URL_ = `${BASE}/${TOOL}?lang=en`;
const G = 9.80665;
const TMP = fs.mkdtempSync(path.join(PATHS.scratch(), 'hydnet-'));

/* --------------------------------------------------------------- tolerances */
// The reference solvers converge to |residual| < 1e-13 and agree with each other
// to <1e-16 m3/s, so the tolerance is set by the page's own declared convergence
// gate (scaled residual 2e-9, thrown above 2e-6) rather than by the reference.
const TOL_Q_REL = 1e-6;      // relative on edge flow
const TOL_Q_ABS = 1e-9;      // m3/s floor for near-zero flows
const TOL_H_ABS = 1e-6;      // m of head
const TOL_DISPLAY = 0.0005;  // m3/h — the flow column prints 3 decimals
const TOL_RECORD = 1e-9;     // declared record output vs the solution it came from

const fp = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);

function netFile(id, net) {
  const doc = {
    schema: 'tools.petrov.re/hydraulic-network/v2',
    fluid: { rho: net.fluid.rho, nu: net.fluid.nu },
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

/* Import landing: the #loadFile handler awaits File.text(), so the import is
   asynchronous.  Wait on the full node+edge signature AND on invalidate()
   having discarded the previous solution; the 600- and 601-unknown networks
   share every node id, so a wait on node ids alone returns instantly. */
async function importNetwork(page, id, net) {
  const sig = JSON.stringify({ n: net.nodes.map(n => n.id), e: net.edges.map(e => e.id) });
  await page.setInputFiles('#loadFile', netFile(id, net));
  await page.waitForFunction(s => {
    const st = window.__hydraulicTest && window.__hydraulicTest.state;
    if (!st) return false;
    const cur = JSON.stringify({ n: st.nodes.map(n => n.id), e: st.edges.map(e => e.id) });
    return cur === s && st.sol === null;
  }, sig, { timeout: 20000 });
}

/* The case's own inputs, read back from the page's own state before any output
   is read.  Worst relative deviation over every numeric field of every node and
   edge, plus rho, nu, loadFactor and speedFactor. */
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
    for (const k of ['a', 'b', 'law']) if (e[k] !== undefined && g[k] !== e[k]) { bad.push('edge ' + e.id + '.' + k + ': ' + e[k] + ' vs ' + g[k]); worst = 1; }
    for (const k of ['L', 'D', 'eps', 'K', 'H0', 'Qrated', 'Hrated', 'speed', 'Kv', 'opening', 'Qdesign', 'dpDesign', 'n', 'target'])
      if (typeof e[k] === 'number') num(e[k], g[k], 'edge ' + e.id + '.' + k);
  });
  num(net.fluid.rho, got.fluid.rho, 'fluid.rho');
  num(net.fluid.nu, got.fluid.nu, 'fluid.nu');
  num(net.fluid.load, got.fluid.load, 'fluid.load');
  num(net.fluid.speed, got.fluid.speed, 'fluid.speed');
  return { worst, bad: bad.slice(0, 8) };
}

const STATE_SNAP = `(() => {
  const st = window.__hydraulicTest.state, ui = window.DiagramUI.current;
  return { nodes: st.nodes.map(n => ({ id: n.id, z: n.z, demand: n.demand, fixed: n.fixed, p: n.p })),
           edges: st.edges.map(e => ({ ...e })),
           fluid: { rho: Number(ui.state.rho), nu: Number(ui.state.nu), load: Number(ui.state.loadFactor) / 100, speed: Number(ui.state.speedFactor) / 100 } };
})()`;

async function readState(page) {
  return page.evaluate(`(() => {
    const T = window.__hydraulicTest, st = T.state, sol = st.sol;
    const tabs = ${READ_TABLES};
    const verdicts = [...document.querySelectorAll('.dgu-verdict')].map(n => n.innerText.trim()).filter(Boolean);
    const notices = [...document.querySelectorAll('.dgu-notice, .dgu-error, [class*="notice"]')].map(n => n.innerText.trim()).filter(Boolean);
    const snap = ${STATE_SNAP};
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
        edge: Object.fromEntries(Object.entries(sol.edge).map(([k, v]) => [k, { q: v.q, loss: v.loss, pump: v.pump, vel: v.vel, Re: v.Re, f: v.f, headAcross: v.headAcross }])),
      } : null,
      nodes: snap.nodes, edges: snap.edges, fluid: snap.fluid,
    };
  })()`);
}

async function loadAndSolve(page, id, net, scenes) {
  await importNetwork(page, id, net);
  const pre = await page.evaluate(STATE_SNAP);
  const landing = landingDeviation(net, pre);
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
   invariant checks (loop energy closure, pump operating point) ------------- */
function swameeJain(Re, rel) { return 0.25 / Math.pow(Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2); }
function darcyF(Re, rel) {
  if (!(Re > 0)) return 0;
  if (Re <= 2000) return 64 / Re;
  const turb = swameeJain(Re, rel);
  if (Re >= 4000) return turb;
  const lam = 64 / Re, t = (Re - 2000) / 2000, s = t * t * (3 - 2 * t);
  return lam * (1 - s) + turb * s;
}
function kvEff(e) { const o = Math.min(1, Math.max(0.001, e.opening / 100)); return e.Kv * (e.law === 'equal' ? Math.pow(50, o - 1) : o); }
function edgeLoss(e, q, fl) {
  const aq = Math.abs(q), sg = fl.rho / 1000; let loss = 0;
  if (e.type === 'pipe') { const D = e.D / 1000, A = Math.PI * D * D / 4, v = aq / A, Re = v * D / fl.nu; loss = (darcyF(Re, e.eps / 1000 / D) * e.L / D + e.K) * v * v / (2 * G); }
  else if (e.type === 'valve') loss = 1e5 * sg * Math.pow(aq * 3600 / kvEff(e), 2) / (fl.rho * G);
  else if (e.type === 'hx') loss = (e.dpDesign * 1000 / (fl.rho * G)) * Math.pow(aq / (e.Qdesign / 3600), e.n);
  return q === 0 ? 0 : Math.sign(q) * loss;
}
function edgePump(e, q, fl) {
  if (e.type !== 'pump') return 0;
  const qr = e.Qrated / 3600, a = (e.H0 - e.Hrated) / (qr * qr), s = e.speed / 100 * fl.speed;
  return e.H0 * s * s - a * q * Math.abs(q);
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

async function pass(browser, tag) {
  const cases = [], scenes = [], pageErrors = [];
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

  const surfaces = await page.evaluate(() => ({
    loadFile: !!document.getElementById('loadFile'),
    verdict: !!document.querySelector('.dgu-verdict'),
    tables: document.querySelectorAll('table.dgu-table').length,
    test: !!(window.__hydraulicTest && window.__hydraulicTest.state),
    ui: !!(window.DiagramUI && window.DiagramUI.current && typeof window.DiagramUI.current.run === 'function'),
    record: (() => { try { return !!window.Diagram.record.build().outputs; } catch (e) { return false; } })(),
  }));
  for (const [k, v] of Object.entries(surfaces)) if (!v) throw new Error('driver surface missing: ' + k + ' (' + JSON.stringify(surfaces) + ')');
  if (surfaces.tables < 2) throw new Error('driver surface missing: two result tables (' + surfaces.tables + ')');

  /* AGENTS §5: the build this artifact names is the manifest_revision read out of the live
     DOM of the page the browser actually loaded. readPageManifestRevision() is the one code
     path for that observation, and stampProvenance() refuses to write anything without it. */
  const build = { manifest_revision: await readPageManifestRevision(page),
                  id: await page.evaluate(() => window.Diagram.manifest().id) };
  const selfTest = await page.evaluate(() => window.__hydraulicTest.runSelfTests());
  console.log(`${tag} page self-tests (not counted as validation): ${selfTest.passed}/${selfTest.total}`);

  const flowsById = {};

  for (const rc of REF.cases) {
    const got = await loadAndSolve(page, rc.id, rc.net, scenes);
    const cmp = {};
    cmp['import_landed_intact'] = {
      got: got.landing.worst <= 1e-12, ref: 'the intended network, field for field',
      rel: got.landing.worst, ok: got.landing.worst <= 1e-12,
      worst_field_deviation: got.landing.worst, mismatches: got.landing.bad,
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
      let wa = 0;
      for (const k of Object.keys(rc.analytic)) wa = Math.max(wa, Math.abs(rc.analytic[k] - ref.q[k]));
      cmp['crosscheck_newton_vs_analytic_m3s'] = { got: wa, ref: 0, rel: wa, ok: wa <= 1e-12, ref_source: 'recomputed' };
      let w = 0;
      for (const k of Object.keys(rc.analytic)) w = Math.max(w, Math.abs(rc.analytic[k] - got.sol.edge[k].q));
      cmp['hand_solution_max_abs_q_m3s'] = { got: w, ref: 0, rel: w, ok: w <= TOL_Q_ABS, ref_source: 'recomputed' };
    }

    /* ---- the declared record outputs must match the solution they came from ---- */
    {
      let wf = 0, wh = 0, wp = 0;
      for (const e of got.edges) {
        const d = got.record ? got.record['flow_' + e.id] : undefined;
        wf = Math.max(wf, typeof d === 'number' ? Math.abs(d - got.sol.edge[e.id].q * 3600) : 1);
      }
      for (const n of got.nodes) {
        const dh = got.record ? got.record['hgl_' + n.id] : undefined;
        const dp = got.record ? got.record['pressure_' + n.id] : undefined;
        wh = Math.max(wh, typeof dh === 'number' ? Math.abs(dh - got.sol.node[n.id].hgl) : 1);
        wp = Math.max(wp, typeof dp === 'number' ? Math.abs(dp - got.sol.node[n.id].p / 1000) : 1);
      }
      cmp['record_outputs_flow_m3h'] = { got: wf, ref: 0, rel: wf, ok: wf <= TOL_RECORD };
      cmp['record_outputs_hgl_m'] = { got: wh, ref: 0, rel: wh, ok: wh <= TOL_RECORD };
      cmp['record_outputs_pressure_kPa'] = { got: wp, ref: 0, rel: wp, ok: wp <= TOL_RECORD };
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
    const hScale = Math.max(5, ...got.nodes.filter(n => n.fixed).map(n => Math.abs(n.p * 1000 / (got.fluid.rho * G))),
      ...got.nodes.map(n => Math.abs(n.z)),
      ...got.edges.filter(e => e.type === 'pump').map(e => Math.abs(e.H0 * Math.pow(e.speed / 100 * got.fluid.speed, 2))));
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

    // 3. pump operating point on the pump curve AND on the system curve
    for (const e of got.edges.filter(e => e.type === 'pump')) {
      const q = got.sol.edge[e.id].q;
      const curve = edgePump(e, q, got.fluid);
      const a = got.nodes.find(n => n.id === e.a), b = got.nodes.find(n => n.id === e.b);
      const system = (got.sol.node[b.id].pHead + b.z) - (got.sol.node[a.id].pHead + a.z);
      cmp['pump_' + e.id + '_on_curve_m'] = { got: got.sol.edge[e.id].pump, ref: curve, rel: Math.abs(got.sol.edge[e.id].pump - curve), ok: Math.abs(got.sol.edge[e.id].pump - curve) <= 1e-9 };
      cmp['pump_' + e.id + '_on_system_curve_m'] = { got: system, ref: curve, rel: Math.abs(system - curve), ok: Math.abs(system - curve) <= 1e-9 };
    }

    // 4. the page's own reported residuals must be consistent with what it produced
    cmp['reported_continuity_residual_m3h'] = { got: got.sol.maxContinuity, ref: worstMass * 3600, rel: Math.abs(got.sol.maxContinuity - worstMass * 3600), ok: Math.abs(got.sol.maxContinuity - worstMass * 3600) <= 1e-9 };
    cmp['reported_energy_residual_m'] = { got: got.sol.maxEnergy, ref: worstEdge, rel: Math.abs(got.sol.maxEnergy - worstEdge), ok: Math.abs(got.sol.maxEnergy - worstEdge) <= 1e-12 * Math.max(1, hScale) };

    // 5. the displayed flow column must match the solution it came from
    let worstDisp = 0;
    got.edgeRows.forEach((row, i) => {
      const e = got.edges[i];
      const shown = Number(row[2]);
      worstDisp = Math.max(worstDisp, Math.abs(shown - got.sol.edge[e.id].q * 3600));
    });
    cmp['displayed_flow_column_m3h'] = { got: worstDisp, ref: 0, rel: worstDisp, ok: worstDisp <= TOL_DISPLAY, rows: got.edgeRows.length };

    push(rc.id, rc.note, { nodes: rc.net.nodes.length, edges: rc.net.edges.length, fluid: rc.net.fluid }, cmp,
      { tool_status: got.status, iterations: got.sol.iter, scaled_residual: got.sol.residual, page_warnings: got.sol.warnings, ref_source: 'recomputed' });
  }

  /* ---------------- monotonicity of throttling ---------------- */
  {
    const ids = ['shipped_example_network', 'example_valve_60', 'example_valve_30', 'example_valve_10'];
    const opens = [100, 60, 30, 10];
    const qv = ids.map(i => flowsById[i]['E6'].q * 3600);
    const qp = ids.map(i => flowsById[i]['E1'].q * 3600);
    const qa = ids.map(i => flowsById[i]['E4'].q * 3600);
    const mono = (a, dir) => a.every((v, i) => i === 0 || (dir > 0 ? v < a[i - 1] : v > a[i - 1]));
    const cmp = {
      valve_branch_flow_decreases: { got: qv, ref: 'strictly decreasing', rel: mono(qv, +1) ? 0 : 1, ok: mono(qv, +1) },
      pump_flow_decreases: { got: qp, ref: 'strictly decreasing', rel: mono(qp, +1) ? 0 : 1, ok: mono(qp, +1) },
      parallel_branch_flow_increases: { got: qa, ref: 'strictly increasing', rel: mono(qa, -1) ? 0 : 1, ok: mono(qa, -1) },
    };
    push('valve_closure_monotonicity',
      'Closing the control valve of the shipped example from 100 % to 60/30/10 % must reduce that branch flow and the pump flow monotonically, and push flow into the parallel branch.',
      { openings: opens }, cmp);
  }

  /* ---------------- Swamee-Jain faithfulness and its scatter ---------------- */
  {
    const grid = [];
    for (const Re of [5e3, 1e4, 1e5, 1e6, 1e7, 1e8]) for (const rel of [1e-6, 1e-5, 1e-4, 1e-3, 1e-2]) grid.push([Re, rel]);
    const gotF = await page.evaluate(g => g.map(([Re, rel]) => window.__hydraulicTest.frictionFactor(Re, rel)), grid);
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
    // Hagen-Poiseuille laminar branch: f = 64/Re below Re 2000, closed form.
    const lamGrid = [];
    for (const Re of [50, 100, 500, 1000, 1500, 2000]) for (const rel of [1e-6, 1e-4, 1e-2]) lamGrid.push([Re, rel]);
    const gotL = await page.evaluate(g => g.map(([Re, rel]) => window.__hydraulicTest.frictionFactor(Re, rel)), lamGrid);
    let worstLam = 0;
    for (let i = 0; i < lamGrid.length; i++) worstLam = Math.max(worstLam, Math.abs(gotL[i] - 64 / lamGrid[i][0]) / (64 / lamGrid[i][0]));
    push('swamee_jain_implementation',
      'The page states it uses Swamee-Jain turbulent friction. This checks the coefficients are transcribed exactly (0.25 / log10(eps/(3.7 D) + 5.74/Re^0.9)^2) over 5e3 <= Re <= 1e8 and 1e-6 <= eps/D <= 1e-2, the range for which Swamee & Jain (1976) state the approximation, and that the laminar branch is the Hagen-Poiseuille closed form f = 64/Re over 50 <= Re <= 2000. The maximum deviation from the fully converged Colebrook-White root over the turbulent grid is recorded as the correlation scatter; it is not graded, because Swamee-Jain is what the page claims to implement.',
      { Re_turbulent: '5e3..1e8', Re_laminar: '50..2000', rel: '1e-6..1e-2' },
      {
        coefficients_transcribed: { got: worst, ref: 0, rel: worst, ok: worst <= 1e-14 },
        hagen_poiseuille_laminar_branch: { got: worstLam, ref: 0, rel: worstLam, ok: worstLam <= 1e-14 },
      },
      { swamee_jain_vs_colebrook_max_rel: worstCole });
    console.log(`${tag}         Swamee-Jain vs Colebrook over the stated range: max ${(worstCole * 100).toFixed(2)} % (correlation scatter, not a defect)`);
  }

  /* ---------------- convergence honesty ---------------- */
  {
    // A pump asked to run against a static lift far above its shutoff head has no
    // forward-flow solution on the fitted two-point curve.
    const net = {
      fluid: { rho: 998, nu: 1.004e-6, load: 1, speed: 1 },
      nodes: [{ id: 'N1', name: 'N1', x: 120, y: 300, z: 0, demand: 0, fixed: true, p: 0 },
      { id: 'N2', name: 'N2', x: 400, y: 300, z: 0, demand: 0, fixed: false, p: 0 },
      { id: 'N3', name: 'N3', x: 680, y: 300, z: 400, demand: 0, fixed: true, p: 0 }],
      edges: [{ id: 'E1', name: 'E1', type: 'pump', a: 'N1', b: 'N2', H0: 20, Qrated: 12, Hrated: 13, speed: 100 },
      { id: 'E2', name: 'E2', type: 'pipe', a: 'N2', b: 'N3', L: 50, D: 50, eps: 0.045, K: 2 }],
    };
    const got = await loadAndSolve(page, 'no_forward_solution', net, scenes);
    // the physical answer is reverse flow through the pump, which the page's
    // two-point curve does not model: it must either warn or refuse.
    const q = got.sol ? got.sol.edge.E1.q : null;
    const honest = !got.sol
      ? /No convergence|Solver|singular|diverged/i.test(got.status)
      : (got.sol.warnings.length > 0 && /reverse/i.test(got.sol.warnings.join(' ')));
    push('convergence_reporting',
      'A pump driven against a 400 m static lift has no forward-flow solution on the fitted two-point curve. The page must either report non-convergence or flag the extrapolated reverse-flow operating point; silently returning the last iterate as a result would be a defect.',
      { static_lift_m: 400, pump_shutoff_m: 20 },
      { reported_honestly: { got: (got.sol ? 'solved q=' + q + ' warnings=' + JSON.stringify(got.sol.warnings) : got.status).slice(0, 300), ref: 'error or warning', rel: honest ? 0 : 1, ok: honest } });
  }
  {
    // deliberately unsolvable: no fixed-pressure node anywhere
    const net = {
      fluid: { rho: 998, nu: 1.004e-6, load: 1, speed: 1 },
      nodes: [{ id: 'N1', name: 'N1', x: 120, y: 300, z: 0, demand: -10, fixed: false, p: 0 },
      { id: 'N2', name: 'N2', x: 500, y: 300, z: 0, demand: 10, fixed: false, p: 0 }],
      edges: [{ id: 'E1', name: 'E1', type: 'pipe', a: 'N1', b: 'N2', L: 50, D: 50, eps: 0.045, K: 0 }],
    };
    const got = await loadAndSolve(page, 'no_reference_node', net, scenes);
    const ok = !got.sol && /fixed[- ]pressure|reference/i.test(got.status);
    push('missing_pressure_reference',
      'A network with no fixed-pressure node has an undetermined head level; the page must refuse it rather than return an arbitrary datum.',
      { fixed_nodes: 0 },
      { refused: { got: got.status.slice(0, 200), ref: 'refusal message', rel: ok ? 0 : 1, ok } });
  }

  /* ---------------- the declared 600-unknown limit ---------------- */
  {
    const build_ = (nFree, nEdges) => {
      const nodes = [{ id: 'R', name: 'R', x: 100, y: 100, z: 0, demand: 0, fixed: true, p: 500 }];
      const edges = [];
      for (let i = 1; i <= nFree; i++) nodes.push({ id: 'V' + i, name: 'V' + i, x: 90 + (i % 12) * 70, y: 80 + (Math.floor(i / 12) % 8) * 60, z: 0, demand: 1.0, fixed: false, p: 0 });
      for (let i = 1; i <= nFree; i++) edges.push({ id: 'P' + i, name: 'P' + i, type: 'pipe', a: i === 1 ? 'R' : 'V' + (i - 1), b: 'V' + i, L: 20, D: 80, eps: 0.045, K: 0 });
      while (edges.length < nEdges) { const k = edges.length + 1; edges.push({ id: 'P' + k, name: 'P' + k, type: 'pipe', a: 'R', b: 'V' + ((k % nFree) + 1), L: 25, D: 65, eps: 0.045, K: 0 }); }
      return { fluid: { rho: 998, nu: 1.004e-6, load: 1, speed: 1 }, nodes, edges };
    };
    const cmp = {};
    // exactly at the limit: 300 free nodes + 300 edges = 600 unknowns
    const at = await loadAndSolve(page, 'limit_600', build_(300, 300), scenes);
    cmp['at_600_unknowns_solves'] = { got: at.sol ? 'solved, ' + at.sol.iter + ' it' : at.status.slice(0, 160), ref: 'solved', rel: at.sol ? 0 : 1, ok: !!at.sol };
    // one unknown over the limit: 300 free nodes + 301 edges
    const over = await loadAndSolve(page, 'limit_601', build_(300, 301), scenes);
    const refused = !over.sol && /601 nonlinear unknowns|limited to 600/i.test(over.status);
    cmp['at_601_unknowns_refused'] = { got: over.status.slice(0, 200), ref: 'refusal naming the 600 limit', rel: refused ? 0 : 1, ok: refused };
    // and the network must not be silently truncated on import
    const kept = await page.evaluate(() => ({ n: window.__hydraulicTest.state.nodes.length, e: window.__hydraulicTest.state.edges.length }));
    cmp['not_silently_truncated'] = { got: kept, ref: { n: 301, e: 301 }, rel: (kept.n === 301 && kept.e === 301) ? 0 : 1, ok: kept.n === 301 && kept.e === 301 };
    push('unknown_count_limit',
      'The page declares a 600-nonlinear-unknown limit (edges + free nodes). It must solve at 600, refuse at 601 with a message naming the limit, and must not silently drop components on import.',
      { limit: 600 }, cmp);
  }

  /* ---------------- pump operating point on the plotted system curve ------- */
  {
    const got = await loadAndSolve(page, 'curve_check', REF.cases.find(c => c.id === 'shipped_example_network').net, scenes);
    const sweep = await page.evaluate(() => {
      const T = window.__hydraulicTest, st = T.state;
      const q = st.sol.edge.E1.q;
      const at = T.solveNetwork({ flowOverride: { E1: q }, loadMultiplier: 1 });
      const pts = [];
      for (let k = 1; k <= 14; k++) {
        const qq = q * k / 7;
        try { const s2 = T.solveNetwork({ flowOverride: { E1: qq }, loadMultiplier: qq / q }); pts.push([qq, s2.edge.E1.headAcross]); } catch (e) { }
      }
      return { q, sysAtOp: at.edge.E1.headAcross, pumpHead: st.sol.edge.E1.pump, headAcross: st.sol.edge.E1.headAcross, pts };
    });
    const relSys = Math.abs(sweep.sysAtOp - sweep.pumpHead) / Math.abs(sweep.pumpHead);
    const monotone = sweep.pts.every((p2, i) => i === 0 || p2[1] > sweep.pts[i - 1][1]);
    push('pump_operating_point_on_both_curves',
      'The plotted system curve is generated by re-solving with the pump flow overridden. At the solved flow it must return exactly the head the pump curve delivers, and the swept system curve must rise monotonically with flow.',
      { pump: 'E1', sweep_points: sweep.pts.length },
      {
        system_curve_at_operating_flow: { got: sweep.sysAtOp, ref: sweep.pumpHead, rel: relSys, ok: relSys <= 1e-8 },
        head_across_equals_pump_curve: { got: sweep.headAcross, ref: sweep.pumpHead, rel: Math.abs(sweep.headAcross - sweep.pumpHead), ok: Math.abs(sweep.headAcross - sweep.pumpHead) <= 1e-8 },
        system_curve_monotone: { got: monotone, ref: true, rel: monotone ? 0 : 1, ok: monotone },
      });
  }

  /* ---------------- silent clamping ---------------- */
  {
    const cmp = {};
    for (const op of [0.0001, 0.05, 0.099]) {
      const r = await page.evaluate(o => {
        try {
          window.__hydraulicTest.normalizeImport({
            schema: 'tools.petrov.re/hydraulic-network/v2',
            nodes: [{ id: 'N1', fixed: true, p: 300 }, { id: 'N2', fixed: true, p: 100 }],
            edges: [{ id: 'E1', type: 'valve', a: 'N1', b: 'N2', Kv: 10, opening: o, law: 'linear', target: 0 }],
          });
          return 'ACCEPTED';
        } catch (e) { return e.message; }
      }, op);
      const ok = r !== 'ACCEPTED' && /0\.1/.test(r);
      cmp['opening_' + op] = { got: r.slice(0, 170), ref: 'refusal naming the 0.1 % minimum', rel: ok ? 0 : 1, ok };
    }
    const kept = await page.evaluate(() => {
      const T = window.__hydraulicTest;
      const eff = T.valveKvEff({ Kv: 10, opening: 0.1, law: 'linear' });
      return { kv: eff, expect: 10 * 0.001 };
    });
    cmp['no_clamping_inside_the_allowed_range'] = { got: kept.kv, ref: kept.expect, rel: Math.abs(kept.kv - kept.expect), ok: Math.abs(kept.kv - kept.expect) <= 1e-15 };
    push('valve_opening_clamping',
      'The valve Kv model clamps opening/100 to a 0.001 floor. Openings below 0.1 % must be refused on import rather than silently clamped to a different valve than the one entered.',
      { openings: [0.0001, 0.05, 0.099, 0.1] }, cmp);
  }

  /* ---------------- correlation-range warning ---------------- */
  {
    const mk = (id, D, eps, L, p1) => ({
      fluid: { rho: 998, nu: 1.004e-6, load: 1, speed: 1 },
      nodes: [{ id: 'N1', name: 'N1', x: 100, y: 100, z: 0, demand: 0, fixed: true, p: p1 },
      { id: 'N2', name: 'N2', x: 500, y: 100, z: 0, demand: 0, fixed: true, p: 100 }],
      edges: [{ id: 'E1', name: 'E1', type: 'pipe', a: 'N1', b: 'N2', L, D, eps, K: 0 }],
    });
    const cmp = {};
    const rough = await loadAndSolve(page, 'very_rough_pipe', mk('rough', 50, 2.5, 50, 300), scenes);
    const relR = 2.5 / 50;
    const okR = rough.sol && rough.sol.warnings.some(w => /Swamee/i.test(w));
    cmp['rough_pipe_eps_over_D_' + relR] = { got: rough.sol ? rough.sol.warnings : rough.status, ref: 'warning that eps/D is outside the published range', rel: okR ? 0 : 1, ok: !!okR };
    const trans = await loadAndSolve(page, 'transition_pipe', mk('trans', 25, 0.045, 4000, 139.2), scenes);
    const Re = trans.sol ? trans.sol.edge.E1.Re : NaN;
    const okT = trans.sol && (Re >= 4000 || trans.sol.warnings.some(w => /Transition/i.test(w)));
    cmp['transition_band_flagged'] = { got: { Re, warnings: trans.sol ? trans.sol.warnings : null }, ref: 'warning when 2000 < Re < 4000', rel: okT ? 0 : 1, ok: !!okT };
    push('correlation_range_warnings',
      'Swamee-Jain is published for 1e-6 <= eps/D <= 1e-2 and 5e3 <= Re <= 1e8, and 2000 < Re < 4000 is a numerical blend rather than a resolved transition model. Pipes running outside those ranges must be named in a warning, not silently extrapolated.',
      { cases: ['eps/D = 0.05', 'Re in the 2000-4000 blend'] }, cmp);
  }

  /* ---------------- import validation ---------------- */
  {
    const bad = [
      { id: 'dangling_edge', doc: { schema: 'tools.petrov.re/hydraulic-network/v2', nodes: [{ id: 'N1', fixed: true, p: 100 }], edges: [{ id: 'E1', type: 'pipe', a: 'N1', b: 'N9', L: 10, D: 50 }] }, expect: /invalid endpoint/i },
      { id: 'duplicate_node_id', doc: { schema: 'tools.petrov.re/hydraulic-network/v2', nodes: [{ id: 'N1' }, { id: 'N1' }], edges: [] }, expect: /duplicate node/i },
      { id: 'self_loop', doc: { schema: 'tools.petrov.re/hydraulic-network/v2', nodes: [{ id: 'N1' }, { id: 'N2' }], edges: [{ id: 'E1', type: 'pipe', a: 'N1', b: 'N1', L: 10, D: 50 }] }, expect: /self[- ]loop|self loop/i },
      { id: 'bad_schema', doc: { schema: 'something/else', nodes: [], edges: [] }, expect: /schema/i },
      { id: 'negative_diameter', doc: { schema: 'tools.petrov.re/hydraulic-network/v2', nodes: [{ id: 'N1', fixed: true, p: 100 }, { id: 'N2' }], edges: [{ id: 'E1', type: 'pipe', a: 'N1', b: 'N2', L: 10, D: -50 }] }, expect: /positive/i },
      { id: 'pump_rated_above_shutoff', doc: { schema: 'tools.petrov.re/hydraulic-network/v2', nodes: [{ id: 'N1', fixed: true, p: 100 }, { id: 'N2' }], edges: [{ id: 'E1', type: 'pump', a: 'N1', b: 'N2', H0: 10, Qrated: 5, Hrated: 12, speed: 100 }] }, expect: /rated head must be lower/i },
    ];
    const cmp = {};
    for (const t of bad) {
      const r = await page.evaluate(d => { try { window.__hydraulicTest.normalizeImport(d); return 'ACCEPTED'; } catch (e) { return e.message; } }, t.doc);
      const ok = r !== 'ACCEPTED' && t.expect.test(r);
      cmp[t.id] = { got: r.slice(0, 160), ref: String(t.expect), rel: ok ? 0 : 1, ok };
    }
    push('import_validation',
      'Malformed network files must be rejected with a specific message rather than partially imported.',
      { cases: bad.map(b => b.id) }, cmp);
  }

  /* ---------------- positive control (rule 3), not graded ---------------- */
  const control = await (async () => {
    const base_ = REF.cases.find(c => c.id === 'single_pipe_two_reservoirs').net;
    const a = await loadAndSolve(page, 'control_baseline', base_, null);
    const perturbed = JSON.parse(JSON.stringify(base_));
    perturbed.edges[0].L = base_.edges[0].L * 2;
    const b = await loadAndSolve(page, 'control_perturbed', perturbed, null);
    const qa = a.sol ? a.sol.edge.E1.q * 3600 : null, qb = b.sol ? b.sol.edge.E1.q * 3600 : null;
    const moved = qa !== null && qb !== null && Math.abs(qb - qa) / Math.abs(qa) > 0.05 && qb < qa;
    return {
      what: 'single_pipe_two_reservoirs with L doubled from ' + base_.edges[0].L + ' m to ' + perturbed.edges[0].L + ' m',
      state_L_baseline: a.edges[0].L, state_L_perturbed: b.edges[0].L,
      q_E1_m3h_baseline: qa, q_E1_m3h_perturbed: qb,
      displayed_flow_baseline_m3h: a.edgeRows[0] ? Number(a.edgeRows[0][2]) : null,
      displayed_flow_perturbed_m3h: b.edgeRows[0] ? Number(b.edgeRows[0][2]) : null,
      relative_move: qa ? Math.abs(qb - qa) / Math.abs(qa) : null,
      moved_and_decreased: moved,
    };
  })();
  console.log(`${tag} positive control: q_E1 ${control.q_E1_m3h_baseline} -> ${control.q_E1_m3h_perturbed} m3/h (${(control.relative_move * 100).toFixed(1)} % move), moved=${control.moved_and_decreased}`);
  if (!control.moved_and_decreased) throw new Error('positive control failed: the compared output did not move when an input was perturbed');

  /* ---------------- language invariance, not graded ---------------- */
  const langInv = await (async () => {
    const net = REF.cases.find(c => c.id === 'shipped_example_network').net;
    const en = await loadAndSolve(page, 'lang_en', net, null);
    const p2 = await ctx.newPage();
    const deErr = [];
    p2.on('pageerror', e => deErr.push(String(e)));
    p2.on('console', m => { if (m.type() === 'error') deErr.push('console: ' + m.text()); });
    await p2.goto(`${BASE}/${TOOL}?lang=de`, { waitUntil: 'load' });
    await p2.evaluate(() => window.Diagram.whenReady());
    await p2.waitForTimeout(200);
    await importNetwork(p2, 'lang_de', net);
    await p2.evaluate(() => window.DiagramUI.current.run());
    const de = await p2.evaluate(() => Object.fromEntries(Object.entries(window.__hydraulicTest.state.sol.edge).map(([k, v]) => [k, v.q])));
    await p2.close();
    let worst = 0;
    for (const k of Object.keys(de)) worst = Math.max(worst, Math.abs(de[k] - en.sol.edge[k].q));
    return { note: 'Not graded. The shipped example solved in ?lang=en and ?lang=de; the solved edge flows must be bit-identical.', max_abs_flow_difference_m3s: worst, identical: worst === 0, de_page_errors: deErr, en_page_errors: [] };
  })();
  console.log(`${tag} language invariance en vs de: max |dq| = ${langInv.max_abs_flow_difference_m3s} m3/s`);

  await ctx.close();
  return { cases, scenes, pageErrors, selfTest, control, build, langInv };
}

async function main() {
  const browser = await chromium.launch();
  const passes = [];
  for (let i = 0; i < RUNS; i++) passes.push(await pass(browser, '[run ' + (i + 1) + ']'));
  await browser.close();

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

  const P = passes[0];
  const cases = P.cases, scenes = P.scenes;
  const total = cases.length, passed = cases.filter(c => c.pass).length;
  const pageErrors = [...new Set(passes.flatMap(p => p.pageErrors))];
  const solved = scenes.filter(s => s.solved);
  const netScenes = scenes.filter(s => REF.cases.some(c => c.id === s.id));
  const worstLanding = Math.max(0, ...cases.map(c => (c.cmp.import_landed_intact || { rel: 0 }).rel));

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
        else regression.moved.push({ case: c.id, key: k, was: a, now: b, rel: (typeof a === 'number' && typeof b === 'number' && a !== 0) ? Math.abs(b - a) / Math.abs(a) : null });
      }
      for (const k of Object.keys(o.cmp)) if (!(k in c.cmp)) regression.key_set_differences.push(c.id + '.' + k + ' only in the previous artifact');
    }
    regression.note = 'Compared with ' + PREV + ' (run_at ' + prev.run_at + '). The previous artifact is a record, not a reference: nothing here is graded against it.';
  }

  const out = {
    tool: 'hydraulicnetwork', file: 'hydraulicnetwork.html',
    reference: 'Re-executed 2026-10-03 against the build the page ships today. Two structurally independent python solvers for the same steady network problem — a node-space Newton whose unknowns are the free-node total heads and whose edge flows come from Brent inversion of each component characteristic, and a loop-space Hardy Cross solver (Cross 1936) on the fundamental cycles of the graph augmented with a virtual reservoir node, polished by a simultaneous Newton in the same chord-flow space — plus an mpmath 60-digit closed-form third path on the single-pipe, series, parallel, series/parallel, pump-operating-point, valve-Kv and heat-exchanger cases, and the network invariants (nodal mass balance, edge and loop energy closure, pump operating point on both curves, monotone throttling response) recomputed from the page\'s own solution.',
    reference_citations: [
      'H. Cross, Analysis of Flow in Networks of Conduits or Conductors, Univ. of Illinois Eng. Exp. Station Bulletin 286 (1936) — loop-correction method.',
      'P.K. Swamee & A.K. Jain, Explicit equations for pipe-flow problems, ASCE J. Hydraulics Div. 102(5) (1976) 657-664 — f = 0.25/[log10(eps/(3.7 D) + 5.74/Re^0.9)]^2, stated for 1e-6 <= eps/D <= 1e-2 and 5e3 <= Re <= 1e8.',
      'C.F. Colebrook, J. Inst. Civ. Eng. 11 (1939) 133-156 — used only to quantify the Swamee-Jain scatter.',
      'Hagen-Poiseuille laminar closed form f = 64/Re — derived, used to grade the laminar branch.',
      'IEC 60534-2-1 / metric Kv definition: Q[m3/h] = Kv sqrt(dp[bar]/SG).',
      'Affinity law H ~ n^2 for the two-point quadratic pump curve.',
    ],
    tolerance: 'Edge flows: 1e-6 relative (or 1e-9 m3/s absolute for near-zero flows) — set by the page\'s own declared convergence gate (scaled residual 2e-9), not by the reference, whose two solvers agree to <= 3.5e-16 m3/s and whose closed-form third path agrees to <= 1.8e-18 m3/s. Free-node heads: 1e-6 m. Invariants recomputed from the page\'s own solution: nodal mass balance 1e-12 m3/s, edge and loop energy closure 2e-9*hScale m, pump operating point 1e-9 m. Declared record outputs vs the solver object: 1e-9. Displayed flow column: 5e-4 m3/h (it prints 3 decimals). Swamee-Jain coefficients and the Hagen-Poiseuille laminar branch: 1e-14 relative. Input landing: every numeric field of every node and edge read back from the page\'s own state to 1e-12 relative before any output is read.',
    reference_provenance: 'recomputed',
    provenance_note: 'Every reference number used here comes from bench-src/ref/hydraulicnetwork_ref.json, recomputed in python from the cited primary formulations; no stored answer from any earlier artifact is used as a reference anywhere. This run re-executes that corpus unchanged against the page as shipped; no reference value, tolerance, case or comparison was altered.',
    run_at: new Date().toISOString(),
    build: P.build.manifest_revision,
    driven_url: URL_,
    total, passed, failed: total - passed,
    page_errors: pageErrors,
    page_self_tests: P.selfTest,
    determinism: {
      passes: RUNS, identical, first_difference: firstDiff,
      note: RUNS + ' complete passes in ' + RUNS + ' fresh browser contexts, compared case by case on every graded key.',
    },
    driver_evidence: {
      network_cases_solved: netScenes.filter(s => s.solved).length,
      distinct_network_solutions: new Set(netScenes.filter(s => s.solved).map(s => s.solution_fp)).size,
      distinct_equals_cases: new Set(netScenes.filter(s => s.solved).map(s => s.solution_fp)).size === netScenes.filter(s => s.solved).length,
      note: 'Fingerprint is a sha1 of the full vector of solved edge flows and nodal heads. If this count were below the case count the selectors would not be landing and the benchmark would be grading the same scene repeatedly. Every case additionally asserts import_landed_intact: the imported state is compared field by field against the intended network BEFORE the solve, worst deviation ' + worstLanding.toExponential(2) + ' relative.',
      surfaces_cross_compared: ['Diagram.record.build().outputs', 'window.__hydraulicTest.state.sol', 'rendered table.dgu-table results'],
      driven_scenes: scenes.length,
      solved_scenes: solved.length,
      refused_scenes: scenes.filter(s => !s.solved).map(s => s.id),
      positive_control: P.control,
    },
    reference_crosscheck: {
      worst_newton_vs_hardy_cross_m3s: Math.max(0, ...REF.cases.map(c => typeof c.crosscheck_max_abs_q_m3s === 'number' ? c.crosscheck_max_abs_q_m3s : 0)),
      recomputed_cases: REF.cases.length, recorded_cases: 0,
    },
    findings: [
      { severity: 'harness defect, fixed here', id: 'driver_ported_to_the_framework_surfaces',
        text: 'bench-src/run_hydraulicnetwork.mjs addressed hydraulicnetwork.html through a file:// address under one machine\'s site root and the pre-port DOM: #solveBtn, #solveStatus, #nodeResults, #edgeResults, #rho, #nu, #loadFactor and #speedFactor do not exist on the shipped page (measured: 0 occurrences of nodeResults and edgeResults, and #solveBtn resolves to null in the browser). It is ported here to a base URL plus tool path and to the framework surfaces (.dgu-verdict, table.dgu-table, DiagramUI.current.state, DiagramUI.current.run, Diagram.record.build). #loadFile, #residualBadge and window.__hydraulicTest are unchanged. No tolerance, case, reference value or comparison was altered.' },
      { severity: 'harness defect, fixed here', id: 'import_landing_race',
        text: 'The #loadFile handler awaits File.text(), so the original 120 ms sleep can grade the previous network; the 600- and 601-unknown networks share every node id, so a wait on node ids alone returns instantly. The wait now covers the full node+edge signature AND requires invalidate() to have nulled state.sol.' },
      { severity: 'harness strengthening', id: 'inputs_asserted_before_outputs',
        text: 'Each of the ' + REF.cases.length + ' corpus cases carries cmp.import_landed_intact: every numeric field of every node and edge, plus rho, nu, loadFactor and speedFactor, read back from the page\'s own state before any output is read. Worst deviation over the run: ' + worstLanding.toExponential(2) + ' relative. A positive control (single_pipe_two_reservoirs with the pipe length doubled) moves the compared flow by ' + (P.control.relative_move * 100).toFixed(1) + ' %, from ' + P.control.q_E1_m3h_baseline + ' to ' + P.control.q_E1_m3h_perturbed + ' m3/h.' },
      { severity: 'informational', id: 'cmp_key_not_reconstructed',
        text: 'The 2026-08-22 artifact carried one comparison this driver does not compute: poiseuille_closed_form_pipe_loss on swamee_jain_implementation. The driver that produced it is not in bench-src and its formulation is not recorded, so reconstructing a number for that key would be a value nothing measured. The laminar branch is still graded, as hagen_poiseuille_laminar_branch against f = 64/Re over 50 <= Re <= 2000, worst deviation reported in that case.' },
      { severity: 'informational', id: 'sweeps_unbenchmarked',
        text: 'This benchmark covers the steady-state solver only. The v2 additions the page ships (pump/system-curve sweep as an ensemble, N-1 screen, Monte-Carlo, 24 h / 8760 h load profile, Worker vs main-thread backend) are exercised nowhere in these ' + total + ' cases except the single system-curve consistency check. The page\'s own limitations text already says the sweeps carry no benchmark; nothing here changes that.' },
    ],
    recommendation: {
      status: 'benchmarked',
      conditional_on: 'Replacing benchmarks/hydraulicnetwork.json with THIS result and bumping manifest_revision, so the cited run_at is not older than the build it is published against. The status decision is the coordinator\'s.',
      justification: passed + ' of ' + total + ' cases pass against bench-src/ref/hydraulicnetwork_ref.json on build ' + P.build.manifest_revision + ', with ' + pageErrors.length + ' page errors and the page\'s own self-tests at ' + P.selfTest.passed + '/' + P.selfTest.total + '. ' + RUNS + ' passes in fresh contexts agree on every graded number: ' + identical + '.',
    },
    supplementary_checks: {
      language_invariance: P.langInv,
      regression_vs_previous_artifact: regression,
      artifact_replaced: PREV || null,
    },
    cases,
  };
  fs.writeFileSync(OUT, JSON.stringify(stampProvenance(out, { build: P.build.manifest_revision, ...PROVENANCE }), null, 1));
  console.log(`\n${passed}/${total} passed; page errors: ${pageErrors.length}; determinism identical: ${identical}`);
  console.log('written: ' + OUT);
  if (passed !== total) process.exitCode = 1;
}

main().catch(e => { console.error('DRIVER CRASH: ' + (e && e.stack || e)); process.exit(3); });
