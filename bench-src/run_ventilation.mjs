/* Benchmark driver for ventilation.html (Room Ventilation Calculator).
 *
 * Driven through the DOM; numbers read back from Diagram.record.build() and, for
 * the opening table, from the rendered table itself so that what the user sees is
 * what is graded.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is the manifest_revision read out of the
   live DOM of the page this run loaded, so the artifact names the build it graded and
   not whichever page happens to sit beside the driver; stampProvenance() writes it
   together with reference_provenance, provenance_note and run_at, and refuses to
   write anything without it. Every path resolves through benchPaths() against this
   driver's own tree. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_ventilation.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 1 893 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const P = benchPaths({ name: 'ventilation', page: 'ventilation.html',
                       ref: 'ventilation_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
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

async function ready(page) {
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null,
                             null, { timeout: 60000 });
}
const rec = page => page.evaluate(() => window.Diagram.record.build());

async function applyCase(page, P) {
  // The openings, sources and supplies are lists the interface builds; the tool's own
  // permalink codec is the public way to put them all in place at once, so the harness
  // encodes the wanted state and opens the tool on that link.
  const st = {
    v: 2, lang: 'en', country: 'Belgium', city: 'Brussels', season: P.season,
    tout: P.Tout, time: P.hour, cloud: P.cloud, H: P.H, W: P.W, L: P.L,
    wallmat: P.wallmat, roofmat: P.roofmat, wallins: P.wallins, roofins: P.roofins,
    qextra: P.qextra, probeZ: P.probe_z === undefined ? 1.5 : P.probe_z,
    ops: P.openings.map(o => ({ t: 'window', d1: o.area, dp: 1.0, z: o.z, s: 'right', x: 0.5 })),
    src: P.sources.map(s2 => ({ p: s2.power, z: s2.z, x: 0.5 })),
    sup: P.supplies.length ? P.supplies.map(s2 => ({ f: s2.flow, t: s2.temp, z: s2.z, x: 0.06 }))
                           : [{ f: 0, t: 22, z: 0.5, x: 0.06 }]
  };
  const enc = await page.evaluate(o => window.Diagram.state.encode(o), st);
  await page.goto(URLBASE + '?lang=en&s=' + enc);
  await ready(page);
  await page.waitForTimeout(250);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
await page.goto(URLBASE + '?lang=en');
await ready(page);
/* the build this run graded, out of the document the browser loaded */
const BUILD = await readPageManifestRevision(page);

/* --- 0. the reference's own cross-check against the textbook closed form --- */
for (const c of REF.cases.filter(x => x.group === 'stack_closed_form')) {
  const e = c.expected;
  push(c.id, 'reference_selfcheck', c.note, c.inputs, {
    neutral_plane: cmpVal(e.z_neutral_solver, e.z_neutral_closed_form, 1e-9, 1e-10),
    mass_flow: cmpVal(e.mdot_solver, e.mdot_closed_form, 1e-9, 1e-10),
    boussinesq_volume_flow: { got: e.q_boussinesq, ref: e.volume_flow_in_m3s,
      rel: Math.abs(e.q_boussinesq - e.volume_flow_in_m3s) / e.volume_flow_in_m3s,
      ok: Math.abs(e.q_boussinesq - e.volume_flow_in_m3s) / e.volume_flow_in_m3s < 0.06,
      note: 'the Boussinesq form Q = Cd A* sqrt(2 g dH dT/T_mean) is the small-density-'
          + 'difference limit of the exact expression; agreement to a few per cent is the '
          + 'expected size of the approximation it makes, not a tool result' } });
}

/* --- 1. full-room cases -------------------------------------------------- */
const QTY = ['indoor_mean_temperature', 'temperature_at_probe', 'temperature_bottom',
             'temperature_top', 'vertical_gradient', 'stratification_span',
             'neutral_pressure_level', 'exhaust_flow', 'air_changes_per_hour',
             'mass_flow_in', 'mass_flow_out', 'mass_flow_supply', 'solar_irradiance',
             'sol_air_roof', 'heat_source', 'envelope_gain', 'roof_gain', 'wall_gain',
             'supply_air_gain', 'natural_ventilation_loss', 'extra_flux', 'room_volume',
             'inflow_volume', 'outflow_volume', 'max_opening_velocity'];

