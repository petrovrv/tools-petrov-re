#!/usr/bin/env node
/* Benchmark driver — neutron_transport.html
 *
 *   node bench-src/run_neutron_transport.mjs [--site DIR] [--ref-dir DIR] [--out FILE]
 *
 * IMPORTANT SCOPE NOTE.  The transport engine of this tool cannot be exercised in
 * this tree: it needs the server-maintained cross-section directory `neutron-data/`
 * (AGENTS.md §9) which is deliberately not deployed here.  Without it every run
 * aborts before a single history is started.  What this driver benchmarks is
 * therefore the part of the tool that does run: the material/nuclide data pipeline
 * (density model, weight->atom conversion, isotopic expansion), the shipped
 * fluence-to-dose table, the shipped source definitions, the element table, and the
 * behaviour of the page when the dataset is missing.  This is a data-integrity
 * benchmark, not a transport benchmark; see `not_benchmarked` in the artifact.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from. The build is read out of
   the live page by readPageManifestRevision() and passed to stampProvenance(), which
   writes build, manifest_revision, reference_provenance, provenance_note and run_at and
   refuses to write anything without an observed build. */
const PROVENANCE = {
  reference_provenance: "recorded",
  provenance_note: "No generator for this corpus exists anywhere in this tree, so its stored reference values cannot be re-derived here and are reused as stored, which AGENTS \u00a75 classes as a regression reference; the corpus names mkref.py, which is not in this tree."
};

/* Every path resolves relative to this driver's own tree: the site root defaults to the
   parent of bench-src, the reference directory to bench-src/ref and the artifact to
   <siteRoot>/benchmarks/neutron_transport.json, which is the file the site serves.
   --site, --ref-dir, --out and --out2 override. */
const P = benchPaths({ name: 'neutron_transport', page: 'neutron_transport.html',
                       ref: 'neutron_transport_ref.json' });
const SITE = P.siteRoot;
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));
/* The shipped data tables are read out of the deployed page itself, so the
   benchmark always grades what is actually on the site rather than a stale copy. */
function extractShipped(file) {
  const src = fs.readFileSync(file, 'utf8');
  const grab = (from, open, close) => {
    let d = 0;
    for (let j = from; j < src.length; j++) {
      if (src[j] === open) d++;
      else if (src[j] === close && --d === 0) return src.slice(from, j + 1);
    }
    throw new Error('unbalanced literal at ' + from);
  };
  const mi = src.indexOf('nameKey:"material.vacuum"');
  const ei = src.indexOf('H:{z:1,symbol:"H"');
  const di = src.indexOf('[[1e-9,6.6]');
  const si = src.indexOf('id:"cf252_sf"');
  const ni = src.indexOf('M3=[');
  if (Math.min(mi, ei, di, si, ni) < 0) throw new Error('shipped data tables not found in ' + file);
  // the source table refers to the page's Boltzmann constant by its minified name
  const N3 = Number((src.match(/N3=([0-9.e+-]+)/) || [])[1]);
  if (!isFinite(N3)) throw new Error('Boltzmann constant N3 not found in the page');
  const ev = txt => Function('N3', 'return (' + txt + ')')(N3);
  return {
    materials: ev(grab(src.lastIndexOf('[', mi), '[', ']')),
    elements: ev(grab(src.lastIndexOf('{', ei), '{', '}')),
    dose: ev(grab(di, '[', ']')),
    sources: ev(grab(src.lastIndexOf('[', si), '[', ']')),
    available_nuclides: ev(grab(src.indexOf('[', ni), '[', ']'))
  };
}
const SHIPPED = extractShipped(P.pagePath);
/* One artifact, in the directory the site serves. The driver previously wrote the same
   object twice: once into a staging directory outside any tree in this container, and
   once into the site's own benchmarks directory. The staging copy was the one no document
   named, and the resolver's default output is the published path, so only that is written.
   A second copy is written where --out2/BENCH_OUT2 asks for one. */
const OUT = P.out;
const ART = P.out2;
const PORT = 8137 + (Number(process.env.NT_PORT_OFF) || 0);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-bench-'));

const cases = [];
const pageErrors = [];
let server = null;
let BUILD = null;

function rel(got, ref) {
  if (!isFinite(got) || !isFinite(ref)) return NaN;
  if (ref === 0) return got === 0 ? 0 : Infinity;
  return Math.abs(got - ref) / Math.abs(ref);
}
function push(id, note, inputs, cmp, extra) {
  let worst = 0, pass = true, graded = 0;
  for (const k of Object.keys(cmp)) {
    const c = cmp[k];
    if (c.graded === false) continue;
    graded++;
    if (isFinite(c.rel)) worst = Math.max(worst, c.rel);
    if (!c.ok) pass = false;
  }
  cases.push(Object.assign({ id, note, inputs, cmp, worst_rel: worst, pass, graded_quantities: graded }, extra || {}));
}

/* ------------------------------------------------------------------ server */
function startServer() {
  return new Promise((res, rej) => {
    server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
      { cwd: SITE, stdio: 'ignore' });
    server.on('error', rej);
    const t0 = Date.now();
    const poll = () => fetch(`${BASE}/${P.pageFile}`).then(r => r.ok ? res() : setTimeout(poll, 100))
      .catch(() => (Date.now() - t0 > 15000) ? rej(new Error('server did not start')) : setTimeout(poll, 100));
    setTimeout(poll, 250);
  });
}

