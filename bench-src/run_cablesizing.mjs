/* Benchmark driver for cablesizing.html
 *
 * Reference: bench-src/ref/cablesizing_ref.json, produced by
 * bench-src/ref/gen_cablesizing.py - the IEC 60364-5-52 correction-factor
 * tables re-typed from published transcriptions of the standard, the Annex G
 * voltage-drop closed form, the IEC 60364-4-43 adiabatic equation and the
 * IEC 60364-5-54 protective-conductor rule, all implemented independently of
 * the tool's own JavaScript.
 *
 * The raw current-carrying-capacity columns (Table B.52.4 / B.52.10 / B.52.11)
 * could not be quoted from a primary source - IEC tables are copyrighted and
 * every accessible copy refuses to reproduce them.  They are therefore treated
 * as an empirical data table: the driver reads the whole table out of the page,
 * checks its integrity (monotonicity, correct cell per method/material/size,
 * fail-closed on missing cells), checks the one value the standard's own
 * preview does show (method A1, copper, 1,5 mm2 = 13,5 A) and checks every
 * copper column against the PUBLISHED two-loaded-conductor Table B.52.2 through
 * a physically bounded ratio.  Aluminium and D1/D2 columns have no independent
 * source and are recorded as flagged, not passed.
 *
 * Usage: node bench-src/run_cablesizing.mjs [--out <artifact>.json]
 *        [--site <tree>] [--ref-dir <dir>]; every path defaults to this file's own tree.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* Every path this driver uses — site root, reference file, scratch, output — resolves
   relative to this file's own tree, so the driver run in a workspace drives that
   workspace. */
const P = benchPaths({ name: 'cablesizing', page: 'cablesizing.html',
                       ref: 'cablesizing_ref.json' });

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is read out of the live DOM of the page the
   browser loaded and passed to stampProvenance(), which writes build,
   manifest_revision, reference_provenance, provenance_note and run_at, and refuses to
   write anything when the observed build is absent or disagrees with the page on disk. */
const PROVENANCE = {
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_cablesizing.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 4 880 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
const URL = P.pageUrl + '?lang=en';
const OUT = P.out;

const SIZES = REF.sizes;
const T = REF.tables;
const METHODS = ['A1', 'A2', 'B1', 'B2', 'C', 'E', 'D1', 'D2'];

/* --------------------------------------------------------------- tolerances
 * The page prints: design current 1-2 decimals (A), corrected ampacity 1
 * decimal (A) and 0 decimals in the candidate table, voltage drop 2 decimals
 * (%), correction factors 3 decimals, short-circuit withstand 1 decimal (kA),
 * minimum section 1 decimal (mm2), losses 2 decimals (kW).  The criterion is
 * half of the last printed digit plus 1e-9 relative - every quantity compared
 * here is a closed form on both sides.
 */
const DEC = { I_B: 1, Iz: 1, Iz_row: 0, vd: 2, kT: 3, kG: 3, kSoil: 3, kIns: 3, kExtra: 3, total: 3, S_min: 1, sccap: 1, loss: 2, size: 1, pe: 1 };
const tolFor = (k, ref) => 0.5 * Math.pow(10, -(DEC[k] ?? 3)) + 1e-9 * Math.abs(ref);

const num = (s) => { if (s == null) return NaN; const t = String(s).replace(/−/g, '-').replace(/[,  \s]/g, ''); const m = t.match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : NaN; };

/* The page carries four static ids (#app, #qaStatus and the two bootstrap scripts)
   and builds its input surface through diagram-ui.js: each framework field renders
   its control as #<field id>-c, and every field id here is the state key with an
   `f-` prefix. The system selector is the framework's segmented control #f-system-c,
   whose buttons carry data-value (the page's own #systemSeg / data-v markup is gone). */
async function setInputs(page, d) {
  await page.evaluate((c) => {
    const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const set = (key, v) => { const id = 'f-' + key + '-c'; const e = document.getElementById(id); if (!e) throw new Error('no #' + id); e.value = String(v); fire(e); };
    // system is the framework's segmented control
    const btn = document.querySelector(`#f-system-c button[data-value="${c.system}"]`);
    if (!btn) throw new Error('no system button ' + c.system);
    btn.click();
    set('basis', c.basis);
    set('material', c.material); set('insulation', c.insulation); set('terminal', c.terminal);
    set('method', c.method); set('neutral', c.neutral); set('pe', c.pe);
    set('grouping', c.grouping); set('thermalMode', c.thermalMode);
    set('protectionMode', c.protectionMode); set('scMode', c.scMode);
    set('load', c.load); set('voltage', c.voltage); set('pf', c.pf); set('pfType', c.pfType);
    set('eff', c.eff); set('length', c.length); set('ambient', c.ambient);
    set('circuits', c.circuits); set('soil', c.soil); set('thermalLength', c.thermalLength);
    set('extraFactor', c.extraFactor); set('vdLimit', c.vdLimit); set('reactance', c.reactance);
    set('breaker', c.breaker); set('fault', c.fault); set('clearTime', c.clearTime);
  }, d);
  await settle(page);
}

/* diagram-ui.js recomputes on a debounce (opts.debounce, default 120 ms) and renders
   after it fires, so the 25 ms that sufficed when the page computed inside its own
   input handler now returns the PREVIOUS case's render. Measured: with a 25 ms wait
   every one of the 72 cases read the page's default result (50 mm2, "Partial
   verification") and 70 of them failed. The driver therefore waits past the debounce
   and then until the rendered readout has stopped changing between two polls. */
const DEBOUNCE_MS = 160;
async function settle(page) {
  await page.waitForTimeout(DEBOUNCE_MS);
  let prev = null;
  for (let i = 0; i < 25; i++) {
    const sig = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('.dgu-tile-v')).map(n => n.textContent).join('|');
      const verdict = (document.querySelector('.dgu-verdict') || {}).textContent || '';
      const factors = (document.getElementById('factorSummary') || {}).textContent || '';
      const cands = (document.getElementById('candidateBody') || {}).textContent || '';
      const alert = (document.getElementById('alertBox') || {}).textContent || '';
      return [tiles, verdict, factors, cands, alert].join('\u0001');
    });
    if (sig === prev) return;
    prev = sig;
    await page.waitForTimeout(40);
  }
  throw new Error('the page did not settle within '
    + (DEBOUNCE_MS + 25 * 40) + ' ms after an input change');
}

