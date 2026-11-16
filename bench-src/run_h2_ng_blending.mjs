import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'reference values recomputed independently by bench-src/ref/gen_h2_ng_blending.py (ISO 6976:2016 properties and EN 16726 window re-implemented in Python)' };
const name = 'h2_ng_blending', page = 'h2_ng_blending.html', ref = 'h2_ng_blending_ref.json';
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
    await p.evaluate(inputs => { const a = window.__h2_ng_blending; Object.assign(a.state, JSON.parse(JSON.stringify(window.OGH.h2_ng_blending.defaults)), inputs, { level: 'full' }); a.ui.sync(); a.ui.run(); }, cc.inputs);
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
  reference: 'independent Python re-implementation (bench-src/ref/gen_h2_ng_blending.py) of ISO 6976:2016 real-gas calorific value, relative density and Wobbe index, the EN 16726 H-gas window check, bisection for the maximum hydrogen fraction and combustion CO2 per GJ (HHV)',
  reference_citations: ['ISO 6976:2016 (2016-08) Natural gas - Calculation of calorific values, density, relative density and Wobbe indices from composition', 'EN 16726:2015+A1:2018 (2018-08) Gas infrastructure - Quality of gas - Group H', 'Melaina M.W., Antonia O., Penev M. (2013) Blending Hydrogen into Natural Gas Pipeline Networks, NREL/TP-5600-51995'],
  tolerance: 'relative 2e-3 on record outputs (independent ISO 6976 implementation); governing constraint exact',
  total, passed, failed, page_errors, cases
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`h2_ng_blending: ${passed}/${total} passed`);
for (const c of cases.filter(c => !c.pass)) {
  const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok).map(([k, v]) => `${k} got=${v.got} ref=${v.ref} rel=${v.rel}`).join('; ');
  console.log(`FAIL ${c.id}: ${c.error ? 'error=' + c.error : bad}`);
}
console.log(`page errors: ${page_errors.length}`);
process.exitCode = 0;
