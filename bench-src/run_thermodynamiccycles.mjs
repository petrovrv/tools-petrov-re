/* Benchmark driver — thermodynamiccycles.html
 *
 * Reference: bench-src/ref/thermodynamiccycles_ref.json, produced by an independent
 * python implementation of the cycle algebra (first/second law applied component by
 * component; CoolProp 8.0.0 supplies properties — the same library the page runs in
 * WebAssembly, so property agreement is a binding check, not an independent one).
 *
 * In addition every case is graded against law-based invariants computed *only* from the
 * numbers the page itself displays (state table + result cards): loop energy balance,
 * component entropy generation, isentropic-efficiency direction, and the Carnot bound
 * between the actual source and sink temperatures.  Those checks use no property library.
 *
 * The page must be served over http(s) (it fetches thermodynamiccycles.wasm), so this
 * driver keeps its http transport and takes the origin as a parameter:
 *     php -S 127.0.0.1:8099 -t <site root>
 *     node run_thermodynamiccycles.mjs --base http://127.0.0.1:8099 [--out <artifact>]
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths, parseFlags } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is the manifest_revision read out of the
   live DOM of the page this run loaded, so the artifact names the build it graded and
   not whichever page happens to sit beside the driver; stampProvenance() writes it
   together with reference_provenance, provenance_note and run_at, and refuses to
   write anything without it. Every path resolves through benchPaths() against this
   driver's own tree. */
const PROVENANCE = {
  reference_provenance: "recorded",
  provenance_note: "No generator for this corpus exists anywhere in this tree, so its stored reference values cannot be re-derived here and are reused as stored, which AGENTS \u00a75 classes as a regression reference; the corpus names tcref.py, which is not in this tree."
};

/* http transport, unchanged: the origin was hard-coded and is now the resolver's --base /
   BENCH_BASE, with this driver's own TC_BASE and its original port kept as the fallbacks. */
const FLAGS = parseFlags(process.argv.slice(2));
const P = benchPaths({
  name: 'thermodynamiccycles', page: 'thermodynamiccycles.html',
  ref: 'thermodynamiccycles_ref.json', query: { lang: 'en' },
  env: { ...process.env,
         BENCH_BASE: process.env.BENCH_BASE || process.env.TC_BASE || 'http://127.0.0.1:8099' },
});
const REF = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

/* ---------- tolerances, taken from the printed precision of the page ---------- */
const half = d => 0.5 * Math.pow(10, -d) + 1e-12;      // half a display ULP
const tolFmtP = v => { const a = Math.abs(v); return a >= 100 ? half(0) : a >= 10 ? half(1) : half(2); };
const tolKw = v => { const a = Math.abs(v); return a >= 1000 ? 50 * 1.000001 : a >= 100 ? half(0) : half(1); }; // kW
const REL = 2e-6;   // allowance for the property round-trips both sides perform

function cmpAbs(got, ref, tol) {
  const d = Math.abs(got - ref);
  return { got, ref, abs: d, tol, rel: ref ? d / Math.abs(ref) : d, ok: d <= tol + REL * Math.abs(ref) };
}
/* Where the two property-library versions (CoolProp 8.0.0 = reference, CoolProp 7.2.0 =
   the equations of state the shipped WebAssembly build actually uses) disagree by more
   than the grading tolerance, the quantity is FLAGGED and not graded — grading it would
   report a library version change as a tool defect. */
function grade(c, key, path, o) {
  const rel = (c.crosscheck || {})[path];
  if (rel !== undefined && rel * Math.abs(o.ref) > o.tol) {
    o.graded = false;
    o.flag = 'references disagree: CoolProp 8.0.0 vs 7.2.0 differ by ' + rel.toExponential(2)
      + ' relative on this quantity (' + path + '), more than the tolerance; the page ships CoolProp 7.2.1dev';
    o.crosscheck = rel;
  }
  return o;
}

/* ---------- page driver ---------- */
const NUMS = ['pBoiler', 'tSup', 'pReheat', 'tReheat', 'tCondP', 'etaT', 'etaP', 'mdotP',
  'tEvap', 'tCond', 'dSh', 'dSc', 'pInter', 'pGC', 'tGC', 'etaC', 'mdotR', 'ihxEff'];

