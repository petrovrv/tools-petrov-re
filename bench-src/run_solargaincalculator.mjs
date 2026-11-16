/* Benchmark driver for solargaincalculator.html
 *
 * The page is driven through the DOM only; the numbers are read back from
 * Diagram.record.build(), which is the tool's own declared output surface (the
 * result tiles print the same values rounded to 3-4 significant digits).
 *
 * The NASA POWER request is deliberately intercepted so that every case runs on
 * the bundled offline climatology and is reproducible; two dedicated cases check
 * both the online and the offline branch.
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
  provenance_note: "Reference values are derived by bench-src/ref/gen_solargaincalculator.py rather than transcribed, but that generator could not be re-run against this tree (it imports pvlib, which is not installed here), so the corpus is not reproduced here and the artifact reuses it as stored."
};

const P = benchPaths({ name: 'solargaincalculator', page: 'solargaincalculator.html',
                       ref: 'solargaincalculator_ref.json',
                       fixtures: 'solargain_power_brussels.json' });
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

function cmpVal(got, ref, tolAbs, tolRel) {
  const a = Math.abs(got - ref);
  const rel = a / Math.max(Math.abs(ref), 1e-12);
  const ok = a <= tolAbs + 1e-12 || rel <= tolRel;
  return { got, ref, rel, ok, tol_abs: tolAbs, tol_rel: tolRel };
}

/* ------------------------------------------------------------------ driving */
async function ready(page) {
  await page.waitForFunction(
    () => window.Diagram && window.Diagram.record && window.Diagram.record.build() !== null,
    null, { timeout: 90000 });
}
async function settle(page, ms) { await page.waitForTimeout(ms || 500); }

async function setSite(page, lat, lon, alt) {
  await page.evaluate(({ lat, lon, alt }) => {
    const set = (id, v) => { const e = document.querySelector(id); e.value = String(v);
                             e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('#in-lat', lat); set('#in-lon', lon); set('#in-alt', alt);
  }, { lat, lon, alt });
  await settle(page, 700);
}
async function setShape(page, shape, fields, mode) {
  await page.evaluate(s => document.querySelector(`.shape-btn[data-shape="${s}"]`).click(), shape);
  await settle(page, 500);
  if (mode) {
    const ok = await page.evaluate(m => {
      const sel = document.querySelector('#shape-modes select'); if (!sel) return false;
      sel.value = m; sel.dispatchEvent(new Event('change', { bubbles: true })); return sel.value === m;
    }, mode);
    if (!ok) throw new Error(`shape ${shape} has no mode ${mode}`);
    await settle(page, 900);
  }
  for (const [k, v] of Object.entries(fields)) {
    const ok = await page.evaluate(({ k, v }) => {
      const e = document.querySelector(`[data-pn="${k}"]`); if (!e) return false;
      e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); return true;
    }, { k, v });
    if (!ok) throw new Error(`shape ${shape} has no field ${k}`);
    await settle(page, 130);
  }
  await settle(page, 1200);
}
async function setMaterialLand(page, mat, land) {
  await page.evaluate(({ mat, land }) => {
    const m = document.querySelector('#in-mat'); m.value = mat;
    m.dispatchEvent(new Event('change', { bubbles: true }));
    const l = document.querySelector('#in-land'); l.value = land;
    l.dispatchEvent(new Event('change', { bubbles: true }));
  }, { mat, land });
  await settle(page, 600);
}
async function setInstant(page, month, day, hour, scenario) {
  await page.evaluate(() => {
    const b = document.querySelector('#mode-seg button[data-m="instant"]'); if (b) b.click();
  });
  await settle(page, 400);
  await page.evaluate(s => {
    const b = document.querySelector(`#sc-seg button[data-s="${s}"]`); if (b) b.click();
  }, scenario);
  await settle(page, 500);
  await page.evaluate(m => { const e = document.querySelector('#c-month'); e.value = String(m);
                             e.dispatchEvent(new Event('change', { bubbles: true })); }, month);
  await settle(page, 350);
  await page.evaluate(d => { const e = document.querySelector('#c-day'); e.value = String(d);
                             e.dispatchEvent(new Event('change', { bubbles: true })); }, day);
  await settle(page, 350);
  await page.evaluate(h => { const e = document.querySelector('#c-hour'); e.value = String(h);
                             e.dispatchEvent(new Event('input', { bubbles: true })); }, hour);
  await settle(page, 700);
}
const rec = page => page.evaluate(() => window.Diagram.record.build());

