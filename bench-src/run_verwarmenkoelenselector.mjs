/* Benchmark driver for verwarmenkoelenselector.html (Heating & Cooling System Selector).
 *
 * The tool is a questionnaire: the answer set is loaded through the tool's own permalink
 * codec and every number is read back from Diagram.record.build().
 *
 * Reference: bench-src/ref/verwarmenkoelenselector_ref.json - EN 442-2 and EN 1264
 * implemented in python from their published equations, plus closed-form recomputation of
 * the plant and hydraulic arithmetic.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
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
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_verwarmenkoelenselector.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 4 291 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* ADAPTED FOR HTTP.  The driver was written against an absolute file:// path on a machine
 * that no longer exists.  It now takes a base URL and a tool path:
 *
 *   node run_verwarmenkoelenselector.mjs --base http://127.0.0.1:8324 \
 *        --tool verwarmenkoelenselector.html [--ref <ref json>] [--out <dir>]
 *
 * Every tolerance, every case id, every reference value and every comparison is the one the
 * deployed driver carried.  Added: an assertion that the page's own answer set really is the
 * answer set each case names before any output is read, and an ungraded positive control.     */
/* Legacy CLI, kept working: --ref took an absolute corpus path and --out a directory.
   Both are translated into the resolver's --ref-dir <dir> / --out <file> before
   benchPaths parses the command line; --base, --site, --out2 and --ref-dir are the
   resolver's own and are read there. */
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const refFlag = arg('--ref', null);
const outFlag = arg('--out', null);
if (outFlag && !/\.json$/i.test(outFlag))
  process.argv[process.argv.indexOf('--out') + 1] = path.join(outFlag, 'verwarmenkoelenselector.json');
const P = benchPaths({
  name: 'verwarmenkoelenselector',
  page: arg('--tool', 'verwarmenkoelenselector.html'),
  ref: refFlag ? path.basename(refFlag) : 'verwarmenkoelenselector_ref.json',
  /* http transport unchanged; only the origin became a parameter */
  env: { ...process.env,
         BENCH_BASE: process.env.BENCH_BASE || 'http://127.0.0.1:8324',
         BENCH_REF_DIR: refFlag ? path.dirname(path.resolve(refFlag)) : process.env.BENCH_REF_DIR },
});
const OUT2 = P.out2 || P.out.replace(/\.json$/, '.control.json');
const ABORT_OUT = P.out.replace(/\.json$/, '.aborted.json');

const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const URLBASE = P.pageUrl;
const results = [], pageErrors = [];
const consoleAll = [];
const control = { base: P.base, tool: P.pageFile, ref: P.ref, url: URLBASE, loads: 0 };

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

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
page.on('console', m => {
  consoleAll.push(m.type() + ': ' + m.text().slice(0, 200));
  if (m.type() === 'error') pageErrors.push('console: ' + m.text());
});
const dumpAbort = (why) => {
  try {
    fs.writeFileSync(ABORT_OUT, JSON.stringify(
      { abort: String(why && why.stack || why).slice(0, 4000), cases_so_far: results,
        console: consoleAll, page_errors: pageErrors, control }, null, 1));
  } catch (e) { /* nothing left to do */ }
};
process.on('unhandledRejection', e => { dumpAbort(e); console.error('ABORT', e); process.exit(3); });
process.on('uncaughtException', e => { dumpAbort(e); console.error('ABORT', e); process.exit(3); });
await page.goto(URLBASE + '?lang=en');
await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });
/* the build this run graded, out of the document the browser loaded */
const BUILD = await readPageManifestRevision(page);
{
  /* the questionnaire is driven through the page's own permalink codec and read back through the
     page's own record; if either had moved with the port the run would have measured the page's
     default answers, so refuse to continue when they are not there */
  const g = await page.evaluate(() => ({
    encode: typeof (window.Diagram.state || {}).encode,
    app: typeof App, appA: App && typeof App.A, appR: App && typeof App.R,
    rec: window.Diagram.record.build() === null ? 'null' : 'object'
  }));
  if (g.encode !== 'function' || g.app !== 'object' || g.appA !== 'object' || g.rec !== 'object')
    throw new Error('the page does not expose the codec / App / record this driver drives: ' + JSON.stringify(g));
  control.globals = g;
}

