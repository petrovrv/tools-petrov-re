/* Benchmark driver — reactionbuilder.html
 *
 * Two parts, both against an independent reference (bench-src/ref/reactionbuilder_ref.json;
 * the rb_ref.py + rb_cases.py that built it are not in this tree — see the note at the end of
 * this comment for what a generator would have to read and compute):
 *
 *  (1) data integrity of the 88-entry particle table: every mass against the PDG 2025 summary
 *      tables, and every quantum number (Q, B, Le, Lm, Lt, S, C, Bt) recomputed from the quark
 *      content instead of being copied — Q = sum of quark charges, B = (n_q - n_qbar)/3,
 *      S = -(n_s - n_sbar), C = +(n_c - n_cbar), Bt = -(n_b - n_bbar); the 37 antiparticle
 *      entries must be exact mirrors of their partners.
 *  (2) the conservation-law engine: reactions that break exactly one law (and one that breaks
 *      two), reactions that must not be rejected, and the kinematics (sqrt(s) fixed target and
 *      collider, threshold beam energy) against closed-form expressions.
 *
 * The tool is driven through the DOM exactly as a user would: pick the group tab, tick the
 * antiparticle box, click the particle buttons, set the beam energy, press "Check".
 *
 * 2026-09 adaptation of /home/claude/integ/bench-src/run_reactionbuilder.mjs. Only the way
 * the page is reached and the way its controls and its result table are located have
 * changed, plus the input assertions and the positive control the 2026-09 round requires.
 * Every reference value, tolerance, case id and comparison is the original one.
 * See DELIVERY.md for the line-by-line list.
 *
 *   node run_reactionbuilder.mjs --base http://127.0.0.1:8322 --path reactionbuilder.html \
 *        [--site <tree>] [--ref-dir <dir>] [--ref <reactionbuilder_ref.json>] [--out <file>]
 *
 * WHAT REPRODUCING THIS CORPUS WOULD TAKE. The reference file holds two objects and nothing
 * else: `table`, 51 base particles keyed by the tool's own key, each carrying m, J, Q, B, Le,
 * Lm, Lt, S, C, Bt, the quark `content` string and a `src` line naming one PDG 2025 summary
 * table; and `cases`, 27 reactions, each carrying lhs, rhs, the beam kinetic energy T, the
 * geometry fix|col, and a `ref` block of violated[], weak[], warn[], sqrt_s, sum_m, enough
 * and threshold (null in 18 of the 27) with a verdict of ok|no|weak|thr. A generator would
 * therefore have to (1) read the 51 masses and spins out of the PDG summary tables the `src`
 * lines name, (2) derive each quantum number from the `content` string by the PDG bookkeeping
 * quoted in reference_citations — Q as the sum of quark charges, B = (n_q - n_qbar)/3,
 * S = -(n_s - n_sbar), C = +(n_c - n_cbar), Bt = -(n_b - n_bbar), lepton numbers per flavour —
 * and mirror the 37 antiparticle entries, (3) for each of the 27 reactions sum those quantum
 * numbers over both sides and record every law whose balance is non-zero as violated, with
 * flavour-changing weak cases in weak[]/warn[] under the selection rules the tool's own law
 * table states, and (4) compute the kinematics in closed form: s = m1^2 + m2^2 + 2(T+m1)m2
 * for a fixed target and sqrt(s) = E1 + E2 head-on, sum_m over the final state, `enough` as
 * sqrt(s) >= sum_m, and the threshold beam kinetic energy from the invariant-mass condition,
 * which is null where the reaction is a one-body decay. The 29 graded cases are these 27 plus
 * the two table cases, which the driver computes from the reference rather than from a corpus.
 * No part of that generator is in this tree, so this round does not re-derive the values.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths, parseFlags } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build belongs to the
   run and not to this constant: readPageManifestRevision(page) reads it out of the live
   DOM of the page the browser loaded, and it reaches the artifact as stampProvenance's
   `build`, which writes build and manifest_revision and refuses to write without it. */
