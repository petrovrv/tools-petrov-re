// Benchmark driver for lowbidcheck.html (Abnormally Low Tender Check).
// Reference: bench-src/ref/gen_lowbidcheck.py (independent Python, standard library only, written from the text of KB 18.04.2017 art. 36
// read on ejustice 14.11.2026) -> ref/lowbidcheck_ref.json. Comparator: bench-src/lowbidcheck-compare.mjs.
// Run: BENCH_BASE=http://127.0.0.1:8798 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_lowbidcheck.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';
import { compareCase, TOL } from './lowbidcheck-compare.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected applicability, art. 36 means and limits, statistics, line medians and flags, outcomes and deadlines were computed by bench-src/ref/gen_lowbidcheck.py from the text of KB 18.04.2017 art. 36 (Belgian Official Journal via ejustice, read 14.11.2026), independent of the JavaScript engine; the fixed cases below were worked by hand from the same text.' };
const P = benchPaths({ name: 'lowbidcheck', page: 'lowbidcheck.html', ref: 'lowbidcheck_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_lowbidcheck', '1'); localStorage.removeItem('tnd.project.v1'); } catch (e) { /* private mode */ } });
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__diagramReady && window.__lowbidcheck && window.TndLowbid, null, { timeout: 120000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);
const ENGINE = await p.evaluate(() => ({ lowbid: window.TndLowbid && window.TndLowbid.version, core: window.TndCore && window.TndCore.version }));
const results = [];

/* 1: every reference case through the engine the page loaded */
const got = await p.evaluate(cs => cs.map(c => window.TndLowbid.analyse(c)), ref.cases.map(({ expect, ...c }) => c));
ref.cases.forEach((c, i) => { const r = compareCase(got[i], c.expect); results.push({ id: c.id, kind: c.id.startsWith('rnd') ? 'random' : (c.id.startsWith('hand') ? 'hand' : 'preset'), pass: r.pass, bad: r.bad.slice(0, 6) }); });

/* 2: deadlines and outcomes */
const dl = await p.evaluate(ds => ds.map(d => window.TndLowbid.deadline(d.date, d.days)), ref.deadlines);
ref.deadlines.forEach((d, i) => results.push({ id: 'deadline-' + d.date + '+' + d.days, kind: 'deadline', cmp: { got: dl[i], exp: d.expect }, pass: dl[i] === d.expect }));
const oc = await p.evaluate(os => os.map(o => window.TndLowbid.outcome(o.input, { kind: o.kind })), ref.outcomes);
ref.outcomes.forEach((o, i) => results.push({ id: 'outcome-' + i, kind: 'outcome', cmp: { got: [oc[i].decision, oc[i].notify, oc[i].article], exp: [o.expect.decision, o.expect.notify, o.expect.article] },
  pass: oc[i].decision === o.expect.decision && oc[i].notify.join() === o.expect.notify.join() && oc[i].article === o.expect.article }));
/* answer periods worked by hand from Reg. 1182/71 art. 3 (Wet 17.06.2016 art. 167) and the Belgian holiday list, literal values */
const DL_TEXT = [
  ['2026-11-16', 12, '2026-11-30', 'Mon + 12 = Sat 28.11 -> art. 3(4) next working day Mon 30.11'],
  ['2026-12-13', 12, '2026-12-28', 'Sun + 12 = Fri 25.12 Christmas -> Sat, Sun -> Mon 28.12'],
  ['2027-03-17', 12, '2027-03-30', 'Wed + 12 = Mon 29.03.2027 Easter Monday -> Tue 30.03'],
  ['2026-07-09', 12, '2026-07-22', 'Thu + 12 = Tue 21.07 National Day -> Wed 22.07'],
  ['2026-11-18', 12, '2026-11-30', 'Wed + 12 = Mon 30.11, a working day: no move'],
  ['2026-11-13', 2, '2026-11-17', 'Fri + 2 = Sun -> Mon 16.11; only one working day in the period -> art. 3(5) Tue 17.11']
];
const dlt = await p.evaluate(ds => ds.map(d => window.TndLowbid.deadline(d[0], d[1])), DL_TEXT);
DL_TEXT.forEach((d, i) => results.push({ id: 'text-deadline-' + d[0] + '+' + d[1], kind: 'text', source: d[3], cmp: { got: dlt[i], exp: d[2] }, pass: dlt[i] === d[2] }));

