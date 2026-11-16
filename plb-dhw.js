/* plb-dhw.js — PLBDhw: hot water storage volume vs heater power for a daily draw profile.
 * Pure functions, no DOM, deterministic. UMD: window.PLBDhw / module.exports.
 * Method: _plb/dhw/METHOD.md (plbdhw-1.3). Cumulative demand/supply (sequent-peak) storage sizing, cyclic design day,
 * evaluated exactly at every step and draw-event boundary (r4 Y3-2); the design peak is the excess of the peak flow above the
 * step's mean draw, applied once per day at its worst moment and counted in the daily energy (r4 Y3-2/Y3-3, rev 2); heater availability window; heat-pump share with booster; Ecodesign
 * standing-loss limit as default store loss; instantaneous power from the peak mixed-water flow.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PLBDhw = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'plbdhw-1.3';
  var CW = 1.163;            /* Wh/(L·K): 4.187 kJ/(kg·K) × 1 kg/L / 3.6 — the conventional DHW constant (DIN 4708, EN 15316-3) */
  var STEPS = 96, DT = 0.25; /* 15-minute grid over one design day */
  var T_AMB_TEST = 20, DT_TEST = 45; /* Ecodesign standing-loss test: store 65 °C, room 20 °C */
  var NOMINAL = [80, 100, 120, 150, 200, 300, 400, 500, 750, 800, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000];

  /* Hourly shares of the daily volume (24 values, sum 1). Shapes are stated learning assumptions:
     typical published shapes (morning/evening peaks for dwellings, lunch for offices, morning for hotels),
     not measured data. Sports demand is entered as shower events, the base shape is flat and usually zero. */
  function norm(a) { var s = a.reduce(function (x, y) { return x + y; }, 0); return a.map(function (x) { return x / s; }); }
  var SHAPES = {
    residential: norm([0.5, 0.3, 0.2, 0.2, 0.3, 1.5, 6.0, 14.0, 10.0, 5.0, 3.0, 2.5, 3.0, 2.5, 2.0, 2.0, 2.5, 4.0, 6.0, 9.0, 10.0, 8.0, 4.5, 2.0]),
    office:      norm([0, 0, 0, 0, 0, 0, 1, 6, 10, 9, 8, 9, 14, 12, 8, 7, 7, 6, 3, 0, 0, 0, 0, 0]),
    hotel:       norm([1.0, 0.5, 0.3, 0.3, 0.5, 2.0, 8.0, 14.0, 13.0, 9.0, 5.0, 3.0, 3.0, 2.5, 2.0, 2.0, 2.5, 3.5, 5.0, 6.0, 6.5, 5.5, 3.5, 2.0]),
    care:        norm([0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 6.0, 12.0, 13.0, 11.0, 8.0, 5.0, 5.0, 4.0, 3.5, 3.5, 4.0, 5.0, 5.5, 4.0, 3.0, 2.0, 1.0, 0.5]),
    school:      norm([0, 0, 0, 0, 0, 0, 0, 3, 8, 8, 10, 12, 20, 14, 10, 8, 5, 2, 0, 0, 0, 0, 0, 0]),
    sports:      norm([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    flat:        norm([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  };
  /* typical daily mixed-water use at the tap temperature (40 °C), learning assumptions (order of magnitude of
     CIBSE Guide G / VDI 6003 / ASHRAE tables after conversion to 40 °C) — the page asks the user to confirm them */
  var DEMAND = {
    residential: { unit: 'person', l: 70, range: [40, 100] },
    flat:        { unit: 'person', l: 0, range: [0, 0] },
    office:      { unit: 'person', l: 5, range: [2, 10] },
    hotel:       { unit: 'guest', l: 100, range: [70, 170] },
    care:        { unit: 'bed', l: 110, range: [70, 160] },
    school:      { unit: 'pupil', l: 4, range: [2, 8] },
    sports:      { unit: 'person', l: 0, range: [0, 0] }
  };
  var SHOWER_LPS = 0.15;     /* design flow of a shower head, order of magnitude of the DIN 1988-300 design-flow table (mixed water) */

  var DEFAULTS = {
    type: 'residential', units: 55, l_per_unit: 70, events: [],
    t_cold: 10, t_use: 40, t_store: 60, f_use: 0.9,
    heater: 'boiler', mode: 'power', p_kw: 30, v_l: 1000,
    t_hp_max: 55, p_boost_kw: 0,
    win_start: 0, win_end: 0,
    loss_mode: 'ecodesign', loss_w: 100, circ_w: 0,
    q_peak_lps: 1.0, t_peak_min: 10,
    v_pipe_l: null,          /* DVGW W 551: largest water volume of one pipe run heater -> draw-off point (no circulation), L; null = unknown */
    one_two_family: false    /* DVGW W 551: installation in a one- or two-family house = small regardless of volumes (X2-5; same input as plblegionella) */
  };
  /* physical ranges, checked in the engine (D-PLB-14); inclusive [lo, hi] */
  var RANGES = {
    units: [0, 1e6], l_per_unit: [0, 1000], t_cold: [0, 30], t_use: [20, 70], t_store: [30, 95], f_use: [0.3, 1],
    p_kw: [0, 1e5], v_l: [0, 1e6], t_hp_max: [30, 90], p_boost_kw: [0, 1e5], win_start: [0, 24], win_end: [0, 24],
    loss_w: [0, 1e5], circ_w: [0, 1e6], q_peak_lps: [0, 100], t_peak_min: [0, 120], v_pipe_l: [0, 1e4]
  };
  var W551_STORE_L = 400, W551_PIPE_L = 3; /* DVGW W 551 (2004) large installation: store > 400 L or > 3 L in a pipe run */

  /* the page's examples (state only; names and the "aha" text live in the page, in 7 languages) */
  var SHOWERS = [11, 13, 15, 17, 19, 21].map(function (h) { return { start_h: h, dur_h: 0.5, litres: 1600 }; });
  var PRESETS = {
    apartments_24:         { project: 'apartments_24', state: { type: 'residential', units: 57, l_per_unit: 70, heater: 'boiler', p_kw: 30, q_peak_lps: 1.2, t_peak_min: 10 } },
    office_8f:             { project: 'office_8f', state: { type: 'office', units: 600, l_per_unit: 2, heater: 'boiler', p_kw: 15, circ_w: 2000, q_peak_lps: 0.5, t_peak_min: 10 } },
    hotel_120:             { project: 'hotel_120', state: { type: 'hotel', units: 180, l_per_unit: 100, heater: 'boiler', p_kw: 65, q_peak_lps: 3.0, t_peak_min: 10 } },
    sports_hall:           { project: 'sports_hall', state: { type: 'sports', units: 0, l_per_unit: 0, events: SHOWERS, heater: 'boiler', p_kw: 40, q_peak_lps: 3.0, t_peak_min: 15 } },
    care_home_80_hp:       { project: 'care_home_80', state: { type: 'care', units: 80, l_per_unit: 110, heater: 'heatpump', p_kw: 40, t_hp_max: 55, p_boost_kw: 0, q_peak_lps: 2.0, t_peak_min: 10 } },
    care_home_80_hp_boost: { project: 'care_home_80', state: { type: 'care', units: 80, l_per_unit: 110, heater: 'heatpump', p_kw: 40, t_hp_max: 55, p_boost_kw: 9, q_peak_lps: 2.0, t_peak_min: 10 } },
    flat_night_tariff:     { project: null, state: { type: 'residential', units: 2.5, l_per_unit: 70, heater: 'electric', p_kw: 2.4, win_start: 22, win_end: 7, q_peak_lps: 0.15, t_peak_min: 10 } }
  };

  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  /* D-PLB-14: absent / null / '' -> default (noted in o._defaulted); a numeric string is read; anything else is an error */
  function readNum(s, k, o) {
    var v = s[k];
    if (v === undefined) return DEFAULTS[k];
    if (v === null || v === '') { if (DEFAULTS[k] !== null) o._defaulted.push(k); return DEFAULTS[k]; }
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) v = Number(v);
    if (typeof v === 'number' && isFinite(v)) return v;
    o._errors.push('type:' + k); return DEFAULTS[k];
  }
  /* strict boolean (X2-5): true/false, 1/0, 'true'/'false'; absent / null / '' -> default; anything else is an error */
  function readBool(s, k, o) {
    var v = s[k];
    if (v === undefined || v === null || v === '') return DEFAULTS[k];
    if (v === true || v === 1 || v === 'true' || v === '1') return true;
    if (v === false || v === 0 || v === 'false' || v === '0') return false;
    o._errors.push('type:' + k); return DEFAULTS[k];
  }
  /* one draw event (X2-4): start_h, dur_h and litres are required numbers (numeric strings are read);
     0 <= start_h < 24, 0 < dur_h <= 24, litres >= 0; errors carry the event index, nothing is defaulted or wrapped */
  function readEvent(e, i, o) {
    if (!isObj(e)) { o._errors.push('type:events:' + i); return null; }
    var ev = {}, bad = false;
    ['start_h', 'dur_h', 'litres'].forEach(function (k) {
      var v = e[k];
      if (v === undefined || v === null || v === '') { o._errors.push('missing:events:' + i); bad = true; return; }
      if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) v = Number(v);
      if (typeof v !== 'number' || !isFinite(v)) { o._errors.push('type:events:' + i); bad = true; return; }
      ev[k] = v;
    });
    if (bad) return null;
    if (!(ev.start_h >= 0 && ev.start_h < 24) || !(ev.dur_h > 0 && ev.dur_h <= 24) || !(ev.litres >= 0)) { o._errors.push('range:events:' + i); return null; }
    return ev;
  }
  function clean(s) {
    s = isObj(s) ? s : {}; var o = { _defaulted: [], _errors: [] };
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k === 'events') o[k] = [];
      else if (typeof DEFAULTS[k] === 'boolean') o[k] = readBool(s, k, o);
      else if (typeof DEFAULTS[k] === 'number' || DEFAULTS[k] === null) o[k] = readNum(s, k, o);
      else o[k] = typeof s[k] === 'string' ? s[k] : DEFAULTS[k];
    });
    Object.keys(RANGES).forEach(function (k) {
      var v = o[k], R = RANGES[k];
      if (v !== null && o._errors.indexOf('type:' + k) < 0 && (v < R[0] || v > R[1])) o._errors.push('range:' + k);
    });
    if (!SHAPES[o.type] && o.type !== 'custom') o.type = 'residential';
    o.shape = (o.type === 'custom' && Array.isArray(s.shape) && s.shape.length === 24) ? norm(s.shape.map(function (x) { return Math.max(0, num(x, 0)); }).map(function (x, i, a) { return a.every(function (y) { return y === 0; }) ? 1 : x; })) : (SHAPES[o.type] || SHAPES.flat);
    if (s.events !== undefined && s.events !== null && !Array.isArray(s.events)) o._errors.push('type:events');
    o.events = (Array.isArray(s.events) ? s.events : []).map(function (e, i) { return readEvent(e, i, o); })
      .filter(function (e) { return e !== null && e.litres > 0; });
    if (o.heater === 'heatpump' && !(o.t_hp_max > o.t_cold)) o._errors.push('hp_max_not_above_cold');
    /* sanitised values so that an invalid input never produces NaN downstream */
    o.units = Math.max(0, o.units); o.l_per_unit = Math.max(0, o.l_per_unit);
    o.f_use = Math.min(1, Math.max(0.3, o.f_use));
    o.win_start = ((o.win_start % 24) + 24) % 24; o.win_end = ((o.win_end % 24) + 24) % 24;
    o.p_kw = Math.max(0, o.p_kw); o.v_l = Math.max(0, o.v_l); o.p_boost_kw = Math.max(0, o.p_boost_kw);
    o.loss_w = Math.max(0, o.loss_w); o.circ_w = Math.max(0, o.circ_w); o.q_peak_lps = Math.max(0, o.q_peak_lps); o.t_peak_min = Math.max(0, o.t_peak_min);
    o._errors = o._errors.filter(function (e, i, a) { return a.indexOf(e) === i; });
    return o;
  }

  /* litres of mixed water drawn in each 15-min step */
  function drawLitres(s) {
    var L = new Array(STEPS).fill(0), base = s.units * s.l_per_unit;
    for (var h = 0; h < 24; h++) for (var q = 0; q < 4; q++) L[h * 4 + q] += base * s.shape[h] / 4;
    s.events.forEach(function (e) {
      /* uniform over [start, start+dur), wrapped over midnight; overlap with each step */
      var a = ((e.start_h % 24) + 24) % 24, rate = e.litres / e.dur_h;
      for (var k = -1; k <= Math.ceil(e.dur_h / 24) + 1; k++) {
        var s0 = a + 24 * k, s1 = s0 + e.dur_h;
        for (var i = 0; i < STEPS; i++) {
          var t0 = i * DT, t1 = t0 + DT, ov = Math.min(t1, s1) - Math.max(t0, s0);
          if (ov > 0) L[i] += rate * ov;
        }
      }
    });
    return L;
  }
  function available(s) {
    var A = new Array(STEPS).fill(1);
    if (s.win_start === s.win_end) return A;
    for (var i = 0; i < STEPS; i++) {
      var t = i * DT + DT / 2;
      A[i] = (s.win_start < s.win_end) ? ((t >= s.win_start && t < s.win_end) ? 1 : 0) : ((t >= s.win_start || t < s.win_end) ? 1 : 0);
    }
    return A;
  }
  /* Ecodesign (EU) 814/2013 Annex II standing-loss limit S = 16.66 + 8.33·V^0.4 W, scaled from the 45 K test
     difference to (T_store − 20 °C) */
  function ecodesignLossW(V, tStore) { if (!(V > 0)) return 0; return (16.66 + 8.33 * Math.pow(V, 0.4)) * Math.max(0, tStore - T_AMB_TEST) / DT_TEST; }

  /* sequent-peak: the largest cumulative net deficit over any cyclic window (kWh) */
  function maxDeficit(net) {
    var n = net.length, best = 0, run = 0, total = 0, minRun = 0, worst = 0, i;
    for (i = 0; i < n; i++) { run = Math.max(0, run) + net[i]; if (run > best) best = run; total += net[i]; }
    for (i = 0, run = 0; i < n; i++) { run = Math.min(0, run) + net[i]; if (run < worst) worst = run; }
    var circ = total - worst; /* window wrapping midnight = total minus the most negative inner run */
    return Math.max(0, best, worst < 0 ? circ : 0);
  }

  function context(s) {
    var tEff = s.t_store, flags = [];
    var isHP = s.heater === 'heatpump';
    if (isHP && s.t_store > s.t_hp_max && !(s.p_boost_kw > 0)) { tEff = s.t_hp_max; flags.push('hp_cannot_reach'); }
    var a = 1; /* share of each kWh stored that the main generator supplies */
    if (isHP && tEff > s.t_hp_max) a = (s.t_hp_max - s.t_cold) / (tEff - s.t_cold);
    a = Math.max(0, Math.min(1, a));
    var L = drawLitres(s), A = available(s);
    var ePerL = CW * (s.t_use - s.t_cold) / 1000; /* kWh per litre of mixed water */
    var D = L.map(function (x) { return x * ePerL; });
    var pInst = s.q_peak_lps * 3600 * CW * (s.t_use - s.t_cold) / 1000, tPk = s.t_peak_min / 60;
    var c = { tEff: tEff, a: a, isHP: isHP, L: L, A: A, D: D, ePerL: ePerL, flags: flags,
             hAvail: A.reduce(function (x, y) { return x + y; }, 0) * DT,
             pInst: pInst, tPeak: s.t_peak_min, tPk: tPk };
    c.grid = timeGrid(s, c);
    c.ePk = c.grid.qMax;                         /* largest excess energy of the one daily peak (kWh), in the daily balance */
    c.lPk = ePerL > 0 ? c.ePk / ePerL : 0;       /* the same as litres at T_use */
    return c;
  }
  function pEffOf(s, c, pMain) {
    if (c.a >= 1) return pMain;
    if (c.a <= 0) return s.p_boost_kw;
    return Math.min(pMain / c.a, s.p_boost_kw / (1 - c.a));
  }
  /* Exact time grid (r4 Y3-2). Over one day the draw rate is constant between consecutive breakpoints = the 15-min step
     boundaries plus every draw-event start and end (wrapped); availability is constant per step. Over two laps (0..48 h)
     the cumulative draw Wd(t) (kWh), the cumulative heater hours Wa(t) and the cumulative peak excess Wx(t) are piecewise
     linear, so G(t) = Wd(t) + P_L·t − P_e·Wa(t) is exact at any point by linear interpolation. The grid holds the
     breakpoints and, for a peak of duration T, the breakpoints shifted by ±T (the candidate peak and window ends).
     Peak excess rate (rev 2, the 1.2 meaning of q_peak): in step i e_i = max(0, P_inst − D_i/Δt) — the peak flow above the
     step's mean draw (draw events included); e_i = 0 in a step without any draw (the peak happens while the profile draws);
     if the whole day has no draw, e_i = P_inst in every step (the peak is then the whole demand). */
  function timeGrid(s, c) {
    var bp = [], i, k;
    for (i = 0; i <= STEPS; i++) bp.push(i * DT);
    s.events.forEach(function (e) { [e.start_h, e.start_h + e.dur_h].forEach(function (t) { bp.push(((t % 24) + 24) % 24); }); });
    bp.sort(function (x, y) { return x - y; });
    var one = [];
    bp.forEach(function (t) { if (!one.length || t - one[one.length - 1] > 1e-9) one.push(t); });
    if (one[one.length - 1] < 24 - 1e-9) one.push(24); else one[one.length - 1] = 24;
    var T = (c.pInst > 0 && c.tPk > 0) ? c.tPk : 0;
    var anyDraw = c.D.some(function (x) { return x > 1e-12; });
    var ex = c.D.map(function (x) { return T > 0 ? (anyDraw ? (x > 1e-12 ? Math.max(0, c.pInst - x / DT) : 0) : c.pInst) : 0; });
    /* draw rate (kWh/h), availability and peak excess rate of each segment of one lap */
    var segs = [];
    for (k = 0; k + 1 < one.length; k++) {
      var t0 = one[k], t1 = one[k + 1], mid = (t0 + t1) / 2, st = Math.min(STEPS - 1, Math.floor(mid / DT));
      var rate = s.units * s.l_per_unit * s.shape[Math.floor(st / 4)] * c.ePerL; /* base: hourly share, uniform in the hour */
      s.events.forEach(function (e) {
        var a0 = ((e.start_h % 24) + 24) % 24;
        for (var d = -1; d <= 1; d++) { var u0 = a0 + 24 * d, u1 = u0 + e.dur_h; if (mid > u0 && mid < u1) rate += e.litres / e.dur_h * c.ePerL; }
      });
      segs.push({ t0: t0, t1: t1, r: rate, A: c.A[st], x: ex[st] });
    }
    var B = [0], Wd = [0], Wa = [0], Wx = [0];
    for (var lap = 0; lap < 2; lap++) segs.forEach(function (g) {
      var h = g.t1 - g.t0; B.push(g.t1 + 24 * lap); Wd.push(Wd[Wd.length - 1] + g.r * h); Wa.push(Wa[Wa.length - 1] + g.A * h); Wx.push(Wx[Wx.length - 1] + g.x * h);
    });
    var pts = B.slice();
    if (T > 0) B.forEach(function (t) { if (t + T <= 48 + 1e-12) pts.push(Math.min(48, t + T)); if (t - T >= -1e-12) pts.push(Math.max(0, t - T)); });
    pts.sort(function (x, y) { return x - y; });
    var tq = [], dq = [], aq = [], xq = [], j = 0;
    pts.forEach(function (t) {
      if (tq.length && t - tq[tq.length - 1] <= 1e-12) return;
      while (j + 2 < B.length && B[j + 1] < t) j++;
      var f = B[j + 1] > B[j] ? (t - B[j]) / (B[j + 1] - B[j]) : 0;
      f = Math.max(0, Math.min(1, f));
      tq.push(t); dq.push(Wd[j] + (Wd[j + 1] - Wd[j]) * f); aq.push(Wa[j] + (Wa[j + 1] - Wa[j]) * f); xq.push(Wx[j] + (Wx[j + 1] - Wx[j]) * f);
    });
    /* for every grid point i the index of the point i + T (or −1); Q_i = excess energy of a peak starting at t_i */
    var n = tq.length, nx = new Array(n), qMax = 0, p = 0;
    for (i = 0; i < n; i++) {
      while (p < n && tq[p] < tq[i] + T - 1e-9) p++;
      nx[i] = (p < n && Math.abs(tq[p] - tq[i] - T) <= 1e-9) ? p : -1;
      if (T > 0 && nx[i] >= 0 && tq[i] < 24 - 1e-12) qMax = Math.max(qMax, xq[nx[i]] - xq[i]);
    }
    return { t: tq, wd: dq, wa: aq, wx: xq, nx: nx, T: T, qMax: qMax };
  }
  /* Store energy (r4 rev 2): one design peak a day at start τ adds the excess ∫_τ^{τ+T} e dt; with the cumulative net G and the
     cumulative excess X,  E_s = max(0, A, B):
       A (window holds the whole peak)  = max over τ of [X(τ+T) − X(τ) + max_{t2 ≥ τ+T} G(t2) − min_{t1 ≤ τ} G(t1)],
       B (window inside the peak)       = max over t1 ≤ t2 ≤ t1 + T of [(G + X)(t2) − (G + X)(t1)].
     A peak overlapping only one end of a window is never worse than A or B (e ≥ 0). All functions are piecewise linear with
     kinks on the grid, so the maxima are attained on it. Peak part = the excess inside the governing window, day = E − peak. */
  function storeParts(c, pEff, lossKw) {
    var g = c.grid, n = g.t.length, T = g.T, i, j;
    var G = new Array(n), H = new Array(n), pmin = new Array(n), pmi = new Array(n), smax = new Array(n), smi = new Array(n);
    for (i = 0; i < n; i++) { G[i] = g.wd[i] + lossKw * g.t[i] - pEff * g.wa[i]; H[i] = G[i] + g.wx[i]; }
    for (i = 0; i < n; i++) { if (i === 0 || G[i] < pmin[i - 1]) { pmin[i] = G[i]; pmi[i] = i; } else { pmin[i] = pmin[i - 1]; pmi[i] = pmi[i - 1]; } }
    for (i = n - 1; i >= 0; i--) { if (i === n - 1 || G[i] > smax[i + 1]) { smax[i] = G[i]; smi[i] = i; } else { smax[i] = smax[i + 1]; smi[i] = smi[i + 1]; } }
    var best = 0, bd = 0, bp = 0, bt = null;
    for (i = 0; i < n; i++) {                                   /* A */
      j = T > 0 ? g.nx[i] : i;
      if (j < 0) continue;
      var q = T > 0 ? g.wx[j] - g.wx[i] : 0, v = q + smax[j] - pmin[i];
      if (v > best + 1e-12) { best = v; bp = q; bd = v - q; bt = [g.t[pmi[i]], g.t[smi[j]]]; }
    }
    if (T > 0) {                                                 /* B: sliding minimum of H over [t_j − T, t_j] */
      var dq = [], h = 0;
      for (j = 0; j < n; j++) {
        while (dq.length > h && H[dq[dq.length - 1]] >= H[j]) dq.pop();
        dq.push(j);
        while (g.t[dq[h]] < g.t[j] - T - 1e-9) h++;
        var m = dq[h], vs = H[j] - H[m];
        if (vs > best + 1e-12) { best = vs; bp = g.wx[j] - g.wx[m]; bd = vs - bp; bt = [g.t[m], g.t[j]]; }
      }
    }
    return { E: best, day: bd, peak: bp, window: bt };
  }
  function deficitAt(c, pEff, lossKw) { return storeParts(c, pEff, lossKw).E; }
  function governs(c, pEff, lossKw) {
    var p = storeParts(c, pEff, lossKw);
    if (!(p.E > 1e-12)) return 'none';
    if (!(p.peak > 1e-12)) return 'day';
    if (!(p.day > 1e-12)) return 'peak'; /* the heater may offset part of the peak while it runs: day part <= 0 */
    return 'combined';
  }
  function volOf(c, s, E) { return E * 1000 / (CW * (c.tEff - s.t_cold) * s.f_use); }
  /* required volume for an effective power, standing loss consistent with the volume (fixed point) */
  function volumeFor(s, c, pEff) {
    var V = 0, it, lossKw;
    for (it = 0; it < 200; it++) {
      var sw = s.loss_mode === 'given' ? s.loss_w : ecodesignLossW(V, c.tEff);
      lossKw = (sw + s.circ_w) / 1000;
      if (pEff * c.hAvail <= sum(c.D) + c.ePk + lossKw * 24 + 1e-12) return { ok: false, V: null, E: null, lossKw: lossKw, storeW: sw };
      var E = deficitAt(c, pEff, lossKw), Vn = volOf(c, s, E);
      if (Math.abs(Vn - V) < 1e-9) { V = Vn; break; }
      V = Vn;
      if (V > 1e8) return { ok: false, V: null, E: null, lossKw: lossKw, storeW: sw };
    }
    var sw2 = s.loss_mode === 'given' ? s.loss_w : ecodesignLossW(V, c.tEff);
    return { ok: true, V: V, E: V * CW * (c.tEff - s.t_cold) * s.f_use / 1000, lossKw: (sw2 + s.circ_w) / 1000, storeW: sw2 };
  }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function nominalOf(V) { for (var i = 0; i < NOMINAL.length; i++) if (NOMINAL[i] >= V - 1e-9) return NOMINAL[i]; return Math.ceil(V / 1000) * 1000; }

  /* smallest effective power that fits a given volume (bisection on the monotone deficit) */
  function powerFor(s, c, V) {
    var sw = s.loss_mode === 'given' ? s.loss_w : ecodesignLossW(V, c.tEff), lossKw = (sw + s.circ_w) / 1000;
    var cap = V * CW * (c.tEff - s.t_cold) * s.f_use / 1000, Ed = sum(c.D) + c.ePk;
    if (!(c.hAvail > 0)) return { ok: false, P: null, lossKw: lossKw, storeW: sw };
    var lo = (Ed + lossKw * 24) / c.hAvail, hi = Math.max(lo * 2, 1);
    while (deficitAt(c, hi, lossKw) > cap + 1e-12) { hi *= 2; if (hi > 1e6) return { ok: false, P: null, lossKw: lossKw, storeW: sw }; }
    if (deficitAt(c, lo, lossKw) <= cap + 1e-12) return { ok: true, P: lo, lossKw: lossKw, storeW: sw };
    for (var k = 0; k < 100; k++) { var m = (lo + hi) / 2; if (deficitAt(c, m, lossKw) > cap) lo = m; else hi = m; if (hi - lo < 1e-9 * hi) break; }
    return { ok: true, P: hi, lossKw: lossKw, storeW: sw };
  }

  function fin(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  /* DVGW W 551 class (CR-30): large if the store exceeds 400 L or one pipe run holds more than 3 L; 'unknown' when the store
     is small and the pipe volume was not given; one- and two-family houses are small regardless of the volumes (X2-5) */
  function w551(vStore, vPipe, oneTwoFamily) {
    if (oneTwoFamily) return 'small';
    if (vStore != null && vStore > W551_STORE_L) return 'large';
    if (vPipe != null && vPipe > W551_PIPE_L) return 'large';
    if (vPipe == null) return 'unknown';
    return 'small';
  }
  function solve(input) {
    var s = clean(input), c = context(s), flags = c.flags.slice(), errors = s._errors.slice();
    if (!(s.t_store > s.t_cold) || !(c.tEff > s.t_cold)) errors.push('store_not_above_cold');
    if (s.t_use > c.tEff) errors.push('use_above_store');
    if (!(s.t_use > s.t_cold)) errors.push('use_not_above_cold');
    var Ed = sum(c.D) + c.ePk, Vd = sum(c.L) + c.lPk; /* r4 Y3-3: the peak's excess above the profile is part of the day's draw */
    var r = { version: VERSION, valid: errors.length === 0, errors: errors, flags: flags, defaulted: s._defaulted.slice(), mode: s.mode, heater: s.heater,
      t_store_eff_c: c.tEff, daily_volume_l: Vd, daily_energy_kwh: Ed, peak_volume_l: c.lPk, peak_energy_kwh: c.ePk, hours_available: c.hAvail, hp_share: c.a,
      peak_hour_kwh: 0, peak_hour_share: 0, p_inst_kw: s.q_peak_lps * 3600 * CW * (s.t_use - s.t_cold) / 1000, v_pipe_l: s.v_pipe_l, one_two_family: s.one_two_family,
      profile: { draw_kwh: c.D.slice(), available: c.A.slice() } };
    for (var h = 0; h < 24; h++) { var e = c.D[4 * h] + c.D[4 * h + 1] + c.D[4 * h + 2] + c.D[4 * h + 3]; if (e > r.peak_hour_kwh) r.peak_hour_kwh = e; }
    r.peak_hour_share = Ed > 0 ? r.peak_hour_kwh / Ed : 0; /* profile hours; the design peak has no fixed hour */
    if (s._defaulted.length) flags.push('defaults_used');
    if (!r.valid) return r;
    if (!(c.hAvail > 0)) flags.push('no_heater_hours');
    var pEff, sz;
    if (s.mode === 'volume') {
      var pf = powerFor(s, c, s.v_l);
      r.feasible = pf.ok; r.v_store_l = s.v_l; r.store_loss_w = pf.storeW; r.loss_kw = pf.lossKw;
      pEff = pf.P;
      if (pf.ok && c.a < 1) {
        if (c.a > 0 && s.p_boost_kw / (1 - c.a) < pEff - 1e-9) { r.feasible = false; flags.push('booster_limits'); }
      }
      r.p_eff_kw = pf.ok ? pEff : null; r.p_main_kw = pf.ok ? pEff * c.a : null; r.p_boost_needed_kw = pf.ok ? pEff * (1 - c.a) : null;
      r.e_store_kwh = s.v_l * CW * (c.tEff - s.t_cold) * s.f_use / 1000;
      r.governs = pf.ok ? governs(c, pEff, pf.lossKw) : null;
    } else {
      pEff = pEffOf(s, c, s.p_kw);
      sz = volumeFor(s, c, pEff);
      r.feasible = sz.ok; r.p_eff_kw = pEff; r.p_main_kw = s.p_kw; r.p_boost_needed_kw = pEff * (1 - c.a);
      r.v_store_l = sz.ok ? sz.V : null; r.e_store_kwh = sz.ok ? sz.E : null; r.governs = sz.ok ? governs(c, pEff, sz.lossKw) : null;
      r.store_loss_w = sz.storeW; r.loss_kw = sz.lossKw;
      if (c.a < 1 && c.a > 0 && s.p_boost_kw / (1 - c.a) < s.p_kw / c.a) flags.push('booster_limits');
    }
    r.p_min_kw = c.hAvail > 0 ? (Ed + r.loss_kw * 24) / c.hAvail : null; /* daily average over the available hours */

    r.loss_day_kwh = r.loss_kw * 24;
    r.loss_share = (Ed + r.loss_day_kwh) > 0 ? r.loss_day_kwh / (Ed + r.loss_day_kwh) : 0;
    r.booster_kwh_day = (Ed + r.loss_day_kwh) * (1 - c.a);
    r.p_inst_ratio = null;
    if (!r.feasible) { flags.push('infeasible'); r.v_nominal_l = null; r.reheat_h = null; r.mixed_capacity_l = null; }
    else {
      if (s.mode === 'volume') r.v_nominal_l = s.v_l;
      else if (!(r.v_store_l > 1e-9)) { r.v_nominal_l = 0; flags.push('no_store_needed'); }
      else r.v_nominal_l = nominalOf(r.v_store_l);
      var net = r.p_eff_kw - r.loss_kw;
      r.reheat_h = net > 0 ? r.v_store_l * CW * (c.tEff - s.t_cold) / 1000 / net : null;
      r.mixed_capacity_l = r.v_store_l * s.f_use * (c.tEff - s.t_cold) / (s.t_use - s.t_cold);
      r.p_inst_ratio = r.p_eff_kw > 0 ? r.p_inst_kw / r.p_eff_kw : null;
    }
    /* DVGW W 551 class on the store actually installed (nominal / given) */
    r.w551_class = w551(r.feasible ? r.v_nominal_l : null, s.v_pipe_l, s.one_two_family);
    r.w551_reason = s.one_two_family ? 'one_two_family' : null;
    if (s.one_two_family) flags.push('w551_small_one_two_family');
    else if (r.w551_class === 'large') {
      flags.push('w551_large');
      if (c.tEff < 60) flags.push('w551_large_below_60');
      if (c.isHP && c.a < 1) flags.push('w551_preheat_daily');
    } else if (r.w551_class === 'unknown') flags.push('w551_pipe_unknown');
    /* r4 Y3-4: the 3-litre rule (more than 3 L between the heater outlet and a draw-off point without circulation) applies to every
       installation, also in one- and two-family houses, independently of the small/large class */
    if (s.v_pipe_l != null && s.v_pipe_l > W551_PIPE_L) flags.push('w551_pipe_3l');
    if (c.tEff < 60) flags.push('legionella_below_60');
    if (r.loss_share > 0.5) flags.push('losses_dominate');
    if (s.loss_mode !== 'given' && r.v_store_l > 2000) flags.push('ecodesign_extrapolated');
    if (s.heater === 'electric' && r.p_inst_kw > 9.2) flags.push('inst_above_connection');
    if (c.hAvail < 24) flags.push('window_limited');
    r.curve = curve(s, c);
    return r;
  }
  function curve(s, c) {
    var Ed = sum(c.D), pts = [];
    var base = s.loss_mode === 'given' ? s.loss_w : 0;
    var lo = (Ed + c.ePk + (base + s.circ_w) / 1000 * 24) / (c.hAvail || NaN);
    if (!(lo > 0) || !isFinite(lo)) return pts;
    /* upper end: the instantaneous power, where no store is needed */
    var hi = Math.max(lo * 1.5, c.pInst);
    for (var k = 0; k <= 40; k++) {
      var p = lo * 1.03 + (hi - lo * 1.03) * k / 40, v = volumeFor(s, c, p);
      if (v.ok && isFinite(v.V)) pts.push({ p_kw: p, v_l: v.V });
    }
    return pts;
  }
  /* storage-vs-power at any effective power (for the bench and the chart cursor) */
  function volumeAt(input, pEff) { var s = clean(input), c = context(s); return volumeFor(s, c, pEff); }

  function moduleResults(r) {
    if (!r || !r.valid) return { valid: false, errors: r ? r.errors : [] };
    var keys = ['mode', 'heater', 'feasible', 'w551_class', 'w551_reason', 'one_two_family', 'v_pipe_l', 't_store_eff_c', 'daily_volume_l', 'daily_energy_kwh', 'peak_volume_l', 'peak_energy_kwh', 'hours_available', 'hp_share', 'peak_hour_kwh', 'p_inst_kw',
      'p_eff_kw', 'p_main_kw', 'p_boost_needed_kw', 'p_min_kw', 'v_store_l', 'v_nominal_l', 'e_store_kwh', 'store_loss_w', 'loss_kw', 'loss_day_kwh', 'loss_share',
      'booster_kwh_day', 'reheat_h', 'mixed_capacity_l', 'governs'];
    var o = { valid: true, version: VERSION, flags: r.flags.slice() };
    keys.forEach(function (k) { var v = r[k]; o[k] = (typeof v === 'number' && !isFinite(v)) ? null : v; });
    return o;
  }
  function moduleSummary(r) {
    if (!r || !r.valid || !r.feasible) return { ok: false };
    return { ok: true, heater_kw: r.mode === 'volume' ? r.p_main_kw : r.p_main_kw, store_l: r.v_nominal_l, t_store_c: r.t_store_eff_c, daily_kwh: r.daily_energy_kwh };
  }

  return { version: VERSION, PRESETS: PRESETS, RANGES: RANGES, W551_STORE_L: W551_STORE_L, W551_PIPE_L: W551_PIPE_L, CW: CW, STEPS: STEPS, DT: DT, SHAPES: SHAPES, DEMAND: DEMAND, DEFAULTS: DEFAULTS, NOMINAL: NOMINAL, SHOWER_LPS: SHOWER_LPS,
           clean: clean, solve: solve, volumeAt: volumeAt, ecodesignLossW: ecodesignLossW, maxDeficit: maxDeficit, storeEnergy: function (input, pEff, lossKw) { var s = clean(input); return storeParts(context(s), pEff, lossKw); }, nominalOf: nominalOf,
           drawLitres: function (s) { return drawLitres(clean(s)); }, moduleResults: moduleResults, moduleSummary: moduleSummary };
});
