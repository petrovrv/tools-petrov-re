/* Benchmark driver: wallthermalcalculator.html
   Reference: bench-src/ref/wallthermalcalculator_ref.json (independent python,
   EN ISO 6946:2017 / EN ISO 13788:2012 / EN ISO 13786:2017 implemented from the
   standards' text, plus two published worked examples).  The corpus is read, never
   written.  Tolerances are display-limited: half of the last printed digit.

   Usage: node bench-src/run_wallthermalcalculator.mjs --base http://127.0.0.1:PORT \
            --tool wallthermalcalculator.html [--ref <corpus>] [--out <artifact>]
            [--network]            allow the external climate service (default: blocked)

   Adapted 2026-10-03.  The deployed driver addressed #resList, #bigRes, #layerTable
   and nav.tabs, none of which is in the shipping page; its first read therefore
   returned an empty kv map and every comparison got NaN.  The project is still loaded
   through the page's own file input (#fileIn, which does exist), and the numbers are
   still read as printed strings, from the framework nodes that carry them now.

   The page downloads climate data on load (ipwho.is, then archive-api.open-meteo.com).
   That download is OFF the measurement path by default: the external hosts are blocked
   at the browser, the page's own offline fallback runs, and the project file is loaded
   only after that fallback has settled, because loadClimate() ends in
   applyDesignConditions(false), which rewrites ST.te and ST.rhe from whatever climate
   it ended up with.  Every graded number is therefore produced from the project file
   alone.  The one case that needs monthly climate, annual-balance, carries its own
   CLIM block in the project, and the file loader applies it (installFileInput:
   `if (j.CLIM) Object.assign(CLIM, j.CLIM)`).

   No tolerance, case id, reference value or comparison was changed.
*/
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is the manifest_revision read out of the
   live DOM of the page this run loaded, so the artifact names the build it graded and
   not whichever page happens to sit beside the driver; stampProvenance() writes it
   together with reference_provenance, provenance_note and run_at, and refuses to
   write anything without it. Every path resolves through benchPaths() against this
   driver's own tree. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_wall_cases.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 1 076 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

/* Legacy CLI, kept working: --ref took an absolute corpus path, and --out defaulted into
   another agent's workspace (/home/claude/wp/bench14-e/results). Both resolve through
   benchPaths against this driver's own tree now; --base, --site and --out are the
   resolver's own flags. */
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const refFlag = arg('ref', null);
const P = benchPaths({
  name: 'wallthermalcalculator', page: arg('tool', 'wallthermalcalculator.html'),
  ref: refFlag ? path.basename(refFlag) : 'wallthermalcalculator_ref.json',
  query: { lang: 'en' },
  /* http transport unchanged; only the origin became a parameter */
  env: { ...process.env,
         BENCH_BASE: process.env.BENCH_BASE || 'http://127.0.0.1:8327',
         BENCH_REF_DIR: refFlag ? path.dirname(path.resolve(refFlag)) : process.env.BENCH_REF_DIR },
});
const BASE = P.base;
const OUT = P.out;
const OUT2 = P.out2 || OUT.replace(/\.json$/, '.control.json');
const ALLOW_NET = process.argv.indexOf('--network') > 0;
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const URL0 = P.pageUrl;
const consoleLog = [], blockedRequests = [], externalRequests = [];

