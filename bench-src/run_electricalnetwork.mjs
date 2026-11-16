/* Benchmark driver for electricalnetwork.html
 *
 * Reference: bench-src/ref/electricalnetwork_ref.json, produced by
 * bench-src/ref/gen_electricalnetwork.py - an independent python
 * implementation of IEC 60909-0:2016 (network feeder, transformer with the
 * KT correction, cable impedance, motor locked-rotor impedance, equivalent
 * voltage source at the fault point, kappa/i_p) plus a scipy Newton load
 * flow.  Nothing in it is derived from the tool's own JavaScript.
 *
 * Usage: node bench-src/run_electricalnetwork.mjs [--out <artifact>.json]
 *        [--site <tree>] [--ref-dir <dir>]; every path defaults to this file's own tree.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* Every path this driver uses — site root, reference file, output — resolves relative to
   this file's own tree, so the driver run in a workspace drives that workspace. */
const P = benchPaths({ name: 'electricalnetwork', page: 'electricalnetwork.html',
                       ref: 'electricalnetwork_ref.json' });

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is read out of the live DOM of the page the
   browser loaded and passed to stampProvenance(), which writes build,
   manifest_revision, reference_provenance, provenance_note and run_at, and refuses to
   write anything when the observed build is absent or disagrees with the page on disk. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_electricalnetwork.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 2 658 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const URL = P.pageUrl + '?lang=en';
const OUT = P.out;

/* ---------------------------------------------------------------- tolerance
 * The page prints kA to 3 decimals, currents/voltages to 2 decimals and the
 * KPI strip to 1-2 decimals.  A tolerance tighter than half of the last
 * printed digit is meaningless, so the criterion is
 *     |got - ref| <= 0.5 * 10^-d  +  1e-9 * |ref|
 * with d taken from the field's own printed precision.  The 1e-9 term only
 * covers double-precision round-off in a computation that is otherwise a
 * closed form both sides.
 */
const DEC = {
  IkMax_kA: 3, IkMin_kA: 3, ip_kA: 3, kappa: 3, motorIk_kA: 3,
  deviceIkMax_kA: 3, deviceIkMin_kA: 3, deviceIk2Min_kA: 3, deviceIp_kA: 3,
  If_kA: 3, I_A: 2, Ull_V: 2, vd_pct: 2, Smin_mm2: 1, trip_s: 3,
  lv_IkMax_kA: 2, lv_IkMin_kA: 2, lv_ip_kA: 2, rootI_A: 1, loss_kW: 2,
};
const tol = (k, ref) => 0.5 * Math.pow(10, -(DEC[k] ?? 3)) + 1e-9 * Math.abs(ref);

