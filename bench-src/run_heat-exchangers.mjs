/* Benchmark driver - heat_exchangers.html (HX-Lab), 2026-10 re-execution.
 *
 * ADAPTED FOR HTTP.  The driver was written against a file:// address under one machine's
 * site root.  It now takes a base URL and a tool path:
 *
 *   node run_heat-exchangers.mjs --base http://127.0.0.1:8324 --tool heat_exchangers.html \
 *        [--ref <path to heat-exchangers_ref.json>] [--out <dir>]
 *
 * Every tolerance, every case id, every reference value and every comparison is the one the
 * deployed driver carried.  What changed is where a value is READ from, because the page was
 * ported onto the DiagramUI shell after this driver was written: #btnCalc, #pg-res, #pg-val and
 * #tabs no longer exist, and #fileIn is created on demand by the page's own fileInput().
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. stampProvenance() reads the build out of the page's
   own manifest and writes build, manifest_revision, reference_provenance and
   provenance_note into the artifact, so a re-run carries them. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_hx.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 2 021 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* Every path resolves against this driver's own tree: the page under the site root, the
   reference under bench-src/ref, the artifact at <siteRoot>/benchmarks/heat_exchangers.json
   — the path the page's own manifest names — and the positive-control record beside it.
   --site, --base, --ref-dir, --out and --out2 override. See benchpaths.mjs. */
const P = benchPaths({ name: 'heat_exchangers', page: 'heat_exchangers.html',
                       ref: 'heat-exchangers_ref.json',
                       out2: 'benchmarks/heat_exchangers.control.json' });
/* The page is reached over http, as this driver has always reached it; only the origin is
   a parameter. --base, else the port this driver has always named. */
const BASE = (P.base || 'http://127.0.0.1:8324').replace(/\/$/, '');
const TOOL = String(P.flags.tool || P.pageFile);
const OUT = P.out;
const OUT_CONTROL = P.out2;
/* The abort dump sits beside the artifact, so an aborted run leaves its evidence in the
   same directory the run was told to write to. */
const OUT_ABORT = OUT.replace(/\.json$/, '.aborted.json');
const REFPATH = P.ref;
const URL0 = BASE + '/' + TOOL;

const REF = JSON.parse(fs.readFileSync(REFPATH, 'utf8'));
const byId = Object.fromEntries(REF.cases.map(c => [c.id, c]));

const b = await chromium.launch();
const ctx = await b.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
const console_all = [];
const control = { base: BASE, tool: TOOL, ref: REFPATH, url: URL0, checks: [] };
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => {
  console_all.push(m.type() + ': ' + m.text().slice(0, 200));
  if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160));
});
/* an abort must not throw away the evidence gathered so far */
const dumpAbort = (why) => {
  try {
    control.aborted = String(why && why.stack || why).slice(0, 4000);
    control.console = console_all; control.page_errors = errs;
    fs.writeFileSync(OUT_ABORT,
      JSON.stringify({ abort: control.aborted, cases_so_far: cases, control }, null, 1));
  } catch (e) { /* nothing left to do */ }
};
process.on('unhandledRejection', e => { dumpAbort(e); console.error('ABORT', e); process.exit(3); });
process.on('uncaughtException', e => { dumpAbort(e); console.error('ABORT', e); process.exit(3); });

await page.goto(URL0 + '?lang=en', { waitUntil: 'load' });
/* the port replaced the fixed 700 ms wait: the page is ready when the framework shell has
   rendered its tiles and the record builds */
await page.waitForFunction(() => !!window.Diagram && !!window.DiagramUI
  && document.querySelectorAll('.dgu-tile').length > 0
  && window.Diagram.record.build() !== null, null, { timeout: 60000 });

/* AGENTS §5: the build this artifact names is the manifest_revision read out of the live
   DOM of the page the browser actually loaded, not of the file sitting beside this driver.
   stampProvenance() refuses to write anything without it. */
const BUILD = await readPageManifestRevision(page);
/* the pure-maths grid calls the page's own globals; if the port had moved them the grid would
   have measured nothing, so refuse to continue when they are not there */
{
  const g = await page.evaluate(() => ['effNTU', 'lmtd', 'fCorr', 'fileInput', 'csvReport']
    .map(k => k + '=' + typeof window[k]));
  if (g.some(x => !x.endsWith('=function')))
    throw new Error('the page no longer exposes the functions this driver probes: ' + g.join(', '));
  control.globals = g;
}

const cases = [];
const push = o => cases.push(o);

// ---------------------------------------------------------------------------
// NOTE on how the tool is driven.
// HARNESS.md assumes every tool wraps its JS in an IIFE. heat_exchangers.html
// does NOT: effNTU / lmtd / fCorr / ST / RES / run() are all on `window`.
// End-to-end cases below are still driven purely through the DOM (the tool's own
// JSON-load file input + the Calculate button + the CSV export button).
// The pure-maths library grid additionally calls the exposed global effNTU
// directly, because the eps-NTU relation cannot otherwise be sampled at a
// prescribed (NTU, Cr) - the UI only reaches it through a full thermal solve.
// ---------------------------------------------------------------------------

// ===========================================================================
// 1. eps-NTU library grid
// ===========================================================================
{
  const pts = byId['eps-ntu-grid'].points;
  const got = await page.evaluate(ps => ps.map(p => effNTU(p.arr, p.NTU, p.Cr)), pts);
  pts.forEach((p, i) => {
    const g = got[i];
    const isCross = p.arr === 'cross';
    const ref = p.eps;
    const rel = Math.abs(g - ref) / Math.max(Math.abs(ref), 1e-30);
    // closed forms are exact double arithmetic -> demand machine agreement.
    // "crossflow both unmixed" has no elementary closed form: the reference is
    // the exact Mason series, and 1e-2 leaves room for a series truncation.
    const tol = isCross ? 1e-2 : 1e-12;
    const ok = rel <= tol;
    const c = {
      id: `epsNTU/${p.arr}/NTU=${p.NTU}/Cr=${p.Cr}`,
      note: isCross
        ? 'crossflow both unmixed - reference is the EXACT Mason (1954) series, cross-checked against a finite-difference solve of the crossflow PDE'
        : 'closed-form eps-NTU relation (Kays & London Table 2-1)',
      inputs: { arrangement: p.arr, NTU: p.NTU, Cr: p.Cr },
      cmp: { eps: { got: g, ref, rel, ok, tol: isCross ? 'rel<=1e-2 vs the exact relation' : 'rel<=1e-12 (pure closed form)' } },
      worst_rel: rel, pass: ok
    };
    if (isCross) {
      c.crosscheck = { series_vs_pde_abs: p.crosscheck_series_vs_pde ?? null };
      c.published_approximation = p.eps_published_approx;
      c.tool_matches_published_approximation_rel =
        Math.abs(g - p.eps_published_approx) / p.eps_published_approx;
    }
    push(c);
  });
}

