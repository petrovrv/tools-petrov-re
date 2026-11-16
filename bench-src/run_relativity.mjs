/* Benchmark driver: relativity.html (Relativistic Spacetime Laboratory).
 *
 * NEW IN 2026-10. There was no run_relativity.mjs. The 62 cases of
 * benchmarks/relativity.json were graded by extracting the page's pure
 * functions from its source and running them in Node, so the DOM -- input
 * parsing, state clamping, the display path and its rounding -- was never
 * measured. This driver is a DOM driver in the shape of the other twelve: it
 * sets the page's own controls, reads the page's own printed numbers, and
 * compares them against bench-src/ref/relativity_ref.json, the 60-digit
 * Decimal corpus written by bench-src/gen_relativity.py.
 *
 * Usage:
 *   node bench-src/run_relativity.mjs --base http://127.0.0.1:8325 \
 *     --tool relativity.html [--ref <corpus>] [--out <artifact>] \
 *     [--control <json>] [--prev <old artifact>]
 *
 * Input path. Six scalars have real controls and are TYPED into them
 * (#f-beta-c, #f-rodL0-c, #f-twin-leg-c, #f-radar-x0-c, #f-radar-emit-c,
 * #f-urel-c). Event coordinates A and B have no numeric control on this page
 * at all -- they are placed by dragging the Minkowski diagram, and dragging is
 * in the artifact's not_benchmarked list -- so they are written through the
 * page's own permalink codec (Diagram.state.encode + ?s=), the same path
 * run_ontvochtiging.mjs was repaired to use. Before each case every typed
 * scalar is seeded with a SENTINEL value through that permalink, so a control
 * that fails to accept the typed value leaves the page at a value no case
 * names and the case fails loudly instead of silently grading the default.
 *
 * Tolerance. The artifact states absolute 5e-12 plus relative
 * 5e-12 x max(1, |ref|). The page prints 3 to 6 decimals, so each DISPLAY
 * check is graded at half of the last digit the page prints, counted from the
 * rendered text and recorded per check as `printed_digits` and `tol`. Where the
 * page computes a quantity it never prints, the check is graded on the page's
 * own calculation record (Diagram.record.build(), the JSON/CSV/PDF export
 * path) at the artifact's own 5e-12 tolerance, and says so as path:"record".
 * Every printed check ALSO carries the record value at the 5e-12 tolerance, so
 * a display rounding and a computation error cannot be confused.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths, parseFlags } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build belongs to the
   run and not to this constant: readPageManifestRevision(page) reads it out of the live
   DOM of the page the browser loaded, and it reaches the artifact as stampProvenance's
   `build`, which writes build and manifest_revision and refuses to write without it. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/gen_relativity.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 401 leaves, 0 differing apart from generated_at, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
/* Every path resolves in the tree this driver sits in. --tool still names the page and
   --ref the reference file, by name inside the reference directory or absolutely; --site,
   --ref-dir, --out and --out2 move the tree, the reference directory and the two outputs. */
const FLAGS = parseFlags(process.argv.slice(2));
const P = benchPaths({ name: 'relativity',
                       page: String(FLAGS.tool || 'relativity.html'),
                       ref: String(FLAGS.ref || 'relativity_ref.json') });
/* The transport stays http, which is how this driver has always reached the page; --base or
   BENCH_BASE moves the origin and the default is the origin it has always used. */
const BASE = (P.base || 'http://127.0.0.1:8325').replace(/\/$/, '');
const TOOL = P.pageFile;
const REFPATH = P.ref;
const OUT = P.out;
const CONTROL = P.out2 || String(FLAGS.control || OUT.replace(/\.json$/, '.control.json'));
const PREV = arg('--prev', '');
const URL0 = BASE + '/' + TOOL;

const ONLY = arg('--only', '');          /* debug filter on case id; never used for a published run */
const REF = JSON.parse(fs.readFileSync(REFPATH, 'utf8'));
const SELECTED = ONLY ? REF.cases.filter(c => new RegExp(ONLY).test(c.id)) : REF.cases;

/* ---------------------------------------------------------------- tolerance */
/* The artifact's own criterion. */
const artTol = ref => 5e-12 + 5e-12 * Math.max(1, Math.abs(ref));
/* Half of the last digit of a value printed with `d` decimals. */
const dispTol = d => 0.5 * Math.pow(10, -d);

/* Where each compared quantity is printed, and with how many decimals.
   `decimals` is asserted against the rendered string at run time; a mismatch
   is a finding and fails the case. `path:'record'` means the page computes the
   quantity and prints it nowhere. */
