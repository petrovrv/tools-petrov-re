/* Benchmark driver — normenwijzer.html  ("Standards Orientation Aid")
 *
 * THIS IS A DATA-INTEGRITY BENCHMARK, NOT A PHYSICS ONE.  The tool computes nothing:
 * it is a navigator over a corpus of legal instruments, standards, sector guidance,
 * calculation methods and rules of thumb.  What is graded is therefore
 *
 *   - schema validity of every record (documents, key conditions, scenarios),
 *   - referential closure (no key condition pointing at a document that does not exist,
 *     no facet value naming a subject no record carries, no orphan catalogue string),
 *   - the counts and tallies the page prints against a recount of the data,
 *   - every registry filter, facet path and search path driven through the DOM against a
 *     set computed independently in python, including the empty result and the
 *     all-selected case,
 *   - six-language catalogue completeness, and
 *   - factual spot-checks of standard numbers, titles, issuing bodies and current status
 *     against the issuing body's own catalogue (recorded with the URL used).
 *
 * The reference is bench-src/ref/normenwijzer_ref.json, produced by
 * bench-src/ref/gen_normenwijzer.py, which re-implements the selection and filter
 * semantics from the documented meaning of the facet table rather than from the tool's
 * own functions.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build is read out of
   the live page by readPageManifestRevision() and passed to stampProvenance(), which
   writes build, manifest_revision, reference_provenance, provenance_note and run_at and
   refuses to write anything without an observed build. */
const PROVENANCE = {
  reference_provenance: "mixed",
  provenance_note: "Reference values are derived by bench-src/ref/gen_normenwijzer.py rather than transcribed, but that generator could not be re-run against this tree (its lines 21 and 22 hardcode an absolute site directory and an absolute output path that exist on no machine in this container, and it reads normenwijzer.html and normenwijzer-data.json from the first of them; its facet tables are therefore read out of the page while its registry and facet semantics are written out again), so the corpus is not reproduced here and the artifact reuses it as stored."
};

/* ADAPTED FOR HTTP.  The driver was written against an absolute site directory on a machine
 * that no longer exists: it read the data file off that disk and served it from a throwaway
 * node http server of its own.  It now takes a base URL and a tool path and drives what is
 * served there,
 * fetching the data file over the same http:
 *
 *   node run_normenwijzer.mjs --base http://127.0.0.1:8324 --tool normenwijzer.html \
 *        [--ref <ref json>] [--spot <spotcheck json>] [--out <dir>]
 *
 * Every tolerance, every case id, every reference value and every comparison is the one the
 * deployed driver carried.  Added: assertions that the filters, facets and scenarios really
 * took, and an ungraded positive control.                                                   */
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const TOOL = arg('--tool', 'normenwijzer.html');
/* This driver drives its page over http; the origin stays this driver's own default when
   neither --base nor BENCH_BASE names one, so the transport is unchanged. Every other
   path - site root, reference directory, reference files, artifact, control and abort
   dumps - comes from the resolver and resolves inside whichever tree this driver is run
   from. --out now names the artifact file rather than a directory; the control and abort
   dumps keep their names beside it. */
const P = benchPaths({ name: 'normenwijzer', page: TOOL,
  ref: ['normenwijzer_ref.json', 'normenwijzer_spotcheck.json'],
  env: { ...process.env, BENCH_BASE: process.env.BENCH_BASE || 'http://127.0.0.1:8324' } });
const BASE = P.base;
const OUT = P.out;
const sibling = name => path.join(path.dirname(OUT), name);
const REFPATH = P.refs['normenwijzer_ref.json'];
const SPOTPATH = P.refs['normenwijzer_spotcheck.json'];

const REF = JSON.parse(fs.readFileSync(REFPATH, 'utf8'));
/* the data file is read from the SERVED tree, not from a local path, so the corpus graded is
   the corpus the page itself loads */
const DATA = await (await fetch(BASE + '/normenwijzer-data.json')).json();
const SPOT = JSON.parse(fs.readFileSync(SPOTPATH, 'utf8'));
const control = { base: BASE, tool: TOOL, ref: REFPATH, spot: SPOTPATH };
const consoleAll = [];
const DOCS = DATA.docs;
const BYID = Object.fromEntries(DOCS.map(d => [d.id, d]));
const CATS = ['law', 'std', 'guide', 'method', 'rule'];

const cases = [];
const flagged = [];
let pageErrors = [];

