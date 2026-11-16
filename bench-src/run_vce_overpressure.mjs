import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'reference values recomputed independently by bench-src/ref/gen_vce_overpressure.py (Sachs scaling, Multi-Energy and BST curve interpolation and distance search re-implemented in Python; chart data = raw digitized points of the published charts; Y cases = published Yellow Book CPR14E 2005 worked example)' };
const name = 'vce_overpressure', page = 'vce_overpressure.html', ref = 'vce_overpressure_ref.json';
const P = benchPaths({ name, page, ref });
const TOL = 1e-9;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unwrap = v => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
function cmpKey(got, want, tol) {
  if (typeof want === 'boolean' || typeof want === 'string') { const ok = got === want; return { got, ref: want, rel: ok ? 0 : Infinity, ok }; }
  if (want === null) { const ok = got === null || got === undefined || !Number.isFinite(got); return { got, ref: want, rel: ok ? 0 : Infinity, ok }; }
  if (typeof got !== 'number' || !Number.isFinite(got)) return { got, ref: want, rel: Infinity, ok: false };
  if (want === 0) { const rel = Math.abs(got); return { got, ref: want, rel, ok: rel <= 1e-12 }; }
  const rel = Math.abs(got - want) / Math.abs(want);
  return { got, ref: want, rel, ok: rel <= tol };
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
  const rec = { id: cc.id, note: cc.note, tol: cc.tol || TOL, published: !!cc.published, inputs: cc.inputs, cmp: {}, worst_rel: 0, pass: false };
  try {
    await p.evaluate(inputs => { const a = window.__vce_overpressure; const s2 = Object.assign({}, inputs); if ('T_K' in s2) { s2.T_C = s2.T_K - 273.15; delete s2.T_K; } delete s2.thresholds_Pa; Object.assign(a.state, s2, { level: 'full' }); a.ui.sync(); a.ui.run(); }, cc.inputs);
    await sleep(120);
    const o = await p.evaluate(() => Diagram.record.build().outputs);
    let pass = true, worst = 0;
    for (const k of Object.keys(cc.ref)) {
      const c = cmpKey(unwrap(o ? o[k] : undefined), cc.ref[k], cc.tol || TOL);
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
  reference: 'independent Python implementation (bench-src/ref/gen_vce_overpressure.py): Sachs scaling, Multi-Energy strength interpolation and BST ln-Mf interpolation with scan + bisection distance search; blast-chart data = raw points digitized from the published charts (Yellow Book Fig. 5.8A/C; Tang & Baker 1999 via DNV OREM Fig. 6), evaluated on the raw points, not on the tool grid; plus the published Yellow Book worked example',
  reference_citations: ['TNO Yellow Book CPR14E, 3rd ed. (2005) ch. 5, Fig. 5.8A/C, worked example 5.6.2-5.6.3 Tables 5.6 and 5.7B', 'Tang M.J., Baker Q.A. (1999) Process Safety Progress 18(4) 235-240, blast curves as reproduced in DNV Phast OREM Theory (2026) Fig. 6', 'Pierorazio A.J. et al. (2005) Process Safety Progress 24(1) 59-65', 'CCPS (2010) Guidelines for Vapor Cloud Explosion, Pressure Vessel Burst, BLEVE and Flash Fire Hazards, 2nd ed.'],
  tolerance: 'per case: C1-C8 relative 3 % (independent evaluation on the raw digitized chart points vs the tool table resampled on its grid); Y1-Y7 relative 10 % vs the published Yellow Book CPR14E 2005 worked example (Tables 5.6, 5.7B); null = threshold not reached',
  total, passed, failed, page_errors, cases
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`vce_overpressure: ${passed}/${total} passed`);
for (const c of cases.filter(c => !c.pass)) {
  const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok).map(([k, v]) => `${k} got=${v.got} ref=${v.ref} rel=${v.rel}`).join('; ');
  console.log(`FAIL ${c.id}: ${c.error ? 'error=' + c.error : bad}`);
}
console.log(`page errors: ${page_errors.length}`);
process.exitCode = 0;
