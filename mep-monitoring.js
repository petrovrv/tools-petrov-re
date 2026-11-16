/* mep-monitoring.js — engine of the Condition Monitoring Advisor (mepmonitoring.html).
 * Global MEPCM (UMD). No DOM, no dependencies, deterministic.
 *
 * Method (published, in the order it is applied):
 *  1. P–F interval of the failure mode (Moubray, RCM II, 1997; NASA RCM Guide 2008 §5): the time
 *     from the point P where a failure can first be detected to the functional failure F.
 *  2. Technique-usable P–F = pf_fraction × P–F: a technique only "sees" the defect once it has grown
 *     to its detection threshold (NASA RCM Guide 2008, P–F curve; DOE O&M Best Practices R3 ch. 6).
 *  3. Detection window W = usable P–F − response time (planning, parts and the repair itself must
 *     fit before F). Recommended inspection interval = W / 2 (NASA RCM Guide; the same rule as
 *     MEPStrat: I = (P–F_usable − response)/2), computed on the conservative (low) P–F.
 *  4. Probability of detection P(det) for an inspection interval I with a random phase between the
 *     onset of P and the inspection calendar: N looks fall inside W, N = floor(W/I) or floor(W/I)+1
 *     with probability 1−f and f (f = frac(W/I)); each look detects with probability pod,
 *     independently, up to `looks_cap` independent looks (an online sensor that misses keeps missing:
 *     looks_cap = 1). P(det) = 1 − [(1−f)(1−pod)^min(k,cap) + f(1−pod)^min(k+1,cap)].
 *  5. Economics per measurement point and year:
 *       λ = 1/MTBF (failures/y), A = c·[(C_corr − C_planned) + D·max(0, MTTR − t_planned)],
 *       benefit = units·λ·P(det)·A,  cost = units·(readings·c_read + fixed + fa·C_fa),
 *       net = benefit − cost.
 *     lo = pessimistic (short P–F, long MTBF, high reading cost), hi = optimistic, mid = mid values.
 *  6. Break-even downtime cost D* solves net(D) = 0: D* = (cost/(units·λ·P(det)·c) − ΔC)/Δh.
 *  7. Tornado: each uncertain input swung over its range with the others at mid.
 * Numbers in PRESETS and TECH_FALLBACK are learning assumptions unless a source is named; they are
 * never manufacturer data. Statutory tasks are not decided here (D-MEP-5) — they are retained.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MEPCM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var DAYS_Y = 365;

  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function tri(v, d) {
    /* [lo,mid,hi] from an array, a number or {lo,mid,hi}; sorted ascending */
    var a;
    if (Array.isArray(v)) a = [num(v[0], NaN), num(v[1], NaN), num(v[2], NaN)];
    else if (v && typeof v === 'object') a = [num(v.lo, NaN), num(v.mid, NaN), num(v.hi, NaN)];
    else if (typeof v === 'number' && isFinite(v)) a = [v, v, v];
    else a = d ? d.slice() : [NaN, NaN, NaN];
    if (!isFinite(a[1])) a[1] = isFinite(a[0]) && isFinite(a[2]) ? (a[0] + a[2]) / 2 : (isFinite(a[0]) ? a[0] : a[2]);
    if (!isFinite(a[0])) a[0] = a[1];
    if (!isFinite(a[2])) a[2] = a[1];
    a.sort(function (x, y) { return x - y; });
    return a;
  }

  /* --- delivery modes: how the technique is applied ---------------------------------------- */
  var MODES = {
    route:  { id: 'route',  min_interval_days: 7, max_interval_days: 730, looks_cap: Infinity },
    online: { id: 'online', sample_days: 1 / 24, looks_cap: 1 },
    bms:    { id: 'bms',    sample_days: 1 / 96, looks_cap: 1 }
  };

  /* --- technique fallback (used only when MEPCore.TECHNIQUES is absent or lacks a field) ------
     pf_fraction: share of the failure mode's P–F the technique can use; pod: probability that one
     look inside the window flags the defect. All learning assumptions, labelled as such in the UI;
     orders of magnitude after NASA RCM Guide 2008 table of techniques and DOE O&M BP R3 ch. 6. */
  var TECH_FALLBACK = {
    vibration:           { pf_fraction: 0.8, pod: 0.9,  modes: ['route', 'online'], cost_per_reading_eur: [20, 35, 60],   online_fixed_eur_y: [500, 900, 1500], skill: 'specialist_vendor' },
    ir_thermography:     { pf_fraction: 0.7, pod: 0.9,  modes: ['route', 'online'], cost_per_reading_eur: [150, 300, 600], online_fixed_eur_y: [800, 1500, 3000], skill: 'specialist_vendor' },
    oil_analysis:        { pf_fraction: 0.7, pod: 0.7,  modes: ['route'],           cost_per_reading_eur: [40, 70, 120],   online_fixed_eur_y: null, skill: 'hvac_mech' },
    ultrasound_airborne: { pf_fraction: 0.85, pod: 0.75, modes: ['route'],          cost_per_reading_eur: [10, 20, 40],    online_fixed_eur_y: null, skill: 'hvac_mech' },
    motor_current:       { pf_fraction: 0.6, pod: 0.75, modes: ['route', 'online'], cost_per_reading_eur: [40, 80, 150],   online_fixed_eur_y: [400, 800, 1500], skill: 'electrician' },
    dp_trend:            { pf_fraction: 0.9, pod: 0.95, modes: ['bms', 'route'],    cost_per_reading_eur: [8, 15, 25],     online_fixed_eur_y: [0, 30, 100], skill: 'controls' },
    bms_trend:           { pf_fraction: 0.6, pod: 0.8,  modes: ['bms'],             cost_per_reading_eur: [0, 0, 0],       online_fixed_eur_y: [0, 50, 200], skill: 'controls' },
    battery_impedance:   { pf_fraction: 0.8, pod: 0.8,  modes: ['route', 'online'], cost_per_reading_eur: [150, 250, 400], online_fixed_eur_y: [800, 1200, 2000], skill: 'electrician' },
    water_sampling:      { pf_fraction: 0.5, pod: 0.8,  modes: ['route'],           cost_per_reading_eur: [40, 80, 150],   online_fixed_eur_y: null, skill: 'plumber' },
    insulation_resistance:{ pf_fraction: 0.5, pod: 0.7, modes: ['route'],           cost_per_reading_eur: [40, 80, 150],   online_fixed_eur_y: null, skill: 'electrician' },
    visual_inspection:   { pf_fraction: 0.3, pod: 0.6,  modes: ['route'],           cost_per_reading_eur: [5, 15, 30],     online_fixed_eur_y: null, skill: 'hvac_mech' },
    performance_test:    { pf_fraction: 1.0, pod: 0.95, modes: ['route'],           cost_per_reading_eur: [500, 1500, 3000], online_fixed_eur_y: null, skill: 'specialist_vendor' }
  };

  /* --- 4. probability of detection ---------------------------------------------------------- */
  function pDetect(W, I, pod, cap) {
    W = num(W, 0); I = num(I, NaN); pod = clamp(num(pod, 1), 0, 1);
    cap = cap == null ? Infinity : cap;
    if (!(W > 0) || !(I > 0) || pod <= 0) return 0;
    var r = W / I, k = Math.floor(r), f = r - k;
    var miss = function (n) { return Math.pow(1 - pod, Math.min(n, cap)); };
    return clamp(1 - ((1 - f) * miss(k) + f * miss(k + 1)), 0, 1);
  }

  function recommendInterval(pfUsable, response) {
    var w = num(pfUsable, 0) - num(response, 0);
    return w > 0 ? w / 2 : 0;
  }

  /* --- normalise one case ------------------------------------------------------------------- */
  function normCase(c) {
    c = c || {};
    return {
      pf_days: tri(c.pf_days),
      mtbf_y: tri(c.mtbf_y),
      response_days: Math.max(0, num(c.response_days, 0)),
      corrective_cost_eur: Math.max(0, num(c.corrective_cost_eur, 0)),
      planned_repair_cost_eur: Math.max(0, num(c.planned_repair_cost_eur, 0)),
      downtime_cost_eur_h: Math.max(0, num(c.downtime_cost_eur_h, 0)),
      mttr_h: Math.max(0, num(c.mttr_h, 0)),
      planned_downtime_h: Math.max(0, num(c.planned_downtime_h, 0)),
      consequence_probability: clamp(num(c.consequence_probability, 1), 0, 1),
      units: Math.max(1, Math.round(num(c.units, 1))),
      false_alarms_y: Math.max(0, num(c.false_alarms_y, 0)),
      false_alarm_cost_eur: Math.max(0, num(c.false_alarm_cost_eur, 0)),
      safety: !!c.safety
    };
  }

  function normOption(o) {
    o = o || {};
    var fb = TECH_FALLBACK[o.technique] || {};
    var mode = MODES[o.mode] ? o.mode : 'route';
    var cpr = o.cost_per_reading_eur != null ? tri(o.cost_per_reading_eur) : tri(fb.cost_per_reading_eur, [0, 0, 0]);
    var fixed = o.fixed_eur_y != null ? tri(o.fixed_eur_y)
      : (mode === 'route' ? [0, 0, 0] : tri(fb.online_fixed_eur_y, [0, 0, 0]));
    if (mode !== 'route' && o.cost_per_reading_eur == null) cpr = [0, 0, 0];
    return {
      id: String(o.id || (o.technique + '_' + mode)),
      technique: String(o.technique || ''),
      mode: mode,
      interval_days: (typeof o.interval_days === 'number' && isFinite(o.interval_days) && o.interval_days > 0) ? o.interval_days : null,
      pf_fraction: clamp(num(o.pf_fraction, num(fb.pf_fraction, 1)), 0.01, 1),
      pod: clamp(num(o.pod, num(fb.pod, 0.9)), 0, 1),
      cost_per_reading_eur: cpr,
      fixed_eur_y: fixed,
      looks_cap: o.looks_cap != null ? o.looks_cap : MODES[mode].looks_cap,
      provenance: o.provenance || (TECH_FALLBACK[o.technique] ? 'learning_assumption' : 'user')
    };
  }

  /* --- the core evaluation at one set of scalar values -------------------------------------- */
  function point(cs, op, pf, mtbf, cpr, fixed, I, D) {
    var usable = op.pf_fraction * pf;
    var W = usable - cs.response_days;
    var Pd = pDetect(W, I, op.pod, op.looks_cap);
    var lam = mtbf > 0 ? 1 / mtbf : 0;
    var readings = DAYS_Y / I;
    var dC = cs.corrective_cost_eur - cs.planned_repair_cost_eur;
    var dh = Math.max(0, cs.mttr_h - cs.planned_downtime_h);
    var Dv = D == null ? cs.downtime_cost_eur_h : D;
    var A = cs.consequence_probability * (dC + Dv * dh);
    var benefit = cs.units * lam * Pd * A;
    var costRead = op.mode === 'route' ? readings * cpr : 0;
    var cost = cs.units * (costRead + fixed + cs.false_alarms_y * cs.false_alarm_cost_eur);
    var be = null, beKind = 'finite';
    var k = cs.units * lam * Pd * cs.consequence_probability;
    if (!(k > 0)) { beKind = 'never'; }
    else if (!(dh > 0)) { beKind = (k * dC >= cost) ? 'always' : 'never'; }
    else {
      be = (cost / k - dC) / dh;
      if (be <= 0) { beKind = 'always'; be = 0; }
    }
    return {
      usable_pf_days: usable, window_days: W, p_detect: Pd, lambda_y: lam,
      readings_per_year: readings, avoided_per_failure_eur: A,
      benefit_eur_y: benefit, cost_eur_y: cost, net_eur_y: benefit - cost,
      detected_per_year: cs.units * lam * Pd, missed_per_year: cs.units * lam * (1 - Pd),
      breakeven_downtime_eur_h: be, breakeven_kind: beKind
    };
  }

  function chooseInterval(cs, op) {
    var m = MODES[op.mode];
    var usableLo = op.pf_fraction * cs.pf_days[0];
    var rec = recommendInterval(usableLo, cs.response_days);
    var reasons = [];
    var I;
    if (op.mode === 'route') {
      if (op.interval_days != null) { I = op.interval_days; reasons.push('interval_user'); }
      else {
        I = rec > 0 ? clamp(rec, m.min_interval_days, m.max_interval_days) : m.min_interval_days;
        reasons.push('interval_recommended');
      }
      if (!(rec > 0)) reasons.push('no_window_lo');
      else if (rec < m.min_interval_days) reasons.push('route_too_slow');
      if (I > rec && rec > 0) reasons.push('interval_longer_than_recommended');
    } else {
      I = m.sample_days;
      reasons.push('continuous');
      if (!(rec > 0)) reasons.push('no_window_lo');
    }
    return { interval_days: I, recommended_days: rec, reasons: reasons };
  }

  /* evaluate(case, option) -> full result with lo/mid/hi */
  function evaluate(caseIn, optionIn) {
    var cs = normCase(caseIn), op = normOption(optionIn);
    var ch = chooseInterval(cs, op);
    var I = ch.interval_days;
    /* lo: pessimistic for the net */
    var lo = point(cs, op, cs.pf_days[0], cs.mtbf_y[2], op.cost_per_reading_eur[2], op.fixed_eur_y[2], I);
    var mid = point(cs, op, cs.pf_days[1], cs.mtbf_y[1], op.cost_per_reading_eur[1], op.fixed_eur_y[1], I);
    var hi = point(cs, op, cs.pf_days[2], cs.mtbf_y[0], op.cost_per_reading_eur[0], op.fixed_eur_y[0], I);
    var reasons = ch.reasons.slice();
    if (!(mid.window_days > 0)) reasons.push('no_window_mid');
    var feasible = mid.window_days > 0 && reasons.indexOf('route_too_slow') < 0 && reasons.indexOf('no_window_lo') < 0;
    if (mid.p_detect < 0.5 && mid.window_days > 0) reasons.push('low_detection');
    if (mid.net_eur_y > 0 && lo.net_eur_y < 0) reasons.push('pays_mid_not_lo');
    if (lo.net_eur_y > 0) reasons.push('pays_robust');
    if (hi.net_eur_y < 0) reasons.push('never_pays');
    var rtf = cs.units * cs.consequence_probability *
      (1 / cs.mtbf_y[1]) * (cs.corrective_cost_eur + cs.downtime_cost_eur_h * cs.mttr_h);
    return {
      option: op, case: cs,
      interval_days: I, recommended_interval_days: ch.recommended_days,
      readings_per_year: mid.readings_per_year,
      feasible: feasible, reasons: reasons,
      lo: lo, mid: mid, hi: hi,
      rtf_expected_cost_eur_y: rtf,
      timeline: timeline(cs, op, I)
    };
  }

  /* P–F timeline for the chart, day 0 = physical onset P0 of the mid P–F, F = pf_mid */
  function timeline(cs, op, I) {
    var pf = cs.pf_days[1], usable = op.pf_fraction * pf;
    var detect = pf - usable;                 /* technique threshold reached */
    var wEnd = pf - cs.response_days;         /* last useful detection */
    /* the span reaches one interval past P (up to 3 P–F) so a long route visibly misses the window */
    var span0 = -Math.min(pf * 0.25, Math.max(I, pf * 0.1)), span1 = Math.max(pf * 1.05, Math.min(3 * pf, detect + I));
    var ticks = [];
    if (op.mode === 'route') {
      var phase = detect + I / 2;             /* a representative phase: mid-interval */
      var t = phase; while (t - I >= span0) t -= I;
      for (var n = 0; t <= span1 && n < 400; n++, t += I) ticks.push({ t: t, inWindow: t >= detect && t <= wEnd });
    }
    return {
      pf_days: pf, pf_lo: cs.pf_days[0], pf_hi: cs.pf_days[2],
      detect_day: detect, window_start: detect, window_end: wEnd, failure_day: pf,
      response_days: cs.response_days, interval_days: I, mode: op.mode,
      span: [span0, span1], ticks: ticks
    };
  }

  /* compare(case, options) -> ranked; recommendation code */
  function compare(caseIn, options) {
    var rows = (options || []).map(function (o) { return evaluate(caseIn, o); });
    var order = rows.slice().sort(function (a, b) {
      if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
      return b.mid.net_eur_y - a.mid.net_eur_y;
    });
    var best = order[0] || null, cs = normCase(caseIn);
    var rec;
    if (best && best.feasible && best.mid.net_eur_y > 0) rec = { code: 'monitor', option: best.option.id };
    else if (cs.safety) rec = { code: 'safety_no_cbm', option: best && best.feasible ? best.option.id : null };
    else rec = { code: 'run_to_failure', option: null };
    if (rec.code === 'monitor' && best.lo.net_eur_y < 0) rec.fragile = true;
    return { rows: rows, ranked: order.map(function (r) { return r.option.id; }), best: best, recommendation: rec };
  }

  /* tornado on the net benefit of one option */
  var TORNADO_PARAMS = ['pf_days', 'mtbf_y', 'cost', 'pod', 'downtime_cost_eur_h', 'mttr_h', 'response_days'];
  function tornado(caseIn, optionIn) {
    var base = evaluate(caseIn, optionIn);
    var cs = base.case, op = base.option, I = base.interval_days;
    function run(mod) {
      var c2 = JSON.parse(JSON.stringify(cs)), o2 = JSON.parse(JSON.stringify(op));
      o2.looks_cap = op.looks_cap;
      var pf = cs.pf_days[1], mtbf = cs.mtbf_y[1], cpr = op.cost_per_reading_eur[1], fx = op.fixed_eur_y[1];
      var r = mod(c2, o2, { pf: pf, mtbf: mtbf, cpr: cpr, fx: fx });
      return point(c2, o2, r.pf, r.mtbf, r.cpr, r.fx, I).net_eur_y;
    }
    var id = function (c, o, v) { return v; };
    var out = [];
    function add(param, lowLabel, highLabel, modLo, modHi) {
      var a = run(modLo), b = run(modHi);
      out.push({ param: param, low: lowLabel, high: highLabel, net_low: a, net_high: b,
                 swing: Math.abs(b - a) });
    }
    add('pf_days', cs.pf_days[0], cs.pf_days[2],
      function (c, o, v) { v.pf = cs.pf_days[0]; return v; }, function (c, o, v) { v.pf = cs.pf_days[2]; return v; });
    add('mtbf_y', cs.mtbf_y[2], cs.mtbf_y[0],
      function (c, o, v) { v.mtbf = cs.mtbf_y[2]; return v; }, function (c, o, v) { v.mtbf = cs.mtbf_y[0]; return v; });
    if (op.mode === 'route')
      add('cost', op.cost_per_reading_eur[2], op.cost_per_reading_eur[0],
        function (c, o, v) { v.cpr = op.cost_per_reading_eur[2]; return v; }, function (c, o, v) { v.cpr = op.cost_per_reading_eur[0]; return v; });
    else
      add('cost', op.fixed_eur_y[2], op.fixed_eur_y[0],
        function (c, o, v) { v.fx = op.fixed_eur_y[2]; return v; }, function (c, o, v) { v.fx = op.fixed_eur_y[0]; return v; });
    var podLo = clamp(op.pod - 0.15, 0.05, 1), podHi = clamp(op.pod + 0.1, 0.05, 1);
    add('pod', podLo, podHi,
      function (c, o, v) { o.pod = podLo; return v; }, function (c, o, v) { o.pod = podHi; return v; });
    add('downtime_cost_eur_h', cs.downtime_cost_eur_h * 0.5, cs.downtime_cost_eur_h * 2,
      function (c, o, v) { c.downtime_cost_eur_h *= 0.5; return v; }, function (c, o, v) { c.downtime_cost_eur_h *= 2; return v; });
    add('mttr_h', cs.mttr_h * 0.5, cs.mttr_h * 2,
      function (c, o, v) { c.mttr_h *= 0.5; return v; }, function (c, o, v) { c.mttr_h *= 2; return v; });
    add('response_days', cs.response_days * 2, cs.response_days * 0.5,
      function (c, o, v) { c.response_days *= 2; return v; }, function (c, o, v) { c.response_days *= 0.5; return v; });
    void id;
    out.sort(function (a, b) { return b.swing - a.swing; });
    return { base: base.mid.net_eur_y, bars: out };
  }

  /* net benefit against downtime cost, for the break-even curve */
  function netVsDowntime(caseIn, optionIn, dMax, n) {
    var base = evaluate(caseIn, optionIn), cs = base.case, op = base.option, I = base.interval_days;
    n = n || 40; dMax = dMax > 0 ? dMax : Math.max(100, 3 * (base.mid.breakeven_downtime_eur_h || cs.downtime_cost_eur_h || 100));
    var out = [];
    for (var i = 0; i <= n; i++) {
      var D = dMax * i / n;
      out.push({ d: D,
        lo: point(cs, op, cs.pf_days[0], cs.mtbf_y[2], op.cost_per_reading_eur[2], op.fixed_eur_y[2], I, D).net_eur_y,
        mid: point(cs, op, cs.pf_days[1], cs.mtbf_y[1], op.cost_per_reading_eur[1], op.fixed_eur_y[1], I, D).net_eur_y,
        hi: point(cs, op, cs.pf_days[2], cs.mtbf_y[0], op.cost_per_reading_eur[0], op.fixed_eur_y[0], I, D).net_eur_y });
    }
    return out;
  }

  /* interval sweep for a route option: P(det) and net (mid) against the interval */
  function intervalSweep(caseIn, optionIn, days) {
    return (days || [7, 14, 30, 61, 91, 182, 365]).map(function (d) {
      var o = JSON.parse(JSON.stringify(optionIn || {})); o.interval_days = d; o.mode = 'route';
      var r = evaluate(caseIn, o);
      return { interval_days: d, p_detect: r.mid.p_detect, net_eur_y: r.mid.net_eur_y, cost_eur_y: r.mid.cost_eur_y };
    });
  }

  /* serialisable payload for modules.mepmonitoring.results[assetId] */
  function toModuleResult(cmp, meta) {
    meta = meta || {};
    var b = cmp.best;
    return {
      fm_id: meta.fm_id || null, technique: b ? b.option.technique : null, mode: b ? b.option.mode : null,
      recommendation: cmp.recommendation.code, fragile: !!cmp.recommendation.fragile,
      interval_days: b ? b.interval_days : null, readings_per_year: b ? b.readings_per_year : null,
      p_detect: b ? b.mid.p_detect : null,
      net_eur_y: b ? { lo: b.lo.net_eur_y, mid: b.mid.net_eur_y, hi: b.hi.net_eur_y } : null,
      breakeven_downtime_eur_h: b ? b.mid.breakeven_downtime_eur_h : null,
      options: cmp.rows.map(function (r) {
        return { id: r.option.id, technique: r.option.technique, mode: r.option.mode, interval_days: r.interval_days,
                 feasible: r.feasible, p_detect: r.mid.p_detect, net_mid_eur_y: r.mid.net_eur_y };
      })
    };
  }

  /* --- presets (learning assumptions; see the notes in the page) ---------------------------- */
  var PRESETS = [
    { id: 'pump_vibration', asset_class: 'pump', fm_id: 'bearing_wear', site: 'datacentre_8',
      case: { pf_days: [7, 14, 28], mtbf_y: [3, 6, 10], response_days: 2, corrective_cost_eur: 9000,
              planned_repair_cost_eur: 2500, downtime_cost_eur_h: 300, mttr_h: 24, planned_downtime_h: 4,
              consequence_probability: 1, units: 1, false_alarms_y: 0.2, false_alarm_cost_eur: 150, safety: false },
      options: [
        { id: 'vib_route_m', technique: 'vibration', mode: 'route', interval_days: 30, pod: 0.9, pf_fraction: 0.8, cost_per_reading_eur: [25, 40, 70] },
        { id: 'vib_route_w', technique: 'vibration', mode: 'route', interval_days: 7, pod: 0.9, pf_fraction: 0.8, cost_per_reading_eur: [25, 40, 70] },
        { id: 'vib_online', technique: 'vibration', mode: 'online', pod: 0.9, pf_fraction: 0.8, fixed_eur_y: [600, 1000, 1600] },
        { id: 'us_route_m', technique: 'ultrasound_airborne', mode: 'route', interval_days: 30, pod: 0.75, pf_fraction: 0.85, cost_per_reading_eur: [10, 20, 40] }
      ] },
    { id: 'lv_thermography', asset_class: 'lv_switchboard', fm_id: 'connection_overheat', site: 'office_12',
      case: { pf_days: [30, 120, 365], mtbf_y: [15, 40, 80], response_days: 7, corrective_cost_eur: 25000,
              planned_repair_cost_eur: 800, downtime_cost_eur_h: 200, mttr_h: 48, planned_downtime_h: 0,
              consequence_probability: 1, units: 1, false_alarms_y: 0, false_alarm_cost_eur: 0, safety: false },
      options: [
        { id: 'ir_annual', technique: 'ir_thermography', mode: 'route', interval_days: 365, pod: 0.95, pf_fraction: 0.7, cost_per_reading_eur: [250, 400, 700] },
        { id: 'ir_6m', technique: 'ir_thermography', mode: 'route', interval_days: 182, pod: 0.95, pf_fraction: 0.7, cost_per_reading_eur: [250, 400, 700] },
        { id: 'ir_online', technique: 'ir_thermography', mode: 'online', pod: 0.85, pf_fraction: 0.6, fixed_eur_y: [900, 1500, 2500] }
      ] },
    { id: 'ahu_dp_bms', asset_class: 'ahu', fm_id: 'filter_blinding', site: 'office_12',
      case: { pf_days: [20, 45, 90], mtbf_y: [0.5, 1, 2], response_days: 3, corrective_cost_eur: 600,
              planned_repair_cost_eur: 350, downtime_cost_eur_h: 50, mttr_h: 4, planned_downtime_h: 1,
              consequence_probability: 1, units: 1, false_alarms_y: 0.5, false_alarm_cost_eur: 40, safety: false },
      options: [
        { id: 'dp_bms', technique: 'dp_trend', mode: 'bms', pod: 0.95, pf_fraction: 0.9, fixed_eur_y: [0, 30, 100] },
        { id: 'dp_gauge_m', technique: 'dp_trend', mode: 'route', interval_days: 30, pod: 0.9, pf_fraction: 0.9, cost_per_reading_eur: [10, 15, 25] }
      ] },
    { id: 'ups_battery', asset_class: 'ups', fm_id: 'battery_capacity_loss', site: 'datacentre_8',
      case: { pf_days: [60, 120, 240], mtbf_y: [3, 5, 8], response_days: 14, corrective_cost_eur: 6000,
              planned_repair_cost_eur: 5000, downtime_cost_eur_h: 20000, mttr_h: 4, planned_downtime_h: 0,
              consequence_probability: 0.3, units: 1, false_alarms_y: 0.1, false_alarm_cost_eur: 300, safety: false },
      options: [
        { id: 'discharge_annual', technique: 'performance_test', mode: 'route', interval_days: 365, pod: 0.98, pf_fraction: 1.0, cost_per_reading_eur: [1500, 2500, 4000] },
        { id: 'impedance_q', technique: 'battery_impedance', mode: 'route', interval_days: 91, pod: 0.8, pf_fraction: 0.8, cost_per_reading_eur: [150, 250, 400] },
        { id: 'impedance_online', technique: 'battery_impedance', mode: 'online', pod: 0.8, pf_fraction: 0.8, fixed_eur_y: [800, 1200, 2000] }
      ] },
    { id: 'chiller_oil', asset_class: 'chiller_water', fm_id: 'compressor_bearing', site: 'hospital_wing_10',
      case: { pf_days: [90, 180, 365], mtbf_y: [8, 15, 25], response_days: 14, corrective_cost_eur: 40000,
              planned_repair_cost_eur: 8000, downtime_cost_eur_h: 150, mttr_h: 336, planned_downtime_h: 24,
              consequence_probability: 1, units: 1, false_alarms_y: 0.2, false_alarm_cost_eur: 200, safety: false },
      options: [
        { id: 'oil_annual', technique: 'oil_analysis', mode: 'route', interval_days: 365, pod: 0.7, pf_fraction: 0.7, cost_per_reading_eur: [40, 70, 120] },
        { id: 'oil_q', technique: 'oil_analysis', mode: 'route', interval_days: 91, pod: 0.7, pf_fraction: 0.7, cost_per_reading_eur: [40, 70, 120] },
        { id: 'vib_q', technique: 'vibration', mode: 'route', interval_days: 91, pod: 0.9, pf_fraction: 0.5, cost_per_reading_eur: [25, 40, 70] }
      ] },
    { id: 'fcu_rtf', asset_class: 'fcu', fm_id: 'fan_bearing', site: 'office_12',
      case: { pf_days: [7, 21, 45], mtbf_y: [8, 12, 20], response_days: 7, corrective_cost_eur: 450,
              planned_repair_cost_eur: 300, downtime_cost_eur_h: 20, mttr_h: 4, planned_downtime_h: 2,
              consequence_probability: 1, units: 1, false_alarms_y: 0, false_alarm_cost_eur: 0, safety: false },
      options: [
        { id: 'us_q', technique: 'ultrasound_airborne', mode: 'route', interval_days: 91, pod: 0.7, pf_fraction: 0.7, cost_per_reading_eur: [8, 12, 20] },
        { id: 'vib_online_fcu', technique: 'vibration', mode: 'online', pod: 0.85, pf_fraction: 0.8, fixed_eur_y: [60, 120, 250] }
      ] }
  ];

  return {
    VERSION: VERSION, MODES: MODES, TECH_FALLBACK: TECH_FALLBACK, PRESETS: PRESETS,
    TORNADO_PARAMS: TORNADO_PARAMS,
    pDetect: pDetect, recommendInterval: recommendInterval,
    normCase: normCase, normOption: normOption,
    evaluate: evaluate, compare: compare, tornado: tornado,
    netVsDowntime: netVsDowntime, intervalSweep: intervalSweep, toModuleResult: toModuleResult
  };
});