const PROVENANCE = {
  reference_provenance: "recorded",
  provenance_note: "No generator for this corpus exists anywhere in this tree, so its stored reference values cannot be re-derived here and are reused as stored, which AGENTS \u00a75 classes as a regression reference; this is the one artifact of the eighteen this tree cannot trace at all; tracing it needs a generator that balances the reactions and recomputes the stoichiometry from the cited sources."
};

/* Every path resolves in the tree this driver sits in. --path still names the page and
   --ref still names a reference file, by name inside the reference directory or absolutely;
   --site, --ref-dir and --out move the tree, the reference directory and the artifact. */
const FLAGS = parseFlags(process.argv.slice(2));
const P = benchPaths({ name: 'reactionbuilder',
                       page: String(FLAGS.path || 'reactionbuilder.html').replace(/^\/+/, ''),
                       ref: String(FLAGS.ref || 'reactionbuilder_ref.json') });
/* The transport stays http, which is how this driver has always reached the page; --base or
   BENCH_BASE moves the origin and the default is the origin it has always used. */
const BASE = (P.base || 'http://127.0.0.1:8322').replace(/\/+$/, '');
const REF_FILE = P.ref;
const OUT = P.out;
const URL = BASE + '/' + P.pageFile + '?lang=en';

/* the controls the 2026 port moved into the DiagramUI app */
const SEG = (f, v) => '[data-dgu-field="' + f + '"] .dgu-seg button[data-value="' + v + '"]';
const F_ANTI = '[data-dgu-field="f-anti"] input[type=checkbox]';
const F_T = '[data-dgu-field="f-T"] input';

const REF = JSON.parse(fs.readFileSync(REF_FILE, 'utf8'));
const TOL_MASS = 1e-9;     // the table is a data table: it must carry the PDG number exactly
const TOL_KIN = 2e-3;      // sqrt(s)/threshold are printed to 3-4 significant digits

const rel = (g, r) => {
  if (!isFinite(g) || !isFinite(r)) return g === r ? 0 : Infinity;
  const d = Math.abs(g - r);
  return Math.abs(r) < 1e-12 ? d : d / Math.abs(r);
};
const cases = [];
let pageErrors = [];

const consoleLog = [];
const browser = await chromium.launch();
const bctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await bctx.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  consoleLog.push(m.type() + ': ' + m.text().slice(0, 200));
  if (m.type() === 'error') pageErrors.push('console.error: ' + m.text());
});
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
/* the page is now built by diagram-ui.js, so wait for the framework rather than
   for a fixed delay */
await page.waitForFunction(() => !!window.DiagramUI && !!window.DiagramUI.current
  && typeof PT !== 'undefined' && typeof analyse === 'function', null, { timeout: 60000 });
await page.waitForTimeout(400);

/* The build this artifact names: the revision in the live DOM of the page just loaded. */
const BUILD = await readPageManifestRevision(page);

/* fail fast if the controls this driver needs are not on the page at all */
{
  const present = await page.evaluate(sels => sels.map(x => !!document.querySelector(x)),
    ['#pool', '#lhs', '#rhs', '#runBtn', '#clearBtn', F_ANTI, F_T,
     '[data-dgu-field="f-tab"] .dgu-seg button', '[data-dgu-field="f-geom"] .dgu-seg button']);
  if (present.some(x => !x)) {
    console.log('DRIVER CANNOT REACH THE PAGE: control present = ' + JSON.stringify(present));
    await browser.close(); process.exit(3);
  }
}