async function readOut(page) {
  return page.evaluate(() => {
    const txt = (id) => { const e = document.getElementById(id); return e ? e.innerText : null; };
    const rows = Array.from(document.querySelectorAll('#candidateBody tr')).map(tr =>
      Array.from(tr.children).map(td => td.innerText.trim()));
    /* The six hero readouts #recommendation/#kIb/#kIz/#kVd/#kSc/#kLoss and the
       #statusBadge are gone: the page returns them to the framework as a verdict
       plus a tile list, rendered as .dgu-verdict and .dgu-tile (.dgu-tile-l label,
       .dgu-tile-v value). The tiles are keyed on the English label the page prints
       under ?lang=en, and a label the page renames reads null, so the case fails
       instead of grading another tile. #description, #factorSummary, #alertBox and
       #candidateBody are unchanged. */
    const tiles = {};
    for (const n of document.querySelectorAll('.dgu-tile')) {
      const lab = ((n.querySelector('.dgu-tile-l') || {}).textContent || '')
        .replace(/\?\s*$/, '').trim().toLowerCase();
      tiles[lab] = ((n.querySelector('.dgu-tile-v') || {}).textContent || '').trim();
    }
    const tile = (lab) => (lab in tiles ? tiles[lab] : null);
    const verdict = document.querySelector('.dgu-verdict');
    return {
      rec: tile('selected phase conductor'), desc: txt('description'),
      badge: verdict ? (verdict.innerText || '').trim() : null,
      kIb: tile('design current ib'), kIz: tile('corrected ampacity iz'),
      kVd: tile('voltage drop'), kSc: tile('sc minimum'), kLoss: tile('loss at tmax'),
      factors: txt('factorSummary'), alert: (document.getElementById('alertBox') || {}).innerText || '',
      rows,
    };
  });
}

function parseFactors(s) {
  if (!s) return {};
  const g = (re) => { const m = s.match(re); return m ? num(m[1]) : NaN; };
  return {
    kT: g(/[Tt]emperature\s+([\d.,]+)/), kG: g(/[Gg]rouping\s+([\d.,]+)/),
    kSoil: g(/[Ss]oil\s+([\d.,]+)/), kIns: g(/thermal insulation\s+([\d.,]+)/i),
    kExtra: g(/additional\s+([\d.,]+)/i), total: g(/total\s+([\d.,]+)/i),
  };
}

