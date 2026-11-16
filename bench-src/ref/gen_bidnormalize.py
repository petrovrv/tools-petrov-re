#!/usr/bin/env python3
"""Independent reference for bidnormalize.html (Commercial Bid Normalisation).

Written from the published method (KB 18.04.2017 art. 34, 48 par. 3, 86 par. 2, 87 par. 1; ICC Incoterms 2020 cost structure;
present value of payment terms) as described in _tnd/bidnormalize/SPEC.md -- not ported from tnd-bidnorm.js.
Tool rules that are not in the law are explicit SPEC rules (SPEC section 3a): provisional quantity, no fill when X = 0,
items nobody priced, input checks, tie tolerance. Hand cases with literal values traced to the article text are asserted
before the file is written (art. 86 par. 2 two blank items, donor with a blank, art. 48 par. 3, provisional qty 0,
Incoterms stage table derived from the rule descriptions A2/A4/A5/A7/B7/A9).
Writes bench-src/ref/bidnormalize_ref.json: cases {id, kind, input, expect}. Standard library only.

Run: python3 bench-src/ref/gen_bidnormalize.py
"""
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'bidnormalize_ref.json')

# Incoterms 2020: delivery stages whose cost the seller carries in its price (stage names in our words).
# 1 origin loading/packing, 2 export clearance, 3 to/onto main carrier, 4 main carriage, 5 transit insurance,
# 6 on-carriage to site, 7 unloading at site, 8 import clearance and duties.
SELLER_PAYS = {
    'EXW': set(),
    'FCA': {1, 2},
    'FAS': {1, 2, 3},
    'FOB': {1, 2, 3},
    'CFR': {1, 2, 3, 4},
    'CPT': {1, 2, 3, 4},
    'CIF': {1, 2, 3, 4, 5},
    'CIP': {1, 2, 3, 4, 5},
    'DAP': {1, 2, 3, 4, 5, 6},
    'DPU': {1, 2, 3, 4, 5, 6, 7},
    'DDP': {1, 2, 3, 4, 5, 6, 8},
}
TERMS = sorted(SELLER_PAYS)


def v(rate, months):
    """discount factor for a payment `months` after award at annual rate `rate`"""
    return (1.0 + rate) ** (-months / 12.0)


def mean(xs):
    return sum(xs) / len(xs)


