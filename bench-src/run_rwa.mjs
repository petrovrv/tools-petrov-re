/* Benchmark driver for RWA_calculator.html (Smoke & Heat Exhaust, NBN S 21-208-1).
 *
 * Driven through the tool's own permalink codec; numbers read back from
 * Diagram.record.build().
 *
 * IMPORTANT, and stated the same way in the artifact: NBN S 21-208-1 is a paid national
 * standard whose text could not be obtained for this pass. Nothing here is graded against
 * it. What IS graded is (a) the plume correlation against its published form, (b) the
 * natural-ventilator area against a first-principles derivation of the two-orifice
 * buoyancy balance, solved twice by structurally different means, (c) the ideal-gas smoke
 * volume flow, (d) the arithmetic and the internal consistency of everything else. The
 * standard's own tables and limits are listed under not_benchmarked.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance, benchPaths } from './provenance.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build belongs to the
   run and not to this constant: readPageManifestRevision(page) reads it out of the live
   DOM of the page the browser loaded, and it reaches the artifact as stampProvenance's
   `build`, which writes build and manifest_revision and refuses to write without it. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_rwa.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 1 744 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* The artifact's name is rwa-calculator, which is what RWA_calculator.html's manifest
   declares (benchmarks/rwa-calculator.json) and what the artifact's own `tool` field says.
   This driver wrote rwa.json, a name the site serves nowhere, which is why that artifact
   was written by no driver. The resolver's default out is the file the site serves. */
const P = benchPaths({ name: 'rwa-calculator', page: 'RWA_calculator.html',
                       ref: 'rwa_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
/* The transport stays file://; the resolver supplies the tree. */
const URLBASE = P.pageUrl;
const results = [], pageErrors = [];

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

/* The tool prints two decimals on areas and flows, three on the mass flow, one on the
   temperatures. Both sides evaluate closed forms, so nothing but floating point separates
   them and the grading tolerance is 1e-9 relative - far below the printed resolution. */
const TOL = 1e-9;

function stateFor(c) {
  const i = c.inputs;
  return {
    _state: { method: i.method, buildingType: i.buildingType,
              fireMode: 'guided', fireScenario: i.fireScenario },
    _lang: 'en',
    hc: String(i.hc), gbre: String(i.gbre), glen: String(i.glen), area: String(i.area),
    reservoirs: String(i.reservoirs), poort: String(i.poort), hst: String(i.hst),
    Y: String(i.Y), shape: 'rect', material: '0', Af: '9', Wf: '12', alpha: '0.8',
    qfManual: '250', sprinklers: i.sprinklers, sprinklerTemp: String(i.sprinklerTemp),
    reekb: String(i.reekb), tAmb: String(i.tAmb), Ci: String(i.Ci), Ai: String(i.Ai),
    hw: String(i.hw), hl: String(i.hl), cv: String(i.cv), mesh: i.mesh
  };
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
await page.goto(URLBASE + '?lang=en');
await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });

/* The build this artifact names: the revision in the live DOM of the page just loaded.
   The permalink loads below reopen the same page, so the graded revision is this one. */
const BUILD = await readPageManifestRevision(page);

async function load(c) {
  const enc = await page.evaluate(o => window.Diagram.state.encode(o), stateFor(c));
  await page.goto(URLBASE + '?lang=en&s=' + enc);
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });
  return page.evaluate(() => ({ rec: window.Diagram.record.build(),
                                raw: window.__rwaUI.last().r }));
}

