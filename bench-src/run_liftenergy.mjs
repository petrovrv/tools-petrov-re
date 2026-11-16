// Benchmark driver for liftenergy.html.
// Reference: bench-src/ref/gen_liftenergy.py (independent Python implementation of ISO 25745-2:2015 Tables 1-7,
// Formulae (1)-(18) + VDI 4707-1:2009 classes, draft 2007 as legacy) -> ref/liftenergy_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8796 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_liftenergy.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_liftenergy.py, an independent Python implementation written from ISO 25745-2:2015 Tables 1-7 (Table 2 per the 2015 text, Amd.1:2023 not read; hydraulic kL with the ISO/DIS sign +), Formulae (1)-(18) and Annex B (licensed text, bw-r1 D-BW-8), VDI 4707 Blatt 1 (2009) Tables 1-3 and Eq. 1 as reprinted by Zukunft Bau (2015) and the VDI 4707 draft (2007) Tables 1-4 (legacy); not from the page code. The worked examples and two VDI 4707-1:2009 certificates are also compared with the numbers printed in those sources; the ref itself recomputes the Barney & Lorente examples with their rounded inputs (kL, s_av) to <= 0.05 % or the printed whole Wh.' };
const P = benchPaths({ name: 'liftenergy', page: 'liftenergy.html', ref: 'liftenergy_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__liftenergy && window.__liftenergy.last, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const NUM = ['nd', 'pav', 'pctQ', 'kL', 'Rid', 'Erc', 'Erav', 'Erd', 't_av', 'Enr', 'Ed', 'Ey', 'vdi_spec', 'vdi_year', 'iso_Espc'];
const EXACT = ['cat', 'vdi_cat', 'vdi_standby', 'vdi_travel', 'vdi_overall', 'saturated', 'iso_cls', 'iso_lvl'];
const REL = 1e-9;
const results = [];
for (const c of ref) {
  let g = null;
  try {
    g = await p.evaluate(st => {
      const M = window.__liftenergy, s = M.state;
      Object.keys(st).forEach(k => { s[k] = st[k]; });
      s.origin = 'bench';
      M.ui.sync(); M.ui.run();
      if (!M.last) {
        const vt = (document.querySelector('.dgu-verdict') || {}).textContent || '';
        return { refused: M.err || 'none', verdict: vt.trim().slice(0, 160) };
      }
      const r = M.last.r;
      const tile = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { cat: r.cat, nd: r.nd, pav: r.pav, pctQ: r.pctQ, kL: r.kL, Rid: r.Rid, Erc: r.Erc, Erav: r.Erav, Erd: r.Erd, t_av: r.t_av, Enr: r.Enr, Ed: r.Ed, Ey: r.Ey,
        vdi_cat: r.vdi.cat, vdi_standby: r.vdi.cls_standby, vdi_travel: r.vdi.cls_travel, vdi_spec: r.vdi.e_spec, vdi_overall: r.vdi.cls_total, vdi_year: r.vdi.year_kWh, saturated: r.flags.indexOf('saturated') >= 0,
        iso_cls: r.iso.cls, iso_Espc: r.iso.Espc, iso_lvl: [r.iso.lvl_running, r.iso.lvl_idle, r.iso.lvl_st5, r.iso.lvl_st30].join(','),
        isoRow: Array.from(document.querySelectorAll('td')).map(t => t.textContent.trim()).filter(t => /mWh\/\(kg·m\) · \d/.test(t))[0] || null,
        tileYear: tile[0] || null, tileClass: tile[2] || null };
    }, c.state);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!g;
  if (e.refused) {
    /* ISO/DIS category 6 without user %Q / R_id: the page must refuse and say why (CR-7) */
    const ok = !!g && g.refused === e.refused && /6/.test(g.verdict || '');
    results.push({ id: c.id, note: c.note, inputs: c.state, cmp: { refused: { got: g ? [g.refused, g.verdict] : null, exp: e.refused, ok } }, pass: ok });
    continue;
  }
  if (g && g.refused) pass = false;
  for (const k of NUM) { const ok = !!g && Math.abs(g[k] - e[k]) <= REL * Math.max(1, Math.abs(e[k])); cmp[k] = { got: g ? g[k] : null, exp: e[k], ok }; if (!ok) pass = false; }
  if (Array.isArray(e.iso_lvl)) e.iso_lvl = e.iso_lvl.join(',');
  for (const k of EXACT) { const ok = !!g && g[k] === e[k]; cmp[k] = { got: g ? g[k] : null, exp: e[k], ok }; if (!ok) pass = false; }
  // what the reader sees: the headline tiles show the annual energy (rounded, en grouping) and the overall class
  const yr = g && Number(String(g.tileYear).replace(/[^\d.]/g, ''));
  const scrOk = !!g && Math.abs(yr - Math.round(e.Ey)) <= 1 && g.tileClass === e.vdi_overall;
  cmp.screen = { got: g ? [g.tileYear, g.tileClass] : null, exp: [Math.round(e.Ey), e.vdi_overall], ok: scrOk };
  if (!scrOk) pass = false;
  // the ISO 25745-2:2015 Table 7 class is printed in the parameter table
  const isoScr = !!g && !!g.isoRow && g.isoRow.indexOf(e.iso_cls + ' · ') === 0;
  cmp.screen_iso = { got: g ? g.isoRow : null, exp: e.iso_cls, ok: isoScr };
  if (!isoScr) pass = false;
  if (c.published) {
    const pb = c.published;
    for (const k of ['Ed', 'Enr', 'Erd', 'vdi_spec', 'vdi_year']) if (k in pb) {
      const tol = pb.tol_abs != null ? pb.tol_abs : Math.abs(pb[k]) * pb.tol_rel;
      const ok = !!g && Math.abs(g[k] - pb[k]) <= tol; cmp['published_' + k] = { got: g ? g[k] : null, exp: pb[k], tol, ok }; if (!ok) pass = false;
    }
    for (const k of ['vdi_overall', 'vdi_standby', 'vdi_travel', 'vdi_cat', 'iso_cls']) if (k in pb) { const ok = !!g && g[k] === pb[k]; cmp['published_' + k] = { got: g ? g[k] : null, exp: pb[k], ok }; if (!ok) pass = false; }
  }
  results.push({ id: c.id, note: c.note, inputs: c.state, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'liftenergy',
  file: 'liftenergy.html',
  reference: 'bench-src/ref/gen_liftenergy.py — independent Python implementation of ISO 25745-2:2015 (Tables 1-7, Formulae 1-18, Annex B; licensed text), VDI 4707-1:2009 classes (Zukunft Bau 2015 reprint, Schindler certificates) and the VDI 4707 draft 2007 as legacy',
  reference_citations: [
    'ISO 25745-2:2015 Energy performance of lifts, escalators and moving walks — Part 2: Energy calculation and classification for lifts, Tables 1-7, Formulae (1)-(18), Annex B; Amd.1:2023 not read (Table 2 per the 2015 text); hydraulic kL with the ISO/DIS sign + (2015 print of (9)-(11) shows -, taken as a misprint)',
    'Barney G., Lorente A. (2013) Simplified Energy Calculations for Lifts Based on ISO/DIS 25745-2, 3rd Symposium on Lift and Escalator Technologies — worked examples 1-2 (their DIS car load entered as an override)',
    'VDI 4707 Blatt 1 (March 2009) Lifts — Energy efficiency, Tables 1-3, Eq. 1, as reprinted in Unholzer, Michl, Luetzkendorf: Energiekennwerte von Personenaufzuegen, Forschungsinitiative Zukunft Bau, final report May 2015, Tables 3, 5, 6, 7',
    'Schindler, VDI 4707 Energy Efficiency Label for Elevators (brochure): certificates Schindler 3300 AP (16.04.2010) and 7000 (13.04.2010), Reference VDI 4707 Part 1 (Issue March 2009)',
    'VDI 4707 Blatt 1 draft (December 2007) Lifts — Energy efficiency, Tables 1-4, §4.5, §4.7 worked example (legacy option)'
  ],
  tolerance: 'relative 1e-9 on every number (same formulae, double precision); exact on usage categories and class letters; headline tiles must show the rounded annual kWh and the overall class; saturation flag exact; worked examples and certificates must match the printed numbers within the rounding of their printed inputs (0.6 % Barney & Lorente with unrounded kL and s_av, 0.02 mWh/(kg m) VDI draft example, 0.1-0.2 % certificates)',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`liftenergy: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