def evaluate(t):
    """t: the tender dict in the engine's input shape. Returns {bid_id: {...}} plus ranking."""
    rate, T, ref_days = t['rate'], t['T'], t['refDays']
    price_only = bool(t.get('priceOnly'))
    ref = t['ref']
    policy_arith, policy_missing = t['arith'], t['missing']
    items = t['items']
    bids = t['bids']
    lines = {(ln['bid'], ln['item']): ln for ln in t['lines']}
    costs = {b['id']: {k: 0.0 for k in range(1, 9)} for b in bids}
    for x in t.get('logistics', []):
        costs[x['bid']][int(x['el'][1:])] += x['amount']

    def counts(it):
        if it['kind'] == 'free_option':
            return bool(it.get('include'))
        return True

    in_scope = [it for it in items if counts(it)]
    base_kinds = ('base', 'provisional')
    must_price = ('base', 'provisional', 'req_option')

    # corrected amount per (bid, item); None = blank
    amount = {}
    log = {b['id']: [] for b in bids}
    blanks = {b['id']: [] for b in bids}
    for b in bids:
        for it in items:
            q = it['qty'] if it.get('qty') is not None else 0
            ln = lines.get((b['id'], it['id']))
            up = ln.get('up') if ln else None
            st = ln.get('amount') if ln else None
            if it['kind'] == 'provisional':
                # SPEC 3a: the client's sum = up x qty; an empty quantity means one lump sum, quantity 0 means nothing
                qp = 1 if it.get('qty') is None else it['qty']
                fixed = it['up'] * qp
                amount[(b['id'], it['id'])] = fixed
                given = st if st is not None else (up * qp if up is not None else None)
                if given is not None and abs(given - fixed) > 0.005 + 1e-9 * abs(fixed):
                    log[b['id']].append(('provisional', it['id'], fixed - given))
                continue
            if up is None and st is None:
                amount[(b['id'], it['id'])] = None
                if it['kind'] in must_price and counts(it):
                    blanks[b['id']].append(it['id'])
                continue
            if st is None:
                amount[(b['id'], it['id'])] = q * up
                continue
            if up is None:
                amount[(b['id'], it['id'])] = st
                continue
            prod = q * up
            if abs(prod - st) <= 0.005 + 1e-9 * abs(st):
                amount[(b['id'], it['id'])] = st
                continue
            dec = ln.get('decision', 'auto')
            if dec not in ('unit', 'stated'):
                dec = policy_arith
            val = prod if dec == 'unit' else st
            amount[(b['id'], it['id'])] = val
            log[b['id']].append((dec, it['id'], val - st))

    # art. 48 par. 3 / art. 87 par. 1 al. 4: price-only award -> a free or permitted option with an extra price is left out
    disregarded = {b['id']: [] for b in bids}
    if price_only:
        for b in bids:
            for it in in_scope:
                if it['kind'] in ('perm_option', 'free_option'):
                    a = amount[(b['id'], it['id'])]
                    if a is not None and a > 0.005:
                        amount[(b['id'], it['id'])] = None
                        disregarded[b['id']].append(it['id'])

    tech = {b['id']: b.get('tech', '') for b in bids}
    rejected = {b['id']: (policy_missing == 'reject' and len(blanks[b['id']]) > 0) for b in bids}
    eligible = [b['id'] for b in bids if not rejected[b['id']] and tech[b['id']] != 'fail']

    # SPEC 3a: an item left blank by somebody and priced by no eligible bid has no L -> out of the comparison for all (fill policy)
    if policy_missing == 'fill' and eligible:
        nobody = set()
        for it in in_scope:
            if any(it['id'] in blanks[b['id']] for b in bids) and all(amount[(o, it['id'])] is None for o in eligible):
                nobody.add(it['id'])
        if nobody:
            in_scope = [it for it in in_scope if it['id'] not in nobody]
            for b in bids:
                blanks[b['id']] = [i for i in blanks[b['id']] if i not in nobody]

    def total_without(bid, skip):
        s = 0.0
        for it in in_scope:
            if it['id'] in skip:
                continue
            a = amount[(bid, it['id'])]
            if a is not None:
                s += a
        return s

    filled = {b['id']: {} for b in bids}
    no_fill = {b['id']: False for b in bids}
    if policy_missing == 'fill':
        for b in bids:
            me = b['id']
            if not blanks[me]:
                continue
            Y = total_without(me, blanks[me])
            for item_id in blanks[me]:
                donors = [o for o in eligible if o != me and amount[(o, item_id)] is not None]
                if not donors:
                    no_fill[me] = True
                    continue
                Lv = mean([amount[(o, item_id)] for o in donors])
                Xv = mean([total_without(o, blanks[me]) for o in donors])
                if Xv == 0:
                    no_fill[me] = True
                    continue
                filled[me][item_id] = Lv * Y / Xv

    res = {}
    for b in bids:
        me = b['id']
        base_sum = sum(amount[(me, it['id'])] for it in in_scope
                       if it['kind'] in base_kinds and amount[(me, it['id'])] is not None)
        fill_base = sum(p for k, p in filled[me].items() if next(i for i in items if i['id'] == k)['kind'] in base_kinds)
        fill_all = sum(filled[me].values())
        opts = sum(amount[(me, it['id'])] for it in in_scope
                   if it['kind'] not in base_kinds and amount[(me, it['id'])] is not None) + (fill_all - fill_base)
        readout = b.get('readout')
        arith = base_sum - readout if readout is not None else 0.0
        sub = base_sum + fill_base + opts
        net = sub * (1.0 - b.get('rebate', 0.0))
        fx = b.get('fx', 1.0)
        S = net * fx
        # delivery-term gap
        term = b['incoterm'] if b.get('incoterm') in SELLER_PAYS else ref
        duty = b.get('duty', 0.0)
        c = costs[me]
        bid_has, ref_has = SELLER_PAYS[term], SELLER_PAYS[ref]
        if 8 in bid_has:
            cv = (S - c[6] - c[8]) / (1.0 + duty)
        else:
            cv = S + sum(c[k] for k in (1, 2, 3, 4, 5) if k not in bid_has) - sum(c[k] for k in (6, 7) if k in bid_has)
        gap = 0.0
        for k in range(1, 9):
            cost_k = c[8] + duty * cv if k == 8 else c[k]
            if k in ref_has and k not in bid_has:
                gap += cost_k
            elif k in bid_has and k not in ref_has:
                gap -= cost_k
        # payment terms
        pay = b.get('payment', {})
        adv, ret, ret_m = pay.get('adv', 0.0), pay.get('ret', 0.0), pay.get('retM', 0.0)
        days = pay.get('days', ref_days)
        pv = adv + (1.0 - adv - ret) * v(rate, T + days / 30.0) + ret * v(rate, T + ret_m + days / 30.0)
        pv_ref = v(rate, T + ref_days / 30.0)
        pay_adj = S * (pv / pv_ref - 1.0)
        N = S + gap + pay_adj
        # SPEC 3a input checks: impossible inputs leave the bid unranked
        sane = (fx > 0 and 0 <= b.get('rebate', 0.0) < 1 and duty >= 0
                and min(adv, ret, ret_m, pay.get('days', 0)) >= 0 and math.isfinite(N))
        ranked = (not rejected[me]) and tech[me] != 'fail' and not no_fill[me] and (1.0 - adv - ret) >= -1e-12 and sane
        res[me] = {'arith': arith, 'fill': fill_all, 'options': opts, 'S': S, 'gap': gap, 'payAdj': pay_adj, 'N': N,
                   'readoutEval': (readout if readout is not None else base_sum) * fx, 'ranked': ranked,
                   'rejected': rejected[me], 'nCorr': len(log[me]), 'fills': filled[me], 'disregarded': disregarded[me]}

    def ranks(key):
        ids = [b['id'] for b in bids if res[b['id']]['ranked']]
        out = {}
        for i in ids:
            x = res[i][key]
            out[i] = 1 + sum(1 for j in ids if res[j][key] < x - 1e-9 * max(1.0, abs(x)))
        return out

    rN, rR = ranks('N'), ranks('readoutEval')
    for b in bids:
        res[b['id']]['rank'] = rN.get(b['id'])
        res[b['id']]['readoutRank'] = rR.get(b['id'])
    order = sorted([i for i in res if res[i]['ranked']], key=lambda i: (res[i]['N'], i))
    best = order[0] if order else None
    order_r = sorted([i for i in res if res[i]['ranked']], key=lambda i: (res[i]['readoutEval'], i))
    return {'bids': res, 'best': best, 'readoutBest': order_r[0] if order_r else None}


