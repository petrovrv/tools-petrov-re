#!/usr/bin/env python3
"""Independent reference for lowbidcheck.html (Abnormally Low Tender Check), tools.petrov.re Tendering & Contracts.

Written from the published method, not ported from tnd-lowbid.js:
  * KB 18.04.2017 art. 36 §4 (ejustice, read 14.11.2026): mandatory price enquiry for every offer whose total is at least 15 % below the
    mean of the offers, for works or services in a fraud-sensitive sector, open or restricted procedure, at least four offers, price only
    or price >= 50 % of the weights (the documents may set a higher percentage in the latter case and may extend the paragraph to supplies
    and other services awarded on price only). Mean: n >= 7 -> leave out the lowest offer and the highest offers forming a quarter of the
    number of offers (rounded up); n < 7 -> leave out the lowest and the highest. Manifestly irregular offers may be left out.
  * art. 36 §6: the article does not apply to the negotiated procedures for supplies/services below the EU threshold and works below 500 000 EUR,
    unless the documents say otherwise.
  * art. 36 §1: the enquiry covers prices that appear abnormally low OR high (Verslag aan de Koning on art. 36); §4 only names open and
    restricted procedures, so in a competitive dialogue or an innovation partnership §4 never applies, and §6 names only the three negotiated
    procedures, so those two are never exempt (Verslag on §6). A procedure the reference does not know is never read as open.
  * art. 36 §2-§3, §5: outcome and notifications (§3 al. 1 = 1°-3°, al. 2 = art. 7 breach, al. 4 = State aid; §5 al. 2 SIOD only for federal
    social or labour law, §5 al. 4 accreditation commission only for works rejected for an abnormally LOW price); 12 days for the justification,
    counted per Wet 17.06.2016 art. 167 -> Reg. (EEC, Euratom) 1182/71 art. 3 (EUR-Lex, read 15.11.2026): day of the request not counted,
    calendar days, a last day on a Saturday, Sunday or public holiday ends on the next working day, >= 2 days hold >= 2 working days.
    Belgian public holidays: Wet 04.01.1974 / KB 18.04.1974 (ten days); Easter by Gauss's algorithm with the Gregorian corrections.
  * screens (practice, learning assumptions): Tukey fence Q1 - k IQR with linear percentiles (Hyndman-Fan type 7 = statistics 'inclusive'),
    deviation from the mean of the other offers, from an owner's estimate, unit price per line against the line median, negligible lines by share.
Only the standard library is used. Output: bench-src/ref/lowbidcheck_ref.json
"""
import json, os, random, statistics, datetime, math

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'lowbidcheck_ref.json')
NEGOTIATED = ('competitive-negotiation', 'negotiated-with-publication', 'negotiated-without-publication')
KNOWN = ('open', 'restricted') + NEGOTIATED + ('competitive-dialogue', 'innovation-partnership')
MAX_TOTAL = 1e12   # tool rule: totals above 1e12 EUR are input errors and are not counted
DEFAULT = dict(lineLow=0.30, lineHigh=0.50, lineMinShare=0.01, iqrK=1.5, othersDev=0.15, estDev=0.20, minLinePrices=3)