/* every case's answers are asserted from the page's own state before any output is read */
const sameAnswer = (got, want) => {
  if (Array.isArray(want)) return Array.isArray(got) && want.length === got.length
    && want.every((v, i) => String(v) === String(got[i]));
  if (typeof want === 'number') return Math.abs(Number(got) - want) <= 1e-12 * Math.max(1, Math.abs(want));
  return String(got) === String(want);
};
async function load(A) {
  const enc = await page.evaluate(o => window.Diagram.state.encode(o),
    { v: 1, lang: 'en', step: 0, view: 'form', A });
  await page.goto(URLBASE + '?lang=en&s=' + enc);
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });
  const seen = await page.evaluate(() => App.A);
  const bad = Object.keys(A).filter(k => !sameAnswer(seen[k], A[k]));
  if (bad.length)
    throw new Error('INPUT ASSERTION FAILED: the page did not take '
      + bad.map(k => k + ' (wanted ' + JSON.stringify(A[k]) + ', page has ' + JSON.stringify(seen[k]) + ')').join(', '));
  control.loads++;
  return (await page.evaluate(() => window.Diagram.record.build())).outputs;
}

/* ---- tolerances ----------------------------------------------------------
   Both sides evaluate the same published closed forms, so only floating point
   separates them: 1e-9 relative. The one exception is the reference constant
   itself - the exact logarithmic mean at 75/65/20 is 49.83289 K and the tool,
   like the industry, rounds it to 49.83; that rounding is recorded, not graded
   against, because 49.83 is what the tool declares it uses. */
const TOL = 1e-9;

/* ---- 1. EN 442-2 emitter derating ---------------------------------------- */
for (const c of REF.cases.filter(x => x.group === 'en442')) {
  const o = await load(c.inputs), e = c.expected;
  const kind = c.inputs.afg_types[0];
  const f = o['emitter_factor_' + kind];
  const cmp = {
    factor: cmpVal(f, e.factor, 1e-12, TOL),
    required_nominal: e.required_nominal === null ? cmpEq(o['required_nominal_' + kind], null)
      : cmpVal(o['required_nominal_' + kind], e.required_nominal, 1e-9, TOL),
    /* the tool must use the LOGARITHMIC mean; the arithmetic mean is the classic error */
    not_the_arithmetic_convention: {
      got: f, ref: e.factor_arithmetic,
      rel: Math.abs(f - e.factor_arithmetic) / Math.max(e.factor_arithmetic, 1e-12),
      ok: Math.abs(f - e.factor) <= 1e-12 + TOL * Math.abs(e.factor),
      note: 'graded against the logarithmic reference; the arithmetic value is shown for contrast'
    },
    convention_gap: { got: Math.abs(e.factor - e.factor_arithmetic) / Math.max(e.factor, 1e-12),
      ref: 0, rel: 0, ok: true, graded: false,
      note: 'size of the LMTD-vs-AMTD difference at this regime - recorded, not graded' },
    unity_at_nominal: (c.inputs.reg_t_flow === 75 && c.inputs.reg_t_return === 65)
      ? cmpVal(f, 1, 2e-4, 2e-4) : { got: 1, ref: 1, rel: 0, ok: true, graded: false,
        note: 'only checked at the 75/65/20 rating point' }
  };
  push(c.id, 'en442', c.note, c.inputs, cmp);
}

