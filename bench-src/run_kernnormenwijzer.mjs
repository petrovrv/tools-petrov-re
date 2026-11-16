/* Benchmark driver — kernnormenwijzer.html  ("Nuclear Standards Orientation Aid")
 *
 * THIS IS A DATA-INTEGRITY BENCHMARK, NOT A PHYSICS ONE.  The tool computes nothing: it
 * maps the normative landscape of nuclear projects by facility type, lifecycle stage and
 * jurisdiction.  What is graded is the corpus and the navigation over it:
 *
 *   - schema validity of every register entry, study, body and scenario,
 *   - referential closure (study -> body/document, code grid -> document, catalogue text
 *     -> record, facet value -> subject area),
 *   - the tallies the page prints against a recount of the data,
 *   - every register filter, facet path and search path driven through the DOM against a
 *     set recomputed in python, including the empty result and the all-selected case,
 *   - the six catalogue languages (this tool declares tool_languages: ["en"], so the six
 *     languages are required of the catalogue metadata, and that is where they are checked),
 *   - factual spot-checks of designations, titles, issuing bodies and current status
 *     against each issuing body's own catalogue, with the URL recorded.
 *
 * Reference: bench-src/ref/kernnormenwijzer_ref.json from gen_kernnormenwijzer.py, which
 * re-implements the visibility, filter and verdict rules from their documented meaning and
 * never calls the page's own functions.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. stampProvenance() reads the build out of the page's
   own manifest and writes build, manifest_revision, reference_provenance and
   provenance_note into the artifact, so a re-run carries them. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Reference values are derived by bench-src/ref/gen_kernnormenwijzer.py rather than transcribed, but that generator could not be re-run against this tree (its input kernnormenwijzer_data.json is not in this tree), so the corpus is not reproduced here and the artifact reuses it as stored."
};

/* Every path resolves against this driver's own tree: the page under the site root, the
   three reference files under bench-src/ref and the artifact at
   <siteRoot>/benchmarks/kernnormenwijzer.json — the path the page's own manifest names, so
   the file the site serves is the file this run writes and no copy step stands between
   them. --site, --ref-dir and --out override. See benchpaths.mjs. */
const P = benchPaths({ name: 'kernnormenwijzer', page: 'kernnormenwijzer.html',
                       ref: ['kernnormenwijzer_ref.json', 'kernnormenwijzer_data.json',
                             'kernnormenwijzer_spotcheck.json'] });
const REF = JSON.parse(fs.readFileSync(P.refs['kernnormenwijzer_ref.json'], 'utf8'));
const DATA = JSON.parse(fs.readFileSync(P.refs['kernnormenwijzer_data.json'], 'utf8'));
const SPOT = JSON.parse(fs.readFileSync(P.refs['kernnormenwijzer_spotcheck.json'], 'utf8'));
const BYID = Object.fromEntries(DATA.DOCS.map(d => [d.id, d]));
/* The page is opened as file://, as this driver has always opened it; only the root is a
   parameter. Every goto below appends this driver's own query. */
const URLBASE = P.pageUrl;

