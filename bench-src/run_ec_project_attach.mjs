// Benchmark driver — the project document across categories, with engineering-change
// tools as the attaching side.
//
// What it measures. TZ-engineering-workflow §3 states that the runtime grants
// `calculations.<manifest id>` to every caller implicitly, "so no calculation tool has to
// declare anything", and §6.3 that the shared toolbar lazy-loads `diagram-project.js` at
// the attach step. Eleven of the fourteen engineering-change pages carry no
// `project_package` declaration and no `diagram-project.js` script tag, so whether they
// can take part in the project document at all rests entirely on those two sentences.
// Nothing in `bench-src` drove that path: the project-package round-trip cases live
// in-page, per tool, among tools that declare a package and load the runtime at boot.
//
// This driver drives the undeclared side end to end, as a user would:
//   1. three project-delivery tools write the envelope and the structure —
//      `projectdefinition` the project, `commissioningturnover` structure.systems,
//      `interfacebuilder` structure.packages — each through DiagramProject.save(), with
//      the written and rejected path lists asserted against what the page declares;
//   2. each engineering-change page is loaded cold; the absence of the script tag and of
//      window.DiagramProject before the attach is asserted, not assumed;
//   3. a result is produced the way a user produces one — the tool's own first worked
//      example, then its own primary action; a page whose action bar is staged is driven
//      instead through its own permalink, which re-runs its solver on load;
//   4. the attach dialog is asserted to offer the systems and packages written in (1) —
//      that is the implicit read of `structure` doing its work — and the attachment is
//      filed under one of each;
//   5. the stored document is read back: the entry must sit under `calculations.<the
//      page's own manifest id>` and nowhere else, carry the system, package, tag, title
//      and a record with inputs and outputs, and name the revision this run observed in
//      that page's live DOM;
//   6. after every attach, the entries written by earlier tools are re-hashed, so a tool
//      that wrote outside its own key would be caught by the comparison and not by trust.
//
// What this is not. It is not an AGENTS §5 artifact: it spans twelve pages, no manifest
// cites it, and it stamps no `build`, because the stamp ties one observation to the one
// page its artifact names. Each page's revision is observed with the shared reader and
// recorded per case, so the report says which builds it graded without claiming to be
// one page's evidence. Nothing in this file is read by `catalog.php`.
//
//   usage: node run_ec_project_attach.mjs [--base <origin>] [--out <report>.json]
//                                         [--tools a.html,b.html]
//   e.g.   node run_ec_project_attach.mjs --base https://tools.petrov.re \
//                                         --out work/ec-project-attach.json
// With no --out the report goes to stdout only. The exit status is 1 if any case failed.

import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { parseFlags } from './benchpaths.mjs';
import { readPageManifestRevision } from './provenance.mjs';

const F = parseFlags(process.argv.slice(2));
const BASE = String(F.base || process.env.BENCH_BASE || 'https://tools.petrov.re').replace(/\/+$/, '');
const OUT = F.out || process.env.BENCH_OUT || '';

/* The fourteen engineering-change pages. The three that declare a package and load the
   runtime at boot are driven too: they are the control, and they must behave the same. */
const EC_PAGES = [
  'cyclingfatiguelife.html', 'degradationlifeprojector.html', 'equivalence.html',
  'maintenance_test_interval_change.html', 'obsolescenceltb.html', 'operatingenvelope.html',
  'postmodificationverification.html', 'repairreplace.html',
  'temporaryconfigurationbypassrisk.html', 'tieinoutageplanner.html', 'wallthinning.html',
  'changeimpact.html', 'controlsoftwarechange.html', 'designbasisintegritylto.html'
];
const TOOLS = F.tools ? String(F.tools).split(',').map(s => s.trim()).filter(Boolean) : EC_PAGES;

const SYS = [{ id: 'SYS-SG', name: 'Steam generator feedwater' },
             { id: 'SYS-CW', name: 'Component cooling water' }];
const PKG = [{ id: 'WP-14', name: 'Feedwater line replacement', system_id: 'SYS-SG' }];
const PROJECT = 'EC attach conformance';

const cases = [];
const pageErrors = [];
let hashes = {};                 /* calculations.<id> -> digest, carried between tools */