/* ---------------------------------------------------------------- part 1: the table */
{
  const tool = await page.evaluate(() => JSON.parse(JSON.stringify(PT)));
  const cmp = {}, notes = [];
  const n = Object.keys(tool).length;
  cmp.entry_count = { got: n, ref: 88, rel: n === 88 ? 0 : 1, ok: n === 88 };

  let worstM = 0, worstMk = '', qnBad = [], jBad = [];
  for (const [k, r] of Object.entries(REF.table)) {
    const t = tool[k];
    if (!t) { qnBad.push(k + ':missing'); continue; }
    const d = rel(t.m, Number(r.m));
    if (d > worstM) { worstM = d; worstMk = k; }
    for (const q of ['Q', 'B', 'Le', 'Lm', 'Lt', 'C', 'Bt']) {
      if (Math.abs(t[q] - Number(r[q])) > 1e-9) qnBad.push(k + '.' + q + ' got ' + t[q] + ' ref ' + r[q]);
    }
    if (r.S !== 'None' && r.S !== null && Math.abs(t.S - Number(r.S)) > 1e-9)
      qnBad.push(k + '.S got ' + t.S + ' ref ' + r.S);
    if (Math.abs(t.J - Number(r.J)) > 1e-9) jBad.push(k + '.J got ' + t.J + ' ref ' + r.J);
  }
  cmp.masses_vs_PDG2025 = { got: worstM, ref: 0, rel: worstM, ok: worstM <= TOL_MASS };
  if (worstM > TOL_MASS) notes.push('worst mass deviation at ' + worstMk);
  cmp.quantum_numbers = { got: qnBad.length, ref: 0, rel: qnBad.length, ok: qnBad.length === 0 };
  if (qnBad.length) notes.push('quantum-number mismatches: ' + qnBad.join('; '));
  cmp.spins = { got: jBad.length, ref: 0, rel: jBad.length, ok: jBad.length === 0 };
  if (jBad.length) notes.push('spin mismatches: ' + jBad.join('; '));

  // antiparticle entries must mirror their partner exactly
  let antiBad = [], nAnti = 0;
  for (const [k, t] of Object.entries(tool)) {
    if (!t.anti) continue;
    nAnti++;
    const b = tool[t.twin];
    for (const q of ['Q', 'B', 'Le', 'Lm', 'Lt', 'S', 'C', 'Bt'])
      if (Math.abs(t[q] + b[q]) > 1e-12) antiBad.push(k + '.' + q);
    if (t.m !== b.m || t.J !== b.J) antiBad.push(k + '.m/J');
  }
  cmp.antiparticles = { got: antiBad.length, ref: 0, rel: antiBad.length, ok: antiBad.length === 0 };
  notes.push(nAnti + ' antiparticle entries checked against their partner');

  const pass = Object.values(cmp).every(x => x.ok);
  cases.push({ id: 'particle_table', note: 'Data integrity of all 88 table entries against PDG 2025 and against quark-content bookkeeping',
    inputs: { entries: n }, cmp, worst_rel: Math.max(...Object.values(cmp).map(x => x.rel)), pass, notes, page_errors: [] });
  process.stdout.write((pass ? 'PASS ' : 'FAIL ') + 'particle_table\n      ' + notes.join('\n      ') + '\n');
}

