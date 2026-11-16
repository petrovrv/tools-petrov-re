import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const P = benchPaths({ name: 'separator_sizing', page: 'separator_sizing.html', ref: 'separator_sizing_ref.json' });
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Reference values recomputed by bench-src/ref/gen_separator_sizing.py, an independent stdlib-only Python implementation of the Souders-Brown separator sizing method (GPSA Engineering Data Book Sect. 7; API Spec 12J). It shares no code with the page under test.' };
const KEYS = ['vmax', 'D', 'Dsel', 'L', 'vg', 'Vliq', 'Vvessel', 'hLiq', 'tres', 'ts'];
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
      const a = window.__separator_sizing; const { orient, Qg, rhog, rhol, Ql, fill, tr, LD } = i; Object.assign(a.state, { orient, Qg, rhog, rhol, Ql, fill, tr, LD, level: i.K == null ? 'simple' : 'full', K: i.K == null ? a.state.K : i.K }); a.ui.sync(); a.ui.run();
    }, inp);
    await p.waitForTimeout(300);
    o = (await p.evaluate(() => Diagram.record.build().outputs || {})) || {};
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
    rec.pass = !rec.error && Object.keys(rec.cmp).every(k => rec.cmp[k].ok);
  }
  cases.push(rec);
}
await browser.close();
const total = cases.length;
const passed = cases.filter(c => c.pass).length;
const failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'separator_sizing', file: 'separator_sizing.html',
  reference: 'independent stdlib-Python Souders-Brown implementation (bench-src/ref/gen_separator_sizing.py)',
  reference_citations: ['GPSA Engineering Data Book, 14th ed. (2017), Sect. 7', 'API Spec 12J, 8th ed. (2008)', 'Souders M., Brown G.G. (1934) Ind. Eng. Chem. 26:98'],
  tolerance: 'relative 1e-9 per output (absolute 1e-12 when the reference is 0); only keys present in the case reference are compared; refused inputs pass only if no numeric outputs',
  total, passed, failed, page_errors, cases
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`separator_sizing: ${passed}/${total} passed`);
for (const c of cases.filter(x => !x.pass)) {
  const bad = KEYS.filter(k => c.cmp[k] && !c.cmp[k].ok).map(k => `${k} got=${c.cmp[k].got} exp=${c.cmp[k].exp}`).join('; ');
  console.log(`FAIL ${c.id} [${c.expect}]: ${bad}${c.error ? ` error=${c.error}` : ''}`);
}
if (page_errors.length) console.log(`page errors: ${page_errors.length}`);
process.exitCode = 0;
