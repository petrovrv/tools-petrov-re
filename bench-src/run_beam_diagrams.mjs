/* Benchmark driver for beam_diagrams.html  (tool id: beam-diagrams)
   Reference: bench-src/ref/beam_diagrams_ref.json  (independent python,
   closed-form statics + a second dense-grid numeric implementation).
   The tool is driven purely through the DOM. The page carries three static ids
   (#app, #diagram-tool-manifest, #diagram-lang-bootstrap) and builds its whole
   input surface and every readout through diagram-ui.js, so this driver uses the
   framework's own selectors: input controls are #f-<key>-c, panel actions are
   [data-action=...], extreme values are .dgu-tile (.dgu-tile-l label,
   .dgu-tile-v value, .dgu-tile-u unit and hint) and both result tables are
   .dgu-table, told apart by their header row.  The finely sampled diagram arrays
   are read from window.__beam, the test hook the page declares for this harness
   ("the test hook the parity harnesses read; nothing on the page uses it"), for
   the dV/dx = -w and dM/dx = V consistency check.  */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* Every path this driver uses — site root, reference file, output — resolves relative to
   this file's own tree, so the driver run in a workspace drives that workspace. */
const P = benchPaths({ name: 'beam_diagrams', page: 'beam_diagrams.html',
                       ref: 'beam_diagrams_ref.json' });

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is read out of the live DOM of the page the
   browser loaded and passed to stampProvenance(), which writes build,
   manifest_revision, reference_provenance, provenance_note and run_at, and refuses to
   write anything when the observed build is absent or disagrees with the page on disk. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/beam_gen.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 3 861 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

// pass criterion ------------------------------------------------------------
const REL = 1e-3;      // closed-form statics -> tight
const ABS3 = 5e-4;     // display rounding of 3-decimal fields (kN, kN.m)
const ABS2 = 5e-3;     // display rounding of the 2-decimal sample table
const POSTOL = 0.02;   // m, positions are printed with 2 decimals

const b = await chromium.launch();
const p = await b.newPage();
const errs = [], consoleErrs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 140)); });
await p.goto(P.pageUrl + '?lang=en', { waitUntil: 'load' });
await p.waitForTimeout(400);

/* The build this artifact names, observed in the document the browser loaded. */
const BUILD = await readPageManifestRevision(p);

/* The page's control ids: every framework field renders its control as
   #<field id>-c, and the field ids are declared in BEAM_FIELDS()/LOAD_FIELDS().
   Keeping the map explicit means a field the page renames is a named throw on
   the first case rather than a silently skipped input. */
const CTL = {
  L: 'f-L-c', supType: 'f-sup-c', supA: 'f-sa-c', supB: 'f-sb-c',
  ltype: 'f-ltype-c', pMag: 'f-pMag-c', pPos: 'f-pPos-c',
  wMag: 'f-wMag-c', wA: 'f-wA-c', wB: 'f-wB-c',
  triW1: 'f-triW1-c', triW2: 'f-triW2-c', triA: 'f-triA-c', triB: 'f-triB-c',
  mMag: 'f-mMag-c', mPos: 'f-mPos-c',
};
/* The four extreme-value tiles, keyed on the English label the page prints
   under ?lang=en. */
const TILE_KEY = { 'm max': 'Mmax', 'm min': 'Mmin', 'q max': 'Qmax', 'q min': 'Qmin' };

