// Benchmark driver for quotelevel.html (Subcontractor & Supplier Quote Levelling).
// Reference: bench-src/ref/gen_quotelevel.py (independent Python written from _tnd/quotelevel/SPEC.md: own table of the legs the BUYER pays per Incoterms 2020 rule,
// customs value built leg by leg per Union Customs Code art. 70-72, ranks by sorting, leader stability by scanning and bisection) -> ref/quotelevel_ref.json.
// Run: BENCH_BASE=http://127.0.0.1:8798 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_quotelevel.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Prices in euro, options, plugs, logistics legs, customs values, advance costs, levelled costs, ranks, leaders, leads, stability ranges and flags are recomputed by bench-src/ref/gen_quotelevel.py from the method in _tnd/quotelevel/SPEC.md; preset findings are checked in the reference and on the page.' };
const P = benchPaths({ name: 'quotelevel', page: 'quotelevel.html', ref: 'quotelevel_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const TOL = 1e-9;

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_quotelevel', '1'); localStorage.removeItem('tnd.project.v1'); } catch (e) { /* private mode */ } });
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__diagramReady && window.__quotelevel && window.__quotelevel.last(), null, { timeout: 120000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);
const ENGINE = await p.evaluate(() => ({ ql: window.TndQl && window.TndQl.version, core: window.TndCore && window.TndCore.version }));

/* the page's analysis reduced to the reference's shape (runs in the page) */
const REDUCE = `(function (R) {
  if (!R || !R.ok) return null;
  var rows = {};
  R.rows.forEach(function (r) {
    rows[r.id] = r.valid ? { valid: true, P: r.P, opt: r.opt, plug: r.plug, logistics: r.logistics, fin: r.fin, L: r.L, gapShare: r.gapShare, customsValue: r.customsValue,
      log: ['load', 'pre', 'main', 'ins', 'imp', 'onc', 'unload'].map(function (e) { return r.log[e]; }), rawRank: r.rawRank, rank: r.rank } : { valid: false };
  });
  return { rows: rows, leader: R.leader, leaders: R.leaders.slice().sort(), rawLeader: R.rawLeader, second: R.second, lead: R.lead,
    stability: R.stability ? { lo: R.stability.lo, hi: R.stability.hi } : null, allExcluded: R.allExcluded, flags: R.flags.slice().sort() };
})`;
const near = (a, b, t) => (a == null || b == null) ? a == b : Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const big = v => (v == null || v > 1e4) ? null : v;
function compare(g, e) {
  const bad = [];
  if (!g) return ['no result'];
  for (const id of Object.keys(e.rows)) {
    const a = g.rows[id], b = e.rows[id];
    if (!a) { bad.push('missing ' + id); continue; }
    if (a.valid !== b.valid) { bad.push(id + ' valid'); continue; }
    if (!b.valid) continue;
    for (const k of ['P', 'opt', 'plug', 'logistics', 'fin', 'L', 'gapShare', 'customsValue']) if (!near(a[k], b[k], TOL)) bad.push(id + ' ' + k + ' ' + a[k] + ' vs ' + b[k]);
    b.log.forEach((x, i) => { if (!near(a.log[i], x, TOL)) bad.push(id + ' leg ' + i + ' ' + a.log[i] + ' vs ' + x); });
    if (a.rawRank !== b.rawRank || a.rank !== b.rank) bad.push(id + ' ranks ' + a.rawRank + '/' + a.rank + ' vs ' + b.rawRank + '/' + b.rank);
  }
  for (const k of ['leader', 'rawLeader', 'second']) if (g[k] !== e[k]) bad.push(k + ' ' + g[k] + ' vs ' + e[k]);
  if (g.leaders.join() !== e.leaders.join()) bad.push('leaders');
  if (!near(g.lead, e.lead, TOL)) bad.push('lead ' + g.lead + ' vs ' + e.lead);
  if (!!g.stability !== !!e.stability) bad.push('stability presence');
  else if (g.stability) {
    if (!near(g.stability.lo, e.stability.lo, 1e-8)) bad.push('stab lo ' + g.stability.lo + ' vs ' + e.stability.lo);
    if (!near(big(g.stability.hi), big(e.stability.hi), 1e-8)) bad.push('stab hi ' + g.stability.hi + ' vs ' + e.stability.hi);
  }
  if (g.allExcluded.join() !== e.allExcluded.join()) bad.push('allExcluded');
  if (g.flags.join() !== e.flags.join()) bad.push('flags ' + g.flags + ' vs ' + e.flags);
  return bad;
}
/* reference input (engine units) -> page state (percent fields in percent; legs and terms in their own list; cells as exclusion lines) */
function toState(i) {
  const pc = v => v == null ? 0 : v * 100;
  const st = { policy: i.policy || 'allowance', unclear: i.unclear == null ? 100 : pc(i.unclear), rate: i.rate == null ? 6 : pc(i.rate), gapWarn: i.gapWarn == null ? 10 : pc(i.gapWarn),
    load: i.load || 0, ins: pc(i.ins || 0), duty: pc(i.duty || 0), impFix: i.impFix || 0, unload: i.unload || 0,
    items: (i.items || []).map(it => ({ id: it.id, name: it.id, allowance: it.allowance })), quotes: [], terms: [], gaps: [] };
  for (const q of i.quotes || []) {
    st.quotes.push({ id: q.id, name: '', price: q.price, cur: q.cur || 'EUR', fx: q.fx == null ? null : q.fx, incoterm: q.incoterm || 'site', eu: q.eu !== false });
    if (q.pre || q.main || q.onc || q.adv || q.advMonths || q.adj) st.terms.push({ q: q.id, pre: q.pre || 0, main: q.main || 0, onc: q.onc || 0, adv: pc(q.adv || 0), months: q.advMonths || 0, adj: q.adj || 0 });
    for (const [iid, c] of Object.entries(q.cells || {})) if (c.s !== 'inc' || c.amt != null) st.gaps.push({ q: q.id, item: iid, s: c.s, amt: c.amt == null ? null : c.amt });
  }
  return st;
}

const results = [];
const presetIds = ['hvac-sub', 'pumps-landed', 'elec-epc', 'steel-policy'];

/* 1: presets through the Examples panel (the reader's path), compared in full */
for (const c of ref.cases.filter(c => presetIds.includes(c.input.id))) {
  const g = await p.evaluate(async ({ id, red }) => {
    const sel = document.querySelector('.dgu-exsel select'), load = document.querySelector('[data-example-load]');
    sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); load.click();
    await new Promise(r => setTimeout(r, 150));
    const L = window.__quotelevel.last();
    return { red: eval(red)(L), verdict: (document.querySelector('.dgu-verdict') || {}).textContent || '' };
  }, { id: c.input.id, red: REDUCE });
  const bad = compare(g.red, c.expect);
  if (!g.verdict.startsWith('Levelled lowest: ' + c.expect.leader)) bad.push('verdict ' + g.verdict.slice(0, 60));
  results.push({ id: 'preset-' + c.input.id, kind: 'preset', pass: !bad.length, bad: bad.slice(0, 6) });
}

/* 2: hand cases through the page state (as a user types them) */
for (const c of ref.cases.filter(c => /^hand-/.test(c.input.id))) {
  const st = toState(c.input);
  const g = await p.evaluate(({ st, red }) => {
    const W = window.__quotelevel;
    ['items', 'quotes', 'terms', 'gaps'].forEach(k => { W.state[k].length = 0; st[k].forEach(x => W.state[k].push(x)); });
    Object.keys(st).forEach(k => { if (!Array.isArray(st[k])) W.state[k] = st[k]; });
    W.ui.sync(); W.ui.run();
    return eval(red)(W.last());
  }, { st, red: REDUCE });
  const bad = compare(g, c.expect);
  results.push({ id: c.input.id, kind: 'hand', pass: !bad.length, bad: bad.slice(0, 6) });
}

/* 3: random cases through the engine the page loaded */
const rnd = ref.cases.filter(c => /^rnd-/.test(c.input.id));
const got = await p.evaluate(({ cs, red }) => cs.map(c => eval(red)(window.__quotelevel.analyse(c))), { cs: rnd.map(c => c.input), red: REDUCE });
rnd.forEach((c, k) => { const bad = compare(got[k], c.expect); results.push({ id: c.input.id, kind: 'random', pass: !bad.length, bad: bad.slice(0, 4) }); });

/* 4: preset findings (ahas) — reference verdicts and the page's own path (edit a field as the reader would) */
const pageAha = await p.evaluate(async () => {
  const W = window.__quotelevel, wait = () => new Promise(r => setTimeout(r, 80)), out = {}, run = () => { W.ui.sync(); W.ui.run(); };
  const ex = id => { DiagramUI.current.example(id); };
  const row = (L, id) => L.rows.filter(r => r.id === id)[0];
  ex('hvac-sub'); await wait(); let L = W.last();
  out['hvac-sub'] = L.rawLeader === 'Q1' && row(L, 'Q1').rank === 4 && Math.abs(row(L, 'Q1').plug - 320000) < 1e-6 && L.leader === 'Q2' && Math.abs(L.lead - 54000) < 1e-6
    && Math.abs(row(L, 'Q1').gapShare - 0.1155) < 5e-4 && L.flags.indexOf('reversal') >= 0;
  ex('pumps-landed'); await wait(); L = W.last();
  out['pumps-landed'] = L.leader === 'Q3' && Math.abs(L.lead - 12512.2434) < 1e-3 && Math.abs(row(L, 'Q3').gapShare - 0.2383) < 5e-4 && Math.abs(L.stability.hi - 1.1264) < 5e-4
    && L.stability.hiBy === 'Q2' && L.flags.indexOf('gap') >= 0;
  /* plugs 13 % higher (every own estimate x 1.13) -> the US quote wins */
  W.state.items.forEach(it => { it.allowance *= 1.13; }); run(); await wait();
  out['pumps-landed'] = out['pumps-landed'] && W.last().leader === 'Q2';
  ex('elec-epc'); await wait(); L = W.last();
  out['elec-epc'] = L.leader === 'Q1' && Math.abs(L.lead - 105000) < 1e-6 && Math.abs(L.stability.hi - 340000 / 235000) < 1e-9 && row(L, 'Q1').nUnc === 3;
  W.state.items.forEach(it => { it.allowance *= 1.46; }); run(); await wait();
  out['elec-epc'] = out['elec-epc'] && W.last().leader === 'Q2';
  ex('steel-policy'); await wait(); L = W.last();
  const s1 = L.leader === 'Q3' && Math.abs(L.lead - 30000) < 1e-6;
  W.state.policy = 'max'; run(); await wait(); L = W.last();
  out['steel-policy'] = s1 && L.leader === 'Q2' && Math.abs(row(L, 'Q3').L - 2015000) < 1e-6 && Math.abs(row(L, 'Q3').cells.I1.plug - 145000) < 1e-6;
  return out;
});
for (const id of presetIds) results.push({ id: 'aha-' + id, kind: 'aha', pass: ref.aha[id] === true && pageAha[id] === true, cmp: { reference: ref.aha[id], page: pageAha[id] } });

/* 5: exports, project round trip and the project-package requisition bridge */
const io = await p.evaluate(() => {
  const W = window.__quotelevel; DiagramUI.current.example('hvac-sub');
  const csv = W.csv().replace(/"/g, ''), rec = W.record(), P = W.projectPayload();
  const d = TndCore.project.withModule(TndCore.project.empty({ name: 'bench' }), 'quotelevel', P);
  const v = TndCore.project.validate(d);
  const q1 = d.quotes.filter(q => q.party === 'Q1')[0];
  DiagramUI.current.example('steel-policy'); const u = W.useProject(d, 'quotelevel');
  const back = u.ok && W.last().leader === 'Q2' && Math.abs(W.last().lead - 54000) < 1e-6;
  const req = W.useRequisition({ id: 'REQ-1', label: 'RQ-001 Pumps', scope: [{ id: 'SC-01', text: 'Pump set' }, { id: 'SC-02', text: 'Motor' }], tests: { fat_required: true }, spares: {} });
  const ids = W.state.items.map(i => i.id).join();
  return { csv: /quote:Q2,levelled,2636000/.test(csv) && /result,levelled_leader,Q2/.test(csv), rec: rec.outputs.levelled_leader === 'Q2' && rec.model.equations.length > 5,
           valid: v.ok && d.quotes.length === 4 && q1.rank === 4 && q1.exclusions.length === 4 && q1.scope.I1 === 'exc', back, req: req.ok && ids === 'SC-01,SC-02,FAT' };
});
results.push({ id: 'export-csv', kind: 'io', pass: io.csv }, { id: 'export-record', kind: 'io', pass: io.rec }, { id: 'project-quotes-block', kind: 'io', pass: io.valid },
             { id: 'project-roundtrip', kind: 'io', pass: io.back }, { id: 'requisition-bridge', kind: 'io', pass: io.req });
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'quotelevel',
  file: 'quotelevel.html',
  engine: ENGINE,
  reference: 'bench-src/ref/gen_quotelevel.py — independent Python written from the method (own buyer-pays table per Incoterms 2020 rule, customs value leg by leg per UCC art. 70-72, ranks by sorting, stability by scan and bisection), not ported from tnd-ql.js',
  reference_citations: [
    'Regulation (EU) No 952/2013 laying down the Union Customs Code, art. 70(1), 71(1)(e), 72(a)-(b), OJ L 269, 10.10.2013 (read in the OJ text from the Publications Office, CELEX 32013R0952, 15.11.2026)',
    'ICC Incoterms 2020, ICC Publication 723E (rule names and which party pays which leg, by structure only)',
    'Bid levelling / bid tabulation of subcontract and supplier quotes: estimating practice (plugs for excluded scope, priced options, common delivery basis)'
  ],
  tolerance: 'money values, shares and ranks relative 1e-9 (of max(1,|value|)); stability range 1e-8 (reference by bisection), ranges above 1e4 treated as unbounded; leaders, ranks and flags exact',
  independence: 'Independent of the JavaScript: the reference keeps a table of the legs the buyer pays (the JS keeps the seller side), builds the customs value leg by leg, ranks by sorting and finds the stability range numerically; preset data typed again from SPEC.md',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`quotelevel: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass).slice(0, 15)) console.log('FAIL', r.id, JSON.stringify(r.bad || r.cmp));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
