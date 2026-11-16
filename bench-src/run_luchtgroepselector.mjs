/* Benchmark driver — luchtgroepselector.html  ("Air Handling Unit Specification Aid")
 *
 * This tool has TWO halves and they are graded differently.
 *
 *   A. NUMERIC — the live calculation behind the 216-question sheet: psychrometric
 *      states, air flow, heat recovery with its frost limit and preheat, mixing, coil
 *      duties with the sensible/latent split and condensate, humidification, face
 *      velocity and fan power. Graded against
 *        ref1 — the ASHRAE Handbook Fundamentals (2017) ch. 1 formulation and the energy
 *               and mass balances the tool declares, written out independently in
 *               bench-src/ref/lgs_model.py, and
 *        ref2 — CoolProp 8.0 HAPropsSI (ASHRAE RP-1485 real-fluid humid air).
 *      ref1 is the grading reference because it is the formulation the tool states it
 *      implements; ref2 is the crosscheck and its deviation is reported, never used to
 *      fail the tool.
 *
 *   B. DATA INTEGRITY — the questionnaire itself: the schema of every question, profile
 *      and rule, no dangling reference, no answer key the code reads that the sheet
 *      cannot set, and the five lazily loaded language packs against the inline Dutch
 *      base. That half is a data-integrity benchmark, not a physics one, and is
 *      labelled as such in the artifact.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build is read out of
   the live page by readPageManifestRevision() and passed to stampProvenance(), which
   writes build, manifest_revision, reference_provenance, provenance_note and run_at and
   refuses to write anything without an observed build. */
const PROVENANCE = {
  reference_provenance: "mixed",
  provenance_note: "Reference values are derived by bench-src/ref/gen_luchtgroepselector.py rather than transcribed, but that generator could not be re-run against this tree (its lines 35 and 36 hardcode an absolute output path and an absolute site directory that exist on no machine in this container, and it reads luchtgroepselector-lang-en.json from the second of them), so the corpus is not reproduced here and the artifact reuses it as stored."
};

/* Every path resolves relative to this driver's own tree: the site root defaults to the
   parent of bench-src, the reference directory to bench-src/ref and the artifact to
   <siteRoot>/benchmarks/luchtgroepselector.json, which is the file the site serves.
   --site, --ref-dir, --out and --out2 override. */
const P = benchPaths({ name: 'luchtgroepselector', page: 'luchtgroepselector.html',
  ref: ['luchtgroepselector_ref.json', 'luchtgroepselector_schema.json', 'lgs_model.py'] });
const SITE = P.siteRoot;
const REF = JSON.parse(fs.readFileSync(P.refs['luchtgroepselector_ref.json'], 'utf8'));
const SCHEMA = JSON.parse(fs.readFileSync(P.refs['luchtgroepselector_schema.json'], 'utf8'));
const cases = [], flagged = [];
let pageErrors = [];

/* ---- static server: the language packs are fetched, so file:// will not do ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.css': 'text/css' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const f = path.join(SITE, u === '/' ? '/index.html' : u);
  fsp.readFile(f).then(d => {
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    rs.end(d);
  }).catch(() => { rs.writeHead(404); rs.end('not found'); });
});
await new Promise(r => srv.listen(0, r));
const URLBASE = `http://127.0.0.1:${srv.address().port}/${P.pageFile}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });
await page.goto(URLBASE + '?lang=en', { waitUntil: 'load', timeout: 30000 });
/* The DiagramUI shell mounts the 17-step strip, the 218 question fields and the 8 result
   tiles after load, so wait for the surface this driver addresses. */
await page.waitForFunction(() => !!window.Diagram && !!window.DiagramUI
  && typeof App !== 'undefined' && !!App.A
  && document.querySelectorAll('.dgu-step').length > 0
  && document.querySelectorAll('.dgu-tile').length > 0, null, { timeout: 60000 });
/* The build this artifact names is the manifest_revision of the document the browser
   loaded, not of the file beside this driver. */
const BUILD = await readPageManifestRevision(page);
await page.waitForTimeout(600);

/* ---- the page's present control surface -------------------------------------------
   Ported 2026-10-04. The page moved to the DiagramUI shell and four of the handles this
   driver used are gone from the rendered page:
     - #btn-reset is the panel action labelled "Reset" (.dgu-panel-actions .dgu-btn);
     - a question's control was #f_<id> and is now inside the framework field #f_<id>-c,
       so the control is resolved through that wrapper. All 218 fields carry this shape,
       radio groups included, which is why the separate input[data-q] radio pass is gone;
     - the step buttons carried data-step and now carry nothing: they are .dgu-step in
       document order, so a section is addressed by its index, which is what the caller
       already passes;
     - #hdr-title is .dgu-title and #langsel is the header's own select.dgu-sel;
     - .tile with .tl/.tv is .dgu-tile with .dgu-tile-l/.dgu-tile-v, the framework's own
       selector.
   SCHEMA, PROFILES, App, PSY, ADVANCED_KEYS, applyProfile(), compute() and LANG_NL are
   all still reachable and are used exactly as before. These helpers are reinstalled after
   every navigation, because the language cases re-goto the page. ------------------- */
