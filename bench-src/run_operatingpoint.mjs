/* Benchmark driver: operatingpoint.html — Pump & Fan Operating Point.
 *
 * Reference: bench-src/ref/operatingpoint_ref.json — an independent python
 * implementation (gen_operatingpoint.py) of the pump and fan operating point,
 * written without reading this page. 171 cases: 97 are gradeable on the input
 * surface the page exposes and 74 name an input it has no control for and are
 * recorded as ungraded diagnostics (AGENTS §5.2).
 *
 * Usage: node bench-src/run_operatingpoint.mjs <baseUrl> <toolPath> [outDir] [refJson]
 *   e.g. node bench-src/run_operatingpoint.mjs http://127.0.0.1:8326 operatingpoint.html results
 * The resolver's flags are accepted as well and beat the positional arguments:
 *   --base, --site, --ref-dir, --out, --out2. With none of them the artifact goes to
 *   <siteRoot>/benchmarks/operatingpoint.json, siteRoot being the parent of bench-src.
 *
 * This driver REPLACES bench-src/operatingpoint.py, which extracted the page's own
 * application script with text.rfind and executed it, so the published artifact
 * measured the page against a transcription of itself. That file was deleted from the
 * tree on 2026-10-03 (11 523 B, sha256 55a18a2d3fb2) so it cannot be picked up again.
 * Nothing here reads the page's
 * script: every number on the page side is read from the page's own published
 * outputs — Diagram.record.build() and the rendered .dgu-tile values — in a browser.
 *
 * The page is driven through its own state codec (Diagram.state.encode + ?s=), the
 * same path the repaired run_ontvochtiging.mjs uses, because the page's machine
 * coefficients (h0, hAtRated, qRated), its reference elevations and pressures
 * (z1, p1, p2, pumpZ) and its NPSHr parameters (npsh0, npshK) are carried in the
 * permalink but have no rendered control. The nine rendered sliders are driven
 * through real events in the state-assertion self-test at the end of the run.
 *
 * MAPPING. The corpus declares a machine as H0 + a1 Q + a2 Q^2 and a system either
 * as a declared resistance parabola or as a list of pipe segments. This page has a
 * different model, and a case whose inputs the page has no control for is recorded
 * as skipped with the blocking input named, never graded against a substitute. See
 * mapCase() for the rule per input and §2 of DELIVERY.md for the counts.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths, parseFlags } from './benchpaths.mjs';

/* The positional interface is kept; the resolver supplies every path and its flags beat
   the positionals. This driver serves its page over http, so the origin stays its own
   default when no base is given anywhere, and the transport is unchanged.
   The positionals come from parseFlags, as in run_spectrum.mjs: filtering argv on
   startsWith('--') kept flag VALUES as positionals, so `--base <url> --out2 <path>` made
   POS[1] the output path and TOOL a .json file, and benchPaths refused the run with
   "page is required and must be an .html filename". */
const FLAGS   = parseFlags(process.argv.slice(2));
const POS     = FLAGS._;
const TOOL    = (typeof FLAGS.tool === 'string' ? FLAGS.tool : POS[1]) || 'operatingpoint.html';
const P = benchPaths({ name: 'operatingpoint', page: TOOL, ref: 'operatingpoint_ref.json',
  env: { ...process.env,
         BENCH_BASE: process.env.BENCH_BASE || POS[0] || 'http://127.0.0.1:8326',
         BENCH_OUT: process.env.BENCH_OUT
           || (POS[2] ? path.join(path.resolve(POS[2]), 'operatingpoint.json') : undefined) } });
const BASE    = P.base;
const REFPATH = POS[3] ? path.resolve(POS[3]) : P.ref;
const OUT     = P.out;
/* The control file sits beside the artifact, as it has, unless --out2/BENCH_OUT2 moves it. */
const CONTROL_OUT = P.out2 || OUT.replace(/\.json$/, '.control.json');
const URL0    = BASE.replace(/\/+$/, '') + '/' + P.pageFile;

const REF = JSON.parse(fs.readFileSync(REFPATH, 'utf8'));
const G   = REF.constants.g_m_s2;          // 9.80665, from the corpus, not from the page

/* ------------------------------------------------------------------ helpers */
const A_of = D => Math.PI * D * D / 4;
/* K(open) = 0.25/x^4 + 0.2 with x = max(0.06, open/100) is the page's valve law,
   read off the page's own published loss breakdown, never assumed: openForK is
   only a way to AIM at a K, and the K that actually landed is measured back out of
   losses_m.suction_valve / .discharge_valve in assertInputs(). */
const openForK = K => 100 * Math.pow(0.25 / (K - 0.2), 0.25);
/* Split a required sum of resistance coefficients over the page's two valves.
   Each valve contributes at least 0.2, so a K_sum at or below 0.4 is unreachable. */
