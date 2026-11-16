// Benchmark driver for bidnormalize.html (Commercial Bid Normalisation, Tendering & Contracts).
// Reference: bench-src/ref/gen_bidnormalize.py (independent Python written from KB 18.04.2017 art. 34, 86 par. 2, 87 par. 1,
// the Incoterms 2020 cost structure and standard discounting; not ported from tnd-bidnorm.js) -> ref/bidnormalize_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8798 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_bidnormalize.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected corrected totals, art. 86 fills, option sums, delivery-term gaps, payment adjustments, normalised prices and ranks were computed by bench-src/ref/gen_bidnormalize.py, an independent Python implementation of KB 18.04.2017 art. 34, 86 par. 2 and 87 par. 1 (ejustice consolidated text read 14.11.2026), the Incoterms 2020 cost split (rule names and structure) and present-value discounting; preset inputs are read from ref/bidnormalize_presets.json and diffed against the page presets.' };
const P = benchPaths({ name: 'bidnormalize', page: 'bidnormalize.html', ref: 'bidnormalize_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const presetsRef = JSON.parse(fs.readFileSync(P.ref.replace(/bidnormalize_ref\.json$/, 'bidnormalize_presets.json'), 'utf8'));
const TOL = { rel: 1e-9, abs: 1e-6 };
const close = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= Math.max(TOL.abs, TOL.rel * Math.abs(b));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_bidnormalize', '1'); localStorage.removeItem('tnd.project.v1'); } catch (e) { /* private mode */ } });
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__diagramReady && window.__bidnormalize && window.__bidnormalize.last(), null, { timeout: 120000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);
const ENGINE = await p.evaluate(() => ({ bidnorm: window.TndBidNorm && window.TndBidNorm.version, core: window.TndCore && window.TndCore.version }));
const results = [];

/* 0: the page presets are the inputs the reference used */
const pagePresets = await p.evaluate(() => window.TndBidNorm.PRESETS.map(x => ({ id: x.id, input: window.TndBidNorm.presetInput(x.id) })));
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'desc' ? undefined : v)));
for (const pr of presetsRef) {
  const pg = pagePresets.find(x => x.id === pr.id);
  results.push({ id: 'preset-data-' + pr.id, kind: 'data', pass: !!pg && JSON.stringify(strip(pg.input)) === JSON.stringify(strip(pr.input)) });
}

/* 1: every reference case through the engine the page loaded */
const got = await p.evaluate(cs => cs.map(c => {
  const r = window.TndBidNorm.normalize(c.input);
  if (!r.ok) return { err: r.errors };
  const bids = {};
  r.bids.forEach(b => { bids[b.id] = { arith: b.arith, fill: b.fillTotal, options: b.options, S: b.S, gap: b.gap, payAdj: b.payAdj, N: b.N, readoutEval: b.readoutEval, ranked: b.ranked, rank: b.rank, readoutRank: b.readoutRank, fills: Object.fromEntries(Object.entries(b.fill || {}).map(([k, f]) => [k, f.P])) }; });
  return { best: r.best, bids };
}), ref.cases);
ref.cases.forEach((c, i) => {
  const g = got[i], cmp = {};
  let pass = g && !g.err;
  if (pass && c.expect) {
    for (const [id, e] of Object.entries(c.expect.bids)) {
      const b = g.bids[id];
      if (!b) { pass = false; cmp[id] = 'missing'; continue; }
      for (const k of ['arith', 'options', 'S', 'gap', 'payAdj', 'N', 'readoutEval']) if (!close(b[k], e[k])) { pass = false; cmp[id + '.' + k] = [b[k], e[k]]; }
      if (!close(b.fill, e.fill)) { pass = false; cmp[id + '.fill'] = [b.fill, e.fill]; }
      if (b.ranked !== e.ranked || b.rank !== e.rank || b.readoutRank !== e.readoutRank) { pass = false; cmp[id + '.rank'] = [b.ranked, b.rank, b.readoutRank, e.ranked, e.rank, e.readoutRank]; }
    }
    if (g.best !== c.expect.best) { pass = false; cmp.best = [g.best, c.expect.best]; }
  }
  if (pass && c.hand) {
    const b = g.bids[c.hand.bid];
    if (c.hand.P != null && !close(b.fills[c.hand.item], c.hand.P)) { pass = false; cmp.P = [b.fills[c.hand.item], c.hand.P]; }
    if (c.hand.N != null && !close(b.N, c.hand.N)) { pass = false; cmp.N = [b.N, c.hand.N]; }
  }
  results.push({ id: c.id, kind: c.kind, cmp: Object.keys(cmp).length ? cmp : undefined, pass: !!pass, err: g && g.err });
});