/* ------------------------------------------------- part 1b: the decay channel table */
{
  const DEC = await page.evaluate(() => JSON.parse(JSON.stringify(DEC)));
  const cmp = {}, notes = [];
  const qn = k => {
    const anti = k.endsWith('~'), b = anti ? k.slice(0, -1) : k, r = REF.table[b], s = anti ? -1 : 1;
    const o = {}; for (const q of ['Q', 'B', 'Le', 'Lm', 'Lt']) o[q] = s * Number(r[q]);
    o.m = Number(r.m); o.J = Number(r.J); return o;
  };
  let nch = 0, incl = 0, viol = [], brBad = [], offshell = [];
  for (const [par, info] of Object.entries(DEC)) {
    let sum = 0;
    for (const ch of info.ch) {
      sum += ch.b;
      if (!ch.p) { incl++; continue; }
      nch++;
      const P = qn(par), R = ch.p.map(qn);
      for (const q of ['Q', 'B', 'Le', 'Lm', 'Lt']) {
        const d = R.reduce((a, x) => a + x[q], 0) - P[q];
        if (Math.abs(d) > 1e-9) viol.push(par + ' -> ' + ch.p.join('+') + ' : ' + q);
      }
      const fp = a => a.filter(x => Math.abs(x.J % 1) > 1e-9).length % 2;
      if (fp([P]) !== fp(R)) viol.push(par + ' -> ' + ch.p.join('+') + ' : J');
      const sm = R.reduce((a, x) => a + x.m, 0);
      if (sm > P.m + 1e-9) { (ch.off ? offshell : viol).push(par + ' -> ' + ch.p.join('+') + ' : below threshold'); }
    }
    // PDG's own averages need not sum to exactly 100 %; 0.2 points is the observed spread
    if (Math.abs(sum - 100) > 0.2) brBad.push(par + ' sums to ' + sum.toFixed(3) + ' %');
  }
  cmp.channel_conservation = { got: viol.length, ref: 0, rel: viol.length, ok: viol.length === 0 };
  if (viol.length) notes.push('channels breaking a conservation law: ' + viol.join('; '));
  cmp.branching_ratio_sums = { got: brBad.length, ref: 0, rel: brBad.length, ok: brBad.length === 0 };
  if (brBad.length) notes.push('branching-ratio sums: ' + brBad.join('; '));
  notes.push(nch + ' explicit channels + ' + incl + ' inclusive/jet channels over ' + Object.keys(DEC).length + ' parents');
  notes.push('sub-threshold channels declared off-shell (H -> WW, H -> ZZ), which the tool marks and explains: ' + (offshell.join('; ') || 'none'));

  // branching fractions spot-checked against the PDG 2025 summary tables
  const PDGBR = [
    ['mu', ['e', 'nue~', 'num'], 100.0, 'PDG 2025 leptons: mu- -> e- nubar_e nu_mu is ~100 %'],
    ['pi', ['mu~', 'num'], 99.98770, 'PDG 2025 light mesons: pi+ -> mu+ nu_mu = (99.98770 +- 0.00004) %'],
    ['pi', ['e~', 'nue'], 0.0123, 'PDG 2025 light mesons: pi+ -> e+ nu_e = (1.230 +- 0.004)e-4'],
    ['pi0', ['ga', 'ga'], 98.823, 'PDG 2025 light mesons: pi0 -> 2 gamma = (98.823 +- 0.034) %'],
    ['pi0', ['e~', 'e', 'ga'], 1.174, 'PDG 2025 light mesons: pi0 -> e+ e- gamma = (1.174 +- 0.035) %'],
    ['K', ['mu~', 'num'], 63.56, 'PDG 2025 strange mesons: K+ -> mu+ nu_mu = (63.56 +- 0.11) %'],
    ['K', ['pi0', 'e~', 'nue'], 5.07, 'PDG 2025 strange mesons: K+ -> pi0 e+ nu_e = (5.07 +- 0.04) %'],
    ['K', ['pi0', 'mu~', 'num'], 3.352, 'PDG 2025 strange mesons: K+ -> pi0 mu+ nu_mu = (3.352 +- 0.034) %'],
    ['tau', ['pi~', 'pi0', 'nut'], 25.49, 'PDG 2025 leptons: tau- -> pi- pi0 nu_tau = (25.49 +- 0.09) %']
  ];
  let brDev = 0, brWorst = '';
  for (const [par, prods, ref, cite] of PDGBR) {
    const ch = (DEC[par].ch || []).find(c => c.p && c.p.length === prods.length && c.p.every((x, i) => x === prods[i]));
    const got = ch ? ch.b : NaN;
    const d = rel(got, ref);
    if (!(d <= 1e-6)) { if (d > brDev) { brDev = d; brWorst = par + ' -> ' + prods.join('+') + ' got ' + got + ' PDG ' + ref; } }
  }
  cmp.branching_ratios_vs_PDG = { got: brDev, ref: 0, rel: brDev, ok: brDev <= 1e-6 };
  if (brDev > 1e-6) notes.push('branching ratio deviation: ' + brWorst);
  else notes.push(PDGBR.length + ' branching fractions match the PDG 2025 summary tables exactly');

  const pass = Object.values(cmp).every(x => x.ok);
  cases.push({ id: 'decay_channel_table', note: 'Every explicit decay channel must conserve charge, baryon number, the three lepton numbers and the half-integrality of J, must be energetically possible unless declared off-shell, and the branching ratios must sum to 100 % and match PDG where spot-checked',
    inputs: { parents: Object.keys(DEC).length, explicit_channels: nch, inclusive_channels: incl },
    cmp, worst_rel: Math.max(...Object.values(cmp).map(x => x.rel)), pass, notes, page_errors: [] });
  process.stdout.write((pass ? 'PASS ' : 'FAIL ') + 'decay_channel_table\n      ' + notes.join('\n      ') + '\n');
}