/* ------------------------------------------------------ page-driving helpers */
async function newPage(browser, lang = 'en') {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => pageErrors.push(String(e && e.message ? e.message : e)));
  await p.goto(`${BASE}/${P.pageFile}?lang=${lang}`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(900);
  /* The build this artifact names is the manifest_revision of the document the browser
     loaded, not of the file beside this driver. Read on the first page the run opens, so
     a run that opened none has no build and writes nothing. */
  if (BUILD === null) BUILD = await readPageManifestRevision(p);
  return p;
}
async function drawMaterials(p, ids) {
  await p.click('#btnClear');
  await p.waitForTimeout(250);
  const box = await p.$eval('#cv', n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const mx = box.w * 0.07, my = box.h * 0.07;      // stay inside the drawn world
  const cols = 6, rows = 5, cw = (box.w - 2 * mx) / cols, ch = (box.h - 2 * my) / rows;
  for (let i = 0; i < ids.length; i++) {
    await p.click(`#palette .swatch[data-id="${ids[i]}"]`);
    await p.click('#tools button[data-tool="rect"]');
    await p.waitForTimeout(40);
    const x = box.x + mx + (i % cols) * cw + 2, y = box.y + my + Math.floor(i / cols) * ch + 2;
    await p.mouse.move(x, y);
    await p.mouse.down();
    await p.mouse.move(x + cw - 6, y + ch - 6, { steps: 3 });
    await p.mouse.up();
    await p.waitForTimeout(70);
  }
  await p.waitForTimeout(250);
  const drawn = await p.$eval('#layers', n => n.innerText.split('\n').filter(s => s.trim()).length);
  if (drawn !== ids.length) throw new Error(`drew ${drawn} of ${ids.length} regions`);
}
async function setNum(p, id, v) {
  await p.fill('#' + id, String(v));
  await p.dispatchEvent('#' + id, 'input');
  await p.dispatchEvent('#' + id, 'change');
  await p.waitForTimeout(120);
}
async function densities(p) {
  const txt = await p.$eval('#densityInfo', n => n.innerText);
  const out = {};
  for (const part of txt.split('·')) {
    const m = part.match(/^\s*(.+?):\s*([0-9.]+)\s*g\/cm/);
    if (m) out[m[1].trim()] = parseFloat(m[2]);
  }
  return out;
}
async function reportPDF(p, file) {
  const dl = p.waitForEvent('download', { timeout: 60000 });
  await p.click('#btnReport');
  const d = await dl;
  await d.saveAs(file);
  return file;
}
function pdfText(file) {
  return execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 64 << 20 }).toString();
}

/* Parse the "Material compositions" table of the generated report.
   pdftotext renders the subscript characters of the displayed names as plain
   digits, and a long name wraps onto a second line, so names are matched on a
   normalised prefix rather than literally. */
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const norm = s => s.replace(/[₀-₉]/g, c => SUB[c]).replace(/\s+/g, ' ').trim().toLowerCase();

function parseMaterialTable(text, nameById) {
  const known = Object.entries(nameById).map(([id, nm]) => [id, norm(nm)]);
  const lines = text.split('\n');
  const out = {};
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^\s(.*?)\s{2,}(\d+\.\d{4})\s+(\d+\.\d{2})\s+(.*)$/);
    if (m) {
      const nm = norm(m[1]);
      const hit = known.filter(([, k]) => k === nm || k.startsWith(nm));
      cur = hit.length === 1 ? hit[0][0] : null;
      if (cur) out[cur] = { density: parseFloat(m[2]), T: parseFloat(m[3]), N: {}, tail: m[4] + '\n' };
      continue;
    }
    // a blank line closes the block; a wrapped row is always contiguous with it
    if (!line.trim() || /^\s*(Source definition|Run settings|Probe|Material\s{2,}Density)\b/.test(line)) { cur = null; continue; }
    if (cur) out[cur].tail += line + '\n';
  }
  for (const k of Object.keys(out)) {
    const re = /(\d{1,3}-\d{1,3})\s+([0-9]\.[0-9]+e[+-]?\d+)/g;
    let m;
    while ((m = re.exec(out[k].tail))) out[k].N[m[1]] = parseFloat(m[2]);
    delete out[k].tail;
  }
  return out;
}

/* ============================== case groups ============================== */

/* IUPAC/CIAAW conventional atomic weights, for the elements whose standard atomic
   weight is published as an interval (CIAAW, "Standard Atomic Weights", Table 2). */
const CONVENTIONAL = { H: 1.008, Li: 6.94, B: 10.81, C: 12.011, N: 14.007, O: 15.999,
  Mg: 24.305, Si: 28.085, S: 32.06, Cl: 35.45, Br: 79.904, Tl: 204.38 };

