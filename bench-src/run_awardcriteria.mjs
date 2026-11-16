// Benchmark driver for awardcriteria.html (Award Criteria & Price Scoring Designer).
// Reference: bench-src/ref/gen_awardcriteria.py (independent Python written from the formula definitions of _tnd/awardcriteria/SPEC.md:
// own ranking, own rank-reversal test, value of a point by Illinois false position, own sensitivity loop) -> ref/awardcriteria_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8798 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_awardcriteria.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected rankings, scores, rank-reversal cases, values of a point, weight-sensitivity winners and recommendation orders are recomputed by bench-src/ref/gen_awardcriteria.py from the published formula definitions; hand cases carry values worked out by hand in the generator.' };
const P = benchPaths({ name: 'awardcriteria', page: 'awardcriteria.html', ref: 'awardcriteria_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const TOL = { score_rel: 1e-9, eur_rel: 1e-7 };

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_awardcriteria', '1'); localStorage.removeItem('tnd.project.v1'); } catch (e) { /* private mode */ } });
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__diagramReady && window.__awardcriteria && window.__awardcriteria.last(), null, { timeout: 120000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);
const ENGINE = await p.evaluate(() => ({ award: window.TndAward && window.TndAward.version, core: window.TndCore && window.TndCore.version }));
const METHODS = ['proportional', 'linear_zero', 'linear_pct', 'interpolation', 'mean_relative', 'floor', 'absolute', 'monetised'];

/* the page's analysis reduced to the reference's shape (runs in the page) */
const REDUCE = `(function (R) {
  var o = { methods: {}, recommend: R.recommend.filter(function (x) { return x.available; }).map(function (x) { return [x.method, x.penalty]; }) };
  TndAward.METHOD_IDS.forEach(function (m) {
    var x = R.methods[m];
    if (!x.available) { o.methods[m] = { available: false }; return; }
    var sc = {}, ps = {}, qp = {};
    x.ev.rows.forEach(function (r) { sc[r.id] = r.score; ps[r.id] = r.s; qp[r.id] = r.qualityPts; });
    o.methods[m] = { available: true, order: x.ev.order, winner: x.ev.winner, tie: x.ev.tie, score: sc, priceScore: ps, qualityPts: qp, margin: x.ev.margin,
      reversal: x.reversal.cases.map(function (c) { var k = { action: c.action, id: c.id, swaps: c.swaps }; if (c.testRank) k.testRank = c.testRank; return k; }),
      eur: x.eur ? x.eur.perPoint : null, byWeight: R.sensitivity.grid[m] };
  });
  return o;
})`;

const near = (g, e, tol) => (g == null || e == null) ? g === e : Math.abs(g - e) <= tol * Math.max(1, Math.abs(e));
function compare(g, e) {
  const bad = [];
  if (!g) return ['no result'];
  for (const m of METHODS) {
    const a = g.methods[m], b = e.methods[m];
    if (a.available !== b.available) { bad.push(m + ' available ' + a.available); continue; }
    if (!b.available) continue;
    if (a.order.join() !== b.order.join()) bad.push(m + ' order ' + a.order.join() + ' vs ' + b.order.join());
    for (const id of Object.keys(b.score)) {
      if (!near(a.score[id], b.score[id], TOL.score_rel)) bad.push(m + ' score ' + id + ' ' + a.score[id] + ' vs ' + b.score[id]);
      if (!near(a.qualityPts[id], b.qualityPts[id], TOL.score_rel)) bad.push(m + ' quality ' + id);
      if (b.priceScore[id] != null && !near(a.priceScore[id], b.priceScore[id], TOL.score_rel)) bad.push(m + ' priceScore ' + id);
    }
    if (!near(a.margin, b.margin, TOL.score_rel)) bad.push(m + ' margin ' + a.margin + ' vs ' + b.margin);
    if ((a.tie || []).join() !== (b.tie || []).join()) bad.push(m + ' tie ' + (a.tie || []).join() + ' vs ' + (b.tie || []).join());
    const rk = r => r.map(c => c.action + c.id + ':' + c.swaps.map(s => s.join('/')).join(',') + (c.testRank ? '#' + c.testRank : '')).join(' ');
    if (rk(a.reversal) !== rk(b.reversal)) bad.push(m + ' reversal ' + rk(a.reversal) + ' vs ' + rk(b.reversal));
    if (!near(a.eur, b.eur, TOL.eur_rel)) bad.push(m + ' eur ' + a.eur + ' vs ' + b.eur);
    if (a.byWeight.map(x => x == null ? '-' : x).join() !== b.byWeight.map(x => x == null ? '-' : x).join()) bad.push(m + ' byWeight ' + a.byWeight.join() + ' vs ' + b.byWeight.join());
  }
  const rr = x => x.map(r => r[0] + ':' + r[1]).join(' ');
  if (rr(g.recommend) !== rr(e.recommend)) bad.push('recommend ' + rr(g.recommend) + ' vs ' + rr(e.recommend));
  return bad;
}

const results = [];
const presetIds = ['be-school', 'utility-epc', 'trafo', 'two-bids', 'eng-framework'];

/* 1: presets through the Examples panel (the reader's path), compared in full */
for (const c of ref.cases.filter(c => presetIds.includes(c.input.id))) {
  const g = await p.evaluate(async ({ id, red }) => {
    const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
    sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click();
    await new Promise(r => setTimeout(r, 120));
    const L = window.__awardcriteria.last();
    return { red: eval(red)(L), verdict: (document.querySelector('.dgu-verdict') || {}).textContent || '', winnerTile: ((document.querySelector('.dgu-tile .dgu-tile-v') || {}).textContent || '').trim(), method: L.method };
  }, { id: c.input.id, red: REDUCE });
  const bad = compare(g.red, c.expect);
  const w = c.expect.methods[c.input.method].winner;
  if (g.method !== c.input.method) bad.push('method ' + g.method);
  if (g.winnerTile !== w) bad.push('winner tile ' + g.winnerTile + ' vs ' + w);
  if (!g.verdict.startsWith(w + ' ')) bad.push('verdict ' + g.verdict.slice(0, 60));
  results.push({ id: 'preset-' + c.input.id, kind: 'preset', pass: !bad.length, bad: bad.slice(0, 6) });
}

/* 2: hand cases through the page state (as a user types them) */
for (const c of ref.cases.filter(c => /^hand-/.test(c.input.id))) {
  const i = c.input;
  const pr = Object.assign({ zeroFactor: 2, slope: 2, slopeMean: 1, floorFactor: 0.85 }, i.params || {});
  const st = { W: i.W, method: i.method, qnorm: i.qnorm, refPrice: i.ref.price, lo: i.ref.lo || 0.8, hi: i.ref.hi || 1.3, Vauto: true, testOn: false,
               zeroFactor: pr.zeroFactor, slope: pr.slope, slopeMean: pr.slopeMean, floorFactor: pr.floorFactor,
               items: i.items.map(it => ({ name: it.id, weight: it.weight, max: it.max })),
               bids: i.bids.map(b => ({ name: b.id, price: b.price, q1: (b.q || {}).Q1 || 0, q2: (b.q || {}).Q2 || 0, q3: (b.q || {}).Q3 || 0, included: true })) };
  let g = await p.evaluate(({ st, red }) => {
    const W = window.__awardcriteria;
    W.state.items.length = 0; st.items.forEach(x => W.state.items.push(x));
    W.state.bids.length = 0; st.bids.forEach(x => W.state.bids.push(x));
    Object.keys(st).forEach(k => { if (k !== 'items' && k !== 'bids') W.state[k] = st[k]; });
    W.ui.sync(); W.ui.run();
    const txt = q => Array.from(document.querySelectorAll(q)).map(e => e.textContent.trim());
    return { red: eval(red)(W.last()), verdict: txt('.dgu-verdict').join(' '), tile: (txt('.dgu-tile .dgu-tile-v')[0] || ''), page: document.body.innerText };
  }, { st, red: REDUCE });
  const hv = {};
  if (c.input.expectTie) { const u = []; if (!/^Tie: A = B/.test(g.verdict) || !/art\. 87 §2/.test(g.verdict)) u.push('tie verdict ' + g.verdict.slice(0, 80)); if (g.tile !== 'A = B') u.push('tie tile ' + g.tile); hv[c.input.id] = u; }
  if (c.input.expectPenalty) hv[c.input.id] = /reference price .* is far from the bids/i.test(g.page) ? [] : ['no stale reference note'];
  g = g.red;
  const bad = compare(g, c.expect);
  if (c.input.expectPriceScore) c.input.expectPriceScore.forEach((v, k) => { const id = 'ABC'[k]; if (!near(g.methods[i.method].priceScore[id], v, 1e-12)) bad.push('hand price score ' + id); });
  if (c.input.expectEvaluated) c.input.expectEvaluated.forEach((v, k) => { const id = 'ABC'[k]; if (!near(-g.methods.monetised.score[id], v, 1e-12)) bad.push('hand evaluated price ' + id); });
  if (c.input.expectTie) METHODS.forEach(m => { if ((g.methods[m].tie || []).join() !== c.input.expectTie.join() || g.methods[m].margin !== 0) bad.push('hand tie ' + m + ' ' + (g.methods[m].tie || []).join()); });
  if (c.input.expectEur != null && !near(g.methods[i.method].eur, c.input.expectEur, 1e-9)) bad.push('hand eur ' + g.methods[i.method].eur + ' vs ' + c.input.expectEur);
  if (c.input.expectSwaps) for (const [id, sw] of Object.entries(c.input.expectSwaps)) { const k = g.methods[i.method].reversal.find(x => x.action === 'remove' && x.id === id); if (!k || JSON.stringify(k.swaps) !== JSON.stringify(sw)) bad.push('hand swaps without ' + id); }
  if (c.input.expectPenalty) for (const [m, v] of Object.entries(c.input.expectPenalty)) { const r = g.recommend.find(x => x[0] === m); if (!r || r[1] !== v) bad.push('hand penalty ' + m + ' ' + (r && r[1])); }
  if (c.input.expectTie || c.input.expectPenalty) { const ui = hv[c.input.id]; if (ui) bad.push(...ui); }
  results.push({ id: c.input.id, kind: 'hand', pass: !bad.length, bad: bad.slice(0, 6) });
}

/* 3: random sets through the engine the page loaded */
const rnd = ref.cases.filter(c => /^rnd-/.test(c.input.id));
const got = await p.evaluate(({ cs, red }) => cs.map(c => eval(red)(window.__awardcriteria.analyse(c, { test: c.test || null }))), { cs: rnd.map(c => c.input), red: REDUCE });
rnd.forEach((c, k) => { const bad = compare(got[k], c.expect); results.push({ id: c.input.id, kind: 'random', pass: !bad.length, bad: bad.slice(0, 4) }); });

/* 4: preset findings (ahas) — reference verdicts and the page's own path (untick a bid, switch quality scoring) */
const pageAha = await p.evaluate(async () => {
  const W = window.__awardcriteria, wait = () => new Promise(r => setTimeout(r, 80)), out = {};
  const ex = id => { DiagramUI.current.example(id); };
  ex('be-school'); await wait(); const a0 = W.last().chosen.ev.winner; W.state.bids[0].included = false; W.ui.sync(); W.ui.run(); await wait(); out['be-school'] = a0 === 'C' && W.last().chosen.ev.winner === 'B';
  ex('utility-epc'); await wait(); const b0 = W.last().chosen.ev.winner; W.state.bids[2].included = false; W.ui.sync(); W.ui.run(); await wait(); out['utility-epc'] = b0 === 'B' && W.last().chosen.ev.winner === 'A';
  ex('trafo'); await wait(); const L = W.last(); out.trafo = L.chosen.ev.winner === 'C' && L.methods.interpolation.ev.winner === 'A' && L.methods.proportional.eur.perPoint > 45000 && L.methods.proportional.eur.perPoint < 55000 && L.methods.interpolation.eur.perPoint > 4000 && L.methods.interpolation.eur.perPoint < 5000;
  ex('two-bids'); await wait(); const T2 = W.last(); out['two-bids'] = T2.chosen.ev.winner === 'A' && TndAward.METHOD_IDS.filter(m => m !== 'interpolation').every(m => T2.methods[m].ev.winner === 'B');
  ex('eng-framework'); await wait(); const r1 = W.last().chosen.reversal.cases.filter(c => c.swaps.length).map(c => c.id + ':' + c.swaps.map(s => s.join('')).join()).join();
  W.state.bids[1].included = false; W.ui.sync(); W.ui.run(); await wait(); const noY = W.last().chosen.ev.order.join('');
  W.state.bids[1].included = true; W.state.qnorm = 'scale'; W.ui.sync(); W.ui.run(); await wait();
  out['eng-framework'] = r1 === 'Y:XZ' && noY === 'ZX' && !W.last().chosen.reversal.any;
  return out;
});
for (const id of presetIds) results.push({ id: 'aha-' + id, kind: 'aha', pass: ref.aha[id] === true && pageAha[id] === true, cmp: { reference: ref.aha[id], page: pageAha[id] } });
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'awardcriteria',
  file: 'awardcriteria.html',
  engine: ENGINE,
  reference: 'bench-src/ref/gen_awardcriteria.py — independent Python written from the formula definitions (own ranking, rank-reversal test, value of a point by Illinois false position, sensitivity loop), not ported from tnd-award.js',
  reference_citations: [
    'Directive 2014/24/EU art. 67 (award criteria, weighting), OJ L 94, 28.3.2014 (EUR-Lex, read 14.11.2026)',
    'Wet van 17 juni 2016 inzake overheidsopdrachten art. 81 (Justel, read 14.11.2026)',
    'CJEU C-6/15 TNS Dimarso NV v Vlaams Gewest, 14.07.2016 (evaluation method need not be published in advance if it does not alter criteria or weighting)',
    'M. A. Bergman, S. Lundberg, Tender evaluation and supplier selection methods in public procurement, Journal of Purchasing & Supply Management 19 (2013) 73-83',
    'F. Dini, R. Pacini, T. Valletti, Scoring rules, in: N. Dimitri, G. Piga, G. Spagnolo (eds.), Handbook of Procurement, Cambridge University Press 2006, ch. 12'
  ],
  tolerance: 'scores, quality points, price scores and margins relative 1e-9 (of max(1,|value|)); value of one point relative 1e-7 (root finding to 1e-12 of the price); orders, rank-reversal cases, sensitivity winners and recommendation orders exact; hand price scores 1e-12',
  independence: 'Independent of the JavaScript: the reference implements the formulas from SPEC.md with its own data layout, sorting and root finding; hand cases carry values worked out by hand; preset findings are evaluated by both the reference and the page path a reader uses (Examples panel, unticking a bid, switching quality scoring).',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`awardcriteria: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass).slice(0, 15)) console.log('FAIL', r.id, JSON.stringify(r.bad || r.cmp));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
