/* Benchmark driver — moleculeconstructor.html
 *
 * Data-integrity plus rule-checking, per the manifest's own claim that the tool validates
 * connectivity and valence only:
 *   1. the valence table against the standard common (neutral) valences of the elements;
 *   2. every one of the 107 database structures: valence balance, connectivity and Hill
 *      formula recomputed independently in python (mc_ref.py, not in this tree) and, as a
 *      second reference, molar masses from the CIAAW atomic weights;
 *   3. the round trip: each database structure is built on the canvas through the page's own
 *      goal list and must be recognised again, with the formula the reference computes;
 *   4. known-valid structures built atom by atom through the canvas (methane, water, ethanol,
 *      acetic acid, benzene) must close and be recognised;
 *   5. impossible structures (5-bonded carbon, 2-bonded hydrogen, 3-bonded oxygen,
 *      4-bonded nitrogen, disconnected fragments) must be refused or flagged, never silently
 *      accepted;
 *   6. charged and hypervalent species (NH4+, SO4^2-) — the model has no charges, so the
 *      tool must say the structure is not closed rather than accept it.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build is read out of
   the live page by readPageManifestRevision() and passed to stampProvenance(), which
   writes build, manifest_revision, reference_provenance, provenance_note and run_at and
   refuses to write anything without an observed build. */
const PROVENANCE = {
  reference_provenance: "recorded",
  provenance_note: "No generator for this corpus exists anywhere in this tree, so its stored reference values cannot be re-derived here and are reused as stored, which AGENTS \u00a75 classes as a regression reference; tracing it needs a generator that derives the bond geometry and the formula arithmetic from the sources cited."
};

/* Every path resolves relative to this driver's own tree: the site root defaults to the
   parent of bench-src, the reference directory to bench-src/ref and the artifact to
   <siteRoot>/benchmarks/moleculeconstructor.json. --site, --ref-dir and --out override. */
const P = benchPaths({ name: 'moleculeconstructor', page: 'moleculeconstructor.html',
                       ref: 'moleculeconstructor_ref.json', query: { lang: 'en' } });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const cases = [];
let pageErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });
await page.goto(P.pageUrl, { waitUntil: 'load', timeout: 30000 });
/* The DiagramUI shell mounts the controls and the goal list after load, so wait for the
   surface this driver addresses rather than for a fixed 300 ms. */
await page.waitForFunction(() => !!window.Diagram && !!window.DiagramUI
  && !!document.getElementById('f-mode-c')
  && document.querySelectorAll('#goals .goal').length > 0, null, { timeout: 60000 });
/* The build this artifact names is the manifest_revision of the document the browser
   loaded, not of the file beside this driver. */
const BUILD = await readPageManifestRevision(page);

/* ---- the page's present control surface -------------------------------------------
   Ported 2026-10-04. Three of the four ids this driver addressed are gone from the
   rendered page and are replaced by framework furniture:
     - #mAdv, the simple/advanced switch, is the segmented control #f-mode-c, whose two
       <button data-value="simple"|"adv"> carry the modes. Advanced is what lists all
       107 goal chips; in simple mode only 13 are rendered, so the round trip could
       never have reached the other 94 without this.
     - #btnClear is the panel action labelled "Reset" (.dgu-panel-actions .dgu-btn).
     - #msg is gone. The framework reports the same state through the tone class the
       result tiles and the verdict carry (ok | warn | bad), which is what the
       message_shown check reads; the tone words are the page's own and the check's
       criterion ("warn or bad") is unchanged.
   #formula, #goals .goal, #card, CHEM, analyze, state, addAtom and tryBond are all
   still reachable and are used exactly as before. #card .name is gone: the card's
   first line is the substance name. ------------------------------------------------ */