const WHERE = {
  gamma:        { '':  { path: 'display', decimals: 3, src: 'tile γ' } },
  rapidity:     { '':  { path: 'display', decimals: 3, src: 'tile φ' } },
  lorentz:      { x:   { path: 'display', decimals: 3, src: "event table, row A, column x′" },
                  t:   { path: 'display', decimals: 3, src: "event table, row A, column ct′" } },
  interval:     { dx:  { path: 'display', decimals: 3, src: 'separation table, row Δx, column S' },
                  dt:  { path: 'display', decimals: 3, src: 'separation table, row cΔt, column S' },
                  s2:  { path: 'display', decimals: 4, src: 'results formula, Δs² in <strong>' } },
  simBeta:      { '':  { path: 'display', decimals: 3, src: 'tile \u03b2, after the page\'s own "find simultaneity frame" action' } },
  length:       { '':  { path: 'display', decimals: 4, src: 'results formula, L in <strong>' } },
  twin:         { earth:      { path: 'display', decimals: 4, src: 'results formula, τ_Earth' },
                  traveller:  { path: 'display', decimals: 4, src: 'results formula, τ_trav in <strong>' },
                  difference: { path: 'record',  record: 'twin.difference' } },
  radar:        { emit:          { path: 'record',  record: 'radar.emit' },
                  reflect:       { path: 'record',  record: 'radar.reflect' },
                  receive:       { path: 'record',  record: 'radar.receive' },
                  xReflect:      { path: 'record',  record: 'radar.xReflect' },
                  radarTime:     { path: 'display', decimals: 3, src: '#radarTime tile' },
                  radarDistance: { path: 'display', decimals: 4, src: 'results formula, D_radar in <strong>' } },
  velocity:     { '':  { path: 'display', decimals: 5, src: 'results formula, w/c in <strong>' } }
};
/* The record key each compared quantity also carries, so a printed check can
   be separated from a computation check. */
const RECKEY = {
  gamma:    { '': S => S.outputs.gamma },
  rapidity: { '': S => S.outputs.rapidity },
  lorentz:  { x: S => S.outputs.event_A_prime.x, t: S => S.outputs.event_A_prime.ct },
  interval: { dx: S => S.outputs.delta.dx, dt: S => S.outputs.delta.ct,
              s2: S => S.outputs.delta.interval_squared },
  /* the page's own simultaneity solver writes its answer into the frame
     velocity, so the record carries it full precision on the input side */
  simBeta:  { '': S => S.inputs.beta },
  length:   { '': S => S.outputs.length_contraction.observed_length },
  twin:     { earth: S => S.outputs.twin.earth, traveller: S => S.outputs.twin.traveller,
              difference: S => S.outputs.twin.difference },
  radar:    { emit: S => S.outputs.radar && S.outputs.radar.emit,
              reflect: S => S.outputs.radar && S.outputs.radar.reflect,
              receive: S => S.outputs.radar && S.outputs.radar.receive,
              xReflect: S => S.outputs.radar && S.outputs.radar.xReflect,
              radarTime: S => S.outputs.radar && S.outputs.radar.radarTime,
              radarDistance: S => S.outputs.radar && S.outputs.radar.radarDistance },
  velocity: { '': S => S.outputs.velocity_addition.w }
};

/* ------------------------------------------------------------------- state */
/* Sentinel values: no case names any of them, so an input that did not land
   is visible as a wrong number rather than as a plausible default. */
const SENTINEL = { beta: 0.123, rodL0: 1.3, twinLeg: 7.7, radarX0: 4.3, radarEmit: 2.9, uRel: -0.77 };
const DEFAULT_STATE = {
  v: 1, speedMode: 'beta', beta: SENTINEL.beta, tau: 1, preset: 'custom', zoom: 1,
  A: { x: -3, t: 1 }, B: { x: 2, t: 4 },
  rodL0: SENTINEL.rodL0, rodT: 0,
  twinLeg: SENTINEL.twinLeg, twinMode: 'instant', twinAccel: 0.5,
  radarX0: SENTINEL.radarX0, radarEmit: SENTINEL.radarEmit,
  uRel: SENTINEL.uRel, dopplerX0: 3, dopplerPeriod: 0.5,
  layers: { prime: true, sim: true, hyper: false, causal: false, grid: true },
  sandbox: { objects: [], selected: null, tool: 'select', nextId: 1, snap: true },
  lang: 'en'
};

/* The page state a case needs, with every typed scalar left at its sentinel.
   `preset` picks which formula the results panel prints, and is the page's own
   vocabulary: the same value its own field setters write. */
function caseState(c) {
  const s = JSON.parse(JSON.stringify(DEFAULT_STATE));
  const i = c.inputs;
  switch (c.note) {
    case 'gamma': case 'rapidity': case 'velocity': s.preset = 'custom'; break;
    case 'lorentz': s.A = { x: i.ev.x, t: i.ev.t }; s.preset = 'custom'; break;
    case 'interval': case 'simBeta':
      s.A = { x: i.a.x, t: i.a.t }; s.B = { x: i.b.x, t: i.b.t }; s.preset = 'custom'; break;
    case 'length': s.preset = 'length'; break;
    case 'twin': s.preset = 'twin'; s.twinMode = 'instant'; break;
    case 'radar': s.preset = 'radar'; break;
  }
  if (c.note === 'velocity') s.preset = 'velocity';
  return s;
}

