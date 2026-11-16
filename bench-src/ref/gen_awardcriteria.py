"""Independent reference for awardcriteria.html (Award Criteria & Price Scoring Designer).

Written from the published method definitions in _tnd/awardcriteria/SPEC.md (price-scoring formulas of public-procurement
practice; rank reversal = independence of irrelevant alternatives, Bergman & Lundberg 2013; monetised quality = evaluated
price P - V*Q), NOT ported from tnd-award.js: own data layout, own sorting, own root finding for the value of a point
(Illinois false position on the lead function instead of bisection), own sensitivity loop.

Run (stdlib only):  python -I bench-src/ref/gen_awardcriteria.py   -> bench-src/ref/awardcriteria_ref.json
"""
import json
import math
import pathlib
import random

METHODS = ['proportional', 'linear_zero', 'linear_pct', 'interpolation', 'mean_relative', 'floor', 'absolute', 'monetised']
TIE = ['absolute', 'monetised', 'proportional', 'linear_zero', 'linear_pct', 'floor', 'mean_relative', 'interpolation']
PEN = dict(reversal=40, dependent=15, zero=15, mean=10, outside=20, refOff=30)
TIE_TOL = 1e-9          # SPEC: scores within 1e-9 * max(1, |score|) of each other are tied (D-TND-7)
REF_BAND = (0.5, 2.0)   # SPEC: P_ref outside 0.5..2 x median bid -> anchors / value of quality implausible (D-TND-7)


def clip(x):
    return 0.0 if x < 0 else (1.0 if x > 1 else x)


class Case:
    """one evaluation problem: weights in points, quality criteria, bids (id, price, scores), reference price, parameters"""

    def __init__(self, d):
        self.W = float(d['W'])
        self.qnorm = d.get('qnorm', 'scale')
        self.items = [(it['id'], float(it['weight']), float(it.get('max', 10))) for it in d['items']]
        self.bids = [(b['id'], float(b['price']), dict(b.get('q', {}))) for b in d['bids'] if b.get('included', True) and b['price'] > 0]
        r = d.get('ref', {})
        self.pref = r.get('price')
        self.lo = r.get('lo', 0.8)
        self.hi = r.get('hi', 1.3)
        self.Vgiven = r.get('V')
        p = d.get('params', {})
        self.k = p.get('zeroFactor', 2.0)
        self.a = p.get('slope', 2.0)   # default a = 2 (zero at +50 %), distinct from linear_zero k = 2 (D-TND-7)
        self.am = p.get('slopeMean', 1.0)
        self.f = p.get('floorFactor', 0.85)

    def sum_q(self):
        return sum(max(0.0, w) for _, w, _ in self.items)

    def V(self):
        if self.Vgiven is not None and self.Vgiven >= 0:
            return self.Vgiven
        if self.pref and self.W > 0:
            return self.pref * self.sum_q() / self.W
        return None

    def available(self, m):
        if m == 'absolute':
            return bool(self.pref) and self.hi > self.lo
        if m == 'monetised':
            return self.V() is not None
        return True


def quality_points(case, bids):
    best = {}
    for qid, _, _ in case.items:
        best[qid] = max([b[2].get(qid, 0) or 0 for b in bids] + [0])
    out = {}
    for bid, _, q in bids:
        tot = 0.0
        for qid, w, mx in case.items:
            v = q.get(qid, 0) or 0
            if case.qnorm == 'best':
                frac = v / best[qid] if best[qid] > 0 else 0.0
            else:
                frac = clip(v / mx) if mx > 0 else 0.0
            tot += max(0.0, w) * frac
        out[bid] = tot
    return out


def score_of_price(case, m, P, prices):
    lo_, hi_ = min(prices), max(prices)
    mean = sum(prices) / len(prices)
    if m == 'proportional':
        return lo_ / P
    if m == 'linear_zero':
        z = case.k * lo_
        if z <= lo_:
            return 1.0 if P <= lo_ else 0.0
        return clip((z - P) / (z - lo_))
    if m == 'linear_pct':
        return clip(1 - case.a * (P - lo_) / lo_)
    if m == 'interpolation':
        return 1.0 if hi_ == lo_ else clip((hi_ - P) / (hi_ - lo_))
    if m == 'mean_relative':
        return clip(0.5 + case.am * (mean - P) / mean)
    if m == 'floor':
        F = case.f * mean
        return clip(max(lo_, F) / max(P, F))
    if m == 'absolute':
        plo, phi = case.lo * case.pref, case.hi * case.pref
        return clip((phi - P) / (phi - plo))
    raise ValueError(m)