# ------------------------------------------------------------------ cases
def rnd_tender(rng, k):
    nb = rng.randint(2, 6)
    ni = rng.randint(3, 12)
    items = []
    for i in range(ni):
        kind = rng.choices(['base', 'provisional', 'req_option', 'perm_option', 'free_option'], [6, 1, 1.5, 1, 1])[0]
        it = {'id': 'I%02d' % i, 'desc': 'item %d' % i, 'unit': 'u', 'qty': rng.choice([1, 2, 3, 10, 25, 120, 420, 1500.5]), 'kind': kind}
        if kind == 'provisional':
            it['qty'] = 1
            it['up'] = rng.choice([5000, 12500, 40000])
        if kind == 'free_option':
            it['include'] = rng.random() < 0.5
        items.append(it)
    if not any(it['kind'] == 'base' for it in items):
        items[0]['kind'] = 'base'
        items[0].pop('up', None)
        items[0].pop('include', None)
    bids, lines, logi = [], [], []
    for j in range(nb):
        bid = 'B%d' % (j + 1)
        cur = rng.choice(['EUR', 'EUR', 'USD', 'GBP'])
        fx = 1.0 if cur == 'EUR' else round(rng.uniform(0.7, 1.25), 4)
        term = rng.choice(TERMS)
        adv = rng.choice([0, 0, 0.1, 0.2, 0.3])
        ret = rng.choice([0, 0.05, 0.1])
        b = {'id': bid, 'name': 'Bidder %d' % (j + 1), 'currency': cur, 'fx': fx, 'rebate': rng.choice([0, 0, 0.01, 0.025]),
             'incoterm': term, 'duty': rng.choice([0, 0, 0.017, 0.027, 0.045]), 'tech': rng.choice(['pass', 'pass', 'pass', '', 'fail']),
             'payment': {'adv': adv, 'ret': ret, 'retM': rng.choice([0, 12, 24]), 'days': rng.choice([30, 45, 60, 90])}}
        stated_base = 0.0
        for it in items:
            if it['kind'] == 'provisional':
                r = rng.random()
                if r < 0.15:
                    lines.append({'bid': bid, 'item': it['id'], 'up': None, 'amount': it['up'] * 0.9, 'decision': 'auto'})
                    stated_base += it['up'] * 0.9
                else:
                    stated_base += it['up']
                continue
            r = rng.random()
            up = round(rng.uniform(50, 90000) / max(1, it['qty'] ** 0.5), 2)
            q = it['qty']
            if r < 0.10:
                continue  # blank
            if r < 0.20:
                amt = round(q * up * rng.choice([10, 0.1, 1.1, 0.9]), 2)
                dec = rng.choice(['auto', 'auto', 'unit', 'stated'])
                lines.append({'bid': bid, 'item': it['id'], 'up': up, 'amount': amt, 'decision': dec})
            elif r < 0.25:
                amt = round(q * up, 2)
                lines.append({'bid': bid, 'item': it['id'], 'up': None, 'amount': amt, 'decision': 'auto'})
            elif r < 0.30:
                amt = None
                lines.append({'bid': bid, 'item': it['id'], 'up': up, 'amount': None, 'decision': 'auto'})
            else:
                amt = round(q * up, 2)
                lines.append({'bid': bid, 'item': it['id'], 'up': up, 'amount': amt, 'decision': 'auto'})
            if it['kind'] in ('base',):
                stated_base += amt if amt is not None else q * up
        b['readout'] = round(stated_base * rng.choice([1, 1, 1, 1.02, 0.99]), 2)
        bids.append(b)
        for e in range(1, 9):
            if rng.random() < 0.6:
                logi.append({'bid': bid, 'el': 'E%d' % e, 'amount': round(rng.uniform(0, 60000), 2)})
    return {'cur': 'EUR', 'rate': rng.choice([0.0, 0.03, 0.06, 0.08, 0.12]), 'T': rng.choice([0, 3, 10, 14, 24]),
            'ref': rng.choice(['DAP', 'DAP', 'DDP', 'DPU', 'FCA', 'CIP']), 'refDays': rng.choice([30, 60]),
            'arith': rng.choice(['unit', 'stated']), 'missing': rng.choice(['fill', 'fill', 'reject']),
            'items': items, 'bids': bids, 'lines': lines, 'logistics': logi}