def legal_mean(vals):
    v = sorted(vals)
    n = len(v)
    if n < 3:
        return None
    top = -(-n // 4) if n >= 7 else 1          # quarter rounded up, or just the highest
    keep = v[1:n - top]
    return sum(keep) / len(keep) if keep else None


def applicability(be, n_valid):
    kind = be.get('kind', 'works')
    proc = be.get('procedure') or 'open'
    price_only = be.get('priceOnly', True) is not False
    pw = be.get('priceWeight')
    val = be.get('valueEst')
    if proc in NEGOTIATED and not be.get('keepInNegotiated'):
        if kind == 'works' and val is not None and val < 500000:
            return 'exempt', ['s6_works'], None
        if kind != 'works' and be.get('belowEU') is True:
            return 'exempt', ['s6_eu'], None
    why = []
    if proc not in KNOWN:
        why.append('procedure_unknown')
    elif proc not in ('open', 'restricted'):
        why.append('procedure')
    in_scope = kind == 'works' or (kind == 'services' and be.get('fraudSensitive'))
    if not in_scope and not (be.get('madeApplicable') and price_only):
        why.append('made_needs_price_only' if be.get('madeApplicable') else 'kind')
    if not price_only and not (pw is not None and pw >= 0.5):
        why.append('price_weight')
    if n_valid < 4:
        why.append('min_bids')
    pct = 0.15
    if not price_only and be.get('threshold') is not None and be['threshold'] > 0.15:
        pct = be['threshold']
    return ('indicative' if why else 'mandatory'), why, pct


def q(vals, p):
    if len(vals) == 1:
        return vals[0]
    qs = statistics.quantiles(vals, n=4, method='inclusive')
    return {0.25: qs[0], 0.5: qs[1], 0.75: qs[2]}[p]


def reference(case):
    regime = case.get('regime', 'be')
    sc = dict(DEFAULT)
    for k, v in (case.get('screen') or {}).items():
        if k in sc and v is not None and v >= 0:
            sc[k] = v
    est = (case.get('screen') or {}).get('estimate')
    est = est if est and est > 0 else None
    def amount(v):
        if isinstance(v, bool) or v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v) if math.isfinite(v) else None
        try:
            x = float(v) if isinstance(v, str) and v.strip() and all(ch in '0123456789.+-eE ' for ch in v) else None
        except ValueError:
            x = None
        return x if x is not None and math.isfinite(x) else None
    offers = [b for b in case['bids'] if amount(b.get('total')) is not None and 0 < amount(b['total']) <= MAX_TOTAL and not b.get('irregular')]
    tot = {b['id']: amount(b['total']) for b in offers}
    vals = [tot[b['id']] for b in offers]
    n = len(vals)
    res = {'n': n}
    mean = statistics.fmean(vals)
    med = statistics.median(vals)
    q1, q3 = q(vals, 0.25), q(vals, 0.75)
    fence = q1 - sc['iqrK'] * (q3 - q1) if n >= 4 else None
    fence_hi = q3 + sc['iqrK'] * (q3 - q1) if n >= 4 else None
    res['stats'] = dict(mean=mean, median=med, q1=q1, q3=q3, fence=fence, sd=statistics.stdev(vals) if n > 1 else 0.0)
    limit = None
    if regime == 'be':
        mode, why, pct = applicability(case.get('be') or {}, n)
        res['mode'], res['reasons'], res['threshold'] = mode, why, pct
        lm = legal_mean(vals) if mode != 'exempt' else None
        res['art36_mean'] = lm
        limit = lm * (1 - pct) if lm is not None else None
        res['limit'] = limit
    ids = [b['id'] for b in offers]
    # lines
    lines_out = []
    for ln in case.get('lines') or []:
        ups = {i: ln['prices'][i] for i in ids if i in ln.get('prices', {}) and ln['prices'][i] is not None and ln['prices'][i] >= 0}
        m = statistics.median(list(ups.values())) if len(ups) >= sc['minLinePrices'] else None
        qty = ln.get('qty')
        lines_out.append({'id': ln['id'], 'qty': 1 if qty is None else qty, 'median': m, 'ups': ups})   # no quantity = 1 lump sum
    base = sum(l['qty'] * l['median'] for l in lines_out if l['median'] is not None and l['qty'] is not None)
    for l in lines_out:
        amt = l['qty'] * l['median'] if l['median'] is not None and l['qty'] is not None else None
        l['share'] = amt / base if amt is not None and base > 0 else None
        l['negligible'] = l['share'] is None or l['share'] < sc['lineMinShare'] - 1e-12
        l['flags'] = {}
        l['devs'] = {}
        for i, up in l['ups'].items():
            d = up / l['median'] - 1 if l['median'] else None
            l['devs'][i] = d
            f = ''
            if d is not None and not l['negligible']:
                if d <= -sc['lineLow'] + 1e-12:
                    f = 'low'
                elif d >= sc['lineHigh'] - 1e-12:
                    f = 'high'
            l['flags'][i] = f
    res['lines'] = [{'id': l['id'], 'median': l['median'], 'share': l['share'], 'negligible': l['negligible'], 'flags': l['flags'], 'devs': l['devs']} for l in lines_out]
    total = sum(vals)
    bids = {}
    for b in case['bids']:
        if b['id'] not in ids:
            bids[b['id']] = {'flag': 'irregular' if b.get('irregular') else 'invalid'}
            continue
        t = tot[b['id']]
        oth = (total - t) / (n - 1) if n > 1 else None
        why = []
        below = limit is not None and t <= limit * (1 + 1e-9)
        if below:
            why.append('art36')
        if fence is not None and t < fence - 1e-9 * abs(fence):
            why.append('iqr')
        dev_o = t / oth - 1 if oth else None
        if dev_o is not None and dev_o <= -sc['othersDev'] + 1e-12:
            why.append('others')
        if est is not None and t <= est * (1 - sc['estDev']) * (1 + 1e-9):
            why.append('estimate')
        low = [l['id'] for l in lines_out if l['flags'].get(b['id']) == 'low']
        high = [l['id'] for l in lines_out if l['flags'].get(b['id']) == 'high']
        if low:
            why.append('lines_low')
        if high:
            why.append('lines_high')
        n_low = len(why)
        if fence_hi is not None and t > fence_hi + 1e-9 * abs(fence_hi):
            why.append('iqr_high')
        if dev_o is not None and dev_o >= sc['othersDev'] - 1e-12:
            why.append('others_high')
        at_med = t + sum(l['qty'] * (l['median'] - l['ups'][b['id']]) for l in lines_out if l['flags'].get(b['id']) == 'low' and l['qty'] is not None)
        if regime == 'be' and res['mode'] == 'mandatory' and below:
            flag = 'must'
        elif n_low:
            flag = 'watch' if regime == 'be' and res['mode'] == 'exempt' else 'should'
        elif why:
            flag = 'high'      # only the high screens on the total (art. 36 §1 covers high prices too)
        else:
            flag = ''
        bids[b['id']] = {'flag': flag, 'reasons': why, 'devMean': t / mean - 1, 'devOthers': dev_o,
                         'devArt36': (t / res['art36_mean'] - 1) if regime == 'be' and res.get('art36_mean') else None,
                         'linesLow': low, 'linesHigh': high, 'totalAtMedian': at_med,
                         'gapExplained': (at_med - t) / (oth - t) if low and oth is not None and oth > t else None}
    res['bids'] = bids
    return res


