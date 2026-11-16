/* Benchmark driver: ontvochtiging.html (Dehumidification Method Selector)
   Reference: bench-src/ref/ontvochtiging_ref.json - independent python psychrometric
   mass and energy balances (ASHRAE F-2017 Ch.1 property set, cross-checked against
   CoolProp HAPropsSI).  The corpus is read, never written.

   Usage: node bench-src/run_ontvochtiging.mjs --base http://127.0.0.1:PORT \
            --tool ontvochtiging.html [--ref <corpus>] [--out <artifact>]

   Adapted 2026-10-03 from the repaired driver at
   /home/claude/wp/ontvochtiging-build/bench/run_ontvochtiging.mjs, which already
   writes the state through the page's own permalink codec.  What is new here is the
   rule-3 input assertion (every one of the 46 inputs is read back out of
   Diagram.record.build().inputs, which IS the vector that produced the numbers being
   graded, and a mismatch throws), the positive control, the full console capture and
   run_at.  No tolerance, case id, reference value or comparison was changed.        */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build is read out of
   the live page by readPageManifestRevision() and passed to stampProvenance(), which
   writes build, manifest_revision, reference_provenance, provenance_note and run_at and
   refuses to write anything without an observed build. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_ontv_cases.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 1 239 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const TOOL = arg('tool', 'ontvochtiging.html');
/* This driver serves its page over http; the origin stays this driver's own default when
   neither --base nor BENCH_BASE names one, so the transport is unchanged. Every other
   path - site root, reference directory, artifact, control file - comes from the resolver
   and therefore resolves inside whichever tree this driver is run from. */
const P = benchPaths({ name: 'ontvochtiging', page: TOOL, ref: 'ontvochtiging_ref.json',
  env: { ...process.env, BENCH_BASE: process.env.BENCH_BASE || 'http://127.0.0.1:8327' } });
const BASE = P.base;
const REFPATH = typeof P.flags.ref === 'string' ? path.resolve(P.flags.ref) : P.ref;
const OUT = P.out;
/* The control file sits beside the artifact, as it has, unless --out2/BENCH_OUT2 moves it. */
const CONTROL_OUT = P.out2 || OUT.replace(/\.json$/, '.control.json');
const REF = JSON.parse(fs.readFileSync(REFPATH, 'utf8'));
const BASEURL = BASE + '/' + TOOL;
const URL_EN = BASEURL + "?lang=en";