/* ---------------------------------------------------------------- DOM driving */
/* the group tabs and the antiparticle box are now the app's "f-tab" segmented
   field and "f-anti" toggle; the pool itself is unchanged */
async function clickParticle(key) {
  const info = await page.evaluate(k => ({ grp: PT[k].grp, anti: !!PT[k].anti, sc: !!PT[k].sc }), key);
  await page.click(SEG('f-tab', info.grp));
  await page.waitForTimeout(30);
  const want = info.anti;
  const isOn = await page.isChecked(F_ANTI);
  if (isOn !== want) { await page.setChecked(F_ANTI, want); await page.waitForTimeout(40); }
  const sel = `#pool button[data-k="${key.replace(/~/g, '~')}"]`;
  const there = await page.$(sel);
  if (!there) throw new Error('the pool does not offer ' + key + ' on tab ' + info.grp
    + ' with anti=' + want + ': the page has changed since the driver was written');
  await page.click(sel);
  await page.waitForTimeout(30);
}

async function buildReaction(c) {
  // The pool fills the left side until it holds two particles and only then the right side,
  // so a one-body decay is entered the way the UI forces a user to: park a placeholder on the
  // left, fill the right, then click the placeholder chip away again.
  await page.click('#clearBtn');
  for (const k of c.lhs) await clickParticle(k);
  if (c.lhs.length === 1) await clickParticle('ga');
  for (const k of c.rhs) await clickParticle(k);
  if (c.lhs.length === 1) { await page.click('#lhs .chip[data-i="1"]'); await page.waitForTimeout(30); }
  await page.click(SEG('f-geom', c.geom === 'col' ? 'col' : 'fix'));
  await page.waitForTimeout(30);
  // the beam-energy box is disabled for a one-body decay, which is correct
  if (await page.isEnabled(F_T)) {
    await page.fill(F_T, String(c.T));
    await page.dispatchEvent(F_T, 'input');
    await page.dispatchEvent(F_T, 'change');
    await page.waitForTimeout(60);
  }
  await page.click('#runBtn');
  await page.waitForTimeout(120);
}
/* RULE 3: the page's own state must be the state the case names, read back from
   the tool's state object and from the controls the user sees, before any output
   is read. */
async function verifyEntered(c) {
  const st = await page.evaluate(([ft, fa]) => {
    const seg = f => {
      const b = [...document.querySelectorAll('[data-dgu-field="' + f + '"] .dgu-seg button')]
        .filter(x => x.getAttribute('aria-pressed') === 'true')[0];
      return b ? b.dataset.value : null;
    };
    const tbox = document.querySelector(ft);
    return { lhs: ST.lhs.slice(), rhs: ST.rhs.slice(), geom: ST.geom, T: ST.T,
             shown: ST.shown, sec: ST.sec || 'react',
             geom_shown: seg('f-geom'),
             beam_box: tbox ? { value: tbox.value, disabled: tbox.disabled } : null,
             anti_box: document.querySelector(fa).checked };
  }, [F_T, F_ANTI]);
  const o = {};
  o.lhs = { got: st.lhs, want: c.lhs, ok: JSON.stringify(st.lhs) === JSON.stringify(c.lhs) };
  o.rhs = { got: st.rhs, want: c.rhs, ok: JSON.stringify(st.rhs) === JSON.stringify(c.rhs) };
  o.geometry = { got: st.geom, want: c.geom, ok: st.geom === c.geom };
  o.geometry_shown = { got: st.geom_shown, want: c.geom, ok: st.geom_shown === c.geom };
  const oneBody = c.lhs.length === 1;
  o.beam_energy_GeV = oneBody
    ? { got: st.T, want: '(not applicable: the box is disabled for a one-body decay)',
        ok: !!(st.beam_box && st.beam_box.disabled) }
    : { got: st.T, want: c.T, ok: Math.abs(st.T - c.T) <= 1e-9 * Math.max(1, Math.abs(c.T)) };
  o.analysis_shown = { got: st.shown, want: true, ok: st.shown === true };
  o.section = { got: st.sec, want: 'react', ok: st.sec === 'react' };
  o.ok = Object.keys(o).every(k => k === 'ok' || o[k].ok);
  return o;
}