/* G1 — element table vs NIST SRD 144. */
function groupElements() {
  for (const [sym, e] of Object.entries(SHIPPED.elements)) {
    const r = REF.elements[sym];
    const cmp = {};
    cmp.z = { got: e.z, ref: r.z, rel: e.z === r.z ? 0 : 1, ok: e.z === r.z };
    const am = rel(e.atomicMass, r.atomic_mass);
    if (r.atomic_mass_interval) {
      // CIAAW publishes an interval for this element and a single "conventional
      // atomic weight" for users who need one number; the tool must carry the
      // conventional value, and it must be consistent with the composition.
      const conv = CONVENTIONAL[sym];
      const dc = rel(e.atomicMass, conv);
      cmp.atomic_mass = { got: e.atomicMass, ref: conv, rel: dc, ok: dc <= 1e-9,
        note: 'CIAAW conventional atomic weight (the standard atomic weight of this element is the interval [' +
          r.atomic_mass_interval[0] + ', ' + r.atomic_mass_interval[1] + '])' };
      cmp.atomic_mass_vs_composition = { got: e.atomicMass, ref: r.atomic_mass, rel: am, ok: am <= 1e-3,
        note: 'consistency with the abundance-weighted mean of the NIST composition' };
    } else {
      cmp.atomic_mass = { got: e.atomicMass, ref: r.atomic_mass, rel: am, ok: am <= 5e-4 };
    }
    const gotA = e.isotopes.map(i => String(i.a)).sort();
    const refA = Object.keys(r.isotopes).sort();
    const same = gotA.join(',') === refA.join(',');
    cmp.isotope_set = { got: gotA.join(','), ref: refA.join(','), rel: same ? 0 : 1, ok: same };
    let sum = 0;
    for (const iso of e.isotopes) {
      sum += iso.abundance;
      const ri = r.isotopes[String(iso.a)];
      if (!ri) { cmp['abundance_' + iso.a] = { got: iso.abundance, ref: null, rel: 1, ok: false }; continue; }
      const da = Math.abs(iso.abundance - ri.abundance);
      cmp['abundance_' + iso.a] = { got: iso.abundance, ref: ri.abundance, rel: da, ok: da <= 5e-4, absolute: true };
      const dm = rel(iso.mass, ri.mass);
      cmp['mass_' + iso.a] = { got: iso.mass, ref: ri.mass, rel: dm, ok: dm <= 2e-6 };
    }
    const ds = Math.abs(sum - 1);
    cmp.abundance_sum = { got: sum, ref: 1, rel: ds, ok: ds <= 1e-6, absolute: true };
    push('element-' + sym, 'element ' + sym + ': Z, standard atomic weight, natural isotope set, abundances and isotope masses against NIST SRD 144',
      { element: sym }, cmp, { driven: 'shipped-table' });
  }
}

/* G2 — H*(10) fluence-to-dose table vs ICRP-74 Table A.42. */
function groupDose() {
  const table = SHIPPED.dose;
  const refE = Object.values(REF.dose_h10_icrp74).map(d => d).sort((a, b) => a.E_MeV - b.E_MeV);
  const flagged = [];
  const cmp = {};
  let missing = [];
  for (const d of refE) {
    const hit = table.find(t => Math.abs(t[0] / d.E_MeV - 1) < 1e-6);
    const key = 'h10_' + d.E_MeV + 'MeV';
    if (d.spread_rel !== null && d.spread_rel > 1e-3) {
      cmp[key] = { got: hit ? hit[1] : null, ref: d.transcription_B, rel: hit ? rel(hit[1], d.transcription_B) : null,
        ok: true, graded: false, flagKind: 'reference-disagreement',
        note: 'the two transcriptions of ICRP-74 Table A.42 disagree here (' +
          d.transcription_A + ' vs ' + d.transcription_B + ' pSv cm2) — flagged, not graded' };
      flagged.push({ id: key, spread: d.spread_rel });
      continue;
    }
    if (!hit) { missing.push(d.E_MeV); cmp[key] = { got: null, ref: d.icrp74, rel: 1, ok: false, note: 'energy point absent from the shipped table' }; continue; }
    const r = rel(hit[1], d.icrp74);
    cmp[key] = { got: hit[1], ref: d.icrp74, rel: r, ok: r <= 1e-3 };
  }
  push('dose-h10-icrp74',
    'shipped neutron fluence-to-ambient-dose-equivalent table against ICRP Publication 74 (1996) Table A.42; two independent transcriptions of that table are used and points where they disagree are flagged',
    { table: 'H*(10) pSv cm2', points_shipped: table.length, points_reference: refE.length },
    cmp, { driven: 'shipped-table', flagged });
}

