// Benchmark driver for acousticreqbe.html (Acoustic Requirements BE — NBN S 01-400-1:2022, NBN S 01-400-3:2026).
// Reference: bench-src/ref/gen_acousticreqbe.py (independent Python decision tables re-typed from the rendered norm pages) -> ref/acousticreqbe_ref.json.
// Every point runs through the engine the page loaded (window.AcuReq); the first points of each pair / façade case also run through the page state
// (window.__acousticreqbe.setState) and are read back from the result tiles.
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_acousticreqbe.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected requirements were computed by bench-src/ref/gen_acousticreqbe.py, an independent Python transcription of NBN S 01-400-1:2022 Tab. 1–6, §5.3–5.4, §6.3–6.4, §8.2–8.4, §9.2 and NBN S 01-400-3:2026 §5.2, §6.2, Tab. 1–12, 15, 16, Annex A Tab. A.1, Tab. B.1, Tab. C.1 and Annex E Tab. E.1, written as named decision rules from the rendered pages, not from the page code. Shared reading with the engine (not independent): the mapping of the tool space list onto table rows / columns that group several spaces, the RA,50 / LI,50 applicability, the Note 2 interpretation (only towards dwellings without LAeq), the §5.2 +(LAeq,15min − 80) increase only towards dwellings (la_req_act3), no door relief on a Tab. 2 note 3 / Tab. 4 note 3 value and door relief judged on the sending space (la_req_conf), and the nearest-row choice of εspat. Written from the clause in r3-fix (not a shared reading): part 1 Tab. 2 row 2 only for a common circulation on the same floor that is not a staircase; part 3 §9.3 Tnom ≥ 0,4 s, measured + 10 %, other furnishing state × 0,9 / × 1,1; §9.2 verdict (design: Tab. 15 sufficient; measured Tnom met → Tab. 15 cancelled, else Tab. 15 with workmanship). External anchors: the values stated in the running text of part 3 §5.2 / §6.2 and part 1 §9.2.' };
const P = benchPaths({ name: 'acousticreqbe', page: 'acousticreqbe.html', ref: 'acousticreqbe_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__diagramReady && window.__acousticreqbe && window.AcuReq, null, { timeout: 30000 });
await p.waitForTimeout(300);
const BUILD = await readPageManifestRevision(p);

const results = [];
let npts = 0, nscreen = 0, anchorsTotal = 0, anchorsPassed = 0;
for (const c of ref) {
  let reads = null;
  try {
    reads = await p.evaluate(cc => {
      const R = window.AcuReq, A = window.__acousticreqbe;
      const items = res => { const o = {}; (res.items || []).forEach(it => { o[it.q] = it; }); return o; };
      const got = cc.points.map(pt => {
        const i = pt.input, g = {};
        if (pt.fn === 'pair' || pt.fn === 'facade') { const r = pt.fn === 'pair' ? R.pair(i) : R.facade(i); const m = items(r); Object.keys(m).forEach(q => { g[q] = m[q].value; }); }
        else if (pt.fn === 'check') { const k = R.check(R.pair(i.pair), i.q, i.measured, i.V, i.bedroom); g.pass = k.pass; g.tol = k.tol; g.rounded = k.rounded; }
        else if (pt.fn === 'service') { const r = R.service(i); const m = items(r); Object.keys(m).forEach(q => { g[q] = m[q].value; }); if (r.check) g.pass = r.check.pass; }
        else if (pt.fn === 'eps') { g.eps = R.epsSpat.apply(null, i).eps; }
        else if (pt.fn === 'absorption') { const r = R.absorption(i); const m = items(r);
          Object.keys(m).forEach(q => { g[q] = m[q].value; if (m[q].achieved != null) g['achieved_' + q] = m[q].achieved; if (m[q].pass != null) g['pass_' + q] = m[q].pass; });
          if (r.T_est != null) g.T_est = r.T_est; if (r.verdict) { g.verdict = r.verdict.pass; g.basis = r.verdict.basis; } }
        return g;
      });
      /* the page path: state -> engine -> tiles, for the first 3 pair / façade points of the case */
      const screen = [];
      cc.points.slice(0, 3).forEach(pt => {
        const i = pt.input; let st = null;
        if (pt.fn === 'pair' && i.norm !== 'S01-400-3') st = { norm: 'S01-400-1', mode: 'pair', cls: i.cls, relation: i.relation, sendUse: i.sendUse, recvUse: i.recvUse, element: i.element || 'wall',
          twoNewHouses: !!i.twoNewHouses, noSourceLoad: !!i.noSourceLoad, oneBedroom: !!i.oneBedroom, sendAbove: !!i.sendAbove, circSameFloor: !!i.circSameFloor, act: i.LAeq_dB != null || i.LAF5_dB != null, LAeq_dB: i.LAeq_dB || 0, LAF5_dB: i.LAF5_dB || 0 };
        else if (pt.fn === 'pair') st = { norm: 'S01-400-3', mode: 'pair', type: i.type, send: i.send, recv: i.recv, door: !!i.door, confidential: !!i.confidential, otherCompany: !!i.otherCompany,
          otherBuilding: !!i.otherBuilding, dwellingBuilding: i.dwellingBuilding || 'same', sameUnit: !!i.sameUnit, mobilePartition: !!i.mobilePartition, act: i.LAeq_dB != null || i.LAF5_dB != null, LAeq_dB: i.LAeq_dB || 0, LAF5_dB: i.LAF5_dB || 0 };
        else if (pt.fn === 'facade' && i.norm !== 'S01-400-3') st = { norm: 'S01-400-1', mode: 'facade', cls: i.cls, fuse: i.use, LAday: i.LAday, LAnight: i.LAnight, hasLmax: i.LAmax3xNight != null, LAmax3x: i.LAmax3xNight || 70, secondPane: !!i.secondPane, gallery: !!i.gallery };
        else if (pt.fn === 'facade') st = { norm: 'S01-400-3', mode: 'facade', fspace: i.space, LAday: i.LAday, LAnight: i.LAnight, hasLmax: i.LAmax3xNight != null, LAmax3x: i.LAmax3xNight || 70, secondPane: !!i.secondPane, dayUse: !!i.dayUse };
        if (!st) return;
        A.setState(st);
        const m = {}; ((A.last && A.last.items) || []).forEach(it => { m[it.q] = it.value; });
        const tiles = Array.from(document.querySelectorAll('.dgu-tile')).map(t => ((t.querySelector('.dgu-tile-v') || {}).textContent || '').replace(/\s+/g, ' ').trim());
        screen.push({ values: m, tiles });
      });
      return { got, screen };
    }, c);
  } catch (e) { errs.push('driver: ' + c.id + ': ' + String(e && e.message || e)); }
  const cmp = {}; let pass = !!reads, bad = 0;
  const add = (k, g, x, ok) => { if (!ok) { pass = false; bad++; if (Object.keys(cmp).length < 12) cmp[k] = { got: g, exp: x }; } };
  const same = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) <= 0.011 : a === b;
  (reads ? reads.got : []).forEach((g, i) => {
    const pt = c.points[i], e = pt.expect; npts++;
    const key = i + ':' + JSON.stringify(pt.input).slice(0, 140);
    Object.keys(e).forEach(k => add(key + ' ' + k, g[k], e[k], same(g[k] === undefined ? 'absent' : g[k], e[k])));
    if (pt.fn === 'pair' || pt.fn === 'facade') Object.keys(g).forEach(k => { if (!(k in e)) add(key + ' extra ' + k, g[k], 'absent', false); });
  });
  (reads ? reads.screen : []).forEach((s, i) => {
    const e = c.points[i].expect; nscreen++;
    Object.keys(e).forEach(k => {
      add('screen' + i + ' ' + k, s.values[k], e[k], same(s.values[k] === undefined ? 'absent' : s.values[k], e[k]));
      if (typeof e[k] === 'number') { const want = (k === 'LnTw' || k === 'LI50' ? '≤ ' : '≥ ') + e[k] + ' dB'; add('screen' + i + ' tile ' + k, s.tiles, want, s.tiles.some(t => t.includes(want))); }
    });
  });
  if (c.anchor) { anchorsTotal++; if (pass) anchorsPassed++; }
  results.push({ id: c.id, note: c.note, points: c.points.length, anchor: c.anchor || undefined, checks_failed: bad, cmp, pass });
}
await browser.close();
const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'acousticreqbe',
  file: 'acousticreqbe.html',
  reference: 'bench-src/ref/gen_acousticreqbe.py — independent Python decision tables of NBN S 01-400-1:2022 (Tab. 1–6, §5.3–5.4, §6.3–6.4, §8.2–8.4, §9.2) and NBN S 01-400-3:2026 (§5.2, §6.2, Tab. 1–12, 15, 16, Annex A Tab. A.1, Tab. B.1, Tab. C.1, Annex E Tab. E.1) re-typed from the rendered norm pages, over the full grid: 4 dwelling relations × 3 classes × sending / receiving uses × wall / floor, the two-new-houses, no-load, one-bedroom and above flags, activity levels, the in-situ tolerance with rounding, façade Tab. 3 / Tab. 11 with all notes, service equipment Tab. 4–6, every space pair of the five building-type tables with / without a door, the generic B.1 / C.1 grid with the door / company / building / activity rules, towards dwellings, εspat of Tab. E.1 and the absorption / reverberation targets; + the values stated in the running text as external anchors (' + anchorsPassed + '/' + anchorsTotal + '). The space-to-row mapping of grouped table rows, the RA,50 / LI,50 applicability, the Note 2 reading and the εspat row choice are a shared reading with the engine',
  external_anchors: { total: anchorsTotal, passed: anchorsPassed },
  reference_citations: [
    'NBN S 01-400-1:2022 Critères acoustiques pour les immeubles d’habitation, §5.2 Tab. 1, §5.3, §5.4, §6.2 Tab. 2, §6.3, §6.4, §7.2 Tab. 3, §8.2, §8.3 Tab. 4–6, §8.4, §9.2',
    'NBN S 01-400-3:2026 Acoustic requirements in non-residential buildings, §5.2, Tab. 1–5, §6.2, Tab. 6–10, §7.2.1 Tab. 11–12, §9.2 Tab. 15–16, Annex A Tab. A.1, Annex B Tab. B.1, Annex C Tab. C.1, Annex E Tab. E.1',
    'Learning assumptions / interpretations of both engine and reference (labelled on the page): Sabine T = 0,16 V / Aeff; εspat at the nearest proportion row; Note 2 only towards dwellings without LAeq; RA,50 / LI,50 for party elements towards protected rooms'
  ],
  tolerance: 'exact on every requirement value, on “no requirement” and on the presence of each quantity (RA,50, LI,50, D2m,A); ±0,01 on εspat, Tnom, T and areas (rounded to 2 / 1 decimals); exact pass / fail of the in-situ check with the rounded value; the page path (state → engine → tiles) for the first three points of every pair / façade case; §5.2 activity increase only towards dwellings; no door relief on note values / judged on the sending space',
  total, passed, failed, points: npts, screen_points: nscreen,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`acousticreqbe: ${passed}/${total} passed (${npts} points, ${nscreen} through the page; external anchors ${anchorsPassed}/${anchorsTotal})`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, r.checks_failed, JSON.stringify(r.cmp).slice(0, 900));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