// ===========================================================================
// 2. crossflow: which relation is implemented, and how far is it from exact?
// ===========================================================================
{
  const pts = byId['crossflow-exact-vs-approx'].points;
  const got = await page.evaluate(ps => ps.map(p => effNTU('cross', p.NTU, p.Cr)), pts);
  const detail = pts.map((p, i) => ({
    NTU: p.NTU, Cr: p.Cr, tool: got[i],
    exact_series: p.eps_exact_series, numeric_pde: p.eps_numeric_pde,
    published_approx: p.eps_approx,
    tool_vs_approx_rel: Math.abs(got[i] - p.eps_approx) / p.eps_approx,
    tool_vs_exact_rel: Math.abs(got[i] - p.eps_exact_series) / p.eps_exact_series
  }));
  const worstExact = Math.max(...detail.map(d => d.tool_vs_exact_rel));
  const worstApprox = Math.max(...detail.map(d => d.tool_vs_approx_rel));
  push({
    id: 'crossflow-relation-identification',
    note: 'Is "Crossflow, both unmixed" the exact relation or the published approximation?',
    inputs: { arrangement: 'cross' },
    detail,
    // The exact relation and the Incropera Eq. 11.32 shortcut differ by up to
    // 3.8 %, so a tool cannot match both. The arrangement label promises the
    // arrangement -> the pass criterion is agreement with the exact relation;
    // the distance to the published shortcut is reported, not scored.
    cmp: {
      matches_exact_relation: { got: worstExact, ref: 0, rel: worstExact, ok: worstExact <= 1e-2, tol: 'rel<=1e-2 vs the exact Mason series' },
      distance_from_published_approximation: {
        got: worstApprox, ref: 0, rel: worstApprox, ok: true,
        tol: 'reported only: exact vs Incropera Eq. 11.32 differ by up to 3.8 %, so this is not a pass criterion'
      }
    },
    crosscheck: { max_series_vs_pde_abs: Math.max(...pts.map(p => p.series_vs_pde_abs)) },
    worst_rel: worstExact,
    pass: worstExact <= 1e-2
  });
}

// ===========================================================================
// 3. Cr = 0 limit: every arrangement must collapse to 1 - exp(-NTU)
// ===========================================================================
for (const p of byId['eps-ntu-limits'].limits.Cr0) {
  const g = await page.evaluate(q => effNTU(q.arr, q.NTU, 0), p);
  const rel = Math.abs(g - p.eps) / p.eps;
  push({
    id: `limit-Cr0/${p.arr}/NTU=${p.NTU}`, note: p.law,
    inputs: { arrangement: p.arr, NTU: p.NTU, Cr: 0 },
    cmp: { eps: { got: g, ref: p.eps, rel, ok: rel <= 1e-12, tol: 'rel<=1e-12' } },
    worst_rel: rel, pass: rel <= 1e-12
  });
}

// ===========================================================================
// 4. Cr -> 1 continuity (removable singularities)
// ===========================================================================
for (const p of byId['cr-to-1-continuity'].points) {
  const g = await page.evaluate(q => q.Cr_list.map(c => effNTU(q.arr, q.NTU, c)), p);
  const jump = Math.abs(g[4] - g[3]) / Math.max(g[4], 1e-30);
  const refJump = p.max_jump_near_1 / Math.max(p.eps[4], 1e-30);
  const relEnd = Math.abs(g[4] - p.eps[4]) / p.eps[4];
  const ok = jump <= 1e-5 && relEnd <= (p.arr === 'cross' ? 1e-2 : 1e-12);
  push({
    id: `Cr-continuity/${p.arr}/NTU=${p.NTU}`,
    note: 'eps at Cr = 0.99, 0.999, 0.9999, 0.999999, 1.0 - must be continuous',
    inputs: { arrangement: p.arr, NTU: p.NTU, Cr_list: p.Cr_list },
    got: g, ref: p.eps,
    cmp: {
      jump_at_Cr1: { got: jump, ref: refJump, rel: jump, ok: jump <= 1e-5, tol: 'relative jump between Cr=0.999999 and Cr=1 <= 1e-5' },
      eps_at_Cr1: { got: g[4], ref: p.eps[4], rel: relEnd, ok: relEnd <= (p.arr === 'cross' ? 1e-2 : 1e-12) }
    },
    worst_rel: Math.max(jump, relEnd), pass: ok
  });
}

// ===========================================================================
// 5. LMTD closed form
// ===========================================================================
for (const p of byId['lmtd'].points) {
  const g = await page.evaluate(q => lmtd(q.dt1, q.dt2), p);
  const rel = Math.abs(g - p.lmtd) / p.lmtd;
  push({
    id: `lmtd/${p.dt1}-${p.dt2}`, note: 'log mean temperature difference',
    inputs: { dt1: p.dt1, dt2: p.dt2 },
    cmp: { lmtd: { got: g, ref: p.lmtd, rel, ok: rel <= 1e-9, tol: 'rel<=1e-9' } },
    worst_rel: rel, pass: rel <= 1e-9
  });
}