const URLBASE = BASE + '/' + TOOL;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  consoleAll.push(m.type() + ': ' + m.text().slice(0, 200));
  if (m.type() === 'error') pageErrors.push('console.error: ' + m.text());
});
const dumpAbort = (why) => {
  try {
    fs.writeFileSync(sibling('normenwijzer.aborted.json'), JSON.stringify(
      { abort: String(why && why.stack || why).slice(0, 4000), cases_so_far: cases,
        console: consoleAll, page_errors: pageErrors, control }, null, 1));
  } catch (e) { /* nothing left to do */ }
};
process.on('unhandledRejection', e => { dumpAbort(e); console.error('ABORT', e); process.exit(3); });
process.on('uncaughtException', e => { dumpAbort(e); console.error('ABORT', e); process.exit(3); });
await page.goto(URLBASE + '?lang=en', { waitUntil: 'load', timeout: 30000 });
/* The build this artifact names is the manifest_revision of the document the browser
   loaded, not of the file beside this driver. */
const BUILD = await readPageManifestRevision(page);
/* the port replaced the fixed 900 ms wait: the page is ready when its data file has been parsed
   and the register has rendered a card for every record */
await page.waitForFunction(n => typeof DOCS !== 'undefined' && DOCS.length === n
  && document.querySelectorAll('#list article.doc').length === n,
  DATA.docs.length, { timeout: 60000 });
{
  /* the driver reaches the controls through the ids the page deliberately keeps (keepId) and the
     page's own globals; if any had moved with the port the run would have measured the page's
     default, unfiltered state, so refuse to continue when they are not there */
  const g = await page.evaluate(() => ({
    globals: ['DOCS', 'PROV', 'SCEN', 'FACETS', 'I18N', 'LANG', 'clearTask', 'clearFilters']
      .map(k => k + '=' + typeof window[k]),
    ids: ['list', 'mx', 'task_out', 'scen_out', 'scen', 'f_sec', 'f_cat', 'f_dom', 'f_geo', 'f_q']
      .map(k => k + '=' + !!document.getElementById(k)),
    chips: document.querySelectorAll('.chip[data-f][data-o]').length,
    clearBtn: [...document.querySelectorAll('button')]
      .filter(e => (e.textContent || '').trim() === 'Clear selection').length
  }));
  const miss = [...g.globals.filter(x => x.endsWith('=undefined')), ...g.ids.filter(x => x.endsWith('=false'))];
  if (miss.length || !g.chips || !g.clearBtn)
    throw new Error('the page no longer carries what this driver drives: '
      + JSON.stringify({ missing: miss, chips: g.chips, clearBtn: g.clearBtn }));
  control.globals = g;
}
/* #task_clear existed in the pre-port markup; on this shell the same clearTask() sits behind a
   panel action button, so it is driven by its label instead of by an id that is gone */
/* SETTLE.  The pre-port page re-rendered synchronously on every change event, so the driver's
   fixed 25-30 ms waits were enough.  On the DiagramUI shell a field change goes through the
   framework's debounced sync/run, and the register panel is rebuilt around the render, so a read
   25 ms later can land on the previous render or on a freshly created, still empty #list.  Every
   fixed wait is therefore replaced by a wait on the page's OWN state plus the requirement that
   the register has actually been rendered (a card or the "nothing found" line), then two frames.
   Without this the eight section-filter cases read the unfiltered register (71 of 71 records
   instead of 21) and the six empty-result cases read an empty #list with no "nothing found"
   line at all, which is how a settle bug looks exactly like a page defect. */
/* stamp a sentinel into each host the page overwrites when it renders, so the wait below can
   tell "the page has re-rendered since I changed the input" from "the host still holds the
   previous render".  renderList() / renderScenario() / runTask() each assign innerHTML, which
   removes the sentinel; nothing else in the page touches it. */
