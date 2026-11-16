/* Benchmark driver for fourier_series.html  (tool id: fourier-series)
   Reference: bench-src/ref/fourier_series_ref.json - Fourier coefficients
   derived independently in python (sympy symbolic integration of the same
   piecewise target definitions, crosschecked against mpmath quadrature).
   The tool is driven through the DOM; outputs are read from the #coefTable
   rows, from the canvas property mainChart._exportSamples (the exact sample
   set the tool plots and exports) and from the #specChart pixels.

   2026-10-02 adaptation (locators and transport only; no tolerance, case,
   reference value or comparison was changed):
     usage: node run_fourier_series.mjs <baseUrl> <toolPath> [outDir] [refJson]
   The page keeps #mode, #wave, #duty, #N, #Nnum, #periods, #showHarm,
   #manualList and #coefTable under the DiagramUI shell (legacyIds()), so the
   input path is unchanged. Three read locators and one colour had to move:
     - #hSpectrum  -> the spectrum stage's framework caption .dgu-stage-cap
     - #formulaBox -> .fs-formula (the class the same node still carries)
     - #dutyBox    -> [data-dgu-field="f-duty"], the framework field row
     - #btnXlsx / #btnPdf -> the framework export buttons in #dgc-bar; the
       tool-owned Excel button is a CSV action there now
     - the spectrum bar colour is read from the page's own --accent token
       instead of the literal rgb(8,145,178) the token used to resolve to
   Every case asserts, from window.Diagram.record.build(), that the page state
   really is the configuration the case names before any output is read. */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
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
  provenance_note: "Reference values are derived by bench-src/ref/fourier_gen.py rather than transcribed, but that generator could not be re-run against this tree (it imports sympy at line 18 and sympy is not installed here), so the corpus is not reproduced here and the artifact reuses it as stored."
};

/* Every path resolves relative to this file's own tree: the reference to
   bench-src/ref, the artifact to <siteRoot>/benchmarks/fourier_series.json and the
   control file beside it. */
const P = benchPaths({ name: 'fourier_series', page: 'fourier_series.html',
                       ref: 'fourier_series_ref.json' });

/* This driver reaches its page over http, as it did before: --base or BENCH_BASE sets
   the origin, a bare positional argument is still read, and the default is unchanged. */
const BASE = (P.base || P.flags._[0] || 'http://127.0.0.1:8321').replace(/\/+$/, '');
const TOOL = P.pageFile;
const OUT = P.out;
const OUT2 = P.out2 || path.join(path.dirname(OUT), 'fourier_series.control.json');
const R = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const URL0 = BASE + '/' + TOOL;

const ABS4 = 5e-5;    // a, b, amp are printed with 4 decimals
const ABSPH = 0.05;   // phase printed with 1 decimal (deg)
const RECON = 1e-9;   // partial-sum reconstruction: pure double arithmetic

const b = await chromium.launch();
const p = await b.newPage();
const errs = [], consoleErrs = [], consoleAll = [], dialogs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('console', m => { consoleAll.push(m.type() + ': ' + m.text()); if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 140)); });
p.on('dialog', async d => { dialogs.push(d.message().slice(0, 120)); await d.dismiss(); });
await p.goto(URL0 + '?lang=en', { waitUntil: 'load' });
await p.waitForFunction(() => !!window.Diagram && !!window.DiagramUI
  && !!document.getElementById('coefTable')
  && !!document.getElementById('mainChart')
  && !!document.getElementById('specChart')
  && window.Diagram.record.build() !== null, null, { timeout: 60000 });

/* The build this artifact names, observed in the document the browser loaded. */
const BUILD = await readPageManifestRevision(p);

