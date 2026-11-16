/* mep-spares.js — global MEPSpares: Critical Spares & Recovery engine of the tools.petrov.re MEP Maintenance package.
   For one critical part (used by N identical units on a site) it compares recovery options by expected annual cost:
     none       – no stock: every failure waits the procurement lead time
     stock      – k spares on site shared by the N units; (S-1,S) base-stock model with Poisson demand over the
                  resupply lead time (Palm's theorem; Sherbrooke, Optimal Inventory Modeling of Systems, 2004):
                  outstanding orders X ~ Poisson(mu = N*lambda*L), fill rate = P(X <= k-1), expected backorders
                  EBO(k) = sum_{x>k} (x-k) p(x); mean wait per demand = EBO / (N*lambda) (Little's law)
     dedicated  – k spares per unit kept separately (the naive alternative to pooling; shown when N > 1)
     pool       – a pool of k spares shared by M sites (same N, lambda), transfer time to this site, holding share
     agreement  – supplier agreement: guaranteed delivery time met with probability p, yearly fee
     rental     – temporary plant (chiller, generator, boiler…): mobilisation time and fee, day rate, share of the
                  load covered; hired only for the part of the wait inside the season when the function is needed
   Cost of an option per year = holding (rate × part price × units owned) + fees + event costs
                                + downtime cost × λ_tot × season share × outage hours per failure.
   Credited redundancy (tested ≤ 12 months, no common cause — D-MEP-4) turns a wait W into an outage only while the
   standby is also failed: g(W) = W − (1 − e^(−rW))/r, r = standby failure rate (constant hazard).
   Season: failures uniformly spread over the year, function needed for a share s of it → outage hours × s.
   Pure functions, no DOM, deterministic, UMD (browser global MEPSpares, node module.exports).
   Planning aid only — not a substitute for manufacturer instructions and national regulations. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MEPSpares = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
'use strict';

var VERSION = '0.2.0';
var TOOL = 'mepspares';
var HY = 8760;                 /* hours per year */
var OPTION_IDS = ['none', 'stock', 'dedicated', 'pool', 'agreement', 'rental'];
var LEVELS = ['lo', 'mid', 'hi'];
var MAX_K = 60;

/* ------------------------------------------------------------------ helpers */
function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function nn(v, d) { var x = num(v, d); return x == null ? x : Math.max(0, x); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }

/* Poisson pmf list p(0..n) for mean mu (recurrence; mu up to a few hundred is fine in double precision) */
function poissonPmf(mu, n) {
  var out = new Array(n + 1);
  if (!(mu > 0)) { for (var i = 0; i <= n; i++) out[i] = i === 0 ? 1 : 0; return out; }
  /* start in log space to avoid underflow of e^-mu for large mu */
  var lp = -mu;
  out[0] = Math.exp(lp);
  for (var x = 1; x <= n; x++) { lp += Math.log(mu) - Math.log(x); out[x] = Math.exp(lp); }
  return out;
}
/* P(X <= n) */
function poissonCdf(n, mu) {
  if (n < 0) return 0;
  var p = poissonPmf(mu, n), s = 0;
  for (var i = 0; i <= n; i++) s += p[i];
  return Math.min(1, s);
}
/* expected backorders EBO(k) = E[(X-k)+] = mu - k + sum_{x=0}^{k} (k-x) p(x) */
function ebo(k, mu) {
  if (!(mu > 0)) return 0;
  var p = poissonPmf(mu, k), s = 0;
  for (var x = 0; x <= k; x++) s += (k - x) * p[x];
  return Math.max(0, mu - k + s);
}
/* fill rate = probability a demand is met from stock on arrival = P(X <= k-1) (PASTA) */
function fillRate(k, mu) { return k <= 0 ? 0 : poissonCdf(k - 1, mu); }

/* outage hours of the function for a unit wait W (h) — identity without credited redundancy */
function outageOf(W, red) {
  if (!(W > 0)) return 0;
  if (!red || !red.credited) return W;
  var r = nn(red.partner_rate_y, 0) / HY;
  if (!(r > 0)) return 0;
  var x = r * W;
  /* W - (1 - e^-x)/r, series for small x to keep precision */
  if (x < 1e-6) return r * W * W / 2;
  return W - (1 - Math.exp(-x)) / r;
}

/* ------------------------------------------------------------------ input normalisation */
var DEFAULT_CASE = {
  part: '', asset_id: null, asset_class: null, fm_id: null,
  units: 1, rate_y: [0.05, 0.1, 0.2], part_cost_eur: 1000, lead_time_days: 56, fit_h: 8, obsolete: false,
  downtime_cost_eur_h: 500, tolerable_downtime_h: 24, season_share: 1,
  redundancy: { credited: false, partner_rate_y: 0.2 },
  holding_rate: 0.25,
  options: {
    none: { enabled: true },
    stock: { enabled: true, k: 'auto', store_h: 1, service_target: 0.95, enforce_service: true, kmax: null },
    dedicated: { enabled: true, k_per_unit: 1, store_h: 0.5 },
    pool: { enabled: false, sites: 3, k: 1, transfer_h: 24, share: null },
    agreement: { enabled: false, fee_eur_y: 1000, delivery_h: 48, p_on_time: 0.95 },
    rental: { enabled: false, mobilise_h: 48, mobilise_eur: 2500, day_eur: 300, cover: 1, retainer_eur_y: 0 }
  }
};

