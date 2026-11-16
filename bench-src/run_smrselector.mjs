/* Benchmark driver — smrselector.html  ("Small Modular Reactor Screening")
 *
 * THIS IS A DATA-INTEGRITY BENCHMARK, NOT A PHYSICS ONE.  The tool screens reactor
 * designs against a site and a requirement; it evaluates a documented set of gates and a
 * weighted score, it computes no physics.
 *
 * IMPORTANT — WHAT COULD NOT BE BENCHMARKED.  The shipped corpus of ~100 designs lives in
 * smr-data.json, smr-change-log.json and smr-update-status.json, which are maintained on
 * the server and are deliberately not part of this deployment tree.  They are absent here,
 * so the tool as deployed cannot be exercised at all: it renders "No dataset" and stops.
 * The factual content of the register — design names, outputs, temperatures, licensing
 * stages, national policy — therefore could NOT be verified and is listed under
 * not_benchmarked.  What is benchmarked is:
 *
 *   1. the no-dataset path itself, on the tree as it really is;
 *   2. the six-language catalogue that IS in the tree, for completeness and for keys the
 *      code asks for;
 *   3. the screening logic, driven through the DOM against a SYNTHETIC fixture served from
 *      a benchmark overlay (never written into the site tree). Every design in that fixture is
 *      built to violate exactly one documented gate, or none, so what the tool must do with
 *      it follows from the specification rather than from the tool's own code;
 *   4. invariants of the ranking that hold whatever the data: the pass and gated sets
 *      partition the register, scores stay inside their range, the order is the score
 *      order, and the Monte-Carlo rank probabilities are a probability distribution;
 *   5. the catalogue filters, against sets recomputed from the fixture.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readPageManifestRevision, stampProvenance, benchPaths } from './provenance.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build belongs to the
   run and not to this constant: readPageManifestRevision(page) reads it out of the live
   DOM of the page the browser loaded, and it reaches the artifact as stampProvenance's
   `build`, which writes build and manifest_revision and refuses to write without it. */
const PROVENANCE = {
  reference_provenance: "recorded",
  provenance_note: "No generator for this corpus exists anywhere in this tree, so its stored reference values cannot be re-derived here and are reused as stored, which AGENTS \u00a75 classes as a regression reference; its values are vendor-published reactor data and tracing them needs a generator that reads the cited datasheets."
};

/* Site root, fixture and output come from the resolver, so the run drives the tree this
   driver sits in. The fixture is a benchmark input and lives in the reference tree, not in
   the site: when it is absent the resolver refuses by name here, at the start, instead of
   failing inside a JSON.parse further down. */
const P = benchPaths({ name: 'smrselector', page: 'smrselector.html',
                       fixtures: 'smr-data.FIXTURE.json' });
const SITE = P.siteRoot;
const FIXTURE = JSON.parse(fs.readFileSync(P.fixture, 'utf8'));
const cases = [], flagged = [];
let pageErrors = [];

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

const browser = await chromium.launch();

