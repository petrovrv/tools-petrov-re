// Benchmark driver for plblegionella.html (Legionella Risk & Dead Legs).
// Reference: bench-src/ref/gen_plblegionella.py (independent implementation of _plb/leg/METHOD.md) -> ref/plblegionella_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8795 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_plblegionella.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected legal scope, sampling level, hazard points, H, C, R, screening and final class, dead-leg volume / purge time / longest length / 3-litre flag / stagnation, the periodic tasks (interval, hours, statutory), hours per year, one-off measures and the Art. 18 / dead-leg flags were computed by bench-src/ref/gen_plblegionella.py, a Python implementation written from the published method (_plb/leg/METHOD.md: Flemish Legionellabesluit Art. 1, 4–18 as read on codex.vlaanderen.be 06.11.2026, DVGW W 551 3-litre rule and installation class, ordinal H × C screening), not from the page code — this part is a consistency check with METHOD. In addition 16 external anchor cases (D-PLB-10) carry literal expected values written by hand from the source texts (decree articles 1 35°, 5, 9 §2, 9 §5, 11, 12, 16 §2, 16 §3, 18; W 551 large installation, one/two-family house, 3-litre rule apart from the design limit and 60 °C store; VDI/DVGW 6023 72 h for Germany; hand-computed pipe volumes; the yes/no input rule of METHOD); they are independent of the model. Pipe series are input data from the published method.' };
const P = benchPaths({ name: 'plblegionella', page: 'plblegionella.html', ref: 'plblegionella_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__plblegionella, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const REL = 1e-6;
const rel = (g, e) => Math.abs(g - e) <= REL * Math.max(Math.abs(e), 1);
const results = [];
for (const c of ref) {
  let read = null;
  try {
    read = await p.evaluate(cc => {
      const M = window.__plblegionella, st = M.state, x = cc.inputs;
      Object.keys(x).forEach(k => { if (k !== 'samples' && k !== 'dead_legs') st[k] = x[k]; });
      st.samples_text = x.samples.join('; ');
      st.dead_legs = x.dead_legs.map(d => ({ id: d.id, hot: d.hot, material: d.material, od: d.od, L: d.L, q: d.q, idle_days: d.idle_days }));
      M.ui.sync(); M.ui.run();
      const L = M.last;
      if (!L.valid) return { valid: false, errors: L.errors, verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim() };
      const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
      return { valid: true, scope: L.scope.id, level: L.sampling.id, points: L.hazard.points, H: L.H, C: L.C, R: L.R, class_screen: L.class_screen, cls: L.class,
        legs: L.dead_legs.map(l => ({ id: l.id, V_L: l.V_L, t_purge_s: l.t_purge_s, L_max_m: l.L_max_m, over_volume: l.over_volume, w551_over_3L: l.w551_over_3L, stagnant: l.stagnant })),
        tasks: L.tasks.map(t => [t.task_key, t.interval_days, t.hours, t.statutory].join('|')), hours_year: L.hours_year,
        measures: L.measures.map(m => m.id ? m.key + ':' + m.id : m.key),
        flags: L.flags.filter(f => ['exempt_below_60', 'dead_legs_over_volume', 'store_growth_range', 'w551_large', 'w551_dead_leg_3L', 'w551_store_target', 'w551_return_target', 'w551_circ_stop_target', 'de_vdi6023_72h', 'stop_aerosol_now'].includes(f)).sort(), tiles,
        w551: L.w551_class, w551_reason: L.w551_reason, articles: L.scope.obligations.map(o => o.article), flushDays: (L.tasks.find(t => t.task_key === 'flush') || {}).interval_days, clsLabel: window.__plblegionella.strings().I18N['cl.' + L.class].en };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const e = c.expect, cmp = {}; let pass = !!(read && read.valid);
  const add = (k, g, x, ok) => { cmp[k] = { got: g, exp: x, ok }; if (!ok) pass = false; };
  if (e.valid === false) {
    /* r3 X2-2: invalid input must give valid:false with exactly the expected error codes */
    pass = true;
    add('valid', read && read.valid, false, !!read && read.valid === false);
    add('errors', read && read.errors, e.errors, !!read && JSON.stringify(read.errors) === JSON.stringify(e.errors));
    if (c.anchor) add('anchor.errors', read && read.errors, c.anchor.errors, !!read && JSON.stringify(read.errors) === JSON.stringify(c.anchor.errors));
  } else if (read && read.valid) {
    add('w551_reason', read.w551_reason, e.w551_reason, read.w551_reason === e.w551_reason);
    for (const k of ['scope', 'level', 'points', 'H', 'C', 'R', 'class_screen', 'cls']) add(k, read[k], e[k], read[k] === e[k]);
    add('hours_year', read.hours_year, e.hours_year, rel(read.hours_year, e.hours_year));
    e.legs.forEach((x, i) => { const g = read.legs[i] || {};
      for (const k of ['V_L', 't_purge_s', 'L_max_m']) add(x.id + '.' + k, g[k], x[k], typeof g[k] === 'number' && rel(g[k], x[k]));
      for (const k of ['over_volume', 'w551_over_3L', 'stagnant']) add(x.id + '.' + k, g[k], x[k], g[k] === x[k]); });
    const xt = e.tasks.map(t => [t.task_key, t.interval_days, t.hours, t.statutory].join('|'));
    add('tasks', read.tasks, xt, JSON.stringify(read.tasks) === JSON.stringify(xt));
    add('measures', read.measures, e.measures, JSON.stringify(read.measures) === JSON.stringify(e.measures));
    add('flags', read.flags, e.flags.slice().sort(), JSON.stringify(read.flags) === JSON.stringify(e.flags.slice().sort()));
    add('w551', read.w551, e.w551, read.w551 === e.w551);
    add('articles', read.articles, e.articles, JSON.stringify(read.articles) === JSON.stringify(e.articles));
    /* D-PLB-10 external anchors: literal hand values from the source texts */
    const a = c.anchor;
    if (a) {
      const ORD = ['low', 'moderate', 'high', 'very_high'];
      if (a.scope) add('anchor.scope', read.scope, a.scope, read.scope === a.scope);
      if (a.level) add('anchor.level', read.level, a.level, read.level === a.level);
      if (a.class_min) add('anchor.class_min', read.cls, '>= ' + a.class_min, ORD.indexOf(read.cls) >= ORD.indexOf(a.class_min));
      if (a.w551) add('anchor.w551', read.w551, a.w551, read.w551 === a.w551);
      (a.articles_include || []).forEach(x => add('anchor.' + x, read.articles.includes(x), true, read.articles.includes(x)));
      (a.measures_include || []).forEach(x => add('anchor.measure.' + x, read.measures.includes(x), true, read.measures.includes(x)));
      (a.measures_exclude || []).forEach(x => add('anchor.no_measure.' + x, read.measures.includes(x), false, !read.measures.includes(x)));
      (a.flags_include || []).forEach(x => add('anchor.flag.' + x, read.flags.includes(x), true, read.flags.includes(x)));
      if (a.flush_interval_days != null) add('anchor.flush', read.flushDays, a.flush_interval_days, read.flushDays === a.flush_interval_days);
      Object.entries(a.legs || {}).forEach(([id, lx]) => { const g = read.legs.find(l => l.id === id) || {};
        Object.entries(lx).forEach(([k, v]) => add('anchor.' + id + '.' + k, g[k], v, typeof v === 'boolean' ? g[k] === v : (typeof g[k] === 'number' && Math.abs(g[k] - v) <= 1e-3 * Math.max(1, Math.abs(v))))); });
    }
    /* what the reader sees: the first tile shows the final class, the sixth the risk index R */
    add('screen', [read.tiles[0], read.tiles[5]], [read.clsLabel, e.R], read.tiles[0] === read.clsLabel && Number(read.tiles[5]) === e.R);
  } else add('valid', read && read.errors, 'valid', false);
  results.push({ id: c.id, note: c.note, anchor: !!c.anchor, anchor_source: c.anchor_source || undefined, inputs: c.inputs, cmp, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
const anchors = results.filter(r => r.anchor), anchorsPassed = anchors.filter(r => r.pass).length;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'plblegionella',
  file: 'plblegionella.html',
  reference: 'bench-src/ref/gen_plblegionella.py — consistency with METHOD (_plb/leg/METHOD.md, Python) + ' + anchors.length + ' external anchors (hand values from the decree, DVGW W 551, VDI/DVGW 6023, HSG274)',
  external_anchors: { total: anchors.length, passed: anchorsPassed },
  reference_citations: [
    'Besluit van de Vlaamse Regering van 9 februari 2007 betreffende de preventie van de veteranenziekte op publiek toegankelijke plaatsen (Legionellabesluit), codex.vlaanderen.be DID 1015749, Art. 1 (version 01.06.2023), 4–18 — read 06.11.2026',
    'Departement Zorg, Legionella in sanitaire installaties / Risicoanalyse en beheersing (departementzorg.be, read 06.11.2026)',
    'DVGW W 551:2004 (60 °C, 55 °C, 8 h, 3-litre rule, 70 °C disinfection); VDI/DVGW 6023-1:2022; HSE HSG274 Part 2 (2014); CEN/TR 16355:2012; Directive (EU) 2020/2184',
    '_plb/leg/METHOD.md revision plblegionella-1.2'
  ],
  tolerance: 'exact on scope, sampling level, hazard points, H, C, R, both classes, the design-limit, W 551 3-litre and stagnation flags, the task list (key, interval, hours, statutory), the measures and the flags; relative 1e-6 on dead-leg volume, purge time, longest length and hours per year; the first tile must show the final class and the sixth the risk index',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`plblegionella: ${passed}/${total} passed (external anchors ${anchorsPassed}/${anchors.length})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = 0;