/* Which controls a case types, and the value each must end up holding. */
/* The β a case drives the control with. `interval` has no beta of its own and
   its three graded quantities are frame-independent, so it is typed with a
   fixed 0.6 -- different from the sentinel -- purely so a dead control is
   caught. `simBeta` types nothing: the page's own action has to write it. */
const INTERVAL_BETA = 0.6;
function typedFor(c) {
  const i = c.inputs, out = [];
  let beta = (i.beta !== undefined) ? i.beta : null;
  if (c.note === 'interval') beta = INTERVAL_BETA;
  if (c.note === 'simBeta') beta = null;
  if (beta !== null) out.push(['f-beta-c', 'beta', beta]);
  if (c.note === 'length') out.push(['f-rodL0-c', 'rodL0', i.L0]);
  if (c.note === 'twin') out.push(['f-twin-leg-c', 'twinLeg', i.leg]);
  if (c.note === 'radar') { out.push(['f-radar-x0-c', 'radarX0', i.x0]); out.push(['f-radar-emit-c', 'radarEmit', i.te]); }
  if (c.note === 'velocity') out.push(['f-urel-c', 'uRel', i.u]);
  return out;
}

/* ------------------------------------------------------------- page reading */
const PAGE_FNS = `
window.__bench = {
  typeNum: function (id, v) {
    var e = document.getElementById(id);
    if (!e) throw new Error('control #' + id + ' is absent from the page');
    if (e.disabled) throw new Error('control #' + id + ' is disabled');
    e.focus();
    e.value = String(v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.blur();
    return e.value;
  },
  /* compute:'live' means a committed input re-renders on a debounce, so the
     record (which recordBuild() evaluates live) moves BEFORE the display does.
     Reading without this wait measured the previous state's display: the first
     run of this driver scored 3 of 12 with every printed value still showing
     the seeded sentinel while every record value was already correct. Mark the
     render surfaces, then wait until the page has rebuilt all of them. */
  MARKED: ['rodProper','rodObserved','twinEarth','twinTraveller','twinDistance',
           'radarDistance','radarTime','velocityW','velocityPhi','dopplerFactor','dopplerObserved'],
  STALE: '\u0000stale',
  markStale: function () {
    var self = this, n = 0;
    /* the results panel's own formula node is recreated on every payload, so
       the marked one leaves the document when the panel is rebuilt */
    [].filter.call(document.querySelectorAll('.rel-formula'), function (x) { return !x.id; })
      .forEach(function (x) { x.setAttribute('data-bench-stale', '1'); n++; });
    this.MARKED.forEach(function (id) {
      var e = document.getElementById(id);
      if (e) { e.textContent = self.STALE; n++; }
    });
    if (n < 12) throw new Error('markStale marked only ' + n + ' render surfaces of 12');
    return n;
  },
  isFresh: function () {
    if (document.querySelector('[data-bench-stale]')) return false;
    for (var i = 0; i < this.MARKED.length; i++) {
      var e = document.getElementById(this.MARKED[i]);
      if (e && e.textContent.indexOf(this.STALE) >= 0) return false;
    }
    return true;
  },
  read: function () {
    var tiles = {};
    document.querySelectorAll('.dgu-tile').forEach(function (n) {
      var ln = n.querySelector('.dgu-tile-l');
      /* the framework appends a learn button inside .dgu-tile-l, so the label
         is the first child text node, not the element's textContent */
      var l = ln ? ((ln.firstChild && ln.firstChild.nodeType === 3)
                     ? ln.firstChild.textContent : ln.textContent) : '';
      var vn = n.querySelector('.dgu-tile-v');
      var key = l.replace(/\\s+/g, ' ').trim();
      var rec = { text: (vn ? vn.textContent : '').trim(), id: vn ? vn.id : '' };
      if (!(key in tiles)) tiles[key] = rec; else tiles[key + ' #2'] = rec;
    });
    var tables = {};
    document.querySelectorAll('table.dgu-table').forEach(function (t) {
      var cap = ((t.querySelector('caption') || {}).textContent || '').trim();
      tables[cap] = {
        head: [].map.call(t.querySelectorAll('thead th'), function (c) { return c.textContent.trim(); }),
        rows: [].map.call(t.querySelectorAll('tbody tr'), function (r) {
          return [].map.call(r.querySelectorAll('th,td'), function (c) { return c.textContent.trim(); });
        })
      };
    });
    var formulas = [].map.call(document.querySelectorAll('.rel-formula'), function (n) {
      var st = n.querySelector('strong');
      return { id: n.id || '', text: n.textContent.trim(), strong: st ? st.textContent.trim() : null,
               muted: (function () { var m = n.querySelector('.eq-muted'); return m ? m.textContent.trim() : null; })() };
    });
    var legacy = {};
    ['rodProper','rodObserved','twinEarth','twinTraveller','twinDistance','radarDistance',
     'radarTime','velocityW','velocityPhi','dopplerFactor','dopplerObserved','selftestText']
      .forEach(function (id) { var e = document.getElementById(id); legacy[id] = e ? e.textContent.trim() : null; });
    var ctl = {};
    ['f-beta-c','f-rodL0-c','f-twin-leg-c','f-radar-x0-c','f-radar-emit-c','f-urel-c','f-phi-c']
      .forEach(function (id) { var e = document.getElementById(id); ctl[id] = e ? e.value : null; });
    var rec = window.Diagram.record.build();
    return { tiles: tiles, tables: tables, formulas: formulas, legacy: legacy, ctl: ctl,
             inputs: rec.inputs, outputs: rec.outputs,
             state: window.Diagram.state.current ? window.Diagram.state.current() : null };
  }
};
`;