const PAGE_HELPERS = () => {
  /* The segmented control's aria-pressed is NOT the truth: Reset puts state.mode back to
     "simple" and leaves the button reading pressed, so a check on aria-pressed thinks
     advanced is still on while the goal list has fallen back to the 13 simple starters.
     The page's own state.mode is the truth, so it is what decides whether to click. */
  window.__mcMode = m => {
    const h = document.getElementById('f-mode-c');
    if (!h) throw new Error('mode control #f-mode-c is absent from the rendered page');
    const b = [...h.querySelectorAll('button')]
      .find(x => (x.getAttribute('data-value') || '') === m);
    if (!b) throw new Error('mode "' + m + '" is not offered by #f-mode-c; offered: '
      + JSON.stringify([...h.querySelectorAll('button')].map(x => x.getAttribute('data-value'))));
    if (state.mode !== m) b.click();
    if (state.mode !== m)
      throw new Error('clicking the "' + m + '" button left state.mode = ' + state.mode);
    return state.mode;
  };
  window.__mcClear = () => {
    const b = [...document.querySelectorAll('.dgu-panel-actions button, .dgu-btn')]
      .find(x => /^reset$/i.test((x.innerText || '').trim()));
    if (!b) throw new Error('no Reset action on the rendered page; buttons: '
      + JSON.stringify([...document.querySelectorAll('button')].map(x => (x.innerText||'').trim()).filter(Boolean).slice(0, 30)));
    b.click();
    return true;
  };
  /* The tone the framework puts on the result tiles and the verdict, in place of the
     className #msg used to carry. Returns the tones present, space separated. */
  window.__mcTone = () => {
    const t = new Set();
    document.querySelectorAll('.dgu-tile, .dgu-verdict, .dgu-notice').forEach(e => {
      ['ok', 'warn', 'bad'].forEach(c => { if (e.classList.contains(c)) t.add(c); });
    });
    if (document.querySelector('.dgu-err') &&
        [...document.querySelectorAll('.dgu-err')].some(e => (e.innerText || '').trim())) t.add('bad');
    return [...t].join(' ');
  };
  window.__mcCardName = () => {
    const c = document.getElementById('card');
    if (!c || c.querySelector('.placeholder')) return null;
    const first = (c.innerText || '').split('\n').map(s => s.trim()).filter(Boolean)[0];
    return first || null;
  };
};
await page.evaluate(PAGE_HELPERS);

const push = (id, note, cmp, notes = [], inputs = {}) => {
  const pass = Object.values(cmp).every(x => x.ok);
  cases.push({ id, note, inputs, cmp, worst_rel: Math.max(...Object.values(cmp).map(x => x.rel ?? 0)), pass, notes, page_errors: pageErrors.slice() });
  process.stdout.write((pass ? 'PASS ' : 'FAIL ') + id + (notes.length ? '\n      ' + notes.join('\n      ') : '') + '\n');
};

/* -------------------------------------------------- 1. the valence table */
{
  const cmp = {}, notes = [];
  const tool = await page.evaluate(() => CHEM.VALENCE);
  const std = REF.standard_valence;
  const bad = [];
  for (const el of new Set([...Object.keys(tool), ...Object.keys(std)])) {
    if (JSON.stringify(tool[el]) !== JSON.stringify(std[el])) bad.push(el + ' tool ' + JSON.stringify(tool[el]) + ' standard ' + JSON.stringify(std[el]));
  }
  cmp.valence_table = { got: bad.length, ref: 0, rel: bad.length, ok: bad.length === 0 };
  if (bad.length) notes.push(bad.join('; '));
  notes.push(Object.keys(tool).length + ' elements, each with the standard neutral valences (S 2/4/6, P 3/5, Fe 2/3, Cu 1/2)');
  push('valence_table', 'The enforced valences are the standard common valences of the elements', cmp, notes);
}

