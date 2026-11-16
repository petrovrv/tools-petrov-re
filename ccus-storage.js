(function (root) { 'use strict'; var CCUS = root.CCUS = root.CCUS || {};

  // ---- Constants (SI) ----
  var G = 9.80665;          // m/s2
  var TC = 304.1282;        // K, CO2 critical temperature
  var PC = 7.3773e6;        // Pa, CO2 critical pressure
  var P_SC = 101325;        // Pa, standard pressure
  var T_SC = 288.15;        // K, standard temperature
  var MD = 9.869233e-16;    // m2 per millidarcy

  function getCore() {
    var c = CCUS.core;
    if (!c || typeof c.props !== 'function' || typeof c.sat !== 'function' || !c.econ || typeof c.econ.crf !== 'function') {
      throw new Error('ccus-storage: CCUS.core (props, sat, econ.crf) not loaded');
    }
    return c;
  }

  // ---- Helpers ----
  function bar(x) { return x * 1e5; }                          // bar -> Pa
  function mty(x) { return x * 1e9 / (365.25 * 86400); }       // Mt/y -> kg/s
  function C2K(c) { return c + 273.15; }                       // degC -> K

  // ---- Defaults: generic offshore saline aquifer ----
  var DEFAULTS = {
    type: 'saline', offshore: true,
    mdot: mty(1.5), years: 25,
    depth: 2000, T_surf: 277.15, gradT: 0.03,
    p_res: null, T_res: null,
    rho_brine: 1050, frac_grad: 15000, bhp_frac: 0.9,
    // saline
    area: 300e6, h: 100, phi: 0.2, ntg: 0.8, E: null, lith: 'clastic',
    Epct: { clastic: [0.0051, 0.020, 0.054], dolomite: [0.0064, 0.022, 0.055], limestone: [0.0040, 0.015, 0.041] },
    // depleted
    GIIP: 20e9, RF: 0.8, p_i: bar(350), Z_i: null, sg: 0.6, refill_frac: 0.95, E_dep: 0.7,
    // injectivity
    k: 200 * MD, krel: 0.4, re: 1000, rw: 0.108, S: 0,
    // wellbore
    ID: 0.1, eps: 4.5e-5, C_erosion: 100,
    T_wh: 283.15, thermal: 'linear', nSteps: 100,
    p_arrival: bar(100), spare_frac: 0.2, minSpare: 1,
    // economics
    cost: {
      well_on: 15e6, well_off: 60e6, platform: 'new',
      plat: { 'new': 250e6, subsea: 100e6, reuse: 50e6, none: 0 },
      mmv: 2, fixed_opex: 0.03, decom_frac: 0.15, rate: 0.08, life: 25, tariff: 60
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function merge(inp) {
    var s = clone(DEFAULTS), k;
    inp = inp || {};
    for (k in inp) {
      if (!Object.prototype.hasOwnProperty.call(inp, k) || k === 'cost') { continue; }
      s[k] = (inp[k] !== null && typeof inp[k] === 'object') ? clone(inp[k]) : inp[k];
    }
    if (inp.cost) {
      for (k in inp.cost) {
        if (!Object.prototype.hasOwnProperty.call(inp.cost, k) || k === 'plat') { continue; }
        s.cost[k] = inp.cost[k];
      }
      if (inp.cost.plat) {
        for (k in inp.cost.plat) {
          if (Object.prototype.hasOwnProperty.call(inp.cost.plat, k)) { s.cost.plat[k] = inp.cost.plat[k]; }
        }
      }
    }
    return s;
  }

  // ---- Presets: public-domain screening values (~), not project data ----
  var PRESETS = {
    'porthos-p18': {
      label: 'Porthos P18 (~)', group: 'Depleted gas field',
      // tubing 5-1/2in (ID 0.124 m = 17 lb/ft assumed): TAQA 'Porthos Basis of completion design' ECM 196564 (Commissie m.e.r. doc 00007536)
      // real project: 4 converted wells, SodM permit advice max 47 kg/s per well (erosion), normal 28 kg/s; screening gives 5+1 (generic RP14E/NORSOK limit, ~6 % over at 4 wells)
      // GIIP 25e9: P50 capacity ~37 Mt = published Porthos capacity (2026-10-22)
      inputs: { ID: 0.124, type: 'depleted', offshore: true, depth: 3300, p_res: bar(30), p_i: bar(375), T_res: 393.15,
        k: 150 * MD, h: 150, mdot: mty(2.5), GIIP: 25e9, cost: { platform: 'reuse' } }
    },
    'aramis': {
      label: 'Aramis L4-A (~)', group: 'Depleted gas field',
      // L4-A launch store (TotalEnergies): 2.5 Mt/a, 4 wells (2 sidetracks + 2 new), perforations ~3.8 km TVD, capacity 33.7-39.5 Mt (MER / permit docs, RVO 2024)
      // tubing 4-1/2in ID 0.100 m ASSUMED: LaunchStores 'friction control via small diameter tubing', no public size; GIIP 25e9 -> P50 ~37 Mt (2026-10-22)
      inputs: { ID: 0.1, type: 'depleted', offshore: true, depth: 3800, p_res: bar(45), p_i: bar(400), T_res: 398.15,
        k: 50 * MD, h: 150, mdot: mty(2.5), GIIP: 25e9, cost: { platform: 'reuse' } }
    },
    'nl-aurora': {
      label: 'Northern Lights Aurora (~)', group: 'Saline aquifer',
      inputs: { ID: 0.16, type: 'saline', offshore: true, depth: 2600, p_res: bar(260), T_res: 371.15,
        k: 200 * MD, h: 100, mdot: mty(1.5), area: 200e6, cost: { platform: 'subsea' } }
    },
    'sleipner-utsira': {
      label: 'Sleipner / Utsira (~)', group: 'Saline aquifer',
      inputs: { ID: 0.16, type: 'saline', offshore: true, depth: 1000, p_res: bar(100), T_res: 309.15,
        k: 2000 * MD, h: 200, mdot: mty(0.9), area: 500e6, phi: 0.35 }
    },
    'onshore-saline': {
      label: 'Generic onshore saline (~)', group: 'Saline aquifer',
      inputs: { type: 'saline', offshore: false, depth: 1800, p_res: bar(180), T_res: 333.15,
        k: 100 * MD, h: 50, mdot: mty(1), T_surf: 283.15, frac_grad: 16500, cost: { platform: 'none' } }
    }
  };
  // ---- c02: reservoir conditions and capacity ----
  const nz = (a, b) => (a == null ? b : a);
  const SEC_PER_YEAR = 365.25 * 86400;

  function rhoAt(core, p, T, label) {
    try {
      return core.props(p, T).rho;
    } catch (e) {
      if (e instanceof RangeError) {
        throw new RangeError(label + ': core.props out of range (p=' + p + ' Pa, T=' + T + ' K): ' + e.message);
      }
      throw e;
    }
  }

  function reservoir(s, warn) {
    const T_res = nz(s.T_res, s.T_surf + s.gradT * s.depth);
    const p_hyd = 101325 + s.rho_brine * G * s.depth;
    const p_res = nz(s.p_res, p_hyd);
    const p_frac = s.frac_grad * s.depth;
    const BHP_max = s.bhp_frac * p_frac;
    if (p_res >= BHP_max) {
      warn.push('p_res (' + (p_res / 1e5).toFixed(1) + ' bar) >= BHP_max (' + (BHP_max / 1e5).toFixed(1) + ' bar): no injection pressure margin');
    }
    if (s.depth < 800) warn.push('CO2 may not be dense, depth < 800 m');
    return { T_res, p_res, p_hyd, p_frac, BHP_max };
  }

  function zPapay(p, T, sg) {
    const Tpc = (169.2 + 349.5 * sg - 74.0 * sg * sg) * 5 / 9;        // R -> K
    const Ppc = (756.8 - 131.0 * sg - 3.6 * sg * sg) * 6894.757293;    // psia -> Pa
    const Ppr = p / Ppc;
    const Tpr = T / Tpc;
    return 1 - 3.53 * Ppr / Math.pow(10, 0.9813 * Tpr) + 0.274 * Ppr * Ppr / Math.pow(10, 0.8157 * Tpr);
  }

  function capacity(s, core, res, warn) {
    let out;
    if (s.type === 'saline') {
      const rho = rhoAt(core, res.p_res, res.T_res, 'saline reservoir');
      const Vp = s.area * s.h * s.ntg * s.phi;
      let Eset;
      if (s.E != null) {
        Eset = [s.E, s.E, s.E];
      } else {
        const tbl = s.Epct || {};
        Eset = tbl[s.lith] || tbl.clastic;
        if (!Eset) throw new Error('No efficiency set for lith "' + s.lith + '" and no clastic fallback');
        if (!tbl[s.lith]) warn.push('Epct missing for lith "' + s.lith + '", using clastic');
      }
      const k = Vp * rho;
      out = { type: 'saline', rho_res: rho, Vp, M10: k * Eset[0], M50: k * Eset[1], M90: k * Eset[2] };
    } else if (s.type === 'depleted') {
      const T = res.T_res;
      const Z_i = nz(s.Z_i, zPapay(s.p_i, T, s.sg));
      const Bg_i = P_SC * Z_i * T / (s.p_i * T_SC);                   // rm3/sm3
      const p_refill = s.refill_frac * s.p_i;
      const rho_r = rhoAt(core, p_refill, T, 'depleted refill');
      const M_theor = rho_r * s.RF * s.GIIP * Bg_i;
      const M = s.E_dep * M_theor;
      // screening band, not a statistical distribution
      out = {
        type: 'depleted', rho_res: rho_r, Z_i, Bg_i, p_refill, M_theor,
        M10: 0.75 * M, M50: M, M90: 1.15 * M
      };
    } else {
      throw new Error('Unknown storage type: ' + s.type);
    }
    const need = s.mdot * s.years * SEC_PER_YEAR;
    const ratio = need > 0 ? out.M50 / need : Infinity;
    if (ratio < 1) {
      warn.push('capacity below injected mass over project life');
    } else if (ratio < 1.5 && out.M10 < need) {
      warn.push('P10 capacity below need');
    }
    out.need = need;
    out.ratio = ratio;
    return out;
  }
  // ---- c03: injectivity and well count ----
  function injectivity(s, core, res, warn) {
    const w = typeof warn === 'function' ? warn : (Array.isArray(warn) ? (m) => warn.push(m) : () => {});
    const C = s.C_erosion != null ? s.C_erosion : 100;
    const spareFrac = s.spare_frac != null ? s.spare_frac : 0.2;
    const minSpare = s.minSpare != null ? s.minSpare : 1;
    const MU_FALLBACK = 5e-5; // Pa.s, typical dense-phase CO2

    const p_mid = (res.BHP_max + res.p_res) / 2;
    let rho_mid, mu_mid;
    try {
      const pr = core.props(p_mid, res.T_res);
      rho_mid = pr.rho;
      mu_mid = pr.mu;
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      rho_mid = rhoAt(core, p_mid, res.T_res, 'reservoir');
      mu_mid = MU_FALLBACK;
      w(`props out of range at reservoir; rho via rhoAt, mu assumed ${MU_FALLBACK} Pa.s`);
    }

    const denom = mu_mid * (Math.log(s.re / s.rw) + s.S);
    if (!(denom > 0)) w('non-positive skin-adjusted radial term: check re, rw, S');
    const J = denom > 0 ? (rho_mid * 2 * Math.PI * s.k * s.krel * s.h) / denom : 0;
    const dp_max = res.BHP_max - res.p_res;
    const q_res = J * Math.max(dp_max, 0);

    let rho_t;
    try {
      rho_t = core.props(s.p_arrival, s.T_wh).rho;
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      rho_t = rho_mid;
      w('props out of range at wellhead; using reservoir density for tubing');
    }
    const Ve = (1.22 * C) / Math.sqrt(rho_t);
    const A = (Math.PI * s.ID * s.ID) / 4;
    const q_tub = rho_t * Ve * A;

    const q_max = Math.min(q_res, q_tub);
    const limit = q_res <= q_tub ? 'reservoir' : 'tubing';

    if (!(q_max > 0)) {
      w('no injectivity margin');
      return { ok: false, J, q_res, q_tub, q_max, limit, rho_mid, mu_mid, rho_t, Ve };
    }

    const N = Math.max(1, Math.ceil(s.mdot / q_max));
    const spare = Math.max(minSpare, Math.ceil(spareFrac * N));
    const q_well = s.mdot / N;
    const BHP_req = res.p_res + q_well / J;
    const v_tub = q_well / (rho_t * A);

    if (q_well > 0.9 * q_tub) w('tubing velocity near erosional limit');
    if (N > 20) w('many wells: check permeability');

    return {
      ok: true, J, q_res, q_tub, q_max, limit, N, spare, Ntot: N + spare,
      q_well, BHP_req, rho_mid, mu_mid, rho_t, Ve, v_tub,
    };
  }
  // ---- c04: wellbore column march bottom -> top (required WHP) ----
  function wellbore(s, core, res, inj, warn) {
    const g = typeof G !== 'undefined' ? G : 9.80665;
    const tc = typeof TC !== 'undefined' ? TC : 304.1282;
    const depth = s.depth, n = Math.max(1, s.nSteps | 0), dz = depth / n;
    const ID = s.ID, A = Math.PI * ID * ID / 4, q = inj.q_well;
    const Tz = z => s.thermal === 'isothermal' ? s.T_wh : s.T_wh + (res.T_res - s.T_wh) * z / depth;
    const fricOf = (rho, mu) => {
      const v = q / (rho * A), Re = Math.abs(rho * v * ID / mu);
      if (!(Re > 0) || !isFinite(Re)) return 0;
      const f = Re < 2300 ? 64 / Re
        : 0.25 / Math.pow(Math.log10(s.eps / (3.7 * ID) + 5.74 / Math.pow(Re, 0.9)), 2);
      return f * rho * v * v / (2 * ID);
    };
    const grad = pr => ({ hyd: -pr.rho * g, fr: fricOf(pr.rho, pr.mu) });
    const safeProps = (p, T) => {
      try { return core.props(p, T); }
      catch (e) { if (e instanceof RangeError) return null; throw e; }
    };
    let twoPhaseRisk = false;
    const checkPhase = (p, T) => {
      if (T < tc && T > 216.6) {
        try {
          const ps = core.sat(T).p;
          if (Math.abs(p - ps) < 2e5 || p < ps) twoPhaseRisk = true;
        } catch (e) { if (!(e instanceof RangeError)) throw e; }
      }
    };
    const profile = [];
    let status = 'ok', dp_hyd = 0, dp_fric = 0, WHP = null;
    let z = depth, p = inj.BHP_req, T = Tz(z);
    let pr = safeProps(p, T);
    if (!pr) status = 'props_range';
    else { profile.push({ z, p, T, rho: pr.rho, phase: pr.phase }); checkPhase(p, T); }
    // ---- c04d (Claude): saturation-riding rule — below Tc the column rides psat(T) (two-phase segment) instead of chattering across the boundary ----
    const sideProps = (T, side) => {
      try { return core.props(core.sat(T).p * (1 + side * 1e-6), T); }
      catch (e) { if (e instanceof RangeError) return null; throw e; }
    };
    // Predictor-corrector step with props forced to one side (+1 liquid, -1 vapour) of saturation
    const stepWith = (pStart, propsStart, Tmid, side) => {
      if (!propsStart) return null;
      const pm = sideProps(Tmid, side);
      if (!pm) return null;
      const g2 = grad(pm);
      return { p: pStart + (g2.hyd + g2.fr) * dz, g2 };
    };
    const satOk = (t) => t < tc && t > 216.6;
    let prevSat = false, satTop = false;
    for (let i = 0; i < n && status === 'ok'; i++) {
      const Tn = Tz(z - dz);
      const g1 = grad(pr);
      const pPred = p + (g1.hyd + g1.fr) * dz;
      const Tm = Tz(z - dz / 2);
      const pm = safeProps(0.5 * (p + Math.max(pPred, 1e5)), Tm);
      if (!pm) { status = 'props_range'; break; }
      const g2 = grad(pm);
      let pNew = p + (g2.hyd + g2.fr) * dz;
      let gUse = g2, sat = false, rhoM = null, fr = 0;
      if (satOk(Tn)) {
        const ps = core.sat(Tn).p;
        const psPrev = satOk(T) ? core.sat(T).p : null;
        const crosses = psPrev !== null && (((p >= psPrev) !== (pNew >= ps)) || (Number.isFinite(pPred) && (p >= psPrev) !== (pPred >= ps))); // c04e (Claude): both directions; c04g (reviewed 2026-10-20): predictor crossing too
        if (prevSat || crosses) {
          const TsStart = satOk(T) ? T : Tn;
          const L = stepWith(p, sideProps(TsStart, +1), Tm, +1);
          const V = stepWith(p, sideProps(TsStart, -1), Tm, -1);
          if (!L || !V) { status = 'props_range'; break; }
          if (L.p >= ps) { pNew = L.p; gUse = L.g2; }
          else if (V.p < ps) { pNew = V.p; gUse = V.g2; }
          else {
            sat = true;
            fr = L.g2.fr;
            rhoM = -((ps - p) / dz - fr) / g;
            dp_fric += fr * dz;
            dp_hyd += (ps - p) - fr * dz;
            pNew = ps;
          }
        }
      }
      if (!sat) { dp_hyd += gUse.hyd * dz; dp_fric += gUse.fr * dz; }
      z = i === n - 1 ? 0 : depth - (i + 1) * dz;
      if (pNew < 1e5) { status = 'vacuum'; p = pNew; break; }
      p = pNew; T = Tz(z);
      if (sat) {
        pr = sideProps(T, +1);
        if (!pr) { status = 'props_range'; break; }
        profile.push({ z, p, T, rho: rhoM, phase: 'two-phase' });
      } else {
        pr = safeProps(p, T);
        if (!pr) { status = 'props_range'; break; }
        profile.push({ z, p, T, rho: pr.rho, phase: pr.phase });
      }
      prevSat = sat;
      checkPhase(p, T);
    }
    satTop = profile.length > 0 && profile[profile.length - 1].phase === 'two-phase';
    if (status === 'ok') WHP = p;
    else if (status === 'vacuum') {
      WHP = 1e5;
      warn.push('well on vacuum at z=' + z.toFixed(1) + ' m: column heavier than BHP (free-fall at top); downhole choke or smaller tubing needed');
    } else warn.push('property evaluation out of range during march near z=' + z.toFixed(1) + ' m');
    if (twoPhaseRisk) warn.push('phase boundary crossed in tubing');
    let booster = null, choke = null;
    if (WHP !== null && s.p_arrival != null) {
      if (WHP > s.p_arrival) {
        booster = { dp: WHP - s.p_arrival };
        warn.push('arrival pressure below required WHP: booster/compressor needed');
      } else {
        const dp = s.p_arrival - WHP;
        choke = { dp, T: null, phase: null, x: null };
        try {
          const h_in = core.props(s.p_arrival, s.T_wh).h;
          const after = core.flashPH(Math.max(WHP, 1e5), h_in);
          choke.T = after.T; choke.phase = after.phase; choke.x = after.x;
          if (after.T < 273.15) warn.push('JT cooling below 0 °C at choke');
          if (after.phase === 'two-phase') warn.push('two-phase after choke');
        } catch (e) {
          if (!(e instanceof RangeError)) throw e;
          warn.push('choke flash out of property range');
        }
      }
    }
    return { status, WHP, dp_hyd, dp_fric, profile, twoPhaseRisk, satTop, booster, choke };
  }
  // ---- c04c: well sizing (Claude): per-cell velocity limit (dense rho>=300: RP14E 1.22*C/sqrt(rho); gas: NORSOK P-001 min(175*rho^-0.43, 60) m/s) (WHP rule dropped) ----
  function sizeWells(s, core, res, warn, injectivityFn, wellboreFn) {
    const g = G, A = Math.PI * s.ID ** 2 / 4, injWarn = [];
    let rho_res;
    try { rho_res = core.props(res.p_res, res.T_res).rho; } catch (e) { rho_res = 700; }
    if (!isFinite(rho_res) || rho_res <= 0) rho_res = 700;
    const p0 = Math.max(1e5, res.BHP_max - 0.9 * rho_res * g * s.depth);
    const sMod = Object.assign({}, s, { p_arrival: Math.max(s.p_arrival, p0) });
    const inj = injectivityFn(sMod, core, res, injWarn);
    if (!inj.ok) { warn.push(...injWarn); return { inj, wb: null }; }
    const N_MAX = 40;
    const setN = N => {
      inj.N = N;
      inj.q_well = s.mdot / N;
      inj.BHP_req = res.p_res + inj.q_well / inj.J;
      inj.spare = Math.max(s.minSpare, Math.ceil(s.spare_frac * N));
      inj.Ntot = N + inj.spare;
    };
    // c04f (Claude): two-phase cells checked with both saturated phases (rhoL, rhoV), not the noisy mixture density
    const vel = wb => {
      const limOf = rho => rho >= 300 ? 1.22 * s.C_erosion / Math.sqrt(rho)
                                      : Math.min(175 * Math.pow(rho, -0.43), 60);
      let vmax = -Infinity, vl = null, viol = false;
      for (const p of ((wb && wb.profile) || [])) {
        let rhos = [p.rho];
        if (p.phase === 'two-phase') {
          try {
            const sat = core.sat(p.T);
            const cand = [sat && sat.rhoL, sat && sat.rhoV].filter(r => isFinite(r) && r > 0);
            if (cand.length) rhos = cand;
          } catch (e) { /* fall back to p.rho */ }
        }
        for (const rho of rhos) {
          if (!isFinite(rho) || rho <= 0) continue;
          const lim = limOf(rho);
          const v = inj.q_well / (rho * A);
          if (v > lim) viol = true;
          if (v > vmax) { vmax = v; vl = lim; }
        }
      }
      return { viol, vmax: isFinite(vmax) ? vmax : null, vl };
    };
    let wb = wellboreFn(s, core, res, inj, []);
    let addedVel = false;
    // Velocity constraint
    while (inj.N < N_MAX && vel(wb).viol) {
      setN(inj.N + 1);
      addedVel = true;
      wb = wellboreFn(s, core, res, inj, []);
    }
    // WHP rule dropped (Claude 20:15): adding wells to avoid a booster is a cost trade-off, not a hydraulic limit; booster dp is reported instead
    if (addedVel) inj.limit = 'tubing';
    wb = wellboreFn(s, core, res, inj, warn);
    const vf = vel(wb);
    inj.v_max = vf.vmax;
    inj.v_lim = vf.vl;
    if (vf.vmax > 0 && vf.vl > 0) { inj.v_tub = vf.vmax; inj.q_tub = inj.q_well * vf.vl / vf.vmax; } // glue: tubing limit/velocity reported at the binding cell
    warn.push(...injWarn);
    return { inj, wb };
  }
  // ---- c05: costs, solve, public API ----
  function costs(s, inj) {
    var c = s.cost || {};
    var off = !!s.offshore;
    var Ntot = inj.Ntot || 0;
    var wells = Ntot * (off ? (c.well_off || 0) : (c.well_on || 0));
    var plat = off ? ((c.plat && c.plat[c.platform]) || 0) : 0;
    var facility = off ? 0 : 0.1 * wells;
    var capex = wells + plat + facility;
    // Decommissioning treated as capex-equivalent at start (conservative screening:
    // ignores discounting of end-of-life spend)
    var decom = (c.decom_frac || 0) * capex;
    var i = c.rate || 0;
    var n = c.life || 1;
    var crf = i > 0 ? i / (1 - Math.pow(1 + i, -n)) : 1 / n;
    var tpa = s.mdot * SEC_PER_YEAR / 1000;
    var annual = {
      capital: (capex + decom) * crf,
      fixed: (c.fixed_opex || 0) * capex,
      mmv: (c.mmv || 0) * tpa
    };
    var total = annual.capital + annual.fixed + annual.mmv;
    var lcos = tpa > 0 ? total / tpa : NaN;
    var tariff = c.tariff || 0;
    return {
      capex: capex, wells: wells, plat: plat, facility: facility, decom: decom,
      crf: crf, annual: annual, tpa: tpa, lcos: lcos,
      tariff: tariff, margin: tariff - lcos
    };
  }

  function solve(inp) {
    var s, core, warnings, res, cap, inj, wb, c;
    try {
      s = merge(inp);
      core = getCore();
      warnings = [];
      var checks = [['mdot', s.mdot], ['depth', s.depth], ['k', s.k], ['h', s.h], ['ID', s.ID]];
      for (var j = 0; j < checks.length; j++) {
        var v = checks[j][1];
        if (!(typeof v === 'number' && isFinite(v) && v > 0)) {
          return { ok: false, error: checks[j][0] + ' must be > 0', warnings: warnings };
        }
      }
      var warn = warnings; // glue: chunks c02/c04 push into an array
      res = reservoir(s, warn);
      cap = capacity(s, core, res, warn);
      var sw = sizeWells(s, core, res, warn, injectivity, wellbore); // c04b
      inj = sw.inj; wb = sw.wb;
      if (!inj.ok) {
        return { ok: false, error: 'no injectivity margin', warnings: warnings, reservoir: res, capacity: cap };
      }
      c = costs(s, inj);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e), warnings: [] };
    }
    var per = function (x) { return c.tpa > 0 ? x / c.tpa : NaN; };
    var breakdown = [
      { key: 'c_cap', label: 'Capital', value: per(c.annual.capital), unit: 'EUR/t' },
      { key: 'c_fix', label: 'Fixed O&M', value: per(c.annual.fixed), unit: 'EUR/t' },
      { key: 'c_mmv', label: 'Monitoring (MMV)', value: per(c.annual.mmv), unit: 'EUR/t' },
      { key: 'lcos', label: 'Levelised cost of storage', value: c.lcos, unit: 'EUR/t' }
    ];
    return {
      ok: true,
      warnings: warnings,
      inputs: s,
      reservoir: res,
      capacity: cap,
      injectivity: inj,
      wellbore: wb,
      cost: c,
      WHP: wb.WHP,
      BHP: inj.BHP_req,
      N: inj.N,
      Ntot: inj.Ntot,
      lcos: c.lcos,
      breakdown: breakdown,
      handoff: { mdot: s.mdot, p: wb.WHP, T: s.T_wh, sets: { storage: [{ p: wb.WHP }] } }
    };
  }

  var storageAPI = {
    solve: solve,
    VERSION: '2026-10-22.1',
    defaults: DEFAULTS,
    presets: PRESETS,
    _internal: {
      merge: merge, reservoir: reservoir, capacity: capacity,
      injectivity: injectivity, wellbore: wellbore, costs: costs, zPapay: zPapay, sizeWells: sizeWells
    }
  };
  CCUS.storage = storageAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = CCUS.storage;
})(typeof window !== 'undefined' ? window : globalThis);
