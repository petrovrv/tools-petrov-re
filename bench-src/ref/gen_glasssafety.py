# gen_glasssafety.py — independent reference for the glasssafety bench (tools.petrov.re, Glazing & Windows package).
# Written from the norm pages, not from glz-safety.js:
#   NBN S 23-002/A1:2010 (+AC:2010) §4.4.2.2.1–4.4.2.2.2, Tableau 5 (p. 12 of the amendment, rendered to PNG and re-typed here as a
#   decision table by category group), Tableau 6 (p. 13); EN 12600:2002 §6.2/6.3 (drop height class, breakage mode);
#   NBN B 03-004:2017 §9.2 (balustrades: laminated 1B1 only; all-toughened needs a top rail or a post-breakage test),
#   §5.3.1 Tab. 1 (protection height H, H' = H + y for x <= 950 mm; >= 12 m fall: 1200 mm), typed from the rendered page p. 19;
#   NBN S 23-002:2007 §4.4.2.2.5 (visibility marking: public place, circulation on both sides, width > 0,55 m, in the 0,60–1,50 m band).
# What is NOT independent (r2-fix, R2-REVIEW CR-10): the EN 12600 class algebra (ok_one), the class inference of undeclared products
# (PVB >= 0,76 mm ~ 1B1, 0,38 mm ~ 2B2, toughened = C; learning assumption), the 'B -> verify' override, the insulating-glass rule
# 'adjacent pane, only if it has no requirement of its own' and the case-4 'lower pane' choice follow the same reading as the engine;
# they are shared interpretations of the norm text, not a second opinion. Cases, Tab. 5 / 6 cells, boundaries, Tab. 1 heights and the
# marking rule are re-typed from the pages.
# Output: bench-src/ref/glasssafety_ref.json — a list of cases {id, note, input, expect:{case, panes:[verdict], verdict, alts:[[...] per pane]}}.
# Run: python -I bench-src/ref/gen_glasssafety.py
import json, os, itertools

HERE = os.path.dirname(os.path.abspath(__file__))
CATS = ['A', 'B', 'C1', 'C2', 'C3', 'C4', 'C5', 'D', 'E']

# ---- Tableau 5 as read on the page: column -> {category group: alternatives or None (*)}
def tab5(col, grp):
    if col == 'c1': return ['1C-', '2B2']            # all rows; A carries note (5); AC:2010 item 1 '1C- (ou 2B2)'
    if col == 'c2': return ['1B1']
    if col == 'c3': return ['1C-', '1B1'] if grp == 'C' else None   # C rows: note (4) = recommendation only
    if col == 'c4': return ['B', 'C']                # specific prescriptions of case 4 (break type B or C, no A)
    if col == 'c5L': return ['1B1']
    if col == 'c5O': return ['1C-', '2B2']
    if col == 'c6': return ['1B1']
    if col == 'c7': return ['2B2', '1C-']
    if col == 'c8': return ['3B3', '1C-']
    raise KeyError(col)

TAB6 = {  # (base < 0,90 m, base >= 0,90 m)
    'street_furniture': (['1B1', '1C1'], ['2B2', '1C2']),
    'shower': (['1B1', '1C-'], ['1B1', '1C-']),
    'balcony_separation': (['1C2'], ['1C2']),
    'showcase_fin': (['1B1', '1C1'], ['1B1', '1C1']),
}

# ---- EN 12600 class algebra (written from EN 12600 §6 and the A1 Tab. 3/4 reading)
def parse(s):
    s = s.strip().upper()
    a = int(s[0]) if s[0] in '123' else None
    rest = s[1:] if a else s
    b = rest[0]
    p = rest[1:] if len(rest) > 1 else None
    if p not in (None, '-'): p = int(p)
    return a, b, p

def ok_one(have, need):
    """'pass' / 'fail' / 'verify'"""
    ha, hb, hp = parse(have); na, nb, np_ = parse(need)
    if hb == 'A': return 'fail'
    if nb == 'B' and hb != 'B': return 'fail'
    if na is None: return 'pass'
    if ha is None: return 'verify'
    if ha > na: return 'fail'
    if np_ in (None, '-'): return 'pass'
    if hb == 'B' and nb == 'C': return 'pass'           # general note: C may always be replaced by B
    if hp in (None, '-'): return 'verify'
    if hp == 0 or hp > np_: return 'fail'
    return 'pass'