def easter(y):
    """Gauss's Easter algorithm (Gregorian), different from the anonymous algorithm used in the engines."""
    a, b, c = y % 19, y % 4, y % 7
    k = y // 100
    p = (13 + 8 * k) // 25
    q = k // 4
    M = (15 - p + k - q) % 30
    N = (4 + k - q) % 7
    d = (19 * a + M) % 30
    e = (2 * b + 4 * c + 6 * d + N) % 7
    day = 22 + d + e                      # day in March
    if d == 29 and e == 6:
        day = 50                          # 19 April
    elif d == 28 and e == 6 and (11 * M + 11) % 30 < 19:
        day = 49                          # 18 April
    return datetime.date(y, 3, 1) + datetime.timedelta(days=day - 1)


def be_holidays(y):
    """Wet 04.01.1974 / KB 18.04.1974: New Year, Easter Monday, 1 May, Ascension, Whit Monday, 21 July, 15 August, 1 and 11 November, Christmas."""
    e = easter(y)
    td = datetime.timedelta
    return {datetime.date(y, 1, 1), e + td(1), datetime.date(y, 5, 1), e + td(39), e + td(50), datetime.date(y, 7, 21),
            datetime.date(y, 8, 15), datetime.date(y, 11, 1), datetime.date(y, 11, 11), datetime.date(y, 12, 25)}


def working(d):
    return d.weekday() < 5 and d not in be_holidays(d.year)