/* 3: presets through the Examples panel (the reader's path), compared with the reference and with what the screen shows */
const PRE = ['be-works-open8', 'be-works-pq-lines', 'be-supplies-gensets', 'private-epc-unbalanced', 'be-negotiated-small'];
const pageRes = await p.evaluate(async ids => {
  const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]'), out = {};
  for (const id of ids) {
    sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click();
    await new Promise(r => setTimeout(r, 150));
    const L = window.__lowbidcheck.last();
    out[id] = { res: L, verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim(),
                rows: Array.from(document.querySelectorAll('table')).map(t => t.innerText).join('\n') };
  }
  return out;
}, PRE);
for (const id of PRE) {
  const c = ref.cases.find(x => x.id === id), r = compareCase(pageRes[id].res, c.expect), x = pageRes[id];
  const shown = x.res.must.concat(x.res.should, x.res.watch).every(bid => x.verdict.includes(x.res.bids.find(b => b.id === bid).name));
  results.push({ id: 'page-' + id, kind: 'page', pass: r.pass && shown, bad: r.bad.slice(0, 6), verdict: x.verdict });
}

/* 4: preset ahas as stated on the page (each also a test in _tnd/lowbidcheck/test.mjs) */
const A = await p.evaluate(async () => {
  const W = window.__lowbidcheck, sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
  async function pick(id) { sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 150)); return W.last(); }
  function run(mut) { mut(W.state); W.ui.sync(); W.ui.run(); return W.last(); }
  const B = (r, id) => r.bids.find(b => b.id === id), o = {};
  let r = await pick('be-works-open8'); o.a1 = { must: r.must, devMean: B(r, 'B1').devMean, devA: B(r, 'B1').devArt36, high: r.art36.high };
  r = await pick('be-works-pq-lines'); o.a2 = { must: r.must, thr: r.art36.threshold, low: B(r, 'B1').linesLow, d3: r.lines[2].cells.B1.dev, d5: r.lines[4].cells.B1.dev };
  r = run(s => { s.docThreshold = 15; }); o.a2b = { must: r.must };
  r = await pick('be-supplies-gensets'); o.a3 = { must: r.must, mode: r.mode.mode, iqr: B(r, 'G1').iqrLow, devA: B(r, 'G1').devArt36 };
  r = run(s => { s.madeApplicable = true; }); o.a3b = { must: r.must };
  r = await pick('private-epc-unbalanced'); o.a4 = { devO: B(r, 'E1').devOthers, low: B(r, 'E1').linesLow, dE: r.lines[4].cells.E1.dev, dF: r.lines[5].cells.E1.dev, gx: B(r, 'E1').gapExplained };
  r = await pick('be-negotiated-small'); o.a5 = { mode: r.mode.mode, must: r.must, watch: r.watch };
  r = run(s => { s.procedure = 'open'; }); o.a5b = { must: r.must, devA: B(r, 'B1').devArt36 };
  return o;
});
const R0 = v => Math.round(v * 100);
[
  ['aha-open8', A.a1.must.length === 0 && R0(A.a1.devMean) === -18 && R0(A.a1.devA) === -13 && A.a1.high.slice().sort().join() === 'B7,B8', '−18 % vs simple mean, −13 % vs art. 36 mean (lowest and 2 highest out): no mandatory enquiry'],
  ['aha-pq-lines', A.a2.must.length === 0 && Math.abs(A.a2.thr - 0.2) < 1e-12 && A.a2.low.join() === '03,05' && R0(A.a2.d3) === -46 && R0(A.a2.d5) === -50 && A.a2b.must.join() === 'B1', 'none below 20 %, at 15 % B1; lines 03/05 at −46/−50 %'],
  ['aha-gensets', A.a3.mode === 'indicative' && A.a3.must.length === 0 && A.a3.iqr && R0(A.a3.devA) === -36 && A.a3b.must.join() === 'G1', 'supplies: −36 % only a signal; documents make it mandatory'],
  ['aha-epc', R0(A.a4.devO) === -6 && A.a4.low.join() === 'E,F' && A.a4.dE <= -0.8 && A.a4.dF <= -0.8 && Math.abs(A.a4.gx - 0.6) < 1e-9, 'EPC: −6 % total, lines E/F ≥ 80 % below median explain 60 % of the gap'],
  ['aha-negotiated', A.a5.mode === 'exempt' && A.a5.must.length === 0 && A.a5.watch.join() === 'B1' && A.a5b.must.join() === 'B1' && R0(A.a5b.devA) === -22, '§6 exempt; open procedure -> mandatory at −22 %']
].forEach(([id, ok, note]) => results.push({ id, kind: 'aha', note, pass: !!ok, cmp: A }));