def ok_any(have, alts):
    res = [ok_one(have, x) for x in alts]
    return 'pass' if 'pass' in res else 'verify' if 'verify' in res else 'fail'

# ---- products (label, plies, interlayer, glass) -> class used by the reference
def cls_of(p, declared=None):
    if declared: return declared
    plies, il, glass = p
    if len(plies) >= 2:
        m = min(il)
        return '1B1' if m >= 0.76 - 1e-9 else '2B2' if m >= 0.38 - 1e-9 else 'B'
    return 'C' if glass == 'toughened' else 'A'

F4 = ([4], [], 'float'); T6 = ([6], [], 'toughened'); L332 = ([3, 3], [0.76], 'float'); L331 = ([3, 3], [0.38], 'float')
L442 = ([4, 4], [0.76], 'float'); L1010T = ([10, 10], [0.76], 'toughened')
COMPS = {  # id: (panes outer->inner, declared)
    'F4': ([F4], [None]), 'T6d': ([T6], ['1C2']), 'T6': ([T6], [None]), 'L332': ([L332], [None]), 'L331': ([L331], [None]),
    'F4|T6d': ([F4, T6], [None, '1C2']), 'F4|L331': ([F4, L331], [None, None]), 'T6|T6d': ([T6, T6], [None, '1C2']),
    'L442|T6': ([L442, T6], [None, None]), 'L1010T': ([L1010T], [None]),
    'L442|L332': ([L442, L332], [None, None]), 'L442|F4': ([L442, F4], [None, None]), 'L442': ([L442], [None]),
    'F4|F4|L332': ([F4, F4, L332], [None, None, None]), 'F4|F4|T6d': ([F4, F4, T6], [None, None, '1C2']), 'T6|F4|T6d': ([T6, F4, T6], [None, None, '1C2']),
}

def h_tab1(b):
    # NBN B 03-004:2017 §5.3.1 Tab. 1 (p. 19): H by balustrade thickness Ep; >= 12 m fall 1200 mm; §5.3.1(6) H' = H + y when x <= 950 mm
    Ep, drop = b.get('Ep_mm', 0), b.get('drop_m', 0)
    if drop >= 12: H = 1200
    elif Ep <= 200: H = 1100
    elif Ep < 400: H = 1100 - Ep / 2
    else: H = 900
    if b.get('y_mm', 0) > 0 and b.get('x_mm', 1e9) <= 950: H += b['y_mm']
    return H

def marking(sit):
    # NBN S 23-002:2007 §4.4.2.2.5: public places (categories C, D; public outdoor side), circulation on both sides (doors, partitions),
    # transparent glazing wider than 0,55 m reaching into the 0,60–1,50 m band
    kind = sit['kind']
    if kind not in ('door', 'partition', 'window', 'curtainwall'): return False
    public = sit['category'][0] in 'CD' or sit.get('outside') == 'public'
    both = kind in ('door', 'partition')
    bottom = sit['door']['hb_m'] if kind == 'door' else sit.get('sill_m', 0)
    return public and both and sit['w_m'] > 0.55 and bottom < 1.50 and bottom + sit['h_m'] > 0.60

def side_need(cat, h, hc, H, sit):
    # cases 1–3 of A1 §4.4.2.2.2 on one side people can reach -> (case number, alternatives, level)
    grp = cat[0]
    col = 3 if h >= H else 1 if hc <= 1.5 else 2
    if col == 1 and (sit['w_m'] < 0.3 or sit['w_m'] * sit['h_m'] < 0.5): return col, None, None        # small pane: visible width / daylight area
    if col in (1, 2) and sit.get('barrier') == 'impact_side': return col, None, None                    # barrier takes the impact -> A acceptable
    if col == 2 and sit.get('barrier') == 'opposite': return col, ['B', 'C'], 'required'                # toughened acceptable on the impact side
    if col == 3: return col, (['1C-', '1B1'], 'recommended') if (grp == 'C' and sit.get('extra_impacts')) else None, None
    return col, tab5('c%d' % col, grp), 'required'

def js_pane(p): return {'plies_mm': p[0], 'interlayer_mm': p[1], 'glass': p[2]}