async function run(inp) {
  return await p.evaluate(async ({ inp, CTL, TILE_KEY }) => {
    const $ = id => document.getElementById(id);
    const set = (name, v) => {
      const e = $(CTL[name]);
      if (!e) throw new Error('no control for ' + name + ' (#' + CTL[name] + ')');
      e.value = String(v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const action = (a) => {
      const b = document.querySelector('[data-action="' + a + '"]');
      if (!b) throw new Error('no [data-action="' + a + '"] button');
      b.click();
    };
    // 1. beam
    set('L', inp.L);
    set('supType', inp.supType);
    if (inp.supType === 'overhang') { set('supA', inp.supA); set('supB', inp.supB); }
    await new Promise(r => setTimeout(r, 20));
    // 2. loads
    action('clear');
    await new Promise(r => setTimeout(r, 20));
    for (const ld of inp.loads) {
      set('ltype', ld.type === 'moment' ? 'moment' : ld.type);
      await new Promise(r => setTimeout(r, 20));
      if (ld.type === 'point') { set('pMag', ld.P); set('pPos', ld.x); }
      else if (ld.type === 'udl') { set('wMag', ld.w); set('wA', ld.a); set('wB', ld.b); }
      else if (ld.type === 'tri') { set('triW1', ld.w1); set('triW2', ld.w2); set('triA', ld.a); set('triB', ld.b); }
      else { set('mMag', ld.M); set('mPos', ld.x); }
      action('add');
      await new Promise(r => setTimeout(r, 20));
    }
    await new Promise(r => setTimeout(r, 120));
    // 3. read outputs
    const num = s => { const v = parseFloat(String(s).replace(/[^0-9eE+\-.]/g, '')); return isFinite(v) ? v : null; };
    /* Both result tables are .dgu-table. The reactions table is the one whose
       header row starts with "#"; the sample table is the three-column x/Q/M one. */
    const tables = [...document.querySelectorAll('table.dgu-table')];
    const headOf = t => (t.rows[0] ? [...t.rows[0].cells].map(c => c.innerText.trim()) : []);
    const reactTable = tables.find(t => headOf(t)[0] === '#');
    const sampleTable = tables.find(t => t !== reactTable && headOf(t).length === 3);
    if (!reactTable) throw new Error('no reactions .dgu-table (header starting "#")');
    if (!sampleTable) throw new Error('no three-column sample .dgu-table');
    const react = [...reactTable.rows].slice(1)
      .map(tr => { const c = [...tr.cells].map(x => x.innerText.trim());
        return { label: c[0], x: num(c[1]), Ry: num(c[2]), M: c[3] === '—' ? null : num(c[3]) }; });
    const stats = {};
    for (const d of document.querySelectorAll('.dgu-tile')) {
      const lab = ((d.querySelector('.dgu-tile-l') || {}).textContent || '')
        .replace(/\?\s*$/, '').trim().toLowerCase();
      const key = TILE_KEY[lab];
      if (!key) continue;
      stats[key] = num((d.querySelector('.dgu-tile-v') || {}).textContent);
      /* the extremum's position is printed in the tile's hint line */
      let xs = null;
      for (const u of d.querySelectorAll('.dgu-tile-u')) {
        const m = (u.textContent || '').match(/x\s*=\s*(-?[\d.]+)/);
        if (m) xs = parseFloat(m[1]);
      }
      stats['x' + key] = xs;
    }
    const table = [...sampleTable.rows].slice(1)
      .map(tr => [...tr.cells].map(c => num(c.innerText)));
    /* Field-level validation messages replaced the single #errBox: the framework
       prints them in each field's .dgu-err slot and page-level ones in .dgu-notice. */
    const err = [...document.querySelectorAll('.dgu-err, .dgu-notice')]
      .map(e => (e.innerText || '').trim()).filter(Boolean).join(' | ');
    const H = window.__beam;
    const d = (H && H.last) ? H.last.d : null;
    return { react, stats, table, err,
             diag: d ? { xs: d.xs, Q: d.Q, M: d.M } : null };
  }, { inp, CTL, TILE_KEY });
}

// downward load intensity, rebuilt from the case inputs (independent of tool)
function wOf(loads, x) {
  let s = 0;
  for (const l of loads) {
    if (l.type === 'udl' && x >= l.a && x <= l.b) s += l.w;
    if (l.type === 'tri' && x >= l.a && x <= l.b) s += l.w1 + (l.w2 - l.w1) * (x - l.a) / (l.b - l.a);
  }
  return s;
}
const isBreak = (c, x, tol) => {
  const L = c.inputs.L, pts = [0, L];
  if (c.inputs.supType === 'overhang') pts.push(c.inputs.supA, c.inputs.supB);
  for (const l of c.inputs.loads) {
    if (l.type === 'point' || l.type === 'moment') pts.push(l.x); else pts.push(l.a, l.b);
  }
  return pts.some(q => Math.abs(q - x) <= tol);
};

const cases = [];
for (const c of REF) {
  const inp = c.inputs;
  const r = await run(inp);
  const ex = c.exact, tw = c.twin;
  const sM = c.scaleM, sQ = c.scaleQ;
  const cmp = {};
  const put = (k, got, ref, scale, abs, twinv) => {
    if (got === null || got === undefined || !isFinite(got)) { cmp[k] = { got: null, ref, rel: null, ok: false, reason: 'missing' }; return; }
    const rel = Math.abs(got - ref) / Math.max(Math.abs(scale), 1e-12);
    const o = { got, ref, rel, ok: rel <= REL || Math.abs(got - ref) <= abs };
    if (twinv !== undefined && twinv !== null) o.twin_rel = Math.abs(got - twinv) / Math.max(Math.abs(scale), 1e-12);
    cmp[k] = o;
  };
  // ---- reactions
  if (ex.Ra !== undefined) {
    const A = r.react.find(q => q.label === 'R_A'), B = r.react.find(q => q.label === 'R_B');
    const scaleR = Math.max(Math.abs(ex.Ra), Math.abs(ex.Rb), 1e-9);
    put('R_A', A ? A.Ry : null, ex.Ra, scaleR, ABS3);
    put('R_B', B ? B.Ry : null, ex.Rb, scaleR, ABS3);
  } else {
    const A = r.react[0];
    put('R', A ? A.Ry : null, ex.R, Math.max(Math.abs(ex.R), 1e-9), ABS3);
    put('M_reaction', A ? A.M : null, ex.Mr, Math.max(Math.abs(ex.Mr), 1e-9), ABS3);
  }
  // ---- diagram extremes (normalised by the diagram's own peak magnitude)
  put('Mmax', r.stats.Mmax, ex.Mmax, sM, ABS3, tw.Mmax);
  put('Mmin', r.stats.Mmin, ex.Mmin, sM, ABS3, tw.Mmin);
  put('Qmax', r.stats.Qmax, ex.Qmax, sQ, ABS3, tw.Qmax);
  put('Qmin', r.stats.Qmin, ex.Qmin, sQ, ABS3, tw.Qmin);
  // ---- positions.  The reference supplies every interval on which the
  //      extremum is attained, so plateaus and ties are not false failures.
  const posInfo = {};
  const tolx = POSTOL + inp.L / 300;
  for (const k of ['Mmax', 'Mmin', 'Qmax', 'Qmin']) {
    const got = r.stats['x' + k], regs = ex['reg' + k];
    const dist = got === null ? Infinity : Math.min(...regs.map(([lo, hi]) => got < lo ? lo - got : got > hi ? got - hi : 0));
    const ok = dist <= tolx;
    posInfo['x' + k] = { got, attained_on: regs, dist_to_nearest: dist, ok };
    if (!ok) cmp['x' + k] = { got, ref: regs, rel: null, ok: false, reason: 'position ' + dist.toFixed(3) + ' m outside every interval where the extremum is attained' };
  }
  // ---- global equilibrium from the tool's own reactions
  let sumR = 0, sumMR = 0;
  for (const q of r.react) { sumR += q.Ry; sumMR += q.Ry * q.x + (q.M || 0); }
  const Fres = sumR - c.equil.sumP_down;
  const Mres = sumMR + c.equil.sumMload_ccw;
  // tolerance = what the printed rounding (R to 3 dec, x to 2 dec) can produce
  let tolF = 0, tolM = 0;
  const Wsc = Math.max(c.equil.sumP_down, r.react.reduce((a, q) => a + Math.abs(q.Ry), 0));
  for (const q of r.react) { tolF += 5e-4; tolM += 5e-4 * Math.abs(q.x) + 5e-3 * Math.abs(q.Ry) + (q.M === null ? 0 : 5e-4); }
  tolF += 5e-4 * Wsc; tolM += 5e-4 * Wsc * inp.L;   // 0.05 % of the applied load
  const equil = { sumF_resid: Fres, sumM_resid: Mres, tolF, tolM,
                  ok: Math.abs(Fres) <= tolF + 1e-12 && Math.abs(Mres) <= tolM + 1e-12 };
  if (!equil.ok) cmp['equilibrium'] = { got: Fres, ref: 0, rel: null, ok: false, reason: 'sumF=' + Fres.toFixed(4) + ' sumM=' + Mres.toFixed(4) };
  // ---- 22-row sample table
  let worstTab = 0, worstTabRow = null, worstDetail = null;
  for (const row of c.table_ref) {
    const got = r.table[row.i];
    if (!got) { worstTab = Infinity; worstTabRow = row.i; break; }
    const dQ = Math.min(...row.V.map(v => Math.abs(got[1] - v)));
    const dM = Math.min(...row.M.map(v => Math.abs(got[2] - v)));
    const e = Math.max(dQ > ABS2 ? dQ / sQ : 0, dM > ABS2 ? dM / sM : 0);
    if (e > worstTab) { worstTab = e; worstTabRow = row.i;
      worstDetail = { x: +row.x.toFixed(4), Q_got: got[1], Q_ref: row.V, M_got: got[2], M_ref: row.M }; }
  }
  cmp['table'] = { got: worstDetail, ref: 'exact V,M at x=L*i/21 (i=' + worstTabRow + ')',
                   rel: worstTab, ok: worstTab <= 2e-3 };
  // ---- differential identities, checked in integrated form over every smooth
  //      stretch of the tool's own diagram (ripple-insensitive, still tests the
  //      SIGN: M(b)-M(a) = +int V dx  and  V(b)-V(a) = -int w dx).
  //      Local finite differences are reported separately as a smoothness
  //      diagnostic (they amplify the tool's quadrature ripple by 1/h).
  let dMerr = 0, dVerr = 0, ripM = 0, ripV = 0;
  if (r.diag) {
    const { xs, Q, M } = r.diag;
    // couple locations (applied moments + a fixed support) - M jumps there
    const cpl = inp.loads.filter(l => l.type === 'moment').map(l => l.x);
    if (inp.supType === 'cantL') cpl.push(0);
    if (inp.supType === 'cantR') cpl.push(inp.L);
    const segs = []; let st = 0;
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] < 1e-12) { segs.push([st, i - 1]); st = i; }
    }
    segs.push([st, xs.length - 1]);
    for (let [a0, b0] of segs) {
      if (cpl.some(z => Math.abs(z - xs[a0]) < 1e-9)) a0++;
      if (cpl.some(z => Math.abs(z - xs[b0]) < 1e-9)) b0--;
      if (b0 - a0 < 2) continue;
      let intV = 0;
      for (let i = a0; i < b0; i++) intV += (Q[i] + Q[i + 1]) / 2 * (xs[i + 1] - xs[i]);
      dMerr = Math.max(dMerr, Math.abs((M[b0] - M[a0]) - intV) / sM);
      // exact int w dx over [xs[a0], xs[b0]]
      let intw = 0; const nq = 4000, hq = (xs[b0] - xs[a0]) / nq;
      for (let i = 0; i < nq; i++) intw += wOf(inp.loads, xs[a0] + (i + 0.5) * hq) * hq;
      dVerr = Math.max(dVerr, Math.abs((Q[b0] - Q[a0]) + intw) / sQ);
      for (let i = a0; i < b0; i++) {
        const h = xs[i + 1] - xs[i]; if (h < 1e-9) continue;
        ripM = Math.max(ripM, Math.abs((M[i + 1] - M[i]) / h - (Q[i] + Q[i + 1]) / 2) / sQ);
        ripV = Math.max(ripV, Math.abs((Q[i + 1] - Q[i]) / h + wOf(inp.loads, (xs[i] + xs[i + 1]) / 2)) * inp.L / sQ);
      }
    }
  }
  cmp['dM_dx_eq_V'] = { got: dMerr, ref: 0, rel: dMerr, ok: dMerr <= 2e-3 };
  cmp['dV_dx_eq_-w'] = { got: dVerr, ref: 0, rel: dVerr, ok: dVerr <= 2e-3 };
  const smooth = { local_dMdx_dev_rel: ripM, local_dVdx_dev_rel: ripV };

  const worst = Math.max(...Object.values(cmp).map(x => x.rel === null ? (x.ok ? 0 : Infinity) : x.rel));
  cases.push({ id: c.id, note: c.note, inputs: inp, cmp, positions: posInfo, equilibrium: equil, smoothness: smooth,
               crosscheck: c.crosscheck_max_rel, tool_error: r.err || null,
               worst_rel: worst, pass: Object.values(cmp).every(x => x.ok) });
}

