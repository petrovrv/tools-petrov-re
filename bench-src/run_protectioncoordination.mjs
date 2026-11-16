/* Benchmark driver for protectioncoordination.html
 * ============================================================================
 *
 * WHAT IT GRADES
 * --------------
 * The same 15 quantities the 2026-08-12 artifact graded, over the same six
 * networks, at the same tolerances:
 *
 *   analytic_source_3ph            Ik_kA, kappa, ip_kA, ccm_xr
 *   analytic_source_ll             Ik_kA, ratio_to_3ph
 *   transformer_referral           Ik_kA
 *   parallel_sources               Ik_kA, utility_kA, generator_kA, ccm_xr,
 *                                  kappa, ip_kA
 *   dyn_primary_577                primary_phase_ratio
 *   schneider_generator_increment  generator_kA
 *
 * (The brief for this re-run, and the 2026-10-16 addendum, both say "14
 * graded quantities". The artifact has 15: the six `cmp` objects carry
 * 4+2+1+6+1+1 entries. The manifest's `cases: 6` is the case count, not the
 * quantity count.)
 *
 * WHERE EACH REFERENCE COMES FROM
 * -------------------------------
 * bench-src/ref/protectioncoordination_ref.json, written by
 * bench-src/gen_protectioncoordination.py, which implements from the standard
 * and the published documents:
 *
 *   Ik (3-phase)        IEC 60909-0:2016 4.2 eq. (29)
 *   Ik (line-line)      IEC 60909-0:2016 4.2 eq. (31)/(34)
 *   ratio_to_3ph        IEC 60909-0:2016 4.2 eq. (34) for Z_2 = Z_1, = sqrt3/2
 *   kappa               IEC 60909-0:2016 4.3.1.2 eq. (56) with the method-C
 *                       R/X = (R_c/X_c)(f_c/f) taken at f_c = 0.4 f
 *   ip                  IEC 60909-0:2016 4.3.1.2 eq. (55)
 *   transformer referral IEC 60909-0:2016 6.1 eq. (5) + 6.2 eq. (7)-(9)
 *   branch currents     IEC 60909-0:2016 4.2 eq. (29) on each source branch
 *   ccm_xr              EasyPower 11.1 Help, TCC Options, Characteristic
 *                       Current Method (G. Parise, IEEE Trans. Ind. App.
 *                       31(1), 1995): i_dc,j = sqrt2 I_j exp(-pi/(X/R)_j),
 *                       (X/R)_eq = -pi/ln(sum i_dc/(sqrt2 sum I))
 *   primary_phase_ratio Schneider Electric 0100DB2301, System Protection: a
 *                       secondary L-N fault on a delta-wye transformer gives
 *                       57.7 % (= 1/sqrt3) of the maximum three-phase primary
 *                       phase current
 *   generator increment Schneider Electric 0100DB2301, Add a Generator /
 *                       Figure 55: bus 02 19.318 kA before and 24.672 kA
 *                       after the 15 MW generator, so 5.354 kA of branch
 *
 * The generator is re-run by hand before every run of this driver and its
 * output compared; it reads no artifact, no page and nothing it writes.
 *
 * WHICH SURFACE EACH NUMBER IS READ FROM
 * --------------------------------------
 * Every quantity is measured on as many of three channels as the page offers,
 * all three are written into the artifact, and the graded `got` is the
 * channel named in `channel` for that quantity:
 *
 *   record  Diagram.record.build().outputs - double precision, the published
 *           calculation-record surface (schema tools.petrov.re/
 *           calculation-record/v1). 11 of the 15 quantities are graded here.
 *           utility_kA and generator_kA of parallel_sources are not fields of
 *           that record, but they are recoverable from it exactly: the record
 *           carries legacy_ccm_dc_half_cycle_A = sum_j sqrt2 I_j
 *           exp(-pi/(X/R)_j) and legacy_ccm_equivalent_xr, from which
 *           sum_j I_j follows, and with the two branch X/R values taken from
 *           the REFERENCE (not from the page) the 2x2 system is inverted for
 *           the two branch currents. The inversion is well conditioned here
 *           (exp(-pi/3) = 0.3509 against exp(-pi/18) = 0.8399) and reproduces
 *           both branch currents to about 1e-15 relative.
 *   dom     the printed strings, parsed with a separator-tolerant reader
 *           (#kFault, #kIp, #kCCM, #ccmTable, #timeline). This is the channel
 *           the 2026-08-12 harness graded on, so it is recorded for every
 *           quantity as the comparison against that artifact.
 *   page_fn a read through one of the page's own pure functions
 *           (calc.fault.sources, deviceCurrentForFault). Used as the graded
 *           channel for exactly two quantities, named below.
 *
 * Two quantities are NOT available on the record surface and are graded on
 * page_fn, with dom recorded beside them:
 *
 *   dyn_primary_577.primary_phase_ratio - the ratio of two PRIMARY-side
 *     device currents. Diagram.record.build() carries no per-device current
 *     at all, and the only DOM surface that prints one is the trip timeline,
 *     at integer amps (505 A and 875 A here, which is what the 2026-08-12
 *     artifact's `got` 0.5771428571428572 = 505/875 is). Graded on
 *     deviceCurrentForFault(QHV577, fault).phase.
 *   schneider_generator_increment.generator_kA - a per-branch current again.
 *     The record inversion above is singular for this case, because both
 *     branches are entered with X/R = 1000 and exp(-pi/1000) is the same
 *     number for both. Graded on calc.fault.sources.
 *
 * Where two channels are both available the run compares them and flags the
 * case when they disagree by more than the printed rounding of the dom
 * channel. That cross-channel check is the only thing here that would catch a
 * page whose arithmetic and whose display have parted company - which is the
 * whole question the 2026-10-15 number-format merge raises.
 *
 * WHAT THIS DOES NOT ESTABLISH
 * ----------------------------
 * 1. The feeder-impedance convention. IEC 60909-0:2016 6.1 eq. (6) writes
 *    Z_Q = c U_nQ^2/S_kQ'', so eq. (29) at the feeder's own terminals returns
 *    the quoted I_kQ''. The page uses Z_Q = U_nQ^2/S_kQ'' and applies c only
 *    in the equivalent voltage source, so its terminal current is c times the
 *    quoted value: 13 777.68 A against 13 121.60 A for the 250 MVA / 11 kV
 *    feeder of analytic_source_3ph. The page's own regression test asserts
 *    the factor c, so it is a declared convention, not a slip - but it is a
 *    divergence from the clause, and these cases take Z_Q = U_nQ^2/S_kQ'' as
 *    a stated INPUT and grade only the equations evaluated on it. Four of the
 *    six cases run at c = 1, where the two conventions coincide.
 * 2. The generator impedance correction K_G of 6.6 eq. (18), which the page
 *    does not apply and which its generator inputs cannot express.
 * 3. That the graded numbers came from the document the build was read out
 *    of. provenance.mjs ties the BUILD to the page by reference; it says
 *    itself that it does not tie the numbers. The cross-channel check above
 *    narrows this and does not close it.
 * 4. Anything outside the short-circuit kernel: the generic breaker, fuse and
 *    relay TCC curves, the grading optimiser, the protection-zone drawing,
 *    user-imported manufacturer data, CT screening, the breaking current I_b,
 *    the d.c. envelope, the steady-state screen, the cable thermal screens
 *    and the batch study. The page's own `not_benchmarked` list, carried
 *    forward into the artifact, is the longer statement of this.
 * 5. The TCC canvas. This page's 2026-10-15 merge added --tcc-ink/--tcc-grid
 *    to its three palettes and made drawTCC() read them instead of the shared
 *    --line/--muted. Nothing on that path reaches a graded number, and this
 *    driver does not grade a pixel.
 *
 * Usage: node bench-src/run_protectioncoordination.mjs --site <tree>
 *          --out <artifact>.json [--base <origin>] [--ref-dir <dir>]
 * --out is mandatory in practice: benchpaths.mjs defaults it to
 * <siteRoot>/benchmarks/<name>.json, which would write into the tree driven.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const P = benchPaths({ name: 'protectioncoordination',
                       page: 'protectioncoordination.html',
                       ref: 'protectioncoordination_ref.json' });

const PROVENANCE = {
  reference_provenance: 'recomputed',
  provenance_note:
    'Every reference value is recomputed by bench-src/gen_protectioncoordination.py '
    + 'from the clauses and published documents this artifact cites. That generator '
    + 'reads no page, no artifact and nothing it writes, so no case reuses a stored '
    + 'value and none carries ref_source "recorded". The six networks are the '
    + "fixtures of the page's own regression tests; a fixture is an input, not a "
    + 'reference.',
};

const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const URL = P.pageUrl + '?lang=en';
const OUT = P.out;
const SQ3 = Math.sqrt(3);

/* ---------------------------------------------------------------- channels */
/* Which channel the graded `got` of each quantity comes from. Stated here
   rather than in the reference, because it is a property of the page's
   surfaces and not of the physics. */