/* half of the last displayed digit, per printed quantity */
const TOL = {
  R_T: 5e-4, U: 5e-4, Uc: 5e-4, fRsi: 5e-4, Rupper: 5e-4, Rlower: 5e-4,
  thSi: 5e-3, tdew: 5e-3, theta: 5e-2, psat: 1.0, layerR: 5e-4, layerSd: 5e-3,
  totalD: 0.5, mass: 0.5, gc_day: 5e-2, dew_mm: 0.5,
  kappaIn: 5e-2, decrement: 5e-4, shift: 5e-2, annual_peak: 0.5
};
const num = s => {
  if (s == null) return NaN;
  const m = String(s).replace(/−/g, '-').replace(/,/g, '').match(/-?\d+(\.\d+)?([eE][-+]?\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};

/* The three readers the deployed driver used, pointed at the nodes the framework
   renders.  Every string read is the page's own printed string, at the page's own
   precision, so the half-last-digit tolerances keep their meaning.
     #resList .kv   -> the same kv() rows, now in the framework results region
     #bigRes .t     -> .dgu-tile, label in .dgu-tile-l, value in .dgu-tile-v, the
                       secondary line in .dgu-tile-u.  The framework appends the learn
                       marker to the label and upper-cases it in CSS, so the label is
                       normalised here (trailing '?' stripped) and matched
                       case-insensitively.  The old .l/.n/.u keys are kept so every
                       comparison line below is literally unchanged.
     #layerTable tr -> table.tb, the same seven columns in the same order
                       (material, d, lambda, R, Sd, theta, p_sat), so cells 3,4,5,6
                       are read exactly as before.                                   */
async function readState(p) {
  return await p.evaluate(() => {
    const kv = {};
    const host = document.querySelector('.dgu-results') || document;
    host.querySelectorAll('.kv').forEach(r => {
      const k = r.querySelector('.k'), v = r.querySelector('.v');
      if (k && v) kv[k.innerText.trim()] = v.innerText.trim();
    });
    const norm = s => String(s || '').trim().replace(/\s*\?$/, '').trim();
    const tiles = [];
    document.querySelectorAll('.dgu-tile').forEach(t => {
      const l = t.querySelector('.dgu-tile-l'), n = t.querySelector('.dgu-tile-v');
      const us = [...t.querySelectorAll('.dgu-tile-u')].map(x => x.innerText.trim());
      if (!l || !n) return;
      tiles.push({ l: norm(l.innerText), n: n.innerText.trim(),
                   u: us.length ? us[us.length - 1] : '', units: us });
    });
    const rows = [];
    document.querySelectorAll('table.tb tr').forEach(tr => {
      const c = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      if (c.length) rows.push(c);
    });
    const rep = document.getElementById('report');
    return { kv, tiles, rows, report: rep ? rep.innerText : '',
             tile_labels: tiles.map(t => t.l), kv_keys: Object.keys(kv) };
  });
}

/* The tile labels the comparisons name, matched on the normalised label.  The
   deployed driver compared t.l === 'U' and t.l === 'fRsi' against the pre-port
   markup; the framework label is the same word, upper-cased in CSS only.         */
function tileOf(S, want, rx) {
  const hit = S.tiles.filter(t => rx ? rx.test(t.l) : t.l.toLowerCase() === want.toLowerCase());
  if (hit.length !== 1)
    throw new Error(`expected exactly one result tile for ${rx || want}, found ${hit.length}; `
      + `the page offers ${JSON.stringify(S.tile_labels)}`);
  return hit[0];
}

function cmpAdd(cmp, key, got, ref, tolKey) {
  const tol = TOL[tolKey || key] ?? 1e-6;
  const ok = Number.isFinite(got) && Number.isFinite(ref) && Math.abs(got - ref) <= tol + 1e-9;   /* 1e-9 absorbs the binary representation of an exact rounding tie */
  const rel = Number.isFinite(ref) && ref !== 0 ? Math.abs(got - ref) / Math.abs(ref) : Math.abs(got - ref);
  cmp[key] = { got, ref, abs: Math.abs(got - ref), tol, rel, ok };
  return ok;
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
/* RULE: the external climate service is off the measurement path.  Everything from
   the tree under test is served; everything else is refused at the browser, so no
   graded number can depend on a live answer (the service has been seen returning
   429).  --network lifts this, for a comparison run only.                        */
const SELF = new RegExp('^' + BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/');
await ctx.route('**/*', r => {
  const u = r.request().url();
  if (SELF.test(u) || /^(data|blob|about):/.test(u)) return r.continue();
  externalRequests.push(u);
  if (ALLOW_NET) return r.continue();
  blockedRequests.push(u);
  return r.abort();
});
const page = await ctx.newPage();
const pageErrors = [];
const netNoise = [];
page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
page.on('console', m => {
  const txt = m.text();
  consoleLog.push({ type: m.type(), text: txt });
  if (m.type() !== 'error') return;
  /* a refused external request raises a console error of the browser's, not of the
     page's: it is the harness's own blocking and is recorded apart from page_errors */
  if (!ALLOW_NET && /Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(txt)) {
    netNoise.push(txt); return;
  }
  pageErrors.push('console: ' + txt);
});

/* loadClimate() ends in applyDesignConditions(false), which rewrites ST.te and ST.rhe
   from whatever climate it settled on.  The project file must therefore be loaded
   AFTER that has happened, or the case's outdoor conditions are overwritten
   asynchronously.  CLIM.monthlyTe is null until analyseClimate has run, and the
   page's own serialized state carries it, so that is the signal waited on.  Measured
   without this wait: every case ran at theta_e = -17.2 degC and rh_e = 95 % (the
   offline fallback's design winter state for 50.85 N) instead of the case's -8 / 85. */
async function waitClimateSettled(label) {
  await page.waitForFunction(() => {
    if (!window.Diagram) return false;
    const s = window.Diagram.state.current();
    return !!(s && s.CLIM && s.CLIM.monthlyTe);
  }, null, { timeout: 90000 }).catch(() => {
    throw new Error(`${label}: the page's climate boot did not settle within 90 s, so a `
      + `project loaded now could still be overwritten by applyDesignConditions`);
  });
  await page.waitForTimeout(150);
}

/* RULE 3: assert, from the page's own state and its own calculation record, that the
   inputs are the case's, before a single output is read. */
let landedChecks = 0;
async function assertLanded(C) {
  const got = await page.evaluate(() => ({ st: window.Diagram.state.current(),
                                           rec: window.Diagram.record.build().inputs }));
  const ST = got.st.ST, rec = got.rec, want = C.project.ST, bad = [];
  const eq = (a, bb) => Number(a) === Number(bb);
  const pair = (name, have, recv, w) => {
    landedChecks += 2;
    if (!eq(have, w)) bad.push(`state.ST.${name} = ${JSON.stringify(have)}, case names ${w}`);
    if (recv !== undefined && !eq(recv, w)) bad.push(`record.${name} = ${JSON.stringify(recv)}, case names ${w}`);
  };
  pair('ti', ST.ti, rec.theta_i, want.ti);
  pair('rhi', ST.rhi, rec.rh_i, want.rhi);
  pair('te', ST.te, rec.theta_e, want.te);
  pair('rhe', ST.rhe, rec.rh_e, want.rhe);
  /* the state stores the humidity class as the 0-based index of the ISO 13788 clause
     4.2 list and the record publishes the class NUMBER:
     `humidity_class: (ST.humidityClass != null ? ST.humidityClass : 2) + 1`
     (wallthermalcalculator.html, dgcRecord).  The corpus speaks the state's language,
     so the state is compared to the case and the record to the state plus the page's
     own offset.  This is a read-format fix on the locator side; no expectation moved. */
  pair('humidityClass', ST.humidityClass, undefined, want.humidityClass);
  landedChecks += 1;
  if (Number(rec.humidity_class) !== Number(ST.humidityClass) + 1)
    bad.push(`record.humidity_class = ${rec.humidity_class}, while state.ST.humidityClass `
      + `= ${ST.humidityClass} and the page publishes the class as the index plus one`);
  landedChecks += 2;
  if (ST.type !== want.type) bad.push(`state.ST.type = ${ST.type}, case names ${want.type}`);
  if (rec.element_type !== want.type) bad.push(`record.element_type = ${rec.element_type}, case names ${want.type}`);
  landedChecks += 1;
  if (ST.mode !== want.mode) bad.push(`state.ST.mode = ${ST.mode}, case names ${want.mode}`);
  /* the layer stack, layer by layer, in the page's own state and in the record */
  const recLayers = JSON.parse(rec.layers_json || '[]');
  landedChecks += 2;
  if (ST.layers.length !== want.layers.length)
    bad.push(`state holds ${ST.layers.length} layers, case names ${want.layers.length}`);
  if (recLayers.length !== want.layers.length)
    bad.push(`record holds ${recLayers.length} layers, case names ${want.layers.length}`);
  if (ST.layers.length === want.layers.length) want.layers.forEach((L, i) => {
    const h = ST.layers[i], r = recLayers[i];
    landedChecks += 2;
    if (!eq(h.d, L.d)) bad.push(`state.ST.layers[${i}].d = ${h.d} mm, case names ${L.d} mm`);
    if (r && !eq(r.d, L.d)) bad.push(`record.layers[${i}].d = ${r.d} mm, case names ${L.d} mm`);
    if (L.matId !== undefined) { landedChecks += 1;
      if (h.matId !== L.matId) bad.push(`state.ST.layers[${i}].matId = ${h.matId}, case names ${L.matId}`); }
    if (L.lamOverride !== undefined && L.lamOverride !== null) { landedChecks += 2;
      if (!eq(h.lamOverride, L.lamOverride)) bad.push(`state.ST.layers[${i}].lamOverride = ${h.lamOverride}, case names ${L.lamOverride}`);
      if (r && !eq(r.lam, L.lamOverride)) bad.push(`record.layers[${i}].lam = ${r.lam}, case names ${L.lamOverride}`); }
    if (L.muOverride !== undefined && L.muOverride !== null) { landedChecks += 2;
      if (!eq(h.muOverride, L.muOverride)) bad.push(`state.ST.layers[${i}].muOverride = ${h.muOverride}, case names ${L.muOverride}`);
      if (r && !eq(r.mu, L.muOverride)) bad.push(`record.layers[${i}].mu = ${r.mu}, case names ${L.muOverride}`); }
  });
  landedChecks += 1;
  const wantBridges = want.bridges || [];
  if (JSON.parse(rec.bridges_json || '[]').length !== wantBridges.length)
    bad.push(`record holds ${JSON.parse(rec.bridges_json || '[]').length} bridges, case names ${wantBridges.length}`);
  if (want.rsi !== null && want.rsi !== undefined) pair('rsi', ST.rsi, rec.R_si, want.rsi);
  if (want.rse !== null && want.rse !== undefined) pair('rse', ST.rse, rec.R_se, want.rse);
  /* the monthly climate the annual balance reads, when the case carries one */
  if (C.project.CLIM && C.project.CLIM.monthlyTe) {
    landedChecks += 1;
    const have = got.st.CLIM && got.st.CLIM.monthlyTe;
    const w = C.project.CLIM.monthlyTe;
    const ok = Array.isArray(have) && have.length === w.length
      && have.every((v, i) => Math.abs(v - w[i]) < 1e-12);
    if (!ok) bad.push(`state.CLIM.monthlyTe = ${JSON.stringify(have)}, case names ${JSON.stringify(w)}`);
  }
  if (bad.length)
    throw new Error(`case ${C.id}: the page is not holding the case's inputs -- `
      + `${bad.length} mismatches:\n  ` + bad.join('\n  '));
  return { ok: true, checks: landedChecks };
}

/* The project is loaded through the page's own file input and must actually arrive:
   the handler is asynchronous (FileReader) and silently restores its snapshot on a
   malformed file, so the arrival is waited on, not slept through. */
async function loadProject(C) {
  await page.waitForSelector('#fileIn', { state: 'attached', timeout: 30000 });
  await page.setInputFiles('#fileIn', {
    name: 'case.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(C.project))
  });
  const want = C.project.ST;
  await page.waitForFunction((w) => {
    if (!window.Diagram) return false;
    const s = window.Diagram.state.current();
    if (!s || !s.ST) return false;
    const r = window.Diagram.record.build();
    return s.ST.layers.length === w.n && Number(s.ST.te) === Number(w.te)
      && Number(s.ST.ti) === Number(w.ti) && Number(s.ST.rhe) === Number(w.rhe)
      && !!r && Number(r.inputs.theta_e) === Number(w.te)
      && JSON.parse(r.inputs.layers_json || '[]').length === w.n;
  }, { n: want.layers.length, te: want.te, ti: want.ti, rhe: want.rhe },
     { timeout: 30000 }).catch(async () => {
    const now = await page.evaluate(() => {
      const s = window.Diagram.state.current(), r = window.Diagram.record.build();
      return { te: s.ST.te, ti: s.ST.ti, rhe: s.ST.rhe, nlayers: s.ST.layers.length,
               rec_te: r && r.inputs.theta_e };
    });
    throw new Error(`case ${C.id}: the project file did not take effect within 30 s. `
      + `The page holds theta_e=${now.te}, theta_i=${now.ti}, rh_e=${now.rhe}, `
      + `${now.nlayers} layers, record theta_e=${now.rec_te}; the case names `
      + `theta_e=${want.te}, theta_i=${want.ti}, rh_e=${want.rhe}, ${want.layers.length} layers.`);
  });
  await page.waitForTimeout(120);
}

/* the build this run graded, out of the document the browser loaded. Every case reloads
   the same page, so the revision is observed once, on the first load. */
await page.goto(URL0);
await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null,
  null, { timeout: 60000 });
const BUILD = await readPageManifestRevision(page);

const cases = [];
for (const C of REF.cases) {
  const extBefore = externalRequests.length;
  await page.goto(URL0);
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null,
    null, { timeout: 60000 });
  await waitClimateSettled(C.id);
  await loadProject(C);
  const inputs_verified = await assertLanded(C);
  const S = await readState(page);
  const e = C.expect, cmp = {};
  let pass = true;

  const kvGet = frag => {
    const k = Object.keys(S.kv).find(x => x.toLowerCase().startsWith(frag.toLowerCase()));
    return k === undefined ? null : S.kv[k];
  };
  pass &= cmpAdd(cmp, 'R_T', num(kvGet('Total thermal resistance')), e.R_T);
  pass &= cmpAdd(cmp, 'U', num(kvGet('Thermal transmittance')), e.U);
  if (e.Uc !== e.U) {
    const t = tileOf(S, 'U');
    pass &= cmpAdd(cmp, 'Uc', num(t && t.n), e.Uc);
  }
  const fr = tileOf(S, 'fRsi');
  pass &= cmpAdd(cmp, 'fRsi', num(fr && fr.n), e.fRsi);
  pass &= cmpAdd(cmp, 'thSi', num(kvGet('Inner surface temperature')), e.thSi);
  pass &= cmpAdd(cmp, 'tdew', num(kvGet('Dew point temperature')), e.tdew);
  pass &= cmpAdd(cmp, 'totalD', num(kvGet('Total thickness')), e.totalD);
  pass &= cmpAdd(cmp, 'mass', num(kvGet('Mass')), e.mass);

  if (e.Rupper !== undefined) {
    const v = kvGet('R′ / R″') ?? S.kv["R′ / R″"];
    const parts = String(v).split('/');
    pass &= cmpAdd(cmp, 'Rupper', num(parts[0]), e.Rupper);
    pass &= cmpAdd(cmp, 'Rlower', num(parts[1]), e.Rlower);
  }
  /* layer table: row 0 = Rsi, rows 1..n = layers, last = Rse */
  const body = S.rows;
  for (let i = 0; i < e.theta.length; i++) {
    pass &= cmpAdd(cmp, 'theta[' + i + ']', num(body[i] && body[i][5]), e.theta[i], 'theta');
    pass &= cmpAdd(cmp, 'psat[' + i + ']', num(body[i] && body[i][6]), e.psat[i], 'psat');
  }
  for (let i = 0; i < e.layerR.length; i++) {
    pass &= cmpAdd(cmp, 'R[' + i + ']', num(body[i + 1] && body[i + 1][3]), e.layerR[i], 'layerR');
    pass &= cmpAdd(cmp, 'Sd[' + i + ']', num(body[i + 1] && body[i + 1][4]), e.layerSd[i], 'layerSd');
  }
  /* boundary rows */
  pass &= cmpAdd(cmp, 'theta_e', num(body[body.length - 1] && body[body.length - 1][5]), e.theta_e, 'theta');

  /* condensation */
  const ct = tileOf(S, null, /condensation/i);
  const gotCond = ct && /^yes$/i.test(ct.n);
  cmp.condensing = { got: !!gotCond, ref: e.condensing, ok: !!gotCond === e.condensing };
  pass &= cmp.condensing.ok;
  if (e.condensing && gotCond) pass &= cmpAdd(cmp, 'gc_day', num(ct.u), e.gc_day);

  /* dew point position */
  const dp = kvGet('Dew point position') || '';
  if (e.dew_where === 'inside') {
    cmp.dew_where = { got: 'inside', ref: 'inside', ok: /mm/.test(dp) };
    pass &= cmp.dew_where.ok;
    pass &= cmpAdd(cmp, 'dew_mm', num(dp), e.dew_mm);
  } else {
    cmp.dew_where = { got: dp, ref: e.dew_where, ok: true };
  }

  /* dynamic */
  if (e.kappaIn !== undefined) {
    pass &= cmpAdd(cmp, 'kappaIn', num(kvGet('Internal heat capacity')), e.kappaIn);
    pass &= cmpAdd(cmp, 'decrement', num(kvGet('Decrement factor')), e.decrement);
    pass &= cmpAdd(cmp, 'shift', num(kvGet('Time shift')), e.shift);
  }

  /* annual moisture balance: shown on the report tab */
  if (e.annual_peak !== undefined) {
    /* nav.tabs is not in the page; the framework renders .dgu-tabs/.dgu-tab, and the
       report panel's stage is empty text until its tab is selected. */
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.dgu-tab')].map(b => b.innerText.trim()));
    const idx = tabs.findIndex(x => /^report$/i.test(x));
    if (idx < 0) throw new Error(`case ${C.id}: no Report tab; the page offers ${JSON.stringify(tabs)}`);
    await page.evaluate(i => document.querySelectorAll('.dgu-tab')[i].click(), idx);
    await page.waitForFunction(() => {
      const r = document.getElementById('report');
      return r && r.querySelectorAll('.kv').length > 0;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(150);
    const rep = await page.$eval('#report', el => {
      const o = {};
      el.querySelectorAll('.kv').forEach(r => {
        o[r.querySelector('.k').innerText.trim()] = r.querySelector('.v').innerText.trim();
      });
      return o;
    });
    const k = Object.keys(rep).find(x => /condensation rate|condensate|amount/i.test(x));
    pass &= cmpAdd(cmp, 'annual_peak', num(k ? rep[k] : null), e.annual_peak);
    cmp.annual_report_line = { got: k ? rep[k] : null, ref: 'peak accumulation, g/m2', ok: true };
  }

  const worst = Math.max(...Object.values(cmp).filter(c => Number.isFinite(c.rel)).map(c => c.rel));
  const extUsed = externalRequests.slice(extBefore);
  cases.push({ id: C.id, note: C.note, inputs: { project: C.project.ST.layers.length + ' layers', type: C.project.ST.type, ti: C.project.ST.ti, te: C.project.ST.te, rhi: C.project.ST.rhi, rhe: C.project.ST.rhe }, cmp, worst_rel: worst, pass: !!pass && inputs_verified.ok,
    inputs_verified,
    network: { external_requests_attempted: extUsed.length,
               external_requests_served: ALLOW_NET ? extUsed.length : 0,
               hosts: [...new Set(extUsed.map(u => { try { return new URL(u).host; } catch (x) { return u; } }))],
               climate_source: C.project.CLIM ? 'the project file (CLIM block)'
                 : 'not used by any graded quantity in this case',
               note: ALLOW_NET
                 ? 'the external climate service was reachable during this run'
                 : 'every external host was refused at the browser; no graded value depended on a live answer' } });
}
/* RULE 3, second half: a positive control.  Perturb one input by a visible amount and
   confirm the compared outputs move.  Ungraded; written to the control file. */
const control = {};
{
  const C0 = JSON.parse(JSON.stringify(REF.cases[0]));
  await page.goto(URL0);
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });
  await waitClimateSettled('control');
  await loadProject(C0);
  await assertLanded(C0);
  const a = await readState(page);
  const pick = S => ({
    R_T: num(Object.entries(S.kv).find(([k]) => /^Total thermal resistance/i.test(k))?.[1]),
    U: num(Object.entries(S.kv).find(([k]) => /^Thermal transmittance/i.test(k))?.[1]),
    fRsi: num(tileOf(S, 'fRsi').n),
    theta_si: num(Object.entries(S.kv).find(([k]) => /^Inner surface temperature/i.test(k))?.[1]),
    total_thickness: num(Object.entries(S.kv).find(([k]) => /^Total thickness/i.test(k))?.[1]),
    mass: num(Object.entries(S.kv).find(([k]) => /^Mass/i.test(k))?.[1])
  });
  const A = pick(a);
  /* 100 mm of mineral wool added to the stack: R must rise and U must fall */
  const C1 = JSON.parse(JSON.stringify(REF.cases[0]));
  C1.id = 'control/+100mm-insulation';
  C1.project.ST.layers = C1.project.ST.layers.concat(
    [{ matId: C1.project.ST.layers[1].matId, d: 100,
       lamOverride: 0.035, muOverride: 1 }]);
  await page.goto(URL0);
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });
  await waitClimateSettled('control2');
  await loadProject(C1);
  await assertLanded(C1);
  const Bv = pick(await readState(page));
  control.perturbation = { change: 'one 100 mm layer at lambda 0.035 W/(m.K) appended to the stack',
    layers_before: REF.cases[0].project.ST.layers.length, layers_after: C1.project.ST.layers.length };
  control.before = A; control.after = Bv;
  control.outputs_moved = ['R_T', 'U', 'fRsi', 'theta_si', 'total_thickness', 'mass']
    .every(k => A[k] !== Bv[k]);
  control.R_rose = Bv.R_T > A.R_T;
  control.U_fell = Bv.U < A.U;
  /* second axis: the outdoor design temperature */
  const C2 = JSON.parse(JSON.stringify(REF.cases[0]));
  C2.id = 'control/te-20';
  C2.project.ST.te = -20;
  await page.goto(URL0);
  await page.waitForFunction(() => window.Diagram && window.Diagram.record.build() !== null, null, { timeout: 60000 });
  await waitClimateSettled('control3');
  await loadProject(C2);
  await assertLanded(C2);
  const Cv = pick(await readState(page));
  control.perturbation2 = { field: 'ST.te', from: REF.cases[0].project.ST.te, to: -20 };
  control.after2 = Cv;
  control.outputs_moved2 = (Cv.theta_si !== A.theta_si) && (Cv.R_T === A.R_T);
  control.inputs_landed_checks = landedChecks;
}