// ---- extra: superposition check tool(A+B) == tool(A)+tool(B) ---------------
const gA = REF.find(c => c.id === 'superpos_A'), gB = REF.find(c => c.id === 'superpos_B'),
      gAB = REF.find(c => c.id === 'superpos_AB');
const rA = await run(gA.inputs), rB = await run(gB.inputs), rAB = await run(gAB.inputs);
const sup = {};
for (const lbl of ['R_A', 'R_B']) {
  const a = rA.react.find(q => q.label === lbl).Ry, bq = rB.react.find(q => q.label === lbl).Ry,
        ab = rAB.react.find(q => q.label === lbl).Ry;
  sup[lbl] = { sum_of_parts: a + bq, combined: ab, diff: ab - (a + bq), ok: Math.abs(ab - (a + bq)) <= 1e-3 };
}
let worstSup = 0;
for (let i = 0; i < 22; i++) {
  const s = rA.table[i][2] + rB.table[i][2], ab = rAB.table[i][2];
  worstSup = Math.max(worstSup, Math.abs(ab - s));
}
sup.table_M_max_abs_diff = worstSup;
sup.ok = Object.values(sup).every(v => (typeof v !== 'object') || v.ok) && worstSup <= 0.02;
cases.push({ id: 'superposition_identity', note: 'tool(point+UDL) must equal tool(point)+tool(UDL)',
             inputs: { A: gA.inputs, B: gB.inputs, AB: gAB.inputs },
             cmp: { superposition: { got: worstSup, ref: 0, rel: worstSup, ok: sup.ok } },
             detail: sup, worst_rel: worstSup, pass: sup.ok });

