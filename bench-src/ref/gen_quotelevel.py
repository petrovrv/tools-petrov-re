"""Independent reference for quotelevel.html (Subcontractor & Supplier Quote Levelling).

Written from the method in _tnd/quotelevel/SPEC.md, NOT ported from tnd-ql.js:
- who pays which transport leg is typed here as a BUYER table per Incoterms 2020 rule (the JS keeps a seller table),
  from the rule structure (E: buyer pays all; F: seller loads and clears export, FAS/FOB also to the port; C: seller pays main carriage,
  CIF/CIP also insurance, CPT/CIP to the named place = site; D: seller bears risk (no buyer insurance) and carriage to site, DPU unloads, DDP clears import);
- customs value per Union Customs Code art. 70(1) + 71(1)(e): price + every buyer-paid cost up to the entry into the Union (loading, carriage, insurance),
  not on-carriage or unloading after entry (art. 72(a)); built leg by leg;
- ranks by sorting with a tie tolerance; leader stability by scanning the plug factor f on a grid and refining by bisection (not the closed form).
Preset data are typed here again from SPEC.md.
Input rules 1.1.0 (SPEC "Input rules", D-TND-11) are written here from SPEC: EUR has rate 1 (flag eurfx), an option without an amount is
plugged like an exclusion (optnoamt), a 0 EUR plug on an excluded / unpriced / counted unclear cell is flagged (zeroplug), L <= 0 is not ranked,
repeated ids get -2, -3 ... (dupid).

Run (stdlib only):  python -I bench-src/ref/gen_quotelevel.py   -> bench-src/ref/quotelevel_ref.json
"""
import json
import math
import pathlib
import random

LEGS = ['load', 'pre', 'main', 'ins', 'imp', 'onc', 'unload']
# legs the BUYER still pays (relative to "landed on site, import cleared, unloaded")
BUYER = {
    'EXW': {'load', 'pre', 'main', 'ins', 'imp', 'onc', 'unload'},
    'FCA': {'pre', 'main', 'ins', 'imp', 'onc', 'unload'},
    'FAS': {'main', 'ins', 'imp', 'onc', 'unload'},
    'FOB': {'main', 'ins', 'imp', 'onc', 'unload'},
    'CFR': {'ins', 'imp', 'onc', 'unload'},
    'CIF': {'imp', 'onc', 'unload'},
    'CPT': {'ins', 'imp', 'unload'},
    'CIP': {'imp', 'unload'},
    'DAP': {'imp', 'unload'},
    'DPU': {'imp'},
    'DDP': {'unload'},
    'site': set(),
}
BEFORE_ENTRY = ['load', 'pre', 'main', 'ins']
TIE = 1e-9


def f(x, d=0.0):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) else d