def hand_cases():
    cases = []
    # art. 86 par. 2 worked example (hand): L = (50+70)/2 = 60, Y = 300, X = mean(300, 300) = 300 -> P = 60
    items = [{'id': 'A', 'qty': 1, 'kind': 'base'}, {'id': 'B', 'qty': 1, 'kind': 'base'}, {'id': 'C', 'qty': 1, 'kind': 'base'}]
    def bid(i, ro):
        return {'id': i, 'currency': 'EUR', 'fx': 1, 'readout': ro, 'rebate': 0, 'incoterm': 'DAP', 'duty': 0, 'tech': 'pass', 'payment': {}}
    def ln(b, it, a):
        return {'bid': b, 'item': it, 'up': a, 'amount': a, 'decision': 'auto'}
    base = {'cur': 'EUR', 'rate': 0, 'T': 0, 'ref': 'DAP', 'refDays': 30, 'arith': 'unit', 'missing': 'fill', 'items': items, 'logistics': []}
    t1 = dict(base, bids=[bid('X', 300), bid('P1', 350), bid('P2', 370)],
              lines=[ln('X', 'A', 110), ln('X', 'B', 190), ln('P1', 'A', 100), ln('P1', 'B', 200), ln('P1', 'C', 50),
                     ln('P2', 'A', 120), ln('P2', 'B', 180), ln('P2', 'C', 70)])
    cases.append({'id': 'hand-art86-P60', 'kind': 'hand', 'input': t1, 'hand': {'bid': 'X', 'item': 'C', 'P': 60.0, 'N': 360.0}})
    # same, P2 item A = 150 -> X = mean(300, 330) = 315 -> P = 60*300/315 = 57.142857...
    t2 = json.loads(json.dumps(t1))
    t2['lines'][5]['up'] = 150; t2['lines'][5]['amount'] = 150; t2['bids'][2]['readout'] = 400
    cases.append({'id': 'hand-art86-X315', 'kind': 'hand', 'input': t2, 'hand': {'bid': 'X', 'item': 'C', 'P': 60.0 * 300 / 315}})
    # NPV hand: 30 % advance at 8 %/yr, T = 12, 30 days: factor = 0.3 / 1.08^(-13/12) + 0.7
    t3 = dict(base, rate=0.08, T=12, items=[{'id': 'P', 'qty': 1, 'kind': 'base'}],
              bids=[dict(bid('A', 1e6), payment={'adv': 0.3, 'ret': 0, 'retM': 0, 'days': 30})], lines=[ln('A', 'P', 1e6)])
    cases.append({'id': 'hand-npv-adv30', 'kind': 'hand', 'input': t3, 'hand': {'bid': 'A', 'N': 1e6 * (0.3 / 1.08 ** (-13 / 12) + 0.7)}})
    # arithmetic: 365 x 420 = 153 300 stated 135 300 -> unit +18 000, stated 0
    for pol, d in (('unit', 18000.0), ('stated', 0.0)):
        t4 = dict(base, arith=pol, items=[{'id': '04', 'qty': 420, 'kind': 'base'}], bids=[bid('B2', 135300)],
                  lines=[{'bid': 'B2', 'item': '04', 'up': 365, 'amount': 135300, 'decision': 'auto'}])
        cases.append({'id': 'hand-arith-' + pol, 'kind': 'hand', 'input': t4, 'hand': {'bid': 'B2', 'arith': d}})
    # Incoterms matrix: one bid per term, costs E_k = 2^(k-1), duty 0, S = 1000 -> gap = signed sum over the symmetric difference
    for ref in TERMS:
        bids, lines, logi = [], [], []
        for term in TERMS:
            bids.append(dict(bid(term, 1000), incoterm=term))
            lines.append(ln(term, 'A', 1000))
            for k in range(1, 9):
                logi.append({'bid': term, 'el': 'E%d' % k, 'amount': float(2 ** (k - 1))})
        t5 = dict(base, ref=ref, items=[{'id': 'A', 'qty': 1, 'kind': 'base'}], bids=bids, lines=lines, logistics=logi)
        exp = {term: float(sum(2 ** (k - 1) for k in SELLER_PAYS[ref] - SELLER_PAYS[term]) - sum(2 ** (k - 1) for k in SELLER_PAYS[term] - SELLER_PAYS[ref]))
               for term in TERMS}
        cases.append({'id': 'hand-incoterm-ref-' + ref, 'kind': 'hand', 'input': t5, 'hand': {'gaps': exp}})
    # art. 86 par. 2 last-but-one paragraph: X leaves out ALL items the omitting bidder left blank.
    # X blanks C and D. Totals without C and D: P1 110+190 = 300, P2 130+230 = 360 -> X = 330 for both items; Y = 300.
    # P_C = 45 x 300 / 330 = 40.909090..., P_D = 70 x 300 / 330 = 63.636363...; N_X = 300 + 115 x 300 / 330 = 404.545454...
    items4 = [{'id': k, 'qty': 1, 'kind': 'base'} for k in 'ABCD']
    t6 = dict(base, items=items4, bids=[bid('X', 300), bid('P1', 400), bid('P2', 490)],
              lines=[ln('X', 'A', 100), ln('X', 'B', 200), ln('P1', 'A', 110), ln('P1', 'B', 190), ln('P1', 'C', 40), ln('P1', 'D', 60),
                     ln('P2', 'A', 130), ln('P2', 'B', 230), ln('P2', 'C', 50), ln('P2', 'D', 80)])
    cases.append({'id': 'hand-art86-two-blanks', 'kind': 'hand', 'input': t6,
                  'hand': {'bid': 'X', 'item': 'C', 'P': 45 * 300 / 330, 'P2': ('D', 70 * 300 / 330), 'N': 300 + 115 * 300 / 330}})
    # donor with its own blank (the article is silent; the literal formula is applied and the page warns):
    # X blanks C (A 100, B 100); P1 blanks B (A 100, C 50); P2 prices all (100, 100, 50).
    # P_C(X) = L 50 x Y 200 / X mean(100, 200) = 150 -> 66.666...; P_B(P1) = L 100 x Y 150 / X mean(X: 100, P2: 150) = 125 -> 120.
    items3 = [{'id': k, 'qty': 1, 'kind': 'base'} for k in 'ABC']
    t7 = dict(base, items=items3, bids=[bid('X', 200), bid('P1', 150), bid('P2', 250)],
              lines=[ln('X', 'A', 100), ln('X', 'B', 100), ln('P1', 'A', 100), ln('P1', 'C', 50), ln('P2', 'A', 100), ln('P2', 'B', 100), ln('P2', 'C', 50)])
    cases.append({'id': 'hand-art86-donor-blank', 'kind': 'hand', 'input': t7, 'hand': {'bid': 'X', 'item': 'C', 'P': 50 * 200 / 150, 'P2': ('P1', 'B', 120.0)}})
    # nobody priced item C (SPEC 3a): C leaves the comparison, both bids ranked on A + B: N = 300 and 310
    t8 = dict(base, items=items3, bids=[bid('X', 300), bid('P1', 310)],
              lines=[ln('X', 'A', 100), ln('X', 'B', 200), ln('P1', 'A', 110), ln('P1', 'B', 200)])
    cases.append({'id': 'hand-nobody-priced', 'kind': 'hand', 'input': t8, 'hand': {'bid': 'X', 'N': 300.0, 'rankedAll': True}})
    # art. 48 par. 3 + art. 87 par. 1 al. 4: price-only award, permitted option O priced 5 000 by A, 0 by B ->
    # disregarded for A: N_A = 100 000; without the price-only flag the option counts: N_A = 105 000
    items48 = [{'id': 'M', 'qty': 1, 'kind': 'base'}, {'id': 'O', 'qty': 1, 'kind': 'perm_option'}]
    for po, na in ((True, 100000.0), (False, 105000.0)):
        t9 = dict(base, priceOnly=po, items=items48, bids=[bid('A', 100000), bid('B', 102000)],
                  lines=[ln('A', 'M', 100000), ln('A', 'O', 5000), ln('B', 'M', 102000), ln('B', 'O', 0)])
        cases.append({'id': 'hand-art48-priceonly-' + ('on' if po else 'off'), 'kind': 'hand', 'input': t9, 'hand': {'bid': 'A', 'N': na}})
    # provisional sum: qty 0 -> 0 (not up x 1); qty missing -> one lump sum
    for q, nv in ((0, 1000.0), (None, 1000.0 + 25000.0)):
        itp = {'id': 'S', 'kind': 'provisional', 'up': 25000}
        if q is not None:
            itp['qty'] = q
        t10 = dict(base, items=[{'id': 'M', 'qty': 1, 'kind': 'base'}, itp], bids=[bid('A', None)], lines=[ln('A', 'M', 1000)])
        cases.append({'id': 'hand-provisional-qty-' + ('0' if q == 0 else 'none'), 'kind': 'hand', 'input': t10, 'hand': {'bid': 'A', 'N': nv}})
    # input checks: fx 0 and a 100 % rebate leave the bid unranked (never silently replaced)
    t11 = dict(base, items=[{'id': 'M', 'qty': 1, 'kind': 'base'}], bids=[dict(bid('A', 100), fx=0), dict(bid('B', 100), rebate=1.0), bid('C', 120)],
               lines=[ln('A', 'M', 100), ln('B', 'M', 100), ln('C', 'M', 120)])
    cases.append({'id': 'hand-input-checks', 'kind': 'hand', 'input': t11, 'hand': {'bid': 'C', 'N': 120.0, 'unranked': ['A', 'B']}})
    return cases