const STAMP = (hosts) => page.evaluate(hs => {
  for (const h of hs) {
    const n = document.getElementById(h);
    if (!n) throw new Error('no #' + h + ' to stamp');
    const m = document.createElement('span');
    m.id = '__bench_stale_' + h;
    m.hidden = true;
    n.appendChild(m);
  }
}, hosts);
const settle = async (want, hosts, hostsOptional) => {
  if (hosts && hosts.length) {
    /* a case that asks for the state the page is already in redraws nothing, so where that is
       possible the sentinel is a sufficient signal rather than a necessary one and the state /
       chips / stability tests below carry the proof instead */
    const w = page.waitForFunction(hs => hs.every(h => !document.getElementById('__bench_stale_' + h)),
      hosts, { timeout: hostsOptional ? 5000 : 30000 });
    if (hostsOptional) await w.catch(() => {}); else await w;
    await page.evaluate(hs => hs.forEach(h => {
      const n = document.getElementById('__bench_stale_' + h); if (n) n.remove();
    }), hosts);
  }
  await page.waitForFunction(w => {
    const st = window.Diagram && window.Diagram.state.current();
    if (!st) return false;
    const eqv = (a, b) => {
      if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length
        && b.every((v, i) => String(v) === String(a[i]));
      return String(a == null ? '' : a) === String(b == null ? '' : b);
    };
    for (const k of Object.keys(w.filt || {})) if (!eqv((st.filt || {})[k], w.filt[k])) return false;
    for (const k of Object.keys(w.task || {})) if (!eqv((st.task || {})[k], w.task[k])) return false;
    if (w.scen !== undefined && !eqv(st.scen, w.scen)) return false;
    const list = document.getElementById('list');
    if (!list) return false;
    if (!list.querySelector('article.doc') && !list.querySelector('.empty')) return false;
    if (w.scenOut && !(document.getElementById('scen_out') || {}).innerText) return false;
    if (w.chips) {
      /* buildFacets() rebuilds the chips from the page's own task state on every redraw, so
         "the pressed chips are the wanted chips" is itself a render-completion test */
      const seen = [...document.querySelectorAll('.chip[data-f][aria-pressed="true"]')]
        .map(b => b.dataset.f + '=' + b.dataset.o).sort();
      if (JSON.stringify(seen) !== JSON.stringify(w.chips)) return false;
    }
    return true;
  }, want, { timeout: 30000 });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  /* and require the render to have stopped moving: a second, later redraw would otherwise be
     read as the first one's result */
  for (let i = 0; i < 8; i++) {
    const a = await page.evaluate(() => (document.getElementById('list').innerHTML || '').length);
    await page.waitForTimeout(150);
    const b2 = await page.evaluate(() => (document.getElementById('list').innerHTML || '').length);
    if (a === b2) return;
  }
  throw new Error('the register never stopped re-rendering');
};
const clickClearTask = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')]
    .filter(e => (e.textContent || '').trim() === 'Clear selection');
  if (!b.length) throw new Error('the facet panel has no "Clear selection" action');
  b[b.length - 1].click();
});

const push = (id, note, cmp, notes = []) => {
  const pass = Object.values(cmp).every(x => x.ok);
  cases.push({ id, note, inputs: {}, cmp,
    worst_rel: Math.max(0, ...Object.values(cmp).map(x => x.rel ?? 0)), pass, notes });
  process.stdout.write((pass ? 'PASS ' : 'FAIL ') + id +
    (notes.length ? '\n      ' + notes.join('\n      ') : '') + '\n');
};
const eq = (got, ref) => ({ got, ref, rel: got === ref ? 0 : 1, ok: got === ref });
const setEq = (got, ref) => {
  const a = [...new Set(got)].sort(), b = [...new Set(ref)].sort();
  const miss = b.filter(x => !a.includes(x)), extra = a.filter(x => !b.includes(x));
  return { got: a.length, ref: b.length, rel: miss.length + extra.length,
    ok: miss.length === 0 && extra.length === 0, missing: miss.slice(0, 12), unexpected: extra.slice(0, 12) };
};

/* ------------------------------------------------------------------ 0. page came up */
{
  const up = await page.evaluate(() => ({
    docs: typeof DOCS !== 'undefined' ? DOCS.length : -1,
    prov: typeof PROV !== 'undefined' ? PROV.length : -1,
    cards: document.querySelectorAll('#list article.doc').length,
    /* the pre-port overlay #nw-boot is now the page's own .nw-state block, which is rendered
       while the data file is pending and when it failed.  Reading the id that no longer exists
       would have reported "overlay removed" on a page that never loaded its corpus at all. */
    boot: !!document.querySelector('.nw-state'),
    title: document.title || ''
  }));
  const cmp = {
    data_file_loaded: eq(up.docs, DOCS.length),
    key_conditions_loaded: eq(up.prov, DATA.prov.length),
    boot_overlay_removed: eq(up.boot, false),
    cards_rendered: eq(up.cards, DOCS.length),
    no_page_errors: eq(pageErrors.length, 0)
  };
  push('load', 'The page loads its data file, removes the boot overlay and renders every record', cmp,
    pageErrors.slice(0, 5));
}

/* ------------------------------------------------------------------ 1. record schema */
{
  const s = REF.schema;
  const cmp = {
    document_schema_errors: eq(s.doc_errors.length, 0),
    key_condition_schema_errors: eq(s.prov_errors.length, 0),
    scenario_schema_errors: eq(s.scen_errors.length, 0),
    documents: eq(s.n_docs, DOCS.length),
    key_conditions: eq(s.n_prov, DATA.prov.length)
  };
  push('record_schema',
    'Every document, key condition and scenario validates against the schema the page expects; ' +
    'no missing required field, no unknown enum value, no duplicate id',
    cmp, [...s.doc_errors.slice(0, 6), ...s.prov_errors.slice(0, 6), ...s.scen_errors.slice(0, 6)]);
}