def level(c):
    pol = c.get('policy', 'allowance')
    u = min(1.0, max(0.0, f(c.get('unclear'), 1.0)))
    rate = max(0.0, f(c.get('rate'), 0.06))
    gapw = max(0.0, f(c.get('gapWarn'), 0.10))
    pk = {k: max(0.0, f(c.get(k), 0.0)) for k in ('load', 'ins', 'duty', 'impFix', 'unload')}
    taken = {'item': set(), 'quote': set()}
    renamed = []

    def fresh(kind, raw):
        # SPEC (e): first use keeps its id; later uses become raw-2, raw-3, ... (first free suffix)
        if raw not in taken[kind]:
            taken[kind].add(raw)
            return raw
        n = 2
        while '%s-%d' % (raw, n) in taken[kind]:
            n += 1
        taken[kind].add('%s-%d' % (raw, n))
        renamed.append(raw)
        return '%s-%d' % (raw, n)
    items = []
    for k, it in enumerate(c.get('items', [])):
        items.append({'id': fresh('item', str(it.get('id') or 'I%d' % (k + 1))), 'allow': max(0.0, f(it.get('allowance'), 0.0))})
    quotes = []
    for k, q in enumerate(c.get('quotes', [])):
        cur = (str(q.get('cur') or 'EUR').strip().upper()[:3]) or 'EUR'
        typed = q.get('fx')
        fx = 1.0 if cur == 'EUR' else f(typed, float('nan'))  # SPEC (a)
        fx_ignored = cur == 'EUR' and f(typed, 1.0) != 1.0
        src = q.get('cells') or {}
        cells = {}
        for it in items:
            cc = src.get(it['id']) or {}
            s = cc.get('s') if cc.get('s') in ('inc', 'exc', 'unc', 'opt') else 'inc'
            a = cc.get('amt')
            cells[it['id']] = (s, a if isinstance(a, (int, float)) and math.isfinite(a) and a >= 0 else None)
        price = f(q.get('price'), float('nan'))
        quotes.append({'id': fresh('quote', str(q.get('id') or 'Q%d' % (k + 1))), 'fxIgnored': fx_ignored, 'price': price, 'cur': cur, 'fx': fx, 'inc': q.get('incoterm', 'site') if q.get('incoterm') in BUYER else 'site',
                       'eu': q.get('eu', True) is not False, 'pre': max(0.0, f(q.get('pre'))), 'main': max(0.0, f(q.get('main'))), 'onc': max(0.0, f(q.get('onc'))),
                       'adv': min(1.0, max(0.0, f(q.get('adv')))), 'months': max(0.0, f(q.get('advMonths'))), 'adj': f(q.get('adj')), 'cells': cells,
                       'valid': math.isfinite(price) and price > 0 and math.isfinite(fx) and fx > 0})
    out = {}
    no_amount, zero = [], []
    for q in quotes:
        if not q['valid']:
            out[q['id']] = {'valid': False}
            continue
        P = q['price'] * q['fx']
        opt = plug = 0.0
        for it in items:
            s, a = q['cells'][it['id']]
            if s == 'opt' and a is not None:
                opt += a * q['fx']
            else:
                if s == 'inc':
                    continue
                # exc, unc, or an option without its amount (SPEC (b): plugged at factor 1 like an exclusion)
                stated = [o['cells'][it['id']][1] * o['fx'] for o in quotes
                          if o is not q and o['valid'] and o['cells'][it['id']][0] in ('inc', 'opt') and o['cells'][it['id']][1] is not None]
                if pol == 'max' and stated:
                    v = max(stated)
                elif pol == 'mean' and stated:
                    v = sum(stated) / len(stated)
                else:
                    v = it['allow']
                weight = u if s == 'unc' else 1.0
                plug += v * weight
                if s == 'opt':
                    no_amount.append(it['id'])
                if v <= 0 and weight > 0:  # SPEC (c)
                    zero.append(it['id'])
        pays = BUYER[q['inc']]
        cost = {'load': pk['load'], 'pre': q['pre'], 'main': q['main'], 'ins': pk['ins'] * P, 'onc': q['onc'], 'unload': pk['unload']}
        add = {}
        for leg in ('load', 'pre', 'main', 'ins', 'onc', 'unload'):
            add[leg] = cost[leg] if leg in pays else 0.0
        cv = None
        if 'imp' in pays and not q['eu']:
            cv = P
            for leg in BEFORE_ENTRY:
                cv += add[leg]
            add['imp'] = pk['impFix'] + pk['duty'] * cv
        else:
            add['imp'] = 0.0
        logi = sum(add[leg] for leg in LEGS)
        fin = q['adv'] * P * rate * q['months'] / 12.0
        L = P + opt + plug + logi + fin + q['adj']
        if not L > 0:  # SPEC (d)
            out[q['id']] = {'valid': False}
            continue
        out[q['id']] = {'valid': True, 'P': P, 'opt': opt, 'plug': plug, 'logistics': logi, 'fin': fin, 'L': L, 'gapShare': plug / L if L > 0 else None,
                        'customsValue': cv, 'log': [add[leg] for leg in LEGS]}

    def ranks(key):
        vals = [(qid, r[key]) for qid, r in out.items() if r['valid']]
        rk = {}
        for qid, v in vals:
            better = sum(1 for _, w in vals if w < v and (v - w) > TIE * max(1.0, abs(v)))
            rk[qid] = better + 1
        return rk
    raw, lv = ranks('P'), ranks('L')
    for qid, r in out.items():
        if r['valid']:
            r['rawRank'], r['rank'] = raw[qid], lv[qid]
    valid_ids = [qid for qid in out if out[qid]['valid']]
    leaders = [q for q in valid_ids if lv[q] == 1]
    rawl = [q for q in valid_ids if raw[q] == 1]
    leader = leaders[0] if len(leaders) == 1 else None
    srt = sorted(valid_ids, key=lambda q: (out[q]['L'], q))
    second = srt[1] if len(srt) > 1 else None
    lead = out[second]['L'] - out[leader]['L'] if leader and second else None

    stab = None
    if leader and len(valid_ids) > 1:
        def best_at(fac):
            vals = {q: out[q]['L'] - out[q]['plug'] + fac * out[q]['plug'] for q in valid_ids}
            m = min(vals.values())
            return vals[leader] <= m + 1e-12 * max(1.0, abs(m))

        def edge(a, b):  # a holds, b does not
            for _ in range(200):
                mid = (a + b) / 2
                if best_at(mid):
                    a = mid
                else:
                    b = mid
            return (a + b) / 2
        hi = None
        prev = 1.0
        fac = 1.0
        while fac < 1e4:
            fac = fac * 1.01 + 0.001
            if not best_at(fac):
                hi = edge(prev, fac)
                break
            prev = fac
        lo = 0.0
        if not best_at(0.0):
            prev, fac = 1.0, 1.0
            while fac > 0:
                fac = max(0.0, fac - 0.001)
                if not best_at(fac):
                    lo = edge(prev, fac)
                    break
                prev = fac
        stab = {'lo': lo, 'hi': hi}
    allexc = [it['id'] for it in items if valid_ids and all(out[q]['valid'] and next(x for x in quotes if x['id'] == q)['cells'][it['id']][0] in ('exc', 'unc') for q in valid_ids)]
    flags = set()
    if leader and rawl and leader not in rawl:
        flags.add('reversal')
    if leader and out[leader]['gapShare'] is not None and out[leader]['gapShare'] > gapw:
        flags.add('gap')
    if stab and ((stab['hi'] is not None and stab['hi'] < 1.5) or stab['lo'] > 0.5):
        flags.add('fragile')
    if len(leaders) > 1:
        flags.add('tie')
    if allexc:
        flags.add('allexc')
    if any(not r['valid'] for r in out.values()):
        flags.add('invalid')
    if any(q['valid'] and q['cur'] != 'EUR' for q in quotes):
        flags.add('fx')
    if pol != 'allowance' and any(it['allow'] <= 0 for it in items):
        flags.add('noallow')
    if no_amount:
        flags.add('optnoamt')
    if zero:
        flags.add('zeroplug')
    if any(q['fxIgnored'] for q in quotes):
        flags.add('eurfx')
    if renamed:
        flags.add('dupid')
    return {'rows': out, 'leader': leader, 'leaders': sorted(leaders), 'rawLeader': rawl[0] if len(rawl) == 1 else None, 'second': second, 'lead': lead,
            'stability': stab, 'allExcluded': allexc, 'flags': sorted(flags)}