function ok(id, note, cmp) {
  const pass = Object.keys(cmp).every(k => cmp[k].ok);
  cases.push({ id, note, cmp, ok: pass });
  return pass;
}
const eq = (got, ref) => ({ got, ref, ok: JSON.stringify(got) === JSON.stringify(ref) });
const is = (got, pred, ref) => ({ got, ref, ok: !!pred });

async function digest(page) {
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('diagram_project_package') || 'null') || {};
    const c = d.calculations || {};
    const out = {};
    Object.keys(c).forEach(k => { out[k] = JSON.stringify(c[k]); });
    return out;
  });
}

const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await br.newContext({ viewport: { width: 1440, height: 1000 },
                                  permissions: ['clipboard-read', 'clipboard-write'] });
ctx.on('page', p => p.on('pageerror', e => pageErrors.push(p.url().split('/').pop() + ': ' + String(e.message).slice(0, 180))));

/* ---------- 1. the writing side: project and structure ---------- */
async function seed(file, patch, expectWritten) {
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + file, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async patch => {
    const DP = window.DiagramProject;
    if (!DP) return { runtime: false };
    const d = DP.declaration();
    const res = await Promise.resolve(DP.save(patch));
    return { runtime: true, declared: d.declared, declares_writes: d.writes,
             ok: res === true || !!(res && res.ok),
             written: (res && res.written) || [], rejected: (res && res.rejected) || [],
             problems: (res && res.problems) || [], revision: res && res.package_revision };
  }, patch);
  ok('seed_' + file.replace(/\.html$/, ''),
     'a declaring tool writes the sections its manifest declares, and only those',
     { runtime_at_boot: eq(r.runtime, true),
       declares_package: eq(r.declared, true),
       write_accepted: eq(r.ok, true),
       written_paths: eq(r.written, expectWritten),
       nothing_rejected: eq(r.rejected, []),
       declared_covers_written: is(r.declares_writes,
         Array.isArray(r.declares_writes) && expectWritten.every(w => r.declares_writes.includes(w)),
         'manifest writes include ' + expectWritten.join(', ')) });
  await p.close();
  return r;
}
await seed('projectdefinition.html', { project: { name: PROJECT, type: 'modification' } }, ['project']);
await seed('commissioningturnover.html', { structure: { systems: SYS } }, ['structure.systems']);
await seed('interfacebuilder.html', { structure: { packages: PKG } }, ['structure.packages']);

/* ---------- 2. the attaching side ---------- */
const ATTACH = '#dgc-bar button[data-dgc-act="attach"]';
const CALC_RE = /Calculate|Bereken|Berechnen|Calcul|Calcular|Розрахувати|Oblicz/i;

/* The tool's own first worked example, then its own primary action — the user's path to a
   result. Returns true when the toolbar is offering the attach. */
async function produceResult(p) {
  const ex = await p.$$('[data-dgu-panel="dgu-examples"] button');
  if (!ex.length) return { route: 'none', offered: false, example: '' };
  const label = (await ex[0].textContent() || '').trim().replace(/\s+/g, ' ').slice(0, 48);
  await ex[0].click();
  await p.waitForTimeout(1500);
  for (const b of await p.$$('button.dgu-btn.primary')) {
    try { if (await b.isVisible() && CALC_RE.test((await b.textContent()) || '')) { await b.click(); break; } } catch (e) {}
  }
  await p.waitForTimeout(2500);
  if (await offered(p)) return { route: 'example+action', offered: true, example: label };
  /* A staged page keeps its action bar display:none until the flow reaches the end. Its
     own permalink carries the state and re-runs the solver on load, so the state the
     example set is recovered through the page's own mechanism rather than by typing. */
  let link = '';
  try {
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')]
      .find(x => /Copy link|Link kopie|Lien|Enlace|Skopiuj|Копі/i.test(x.textContent) && x.offsetParent !== null);
      if (b) b.click(); });
    await p.waitForTimeout(1200);
    link = String(await p.evaluate(() => navigator.clipboard.readText()) || '');
  } catch (e) { link = ''; }
  if (!/\?/.test(link)) return { route: 'example+action', offered: false, example: label };
  await p.goto(link, { waitUntil: 'load' });
  await p.waitForTimeout(5000);
  return { route: 'example+permalink', offered: await offered(p), example: label };
}
async function offered(p) {
  const h = await p.evaluate(sel => { const b = document.querySelector(sel); return b ? b.hidden : null; }, ATTACH);
  return h === false;
}

