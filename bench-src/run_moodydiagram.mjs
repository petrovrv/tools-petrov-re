import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build is read out of
   the live page by readPageManifestRevision() and passed to stampProvenance(), which
   writes build, manifest_revision, reference_provenance, provenance_note and run_at and
   refuses to write anything without an observed build. */
const PROVENANCE = {
  reference_provenance: null,
  provenance_note: "bench-src/ref/gen_moody.py is the only candidate generator in this tree and it does NOT reproduce this corpus: re-run on 2026-10-03 it differs on 146 of 1 530 shared leaves, with 29 leaves present only in the deployed corpus and 39 only in the regeneration, so where these reference values come from is not established and the field is left open rather than guessed."
};

/* Every path resolves relative to this driver's own tree: the site root defaults to the
   parent of bench-src, the reference directory to bench-src/ref and the artifact to
   <siteRoot>/benchmarks/moodydiagram.json. --site, --ref-dir and --out override. */
const P = benchPaths({ name: 'moodydiagram', page: 'moodydiagram.html',
                       ref: 'moodydiagram_ref.json', query: { lang: 'en' } });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const byId = Object.fromEntries(REF.cases.map(c => [c.id, c]));

const b = await chromium.launch();
const page = await b.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await page.goto(P.pageUrl, { waitUntil: 'load' });
/* The DiagramUI shell mounts the fields and the tiles after load, so wait for the
   surface this driver addresses to exist rather than for a fixed delay: the first
   framework field, the first tile and the calculation record the readout is checked
   against. A fixed 500 ms was enough for the old inline markup and is not for this one. */
await page.waitForFunction(() => !!window.Diagram && !!window.DiagramUI
  && !!document.getElementById('f-Q-c')
  && !!document.querySelector('.dgu-tile')
  && (() => { try { return !!window.Diagram.record.build(); } catch (e) { return false; } })(),
  null, { timeout: 60000 });
/* The build this artifact names is the manifest_revision of the document the browser
   loaded, not of the file beside this driver. */
const BUILD = await readPageManifestRevision(page);