function valveOpenings(Ksum) {
  if (!(Ksum > 0.45)) return null;
  const Ks = 0.45, Kd = Ksum - Ks;          // suction valve wide open (open = 100)
  if (!(Kd > 0.2)) return null;
  return { svalve: 100, dvalve: openForK(Kd) };
}
const num = s => {
  if (s == null) return NaN;
  const z = String(s).replace(/−/g, '-').replace(/[\s  ,]/g, '');
  const m = z.match(/-?\d+(\.\d+)?([eE][-+]?\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
const rel = (got, ref) => (ref === 0 ? (got === 0 ? 0 : Infinity) : Math.abs(got - ref) / Math.abs(ref));
/* 1/sqrt(f) = -2 log10( eps/(3.7 D) + 2.51/(Re sqrt f) ) — the corpus's colebrook_white
   relation (Colebrook 1939; White 7th ed. Eq. 6.48), bisected to machine precision.
   Used only to grade the page's own fixed-point iteration at the page's own Reynolds
   number; it is never substituted for a corpus expectation. */
function colebrook(Re, rr) {
  const g = f => 1 / Math.sqrt(f) + 2 * Math.log10(rr / 3.7 + 2.51 / (Re * Math.sqrt(f)));
  let a = 1e-4, b = 0.3, ga = g(a);
  if (ga * g(b) > 0) return NaN;
  for (let i = 0; i < 300; i++) {
    const m = 0.5 * (a + b), gm = g(m);
    if (gm === 0 || (b - a) < 1e-17) { a = b = m; break; }
    if (ga * gm <= 0) b = m; else { a = m; ga = gm; }
  }
  return 0.5 * (a + b);
}

/* -------------------------------------------------------------- page state */
const PUMP_DEFAULTS = {
  speed: 100, pumps: 1, dvalve: 78, svalve: 100, z2: 15, diam: 100, temp: 20,
  length: 90, rough: 0.045, z1: 2, p1: 101325, p2: 101325, pumpZ: 1.2,
  qRated: 0.014, h0: 43, hAtRated: 29, bepQ: 0.0185, etaMax: 0.82,
  motorEff: 0.92, driveEff: 0.97, npsh0: 2.3, npshK: 12500
};
const FAN_DEFAULTS = {
  speed: 100, fans: 1, damper: 82, filterLoad: 10, temp: 20, pressureKPa: 101.325,
  ductLossRef: 210, coilLossRef: 160, filterLossRef: 120, systemEffectRef: 45,
  qRef: 4.5, motorEff: 0.93, driveEff: 0.97, rhoRef: 1.2
};
const DEMO_MACHINE = {
  mode: 'demo', manufacturer: 'demo', model: 'Generic demo pump', source: '',
  points: [], allowExtrap: false, powerKind: 'shaft', limits: { source: 'user' }
};
const DEMO_FAN_MACHINE = {
  mode: 'demo', manufacturer: 'demo', model: 'Generic backward-curved fan', source: '',
  points: [], allowExtrap: false, powerKind: 'shaft',
  limits: { source: 'user', rhoRef: 1.2, pressureBasis: 'total' }
};

/* ---------------------------------------------------------------- mapping */
/* Every rule below names the page control that carries the corpus input, or the
   reason the page has none. A key the page does not publish is skipped, not
   graded against something adjacent. */
const QRATED = 0.014;                  // the page's own default curve abscissa; any
                                       // positive value gives the same parabola

function mapPumpMachine(m) {
  if (m.kind !== 'pump') return { no: 'machine.kind=' + m.kind + ': the pump branch takes a pump' };
  /* An unequal set is declared as machine.units, a list of different curves. The page
     composes identical units only, and only in parallel, so there is no control for it. */
  if (Array.isArray(m.units)) return { no: 'machine.units names ' + m.units.length
      + ' different curves (' + m.units.map(u => u.curve || '?').join(' + ')
      + '): the page composes identical units only, and only in parallel (x1 x2 x3)' };
  if (m.a1_s_m2 !== 0) return { no: 'machine.a1_s_m2=' + m.a1_s_m2 + ': the page\'s demo curve is H = r^2 (h0 - a qb^2) and has no linear term; a pasted curve is interpolated with PCHIP and cannot reproduce a parabola exactly' };
  if (m.impeller_ratio !== 1) return { no: 'machine.impeller_ratio=' + m.impeller_ratio + ': the page has no impeller-diameter control (only speed %)' };
  if (m.arrangement === 'series') return { no: 'machine.arrangement=series: the page composes parallel units only (×1 ×2 ×3)' };
  if (m.n_units !== 1 && m.arrangement !== 'parallel') return { no: 'machine.arrangement=' + m.arrangement + ' with n_units=' + m.n_units };
  if (![1, 2, 3].includes(m.n_units)) return { no: 'machine.n_units=' + m.n_units + ': the page offers ×1 ×2 ×3' };
  if (m.curves && m.curves.length > 1) return { no: 'unequal units: the page\'s parallel units are identical' };
  if (!(m.speed_ratio > 0)) return { no: 'machine.speed_ratio=' + m.speed_ratio + ': zero speed divides by r in Q/(r*pumps)' };
  return {
    s: {
      speed: 100 * m.speed_ratio, pumps: m.n_units,
      h0: m.H0_m, qRated: QRATED, hAtRated: m.H0_m + m.a2_s2_m5 * QRATED * QRATED
    }
  };
}

function mapPumpSystem(sy) {
  if (sy.model !== 'pipe_segments')
    return { no: 'system.model=' + sy.model + ': the page\'s system curve is Darcy-Weisbach with Colebrook friction plus two valve coefficients, so its resistance is not a declared C Q^2 parabola (f varies with Q)' };
  if (sy.segments.length !== 1)
    return { no: 'system has ' + sy.segments.length + ' segments: the page has one diameter and one roughness and splits its single length 34/66 at that diameter' };
  const g = sy.segments[0];
  const v = valveOpenings(g.K_sum);
  if (!v) return { no: 'segment.K_sum=' + g.K_sum + ': the page\'s two valves contribute K = 0.25/x^4 + 0.2 each, so the smallest reachable sum is just over 0.4' };
  return {
    s: {
      length: g.L_m, diam: g.D_m * 1000, rough: g.eps_m * 1000,
      z1: 0, z2: sy.H_static_m, p1: 101325, p2: 101325,   // static = z2 - z1 exactly
      svalve: v.svalve, dvalve: v.dvalve
    },
    Ksum: g.K_sum, D: g.D_m, L: g.L_m, Hstat: sy.H_static_m
  };
}

/* Keys the page publishes, per corpus expect key. Anything absent here is not
   printed on the page and not in its record, so it cannot be read at all. */
const NOT_PUBLISHED = {
  shutoff_m: 'the page publishes no shut-off head: there is no tile for it and Diagram.record.build() carries no curve for the demo machine (machine.curve_points is null unless a curve is pasted)',
  shutoff_Pa: 'the page publishes no shut-off pressure (see shutoff_m)',
  P_hydraulic_W: 'the page publishes electrical_power_W only; rho*g*Q*H needs the page\'s own density, which the pump branch does not publish',
  P_shaft_W: 'the page publishes electrical_power_W only on the pump branch',
  dp_f_Pa: 'no prescribed-flow pressure-loss output: the page reports losses at its own operating point only',
  h_f_m: 'the corpus grades h_f at a prescribed flow; the page has no flow input',
  H_sys_m: 'the corpus grades the system head at a prescribed flow; the page has no flow input',
  NPSHa_m: 'the page computes NPSHa from the source pressure p1, (z1 - pumpZ) and the suction-leg losses at 34 % of the single pipe length; it has no suction-flange pressure, no suction diameter and no velocity-head term, and p1 also sets the static head, so the corpus\'s (p_suction, D_suction, z) cannot be imposed',
  NPSH_margin_m: 'follows NPSHa',
  cavitation: 'follows NPSHa',
  f_colebrook_if_extended: 'ungraded diagnostic; the page has no Reynolds input',
  f_laminar_if_extended: 'ungraded diagnostic; the page has no Reynolds input',
  dp_valve_Pa: 'the corpus grades the valve loss at a prescribed flow and with a zeta or Kv model',
  h_valve_m: 'the corpus grades the valve loss at a prescribed flow and with a zeta or Kv model',
  refusal: 'the page\'s refusal reasons are its own strings (noroot, curveRange, fanNoRoot) and are not the corpus\'s vocabulary; recorded as a diagnostic, not graded'
};
const PRESCRIBED_Q_GROUPS = new Set(['friction_laminar', 'friction_turbulent', 'friction_transition', 'system_curve']);

/* ---------------------------------------------------- diagnostic classification */
/* The corpus classifies every case it cannot express on this page, by the control the
   page lacks, in spec_against_page.by_missing_control: {cases, ids, reason} per class.
   The driver reads that classification rather than parsing its own skip sentences, so
   the artifact's not_benchmarked block and the per-case mark cannot drift apart.
   Reader-facing label per class key; the key order of REPORT_LABEL is not used, the
   block is emitted largest class first. */
const MISSING_CONTROL_LABEL = {
  prescribed_flow:            'A prescribed flow or Reynolds number',
  declared_resistance:        'A declared resistance parabola C\u00b7Q\u00b2',
  fan_parabola:               'The fan branch against a parabola',
  impeller_ratio:             'Impeller-diameter trim',
  unequal_units:              'Unequal parallel units',
  linear_curve_term:          'A linear machine-curve term a\u2081',
  series:                     'Series composition',
  zero_speed:                 'Zero speed or zero impeller ratio',
  valve_coefficient:          'A valve \u03b6 or Kv',
  not_published_shutoff:      'Shut-off head, which the page does not publish',
  not_published_shaft_power:  'Shaft power, which the page does not publish'
};
const SPEC = REF.spec_against_page || {};
const BY_MISSING = SPEC.by_missing_control || {};
/* case id -> class key */
const MISSING_OF = {};
for (const [k, v] of Object.entries(BY_MISSING))
  for (const id of (v.ids || [])) MISSING_OF[id] = k;
const classLabel = k => MISSING_CONTROL_LABEL[k] || k;

function mapCase(c) {
  const i = c.inputs, G_ = c.group;

  /* The page-surface groups (decision 3 of the 2026-10 benchmark-evidence round) carry
     a literal page state in inputs.page_state, built by the generator from the nine
     controls of systemPanel() within their declared ranges and on their declared steps.
     There is nothing to map: the state IS the case, and applyPump asserts every key of
     it landed before any output is read. */
  if (G_.startsWith('page_')) {
    const s = i.page_state;
    if (!s) return { skipAll: 'page-surface case with no page_state' };
    return { kind: 'page_surface', mode: 'pump', s: { ...s },
             grade: Object.keys(c.expect), skip: {},
             controls_set: i.controls_set || {} };
  }

  if (G_ === 'fluid_properties') {
    if (i.fluid_name === 'water')
      return { kind: 'props_water', mode: 'pump', temp: i.T_K - 273.15,
               grade: ['rho_kg_m3', 'mu_Pa_s', 'nu_m2_s', 'p_vap_Pa'], skip: {} };
    return { kind: 'props_air', mode: 'fan', temp: i.T_K - 273.15, p_kPa: i.p_Pa / 1000,
             grade: ['rho_kg_m3'],
             /* Only keys the case actually grades are reported as skipped. Since the
                2026-10 round the air cases grade the page's own declared density alone,
                so this map is normally empty. */
             skip: Object.fromEntries(Object.entries({
                     mu_Pa_s: 'the fan branch has no viscosity: its system curve is a pure square law with no Reynolds dependence, so no viscosity is published',
                     nu_m2_s: 'follows mu_Pa_s',
                     p_vap_Pa: 'null in the corpus for air' })
                   .filter(([k]) => k in c.expect)) };
  }
  if (PRESCRIBED_Q_GROUPS.has(G_))
    return { skipAll: 'the case prescribes the flow (or the Reynolds number) as an input and grades the loss at it; the page has no flow input — it reports losses at the operating point its own solver finds' };
  if (i.fluid_name === 'air')
    return { skipAll: 'an air operating point needs the fan branch, whose machine curve is a PCHIP interpolation of pasted or illustrative points and cannot be a parabola, and whose system curve carries no friction factor' };
  if (i.valve)
    return { skipAll: 'the case declares a ' + i.valve.model + ' valve; the page\'s valves are an opening percentage with its own K(x) = 0.25/x^4 + 0.2 law and it has no zeta or Kv input' };

  const mm = i.machine && mapPumpMachine(i.machine);
  if (!mm) return { skipAll: 'no machine block' };
  if (mm.no) return { skipAll: mm.no };
  /* A case with no system block grades only quantities read off the machine curve
     itself. The page solves an intersection and publishes nothing from the curve alone. */
  if (!i.system) {
    const unpub = Object.keys(c.expect).filter(k => NOT_PUBLISHED[k]);
    if (unpub.length === Object.keys(c.expect).length)
      return { skipAll: 'the case grades only ' + unpub.join(', ')
        + ', and the page publishes none of them: ' + NOT_PUBLISHED[unpub[0]] };
    return { skipAll: 'no system block, and the page has no curve-only output path' };
  }
  const ss = mapPumpSystem(i.system);
  if (ss.no) return { skipAll: ss.no };

  const s = { ...PUMP_DEFAULTS, ...mm.s, ...ss.s, temp: i.T_K - 273.15 };
  if (i.npsh) { s.npsh0 = i.npsh.NPSHr_m; s.npshK = 0; }      // constant NPSHr

  const grade = [], skip = {};
  for (const k of Object.keys(c.expect)) {
    if (NOT_PUBLISHED[k]) { skip[k] = NOT_PUBLISHED[k]; continue; }
    if (/_S2$|_D1$/.test(k)) { skip[k] = 'second segment / duct: not representable'; continue; }
    grade.push(k);
  }
  return { kind: 'pump_op', mode: 'pump', s, grade, skip, geom: ss };
}

/* ------------------------------------------------------- browser plumbing */
const pageErrors = [], consoleLog = [];
async function ready(page) {
  await page.waitForFunction(
    () => !!window.Diagram && !!window.DiagramUI && !!window.Diagram.record
          && !!document.querySelector('.dgu-tile') && window.Diagram.state
          && typeof window.Diagram.state.encode === 'function',
    null, { timeout: 60000 });
}
/* Set the page's state through the page's own codec, then prove from the page's
   own state and the page's own published numbers that what the case names is what
   the page is solving. A case whose inputs did not land throws. */
async function applyPump(page, s, machine = DEMO_MACHINE) {
  const enc = await page.evaluate(o => window.Diagram.state.encode(o),
    { v: 4, mode: 'pump', pump: { s, machine, baseline: null, compareTarget: null },
      fan: { s: FAN_DEFAULTS, machine: DEMO_FAN_MACHINE, baseline: null, compareTarget: null },
      lang: 'en' });
  await page.goto(URL0 + '?lang=en&s=' + encodeURIComponent(enc), { waitUntil: 'load' });
  await ready(page);
  const back = await page.evaluate(() => {
    const st = window.Diagram.state.current();
    return { mode: st.mode, s: st.pump.s, machineMode: st.pump.machine.mode };
  });
  if (back.mode !== 'pump') throw new Error('mode did not land: ' + back.mode);
  if (back.machineMode !== 'demo') throw new Error('machine.mode did not land: ' + back.machineMode);
  for (const k of Object.keys(s)) {
    if (back.s[k] !== s[k])
      throw new Error('INPUT DID NOT LAND: ' + k + ' asked ' + s[k] + ' got ' + back.s[k]
                      + ' (full page state ' + JSON.stringify(back.s) + ')');
  }
  for (const k of Object.keys(back.s)) {
    if (!(k in s)) throw new Error('page state carries an unset key ' + k + '=' + back.s[k]);
  }
  return back.s;
}
async function applyFan(page, s) {
  const enc = await page.evaluate(o => window.Diagram.state.encode(o),
    { v: 4, mode: 'fan', pump: { s: PUMP_DEFAULTS, machine: DEMO_MACHINE, baseline: null, compareTarget: null },
      fan: { s, machine: DEMO_FAN_MACHINE, baseline: null, compareTarget: null }, lang: 'en' });
  await page.goto(URL0 + '?lang=en&s=' + encodeURIComponent(enc), { waitUntil: 'load' });
  await ready(page);
  const back = await page.evaluate(() => {
    const st = window.Diagram.state.current();
    return { mode: st.mode, s: st.fan.s };
  });
  if (back.mode !== 'fan') throw new Error('fan mode did not land: ' + back.mode);
  for (const k of Object.keys(s))
    if (back.s[k] !== s[k]) throw new Error('FAN INPUT DID NOT LAND: ' + k + ' asked ' + s[k] + ' got ' + back.s[k]);
  return back.s;
}
async function readPump(page) {
  return await page.evaluate(() => {
    const rec = window.Diagram.record.build();
    const tiles = {};
    for (const n of document.querySelectorAll('.dgu-tile')) {
      const txt = n.innerText.split('\n').map(x => x.trim()).filter(Boolean);
      if (txt.length >= 2) tiles[txt[0].replace(/\?$/, '').trim().toUpperCase()] = txt[1];
    }
    return { rec, tiles, verdict: (document.querySelector('.dgu-verdict') || {}).innerText || null };
  });
}

/* Recover, from the page's own published loss breakdown, the sum of resistance
   coefficients and the pipe friction group the page is actually using, so the
   case's K_sum and (f L/D) are asserted against the page and not against a
   transcription of the page's valve law. */
function recoverSystem(rec, D) {
  const o = rec.outputs, L = o.losses_m;
  const A = A_of(D), v = o.flow_m3_s / A, dyn = v * v / (2 * G);
  return {
    v, dyn,
    Ksum: (L.suction_valve + L.discharge_valve) / dyn,
    fLD: (L.suction_pipe + L.discharge_pipe) / dyn,
    static: L.static
  };
}

/* ----------------------------------------------------------------- grading */
function tolOf(c, k) {
  const t = (c.tol || {})[k] || {};
  if (t.exact_match) return { exact: true, reason: t.reason };
  return { rel: t.rel, abs: t.abs, reason: t.reason };
}
function cmpOne(c, k, got, note) {
  const ref = c.expect[k], t = tolOf(c, k), e = { got, ref, tol: t.rel ?? null };
  if (note) e.note = note;
  if (t.exact) { e.ok = (got === ref); e.exact_match = true; return e; }
  if (got == null || !Number.isFinite(got)) { e.ok = false; e.rel = null; return e; }
  e.rel = rel(got, ref);
  /* A band with both a relative and an absolute part passes on either. Which one it
     passed on is itself evidence: a comparison that fails the relative band and is
     carried by the absolute one is near the bottom of the quantity's range, and a
     reader of "97 of 97" is entitled to see which. Recorded per comparison. */
  const byRel = (t.rel != null ? e.rel <= t.rel : true);
  const byAbs = (t.abs != null && Math.abs(got - ref) <= t.abs);
  e.ok = byRel || byAbs;
  if (e.ok && !byRel && byAbs) {
    e.passed_on_absolute_band = true;
    e.abs = Math.abs(got - ref);
    e.tol_abs = t.abs;
  }
  return e;
}

/* --------------------------------------------------------------- main run */
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();
page.on('pageerror', e => pageErrors.push(String((e && e.message) || e)));
page.on('console', m => {
  consoleLog.push({ type: m.type(), text: m.text() });
  if (m.type() === 'error') pageErrors.push('console.error: ' + m.text());
});

await page.goto(URL0 + '?lang=en', { waitUntil: 'load' });
await ready(page);
const hasHook = await page.evaluate(() => typeof window.__dgcBenchmark);
/* AGENTS §5: the artifact must name the build it was executed against, and the only
   authority for that is the page itself. This driver's own inline read of the live
   manifest is now the shared one in provenance.mjs, so the observation has a single
   code path across all 46 drivers; the value and the failure mode are the same. */
const BUILD = await readPageManifestRevision(page);

/* ---- the page's own properties, measured once per temperature ---------------
 * The pump branch publishes no density, viscosity or vapour pressure. Each is
 * inverted out of a published output in a probe state arranged so the inversion is
 * exact. These measured values are then used to attribute a case's deviation to the
 * page's property correlations, which is the method the corpus's section 7.3 sets out. */
const PROPS = {};
async function measureWater(page, Tc) {
  if (PROPS[Tc]) return PROPS[Tc];
  const dP = 100000;
  const s = { ...PUMP_DEFAULTS, temp: Tc, z1: 0, z2: 0, p1: 101325, p2: 101325 + dP,
              diam: 100, length: 120, rough: 0.045, svalve: 100, dvalve: 100,
              h0: 20, hAtRated: 20 - 20000 * QRATED * QRATED, qRated: QRATED, pumpZ: 0 };
  await applyPump(page, s);
  const { rec } = await readPump(page);
  const o = rec.outputs;
  if (!o || o.flow_m3_s == null) throw new Error('property probe at ' + Tc + ' C has no operating point');
  const rho = dP / (o.losses_m.static * G);
  const D = s.diam / 1000, v = o.flow_m3_s / A_of(D);
  const mu = rho * v * D / o.reynolds;
  const loss = o.losses_m.suction_pipe + o.losses_m.suction_valve;
  const pv = rho * G * (s.p1 / (rho * G) + (s.z1 - s.pumpZ) - loss - o.npsha_m);
  return (PROPS[Tc] = { rho_kg_m3: rho, mu_Pa_s: mu, nu_m2_s: mu / rho, p_vap_Pa: pv, probe_state: s });
}

const cases = [];
let passed = 0, failed = 0, skipped = 0;

for (const c of REF.cases) {
  const m = mapCase(c);
  const out = { id: c.id, group: c.group, note: c.note, inputs: c.inputs, cmp: {}, worst_rel: 0 };

  if (m.skipAll) {
    /* A diagnostic, not a failure (AGENTS §5.2): graded false, status info, left out
       of the pass count. `flagged` is the shape benchmark.html's flagsOf() reads, so
       the case appears in the flagged table and in the all-cases table as flagged
       instead of silently as a pass. Without it a reader of the report meets 74
       records that say nothing about why they carry no numbers. */
    const cls = MISSING_OF[c.id] || null;
    out.pass = null;
    out.graded = false;
    out.status = 'info';
    out.skipped = m.skipAll;
    out.missing_control = cls ? { class: cls, label: classLabel(cls) } : null;
    out.unrepresentable_keys = Object.keys(c.expect);
    out.flagged = [{ id: cls ? classLabel(cls) : 'no control on this page',
                     reason: m.skipAll }];
    skipped++; cases.push(out); continue;
  }

  try {
    if (m.kind === 'props_air') {
      const s = { ...FAN_DEFAULTS, temp: m.temp, pressureKPa: m.p_kPa };
      out.page_state = await applyFan(page, s);
      const r = await page.evaluate(() => window.Diagram.record.build());
      out.cmp.rho_kg_m3 = cmpOne(c, 'rho_kg_m3', r.outputs.air_density_kg_m3,
        'read from the fan record\'s air_density_kg_m3');
      out.skipped_keys = m.skip;
    } else if (m.kind === 'props_water') {
      /* The pump branch publishes no properties directly. Each one is inverted out
         of a published output, with the state arranged so the inversion is exact:
           rho   from losses_m.static = (z2-z1) + (p2-p1)/(rho g), with z2 = z1
           mu    from reynolds = rho v D / mu and the published flow
           p_vap from npsha_m = p1/(rho g) + (z1-pumpZ) - suction losses - pv/(rho g) */
      const P = await measureWater(page, m.temp);
      out.cmp.rho_kg_m3 = cmpOne(c, 'rho_kg_m3', P.rho_kg_m3, 'inverted from losses_m.static with z2 = z1 and p2 - p1 = 1e5 Pa');
      out.cmp.mu_Pa_s   = cmpOne(c, 'mu_Pa_s',   P.mu_Pa_s,  'inverted from the published reynolds and flow_m3_s');
      out.cmp.nu_m2_s   = cmpOne(c, 'nu_m2_s',   P.nu_m2_s,  'mu/rho from the two inversions above');
      out.cmp.p_vap_Pa  = cmpOne(c, 'p_vap_Pa',  P.p_vap_Pa, 'inverted from the published npsha_m and loss breakdown');
      out.probe_state = P.probe_state;
    } else if (m.kind === 'page_surface') {
      /* applyPump round-trips the state through the page's own codec and throws unless
         every key landed, so the assertion that the case is the state the page is
         solving is made before a single output is read. */
      out.page_state = await applyPump(page, m.s);
      out.controls_set = m.controls_set;
      const { rec, tiles } = await readPump(page);
      const o = rec.outputs || {};
      const hasOp = !!(o && o.flow_m3_s != null && Number.isFinite(o.flow_m3_s));
      out.page_warnings = rec.warnings || [];
      const D = m.s.diam / 1000, A = A_of(D);
      const READ = {
        has_operating_point:      () => hasOp,
        Q_op_m3_s:                () => o.flow_m3_s,
        Q_op_m3_h:                () => o.flow_m3_s * 3600,
        H_op_m:                   () => o.head_m,
        efficiency:               () => o.efficiency,
        electrical_power_W:       () => o.electrical_power_W,
        NPSHa_m:                  () => o.npsha_m,
        NPSHr_m:                  () => o.npshr_m,
        NPSH_margin_m:            () => o.npsh_margin_m,
        Re:                       () => o.reynolds,
        f_darcy:                  () => o.darcy_friction_factor,
        loss_static_m:            () => (o.losses_m || {}).static,
        loss_suction_pipe_m:      () => (o.losses_m || {}).suction_pipe,
        loss_suction_valve_m:     () => (o.losses_m || {}).suction_valve,
        loss_discharge_pipe_m:    () => (o.losses_m || {}).discharge_pipe,
        loss_discharge_valve_m:   () => (o.losses_m || {}).discharge_valve
      };
      const SRC = {
        has_operating_point: 'record outputs.flow_m3_s is a finite number',
        Q_op_m3_s: 'record flow_m3_s', Q_op_m3_h: 'record flow_m3_s x 3600',
        H_op_m: 'record head_m', efficiency: 'record efficiency',
        electrical_power_W: 'record electrical_power_W', NPSHa_m: 'record npsha_m',
        NPSHr_m: 'record npshr_m', NPSH_margin_m: 'record npsh_margin_m',
        Re: 'record reynolds', f_darcy: 'record darcy_friction_factor',
        loss_static_m: 'record losses_m.static',
        loss_suction_pipe_m: 'record losses_m.suction_pipe',
        loss_suction_valve_m: 'record losses_m.suction_valve',
        loss_discharge_pipe_m: 'record losses_m.discharge_pipe',
        loss_discharge_valve_m: 'record losses_m.discharge_valve'
      };
      for (const k of m.grade) {
        if (k === 'has_operating_point') { out.cmp[k] = cmpOne(c, k, hasOp, SRC[k]); continue; }
        if (!hasOp) { out.cmp[k] = cmpOne(c, k, null, 'no operating point'); continue; }
        const rd = READ[k];
        out.cmp[k] = rd ? cmpOne(c, k, rd(), SRC[k])
                        : cmpOne(c, k, null, 'driver has no read for this key');
      }
      /* The page's own loss breakdown, inverted back to the resistance coefficients and
         the pipe group it is using, so the state is confirmed from the published numbers
         as well as from the codec round trip. Recorded, never graded. */
      if (hasOp) {
        const v = o.flow_m3_s / A, dyn = v * v / (2 * G);
        const rr = (m.s.rough / 1000) / D;
        out.crosscheck = {
          velocity_m_s: v,
          K_sum_from_page: ((o.losses_m.suction_valve + o.losses_m.discharge_valve) / dyn),
          fLD_from_page: ((o.losses_m.suction_pipe + o.losses_m.discharge_pipe) / dyn),
          LD_from_state: m.s.length / D,
          colebrook_at_page_Re: colebrook(o.reynolds, rr),
          f_page: o.darcy_friction_factor,
          f_page_vs_colebrook_rel: rel(o.darcy_friction_factor, colebrook(o.reynolds, rr)),
          note: 'The page iterates the Colebrook form as a fixed point; this is a bisected root of the same equation at the page\'s own Reynolds number and the state\'s eps/D.'
        };
        out.printed = {
          Q_m3_h: { printed: tiles['Q'], parsed: num(tiles['Q']), ref: c.expect.Q_op_m3_h,
                    half_last_digit: 0.05,
                    ok: Math.abs(num(tiles['Q']) - c.expect.Q_op_m3_h) <= 0.05 },
          H_m: { printed: tiles['H'], parsed: num(tiles['H']), ref: c.expect.H_op_m,
                 half_last_digit: 0.05,
                 ok: Math.abs(num(tiles['H']) - c.expect.H_op_m) <= 0.05 },
          f: { printed: tiles['F DARCY'], parsed: num(tiles['F DARCY']), ref: c.expect.f_darcy,
               half_last_digit: 5e-5,
               ok: Math.abs(num(tiles['F DARCY']) - c.expect.f_darcy) <= 5e-5 }
        };
      }
    } else {
      out.page_state = await applyPump(page, m.s);
      const { rec, tiles } = await readPump(page);
      const o = rec.outputs;
      const hasOp = !!(o && o.flow_m3_s != null && Number.isFinite(o.flow_m3_s));
      out.page_warnings = rec.warnings || [];

      /* Rule 3: prove the page is solving the system the case names, from the
         page's own published numbers, before any output is believed. */
      if (hasOp) {
        const g = m.geom, sys = recoverSystem(rec, g.D);
        out.input_assertion = { K_sum_from_page: sys.Ksum, K_sum_case: g.Ksum,
                                static_from_page: sys.static, static_case: g.Hstat,
                                fLD_from_page: sys.fLD, LD_case: g.L / g.D };
        if (rel(sys.Ksum, g.Ksum) > 1e-9)
          throw new Error('K_sum did not land: page ' + sys.Ksum + ' case ' + g.Ksum);
        if (Math.abs(sys.static - g.Hstat) > 1e-9)
          throw new Error('static head did not land: page ' + sys.static + ' case ' + g.Hstat);
        if (rel(sys.fLD / o.darcy_friction_factor, g.L / g.D) > 1e-9)
          throw new Error('pipe L/D did not land: page ' + (sys.fLD / o.darcy_friction_factor) + ' case ' + (g.L / g.D));
      }

      for (const k of m.grade) {
        if (k === 'has_operating_point')  out.cmp[k] = cmpOne(c, k, hasOp);
        else if (!hasOp)                  out.cmp[k] = cmpOne(c, k, null, 'no operating point');
        else if (k === 'Q_op_m3_s')       out.cmp[k] = cmpOne(c, k, o.flow_m3_s, 'record flow_m3_s');
        else if (k === 'Q_op_m3_h')       out.cmp[k] = cmpOne(c, k, o.flow_m3_s * 3600, 'record flow_m3_s x 3600');
        else if (k === 'H_op_m')          out.cmp[k] = cmpOne(c, k, o.head_m, 'record head_m');
        else if (k === 'Re_S1')           out.cmp[k] = cmpOne(c, k, o.reynolds, 'record reynolds');
        else if (k === 'f_darcy_S1')      out.cmp[k] = cmpOne(c, k, o.darcy_friction_factor, 'record darcy_friction_factor');
        else if (k === 'v_m_s_S1')        out.cmp[k] = cmpOne(c, k, o.flow_m3_s / A_of(m.s.diam / 1000), 'derived: record flow_m3_s / (pi D^2/4) at the diameter the case names');
        else if (k === 'NPSHr_m')         out.cmp[k] = cmpOne(c, k, o.npshr_m, 'record npshr_m with npshK = 0');
        else if (k === 'Q_per_unit_m3_s') out.cmp[k] = cmpOne(c, k, o.flow_m3_s / m.s.pumps, 'record flow_m3_s / pumps');
        else if (/^Q_m3_s_unit\d$/.test(k)) out.cmp[k] = cmpOne(c, k, o.flow_m3_s / m.s.pumps, 'record flow_m3_s / pumps (identical units)');
        else out.cmp[k] = cmpOne(c, k, null, 'driver has no read for this key');
      }
      /* Attribute the deviation, and grade the page's friction solver separately from
         the Reynolds number its viscosity correlation produces. Both are recorded as
         crosschecks; neither relaxes a graded comparison. */
      if (hasOp) {
        const P = await measureWater(page, m.s.temp);
        await applyPump(page, m.s);                       // restore the case's state
        const pre = REF.fluid_presets[c.inputs.fluid] || {};
        const ps = (c.crosscheck || {}).property_sensitivity || {};
        const dlnRho = Math.log(P.rho_kg_m3 / pre.rho_kg_m3);
        const dlnNu  = Math.log(P.nu_m2_s  / pre.nu_m2_s);
        const predicted = (ps.dlnQ_dlnrho || 0) * dlnRho + (ps.dlnQ_dlnnu || 0) * dlnNu;
        const measured  = Math.log(o.flow_m3_s / c.expect.Q_op_m3_s);
        const rr = m.geom.D ? (m.s.rough / 1000) / m.geom.D : NaN;
        const fRoot = colebrook(o.reynolds, rr);
        out.crosscheck = {
          page_properties: { rho_kg_m3: P.rho_kg_m3, mu_Pa_s: P.mu_Pa_s, nu_m2_s: P.nu_m2_s, p_vap_Pa: P.p_vap_Pa },
          corpus_properties: { rho_kg_m3: pre.rho_kg_m3, mu_Pa_s: pre.mu_Pa_s, nu_m2_s: pre.nu_m2_s, p_vap_Pa: pre.p_vap_Pa },
          dln_rho: dlnRho, dln_nu: dlnNu,
          dlnQ_predicted_from_properties: predicted,
          dlnQ_measured: measured,
          dlnQ_residual: measured - predicted,
          note_attribution: 'dlnQ_residual is what the page\'s hydraulics disagree by once the page\'s own property correlations are accounted for, using the corpus\'s first-order sensitivities.',
          colebrook_at_page_Re: fRoot,
          f_page: o.darcy_friction_factor,
          f_page_vs_colebrook_rel: rel(o.darcy_friction_factor, fRoot),
          note_friction: 'The page iterates Colebrook as a fixed point. This compares it with a bisected root of the same equation at the page\'s OWN Reynolds number and the case\'s eps/D, so the page\'s solver is separated from its viscosity correlation.'
        };
      }

      /* Cross-check the printed tiles at half of their own last printed digit,
         which is all the display carries (HARNESS.md). Recorded, never graded. */
      if (hasOp) out.printed = {
        Q_m3_h: { printed: tiles['Q'], parsed: num(tiles['Q']), ref: c.expect.Q_op_m3_h,
                  half_last_digit: 0.05,
                  ok: Math.abs(num(tiles['Q']) - c.expect.Q_op_m3_h) <= 0.05 },
        H_m:    { printed: tiles['H'], parsed: num(tiles['H']), ref: c.expect.H_op_m,
                  half_last_digit: 0.05,
                  ok: c.expect.H_op_m == null ? null : Math.abs(num(tiles['H']) - c.expect.H_op_m) <= 0.05 },
        Re:     { printed: tiles['RE'], parsed: num(tiles['RE']), ref: c.expect.Re_S1,
                  half_last_digit: 0.5,
                  ok: c.expect.Re_S1 == null ? null : Math.abs(num(tiles['RE']) - c.expect.Re_S1) <= 0.5 },
        f:      { printed: tiles['F DARCY'], parsed: num(tiles['F DARCY']), ref: c.expect.f_darcy_S1,
                  half_last_digit: 5e-5,
                  ok: c.expect.f_darcy_S1 == null ? null : Math.abs(num(tiles['F DARCY']) - c.expect.f_darcy_S1) <= 5e-5 }
      };
      out.skipped_keys = m.skip;
    }
  } catch (err) {
    out.driver_error = String(err.message || err);
  }

  /* Decision 2 of the 2026-10 round measured, in the corpus, the standard each page
     declaration had been graded against and the deviation from it, and the expectation
     shift on every derived case re-solved onto the page's own correlations. Those
     figures are the reason fifteen cases read passed where they read failed before,
     and the driver dropped them: carry them through so a reader meets them. */
  {
    const cc = c.crosscheck || {};
    for (const k of ['standard_reference', 'page_property_regrounding'])
      if (cc[k]) out.crosscheck = Object.assign(out.crosscheck || {}, { [k]: cc[k] });
  }

  /* AGENTS §5.1: a quantity left ungraded is a record the report must show as
     flagged, and burying it in a pass is the one thing the ladder exists to prevent.
     Each key the page does not publish is written into cmp with graded:false and the
     reason, which is what benchmark.html's cmpTable() and flagsOf() read. These rows
     carry no `ok`, so they are excluded from the verdict and from worst_rel. */
  if (out.skipped_keys) for (const [k, why] of Object.entries(out.skipped_keys)) {
    if (k in out.cmp) continue;
    out.cmp[k] = { got: null, ref: c.expect[k] === undefined ? null : c.expect[k],
                   tol: null, graded: false, status: 'info', note: why };
  }
  const keys = Object.keys(out.cmp).filter(k => out.cmp[k].graded !== false);
  const ungraded = Object.keys(out.cmp).length - keys.length;
  if (ungraded) out.ungraded_comparisons = ungraded;
  if (!keys.length) {
    out.pass = null; out.graded = false; out.status = 'info';
    out.skipped = out.driver_error || 'no gradeable key';
    skipped++;
  } else {
    out.worst_rel = Math.max(0, ...keys.map(k => out.cmp[k].rel || 0).filter(Number.isFinite));
    out.pass = keys.every(k => out.cmp[k].ok) && !out.driver_error;
    out.graded = true;
    out.graded_comparisons = keys.length;
    out.pass ? passed++ : failed++;
  }
  cases.push(out);
}

/* --------------------------------------------- positive control (rule 3) */
/* A run whose cases all pass at the page's default state has measured nothing.
   Perturb one input by a visible amount and confirm the compared outputs move. */
const control = {};
{
  const base = { ...PUMP_DEFAULTS, speed: 100, pumps: 1, z1: 0, z2: 8, p1: 101325, p2: 101325,
                 length: 120, diam: 100, rough: 0.045, temp: 20, svalve: 100,
                 dvalve: openForK(6.05), h0: 25, qRated: QRATED, hAtRated: 25 - 20000 * QRATED * QRATED };
  await applyPump(page, base);
  const a = (await readPump(page));
  await applyPump(page, { ...base, length: 240 });
  const b2 = (await readPump(page));
  await applyPump(page, { ...base, h0: 35, hAtRated: 35 - 20000 * QRATED * QRATED });
  const c2 = (await readPump(page));
  control.length_120_to_240 = {
    Q_m3_h: [a.rec.outputs.flow_m3_s * 3600, b2.rec.outputs.flow_m3_s * 3600],
    H_m: [a.rec.outputs.head_m, b2.rec.outputs.head_m],
    Re: [a.rec.outputs.reynolds, b2.rec.outputs.reynolds],
    f: [a.rec.outputs.darcy_friction_factor, b2.rec.outputs.darcy_friction_factor],
    printed_Q: [a.tiles['Q'], b2.tiles['Q']],
    moved: a.rec.outputs.flow_m3_s !== b2.rec.outputs.flow_m3_s
           && a.rec.outputs.head_m !== b2.rec.outputs.head_m
           && a.tiles['Q'] !== b2.tiles['Q']
  };
  control.h0_25_to_35 = {
    Q_m3_h: [a.rec.outputs.flow_m3_s * 3600, c2.rec.outputs.flow_m3_s * 3600],
    H_m: [a.rec.outputs.head_m, c2.rec.outputs.head_m],
    printed_Q: [a.tiles['Q'], c2.tiles['Q']],
    moved: a.rec.outputs.flow_m3_s !== c2.rec.outputs.flow_m3_s
           && a.tiles['Q'] !== c2.tiles['Q']
  };
  /* The nine rendered sliders are a second, independent input path: drive one with
     real events and confirm the page's own state and its printed tile both follow,
     so the permalink path is not the only thing shown to work. */
  await applyPump(page, base);
  const before = (await readPump(page)).tiles['Q'];
  const slider = await page.evaluate(() => {
    const row = document.querySelector('[data-dgu-field="f-length"]');
    const el = row && (row.querySelector('input[type=range]') || row.querySelector('input'));
    if (!el) return { no: 'f-length has no input element' };
    el.value = '240';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { set: el.value };
  });
  await page.waitForTimeout(400);
  const after = await readPump(page);
  control.rendered_slider_f_length = {
    locator: slider, printed_Q: [before, after.tiles['Q']],
    state_length: after.rec.inputs.total_pipe_length_m,
    moved: before !== after.tiles['Q'] && after.rec.inputs.total_pipe_length_m === 240
  };
  /* Guard diagnostics: the corpus's three guard cases sit on a declared resistance
     parabola the page cannot take, so they are skipped above. The same physical
     guards are probed here on a pipe system and recorded, never graded. */
  const guards = {};
  await applyPump(page, { ...base, z2: 30 });     // static above shut-off
  guards.static_above_shutoff = await page.evaluate(() => {
    const r = window.Diagram.record.build();
    return { operating_point: r.outputs.operating_point ?? null, flow: r.outputs.flow_m3_s ?? null, warnings: r.warnings };
  });
  await applyPump(page, { ...base, speed: 0 });   // zero speed
  guards.speed_zero = await page.evaluate(() => {
    const r = window.Diagram.record.build();
    return { operating_point: r.outputs.operating_point ?? null, flow: r.outputs.flow_m3_s ?? null, warnings: r.warnings };
  });
  control.guards = guards;
  control.__dgcBenchmark = hasHook;
}

const run_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/* Per-group tally, in the shape the deployed artifact's `groups` block uses, so the
   two are comparable: `graded` is how many of the group's cases the page can be made
   to represent at all, which the deployed artifact had no notion of. */
const groups = {};
for (const c of cases) {
  const g = (groups[c.group] = groups[c.group] || { cases: 0, graded: 0, passed: 0, skipped: 0, max_rel: 0 });
  g.cases++;
  if (c.pass === null) g.skipped++;
  else { g.graded++; if (c.pass) g.passed++; }
  if (Number.isFinite(c.worst_rel)) g.max_rel = Math.max(g.max_rel, c.worst_rel);
}
const failures = cases.filter(c => c.pass === false).map(c => ({
  id: c.id, group: c.group, worst_rel: c.worst_rel,
  failing: Object.entries(c.cmp).filter(([, v]) => !v.ok)
    .map(([k, v]) => ({ key: k, got: v.got, ref: v.ref, rel: v.rel ?? null, tol: v.tol ?? null }))
}));

const E = (x, d = 4) => (Number.isFinite(x) ? x.toExponential(d) : String(x));
/* Thousands grouped with a plain space, which is how every other figure on this site
   is written (AGENTS §4.1 house style). */
const N = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* ------------------------------------------------- what was not benchmarked */
/* benchmark.html renders not_benchmarked as a heading per key and the value as prose,
   so the keys are reader-facing English and the values are whole sentences. The
   eleven classes come from the corpus's own classification, largest first, so the
   counts in this block and the mark on each case cannot disagree. */
const notBenchmarked = {};
/* First, because the four tiles above this block do not add up on their own and a
   reader is entitled to the arithmetic rather than to a subtraction that misleads.
   Every figure here is counted from the records in this file. */
notBenchmarked['How the counts fit together'] = '__COUNTS__';
const byMissing = Object.entries(BY_MISSING)
  .sort((a, b) => (b[1].cases || 0) - (a[1].cases || 0));
for (const [k, v] of byMissing) {
  notBenchmarked['No control for: ' + classLabel(k) + ' \u2014 ' + v.cases
    + (v.cases === 1 ? ' case' : ' cases')] =
    v.reason + ' Cases: ' + (v.ids || []).join(', ') + '.';
}
const skNo = SPEC.state_keys_with_no_control || {};
if (skNo.keys) {
  notBenchmarked['Solver state with no control \u2014 ' + skNo.keys.length + ' keys'] =
    skNo.keys.join(', ') + '. ' + (skNo.note || '');
}
const unreach = SPEC.unreachable_page_code || {};
const UNREACH_LABEL = { laminar_friction_branch: 'the laminar friction branch f = 64/Re' };
for (const [k, v] of Object.entries(unreach))
  notBenchmarked['Page code no control reaches: ' + (UNREACH_LABEL[k] || k.replace(/_/g, ' '))] = v;
notBenchmarked['The fan branch and the pasted-curve import'] =
  'No case drives the fan branch end to end. Its machine characteristic is a PCHIP '
  + 'interpolation of pasted or illustrative points rather than a curve this corpus '
  + 'can declare, its system curve carries no friction factor, and the paste-and-parse '
  + 'import path is not exercised at all. Two cases grade the fan branch\u2019s own '
  + 'declared air density and nothing else.';
/* Quantities the page does not publish, carried as graded:false rows on cases that are
   otherwise graded. Counted here from the records actually written, not declared. */
const ungradedRows = {};
for (const c0 of cases)
  for (const [k, e] of Object.entries(c0.cmp || {}))
    if (e && e.graded === false) (ungradedRows[k] = ungradedRows[k] || { n: 0, why: e.note }).n++;
const ungradedKeys = Object.entries(ungradedRows).sort((a, b) => b[1].n - a[1].n);
const ungradedTotal = ungradedKeys.reduce((t, [, v]) => t + v.n, 0);
if (ungradedTotal) {
  notBenchmarked['Quantities left ungraded on cases that are otherwise graded \u2014 '
    + ungradedTotal + ' comparisons'] =
    ungradedKeys.map(([k, v]) => k + ' (' + v.n + '): ' + v.why).join(' ')
    + ' Each is recorded on its case as graded:false and is shown as flagged, never as a pass.';
}
(REF.not_benchmarked || []).forEach((t, i) => {
  notBenchmarked['Corpus limitation ' + (i + 1)] = t;
});
/* A flagged record is one benchmark.html's flagsOf() will mark: a case with its own
   `flagged` entries, or one carrying a comparison left graded:false. Counted from the
   records, so the artifact, the report page and the register cannot disagree. */
const flaggedN = cases.filter(c0 => (c0.flagged && c0.flagged.length)
  || Object.values(c0.cmp || {}).some(e => e && e.graded === false)).length;
{
  const partial = flaggedN - skipped;
  notBenchmarked['How the counts fit together'] =
    cases.length + ' cases are recorded. ' + (passed + failed) + ' carry at least one graded '
    + 'comparison, over ' + N(cases.reduce((t, c0) => t + (c0.graded_comparisons || 0), 0))
    + ' graded comparisons in all: ' + passed + ' pass and ' + failed + ' fail. '
    + skipped + ' carry no graded comparison at all, because the page has no control for '
    + 'the inputs they name. ' + flaggedN + ' of the ' + cases.length + ' are flagged - those '
    + skipped + ' plus ' + partial + ' graded cases that each also carry a quantity the page '
    + 'does not publish, ' + ungradedTotal + ' such comparisons in all. A flagged case is '
    + 'never counted as a pass and never counted as a failure.';
}

/* ------------------------------------------------------- top-level crosscheck */
/* The deviation of each page declaration from the standard it would otherwise have
   been graded against, measured in the corpus and summarised here because a reader of
   the report meets this block and not the per-case records. */
const PD = REF.page_declared || {};
const wEnv = (PD.water_properties || {}).deviation_envelope || {};
const shifts = cases.map(c0 => ((c0.crosscheck || {}).page_property_regrounding || {}).worst_expectation_shift)
  .filter(Number.isFinite);
const worstShift = shifts.length ? Math.max(...shifts) : null;
const propCases = cases.filter(c0 => c0.group === 'fluid_properties').length;
const absBand = [];
for (const c0 of cases)
  for (const [k, e] of Object.entries(c0.cmp || {}))
    if (e && e.ok === true && e.passed_on_absolute_band) absBand.push(c0.id + '/' + k);
const crosscheck =
  'The page declares its constants and its correlations, and this run grades the '
  + 'declarations as declared; the deviation from the standard they would otherwise be '
  + 'graded against is measured and recorded, not treated as an error. Dry-air density '
  + 'from the page\u2019s R = 287.05 J/(kg K) differs from the ISO 2533 value by '
  + E((PD.R_air_J_kg_K || {}).relative_deviation_of_density) + ' relative at every state, '
  + 'which is exactly 287.05287/287.05 - 1. Over the page\u2019s own 5-95 degC control '
  + 'range its three declared water correlations differ from IAPWS R7-97 and R12-08 '
  + 'through CoolProp 8.0.0 by '
  + E((wEnv.rho_relative || [])[0]) + ' to ' + E((wEnv.rho_relative || [])[1]) + ' on density, '
  + E((wEnv.mu_relative || [])[0]) + ' to ' + E((wEnv.mu_relative || [])[1]) + ' on viscosity and '
  + E((wEnv.p_vap_relative || [])[0]) + ' to ' + E((wEnv.p_vap_relative || [])[1])
  + ' on saturation pressure. Re-solving the derived cases on those declarations instead '
  + 'of the IAPWS presets moves their expected values by at most '
  + E(worstShift) + ' relative, on the Reynolds number of the 90 degC case. '
  + propCases + ' property cases and the derived cases that inherit them carry the figure '
  + 'per case under crosscheck.standard_reference and crosscheck.page_property_regrounding. '
  + 'The page\u2019s valve law K(x) = 0.25/x^4 + 0.2 has no standard to deviate from and is '
  + 'flagged on that ground instead. '
  + (absBand.length
      ? absBand.length + ' of the graded comparisons fail the relative part of their band and '
        + 'pass on its absolute part, inside the page\u2019s own bisection step: '
        + absBand.join(', ') + '.'
      : 'Every graded comparison passes the relative part of its band.');

/* Key order follows benchmarks/operatingpoint.json as deployed (schema, tool,
   benchmark_id, run_at, reference, tolerance, cases, passed, failed, groups,
   failures), with the fields rule 6 of this round adds appended after it. */
if (cases.length !== REF.counts.cases)
  throw new Error('case count ' + cases.length + ' is not the corpus count ' + REF.counts.cases);
if (passed + failed !== REF.counts.graded)
  throw new Error('graded ' + (passed + failed) + ' is not the corpus count ' + REF.counts.graded);
const artifact = {
  schema: 'tools.petrov.re/benchmark/v1',
  tool: 'operatingpoint.html',
  benchmark_id: 'operatingpoint-independent-corpus-v2',
  run_at,
  reference: {
    language: 'Python 3',
    corpus: 'bench-src/ref/operatingpoint_ref.json',
    generator: REF.generator,
    generator_sha256: REF.generator_sha256,
    provenance: REF.reference_provenance,
    driver: 'bench-src/run_operatingpoint.mjs — Playwright DOM driver; the page is read through Diagram.record.build() and the rendered .dgu-tile values only',
    replaces: 'the earlier harness bench-src/operatingpoint.py, which extracted the page\'s own application script and executed it, so the published evidence compared the page with a transcription of itself; it was removed from the tree on 2026-10-03 and this independent 171-case corpus took its place',
    note: REF.reference_line
  },
  tolerance: REF.tolerance_line,
  /* `cases` is the array of records, which is what benchmark.html reads to build the
     case table, the failures section and the flagged table. It was briefly an integer
     with the records under `cases_detail`, and the report then showed four tiles and
     nothing else: 74 of 171 records were unaccounted for to a reader. The counts a
     reader needs are the named fields below. */
  cases,
  passed, failed,
  groups,
  failures,
  total: cases.length,
  graded: passed + failed,
  flagged: flaggedN,
  graded_comparisons: cases.reduce((t, c0) => t + (c0.graded_comparisons || 0), 0),
  ungraded_comparisons: cases.reduce((t, c0) => t + (c0.ungraded_comparisons || 0), 0),
  skipped,
  skipped_note: 'A skipped case is one whose inputs this page has no control for. It is recorded with the blocking input named, carries graded:false and status:"info", is shown as flagged rather than as a pass, and is never graded against a substitute; see cases[].skipped and cases[].missing_control.',
  not_benchmarked: notBenchmarked,
  crosscheck,
  page_errors: pageErrors,
  console_messages: consoleLog,
  reference_citations: Object.values(REF.citations || {}),
  control,
  page_declared: REF.page_declared,
  spec_against_page: REF.spec_against_page
};
/* The four fields AGENTS §5 requires, written by the run through the shared stamp every
   driver in this directory now uses. BUILD is the revision read out of the page this run
   actually drove; the stamp re-reads it from the file on disk and throws if the two
   disagree, so the artifact cannot name a build the run did not grade. */
stampProvenance(artifact, {
  build: BUILD,
  reference_provenance: REF.reference_provenance,
  provenance_note: 'Every reference value is recomputed by ' + REF.generator
    + ' from the primary sources in the citations, with the generator sha256 recorded in '
    + 'the corpus and verified against the file; the generator was re-run against this tree '
    + 'on 2026-10-03 and reproduced the corpus at 15 822 leaves, 0 differing apart from '
    + 'generated_at. Where the page declares a constant or a correlation the reference uses '
    + 'the page\'s own and records the deviation from the standard it would otherwise have '
    + 'used; see the page_declared block. No value is reused from an earlier artifact, so no '
    + 'case carries ref_source "recorded".'
});
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
fs.writeFileSync(CONTROL_OUT,
  JSON.stringify({ run_at, control, console_messages: consoleLog, page_errors: pageErrors }, null, 2));
console.log(JSON.stringify({ run_at, build: BUILD, total: cases.length, graded: passed + failed, passed, failed, skipped,
  flagged_records: flaggedN,
  not_benchmarked_entries: Object.keys(notBenchmarked).length,
  page_errors: pageErrors.length, console_messages: consoleLog.length,
  control_moved: Object.fromEntries(Object.entries(control).filter(([, v]) => v && typeof v === 'object' && 'moved' in v).map(([k, v]) => [k, v.moved])) }, null, 1));
await b.close();
process.exit(pageErrors.length ? 3 : (failed ? 1 : 0));