function normalise(c) {
  c = isObj(c) ? c : {};
  var d = DEFAULT_CASE, o = isObj(c.options) ? c.options : {};
  var rate = Array.isArray(c.rate_y) ? c.rate_y.slice(0, 3) : (typeof c.rate_y === 'number' ? [c.rate_y, c.rate_y, c.rate_y] : d.rate_y.slice());
  rate = rate.map(function (v, i) { return nn(v, d.rate_y[i]); });
  while (rate.length < 3) rate.push(rate[rate.length - 1] != null ? rate[rate.length - 1] : 0.1);
  var sorted = rate.slice().sort(function (a, b) { return a - b; });
  function opt(id) {
    var src = isObj(o[id]) ? o[id] : {}, def = d.options[id], out = {};
    Object.keys(def).forEach(function (k) { out[k] = src[k] !== undefined ? src[k] : def[k]; });
    out.enabled = src.enabled !== undefined ? !!src.enabled : def.enabled;
    return out;
  }
  var st = opt('stock'), de = opt('dedicated'), po = opt('pool'), ag = opt('agreement'), re = opt('rental');
  var red = isObj(c.redundancy) ? c.redundancy : {};
  var n = {
    part: typeof c.part === 'string' ? c.part.slice(0, 200) : '',
    asset_id: typeof c.asset_id === 'string' ? c.asset_id : null,
    asset_class: typeof c.asset_class === 'string' ? c.asset_class : null,
    fm_id: typeof c.fm_id === 'string' ? c.fm_id : null,
    units: Math.max(1, Math.round(nn(c.units, 1)) || 1),
    rate_y: sorted,
    part_cost_eur: nn(c.part_cost_eur, d.part_cost_eur),
    lead_time_days: nn(c.lead_time_days, d.lead_time_days),
    fit_h: nn(c.fit_h, d.fit_h),
    obsolete: !!c.obsolete,
    downtime_cost_eur_h: (typeof c.downtime_cost_eur_h === 'number' && isFinite(c.downtime_cost_eur_h)) ? Math.max(0, c.downtime_cost_eur_h) : null,
    tolerable_downtime_h: (typeof c.tolerable_downtime_h === 'number' && isFinite(c.tolerable_downtime_h)) ? Math.max(0, c.tolerable_downtime_h) : null,
    season_share: clamp(num(c.season_share, 1), 0, 1),
    redundancy: { credited: !!red.credited, partner_rate_y: nn(red.partner_rate_y, d.redundancy.partner_rate_y) },
    holding_rate: clamp(num(c.holding_rate, d.holding_rate), 0, 2),
    options: {
      none: { enabled: true },
      stock: { enabled: !!st.enabled, k: (st.k === 'auto' || st.k == null || st.k === '') ? 'auto' : Math.max(1, Math.min(MAX_K, Math.round(nn(+st.k, 1)))),
               store_h: nn(st.store_h, 1), service_target: clamp(num(st.service_target, 0.95), 0, 0.999999),
               enforce_service: st.enforce_service !== false, kmax: st.kmax == null ? null : Math.max(1, Math.min(MAX_K, Math.round(nn(st.kmax, 6)))) },
      dedicated: { enabled: !!de.enabled, k_per_unit: Math.max(1, Math.min(MAX_K, Math.round(nn(de.k_per_unit, 1)))), store_h: nn(de.store_h, 0.5) },
      pool: { enabled: !!po.enabled, sites: Math.max(1, Math.round(nn(po.sites, 3))), k: Math.max(0, Math.min(MAX_K, Math.round(nn(po.k, 1)))),
              transfer_h: nn(po.transfer_h, 24), share: (typeof po.share === 'number' && isFinite(po.share)) ? clamp(po.share, 0, 1) : null },
      agreement: { enabled: !!ag.enabled, fee_eur_y: nn(ag.fee_eur_y, 0), delivery_h: nn(ag.delivery_h, 48), p_on_time: clamp(num(ag.p_on_time, 0.95), 0, 1) },
      rental: { enabled: !!re.enabled, mobilise_h: nn(re.mobilise_h, 48), mobilise_eur: nn(re.mobilise_eur, 0), day_eur: nn(re.day_eur, 0),
                cover: clamp(num(re.cover, 1), 0, 1), retainer_eur_y: nn(re.retainer_eur_y, 0) }
    }
  };
  return n;
}

/* ------------------------------------------------------------------ core evaluation at one demand rate */
/* two-point outage for a stock-type option: fill → W0; otherwise W0 + conditional backorder delay */
function stockOutage(W0, fill, meanDelay, red) {
  if (fill >= 1 || !(meanDelay > 0)) return outageOf(W0, red);
  var condDelay = meanDelay / Math.max(1e-12, 1 - fill);
  return fill * outageOf(W0, red) + (1 - fill) * outageOf(W0 + condDelay, red);
}

function stockAt(k, c, lam, W0) {
  var Ly = c.lead_time_days / 365, lt = c.units * lam, mu = lt * Ly;
  var fill = fillRate(k, mu), e = ebo(k, mu);
  var meanDelay = lt > 0 ? HY * e / lt : 0;
  return { k: k, mu: mu, fill: k === 0 ? 0 : fill, ebo: e, mean_delay_h: meanDelay,
           recovery_h: W0 + meanDelay, outage_h_event: stockOutage(W0, k === 0 ? 0 : fill, meanDelay, c.redundancy) };
}