/* ------------------------------------------------------------------ 2. cross references */
{
  const r = REF.references;
  const cmp = {
    dangling_references: eq(r.dangling.length, 0),
    facet_values_without_a_record: eq(r.facet_value_unused.length, 0),
    subjects_no_record_carries: eq(r.subj_unused.length, 0),
    areas_no_record_carries: eq(r.area_unused.length, 0),
    domains_no_record_carries: eq(r.dom_unused.length, 0),
    geographies_no_record_carries: eq(r.geo_unused.length, 0),
    categories_no_record_carries: eq(r.cat_unused.length, 0)
  };
  push('cross_references',
    'No key condition points at a missing document or scenario, no catalogue string is an orphan, ' +
    'and every facet value, area, domain, geography and category is carried by at least one record',
    cmp, [...r.dangling.slice(0, 8), ...r.facet_value_unused.slice(0, 8)]);
}

/* ------------------------------------------------------------------ 3. counts in the UI */
{
  const got = await page.evaluate(() => {
    const byCat = {};
    document.querySelectorAll('#list article.doc').forEach(a => {
      const c = [...a.classList].find(x => x !== 'doc');
      byCat[c] = (byCat[c] || 0) + 1;
    });
    const rows = [...document.querySelectorAll('#mx tr')].length;
    return { byCat, cards: document.querySelectorAll('#list article.doc').length, matrixRows: rows };
  });
  const cmp = { total: eq(got.cards, REF.counts.total_docs) };
  const notes = [];
  for (const c of CATS) {
    cmp['cat_' + c] = eq(got.byCat[c] || 0, REF.counts.by_cat[c]);
    if ((got.byCat[c] || 0) !== REF.counts.by_cat[c])
      notes.push(`category ${c}: page ${got.byCat[c] || 0}, recount ${REF.counts.by_cat[c]}`);
  }
  push('counts', 'The number of cards the page renders, in total and per category, agrees with a ' +
    'recount of the data file', cmp, notes);
}

/* ------------------------------------------------------------------ 4. registry filters */
async function setFilters(f) {
  await STAMP(['list']);
  await page.evaluate((f) => {
    const fire = (id, v) => {
      const n = document.getElementById(id);
      n.value = v || '';
      n.dispatchEvent(new Event('input', { bubbles: true }));
      n.dispatchEvent(new Event('change', { bubbles: true }));
    };
    fire('f_sec', f.sec); fire('f_cat', f.cat); fire('f_dom', f.dom); fire('f_geo', f.geo);
    const q = document.getElementById('f_q');
    q.value = f.q || '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
  }, f);
  await settle({ filt: { sec: f.sec || '', cat: f.cat || '', dom: f.dom || '',
                         geo: f.geo || '', q: f.q || '' } }, ['list']);
  /* assert the five controls carry the values this case names before the result set is read */
  {
    const seen = await page.evaluate(() => ({
      sec: document.getElementById('f_sec').value, cat: document.getElementById('f_cat').value,
      dom: document.getElementById('f_dom').value, geo: document.getElementById('f_geo').value,
      q: document.getElementById('f_q').value
    }));
    const want = { sec: f.sec || '', cat: f.cat || '', dom: f.dom || '', geo: f.geo || '', q: f.q || '' };
    const bad = Object.keys(want).filter(k => String(seen[k] || '') !== String(want[k]));
    if (bad.length)
      throw new Error('INPUT ASSERTION FAILED: filters wanted ' + JSON.stringify(want)
        + ', page has ' + JSON.stringify(seen));
  }
  return page.evaluate(() => ({
    ids: [...document.querySelectorAll('#list article.doc')].map(a => a.dataset.id),
    empty: !!document.querySelector('#list .empty')
  }));
}
{
  let bad = 0, worst = [], nempty = 0;
  const orderBad = [];
  for (const fc of REF.filters) {
    const got = await setFilters(fc.f);
    const s = setEq(got.ids, fc.expected);
    if (!s.ok) { bad++; if (worst.length < 8) worst.push(`${fc.id}: expected ${fc.n}, got ${got.ids.length}; missing ${JSON.stringify(s.missing)} unexpected ${JSON.stringify(s.unexpected)}`); }
    else if (JSON.stringify(got.ids) !== JSON.stringify(fc.expected) && orderBad.length < 5)
      orderBad.push(`${fc.id}: same set, different order`);
    if (fc.n === 0) {
      nempty++;
      if (!got.empty) { bad++; worst.push(`${fc.id}: empty result is not announced with the "nothing found" line`); }
    }
  }
  await setFilters({});
  const cmp = {
    filter_cases_disagreeing: eq(bad, 0),
    group_order_disagreeing: eq(orderBad.length, 0),
    empty_result_cases_covered: { got: nempty, ref: nempty, rel: 0, ok: nempty > 0 }
  };
  push('registry_filters',
    `Every section, category, domain, geography and search path driven through the DOM ` +
    `(${REF.filters.length} cases, including the unfiltered set, ten combinations and the empty result) ` +
    `returns exactly the set recomputed in python`, cmp, [...worst, ...orderBad]);
}