def deadline(iso, days):
    """Reg. 1182/71 art. 3: (1) the day of the request is not counted; (3) calendar days; (4) a last day on Sat/Sun/holiday -> end of the
    next working day; (5) a period of two days or more includes at least two working days."""
    start = datetime.date.fromisoformat(iso)
    end = start + datetime.timedelta(days=days)
    while not working(end):
        end += datetime.timedelta(days=1)
    if days >= 2:
        while sum(1 for i in range(1, (end - start).days + 1) if working(start + datetime.timedelta(days=i))) < 2:
            end += datetime.timedelta(days=1)
            while not working(end):
                end += datetime.timedelta(days=1)
    return end.isoformat()


def outcome(j, kind):
    """art. 36 §3 decision order and §5 notifications, from the article text."""
    g = j.get('grounds', {})
    low = True
    if j.get('socialBreach'):
        dec, art = 'reject_social', 'art. 36 §3 al. 2'           # art. 7 breach: "abnormaal laag", mandatory
    elif j.get('stateAidIncompatible'):
        dec, art = 'reject_aid', 'art. 36 §3 al. 4'              # 4th alinea of §3
    elif j.get('lineAbnormal'):
        dec, art, low = 'reject_line', 'art. 36 §3, 1°', not j.get('high')
    elif j.get('totalAbnormal'):
        dec, art, low = 'reject_total', 'art. 36 §3, 2°', not j.get('high')
    elif not j.get('received') or any(v == 'open' for v in g.values()):
        dec, art = 'pending', 'art. 36 §2'
    else:
        dec, art = 'motivate', 'art. 36 §3, 3°'
    note = []
    if dec.startswith('reject'):
        note.append('bma')                      # §5 al. 1: every rejection for an abnormal (low or high) price
        if dec == 'reject_social' and not j.get('envOnly'):
            note.append('siod')                 # §5 al. 2: federal social or labour law only
        if dec == 'reject_aid':
            note.append('ec')                   # §5 al. 3
        if kind == 'works' and low:
            note.append('erkenning')            # §5 al. 4: works, abnormally LOW price
    return {'decision': dec, 'notify': note, 'article': art}


def P(id_, regime, be, bids, lines=None, screen=None):
    return {'id': id_, 'regime': regime, 'be': be, 'bids': [{'id': b[0], 'total': b[1], **({'irregular': True} if len(b) > 2 and b[2] else {})} for b in bids],
            'lines': lines or [], 'screen': screen or {}}


