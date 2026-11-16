/* Benchmark driver for nuclideatlas.html ("Nuclide Atlas & Decay Laboratory").
 *
 * The tool declares nuclide-data.js and neutron-data/ as dependencies and NEITHER is
 * present in this tree, so the deployed page renders "nuclide-data.js is missing."
 * and nothing can be exercised.  This driver serves an overlay directory that
 * symlinks the site root and adds a RECONSTRUCTED ground-state fixture built from the
 * IAEA Live Chart API (nuclide-data.FIXTURE.js in the fixture directory).  The site root
 * is not modified and the deployed data file is not touched.
 *
 * Consequence, stated plainly in the artifact: this benchmark tests the tool's
 * mathematics (CRAM48 network evolution, one-step activation, equilibrium limits,
 * atom conservation, refusal behaviour), NOT the integrity of the deployed data file,
 * which cannot be seen from here.
 *
 * All page JS is inside an IIFE, so everything is driven through the DOM and read
 * back from the page's own CSV export, which carries full double precision.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import http from 'http'; import fsp from 'fs'; import path from 'path';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build is read out of
   the live page by readPageManifestRevision() and passed to stampProvenance(), which
   writes build, manifest_revision, reference_provenance, provenance_note and run_at and
   refuses to write anything without an observed build. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Reference values are derived by bench-src/ref/gen_nuclideatlas.py rather than transcribed, but that generator could not be re-run against this tree (its input fixture is not in this tree), so the corpus is not reproduced here and the artifact reuses it as stored."
};

/* Every path resolves relative to this driver's own tree: the site root defaults to the
   parent of bench-src, the reference directory to bench-src/ref, the fixture directory to
   bench-src/ref/fixtures and the artifact to <siteRoot>/benchmarks/nuclideatlas.json.
   --site, --ref-dir, --fixture-dir, --tmp-dir and --out override. The overlay is built in
   the scratch directory, which sits outside the site root, so it is never published. */
const P = benchPaths({ name: 'nuclideatlas', page: 'nuclideatlas.html',
  ref: 'nuclideatlas_ref.json', fixtures: 'nuclide-data.FIXTURE.js' });
const REF = JSON.parse(fsp.readFileSync(P.ref, 'utf8'));
const FIXTURE = P.fixtures['nuclide-data.FIXTURE.js'];
const OUT = P.out;
const OVERLAY = P.scratch('overlay');

const TOL = {
  chain: 1e-9,        // CRAM48 against an exact 60-digit Bateman solution
  conservation: 1e-12,
  activation: 2e-4,   // the page prints 5 significant digits
  ratio: 1e-6,
};
const GRADE_FLOOR = 1e-12;   // species below this fraction of the total atom count are
                             // not graded relatively: the reference is exact but the
                             // tool's float64 CRAM48 carries only absolute accuracy there

const cases = [];
const rel = (g, r) => (r === 0 ? (g === 0 ? 0 : Infinity) : Math.abs(g - r)/Math.abs(r));
function add(id, note, inputs, cmp, extra) {
  let worst = 0, pass = true, flagged = false;
  for (const k in cmp) {
    const c = cmp[k];
    if (c.rel === undefined) c.rel = rel(c.got, c.ref);
    if (c.graded === false) { flagged = true; c.ok = null; continue; }
    c.ok = c.rel <= c.tol;
    if (c.rel > worst) worst = c.rel;
    if (!c.ok) pass = false;
  }
  cases.push(Object.assign({ id, note, inputs, cmp, worst_rel: worst, pass,
    flagged: flagged && pass }, extra || {}));
}

/* ---- build the overlay: symlinks to the site root plus the fixture ---- */
fsp.rmSync(OVERLAY, { recursive: true, force: true });
fsp.mkdirSync(OVERLAY, { recursive: true });
for (const f of fsp.readdirSync(P.siteRoot))
  fsp.symlinkSync(path.join(P.siteRoot, f), path.join(OVERLAY, f));
fsp.copyFileSync(FIXTURE, path.join(OVERLAY, 'nuclide-data.js'));

