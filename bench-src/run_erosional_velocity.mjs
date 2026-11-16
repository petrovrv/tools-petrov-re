import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const P = benchPaths({ name: 'erosional_velocity', page: 'erosional_velocity.html', ref: 'erosional_velocity_ref.json' });
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Reference values recomputed by bench-src/ref/gen_erosional_velocity.py, an independent stdlib-only Python implementation of API RP 14E eq. 2.14 in US field units with exact unit conversions, sharing no code with the page. Driver written by Claude.' };
const KEYS = ['C', 'rhom', 'Ve', 'Vm', 'ratio', 'Dmin', 'Qm', 'lambda'];
const WARN = { exceeds: /exceeds API RP 14E/, c150: /C>150/, sand: /not valid with sand/ };
const CONV = {};
const unwrap = v => (v !== null && typeof v === 'object' && 'value' in v) ? v.value : v;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const browser = await chromium.launch();
const p = await browser.newPage();
const page_errors = [];
p.on('pageerror', e => page_errors.push(String((e && e.message) || e)));
await p.goto(P.pageUrl + '?lang=en');
await p.waitForTimeout(800);
const BUILD = await readPageManifestRevision(p);
const cases = [];
for (const c of REF) {
  const inp = c.inp;
  const rec = { id: c.id, note: c.note, expect: c.expect, inputs: inp, cmp: {}, worst_rel: 0, pass: false };
  let o = {};
  try {
    await p.evaluate(i => {
      const a = window.__erosional_velocity; const { mg, ml, rhog, rhol, D } = i; const full = i.C != null || i.solids === true; Object.assign(a.state, { mg, ml, rhog, rhol, D, level: full ? 'full' : 'simple', C: i.C == null ? 100 : i.C, solids: i.solids === true }); a.ui.sync(); a.ui.run();
    }, inp);
    await p.waitForTimeout(300);
    const recd = (await p.evaluate(() => { const r = Diagram.record.build(); return { outputs: r.outputs || {}, warnings: r.warnings || [] }; })) || {};
    o = recd.outputs || {}; rec.warnings = recd.warnings || [];
  } catch (e) { rec.error = String((e && e.message) || e); }
  const got = {};
  for (const k of KEYS) { let v = unwrap(o[k]); if (isNum(v) && CONV[k]) v = CONV[k](v); got[k] = v === undefined ? null : v; }
  if (c.expect === 'refuse') {
    for (const k of KEYS) rec.cmp[k] = { got: got[k], exp: null, rel: null, ok: !isNum(got[k]) };
    rec.worst_rel = null;
    rec.pass = KEYS.every(k => rec.cmp[k].ok);
  } else {
    let worst = 0;
    for (const k of KEYS) {
      if (c.ref[k] === undefined) continue;
      const exp = c.ref[k], g = got[k];
      let rel = Infinity, ok = false;
      if (isNum(g) && isNum(exp)) {
        const diff = Math.abs(g - exp);
        if (exp === 0) { rel = diff; ok = diff <= 1e-12; } else { rel = diff / Math.abs(exp); ok = rel <= 1e-9; }
      }
      rec.cmp[k] = { got: g, exp, rel: Number.isFinite(rel) ? rel : null, ok };
      worst = Math.max(worst, rel);
    }
    rec.worst_rel = Number.isFinite(worst) ? worst : null;
    const wg = {}; for (const k in WARN) wg[k] = (rec.warnings || []).some(w => WARN[k].test(String(w)));
    rec.warn_cmp = { got: wg, exp: c.ref.warn };
    const wok = Object.keys(WARN).every(k => wg[k] === !!(c.ref.warn || {})[k]);
    rec.pass = !rec.error && wok && Object.keys(rec.cmp).every(k => rec.cmp[k].ok);
  }
  cases.push(rec);
}
await browser.close();
const total = cases.length;
const passed = cases.filter(c => c.pass).length;
const failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'erosional_velocity', file: 'erosional_velocity.html',
  reference: 'independent stdlib-Python API RP 14E eq. 2.14 implementation in US field units (bench-src/ref/gen_erosional_velocity.py)',
  reference_citations: ['API RP 14E, 5th ed. (1991-10, reaffirmed 2013), Sect. 2.5, eq. 2.14', 'DNV-RP-O501 (2015-08), sand erosion (warning only)'],
  tolerance: 'relative 1e-9 per output (absolute 1e-12 when the reference is 0); only keys present in the case reference are compared; refused inputs pass only if no numeric outputs; warning flags (Vm/Ve > 1, C > 150, sand) must match',
  total, passed, failed, page_errors, cases
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`erosional_velocity: ${passed}/${total} passed`);
for (const c of cases.filter(x => !x.pass)) {
  const bad = KEYS.filter(k => c.cmp[k] && !c.cmp[k].ok).map(k => `${k} got=${c.cmp[k].got} exp=${c.cmp[k].exp}`).join('; ');
  console.log(`FAIL ${c.id} [${c.expect}]: ${bad} warn=${JSON.stringify(c.warn_cmp)}${c.error ? ` error=${c.error}` : ''}`);
}
if (page_errors.length) console.log(`page errors: ${page_errors.length}`);
process.exitCode = 0;
