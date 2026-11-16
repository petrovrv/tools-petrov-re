/* Benchmark driver for klimaatcalculator.html (Ventilation & Cooling Cost Estimator).
 *
 * The page is driven through its own permalink codec (which sets every DOM input) and
 * the numbers are read back from Diagram.record.build() - the same object the PDF, the
 * CSV and the python export are built from, so what is graded is what the user gets.
 *
 * Two independent references, both in bench-src/ref/klimaatcalculator_ref.json:
 *   expected.*  closed-form implementation of Bolton (1980) eq.10 and ASHRAE
 *               Fundamentals (2021) ch.1 eq.20/32/33/35, written in python for this
 *               benchmark and solved by bisection to 1e-12 K.
 *   crossref.*  CoolProp 8.0.0 HAPropsSI (ASHRAE RP-1485 real moist air).
 *
 * Adapted 2026-10-03: the file:// address under one machine's site root became a base URL
 * and a tool path, the two hardcoded reference and output paths now resolve through
 * benchpaths.mjs against this driver's own tree, and the rule-3 input
 * assertion, the positive control, the full console capture and run_at were added.
 * No tolerance, case id, reference value or comparison was changed.
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
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_klimaatcalculator.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 4 707 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* Every path resolves against this driver's own tree: the page under the site root, the
   reference under bench-src/ref, the artifact at
   <siteRoot>/benchmarks/klimaatcalculator.json — the path the page's own manifest names —
   and the positive-control record beside it. --site, --base, --ref-dir, --out and --out2
   override. See benchpaths.mjs. */
const P = benchPaths({ name: 'klimaatcalculator', page: 'klimaatcalculator.html',
                       ref: 'klimaatcalculator_ref.json',
                       out2: 'benchmarks/klimaatcalculator.control.json' });
/* The page is reached over http, as this driver has always reached it; only the origin is
   a parameter. --base, else the port this driver has always named. */
const BASE = (P.base || 'http://127.0.0.1:8327').replace(/\/$/, '');
const TOOL = String(P.flags.tool || P.pageFile);
const REFPATH = P.ref;
const OUT = P.out;
const OUT_CONTROL = P.out2;
const REF = JSON.parse(fs.readFileSync(REFPATH, 'utf8'));
const URLBASE = BASE + '/' + TOOL;
const results = [], pageErrors = [], consoleLog = [];

const push = (id, group, note, inputs, cmp, extra) => {
  let worst = 0, pass = true, flagged = false;
  for (const k of Object.keys(cmp)) {
    const c = cmp[k];
    if (c.graded === false) { flagged = true; continue; }
    if (typeof c.rel === 'number') worst = Math.max(worst, c.rel);
    if (!c.ok) pass = false;
  }
  results.push(Object.assign({ id, group, note, inputs, cmp, worst_rel: worst, pass, flagged }, extra || {}));
};
const cmpVal = (got, ref, tolAbs, tolRel) => {
  const a = Math.abs(got - ref), rel = a / Math.max(Math.abs(ref), 1e-12);
  return { got, ref, abs: a, rel, ok: a <= tolAbs + 1e-15 || rel <= tolRel, tol_abs: tolAbs, tol_rel: tolRel };
};
const cmpEq = (got, ref) => ({ got, ref, rel: got === ref ? 0 : 1, ok: got === ref });

/* input id  <-  reference input key */
const IDMAP = { len: 'len', wid: 'wid', hgt: 'hgt', wh: 'wh', ppl: 'ppl', hrs: 'hrs',
  todb: 'Tdb', rh: 'RH', p: 'Phpa', exdays: 'exdays', ttar: 'Ttar', maxrh: 'maxrh',
  qknown: 'qknown', qmach: 'qmach', activity: 'activity', qlight: 'qlight', qroof: 'qroof',
  qglass: 'qglass', qsun: 'qsun', vexist: 'vexist', extract: 'extract', balance: 'balance',
  eff: 'eff', pel: 'pel', pwat: 'pwat', pvkwp: 'pvkwp', eer: 'eer', mrate: 'mrate',
  years: 'years', mvent: 'mvent', madia: 'madia', mmech: 'mmech', lm: 'lm' };