const cases = [], flagged = [];
let pageErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });
await page.goto(URLBASE + '?lang=en', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(700);

/* AGENTS §5: the build this artifact names is the manifest_revision read out of the live
   DOM of the page the browser actually loaded, not of the file sitting beside this driver.
   stampProvenance() refuses to write anything without it. */
const BUILD = await readPageManifestRevision(page);

/* The page's present section surface (measured on the live DOM, 2026-10-04).

   This driver reached eleven sections by the ids `<id>-body`. None of those ids is in
   kernnormenwijzer.html any more: the sections are framework panels built by
   contentPanel(), which renders each one into the panel body of
   [data-dgu-panel="kn-p-<id>"], and the twelfth -- `lim` -- is not a panel at all but a
   <div> inside the footer's <details>. The page keeps its own handle on all eleven in
   the global `HOST`, one entry per section id, and that is what the page's own
   renderers write into (renderReg(HOST.reg), renderLimits(HOST.lim), ...). So HOST[id]
   is the one selector that reaches every section including `lim`, and it is the page's
   own, not a shape this driver guessed. `#reg-list`, inside HOST.reg, still exists and
   is used unchanged.

   Measured section text lengths at load, in characters: cat 2 375, scen 100, task
   5 252, map 2 096, cov 1 746, codes 1 291, depth 1 483, reg 415 265, study 26 098,
   org 3 979, lim 1 237. [data-dgu-panel="kn-p-lim"] does not exist; HOST.lim does. */
const SECTIONS = ['cat', 'scen', 'task', 'map', 'cov', 'codes', 'depth', 'reg', 'study',
                  'org', 'lim'];
/* Injected once per load: HOST-rooted queries, so no case has to know how a section is
   mounted. A section the page no longer builds throws by name instead of reading empty. */
const PAGE_HELPERS = `
  window.__knHost = id => {
    if (typeof HOST === 'undefined' || !HOST[id])
      throw new Error('kernnormenwijzer: the page builds no section host for ' + id);
    return HOST[id];
  };
  window.__knAll = (id, sel) => [...window.__knHost(id).querySelectorAll(sel)];
  window.__knOne = (id, sel) => window.__knHost(id).querySelector(sel);
  window.__knText = id => (window.__knHost(id).innerText || '').trim();
`;
await page.addScriptTag({ content: PAGE_HELPERS });

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

/* -------------------------------------------------------------------- 0. load */
{
  const up = await page.evaluate(() => ({
    docs: DOCS.length, studies: STUDIES.length, bodies: BODIES.length, scen: SCEN.length,
    cards: document.querySelectorAll('#reg-list .card[data-id]').length,
    sections: ['cat', 'scen', 'task', 'map', 'cov', 'codes', 'depth', 'reg', 'study',
      'org', 'lim'].filter(id => window.__knText(id).length > 20).length,
    section_lengths: Object.fromEntries(['cat', 'scen', 'task', 'map', 'cov', 'codes',
      'depth', 'reg', 'study', 'org', 'lim'].map(id => [id, window.__knText(id).length]))
  }));
  push('load', 'The page comes up, every section renders, and the register list is populated', {
    documents: eq(up.docs, REF.counts.total_docs),
    studies: eq(up.studies, REF.counts.total_studies),
    bodies: eq(up.bodies, REF.counts.total_bodies),
    scenarios: eq(up.scen, REF.counts.total_scen),
    all_eleven_sections_rendered: eq(up.sections, 11),
    register_cards: eq(up.cards, REF.counts.total_docs),
    no_page_errors: eq(pageErrors.length, 0)
  }, pageErrors.slice(0, 5));
}

/* -------------------------------------------------------- 1. record schema */
{
  const s = REF.schema;
  push('record_schema',
    'Every register entry, study, body and scenario validates against the schema the page ' +
    'expects: no missing required field, no unknown enum value, no duplicate id',
    {
      register_schema_errors: eq(s.doc_errors.length, 0),
      study_schema_errors: eq(s.study_errors.length, 0),
      body_schema_errors: eq(s.body_errors.length, 0),
      scenario_schema_errors: eq(s.scen_errors.length, 0)
    },
    [...s.doc_errors.slice(0, 5), ...s.study_errors.slice(0, 5), ...s.body_errors.slice(0, 5),
      ...s.scen_errors.slice(0, 5)]);
}

/* -------------------------------------------------------- 2. cross references */
{
  const r = REF.references;
  const notes = [...r.dangling.slice(0, 8), ...r.facet_gaps.slice(0, 8)];
  const cmp = {
    dangling_references: eq(r.dangling.length, 0),
    facet_values_without_an_expectation: eq(r.facet_gaps.length, 0),
    subject_areas_without_a_document: eq(r.areas_without_a_document.length, 0),
    subject_areas_outside_every_cluster: eq(r.areas_without_a_cluster.length, 0),
    clusters_naming_an_unknown_area: eq(r.clusters_naming_unknown_area.length, 0),
    categories_without_a_document: eq(r.categories_without_a_document.length, 0),
    jurisdictions_without_a_declared_depth: eq(r.jurisdictions_without_a_declared_depth.length, 0),
    depth_classes_unknown: eq(r.depth_classes_unknown.length, 0),
    issuing_bodies_without_a_document: eq(r.issuing_bodies_without_a_document.length, 0),
    lifecycle_stages_without_a_document: eq(r.stages_without_a_document.length, 0),
    facility_types_without_a_document: eq(r.facility_types_without_a_document.length, 0)
  };
  if (r.jurisdictions_without_a_document.length)
    notes.push('jurisdiction values carried by no register entry: ' +
      r.jurisdictions_without_a_document.join(', ') +
      ' — "nat" is the value the BODIES table uses for a national authority and is a legitimate ' +
      'member of the shared vocabulary, so this is recorded rather than graded');
  push('cross_references',
    'No study, code-grid cell or catalogue string points at a record that does not exist, and ' +
    'every subject area, cluster, category, jurisdiction, issuing body, stage and facility type ' +
    'in the taxonomy is carried by at least one record',
    cmp, notes);
}

/* -------------------------------------------------------- 3. counts in the UI */
{
  const got = await page.evaluate(() => {
    const n = {};
    document.querySelectorAll('#reg-list .grouphead').forEach(g => {
      n[g.querySelector('.badge').innerText.trim()] = +g.querySelector('.n').innerText.trim();
    });
    const head = document.querySelector('#reg-list p.sub');
    // map grid: subject area x lifecycle stage
    const map = [...window.__knAll('map', 'table.grid tr')].map(
      tr => [...tr.children].map(td => td.innerText.trim()));
    const cov = [...window.__knAll('cov', 'table.grid tr')].map(
      tr => [...tr.children].map(td => td.innerText.trim()));
    return { byCatLabel: n, headline: head ? head.innerText : '', map, cov };
  });
  const CATT = DATA.CATT;
  const cmp = {};
  const notes = [];
  const m = got.headline.match(/(\d+)/);
  cmp.headline_count = eq(m ? +m[1] : -1, REF.counts.total_docs);
  for (const c of DATA.CATS) {
    const label = CATT[c].n;
    cmp['cat_' + c] = eq(got.byCatLabel[label] ?? 0, REF.counts.by_cat[c]);
    if ((got.byCatLabel[label] ?? 0) !== REF.counts.by_cat[c])
      notes.push(`category ${c}: page ${got.byCatLabel[label]}, recount ${REF.counts.by_cat[c]}`);
  }
  // the two grids: every printed cell must equal the recount
  let gridBad = 0;
  const areaName = DATA.AREAS, stageName = Object.fromEntries(DATA.STAGE);
  const readGrid = (rows, colNames, expect) => {
    if (!rows.length) { gridBad++; notes.push('grid did not render'); return; }
    const head = rows[0].slice(1);
    for (const row of rows.slice(1)) {
      const aName = row[0];
      const aKey = Object.keys(areaName).find(k => areaName[k] === aName);
      if (!aKey) continue;
      row.slice(1).forEach((cell, i) => {
        const colKey = colNames[head[i]];
        if (!colKey) return;
        const want = expect[aKey][colKey];
        const printed = cell === '' || cell === '·' || cell === '-' ? 0 : parseInt(cell, 10);
        const shown = isNaN(printed) ? 0 : printed;
        if (shown !== want) {
          gridBad++;
          if (notes.length < 12) notes.push(`grid cell ${aKey}/${colKey}: page "${cell}", recount ${want}`);
        }
      });
    }
  };
  readGrid(got.map, Object.fromEntries(DATA.STAGE.map(([k, v]) => [v, k])), REF.counts.map_grid);
  readGrid(got.cov, Object.fromEntries(DATA.CATS.map(c => [DATA.CATT[c].n, c])), REF.counts.cov_grid);
  cmp.grid_cells_disagreeing = eq(gridBad, 0);
  push('counts', 'The register headline count, the per-category tallies and every cell of the ' +
    'subject-area x lifecycle-stage and subject-area x category grids agree with a recount of the data',
    cmp, notes);
}

/* -------------------------------------------------------- 4. register filters */
async function setState(f) {
  await page.evaluate((f) => {
    state.fCat = f.fcat || ''; state.fGeo = f.fgeo || ''; state.fAr = f.far || '';
    state.fAcc = f.facc || ''; state.q = f.q || '';
    state.obj = f.obj || ''; state.stg = f.stg || ''; state.geo = f.geo || '';
    render();
  }, f);
  await page.waitForTimeout(15);
}
{
  let bad = 0, nempty = 0, orderBad = 0;
  const notes = [];
  for (const rc of REF.register) {
    // drive the visible controls where the case is a register control, otherwise set the
    // project facets the same way the chips do
    await setState(rc.f);
    const got = await page.evaluate(() => ({
      ids: [...document.querySelectorAll('#reg-list .card[data-id]')].map(c => c.dataset.id),
      headline: (document.querySelector('#reg-list p.sub') || {}).innerText || '',
      none: [...document.querySelectorAll('#reg-list p.sub')].length
    }));
    const s = setEq(got.ids, rc.expected);
    const m = got.headline.match(/(\d+)/);
    if (!s.ok || !m || +m[1] !== rc.n) {
      bad++;
      if (notes.length < 10) notes.push(`${rc.id}: expected ${rc.n}, got ${got.ids.length} ` +
        `(headline "${got.headline.trim()}"); missing ${JSON.stringify(s.missing)} unexpected ${JSON.stringify(s.unexpected)}`);
    }
    // grouped in CATS order
    const order = DATA.CATS;
    const seq = got.ids.map(i => order.indexOf(BYID[i].cat));
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) { orderBad++; break; }
    if (rc.n === 0) nempty++;
  }
  await setState({});
  push('register_filters',
    `Every category, jurisdiction, subject-area, access and search path driven through the page ` +
    `(${REF.register.length} cases, including the unfiltered register, ten combinations and the ` +
    `empty result) returns exactly the set recomputed in python, and the headline count matches`,
    {
      register_cases_disagreeing: eq(bad, 0),
      category_grouping_out_of_order: eq(orderBad, 0),
      empty_result_cases_covered: { got: nempty, ref: nempty, rel: 0, ok: nempty > 0 }
    }, notes);
}