def presets():
    def l5(i, q, a, b, c, d, e):
        return {'id': i, 'qty': q, 'prices': {'B1': a, 'B2': b, 'B3': c, 'B4': d, 'B5': e}}
    pq_lines = [l5('01', 2400, 28, 31, 30, 33, 35), l5('02', 1150, 165, 172, 168, 175, 181), l5('03', 98000, 0.78, 1.42, 1.45, 1.48, 1.55),
                l5('04', 3800, 62, 66, 64, 69, 71), l5('05', 4, 21500, 41000, 43500, 42800, 46000), l5('06', 1, 410000, 445000, 452000, 438000, 470000),
                l5('07', 620, 395, 410, 402, 425, 440), l5('08', 2900, 54, 58, 57, 61, 60), l5('09', 1, 85000, 120000, 118000, 125000, 131000)]
    M = 1e6
    epc = [('A', [5.9, 5.6, 5.8, 6.1]), ('B', [17.6, 17.9, 18.2, 18.7]), ('C', [7.7, 7.9, 7.8, 8.1]), ('D', [12.1, 12.4, 12.7, 12.9]),
           ('E', [0.18, 1.45, 1.52, 1.38]), ('F', [0.06, 0.64, 0.61, 0.70]), ('G', [2.06, 1.71, 1.67, 2.02])]
    epc_lines = [{'id': i, 'qty': 1, 'prices': {('E%d' % (k + 1)): round(v * M) for k, v in enumerate(p)}} for i, p in epc]
    open8 = [('B1', 1790000), ('B2', 1948900), ('B3', 2015300), ('B4', 2064700), ('B5', 2101800), ('B6', 2187500), ('B7', 2655000), ('B8', 2790000)]
    pq = [('B1', 3350000), ('B2', 3910000), ('B3', 4020000), ('B4', 4105000), ('B5', 4390000)]
    gens = [('G1', 612000), ('G2', 905000), ('G3', 948000), ('G4', 962000), ('G5', 1010000), ('G6', 1075000)]
    epcb = [('E1', 45600000), ('E2', 47600000), ('E3', 48300000), ('E4', 49900000)]
    neg = [('B1', 312500), ('B2', 386000), ('B3', 401200), ('B4', 415800), ('B5', 447300)]
    return [
        P('be-works-open8', 'be', {'kind': 'works', 'procedure': 'open', 'priceOnly': True, 'valueEst': 2100000}, open8, screen={'estimate': 2100000}),
        P('be-works-pq-lines', 'be', {'kind': 'works', 'procedure': 'open', 'priceOnly': False, 'priceWeight': 0.6, 'threshold': 0.20, 'valueEst': 3900000}, pq, pq_lines),
        P('be-works-pq-lines@15', 'be', {'kind': 'works', 'procedure': 'open', 'priceOnly': False, 'priceWeight': 0.6, 'valueEst': 3900000}, pq, pq_lines),
        P('be-supplies-gensets', 'be', {'kind': 'supplies', 'procedure': 'open', 'priceOnly': True, 'valueEst': 950000}, gens, screen={'estimate': 950000}),
        P('be-supplies-gensets@made', 'be', {'kind': 'supplies', 'procedure': 'open', 'priceOnly': True, 'valueEst': 950000, 'madeApplicable': True}, gens, screen={'estimate': 950000}),
        P('private-epc-unbalanced', 'private', {}, epcb, epc_lines, {'estimate': 48000000}),
        P('be-negotiated-small', 'be', {'kind': 'works', 'procedure': 'negotiated-without-publication', 'priceOnly': True, 'valueEst': 420000}, neg),
        P('be-negotiated-small@open', 'be', {'kind': 'works', 'procedure': 'open', 'priceOnly': True, 'valueEst': 420000}, neg),
    ]


def hand():
    W = {'kind': 'works', 'procedure': 'open', 'priceOnly': True}
    return [
        P('hand-n3', 'be', W, [('a', 70), ('b', 100), ('c', 130)]),                       # 3 offers: mean 100 but < 4 offers -> indicative
        P('hand-n4-exact15', 'be', W, [('a', 85), ('b', 100), ('c', 100), ('d', 130)]),   # mean of b,c = 100, a exactly 15 % below -> must
        P('hand-n7', 'be', W, [('a', 60), ('b', 90), ('c', 95), ('d', 100), ('e', 105), ('f', 300), ('g', 400)]),
        P('hand-n12', 'be', W, [('x%d' % i, v) for i, v in enumerate([55, 80, 82, 85, 88, 90, 91, 93, 95, 140, 150, 160])]),
        P('hand-irregular', 'be', W, [('a', 50), ('b', 100), ('c', 105), ('d', 110, True), ('e', 120)]),
        P('hand-ties', 'be', W, [('a', 80), ('b', 80), ('c', 100), ('d', 100), ('e', 100)]),
        P('hand-pw49', 'be', {'kind': 'works', 'procedure': 'open', 'priceOnly': False, 'priceWeight': 0.49}, [('a', 70), ('b', 100), ('c', 100), ('d', 100), ('e', 110)]),
        P('hand-fraud-services', 'be', {'kind': 'services', 'procedure': 'restricted', 'priceOnly': True, 'fraudSensitive': True}, [('a', 70), ('b', 100), ('c', 100), ('d', 100), ('e', 110)]),
        P('hand-s6-services-belowEU', 'be', {'kind': 'services', 'procedure': 'competitive-negotiation', 'belowEU': True}, [('a', 70), ('b', 100), ('c', 100), ('d', 110)]),
        P('hand-s6-works-500k', 'be', {'kind': 'works', 'procedure': 'negotiated-with-publication', 'valueEst': 500000}, [('a', 70), ('b', 100), ('c', 100), ('d', 110)]),
        P('hand-eu', 'eu', {}, [('a', 70), ('b', 100), ('c', 100), ('d', 110)], screen={'estimate': 95}),
        P('hand-docs-25', 'be', {'kind': 'works', 'procedure': 'open', 'priceOnly': False, 'priceWeight': 0.7, 'threshold': 0.25}, [('a', 77), ('b', 100), ('c', 100), ('d', 100), ('e', 110)]),
        # art. 36 §4 names open and restricted only: a competitive dialogue with an offer 30 % below is indicative, never exempt (§6)
        P('hand-dialogue', 'be', {'kind': 'works', 'procedure': 'competitive-dialogue', 'priceOnly': True, 'valueEst': 400000}, [('a', 70), ('b', 100), ('c', 100), ('d', 100), ('e', 110)]),
        P('hand-innovation', 'be', {'kind': 'services', 'procedure': 'innovation-partnership', 'priceOnly': True, 'belowEU': True}, [('a', 70), ('b', 100), ('c', 100), ('d', 110)]),
        P('hand-unknown-proc', 'be', {'kind': 'works', 'procedure': 'design-contest'}, [('a', 70), ('b', 100), ('c', 100), ('d', 100), ('e', 110)]),
        # high screens on the total: 300 is above Q3 + 1.5 IQR and far above the others
        P('hand-high-total', 'be', W, [('a', 95), ('b', 100), ('c', 100), ('d', 105), ('e', 300)]),
        # input edges: zero, negative, missing, decimal string, above 1e12 -> not counted
        P('hand-edges', 'be', W, [('a', 0), ('b', -50), ('c', None), ('d', '100.5'), ('e', 100), ('f', 2e12), ('g', 104), ('h', 80)]),
        # a lump-sum line with no quantity counts as 1, so it is not negligible
        P('hand-ls-noqty', 'private', {}, [('a', 100), ('b', 100), ('c', 100)], [{'id': 'LS', 'qty': None, 'prices': {'a': 10, 'b': 50, 'c': 52}},
                                                                                 {'id': 'X', 'qty': 2, 'prices': {'a': 25, 'b': 25, 'c': 25}}]),
    ]