// --- drive the tool purely through the DOM --------------------------------
// Ported 2026-10-04 to the page's present input surface. The page moved to the
// DiagramUI shell, so the controls and readouts this driver used to address are gone:
//   - every input id is now a framework field id: #<key> became #f-<key>-c, and the
//     fluid and material pickers are <div id="f-fluid-c"> / <div id="f-mat-c"> wrapping
//     their <select>, so a control is resolved through the wrapper;
//   - the three checkboxes are <span class="dgu-toggle" id="f-<key>-c"> around an
//     <input type="checkbox">, driven by their own click handler;
//   - the readout #results .stat with .st-l/.st-v is now .dgu-tile with
//     .dgu-tile-l/.dgu-tile-v, which is the framework's own selector and therefore
//     survives the next page generation;
//   - .regime / .rg-name / .rg-k are gone: the regime word is the calculation record's
//     own `regime` output, the regime sentence is .dgu-verdict, and k+ is a tile;
//   - .hero-val is gone, so the reverse-mode solved bore is read from its tile.
// The loss table (table.tbl), the uncertainty band (.band-v), the warning blocks
// (.alert) and the curve table (table.tbl.small) are unchanged and are still read by
// the same selectors. Transport, reference, tolerances and the case set are unchanged.
async function run(inp, showTable = false) {
  return await page.evaluate(async ([inp, showTable]) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // a framework field: the control is the element itself or lives inside its wrapper
    const ctl = key => {
      const h = document.getElementById('f-' + key + '-c');
      if (!h) return null;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(h.tagName)) return h;
      return h.querySelector('select,input,textarea');
    };
    const set = (key, v) => {
      const e = ctl(key); if (!e) return;
      e.value = String(v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const chk = (key, v) => {
      const h = document.getElementById('f-' + key + '-c'); if (!h) return;
      const e = h.matches('input[type="checkbox"]') ? h : h.querySelector('input[type="checkbox"]');
      if (!e) return;
      if (!!e.checked !== !!v) e.click();
    };
    // fluid first (it rewrites t-range and p defaults), then everything else
    if (inp.fluid) { set('fluid', inp.fluid); await wait(60); }
    set('mat', inp.mat);
    if (inp.dcustom != null) { set('dmode', 'custom'); await wait(30); set('dcustom', inp.dcustom); }
    else { set('dmode', 'dn'); await wait(30); set('dn', inp.dn); }
    set('age', inp.age ?? 0);
    set('thick', inp.thick ?? 1.5);
    set('t', inp.t); set('p', inp.p);
    if (inp.v != null) { set('fmode', 'v'); await wait(30); set('v', inp.v); }
    else { set('fmode', 'Q'); await wait(30); set('Q', inp.Q); }
    chk('normal', false);
    set('L', inp.L); set('dz', inp.dz ?? 0); set('sumK', inp.sumK ?? 0);
    set('eta', inp.eta ?? 70); set('g', inp.g ?? 9.80665);
    set('mode', inp.mode ?? 'direct');
    await wait(30);
    if (inp.targetDp != null) set('targetDp', inp.targetDp);
    chk('showAll', false); chk('showTable', showTable);
    await wait(260);

    // The old inline markup wrapped the exponent in <sup>, which innerText flattened to
    // ASCII ("1.00·10-6"). The framework prints real Unicode superscript characters
    // ("1.00·10⁻⁶"), so the exponent is folded to ASCII before it is parsed; without
    // this the mantissa alone was read and nu came out 1e7 times too large.
    const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
      '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
      '⁻': '-', '⁺': '+' };
    const unsup = t => String(t).split('').map(c => (SUP[c] !== undefined ? SUP[c] : c)).join('');
    const num = s => {
      if (s == null) return null;
      s = unsup(String(s).replace(/ | /g, ' ')).trim();
      // scientific form rendered as "1.00·10-6"
      const sci = s.match(/^(-?[\d.,]+)\s*[·x*×]\s*10\s*\^?\s*([-+]?\d+)/);
      if (sci) return parseFloat(sci[1].replace(/,/g, '')) * Math.pow(10, parseInt(sci[2], 10));
      const m = s.match(/-?[\d.,]+([eE][-+]?\d+)?/);
      if (!m) return null;
      return parseFloat(m[0].replace(/,/g, ''));
    };
    // the printed readout: .dgu-tile, keyed by the tile's own English label with the
    // learn-button "?" the framework appends stripped off
    const stats = {};
    document.querySelectorAll('.dgu-tile').forEach(el => {
      const l = el.querySelector('.dgu-tile-l'), v = el.querySelector('.dgu-tile-v');
      if (!l || !v) return;
      stats[l.textContent.replace(/\?\s*$/, '').trim()] = v.textContent.trim();
    });
    const rows = {};
    document.querySelectorAll('table.tbl:not(.small) tr').forEach(tr => {
      if (tr.cells.length >= 2) rows[tr.cells[0].textContent.trim()] = tr.cells[1].textContent.trim();
    });
    const band = document.querySelector('.band-v');
    const verdict = document.querySelector('.dgu-verdict');
    const warns = [...document.querySelectorAll('.alert')].map(a => ({
      lvl: [...a.classList].filter(c => c !== 'alert').join(','),
      text: a.textContent.trim().slice(0, 300)
    }));
    let table = null;
    if (showTable) {
      const t = document.querySelector('table.tbl.small');
      if (t) table = [...t.rows].slice(1).map(r => [...r.cells].slice(1).map(c => num(c.textContent)));
    }
    const key = (o, re) => { const k = Object.keys(o).find(k => re.test(k)); return k ? num(o[k]) : null; };
    // the calculation record is the page's own machine-readable state; the regime word
    // it publishes replaces the .regime class the old markup carried
    let rec = null;
    try { rec = window.Diagram.record.build(); } catch (e) { rec = null; }
    const ro = (rec && rec.outputs) || {};
    return {
      raw: { stats, rows },
      Re: key(stats, /^Reynolds/),
      f: key(stats, /friction factor/i),
      v: key(stats, /^Velocity/),
      Q_m3h: key(stats, /^Flow rate/),
      rho: key(stats, /^Density/),
      nu: key(stats, /Kinematic/),
      hMaj: key(rows, /along the length|wall slip/i),
      hMin: key(rows, /Minor losses/i),
      hF: key(rows, /Total hydraulic loss/i),
      dpFric_bar: key(rows, /Friction pressure drop/i),
      dpElev_bar: key(rows, /(Static|Elevation|geodetic|height)/i),
      dpTot_bar: key(rows, /Total pressure drop/i),
      power_kW: key(rows, /Pumping power/i),
      regime_class: ro.regime == null ? null : 'r-' + String(ro.regime),
      regime_name: verdict ? verdict.textContent.trim() : null,
      kPlus: key(stats, /^k⁺|^k\+/),
      band: band ? band.textContent.trim() : null,
      // reverse mode prints the solved bore as a tile instead of the old .hero-val
      hero: key(stats, /diameter|bore|^D\b/i),
      warns, table,
      lossRowLabels: Object.keys(rows)
    };
  }, [inp, showTable]);
}