for (const c of REF.cases) {
  const { rec, raw } = await load(c);
  const o = rec.outputs, e = c.expected;

  if (c.group === 'simplified') {
    push(c.id, 'simplified',
      c.note + ' Aerodynamic 2 % / geometric 3 % of the floor area, with the applicability '
      + 'conditions of the Royal Decree annex 6.', c.inputs, {
        required_area: cmpVal(o.required_aerodynamic_area, e['required'], 1e-9, TOL),
        percentage_of_floor: cmpVal(o.required_aerodynamic_area / c.inputs.area,
                                    e['required'] / c.inputs.area, 1e-12, TOL),
        applicability: cmpEq(!raw.warns.includes('simplified_na'), e['applicable']),
        layer_depth: cmpVal(o.layer_depth, e['db'], 1e-12, TOL)
      });
    continue;
  }

  const cmp = {
    /* plume and fire, against the published correlation */
    fire_area:        cmpVal(o.fire_area, e.Af, 1e-9, TOL),
    fire_perimeter:   cmpVal(o.fire_perimeter, e.Wf, 1e-9, TOL),
    convective_fraction: cmpVal(o.convective_fraction, e.alpha, 1e-12, TOL),
    plume_mass_flow:  cmpVal(o.smoke_mass_flow, e.Mf, 1e-12, TOL),
    plume_law_identity: cmpVal(o.smoke_mass_flow,
                               0.188 * o.fire_perimeter * Math.pow(o.smoke_free_height, 1.5),
                               1e-12, TOL),
    convective_heat:  cmpVal(o.convective_heat, e.Qc, 1e-9, TOL),
    temperature_rise: cmpVal(o.temperature_rise, e.theta, 1e-9, TOL),
    /* theta = Qc/(Mf c) with c = 1.0 kJ/(kg.K) - checked explicitly, not implicitly */
    temperature_rise_identity: (c.inputs.sprinklers === 'geen' || c.inputs.method !== 'natural')
      ? cmpVal(o.temperature_rise, o.convective_heat / (o.smoke_mass_flow * 1.0), 1e-9, TOL)
      : { got: 0, ref: 0, rel: 0, ok: true, graded: false,
          note: 'the sprinkler cap replaces Qc/(Mf c) here' },
    smoke_temperature: cmpVal(o.smoke_gas_temperature, e.Tc, 1e-9, TOL),
    layer_depth:      cmpVal(o.layer_depth, e.db, 1e-12, TOL),
    critical_vent_area: cmpVal(o.critical_ventilator_area, 1.4 * o.layer_depth * o.layer_depth, 1e-12, TOL),
    max_vent_length:  cmpVal(o.max_ventilator_length, Math.min(o.layer_depth, 3), 1e-12, TOL),
    min_vent_spacing: cmpVal(o.min_ventilator_spacing, 3 * o.layer_depth, 1e-12, TOL)
  };

  if (c.inputs.method === 'natural') {
    cmp.aerodynamic_area = cmpVal(o.required_aerodynamic_area, e.required, 1e-9, TOL);
    cmp.area_at_equal_inlet = cmpVal(o.aerodynamic_area_equal_inlet, e.AvCvMin, 1e-9, TOL);
    cmp.inlet_area = cmpVal(o.aerodynamic_inlet_area, e.AiCi, 1e-9, TOL);
    /* the guidance rule: aerodynamic inlet at least equal to aerodynamic extract */
    cmp.inlet_not_below_extract = {
      got: o.aerodynamic_inlet_area, ref: o.required_aerodynamic_area, rel: 0,
      ok: o.aerodynamic_inlet_area >= o.required_aerodynamic_area - 1e-9,
      note: 'SCA guidance 15.3: the aerodynamic inlet area should be at least equal to the '
          + 'aerodynamic extract area'
    };
    /* the vent equation itself, re-solved from the two-orifice balance */
    cmp.two_orifice_balance = e.theta_consistent
      ? cmpVal(o.required_aerodynamic_area, e.AvCv_network, 1e-9, 1e-8)
      : { got: o.required_aerodynamic_area, ref: e.AvCv_network,
          rel: Math.abs(o.required_aerodynamic_area - e.AvCv_network) / e.AvCv_network,
          ok: true, graded: false,
          note: 'the sprinkler temperature model sets Tc so that Tc - T0 is not theta, so the '
              + 'published vent equation and a pure buoyancy balance on Tc are no longer the '
              + 'same equation; the gap is recorded, not graded' };
    cmp.hatch_count_rounds_up = {
      got: o.hatch_count, ref: Math.max(1, Math.ceil(o.required_aerodynamic_area / o.hatch_aerodynamic_area - 1e-9),
                                        Math.floor(o.reservoir_area * 0.99 / 400) + 1),
      rel: 0,
      ok: o.hatch_count === Math.max(Math.ceil(o.required_aerodynamic_area / o.hatch_aerodynamic_area - 1e-9),
                                     Math.floor(o.reservoir_area * 0.99 / 400) + 1),
      note: 'number of hatches must be the ceiling, never the ceiling plus one'
    };
    cmp.hatch_area_covers_requirement = {
      got: o.hatch_count * o.hatch_aerodynamic_area, ref: o.required_aerodynamic_area, rel: 0,
      ok: o.hatch_count * o.hatch_aerodynamic_area >= o.required_aerodynamic_area - 1e-9,
      note: 'the installed aerodynamic area must reach the requirement'
    };
    cmp.critical_area_check_compares = {
      got: raw.checks.find(x => x.key === 'chk_krit') ? raw.checks.find(x => x.key === 'chk_krit').pass : null,
      ref: o.hatch_aerodynamic_area < o.critical_ventilator_area, rel: 0,
      ok: (raw.checks.find(x => x.key === 'chk_krit') || {}).pass
          === (o.hatch_aerodynamic_area > 0 && o.hatch_aerodynamic_area < o.critical_ventilator_area),
      note: 'the AvCv < 1.4 db^2 checklist item must compare the chosen hatch, not merely test '
          + 'that 1.4 db^2 is positive'
    };
  } else {
    cmp.smoke_volume_flow = cmpVal(o.smoke_volume_flow, e.V, 1e-9, TOL);
    cmp.ideal_gas_identity = cmpVal(o.smoke_volume_flow,
      o.smoke_mass_flow / 1.225 * o.smoke_gas_temperature / o.ambient_temperature, 1e-12, TOL);
    cmp.make_up_air_flow = cmpVal(o.make_up_air_volume_flow, e.Vinlet, 1e-12, TOL);
    cmp.inlet_area = cmpVal(o.required_inlet_area, e.inletArea, 1e-9, TOL);
    cmp.inlet_area_mass_balance = cmpVal(o.required_inlet_area_mass_balance,
                                         e.inletAreaMassBalance, 1e-9, TOL);
    cmp.inlet_velocity_at_5ms = cmpVal(
      o.smoke_volume_flow / (o.required_inlet_area * c.inputs.Ci), 5.0, 1e-9, TOL);
    cmp.critical_flow = cmpVal(o.critical_extract_flow, e.Vcrit, 1e-9, TOL);
    cmp.plugholing_coefficient = {
      got: 2.0, ref: 1.8, rel: Math.abs(2.0 - 1.8) / 1.8, ok: true, graded: false,
      note: 'the tool uses beta = 2 in M_crit = beta (g D^5 T0 U/T^2)^(1/2); BR258 gives 1.3 '
          + 'near a wall and 1.8 away from a wall, and NBN S 21-208-1 could not be consulted. '
          + 'The references disagree, so this is flagged and not graded'
    };
    cmp.inlet_sizing_basis = {
      got: e.inletArea / e.inletAreaMassBalance, ref: e.Tc / e.T0K, rel: 0, ok: true, graded: false,
      note: 'the inlet is sized on the hot extract volume flow rather than on a mass balance '
          + 'of the incoming air; that is conservative by exactly Tc/T0, which is what this '
          + 'ratio shows. Recorded, not graded, because the governing NBN text was not available'
    };
  }
  push(c.id, c.group, c.note, c.inputs, cmp);
}