/* the page state the case names must be the state that produced the numbers */
async function assertState(cfg) {
  const want = {
    mode: cfg.mode || 'preset',
    N_harmonics: cfg.N,
    periods_shown: cfg.periods || 2
  };
  if ((cfg.mode || 'preset') === 'preset') want.waveform = cfg.wave;
  if (cfg.duty !== undefined && cfg.duty !== null) want.duty_cycle = cfg.duty;
  /* The record reads the state object and moves at once; the coefficient table and
     the plotted sample set are produced by the framework's debounced compute and by
     a stage animation frame. Waiting only on the record read the PREVIOUS case's
     table (square_N1 saw 8 rows, square_N8 saw 1). Both render markers are
     invalidated before the inputs are set (see drive()), so this waits for the page
     to have re-rendered rather than for a fixed delay. */
  try {
    await p.waitForFunction(w => {
      const r = window.Diagram.record.build();
      if (!r) return false;
      const i = r.inputs;
      for (const k of Object.keys(w))
        if (String(i[k]) !== String(w[k]) && !(Math.abs(Number(i[k]) - Number(w[k])) <= 1e-12)) return false;
      const t = document.getElementById('coefTable');
      if (!t || t.dataset.benchStale === '1') return false;
      if (t.querySelectorAll('tbody tr').length !== Number(w.N_harmonics)) return false;
      const cv = document.getElementById('mainChart');
      if (!cv || !cv._exportSamples || !cv._exportSamples.length) return false;
      return true;
    }, want, { timeout: 20000 });
  } catch (e) { /* fall through to the throw below, which reports the real state */ }
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const got = await p.evaluate(() => {
    const t = document.getElementById('coefTable');
    const cv = document.getElementById('mainChart');
    return { rec: window.Diagram.record.build().inputs,
             ser: window.Diagram.state.current(),
             rows: t ? t.querySelectorAll('tbody tr').length : null,
             stale: t ? t.dataset.benchStale === '1' : null,
             samples: cv && cv._exportSamples ? cv._exportSamples.length : 0 };
  });
  for (const k of Object.keys(want)) {
    const a = got.rec[k], w = want[k];
    const same = (typeof w === 'number' && typeof a === 'number')
      ? Math.abs(a - w) <= 1e-12 : String(a) === String(w);
    if (!same)
      throw new Error('input not applied: case asked ' + JSON.stringify(want)
        + ', page state is ' + JSON.stringify({ record: got.rec, serialized: got.ser }));
  }
  if (got.stale !== false || got.rows !== cfg.N || got.samples === 0)
    throw new Error('the page did not re-render for ' + JSON.stringify(want)
      + ': ' + JSON.stringify({ coefTable_rows: got.rows, coefTable_still_stale: got.stale,
                                plotted_samples: got.samples }));
  return got;
}

/* invalidate the two render markers the settle test watches */
async function invalidate() {
  await p.evaluate(() => {
    const t = document.getElementById('coefTable');
    if (t) t.dataset.benchStale = '1';
    const cv = document.getElementById('mainChart');
    if (cv) cv._exportSamples = null;
  });
}