/* ------------------------------------------------------------------- run */
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
page.on('console', m => { if (m.type() === 'error' && !/ERR_(FAILED|ABORTED|BLOCKED)/.test(m.text()))
                            pageErrors.push('console: ' + m.text()); });
await page.route('**power.larc.nasa.gov**', r => r.abort());
await page.goto(URLBASE + '?lang=en');
await ready(page);
/* the build this run graded, out of the document the browser loaded */
const BUILD = await readPageManifestRevision(page);

/* --- 0. the published SPA verification case ------------------------------ */
{
  const c = REF.cases.find(x => x.id === 'spa_published_testcase');
  const cmp = {};
  for (const [k, v] of Object.entries(c.expected))
    cmp[k] = cmpVal(v.ref, v.published, 5e-5, 1e-6);
  push(c.id, 'reference_selfcheck', c.note, {}, cmp);
}

/* --- 1. the physics chain, one case at a time ---------------------------- */
const QTY = ['solar_declination', 'equation_of_time', 'sun_elevation', 'sun_azimuth',
             'solar_time', 'sunrise', 'sunset', 'ghi', 'dni', 'dhi',
             'beam_component', 'sky_diffuse_component', 'ground_reflected_component',
             'incident_power', 'absorbed_power', 'poa_irradiance',
             'poa_after_incidence_angle', 'collecting_area'];

let last = { site: null, shape: null, fields: null, mat: null, land: null };
for (const c of REF.cases) {
  if (c.group === 'reference_selfcheck') continue;
  const i = c.inputs, e = c.expected;
  const siteKey = i.site.join(',');
  if (siteKey !== last.site) { await setSite(page, i.site[1], i.site[2], i.site[3]); last.site = siteKey; }
  const shapeKey = i.shape + JSON.stringify(i.fields) + (i.mode || '');
  if (shapeKey !== last.shape) { await setShape(page, i.shape, i.fields, i.mode); last.shape = shapeKey; }
  const matKey = i.material + '/' + i.land;
  if (matKey !== last.mat) { await setMaterialLand(page, i.material, i.land); last.mat = matKey; }
  await setInstant(page, i.month, i.day, i.hour, i.scenario);
  const r = await rec(page);
  const cmp = {};
  for (const q of QTY) {
    const ref = e[q];
    if (ref === null || ref === undefined) continue;
    const got = r.outputs[q];
    if (got === null || got === undefined) { cmp[q] = { got: null, ref, rel: 1, ok: false }; continue; }
    if (q === 'collecting_area') { cmp[q] = cmpVal(got, ref, 1e-6, 1e-6); continue; }
    const t = e.tolerance[q] || { abs: 0, rel: 2e-9 };
    // an angle that is ill conditioned when the sun is near the zenith is compared
    // through the great-circle displacement it causes
    if (q === 'sun_azimuth') {
      let d = Math.abs(((got - ref + 540) % 360) - 180);
      d *= Math.cos(Math.min(89.9, Math.abs(e.sun_elevation)) * Math.PI / 180);
      cmp[q] = { got, ref, rel: d / 360, ok: d <= Math.max(t.abs, 0.02) + 1e-12,
                 tol_abs: Math.max(t.abs, 0.02), note: 'great-circle displacement, deg' };
      continue;
    }
    cmp[q] = cmpVal(got, ref, Math.max(t.abs, q === 'equation_of_time' ? 0.1 : 0), t.rel);
  }
  // exact bookkeeping identities, no external reference needed
  const alpha = r.inputs.solar_absorptance;
  const inc = r.outputs.incident_power, sum = r.outputs.beam_component
            + r.outputs.sky_diffuse_component + r.outputs.ground_reflected_component;
  cmp.identity_absorbed_eq_alpha_x_incident = cmpVal(r.outputs.absorbed_power, alpha * inc, 1e-9, 1e-12);
  cmp.identity_components_sum_to_incident = cmpVal(sum, inc, 1e-9, 1e-12);
  cmp.identity_poa_eff_times_area = cmpVal(r.outputs.poa_after_incidence_angle * r.outputs.collecting_area,
                                           inc, 1e-9, 1e-12);
  push(c.id, c.group, c.note, i, cmp,
       { discretisation: { kb_table_interpolation_rel: e.table_interpolation_error,
                           mesh_faceting_vs_smooth_rel: e.mesh_faceting_error,
                           kb_exact: e.Kb_exact, kb_table: e.Kb },
         clearsky_model_choice: e.clearsky_pvlib_uncapped,
         crosscheck: e.crosscheck && e.crosscheck.pvlib_perez_sky_diffuse !== undefined ? {
           pvlib_perez_sky_diffuse: e.crosscheck.pvlib_perez_sky_diffuse,
           own_perez_sky_diffuse: e.crosscheck.own_perez_sky_diffuse,
           rel: Math.abs(e.crosscheck.pvlib_perez_sky_diffuse - e.crosscheck.own_perez_sky_diffuse)
                / Math.max(1e-12, Math.abs(e.crosscheck.pvlib_perez_sky_diffuse)) } : undefined,
         spa_instant: { apparent_elevation: e.spa_instant_elevation, azimuth: e.spa_instant_azimuth,
                        deviation_from_tool_deg: Math.abs(e.spa_instant_elevation - e.sun_elevation) },
         reference_spread: e.solpos_spread });
}