const cases = [];
const push = (o) => cases.push(o);

function cmpBlock(got, ref, spec) {
  const cmp = {};
  let worst = 0;
  for (const [k, s] of Object.entries(spec)) {
    const g = got[k], e = ref[k];
    if (e == null) continue;
    if (g == null || !isFinite(g)) { cmp[k] = { got: g, ref: e, rel: null, ok: false, reason: 'missing' }; worst = Infinity; continue; }
    const abs = Math.abs(g - e);
    const rel = abs / Math.max(Math.abs(e), 1e-30);
    const ok = abs <= s.abs || rel <= s.rel;
    cmp[k] = { got: g, ref: e, rel, abs, ok, tol: `rel<=${s.rel} or abs<=${s.abs}` };
    if (!ok) worst = Math.max(worst, rel);
  }
  return { cmp, worst };
}

// ===========================================================================
// 1. Colebrook table probe: the tool prints colebrook(Re, eps/D) verbatim.
//    Display = 4 decimals -> quantum 1e-4, half-quantum 5e-5.
// ===========================================================================
{
  const r = await run({ fluid: 'water', t: 20, p: 3, mat: 'steel', dcustom: 105.3, v: 2, L: 100, sumK: 0, dz: 0 }, true);
  const T = byId['colebrook-table'].table;
  for (let i = 0; i < T.length; i++) {
    for (let j = 0; j < T[i].length; j++) {
      const ref = T[i][j];
      const got = r.table ? r.table[i][j] : null;
      const abs = got == null ? Infinity : Math.abs(got - ref.f);
      const rel = got == null ? null : abs / ref.f;
      const ok = abs <= 5.05e-5;
      push({
        id: `colebrook/eps=${ref.eps}/Re=${ref.Re.toExponential(0)}`,
        note: 'Colebrook-White f printed by the tool\'s own "diagram curves as numbers" table',
        inputs: { showTable: true, eps_over_D: ref.eps, Re: ref.Re },
        cmp: { f: { got, ref: ref.f, rel, abs, ok, tol: 'abs<=5.05e-5 (tool prints 4 decimals)' } },
        crosscheck: { brentq_vs_fixedpoint_rel: ref.crosscheck_rel },
        worst_rel: rel == null ? null : rel, pass: ok
      });
    }
  }
}

// ===========================================================================
// 2. Full hydraulic cases
// ===========================================================================
const SPEC = {
  Re: { rel: 3e-3, abs: 0 },            // 4 sig. digits, but only 3 once fmt() switches to 1.99e7 form
  f: { rel: 3e-3, abs: 5.05e-5 },       // printed to 4 decimals
  rho: { rel: 1e-3, abs: 0 },           // 4 significant digits
  nu: { rel: 6e-3, abs: 0 },            // 3 significant digits
  v: { rel: 1e-2, abs: 5.05e-3 },       // 2 decimals
  Q_m3h: { rel: 5e-3, abs: 0 },         // 3 significant digits
  hMaj: { rel: 2e-3, abs: 5.05e-3 },    // 2 decimals, m
  hMin: { rel: 2e-3, abs: 5.05e-3 },
  hF: { rel: 2e-3, abs: 5.05e-3 },
  dpFric_bar: { rel: 2e-3, abs: 5.05e-4 },
  dpElev_bar: { rel: 2e-3, abs: 5.05e-4 },
  dpTot_bar: { rel: 2e-3, abs: 5.05e-4 },
  power_kW: { rel: 5e-3, abs: 0 },
  kPlus: { rel: 6e-2, abs: 5.05e-2 },   // 1 decimal only
};