def expect(sit, comp):
    """sit: dict with kind, category, geometry; returns case key, required alternatives per pane, verdict per pane"""
    panes, decl = COMPS[comp]
    n = len(panes); outer, inner = 0, n - 1
    cat = sit['category']; grp = cat[0]; kind = sit['kind']
    need = [[] for _ in range(n)]          # list of (alts, level, why)
    case = None
    if kind in TAB6:
        case = 'case9'
        alts = TAB6[kind][0 if sit.get('sill_m', 0) < 0.90 else 1]
        for k in range(n): need[k].append((alts, 'required', ''))
    elif kind == 'balustrade':
        case = 'balu'
        for k in range(n): need[k].append((['1B1'], 'required', 'lam'))
    elif kind == 'ceiling':
        case = 'case7'; need[inner].append((tab5('c7', grp), 'required', ''))
    elif kind == 'cladding':
        if sit['w_m'] * sit['h_m'] > 1.0 and sit['cladding_bottom_m'] < 1.5:
            case = 'case8'
            for k in range(n): need[k].append((tab5('c8', grp), 'required', ''))
        else: case = 'case8n'
    elif kind in ('roof', 'canopy'):
        case = 'case6'; need[inner].append((tab5('c6', grp), 'required', ''))
    elif kind == 'door':
        d = sit['door']
        if sit['w_m'] * sit['h_m'] > 0.5 and d['hb_m'] < 1.40:
            case = 'case5L' if d.get('landing') else 'case5O'
            for k in range(n): need[k].append((tab5('c5L' if d.get('landing') else 'c5O', grp), 'required', ''))
        else: case = 'case5n'
    elif sit.get('tilt_deg', 0) > 30:
        return {'refused': 'special' if sit.get('over_zone') else 'not_covered'}     # A1 p. 9: special study over a human-activity zone
    else:
        H = sit.get('H_m', 0.90)
        def put(pane, res):
            col, alts, lvl = res
            if isinstance(alts, tuple): alts, lvl = alts
            if alts: need[pane].append((alts, lvl, ''))
            return col, lvl
        if (sit.get('tilt_deg', 0) > 15 or sit.get('overhang_m', 0) > 0.5) and sit.get('over_zone'):
            case = 'case4'
            low = inner if sit.get('overhang_side') == 'in' else outer
            need[low].append((['B', 'C'], 'required', 'lower'))
            put(inner, side_need(cat, sit['sill_m'], sit['fall_m'], H, sit))     # room side still cases 1–3 (A1 p. 4, impact side)
        else:
            sides = [(cat, sit['sill_m'], sit['fall_m'], inner)]
            if kind == 'partition': sides.append((cat, sit.get('sill_out_m', 0), sit.get('fall_out_m', 0), outer))
            elif sit.get('outside') == 'public': sides.append(('C5', sit.get('sill_out_m', 0), sit.get('fall_out_m', 0), outer))
            got = [put(pn, side_need(c, h, hc, H, sit)) for c, h, hc, pn in sides]
            rank = lambda g: 0 if g[1] is None else 1 if g[1] == 'recommended' else 3 if g[0] == 2 else 2
            case = 'case%d' % max(got, key=rank)[0]
    # insulating glass: impact-side pane toughened -> adjacent pane safety glass (not for roofs, where the inner pane is prescribed)
    have = [cls_of(p, decl[i]) for i, p in enumerate(panes)]
    if n >= 2 and case not in ('case6', 'balu'):
        req = [any(l == 'required' for _, l, _ in need[k]) for k in range(n)]
        extra = set()
        for k in (0, n - 1):                    # impact-side panes are the outer / inner ones; the adjacent pane gets the rule
            adj = 1 if k == 0 else n - 2
            if req[k] and parse(have[k])[1] == 'C' and not req[adj]: extra.add(adj)
        for k in sorted(extra): need[k].append((['B', 'C'], 'required', 'igu'))
    verdicts = []
    for k in range(n):
        if not need[k]: verdicts.append('free'); continue
        rs, rec = [], []
        for alts, lvl, why in need[k]:
            r = ok_any(have[k], alts)
            if lvl == 'recommended': rec.append(r); continue
            if r == 'fail' and have[k] == 'B': r = 'verify'
            rs.append(r)
        if not rs and rec:                    # recommendation only (A1 Tab. 5 note 4): not a requirement
            verdicts.append('advice' if 'fail' in rec else 'pass'); continue
        all_t = len(panes[k][0]) >= 2 and panes[k][2] == 'toughened'
        if case == 'case4' and all_t: rs.append('fail')                        # A1 case 4: no all-toughened laminate
        if case == 'balu':
            if len(panes[k][0]) < 2: rs = ['fail' for _ in rs]                  # B 03-004 §9.2(1) laminated only
            if all_t and not (sit.get('balustrade', {}).get('handrail') or sit.get('balustrade', {}).get('postbreak_test')): rs.append('fail')
        verdicts.append('fail' if 'fail' in rs else 'verify' if 'verify' in rs else 'pass')
    out = {}
    low_guard = False
    if case == 'balu':
        b = sit.get('balustrade', {}); out['Hp_mm'] = h_tab1(b)
        low_guard = b.get('top_mm', 0) > 0 and b['top_mm'] < out['Hp_mm']        # Tab. 1 height is a requirement of the guard
    anyreq = any(l == 'required' for k in range(n) for _, l, _ in need[k])
    overall = 'fail' if ('fail' in verdicts or low_guard) else 'verify' if 'verify' in verdicts else 'pass' if anyreq else 'free'
    out.update({'case': case, 'alts': [sorted(sorted(a) for a, l, w in need[k]) for k in range(n)], 'panes': verdicts, 'verdict': overall, 'marking': marking(sit)})
    return out