const CHANNEL = {
  Ik: 'record', kappa: 'record', ip: 'record', ccm_xr: 'record',
  ratio_to_3ph: 'record', branch_xr: 'record',
  branch_generator: 'page_fn', primary_phase_ratio: 'page_fn',
};

/* Printed rounding of the dom channel, used only for the cross-channel check:
   the page prints a current below 1000 A as integer amps and at or above it as
   kA to 2 decimals, so in kA the step is 1e-3 below 1 kA and 1e-2 above. */
const domStepKA = (kA) => (Math.abs(kA) < 1 ? 1e-3 : 1e-2);

/* A separator-tolerant number reader. The merged page groups its thousands
   through the framework locale map, so a printed X/R arrives as
   "26,725,619.608" and a current as "13.12 kA"; U+2212, U+00A0, U+202F and
   plain spaces all occur in other languages of the same map. */
const num = (s) => {
  if (s == null) return NaN;
  const t = String(s).replace(/−/g, '-').replace(/[,  \s]/g, '');
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};
/* "505 A" / "13.12 kA" -> kA */
const ampsToKA = (s) => {
  if (s == null) return NaN;
  const v = num(s);
  if (!Number.isFinite(v)) return NaN;
  return /kA/.test(String(s)) ? v : v / 1000;
};