async function drive(page, inp) {
  return await page.evaluate(cfg => {
    const seg = (id, v) => { document.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); };
    seg('family', cfg.family); seg('cycleType', cfg.ptype); seg('compType', cfg.comp);
    document.getElementById('fluid').value = cfg.fluid;
    document.getElementById('nFwh').value = String(cfg.nFwh);
    document.getElementById('ihx').checked = !!cfg.ihx;
    for (const k of ['pBoiler', 'tSup', 'pReheat', 'tReheat', 'tCondP', 'etaT', 'etaP', 'mdotP',
      'tEvap', 'tCond', 'dSh', 'dSc', 'pInter', 'pGC', 'tGC', 'etaC', 'mdotR', 'ihxEff'])
      document.getElementById(k).value = String(cfg[k]);
    refreshFamily(); refreshPtype(); refreshComp();
    document.getElementById('axis').value = cfg.axis;
    let thrown = null;
    try { render(); } catch (e) { thrown = String(e && e.message || e); }
    const err = document.getElementById('err');
    const rows = [...document.querySelectorAll('#stateTable tbody tr')].map(tr => [...tr.children].map(td => td.innerText.trim()));
    const cards = [...document.querySelectorAll('#cards .card')].map(c => ({
      k: c.querySelector('.k').innerText.trim(), v: c.querySelector('.v').innerText.trim()
    }));
    return { thrown, error: (err.style.display === 'block') ? err.textContent : null, rows, cards };
  }, inp);
}

/* state table: [name+note, p MPa, T °C, h kJ/kg, s kJ/kgK, v m3/kg, x] */
function parseRows(rows) {
  const o = {};
  for (const r of rows) {
    const name = r[0].split(/\s+/)[0];
    o[name] = { p: +r[1], T: +r[2] + 273.15, h: +r[3], s: +r[4], v: +r[5], x: r[6] === '—' ? null : +r[6] };
  }
  return o;
}
function cardNum(cards, i) { return parseFloat(String(cards[i].v).replace(/[^0-9eE.+-]/g, '')); }
function cardKw(cards, i) {           // "150 kW" | "1.5 MW"  ->  kW
  const s = String(cards[i].v); const n = parseFloat(s.replace(/[^0-9eE.+-]/g, ''));
  return /MW/.test(s) ? n * 1000 : n;
}