def scores(case, m, bids):
    """{id: (value, price)} where a higher value is better (total points, or minus the evaluated price)"""
    qp = quality_points(case, bids)
    prices = [b[1] for b in bids]
    sq = case.sum_q()
    res = {}
    for bid, P, _ in bids:
        if m == 'monetised':
            Q = qp[bid] / sq if sq > 0 else 0.0
            res[bid] = (-(P - case.V() * Q), P, None, qp[bid])
        else:
            s = score_of_price(case, m, P, prices)
            res[bid] = (case.W * s + qp[bid], P, s, qp[bid])
    return res


def ranking(case, m, bids):
    sc = scores(case, m, bids)
    ids = sorted(sc, key=lambda i: (-sc[i][0], sc[i][1], i))
    return ids, sc


def ranks_of(ids, sc):
    """competition ranks: an id takes the rank of its predecessor when their values differ by <= TIE_TOL * max(1, |value|)"""
    rk = {}
    for n, i in enumerate(ids):
        if n and abs(sc[ids[n - 1]][0] - sc[i][0]) <= TIE_TOL * max(1.0, abs(sc[i][0])):
            rk[i] = rk[ids[n - 1]]
        else:
            rk[i] = n + 1
    return rk


def top_set(ids, sc):
    rk = ranks_of(ids, sc)
    t = [i for i in ids if rk[i] == 1]
    return t if len(t) > 1 else []


def swapped(base_rk, new, new_rk):
    """pairs strictly ordered in the base ranking and strictly reversed in the new one (ties are not reversals)"""
    out = []
    for i in range(len(new)):
        for j in range(i + 1, len(new)):
            x, y = new[i], new[j]
            if x in base_rk and y in base_rk and base_rk[y] < base_rk[x] and new_rk[x] < new_rk[y]:
                out.append([y, x])
    return out


def reversal_cases(case, m, test):
    base, bsc = ranking(case, m, case.bids)
    brk = ranks_of(base, bsc)
    cases = []
    if len(case.bids) >= 3:
        for b in case.bids:
            rest = [x for x in case.bids if x[0] != b[0]]
            new, nsc = ranking(case, m, rest)
            cases.append({'action': 'remove', 'id': b[0], 'swaps': swapped(brk, new, ranks_of(new, nsc))})
    if test:
        tb = (test['id'], float(test['price']), dict(test.get('q', {})))
        new, nsc = ranking(case, m, case.bids + [tb])
        nrk = ranks_of(new, nsc)
        cases.append({'action': 'add', 'id': tb[0], 'swaps': swapped(brk, [x for x in new if x != tb[0]], nrk), 'testRank': nrk[tb[0]]})
    return cases


def eur_per_point(case, m):
    order, sc = ranking(case, m, case.bids)
    if len(order) < 2:
        return None
    win, run = order[0], order[1]
    P0 = [b[1] for b in case.bids if b[0] == win][0]
    if m == 'monetised':
        return case.V() / case.sum_q() if case.sum_q() > 0 else None

    def lead(d):
        bb = [(b[0], (b[1] + d) if b[0] == win else b[1], b[2]) for b in case.bids]
        s = scores(case, m, bb)
        return s[win][0] - s[run][0]

    L0 = lead(0.0)
    g = lambda d: L0 - lead(d) - 1.0       # zero where the winner has lost exactly one point of lead
    a, b = 0.0, P0
    n = 0
    while g(b) < 0 and n < 60:
        b *= 2
        n += 1
    if g(b) < 0:
        return None
    # the lead can be flat (clamped scores) — bracket tightly with bisection, then Illinois false position
    fa, fb = g(a), g(b)
    for _ in range(60):
        mid = 0.5 * (a + b)
        fm = g(mid)
        if fm < 0:
            a, fa = mid, fm
        else:
            b, fb = mid, fm
    side = 0
    for _ in range(200):
        if fb == fa:
            break
        c = (a * fb - b * fa) / (fb - fa)
        fc = g(c)
        if fc < 0:
            a, fa = c, fc
            if side == -1:
                fb *= 0.5
            side = -1
        else:
            b, fb = c, fc
            if side == 1:
                fa *= 0.5
            side = 1
        if b - a <= 1e-13 * P0:
            break
    return 0.5 * (a + b)