# Incoterms 2020 stage table re-derived from the rule descriptions (our words; ICC article numbers only):
# A2 where the seller delivers, A4 who contracts/pays main carriage, A5 who must insure (CIF/CIP), A7 export clearance,
# B7 import clearance by the buyer except DDP, A9 costs; risk to destination in D rules means the seller carries transit
# insurance cost in its own interest; unloading at destination only in DPU (A2 "unloaded"); duties only in DDP (A7/A9).
RULE_FACTS = {
    #      export cleared, onto main carrier, main carriage, insurance, at destination, unloaded, import cleared
    'EXW': (0, 0, 0, 0, 0, 0, 0), 'FCA': (1, 0, 0, 0, 0, 0, 0), 'FAS': (1, 1, 0, 0, 0, 0, 0), 'FOB': (1, 1, 0, 0, 0, 0, 0),
    'CPT': (1, 1, 1, 0, 0, 0, 0), 'CFR': (1, 1, 1, 0, 0, 0, 0), 'CIP': (1, 1, 1, 1, 0, 0, 0), 'CIF': (1, 1, 1, 1, 0, 0, 0),
    'DAP': (1, 1, 1, 1, 1, 0, 0), 'DPU': (1, 1, 1, 1, 1, 1, 0), 'DDP': (1, 1, 1, 1, 1, 0, 1)}