/* -------------------------------------------------------- 5. facet verdicts */
{
  let bad = 0;
  const notes = [];
  for (const tc of REF.tasks) {
    await page.evaluate((st) => {
      state.obj = st.obj || ''; state.stg = st.stg || ''; state.geo = st.geo || '';
      state.role = st.role || ''; state.nov = st.nov || ''; state.sc = st.sc || '';
      state.site = (st.site || []).slice(); state.form = (st.form || []).slice();
      state.fCat = ''; state.fGeo = ''; state.fAr = ''; state.fAcc = ''; state.q = '';
      state.showExcl = true;
      render();
    }, tc.state);
    await page.waitForTimeout(15);
    const got = await page.evaluate(() => ({
      areas: window.__knAll('task', '.kv[data-area]').map(n => n.dataset.area),
      excluded: (window.__knOne('task', '[data-excluded]') || { dataset: {} })
        .dataset.excluded || '',
      excludedRows: window.__knAll('task', 'li[data-area]').map(n => n.dataset.area),
      studies: window.__knAll('study', '.card[data-id]').map(c => c.dataset.id),
      bodies: window.__knAll('org', '.card[data-id]').map(c => c.dataset.id),
      register: [...document.querySelectorAll('#reg-list .card[data-id]')].map(c => c.dataset.id)
    }));
    const sa = setEq(got.areas, tc.expected_areas);
    const se = setEq(got.excluded.split(/\s+/).filter(Boolean), tc.expected_excluded);
    const sr = setEq(got.excludedRows, tc.expected_excluded);
    const ss = setEq(got.studies, tc.expected_studies);
    const sb = setEq(got.bodies, tc.expected_bodies);
    const sg = setEq(got.register, tc.expected_register);
    if (!sa.ok || !se.ok || !sr.ok || !ss.ok || !sb.ok || !sg.ok) {
      bad++;
      if (notes.length < 10) notes.push(`${tc.id}: areas ${sa.ok ? 'ok' : JSON.stringify([sa.missing, sa.unexpected])}, ` +
        `excluded ${se.ok ? 'ok' : JSON.stringify([se.missing, se.unexpected])}, ` +
        `excluded rows ${sr.ok ? 'ok' : 'MISMATCH'}, studies ${ss.ok ? 'ok' : JSON.stringify([ss.missing, ss.unexpected])}, ` +
        `bodies ${sb.ok ? 'ok' : JSON.stringify([sb.missing, sb.unexpected])}, ` +
        `register ${sg.ok ? 'ok' : JSON.stringify([sg.missing.length, sg.unexpected.length])}`);
    }
  }
  push('facet_verdicts',
    `Every facet path driven through the page (${REF.tasks.length} cases: nothing selected, each of ` +
    `the 14 ready-made project situations, every single facet value on its own, and everything ` +
    `selected at once) produces exactly the expected subject areas, the exactly-recomputed set kept ` +
    `out of the selection, and exactly the studies, bodies and register entries the data implies`,
    { task_cases_disagreeing: eq(bad, 0) }, notes);
}