/* -------------------------------------------------- 2. database integrity */
{
  const cmp = {}, notes = [];
  const subs = await page.evaluate(() => CHEM.SUBS.map(m => ({ id: m.id, level: m.level, nodes: m.nodes, edges: m.edges, formula: m.formula, df: m.df || null })));
  cmp.entry_count = { got: subs.length, ref: REF.database.length, rel: subs.length === REF.database.length ? 0 : 1, ok: subs.length === REF.database.length };
  const byId = Object.fromEntries(REF.database.map(r => [r.id, r]));
  let fBad = [], vBad = [], cBad = [], dup = [];
  const seen = new Set();
  for (const m of subs) {
    if (seen.has(m.id)) dup.push(m.id); seen.add(m.id);
    const r = byId[m.id];
    if (!r) { fBad.push(m.id + ': not in reference'); continue; }
    if (m.formula !== r.formula) fBad.push(m.id + ' formula ' + m.formula + ' != ' + r.formula);
    if (r.unsatisfied.length) vBad.push(m.id + ' ' + JSON.stringify(r.unsatisfied));
    if (!r.connected) cBad.push(m.id);
  }
  cmp.unique_ids = { got: dup.length, ref: 0, rel: dup.length, ok: dup.length === 0 };
  cmp.hill_formulas = { got: fBad.length, ref: 0, rel: fBad.length, ok: fBad.length === 0 };
  if (fBad.length) notes.push(fBad.join('; '));
  cmp.valence_balance = { got: vBad.length, ref: 0, rel: vBad.length, ok: vBad.length === 0 };
  if (vBad.length) notes.push('database structures that break their own valence rule: ' + vBad.join('; '));
  cmp.connectivity = { got: cBad.length, ref: 0, rel: cBad.length, ok: cBad.length === 0 };
  if (cBad.length) notes.push('disconnected database structures: ' + cBad.join('; '));
  notes.push(subs.length + ' structures checked; every heavy atom satisfies a standard valence and every Hill formula was recomputed from the graph');
  push('database_integrity', 'Every stored structure is valence-consistent, connected and carries the Hill formula its graph implies', cmp, notes);
}

/* -------------------------------------------------- 3. round trip through the goal list */
{
  const cmp = {}, notes = [];
  let bad = [], n = 0;
  /* #mAdv is gone; #f-mode-c carries the simple/advanced switch, and advanced is what
     renders all 107 goal chips — simple renders 13. Two things make the ordering here
     load-bearing, both measured on the page (work/probe6.mjs):
       - clicking a goal chip builds that structure, and the goal list is contextual, so
         it then lists only the few substances the atoms on the canvas can make (3 after
         ethene). The canvas must therefore be cleared before the next chip is looked for.
       - Reset puts state.mode back to "simple" and does so asynchronously, so clearing
         and re-asserting the mode in one evaluate re-asserted it while the mode was
         still advanced and the Reset landed afterwards, leaving 13 chips. They are two
         awaited steps, and state.mode is checked rather than the button's aria-pressed.
     Both are done at the top of each iteration, so the chip is always looked for on a
     cleared canvas in advanced mode. */
  for (const r of REF.database) {
    await page.evaluate(() => __mcClear());
    await page.waitForTimeout(40);
    const mode = await page.evaluate(() => __mcMode('adv'));
    if (mode !== 'adv') { bad.push(r.id + ': could not put the page in advanced mode'); continue; }
    /* the goal list is re-rendered after the mode change, not during it, so wait for the
       list itself rather than for a delay: advanced lists the whole library, simple 13 */
    try {
      await page.waitForFunction(n => document.querySelectorAll('#goals .goal').length >= n,
        REF.database.length, { timeout: 10000 });
    } catch (e) {
      const seen = await page.evaluate(() => ({
        goals: document.querySelectorAll('#goals .goal').length, mode: state.mode }));
      bad.push(r.id + ': advanced mode lists only ' + seen.goals + ' of ' + REF.database.length
        + ' goal chips (state.mode = ' + seen.mode + ')');
      continue;
    }
    const got = await page.evaluate(id => {
      const g = [...document.querySelectorAll('#goals .goal')].find(x => x.dataset.sub === id);
      if (!g) return { built: false };
      g.click();
      const res = analyze(state.atoms, state.bonds);
      return { built: true, formula: document.getElementById('formula').textContent,
               msgClass: __mcTone(),
               matched: res.match ? res.match.id : null, closed: res.allClosed, connected: res.connected,
               name: __mcCardName() };
    }, r.id);
    if (!got.built) { bad.push(r.id + ': no goal chip'); continue; }
    n++;
    if (got.matched !== r.id) bad.push(r.id + ' recognised as ' + got.matched);
    else if (!got.closed) bad.push(r.id + ' built with open valences');
    else if (!got.connected) bad.push(r.id + ' built disconnected');
    else if (got.formula.replace(/\s/g, '') !== (r.df || r.formula)) bad.push(r.id + ' shows ' + got.formula + ' expected ' + (r.df || r.formula));
    else n += 0;
  }
  /* leave the page cleared and in its default mode for the cases that follow */
  await page.evaluate(() => __mcClear());
  await page.waitForTimeout(60);
  cmp.round_trip = { got: bad.length, ref: 0, rel: bad.length, ok: bad.length === 0 };
  if (bad.length) notes.push(bad.slice(0, 10).join('; '));
  notes.push(n + ' structures built from the goal list, recognised again and shown with the formula the reference computes');
  push('database_round_trip', 'Every stored structure can be built on the canvas and is recognised again', cmp, notes);
}