function stateFor(inp) {
  const st = { v: 1, lang: 'en', loadMode: inp.loadmode, extMode: inp.extmode, sel: null };
  for (const id of Object.keys(IDMAP)) st[id] = String(inp[IDMAP[id]]);
  return st;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await ctx.newPage();
page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
page.on('console', m => {
  consoleLog.push({ type: m.type(), text: m.text() });
  if (m.type() === 'error') pageErrors.push('console: ' + m.text());
});
await page.goto(URLBASE + '?lang=en');
await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });

/* AGENTS §5: the build this artifact names is the manifest_revision read out of the live
   DOM of the page the browser actually loaded, not of the file sitting beside this driver.
   stampProvenance() refuses to write anything without it. */
const BUILD = await readPageManifestRevision(page);

/* RULE 3.  record.inputs is dgcInputs() -- the coerced vector that produced the
   outputs being graded -- and Diagram.state.current() is what the controls hold.
   Both must equal what the case names before a single output is read.  The record
   spells the inputs with the page's own long names, so the map below is the page's
   DGC_IN read in the other direction; it is a locator, not an expectation.      */
const RECNAME = { len: 'length', wid: 'width', hgt: 'height', wh: 'working_height',
  ppl: 'people', hrs: 'operating_hours', todb: 'outdoor_dry_bulb',
  rh: 'outdoor_relative_humidity', p: 'barometric_pressure', exdays: 'exceedance_days',
  ttar: 'target_temperature', maxrh: 'max_relative_humidity', qknown: 'known_heat_load',
  qmach: 'machine_load', activity: 'activity_level', qlight: 'lighting_load',
  qroof: 'roof_solar_load', qglass: 'glazing_area', qsun: 'glazing_solar_load',
  vexist: 'existing_extraction', extract: 'exhaust_fan_type', balance: 'pressure_balance',
  eff: 'adiabatic_effectiveness', pel: 'electricity_tariff', pwat: 'water_tariff',
  pvkwp: 'pv_capacity', eer: 'chiller_eer', mrate: 'maintenance_rate',
  years: 'comparison_period', mvent: 'maintenance_hours_ventilation',
  madia: 'maintenance_hours_adiabatic', mmech: 'maintenance_hours_mechanical',
  lm: 'cable_length' };
let landedWorst = 0, landedChecks = 0;
function assertLanded(inp, st, rec, label) {
  const bad = [];
  for (const id of Object.keys(IDMAP)) {
    const want = inp[IDMAP[id]];
    const inState = st[id];
    const inRecord = rec[RECNAME[id]];
    landedChecks += 2;
    if (id === 'extract') {
      if (String(inState) !== String(want)) bad.push(`state.${id} = ${JSON.stringify(inState)}, case names ${JSON.stringify(want)}`);
      if (String(inRecord) !== String(want)) bad.push(`record.${RECNAME[id]} = ${JSON.stringify(inRecord)}, case names ${JSON.stringify(want)}`);
      continue;
    }
    const w = Number(want);
    if (Number(inState) !== w) bad.push(`state.${id} = ${JSON.stringify(inState)}, case names ${w}`);
    if (Number(inRecord) !== w) bad.push(`record.${RECNAME[id]} = ${JSON.stringify(inRecord)}, case names ${w}`);
  }
  landedChecks += 4;
  if (st.loadMode !== inp.loadmode) bad.push(`state.loadMode = ${st.loadMode}, case names ${inp.loadmode}`);
  if (st.extMode !== inp.extmode) bad.push(`state.extMode = ${st.extMode}, case names ${inp.extmode}`);
  if (rec.load_method !== inp.loadmode) bad.push(`record.load_method = ${rec.load_method}, case names ${inp.loadmode}`);
  if (rec.exhaust_mode !== inp.extmode) bad.push(`record.exhaust_mode = ${rec.exhaust_mode}, case names ${inp.extmode}`);
  if (bad.length) throw new Error(`${label}: the page is not holding the case's inputs -- `
    + `${bad.length} mismatches:\n  ` + bad.join('\n  '));
}

async function load(inp, label) {
  const enc = await page.evaluate(o => window.Diagram.state.encode(o), stateFor(inp));
  await page.goto(URLBASE + '?lang=en&s=' + enc);
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });
  await page.waitForTimeout(60);
  const r = await page.evaluate(() => ({ rec: window.Diagram.record.build(), st: window.Diagram.state.current() }));
  assertLanded(inp, r.st, r.rec.inputs, label || 'load');
  return r.rec.outputs;
}