/* G3 — source definitions vs published parameters. */
function groupSources() {
  const byId = Object.fromEntries(SHIPPED.sources.map(s => [s.id, s]));
  for (const [id, pub] of Object.entries(REF.watt_published)) {
    const s = byId[id];
    const cmp = {};
    if (!s) { cmp.exists = { got: null, ref: id, rel: 1, ok: false }; push('source-' + id, 'missing source', {}, cmp); continue; }
    const ra = rel(s.params.a, pub.a), rb = rel(s.params.b, pub.b);
    cmp.watt_a = { got: s.params.a, ref: pub.a, rel: ra, ok: ra <= 1e-6 };
    cmp.watt_b = { got: s.params.b, ref: pub.b, rel: rb, ok: rb <= 1e-6 };
    if (pub.mean_note_MeV !== null) {
      const noteMean = (s.note.match(/mean energy ~([0-9.]+) MeV/) || [])[1];
      const rm = rel(pub.mean_closed_form_MeV, pub.mean_note_MeV);
      cmp.mean_energy_closed_form = { got: pub.mean_closed_form_MeV, ref: pub.mean_note_MeV, rel: rm, ok: rm <= 0.03,
        note: '<E> = 3a/2 + a^2 b/4 for f(E) ~ exp(-E/a) sinh(sqrt(bE)); compared with the mean energy the tool states in its own source note (' + noteMean + ' MeV)' };
      if (noteMean !== undefined) {
        const rn = rel(parseFloat(noteMean), pub.mean_closed_form_MeV);
        cmp.mean_energy_note = { got: parseFloat(noteMean), ref: pub.mean_closed_form_MeV, rel: rn, ok: rn <= 0.03 };
      }
    }
    push('source-' + id, 'Watt fission-spectrum parameters against the MCNP-5 manual Appendix H table, and the closed-form mean energy',
      { source: id }, cmp, { driven: 'shipped-table' });
  }
  for (const [id, E] of Object.entries(REF.mono_published)) {
    const s = byId[id];
    const cmp = {};
    const r = s ? rel(s.params.e, E) : 1;
    cmp.energy_MeV = { got: s ? s.params.e : null, ref: E, rel: r, ok: r <= 1e-9 };
    push('source-' + id, 'monoenergetic source energy', { source: id }, cmp, { driven: 'shipped-table' });
  }
  // Maxwellian kT
  const mx = byId['thermal_maxwellian'];
  const kT = REF.constants.kB_MeV_per_K * 293.6;
  const rk = rel(mx.params.kT, kT);
  push('source-thermal_maxwellian', 'thermal Maxwellian kT against CODATA-2018 Boltzmann constant at 293.6 K',
    { T_K: 293.6 }, { kT_MeV: { got: mx.params.kT, ref: kT, rel: rk, ok: rk <= 1e-9 } }, { driven: 'shipped-table' });
}

/* G4 — composition integrity of the shipped material table. */
function groupCompositionIntegrity() {
  for (const m of SHIPPED.materials) {
    const cmp = {};
    if (m.id === 'vacuum') {
      cmp.density = { got: m.density, ref: 0, rel: 0, ok: m.density === 0 };
      cmp.composition_empty = { got: Object.keys(m.composition).length, ref: 0, rel: 0, ok: Object.keys(m.composition).length === 0 };
      push('material-integrity-' + m.id, 'vacuum must carry no nuclides', { material: m.id }, cmp, { driven: 'shipped-table' });
      continue;
    }
    const sum = Object.values(m.composition).reduce((a, b) => a + b, 0);
    if (m.compositionType === 'weight') {
      const d = Math.abs(sum - 1);
      cmp.weight_fraction_sum = { got: sum, ref: 1, rel: d, ok: d <= 1e-6, absolute: true };
    } else {
      cmp.atom_fractions_positive = { got: sum, ref: sum, rel: 0, ok: sum > 0 };
    }
    let unknown = Object.keys(m.composition).filter(s => !SHIPPED.elements[s]);
    cmp.elements_defined = { got: unknown.join(',') || 'none', ref: 'none', rel: unknown.length ? 1 : 0, ok: unknown.length === 0 };
    let noNuclide = [];
    for (const s of Object.keys(m.composition)) {
      const z = SHIPPED.elements[s] ? SHIPPED.elements[s].z : null;
      const any = z !== null && SHIPPED.elements[s].isotopes.some(i => SHIPPED.available_nuclides.includes(z + '-' + i.a));
      if (!any) noNuclide.push(s);
    }
    cmp.every_element_has_data = { got: noNuclide.join(',') || 'none', ref: 'none', rel: noNuclide.length ? 1 : 0, ok: noNuclide.length === 0 };
    if (m.isotopics) {
      let bad = [];
      for (const [s, iso] of Object.entries(m.isotopics)) {
        const t = Object.values(iso).reduce((a, b) => a + b, 0);
        if (Math.abs(t - 1) > 1e-5) bad.push(s + ':' + t);
        for (const a of Object.keys(iso)) if (!SHIPPED.available_nuclides.includes(SHIPPED.elements[s].z + '-' + a)) bad.push(s + '-' + a + ' has no data');
      }
      cmp.isotopics_valid = { got: bad.join(';') || 'ok', ref: 'ok', rel: bad.length ? 1 : 0, ok: bad.length === 0 };
    }
    // disclosure rule: an element whose natural vector is renormalised onto less
    // than half its natural abundance must be named in the material's note
    let undisclosed = [];
    for (const s of Object.keys(m.composition)) {
      const cov = REF.isotopic_coverage[s];
      if (cov && cov.retained_natural_abundance < 0.5) {
        const note = (m.note || '').toLowerCase();
        if (!note.includes(s.toLowerCase() + '-') && !note.includes('renormalis')) undisclosed.push(s);
      }
    }
    cmp.renormalisation_disclosed = { got: undisclosed.join(',') || 'none', ref: 'none', rel: undisclosed.length ? 1 : 0, ok: undisclosed.length === 0,
      note: 'any element for which the data library carries less than half the natural isotopic vector must be named in the material note' };
    push('material-integrity-' + m.id, 'schema and disclosure integrity of the shipped material record',
      { material: m.id }, cmp, { driven: 'shipped-table' });
  }
}