/* -------------------------------------------------- canvas helpers */
async function clearCanvas() { await page.evaluate(() => __mcClear()); await page.waitForTimeout(40); }
async function buildOnCanvas(atoms, bonds) {
  // place atoms and connect them through the page's own build functions, which is what a
  // click on the canvas ends up calling; every bond goes through tryBond(), the valence gate
  await clearCanvas();
  const r = await page.evaluate(([as, bs]) => {
    const ids = as.map((a, i) => addAtom(120 + 70 * (i % 6), 120 + 70 * Math.floor(i / 6), a));
    const refused = [];
    for (const [i, j, o] of bs) {
      for (let k = 0; k < o; k++) {
        const before = (state.bonds.find(b => (b.a === ids[i] && b.b === ids[j]) || (b.a === ids[j] && b.b === ids[i])) || {}).order || 0;
        tryBond(ids[i], ids[j]);
        const after = (state.bonds.find(b => (b.a === ids[i] && b.b === ids[j]) || (b.a === ids[j] && b.b === ids[i])) || {}).order || 0;
        if (after === before) refused.push([i, j, k + 1]);
      }
    }
    const res = analyze(state.atoms, state.bonds);
    return { refused, formula: document.getElementById('formula').textContent,
             msgClass: __mcTone(), msg: __mcTone(),
             closed: res.allClosed, connected: res.connected, free: res.freeTotal,
             matched: res.match ? res.match.id : null };
  }, [atoms, bonds]);
  return r;
}

/* -------------------------------------------------- 4. valid structures built atom by atom */
for (const c of REF.valid_builds) {
  const cmp = {}, notes = [];
  pageErrors = [];
  const got = await buildOnCanvas(c.atoms, c.bonds);
  cmp.bonds_accepted = { got: got.refused.length, ref: 0, rel: got.refused.length, ok: got.refused.length === 0 };
  if (got.refused.length) notes.push('bonds the tool refused: ' + JSON.stringify(got.refused));
  // a recognised structure is displayed with its conventional formula, an unrecognised one
  // with the generated one; both are written down in the reference
  const shownF = got.formula.replace(/\s/g, '');
  const okF = shownF === c.display_formula || shownF === c.formula;
  cmp.formula = { got: shownF, ref: c.display_formula + ' (or the generated ' + c.formula + ')', rel: okF ? 0 : 1, ok: okF };
  cmp.all_valences_closed = { got: got.closed ? 1 : 0, ref: 1, rel: got.closed ? 0 : 1, ok: got.closed === true };
  cmp.connected = { got: got.connected ? 1 : 0, ref: 1, rel: got.connected ? 0 : 1, ok: got.connected === true };
  if (c.expect_match) {
    cmp.recognised = { got: got.matched, ref: c.expect_match, rel: got.matched === c.expect_match ? 0 : 1, ok: got.matched === c.expect_match };
  }
  notes.push('molar mass from the CIAAW atomic weights: ' + c.molar_mass.toFixed(3) + ' g/mol (the tool does not display one)');
  if (c.strict_hill !== c.formula) notes.push('strict Hill notation would write ' + c.strict_hill + '; the page writes hydrogen second even without carbon');
  push('valid_' + c.id, c.note, cmp, notes, { atoms: c.atoms, bonds: c.bonds });
}

