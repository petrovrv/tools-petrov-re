"""Independent reference for bidnobid.html (Bid / No-Bid Decision).

Written from the method definitions in _tnd/bidnobid/SPEC.md (decision tree with expected value, Raiffa 1968 / Clemen 1996;
weighted attractiveness scoring and knock-outs of bid/no-bid practice, Shipley / APMP; stated policy rule), NOT ported from tnd-bnb.js:
the expected value is obtained by rolling back an explicit tree of decision and chance nodes (not by the closed form); the breakeven
win probability, the strategic value needed and the affordable tender cost are found by bisection on the rolled-back tree value (the tree
is evaluated for p2 > 1 as its linear continuation, so a breakeven above 1 is reported as SPEC asks); the gate-2 policy (submit or withdraw)
is read from the decision node of the tree; own input normalisation, scoring, policy, flags and tornado loops.
Preset data are typed here again from SPEC.md. Engine 1.1.0 rules (review R-2/R-3/R-8/R-9, SPEC "Rules 1.1"): unscored fit -> bid with
conditions, spend and win chance under the policy the verdict follows, strict knock-out 'met', go/review swapped when reversed.

Run (stdlib only):  python -I bench-src/ref/gen_bidnobid.py   -> bench-src/ref/bidnobid_ref.json
"""
import json
import math
import pathlib
import random

GROUPS = ['client', 'capability', 'capacity', 'risk', 'strategy']


# ---------------------------------------------------------------- decision tree
def node_decision(options, log=None):
    """options: list of (label, value-node); value of the best option (first listed wins a tie); the choice is logged"""
    vals = [(lbl, f()) for lbl, f in options]
    best = vals[0]
    for v in vals[1:]:
        if v[1] > best[1]:
            best = v
    if log is not None:
        log.append(best[0])
    return best[1]


def node_chance(branches):
    """branches: list of (probability, value-function)"""
    return sum(p * f() for p, f in branches)


def tree_value(c, p2=None, strategic=False, B2=None, force_submit=False, log=None):
    """roll back: [gate 1 decision] -> qualification chance -> [gate 2 decision] -> award chance -> payoff"""
    p2 = c['p2'] if p2 is None else p2
    V, m, r, C = c['V'], c['m'], c['r'], c['C']
    gain = V * (m - r) - C + (c['S'] if strategic else 0.0)
    B1 = c['h1'] * c['rate'] + c['x1'] if c['procedure'] == 'two' else 0.0
    B2 = c['h2'] * c['rate'] + c['x2'] if B2 is None else B2

    def tender():   # value of submitting a tender (B2 spent now)
        return node_chance([(p2, lambda: gain), (1 - p2, lambda: 0.0)]) - B2

    def gate2():    # bidder may still withdraw after being shortlisted
        if c['procedure'] == 'two' and not force_submit:
            return node_decision([('submit', tender), ('withdraw', lambda: 0.0)], log)
        if log is not None:
            log.append('submit')
        return tender()

    if c['procedure'] == 'two':
        p1 = c['p1']
        return node_chance([(p1, gate2), (1 - p1, lambda: 0.0)]) - B1
    return gate2()


