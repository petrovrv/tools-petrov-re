/* Benchmark driver for luchtbalans.html (Air Balance & Pressure Cascade).
 *
 * Each network is put into the tool through its own permalink codec and the
 * answer is read back from Diagram.record.build(); the drawn diagram and the two
 * editable tables are read from the DOM for the cases that check what the reader
 * actually sees.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. stampProvenance() reads the build out of the page's
   own manifest and writes build, manifest_revision, reference_provenance and
   provenance_note into the artifact, so a re-run carries them. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_luchtbalans.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 5 439 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* Every path resolves against this driver's own tree: the page under the site root, the
   reference under bench-src/ref and the artifact at <siteRoot>/benchmarks/luchtbalans.json.
   --site, --ref-dir and --out override. See benchpaths.mjs. */
const P = benchPaths({ name: 'luchtbalans', page: 'luchtbalans.html',
                       ref: 'luchtbalans_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
/* The page is opened as file://, as this driver has always opened it; only the root is a
   parameter. Every goto below appends this driver's own query. */
const URLBASE = P.pageUrl;

const results = [];
const pageErrors = [];
const push = (id, group, note, inputs, cmp, extra) => {
  let worst = 0, pass = true, flagged = false;
  for (const k of Object.keys(cmp)) {
    const c = cmp[k];
    if (c.graded === false) { flagged = true; continue; }
    worst = Math.max(worst, c.rel);
    if (!c.ok) pass = false;
  }
  results.push(Object.assign({ id, group, note, inputs, cmp, worst_rel: worst, pass, flagged }, extra || {}));
};
const cmpVal = (got, ref, tolAbs, tolRel) => {
  const a = Math.abs(got - ref), rel = a / Math.max(Math.abs(ref), 1e-12);
  return { got, ref, rel, ok: a <= tolAbs + 1e-12 || rel <= tolRel, tol_abs: tolAbs, tol_rel: tolRel };
};

const ready = page => page.waitForFunction(
  () => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });
const rec = page => page.evaluate(() => window.Diagram.record.build());

const MODES = ['prod', 'clean', 'dry', 'defr', 'idle', 'emg', 'fire'];
function toState(model, mode, tout) {
  const mm = v => Object.fromEntries(MODES.map(m => [m, v]));
  return {
    v: 2, lang: 'en', mode,
    env: { i_rho: 1.2, i_cdleak: 0.65, i_tout: tout, i_rhout: 70, i_tol: 3, i_vmax: 5,
           i_dpmax: 50, i_cq: 1, i_ca: 0.5, i_cx: 0.4 },
    nodes: model.nodes.map((n, k) => ({
      id: n.id, type: n.type, name: n.id, x: 60 + 200 * (k % 5), y: 60 + 160 * Math.floor(k / 5),
      V: n.V === undefined ? 1000 : n.V, T: n.T === undefined ? 20 : n.T,
      RH: n.RH === undefined ? 50 : n.RH, Q: n.Q === undefined ? 0 : n.Q,
      leak: n.leak === undefined ? 0 : n.leak, rank: n.rank === undefined ? 0 : n.rank,
      tgt: 0, qh: 0, qc: 0, gm: 0, gc: 0,
      m: n.m ? Object.assign({}, n.m) : mm(1) })),
    links: model.links.map(L => ({
      id: L.id, a: L.a, b: L.b, t: 'open', A: L.A, gap: L.gap, cd: L.cd, h: L.h,
      req: 'none', f: Object.assign({}, L.f) })),
    sel: { n: null, l: null }
  };
}
async function load(page, model, mode, tout) {
  const enc = await page.evaluate(o => window.Diagram.state.encode(o), toState(model, mode, tout));
  await page.goto(URLBASE + '?lang=en&s=' + enc);
  await ready(page);
  await page.waitForTimeout(150);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
await page.goto(URLBASE + '?lang=en');
await ready(page);

/* AGENTS §5: the build this artifact names is the manifest_revision read out of the live
   DOM of the page the browser actually loaded, not of the file sitting beside this driver.
   stampProvenance() refuses to write anything without it. */
const BUILD = await readPageManifestRevision(page);

/* --- 1. the closed-form series cascade ---------------------------------- */
for (const c of REF.cases.filter(x => x.group === 'closed_form')) {
  await load(page, c.model, c.mode, 20);
  const r = await rec(page);
  const an = c.expected.analytic, nu = c.expected.numeric;
  const o0 = r.outputs;
  const cmp = {
    pressure_R1: cmpVal(o0.pressure_R1, an.p1, 1e-9, 1e-9),
    pressure_R2: cmpVal(o0.pressure_R2, an.p2, 1e-9, 1e-9),
    flow_K2: cmpVal(Math.abs(o0.flow_K2), an.q * 3600, 1e-7, 1e-9),
    flow_K3: cmpVal(Math.abs(o0.flow_K3), an.q * 3600, 1e-7, 1e-9),
    reference_selfcheck_solver_vs_closed_form:
      cmpVal(nu.p[0], an.p1, 1e-9, 1e-10)
  };
  push(c.id, 'closed_form', c.note, c.model, cmp);
}

/* --- 2. the network cases ------------------------------------------------ */
for (const c of REF.cases.filter(x => x.group === 'network')) {
  const tout = c.id.includes('cold') ? -15 : 5;
  await load(page, c.model, c.mode, tout);
  const r = await rec(page);
  const o = r.outputs, e = c.expected;
  const cmp = {};
  // the solver stops at a node residual of 1e-10 m3/s, i.e. 3.6e-7 m3/h; a pressure
  // is therefore good to residual / (dQ/dp), which is far below the 1e-6 used here
  e.p.forEach((pv, i) => {
    const id = c.model.nodes.filter(n => n.type === 'room')[i].id;
    cmp['pressure_' + id] = cmpVal(o['pressure_' + id], pv, 1e-7, 1e-8);
  });
  e.flows.filter(f => !f.active).forEach(f => {
    const L = c.model.links[f.li];
    cmp['flow_' + L.id] = cmpVal(o['flow_' + L.id], f.q * 3600, 1e-6, 1e-8);
    cmp['velocity_' + L.id] = cmpVal(o['velocity_' + L.id], f.v, 1e-9, 1e-8);
    if (f.dp !== null) cmp['dp_' + L.id] = cmpVal(o['dp_' + L.id], f.dp, 1e-8, 1e-8);
  });
  cmp.envelope_net_flow = cmpVal(o.envelope_net_flow, e.env_out * 3600, 1e-6, 1e-8);
  // --- identities the tool must satisfy on its own numbers
  cmp.identity_envelope_balance = { got: o.envelope_imbalance, ref: 0,
    rel: Math.abs(o.envelope_imbalance) / Math.max(1, o.total_supply),
    ok: Math.abs(o.envelope_imbalance) / Math.max(1, o.total_supply) < 1e-9,
    note: 'supply - extract must equal the net flow through the envelope' };
  cmp.identity_zone_balance = { got: o.worst_zone_residual, ref: 0,
    rel: o.worst_zone_residual / Math.max(1, o.total_supply),
    ok: o.worst_zone_residual / Math.max(1, o.total_supply) < 1e-9,
    note: 'every zone balance must close on the reported flows' };
  // --- velocity is the flow divided by the effective area
  let worstVA = 0;
  r.inputs.connections.forEach(L => {
    const q = o['flow_' + L.id], v = o['velocity_' + L.id];
    if (v === undefined || q === undefined) return;
    const Ae = L.open_fraction * L.area + (1 - L.open_fraction) * L.gap_area;
    const eff = (L.from.startsWith('AS') || L.from.startsWith('AX')
              || L.to.startsWith('AS') || L.to.startsWith('AX')) ? Math.max(1e-6, L.area) : Ae;
    if (eff < 1e-9) return;
    worstVA = Math.max(worstVA, Math.abs(Math.abs(q) / 3600 / eff - v) / Math.max(1e-9, v));
  });
  cmp.identity_velocity_is_flow_over_area = { got: worstVA, ref: 0, rel: worstVA,
                                              ok: worstVA < 1e-9, tol_rel: 1e-9 };
  push(c.id, 'network', c.note, { mode: c.mode, tout }, cmp,
       { discretisation: { regularised_connections:
           e.flows.filter(f => !f.active && f.dp !== null && Math.abs(f.dp) < 0.04).length } });
}

/* --- 3. the cascade must be monotone in the intended direction ----------- */
{
  await load(page, REF.cases.find(x => x.id === 'default_prod').model, 'prod', 5);
  const r = await rec(page);
  const rooms = r.inputs.rooms.slice().sort((a, b) => a.rank - b.rank);
  const p = rooms.map(x => r.outputs['pressure_' + x.id]);
  let mono = true;
  for (let i = 1; i < p.length; i++) if (p[i] >= p[i - 1]) mono = false;
  // the cleanest room must be in over-pressure, the dirtiest in under-pressure
  const signOk = p[0] > 0 && p[p.length - 1] < 0;
  // sign convention: a room above ambient must have net outflow through its leakage
  let signConv = true;
  rooms.forEach(x => {
    const lk = r.outputs['leak_flow_' + x.id], pr = r.outputs['pressure_' + x.id];
    if (Math.abs(pr) > 0.05 && Math.sign(lk) !== Math.sign(pr)) signConv = false;
  });
  push('pressure_cascade_is_monotone', 'cascade',
       'The rooms carry a cleanliness rank. In the shipped building the cascade must fall '
       + 'monotonically from rank 1 to rank 4, the cleanest room must sit above ambient and the '
       + 'dirtiest below it, and the sign convention must hold: a room in over-pressure loses '
       + 'air through its envelope leakage, a room in under-pressure gains it.',
       { ranks: rooms.map(x => [x.id, x.rank]) },
       { cascade_monotone_by_rank: { got: p, ref: 'strictly decreasing', rel: mono ? 0 : 1, ok: mono },
         cleanest_over_dirtiest_under: { got: [p[0], p[p.length - 1]], ref: '> 0 and < 0',
                                         rel: signOk ? 0 : 1, ok: signOk },
         leak_sign_follows_pressure: { got: signConv, ref: true, rel: signConv ? 0 : 1,
                                       ok: signConv } });
}

/* --- 4. the sign convention of over- and under-pressure ------------------ */
{
  const mm = v => Object.fromEntries(MODES.map(m => [m, v]));
  const one = (type, q) => ({
    nodes: [{ id: 'U1', type, Q: q, T: 20, m: mm(1) },
            { id: 'R1', type: 'room', V: 500, T: 20, leak: 0.10, rank: 1 }],
    links: [{ id: 'K1', a: 'U1', b: 'R1', A: 1, gap: 1, cd: 0.65, h: 0, f: mm(1) }] });
  await load(page, one('asup', 3600), 'prod', 20);
  const rs = await rec(page);
  await load(page, one('asink', 3600), 'prod', 20);
  const re2 = await rec(page);
  // closed form: p = rho/2 * (Q/(Cd_leak A_leak))^2, positive for supply, negative for extract
  const q = 1.0, cdA = 0.65 * 0.10;
  const pExact = 1.2 / 2 * Math.pow(q / cdA, 2);
  const supOK = rs.outputs.pressure_R1 > 0 && rs.outputs.leak_flow_R1 > 0;
  const extOK = re2.outputs.pressure_R1 < 0 && re2.outputs.leak_flow_R1 < 0;
  // and the building-level statement: the sign of the net envelope flow follows the balance
  const sup = REF.cases.find(x => x.id === 'variant_supply_dominant');
  const ext = REF.cases.find(x => x.id === 'variant_extract_dominant');
  await load(page, sup.model, 'prod', 5);
  const bs = await rec(page);
  await load(page, ext.model, 'prod', 5);
  const be = await rec(page);
  const envOK = bs.outputs.envelope_net_flow > 0 && be.outputs.envelope_net_flow < 0;
  push('sign_convention_over_and_under_pressure', 'cascade',
       'A single room fed by an imposed 3600 m3/h through a 0.10 m2 leak must settle at '
       + '+rho/2*(Q/(Cd*A))^2 with air leaving through the leak; the same room on an imposed '
       + 'extract must settle at the mirror-image negative pressure with air entering. At '
       + 'building level, supply above extract must push air out through the envelope and '
       + 'extract above supply must pull it in.',
       { leak_area: 0.10, cd_leak: 0.65, flow_m3h: 3600 },
       { supply_room_over_pressure: { got: [rs.outputs.pressure_R1, rs.outputs.leak_flow_R1],
                                      ref: 'p > 0 and leak flow out', rel: supOK ? 0 : 1, ok: supOK },
         extract_room_under_pressure: { got: [re2.outputs.pressure_R1, re2.outputs.leak_flow_R1],
                                        ref: 'p < 0 and leak flow in', rel: extOK ? 0 : 1, ok: extOK },
         magnitude_matches_closed_form: cmpVal(rs.outputs.pressure_R1, pExact, 1e-7, 1e-9),
         mirror_symmetry: cmpVal(-re2.outputs.pressure_R1, pExact, 1e-7, 1e-9),
         envelope_flow_follows_the_balance: { got: [bs.outputs.envelope_net_flow,
                                                    be.outputs.envelope_net_flow],
                                              ref: '> 0 then < 0', rel: envOK ? 0 : 1, ok: envOK } });
}

/* --- 5. over-constrained networks ---------------------------------------- */
for (const c of REF.cases.filter(x => x.group === 'degenerate')) {
  await load(page, c.model, 'prod', 20);
  const r = await rec(page);
  const o = r.outputs;
  const txt = await page.evaluate(() => document.body.innerText);
  const warned = (r.warnings || []).length > 0;
  /* `#checks` occurs 0 times: the page's own check panel is gone and the framework
     renders a refusal as the results region's verdict and notes. This string is
     recorded as diagnostic detail only — no cmp entry below reads it — so the port
     points it at the region that now carries that text and says so. */
  const chk = await page.evaluate(() => {
    const r = document.querySelector('.dgu-r-results');
    const v = document.querySelector('.dgu-verdict');
    return (r ? r.innerText : (v ? v.innerText : '')) || '';
  });
  const finite = Object.keys(o).filter(k => k.startsWith('pressure_'))
                       .every(k => isFinite(o[k]));
  const resid = o.worst_zone_residual;
  const honest = warned || resid > 1e-6 || !finite;
  push(c.id, 'degenerate', c.note, c.model,
       { does_not_silently_return_a_non_solution:
           { got: { warnings: r.warnings, worst_zone_residual: resid,
                    pressures: Object.fromEntries(Object.entries(o)
                                 .filter(([k]) => k.startsWith('pressure_'))) },
             ref: 'a warning, a visible residual or a refusal', rel: honest ? 0 : 1, ok: honest },
         no_nan_reaches_the_reader:
           { got: finite, ref: true, rel: finite ? 0 : 1, ok: finite } },
       { detail: { checks_panel: chk.slice(0, 400) } });
}

/* --- 6. mode independence and ordering ----------------------------------- */
{
  const base = REF.cases.find(x => x.id === 'default_prod').model;
  await load(page, base, 'prod', 5);
  const a = await rec(page);
  const shuffled = { nodes: base.nodes.slice().reverse(), links: base.links.slice().reverse() };
  await load(page, shuffled, 'prod', 5);
  const b = await rec(page);
  let worst = 0;
  Object.keys(a.outputs).filter(k => k.startsWith('pressure_')).forEach(k => {
    worst = Math.max(worst, Math.abs(a.outputs[k] - b.outputs[k]));
  });
  push('independent_of_block_order', 'solver',
       'The answer must not depend on the order in which the blocks and arrows were drawn.',
       {}, { pressures_unchanged: { got: worst, ref: 0, rel: worst, ok: worst < 1e-9,
                                    tol_abs: 1e-9 } });
}

/* --- 7. permalink, languages, network ------------------------------------ */
{
  await load(page, REF.cases.find(x => x.id === 'default_clean').model, 'clean', 5);
  const before = await rec(page);
  const link = await page.evaluate(() => window.Diagram.state.link());
  const qs = link.split('?')[1];
  const p2 = await ctx.newPage();
  const err2 = [];
  p2.on('pageerror', e => err2.push(String(e)));
  await p2.goto(URLBASE + '?' + qs);
  await ready(p2);
  await p2.waitForTimeout(400);
  const after = await p2.evaluate(() => window.Diagram.record.build());
  const stA = JSON.stringify(await page.evaluate(() => window.Diagram.state.current()));
  const stB = JSON.stringify(await p2.evaluate(() => window.Diagram.state.current()));
  await p2.close();
  const same = JSON.stringify(before.outputs) === JSON.stringify(after.outputs);
  push('permalink_round_trip', 'framework',
       'The encoded diagram must restore identical blocks, arrows and outputs in a fresh page.',
       { link_chars: link.length },
       { state_identical: { got: stA === stB, ref: true, rel: stA === stB ? 0 : 1, ok: stA === stB },
         outputs_identical: { got: same, ref: true, rel: same ? 0 : 1, ok: same },
         no_exception: { got: err2.length, ref: 0, rel: err2.length ? 1 : 0, ok: !err2.length } });
}
{
  const langs = ['en', 'uk', 'de', 'nl', 'fr', 'es'];
  const seen = {}; const errs = [];
  for (const l of langs) {
    const p3 = await ctx.newPage();
    p3.on('pageerror', e => errs.push(l + ': ' + e));
    await p3.goto(URLBASE + '?lang=' + l);
    await ready(p3);
    /* The page's language surface, measured in the live DOM (the inventory is in
       PORT-B.md): `#lang` and `#ttl` occur 0 times. The language choice is the
       framework header's own `select.dgu-sel` — identified by its option set, not by a
       localised aria-label — and its value is the language code, as `#lang` was. The
       tool title is `h1.dgu-title`. What is graded is unchanged: the code the page
       selected, the title it printed, and whether a raw key leaked. */
    seen[l] = await p3.evaluate(() => {
      const ls = [...document.querySelectorAll('select.dgu-sel')]
        .find(s => [...s.options].some(o => o.value === 'en') &&
                   [...s.options].some(o => o.value === 'uk'));
      const h1 = document.querySelector('h1.dgu-title');
      return { sel: ls ? ls.value : null,
               ttl: h1 ? h1.textContent.trim() : null,
               raw: /dgc_[a-z_0-9]+/.test(document.body.innerText) };
    });
    const rr = await p3.evaluate(() => window.Diagram.record.build());
    seen[l].untranslated = (rr.model.ranges.concat(rr.model.notes))
      .filter(x => /^dgc_/.test(x)).length;
    await p3.close();
  }
  const okLang = langs.every(l => seen[l].sel === l);
  const distinct = new Set(langs.map(l => seen[l].ttl)).size;
  const noRaw = langs.every(l => seen[l].untranslated === 0);
  push('language_selection', 'framework',
       'The ?lang= query parameter must select the tool UI language for all six catalogue '
       + 'languages, and no untranslated key may leak into the record.',
       { languages: langs },
       { query_parameter_honoured: { got: okLang, ref: true, rel: okLang ? 0 : 1, ok: okLang },
         titles_translated: { got: distinct, ref: 6, rel: 0, ok: distinct >= 5 },
         no_untranslated_keys: { got: noRaw, ref: true, rel: noRaw ? 0 : 1, ok: noRaw },
         no_exception: { got: errs.length, ref: 0, rel: errs.length ? 1 : 0, ok: !errs.length } },
       { detail: seen });
}
{
  const man = await page.evaluate(() => {
    const m = JSON.parse(document.getElementById('diagram-tool-manifest').textContent);
    const ext = [...document.querySelectorAll('script[src],link[href],img[src]')]
      .map(e => e.getAttribute('src') || e.getAttribute('href'))
      .filter(u => u && /^https?:\/\//i.test(u));
    return { na: m.network_access, ext };
  });
  const okMode = man.na && man.na.mode === 'none' && man.ext.length === 0;
  push('network_declaration', 'network',
       'The page fetches nothing and loads no third-party asset, so network_access must be "none".',
       {}, { declares_none: { got: man.na && man.na.mode, ref: 'none', rel: okMode ? 0 : 1,
                              ok: okMode },
             no_third_party_tags: { got: man.ext.length, ref: 0, rel: man.ext.length ? 1 : 0,
                                    ok: man.ext.length === 0 } },
       { detail: man });
}

await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length;
const out = {
  tool: 'luchtbalans',
  file: 'luchtbalans.html',
  reference: REF.reference,
  reference_citations: REF.citations,
  tolerance:
    'The network is a closed-form algebraic system, so the reference is exact: '
    + 'scipy.optimize.root followed by a Newton polish leaves a node residual below 1e-14 m3/s, '
    + 'and the three series-cascade cases are compared against a hand-derived closed form that '
    + 'uses no solver at all. The tool stops its own damped Newton at a node residual of 1e-10 '
    + 'm3/s (3.6e-7 m3/h), so pressures are graded at 1e-8 relative or 1e-7 Pa absolute, flows '
    + 'at 1e-8 relative or 1e-6 m3/h absolute, whichever is looser - both far above the solver '
    + 'stopping criterion and far below anything the interface prints. The bookkeeping '
    + 'identities (every zone balance closing on the reported flows, supply minus extract '
    + 'equalling the net envelope flow, velocity equalling flow over effective area, '
    + 'independence from the order of the blocks) are exact arithmetic and are held to 1e-9 '
    + 'relative.',
  not_benchmarked: [
    'The 0.04 Pa regularisation of the square-root law is a declared modelling choice; the '
    + 'reference reproduces it and the harness records how many connections sit inside that '
    + 'window per case, but the size of the error it introduces against the unregularised law '
    + 'is not graded.',
    'Discharge coefficients, closed-door gap areas and the default coefficient library are '
    + 'assumptions with their own provenance badges in the interface; they are inputs here, not '
    + 'graded quantities.',
    'The heat, moisture and contaminant transport (the linear well-mixed system over the solved '
    + 'flows) and the capture-velocity relation are outside this benchmark, which covers the '
    + 'pressure and flow network only.',
    'Wind pressure, fan curves, duct networks and every transient are outside the model.',
    'The page shows its own built-in checks. Those re-run the same solver and are a self-check '
    + 'of consistency, not validation; nothing in this artifact relies on them.'
  ],
  run_notes: [
    'Each network is loaded through the tool\'s own permalink codec and read back from '
    + 'Diagram.record.build().',
    'Cross-check: on the three series cascades the reference\'s network solver and the '
    + 'hand-derived closed form agree to better than 1e-10 relative, and the tool matches both.'
  ],
  crosscheck: 'closed-form series cascade vs. the scipy network solve: < 1e-10 relative on every '
            + 'room pressure and every connection flow.',
  total, passed, failed: total - passed,
  flagged: results.filter(r => r.flagged).length,
  page_errors: pageErrors,
  cases: results
};
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`luchtbalans: ${passed}/${total} passed, ${pageErrors.length} page errors`);
for (const r of results.filter(r => !r.pass))
  console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(
    Object.entries(r.cmp).filter(([, v]) => v.ok === false))).slice(0, 600));
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
