/* Benchmark driver for shortcircuit.html — benchmark `iec60909-sequence-fault-kernel-v1`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * shortcircuit.html has shipped since 2026-09 with a manifest citing this benchmark and
 * an artifact at benchmarks/shortcircuit.json, and no driver that regenerates it existed
 * in any tree. The page therefore could not be re-run against a merged build, which is
 * what AGENTS §5 requires before it ships. This is that driver.
 *
 * WHAT IT GRADES — 12 cases x 6 quantities = 72 graded quantities
 * --------------------------------------------------------------
 *   Ik_A     initial symmetrical short-circuit current, IEC 60909-0:2016 clause 4.2:
 *            eq. (29) three-phase, eq. (34) line-to-line, eq. (52) line-to-earth, and
 *            the line-to-line-with-earth closed form Ik2E'' = c Un |Z0' - a Z2| / |D|.
 *   ip_A     peak current, eq. (55) ip = kappa sqrt2 Ik''.
 *   Ith_A    thermal equivalent current, eq. (68) Ith = Ik'' sqrt(m + n).
 *   Ires_A   residual (earth) current: 3 I0, which for the L-E fault equals Ik1'' and for
 *            the L-L-E fault is the separate IkE2E'' = sqrt3 c Un |Z2| / |D|.
 *   kappa    eq. (56) kappa = 1.02 + 0.98 exp(-3 R/X), read by Method C at fc = 0.4 f.
 *   m        eq. (69) m = [exp(4 f Tk ln(kappa-1)) - 1] / (2 f Tk ln(kappa-1)).
 *
 * WHERE EACH REFERENCE COMES FROM
 * -------------------------------
 * ref/shortcircuit_ref.json, written by ref/gen_shortcircuit.py: an independent Python
 * implementation of those clauses, in ohms, from the published closed forms. The page
 * works in per-unit on a 1 MVA base, assembles a nodal admittance matrix per sequence and
 * takes the driving-point impedance from a complex sparse LU; the reference forms no
 * matrix. The two agree only if both implement the same equations.
 *
 * bench-src/ref/gen_electricalnetwork.py was read first and is NOT the reference here: it
 * covers eq. (55)/(56) and eq. (29), but eq. (34) only in the Z2 = Z1 shortcut
 * (sqrt3/2 Ik''), has no sequence-network eq. (52) — its only earth fault is the
 * IEC 60364-4-41 loop screening — and has nothing for the line-to-line-with-earth fault
 * or for clause 4.8 (Ith, m). Four of the six graded quantities have no reference there.
 * The reasoning is written out at the head of ref/gen_shortcircuit.py.
 *
 * HOW THE PAGE IS DRIVEN, AND WHAT IS READ
 * ----------------------------------------
 * Each case is a complete tool state pushed through the page's own permalink codec
 * (Diagram.state.encode -> ?s=), which lands in CFG.state.deserialize and re-solves. Every
 * graded number is then read from Diagram.record.build().outputs — the object the PDF, the
 * JSON export and the CSV are built from — as a double, never as a printed string. Two
 * further readers of the same page are recorded, ungraded:
 *   - Diagram.handoff.build().sets[<case>_<faultType>], which RE-SOLVES the state inside
 *     the page and so is a second full-precision path to Ik/ip/Ith/Ires;
 *   - the four values the UI prints (Ik'', ip, Ith in kA to 3 decimals and kappa to 4),
 *     parsed with the separator-tolerant parser of run_electricalnetwork.mjs, which is
 *     what makes this driver see a decimal-separator or digit-grouping change at all.
 * Ires and m have no printed surface on this page: the record is their only channel.
 *
 * RULE 3: before a single output is read, every field of the case state is checked against
 * Diagram.record.build().inputs. A case whose inputs did not land is failed, not graded.
 *
 * WHAT THIS DRIVER DOES NOT ESTABLISH
 * -----------------------------------
 *   - n, the d.c. factor of eq. (68), is a user input on this page and in the reference.
 *     eq. (68) is graded on sqrt(m + n) with the case's own n; n itself is not derived
 *     from clause 4.8 Figure 23 by either side.
 *   - Nothing about the page's network mode. All 12 cases are Thevenin equivalents with
 *     generator and motor off, so K_T (6.3.3), the motor impedance (6.8), the transformer
 *     zero-sequence vector groups, the breaking current Ib (4.5) and the near-generator
 *     a.c. decay are untouched. The page's own tile for Ib and K_T reads "—" here.
 *   - The 2026 edition delta. This is the 2016 equation set, as the page's manifest says.
 *   - Ires on a 3-phase or L-L fault is a structural zero, not a computation; a pass there
 *     is weaker evidence than a pass on the two earth-fault cases.
 *   - That the numbers written here are the numbers the page produced. The driver counts
 *     its own cases; provenance.mjs ties the BUILD to an observation of the document, not
 *     the graded values (its KNOWN-LIMITS L-5). The handoff and DOM readers above are a
 *     partial second instrument against exactly that, for 4 and 4 of the 6 quantities.
 *
 * Usage: node run_shortcircuit.mjs --site <tree> --out <artifact>.json
 *        [--base http://host:port] [--ref-dir <dir>]
 * --out is mandatory in practice: benchpaths.mjs defaults it to
 * <siteRoot>/benchmarks/shortcircuit.json, which writes into the tree being driven.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const P = benchPaths({ name: 'shortcircuit', page: 'shortcircuit.html',
                       ref: 'shortcircuit_ref.json' });
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const BASE = (P.base || 'http://127.0.0.1:8331').replace(/\/$/, '');
const URLBASE = BASE + '/' + P.pageFile;
const OUT = P.out;

/* AGENTS §5. The reference is recomputed for this run by the generator named below; the
   build is read out of the live DOM by provenance.mjs and cross-checked against the page
   on disk in the tree --site resolved, and nothing is written if the two disagree. */