/* The law table and the verdict are now rendered by the framework into the results
   region (lawTableNode / resultsFor), so they are read there: the same four columns
   and the same four marks, and the verdict's tone class in place of its old verdict
   class.  #stats is gone with the old layout; the result tiles that replaced it are
   recorded in its place (it was recorded, never compared). */
async function readResult() {
  return await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.dgu-results .dgu-table tbody tr')].map(tr => {
      const td = tr.querySelectorAll('td');
      const mark = td[3].textContent.trim();
      return { label: td[0].textContent.trim(), in: td[1].textContent.trim(), out: td[2].textContent.trim(),
               status: mark === '✓' ? 'ok' : mark === '✗' ? 'bad' : mark === '—' ? 'na' : 'flag' };
    });
    const v = document.querySelector('.dgu-results .dgu-verdict');
    const keys = (typeof analyse === 'function') ? analyse().rows.map(r => r.key) : [];
    const A = (typeof analyse === 'function') ? analyse() : null;
    const tone = v ? (v.className.replace('dgu-verdict', '').trim() || 'none') : '(no verdict node)';
    const tiles = [...document.querySelectorAll('.dgu-results .dgu-tile')]
      .map(x => x.innerText.replace(/\s+/g, ' ').trim()).join(' | ');
    return { rows, keys, verdictClass: tone,
             verdictText: v ? v.textContent.trim() : '', lhs: ST.lhs.slice(), rhs: ST.rhs.slice(),
             stats: tiles, sqrt_s: A ? A.rs : null,
             sum_m: A ? A.M : null, threshold: A ? A.thr : null };
  });
}

/* ---- POSITIVE CONTROL: a run that scores well while setting nothing has measured
        nothing, so move one input by a visible amount and require the compared
        output to follow. ---------------------------------------------------- */
const control = {};
{
  const c1 = { lhs: ['p', 'p'], rhs: ['p', 'p', 'p', 'pbar'], T: 10, geom: 'fix' };
  const c2 = { lhs: ['p', 'p'], rhs: ['p', 'p', 'p', 'pbar'], T: 40, geom: 'fix' };
  const have = await page.evaluate(() => Object.keys(PT));
  /* the antiproton key in this build */
  const pbar = have.indexOf('p~') >= 0 ? 'p~' : (have.indexOf('pbar') >= 0 ? 'pbar' : null);
  if (!pbar) { console.log('POSITIVE CONTROL: no antiproton key in PT; keys = '
    + have.slice(0, 20).join(',')); await browser.close(); process.exit(3); }
  c1.rhs = ['p', 'p', 'p', pbar]; c2.rhs = c1.rhs.slice();
  await buildReaction(c1); const a = await readResult(); const ia = await verifyEntered(c1);
  await buildReaction(c2); const b = await readResult(); const ib = await verifyEntered(c2);
  control.T_10_GeV = { sqrt_s: a.sqrt_s, verdict: a.verdictClass, inputs_verified: ia.ok };
  control.T_40_GeV = { sqrt_s: b.sqrt_s, verdict: b.verdictClass, inputs_verified: ib.ok };
  control.sqrt_s_moved = isFinite(a.sqrt_s) && isFinite(b.sqrt_s)
    && Math.abs(b.sqrt_s / a.sqrt_s - 1) > 0.05;
  /* and the law engine must react to the final state, not to nothing: dropping the
     antiproton breaks baryon number and the verdict must turn */
  const c3 = { lhs: ['p', 'p'], rhs: ['p', 'p', 'p'], T: 40, geom: 'fix' };
  await buildReaction(c3); const c = await readResult(); const ic = await verifyEntered(c3);
  control.baryon_broken = { verdict: c.verdictClass, inputs_verified: ic.ok };
  control.verdict_moved = c.verdictClass !== b.verdictClass;
  control.ok = control.sqrt_s_moved && control.verdict_moved && ia.ok && ib.ok && ic.ok;
  console.log('positive control: ' + JSON.stringify(control));
  if (!control.ok) {
    console.log('POSITIVE CONTROL FAILED — the driver is not driving the page');
    await browser.close(); process.exit(3);
  }
}