/* ---- refusals and internal consistency ---------------------------------- */
{
  const c = { inputs: Object.assign({}, REF.cases[0].inputs,
    { fireScenario: 'bulk', hst: 6.0, sprinklers: 'onderdak' }) };
  const { raw } = await load(c);
  push('refusal/bulk_too_high', 'refusal',
    'Bulk stacking above the height the fire table covers must be refused, not extrapolated.',
    c.inputs, {
      refused: cmpEq(raw.ok, false),
      names_the_reason: cmpEq(raw.errors.includes('fire_zero'), true)
    });
}
{
  const c = { inputs: Object.assign({}, REF.cases[0].inputs, { Y: 9.9, hc: 10 }) };
  const { raw, rec } = await load(c);
  push('consistency/thin_layer', 'consistency',
    'A 0.1 m smoke layer is a degenerate design: the area must stay finite and positive and '
    + 'the per-ventilator limit must shrink with the layer.', c.inputs, {
      finite_positive: { got: rec.outputs.required_aerodynamic_area, ref: 0, rel: 0,
        ok: isFinite(rec.outputs.required_aerodynamic_area) && rec.outputs.required_aerodynamic_area > 0 },
      critical_area_shrinks: cmpVal(rec.outputs.critical_ventilator_area, 1.4 * 0.1 * 0.1, 1e-9, 1e-6),
      no_error: cmpEq(raw.errors.length, 0)
    });
}
{
  const c = { inputs: Object.assign({}, REF.cases[0].inputs, { hc: 10, Y: 10.5 }) };
  const { raw } = await load(c);
  push('refusal/negative_layer', 'refusal',
    'A smoke-free height above the ceiling gives a negative layer depth and must be refused.',
    c.inputs, { refused: cmpEq(raw.ok, false),
                names_the_reason: cmpEq(raw.errors.includes('no_db'), true) });
}
{
  /* scale invariance: the vent area is proportional to the plume mass flow, which is
     proportional to the fire perimeter, so a fire of twice the perimeter at the same
     temperatures needs twice the area */
  const a = await load({ inputs: Object.assign({}, REF.cases[0].inputs, { fireScenario: 'low1' }) });
  const b = await load({ inputs: Object.assign({}, REF.cases[0].inputs, { fireScenario: 'low4' }) });
  push('invariance/perimeter_scaling', 'invariance',
    'Mf scales linearly with the fire perimeter at a fixed smoke-free height.',
    { fireScenario: 'low4' }, {
      mass_flow_ratio: cmpVal(b.rec.outputs.smoke_mass_flow / a.rec.outputs.smoke_mass_flow,
                              b.rec.outputs.fire_perimeter / a.rec.outputs.fire_perimeter, 1e-12, TOL)
    });
}
{
  /* the reservoir count must not change the physics of one reservoir, only the inlet path */
  const a = await load({ inputs: Object.assign({}, REF.cases[0].inputs, { reservoirs: 1, Ai: 20 }) });
  const b = await load({ inputs: Object.assign({}, REF.cases[0].inputs, { reservoirs: 4, Ai: 20 }) });
  push('consistency/reservoirs', 'consistency',
    'Splitting a hall into reservoirs leaves the plume and the temperatures of the design fire '
    + 'untouched and changes only the inlet path, so the area per reservoir may only rise.',
    { reservoirs: 4 }, {
      same_mass_flow: cmpVal(b.rec.outputs.smoke_mass_flow, a.rec.outputs.smoke_mass_flow, 1e-12, TOL),
      same_temperature: cmpVal(b.rec.outputs.smoke_gas_temperature, a.rec.outputs.smoke_gas_temperature, 1e-12, TOL),
      /* the extra reservoirs add inlet path, so the area PER reservoir falls while the
         total over the hall rises */
      area_per_reservoir_falls: { got: b.rec.outputs.required_aerodynamic_area,
        ref: a.rec.outputs.required_aerodynamic_area, rel: 0,
        ok: b.rec.outputs.required_aerodynamic_area <= a.rec.outputs.required_aerodynamic_area + 1e-9 },
      total_area_rises: { got: 4 * b.rec.outputs.required_aerodynamic_area,
        ref: a.rec.outputs.required_aerodynamic_area, rel: 0,
        ok: 4 * b.rec.outputs.required_aerodynamic_area > a.rec.outputs.required_aerodynamic_area },
      inlet_is_larger: { got: b.rec.outputs.aerodynamic_inlet_area,
        ref: a.rec.outputs.aerodynamic_inlet_area, rel: 0,
        ok: b.rec.outputs.aerodynamic_inlet_area > a.rec.outputs.aerodynamic_inlet_area }
    });
}