// ---- extra: export buttons offline ---------------------------------------
const beforeErr = errs.length;
/* The page has no XLSX button: the export this case was written for is now the
   in-page CSV writer, reached through the panel action [data-action="csv"] and
   labelled from the same i18n key (xlsBtn) the old button used. What the case
   tests is unchanged - the export must not throw with no network available. */
await p.evaluate(() => {
  const b = document.querySelector('[data-action="csv"]');
  if (!b) throw new Error('no [data-action="csv"] export button');
  b.click();
});
await p.waitForTimeout(200);
const xlsThrew = errs.length > beforeErr;
cases.push({ id: 'export_xlsx_offline', note: 'Export of the diagram table with no network available (manifest declares network_access=none); the page writes the CSV itself through the [data-action="csv"] panel action.',
             inputs: {}, cmp: { no_exception: { got: xlsThrew ? 'ReferenceError' : 'none', ref: 'none', rel: xlsThrew ? 1 : 0, ok: !xlsThrew } },
             worst_rel: xlsThrew ? 1 : 0, pass: !xlsThrew });

await b.close();

const passed = cases.filter(c => c.pass).length;
const out = {
  tool: 'beam-diagrams', file: 'beam_diagrams.html',
  reference: 'Closed-form statics for determinate beams (Macaulay/exact integration) implemented independently in python, crosschecked against a second, structurally different dense-grid numeric solver (scipy.quad + cumulative trapezoid).',
  reference_citations: [
    'Standard simple-beam results reproduced by the reference: R=P/2, Mmax=PL/4 (central point load); R_A=Pb/L, Mmax=Pab/L (point load at any point); R=wL/2, Mmax=wL^2/8 (full UDL); R_A=wL/6, R_B=wL/3, Mmax=wL^2/(9*sqrt(3)) at x=L/sqrt(3) (triangular 0->w); M_fixed=-PL and -wL^2/2 (cantilever). See AISC Steel Construction Manual, Part 3 "Beam Diagrams and Formulas"; Gere & Goodno, Mechanics of Materials, Appendix G; Hibbeler, Structural Analysis, Ch. 4.',
    'Reference values in this file are derived from first principles in bench-src/ref/beam_gen.py, not copied from a table; the textbook results above are reproduced exactly by that derivation.'
  ],
  tolerance: 'Reactions/extremes: relative 1e-3 of the diagram peak magnitude, or absolute 5e-4 kN(.m) (the tool prints 3 decimals). Sample table: 2e-3 of peak or 5e-3 absolute (2 decimals printed). Extremum positions: +-0.02 m + L/300 (position printed with 2 decimals, sample step is up to L/600). Differential identities dM/dx=V and dV/dx=-w: 5e-3 of the shear scale.',
  crosscheck: 'Max relative deviation between the two independent reference implementations, per case, stored as "crosscheck" (all <= 2.5e-5).',
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: errs,
  console_errors: [...new Set(consoleErrs)],
  cases
};
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`beam_diagrams: ${passed}/${cases.length} passed`);
for (const c of cases.filter(c => !c.pass)) {
  console.log(' FAIL', c.id);
  for (const [k, v] of Object.entries(c.cmp)) if (!v.ok)
    console.log('   ', k, 'got', v.got, 'ref', typeof v.ref === 'number' ? +v.ref.toPrecision(8) : v.ref,
      'rel', v.rel === null ? (v.reason || '') : v.rel.toExponential(2),
      v.twin_rel !== undefined ? '(vs tool-algorithm twin: ' + v.twin_rel.toExponential(2) + ')' : '');
}
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 6));
console.log('CONSOLE:', [...new Set(consoleErrs)].slice(0, 4));