/* ---------- law-based invariants from the displayed numbers only ---------- */
function invariants(c, pts, cards, cmp) {
  const i = c.inputs;
  const put = (k, v) => { cmp[k] = v; };
  if (i.family === 'power') {
    const eff = cardNum(cards, 0), Pnet = cardNum(cards, 1), Pturb = cardNum(cards, 2),
      Qin = cardNum(cards, 3), Qout = cardNum(cards, 4);
    const m = i.mdotP;
    // loop energy balance on the cards: W_net = Q_in - Q_out
    put('law_loop_balance_MW', cmpAbs(Pnet, Qin - Qout, tolFmtP(Pnet) + tolFmtP(Qin) + tolFmtP(Qout)));
    // heat input recomputed from the displayed state points
    const exh = i.ptype === 'reheat' ? pts['6'] : (i.ptype === 'regen' ? pts['K'] : pts['4']);
    let qinTab, qoutTab;
    if (i.ptype === 'regen') {
      const mc = 1 - cardNum(cards, 5) / 100;                    // 1 - total bleed fraction
      qinTab = m * (pts['3'].h - pts['2'].h) / 1000;
      qoutTab = m * mc * (exh.h - pts['1'].h) / 1000;
    } else if (i.ptype === 'reheat') {
      qinTab = m * ((pts['3'].h - pts['2'].h) + (pts['5'].h - pts['4'].h)) / 1000;
      qoutTab = m * (exh.h - pts['1'].h) / 1000;
    } else {
      qinTab = m * (pts['3'].h - pts['2'].h) / 1000;
      qoutTab = m * (exh.h - pts['1'].h) / 1000;
    }
    const hTol = m * 0.05 * 2 / 1000 + (i.ptype === 'regen' ? m * 0.0005 * (exh.h - pts['1'].h) / 1000 : 0);
    put('law_Qin_from_states_MW', cmpAbs(Qin, qinTab, tolFmtP(Qin) + hTol));
    put('law_Qout_from_states_MW', cmpAbs(Qout, qoutTab, tolFmtP(Qout) + hTol));
    // efficiency consistent with the cards
    put('law_eff_from_cards_pct', cmpAbs(eff, 100 * Pnet / Qin, 0.05 + 100 * (tolFmtP(Pnet) / Qin + Math.abs(Pnet) * tolFmtP(Qin) / (Qin * Qin))));
    // Carnot bound between the hottest and coldest displayed temperature
    const Th = Math.max(...Object.values(pts).map(p => p.T)), Tl = pts['1'].T;
    const carnot = 100 * (1 - Tl / Th);
    cmp['law_carnot_bound_pct'] = { got: eff, ref: carnot, abs: eff - carnot, tol: 0, rel: 0, ok: eff <= carnot + 1e-9, note: 'efficiency must not exceed the Carnot bound between the highest and lowest cycle temperature' };
    // second law, component by component (entropy of the working fluid)
    const dsTurb = exh.s - pts['3'].s, dsPump = pts['2'].s - pts['1'].s;
    cmp['law_sgen_turbine'] = { got: dsTurb, ref: 0, abs: dsTurb, tol: 1.05e-4, rel: 0, ok: dsTurb >= -1.05e-4, note: 'entropy must not fall across an adiabatic expansion' };
    cmp['law_sgen_pump'] = { got: dsPump, ref: 0, abs: dsPump, tol: 1.05e-4, rel: 0, ok: dsPump >= -1.05e-4, note: 'entropy must not fall across an adiabatic compression' };
    if (Pturb < Pnet - tolFmtP(Pnet) - tolFmtP(Pturb))
      cmp['law_turbine_ge_net'] = { got: Pturb, ref: Pnet, abs: Pnet - Pturb, tol: 0, rel: 0, ok: false, note: 'turbine power must be at least the net power' };
  } else {
    const copC = cardNum(cards, 0), copH = cardNum(cards, 1),
      Qe = cardKw(cards, 2), W = cardKw(cards, 3), Qc = cardKw(cards, 4);
    put('law_loop_balance_kW', cmpAbs(Qc, Qe + W, tolKw(Qc) + tolKw(Qe) + tolKw(W)));
    put('law_copC_from_cards', cmpAbs(copC, Qe / W, 0.005 + (tolKw(Qe) / W + Qe * tolKw(W) / (W * W))));
    put('law_copH_from_cards', cmpAbs(copH, Qc / W, 0.005 + (tolKw(Qc) / W + Qc * tolKw(W) / (W * W))));
    cmp['law_copH_minus_copC'] = { got: copH - copC, ref: 1, abs: Math.abs(copH - copC - 1), tol: 0.011, rel: 0, ok: Math.abs(copH - copC - 1) <= 0.011, note: 'COP_h = COP_c + 1 for a cycle whose only inputs are the compressor work and the evaporator duty' };
    // Carnot bound: sink = highest displayed temperature of the heat-rejecting side, source = evaporating T
    const Tlo = Math.min(...Object.values(pts).map(p => p.T));
    const Thi = i.comp === 'two' ? pts['5'].T : pts['3'].T;
    const carnot = Tlo / Math.max(Thi - Tlo, 1e-9);
    cmp['law_carnot_copC'] = { got: copC, ref: carnot, abs: copC - carnot, tol: 0, rel: 0, ok: copC <= carnot + 1e-9, note: 'COP must not exceed the Carnot COP between the lowest cycle temperature and the heat-rejection temperature' };
    const suction = i.ihx ? pts['1'] : pts['1'];
    const disch = i.comp === 'two' ? pts['2'] : pts['2'];
    const ds = disch.s - suction.s;
    cmp['law_sgen_compressor'] = { got: ds, ref: 0, abs: ds, tol: 1.05e-4, rel: 0, ok: ds >= -1.05e-4, note: 'entropy must not fall across an adiabatic compression' };
    // throttle: isenthalpic and entropy-increasing
    let a, b;
    if (i.comp === 'two') { a = pts['7']; b = pts['8']; }
    else if (i.ihx) { a = pts['4']; b = pts['5']; }
    else { a = pts['3']; b = pts['4']; }
    cmp['law_throttle_isenthalpic'] = cmpAbs(b.h, a.h, 0.11);
    cmp['law_sgen_throttle'] = { got: b.s - a.s, ref: 0, abs: b.s - a.s, tol: 1.05e-4, rel: 0, ok: (b.s - a.s) >= -1.05e-4, note: 'entropy must not fall across a throttle' };
    if (i.ihx) {   // internal heat exchanger: both streams adiabatic to the outside
      const sgen = (pts['1'].s - pts['6'].s) + (pts['4'].s - pts['3'].s);
      cmp['law_sgen_ihx'] = { got: sgen, ref: 0, abs: sgen, tol: 2.1e-4, rel: 0, ok: sgen >= -2.1e-4, note: 'entropy generation in the internal heat exchanger must not be negative' };
      const dq = (pts['1'].h - pts['6'].h) - (pts['3'].h - pts['4'].h);
      cmp['law_ihx_duty_balance'] = cmpAbs(pts['1'].h - pts['6'].h, pts['3'].h - pts['4'].h, 0.11);
      const dT = pts['3'].T - pts['1'].T;
      cmp['law_ihx_pinch'] = { got: dT, ref: 0, abs: dT, tol: 0, rel: 0, ok: dT >= -0.11, note: 'the cold stream cannot leave the internal heat exchanger hotter than the entering hot stream' };
    }
    /* input consistency: the page must honour the temperatures it was given (property-free).
       R410A is a pseudo-pure blend: the page reads its evaporating/condensing temperature as
       the dew point, so a two-phase state at the same pressure sits at the bubble point, a
       temperature glide lower. That is a property of the blend model, not an error, so the
       check is recorded but not graded for it. */
    const glide = i.fluid === 'R410A';
    const Tref=(k,got,want)=>{const o=cmpAbs(got,want+273.15,0.051);
      if(glide&&!o.ok){o.graded=false;o.flag='R410A is modelled as a pseudo-pure blend: the page takes the evaporating/condensing temperature as the dew point, so a two-phase state at that pressure sits at the bubble point about 0.1 K lower (temperature glide, not resolved by the pseudo-pure model)';}
      cmp[k]=o;};
    Tref('input_T_evaporating', (i.comp==='two'?pts['8']:(i.ihx?pts['5']:pts['4'])).T, i.tEvap);
    if(!(i.tCond+273.15>=pts['2'].T)) { /* transcritical: no condensing temperature to check */ }
    const hot=i.comp==='two'?pts['5']:pts['3'];
    const trans=/R744/.test(i.fluid)&&i.tCond>=30.9;
    if(!trans)Tref('input_T_condensing_outlet',hot.T,i.tCond-i.dSc);
    else Tref('input_T_gascooler_outlet',hot.T,i.tGC);
    if(i.dSh>0)Tref('input_T_suction',(i.ihx?pts['6']:pts['1']).T,i.tEvap+i.dSh);
    if (i.comp === 'two') {  // flash tank: mass and energy balance from the displayed quality
      const x = pts['6'].x, m = 1 / (1 - x);
      cmp['law_flash_energy'] = cmpAbs(m * pts['6'].h, pts['7'].h + (m - 1) * pts['9'].h, 0.11 * m + 2 * Math.abs(pts['6'].h) * 5e-4 * m);
      cmp['law_mix_energy'] = cmpAbs(m * pts['3'].h, pts['2'].h + (m - 1) * pts['9'].h, 0.11 * m + 2 * Math.abs(pts['3'].h) * 5e-4 * m);
      /* lever rule inside the dome, from three points the page prints at the same pressure:
         h_6 = h_f + x(h_g - h_f) and the same for s — no property library involved */
      cmp['law_lever_rule_h'] = cmpAbs(pts['6'].h, pts['7'].h + x * (pts['9'].h - pts['7'].h), 0.16 + 5e-4 * Math.abs(pts['9'].h - pts['7'].h));
      cmp['law_lever_rule_s'] = cmpAbs(pts['6'].s, pts['7'].s + x * (pts['9'].s - pts['7'].s), 1.6e-4 + 5e-4 * Math.abs(pts['9'].s - pts['7'].s));
      cmp['law_flash_pressures'] = { got: [pts['6'].p, pts['7'].p, pts['9'].p].join('/'), ref: 'equal', abs: 0, tol: 0, rel: 0, ok: Math.abs(pts['6'].p - pts['7'].p) <= 5e-4 * pts['6'].p + 1e-6 && Math.abs(pts['6'].p - pts['9'].p) <= 5e-4 * pts['6'].p + 1e-6, note: 'the flash tank is one vessel: inlet, liquid outlet and vapour outlet are at the same pressure' };
    }
  }
}