for (const c of REF.cases.filter(c => c.kind === 'hydraulic')) {
  const got = await run(c.inputs);
  const refUse = Object.assign({}, c.ref);
  if (!c.inputs.dz) delete refUse.dpElev_bar;   // row is not rendered when dz = 0
  const { cmp, worst } = cmpBlock(got, refUse, SPEC);
  // independent identity check: does dp follow Darcy-Weisbach from the tool's OWN f?
  const D = c.inputs.dcustom / 1000, g = c.inputs.g, v = c.inputs.v;
  const idDp = got.f != null && got.rho != null
    ? got.rho * (got.f * (c.inputs.L / D) + c.inputs.sumK) * v * v / 2 / 1e5 : null;
  // The identity can only be verified to the precision the tool PRINTS:
  // f carries 4 decimals (half-quantum 5e-5) and dp 3 decimals of bar (5e-4 bar).
  const idTol = idDp == null ? null :
    5e-5 / Math.max(got.f, 1e-12) + 5e-4 / Math.max(Math.abs(got.dpFric_bar), 1e-12) + 1e-4;
  const identity = idDp == null ? null : {
    dp_from_tool_own_f_bar: idDp, dp_shown_bar: got.dpFric_bar,
    rel: Math.abs(idDp - got.dpFric_bar) / Math.max(Math.abs(idDp), 1e-30),
    tol_from_display_rounding: idTol,
    ok: Math.abs(idDp - got.dpFric_bar) / Math.max(Math.abs(idDp), 1e-30) <= idTol
  };
  const ok = worst === 0 || Object.values(cmp).every(x => x.ok);
  push({
    id: c.id, note: c.note, inputs: c.inputs, cmp,
    identity_darcy_weisbach: identity,
    regime: { got: got.regime_class, expected: c.expect_regime ?? null },
    coolprop: c.coolprop,
    warnings: got.warns.map(w => w.lvl + ': ' + w.text.slice(0, 120)),
    band: got.band,
    worst_rel: isFinite(worst) ? worst : null,
    pass: ok && (identity == null || identity.ok)
  });
}

// ===========================================================================
// 3. Critical / transition zone 2300 < Re < 4000
// ===========================================================================
for (const c of REF.cases.filter(c => c.kind === 'critical')) {
  const got = await run(c.inputs);
  const r = c.ref;
  const dev = x => got.f == null ? null : Math.abs(got.f - x) / x;
  const declared = dev(r.f_tool_declared_blend);
  const isCrit = got.regime_class === 'r-critical';
  const warned = got.warns.some(w => /critical zone|2300|4000|no reliable/i.test(w.text));
  push({
    id: c.id, note: c.note, inputs: c.inputs,
    cmp: {
      Re: { got: got.Re, ref: r.Re, rel: Math.abs(got.Re - r.Re) / r.Re, ok: Math.abs(got.Re - r.Re) / r.Re <= 1e-3 },
      f: {
        got: got.f, ref: r.f_tool_declared_blend, rel: declared,
        ok: (got.f != null && Math.abs(got.f - r.f_tool_declared_blend) <= 5.05e-5),
        tol: 'abs<=5.05e-5 vs the linear blend the source declares'
      }
    },
    branches: {
      f_laminar_64_over_Re: r.f_laminar_64_Re,
      f_colebrook_at_same_Re: r.f_colebrook,
      f_linear_blend: r.f_tool_declared_blend,
      dev_from_laminar: dev(r.f_laminar_64_Re),
      dev_from_colebrook: dev(r.f_colebrook)
    },
    regime: { got: got.regime_class, expected: 'r-critical' },
    labelled_uncertain: isCrit && warned,
    warnings: got.warns.map(w => w.lvl + ': ' + w.text.slice(0, 140)),
    worst_rel: declared,
    pass: !!(got.f != null && Math.abs(got.f - r.f_tool_declared_blend) <= 5.05e-5 && isCrit && warned)
  });
}