for (const file of TOOLS) {
  const id = file.replace(/\.html$/, '').replace(/_/g, '-');
  const p = await ctx.newPage();
  let revision = '';
  try {
    await p.goto(BASE + '/' + file, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    revision = String(await readPageManifestRevision(p));

    const cold = await p.evaluate(() => ({
      script_tag: [...document.querySelectorAll('script[src]')].some(s => /diagram-project\.js/.test(s.src)),
      runtime: !!window.DiagramProject,
      chip: !!document.querySelector('#dgc-bar .dgc-proj'),
      button: !!document.querySelector('#dgc-bar button[data-dgc-act="attach"]')
    }));
    ok(id + '_cold', 'a project in storage is announced and offered without applying anything',
       { chip_shown: eq(cold.chip, true),
         attach_button_exists: eq(cold.button, true),
         runtime_absent_before_attach: eq(cold.runtime, cold.script_tag) });

    const res = await produceResult(p);
    ok(id + '_record', 'the attach is offered once the tool has a result, and not before',
       { route: is(res.route, res.route !== 'none', 'the tool offers a worked example'),
         attach_offered: eq(res.offered, true) });
    if (!res.offered) { await p.close(); continue; }

    const dialog = await p.evaluate(sel => { document.querySelector(sel).click(); }, ATTACH);
    await p.waitForSelector('#dgc-pj form', { timeout: 15000 });
    const offeredStructure = await p.evaluate(() => ({
      systems: [...(document.querySelector('#dgc-pj-s') || { options: [] }).options].map(o => o.value).filter(Boolean),
      packages: [...(document.querySelector('#dgc-pj-p') || { options: [] }).options].map(o => o.value).filter(Boolean)
    }));
    ok(id + '_reads_structure',
       'the implicit grant lets an undeclared tool read the structure another tool wrote',
       { systems_offered: eq(offeredStructure.systems, SYS.map(s => s.id)),
         packages_offered: eq(offeredStructure.packages, PKG.map(s => s.id)) });

    await p.evaluate(t => {
      const q = s => document.querySelector(s);
      q('#dgc-pj-s').value = 'SYS-SG'; q('#dgc-pj-s').dispatchEvent(new Event('change'));
      q('#dgc-pj-p').value = 'WP-14';
      q('#dgc-pj-t').value = 'PROBE-01';
      q('#dgc-pj-n').value = 'conformance attach from ' + t;
      q('#dgc-pj .dgc-pj-go').click();
    }, id);
    await p.waitForTimeout(4500);

    const land = await p.evaluate(tool => {
      const d = JSON.parse(localStorage.getItem('diagram_project_package') || 'null');
      if (!d) return { doc: false };
      const c = d.calculations || {};
      const e = c[tool] || [];
      const f = e[e.length - 1] || null;
      const note = document.querySelector('#dgc-notes .dgc-note');
      return { doc: true, revision: d.package_revision, calc_keys: Object.keys(c),
               runtime_after: !!window.DiagramProject,
               note_class: note ? note.className : '', entries: e.length,
               entry: f ? { system_id: f.system_id, package_id: f.package_id, tag: f.tag,
                            title: f.title, tool_revision: f.tool_revision,
                            has_record: !!f.record,
                            inputs: f.record ? Object.keys(f.record.inputs || {}).length : 0,
                            outputs: f.record ? Object.keys(f.record.outputs || {}).length : 0,
                            permalink_origin: String(f.permalink || '').split('/').slice(0, 3).join('/') } : null,
               writers: (d.provenance || []).map(x => x.tool).filter(Boolean) };
    }, id);

    const e = land.entry || {};
    ok(id + '_attached', 'the attachment lands under the page\'s own calculations key, filed and dated',
       { document_present: eq(land.doc, true),
         runtime_loaded_at_attach: eq(land.runtime_after, true),
         notification_ok: is(land.note_class, /\bok\b/.test(land.note_class || ''), 'an ok notice'),
         entry_count: eq(land.entries, 1),
         filed_under_system: eq(e.system_id, 'SYS-SG'),
         filed_under_package: eq(e.package_id, 'WP-14'),
         tag_kept: eq(e.tag, 'PROBE-01'),
         title_kept: eq(e.title, 'conformance attach from ' + id),
         revision_is_the_observed_build: eq(e.tool_revision, revision),
         record_carried: eq(e.has_record, true),
         inputs_present: is(e.inputs, e.inputs > 0, '> 0'),
         outputs_present: is(e.outputs, e.outputs > 0, '> 0'),
         permalink_is_this_origin: eq(e.permalink_origin, BASE) });

    /* isolation: this tool must have touched its own key only */
    const now = await digest(p);
    const changed = Object.keys({ ...hashes, ...now })
      .filter(k => hashes[k] !== now[k]);
    ok(id + '_isolation', 'the write reaches calculations.<own id> and no other tool\'s records',
       { keys_changed: eq(changed, [id]),
         keys_in_document: is(land.calc_keys, land.calc_keys.includes(id), 'includes ' + id) });
    hashes = now;
  } catch (x) {
    cases.push({ id: id + '_threw', note: 'driver threw while driving this page',
                 cmp: { error: { got: String(x && x.message || x).slice(0, 300), ref: 'no throw', ok: false } },
                 ok: false });
  }
  await p.close();
}

/* ---------- 3. the document as a whole ---------- */
{
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + TOOLS[0], { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const doc = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('diagram_project_package') || 'null') || {};
    return { schema: d.schema, revision: d.package_revision,
             sections: Object.keys(d), writers: (d.provenance || []).map(x => x.tool).filter(Boolean),
             calc_keys: Object.keys(d.calculations || {}),
             systems: ((d.structure || {}).systems || []).map(s => s.id),
             packages: ((d.structure || {}).packages || []).map(s => s.id),
             project: (d.project || {}).name };
  });
  const attachedIds = cases.filter(c => /_attached$/.test(c.id) && c.ok).map(c => c.id.replace(/_attached$/, ''));
  ok('document', 'one document carries the three writing tools and every attachment',
     { schema: eq(doc.schema, 'tools.petrov.re/project-package/v1'),
       /* one revision per accepted write: the three seeds plus one per attachment */
       revision_counts_every_write: eq(doc.revision, 3 + attachedIds.length),
       project_name_survived: eq(doc.project, PROJECT),
       systems_survived: eq(doc.systems, SYS.map(s => s.id)),
       packages_survived: eq(doc.packages, PKG.map(s => s.id)),
       every_attacher_has_a_key: eq(attachedIds.filter(i => !doc.calc_keys.includes(i)), []),
       writers_include_the_three_seeders: eq(
         ['projectdefinition', 'commissioningturnover', 'interfacebuilder'].filter(t => !doc.writers.includes(t)), []),
       no_unexpected_calculation_keys: eq(doc.calc_keys.filter(k => !attachedIds.includes(k)), []) });
  await p.close();
}
await br.close();

const passed = cases.filter(c => c.ok).length;
const report = {
  tool: 'project-package attach chain (engineering-change side)',
  file: 'multiple: ' + TOOLS.length + ' engineering-change pages + projectdefinition, commissioningturnover, interfacebuilder',
  base: BASE,
  reference: 'TZ-engineering-workflow §3 (implicit calculations grant), §6.2–6.3 (project chip, attach), '
    + 'TZ-project-package §6 (declared reads and writes, atomic refusal) and §3.5 (storage may fail). '
    + 'The expectations are those documents, read as a contract; no numeric reference corpus is involved.',
  not_an_artifact: 'Spans twelve pages and is cited by no manifest, so it carries no build stamp and is '
    + 'not AGENTS §5 evidence for any one tool. Each case records the revision this run observed in the '
    + 'page it drove, read with provenance.mjs readPageManifestRevision().',
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: pageErrors,
  run_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  cases
};
const text = JSON.stringify(report, null, 1);
if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, text + '\n'); }
console.log(text);
process.exit(report.failed ? 1 : 0);