/* ---- overlay web server ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(OVERLAY, u === '/' ? '/index.html' : u);
  fsp.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const page_errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
page.on('pageerror', e => page_errors.push(String(e)));
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error' && !/neutron-data|404/.test(t)) page_errors.push('console.error: ' + t);
});
await page.goto(`http://127.0.0.1:${PORT}/${P.pageFile}?lang=en`);
await page.waitForTimeout(2500);
/* The build this artifact names is the manifest_revision of the document the browser
   loaded - the overlay's page, which is a symlink to the site root's copy, so the stamp's
   cross-check against the site root reads the same page. Only nuclide-data.js is replaced
   in the overlay; the page itself is not, so no siteRoot override is passed to the stamp. */
const BUILD = await readPageManifestRevision(page);

/* the page must actually have come up with the fixture */
{
  const up = await page.evaluate(() => ({
    missing: /nuclide-data\.js is missing/.test(document.body.innerText),
    tabs: [...document.querySelectorAll('[data-tab]')].length,
    canvas: !!document.querySelector('canvas')
  }));
  add('FIXTURE-LOADS',
    'The deployed nuclide-data.js is absent from this tree; the driver serves a fixture '
    + 'rebuilt from the IAEA Live Chart ground-state snapshot instead. This case records '
    + 'that the page comes up at all, which is the precondition for every other case.',
    { data_file: 'bench/fixtures/nuclide-data.FIXTURE.js' },
    { page_reports_missing_data: { got: up.missing ? 1 : 0, ref: 0, rel: up.missing ? 1 : 0, tol: 1e-12 },
      tabs_present: { got: up.tabs, ref: 8, rel: up.tabs === 8 ? 0 : 1, tol: 1e-12 } });
}

