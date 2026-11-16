/* ogh-h2use.js - Oil, Gas & Hydrogen package: hydrogen use tools
 * h2_ng_blending (EN 16726:2015+A1:2018, ISO 6976:2016), lcoh_rfnbo (EU DA 2023/1184, 2023/1185),
 * h2_carriers_compare, hrs_refuelling (SAE J2601:2020), h2_fuel_conversion (ISO 14687:2019)
 * Assembled mechanically from chunks in _ogh/h2use/ (blend: Claude; lcoh and later: Claude, run12). Needs ogh-core.js.
 */
(function (root) {
  'use strict';
  var OGH = root.OGH = root.OGH || {};
  var C = OGH.core || (typeof require === 'function' ? require('./ogh-core.js') : null);
  if (!OGH.core && C) OGH.core = C;

  var H2B_DEFAULTS = { ch4:0.90, c2h6:0.05, c3h8:0.01, n2:0.02, co2:0.02, xH2:0.10, tComb:15, tMeter:15, E_MW:100, WsMin:46.44, WsMax:54.00, dMin:0.555, dMax:0.700, xH2Lim:0.20 };
  var H2B_PRESETS = {
    richNG: { label:'Rich NG (high C2+), 10 % H2', inputs:{ ch4:0.85, c2h6:0.09, c3h8:0.03, n2:0.01, co2:0.02, xH2:0.10 } },
    leanNG: { label:'Lean NG (high CH4), 10 % H2', inputs:{ ch4:0.965, c2h6:0.02, c3h8:0.005, n2:0.005, co2:0.005, xH2:0.10 } },
    lgas: { label:'Groningen-like L-gas (N2 14 %), 5 % H2', inputs:{ ch4:0.81, c2h6:0.03, c3h8:0.005, n2:0.14, co2:0.015, xH2:0.05 } },
    high30: { label:'High blend 30 % H2 (default NG)', inputs:{ ch4:0.90, c2h6:0.05, c3h8:0.01, n2:0.02, co2:0.02, xH2:0.30 } }
  };
  var H2B_IDS = ['ch4', 'c2h6', 'c3h8', 'n2', 'co2'];
  function h2bMix(inp, x) {
    var s = 0, i, c = {};
    for (i = 0; i < H2B_IDS.length; i++) { s += Number(inp[H2B_IDS[i]]) || 0; }
    for (i = 0; i < H2B_IDS.length; i++) { c[H2B_IDS[i]] = (s > 0 ? (Number(inp[H2B_IDS[i]]) || 0) / s : 0) * (1 - x); }
    c.h2 = x;
    return c;
  }
  function h2bMaxX(g, lim) {
    var lo = 0, hi = 0.99, m, i;
    if (g(0) < lim) { return 0; }
    if (g(0.99) >= lim) { return 0.99; }
    for (i = 0; i < 60; i++) { m = 0.5 * (lo + hi); if (g(m) >= lim) { lo = m; } else { hi = m; } }
    return lo;
  }
  function h2bSub(r, st) {
    return { M:r.M, Z:r.Z, rho:r.rho, d:r.d, Hs_vol:r.Hs_vol, Hi_vol:r.Hi_vol, Hs_mass:r.Hs_mass, Hi_mass:r.Hi_mass,
      Ws:r.Ws, Wi:r.Wi, kgCO2_per_GJ_HHV:st.kgCO2_per_GJ_HHV, kgCO2_per_GJ_LHV:st.kgCO2_per_GJ_LHV };
  }
  function h2bSolve(inp) {
    var p = {}, k, i, s = 0, err = null, w = [], o, ng, bl, sng, sbl, h2, r = {};
    for (k in H2B_DEFAULTS) { if (H2B_DEFAULTS.hasOwnProperty(k)) { p[k] = H2B_DEFAULTS[k]; } }
    if (inp) { for (k in inp) { if (inp.hasOwnProperty(k) && inp[k] !== null && inp[k] !== undefined && inp[k] !== '') { p[k] = Number(inp[k]); } } }
    for (i = 0; i < H2B_IDS.length && !err; i++) {
      if (!isFinite(p[H2B_IDS[i]]) || p[H2B_IDS[i]] < 0) { err = 'Mole fraction ' + H2B_IDS[i] + ' must be a number >= 0'; }
      s += p[H2B_IDS[i]];
    }
    if (!err && !(s > 0)) { err = 'Natural-gas composition must have a positive sum'; }
    if (!err && !(p.xH2 >= 0 && p.xH2 < 1)) { err = 'xH2 must be in [0, 1)'; }
    if (!err && !(p.E_MW > 0)) { err = 'E_MW must be > 0'; }
    if (!err && !(p.WsMin < p.WsMax)) { err = 'WsMin must be < WsMax'; }
    if (!err && !(p.dMin < p.dMax)) { err = 'dMin must be < dMax'; }
    if (!err && !(p.xH2Lim >= 0 && p.xH2Lim <= 1)) { err = 'xH2Lim must be in [0, 1]'; }
    if (!err && !(isFinite(p.tComb) && isFinite(p.tMeter))) { err = 'tComb and tMeter must be numbers'; }
    if (err) { return { ok:false, error:err, warnings:[] }; }
    o = { tComb:p.tComb, tMeter:p.tMeter };
    function pr(x) { return C.fuel.props(h2bMix(p, x), o); }
    function addW(a) { if (typeof a === 'string') { a = [a]; } for (var j = 0; a && j < a.length; j++) { if (w.indexOf(a[j]) < 0) { w.push(a[j]); } } }
    try {
      ng = pr(0); bl = pr(p.xH2);
      if (!ng.ok || !bl.ok) { return { ok:false, error:'Property calculation returned not ok', warnings:(ng.warnings || []).concat(bl.warnings || []) }; }
      sng = C.fuel.stoich(h2bMix(p, 0), o); sbl = C.fuel.stoich(h2bMix(p, p.xH2), o);
      h2 = C.fuel.props({ h2:1 }, o);
      addW(ng.warnings); addW(bl.warnings);
      r.xH2max_W = h2bMaxX(function (x) { return pr(x).Ws; }, p.WsMin);
      r.xH2max_d = h2bMaxX(function (x) { return pr(x).d; }, p.dMin);
    } catch (e) { return { ok:false, error:'Calculation failed: ' + ((e && e.message) || e), warnings:w }; }
    r.ok = true; r.inputs = p;
    r.Hs_ng = ng.Hs_vol; r.Hi_ng = ng.Hi_vol; r.Ws_ng = ng.Ws; r.Wi_ng = ng.Wi; r.d_ng = ng.d;
    r.Hs_bl = bl.Hs_vol; r.Hi_bl = bl.Hi_vol; r.Ws_bl = bl.Ws; r.Wi_bl = bl.Wi; r.d_bl = bl.d;
    r.Hs_mass_bl = bl.Hs_mass; r.Hi_mass_bl = bl.Hi_mass;
    r.dWs_pct = 100 * (r.Ws_bl / r.Ws_ng - 1); r.dHs_pct = 100 * (r.Hs_bl / r.Hs_ng - 1);
    r.Vdot_ng = p.E_MW / r.Hs_ng; r.Vdot_bl = p.E_MW / r.Hs_bl; r.Vratio = r.Vdot_bl / r.Vdot_ng;
    r.Hs_h2 = h2.Hs_vol; r.Vh2 = p.xH2 * r.Vdot_bl; r.h2_energy_share_pct = 100 * p.xH2 * r.Hs_h2 / r.Hs_bl;
    r.co2_ng = sng.kgCO2_per_GJ_HHV; r.co2_bl = sbl.kgCO2_per_GJ_HHV; r.co2_red_pct = 100 * (1 - r.co2_bl / r.co2_ng);
    r.xH2max = Math.min(r.xH2max_W, r.xH2max_d, p.xH2Lim);
    r.governing = r.xH2max === r.xH2max_W ? 'Wobbe' : (r.xH2max === r.xH2max_d ? 'relative density' : 'H2 limit');
    r.okW = r.Ws_bl >= p.WsMin && r.Ws_bl <= p.WsMax; r.okd = r.d_bl >= p.dMin && r.d_bl <= p.dMax; r.okH2 = p.xH2 <= p.xH2Lim;
    r.pass = r.okW && r.okd && r.okH2;
    r.basis = bl.basis; r.basis_label = (bl.basis && bl.basis.label) || ''; r.energy_basis = 'gross (HHV, Hs)';
    r.norm = ['EN 16726:2015+A1:2018 (2018-08)', 'ISO 6976:2016 (2016-08)'];
    if (r.Ws_ng < p.WsMin || r.Ws_ng > p.WsMax) { addW('Base NG Wobbe index ' + r.Ws_ng.toFixed(2) + ' MJ/m3 is outside the window [' + p.WsMin + ', ' + p.WsMax + '] even without H2'); }
    if (p.xH2 > 0.2) { addW('above 20 % most EU appliances are not certified (EN 437)'); }
    if (!r.okW) { addW('Blend Wobbe index ' + r.Ws_bl.toFixed(2) + ' MJ/m3 outside [' + p.WsMin + ', ' + p.WsMax + ']'); }
    if (!r.okd) { addW('Blend relative density ' + r.d_bl.toFixed(4) + ' outside [' + p.dMin + ', ' + p.dMax + ']'); }
    if (!r.okH2) { addW('H2 fraction ' + (100 * p.xH2).toFixed(1) + ' % exceeds limit ' + (100 * p.xH2Lim).toFixed(1) + ' %'); }
    r.warnings = w;
    r.breakdown = { ng:h2bSub(ng, sng), blend:h2bSub(bl, sbl) };
    return r;
  }

  /* lcoh_rfnbo c01 - inputs, presets, levelised cost of electrolytic hydrogen (by Claude, 23.10 run12) */
  var LCOH_LHV = 120;          // MJ/kg H2, LHV used by EU DA 2023/1185 (RED Annex III)
  var LCOH_FOSSIL = 94;        // gCO2e/MJ, fossil fuel comparator, DA 2023/1185 Annex part A
  var LCOH_SAVING = 0.70;      // minimum GHG saving for RFNBO, RED Art. 25(2)
  var LCOH_DEFAULTS = {
    P_MW: 100, capex_kW: 2000, opex_pct: 3, sec: 53, flh: 5000, stack_life_h: 80000, stack_pct: 15,
    elec_price: 50, water_L: 15, water_price: 2, wacc: 0.07, life: 25,
    source: 'ppa', res_share: 1.0, corr: 'monthly', same_zone: true, res_age_m: 12, res_no_aid: true,
    cod_year: 2027, year: 2028, grid_res_share: 0.95, grid_ef: 70, other_kg: 0.5
  };
  var LCOH_PRESETS = {
    pvPPA:   { label: 'Solar PPA, 2 000 h/yr', inputs: { source: 'ppa', flh: 2000, elec_price: 35, res_share: 1.0, corr: 'monthly' } },
    windPPA: { label: 'Onshore wind PPA, 4 000 h/yr, hourly matching (2030)', inputs: { source: 'ppa', flh: 4000, elec_price: 55, res_share: 1.0, corr: 'hourly', year: 2030, cod_year: 2029 } },
    hydroZone: { label: 'Bidding zone > 90 % renewable, 8 000 h/yr', inputs: { source: 'grid_res', flh: 8000, elec_price: 45, grid_res_share: 0.95 } },
    gridMix: { label: 'Average EU grid, 8 000 h/yr (not RFNBO)', inputs: { source: 'grid', flh: 8000, elec_price: 80, grid_ef: 70 } }
  };
  function lcohCrf(i, n) { return i === 0 ? 1 / n : i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1); }
  // present value (at year 0) of stack replacements: a new stack is fitted at the end of the year in which
  // the running stack reaches stack_life_h, so the interval is ceil(stack_life_h / flh) years; none in or after the last year
  function lcohStacks(p, cost) {
    var pv = 0, n = 0, yr, dy, years = [];
    if (!(p.stack_life_h > 0) || !(p.flh > 0)) { return { pv: 0, n: 0, years: years }; }
    dy = Math.ceil(p.stack_life_h / p.flh - 1e-9);
    for (yr = dy; yr < p.life; yr += dy) { pv += cost / Math.pow(1 + p.wacc, yr); n++; years.push(yr); }
    return { pv: pv, n: n, years: years };
  }
  function lcohCost(p) {
    var capex = p.capex_kW * p.P_MW * 1000;                 // EUR
    var mwh = p.P_MW * p.flh;                               // MWh/yr electricity
    var m = mwh * 1000 / p.sec;                             // kg/yr H2
    var crf = lcohCrf(p.wacc, p.life);
    var st = lcohStacks(p, capex * p.stack_pct / 100);
    var c = {
      capex: capex * crf / m,
      stack: st.pv * crf / m,
      opex: capex * p.opex_pct / 100 / m,
      elec: p.sec * p.elec_price / 1000,
      water: p.water_L / 1000 * p.water_price
    };
    var tot = c.capex + c.stack + c.opex + c.elec + c.water;
    return { capex_total: capex, E_MWh: mwh, m_kg: m, crf: crf, stacks: st.n, stack_years: st.years,
      parts: c, lcoh: tot, lcoh_MWh: tot / (LCOH_LHV / 3.6) * 1000, eff_lhv: LCOH_LHV / 3.6 / p.sec };
  }

  /* lcoh_rfnbo c02 - RFNBO electricity rules (DA 2023/1184) and GHG saving (DA 2023/1185), solve (by Claude, 23.10 run12) */
  var LCOH_SOURCES = ['direct', 'ppa', 'grid_res', 'low_ef', 'grid'];
  // share of the electrolyser electricity that counts as fully renewable, with the checked conditions
  function lcohRules(p) {
    var ch = [], f = 0, hourlyDue = p.year >= 2030, corrOk = p.corr === 'hourly' || !hourlyDue;
    var addExempt = p.cod_year < 2028 && p.year < 2036;   // DA 2023/1184 Art. 11 transition for Art. 5(a),(b)
    var ageOk = p.res_age_m <= 36;
    function c(id, ok, txt) { ch.push({ id: id, ok: !!ok, text: txt }); return !!ok; }
    if (p.source === 'direct') {
      // Art. 3: direct connection, renewable plant not older than 36 months before the electrolyser
      if (c('age', ageOk, 'Renewable installation came into operation not earlier than 36 months before the electrolyser (Art. 3(a))')) { f = 1; }
    } else if (p.source === 'ppa') {
      // Art. 4(2) + Art. 5 additionality, Art. 6 temporal, Art. 7 geographic correlation
      var a1 = addExempt || c('age', ageOk, 'Additionality: renewable installation not older than 36 months (Art. 5(a))');
      var a2 = addExempt || c('aid', p.res_no_aid, 'Additionality: no operating or investment aid to the installation (Art. 5(b))');
      if (addExempt) { c('add', true, 'Additionality not yet required: electrolyser in operation before 2028, until 31.12.2035 (Art. 11)'); }
      var t = c('temporal', corrOk, hourlyDue ? 'Temporal correlation: hourly matching required from 1.1.2030 (Art. 6)' : 'Temporal correlation: monthly matching allowed until 31.12.2029 (Art. 6)');
      var g = c('zone', p.same_zone, 'Geographic correlation: renewable plant in the same bidding zone (Art. 7)');
      if (a1 && a2 && t && g) { f = p.res_share; }
    } else if (p.source === 'grid_res') {
      // Art. 4(1): bidding zone with renewable share above 90 %, hours capped at share x 8760
      var z = c('zone90', p.grid_res_share > 0.9, 'Bidding zone renewable share above 90 % in the previous calendar year (Art. 4(1))');
      var h = c('hours', p.flh <= p.grid_res_share * 8760, 'Full-load hours not above renewable share x 8760 h (Art. 4(1))');
      if (z && h) { f = 1; }
    } else if (p.source === 'low_ef') {
      // Art. 4(3): grid emission intensity below 18 gCO2e/MJ plus PPA with temporal and geographic correlation
      var e = c('ef18', p.grid_ef < 18, 'Bidding zone emission intensity below 18 gCO2e/MJ electricity (Art. 4(3))');
      var t2 = c('temporal', corrOk, hourlyDue ? 'Temporal correlation: hourly matching required from 1.1.2030 (Art. 6)' : 'Temporal correlation: monthly matching allowed until 31.12.2029 (Art. 6)');
      var g2 = c('zone', p.same_zone, 'Geographic correlation: renewable plant in the same bidding zone (Art. 7)');
      if (e && t2 && g2) { f = p.res_share; }
    } else {
      c('grid', false, 'Grid electricity without renewable claim: not RFNBO');
    }
    return { f_ren: f, checks: ch };
  }
  function lcohGhg(p, f) {
    // DA 2023/1185 Annex part A: electricity counted fully renewable has zero emissions; the rest at grid intensity
    var eEl = (1 - f) * p.sec * 3.6 * p.grid_ef / LCOH_LHV;  // gCO2e/MJ H2
    var eOt = p.other_kg * 1000 / LCOH_LHV;                  // gCO2e/MJ H2
    var lim = LCOH_FOSSIL * (1 - LCOH_SAVING);
    return { e_elec: eEl, e_other: eOt, e_tot: eEl + eOt, e_kg: (eEl + eOt) * LCOH_LHV / 1000,
      e_rfnbo: eOt, saving_pct: 100 * (1 - (eEl + eOt) / LCOH_FOSSIL), limit: lim, pass_rfnbo: eOt <= lim, pass_tot: eEl + eOt <= lim };
  }
  function lcohSolve(inp) {
    var p = {}, k, err = null, w = [], r, cst, ru, g;
    for (k in LCOH_DEFAULTS) { if (LCOH_DEFAULTS.hasOwnProperty(k)) { p[k] = LCOH_DEFAULTS[k]; } }
    if (inp) { for (k in inp) { if (inp.hasOwnProperty(k) && inp[k] !== null && inp[k] !== undefined && inp[k] !== '') { p[k] = inp[k]; } } }
    for (k in LCOH_DEFAULTS) {
      if (typeof LCOH_DEFAULTS[k] === 'number') { p[k] = Number(p[k]); }
      else if (typeof LCOH_DEFAULTS[k] === 'boolean') { p[k] = p[k] === true || p[k] === 'true' || p[k] === 1; }
    }
    if (LCOH_SOURCES.indexOf(p.source) < 0) { err = 'source must be one of ' + LCOH_SOURCES.join(', '); }
    else if (!(p.P_MW > 0)) { err = 'P_MW must be > 0'; }
    else if (!(p.capex_kW >= 0)) { err = 'capex_kW must be >= 0'; }
    else if (!(p.sec > 0)) { err = 'sec must be > 0'; }
    else if (p.sec < LCOH_LHV / 3.6) { err = 'sec below the LHV of hydrogen (33.3 kWh/kg) is impossible'; }
    else if (!(p.flh > 0 && p.flh <= 8760)) { err = 'flh must be in (0, 8760]'; }
    else if (!(p.life >= 1 && p.life <= 60)) { err = 'life must be in [1, 60] years'; }
    else if (!(p.wacc >= 0 && p.wacc < 1)) { err = 'wacc must be in [0, 1)'; }
    else if (!(p.res_share >= 0 && p.res_share <= 1)) { err = 'res_share must be in [0, 1]'; }
    else if (!(p.grid_res_share >= 0 && p.grid_res_share <= 1)) { err = 'grid_res_share must be in [0, 1]'; }
    else if (['hourly', 'monthly'].indexOf(p.corr) < 0) { err = 'corr must be hourly or monthly'; }
    else {
      var nn = ['opex_pct', 'stack_life_h', 'stack_pct', 'elec_price', 'water_L', 'water_price', 'res_age_m', 'grid_ef', 'other_kg', 'cod_year', 'year'];
      for (k = 0; k < nn.length && !err; k++) { if (!isFinite(p[nn[k]]) || (p[nn[k]] < 0 && nn[k] !== 'elec_price')) { err = nn[k] + ' must be a number >= 0'; } }
    }
    if (err) { return { ok: false, error: err, warnings: [] }; }
    cst = lcohCost(p); ru = lcohRules(p); g = lcohGhg(p, ru.f_ren);
    r = { ok: true, inputs: p, lcoh: cst.lcoh, lcoh_MWh: cst.lcoh_MWh, m_t: cst.m_kg / 1000, E_GWh: cst.E_MWh / 1000,
      eff_lhv: cst.eff_lhv, capex_total: cst.capex_total, crf: cst.crf, stacks: cst.stacks,
      c_capex: cst.parts.capex, c_stack: cst.parts.stack, c_opex: cst.parts.opex, c_elec: cst.parts.elec, c_water: cst.parts.water,
      f_ren: ru.f_ren, rfnbo_t: ru.f_ren * cst.m_kg / 1000, checks: ru.checks,
      e_elec: g.e_elec, e_other: g.e_other, e_tot: g.e_tot, e_kg: g.e_kg, e_rfnbo: g.e_rfnbo, saving_pct: g.saving_pct, ghg_limit: g.limit,
      ghg_pass: g.pass_rfnbo };
    r.rfnbo = ru.f_ren > 0 && g.pass_rfnbo;
    r.rfnbo_share_pct = r.rfnbo ? 100 * ru.f_ren : 0;
    r.energy_basis = 'LHV 120 MJ/kg (33.3 kWh/kg)';
    r.norm = ['Commission Delegated Regulation (EU) 2023/1184 (2023-02-10)', 'Commission Delegated Regulation (EU) 2023/1185 (2023-02-10)', 'Directive (EU) 2018/2001 as amended by (EU) 2023/2413'];
    if (cst.stacks === 0 && p.life * p.flh > p.stack_life_h) { w.push('Stack life exceeded in the last year of operation; no replacement counted'); }
    if (p.source === 'ppa' || p.source === 'low_ef') { if (p.res_share < 1) { w.push('Only ' + (100 * p.res_share).toFixed(0) + ' % of the electricity is matched by PPAs; the rest is grid electricity, counted as non-renewable here'); } }
    if ((p.source === 'ppa' || p.source === 'low_ef') && p.year >= 2027 && p.year < 2030 && p.corr === 'monthly') { w.push('Member States may require hourly matching from 1.7.2027 (Art. 6)'); }
    if (ru.f_ren > 0 && !g.pass_rfnbo) { w.push('Other emissions alone exceed 28.2 gCO2e/MJ: the renewable share fails the 70 % saving'); }
    if (p.flh > 0 && p.flh < 1500) { w.push('Fewer than 1 500 full-load hours: capital cost dominates'); }
    r.warnings = w;
    r.breakdown = { cost_eur_per_kg: cst.parts, stack_years: cst.stack_years, ghg_g_per_MJ: { electricity: g.e_elec, other: g.e_other, total: g.e_tot, limit: g.limit, comparator: LCOH_FOSSIL } };
    return r;
  }

  /* h2_carriers_compare c01 - LH2 / NH3 / LOHC shipping chain: delivered cost and energy (by Claude, 23.10 run12)
   * Chain per kg H2 entering conversion (IEA The Future of Hydrogen 2019, ch. 3 and annex): conversion -> export terminal ->
   * ship (distance, boil-off) -> import terminal -> reconversion (heat, recovery). Indicative EUR 2025 defaults, user-editable. */
  var CARR_LHV = 33.33;   // kWh/kg H2 (120 MJ/kg)
  var CARR_IDS = ['lh2', 'nh3', 'lohc'];
  var CARR_PAR = ['conv_kWh', 'conv_eur', 'f_conv', 'term_eur', 'ship_eur', 'bo_day', 'rec_heat', 'rec_kWh', 'rec_eur', 'f_rec'];
  var CARR_DEFAULTS = {
    dist: 5000, speed: 650, P_h2: 3.0, elec_price: 50, imp_elec: 80, heat_price: 40, heat_h2: false, eta_burn: 0.9,
    lh2_conv_kWh: 10, lh2_conv_eur: 0.9, lh2_f_conv: 0.99, lh2_term_eur: 0.4, lh2_ship_eur: 0.12, lh2_bo_day: 0.2, lh2_rec_heat: 0, lh2_rec_kWh: 0.2, lh2_rec_eur: 0.1, lh2_f_rec: 1.0,
    nh3_conv_kWh: 3.5, nh3_conv_eur: 0.6, nh3_f_conv: 0.99, nh3_term_eur: 0.1, nh3_ship_eur: 0.03, nh3_bo_day: 0.0, nh3_rec_heat: 9.0, nh3_rec_kWh: 0.5, nh3_rec_eur: 0.6, nh3_f_rec: 0.95,
    lohc_conv_kWh: 1.0, lohc_conv_eur: 0.5, lohc_f_conv: 0.99, lohc_term_eur: 0.15, lohc_ship_eur: 0.07, lohc_bo_day: 0.0, lohc_rec_heat: 10.5, lohc_rec_kWh: 0.3, lohc_rec_eur: 0.5, lohc_f_rec: 0.97
  };
  var CARR_PRESETS = {
    short: { label: 'Short sea route, 1 500 km', inputs: { dist: 1500 } },
    long: { label: 'Long route, 15 000 km (e.g. Australia - Japan)', inputs: { dist: 15000 } },
    cheapHeat: { label: 'Cheap waste heat at the import terminal', inputs: { heat_price: 10 } },
    h2Heat: { label: 'Reconversion heat from burning hydrogen', inputs: { heat_h2: true } }
  };
  // one carrier chain; p = full input set, c = carrier id
  function carrChain(p, c) {
    var q = {}, i, days, fShip, fIn, hFrac, cost = {}, d, tot, eIn;
    for (i = 0; i < CARR_PAR.length; i++) { q[CARR_PAR[i]] = p[c + '_' + CARR_PAR[i]]; }
    days = p.dist / p.speed;
    fShip = Math.pow(1 - q.bo_day / 100, days);
    fIn = q.f_conv * fShip;                                   // kg H2 reaching reconversion per kg entering conversion
    hFrac = p.heat_h2 ? q.rec_heat / (CARR_LHV * p.eta_burn) : 0;  // share of recovered H2 burnt for heat
    d = fIn * q.f_rec * (1 - hFrac);                          // kg delivered per kg entering conversion
    cost.production = p.P_h2;
    cost.conversion = q.conv_kWh * p.elec_price / 1000 + q.conv_eur;
    cost.terminals = q.term_eur;
    cost.shipping = q.ship_eur * p.dist / 1000;
    cost.reconversion = fIn * (q.rec_kWh * p.imp_elec / 1000 + q.rec_eur + (p.heat_h2 ? 0 : q.rec_heat * p.heat_price / 1000));
    tot = 0;
    for (i in cost) { if (cost.hasOwnProperty(i)) { cost[i] = cost[i] / d; tot += cost[i]; } }
    eIn = CARR_LHV + q.conv_kWh + fIn * (q.rec_kWh + (p.heat_h2 ? 0 : q.rec_heat));
    return { id: c, days: days, f_ship: fShip, f_deliv: d, h_frac: hFrac, cost: cost, delivered: tot,
      transport: tot - cost.production, eff: d * CARR_LHV / eIn, kWh_per_kg: (eIn - d * CARR_LHV) / d };
  }
  function carrSolve(inp) {
    var p = {}, k, i, err = null, w = [], r, ch = {}, best = null;
    for (k in CARR_DEFAULTS) { if (CARR_DEFAULTS.hasOwnProperty(k)) { p[k] = CARR_DEFAULTS[k]; } }
    if (inp) { for (k in inp) { if (inp.hasOwnProperty(k) && inp[k] !== null && inp[k] !== undefined && inp[k] !== '') { p[k] = inp[k]; } } }
    for (k in CARR_DEFAULTS) {
      if (typeof CARR_DEFAULTS[k] === 'number') { p[k] = Number(p[k]); if (!isFinite(p[k])) { err = k + ' must be a number'; } }
      else { p[k] = p[k] === true || p[k] === 'true' || p[k] === 1; }
    }
    if (!err && !(p.dist >= 0)) { err = 'dist must be >= 0'; }
    if (!err && !(p.speed > 0)) { err = 'speed must be > 0'; }
    if (!err && !(p.eta_burn > 0 && p.eta_burn <= 1)) { err = 'eta_burn must be in (0, 1]'; }
    for (i = 0; i < CARR_IDS.length && !err; i++) {
      for (k = 0; k < CARR_PAR.length && !err; k++) {
        var key = CARR_IDS[i] + '_' + CARR_PAR[k], v = p[key];
        if (CARR_PAR[k].indexOf('f_') === 0) { if (!(v > 0 && v <= 1)) { err = key + ' must be in (0, 1]'; } }
        else if (CARR_PAR[k] === 'bo_day') { if (!(v >= 0 && v < 100)) { err = key + ' must be in [0, 100)'; } }
        else if (!(v >= 0)) { err = key + ' must be >= 0'; }
      }
    }
    if (err) { return { ok: false, error: err, warnings: [] }; }
    for (i = 0; i < CARR_IDS.length; i++) {
      ch[CARR_IDS[i]] = carrChain(p, CARR_IDS[i]);
      if (!(ch[CARR_IDS[i]].f_deliv > 0)) { return { ok: false, error: CARR_IDS[i] + ': reconversion heat from hydrogen exceeds the hydrogen recovered', warnings: [] }; }
      if (!best || ch[CARR_IDS[i]].delivered < ch[best].delivered) { best = CARR_IDS[i]; }
    }
    r = { ok: true, inputs: p, best: best, days: p.dist / p.speed, chains: ch };
    for (i = 0; i < CARR_IDS.length; i++) {
      var c = CARR_IDS[i], x = ch[c];
      r[c + '_cost'] = x.delivered; r[c + '_transport'] = x.transport; r[c + '_eff'] = x.eff; r[c + '_deliv'] = x.f_deliv; r[c + '_kWh'] = x.kWh_per_kg;
    }
    r.best_cost = ch[best].delivered;
    r.energy_basis = 'LHV 120 MJ/kg (33.33 kWh/kg)';
    r.norm = ['IEA The Future of Hydrogen (2019-06)', 'IEA Global Hydrogen Review 2024 (2024-10)'];
    if (ch.lh2.f_ship < 0.95) { w.push('LH2 boil-off over the voyage exceeds 5 % of the cargo'); }
    if (p.dist < 1500) { w.push('Below about 1 500 km a hydrogen pipeline is usually cheaper than shipping'); }
    if (p.heat_h2) { w.push('Reconversion heat is taken from the hydrogen: ' + (100 * ch.nh3.h_frac).toFixed(0) + ' % (NH3) and ' + (100 * ch.lohc.h_frac).toFixed(0) + ' % (LOHC) of the recovered hydrogen is burnt'); }
    if (p.P_h2 <= 0) { w.push('Hydrogen production cost is zero or negative'); }
    r.warnings = w;
    r.breakdown = { lh2: ch.lh2.cost, nh3: ch.nh3.cost, lohc: ch.lohc.cost };
    return r;
  }

  /* hrs_refuelling c01 - vehicle fill at a hydrogen refuelling station: SAE J2601:2020 targets and limits with a single-zone
   * real-gas energy balance of the tank (Leachman H2 EOS from ogh-core) (by Claude, 23.10 run12) */
  var HRS_DEFAULTS = { cls: 'H70', V_L: 141, p0_MPa: 10, T_amb: 25, T_pc: -40, aprr: 20, soc: 100, wall_kJK: 30, cop: 1.5, fills_day: 100, p_bank: 0 };
  var HRS_PRESETS = {
    car70: { label: 'Passenger car H70, 141 L, from 10 MPa', inputs: { cls: 'H70', V_L: 141, p0_MPa: 10 } },
    hotDay: { label: 'Hot day 40 °C, T40 precooling', inputs: { T_amb: 40 } },
    bus35: { label: 'Bus H35, 1 500 L, from 5 MPa', inputs: { cls: 'H35', V_L: 1500, p0_MPa: 5, aprr: 10, T_pc: -20 } },
    noPrecool: { label: 'Little precooling (T20 category)', inputs: { T_pc: -20 } }
  };
  var HRS_CLS = { H70: 70e6, H35: 35e6 };
  var HRS_TMAX = 85;       // degC, J2601 / ISO 19880-1 maximum gas temperature in the tank
  var HRS_MDOT = 60;       // g/s, J2601 maximum mass flow rate for light-duty fills
  // tank temperature for density rho after the fill from the energy balance
  // m1 u(T1, rho) + Cw (T1 - T0) = m0 u0 + (m1 - m0) h_in
  function hrsFinalT(rho, m1, rhs, cw, T0) {
    var lo = 120, hi = 700, i, mid, f;
    function g(T) { return m1 * C.eos.trho('h2', T, rho).u + cw * (T - T0) - rhs; }
    if (g(lo) > 0 || g(hi) < 0) { throw new Error('fill energy balance has no solution in 120-700 K'); }
    for (i = 0; i < 80; i++) { mid = 0.5 * (lo + hi); f = g(mid); if (f > 0) { hi = mid; } else { lo = mid; } }
    return 0.5 * (lo + hi);
  }
  function hrsSolve(inp) {
    var p = {}, k, err = null, w = [], r = {};
    for (k in HRS_DEFAULTS) { if (HRS_DEFAULTS.hasOwnProperty(k)) { p[k] = HRS_DEFAULTS[k]; } }
    if (inp) { for (k in inp) { if (inp.hasOwnProperty(k) && inp[k] !== null && inp[k] !== undefined && inp[k] !== '') { p[k] = inp[k]; } } }
    for (k in HRS_DEFAULTS) { if (typeof HRS_DEFAULTS[k] === 'number') { p[k] = Number(p[k]); if (!isFinite(p[k])) { err = k + ' must be a number'; } } }
    if (!err && !HRS_CLS[p.cls]) { err = 'cls must be H70 or H35'; }
    if (!err && !(p.V_L > 0)) { err = 'V_L must be > 0'; }
    if (!err && !(p.p0_MPa >= 0.5)) { err = 'p0_MPa must be >= 0.5 (tanks are never emptied below 0.5 MPa)'; }
    if (!err && !(p.T_amb >= -40 && p.T_amb <= 50)) { err = 'T_amb must be in [-40, 50] degC'; }
    if (!err && !(p.T_pc >= -45 && p.T_pc <= p.T_amb)) { err = 'T_pc must be in [-45 degC, T_amb]'; }
    if (!err && !(p.aprr > 0)) { err = 'aprr must be > 0'; }
    if (!err && !(p.soc > 0 && p.soc <= 100)) { err = 'soc must be in (0, 100] %'; }
    if (!err && !(p.wall_kJK >= 0 && p.cop > 0 && p.fills_day >= 0)) { err = 'wall_kJK, fills_day must be >= 0 and cop > 0'; }
    if (!err && !(p.p_bank >= 0)) { err = 'p_bank must be >= 0 bar (0 = not limiting)'; }
    if (!err && p.p_bank > 0 && !(p.p_bank / 10 > p.p0_MPa)) { err = 'p_bank must be above the initial tank pressure (no fill possible)'; }
    if (err) { return { ok: false, error: err, warnings: [] }; }
    var nwp = HRS_CLS[p.cls], mop = 1.25 * nwp, V = p.V_L / 1000, T0 = p.T_amb + 273.15, Tpc = p.T_pc + 273.15;
    try {
      var s100 = C.eos.tp('h2', 288.15, nwp), s0 = C.eos.tp('h2', T0, p.p0_MPa * 1e6);
      var rho1 = s100.rho * p.soc / 100, m0 = s0.rho * V, m1 = rho1 * V;
      if (!(m1 > m0)) { return { ok: false, error: 'Tank already at or above the target state of charge', warnings: [] }; }
      var sin = C.eos.tp('h2', Tpc, mop), samb = C.eos.tp('h2', T0, mop);
      var rhs = m0 * s0.u + (m1 - m0) * sin.h, cw = p.wall_kJK * 1000;
      var Tad = hrsFinalT(rho1, m1, rhs, 0, T0), Tw = hrsFinalT(rho1, m1, rhs, cw, T0);
      var pad = C.eos.trho('h2', Tad, rho1).p, pw = C.eos.trho('h2', Tw, rho1).p;
      // r3 D-r3-1 (Claude): single station bank (no cascade) at p_bank. Gas flows only while p_bank > p_tank, so the
      // reachable end pressure is p_bank (no dispenser dP in this model). If the target fill would end above it, find the density
      // rho_b in (rho0, rho1) with p(T1(rho_b), rho_b) = p_bank, T1 from the same energy balance with m = rho_b V (bisection).
      var pb = p.p_bank * 1e5, limited = pb > 0 && pw > pb, rb, lo, hi, it, mb, Tb;
      if (limited) {
        lo = s0.rho; hi = rho1;
        for (it = 0; it < 60; it++) {
          rb = 0.5 * (lo + hi); mb = rb * V;
          Tb = hrsFinalT(rb, mb, m0 * s0.u + (mb - m0) * sin.h, cw, T0);
          if (C.eos.trho('h2', Tb, rb).p > pb) { hi = rb; } else { lo = rb; }
        }
        rho1 = 0.5 * (lo + hi); m1 = rho1 * V; rhs = m0 * s0.u + (m1 - m0) * sin.h;
        Tad = hrsFinalT(rho1, m1, rhs, 0, T0); Tw = hrsFinalT(rho1, m1, rhs, cw, T0);
        pad = C.eos.trho('h2', Tad, rho1).p; pw = C.eos.trho('h2', Tw, rho1).p;
      }
    } catch (e) { return { ok: false, error: 'Calculation failed: ' + ((e && e.message) || e), warnings: [] }; }
    r.ok = true; r.inputs = p;
    r.p_bank_MPa = pb / 1e6; r.bank_limited = limited; r.soc_target = p.soc; r.soc_end = 100 * rho1 / s100.rho;
    r.nwp_MPa = nwp / 1e6; r.mop_MPa = mop / 1e6; r.rho100 = s100.rho; r.m_cap = s100.rho * V;
    r.m0 = m0; r.m1 = m1; r.m_fill = m1 - m0; r.soc0 = 100 * s0.rho / s100.rho;
    r.T_ad = Tad - 273.15; r.p_ad_MPa = pad / 1e6; r.T_end = Tw - 273.15; r.p_end_MPa = pw / 1e6;
    r.t_min = (r.p_end_MPa - p.p0_MPa) / p.aprr; r.mdot_gs = r.t_min > 0 ? 1000 * r.m_fill / (60 * r.t_min) : NaN;
    r.h_in = sin.h; r.q_pc_kJkg = (samb.h - sin.h) / 1000; r.Q_pc_kWh = r.m_fill * (samb.h - sin.h) / 3.6e6; r.E_chill_kWh = r.Q_pc_kWh / p.cop;
    r.E_chill_kWh_kg = r.E_chill_kWh / r.m_fill;
    r.kg_day = r.m_fill * p.fills_day; r.E_chill_day = r.E_chill_kWh * p.fills_day;
    r.okT = r.T_end <= HRS_TMAX; r.okP = r.p_end_MPa <= r.mop_MPa; r.okM = p.V_L > 500 || !(r.mdot_gs > HRS_MDOT);   // 60 g/s applies to light-duty fills only
    r.pass = r.okT && r.okP && r.okM;
    r.energy_basis = 'LHV 120 MJ/kg where energy is quoted; tank state by Leachman (2009) EOS';
    r.norm = ['SAE J2601:2020 (2020-05)', 'ISO 19880-1:2020 (2020-03)', 'Leachman et al. (2009) J. Phys. Chem. Ref. Data 38:721'];
    if (!r.okT) { w.push('Final gas temperature ' + r.T_end.toFixed(1) + ' degC exceeds the 85 degC limit: precool deeper, fill to a lower state of charge or start from a higher pressure'); }
    if (r.T_ad > HRS_TMAX && r.okT) { w.push('Without heat uptake by the tank wall the gas would reach ' + r.T_ad.toFixed(1) + ' degC'); }
    if (!r.okP) { w.push('Final pressure ' + r.p_end_MPa.toFixed(1) + ' MPa exceeds the maximum operating pressure ' + r.mop_MPa.toFixed(1) + ' MPa'); }
    if (!r.okM) { w.push('Average mass flow ' + r.mdot_gs.toFixed(1) + ' g/s exceeds 60 g/s'); }
    if (limited) { w.push('Station bank pressure ' + p.p_bank.toFixed(0) + ' bar limits the fill to SOC ' + r.soc_end.toFixed(1) + ' % (target ' + p.soc.toFixed(1) + ' %)'); }
    if (p.cls === 'H35' && p.V_L > 500) { w.push('Heavy-duty tanks follow SAE J2601-2 / J2601-5, not the light-duty J2601 tables'); }
    r.warnings = w;
    r.breakdown = { tank: { V_m3: V, rho0: s0.rho, rho1: rho1, u0: s0.u }, inlet: { T_K: Tpc, p_Pa: mop, h: sin.h }, ambient_h: samb.h };
    return r;
  }

  /* h2_fuel_conversion c01 - hydrogen quantity and energy conversion, fuel equivalents and ISO 14687:2019 Grade D purity check
   * (by Claude, 23.10 run12). CV on mass basis by ISO 6976:2016 (ogh-core fuel data); gas volumes from the Leachman
   * H2 EOS (ogh-core eos), because the ISO 6976 summation-factor Z (0.9999 with the verified s = -0.01, r3) is below the real Z of hydrogen (1.0006). */
  var FUEL_IMP = ['h2o', 'nmhc', 'ch4', 'o2', 'he', 'n2', 'ar', 'co2', 'co', 's_tot', 'hcho', 'hcooh', 'nh3', 'halog'];
  // ISO 14687:2019 Table 2, Grade D (PEM fuel cells, road vehicles), umol/mol; h2 fuel index >= 99.97 %, total non-H2 <= 300
  var FUEL_GRADE_D = { h2o: 5, nmhc: 2, ch4: 100, o2: 5, he: 300, n2: 300, ar: 300, co2: 2, co: 0.2, s_tot: 0.004, hcho: 0.2, hcooh: 0.2, nh3: 0.1, halog: 0.05 };
  // Directive (EU) 2018/2001 Annex III LHV (MJ/kg, MJ/L); IPCC 2006 Vol. 2 Table 1.4 combustion CO2 (kg/GJ); methanol stoichiometric
  var FUEL_REF = {
    diesel: { lhv_kg: 43, lhv_L: 36, co2: 74.1 },
    petrol: { lhv_kg: 43, lhv_L: 32, co2: 69.3 },
    lpg: { lhv_kg: 46, lhv_L: 24, co2: 63.1 },
    methanol: { lhv_kg: 20, lhv_L: 16, co2: 44.0095 / 32.0419 / 0.020 }
  };
  var FUEL_UNITS = ['kg', 'Nm3', 'Sm3', 'MWh_LHV', 'MWh_HHV', 'GJ_LHV'];
  var FUEL_DEFAULTS = { amount: 1000, unit: 'kg', tComb: 15,
    h2o: 2, nmhc: 0.5, ch4: 10, o2: 1, he: 20, n2: 50, ar: 5, co2: 0.5, co: 0.05, s_tot: 0.001, hcho: 0.01, hcooh: 0.01, nh3: 0.02, halog: 0.01 };
  var FUEL_PRESETS = {
    pem: { label: 'Electrolytic H2 after drying (Grade D)', inputs: { h2o: 2, nmhc: 0, ch4: 0, o2: 2, he: 0, n2: 20, ar: 2, co2: 0, co: 0 } },
    smrPsa: { label: 'SMR + PSA hydrogen (Grade D)', inputs: { h2o: 1, nmhc: 0.2, ch4: 30, o2: 0, he: 0, n2: 100, ar: 10, co2: 0.5, co: 0.1 } },
    offSpec: { label: 'Off-spec: CO 1 umol/mol', inputs: { co: 1 } },
    industrial: { label: 'Industrial 99.5 % hydrogen', inputs: { ch4: 2000, n2: 2500, co2: 200, co: 50, h2o: 200 } }
  };
  function fuelSolve(inp) {
    var p = {}, k, i, err = null, w = [], r = {};
    for (k in FUEL_DEFAULTS) { if (FUEL_DEFAULTS.hasOwnProperty(k)) { p[k] = FUEL_DEFAULTS[k]; } }
    if (inp) { for (k in inp) { if (inp.hasOwnProperty(k) && inp[k] !== null && inp[k] !== undefined && inp[k] !== '') { p[k] = inp[k]; } } }
    for (k in FUEL_DEFAULTS) { if (typeof FUEL_DEFAULTS[k] === 'number') { p[k] = Number(p[k]); if (!isFinite(p[k]) || p[k] < 0) { err = k + ' must be a number >= 0'; } } }
    if (!err && FUEL_UNITS.indexOf(p.unit) < 0) { err = 'unit must be one of ' + FUEL_UNITS.join(', '); }
    if (!err && [0, 15, 20, 25].indexOf(p.tComb) < 0) { err = 'tComb must be 0, 15, 20 or 25 degC'; }
    if (!err && !(p.amount > 0)) { err = 'amount must be > 0'; }
    var tot = 0;
    for (i = 0; i < FUEL_IMP.length; i++) { tot += p[FUEL_IMP[i]]; }
    if (!err && !(tot < 2e5)) { err = 'Impurities must be below 20 % (200 000 umol/mol)'; }
    if (err) { return { ok: false, error: err, warnings: [] }; }
    // composition for energy and molar mass: trace hydrocarbons counted as CH4 (C1 basis), other traces ignored
    var e = 1e-6, comp = { h2: 1 - tot * e, ch4: (p.ch4 + p.nmhc) * e, co: p.co * e, co2: p.co2 * e, n2: p.n2 * e, ar: p.ar * e, he: p.he * e, o2: p.o2 * e, h2o: p.h2o * e, nh3: p.nh3 * e };
    var cs = {};
    for (k in comp) { if (comp[k] > 0) { cs[k] = comp[k]; } }
    try {
      var pr = C.fuel.props(cs, { tComb: p.tComb, tMeter: 15 });
      var rN = C.eos.tp('h2', 273.15, 101325).rho, rS = C.eos.tp('h2', 288.15, 101325).rho;
      var ch4 = C.fuel.props({ ch4: 1 }, { tComb: p.tComb, tMeter: 15 });
    } catch (ex) { return { ok: false, error: 'Calculation failed: ' + ((ex && ex.message) || ex), warnings: [] }; }
    var mf = pr.M / C.fuel.data.h2.M;                 // mixture to H2 molar-mass ratio (ideal mixing of traces)
    r.ok = true; r.inputs = p;
    r.Hs_mass = pr.Hs_mass; r.Hi_mass = pr.Hi_mass; r.rho_N = rN * mf; r.rho_S = rS * mf;
    var m = p.unit === 'kg' ? p.amount : p.unit === 'Nm3' ? p.amount * r.rho_N : p.unit === 'Sm3' ? p.amount * r.rho_S
      : p.unit === 'MWh_LHV' ? p.amount * 3600 / r.Hi_mass : p.unit === 'MWh_HHV' ? p.amount * 3600 / r.Hs_mass : p.amount * 1000 / r.Hi_mass;
    r.m_kg = m; r.V_N = m / r.rho_N; r.V_S = m / r.rho_S;
    r.E_LHV_MWh = m * r.Hi_mass / 3600; r.E_HHV_MWh = m * r.Hs_mass / 3600; r.E_LHV_GJ = m * r.Hi_mass / 1000;
    r.Hi_vol_S = r.Hi_mass * r.rho_S; r.Hs_vol_S = r.Hs_mass * r.rho_S;
    for (k in FUEL_REF) {
      if (FUEL_REF.hasOwnProperty(k)) {
        r[k + '_kg'] = r.E_LHV_GJ * 1000 / FUEL_REF[k].lhv_kg; r[k + '_L'] = r.E_LHV_GJ * 1000 / FUEL_REF[k].lhv_L;
        r[k + '_co2_t'] = r.E_LHV_GJ * FUEL_REF[k].co2 / 1000;
      }
    }
    r.ng_Sm3 = r.E_LHV_GJ * 1000 / ch4.Hi_vol; r.ng_co2_t = r.E_LHV_GJ * 1000 / ch4.Hi_mass * C.fuel.stoich({ ch4: 1 }, {}).kgCO2_per_kg / 1000;
    r.co2_own_t = m * (C.fuel.stoich(cs, {}).kgCO2_per_kg) / 1000;
    // ISO 14687:2019 Grade D
    r.purity_pct = 100 - tot * 1e-4; r.total_umol = tot;
    r.fails = [];
    for (i = 0; i < FUEL_IMP.length; i++) { k = FUEL_IMP[i]; if (p[k] > FUEL_GRADE_D[k]) { r.fails.push(k); } }
    r.okTotal = tot <= 300; r.okIndex = r.purity_pct >= 99.97;
    r.gradeD = r.fails.length === 0 && r.okTotal && r.okIndex;
    r.gradeA = r.purity_pct >= 98.0;
    r.n_fail = r.fails.length + (r.okTotal ? 0 : 1);
    r.basis_label = pr.basis.label; r.energy_basis = 'LHV and HHV per ISO 6976:2016, combustion ' + p.tComb + ' C; volumes at 0 C (N) and 15 C (S), 101.325 kPa, real gas (Leachman EOS)';
    r.norm = ['ISO 14687:2019 (2019-11)', 'ISO 6976:2016 (2016-08)', 'Directive (EU) 2018/2001 Annex III', 'IPCC 2006 Guidelines Vol. 2 Table 1.4'];
    if (!r.gradeD) { w.push('Not Grade D (PEM fuel-cell vehicles): ' + (r.fails.length ? r.fails.join(', ') : '') + (r.okTotal ? '' : (r.fails.length ? '; ' : '') + 'total non-hydrogen gases ' + tot.toFixed(1) + ' > 300 umol/mol')); }
    if (!r.gradeA) { w.push('Hydrogen fraction below 98 %: not Grade A either'); }
    if (tot > 1000) { w.push('Volumes assume ideal mixing of the impurities with hydrogen; above 0.1 % impurities use a mixture EOS'); }
    r.warnings = w;
    r.breakdown = { composition: cs, Hs_mol: pr.Hs_mol, Hi_mol: pr.Hi_mol, M: pr.M, rho_H2_N: rN, rho_H2_S: rS, ch4_Hi_vol: ch4.Hi_vol };
    return r;
  }

  OGH.h2use = { VERSION: '0.1.0', tools: [] };
  if (typeof h2bSolve === 'function') { OGH.h2_ng_blending = { solve: h2bSolve, defaults: H2B_DEFAULTS, presets: H2B_PRESETS }; OGH.h2use.tools.push('h2_ng_blending'); }
  if (typeof lcohSolve === 'function') { OGH.lcoh_rfnbo = { solve: lcohSolve, defaults: LCOH_DEFAULTS, presets: LCOH_PRESETS }; OGH.h2use.tools.push('lcoh_rfnbo'); }
  if (typeof carrSolve === 'function') { OGH.h2_carriers_compare = { solve: carrSolve, defaults: CARR_DEFAULTS, presets: CARR_PRESETS }; OGH.h2use.tools.push('h2_carriers_compare'); }
  if (typeof hrsSolve === 'function') { OGH.hrs_refuelling = { solve: hrsSolve, defaults: HRS_DEFAULTS, presets: HRS_PRESETS }; OGH.h2use.tools.push('hrs_refuelling'); }
  if (typeof fuelSolve === 'function') { OGH.h2_fuel_conversion = { solve: fuelSolve, defaults: FUEL_DEFAULTS, presets: FUEL_PRESETS }; OGH.h2use.tools.push('h2_fuel_conversion'); }
  if (typeof module !== 'undefined' && module.exports) module.exports = OGH;
})(typeof window !== 'undefined' ? window : globalThis);