/* ------------------------------------------------------------------ 5. task facets */
async function setTask(state) {
  await STAMP(['list', 'task_out']);
  await clickClearTask();
  const set = await page.evaluate((st) => {
    const done = [];
    for (const f of FACETS) {
      const v = st[f.id];
      const vals = Array.isArray(v) ? v : (v ? [v] : []);
      for (const o of vals) {
        /* the chips moved out of #facets into the framework's facet panel; the chips, their
           data-f / data-o and their aria-pressed state are the ones the page always had */
        const b = document.querySelector(`.chip[data-f="${f.id}"][data-o="${o}"]`);
        if (!b) throw new Error('no chip for ' + f.id + '=' + o);
        b.click(); done.push(f.id + '=' + o);
      }
    }
    return done;
  }, state);
  {
    const want = {};
    for (const f of (await page.evaluate(() => FACETS.map(x => x.id)))) {
      const v = state[f];
      want[f] = Array.isArray(v) ? v : (v || '');
    }
    await settle({ task: want, chips: [...new Set(set)].sort() }, ['list', 'task_out'], true);
  }
  /* assert the page really is in the state this case names, from its own chips */
  {
    const pressed = await page.evaluate(() =>
      [...document.querySelectorAll('.chip[data-f][aria-pressed="true"]')]
        .map(b => b.dataset.f + '=' + b.dataset.o).sort());
    const want = [...new Set(set)].sort();
    if (JSON.stringify(pressed) !== JSON.stringify(want))
      throw new Error('INPUT ASSERTION FAILED: facets wanted ' + JSON.stringify(want)
        + ', page has ' + JSON.stringify(pressed));
  }
  return page.evaluate(() => {
    const out = document.getElementById('task_out');
    const cnt = out.querySelector('.fam .count');
    let n = null;
    if (cnt) { const m = cnt.innerText.match(/(\d+)\s*$/); if (m) n = +m[1]; }
    return {
      selected: n,
      none: /^\s*$/.test(out.innerText) ? null : out.innerText.slice(0, 0) || null,
      excluded: [...out.querySelectorAll('.exent .code')].map(e => e.innerText.trim()),
      domRows: [...out.querySelectorAll('[data-godom]')].map(b => b.dataset.godom),
      cardExcluded: [...document.querySelectorAll('#list article.doc')]
        .filter(a => a.querySelector('.dexcl:not(.lift)')).map(a => a.dataset.id),
      flat: !!out.innerText && /—/.test('') ? false : null
    };
  });
}
{
  let bad = 0, notes = [];
  for (const tc of REF.tasks) {
    const got = await setTask(tc.state);
    const anySel = Object.values(tc.state).some(v => (Array.isArray(v) ? v.length : !!v));
    if (!anySel) {
      // nothing selected: the page must say so and mark no card
      if (got.selected !== null || got.excluded.length || got.cardExcluded.length) {
        bad++; notes.push(`${tc.id}: with no facet set the page still reports a selection`);
      }
      continue;
    }
    const expDomRows = Object.keys(tc.verdicts).filter(d =>
      ['clean', 'dust', 'hyg', 'chem', 'emis', 'mar', 'nuc', 'clos'].includes(d) &&
      tc.verdicts[d] === 1 &&
      tc.expected_selected.some(id => BYID[id].dom.includes(d)));
    const sN = eq(got.selected === null ? 0 : got.selected, tc.n_selected);
    const sE = setEq(got.excluded, tc.expected_excluded);
    const sC = setEq(got.cardExcluded, tc.expected_excluded);
    const sD = setEq(got.domRows, expDomRows);
    if (!sN.ok || !sE.ok || !sC.ok || !sD.ok) {
      bad++;
      if (notes.length < 10) notes.push(`${tc.id}: selected ${got.selected}/${tc.n_selected}, ` +
        `excluded ${got.excluded.length}/${tc.expected_excluded.length} ` +
        `(missing ${JSON.stringify(sE.missing)}, unexpected ${JSON.stringify(sE.unexpected)}), ` +
        `card marks ${sC.ok ? 'ok' : 'MISMATCH'}, domain rows ${sD.ok ? 'ok' : JSON.stringify([sD.missing, sD.unexpected])}`);
    }
  }
  await STAMP(['list', 'task_out']);
  await clickClearTask();
  await settle({ chips: [] }, ['list', 'task_out'], true);
  const cmp = { task_cases_disagreeing: eq(bad, 0),
    task_cases_run: { got: REF.tasks.length, ref: REF.tasks.length, rel: 0, ok: REF.tasks.length > 0 } };
  push('task_facets',
    `Every facet path driven through the DOM (${REF.tasks.length} cases: nothing selected, each of the ` +
    `28 scenarios, every single facet value on its own, and everything selected at once) selects and ` +
    `excludes exactly the documents recomputed in python, and the card marks agree with the summary`,
    cmp, notes);
}