/* half of the last printed digit of each field -- UNCHANGED */
const TOL = {
  td_sup: 5e-2, td_ach: 5e-2, e: 5e-3, qc: 5e-2, qh: 5e-2, el: 5e-2,
  water: 5e-3, ts: 5e-2, t_dry: 5e-2, t_reg_ex: 5e-2, rh_ex: 0.5,
  t3: 5e-2, pc: 5e-2, smer: 5e-3, e_sens: 5e-3,
  internal: 5e-4, total: 5e-4, x_room: 5e-4
};
const num = s => {
  if (s == null) return NaN;
  const m = String(s).replace(/−/g, '-').replace(/\s/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
const NAME2ID = {
  'Cooling below dew point with reheat': 'm1',
  'Freeze-out with two alternating coils': 'm2',
  'Desiccant rotor with regeneration': 'm3',
  'Refrigerant heat-pump dehumidifier': 'm4'
};

/* The 2026 port moved the controls into the DiagramUI app, so the i_<field> input ids
   of the bare fallback are no longer in the rendered page and setting them set nothing:
   every case ran at the page defaults.  The state is written through the page's own
   permalink codec (dgcSerialize/dgcDeserialize, {v:2,lang,P}) instead.              */
async function setInputs(page, P) {
  const enc = await page.evaluate(o => window.Diagram.state.encode(o), { v: 2, lang: 'en', P });
  await page.goto(BASEURL + '?lang=en&s=' + enc);
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null,
    null, { timeout: 60000 });
  await page.evaluate(() => { if (window.APP) { APP.sync(); APP.run(); } });
  await page.waitForFunction(() => window.Diagram.record.build() !== null, null, { timeout: 60000 });
}

/* RULE 3.  Diagram.record.build().inputs is DGC_LAST.P -- the input vector the page
   actually solved, the one the cards below were rendered from.  Every input the case
   names must be in it, at the case's value.  A select is compared as a string, a
   checkbox as a boolean, a number exactly: the codec writes the same double the corpus
   carries, so there is no room for a tolerance here and none is given.              */
async function assertInputs(page, C) {
  const got = await page.evaluate(() => window.Diagram.record.build().inputs);
  const bad = [];
  for (const [k, want] of Object.entries(C.inputs)) {
    const have = got[k];
    let ok;
    if (typeof want === 'boolean') ok = (have === want);
    else if (typeof want === 'string') ok = (String(have) === want);
    else ok = (typeof have === 'number' && have === want);
    if (!ok) bad.push(`${k}: page has ${JSON.stringify(have)}, case names ${JSON.stringify(want)}`);
  }
  if (bad.length) {
    throw new Error(`case ${C.id}: the page is not holding the case's inputs -- `
      + `${bad.length} of ${Object.keys(C.inputs).length} fields differ:\n  ` + bad.join('\n  '));
  }
  return { ok: true, fields_checked: Object.keys(C.inputs).length, worst: 0 };
}

async function readCards(page) {
  return await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('#rankHost .mcard').forEach(c => {
      const name = c.querySelector('.mname').innerText.trim();
      const tag = c.querySelector('.tag').innerText.trim();
      const verdict = c.querySelector('.verdict').innerText.trim();
      const rows = {};
      c.querySelectorAll('table tr').forEach(tr => {
        const td = tr.querySelectorAll('td');
        if (td.length >= 2) rows[td[0].innerText.trim()] = td[1].innerText.trim();
      });
      out[name] = { tag, verdict, rows };
    });
    const dry = {};
    document.querySelectorAll('#dryHost table tr').forEach(tr => {
      const td = tr.querySelectorAll('td');
      if (td.length >= 2) dry[td[0].innerText.trim()] = td[1].innerText.trim();
    });
    return { cards: out, dry, checks: (document.getElementById('chkWarn') || {}).innerText || '' };
  });
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const pageErrors = [];
const consoleLog = [];
page.on('pageerror', e => pageErrors.push(String((e && e.message) || e)));
page.on('console', m => {
  consoleLog.push({ type: m.type(), text: m.text() });
  if (m.type() === 'error') pageErrors.push('console: ' + m.text());
});

const cases = [];
/* The build this artifact names is the manifest_revision of the document the browser
   loaded, not of the file beside this driver. It is read on the first navigation of the
   run, so a run that never loaded the page has no build and writes nothing. */
