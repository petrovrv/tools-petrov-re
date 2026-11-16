import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'reference values recomputed independently by bench-src/ref/gen_methane_emissions.py (EPA Subpart W W-1A / API Compendium 2021 factors)' };
const P = benchPaths({ name: 'methane_emissions', page: 'methane_emissions.html', ref: 'methane_emissions_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const TOL = 1e-9;
const KEYS = ['total_t_y', 'reported_t_y', 'co2e_t_y', 'intensity_pct', 'reported_m3_iso_y', 'pneumatic', 'fugitive', 'compressor', 'tank', 'venting', 'flaring'];
const CATS = ['pneumatic', 'fugitive', 'compressor', 'tank', 'venting', 'flaring'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const p = await browser.newPage();
const page_errors = [];
p.on('pageerror', e => page_errors.push(String(e && e.message || e)));
await p.goto(P.pageUrl + '?lang=en');
await sleep(800);
const BUILD = await readPageManifestRevision(p);
const cases = [];
for (const cc of REF) {
  const rec = { id: cc.id, note: cc.note, inputs: cc.inputs, cmp: {}, worst_rel: 0, pass: true };
  try {
    await p.evaluate(inputs => {
      const a = window.__methane_emissions; const s = a.state;
      const has = k => Object.prototype.hasOwnProperty.call(inputs, k);
      if (has('xCH4')) s.xCH4 = inputs.xCH4;
      if (has('hours')) s.hours = inputs.hours;
      if (has('counts') && inputs.counts) for (const k of Object.keys(inputs.counts)) s['c_' + k] = inputs.counts[k];
      if (has('tankOil_m3_y')) s.tankOil = inputs.tankOil_m3_y;
      if (has('blowdowns')) {
        const b = Array.isArray(inputs.blowdowns) ? inputs.blowdowns[0] : undefined;
        if (b) { s.bdVol = b.volM3; s.bdP = b.pKPa * 1000; s.bdT = b.tK; s.bdN = b.n; } else s.bdN = 0;
      }
      if (has('flareGas_kg_y')) s.flareGas = inputs.flareGas_kg_y;
      if (has('flareXCH4_mass')) s.flareX = inputs.flareXCH4_mass;
      if (has('flareDRE')) s.flareDRE = inputs.flareDRE;
      if (has('measured_t_y')) s.measured = inputs.measured_t_y == null ? 0 : inputs.measured_t_y;
      if (has('gwp')) s.gwp = inputs.gwp;
      if (has('ogmpLevel')) s.ogmpLevel = inputs.ogmpLevel;
      if (has('gasThroughput_t_y')) s.gasThroughput = inputs.gasThroughput_t_y;
      s.level = 'full';
      a.ui.sync(); a.ui.run();
    }, cc.inputs);
    await sleep(120);
    const got = await p.evaluate(cats => {
      const o = Diagram.record.build().outputs || {};
      const u = v => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
      const r = {};
      for (const k of ['total_t_y', 'reported_t_y', 'co2e_t_y', 'intensity_pct', 'reported_m3_iso_y']) r[k] = u(o[k]);
      for (const k of cats) r[k] = u(o['cat_' + k + '_t_y']);
      return r;
    }, CATS);
    for (const k of KEYS) {
      const exp = cc.ref[k];
      if (exp === undefined) continue;
      const g = got[k];
      let ok, rel = null;
      if (exp === null) ok = g == null || !Number.isFinite(g);
      else if (exp === 0) { rel = Number.isFinite(g) ? Math.abs(g) : Infinity; ok = rel <= 1e-12; }
      else { rel = Number.isFinite(g) ? Math.abs(g - exp) / Math.abs(exp) : Infinity; ok = rel <= TOL; }
      if (rel !== null && rel > rec.worst_rel) rec.worst_rel = rel;
      rec.cmp[k] = { got: g ?? null, ref: exp, rel, ok };
      if (!ok) rec.pass = false;
    }
  } catch (e) { rec.pass = false; rec.error = String(e && e.message || e); }
  cases.push(rec);
}
await browser.close();
const total = cases.length, passed = cases.filter(c => c.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({ tool: 'methane_emissions', file: 'methane_emissions.html', reference: 'independent Python re-implementation of EPA Subpart W W-1A / API Compendium 2021 factors via bench-src/ref/gen_methane_emissions.py', reference_citations: ['US EPA 40 CFR Part 98 Subpart W, Table W-1A', 'API Compendium of GHG Emissions Methodologies for the Oil and Natural Gas Industry (2021)', 'OGMP 2.0 Reporting Framework (2020)', 'IPCC AR6 WG1 Ch.7 Table 7.15', 'ISO 13443:1996 clause 3, Annex B Eq. (B.1) (ideal-gas CH4 volume at 15 °C / 101.325 kPa)'], tolerance: 'relative 1e-9 on record outputs', total, passed, failed, page_errors, cases }, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`methane_emissions: ${passed}/${total} passed`);
for (const c of cases) if (!c.pass) console.log(`FAIL ${c.id}: ${Object.keys(c.cmp).filter(k => !c.cmp[k].ok).join(', ')}${c.error ? ' error=' + c.error : ''}`);
console.log(`page errors: ${page_errors.length}`);
process.exitCode = 0;