function money(c, lt, outageEvent, holding, fees, events) {
  var dh = lt * c.season_share * outageEvent;
  var D = c.downtime_cost_eur_h;
  var de = D == null ? null : D * dh;
  return { holding_eur_y: holding, fee_eur_y: fees, event_eur_y: events, downtime_h_y: dh, downtime_eur_y: de,
           total_eur_y: (D == null ? 0 : de) + holding + fees + events, priced: D != null };
}

/* evaluate all options for demand rate lam (per unit per year); kStock = on-site stock level used by option 'stock' */
function optionsAt(c, lam, kStock) {
  var out = {}, lt = c.units * lam, L_h = c.lead_time_days * 24, hc = c.holding_rate * c.part_cost_eur;
  var Wnone = c.fit_h + L_h;
  /* none */
  var oNone = outageOf(Wnone, c.redundancy);
  out.none = Object.assign({ id: 'none', units_owned: 0, recovery_h: Wnone, recovery_worst_h: Wnone, p_long_wait: 1, fill: 0, outage_h_event: oNone },
                           money(c, lt, oNone, 0, 0, 0));
  /* stock k on site */
  var so = c.options.stock, W0 = c.fit_h + so.store_h;
  var s = stockAt(kStock, c, lam, W0);
  out.stock = Object.assign({ id: 'stock', k: kStock, units_owned: kStock, recovery_h: s.recovery_h, recovery_worst_h: W0 + L_h,
                              p_long_wait: 1 - s.fill, fill: s.fill, ebo: s.ebo, mu: s.mu, outage_h_event: s.outage_h_event },
                            money(c, lt, s.outage_h_event, hc * kStock, 0, 0));
  /* dedicated: k per unit, N separate stores */
  var dd = c.options.dedicated, kd = dd.k_per_unit, Wd = c.fit_h + dd.store_h;
  var muU = lam * c.lead_time_days / 365, fillU = fillRate(kd, muU), eU = ebo(kd, muU), delU = lam > 0 ? HY * eU / lam : 0;
  var oD = stockOutage(Wd, fillU, delU, c.redundancy);
  out.dedicated = Object.assign({ id: 'dedicated', k: kd * c.units, k_per_unit: kd, units_owned: kd * c.units, recovery_h: Wd + delU, recovery_worst_h: Wd + L_h,
                                  p_long_wait: 1 - fillU, fill: fillU, ebo: eU * c.units, mu: muU, outage_h_event: oD },
                                money(c, lt, oD, hc * kd * c.units, 0, 0));
  /* pool across M sites */
  var po = c.options.pool, M = po.sites, kp = po.k, Wp0 = c.fit_h + po.transfer_h;
  var muP = M * lt * c.lead_time_days / 365, fillP = fillRate(kp, muP), eP = ebo(kp, muP), delP = lt > 0 ? HY * eP / (M * lt) : 0;
  var share = po.share != null ? po.share : 1 / M;
  var oP = stockOutage(Wp0, kp === 0 ? 0 : fillP, delP, c.redundancy);
  out.pool = Object.assign({ id: 'pool', k: kp, sites: M, share: share, units_owned: kp * share, recovery_h: Wp0 + delP, recovery_worst_h: Wp0 + L_h,
                             p_long_wait: kp === 0 ? 1 : 1 - fillP, fill: kp === 0 ? 0 : fillP, ebo: eP, mu: muP, outage_h_event: oP },
                           money(c, lt, oP, hc * kp * share, 0, 0));
  /* supplier agreement */
  var ag = c.options.agreement, Wa = c.fit_h + ag.delivery_h, p = ag.p_on_time;
  var oA = p * outageOf(Wa, c.redundancy) + (1 - p) * outageOf(Wnone, c.redundancy);
  out.agreement = Object.assign({ id: 'agreement', units_owned: 0, recovery_h: p * Wa + (1 - p) * Wnone, recovery_worst_h: Wnone,
                                  p_long_wait: 1 - p, fill: p, outage_h_event: oA },
                                money(c, lt, oA, 0, ag.fee_eur_y, 0));
  /* rental / temporary plant: restores the function after mobilisation, permanent repair waits the lead time */
  var re = c.options.rental, m = re.mobilise_h, used = m < Wnone, sS = c.season_share;
  var oR, ev = 0, recR;
  if (used) {
    oR = outageOf(m, c.redundancy) + (1 - re.cover) * (outageOf(Wnone, c.redundancy) - outageOf(m, c.redundancy));
    var pOverlap = sS <= 0 ? 0 : (sS >= 1 ? 1 : Math.min(1, sS + Wnone / HY));
    var hireDays = sS * Math.max(0, Wnone - m) / 24;
    ev = lt * (re.mobilise_eur * pOverlap + re.day_eur * hireDays);
    recR = m;
  } else { oR = oNone; recR = Wnone; }
  out.rental = Object.assign({ id: 'rental', units_owned: 0, used: used, recovery_h: recR, recovery_worst_h: Wnone,
                               p_long_wait: used ? 0 : 1, fill: used ? 1 : 0, outage_h_event: oR },
                             money(c, lt, oR, 0, re.retainer_eur_y, ev));
  return out;
}