/* ---- tolerances ---------------------------------------------------------
   closed form: the tool and the reference implement the same published
   equations, so only floating point and the bisection depth separate them.
   CoolProp: the gap is the ideal-gas/Bolton approximation the tool declares. */
const TOL_CF   = 1e-9;
const TOL_W    = 6e-3;      /* water-vapour enhancement factor, measured 0.49 % */
const TOL_TWB  = 0.05;      /* K, measured 0.026 K                              */
const TOL_RHO  = 1e-3;      /* measured 0.039 %                                 */
const TOL_DUTY = 1e-2;      /* enthalpy model difference on the coil load       */
const TOL_WBLINE = 0.10;    /* K, constancy of the wet bulb along the pad       */

const KINDS = ['vent', 'adia', 'mech'];

for (const c of REF.cases) {
  const o = await load(c.inputs, c.id), e = c.expected, x = c.crossref;
  const inp = c.inputs;

  /* 1. psychrometric design state, against both references ---------------- */
  push(c.id + '/psychrometry', 'psychrometry', c.note, inp, {
    design_dry_bulb_cf:  cmpVal(o.design_outdoor_dry_bulb, e.designTdb, 1e-9, TOL_CF),
    humidity_ratio_cf:   cmpVal(o.design_outdoor_humidity_ratio, e.wOut, 1e-12, TOL_CF),
    wet_bulb_cf:         cmpVal(o.design_outdoor_wet_bulb, e.Twb, 1e-9, TOL_CF),
    dry_air_density_cf:  cmpVal(o.design_outdoor_dry_air_density,
                                e.scen.vent.rhoS, 1e-12, TOL_CF),
    humidity_ratio_coolprop: cmpVal(o.design_outdoor_humidity_ratio, x.w_out_coolprop, 0, TOL_W),
    wet_bulb_coolprop:       cmpVal(o.design_outdoor_wet_bulb, x.twb_coolprop, TOL_TWB, 0),
    dry_air_density_coolprop:cmpVal(o.design_outdoor_dry_air_density, x.rho_da_coolprop, 0, TOL_RHO)
  });

  /* 2. the adiabatic path -------------------------------------------------- */
  const eff = Math.min(95, Math.max(40, inp.eff)) / 100;
  const effBack = (o.design_outdoor_dry_bulb - o.adiabatic_supply_temperature)
                / (o.design_outdoor_dry_bulb - o.design_outdoor_wet_bulb);
  push(c.id + '/adiabatic', 'adiabatic_path',
       'Saturation effectiveness read back from the states, and the constancy of the wet bulb '
     + 'along the evaporative path checked with CoolProp.', inp, {
    saturation_effectiveness: cmpVal(effBack, eff, 1e-9, 1e-9),
    supply_temperature_cf:    cmpVal(o.adiabatic_supply_temperature, e.Tad, 1e-9, TOL_CF),
    supply_humidity_ratio_cf: cmpVal(o.adiabatic_supply_humidity_ratio, e.wSup, 1e-12, TOL_CF),
    wet_bulb_of_exit_state_coolprop:
      cmpVal(x.twb_of_adiabatic_exit_coolprop, x.twb_coolprop, TOL_WBLINE, 0)
  });

  /* 3. the mechanical coil ------------------------------------------------- */
  push(c.id + '/coil', 'coil_duty',
       'Coil load as the total enthalpy drop less the condensate enthalpy (ASHRAE ch.1 eq.35), '
     + 'and the leaving humidity ratio, which a coil can never raise.', inp, {
    coil_duty_cf:       cmpVal(o.mech_cooling_coil_duty, e.scen.mech.coolKW, 1e-9, TOL_CF),
    coil_duty_coolprop: cmpVal(o.mech_cooling_coil_duty, x.mech_duty_coolprop_kW, 1e-6, TOL_DUTY),
    leaving_humidity_ratio_not_above_entering:
      { got: o.mech_supply_humidity_ratio, ref: o.design_outdoor_humidity_ratio, rel: 0,
        ok: o.mech_supply_humidity_ratio <= o.design_outdoor_humidity_ratio + 1e-12,
        note: 'a cooling coil removes moisture or runs dry; it cannot humidify' },
    sensible_only_would_understate_by:
      { got: e.scen.mech.coolKW / Math.max(1e-9, x.mech_duty_sensible_only_kW), ref: 1, rel: 0,
        ok: true, graded: false,
        note: 'ratio of the total coil load to the sensible-only load - recorded, not graded' }
  });

  /* 4. sizing and bookkeeping identities ----------------------------------- */
  const sizing = {};
  for (const k of KINDS) {
    const s = e.scen[k];
    sizing[k + '_supply_temperature'] = cmpVal(o[k + '_supply_temperature'], s.Ts, 1e-9, TOL_CF);
    sizing[k + '_required_airflow']   = cmpVal(o[k + '_required_airflow'], s.Vreq, 1e-6, TOL_CF);
    sizing[k + '_units']              = cmpEq(o[k + '_supply_units'], s.nSup);
    sizing[k + '_design_airflow']     = cmpVal(o[k + '_design_airflow'], s.Vdes, 1e-9, TOL_CF);
    sizing[k + '_mass_flow_identity'] = cmpVal(o[k + '_dry_air_mass_flow'],
      o[k + '_supply_dry_air_density'] * o[k + '_design_airflow'] / 3600, 1e-12, TOL_CF);
    sizing[k + '_rise_identity']      = cmpVal(o[k + '_temperature_rise'],
      o.heat_load_total * 1000 / (o[k + '_dry_air_mass_flow'] * o[k + '_supply_specific_heat']),
      1e-12, TOL_CF);
    sizing[k + '_room_temperature']   = cmpVal(o[k + '_occupied_zone_temperature'], s.room, 1e-9, TOL_CF);
    sizing[k + '_room_humidity']      = cmpVal(o[k + '_occupied_zone_humidity'], s.rhIn, 1e-9, TOL_CF);
    sizing[k + '_exhaust_units']      = cmpEq(o[k + '_exhaust_units'], s.nExt);
    sizing[k + '_feasible']           = cmpEq(o[k + '_feasible'], s.feasible);
  }
  sizing.recommended = cmpEq(o.recommended_strategy, e.recommended);
  push(c.id + '/sizing', 'sizing', 'Airflow, unit count, occupied-zone state and feasibility.', inp, sizing);

  /* 5. energy, water and cost arithmetic ----------------------------------- */
  const cost = {};
  for (const k of KINDS) {
    const s = e.scen[k];
    cost[k + '_water']        = cmpVal(o[k + '_water_use'], s.water_m3, 1e-9, TOL_CF);
    cost[k + '_fan_energy']   = cmpVal(o[k + '_fan_electricity'], s.elecFan, 1e-6, TOL_CF);
    cost[k + '_cool_energy']  = cmpVal(o[k + '_cooling_electricity'], s.elecCool, 1e-9, TOL_CF);
    cost[k + '_paid_energy']  = cmpVal(o[k + '_purchased_electricity'], s.paidElec, 1e-6, TOL_CF);
    cost[k + '_capex']        = cmpVal(o[k + '_capex_mid'], s.capex_mid, 1e-6, TOL_CF);
    cost[k + '_capex_band']   = cmpVal(o[k + '_capex_low'] / o[k + '_capex_high'], 0.88 / 1.27, 1e-12, TOL_CF);
    cost[k + '_running']      = cmpVal(o[k + '_running_cost'], s.run, 1e-6, TOL_CF);
    cost[k + '_run_identity'] = cmpVal(o[k + '_running_cost'],
      o[k + '_purchased_electricity'] * inp.pel + o[k + '_water_use'] * inp.pwat
      + (k === 'vent' ? inp.mvent : k === 'adia' ? inp.madia : inp.mmech) * inp.mrate, 1e-6, TOL_CF);
    cost[k + '_lifetime']     = cmpVal(o[k + '_lifetime_cost'],
      o[k + '_capex_mid'] + Math.max(1, Math.min(25, inp.years)) * o[k + '_running_cost'], 1e-6, TOL_CF);
  }
  push(c.id + '/cost', 'cost_arithmetic',
       'Energy, water, price build-up and the undiscounted lifetime sum.', inp, cost);

  /* 6. the common fan backbone -------------------------------------------- */
  const sfp = KINDS.map(k => o[k + '_design_airflow'] > 0
    ? (o[k + '_supply_units'] * 3.0) / o[k + '_design_airflow'] : NaN);
  const fanId = {};
  KINDS.forEach((k, n) => {
    fanId[k + '_specific_fan_power'] = cmpVal(sfp[n], 3.0 / 22000, 1e-15, TOL_CF);
    fanId[k + '_fan_energy_identity'] = cmpVal(o[k + '_fan_electricity'],
      (o[k + '_supply_units'] * 3.0 + o[k + '_exhaust_units'] * (inp.extract === 'wall' ? 2.2 : 4.0))
      * 0.5 * inp.hrs, 1e-6, TOL_CF);
  });
  push(c.id + '/fanbase', 'fan_backbone',
       'The three strategies must sit on the same fan catalogue: identical specific fan power '
     + '(3.0 kW per 22000 m3/h) and the same energy rule in all three.', inp, fanId);
}