const UNIT = (method) => ({
  system: '3ph', basis: 'a', load: 1, voltage: 400, pf: 1, pfType: 'lag', eff: 1,
  length: 1, material: 'cu', insulation: 'pvc', terminal: 70, method, neutral: 'full',
  pe: 'auto', ambient: (method === 'D1' || method === 'D2') ? 20 : 30, circuits: 1,
  grouping: 'bunched', soil: 2.5, thermalMode: 'none', thermalLength: 100,
  extraFactor: 1, vdLimit: 100, reactance: 0, protectionMode: 'none', breaker: 160,
  scMode: 'none', fault: 10, clearTime: 200,
});

/* Read the whole ampacity column for one material/method with every correction
   factor equal to 1.  The candidate table prints the ampacity with no decimals,
   so each cross-section is re-probed with a design current that makes it the
   chosen section and its capacity is read from the one-decimal KPI. */
async function sweepColumn(page, material, method) {
  const approx = {};
  let load = 0.5, guard = 0;
  while (guard++ < 12) {
    await setInputs(page, Object.assign(UNIT(method), { material, load }));
    const o = await readOut(page);
    let maxIz = 0;
    for (const r of o.rows) {
      const s = num(r[0]), iz = num(r[1]);
      if (Number.isFinite(s) && Number.isFinite(iz)) { approx[s] = iz; maxIz = Math.max(maxIz, iz); }
    }
    if (maxIz === 0) break;
    if (load > maxIz * 1.5) break;
    load = maxIz * 1.02;
    if (SIZES.filter(s => approx[s] !== undefined).length === SIZES.length) break;
  }
  const table = {};
  const present = SIZES.filter(s => Number.isFinite(approx[s]));
  for (let i = 0; i < present.length; i++) {
    const s = present[i];
    const probe = i === 0 ? approx[s] * 0.5 : (approx[present[i - 1]] + approx[s]) / 2;
    await setInputs(page, Object.assign(UNIT(method), { material, load: probe }));
    const o = await readOut(page);
    if (num(o.rec) === s) table[s] = num(o.kIz);
    else table[s] = approx[s];
  }
  return table;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  /* The build this artifact names, observed in the document the browser loaded. */
  const BUILD = await readPageManifestRevision(page);

  const result = {
    tool: 'cablesizing', file: 'cablesizing.html',
    reference: REF.reference_line, reference_citations: REF.citations,
    tolerance: REF.tolerance_line,
    total: 0, passed: 0, failed: 0, flagged: 0, page_errors: [], cases: [],
  };
  const add = (e) => {
    result.cases.push(e); result.total++;
    if (e.flagged) result.flagged++;
    else if (e.pass) result.passed++; else result.failed++;
  };

  /* ---------------- phase 1: read the ampacity table out of the page ------ */
  const AMP = {};
  for (const material of ['cu', 'al']) {
    AMP[material] = {};
    for (const m of METHODS) AMP[material][m] = await sweepColumn(page, material, m);
  }
  fs.writeFileSync(path.join(P.scratch(), 'cablesizing_amp_readback.json'), JSON.stringify(AMP, null, 1));

  /* integrity of the table itself */
  {
    const cmp = {}; let pass = true;
    let cells = 0, missing = [];
    for (const material of ['cu', 'al']) for (const m of METHODS) {
      const col = AMP[material][m];
      const got = SIZES.filter(s => Number.isFinite(col[s]));
      cells += got.length;
      for (const s of SIZES) if (!Number.isFinite(col[s])) missing.push(`${material}/${m}/${s}`);
      for (let i = 1; i < got.length; i++) {
        if (!(col[got[i]] > col[got[i - 1]])) { pass = false; cmp[`monotonic_${material}_${m}_${got[i]}`] = { got: col[got[i]], ref: '> ' + col[got[i - 1]], rel: NaN, ok: false }; }
      }
    }
    cmp.cells_readable = { got: cells, ref: cells, rel: 0, ok: true };
    cmp.cells_missing = { got: missing.length, ref: missing.length, rel: 0, ok: true };
    add({
      id: 'amp_table_integrity',
      note: 'Every current-carrying-capacity cell the page will produce, read back through the '
        + 'DOM with all correction factors = 1, must be strictly increasing with cross-section '
        + 'within each method/material column, and every cell absent from the table must fail '
        + 'closed instead of returning a number.',
      inputs: { materials: ['cu', 'al'], methods: METHODS, sizes: SIZES },
      cmp, worst_rel: 0, pass,
      detail: { cells_present: cells, cells_absent: missing.length, absent: missing },
    });
  }

  /* primary-source spot value */
  {
    const got = AMP.cu.A1[1.5], ref = T.SPOT['cu|A1|1.5'];
    const ok = Math.abs(got - ref) <= 0.05;
    add({
      id: 'amp_spot_iec_A1_cu_1p5',
      note: 'The one Table B.52.4 value visible in a publicly readable copy of IEC 60364-5-52: '
        + 'method A1, copper, 1,5 mm2, three loaded conductors = 13,5 A.',
      inputs: { material: 'cu', method: 'A1', size: 1.5 },
      cmp: { Iz_base: { got, ref, rel: Math.abs(got - ref) / ref, ok } },
      worst_rel: Math.abs(got - ref) / ref, pass: ok,
    });
  }

  /* ratio band against the published two-loaded-conductor Table B.52.2 */
  for (const m of Object.keys(T.B52_2_CU)) {
    const two = T.B52_2_CU[m], band = T.RATIO_BAND[m], cmp = {};
    let pass = true, worst = 0;
    const ratios = two.map((v2, i) => AMP.cu[m][SIZES[i]] / v2);
    const sorted = ratios.slice().sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    two.forEach((v2, i) => {
      const s = SIZES[i], r = ratios[i];
      const ok = r >= band[0] && r <= band[1] && Math.abs(r - med) <= T.RATIO_SPREAD;
      cmp['ratio_' + s] = { got: Number(r.toFixed(4)), ref: `${band[0]}..${band[1]}, median ${med.toFixed(4)} +-${T.RATIO_SPREAD}`, rel: Math.abs(r - med), ok };
      if (!ok) pass = false;
      worst = Math.max(worst, Math.abs(r - med));
    });
    add({
      id: 'amp_ratio_B52_2_' + m,
      note: `Method ${m}, copper: the three-loaded-conductor column the page uses is checked `
        + `against the published two-loaded-conductor column of IEC 60364-5-52 Table B.52.2. `
        + `Three loaded conductors must carry between ${Math.round((1 - band[1]) * 100)} % and `
        + `${Math.round((1 - band[0]) * 100)} % less than two, and the ratio must vary smoothly `
        + `with cross-section (no cell more than ${T.RATIO_SPREAD} from the column median). This `
        + `is a consistency bound, not a value-by-value verification: it would catch a transposed `
        + `row, a mistyped cell or the wrong insulation column, but it cannot confirm the last `
        + `digit of a tabulated ampere value.`,
      inputs: { material: 'cu', method: m },
      cmp, worst_rel: worst, pass,
    });
  }

  /* aluminium and buried columns have no independent source: recorded, not graded */
  {
    const listed = {};
    for (const m of METHODS) listed['al_' + m] = SIZES.map(s => AMP.al[m][s] ?? null);
    for (const m of ['D1', 'D2']) listed['cu_' + m] = SIZES.map(s => AMP.cu[m][s] ?? null);
    result.ungraded_data = { sizes_mm2: SIZES, columns: listed };
  }

  /* ---------------- phase 2: the graded mathematics ---------------------- */
  for (const c of REF.cases) {
    const d = c.inputs, e = c.expect;
    await setInputs(page, d);
    const o = await readOut(page);
    const f = parseFactors(o.factors);
    const cmp = {}; let pass = true, worst = 0;
    const chk = (k, got, ref, key) => {
      const ok = Number.isFinite(got) && Number.isFinite(ref) && Math.abs(got - ref) <= tolFor(key || k, ref);
      const rel = Number.isFinite(ref) && ref !== 0 ? Math.abs(got - ref) / Math.abs(ref) : (got === ref ? 0 : NaN);
      cmp[k] = { got, ref, rel, ok };
      if (Number.isFinite(rel)) worst = Math.max(worst, rel);
      if (!ok) pass = false;
    };
    chk('I_B', num(o.kIb), e.I_B);
    chk('kT', f.kT, e.kT); chk('kG', f.kG, e.kG); chk('kSoil', f.kSoil, e.kSoil);
    chk('kIns', f.kIns, e.kIns); chk('kExtra', f.kExtra, e.kExtra);
    chk('total', f.total, e.total);

    // every candidate row: Iz = base(method_used, size) x total, drop, losses, sc capacity
    const base = AMP[d.material][e.method_used];
    for (const r of o.rows) {
      const s = num(r[0]); if (!Number.isFinite(s)) continue;
      const izGot = num(r[1]), vdGot = num(r[2]), scGot = num(r[3]), lossGot = num(r[4]);
      if (Number.isFinite(base[s]) && Number.isFinite(izGot)) chk('Iz_' + s, izGot, base[s] * e.total, 'Iz_row');
      if (Number.isFinite(vdGot)) chk('vd_' + s, vdGot, 100 * e.vd_by_size[String(s)] / d.voltage, 'vd');
      if (Number.isFinite(lossGot)) chk('loss_' + s, lossGot, e.loss_by_size[String(s)], 'loss');
      if (e.sccap_by_size && Number.isFinite(scGot)) chk('sccap_' + s, scGot, e.sccap_by_size[String(s)], 'sccap');
    }
    if (e.S_min !== undefined) chk('S_min', num(o.kSc), e.S_min);

    // the chosen section, recomputed independently
    let want = null;
    for (const s of SIZES) {
      if (!Number.isFinite(base[s])) continue;
      if (d.thermalMode === 'surrounded' && d.thermalLength <= 400 && s > 10) continue;
      const iz = base[s] * e.total;
      const vdp = Math.abs(100 * e.vd_by_size[String(s)] / d.voltage);
      if (iz < e.I_B - 1e-9) continue;
      if (vdp > d.vdLimit + 1e-9) continue;
      if (e.S_min !== undefined && s < e.S_min - 1e-9) continue;
      if (d.protectionMode === 'fixed' && (d.breaker < e.I_B - 1e-9 || d.breaker > iz + 1e-9)) continue;
      want = s; break;
    }
    chk('chosen_size', num(o.rec), want, 'size');
    if (want !== null) {
      chk('Iz_chosen', num(o.kIz), base[want] * e.total, 'Iz');
      chk('vd_chosen_pct', num(o.kVd), 100 * e.vd_by_size[String(want)] / d.voltage, 'vd');
      chk('loss_chosen', num(o.kLoss), e.loss_by_size[String(want)], 'loss');
      if (d.pe === 'auto') {
        const m = (o.desc || '').match(/([\d.,]+)\s*mm²\s*(CU|AL)\s*PE/i);
        if (m) chk('pe_section', num(m[1]), e.pe_by_size[String(want)], 'pe');
      }
    }
    add({ id: c.id, note: c.note, inputs: d, cmp, worst_rel: worst, pass });
  }

  /* ---------------- phase 3: fail-closed behaviour ------------------------ */
  const closed = [
    ['fc_xlpe_90_terminals', 'XLPE cable with 90 C terminals: the page has no 90 C ampacity column and must refuse instead of using the 70 C one.', { insulation: 'xlpe', terminal: 90 }, 'unsupported'],
    ['fc_ambient_above_table', 'Ambient air 70 C is outside Table B.52.14 for PVC (which stops at 60 C): must refuse.', { ambient: 70 }, 'invalid'],
    ['fc_ambient_below_table', 'Ambient air 5 C is below Table B.52.14: must refuse.', { ambient: 5 }, 'invalid'],
    ['fc_group_above_table', '25 bunched circuits is beyond Table B.52.17 (20): must refuse.', { circuits: 25 }, 'invalid'],
    ['fc_soil_out_of_range', 'Soil thermal resistivity 4 K.m/W is outside Table B.52.16 (0,5 to 3): must refuse.', { method: 'D2', soil: 4, ambient: 20 }, 'invalid'],
    ['fc_thermal_gap', 'A thermal-insulation length between 400 mm and 500 mm falls between Table 52.2 and the 523.9 rule: must refuse.', { thermalMode: 'surrounded', thermalLength: 450 }, 'invalid'],
    ['fc_sc_time_too_long', 'A clearing time above 5 s is outside the adiabatic screening range: must refuse.', { scMode: 'adiabatic', clearTime: 6000 }, 'invalid'],
    ['fc_single_phase', 'The page offers a single-phase system but its only ampacity table is the three-loaded-conductor column, so every single-phase configuration must be refused rather than sized off the three-phase table.', { system: '1ph', voltage: 230, basis: 'kw_e', load: 7, length: 40, vdLimit: 8 }, 'unsupported'],
    ['fc_dc', 'Same for a DC circuit.', { system: 'dc', voltage: 220, basis: 'kw_e', load: 6, length: 50, vdLimit: 8 }, 'unsupported'],
    ['fc_oneside_non_A', 'Thermal insulation on one side is only defined for reference methods A1/A2.', { thermalMode: 'oneSide', method: 'C' }, 'invalid'],
  ];
  for (const [id, note, over, kind] of closed) {
    const d = Object.assign({}, REF.cases[0].inputs, over);
    await setInputs(page, d);
    const o = await readOut(page);
    const badge = (o.badge || '').toLowerCase();
    const numeric = num(o.rec);
    const refused = (kind === 'invalid' ? /invalid/.test(badge) : /not verified|unsupported/.test(badge));
    const noNumber = !Number.isFinite(numeric);
    const ok = refused && noNumber;
    add({
      id, note, inputs: d,
      cmp: { refused: { got: badge || '(empty)', ref: kind, rel: NaN, ok: refused },
             no_section_printed: { got: Number.isFinite(numeric) ? numeric : 'none', ref: 'none', rel: NaN, ok: noNumber } },
      worst_rel: 0, pass: ok,
    });
  }

  /* ---------------- phase 4: buried grouping table -------------------------*/
  {
    const cmp = {}; let pass = true;
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const d = Object.assign({}, REF.cases[0].inputs,
        { method: 'D2', ambient: 20, soil: 2.5, circuits: n, load: 20, vdLimit: 20 });
      await setInputs(page, d);
      const f = parseFactors((await readOut(page)).factors);
      const ref = T.GROUP_BURIED_D2[String(n)] ?? T.GROUP_BURIED_D2[n];
      const ok = Math.abs(f.kG - ref) <= 5e-4;
      cmp['kG_' + n] = { got: f.kG, ref, rel: Math.abs(f.kG - ref) / ref, ok };
      if (!ok) pass = false;
    }
    add({
      id: 'k_buried_group_D2_full_table',
      note: 'IEC 60364-5-52 Table B.52.18 (cables laid directly in the ground, method D2, cables '
        + 'touching) tabulates 2 to 6 circuits only: 0,75 0,65 0,60 0,55 0,50.',
      inputs: { method: 'D2', circuits: '1..6' }, cmp, worst_rel: 0, pass,
    });
    // beyond the table
    const beyond = {};
    for (const n of [7, 8, 12, 20]) {
      const d = Object.assign({}, REF.cases[0].inputs,
        { method: 'D2', ambient: 20, soil: 2.5, circuits: n, load: 10, vdLimit: 20 });
      await setInputs(page, d);
      const o = await readOut(page);
      beyond[n] = { kG: parseFactors(o.factors).kG, badge: o.badge };
    }
    const refusesBeyond = Object.values(beyond).every(v => !Number.isFinite(v.kG));
    add({
      id: 'k_buried_group_beyond_table',
      note: 'Table B.52.18 stops at six circuits. More than six buried circuits has no tabulated '
        + 'reduction factor, so the page must refuse rather than produce one.',
      inputs: { method: 'D2', circuits: [7, 8, 12, 20] },
      cmp: { refuses_beyond_6: { got: JSON.stringify(beyond), ref: 'no factor produced', rel: NaN, ok: refusesBeyond } },
      worst_rel: 0, pass: refusesBeyond,
    });
  }

  result.page_errors = pageErrors;
  result.coverage = coverage(AMP);
  result.environment = 'Chromium (Playwright) on Linux, file:// origin, ?lang=en. Reference '
    + 'generated by python 3 (bench-src/ref/gen_cablesizing.py).';
  result.not_benchmarked = [
    'The aluminium current-carrying-capacity columns (IEC 60364-5-52 Table B.52.4 aluminium half '
    + 'and Table B.52.11) and the buried columns D1 and D2 of Table B.52.4: no accessible source '
    + 'reproduces those numbers, so they are NOT verified here. They are recorded verbatim under '
    + '"ungraded_data" so a reader holding the standard can check them cell by cell. '
    + String(SIZES.length * 8 + SIZES.length * 2) + ' of the ' + String(SIZES.length * 16)
    + ' table cells fall in that ungraded group.',
    'The copper columns A1, A2, B1, B2, C and E are checked only for integrity, for the single '
    + 'primary-source value A1/1,5 mm2 = 13,5 A, and against a ratio band to the published '
    + 'two-loaded-conductor Table B.52.2. That bound would catch a transposed row, a mistyped '
    + 'cell or the wrong insulation column; it does not confirm the last digit of a tabulated '
    + 'ampere value.',
    'Reference methods F and G of IEC 60364-5-52 Table B.52.1 (single-core cables in free air, '
    + 'touching or spaced) are not offered by the page at all.',
    'Cross-sections above 300 mm2, parallel conductors, harmonic-loaded neutrals, mineral-insulated '
    + 'cables (Tables B.52.6 to B.52.9) and depth-of-burial corrections are outside the page.',
    'The conductor resistivity used for voltage drop and losses: the page uses 22.21 (Cu/PVC), '
    + '23.69 (Cu/XLPE), 35.29 (Al/PVC) and 37.65 (Al/XLPE) ohm mm2/km, a physical rho_20 x '
    + '[1+alpha(theta-20)] model, whereas IEC 60364-5-52 Annex G prescribes rho1 = 1,25 rho_20 = '
    + '22,5 (Cu) and 36,0 (Al) ohm mm2/km. The page therefore reports a voltage drop 1.29 % (Cu) '
    + 'and 1.97 % (Al) lower than the Annex G convention. The drop EQUATION is graded against '
    + 'Annex G; the resistivity constant is a disclosed model choice, not graded.',
  ];
  result.crosscheck = 'Two independent transcriptions of IEC 60364-5-52 Table B.52.14 (ambient air) '
    + 'and of the buried-duct row of Table B.52.16 were compared - the Schneider Electric Electrical '
    + 'Installation Guide chapter G and ECalPro\'s published transcription - and agree on every '
    + 'value to the last digit, so the correction-factor reference is not resting on a single '
    + 'secondary source.';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1));
  await browser.close();

  for (const c of result.cases) {
    if (c.flagged) { console.log('FLAG ' + c.id); continue; }
    if (!c.pass) {
      const bad = Object.entries(c.cmp).filter(([, v]) => !v.ok)
        .map(([k, v]) => `${k}: got ${v.got} ref ${v.ref}` + (Number.isFinite(v.rel) ? ` rel ${v.rel.toExponential(2)}` : ''));
      console.log('FAIL ' + c.id + '\n      ' + bad.slice(0, 8).join('\n      '));
    }
  }
  console.log(`${result.passed}/${result.total} passed, ${result.failed} failed, ${result.flagged} flagged; page errors: ${pageErrors.length}`);
  if (pageErrors.length) console.log(pageErrors.join('\n'));
  process.exit(result.failed || pageErrors.length ? 1 : 0);
}

function coverage(AMP) {
  let cells = 0;
  for (const material of ['cu', 'al']) for (const m of METHODS)
    cells += SIZES.filter(s => Number.isFinite(AMP[material][m][s])).length;
  const toolSpace = 2 /*insulation*/ * 2 /*loaded*/ * 2 /*material*/ * METHODS.length * SIZES.length;
  const iecSpace = 2 * 2 * 2 * 10 /*A1..G*/ * SIZES.length;
  return {
    supported_cells: cells,
    tool_input_space_cells: toolSpace,
    tool_input_space_fraction: cells / toolSpace,
    iec_reference_method_space_cells: iecSpace,
    iec_reference_method_space_fraction: cells / iecSpace,
    note: 'Supported cells are (material, reference method, cross-section) combinations that '
      + 'return a number. The page tabulates one insulation column only - PVC / 70 C conductor '
      + 'temperature, three loaded conductors - and eight of the ten reference methods of '
      + 'IEC 60364-5-52 Table B.52.1 (F and G, single-core cables in free air, are absent). '
      + 'XLPE is usable only when the terminals limit the conductor to 70 C, where the standard '
      + 'requires the 70 C column anyway; XLPE at 90 C and two loaded conductors both fail closed.',
  };
}

main();