/* ---- 2. EN 1264 floor heating --------------------------------------------- */
for (const c of REF.cases.filter(x => x.group === 'en1264')) {
  const o = await load(c.inputs), e = c.expected;
  push(c.id, 'en1264', c.note, c.inputs, {
    effective_area: cmpVal(o.floor_effective_area, e.area_eff, 1e-9, TOL),
    heat_flux: cmpVal(o.floor_heat_flux, e.q_need, 1e-9, TOL),
    max_heat_flux_at_29C: cmpVal(o.floor_max_heat_flux, e.q_max, 1e-9, TOL),
    surface_temperature: cmpVal(o.floor_surface_temperature, e.t_surface, 1e-9, TOL),
    mean_water_temperature: cmpVal(o.floor_mean_water_temperature, e.t_medium, 1e-9, TOL),
    /* the water must be hotter than the surface it heats */
    water_hotter_than_surface: {
      got: o.floor_mean_water_temperature, ref: o.floor_surface_temperature, rel: 0,
      ok: o.floor_mean_water_temperature > o.floor_surface_temperature,
      note: 'a heated floor cannot be supplied by water colder than its own surface'
    },
    /* the inversion must be consistent with the forward characteristic */
    inversion_round_trip: cmpVal(
      8.92 * Math.pow(o.floor_surface_temperature - c.inputs.cnd_t_room, 1.1),
      o.floor_heat_flux, 1e-9, 1e-9)
  });
}

/* ---- 3. plant, hydraulics, annual balance --------------------------------- */
for (const c of REF.cases.filter(x => x.group === 'plant')) {
  const o = await load(c.inputs), e = c.expected;
  push(c.id, 'plant', c.note, c.inputs, {
    heat_load: cmpVal(o.heat_load, e.load, 1e-9, TOL),
    cool_load: cmpVal(o.cool_load, e.cool, 1e-9, TOL),
    flow_heating: cmpVal(o.water_flow_heating, e.flow_heat, 1e-12, TOL),
    flow_cooling: cmpVal(o.water_flow_cooling, e.flow_cool, 1e-12, TOL),
    cop_design: cmpVal(o.cop_design, e.cop_design, 1e-12, TOL),
    cop_mild: cmpVal(o.cop_mild, e.cop_mild, 1e-12, TOL),
    cop_seasonal: cmpVal(o.cop_seasonal, e.cop_season, 1e-12, TOL),
    cop_dhw: cmpVal(o.cop_dhw, e.cop_dhw, 1e-12, TOL),
    capacity_at_design: cmpVal(o.capacity_at_design, e.capacity_at_design, 1e-12, TOL),
    backup_power: cmpVal(o.backup_power, e.backup, 1e-12, TOL),
    heat_loss_coefficient: cmpVal(o.heat_loss_coefficient, e.UA, 1e-12, TOL),
    bivalent_point: cmpVal(o.bivalent_point, e.bivalent_point, 1e-9, TOL),
    bivalent_coverage: cmpVal(o.bivalent_coverage, e.coverage, 1e-12, TOL),
    buffer_volume: cmpEq(o.buffer_volume_calculated, e.buffer),
    defrost_volume: cmpEq(o.defrost_volume, e.defrost),
    system_volume: cmpEq(o.system_volume, e.system_volume),
    expansion_volume: cmpEq(o.expansion_volume, e.expansion),
    dhw_daily_volume: cmpVal(o.dhw_daily_volume, e.dhw_daily_l, 1e-9, TOL),
    dhw_daily_energy: cmpVal(o.dhw_daily_energy, e.dhw_daily_kwh, 1e-12, TOL),
    annual_heat: cmpVal(o.annual_heat, e.heat_kwh, 1e-9, TOL),
    annual_electricity: cmpVal(o.annual_electricity, e.elec_kwh, 1e-9, TOL),
    pump_power: cmpVal(o.pump_power, e.pump_power, 1e-12, TOL),
    /* identities that must hold whatever the model does */
    ua_identity: cmpVal(o.heat_loss_coefficient * (c.inputs.cnd_t_room - c.inputs.cnd_t_design),
                        o.heat_load, 1e-12, TOL),
    annual_identity: cmpVal(o.annual_heat,
                            o.heat_loss_coefficient * c.inputs.cnd_degree_days * 24, 1e-9, TOL),
    electricity_identity: cmpVal(o.annual_electricity * o.cop_seasonal, o.annual_heat, 1e-9, TOL),
    flow_identity: cmpVal(o.water_flow_heating
                          * (1000 * (1 + 0.0009 * (c.inputs.reg_glycol_pct || 0)))
                          * (4.187 * (1 - 0.0045 * (c.inputs.reg_glycol_pct || 0)))
                          * (c.inputs.reg_t_flow - c.inputs.reg_t_return) / 3600,
                          o.heat_load, 1e-9, TOL)
  });
}