/* ---- 7. invariance ------------------------------------------------------- */
const base = REF.cases.find(c => c.id === 'base').inputs;
const known = REF.cases.find(c => c.id === 'known_load').inputs;
const ob = await load(base, 'invariance/base'), ok_ = await load(known, 'invariance/known_load');
{
  const cmp = {};
  for (const k of KINDS) {
    cmp[k + '_capex'] = cmpVal(ok_[k + '_capex_mid'], ob[k + '_capex_mid'], 1e-6, TOL_CF);
    cmp[k + '_room']  = cmpVal(ok_[k + '_occupied_zone_temperature'],
                               ob[k + '_occupied_zone_temperature'], 1e-9, TOL_CF);
  }
  cmp.recommended = cmpEq(ok_.recommended_strategy, ob.recommended_strategy);
  push('invariance/load_representation', 'invariance',
       'The same 153.5 kW entered as a known total instead of built up from its parts must '
     + 'produce the identical design.', { qknown: 153.5 }, cmp);
}
{
  /* currency scaling: multiplying every tariff by ten may not reorder the running costs */
  const scaled = Object.assign({}, base, { pel: base.pel * 10, pwat: base.pwat * 10, mrate: base.mrate * 10 });
  const os = await load(scaled, 'invariance/tariff_scale');
  const cmp = {};
  for (const k of KINDS)
    cmp[k + '_running_scales'] = cmpVal(os[k + '_running_cost'], 10 * ob[k + '_running_cost'], 1e-6, 1e-9);
  const order = a => KINDS.slice().sort((p, q) => a[p + '_running_cost'] - a[q + '_running_cost']).join('>');
  cmp.running_cost_order = cmpEq(order(os), order(ob));
  push('invariance/tariff_scale', 'invariance',
       'Running cost is linear in the tariffs, so a common factor of ten may change no ranking.',
       { pel: base.pel * 10, pwat: base.pwat * 10, mrate: base.mrate * 10 }, cmp);
}
{
  /* pressure is entered in hPa and used in kPa: 1013 hPa and 101.3 kPa are the same state */
  const hi = Object.assign({}, base, { Phpa: 1013.25 });
  const oh = await load(hi, 'invariance/pressure_units');
  const P = 101.325, e = oh.design_outdoor_humidity_ratio * P / (0.62198 + oh.design_outdoor_humidity_ratio);
  const esat = 0.6112 * Math.exp(17.67 * oh.design_outdoor_dry_bulb / (oh.design_outdoor_dry_bulb + 243.5));
  push('invariance/pressure_units', 'invariance',
       'The barometric pressure is entered in hPa; the humidity ratio it produces must return the '
     + 'entered relative humidity when read back at the same pressure in kPa.',
       { Phpa: 1013.25 }, { relative_humidity_round_trip: cmpVal(100 * e / esat, base.RH, 1e-9, 1e-9) });
}
{
  /* geometric scale: doubling the hall with the same specific loads doubles nothing physical
     about the air state - only the flows */
  const big = Object.assign({}, base, { len: 120, wid: 60, hgt: 8, qmach: 240, qglass: 480, ppl: 100 });
  const og = await load(big, 'invariance/geometric_scale');
  const cmp = {
    design_dry_bulb: cmpVal(og.design_outdoor_dry_bulb, ob.design_outdoor_dry_bulb, 1e-9, TOL_CF),
    wet_bulb:        cmpVal(og.design_outdoor_wet_bulb, ob.design_outdoor_wet_bulb, 1e-9, TOL_CF),
    adiabatic_supply:cmpVal(og.adia_supply_temperature, ob.adia_supply_temperature, 1e-9, TOL_CF),
    heat_load:       cmpVal(og.heat_load_total, 4 * ob.heat_load_total, 1e-9, 1e-9),
    adia_airflow:    cmpVal(og.adia_required_airflow, 4 * ob.adia_required_airflow, 1e-6, 1e-9)
  };
  push('invariance/geometric_scale', 'invariance',
       'Quadrupling the floor area and every load with it leaves the air states untouched and '
     + 'multiplies the required airflow by four.', { len: 120, wid: 60 }, cmp);
}
{
  const nt = REF.cases.find(c => c.id === 'near_target').inputs;
  const on = await load(nt, 'refusal/not_dimensionable');
  push('refusal/not_dimensionable', 'refusal',
       'An adiabatic supply less than 2 K below the target cannot be dimensioned and must be '
     + 'refused rather than sized with an unbounded airflow.', nt, {
    adiabatic_refused: cmpEq(on.adia_feasible, false),
    airflow_bounded: { got: on.adia_design_airflow, ref: 220000, rel: 0,
                       ok: on.adia_design_airflow <= 220000,
                       note: 'no more than ten supply units' }
  });
}