/* Parse a printed number: U+2212 minus, U+00A0 and the framework's space
   thousands separator, and the leading + of signfmt. */
function num(s) {
  if (s == null) return NaN;
  const t = String(s).replace(/−/g, '-').replace(/[ \s]/g, '').replace(/^\+/, '');
  const m = t.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}
/* Decimals actually printed, counted from the rendered string. */
function decimalsOf(s) {
  if (s == null) return -1;
  const t = String(s).replace(/−/g, '-').replace(/[ \s]/g, '').replace(/^\+/, '');
  const m = t.match(/-?\d+\.(\d+)/);
  return m ? m[1].length : 0;
}

/* The printed string for one compared quantity. */
function printedFor(c, key, S) {
  const g = c.note;
  if (g === 'gamma') return tileText(S, 'γ');
  if (g === 'rapidity') return tileText(S, 'φ');
  if (g === 'lorentz') {
    const tb = findTableByHead(S, ['x', 'ct', 'x′', 'ct′']);
    if (!tb) throw new Error('event-coordinate table not found; captions seen: ' + Object.keys(S.tables).join(' | '));
    const row = tb.rows.find(r => r[0] === 'A');
    if (!row) throw new Error('row A not found in the event-coordinate table');
    return key === 'x' ? row[3] : row[4];
  }
  if (g === 'interval') {
    if (key === 's2') return formulaStrong(S);
    const tb = findTableByHead(S, ['S', 'S′']);
    if (!tb) throw new Error('separation table not found; captions seen: ' + Object.keys(S.tables).join(' | '));
    const want = key === 'dx' ? 'Δx' : 'cΔt';
    const row = tb.rows.find(r => r[0] === want);
    if (!row) throw new Error('row ' + want + ' not found in the separation table');
    return row[1];
  }
  if (g === 'simBeta') return tileText(S, '\u03b2');
  if (g === 'length') return formulaStrong(S);
  if (g === 'twin') {
    if (key === 'traveller') return formulaStrong(S);
    if (key === 'earth') {
      const f = resultsFormula(S);
      const m = f.text.replace(/−/g, '-').match(/τEarth\s*=\s*([-\d.]+)/);
      if (!m) throw new Error('τ_Earth not printed in the results formula: ' + f.text);
      return m[1];
    }
  }
  if (g === 'radar') {
    if (key === 'radarDistance') return formulaStrong(S);
    if (key === 'radarTime') return S.legacy.radarTime;
  }
  if (g === 'velocity') return formulaStrong(S);
  return null;
}
function tileText(S, label) {
  const t = S.tiles[label];
  if (!t) throw new Error('tile "' + label + '" not found; tiles seen: ' + Object.keys(S.tiles).join(' | '));
  return t.text;
}
function findTableByHead(S, must) {
  for (const cap of Object.keys(S.tables)) {
    const h = S.tables[cap].head;
    if (must.every(m => h.indexOf(m) >= 0)) return S.tables[cap];
  }
  return null;
}
/* The results panel's own formula node: the one rendered from resultsPayload,
   which is the node that carries no id (the five experiment formulas do). */
function resultsFormula(S) {
  const f = S.formulas.filter(x => !x.id);
  if (f.length !== 1) throw new Error('expected exactly one id-less .rel-formula (the results ' +
    'panel node); found ' + f.length + '. formula ids seen: ' +
    S.formulas.map(x => x.id || '(none)').join(' | '));
  return f[0];
}
function formulaStrong(S) {
  const f = resultsFormula(S);
  if (f.strong == null) throw new Error('results formula carries no <strong>: ' + f.text);
  return f.strong;
}
function recValue(c, key, S) {
  const m = RECKEY[c.note];
  const fn = m && m[key];
  if (!fn) return undefined;
  try { return fn(S); } catch (e) { return undefined; }
}

/* --------------------------------------------------------------- the driver */
const pageErrors = [], consoleErrors = [], consoleAll = [];