/* G5 — density model, driven through the page. */
async function groupDensity(p, nameById) {
  const solidsAndConst = REF.density_cases.filter(c => c.model !== 'ideal-gas' && c.model !== 'IAPWS-95');
  const temps = [...new Set(solidsAndConst.map(c => c.T_K))].sort((a, b) => a - b);
  const ids = SHIPPED.materials.filter(m => m.density > 0 && m.category !== 'gas' && m.id !== 'water_light').map(m => m.id);
  await drawMaterials(p, ids);
  for (const T of temps) {
    await setNum(p, 'tempIn', T);
    const d = await densities(p);
    for (const c of solidsAndConst.filter(x => x.T_K === T)) {
      const nm = nameById[c.material];
      const got = d[nm];
      const cmp = {};
      const r = got === undefined ? NaN : rel(got, c.ref);
      cmp.density_g_cm3 = { got: got === undefined ? null : got, ref: c.ref, rel: r, ok: isFinite(r) && (r <= 1.2e-4 || Math.abs(got - c.ref) <= 5e-5) };
      push('density-' + c.material + '-T' + T, 'displayed density against the closed-form thermal-expansion model rho0/(1+alpha*(T-293.6))^3 implemented independently in python',
        { material: c.material, T_K: T, p_MPa: c.p_MPa, model: c.model }, cmp, { driven: 'dom' });
    }
  }
  // water and gases need pressure too
  const wgIds = ['water_light', 'air', 'argon'];
  await drawMaterials(p, wgIds);
  const tp = [...REF.density_cases.filter(c => wgIds.includes(c.material))];
  const combos = [...new Set(tp.map(c => c.T_K + '|' + c.p_MPa))];
  for (const combo of combos) {
    const [T, P] = combo.split('|').map(Number);
    await setNum(p, 'tempIn', T);
    await setNum(p, 'presIn', P);
    const d = await densities(p);
    for (const c of tp.filter(x => x.T_K === T && x.p_MPa === P)) {
      const nm = nameById[c.material];
      const got = d[nm];
      const cmp = {};
      const r = got === undefined ? NaN : rel(got, c.ref);
      // The gas branch is graded against the ideal-gas law, which is the model the
      // tool states it implements; the CoolProp real-gas value is recorded beside it
      // as the measured error of that assumption, not used to grade or to flag.
      // Water is graded against IAPWS-95 itself, which is the model the tool claims.
      const tol = c.model === 'IAPWS-95' ? 1e-3 : 1.2e-4;
      cmp.density_g_cm3 = { got: got === undefined ? null : got, ref: c.ref, rel: r,
        ok: isFinite(r) && (r <= tol || Math.abs(got - c.ref) <= 5e-5) };
      if (c.model === 'ideal-gas' && c.crosscheck_rel !== null) {
        cmp.ideal_gas_assumption_error = { got: c.crosscheck_rel, ref: 0, rel: c.crosscheck_rel,
          ok: true, graded: false,
          note: 'measured error of the ideal-gas assumption against CoolProp 8.0.0 at this state: ' +
            (c.crosscheck_rel * 100).toFixed(3) + ' %. Recorded, not graded — the ideal-gas law is what the tool says it uses.',
          flagKind: 'recorded' };
      }
      push('density-' + c.material + '-T' + T + '-p' + P,
        c.model === 'IAPWS-95'
          ? 'displayed water density against IAPWS-95 (python-iapws 1.5.5), cross-checked with CoolProp 8.0.0, both renormalised to the tabulated 0.998207 g/cm3 at the reference state'
          : 'displayed gas density against the ideal-gas law, cross-checked against CoolProp 8.0.0 real-gas density',
        { material: c.material, T_K: T, p_MPa: P, model: c.model }, cmp,
        { driven: 'dom', crosscheck: c.crosscheck_rel });
    }
  }
  await setNum(p, 'tempIn', 293.6);
  await setNum(p, 'presIn', 0.101325);
}