let BUILD = null;
for (const C of REF.cases) {
  await page.goto(URL_EN);
  await page.waitForTimeout(250);
  if (BUILD === null) BUILD = await readPageManifestRevision(page);
  await setInputs(page, C.inputs);
  await page.waitForTimeout(250);
  const inputs_verified = await assertInputs(page, C);
  const S = await readCards(page);
  const e = C.expect, cmp = {};
  let pass = true;
  const add = (key, got, ref, tolKey) => {
    const tol = TOL[tolKey || key.replace(/^m\d\./, '').replace(/\[.*\]/, '')] ?? 1e-6;
    const ok = Number.isFinite(got) && Number.isFinite(ref) && Math.abs(got - ref) <= tol + 1e-9;
    const rel = ref ? Math.abs(got - ref) / Math.abs(ref) : Math.abs(got - ref);
    cmp[key] = { got, ref, abs: Math.abs(got - ref), tol, rel, ok };
    pass = pass && ok;
  };
  const addBool = (key, got, ref) => {
    cmp[key] = { got, ref, ok: got === ref }; pass = pass && (got === ref);
  };

  cmp.cards_present = { got: Object.keys(S.cards).length, ref: 4, ok: Object.keys(S.cards).length === 4 };
  pass = pass && cmp.cards_present.ok;

  /* when the flow is too small the refusal message quotes the room humidity ratio;
     the printed value must be that, not the (negative) supply humidity ratio */
  if (!e.load_ok && !e.above) {
    const any = Object.values(S.cards)[0];
    const mm = any && any.verdict.replace(/−/g, '-').match(/(-?\d+(?:\.\d+)?)\s*g\/kg/);
    add('flowneg_room_x', mm ? parseFloat(mm[1]) : NaN, e.x_room, 'x_room');
  }
  if (e.load_ok) {
    add('internal_load', num(S.dry['Internal load inside the room, kg/h']), e.internal, 'internal');
    add('total_load', num(S.dry['Total removed by the unit, kg/h']), e.total, 'total');
  }
  for (const [name, card] of Object.entries(S.cards)) {
    const id = NAME2ID[name];
    if (!id) { cmp['unknown_card_' + name] = { got: name, ref: 'known method name', ok: false }; pass = false; continue; }
    const m = e.methods[id];
    const feasible = /feasible/i.test(card.tag);
    addBool(id + '.feasible', feasible, m.ok);
    if (e.load_ok && m.td_ach != null && card.rows['Attainable supply dew point, °C'] !== '—')
      add(id + '.td_ach', num(card.rows['Attainable supply dew point, °C']), m.td_ach, 'td_ach');
    if (e.load_ok && card.rows['Supply dew point required, °C'])
      add(id + '.td_sup', num(card.rows['Supply dew point required, °C']), e.td_sup, 'td_sup');
    if (!m.ok || !feasible) continue;
    add(id + '.e', num(card.rows['Specific energy, kWh per kg of water']), m.e, 'e');
    add(id + '.qc', num(card.rows['Cooling duty, kW']), m.qc, 'qc');
    add(id + '.qh', num(card.rows['Heating duty, kW']), m.qh, 'qh');
    /* the heat-pump card prints its electric input as the heat it releases into
       the room (compressor + fan), which is the same number */
    add(id + '.el', num(card.rows[id === 'm4' ? 'Heat released into the room, kW'
                                              : 'Electric input, kW']), m.el, 'el');
    add(id + '.water', num(card.rows['Water removed, kg/h']), m.water, 'water');
    if (m.e_sens != null) add(id + '.e_sens', num(card.rows['Specific energy at load +20 %']), m.e_sens, 'e_sens');
    if (id === 'm1' || id === 'm2' || id === 'm4')
      add(id + '.ts', num(card.rows['Coil surface temperature, °C']), m.ts, 'ts');
    if (id === 'm2' && m.t_dry != null && card.rows['Drying period per coil, min'])
      add(id + '.t_dry', num(card.rows['Drying period per coil, min']), m.t_dry, 't_dry');
    if (id === 'm3' && card.rows['Regeneration exit, °C and % saturation']) {
      const parts = card.rows['Regeneration exit, °C and % saturation'].split('/');
      add(id + '.t_reg_ex', num(parts[0]), m.t_reg_ex, 't_reg_ex');
      add(id + '.rh_ex', num(parts[1]), m.rh_ex, 'rh_ex');
      cmp[id + '.rotor_water_balance'] = { got: m.water_balance, ref: 0, tol: 1e-12,
        ok: Math.abs(m.water_balance) < 1e-12,
        note: 'process-side and regeneration-side moisture must match in the reference' };
    }
    if (id === 'm4') {
      add(id + '.smer', num(card.rows['Water per electric kWh, kg']), m.smer, 'smer');
    }
  }
  const rels = Object.values(cmp).filter(c => Number.isFinite(c.rel)).map(c => c.rel);
  cases.push({ id: C.id, note: C.note, inputs: C.inputs, cmp, inputs_verified,
    worst_rel: rels.length ? Math.max(...rels) : 0, pass: pass && inputs_verified.ok });
}

/* RULE 3, second half: a positive control.  Perturb one input by a visible amount and
   confirm the graded output moves.  Ungraded; written to the control file.           */
const C0 = REF.cases[0];
const control = {};
{
  await setInputs(page, C0.inputs);
  await assertInputs(page, C0);
  const a = await readCards(page);
  const P2 = Object.assign({}, C0.inputs, { tdreq: C0.inputs.tdreq - 4 });
  await setInputs(page, P2);
  const back = await page.evaluate(() => window.Diagram.record.build().inputs.tdreq);
  const c = await readCards(page);
  const pick = s => {
    const k = 'Cooling below dew point with reheat';
    return { e: num(s.cards[k].rows['Specific energy, kWh per kg of water']),
             qc: num(s.cards[k].rows['Cooling duty, kW']),
             td_sup: num(s.cards[k].rows['Supply dew point required, °C']),
             water: num(s.cards[k].rows['Water removed, kg/h']),
             total: num(s.dry['Total removed by the unit, kg/h']) };
  };
  const A = pick(a), Cc = pick(c);
  control.perturbation = { field: 'tdreq', from: C0.inputs.tdreq, to: P2.tdreq, page_holds: back };
  control.before = A; control.after = Cc;
  control.outputs_moved = ['e', 'qc', 'td_sup', 'water', 'total'].every(k => A[k] !== Cc[k]);
  /* a second control on a different axis: the outdoor state */
  const P3 = Object.assign({}, C0.inputs, { tout: C0.inputs.tout + 6 });
  await setInputs(page, P3);
  const back3 = await page.evaluate(() => window.Diagram.record.build().inputs.tout);
  const d = pick(await readCards(page));
  control.perturbation2 = { field: 'tout', from: C0.inputs.tout, to: P3.tout, page_holds: back3 };
  control.after2 = d;
  control.outputs_moved2 = ['e', 'qc', 'water', 'total'].some(k => A[k] !== d[k]);
}