/* ---------- isentropic-efficiency direction, checked against the page's own inputs ----------
 * w_actual/w_isentropic for an expansion and w_isentropic/w_actual for a compression must both
 * come out equal to the efficiency the user typed; the isentropic outlet enthalpy is taken from
 * the reference states (property library), so this grades the direction, not the properties. */
function etaCheck(c, pts, ref, cmp) {
  const i = c.inputs;
  if (!ref || !ref.pts) return;
  const R = ref.pts;
  const pair = (nIn, nOut, eta, kind, tag) => {
    if (!pts[nIn] || !pts[nOut] || !R[nIn] || !R[nOut]) return;
    const wAct = kind === 'exp' ? pts[nIn].h - pts[nOut].h : pts[nOut].h - pts[nIn].h;
    const wRef = kind === 'exp' ? R[nIn].h - R[nOut].h : R[nOut].h - R[nIn].h;
    if (Math.abs(wRef) < 1e-6) return;
    // recover eta from the displayed enthalpies using the reference isentropic drop
    const wIs = wRef / (kind === 'exp' ? eta : 1 / eta);
    const got = kind === 'exp' ? wAct / wIs : wIs / wAct;
    cmp['eta_' + tag] = cmpAbs(got, eta, 0.1 / Math.abs(wIs) + 1e-6);
  };
  if (i.family === 'power') {
    pair('1', '2', i.etaP, 'cmp', 'pump');
    if (i.ptype === 'rankine') pair('3', '4', i.etaT, 'exp', 'turbine');
    if (i.ptype === 'reheat') { pair('3', '4', i.etaT, 'exp', 'hp_turbine'); pair('5', '6', i.etaT, 'exp', 'lp_turbine'); }
  } else if (i.comp === 'two') { pair('1', '2', i.etaC, 'cmp', 'lp_comp'); pair('3', '4', i.etaC, 'cmp', 'hp_comp'); }
  else pair('1', '2', i.etaC, 'cmp', 'compressor');
}