/* stock cost curve k = 0..kmax at rate lam */
function curveAt(c, lam, kmax) {
  var rows = [], lt = c.units * lam, hc = c.holding_rate * c.part_cost_eur;
  var W0 = c.fit_h + c.options.stock.store_h;
  for (var k = 0; k <= kmax; k++) {
    var s = k === 0 ? { fill: 0, ebo: lt * c.lead_time_days / 365, mean_delay_h: c.lead_time_days * 24, recovery_h: c.fit_h + c.lead_time_days * 24,
                         outage_h_event: outageOf(c.fit_h + c.lead_time_days * 24, c.redundancy), mu: lt * c.lead_time_days / 365 }
                    : stockAt(k, c, lam, W0);
    var m = money(c, lt, s.outage_h_event, hc * k, 0, 0);
    rows.push({ k: k, fill: s.fill, ebo: s.ebo, recovery_h: s.recovery_h, holding_eur_y: m.holding_eur_y,
                downtime_eur_y: m.downtime_eur_y, downtime_h_y: m.downtime_h_y, total_eur_y: m.total_eur_y });
  }
  return rows;
}

function autoKmax(c) {
  var mu = c.units * c.rate_y[2] * c.lead_time_days / 365;
  return Math.max(3, Math.min(MAX_K, Math.ceil(mu + 4 * Math.sqrt(mu) + 2)));
}

/* service-level stock: smallest k >= 1 with fill >= target (null when not reached up to MAX_K) */
function serviceK(c, lam, target) {
  var mu = c.units * lam * c.lead_time_days / 365;
  for (var k = 1; k <= MAX_K; k++) if (fillRate(k, mu) >= target) return k;
  return null;
}

/* ------------------------------------------------------------------ main entry */
function evaluate(input) {
  var c = normalise(input);
  var lamMid = c.rate_y[1];
  /* economic optimum among k >= 1 (mid): the expected cost is convex in k (EBO convex, holding linear), so the
     first local minimum is the global one; scan up to MAX_K so a very expensive outage is never cut off */
  var full = curveAt(c, lamMid, MAX_K), kOpt = 1;
  while (kOpt < MAX_K && full[kOpt + 1].total_eur_y < full[kOpt].total_eur_y - 1e-9 * Math.max(1, full[kOpt].total_eur_y)) kOpt++;
  var kSvc = serviceK(c, lamMid, c.options.stock.service_target);
  var kmax = c.options.stock.kmax || Math.min(MAX_K, Math.max(autoKmax(c), kOpt + 1, kSvc || 0));
  var curve = { mid: full.slice(0, kmax + 1), lo: curveAt(c, c.rate_y[0], kmax), hi: curveAt(c, c.rate_y[2], kmax) };
  var kStock;
  if (c.options.stock.k !== 'auto') kStock = c.options.stock.k;
  else kStock = (c.options.stock.enforce_service && kSvc != null) ? Math.max(kOpt, kSvc) : kOpt;
  if (c.downtime_cost_eur_h == null && c.options.stock.k === 'auto') kStock = kSvc != null ? kSvc : 1;

  var at = {};
  LEVELS.forEach(function (lv, i) { at[lv] = optionsAt(c, c.rate_y[i], kStock); });

  var rows = OPTION_IDS.map(function (id) {
    var r = clone(at.mid[id]);
    r.kind = id;
    r.enabled = id === 'none' ? true : !!c.options[id].enabled;
    if (id === 'dedicated' && c.units < 2) r.enabled = false;
    r.lo = { total_eur_y: at.lo[id].total_eur_y, downtime_h_y: at.lo[id].downtime_h_y };
    r.hi = { total_eur_y: at.hi[id].total_eur_y, downtime_h_y: at.hi[id].downtime_h_y };
    r.reasons = [];
    r.feasible = r.enabled;
    /* probability that a failure event becomes a loss of function (credited redundancy: standby fails during the mean wait) */
    var rr = c.redundancy.credited ? c.redundancy.partner_rate_y / HY : null;
    r.p_loss_event = rr == null ? 1 : 1 - Math.exp(-rr * r.recovery_h);
    if (id === 'rental' && !r.used) { r.feasible = false; r.reasons.push('rental_slower'); }
    if (c.obsolete && (id === 'agreement')) { r.feasible = false; r.reasons.push('no_supply_obsolete'); }
    if (c.obsolete && (id === 'stock' || id === 'dedicated' || id === 'pool')) r.reasons.push('last_time_buy');
    if (c.tolerable_downtime_h != null && !c.redundancy.credited && r.recovery_h > c.tolerable_downtime_h + 1e-9) r.reasons.push('exceeds_tolerable');
    return r;
  });

  var feasible = rows.filter(function (r) { return r.feasible; });
  var priced = c.downtime_cost_eur_h != null;
  function pickBest(level) {
    var pool = feasible.slice();
    if (!priced) {
      /* consequence not priced: cheapest option that meets the tolerable downtime, else the fastest */
      var tol = c.tolerable_downtime_h;
      var ok = tol == null ? [] : pool.filter(function (r) { return r.recovery_h <= tol + 1e-9; });
      if (ok.length) pool = ok;
      else { var minRec = Math.min.apply(null, pool.map(function (r) { return r.recovery_h; })); pool = pool.filter(function (r) { return r.recovery_h <= minRec + 1e-9; }); }
    }
    pool.sort(function (a, b) {
      var ta = level === 'mid' ? a.total_eur_y : a[level].total_eur_y, tb = level === 'mid' ? b.total_eur_y : b[level].total_eur_y;
      if (Math.abs(ta - tb) > 1e-6 * Math.max(1, Math.abs(ta), Math.abs(tb))) return ta - tb;
      if (Math.abs(a.recovery_h - b.recovery_h) > 1e-9) return a.recovery_h - b.recovery_h;
      return OPTION_IDS.indexOf(a.id) - OPTION_IDS.indexOf(b.id);
    });
    return pool[0] || null;
  }
  var bMid = pickBest('mid'), bLo = pickBest('lo'), bHi = pickBest('hi');
  var fragile = !!(bMid && ((bLo && bLo.id !== bMid.id) || (bHi && bHi.id !== bMid.id)));
  var ranked = feasible.slice().sort(function (a, b) { return a.total_eur_y - b.total_eur_y || a.recovery_h - b.recovery_h; }).map(function (r) { return r.id; });
  if (bMid) { ranked.splice(ranked.indexOf(bMid.id), 1); ranked.unshift(bMid.id); }
  rows.filter(function (r) { return !r.feasible; }).forEach(function (r) { ranked.push(r.id); });

  var noneRow = rows[0];
  var reasons = [];
  if (!priced) reasons.push('unpriced_consequence');
  if (c.obsolete) reasons.push('obsolete_handoff');
  if (c.redundancy.credited) reasons.push('redundancy_credited');
  if (fragile) reasons.push('fragile');
  if (bMid && c.tolerable_downtime_h != null && !c.redundancy.credited && bMid.recovery_h > c.tolerable_downtime_h + 1e-9) reasons.push('best_exceeds_tolerable');
  var svcCost = null;
  if (kSvc != null && curve.mid[kSvc]) svcCost = curve.mid[kSvc].total_eur_y;
  else if (kSvc != null) svcCost = curveAt(c, lamMid, kSvc)[kSvc].total_eur_y;
  if (kSvc != null && kSvc > kOpt && priced) reasons.push('service_target_above_optimum');

  var lt = c.units * lamMid;
  return {
    version: VERSION, input: c,
    lambda_total_y: { lo: c.units * c.rate_y[0], mid: lt, hi: c.units * c.rate_y[2] },
    lead_demand_mu: lt * c.lead_time_days / 365,
    consumption_eur_y: lt * c.part_cost_eur,
    k: { stock: kStock, optimum: kOpt, service: kSvc, kmax: kmax, service_target: c.options.stock.service_target, service_cost_eur_y: svcCost },
    curve: curve,
    rows: rows,
    ranked: ranked,
    best: bMid ? bMid.id : null,
    best_lo: bLo ? bLo.id : null,
    best_hi: bHi ? bHi.id : null,
    fragile: fragile,
    saving_vs_none_eur_y: (bMid && priced) ? noneRow.total_eur_y - bMid.total_eur_y : null,
    reasons: reasons,
    handoff: c.obsolete ? ltbHandoff(c, kStock) : null
  };
}