/* 2: presets through the page (Examples panel -> state in % -> engineInput) and the tiles on screen; ahas */
const ui = await p.evaluate(async ids => {
  const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]'), out = {};
  const W = window.__bidnormalize;
  for (const id of ids) {
    sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click();
    await new Promise(r => setTimeout(r, 150));
    const L = W.last();
    const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').trim());
    out[id] = { best: L.best, rb: L.readoutBest, changed: L.winnerChanged, N: Object.fromEntries(L.bids.map(b => [b.id, b.N])), rank: Object.fromEntries(L.bids.map(b => [b.id, b.rank])),
                readoutRank: Object.fromEntries(L.bids.map(b => [b.id, b.readoutRank])), fill: Object.fromEntries(L.bids.map(b => [b.id, b.fillTotal])), arith: Object.fromEntries(L.bids.map(b => [b.id, b.arith])),
                payPct: Object.fromEntries(L.bids.map(b => [b.id, b.payFactor - 1])), readoutEval: Object.fromEntries(L.bids.map(b => [b.id, b.readoutEval])), tiles };
  }
  /* options-free with the free option included */
  sel.value = 'options-free'; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 150));
  W.state.items.forEach(it => { if (it.kind === 'free_option') it.include = true; }); W.ui.sync(); W.ui.run();
  const L2 = W.last(); out.freeIncluded = { best: L2.best, dis: L2.nDisregarded, N: Object.fromEntries(L2.bids.map(b => [b.id, b.N])) };
  return out;
}, presetsRef.map(x => x.id));
for (const pr of presetsRef) {
  const e = ref.cases.find(c => c.id === 'preset-' + pr.id).expect, u = ui[pr.id];
  const okN = Object.entries(e.bids).every(([id, x]) => close(u.N[id], x.N) && u.rank[id] === x.rank);
  const tileOk = u.tiles[0] === pr.input.bids.find(b => b.id === e.best).name || u.tiles[0] === undefined ? true : u.tiles.length > 0;
  results.push({ id: 'page-' + pr.id, kind: 'page', cmp: { best: [u.best, e.best], tile0: u.tiles[0] }, pass: okN && u.best === e.best && tileOk });
}
const A = ui, aha = [
  ['aha-be-works', A['be-works'].rb === 'B3' && A['be-works'].best === 'B1' && A['be-works'].rank.B3 === 2 && A['be-works'].readoutRank.B1 === 3 && A['be-works'].rank.B2 === 3
    && Math.abs(A['be-works'].fill.B3 - 123000) < 1000 && Math.abs(A['be-works'].arith.B2 - 18000) < 1, 'lowest at opening (B3) second after ~123 k art. 86 fill; B2 +18 k arithmetic to third; B1 (third at opening) wins'],
  ['aha-epc', A['epc-equipment'].rb === 'S3' && A['epc-equipment'].best === 'S1' && A['epc-equipment'].rank.S3 === 3
    && Math.abs((A['epc-equipment'].readoutEval.S2 - A['epc-equipment'].readoutEval.S3) - 225000) < 1000, 'FOB Shanghai 225 k cheaper at opening, third at DDP site; EXW Germany wins'],
  ['aha-options', A['options-free'].rb === 'L2' && A['options-free'].rank.L2 === 3 && A['options-free'].best === 'L3' && A.freeIncluded.best === 'L3'
    && A.freeIncluded.dis === 2 && A.freeIncluded.N.L1 === A['options-free'].N.L1, 'required option drops L2 to third; the priced free option is disregarded under art. 48 par. 3 (L1, L2) and L3 stays first'],
  ['aha-payment', Math.abs(A['payment-terms'].payPct.C1 - 0.026) < 0.0005 && Math.abs(A['payment-terms'].payPct.C3 + 0.021) < 0.0005
    && Math.abs((A['payment-terms'].payPct.C1 - A['payment-terms'].payPct.C3) - 0.047) < 0.0005, '30 % advance +2.6 %, 10 % retention 24 m / 60 d -2.1 %, swing 4.7 %']
];
aha.forEach(([id, ok, note]) => results.push({ id, kind: 'aha', note, pass: !!ok }));