/* -------------------------------------------------------- 6. chips drive the same state */
{
  // the DOM chips must produce the same state the direct assignment above produced
  await page.evaluate(() => {
    state.obj = ''; state.stg = ''; state.geo = ''; state.role = ''; state.nov = '';
    state.sc = ''; state.site = []; state.form = []; state.scen = ''; render();
  });
  await page.waitForTimeout(15);
  /* The eight facets were a single row of .chip[data-f][data-o] buttons inside the task
     section. They are now the kn-facets panel's framework fields, and they are of two
     kinds: obj, stg, geo, role, nov and sc are <select> fields, whose controls render as
     #f-<key>-c; site and form are custom chip fields, whose buttons the page builds as
     .kn-chip[data-o="<value>"] inside [data-dgu-field="f-<key>"] and marks with
     aria-pressed. There is no data-f any more -- the field is the container -- and three
     of the six values this case sets are no longer set by clicking at all.
     Setting a <select> and clicking a chip are the two ways a reader drives this page, so
     the case drives both and then asks the same question of the result: six facet
     controls show the six values that were set. */
  const clicked = await page.evaluate(async () => {
    const setSel = (key, v) => {
      const c = document.getElementById('f-' + key + '-c');
      if (!c) return false;
      c.value = v;
      c.dispatchEvent(new Event('input', { bubbles: true }));
      c.dispatchEvent(new Event('change', { bubbles: true }));
      return c.value === v;
    };
    const clickChip = (key, o) => {
      const fld = document.querySelector('[data-dgu-field="f-' + key + '"]');
      if (!fld) return false;
      const b = fld.querySelector('.kn-chip[data-o="' + o + '"]');
      if (!b) return false;
      b.click();
      return true;
    };
    const ok = [setSel('obj', 'ob_geo'), setSel('stg', 'st_lic'), setSel('geo', 'fi'),
      clickChip('site', 'si_seis'), clickChip('site', 'si_flood'), clickChip('form', 'fo_sol')];
    return { ok, state: { obj: state.obj, stg: state.stg, geo: state.geo, site: state.site.slice(), form: state.form.slice() } };
  });
  await page.waitForTimeout(30);
  const got = await page.evaluate(() => ({
    areas: window.__knAll('task', '.kv[data-area]').map(n => n.dataset.area),
    /* a facet control that shows its value: a pressed chip, or a select holding one */
    pressed: (() => {
      const out = [];
      ['site', 'form'].forEach(k => {
        const fld = document.querySelector('[data-dgu-field="f-' + k + '"]');
        if (!fld) return;
        fld.querySelectorAll('.kn-chip[aria-pressed="true"]')
          .forEach(b => out.push(k + '=' + b.getAttribute('data-o')));
      });
      ['obj', 'stg', 'geo', 'role', 'nov', 'sc'].forEach(k => {
        const c = document.getElementById('f-' + k + '-c');
        if (c && c.value) out.push(k + '=' + c.value);
      });
      return out;
    })()
  }));
  const want = REF.tasks.find(t => t.id === 'chip_probe');
  // recompute for this exact state from the reference rule
  const st = { obj: 'ob_geo', stg: 'st_lic', geo: 'fi', role: '', nov: '', sc: '', site: ['si_seis', 'si_flood'], form: ['fo_sol'] };
  const exp = {}, not = {};
  for (const v of [st.obj, st.stg, st.role, st.nov, st.sc, ...st.site, ...st.form].filter(Boolean)) {
    const r = DATA.FEXP[v]; if (!r) continue;
    r[0].forEach(a => exp[a] = (exp[a] || 0) + 1);
    r[1].forEach(a => not[a] = (not[a] || 0) + 1);
  }
  const areasExp = Object.keys(exp).filter(a => (not[a] || 0) < exp[a]);
  const sa = setEq(got.areas, areasExp);
  push('chips_drive_the_state',
    'Driving the facet controls in the DOM - three selects and three chips - reaches the same ' +
    'state and the same subject-area verdict as setting the state directly, so the benchmark ' +
    'above is testing what a user actually drives',
    {
      all_facet_controls_found: eq(clicked.ok.every(Boolean), true),
      state_after_clicks: eq(JSON.stringify(clicked.state),
        JSON.stringify({ obj: 'ob_geo', stg: 'st_lic', geo: 'fi', site: ['si_seis', 'si_flood'], form: ['fo_sol'] })),
      facet_controls_showing_their_value: eq(got.pressed.length, 6),
      areas_after_clicks: { got: sa.got, ref: sa.ref, rel: sa.rel, ok: sa.ok }
    },
    sa.ok ? [] : ['areas ' + JSON.stringify([sa.missing, sa.unexpected])]);
  await page.evaluate(() => {
    state.obj = ''; state.stg = ''; state.geo = ''; state.site = []; state.form = []; render();
  });
}

