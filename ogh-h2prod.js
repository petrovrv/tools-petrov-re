/* ogh-h2prod.js - Oil, Gas & Hydrogen package: hydrogen production, compression and storage tools
 * h2_compressor, h2_storage_vessel, electrolyser_sizing, blue_h2_smr_atr, h2_underground_storage, lh2_boiloff
 * Uses window.OGH.core (ogh-core.js) published API only. Generated from Claude chunks in _ogh/h2prod/; assembled mechanically.
 */
(function (root) {
  'use strict';
  var OGH = root.OGH = root.OGH || {};
  var C = OGH.core || (typeof require === 'function' ? require('./ogh-core.js') : null);
  if (C && !OGH.core) OGH.core = C;

  // r3 23.10 (Claude): H2 heating values and net calorific values at 25 C taken from the verified ISO 6976:2016
  // component data of ogh-core (C.fuel.data Hg(25), C.fuel.consts L(25), Tables A.1-A.4): Hi = Hg - (nH/2) L (kJ/mol), per kg via M.
  var ISO_L25 = C.fuel.consts.L['25'];
  function isoHi25(id) { var s = C.fuel.data[id]; return s.Hg['25'] - (s.H || 0) / 2 * ISO_L25; }
  var H2_HHV_MJ = C.fuel.data.h2.Hg['25'] / C.fuel.data.h2.M;   // 141.79 MJ/kg
  var H2_LHV_MJ = isoHi25('h2') / C.fuel.data.h2.M;             // 119.96 MJ/kg
  var H2_LHV_TXT = 'LHV ' + H2_LHV_MJ.toFixed(2) + ' MJ/kg', H2_HHV_TXT = 'HHV ' + H2_HHV_MJ.toFixed(2) + ' MJ/kg';

  // H2 multi-stage intercooled compressor model (real-gas via C.eos), ES5
  var H2C_DEFAULTS = { level: 'simple', x_h2: 1, mdot: 0.01157, p_in: 3e6, T_in: 303.15, p_out: 9e7, n: 3, eta_s: 0.75, eta_m: 0.95, T_ic: 308.15, dp_ic: 0.01, T_max: 408.15 };
  var H2C_PRESETS = [
    { id: 'default', label: 'Default (1000 kg/d, 3 to 90 MPa, 3 stages)', values: H2C_DEFAULTS },
    { id: 'hrs_700', label: 'HRS 700 bar (200 kg/d, 2 to 95 MPa, 4 stages)', values: { level: 'simple', x_h2: 1, mdot: 200 / 86400, p_in: 2e6, T_in: 303.15, p_out: 9.5e7, n: 4, eta_s: 0.75, eta_m: 0.95, T_ic: 308.15, dp_ic: 0.01, T_max: 408.15 } },
    { id: 'pipeline_booster', label: 'Pipeline booster (1 kg/s, 3 to 10 MPa, 1 stage)', values: { level: 'simple', x_h2: 1, mdot: 1.0, p_in: 3e6, T_in: 303.15, p_out: 1e7, n: 1, eta_s: 0.75, eta_m: 0.95, T_ic: 308.15, dp_ic: 0.01, T_max: 408.15 } },
    { id: 'blend_98', label: 'H2/N2 98/2 (0.1 kg/s, 2 to 20 MPa, 2 stages)', values: { level: 'simple', x_h2: 0.98, mdot: 0.1, p_in: 2e6, T_in: 303.15, p_out: 2e7, n: 2, eta_s: 0.75, eta_m: 0.95, T_ic: 308.15, dp_ic: 0.01, T_max: 408.15 } }
  ];
  function h2cSolve(inp) {
    var v = {}, k, warnings = [], fail = function (e) { return { ok: false, error: e, warnings: warnings }; };
    for (k in H2C_DEFAULTS) { if (H2C_DEFAULTS.hasOwnProperty(k)) { v[k] = H2C_DEFAULTS[k]; } }
    inp = inp || {};
    for (k in inp) { if (inp.hasOwnProperty(k) && inp[k] !== undefined && inp[k] !== null && inp[k] !== '') { v[k] = inp[k]; } }
    for (k in v) {
      if (v.hasOwnProperty(k) && k !== 'level') {
        v[k] = Number(v[k]);
        if (!isFinite(v[k])) { return fail('Invalid numeric input: ' + k); }
      }
    }
    if (!(v.p_in > 0)) { return fail('p_in must be > 0'); }
    if (!(v.p_out > v.p_in)) { return fail('p_out must be greater than p_in'); }
    if (v.p_out > 1e8) { return fail('Pressure above 100 MPa exceeds the EOS validity limit'); }
    if (v.n !== Math.floor(v.n) || v.n < 1 || v.n > 8) { return fail('n must be an integer between 1 and 8'); }
    if (!(v.eta_s > 0 && v.eta_s <= 1)) { return fail('eta_s must be in (0, 1]'); }
    if (!(v.eta_m > 0 && v.eta_m <= 1)) { return fail('eta_m must be in (0, 1]'); }
    if (!(v.dp_ic >= 0 && v.dp_ic < 0.2)) { return fail('dp_ic must be in [0, 0.2)'); }
    if (!(v.x_h2 > 0 && v.x_h2 <= 1)) { return fail('x_h2 must be in (0, 1]'); }
    if (!(v.mdot > 0) || !(v.T_in > 0) || !(v.T_ic > 0)) { return fail('mdot, T_in and T_ic must be > 0'); }
    var comp = v.x_h2 < 1 ? { h2: v.x_h2, n2: 1 - v.x_h2 } : { h2: 1 };
    var r = v.p_out / v.p_in, n = v.n, rs = Math.pow(r, 1 / n), mdot = v.mdot;
    if (rs > 4) { warnings.push('Stage pressure ratio ' + rs.toFixed(2) + ' exceeds 4; consider more stages.'); }
    var stages = [], P_gas = 0, Q_tot = 0, T_d_max = 0, p_prev = 0, Z_in, rho_in, rho_out, i, j;
    try {
      for (i = 1; i <= n; i++) {
        var p_s = i === 1 ? v.p_in : p_prev * (1 - v.dp_ic), T_s = i === 1 ? v.T_in : v.T_ic;
        var p_d = i === n ? v.p_out : v.p_in * Math.pow(rs, i);
        if (!(p_d > p_s)) { return fail('Stage ' + i + ' discharge pressure not above suction pressure (check dp_ic).'); }
        var st_s = C.eos.tp(comp, T_s, p_s), iso = C.eos.isentropicT(comp, T_s, p_s, p_d);
        var dh = iso.dh_s / v.eta_s, target = st_s.h + dh, lo = T_s, hi = Math.min(T_s + 1500, 1000), mid = lo;
        for (j = 0; j < 60; j++) {
          mid = 0.5 * (lo + hi);
          if (C.eos.tp(comp, mid, p_d).h < target) { lo = mid; } else { hi = mid; }
        }
        var T_d = 0.5 * (lo + hi), h_d = C.eos.tp(comp, T_d, p_d).h, P = mdot * dh, Q = 0;
        if (i < n) { Q = mdot * (h_d - C.eos.tp(comp, v.T_ic, p_d * (1 - v.dp_ic)).h); }
        if (T_d > v.T_max) { warnings.push('Stage ' + i + ' discharge T ' + (T_d - 273.15).toFixed(1) + ' C exceeds T_max ' + (v.T_max - 273.15).toFixed(1) + ' C; consider more stages.'); }
        if (i === 1) { Z_in = st_s.Z; rho_in = st_s.rho; }
        stages.push({ i: i, p_s: p_s, T_s: T_s, p_d: p_d, T_d: T_d, T2s: iso.T2, dh_s: iso.dh_s, dh: dh, P: P, Q_ic: Q, Z_s: st_s.Z, rho_s: st_s.rho, Vdot_s: mdot / st_s.rho });
        P_gas += P; Q_tot += Q; if (T_d > T_d_max) { T_d_max = T_d; }
        p_prev = p_d;
      }
      rho_out = C.eos.tp(comp, v.T_ic, v.p_out).rho;
    } catch (e) { return fail('EOS error: ' + (e && e.message ? e.message : String(e))); }
    var M = v.x_h2 * 2.01588e-3 + (1 - v.x_h2) * 28.0134e-3;
    var P_shaft = P_gas / v.eta_m, P_iso = mdot * 8.314462618 * v.T_in / M * Math.log(r);
    return {
      ok: true, warnings: warnings, comp: comp, r: r, rs: rs, stages: stages, P_gas: P_gas, P_shaft: P_shaft,
      e_spec_kWh_kg: P_shaft / mdot / 3.6e6, T_d_max: T_d_max, Q_ic_total: Q_tot, Z_in: Z_in, rho_in: rho_in, rho_out: rho_out,
      P_isothermal_ideal: P_iso, eta_isothermal: P_iso / P_shaft, verdict: T_d_max <= v.T_max ? 'ok' : 'too_hot',
      breakdown: { gas_power_W: P_gas, mech_loss_W: P_shaft - P_gas, intercooling_W: Q_tot }
    };
  }

  // H2 storage sizing (ES5): defaults, presets, real-gas solver via C.eos.tp
  var STOR_DEFAULTS = { level:'simple', type:'IV', V:0.32, p_max:5e7, p_min:2e6, T:288.15, m_target:500, D_i:0.5, UTS:8.6e8, BR:2.25, m_empty:250 };
  function storMerge(o) {
    var r = {}, k;
    for (k in STOR_DEFAULTS) if (STOR_DEFAULTS.hasOwnProperty(k)) r[k] = STOR_DEFAULTS[k];
    for (k in o) if (o.hasOwnProperty(k)) r[k] = o[k];
    return r;
  }
  var STOR_PRESETS = [
    { id:'default', label:'Default (Type IV, 500 bar)', values:storMerge({}) },
    { id:'type1_200bar', label:'Type I steel cylinder, 200 bar', values:storMerge({ type:'I', V:0.05, p_max:2e7, p_min:1e6, D_i:0.229, BR:2.5, m_empty:60, m_target:100 }) },
    { id:'tube_trailer_III', label:'Tube trailer Type III, 300 bar', values:storMerge({ type:'III', V:0.35, p_max:3e7, p_min:3e6, D_i:0.55, m_empty:180, m_target:1000 }) },
    { id:'hrs_buffer_IV_950', label:'HRS buffer Type IV, 950 bar', values:storMerge({ type:'IV', V:0.1, p_max:9.5e7, p_min:2e7, D_i:0.3, m_empty:120, m_target:60 }) }
  ];
  function storSolve(inp) {
    var d = storMerge({}), k, v, i, w = [], M = 2.01588e-3, R = 8.314462618, s, r = {};
    function fail(m) { return { ok:false, error:m, warnings:[] }; }
    inp = inp || {};
    for (k in STOR_DEFAULTS) {
      if (!STOR_DEFAULTS.hasOwnProperty(k) || !inp.hasOwnProperty(k)) continue;
      v = inp[k];
      if (v !== undefined && v !== null && v !== '') d[k] = v;
    }
    for (k in d) {
      if (!d.hasOwnProperty(k) || k === 'level' || k === 'type') continue;
      d[k] = Number(d[k]);
      if (!isFinite(d[k])) return fail('Invalid numeric value for ' + k);
    }
    d.level = String(d.level); d.type = String(d.type);
    var chk = [
      [['I','II','III','IV'].indexOf(d.type) >= 0, 'type must be I, II, III or IV'],
      [d.V > 0, 'V must be > 0'],
      [d.p_max > d.p_min && d.p_min >= 0, 'Require p_max > p_min >= 0'],
      [d.p_max <= 1e8, 'p_max must be <= 1e8 Pa'],
      [d.T >= 200 && d.T <= 400, 'T must be within 200..400 K'],
      [d.m_target > 0, 'm_target must be > 0'],
      [d.D_i > 0, 'D_i must be > 0'],
      [d.BR >= 1, 'BR must be >= 1'],
      [d.m_empty >= 0, 'm_empty must be >= 0'],
      [d.UTS > 0, 'UTS must be > 0']
    ];
    for (i = 0; i < chk.length; i++) if (!chk[i][0]) return fail(chk[i][1]);
    try {
      s = C.eos.tp({ h2:1 }, d.T, d.p_max); r.rho_max = s.rho; r.Z_max = s.Z;
      if (d.p_min === 0) { r.rho_min = 0; r.Z_min = 1; }
      else { s = C.eos.tp({ h2:1 }, d.T, d.p_min); r.rho_min = s.rho; r.Z_min = s.Z; }
      if (!(r.rho_max > 0) || !(r.rho_min >= 0)) throw new Error('Non-physical density from EOS');
      r.rho_ig_max = d.p_max * M / (R * d.T);
      r.ideal_err = r.rho_ig_max / r.rho_max - 1;
      r.m_full = r.rho_max * d.V; r.m_res = r.rho_min * d.V; r.m_use = r.m_full - r.m_res;
      if (!(r.m_use > 0)) throw new Error('Usable mass is not positive');
      r.util = r.m_use / r.m_full;
      r.N = Math.ceil(d.m_target / r.m_use);
      r.V_total = r.N * d.V; r.m_stored_total = r.N * r.m_full;
      r.gravimetric = r.m_full / (r.m_full + d.m_empty); r.volumetric = r.m_full / d.V;
      r.p_burst_min = d.BR * d.p_max;
      r.t_wall = d.type === 'I' ? r.p_burst_min * d.D_i / (2 * d.UTS) : null;
      r.E_use_MWh = r.N * r.m_use * H2_LHV_MJ / 3600;
    } catch (e) { return fail('EOS/calculation error: ' + (e && e.message ? e.message : String(e))); }
    if (r.Z_max > 1.2) w.push('Z_max = ' + r.Z_max.toFixed(3) + ' > 1.2: ideal gas overestimates mass by ' + (r.ideal_err * 100).toFixed(1) + ' %');
    if (d.type === 'I' && d.p_max > 3e7) w.push('Type I (all-metal) above 300 bar: check hydrogen embrittlement and vessel mass');
    if (d.type === 'IV' && (d.T < 233.15 || d.T > 358.15)) w.push('Type IV: T outside 233.15..358.15 K (EN 17533:2020 service range -40..85 C)');
    if (d.p_min / d.p_max > 0.5) w.push('p_min/p_max > 0.5: low utilisation (' + (r.util * 100).toFixed(1) + ' %)');
    return { ok:true, warnings:w, rho_max:r.rho_max, rho_min:r.rho_min, Z_max:r.Z_max, Z_min:r.Z_min,
      rho_ig_max:r.rho_ig_max, ideal_err:r.ideal_err, m_full:r.m_full, m_res:r.m_res, m_use:r.m_use,
      util:r.util, N:r.N, V_total:r.V_total, m_stored_total:r.m_stored_total, gravimetric:r.gravimetric,
      volumetric:r.volumetric, p_burst_min:r.p_burst_min, t_wall:r.t_wall, E_use_MWh:r.E_use_MWh,
      basis:H2_LHV_TXT + ' (25 C)', verdict:w.length ? 'check' : 'ok',
      breakdown:{ usable_kg:r.N * r.m_use, cushion_kg:r.N * r.m_res } };
  }

  // Electrolyser sizing (ES5) by Claude: cell polarisation curve, degradation, system balance
  // E_rev: liquid feed (PEM, AEL) E0 = 1.229 - 0.9e-3 (T - 298.15) (LeRoy 1980 approximation);
  //        steam feed (SOEC) E0 = 1.253 - 2.4516e-4 T (Ni, Leung, Leung 2007); Nernst with partial pressures in bar.
  // eta_act = (R T / (alpha F)) asinh(j / (2 j0)) (lumped Butler-Volmer); eta_ohm = ASR j.
  var ELEC_F = 96485.33212, ELEC_R = 8.314462618, ELEC_MH2 = 2.01588e-3, ELEC_LHV = H2_LHV_MJ * 1e6, ELEC_HHV = H2_HHV_MJ * 1e6; // ISO 6976:2016 via ogh-core (c00_iso.js)
  var ELEC_TECH = {
    PEM:  { T: 353.15, j: 2.0e4, p_c: 3.0e6, p_a: 1.0e5, ASR: 1.2e-5, j0: 5, alpha: 0.5, eta_F: 0.99, e_bop: 3.0, deg_uV_h: 2, life_h: 60000, steam: false },
    AEL:  { T: 353.15, j: 4.0e3, p_c: 1.0e5, p_a: 1.0e5, ASR: 2.5e-5, j0: 1, alpha: 0.5, eta_F: 0.98, e_bop: 4.0, deg_uV_h: 1.5, life_h: 80000, steam: false },
    SOEC: { T: 1023.15, j: 6.0e3, p_c: 1.0e5, p_a: 1.0e5, ASR: 3.0e-5, j0: 2000, alpha: 0.5, eta_F: 1.0, e_bop: 3.0, deg_uV_h: 8, life_h: 20000, steam: true }
  };
  var ELEC_DEFAULTS = { level: 'simple', tech: 'PEM', P_AC: 20e6, j: 2.0e4, T: 353.15, p_c: 3.0e6, p_a: 1.0e5, ASR: 1.2e-5, j0: 5, alpha: 0.5,
    eta_F: 0.99, eta_rect: 0.97, e_bop: 3.0, A_cell: 0.1, cells_stack: 100, FLH: 5000, deg_uV_h: 2, life_h: 60000, U_steam: 0.7, x_H2O_in: 0.9 };
  function elecTech(t, over) {
    var b = ELEC_TECH[t], r = {}, k;
    for (k in ELEC_DEFAULTS) if (ELEC_DEFAULTS.hasOwnProperty(k)) r[k] = ELEC_DEFAULTS[k];
    for (k in b) if (b.hasOwnProperty(k) && k !== 'steam') r[k] = b[k];
    r.tech = t;
    for (k in over) if (over.hasOwnProperty(k)) r[k] = over[k];
    return r;
  }
  var ELEC_PRESETS = [
    { id: 'default', label: 'PEM 20 MW, 30 bar H2 (default)', values: elecTech('PEM', {}) },
    { id: 'ael_100', label: 'Alkaline 100 MW, atmospheric', values: elecTech('AEL', { P_AC: 100e6, A_cell: 2.5, cells_stack: 300, FLH: 6000 }) },
    { id: 'soec_10', label: 'SOEC 10 MW, steam at 750 C', values: elecTech('SOEC', { P_AC: 10e6, A_cell: 0.01, cells_stack: 100, FLH: 7500 }) },
    { id: 'pem_offgrid', label: 'PEM 5 MW on solar PV (2000 h/y)', values: elecTech('PEM', { P_AC: 5e6, FLH: 2000 }) }
  ];
  function elecErev(d, T) {
    var steam = d.tech === 'SOEC', b = ELEC_R * T / (2 * ELEC_F), pc = d.p_c / 1e5, pa = d.p_a / 1e5, E0, xH2, xH2O;
    if (!steam) {
      E0 = 1.229 - 0.9e-3 * (T - 298.15);
      return E0 + b * Math.log(pc * Math.sqrt(pa));
    }
    E0 = 1.253 - 2.4516e-4 * T;
    xH2O = d.x_H2O_in * (1 - d.U_steam / 2);
    xH2 = (1 - d.x_H2O_in) + d.x_H2O_in * d.U_steam / 2;
    return E0 + b * Math.log(xH2 * pc * Math.sqrt(pa) / (xH2O * pc));
  }
  function elecCell(d, j) {
    var E = elecErev(d, d.T), act = ELEC_R * d.T / (d.alpha * ELEC_F) * (Math.log(j / (2 * d.j0) + Math.sqrt(Math.pow(j / (2 * d.j0), 2) + 1))), ohm = d.ASR * j;
    return { E_rev: E, eta_act: act, eta_ohm: ohm, V: E + act + ohm };
  }
  function elecSolve(inp) {
    var w = [], k, v, i;
    function fail(m) { return { ok: false, error: m, warnings: [] }; }
    inp = inp || {};
    var tech = inp.tech || ELEC_DEFAULTS.tech;
    if (!ELEC_TECH[tech]) return fail('tech must be PEM, AEL or SOEC');
    var d = elecTech(tech, {});
    for (k in ELEC_DEFAULTS) {
      if (!ELEC_DEFAULTS.hasOwnProperty(k) || k === 'tech' || !inp.hasOwnProperty(k)) continue;
      v = inp[k];
      if (v !== undefined && v !== null && v !== '') d[k] = v;
    }
    for (k in d) {
      if (!d.hasOwnProperty(k) || k === 'level' || k === 'tech') continue;
      d[k] = Number(d[k]);
      if (!isFinite(d[k])) return fail('Invalid numeric value for ' + k);
    }
    var chk = [
      [d.P_AC > 0, 'P_AC must be > 0'], [d.j > 0, 'j must be > 0'], [d.T > 273.15, 'T must be above 273.15 K'],
      [d.p_c > 0 && d.p_a > 0, 'p_c and p_a must be > 0'], [d.ASR >= 0, 'ASR must be >= 0'], [d.j0 > 0, 'j0 must be > 0'],
      [d.alpha > 0 && d.alpha <= 2, 'alpha must be in (0, 2]'], [d.eta_F > 0 && d.eta_F <= 1, 'eta_F must be in (0, 1]'],
      [d.eta_rect > 0 && d.eta_rect <= 1, 'eta_rect must be in (0, 1]'], [d.e_bop >= 0, 'e_bop must be >= 0'],
      [d.A_cell > 0, 'A_cell must be > 0'], [d.cells_stack >= 1 && d.cells_stack === Math.floor(d.cells_stack), 'cells_stack must be a positive integer'],
      [d.FLH > 0 && d.FLH <= 8760, 'FLH must be in (0, 8760] h/y'], [d.deg_uV_h >= 0, 'deg_uV_h must be >= 0'], [d.life_h > 0, 'life_h must be > 0'],
      [d.U_steam > 0 && d.U_steam < 1, 'U_steam must be in (0, 1)'], [d.x_H2O_in > 0 && d.x_H2O_in < 1, 'x_H2O_in must be in (0, 1)']
    ];
    for (i = 0; i < chk.length; i++) if (!chk[i][0]) return fail(chk[i][1]);
    if (tech !== 'SOEC' && d.T > 373.15) return fail('Liquid-water electrolysis (PEM, AEL) needs T <= 373.15 K');
    if (tech === 'SOEC' && (d.T < 873.15 || d.T > 1173.15)) return fail('SOEC needs T in 873.15..1173.15 K');
    var c = elecCell(d, d.j), V = c.V, dV_life = d.deg_uV_h * 1e-6 * d.life_h, V_eol = V + dV_life, V_avg = V + dV_life / 2;
    var U_tn = tech === 'SOEC' ? 1.285 : 1.481;
    // per kg H2: charge 2F/M (C/kg) / eta_F
    var q = 2 * ELEC_F / (ELEC_MH2 * d.eta_F);
    var e_dc = q * V / 3.6e6, e_dc_avg = q * V_avg / 3.6e6, e_dc_eol = q * V_eol / 3.6e6;
    var e_sys = e_dc / d.eta_rect + d.e_bop, e_sys_avg = e_dc_avg / d.eta_rect + d.e_bop, e_sys_eol = e_dc_eol / d.eta_rect + d.e_bop;
    var mdot = d.P_AC / (e_sys * 3.6e6); // kg/s at BOL rated power
    var P_DC = mdot * e_dc * 3.6e6, P_bop = mdot * d.e_bop * 3.6e6, I = P_DC / V;
    var N_cells = Math.ceil(I / (d.j * d.A_cell)), N_stacks = Math.ceil(N_cells / d.cells_stack);
    var Q_stack = (V - U_tn) * I;
    var water = mdot * 8.937, o2 = mdot * 7.937;
    var m_year = d.P_AC * d.FLH * 3600 / (e_sys_avg * 3.6e6) / 1000;
    var e_steam = tech === 'SOEC' ? 8.937 * 2612.6e3 / 3.6e6 : 0;
    var curve = [], jj, cc;
    for (i = 1; i <= 24; i++) { jj = d.j * 1.5 * i / 24; cc = elecCell(d, jj); curve.push({ j: jj, V: cc.V, E_rev: cc.E_rev, act: cc.eta_act }); }
    if (tech === 'PEM' && (d.j < 5e3 || d.j > 4e4)) w.push('PEM current density outside the usual 0.5-4 A/cm2 range');
    if (tech === 'AEL' && (d.j < 1e3 || d.j > 1e4)) w.push('Alkaline current density outside the usual 0.1-1 A/cm2 range');
    if (tech === 'SOEC' && V > 1.5) w.push('SOEC cell voltage above 1.5 V: risk of electrode delamination; lower j');
    if (tech !== 'SOEC' && V > 2.2) w.push('Cell voltage above 2.2 V: high heat load and fast degradation');
    if (d.FLH / 8760 < 0.25) w.push('Fewer than 2190 full-load hours per year: capital cost dominates the hydrogen cost');
    if (d.life_h / d.FLH < 5) w.push('Stack replacement within ' + (d.life_h / d.FLH).toFixed(1) + ' years');
    return { ok: true, warnings: w, tech: tech, E_rev: c.E_rev, eta_act: c.eta_act, eta_ohm: c.eta_ohm, V_cell: V, V_eol: V_eol, V_avg: V_avg, U_tn: U_tn,
      eta_V_tn: U_tn / V, e_dc_kWh_kg: e_dc, e_sys_kWh_kg: e_sys, e_sys_avg_kWh_kg: e_sys_avg, e_sys_eol_kWh_kg: e_sys_eol,
      eta_sys_LHV: ELEC_LHV / 3.6e6 / e_sys, eta_sys_HHV: ELEC_HHV / 3.6e6 / e_sys, mdot: mdot, mdot_kg_h: mdot * 3600, m_year_t: m_year,
      P_DC: P_DC, P_bop: P_bop, I_total: I, N_cells: N_cells, N_stacks: N_stacks, Q_stack: Q_stack, water_kg_h: water * 3600, o2_kg_h: o2 * 3600,
      e_steam_th_kWh_kg: e_steam, stack_years: d.life_h / d.FLH, curve: curve, basis: H2_LHV_TXT + ', ' + H2_HHV_TXT + ' (25 C)',
      verdict: w.length ? 'check' : 'ok', breakdown: { stack_dc_kWh_kg: e_dc, rectifier_loss_kWh_kg: e_dc / d.eta_rect - e_dc, bop_kWh_kg: d.e_bop } };
  }

  // Blue hydrogen SMR/ATR mass and energy balance with CO2 capture (ES5), by Claude
  // Reformer outlet: chemical equilibrium of CH4 + H2O = CO + 3H2 and CO + H2O = CO2 + H2 at T_ref, p
  //   Kp1 = exp(-26830/T + 30.114) bar^2, Kp2 = exp(4400/T - 4.036) (Xu & Froment 1989; Twigg, Catalyst Handbook)
  // Shift: WGS equilibrium at T_shift; PSA recovers R of the H2; heavier alkanes fully pre-reformed (element balance).
  // Reformer duty from 25 C formation enthalpies + mean cp (298-1100 K); SMR furnace burns PSA tail gas + trim NG at eta_f.
  // LHV per ISO 6976:2016 at 25 C (kJ/mol) from the verified ogh-core data (isoHi25, c00_iso.js): CH4 802.55, C2H6 1428.65, C3H8 2043.12, H2 241.82, CO 282.98.
  var SMR_SP = {
    ch4:  { C: 1, H: 4, hf: -74.87,  cp: 54.0,  lhv: isoHi25('ch4') },
    c2h6: { C: 2, H: 6, hf: -84.0,   cp: 85.0,  lhv: isoHi25('c2h6') },
    c3h8: { C: 3, H: 8, hf: -104.7,  cp: 120.0, lhv: isoHi25('c3h8') },
    co2:  { C: 1, H: 0, hf: -393.51, cp: 48.5,  lhv: 0 },
    n2:   { C: 0, H: 0, hf: 0,       cp: 30.9,  lhv: 0 },
    h2:   { C: 0, H: 2, hf: 0,       cp: 29.7,  lhv: isoHi25('h2') },
    co:   { C: 1, H: 0, hf: -110.53, cp: 31.6,  lhv: isoHi25('co') },
    h2o:  { C: 0, H: 2, hf: -241.83, cp: 37.0,  lhv: 0 },
    o2:   { C: 0, H: 0, hf: 0,       cp: 32.5,  lhv: 0 }
  };
  var SMR_DEFAULTS = { level: 'simple', process: 'SMR', capture: 'syngas_flue', cap_t_d: 300,
    x_ch4: 0.93, x_c2h6: 0.04, x_c3h8: 0.01, x_co2: 0.01, x_n2: 0.01,
    SC: 3.0, OC: 0.55, T_ref: 1173.15, p_ref: 2.5e6, T_in: 773.15, T_shift: 473.15, R_psa: 0.89, eta_f: 0.75,
    r_syn: 0.95, r_flue: 0.90, e_reb: 2.7, eta_boiler: 0.9, e_comp: 100, e_asu: 0.25, e_aux: 0.5, CI_up: 8.0, EF_el: 0.25 };
  function smrMerge(o) { var r = {}, k; for (k in SMR_DEFAULTS) if (SMR_DEFAULTS.hasOwnProperty(k)) r[k] = SMR_DEFAULTS[k]; for (k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }
  var SMR_PRESETS = [
    { id: 'default', label: 'SMR 300 t/d with syngas + flue gas capture (default)', values: smrMerge({}) },
    { id: 'smr_grey', label: 'SMR 300 t/d without capture (grey)', values: smrMerge({ capture: 'none' }) },
    { id: 'smr_syngas', label: 'SMR 300 t/d, syngas capture only', values: smrMerge({ capture: 'syngas' }) },
    { id: 'atr_blue', label: 'ATR 1000 t/d with capture', values: smrMerge({ process: 'ATR', cap_t_d: 1000, SC: 1.5, T_ref: 1323.15, p_ref: 3.5e6, T_in: 873.15, capture: 'syngas', e_aux: 0.7 }) }
  ];
  function smrKp1(T) { return Math.exp(-26830 / T + 30.114); }
  function smrKp2(T) { return Math.exp(4400 / T - 4.036); }
  // equilibrium for given element totals (mol C, H, O) plus inert; returns species moles
  function smrEquil(nC, nH, nO, nIn, T, pbar) {
    var K1 = smrKp1(T), K2 = smrKp2(T);
    function given(a) { // a = CH4; solve b = CO from WGS by bisection, return state
      var cRest = nC - a, lo = 0, hi = cRest, b, s, i;
      function st(bb) { var co2 = cRest - bb, h2o = nO - bb - 2 * co2, h2 = (nH - 4 * a - 2 * h2o) / 2; return { ch4: a, co: bb, co2: co2, h2o: h2o, h2: h2 }; }
      for (i = 0; i < 100; i++) { b = 0.5 * (lo + hi); s = st(b); if (s.co2 * s.h2 - K2 * b * s.h2o > 0) lo = b; else hi = b; }
      return st(0.5 * (lo + hi));
    }
    var lo = 0, hi = nC, a, s, f, i, ntot;
    for (i = 0; i < 100; i++) {
      a = 0.5 * (lo + hi); s = given(a);
      ntot = s.ch4 + s.co + s.co2 + s.h2o + s.h2 + nIn;
      f = s.co * Math.pow(s.h2, 3) * Math.pow(pbar / ntot, 2) - K1 * s.ch4 * s.h2o;
      if (!(s.h2 > 0) || !(s.h2o > 0)) { lo = a; continue; }
      if (f > 0) lo = a; else hi = a;
    }
    return given(0.5 * (lo + hi));
  }
  function smrShift(s, T) { // WGS equilibrium at T, CH4 frozen
    var K = smrKp2(T), lo = -s.co2, hi = s.co, d, i, f;
    for (i = 0; i < 100; i++) { d = 0.5 * (lo + hi); f = (s.co2 + d) * (s.h2 + d) - K * (s.co - d) * (s.h2o - d); if (f < 0) lo = d; else hi = d; }
    d = 0.5 * (lo + hi);
    return { ch4: s.ch4, co: s.co - d, co2: s.co2 + d, h2o: s.h2o - d, h2: s.h2 + d };
  }
  function smrSolve(inp) {
    var d = smrMerge({}), k, v, i, w = [];
    function fail(m) { return { ok: false, error: m, warnings: [] }; }
    inp = inp || {};
    for (k in SMR_DEFAULTS) { if (!SMR_DEFAULTS.hasOwnProperty(k) || !inp.hasOwnProperty(k)) continue; v = inp[k]; if (v !== undefined && v !== null && v !== '') d[k] = v; }
    for (k in d) { if (!d.hasOwnProperty(k) || k === 'level' || k === 'process' || k === 'capture') continue; d[k] = Number(d[k]); if (!isFinite(d[k])) return fail('Invalid numeric value for ' + k); }
    if (d.process !== 'SMR' && d.process !== 'ATR') return fail('process must be SMR or ATR');
    if (['none', 'syngas', 'syngas_flue'].indexOf(d.capture) < 0) return fail('capture must be none, syngas or syngas_flue');
    if (d.process === 'ATR' && d.capture === 'syngas_flue') d.capture = 'syngas';
    var xs = d.x_ch4 + d.x_c2h6 + d.x_c3h8 + d.x_co2 + d.x_n2;
    if (!(Math.abs(xs - 1) < 1e-3) || d.x_ch4 <= 0 || d.x_c2h6 < 0 || d.x_c3h8 < 0 || d.x_co2 < 0 || d.x_n2 < 0) return fail('NG mole fractions must be >= 0 and sum to 1');
    var chk = [[d.cap_t_d > 0, 'cap_t_d must be > 0'], [d.SC >= 1 && d.SC <= 6, 'SC must be in 1..6'], [d.OC >= 0.3 && d.OC <= 0.8, 'OC must be in 0.3..0.8'],
      [d.T_ref >= 873.15 && d.T_ref <= 1373.15, 'T_ref must be in 873.15..1373.15 K'], [d.p_ref >= 1e5 && d.p_ref <= 6e6, 'p_ref must be in 1..60 bar'],
      [d.T_in >= 573.15 && d.T_in < d.T_ref, 'T_in must be >= 573.15 K and below T_ref'], [d.T_shift >= 453.15 && d.T_shift <= 773.15, 'T_shift must be in 453.15..773.15 K'],
      [d.R_psa > 0.5 && d.R_psa <= 0.95, 'R_psa must be in 0.5..0.95'], [d.eta_f > 0.3 && d.eta_f <= 1, 'eta_f must be in 0.3..1'],
      [d.r_syn >= 0 && d.r_syn <= 0.99, 'r_syn must be in 0..0.99'], [d.r_flue >= 0 && d.r_flue <= 0.99, 'r_flue must be in 0..0.99'],
      [d.e_reb >= 0 && d.eta_boiler > 0 && d.eta_boiler <= 1, 'invalid capture heat inputs'], [d.e_comp >= 0 && d.e_asu >= 0 && d.e_aux >= 0, 'electricity inputs must be >= 0'],
      [d.CI_up >= 0 && d.EF_el >= 0, 'emission factors must be >= 0']];
    for (i = 0; i < chk.length; i++) if (!chk[i][0]) return fail(chk[i][1]);
    var ng = { ch4: d.x_ch4, c2h6: d.x_c2h6, c3h8: d.x_c3h8, co2: d.x_co2, n2: d.x_n2 };
    var nC_ng = 0, nH_ng = 0, lhv_ng = 0, hf_ng = 0, cp_ng = 0, M_ng = 0, Mi = { ch4: 16.043, c2h6: 30.069, c3h8: 44.096, co2: 44.0095, n2: 28.0134 };
    for (k in ng) { nC_ng += ng[k] * SMR_SP[k].C; nH_ng += ng[k] * SMR_SP[k].H; lhv_ng += ng[k] * SMR_SP[k].lhv; hf_ng += ng[k] * SMR_SP[k].hf; cp_ng += ng[k] * SMR_SP[k].cp; M_ng += ng[k] * Mi[k]; }
    var nHC = nC_ng - d.x_co2; // hydrocarbon carbon per mol NG (basis for S/C and O2/C)
    var steam = d.SC * nHC, o2 = d.process === 'ATR' ? d.OC * nHC : 0;
    var nC = nC_ng, nH = nH_ng + 2 * steam, nO = 2 * d.x_co2 + steam + 2 * o2, pbar = d.p_ref / 1e5;
    var out = smrEquil(nC, nH, nO, d.x_n2, d.T_ref, pbar);
    if (!(out.h2 > 0) || !(out.h2o > 0)) return fail('No physical equilibrium: check S/C and O2/C');
    // reformer duty per mol NG (J): outlet at T_ref minus inlet (NG + steam + O2) at T_in, 25 C formation enthalpy basis
    var Hout = 0, sp;
    for (sp in out) Hout += out[sp] * (SMR_SP[sp].hf * 1e3 + SMR_SP[sp].cp * (d.T_ref - 298.15));
    Hout += d.x_n2 * SMR_SP.n2.cp * (d.T_ref - 298.15);
    var Hin = hf_ng * 1e3 + cp_ng * (d.T_in - 298.15) + steam * (SMR_SP.h2o.hf * 1e3 + SMR_SP.h2o.cp * (d.T_in - 298.15)) + o2 * SMR_SP.o2.cp * (d.T_in - 298.15);
    var Q_ref = Hout - Hin;
    var sh = smrShift(out, d.T_shift);
    var h2_prod = d.R_psa * sh.h2; // mol H2 per mol NG feed
    var capSyn = d.capture === 'none' ? 0 : d.r_syn * sh.co2;
    var tail = { h2: sh.h2 - h2_prod, ch4: sh.ch4, co: sh.co, co2: sh.co2 - capSyn };
    var lhv_tail = (tail.h2 * SMR_SP.h2.lhv + tail.ch4 * SMR_SP.ch4.lhv + tail.co * SMR_SP.co.lhv) * 1e3;
    var trim = 0, Q_fuel = 0, excess = 0;
    if (d.process === 'SMR') {
      Q_fuel = Q_ref / d.eta_f;
      trim = Math.max(0, (Q_fuel - lhv_tail) / (lhv_ng * 1e3));
      excess = Math.max(0, lhv_tail - Q_fuel);
    } else {
      excess = lhv_tail; // ATR: tail gas fires the feed preheater; any surplus raises steam/power
    }
    var flueC = tail.ch4 + tail.co + tail.co2 + trim * nC_ng; // mol CO2 per mol NG feed
    var capFlue = 0, boil = 0;
    if (d.capture === 'syngas_flue') { // boiler NG for solvent regeneration, boiler flue also captured
      var qPerMolCO2 = d.e_reb * 1e6 * 44.0095e-3; // J per mol CO2 captured (GJ/t = MJ/kg)
      boil = d.r_flue * flueC * qPerMolCO2 / (d.eta_boiler * lhv_ng * 1e3 - d.r_flue * nC_ng * qPerMolCO2);
      if (!(boil >= 0)) return fail('Capture heat demand cannot be met by the boiler');
      capFlue = d.r_flue * (flueC + boil * nC_ng);
    }
    var co2Gen = sh.co2 + tail.ch4 + tail.co + (trim + boil) * nC_ng, co2Cap = capSyn + capFlue, co2Emit = co2Gen - co2Cap;
    // per kg H2
    var molH2perKg = 1 / 2.01588e-3, perKg = molH2perKg / h2_prod; // mol NG feed per kg H2
    var ngTot = (1 + trim + boil) * perKg; // mol NG per kg H2
    var e_ng = ngTot * lhv_ng / 1e3; // MJ LHV per kg H2
    var co2e = co2Emit * perKg * 44.0095e-3, co2c = co2Cap * perKg * 44.0095e-3, co2g = co2Gen * perKg * 44.0095e-3;
    var el = d.e_aux + d.e_comp * co2c / 1000 + (d.process === 'ATR' ? d.e_asu * o2 * perKg * 31.9988e-3 : 0); // kWh/kg H2
    var CI = co2e + e_ng * d.CI_up / 1000 + el * d.EF_el;
    var mdot = d.cap_t_d * 1000 / 86400;
    if (d.SC < 2.5 && d.process === 'SMR') w.push('S/C below 2.5: carbon formation risk on the reforming catalyst');
    if (d.process === 'ATR' && Q_ref > 0.02 * lhv_ng * 1e3) w.push('ATR outlet enthalpy above inlet: O2/C too low for the chosen outlet temperature');
    if (d.process === 'ATR' && Q_ref < -0.05 * lhv_ng * 1e3) w.push('ATR has a large heat surplus: O2/C could be reduced');
    if (d.process === 'SMR' && trim === 0) w.push('PSA tail gas exceeds the furnace demand: no trim fuel, surplus fuel ' + (excess / 1e3).toFixed(0) + ' kJ/mol NG');
    if (out.ch4 / nC > 0.15) w.push('Methane slip above 15 % of feed carbon: raise reformer temperature or S/C');
    return { ok: true, warnings: w, process: d.process, capture: d.capture,
      reformer_out: out, shift_out: sh, X_ch4: 1 - out.ch4 / nC_ng, h2_per_mol_ng: h2_prod, Q_ref_kJ_mol: Q_ref / 1e3,
      trim_frac: trim, boiler_frac: boil, e_ng_MJ_kg: e_ng, ng_kg_kg: ngTot * M_ng / 1000, eta_LHV: H2_LHV_MJ / e_ng,
      el_kWh_kg: el, co2_gen_kg_kg: co2g, co2_cap_kg_kg: co2c, co2_emit_kg_kg: co2e, cap_syn_kg_kg: capSyn * perKg * 44.0095e-3, cap_flue_kg_kg: capFlue * perKg * 44.0095e-3, cap_rate: co2Gen > 0 ? co2Cap / co2Gen : 0,
      CI_kg_kg: CI, CI_g_MJ: CI / H2_LHV_MJ * 1000, low_carbon: CI <= 3.38,
      mdot: mdot, ng_t_d: ngTot * M_ng / 1000 * d.cap_t_d, co2_cap_t_d: co2c * d.cap_t_d, co2_emit_t_d: co2e * d.cap_t_d, o2_t_d: o2 * perKg * 31.9988e-3 * d.cap_t_d,
      basis: H2_LHV_TXT + ' H2; NG LHV per ISO 6976:2016 at 25 C', verdict: CI <= 3.38 ? 'low_carbon' : 'above_threshold',
      breakdown: { direct_kg_kg: co2e, upstream_kg_kg: e_ng * d.CI_up / 1000, electricity_kg_kg: el * d.EF_el } };
  }

  // Hydrogen salt-cavern storage: working gas, cushion gas, withdrawal (ES5), by Claude
  // Pressure window from the lithostatic pressure at the last cemented casing shoe (Caglayan et al. 2020, IJHE 45:6793):
  //   p_lith = rho_rock g z, p_max = f_max p_lith, p_min = f_min p_lith; T = T_surf + grad_T z (isothermal storage).
  // Density from the Leachman (2009) normal-hydrogen EOS (C.eos.tp); energy on the LHV basis (119.96 MJ/kg, ISO 6976:2016 via c00_iso.js).
  // R2 (D-r2-1): optional compressor discharge p_inj (0 = not limiting) at the wellhead; with the static gas column
  //   p_shoe = p_inj + rho_bar g z (rho_bar at the column mean pressure and mean geothermal temperature, fixed-point iteration)
  //   the effective maximum pressure is p_max = min(f_max p_lith, p_shoe).
  var UGS_DEFAULTS = { level: 'simple', V: 500000, z: 1000, rho_rock: 2200, f_max: 0.8, f_min: 0.24, T_surf: 283.15, grad_T: 0.025, dp_day: 1.0e6, n_cyc: 4, p_inj: 0 };
  function ugsMerge(o) { var r = {}, k; for (k in UGS_DEFAULTS) if (UGS_DEFAULTS.hasOwnProperty(k)) r[k] = UGS_DEFAULTS[k]; for (k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }
  var UGS_PRESETS = [
    { id: 'default', label: 'Salt cavern 500 000 m3, casing shoe 1000 m (default)', values: ugsMerge({}) },
    { id: 'shallow', label: 'Shallow cavern 300 000 m3 at 600 m', values: ugsMerge({ V: 300000, z: 600 }) },
    { id: 'deep_large', label: 'Deep cavern 750 000 m3 at 1500 m', values: ugsMerge({ V: 750000, z: 1500 }) },
    { id: 'fast_cycling', label: 'Fast cycling, 20 cycles per year', values: ugsMerge({ n_cyc: 20, dp_day: 1.5e6, f_min: 0.3 }) }
  ];
  function ugsSolve(inp) {
    var d = ugsMerge({}), k, v, i, w = [], g = 9.80665, LHV = H2_LHV_MJ * 1e6;
    function fail(m) { return { ok: false, error: m, warnings: [] }; }
    inp = inp || {};
    for (k in UGS_DEFAULTS) { if (!UGS_DEFAULTS.hasOwnProperty(k) || !inp.hasOwnProperty(k)) continue; v = inp[k]; if (v !== undefined && v !== null && v !== '') d[k] = v; }
    for (k in d) { if (!d.hasOwnProperty(k) || k === 'level') continue; d[k] = Number(d[k]); if (!isFinite(d[k])) return fail('Invalid numeric value for ' + k); }
    var chk = [[d.V > 0, 'V must be > 0'], [d.z >= 200 && d.z <= 3000, 'z must be in 200..3000 m'], [d.rho_rock >= 1800 && d.rho_rock <= 3000, 'rho_rock must be in 1800..3000 kg/m3'],
      [d.f_max > d.f_min && d.f_max <= 1, 'Require f_min < f_max <= 1'], [d.f_min > 0, 'f_min must be > 0'], [d.T_surf >= 263.15 && d.T_surf <= 313.15, 'T_surf must be in 263.15..313.15 K'],
      [d.grad_T >= 0 && d.grad_T <= 0.08, 'grad_T must be in 0..0.08 K/m'], [d.dp_day > 0, 'dp_day must be > 0'], [d.n_cyc > 0 && d.n_cyc <= 365, 'n_cyc must be in (0, 365]'], [d.p_inj >= 0 && d.p_inj <= 1e8, 'p_inj must be in 0..100 MPa']];
    for (i = 0; i < chk.length; i++) if (!chk[i][0]) return fail(chk[i][1]);
    var p_lith = d.rho_rock * g * d.z, p_max_lith = d.f_max * p_lith, p_min = d.f_min * p_lith, T = d.T_surf + d.grad_T * d.z;
    if (p_max_lith > 1e8) return fail('p_max above 100 MPa (EOS range)');
    var p_max = p_max_lith, p_shoe = null, rho_col = null, limited = false, it, pb, slith;
    try {
      if (d.p_inj > 0) {
        pb = d.p_inj;
        for (it = 0; it < 50; it++) {
          rho_col = C.eos.tp({ h2: 1 }, d.T_surf + 0.5 * d.grad_T * d.z, 0.5 * (d.p_inj + pb)).rho;
          v = d.p_inj + rho_col * g * d.z;
          if (Math.abs(v - pb) < 1e-3) { pb = v; break; }
          pb = v;
        }
        p_shoe = pb;
        if (p_shoe < p_max_lith) { p_max = p_shoe; limited = true; }
        if (p_max <= p_min) return fail('p_inj too low: pressure at the casing shoe ' + (p_shoe / 1e5).toFixed(1) + ' bar is not above p_min ' + (p_min / 1e5).toFixed(1) + ' bar');
      }
    } catch (e0) { return fail('EOS error: ' + (e0 && e0.message ? e0.message : String(e0))); }
    var smax, smin, sd;
    try { smax = C.eos.tp({ h2: 1 }, T, p_max); smin = C.eos.tp({ h2: 1 }, T, p_min); slith = limited ? C.eos.tp({ h2: 1 }, T, p_max_lith) : smax; }
    catch (e) { return fail('EOS error: ' + (e && e.message ? e.message : String(e))); }
    var m_wg = d.V * (smax.rho - smin.rho), m_cush = d.V * smin.rho, m_tot = d.V * smax.rho, m_wg_lith = d.V * (slith.rho - smin.rho), wg_loss = 1 - m_wg / m_wg_lith;
    // withdrawal limited by the allowed pressure drop per day, evaluated from the density slope at mid pressure
    var pm = 0.5 * (p_max + p_min), dp = Math.min(d.dp_day, p_max - p_min), s1, s2;
    try { s1 = C.eos.tp({ h2: 1 }, T, pm + dp / 2); s2 = C.eos.tp({ h2: 1 }, T, pm - dp / 2); }
    catch (e2) { return fail('EOS error: ' + (e2 && e2.message ? e2.message : String(e2))); }
    var mdot_day = d.V * (s1.rho - s2.rho); // kg/day at the allowed pressure rate
    var days_empty = m_wg / mdot_day, cyc_max = 365 / (2 * days_empty);
    var thr = Math.min(d.n_cyc, cyc_max) * m_wg;
    if (limited) w.push('Compressor discharge ' + (d.p_inj / 1e5).toFixed(1) + ' bar limits the maximum cavern pressure to ' + (p_max / 1e5).toFixed(1) + ' bar (lithostatic limit ' + (p_max_lith / 1e5).toFixed(1) + ' bar): working gas -' + (wg_loss * 100).toFixed(1) + ' %');
    if (d.n_cyc > cyc_max) w.push('Requested ' + d.n_cyc + ' cycles per year exceeds the ' + cyc_max.toFixed(1) + ' allowed by the pressure-rate limit');
    if (d.f_min < 0.2) w.push('Minimum pressure below 20 % of lithostatic: cavern creep and roof stability concerns');
    if (d.f_max > 0.85) w.push('Maximum pressure above 85 % of lithostatic: frac and integrity risk');
    if (d.z < 500) w.push('Casing shoe shallower than 500 m: low working gas density');
    if (d.z > 1800) w.push('Casing shoe deeper than 1800 m: high creep closure in salt');
    return { ok: true, warnings: w, p_lith: p_lith, p_max: p_max, p_max_lith: p_max_lith, p_inj: d.p_inj, p_shoe_inj: p_shoe, rho_col: rho_col, limited: limited, wg_loss: wg_loss, m_wg_lith_t: m_wg_lith / 1000, p_min: p_min, T: T, rho_max: smax.rho, rho_min: smin.rho, Z_max: smax.Z, Z_min: smin.Z,
      m_wg_t: m_wg / 1000, m_cush_t: m_cush / 1000, m_tot_t: m_tot / 1000, cushion_ratio: m_cush / m_tot, E_wg_GWh: m_wg * LHV / 3.6e12,
      ideal_err: p_max * 2.01588e-3 / (8.314462618 * T) / smax.rho - 1, mdot_max_t_d: mdot_day / 1000, days_empty: days_empty, cyc_max: cyc_max,
      thr_t_y: thr / 1000, thr_GWh_y: thr * LHV / 3.6e12, basis: H2_LHV_TXT + ' (25 C)', verdict: w.length ? 'check' : 'ok',
      breakdown: { working_t: m_wg / 1000, cushion_t: m_cush / 1000 } };
  }

  // glue: para-H2 saturation table generated with CoolProp 8.0.0 (Leachman 2009 para EOS): [p bar, T K, rho_l, rho_v kg/m3, h_fg kJ/kg]
  var LH2_SAT = [
    [1, 20.2269, 70.8787, 1.32279, 446.265],
    [1.25, 21.0012, 69.9754, 1.61928, 442.362],
    [1.5, 21.6711, 69.1575, 1.91293, 438.204],
    [1.75, 22.2654, 68.4016, 2.20508, 433.867],
    [2, 22.802, 67.6928, 2.49668, 429.396],
    [2.25, 23.2929, 67.0208, 2.78848, 424.816],
    [2.5, 23.7466, 66.3785, 3.08104, 420.144],
    [2.75, 24.1694, 65.7603, 3.37486, 415.392],
    [3, 24.5658, 65.1621, 3.67036, 410.566],
    [3.25, 24.9396, 64.5804, 3.96792, 405.671],
    [3.5, 25.2938, 64.0126, 4.26789, 400.71],
    [3.75, 25.6305, 63.4563, 4.5706, 395.682],
    [4, 25.9519, 62.9098, 4.87637, 390.59],
    [4.25, 26.2595, 62.3713, 5.18552, 385.431],
    [4.5, 26.5546, 61.8394, 5.49836, 380.205],
    [4.75, 26.8385, 61.3128, 5.81521, 374.909],
    [5, 27.1121, 60.7904, 6.1364, 369.541],
    [5.25, 27.3762, 60.271, 6.46227, 364.098],
    [5.5, 27.6317, 59.7536, 6.79318, 358.576],
    [5.75, 27.8791, 59.2374, 7.12951, 352.97],
    [6, 28.1191, 58.7215, 7.47167, 347.277],
    [6.25, 28.3522, 58.2048, 7.8201, 341.49],
    [6.5, 28.5788, 57.6866, 8.17528, 335.605],
    [6.75, 28.7993, 57.1659, 8.53772, 329.614],
    [7, 29.0142, 56.6418, 8.90801, 323.51],
    [7.25, 29.2237, 56.1134, 9.28676, 317.284],
    [7.5, 29.4281, 55.5798, 9.6747, 310.928],
    [7.75, 29.6278, 55.0397, 10.0726, 304.431],
    [8, 29.8229, 54.4921, 10.4814, 297.781],
    [8.25, 30.0137, 53.9358, 10.902, 290.964],
    [8.5, 30.2004, 53.3693, 11.3357, 283.965],
    [8.75, 30.3832, 52.791, 11.7838, 276.765],
    [9, 30.5623, 52.1992, 12.2479, 269.344],
    [9.25, 30.7378, 51.5919, 12.7298, 261.676],
    [9.5, 30.9099, 50.9665, 13.2318, 253.731],
    [9.75, 31.0787, 50.3201, 13.7565, 245.475],
    [10, 31.2443, 49.6494, 14.3072, 236.863]
  ];
  // LH2 tank boil-off with heat leak and ortho-para self-conversion (ES5), by Claude
  // Petitpas (LLNL 2018) style balance at constant pressure with venting: dm/dt = -(Q_leak + m dH_op k x_o^2) / h_fg,
  // ortho fraction second order: dx_o/dt = -k x_o^2 (Scott 1957 rate constant ~0.0114 1/h); dH_op = 2 theta R / M (theta = 85.25 K).
  var LH2_DEFAULTS = { level: 'simple', V: 100, fill: 0.9, p: 1.2e5, shape: 'sphere', q: 1.0, xp0: 0.95, k: 0.0114, t_store: 30 };
  function lh2Merge(o) { var r = {}, k; for (k in LH2_DEFAULTS) if (LH2_DEFAULTS.hasOwnProperty(k)) r[k] = LH2_DEFAULTS[k]; for (k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }
  var LH2_PRESETS = [
    { id: 'default', label: '100 m3 sphere, 95 % para, 1.2 bar (default)', values: lh2Merge({}) },
    { id: 'normal_fill', label: 'Unconverted normal LH2 (25 % para)', values: lh2Merge({ xp0: 0.25 }) },
    { id: 'large_sphere', label: 'Large 4700 m3 sphere, 0.15 W/m2', values: lh2Merge({ V: 4700, q: 0.15, t_store: 90 }) },
    { id: 'trailer', label: 'Road trailer 50 m3 cylinder, 3 W/m2', values: lh2Merge({ V: 50, shape: 'cylinder', q: 3.0, p: 3e5, t_store: 10 }) }
  ];
  function lh2Sat(p) {
    var b = p / 1e5, i, a, c, f, r = {};
    if (b < LH2_SAT[0][0] || b > LH2_SAT[LH2_SAT.length - 1][0]) return null;
    for (i = 0; i < LH2_SAT.length - 1; i++) if (b <= LH2_SAT[i + 1][0]) break;
    a = LH2_SAT[i]; c = LH2_SAT[i + 1]; f = (b - a[0]) / (c[0] - a[0]);
    r.T = a[1] + f * (c[1] - a[1]); r.rho_l = a[2] + f * (c[2] - a[2]); r.rho_v = a[3] + f * (c[3] - a[3]); r.h_fg = (a[4] + f * (c[4] - a[4])) * 1e3;
    return r;
  }
  function lh2Solve(inp) {
    var d = lh2Merge({}), key, v, i, w = [];
    function fail(m) { return { ok: false, error: m, warnings: [] }; }
    inp = inp || {};
    for (key in LH2_DEFAULTS) { if (!LH2_DEFAULTS.hasOwnProperty(key) || !inp.hasOwnProperty(key)) continue; v = inp[key]; if (v !== undefined && v !== null && v !== '') d[key] = v; }
    for (key in d) { if (!d.hasOwnProperty(key) || key === 'level' || key === 'shape') continue; d[key] = Number(d[key]); if (!isFinite(d[key])) return fail('Invalid numeric value for ' + key); }
    if (d.shape !== 'sphere' && d.shape !== 'cylinder') return fail('shape must be sphere or cylinder');
    var chk = [[d.V > 0, 'V must be > 0'], [d.fill > 0 && d.fill <= 0.98, 'fill must be in (0, 0.98]'], [d.q >= 0, 'q must be >= 0'],
      [d.xp0 >= 0.25 && d.xp0 <= 1, 'xp0 must be in 0.25..1'], [d.k >= 0 && d.k <= 0.1, 'k must be in 0..0.1 1/h'], [d.t_store > 0 && d.t_store <= 365, 't_store must be in (0, 365] d']];
    for (i = 0; i < chk.length; i++) if (!chk[i][0]) return fail(chk[i][1]);
    var s = lh2Sat(d.p);
    if (!s) return fail('p must be within 1..10 bar (saturation table)');
    var A = d.shape === 'sphere' ? Math.pow(Math.PI, 1 / 3) * Math.pow(6 * d.V, 2 / 3) : (function () { var D = Math.pow(4 * d.V / (3 * Math.PI), 1 / 3); return Math.PI * D * 3 * D + Math.PI * D * D / 2; })();
    var Q = d.q * A, dH = 2 * 85.25 * 8.314462618 / 2.01588e-3, xo0 = 1 - d.xp0, m0 = d.fill * d.V * s.rho_l;
    var bor_leak = Q * 86400 / s.h_fg / m0 * 100, bor_conv = dH * d.k * xo0 * xo0 * 24 / s.h_fg * 100;
    // RK4 on m(t), t in hours, x_o(t) analytic
    function xo(t) { return xo0 / (1 + d.k * xo0 * t); }
    function f(t, m) { var x = xo(t); return -(Q * 3600 + m * dH * d.k * x * x) / s.h_fg; }
    var tEnd = d.t_store * 24, n = Math.ceil(tEnd / 0.1), h = tEnd / n, m = m0, t = 0, k1, k2, k3, k4, curve = [{ t: 0, m: m0, xo: xo0 }], every = Math.max(1, Math.round(n / 60));
    for (i = 0; i < n; i++) {
      k1 = f(t, m); k2 = f(t + h / 2, m + h * k1 / 2); k3 = f(t + h / 2, m + h * k2 / 2); k4 = f(t + h, m + h * k3);
      m += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6; t += h;
      if (m <= 0) return fail('Tank empties before the end of the storage period');
      if ((i + 1) % every === 0 || i === n - 1) curve.push({ t: t, m: m, xo: xo(t) });
    }
    var lost = m0 - m, lost_conv_only = m0 * (1 - Math.exp(-dH / s.h_fg * (xo0 - xo(tEnd))));
    if (d.xp0 < 0.9) w.push('Para fraction below 90 %: ortho-para conversion heat dominates boil-off; use catalytic conversion in the liquefier');
    if (bor_leak + bor_conv > 1) w.push('Initial boil-off above 1 %/day');
    if (d.p > 4e5) w.push('Storage pressure above 4 bar: high vapour density and lower liquid density');
    return { ok: true, warnings: w, T_sat: s.T, rho_l: s.rho_l, rho_v: s.rho_v, h_fg: s.h_fg, A: A, Q_leak: Q, m0_kg: m0, dH_op: dH,
      bor_leak_pct_d: bor_leak, bor_conv_pct_d: bor_conv, bor_total_pct_d: bor_leak + bor_conv, m_end_kg: m, lost_kg: lost, lost_pct: lost / m0 * 100,
      lost_conv_only_kg: lost_conv_only, xp_end: 1 - xo(tEnd), E_lost_MWh: lost * H2_LHV_MJ / 3600, curve: curve,
      basis: H2_LHV_TXT + ' (25 C); para-H2 saturation (Leachman 2009 via CoolProp table)', verdict: w.length ? 'check' : 'ok',
      breakdown: { heat_leak_W: Q, conversion_W_initial: m0 * dH * d.k * xo0 * xo0 / 3600 } };
  }

  OGH.h2prod = { VERSION: '0.1.0', tools: [] };
  if (typeof h2cSolve === 'function') { OGH.h2_compressor = { solve: h2cSolve, defaults: H2C_DEFAULTS, presets: H2C_PRESETS }; OGH.h2prod.tools.push('h2_compressor'); }
  if (typeof storSolve === 'function') { OGH.h2_storage_vessel = { solve: storSolve, defaults: STOR_DEFAULTS, presets: STOR_PRESETS }; OGH.h2prod.tools.push('h2_storage_vessel'); }
  if (typeof elecSolve === 'function') { OGH.electrolyser_sizing = { solve: elecSolve, defaults: ELEC_DEFAULTS, presets: ELEC_PRESETS, tech: ELEC_TECH }; OGH.h2prod.tools.push('electrolyser_sizing'); }
  if (typeof smrSolve === 'function') { OGH.blue_h2_smr_atr = { solve: smrSolve, defaults: SMR_DEFAULTS, presets: SMR_PRESETS }; OGH.h2prod.tools.push('blue_h2_smr_atr'); }
  if (typeof ugsSolve === 'function') { OGH.h2_underground_storage = { solve: ugsSolve, defaults: UGS_DEFAULTS, presets: UGS_PRESETS }; OGH.h2prod.tools.push('h2_underground_storage'); }
  if (typeof lh2Solve === 'function') { OGH.lh2_boiloff = { solve: lh2Solve, defaults: LH2_DEFAULTS, presets: LH2_PRESETS }; OGH.h2prod.tools.push('lh2_boiloff'); }
  if (typeof module !== 'undefined' && module.exports) module.exports = OGH;
})(typeof window !== 'undefined' ? window : globalThis);