/* state for obsolescenceltb (its permalink state is merged with its own defaults on the receiving side) */
function ltbHandoff(c, k) {
  return {
    tool: 'obsolescenceltb',
    state: {
      component: (c.part || 'part') + (c.asset_id ? ' (' + c.asset_id + ')' : ''),
      fleetCount: c.units,
      criticality: c.downtime_cost_eur_h == null ? 'safety' : 'high',
      supplierStatus: 'discontinued',
      demandModel: 'poisson', rateSource: 'entered', annualRate: c.rate_y[1], rateBasis: 'asset',
      stationary: true, independent: true,
      stock: 0, leadYears: Math.round(c.lead_time_days / 365 * 1000) / 1000,
      targetCoverage: Math.min(0.99, Math.max(0.5, c.options.stock.service_target))
    },
    note: 'k_economic=' + k
  };
}

/* ------------------------------------------------------------------ register screening */
/* Redundancy credit (D-MEP-10): one rule for the package = MEPCore.creditedRedundancy(asset, register) (crit peer rule:
   a common-cause tag blocks credit only when a peer of the same class and same `serves` carries it too; without a peer
   every declared tag counts; standby tested within 12 months). localCredit is the identical fallback while mep-core
   lacks it. When modules.mepcriticality.results are in use (the page's "Use"), their credited_redundancy wins. */