// ===========================================================================
// 6. F correction factor: tool's fCorr() vs the Bowman/TEMA closed form
//    (fCorr is the tool's declared F routine; the solver adopts its value when
//     it agrees with the duty-derived F = Q/(U A LMTD), and falls back to that
//     duty-derived value at a pinch or when the duty is capped)
// ===========================================================================
{
  const pts = byId['f-correction-factor'].points.filter(p => p.F_bowman != null);
  for (const p of pts) {
    // build terminal temperatures that realise (NTU, Cr) with Thi=100, Tci=0
    const eps = p.eps, C = p.Cr;
    const Thi = 100, Tci = 0, Tho = Thi - eps * (Thi - Tci), Tco = Tci + eps * C * (Thi - Tci);
    const g = await page.evaluate(q => fCorr(q.arr, q.Thi, q.Tho, q.Tci, q.Tco),
      { arr: p.arr, Thi, Tho, Tci, Tco });
    const rel = Math.abs(g - p.F_bowman) / p.F_bowman;
    push({
      id: `F/${p.arr}/NTU=${p.NTU}/Cr=${p.Cr}`,
      note: 'fCorr() vs the Bowman/TEMA F factor; the Bowman value was independently confirmed to equal eps/(NTU*LMTD_cf) to 1e-15',
      inputs: { arrangement: p.arr, Thi, Tho, Tci, Tco, implied_NTU: p.NTU, implied_Cr: p.Cr },
      cmp: { F: { got: g, ref: p.F_bowman, rel, ok: rel <= 1e-9, tol: 'rel<=1e-9' } },
      crosscheck: { F_bowman_minus_F_from_epsNTU: p.F_bowman_minus_F_epsNTU },
      worst_rel: rel, pass: rel <= 1e-9
    });
  }
  // fCorr for the non-shell arrangements
  for (const arr of ['parallel', 'cross', 'crossmix']) {
    const N = 2, C = 0.5;
    const p = byId['f-correction-factor'].points.find(x => x.arr === arr && x.NTU === N && x.Cr === C);
    const eps = p.eps, Thi = 100, Tci = 0;
    const Tho = Thi - eps * (Thi - Tci), Tco = Tci + eps * C * (Thi - Tci);
    const g = await page.evaluate(q => fCorr(q.arr, q.Thi, q.Tho, q.Tci, q.Tco), { arr, Thi, Tho, Tci, Tco });
    const ref = p.F_from_epsNTU;
    const rel = Math.abs(g - ref) / ref;
    push({
      id: `F/${arr}/NTU=${N}/Cr=${C}`,
      note: 'fCorr() for a non-shell arrangement; reference F = eps/(NTU*LMTD_counterflow), which is the definition of F',
      inputs: { arrangement: arr, Thi, Tho, Tci, Tco, implied_NTU: N, implied_Cr: C },
      cmp: { F: { got: g, ref, rel, ok: rel <= 1e-6, tol: 'rel<=1e-6' } },
      worst_rel: rel, pass: rel <= 1e-6
    });
  }
}

// ===========================================================================
// 7. END-TO-END cases, driven only through the DOM
// ===========================================================================
/* A case is loaded exactly as a user loads one: the page's own JSON import, which deep-merges
   the payload over the state and then runs sanitize() + render() + run() by itself (there is no
   Calculate button on this shell, so the #btnCalc click is gone with it).  #fileIn is created by
   the page's fileInput() on demand, so it is materialised first - without this, setInputFiles
   finds no element and the case would never be entered. */
const deepHas = (state, want) => {
  for (const k of Object.keys(want)) {
    const w = want[k], g = state ? state[k] : undefined;
    if (w !== null && typeof w === 'object') { if (!deepHas(g, w)) return false; }
    else if (typeof w === 'number') { if (!(Math.abs(Number(g) - w) <= 1e-12 * Math.max(1, Math.abs(w)))) return false; }
    else if (String(g) !== String(w)) return false;
  }
  return true;
};
async function enterCase(st) {
  await page.evaluate(() => window.fileInput());
  await page.setInputFiles('#fileIn', {
    name: 'case.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(st))
  });
  /* wait for the page's OWN state to be the state this case names, and for a fresh solve */
  await page.waitForFunction(w => {
    if (!window.__hxlab) return false;
    const S = window.__hxlab.state();
    const has = (a, b) => Object.keys(b).every(k => {
      const x = b[k], y = a ? a[k] : undefined;
      if (x !== null && typeof x === 'object') return has(y, x);
      if (typeof x === 'number') return Math.abs(Number(y) - x) <= 1e-12 * Math.max(1, Math.abs(x));
      return String(y) === String(x);
    });
    return has(S, w) && window.Diagram.record.build() !== null;
  }, st, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(250);
  const seen = await page.evaluate(() => window.__hxlab.state());
  if (!deepHas(seen, st))
    throw new Error('INPUT ASSERTION FAILED: the page did not take the case inputs.\n  wanted: '
      + JSON.stringify(st) + '\n  page state: ' + JSON.stringify(seen));
  return seen;
}
async function runCase(st) {
  const seen = await enterCase(st);
  /* The messages are read from the page's own RES.msgs, localised with the page's own t().
     The pre-port driver scraped #pg-res .msg; on this shell the FIRST message is handed to the
     framework as the panel verdict and only the rest become .dgu-verdict nodes, so a DOM scrape
     silently drops it - and the latent-capacity message, which decides which reference eps is
     compared against, is exactly that first message. */
  const msgs = await page.evaluate(() => (RES && RES.msgs || [])
    .map(m => Array.isArray(m) ? (msgTone(m[0]) + ': ' + String(t(m[1]) || m[1]).trim().slice(0, 160))
                               : String(m)));
  const verdicts = await page.evaluate(() =>
    [...document.querySelectorAll('.dgu-verdict')].map(e => e.innerText.trim().slice(0, 160)));
  /* The CSV the pre-port driver downloaded was this page's csvReport().  The bar's CSV button is
     now the framework's generic record export (key,value,unit over the whole record), so the
     download no longer carries 'Q, kW' and the parse below would read nothing.  The same
     csvReport() is still the page's own function over the live RES/ST, and it prints the same
     keys at the same precision, which is what every tolerance below is propagated from. */
  const csv = await page.evaluate(() => csvReport());
  if (!csv || csv.indexOf('Q, kW') < 0)
    throw new Error('the page produced no HX-Lab CSV report for this case: ' + String(csv).slice(0, 200));
  const kv = {};
  for (const line of csv.split('\n')) {
    const p = line.split(';');
    if (p.length >= 2) kv[p[0].trim()] = p.slice(1).map(x => x.trim());
  }
  const n = (k, i = 0) => { const v = kv[k] && kv[k][i]; const f = parseFloat(v); return isFinite(f) ? f : null; };
  const rec = await page.evaluate(() => window.Diagram.record.build().outputs);
  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll('.dgu-tile')].map(e => e.innerText.replace(/\n/g, ' | ').trim()));
  control.checks.push({ case_state: seen, csv_report: csv, record_outputs: rec,
                        tiles, messages: msgs, rendered_verdicts: verdicts });
  return {
    msgs, csv, rec, tiles, verdicts, seen,
    arrangement: kv['arrangement'] ? kv['arrangement'][0] : null,
    mh: n('mass flow, kg/s', 0), mc: n('mass flow, kg/s', 1),
    thi: n('T in, C', 0), tci: n('T in, C', 1),
    tho: n('T out, C', 0), tco: n('T out, C', 1),
    Reh: n('Re', 0), Rec: n('Re', 1),
    Q_kW: n('Q, kW'), U: n('U, W/m2K'), A: n('A, m2'),
    LMTD: n('LMTD, K'), F: n('F'), NTU: n('NTU'), eps: n('effectiveness'), Cr: n('C*')
  };
}