def stages_from_facts(f):
    exp, onto, main_c, ins, dest, unl, imp = f
    st = set()
    if exp:
        st |= {1, 2}          # packing/loading at origin goes with any seller delivery beyond its premises (A8/A9), export clearance A7
    if onto:
        st.add(3)
    if main_c:
        st.add(4)
    if ins:
        st.add(5)
    if dest:
        st.add(6)
    if unl:
        st.add(7)
    if imp:
        st.add(8)
    return st


def main():
    here_root = os.path.dirname(os.path.dirname(HERE))
    cases = []
    # presets: input copied from the engine file at run time by the driver? No -- the presets are re-typed here from the SPEC
    # through the engine's own preset list exported as JSON by the driver would not be independent; so the presets are read
    # from bidnormalize_presets.json (the data, not the code), written once from the page's preset data and diffed by the driver.
    pfile = os.path.join(HERE, 'bidnormalize_presets.json')
    if os.path.exists(pfile):
        with open(pfile, encoding='utf-8') as f:
            for p in json.load(f):
                cases.append({'id': 'preset-' + p['id'], 'kind': 'preset', 'input': p['input']})
    for c in hand_cases():
        cases.append(c)
    rng = random.Random(20261114)
    for k in range(300):
        cases.append({'id': 'random-%03d' % k, 'kind': 'random', 'input': rnd_tender(rng, k)})
    for term, f in RULE_FACTS.items():
        assert stages_from_facts(f) == SELLER_PAYS[term], ('incoterm table vs rule facts', term)
    for c in cases:
        c['expect'] = evaluate(c['input'])
    # hand cases: assert the reference against the hand values before writing
    for c in cases:
        h = c.get('hand')
        if not h:
            continue
        e = c['expect']['bids']
        if 'P' in h:
            assert abs(e[h['bid']]['fills'][h['item']] - h['P']) < 1e-9, c['id']
        if 'P2' in h:
            if len(h['P2']) == 2:
                assert abs(e[h['bid']]['fills'][h['P2'][0]] - h['P2'][1]) < 1e-9, c['id']
            else:
                assert abs(e[h['P2'][0]]['fills'][h['P2'][1]] - h['P2'][2]) < 1e-9, c['id']
        if h.get('rankedAll'):
            assert all(x['ranked'] for x in e.values()), c['id']
        if 'unranked' in h:
            assert all(not e[i]['ranked'] for i in h['unranked']), c['id']
        if 'N' in h:
            assert abs(e[h['bid']]['N'] - h['N']) < 1e-6, c['id']
        if 'arith' in h:
            assert abs(e[h['bid']]['arith'] - h['arith']) < 1e-9, c['id']
        if 'gaps' in h:
            for term, g in h['gaps'].items():
                assert abs(e[term]['gap'] - g) < 1e-9, (c['id'], term)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'generator': 'gen_bidnormalize.py', 'seed': 20261114, 'cases': cases}, f, separators=(',', ':'))
    print('bidnormalize reference: %d cases -> %s' % (len(cases), OUT))


if __name__ == '__main__':
    main()