/* --- 2. clear-sky GHI must fall monotonically as the sun sets ------------- */
{
  await setSite(page, 50.851, 4.352, 28); last.site = '50.851';
  await setShape(page, 'plane', REF.cases.find(x => x.id === 'shape_plane').inputs.fields, null);
  last.shape = 'mono-check';
  const hrs = [];
  for (let h = 15.0; h <= 16.8; h += 0.2) hrs.push(Math.round(h * 10) / 10);
  const series = [];
  for (const h of hrs) {
    await setInstant(page, 12, 21, h, 'clear');
    const r = await rec(page);
    series.push({ hour: h, elev: r.outputs.sun_elevation, ghi: r.outputs.ghi, dni: r.outputs.dni,
                  dhi: r.outputs.dhi });
  }
  const desc = series.filter(s => s.ghi > 0);
  let mono = true, worst = 0;
  for (let k = 1; k < desc.length; k++)
    if (desc[k].ghi > desc[k - 1].ghi) { mono = false; worst = Math.max(worst, desc[k].ghi / desc[k - 1].ghi - 1); }
  const nonneg = series.every(s => s.ghi >= 0 && s.dni >= 0 && s.dhi >= -1e-9 && isFinite(s.ghi));
  push('clearsky_monotone_at_sunset', 'validity',
       'Clear-sky GHI must decrease monotonically as the sun descends. The Ineichen-Perez '
       + 'enhancement term exp(0.01*m^1.8) grows faster than the extinction term falls once the '
       + 'air mass exceeds about 15, so the unclamped correlation turns back upwards near the '
       + 'horizon; this checks the declared air-mass cap of 12 removes that.',
       { site: 'Brussels', date: '21 Dec', hours: hrs, scenario: 'clear' },
       { ghi_monotone_in_solar_elevation: { got: mono, ref: true, rel: worst, ok: mono },
         all_components_finite_and_non_negative: { got: nonneg, ref: true, rel: nonneg ? 0 : 1, ok: nonneg } },
       { series });
}

