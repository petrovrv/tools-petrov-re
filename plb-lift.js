/* plb-lift.js — wastewater lifting station engine for plbliftstation.html (tools.petrov.re, plumbing package).
 * Global PLBLift (browser) / module.exports (node). Pure functions, no DOM, deterministic.
 * Method: _plb/lift/METHOD.md (plblift-1.2). Independent reference: bench-src/ref/gen_plbliftstation.py.
 *
 * Chain: inflow (EN 12056-2 Qww = K·√ΣDU, or a given flow; + continuous flow; + rain on areas below the
 * backflow level) -> rising main (smallest pipe of the series with DN ≥ the EN 12056-4 minimum and
 * v ≤ 2.3 m/s at the inflow) -> required pump flow max(inflow, 0.7 m/s) -> system curve
 * H = Hgeo + (λL/d + Σζ)·v²/2g up to the crest of the backflow loop -> duty point on a generic pump
 * parabola (optional) -> sump useful volume V = max(Qp·Tc/4 (Tc = 3600/z), T·Qp (EN 12056-4 Table 5), 20 l) and
 * > rising-main volume (EN 12056-4 §6.3) -> rain below the backflow level kept out of a wastewater plant (§5.1)
 * -> single vs duplex, backflow loop, cycle times. Flows in l/s, lengths in m, diameters in mm.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PLBLift = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'plblift-1.3';
  var G = 9.81;

  var SOURCES = {
    en12056_4: { title: 'EN 12056-4:2000 — Gravity drainage systems inside buildings — Part 4: Wastewater lifting plants — Layout and calculation (text read): §5.1 duplicate pumps where the inflow cannot be interrupted, surface water below flood level kept separate from domestic wastewater (own plant outside the building); §5.2 Table 2 minimum DN of the discharge pipe (non-macerating faecal DN 80, macerating faecal and faecal-free DN 32), backflow loop above flood level; §6.1 Qp ≥ Qi, 0.7–2.3 m/s; §6.2 Htot = Hgeo + HV,A + HV,R; §6.3 eq. (5) V = T·Qp (Table 5, T by the estimated motor power), V > discharge-pipe volume, V ≥ 20 l', edition: '2000', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    en12056_2: { title: 'EN 12056-2 — Sanitary pipework, layout and calculation (Qww = K·√ΣDU; at least the largest single DU)', edition: '2000', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    en12050: { title: 'EN 12050-1/-2/-3 — Wastewater lifting plants for buildings and sites: faecal (free passage, cutting devices), faecal-free, limited application', edition: '2001', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    din1986_100: { title: 'DIN 1986-100 — Drainage systems on private ground (rain on areas below the backflow level: r(5,100); lifting plant venting)', edition: '2016-12', url: 'https://www.din.de/', kind: 'standard' },
    pump_sump: { title: 'Sump volume for on/off pumps: worst cycle at inflow = Qp/2 gives Tc = 4V/Qp, so V = Qp·Tc/4 (textbook pump-station design, e.g. Jones et al., Pumping Station Design, 3rd ed.)', edition: '2008', url: '', kind: 'public_guide' },
    en1452: { title: 'EN ISO 1452-2 — PVC-U pressure pipes (PN 10 = SDR 21 dimensions)', edition: '2009', url: 'https://www.iso.org/', kind: 'standard' },
    en12201: { title: 'EN 12201-2 — PE pressure pipes (PE 100 SDR 11 dimensions)', edition: '2011+A1:2013', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    en10255: { title: 'EN 10255 — Non-alloy steel tubes suitable for welding and threading (medium series)', edition: '2004+A1:2007', url: 'https://standards.cencenelec.eu/', kind: 'standard' },
    colebrook: { title: 'Colebrook, C. F. (1939) Turbulent flow in pipes…; Darcy–Weisbach', edition: '1939', url: '', kind: 'public_guide' },
    vogel: { title: 'Vogel equation for the viscosity of water, μ = 0.02939·exp(507.88/(T − 149.3)) mPa·s (within ≈ 1 % for 5–60 °C); Thiesen/Tanaka density', edition: '—', url: '', kind: 'public_guide' },
    rain_r100: { title: 'Default design rain below the backflow level 600 l/(s·ha): order of r(5,100) for Uccle (Brussels) — learning assumption, replace by the KMI/IRM IDF value of the site (DIN 1986-100 asks r(5,100) for areas below the backflow level)', edition: VERSION, url: 'https://www.meteo.be/', kind: 'learning_assumption' },
    learning: { title: 'Learning assumption of this tool — typical value, replace with project or manufacturer data', edition: VERSION, url: '', kind: 'learning_assumption' }
  };

  /* pipe series for the rising main: [outer diameter mm, wall mm, nominal DN]. DN is the usual DN/OD equivalence of the
   * pressure-pipe series (PE d110 ≙ DN 100), not an inner-diameter check: PE 100 SDR 11 d110 has ID 90 mm. The EN 12056-4
   * minimum (DN 80 faecal / DN 32) is applied to this nominal size; the ID is shown in the result (CR-50). */
  var SERIES = {
    pe100: { source: 'en12201', series: [[32, 2.9, 25], [40, 3.7, 32], [50, 4.6, 40], [63, 5.8, 50], [75, 6.8, 65], [90, 8.2, 80], [110, 10.0, 100], [125, 11.4, 100], [160, 14.6, 150]] },
    pvc10: { source: 'en1452', series: [[40, 1.9, 32], [50, 2.4, 40], [63, 3.0, 50], [75, 3.6, 65], [90, 4.3, 80], [110, 5.3, 100], [125, 6.0, 100], [160, 7.7, 150]] },
    steel: { source: 'en10255', series: [[42.4, 3.2, 32], [48.3, 3.2, 40], [60.3, 3.6, 50], [76.1, 3.6, 65], [88.9, 4.0, 80], [114.3, 4.5, 100], [139.7, 5.0, 125], [165.1, 5.0, 150]] }
  };
  /* EN 12056-4:2000 §5.2 Table 2 minimum nominal size of the discharge pipe, read in the standard text (bw-r1 D-BW-4; plants for limited applications to EN 12050-3, DN 25 / DN 20, are not modelled) */
  var DN_MIN = { faecal: 80, cutter: 32, faecalfree: 32 };
  /* EN 12056-4:2000 §6.3: minimum useful volume 20 l; Table 5 minimum running time T by motor power (≤ 2.5 kW 2.2 s, 2.5–7.5 kW 5.5 s, > 7.5 kW 8.5 s) */
  var V_MIN_L = 20;
  function runTime(kW) { return kW <= 2.5 ? 2.2 : (kW <= 7.5 ? 5.5 : 8.5); }

  var DEFAULTS = {
    inflow_mode: 'du', sum_du: 20, K: 0.5, du_max: 2.0, q_ww_lps: 1.0, q_c_lps: 0,
    rain_area_m2: 0, rain_r: 600, rain_C: 1.0,
    water: 'faecal', interrupt: 'yes', arrangement: 'single', alternate: 'yes',
    series: 'pe100', dn_mode: 'auto', od_manual: 90,
    L_main: 20, zeta_sum: 6, rough_mm: 0.25, T_w: 15,
    depth_m: 3.0, loop_m: 0.25,
    pump_mode: 'req', H0: 14, Qn: 5, Hn: 9,
    z_max: 15, v_min: 0.7, v_max: 2.3, V_useful_l: 0, main_rule: 'yes', eta: 0.35
  };

  /* soft flags: information, not a design defect (the verdict stays "ok" with a warning tone) */
  /* plblift-1.2: main_rule_off is a hard flag now — EN 12056-4 §6.3 makes V > discharge-pipe volume a "shall" (Y5-5);
   * surface_outside informs that a surface-water plant belongs outside the building (§5.1) */
  var SOFT_FLAGS = ['inputs_defaulted', 'rain_r_assumed', 'no_inflow', 'surface_outside'];
  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }
  /* D-PLB-14: absent key -> default; null or '' = missing -> default and listed in `defaulted`;
   * anything else that is not a finite number (NaN, Infinity, '3,5', true, {}) -> validation error, never a silent 0 or default */
  function parse(inp) {
    var o = {}, bad = [], miss = [], k, v, x;
    inp = inp && typeof inp === 'object' ? inp : {};
    for (k in DEFAULTS) if (has(DEFAULTS, k)) {
      v = has(inp, k) ? inp[k] : undefined;
      if (v === undefined) { o[k] = DEFAULTS[k]; continue; }
      if (v === null || (typeof v === 'string' && v.trim() === '')) { o[k] = DEFAULTS[k]; miss.push(k); continue; }
      if (typeof DEFAULTS[k] === 'number') {
        x = typeof v === 'number' ? v : (typeof v === 'string' && /^[\s]*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?[\s]*$/.test(v) ? Number(v) : NaN);
        if (isFinite(x)) o[k] = x; else { o[k] = DEFAULTS[k]; bad.push(k); }
      } else if (typeof v === 'string') o[k] = v;
      else { o[k] = DEFAULTS[k]; bad.push(k); }
    }
    return { o: o, bad: bad, miss: miss };
  }
  function normalise(inp) { return parse(inp).o; }
  function validate(o) {
    var e = [];
    if (['du', 'q'].indexOf(o.inflow_mode) < 0) e.push('inflow_mode');
    if (!(o.sum_du >= 0) || o.sum_du > 1e5) e.push('sum_du');
    if (!(o.K > 0) || o.K > 2) e.push('K');
    if (!(o.du_max >= 0) || o.du_max > 20) e.push('du_max');
    if (!(o.q_ww_lps >= 0) || o.q_ww_lps > 500) e.push('q_ww_lps');
    if (!(o.q_c_lps >= 0) || o.q_c_lps > 500) e.push('q_c_lps');
    if (!(o.rain_area_m2 >= 0) || o.rain_area_m2 > 1e5) e.push('rain_area_m2');
    if (!(o.rain_r >= 0) || o.rain_r > 2000) e.push('rain_r');
    if (!(o.rain_C >= 0) || o.rain_C > 1) e.push('rain_C');
    if (!has(DN_MIN, o.water)) e.push('water');
    if (['yes', 'no'].indexOf(o.interrupt) < 0) e.push('interrupt');
    if (['single', 'duplex'].indexOf(o.arrangement) < 0) e.push('arrangement');
    if (['yes', 'no'].indexOf(o.alternate) < 0) e.push('alternate');
    if (!has(SERIES, o.series)) e.push('series');
    if (['auto', 'manual'].indexOf(o.dn_mode) < 0) e.push('dn_mode');
    if (!(o.L_main > 0) || o.L_main > 5000) e.push('L_main');
    if (!(o.zeta_sum >= 0) || o.zeta_sum > 200) e.push('zeta_sum');
    if (!(o.rough_mm >= 0) || o.rough_mm > 5) e.push('rough_mm');
    if (!(o.T_w >= 1) || o.T_w > 60) e.push('T_w');
    if (!(o.depth_m >= 0) || o.depth_m > 60) e.push('depth_m');
    /* QA-19: the static lift H_geo = depth + loop + d must not be negative (a loop deeper than the sump is not a lifting plant) */
    if (!(o.loop_m >= -5) || o.loop_m > 10 || o.depth_m + o.loop_m < 0) e.push('loop_m');
    if (['req', 'curve'].indexOf(o.pump_mode) < 0) e.push('pump_mode');
    if (o.pump_mode === 'curve' && (!(o.H0 > 0) || !(o.Qn > 0) || !(o.Hn > 0) || o.Hn >= o.H0 || o.H0 > 200 || o.Qn > 500)) e.push('pump_curve');
    if (!(o.z_max >= 1) || o.z_max > 200) e.push('z_max'); /* QA-19: at least 1 start per hour, else the sump volume runs away */
    if (!(o.v_min > 0) || !(o.v_max > o.v_min) || o.v_max > 10) e.push('v_limits');
    if (!(o.V_useful_l >= 0) || o.V_useful_l > 1e6) e.push('V_useful_l');
    if (['yes', 'no'].indexOf(o.main_rule) < 0) e.push('main_rule');
    if (!(o.eta > 0) || o.eta > 1) e.push('eta');
    return e;
  }

  /* water: density (Thiesen/Tanaka form), viscosity (Vogel) */
  function rho(t) { return 999.97495 * (1 - (t + 288.9414) * (t - 3.9863) * (t - 3.9863) / (508929.2 * (t + 68.12963))); }
  function mu(t) { return 0.02939e-3 * Math.exp(507.88 / (t + 273.15 - 149.3)); }
  /* Darcy friction factor: laminar 64/Re below 2300, Colebrook (fixed-point on 1/√λ) above */
  function friction(Re, rel) {
    if (!(Re > 0)) return 0;
    if (Re < 2300) return 64 / Re;
    var x = -2 * Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9)); /* Swamee–Jain start, x = 1/√λ */
    for (var i = 0; i < 100; i++) {
      var nx = -2 * Math.log10(rel / 3.7 + 2.51 * x / Re);
      if (Math.abs(nx - x) < 1e-13) { x = nx; break; }
      x = nx;
    }
    return 1 / (x * x);
  }
  function pipeList(series) {
    return SERIES[series].series.map(function (p) { return { od: p[0], wall: p[1], dn: p[2], id: Math.round((p[0] - 2 * p[1]) * 1e6) / 1e6 }; });
  }
  function area(id_mm) { return Math.PI * id_mm * id_mm / 4e6; }

  function inflow(o) {
    var qwwRaw = o.inflow_mode === 'du' ? o.K * Math.sqrt(o.sum_du) : o.q_ww_lps;
    /* CR-49: the largest-DU floor applies only when there are fixtures (ΣDU > 0) */
    var qww = o.inflow_mode === 'du' ? (o.sum_du > 0 ? Math.max(qwwRaw, o.du_max) : 0) : qwwRaw;
    var qr = o.rain_r * o.rain_C * o.rain_area_m2 / 10000;
    /* Y5-1: the two streams of EN 12056-4 §5.1 — domestic wastewater (+ continuous flow) and surface water (rain) */
    return { q_ww_raw: qwwRaw, q_ww: qww, q_r: qr, q_c: o.q_c_lps, q_in: qww + qr + o.q_c_lps, q_dw: qww + o.q_c_lps, q_sw: qr, du_governs: o.inflow_mode === 'du' && o.sum_du > 0 && o.du_max > qwwRaw };
  }

  /* pipe choice: auto = smallest pipe with DN ≥ minimum whose velocity at the inflow is ≤ v_max */
  function choosePipe(o, q_in) {
    var list = pipeList(o.series), dnMin = DN_MIN[o.water], i;
    if (o.dn_mode === 'manual') {
      var best = list[0];
      for (i = 1; i < list.length; i++) if (Math.abs(list[i].od - o.od_manual) < Math.abs(best.od - o.od_manual)) best = list[i];
      return { pipe: best, found: true };
    }
    for (i = 0; i < list.length; i++) {
      if (list[i].dn < dnMin) continue;
      if (q_in / 1000 / area(list[i].id) <= o.v_max + 1e-12) return { pipe: list[i], found: true };
    }
    return { pipe: list[list.length - 1], found: false };
  }

  function systemHead(o, pipe, q_lps) {
    var d = pipe.id / 1000, A = area(pipe.id), v = q_lps / 1000 / A;
    var Hgeo = o.depth_m + o.loop_m + d;
    if (!(q_lps > 0)) return { H: Hgeo, Hgeo: Hgeo, hf: 0, hl: 0, v: 0, Re: 0, lambda: 0 };
    var r = rho(o.T_w), Re = r * v * d / mu(o.T_w), lam = friction(Re, o.rough_mm / pipe.id);
    var hv = v * v / (2 * G), hf = lam * o.L_main / d * hv, hl = o.zeta_sum * hv;
    return { H: Hgeo + hf + hl, Hgeo: Hgeo, hf: hf, hl: hl, v: v, Re: Re, lambda: lam };
  }
  function pumpHead(o, q) { return o.H0 - (o.H0 - o.Hn) * (q / o.Qn) * (q / o.Qn); }
  function pumpQmax(o) { return o.Qn * Math.sqrt(o.H0 / (o.H0 - o.Hn)); }
  function dutyPoint(o, pipe) {
    var Hg = systemHead(o, pipe, 0).H;
    if (!(o.H0 > Hg)) return null;
    var lo = 0, hi = pumpQmax(o);
    for (var i = 0; i < 200; i++) {
      var m = (lo + hi) / 2, f = pumpHead(o, m) - systemHead(o, pipe, m).H;
      if (f > 0) lo = m; else hi = m;
      if (hi - lo < 1e-12) break;
    }
    var q = (lo + hi) / 2;
    return { q: q, H: systemHead(o, pipe, q).H };
  }

  function solve(inp) {
    var ps = parse(inp), o = ps.o, errors = ps.bad.concat(validate(o).filter(function (k) { return ps.bad.indexOf(k) < 0; }));
    if (errors.length) return { valid: false, errors: errors, input: o };
    var flags = [], inf = inflow(o), ch = choosePipe(o, inf.q_in), pipe = ch.pipe, A = area(pipe.id);
    var dnMin = DN_MIN[o.water];
    if (!ch.found) flags.push('no_pipe');
    if (pipe.dn < dnMin) flags.push('dn_below_min');
    var q_vmin = o.v_min * A * 1000;
    var q_req = Math.max(inf.q_in, q_vmin);
    var req = systemHead(o, pipe, q_req);
    var duty = null, qp, Hp;
    if (o.pump_mode === 'curve') {
      duty = dutyPoint(o, pipe);
      if (!duty) { flags.push('pump_too_weak'); qp = 0; Hp = req.Hgeo; }
      else { qp = duty.q; Hp = duty.H; }
    } else { qp = q_req; Hp = req.H; }
    var v_p = qp / 1000 / A, sysP = systemHead(o, pipe, qp);
    if (qp > 0 && v_p < o.v_min - 1e-9) flags.push('v_low');
    if (v_p > o.v_max + 1e-9) flags.push('v_high');
    if (o.pump_mode === 'curve' && duty && qp < inf.q_in) flags.push('pump_below_inflow');
    if (o.interrupt === 'no' && o.arrangement === 'single') flags.push('duplex_required');
    if (o.loop_m <= 0) flags.push('loop_below'); /* CR-48: the loop invert must be above the backflow level, 0 is not enough */
    if (ps.miss.length) flags.push('inputs_defaulted');
    if (o.rain_area_m2 > 0 && o.rain_r === DEFAULTS.rain_r) flags.push('rain_r_assumed'); /* D-PLB-12 */
    if (o.main_rule === 'no') flags.push('main_rule_off'); /* CR-51 */
    if (!(inf.q_in > 0)) flags.push('no_inflow');
    /* Y5-1, EN 12056-4 §5.1: surface water below flood level is kept separate from domestic wastewater and pumped by a plant
     * outside the building -> rain together with wastewater in one plant is not compliant (the combined sizing is still shown) */
    var rain_mixed = inf.q_r > 0 && inf.q_ww > 0;
    if (rain_mixed) flags.push('rain_mixed');
    else if (inf.q_r > 0) flags.push('surface_outside');
    var alt = o.arrangement === 'duplex' && o.alternate === 'yes' ? 2 : 1;
    var V_main = A * o.L_main * 1000;
    var V_starts = qp > 0 ? 900 * qp / (o.z_max * alt) : 0;
    var P1_kW = rho(o.T_w) * G * qp / 1000 * Hp / o.eta / 1000, T_run = runTime(P1_kW);
    var V_T = T_run * qp;  /* EN 12056-4 §6.3 eq. (5), T from Table 5 by the (estimated) motor power */
    var V_dyn = Math.max(V_starts, V_T);
    /* Y5-3: V ≥ 20 l always; Y5-5: V strictly greater than the discharge-pipe volume -> V_req = V_main is a limit "> V_main" */
    var V_req = Math.max(V_dyn, V_MIN_L, o.main_rule === 'yes' ? V_main : 0);
    var main_governs = o.main_rule === 'yes' && V_main >= Math.max(V_dyn, V_MIN_L);
    var V_req_basis = main_governs ? 'main' : (V_dyn >= V_MIN_L ? (V_starts >= V_T ? 'starts' : 'runtime') : 'min20');
    var V_used = o.V_useful_l > 0 ? o.V_useful_l : V_req;
    if (o.V_useful_l > 0 && o.V_useful_l < V_dyn - 1e-9) flags.push('sump_small');
    if (o.V_useful_l > 0 && o.V_useful_l < V_MIN_L - 1e-9) flags.push('sump_min20');
    if (o.V_useful_l > 0 && o.main_rule === 'yes' && o.V_useful_l <= V_main + 1e-9) flags.push('sump_le_main');
    var z_worst_total = qp > 0 && V_used > 0 ? 900 * qp / V_used : 0;
    var z_worst_pump = z_worst_total / alt;
    if (z_worst_pump > o.z_max + 1e-9) flags.push('starts_high');
    var cyc = null;
    if (qp > inf.q_in && inf.q_in > 0 && V_used > 0) {
      var ton = V_used / (qp - inf.q_in), toff = V_used / inf.q_in;
      cyc = { t_on_s: ton, t_off_s: toff, starts_h: 3600 / (ton + toff) };
    }
    var P_hyd = rho(o.T_w) * G * qp / 1000 * Hp;
    return {
      valid: true, version: VERSION, input: o, flags: flags, defaulted: ps.miss,
      hard_flags: flags.filter(function (f) { return SOFT_FLAGS.indexOf(f) < 0; }),
      q_ww_raw: inf.q_ww_raw, q_ww: inf.q_ww, q_r: inf.q_r, q_c: inf.q_c, q_in: inf.q_in, du_governs: inf.du_governs,
      q_dw: inf.q_dw, q_sw: inf.q_sw, rain_mixed: rain_mixed,
      pipe: { od: pipe.od, wall: pipe.wall, id: pipe.id, dn: pipe.dn }, dn_min: dnMin, area_m2: A,
      v_in: inf.q_in / 1000 / A, q_vmin: q_vmin, q_req: q_req, vmin_governs: q_vmin > inf.q_in,
      H_geo: req.Hgeo, H_req: req.H, hf_req: req.hf, hl_req: req.hl, lambda_req: req.lambda, Re_req: req.Re,
      duty: duty, q_p: qp, H_p: Hp, v_p: v_p, lambda_p: sysP.lambda,
      alt_factor: alt, V_main_l: V_main, V_starts_l: V_starts, T_run_s: T_run, V_T_l: V_T, V_min_l: V_MIN_L, V_req_l: V_req,
      V_req_strict: main_governs, V_req_basis: V_req_basis, main_governs: main_governs, V_used_l: V_used,
      z_worst_total: z_worst_total, z_worst_pump: z_worst_pump, cycle: cyc,
      P_hyd_W: P_hyd, P1_W: P_hyd / o.eta,
      units: o.arrangement === 'duplex' ? 2 : 1
    };
  }

  /* chart helpers */
  function curves(res, n) {
    n = n || 60;
    if (!res || !res.valid) return null;
    var o = res.input, pipe = res.pipe;
    var qmax = Math.max(res.q_req, res.q_p, res.q_in, o.v_max * res.area_m2 * 1000) * 1.25;
    if (o.pump_mode === 'curve') qmax = Math.max(qmax, pumpQmax(o) * 1.05);
    var sys = [], pmp = [];
    for (var i = 0; i <= n; i++) {
      var q = qmax * i / n;
      sys.push({ q: q, H: systemHead(o, pipe, q).H });
      if (o.pump_mode === 'curve') { var h = pumpHead(o, q); if (h >= 0) pmp.push({ q: q, H: h }); }
    }
    return { qmax: qmax, system: sys, pump: pmp };
  }
  /* starts per hour of the station vs inflow q (0..Qp): Z = 3600·q·(Qp − q)/(V·Qp) */
  function startsCurve(res, n) {
    n = n || 60;
    if (!res || !res.valid || !(res.q_p > 0) || !(res.V_used_l > 0)) return [];
    var out = [], qp = res.q_p, V = res.V_used_l;
    for (var i = 0; i <= n; i++) { var q = qp * i / n; out.push({ q: q, z: 3600 * q * (qp - q) / (V * qp) }); }
    return out;
  }

  var PRESETS = {
    house_basement: function () {
      return { inflow_mode: 'du', sum_du: 3.9, K: 0.5, du_max: 2.0, water: 'faecal', interrupt: 'yes', arrangement: 'single',
        series: 'pe100', dn_mode: 'auto', L_main: 12, zeta_sum: 6, depth_m: 2.6, loop_m: 0.25, pump_mode: 'req', z_max: 15, main_rule: 'yes', V_useful_l: 0 };
    },
    office_single: function () {
      return { inflow_mode: 'du', sum_du: 60, K: 0.5, du_max: 2.0, water: 'faecal', interrupt: 'no', arrangement: 'single', alternate: 'yes',
        series: 'pe100', dn_mode: 'auto', L_main: 25, zeta_sum: 8, depth_m: 3.2, loop_m: 0.25, pump_mode: 'req', z_max: 15, main_rule: 'yes', V_useful_l: 0 };
    },
    office_duplex: function () {
      var p = PRESETS.office_single(); p.arrangement = 'duplex'; p.alternate = 'yes'; return p;
    },
    long_main: function () {
      return { inflow_mode: 'q', q_ww_lps: 3.0, water: 'faecal', interrupt: 'no', arrangement: 'duplex', alternate: 'yes',
        series: 'pe100', dn_mode: 'auto', L_main: 140, zeta_sum: 10, depth_m: 3.5, loop_m: 0.3, pump_mode: 'req', z_max: 15, main_rule: 'yes', V_useful_l: 0 };
    },
    /* Y5-1: rain of the ramp has its own surface-water plant outside the building (EN 12056-4 §5.1); no wastewater in it */
    ramp_rain: function () {
      return { inflow_mode: 'q', q_ww_lps: 0, q_c_lps: 0, rain_area_m2: 150, rain_r: 600, rain_C: 1.0, water: 'faecalfree', interrupt: 'no',
        arrangement: 'duplex', alternate: 'yes', series: 'pvc10', dn_mode: 'auto', L_main: 30, zeta_sum: 8, depth_m: 3.0, loop_m: 0.25, pump_mode: 'req', z_max: 15, main_rule: 'yes', V_useful_l: 0 };
    },
    weak_pump: function () {
      return { inflow_mode: 'du', sum_du: 60, K: 0.5, du_max: 2.0, water: 'faecal', interrupt: 'no', arrangement: 'duplex', alternate: 'yes',
        series: 'pe100', dn_mode: 'auto', L_main: 80, zeta_sum: 10, depth_m: 4.5, loop_m: 0.3, pump_mode: 'curve', H0: 9, Qn: 4, Hn: 6,
        z_max: 15, main_rule: 'yes', V_useful_l: 400 };
    }
  };

  return { VERSION: VERSION, G: G, SOURCES: SOURCES, SOFT_FLAGS: SOFT_FLAGS, SERIES: SERIES, DN_MIN: DN_MIN, V_MIN_L: V_MIN_L, runTime: runTime, DEFAULTS: DEFAULTS, PRESETS: PRESETS,
    rho: rho, mu: mu, friction: friction, pipeList: pipeList, area: area, inflow: function (inp) { return inflow(normalise(inp)); },
    systemHead: function (inp, pipe, q) { return systemHead(normalise(inp), pipe, q); }, pumpHead: function (inp, q) { return pumpHead(normalise(inp), q); },
    normalise: normalise, validate: function (inp) { var ps = parse(inp); return ps.bad.concat(validate(ps.o).filter(function (k) { return ps.bad.indexOf(k) < 0; })); }, solve: solve, curves: curves, startsCurve: startsCurve };
});