/* -------------------------------------------------------- 7. scenarios */
{
  let bad = 0;
  const notes = [];
  for (const s of DATA.SCEN) {
    const got = await page.evaluate((id) => {
      applyScen(id);
      return {
        state: { obj: state.obj, stg: state.stg, geo: state.geo, role: state.role,
          nov: state.nov, sc: state.sc, site: state.site.slice(), form: state.form.slice() },
        scen: state.scen
      };
    }, s.id);
    const want = { obj: '', stg: '', geo: '', role: '', nov: '', sc: '', site: [], form: [], ...s.set };
    const okState = JSON.stringify(got.state) === JSON.stringify({
      obj: want.obj, stg: want.stg, geo: want.geo, role: want.role, nov: want.nov,
      sc: want.sc, site: want.site, form: want.form });
    if (!okState || got.scen !== s.id) {
      bad++;
      if (notes.length < 6) notes.push(`${s.id}: got ${JSON.stringify(got.state)} want ${JSON.stringify(want)}`);
    }
  }
  await page.evaluate(() => { state.scen = ''; state.obj = ''; state.stg = ''; state.geo = '';
    state.role = ''; state.nov = ''; state.sc = ''; state.site = []; state.form = []; render(); });
  push('scenarios', 'Each of the 14 ready-made project situations presets exactly the facet values ' +
    'its record declares', { scenarios_disagreeing: eq(bad, 0) }, notes);
}