def random_cases(k, seed=20261114):
    rnd = random.Random(seed)
    out = []
    kinds = ['works', 'supplies', 'services']
    procs = ['open', 'restricted', 'competitive-negotiation', 'negotiated-with-publication', 'negotiated-without-publication', 'competitive-dialogue', 'innovation-partnership']
    for i in range(k):
        regime = rnd.choice(['be', 'be', 'be', 'eu', 'private'])
        n = rnd.randint(1, 12)
        base = rnd.choice([250000, 900000, 4e6, 3e7])
        bids = []
        for j in range(n):
            v = round(base * rnd.uniform(0.55, 1.45), 2)
            x = rnd.random()
            if x < 0.02:
                v = 0
            elif x < 0.04:
                v = -v
            elif x < 0.06:
                v = None
            elif x < 0.08:
                v = str(v)            # decimal string as typed
            elif x < 0.09:
                v = 5e12              # above the 1e12 cap
            bids.append(('O%d' % (j + 1), v, rnd.random() < 0.08))
        if all(b[2] for b in bids):
            bids[0] = (bids[0][0], bids[0][1], False)
        bids[0] = (bids[0][0], round(base, 2), False)      # at least one valid total
        be = {}
        if regime == 'be':
            po = rnd.random() < 0.6
            be = {'kind': rnd.choice(kinds), 'procedure': rnd.choice(procs), 'priceOnly': po, 'valueEst': rnd.choice([300000, 499999, 500000, 2e6])}
            if not po:
                be['priceWeight'] = rnd.choice([0.3, 0.49, 0.5, 0.6, 0.8])
                if rnd.random() < 0.5:
                    be['threshold'] = rnd.choice([0.1, 0.15, 0.2, 0.25])
            for key in ('fraudSensitive', 'madeApplicable', 'keepInNegotiated', 'belowEU'):
                if rnd.random() < 0.3:
                    be[key] = True
        lines = []
        if rnd.random() < 0.5:
            for li in range(rnd.randint(1, 8)):
                ref = rnd.choice([0.8, 35, 170, 4200, 120000])
                prices = {}
                for b in bids:
                    if rnd.random() < 0.9:
                        prices[b[0]] = round(ref * rnd.choice([rnd.uniform(0.85, 1.15), rnd.uniform(0.1, 0.75), rnd.uniform(1.4, 2.2)]), 2)
                lines.append({'id': 'L%d' % (li + 1), 'qty': rnd.choice([1, 4, 120, 2400, 98000, None]), 'prices': prices})
        screen = {}
        if rnd.random() < 0.5:
            screen['estimate'] = round(base * rnd.uniform(0.8, 1.2))
        if rnd.random() < 0.3:
            screen.update(lineLow=rnd.choice([0.2, 0.3, 0.4]), lineHigh=rnd.choice([0.3, 0.5, 1.0]), lineMinShare=rnd.choice([0, 0.01, 0.05]),
                          iqrK=rnd.choice([1.0, 1.5, 3.0]), othersDev=rnd.choice([0.1, 0.15, 0.25]), estDev=rnd.choice([0.1, 0.2, 0.3]))
        out.append(P('rnd-%03d' % i, regime, be, bids, lines, screen))
    return out


