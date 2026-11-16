import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'reference values recomputed independently by bench-src/ref/gen_h2_fuel_conversion.py (CODATA + Kirchhoff calorific values, CoolProp densities, RED/IPCC factors in Python)' };
const name = 'h2_fuel_conversion', page = 'h2_fuel_conversion.html', ref = 'h2_fuel_conversion_ref.json';
const P = benchPaths({ name, page, ref });
const TOL = 2e-3;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unwrap = v => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
function cmpKey(got, want) {
  if (typeof want === 'string') { const ok = String(got) === want; return { got, ref: want, rel: ok ? 0 : Infinity, ok }; }
  if (typeof want === 'boolean') { const ok = got === want; return { got, ref: want, rel: ok ? 0 : Infinity, ok }; }
  if (want === null) { const ok = got === null || got === undefined || !Number.isFinite(got); return { got, ref: want, rel: ok ? 0 : Infinity, ok }; }
  if (typeof got !== 'number' || !Number.isFinite(got)) return { got, ref: want, rel: Infinity, ok: false };
  if (want === 0) { const rel = Math.abs(got); return { got, ref: want, rel, ok: rel <= 1e-9 }; }
  const rel = Math.abs(got - want) / Math.abs(want);
  return { got, ref: want, rel, ok: rel <= TOL };
}
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const browser = await chromium.launch();
const p = await browser.newPage();
const page_errors = [];
p.on('pageerror', e => page_errors.push(String(e && e.message || e)));
await p.goto(P.pageUrl + '?lang=en');
await sleep(800);
const BUILD = await readPageManifestRevision(p);
const cases = [];
for (const cc of REF.cases) {
  const rec = { id: cc.id, note: cc.note, inputs: cc.inputs, cmp: {}, worst_rel: 0, pass: false };
  try {
    await p.evaluate(inputs => { const a = window.__h2_fuel_conversion; Object.assign(a.state, JSON.parse(JSON.stringify(window.OGH.h2_fuel_conversion.defaults)), inputs, { level: 'full' }); a.ui.sync(); a.ui.run(); }, cc.inputs);
    await sleep(120);
    const o = await p.evaluate(() => Diagram.record.build().outputs);
    let pass = true, worst = 0;
    for (const k of Object.keys(cc.ref)) {
      const c = cmpKey(unwrap(o ? o[k] : undefined), cc.ref[k]);
      rec.cmp[k] = c;
      if (!c.ok) pass = false;
      if (!(c.rel <= worst)) worst = c.rel;
    }
    rec.worst_rel = worst;
    rec.pass = pass;
  } catch (e) {
    rec.error = String(e && e.message || e);
    rec.pass = false;
  }
  cases.push(rec);
}
await browser.close();
const total = cases.length, passed = cases.filter(c => c.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: name, file: page,
  reference: 'independent Python implementation (bench-src/ref/gen_h2_fuel_conversion.py): calorific values from CODATA enthalpies of formation with Kirchhoff correction and IAPWS-95 water vaporisation (CoolProp), real-gas densities from CoolProp 8.0 Leachman hydrogen, RED Annex III and IPCC 2006 factors, ISO 14687:2019 Grade D limits',
  reference_citations: ['ISO 14687:2019 Hydrogen fuel quality - Product specification (2019-11)', 'ISO 6976:2016 Natural gas - Calculation of calorific values (2016-08)', 'Cox J.D., Wagman D.D., Medvedev V.A. (1989) CODATA Key Values for Thermodynamics', 'Directive (EU) 2018/2001 Annex III', 'IPCC (2006) Guidelines for National GHG Inventories Vol. 2 Table 1.4', 'Leachman J.W. et al. (2009) J. Phys. Chem. Ref. Data 38:721'],
  tolerance: 'relative 2e-3 on record outputs (independent thermochemical data); grade flags exact',
  total, passed, failed, page_errors, cases
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`h2_fuel_conversion: ${passed}/${total} passed`);
for (const c of cases.filter(c => !c.pass)) {
  const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok).map(([k, v]) => `${k} got=${v.got} ref=${v.ref} rel=${v.rel}`).join('; ');
  console.log(`FAIL ${c.id}: ${c.error ? 'error=' + c.error : bad}`);
}
console.log(`page errors: ${page_errors.length}`);
process.exitCode = 0;