/* ---------------- helper: run one inventory case and read the CSV ------- */
async function solveInventory(rootKey, atoms, srcKey, rate, tEnd) {
  await page.evaluate(() => document.querySelector('[data-tab="inventory"]').click());
  await page.evaluate(({ rootKey, atoms }) => {
    const rows = [...document.querySelectorAll('#inv-rows tr')];
    rows.slice(1).forEach(r => r.remove());
    const r = rows[0];
    r.querySelector('.inv-key').value = rootKey;
    r.querySelector('.inv-amt').value = String(atoms);
    r.querySelector('.inv-unit').value = 'atoms';
    document.querySelector('#src-rows').innerHTML = '';
  }, { rootKey, atoms });
  if (srcKey) {
    await page.fill('#search', srcKey);
    await page.evaluate(() => document.querySelector('#search')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await page.waitForTimeout(120);
    await page.click('#src-add-selected');
    await page.evaluate(({ srcKey, rate }) => {
      const tr = [...document.querySelectorAll('#src-rows tr')].pop();
      tr.querySelector('.src-key').value = srcKey;
      tr.querySelector('.src-rate').value = String(rate);
    }, { srcKey, rate });
  }
  await page.fill('#inv-time', String(tEnd));
  await page.selectOption('#inv-time-unit', 's');
  await page.click('#solve-inventory');
  await page.waitForTimeout(250);
  const status = await page.textContent('#inv-status');
  if (!/^Solved/.test(status || '')) return { status, rows: null };
  const dl = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#export-csv');
  const d = await dl;
  const txt = fsp.readFileSync(await d.path(), 'utf8').trim().split('\n');
  const head = txt[0].split(',');
  const last = txt[txt.length - 1].split(',').map(Number);
  const map = {};
  head.forEach((h, i) => { map[h] = last[i]; });
  return { status, map, t: last[0] };
}

/* ---------------- 1. decay networks against exact Bateman -------------- */
for (const ch of REF.chains) {
  const rootKey = Object.keys(ch.N0.reduce((o, v, i) => (v ? (o[ch.keys[i]] = v, o) : o), {}))[0]
    || ch.keys[ch.S.findIndex(x => x > 0)];
  const atoms = ch.N0.find(x => x > 0) || 0;
  const si = ch.S.findIndex(x => x > 0);
  const srcKey = si >= 0 ? ch.keys[si] : null, rate = si >= 0 ? ch.S[si] : 0;
  const initKey = ch.N0.findIndex(x => x > 0) >= 0 ? ch.keys[ch.N0.findIndex(x => x > 0)] : rootKey;
  for (const pt of ch.points) {
    const r = await solveInventory(initKey, atoms, srcKey, rate, pt.t_s);
    if (!r.map) {
      add('CHAIN-' + ch.id + '-t' + pt.t_s, 'Inventory solve refused: ' + r.status,
        { chain: ch.id, t_s: pt.t_s },
        { solved: { got: 0, ref: 1, rel: 1, tol: 1e-12 } }, { status: r.status });
      continue;
    }
    const total = pt.N.reduce((a, b) => a + b, 0);
    const cmp = {};
    ch.keys.forEach((k, i) => {
      const ref = pt.N[i];
      const got = r.map[k + '_atoms'];
      const graded = ref > GRADE_FLOOR * total;
      cmp['N_' + k] = { got, ref, tol: TOL.chain, graded };
    });
    cmp.time_point_s = { got: r.t, ref: pt.t_s, tol: 1e-12 };
    add('CHAIN-' + ch.id + '-t' + pt.t_s,
      'CRAM48 evolution of the ' + ch.keys.length + '-nuclide network reached from '
      + ch.keys[0] + ' (' + ch.keys.join(' -> ') + ') at ' + pt.t_s + ' s'
      + (srcKey ? ', with a constant source of ' + rate + ' atoms/s of ' + srcKey : '')
      + '.  Reference: generalised Bateman path-sum in 60-digit arithmetic, cross-checked '
      + 'against mpmath.expm of the same generator (mutual deviation '
      + (pt.crosscheck_rel == null ? 'n/a, source case solved by expm only'
        : pt.crosscheck_rel.toExponential(2)) + ').  Half-lives and branching ratios are the '
      + 'IAEA Live Chart values in the fixture, quoted in the case inputs.',
      { chain: ch.id, initial_atoms: atoms, initial_nuclide: initKey,
        source_nuclide: srcKey, source_atoms_per_s: rate, t_s: pt.t_s,
        half_lives_s: ch.half_lives_s, branches: ch.branches },
      cmp,
      { crosscheck_rel: pt.crosscheck_rel, solver_status: r.status,
        species_below_grading_floor: ch.keys.filter((k, i) => !(pt.N[i] > GRADE_FLOOR * total)) });

    /* atom conservation for closed networks */
    if (ch.conserved) {
      let sum = 0;
      ch.keys.forEach(k => { sum += r.map[k + '_atoms']; });
      add('CONSERV-' + ch.id + '-t' + pt.t_s,
        'Atom conservation: every branch of every member of this network ends inside the '
        + 'network, so the sum of all species must stay at the initial atom count for ever. '
        + 'This is a property of the equations, not of the data, and it is what a silent '
        + 'truncation of a decay branch would break.',
        { chain: ch.id, t_s: pt.t_s, initial_atoms: atoms },
        { total_atoms: { got: sum, ref: atoms, tol: TOL.conservation } });
    }
  }
}

/* ---------------- 2. equilibrium limits --------------------------------- */
for (const eq of REF.equilibrium) {
  const ch = REF.chains.find(c => c.keys[0] === eq.parent && c.keys[1] === eq.daughter);
  if (!ch) continue;
  const tEnd = ch.points[ch.points.length - 1].t_s;
  const r = await solveInventory(eq.parent, ch.N0[0], null, 0, tEnd);
  if (!r.map) continue;
  const Ap = r.map[eq.parent + '_Bq'], Ad = r.map[eq.daughter + '_Bq'];
  const lp = Math.LN2 / eq.parent_half_life_s, ld = Math.LN2 / eq.daughter_half_life_s;
  /* exact ratio at this finite time, from the two-member Bateman solution */
  const exact = (ld / (ld - lp)) * (1 - Math.exp(-(ld - lp) * tEnd));
  add('EQUIL-' + eq.id,
    (eq.kind === 'secular' ? 'Secular' : 'Transient') + ' equilibrium of '
    + eq.parent + ' (T1/2 = ' + eq.parent_half_life_s + ' s) and ' + eq.daughter
    + ' (T1/2 = ' + eq.daughter_half_life_s + ' s).  The daughter-to-parent activity ratio '
    + 'must approach lambda_d/(lambda_d - lambda_p) = ' + eq.activity_ratio_limit.toFixed(6)
    + '; at t = ' + tEnd + ' s the exact two-member Bateman value is ' + exact.toFixed(9)
    + '.  Graded against the exact finite-time value, with the asymptotic limit recorded.',
    { parent: eq.parent, daughter: eq.daughter, t_s: tEnd,
      parent_half_life_s: eq.parent_half_life_s, daughter_half_life_s: eq.daughter_half_life_s },
    { activity_ratio: { got: Ad / Ap, ref: exact, tol: TOL.ratio } },
    { asymptotic_limit: eq.activity_ratio_limit, kind: eq.kind,
      parent_Bq: Ap, daughter_Bq: Ad });
}

/* ---------------- 3. one-step activation -------------------------------- */
await page.evaluate(() => document.querySelector('[data-tab="activation"]').click());
for (const a of REF.activation) {
  await page.fill('#act-target', a.target);
  await page.fill('#act-product', a.product);
  await page.fill('#act-mass', String(a.mass_g));
  await page.fill('#act-flux', String(a.flux));
  await page.fill('#act-sigma', String(a.sigma_b));
  await page.fill('#act-irr', String(a.irr_h));
  await page.fill('#act-cool', String(a.cool_d));
  await page.click('#solve-activation');
  await page.waitForTimeout(150);
  const o = await page.evaluate(() => ({
    eoi: document.querySelector('#act-atoms-eoi').textContent,
    aeoi: document.querySelector('#act-a-eoi').textContent,
    aeoc: document.querySelector('#act-a-eoc').textContent,
    status: document.querySelector('#act-status').textContent
  }));
  const num = s => parseFloat(String(s).replace(/[^0-9eE+.\-]/g, ''));
  add('ACTIVATION-' + a.id,
    'One-step neutron activation ' + a.target + '(n,g)' + a.product + ': ' + a.mass_g
    + ' g at ' + a.flux + ' n/cm2/s with sigma = ' + a.sigma_b + ' b for ' + a.irr_h
    + ' h, then ' + a.cool_d + ' d of cooling.  Reference: the closed-form solution of '
    + 'dN_t/dt = -(sigma phi + lambda_t) N_t and dN_p/dt = sigma phi N_t - lambda_p N_p, '
    + 'evaluated in 60-digit arithmetic, with N0 = m N_A / M from the same atomic mass '
    + '(' + a.target_atomic_mass_u + ' u) and product half-life ('
    + a.product_half_life_s + ' s) the page uses.',
    { target: a.target, product: a.product, mass_g: a.mass_g, flux: a.flux,
      sigma_b: a.sigma_b, irradiation_h: a.irr_h, cooling_d: a.cool_d,
      target_atomic_mass_u: a.target_atomic_mass_u,
      product_half_life_s: a.product_half_life_s },
    { atoms_at_end_of_irradiation: { got: num(o.eoi), ref: a.atoms_eoi, tol: TOL.activation },
      activity_at_end_of_irradiation_Bq: { got: num(o.aeoi), ref: a.activity_eoi_Bq, tol: TOL.activation },
      activity_after_cooling_Bq: { got: num(o.aeoc), ref: a.activity_eoc_Bq, tol: TOL.activation } },
    { status: o.status, N0_atoms: a.N0_atoms });
}

/* ---------------- 4. refusal behaviour ---------------------------------- */
{
  /* a network whose branching ratios are not qualified must be refused, not
     silently solved with atoms disappearing */
  const fx = JSON.parse(fsp.readFileSync(FIXTURE, 'utf8')
    .replace(/^[\s\S]*?window\.NUCLIDE_DATA=/, '').replace(/;\s*$/, ''));
  const bad = fx.records.find(r => r.decays.length > 1
    && r.decays.some(d => !d.branchQualified) && r.halfLifeSec > 1);
  if (bad) {
    const r = await solveInventory(bad.key, 1e18, null, 0, 1e6);
    add('REFUSE-UNQUALIFIED-BRANCH',
      'A nuclide whose exclusive branching ratios are not qualified in the library ('
      + bad.key + ': ' + bad.decays.map(d => d.mode + ' ' + (d.sourcePercent == null ? 'no %' : d.sourcePercent + ' %')).join(', ')
      + ') must make the tool refuse the time evolution rather than solve it with a '
      + 'silently truncated branch. This is graded because silent truncation is worse '
      + 'than a refusal.',
      { nuclide: bad.key },
      { refused: { got: r.map ? 0 : 1, ref: 1, rel: r.map ? 1 : 0, tol: 1e-12 } },
      { status: r.status });
  }
  /* a branch set that is grossly not exclusive must be refused, not solved */
  const gross = fx.records.find(r => r.decays.length > 1 && r.halfLifeSec > 0
    && r.decays.every(d => d.branchQualified)
    && Math.abs(r.decays.reduce((a, d) => a + (d.branch || 0), 0) - 1) > 0.2);
  if (gross) {
    const sum = gross.decays.reduce((a, d) => a + (d.branch || 0), 0);
    const r3 = await solveInventory(gross.key, 1e18, null, 0, 1e3);
    add('REFUSE-BRANCH-SUM',
      'Evaluated decay files list sub-channels at their own 100 % (' + gross.key + ': '
      + gross.decays.map(d => d.mode + ' ' + d.sourcePercent + ' %').join(', ')
      + ', summing to ' + sum.toFixed(3) + '). Used as exclusive branch fractions in the '
      + 'transition matrix that manufactures atoms out of nothing, so the tool must refuse '
      + 'the time evolution and say why.',
      { nuclide: gross.key, branch_sum: sum },
      { refused: { got: r3.map ? 0 : 1, ref: 1, rel: r3.map ? 1 : 0, tol: 1e-12 } },
      { status: r3.status });
  }
  /* a network whose branch sets are slightly off unity must be renormalised and said so */
  {
    const r4 = await solveInventory('Th-228', 1e18, null, 0, 6e8);
    const said = /renormalised to one/.test(r4.status || '');
    add('DISCLOSE-RENORMALISATION',
      'The Th-228 series contains branch sets that the evaluated data give as slightly more '
      + 'than 100 % (Ra-224: alpha 100 % + 14C 4e-9 %, Bi-210: B- 100 % + alpha 1.32e-4 %, '
      + 'Pb-210: B- 100 % + alpha 1.9e-6 %). Renormalising them to one is the only way to '
      + 'conserve atoms, and the tool must say that it did so instead of doing it silently.',
      { chain: 'Th-228 series', t_s: 6e8 },
      { status_mentions_renormalisation: { got: said ? 1 : 0, ref: 1, rel: said ? 0 : 1, tol: 1e-12 } },
      { status: r4.status });
  }
  /* a stable nuclide alone must not pretend to decay */
  const r2 = await solveInventory('Fe-56', 1e18, null, 0, 1e12);
  add('STABLE-NO-DECAY',
    'A stable nuclide must keep every atom for ever: Fe-56, 1e18 atoms, evolved for 1e12 s.',
    { nuclide: 'Fe-56', t_s: 1e12 },
    r2.map ? { atoms: { got: r2.map['Fe-56_atoms'], ref: 1e18, tol: 1e-12 } }
           : { solved: { got: 0, ref: 1, rel: 1, tol: 1e-12 } },
    { status: r2.status });
}

/* ---------------- 5. activity is lambda N ------------------------------- */
{
  const ch = REF.chains.find(c => c.id === 'th228');
  const pt = ch.points[3];
  const r = await solveInventory('Th-228', ch.N0[0], null, 0, pt.t_s);
  if (r.map) {
    const cmp = {};
    ch.keys.forEach((k, i) => {
      const hl = ch.half_lives_s[i];
      if (!hl || !(r.map[k + '_atoms'] > 0)) return;
      cmp['A_' + k] = { got: r.map[k + '_Bq'], ref: r.map[k + '_atoms'] * Math.LN2 / hl, tol: 1e-12 };
    });
    add('ACTIVITY-IDENTITY',
      'Every activity the tool exports must be exactly ln(2)/T_1/2 times the atom count it '
      + 'exports for the same nuclide and the same instant, using the half-life in the '
      + 'library. This is an internal identity and is graded to round-off.',
      { chain: 'th228', t_s: pt.t_s, half_lives_s: ch.half_lives_s }, cmp);
  }
}

await browser.close();
srv.close();

const passed = cases.filter(c => c.pass).length;
const result = {
  tool: 'nuclideatlas',
  file: 'nuclideatlas.html',
  reference: 'Generalised Bateman solution for branching decay networks, written as a sum over '
    + 'simple paths and evaluated in 60-digit arithmetic (mpmath), cross-checked against '
    + 'mpmath.expm of the same generator - two structurally different algorithms that agree to '
    + '5e-44. The one-step activation cases use the closed-form solution of the two-species '
    + 'constant-flux system with target burn-up, also in 60-digit arithmetic. Equilibrium cases '
    + 'use the exact finite-time two-member ratio and quote the asymptotic limit '
    + 'lambda_d/(lambda_d - lambda_p). Nuclear data are the IAEA Live Chart / ENSDF ground-state '
    + 'snapshot, quoted per case.',
  reference_citations: REF.citations,
  tolerance:
    '1e-9 relative on the network evolution: CRAM48 is a rational approximation to the matrix '
    + 'exponential whose published accuracy for burnup matrices is around 1e-14, the reference is '
    + 'exact to 60 digits and the tool exports full double precision, so anything looser would '
    + 'not be testing the solver. Species holding less than 1e-12 of the network\'s atoms are '
    + 'recorded but not graded relatively, because there the float64 solver carries absolute, '
    + 'not relative, accuracy. 1e-12 on atom conservation and on the activity = ln(2) N / T_1/2 '
    + 'identity, which are exact arithmetic. 2e-4 on the activation panel, which prints five '
    + 'significant digits. 1e-6 on the equilibrium activity ratio.',
  environment: 'Chromium (Playwright) against a local HTTP overlay of the site root with the '
    + 'reconstructed fixture nuclide-data.FIXTURE.js in place of the missing '
    + 'nuclide-data.js. Node ' + process.version + '.',
  data_file_caveat:
    'The deployed nuclide-data.js and neutron-data/ are NOT present in this tree. Everything '
    + 'below was measured against a ground-state fixture rebuilt from the IAEA Live Chart API '
    + '(same snapshot date, 2023-10-18, that the tool\'s manifest quotes), with no metastable, '
    + 'decay-gamma or fission-yield overlay. This benchmark therefore says nothing about the '
    + 'integrity, completeness or provenance of the data the deployed page actually loads; it '
    + 'tests the mathematics the page applies to whatever data it is given.',
  not_benchmarked: {
    deployed_data_file: 'nuclide-data.js is absent, so its record count, metastable overlay, '
      + 'decay-gamma overlay, evaluated fission yields, decay-energy model and QA counters could '
      + 'not be checked at all.',
    fendl_cross_sections: 'neutron-data/ is absent, so the FENDL-3.2c pointwise layer, the '
      + 'group-average calculator and the WASM cross-section kernel could not be exercised.',
    gamma_spectrum_and_dose: 'Both are driven entirely by overlays that live in the missing data '
      + 'file; with the fixture they have nothing to show, so grading them would be grading the '
      + 'fixture.',
    fission_yields: 'The bundled evaluated fission-yield sets live in the missing data file.',
    monte_carlo_uncertainty: 'The uncertainty propagation samples half-lives from their ENSDF '
      + 'uncertainties with a seeded RNG; its output is a distribution, and the fixture does not '
      + 'carry the same uncertainty set as the deployed file, so it is not graded here.',
    xenon_dynamics: 'The reactor Xe-135 panel duplicates the site\'s own xenon.html, which is '
      + 'benchmarked separately; it is out of scope for this pass.',
  },
  total: cases.length,
  passed,
  failed: cases.length - passed,
  flagged: cases.filter(c => c.flagged).length,
  page_errors,
  run_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  cases,
};
fsp.writeFileSync(OUT, JSON.stringify(stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1));
console.log('total %d  passed %d  failed %d  flagged %d  page_errors %d',
  result.total, result.passed, result.failed, result.flagged, page_errors.length);
for (const c of cases) if (!c.pass) {
  const bad = Object.entries(c.cmp).filter(([, v]) => v.ok === false)
    .map(([k, v]) => k + ' got=' + Number(v.got).toPrecision(8) + ' ref=' + Number(v.ref).toPrecision(8)
      + ' rel=' + v.rel.toExponential(2)).slice(0, 4).join('; ');
  console.log('FAIL %s  %s', c.id, bad);
}