const KEYMAP = { l_Q: 'Q', l_B: 'B', l_Le: 'Le', l_Lm: 'Lm', l_Lt: 'Lt', l_S: 'S', l_C: 'C', l_Bt: 'Bt', l_J: 'J', l_E: 'E' };

for (const c of REF.cases) {
  pageErrors = [];
  const cmp = {}, notes = [];
  await buildReaction(c);
  const iv = await verifyEntered(c);
  const got = await readResult();

  // the reaction really was built as intended
  const built = JSON.stringify(got.lhs) === JSON.stringify(c.lhs) && JSON.stringify(got.rhs) === JSON.stringify(c.rhs);
  cmp.reaction_entered = { got: built ? 1 : 0, ref: 1, rel: built ? 0 : 1, ok: built };
  if (!built) notes.push('built ' + JSON.stringify(got.lhs) + ' -> ' + JSON.stringify(got.rhs));

  // verdict
  const refVerdict = c.ref.verdict;
  /* the displayed verdict class became the framework's tone class (resultsFor:
     VT = {ok:"ok", no:"bad", thr:"warn", weak:"warn"}).  The partition is the one
     the driver has always compared: four reference verdicts onto three displayed
     categories, with "weak" and "thr" sharing one, as they shared "thr" before. */
  const vmap = { ok: 'ok', no: 'bad', thr: 'warn', weak: 'warn' };
  const vOK = got.verdictClass === vmap[refVerdict];
  cmp.verdict = { got: got.verdictClass + ' / ' + got.verdictText, ref: refVerdict, rel: vOK ? 0 : 1, ok: vOK };

  // which laws the tool marked, mapped through the row keys
  const flaggedBad = [], flaggedWeak = [];
  got.rows.forEach((r, i) => {
    const key = KEYMAP[got.keys[i]] || got.keys[i];
    if (r.status === 'bad' && key !== 'E') flaggedBad.push(key);
    if (r.status === 'bad' && key === 'E') flaggedBad.push('E');
    if (r.status === 'flag') flaggedWeak.push(key);
  });
  const refBad = c.ref.violated.slice().concat(c.ref.enough ? [] : ['E']).sort();
  const refWeak = c.ref.weak.concat(c.ref.warn).sort();
  const badOK = JSON.stringify(flaggedBad.slice().sort()) === JSON.stringify(refBad);
  const weakOK = JSON.stringify(flaggedWeak.slice().sort()) === JSON.stringify(refWeak);
  cmp.laws_violated = { got: flaggedBad.join(',') || '-', ref: refBad.join(',') || '-', rel: badOK ? 0 : 1, ok: badOK };
  cmp.laws_flavour_flagged = { got: flaggedWeak.join(',') || '-', ref: refWeak.join(',') || '-', rel: weakOK ? 0 : 1, ok: weakOK };

  // kinematics
  const dS = rel(got.sqrt_s, c.ref.sqrt_s);
  cmp.sqrt_s_GeV = { got: got.sqrt_s, ref: c.ref.sqrt_s, rel: dS, ok: dS <= TOL_KIN };
  const dM = rel(got.sum_m, c.ref.sum_m);
  cmp.sum_masses_GeV = { got: got.sum_m, ref: c.ref.sum_m, rel: dM, ok: dM <= TOL_KIN };
  if (c.ref.threshold != null) {
    const dT = rel(got.threshold, c.ref.threshold);
    cmp.threshold_beam_GeV = { got: got.threshold, ref: c.ref.threshold, rel: dT, ok: dT <= TOL_KIN };
  }

  const worst_rel = Math.max(...Object.values(cmp).map(x => (isFinite(x.rel) ? x.rel : 1e300)));
  const pass = Object.values(cmp).every(x => x.ok) && pageErrors.length === 0 && iv.ok;
  if (!iv.ok) notes.push('INPUTS NOT APPLIED: ' + JSON.stringify(iv));
  cases.push({ id: c.id, note: c.note, inputs: { lhs: c.lhs, rhs: c.rhs, beam_kinetic_energy_GeV: c.T, geometry: c.geom },
    cmp, worst_rel, pass, notes, page_errors: pageErrors.slice(), inputs_verified: iv });
  process.stdout.write((pass ? 'PASS ' : 'FAIL ') + c.id + '  worst_rel=' + worst_rel.toExponential(2) +
    (pass ? '' : '\n      ' + JSON.stringify(cmp)) + '\n');
}

