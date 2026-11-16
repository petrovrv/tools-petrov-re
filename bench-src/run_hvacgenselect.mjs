import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Reference values are recomputed by the independent stdlib-Python reference bench-src/ref/gen_hvacgenselect.py from the frozen engine input tables in bench-src/ref/hvacgenselect_model.json, not copied from engine output.' };
const P = benchPaths({ name: 'hvacgenselect', page: 'hvacgenselect.html', ref: 'hvacgenselect_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const browser = await chromium.launch(); const p = await browser.newPage();
const page_errors = []; p.on('pageerror', e => page_errors.push(String(e && e.message || e)));
await p.goto(P.pageUrl + '?lang=en');
await p.waitForFunction(() => !!(window.HvacSelect && window.__hvacgenselect), null, { timeout: 15000 }); await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const LOOSE = new Set(['scores', 'base', 'criteria', 'gap']);
const rootOf = path => path.split(/[.[]/)[0];
function cmp(e, g, path, out) {
  if (e === null) { if (g !== null) out.push({ path, got: g === undefined ? '<missing>' : g, exp: null }); return; }
  if (g === undefined) { out.push({ path, got: '<missing>', exp: e }); return; }
  if (typeof e === 'number') {
    const tol = LOOSE.has(rootOf(path)) ? 1.5e-4 : 1e-9 * Math.max(1, Math.abs(e));
    if (typeof g !== 'number' || !(Math.abs(g - e) <= tol)) out.push({ path, got: g, exp: e });
    return;
  }
  if (typeof e === 'string' || typeof e === 'boolean') { if (g !== e) out.push({ path, got: g, exp: e }); return; }
  if (Array.isArray(e)) {
    if (!Array.isArray(g)) { out.push({ path, got: g, exp: e }); return; }
    if (g.length !== e.length) out.push({ path: path + '.length', got: g.length, exp: e.length });
    for (let i = 0; i < Math.min(e.length, g.length); i++) cmp(e[i], g[i], `${path}[${i}]`, out);
    return;
  }
  if (typeof g !== 'object' || g === null || Array.isArray(g)) { out.push({ path, got: g, exp: e }); return; }
  for (const k of new Set([...Object.keys(e), ...Object.keys(g)])) {
    const sub = path ? `${path}.${k}` : k;
    if (!(k in e)) out.push({ path: sub, got: g[k], exp: '<missing>' });
    else if (!(k in g)) out.push({ path: sub, got: '<missing>', exp: e[k] });
    else cmp(e[k], g[k], sub, out);
  }
}

const runCase = c => p.evaluate(({ preset, city, set }) => {
  try {
    const H = window.HvacSelect; let s = H.defaults(preset, city || undefined);
    for (const [k, v] of Object.entries(set || {})) s = H.setParam(s, k, v);
    const r = H.run(s, null);
    const code = x => (x && typeof x === 'object') ? (x.code ?? x.id) : x;
    const MK = ['kw_main', 'elec_kwh', 'gas_kwh', 'dh_kwh', 'scop_eff', 'eff', 'capex_eur', 'co2_t20', 'lp_db', 'noise_margin_db', 'foot_m2', 'maint', 'charge_kg'];
    const ex = r.tech.excluded || {}, excluded = {};
    const reasons = v => (Array.isArray(v) ? v : (v && v.reasons) || []).map(code).sort();
    if (Array.isArray(ex)) for (const e of ex) excluded[e.id] = reasons(e.reasons);
    else for (const [id, v] of Object.entries(ex)) excluded[id] = reasons(v);
    const scores = {}, base = {}, criteria = {}, penalties = {}, metrics = {};
    for (const x of r.ranked || []) {
      scores[x.id] = x.score ?? null; base[x.id] = x.base ?? null; criteria[x.id] = x.criteria ?? null;
      penalties[x.id] = (x.penalties || []).map(code);
      const m = x.metrics || {}; metrics[x.id] = Object.fromEntries(MK.map(k => [k, m[k] ?? null]));
    }
    const sizing = (r.series || []).map(e => ({
      family: e.family, role: e.role, units: e.units, n_base: e.n_base, unit_cap_kw: e.unit_cap_kw,
      circuits: e.circuits, compressors: e.compressors, redundancy: e.redundancy, dual_power: e.dual_power,
      part_load_ok: e.part_load.ok, min_load_kw: e.part_load.min_load_kw, unit_min_kw: e.part_load.unit_min_kw }));
    const top = r.top && typeof r.top === 'object' ? (r.top.id ?? null) : (r.top ?? null);
    return { got: {
      feasible: r.tech.feasible.map(f => f.id), excluded, handoff: r.tech.handoff_to || null,
      top, gap: r.gap ?? null, ranking: (r.ranked || []).map(x => x.id),
      scores, base, criteria, penalties, metrics, sizing } };
  } catch (e) { return { error: String(e && e.stack || e) }; }
}, { preset: c.preset, city: c.city, set: c.set || {} });

const cases = []; const summary = { hard_filter_ok: 0, ranking_ok: 0, sizing_ok: 0 };
const HARD = ['feasible', 'excluded', 'handoff'], RANK = ['top', 'ranking'];
for (const c of REF) {
  const rec = { id: c.id, layer: 'generic', note: c.note, preset: c.preset, city: c.city, set: c.set };
  let res;
  try { res = await runCase(c); } catch (e) { res = { error: String(e && e.message || e) }; }
  if (res.error) {
    Object.assign(rec, { pass: false, mismatches: [], top_got: null, top_exp: c.ref ? c.ref.top ?? null : null, error: res.error });
    cases.push(rec); continue;
  }
  const mm = []; cmp(c.ref, res.got, '', mm);
  const roots = new Set(mm.map(m => rootOf(m.path)));
  if (!HARD.some(k => roots.has(k))) summary.hard_filter_ok++;
  if (!RANK.some(k => roots.has(k))) summary.ranking_ok++;
  if (!roots.has('sizing')) summary.sizing_ok++;
  Object.assign(rec, { pass: mm.length === 0, mismatch_count: mm.length, mismatches: mm.slice(0, 20), top_got: res.got.top, top_exp: c.ref.top ?? null });
  cases.push(rec);
}
let db_info = null;
const REFDB = JSON.parse(fs.readFileSync(P.ref.replace(/hvacgenselect_ref\.json$/, 'hvacgenselect_db_ref.json'), 'utf8'));
const dbv = await p.evaluate(() => { const d = window.__hvacgenselect.db(); return d ? { version: d.version, data_date: d.data_date, n: (d.series || []).length } : null; });
db_info = { page: dbv, reference: { version: REFDB.data_version, data_date: REFDB.data_date } };
for (const c of REFDB.cases) {
  const got = await p.evaluate(({ preset, city, set }) => {
    try {
      const H = window.HvacSelect, db = window.__hvacgenselect.db();
      let s = H.defaults(preset, city || undefined);
      for (const [k, v] of Object.entries(set || {})) s = H.setParam(s, k, v);
      const r = H.run(s, db);
      const by = (f) => Object.fromEntries((r.ranked || []).map(x => [x.id, f(x)]));
      return {
        feasible: r.tech.feasible.map(f => f.id),
        series_ok: Object.fromEntries(r.tech.feasible.map(f => [f.id, f.series_ok])),
        excluded: Object.fromEntries((r.tech.excluded || []).map(e => [e.id, [...(e.reasons || [])].sort()])),
        handoff: r.tech.handoff_to || null,
        top: r.top ?? null,
        gap: r.gap ?? null,
        ranking: (r.ranked || []).map(x => x.id),
        scores: by(x => x.score),
        base: by(x => x.base),
        criteria: by(x => x.criteria),
        penalties: by(x => (x.penalties || []).map(q => q.code)),
        series: (r.series || []).map(e => ({
          family: e.family, series_id: e.series ? e.series.id : null, units: e.units, n_base: e.n_base,
          unit_cap_kw: e.unit_cap_kw, circuits: e.circuits, compressors: e.compressors, redundancy: e.redundancy,
          dual_power: e.dual_power, part_load_ok: e.part_load.ok, min_load_kw: e.part_load.min_load_kw,
          unit_min_kw: e.part_load.unit_min_kw, warnings: e.warnings
        }))
      };
    } catch (e) { return { error: String(e && e.stack || e) }; }
  }, { preset: c.preset, city: c.city, set: c.set });
  const mm = [];
  if (!got.error) cmp(c.ref, got, '', mm);
  const roots = new Set(mm.map(m => rootOf(m.path)));
  if (![...HARD, 'series_ok'].some(k => roots.has(k))) summary.hard_filter_ok++;
  if (!RANK.some(k => roots.has(k))) summary.ranking_ok++;
  if (!roots.has('series')) summary.sizing_ok++;
  const rec = {
    id: 'db:' + c.id, layer: 'db', note: c.note, preset: c.preset, city: c.city, set: c.set,
    pass: mm.length === 0 && !got.error, mismatch_count: mm.length, mismatches: mm.slice(0, 20),
    top_got: got.top ?? null, top_exp: c.ref.top ?? null
  };
  if (got.error) rec.error = got.error;
  cases.push(rec);
}
await browser.close();

const tool = 'hvacgenselect', file = 'hvacgenselect.html';
const reference = 'Independent stdlib-Python references bench-src/ref/gen_hvacgenselect.py (generic layer: hard filters, metrics, min-max weighted score with penalties, ranking/gap, generic N/N+1/2N sizing over input tables bench-src/ref/hvacgenselect_model.json) and bench-src/ref/gen_hvacgenselect_db.py (product-series layer: series matching on hvac-series.json per data contract field names, series-level exclusions, option penalties, per-series unit sizing, turndown parsing, part-load and circuit warnings)';
const reference_citations = ['EN 378-1:2016+A1:2020 Annex C (practical limit x room volume)', 'Reg. (EU) 2024/573 (F-gas, GWP AR4)', 'EN 14825:2022 (SCOP 35/55 C)', 'Reg. (EU) 2016/2281 (SEER/SEPR)', 'ISO 9613-2:1996 (free-field attenuation)'];
const tolerance = 'Metrics and other numbers: |got-exp| <= 1e-9*max(1,|exp|); scores/base/criteria/gap (4-decimal rounded): |got-exp| <= 1.5e-4; null must equal null; strings/booleans exact; arrays element-wise with equal length (order significant); objects compared over union of keys (missing key = mismatch).';
const scope = 'Two layers: generic technology layer (db = null) and product-series layer (db = the hvac-series.json the page loaded): hard filters with exclusion codes, metrics, normalised criteria, penalties, score, ranking, gap, series shortlist with unit sizing, redundancy, circuits, part-load and warnings for the top configuration. Not covered: correctness of the manufacturer data itself (see _hvac/data/SOURCES.md), tender text, adaptive question order and confidence.';
const total = cases.length, passed = cases.filter(c => c.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({ tool, file, reference, reference_citations, tolerance, scope, total, passed, failed, summary, db_info, page_errors, cases }, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`hvacgenselect: ${passed}/${total} passed (hard_filter_ok ${summary.hard_filter_ok}, ranking_ok ${summary.ranking_ok}, sizing_ok ${summary.sizing_ok})`);
for (const c of cases.filter(c => !c.pass)) {
  const det = c.error ? `error ${c.error.split('\n')[0]}` : c.mismatches.slice(0, 3).map(m => `${m.path} got=${JSON.stringify(m.got)} exp=${JSON.stringify(m.exp)}`).join('; ') + (c.mismatch_count > 3 ? ` (+${c.mismatch_count - 3} more)` : '');
  console.log(`FAIL ${c.id}: ${det}`);
}
process.exitCode = 0;