const PROVENANCE = {
  reference_provenance: 'recomputed',
  provenance_note: 'Every reference value is recomputed by bench-src/ref/gen_shortcircuit.py '
    + 'from the IEC 60909-0:2016 clauses this artifact cites — clause 4.2 eq. (29)/(34)/(52) '
    + 'and the line-to-line-with-earth closed form, clause 4.3.1.2 eq. (55)-(56) and clause '
    + '4.8 eq. (68)-(69) — in ohms, with no matrix and with no JavaScript from the page read '
    + 'or transcribed. No case reuses a stored value and none carries ref_source "recorded".',
};

/* The record keys that carry the six graded quantities, at full precision. */
const OUTKEY = {
  Ik_A: 'Ik_initial_symmetrical_A',
  ip_A: 'ip_peak_A',
  Ith_A: 'Ith_thermal_equivalent_A',
  Ires_A: 'Ires_residual_A',
  kappa: 'kappa',
  m: 'm',
};
const GRADED = Object.keys(OUTKEY);

/* The declared tolerance, as the page manifest states it: currents to 1e-6 A plus a
   1e-10 relative term, kappa and m to 1e-12 absolute. Both sides evaluate closed forms in
   doubles, so this covers evaluation order and nothing else. It is not widened anywhere. */
const tolFor = (k, ref) => (k.endsWith('_A') ? 1e-6 + 1e-10 * Math.abs(ref) : 1e-12);

/* The separator-tolerant number parser of run_electricalnetwork.mjs, verbatim: it strips
   a U+2212 minus, thin and non-breaking spaces and ASCII group separators before reading
   the first number. Used only for the ungraded DOM cross-check. */