/* G6 — atom densities, read back out of the tool's own PDF report. */
async function groupAtomDensities(p, nameById) {
  const ids = SHIPPED.materials.filter(m => m.density > 0).map(m => m.id);
  const batches = [];
  for (let i = 0; i < ids.length; i += 10) batches.push(ids.slice(i, i + 10));
  for (let bi = 0; bi < batches.length; bi++) {
    await drawMaterials(p, batches[bi]);
    await setNum(p, 'tempIn', 293.6);
    await setNum(p, 'presIn', 0.101325);
    const f = path.join(TMP, `mat-${bi}.pdf`);
    await reportPDF(p, f);
    const tbl = parseMaterialTable(pdfText(f), nameById);
    for (const id of batches[bi]) {
      const got = tbl[id];
      const ref = REF.atom_densities[id];
      const cmp = {};
      if (!got) {
        cmp.present_in_report = { got: null, ref: 'row', rel: 1, ok: false };
        push('atomdensity-' + id, 'material row missing from the report', { material: id }, cmp, { driven: 'report-pdf' });
        continue;
      }
      // The report prints the density to four decimals, which for a gas is only two
      // significant digits, so the independently computed model density is used here
      // instead of the printed one; the density itself is graded in its own group.
      const dref = REF.density_cases.find(c => c.material === id && c.T_K === 293.6 && c.p_MPa === 0.101325);
      const rho = dref ? dref.ref : got.density;
      const refN = {};
      for (const [k, v] of Object.entries(ref.N_per_density)) refN[k] = v * rho;
      const keys = [...new Set([...Object.keys(refN), ...Object.keys(got.N)])].sort();
      for (const k of keys) {
        const g = got.N[k], r = refN[k];
        if (g === undefined) { cmp['N_' + k] = { got: null, ref: r, rel: 1, ok: false, note: 'nuclide absent from the tool output' }; continue; }
        if (r === undefined) { cmp['N_' + k] = { got: g, ref: null, rel: 1, ok: false, note: 'nuclide not expected' }; continue; }
        const rr = rel(g, r);
        cmp['N_' + k] = { got: g, ref: r, rel: rr, ok: rr <= 1e-3, unit: 'atoms/(b.cm)' };
      }
      push('atomdensity-' + id,
        'per-nuclide atom densities in the tool report against N_i = rho w_i N_A / M_i (weight input) or N_i = rho x_i N_A / Mbar (atom input), with NIST SRD 144 masses and abundances renormalised onto the nuclides the data library carries; the density used is the independently computed model density at 293.6 K and 0.101325 MPa (the report prints only four decimals, which for a gas is two significant digits)',
        { material: id, T_K: 293.6, density_printed_g_cm3: got.density, density_reference_g_cm3: rho }, cmp,
        { driven: 'report-pdf', convention_spread: ref.convention_spread_rel });
    }
  }
}

/* G9 — validity-range handling of the density model, driven through the page.
   A correlation used outside its range must be refused or flagged, never silently
   extrapolated (HARNESS.md, "what counts as a finding", item 3). */
async function groupRanges(p, nameById) {
  await drawMaterials(p, ['water_light', 'air']);
  const trials = [
    { id: 'water-superheated', material: 'water_light', T: 400, P: 0.101325,
      why: 'water at 400 K and 1 atm is superheated steam (T_sat = 373.12 K), but the page evaluates the IAPWS-95 saturated-liquid line, which is roughly 1700 times denser',
      expect: /steam|saturation|vapour|vapor|liquid/i },
    { id: 'water-clamped', material: 'water_light', T: 900, P: 0.101325,
      why: 'the water correlation is clamped at 600 K, so above it the same number is returned for every temperature',
      expect: /clamp|600|end point|limit/i },
    { id: 'gas-high-pressure', material: 'air', T: 293.6, P: 50,
      why: 'the gas branch is the ideal-gas law; at 50 MPa the compressibility factor of air is about 1.2, so the density is roughly 20 % wrong',
      expect: /ideal[- ]gas|compressibilit/i }
  ];
  for (const t of trials) {
    await setNum(p, 'tempIn', t.T);
    await setNum(p, 'presIn', t.P);
    await p.waitForTimeout(200);
    const warn = (await p.$eval('#warnings', n => n.innerText).catch(() => '')).trim();
    const hit = t.expect.test(warn);
    const cmp = {
      out_of_range_is_flagged: { got: warn.slice(0, 260) || '(no warning shown)', ref: 'a warning naming the limitation',
        rel: hit ? 0 : 1, ok: hit, note: t.why }
    };
    push('range-' + t.id, 'a density correlation used outside its stated range must say so',
      { material: t.material, T_K: t.T, p_MPa: t.P }, cmp, { driven: 'dom' });
  }
  await setNum(p, 'tempIn', 293.6);
  await setNum(p, 'presIn', 0.101325);
}

/* G7 — behaviour when the cross-section dataset is absent. */
async function groupDegradation(browser) {
  const before = pageErrors.length;
  const p = await newPage(browser);
  await p.click('#btnFast');
  await p.waitForTimeout(25000);
  const overlay = (await p.$eval('#overlayMsg', n => n.innerText).catch(() => '')).trim();
  const warn = (await p.$eval('#warnings', n => n.innerText).catch(() => '')).trim();
  const stats = await p.$eval('#stats', n => n.innerText).catch(() => '');
  const raised = pageErrors.slice(before);
  const cmp = {};
  cmp.no_uncaught_exception = { got: raised.join(' | ') || 'none', ref: 'none', rel: raised.length ? 1 : 0, ok: raised.length === 0,
    note: 'an aborted run must be reported to the user, not thrown into the console' };
  const said = /neutron-data|cross-section|nuclear data|could not|not available|missing/i.test(overlay + ' ' + warn);
  cmp.user_visible_message = { got: (overlay + ' / ' + warn).slice(0, 220), ref: 'a message naming the missing dataset', rel: said ? 0 : 1, ok: said };
  const stillLoading = /Loading nuclear data/i.test(overlay);
  cmp.no_stuck_loading_state = { got: stillLoading ? 'still says "Loading nuclear data…"' : 'cleared', ref: 'cleared', rel: stillLoading ? 1 : 0, ok: !stillLoading };
  const zero = /Histories\s*\n\s*0/.test(stats);
  cmp.no_fabricated_results = { got: zero ? 'histories 0' : stats.slice(0, 80), ref: 'histories 0', rel: zero ? 0 : 1, ok: zero };
  push('degradation-missing-dataset',
    'with neutron-data/ absent the tool must refuse the run with a message, must not throw, must not stay in a permanent loading state and must not present any tally',
    { action: 'click Fast — spectrum only', dataset: 'neutron-data/ absent' }, cmp, { driven: 'dom' });
  await p.context().close();
}