def C(lst):
    return {x[0]: {'s': x[1], 'amt': x[2] if len(x) > 2 else None} for x in lst}


def Qd(qid, price, cur, fx, inc, eu, cells, **kw):
    d = {'id': qid, 'price': price, 'cur': cur, 'fx': fx, 'incoterm': inc, 'eu': eu, 'cells': cells}
    d.update(kw)
    return d


PRESETS = [
    {'id': 'hvac-sub', 'policy': 'allowance', 'unclear': 1, 'rate': 0.06, 'gapWarn': 0.10,
     'items': [{'id': 'I1', 'allowance': 185000}, {'id': 'I2', 'allowance': 38000}, {'id': 'I3', 'allowance': 42000}, {'id': 'I4', 'allowance': 64000},
               {'id': 'I5', 'allowance': 55000}, {'id': 'I6', 'allowance': 18000}, {'id': 'I7', 'allowance': 26000}, {'id': 'I8', 'allowance': 48000}],
     'quotes': [Qd('Q1', 2450000, 'EUR', 1, 'site', True, C([('I1', 'exc'), ('I2', 'exc'), ('I3', 'exc'), ('I5', 'unc')])),
                Qd('Q2', 2610000, 'EUR', 1, 'site', True, C([('I7', 'exc')])),
                Qd('Q3', 2690000, 'EUR', 1, 'site', True, {}),
                Qd('Q4', 2540000, 'EUR', 1, 'site', True, C([('I1', 'opt', 160000), ('I6', 'unc'), ('I8', 'exc')]))]},
    {'id': 'pumps-landed', 'policy': 'allowance', 'unclear': 1, 'rate': 0.06, 'gapWarn': 0.10, 'load': 3500, 'ins': 0.005, 'duty': 0.017, 'impFix': 450, 'unload': 2800,
     'items': [{'id': 'I1', 'allowance': 14000}, {'id': 'I2', 'allowance': 18000}, {'id': 'I3', 'allowance': 22000}, {'id': 'I4', 'allowance': 45000}],
     'quotes': [Qd('Q1', 412000, 'EUR', 1, 'DAP', True, C([('I2', 'opt', 16000)])),
                Qd('Q2', 405000, 'USD', 0.92, 'EXW', False, C([('I2', 'opt', 21000)]), pre=4800, main=14000, onc=1900),
                Qd('Q3', 318000, 'USD', 0.92, 'FOB', False, C([('I1', 'unc'), ('I2', 'exc'), ('I3', 'exc'), ('I4', 'unc')]), pre=2500, main=9500, onc=1900, adv=0.3, advMonths=6)]},
    {'id': 'elec-epc', 'policy': 'allowance', 'unclear': 1, 'rate': 0.06, 'gapWarn': 0.10,
     'items': [{'id': 'I1', 'allowance': 240000}, {'id': 'I2', 'allowance': 95000}, {'id': 'I3', 'allowance': 140000}, {'id': 'I4', 'allowance': 70000},
               {'id': 'I5', 'allowance': 35000}, {'id': 'I6', 'allowance': 60000}],
     'quotes': [Qd('Q1', 7350000, 'EUR', 1, 'site', True, C([('I2', 'unc'), ('I3', 'unc'), ('I6', 'unc')])),
                Qd('Q2', 7690000, 'EUR', 1, 'site', True, C([('I6', 'exc')])),
                Qd('Q3', 7820000, 'EUR', 1, 'site', True, {}, adj=-40000)]},
    {'id': 'steel-policy', 'policy': 'allowance', 'unclear': 1, 'rate': 0.06, 'gapWarn': 0.10,
     'items': [{'id': 'I1', 'allowance': 90000}, {'id': 'I2', 'allowance': 60000}, {'id': 'I3', 'allowance': 110000}, {'id': 'I4', 'allowance': 30000}],
     'quotes': [Qd('Q1', 1905000, 'EUR', 1, 'site', True, C([('I1', 'inc', 145000), ('I2', 'inc', 70000), ('I3', 'exc'), ('I4', 'inc', 40000)])),
                Qd('Q2', 1990000, 'EUR', 1, 'site', True, C([('I1', 'inc', 120000), ('I2', 'inc', 85000), ('I3', 'inc', 195000), ('I4', 'inc', 35000)])),
                Qd('Q3', 1745000, 'EUR', 1, 'site', True, C([('I1', 'exc'), ('I2', 'inc', 65000), ('I3', 'opt', 125000), ('I4', 'inc', 30000)]))]},
]