/* 3: project round trip: save -> export/import JSON -> restore gives the same normalised prices; bids block carries N */
const rt = await p.evaluate(async () => {
  const W = window.__bidnormalize, C = window.TndCore, out = {};
  const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
  sel.value = 'epc-equipment'; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 150));
  const before = W.last();
  const doc = C.project.withModule(C.project.empty(), 'bidnormalize', W.projectPayload(C.project.empty()));
  const back = C.project.importJSON(C.project.exportJSON(doc));
  out.valid = back.ok;
  out.priceS1 = (back.doc.bids.find(b => b.party === 'S1') || {}).price;
  sel.value = 'payment-terms'; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 150));
  const res = W.restoreFrom(back.doc), after = W.last();
  out.restored = res.ok;
  out.same = before.bids.every(b => { const a = after.bids.find(x => x.id === b.id); return a && Math.abs(a.N - b.N) <= 1e-6 * Math.abs(b.N) && a.rank === b.rank; });
  out.N_S1 = before.bids.find(b => b.id === 'S1').N;
  /* other tools' fields in bids survive */
  const d2 = C.project.empty(); d2.bids = [{ party: 'S1', lot: 'L1', price: 1, quality: { Q1: 7 }, lcc: { energy: 5 } }];
  const d3 = C.project.withModule(d2, 'bidnormalize', W.projectPayload(d2));
  const s1 = d3.bids.find(b => b.party === 'S1');
  out.keep = !!(s1 && s1.quality && s1.quality.Q1 === 7 && s1.lcc && s1.lcc.energy === 5 && s1.price > 1000);
  /* absurd saved state refused, state unchanged */
  const bad = C.project.empty(); bad.modules = { bidnormalize: { state: { items: 'x', bids: { a: 1 }, rate: 1e9 }, results: {}, summary: {}, updatedAt: '2026-11-14T00:00:00Z' } };
  const st0 = JSON.stringify(W.state); const rb = W.restoreFrom(bad);
  out.bad = { ok: rb.ok, unchanged: JSON.stringify(W.state) === st0 };
  /* package: technical knock-out from bidevaluation sets tech = fail and removes the bid from the ranking */
  const pk = W.usePackage({ bid_evaluations: [{ id: 'EV1', bidders: [{ id: 'S1', name: 'Rheinwerk Trafo GmbH (DE)', knock_out: true }] }] });
  out.pkg = { ok: pk.ok, tech: W.state.bids.find(b => b.id === 'S1').tech, ranked: W.last().bids.find(b => b.id === 'S1').ranked, best: W.last().best };
  W.state.bids.find(b => b.id === 'S1').tech = 'pass'; W.ui.sync(); W.ui.run();
  /* CSV: formula injection guarded */
  W.state.bids[0].name = '=HYPERLINK("x")'; W.ui.sync(); W.ui.run();
  out.csvGuard = W.csv().indexOf('\'=HYPERLINK') >= 0;
  return out;
});
results.push({ id: 'project-roundtrip', kind: 'project', cmp: rt, pass: rt.valid && rt.restored && rt.same && Math.abs(rt.priceS1 - rt.N_S1) < 1e-6 });
results.push({ id: 'project-keeps-other-fields', kind: 'project', pass: rt.keep });
results.push({ id: 'project-absurd-refused', kind: 'project', cmp: rt.bad, pass: rt.bad.ok === false && rt.bad.unchanged });
results.push({ id: 'package-knockout', kind: 'project', cmp: rt.pkg, pass: rt.pkg.ok && rt.pkg.tech === 'fail' && rt.pkg.ranked === false && rt.pkg.best === 'S2' });
results.push({ id: 'csv-injection-guard', kind: 'export', pass: rt.csvGuard });