def main():
    cases = presets() + hand() + random_cases(300)
    for c in cases:
        c['expect'] = reference(c)
    dl_cases = [('2026-11-16', 12), ('2026-12-24', 12), ('2027-02-20', 12), ('2028-02-20', 12), ('2026-11-16', 20), ('2026-12-31', 0),
                ('2026-12-13', 12),          # day 12 = Fri 25.12 (Christmas) -> Mon 28.12
                ('2027-03-17', 12),          # day 12 = Mon 29.03.2027 = Easter Monday -> Tue 30.03
                ('2026-07-09', 12),          # day 12 = Tue 21.07 (National Day) -> Wed 22.07
                ('2026-11-13', 2),           # Fri + 2 = Sun -> Mon 16.11, only one working day -> Tue 17.11 (art. 3(5))
                ('2026-10-30', 12)]          # day 12 = Wed 11.11 (Armistice) -> Thu 12.11
    rnd = random.Random(1182)
    for _ in range(40):
        d0 = datetime.date(2026, 1, 1) + datetime.timedelta(days=rnd.randint(0, 1460))
        dl_cases.append((d0.isoformat(), rnd.choice([12, 12, 12, 15, 20, 30, 3, 2])))
    deadlines = [{'date': d, 'days': n, 'expect': deadline(d, n)} for d, n in dl_cases]
    outcomes = []
    for j, kind in [({'received': True, 'grounds': {'g1': 'ok', 'social': 'ok'}}, 'works'),
                    ({'received': True, 'lineAbnormal': True}, 'works'),
                    ({'received': True, 'totalAbnormal': True}, 'supplies'),
                    ({'received': True, 'socialBreach': True, 'lineAbnormal': True}, 'services'),
                    ({'received': True, 'stateAidIncompatible': True}, 'works'),
                    ({'received': False}, 'works'),
                    ({'received': True, 'grounds': {'g2': 'open', 'social': 'ok'}}, 'works'),
                    ({'received': True, 'lineAbnormal': True, 'high': True}, 'works'),      # high line rejected: no accreditation commission
                    ({'received': True, 'totalAbnormal': True}, 'works'),
                    ({'received': True, 'socialBreach': True, 'envOnly': True}, 'works'),  # environmental breach only: no SIOD
                    ({'received': True, 'stateAidIncompatible': True}, 'supplies')]:
        outcomes.append({'input': j, 'kind': kind, 'expect': outcome(j, kind)})
    doc = {'generator': 'bench-src/ref/gen_lowbidcheck.py', 'method': 'KB 18.04.2017 art. 36 (ejustice NL/FR, read 2026-11-14); screens = learning assumptions',
           'cases': cases, 'deadlines': deadlines, 'outcomes': outcomes}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=0)
    print('lowbidcheck ref: %d cases, %d deadlines, %d outcomes -> %s' % (len(cases), len(deadlines), len(outcomes), OUT))


if __name__ == '__main__':
    main()