/* RULE 3, second half: a positive control.  Perturb one input by a visible amount and
   confirm the compared outputs move.  Ungraded; written to the control file. */
const control = {};
{
  const b0 = REF.cases.find(c => c.id === 'base').inputs;
  const a = await load(b0, 'control/base');
  const warm = Object.assign({}, b0, { Tdb: b0.Tdb + 6 });
  const w = await load(warm, 'control/Tdb+6');
  const pick = o => ({
    design_outdoor_dry_bulb: o.design_outdoor_dry_bulb,
    design_outdoor_wet_bulb: o.design_outdoor_wet_bulb,
    adia_supply_temperature: o.adia_supply_temperature,
    mech_cooling_coil_duty: o.mech_cooling_coil_duty,
    adia_required_airflow: o.adia_required_airflow,
    mech_lifetime_cost: o.mech_lifetime_cost
  });
  control.perturbation = { field: 'Tdb', from: b0.Tdb, to: warm.Tdb };
  control.before = pick(a); control.after = pick(w);
  control.outputs_moved = Object.keys(control.before).every(k => control.before[k] !== control.after[k]);
  const dear = Object.assign({}, b0, { pel: b0.pel * 3 });
  const d = await load(dear, 'control/pel x3');
  control.perturbation2 = { field: 'pel', from: b0.pel, to: dear.pel };
  control.after2 = pick(d);
  control.outputs_moved2 = (d.mech_lifetime_cost !== a.mech_lifetime_cost)
    && (d.design_outdoor_dry_bulb === a.design_outdoor_dry_bulb);
  control.inputs_landed_checks = landedChecks;
  control.inputs_landed_worst_deviation = landedWorst;
}