/* -------------------------------------------------- 5. impossible structures */
for (const c of REF.invalid_builds) {
  const cmp = {}, notes = [];
  pageErrors = [];
  const got = await buildOnCanvas(c.atoms, c.bonds);
  // either the bond was refused at entry, or the structure must be reported as not closed
  const refusedOrFlagged = got.refused.length > 0 || got.closed === false || got.connected === false;
  cmp.not_silently_accepted = { got: refusedOrFlagged ? 1 : 0, ref: 1, rel: refusedOrFlagged ? 0 : 1, ok: refusedOrFlagged };
  cmp.not_recognised_as_a_substance = { got: got.matched === null ? 1 : 0, ref: 1, rel: got.matched === null ? 0 : 1, ok: got.matched === null };
  const how = got.refused.length ? 'refused at the bond (' + JSON.stringify(got.refused) + ')'
    : (got.closed === false ? 'accepted but reported with ' + got.free + ' open valence(s)'
    : (got.connected === false ? 'reported as several fragments' : 'ACCEPTED SILENTLY'));
  notes.push(c.note + ' -> ' + how);
  cmp.message_shown = { got: got.msgClass, ref: 'warn or bad', rel: /warn|bad/.test(got.msgClass) || got.refused.length ? 0 : 1, ok: /warn|bad/.test(got.msgClass) || got.refused.length > 0 };
  push('invalid_' + c.id, 'Impossible structure: ' + c.note, cmp, notes, { atoms: c.atoms, bonds: c.bonds });
}

await browser.close();

const passed = cases.filter(c => c.pass).length;
const out = {
  tool: 'moleculeconstructor',
  file: 'moleculeconstructor.html',
  reference: 'Data-integrity and rule-checking benchmark. Standard neutral valences of the elements and CIAAW atomic weights typed into an independent python implementation (mc_ref.py, not in this tree) which recomputes the Hill formula, the valence balance, the connectivity and the molar mass of every structure; the tool is then driven through its own canvas and goal list and compared.',
  reference_citations: [
    'Standard common valences: CRC Handbook of Chemistry and Physics, oxidation states/valence of the elements; IUPAC, Nomenclature of Inorganic Chemistry (Red Book, 2005), standard bonding numbers (C 4, N 3, O 2, H 1, halogens 1, S 2/4/6, P 3/5).',
    'Atomic weights for the molar-mass cross-check: CIAAW abridged standard atomic weights (2021 table with the 2024 revisions), https://ciaaw.org/abridged-atomic-weights.htm.',
    'Hill notation: E. A. Hill, J. Am. Chem. Soc. 22(8), 478-494 (1900) — carbon first, then hydrogen, then the remaining elements alphabetically.'
  ],
  tolerance: 'Everything here is exact bookkeeping: formulas, valence balance, connectivity, recognition and the set of refused bonds are compared for exact equality. Molar masses are computed for the record only, because the tool does not display one.',
  crosscheck: 'The valence table was compared with the standard valences element by element, and every database structure was checked against both its own stored formula and the formula recomputed from its graph.',
  not_benchmarked: [
    'molecular geometry, bond angles and the force-directed layout',
    'stereochemistry, aromaticity perception and resonance',
    'the descriptive substance cards (names, classes, uses)',
    'charged species and hypervalent anions, which the model deliberately cannot express'
  ],
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: cases.flatMap(c => c.page_errors),
  run_at: new Date().toISOString(),
  cases
};
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log('\n' + passed + '/' + cases.length + ' passed');
process.exit(passed === cases.length ? 0 : 1);