def hand_cases():
    cs = []
    lg = {'load': 1000, 'ins': 0.01, 'duty': 0.02, 'impFix': 300, 'unload': 600}
    for inc in BUYER:
        for eu in (False, True):
            cs.append(dict(lg, id='hand-%s-%s' % (inc, 'eu' if eu else 'non'), quotes=[Qd('A', 100000, 'EUR', 1, inc, eu, {}, pre=2000, main=5000, onc=800),
                                                                                       Qd('B', 112000, 'EUR', 1, 'DDP', False, {})]))
    base = {'items': [{'id': 'I1', 'allowance': 100}], 'quotes': [Qd('A', 1000, 'EUR', 1, 'site', True, C([('I1', 'exc')])), Qd('B', 1100, 'EUR', 1, 'site', True, C([('I1', 'inc', 80)])),
                                                                  Qd('C', 950, 'EUR', 1, 'site', True, C([('I1', 'opt', 120)]))]}
    for pol in ('allowance', 'max', 'mean'):
        cs.append(dict(base, id='hand-policy-' + pol, policy=pol))
    cs.append({'id': 'hand-unclear', 'unclear': 0.5, 'items': [{'id': 'I1', 'allowance': 100}, {'id': 'I2', 'allowance': 50}, {'id': 'I3', 'allowance': 40}],
               'quotes': [Qd('A', 1000, 'EUR', 1, 'site', True, C([('I1', 'exc'), ('I2', 'unc'), ('I3', 'opt', 30)])), Qd('B', 1200, 'EUR', 1, 'site', True, {})]})
    cs.append({'id': 'hand-fin', 'rate': 0.08, 'quotes': [Qd('A', 200000, 'GBP', 1.15, 'site', True, {}, adv=0.3, advMonths=9, adj=5000), Qd('B', 240000, 'EUR', 1, 'site', True, {})]})
    cs.append({'id': 'hand-tie', 'quotes': [Qd('A', 100, 'EUR', 1, 'site', True, {}), Qd('B', 100, 'EUR', 1, 'site', True, {}), Qd('C', 101, 'EUR', 1, 'site', True, {})]})
    cs.append({'id': 'hand-invalid', 'quotes': [Qd('A', 0, 'EUR', 1, 'site', True, {}), Qd('B', 10, 'USD', None, 'site', True, {}), Qd('C', 12, 'EUR', 1, 'site', True, {})]})
    cs.append({'id': 'hand-allexc', 'items': [{'id': 'I1', 'allowance': 10}], 'quotes': [Qd('A', 100, 'EUR', 1, 'site', True, C([('I1', 'exc')])), Qd('B', 105, 'EUR', 1, 'site', True, C([('I1', 'unc')]))]})
    cs.append({'id': 'hand-lo', 'items': [{'id': 'I1', 'allowance': 100}],
               'quotes': [Qd('A', 1000, 'EUR', 1, 'site', True, {}), Qd('B', 950, 'EUR', 1, 'site', True, C([('I1', 'exc')]))]})
    # input rules 1.1.0 (SPEC (a)-(e))
    cs.append({'id': 'hand-eurfx', 'quotes': [Qd('A', 405000, 'EUR', 0.92, 'site', True, {}), Qd('B', 400000, 'EUR', 1, 'site', True, {})]})
    opt_items = [{'id': 'I1', 'allowance': 18000}]
    for pol in ('allowance', 'max'):
        cs.append({'id': 'hand-optnoamt-' + pol, 'policy': pol, 'items': opt_items,
                   'quotes': [Qd('A', 100000, 'EUR', 1, 'site', True, C([('I1', 'opt')])), Qd('B', 101000, 'EUR', 1, 'site', True, C([('I1', 'opt', 16000)]))]})
    cs.append({'id': 'hand-zeroplug', 'items': [{'id': 'I1', 'allowance': 0}, {'id': 'I2', 'allowance': 0}],
               'quotes': [Qd('A', 2450000, 'EUR', 1, 'site', True, C([('I1', 'exc'), ('I2', 'unc')])), Qd('B', 2610000, 'EUR', 1, 'site', True, {})]})
    cs.append({'id': 'hand-zeroplug-u0', 'unclear': 0, 'items': [{'id': 'I1', 'allowance': 0}],
               'quotes': [Qd('A', 1000, 'EUR', 1, 'site', True, C([('I1', 'unc')])), Qd('B', 1100, 'EUR', 1, 'site', True, {})]})
    cs.append({'id': 'hand-negative', 'quotes': [Qd('A', 1000, 'EUR', 1, 'site', True, {}, adj=-2000), Qd('B', 1500, 'EUR', 1, 'site', True, {}), Qd('C', 1600, 'EUR', 1, 'site', True, {}, adj=-1600)]})
    cs.append({'id': 'hand-dup', 'items': [{'id': 'I1', 'allowance': 100}, {'id': 'I1', 'allowance': 40}],
               'quotes': [Qd('A', 1000, 'EUR', 1, 'site', True, C([('I1', 'exc')])), Qd('A', 1050, 'EUR', 1, 'site', True, {}), Qd('B', 1080, 'EUR', 1, 'site', True, {})]})
    return cs