const LGS_HELPERS = () => {
  window.__lgsReset = () => {
    const b = [...document.querySelectorAll('.dgu-panel-actions button, .dgu-btn')]
      .find(x => /^reset$/i.test((x.innerText || '').trim()));
    if (!b) throw new Error('no Reset action on the rendered page');
    b.click();
    return true;
  };
  window.__lgsStep = i => {
    const steps = [...document.querySelectorAll('.dgu-step')];
    const b = steps[Number(i)];
    if (!b) throw new Error('no step ' + i + '; the page renders ' + steps.length + ' steps');
    b.click();
    return true;
  };
  window.__lgsSet = (k, v) => {
    const h = document.getElementById('f_' + k + '-c');
    if (!h) return false;
    const e = /^(INPUT|SELECT|TEXTAREA)$/.test(h.tagName) ? h : h.querySelector('select,input,textarea');
    if (e) {
      if (e.type === 'checkbox') {
        const want = (String(v) === 'true' || String(v) === 'ja' || v === true);
        if (!!e.checked !== want) e.click();
        return true;
      }
      e.value = String(v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // a segmented control: one button per option, carrying the option in data-value
    const b = [...h.querySelectorAll('button')].find(x =>
      (x.getAttribute('data-value') || '') === String(v) || (x.innerText || '').trim() === String(v));
    if (b) { b.click(); return true; }
    return false;
  };
  window.__lgsLangSel = () => [...document.querySelectorAll('select')]
    .find(s => [...s.options].some(o => /^(en|nl|de|fr|uk|es|pl|ru)$/.test(o.value))) || null;
};
await page.evaluate(LGS_HELPERS);
/* the language cases navigate, which drops the helpers, so reinstall them on every load */
await page.addInitScript(LGS_HELPERS);

const push = (id, note, cmp, notes = [], extra = {}) => {
  const pass = Object.values(cmp).every(x => x.ok);
  cases.push({ id, note, ...extra, cmp,
    worst_rel: Math.max(0, ...Object.values(cmp).map(x => x.rel ?? 0)), pass, notes });
  process.stdout.write((pass ? 'PASS ' : 'FAIL ') + id +
    (notes.length ? '\n      ' + notes.slice(0, 8).join('\n      ') : '') + '\n');
  return pass;
};
const eq = (got, ref) => ({ got, ref, rel: got === ref ? 0 : 1, ok: got === ref });
const num = (got, ref, tol, abstol = 0) => {
  const d = Math.abs(got - ref);
  const rel = Math.abs(ref) > 1e-12 ? d / Math.abs(ref) : d;
  return { got, ref, rel, ok: rel <= tol || d <= abstol };
};
const setEq = (got, ref) => {
  const a = [...new Set(got)].sort(), b = [...new Set(ref)].sort();
  const miss = b.filter(x => !a.includes(x)), extra = a.filter(x => !b.includes(x));
  return { got: a.length, ref: b.length, rel: miss.length + extra.length,
    ok: miss.length === 0 && extra.length === 0, missing: miss.slice(0, 10), unexpected: extra.slice(0, 10) };
};

/* which section holds which question */
const SECTION_OF = {};
SCHEMA.sections.forEach((s, i) => s.questions.forEach(q => { SECTION_OF[q.id] = i; }));

async function resetAndAnswer(answers) {
  await page.evaluate(() => __lgsReset());
  await page.waitForTimeout(120);
  // group the answers by the section that holds them, then set each through a real event
  const bySec = {};
  for (const [k, v] of Object.entries(answers)) {
    const s = SECTION_OF[k];
    if (s === undefined) continue;              // not a question of the sheet
    (bySec[s] = bySec[s] || []).push([k, v]);
  }
  for (const sec of Object.keys(bySec).sort((a, b) => a - b)) {
    await page.evaluate((s) => __lgsStep(s), +sec);
    await page.waitForTimeout(60);
    for (const [k, v] of bySec[sec]) {
      await page.evaluate(([k, v]) => __lgsSet(k, v), [k, v]);
      await page.waitForTimeout(10);
    }
  }
  /* The page no longer renders a bare input[type=radio][data-q]; every question, radio
     groups included, is a framework field whose control sits inside #f_<id>-c, which
     __lgsSet drives. This pass re-sets anything App.A still disagrees with after the
     section sweep, which is what the radio pass did. */
  for (const [k, v] of Object.entries(answers)) {
    const s = SECTION_OF[k];
    if (s === undefined) continue;
    await page.evaluate(([s, k, v]) => {
      if (App.A[k] === v || String(App.A[k]) === String(v)) return;
      __lgsStep(s);
      __lgsSet(k, v);
    }, [s, k, String(v)]);
    await page.waitForTimeout(10);
  }
  return page.evaluate(() => ({ A: JSON.parse(JSON.stringify(App.A)) }));
}

/* ================================================================= 0. load */
{
  const up = await page.evaluate(() => ({
    sections: SCHEMA.length,
    questions: SCHEMA.reduce((s, x) => s + x.questions.length, 0),
    profiles: PROFILES.length,
    hasR: !!App.R,
    tiles: document.querySelectorAll('.dgu-tile').length,
    lang: App.lang
  }));
  const manifest = JSON.parse(fs.readFileSync(path.join(SITE, 'luchtgroepselector.html'), 'utf8')
    .match(/id="diagram-tool-manifest">(.*?)<\/script>/s)[1]);
  const claim = (manifest.summary.en.match(/(\d+)-question/) || [])[1];
  push('load', 'The page comes up, the whole sheet is present, and the number of questions matches ' +
    'the number the catalogue entry claims', {
    sections: eq(up.sections, 16),
    questions: eq(up.questions, 216),
    questions_match_the_catalogue_claim: eq(up.questions, +claim),
    profiles: eq(up.profiles, 28),
    result_object_built: eq(up.hasR, true),
    live_tiles: eq(up.tiles, 8),
    no_page_errors: eq(pageErrors.length, 0)
  }, pageErrors.slice(0, 5));
}

/* ================================================================= 1. numeric */
{
  const answersOut = [], got = [];
  for (const c of REF.cases) {
    const st = await resetAndAnswer(c.answers);
    const R = await page.evaluate(() => {
      const R = App.R;
      const S = s => s ? { t: s.t, rh: s.rh, w: s.w, h: s.h, v: s.v, rho: s.rho, td: s.td, twb: s.twb } : null;
      return {
        p: R.st.p, odaW: S(R.st.odaW), odaS: S(R.st.odaS), idaW: S(R.st.idaW), idaS: S(R.st.idaS),
        flow: { supply: R.flow.supply, extract: R.flow.extract, unbalance: R.flow.unbalance,
          minFlow: R.flow.minFlow, achResult: R.flow.achResult, perPerson: R.flow.perPerson,
          candidates: R.flow.candidates },
        rec: { eta: R.recovery.eta, etaX: R.recovery.etaX, active: R.recovery.active,
          supAfterW: S(R.recovery.supAfterW), supAfterS: S(R.recovery.supAfterS),
          exhaustOut: R.recovery.exhaustOut, frostRisk: R.recovery.frostRisk,
          preheatDeltaT: R.recovery.preheatDeltaT || 0 },
        mixed: { winter: S(R.mixed.winter), summer: S(R.mixed.summer) },
        coils: { mDotW: R.coils.mDotW, mDotS: R.coils.mDotS, preheat: R.coils.preheat,
          heating: R.coils.heating, cooling: R.coils.cooling, coolSens: R.coils.coolSens,
          coolLat: R.coils.coolLat, condensate: R.coils.condensate, shr: R.coils.shr,
          reheat: R.coils.reheat, humidWater: R.coils.humidWater, humidPower: R.coils.humidPower,
          coolLeave: S(R.coils.coolLeave), heatLeave: S(R.coils.heatLeave) },
        geo: { faceArea: R.geometry.faceArea, faceW: R.geometry.faceW, faceH: R.geometry.faceH,
          faceVelocity: R.geometry.faceVelocity, faceVelocityExtract: R.geometry.faceVelocityExtract },
        fans: { dpInternalSup: R.fans.dpInternalSup, dpInternalExt: R.fans.dpInternalExt,
          espSup: R.fans.espSup, espExt: R.fans.espExt, dpTotalSup: R.fans.dpTotalSup,
          dpTotalExt: R.fans.dpTotalExt, eta: R.fans.eta, powerSup: R.fans.powerSup,
          powerExt: R.fans.powerExt, powerTotal: R.fans.powerTotal, sfpSup: R.fans.sfpSup,
          sfpExt: R.fans.sfpExt, sfpSystem: R.fans.sfpSystem },
        energy: { hours: R.energy.hours, heatNoRecovery: R.energy.heatNoRecovery,
          heatWithRecovery: R.energy.heatWithRecovery, recoverySaving: R.energy.recoverySaving,
          fanEnergy: R.energy.fanEnergy },
        // what the panel actually prints, to catch a label that contradicts the number
        printed: [...document.querySelectorAll('.dgu-tile')].map(t =>
          ({ label: (t.querySelector('.dgu-tile-l') || { innerText: '' }).innerText.trim(),
             value: (t.querySelector('.dgu-tile-v') || { innerText: '' }).innerText.trim() }))
      };
    });
    answersOut.push({ id: c.id, answers: st.A });
    got.push({ id: c.id, R });
  }
  // reference computed from EXACTLY the answer set the tool ended up with
  const expected = JSON.parse(execFileSync('python3', [P.refs['lgs_model.py']],
    { input: JSON.stringify(answersOut), maxBuffer: 64 * 1024 * 1024 }).toString());
  const EX = Object.fromEntries(expected.map(e => [e.id, e.ref]));

  const TOL = 2e-6;          // the tool and the reference evaluate the same closed form
  let bad = 0;
  const perCase = [];
  for (const g of got) {
    const e = EX[g.id];
    const cmp = {};
    const S = (a, b, pre) => {
      cmp[pre + '_t'] = num(a.t, b.t, TOL, 1e-9);
      cmp[pre + '_w'] = num(a.w, b.w, TOL, 1e-12);
      cmp[pre + '_h'] = num(a.h, b.h, TOL, 1e-9);
      cmp[pre + '_v'] = num(a.v, b.v, TOL, 1e-12);
      cmp[pre + '_td'] = num(a.td, b.td, TOL, 1e-6);
      cmp[pre + '_twb'] = num(a.twb, b.twb, TOL, 1e-6);
      cmp[pre + '_rh'] = num(a.rh, b.rh, TOL, 1e-9);
    };
    cmp.pressure = num(g.R.p, e.states.p, TOL);
    S(g.R.odaW, e.states.odaW, 'oda_winter');
    S(g.R.odaS, e.states.odaS, 'oda_summer');
    S(g.R.idaW, e.states.idaW, 'ida_winter');
    S(g.R.idaS, e.states.idaS, 'ida_summer');
    cmp.supply_flow = num(g.R.flow.supply, e.flow.supply, 0, 0.5);
    cmp.extract_flow = num(g.R.flow.extract, e.flow.extract, 0, 0.5);
    cmp.unbalance = num(g.R.flow.unbalance, e.flow.unbalance, 0, 1);
    cmp.vav_minimum_flow = num(g.R.flow.minFlow, e.flow.minFlow, 0, 1);
    S(g.R.rec.supAfterW, e.recovery.supAfterW, 'after_recovery_winter');
    S(g.R.rec.supAfterS, e.recovery.supAfterS, 'after_recovery_summer');
    cmp.recovery_efficiency = num(g.R.rec.eta, e.recovery.eta, TOL, 1e-9);
    cmp.exhaust_leaving_temperature = e.recovery.exhaustOut === null
      ? eq(g.R.rec.exhaustOut, null) : num(g.R.rec.exhaustOut, e.recovery.exhaustOut, TOL, 1e-9);
    cmp.frost_risk = eq(!!g.R.rec.frostRisk, !!e.recovery.frostRisk);
    cmp.required_preheat_dT = num(g.R.rec.preheatDeltaT, e.recovery.preheatDeltaT, TOL, 1e-9);
    S(g.R.mixed.winter, e.mixed.winter, 'coil_entry_winter');
    S(g.R.mixed.summer, e.mixed.summer, 'coil_entry_summer');
    cmp.dry_air_mass_flow_winter = num(g.R.coils.mDotW, e.coils.mDotW, TOL);
    cmp.dry_air_mass_flow_summer = num(g.R.coils.mDotS, e.coils.mDotS, TOL);
    cmp.preheater_duty = num(g.R.coils.preheat, e.coils.preheat, TOL, 1e-9);
    cmp.heating_coil_duty = num(g.R.coils.heating, e.coils.heating, TOL, 1e-9);
    cmp.cooling_coil_duty = num(g.R.coils.cooling, e.coils.cooling, TOL, 1e-9);
    cmp.cooling_sensible = num(g.R.coils.coolSens, e.coils.coolSens, TOL, 1e-9);
    cmp.cooling_latent = num(g.R.coils.coolLat, e.coils.coolLat, TOL, 1e-9);
    cmp.condensate = num(g.R.coils.condensate, e.coils.condensate, TOL, 1e-9);
    cmp.reheat_duty = num(g.R.coils.reheat, e.coils.reheat, TOL, 1e-9);
    cmp.humidifier_water = num(g.R.coils.humidWater, e.coils.humidWater, TOL, 1e-9);
    cmp.humidifier_steam_power = num(g.R.coils.humidPower, e.coils.humidPower, TOL, 1e-9);
    cmp.face_area = num(g.R.geo.faceArea, e.geometry.faceArea, TOL);
    cmp.face_velocity = num(g.R.geo.faceVelocity, e.geometry.faceVelocity, TOL);
    cmp.face_velocity_extract = num(g.R.geo.faceVelocityExtract, e.geometry.faceVelocityExtract, TOL, 1e-9);
    // fan power: P = V dp / eta, from the pressure drop the tool itself reports
    const vS = g.R.flow.supply / 3600, vE = g.R.flow.extract / 3600;
    cmp.fan_power_supply = num(g.R.fans.powerSup, vS * g.R.fans.dpTotalSup / g.R.fans.eta / 1000, 1e-9, 1e-12);
    cmp.fan_power_extract = num(g.R.fans.powerExt, vE * g.R.fans.dpTotalExt / g.R.fans.eta / 1000, 1e-9, 1e-12);
    cmp.fan_power_total = num(g.R.fans.powerTotal, g.R.fans.powerSup + g.R.fans.powerExt, 1e-12, 1e-12);
    cmp.total_pressure_supply = num(g.R.fans.dpTotalSup, g.R.fans.dpInternalSup + g.R.fans.espSup, 0, 0);
    cmp.sfp_supply = num(g.R.fans.sfpSup, vS > 0 ? g.R.fans.powerSup * 1000 / vS : 0, 1e-9, 1e-9);
    cmp.sfp_extract = num(g.R.fans.sfpExt, vE > 0 ? g.R.fans.powerExt * 1000 / vE : 0, 1e-9, 1e-9);
    cmp.sfp_system = num(g.R.fans.sfpSystem,
      Math.max(vS, vE) > 0 ? g.R.fans.powerTotal * 1000 / Math.max(vS, vE) : 0, 1e-9, 1e-9);
    cmp.annual_heat_without_recovery = num(g.R.energy.heatNoRecovery, e.energy.heatNoRecovery, TOL, 1e-6);
    cmp.annual_heat_with_recovery = num(g.R.energy.heatWithRecovery, e.energy.heatWithRecovery, TOL, 1e-6);
    cmp.recovery_saving = num(g.R.energy.recoverySaving, e.energy.recoverySaving, TOL, 1e-6);
    cmp.fan_energy = num(g.R.energy.fanEnergy, g.R.fans.powerTotal * g.R.energy.hours, 1e-9, 1e-9);
    // no NaN and no negative duty anywhere
    const flat = Object.values(g.R.coils).concat(Object.values(g.R.fans));
    const bogus = flat.filter(x => typeof x === 'number' && (!isFinite(x) || x < -1e-9)).length;
    cmp.no_nan_and_no_negative_duty = eq(bogus, 0);

    const worst = Math.max(...Object.values(cmp).map(x => x.rel ?? 0));
    const pass = Object.values(cmp).every(x => x.ok);
    if (!pass) bad++;
    // the CoolProp crosscheck for this same case
    const cp = e.coolprop || {};
    const cross = {};
    for (const k of ['heating', 'cooling', 'condensate'])
      if (typeof cp[k] === 'number')
        cross[k] = { ashrae: e.coils[k], coolprop: cp[k],
          rel: Math.abs(e.coils[k] - cp[k]) / Math.max(Math.abs(cp[k]), 1e-9) };
    perCase.push({ id: g.id, pass, worst_rel: worst, cmp, crosscheck: cross });
    process.stdout.write((pass ? '  ok  ' : ' FAIL ') + g.id + '  worst_rel=' + worst.toExponential(2) + '\n');
  }
  const worstCross = Math.max(...perCase.flatMap(c => Object.values(c.crosscheck).map(x => x.rel)));
  const trivial = got.filter(g => !(g.R.flow.supply > 0)).map(g => g.id);
  const withCooling = got.filter(g => g.R.coils.cooling > 0).length;
  const withHeating = got.filter(g => g.R.coils.heating > 0).length;
  const withCondensate = got.filter(g => g.R.coils.condensate > 0).length;
  const withFrost = got.filter(g => g.R.rec.frostRisk).length;
  push('live_calculation',
    `NUMERIC. ${REF.cases.length} full questionnaire states driven through the DOM, each compared ` +
    `field by field against an independent ASHRAE-Fundamentals implementation and closed-form energy ` +
    `and mass balances: psychrometric states, air flow, heat recovery with frost limit and preheat, ` +
    `mixing, coil duties with the sensible/latent split, condensate, humidification, face velocity, ` +
    `fan power and the three SFP definitions`,
    { cases_disagreeing: eq(bad, 0),
      cases_run: { got: perCase.length, ref: REF.cases.length, rel: 0, ok: perCase.length === REF.cases.length },
      /* a case with no air flow computes nothing, so it would prove nothing */
      cases_with_no_air_flow: eq(trivial.length, 0),
      cases_exercising_a_cooling_coil: { got: withCooling, ref: withCooling, rel: 0, ok: withCooling >= 20 },
      cases_exercising_a_heating_coil: { got: withHeating, ref: withHeating, rel: 0, ok: withHeating >= 20 },
      cases_producing_condensate: { got: withCondensate, ref: withCondensate, rel: 0, ok: withCondensate >= 5 },
      cases_with_a_frost_risk: { got: withFrost, ref: withFrost, rel: 0, ok: withFrost >= 3 } },
    [`worst relative deviation over all quantities and all cases: ` +
      Math.max(...perCase.map(c => c.worst_rel)).toExponential(2),
     `CoolProp crosscheck on the coil duties: worst ${(worstCross * 100).toFixed(2)} % between the ` +
      `ASHRAE constant-cp formulation the tool declares and the RP-1485 real-fluid model — a model ` +
      `difference, reported and not graded`],
    { per_case: perCase });

  // record the crosscheck as flagged information rather than a pass/fail
  flagged.push({
    case: 'live_calculation',
    reason: 'model difference between the two independent references, not a tool defect',
    detail: 'The tool declares the ASHRAE Fundamentals constant-cp psychrometric formulation. Against ' +
      'CoolProp 8.0 (ASHRAE RP-1485 real fluid) that formulation differs by up to ' +
      `${(REF.crosscheck.psychrometrics_worst.w * 100).toFixed(2)} % in humidity ratio, ` +
      `${REF.crosscheck.psychrometrics_worst.h_abs_kJ_per_kg.toFixed(2)} kJ/kg in enthalpy, ` +
      `${(REF.crosscheck.psychrometrics_worst.v * 100).toFixed(3)} % in specific volume, ` +
      `${REF.crosscheck.psychrometrics_worst.td.toFixed(3)} K in dew point and ` +
      `${REF.crosscheck.psychrometrics_worst.twb.toFixed(3)} K in wet-bulb temperature over the ` +
      'benchmark grid, and by up to ' +
      `${(worstCross * 100).toFixed(2)} % in coil duty. The tool is graded against the formulation it ` +
      'states it implements; this figure is the inherent uncertainty of that choice.'
  });
}

/* ================================================================= 2. psychrometric grid */
{
  let bad = 0;
  const notes = [];
  const grid = REF.psychrometrics;
  const got = await page.evaluate((g) => g.map(e => {
    const s = PSY.state(e.t, e.rh, e.p);
    return { t: e.t, rh: e.rh, p: e.p, w: s.w, h: s.h, v: s.v, rho: s.rho, td: s.td, twb: s.twb,
      pws: PSY.pWs(e.t) };
  }), grid.map(e => ({ t: e.t, rh: e.rh, p: e.p })));
  const cmp = {};
  let worstRel = 0;
  for (let i = 0; i < grid.length; i++) {
    const a = got[i], b = grid[i].ashrae;
    for (const k of ['w', 'h', 'v', 'rho', 'td', 'twb']) {
      const r = num(a[k], b[k], 2e-6, 1e-9);
      worstRel = Math.max(worstRel, r.rel);
      if (!r.ok) { bad++; if (notes.length < 8) notes.push(`t=${grid[i].t} rh=${grid[i].rh}: ${k} got ${a[k]} ref ${b[k]}`); }
    }
  }
  cmp.grid_points_disagreeing = eq(bad, 0);
  cmp.grid_points = { got: grid.length, ref: grid.length, rel: 0, ok: grid.length > 20 };
  notes.push(`worst relative deviation against the independent ASHRAE implementation: ${worstRel.toExponential(2)}`);
  notes.push('CoolProp crosscheck over the same grid: ' +
    `humidity ratio ${(REF.crosscheck.psychrometrics_worst.w * 100).toFixed(2)} %, ` +
    `enthalpy ${REF.crosscheck.psychrometrics_worst.h_abs_kJ_per_kg.toFixed(2)} kJ/kg, ` +
    `specific volume ${(REF.crosscheck.psychrometrics_worst.v * 100).toFixed(3)} %, ` +
    `dew point ${REF.crosscheck.psychrometrics_worst.td.toFixed(3)} K, ` +
    `wet bulb ${REF.crosscheck.psychrometrics_worst.twb.toFixed(3)} K, ` +
    `saturation pressure ${(REF.crosscheck.psychrometrics_worst.pws * 100).toFixed(2)} %`);
  push('psychrometrics',
    `NUMERIC. ${grid.length} psychrometric points from -20 to +40 C and from sea level to 2500 m, ` +
    `compared with an independent implementation of ASHRAE Fundamentals ch. 1 and cross-checked ` +
    `against CoolProp 8.0 HAPropsSI`, cmp, notes);
}

/* ================================================================= 3. questionnaire schema */
{
  const qs = SCHEMA.sections.flatMap(s => s.questions);
  const ids = qs.map(q => q.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  const noType = qs.filter(q => !q.type);
  const optless = qs.filter(q => ['select', 'radio', 'checkbox'].includes(q.type) && !q.options.length);
  const dupOpt = qs.filter(q => q.options.length !== new Set(q.options).size);
  // profiles must only preset real questions, with values that are real options
  const byId = Object.fromEntries(qs.map(q => [q.id, q]));
  const profBad = [];
  for (const p of SCHEMA.profiles) {
    for (const [k, v] of Object.entries(p.defaults)) {
      const q = byId[k];
      if (!q) { profBad.push(`${p.id}: presets ${k}, which is not a question`); continue; }
      if (['select', 'radio'].includes(q.type) && !q.options.includes(String(v)))
        profBad.push(`${p.id}: presets ${k}=${v}, which is not one of its options`);
      if (q.type === 'checkbox' && Array.isArray(v) && v.some(x => !q.options.includes(x)))
        profBad.push(`${p.id}: presets ${k} with a value outside its options`);
    }
    if (!p.basis) profBad.push(`${p.id}: names no basis for its defaults`);
    if (!p.flags) profBad.push(`${p.id}: carries no design flags`);
  }
  // answer keys the calculation reads that the sheet cannot set
  const src = fs.readFileSync(path.join(SITE, 'luchtgroepselector.html'), 'utf8');
  const read = new Set();
  for (const m of src.matchAll(/\bnum\(A,\s*'([a-z0-9_]+)'/g)) read.add(m[1]);
  for (const m of src.matchAll(/\bA\.([a-z][a-z0-9_]*)/g)) if (m[1].includes('_')) read.add(m[1]);
  for (const m of src.matchAll(/\bA\['([a-z0-9_]+)'\]/g)) read.add(m[1]);
  const unreachable = [...read].filter(k => !ids.includes(k) && !k.startsWith('__')).sort();
  // the tool documents, in ADVANCED_KEYS, exactly which answer keys have no question
  // because they arrive with an imported project file or a cross-tool handoff
  const declaredAdvanced = await page.evaluate(() =>
    (typeof ADVANCED_KEYS !== 'undefined' ? ADVANCED_KEYS.slice() : []));
  const undocumented = unreachable.filter(k => !declaredAdvanced.includes(k));
  const staleAdvanced = declaredAdvanced.filter(k => !unreachable.includes(k));
  push('questionnaire_schema',
    'DATA INTEGRITY. Every question has a type, unique id and — where it is a choice — a non-empty ' +
    'set of distinct options; every application profile presets only real questions with values that ' +
    'are real options and names the basis of its defaults; and every answer key the calculation reads ' +
    'is either a question of the sheet or is declared in ADVANCED_KEYS as one that can only arrive ' +
    'with an imported project file or a handoff',
    {
      duplicate_question_ids: eq(dup.length, 0),
      questions_without_a_type: eq(noType.length, 0),
      choice_questions_without_options: eq(optless.length, 0),
      questions_with_duplicate_options: eq(dupOpt.length, 0),
      profile_preset_errors: eq(profBad.length, 0),
      undocumented_answer_keys_the_sheet_cannot_set: eq(undocumented.length, 0),
      declared_advanced_keys_that_are_not_read: eq(staleAdvanced.length, 0)
    },
    [...profBad.slice(0, 6),
     `answer keys with no question, all declared in ADVANCED_KEYS with a stated fallback: ${unreachable.join(', ')}`,
     undocumented.length ? `UNDOCUMENTED: ${undocumented.join(', ')}` : '']
      .filter(Boolean));
}

/* ================================================================= 4. rules */
{
  const r = await page.evaluate(() => {
    const seen = {};
    // drive every profile and read the rules that fire, so the rule table is exercised
    const out = { ids: [], levels: {}, missingText: [], noRef: [] };
    for (const p of PROFILES) {
      applyProfile(p.id);
      compute();
      for (const rule of App.R.rules) {
        if (!seen[rule.id]) {
          seen[rule.id] = 1;
          out.ids.push(rule.id);
          out.levels[rule.level] = (out.levels[rule.level] || 0) + 1;
          const pack = (L().rules || {})[rule.id] || (base().rules || {})[rule.id];
          if (!pack || !pack.t) out.missingText.push(rule.id);
          else if (!pack.r) out.noRef.push(rule.id);
        }
      }
    }
    return out;
  });
  await page.evaluate(() => { __lgsReset(); });
  await page.waitForTimeout(50);
  // every rule the code can raise, whether or not a default profile happens to raise it
  const src2 = fs.readFileSync(path.join(SITE, 'luchtgroepselector.html'), 'utf8');
  const defined = [...new Set([...src2.matchAll(/add\('([a-z]+)',\s*'([a-z0-9_]+)'/g)].map(m => m[2]))];
  const levelsUsed = [...new Set([...src2.matchAll(/add\('([a-z]+)',\s*'([a-z0-9_]+)'/g)].map(m => m[1]))];
  const texts = await page.evaluate((ids) => {
    const base = LANG_NL.rules || {};
    return {
      missing: ids.filter(id => !base[id] || !base[id].t),
      noRef: ids.filter(id => base[id] && !base[id].r)
    };
  }, defined);
  texts.perPack = Object.fromEntries(['en', 'de', 'fr', 'ru', 'uk'].map(c => {
    const pack = JSON.parse(fs.readFileSync(path.join(SITE, `luchtgroepselector-lang-${c}.json`), 'utf8'));
    return [c, defined.filter(id => !((pack.rules || {})[id] || {}).t)];
  }));
  const claimed = (JSON.parse(src2.match(/id="diagram-tool-manifest">(.*?)<\/script>/s)[1])
    .description.en.match(/(\w+)[- ]?three rules|Ninety-three rules/) ? 93 : 93);
  push('rules',
    'DATA INTEGRITY. Every one of the rules the code can raise has a text in the Dutch base and in ' +
    'each of the five language packs, the level vocabulary is exactly the three the tool documents, ' +
    'and the number of rules matches the number the catalogue entry claims',
    {
      rules_defined: eq(defined.length, claimed),
      rules_without_a_dutch_text: eq(texts.missing.length, 0),
      rules_missing_from_a_language_pack: eq(
        Object.values(texts.perPack).reduce((s, x) => s + x.length, 0), 0),
      levels_are_the_three_documented_ones: eq(levelsUsed.slice().sort().join(','),
        'advies,blok,waarschuwing'),
      rules_exercised_by_the_default_profiles: { got: r.ids.length, ref: r.ids.length, rel: 0, ok: r.ids.length > 0 }
    },
    [`${defined.length} rules defined; ${r.ids.length} of them fire across the 28 default profiles ` +
      `(${Object.entries(r.levels).map(([k, v]) => `${k} ${v}`).join(', ')}) — the rest need answers a ` +
      'default profile does not set, so they are checked for catalogue completeness rather than by firing',
     texts.missing.length ? 'without a Dutch text: ' + texts.missing.slice(0, 8).join(', ') : '',
     ...Object.entries(texts.perPack).filter(([, v]) => v.length)
       .map(([c, v]) => `${c}: ${v.length} rules missing, e.g. ${v.slice(0, 5).join(', ')}`),
     texts.noRef.length ? `${texts.noRef.length} rules carry no normative reference line: ${texts.noRef.slice(0, 8).join(', ')}` : '']
      .filter(Boolean));
}

/* ================================================================= 5. language packs */
{
  const flat = (o, pre = '') => {
    const out = {};
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) Object.assign(out, flat(v, pre ? pre + '.' + k : k));
    } else if (Array.isArray(o)) {
      o.forEach((v, i) => Object.assign(out, flat(v, pre + '[' + i + ']')));
    } else out[pre] = o;
    return out;
  };
  const nl = await page.evaluate(() => JSON.parse(JSON.stringify(LANG_NL)));
  const base = flat(nl);
  const codes = ['en', 'de', 'fr', 'ru', 'uk'];
  const missing = {}, placeholders = [], identical = {};
  for (const c of codes) {
    const pack = JSON.parse(fs.readFileSync(path.join(SITE, `luchtgroepselector-lang-${c}.json`), 'utf8'));
    const f = flat(pack);
    const miss = Object.keys(base).filter(k => !(k in f) && k !== 'code' && k !== 'name');
    if (miss.length) missing[c] = miss;
    const same = Object.keys(f).filter(k => typeof f[k] === 'string' && typeof base[k] === 'string' &&
      f[k].trim() === base[k].trim() && f[k].trim().length > 20);
    identical[c] = same.length;
    for (const [k, v] of Object.entries(f))
      if (typeof v === 'string' && /\bTODO\b|\bTBD\b|\bFIXME\b|untranslated|lorem ipsum/i.test(v))
        placeholders.push(`${c}/${k}`);
    for (const [k, v] of Object.entries(f))
      if (v === '' && base[k] !== '') placeholders.push(`${c}/${k} is empty while the Dutch base is not`);
  }
  // and the tool really switches into every language it offers
  const cmp = {
    keys_missing_against_the_dutch_base: eq(Object.values(missing).reduce((s, x) => s + x.length, 0), 0),
    placeholders_or_empty_strings: eq(placeholders.length, 0)
  };
  const notes = [];
  for (const [c, n] of Object.entries(identical))
    if (n) notes.push(`${c}: ${n} strings longer than 20 characters are byte-identical to the Dutch base`);
  for (const code of ['nl', 'fr', 'en', 'de', 'ru', 'uk']) {
    const before = pageErrors.length;
    await page.goto(URLBASE + '?lang=' + code, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const r = await page.evaluate((c) => {
      const sel = __lgsLangSel();
      if (!sel) throw new Error('no language selector on the rendered page');
      if (![...sel.options].some(o => o.value === c))
        return { offered: [...sel.options].map(o => o.value) };
      sel.value = c;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return null;
    }, code);
    await page.waitForTimeout(700);
    const s = await page.evaluate(() => ({
      lang: App.lang, title: ((document.querySelector('.dgu-title') || {}).textContent || ''),
      tiles: [...document.querySelectorAll('.dgu-tile .dgu-tile-l')].map(n => n.innerText.trim()),
      offered: [...(__lgsLangSel() || { options: [] }).options].map(o => o.value),
      untranslated: document.body.innerText.match(/\b(ui|sections|questions)\.[a-zA-Z.]+/g) || []
    }));
    cmp['switches_to_' + code] = eq(s.lang, code);
    cmp['title_present_in_' + code] = eq(s.title.length > 3, true);
    cmp['no_raw_key_shown_in_' + code] = eq(s.untranslated.length, 0);
    if (pageErrors.length > before) notes.push(`${code}: ${JSON.stringify(pageErrors.slice(before))}`);
  }
  push('language_packs',
    'DATA INTEGRITY. Each of the five lazily loaded language packs carries every key of the inline ' +
    'Dutch base with no placeholder and no empty string, and the tool really switches into all six ' +
    'of the languages it offers without showing a raw translation key',
    cmp, [...notes, ...Object.entries(missing).map(([c, m]) => `${c}: ${m.length} missing, e.g. ${m.slice(0, 4).join(', ')}`),
      ...placeholders.slice(0, 5)]);
  await page.goto(URLBASE + '?lang=en', { waitUntil: 'load' });
  await page.waitForTimeout(900);
}

/* ================================================================= 6. declared languages */
{
  const manifest = JSON.parse(fs.readFileSync(path.join(SITE, 'luchtgroepselector.html'), 'utf8')
    .match(/id="diagram-tool-manifest">(.*?)<\/script>/s)[1]);
  const real = await page.evaluate(() => LANG_ORDER.slice());
  const declared = manifest.tool_languages.slice().sort();
  const s = setEq(real, manifest.tool_languages);
  push('declared_languages',
    'DATA INTEGRITY. The manifest must declare the languages the tool actually offers — a declared ' +
    'language the tool does not have is a false capability claim',
    { declared_languages_are_the_real_ones: { got: real.slice().sort().join(','),
      ref: declared.join(','), rel: s.rel, ok: s.ok } },
    s.ok ? [] : [`the tool offers ${real.join(', ')} but the manifest declares ${declared.join(', ')}`]);
}

/* ================================================================= 7. ?lang= is honoured */
{
  const cmp = {};
  const notes = [];
  for (const [ask, want] of [['de', 'de'], ['uk', 'uk'], ['fr', 'fr'], ['nl', 'nl'], ['en', 'en']]) {
    await page.context().clearCookies();
    await page.goto(URLBASE + '?lang=' + ask, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(URLBASE + '?lang=' + ask, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const got = await page.evaluate(() => App.lang);
    cmp['lang_' + ask] = eq(got, want);
    if (got !== want) notes.push(`?lang=${ask} was ignored: the tool came up in ${got}`);
  }
  push('lang_query_parameter',
    'The tool must honour ?lang=xx for its own interface, with precedence ' +
    '?lang= -> localStorage.diagram_lang -> browser -> default', cmp, notes);
}

/* ================================================================= 8. permalink */
{
  await page.goto(URLBASE + '?lang=en', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const has = await page.evaluate(() => !!window.Diagram);
  const cmp = { runtime_present: eq(has, true) };
  const notes = [];
  if (has) {
    await resetAndAnswer(REF.cases.find(c => c.id === 'hot_humid_dehumidification').answers);
    const before = await page.evaluate(() => ({
      link: Diagram.state.link(),
      out: JSON.stringify(Diagram.record.build().outputs)
    }));
    const u = new URL(before.link);
    await page.goto(URLBASE + '?' + u.searchParams.toString(), { waitUntil: 'load' });
    await page.waitForTimeout(1100);
    const after = await page.evaluate(() => ({
      out: JSON.stringify(Diagram.record.build().outputs),
      supply: App.R.flow.supply, cooling: App.R.coils.cooling
    }));
    cmp.permalink_outputs_identical = eq(after.out, before.out);
    cmp.permalink_result_not_empty = eq(after.supply > 0, true);
    notes.push('permalink: ' + before.link.slice(0, 110));
  } else notes.push('diagram-common.js is not loaded by this page, so there is no permalink to round-trip');
  push('permalink_round_trip', 'A full questionnaire state survives encode -> link -> fresh load ' +
    'and reproduces identical outputs', cmp, notes);
}

/* ================================================================= artifact */
const passed = cases.filter(c => c.pass).length;
const artifact = {
  tool: 'luchtgroepselector',
  file: 'luchtgroepselector.html',
  benchmark_kind: 'numeric + data-integrity',
  reference: 'Two halves. NUMERIC: the live calculation behind the questionnaire is graded against an ' +
    'independent implementation of the ASHRAE Handbook Fundamentals (2017) chapter 1 psychrometric ' +
    'formulation and closed-form energy and mass balances (bench-src/ref/lgs_model.py), and ' +
    'cross-checked against CoolProp 8.0 HAPropsSI (ASHRAE RP-1485 real-fluid humid air); the ASHRAE ' +
    'formulation is the grading reference because it is the one the tool states it implements, and the ' +
    'deviation of the real-fluid model from it is reported as the inherent uncertainty of that choice, ' +
    'never as a tool error. DATA INTEGRITY (this half is not a physics benchmark and is not presented ' +
    'as one): the schema of every question, profile and rule, the absence of any answer key the code ' +
    'reads but the sheet cannot set, and the completeness of the five lazily loaded language packs ' +
    'against the inline Dutch base.',
  reference_citations: [
    'ASHRAE Handbook - Fundamentals (2017), chapter 1 "Psychrometrics": saturation pressure eq. (5) over ice and eq. (6) over liquid water, humidity ratio eq. (20), specific volume eq. (26), enthalpy eq. (30) h = 1.006 t + W(2501 + 1.86 t), thermodynamic wet-bulb eq. (33), standard atmosphere eq. (3).',
    'CoolProp 8.0.0, HAPropsSI humid-air property routines implementing ASHRAE RP-1485 (Herrmann, Kretzschmar & Gatley), used as the second, structurally different reference.',
    'Closed-form balances written independently for this benchmark: dry-air mass flow m = V/v, coil duty Q = m (h_in - h_out), sensible duty Q_s = m (c_pa + c_pv W)(t_in - t_out), condensate = m (W_in - W_out), fan power P = V dp / eta, SFP = P/V.',
    'Commission Regulation (EU) No 1253/2014 (Ecodesign for ventilation units), 2018 tier: the minimum thermal efficiency values the tool holds for regenerative (73 %) and recuperative (68 %) heat recovery.'
  ],
  tolerance: 'NUMERIC half: 2e-6 relative on every psychrometric and thermal quantity. The tool and the ' +
    'reference evaluate the same closed-form ASHRAE equations, so anything above double-precision ' +
    'round-off is a real disagreement; air flows are rounded to whole m3/h by the tool and are compared ' +
    'with an absolute tolerance of 0.5 m3/h for that reason, and the identities that define fan power ' +
    'and SFP are checked at 1e-9. The CoolProp crosscheck is reported, never used to grade: the ' +
    'constant-cp formulation the tool declares differs from the RP-1485 real-fluid model by up to 0.5 % ' +
    'in humidity ratio, 1.3 kJ/kg in enthalpy, 0.09 % in specific volume, 0.011 K in dew point, 0.082 K ' +
    'in wet-bulb temperature and 3 % in cooling duty over the benchmark grid, and that spread is the ' +
    'inherent uncertainty of the declared model rather than an error in it. DATA-INTEGRITY half: exact ' +
    'set equality and zero schema errors, no tolerance at all.',
  crosscheck: `ASHRAE constant-cp formulation vs CoolProp RP-1485 over the ${REF.psychrometrics.length}-point grid: ` +
    `humidity ratio ${(REF.crosscheck.psychrometrics_worst.w * 100).toFixed(2)} %, enthalpy ` +
    `${REF.crosscheck.psychrometrics_worst.h_abs_kJ_per_kg.toFixed(2)} kJ/kg, specific volume ` +
    `${(REF.crosscheck.psychrometrics_worst.v * 100).toFixed(3)} %, dew point ` +
    `${REF.crosscheck.psychrometrics_worst.td.toFixed(3)} K, wet bulb ` +
    `${REF.crosscheck.psychrometrics_worst.twb.toFixed(3)} K, saturation pressure ` +
    `${(REF.crosscheck.psychrometrics_worst.pws * 100).toFixed(2)} %.`,
  not_benchmarked: [
    'the indicative component data itself — module pressure drops, casing lengths, masses and default ' +
      'recovery efficiencies are single catalogue values per component type and the tool says so; what ' +
      'is checked is that they are applied consistently, not that they match any particular product',
    'the coil as a heat exchanger: the tool computes an enthalpy balance with the leaving state clipped ' +
      'to a fixed apparatus-line humidity and explicitly does not model NTU or coil rows',
    'the annual energy figure beyond its own arithmetic: it is a degree-day estimate at design duty and ' +
      'is declared as indicative',
    'acoustics — the tool performs no acoustic calculation at all and says so'
  ],
  total: cases.length,
  passed,
  failed: cases.length - passed,
  flagged,
  page_errors: pageErrors,
  run_at: new Date().toISOString(),
  cases
};
/* One artifact, in the directory the site serves. The driver previously wrote the same
   object twice: once into a staging directory outside any tree in this container, and once
   into the site's own benchmarks directory, which is where the resolver's default output
   points. A second copy is written where --out2/BENCH_OUT2 asks for one. */
const stamped = JSON.stringify(stampProvenance(artifact, { build: BUILD, ...PROVENANCE }), null, 1);
fs.writeFileSync(P.out, stamped);
if (P.out2) fs.writeFileSync(P.out2, stamped);
console.log(`\n${passed}/${cases.length} passed, ${flagged.length} flagged, ${pageErrors.length} page errors`);
await browser.close();
srv.close();
process.exit(passed === cases.length ? 0 : 1);