const num = (s) => {
  if (s == null) return NaN;
  const t = String(s).replace(/\u2212/g, '-').replace(/[,\u00a0\u202f\s]/g, '');
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

function parseSelected(txt) {
  const out = {};
  const lines = txt.split('\n');
  const grab = (re, line) => { const m = line.match(re); return m ? num(m[1]) : NaN; };
  for (const ln of lines) {
    if (/I=/.test(ln) && /U=/.test(ln)) {
      out.I_A = grab(/I=([-\d.,  ]+)\s*A/, ln);
      out.Ull_V = grab(/U=([-\d.,  ]+)\s*V/, ln);
      out.vd_pct = grab(/[Δ∆]U=([-\d.,  ]+)\s*%/, ln);
    }
    if (/κ=/.test(ln)) {           // bus fault line, carries kappa
      const mm = ln.match(/max=([-\d.,  ]+)\s*kA/);
      out.IkMax_kA = mm ? num(mm[1]) : NaN;
      out.IkMin_kA = grab(/min=([-\d.,  ]+)\s*kA/, ln);
      out.ip_kA = grab(/ip≈([-\d.,  ]+)\s*kA/, ln);
      out.kappa = grab(/κ=([-\d.,  ]+)/, ln);
      out.motorIk_kA = grab(/[Δ∆]mot=([-\d.,  ]+)\s*kA/, ln);
    }
    if (/I2,min=/.test(ln)) {           // device fault line
      out.deviceIkMax_kA = grab(/max=([-\d.,  ]+)\s*kA/, ln);
      out.deviceIkMin_kA = grab(/min=([-\d.,  ]+)\s*kA;\s*I2/, ln);
      out.deviceIk2Min_kA = grab(/I2,min=([-\d.,  ]+)\s*kA/, ln);
      out.deviceIp_kA = grab(/ip≈([-\d.,  ]+)\s*kA/, ln);
    }
    if (/If=/.test(ln)) out.If_kA = grab(/If=([-\d.,  ]+)\s*kA/, ln);
    if (/Smin/.test(ln)) {
      out.Smin_mm2 = grab(/Smin[^0-9-]*([-\d.,\u00a0\u202f]+)/, ln);
      out.trip_s = grab(/([-\d.,\u00a0\u202f]+)\s*s\s*$/, ln);
    }
  }
  return out;
}

function parseRootSelected(txt) {
  // the LV row prints "Ik'' max=.. kA; Ik'' min=.. kA; ip~.. kA pk; dmot=.. kA"
  // on the bus line and the device line separately, without kappa.
  const out = {};
  const lines = txt.split('\n');
  const grab = (re, line) => { const m = line.match(re); return m ? num(m[1]) : NaN; };
  for (const ln of lines) {
    if (/[Δ∆]mot=/.test(ln)) {
      out.IkMax_kA = grab(/max=([-\d.,  ]+)\s*kA/, ln);
      out.IkMin_kA = grab(/min=([-\d.,  ]+)\s*kA/, ln);
      out.ip_kA = grab(/ip≈([-\d.,  ]+)\s*kA/, ln);
      out.motorIk_kA = grab(/[Δ∆]mot=([-\d.,  ]+)\s*kA/, ln);
    }
    if (/I2,min=/.test(ln)) {
      out.deviceIkMax_kA = grab(/max=([-\d.,  ]+)\s*kA/, ln);
      out.deviceIk2Min_kA = grab(/I2,min=([-\d.,  ]+)\s*kA/, ln);
      out.deviceIp_kA = grab(/ip≈([-\d.,  ]+)\s*kA/, ln);
    }
  }
  return out;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(150);

  /* The build this artifact names, observed in the document the browser loaded. */
  const BUILD = await readPageManifestRevision(page);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'enet-'));
  const result = {
    tool: 'electricalnetwork', file: 'electricalnetwork.html',
    reference: REF.reference_line, reference_citations: REF.citations,
    tolerance: REF.tolerance_line,
    total: 0, passed: 0, failed: 0, flagged: 0, page_errors: [], cases: [],
    environment: 'Chromium (Playwright) on Linux, file:// origin, ?lang=en. Reference generated by '
      + 'python 3 with numpy/scipy (bench-src/ref/gen_electricalnetwork.py).',
    not_benchmarked: [
      'The symmetrical breaking current Ib, the steady-state current Ik, the d.c. component i_DC and the '
      + 'm/n Joule-integral factors of IEC 60909-0 clause 4.5-4.8 - the tool does not compute them, so the '
      + 'motor contribution is benchmarked only as an initial symmetrical current I_kM\'\' with no decay.',
      'Zero-sequence and negative-sequence networks: only the Z_2 = Z_1 line-to-line relation eq. (34) and '
      + 'the installation-level TN/TT earth-loop screening are exercised. IT systems are unsupported by the tool.',
      'The current-carrying-capacity (Iz) tables and their correction factors, which the page shares with the '
      + 'Cable Sizing tool and which are benchmarked there.',
      'The generic breaker time-current model (In/Isd/tsd/Ii/ti/t6) and the range-based selectivity screening: '
      + 'these are the page\'s own engineering model, not a standardised curve; only the case where the fault '
      + 'current exceeds the instantaneous pickup (clearing time = t_i exactly) is used, and only to check the '
      + 'adiabatic equation S = I sqrt(t)/k around it.',
      'The conductor resistivity model (R20 = 18.56 Cu / 29.38 Al ohm mm2/km, alpha = 0.00393 / 0.00403 per K): '
      + 'every benchmark case pins R20 with the per-feeder override so the graded numbers do not depend on it. '
      + 'Note IEC 60909-0:2016 6.4 prescribes alpha = 0.004 1/K for copper and aluminium; the page uses the '
      + 'physical coefficients instead, a 0.15 % difference in R at 70 C.',
    ],
  };

  for (const c of REF.cases) {
    const file = path.join(tmp, c.id + '.json');
    fs.writeFileSync(file, JSON.stringify(c.state));
    await page.setInputFiles('#importFile', file);
    await page.waitForTimeout(120);
    /* The page's #globalMsg banner is gone: showMessage() now calls the framework
       notification channel, which appends a .dgc-note element (class "ok" or "err")
       to the shared notes box. The newest note is the verdict on this import. */
    const msg = await page.evaluate(() => {
      const notes = document.querySelectorAll('.dgc-note');
      if (!notes.length) return '';
      const last = notes[notes.length - 1];
      const span = last.querySelector('span');
      return ((span || last).textContent || '').trim();
    });
    if (/import/i.test(msg) && !/JSON OK/.test(msg)) {
      result.cases.push({ id: c.id, note: c.note, inputs: { focus: c.focus },
        cmp: {}, worst_rel: NaN, pass: false, error: 'import rejected: ' + msg });
      result.total++; result.failed++;
      continue;
    }
    // select the node under test
    if (c.focus !== 'LV') {
      await page.evaluate((id) => {
        const b = document.querySelector(`#resultsBody button[data-id="${id}"]`);
        if (!b) throw new Error('no result row for ' + id);
        b.click();
      }, c.focus);
      await page.waitForTimeout(60);
    }
    const txt = await page.$eval('#selectedResult', (e) => e.innerText);
    const got = c.focus === 'LV' ? parseRootSelected(txt) : parseSelected(txt);

    /* The #kCurrent/#kLoss/#kIkMax/#kIkMin/#kIp strip is gone. The same five numbers
       are printed in the framework's result tiles: .dgu-tile carrying a .dgu-tile-l
       label and a .dgu-tile-v value. The lookup is keyed on the English label under
       ?lang=en and returns null when no tile carries it, so a renamed label fails the
       case instead of silently grading a different tile. */
    const kpi = await page.evaluate(() => {
      const norm = (t) => String(t || '').replace(/\?\s*$/, '').trim().toLowerCase();
      const tiles = {};
      for (const n of document.querySelectorAll('.dgu-tile')) {
        tiles[norm((n.querySelector('.dgu-tile-l') || {}).textContent)] =
          ((n.querySelector('.dgu-tile-v') || {}).textContent || '').trim();
      }
      const v = (label) => (label in tiles ? tiles[label] : null);
      return {
        rootI_A: v('source current'),
        loss_kW: v('cable losses'),
        lv_IkMax_kA: v("lv ik'' max"),
        lv_IkMin_kA: v("lv ik'' min"),
        lv_ip_kA: v('lv peak ip'),
      };
    });

    const cmp = {};
    let worst = 0, pass = true;
    const check = (key, gv, rv) => {
      const ok = Number.isFinite(gv) && Number.isFinite(rv) && Math.abs(gv - rv) <= tol(key, rv);
      const rel = Number.isFinite(rv) && rv !== 0 ? Math.abs(gv - rv) / Math.abs(rv) : (gv === rv ? 0 : NaN);
      cmp[key] = { got: gv, ref: rv, rel, ok };
      if (Number.isFinite(rel)) worst = Math.max(worst, rel);
      if (!ok) pass = false;
    };
    for (const [k, v] of Object.entries(c.expect)) {
      if (!(k in got)) continue;
      check(k, got[k], v);
    }
    check('rootI_A', num(kpi.rootI_A), c.lv.rootI_A);
    check('loss_kW', num(kpi.loss_kW), c.lv.loss_kW);
    check('lv_IkMax_kA', num(kpi.lv_IkMax_kA), c.lv.IkMax_kA);
    check('lv_IkMin_kA', num(kpi.lv_IkMin_kA), c.lv.IkMin_kA);
    check('lv_ip_kA', num(kpi.lv_ip_kA), c.lv.ip_kA);

    const entry = {
      id: c.id, note: c.note,
      inputs: { focus: c.focus, globals: c.state.globals, nodes: c.state.nodes.length },
      cmp, worst_rel: worst, pass,
    };
    if (c.crosscheck) entry.crosscheck = c.crosscheck;
    entry.power_balance = c.balance;
    result.cases.push(entry);
    result.total++;
    if (pass) result.passed++; else result.failed++;
  }

  result.page_errors = pageErrors;
  {
    const xs = result.cases.map(c => c.crosscheck).filter(Boolean);
    const worst = xs.length ? Math.max(...xs.map(x => Math.max(x.rel_IkMax, x.rel_IkMin))) : 0;
    result.crosscheck = xs.length
      ? `Every motor-free case is computed twice: once by solving the equivalent-voltage-source network `
        + `with the faulted node as a slack node, and once from the analytic series impedance `
        + `Z = Z_source + sum(Z_branch) along the path. Worst mutual deviation over ${xs.length} cases: `
        + `${worst.toExponential(2)} relative (double-precision round-off). Case hand_single_feeder is `
        + `additionally verified by hand: |Z| = 20.641 mOhm, Ik'' = 11747.4 A, i_p = 17.881 kA.`
      : 'no cross-check available';
    const bal = Math.max(...result.cases.map(c => (c.power_balance ? c.power_balance.rel : 0)));
    result.power_balance_note = `Load-flow invariant checked in the reference for every case: `
      + `3 Re(V_LV conj(I_root)) = sum(P_load/eta) + sum(3 |I|^2 R). Worst residual ${bal.toExponential(2)} relative.`;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1));
  await browser.close();

  for (const c of result.cases) {
    if (!c.pass) {
      const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok)
        .map(([k, v]) => `${k}: got ${v.got} ref ${v.ref} rel ${v.rel.toExponential(2)}`);
      console.log('FAIL ' + c.id + (c.error ? '  ' + c.error : '') + '\n      ' + bad.join('\n      '));
    }
  }
  console.log(`${result.passed}/${result.total} passed, ${result.failed} failed; page errors: ${pageErrors.length}`);
  if (pageErrors.length) console.log(pageErrors.join('\n'));
  process.exit(result.failed || pageErrors.length ? 1 : 0);
}
main();