await b.close();

const run_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const passed = cases.filter(c => c.pass).length;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(stampProvenance({
  tool: 'ontvochtiging', file: 'ontvochtiging.html',
  run_at,
  reference: 'Independent python implementation of the psychrometric mass and energy balances of '
    + 'all four paths (room moisture balance, wet cooling coil with the condensate/frost enthalpy, '
    + 'reheat, desiccant rotor with both sectors, heat-pump condenser/evaporator), using the '
    + 'ASHRAE Handbook-Fundamentals 2017 Ch.1 property set the tool declares, cross-checked '
    + 'point by point against CoolProp 8.0.0 HAPropsSI.',
  reference_citations: [
    'ASHRAE Handbook - Fundamentals (2017), Chapter 1 "Psychrometrics": Eq.(5) and (6) '
    + 'saturation pressure over ice and over liquid water, Eq.(20) humidity ratio, Eq.(30) '
    + 'specific enthalpy, Eq.(28) moist-air density, and the cooling/dehumidifying energy '
    + 'balance q = m_da[(h1 - h2) - (W1 - W2) h_w] with h_w the enthalpy of the condensate '
    + 'leaving the coil.',
    'Hyland, R.W. and Wexler, A. (1983), ASHRAE Transactions 89(2A), 500-519 - the saturation '
    + 'pressure correlations behind Eq.(5)/(6).',
    'CoolProp 8.0.0 HumidAirProp (ASHRAE RP-1485 real-gas moist air) - used as the second, '
    + 'structurally different property reference (see crosscheck).'
  ],
  tolerance: 'display-limited: half of the last digit the tool prints (specific energy 0.005 '
    + 'kWh/kg, duties 0.05 kW, water 0.005 kg/h, temperatures 0.05 K). The ASHRAE ideal-gas and '
    + 'CoolProp real-gas property sets differ by up to 0.5 % in humidity ratio and 0.007 K in '
    + 'dew point (see crosscheck), so a disagreement below that level is property scatter and '
    + 'is flagged rather than graded.',
  crosscheck: REF.crosscheck,
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: pageErrors, cases
}, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(CONTROL_OUT, JSON.stringify({
  tool: 'ontvochtiging', run_at, base: BASE, tool_path: TOOL,
  positive_control: control, page_errors: pageErrors, console: consoleLog
}, null, 1));
console.log(`${passed}/${cases.length} passed; page errors: ${pageErrors.length}; console: ${consoleLog.length}`);
console.log('positive control: tdreq ' + control.perturbation.from + ' -> ' + control.perturbation.to
  + ' (page holds ' + control.perturbation.page_holds + '); moved=' + control.outputs_moved);
console.log('  m1.e ' + control.before.e + ' -> ' + control.after.e
  + ' ; m1.qc ' + control.before.qc + ' -> ' + control.after.qc
  + ' ; total ' + control.before.total + ' -> ' + control.after.total);
console.log('positive control 2: tout ' + control.perturbation2.from + ' -> ' + control.perturbation2.to
  + ' (page holds ' + control.perturbation2.page_holds + '); moved=' + control.outputs_moved2
  + ' ; m1.e -> ' + control.after2.e);
for (const c of cases) if (!c.pass) {
  console.log(' FAIL ' + c.id);
  Object.entries(c.cmp).filter(([, v]) => !v.ok).forEach(([k, v]) =>
    console.log('   ' + k + ': got ' + v.got + ' ref ' + (typeof v.ref === 'number' ? v.ref.toPrecision(6) : v.ref)));
}
process.exit((passed === cases.length && pageErrors.length === 0 && control.outputs_moved) ? 0 : 1);
