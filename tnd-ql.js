/* tnd-ql.js — engine of quotelevel.html (Subcontractor & Supplier Quote Levelling), tools.petrov.re Tendering & Contracts.
   Pure functions, no DOM, UMD (browser global TndQl, node require).
   Bid levelling (bid tabulation) as estimators practise it: every quote is brought to the same scope and the same delivery basis
   before prices are compared. Levelled cost L = price in EUR + priced options + plugs for excluded / unclear scope items
   + logistics the buyer still pays under the quote's Incoterms 2020 rule up to "landed on site, import cleared, unloaded"
   + financing of an advance payment + stated commercial adjustments. Customs value for the duty = price + buyer-paid costs of
   transport and insurance up to the entry into the Union (Union Customs Code, Reg. (EU) 952/2013 art. 70–71); on-carriage and
   unloading inside the Union are not part of it. Cost split per Incoterms rule follows the structure of ICC Incoterms 2020
   (rule names and who pays which leg, in our own words). Plug policy, unclear factor, financing rate and logistics values are
   stated estimator assumptions, editable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TndQl = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.1.0';
  var STATUS = ['inc', 'exc', 'unc', 'opt'];
  var POLICIES = ['allowance', 'max', 'mean'];
  var ELEMENTS = ['load', 'pre', 'main', 'ins', 'imp', 'onc', 'unload'];
  /* legs the SELLER pays under each rule (named place of C and D rules of any mode = the site; CFR/CIF are sea rules ending at the port of destination;
     FCA at the seller's premises). 'site' = delivered and installed works subcontract (Incoterms do not apply). */
  var COVER = {
    EXW: [], FCA: ['load'], FAS: ['load', 'pre'], FOB: ['load', 'pre'],
    CFR: ['load', 'pre', 'main'], CIF: ['load', 'pre', 'main', 'ins'],
    CPT: ['load', 'pre', 'main', 'onc'], CIP: ['load', 'pre', 'main', 'ins', 'onc'],
    DAP: ['load', 'pre', 'main', 'ins', 'onc'], DPU: ['load', 'pre', 'main', 'ins', 'onc', 'unload'],
    DDP: ['load', 'pre', 'main', 'ins', 'onc', 'imp'], site: ELEMENTS.slice()
  };
  var INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'site'];
  /* legs before the entry into the Union: part of the customs value (UCC art. 71(1)(e)) */
  var CUSTOMS = ['load', 'pre', 'main', 'ins'];
  var DEF = { policy: 'allowance', unclear: 1, rate: 0.06, gapWarn: 0.10, load: 0, ins: 0, duty: 0, impFix: 0, unload: 0 };
  var TIE = 1e-9;

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function num(x, d) { return isNum(x) ? x : d; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* a repeated id gets the suffix -2, -3 … (as D-TND-5) so that terms, cells and plugs never merge two lines */
  function uniq(seen, id) {
    if (!seen[id]) { seen[id] = 1; return id; }
    var k = 2; while (seen[id + '-' + k]) k++;
    seen[id + '-' + k] = 1; return id + '-' + k;
  }
  function norm(inp) {
    var i = inp || {}, seenI = {}, seenQ = {}, dups = [];
    var o = {
      policy: POLICIES.indexOf(i.policy) >= 0 ? i.policy : DEF.policy,
      unclear: clamp(num(i.unclear, DEF.unclear), 0, 1), rate: Math.max(0, num(i.rate, DEF.rate)), gapWarn: Math.max(0, num(i.gapWarn, DEF.gapWarn)),
      load: Math.max(0, num(i.load, 0)), ins: Math.max(0, num(i.ins, 0)), duty: Math.max(0, num(i.duty, 0)), impFix: Math.max(0, num(i.impFix, 0)), unload: Math.max(0, num(i.unload, 0)),
      items: [], quotes: []
    };
    (Array.isArray(i.items) ? i.items : []).forEach(function (it, k) {
      if (!it) return;
      var id0 = String(it.id || 'I' + (k + 1)), id = uniq(seenI, id0);
      if (id !== id0) dups.push(id0);
      o.items.push({ id: id, name: String(it.name == null ? '' : it.name), allowance: Math.max(0, num(it.allowance, 0)) });
    });
    (Array.isArray(i.quotes) ? i.quotes : []).forEach(function (q, k) {
      if (!q) return;
      /* a quote in EUR has rate 1 whatever the rate field holds (a rate left over from a corrected currency is ignored and flagged) */
      var cur = String(q.cur || 'EUR').trim().slice(0, 3).toUpperCase() || 'EUR';
      var cells = {}, qid0 = String(q.id || 'Q' + (k + 1)), qid = uniq(seenQ, qid0);
      if (qid !== qid0) dups.push(qid0);
      o.items.forEach(function (it) {
        var c = q.cells && Object.prototype.hasOwnProperty.call(q.cells, it.id) && q.cells[it.id] || {};
        var s = STATUS.indexOf(c.s) >= 0 ? c.s : 'inc';
        cells[it.id] = { s: s, amt: isNum(c.amt) && c.amt >= 0 ? c.amt : null };
      });
      o.quotes.push({
        id: qid, name: String(q.name == null ? '' : q.name),
        price: num(q.price, NaN), cur: cur, fx: cur === 'EUR' ? 1 : num(q.fx, NaN), fxIgnored: cur === 'EUR' && isNum(q.fx) && q.fx !== 1,
        incoterm: INCOTERMS.indexOf(q.incoterm) >= 0 ? q.incoterm : 'site', eu: q.eu !== false,
        pre: Math.max(0, num(q.pre, 0)), main: Math.max(0, num(q.main, 0)), onc: Math.max(0, num(q.onc, 0)),
        adv: clamp(num(q.adv, 0), 0, 1), advMonths: Math.max(0, num(q.advMonths, 0)), adj: num(q.adj, 0), cells: cells
      });
    });
    o.dups = dups;
    return o;
  }

  /* plug of item it for quote q: allowance, or the highest / mean EUR amount the OTHER valid quotes give for that item (included with a breakdown, or as a priced option) */
  function plugFor(n, it, q, valid) {
    if (n.policy === 'allowance') return { v: it.allowance, from: 'allowance' };
    var xs = [];
    n.quotes.forEach(function (o) {
      if (o === q || !valid[o.id]) return;
      var c = o.cells[it.id];
      if ((c.s === 'inc' || c.s === 'opt') && c.amt != null) xs.push(c.amt * o.fx);
    });
    if (!xs.length) return { v: it.allowance, from: 'allowance' };
    if (n.policy === 'max') return { v: Math.max.apply(null, xs), from: 'max' };
    var s = 0; xs.forEach(function (x) { s += x; });
    return { v: s / xs.length, from: 'mean' };
  }

  function logistics(n, q, P) {
    var cov = COVER[q.incoterm] || [], add = {}, tot = 0;
    var base = { load: n.load, pre: q.pre, main: q.main, ins: n.ins * P, onc: q.onc, unload: n.unload };
    ['load', 'pre', 'main', 'ins'].forEach(function (e) { add[e] = cov.indexOf(e) >= 0 ? 0 : base[e]; });
    var cv = P; CUSTOMS.forEach(function (e) { cv += add[e]; });
    add.imp = q.eu || cov.indexOf('imp') >= 0 ? 0 : n.impFix + n.duty * cv;
    add.onc = cov.indexOf('onc') >= 0 ? 0 : base.onc;
    add.unload = cov.indexOf('unload') >= 0 ? 0 : base.unload;
    ELEMENTS.forEach(function (e) { tot += add[e]; });
    return { add: add, total: tot, customsValue: q.eu || cov.indexOf('imp') >= 0 ? null : cv };
  }

  function rankOf(values) {
    /* values: array of number|null; ties within TIE relative share the rank (competition ranking) */
    return values.map(function (v) {
      if (v == null) return null;
      var r = 1;
      values.forEach(function (w) { if (w != null && w < v && (v - w) > TIE * Math.max(1, Math.abs(v))) r++; });
      return r;
    });
  }

  function analyse(inp) {
    var n = norm(inp), errors = [];
    if (!n.quotes.length) errors.push('quotes');
    if (errors.length) return { ok: false, errors: errors, input: n };
    var valid = {}, optNoAmt = [], zeroPlug = [];
    n.quotes.forEach(function (q) { valid[q.id] = isNum(q.price) && q.price > 0 && isNum(q.fx) && q.fx > 0; });
    var rows = n.quotes.map(function (q) {
      if (!valid[q.id]) return { id: q.id, name: q.name, valid: false, reason: !(isNum(q.price) && q.price > 0) ? 'price' : 'fx' };
      var P = q.price * q.fx, opt = 0, plug = 0, cells = {}, nExc = 0, nUnc = 0, nOpt = 0;
      n.items.forEach(function (it) {
        var c = q.cells[it.id], add = 0, pl = null;
        if (c.s === 'opt' && c.amt != null) { add = c.amt * q.fx; opt += add; nOpt++; }
        else if (c.s === 'opt' || c.s === 'exc' || c.s === 'unc') {
          /* an option without its price is not free: it is plugged like an excluded item until the bidder prices it */
          pl = plugFor(n, it, q, valid);
          add = (c.s === 'unc' ? n.unclear : 1) * pl.v; plug += add;
          if (c.s === 'opt') { optNoAmt.push({ q: q.id, item: it.id }); nExc++; }
          else if (c.s === 'exc') nExc++; else nUnc++;
          if (!(pl.v > 0) && (c.s !== 'unc' || n.unclear > 0)) zeroPlug.push({ q: q.id, item: it.id });
        }
        cells[it.id] = { s: c.s, add: add, plug: pl ? pl.v : null, from: pl ? (c.s === 'opt' ? 'opt-noamt' : pl.from) : null };
      });
      var lg = logistics(n, q, P);
      var fin = q.adv * P * n.rate * q.advMonths / 12;
      var L = P + opt + plug + lg.total + fin + q.adj;
      /* a levelled cost of zero or less (a credit larger than the quote) cannot be compared: left out of the ranking */
      if (!(L > 0)) return { id: q.id, name: q.name, valid: false, reason: 'level', L: L };
      return { id: q.id, name: q.name, valid: true, P: P, opt: opt, plug: plug, logistics: lg.total, log: lg.add, customsValue: lg.customsValue, fin: fin, adj: q.adj,
               L: L, gapShare: L > 0 ? plug / L : null, nExc: nExc, nUnc: nUnc, nOpt: nOpt, cells: cells, incoterm: q.incoterm };
    });
    var rawRank = rankOf(rows.map(function (r) { return r.valid ? r.P : null; }));
    var lvRank = rankOf(rows.map(function (r) { return r.valid && isNum(r.L) ? r.L : null; }));
    rows.forEach(function (r, k) { r.rawRank = rawRank[k]; r.rank = lvRank[k]; });
    var ok = rows.filter(function (r) { return r.valid && r.rank != null; });
    var leaders = ok.filter(function (r) { return r.rank === 1; });
    var rawLeaders = ok.filter(function (r) { return r.rawRank === 1; });
    var leader = leaders.length === 1 ? leaders[0] : null;
    var sorted = ok.slice().sort(function (a, b) { return a.L - b.L || (a.id < b.id ? -1 : 1); });
    var second = sorted.length > 1 ? sorted[1] : null;
    var lead = leader && second ? second.L - leader.L : null;
    /* stability of the leader against a common scale factor f on all plugs: L_j(f) = (L_j - plug_j) + f·plug_j */
    var stab = null;
    if (leader && ok.length > 1) {
      var lo = 0, hi = Infinity, loBy = null, hiBy = null, ak = leader.L - leader.plug, gk = leader.plug;
      ok.forEach(function (r) {
        if (r === leader) return;
        var aj = r.L - r.plug, gj = r.plug;
        if (Math.abs(gk - gj) < 1e-12) return;
        var f = (aj - ak) / (gk - gj);
        if (gk > gj) { if (f < hi) { hi = f; hiBy = r.id; } }
        else if (f > lo) { lo = f; loBy = r.id; }
      });
      stab = { lo: Math.max(0, lo), hi: isFinite(hi) ? hi : null, loBy: lo > 0 ? loBy : null, hiBy: hiBy };
    }
    var allExc = n.items.filter(function (it) { return ok.length > 0 && ok.every(function (r) { var s = r.cells[it.id].s; return s === 'exc' || s === 'unc'; }); }).map(function (it) { return it.id; });
    var flags = [];
    if (leader && rawLeaders.length && rawLeaders.indexOf(leader) < 0) flags.push('reversal');
    if (leader && leader.gapShare != null && leader.gapShare > n.gapWarn) flags.push('gap');
    if (stab && ((stab.hi != null && stab.hi < 1.5) || stab.lo > 0.5)) flags.push('fragile');
    if (leaders.length > 1) flags.push('tie');
    if (allExc.length) flags.push('allexc');
    if (rows.some(function (r) { return !r.valid; })) flags.push('invalid');
    if (n.quotes.some(function (q) { return valid[q.id] && q.cur !== 'EUR'; })) flags.push('fx');
    if (n.policy !== 'allowance' && n.items.some(function (it) { return it.allowance <= 0; })) flags.push('noallow');
    if (optNoAmt.length) flags.push('optnoamt');
    if (zeroPlug.length) flags.push('zeroplug');
    if (n.quotes.some(function (q) { return q.fxIgnored; })) flags.push('eurfx');
    if (n.dups.length) flags.push('dupid');
    return { ok: true, input: n, rows: rows, leader: leader ? leader.id : null, leaders: leaders.map(function (r) { return r.id; }),
             rawLeader: rawLeaders.length === 1 ? rawLeaders[0].id : null, second: second ? second.id : null, lead: lead,
             stability: stab, allExcluded: allExc, optNoAmount: optNoAmt, zeroPlug: zeroPlug, duplicates: n.dups, flags: flags, version: VERSION };
  }

  /* levelled totals for a plug scale factor f (chart) */
  function curve(inp, fmax, pts) {
    var R = analyse(inp), out = [], k = pts || 40, F = fmax || 2;
    if (!R.ok) return out;
    R.rows.filter(function (r) { return r.valid; }).forEach(function (r) {
      var line = [];
      for (var i = 0; i <= k; i++) { var f = F * i / k; line.push([f, r.L - r.plug + f * r.plug]); }
      out.push({ id: r.id, pts: line });
    });
    return out;
  }

  /* requisition (project-package/v1 requisitions[] item) -> scope items to level against */
  function itemsFromRequisition(req) {
    var out = [], seen = {};
    function add(id, name) { id = String(id || '').slice(0, 40); if (!id || seen[id]) return; seen[id] = 1; out.push({ id: id, name: String(name || id).slice(0, 160), allowance: 0, src: 'requisition' }); }
    if (!req || typeof req !== 'object') return out;
    (Array.isArray(req.scope) ? req.scope : []).forEach(function (s, k) { if (s) add(s.id || 'SC' + (k + 1), s.text || s.item_key); });
    var t = req.tests || {};
    if (t.fat_required) add('FAT', 'FAT');
    if (t.sat_required) add('SAT', 'SAT');
    var sp = req.spares || {};
    ['commissioning', 'operating_2yr', 'capital'].forEach(function (k) { if (sp[k] && sp[k] !== 'none' && sp[k] !== 'not_required') add('SP-' + k, 'spares:' + k); });
    if (Array.isArray(req.expected_vendor_documents) && req.expected_vendor_documents.length) add('VDRL', 'vendor documents (' + req.expected_vendor_documents.length + ')');
    return out.slice(0, 30);
  }

  /* presets: numbers only; names and texts live in the page. Each aha is checked in _tnd/quotelevel/test.mjs and in the bench. */
  function Q(id, price, cur, fx, inc, eu, cells, extra) {
    var q = { id: id, price: price, cur: cur, fx: fx, incoterm: inc, eu: eu, cells: cells };
    Object.keys(extra || {}).forEach(function (k) { q[k] = extra[k]; });
    return q;
  }
  function C(list) { var o = {}; list.forEach(function (x) { o[x[0]] = { s: x[1], amt: x[2] == null ? null : x[2] }; }); return o; }
  var PRESETS = [
    { id: 'hvac-sub', group: 'be', policy: 'allowance', unclear: 1, rate: 0.06, gapWarn: 0.10,
      items: [{ id: 'I1', key: 'bms', allowance: 185000 }, { id: 'I2', key: 'crane', allowance: 38000 }, { id: 'I3', key: 'tab', allowance: 42000 }, { id: 'I4', key: 'dampers', allowance: 64000 },
              { id: 'I5', key: 'bwic', allowance: 55000 }, { id: 'I6', key: 'oandm', allowance: 18000 }, { id: 'I7', key: 'tempheat', allowance: 26000 }, { id: 'I8', key: 'maint', allowance: 48000 }],
      quotes: [
        Q('Q1', 2450000, 'EUR', 1, 'site', true, C([['I1', 'exc'], ['I2', 'exc'], ['I3', 'exc'], ['I5', 'unc']])),
        Q('Q2', 2610000, 'EUR', 1, 'site', true, C([['I7', 'exc']])),
        Q('Q3', 2690000, 'EUR', 1, 'site', true, C([])),
        Q('Q4', 2540000, 'EUR', 1, 'site', true, C([['I1', 'opt', 160000], ['I6', 'unc'], ['I8', 'exc']]))
      ] },
    { id: 'pumps-landed', group: 'eq', policy: 'allowance', unclear: 1, rate: 0.06, gapWarn: 0.10, load: 3500, ins: 0.005, duty: 0.017, impFix: 450, unload: 2800,
      items: [{ id: 'I1', key: 'fat', allowance: 14000 }, { id: 'I2', key: 'spares', allowance: 18000 }, { id: 'I3', key: 'comm', allowance: 22000 }, { id: 'I4', key: 'cert', allowance: 45000 }],
      quotes: [
        Q('Q1', 412000, 'EUR', 1, 'DAP', true, C([['I2', 'opt', 16000]])),
        Q('Q2', 405000, 'USD', 0.92, 'EXW', false, C([['I2', 'opt', 21000]]), { pre: 4800, main: 14000, onc: 1900 }),
        Q('Q3', 318000, 'USD', 0.92, 'FOB', false, C([['I1', 'unc'], ['I2', 'exc'], ['I3', 'exc'], ['I4', 'unc']]), { pre: 2500, main: 9500, onc: 1900, adv: 0.3, advMonths: 6 })
      ] },
    { id: 'elec-epc', group: 'epc', policy: 'allowance', unclear: 1, rate: 0.06, gapWarn: 0.10,
      items: [{ id: 'I1', key: 'cabletray', allowance: 240000 }, { id: 'I2', key: 'earthing', allowance: 95000 }, { id: 'I3', key: 'precomm', allowance: 140000 },
              { id: 'I4', key: 'hv', allowance: 70000 }, { id: 'I5', key: 'asbuilt', allowance: 35000 }, { id: 'I6', key: 'scaffold', allowance: 60000 }],
      quotes: [
        Q('Q1', 7350000, 'EUR', 1, 'site', true, C([['I2', 'unc'], ['I3', 'unc'], ['I6', 'unc']])),
        Q('Q2', 7690000, 'EUR', 1, 'site', true, C([['I6', 'exc']])),
        Q('Q3', 7820000, 'EUR', 1, 'site', true, C([]), { adj: -40000 })
      ] },
    { id: 'steel-policy', group: 'be', policy: 'allowance', unclear: 1, rate: 0.06, gapWarn: 0.10,
      items: [{ id: 'I1', key: 'galv', allowance: 90000 }, { id: 'I2', key: 'paint', allowance: 60000 }, { id: 'I3', key: 'fireproof', allowance: 110000 }, { id: 'I4', key: 'shopdwg', allowance: 30000 }],
      quotes: [
        Q('Q1', 1905000, 'EUR', 1, 'site', true, C([['I1', 'inc', 145000], ['I2', 'inc', 70000], ['I3', 'exc'], ['I4', 'inc', 40000]])),
        Q('Q2', 1990000, 'EUR', 1, 'site', true, C([['I1', 'inc', 120000], ['I2', 'inc', 85000], ['I3', 'inc', 195000], ['I4', 'inc', 35000]])),
        Q('Q3', 1745000, 'EUR', 1, 'site', true, C([['I1', 'exc'], ['I2', 'inc', 65000], ['I3', 'opt', 125000], ['I4', 'inc', 30000]]))
      ] }
  ];

  return { version: VERSION, STATUS: STATUS, POLICIES: POLICIES, ELEMENTS: ELEMENTS, COVER: COVER, INCOTERMS: INCOTERMS, CUSTOMS: CUSTOMS, DEF: DEF, PRESETS: PRESETS,
           norm: norm, analyse: analyse, curve: curve, logistics: logistics, rankOf: rankOf, itemsFromRequisition: itemsFromRequisition };
});