const num = (s) => {
  if (s == null) return NaN;
  const t = String(s).replace(/−/g, '-').replace(/[,  \s]/g, '');
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

const nowISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

async function load(page, state, label) {
  const enc = await page.evaluate((o) => window.Diagram.state.encode(o), state);
  await page.goto(URLBASE + '?lang=en&s=' + enc, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.Diagram && window.Diagram.record && window.Diagram.record.build() !== null,
    null, { timeout: 60000 });
  const r = await page.evaluate(() => {
    const rec = window.Diagram.record.build();
    const ho = window.Diagram.handoff ? window.Diagram.handoff.build() : null;
    /* The printed surface: the framework's result tiles, keyed on the English label under
       ?lang=en, normalised as run_electricalnetwork.mjs normalises it — a tile with a
       "learn" affordance carries a trailing "?" in its label. A renamed label yields null
       and is reported, never skipped, so a label change fails loudly instead of silently
       grading a different tile. */
    const norm = (t) => String(t || '').replace(/\?\s*$/, '').trim().toLowerCase();
    const tiles = {};
    for (const n of document.querySelectorAll('.dgu-tile')) {
      tiles[norm((n.querySelector('.dgu-tile-l') || {}).textContent)] =
        ((n.querySelector('.dgu-tile-v') || {}).textContent || '').trim();
    }
    return { inputs: rec.inputs, outputs: rec.outputs, rev: rec.tool.manifest_revision,
             state: window.Diagram.state.current(), handoff: ho, tiles,
             compute_version: (window.DiagramCompute && window.DiagramCompute.VERSION) || null };
  });
  /* RULE 3: the case's inputs must be what the page is holding, in the record and in the
     controls, before any output is read. */
  const bad = [];
  for (const k of Object.keys(state)) {
    const want = state[k], inRec = r.inputs[k], inState = r.state[k];
    const eq = (a, b) => (typeof want === 'number' ? Number(a) === Number(b) : String(a) === String(b));
    if (!eq(inRec, want)) bad.push(`record.inputs.${k} = ${JSON.stringify(inRec)}, case names ${JSON.stringify(want)}`);
    if (!eq(inState, want)) bad.push(`state.${k} = ${JSON.stringify(inState)}, case names ${JSON.stringify(want)}`);
  }
  if (bad.length) throw new Error(`${label}: the page is not holding the case's inputs — `
    + `${bad.length} mismatches:\n  ` + bad.join('\n  '));
  return r;
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const pageErrors = [], consoleLog = [];
  page.on('pageerror', (e) => pageErrors.push(String((e && e.stack) || e)));
  page.on('console', (m) => {
    consoleLog.push({ type: m.type(), text: m.text() });
    if (m.type() === 'error') pageErrors.push('console: ' + m.text());
  });

  await page.goto(URLBASE + '?lang=en', { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.Diagram && window.Diagram.record && window.Diagram.record.build() !== null,
    null, { timeout: 60000 });

  /* The build this artifact names, read out of the document the browser loaded. */
  const BUILD = await readPageManifestRevision(page);

  const run_at = nowISO();
  const results = [];
  let inputChecks = 0;
  let computeVersion = null;

  for (const c of REF.cases) {
    const r = await load(page, c.state, c.id);
    inputChecks += 2 * Object.keys(c.state).length;
    computeVersion = r.compute_version;

    const tool = {}, absolute_error = {};
    let pass = true;
    for (const k of GRADED) {
      const got = r.outputs[OUTKEY[k]];
      const ref = c.reference[k];
      tool[k] = got;
      const err = Math.abs(Number(got) - ref);
      absolute_error[k] = err;
      if (!(Number.isFinite(Number(got)) && err <= tolFor(k, ref))) pass = false;
    }

    /* Ungraded reader 1: the page's handoff set for this case and fault type, which
       re-solves the state inside the page. Bit equality is the expected answer. */
    const setKey = c.case + '_' + c.fault_type;
    const hset = r.handoff && r.handoff.sets && Array.isArray(r.handoff.sets[setKey])
      ? r.handoff.sets[setKey][0] : null;
    const handoff_crosscheck = {};
    if (hset) {
      const hv = { Ik_A: hset.Ik, ip_A: hset.ip, Ith_A: hset.Ith, Ires_A: hset.Ires };
      for (const k of Object.keys(hv)) {
        const v = hv[k] && typeof hv[k].value === 'number' ? hv[k].value : null;
        handoff_crosscheck[k] = v === null
          ? { present: false, note: 'absent from the handoff set' }
          : { value: v, abs_diff_from_record: Math.abs(v - Number(tool[k])) };
      }
    } else {
      handoff_crosscheck.note = 'no handoff set "' + setKey + '"';
    }

    /* Ungraded reader 2: the printed tiles. Ik/ip/Ith print kA to 3 decimals and kappa to
       4, so the criterion is half of the last printed digit; Ires and m are not printed. */
    const printed = {
      Ik_A: { text: r.tiles["ik''"] ?? null, scale: 1000, decimals: 3 },
      ip_A: { text: r.tiles.ip ?? null, scale: 1000, decimals: 3 },
      Ith_A: { text: r.tiles.ith ?? null, scale: 1000, decimals: 3 },
      kappa: { text: r.tiles['κ'] ?? null, scale: 1, decimals: 4 },
    };
    const dom_crosscheck = {};
    for (const k of Object.keys(printed)) {
      const p = printed[k];
      if (p.text === null) { dom_crosscheck[k] = { printed: null, note: 'no tile carries this label' }; continue; }
      const read = num(p.text) * p.scale;
      const half = 0.5 * Math.pow(10, -p.decimals) * p.scale;
      dom_crosscheck[k] = { printed: p.text, parsed: read,
        abs_diff_from_record: Math.abs(read - Number(tool[k])),
        within_half_printed_digit: Math.abs(read - Number(tool[k])) <= half + 1e-9 * Math.abs(read) };
    }
    dom_crosscheck.Ires_A = { printed: null, note: 'this page prints no residual current' };
    dom_crosscheck.m = { printed: null, note: 'this page prints no thermal factor m' };

    results.push({
      id: c.id, fault_type: c.fault_type, case: c.case, note: c.note,
      inputs: c.state, reference: c.reference, tool, absolute_error,
      reference_detail: c.detail,
      handoff_crosscheck, dom_crosscheck,
      passed: pass,
    });
  }

  /* Positive control, ungraded: perturb one input and confirm the graded outputs move,
     then perturb one that may not move the air of the others. A harness that reports a
     pass while driving nothing would pass every case above and fail here. */
  const control = {};
  {
    const base = REF.cases.find((c) => c.id === '3ph-max-xr10').state;
    const a = (await load(page, base, 'control/base')).outputs;
    const stiffer = Object.assign({}, base, { importZ_Ohm: base.importZ_Ohm / 2 });
    const b = (await load(page, stiffer, 'control/Z/2')).outputs;
    const pick = (o) => Object.fromEntries(GRADED.map((k) => [k, o[OUTKEY[k]]]));
    control.perturbation = { field: 'importZ_Ohm', from: base.importZ_Ohm, to: stiffer.importZ_Ohm };
    control.before = pick(a); control.after = pick(b);
    control.currents_doubled_rel = Math.abs(b.Ik_initial_symmetrical_A / a.Ik_initial_symmetrical_A - 2);
    control.kappa_unchanged = b.kappa === a.kappa;
    control.currents_moved = ['Ik_A', 'ip_A', 'Ith_A'].every((k) => control.before[k] !== control.after[k]);

    const slow = Object.assign({}, base, { thermalTime: 0.05 });
    const d = (await load(page, slow, 'control/Tk=0.05')).outputs;
    control.perturbation2 = { field: 'thermalTime', from: base.thermalTime, to: 0.05 };
    control.after2 = pick(d);
    control.thermal_only = d.m !== a.m && d.Ith_thermal_equivalent_A !== a.Ith_thermal_equivalent_A
      && d.Ik_initial_symmetrical_A === a.Ik_initial_symmetrical_A
      && d.ip_peak_A === a.ip_peak_A;
    control.inputs_asserted_field_reads = inputChecks;
  }

  await browser.close();

  const passed = results.filter((r) => r.passed).length;
  const artifact = {
    schema: 'tools.petrov.re/benchmark-artifact/v1',
    tool: 'shortcircuit',
    /* The page this artifact grades. The live artifact carried no `file`, so
       catalog.php could not resolve the page from the artifact; provenance.mjs writes it
       and uses it to cross-check the observed build against the page on disk. */
    file: 'shortcircuit.html',
    benchmark_id: REF.benchmark_id,
    run_at,
    independent_validation: false,
    statement: 'Author-run benchmark harness against an independent Python implementation of '
      + 'the cited IEC 60909-0:2016 analytical sequence-fault equations. It is benchmark '
      + 'evidence, not independent validation and not an equation-by-equation verification of '
      + 'the 2026 edition delta.',
    reference: REF.reference,
    reference_citations: REF.citations,
    tolerance: REF.tolerance,
    graded_quantities: REF.graded_quantities,
    environment: 'Chromium (Playwright) on Linux, http origin ' + BASE + ', ?lang=en. Every '
      + 'graded number read as a double from Diagram.record.build().outputs. The page solves '
      + 'each sequence network with diagram-compute ' + computeVersion + ' (ComplexSparseLU); '
      + 'the last bits of a driving-point impedance belong to that backend, not to the page. '
      + 'Reference generated by python 3, standard library only '
      + '(bench-src/ref/gen_shortcircuit.py).',
    compute_backend_version: computeVersion,
    driver: 'bench-src/run_shortcircuit.mjs',
    not_benchmarked: REF.not_benchmarked,
    run_notes: [
      'Driven through the page\'s own permalink codec; every graded number read from '
      + 'Diagram.record.build().outputs at full precision, no printed string graded.',
      'Two ungraded readers of the same page are recorded per case: the page\'s handoff set '
      + 'for the case and fault type, which re-solves the state inside the page, and the four '
      + 'printed tiles (Ik\'\', ip, Ith to 3 decimals in kA and kappa to 4). The residual '
      + 'current and the thermal factor m have no printed surface on this page.',
      'RULE 3: ' + control.inputs_asserted_field_reads + ' input field reads asserted against '
      + 'the case before any output was read; a case whose inputs did not land is failed.',
    ],
    cases: results.length,
    passed,
    failed: results.length - passed,
    graded_quantity_count: results.length * GRADED.length,
    positive_control: control,
    page_errors: pageErrors,
    results,
  };

  fs.writeFileSync(OUT, JSON.stringify(stampProvenance(artifact, { build: BUILD, ...PROVENANCE }), null, 1));

  for (const r of results) {
    if (!r.passed) {
      const badq = GRADED.filter((k) => r.absolute_error[k] > tolFor(k, r.reference[k]))
        .map((k) => `${k}: got ${r.tool[k]} ref ${r.reference[k]} abs ${r.absolute_error[k].toExponential(3)}`);
      console.log('FAIL ' + r.id + '\n      ' + badq.join('\n      '));
    }
  }
  console.log(`shortcircuit: ${passed}/${results.length} cases passed, `
    + `${results.length * GRADED.length} graded quantities, ${pageErrors.length} page errors`);
  console.log(`build observed: ${BUILD}; run_at ${run_at}; out ${OUT}`);
  console.log(`positive control: |Z1| ${control.perturbation.from} -> ${control.perturbation.to}: `
    + `Ik ${control.before.Ik_A} -> ${control.after.Ik_A} (doubling residual `
    + `${control.currents_doubled_rel.toExponential(2)}), kappa unchanged=${control.kappa_unchanged}; `
    + `Tk 1 -> 0.05 s moved m and Ith only=${control.thermal_only}`);
  process.exit(passed === results.length && pageErrors.length === 0 ? 0 : 1);
}
main();