/* -------------------------------------------------------- 8. languages */
{
  const i = REF.i18n;
  const notes = [i.content_language_note];
  const cmp = {
    catalogue_six_languages_complete: eq(i.catalogue_missing.length, 0),
    catalogue_placeholders_or_untranslated_copies: eq(i.catalogue_placeholders.length, 0),
    content_pack_keys_missing: eq(Object.keys(i.missing).length, 0),
    content_placeholders: eq(i.placeholders.length, 0),
    content_shape_errors: eq(i.shape.length, 0),
    /* The declaration is compared with the interface the page actually offers, read from the
       page's own LANGS in the reference input. This assertion used to be the literal '["en"]',
       written when the tool was English-interface-only; the page now offers seven languages and
       declares seven, so the typed literal failed a page that is correct. A count or a list an
       assertion depends on is derived from what the run measured, never retyped. */
    declares_its_interface_language: eq(JSON.stringify([...(i.declared_tool_languages || [])].sort()),
                                        JSON.stringify([...(i.interface_languages || [])].sort()))
  };
  // the shared chrome must still follow ?lang=
  for (const lang of ['uk', 'fr']) {
    const before = pageErrors.length;
    await page.goto(URLBASE + '?lang=' + lang, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      docLang: document.documentElement.lang,
      cards: document.querySelectorAll('#reg-list .card[data-id]').length
    }));
    cmp['site_language_' + lang] = eq(r.docLang, lang);
    cmp['cards_in_' + lang] = eq(r.cards, REF.counts.total_docs);
    if (pageErrors.length > before) notes.push(`${lang}: ${JSON.stringify(pageErrors.slice(before))}`);
  }
  await page.goto(URLBASE + '?lang=en', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  push('languages',
    'The six catalogue languages are complete and none is a copy of the English text; the content ' +
    'packs are complete and well-shaped in the one language the tool declares; and the page follows ' +
    '?lang= for the shared chrome',
    cmp, [...notes, ...i.catalogue_missing.slice(0, 5), ...i.placeholders.slice(0, 5), ...i.shape.slice(0, 5)]);
}