// ===========================================================================
// 4. Continuity across the regime boundaries Re = 2300 and Re = 4000
//    (does f jump?) - swept with the velocity input on a fixed pipe.
// ===========================================================================
{
  const base = { fluid: 'water', t: 20, p: 3, mat: 'drawn', dcustom: 10, L: 10, sumK: 0, dz: 0 };
  const rho = 998.2, mu = 1.002e-3, D = 0.010;
  const vOf = Re => Re * mu / (rho * D);
  const sweep = [];
  for (const Re of [2200, 2290, 2299, 2301, 2310, 2400, 3000, 3900, 3990, 3999, 4001, 4010, 4100, 5000]) {
    const v = vOf(Re);
    const r = await run({ ...base, v: +v.toFixed(9) });
    sweep.push({ Re_target: Re, v, Re_shown: r.Re, f: r.f, regime: r.regime_class });
  }
  const jump = (a, b) => Math.abs(a - b) / Math.max(a, b);
  const j2300 = jump(sweep.find(s => s.Re_target === 2299).f, sweep.find(s => s.Re_target === 2301).f);
  const j4000 = jump(sweep.find(s => s.Re_target === 3999).f, sweep.find(s => s.Re_target === 4001).f);
  push({
    id: 'regime-continuity', note: 'f across the Re=2300 and Re=4000 branch boundaries',
    inputs: { ...base, v: 'swept so that Re hits the listed targets' },
    sweep,
    cmp: {
      jump_at_2300: { got: j2300, ref: 0, rel: j2300, ok: j2300 <= 5e-3, tol: 'relative jump <= 0.5% (display quantum) for a continuous blend' },
      jump_at_4000: { got: j4000, ref: 0, rel: j4000, ok: j4000 <= 5e-3, tol: 'relative jump <= 0.5%' }
    },
    worst_rel: Math.max(j2300, j4000),
    pass: j2300 <= 5e-3 && j4000 <= 5e-3
  });
}

// ===========================================================================
// 5. Smooth-pipe limit and fully-rough limit, read off the tool's own table
// ===========================================================================
{
  const lim = byId['limits'];
  // the table row eps/D = 1e-6 at Re = 1e4..1e8 is the tool's smooth branch
  const r = await run({ fluid: 'water', t: 20, p: 3, mat: 'steel', dcustom: 105.3, v: 2, L: 100, sumK: 0, dz: 0 }, true);
  const smoothRow = r.table[8];                      // eps/D = 1e-6
  const cmp = {};
  let bad = false;
  lim.smooth.forEach((s, i) => {
    const got = smoothRow[i];
    // reference: Colebrook at the tool's own eps/D=1e-6, not at 0 - use ref table
    const refC = byId['colebrook-table'].table[8][i].f;
    const okC = Math.abs(got - refC) <= 5.05e-5;
    cmp[`Re=1e${4 + i}`] = {
      got, ref: refC, rel: Math.abs(got - refC) / refC, ok: okC,
      prandtl_smooth_law: s.f_prandtl, colebrook_eps0: s.f_colebrook_eps0,
      colebrook_eps0_vs_prandtl_rel: s.rel_dev
    };
    if (!okC) bad = true;
  });
  push({
    id: 'smooth-limit', note: 'eps/D = 1e-6 branch vs Colebrook; Prandtl smooth law carried as a second reference',
    inputs: { showTable: true, eps_over_D: 1e-6 }, cmp,
    crosscheck: { colebrook_eps0_vs_prandtl_max_rel: Math.max(...lim.smooth.map(s => s.rel_dev)) },
    worst_rel: Math.max(...Object.values(cmp).map(x => x.rel)), pass: !bad
  });
  const cmp2 = {};
  let bad2 = false;
  lim.rough.forEach((s, i) => {
    const rowIdx = [0, 1, 2, 3, 4][i];               // eps/D 0.05,0.02,0.006,0.002,0.0006
    const got = r.table[rowIdx][4];                  // Re = 1e8
    const refC = byId['colebrook-table'].table[rowIdx][4].f;
    const okC = Math.abs(got - refC) <= 5.05e-5;
    cmp2[`eps=${s.relEps}`] = {
      got, ref: refC, rel: Math.abs(got - refC) / refC, ok: okC,
      von_karman_fully_rough: s.f_vonkarman, colebrook_vs_vonkarman_rel: s.rel_dev
    };
    if (!okC) bad2 = true;
  });
  push({
    id: 'fully-rough-limit', note: 'Re = 1e8 column vs Colebrook; von Karman fully-rough law as second reference',
    inputs: { showTable: true, Re: 1e8 }, cmp: cmp2,
    crosscheck: { colebrook_vs_vonkarman_max_rel: Math.max(...lim.rough.map(s => s.rel_dev)) },
    worst_rel: Math.max(...Object.values(cmp2).map(x => x.rel)), pass: !bad2
  });
}

