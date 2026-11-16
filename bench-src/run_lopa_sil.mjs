import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'reference values recomputed independently by bench-src/ref/gen_lopa_sil.py (written by Claude from CCPS LOPA 2001, IEC 61511-1 Tables 4 and 6, IEC 61508-6 B.3.2.2 general PFDavg equations; not ported from the JS)' };
const name = 'lopa_sil', page = 'lopa_sil.html', ref = 'lopa_sil_ref.json';
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
    await p.evaluate(inputs => { const a = window.__lopa_sil; const s2 = { level: 'full', ie: inputs.ie, f_ie: inputs.f_ie, p_enable: inputs.p_enable, p_ign: inputs.p_ign, p_occ: inputs.p_occ, p_vuln: inputs.p_vuln, f_target: Number(inputs.f_target).toExponential(0).replace('e+', 'e') }; for (let i = 1; i <= 4; i++) { const x = inputs.ipls[i - 1]; s2['ipl' + i] = x ? x.type : 'none'; if (x && x.type === 'custom') s2['ipl' + i + '_pfd'] = x.pfd; } const f = inputs.sif; s2.sif = f ? 'yes' : 'no'; if (f) { s2.arch = f.arch; s2.lam_e6 = f.lambdaDU_h * 1e6; s2.TI_mo = f.TI_h / 730; s2.beta_pct = f.beta * 100; } Object.assign(a.state, s2); a.ui.sync(); a.ui.run(); }, cc.inputs);
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
  reference: 'independent Python implementation (bench-src/ref/gen_lopa_sil.py) written from CCPS LOPA (2001), IEC 61511-1:2016+A1:2017 Table 4 (by RRF) and Table 6 (HFT), IEC 61508-6:2010 B.3.2.2 general tCE/tGE PFDavg equations',
  reference_citations: ['IEC 61511-1:2016+AMD1:2017', 'IEC 61508-6:2010 Annex B', 'CCPS, Layer of Protection Analysis (2001)'],
  tolerance: 'relative 1e-9 on record outputs; SIL integers and meets flag exact',
  total, passed, failed, page_errors, cases
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`lopa_sil: ${passed}/${total} passed`);
for (const c of cases.filter(c => !c.pass)) {
  const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok).map(([k, v]) => `${k} got=${v.got} ref=${v.ref} rel=${v.rel}`).join('; ');
  console.log(`FAIL ${c.id}: ${c.error ? 'error=' + c.error : bad}`);
}
console.log(`page errors: ${page_errors.length}`);
process.exitCode = 0;