/* -------------------------------------------------------- 9. spot checks */
{
  const cmp = {};
  const notes = [];
  let wrongStatus = 0, wrongIdent = 0, unverified = 0;
  for (const s of SPOT.checks) {
    const d = BYID[s.doc];
    if (!d) { wrongIdent++; notes.push(`${s.doc}: no such record`); continue; }
    if (s.verdict === 'unverified') {
      unverified++;
      flagged.push({ case: 'primary_source_spot_check', entry: s.doc, designation: s.designation,
        reason: s.note, source_url: s.source_url });
      continue;
    }
    if (s.designation && d.idn.trim() !== s.designation.trim()) {
      wrongIdent++;
      notes.push(`${s.doc}: register shows "${d.idn}", catalogue shows "${s.designation}"`);
    }
    if (s.status !== 'current') {
      wrongStatus++;
      notes.push(`${s.doc} (${d.idn}): the issuing body lists this as ${s.status} — ${s.source_url}`);
    }
  }
  cmp.designations_disagreeing_with_the_issuing_body = eq(wrongIdent, 0);
  cmp.designations_withdrawn_but_shown_as_current = eq(wrongStatus, 0);
  cmp.spot_checks_run = { got: SPOT.checks.length, ref: SPOT.checks.length, rel: 0, ok: SPOT.checks.length >= 15 };
  notes.push(`${SPOT.checks.length} entries checked against the issuing body directly; ${unverified} ` +
    `could not be established from a primary source (the AERB site was unreachable) and are flagged, ` +
    `not graded — the register's own limitations already disclose that the Indian layer is single-sourced`);
  push('primary_source_spot_check',
    'A sample of designations, titles, issuing bodies and current status checked against IAEA, ISO, ' +
    'IEC, ASME, WENRA, EUR-Lex, gov.uk, Stuklex and the Indian PIB directly',
    cmp, notes);
}