SITS = []
def S(name, **kw): SITS.append((name, kw))
for cat in CATS:
    S(f'{cat}-c1', category=cat, kind='window', w_m=1.0, h_m=1.5, sill_m=0.3, fall_m=1.0)
    S(f'{cat}-c1-hc150', category=cat, kind='window', w_m=1.0, h_m=1.5, sill_m=0.3, fall_m=1.5)
    S(f'{cat}-c2', category=cat, kind='window', w_m=1.0, h_m=1.5, sill_m=0.3, fall_m=4.0)
    S(f'{cat}-c3', category=cat, kind='window', w_m=1.0, h_m=1.5, sill_m=0.9, fall_m=4.0)
    S(f'{cat}-small', category=cat, kind='window', w_m=0.6, h_m=0.8, sill_m=0.2, fall_m=0.2)
    S(f'{cat}-door-landing', category=cat, kind='door', w_m=0.8, h_m=1.2, door={'landing': True, 'hb_m': 0.3})
    S(f'{cat}-door', category=cat, kind='door', w_m=0.8, h_m=1.2, door={'landing': False, 'hb_m': 0.3})
    S(f'{cat}-door-high', category=cat, kind='door', w_m=0.8, h_m=0.6, door={'landing': True, 'hb_m': 1.4})
    S(f'{cat}-roof', category=cat, kind='roof', w_m=1.0, h_m=1.5, tilt_deg=80)
    S(f'{cat}-ceiling', category=cat, kind='ceiling', w_m=0.6, h_m=0.6)
    S(f'{cat}-clad', category=cat, kind='cladding', w_m=1.0, h_m=1.2, cladding_bottom_m=0.4)
    S(f'{cat}-clad-high', category=cat, kind='cladding', w_m=1.0, h_m=1.2, cladding_bottom_m=1.6)
    S(f'{cat}-inclined', category=cat, kind='curtainwall', w_m=1.2, h_m=2.0, sill_m=3.0, fall_m=3.0, tilt_deg=25, over_zone=True, overhang_side='out')
for k in TAB6:
    for sill in (0.2, 0.9):
        S(f'tab6-{k}-{sill}', category='C3', kind=k, w_m=1.0, h_m=1.8, sill_m=sill)