/* G8 — page loads clean, and in a second language. */
async function groupLoad(browser) {
  for (const lang of ['en', 'de']) {
    const before = pageErrors.length;
    const p = await newPage(browser, lang);
    const title = await p.$eval('#pageTitle', n => n.innerText).catch(() => '');
    const mats = await p.$$eval('#palette .swatch', n => n.length);
    const raised = pageErrors.slice(before);
    const cmp = {
      no_page_errors: { got: raised.join(' | ') || 'none', ref: 'none', rel: raised.length ? 1 : 0, ok: raised.length === 0 },
      material_palette: { got: mats, ref: SHIPPED.materials.length, rel: rel(mats, SHIPPED.materials.length), ok: mats === SHIPPED.materials.length },
      html_lang: { got: await p.evaluate(() => document.documentElement.lang), ref: lang, rel: 0, ok: (await p.evaluate(() => document.documentElement.lang)) === lang },
      title_non_empty: { got: title.slice(0, 60), ref: 'non-empty', rel: title ? 0 : 1, ok: !!title }
    };
    push('load-' + lang, 'clean load in ?lang=' + lang, { lang }, cmp, { driven: 'dom' });
    await p.context().close();
  }
}

/* ================================== main ================================== */
(async () => {
  await startServer();
  const browser = await chromium.launch();
  try {
    groupElements();
    groupDose();
    groupSources();
    groupCompositionIntegrity();

    const p = await newPage(browser);
    const nameById = await p.$$eval('#palette .swatch', ns =>
      Object.fromEntries(ns.map(n => [n.dataset.id, n.querySelector('span').textContent.trim()])));
    await groupDensity(p, nameById);
    await groupAtomDensities(p, nameById);
    await groupRanges(p, nameById);
    await p.context().close();

    await groupDegradation(browser);
    await groupLoad(browser);
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  const flagged = [], recorded = [];
  for (const c of cases) for (const [k, v] of Object.entries(c.cmp)) {
    if (v.graded !== false) continue;
    (v.flagKind === 'recorded' ? recorded : flagged).push({ case: c.id, quantity: k, reason: v.note });
  }
  const passed = cases.filter(c => c.pass).length;
  const result = {
    tool: 'neutron-transport',
    file: 'neutron_transport.html',
    reference: 'Independent references, none derived from the tool: NIST SRD 144 atomic weights and isotopic compositions, downloaded from physics.nist.gov and parsed for this benchmark; ICRP Publication 74 (1996) Table A.42 ambient dose equivalent per unit neutron fluence, taken from two independent transcriptions; IAPWS-95 water density via python-iapws 1.5.5 cross-checked with CoolProp 8.0.0; the ideal-gas law with CoolProp 8.0.0 as a real-gas cross-check; MCNP-5 manual Watt fission-spectrum constants; CODATA-2018 Boltzmann constant. PNNL-15870 Rev.1 is used as a non-graded cross-check of the material compositions.',
    reference_citations: [
      'NIST Standard Reference Database 144, "Atomic Weights and Isotopic Compositions for All Elements" (physics.nist.gov/Comp; CIAAW standard atomic weights, AME relative atomic masses), downloaded verbatim in its ASCII form and parsed for this benchmark. For the elements whose CIAAW standard atomic weight is an interval (H, Li, B, C, N, O, Mg, Si, S, Cl) the reference value is the abundance-weighted mean of the tabulated composition and the tool value is additionally required to lie inside the published interval.',
      'ICRP Publication 74 (1996), "Conversion Coefficients for use in Radiological Protection against External Radiation", Annals of the ICRP 26(3/4), Table A.42 — ambient dose equivalent H*(10) per unit neutron fluence, pSv cm2. Transcription A: SAND2009-1144 (Sandia National Laboratories, March 2009), MCNP de205/df205 card, "H*(10) neutron flux-to-dose rate conversion factor", converted from mrem/h per n cm-2 s-1 with the factor 3.6e-4 stated on the card. Transcription B: "The implications of ICRP Publication 74 for the ...", OSTI/ETDEWEB 20061540, Table 4 "Ambient Dose Equivalent per unit neutron fluence, pSv cm2, Publication 74".',
      'IAPWS R6-95 (2018), "Revised Release on the IAPWS Formulation 1995 for the Thermodynamic Properties of Ordinary Water Substance for General and Scientific Use", evaluated with python-iapws 1.5.5 and cross-checked with CoolProp 8.0.0 (HEOS::Water).',
      'X-5 Monte Carlo Team, "MCNP — A General Monte Carlo N-Particle Transport Code, Version 5", LA-UR-03-1987, Appendix H: Watt fission spectrum constants a, b for Cf-252 (sf), U-235 (thermal), U-238 (fast) and Pu-239 (thermal).',
      'CODATA 2018 recommended value of the Boltzmann constant, k = 8.617333262e-11 MeV/K (exact).',
      'PNNL-15870 Rev.1, McConn et al., "Compendium of Material Composition Data for Radiation Transport Modeling" (2011) — used as a cross-check of material densities and weight fractions, recorded but not graded.'
    ],
    tolerance: 'Chosen per quantity from the physics and from the tool\'s own printed precision, never from what makes the tool pass. Standard atomic weight: 5e-4 relative (the CIAAW value itself is quoted to 4-6 digits). Natural abundance: 5e-4 absolute. Nuclide mass: 2e-6 relative. Fluence-to-dose coefficients: 1e-3 relative, the tabulated precision of ICRP-74 Table A.42. Watt parameters: exact (1e-6 relative) because they are quoted constants; the closed-form Watt mean energy <E> = 3a/2 + a^2 b/4 is compared with the mean energy the tool states, at 3 %. Densities: 1.2e-4 relative or 5e-5 g/cm3 absolute, whichever is looser, because the tool prints four decimals in g/cm3; water is allowed 1e-3 relative, a bound derived before the run from the tool\'s own model: it evaluates the IAPWS-95 saturated-liquid line (accurate to about 1e-5) and adds a fitted isothermal compressibility kappa = 4.5e-4 (1 + 4e-5 dT^2) per MPa, which differs from the IAPWS-95 compressibility by up to ~10 % of a correction that is itself at most 0.3 % over the 0.1-5 MPa liquid region benchmarked here. Atom densities: 1e-3 relative, against the tool\'s printed five significant digits; the reference is computed with standard atomic weights, and the alternative convention (abundance-weighted nuclide masses) is recorded per material as convention_spread. Cases where the two ICRP-74 transcriptions disagree by more than the tolerance are flagged and not graded. Gas densities are graded against the ideal-gas law because that is the model the tool states it implements; the deviation of that assumption from the CoolProp real-gas density is recorded per case as ideal_gas_assumption_error and is not graded. THIS IS A DATA-INTEGRITY BENCHMARK, NOT A TRANSPORT BENCHMARK: see not_benchmarked.',
    not_benchmarked: [
      'Every transport result. The solver needs the server-maintained cross-section directory neutron-data/ (AGENTS.md §9), which is not deployed in this tree, so no history can be started and no tally exists to compare.',
      'Analytic uncollided attenuation exp(-Sigma_t x) through a slab.',
      'Total-to-uncollided buildup factors against published tabulations.',
      'k_eff for multiplying media, the one-group analytic result and the ICSBEP/Los Alamos bare-sphere criticality benchmarks. (The tool declares fission as implicit multiplication for sub-critical fixed sources only and does not report k_eff at all, so this would in any case need a new output.)',
      'Ganapol\'s analytical one-group plane-source and point-source infinite-medium benchmarks.',
      'Statistical soundness: the 1/sqrt(N) behaviour of the reported standard error, the agreement of the reported sigma with the scatter over independent seeds, per-source-neutron tally normalisation, a zero tally in a void, vacuum versus reflecting boundary conditions, and closure of the leakage + capture + fission + (n,xn) population balance.',
      'The Woodcock tracking, Doppler broadening, unresolved-resonance probability tables and bound thermal scattering that the description claims, all of which live in nsim_core.wasm and are only reachable once the data is loaded.',
      'The built-in verification sheet behind the Validation button, which reports "missing 8-16.ndl" and runs no checks.',
      'Secondary photon production. It is out of scope by declaration, not by omission: the manifest limitations and the on-page limitations paragraph both state that photons are not transported and that a gamma dose behind a shield is therefore absent, and the H*(10) dose readout is labelled as a neutron ambient dose equivalent.'
    ],
    total: cases.length,
    passed,
    failed: cases.length - passed,
    flagged_reference_disagreement: flagged,
    recorded_not_graded: recorded,
    page_errors: pageErrors,
    cases
  };
  const stamped = JSON.stringify(stampProvenance(result, { build: BUILD, ...PROVENANCE }), null, 1);
  fs.writeFileSync(OUT, stamped);
  if (ART) fs.writeFileSync(ART, stamped);
  console.log(`neutron-transport: ${passed}/${cases.length} passed, ${flagged.length} flagged, ${recorded.length} recorded-not-graded, ${pageErrors.length} page errors`);
  for (const c of cases) if (!c.pass) {
    const bad = Object.entries(c.cmp).filter(([, v]) => v.graded !== false && !v.ok)
      .map(([k, v]) => `${k}: got ${v.got} ref ${v.ref}`);
    console.log('  FAIL ' + c.id + ' :: ' + bad.slice(0, 6).join('; '));
  }
  process.exit(0);
})().catch(e => { console.error(e); if (server) server.kill(); process.exit(1); });
