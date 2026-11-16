(function (root) { 'use strict'; var CCUS = root.CCUS = root.CCUS || {};

  // ---- Physical constants ----
  var G = 9.80665;          // gravity, m/s2
  var TC = 304.1282;        // CO2 critical temperature, K
  var PC = 7.3773e6;        // CO2 critical pressure, Pa

  // ---- ASME B36.10 nominal pipe sizes: OD in metres ----
  var NPS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 42, 48].map(function (n) {
    var odIn = { 6: 6.625, 8: 8.625, 10: 10.75, 12: 12.75 }[n] || n; // NPS >= 14: OD = NPS inches
    return { nps: n, OD: odIn * 0.0254 };
  });

  // ---- API 5L SMYS, Pa ----
  var GRADES = { X52: 359e6, X56: 386e6, X60: 414e6, X65: 448e6, X70: 483e6 };

  // ---- Default inputs (SI units) ----
  var DEFAULTS = {
    phase: 'dense', mdot: 79.2, L: 100e3, profile: null, z0: 0, z1: 0,
    p_in: 150e5, T_in: 308.15, Tg: 283.15, thermal: 'U', U: 2.0,
    p_min: null, MAOP: 200e5, eps: 45e-6, nps: null, grade: 'X65', F: null,
    CA: 1e-3, Ew: 1, offshore: false, allowOffshoreBoosters: false, maxBoosters: 5,
    impurities: false, nSeg: 200, eta_pump: 0.75, eta_poly: 0.80, eta_motor: 0.95,
    k_gas: 1.28, rMaxStage: 3, dense_margin: 10e5, gas_margin: 5e5,
    cost: {
      method: 'inchm', c0: 250, c1: 55, F_off: 1.7, steel_eur_t: 1800, rho_steel: 7850,
      constr_c: 40, eng_frac: 0.25, boost_eur_kw: 2500, boost_ref_kw: 1000, boost_exp: 0.65,
      boost_min: 1.5e6, boost_off: 2.5, opex_pipe_on: 0.01, opex_pipe_off: 0.015,
      opex_boost: 0.04, elec: 90, avail: 0.95, rate: 0.08, life: 25
    }
  };

  // Deep copy via JSON (inputs are plain data)
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Overlay user inputs on defaults; cost merged one level deep; resolve null defaults
  function merge(inp) {
    var s = clone(DEFAULTS);
    inp = inp || {};
    Object.keys(inp).forEach(function (k) {
      if (inp[k] === undefined) return;
      if (k === 'cost' && inp.cost && typeof inp.cost === 'object') {
        Object.keys(inp.cost).forEach(function (c) { if (inp.cost[c] !== undefined) s.cost[c] = inp.cost[c]; });
      } else {
        s[k] = (inp[k] !== null && typeof inp[k] === 'object') ? clone(inp[k]) : inp[k];
      }
    });
    if (s.p_min == null) s.p_min = s.phase === 'gas' ? 20e5 : 90e5;
    if (s.F == null) s.F = s.offshore ? 0.77 : 0.72;
    return s;
  }

  // Capital recovery factor
  function crf(r, n) {
    if (!r) return 1 / n;
    var a = Math.pow(1 + r, n);
    return r * a / (a - 1);
  }

  // Darcy friction factor: laminar 64/Re, else Colebrook-White seeded by Swamee-Jain
  function colebrook(Re, rel) {
    if (Re < 2300) return 64 / Re;
    var sj = Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9));
    var x = 1 / Math.sqrt(0.25 / (sj * sj)); // x = 1/sqrt(f)
    for (var i = 0; i < 30; i++) {
      var xn = -2 * Math.log10(rel / 3.7 + 2.51 * x / Re);
      if (Math.abs(xn - x) < 1e-10) { x = xn; break; }
      x = xn;
    }
    return 1 / (x * x);
  }

  // Barlow wall thickness + corrosion allowance, with minimum and D/t limits, rounded up to 0.1 mm
  function wallThickness(MAOP, OD, F, SMYS, Ew, CA) {
    var t = Math.max(MAOP * OD / (2 * F * SMYS * Ew) + CA, 6.35e-3, OD / 72);
    return Math.ceil(t * 1e4 - 1e-9) / 1e4;
  }

  // Elevation profile as sorted [{x, z}]
  function buildProfile(s) {
    var prof;
    if (Array.isArray(s.profile) && s.profile.length >= 2) {
      prof = s.profile.map(function (p) { return { x: +p.x, z: +p.z }; });
      prof.sort(function (a, b) { return a.x - b.x; });
      prof[0].x = 0;
    } else {
      prof = [{ x: 0, z: s.z0 }, { x: s.L, z: s.z1 }];
    }
    return prof;
  }

  // Linear interpolation of elevation, clamped to profile ends
  function elevationAt(prof, x) {
    var n = prof.length;
    if (x <= prof[0].x) return prof[0].z;
    if (x >= prof[n - 1].x) return prof[n - 1].z;
    for (var i = 1; i < n; i++) {
      if (x <= prof[i].x) {
        var a = prof[i - 1], b = prof[i], dx = b.x - a.x;
        return dx > 0 ? a.z + (b.z - a.z) * (x - a.x) / dx : b.z;
      }
    }
    return prof[n - 1].z;
  }

  // Property adapter over CCUS.core (field aliases normalised)
  function getProps(opts) {
    var core = (opts && opts.core) || root.CCUS.core;
    if (!core) throw new Error('CCUS.core not loaded');
    var Tc = core.Tc || (core.consts && core.consts.Tc) || (core.CRIT && core.CRIT.T) || TC;
    var pc = core.pc || (core.consts && core.consts.pc) || (core.CRIT && core.CRIT.p) || PC;
    var fn = core.props || core.state;
    // CCUS.core: sat(T) -> {p,...}; core.satP is p -> sat state, so it is not used here. Stand-ins may give satP(T) -> number.
    var satFn = core.sat ? function (T) { return core.sat(T).p; } : (core.psat || core.satP);
    function pick(r, keys) { for (var i = 0; i < keys.length; i++) if (r[keys[i]] != null) return r[keys[i]]; return NaN; }
    return {
      props: function (p, T) {
        var r = fn.call(core, p, T) || {};
        return { rho: pick(r, ['rho', 'D']), mu: pick(r, ['mu', 'visc', 'eta']), h: pick(r, ['h', 'H']), cp: pick(r, ['cp', 'Cp']) };
      },
      satP: function (T) {
        if (T >= Tc || !satFn) return NaN;
        try { return satFn.call(core, T); } catch (e) { return NaN; }
      },
      Tc: Tc, pc: pc
    };
  }

  // Invert h(p, T) = hT for T by damped Newton iteration, starting from Tg
  function tFromH(P, p, hT, Tg) {
    var T = Math.min(450, Math.max(217, Tg)), pr = P.props(p, T), ok = false;
    for (var i = 0; i < 25; i++) {
      var dT = -(pr.h - hT) / pr.cp;
      if (!isFinite(dT)) break;
      dT = Math.max(-5, Math.min(5, dT));
      T = Math.min(450, Math.max(217, T + dT));
      pr = P.props(p, T);
      if (Math.abs(dT) < 0.01) { ok = true; break; }
    }
    return { T: T, pr: pr, ok: ok };
  }

  /**
   * Booster station model: pump (dense phase) or multi-stage intercooled compressor (gas phase).
   * Returns {p_dis, dp, P_el, T_out, pr_out, stages}.
   */
  function booster(s, P, p_suc, T_suc, pr) {
    const p_dis = Math.min(s.p_in, s.MAOP); // Discharge pressure limited by MAOP
    const dp = p_dis - p_suc;
    let P_shaft = 0;
    let T_out = T_suc;
    let stages = 1;

    if (dp > 0) {
      if (s.phase === 'dense') {
        // Pump: incompressible work with isentropic efficiency
        const w = dp / (pr.rho * s.eta_pump); // Specific work [J/kg]
        P_shaft = s.mdot * w;
        T_out = tFromH(P, p_dis, pr.h + w, T_suc).T;
      } else {
        // Gas: multi-stage polytropic compression with intercooling
        const r = p_dis / p_suc;
        stages = Math.max(1, Math.ceil(Math.log(r) / Math.log(s.rMaxStage)));
        const rs = Math.pow(r, 1 / stages); // Equal pressure ratio per stage
        const k = s.k_gas;
        const m = (k - 1) / (k * s.eta_poly); // (n-1)/n
        const R = 8.314462 / 0.04401; // Specific gas constant for CO2 [J/(kg.K)]
        const Z = p_suc / (pr.rho * R * T_suc); // Compressibility at suction
        let Hsum = 0;
        for (let i = 0; i < stages; i++) {
          const Tst = i === 0 ? T_suc : s.T_in; // Intercooled to T_in after stage 1
          Hsum += Z * R * Tst / m * (Math.pow(rs, m) - 1); // Polytropic head [J/kg]
        }
        P_shaft = s.mdot * Hsum / s.eta_poly;
        T_out = s.T_in; // Aftercooled
      }
    }

    const P_el = P_shaft / s.eta_motor;
    const pr_out = P.props(p_dis, T_out);
    return { p_dis, dp, P_el, T_out, pr_out, stages };
  }

  // One pipeline segment march for CO2: 2-pass predictor-corrector on midpoint properties
  function step(s, P, prof, OD, ID, x0, dx, p0, T0, pr0) {
    const A = Math.PI * ID * ID / 4;
    const dz = elevationAt(prof, x0 + dx) - elevationAt(prof, x0);
    let pm = p0, Tm = T0, prM = pr0;              // Pass 1: midpoint guess = inlet state
    let ok = true, p1, T1, pr1, dpf, rhoM, vM;

    for (let pass = 0; pass < 2; pass++) {
      // Hydraulics at midpoint state
      rhoM = prM.rho;
      vM = s.mdot / (rhoM * A);
      const Re = rhoM * vM * ID / prM.mu;
      const f = colebrook(Re, s.eps / ID);
      dpf = f * rhoM * vM * vM * dx / (2 * ID);   // Friction loss (positive)
      p1 = p0 - dpf - rhoM * G * dz;              // Friction + hydrostatic

      if (!(p1 > 1e5) || !isFinite(p1) || !isFinite(rhoM)) return { ok: false };

      // Energy balance
      if (s.thermal === 'isothermal') {
        T1 = s.Tg;
        pr1 = P.props(p1, T1);
      } else {
        // Heat exchange with ground (based on midpoint T) minus potential energy change
        const h1 = pr0.h + s.U * Math.PI * OD * dx * (s.Tg - Tm) / s.mdot - G * dz;
        const r = tFromH(P, p1, h1, T0);
        T1 = r.T;
        pr1 = r.pr;
        ok = r.ok;                                // Reflects the last pass
      }

      // Update midpoint state for next pass
      pm = (p0 + p1) / 2;
      Tm = (T0 + T1) / 2;
      prM = P.props(pm, Tm);
    }

    return { ok, p1, T1, pr1, dpf, rhoM, vM };
  }

  // March a CO2 pipeline segment by segment, placing boosters when pressure drops below p_min
  function march(s, P, prof, OD, ID) {
    const A = Math.PI * ID * ID / 4;
    // Build node grid: uniform segments merged with profile vertices (unique within 1e-6 m)
    const px = Array.isArray(prof) ? prof.map(q => q.x) : (prof.x || []);
    const raw = [];
    for (let k = 0; k <= s.nSeg; k++) raw.push(s.L * k / s.nSeg);
    px.forEach(v => { if (v >= 0 && v <= s.L) raw.push(v); });
    raw.sort((a, b) => a - b);
    const xs = [];
    raw.forEach(v => { if (!xs.length || v - xs[xs.length - 1] > 1e-6) xs.push(v); });
    // Initial state
    const T0 = s.thermal === 'isothermal' ? s.Tg : s.T_in;
    let pr = P.props(s.p_in, T0);
    const x = [xs[0]], z = [elevationAt(prof, xs[0])], p = [s.p_in], T = [T0], rho = [pr.rho];
    const boosters = [];
    let linepack = 0, dp_fric = 0, mdot = s.mdot, boostIdx = -1;
    // Assemble result: node velocities, phase margins, final status
    const finish = (ok, reason) => {
      const v = rho.map(d => mdot / (d * A));
      const psat = [];
      let phaseMin = Infinity, violation = false, marginal = false;
      const need = s.phase === 'dense' ? s.dense_margin : s.gas_margin;
      for (let i = 0; i < p.length; i++) {
        const sat = P.satP(T[i]);
        psat.push(T[i] < P.Tc ? sat : NaN);
        const ps = T[i] < P.Tc ? sat : P.pc;
        const m = s.phase === 'dense' ? p[i] - ps : ps - p[i];
        phaseMin = Math.min(phaseMin, m);
        if (m < need) violation = true;
        else if (m < 2 * need) marginal = true;
      }
      if (ok) { ok = !violation; reason = violation ? 'phase' : ''; }
      const n = p.length - 1;
      return { ok, reason, x, z, p, T, rho, v, psat, boosters, linepack, dp_fric, phaseMin, marginal,
        violation, vmax: Math.max(...v), vmin: Math.min(...v), p_out: p[n], T_out: T[n] };
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], dx = xs[i + 1] - x0;
      let r;
      for (;;) {
        r = step(s, P, prof, OD, ID, x0, dx, p[i], T[i], pr);
        if (!r.ok) return finish(false, 'diverged');
        if (r.p1 >= s.p_min) break;
        // Pressure too low: boost at segment start and redo
        if (boostIdx === i) return finish(false, 'infeasible_dp');
        if (boosters.length >= s.maxBoosters) return finish(false, 'too_many');
        const b = booster(s, P, p[i], T[i], pr);
        boosters.push({ x: x0, p_suc: p[i], p_dis: b.p_dis, dp: b.dp, P_el: b.P_el, T_out: b.T_out, stages: b.stages });
        boostIdx = i;
        p[i] = b.p_dis; T[i] = b.T_out; pr = b.pr_out; rho[i] = pr.rho;
      }
      // Derive mass flow from first step if not supplied
      if (!isFinite(mdot)) mdot = r.rhoM * r.vM * A;
      linepack += r.rhoM * A * dx;
      dp_fric += r.dpf;
      pr = r.pr1;
      x.push(xs[i + 1]); z.push(elevationAt(prof, xs[i + 1]));
      p.push(r.p1); T.push(r.T1); rho.push(pr.rho);
    }
    return finish(true, '');
  }

  // CO2 pipeline cost model: CAPEX, fixed OPEX, energy, annualised cost and LCOT
  function cost(s, cand, m) {
    const c = s.cost;
    const off = !!s.offshore;
    const Foff = off ? c.F_off : 1;
    const boosters = (m && m.boosters) || [];

    // Pipeline CAPEX
    let capex_pipe;
    if (c.method === 'steel') {
      const mass = Math.PI * (cand.OD - cand.t) * cand.t * c.rho_steel * s.L; // [kg]
      capex_pipe = (mass / 1000 * c.steel_eur_t + c.constr_c * cand.nps * s.L)
        * (1 + c.eng_frac) * Foff;
    } else { // 'inchm'
      capex_pipe = s.L * (c.c0 + c.c1 * cand.nps) * Foff;
    }

    // Booster CAPEX (power-law scaling with floor and offshore multiplier)
    const bMult = off ? c.boost_off : 1;
    const capex_boost = boosters.reduce((acc, b) => {
      const kW = b.P_el / 1000;
      const scaled = c.boost_eur_kw * c.boost_ref_kw * Math.pow(kW / c.boost_ref_kw, c.boost_exp);
      return acc + Math.max(c.boost_min, scaled) * bMult;
    }, 0);
    const capex = capex_pipe + capex_boost;

    // Fixed OPEX
    const opex_pipe = capex_pipe * (off ? c.opex_pipe_off : c.opex_pipe_on);
    const opex_b = capex_boost * c.opex_boost;
    const opex_fixed = opex_pipe + opex_b;

    // Energy: W * h / 1e6 = MWh
    const P_tot = boosters.reduce((acc, b) => acc + b.P_el, 0);
    const energy_MWh = P_tot * 8760 * c.avail / 1e6;
    const energy_cost = energy_MWh * c.elec;

    // Annualisation and levelised cost of transport
    const annual_t = s.mdot * 31.536e6 * c.avail / 1000; // [t/y]
    const f = crf(c.rate, c.life);
    const annualised = f * capex + opex_fixed + energy_cost;
    const lcot = annual_t > 0 ? annualised / annual_t : Infinity;

    const items = [
      { name: 'Pipeline', capex: capex_pipe, opex: opex_pipe },
      { name: 'Boosters', capex: capex_boost, opex: opex_b },
      { name: 'Electricity', capex: 0, opex: energy_cost }
    ];

    return { capex_pipe, capex_boost, capex, opex_fixed, energy_MWh, energy_cost,
      annual_t, crf: f, annualised, lcot, items };
  }

  // Solve CO2 pipeline sizing: evaluate NPS candidates, pick min-LCOT feasible design
  function solve(inp, opts) {
    try {
      const s = merge(inp);
      const P = getProps(opts);
      const prof = buildProfile(s);
      const warnings = [];
      if (s.p_in > s.MAOP) return { ok: false, warnings: ['Inlet pressure above MAOP'], inputs: s };

      // Offshore lines without allowed boosters are marched with zero boosters
      const sm = (s.offshore && !s.allowOffshoreBoosters) ? Object.assign({}, s, { maxBoosters: 0 }) : s;
      const sumB = (bs, k) => (bs || []).reduce((a, b) => a + (b[k] || 0), 0);
      const totDp = m => s.p_in + sumB(m.boosters, 'dp') - m.p_out;

      // Build candidate list (fixed NPS or all sizes)
      const list = s.nps ? NPS.filter(n => n.nps === s.nps) : NPS;
      if (!list.length) throw new Error('Unknown NPS: ' + s.nps);
      const SMYS = GRADES[s.grade];
      if (!SMYS) throw new Error('Unknown grade: ' + s.grade);

      const nBoost = m => (m.nBoosters != null ? m.nBoosters : (Array.isArray(m.boosters) ? m.boosters.length : (m.boosters || 0)));
      const baseRec = n => {
        const OD = n.OD;
        const t = wallThickness(s.MAOP, OD, s.F, SMYS, s.Ew, s.CA);
        return { nps: n.nps, OD, t, ID: OD - 2 * t, feasible: false, reason: '' };
      };
      const evalRec = (n, mm) => {
        const rec = baseRec(n);
        if (rec.OD / rec.t < 15) rec.reason = 'thick_wall';
        else if (rec.t > 0.040) rec.reason = 't_max';
        else {
          let m;
          try { m = march(mm, P, prof, rec.OD, rec.ID); } catch (e) { m = { ok: false, reason: 'props_range', boosters: [] }; }
          rec.m = m; rec.reason = m.reason || '';
          if (m.ok) { rec.feasible = true; rec.c = cost(s, rec, m); rec.lcot = rec.c.lcot; }
        }
        return rec;
      };
      // Speed: coarse screening of all sizes, then fine march of the best one or two
      let recs;
      if (list.length === 1) {
        recs = [evalRec(list[0], sm)];
        recs[0].refined = true;
      } else {
        const coarse = Object.assign({}, sm, { nSeg: Math.min(sm.nSeg || 200, 16) });
        recs = [];
        let prev = null, stop = false;
        for (const n of list) {
          if (stop) {
            const r = baseRec(n);
            r.reason = 'not_screened'; r.refined = false;
            recs.push(r);
            continue;
          }
          const r = evalRec(n, coarse);
          r.refined = false;
          recs.push(r);
          if (!r.m) continue;
          if (r.feasible && nBoost(r.m) === 0 && prev && prev.feasible &&
              nBoost(prev.m) === 0 && r.lcot > prev.lcot) stop = true;
          prev = r;
        }
        const feas = recs.filter(r => r.feasible).sort((a, b) => a.lcot - b.lcot);
        const pick = feas.slice(0, 1);
        if (feas.length > 1 && feas[1].lcot <= feas[0].lcot * 1.05) pick.push(feas[1]);
        for (const r of pick) {
          const i = recs.indexOf(r);
          const f = evalRec(list[i], sm);
          f.refined = true;
          recs[i] = f;
        }
      }

      // Summary table for all candidates
      const table = recs.map(r => ({
        nps: r.nps, OD: r.OD, t: r.t, ID: r.ID, feasible: r.feasible, reason: r.reason,
        lcot: r.c ? r.c.lcot : null, capex: r.c ? r.c.capex : null,
        nBoosters: r.m ? (r.m.boosters || []).length : 0, refined: !!r.refined, dp: r.m && r.m.ok ? totDp(r.m) : null
      }));

      const best = recs.filter(r => r.feasible).reduce((b, r) => (!b || r.lcot < b.lcot ? r : b), null);
      if (!best) {
        warnings.push('No feasible pipe size');
        recs.forEach(r => warnings.push('NPS ' + r.nps + ': ' + (r.reason || 'infeasible')));
        return { ok: false, warnings, candidates: table, inputs: s };
      }

      const m = best.m, c = best.c;
      // Velocity and phase warnings
      if (s.phase === 'dense' && (m.vmin < 0.3 || m.vmax > 4))
        warnings.push('Dense-phase velocity outside 0.3-4 m/s (' + m.vmin.toFixed(2) + '-' + m.vmax.toFixed(2) + ')');
      if (s.phase === 'gas' && m.vmax > 20) warnings.push('Gas velocity above 20 m/s (' + m.vmax.toFixed(1) + ')');
      if (m.marginal) warnings.push('Phase margin is marginal');
      if ((m.boosters || []).length > 0) warnings.push(m.boosters.length + ' booster station(s) required');

      // Booster totals and overall pressure loss
      const Q = sumB(m.boosters, 'P_el');
      const dp = totDp(m);
      const ID = best.ID;

      return {
        ok: true, warnings, nps: best.nps, OD: best.OD, t: best.t, ID, D: ID, L: s.L, dp, Q,
        p_out: m.p_out, T_out: m.T_out, vmax: m.vmax, vmin: m.vmin, boosters: m.boosters,
        linepack: m.linepack, phaseMin: m.phaseMin,
        profile: { x: m.x, z: m.z, p: m.p, T: m.T, rho: m.rho, v: m.v, psat: m.psat },
        cost: c, lcot: c.lcot, capex: c.capex, candidates: table,
        handoff: { D: ID, L: s.L, dp, Q, sets: { pipeline: [{ D: ID }, { L: s.L }, { dp }, { Q }] } },
        breakdown: c.items, inputs: s
      };
    } catch (e) {
      return { ok: false, warnings: [String((e && e.message) || e)], error: (e && e.stack) || String(e) };
    }
  }

  // Unit helpers for preset definitions
  const mty = (mt) => mt * 1e9 / 31.536e6; // Mt/y -> kg/s
  const bar = (b) => b * 1e5;              // bar -> Pa
  const km = (k) => k * 1e3;               // km -> m

  // Reference cases (partial SI inputs, merged with DEFAULTS by solve)
  const PRESETS = {
    'onshore-2mt-100km': { label: 'Onshore 2 Mt/y, 100 km', group: 'Onshore',
      inputs: { mdot: mty(2), L: km(100), phase: 'dense',
        profile: [{ x: 0, z: 0 }, { x: km(100), z: 0 }],
        p_in: bar(110), T_in: 303.15, Tg: 283.15 } },
    'onshore-5mt-300km': { label: 'Onshore 5 Mt/y, 300 km', group: 'Onshore',
      inputs: { mdot: mty(5), L: km(300), phase: 'dense', p_in: bar(150) } },
    'hilly-1mt-150km': { label: 'Hilly 1 Mt/y, 150 km', group: 'Onshore',
      inputs: { mdot: mty(1), L: km(150), p_in: bar(130),
        profile: [{ x: 0, z: 0 }, { x: 60e3, z: 400 }, { x: 150e3, z: 50 }] } },
    'offshore-3mt-200km': { label: 'Offshore 3 Mt/y, 200 km', group: 'Offshore',
      inputs: { mdot: mty(3), L: km(200), offshore: true, p_in: bar(180),
        MAOP: bar(200), Tg: 278.15, z1: -100 } },
    'cluster-10mt-50km': { label: 'Cluster trunk 10 Mt/y, 50 km', group: 'Trunk',
      inputs: { mdot: mty(10), L: km(50), p_in: bar(150) } },
    'gas-0.5mt-50km': { label: 'Gas phase 0.5 Mt/y, 50 km', group: 'Gas phase',
      inputs: { mdot: mty(0.5), L: km(50), phase: 'gas', p_in: bar(35),
        T_in: 313.15, MAOP: bar(40) } }
  };

  // Public API
  CCUS.pipe = {
    solve,
    VERSION: '2026-10-19.1',
    defaults: DEFAULTS,
    presets: PRESETS,
    NPS,
    GRADES,
    _internal: { merge, march, cost, wallThickness, colebrook, crf, booster, step }
  };

  // CommonJS export for Node
  if (typeof module !== 'undefined' && module.exports) module.exports = CCUS.pipe;
})(typeof window !== 'undefined' ? window : globalThis);
