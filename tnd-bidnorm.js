/* tnd-bidnorm.js — engine of bidnormalize.html (Commercial Bid Normalisation), tools.petrov.re Tendering & Contracts.
   Pure, no DOM, UMD (browser global TndBidNorm, node require). Method: _tnd/bidnormalize/SPEC.md.
   KB 18.04.2017 art. 34 (arithmetic and material errors: no general "unit price prevails" rule), art. 86 §2 (missing price P = L·Y/X),
   art. 87 §1 (options), art. 48 §3 + art. 87 §1 al. 4 (priced free/permitted options in a price-only award are disregarded);
   Incoterms 2020 cost structure (our own model of which delivery stages the seller's price covers);
   payment terms as present value at the client's cost of money. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TndBidNorm = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.1.0';
  var ELEMENTS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'];
  /* delivery stages covered by the seller's price per Incoterms 2020 rule (our model, see SPEC §6) */
  var INCL = {
    EXW: [], FCA: ['E1', 'E2'], FAS: ['E1', 'E2', 'E3'], FOB: ['E1', 'E2', 'E3'],
    CPT: ['E1', 'E2', 'E3', 'E4'], CFR: ['E1', 'E2', 'E3', 'E4'],
    CIP: ['E1', 'E2', 'E3', 'E4', 'E5'], CIF: ['E1', 'E2', 'E3', 'E4', 'E5'],
    DAP: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'], DPU: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7'],
    DDP: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E8']   /* DDP: duties paid, but unloading is the buyer's (only DPU unloads) */
  };
  var INCOTERMS = Object.keys(INCL);
  var KINDS = ['base', 'provisional', 'req_option', 'perm_option', 'free_option'];
  var TOL_ABS = 0.005, TOL_REL = 1e-9;
  /* reasons that leave a bid unranked */
  var BLOCK = ['nofill', 'payment', 'payRange', 'fx', 'rebate', 'duty', 'overflow'];

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null); }
  function has(arr, x) { return arr.indexOf(x) >= 0; }
  function inScope(it) {
    if (!it) return false;
    if (it.kind === 'free_option') return !!it.include;
    return has(KINDS, it.kind);
  }
  function isBaseScope(it) { return it.kind === 'base' || it.kind === 'provisional' || !it.kind; }
  function disc(rate, months) { return Math.pow(1 + rate, -months / 12); }

  /* present-value factor of a payment profile relative to the reference "100 % at T + refDays" */
  function paymentFactor(pay, T, rate, refDays) {
    pay = pay || {};
    var adv = num(pay.adv) || 0, ret = num(pay.ret) || 0, retM = num(pay.retM) || 0, days = num(pay.days);
    if (days == null) days = refDays;
    var bal = 1 - adv - ret;
    var pv = adv * disc(rate, 0) + bal * disc(rate, T + days / 30) + ret * disc(rate, T + retM + days / 30);
    var pvRef = disc(rate, T + refDays / 30);
    return { pv: pv, pvRef: pvRef, factor: pv / pvRef, balance: bal };
  }

  /* delivery-term gap of one bid: returns {gap, parts:[{el, sign, cost}], cv, duty} — S in evaluation currency */
  function incotermGap(S, bidTerm, refTerm, cost, duty) {
    var inB = INCL[bidTerm] || INCL.EXW, inR = INCL[refTerm] || INCL.DAP;
    var c = function (e) { return num(cost && cost[e]) || 0; };
    duty = num(duty) || 0;
    var cv;
    if (has(inB, 'E8')) cv = (S - c('E6') - c('E8')) / (1 + duty);
    else {
      cv = S;
      ['E1', 'E2', 'E3', 'E4', 'E5'].forEach(function (e) { if (!has(inB, e)) cv += c(e); });
      ['E6', 'E7'].forEach(function (e) { if (has(inB, e)) cv -= c(e); });
    }
    var parts = [], gap = 0;
    ELEMENTS.forEach(function (e) {
      var a = has(inR, e), b = has(inB, e);
      if (a === b) return;
      var v = e === 'E8' ? c('E8') + duty * cv : c(e);
      var sgn = a ? 1 : -1;
      parts.push({ el: e, sign: sgn, cost: v });
      gap += sgn * v;
    });
    return { gap: gap, parts: parts, cv: cv, duty: duty };
  }

  function mean(a) { if (!a.length) return null; var s = 0; a.forEach(function (x) { s += x; }); return s / a.length; }

  /* main entry */
  function normalize(inp) {
    inp = inp || {};
    var errors = [], warnings = [];
    var rate = num(inp.rate); if (rate == null) rate = 0;
    var T = num(inp.T); if (T == null) T = 0;
    var refDays = num(inp.refDays); if (refDays == null) refDays = 30;
    var ref = INCL[inp.ref] ? inp.ref : 'DAP';
    var arith = inp.arith === 'stated' ? 'stated' : 'unit';
    var missingPolicy = inp.missing === 'reject' ? 'reject' : 'fill';
    var priceOnly = !!inp.priceOnly;   /* award on price or cost only: KB 18.04.2017 art. 48 §3 */
    var items = (inp.items || []).filter(function (it) { return it && it.id != null && String(it.id) !== ''; });
    var bids = (inp.bids || []).filter(function (b) { return b && b.id != null && String(b.id) !== ''; });
    if (rate <= -1) errors.push('rate');
    if (!bids.length) errors.push('nobids');
    if (!items.length) errors.push('noitems');
    var itemById = {};
    items.forEach(function (it) { if (itemById[it.id]) warnings.push({ k: 'dupItem', item: it.id }); itemById[it.id] = it; });
    var bidById = {};
    bids.forEach(function (b) { if (bidById[b.id]) warnings.push({ k: 'dupBid', bid: b.id }); bidById[b.id] = b; });
    if (errors.length) return { ok: false, errors: errors, warnings: warnings };

    /* line lookup: last line wins for a (bid,item) pair */
    var L = {};
    (inp.lines || []).forEach(function (ln) {
      if (!ln || !bidById[ln.bid] || !itemById[ln.item]) { if (ln && (ln.bid || ln.item)) warnings.push({ k: 'orphanLine', bid: ln.bid, item: ln.item }); return; }
      L[ln.bid + '\u0001' + ln.item] = ln;
    });
    var cost = {};
    bids.forEach(function (b) { cost[b.id] = {}; });
    (inp.logistics || []).forEach(function (x) {
      if (!x || !bidById[x.bid] || !has(ELEMENTS, x.el)) return;
      var v = num(x.amount); if (v == null) return;
      if (v < 0) warnings.push({ k: 'negCost', bid: x.bid, el: x.el });
      cost[x.bid][x.el] = (cost[x.bid][x.el] || 0) + v;
    });

    /* step 1: corrected line amounts */
    var R = {};
    bids.forEach(function (b) {
      var fx = num(b.fx); if (fx == null) fx = 1;
      var r = { id: b.id, name: b.name || b.id, currency: b.currency || inp.cur || 'EUR', fx: fx, readout: num(b.readout),
                rebate: num(b.rebate) || 0, incoterm: INCL[b.incoterm] ? b.incoterm : ref, duty: num(b.duty) || 0,
                tech: b.tech === 'fail' ? 'fail' : (b.tech === 'pass' ? 'pass' : ''), variantOf: b.variantOf || '',
                lines: {}, log: [], missing: [], rejected: false, reasons: [] };
      /* input checks (SPEC §3.9): impossible values leave the bid unranked with a reason, they are never silently replaced */
      if (fx <= 0) r.reasons.push('fx');
      if (r.rebate < 0 || r.rebate >= 1) r.reasons.push('rebate');
      if (r.duty < 0) r.reasons.push('duty');
      var pay0 = b.payment || {};
      if ((num(pay0.adv) || 0) < 0 || (num(pay0.ret) || 0) < 0 || (num(pay0.retM) || 0) < 0 || (num(pay0.days) || 0) < 0) r.reasons.push('payRange');
      items.forEach(function (it) {
        var ln = L[b.id + '\u0001' + it.id] || null;
        var qRaw = num(it.qty), qty = qRaw == null ? 0 : qRaw;
        var qProv = qRaw == null ? 1 : qRaw;   /* provisional sum: no quantity = one lump sum; quantity 0 = nothing */
        var up = ln ? num(ln.up) : null, amt = ln ? num(ln.amount) : null;
        var out = { item: it.id, qty: qty, up: up, amount: amt, value: null, computed: null, decision: '', delta: 0, flag: '' };
        if (it.kind === 'provisional') {
          var pv = (num(it.up) || 0) * qProv;
          out.value = pv; out.computed = pv; out.flag = 'provisional';
          var given = amt != null ? amt : (up != null ? up * qProv : null);
          if (given != null && Math.abs(given - pv) > TOL_ABS + TOL_REL * Math.abs(pv)) {
            out.decision = 'provisional'; out.delta = pv - given; out.stated = given;
            r.log.push({ item: it.id, stated: given, computed: pv, corrected: pv, decision: 'provisional', delta: pv - given, rule: 'art34' });
          }
        } else if (up == null && amt == null) {
          out.flag = 'missing';
        } else if (up != null && amt == null) {
          out.value = qty * up; out.computed = out.value;
        } else if (up == null && amt != null) {
          out.value = amt; out.computed = null; out.flag = 'amountOnly';
        } else {
          var comp = qty * up;
          out.computed = comp;
          if (Math.abs(comp - amt) > TOL_ABS + TOL_REL * Math.abs(amt)) {
            var d = ln.decision === 'unit' || ln.decision === 'stated' ? ln.decision : arith;
            out.decision = d;
            out.value = d === 'unit' ? comp : amt;
            out.delta = out.value - amt;
            out.flag = 'discrepancy';
            r.log.push({ item: it.id, stated: amt, computed: comp, corrected: out.value, decision: d, auto: !(ln.decision === 'unit' || ln.decision === 'stated'),
                         impliedUp: qty ? amt / qty : null, delta: out.value - amt, rule: 'art34' });
          } else out.value = amt;
        }
        if (out.value != null && out.value < -TOL_ABS && it.kind !== 'provisional') warnings.push({ k: 'negLine', bid: b.id, item: it.id });
        /* art. 48 §3: in a price-only award a free or permitted option may carry no extra price; art. 87 §1 al. 4: such an option is disregarded */
        if (priceOnly && out.value != null && out.value > TOL_ABS && (it.kind === 'perm_option' || it.kind === 'free_option') && inScope(it)) {
          r.log.push({ item: it.id, stated: out.value, computed: out.value, corrected: 0, decision: 'disregarded', delta: -out.value, rule: 'art48' });
          out.disregarded = out.value; out.value = null; out.flag = 'art48';
        }
        r.lines[it.id] = out;
        if (out.flag === 'missing' && (it.kind === 'perm_option' || it.kind === 'free_option')) out.flag = 'notOffered';
        if (out.flag === 'missing' && inScope(it)) r.missing.push(it.id);
      });
      R[b.id] = r;
    });

    /* rejection by missing-price policy */
    bids.forEach(function (b) {
      var r = R[b.id];
      if (r.missing.length && missingPolicy === 'reject') { r.rejected = true; r.reasons.push('missing'); }
    });
    var pool = bids.filter(function (b) { return !R[b.id].rejected && R[b.id].tech !== 'fail'; }).map(function (b) { return b.id; });

    /* an item that no eligible bid priced cannot be filled (art. 86 §2 needs at least one price for L): under the fill policy it is
       taken out of the comparison for every bid, with a warning (tool rule, D-TND-6) */
    var dropped = [];
    if (missingPolicy === 'fill' && pool.length) {
      items.filter(inScope).forEach(function (it) {
        var blank = bids.some(function (b) { return has(R[b.id].missing, it.id); });
        if (!blank) return;
        var anyPrice = pool.some(function (o) { var x = R[o].lines[it.id]; return x && x.value != null; });
        if (!anyPrice) dropped.push(it.id);
      });
      dropped.forEach(function (id) {
        warnings.push({ k: 'noDonor', item: id });
        bids.forEach(function (b) { var r = R[b.id]; r.missing = r.missing.filter(function (m) { return m !== id; }); });
      });
    }
    var scope = items.filter(function (it) { return inScope(it) && !has(dropped, it.id); });
    function priced(rid, itId) { var x = R[rid].lines[itId]; return x && x.value != null; }
    function totalExcl(rid, excl) {
      var s = 0;
      scope.forEach(function (it) { if (has(excl, it.id)) return; var x = R[rid].lines[it.id]; if (x && x.value != null) s += x.value; });
      return s;
    }

    /* step 3: art. 86 §2 fill */
    bids.forEach(function (b) {
      var r = R[b.id];
      r.fill = {};
      if (!r.missing.length || missingPolicy !== 'fill') return;
      var Y = totalExcl(b.id, r.missing);
      r.missing.forEach(function (itId) {
        var others = pool.filter(function (o) { return o !== b.id && priced(o, itId); });
        if (!others.length) { r.fill[itId] = { P: null, L: null, X: null, Y: Y, n: 0 }; r.reasons.push('nofill'); return; }
        var Lm = mean(others.map(function (o) { return R[o].lines[itId].value; }));
        var excl = r.missing.slice();
        /* the article is silent on donors that left items blank themselves: their totals are lower, X is lower and P higher -> warn */
        var holey = others.filter(function (o) { return R[o].missing.length > 0; });
        if (holey.length) warnings.push({ k: 'donorBlank', bid: b.id, item: itId, donors: holey });
        var Xm = mean(others.map(function (o) { return totalExcl(o, excl); }));
        if (!Xm) { r.fill[itId] = { P: null, L: Lm, X: Xm, Y: Y, n: others.length }; r.reasons.push('nofill'); return; }
        var P = Lm * Y / Xm;
        r.fill[itId] = { P: P, L: Lm, X: Xm, Y: Y, n: others.length, from: others.slice() };
        r.log.push({ item: itId, stated: null, computed: P, corrected: P, decision: 'fill', delta: P, rule: 'art86', L: Lm, X: Xm, Y: Y, n: others.length });
      });
    });

    /* steps 2, 4–8 */
    var pm = {};
    bids.forEach(function (b) {
      var r = R[b.id];
      var base = 0, opt = 0, fillBase = 0, fillOpt = 0, optList = [];
      scope.forEach(function (it) {
        var x = r.lines[it.id], v = x.value, f = r.fill[it.id];
        if (isBaseScope(it)) {
          if (v != null) base += v; else if (f && f.P != null) fillBase += f.P;
        } else {
          var ov = v != null ? v : (f && f.P != null ? f.P : null);
          if (v != null) opt += v; else if (f && f.P != null) fillOpt += f.P;
          optList.push({ item: it.id, kind: it.kind, value: ov, filled: v == null && x.disregarded == null, disregarded: x.disregarded != null });
        }
      });
      r.base = base;
      r.arith = r.readout != null ? base - r.readout : 0;
      if (r.readout == null) r.reasons.push('noReadout');
      r.fillTotal = fillBase + fillOpt;
      r.fillBase = fillBase;
      r.options = opt + fillOpt;
      r.optList = optList;
      var start = r.readout != null ? r.readout : base;
      r.subtotal = start + r.arith + fillBase + r.options;   /* = base + fills + options */
      r.rebateAmt = -r.rebate * r.subtotal;
      r.netBid = r.subtotal + r.rebateAmt;
      r.S = r.netBid * r.fx;
      r.readoutEval = (r.readout != null ? r.readout : base) * r.fx;
      var g = incotermGap(r.S, r.incoterm, ref, cost[b.id], r.duty);
      r.gap = g.gap; r.gapParts = g.parts; r.cv = g.cv;
      var p = paymentFactor(b.payment, T, rate, refDays);
      if (p.balance < -1e-12) r.reasons.push('payment');
      r.payFactor = p.factor; r.pv = p.pv; r.pvRef = p.pvRef;
      r.payAdj = r.S * (p.factor - 1);
      r.N = r.S + r.gap + r.payAdj;
      if (!isFinite(r.N)) r.reasons.push('overflow');
      r.ranked = !r.rejected && r.tech !== 'fail' && !r.reasons.some(function (k) { return has(BLOCK, k); });
      pm[b.id] = r;
    });

    function rankBy(key) {
      var ids = bids.map(function (b) { return b.id; }).filter(function (id) { return R[id].ranked; });
      var vals = ids.map(function (id) { return R[id][key]; });
      var out = {};
      ids.forEach(function (id, i) {
        var v = vals[i], rk = 1;
        vals.forEach(function (w) { if (w < v - 1e-9 * Math.max(1, Math.abs(v))) rk++; });
        out[id] = rk;
      });
      return out;
    }
    var rkN = rankBy('N'), rkR = rankBy('readoutEval');
    var ranked = [];
    bids.forEach(function (b) { var r = R[b.id]; r.rank = rkN[b.id] || null; r.readoutRank = rkR[b.id] || null; if (r.ranked) ranked.push(r); });
    ranked.sort(function (a, b) { return a.N - b.N || (a.id < b.id ? -1 : 1); });
    var best = ranked.length ? ranked[0] : null;
    bids.forEach(function (b) { var r = R[b.id]; r.deltaBest = best && r.ranked ? r.N - best.N : null; r.deltaBestPct = best && r.ranked && best.N > 0 ? (r.N - best.N) / best.N : null; });
    /* art. 87 §2: equal offers -> written price reductions, then lots; the tool only reports the tie */
    var tie = best ? ranked.filter(function (r) { return r.rank === 1; }).map(function (r) { return r.id; }) : [];
    var readoutBest = ranked.slice().sort(function (a, b) { return a.readoutEval - b.readoutEval || (a.id < b.id ? -1 : 1); })[0] || null;
    var changed = ranked.some(function (r) { return r.rank !== r.readoutRank; });
    var order = bids.map(function (b) { return R[b.id]; });
    var nCorr = 0, nFill = 0, nOpt48 = 0;
    order.forEach(function (r) { r.log.forEach(function (x) { if (x.rule === 'art86') nFill++; else if (x.rule === 'art48') nOpt48++; else nCorr++; }); });
    var spread = ranked.length > 1 ? (ranked[0].N > 0 ? (ranked[ranked.length - 1].N - ranked[0].N) / ranked[0].N : null) : 0;
    return { ok: true, version: VERSION, errors: [], warnings: warnings, ref: ref, rate: rate, T: T, refDays: refDays, arith: arith, missingPolicy: missingPolicy,
             bids: order, ranked: ranked, best: best ? best.id : null, readoutBest: readoutBest ? readoutBest.id : null,
             winnerChanged: !!(best && readoutBest && best.id !== readoutBest.id), rankChanged: changed,
             nCorrections: nCorr, nFills: nFill, nDisregarded: nOpt48, spread: spread, scope: scope.map(function (it) { return it.id; }),
             dropped: dropped, priceOnly: priceOnly, tie: tie.length > 1 ? tie : [] };
  }

  /* --------------------------------------------------------------- presets (real-world shaped; see SPEC) */
  function L_(bid, rows) { return rows.map(function (r) { return { bid: bid, item: r[0], up: r[1], amount: r[2], decision: r[3] || 'auto' }; }); }
  var PRESETS = [
    { id: 'be-works', group: 'public',
      tender: { cur: 'EUR', rate: 0.03, T: 10, ref: 'DAP', refDays: 30, arith: 'unit', missing: 'fill', priceOnly: true },
      items: [
        { id: '01', desc: 'Demolition of existing boilers and flue', unit: 'FF', qty: 1, kind: 'base' },
        { id: '02', desc: 'Gas condensing boiler 2 × 450 kW', unit: 'pc', qty: 2, kind: 'base' },
        { id: '03', desc: 'Heat pump air/water 250 kW', unit: 'pc', qty: 1, kind: 'base' },
        { id: '04', desc: 'Steel pipework DN 65–150 (presumed quantity)', unit: 'm', qty: 420, kind: 'base' },
        { id: '05', desc: 'Pipe insulation (presumed quantity)', unit: 'm', qty: 420, kind: 'base' },
        { id: '06', desc: 'Pool water heat exchangers', unit: 'pc', qty: 3, kind: 'base' },
        { id: '07', desc: 'BMS controls and commissioning', unit: 'FF', qty: 1, kind: 'base' },
        { id: '08', desc: 'Provisional sum: utility connection', unit: 'PS', qty: 1, kind: 'provisional', up: 25000 },
        { id: 'O1', desc: 'Required option: 5-year full maintenance', unit: 'FF', qty: 1, kind: 'req_option' }
      ],
      bids: [
        { id: 'B1', name: 'Thermo Gent NV', currency: 'EUR', fx: 1, readout: 746430, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0, retM: 0, days: 30 } },
        { id: 'B2', name: 'Klimaat Brabant BV', currency: 'EUR', fx: 1, readout: 719750, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0, retM: 0, days: 30 } },
        { id: 'B3', name: 'HVAC Liège SA', currency: 'EUR', fx: 1, readout: 619380, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0, retM: 0, days: 30 } },
        { id: 'B4', name: 'Installatie Kempen', currency: 'EUR', fx: 1, readout: 793200, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0, retM: 0, days: 30 } }
      ],
      lines: [].concat(
        L_('B1', [['01', 38500, 38500], ['02', 61200, 122400], ['03', 186000, 186000], ['04', 342, 143640], ['05', 58, 24360], ['06', 41500, 124500], ['07', 82030, 82030], ['08', 25000, 25000], ['O1', 64000, 64000]]),
        L_('B2', [['01', 41000, 41000], ['02', 59800, 119600], ['03', 179500, 179500], ['04', 365, 135300], ['05', 61, 25620], ['06', 39800, 119400], ['07', 74330, 74330], ['08', 25000, 25000], ['O1', 80000, 80000]]),
        L_('B3', [['01', 35200, 35200], ['02', 63500, 127000], ['03', 191000, 191000], ['04', 329, 138180], ['05', 55, 23100], ['06', null, null], ['07', 79900, 79900], ['08', 25000, 25000], ['O1', 71000, 71000]]),
        L_('B4', [['01', 44800, 44800], ['02', 64900, 129800], ['03', 197000, 197000], ['04', 372, 156240], ['05', 64, 26880], ['06', 43900, 131700], ['07', 81780, 81780], ['08', 25000, 25000], ['O1', 69000, 69000]])
      ),
      logistics: [] },
    { id: 'epc-equipment', group: 'private',
      tender: { cur: 'EUR', rate: 0.08, T: 14, ref: 'DDP', refDays: 30, arith: 'unit', missing: 'fill' },
      items: [
        { id: 'T1', desc: '66/11 kV power transformer 40 MVA, ONAN/ONAF', unit: 'pc', qty: 2, kind: 'base' },
        { id: 'T2', desc: 'Factory acceptance tests and documentation', unit: 'FF', qty: 1, kind: 'base' },
        { id: 'T3', desc: 'Supervision of erection and commissioning', unit: 'day', qty: 30, kind: 'base' },
        { id: 'O1', desc: 'Required option: spare bushings set', unit: 'set', qty: 1, kind: 'req_option' }
      ],
      bids: [
        { id: 'S1', name: 'Rheinwerk Trafo GmbH (DE)', currency: 'EUR', fx: 1, readout: 2324000, rebate: 0.02, incoterm: 'EXW', duty: 0, tech: 'pass', payment: { adv: 0.10, ret: 0.10, retM: 24, days: 30 } },
        { id: 'S2', name: 'Trasformatori Padana (IT)', currency: 'EUR', fx: 1, readout: 2296000, rebate: 0, incoterm: 'FCA', duty: 0, tech: 'pass', payment: { adv: 0.10, ret: 0.10, retM: 24, days: 60 } },
        { id: 'S3', name: 'Jiangsu Power Equipment (CN)', currency: 'USD', fx: 0.86, readout: 2408000, rebate: 0, incoterm: 'FOB', duty: 0.017, tech: 'pass', payment: { adv: 0.30, ret: 0.05, retM: 12, days: 30 } },
        { id: 'S4', name: 'BeneluxTrafo NV (BE)', currency: 'EUR', fx: 1, readout: 2497000, rebate: 0, incoterm: 'DDP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0.10, retM: 24, days: 30 } }
      ],
      lines: [].concat(
        L_('S1', [['T1', 1098000, 2196000], ['T2', 86000, 86000], ['T3', 1400, 42000], ['O1', 68000, 68000]]),
        L_('S2', [['T1', 1089000, 2178000], ['T2', 79000, 79000], ['T3', 1300, 39000], ['O1', 72000, 72000]]),
        L_('S3', [['T1', 1140000, 2280000], ['T2', 92000, 92000], ['T3', 1200, 36000], ['O1', 82000, 82000]]),
        L_('S4', [['T1', 1181000, 2362000], ['T2', 90000, 90000], ['T3', 1500, 45000], ['O1', 78000, 78000]])
      ),
      logistics: [
        { bid: 'S1', el: 'E1', amount: 9000 }, { bid: 'S1', el: 'E2', amount: 1500 }, { bid: 'S1', el: 'E3', amount: 0 }, { bid: 'S1', el: 'E4', amount: 64000 }, { bid: 'S1', el: 'E5', amount: 7200 }, { bid: 'S1', el: 'E6', amount: 0 },
        { bid: 'S2', el: 'E3', amount: 0 }, { bid: 'S2', el: 'E4', amount: 88000 }, { bid: 'S2', el: 'E5', amount: 7100 }, { bid: 'S2', el: 'E6', amount: 0 },
        { bid: 'S3', el: 'E4', amount: 145000 }, { bid: 'S3', el: 'E5', amount: 8600 }, { bid: 'S3', el: 'E6', amount: 52000 }, { bid: 'S3', el: 'E8', amount: 3500 },
        { bid: 'S4', el: 'E6', amount: 0 }, { bid: 'S4', el: 'E7', amount: 0 }, { bid: 'S4', el: 'E8', amount: 0 }
      ] },
    { id: 'options-free', group: 'public',
      tender: { cur: 'EUR', rate: 0.03, T: 6, ref: 'DAP', refDays: 30, arith: 'unit', missing: 'fill', priceOnly: true },
      items: [
        { id: 'A1', desc: 'Air-handling unit 12 000 m³/h with heat recovery', unit: 'pc', qty: 4, kind: 'base' },
        { id: 'A2', desc: 'Air-handling unit 6 000 m³/h', unit: 'pc', qty: 2, kind: 'base' },
        { id: 'A3', desc: 'Delivery, hoisting, start-up', unit: 'FF', qty: 1, kind: 'base' },
        { id: 'O1', desc: 'Required option: 5-year maintenance contract', unit: 'year', qty: 5, kind: 'req_option' },
        { id: 'O2', desc: 'Free option: EC fans upgrade (offered by some bidders at an extra price)', unit: 'pc', qty: 6, kind: 'free_option', include: true }
      ],
      bids: [
        { id: 'L1', name: 'AirTec Belgium', currency: 'EUR', fx: 1, readout: 412000, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0, retM: 0, days: 30 } },
        { id: 'L2', name: 'Ventilatie Noord', currency: 'EUR', fx: 1, readout: 398500, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0, retM: 0, days: 30 } },
        { id: 'L3', name: 'ClimaSud SA', currency: 'EUR', fx: 1, readout: 405900, rebate: 0.015, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0, retM: 0, days: 30 } }
      ],
      lines: [].concat(
        L_('L1', [['A1', 72500, 290000], ['A2', 44000, 88000], ['A3', 34000, 34000], ['O1', 4200, 21000], ['O2', 1800, 10800]]),
        L_('L2', [['A1', 69500, 278000], ['A2', 42250, 84500], ['A3', 36000, 36000], ['O1', 9800, 49000], ['O2', 2900, 17400]]),
        L_('L3', [['A1', 71000, 284000], ['A2', 43450, 86900], ['A3', 35000, 35000], ['O1', 6000, 30000]])
      ),
      logistics: [] },
    { id: 'payment-terms', group: 'private',
      tender: { cur: 'EUR', rate: 0.08, T: 12, ref: 'DAP', refDays: 30, arith: 'unit', missing: 'fill' },
      items: [ { id: 'P1', desc: 'Compressor package, lump sum', unit: 'FF', qty: 1, kind: 'base' } ],
      bids: [
        { id: 'C1', name: 'Advance 30 %', currency: 'EUR', fx: 1, readout: 1000000, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0.30, ret: 0, retM: 0, days: 30 } },
        { id: 'C2', name: 'Net 30 days', currency: 'EUR', fx: 1, readout: 1000000, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0, retM: 0, days: 30 } },
        { id: 'C3', name: '10 % retention 24 months, 60 days', currency: 'EUR', fx: 1, readout: 1000000, rebate: 0, incoterm: 'DAP', duty: 0, tech: 'pass', payment: { adv: 0, ret: 0.10, retM: 24, days: 60 } }
      ],
      lines: [].concat(L_('C1', [['P1', 1000000, 1000000]]), L_('C2', [['P1', 1000000, 1000000]]), L_('C3', [['P1', 1000000, 1000000]])),
      logistics: [] }
  ];
  function presetInput(id) {
    var p = PRESETS.filter(function (x) { return x.id === id; })[0];
    if (!p) return null;
    var o = JSON.parse(JSON.stringify(p.tender));
    o.items = JSON.parse(JSON.stringify(p.items)); o.bids = JSON.parse(JSON.stringify(p.bids));
    o.lines = JSON.parse(JSON.stringify(p.lines)); o.logistics = JSON.parse(JSON.stringify(p.logistics));
    return o;
  }

  return { version: VERSION, ELEMENTS: ELEMENTS, INCL: INCL, INCOTERMS: INCOTERMS, KINDS: KINDS, normalize: normalize,
           paymentFactor: paymentFactor, incotermGap: incotermGap, PRESETS: PRESETS, presetInput: presetInput };
}));
