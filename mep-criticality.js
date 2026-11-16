/* mep-criticality.js — MEP asset criticality engine (MEPCrit), tools.petrov.re mep-maintenance package.
   Pure functions, no DOM, deterministic. UMD: global MEPCrit in the browser, module.exports in node.

   Method (ordinal screening, after the risk-based maintenance practice of the NASA RCM Guide 2008 §3
   and ISO 55000-family criticality ranking; every threshold below is a stated learning assumption,
   editable through opts where marked):
     consequence C = max(safety, environment, service, financial), each 1..5
     likelihood  L = ordinal 1..5 from condition grade, failures in 3 years and age / economic life;
                     age can raise L by at most one step above the condition/history evidence
                     ("age alone never decides"); a hidden (standby/protective) function that has not
                     been proof-tested within 12 months has L >= 3 whatever its status lamp says
     priority    P = C × L, an ORDINAL number 1..25 — never a probability
     class       A if P >= 15, or safety/environment >= 4, or (C = 5 and L >= 2)
                 B if P >= 8, or C >= 4
                 C otherwise
   Redundancy (D-MEP-4): credited ONLY if declared (N+1 / 2N), the standby was tested within 12 months
   and no common cause (feeder, header, controller) is shared with the duty unit. A credit lowers the
   service score (N+1 one step, 2N two steps) and nothing else (D-MEP-7): the financial event cost keeps
   the outage, because the standby can fail too; safety and environment are never reduced by redundancy.
   The credit rule is shared by the package (D-MEP-10): MEPCore.creditedRedundancy(asset, register) when
   mep-core provides it, otherwise the identical local rule (creditedRedundancy below).
   Statutory duties are flagged irrespective of class (D-MEP-5). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MEPCrit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var VERSION = 'mepcriticality-1.1';
  var TEST_WINDOW_MONTHS = 12;            /* D-MEP-4, fixed */
  var SERVES = ['office', 'server_room', 'lab', 'healthcare', 'production', 'residential', 'retail', 'education', 'common'];
  var REDUNDANCY = ['none', 'N+1', '2N'];
  var EVIDENCE = ['measured', 'documented', 'assumed', 'unknown'];

  /* importance of the served function for the SERVICE score (learning assumption, editable: opts.importance) */
  var IMPORTANCE = { server_room: 5, healthcare: 5, lab: 4, production: 4, retail: 3, residential: 3, office: 2, education: 2, common: 1 };
  /* typical tolerable downtime of the served function, hours (learning assumption; shown as "typical", never stored) */
  var TOLERABLE_TYPICAL_H = { server_room: 0.25, healthcare: 0.5, lab: 4, production: 2, retail: 4, residential: 12, office: 24, education: 24, common: 72 };
  /* financial event-cost bands, EUR per failure event -> score 2..5 above each bound (learning assumption, opts.financial_bands) */
  var FIN_BANDS = [1000, 10000, 50000, 250000];
  /* corrective repair cost as a share of replacement cost when nothing better is known (learning assumption, opts.repair_share) */
  var REPAIR_SHARE = 0.15;

  /* Consequence profile per equipment class. safety: base and per-served-function values (1..5);
     scope: 'plant' (whole system) 0, 'zone' -1, 'local' -2 on the service score; hidden: the function is
     standby/protective, its failure is not evident until demand; service_fixed: service score that does
     not depend on the served function (life-safety systems); env: environment base (refrigerant adds). */
  var PROFILE = {
    ahu:               { safety: 1, safety_by: { healthcare: 4, lab: 3 }, env: 1, scope: 'plant' },
    fan:               { safety: 1, safety_by: { healthcare: 3, lab: 4 }, env: 1, scope: 'plant' },
    pump:              { safety: 1, safety_by: { healthcare: 2 }, env: 1, scope: 'plant' },
    chiller_air:       { safety: 1, safety_by: { healthcare: 3 }, env: 1, scope: 'plant', refrigerant: true },
    chiller_water:     { safety: 1, safety_by: { healthcare: 3 }, env: 1, scope: 'plant', refrigerant: true },
    cooling_tower:     { safety: 4, env: 2, scope: 'plant' },
    boiler_gas:        { safety: 3, env: 1, scope: 'plant' },
    heat_pump:         { safety: 1, safety_by: { healthcare: 3 }, env: 1, scope: 'plant', refrigerant: true },
    vrf:               { safety: 1, env: 1, scope: 'zone', refrigerant: true },
    fcu:               { safety: 1, env: 1, scope: 'local' },
    dhw_calorifier:    { safety: 4, env: 1, scope: 'plant' },
    water_booster:     { safety: 2, safety_by: { healthcare: 3 }, env: 1, scope: 'plant' },
    sprinkler_pump:    { safety: 5, env: 1, scope: 'plant', hidden: true, service_fixed: 2 },
    fire_alarm:        { safety: 5, env: 1, scope: 'plant', hidden: true, service_fixed: 2 },
    emergency_lighting:{ safety: 4, env: 1, scope: 'plant', hidden: true, service_fixed: 1 },
    ups:               { safety: 1, safety_by: { healthcare: 5 }, env: 1, scope: 'plant', hidden: true },
    generator:         { safety: 2, safety_by: { healthcare: 5 }, env: 2, scope: 'plant', hidden: true },
    lv_switchboard:    { safety: 3, env: 1, scope: 'plant' },
    transformer:       { safety: 3, env: 2, scope: 'plant' },
    bms_controller:    { safety: 1, env: 1, scope: 'zone' },
    lift:              { safety: 3, safety_by: { healthcare: 4 }, env: 1, scope: 'plant' }
  };
  var GENERIC = { safety: 1, env: 1, scope: 'plant' };
  var SCOPE_MOD = { plant: 0, zone: -1, local: -2 };

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function coreOf(opts) { return (opts && opts.core) || (root && root.MEPCore) || null; }
  function classDef(cls, opts) { var c = coreOf(opts); return (c && c.CLASSES && c.CLASSES[cls]) || (opts && opts.classes && opts.classes[cls]) || null; }
  function profile(cls) { return PROFILE[cls] || GENERIC; }
  function typical(cls, field, opts) {
    var d = classDef(cls, opts); var t = d && d.typical && d.typical[field];
    return (Array.isArray(t) && t.length === 3 && t.every(function (x) { return num(x) !== null; })) ? t.slice() : null;
  }

  /* resolve a nullable asset field: user value, else class typical (lo/mid/hi), else learning assumption, else unknown */
  function resolveField(asset, field, opts) {
    var v = num(asset[field]);
    if (v !== null) return { value: v, lo: v, hi: v, source: 'user' };
    var map = { mttr_h: 'mttr_h', lead_time_days: 'lead_time_days', replacement_cost_eur: 'replacement_cost_eur' };
    if (map[field]) { var t = typical(asset['class'], map[field], opts); if (t) return { value: t[1], lo: t[0], hi: t[2], source: 'class_typical' }; }
    if (field === 'tolerable_downtime_h' && TOLERABLE_TYPICAL_H[asset.serves] != null) {
      var m = TOLERABLE_TYPICAL_H[asset.serves];
      return { value: m, lo: m * 4, hi: m / 4, source: 'learning_assumption' };   /* lo = optimistic (longer tolerance) */
    }
    return { value: null, lo: null, hi: null, source: 'unknown' };
  }
  /* QA-19: the register's own economic life (number or [lo,mid,hi]) first, then the class typical */
  function economicLifeOf(asset, opts) {
    var v = asset.economic_life_y;
    if (num(v) !== null && v > 0) return { value: v, source: 'user' };
    if (Array.isArray(v) && v.length === 3 && num(v[1]) !== null && v[1] > 0) return { value: v[1], source: 'user' };
    var t = typical(asset['class'], 'economic_life_y', opts);
    return t ? { value: t[1], source: 'class_typical' } : { value: null, source: 'unknown' };
  }
  function economicLife(asset, opts) { return economicLifeOf(asset, opts).value; }

  /* ---- likelihood: ordinal 1..5 ---- */
  function lFromCondition(c) { return c === null ? null : clamp(Math.round(c), 1, 5); }
  function lFromFailures(f) { if (f === null) return null; return f <= 0 ? 1 : f === 1 ? 2 : f === 2 ? 3 : f <= 4 ? 4 : 5; }
  function lFromAge(ratio) { if (ratio === null) return null; return ratio < 0.5 ? 1 : ratio < 0.8 ? 2 : ratio < 1.0 ? 3 : ratio < 1.3 ? 4 : 5; }
  function likelihoodOf(asset, opts, reasons, variant) {
    var year = num(opts && opts.year) || new Date().getFullYear();
    var cond = num(asset.condition), fails = num(asset.failures_3y), iy = num(asset.install_year), life = economicLife(asset, opts);
    var Lc = lFromCondition(cond), Lf = lFromFailures(fails);
    var ratio = (iy !== null && life) ? Math.max(0, year - iy) / life : null, La = lFromAge(ratio);
    /* unknown evidence: optimistic / middle / pessimistic reading, so the class range shows what an unknown can do */
    if (Lc === null) { Lc = variant === 'hi' ? 4 : variant === 'lo' ? 2 : 3; reasons && reasons.push('condition_unknown'); }
    if (Lf === null) { Lf = variant === 'hi' ? 3 : variant === 'lo' ? 1 : 2; reasons && reasons.push('failures_unknown'); }
    var ev = Math.max(Lc, Lf), L = ev;
    if (La !== null && La > ev) { L = Math.min(La, ev + 1); reasons && reasons.push(La > ev + 1 ? 'age_capped' : 'age_raises'); }
    if (La === null) reasons && reasons.push('age_unknown');
    var p = profile(asset['class']), tm = num(asset.reserve_tested_months);
    if (p.hidden && (tm === null || tm > TEST_WINDOW_MONTHS) && L < 3) { L = 3; reasons && reasons.push('hidden_function_untested'); }
    return { L: L, parts: { condition: Lc, failures: Lf, age: La, age_ratio: ratio, economic_life_y: life, economic_life_source: economicLifeOf(asset, opts).source } };
  }

  /* ---- redundancy credit (D-MEP-4) ---- */
  /* common_cause holds dependency tags (feeder, header, controller). In a register the cause is common only when
     the standby (a same-class, same-function peer) carries the same tag; without a known peer every tag counts. */
  function sharedTags(asset, peerTags) {
    var cc = Array.isArray(asset.common_cause) ? asset.common_cause.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean) : [];
    if (!Array.isArray(peerTags)) return cc;
    return cc.filter(function (t) { return peerTags.indexOf(t) >= 0; });
  }
  function redundancyCredit(asset, reasons, peerTags, ext) {
    var red = REDUNDANCY.indexOf(asset.redundancy) >= 0 ? asset.redundancy : 'none';
    if (red === 'none') return { credited: false, steps: 0, why: [] };
    var why = [], tm = num(asset.reserve_tested_months), cc = sharedTags(asset, peerTags);
    if (tm === null) why.push('reserve_test_unknown');
    else if (tm > TEST_WINDOW_MONTHS) why.push('reserve_test_stale');
    if (cc.length) why.push('common_cause');
    /* D-MEP-10: the package rule from mep-core decides when present; the local reasons explain it */
    if (ext && typeof ext.credited === 'boolean') {
      if (ext.credited) why = [];
      else if (!why.length) why.push(Array.isArray(ext.shared_tags) && ext.shared_tags.length ? 'common_cause' : 'redundancy_rule_core');
    }
    why.forEach(function (w) { reasons.push(w); });
    if (why.length) { reasons.push('redundancy_not_credited'); return { credited: false, steps: 0, why: why }; }
    reasons.push('redundancy_credited');
    return { credited: true, steps: red === '2N' ? 2 : 1, why: [] };
  }

  function finScore(eur, bands) { var s = 1; for (var i = 0; i < bands.length; i++) if (eur >= bands[i]) s = i + 2; return s; }
  function envScore(asset, p) {
    var e = p.env || 1, q = num(asset.refrigerant_charge_t_co2e);
    if (p.refrigerant && q !== null) e = Math.max(e, q >= 500 ? 4 : q >= 50 ? 3 : q >= 5 ? 2 : 1);
    return e;
  }
  function classOf(C, L, S, E) {
    var P = C * L;
    if (P >= 15 || Math.max(S, E) >= 4 || (C === 5 && L >= 2)) return 'A';
    if (P >= 8 || C >= 4) return 'B';
    return 'C';
  }

  /* ---- one asset, one variant (base / optimistic / pessimistic treatment of unknowns) ---- */
  function core(asset, opts, variant, reasons) {
    opts = opts || {};
    var p = profile(asset['class']), serves = IMPORTANCE[asset.serves] != null ? asset.serves : 'common';
    var imp = Object.assign({}, IMPORTANCE, opts.importance || {});
    var bands = Array.isArray(opts.financial_bands) && opts.financial_bands.length === 4 ? opts.financial_bands : FIN_BANDS;
    var rshare = num(opts.repair_share) !== null ? opts.repair_share : REPAIR_SHARE;
    function pickV(r) { return variant === 'lo' ? r.lo : variant === 'hi' ? r.hi : r.value; }
    var mttr = resolveField(asset, 'mttr_h', opts), tol = resolveField(asset, 'tolerable_downtime_h', opts),
        lead = resolveField(asset, 'lead_time_days', opts), repl = resolveField(asset, 'replacement_cost_eur', opts);
    var mttrV = pickV(mttr), tolV = pickV(tol), leadV = pickV(lead), replV = pickV(repl);
    var dc = num(asset.downtime_cost_eur_h);
    /* safety and environment — never touched by redundancy */
    var S = (p.safety_by && p.safety_by[serves] != null) ? p.safety_by[serves] : p.safety;
    var E = envScore(asset, p);
    /* service: importance of the function, scope of the equipment, recovery against tolerance */
    /* tolerable 0 = no interruption is acceptable (life-safety duty): any repair time exceeds it */
    var ratio = (mttrV !== null && tolV !== null) ? (tolV > 0 ? mttrV / tolV : (mttrV > 0 ? Infinity : 0)) : null, Sv;
    if (p.service_fixed != null) Sv = p.service_fixed;
    else {
      Sv = imp[serves] + (SCOPE_MOD[p.scope] || 0);
      if (ratio === null) { if (reasons) reasons.push('recovery_unknown'); if (variant === 'hi') Sv += 1; }
      else if (ratio <= 0.5) { Sv -= 1; if (reasons) reasons.push('recovery_within_half_tolerance'); }
      else if (ratio > 1) { Sv += 1; if (reasons) reasons.push('recovery_exceeds_tolerance'); }
      Sv = clamp(Sv, 1, 5);
    }
    var rr = opts.no_credit ? { credited: false, steps: 0, why: [] } : redundancyCredit(asset, reasons || [], opts.peer_tags, opts.credit_ext);
    var SvBefore = Sv;
    if (rr.credited) Sv = clamp(Sv - rr.steps, 1, 5);
    /* financial: one failure event = downtime × outage + corrective repair; the outage stays even with a
       credited standby (D-MEP-7: the standby can fail too, redundancy credits the service score only) */
    var outage = mttrV !== null ? mttrV : 0;
    var down = dc !== null ? dc * outage : 0, repair = replV !== null ? rshare * replV : 0;
    if (dc === null && reasons) reasons.push('downtime_cost_unknown');
    var eventCost = down + repair, F = finScore(eventCost, bands);
    var scores = { safety: S, environment: E, service: Sv, financial: F };
    var ov = opts.override || {};
    ['safety', 'environment', 'service', 'financial'].forEach(function (k) {
      var v = num(ov[k]);
      if (v !== null && v >= 1 && v <= 5 && Math.round(v) === v && v !== scores[k]) {
        if (reasons) { reasons.push('override_' + k); if (v < scores[k] && (k === 'safety' || k === 'environment')) reasons.push('override_lowers_' + k); }
        scores[k] = v;
      }
    });
    var lk = likelihoodOf(asset, opts, reasons, variant);
    var C = Math.max(scores.safety, scores.environment, scores.service, scores.financial), L = lk.L;
    var replExposure = (leadV !== null) ? leadV * 24 + (mttrV || 0) : null;
    if (reasons && replExposure !== null && tolV !== null && replExposure > tolV && !rr.credited) reasons.push('replacement_lead_exceeds_tolerance');
    var lead_driver = ['safety', 'environment', 'service', 'financial'].filter(function (k) { return scores[k] === C; });
    /* D-crit-9: a credited standby buys time, it does not make a critical function non-critical —
       the credit lowers the class by one letter at most */
    var cls = classOf(C, L, scores.safety, scores.environment), capped = false;
    if (rr.credited) {
      var un = core(asset, Object.assign({}, opts, { no_credit: true }), variant, null).cls;
      if (CLASS_RANK[un] - CLASS_RANK[cls] > 1) { cls = un === 'A' ? 'B' : 'C'; capped = true; if (reasons) reasons.push('credit_capped_one_class'); }
    }
    return { scores: scores, service_before_credit: SvBefore, C: C, L: L, P: C * L, cls: cls, credit_capped: capped,
             credit: rr, recovery_h: mttrV, tolerable_h: tolV, recovery_ratio: ratio, event_cost_eur: eventCost,
             event_parts: { downtime_eur: down, repair_eur: repair }, replacement_exposure_h: replExposure,
             likelihood_parts: lk.parts, drivers: lead_driver,
             resolved: { mttr_h: mttr, tolerable_downtime_h: tol, lead_time_days: lead, replacement_cost_eur: repl } };
  }

  /* ---- statutory flags (from MEPCore.STATUTORY when present) ---- */
  function statutoryOf(asset, opts) {
    var c = coreOf(opts), out = [];
    var list = (c && c.STATUTORY) || (opts && opts.statutory) || null;
    if (!list) return out;
    var arr = Array.isArray(list) ? list : Object.keys(list).map(function (k) { return list[k]; });
    arr.forEach(function (s) { try { if (s && typeof s.applies === 'function' && s.applies(asset)) out.push(s.id); } catch (e) { /* a broken rule never hides the asset */ } });
    return out;
  }

  /* ---- flips: the nearest single change that moves the class ---- */
  var FLIP_SCANS = {
    condition: [1, 2, 3, 4, 5],
    failures_3y: [0, 1, 2, 3, 4, 5, 6],
    reserve_tested_months: [6, 24],
    tolerable_downtime_h: [0.25, 0.5, 1, 2, 4, 8, 12, 24, 48, 72, 168],
    mttr_h: [1, 2, 4, 8, 12, 24, 48, 96, 168],
    downtime_cost_eur_h: [0, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000]
  };
  var CLASS_RANK = { A: 3, B: 2, C: 1 };
  function flipsOf(asset, opts, base) {
    var out = [], p = profile(asset['class']);
    function test(param, value, patch) {
      var a = Object.assign({}, asset, patch);
      var r = core(a, opts, 'mid', null);
      if (r.cls !== base.cls) return { param: param, value: value, newClass: r.cls, newPriority: r.P, newConsequence: r.C, newLikelihood: r.L, direction: CLASS_RANK[r.cls] > CLASS_RANK[base.cls] ? 'up' : 'down' };
      return null;
    }
    Object.keys(FLIP_SCANS).forEach(function (param) {
      if (param === 'reserve_tested_months' && asset.redundancy === 'none' && !p.hidden) return;
      var cur = param === 'tolerable_downtime_h' || param === 'mttr_h' ? base.resolvedValue[param] : num(asset[param]);
      var vals = FLIP_SCANS[param].filter(function (v) { return v !== cur; });
      /* nearest first: by |log ratio| for positive scales, by |difference| otherwise */
      vals.sort(function (x, y) {
        function d(v) { if (cur === null) return Math.abs(v); if (cur > 0 && v > 0 && param !== 'condition' && param !== 'failures_3y') return Math.abs(Math.log(v / cur)); return Math.abs(v - cur); }
        return d(x) - d(y) || x - y;
      });
      for (var i = 0; i < vals.length; i++) {
        var patch = {}; patch[param] = vals[i];
        var f = test(param, vals[i], patch);
        if (f) { f.from = cur; out.push(f); break; }
      }
    });
    if (Array.isArray(asset.common_cause) && asset.common_cause.length) { var f1 = test('common_cause', [], { common_cause: [] }); if (f1) { f1.from = asset.common_cause.slice(); out.push(f1); } }
    if (asset.redundancy === 'none' && p.service_fixed == null) {
      var f2 = test('redundancy', 'N+1', { redundancy: 'N+1', reserve_tested_months: 6, common_cause: [] });
      if (f2) { f2.from = 'none'; f2.bundle = ['reserve_tested_months=6', 'common_cause=[]']; out.push(f2); }
    } else if (asset.redundancy !== 'none') {
      var f3 = test('redundancy', 'none', { redundancy: 'none' }); if (f3) { f3.from = asset.redundancy; out.push(f3); }
    }
    return out;
  }

  /* ---- public: assess one asset ---- */
  function assess(asset, opts) {
    opts = opts || {};
    if (!asset || typeof asset !== 'object') return { valid: false, errors: ['asset'] };
    var errors = [];
    if (opts.validate !== false) {
      if (asset.redundancy != null && REDUNDANCY.indexOf(asset.redundancy) < 0) errors.push('redundancy');
      if (asset.evidence != null && EVIDENCE.indexOf(asset.evidence) < 0) errors.push('evidence');
      ['condition'].forEach(function (k) { var v = asset[k]; if (v != null && !(num(v) !== null && v >= 1 && v <= 5)) errors.push(k); });
      ['failures_3y', 'mttr_h', 'tolerable_downtime_h', 'downtime_cost_eur_h', 'lead_time_days', 'replacement_cost_eur', 'reserve_tested_months', 'refrigerant_charge_t_co2e']
        .forEach(function (k) { var v = asset[k]; if (v != null && !(num(v) !== null && v >= 0)) errors.push(k); });
    }
    if (errors.length) return { valid: false, id: asset.id, errors: errors };
    var reasons = [];
    var a = Object.assign({ redundancy: 'none', common_cause: [], evidence: 'unknown' }, asset);
    if (!PROFILE[a['class']]) reasons.push('class_unknown_generic_profile');
    var b = core(a, opts, 'mid', reasons);
    var lo = core(a, opts, 'lo', null), hi = core(a, opts, 'hi', null);
    if (a.evidence === 'assumed' || a.evidence === 'unknown') reasons.push('evidence_review');
    var stat = statutoryOf(a, opts);
    if (stat.length) reasons.push('statutory_retained');
    var uniq = []; reasons.forEach(function (r) { if (uniq.indexOf(r) < 0) uniq.push(r); });
    b.resolvedValue = { tolerable_downtime_h: b.tolerable_h, mttr_h: b.recovery_h };
    var flips = opts.flips === false ? [] : flipsOf(a, opts, b);
    var classes = [lo.cls, b.cls, hi.cls].sort(function (x, y) { return CLASS_RANK[y] - CLASS_RANK[x]; });
    return {
      valid: true, id: a.id, model: VERSION, ordinal: true, probability: null,
      scores: b.scores, consequence: b.C, likelihood: b.L, priority: b.P, 'class': b.cls,
      drivers: b.drivers,
      credited_redundancy: b.credit.credited, credit_steps: b.credit.steps, credit_reasons: b.credit.credited ? ['tested_within_12_months', 'no_common_cause'] : b.credit.why,
      service_before_credit: b.service_before_credit,
      recovery_h: b.recovery_h, tolerable_h: b.tolerable_h, recovery_ratio: b.recovery_ratio,
      replacement_exposure_h: b.replacement_exposure_h,
      event_cost_eur: b.event_cost_eur, event_parts: b.event_parts,
      likelihood_parts: b.likelihood_parts,
      sources: { mttr_h: b.resolved.mttr_h.source, tolerable_downtime_h: b.resolved.tolerable_downtime_h.source,
                 lead_time_days: b.resolved.lead_time_days.source, replacement_cost_eur: b.resolved.replacement_cost_eur.source },
      class_range: { best: classes[2], worst: classes[0], best_priority: Math.min(lo.P, b.P, hi.P), worst_priority: Math.max(lo.P, b.P, hi.P) },
      statutory: stat, reasons: uniq, flips: flips
    };
  }

  /* ---- public: rank a register ---- */
  function rank(register, opts) {
    opts = opts || {};
    var assets = (register && Array.isArray(register.assets)) ? register.assets : [];
    var year = num(opts.year) || num(register && register.site && register.site.year) || new Date().getFullYear();
    var overrides = opts.overrides || {}, c = coreOf(opts);
    /* common-cause groups across the register: a tag shared by two or more assets */
    var tags = {};
    assets.forEach(function (a) { (Array.isArray(a.common_cause) ? a.common_cause : []).forEach(function (t) { t = String(t || '').trim(); if (!t) return; (tags[t] = tags[t] || []).push(a.id); }); });
    var groups = Object.keys(tags).sort().filter(function (t) { return tags[t].length >= 2; }).map(function (t) { return { tag: t, assets: tags[t].slice() }; });
    var rows = assets.map(function (a, i) {
      var peerAssets = assets.filter(function (b) { return b && b !== a && b.id !== a.id && b['class'] === a['class'] && b.serves === a.serves; });
      var redundant = a.redundancy && a.redundancy !== 'none';
      var peerTags = null;
      if (redundant && peerAssets.length) { peerTags = []; peerAssets.forEach(function (b) { (Array.isArray(b.common_cause) ? b.common_cause : []).forEach(function (t) { t = String(t == null ? '' : t).trim(); if (t && peerTags.indexOf(t) < 0) peerTags.push(t); }); }); }
      var ext = null;
      if (redundant && c && typeof c.creditedRedundancy === 'function') { try { ext = c.creditedRedundancy(a, register); } catch (e) { ext = null; } }
      var o = Object.assign({}, opts, { year: year, override: overrides[a.id] || null, peer_tags: peerTags, credit_ext: ext });
      var r = assess(a, o);
      if (r.valid) r.credit_rule = ext && typeof ext.credited === 'boolean' ? 'core' : 'local';
      r.index = i;
      if (r.valid) {
        if (redundant) {
          r.peers = peerAssets.map(function (b) { return b.id; });
          if (!r.peers.length) r.reasons.push('standby_not_in_register');
        }
        r.common_cause_groups = groups.filter(function (g) { return g.assets.indexOf(a.id) >= 0; }).map(function (g) { return g.tag; });
      }
      return r;
    });
    var valid = rows.filter(function (r) { return r.valid; });
    var order = valid.slice().sort(function (x, y) {
      return CLASS_RANK[y['class']] - CLASS_RANK[x['class']] || y.priority - x.priority || y.consequence - x.consequence || y.likelihood - x.likelihood || (x.index - y.index);
    });
    order.forEach(function (r, k) { r.rank = k + 1; });
    var counts = { A: 0, B: 0, C: 0 };
    valid.forEach(function (r) { counts[r['class']]++; });
    var uncertain = valid.filter(function (r) { return r.class_range.best !== r.class_range.worst; }).map(function (r) { return r.id; });
    var dupIds = []; var seen = {};
    assets.forEach(function (a) { if (seen[a.id]) dupIds.push(a.id); seen[a.id] = 1; });
    return { model: VERSION, year: year, rows: rows, order: order.map(function (r) { return r.index; }), counts: counts,
             invalid: rows.filter(function (r) { return !r.valid; }).map(function (r) { return { id: r.id, index: r.index, errors: r.errors }; }),
             common_cause_groups: groups, uncertain: uncertain, duplicate_ids: dupIds,
             statutory_assets: valid.filter(function (r) { return r.statutory.length; }).map(function (r) { return r.id; }) };
  }

  /* the package redundancy-credit rule (D-MEP-10) as a standalone function, the reference for
     MEPCore.creditedRedundancy: declared N+1/2N, standby tested within 12 months, and no shared common
     cause — a tag counts only if a same-class, same-serves peer carries it; with no peer in the register
     (or no register) every declared tag counts */
  function creditedRedundancy(asset, register) {
    if (!asset || typeof asset !== 'object') return { credited: false, reason: 'asset', shared_tags: [] };
    var red = REDUNDANCY.indexOf(asset.redundancy) >= 0 ? asset.redundancy : 'none';
    if (red === 'none') return { credited: false, reason: 'no_redundancy', shared_tags: [] };
    var assets = (register && Array.isArray(register.assets)) ? register.assets : [];
    var peers = assets.filter(function (b) { return b && b !== asset && b.id !== asset.id && b['class'] === asset['class'] && b.serves === asset.serves; });
    var peerTags = null;
    if (peers.length) { peerTags = []; peers.forEach(function (b) { (Array.isArray(b.common_cause) ? b.common_cause : []).forEach(function (t) { t = String(t == null ? '' : t).trim(); if (t && peerTags.indexOf(t) < 0) peerTags.push(t); }); }); }
    var tm = num(asset.reserve_tested_months), cc = sharedTags(asset, peerTags);
    if (tm === null) return { credited: false, reason: 'reserve_test_unknown', shared_tags: cc };
    if (tm > TEST_WINDOW_MONTHS) return { credited: false, reason: 'reserve_test_stale', shared_tags: cc };
    if (cc.length) return { credited: false, reason: 'common_cause', shared_tags: cc };
    return { credited: true, reason: 'tested_within_12_months_no_common_cause', shared_tags: [] };
  }

  /* results as stored in modules.mepcriticality.results (compact, serialisable) */
  function moduleResults(ranked) {
    var out = {};
    ranked.rows.forEach(function (r) {
      if (!r.valid) return;
      out[r.id] = { 'class': r['class'], priority: r.priority, consequence: r.consequence, likelihood: r.likelihood, scores: clone(r.scores),
                    credited_redundancy: r.credited_redundancy, class_range: clone(r.class_range), statutory: r.statutory.slice(), reasons: r.reasons.slice(), rank: r.rank };
    });
    return out;
  }
  function moduleSummary(ranked) {
    return { counts: clone(ranked.counts), assets: ranked.rows.length, uncertain: ranked.uncertain.length, common_cause_groups: ranked.common_cause_groups.length, model: VERSION };
  }

  return { version: VERSION, assess: assess, rank: rank, moduleResults: moduleResults, moduleSummary: moduleSummary, creditedRedundancy: creditedRedundancy,
           classOf: classOf, likelihoodOf: function (a, o) { return likelihoodOf(a, o || {}, null, 'mid'); },
           constants: { TEST_WINDOW_MONTHS: TEST_WINDOW_MONTHS, IMPORTANCE: IMPORTANCE, TOLERABLE_TYPICAL_H: TOLERABLE_TYPICAL_H, FIN_BANDS: FIN_BANDS,
                        REPAIR_SHARE: REPAIR_SHARE, PROFILE: PROFILE, SCOPE_MOD: SCOPE_MOD, SERVES: SERVES, REDUNDANCY: REDUNDANCY, EVIDENCE: EVIDENCE, FLIP_SCANS: FLIP_SCANS } };
});