var TEST_WINDOW_MONTHS = 12;
function ccTags(a) {
  return Array.isArray(a && a.common_cause) ? a.common_cause.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean) : [];
}
function localCredit(asset, register) {
  var a = isObj(asset) ? asset : {};
  var red = (a.redundancy === 'N+1' || a.redundancy === '2N') ? a.redundancy : 'none';
  var out = { credited: false, reason: 'no_redundancy', reasons: [], shared_tags: [], peers: [], peer_rule: 'no_peer_all_tags' };
  if (red === 'none') return out;
  var list = register && Array.isArray(register.assets) ? register.assets : [];
  var peers = list.filter(function (b) {
    return isObj(b) && b !== asset && !(a.id != null && b.id === a.id) && b['class'] === a['class'] && b.serves === a.serves;
  });
  var tags = ccTags(a), shared = tags;
  if (peers.length) {
    var peerTags = [];
    peers.forEach(function (b) { ccTags(b).forEach(function (t) { if (peerTags.indexOf(t) < 0) peerTags.push(t); }); });
    shared = tags.filter(function (t) { return peerTags.indexOf(t) >= 0; });
    out.peer_rule = 'peer';
  }
  out.peers = peers.map(function (b) { return b.id; });
  out.shared_tags = shared.filter(function (t, i) { return shared.indexOf(t) === i; });
  var tm = (typeof a.reserve_tested_months === 'number' && isFinite(a.reserve_tested_months)) ? a.reserve_tested_months : null;
  if (tm === null) out.reasons.push('reserve_test_unknown');
  else if (tm > TEST_WINDOW_MONTHS) out.reasons.push('reserve_test_stale');
  if (out.shared_tags.length) out.reasons.push('common_cause');
  out.credited = out.reasons.length === 0;
  out.reason = out.credited ? 'credited' : out.reasons[0];
  return out;
}
function creditedFromAsset(asset, doc, opts, core) {
  var useCrit = !(opts && opts.useCrit === false);
  var cr = useCrit && doc && isObj(doc.modules) && isObj(doc.modules.mepcriticality) && isObj(doc.modules.mepcriticality.results)
    ? doc.modules.mepcriticality.results[asset.id] : null;
  if (cr && typeof cr.credited_redundancy === 'boolean') return { credited: cr.credited_redundancy, source: 'mepcriticality', rule: 'mepcriticality', why: cr.credited_redundancy ? [] : ['per_mepcriticality'], shared_tags: [] };
  var c = core || (typeof globalThis !== 'undefined' ? globalThis.MEPCore : null), r = null, rule = 'local';
  if (c && typeof c.creditedRedundancy === 'function') { try { r = c.creditedRedundancy(asset, doc); rule = 'core'; } catch (e) { r = null; } }
  if (!r || typeof r.credited !== 'boolean') { r = localCredit(asset, doc); rule = 'local'; }
  return { credited: r.credited, source: 'rule', rule: rule, why: (r.reasons || []).slice(), shared_tags: (r.shared_tags || []).slice() };
}

/* class failure rate (sum over failure modes of 1/MTBF), [lo, mid, hi] per year — from the class library */
function classRate(core, cls) {
  var c = core && core.CLASSES ? core.CLASSES[cls] : null;
  if (!c || !Array.isArray(c.failure_modes)) return null;
  var r = [0, 0, 0], any = false;
  c.failure_modes.forEach(function (f) {
    if (!Array.isArray(f.mtbf_y)) return;
    any = true;
    /* low rate from the high MTBF and vice versa */
    r[0] += 1 / Math.max(1e-6, f.mtbf_y[2]); r[1] += 1 / Math.max(1e-6, f.mtbf_y[1]); r[2] += 1 / Math.max(1e-6, f.mtbf_y[0]);
  });
  return any ? r : null;
}

/* screen(doc, core, opts) -> rows per asset: recovery without any provision vs tolerable downtime.
   opts.useCrit === false ignores modules.mepcriticality (the page applies it only after the user's "Use"). */
function screen(doc, core, opts) {
  var useCrit = !(opts && opts.useCrit === false);
  var assets = doc && Array.isArray(doc.assets) ? doc.assets : [];
  var crit = useCrit && doc && isObj(doc.modules) && isObj(doc.modules.mepcriticality) && isObj(doc.modules.mepcriticality.results) ? doc.modules.mepcriticality.results : {};
  var rows = assets.map(function (a) {
    var res = core && core.register && core.register.resolved ? core.register.resolved(a) : null;
    var lead = res ? res.lead_time_days : { value: num(a.lead_time_days, null), source: a.lead_time_days != null ? 'user' : 'unknown' };
    var mttr = res ? res.mttr_h : { value: num(a.mttr_h, null), source: a.mttr_h != null ? 'user' : 'unknown' };
    var cred = creditedFromAsset(a, doc, opts, core);
    var tol = num(a.tolerable_downtime_h, null), D = num(a.downtime_cost_eur_h, null);
    var rec = lead.value != null ? lead.value * 24 + (mttr.value != null ? mttr.value : 0) : null;
    var gap = (rec != null && tol != null) ? rec - tol : null;
    var flags = [];
    if (rec == null) flags.push('lead_time_unknown');
    if (tol == null) flags.push('tolerable_unknown');
    if (D == null) flags.push('downtime_cost_unknown');
    if (gap != null && gap > 0 && !cred.credited) flags.push('recovery_gap');
    if (cred.credited) flags.push('redundancy_credited');
    if (lead.source === 'class_typical') flags.push('lead_time_typical');
    if (/discontinu|obsolete|end of life|EOL/i.test(String(a.notes || ''))) flags.push('obsolete_hint');
    var cr = crit[a.id] || null;
    var exposure = (D != null && rec != null && !cred.credited) ? D * rec : null;
    return {
      id: a.id, 'class': a['class'], name: a.name || '', crit_class: cr && cr['class'] ? cr['class'] : null,
      lead_time_days: lead.value, lead_source: lead.source, mttr_h: mttr.value, mttr_source: mttr.source,
      recovery_no_provision_h: rec, tolerable_downtime_h: tol, gap_h: gap, downtime_cost_eur_h: D,
      exposure_per_event_eur: exposure, credited_redundancy: cred.credited, credit_source: cred.source, credit_rule: cred.rule, credit_why: cred.why, shared_tags: cred.shared_tags,
      class_rate_y: classRate(core, a['class']), flags: flags,
      needs_decision: flags.indexOf('recovery_gap') >= 0 || flags.indexOf('obsolete_hint') >= 0
    };
  });
  var order = { A: 0, B: 1, C: 2 };
  rows.sort(function (x, y) {
    if (x.needs_decision !== y.needs_decision) return x.needs_decision ? -1 : 1;
    var cx = x.crit_class != null ? order[x.crit_class] : 3, cy = y.crit_class != null ? order[y.crit_class] : 3;
    if (cx !== cy) return cx - cy;
    var ex = x.exposure_per_event_eur != null ? x.exposure_per_event_eur : -1, ey = y.exposure_per_event_eur != null ? y.exposure_per_event_eur : -1;
    if (ex !== ey) return ey - ex;
    return String(x.id).localeCompare(String(y.id));
  });
  return { rows: rows, needs_decision: rows.filter(function (r) { return r.needs_decision; }).map(function (r) { return r.id; }) };
}