/* 5: worked cases from the article text, expected values computed by hand (art. 36 §4 al. 4, 1° and 2°) */
const FIXED = [
  { id: 'text-n8-quarter', src: 'art. 36 §4, 1°: 8 offers -> leave out the lowest and the 2 highest (8/4 = 2)', bids: [80, 90, 92, 94, 96, 98, 150, 160], exp: { mean: (90 + 92 + 94 + 96 + 98) / 5, must: [] } },
  { id: 'text-n9-roundup', src: 'art. 36 §4, 1°: 9 offers -> quarter 2.25 rounded up to 3 highest left out', bids: [60, 90, 92, 94, 96, 98, 150, 160, 170], exp: { mean: (90 + 92 + 94 + 96 + 98) / 5, must: ['O1'] } },
  { id: 'text-n7-two', src: 'art. 36 §4, 1°: 7 offers -> quarter 1.75 rounded up to 2', bids: [70, 100, 100, 100, 100, 200, 300], exp: { mean: 100, must: ['O1'] } },
  { id: 'text-n6-one', src: 'art. 36 §4, 2°: 6 offers -> lowest and highest left out', bids: [84, 100, 100, 100, 100, 500], exp: { mean: 100, must: ['O1'] } },
  { id: 'text-15pct-boundary-in', src: 'art. 36 §4 al. 1: "minstens vijftien procent onder": exactly 15 % below the mean is caught', bids: [85, 100, 100, 100, 100, 130], exp: { mean: 100, must: ['O1'] } },
  { id: 'text-15pct-boundary-out', src: 'art. 36 §4 al. 1: 14.99 % below the mean is not caught', bids: [85.01, 100, 100, 100, 100, 130], exp: { mean: 100, must: [] } }
];
const fx = await p.evaluate(cs => cs.map(c => window.TndLowbid.analyse({ regime: 'be', be: { kind: 'works', procedure: 'open', priceOnly: true },
  bids: c.bids.map((v, i) => ({ id: 'O' + (i + 1), total: v })) })), FIXED);
FIXED.forEach((c, i) => {
  const r = fx[i], ok = r.art36 && Math.abs(r.art36.mean - c.exp.mean) <= 1e-9 * c.exp.mean && r.must.join() === c.exp.must.join();
  results.push({ id: c.id, kind: 'text', source: c.src, cmp: { mean: [r.art36 && r.art36.mean, c.exp.mean], must: [r.must, c.exp.must] }, pass: !!ok });
});