/* ------------------------------------------------------------------ 6. scenarios */
{
  let bad = 0, notes = [];
  const SCEN = await page.evaluate(() => SCEN);
  for (const s of SCEN) {
    await STAMP(['list', 'scen_out']);
    const got = await page.evaluate((id) => {
      const sel = document.getElementById('scen');
      sel.value = id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return null;
    }, s.id);
    await settle({ scen: s.id, scenOut: true }, ['list', 'scen_out']);
    {
      const seen = await page.evaluate(() => document.getElementById('scen').value);
      if (seen !== s.id)
        throw new Error('INPUT ASSERTION FAILED: scenario wanted ' + s.id + ', page has ' + seen);
    }
    const st = await page.evaluate(() => ({
      pressed: [...document.querySelectorAll('.chip[data-f][aria-pressed="true"]')]
        .map(b => b.dataset.f + '=' + b.dataset.o),
      out: document.getElementById('scen_out').innerText.length,
      provIds: [...document.querySelectorAll('#scen_out .pv')].map(p => p.dataset.entry)
    }));
    const want = [];
    for (const [f, v] of Object.entries(s.set)) (Array.isArray(v) ? v : [v]).forEach(o => want.push(f + '=' + o));
    const sp = setEq(st.pressed, want);
    const sv = setEq(st.provIds, REF.prov_index.by_scen[s.id]);
    if (!sp.ok || !sv.ok || st.out < 50) {
      bad++;
      if (notes.length < 8) notes.push(`${s.id}: facets ${sp.ok ? 'ok' : JSON.stringify([sp.missing, sp.unexpected])}, ` +
        `key conditions ${sv.ok ? 'ok' : JSON.stringify([sv.missing, sv.unexpected])}, text length ${st.out}`);
    }
  }
  await STAMP(['list', 'scen_out']);
  await page.evaluate(() => {
    const sel = document.getElementById('scen'); sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle({ scen: '' }, ['list', 'scen_out'], true);
  push('scenarios',
    'Each of the 28 industry scenarios presets exactly the facet values its record declares and renders ' +
    'exactly the key conditions attached to it',
    { scenarios_disagreeing: eq(bad, 0) }, notes);
}

/* ------------------------------------------------------------------ 7. key conditions per document */
{
  const got = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('#list article.doc').forEach(a => {
      out[a.dataset.id] = [...a.querySelectorAll('.pv')].map(p => p.dataset.entry);
    });
    return out;
  });
  let bad = 0; const notes = [];
  for (const d of DOCS) {
    const s = setEq(got[d.id] || [], REF.prov_index.by_doc[d.id]);
    if (!s.ok) { bad++; if (notes.length < 8) notes.push(`${d.id}: ${JSON.stringify([s.missing, s.unexpected])}`); }
  }
  push('key_conditions',
    'Every document card renders exactly the key conditions whose record names it, and no other',
    { documents_disagreeing: eq(bad, 0) }, notes);
}