/* ---- 4. rule thresholds against the numbers they quote --------------------- */
{
  const cases = [
    ['blok', 45, { reg_t_flow: 35, reg_t_return: 30 }],       /* factor 0.163 -> blocking */
    ['waarschuwing', 45, { reg_t_flow: 55, reg_t_return: 45 }],/* factor 0.511 -> warning  */
    ['advies', 45, { reg_t_flow: 75, reg_t_return: 65 }]       /* factor 1.000 -> advice   */
  ];
  for (const [level, spec, delta] of cases) {
    const A = Object.assign({}, REF.cases[0].inputs, delta, { afg_types: ['radiator'],
      afg_bestaand: 'ja', bel_spec_heat: spec });
    const o = await load(A);
    const f = o.emitter_factor_radiator;
    const expected = f < 0.45 ? 'blok' : f < 0.7 ? 'waarschuwing' : 'advies';
    const seen = await page.evaluate(() => App.R.rules
      .filter(r => r.id === 'afgifte_ontoereikend' || r.id === 'afgifte_derating' || r.id === 'afgifte_ok')
      .map(r => r.level + '|' + r.id + '|' + r.vars.pct));
    push('rules/emitter_' + level, 'rules',
      'The 45 % and 70 % thresholds the tool states must agree with the factor it computes, '
      + 'and the percentage quoted in the message must be that same factor.',
      A, {
        rule_level: cmpEq(seen.length === 1 ? seen[0].split('|')[0] : seen.join(','), expected),
        quoted_percentage: cmpEq(seen.length === 1 ? Number(seen[0].split('|')[2]) : -1,
                                 Math.round(f * 100)),
        threshold_consistency: cmpEq(expected, level)
      });
  }
}

/* ---- 5. wall heating must not pass silently -------------------------------- */
{
  const A = Object.assign({}, REF.cases[0].inputs, { afg_types: ['wand'] });
  await load(A);
  const seen = await page.evaluate(() => App.R.rules.map(r => r.id));
  push('rules/wall_heating', 'rules',
    'Wall heating is offered as a selection but is not dimensioned by this tool; selecting it '
    + 'must produce an explicit statement rather than an empty result.', A, {
      explicit_rule_present: cmpEq(seen.includes('wand_niet_gedimensioneerd'), true),
      no_floor_result_claimed: cmpEq((await page.evaluate(() => App.R.terminals.detail.vloer)) === null
        || (await page.evaluate(() => App.R.terminals.detail.vloer === undefined)), true)
    });
}

/* ---- 6. invariance --------------------------------------------------------- */
{
  const spec = Object.assign({}, REF.cases[0].inputs, { bel_basis: 'specifiek',
    geb_area: 200, bel_spec_heat: 50 });
  const given = Object.assign({}, REF.cases[0].inputs, { bel_basis: 'opgegeven',
    geb_area: 200, bel_heat_kw: 10 });
  const a = await load(spec), b = await load(given);
  const cmp = {};
  for (const k of ['heat_load', 'water_flow_heating', 'emitter_factor_radiator',
                   'required_nominal_radiator', 'bivalent_point', 'annual_heat'])
    cmp[k] = cmpVal(a[k], b[k], 1e-9, TOL);
  push('invariance/load_representation', 'invariance',
    '200 m2 at 50 W/m2 and a given 10 kW are the same building; every derived number must match.',
    { geb_area: 200 }, cmp);
}
{
  /* the emitter law must be scale-free: doubling the load doubles the required nominal
     output and leaves the derating factor untouched */
  const a = await load(Object.assign({}, REF.cases[0].inputs, { bel_spec_heat: 45 }));
  const b = await load(Object.assign({}, REF.cases[0].inputs, { bel_spec_heat: 90 }));
  push('invariance/load_scale', 'invariance',
    'The EN 442 derating factor depends on temperatures only, so doubling the load may not '
    + 'change it and must exactly double the required nominal output.', { bel_spec_heat: 90 }, {
      factor_unchanged: cmpVal(b.emitter_factor_radiator, a.emitter_factor_radiator, 1e-15, TOL),
      required_doubles: cmpVal(b.required_nominal_radiator, 2 * a.required_nominal_radiator, 1e-9, TOL),
      load_doubles: cmpVal(b.heat_load, 2 * a.heat_load, 1e-12, TOL)
    });
}
{
  /* room temperature enters the law through the excess temperature only */
  const A = Object.assign({}, REF.cases[0].inputs, { cnd_t_room: 22, reg_t_flow: 47, reg_t_return: 42 });
  const B = Object.assign({}, REF.cases[0].inputs, { cnd_t_room: 20, reg_t_flow: 45, reg_t_return: 40 });
  const a = await load(A), b = await load(B);
  push('invariance/excess_temperature', 'invariance',
    'Shifting room, flow and return by the same 2 K leaves the excess temperatures and therefore '
    + 'the emitter factor unchanged.', { cnd_t_room: 22 }, {
      factor_unchanged: cmpVal(a.emitter_factor_radiator, b.emitter_factor_radiator, 1e-12, TOL)
    });
}