/* -------------------------------------------------------- 10. permalink */
{
  const has = await page.evaluate(() => !!window.Diagram);
  const cmp = { runtime_present: eq(has, true) };
  const notes = [];
  if (has) {
    const link = await page.evaluate(() => {
      applyScen('C07');
      state.fCat = 'reg'; state.fAr = 'ar_waste'; state.q = 'iaea';
      render();
      return Diagram.state.link();
    });
    const u = new URL(link);
    await page.goto(URLBASE + '?' + u.searchParams.toString(), { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const back = await page.evaluate(() => ({
      scen: state.scen, obj: state.obj, geo: state.geo, fCat: state.fCat, fAr: state.fAr, q: state.q,
      ids: [...document.querySelectorAll('#reg-list .card[data-id]')].map(c => c.dataset.id)
    }));
    cmp.permalink_scenario = eq(back.scen, 'C07');
    cmp.permalink_facility_type = eq(back.obj, 'ob_geo');
    cmp.permalink_register_category = eq(back.fCat, 'reg');
    cmp.permalink_register_area = eq(back.fAr, 'ar_waste');
    cmp.permalink_query = eq(back.q, 'iaea');
    cmp.permalink_result_not_empty = eq(back.ids.length > 0, true);
    notes.push('permalink: ' + link.slice(0, 110));
  } else {
    notes.push('diagram-common.js is not loaded by this page, so there is no permalink to round-trip');
  }
  push('permalink_round_trip', 'A scenario plus register filter state survives encode -> link -> fresh load',
    cmp, notes);
}

/* -------------------------------------------------------- artifact */
const passed = cases.filter(c => c.pass).length;
const artifact = {
  tool: 'kernnormenwijzer',
  file: 'kernnormenwijzer.html',
  benchmark_kind: 'data-integrity',
  reference: 'DATA-INTEGRITY benchmark, not a physics one: this tool computes nothing, it maps the ' +
    'normative landscape of nuclear projects by facility type, lifecycle stage and jurisdiction. The ' +
    'reference is an independent python re-implementation (bench-src/ref/gen_kernnormenwijzer.py) of ' +
    'the record schema, the referential closure of the corpus, the jurisdiction visibility rule, the ' +
    'register filter semantics and the facet verdict rule, written from the documented meaning of the ' +
    "taxonomy rather than from the page's own functions, plus factual spot-checks of designations, " +
    "titles, issuing bodies and current status against each issuing body's own catalogue.",
  reference_citations: [
    'Independent re-implementation of the schema, referential closure, visibility, filter and verdict rules: bench-src/ref/gen_kernnormenwijzer.py (this repository).',
    ...SPOT.checks.filter(s => s.verdict !== 'unverified').map(s =>
      `${s.designation} — ${s.title_at_source} (${s.body}): ${s.status_text} — ${s.source_url}`),
    ...SPOT.checks.filter(s => s.verdict === 'unverified').map(s =>
      `${s.designation} (${s.body}): UNVERIFIED — ${s.note} (attempted: ${s.source_url})`)
  ],
  tolerance: 'Exact set equality, with no tolerance at all. Every register filter, facet path and ' +
    'search path must return exactly the set of record ids computed independently in python, grouped ' +
    'in the category order the page declares, and every printed count and grid cell must equal a ' +
    'recount of the data. Schema and cross-reference checks must report zero errors. The six ' +
    'catalogue languages must be complete and none may be a byte copy of the English text. A ' +
    'designation is graded wrong only where the issuing body itself lists it as withdrawn or ' +
    'superseded; where current status could not be established from a primary source the entry is ' +
    'flagged as unverified and not graded.',
  crosscheck: "The page ships its own consistency panel. It is deliberately not used as a reference: a " +
    "self-check that re-evaluates the page's own data does not validate it. The python reference and " +
    'the DOM are the two sides compared.',
  not_benchmarked: [
    'whether the register is complete for any jurisdiction — it is explicitly not, and the page ' +
      'declares a depth per jurisdiction (worked / outlined / framework only) for that reason',
    'the substantive engineering or legal judgement in the entry texts',
    'the edition in force of any document: the page names documents without editions and says so, ' +
      'so only designation, title, issuing body and current status are checked',
    'the Indian layer beyond the two entries attempted: aerb.gov.in was unreachable from this ' +
      'environment, which is the same limitation the page already discloses'
  ],
  spot_check_method: SPOT.method,
  total: cases.length,
  passed,
  failed: cases.length - passed,
  flagged,
  page_errors: pageErrors,
  run_at: new Date().toISOString(),
  cases
};
/* One write, to the path the page's manifest names. The two earlier write sites were the
   same bytes sent to a results directory and to the site's benchmarks directory; the
   resolver's default output is the second of those, so the artifact the site serves is
   written here and not copied in afterwards. */
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(artifact, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`\n${passed}/${cases.length} passed, ${flagged.length} flagged, ${pageErrors.length} page errors`);
await browser.close();
process.exit(passed === cases.length ? 0 : 1);