await b.close();

const run_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const passed = cases.filter(c => c.pass).length;
const res = {
  tool: 'wallthermalcalculator', file: 'wallthermalcalculator.html',
  run_at,
  reference: 'Independent python implementation of EN ISO 6946:2017 (R, U, Table 7 surface '
    + 'resistances, Table D.1 air layers, 6.7 combined method, 6.9.4 ventilated cavities), '
    + 'EN ISO 13788:2012 (Annex E saturation vapour pressure, clause 6 Glaser construction and '
    + 'annual balance, clause 4.2 humidity classes) and EN ISO 13786:2017 Annex A (dynamic '
    + 'response), plus two published worked U-value examples.',
  reference_citations: [
    'EN ISO 6946:2017, Table 7 (surface resistances), Table D.1 (unventilated air layers), '
    + '6.6, 6.7, 6.9.4',
    'EN ISO 13788:2012, clause 4.2, clause 6, Annex E (E.1, E.2, E.3)',
    'EN ISO 13786:2017, Annex A (heat transfer matrix, periodic thermal transmittance, '
    + 'areal heat capacity, time shift)',
    'u-value.com, "How to calculate U-values: the ISO 6946 method with worked examples", '
    + 'Examples 1 and 2 (accessed 2026-08-11)',
    'CoolProp 8.0.0 IAPWS-95 saturation pressure, used only as a cross-check of the '
    + 'ISO 13788 Annex E correlation (see crosscheck)'
  ],
  tolerance: 'display-limited: every quantity is compared to half of the last digit the tool '
    + 'prints (U, R, fRsi, layer R: 5e-4; interface temperatures: 0.05 K; psat: 1 Pa; '
    + 'condensation rate: 0.05 g/(m2 d); annual accumulation: 0.5 g/m2)',
  crosscheck: REF.crosscheck || null,
  total: cases.length, passed, failed: cases.length - passed,
  page_errors: pageErrors, cases
};
fs.writeFileSync(OUT, JSON.stringify(stampProvenance(res, { build: BUILD, ...PROVENANCE }), null, 1));
fs.writeFileSync(OUT2, JSON.stringify({
  tool: 'wallthermalcalculator', run_at, base: BASE, tool_path: P.pageFile,
  network_allowed: ALLOW_NET,
  external_requests_attempted: [...new Set(externalRequests)],
  external_requests_blocked: [...new Set(blockedRequests)],
  browser_network_console_noise: [...new Set(netNoise)],
  positive_control: control, page_errors: pageErrors, console: consoleLog
}, null, 1));
console.log(`${passed}/${cases.length} passed; page errors: ${pageErrors.length}; `
  + `console ${consoleLog.length} (${netNoise.length} of them the browser refusing a blocked host)`);