/* POSITIVE CONTROL - ungraded, written to the control file.  A run whose cases all pass at the
   page's default answers has measured nothing, so one answer is moved by a visible amount and
   the compared outputs must move with it. */
{
  const A0 = Object.assign({}, REF.cases[0].inputs, { afg_types: ['radiator'],
    reg_t_flow: 75, reg_t_return: 65 });
  const A1 = Object.assign({}, A0, { reg_t_flow: 45, reg_t_return: 40 });
  const o0 = await load(A0), o1 = await load(A1);
  const keys = ['emitter_factor_radiator', 'required_nominal_radiator', 'water_flow_heating'];
  const moved = {};
  for (const k of keys) moved[k] = { at_75_65: o0[k], at_45_40: o1[k], changed: o0[k] !== o1[k] };
  const shown = await page.evaluate(() => (App.R && App.R.rules || [])
    .filter(r => /^afgifte_/.test(r.id)).map(r => r.level + '|' + r.id + '|' + r.vars.pct));
  control.positive_control = {
    perturbation: 'radiator regime 75/65 -> 45/40 at an unchanged load',
    outputs: moved, rules_at_45_40: shown,
    outputs_moved: moved.emitter_factor_radiator.changed
      && moved.required_nominal_radiator.changed
  };
  if (!moved.emitter_factor_radiator.changed || !moved.required_nominal_radiator.changed)
    throw new Error('POSITIVE CONTROL FAILED: dropping the regime from 75/65 to 45/40 moved neither '
      + 'the EN 442 factor nor the required nominal output');
}

await browser.close();

