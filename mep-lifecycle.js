/* mep-lifecycle.js — MEPLife: fleet renewal planner of the MEP Maintenance package
   (tools.petrov.re, tool `meplifecycle`). Pure functions, no DOM, deterministic, UMD.

   Question: when should each asset be renewed, what does the 25-year capex profile look
   like, and what happens when the annual budget is capped?

   Method (METHOD.md in _mep/life has the full text):
   1. Effective age, not calendar age.  The condition grade (1 very good .. 5 very poor,
      MEPCore.CONDITION_SCALE) maps to a consumed-life fraction (COND_FRAC); repeated
      failures raise the grade used (failure floor).  Effective age = w·(fraction·L) +
      (1−w)·calendar age, w from the evidence quality.  Age alone never decides (D-MEP-8):
      without a condition grade the asset is "survey needed" — an indicative year and range from age,
      no money in the profile (unless a regulatory / support / decision date governs).
   2. Renewal trigger by criticality class: renew when effective age reaches L·TRIGGER[class]
      (A earlier, C later).  L = economic life (asset override or class library lo/mid/hi).
   3. Other drivers: refrigerant (Reg. (EU) 2024/573 Art. 13 servicing bans = hard dates;
      HFC quota phase-down Annex VII = soft planning horizon, a learning assumption),
      HCFC servicing ban (Reg. (EC) 1005/2009), manufacturer end of support, user target year.
      Renewal year = earliest driver (never before the plan year).
   4. Bundles: assets with the same `bundle` tag within a window are aligned to the year with
      the best net value (shared-mobilisation saving − life given up − risk added).
   5. Budget cap: year by year, forced items first, then by class A>B>C and risk cost;
      what does not fit moves to the next year; the added risk of each deferral is the
      expected major-failure cost of the older asset over the deferred years (Weibull β=3,
      η = L; learning assumption) minus that of the new one.
   All money in real EUR of the plan year (no escalation, no discounting — per-asset PV is
   the job of repairreplace).  Assets without a replacement cost are "cost unknown": no 0 EUR bar,
   counted apart (QA-26).  Criticality results of the register are used only when the page passes
   opts.use_register_crit (the bar's Use button, D-MEP-13); redundancy credit = MEPCore.creditedRedundancy
   (D-MEP-10) or, when those results are used, their credited_redundancy. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mep-core.js'));
  else root.MEPLife = factory(root.MEPCore);
}(typeof self !== 'undefined' ? self : this, function (MEPCore) {
  'use strict';

  var VERSION = '1.1.0';
  var TOOL_ID = 'meplifecycle';

  /* ---------------------------------------------------------------- sources */
  var SOURCES = {
    fgas_2024_573_art13: { title: 'Regulation (EU) 2024/573 on fluorinated greenhouse gases — Art. 13(3)–(5),(7) servicing restrictions; Annex IV placing-on-the-market prohibitions; Annex VII HFC quota; Annex I and VI GWP of mixtures', edition: 'OJ L, 20.2.2024 (text read from the Publications Office Cellar, 2026-11-05)', url: 'https://eur-lex.europa.eu/eli/reg/2024/573/oj', kind: 'regulation' },
    ods_1005_2009: { title: 'Regulation (EC) No 1005/2009 on substances that deplete the ozone layer, Art. 11(3): no HCFC for servicing refrigeration, air-conditioning and heat pump equipment from 1 January 2015 (rule kept by Regulation (EU) 2024/590)', edition: 'OJ L 286, 31.10.2009', url: 'https://eur-lex.europa.eu/eli/reg/2009/1005/oj', kind: 'regulation' },
    ashrae_34: { title: 'ANSI/ASHRAE Standard 34 — Designation and safety classification of refrigerants (blend compositions by mass)', edition: '2022 with addenda', url: 'https://www.ashrae.org/technical-resources/standards-and-guidelines', kind: 'standard' },
    en15459_1: { title: 'EN 15459-1:2017 Annex D (informative) Data for components: life span per component; class lives are set inside its span only where Annex D lists the component (pumps, fans, fan coil units, heat pumps, condensing boilers, air-conditioning units)', edition: '2017 (text read)', url: 'https://www.evs.ee/en/evs-en-15459-1-2017', kind: 'standard' },
    iso_55000: { title: 'ISO 55000/55001 asset management — renewal decisions on condition, risk and cost, not on age', edition: '2024', url: 'https://www.iso.org/standard/83053.html', kind: 'standard' },
    la_life: { title: 'Learning assumption of the renewal planner (engineering judgement; replace with site data): condition→consumed-life table, evidence weights, trigger fractions by class, failure floor, Weibull β = 3 with η = economic life, repair share 0.15, bundle saving 10 %, quota-scarcity horizons', edition: 'meplifecycle 1.0, 2026-11', url: '', kind: 'learning_assumption' }
  };

  /* ---------------------------------------------------------------- refrigerants
     GWP100 of pure substances from Annex I / Annex II / Annex VI of Reg. (EU) 2024/573;
     blends by the Annex VI weighted-average rule with ASHRAE 34 compositions. */
  var GAS_GWP = { R32: 675, R125: 3500, R134a: 1430, R143a: 4470, R1234yf: 0.501, R1234ze: 1.37, R290: 0.02, R600a: 0, R717: 0, R744: 1 };
  var REFRIGERANTS = {
    R22: { hcfc: true, gwp: 1810, note: 'HCFC' },
    R404A: { mix: { R125: 0.44, R143a: 0.52, R134a: 0.04 } },
    R507A: { mix: { R125: 0.50, R143a: 0.50 } },
    R422D: { mix: { R125: 0.651, R134a: 0.315, R600a: 0.034 } },
    R410A: { mix: { R32: 0.50, R125: 0.50 } },
    R407C: { mix: { R32: 0.23, R125: 0.25, R134a: 0.52 } },
    R134a: { mix: { R134a: 1 } },
    R513A: { mix: { R1234yf: 0.56, R134a: 0.44 } },
    R32: { mix: { R32: 1 } },
    R454B: { mix: { R32: 0.689, R1234yf: 0.311 } },
    R1234ze: { mix: { R1234ze: 1 } },
    R290: { mix: { R290: 1 } },
    R717: { mix: { R717: 1 } },
    R744: { mix: { R744: 1 } },
    SF6: { sf6: true, gwp: 22800, note: 'insulating gas (switchgear)' }
  };
  function gwpOf(code) {
    var r = REFRIGERANTS[code];
    if (!r) return null;
    if (r.gwp != null && !r.mix) return r.gwp;
    var s = 0;
    for (var k in r.mix) if (Object.prototype.hasOwnProperty.call(r.mix, k)) s += r.mix[k] * GAS_GWP[k];
    return s;
  }
  function normRef(s) {
    if (s == null) return null;
    var m = String(s).toUpperCase().replace(/\s+/g, '').match(/^(R-?)?(\d{2,4})([A-Z]{0,2})$/);
    if (String(s).toUpperCase() === 'SF6') return 'SF6';
    if (!m) return null;
    var code = 'R' + m[2] + (m[3] === 'ZE' ? 'ze' : m[3] === 'YF' ? 'yf' : m[3] === 'A' && m[2] === '134' ? 'a' : m[3]);
    return REFRIGERANTS[code] ? code : null;
  }
  /* refrigerant from the asset field, else a designation in name/notes (flagged) */
  function refrigerantOf(a) {
    if (a.refrigerant != null && a.refrigerant !== '') {
      var c = normRef(a.refrigerant);
      return c ? { code: c, source: 'user' } : { code: null, source: 'unknown_code', raw: String(a.refrigerant) };
    }
    var txt = String(a.name || '') + ' ' + String(a.notes || '');
    var m = txt.match(/\bR-?(\d{2,4}(?:A|a|ze|yf|B|D)?)\b/);
    if (m) { var c2 = normRef('R' + m[1]); if (c2) return { code: c2, source: 'name' }; }
    if (/\bSF6\b|\bSF₆\b/i.test(txt)) return { code: 'SF6', source: 'name' };
    return null;
  }

  /* classes that hold refrigerant and fall under Art. 13(4) (air conditioning and heat pumps)
     unless the asset says fgas_category:'refrigeration' (Art. 13(3)/(5)). */
  var REFRIG_CLASSES = { chiller_air: 'chiller', chiller_water: 'chiller', heat_pump: 'hp', vrf: 'split', fcu: null };

  /* ---------------------------------------------------------------- defaults */
  var DEFAULTS = {
    horizon: 25,
    budget_cap_eur_y: null,
    cond_frac: { 1: 0.10, 2: 0.35, 3: 0.60, 4: 0.90, 5: 1.10 },
    evidence_w: { measured: 1.0, documented: 0.8, assumed: 0.5, unknown: 0.5 },
    trigger: { A: 0.90, B: 1.00, C: 1.15 },
    fail_floor_n: 3, fail_floor_grade: 4,
    weibull_beta: 3,
    repair_share: 0.15,
    bundle_window_y: 3,
    bundle_saving: 0.10,
    defer_class_A: false,
    carry_over: false,                             /* true = unspent budget goes into a renewal reserve fund */
    scarcity: { high: 2030, mid: 2035 },          /* GWP ≥ 1500 / 750–1499: quota-scarcity planning horizon */
    life_case: 'mid'
  };
  function cfg(opts) {
    var o = {}, k;
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) o[k] = DEFAULTS[k];
    if (opts) for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k) && opts[k] !== undefined) o[k] = opts[k];
    return o;
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function clsOf(a) { return (MEPCore && MEPCore.CLASSES && MEPCore.CLASSES[a['class']]) || null; }

  /* ---------------------------------------------------------------- per asset */
  function lifeOf(a, C) {
    var u = a.economic_life_y;
    if (Array.isArray(u) && u.length === 3 && u.every(function (x) { return num(x) != null && x > 0; })) return { v: u.slice(), source: 'user' };
    if (num(u) != null && u > 0) return { v: [u, u, u], source: 'user' };
    if (C && C.typical && C.typical.economic_life_y) return { v: C.typical.economic_life_y.slice(), source: 'class_typical' };
    return { v: [15, 20, 25], source: 'learning_assumption' };
  }
  function capexOf(a, C) {
    if (num(a.replacement_cost_eur) != null && a.replacement_cost_eur >= 0) return { v: a.replacement_cost_eur, source: 'user' };
    if (C && C.typical && C.typical.replacement_cost_eur) return { v: C.typical.replacement_cost_eur[1], source: 'class_typical', range: C.typical.replacement_cost_eur.slice() };
    return { v: 0, source: 'unknown' };
  }
  function mttrOf(a, C) {
    if (num(a.mttr_h) != null) return a.mttr_h;
    return C && C.typical && C.typical.mttr_h ? C.typical.mttr_h[1] : 0;
  }
  /* redundancy credit, one rule for the package (D-MEP-10): used register results of mepcriticality >
     MEPCore.creditedRedundancy > identical local copy of the crit peer rule (a tag is a common cause only when a
     peer of the same class and serves carries it; no peer -> every tag counts; standby tested within 12 months) */
  function ccTags(a) { return Array.isArray(a && a.common_cause) ? a.common_cause.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean) : []; }
  function creditLocal(a, doc) {
    if (!(a.redundancy === 'N+1' || a.redundancy === '2N')) return false;
    if (!(num(a.reserve_tested_months) != null && a.reserve_tested_months <= 12)) return false;
    var list = doc && Array.isArray(doc.assets) ? doc.assets : [], tags = ccTags(a);
    var peers = list.filter(function (b) { return b && typeof b === 'object' && b !== a && !(a.id != null && b.id === a.id) && b['class'] === a['class'] && b.serves === a.serves; });
    if (!peers.length) return tags.length === 0;
    var pt = []; peers.forEach(function (b) { ccTags(b).forEach(function (t) { if (pt.indexOf(t) < 0) pt.push(t); }); });
    return !tags.some(function (t) { return pt.indexOf(t) >= 0; });
  }
  function critResult(a, doc) {
    var r = doc && doc.modules && doc.modules.mepcriticality && doc.modules.mepcriticality.results &&
      doc.modules.mepcriticality.results[a.id];
    return r && typeof r === 'object' ? r : null;
  }
  function credited(a, doc, o) {
    var r = o.use_register_crit ? critResult(a, doc) : null;
    if (r && typeof r.credited_redundancy === 'boolean') return { v: r.credited_redundancy, rule: 'register' };
    if (MEPCore && typeof MEPCore.creditedRedundancy === 'function') {
      try { var c = MEPCore.creditedRedundancy(a, doc); if (c && typeof c.credited === 'boolean') return { v: c.credited, rule: 'core' }; } catch (e) { /* local rule */ }
    }
    return { v: creditLocal(a, doc), rule: 'local' };
  }
  /* criticality class: register results of mepcriticality only when Used (opts.use_register_crit, D-MEP-13) >
     live MEPCrit > asset.crit_class > assumed B (flagged) */
  function critClass(a, doc, o) {
    var r = o.use_register_crit ? critResult(a, doc) : null;
    if (r && /^[ABC]$/.test(r['class'])) return { v: r['class'], source: 'register' };
    if (o.critClassOf) { var c = o.critClassOf(a); if (/^[ABC]$/.test(c)) return { v: c, source: 'mepcriticality' }; }
    if (o.crit && typeof o.crit.assess === 'function') {
      try { var x = o.crit.assess(a, { site: doc && doc.site }); if (x && x.valid !== false && /^[ABC]$/.test(x['class'])) return { v: x['class'], source: 'mepcriticality' }; } catch (e) { /* fall through */ }
    }
    if (/^[ABC]$/.test(a.crit_class || '')) return { v: a.crit_class, source: 'user' };
    return { v: 'B', source: 'assumed' };
  }
  /* hazard of a major failure at age t (Weibull β, η = L) */
  function hazard(t, L, beta) { if (t <= 0) return 0; return (beta / L) * Math.pow(t / L, beta - 1); }

  function refrigDrivers(a, ref, planYear, o, flags) {
    var out = [];
    if (!ref || !ref.code) return out;
    var code = ref.code, R = REFRIGERANTS[code], gwp = gwpOf(code);
    var kind = REFRIG_CLASSES[a['class']];
    var cat = a.fgas_category === 'refrigeration' ? 'refrigeration' : 'ac_hp';
    if (ref.source === 'name') flags.push('refrigerant_from_name');
    if (R.sf6) {
      flags.push('sf6_2035');
      return out;   /* Art. 13(7): from 2035 only reclaimed/recycled SF6 for servicing — information, not a renewal date */
    }
    if (R.hcfc) {
      out.push({ kind: 'regulatory', code: 'hcfc_service_ban', year: 2015, hard: true, basis: 'ods_1005_2009', gwp: gwp, refrigerant: code });
      return out;
    }
    if (gwp >= 2500) {
      var virgin = cat === 'refrigeration' ? 2025 : 2026, reclaimedEnd = cat === 'refrigeration' ? 2030 : 2032;
      flags.push('virgin_service_ban_' + virgin);
      out.push({ kind: 'regulatory', code: cat === 'refrigeration' ? 'art13_3_gwp2500' : 'art13_4_gwp2500', year: reclaimedEnd, hard: true,
        basis: 'fgas_2024_573_art13', gwp: gwp, refrigerant: code, virgin_ban: virgin });
      return out;
    }
    if (cat === 'refrigeration' && gwp >= 750) flags.push('art13_5_gwp750_2032');
    var user = num(a.refrigerant_service_until);
    if (user != null) {
      out.push({ kind: 'scarcity', code: 'service_until_user', year: Math.round(user), hard: false, basis: 'user', gwp: gwp, refrigerant: code });
    } else if (gwp >= 1500 && o.scarcity && num(o.scarcity.high) != null) {
      out.push({ kind: 'scarcity', code: 'quota_scarcity_high', year: o.scarcity.high, hard: false, basis: 'la_life', gwp: gwp, refrigerant: code });
    } else if (gwp >= 750 && o.scarcity && num(o.scarcity.mid) != null) {
      out.push({ kind: 'scarcity', code: 'quota_scarcity_mid', year: o.scarcity.mid, hard: false, basis: 'la_life', gwp: gwp, refrigerant: code });
    }
    /* like-for-like replacement no longer allowed (Annex IV) — information for the renewal scope */
    var kw = num(a.rated_kw);
    if (kind === 'chiller' && gwp >= 750 && (kw == null || kw > 12)) flags.push('l4l_banned_chiller_2027');
    if (kind === 'split' && gwp >= 750 && (kw == null || kw > 12)) flags.push('l4l_banned_split_2029');
    if (kind === 'split' && gwp >= 150 && (kw == null || kw > 12)) flags.push('l4l_banned_split_gwp150_2033');
    if (kind === 'hp' && gwp >= 150) flags.push(kw != null && kw <= 50 ? 'l4l_banned_hp_2027' : 'l4l_banned_hp_2030');
    return out;
  }

  function assessAsset(a, doc, o, planYear) {
    var C = clsOf(a), flags = [];
    if (!C) flags.push('unknown_class');
    var life = lifeOf(a, C), capex = capexOf(a, C);
    var L = life.v[o.life_case === 'lo' ? 0 : o.life_case === 'hi' ? 2 : 1];
    var cc = critClass(a, doc, o);
    if (cc.source === 'assumed') flags.push('crit_class_assumed');
    if (life.source !== 'user') flags.push('life_typical');
    if (capex.source === 'class_typical') flags.push('capex_typical');
    if (capex.source === 'unknown') flags.push('capex_unknown');

    var iy = num(a.install_year);
    var age = iy != null ? Math.max(0, planYear - iy) : null;
    var grade = num(a.condition), gsrc = 'user';
    if (grade != null) grade = Math.min(5, Math.max(1, Math.round(grade)));
    var f3 = num(a.failures_3y) || 0, floorApplied = false;
    if (f3 >= o.fail_floor_n && (grade == null || grade < o.fail_floor_grade)) {
      grade = o.fail_floor_grade; gsrc = grade === num(a.condition) ? 'user' : 'failure_floor'; floorApplied = true;
      flags.push('failure_floor');
    }
    var ev = a.evidence && o.evidence_w[a.evidence] != null ? a.evidence : 'unknown';
    var w = grade == null ? 0 : (floorApplied && num(a.condition) == null ? o.evidence_w.documented : o.evidence_w[ev]);
    if (floorApplied && w < o.evidence_w.documented) w = o.evidence_w.documented;   /* failures are documented evidence */
    var effAge, basis;
    if (grade == null && age == null) {
      effAge = o.cond_frac[3] * L; basis = 'unknown'; flags.push('no_condition_no_age');
    } else if (grade == null) {
      effAge = age; basis = 'age_only'; flags.push('age_only');
    } else if (age == null) {
      effAge = o.cond_frac[grade] * L; basis = 'condition_only'; flags.push('install_year_unknown');
    } else {
      effAge = w * o.cond_frac[grade] * L + (1 - w) * age; basis = 'blend';
    }
    var trig = o.trigger[cc.v];
    var rem = trig * L - effAge;
    var drivers = [{ kind: 'condition', code: 'trigger_' + cc.v, year: planYear + Math.floor(rem), hard: false, basis: 'la_life', rem: rem }];
    /* range from life lo / hi (same effective-age fraction) */
    function remFor(Lx) {
      var e;
      if (basis === 'age_only') e = age; else if (basis === 'unknown') e = o.cond_frac[3] * Lx;
      else if (basis === 'condition_only') e = o.cond_frac[grade] * Lx;
      else e = w * o.cond_frac[grade] * Lx + (1 - w) * age;
      return trig * Lx - e;
    }
    var ref = refrigerantOf(a);
    if (ref && ref.source === 'unknown_code') flags.push('refrigerant_unknown_code');
    drivers = drivers.concat(refrigDrivers(a, ref, planYear, o, flags));
    var sup = num(a.support_end_year);
    if (sup != null) drivers.push({ kind: 'support', code: 'support_end', year: Math.round(sup), hard: false, basis: 'user' });
    var tgt = num(a.target_year);
    if (tgt != null) drivers.push({ kind: 'user', code: 'target_year', year: Math.round(tgt), hard: true, basis: 'user' });

    /* D-MEP-8: without a condition grade the age-based date is indicative only; a non-age driver may still govern */
    var survey = grade == null;
    if (survey) drivers[0].indicative = true;
    var pool = survey && drivers.length > 1 ? drivers.slice(1) : drivers;
    var gov = pool[0];
    pool.forEach(function (d) { if (d.year < gov.year || (d.year === gov.year && d.hard && !gov.hard)) gov = d; });
    var due = gov.year, overdue = Math.max(0, planYear - due);
    var year = Math.max(planYear, due);
    var hardYear = null;
    drivers.forEach(function (d) { if (d.hard && (hardYear == null || d.year < hardYear)) hardYear = d.year; });
    var unbooked = survey && gov.kind === 'condition' ? 'survey_needed' : capex.source === 'unknown' ? 'cost_unknown' : null;
    if (unbooked === 'survey_needed') flags.push('survey_needed');
    if (overdue > 0 && unbooked !== 'survey_needed') flags.push('overdue');
    if (basis === 'blend' && age != null && age > L && grade <= 2 && year > planYear) flags.push('beyond_typical_life_but_healthy');
    if (basis === 'blend' && age != null && age < 0.5 * L && year <= planYear + 2 && gov.kind === 'condition') flags.push('young_but_failing');

    var other = drivers.filter(function (d) { return d.kind !== 'condition'; });
    function yearFor(Lx) {
      var y = survey && other.length ? Infinity : planYear + Math.floor(remFor(Lx));
      other.forEach(function (d) { if (d.year < y) y = d.year; });
      return Math.max(planYear, y);
    }
    var range = [yearFor(life.v[0]), yearFor(life.v[2])];
    if (range[0] > range[1]) range = [range[1], range[0]];

    var mttr = mttrOf(a, C), dt = num(a.downtime_cost_eur_h);
    if (dt == null) flags.push('downtime_cost_unknown');
    var cr = credited(a, doc, o), cred = cr.v;
    var eventCost = o.repair_share * capex.v + (cred ? 0 : (dt || 0) * mttr);
    /* cycle of a new asset: renew again when a new asset reaches the trigger on age (no condition data yet) */
    var cycle = Math.max(1, Math.floor(trig * L));

    var linkGen = (a['class'] === 'chiller_air' || a['class'] === 'chiller_water' || a['class'] === 'boiler_gas' || a['class'] === 'heat_pump');
    return {
      id: a.id, 'class': a['class'], system: C ? C.system : null,
      crit_class: cc.v, crit_source: cc.source,
      age: age, life: life.v, life_source: life.source, L: L,
      condition: num(a.condition), grade_used: grade, grade_source: grade == null ? null : gsrc,
      evidence: ev, evidence_weight: w, basis: basis,
      eff_age: effAge, trigger_frac: trig, rem_years: rem,
      refrigerant: ref && ref.code ? ref.code : null, refrigerant_source: ref ? ref.source : null,
      gwp: ref && ref.code ? gwpOf(ref.code) : null,
      drivers: drivers, governing: { kind: gov.kind, code: gov.code, year: gov.year, hard: gov.hard },
      due_year: due, renewal_year: year, overdue_years: unbooked === 'survey_needed' ? 0 : overdue, hard_year: hardYear, range: range,
      booked: !unbooked, unbooked: unbooked,
      capex: capex.v, capex_source: capex.source, capex_range: capex.range || null,
      event_cost: eventCost, credited_redundancy: cred, credit_rule: cr.rule, cycle_y: cycle,
      risk_cost_at_renewal: hazard(effAge + (year - planYear) + 0.5, L, o.weibull_beta) * eventCost,
      bundle: a.bundle ? String(a.bundle) : null,
      links: { repairreplace: true, hvacgenselect: linkGen, obsolescenceltb: sup != null },
      flags: flags
    };
  }

  /* added risk of moving a renewal from year `from` to `to` (to > from) */
  function addedRisk(r, from, to, planYear, o) {
    var s = 0;
    for (var y = from; y < to; y++) {
      var tOld = r.eff_age + (y - planYear) + 0.5;
      var tNew = (y - from) + 0.5;
      s += (hazard(tOld, r.L, o.weibull_beta) - hazard(tNew, r.L, o.weibull_beta)) * r.event_cost;
    }
    return s;
  }
  /* risk cost per year of keeping the old asset in year y */
  function riskRate(r, y, planYear, o) { return hazard(r.eff_age + (y - planYear) + 0.5, r.L, o.weibull_beta) * r.event_cost; }

  /* ---------------------------------------------------------------- bundles */
  function planBundles(rows, planYear, o) {
    var tags = {}, out = [];
    rows.forEach(function (r) { if (r.bundle) (tags[r.bundle] = tags[r.bundle] || []).push(r); });
    Object.keys(tags).sort().forEach(function (tag) {
      var m = tags[tag];
      if (m.length < 2) { out.push({ tag: tag, members: m.map(function (r) { return r.id; }), year: null, applied: false, reason: 'single_member' }); return; }
      var cands = m.map(function (r) { return r.renewal_year; }).filter(function (y, i, arr) { return arr.indexOf(y) === i; }).sort(function (x, y) { return x - y; });
      var best = null;
      cands.forEach(function (Y) {
        var inc = m.filter(function (r) { return Math.abs(r.renewal_year - Y) <= o.bundle_window_y && !(r.hard_year != null && Y > Math.max(planYear, r.hard_year)); });
        if (inc.length < 2) return;
        var saving = 0, lifeLost = 0, risk = 0;
        inc.forEach(function (r) {
          saving += o.bundle_saving * r.capex;
          if (Y < r.renewal_year) lifeLost += (r.renewal_year - Y) * r.capex / r.cycle_y;
          if (Y > r.renewal_year) risk += addedRisk(r, r.renewal_year, Y, planYear, o);
        });
        var net = saving - lifeLost - risk;
        if (!best || net > best.net + 1e-9) best = { year: Y, inc: inc, saving: saving, life_given_up: lifeLost, risk_added: risk, net: net };
      });
      if (!best) { out.push({ tag: tag, members: m.map(function (r) { return r.id; }), year: null, applied: false, reason: 'outside_window' }); return; }
      var applied = best.net > 0;
      if (applied) best.inc.forEach(function (r) {
        r.bundle_shift = best.year - r.renewal_year;
        r.renewal_year = best.year; r.bundled = tag;
        r.capex_bundled = r.capex * (1 - o.bundle_saving);
      });
      out.push({ tag: tag, members: best.inc.map(function (r) { return r.id; }), excluded: m.filter(function (r) { return best.inc.indexOf(r) < 0; }).map(function (r) { return r.id; }),
        year: best.year, saving_eur: best.saving, life_given_up_eur: best.life_given_up, risk_added_eur: best.risk_added, net_eur: best.net,
        applied: applied, reason: applied ? 'net_positive' : 'net_not_positive' });
    });
    return out;
  }

  /* ---------------------------------------------------------------- profile */
  var CLS_RANK = { A: 0, B: 1, C: 2 };
  function buildItems(rows, planYear, o) {
    /* one item per renewal event (first renewal + later cycles); bundled members of one tag form one item */
    var items = [], groups = {};
    rows.forEach(function (r) {
      var cost = r.capex_bundled != null ? r.capex_bundled : r.capex;
      if (r.bundled) {
        var g = groups[r.bundled];
        if (!g) { g = groups[r.bundled] = { key: 'bundle:' + r.bundled, members: [], year: r.renewal_year, cost: 0, cls: 'C', forced: false, hard: null, rows: [] }; items.push(g); }
        g.members.push(r.id); g.rows.push(r); g.cost += cost;
        if (CLS_RANK[r.crit_class] < CLS_RANK[g.cls]) g.cls = r.crit_class;
        if (r.hard_year != null) g.hard = g.hard == null ? Math.max(planYear, r.hard_year) : Math.min(g.hard, Math.max(planYear, r.hard_year));
        if (r.crit_class === 'A' && !o.defer_class_A) g.forced = true;
      } else {
        items.push({ key: r.id, members: [r.id], rows: [r], year: r.renewal_year, cost: cost, cls: r.crit_class,
          hard: r.hard_year != null ? Math.max(planYear, r.hard_year) : null, forced: r.crit_class === 'A' && !o.defer_class_A });
      }
    });
    return items;
  }

  function profile(rows, planYear, o) {
    var H = o.horizon, last = planYear + H - 1;
    var years = [], i;
    for (i = 0; i < H; i++) years.push({ year: planYear + i, unconstrained: 0, capped: 0, backlog_eur: 0, waiting: 0, overspend_eur: 0, reserve_eur: 0, items: [] });
    var byYear = function (y) { return years[y - planYear]; };
    /* unconstrained: each asset renewed at its year, then every cycle */
    rows.forEach(function (r) {
      var cost0 = r.capex_bundled != null ? r.capex_bundled : r.capex;
      for (var y = r.renewal_year, k = 0; y <= last; y += r.cycle_y, k++) byYear(y).unconstrained += k === 0 ? cost0 : r.capex;
    });
    var items = buildItems(rows, planYear, o), cap = num(o.budget_cap_eur_y);
    var sched = {};    /* key -> {first_due, first_done, deferred, added_risk} */
    items.forEach(function (it) { sched[it.key] = { due: it.year, done: null, deferred: 0, added_risk: 0, overspend: false }; });
    if (cap == null) {
      items.forEach(function (it) { sched[it.key].done = it.year; });
      years.forEach(function (Y) { Y.capped = Y.unconstrained; });
    } else {
      /* queue of renewal events: {it, due, cycleIndex, cost} */
      var queue = items.map(function (it) { return { it: it, due: it.year, k: 0, cost: it.cost }; });
      var reserve = 0;
      /* the highest-priority candidate that is not forced: only it may exceed the annual cap on its own */
      var firstFree = function (list) { for (var j = 0; j < list.length; j++) if (!list[j].isForced) return list[j]; return null; };
      for (i = 0; i < H; i++) {
        var y = planYear + i, Y = years[i];
        var cand = queue.filter(function (q) { return q.due <= y && !q.done; });
        cand.forEach(function (q) {
          var r0 = q.it.rows[0];
          q.isForced = q.it.forced || (q.it.hard != null && y >= q.it.hard && q.k === 0);
          q.rate = 0;
          q.it.rows.forEach(function (r) { q.rate += q.k === 0 ? riskRate(r, y, planYear, o) : hazard((y - q.due) + r.cycle_y + 0.5, r.L, o.weibull_beta) * r.event_cost; });
          q.cls = q.it.cls; q.id = q.it.key; void r0;
        });
        cand.sort(function (p, q) {
          if (p.isForced !== q.isForced) return p.isForced ? -1 : 1;
          if (p.cls !== q.cls) return CLS_RANK[p.cls] - CLS_RANK[q.cls];
          if (Math.abs(p.rate - q.rate) > 1e-9) return q.rate - p.rate;
          if (p.due !== q.due) return p.due - q.due;
          return p.id < q.id ? -1 : p.id > q.id ? 1 : 0;
        });
        var spent = 0, avail = cap + (o.carry_over ? reserve : 0);
        cand.forEach(function (q) {
          var lumpy = !q.isForced && q.cost > cap + 1e-6 && spent === 0 && !o.carry_over && q === firstFree(cand);
          if (q.isForced || lumpy || spent + q.cost <= avail + 1e-6) {
            spent += q.cost; q.done = y; Y.items.push(q.it.key);
            if (q.k === 0) {
              sched[q.it.key].done = y; sched[q.it.key].deferred = y - q.due;
              sched[q.it.key].overspend = (q.isForced && spent > avail + 1e-6) ? 'forced' : lumpy ? 'exceeds_cap' : false;
            }
            /* next cycle of the members */
            var cyc = Math.min.apply(null, q.it.rows.map(function (r) { return r.cycle_y; }));
            var full = q.it.rows.reduce(function (s, r) { return s + r.capex; }, 0);
            if (y + cyc <= last) queue.push({ it: q.it, due: y + cyc, k: q.k + 1, cost: full });
          }
        });
        Y.capped = spent;
        Y.overspend_eur = Math.max(0, spent - avail);
        reserve = o.carry_over ? Math.max(0, avail - spent) : 0;
        Y.reserve_eur = reserve;
        var waiting = queue.filter(function (q) { return q.due <= y && !q.done; });
        Y.backlog_eur = waiting.reduce(function (s, q) { return s + q.cost; }, 0);
        Y.waiting = waiting.length;
      }
      /* added risk of first-renewal deferrals (later cycles: reported in the backlog only) */
      items.forEach(function (it) {
        var s = sched[it.key], to = s.done == null ? last + 1 : s.done;
        if (to > s.due) it.rows.forEach(function (r) { s.added_risk += addedRisk(r, s.due, to, planYear, o); });
      });
    }
    /* write back to rows */
    items.forEach(function (it) {
      var s = sched[it.key];
      it.rows.forEach(function (r) {
        r.scheduled_year = s.done; r.deferred_years = s.done == null ? (last + 1 - s.due) : s.done - s.due;
        r.beyond_horizon = s.done == null;
        r.added_risk_eur = it.rows.length > 1 ? addedRisk(r, s.due, s.done == null ? last + 1 : s.done, planYear, o) : s.added_risk;
        r.overspend = s.overspend;
      });
    });
    return years;
  }

  /* ---------------------------------------------------------------- plan */
  function plan(doc, opts) {
    var o = cfg(opts);
    var planYear = num(o.year) != null ? o.year : (doc && doc.site && num(doc.site.year) != null ? doc.site.year : new Date().getFullYear());
    var assets = (doc && Array.isArray(doc.assets)) ? doc.assets : [];
    var rows = assets.filter(function (a) { return a && a.id != null && a.retired !== true; }).map(function (a) { return assessAsset(a, doc, o, planYear); });
    var booked = rows.filter(function (r) { return r.booked; });
    var bundles = planBundles(booked, planYear, o);
    var years = profile(booked, planYear, o);
    /* not booked (survey needed / cost unknown): no money, an indicative marker in their year */
    years.forEach(function (Y) { Y.survey = []; Y.survey_eur = 0; Y.cost_unknown = []; });
    rows.forEach(function (r) {
      if (r.booked) return;
      r.scheduled_year = null; r.deferred_years = 0; r.beyond_horizon = false; r.added_risk_eur = 0; r.overspend = false;
      var Y = years[r.renewal_year - planYear]; if (!Y) return;
      if (r.unbooked === 'survey_needed') { Y.survey.push(r.id); if (r.capex_source !== 'unknown') Y.survey_eur += r.capex; }
      else Y.cost_unknown.push(r.id);
    });
    var tot = function (k) { return years.reduce(function (s, y) { return s + y[k]; }, 0); };
    var peak = function (k) { var p = years[0]; years.forEach(function (y) { if (y[k] > p[k]) p = y; }); return p ? { year: p.year, eur: p[k] } : null; };
    var first5 = years.slice(0, 5).reduce(function (s, y) { return s + y.unconstrained; }, 0);
    var summary = {
      plan_year: planYear, horizon: o.horizon, assets: rows.length,
      total_unconstrained_eur: tot('unconstrained'), total_capped_eur: tot('capped'),
      peak_unconstrained: peak('unconstrained'), peak_capped: peak('capped'),
      budget_cap_eur_y: num(o.budget_cap_eur_y),
      overdue: rows.filter(function (r) { return r.overdue_years > 0; }).map(function (r) { return r.id; }),
      survey_needed: rows.filter(function (r) { return r.unbooked === 'survey_needed'; }).map(function (r) { return r.id; }),
      survey_indicative_eur: rows.reduce(function (s, r) { return s + (r.unbooked === 'survey_needed' && r.capex_source !== 'unknown' ? r.capex : 0); }, 0),
      cost_unknown: rows.filter(function (r) { return r.capex_source === 'unknown'; }).map(function (r) { return r.id; }),
      due_5y_eur: first5,
      by_driver: rows.reduce(function (m, r) { m[r.governing.kind] = (m[r.governing.kind] || 0) + 1; return m; }, {}),
      deferred: rows.filter(function (r) { return r.deferred_years > 0; }).map(function (r) { return r.id; }),
      added_risk_eur: rows.reduce(function (s, r) { return s + (r.added_risk_eur || 0); }, 0),
      backlog_end_eur: years.length ? years[years.length - 1].backlog_eur : 0,
      overspend_years: years.filter(function (y) { return y.overspend_eur > 0; }).map(function (y) { return y.year; }),
      beyond_horizon: rows.filter(function (r) { return r.beyond_horizon; }).map(function (r) { return r.id; }),
      bundles_applied: bundles.filter(function (b) { return b.applied; }).length,
      annual_average_eur: tot('unconstrained') / Math.max(1, o.horizon)
    };
    /* wall = peak of the deferred backlog (bow wave): the year with the largest capex waiting at year end */
    var wall = null;
    if (summary.budget_cap_eur_y != null) years.forEach(function (Y) {
      if (Y.backlog_eur > 0 && (!wall || Y.backlog_eur > wall.backlog_eur + 1e-6)) wall = { year: Y.year, backlog_eur: Y.backlog_eur, waiting: Y.waiting };
    });
    summary.wall = wall;
    return { tool: TOOL_ID, version: VERSION, plan_year: planYear, options: publicOpts(o), assets: rows, years: years, bundles: bundles, summary: summary };
  }
  function publicOpts(o) { var p = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] !== 'function' && k !== 'crit') p[k] = o[k]; return p; }

  /* ---------------------------------------------------------------- exchange */
  function moduleResults(res) {
    var results = {};
    res.assets.forEach(function (r) {
      results[r.id] = { renewal_year: r.renewal_year, scheduled_year: r.scheduled_year, range: r.range, governing: r.governing.kind + ':' + r.governing.code,
        booked: r.booked, unbooked: r.unbooked, crit_source: r.crit_source, credited_redundancy: r.credited_redundancy,
        capex_eur: r.capex_source === 'unknown' ? null : r.capex, capex_source: r.capex_source, deferred_years: r.deferred_years, added_risk_eur: Math.round(r.added_risk_eur || 0), crit_class: r.crit_class, flags: r.flags.slice() };
    });
    var s = res.summary;
    return { results: results, summary: { plan_year: s.plan_year, horizon: s.horizon, total_unconstrained_eur: s.total_unconstrained_eur, total_capped_eur: s.total_capped_eur,
      budget_cap_eur_y: s.budget_cap_eur_y, peak_unconstrained: s.peak_unconstrained, wall: s.wall, overdue: s.overdue, added_risk_eur: Math.round(s.added_risk_eur),
      survey_needed: s.survey_needed.slice(), cost_unknown: s.cost_unknown.slice() } };
  }
  function csvRows(res) {
    return res.assets.map(function (r) {
      return { id: r.id, 'class': r['class'], crit_class: r.crit_class, age: r.age, condition: r.condition, grade_used: r.grade_used, basis: r.basis,
        eff_age: Math.round(r.eff_age * 10) / 10, life_y: r.L, governing: r.governing.kind + ':' + r.governing.code, due_year: r.due_year,
        renewal_year: r.renewal_year, range_lo: r.range[0], range_hi: r.range[1], scheduled_year: r.scheduled_year, deferred_years: r.deferred_years,
        capex_eur: r.capex_source === 'unknown' ? null : Math.round(r.capex), capex_source: r.capex_source, added_risk_eur: Math.round(r.added_risk_eur || 0), refrigerant: r.refrigerant || '',
        bundle: r.bundled || '', money: r.booked ? 'booked' : r.unbooked, flags: r.flags.join(' ') };
    });
  }
  var CSV_COLS = ['id', 'class', 'crit_class', 'age', 'condition', 'grade_used', 'basis', 'eff_age', 'life_y', 'governing', 'due_year', 'renewal_year', 'range_lo', 'range_hi', 'scheduled_year', 'deferred_years', 'capex_eur', 'capex_source', 'added_risk_eur', 'refrigerant', 'bundle', 'money', 'flags'];

  /* handoff payload for hvacgenselect (accepts Q, T; SI): replacement heat/cold generator of the same rating */
  function genselectPayload(a) {
    var kw = num(a && a.rated_kw);
    if (kw == null || kw <= 0) return null;
    var q = { Q: { value: kw * 1000, unit: 'W' } };
    var tf = num(a.flow_temp_c);
    if (tf != null && a['class'] !== 'chiller_air' && a['class'] !== 'chiller_water') q.T = { value: tf + 273.15, unit: 'K' };
    return { schema: 'tools.petrov.re/handoff/v1', from: { tool: TOOL_ID, file: 'meplifecycle.html' }, quantities: q, sets: {} };
  }

  /* ---------------------------------------------------------------- presets
     Synthetic registers (no real site), each with one point to see.  Core sites come from
     MEPCore.PRESET_SITES.  `names` = localised asset names (the register `name` stays English). */
  function A(id, cls, n, f) {
    var a = { id: id, 'class': cls, name: n.en, names: n, serves: 'common', location: '', install_year: null, redundancy: 'none', reserve_tested_months: null,
      common_cause: [], downtime_cost_eur_h: null, tolerable_downtime_h: null, mttr_h: null, lead_time_days: null, replacement_cost_eur: null,
      condition: null, failures_3y: 0, refrigerant_charge_t_co2e: null, evidence: 'documented', notes: '' };
    for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) a[k] = f[k];
    return a;
  }
  function N(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }
  function site(name, assets) {
    return { schema: 'tools.petrov.re/mep-maintenance/v1', revision: 1, site: { name: name, currency: 'EUR', labour_rate_eur_h: 75, year: 2026 }, assets: assets, modules: {} };
  }
  var PRESETS = [
    { id: 'age_vs_condition', site: null, opts: {},
      build: function () { return site('Age vs condition (demo)', [
        A('BLR-OLD', 'boiler_gas', N('Boiler 1998, well kept', 'Котел 1998 р., добре доглянутий', 'Kessel 1998, gut gepflegt', 'Ketel 1998, goed onderhouden', 'Chaudière 1998, bien entretenue', 'Caldera 1998, bien mantenida', 'Kocioł 1998, dobrze utrzymany'),
          { install_year: 1998, condition: 2, failures_3y: 0, evidence: 'measured', downtime_cost_eur_h: 150, replacement_cost_eur: 45000, rated_kw: 300 }),
        A('BLR-NEW', 'boiler_gas', N('Boiler 2018, repeated faults', 'Котел 2018 р., повторні відмови', 'Kessel 2018, wiederholte Störungen', 'Ketel 2018, herhaalde storingen', 'Chaudière 2018, pannes répétées', 'Caldera 2018, fallos repetidos', 'Kocioł 2018, powtarzające się awarie'),
          { install_year: 2018, condition: 3, failures_3y: 4, evidence: 'measured', downtime_cost_eur_h: 150, replacement_cost_eur: 45000, rated_kw: 300, notes: 'Heat exchanger cracked twice.' }),
        A('AHU-1', 'ahu', N('AHU 2008, no survey', 'AHU 2008 р., без обстеження', 'RLT-Gerät 2008, ohne Zustandsaufnahme', 'LBK 2008, niet geïnspecteerd', 'CTA 2008, sans état des lieux', 'UTA 2008, sin inspección', 'Centrala 2008, bez oceny stanu'),
          { install_year: 2008, condition: null, evidence: 'unknown', downtime_cost_eur_h: 100 }),
        A('P-1', 'pump', N('Pump set, install year unknown', 'Насосна група, рік встановлення невідомий', 'Pumpengruppe, Baujahr unbekannt', 'Pompgroep, bouwjaar onbekend', 'Groupe de pompes, année inconnue', 'Grupo de bombas, año desconocido', 'Zespół pomp, rok montażu nieznany'),
          { install_year: null, condition: 3, evidence: 'assumed', downtime_cost_eur_h: 50 })
      ]); } },
    { id: 'budget_wall', site: null, opts: { budget_cap_eur_y: 100000 },
      build: function () {
        var d = site('Campus built 1999 (demo)', []), L = [
          ['AHU-A', 'ahu', 1999, 3, 1, 90000], ['AHU-B', 'ahu', 1999, 3, 2, 90000], ['AHU-C', 'ahu', 2000, 3, 1, 90000],
          ['CH-1', 'chiller_water', 1999, 3, 2, 220000], ['BLR-1', 'boiler_gas', 1999, 3, 1, 80000], ['BLR-2', 'boiler_gas', 1999, 3, 2, 80000],
          ['P-1', 'pump', 2001, 3, 0, 25000], ['WB-1', 'water_booster', 1999, 3, 1, 30000],
          ['MSB-1', 'lv_switchboard', 1999, 3, 0, 150000], ['BMS-1', 'bms_controller', 2006, 3, 2, 60000]];
        L.forEach(function (r) {
          d.assets.push(A(r[0], r[1], N(r[0], r[0], r[0], r[0], r[0], r[0], r[0]), { install_year: r[2], condition: r[3], failures_3y: r[4], replacement_cost_eur: r[5], evidence: 'documented', serves: 'office', downtime_cost_eur_h: 100, tolerable_downtime_h: 24 }));
        });
        return d;
      } },
    { id: 'refrigerant', site: null, opts: {},
      build: function () { return site('Refrigerant drivers (demo)', [
        A('VRF-1', 'vrf', N('VRF offices floors 1–3 (R410A)', 'VRF офіси, поверхи 1–3 (R410A)', 'VRF Büros OG 1–3 (R410A)', 'VRF kantoren verd. 1–3 (R410A)', 'DRV bureaux étages 1–3 (R410A)', 'VRF oficinas plantas 1–3 (R410A)', 'VRF biura piętra 1–3 (R410A)'),
          { install_year: 2015, condition: 2, failures_3y: 0, evidence: 'measured', refrigerant: 'R410A', rated_kw: 90, refrigerant_charge_t_co2e: 63, replacement_cost_eur: 120000, downtime_cost_eur_h: 120 }),
        A('CH-1', 'chiller_water', N('Water-cooled chiller (R134a)', 'Чилер з водяним охолодженням (R134a)', 'Wassergekühlter Kaltwassersatz (R134a)', 'Watergekoelde koelmachine (R134a)', 'Groupe froid à condensation par eau (R134a)', 'Enfriadora condensada por agua (R134a)', 'Agregat wody lodowej chłodzony wodą (R134a)'),
          { install_year: 2012, condition: 3, failures_3y: 1, evidence: 'measured', refrigerant: 'R134a', rated_kw: 800, refrigerant_charge_t_co2e: 286, replacement_cost_eur: 240000, downtime_cost_eur_h: 300 }),
        A('CH-2', 'chiller_air', N('Air-cooled chiller (R407C)', 'Чилер з повітряним охолодженням (R407C)', 'Luftgekühlter Kaltwassersatz (R407C)', 'Luchtgekoelde koelmachine (R407C)', 'Groupe froid à air (R407C)', 'Enfriadora condensada por aire (R407C)', 'Agregat wody lodowej chłodzony powietrzem (R407C)'),
          { install_year: 2011, condition: 2, failures_3y: 0, evidence: 'documented', refrigerant: 'R407C', rated_kw: 250, refrigerant_charge_t_co2e: 71, replacement_cost_eur: 110000, downtime_cost_eur_h: 150 }),
        A('HP-OLD', 'heat_pump', N('Server-room split heat pump (R22)', 'Спліт-тепловий насос серверної (R22)', 'Split-Wärmepumpe Serverraum (R22)', 'Split-warmtepomp serverruimte (R22)', 'PAC split salle serveurs (R22)', 'Bomba de calor split sala de servidores (R22)', 'Pompa ciepła split serwerowni (R22)'),
          { install_year: 2003, condition: 2, failures_3y: 0, evidence: 'documented', refrigerant: 'R22', rated_kw: 14, replacement_cost_eur: 12000, downtime_cost_eur_h: 400 }),
        A('CR-1', 'chiller_air', N('Cold-room condensing unit (R404A)', 'Компресорно-конденсаторний агрегат камери (R404A)', 'Verflüssigungssatz Kühlraum (R404A)', 'Condensing unit koelcel (R404A)', 'Groupe de condensation chambre froide (R404A)', 'Unidad condensadora cámara (R404A)', 'Agregat skraplający komory (R404A)'),
          { install_year: 2016, condition: 2, failures_3y: 0, evidence: 'documented', refrigerant: 'R404A', fgas_category: 'refrigeration', rated_kw: 20, replacement_cost_eur: 25000, downtime_cost_eur_h: 80 }),
        A('HP-1', 'heat_pump', N('Air-to-water heat pump (R32)', 'Тепловий насос повітря–вода (R32)', 'Luft-Wasser-Wärmepumpe (R32)', 'Lucht-water warmtepomp (R32)', 'PAC air/eau (R32)', 'Bomba de calor aire-agua (R32)', 'Pompa ciepła powietrze–woda (R32)'),
          { install_year: 2023, condition: 1, failures_3y: 0, evidence: 'measured', refrigerant: 'R32', rated_kw: 60, replacement_cost_eur: 45000, downtime_cost_eur_h: 60 })
      ]); } },
    { id: 'bundle_fanwall', site: null, opts: {},
      build: function () { return site('AHU renewals and a fan-wall upgrade (demo)', [
        A('AHU-N', 'ahu', N('AHU north wing', 'AHU північне крило', 'RLT-Gerät Nordflügel', 'LBK noordvleugel', 'CTA aile nord', 'UTA ala norte', 'Centrala skrzydło północne'),
          { install_year: 2002, condition: 3, failures_3y: 1, evidence: 'documented', replacement_cost_eur: 90000, downtime_cost_eur_h: 150, bundle: 'ahu_fanwall' }),
        A('AHU-S', 'ahu', N('AHU south wing', 'AHU південне крило', 'RLT-Gerät Südflügel', 'LBK zuidvleugel', 'CTA aile sud', 'UTA ala sur', 'Centrala skrzydło południowe'),
          { install_year: 2009, condition: 3, failures_3y: 0, evidence: 'documented', replacement_cost_eur: 90000, downtime_cost_eur_h: 150, bundle: 'ahu_fanwall' }),
        A('FW-1', 'fan', N('Fan-wall upgrade (EC fan arrays, both AHUs)', 'Модернізація: вентиляторні стінки (EC) для обох AHU', 'Umrüstung auf Fan-Wall (EC-Ventilatorgruppen, beide Geräte)', 'Ombouw naar fan-wall (EC-ventilatorgroepen, beide LBK)', 'Mise à niveau mur de ventilateurs (EC, les deux CTA)', 'Mejora a pared de ventiladores (EC, ambas UTA)', 'Modernizacja: ściany wentylatorów EC (obie centrale)'),
          { install_year: 2004, condition: 3, failures_3y: 1, evidence: 'documented', replacement_cost_eur: 60000, downtime_cost_eur_h: 150, bundle: 'ahu_fanwall' }),
        A('CAL-1', 'dhw_calorifier', N('DHW calorifier (not in the bundle)', 'Бойлер ГВП (не в пакеті)', 'TWW-Speicher (nicht im Paket)', 'Boiler tapwater (niet in de bundel)', 'Ballon ECS (hors lot)', 'Acumulador ACS (fuera del paquete)', 'Zasobnik CWU (poza pakietem)'),
          { install_year: 2010, condition: 3, failures_3y: 0, evidence: 'documented', replacement_cost_eur: 15000 })
      ]); } },
    { id: 'office_12', site: 'office_12', opts: {} },
    { id: 'datacentre_8', site: 'datacentre_8', opts: { budget_cap_eur_y: 200000 } },
    { id: 'hospital_wing_10', site: 'hospital_wing_10', opts: { budget_cap_eur_y: 80000 } },
    { id: 'school_8', site: 'school_8', opts: {} }
  ];
  function presetDoc(id) {
    var p = null;
    PRESETS.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return null;
    var d = p.site ? MEPCore.presetSite(p.site) : p.build();
    return JSON.parse(JSON.stringify(d));
  }

  return {
    version: VERSION, TOOL_ID: TOOL_ID, PRESETS: PRESETS, presetDoc: presetDoc, SOURCES: SOURCES, REFRIGERANTS: REFRIGERANTS, GAS_GWP: GAS_GWP, DEFAULTS: DEFAULTS,
    gwpOf: gwpOf, normRef: normRef, refrigerantOf: refrigerantOf, hazard: hazard, creditLocal: creditLocal,
    creditedRedundancy: function (a, doc, opts) { return credited(a, doc, cfg(opts)); },
    assessAsset: function (a, doc, opts) { var o = cfg(opts); return assessAsset(a, doc, o, num(o.year) != null ? o.year : (doc && doc.site && doc.site.year) || new Date().getFullYear()); },
    plan: plan, moduleResults: moduleResults, csvRows: csvRows, CSV_COLS: CSV_COLS, genselectPayload: genselectPayload
  };
}));