/* ------------------------------------------------------------------ 8. six languages */
{
  const notes = [];
  const cmp = {
    missing_keys_per_language: eq(Object.keys(REF.i18n.missing_per_language).length, 0),
    missing_catalogue_entries: eq(Object.keys(REF.i18n.pack_missing).length, 0),
    placeholders_or_empty_strings: eq(REF.i18n.placeholders.length, 0),
    keys_referenced_by_code_but_absent: eq(REF.i18n.code_keys_missing_in_data.length, 0),
    banned_claim_wording_in_the_corpus: eq(REF.banned.length, 0)
  };
  // and the interface actually switches: no key echoed back as its own name, in every language
  let leftover = 0;
  for (const lang of ['en', 'uk', 'de', 'nl', 'fr', 'es']) {
    const before = pageErrors.length;
    await page.goto(URLBASE + '?lang=' + lang, { waitUntil: 'load' });
    await page.waitForFunction(([n, lg]) => typeof DOCS !== 'undefined' && DOCS.length === n
      && LANG === lg && document.querySelectorAll('#list article.doc').length === n,
      [DATA.docs.length, lang], { timeout: 60000 });
    const r = await page.evaluate((lg) => {
      const txt = document.body.innerText;
      // only keys that cannot also be an ordinary word of the language are tested, so that
      // Dutch "lang" (= long) is not mistaken for the untranslated key "lang"
      const keys = Object.keys(I18N[lg] || {}).filter(k => /[_0-9]/.test(k) && k.length > 3);
      const echoed = keys.filter(k => new RegExp('(^|\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'm').test(txt));
      return {
        lang: LANG, cards: document.querySelectorAll('#list article.doc').length,
        echoed, title: document.title || '',
        len: txt.length
      };
    }, lang);
    cmp['lang_' + lang + '_applied'] = eq(r.lang, lang);
    cmp['lang_' + lang + '_cards'] = eq(r.cards, DOCS.length);
    if (r.echoed.length) { leftover += r.echoed.length; notes.push(`${lang}: untranslated key echoed in the page: ${r.echoed.slice(0, 6).join(', ')}`); }
    if (pageErrors.length > before) notes.push(`${lang}: page errors ${JSON.stringify(pageErrors.slice(before))}`);
  }
  cmp.untranslated_keys_echoed_in_the_page = eq(leftover, 0);
  push('six_languages',
    'Every key of the reference language exists in the other five, no placeholder or empty string, ' +
    'no key referenced by the code but absent from the data, and the interface really switches in all six',
    cmp, notes);
  await page.goto(URLBASE + '?lang=en', { waitUntil: 'load' });
  await page.waitForFunction(n => typeof DOCS !== 'undefined' && DOCS.length === n && LANG === 'en'
    && document.querySelectorAll('#list article.doc').length === n,
    DATA.docs.length, { timeout: 60000 });
}

/* ------------------------------------------------------------------ 9. factual spot-checks */
{
  const cmp = {};
  const notes = [];
  let wrongStatus = 0, wrongIdent = 0, unverified = 0;
  for (const s of SPOT.checks) {
    const d = BYID[s.doc];
    if (!d) { notes.push(`${s.doc}: no such record`); wrongIdent++; continue; }
    const idn = (d.idn || '').trim();
    if (s.verdict === 'unverified') { unverified++; continue; }
    if (s.designation && idn && !idn.toLowerCase().startsWith(s.designation.toLowerCase().slice(0, 8))) {
      wrongIdent++; notes.push(`${s.doc}: page shows ${idn}, catalogue shows ${s.designation}`);
    }
    if (s.status !== 'current') {
      wrongStatus++;
      notes.push(`${s.doc} (${idn}): the issuing body lists this designation as ${s.status} — ${s.source_url}`);
    }
  }
  cmp.designations_disagreeing_with_the_issuing_body = eq(wrongIdent, 0);
  cmp.designations_withdrawn_but_shown_as_current = eq(wrongStatus, 0);
  cmp.spot_checks_run = { got: SPOT.checks.length, ref: SPOT.checks.length, rel: 0, ok: SPOT.checks.length >= 20 };
  cmp.spot_checks_unverified = { got: unverified, ref: unverified, rel: 0, ok: true };
  notes.push(`${SPOT.checks.length} entries checked against the issuing body's own catalogue; ` +
    `${unverified} could not be established from a primary source and are recorded as unverified, not graded`);
  push('primary_source_spot_check',
    'A sample of standard numbers, titles, issuing bodies and current/withdrawn status checked against ' +
    'ISO, IEC, ECSS, IAEA, NASA, HSE and EUR-Lex directly',
    cmp, notes);
  for (const s of SPOT.checks) if (s.verdict === 'unverified')
    flagged.push({ case: 'primary_source_spot_check', entry: s.doc, designation: s.designation,
      reason: s.note, source_url: s.source_url || null });
}

/* ------------------------------------------------------------------ 10. permalink / state */
{
  const has = await page.evaluate(() => typeof window.Diagram === 'object' && !!window.Diagram);
  const cmp = { runtime_present: eq(has, true) };
  const notes = [];
  if (has) {
    const rt = await page.evaluate(async () => {
      document.getElementById('f_cat').value = 'std';
      document.getElementById('f_cat').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('f_q').value = 'iso';
      document.getElementById('f_q').dispatchEvent(new Event('input', { bubbles: true }));
      const sel = document.getElementById('scen'); sel.value = 'S04';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return Diagram.state.link();
    });
    const u = new URL(rt);
    await page.goto(URLBASE + '?' + u.searchParams.toString(), { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const st = window.Diagram && window.Diagram.state.current();
      const list = document.getElementById('list');
      return !!st && typeof DOCS !== 'undefined' && !!list
        && (!!list.querySelector('article.doc') || !!list.querySelector('.empty'));
    }, null, { timeout: 60000 });
    await settle({ filt: { cat: 'std', q: 'iso' }, scen: 'S04' });
    /* a fresh load renders once by itself; the state assertion above is the settle here */
    const back = await page.evaluate(() => ({
      cat: document.getElementById('f_cat').value,
      q: document.getElementById('f_q').value,
      scen: document.getElementById('scen').value,
      ids: [...document.querySelectorAll('#list article.doc')].map(a => a.dataset.id)
    }));
    cmp.permalink_cat = eq(back.cat, 'std');
    cmp.permalink_query = eq(back.q, 'iso');
    cmp.permalink_scenario = eq(back.scen, 'S04');
    cmp.permalink_result_set = eq(back.ids.length > 0, true);
    notes.push('permalink round trip: ' + rt.slice(0, 120));
  } else {
    notes.push('diagram-common.js is not loaded by this page, so there is no permalink to round-trip');
  }
  push('permalink_round_trip', 'A filter + scenario state survives encode -> link -> fresh load', cmp, notes);
}

/* ----------------------------------------------------- positive control (ungraded) */
{
  /* the permalink case above left the register filtered and a scenario selected; the control
     starts from a clean page so that "unfiltered" means unfiltered */
  await page.goto(URLBASE + '?lang=en', { waitUntil: 'load' });
  await page.waitForFunction(n => typeof DOCS !== 'undefined' && DOCS.length === n
    && document.querySelectorAll('#list article.doc').length === n,
    DATA.docs.length, { timeout: 60000 });
  /* A run whose cases all pass at the page's default, unfiltered state has measured nothing.
     One filter is moved by a visible amount and the rendered register must shrink with it. */
  const all = await setFilters({});
  const std = await setFilters({ cat: 'std' });
  const none = await setFilters({ q: 'zzzzzznosuchstring' });
  await setFilters({});
  control.positive_control = {
    perturbation: 'category filter "" -> "std" -> a search string no record carries',
    cards_unfiltered: all.ids.length, cards_category_std: std.ids.length,
    cards_impossible_query: none.ids.length,
    empty_line_shown_on_impossible_query: none.empty,
    outputs_moved: all.ids.length > std.ids.length && std.ids.length > 0
      && none.ids.length === 0 && none.empty === true
  };
  if (!control.positive_control.outputs_moved)
    throw new Error('POSITIVE CONTROL FAILED: filtering the register moved nothing: '
      + JSON.stringify(control.positive_control));
}

/* ------------------------------------------------------------------ write the artifact */
const passed = cases.filter(c => c.pass).length;
const artifact = {
  tool: 'normenwijzer',
  file: 'normenwijzer.html',
  benchmark_kind: 'data-integrity',
  reference: 'DATA-INTEGRITY benchmark, not a physics one: this tool computes nothing, it navigates a ' +
    'corpus of legal instruments, standards, sector guidance, calculation methods and rules of thumb. ' +
    'The reference is an independent python re-implementation (bench-src/ref/gen_normenwijzer.py) of the ' +
    'record schema, the referential closure of the corpus, the registry filter semantics and the facet ' +
    'selection semantics, written from the documented meaning of the facet table rather than from the ' +
    "tool's own selection functions, plus factual spot-checks of standard numbers, titles, issuing bodies " +
    "and current/withdrawn status against each issuing body's own catalogue.",
  reference_citations: [
    'Independent re-implementation of the schema, referential closure and filter/facet semantics: bench-src/ref/gen_normenwijzer.py (this repository).',
    ...SPOT.checks.map(s => `${s.designation || s.doc} — ${s.title_at_source || ''} (${s.body}): ${s.status_text} — ${s.source_url}`)
  ],
  tolerance: 'Exact set equality, with no tolerance at all. Every filter, facet and search path must return ' +
    'exactly the set of record ids computed independently in python — not a superset, not a subset, and in ' +
    'the same category order the page groups by. Counts must match a recount exactly. Schema and ' +
    'cross-reference checks must report zero errors. For the six languages, every key of the reference ' +
    'language must exist in the other five with no placeholder and no key echoed back as its own name. ' +
    'A standard is graded wrong only where the issuing body itself lists the designation as withdrawn or ' +
    'superseded; where current status could not be established from a primary source the entry is recorded ' +
    'as unverified and flagged, never guessed.',
  crosscheck: 'The tool ships its own consistency panel (the "checks" section). It is deliberately NOT used ' +
    'as a reference here — a self-check that re-evaluates the tool\'s own data does not validate it. The ' +
    'python reference and the DOM are the two sides compared.',
  not_benchmarked: [
    'the substantive engineering content of the guidance text (whether a given rule of thumb is good advice)',
    'the completeness of the corpus — the register is explicitly not exhaustive and no reference for ' +
      '"every instrument that should be here" exists',
    'the edition in force of each document: the tool deliberately names documents without editions and ' +
      'says so, so only the designation, title, issuing body and its current/withdrawn status are checked',
    'translation quality beyond presence, placeholders and untranslated leftovers'
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
control.run_at = artifact.run_at;
control.console = consoleAll;
control.page_errors = pageErrors;
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(artifact, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(P.out2 || sibling('normenwijzer.control.json'), JSON.stringify(control, null, 1));
console.log(`\n${passed}/${cases.length} passed, ${flagged.length} flagged, ${pageErrors.length} page errors`);
console.log(`run_at ${artifact.run_at}; console messages ${consoleAll.length}`);
await browser.close();
process.exit(passed === cases.length ? 0 : 1);