const RUN_AT = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const total = results.length, passed = results.filter(r => r.pass).length;
const out = {
  tool: 'verwarmenkoelenselector',
  file: 'verwarmenkoelenselector.html',
  reference: REF.reference,
  reference_citations: REF.citations,
  tolerance:
    'The tool states which published closed forms it implements, so the reference implements the '
    + 'same forms independently in python and the tool is held to 1e-9 relative on every '
    + 'continuous quantity; volumes the tool rounds to whole litres and unit counts must match '
    + 'exactly. Two things are deliberately not graded to a tighter number than the physics '
    + 'allows: the reference temperature difference, where the exact logarithmic mean at '
    + '75/65/20 is 49.83289 K and the tool - like the industry - declares 49.83, a 0.006 % '
    + 'rounding whose effect on the output factor is 0.008 %, and the unity check at the rating '
    + 'point, which is therefore given 2e-4. The arithmetic-mean variant of the same law is '
    + 'computed alongside every case and its distance from the logarithmic one recorded (up to '
    + '8.9 % over the regime grid) so that the convention actually in use is demonstrated rather '
    + 'than assumed.',
  not_benchmarked: [
    'The EN 442 exponents themselves. They are per-type generics (1.30 radiator, 1.35 convector, '
    + '1.25 radiant panel, 1.00 fan coil) inside the published 1.26-1.35 band for radiators, but '
    + 'a certified value belongs to a model, not to a type; the harness checks the law is applied '
    + 'faithfully, not that 1.30 is right for a given radiator.',
    'The known weakness of the EN 442 logarithmic conversion itself: REHVA (2022) measured '
    + 'deviations up to about 10 % at strongly reduced mass flow and increased spread, and '
    + 'proposes an additional (dT_ar/dT_ar,50)^g factor. The tool does not apply that correction; '
    + 'its absence is now disclosed but its magnitude is not graded here.',
    'EN 1264-2 proper. The tool uses the basic characteristic curve q = 8.92 dT^1.1 and the '
    + 'surface caps, not the full product-coefficient method (B, a_B, a_T^mT, a_u^mu, a_D^mD); '
    + 'the mean water temperature is therefore a series-resistance simplification and is graded '
    + 'only for internal consistency (water hotter than the surface, inversion round-trip), not '
    + 'against EN 1264-2 dimensioning tables.',
    'Wall heating, ceiling heating, cooled ceilings and concrete core activation. EN 1264-5 '
    + 'coefficients were not obtainable from a primary source for this pass, so wall heating is '
    + 'explicitly not dimensioned and the cooled-ceiling and concrete-core figures are indicative '
    + 'maxima that are not benchmarked.',
    'The Carnot quality factors per source type, the 0.88 defrost penalty, the 0.022/K capacity '
    + 'derating slope, the 0.3/0.7 seasonal COP blend and the bivalent coverage curve are '
    + 'conventions of this tool with no published provenance; only their faithful and consistent '
    + 'application is checked.',
    'The building profiles, the 66 rule texts and the report layout are editorial content, not '
    + 'computation; only the three emitter-threshold rules and the wall-heating rule are checked '
    + 'against the numbers they quote.',
    'The load itself: it is entered or derived from a W/m2 rule of thumb, not computed to '
    + 'EN 12831.',
    'The glycol correction c_p x (1 - 0.0045 f) and rho x (1 + 0.0009 f) is a linear fit with no '
    + 'stated provenance and no brine type; it is applied consistently and the flow identity is '
    + 'checked with it, but the fit itself is not graded against glycol property tables.'
  ],
  run_notes: [
    'Driven through the tool\'s own permalink codec; every number read back from '
    + 'Diagram.record.build().',
    'Baseline before this pass: the mean water temperature of a heated floor was computed as '
    + 'theta_i + q R_covering, which put the water COLDER than the floor surface it was supposed '
    + 'to heat for every default case (at 87.5 W/m2 with R = 0.09 m2K/W: surface 27.97 degC, '
    + 'water 27.88 degC). It is now built up from the EN 1264 surface temperature plus the drop '
    + 'across the covering and the screed. The bivalent point came from a 0.1 K stepped scan '
    + 'that returned a value up to 0.1 K low with visible floating-point drift '
    + '(0.7999999999999846 instead of 0.80597); it is now solved exactly. The pipe-spacing '
    + 'answer was read from the form and then never passed to the calculation, so changing it '
    + 'moved nothing; this benchmark found that and it is now wired through. Wall heating could '
    + 'be selected and produced no calculation and no message at all.',
    'The exact logarithmic mean excess temperature at 75/65/20 is 49.83289 K; the tool declares '
    + '49.83. The two differ by 0.006 %, which moves the output factor by 0.008 % - below the '
    + 'display resolution of every figure that uses it.'
  ],
  crosscheck: 'logarithmic vs arithmetic mean excess temperature over the 14-regime grid: the '
            + 'two conventions differ by 0.0 % at the rating point and by up to 8.9 % at 45/30/20. '
            + 'The tool follows the logarithmic convention that EN 442-2 prescribes.',
  total, passed, failed: total - passed,
  flagged: results.filter(r => r.flagged).length,
  page_errors: pageErrors,
  run_at: RUN_AT,
  cases: results
};
control.run_at = RUN_AT;
control.console = consoleAll;
control.page_errors = pageErrors;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(OUT2, JSON.stringify(control, null, 1));
console.log(`verwarmenkoelenselector: ${passed}/${total} passed, ${pageErrors.length} page errors`);
console.log(`run_at ${RUN_AT}; permalink loads ${control.loads}; console messages ${consoleAll.length}`);
for (const r of results.filter(r => !r.pass))
  console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(
    Object.entries(r.cmp).filter(([, v]) => v.ok === false))).slice(0, 600));
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
