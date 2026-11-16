// Benchmark driver for bidnobid.html (Bid / No-Bid Decision).
// Reference: bench-src/ref/gen_bidnobid.py (independent Python written from _tnd/bidnobid/SPEC.md: explicit decision tree rolled back node by node,
// gate-2 policy read from the decision node, breakeven probability / strategic value needed / affordable tender cost by bisection on the tree value,
// own input normalisation, scoring, policy, flags and tornado loops) -> ref/bidnobid_ref.json. Engine 1.1.0 (review fixes R-2/R-3/R-8/R-9).
// Run: BENCH_BASE=http://127.0.0.1:8798 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_bidnobid.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values, breakeven probabilities, strategic value needed, bid spend, scores, decisions and tornado swings are recomputed by bench-src/ref/gen_bidnobid.py from the method definitions; hand cases carry values worked out by hand.' };
const P = benchPaths({ name: 'bidnobid', page: 'bidnobid.html', ref: 'bidnobid_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const TOL = 1e-9;

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_bidnobid', '1'); localStorage.removeItem('tnd.project.v1'); } catch (e) { /* private mode */ } });
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__diagramReady && window.__bidnobid && window.__bidnobid.last(), null, { timeout: 120000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);
const ENGINE = await p.evaluate(() => ({ bnb: window.TndBnb && window.TndBnb.version, core: window.TndCore && window.TndCore.version }));

/* the page's analysis reduced to the reference's shape (runs in the page) */
const REDUCE = `(function (R) {
  if (!R.ok) return { ok: false, errors: R.errors };
  var m = R.money, g = {};
  Object.keys(R.scoring.groups).forEach(function (k) { g[k] = R.scoring.groups[k].score; });
  return { ok: true, costPct: m.costPct, affordableB2: m.affordableB2, base: m.base, flags: R.flags.slice().sort(), flips: R.tornado.bars.filter(function (b) { return b.flips; }).map(function (b) { return b.id; }),
    EV: m.EV, EVs: m.EVs, M: m.M, B1: m.B1, B2: m.B2, naive: m.naive, Pwin: m.Pwin, breakeven: m.breakeven, Sneed: m.Sneed, spend: m.spend, perWin: m.perWin, roi: m.roi,
    score: R.scoring.score, groups: g, decision: R.decision, reason: R.reason, failed: R.failed,
    tornado: R.tornado.bars.map(function (b) { return [b.id, b.low, b.high]; }) };
})`;

const near = (a, b, t) => (a == null || b == null) ? a == b : Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
function compare(g, e) {
  const bad = [];
  if (!g) return ['no result'];
  if (g.ok !== e.ok) return ['ok ' + g.ok + ' vs ' + e.ok];
  if (!e.ok) return g.errors.join() === e.errors.join() ? [] : ['errors ' + g.errors + ' vs ' + e.errors];
  for (const k of ['costPct', 'affordableB2', 'base']) if (!near(g[k], e[k], TOL)) bad.push(k + ' ' + g[k] + ' vs ' + e[k]);
  if (g.flags.join() !== e.flags.join()) bad.push('flags ' + g.flags + ' vs ' + e.flags);
  if (g.flips.join() !== e.flips.join()) bad.push('flips ' + g.flips + ' vs ' + e.flips);
  for (const k of ['EV', 'EVs', 'M', 'B1', 'B2', 'naive', 'Pwin', 'spend', 'perWin', 'roi', 'score', 'breakeven', 'Sneed']) if (!near(g[k], e[k], TOL)) bad.push(k + ' ' + g[k] + ' vs ' + e[k]);
  for (const k of Object.keys(e.groups)) if (!near(g.groups[k], e.groups[k], TOL)) bad.push('group ' + k);
  if (g.decision !== e.decision || g.reason !== e.reason) bad.push('decision ' + g.decision + '/' + g.reason + ' vs ' + e.decision + '/' + e.reason);
  if (g.failed.join() !== e.failed.join()) bad.push('failed ' + g.failed + ' vs ' + e.failed);
  if (g.tornado.map(x => x[0]).join() !== e.tornado.map(x => x[0]).join()) bad.push('tornado order ' + g.tornado.map(x => x[0]) + ' vs ' + e.tornado.map(x => x[0]));
  else g.tornado.forEach((x, k) => { if (!near(x[1], e.tornado[k][1], TOL) || !near(x[2], e.tornado[k][2], TOL)) bad.push('tornado ' + x[0]); });
  return bad;
}
/* reference input -> page state (percent fields in percent) */
function toState(i) {
  const pc = v => v == null ? 0 : v * 100;
  return { procedure: i.procedure || 'single', V: i.V || 0, m: pc(i.m), r: pc(i.r), C: i.C || 0, S: i.S || 0, rate: i.rate || 0, h1: i.h1 || 0, x1: i.x1 || 0, h2: i.h2 || 0, x2: i.x2 || 0,
    p1: i.p1 == null ? 100 : pc(i.p1), p2: pc(i.p2), N: i.N == null ? 0 : i.N, h: i.h == null ? 0 : pc(i.h), go: i.go == null ? 65 : i.go, review: i.review == null ? 45 : i.review,
    dp: pc(i.dp == null ? 0.1 : i.dp), dm: pc(i.dm == null ? 0.02 : i.dm), dB: pc(i.dB == null ? 0.3 : i.dB), dV: pc(i.dV == null ? 0.15 : i.dV),
    criteria: (i.criteria || []).map(c => ({ name: c.id, group: c.group, weight: c.weight, score: c.score })), ko: (i.ko || []).map(k => ({ name: k.id, met: k.met !== false })) };
}

const results = [];
const presetIds = ['be-school', 'utility-dnb', 'epc-fidic', 'equip-rfq', 'framework-entry'];

/* 1: presets through the Examples panel (the reader's path), compared in full */
for (const c of ref.cases.filter(c => presetIds.includes(c.input.id))) {
  const g = await p.evaluate(async ({ id, red }) => {
    const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
    sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click();
    await new Promise(r => setTimeout(r, 150));
    const L = window.__bidnobid.last();
    return { red: eval(red)(L), verdict: (document.querySelector('.dgu-verdict') || {}).textContent || '' };
  }, { id: c.input.id, red: REDUCE });
  const bad = compare(g.red, c.expect);
  const word = { bid: 'BID —', conditions: 'BID WITH CONDITIONS', strategic: 'STRATEGIC BID', nobid: 'NO BID' }[c.expect.decision];
  if (!g.verdict.startsWith(word)) bad.push('verdict ' + g.verdict.slice(0, 60));
  results.push({ id: 'preset-' + c.input.id, kind: 'preset', pass: !bad.length, bad: bad.slice(0, 6) });
}

/* 2: hand cases through the page state (as a user types them) */
for (const c of ref.cases.filter(c => /^hand-/.test(c.input.id))) {
  const st = toState(c.input);
  const g = await p.evaluate(({ st, red }) => {
    const W = window.__bidnobid;
    W.state.criteria.length = 0; st.criteria.forEach(x => W.state.criteria.push(x));
    W.state.ko.length = 0; st.ko.forEach(x => W.state.ko.push(x));
    Object.keys(st).forEach(k => { if (k !== 'criteria' && k !== 'ko') W.state[k] = st[k]; });
    W.ui.sync(); W.ui.run();
    return eval(red)(W.last());
  }, { st, red: REDUCE });
  const bad = compare(g, c.expect);
  if (c.input.expectEV != null && !near(g.EV, c.input.expectEV, 1e-12)) bad.push('hand EV ' + g.EV + ' vs ' + c.input.expectEV);
  if ('expectBE' in c.input && !near(g.breakeven, c.input.expectBE, 1e-12)) bad.push('hand breakeven ' + g.breakeven);
  if ('expectSpend' in c.input && !near(g.spend, c.input.expectSpend, 1e-12)) bad.push('hand spend ' + g.spend);
  if ('expectAff' in c.input && !near(g.affordableB2, c.input.expectAff, 1e-12)) bad.push('hand affordable ' + g.affordableB2);
  if ('expectDecision' in c.input && g.decision + '/' + g.reason !== c.input.expectDecision) bad.push('hand decision ' + g.decision + '/' + g.reason);
  if ('expectFlags' in c.input && g.flags.join() !== c.input.expectFlags.slice().sort().join()) bad.push('hand flags ' + g.flags);
  if ('expectFlips' in c.input && g.flips.join() !== c.input.expectFlips.join()) bad.push('hand flips ' + g.flips);
  results.push({ id: c.input.id, kind: 'hand', pass: !bad.length, bad: bad.slice(0, 6) });
}

/* 3: raw inputs (import / hand-edited project: strings, p > 1, negative V, knock-out 'met' strings, thresholds) and random cases through the engine the page loaded */
const rnd = ref.cases.filter(c => /^(rnd|norm)-/.test(c.input.id));
const got = await p.evaluate(({ cs, red }) => cs.map(c => eval(red)(window.__bidnobid.analyse(c))), { cs: rnd.map(c => c.input), red: REDUCE });
rnd.forEach((c, k) => {
  const bad = compare(got[k], c.expect), i = c.input, g = got[k];
  if (i.expectError && (g.ok || g.errors.join() !== i.expectError)) bad.push('norm error');
  if (i.expectEV != null && !near(g.EV, i.expectEV, 1e-12)) bad.push('norm EV ' + g.EV);
  if ('expectBE' in i && !near(g.breakeven, i.expectBE, 1e-12)) bad.push('norm breakeven ' + g.breakeven);
  if (i.expectDecision && g.decision + '/' + g.reason !== i.expectDecision) bad.push('norm decision ' + g.decision + '/' + g.reason);
  if (i.expectFlags && g.flags.join() !== i.expectFlags.slice().sort().join()) bad.push('norm flags ' + g.flags);
  results.push({ id: i.id, kind: /^norm-/.test(i.id) ? 'normalisation' : 'random', pass: !bad.length, bad: bad.slice(0, 4) });
});

/* 4: preset findings (ahas) — reference verdicts and the page's own path (edit a field as the reader would) */
const pageAha = await p.evaluate(async () => {
  const W = window.__bidnobid, wait = () => new Promise(r => setTimeout(r, 80)), out = {}, run = () => { W.ui.sync(); W.ui.run(); };
  const ex = id => { DiagramUI.current.example(id); };
  ex('be-school'); await wait(); let L = W.last();
  out['be-school'] = Math.abs(L.money.EV - 8380) < 1e-6 && L.money.breakeven > 1 / 7 && L.money.breakeven < 1 / 7 + 0.002;
  W.state.p2 = 100 / 7; run(); await wait(); out['be-school'] = out['be-school'] && Math.abs(W.last().money.EV) < 500;
  ex('utility-dnb'); await wait(); L = W.last(); out['utility-dnb'] = Math.abs(L.money.EV - 35100) < 1e-6 && Math.abs(L.money.naive + 39900) < 1e-6 && L.decision === 'bid';
  ex('epc-fidic'); await wait(); const e1 = W.last(); W.state.C = 0; run(); await wait();
  out['epc-fidic'] = Math.abs(e1.money.EV + 52500) < 1e-6 && e1.decision === 'nobid' && Math.abs(W.last().money.EV - 397500) < 1e-6;
  ex('equip-rfq'); await wait(); const q1 = W.last(); W.state.ko[0].met = true; run(); await wait();
  out['equip-rfq'] = q1.decision === 'nobid' && q1.reason === 'ko' && Math.abs(q1.money.breakeven - 12000 / 288000) < 1e-9 && W.last().decision === 'bid';
  ex('framework-entry'); await wait(); L = W.last();
  out['framework-entry'] = Math.abs(L.money.EV + 77200) < 1e-6 && L.decision === 'strategic' && Math.abs(L.money.Sneed - 643333.3333) < 0.01;
  return out;
});
for (const id of presetIds) results.push({ id: 'aha-' + id, kind: 'aha', pass: ref.aha[id] === true && pageAha[id] === true, cmp: { reference: ref.aha[id], page: pageAha[id] } });

/* 5: exports and project round trip */
const io = await p.evaluate(() => {
  const W = window.__bidnobid; DiagramUI.current.example('utility-dnb');
  const csv = W.csv(), rec = W.record(), P = W.projectPayload();
  const d = TndCore.project.withModule(TndCore.project.empty({ name: 'bench' }), 'bidnobid', P);
  const v = TndCore.project.validate(d);
  DiagramUI.current.example('epc-fidic'); const u = W.useProject(d, 'bidnobid');
  return { csv: /expected_value,35100/.test(csv.replace(/"/g, '')) && /all_costs_up_front,-39900/.test(csv.replace(/"/g, '')), rec: rec.outputs.decision === 'bid' && rec.model.equations.length > 5,
           valid: v.ok, back: u.ok && W.last().decision === 'bid' && Math.abs(W.last().money.EV - 35100) < 1e-6 };
});
results.push({ id: 'export-csv', kind: 'io', pass: io.csv }, { id: 'export-record', kind: 'io', pass: io.rec }, { id: 'project-valid', kind: 'io', pass: io.valid }, { id: 'project-roundtrip', kind: 'io', pass: io.back });

/* 6: review fixes through the page (import sanitising R-8/R-9, Use resets the page R-15, unscored verdict R-2, withdraw tiles R-3, project bar role R-11, print R-12) */
const fx = await p.evaluate(async () => {
  const W = window.__bidnobid, wait = () => new Promise(r => setTimeout(r, 80)), out = {};
  DiagramUI.current.example('utility-dnb'); await wait();
  const st = JSON.parse(JSON.stringify(W.projectPayload().state));
  st.ko = [{ name: 'Test-bay slot', met: 'no' }, { name: 'Bond', met: 1 }]; st.go = 40; st.review = 60;
  delete st.criteria;
  const d = TndCore.project.withModule(TndCore.project.empty({ name: 'bench-fix' }), 'bidnobid', { state: st, summary: { text: 'fix' } });
  DiagramUI.current.example('equip-rfq'); await wait();
  const u = W.useProject(d, 'bidnobid'); await wait(); const L = W.last();
  out.koImport = u.ok && L.decision === 'nobid' && L.reason === 'ko' && L.failed.join() === 'KO1' && L.flags.includes('ko-unclear') && W.state.ko[1].met === true;
  out.thrImport = W.state.go === 60 && W.state.review === 40;
  out.useResets = W.state.criteria.length === 10 && W.state.criteria[0].score === 7 && W.state.criteria[0].name === 'Relationship and knowledge of the client';
  out.useMsg = /corrections/.test((document.querySelector('[data-tnd="use-msg"]') || {}).textContent || '');
  DiagramUI.current.example('be-school'); await wait(); W.state.criteria.length = 0; W.ui.sync(); W.ui.run(); await wait();
  const v = (document.querySelector('.dgu-verdict') || {}).textContent || '';
  out.unscored = W.last().decision === 'conditions' && W.last().reason === 'unscored' && /^BID WITH CONDITIONS — pays, but the fit is not scored/.test(v);
  DiagramUI.current.example('utility-dnb'); await wait(); W.state.p2 = 10; W.ui.sync(); W.ui.run(); await wait();
  const m = W.last().money, tiles = [...document.querySelectorAll('.dgu-tile')].map(t => t.textContent);
  out.withdraw = !m.go2 && Math.abs(m.spend - 14400) < 1e-9 && m.Pwin === 0 && m.perWin === null && tiles.some(t => /withdraw at gate 2/.test(t));
  const role = document.querySelector('[data-tnd="role"]');
  out.role = !!role && role.value === 'contractor';
  return out;
});
await p.emulateMedia({ media: 'print' });
const printHidden = await p.evaluate(() => { const b = document.querySelector('.tnd-project-bar'), l = document.querySelector('.tnd-lifecycle'); return !!b && getComputedStyle(b).display === 'none' && (!l || getComputedStyle(l).display === 'none'); });
await p.emulateMedia({ media: 'screen' });
for (const [k, v] of Object.entries(fx)) results.push({ id: 'fix-' + k, kind: 'review-fix', pass: v === true });
results.push({ id: 'fix-print', kind: 'review-fix', pass: printHidden });
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'bidnobid',
  file: 'bidnobid.html',
  engine: ENGINE,
  reference: 'bench-src/ref/gen_bidnobid.py — independent Python written from the method definitions (decision tree rolled back node by node, bisection for breakeven and strategic value, own scoring, policy and tornado), not ported from tnd-bnb.js',
  reference_citations: [
    'H. Raiffa, Decision Analysis: Introductory Lectures on Choices under Uncertainty, Addison-Wesley 1968 (decision trees, rolling back expected values)',
    'R. T. Clemen, Making Hard Decisions, 2nd ed., Duxbury 1996, ch. 3-4 (decision trees, sensitivity / tornado diagrams)',
    'Shipley Associates Proposal Guide; APMP Body of Knowledge — bid/no-bid decision, gate reviews, hit rate (industry practice, labelled as such)',
    'Wet van 17 juni 2016 inzake overheidsopdrachten art. 79 par. 1-2 (classic sectors: if the authority limits the number, restricted procedure at least 5 candidates invited; competitive negotiation, dialogue, innovation partnership at least 3; fewer if fewer qualify), Justel, read 14.11.2026',
    'Wet van 17 juni 2016 art. 149 (special sectors: the contracting entity may limit the number of candidates by objective rules, sufficient competition, no legal minimum), Justel copy _tnd/core/dl/wet2016_nl.txt, read 15.11.2026',
    'Directive 2014/24/EU art. 65(2), OJ L 94, 28.3.2014; Directive 2014/25/EU art. 78(2), OJ L 94, 28.3.2014'
  ],
  tolerance: 'money values, probabilities, scores, cost share, affordable tender cost and tornado ends relative 1e-9 (of max(1,|value|)); breakeven, strategic value needed and affordable tender cost by bisection; decisions, reasons, failed knock-outs, flags, zero-crossing swings and tornado orders exact; hand values 1e-12',
  independence: 'Independent of the JavaScript: the reference rolls back an explicit tree of decision and chance nodes instead of the closed form, reads the gate-2 policy from the decision node, finds the breakeven probability, the strategic value needed and the affordable tender cost by bisection on the rolled-back tree value (not on a closed form), normalises raw inputs by its own rules and has its own data layout; hand and normalisation cases carry values worked out by hand; preset findings are evaluated by both the reference and the page.',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`bidnobid: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass).slice(0, 15)) console.log('FAIL', r.id, JSON.stringify(r.bad || r.cmp));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