S('balu-thin', category='A', kind='balustrade', w_m=1.2, h_m=1.0, balustrade={'Ep_mm': 21})
S('balu-rail', category='A', kind='balustrade', w_m=1.2, h_m=1.0, balustrade={'Ep_mm': 21, 'handrail': True})
# r2-fix (R2-REVIEW CR-7 / CR-10): branches not in the grid above, expectations from the norm pages
# NBN B 03-004 Tab. 1 heights by hand: Ep 21 -> 1100; Ep 300 -> 950; Ep 450 -> 900; fall 12 m -> 1200; x 900 / y 150 -> H' 1250; x 1000 -> 1100
S('balu-H-1100-ok', category='A', kind='balustrade', w_m=1.2, h_m=1.1, balustrade={'Ep_mm': 21, 'drop_m': 4, 'top_mm': 1100}, H_hand=1100)
S('balu-H-1100-low', category='A', kind='balustrade', w_m=1.2, h_m=0.9, balustrade={'Ep_mm': 21, 'drop_m': 4, 'top_mm': 900}, H_hand=1100)
S('balu-H-thick300', category='A', kind='balustrade', w_m=1.2, h_m=0.9, balustrade={'Ep_mm': 300, 'drop_m': 4, 'top_mm': 960}, H_hand=950)
S('balu-H-thick450', category='A', kind='balustrade', w_m=1.2, h_m=0.9, balustrade={'Ep_mm': 450, 'drop_m': 4, 'top_mm': 890}, H_hand=900)
S('balu-H-12m', category='A', kind='balustrade', w_m=1.2, h_m=1.1, balustrade={'Ep_mm': 21, 'drop_m': 12, 'top_mm': 1100}, H_hand=1200)
S('balu-H-prime', category='A', kind='balustrade', w_m=1.2, h_m=1.1, balustrade={'Ep_mm': 21, 'drop_m': 4, 'top_mm': 1200, 'x_mm': 900, 'y_mm': 150}, H_hand=1250)
S('balu-H-prime-far', category='A', kind='balustrade', w_m=1.2, h_m=1.1, balustrade={'Ep_mm': 21, 'drop_m': 4, 'top_mm': 1200, 'x_mm': 1000, 'y_mm': 150}, H_hand=1100)
# A1 §4.4.2.2.2 barrier options (case 1 / case 2), other side public (C5 row) and partitions (two sides)
S('barrier-c1-impact', category='A', kind='window', w_m=1.0, h_m=1.5, sill_m=0.3, fall_m=1.0, barrier='impact_side')
S('barrier-c2-impact', category='A', kind='window', w_m=1.0, h_m=1.5, sill_m=0.3, fall_m=4.0, barrier='impact_side')
S('barrier-c2-opposite', category='B', kind='window', w_m=1.0, h_m=1.5, sill_m=0.3, fall_m=4.0, barrier='opposite')
S('outside-public', category='A', kind='window', w_m=1.2, h_m=2.0, sill_m=0.3, fall_m=0.3, outside='public', sill_out_m=0.0, fall_out_m=0.0)
S('outside-public-c3', category='B', kind='window', w_m=1.2, h_m=1.0, sill_m=1.0, fall_m=0.3, outside='public', sill_out_m=0.2, fall_out_m=0.0)
S('partition-2sides', category='C3', kind='partition', w_m=1.2, h_m=2.4, sill_m=0.0, fall_m=0.0, sill_out_m=0.0, fall_out_m=2.0)
# case 4 by overhang > 0,5 m with tilt <= 15°; case 4 with the room side in case 2 (CR-8); > 30° refusals (CR-35)
S('overhang-case4', category='D', kind='curtainwall', w_m=1.5, h_m=2.5, sill_m=3.0, fall_m=3.0, tilt_deg=5, overhang_m=0.8, over_zone=True, overhang_side='out')
S('case4-room-c2', category='A', kind='curtainwall', w_m=1.5, h_m=2.5, sill_m=0.0, fall_m=6.0, tilt_deg=20, over_zone=True, overhang_side='out')
S('tilt35-over-zone', category='D', kind='curtainwall', w_m=1.5, h_m=2.5, sill_m=3.0, fall_m=3.0, tilt_deg=35, over_zone=True)
S('tilt35-no-zone', category='A', kind='curtainwall', w_m=1.5, h_m=2.5, sill_m=3.0, fall_m=3.0, tilt_deg=35, over_zone=False)
# case 3 in categories C with other impacts (note 4: recommendation); protection height H set by the specification (CR-9)
S('c3-extra-impacts', category='C1', kind='window', w_m=1.2, h_m=1.5, sill_m=1.0, fall_m=0.5, extra_impacts=True)
S('H110-sill095', category='A', kind='window', w_m=1.2, h_m=1.3, sill_m=0.95, fall_m=6.0, H_m=1.10)
S('H090-sill095', category='A', kind='window', w_m=1.2, h_m=1.3, sill_m=0.95, fall_m=6.0, H_m=0.90)
# small-pane exemption by width / area (CR-30)
S('small-transom', category='A', kind='window', w_m=1.5, h_m=0.25, sill_m=0.2, fall_m=0.2)
S('wide-low-strip', category='A', kind='window', w_m=2.5, h_m=0.25, sill_m=0.2, fall_m=0.2)
# visibility marking (2007 §4.4.2.2.5)
S('marking-public-door', category='C3', kind='door', w_m=0.9, h_m=2.1, door={'landing': False, 'hb_m': 0.0})
S('marking-dwelling-door', category='A', kind='door', w_m=0.9, h_m=2.1, door={'landing': False, 'hb_m': 0.0})
S('marking-narrow-partition', category='D', kind='partition', w_m=0.5, h_m=2.4, sill_m=0.0, fall_m=0.0, sill_out_m=0.0, fall_out_m=0.0)
S('marking-high-partition', category='D', kind='partition', w_m=1.2, h_m=0.6, sill_m=1.6, fall_m=0.0, sill_out_m=1.6, fall_out_m=0.0)