def random_cases(n, seed=20261115):
    rnd = random.Random(seed)
    incs = list(BUYER)
    out = []
    for k in range(n):
        ni = rnd.randint(0, 6)
        items = [{'id': 'I%d' % (j + 1), 'allowance': rnd.choice([0, round(rnd.uniform(1000, 90000), 2)])} for j in range(ni)]
        quotes = []
        for j in range(rnd.randint(1, 5)):
            cur = rnd.choice(['EUR', 'EUR', 'USD', 'GBP'])
            cells = {}
            for it in items:
                s = rnd.choice(['inc', 'inc', 'exc', 'unc', 'opt'])
                amt = round(rnd.uniform(500, 80000), 2) if (s == 'opt' and rnd.random() < 0.8) or (s == 'inc' and rnd.random() < 0.5) else None
                cells[it['id']] = {'s': s, 'amt': amt}
            quotes.append({'id': 'Q%d' % (j + 1), 'price': round(rnd.uniform(5e4, 3e6), 2), 'cur': cur, 'fx': rnd.choice([1, 1, 0.92]) if cur == 'EUR' else round(rnd.uniform(0.8, 1.2), 4),
                           'incoterm': rnd.choice(incs), 'eu': rnd.random() < 0.5, 'pre': round(rnd.uniform(0, 8000), 2), 'main': round(rnd.uniform(0, 30000), 2),
                           'onc': round(rnd.uniform(0, 4000), 2), 'adv': rnd.choice([0, 0.1, 0.3]), 'advMonths': rnd.choice([0, 3, 6, 12]),
                           'adj': rnd.choice([0, 0, round(rnd.uniform(-20000, 30000), 2)]), 'cells': cells})
        out.append({'id': 'rnd-%03d' % k, 'policy': rnd.choice(['allowance', 'max', 'mean']), 'unclear': rnd.choice([1, 0.5, 0.75]), 'rate': rnd.choice([0.04, 0.06, 0.08]),
                    'gapWarn': 0.10, 'load': rnd.choice([0, 1500]), 'ins': rnd.choice([0, 0.003, 0.005]), 'duty': rnd.choice([0, 0.017, 0.027]),
                    'impFix': rnd.choice([0, 450]), 'unload': rnd.choice([0, 2800]), 'items': items, 'quotes': quotes})
    return out


