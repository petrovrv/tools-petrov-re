/* Benchmark driver — procesklimaat.html  ("Process Climate Advisor")
 *
 * THIS IS A DATA-INTEGRITY BENCHMARK, NOT A PHYSICS ONE.  The tool computes nothing: it is
 * an industry-by-industry comparator over attention points, the counter-measures that answer
 * them, the conflicts between those measures, and key figures traced to worked material.
 * What is graded is:
 *
 *   - schema validity of every record, including the six-language shape of every text and
 *     the layer-dependent rule that an entry standing for a sold standard reproduces no
 *     value and no trace from the instrument itself,
 *   - referential closure (measure -> attention point, rule -> measure, industry ->
 *     attention point, key figure -> measure / attention point / text / source file, and the
 *     cited line inside the length of the file it is traced to),
 *   - the counts and tallies the page prints against a recount,
 *   - every filter, industry selection, comparator pair and conflict path driven through the
 *     DOM against a set recomputed in python, including the empty result and the
 *     all-selected case,
 *   - six-language completeness of every catalogue string.
 *
 * Reference: bench-src/ref/procesklimaat_ref.json from gen_procesklimaat.py, which
 * re-implements the selection and conflict semantics from their documented meaning.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { readPageManifestRevision, stampProvenance, benchPaths } from './provenance.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build belongs to the
   run and not to this constant: readPageManifestRevision(page) reads it out of the live
   DOM of the page the browser loaded, and it reaches the artifact as stampProvenance's
   `build`, which writes build and manifest_revision and refuses to write without it. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Reference values are derived by bench-src/ref/gen_procesklimaat.py rather than transcribed, but that generator could not be re-run against this tree (its input procesklimaat_data.json is not in this tree), so the corpus is not reproduced here and the artifact reuses it as stored."
};

const P = benchPaths({ name: 'procesklimaat', page: 'procesklimaat.html',
                       ref: ['procesklimaat_ref.json', 'procesklimaat_data.json'] });
const REF = JSON.parse(fs.readFileSync(P.refs['procesklimaat_ref.json'], 'utf8'));
const DATA = JSON.parse(fs.readFileSync(P.refs['procesklimaat_data.json'], 'utf8'));
/* The page is reached through the resolver, so the run drives the tree it was started in.
   The driver appends its own query, as it did before, including the seven language loads. */
const URLBASE = P.pageUrl;
const CATS = DATA.CATS, GROUPS = DATA.GROUPS;
const MSBY = Object.fromEntries(DATA.MS.map(m => [m.id, m]));