def bisect_pred(pred, lo, hi, it=200):
    """boundary between pred false (at lo) and pred true (at hi)"""
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        if pred(mid):
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def bisect(f, lo, hi, it=200):
    """root of increasing f on [lo, hi]"""
    flo = f(lo)
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        fm = f(mid)
        if (fm < 0) == (flo < 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return 0.5 * (lo + hi)


# ---------------------------------------------------------------- inputs
def is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def number(x, default):
    return float(x) if is_number(x) else default


def clip(x, lo, hi):
    return min(hi, max(lo, x))


def complete(d):
    """normalised case (SPEC inputs): only real finite numbers count, anything else (strings, booleans, NaN) takes the default; fractions clipped"""
    two = d.get('procedure') == 'two'
    c = dict(procedure='two' if two else 'single')
    for k in ('V', 'C', 'S', 'rate', 'h1', 'x1', 'h2', 'x2'):
        c[k] = max(0.0, number(d.get(k), 0.0))
    c['m'] = number(d.get('m'), 0.0)
    c['r'] = number(d.get('r'), 0.0)
    c['p1'] = clip(number(d.get('p1'), 1.0), 0.0, 1.0) if two else 1.0
    c['p2'] = clip(number(d.get('p2'), 0.0), 0.0, 1.0)
    N = d.get('N')
    c['N'] = int(math.floor(N + 0.5)) if is_number(N) and N >= 1 else None
    h = d.get('h')
    c['h'] = min(1.0, float(h)) if is_number(h) and h > 0 else None
    go, rv = clip(number(d.get('go'), 65.0), 0.0, 100.0), clip(number(d.get('review'), 45.0), 0.0, 100.0)
    c['swapped'] = rv > go
    c['go'], c['review'] = (rv, go) if rv > go else (go, rv)
    for k, dv in (('dp', 0.10), ('dm', 0.02), ('dB', 0.30), ('dV', 0.15)):
        c[k] = max(0.0, number(d.get(k), dv))
    c['criteria'] = [dict(id=k.get('id') or 'K%d' % (j + 1), group=k.get('group') if k.get('group') in GROUPS else 'client',
                          weight=max(0.0, number(k.get('weight'), 0.0)), score=clip(number(k.get('score'), 0.0), 0.0, 10.0))
                     for j, k in enumerate(d.get('criteria') or []) if k]
    kos = []
    for j, k in enumerate(d.get('ko') or []):
        if not k:
            continue
        v = k.get('met', None)
        num_v = is_number(v)
        yes = v is True or v in ('true', '1') or (num_v and v == 1)
        no = v is False or v in ('false', '0') or (num_v and v == 0)
        kos.append(dict(id=k.get('id') or 'KO%d' % (j + 1), met=yes, unclear=not yes and not no))
    c['ko'] = kos
    return c


# ---------------------------------------------------------------- solve
def solve(d):
    c = complete(d)
    if not c['V'] > 0:
        return dict(ok=False, errors=['value'])
    log, logs = [], []
    ev = tree_value(c, log=log)
    evs = tree_value(c, strategic=True, log=logs)
    M = c['V'] * (c['m'] - c['r']) - c['C']
    B1 = c['h1'] * c['rate'] + c['x1'] if c['procedure'] == 'two' else 0.0
    B2 = c['h2'] * c['rate'] + c['x2']
    # breakeven p2: where the rolled-back tree value turns positive (tree evaluated beyond p2 = 1 as its continuation)
    if M > 0 and c['p1'] > 0:
        hi = 2.0
        while tree_value(c, p2=hi) <= 0 and hi < 1e12:
            hi *= 2
        be = bisect_pred(lambda p: tree_value(c, p2=p) > 0, 0.0, hi)
    else:
        be = None
    # strategic value needed: smallest S with the strategic tree value >= 0
    if ev >= 0:
        sneed = 0.0
    elif c['p1'] * c['p2'] > 0:
        def g(s_):
            return tree_value(dict(c, S=s_), strategic=True)
        hi = 1.0
        while g(hi) < 0 and hi < 1e15:
            hi *= 2
        sneed = bisect(g, 0.0, hi)
    else:
        sneed = None
    # affordable tender cost: B2 at which the tree with submission forced at gate 2 is worth 0 (the value falls as B2 grows)
    if c['p1'] > 0:
        f = lambda b: tree_value(c, B2=b, force_submit=True)
        lo, hi = -1.0, 1.0
        while f(lo) < 0:
            lo *= 2
        while f(hi) > 0:
            hi *= 2
        affordable = bisect_pred(lambda b: f(b) < 0, lo, hi)
    else:
        affordable = None
    # scoring
    tw = sum(k['weight'] for k in c['criteria'])
    score = None if tw <= 0 else sum(k['weight'] * k['score'] for k in c['criteria']) / tw * 10.0
    groups = {}
    for g_ in GROUPS:
        ks = [k for k in c['criteria'] if k['group'] == g_]
        w = sum(k['weight'] for k in ks)
        groups[g_] = None if w <= 0 else sum(k['weight'] * k['score'] for k in ks) / w * 10.0
    # policy (SPEC): knock-outs, money, strategic, fit; an unscored fit with a paying bid -> bid with conditions
    failed = [k['id'] for k in c['ko'] if not k['met']]
    if failed:
        dec, why = 'nobid', 'ko'
    elif ev < 0 and evs < 0:
        dec, why = 'nobid', 'money'
    elif ev < 0:
        dec, why = 'strategic', 'strategic'
    elif score is None:
        dec, why = 'conditions', 'unscored'
    elif score >= c['go']:
        dec, why = 'bid', 'ok'
    elif score >= c['review']:
        dec, why = 'conditions', 'fit'
    else:
        dec, why = 'nobid', 'fit'
    # gate-2 choice the money verdict follows (when only S makes the bid pay, the tree that includes S), read from the tree's decision node
    submits = (logs if ev < 0 <= evs else log)[-1] == 'submit'
    pwin = c['p1'] * c['p2'] if submits else 0.0
    spend = B1 + (c['p1'] * B2 if submits else 0.0)
    # tornado
    bars = []

    def swing(name, setter):
        lo, hi = dict(c), dict(c)
        setter(lo, -1)
        setter(hi, +1)
        a, b = tree_value(lo), tree_value(hi)
        bars.append(dict(id=name, low=a, high=b, swing=abs(b - a), flips=len({a < 0, b < 0, ev < 0}) > 1))

    swing('p2', lambda x, s_: x.__setitem__('p2', clip(x['p2'] + s_ * c['dp'], 0.0, 1.0)))
    if c['procedure'] == 'two':
        swing('p1', lambda x, s_: x.__setitem__('p1', clip(x['p1'] + s_ * c['dp'], 0.0, 1.0)))
    swing('m', lambda x, s_: x.__setitem__('m', x['m'] + s_ * c['dm']))
    swing('V', lambda x, s_: x.__setitem__('V', x['V'] * (1 + s_ * c['dV'])))

    def cost(x, s_):
        for k in ('h1', 'x1', 'h2', 'x2'):
            x[k] = x[k] * (1 + s_ * c['dB'])
    swing('B', cost)
    bars.sort(key=lambda b: (-b['swing'], b['id']))
    # flags: optimism p2 > 2/N or > 2h (tool rule of thumb), M <= 0, withdraw at gate 2, weights not 100, thresholds swapped, unclear knock-out
    fl = []
    if c['N'] and c['p2'] > 2.0 / c['N']:
        fl.append('optimism-base')
    if c['h'] and c['p2'] > 2 * c['h']:
        fl.append('optimism-hit')
    if M <= 0:
        fl.append('no-margin')
    if c['procedure'] == 'two' and log[-1] == 'withdraw':
        fl.append('withdraw')
    if c['criteria'] and abs(tw - 100) > 1e-9:
        fl.append('weights')
    if c['swapped']:
        fl.append('thresholds')
    if any(k['unclear'] for k in c['ko']):
        fl.append('ko-unclear')
    return dict(ok=True, EV=ev, EVs=evs, M=M, B1=B1, B2=B2, naive=c['p1'] * c['p2'] * M - B1 - B2, Pwin=pwin, breakeven=be, Sneed=sneed,
                spend=spend, perWin=spend / pwin if pwin > 0 else None, roi=pwin * M / spend if spend > 0 else None,
                costPct=(B1 + B2) / c['V'], affordableB2=affordable, base=1.0 / c['N'] if c['N'] else None,
                score=score, groups=groups, decision=dec, reason=why, failed=failed, flags=sorted(fl),
                tornado=[[b['id'], b['low'], b['high']] for b in bars], flips=[b['id'] for b in bars if b['flips']])


# ---------------------------------------------------------------- cases
def crit10(scores):
    spec = [('client', 10), ('client', 15), ('capability', 15), ('capability', 10), ('capacity', 10),
            ('risk', 15), ('risk', 10), ('risk', 5), ('strategy', 5), ('strategy', 5)]
    return [dict(id='K%d' % (j + 1), group=g, weight=w, score=s) for j, ((g, w), s) in enumerate(zip(spec, scores))]


def ko(*met):
    return [dict(id='KO%d' % (j + 1), met=m) for j, m in enumerate(met)]


def presets():
    return [
        dict(id='be-school', procedure='single', V=4.2e6, m=0.06, r=0.005, C=0, S=0, rate=85, h1=0, x1=0, h2=320, x2=6000, p1=1, p2=0.18, N=7, h=0.15,
             criteria=crit10([7, 5, 8, 6, 6, 6, 8, 4, 6, 4]), ko=ko(True, True, True)),
        dict(id='utility-dnb', procedure='two', V=18e6, m=0.07, r=0.01, C=0, S=0, rate=95, h1=120, x1=3000, h2=1500, x2=45000, p1=0.6, p2=0.25, N=5, h=0.22,
             criteria=crit10([7, 6, 8, 7, 6, 6, 8, 6, 8, 7]), ko=ko(True, True, True)),
        dict(id='epc-fidic', procedure='single', V=65e6, m=0.09, r=0.035, C=1.5e6, S=0, rate=110, h1=0, x1=0, h2=4500, x2=180000, p1=1, p2=0.30, N=4, h=0.25,
             criteria=crit10([6, 6, 8, 3, 3, 3, 6, 7, 6, 5]), ko=ko(True, True, True)),
        dict(id='equip-rfq', procedure='single', V=1.8e6, m=0.18, r=0.02, C=0, S=0, rate=75, h1=0, x1=0, h2=140, x2=1500, p1=1, p2=0.25, N=4, h=0.3,
             criteria=crit10([8, 7, 9, 7, 5, 6, 7, 8, 7, 6]), ko=ko(False, True, True)),
        dict(id='framework-entry', procedure='single', V=6e6, m=0.05, r=0.01, C=0, S=800000, rate=90, h1=0, x1=0, h2=900, x2=25000, p1=1, p2=0.12, N=8, h=None,
             criteria=crit10([3, 5, 7, 7, 8, 6, 8, 5, 10, 9]), ko=ko(True, True, True)),
    ]


def hand_cases():
    # values worked out by hand in the comments
    money1 = dict(V=1e6, m=0.1, rate=1, h2=1, p2=0.5)          # M = 100 000, B2 = 1, EV = 49 999
    school = dict(V=4.2e6, m=0.06, r=0.005, rate=85, h2=320, x2=6000, N=7, h=0.15)   # M = 231 000, B2 = 33 200
    return [
        # M = 1e6*(0.10-0.02) = 80 000; B2 = 100*80+2000 = 10 000; EV = 0.25*80 000 - 10 000 = 10 000; p* = 0.125; B2* = 0.25*80 000 = 20 000
        dict(id='hand-single', V=1e6, m=0.10, r=0.02, rate=80, h2=100, x2=2000, p2=0.25, N=5, expectEV=10000, expectBE=0.125, expectAff=20000,
             expectDecision='conditions/unscored', expectFlags=[]),
        # M = 2e6*0.04 - 20 000 = 60 000; EV2 = 0.2*60 000 - 6 000 = 6 000; EV = 0.5*6 000 - 1 500 = 1 500; spend = 1 500 + 0.5*6 000 = 4 500
        dict(id='hand-two', procedure='two', V=2e6, m=0.05, r=0.01, C=20000, rate=100, h1=10, x1=500, h2=50, x2=1000, p1=0.5, p2=0.2, expectEV=1500, expectBE=0.15,
             expectSpend=4500),
        # EV2 = 0.05*60 000 - 6 000 < 0 -> withdraw -> EV = -1 500; only B1 is spent, no contract can be won (R-3)
        dict(id='hand-withdraw', procedure='two', V=2e6, m=0.05, r=0.01, C=20000, rate=100, h1=10, x1=500, h2=50, x2=1000, p1=0.5, p2=0.05, expectEV=-1500, expectBE=0.15,
             expectSpend=1500, expectFlags=['withdraw']),
        # same, S = 200 000: EV2s = 0.05*260 000 - 6 000 = 7 000 -> EVs = 3 500 - 1 500 = 2 000 -> strategic bid that submits: spend 4 500, Pwin 0.025,
        # per win 180 000, S needed = (6 000 + 3 000)/0.05 - 60 000 = 120 000
        dict(id='hand-strategic-two', procedure='two', V=2e6, m=0.05, r=0.01, C=20000, S=200000, rate=100, h1=10, x1=500, h2=50, x2=1000, p1=0.5, p2=0.05,
             expectEV=-1500, expectSpend=4500, expectDecision='strategic/strategic', expectFlags=['withdraw']),
        # M < 0: never pays
        dict(id='hand-nomargin', V=1e6, m=0.02, r=0.03, rate=80, h2=10, p2=0.5, expectEV=-0.5 * 10000 - 800, expectBE=None, expectFlags=['no-margin']),
        # scoring 30x10 + 70x5 -> 65 = go -> bid
        dict(id='hand-score-go', criteria=[dict(id='A', group='client', weight=30, score=10), dict(id='B', group='risk', weight=70, score=5)], expectEV=49999, **money1),
        dict(id='hand-score-cond', go=70, criteria=[dict(id='A', group='client', weight=30, score=10), dict(id='B', group='risk', weight=70, score=5)], expectEV=49999, **money1),
        dict(id='hand-score-low', go=80, review=66, criteria=[dict(id='A', group='client', weight=30, score=10), dict(id='B', group='risk', weight=70, score=5)], expectEV=49999, **money1),
        dict(id='hand-ko', criteria=[dict(id='A', group='client', weight=100, score=9)], ko=[dict(id='KO1', met=False)], expectEV=49999, **money1),
        # strategic: EV = 0.1*40 000 - 10 000 = -6 000; S needed = 60 000; S = 70 000 -> EVs = +1 000
        dict(id='hand-strategic', V=1e6, m=0.05, r=0.01, S=70000, rate=100, h2=100, p2=0.1, criteria=[dict(id='A', group='strategy', weight=10, score=9)], expectEV=-6000, expectBE=0.25),
        # R-2: be-school money without criteria: EV = 0.18*231 000 - 33 200 = 8 380 -> fit not scored -> bid with conditions (not 'poor fit')
        dict(id='hand-unscored', p2=0.18, expectEV=8380, expectDecision='conditions/unscored', expectFlags=[], **school),
        # R-9: go 40 / review 60 swapped to 60 / 40; score 50 -> conditions, flag
        dict(id='hand-thresholds', go=40, review=60, criteria=[dict(id='A', group='risk', weight=100, score=5)], expectEV=49999, expectDecision='conditions/fit',
             expectFlags=['thresholds'], **money1),
        # weights 60 + 30 = 90 -> flag; score (60*8 + 30*6)/90*10 = 73.3 -> bid; p2 0.15: EV = 34 650 - 33 200 = 1 450; every swing crosses zero:
        # p2 0.05/0.25 -> -21 650 / +24 550; m 3.5/7.5 % -> -11 150 / +14 050; B x0.7/1.3 -> +11 410 / -8 510; V x0.85/1.15 -> -3 747.5 / +6 647.5
        dict(id='hand-flips', p2=0.15, criteria=[dict(id='A', group='client', weight=60, score=8), dict(id='B', group='risk', weight=30, score=6)], expectEV=1450,
             expectDecision='bid/ok', expectFlags=['weights'], expectFlips=['p2', 'm', 'B', 'V'], **school),
        # hand-single with h = 0.10: p2 0.25 > 2h = 0.20 -> optimism-hit; 0.25 < 2/5 -> no base flag
        dict(id='hand-optimism', V=1e6, m=0.10, r=0.02, rate=80, h2=100, x2=2000, p2=0.25, N=5, h=0.10, expectEV=10000, expectFlags=['optimism-hit']),
    ]


def norm_cases():
    # raw engine inputs (import / hand-edited project): normalisation, clamping and errors
    return [
        # p2 1.4 -> 1, rate '85' (a string) -> 0: M = 100 000, B2 = 5 000, EV = 95 000, p* = 0.05; 1 > 2/3 -> optimism-base
        dict(id='norm-clamp', V=1e6, m=0.1, r=0, rate='85', h2=100, x2=5000, p2=1.4, N=3, expectEV=95000, expectBE=0.05, expectFlags=['optimism-base']),
        dict(id='norm-negV', V=-5e5, m=0.1, p2=0.3, expectError='value'),
        dict(id='norm-strV', V='4200000', m=0.06, p2=0.18, expectError='value'),
        # knock-out met 'no', 0, 'false', 'true', 1, missing -> A, B, C, F not met; 'no' and missing are unclear (R-8)
        dict(id='norm-ko', V=1e6, m=0.1, rate=1, h2=1, p2=0.5, ko=[dict(id='A', met='no'), dict(id='B', met=0), dict(id='C', met='false'), dict(id='D', met='true'),
                                                                   dict(id='E', met=1), dict(id='F')],
             expectEV=49999, expectDecision='nobid/ko', expectFlags=['ko-unclear']),
        # go 140 / review -5 -> 100 / 0; score 100 -> bid; N 2.5 -> 3 (half up), h 1.7 -> 1
        dict(id='norm-thresholds', V=1e6, m=0.1, rate=1, h2=1, p2=0.5, go=140, review=-5, N=2.5, h=1.7, criteria=[dict(id='A', weight=100, score=12)],
             expectEV=49999, expectDecision='bid/ok', expectFlags=[]),
    ]


def random_cases(n):
    rnd = random.Random(20261115)
    out = []
    for k in range(n):
        two = rnd.random() < 0.5
        crit = [dict(id='K%d' % (j + 1), group=rnd.choice(GROUPS), weight=rnd.choice([5, 10, 15, 20]), score=rnd.randint(0, 10)) for j in range(rnd.randint(0, 10))]
        d = dict(id='rnd-%03d' % k, procedure='two' if two else 'single', V=round(rnd.uniform(2e5, 9e7), -3), m=round(rnd.uniform(0.0, 0.2), 3), r=round(rnd.uniform(0, 0.05), 3),
                 C=rnd.choice([0, 0, round(rnd.uniform(0, 2e6), -3)]), S=rnd.choice([0, 0, round(rnd.uniform(0, 3e6), -3)]), rate=rnd.choice([60, 75, 85, 95, 110, 130]),
                 h1=rnd.randint(0, 400) if two else 0, x1=round(rnd.uniform(0, 20000), -2) if two else 0, h2=rnd.randint(10, 6000), x2=round(rnd.uniform(0, 300000), -2),
                 p1=round(rnd.uniform(0.2, 1), 2) if two else 1, p2=round(rnd.uniform(0.02, 0.6), 3), N=rnd.randint(2, 12), h=rnd.choice([None, round(rnd.uniform(0.05, 0.4), 2)]),
                 go=rnd.choice([60, 65, 70]), review=rnd.choice([40, 45, 50]), dp=rnd.choice([0.05, 0.1]), dm=rnd.choice([0.01, 0.02]), dB=rnd.choice([0.2, 0.3]), dV=rnd.choice([0.1, 0.15]),
                 criteria=crit, ko=[dict(id='KO%d' % (j + 1), met=rnd.random() > 0.1) for j in range(rnd.randint(0, 3))])
        out.append(d)
    return out


def main():
    here = pathlib.Path(__file__).resolve().parent
    cases = [dict(input=d, expect=solve(d)) for d in presets() + hand_cases() + norm_cases() + random_cases(200)]
    ex = {c['input']['id']: c for c in cases}
    P = {c['id']: c for c in presets()}
    e = lambda pid, **over: solve(dict(P[pid], **over))
    bs = ex['be-school']['expect']
    aha = {
        'be-school': abs(bs['EV'] - 8380) < 1e-6 and 1 / 7 < bs['breakeven'] < 1 / 7 + 0.002 and abs(tree_value(complete(P['be-school']), p2=1 / 7)) < 500,
        'utility-dnb': abs(ex['utility-dnb']['expect']['EV'] - 35100) < 1e-6 and abs(ex['utility-dnb']['expect']['naive'] + 39900) < 1e-6,
        'epc-fidic': abs(e('epc-fidic', C=0)['EV'] - 397500) < 1e-6 and abs(ex['epc-fidic']['expect']['EV'] + 52500) < 1e-6 and ex['epc-fidic']['expect']['decision'] == 'nobid',
        'equip-rfq': abs(ex['equip-rfq']['expect']['breakeven'] - 12000 / 288000) < 1e-9 and ex['equip-rfq']['expect']['decision'] == 'nobid'
                     and e('equip-rfq', ko=ko(True, True, True))['decision'] == 'bid',
        'framework-entry': abs(ex['framework-entry']['expect']['EV'] + 77200) < 1e-6 and abs(ex['framework-entry']['expect']['Sneed'] - 643333.33) < 1
                           and ex['framework-entry']['expect']['decision'] == 'strategic',
    }
    near = lambda a, b, t=1e-9: abs(a - b) <= t * max(1.0, abs(b))
    for c in cases:
        i, x = c['input'], c['expect']
        if 'expectError' in i:
            assert not x['ok'] and x['errors'] == [i['expectError']], (i['id'], x)
            continue
        if 'expectEV' in i:
            assert abs(x['EV'] - i['expectEV']) < 1e-6, (i['id'], x['EV'])
        if 'expectBE' in i:
            be = x['breakeven']
            assert (be is None and i['expectBE'] is None) or near(be, i['expectBE']), (i['id'], be)
        if 'expectAff' in i:
            assert near(x['affordableB2'], i['expectAff']), (i['id'], x['affordableB2'])
        if 'expectSpend' in i:
            assert abs(x['spend'] - i['expectSpend']) < 1e-6, (i['id'], x['spend'])
        if 'expectDecision' in i:
            assert x['decision'] + '/' + x['reason'] == i['expectDecision'], (i['id'], x['decision'], x['reason'])
        if 'expectFlags' in i:
            assert x['flags'] == sorted(i['expectFlags']), (i['id'], x['flags'])
        if 'expectFlips' in i:
            assert x['flips'] == i['expectFlips'], (i['id'], x['flips'])
    out = dict(tool='bidnobid', generator='bench-src/ref/gen_bidnobid.py',
               method='SPEC.md decision tree rolled back node by node, gate-2 policy read from the decision node, bisection on the tree value for breakeven / S needed / affordable B2, own normalisation, scoring, policy, flags and tornado',
               cases=cases, aha=aha)
    (here / 'bidnobid_ref.json').write_text(json.dumps(out, indent=0), encoding='utf-8')
    print('cases', len(cases), 'aha', aha)


if __name__ == '__main__':
    main()