def aha(res, cases):
    by = {c['id']: level(c) for c in cases}
    a = {}
    r = by['hvac-sub']
    a['hvac-sub'] = (r['rawLeader'] == 'Q1' and r['rows']['Q1']['rank'] == 4 and abs(r['rows']['Q1']['plug'] - 320000) < 1e-6 and r['leader'] == 'Q2'
                     and abs(r['lead'] - 54000) < 1e-6 and abs(r['rows']['Q1']['gapShare'] - 0.1155) < 5e-4)
    r = by['pumps-landed']
    a['pumps-landed'] = (r['leader'] == 'Q3' and abs(r['lead'] - 12512.2434) < 1e-3 and abs(r['rows']['Q3']['gapShare'] - 0.2383) < 5e-4
                         and abs(r['stability']['hi'] - 1.1264) < 5e-4 and abs(1 - 292560 / 412000 - 0.290) < 5e-4)
    r = by['elec-epc']
    a['elec-epc'] = r['leader'] == 'Q1' and abs(r['lead'] - 105000) < 1e-6 and abs(r['stability']['hi'] - 1.4468) < 5e-4
    s = dict(by and next(c for c in cases if c['id'] == 'steel-policy'))
    r1 = level(s)
    s2 = json.loads(json.dumps(s))
    s2['policy'] = 'max'
    r2 = level(s2)
    a['steel-policy'] = r1['leader'] == 'Q3' and abs(r1['lead'] - 30000) < 1e-6 and r2['leader'] == 'Q2' and abs(r2['rows']['Q3']['L'] - 2015000) < 1e-6
    return a


def main():
    cases = PRESETS + hand_cases() + random_cases(150)
    res = [{'input': c, 'expect': level(c)} for c in cases]
    out = {'tool': 'quotelevel', 'generator': 'bench-src/ref/gen_quotelevel.py', 'cases': res, 'aha': aha(res, PRESETS)}
    p = pathlib.Path(__file__).resolve().parent / 'quotelevel_ref.json'
    p.write_text(json.dumps(out, indent=0, allow_nan=False, default=lambda o: None), encoding='utf-8')
    print('cases', len(res), 'aha', out['aha'])


if __name__ == '__main__':
    main()