// ===========================================================================
// 6. Which correlation is it really? Colebrook vs Haaland vs Swamee-Jain
// ===========================================================================
{
  const pts = byId['approx-discriminators'].points.filter(p => p.relEps > 0);
  const r = await run({ fluid: 'water', t: 20, p: 3, mat: 'steel', dcustom: 105.3, v: 2, L: 100, sumK: 0, dz: 0 }, true);
  // reuse the printed table: eps/D 1e-2 not present; use 2e-2 / 2e-3 / 2e-4 rows
  const probes = [[1, 2e-2], [3, 2e-3], [5, 2e-4]];
  const detail = [];
  for (const [row, e] of probes) {
    for (let j = 0; j < 5; j++) {
      const Re = Math.pow(10, 4 + j);
      const got = r.table[row][j];
      const cb = byId['colebrook-table'].table[row][j].f;
      const ha = 1 / Math.pow(-1.8 * Math.log10(Math.pow(e / 3.7, 1.11) + 6.9 / Re), 2);
      const sj = 0.25 / Math.pow(Math.log10(e / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
      detail.push({
        Re, eps: e, got, colebrook: cb, haaland: ha, swamee_jain: sj,
        d_colebrook: Math.abs(got - cb), d_haaland: Math.abs(got - ha), d_swamee: Math.abs(got - sj)
      });
    }
  }
  const sums = {
    colebrook: detail.reduce((a, d) => a + d.d_colebrook, 0),
    haaland: detail.reduce((a, d) => a + d.d_haaland, 0),
    swamee_jain: detail.reduce((a, d) => a + d.d_swamee, 0)
  };
  const winner = Object.entries(sums).sort((a, b) => a[1] - b[1])[0][0];
  push({
    id: 'correlation-identification',
    note: 'Total |deviation| of the printed f from each candidate correlation over 15 grid points',
    inputs: { showTable: true }, detail, sums, identified_as: winner,
    cmp: { identified: { got: winner, ref: 'colebrook', rel: 0, ok: winner === 'colebrook' } },
    worst_rel: sums.colebrook, pass: winner === 'colebrook'
  });
}

// ===========================================================================
// 7. Water properties vs CoolProp (IAPWS-95), at the tool's own stated
//    uncertainty. The tool declares rho +-0.1% / mu +-1% on the saturation
//    line, and warns above 250 C & 150 bar.
// ===========================================================================
for (const p of byId['water-property-survey'].points) {
  const got = await run({ fluid: 'water', t: p.t, p: p.p_bar, mat: 'steel', dcustom: 105.3, v: 2, L: 100, sumK: 0, dz: 0 });
  // compare what the tool ACTUALLY prints with CoolProp (the pre-computed
  // p.rho_rel / p.mu_rel describe the frozen tool table this file was generated
  // from, not the live page, and must not decide the verdict)
  const nu_cp = p.mu_coolprop / p.rho_coolprop;
  const relRho = Math.abs(got.rho - p.rho_coolprop) / p.rho_coolprop;
  const relNu = Math.abs(got.nu - nu_cp) / nu_cp;
  const okRho = relRho <= 0.01, okMu = relNu <= 0.02;
  const warned = got.warns.some(w => /pressure|density|6%|not modelled/i.test(w.text));
  push({
    id: `water-props/t=${p.t}C/p=${p.p_bar}bar`,
    note: 'tool table (saturation line, pressure-independent) vs CoolProp IAPWS-95 at the actual (T,p)',
    inputs: { fluid: 'water', t: p.t, p: p.p_bar },
    cmp: {
      rho: { got: got.rho, ref: p.rho_coolprop, rel: relRho, ok: okRho, tol: 'rel<=1%' },
      nu: { got: got.nu, ref: nu_cp, rel: relNu, ok: okMu, tol: 'rel<=2%' }
    },
    frozen_table_dev: { rho_rel: p.rho_rel, mu_rel: p.mu_rel,
      note: 'deviation of the saturation-line table this reference file was generated from, kept for provenance only' },
    psat_bar: p.psat_bar,
    tool_table_rho: p.rho_tool_table, tool_table_mu: p.mu_tool_table,
    coolprop_rho: p.rho_coolprop, coolprop_mu: p.mu_coolprop,
    pressure_warning_shown: warned,
    warnings: got.warns.map(w => w.lvl + ': ' + w.text.slice(0, 110)),
    worst_rel: Math.max(relRho, relNu),
    pass: okRho && okMu
  });
}


// ===========================================================================
// 7b. Air properties vs CoolProp (Lemmon air EOS). Tool declares +-2%.
// ===========================================================================
for (const p of byId['air-property-survey'].points) {
  const got = await run({ fluid: 'air', t: p.t, p: p.p_bar, mat: 'steel', dcustom: 105.3, v: 10, L: 100, sumK: 0, dz: 0 });
  // the tool's own declared band: +-1% below 100 bar, +-2% at and above 100 bar
  const tol = p.p_bar >= 100 ? 0.02 : 0.01;
  const rRho = Math.abs(got.rho - p.rho_coolprop) / p.rho_coolprop;
  const rNu = Math.abs(got.nu - p.nu_coolprop) / p.nu_coolprop;
  push({
    id: `air-props/t=${p.t}C/p=${p.p_bar}bar`,
    note: 'tool air model (ideal gas + 2-term Z fit, Sutherland + density-corrected mu) vs CoolProp',
    inputs: { fluid: 'air', t: p.t, p: p.p_bar },
    cmp: {
      rho: { got: got.rho, ref: p.rho_coolprop, rel: rRho, ok: rRho <= tol, tol: `rel<=${tol} (tool's declared property uncertainty)` },
      nu:  { got: got.nu,  ref: p.nu_coolprop,  rel: rNu,  ok: rNu <= tol + 0.01, tol: `rel<=${tol + 0.01}` }
    },
    warnings: got.warns.map(w => w.lvl + ': ' + w.text.slice(0, 110)),
    worst_rel: Math.max(rRho, rNu), pass: rRho <= tol && rNu <= tol + 0.01
  });
}

// ===========================================================================
// 8. Reverse mode self-consistency: solved D must reproduce the target dp
// ===========================================================================
{
  const inp = { fluid: 'water', t: 20, p: 3, mat: 'steel', dcustom: 105.3, Q: 60, L: 500, sumK: 0, dz: 0, mode: 'reverse', targetDp: 1.0 };
  const got = await run(inp);
  const D = got.hero / 1000;
  // independent reference: solve Darcy-Weisbach + Colebrook for D ourselves
  const rho = 998.2, mu = 1.002e-3, eps = 0.045e-3, Qs = 60 / 3600, L = 500;
  const colebrook = (Re, e) => {
    let x = -2 * Math.log10(e / 3.7 + 12 / Re);
    for (let i = 0; i < 200; i++) {
      const xn = -2 * Math.log10(e / 3.7 + 2.51 * x / Re);
      if (Math.abs(xn - x) < 1e-15) { x = xn; break; } x = xn;
    }
    return 1 / (x * x);
  };
  const dpOf = Dt => {
    const A = Math.PI * Dt * Dt / 4, v = Qs / A, Re = rho * v * Dt / mu;
    const f = Re < 2300 ? 64 / Re : colebrook(Re, eps / Dt);
    return rho * f * (L / Dt) * v * v / 2;
  };
  let lo = 0.005, hi = 2.0;
  for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (dpOf(m) > 1e5) lo = m; else hi = m; }
  const Dref = Math.sqrt(lo * hi);
  const rel = Math.abs(D - Dref) / Dref;
  push({
    id: 'reverse-solve', note: 'reverse mode: find D for dp = 1.000 bar, Q = 60 m3/h, 500 m steel line',
    inputs: inp,
    cmp: { D_mm: { got: got.hero, ref: Dref * 1000, rel, ok: rel <= 2e-3, tol: 'rel<=2e-3 (tool prints 1 decimal of mm)' } },
    dp_at_solved_D_bar: dpOf(D) / 1e5,
    worst_rel: rel, pass: rel <= 2e-3
  });
}

await b.close();

const passed = cases.filter(c => c.pass).length;
const out = {
  tool: 'moodydiagram',
  file: 'moodydiagram.html',
  reference: 'Colebrook-White solved to machine precision with scipy.optimize.brentq (cross-checked against an independent fixed-point iteration, mutual agreement 5.7e-16); Darcy-Weisbach in closed form; Prandtl smooth-pipe and von Karman fully-rough laws as limiting references; CoolProp (IAPWS-95 for water, Lemmon et al. air EOS) for every fluid property, including the properties fed into the hydraulic reference cases.',
  reference_citations: [
    'C.F. Colebrook, "Turbulent flow in pipes, with particular reference to the transition region between the smooth and rough pipe laws", J. Inst. Civ. Eng. 11 (1939) 133-156.',
    'L.F. Moody, "Friction factors for pipe flow", Trans. ASME 66 (1944) 671-684.',
    'IAPWS R6-95(2018) formulation for the thermodynamic properties of ordinary water substance, and IAPWS R12-08 for viscosity, as implemented in CoolProp 6.x.',
    'W.H. McAdams / L. Prandtl smooth-pipe law 1/sqrt(f) = 2 log10(Re sqrt(f)) - 0.8 and the von Karman fully-rough law 1/sqrt(f) = -2 log10((eps/D)/3.7).',
    'S.E. Haaland, J. Fluids Eng. 105 (1983) 89-90; P.K. Swamee & A.K. Jain, J. Hydraul. Div. ASCE 102 (1976) 657-664 - used only as discriminators.'
  ],
  tolerance: 'Friction factor: |dev| <= 5.05e-5 absolute (the tool prints 4 decimals). Re, rho, Q, power: 1e-3..5e-3 relative (4 significant digits printed; nu is printed to 3). Heads: 5.05e-3 m absolute (2 decimals). Pressure drops: 5.05e-4 bar absolute (3 decimals). Water properties vs CoolProp: 1% on rho / 2% on nu (the tool now declares +-0.5%, so the criterion is deliberately no tighter than twice the declared band). Air properties vs CoolProp: 1% on rho below 100 bar and 2% at or above it, matching the tool\'s own declared figure, with 1 percentage point added for nu because it is printed to only 3 significant digits.',
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: errs,
  cases
};
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`moodydiagram: ${passed}/${cases.length} passed`);
for (const c of cases.filter(c => !c.pass)) {
  const bad = Object.entries(c.cmp || {}).filter(([, x]) => !x.ok)
    .map(([k, x]) => `${k}: got ${x.got} ref ${typeof x.ref === 'number' ? Number(x.ref).toPrecision(6) : x.ref} rel ${x.rel == null ? 'n/a' : Number(x.rel).toExponential(2)}`).join('; ');
  console.log(' FAIL', c.id, bad || '(structural)');
}
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 8));