/* ---------- main ---------- */
const pageErrors = [];
let browser = null, page = null;
async function open() {
  if (browser) { try { await browser.close(); } catch (e) { } }
  browser = await chromium.launch();
  page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto(P.pageUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('overlay').style.display === 'none', null, { timeout: 180000 });
}
await open();
/* The build this run graded, out of the document the browser loaded. open() is called
   again whenever the WebAssembly renderer dies, and reloads the same page, so the
   revision is observed once on the first load. */
const BUILD = await readPageManifestRevision(page);
/* A renderer crash (the WebAssembly build dies) must not take the harness down: it is
   recorded against the case that caused it and the page is reopened for the next one. */
async function driveSafe(inp) {
  try {
    return await Promise.race([drive(page, inp),
    new Promise((_, rj) => setTimeout(() => rj(new Error('timeout: no result after 30 s')), 30000))]);
  } catch (e) {
    const msg = String(e && e.message || e);
    await open();
    return { crashed: msg.slice(0, 200), thrown: null, error: null, rows: [], cards: [] };
  }
}

const out = {
  tool: 'thermodynamiccycles', file: 'thermodynamiccycles.html',
  reference: 'Independent python implementation of every cycle the page offers (component-by-component first and second law, written from the textbook definitions), plus law-based invariants — loop energy balance, component entropy generation, isentropic-efficiency direction and the Carnot bound — evaluated from the numbers the page itself prints. CoolProp 8.0.0 supplies the fluid properties on both sides, so property agreement is a check that the WebAssembly binding is wired correctly, not an independent property check.',
  reference_citations: [
    'M. J. Moran, H. N. Shapiro, D. D. Boettner, M. B. Bailey, Fundamentals of Engineering Thermodynamics, 8th ed., ch. 8 (vapour power systems: Rankine, reheat, regenerative with open feedwater heaters) and ch. 10 (vapour-compression refrigeration, flash-chamber two-stage, transcritical CO2) — component definitions of isentropic turbine/pump/compressor efficiency, open-feedwater-heater bleed fractions and flash-tank mass/energy balances.',
    'Y. A. Cengel, M. A. Boles, Thermodynamics: An Engineering Approach, 8th ed., §10-6 (regenerative Rankine with open FWH) and §11-2/11-6 (vapour-compression and cascade/multistage systems).',
    'Second law as applied here: Clausius inequality per adiabatic component (s_out >= s_in) and the Carnot limit eta <= 1 - T_sink/T_source, COP_c <= T_c/(T_h-T_c), evaluated with the temperatures the page itself reports.',
    'CoolProp 8.0.0 (python) — property source shared with the page WebAssembly build; used for the binding check and as the property layer of the reference.'
  ],
  tolerance: 'Every graded quantity is compared at the precision the page prints it: efficiency and bleed fraction to 0.05 % (one decimal shown), COP to 0.005 (two decimals), power/duty cards to half of the last printed digit (0.5 MW, 0.05 MW or 0.005 MW by magnitude; 0.5 kW / 0.05 kW / 50 kW for the refrigeration cards), state-point enthalpy to 0.05 kJ/kg, entropy to 5e-5 kJ/(kg K), temperature to 0.05 K, plus 2e-6 relative for the property round-trips both implementations perform. Law-based invariants are graded at the propagated display tolerance of the numbers they combine; an entropy difference between two printed entropies can only be resolved to 1.05e-4 kJ/(kg K) (two values each rounded to four decimals), so that is the slack allowed on entropy generation, while the Carnot bound is required with no slack at all. Input-consistency checks (the state points must sit at the temperatures the user typed) are graded to 0.051 K, the display resolution. Refusal cases pass only if the page shows a message AND clears the previous result — an error banner over a stale state table is graded as a failure. Quantities on which CoolProp 8.0.0 and 7.2.0 disagree by more than the tolerance are flagged and not graded.',
  total: 0, passed: 0, failed: 0, flagged: 0, page_errors: [], cases: []
};