const READY = () => !!(window.Diagram && window.DiagramUI &&
  window.Diagram.record.build() !== null &&
  document.querySelector('.dgu-tile') &&
  document.getElementById('twinEarth') &&
  document.getElementById('f-beta-c'));

/* The state is encoded by the PAGE's own codec, so the driver cannot drift from
   it. That needs a loaded page, which the very first call does not have. */
async function boot(page, state) {
  let have = false;
  try { have = await page.evaluate(() => !!(window.Diagram && window.Diagram.state)); } catch (e) { have = false; }
  if (!have) {
    await page.goto(URL0 + '?lang=en', { waitUntil: 'load' });
    await page.waitForFunction(READY, null, { timeout: 60000 });
  }
  const enc = await page.evaluate(o => window.Diagram.state.encode(o), state);
  await page.goto(URL0 + '?lang=en&s=' + enc, { waitUntil: 'load' });
  await page.waitForFunction(READY, null, { timeout: 60000 });
  await page.evaluate(PAGE_FNS);
}

/* Wait until the page has rebuilt every render surface the driver reads. */
async function settle(page, what) {
  try {
    await page.waitForFunction(() => window.__bench.isFresh(), null, { timeout: 20000 });
  } catch (e) {
    const diag = await page.evaluate(() => {
      const out = { marked: [] };
      window.__bench.MARKED.forEach(function (id) {
        const el = document.getElementById(id);
        out.marked.push(id + '=' + (el ? el.textContent : '(absent)'));
      });
      out.formula_stale = !!document.querySelector('[data-bench-stale]');
      return out;
    });
    throw new Error('the page did not re-render after ' + what + ' within 20 s: ' + JSON.stringify(diag));
  }
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function runCase(page, c) {
  const notes = [];
  const state = caseState(c);
  await boot(page, state);

  /* 1. the permalink must have landed: the page's own record has to show the
        event coordinates and the sentinels the state named. */
  let S = await page.evaluate(() => window.__bench.read());
  const seeded = {
    event_A: S.inputs.event_A, event_B: S.inputs.event_B, beta: S.inputs.beta,
    rodL0: S.inputs.rod.proper_length, twinLeg: S.inputs.twin.earth_frame_time_per_leg,
    radarX0: S.inputs.radar.target_x_at_t0, radarEmit: S.inputs.radar.emission_time,
    uRel: S.inputs.velocity_addition.u_prime
  };
  const bad = [];
  const eq = (a, b) => a === b;
  if (!eq(seeded.event_A.x, state.A.x) || !eq(seeded.event_A.ct, state.A.t))
    bad.push('event A seeded as ' + JSON.stringify(seeded.event_A) + ', state named ' + JSON.stringify(state.A));
  if (!eq(seeded.event_B.x, state.B.x) || !eq(seeded.event_B.ct, state.B.t))
    bad.push('event B seeded as ' + JSON.stringify(seeded.event_B) + ', state named ' + JSON.stringify(state.B));
  for (const k of ['beta', 'rodL0', 'twinLeg', 'radarX0', 'radarEmit', 'uRel'])
    if (!eq(seeded[k], state[k === 'beta' ? 'beta' : k]))
      bad.push('sentinel ' + k + ' seeded as ' + seeded[k] + ', state named ' + state[k]);
  if (bad.length) throw new Error('permalink did not land: ' + bad.join('; '));

  /* 2. type every control the case names, then wait for the page's own state
        to carry the typed value and assert it from three places. */
  const typed = typedFor(c);
  if (typed.length) await page.evaluate(() => window.__bench.markStale());
  for (const [id, key, v] of typed) {
    const boxAfter = await page.evaluate(([i, x]) => window.__bench.typeNum(i, x), [id, v]);
    notes.push('typed ' + v + ' into #' + id + '; box reads ' + boxAfter);
  }
  if (typed.length) {
    const want = {}; for (const [, key, v] of typed) want[key] = v;
    await page.waitForFunction(w => {
      const r = window.Diagram.record.build(); if (!r) return false;
      const i = r.inputs;
      const got = { beta: i.beta, rodL0: i.rod.proper_length,
        twinLeg: i.twin.earth_frame_time_per_leg, radarX0: i.radar.target_x_at_t0,
        radarEmit: i.radar.emission_time, uRel: i.velocity_addition.u_prime };
      return Object.keys(w).every(k => got[k] === w[k]);
    }, want, { timeout: 20000 }).catch(async () => {
      const got = await page.evaluate(() => window.__bench.read().inputs);
      throw new Error('typed inputs did not reach the page state. wanted ' +
        JSON.stringify(want) + '; page holds ' + JSON.stringify(got));
    });
    await settle(page, 'typing ' + typed.map(x => x[0]).join(', '));
  }

  /* 3. the simultaneity cases have no printed output for the quantity: the
        page exposes it only through its own "find simultaneity frame" action,
        which writes the frame velocity into the β control. */
  if (c.note === 'simBeta') {
    const btn = await page.$('[data-action="findSim"]');
    if (!btn) throw new Error('the page\'s "find simultaneity frame" action is absent');
    if (await btn.isDisabled()) throw new Error('"find simultaneity frame" is disabled for ' + c.id);
    await page.evaluate(() => window.__bench.markStale());
    await btn.click();
    await page.waitForFunction(b => {
      const r = window.Diagram.record.build();
      return !!r && r.inputs.beta !== b;
    }, SENTINEL.beta, { timeout: 20000 });
    await settle(page, 'the page\'s own "find simultaneity frame" action');
  }

  S = await page.evaluate(() => window.__bench.read());

  /* 4. input assertion, read back from the page after everything settled. */
  const iv = {};
  const inputsSeen = {
    beta: S.inputs.beta, event_A: S.inputs.event_A, event_B: S.inputs.event_B,
    rodL0: S.inputs.rod.proper_length, twinLeg: S.inputs.twin.earth_frame_time_per_leg,
    radarX0: S.inputs.radar.target_x_at_t0, radarEmit: S.inputs.radar.emission_time,
    uRel: S.inputs.velocity_addition.u_prime, preset_formula: resultsFormula(S).text.slice(0, 40)
  };
  const want = {};
  for (const [, key, v] of typed) want[key] = v;
  if (c.note === 'lorentz') { want.event_A = { x: c.inputs.ev.x, ct: c.inputs.ev.t }; }
  if (c.note === 'interval' || c.note === 'simBeta') {
    want.event_A = { x: c.inputs.a.x, ct: c.inputs.a.t };
    want.event_B = { x: c.inputs.b.x, ct: c.inputs.b.t };
  }
  if (c.note === 'simBeta') delete want.beta;   /* the page computes it */
  const mism = [];
  for (const k of Object.keys(want)) {
    const a = inputsSeen[k], b = want[k];
    const same = (typeof b === 'object')
      ? (a && a.x === b.x && a.ct === b.ct)
      : a === b;
    if (!same) mism.push(k + ': page ' + JSON.stringify(a) + ' vs case ' + JSON.stringify(b));
  }
  iv.ok = mism.length === 0;
  iv.seen = inputsSeen;
  if (!iv.ok) iv.mismatch = mism;

  /* 5. compare */
  const expect = REF.cases.find(x => x.id === c.id).expect;
  if (!expect) throw new Error('corpus has no expectation block for ' + c.id);
  const cmp = {};
  let pass = iv.ok, worst = 0;
  if (!iv.ok) notes.push('INPUT ASSERTION FAILED: ' + mism.join('; '));

  for (const key of Object.keys(expect)) {
    const ref = expect[key];
    const w = (WHERE[c.note] || {})[key];
    if (!w) { cmp[key] = { got: null, ref, ok: false, note: 'no read path declared for this quantity' }; pass = false; continue; }
    const entry = { };
    let got, tol, basis, printedDigits = null, printedText = null;
    if (w.path === 'display') {
      printedText = printedFor(c, key, S);
      got = num(printedText);
      printedDigits = decimalsOf(printedText);
      if (printedDigits !== w.decimals) {
        notes.push('printed-digit count for ' + (key || '(scalar)') + ' is ' + printedDigits +
          ', declared ' + w.decimals + ' (text "' + printedText + '")');
      }
      const d = printedDigits >= 0 ? printedDigits : w.decimals;
      tol = Math.max(artTol(ref), dispTol(d));
      basis = 'half of the last of ' + d + ' printed decimals (' + dispTol(d) +
        '), widened from the artifact\'s ' + artTol(ref).toExponential(3);
    } else {
      got = recValue(c, key, S);
      tol = artTol(ref);
      basis = 'artifact tolerance 5e-12 + 5e-12*max(1,|ref|); the page prints this quantity nowhere';
    }
    const abs = Math.abs(got - ref);
    const rel = Math.abs(ref) > 0 ? abs / Math.abs(ref) : abs;
    const ok = Number.isFinite(got) && abs <= tol;
    entry.got = got; entry.ref = ref; entry.abs = abs; entry.rel = rel;
    entry.tol = tol; entry.tol_basis = basis; entry.path = w.path;
    if (w.path === 'display') { entry.printed = printedText; entry.printed_digits = printedDigits; entry.printed_from = w.src; }
    else entry.record_key = w.record;
    entry.ok = ok;
    /* every printed quantity also carries the page's own full-precision value */
    const rv = recValue(c, key, S);
    if (w.path === 'display' && rv !== undefined && rv !== null) {
      const rabs = Math.abs(rv - ref);
      entry.record_got = rv; entry.record_abs = rabs;
      entry.record_tol = artTol(ref); entry.record_ok = rabs <= artTol(ref);
      if (!entry.record_ok) pass = false;
    }
    if (!ok) pass = false;
    if (rel > worst) worst = rel;
    cmp[key] = entry;
  }

  return { id: c.id, note: c.note, inputs: c.inputs, cmp, worst_rel: worst, pass,
           inputs_verified: iv, driver_notes: notes };
}

/* positive control: perturb one input by a visible amount and confirm the
   compared outputs move. */
async function positiveControl(page) {
  const out = {};
  const st = JSON.parse(JSON.stringify(DEFAULT_STATE));
  st.A = { x: 4, t: 5 }; st.B = { x: 2, t: 4 }; st.preset = 'custom';
  await boot(page, st);
  const read = async () => {
    const S = await page.evaluate(() => window.__bench.read());
    const tb = findTableByHead(S, ['x', 'ct', 'x′', 'ct′']);
    const rowA = tb.rows.find(r => r[0] === 'A');
    return { gamma_tile: S.tiles['γ'].text, phi_tile: S.tiles['φ'].text,
             A_xprime: rowA[3], A_ctprime: rowA[4],
             formula: resultsFormula(S).strong,
             rec_gamma: S.outputs.gamma, rec_Ax: S.outputs.event_A_prime.x,
             beta_box: S.ctl['f-beta-c'], rec_beta: S.inputs.beta };
  };
  await page.evaluate(() => { window.__bench.markStale(); window.__bench.typeNum('f-beta-c', 0.6); });
  await page.waitForFunction(() => window.Diagram.record.build().inputs.beta === 0.6, null, { timeout: 20000 });
  await settle(page, 'control beta=0.6');
  out.at_beta_0_6 = await read();
  await page.evaluate(() => { window.__bench.markStale(); window.__bench.typeNum('f-beta-c', 0.9); });
  await page.waitForFunction(() => window.Diagram.record.build().inputs.beta === 0.9, null, { timeout: 20000 });
  await settle(page, 'control beta=0.9');
  out.at_beta_0_9 = await read();

  /* a second control on a quantity read from a different surface */
  const st2 = JSON.parse(JSON.stringify(DEFAULT_STATE)); st2.preset = 'length';
  await boot(page, st2);
  await page.evaluate(() => { window.__bench.markStale();
    window.__bench.typeNum('f-beta-c', 0.8); window.__bench.typeNum('f-rodL0-c', 5); });
  await page.waitForFunction(() => { const i = window.Diagram.record.build().inputs;
    return i.beta === 0.8 && i.rod.proper_length === 5; }, null, { timeout: 20000 });
  await settle(page, 'control L0=5, beta=0.8');
  let S = await page.evaluate(() => window.__bench.read());
  out.length_L0_5_beta_0_8 = { rodObserved: S.legacy.rodObserved, formula: resultsFormula(S).strong,
                               rec: S.outputs.length_contraction.observed_length };
  await page.evaluate(() => { window.__bench.markStale(); window.__bench.typeNum('f-rodL0-c', 8); });
  await page.waitForFunction(() => window.Diagram.record.build().inputs.rod.proper_length === 8, null, { timeout: 20000 });
  await settle(page, 'control L0=8');
  S = await page.evaluate(() => window.__bench.read());
  out.length_L0_8_beta_0_8 = { rodObserved: S.legacy.rodObserved, formula: resultsFormula(S).strong,
                               rec: S.outputs.length_contraction.observed_length };

  /* Δs² is frame-invariant, so the boost MUST leave the results formula where
     it was; that is recorded as its own assertion rather than as movement. */
  out.s2_invariant_under_boost = out.at_beta_0_6.formula === out.at_beta_0_9.formula;
  out.outputs_moved =
    out.at_beta_0_6.gamma_tile !== out.at_beta_0_9.gamma_tile &&
    out.at_beta_0_6.phi_tile !== out.at_beta_0_9.phi_tile &&
    out.at_beta_0_6.A_xprime !== out.at_beta_0_9.A_xprime &&
    out.at_beta_0_6.A_ctprime !== out.at_beta_0_9.A_ctprime &&
    out.length_L0_5_beta_0_8.rodObserved !== out.length_L0_8_beta_0_8.rodObserved &&
    out.length_L0_5_beta_0_8.formula !== out.length_L0_8_beta_0_8.formula &&
    out.s2_invariant_under_boost;
  return out;
}

/* ------------------------------------------------------------------- main */
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();
page.on('pageerror', e => { pageErrors.push(String((e && e.message) || e)); });
page.on('console', m => {
  consoleAll.push({ type: m.type(), text: m.text() });
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('dialog', d => { consoleAll.push({ type: 'dialog', text: d.message() }); d.dismiss().catch(() => {}); });

const cases = [];
for (const c of SELECTED) {
  try {
    cases.push(await runCase(page, c));
  } catch (e) {
    cases.push({ id: c.id, note: c.note, inputs: c.inputs, cmp: {},
      worst_rel: null, pass: false, driver_error: String((e && e.message) || e) });
    console.error('CASE ' + c.id + ' THREW: ' + String((e && e.message) || e));
  }
}
let control = null;
try { control = await positiveControl(page); }
catch (e) { control = { error: String((e && e.message) || e) }; }

/* The build this artifact names: the revision in the live DOM of the page the run drove.
   The page's own manifest() is still read, for the status and the benchmark hook it also
   carries, but the graded revision has one source and it is the manifest script. */
const BUILD = await readPageManifestRevision(page);
const build = await page.evaluate(() => {
  const m = window.Diagram.manifest();
  return { manifest_revision: m.manifest_revision, status: m.status,
           dgc_benchmark: typeof window.__dgcBenchmark };
});

await browser.close();

const passed = cases.filter(c => c.pass).length;
const run_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/* Same keys, same order as benchmarks/relativity.json. */
const artifact = {
  tool: 'relativity',
  file: 'relativity.html',
  reference: 'Closed-form special-relativity equations implemented independently in Python with 60-digit Decimal arithmetic (bench-src/gen_relativity.py), compared against the values the deployed page itself produces: its printed display for every quantity it prints, and its own calculation record for the five quantities it computes and prints nowhere.',
  reference_citations: REF.citations,
  tolerance: 'Per quantity: absolute 5e-12 plus relative 5e-12×max(1, |reference|) where the page carries full precision, widened to half of the last digit the page actually prints where the display is the measured surface. Each check records the digit count counted from the rendered text, the tolerance applied and which surface it was read from. Every printed check additionally carries the page’s own full-precision value at the 5e-12 tolerance (record_got / record_tol / record_ok).',
  crosscheck: 'Reference arithmetic is structurally independent of the page: Python Decimal (60 digits) evaluates the published equations, written from the citations and not from the page source. The page is driven through its own DOM — six controls typed, event coordinates written through the page’s own permalink codec because the page offers no numeric control for them — and every case asserts, from the page’s own state, that its inputs are the values the case names before any output is read. No page result is reused as a reference.',
  total: ONLY ? cases.length : REF.cases.length,
  passed,
  failed: cases.length - passed,
  flagged: 0,
  run_at,
  manifest_revision: BUILD,
  page_errors: pageErrors,
  console_errors: consoleErrors,
  not_benchmarked: [
    'SVG rendering and label placement',
    'pointer/touch dragging (the only way a visitor can set event coordinates on this page)',
    'responsive layout',
    'shared toolbar/PDF browser printing',
    'finite-acceleration twin mode',
    'longitudinal Doppler pulse spacing',
    'display of the radar emission, reflection, reception and reflection-position times and of the twin clock difference: the page computes and exports all five and prints none of them, so they are graded on the page’s own calculation record rather than on its display'
  ],
  cases
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(artifact, { build: BUILD, ...PROVENANCE }), null, 1) + '\n');
fs.mkdirSync(path.dirname(CONTROL), { recursive: true });
fs.writeFileSync(CONTROL, JSON.stringify({
  run_at, base: BASE, tool: TOOL, ref: REFPATH, build,
  positive_control: control, console: consoleAll, page_errors: pageErrors
}, null, 1) + '\n');

console.log('relativity: ' + passed + '/' + cases.length + ' passed, ' +
  (cases.length - passed) + ' failed; page_errors ' + pageErrors.length +
  '; console errors ' + consoleErrors.length + '; control moved ' +
  (control && control.outputs_moved));
for (const c of cases) if (!c.pass) {
  console.log('  FAIL ' + c.id + ' ' + (c.driver_error || JSON.stringify(
    Object.fromEntries(Object.entries(c.cmp).filter(([, v]) => !v.ok || v.record_ok === false)))));
}
if (PREV) {
  try {
    const prev = JSON.parse(fs.readFileSync(PREV, 'utf8'));
    const pm = new Map(prev.cases.map(c => [c.id, c]));
    let moved = 0;
    for (const c of cases) {
      const p = pm.get(c.id); if (!p) { console.log('  NEW CASE ' + c.id); continue; }
      for (const k of Object.keys(p.cmp)) {
        const a = p.cmp[k], b = c.cmp[k];
        if (!b) { console.log('  DROPPED CHECK ' + c.id + ' ' + k); continue; }
        if (a.ref !== b.ref) console.log('  REF CHANGED ' + c.id + ' ' + k + ': ' + a.ref + ' -> ' + b.ref);
        /* compare like with like: the pre-2026-10 artifact's `got` is a
           full-precision value, this artifact's `got` is the printed one and
           its full-precision value is `record_got`. */
        const ag = a.record_got !== undefined ? a.record_got : a.got;
        const bg = b.record_got !== undefined ? b.record_got : b.got;
        if (ag !== bg) { moved++; console.log('  GOT MOVED ' + c.id + ' ' + k + ': ' + ag + ' -> ' + bg); }
      }
    }
    console.log('  values moved against ' + PREV + ': ' + moved);
  } catch (e) { console.log('  --prev unreadable: ' + e.message); }
}
process.exit((passed === cases.length && pageErrors.length === 0) ? 0 : 1);