/* 6: project round trip: save -> tender/v1 export/import -> take offers back -> same flags */
const rt = await p.evaluate(async () => {
  const W = window.__lowbidcheck, C = window.TndCore, sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
  sel.value = 'be-works-open8'; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 150));
  const before = W.last(), pay = W.projectPayload();
  let doc = C.project.empty({ name: 'rt' }); doc.parties = before.bids.map(b => ({ id: b.id, name: b.name, role: 'bidder' }));
  doc.tender.kind = 'works'; doc.tender.procedure = 'open';
  doc = C.project.withModule(doc, 'lowbidcheck', pay);
  const back = C.project.importJSON(C.project.exportJSON(doc));
  W.state.bids.length = 0; W.ui.sync(); W.ui.run();
  const u = W.useDoc(back.doc), after = W.last();
  const flagsDoc = back.doc.bids.map(b => b.party + ':' + (b.abnormal && b.abnormal.flag)).join();
  return { ok: back.ok && u.ok, n: u.n, flags: [before.bids.map(b => b.id + ':' + b.flag).join(), after.bids.map(b => b.id + ':' + b.flag).join(), flagsDoc],
           mean: [before.art36.mean, after.art36.mean], names: after.bids.map(b => b.name).join() === before.bids.map(b => b.name).join() };
});
results.push({ id: 'project-roundtrip', kind: 'project', cmp: rt, pass: rt.ok && rt.n === 8 && rt.flags[0] === rt.flags[1] && rt.flags[0] === rt.flags[2] && Math.abs(rt.mean[0] - rt.mean[1]) < 1e-6 && rt.names });
/* own saved analysis: save -> export -> import -> restore (after confirmation) gives the same state (R-3) */
const rs = await p.evaluate(async () => {
  const W = window.__lowbidcheck, C = window.TndCore, sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
  sel.value = 'be-works-pq-lines'; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 150));
  const fp = () => JSON.stringify([W.state.bids, W.state.lines, Object.entries(W.state.j).map(([k, v]) => [k, Object.entries(v).sort()]), W.state.reqDate, W.state.lineLow, W.state.basis, W.state.docThreshold]);
  W.state.reqDate = '2026-11-18'; W.state.j = { B1: { received: true, g1: 'ok', social: 'ok', lineAbnormal: true } }; W.state.lineLow = 25; W.ui.sync(); W.ui.run();
  const before = fp(), r0 = W.last(), doc = C.project.withModule(C.project.empty({ name: 'rs' }), 'lowbidcheck', W.projectPayload());
  const back = C.project.importJSON(C.project.exportJSON(doc));
  W.state.bids.length = 0; W.state.lines.length = 0; W.state.j = {}; W.state.reqDate = ''; W.ui.sync(); W.ui.run();
  const ask = W.restoreFrom(back.doc), emptyStill = W.state.bids.length === 0, ok = W.restoreFrom(back.doc, true);
  return { asked: !!ask.asked, emptyStill, ok: ok.ok, same: fp() === before, flags: [r0.bids.map(b => b.flag).join(), W.last().bids.map(b => b.flag).join()], outcome: W.outcome('B1').decision };
});
results.push({ id: 'project-restore-own-analysis', kind: 'project', cmp: rs, pass: rs.asked && rs.emptyStill && rs.ok && rs.same && rs.flags[0] === rs.flags[1] && rs.outcome === 'reject_line' });
/* Use: one lot at a time, euro only, irregular carried, every tender/v1 procedure mapped (R-2, R-7) */
const ul = await p.evaluate(() => {
  const W = window.__lowbidcheck, d = window.TndCore.project.empty({ name: 'lots' });
  d.tender.procedure = 'innovation-partnership'; d.tender.kind = 'services'; d.tender.sector = 'classic';
  d.bids = [{ party: 'A', lot: 'L1', price: 100 }, { party: 'B', lot: 'L1', price: 110, abnormal: { flag: 'irregular' } }, { party: 'C', lot: 'L1', price: 120, price_currency: 'USD' },
            { party: 'A', lot: 'L2', price: 50 }, { party: 'D', lot: 'L2', price: 55 }];
  const u1 = W.useDoc(d), s1 = W.state.bids.map(b => b.id + (b.irregular ? '!' : '')).join(), proc = W.state.procedure, mode = W.last().mode.mode;
  const u2 = W.useDoc(d, 'L2'), s2 = W.state.bids.map(b => b.id).join();
  return { u1, s1, proc, mode, s2, lots: u2.lots };
});
results.push({ id: 'project-use-lots-currency', kind: 'project', cmp: ul, pass: ul.u1.ok && ul.s1 === 'A,B!' && ul.u1.skippedCur === 1 && ul.proc === 'innovation-partnership' && ul.mode !== 'mandatory' && ul.s2 === 'A,D' && ul.lots.join() === 'L1,L2' });
/* the record carries the line evidence (R-4) */
const rl = await p.evaluate(async () => {
  const W = window.__lowbidcheck, sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
  sel.value = 'be-works-pq-lines'; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click(); await new Promise(r => setTimeout(r, 150));
  const o = W.record().outputs; return { n: o.line_table && o.line_table.length, b1: o.line_table && o.line_table[2].offers.B1, tam: o.total_at_median_B1, gap: o.gap_explained_B1, fl: o.lines_flagged };
});
results.push({ id: 'record-line-evidence', kind: 'record', cmp: rl, pass: rl.n === 9 && rl.b1 && rl.b1.unit_price === 0.78 && rl.b1.flag === 'low' && Math.abs(rl.tam - (3350000 + 98000 * (1.45 - 0.78) + 4 * (42800 - 21500))) < 1e-6 && /05 Bouwbedrijf A/.test(rl.fl) });
const bad = await p.evaluate(() => { const W = window.__lowbidcheck, st0 = JSON.stringify(W.state.bids); const d = window.TndCore.project.empty(); d.bids = [{ party: 'X', price: 0 }]; const u = W.useDoc(d); return { ok: u.ok, unchanged: JSON.stringify(W.state.bids) === st0 }; });
results.push({ id: 'project-no-price-refused', kind: 'project', cmp: bad, pass: bad.ok === false && bad.unchanged });
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'lowbidcheck',
  file: 'lowbidcheck.html',
  engine: ENGINE,
  reference: 'bench-src/ref/gen_lowbidcheck.py — independent Python (standard library) from the text of KB 18.04.2017 art. 36 §1-§6: applicability of §4 and the §6 exemption, trimmed mean, 15 % limit, statistics with linear percentiles (statistics.quantiles inclusive), line medians and flags, outcome order of §3 and notifications of §5, answer period per Reg. 1182/71 art. 3 with the Belgian public holidays',
  reference_citations: [
    'Koninklijk besluit van 18 april 2017 plaatsing overheidsopdrachten in de klassieke sectoren, art. 35-36 (Belgisch Staatsblad 09.05.2017; ejustice, NL and FR texts, read 14.11.2026, https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810)',
    'Wet van 17 juni 2016 inzake overheidsopdrachten, art. 7 and 84 (ejustice, read 14.11.2026)',
    'Directive 2014/24/EU on public procurement, art. 69 Abnormally low tenders (EUR-Lex CELEX 32014L0024, read 14.11.2026)',
    'Regulation (EEC, Euratom) No 1182/71 determining the rules applicable to periods, dates and time limits, art. 3 (EUR-Lex CELEX 31971R1182, read 15.11.2026); Wet 17.06.2016 art. 167',
    'J. W. Tukey, Exploratory Data Analysis (1977), fences Q1 - 1.5 IQR; R. J. Hyndman, Y. Fan, Sample quantiles in statistical packages, The American Statistician 50 (1996) 361-365, definition 7'
  ],
  tolerance: 'money and deviations relative ' + TOL.rel + ' (absolute ' + TOL.abs + '); applicability, reasons, flags, line flags, outcomes and dates exact; preset ahas as stated on the page',
  independence: 'Independent of the JavaScript: the Python reference re-reads the rule from the article text and uses the standard library for statistics; the fixed text cases (n = 6, 7, 8, 9, the 15 % boundary) were computed by hand. Shared interpretation (same author): the screens (mean of the others, IQR fence, estimate, line limits, negligible share by median-priced total) are practice choices, documented as learning assumptions; the 12-day period follows Reg. 1182/71 art. 3 (via Wet 17.06.2016 art. 167); the Python computes Easter with Gauss’s algorithm, the engine with the anonymous Gregorian algorithm, and six periods were worked by hand.',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`lowbidcheck: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass).slice(0, 15)) console.log('FAIL', r.id, JSON.stringify(r.bad || r.cmp || r.note).slice(0, 500));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