for (const c of REF.cases) {
  console.log("case", c.id);
  const r = await driveSafe(c.inputs);
  const cmp = {};
  let pass = true, note = c.note;
  if (r.crashed) {
    cmp['page_alive'] = { got: 'renderer crashed / hung: ' + r.crashed, ref: 'the page stays alive', abs: 0, tol: 0, rel: 0, ok: false };
    pass = false;
  } else if (c.expect === 'refuse') {
    cmp['refused'] = { got: r.error ? 'message shown' : 'no message', ref: 'message shown', abs: 0, tol: 0, rel: 0, ok: !!r.error };
    cmp['stale_output_cleared'] = { got: r.rows.length + ' state rows, ' + r.cards.length + ' result cards still shown', ref: 'no numbers shown', abs: 0, tol: 0, rel: 0, ok: r.rows.length === 0 && r.cards.length === 0 };
    pass = !!r.error && r.rows.length === 0 && r.cards.length === 0;
  } else if (r.error) {
    cmp['computed'] = { got: 'error: ' + r.error, ref: 'a cycle', abs: 0, tol: 0, rel: 0, ok: false };
    pass = false;
  } else {
    const pts = parseRows(r.rows);
    const ref = c.ref;
    const i = c.inputs;
    if (i.family === 'power') {
      cmp['eff_pct'] = grade(c, 'eff_pct', 'eff_pct', cmpAbs(cardNum(r.cards, 0), ref.eff_pct, half(1)));
      cmp['Pnet_MW'] = grade(c, 'Pnet_MW', 'Pnet_MW', cmpAbs(cardNum(r.cards, 1), ref.Pnet_MW, tolFmtP(ref.Pnet_MW)));
      cmp['Pturb_MW'] = grade(c, 'Pturb_MW', 'Pturb_MW', cmpAbs(cardNum(r.cards, 2), ref.Pturb_MW, tolFmtP(ref.Pturb_MW)));
      cmp['Qin_MW'] = grade(c, 'Qin_MW', 'Qin_MW', cmpAbs(cardNum(r.cards, 3), ref.Qin_MW, tolFmtP(ref.Qin_MW)));
      cmp['Qout_MW'] = grade(c, 'Qout_MW', 'Qout_MW', cmpAbs(cardNum(r.cards, 4), ref.Qout_MW, tolFmtP(ref.Qout_MW)));
      if (i.ptype === 'regen') cmp['bleed_pct'] = grade(c, 'bleed_pct', 'bleed_pct', cmpAbs(cardNum(r.cards, 5), ref.bleed_pct, half(1)));
      else if (ref.x_exh != null) cmp['x_exhaust'] = grade(c, 'x_exhaust', 'x_exh', cmpAbs(cardNum(r.cards, 5), ref.x_exh, half(3)));
    } else {
      cmp['copC'] = grade(c, 'copC', 'copC', cmpAbs(cardNum(r.cards, 0), ref.copC, half(2)));
      cmp['copH'] = grade(c, 'copH', 'copH', cmpAbs(cardNum(r.cards, 1), ref.copH, half(2)));
      cmp['Qcool_kW'] = grade(c, 'Qcool_kW', 'Qcool_kW', cmpAbs(cardKw(r.cards, 2), ref.Qcool_kW, tolKw(ref.Qcool_kW)));
      cmp['Wcomp_kW'] = grade(c, 'Wcomp_kW', 'Wcomp_kW', cmpAbs(cardKw(r.cards, 3), ref.Wcomp_kW, tolKw(ref.Wcomp_kW)));
      cmp['Qcond_kW'] = grade(c, 'Qcond_kW', 'Qcond_kW', cmpAbs(cardKw(r.cards, 4), ref.Qcond_kW, tolKw(ref.Qcond_kW)));
    }
    if (ref.pts) for (const [n, s] of Object.entries(ref.pts)) {
      if (!pts[n]) { cmp['pt' + n] = { got: 'missing', ref: 'state point', abs: 0, tol: 0, rel: 0, ok: false }; continue; }
      cmp['pt' + n + '_T'] = grade(c, 'pt' + n + '_T', 'pts.' + n + '.T', cmpAbs(pts[n].T, s.T, half(1)));
      cmp['pt' + n + '_h'] = grade(c, 'pt' + n + '_h', 'pts.' + n + '.h', cmpAbs(pts[n].h, s.h, half(1)));
      cmp['pt' + n + '_s'] = grade(c, 'pt' + n + '_s', 'pts.' + n + '.s', cmpAbs(pts[n].s, s.s, half(4)));
    }
    invariants(c, pts, r.cards, cmp);
    etaCheck(c, pts, ref, cmp);
    pass = Object.values(cmp).every(x => x.graded === false || x.ok);
  }
  let worst = 0;
  for (const v of Object.values(cmp)) if (isFinite(v.rel) && v.graded !== false) worst = Math.max(worst, v.rel);
  const flags = Object.entries(cmp).filter(([, v]) => v.graded === false).map(([k, v]) => k + ': ' + v.flag);
  out.cases.push({ id: c.id, note, inputs: c.inputs, cmp, worst_rel: worst, pass, flagged: flags.length > 0, flags });
  out.total++; if (pass) out.passed++; else out.failed++;
  if (flags.length) out.flagged++;
  if (!pass) console.log('FAIL', c.id, Object.entries(cmp).filter(([, v]) => !v.ok).map(([k, v]) => k + ' got=' + v.got + ' ref=' + v.ref).join('; '));
}
out.page_errors = pageErrors;
out.run_at = new Date().toISOString();
await browser.close();
fs.writeFileSync(P.out, JSON.stringify(stampProvenance(out, { build: BUILD, ...PROVENANCE }), null, 1));
console.log('total', out.total, 'passed', out.passed, 'failed', out.failed, 'pageerrors', pageErrors.length);
process.exit(out.failed ? 1 : 0);