/* case prefilled from a register asset: consequence side from the register, part side stays the user's */
function caseFromAsset(asset, doc, core, base, opts) {
  var c = normalise(base || DEFAULT_CASE);
  if (!asset) return c;
  var res = core && core.register && core.register.resolved ? core.register.resolved(asset) : null;
  c.asset_id = asset.id; c.asset_class = asset['class'] || null;
  if (typeof asset.downtime_cost_eur_h === 'number') c.downtime_cost_eur_h = asset.downtime_cost_eur_h; else c.downtime_cost_eur_h = null;
  if (typeof asset.tolerable_downtime_h === 'number') c.tolerable_downtime_h = asset.tolerable_downtime_h; else c.tolerable_downtime_h = null;
  if (res && res.mttr_h && res.mttr_h.value != null) c.fit_h = res.mttr_h.value;
  var cred = creditedFromAsset(asset, doc, opts, core);
  c.redundancy.credited = cred.credited;
  var cr = classRate(core, asset['class']);
  if (cr) c.redundancy.partner_rate_y = cr[1];
  return { 'case': c, provenance: { downtime: typeof asset.downtime_cost_eur_h === 'number' ? 'user' : 'unknown',
                                    tolerable: typeof asset.tolerable_downtime_h === 'number' ? 'user' : 'unknown',
                                    fit_h: res && res.mttr_h ? res.mttr_h.source : 'unknown',
                                    redundancy: cred.source, redundancy_why: cred.why, partner_rate: cr ? 'class_typical' : 'default' } };
}

/* compact result for modules.mepspares.results[key] */
function toModuleResult(r) {
  var b = r.rows.filter(function (x) { return x.id === r.best; })[0] || null;
  return {
    part: r.input.part, asset_id: r.input.asset_id, best: r.best, fragile: r.fragile, obsolete: r.input.obsolete,
    stock_k: r.k.stock, k_optimum: r.k.optimum, k_service: r.k.service, service_target: r.k.service_target,
    total_eur_y: b ? b.total_eur_y : null, recovery_h: b ? b.recovery_h : null,
    none_total_eur_y: r.rows[0].total_eur_y, saving_vs_none_eur_y: r.saving_vs_none_eur_y,
    options: r.rows.filter(function (x) { return x.feasible; }).map(function (x) { return { id: x.id, total_eur_y: x.total_eur_y, recovery_h: x.recovery_h }; }),
    reasons: r.reasons.slice(), engine: 'MEPSpares ' + VERSION
  };
}