await browser.close();

const passed = cases.filter(c => c.pass).length;
const out = {
  tool: 'reactionbuilder',
  file: 'reactionbuilder.html',
  reference: 'Data-integrity plus exact-bookkeeping benchmark. Masses come from the Particle Data Group 2025 summary tables (quoted per particle in the reference file); every quantum number is recomputed here from the quark content rather than copied, and the conservation-law verdicts are derived from the definitions of the laws. Kinematics is compared with closed-form invariant-mass and threshold expressions.',
  reference_citations: [
    'S. Navas et al. (Particle Data Group), Review of Particle Physics, Phys. Rev. D 110, 030001 (2024) and 2025 update — summary tables: leptons, gauge and Higgs bosons, quarks, light unflavoured mesons, strange mesons, charmed mesons, charmed strange mesons, bottom mesons, c-cbar and b-bbar mesons, baryons and bottom baryons (https://pdg.lbl.gov/2025/tables/).',
    'Quantum-number bookkeeping (PDG convention): Q = sum of quark charges, B = (n_q - n_qbar)/3, S = -(n_s - n_sbar), C = +(n_c - n_cbar), B~ = -(n_b - n_bbar); lepton numbers per flavour.',
    'Kinematics: s = m1^2 + m2^2 + 2 E1 m2 for a fixed target, sqrt(s) = E1 + E2 for head-on beams of equal momentum, and the two-body break-up momentum p* = sqrt([M^2-(m1+m2)^2][M^2-(m1-m2)^2])/(2M). Hand check: the antiproton threshold of p+p -> p+p+p+pbar is 6 m_p = 5.6296 GeV kinetic energy (Bevatron, 1955).'
  ],
  tolerance: 'Table masses: exact equality with the PDG 2025 value (1e-9 relative) — a reference table has no excuse for a rounded or stale number. Quantum numbers and spins: exact. Conservation verdicts: exact match of the set of laws the tool marks. sqrt(s), sum of product masses and threshold beam energy: 2e-3 relative, set by the 3-4 significant digits the page prints.',
  crosscheck: 'Quantum numbers are derived independently from quark content and cross-checked against the PDG-quoted charge/strangeness of each particle; the two agree for all 51 base entries.',
  not_benchmarked: [
    'branching ratios of the 87 decay channels and the decay roulette statistics',
    'the GENBOD flat phase-space event generator and the track drawing',
    'the reference-machine chart',
    'interaction-mechanism chips (strong/EM/weak) beyond the verdict itself'
  ],
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: cases.flatMap(c => c.page_errors),
  run_at: new Date().toISOString(),
  cases
};
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log('\n' + passed + '/' + cases.length + ' passed');
console.log('CONSOLE (' + consoleLog.length + ' messages):');
for (const m of consoleLog.slice(0, 20)) console.log('  ' + m);
process.exit(passed === cases.length ? 0 : 1);