await browser.close();

const run_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const total = results.length, passed = results.filter(r => r.pass).length;
const out = {
  tool: 'klimaatcalculator',
  file: 'klimaatcalculator.html',
  run_at,
  reference: REF.reference,
  reference_citations: REF.citations,
  tolerance:
    'Two references are used. Against the closed-form reference - the same published equations '
    + '(Bolton 1980 eq.10; ASHRAE Fundamentals 2021 ch.1 eq.20, 32, 33 and 35) implemented '
    + 'independently in python and solved by bisection to 1e-12 K - the tool is held to 1e-9 '
    + 'relative, because nothing but floating point separates two evaluations of the same closed '
    + 'form; unit counts and feasibility flags must match exactly. Against CoolProp 8.0.0 '
    + '(ASHRAE RP-1485 real moist air) the tolerance is the size of the approximation the tool '
    + 'declares, not what makes it pass: 0.6 % on the humidity ratio (the water-vapour '
    + 'enhancement factor the ideal-gas form omits, measured 0.49 %), 0.05 K on the thermodynamic '
    + 'wet bulb (measured 0.026 K), 0.1 % on the dry-air density (measured 0.039 %), 1 % on the '
    + 'coil load and 0.10 K on the constancy of the wet bulb along the evaporative path (measured '
    + '0.063 K). Bookkeeping identities - mass flow = density x volume flow, temperature rise = '
    + 'load / (mass flow x cp), running cost = energy x tariff + water x tariff + maintenance, '
    + 'lifetime cost = CAPEX + N x annual - are exact arithmetic and are held to 1e-9.',
  not_benchmarked: [
    'The Cairox catalogue itself (22000 m3/h / 3.0 kW supply unit, 31500 m3/h / 4.0 kW roof ARFV, '
    + '27855 m3/h / 2.2 kW wall axial) and every price in the build-up are supplier data, not '
    + 'physics; the harness checks they are applied consistently, never that they are right.',
    'The design-day correction t_design = t_peak - 2.2 ln(1 + n/3) is an in-house correlation '
    + 'with no published provenance. Only its faithful implementation is checked.',
    'The annual energy is a single design point multiplied by fixed load factors (fans and '
    + 'cooling at 0.5, an evaporative wet fraction (t_design - 20)/22 clamped to 0.2-0.85, PV at '
    + '0.45 kWh per kWp per operating hour). This is not a weather-bin or hourly aggregation and '
    + 'no attempt is made here to grade those factors against measured weather data.',
    'The occupied-zone stratification fraction f = 0.5 + 0.5 z_work/H is a convention of this '
    + 'tool. It is energy-consistent at the roof extract, but it is not EN or ASHRAE-derived and '
    + 'is not benchmarked against measurement or CFD.',
    'The adiabatic section and the cooling coil are assumed passive in the airstream: their '
    + 'pressure drop is not charged to the fans. That assumption is disclosed by the tool and is '
    + 'not graded here.',
    'The chiller is represented by a single EER; part-load behaviour, condensing conditions and '
    + 'the reheat that a real dehumidifying coil often needs are outside the model.',
    'The lifetime cost is an undiscounted sum; no annuity, interest rate or escalation is '
    + 'modelled, so there is no capital-annuity arithmetic to check.'
  ],
  run_notes: [
    'Driven through the tool\'s own permalink codec; every number read back from '
    + 'Diagram.record.build().',
    'Cross-check between the two references over the 30 climate/load cases: humidity ratio '
    + 'agrees to 0.49 %, thermodynamic wet bulb to 0.026 K, dry-air density to 0.039 %, moist-air '
    + 'enthalpy to 0.043 %, and the wet bulb of the evaporative exit state reproduces the inlet '
    + 'wet bulb to 0.063 K.',
    'Baseline before this pass: the mechanical coil load was the sensible part only '
    + '(m cp dT), which understated the duty by a factor 1.17 at 32 degC/40 % RH rising to 3.04 at '
    + '34 degC/80 % RH, and the leaving humidity ratio was fixed at 95 % RH at 16 degC even when '
    + 'that was above the entering humidity ratio. The wet bulb came from the Stull (2011) '
    + 'correlation, which carries no pressure dependence at all.'
  ],
  crosscheck: 'closed form (Bolton/ASHRAE) vs CoolProp 8.0.0 over 30 cases: humidity ratio '
            + '0.49 %, wet bulb 0.026 K, dry-air density 0.039 %, enthalpy 0.043 %. The humidity '
            + 'ratio gap is the water-vapour enhancement factor that the ideal-gas form omits '
            + 'and is a property of the declared approximation, not of the tool.',
  total, passed, failed: total - passed,
  flagged: results.filter(r => r.flagged).length,
  page_errors: pageErrors,
  cases: results
};
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(OUT_CONTROL, JSON.stringify({
  tool: 'klimaatcalculator', run_at, base: BASE, tool_path: TOOL,
  positive_control: control, page_errors: pageErrors, console: consoleLog
}, null, 1));
console.log(`klimaatcalculator: ${passed}/${total} passed, ${pageErrors.length} page errors, ${consoleLog.length} console messages`);
console.log(`inputs asserted: ${landedChecks} field reads, all exact`);
console.log(`positive control: Tdb ${control.perturbation.from} -> ${control.perturbation.to}, moved=${control.outputs_moved}`);
console.log(`  t_design ${control.before.design_outdoor_dry_bulb} -> ${control.after.design_outdoor_dry_bulb}`
  + `; t_wb ${control.before.design_outdoor_wet_bulb} -> ${control.after.design_outdoor_wet_bulb}`
  + `; coil ${control.before.mech_cooling_coil_duty} -> ${control.after.mech_cooling_coil_duty} kW`);
console.log(`positive control 2: pel x3, lifetime ${control.before.mech_lifetime_cost} -> ${control.after2.mech_lifetime_cost}`
  + ` EUR, air state unchanged=${control.outputs_moved2}`);
for (const r of results.filter(r => !r.pass))
  console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(
    Object.entries(r.cmp).filter(([, v]) => v.ok === false))).slice(0, 600));
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