def reweighted(case, w):
    c = Case.__new__(Case)
    c.__dict__.update(case.__dict__)
    total = case.W + case.sum_q()
    sq = case.sum_q()
    c.items = [(qid, (total - w) * max(0.0, wt) / sq if sq > 0 else 0.0, mx) for qid, wt, mx in case.items]
    c.W = w
    c.Vgiven = None
    return c


def winners_by_weight(case, m, steps=20):
    total = case.W + case.sum_q()
    out = []
    for k in range(steps + 1):
        w = total * k / steps
        c = reweighted(case, w)
        if m == 'monetised' and w <= 0:
            qp = quality_points(c, c.bids)
            out.append(sorted(c.bids, key=lambda b: (-qp[b[0]], b[1]))[0][0])
        elif m == 'monetised' and w >= total:
            out.append(sorted(c.bids, key=lambda b: b[1])[0][0])
        elif not c.available(m):
            out.append(None)
        else:
            ids, sc = ranking(c, m, c.bids)
            t = top_set(ids, sc)
            out.append('='.join(t) if t else ids[0])
    return out


def ref_off(case):
    """P_ref outside REF_BAND x the median valid bid"""
    if not case.pref or not case.bids:
        return False
    v = sorted(b[1] for b in case.bids)
    n = len(v)
    med = v[n // 2] if n % 2 else 0.5 * (v[n // 2 - 1] + v[n // 2])
    return not (REF_BAND[0] <= case.pref / med <= REF_BAND[1])


def recommendation(case, test):
    prices = [b[1] for b in case.bids]
    rows = []
    for m in METHODS:
        if not case.available(m):
            continue
        fl = dict(reversal=any(c['swaps'] for c in reversal_cases(case, m, test)),
                  dependent=m not in ('absolute', 'monetised') or case.qnorm == 'best',
                  mean=m in ('mean_relative', 'floor'), zero=False, outside=False,
                  refOff=(m == 'absolute' or (m == 'monetised' and not (case.Vgiven is not None and case.Vgiven >= 0))) and ref_off(case))
        if m == 'interpolation' and len(case.bids) >= 2:
            fl['zero'] = True
        if m != 'monetised':
            _, sc = ranking(case, m, case.bids)
            if any(v[2] == 0 and v[1] <= 1.5 * min(prices) for v in sc.values()):
                fl['zero'] = True
        if m == 'absolute':
            fl['outside'] = any(p < case.lo * case.pref or p > case.hi * case.pref for p in prices)
        pen = sum(PEN[k] for k, v in fl.items() if v)
        rows.append((pen, TIE.index(m), m))
    rows.sort()
    return [[m, p] for p, _, m in rows]


def solve(d):
    case = Case(d)
    test = d.get('test')
    out = {'methods': {}}
    for m in METHODS:
        if not case.available(m):
            out['methods'][m] = {'available': False}
            continue
        order, sc = ranking(case, m, case.bids)
        out['methods'][m] = {
            'available': True, 'order': order, 'winner': order[0],
            'score': {i: sc[i][0] for i in sc},
            'priceScore': {i: sc[i][2] for i in sc},
            'qualityPts': {i: sc[i][3] for i in sc},
            'margin': 0.0 if top_set(order, sc) else sc[order[0]][0] - sc[order[1]][0],
            'tie': top_set(order, sc),
            'reversal': reversal_cases(case, m, test),
            'eur': eur_per_point(case, m),
            'byWeight': winners_by_weight(case, m),
        }
    out['recommend'] = recommendation(case, test)
    return out


# --------------------------------------------------------------------------------------------- cases
def presets():
    P = lambda *a: a
    return [
        dict(id='be-school', W=60, method='proportional', qnorm='scale', ref=dict(price=2000000, lo=0.8, hi=1.3),
             items=[dict(id='Q1', weight=25, max=10), dict(id='Q2', weight=15, max=10)],
             bids=[dict(id='A', price=1450000, q=dict(Q1=2, Q2=2)), dict(id='B', price=2000000, q=dict(Q1=8, Q2=7)),
                   dict(id='C', price=2168000, q=dict(Q1=9, Q2=8)), dict(id='D', price=2290000, q=dict(Q1=7, Q2=6))]),
        dict(id='utility-epc', W=50, method='interpolation', qnorm='scale', ref=dict(price=105000000, lo=0.8, hi=1.3),
             items=[dict(id='Q1', weight=30, max=10), dict(id='Q2', weight=20, max=10)],
             bids=[dict(id='A', price=98000000, q=dict(Q1=6.5, Q2=6)), dict(id='B', price=104000000, q=dict(Q1=8.5, Q2=8.2)),
                   dict(id='C', price=131000000, q=dict(Q1=9, Q2=8))]),
        dict(id='trafo', W=70, method='proportional', qnorm='scale', ref=dict(price=3200000, lo=0.8, hi=1.3),
             items=[dict(id='Q1', weight=20, max=10), dict(id='Q2', weight=10, max=10)],
             bids=[dict(id='A', price=3100000, q=dict(Q1=6, Q2=7)), dict(id='B', price=3180000, q=dict(Q1=8, Q2=8)),
                   dict(id='C', price=3250000, q=dict(Q1=9, Q2=9))]),
        dict(id='two-bids', W=60, method='interpolation', qnorm='scale', ref=dict(price=1250000, lo=0.8, hi=1.3),
             items=[dict(id='Q1', weight=40, max=10)],
             bids=[dict(id='A', price=1250000, q=dict(Q1=6)), dict(id='B', price=1275000, q=dict(Q1=9))]),
        dict(id='eng-framework', W=30, method='monetised', qnorm='best', ref=dict(price=1000000, lo=0.8, hi=1.3),
             items=[dict(id='Q1', weight=40, max=10), dict(id='Q2', weight=30, max=10)],
             bids=[dict(id='X', price=880000, q=dict(Q1=8, Q2=6.5)), dict(id='Y', price=1000000, q=dict(Q1=6.5, Q2=9)),
                   dict(id='Z', price=1150000, q=dict(Q1=9.5, Q2=7))]),
    ]


def hand_cases():
    """small sets whose price scores are checked here against values worked out by hand (comments)"""
    base = dict(W=100, qnorm='scale', items=[], ref=dict(price=100, lo=0.8, hi=1.3),
                bids=[dict(id='A', price=100), dict(id='B', price=120), dict(id='C', price=150)])
    out = []
    # proportional: 100/100=1, 100/120=0.8333.., 100/150=0.6667  | linear k=2: (200-P)/100 -> 1, 0.8, 0.5
    # linear_pct a=1: 1-(P-100)/100 -> 1, 0.8, 0.5 | interpolation: (150-P)/50 -> 1, 0.6, 0
    # mean 123.333: 0.5+(M-P)/M -> 0.6892, 0.5270, 0.2838 | floor f=.85 F=104.83: max(100,F)/max(P,F) -> 1, 0.8736, 0.6989
    # absolute lo 80 hi 130: (130-P)/50 -> 0.6, 0.2, 0 (clipped)
    expect = {
        'proportional': [1, 100 / 120, 100 / 150], 'linear_zero': [1, 0.8, 0.5], 'linear_pct': [1, 0.8, 0.5],
        'interpolation': [1, 0.6, 0.0], 'mean_relative': [0.5 + (370 / 3 - 100) / (370 / 3), 0.5 + (370 / 3 - 120) / (370 / 3), 0.5 + (370 / 3 - 150) / (370 / 3)],
        'floor': [1, 0.85 * 370 / 3 / 120, 0.85 * 370 / 3 / 150], 'absolute': [0.6, 0.2, 0.0]}
    for m, sv in expect.items():
        c = dict(base, id='hand-' + m, method=m)
        if m == 'linear_pct':
            c['params'] = dict(slope=1.0)   # a = 1 is the same line as linear_zero k = 2 (a = 1/(k-1)); the default a is 2
        r = solve(c)['methods'][m]
        got = [r['priceScore'][i] for i in 'ABC']
        assert all(abs(g - e) < 1e-12 for g, e in zip(got, sv)), (m, got, sv)
        c['expectPriceScore'] = sv
        out.append(c)
    # monetised: W 50, quality 50 points, V = 100*50/50 = 100; A 100 Q 0.2 -> E 80; B 110 Q 0.5 -> 60; C 130 Q 1 -> 30
    c = dict(id='hand-monetised', W=50, method='monetised', qnorm='scale', ref=dict(price=100), items=[dict(id='Q1', weight=50, max=10)],
             bids=[dict(id='A', price=100, q=dict(Q1=2)), dict(id='B', price=110, q=dict(Q1=5)), dict(id='C', price=130, q=dict(Q1=10))])
    r = solve(c)['methods']['monetised']
    assert [round(-r['score'][i], 9) for i in 'ABC'] == [80, 60, 30]
    c['expectEvaluated'] = [80, 60, 30]
    out.append(c)
    # tie (review R-1): A and B identical (100, Q 5/10), C 120 -> A and B share rank 1 under every method, lead 0,
    # and no reversal is reported for the tied pair (KB 18.04.2017 art. 87 par. 2 decides, not the bidder's name)
    c = dict(id='hand-tie', W=60, method='proportional', qnorm='scale', ref=dict(price=100, lo=0.8, hi=1.3), items=[dict(id='Q1', weight=40, max=10)],
             bids=[dict(id='A', price=100, q=dict(Q1=5)), dict(id='B', price=100, q=dict(Q1=5)), dict(id='C', price=120, q=dict(Q1=5))])
    r = solve(c)['methods']
    for m in METHODS:
        assert r[m]['tie'] == ['A', 'B'] and r[m]['margin'] == 0, (m, r[m]['tie'])
        assert not any(k['swaps'] for k in r[m]['reversal']), m
    c['expectTie'] = ['A', 'B']
    out.append(c)
    # value of a point, proportional, analytic (review R-11): winner B (104, Q 10/10) vs A (100 = lowest, Q 0), W 70.
    # B loses one point when 70*100/104 - 70*100/(104+d) = 1  ->  d = 104^2 / (70*100 - 104) = 10816/6896 = 1.56844547...
    c = dict(id='hand-eur-proportional', W=70, method='proportional', qnorm='scale', ref=dict(price=100, lo=0.8, hi=1.3), items=[dict(id='Q1', weight=30, max=10)],
             bids=[dict(id='A', price=100, q=dict(Q1=0)), dict(id='B', price=104, q=dict(Q1=10))])
    e = 104.0 ** 2 / (70 * 100 - 104)
    assert abs(solve(c)['methods']['proportional']['eur'] - e) < 1e-9 * e
    c['expectEur'] = e
    out.append(c)
    # rank reversal by hand, interpolation (review R-11): W 50, Q1 50 points. A 100 Q0, B 110 Q5, C 200 Q6.
    # all three: A 50*1 + 0 = 50, B 50*(200-110)/100 + 25 = 70, C 0 + 30 = 30 -> B > A > C.
    # without C (Pmax 110): A 50 + 0 = 50, B 0 + 25 = 25 -> A > B: the irrelevant bid C decided between A and B.
    c = dict(id='hand-reversal-interpolation', W=50, method='interpolation', qnorm='scale', ref=dict(price=150, lo=0.8, hi=1.3), items=[dict(id='Q1', weight=50, max=10)],
             bids=[dict(id='A', price=100, q=dict(Q1=0)), dict(id='B', price=110, q=dict(Q1=5)), dict(id='C', price=200, q=dict(Q1=6))])
    r = solve(c)['methods']['interpolation']
    assert r['order'] == ['B', 'A', 'C'] and abs(r['score']['B'] - 70) < 1e-12 and abs(r['score']['A'] - 50) < 1e-12
    sw = {k['id']: k['swaps'] for k in r['reversal']}
    assert sw == {'A': [], 'B': [], 'C': [['B', 'A']]}, sw
    c['expectSwaps'] = {'C': [['B', 'A']], 'A': [], 'B': []}
    out.append(c)
    # stale reference price (review R-2): P_ref 2 000 000 kept from another tender, bids 100..120 (median 110, ratio 18 182 > 2)
    # -> monetised carries the refOff penalty 30, absolute refOff 30 + outside 20 = 50; neither is recommended first
    c = dict(id='hand-ref-stale', W=60, method='proportional', qnorm='scale', ref=dict(price=2000000, lo=0.8, hi=1.3), items=[dict(id='Q1', weight=40, max=10)],
             bids=[dict(id='A', price=100, q=dict(Q1=4)), dict(id='B', price=110, q=dict(Q1=7)), dict(id='C', price=120, q=dict(Q1=9))])
    rec = dict(solve(c)['recommend'])
    assert rec['monetised'] == 30 and rec['absolute'] == 50, rec
    assert solve(c)['recommend'][0][0] not in ('monetised', 'absolute')
    c['expectPenalty'] = {'monetised': 30, 'absolute': 50}
    out.append(c)
    # linear_pct with its default a = 2 differs from linear_zero k = 2 (review R-3): P = 120, Pmin = 100 -> 1 - 2*0.2 = 0.6 vs (200-120)/100 = 0.8
    c = dict(id='hand-linear-pct-default', W=100, method='linear_pct', qnorm='scale', items=[], ref=dict(price=100, lo=0.8, hi=1.3),
             bids=[dict(id='A', price=100), dict(id='B', price=120), dict(id='C', price=150)])
    r = solve(c)['methods']
    assert [r['linear_pct']['priceScore'][i] for i in 'ABC'] == [1, 0.6, 0.0] and abs(r['linear_zero']['priceScore']['B'] - 0.8) < 1e-12
    c['expectPriceScore'] = [1, 0.6, 0.0]
    out.append(c)
    return out


def random_cases(n, seed=20261115):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        nb = rnd.randint(2, 7)
        nq = rnd.randint(0, 3)
        W = rnd.choice([30, 40, 50, 60, 70, 80, 100]) if nq else 100
        weights = []
        rest = 100 - W
        for k in range(nq):
            w = rest if k == nq - 1 else round(rest * rnd.uniform(0.2, 0.7))
            weights.append(w)
            rest -= w
        items = [dict(id='Q%d' % (k + 1), weight=weights[k], max=rnd.choice([5, 10, 20])) for k in range(nq)]
        pmin = rnd.choice([2e5, 1.5e6, 9e6, 1.2e8])
        bids = []
        for b in range(nb):
            bids.append(dict(id=chr(65 + b), price=round(pmin * rnd.uniform(1.0, 1.9)),
                             q={it['id']: round(rnd.uniform(0, it['max']), 1) for it in items}, included=rnd.random() > 0.08 or b < 2))
        ref = dict(price=round(pmin * rnd.uniform(1.0, 1.4)), lo=rnd.choice([0.7, 0.8, 0.9]), hi=rnd.choice([1.2, 1.3, 1.5]))
        if rnd.random() < 0.2:
            ref['V'] = round(ref['price'] * rnd.uniform(0.1, 0.6))
        d = dict(id='rnd-%03d' % i, W=W, method=rnd.choice(METHODS), qnorm=rnd.choice(['scale', 'scale', 'best']), items=items, bids=bids, ref=ref,
                 params=dict(zeroFactor=rnd.choice([1.5, 2, 3]), slope=rnd.choice([0.5, 1, 2]), slopeMean=rnd.choice([0.5, 1]), floorFactor=rnd.choice([0.8, 0.85, 0.9])))
        if nq and rnd.random() < 0.3:
            d['test'] = dict(id='T', price=round(pmin * rnd.uniform(0.9, 2.0)), q={it['id']: round(rnd.uniform(0, it['max']), 1) for it in items})
        if sum(1 for b in bids if b['included']) >= 2:
            out.append(d)
    return out


def main():
    here = pathlib.Path(__file__).resolve().parent
    cases = []
    for d in presets() + hand_cases() + random_cases(220):
        cases.append(dict(input=d, expect=solve(d)))
    # preset findings ("aha"), evaluated here from the reference itself
    ex = {c['input']['id']: c for c in cases}
    def win(pid, m, drop=None, **over):
        d = dict(ex[pid]['input'], **over)
        if drop:
            d = dict(d, bids=[b for b in d['bids'] if b['id'] != drop])
        return solve(d)['methods'][m]
    aha = {
        'be-school': win('be-school', 'proportional')['winner'] == 'C' and win('be-school', 'proportional', drop='A')['winner'] == 'B',
        'utility-epc': win('utility-epc', 'interpolation')['winner'] == 'B' and win('utility-epc', 'interpolation', drop='C')['winner'] == 'A',
        'trafo': (win('trafo', 'proportional')['winner'] == 'C' and win('trafo', 'interpolation')['winner'] == 'A'
                  and 45000 < win('trafo', 'proportional')['eur'] < 55000 and 4000 < win('trafo', 'interpolation')['eur'] < 5000),
        'two-bids': ex['two-bids']['expect']['methods']['interpolation']['winner'] == 'A'
                    and all(ex['two-bids']['expect']['methods'][m]['winner'] == 'B' for m in METHODS if m != 'interpolation'),
        'eng-framework': ([c['swaps'] for c in ex['eng-framework']['expect']['methods']['monetised']['reversal'] if c['id'] == 'Y'] == [[['X', 'Z']]]
                          and not any(c['swaps'] for c in win('eng-framework', 'monetised', qnorm='scale')['reversal'])),
    }
    out = dict(tool='awardcriteria', generator='bench-src/ref/gen_awardcriteria.py', method='SPEC.md formulas, own implementation', cases=cases, aha=aha)
    (here / 'awardcriteria_ref.json').write_text(json.dumps(out, indent=0), encoding='utf-8')
    print('cases', len(cases), 'aha', aha)


if __name__ == '__main__':
    main()
