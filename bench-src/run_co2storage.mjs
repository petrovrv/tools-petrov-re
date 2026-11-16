import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'reference values generated offline by bench-src/ref/gen_co2storage.py (CoolProp HEOS); not field or published measurements' };
const P = benchPaths({ name: 'co2storage', page: 'co2storage.html', ref: 'co2storage_ref.json' });
const TOL = { WHP_bar: { abs: 0.5 }, dp_hyd_bar: { rel: 5e-3 }, dp_fric_bar: { rel: 0.03 } };

const TOL_SOLVE = {
  N: { abs: 0 }, Ntot: { abs: 0 }, WHP_bar: { abs: 0.5 }, BHP_bar: { rel: 2e-3 }, M50_Mt: { rel: 2e-3 },
  J: { rel: 2e-3 }, q_res: { rel: 2e-3 }, LCOS: { rel: 2e-3 }, capex_MEUR: { rel: 1e-6 },
  BHP_max_bar: { rel: 1e-6 }, p_res_bar: { rel: 1e-6 }, T_res_K: { rel: 1e-6 },
};

async function evalSolve(p, inputs) {
  try {
    return await p.evaluate(inp => {
      try {
        const copy = typeof structuredClone === 'function' ? structuredClone(inp) : JSON.parse(JSON.stringify(inp));
        const r = window.CCUS.storage.solve(copy);
        if (!r || !r.ok) return { status: 'error', error: String(r?.error ?? 'solve returned !ok') };
        const inj = r.injectivity, res = r.reservoir;
        return {
          status: r.wellbore.status, error: undefined,
          N: inj.N, Ntot: inj.N + inj.spare,
          BHP_bar: inj.BHP_req / 1e5, WHP_bar: r.wellbore.WHP / 1e5,
          M50_Mt: r.capacity.M50 / 1e9, J: inj.J, q_res: inj.q_res,
          LCOS: r.cost.lcos, capex_MEUR: r.cost.capex / 1e6,
          BHP_max_bar: res.BHP_max / 1e5, p_res_bar: res.p_res / 1e5, T_res_K: res.T_res,
        };
      } catch (e) { return { status: 'error', error: String(e?.stack ?? e) }; }
    }, inputs);
  } catch (e) { return { status: 'error', error: String(e?.message ?? e) }; }
}

const raw = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const cases = Array.isArray(raw) ? raw : raw.cases;

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(P.pageUrl + '?lang=en', { waitUntil: 'load' });
await p.waitForTimeout(800);
const BUILD = await readPageManifestRevision(p);

const results = [];
let total = 0, passed = 0, failed = 0, skipped = 0;
for (const c of cases) {
  if (c.skipped || !c.ref) { skipped++; results.push({ id: c.id, skipped: true }); continue; }
  total++;
  const k = c.inputs ?? c;
  const isSolve = c.kind === 'solve';
  const got = isSolve ? await evalSolve(p, c.inputs) : await p.evaluate(k => {
    try {
      const c = window.CCUS.core, m = window.CCUS.storage;
      const s = { depth: k.depth_m, ID: k.ID_m, eps: 4.5e-5, thermal: 'linear', T_wh: k.T_wh_C + 273.15, nSteps: 100, p_arrival: null };
      const res = { T_res: k.T_res_C + 273.15 };
      const inj = { q_well: k.q_kg_s, BHP_req: k.BHP_bar * 1e5 };
      const r = m._internal.wellbore(s, c, res, inj, []);
      return { WHP_bar: r.WHP / 1e5, dp_hyd_bar: r.dp_hyd / 1e5, dp_fric_bar: r.dp_fric / 1e5, status: r.status };
    } catch (e) { return { error: String(e) }; }
  }, k);
  const tol = isSolve ? TOL_SOLVE : TOL;
  const checks = {};
  let ok = !got.error && (isSolve ? got.status !== 'error' : got.status === 'ok');
  for (const [key, t] of Object.entries(tol)) {
    const g = got[key], r = c.ref[key];
    if (typeof r !== 'number') continue;
    const err = typeof g !== 'number' || !isFinite(g) ? Infinity
      : t.abs != null ? Math.abs(g - r) : Math.abs(g - r) / Math.max(Math.abs(r), 1e-12);
    const pass = err <= (t.abs ?? t.rel);
    checks[key] = { got: g, ref: r, err, tol: t, pass };
    if (!pass) ok = false;
  }
  ok ? passed++ : failed++;
  results.push({ id: c.id, kind: isSolve ? 'solve' : 'wellbore', inputs: k, got, checks, pass: ok });
}
await browser.close();

fs.writeFileSync(P.out, JSON.stringify(stampProvenance({ tool: 'co2storage', file: 'co2storage.html', reference: 'CoolProp HEOS CO2 tubing march RK4 N=2000 with Colebrook via bench-src/ref/gen_co2storage.py', reference_citations: ['Span R., Wagner W. (1996) J. Phys. Chem. Ref. Data 25:1509', 'Bell I.H. et al. (2014) CoolProp, Ind. Eng. Chem. Res. 53:2498', 'Colebrook C.F. (1939) J. ICE 11:133', 'API RP 14E (1991) erosional velocity', 'NORSOK P-001 (2006) gas velocity limit', 'Bachu S. et al. (2007) IJGGC 1:430 (CSLF storage capacity)'], tolerance: 'wellbore: WHP within 0.5 bar, hydrostatic term 0.5 %, friction 3 % (tool uses Swamee-Jain, 100 predictor-corrector steps); solve: well count N and N+spare exact, WHP 0.5 bar, BHP/P50 capacity/J/q_res/LCOS 0.2 %, capex and reservoir p/T/BHP_max 1e-6', scope: 'wellbore tubing pressure profile (24 cases) + full solve (12 cases: 6 presets + 6 variants): reservoir p/T, P50 capacity, Darcy injectivity, phase-dependent velocity well sizing, WHP, capex, LCOS vs independent CoolProp reference (b01 ref_solve)', total, passed, failed, skipped, page_errors: errs, cases: results }, { build: BUILD, ...PROVENANCE }), null, 1));

console.log(`co2storage [${BUILD}]: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped, ${errs.length} page errors -> ${P.out}`);
for (const r of results) if (!r.skipped && !r.pass) console.log(`FAIL ${r.id}: ${r.got.error ?? `status=${r.got.status} ` + Object.entries(r.checks).filter(([, v]) => !v.pass).map(([k, v]) => `${k} got=${v.got} ref=${v.ref} err=${v.err}`).join('; ')}`);
process.exitCode = 0;