console.log(`network: ${ALLOW_NET ? 'ALLOWED' : 'blocked'}; `
  + `${[...new Set(externalRequests)].length} distinct external URLs attempted by the page, `
  + `${[...new Set(blockedRequests)].length} refused`);
console.log(`inputs asserted: ${landedChecks} field reads, all exact`);
console.log(`positive control: ${control.perturbation.change}; moved=${control.outputs_moved}, `
  + `R rose=${control.R_rose}, U fell=${control.U_fell}`);
console.log(`  R_T ${control.before.R_T} -> ${control.after.R_T} m2K/W; `
  + `U ${control.before.U} -> ${control.after.U} W/(m2K); `
  + `fRsi ${control.before.fRsi} -> ${control.after.fRsi}; `
  + `theta_si ${control.before.theta_si} -> ${control.after.theta_si} degC`);
console.log(`positive control 2: ST.te ${control.perturbation2.from} -> ${control.perturbation2.to} degC; `
  + `theta_si ${control.before.theta_si} -> ${control.after2.theta_si} degC, R_T unchanged=${control.after2.R_T === control.before.R_T}`);
for (const c of cases) if (!c.pass) {
  const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok)
    .map(([k, v]) => `${k}: got ${v.got} ref ${typeof v.ref === 'number' ? v.ref.toPrecision(6) : v.ref}`);
  console.log(' FAIL ' + c.id + '\n   ' + bad.join('\n   '));
}
process.exit((passed === cases.length && pageErrors.length === 0
  && control.outputs_moved && control.outputs_moved2) ? 0 : 1);
