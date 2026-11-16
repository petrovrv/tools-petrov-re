// Benchmark driver for liftwait.html (Lift Waiting Time Simulator).
// Reference: bench-src/ref/gen_liftwait.py (independent Python closed forms from the published method) -> ref/liftwait_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8796 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_liftwait.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected waiting and ride times of every passenger were computed by bench-src/ref/gen_liftwait.py, an independent Python implementation of the published method (Peters 1996 jerk-limited run time; CIBSE Guide D 2020 / ISO 8100-32 definitions of waiting and transit time; the stop rule of the simulator method _vt/sim/METHOD.md), not from the page code; the handling-capacity cases compare the page against the classical round-trip-time formula (CIBSE Guide D 2020 ch. 3; Barney & Al-Sharif 2016) with a stated statistical tolerance. Building data of those cases are input data dumped from vt-core.js presets into ref/liftwait_presets.json.' };
const P = benchPaths({ name: 'liftwait', page: 'liftwait.html', ref: 'liftwait_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const TOL_S = 1e-4;

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_liftwait', '1'); } catch (e) { /* private mode */ } });
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__liftwait && window.__liftwait.last, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);
const ENGINE = await p.evaluate(() => ({ sim: window.VTSim && window.VTSim.version, core: window.VTCore && window.VTCore.version }));

const results = [];
for (const c of ref) {
  let read = null;
  try {
    if (c.kind === 'hc5') {
      /* through the page: the scenario is imported like a user's JSON, A only, the headline tile is read from the screen */
      read = await p.evaluate(cc => {
        const L = window.__liftwait; L.anim.playing = false;
        if (!L.adopt(JSON.parse(JSON.stringify(cc.doc)))) return { err: 'not adopted' };
        L.state.ab = false; L.state.seed = cc.seed; L.ui.sync(); L.ui.run();
        const m = L.last.A.metrics, tile = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
        return { hc5_pct: m.hc5_achieved_pct, awt: m.awt, served: m.served, unserved: m.unserved, tileAwt: tile[0] || null };
      }, c);
      const e = c.expect, rel = read && read.hc5_pct != null ? (read.hc5_pct - e.hc5_pct) / e.hc5_pct : null;
      const tileOk = !!read && String(read.tileAwt).replace(/[^0-9]/g, '') === String(Math.round(read.awt));
      const pass = rel != null && Math.abs(rel) <= e.tol_rel && tileOk;
      results.push({ id: c.id, kind: c.kind, note: c.note, cmp: { hc5_pct: { got: read && read.hc5_pct, exp: e.hc5_pct, rel_dev: rel, tol_rel: e.tol_rel, ok: rel != null && Math.abs(rel) <= e.tol_rel },
        screen: { got: read && read.tileAwt, exp: read && String(Math.round(read.awt)), ok: tileOk } }, formula: e.formula, pass });
      continue;
    }
    if (c.kind === 'awt') {
      /* unsaturated up-peak through the page's engine, seeds 1-3, median mean wait vs the CIBSE/Barney estimate (band) */
      read = await p.evaluate(cc => cc.seeds.map(sd => { const m = window.VTSim.run(JSON.parse(JSON.stringify(cc.doc)), { seed: sd }).metrics; return { awt: m.awt, unserved: m.unserved }; }), c);
      const a = read.map(x => x.awt).sort((x, y) => x - y), med = a[a.length >> 1], e = c.expect, rel = (med - e.awt) / e.awt;
      const pass = e.valid && Math.abs(rel) <= e.tol_rel && read.every(x => x.unserved === 0);
      results.push({ id: c.id, kind: c.kind, note: c.note, cmp: { awt_median: { got: med, exp: e.awt, rel_dev: rel, tol_rel: e.tol_rel, ok: Math.abs(rel) <= e.tol_rel }, by_seed: read.map(x => x.awt) }, formula: e.formula, pass });
      continue;
    }
    if (c.kind === 'multi') {
      /* D-VT-11: 2-3 cars, fixed passengers, per passenger against the independent event simulation */
      read = await p.evaluate(cc => { const r = window.VTSim.run(JSON.parse(JSON.stringify(cc.doc)), { seed: cc.seed, dt: cc.dt, passengers: JSON.parse(JSON.stringify(cc.passengers)) });
        return r.passengers.map(q => ({ id: q.id, board_t: q.board_t, alight_t: q.alight_t, wait: q.wait, car: q.car })); }, c);
      const by = {}; read.forEach(q => { by[q.id] = q; });
      let mb = 0, ma = 0, bad = 0; const ws = [], wr = [];
      const rows = c.expect.map(e => { const g = by[e.id]; if (!g || g.board_t == null) { bad++; return { id: e.id, got: null, exp: e }; }
        const db = Math.abs(g.board_t - e.board_t), da = e.alight_t == null || g.alight_t == null ? 0 : Math.abs(g.alight_t - e.alight_t);
        mb = Math.max(mb, db); ma = Math.max(ma, da); if (g.car !== e.car) bad++; ws.push(g.wait); wr.push(e.wait);
        return { id: e.id, board_t: { got: g.board_t, exp: e.board_t }, alight_t: { got: g.alight_t, exp: e.alight_t }, car: { got: g.car, exp: e.car } }; });
      const mean = x => x.reduce((s2, v) => s2 + v, 0) / (x.length || 1), aS = mean(ws), aR = mean(wr), dA = aR > 0 ? Math.abs(aS / aR - 1) : Math.abs(aS - aR);
      const pass = !bad && mb <= c.tol.board_s && ma <= c.tol.alight_s && dA <= c.tol.awt_rel;
      results.push({ id: c.id, kind: c.kind, note: c.note, passengers: c.expect.length, max_board_dev_s: mb, max_alight_dev_s: ma, awt: { got: aS, exp: aR, rel_dev: dA }, tol: c.tol, car_or_missing_mismatch: bad, rows, pass });
      continue;
    }
    /* analytic and batch: the page's own engine with the reference's fixed passenger list */
    read = await p.evaluate(cc => {
      const r = window.VTSim.run(JSON.parse(JSON.stringify(cc.doc)), { seed: cc.seed, passengers: JSON.parse(JSON.stringify(cc.passengers)) });
      return { pax: r.passengers.map(q => ({ id: q.id, wait: q.wait, transit: q.transit })), served: r.metrics.served, unserved: r.metrics.unserved };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const by = {}; (read && read.pax || []).forEach(q => { by[q.id] = q; });
  let maxDev = 0, pass = !!read && read.unserved === 0;
  const rows = c.expect.map(e => { const g = by[e.id]; const dw = g ? Math.abs(g.wait - e.wait) : null, dt = g ? Math.abs(g.transit - e.transit) : null;
    if (!g || dw > TOL_S || dt > TOL_S) pass = false; if (g) maxDev = Math.max(maxDev, dw, dt);
    return { id: e.id, wait: { got: g ? g.wait : null, exp: e.wait }, transit: { got: g ? g.transit : null, exp: e.transit } }; });
  results.push({ id: c.id, kind: c.kind, note: c.note, passengers: c.expect.length, max_dev_s: maxDev, tol_s: TOL_S, rows, pass });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'liftwait',
  file: 'liftwait.html',
  engine: ENGINE,
  reference: 'bench-src/ref/gen_liftwait.py — independent Python closed forms of the published method (jerk-limited kinematics, CIBSE/ISO waiting-time definitions, stated stop rule) and the CIBSE/Barney round-trip-time formula',
  reference_citations: [
    'CIBSE Guide D: Transportation systems in buildings (2020), ch. 3 round-trip time and handling capacity, ch. 4 traffic patterns',
    'G. Barney, L. Al-Sharif, Elevator Traffic Handbook, 2nd ed., Routledge 2016 (S and H for unequal floor populations)',
    'H. Peters (1996), Vertical transportation planning in buildings — jerk-limited flight time equations',
    'ISO 8100-32:2020 (formerly ISO 4190-6) — definitions of waiting and transit time',
    'CIBSE Guide D 2020 / Barney & Al-Sharif 2016 — up-peak average waiting time estimate AWT = INT (0.4 + (1.8 P/CC − 0.77)^2), 0.5 <= P/CC <= 0.8',
    '_vt/sim/ref_multi.py — independent multi-car event simulation (collective, nearest, destination batches) written from textbook rules (D-VT-11)',
    '_vt/sim/METHOD.md (vt-sim 0.2.0) — stop rule: doors open, transfers, dwell >= max(door_dwell_s, 0.8 s after last transfer), close, start delay'
  ],
  tolerance: 'analytic and batch cases: every passenger\'s waiting and ride time within 1e-4 s of the closed form (an event-exact simulation; the reference is rounded to 1e-6 s); handling-capacity cases: achieved 5-minute handling capacity within ±15 % of the round-trip-time formula (the formula ignores dwell, reopening and the choice of the best 5-minute window; observed 1–12 %), and the headline mean-wait tile equals the simulated mean rounded to whole seconds; unsaturated up-peak cases (80 and 85 % of HC5, P/CC in 0.5–0.8): median mean wait over seeds 1–3 within ±35 % of the CIBSE/Barney estimate (an empirical fit, so a regime check, not a match); multi-car cases (D-VT-11): every passenger boarding and alighting time within one engine step (0.1 s) of ref_multi.py, the same car, AWT within ±2 %. Shared convention with ref_multi.py: METHOD.md stop timing and the 0.1 s controller grid',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`liftwait: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, JSON.stringify(r.cmp || r.rows.slice(0, 3)));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