const cases = [], flagged = [];
let pageErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });
await page.goto(URLBASE + '?lang=en', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(700);

/* The build this artifact names: the revision in the live DOM of the page just loaded.
   The artifact is about this page, so the later ?lang= loads of the same page do not
   change which revision is graded. */
const BUILD = await readPageManifestRevision(page);

const push = (id, note, cmp, notes = []) => {
  const pass = Object.values(cmp).every(x => x.ok);
  cases.push({ id, note, inputs: {}, cmp,
    worst_rel: Math.max(0, ...Object.values(cmp).map(x => x.rel ?? 0)), pass, notes });
  process.stdout.write((pass ? 'PASS ' : 'FAIL ') + id +
    (notes.length ? '\n      ' + notes.slice(0, 10).join('\n      ') : '') + '\n');
};
const eq = (got, ref) => ({ got, ref, rel: got === ref ? 0 : 1, ok: got === ref });
const setEq = (got, ref) => {
  const a = [...new Set(got)].sort(), b = [...new Set(ref)].sort();
  const miss = b.filter(x => !a.includes(x)), extra = a.filter(x => !b.includes(x));
  return { got: a.length, ref: b.length, rel: miss.length + extra.length,
    ok: miss.length === 0 && extra.length === 0, missing: miss.slice(0, 10), unexpected: extra.slice(0, 10) };
};

/* The page's present input surface (measured on the live DOM, 2026-10-04).

   procesklimaat.html keeps a complete pre-framework shell in bareBoot(), and five of the
   ids this driver used belong to it and to nothing else: #b_reset, #b_preset, #tiles,
   #cmp-card and #lang. The shipped page boots through DiagramUI, and the page's own
   pk-industry sync() renames #f-sector-c back to #sector and #f-sectorB-c back to
   #sectorB with the comment "the two industry selects keep the ids the site's own
   benchmark harness drives them by" -- so #sector, #sectorB, #filtrow, #filtbar,
   #legend, #ap-out, #cf-out, #unc-out, #flash and #cmp-out are all present and are
   driven unchanged. What moved:

     #b_reset   -> the Reset action in the pk-reset panel's footer. Semantically the
                   same control: DEFAULTS() returns {a:state.a, b:state.b, f:state.f,
                   sel:{}}, so app.reset() empties the ticks and leaves the industry,
                   the comparison partner and the category filter where they were,
                   which is exactly what #b_reset's handler did.
     #b_preset  -> the first button of the framework examples panel, matched on the
                   English label the page gives it ("Load a typical set"), whose apply()
                   is the body of the old #b_preset handler.
     #tiles     -> .dgu-tile, read by the English label the page prints rather than by
                   position, with the number in .dgu-tile-v.
     #cmp-card  -> the dock region, [data-region="dock"]. The page sets
                   ctx.app.regions.dock.hidden = !compareHTML(), so the region's own
                   hidden flag is the card's hidden flag.
     #lang      -> the header's select.dgu-sel carrying the site language codes.
     #checks-out-> #val-out, the self-check list checkListNode() builds. The old id is
                   in no revision of this page; the value was recorded and never graded.

   TILE_LABELS are the six English labels of tilesData(), in its order. */
const TILE_LABELS = ['Points covered', 'Still open', 'Hard conflicts', 'Warnings',
                     'Pairing hints', 'Measures ticked'];

/* Injected into the page once per load: the tile and furniture readers every case below
   shares. Kept as one source string so a page that renames a tile fails in one place. */
const PAGE_HELPERS = `
  window.__pkTxt = n => n ? (n.innerText || n.textContent || '').replace(/\\s+/g,' ').trim() : null;
  window.__pkTiles = () => [...document.querySelectorAll('.dgu-tile')].map(n => ({
    label: (window.__pkTxt(n.querySelector('.dgu-tile-l')) || '').replace(/\\?$/,'').trim(),
    value: window.__pkTxt(n.querySelector('.dgu-tile-v'))
  }));
  window.__pkTile = label => {
    const want = String(label).trim().toLowerCase();
    const hit = window.__pkTiles().filter(t => t.label.toLowerCase() === want);
    return hit.length === 1 ? hit[0].value : null;
  };
  window.__pkBtn = (panel, label) => {
    const p = document.querySelector('[data-dgu-panel="' + panel + '"]');
    if (!p) throw new Error('procesklimaat: no panel ' + panel);
    const btns = [...p.querySelectorAll('button')];
    if (label == null) {
      const acts = [...p.querySelectorAll('.dgu-panel-actions button')];
      if (acts.length !== 1) throw new Error('procesklimaat: panel ' + panel + ' has ' +
        acts.length + ' footer actions, not one');
      return acts[0];
    }
    const want = String(label).trim().toLowerCase();
    const hit = btns.filter(b => {
      const d = b.querySelector('span > div:not(.dgu-hint)');
      return window.__pkTxt(d || b).toLowerCase() === want;
    });
    if (hit.length !== 1) throw new Error('procesklimaat: panel ' + panel + ' has ' +
      hit.length + ' buttons labelled ' + JSON.stringify(label) + ', not one');
    return hit[0];
  };
  window.__pkLangSel = () => {
    const sels = [...document.querySelectorAll('select.dgu-sel')].filter(x =>
      x.options.length >= 6 && [...x.options].every(o => /^[a-z]{2}$/.test(o.value)));
    if (sels.length !== 1) throw new Error('procesklimaat: the language select matched ' +
      sels.length + ' selects, not one');
    return sels[0];
  };
  window.__pkDockHidden = () => {
    const n = document.querySelector('[data-region="dock"]');
    if (!n) throw new Error('procesklimaat: no [data-region="dock"] on the page');
    return !!n.hidden;
  };
`;
const installHelpers = async pg => { await pg.addScriptTag({ content: PAGE_HELPERS }); };
await installHelpers(page);

/* helpers that drive the page the way a user does */
async function pickIndustry(sid) {
  await page.evaluate((sid) => {
    const s = document.getElementById('sector');
    s.value = sid;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, sid);
  await page.waitForTimeout(20);
}
async function pickCompare(sid) {
  await page.evaluate((sid) => {
    const s = document.getElementById('sectorB');
    s.value = sid;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, sid);
  await page.waitForTimeout(20);
}
async function setFilter(c) {
  await page.evaluate((c) => {
    const b = c ? document.querySelector(`#filtrow [data-filt="${c}"]`)
      : document.querySelector('#filtrow [data-allcat]');
    if (b) b.click();
  }, c);
  await page.waitForTimeout(20);
}
async function clearSelection() {
  await page.evaluate(() => window.__pkBtn('pk-reset', null).click());
  await page.waitForTimeout(20);
}
async function selectMeasures(ids) {
  await clearSelection();
  await page.evaluate((ids) => {
    for (const id of ids) {
      const cb = document.querySelector(`#ap-out input[data-m="${id}"]`);
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }, ids);
  await page.waitForTimeout(40);
}

/* ------------------------------------------------------------------ 0. load */
{
  const up = await page.evaluate(() => ({
    sectors: document.querySelectorAll('#sector option').length,
    aps: document.querySelectorAll('#ap-out .ap[data-ap]').length,
    tiles: document.querySelectorAll('.dgu-tile').length,
    tile_labels: window.__pkTiles().map(t => t.label),
    filt: document.querySelectorAll('#filtrow [data-filt]').length,
    checks: (document.getElementById('val-out') || { innerText: '' }).innerText.length
  }));
  push('load', 'The page comes up with every industry, the attention points of the first one, the ' +
    'six live tiles and the category filter row', {
    industries_in_the_selector: eq(up.sectors, REF.counts.industries),
    category_filter_buttons: eq(up.filt, CATS.length),
    live_tiles: eq(up.tiles, 6),
    attention_points_rendered: eq(up.aps, REF.industries[0].aps.length),
    no_page_errors: eq(pageErrors.length, 0)
  }, [...pageErrors.slice(0, 5),
    /* recorded, not graded: the tile labels this run keyed its reads on, and whether
       they are the six tilesData() declares. The page's CSS text-transforms them, so
       innerText returns them upper-cased and every label match below is case-folded;
       a label that really moved fails the case that reads that tile. */
    'tile labels read from the page: ' + JSON.stringify(up.tile_labels) +
    (setEq(up.tile_labels.map(x => x.toLowerCase()),
           TILE_LABELS.map(x => x.toLowerCase())).ok
      ? ' (the six tilesData() declares, upper-cased by the page stylesheet)'
      : ' (NOT the six tilesData() declares)')]);
}

/* ------------------------------------------------------------------ 1. schema */
push('record_schema',
  'Every attention point, measure, conflict rule, industry and key figure validates against the ' +
  'schema the page expects, including the layer rule that an entry standing for a sold or ' +
  'open-law instrument reproduces no value and no trace from the instrument itself',
  { schema_errors: eq(REF.schema.errors.length, 0) }, REF.schema.errors.slice(0, 10));

/* ------------------------------------------------------------------ 2. cross references */
{
  const r = REF.references;
  const o = r.orphans;
  const notes = [...r.dangling.slice(0, 8), ...r.trace_errors.slice(0, 8)];
  notes.push(`${o.source_files_never_cited_INFORMATIONAL.length} of ` +
    `${Object.keys(DATA.SRCFILES).length} indexed source files are not cited by any key figure — ` +
    'the index covers the whole worked material, not only what this page quotes, so this is ' +
    'recorded and not graded');
  push('cross_references',
    'No measure, rule, industry or key figure points at a record that does not exist, every key ' +
    'figure is traced to a file that is in the source index, and every cited line number lies ' +
    'inside the length of that file',
    {
      dangling_references: eq(r.dangling.length, 0),
      trace_errors: eq(r.trace_errors.length, 0),
      attention_points_no_industry_uses: eq(o.attention_points_no_industry_uses.length, 0),
      attention_points_without_a_measure: eq(o.attention_points_without_a_measure.length, 0),
      groups_without_an_attention_point: eq(o.groups_without_an_attention_point.length, 0),
      categories_unused: eq(o.categories_unused.length, 0),
      layers_without_a_key_figure: eq(o.layers_without_a_key_figure.length, 0),
      condition_texts_never_used: eq(o.condition_texts_never_used.length, 0),
      provenance_texts_never_used: eq(o.provenance_texts_never_used.length, 0),
      check_texts_never_used: eq(o.check_texts_never_used.length, 0),
      explanations_never_used: eq(o.explanations_never_used.length, 0)
    }, notes);
}

/* ------------------------------------------------------------------ 3. industries */
{
  let bad = 0, countBad = 0;
  const notes = [];
  for (const ic of REF.industries) {
    await pickIndustry(ic.id);
    const got = await page.evaluate(() => ({
      aps: [...document.querySelectorAll('#ap-out .ap[data-ap]')].map(n => n.dataset.ap),
      measures: [...document.querySelectorAll('#ap-out input[data-m]')].map(n => n.dataset.m),
      groups: [...document.querySelectorAll('#ap-out .grp[data-g]')].map(n => n.dataset.g),
      groupCounts: Object.fromEntries([...document.querySelectorAll('#ap-out .grp[data-g]')]
        .map(n => [n.dataset.g, [...n.querySelectorAll('.ap[data-ap]')].map(x => x.dataset.ap)])),
      filtCounts: Object.fromEntries([...document.querySelectorAll('#filtrow [data-filt]')]
        .map(b => [b.dataset.filt, +b.querySelector('.cn').innerText.trim()]))
    }));
    const sa = setEq(got.aps, ic.aps);
    const sm = setEq(got.measures, ic.measures);
    const sg = setEq(got.groups, GROUPS.filter(g => ic.groups[g].length));
    if (!sa.ok || !sm.ok || !sg.ok) {
      bad++;
      if (notes.length < 8) notes.push(`${ic.id}: attention points ${sa.ok ? 'ok' : JSON.stringify([sa.missing, sa.unexpected])}, ` +
        `measures ${sm.ok ? 'ok' : JSON.stringify([sm.missing, sm.unexpected])}, groups ${sg.ok ? 'ok' : 'MISMATCH'}`);
    }
    for (const c of CATS) {
      if ((got.filtCounts[c] ?? -1) !== ic.cat_counts[c]) {
        countBad++;
        if (notes.length < 12) notes.push(`${ic.id}: filter count for ${c}: page ${got.filtCounts[c]}, recount ${ic.cat_counts[c]}`);
      }
    }
    for (const g of GROUPS) {
      if (!ic.groups[g].length) continue;
      const s = setEq(got.groupCounts[g] || [], ic.groups[g]);
      if (!s.ok) { bad++; if (notes.length < 12) notes.push(`${ic.id}/${g}: ${JSON.stringify([s.missing, s.unexpected])}`); }
    }
  }
  push('industries',
    `Each of the ${REF.industries.length} industries offers exactly the attention points its record ` +
    `names and exactly the measures that answer them minus the ones excluded for that industry, ` +
    `grouped into the right groups, and each category filter count equals a recount`,
    { industries_disagreeing: eq(bad, 0), filter_counts_disagreeing: eq(countBad, 0) }, notes);
}

/* ------------------------------------------------------------------ 4. category filter */
{
  let bad = 0, nempty = 0;
  const notes = [];
  for (const ic of REF.industries.slice(0, 8)) {
    await pickIndustry(ic.id);
    for (const c of [...CATS, '']) {
      await setFilter(c);
      const got = await page.evaluate(() => ({
        aps: [...document.querySelectorAll('#ap-out .ap[data-ap]')].map(n => n.dataset.ap),
        empty: !!document.querySelector('#ap-out .msg')
      }));
      const want = c ? ic.filtered[c] : ic.aps;
      const s = setEq(got.aps, want);
      if (!s.ok) {
        bad++;
        if (notes.length < 8) notes.push(`${ic.id} filter=${c || 'all'}: expected ${want.length}, got ${got.aps.length}, ` +
          JSON.stringify([s.missing, s.unexpected]));
      }
      if (want.length === 0) { nempty++; if (!got.empty) { bad++; notes.push(`${ic.id} filter=${c}: empty result not announced`); } }
    }
    await setFilter('');
  }
  push('category_filter',
    'The category filter keeps exactly those attention points whose own category matches or which ' +
    'carry a matching measure, for every category and for the reset case, across eight industries',
    { filter_cases_disagreeing: eq(bad, 0),
      empty_results_seen: { got: nempty, ref: nempty, rel: 0, ok: true } }, notes);
}

/* ------------------------------------------------------------------ 5. conflict engine */
{
  let bad = 0;
  const notes = [];
  // pick the industry that offers both measures of the rule, so the checkbox exists in the DOM
  const industryFor = (ids) => {
    for (const ic of REF.industries) if (ids.every(x => ic.measures.includes(x))) return ic.id;
    return null;
  };
  let run = 0;
  for (const cc of REF.conflicts) {
    if (!cc.sel.length) continue;
    const sid = cc.id.startsWith('ind_all_') ? cc.id.slice(8) : industryFor(cc.sel);
    if (!sid) continue;                       // no industry offers both: not reachable through the UI
    run++;
    await pickIndustry(sid);
    await selectMeasures(cc.sel);
    const got = await page.evaluate(() => ({
      hard: [...document.querySelectorAll('#cf-out .msg.bad[data-rule]')].map(n => n.dataset.rule),
      warn: [...document.querySelectorAll('#cf-out .msg.warn[data-rule]')].map(n => n.dataset.rule),
      hint: [...document.querySelectorAll('#cf-out .msg.info[data-rule]')].map(n => n.dataset.rule),
      /* read by label, not by position: a reordering of tilesData() would otherwise
         compare the warning count against the pairing-hint tile without saying so */
      tiles: ['Hard conflicts', 'Warnings', 'Pairing hints'].map(window.__pkTile),
      all_tiles: window.__pkTiles()
    }));
    // only the rules whose two measures are both offered here can appear
    const offered = new Set(REF.industries.find(i => i.id === sid).measures);
    const reachable = (list) => list.filter(rid => {
      const r = DATA.RULES.find(x => x.id === rid);
      return r.k === 'pair' ? offered.has(r.a) : offered.has(r.a) && offered.has(r.b);
    });
    const sh = setEq(got.hard, reachable(cc.verdict.hard));
    const sw = setEq(got.warn, reachable(cc.verdict.warn));
    const si = setEq(got.hint, reachable(cc.verdict.hint));
    const tileHard = +got.tiles[0], tileWarn = +got.tiles[1], tileHint = +got.tiles[2];
    const tilesOk = tileHard === got.hard.length && tileWarn === got.warn.length &&
      tileHint === got.hint.length;
    if (!sh.ok || !sw.ok || !si.ok || !tilesOk) {
      bad++;
      if (notes.length < 10) notes.push(`${cc.id} (${sid}): hard ${sh.ok ? 'ok' : JSON.stringify([sh.missing, sh.unexpected])}, ` +
        `warn ${sw.ok ? 'ok' : JSON.stringify([sw.missing, sw.unexpected])}, ` +
        `pairing ${si.ok ? 'ok' : JSON.stringify([si.missing, si.unexpected])}, ` +
        `tiles ${tilesOk ? 'ok' : `${tileHard}/${tileWarn}/${tileHint} vs ${got.hard.length}/${got.warn.length}/${got.hint.length}`}`);
    }
  }
  await clearSelection();
  const empty = await page.evaluate(() => ({
    flags: document.querySelectorAll('#cf-out .msg[data-rule]').length,
    text: document.getElementById('cf-out').innerText.trim().length
  }));
  push('conflict_engine',
    `Every conflict path driven through the checkboxes (${run} reachable cases out of ` +
    `${REF.conflicts.length}: each rule's two measures together, each rule's first measure alone, ` +
    `and every industry with all of its measures selected at once) raises exactly the hard ` +
    `conflicts, warnings and pairing hints recomputed in python, and the live tiles agree with them`,
    {
      conflict_cases_disagreeing: eq(bad, 0),
      cases_run: { got: run, ref: run, rel: 0, ok: run > 50 },
      empty_selection_raises_nothing: eq(empty.flags, 0),
      empty_selection_says_so: eq(empty.text > 0, true)
    }, notes);
}

/* ------------------------------------------------------------------ 6. preset invariant */
{
  let bad = 0;
  const notes = [];
  for (const ic of REF.industries) {
    await pickIndustry(ic.id);
    await page.evaluate(() => window.__pkBtn('dgu-examples', 'Load a typical set').click());
    await page.waitForTimeout(30);
    const got = await page.evaluate(() => ({
      sel: [...document.querySelectorAll('#ap-out input[data-m]')].filter(c => c.checked).map(c => c.dataset.m),
      hard: document.querySelectorAll('#cf-out .msg.bad[data-rule]').length,
      warn: document.querySelectorAll('#cf-out .msg.warn[data-rule]').length
    }));
    // independent verdict on exactly the set the page selected
    const S = new Set(got.sel);
    const hard = DATA.RULES.filter(r => r.k === 'hard' && S.has(r.a) && S.has(r.b)).map(r => r.id);
    const warn = DATA.RULES.filter(r => r.k === 'warn' && S.has(r.a) && S.has(r.b)).map(r => r.id);
    const offered = new Set(ic.measures);
    const stray = got.sel.filter(x => !offered.has(x));
    if (hard.length || warn.length || got.hard || got.warn || stray.length) {
      bad++;
      if (notes.length < 8) notes.push(`${ic.id}: preset of ${got.sel.length} measures ` +
        `raises ${hard.length} hard / ${warn.length} warnings by the reference rule ` +
        `(page shows ${got.hard}/${got.warn})` + (stray.length ? `, and offers ${stray.length} measures the industry does not carry` : ''));
    }
  }
  await clearSelection();
  push('preset_is_conflict_free',
    'The typical starting set the page offers for each industry contains only measures that ' +
    'industry carries and raises no hard conflict and no warning under an independently ' +
    'recomputed verdict — that is the invariant the preset exists to guarantee',
    { industries_whose_preset_is_not_clean: eq(bad, 0) }, notes);
}

/* ------------------------------------------------------------------ 7. comparator */
{
  let bad = 0;
  const notes = [];
  for (const cc of REF.compare) {
    await pickIndustry(cc.a);
    await pickCompare(cc.b);
    const got = await page.evaluate(() => {
      const cols = [...document.querySelectorAll('#cmp-out .cmpcol')];
      const boxes = [...document.querySelectorAll('#cmp-out .cmpbox')];
      return {
        hidden: window.__pkDockHidden(),
        onlyA: [...(boxes[0] || document.createElement('div')).querySelectorAll('li[data-ap]')].map(n => n.dataset.ap),
        onlyB: [...(boxes[2] || document.createElement('div')).querySelectorAll('li[data-ap]')].map(n => n.dataset.ap),
        both: [...(boxes[4] || document.createElement('div')).querySelectorAll('li[data-ap]')].map(n => n.dataset.ap)
      };
    });
    const sa = setEq(got.onlyA, cc.only_a), sb = setEq(got.onlyB, cc.only_b), sboth = setEq(got.both, cc.both);
    if (!sa.ok || !sb.ok || !sboth.ok) {
      bad++;
      if (notes.length < 8) notes.push(`${cc.a} vs ${cc.b}: only-A ${sa.ok ? 'ok' : JSON.stringify([sa.missing, sa.unexpected])}, ` +
        `only-B ${sb.ok ? 'ok' : JSON.stringify([sb.missing, sb.unexpected])}, both ${sboth.ok ? 'ok' : 'MISMATCH'}`);
    }
  }
  // and switching the comparison off hides the card
  await pickCompare('');
  const off = await page.evaluate(() => window.__pkDockHidden());
  push('comparator',
    `The industry comparator's only-A, only-B and shared sets are exactly the set difference and ` +
    `intersection of the two industries' attention points, over ${REF.compare.length} pairs ` +
    `including an industry compared with itself (where only-A and only-B are empty)`,
    { compare_cases_disagreeing: eq(bad, 0), comparison_off_hides_the_card: eq(off, true) }, notes);
}

/* ------------------------------------------------------------------ 8. six languages */
{
  const notes = [];
  const cmp = { catalogue_string_errors: eq(REF.i18n.errors.length, 0) };
  for (const lang of DATA.LANGS) {
    const before = pageErrors.length;
    await page.goto(URLBASE + '?lang=' + lang, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await installHelpers(page);          /* a navigation drops the injected readers */
    const r = await page.evaluate(() => ({
      docLang: document.documentElement.lang,
      sel: window.__pkLangSel().value,
      aps: document.querySelectorAll('#ap-out .ap[data-ap]').length,
      title: document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : ''
    }));
    cmp['lang_' + lang + '_applied'] = eq(r.sel, lang);
    cmp['lang_' + lang + '_document_language'] = eq(r.docLang, lang);
    cmp['lang_' + lang + '_renders'] = eq(r.aps, REF.industries[0].aps.length);
    if (pageErrors.length > before) notes.push(`${lang}: ${JSON.stringify(pageErrors.slice(before))}`);
  }
  await page.goto(URLBASE + '?lang=en', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await installHelpers(page);
  push('six_languages',
    `Every one of the ${REF.i18n.n_language_objects} catalogue strings carries all six languages ` +
    `with no empty value and no placeholder, and the page really switches into each of them`,
    cmp, [...notes, ...REF.i18n.errors.slice(0, 8)]);
}

/* ------------------------------------------------------------------ 9. permalink */
{
  const has = await page.evaluate(() => !!window.Diagram);
  const cmp = { runtime_present: eq(has, true) };
  const notes = [];
  if (has) {
    await pickIndustry(REF.industries[3].id);
    await pickCompare(REF.industries[7].id);
    // tick the measures first: with a category filter active the hidden ones have no checkbox
    await selectMeasures(REF.industries[3].measures.slice(0, 4));
    await setFilter('method');
    const before = await page.evaluate(() => ({
      state: JSON.stringify(Diagram.state.current()),
      sel: [...document.querySelectorAll('#ap-out input[data-m]')].filter(c => c.checked).map(c => c.dataset.m)
    }));
    const sel = JSON.parse(before.state).sel;
    const link = await page.evaluate(() => Diagram.state.link());
    const u = new URL(link);
    await page.goto(URLBASE + '?' + u.searchParams.toString(), { waitUntil: 'load' });
    await page.waitForTimeout(700);
    await installHelpers(page);
    const back = await page.evaluate(() => ({
      a: document.getElementById('sector').value,
      b: document.getElementById('sectorB').value,
      filt: (document.querySelector('#filtrow [data-filt][aria-pressed="true"]') || { dataset: {} }).dataset.filt || '',
      state: JSON.stringify(Diagram.state.current()),
      sel: [...document.querySelectorAll('#ap-out input[data-m]')].filter(c => c.checked).map(c => c.dataset.m)
    }));
    cmp.permalink_industry_a = eq(back.a, REF.industries[3].id);
    cmp.permalink_industry_b = eq(back.b, REF.industries[7].id);
    cmp.permalink_category_filter = eq(back.filt, 'method');
    cmp.permalink_state_identical = eq(back.state, before.state);
    cmp.permalink_selection = setEq(back.sel, sel.filter(id => MSBY[id].c === 'method'));
    cmp.permalink_selection_carried_four_measures = eq(sel.length, 4);
    notes.push('permalink: ' + link.slice(0, 110) +
      ` (state carried ${sel.length} ticked measures; ${sel.filter(id => MSBY[id].c === 'method').length} ` +
      'of them are visible under the active category filter and were checked in the DOM after reopening)');
  } else {
    notes.push('diagram-common.js is not loaded by this page, so there is no permalink to round-trip');
  }
  push('permalink_round_trip',
    'An industry, a comparison partner, a category filter and a measure selection survive ' +
    'encode -> link -> fresh load', cmp, notes);
}

/* ------------------------------------------------------------------ artifact */
const passed = cases.filter(c => c.pass).length;
const artifact = {
  tool: 'procesklimaat',
  file: 'procesklimaat.html',
  benchmark_kind: 'data-integrity',
  reference: 'DATA-INTEGRITY benchmark, not a physics one: this tool computes nothing, it compares ' +
    'industries over a catalogue of attention points, counter-measures, conflicts between measures ' +
    'and key figures traced to worked material. The reference is an independent python ' +
    're-implementation (bench-src/ref/gen_procesklimaat.py) of the record schema, the referential ' +
    'closure, the per-industry selection semantics, the category filter and the conflict engine, ' +
    "written from the documented meaning of the tables rather than from the page's own functions.",
  reference_citations: [
    'Independent re-implementation of the schema, referential closure, selection, filter and conflict semantics: bench-src/ref/gen_procesklimaat.py (this repository).',
    'The key figures are traced by the data itself to the worked material of this collection (file and line); the benchmark verifies that every cited file is in the shipped source-file index and that every cited line lies inside the recorded length of that file.'
  ],
  tolerance: 'Exact set equality, with no tolerance at all. Every industry, filter, comparator pair ' +
    'and conflict path must produce exactly the set of record ids computed independently in python; ' +
    'every printed count and live tile must equal a recount; schema, referential-closure and ' +
    'six-language checks must report zero errors. The preset invariant is absolute: a starting set ' +
    'offered to a user must raise no hard conflict and no warning under the independently recomputed ' +
    'verdict.',
  crosscheck: "The page ships its own structural-check panel. It is deliberately not used as a " +
    "reference: a self-check that re-evaluates the page's own tables does not validate them.",
  not_benchmarked: [
    'whether an attention point, a counter-measure or a conflict is good engineering advice — that ' +
      'is a judgement, not a fact this harness can check',
    'the numerical correctness of the key figures themselves: they are quoted from worked examples ' +
      'of the collection with the conditions they were obtained under, and the benchmark checks the ' +
      'provenance chain (file, line, conditions, layer) rather than re-deriving the physics',
    'completeness of the industry list'
  ],
  total: cases.length,
  passed,
  failed: cases.length - passed,
  flagged,
  page_errors: pageErrors,
  run_at: new Date().toISOString(),
  cases
};
/* One write, to the file the site serves. The two previous writes put the same bytes in
   the old results directory and in the site's own benchmarks/ directory; the resolver's
   default out is that second path, so the copy has no second destination left. */
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(artifact, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`\n${passed}/${cases.length} passed, ${flagged.length} flagged, ${pageErrors.length} page errors`);
await browser.close();
process.exit(passed === cases.length ? 0 : 1);
