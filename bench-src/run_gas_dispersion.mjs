import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'reference values recomputed independently by bench-src/ref/gen_gas_dispersion.py (Gaussian plume with Briggs rural sigmas and Britter-McQuaid workbook re-implemented in Python)' };
const name = 'gas_dispersion', page = 'gas_dispersion.html', ref = 'gas_dispersion_ref.json';
const P = benchPaths({ name, page, ref });
const TOL = 1e-9;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unwrap = v => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
function cmpKey(got, want) {
  if (typeof want === 'boolean' || typeof want === 'string') { const ok = got === want; return { got, ref: want, rel: ok ? 0 : Infinity, ok }; }
  if (want === null) { const ok = got === null || got === undefined || !Number.isFinite(got); return { got, ref: want, rel: ok ? 0 : Infinity, ok }; }
  if (typeof got !== 'number' || !Number.isFinite(got)) return { got, ref: want, rel: Infinity, ok: false };
  if (want === 0) { const rel = Math.abs(got); return { got, ref: want, rel, ok: rel <= 1e-12 }; }
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
for (const cc of REF) {
  const rec = { id: cc.id, note: cc.note, inputs: cc.inputs, cmp: {}, worst_rel: 0, pass: false };
  try {
    await p.evaluate(inputs => { const a = window.__gas_dispersion; const s2 = Object.assign({}, inputs); if ('T_K' in s2) { s2.T_C = s2.T_K - 273.15; delete s2.T_K; } Object.assign(a.state, s2, { level: 'full' }); a.ui.sync(); a.ui.run(); }, cc.inputs);
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
  reference: 'independent Python re-implementation (bench-src/ref/gen_gas_dispersion.py): Gaussian plume with Briggs 1973 rural sigmas (doubling + bisection search) and Britter-McQuaid 1988 continuous dense-gas workbook',
  reference_citations: ['TNO Yellow Book CPR14E (2005) ch. 4', 'CCPS Guidelines for Consequence Analysis of Chemical Releases (1999)', 'Briggs G.A. (1973) Diffusion estimation for small emissions, ATDL-106', 'Britter R.E., McQuaid J. (1988) Workbook on the dispersion of dense gases, HSE CRR 17/1988'],
  tolerance: 'relative 1e-9 on record outputs; model label exact',
  total, passed, failed, page_errors, cases
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`gas_dispersion: ${passed}/${total} passed`);
for (const c of cases.filter(c => !c.pass)) {
  const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok).map(([k, v]) => `${k} got=${v.got} ref=${v.ref} rel=${v.rel}`).join('; ');
  console.log(`FAIL ${c.id}: ${c.error ? 'error=' + c.error : bad}`);
}
console.log(`page errors: ${page_errors.length}`);
process.exitCode = 0;