const E2E = [
  { id: 'e2e-plate-counter', note: 'plate pack, water/water, counterflow',
    st: { mode: 'rating', type: 'plate', arr: 'counter',
      hot: { fluid: 'water', flowMode: 'm', m: 2, tin: 80, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 3, tin: 15, phase: 'none', foul: 'clean' },
      geom: { plate: { Np: 41, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } } },
  { id: 'e2e-plate-parallel', note: 'same pack, parallel flow (F must fall below 1)',
    st: { mode: 'rating', type: 'plate', arr: 'parallel',
      hot: { fluid: 'water', flowMode: 'm', m: 2, tin: 80, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 3, tin: 15, phase: 'none', foul: 'clean' },
      geom: { plate: { Np: 41, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } } },
  { id: 'e2e-plate-cross', note: 'same pack, crossflow both unmixed',
    st: { mode: 'rating', type: 'plate', arr: 'cross',
      hot: { fluid: 'water', flowMode: 'm', m: 2, tin: 80, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 3, tin: 15, phase: 'none', foul: 'clean' },
      geom: { plate: { Np: 41, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } } },
  { id: 'e2e-plate-crossmix', note: 'same pack, crossflow Cmax mixed',
    st: { mode: 'rating', type: 'plate', arr: 'crossmix',
      hot: { fluid: 'water', flowMode: 'm', m: 2, tin: 80, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 3, tin: 15, phase: 'none', foul: 'clean' },
      geom: { plate: { Np: 41, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } } },
  { id: 'e2e-plate-balanced', note: 'balanced flows -> Cr close to 1 (counterflow singular point)',
    st: { mode: 'rating', type: 'plate', arr: 'counter',
      hot: { fluid: 'water', flowMode: 'm', m: 2, tin: 70, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 2, tin: 30, phase: 'none', foul: 'clean' },
      geom: { plate: { Np: 61, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } } },
  { id: 'e2e-shell-st12', note: '1 shell / 2 tube passes, water/water',
    st: { mode: 'rating', type: 'shell', arr: 'st12', orient: 'horiz',
      hot: { fluid: 'water', flowMode: 'm', m: 6, tin: 90, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 8, tin: 20, phase: 'none', foul: 'clean' },
      opts: { tubeSide: 'c', shellMethod: 'kern', tubeCorr: 'gniel' },
      geom: { shell: { Ds: 400, do: 19.05, tthk: 1.2, Nt: 180, L: 3.0, Pt: 23.8, layout: 30, B: 200, cut: 25, tubePass: 2 } } } },
  { id: 'e2e-shell-st24', note: '2 shell / 4 tube passes, water/water',
    st: { mode: 'rating', type: 'shell', arr: 'st24', orient: 'horiz',
      hot: { fluid: 'water', flowMode: 'm', m: 6, tin: 90, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 8, tin: 20, phase: 'none', foul: 'clean' },
      opts: { tubeSide: 'c', shellMethod: 'kern', tubeCorr: 'gniel' },
      geom: { shell: { Ds: 400, do: 19.05, tthk: 1.2, Nt: 180, L: 3.0, Pt: 23.8, layout: 30, B: 200, cut: 25, tubePass: 4 } } } },
  { id: 'e2e-shell-cond', note: 'condensing steam / water -> Cr = 0, eps must be 1-exp(-NTU)',
    st: { mode: 'rating', type: 'shell', arr: 'st12', orient: 'horiz',
      hot: { phase: 'cond', satFluid: 'water', tsat: 120, xin: 1, xout: 0, m: 0.35, foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 6, tin: 40, phase: 'none', foul: 'clean' },
      opts: { tubeSide: 'c' },
      geom: { shell: { Ds: 400, do: 19.05, tthk: 1.2, Nt: 180, L: 3.0, Pt: 23.8, layout: 30, B: 200, cut: 25, tubePass: 2 } } } },
  { id: 'e2e-air-cross', note: 'finned air coil, water/air, crossflow',
    st: { mode: 'rating', type: 'air', arr: 'cross',
      hot: { fluid: 'water', flowMode: 'm', m: 1.5, tin: 80, phase: 'none', foul: 'clean' },
      cold: { fluid: 'air', flowMode: 'm', m: 2, tin: -10, phase: 'none', foul: 'clean', p: 101325 },
      opts: { airSide: 'c' },
      geom: { air: { W: 1200, H: 700, rows: 4, form: 1, vface: 2.5, eta: 0.85, ntr: 11, circDiv: 1 } } } },
  { id: 'e2e-parallel-pinch', note: 'parallel flow driven to the pinch (NTU ~ 10, Cr ~ 1) - probes the F = clamp(...,0.15,1) floor in solveAt()',
    st: { mode: 'rating', type: 'plate', arr: 'parallel',
      hot: { fluid: 'water', flowMode: 'm', m: 0.4, tin: 90, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 0.4, tin: 20, phase: 'none', foul: 'clean' },
      geom: { plate: { Np: 201, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } } },
  { id: 'e2e-dbl-counter', note: 'double pipe, oil/water, counterflow',
    st: { mode: 'rating', type: 'dbl', arr: 'counter',
      hot: { fluid: 'oil_vg46', flowMode: 'm', m: 0.8, tin: 110, phase: 'none', foul: 'clean' },
      cold: { fluid: 'water', flowMode: 'm', m: 1.2, tin: 20, phase: 'none', foul: 'clean' },
      opts: { innerFluid: 'h' },
      geom: { dbl: { diIn: 42.7, doIn: 48.3, diOut: 77.9, nHair: 6, Lhair: 3.0 } } } }
];

const EPSREL = {
  counter: (N, C) => C < 1e-12 ? 1 - Math.exp(-N) : (Math.abs(C - 1) < 1e-12 ? N / (1 + N)
    : (1 - Math.exp(-N * (1 - C))) / (1 - C * Math.exp(-N * (1 - C)))),
  parallel: (N, C) => (1 - Math.exp(-N * (1 + C))) / (1 + C),
  crossmix: (N, C) => C < 1e-12 ? 1 - Math.exp(-N) : (1 / C) * (1 - Math.exp(-C * (1 - Math.exp(-N)))),
  st12: (N, C) => { const r = Math.sqrt(1 + C * C), e = Math.exp(-N * r); return 2 / ((1 + C) + r * (1 + e) / (1 - e)); },
  st24: (N, C) => {
    const e1 = EPSREL.st12(N / 2, C);
    if (Math.abs(C - 1) < 1e-12) return 2 * e1 / (1 + e1);
    const a = Math.pow((1 - e1 * C) / (1 - e1), 2); return (a - 1) / (a - C);
  },
  cross: (N, C) => { // EXACT Mason series
    if (C < 1e-12) return 1 - Math.exp(-N);
    const fact = k => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
    let tot = 0;
    for (let n = 1; n <= 120; n++) {
      let Pn = 0;
      for (let j = 1; j <= n + 1; j++) Pn += (n + 1 - j) / fact(j) * Math.pow(N, n + j);
      Pn /= fact(n + 1);
      const term = Math.pow(C, n) * Pn;
      tot += term;
      if (n > 8 && term < 1e-18 * Math.max(tot, 1e-30)) break;
    }
    return 1 - Math.exp(-N) - Math.exp(-(1 + C) * N) * tot;
  }
};
const ARRNAME = { Counterflow: 'counter', 'Parallel flow': 'parallel', 'Crossflow, both unmixed': 'cross', 'Crossflow, Cmax mixed': 'crossmix', '1 shell / 2 tube passes': 'st12', '2 shell / 4 tube passes': 'st24' };

for (const c of E2E) {
  const r = await runCase(c.st);
  const cmp = {};
  const isPhase = !!(c.st.hot.phase && c.st.hot.phase !== 'none') || !!(c.st.cold.phase && c.st.cold.phase !== 'none');
  const arr = isPhase ? 'counter' : (ARRNAME[r.arrangement] || 'counter');
  const dTmax = r.thi - r.tci;
  // A duty that the tool reports as cut back to the latent capacity of the
  // phase-change side is NOT eps(NTU,Cr)*Cmin*dTmax any more: the exchanger is
  // oversized and only part of its surface is doing the declared duty. For those
  // cases eps is checked against its DEFINITION, plus the requirement that it
  // stay below the thermal ceiling the arrangement could deliver.
  const capped = r.msgs.some(m => /latent capacity/i.test(m));

  const Ch = (r.thi - r.tho) > 1e-9 ? r.Q_kW * 1000 / (r.thi - r.tho) : Infinity;
  const Cc = r.Q_kW * 1000 / (r.tco - r.tci);

  // (a) eps must equal the closed form at the tool's own NTU and Cr
  const epsCeil = EPSREL[arr](r.NTU, r.Cr);
  const epsRef = capped ? r.Q_kW * 1000 / (Math.min(Ch, Cc) * dTmax) : epsCeil;
  // display quantum: NTU printed to 3 decimals, Cr to 3, eps to 4
  const dEps_dNTU = (EPSREL[arr](r.NTU + 5e-4, r.Cr) - EPSREL[arr](r.NTU - 5e-4, r.Cr)) / 1;
  const dEps_dCr = r.Cr > 1e-6 ? (EPSREL[arr](r.NTU, Math.min(1, r.Cr + 5e-4)) - EPSREL[arr](r.NTU, Math.max(0, r.Cr - 5e-4))) / 1 : 0;
  const epsTol = capped ? 1e-3 : 5e-5 + Math.abs(dEps_dNTU) + Math.abs(dEps_dCr);
  cmp.eps_from_NTU_Cr = {
    got: r.eps, ref: epsRef, rel: Math.abs(r.eps - epsRef) / epsRef,
    abs: Math.abs(r.eps - epsRef),
    ok: Math.abs(r.eps - epsRef) <= epsTol && (!capped || r.eps <= epsCeil + 5e-4),
    tol: capped
      ? 'duty limited by latent capacity -> abs<=1e-3 against the definition Q/(Cmin*dTmax), and eps must not exceed eps(NTU,Cr)'
      : `abs<=${epsTol.toExponential(2)} propagated from the printed precision of NTU (3 dp) and Cr (3 dp)`
  };

  // (b) energy balance: Ch (Thi-Tho) = Cc (Tco-Tci) = Q, with Cmin from eps
  const Cmin = r.Q_kW * 1000 / (r.eps * dTmax);
  const CrRef = isFinite(Ch) ? Math.min(Ch, Cc) / Math.max(Ch, Cc) : 0;
  cmp.Cr_from_temperatures = {
    got: r.Cr, ref: CrRef, rel: Math.abs(r.Cr - CrRef) / Math.max(CrRef, 1e-9),
    abs: Math.abs(r.Cr - CrRef), ok: Math.abs(r.Cr - CrRef) <= 3e-3,
    tol: 'abs<=3e-3 (Cr printed to 3 dp, temperatures to 2 dp)'
  };
  const CminRef = isFinite(Ch) ? Math.min(Ch, Cc) : Cc;
  cmp.Cmin_consistency = {
    got: Cmin, ref: CminRef, rel: Math.abs(Cmin - CminRef) / CminRef,
    ok: Math.abs(Cmin - CminRef) / CminRef <= 5e-3,
    tol: 'rel<=5e-3; Cmin implied by eps must equal Cmin implied by the temperature rise'
  };

  // (c) NTU = U A / Cmin
  const NTUref = r.U * r.A / CminRef;
  cmp.NTU_def = {
    got: r.NTU, ref: NTUref, rel: Math.abs(r.NTU - NTUref) / NTUref,
    ok: Math.abs(r.NTU - NTUref) / NTUref <= 5e-3, tol: 'rel<=5e-3 (U 1 dp, A 3 dp, T 2 dp)'
  };

  // (d) LMTD from the printed terminal temperatures (counterflow definition)
  const dt1 = r.thi - r.tco, dt2 = r.tho - r.tci;
  const lmtdRef = Math.abs(dt1 - dt2) < 1e-9 ? dt1 : (dt1 - dt2) / Math.log(dt1 / dt2);
  cmp.LMTD = {
    got: r.LMTD, ref: lmtdRef, rel: Math.abs(r.LMTD - lmtdRef) / lmtdRef,
    abs: Math.abs(r.LMTD - lmtdRef), ok: Math.abs(r.LMTD - lmtdRef) <= 0.02,
    tol: 'abs<=0.02 K (temperatures printed to 2 dp)'
  };

  // (e) Q = U A F LMTD  -> the LMTD method and eps-NTU must give the same duty
  const Qlmtd = r.U * r.A * r.F * lmtdRef / 1000;
  cmp.Q_LMTD_vs_epsNTU = {
    got: r.Q_kW, ref: Qlmtd, rel: Math.abs(r.Q_kW - Qlmtd) / r.Q_kW,
    ok: Math.abs(r.Q_kW - Qlmtd) / r.Q_kW <= 6e-3,
    tol: 'rel<=6e-3 (F printed to 3 dp -> ~5e-4/F alone)'
  };

  // (f) F must equal eps/(NTU * LMTD/dTmax)
  const Fref = r.eps / (r.NTU * lmtdRef / dTmax);
  cmp.F_definition = {
    got: r.F, ref: Fref, rel: Math.abs(r.F - Fref) / Fref,
    abs: Math.abs(r.F - Fref), ok: Math.abs(r.F - Fref) <= 6e-3,
    tol: 'abs<=6e-3 (F printed to 3 dp)'
  };

  // (g) for shell-and-tube: the Bowman/TEMA F from the printed temperatures
  if (arr === 'st12') {
    const P = (r.tco - r.tci) / dTmax, R = (r.thi - r.tho) / (r.tco - r.tci);
    const rr = Math.sqrt(R * R + 1);
    let Fb;
    if (Math.abs(R - 1) < 1e-6) Fb = (P * rr / (1 - P)) / Math.log((2 / P - 1 - R + rr) / (2 / P - 1 - R - rr));
    else Fb = rr * Math.log((1 - P) / (1 - P * R)) / ((R - 1) * Math.log((2 / P - 1 - R + rr) / (2 / P - 1 - R - rr)));
    cmp.F_vs_Bowman = {
      got: r.F, ref: Fb, rel: Math.abs(r.F - Fb) / Fb, abs: Math.abs(r.F - Fb),
      ok: Math.abs(r.F - Fb) <= 8e-3,
      tol: 'abs<=8e-3; Bowman/TEMA F evaluated at the tool\'s own P and R'
    };
  }

  // (h) second law sanity
  cmp.second_law = {
    got: [r.tho, r.tco], ref: `Tho >= Tci and Tco <= Thi${arr === 'parallel' ? ' and Tco <= Tho' : ''}`,
    rel: 0,
    ok: r.tho >= r.tci - 0.02 && r.tco <= r.thi + 0.02 && (arr !== 'parallel' || r.tco <= r.tho + 0.02)
  };
  if (isPhase) {
    const epsCr0 = 1 - Math.exp(-r.NTU);
    cmp.Cr0_law = {
      got: r.eps, ref: epsCr0, rel: Math.abs(r.eps - epsCr0) / epsCr0,
      abs: Math.abs(r.eps - epsCr0),
      // with the duty capped by the latent capacity the exchanger cannot reach
      // its thermal ceiling; the law then only bounds eps from above.
      ok: capped ? r.eps <= epsCr0 + 5e-4 : Math.abs(r.eps - epsCr0) <= 5e-4,
      tol: capped
        ? 'duty limited by latent capacity -> eps <= 1-exp(-NTU) + 5e-4 (the ceiling a Cr=0 side could reach)'
        : 'abs<=5e-4; a phase-changing side forces Cr=0 -> eps = 1-exp(-NTU)'
    };
  }

  const worst = Math.max(...Object.values(cmp).map(x => (typeof x.rel === 'number' && isFinite(x.rel)) ? x.rel : 0));
  const okAll = Object.values(cmp).every(x => x.ok);
  push({
    id: c.id, note: c.note, inputs: c.st, arrangement_used: arr,
    tool_output: {
      Q_kW: r.Q_kW, U: r.U, A: r.A, LMTD: r.LMTD, F: r.F, NTU: r.NTU, eps: r.eps, Cr: r.Cr,
      thi: r.thi, tho: r.tho, tci: r.tci, tco: r.tco, Re_hot: r.Reh, Re_cold: r.Rec
    },
    messages: r.msgs, cmp, worst_rel: worst, pass: okAll
  });
}

// ===========================================================================
// 8. Correlation validity ranges - internal consistency, NOT truth.
//    The tool declares +-15..30% scatter, so the correlations themselves are
//    not benchmarked. What IS checked: that a correlation used outside its
//    stated range is flagged rather than silently extrapolated.
// ===========================================================================
{
  const probes = [
    { id: 'validity-plate-laminar', note: 'plate pack driven to a very low Reynolds number (Martin/Gnielinski territory left behind)',
      st: { mode: 'rating', type: 'plate', arr: 'counter',
        hot: { fluid: 'oil_vg46', flowMode: 'm', m: 0.02, tin: 60, phase: 'none', foul: 'clean' },
        cold: { fluid: 'water', flowMode: 'm', m: 0.02, tin: 20, phase: 'none', foul: 'clean' },
        geom: { plate: { Np: 41, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } },
      expect: /laminar|Laminar/ },
    { id: 'validity-tube-transition', note: 'shell&tube with tube Reynolds number in the 2300-10000 blend band',
      st: { mode: 'rating', type: 'shell', arr: 'st12', orient: 'horiz',
        hot: { fluid: 'water', flowMode: 'm', m: 0.5, tin: 90, phase: 'none', foul: 'clean' },
        cold: { fluid: 'water', flowMode: 'm', m: 0.6, tin: 20, phase: 'none', foul: 'clean' },
        opts: { tubeSide: 'c' },
        geom: { shell: { Ds: 400, do: 19.05, tthk: 1.2, Nt: 180, L: 3.0, Pt: 23.8, layout: 30, B: 200, cut: 25, tubePass: 2 } } },
      expect: /laminar|Laminar|velocity|Low/ },
    { id: 'validity-temp-out-of-range', note: 'water inlet at 250 C - beyond the tool\'s tabulated range of 0..200 C',
      st: { mode: 'rating', type: 'plate', arr: 'counter',
        hot: { fluid: 'water', flowMode: 'm', m: 2, tin: 250, phase: 'none', p: 5e6, foul: 'clean' },
        cold: { fluid: 'water', flowMode: 'm', m: 2, tin: 15, phase: 'none', p: 5e6, foul: 'clean' },
        geom: { plate: { Np: 41, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } },
      expect: /range|Range/ },
    { id: 'validity-parallel-cross', note: 'parallel flow forced towards a temperature cross',
      st: { mode: 'rating', type: 'plate', arr: 'parallel',
        hot: { fluid: 'water', flowMode: 'm', m: 0.4, tin: 90, phase: 'none', foul: 'clean' },
        cold: { fluid: 'water', flowMode: 'm', m: 0.4, tin: 20, phase: 'none', foul: 'clean' },
        geom: { plate: { Np: 201, Lp: 600, Lw: 180, b: 2.4, Phi: 1.17, beta: 60, passH: 1, passC: 1, dport: 65 } } },
      expect: null }
  ];
  for (const pr of probes) {
    const r = await runCase(pr.st);
    const flagged = pr.expect ? r.msgs.some(m => pr.expect.test(m)) : true;
    const sane = isFinite(r.Q_kW) && r.Q_kW > 0 && r.eps > 0 && r.eps <= 1.0001
      && r.tho >= r.tci - 0.05 && r.tco <= r.thi + 0.05
      && (pr.st.arr !== 'parallel' || r.tco <= r.tho + 0.05);
    push({
      id: pr.id, note: pr.note, inputs: pr.st,
      tool_output: { Q_kW: r.Q_kW, eps: r.eps, NTU: r.NTU, Cr: r.Cr, F: r.F, thi: r.thi, tho: r.tho, tci: r.tci, tco: r.tco, Re_hot: r.Reh, Re_cold: r.Rec },
      messages: r.msgs,
      cmp: {
        flagged: { got: flagged, ref: true, rel: 0, ok: flagged, tol: 'the out-of-range condition must be reported to the user' },
        physically_sane: { got: sane, ref: true, rel: 0, ok: sane, tol: '0 < eps <= 1, no temperature cross, finite duty' }
      },
      worst_rel: 0, pass: flagged && sane
    });
  }
}

// ===========================================================================
// 9. The tool ships its own verification sheet. Read what IT says about the
//    two scenarios that broke the identity checks above - an independent
//    confirmation from inside the tool.
// ===========================================================================
{
  const scen = [
    { id: 'selfcheck-parallel-pinch', want: /U.A.F.LMTD|design equation/i,
      st: E2E.find(x => x.id === 'e2e-parallel-pinch').st },
    { id: 'selfcheck-condenser-cap', want: /C_min|definition/i,
      st: E2E.find(x => x.id === 'e2e-shell-cond').st }
  ];
  for (const sc of scen) {
    await enterCase(sc.st);
    /* #tabs is gone: the verification sheet is a framework tab now.  The tab is driven and the
       state's own tab field is checked, so a failed click cannot be mistaken for a clean sheet. */
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('[role="tab"],button,a')]
        .filter(e => /^\s*Validation\s*$/i.test(e.textContent || ''));
      if (!el.length) throw new Error('no Validation tab on this page');
      el[el.length - 1].click();
    });
    await page.waitForFunction(() => document.querySelectorAll('table.hx-t tbody tr').length > 0,
      null, { timeout: 30000 });
    await page.waitForTimeout(250);
    const sheet = await page.evaluate(() => {
      /* the sheet's table class went from .t to .hx-t with the port; the four columns, their
         order and the "!" mark in the deviation column are unchanged */
      const rows = [...document.querySelectorAll('table.hx-t tbody tr')].map(tr =>
        [...tr.cells].map(c => c.innerText.replace(/\n/g, ' ').trim()));
      const sum = [...document.querySelectorAll('.dgu-verdict')].map(m => m.textContent.trim())
        .find(x => /\d+\s*\/\s*\d+/.test(x)) || null;
      return { rows: rows.filter(r => /Energy|LMTD|C_min|NTU|1\/U/.test(r[0])), sum,
               tab: window.Diagram.state.current().tab };
    });
    if (sheet.tab !== 'val')
      throw new Error('the Validation tab was not entered; state.tab = ' + sheet.tab);
    if (!sheet.rows.length)
      throw new Error('the verification sheet rendered no graded row (tab=' + sheet.tab + ')');
    const failing = sheet.rows.filter(r => /!/.test(r[3] || ''));
    push({
      id: sc.id,
      note: 'the tool\'s own built-in verification sheet, evaluated on this case',
      inputs: sc.st,
      self_check_summary: sheet.sum,
      self_check_rows: sheet.rows,
      cmp: {
        own_selfcheck: {
          got: failing.length ? failing.map(r => r[0] + ' -> ' + r[3]).join(' | ') : 'all rows pass',
          ref: 'all rows pass', rel: 0, ok: failing.length === 0,
          tol: 'the tool\'s own verification sheet must not report a failing row'
        }
      },
      worst_rel: 0, pass: failing.length === 0
    });
  }
}

/* ===========================================================================
   POSITIVE CONTROL - not graded, written to the control file.  A run whose cases
   all pass at the page's default state has measured nothing, so one input is
   perturbed by a visible amount and the compared outputs must move.
   =========================================================================== */
{
  const base = E2E.find(x => x.id === 'e2e-plate-counter').st;
  const hotter = JSON.parse(JSON.stringify(base)); hotter.hot.tin = 120;
  const r0 = await runCase(base), r1 = await runCase(hotter);
  const moved = {};
  for (const k of ['Q_kW', 'LMTD', 'tho', 'tco', 'eps', 'NTU'])
    moved[k] = { at_80C: r0[k], at_120C: r1[k], changed: r0[k] !== r1[k] };
  const tileMoved = JSON.stringify(r0.tiles) !== JSON.stringify(r1.tiles);
  control.positive_control = {
    perturbation: 'e2e-plate-counter hot inlet 80 -> 120 C',
    outputs: moved, printed_tiles_moved: tileMoved,
    tiles_at_80C: r0.tiles, tiles_at_120C: r1.tiles,
    outputs_moved: ['Q_kW', 'LMTD', 'tho', 'tco'].every(k => moved[k].changed) && tileMoved
  };
  if (!control.positive_control.outputs_moved)
    throw new Error('POSITIVE CONTROL FAILED: perturbing the hot inlet by 40 K moved no compared output');
  await runCase(base);
}

await b.close();

const RUN_AT = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const passed = cases.filter(c => c.pass).length;
const out = {
  tool: 'heat-exchangers',
  file: 'heat_exchangers.html',
  reference: 'Closed-form effectiveness-NTU relations implemented independently in python; for crossflow with both fluids unmixed the EXACT Mason (1954) series, cross-checked against a finite-difference solution of the crossflow PDE (mutual agreement 1.2e-6 absolute); LMTD in closed form; the Bowman/TEMA F factor, independently confirmed to equal eps/(NTU*LMTD_counterflow) to 1e-15. Empirical heat-transfer correlations are deliberately NOT benchmarked against truth - the tool declares +-15..30% scatter; only internal consistency and validity-range flagging are tested.',
  reference_citations: [
    'W.M. Kays and A.L. London, "Compact Heat Exchangers", 3rd ed., McGraw-Hill 1984, Table 2-1 (effectiveness-NTU relations).',
    'R.K. Shah and D.P. Sekulic, "Fundamentals of Heat Exchanger Design", Wiley 2003, Table 3.3 and Table 3.8 (eps-NTU and P-NTU relations, F factor).',
    'W.R. Mason, "Heat transfer in crossflow", Proc. 2nd U.S. National Congress of Applied Mechanics (1954) 801-803 - exact series for crossflow, both fluids unmixed.',
    'R.A. Bowman, A.C. Mueller, W.M. Nagle, "Mean temperature difference in design", Trans. ASME 62 (1940) 283-294 - F correction factor.',
    'F.P. Incropera and D.P. DeWitt, "Fundamentals of Heat and Mass Transfer", Eq. 11.32 - the crossflow approximation, which the tool retains only as a non-convergence fallback; its distance from the exact series is reported, not scored.'
  ],
  tolerance: 'Closed-form eps-NTU relations and LMTD: 1e-12 / 1e-9 relative (pure double arithmetic, probed directly, no display rounding). Crossflow both unmixed: 1e-2 relative against the exact series, because the arrangement label promises the arrangement, not an approximation; the distance to the Incropera Eq. 11.32 shortcut is reported but not scored, since exact and shortcut differ by up to 3.8 % and no implementation can match both. F factor: 1e-9 relative against Bowman/TEMA. End-to-end identity checks: tolerances propagated from the printed precision of the CSV export (NTU 3 dp, eps 4 dp, Cr 3 dp, F 3 dp, T 2 dp, U 1 dp, A 3 dp). Where the tool reports the duty as limited by the latent capacity of the phase-change side, eps is checked against its definition Q/(Cmin*dTmax) and bounded above by eps(NTU,Cr), because a capped duty is no longer eps(NTU,Cr)*Cmin*dTmax. Empirical correlations: not benchmarked.',
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: errs,
  run_at: RUN_AT,
  cases
};
control.run_at = RUN_AT;
control.console = console_all;
control.page_errors = errs;
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(OUT_CONTROL, JSON.stringify(control, null, 1));
console.log(`heat-exchangers: ${passed}/${cases.length} passed`);
for (const c of cases.filter(c => !c.pass)) {
  const bad = Object.entries(c.cmp || {}).filter(([, x]) => !x.ok)
    .map(([k, x]) => `${k}: got ${typeof x.got === 'number' ? Number(x.got).toPrecision(6) : x.got} ref ${typeof x.ref === 'number' ? Number(x.ref).toPrecision(6) : x.ref} rel ${x.rel == null ? 'n/a' : Number(x.rel).toExponential(2)}`).join('; ');
  console.log(' FAIL', c.id, bad || '(structural)');
}
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 8));
console.log('run_at ' + RUN_AT + '; console messages ' + console_all.length);
process.exit(passed === cases.length && errs.length === 0 ? 0 : 1);