async function drive(cfg) {
  await invalidate();
  await p.evaluate(async (cfg) => {
    const $ = id => document.getElementById(id);
    const need = id => { const e = $(id); if (!e) throw new Error('control #' + id + ' is absent from the rendered page'); return e; };
    const fire = (e, t) => e.dispatchEvent(new Event(t, { bubbles: true }));
    need('mode').value = cfg.mode || 'preset'; fire($('mode'), 'change');
    await new Promise(r => setTimeout(r, 20));
    if ((cfg.mode || 'preset') === 'preset') {
      need('wave').value = cfg.wave; fire($('wave'), 'change');
      await new Promise(r => setTimeout(r, 20));
      if (cfg.duty !== undefined && cfg.duty !== null) {
        need('duty').value = String(Math.round(cfg.duty * 100)); fire($('duty'), 'input');
        await new Promise(r => setTimeout(r, 20));
      }
    }
    need('periods').value = String(cfg.periods || 2); fire($('periods'), 'change');
    need('Nnum').value = String(cfg.N); fire($('Nnum'), 'input');
    await new Promise(r => setTimeout(r, 60));
  }, cfg);
  await assertState(cfg);
  return await p.evaluate(async () => {
    const $ = id => document.getElementById(id);
    // coefficient table
    const rows = [...document.querySelectorAll('#coefTable tbody tr')].map(tr =>
      [...tr.cells].map(c => c.innerText.trim()));
    const table = rows.map(c => ({ n: +c[0], a: +c[1], b: +c[2], amp: +c[3], phase: +c[4], freq: +c[5] }));
    // plotted samples
    const s = $('mainChart')._exportSamples || [];
    // spectrum bars, measured from the pixels actually drawn
    const cv = $('specChart');
    // the framework stage caps the ratio at 2 (Stage.measure) — use the same number
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = cv.getContext('2d');
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const cssW = cv.width / dpr, cssH = cv.height / dpr;
    // drawSpectrum's own padding: {l: coarse?36:44, r:14, t:12, b:24}; the framework
    // stage calls a window narrower than 768 px "coarse" (Stage.measure)
    const coarse = window.innerWidth < 768;
    const px = coarse ? 36 : 44, pw = cssW - (coarse ? 36 : 44) - 14, py = 12, ph = cssH - 12 - 24;
    // the bar colour is the page's own --accent token, whatever it resolves to
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const probe = document.createElement('span');
    probe.style.color = acc || '#000';
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color.match(/\d+/g).map(Number);
    probe.remove();
    const nB = table.length, bw = pw / Math.max(nB, 1);
    const bars = [];
    for (let i = 0; i < nB; i++) {
      const xc = Math.round((px + i * bw + bw * 0.15 + bw * 0.35) * dpr);
      let ytop = null;
      for (let y = Math.round(py * dpr); y <= Math.round((py + ph) * dpr); y++) {
        const o = (y * cv.width + xc) * 4;
        const r = img.data[o], g = img.data[o + 1], bl = img.data[o + 2];
        if (Math.abs(r - rgb[0]) < 24 && Math.abs(g - rgb[1]) < 24 && Math.abs(bl - rgb[2]) < 24) { ytop = y / dpr; break; }
      }
      bars.push(ytop === null ? 0 : ((py + ph) - ytop) / ph);   // fraction of full height
    }
    // #hSpectrum is the framework stage caption now; #formulaBox keeps its .fs-formula class;
    // #dutyBox is the framework field row [data-dgu-field="f-duty"]
    const caps = [...document.querySelectorAll('.dgu-stage-cap')].map(e => e.innerText.trim());
    const form = document.querySelector('.fs-formula');
    if (!form) throw new Error('.fs-formula (was #formulaBox) is absent from the rendered page');
    const dutyRow = document.querySelector('[data-dgu-field="f-duty"]');
    if (!dutyRow) throw new Error('[data-dgu-field="f-duty"] (was #dutyBox) is absent from the rendered page');
    if (caps.length < 2) throw new Error('the spectrum stage caption (was #hSpectrum) is absent: captions = ' + JSON.stringify(caps));
    return { table, samples: s, bars, bar_rgb: rgb, accent_token: acc,
             specTitle: caps[caps.length - 1], formula: form.innerText,
             dutyShown: !dutyRow.hidden && getComputedStyle(dutyRow).display !== 'none',
             Nslider: +$('N').value, Nnum: +$('Nnum').value };
  });
}