/* ================================================================ 1. no dataset */
{
  const errs = [];
  const p = await browser.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/smr-data|Failed to fetch|404/.test(m.text())) errs.push('console.error: ' + m.text()); });
  await p.goto(P.pageUrl + '?lang=en', { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const st = await p.evaluate(() => ({
    text: document.body.innerText,
    named: /smr-data\.json/.test(document.body.innerText),
    hasData: !!window.DATA,
    discHidden: (document.getElementById('disc') || {}).hidden
  }));
  const declared = JSON.parse(fs.readFileSync(path.join(SITE, 'smrselector.html'), 'utf8')
    .match(/id="diagram-tool-manifest">(.*?)<\/script>/s)[1]).dependencies;
  const present = declared.filter(f => fs.existsSync(path.join(SITE, f)));
  push('no_dataset_path',
    'The register itself is a server-maintained dataset and is not in this tree. With it absent the ' +
    'page must say so plainly, name the file it wanted, and raise no exception — a silent empty ' +
    'screening would be far worse than an error',
    {
      dataset_absent_from_this_tree: eq(present.length, 0),
      says_there_is_no_dataset: eq(/No dataset|Geen dataset|Pas de jeu|Kein Datensatz|Немає|Sin conjunto/i.test(st.text), true),
      names_the_file_it_wanted: eq(st.named, true),
      no_uncaught_exception: eq(errs.length, 0),
      no_stale_data_object: eq(st.hasData, false)
    },
    [`declared dependencies, all absent here as intended: ${declared.join(', ')}`, ...errs.slice(0, 3)]);
  await p.close();
}

/* ================================================================ 2. six languages */
{
  const errs = [];
  const p = await browser.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(P.pageUrl + '?lang=en', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const i = await p.evaluate(() => ({
    langs: Object.keys(I18N),
    keys: Object.fromEntries(Object.entries(I18N).map(([k, v]) => [k, Object.keys(v)])),
    values: Object.fromEntries(Object.entries(I18N).map(([k, v]) => [k, v])),
    kbLangs: Object.keys(KB_I18N),
    kbKeys: Object.fromEntries(Object.entries(KB_I18N).map(([k, v]) => [k, Object.keys(v)]))
  }));
  const SITE_LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es'];
  const missing = {}, placeholders = [], empty = [];
  for (const l of SITE_LANGS) {
    if (!i.keys[l]) { missing[l] = ['(the whole language is absent)']; continue; }
    const m = i.keys.en.filter(k => !i.keys[l].includes(k));
    if (m.length) missing[l] = m;
    for (const [k, v] of Object.entries(i.values[l])) {
      if (typeof v !== 'string') continue;
      if (!v.trim()) empty.push(`${l}/${k}`);
      // NB: the uppercase markers are matched case-sensitively — "todo" is an ordinary Spanish word
      if (/\bTODO\b|\bTBD\b|\bFIXME\b|\bPLACEHOLDER\b|(?:untranslated|lorem ipsum)/.test(v)) placeholders.push(`${l}/${k}`);
    }
  }
  const kbMissing = {};
  for (const l of SITE_LANGS) {
    if (!i.kbKeys[l]) { kbMissing[l] = ['(absent)']; continue; }
    const m = i.kbKeys.en.filter(k => !i.kbKeys[l].includes(k));
    if (m.length) kbMissing[l] = m;
  }
  // every key the code asks for must exist in the reference language
  const src = fs.readFileSync(path.join(SITE, 'smrselector.html'), 'utf8');
  const literal = new Set([...src.matchAll(/\bT\('([^']+)'\)/g)].map(m => m[1]));
  for (const m of src.matchAll(/\bfmt\('([^']+)'/g)) literal.add(m[1]);
  const constructed = new Set();
  const add = (pre, list) => list.forEach(x => constructed.add(pre + x));
  add('cool.', [...new Set(FIXTURE.reactors.map(r => r.cool))]);
  add('fu2.', [...new Set(FIXTURE.reactors.map(r => r.fuelc))]);
  add('stage.', ['operating', 'construction', 'licensing', 'detailed_design', 'basic_design', 'concept']);
  add('acc.', ['truck', 'rail', 'barge', 'heavy']);
  add('a.', ['none', 'sub', 'sup', 'usc', 'ccgt']);
  add('w.', ['fit', 'conf', 'fuel', 'speed', 'model']);
  add('r.', ['n', 'n1', 'n11', '2n']);
  const want = [...new Set([...literal, ...constructed])].filter(k => /^[a-z0-9_]+\.[a-zA-Z0-9_.]+$/.test(k));
  const absent = want.filter(k => !i.keys.en.includes(k));
  push('six_languages',
    'Every key of the reference language exists in the other five in both catalogues, no placeholder ' +
    'and no empty string, and every key the code asks for is in the data',
    {
      languages_present: eq(i.langs.slice().sort().join(','), SITE_LANGS.slice().sort().join(',')),
      keys_missing_per_language: eq(Object.keys(missing).length, 0),
      knowledge_base_keys_missing: eq(Object.keys(kbMissing).length, 0),
      placeholders: eq(placeholders.length, 0),
      empty_strings: eq(empty.length, 0),
      keys_referenced_by_the_code_but_absent: eq(absent.length, 0)
    },
    [`${i.keys.en.length} interface keys and ${i.kbKeys.en.length} knowledge-base keys per language`,
      ...Object.entries(missing).map(([l, m]) => `${l}: ${m.length} missing, e.g. ${m.slice(0, 5).join(', ')}`),
      ...Object.entries(kbMissing).map(([l, m]) => `knowledge base ${l}: ${m.length} missing`),
      absent.length ? `asked for but absent: ${absent.slice(0, 10).join(', ')}` : '',
      ...placeholders.slice(0, 5), ...empty.slice(0, 5)].filter(Boolean));
  await p.close();
}

/* ================================================================ overlay server */
/* The overlay is the resolver's scratch directory, which sits outside the site root, so
   the fixture is never published with the site. */
const OVERLAY = P.scratch('overlay');
fs.rmSync(OVERLAY, { recursive: true, force: true });
fs.mkdirSync(OVERLAY, { recursive: true });
for (const f of fs.readdirSync(SITE)) {
  try { fs.symlinkSync(path.join(SITE, f), path.join(OVERLAY, f)); } catch (e) { /* ignore */ }
}
fs.copyFileSync(P.fixture, path.join(OVERLAY, 'smr-data.json'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.css': 'text/css' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const f = path.join(OVERLAY, u === '/' ? '/index.html' : u);
  fsp.readFile(f).then(d => {
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    rs.end(d);
  }).catch(() => { rs.writeHead(404); rs.end('not found'); });
});
await new Promise(r => srv.listen(0, r));
const URLBASE = `http://127.0.0.1:${srv.address().port}/smrselector.html`;

const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });
await page.goto(URLBASE + '?lang=en', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(700);

/* The build this artifact names: the revision in the live DOM of the page the run drove.
   The overlay serves the site's own smrselector.html through a symbolic link and replaces
   only smr-data.json, so the revision observed here is the revision of the page in this
   tree, and the stamp cross-checks it against that file. */
const BUILD = await readPageManifestRevision(page);

/* the benchmark site and requirement: inside country AA, 200 MWe, 280 C, 2035 */
const SITE_STATE = { lat: 10, lon: 10, iso: 'AA', cname: 'Aaland', access: 'rail',
  water: 'limited', arch: 'none', reuseTurbine: false, output: 'elec', mwe: 200, mwth: 0,
  temp: 280, cont: 'yes', flex: 'none', grid: 'strong', surplus: false, red: 'n1',
  oper: 'any', year: 2035, life: 40, alt: 'mid' };

async function screenWith(over) {
  return page.evaluate((o) => {
    Object.assign(S, o);
    S.result = screen();
    return {
      invalid: S.result.invalid || null,
      pass: S.result.pass.map(p => ({ id: p.r.id, fit: p.fit, conf: p.conf, fuel: p.fuelScore,
        speed: p.speedScore, model: p.modelScore, score: p.score, pWin: p.pWin, pTop3: p.pTop3,
        modules: p.mc })),
      gates: S.result.gates.map(g => ({ id: g.r.id, why: g.why.map(w => w.k) })),
      total: DATA.reactors.length
    };
  }, over);
}

/* ================================================================ 3. gates */
{
  const base = await screenWith(SITE_STATE);
  const expect = {
    R_NOTPROC: 'gate.notproc',
    R_HEATONLY: 'gate.heatonly',
    R_TEMP: 'gate.temp',
    R_MODULES: 'gate.modules',
    R_WATER: null,                 // water 'limited' is not a stop; only 'none' is
    R_TRANSPORT: null,             // access 'rail' allows heavy lift; only truck-only stops
    R_TIMING: 'gate.timing',
    // country AA is in the NSG, so a supplier it cannot buy from is reported as the
    // western-alignment gate rather than as the bloc's own gate — that is the documented rule
    R_BLOC_RU: 'gate.bloc_west',
    R_BLOC_CN: 'gate.bloc_west'
  };
  const cmp = {}, notes = [];
  const byId = Object.fromEntries(base.gates.map(g => [g.id, g.why]));
  for (const [id, key] of Object.entries(expect)) {
    if (key === null) {
      cmp['not_eliminated_' + id] = eq(!byId[id], true);
      if (byId[id]) notes.push(`${id} was eliminated for ${byId[id].join(', ')} though the documented ` +
        'rule only stops it under a stricter site');
    } else {
      cmp['eliminated_' + id] = eq(byId[id] ? byId[id].includes(key) : false, true);
      if (!byId[id] || !byId[id].includes(key))
        notes.push(`${id}: expected ${key}, got ${byId[id] ? byId[id].join(', ') : 'no elimination'}`);
    }
  }
  const clean = ['R_OK1', 'R_OK2', 'R_OK3'];
  cmp.baseline_designs_survive = setEq(base.pass.map(p => p.id).filter(x => clean.includes(x)), clean);
  cmp.pass_and_gated_partition_the_register =
    eq(base.pass.length + base.gates.length, base.total);
  cmp.no_design_is_both_passed_and_gated =
    eq(base.pass.filter(p => byId[p.id]).length, 0);
  push('screening_gates',
    'Each design in the fixture is built to violate exactly one documented gate, or none. The tool ' +
    'must eliminate exactly those, for exactly that reason, and the passed and eliminated sets must ' +
    'partition the register',
    cmp, notes);

  // gates that need a stricter site
  const strict = await screenWith(Object.assign({}, SITE_STATE, { water: 'none', access: 'truck' }));
  const sById = Object.fromEntries(strict.gates.map(g => [g.id, g.why]));
  push('screening_gates_site_dependent',
    'With no cooling water and a truck-only site, the two site gates the documented rule reserves for ' +
    'that case must fire, and only for the designs that need them',
    {
      water_gate_fires_for_the_water_cooled_design:
        eq(!!(sById.R_WATER || []).includes('gate.water'), true),
      water_gate_does_not_fire_for_an_air_cooled_design:
        eq(!!(sById.R_OK1 || []).includes('gate.water'), false),
      transport_gate_fires_for_heavy_lift:
        eq(!!(sById.R_TRANSPORT || []).includes('gate.transport'), true),
      transport_gate_does_not_fire_for_truckable:
        eq(!!(sById.R_OK1 || []).includes('gate.transport'), false)
    }, []);

  // the retrofit turbine gate
  const turb = await screenWith(Object.assign({}, SITE_STATE, { arch: 'usc', reuseTurbine: true }));
  const tById = Object.fromEntries(turb.gates.map(g => [g.id, g.why]));
  push('screening_gate_turbine',
    'When an existing ultra-supercritical turbine must be reused, a design whose live steam is more ' +
    'than 25 K below the archetype must be stopped, and one that meets it must not',
    {
      low_steam_design_stopped: eq(!!(tById.R_OK1 || []).includes('gate.turbine'), true),
      matching_steam_design_not_stopped: eq(!!(tById.R_HTGR || []).includes('gate.turbine'), false)
    },
    ['archetype 600 C, so the documented rule stops anything below 575 C: R_OK1 live steam 300 C ' +
     '(stopped), R_HTGR 590 C (kept)']);

  // jurisdiction gates
  const proh = await screenWith(Object.assign({}, SITE_STATE, { iso: 'CC', cname: 'Ceeland', lat: 5, lon: 5 }));
  const pById = Object.fromEntries(proh.gates.map(g => [g.id, g.why]));
  const phase = await screenWith(Object.assign({}, SITE_STATE, { iso: 'DD', cname: 'Deeland' }));
  const phById = Object.fromEntries(phase.gates.map(g => [g.id, g.why]));
  // a country outside the NSG: the Russian and Chinese supplier gates must name their own bloc
  const nonNsg = await screenWith(Object.assign({}, SITE_STATE, { iso: 'EE', cname: 'Eeland' }));
  const eById = Object.fromEntries(nonNsg.gates.map(g => [g.id, g.why]));
  push('screening_gates_jurisdiction',
    'A jurisdiction that prohibits nuclear power stops every design; one that is phasing out flags ' +
    'every design; and a supplier bloc the country cannot buy from is stopped per design, not per country',
    {
      prohibited_stops_everything: eq(proh.pass.length, 0),
      prohibited_reason_on_every_design:
        eq(proh.gates.every(g => g.why.includes('gate.prohibited')), true),
      phase_out_flagged_on_every_design:
        eq(phase.gates.every(g => g.why.includes('gate.phaseout')), true),
      western_designs_pass_in_a_western_country:
        eq(base.pass.some(p => p.id === 'R_OK1'), true),
      russian_supplier_named_outside_the_nsg:
        eq(!!(eById.R_BLOC_RU || []).includes('gate.bloc_ru'), true),
      chinese_supplier_named_outside_the_nsg:
        eq(!!(eById.R_BLOC_CN || []).includes('gate.bloc_cn'), true),
      western_supplier_named_outside_the_nsg:
        eq(!!(eById.R_OK1 || []).includes('gate.bloc_west'), true)
    },
    [`prohibited country: ${proh.pass.length} designs pass; phase-out country: ` +
     `${phase.gates.length} eliminations, ${phase.pass.length} pass`]);
}

/* ================================================================ 4. ranking invariants */
{
  const r = await screenWith(SITE_STATE);
  const cmp = {};
  const notes = [];
  const inRange = r.pass.every(p => ['fit', 'conf', 'fuel', 'speed', 'model'].every(
    k => Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 100));
  cmp.every_axis_inside_0_100 = eq(inRange, true);
  cmp.score_inside_0_100 = eq(r.pass.every(p => p.score >= 0 && p.score <= 100), true);
  const sorted = r.pass.every((p, i) => i === 0 || r.pass[i - 1].score >= p.score);
  cmp.order_is_the_score_order = eq(sorted, true);
  const sumWin = r.pass.reduce((s, p) => s + (p.pWin || 0), 0);
  const sumTop3 = r.pass.reduce((s, p) => s + (p.pTop3 || 0), 0);
  cmp.win_probabilities_sum_to_one = { got: sumWin, ref: 1, rel: Math.abs(sumWin - 1), ok: Math.abs(sumWin - 1) < 1e-9 };
  cmp.top3_probabilities_sum_to_at_most_three =
    { got: sumTop3, ref: 3, rel: 0, ok: sumTop3 <= 3 + 1e-9 && sumTop3 > 0 };
  cmp.every_probability_in_0_1 =
    eq(r.pass.every(p => p.pWin >= 0 && p.pWin <= 1 && p.pTop3 >= 0 && p.pTop3 <= 1), true);
  cmp.top3_at_least_as_likely_as_win = eq(r.pass.every(p => p.pTop3 >= p.pWin - 1e-12), true);
  // the rank stability must be reproducible: the same screening must print the same figure
  const again = await screenWith(SITE_STATE);
  cmp.rank_stability_is_reproducible = eq(
    JSON.stringify(again.pass.map(p => [p.id, p.pWin, p.pTop3])),
    JSON.stringify(r.pass.map(p => [p.id, p.pWin, p.pTop3])));
  // module counts must follow the documented redundancy rule
  const modOk = r.pass.every(p => p.modules.total === p.modules.base + 1);   // red = 'n1'
  cmp.redundancy_rule_n_plus_1 = eq(modOk, true);
  const doubled = await screenWith(Object.assign({}, SITE_STATE, { mwe: 400 }));
  const byBase = Object.fromEntries(r.pass.map(p => [p.id, p.modules.base]));
  const grew = doubled.pass.every(p => byBase[p.id] === undefined || p.modules.base >= byBase[p.id]);
  cmp.doubling_the_demand_never_reduces_the_module_count = eq(grew, true);
  // a demand of zero must be refused rather than silently scoring everything perfectly
  const zero = await screenWith(Object.assign({}, SITE_STATE, { mwe: 0 }));
  cmp.zero_demand_is_refused = eq(zero.invalid, 'demand');
  cmp.zero_demand_passes_nothing = eq(zero.pass.length, 0);
  // weights: a zero weight vector must not rank
  const noW = await page.evaluate(() => {
    S.w = { fit: 0, conf: 0, fuel: 0, speed: 0, model: 0 };
    S.result = screen();
    const out = { probs: S.result.pass.map(p => p.pWin) };
    S.w = { fit: 60, conf: 70, fuel: 40, speed: 50, model: 40 };
    return out;
  });
  cmp.zero_weights_produce_no_rank_probability = eq(noW.probs.every(x => x === null), true);
  push('ranking_invariants',
    'Invariants that must hold whatever the data: every score axis and the combined score stay inside ' +
    'their range, the printed order is the score order, the Monte-Carlo rank probabilities are a real ' +
    'probability distribution, the redundancy rule is applied as documented, more demand never needs ' +
    'fewer modules, a zero demand is refused rather than silently scored, and a zero weight vector ' +
    'produces no rank probability at all',
    cmp, notes);
}

/* ================================================================ 5. catalogue filters */
{
  await page.evaluate(() => { VIEW = 'cat'; render(); });
  await page.waitForTimeout(60);
  const R = FIXTURE.reactors;
  const expected = (f) => {
    const q = (f.q || '').trim().toLowerCase();
    const num = v => (v === '' || v === undefined) ? null : +v;
    const a = num(f.mweMin), b = num(f.mweMax), c = num(f.mwthMin), d = num(f.mwthMax);
    return R.filter(r => {
      if (q && !`${r.name} ${r.vendor} ${r.type} ${r.coolant} ${r.fuel}`.toLowerCase().includes(q)) return false;
      if (a != null && r.mwe < a) return false;
      if (b != null && (r.mwe === 0 || r.mwe > b)) return false;
      if (c != null && r.mwth < c) return false;
      if (d != null && (r.mwth === 0 || r.mwth > d)) return false;
      if (f.cool && r.cool !== f.cool) return false;
      if (f.fuelc && r.fuelc !== f.fuelc) return false;
      if (f.ecl && r.ecl !== f.ecl) return false;
      if (f.vcc && r.vcc !== f.vcc) return false;
      return true;
    }).map(r => r.id);
  };
  const filters = [
    {}, { q: 'baseline' }, { q: 'salt' }, { q: 'zzznothing' }, { cool: 'water' }, { cool: 'he' },
    { cool: 'salt' }, { fuelc: 'triso' }, { fuelc: 'oxide' }, { ecl: 'HALEU' }, { ecl: 'LEU' },
    { vcc: 'RU' }, { vcc: 'CN' }, { mweMin: '100' }, { mweMax: '50' },
    { mwthMin: '200', mwthMax: '400' }, { cool: 'water', ecl: 'LEU', mweMin: '40' },
    { cool: 'salt', ecl: 'LEU', vcc: 'CN' }, { q: 'micro', cool: 'hp' },
    { cool: 'pb' }
  ];
  let bad = 0, nempty = 0;
  const notes = [];
  for (const f of filters) {
    const got = await page.evaluate((f) => {
      Object.keys(CAT).forEach(k => { if (!['sort', 'view', 'y'].includes(k)) CAT[k] = ''; });
      Object.assign(CAT, f);
      render();
      return {
        ids: [...document.querySelectorAll('table.cat tbody tr')]
          .map(tr => (tr.getAttribute('onclick') || '').match(/openSheet\('([^']+)'\)/))
          .filter(Boolean).map(m => m[1]),
        none: !document.querySelector('table.cat')
      };
    }, f);
    const want = expected(f);
    const s = setEq(got.ids, want);
    if (!s.ok) { bad++; if (notes.length < 8) notes.push(`${JSON.stringify(f)}: expected ${want.length}, got ${got.ids.length}, ${JSON.stringify([s.missing, s.unexpected])}`); }
    if (!want.length) { nempty++; if (!got.none) { bad++; notes.push(`${JSON.stringify(f)}: empty result not announced`); } }
  }
  await page.evaluate(() => { Object.keys(CAT).forEach(k => { if (!['sort', 'view', 'y'].includes(k)) CAT[k] = ''; }); VIEW = 'wizard'; render(); });
  push('catalogue_filters',
    `Every catalogue filter path (${filters.length} cases: search, coolant, fuel, enrichment class, ` +
    `vendor country, output ranges, four combinations, the unfiltered set and two empty results) ` +
    `returns exactly the set recomputed from the data`,
    { filter_cases_disagreeing: eq(bad, 0),
      empty_results_covered: { got: nempty, ref: nempty, rel: 0, ok: nempty >= 2 } }, notes);
}

/* ================================================================ 6. UI agrees with the engine */
{
  await page.evaluate((o) => {
    Object.assign(S, o);
    VIEW = 'wizard'; STEP = 2; S.result = screen(); render();
  }, SITE_STATE);
  await page.waitForTimeout(120);
  const shown = await page.evaluate(() => ({
    headline: (document.querySelector('#results .hint') || {}).innerText || '',
    gateRows: document.querySelectorAll('#results tr.gate').length,
    passCount: S.result.pass.length,
    gateCount: S.result.gates.length,
    total: DATA.reactors.length,
    orderRows: document.querySelectorAll('#dyn-order tbody tr, #dyn-order .ord').length
  }));
  const m = shown.headline.match(/(\d+)\s+of\s+(\d+)/i) || shown.headline.match(/(\d+)[^\d]+(\d+)/);
  push('results_agree_with_the_engine',
    'The number of surviving designs the results page prints, and the number of elimination rows it ' +
    'renders, agree with the engine result exactly',
    {
      headline_survivors: eq(m ? +m[1] : -1, shown.passCount),
      headline_total: eq(m ? +m[2] : -1, shown.total),
      elimination_rows: eq(shown.gateRows, shown.gateCount)
    },
    [`headline: ${shown.headline.trim().slice(0, 120)}`]);
}

/* ================================================================ 7. permalink */
{
  const has = await page.evaluate(() => !!window.Diagram);
  const cmp = { runtime_present: eq(has, true) };
  const notes = [];
  if (has) {
    const link = await page.evaluate((o) => {
      Object.assign(S, o); S.mwe = 250; S.temp = 300; S.year = 2033;
      VIEW = 'wizard'; STEP = 2; S.result = screen(); render();
      let err = null, cur = null;
      try { cur = Diagram.state.current(); } catch (e) { err = String(e); }
      return { link: Diagram.state.link(), cur: cur ? JSON.stringify(cur).slice(0, 80) : null, err };
    }, SITE_STATE);
    const linkStr = link.link; const u = new URL(linkStr);
    await page.goto(URLBASE + '?' + u.searchParams.toString(), { waitUntil: 'load' });
    // the page fetches its dataset before it boots, so wait for the runtime to have started
    await page.waitForFunction(() => window.__dgcStarted === true, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ mwe: S.mwe, temp: S.temp, year: S.year, iso: S.iso,
      pass: S.result ? S.result.pass.length : null }));
    cmp.permalink_demand = eq(back.mwe, 250);
    cmp.permalink_temperature = eq(back.temp, 300);
    cmp.permalink_year = eq(back.year, 2033);
    cmp.permalink_country = eq(back.iso, 'AA');
    notes.push('permalink (' + linkStr.length + ' chars): ' + linkStr.slice(0, 110));
  } else notes.push('diagram-common.js is not loaded by this page, so there is no permalink to round-trip');
  push('permalink_round_trip', 'A site and requirement state survives encode -> link -> fresh load',
    cmp, notes);
}

/* ================================================================ artifact */
const passed = cases.filter(c => c.pass).length;
const artifact = {
  tool: 'smrselector',
  file: 'smrselector.html',
  benchmark_kind: 'data-integrity',
  reference: 'DATA-INTEGRITY benchmark, not a physics one: the tool screens reactor designs against a ' +
    'site and a requirement by evaluating a documented set of gates and a weighted score. THE SHIPPED ' +
    'CORPUS COULD NOT BE BENCHMARKED: smr-data.json, smr-change-log.json and smr-update-status.json are ' +
    'server-maintained and are deliberately not part of this deployment tree, so the tool as deployed ' +
    'renders "No dataset" and cannot be exercised. What is benchmarked is the no-dataset path itself on ' +
    'the tree as it really is, the six-language catalogue that is in the tree, and the screening and ' +
    'catalogue logic driven through the DOM against a synthetic fixture served from a benchmark overlay ' +
    '(bench-src/ref/fixtures/smr-data.FIXTURE.json, never written into the site). Every design in that ' +
    'fixture is constructed to violate exactly one documented gate, or none, so the expected outcome ' +
    "follows from the specification rather than from the tool's own code; the ranking is checked " +
    'against invariants that must hold whatever the data.',
  reference_citations: [
    'Specification-based fixture: bench-src/ref/fixtures/smr-data.FIXTURE.json, built by this benchmark so that each design violates exactly one gate documented in the tool\'s own gate vocabulary (gate.notproc, gate.heatonly, gate.temp, gate.modules, gate.water, gate.transport, gate.timing, gate.turbine, gate.bloc_ru, gate.bloc_cn, gate.prohibited, gate.phaseout).',
    'Catalogue filter expectations recomputed directly from the fixture records in the driver, independently of the page\'s catList().',
    'Ranking invariants: a probability distribution over the surviving designs must sum to one, order must follow score, and scores must stay inside the 0-100 range the tool prints.'
  ],
  tolerance: 'Exact. Every gate must fire for exactly the designs the fixture was built to trip and for ' +
    'no others; every catalogue filter must return exactly the recomputed set; the pass and eliminated ' +
    'sets must partition the register exactly; the win probabilities must sum to 1 within 1e-9. Nothing ' +
    'here is a physical quantity, so no physical tolerance applies.',
  crosscheck: 'None available: there is no second implementation of this screening rule, and the ' +
    'shipped corpus that would allow a factual crosscheck is not in this tree.',
  not_benchmarked: [
    'THE ENTIRE SHIPPED REGISTER: the ~100 design records, their outputs, temperatures, licensing ' +
      'stages, vendors and sources, and the national policy table, all live in the server-maintained ' +
      'smr-data.json which is absent from this deployment tree. No design name, number or status was ' +
      'checked against any primary source, because there was no data here to check.',
    'the change log and update-status files (smr-change-log.json, smr-update-status.json) and the ' +
      'server-side updater described in SMR_UPDATING.md, which is not in this tree either',
    'the world outline and the coastline-distance and nearby-plant lookups beyond the fixture geometry',
    'the Monte-Carlo rank stability beyond its distributional invariants: it is stochastic by design ' +
      'and has no closed-form expectation to compare against'
  ],
  fixture_note: 'The fixture is served from an overlay directory of symbolic links outside the site ' +
    'root; nothing was written into the site tree.',
  total: cases.length,
  passed,
  failed: cases.length - passed,
  flagged,
  page_errors: pageErrors,
  run_at: new Date().toISOString(),
  cases
};
/* One write, to the file the site serves. The two previous writes put the same bytes in the
   old results directory and in the site's own benchmarks/ directory; the resolver's default
   out is that second path, so the copy has no second destination left. */
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(artifact, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`\n${passed}/${cases.length} passed, ${flagged.length} flagged, ${pageErrors.length} page errors`);
await browser.close();
srv.close();
process.exit(passed === cases.length ? 0 : 1);