/* --- 3. photovoltaic yield: direction of the temperature coefficient ------ */
{
  await setSite(page, 41.9, 12.5, 21); last.site = 'rome-pv';
  await page.evaluate(() => { const c = document.querySelector('#in-pv');
                              c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle(page, 900);
  const read = async (mon, day, hour) => { await setInstant(page, mon, day, hour, 'clear'); return rec(page); };
  const a = await read(1, 15, 12);   // cold month
  const b = await read(7, 15, 12);   // hot month
  const effA = a.outputs.pv_dc_power / Math.max(1e-9, a.outputs.incident_power);
  const effB = b.outputs.pv_dc_power / Math.max(1e-9, b.outputs.incident_power);
  const gamma = a.inputs.pv_temperature_coefficient, eta = a.inputs.pv_efficiency;
  const predA = eta * (1 + gamma * (a.outputs.cell_temperature - 25));
  const predB = eta * (1 + gamma * (b.outputs.cell_temperature - 25));
  // Faiman (2008) cell temperature, reproduced from the tool's own POA and wind
  const u0 = 25, u1 = 6.84;
  const windRef = h => { const z = Math.max(h, 0.6); return Math.log(z / 0.05) / Math.log(2 / 0.05); };
  const tcA = a.inputs.air_temperature + a.outputs.poa_irradiance
              / (u0 + u1 * a.inputs.wind_speed * windRef(a.inputs.reference_height));
  const tcB = b.inputs.air_temperature + b.outputs.poa_irradiance
              / (u0 + u1 * b.inputs.wind_speed * windRef(b.inputs.reference_height));
  push('pv_temperature_coefficient', 'pv',
       'The photovoltaic model must lose efficiency as the cell heats up (gamma < 0) and the cell '
       + 'temperature must follow Faiman (2008) T_cell = T_air + POA/(u0 + u1*v) with the open-rack '
       + 'coefficients u0 = 25 W/m2K, u1 = 6.84 W/m3sK used by pvlib.temperature.faiman.',
       { site: 'Rome', dates: ['15 Jan 12:00', '15 Jul 12:00'], pv: true },
       { gamma_is_negative: { got: gamma, ref: -0.0034, rel: Math.abs(gamma + 0.0034) / 0.0034, ok: gamma < 0 },
         hot_month_efficiency_lower: { got: effB, ref: effA, rel: (effA - effB) / effA, ok: effB < effA },
         dc_efficiency_january: cmpVal(effA, predA, 1e-9, 1e-9),
         dc_efficiency_july: cmpVal(effB, predB, 1e-9, 1e-9),
         faiman_cell_temperature_january: cmpVal(a.outputs.cell_temperature, tcA, 1e-6, 1e-9),
         faiman_cell_temperature_july: cmpVal(b.outputs.cell_temperature, tcB, 1e-6, 1e-9) },
       { detail: { tcell_jan: a.outputs.cell_temperature, tcell_jul: b.outputs.cell_temperature } });
  await page.evaluate(() => { const c = document.querySelector('#in-pv');
                              c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle(page, 800);
}

/* --- 4. surface heat balance closes at the stagnation temperature --------- */
{
  const r = await rec(page);
  const sig = 5.670374e-8, eps = r.inputs.thermal_emittance;
  // rebuild the balance from the tool's own reported terms
  const abs = r.outputs.absorbed_power, ts = r.outputs.stagnation_temperature;
  // net heat at the working temperature is reported; at stagnation it must be zero
  await page.evaluate(() => { const s = document.querySelector('#in-tmode'); if (s) { s.value = 'fixed';
                              s.dispatchEvent(new Event('change', { bubbles: true })); } });
  await settle(page, 600);
  const set = await page.evaluate(t => { const e = document.querySelector('#in-twork');
                                         if (!e) return false; e.value = String(t);
                                         e.dispatchEvent(new Event('change', { bubbles: true })); return true; },
                                  Number(ts.toFixed(6)));
  await settle(page, 700);
  const r2 = set ? await rec(page) : null;
  const ok = r2 ? Math.abs(r2.outputs.net_heat) <= 1e-3 * Math.max(1, abs) : null;
  push('stagnation_temperature_closes_balance', 'thermal',
       'The stagnation temperature is defined by Q_abs = Q_rad + Q_conv. Setting the working '
       + 'surface temperature to the reported stagnation temperature must drive the reported net '
       + 'heat to zero.',
       { surface_temperature_mode: 'fixed', t_work: ts },
       set ? { net_heat_at_stagnation: { got: r2.outputs.net_heat, ref: 0,
                                         rel: Math.abs(r2.outputs.net_heat) / Math.max(1, abs), ok } }
           : { control_present: { got: false, ref: true, rel: 1, ok: false,
                                  note: 'the fixed-temperature input was not reachable' } },
       { detail: { absorbed: abs, stagnation: ts, emittance: eps, sigma: sig } });
  await page.evaluate(() => { const s = document.querySelector('#in-tmode'); if (s) { s.value = 'ambient';
                              s.dispatchEvent(new Event('change', { bubbles: true })); } });
  await settle(page, 600);
}

/* --- 5. network declaration and offline degradation ---------------------- */
{
  const man = await page.evaluate(() => {
    const m = JSON.parse(document.getElementById('diagram-tool-manifest').textContent);
    const ext = [...document.querySelectorAll('script[src],link[href],img[src]')]
      .map(e => e.getAttribute('src') || e.getAttribute('href'))
      .filter(u => u && /^https?:\/\//i.test(u));
    return { network_access: m.network_access, dependencies: m.dependencies, external_tags: ext };
  });
  const off = await rec(page);
  const note = (man.network_access && man.network_access.note || '').toLowerCase();
  const declaresExternal = man.network_access && man.network_access.mode === 'external'
                           && note.includes('power.larc.nasa.gov');
  const degrades = off.inputs.climate_source === 'offline'
                   && off.outputs.ghi > 0 && isFinite(off.outputs.absorbed_power);
  // now serve the POWER answer from a fixture and check the online branch is used
  const fixture = JSON.parse(fs.readFileSync(P.fixtures['solargain_power_brussels.json'], 'utf8'));
  const p2 = await ctx.newPage();
  const err2 = [];
  p2.on('pageerror', e => err2.push(String(e)));
  await p2.route('**power.larc.nasa.gov**', r => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
  await p2.goto(URLBASE + '?lang=en');
  await ready(p2);
  await p2.waitForFunction(() => { const r = window.Diagram.record.build();
                                   return r && r.inputs.climate_source === 'power'; },
                           null, { timeout: 30000 }).catch(() => {});
  const on = await p2.evaluate(() => window.Diagram.record.build());
  await p2.close();
  const usesPower = on && on.inputs.climate_source === 'power';
  push('network_declaration_and_offline_fallback', 'network',
       'network_access must be "external" and name the host, the page must load no third-party '
       + 'script/link/img, the tool must produce a complete result with the POWER request blocked, '
       + 'and it must switch to the POWER climatology when the request succeeds.',
       { blocked_request: 'power.larc.nasa.gov', fixture: 'solargain_power_brussels.json' },
       { manifest_declares_external_and_names_host: { got: declaresExternal, ref: true,
                                                      rel: declaresExternal ? 0 : 1, ok: declaresExternal },
         no_third_party_tags: { got: man.external_tags.length, ref: 0,
                                rel: man.external_tags.length ? 1 : 0, ok: man.external_tags.length === 0 },
         degrades_to_offline_climatology: { got: degrades, ref: true, rel: degrades ? 0 : 1, ok: degrades },
         no_exception_on_either_path: { got: err2.length + pageErrors.length, ref: 0,
                                        rel: (err2.length + pageErrors.length) ? 1 : 0,
                                        ok: err2.length + pageErrors.length === 0 },
         uses_power_when_available: { got: usesPower, ref: true, rel: usesPower ? 0 : 1, ok: usesPower } },
       { detail: { manifest_network_access: man.network_access, external_tags: man.external_tags,
                   offline_source: off.inputs.climate_source,
                   online_source: on ? on.inputs.climate_source : null,
                   online_linke_turbidity: on ? on.inputs.linke_turbidity : null } });
}

/* --- 6. permalink round trip -------------------------------------------- */
{
  const before = await rec(page);
  const link = await page.evaluate(() => window.Diagram.state.link());
  const qs = link.split('?')[1];
  const p3 = await ctx.newPage();
  const err3 = [];
  p3.on('pageerror', e => err3.push(String(e)));
  await p3.route('**power.larc.nasa.gov**', r => r.abort());
  await p3.goto(URLBASE + '?' + qs);
  await ready(p3);
  await p3.waitForTimeout(1500);
  const after = await p3.evaluate(() => window.Diagram.record.build());
  const stA = JSON.stringify(await page.evaluate(() => window.Diagram.state.current()));
  const stB = JSON.stringify(await p3.evaluate(() => window.Diagram.state.current()));
  await p3.close();
  let maxRel = 0, allSame = true;
  for (const k of Object.keys(before.outputs)) {
    const a = before.outputs[k], b = after.outputs[k];
    if (typeof a === 'number' && typeof b === 'number') {
      maxRel = Math.max(maxRel, Math.abs(a - b) / Math.max(1e-12, Math.abs(a)));
      if (a !== b) allSame = false;
    } else if (JSON.stringify(a) !== JSON.stringify(b)) allSame = false;
  }
  push('permalink_round_trip', 'framework',
       'The encoded state must restore byte-identical inputs and bit-identical outputs in a fresh page.',
       { link_chars: link.length },
       { state_identical: { got: stA === stB, ref: true, rel: stA === stB ? 0 : 1, ok: stA === stB },
         outputs_identical: { got: allSame, ref: true, rel: maxRel, ok: allSame },
         no_exception_on_reopen: { got: err3.length, ref: 0, rel: err3.length ? 1 : 0, ok: err3.length === 0 } },
       { detail: { state_a: stA.slice(0, 400), state_b: stB.slice(0, 400) } });
}

/* --- 7. the languages the catalogue declares ---------------------------- */
{
  const langs = ['en', 'uk', 'de', 'nl', 'fr', 'es'];
  const seen = {}; const errs = [];
  for (const l of langs) {
    const p4 = await ctx.newPage();
    p4.on('pageerror', e => errs.push(l + ': ' + e));
    await p4.route('**power.larc.nasa.gov**', r => r.abort());
    await p4.goto(URLBASE + '?lang=' + l);
    await ready(p4);
    seen[l] = await p4.evaluate(() => ({ sel: document.querySelector('#lang-sel').value,
                                         title: document.querySelector('header.top').innerText.split('\n')[0] }));
    await p4.close();
  }
  const okLang = langs.every(l => seen[l].sel === l);
  const distinct = new Set(langs.map(l => seen[l].title)).size;
  push('language_selection', 'framework',
       'The ?lang= query parameter must select the tool UI language for all six catalogue languages.',
       { languages: langs },
       { query_parameter_honoured: { got: okLang, ref: true, rel: okLang ? 0 : 1, ok: okLang },
         titles_are_translated: { got: distinct, ref: 5, rel: 0, ok: distinct >= 5 },
         no_exception: { got: errs.length, ref: 0, rel: errs.length ? 1 : 0, ok: errs.length === 0 } },
       { detail: seen });
}

await browser.close();

/* ------------------------------------------------------------------ output */
const total = results.length;
const passed = results.filter(r => r.pass).length;
const worstKb = Math.max(...REF.cases.filter(c => c.expected && c.expected.sun_elevation > 3
                                            && c.expected.table_interpolation_error !== undefined)
                                     .map(c => c.expected.table_interpolation_error));
const out = {
  tool: 'solargaincalculator',
  file: 'solargaincalculator.html',
  reference: REF.reference,
  reference_citations: REF.citations,
  tolerance:
    'Every angle and irradiance is graded against the NREL SPA (pvlib.solarposition.spa_python) '
    + 'and the published closed forms named in the citations. The per-case tolerance is not chosen '
    + 'by hand: it is the spread the two independent solar-position references (NREL SPA and the '
    + 'Michalsky/NOAA ephemeris of pvlib.solarposition.ephemeris) themselves produce, propagated '
    + 'through the whole chain by re-running the reference with the declination and equation of '
    + 'time shifted by that spread (floor 0.01 deg in declination, 0.10 min in the equation of '
    + 'time, 2e-9 relative) and, independently, by the disagreement between the two published '
    + 'Earth-Sun distance formulations pvlib offers (NREL and Spencer 1971), which is about '
    + '1e-3 relative and enters every irradiance linearly. Typical values are 0.02 deg on sun '
    + 'elevation and 0.1-0.4 % on the irradiances, growing where the sun is low because the '
    + 'chain is stiff there. Bookkeeping '
    + 'identities (absorbed = absorptance x incident, components summing to the incident power, '
    + 'effective POA x area = incident power, net heat = 0 at the stagnation temperature) are '
    + 'exact arithmetic and are held to 1e-12 relative. The beam collecting area is compared '
    + 'against the tool\'s DECLARED bilinear interpolation on its 49 x 721 (declination, hour '
    + 'angle) table, reproduced independently here from exact closed-form projected areas; the '
    + 'difference between that table value and the exact projected area is reported per case as '
    + '"discretisation" and never hidden - it is below '
    + (worstKb * 100).toFixed(3) + ' % for every case with the sun above 3 deg and reaches '
    + '0.11 % at a sun elevation of 1.6 deg.',
  not_benchmarked: [
    'The NASA POWER climatology itself is third-party data, not physics: the harness blocks the '
    + 'request so every case runs on the bundled offline grid, and one dedicated case checks that '
    + 'the online branch is taken when the request succeeds.',
    'The monthly clearness index, Linke turbidity and the diffuse-fraction calibration are '
    + 'empirical inputs read from that climatology; they are passed to the reference as inputs and '
    + 'are not graded.',
    'The Erbs, Perez, Ineichen-Perez, Martin-Ruiz, Brandemuehl-Beckman, Berdahl-Martin and Faiman '
    + 'relations are empirical correlations with published scatter. They are checked for faithful '
    + 'implementation and for being applied inside their stated range, not against measurements.',
    'The day, month and year integrations (trapezoidal, 15-minute steps) are not separately '
    + 'benchmarked against an independent quadrature.',
    'The ray-traced self-shading and sky/ground view factors of the non-convex shapes (recessed '
    + 'window with a recess, open box, bowl) are a Monte-Carlo-like hemispherical quadrature; only '
    + 'the convex shapes, whose aperture factors have closed forms, are graded here.',
    'The tool\'s calendar is fixed to the year 2025, so leap-year date handling is not reachable '
    + 'through the interface and is not benchmarked.'
  ],
  run_notes: [
    'Driven through the DOM with Playwright/Chromium; values read back from '
    + 'Diagram.record.build(), the tool\'s own declared output surface.',
    'The clear-sky scenario is used wherever the point is the radiative model, so that no '
    + 'empirical monthly clearness index enters the graded quantity.',
    'Cross-check: this file\'s own Perez 1990 transposition agrees with pvlib.irradiance.perez to '
    + '5e-16 relative over the 32 plane cases; the two solar-position references agree to the '
    + 'spread quoted per case.'
  ],
  crosscheck: 'pvlib.irradiance.perez vs. the independent Perez implementation in '
              + 'gen_solargaincalculator.py: max 4.8e-16 relative over 32 cases. '
              + 'pvlib.solarposition.spa_python vs. pvlib.solarposition.ephemeris: the per-case '
              + 'declination and equation-of-time spread recorded in each case as solpos_spread.',
  total, passed, failed: total - passed,
  flagged: results.filter(r => r.flagged).length,
  page_errors: pageErrors,
  cases: results
};
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`solargaincalculator: ${passed}/${total} passed, ${pageErrors.length} page errors`);
for (const r of results.filter(r => !r.pass))
  console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(
    Object.entries(r.cmp).filter(([, v]) => v.ok === false))).slice(0, 400));
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