const cases = [];
for (const c of R.cases) {
  const cfg = { wave: c.wave, N: c.N, duty: c.duty, periods: c.wave === 'square' && c.N > 20 ? 1 : 2 };
  const r = await drive(cfg);
  const cmp = {};
  // ---------- 1. coefficient table -----------------------------------
  let wa = 0, wb = 0, wamp = 0, wph = 0, worstRow = null;
  if (r.table.length !== c.N) {
    cmp['row_count'] = { got: r.table.length, ref: c.N, rel: null, ok: false, reason: 'wrong number of harmonic rows' };
  }
  for (const h of c.harmonics) {
    const g = r.table.find(t => t.n === h.n);
    if (!g) { cmp['row_' + h.n] = { got: null, ref: h.n, rel: null, ok: false, reason: 'missing row' }; continue; }
    const da = Math.abs(g.a - h.a), db = Math.abs(g.b - h.b), dm = Math.abs(g.amp - h.amp);
    if (da > wa) { wa = da; }
    if (db > wb) { wb = db; worstRow = h.n; }
    if (dm > wamp) wamp = dm;
    if (h.amp > 1e-6) {
      let dp = Math.abs(g.phase - h.phase_deg); if (dp > 180) dp = 360 - dp;
      wph = Math.max(wph, dp);
    }
    // internal consistency of the printed row
    const ampChk = Math.abs(Math.hypot(g.a, g.b) - g.amp);
    if (ampChk > 1e-4) cmp['amp_consistency_n' + h.n] = { got: g.amp, ref: Math.hypot(g.a, g.b), rel: ampChk, ok: false };
    if (g.freq !== h.n) cmp['freq_col_n' + h.n] = { got: g.freq, ref: h.n, rel: null, ok: false, reason: 'freq column' };
  }
  cmp['a_n'] = { got: 'max |dev| ' + wa.toExponential(2), ref: 'sympy closed form', rel: wa, ok: wa <= ABS4 };
  cmp['b_n'] = { got: 'max |dev| ' + wb.toExponential(2) + (worstRow ? ' (n=' + worstRow + ')' : ''), ref: 'sympy closed form', rel: wb, ok: wb <= ABS4 };
  cmp['amp_n'] = { got: 'max |dev| ' + wamp.toExponential(2), ref: 'sqrt(a^2+b^2)', rel: wamp, ok: wamp <= ABS4 };
  cmp['phase_n'] = { got: 'max |dev| ' + wph.toExponential(2) + ' deg', ref: 'atan2(a,b)', rel: wph / 180, ok: wph <= ABSPH };

  // ---------- 2. DC term actually used in the reconstruction ----------
  //   a0_tool = plotted_sum(x) - sum_n [a_n cos(nx) + b_n sin(nx)]
  //   the plotted grid covers exactly `periods` whole periods with 1400
  //   intervals, so averaging sum() over the first 1400 samples cancels every
  //   harmonic exactly and leaves the DC term the tool actually reconstructs.
  let a0tool = 0;
  const nAvg = r.samples.length - 1;
  for (let k = 0; k < nAvg; k++) a0tool += r.samples[k].sum;
  a0tool /= nAvg;
  cmp['a0_DC'] = { got: a0tool, ref: c.a0_mean, rel: Math.abs(a0tool - c.a0_mean), ok: Math.abs(a0tool - c.a0_mean) <= 1e-4 };

  // ---------- 3. plotted partial sum vs direct evaluation --------------
  let wsum = 0, wtarg = 0;
  const disc = c.wave === 'pulse' ? [0, 2 * Math.PI * c.duty] : c.wave === 'square' || c.wave === 'sawtooth' ? [0, Math.PI] : c.wave === 'halfsine' ? [0, Math.PI] : [];
  const targetOf = (xv) => {
    const t = ((xv % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    switch (c.wave) {
      case 'square': return t < Math.PI ? 1 : -1;
      case 'sawtooth': return t < Math.PI ? t / Math.PI : t / Math.PI - 2;
      case 'triangle': return (2 / Math.PI) * Math.asin(Math.sin(xv));
      case 'pulse': return t < 2 * Math.PI * c.duty ? 1 : 0;
      case 'halfsine': return Math.max(Math.sin(xv), 0);
    }
  };
  for (const s of r.samples) {
    let acc = c.a0_mean;
    for (const h of c.harmonics) acc += h.a * Math.cos(h.n * s.x) + h.b * Math.sin(h.n * s.x);
    wsum = Math.max(wsum, Math.abs(s.sum - acc));
    const t = ((s.x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (disc.some(d => Math.abs(t - d) < 1e-6 || Math.abs(t - d - 2 * Math.PI) < 1e-6)) continue;
    wtarg = Math.max(wtarg, Math.abs(s.target - targetOf(s.x)));
  }
  cmp['partial_sum_plot'] = { got: wsum, ref: 0, rel: wsum, ok: wsum <= RECON };
  cmp['target_plot'] = { got: wtarg, ref: 0, rel: wtarg, ok: wtarg <= 1e-9 };

  // ---------- 4. Parseval ---------------------------------------------
  let E = a0tool * a0tool;
  for (const g of r.table) E += (g.a * g.a + g.b * g.b) / 2;
  // tolerance propagated from the 4-decimal rounding of the printed a_n, b_n
  let ptol = 1e-6;
  for (const h of c.harmonics) ptol += (Math.abs(h.a) + Math.abs(h.b)) * 5e-5;
  cmp['parseval_partial'] = { got: E, ref: c.parseval_partial_energy,
    rel: Math.abs(E - c.parseval_partial_energy), ok: Math.abs(E - c.parseval_partial_energy) <= ptol,
    note: 'tolerance ' + ptol.toExponential(2) + ' propagated from the 4-decimal display rounding' };
  const parseval = { mean_square_exact: c.mean_square, energy_in_N_harmonics: E,
                     residual_tail: c.mean_square - E, analytic_tail: c.parseval_tail,
                     tail_agreement: Math.abs((c.mean_square - E) - c.parseval_tail) };

  // ---------- 5. spectrum bars vs amplitudes ---------------------------
  const aMax = Math.max(...c.harmonics.map(h => h.amp));
  let wbar = 0, barDetail = null;
  if (aMax > 0) for (let i = 0; i < c.harmonics.length; i++) {
    const want = c.harmonics[i].amp / aMax, got = r.bars[i];
    if (Math.abs(got - want) > wbar) { wbar = Math.abs(got - want); barDetail = { n: c.harmonics[i].n, bar_frac: got, amp_frac: want }; }
  }
  // does a power (amp^2) normalisation fit better?  (diagnostic)
  let wpow = 0;
  if (aMax > 0) for (let i = 0; i < c.harmonics.length; i++)
    wpow = Math.max(wpow, Math.abs(r.bars[i] - (c.harmonics[i].amp / aMax) ** 2));
  cmp['spectrum_bars'] = { got: barDetail, ref: 'bar height / max = amp_n / amp_max', rel: wbar,
                           ok: wbar <= 0.012, note: 'worst deviation if bars were amp^2-scaled: ' + wpow.toFixed(3) };

  const worst = Math.max(...Object.values(cmp).map(v => v.rel === null ? (v.ok ? 0 : Infinity) : v.rel));
  cases.push({ id: c.id, note: `${c.wave}${c.duty !== null ? ' D=' + c.duty : ''}, N=${c.N}`,
    inputs: { wave: c.wave, N: c.N, duty: c.duty, periods: cfg.periods },
    cmp, parseval, crosscheck: c.crosscheck_max_abs,
    spectrum_title: r.specTitle, formula_shown: r.formula,
    worst_rel: worst, pass: Object.values(cmp).every(v => v.ok) });
}

// ---------------- Gibbs -----------------------------------------------------
for (const g of R.gibbs) {
  const r = await drive({ wave: 'square', N: g.N, periods: 1 });
  let peak = -Infinity, xpk = null;
  for (const s of r.samples) if (s.sum > peak) { peak = s.sum; xpk = s.x; }
  const over = (peak - 1) / 2 * 100;
  // what the reference partial sum gives ON THE SAME PLOTTING GRID
  let gridPeak = -Infinity;
  for (const s of r.samples) {
    let acc = 0;
    for (let n = 1; n <= g.N; n += 2) acc += 4 / (n * Math.PI) * Math.sin(n * s.x);
    if (acc > gridPeak) gridPeak = acc;
  }
  const cmp = {
    plotted_peak_vs_reference_on_same_grid: { got: peak, ref: gridPeak, rel: Math.abs(peak - gridPeak), ok: Math.abs(peak - gridPeak) <= 1e-9 },
    continuous_peak: { got: gridPeak, ref: g.peak_value, rel: Math.abs(gridPeak - g.peak_value), ok: Math.abs(gridPeak - g.peak_value) <= 2e-3 }
  };
  cases.push({ id: 'gibbs_N' + g.N, note: 'Gibbs overshoot of the plotted square-wave partial sum',
    inputs: { wave: 'square', N: g.N, periods: 1 }, cmp,
    gibbs: { x_peak_plotted: xpk, x_peak_exact: g.x_peak,
             peak_plotted: peak, peak_exact_continuous: g.peak_value,
             overshoot_pct_of_jump_plotted: over,
             overshoot_pct_of_jump_exact: g.overshoot_pct_of_jump,
             wilbraham_gibbs_limit_pct: R.gibbs_limit_overshoot_pct_of_jump },
    worst_rel: Math.max(...Object.values(cmp).map(v => v.rel)),
    pass: Object.values(cmp).every(v => v.ok) });
}

// ---------------- manual mode ----------------------------------------------
{
  await invalidate();
  await p.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const fire = (e, t) => e.dispatchEvent(new Event(t, { bubbles: true }));
    $('mode').value = 'manual'; fire($('mode'), 'change');
    await new Promise(r => setTimeout(r, 40));
    const inp = [...document.querySelectorAll('#manualList input')];
    // first harmonic: n=2, amp=0.8, phase=30 deg
    const vals = [['2', '0.8', '30'], ['5', '0.25', '-120']];
    for (let k = 0; k < 2 && k * 3 + 2 < inp.length; k++)
      for (let j = 0; j < 3; j++) { inp[k * 3 + j].value = vals[k][j]; fire(inp[k * 3 + j], 'input'); }
    await new Promise(r => setTimeout(r, 60));
  });
  /* manual mode: the record's N_harmonics is still the preset slider, so the settle
     test is the manual harmonic list itself plus the two render markers */
  const MANWANT = [{ n: 2, amp: 0.8, phase: 30 }, { n: 5, amp: 0.25, phase: -120 }];
  try {
    await p.waitForFunction(w => {
      const r = window.Diagram.record.build();
      if (!r || String(r.inputs.mode) !== 'manual') return false;
      const mh = r.inputs.manual_harmonics || [];
      if (mh.length !== w.length) return false;
      for (let k = 0; k < w.length; k++)
        if (Number(mh[k].n) !== w[k].n || Number(mh[k].amp) !== w[k].amp
            || Number(mh[k].phase) !== w[k].phase) return false;
      const t = document.getElementById('coefTable');
      if (!t || t.dataset.benchStale === '1') return false;
      if (t.querySelectorAll('tbody tr').length !== w.length) return false;
      const cv = document.getElementById('mainChart');
      return !!(cv && cv._exportSamples && cv._exportSamples.length);
    }, MANWANT, { timeout: 20000 });
  } catch (e) { /* the assertion below reports the actual state */ }
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const r = await p.evaluate(() => {
    const $ = id => document.getElementById(id);
    const rows = [...document.querySelectorAll('#coefTable tbody tr')].map(tr => [...tr.cells].map(c => +c.innerText.trim()));
    const s = $('mainChart')._exportSamples || [];
    return { rows, s: s.slice(0, 400) };
  });
  const want = [{ n: 2, amp: 0.8, ph: 30 }, { n: 5, amp: 0.25, ph: -120 }];
  // INPUT ASSERTION: the page's own record must carry the two manual harmonics
  const mrec = await p.evaluate(() => window.Diagram.record.build().inputs);
  const mh = mrec.manual_harmonics || [];
  for (let k = 0; k < want.length; k++) {
    const h = mh[k] || {};
    if (Number(h.n) !== want[k].n || Math.abs(Number(h.amp) - want[k].amp) > 1e-12
        || Math.abs(Number(h.phase) - want[k].ph) > 1e-12)
      throw new Error('manual harmonics not applied: asked ' + JSON.stringify(want)
        + ', page state is ' + JSON.stringify(mrec));
  }
  if (String(mrec.mode) !== 'manual')
    throw new Error('manual mode not applied: page state is ' + JSON.stringify(mrec));
  const cmp = {};
  let w = 0;
  for (const q of want) {
    const row = r.rows.find(x => x[0] === q.n);
    const a = q.amp * Math.sin(q.ph * Math.PI / 180), bb = q.amp * Math.cos(q.ph * Math.PI / 180);
    if (!row) { cmp['n' + q.n] = { got: null, ref: q.n, rel: null, ok: false, reason: 'row missing' }; continue; }
    w = Math.max(w, Math.abs(row[1] - a), Math.abs(row[2] - bb), Math.abs(row[3] - Math.abs(q.amp)));
  }
  let ws = 0;
  for (const s of r.s) {
    let acc = 0;
    for (const q of want) acc += q.amp * Math.sin(q.n * s.x + q.ph * Math.PI / 180);
    ws = Math.max(ws, Math.abs(s.sum - acc));
  }
  cmp['manual_ab_from_amp_phase'] = { got: w, ref: 0, rel: w, ok: w <= ABS4 };
  cmp['manual_reconstruction'] = { got: ws, ref: 0, rel: ws, ok: ws <= RECON };
  cases.push({ id: 'manual_harmonics', note: 'manual mode: amp/phase -> a=amp*sin(ph), b=amp*cos(ph), term=amp*sin(nx+ph)',
    inputs: { mode: 'manual', harmonics: want }, cmp, worst_rel: Math.max(w, ws),
    pass: Object.values(cmp).every(v => v.ok) });
}

// ---------------- export buttons offline ------------------------------------
{
  const before = errs.length, dbefore = dialogs.length;
  // #btnXlsx and #btnPdf were the tool's own buttons; the framework bar carries the
  // export actions now, and the Excel action is a CSV action there
  const clicked = await p.evaluate(async () => {
    const bar = document.getElementById('dgc-bar');
    if (!bar) throw new Error('the export bar #dgc-bar is absent from the rendered page');
    const want = ['CSV', 'PDF report'];
    const hit = [];
    for (const label of want) {
      const btn = [...bar.querySelectorAll('button')].find(x => x.innerText.trim() === label);
      if (!btn) throw new Error('export button "' + label + '" is absent from #dgc-bar: '
        + JSON.stringify([...bar.querySelectorAll('button')].map(x => x.innerText.trim())));
      btn.click();
      hit.push(label);
      await new Promise(r => setTimeout(r, 150));
    }
    return hit;
  });
  await p.waitForTimeout(400);
  const threw = errs.length > before;
  cases.push({ id: 'export_offline', note: 'Excel/PDF export with the CDN scripts unavailable (manifest declares network_access=none)',
    inputs: { buttons: clicked }, cmp: { no_exception: { got: threw ? errs.slice(before).join('; ') : 'handled with an alert', ref: 'no uncaught exception', rel: threw ? 1 : 0, ok: !threw } },
    dialogs: dialogs.slice(dbefore), worst_rel: threw ? 1 : 0, pass: !threw });
}

// ---------------- positive control ------------------------------------------
// A run whose cases all pass at the page's default state has measured nothing:
// perturb one input by a visible amount and confirm the compared output moves.
const control = await (async () => {
  const a = await drive({ wave: 'square', N: 3, periods: 2 });
  const b1 = await drive({ wave: 'square', N: 25, periods: 2 });
  const c1 = await drive({ wave: 'sawtooth', N: 25, periods: 2 });
  const peakOf = r => Math.max(...r.samples.map(s => s.sum));
  return {
    perturbations: ['N 3 -> 25 at wave=square', 'wave square -> sawtooth at N=25'],
    rows: { N3: a.table.length, N25: b1.table.length },
    b1_coefficient: { N3: a.table[0].b, N25: b1.table[0].b, sawtooth_N25: c1.table[0].b },
    plotted_peak: { N3: peakOf(a), N25: peakOf(b1), sawtooth_N25: peakOf(c1) },
    bar_rgb: b1.bar_rgb, accent_token: b1.accent_token,
    bars_nonzero_N25: b1.bars.filter(x => x > 0).length,
    formula_square: a.formula, formula_sawtooth: c1.formula,
    outputs_moved: a.table.length !== b1.table.length
                   && peakOf(a) !== peakOf(b1)
                   && b1.table[0].b !== c1.table[0].b
                   && b1.bars.filter(x => x > 0).length > 0
  };
})();

await b.close();

const passed = cases.filter(c => c.pass).length;
const result = {
  tool: 'fourier-series', file: 'fourier_series.html',
  run_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  reference: 'Fourier coefficients derived from first principles with sympy (symbolic integration of the same piecewise target definitions the tool plots), crosschecked against independent mpmath high-precision quadrature; Gibbs reference from the analytic partial sums and the Wilbraham-Gibbs constant (2/pi)*Si(pi).',
  reference_citations: [
    'Derived in bench-src/ref/fourier_gen.py. The derived sets reproduce the standard results: square b_n=4/(n*pi) (n odd); sawtooth b_n=2(-1)^(n+1)/(n*pi); triangle b_n=8(-1)^((n-1)/2)/(pi^2 n^2) (n odd); duty-D pulse a_n=sin(2*pi*n*D)/(n*pi), b_n=(1-cos(2*pi*n*D))/(n*pi), mean=D; half-wave rectified sine mean=1/pi, b_1=1/2, a_2k=-(2/pi)/(4k^2-1).',
    'Gibbs limit: peak of the square-wave partial sum -> (2/pi)*Si(pi) = 1.178979744..., i.e. an overshoot of 8.948987 % of the jump (Wilbraham 1848; Gibbs 1899; see e.g. Zygmund, Trigonometric Series, Vol. I, Ch. II).'
  ],
  tolerance: 'a_n, b_n, amplitude: 5e-5 absolute (the table prints 4 decimals). Phase: 0.05 deg (1 decimal printed). Plotted partial sum and target curve: 1e-9 absolute (double-precision arithmetic from identical coefficients). Parseval partial energy: 1e-4. Spectrum bar heights measured from canvas pixels: 1.2 % of full scale (1 px ~ 0.5 %).',
  crosscheck: 'Max absolute deviation between the sympy-symbolic and the mpmath-numeric coefficient sets, per case (all <= 3.5e-18).',
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: errs, console_errors: [...new Set(consoleErrs)], dialogs,
  cases
};
fs.mkdirSync(path.dirname(OUT2), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(OUT2,
  JSON.stringify({ positive_control: control, console: consoleAll }, null, 1));
console.log(`fourier_series: ${passed}/${cases.length} passed`);
console.log('positive control:', JSON.stringify(control));
for (const c of cases.filter(c => !c.pass)) {
  console.log(' FAIL', c.id);
  for (const [k, v] of Object.entries(c.cmp)) if (!v.ok)
    console.log('   ', k, '| got', JSON.stringify(v.got), '| ref', JSON.stringify(v.ref), '|', v.rel === null ? v.reason : 'dev ' + v.rel.toExponential(3));
}
for (const c of cases.filter(c => c.id.startsWith('gibbs')))
  console.log(' gibbs', c.inputs.N, JSON.stringify(c.gibbs));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));
if (dialogs.length) console.log('DIALOGS:', dialogs);
console.log('CONSOLE:', [...new Set(consoleErrs)].slice(0, 3));
process.exit(passed === cases.length && errs.length === 0 ? 0 : 1);