/* The Parise half-cycle factor of one branch. */
const pariseE = (xr) => Math.exp(-Math.PI / xr);

/* Invert the record's CCM aggregates for the two branch currents.
   sum_j I_j        = sumDc / (sqrt2 exp(-pi/xrEq))
   sum_j I_j e_j    = sumDc / sqrt2,           e_j = exp(-pi/(X/R)_j)
   The two X/R values come from the reference. Returns null when the system is
   too ill conditioned to invert, which is the honest answer when the branches
   carry the same X/R. */
function branchesFromRecord(sumDc, xrEq, xrs) {
  if (!Number.isFinite(sumDc) || !Number.isFinite(xrEq) || xrs.length !== 2) return null;
  const e1 = pariseE(xrs[0]), e2 = pariseE(xrs[1]);
  if (Math.abs(e1 - e2) < 1e-6) return null;
  const sumAc = sumDc / (Math.SQRT2 * pariseE(xrEq));
  const i1 = (sumDc / Math.SQRT2 - sumAc * e2) / (e1 - e2);
  return { sumAc, I: [i1, sumAc - i1] };
}

/* ------------------------------------------------------------- measurement */
async function measure(page, tmpFile, state, deviceIds) {
  fs.writeFileSync(tmpFile, JSON.stringify(state));
  await page.setInputFiles('#fileImport', tmpFile);
  await page.waitForTimeout(220);
  return page.evaluate((ids) => {
    const txt = (id) => { const n = document.getElementById(id); return n ? (n.innerText || n.textContent || '') : ''; };
    const rec = (window.Diagram && Diagram.record && typeof Diagram.record.build === 'function')
      ? Diagram.record.build() : null;
    let fault = null, sources = null, dev = {};
    try {
      fault = { ok: calc.fault.ok, error: calc.fault.error || null, type: calc.fault.type,
                I: calc.fault.I, ip: calc.fault.ip, kappa: calc.fault.kappa };
      sources = (calc.fault.sources || []).map(s => ({ name: s.name, id: s.id, type: s.type, I: s.I, xr: s.xr }));
      for (const id of (ids || [])) {
        const n = state.elements.find(x => x.id === id);
        dev[id] = n ? deviceCurrentForFault(n, calc.fault).phase : null;
      }
    } catch (e) { fault = { ok: false, error: 'page read failed: ' + String(e && e.message || e) }; }
    return {
      record: rec ? rec.outputs : null,
      record_tool: rec ? rec.tool : null,
      fault, sources, dev,
      dom: { kFault: txt('kFault'), kIp: txt('kIp'), kCCM: txt('kCCM'),
             ccmInfo: txt('ccmInfo'), ccmTable: txt('ccmTable'),
             timeline: txt('timeline'), why: txt('why') },
    };
  }, deviceIds || []);
}