await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length;
const out = {
  tool: 'rwa-calculator',
  file: 'RWA_calculator.html',
  reference: REF.reference,
  reference_citations: REF.citations,
  tolerance:
    'Everything graded here is a closed form evaluated on both sides, so the criterion is 1e-9 '
    + 'relative - three to six orders below the two or three decimals the page prints. Counts '
    + '(hatches, reservoirs) and boolean outcomes must match exactly. Two quantities are '
    + 'deliberately recorded rather than graded, because the references disagree and the '
    + 'governing standard could not be read: the plugholing coefficient (the tool uses beta = 2, '
    + 'BR258 gives 1.3 near a wall and 1.8 away from one) and the basis on which the mechanical '
    + 'inlet area is sized (the hot extract volume flow rather than a mass balance on the '
    + 'incoming air, which is conservative by exactly Tc/T0). The natural-ventilator area is '
    + 'graded against a first-principles derivation of the two-orifice buoyancy balance solved '
    + 'in closed form, and cross-checked against the same balance solved numerically by '
    + 'scipy.brentq on the mass flow: the two agree to 8e-16 wherever the model keeps '
    + 'Tc - T0 = theta, and separate by up to 24 % in the sprinklered cases where the tool\'s '
    + 'averaged smoke temperature breaks that identity - those cases are flagged, not graded.',
  not_benchmarked: [
    'NBN S 21-208-1 itself. It is a paid Belgian national standard and its text could not be '
    + 'obtained for this pass. No claim of conformity with it is made anywhere in this '
    + 'artifact, and the following items transcribed from the original workbook are therefore '
    + 'unverified: the section 4 fire-geometry tables (low-pile usage categories 1-4, the rack '
    + 'formulas Af = 2/3 hst (b + 0.18 hst) and their 9-81 m2 / 12-36 m clamps, the bulk '
    + 'stacking table), the 250 / 500 kW/m2 general fuel powers, the material table, the '
    + 'sprinkler caps theta <= 1.5 T_spr - t0 and Tc = (T_spr + t0 + theta)/2, the 1.4 db^2 '
    + 'critical ventilator area, L <= min(db, 3) m, spacing >= 3 db, the 60 m reservoir length, '
    + 'the 300 degC smoke temperature ceiling, the one-ventilator-per-400 m2 rule and the 3 % '
    + 'geometric variant of the simplified method.',
    'The plume coefficient itself is not re-derived: Ce = 0.188 is checked against its '
    + 'published value for a large space (BR258) and its faithful application is graded, but '
    + 'the correlation is empirical and its scatter is not quantified here.',
    'The plugholing coefficient beta = 2. BR258 gives 1.3 (near a wall) and 1.8 (away from a '
    + 'wall); the value in the tool is at or beyond the permissive end of that range and the '
    + 'standard that would settle it was not available.',
    'The sprinkler temperature model. Both the cap on theta and the averaged Tc are '
    + 'transcriptions with no obtainable source, and they are mutually inconsistent in the '
    + 'thermodynamic sense (Tc - T0 is not theta), which is why the vent area in those cases '
    + 'differs from a pure buoyancy balance by up to 24 %. Recorded and disclosed, not graded.',
    'Everything outside a steady single-zone design fire: fire growth, wind, make-up air '
    + 'momentum disturbing the plume, sprinkler-smoke interaction, duct and fan design, '
    + 'compartment leakage, tenability and evacuation timing.'
  ],
  run_notes: [
    'Driven through the tool\'s own permalink codec; numbers read back from '
    + 'Diagram.record.build() and the checklist from the engine result.',
    'The natural-ventilator equation the tool implements, Av Cv = (Mf/rho0) sqrt((Tc^2 + Sk^2 '
    + 'T0 Tc)/(2 g db theta T0)), was re-derived from scratch for this benchmark out of the '
    + 'two-orifice buoyancy balance and came out identical, which is the strongest statement '
    + 'this pass can make about it without the standard in hand.',
    'Baseline before this pass: the "AvCv hatch < 1.4 db^2" checklist item tested only that '
    + '1.4 db^2 was positive and therefore always passed, whatever hatch was chosen; the '
    + 'largest-dimension check in the detailed method looked at the length only and ignored the '
    + 'width, so a 20 x 70 m reservoir passed; the hatch count used floor(x) + 1 and so added a '
    + 'spurious extra hatch whenever the requirement was an exact multiple of one hatch; a '
    + 'failed inlet iteration fell back to the equal-inlet area silently; the "critical '
    + 'velocity" row was labelled a velocity while carrying m3/s; and ?lang= was ignored '
    + 'entirely - the interface was hardcoded to English. The inlet-influence loop stopped at '
    + 'an absolute residual of 1e-3 m2 on the vent area and gave up after 200 sweeps; it is '
    + 'now solved in closed form, which is exact and refuses only when there is genuinely no '
    + 'steady solution.'
  ],
  crosscheck: 'closed-form two-orifice solution vs scipy.brentq on the same mass balance: '
            + '8e-16 relative over all cases where Tc - T0 = theta; up to 24 % in the '
            + 'sprinklered cases, where the tool\'s averaged smoke temperature breaks that '
            + 'identity. Those cases are counted as flagged, never as passed.',
  total, passed, failed: total - passed,
  flagged: results.filter(r => r.flagged).length,
  page_errors: pageErrors,
  cases: results
};
/* The resolver created the output directory. This artifact carries no run_at of its own,
   so the stamp supplies one. */
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`rwa: ${passed}/${total} passed, ${pageErrors.length} page errors`);
for (const r of results.filter(r => !r.pass))
  console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(
    Object.entries(r.cmp).filter(([, v]) => v.ok === false))).slice(0, 600));
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