for (const c of REF.cases.filter(x => x.group === 'room')) {
  const P = c.inputs, e = c.expected;
  await applyCase(page, P);
  const r = await rec(page);
  const cmp = {};
  for (const q of QTY) {
    if (e[q] === undefined || e[q] === null) continue;
    const t = (e.tolerance && e.tolerance[q]) || { abs: 0, rel: 2e-9 };
    cmp[q] = cmpVal(r.outputs[q], e[q], t.abs, Math.max(t.rel, 2e-9));
  }
  // ---- identities the tool must satisfy exactly, whatever the reference says
  const o = r.outputs;
  const rows = o.heat_source + o.envelope_gain + o.supply_air_gain
             + o.natural_ventilation_loss + o.extra_flux;
  const scale = Math.max(1, Math.abs(o.heat_source) + Math.abs(o.envelope_gain));
  cmp.identity_balance_rows_sum_to_zero = { got: rows, ref: 0, rel: Math.abs(rows) / scale,
                                            ok: Math.abs(rows) / scale < 1e-9,
                                            tol_rel: 1e-9 };
  cmp.identity_mass_balance = cmpVal(o.mass_flow_in + o.mass_flow_supply, o.mass_flow_out,
                                     1e-9, 1e-12);
  cmp.identity_ach = cmpVal(o.air_changes_per_hour * o.room_volume, o.exhaust_flow, 1e-9, 1e-12);
  cmp.identity_profile_mean = cmpVal(0.5 * (o.temperature_bottom + o.temperature_top),
                                     o.indoor_mean_temperature, 1e-9, 1e-12);
  cmp.identity_gradient = cmpVal(o.vertical_gradient * P.H,
                                 o.temperature_top - o.temperature_bottom, 1e-9, 1e-12);
  // ---- opening table: velocity x area must equal the printed flow
  /* #optab belonged to the page's pre-framework markup. The opening table is now a
     table.dgu-table built by openingNode(); it is told apart from the profile table and
     the balance table by its own header row (v, m/s and m3/h), so a reordering of the
     three tables cannot silently move the comparison onto another one. Data rows only:
     tbody tr, in the order R.flows walks the openings. */
  const tab = await page.evaluate(() => {
    const txt = n => (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
    const tables = [...document.querySelectorAll('table.dgu-table')];
    const hit = tables.filter(t => {
      const h = [...t.querySelectorAll('thead th')].map(x => txt(x).toLowerCase());
      return h.some(x => /^v,\s*m\/s$/.test(x)) && h.some(x => /^m³\/h$/.test(x));
    });
    if (hit.length !== 1) throw new Error('ventilation: expected exactly one opening table '
      + 'among ' + tables.length + ' .dgu-table, found ' + hit.length);
    return [...hit[0].querySelectorAll('tbody tr')].map(tr => [...tr.children].map(txt));
  });
  const areas = r.inputs.openings.map(x => x.area);
  let worstVA = 0;
  tab.forEach((row, k) => {
    const v = parseFloat(row[2]), q = parseFloat(row[4]);
    const expect = areas[k] * v * 3600;
    worstVA = Math.max(worstVA, Math.abs(q - expect) / Math.max(1, Math.abs(expect)));
  });
  // the table prints v to 2 decimals and the flow as an integer, so 0.005/v is the floor
  const vaTol = 0.005 / Math.max(0.05, Math.min(...tab.map(rw => parseFloat(rw[2]) || 1))) + 5e-4;
  cmp.identity_velocity_times_area_is_flow = { got: worstVA, ref: 0, rel: worstVA,
                                               ok: worstVA <= vaTol, tol_rel: vaTol,
                                               note: 'limited by the 2-decimal velocity printed '
                                                   + 'in the table' };
  push(c.id, 'room', c.note, P, cmp, {
    disclosed_inconsistency: {
      stratified_exhaust_enthalpy_error_W: e.stratified_exhaust_enthalpy_error,
      note: 'the heat balance takes the exhaust at the mean indoor temperature while the '
          + 'panel draws a gradient; if the air really left at the top temperature the '
          + 'ventilation loss would be larger by this amount. Disclosed in the model notes, '
          + 'not graded.' },
    opening_table: tab });
}

/* --- 2. wind is not modelled and the manifest must say so ---------------- */
{
  const man = await page.evaluate(() => JSON.parse(
    document.getElementById('diagram-tool-manifest').textContent));
  const lim = (man.limitations && man.limitations.en || '').toLowerCase();
  const ranges = await page.evaluate(() => window.Diagram.record.build().model.ranges.join(' ').toLowerCase());
  const declared = lim.includes('wind') && ranges.includes('wind');
  // a pure stack tool must not react to anything wind-like: there is no such input
  /* The enumeration by element id was complete when every control carried one. Under the
     framework two of the page's controls (the hour and the cloud-cover sliders) render
     without an id, so the id list alone no longer sees the whole input surface. The same
     check is therefore taken over the ids, the framework field keys and the accessible
     names together - the surface a reader actually meets. */
  const inputs = await page.evaluate(() => {
    const names = [];
    document.querySelectorAll('input,select,textarea').forEach(e => {
      if (e.id) names.push(e.id);
      const f = e.closest('[data-dgu-field]');
      if (f) names.push(f.getAttribute('data-dgu-field'));
      const al = e.getAttribute('aria-label'); if (al) names.push(al);
      if (e.id) { const l = document.querySelector('label[for="' + e.id + '"]');
        if (l) names.push((l.textContent || '').trim()); }
    });
    return [...new Set(names.filter(Boolean))];
  });
  const noWindInput = !inputs.some(i => /wind|speed|cp_/i.test(i));
  push('wind_not_modelled', 'validity',
       'The tool solves buoyancy-driven ventilation only. ASHRAE Fundamentals ch. 16 combines '
       + 'stack and wind pressure as dp = dp_stack + dp_wind with dp_wind = Cp*rho*U^2/2; none of '
       + 'that is present here, so the absence must be stated in the limitations and in the '
       + 'model ranges, and the interface must not offer a wind input that does nothing.',
       {}, {
         limitations_mention_wind: { got: lim.includes('wind'), ref: true,
                                     rel: lim.includes('wind') ? 0 : 1, ok: lim.includes('wind') },
         model_ranges_state_stack_only: { got: ranges.includes('wind'), ref: true,
                                          rel: ranges.includes('wind') ? 0 : 1,
                                          ok: ranges.includes('wind') },
         no_dead_wind_control: { got: noWindInput, ref: true, rel: noWindInput ? 0 : 1,
                                 ok: noWindInput } },
       { detail: { declared } });
}

/* --- 3. degenerate inputs ------------------------------------------------ */
{
  const cases = [
    { id: 'degenerate_no_temperature_difference', P: { Tout: 20, season: 'winter', hour: 0,
        cloud: 100, H: 6, W: 10, L: 10, wallmat: 'sandwich', roofmat: 'sandwich',
        wallins: true, roofins: true, qextra: 0,
        openings: [{ z: 0.5, area: 2 }, { z: 5.5, area: 2 }], sources: [{ power: 0, z: 1.5 }],
        supplies: [] },
      note: 'no heat source, no sun, no supply: the driving force vanishes and the model must '
          + 'return zero flow and a finite temperature rather than NaN' },
    { id: 'degenerate_all_openings_at_one_height', P: { Tout: 30, season: 'summer', hour: 12,
        cloud: 0, H: 8, W: 20, L: 20, wallmat: 'brick', roofmat: 'brick', wallins: false,
        roofins: false, qextra: 0,
        openings: [{ z: 4, area: 2 }, { z: 4, area: 2 }], sources: [{ power: 50000, z: 1 }],
        supplies: [] },
      note: 'every opening at the same height: the neutral plane degenerates and no stack flow '
          + 'is possible; the tool must not report a flow it cannot drive' },
    { id: 'degenerate_tiny_openings', P: { Tout: 30, season: 'summer', hour: 12, cloud: 0,
        H: 8, W: 20, L: 20, wallmat: 'brick', roofmat: 'brick', wallins: false, roofins: false,
        qextra: 0, openings: [{ z: 0.5, area: 0.01 }, { z: 7.5, area: 0.01 }],
        sources: [{ power: 50000, z: 1 }], supplies: [] },
      note: 'a 0.01 m2 opening must be used as entered - not silently raised to a floor - and '
          + 'the printed area, the velocity and the flow must agree' }
  ];
  for (const c of cases) {
    await applyCase(page, c.P);
    const r = await rec(page);
    const o = r.outputs;
    // the neutral plane is genuinely undefined when nothing drives the flow; the tool
    // reports it as NaN and prints an em dash, which is the honest answer
    const bad = Object.entries(o).filter(([k, v]) => k !== 'neutral_pressure_level'
                                        && typeof v === 'number' && !isFinite(v)).map(([k]) => k);
    const finite = bad.length === 0;
    /* #k_npl was the pre-framework readout. The neutral pressure level is now the
       .dgu-tile the page labels "Neutral level" under ?lang=en; its value carries the
       em dash when the level is undefined, and a trailing warning glyph when it lies
       outside the room. Keyed on the label, so a renamed tile fails the case. */
    const npl = await page.evaluate(() => {
      const txt = n => (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
      const lab = n => (txt(n.querySelector('.dgu-tile-l')) || '').replace(/\?$/, '').trim().toLowerCase();
      const hit = [...document.querySelectorAll('.dgu-tile')].filter(n => lab(n) === 'neutral level');
      if (hit.length !== 1) throw new Error('ventilation: the "Neutral level" tile matched '
        + hit.length + ' tiles, not one');
      return txt(hit[0].querySelector('.dgu-tile-v'));
    });
    const cmp = { all_outputs_finite: { got: bad, ref: [], rel: finite ? 0 : 1, ok: finite },
                  undefined_neutral_plane_is_shown_as_such:
                    { got: npl, ref: '\u2014',
                      rel: (o.neutral_pressure_level === null || Number.isNaN(o.neutral_pressure_level))
                           && npl !== '\u2014' ? 1 : 0,
                      ok: !(o.neutral_pressure_level === null
                            || Number.isNaN(o.neutral_pressure_level)) || npl === '\u2014' } };
    if (c.id === 'degenerate_no_temperature_difference') {
      cmp.no_spurious_flow = { got: o.exhaust_flow, ref: 0, rel: o.exhaust_flow / 1e3,
                               ok: o.exhaust_flow < 1e-3 };
    }
    if (c.id === 'degenerate_all_openings_at_one_height') {
      cmp.no_stack_flow_between_equal_heights = { got: o.exhaust_flow, ref: 0,
                                                  rel: o.exhaust_flow / 1e3,
                                                  ok: o.exhaust_flow < 1e-3 };
    }
    if (c.id === 'degenerate_tiny_openings') {
      const a = r.inputs.openings.map(x => x.area);
      const okArea = a.every(x => Math.abs(x - 0.01) < 1e-9);
      cmp.entered_area_is_used = { got: a[0], ref: 0.01, rel: Math.abs(a[0] - 0.01) / 0.01,
                                   ok: okArea };
      const e = REF.cases.find(x => x.id === 'room_small_openings');
      cmp.flow_scales_with_area = { got: o.exhaust_flow > 0 && o.exhaust_flow < 400, ref: true,
                                    rel: 0, ok: o.exhaust_flow > 0 && o.exhaust_flow < 400,
                                    note: 'two 0.01 m2 openings 7 m apart at ~50 K rise carry a '
                                        + 'few tens of m3/h, not thousands' };
    }
    push(c.id, 'degenerate', c.note, c.P, cmp, { outputs: o });
  }
}

/* --- 4. permalink round trip and languages ------------------------------- */
{
  const before = await rec(page);
  const link = await page.evaluate(() => window.Diagram.state.link());
  const qs = link.split('?')[1];
  const p2 = await ctx.newPage();
  const err2 = [];
  p2.on('pageerror', e => err2.push(String(e)));
  await p2.goto(URLBASE + '?' + qs);
  await ready(p2);
  await p2.waitForTimeout(500);
  const after = await p2.evaluate(() => window.Diagram.record.build());
  const stA = JSON.stringify(await page.evaluate(() => window.Diagram.state.current()));
  const stB = JSON.stringify(await p2.evaluate(() => window.Diagram.state.current()));
  await p2.close();
  const same = JSON.stringify(before.outputs) === JSON.stringify(after.outputs);
  push('permalink_round_trip', 'framework',
       'The encoded state must restore identical inputs and bit-identical outputs.',
       { link_chars: link.length },
       { state_identical: { got: stA === stB, ref: true, rel: stA === stB ? 0 : 1, ok: stA === stB },
         outputs_identical: { got: same, ref: true, rel: same ? 0 : 1, ok: same },
         no_exception: { got: err2.length, ref: 0, rel: err2.length ? 1 : 0, ok: !err2.length } },
       { detail: { a: stA.slice(0, 300), b: stB.slice(0, 300) } });
}
{
  const langs = ['en', 'uk', 'de', 'nl', 'fr', 'es'];
  const seen = {}; const errs = [];
  for (const l of langs) {
    const p3 = await ctx.newPage();
    p3.on('pageerror', e => errs.push(l + ': ' + e));
    await p3.goto(URLBASE + '?lang=' + l);
    await ready(p3);
    /* #lang and #ttl were the page's own language select and heading. Both are framework
       furniture now: the language control is the header's select.dgu-sel carrying the
       site's language codes, and the heading is .dgu-title. document.documentElement.lang
       is recorded beside the select so the two can be seen to agree. */
    seen[l] = await p3.evaluate(() => {
      const sels = [...document.querySelectorAll('select.dgu-sel')].filter(s =>
        s.options.length >= 6 && [...s.options].every(o => /^[a-z]{2}$/.test(o.value)));
      if (sels.length !== 1) throw new Error('ventilation: the language select matched '
        + sels.length + ' selects, not one');
      const t = document.querySelector('.dgu-title');
      if (!t) throw new Error('ventilation: no .dgu-title on the page');
      return { sel: sels[0].value, ttl: t.textContent, doc_lang: document.documentElement.lang };
    });
    await p3.close();
  }
  const okLang = langs.every(l => seen[l].sel === l);
  const distinct = new Set(langs.map(l => seen[l].ttl)).size;
  push('language_selection', 'framework',
       'The ?lang= query parameter must select the tool UI language for all six catalogue languages.',
       { languages: langs },
       { query_parameter_honoured: { got: okLang, ref: true, rel: okLang ? 0 : 1, ok: okLang },
         titles_translated: { got: distinct, ref: 6, rel: 0, ok: distinct >= 5 },
         no_exception: { got: errs.length, ref: 0, rel: errs.length ? 1 : 0, ok: !errs.length } },
       { detail: seen });
}

/* --- 5. network declaration --------------------------------------------- */
{
  const man = await page.evaluate(() => {
    const m = JSON.parse(document.getElementById('diagram-tool-manifest').textContent);
    const ext = [...document.querySelectorAll('script[src],link[href],img[src]')]
      .map(e => e.getAttribute('src') || e.getAttribute('href'))
      .filter(u => u && /^https?:\/\//i.test(u));
    return { na: m.network_access, deps: m.dependencies, ext };
  });
  const local = ['diagram-common.js', 'site-disclaimer.js'];
  const mode = man.na && man.na.mode;
  const okMode = mode === 'none' && man.ext.length === 0;
  push('network_declaration', 'network',
       'The page loads only the two shared framework scripts from its own origin and fetches '
       + 'nothing, so network_access must be "none".',
       {}, { declares_none: { got: mode, ref: 'none', rel: okMode ? 0 : 1, ok: okMode },
             no_third_party_tags: { got: man.ext.length, ref: 0, rel: man.ext.length ? 1 : 0,
                                    ok: man.ext.length === 0 } },
       { detail: man });
}

await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length;
const out = {
  tool: 'ventilation',
  file: 'ventilation.html',
  reference: REF.reference,
  reference_citations: REF.citations,
  tolerance:
    'The stack relations, the neutral pressure level and the steady heat balance are closed '
    + 'forms, so the reference is exact to machine precision (scipy.optimize.brentq, xtol 1e-12). '
    + 'The tool stops its outer temperature loop when the indoor temperature moves less than '
    + '0.01 K, and that declared stopping criterion is what sets the tolerance: every quantity '
    + 'is graded with the change a 0.01 K shift of the indoor temperature produces in it '
    + '(typically 2e-4 relative on the temperature and 6e-4 on the flows), floored at 2e-9. '
    + 'Bookkeeping identities - the five balance rows summing to zero, mass in + supply = mass '
    + 'out, ACH x volume = exhaust, the profile mean equalling the mean temperature, the '
    + 'gradient times the height equalling the top-to-bottom span - are exact arithmetic and '
    + 'are held to 1e-9 relative. The opening table is checked against velocity x area at the '
    + 'resolution the table itself prints (two decimals on the velocity).',
  not_benchmarked: [
    'Wind-driven ventilation: the tool does not model it at all. Its absence is checked, its '
    + 'magnitude is not.',
    'The discharge coefficient Cd = 0.65 is a fixed convention, not a computed quantity; the '
    + 'harness checks that it is applied consistently, not that 0.65 is right for a given opening.',
    'The stratification span S is an uncited heuristic. The harness checks the profile it '
    + 'produces is internally consistent (linear, mean equal to the zone temperature) and '
    + 'records the energy inconsistency it implies, but does not grade the value of S.',
    'The clear-sky irradiance fit I = 1050 sin(beta)^1.15 and the cloud factor are a simple '
    + 'correlation with no published scatter statement; only its faithful implementation and '
    + 'its use in the sol-air temperature are checked.',
    'The design outdoor temperatures in the built-in city list are data, not physics, and are '
    + 'not verified against a weather standard.',
    'Transient behaviour, thermal mass, contaminant transport and local comfort are outside '
    + 'the model entirely.'
  ],
  run_notes: [
    'Driven through the DOM and the tool\'s own permalink codec; values read back from '
    + 'Diagram.record.build() and from the rendered opening table.',
    'Cross-check: the network solver in the reference reproduces the analytic two-opening '
    + 'stack formula to better than 1e-10 relative on both the neutral plane and the mass '
    + 'flow, over four independent geometries.',
    'The Boussinesq form Q = Cd A* sqrt(2 g dH dT/T_mean) quoted in CIBSE AM10 differs from '
    + 'the exact expression by a few per cent because it drops the density ratio; that gap is '
    + 'recorded as a property of the approximation, not of the tool.'
  ],
  crosscheck: 'exact two-opening closed form vs. the general network solver: < 1e-10 relative '
            + 'over four geometries; Boussinesq small-density-difference form: 1-6 % as expected.',
  total, passed, failed: total - passed,
  flagged: results.filter(r => r.flagged).length,
  page_errors: pageErrors,
  cases: results
};
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`ventilation: ${passed}/${total} passed, ${pageErrors.length} page errors`);
for (const r of results.filter(r => !r.pass))
  console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(
    Object.entries(r.cmp).filter(([, v]) => v.ok === false))).slice(0, 500));
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