/* One printed CCM-table row per source branch: name, Iac, X/R, idc. */
function domCcmRows(table) {
  const rows = [];
  for (const line of String(table || '').split('\n')) {
    const f = line.split('\t').map(s => s.trim());
    if (f.length < 4 || /^Source branch$/i.test(f[0])) continue;
    rows.push({ name: f[0], I_kA: ampsToKA(f[1]), xr: num(f[2]), idc_kA: ampsToKA(f[3]) });
  }
  return rows;
}

/* The timeline prints one block per operating device:
   "<name>\n<stage> · <current> @ <kV>\n<t>\n<band>" */
function domTimelineCurrentKA(timeline, deviceName) {
  const lines = String(timeline || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== deviceName) continue;
    const sub = lines[i + 1] || '';
    const m = sub.match(/([\d.,  \s]+(?:k?A))\s*@/);
    if (m) return ampsToKA(m[1]);
  }
  return NaN;
}

/* ------------------------------------------------------------------- main */
async function main() {
  const genCheck = { file: P.ref, mtime_ms: fs.statSync(P.ref).mtimeMs };
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  /* The build this artifact names, observed in the document the browser
     loaded, by provenance.mjs and not by this driver. */
  const BUILD = await readPageManifestRevision(page);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcoord-'));
  const result = {
    tool: 'protectioncoordination', file: 'protectioncoordination.html',
    reference: REF.reference_line,
    reference_citations: REF.citations,
    reference_limits: REF.reference_limits,
    tolerance: REF.tolerance_line,
    total: 0, passed: 0, failed: 0, flagged: 0, page_errors: [], cases: [],
    graded_quantities: 0,
    channels: {
      record: 'Diagram.record.build().outputs, the published calculation-record surface, double precision.',
      dom: 'the printed strings of #kFault / #kIp / #kCCM / #ccmTable / #timeline, read with a separator-tolerant parser. This is the channel the 2026-08-12 artifact graded on.',
      page_fn: "a read through one of the page's own pure functions (calc.fault.sources, deviceCurrentForFault), used where the record surface carries no counterpart.",
    },
    environment: 'Chromium (Playwright) on Linux, ' + (P.base ? P.base : 'file://') + ' origin, ?lang=en. '
      + 'Every case state is driven in through the page\'s own project-import control (#fileImport) and '
      + 'nothing is written into page state. References generated by python3 '
      + 'bench-src/gen_protectioncoordination.py.',
  };

  const byId = {};

  for (const c of REF.cases) {
    const devIds = new Set();
    for (const q of Object.values(c.expect)) if (q.device) devIds.add(q.device);
    const runs = {};
    for (const r of c.runs) {
      runs[r.key] = await measure(page, path.join(tmp, c.id + '-' + r.key + '.json'),
                                  r.state, [...devIds]);
    }

    const cmp = {};
    let worst = 0, pass = true, flagged = false;
    const notes = [];

    for (const [key, spec] of Object.entries(c.expect)) {
      const m = runs[spec.run];
      const chan = { record: NaN, dom: NaN, page_fn: NaN };
      const rec = m && m.record;

      switch (spec.quantity) {
        case 'Ik':
          if (rec) chan.record = rec.fault_current_A / 1000;
          chan.dom = ampsToKA((m.dom.kFault || '').split('@')[0]);
          if (m.fault) chan.page_fn = m.fault.I / 1000;
          break;
        case 'kappa':
          if (rec) chan.record = rec.kappa;
          { const mm = (m.dom.kIp || '').match(/κ\s*([\d.,  ]+)/); chan.dom = mm ? num(mm[1]) : NaN; }
          if (m.fault) chan.page_fn = m.fault.kappa;
          break;
        case 'ip':
          if (rec) chan.record = rec.peak_current_A / 1000;
          chan.dom = ampsToKA((m.dom.kIp || '').split('·')[0]);
          if (m.fault) chan.page_fn = m.fault.ip / 1000;
          break;
        case 'ccm_xr':
          if (rec) chan.record = rec.legacy_ccm_equivalent_xr;
          chan.dom = num(m.dom.kCCM);
          break;
        case 'ratio_to_3ph': {
          const base = byId[spec.against];
          if (!base) { notes.push('no companion run ' + spec.against + ' for ' + key); break; }
          const b = base.runs['3ph'];
          if (rec && b && b.record) chan.record = (rec.fault_current_A) / (b.record.fault_current_A);
          { const g = ampsToKA((m.dom.kFault || '').split('@')[0]),
                  h = ampsToKA((b.dom.kFault || '').split('@')[0]);
            chan.dom = g / h; }
          if (m.fault && b && b.fault) chan.page_fn = m.fault.I / b.fault.I;
          break;
        }
        case 'branch_xr3': case 'branch_xr18': {
          const xrs = (c.aux && c.aux.branch_xr) || [];
          const want = spec.quantity === 'branch_xr3' ? xrs[0] : xrs[1];
          const inv = rec ? branchesFromRecord(rec.legacy_ccm_dc_half_cycle_A,
                                               rec.legacy_ccm_equivalent_xr, xrs) : null;
          if (inv) chan.record = inv.I[xrs.indexOf(want)] / 1000;
          else notes.push(key + ': the record CCM inversion is singular for this case');
          { const rows = domCcmRows(m.dom.ccmTable);
            let best = null;
            for (const r of rows) if (best === null || Math.abs(r.xr - want) < Math.abs(best.xr - want)) best = r;
            chan.dom = best ? best.I_kA : NaN; }
          { const s = (m.sources || []).reduce((a, x) =>
              (a === null || Math.abs(x.xr - want) < Math.abs(a.xr - want) ? x : a), null);
            chan.page_fn = s ? s.I / 1000 : NaN; }
          break;
        }
        case 'branch_generator': {
          const xrs = (c.aux && c.aux.branch_xr) || [];
          const inv = rec ? branchesFromRecord(rec.legacy_ccm_dc_half_cycle_A,
                                               rec.legacy_ccm_equivalent_xr, xrs) : null;
          if (!inv) notes.push(key + ': the record CCM inversion is singular here (both '
            + 'branches are entered with the same X/R), so this quantity is graded on the '
            + 'page function and not on the record surface');
          { const s = (m.sources || []).find(x => x.type === 'generator');
            chan.page_fn = s ? s.I / 1000 : NaN; }
          { const rows = domCcmRows(m.dom.ccmTable);
            const r = rows.find(x => /gen/i.test(x.name));
            chan.dom = r ? r.I_kA : NaN; }
          break;
        }
        case 'primary_phase_ratio': {
          const base = runs['3ph'];
          const d = spec.device;
          if (m.dev && base && base.dev && Number.isFinite(m.dev[d]) && Number.isFinite(base.dev[d]))
            chan.page_fn = m.dev[d] / base.dev[d];
          const name = (c.runs.find(r => r.key === spec.run).state.elements
            .find(x => x.id === d) || {}).name;
          { const a = domTimelineCurrentKA(m.dom.timeline, name),
                  b = domTimelineCurrentKA(base ? base.dom.timeline : '', name);
            chan.dom = a / b; }
          notes.push(key + ': Diagram.record.build() carries no per-device current, so the '
            + 'graded channel is deviceCurrentForFault(' + d + ', fault).phase; the dom '
            + 'channel is the trip timeline, which prints integer amps.');
          break;
        }
        default:
          notes.push('unknown quantity ' + spec.quantity + ' for ' + key);
      }

      const channel = CHANNEL[spec.quantity] || CHANNEL[spec.quantity.replace(/\d+$/, '')]
        || (spec.quantity.startsWith('branch_xr') ? 'record' : 'page_fn');
      const got = chan[channel];
      const ref = spec.ref;
      const tolAbs = Number.isFinite(spec.tol_abs) ? spec.tol_abs
        : (Number.isFinite(spec.tol_rel) ? spec.tol_rel * Math.abs(ref) : 0);
      const abs = Math.abs(got - ref);
      const rel = ref !== 0 ? abs / Math.abs(ref) : (got === ref ? 0 : NaN);
      const ok = Number.isFinite(got) && abs <= tolAbs;

      /* cross-channel check: the graded channel against the printed one */
      let agree = null;
      if (Number.isFinite(got) && Number.isFinite(chan.dom) && channel !== 'dom') {
        const step = /ratio/.test(spec.quantity) ? 2e-3 : domStepKA(Math.abs(ref));
        agree = { dom: chan.dom, difference: Math.abs(chan.dom - got),
                  printed_step: step, consistent: Math.abs(chan.dom - got) <= step };
        if (!agree.consistent) { flagged = true;
          notes.push(key + ': the graded channel (' + got + ') and the printed string ('
            + chan.dom + ') differ by more than the printed step ' + step); }
      }

      const entry = { got, ref, rel, abs, channel, channels: chan,
                      clause: spec.clause, ok };
      if (Number.isFinite(spec.tol_abs)) entry.tol_abs = spec.tol_abs;
      if (Number.isFinite(spec.tol_rel)) entry.tol_rel = spec.tol_rel;
      if (spec.ref_exact !== undefined) { entry.ref_exact = spec.ref_exact;
        entry.ref_exact_note = spec.ref_exact_note;
        entry.abs_to_ref_exact = Math.abs(got - spec.ref_exact); }
      if (spec.ref_closed_form !== undefined) { entry.ref_closed_form = spec.ref_closed_form;
        entry.ref_closed_form_note = spec.ref_closed_form_note;
        entry.rel_to_ref_closed_form = Math.abs(got - spec.ref_closed_form) / Math.abs(spec.ref_closed_form); }
      if (agree) entry.channel_agreement = agree;
      cmp[key] = entry;
      if (Number.isFinite(rel)) worst = Math.max(worst, rel);
      if (!ok) pass = false;
    }

    const entry = { id: c.id, note: c.note, inputs: c.inputs, cmp,
                    worst_rel: worst, pass };
    if (c.aux) entry.reference_intermediates = c.aux;
    if (c.crosscheck) entry.crosscheck_ungraded = c.crosscheck;
    if (notes.length) entry.notes = [...new Set(notes)];
    if (flagged) entry.flagged = true;
    result.cases.push(entry);
    result.total++;
    result.graded_quantities += Object.keys(cmp).length;
    if (pass) result.passed++; else result.failed++;
    if (flagged) result.flagged++;
    byId[c.id] = { runs, entry };
  }

  result.page_errors = pageErrors;
  result.reference_generator = genCheck;
  result.framework_smoke = await page.evaluate(() => ({
    diagram: !!window.Diagram,
    record: !!(window.Diagram && Diagram.record && typeof Diagram.record.build === 'function'),
    permalink: !!(window.Diagram && Diagram.state && typeof Diagram.state.link === 'function'),
    toolbar: !!document.querySelector('.dgc-bar, .dgu-bar, #dgc-bar'),
    number_locale: !!(window.DiagramUI && DiagramUI.num && typeof DiagramUI.num.sep === 'function'),
  }));
  result.crosscheck =
    'Three published cross-checks are carried un-graded beside the graded closed forms, '
    + 'because each needs a convention the published source does not expose: Schneider '
    + 'FA405803 I_rT/u_kr for transformer_referral (0.099 % from the closed form that '
    + 'includes the finite feeder), and Schneider 0100DB2301 Figure 55 bus 02 before and '
    + 'after for schneider_generator_increment (1.70 % and 1.29 % from the closed form). '
    + 'The graded Figure-55 quantity is the branch increment alone.';
  result.not_benchmarked = [
    'Generic circuit-breaker, fuse and relay TCC shapes, the automatic grading optimizer and the protection-zone visualization: they are engineering models/UI workflows rather than a single standard reference curve.',
    'User-imported manufacturer TCC and selectivity/back-up datasets: parsing/applicability logic has self-tests, but correctness of proprietary manufacturer tables depends on the user-provided source and is not independently benchmarked here.',
    'CT ALF/knee-voltage/saturation screening beyond its algebraic self-tests.',
    'The IEC 60909-0:2016 mu/q breaking-current screening over arbitrary multi-source networks, the conservative idc source-branch envelope, and the full IEC 60909 d.c. component equation (64). The latter is not yet implemented.',
    'Steady-state synchronous-generator IEC equations (84)/(85): the tool currently uses explicit user/vendor IkP data as a screen; converter/UPS stationary and unbalanced-fault control behavior remains vendor-specific.',
    'IEC m+n thermal-equivalent/Joule-integral calculation: the current cable check is a branch-current I^2 t / user Ithr,1s screening only.',
    'IT first-fault capacitive current, arc-flash, differential/distance/directional protection and proprietary manufacturer back-up/selectivity tables not supplied by the user.',
    'Equation-level changes between IEC 60909-0:2016 and IEC 60909-0:2026 have not been independently reconciled; 2016 equation-set features are labelled explicitly in the tool.',
    'The network feeder impedance convention of IEC 60909-0:2016 6.1 eq. (6) and the generator correction K_G of 6.6 eq. (18): see reference_limits.',
    'The TCC canvas, including the --tcc-ink/--tcc-grid tokens this page gained on 2026-10-15; no pixel is graded here.',
  ];

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(
    stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1));
  await browser.close();

  for (const c of result.cases) {
    if (!c.pass || c.flagged) {
      const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok)
        .map(([k, v]) => `${k}: got ${v.got} ref ${v.ref} abs ${v.abs} tol ${v.tol_abs ?? v.tol_rel}`);
      console.log((c.pass ? 'FLAG ' : 'FAIL ') + c.id + (bad.length ? '\n      ' + bad.join('\n      ') : ''));
      for (const n of (c.notes || [])) console.log('      note: ' + n);
    }
  }
  console.log(`${result.passed}/${result.total} cases passed, ${result.failed} failed, `
    + `${result.flagged} flagged; ${result.graded_quantities} graded quantities; `
    + `page errors: ${pageErrors.length}`);
  if (pageErrors.length) console.log(pageErrors.join('\n'));
  process.exit(result.failed || result.flagged || pageErrors.length ? 1 : 0);
}
main();