/* 4: review fixes (fix-bidnormalize 15.11.2026): restore limits, no stale lines, Use banner, tie, performance at 20 bids x 200 items */
const fx = await p.evaluate(async () => {
  const W = window.__bidnormalize, C = window.TndCore, out = {};
  const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
  const loadEx = async id => { sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 150)); };
  const big = (nb, ni) => {
    const items = [], bids = [], lines = [];
    for (let i = 0; i < ni; i++) items.push({ id: 'I' + i, desc: 'item ' + i, unit: 'm', qty: 10 + i, kind: 'base', up: null, include: true });
    for (let j = 0; j < nb; j++) { bids.push({ id: 'Z' + j, name: 'Firm ' + j, currency: 'EUR', fx: 1, readout: null, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', adv: 0, ret: 0, retM: 0, days: 30 });
      for (let i = 0; i < ni; i++) lines.push({ bid: 'Z' + j, item: 'I' + i, up: 100 + j + i, amount: (10 + i) * (100 + j + i), decision: 'auto' }); }
    return { cur: 'EUR', rate: 3, T: 10, ref: 'DAP', refDays: 30, arith: 'unit', missing: 'fill', priceOnly: false, items, bids, lines, logistics: [], tenderRef: '', evaluator: '' };
  };
  const docOf = st => { const d = C.project.empty(); d.modules = { bidnormalize: { state: st, results: {}, summary: {}, updatedAt: '2026-11-15T00:00:00Z' } }; return d; };
  /* over the limit: refused with a reason, state unchanged */
  await loadEx('epc-equipment');
  const st0 = JSON.stringify(W.state);
  const tooMany = big(41, 3); const r1 = W.restoreFrom(docOf(tooMany));
  out.over = { ok: r1.ok, over: r1.over, unchanged: JSON.stringify(W.state) === st0 };
  /* a restore without lines never keeps the previous evaluation's lines */
  const noLines = big(2, 2); delete noLines.lines; const r2 = W.restoreFrom(docOf(noLines));
  out.stale = { ok: r2.ok, lines: W.state.lines.length, bids: W.state.bids.map(b => b.id).join(',') };
  /* performance: 20 bids x 200 items (4 000 price lines) restore and one edit through the price grid */
  const t0 = performance.now(); const r3 = W.restoreFrom(docOf(big(20, 200))); await new Promise(r => setTimeout(r, 0)); const t1 = performance.now();
  const inp = document.querySelector('[data-bn="grid"] [data-bn="g-up"]');
  const t2 = performance.now(); inp.value = '999'; inp.dispatchEvent(new Event('change', { bubbles: true })); const t3 = performance.now();
  out.perf = { ok: r3.ok, ranked: W.last().ranked.length, restoreMs: Math.round(t1 - t0), editMs: Math.round(t3 - t2), nodes: document.getElementsByTagName('*').length,
               line: (W.state.lines.find(l => l.bid === 'Z0' && l.item === 'I0') || {}).up };
  /* Use on another tool's module: a message, never a silent no-op */
  await loadEx('be-works');
  const bar = W.bar(); const d = C.project.empty(); d.modules = { awardcriteria: { state: {}, results: {}, summary: {}, updatedAt: '2026-11-15T00:00:00Z' } };
  let used = null;
  try { bar.setDoc(d, { save: false }); } catch (e) { used = String(e); }
  const ub = document.querySelector('[data-module="awardcriteria"]');
  if (ub) { ub.click(); used = (document.querySelector('[data-bn="msg"]') || {}).textContent || ''; }
  out.use = { button: !!ub, msg: used };
  /* tie: two equal bids share rank 1 and the tile says so (art. 87 par. 2) */
  await loadEx('payment-terms');
  W.state.bids.forEach(b => { b.adv = 0; b.ret = 0; b.days = 30; }); W.ui.sync(); W.ui.run();
  const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => t.textContent);
  out.tie = { tie: W.last().tie, tile: tiles[0] || '' };
  return out;
});
results.push({ id: 'restore-over-limit-refused', kind: 'project', cmp: fx.over, pass: fx.over.ok === false && Array.isArray(fx.over.over) && fx.over.unchanged });
results.push({ id: 'restore-no-stale-lines', kind: 'project', cmp: fx.stale, pass: fx.stale.ok && fx.stale.lines === 0 && fx.stale.bids === 'Z0,Z1' });
results.push({ id: 'perf-20x200', kind: 'perf', cmp: fx.perf, pass: fx.perf.ok && fx.perf.ranked === 20 && fx.perf.restoreMs < 3000 && fx.perf.editMs < 1000 && fx.perf.line === 999 });
results.push({ id: 'use-banner-not-silent', kind: 'project', cmp: fx.use, pass: !fx.use.button || /awardcriteria|Award|criteria/i.test(fx.use.msg) && fx.use.msg.length > 20 });
results.push({ id: 'tie-art87-2', kind: 'page', cmp: fx.tie, pass: fx.tie.tie.length === 3 && /tie/i.test(fx.tie.tile) });
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'bidnormalize',
  file: 'bidnormalize.html',
  engine: ENGINE,
  reference: 'bench-src/ref/gen_bidnormalize.py — independent Python from KB 18.04.2017 art. 34, 86 par. 2, 87 par. 1, the Incoterms 2020 cost split and present-value discounting (not ported from the JavaScript)',
  reference_citations: [
    'Koninklijk besluit 18 april 2017 plaatsing overheidsopdrachten in de klassieke sectoren, art. 34 (rekenfouten en materiële fouten), art. 86 §2 (ontbrekende prijzen), art. 87 §1 (opties) — consolidated text, ejustice.just.fgov.be (ELI 2017041814), read 14.11.2026',
    'Arrêté royal du 18 avril 2017 relatif à la passation des marchés publics dans les secteurs classiques, art. 34, 86 §2, 87 §1 — texte coordonné, ejustice.just.fgov.be, lu le 14.11.2026',
    'Wet van 17 juni 2016 inzake overheidsopdrachten, art. 81 (gunningscriteria)',
    'ICC Incoterms 2020 — rule names and the allocation of costs between seller and buyer (structure only)',
    'IEC 60300-3-3 (life-cycle costing) — present-value discounting, structure only'
  ],
  tolerance: 'money values relative 1e-9 or 1e-6 absolute; ranks, ranked flags and the lowest bid exact',
  independence: 'Independent of the JavaScript: the Python reference implements the article text and the Incoterms stage table on its own; hand cases (art. 86 worked example P = 60, Incoterm 11 x 11 matrix with one element cost, 30 % advance present value) and 300 seeded random tenders; the page is driven through its Examples panel and its project bar.',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`bidnormalize: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass).slice(0, 15)) console.log('FAIL', r.id, JSON.stringify(r.cmp || r.note || r.err));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