cases = []
for name, sit in SITS:
    hand = sit.pop('H_hand', None)
    if name.startswith('balu-H'): comps = ['L332', 'L442']
    elif name.startswith('balu'): comps = ['L332', 'L331', 'T6', 'L1010T']
    elif name.startswith(('case4-room', 'overhang')): comps = ['L442|T6', 'L442|L332', 'L442|F4', 'F4|T6d']
    elif name.startswith(('H1', 'H0', 'c3-extra', 'barrier')): comps = ['F4', 'T6d', 'T6', 'L332', 'L331', 'F4|T6d', 'F4|F4|L332', 'F4|F4|T6d', 'T6|F4|T6d']
    else: comps = ['F4', 'T6d', 'L332', 'L331', 'F4|T6d', 'F4|L331', 'T6|T6d', 'L442|T6']
    pts = []
    for c in comps:
        panes, decl = COMPS[c]
        inp = dict(sit); inp['glazing'] = {'type': ['single', 'double', 'triple'][len(panes) - 1], 'panes': [js_pane(p) for p in panes], 'cavity_mm': [16] * (len(panes) - 1)}
        inp['declared'] = decl
        e = expect(sit, c)
        if hand is not None: assert e['Hp_mm'] == hand, (name, e['Hp_mm'], hand)   # Tab. 1 function vs the hand values above
        pts.append({'comp': c, 'input': inp, 'expect': e})
    cases.append({'id': name, 'note': f"{sit['kind']} {sit['category']}", 'points': pts})
# the norm's own example (A1 §4.4.2.2.1): window in case 2 -> 1B1 -> 33.2 PVB is a minimum
ex = {'category': 'A', 'kind': 'window', 'w_m': 1.0, 'h_m': 1.5, 'sill_m': 0.3, 'fall_m': 4.0}
# external anchor = only what the norm says (33.2 meets 1B1); 33.1 -> 2B2 is the learning assumption and stays an ordinary case (CR-33)
pt = lambda c: {'comp': c, 'input': dict(ex, glazing={'type': 'single', 'panes': [js_pane(COMPS[c][0][0])], 'cavity_mm': []}, declared=[None]), 'expect': expect(ex, c)}
cases.append({'id': 'norm-example-case2-33.2', 'note': 'A1 §4.4.2.2.1 example: case 2 -> 1B1; 33.2 PVB meets it', 'anchor': True, 'points': [pt('L332')]})
cases.append({'id': 'case2-33.1-learning-assumption', 'note': 'case 2 -> 1B1; undeclared 33.1 (0,38 mm PVB ~ 2B2, learning assumption) does not meet it', 'points': [pt('L331')]})
assert cases[-2]['points'][0]['expect']['verdict'] == 'pass' and cases[-1]['points'][0]['expect']['verdict'] == 'fail'
with open(os.path.join(HERE, 'glasssafety_ref.json'), 'w', encoding='utf-8') as f:
    json.dump(cases, f, indent=0)
print(len(cases), 'cases,', sum(len(c['points']) for c in cases), 'points')