/* ------------------------------------------------------------------ presets (numbers = learning assumptions) */
function P(id, site, assetId, kase) { return { id: id, site: site, asset_id: assetId, 'case': kase }; }
var PRESETS = [
  /* cheap part, 16-week lead time, class-A chiller (no credited standby) */
  P('chiller_board', 'datacentre_8', null, {
    part: 'Chiller controller / EXV driver board', asset_class: 'chiller_water', units: 1, rate_y: [0.05, 0.1, 0.2], part_cost_eur: 450,
    lead_time_days: 112, fit_h: 6, downtime_cost_eur_h: 2000, tolerable_downtime_h: 8, season_share: 1,
    redundancy: { credited: false, partner_rate_y: 0.5 }, holding_rate: 0.25,
    options: { stock: { enabled: true, k: 'auto', store_h: 1, service_target: 0.95, enforce_service: true },
               dedicated: { enabled: false }, pool: { enabled: false },
               agreement: { enabled: true, fee_eur_y: 2500, delivery_h: 72, p_on_time: 0.9 },
               rental: { enabled: true, mobilise_h: 36, mobilise_eur: 6000, day_eur: 900, cover: 1, retainer_eur_y: 0 } } }),
  /* expensive whole-unit spare on a 2N system: not worth stocking */
  P('tx_2n', 'hospital_wing_10', null, {
    part: 'Spare MV/LV transformer 1600 kVA', asset_class: 'transformer', units: 2, rate_y: [0.004, 0.01, 0.02], part_cost_eur: 90000,
    lead_time_days: 280, fit_h: 48, downtime_cost_eur_h: 6000, tolerable_downtime_h: 0.05, season_share: 1,
    redundancy: { credited: true, partner_rate_y: 0.01 }, holding_rate: 0.15,
    options: { stock: { enabled: true, k: 1, store_h: 0, service_target: 0.95, enforce_service: false },
               dedicated: { enabled: false }, pool: { enabled: true, sites: 4, k: 1, transfer_h: 72, share: null },
               agreement: { enabled: false }, rental: { enabled: true, mobilise_h: 72, mobilise_eur: 25000, day_eur: 800, cover: 1, retainer_eur_y: 0 } } }),
  /* boiler: rental beats a spare when the function matters only in the heating season */
  P('boiler_rental', 'school_8', 'BLR-01', {
    part: 'Boiler heat exchanger (whole boiler swap if beyond repair)', asset_class: 'boiler_gas', units: 1, rate_y: [0.05, 0.1, 0.2], part_cost_eur: 30000,
    lead_time_days: 60, fit_h: 24, downtime_cost_eur_h: 300, tolerable_downtime_h: 24, season_share: 0.55,
    redundancy: { credited: false, partner_rate_y: 0.2 }, holding_rate: 0.2,
    options: { stock: { enabled: true, k: 'auto', store_h: 2, service_target: 0.95, enforce_service: false },
               dedicated: { enabled: false }, pool: { enabled: false }, agreement: { enabled: false },
               rental: { enabled: true, mobilise_h: 24, mobilise_eur: 2500, day_eur: 180, cover: 1, retainer_eur_y: 0 } } }),
  /* pooled spare for 5 identical AHUs */
  P('ahu_pool', 'office_12', null, {
    part: 'EC fan module (identical in 5 AHUs)', asset_class: 'ahu', units: 5, rate_y: [0.04, 0.08, 0.15], part_cost_eur: 2500,
    lead_time_days: 42, fit_h: 4, downtime_cost_eur_h: 150, tolerable_downtime_h: 24, season_share: 1,
    redundancy: { credited: false, partner_rate_y: 0.3 }, holding_rate: 0.25,
    options: { stock: { enabled: true, k: 'auto', store_h: 1, service_target: 0.95, enforce_service: true },
               dedicated: { enabled: true, k_per_unit: 1, store_h: 0.5 }, pool: { enabled: false },
               agreement: { enabled: true, fee_eur_y: 1500, delivery_h: 48, p_on_time: 0.9 }, rental: { enabled: false } } }),
  /* obsolete fire alarm panel card: the question becomes a last-time buy */
  P('fa_obsolete', 'school_8', 'FA-01', {
    part: 'Fire alarm panel loop card (discontinued)', asset_class: 'fire_alarm', units: 6, rate_y: [0.03, 0.06, 0.12], part_cost_eur: 400,
    lead_time_days: 120, fit_h: 3, downtime_cost_eur_h: null, tolerable_downtime_h: 0, obsolete: true, season_share: 1,
    redundancy: { credited: false, partner_rate_y: 0.1 }, holding_rate: 0.25,
    options: { stock: { enabled: true, k: 'auto', store_h: 1, service_target: 0.95, enforce_service: true },
               dedicated: { enabled: false }, pool: { enabled: false },
               agreement: { enabled: true, fee_eur_y: 800, delivery_h: 24, p_on_time: 0.9 }, rental: { enabled: false } } }),
  /* UPS modules: a pool shared by three hospital sites vs own stock vs an OEM agreement */
  P('ups_pool', 'hospital_wing_10', 'UPS-OT', {
    part: 'UPS power module 20 kW', asset_class: 'ups', units: 2, rate_y: [0.02, 0.05, 0.1], part_cost_eur: 7000,
    lead_time_days: 35, fit_h: 1, downtime_cost_eur_h: 10000, tolerable_downtime_h: 0.001, season_share: 1,
    redundancy: { credited: true, partner_rate_y: 0.05 }, holding_rate: 0.2,
    options: { stock: { enabled: true, k: 'auto', store_h: 0.5, service_target: 0.95, enforce_service: false },
               dedicated: { enabled: false }, pool: { enabled: true, sites: 3, k: 1, transfer_h: 6, share: null },
               agreement: { enabled: true, fee_eur_y: 3000, delivery_h: 8, p_on_time: 0.95 }, rental: { enabled: false } } })
];

return {
  VERSION: VERSION, version: VERSION, TOOL: TOOL, OPTION_IDS: OPTION_IDS.slice(), DEFAULT_CASE: clone(DEFAULT_CASE), PRESETS: PRESETS,
  evaluate: evaluate, normalise: normalise, screen: screen, caseFromAsset: caseFromAsset, toModuleResult: toModuleResult,
  creditedFromAsset: creditedFromAsset, localCredit: localCredit, classRate: classRate, ltbHandoff: ltbHandoff,
  /* math, exposed for tests and the bench */
  poissonPmf: poissonPmf, poissonCdf: poissonCdf, ebo: ebo, fillRate: fillRate, outageOf: outageOf, curveAt: function (c, lam, kmax) { return curveAt(normalise(c), lam, kmax); }
};
});
