"""Independent reference for facadesound.html (engine acu-facade.js + the Tab. 3 rule of acu-req.js), written from the rendered norm pages
(not ported from the JS):
EN ISO 12354-3:2017 §4.1 Formula (1) R' = -10 lg(sum tau), (4) D2m,nT = R' + dLfs + 10 lg(0,16 V/(T0 S)), T0 0,5 s; §4.2 Formula (7)
small technical elements tau = (A0/S) 10^(-Dn,e/10), A0 10 m2, (8) other elements tau = (Si/S) 10^(-Ri/10); NOTE 5-6 (single numbers Rw + Ctr);
Annex C Table C.1 (dLfs per facade shape x line-of-sight height x alpha_w, linear interpolation over alpha_w); Annex G.1 Tables G.1-G.2
(worked example, printed R'(Rw+Ctr) 27,8 dB and D2m,nT,Atr 29,3 dB = external anchor);
NBN S 01-400-1:2022 §7.2 Tab. 3 with notes a-c (DAtr >= LA,day - 30 / - 34, >= 32 / 28; bedrooms LA,night - 25 / - 28; 34 dB with
LAmax,3x,night >= 70; + 3 dB with a second exposed pane with a vent or RAtr < 48 when LA,day >= 62 / LA,night >= 56; galleries D2m,A 44 / 40),
Annex A Tab. A.1 (RAtr >= DAtr + 3 + 10 lg[3(Snet + 5n)/V], Dne,Atr >= RAtr + 3), Annex B (B.1 + 3 dB, B.2, B.3 classes 60/65/70/77 day,
55/60/65/72 night, two roads +2/+1/0), Annex C.3 method 2 Figures C.1-C.16 (a/b/c corrections at 0/15/30/45 deg, interpolation over alpha;
C.12 beta steps, C.14 +1, C.15 0/-2, C.16 +1/-1 by l < / > 2,5 m; tie 2,5 m -> the < 2,5 m value, conservative), Annex D (LA,day = Lday + 1 + 3; = Lden - 1 + 3 road/air, Lden - 5 + 3 rail;
LA,night = Lnight + 5 + 3).
Shared reading with the engine (labelled on the page): the horizontal (C.1-C.10) and vertical (C.12-C.16) corrections are added; class 4 of
Annex B at its lower bound; flanking transmission neglected (§4.3).
python -I bench-src/ref/gen_facadesound.py  ->  bench-src/ref/facadesound_ref.json"""
import json, math, os

lg = math.log10
CSAB, T0, A0 = 0.16, 0.5, 10.0

# ---------- NBN S 01-400-1 Tab. 3 (rendered p. 22): class index A, B, C ----------
DAY_OFF = {'A': 30, 'B': 30, 'C': 34}
DAY_MIN = {'A': 32, 'B': 32, 'C': 28}
NIGHT_OFF = {'A': 25, 'B': 25, 'C': 28}
GALLERY = {'A': 44, 'B': 44, 'C': 40}
PROTECTED = ('bedroom', 'living', 'kitchen', 'study')


def tab3(use, cls, day, night, lmax, second, gallery):
    if use not in PROTECTED:
        return None, None
    bed = use == 'bedroom'
    cand = [DAY_MIN[cls]]
    if day is not None:
        cand.append(day - DAY_OFF[cls] + (3 if second and day >= 62 else 0))
    if bed and night is not None:
        cand.append(night - NIGHT_OFF[cls] + (3 if second and night >= 56 else 0))
    if bed and lmax is not None and lmax >= 70:
        cand.append(34)
    return max(cand), (GALLERY[cls] if gallery else None)


# ---------- Annex B / C / D ----------
B3 = {1: (60, 55), 2: (65, 60), 3: (70, 65), 4: (77, 72)}
# Figures C.1-C.10: rows alpha 0, 15, 30, 45; columns a, b, c (rendered p. 32-33)
FIGS = {
    'one': [(-3, -13, -3), (-2, -10, -3), (-1, -7, -4), (0, -4, -4)],
    'side_minor': [(-3, -7, -1), (-2, -7, -2), (-1, -5, -2), (0, -4, -3)],
    'corner': [(-4, -4, 0), (-3, -4, 0), (-2, -4, -1), (-1, -4, -1)],
    'back_minor': [(-2, -4, -2), (-1, -4, -2), (0, -3, -2), (0, -2, -2)],
    'opposite': [(0, 0, 0)] * 4,
}


def horiz(fig, pane, alpha):
    if pane == 'front':
        return 0.0
    col = 'abc'.index(pane)
    a = min(45.0, max(0.0, alpha))
    xs = [0, 15, 30, 45]
    ys = [row[col] for row in FIGS[fig]]
    for i in range(3):
        if xs[i] <= a <= xs[i + 1]:
            return ys[i] + (a - xs[i]) / 15 * (ys[i + 1] - ys[i])


def vert(v, beta, l):
    if v == 'none':
        return 0
    if v == 'roof':
        for lim, val in ((15, -3), (30, -5), (45, -8), (90, -10)):
            if beta <= lim:
                return val
        return -15
    if v == 'above':
        return 1
    if v == 'balc15':
        return 0 if l <= 2.5 else -2
    if v == 'balc16':
        return 1 if l <= 2.5 else -1


def outdoor(o):
    m = o['method']
    if m == 'direct':
        return {'ok': True, 'LAday': o.get('LAday'), 'LAnight': o.get('LAnight')}
    if m == 'map':
        rail = o.get('src') == 'rail'
        if o.get('mapKind') == 'lday':
            d = o['Lday'] + 1 + 3
        else:
            d = o['Lden'] + (-5 if rail else -1) + 3
        n = o['Lnight'] + 5 + 3 if o.get('Lnight') is not None else None
        return {'ok': True, 'LAday': d, 'LAnight': n}
    if m == 'typology':
        if o['cls1'] not in B3:
            return {'ok': False}
        d, n = B3[o['cls1']]
        c2 = o.get('cls2') or 0
        if c2 in B3:
            add = {0: 2, 1: 1}.get(abs(o['cls1'] - c2), 0)
            d, n = max(d, B3[c2][0]) + add, max(n, B3[c2][1]) + add
    elif m == 'site_new':
        d = o['mDay'] + 3
        n = o['mNight'] + 3 if o.get('mNight') is not None else None
    else:
        d, n = o['mDay'], o.get('mNight')
    c = horiz(o.get('fig', 'one'), o.get('pane', 'front'), o.get('alpha', 0)) + vert(o.get('vert', 'none'), o.get('beta', 0), o.get('l', 0))
    return {'ok': True, 'LAday': d + c, 'LAnight': None if n is None else n + c}


# ---------- EN ISO 12354-3 Annex C Table C.1 (rendered p. 17): rows <1,5 / 1,5-2,5 / >2,5 m; cols aw <=0,3 / 0,6 / >=0,9 ----------
X = None
C1 = {
    'plane': ((0, 0, 0), (0, 0, 0), (0, 0, 0)),
    'gallery2': ((-1, -1, 0), (X, X, X), (X, X, X)),
    'gallery3': ((-1, -1, 0), (-1, 0, 2), (1, 1, 2)),
    'gallery4': ((0, 0, 1), (0, 1, 3), (2, 2, 3)),
    'gallery5': ((X, X, X), (X, X, X), (3, 4, 6)),
    'balcony6': ((-1, -1, 0), (-1, 1, 3), (1, 2, 3)),
    'balcony7': ((0, 0, 1), (0, 2, 4), (2, 3, 4)),
    'balcony8': ((1, 1, 2), (1, 1, 2), (1, 1, 2)),
    'terrace_open': ((1, 1, 1), (3, 4, 5), (4, 4, 5)),
    'terrace_closed': ((3, 3, 3), (5, 6, 7), (6, 6, 7)),
}


def dlfs(shape, los, aw):
    row = C1[shape][('low', 'mid', 'high').index(los)]
    a = min(0.9, max(0.3, aw))
    if a <= 0.6:
        y0, y1, f = row[0], row[1], (a - 0.3) / 0.3
    else:
        y0, y1, f = row[1], row[2], (a - 0.6) / 0.3
    if y0 is None or y1 is None:
        return None
    return y0 + f * (y1 - y0)


# ---------- prediction ----------
def facade(inp):
    V = inp.get('V_m3')
    if not V or V <= 0:
        return {'ok': False, 'reason': 'volume'}
    els = [e for e in inp.get('elements', []) if e.get('on', True)]
    if not els:
        return {'ok': False, 'reason': 'no_elements'}
    area = sum(e['S_m2'] for e in els if not e.get('small'))
    if area <= 0:
        return {'ok': False, 'reason': 'no_area'}
    S = inp.get('S_m2') or area
    taus, tausA, allA, nvent = [], [], True, 0
    for e in els:
        if e.get('small'):
            n = e.get('n', 1)
            nvent += n
            taus.append(n * A0 / S * 10 ** (-e['DneAtr'] / 10))
            if e.get('DneA') is not None:
                tausA.append(n * A0 / S * 10 ** (-e['DneA'] / 10))
            else:
                allA = False
        else:
            taus.append(e['S_m2'] / S * 10 ** (-e['RAtr'] / 10))
            if e.get('RA') is not None:
                tausA.append(e['S_m2'] / S * 10 ** (-e['RA'] / 10))
            else:
                allA = False
    sh = inp.get('shape') or {'mode': 'table', 'shape': 'plane', 'los': 'high'}
    if sh['mode'] == 'value':
        dl = sh['value']
    else:
        dl = dlfs(sh['shape'], sh['los'], sh.get('alpha', 0.3))
        if dl is None:
            return {'ok': False, 'reason': 'shape_na'}
    tot = sum(taus)
    R = -10 * lg(tot)
    term = 10 * lg(CSAB * V / (T0 * S))
    out = {'ok': True, 'R': R, 'DAtr': R + dl + term, 'dLfs': dl}
    out['D2mA'] = (-10 * lg(sum(tausA)) + dl + term) if inp.get('gallery') and allA else None
    k = max(range(len(taus)), key=lambda i: taus[i])
    out['weakest'] = els[k]['id']
    out['share'] = taus[k] / tot
    tg = inp.get('target') or {}
    if tg.get('DAtr_min') is not None:
        dmin, amin = tg['DAtr_min'], tg.get('D2mA_min')
    elif inp.get('req'):
        q = inp['req']
        dmin, amin = tab3(q['use'], q['cls'], q.get('LAday'), q.get('LAnight'), q.get('LAmax3xNight'), q.get('secondPane'), q.get('gallery'))
    else:
        dmin, amin = None, None
    out['DAtrMin'], out['D2mAMin'] = dmin, amin
    if dmin is not None:
        out['pass_DAtr'] = out['DAtr'] >= dmin - 1e-9
        snet = sum(e['S_m2'] for e in els if not e.get('small') and e['RAtr'] < 48)
        rmin = dmin + 3 + 10 * lg(3 * (snet + 5 * nvent) / V)
        out['RAtrMin'], out['DneAtrMin'] = rmin, rmin + 3
        out['annex'] = [(e['DneAtr'] >= rmin + 3 - 1e-9) if e.get('small') else (e['RAtr'] >= rmin - 1e-9) for e in els]
    if amin is not None:
        out['pass_D2mA'] = None if out['D2mA'] is None else out['D2mA'] >= amin - 1e-9
    return out


# ---------- cases ----------
cases = []


def W(S, R, i='W', RA=None):
    d = {'id': i, 'kind': 'wall', 'S_m2': S, 'RAtr': R}
    if RA is not None:
        d['RA'] = RA
    return d


def G(S, R, i='G', RA=None):
    d = {'id': i, 'kind': 'window', 'S_m2': S, 'RAtr': R}
    if RA is not None:
        d['RA'] = RA
    return d


def Vn(D, n=1, i='V', DA=None):
    d = {'id': i, 'kind': 'vent', 'small': True, 'n': n, 'DneAtr': D}
    if DA is not None:
        d['DneA'] = DA
    return d


def P(inp):
    return {'fn': 'calc', 'input': inp, 'expect': facade(inp)}


def O(o):
    return {'fn': 'outdoor', 'input': o, 'expect': outdoor(o)}


# 1 Annex G.1 worked example (anchor) + the Rw route of the same example
g1 = {'V_m3': 50, 'S_m2': 11.3, 'gallery': True, 'elements': [W(6, 51, '1', 55), G(4.5, 29, '2', 32), G(0.5, 30, '3', 31), Vn(29, 1, '4', 31)]}
cases.append({'id': 'g1_anchor', 'note': 'EN ISO 12354-3 Annex G.1 (Tables G.1-G.2): printed R′Atr 27,8 dB, D2m,nT,Atr 29,3 dB', 'points': [P(g1)], 'anchor': {'R': 27.8, 'DAtr': 29.3, 'tol': 0.05}})
cases.append({'id': 'g1_rw_route', 'note': 'G.1 with Rw / Dn,e,w: printed R′w 31, D2m,nT,w 33 (rounded)', 'points': [P({'V_m3': 50, 'S_m2': 11.3, 'elements': [W(6, 57, '1'), G(4.5, 33, '2'), G(0.5, 32, '3'), Vn(32, 1, '4')]})],
              'anchor': {'R': 31, 'DAtr': 33, 'tol': 0.5}})

# 2 presets (also through the page)
def bed4(c):
    o = outdoor({'method': 'typology', 'cls1': c, 'cls2': 0, 'fig': 'one', 'pane': 'front', 'alpha': 0, 'vert': 'none'})
    return {'V_m3': 40, 'elements': [W(7.5, 55, 'E1'), G(2.5, 45, 'E2'), Vn(32, 1, 'E3')], 'gallery': False, 'shape': {'mode': 'table', 'shape': 'plane', 'los': 'high', 'alpha': 0.3},
            'req': {'use': 'bedroom', 'cls': 'C', 'LAday': o['LAday'], 'LAnight': o['LAnight'], 'LAmax3xNight': None, 'secondPane': False, 'gallery': False}}


def liv(LA, shape=None, vent=38):
    return {'V_m3': 30, 'elements': [W(6, 52, 'E1'), G(4, 33, 'E2'), Vn(vent, 1, 'E3')], 'gallery': False, 'shape': shape or {'mode': 'table', 'shape': 'plane', 'los': 'high', 'alpha': 0.3},
            'req': {'use': 'living', 'cls': 'C', 'LAday': LA, 'LAnight': None, 'LAmax3xNight': None, 'secondPane': False, 'gallery': False}}


rail = {'V_m3': 40, 'elements': [W(7.5, 55, 'E1'), G(2.5, 45, 'E2'), Vn(38, 1, 'E3')], 'gallery': False, 'shape': {'mode': 'table', 'shape': 'plane', 'los': 'high', 'alpha': 0.3},
        'req': {'use': 'bedroom', 'cls': 'C', 'LAday': 60, 'LAnight': 55, 'LAmax3xNight': 75, 'secondPane': False, 'gallery': False}}
g1p = {'V_m3': 50, 'S_m2': 11.3, 'elements': [W(6, 51, 'E1'), G(4.5, 29, 'E2'), G(0.5, 30, 'E3'), Vn(29, 1, 'E4')], 'gallery': False, 'shape': {'mode': 'table', 'shape': 'plane', 'los': 'high', 'alpha': 0.3},
       'req': {'use': 'living', 'cls': 'C', 'LAday': 60, 'LAnight': None, 'LAmax3xNight': None, 'secondPane': False, 'gallery': False}}
for pid, inp in [('vent', bed4(4)), ('quiet', bed4(1)), ('quick', liv(65)), ('balcony', liv(70, {'mode': 'table', 'shape': 'balcony6', 'los': 'high', 'alpha': 0.9})),
                 ('map', liv(outdoor({'method': 'map', 'src': 'road', 'mapKind': 'lden', 'Lden': 68})['LAday'])), ('rail', rail), ('g1', g1p)]:
    cases.append({'id': 'preset_' + pid, 'note': 'page preset ' + pid, 'preset': pid, 'points': [P(inp)]})

# 3 grid: requirement x prediction (classes, uses, levels, notes a / c, room volume, element sets)
SETS = {
    'heavy': [W(8, 55, 'wall'), G(3, 36, 'win'), Vn(40, 1, 'vent')],
    'standard': [W(7, 50, 'wall'), G(4, 30, 'win'), Vn(33, 2, 'vent')],
    'glassy': [W(3, 52, 'wall'), G(9, 34, 'win'), {'id': 'box', 'kind': 'shutter_box', 'small': True, 'n': 1, 'DneAtr': 42}],
    'novent': [W(6, 48, 'wall'), G(5, 38, 'win'), {'id': 'door', 'kind': 'door', 'S_m2': 2, 'RAtr': 32}],
}
for sname, els in SETS.items():
    for cls in 'ABC':
        pts = []
        for use in PROTECTED:
            for V in (25, 45, 90):
                for day, night, lmax, second in ((55, 47, None, False), (63, 57, None, True), (72, 66, 74, False), (78, 70, None, True)):
                    pts.append(P({'V_m3': V, 'elements': els, 'req': {'use': use, 'cls': cls, 'LAday': day, 'LAnight': night, 'LAmax3xNight': lmax, 'secondPane': second, 'gallery': False}}))
        cases.append({'id': 'grid_%s_%s' % (sname, cls), 'note': 'Tab. 3 x Formula (1)/(4) x Annex A: element set %s, class %s, 4 uses x 3 volumes x 4 exposures' % (sname, cls), 'points': pts})
# note a thresholds exactly at 62 / 56 and just below
pts = [P({'V_m3': 40, 'elements': SETS['standard'], 'req': {'use': 'bedroom', 'cls': c, 'LAday': d, 'LAnight': n, 'LAmax3xNight': lm, 'secondPane': True, 'gallery': False}})
       for c in 'AC' for d, n, lm in ((62, 56, None), (61.9, 55.9, None), (62, 40, 69.9), (50, 56, 70))]
cases.append({'id': 'note_a_c_boundaries', 'note': 'Tab. 3 note a at LA,day 62 / LA,night 56 and note c at LAmax 70', 'points': pts})
# non-protected rooms and target override
cases.append({'id': 'not_protected_and_target', 'note': 'no Tab. 3 requirement for other rooms; a target from the project overrides', 'points': [
    P({'V_m3': 30, 'elements': SETS['standard'], 'req': {'use': 'bath', 'cls': 'A', 'LAday': 70, 'LAnight': 60}}),
    P({'V_m3': 30, 'elements': SETS['standard'], 'target': {'DAtr_min': 38}}),
    P({'V_m3': 30, 'elements': SETS['standard'], 'target': {'DAtr_min': 30, 'D2mA_min': 33}, 'gallery': True})]})
# galleries D2m,A with RA values
gal = [W(6, 50, 'wall', 54), G(3, 31, 'win', 34), Vn(36, 1, 'vent', 39)]
cases.append({'id': 'gallery_D2mA', 'note': 'galleries: D2m,A from Rw + C, Tab. 3 44 / 40, not determinable without RA', 'points': [
    P({'V_m3': V, 'elements': els, 'gallery': True, 'req': {'use': u, 'cls': c, 'LAday': 60, 'LAnight': 50, 'gallery': True}})
    for V in (30, 60) for c in 'AC' for u in ('bedroom', 'living') for els in (gal, SETS['standard'])]})
# façade area S different from the element sum, many small elements, metres of slot vents
cases.append({'id': 'area_and_small', 'note': 'S given ≠ Σ Si (Formula (7)/(8) with S), n pieces / metres of small elements', 'points': [
    P({'V_m3': V, 'S_m2': S, 'elements': [W(6, 53, 'w'), G(3.5, 35, 'g'), Vn(D, n, 'v')], 'req': {'use': 'bedroom', 'cls': 'B', 'LAday': 66, 'LAnight': 59}})
    for V in (20, 55) for S in (9.5, 12) for D, n in ((30, 1), (44, 3), (36, 2.4))]})
# 4 façade shape (Table C.1), every shape x line of sight x alpha
for shape in C1:
    pts = []
    for los in ('low', 'mid', 'high'):
        for aw in (0.3, 0.45, 0.6, 0.75, 0.9):
            pts.append(P({'V_m3': 35, 'elements': SETS['heavy'], 'shape': {'mode': 'table', 'shape': shape, 'los': los, 'alpha': aw}, 'req': {'use': 'living', 'cls': 'B', 'LAday': 68}}))
    cases.append({'id': 'shape_' + shape, 'note': 'Table C.1 ' + shape + ' x 3 line-of-sight heights x αw 0,3–0,9 (interpolated)', 'points': pts})
cases.append({'id': 'shape_value', 'note': 'typed ΔLfs', 'points': [P({'V_m3': 35, 'elements': SETS['heavy'], 'shape': {'mode': 'value', 'value': v}}) for v in (-2, 0, 1.5, 4)]})
# 5 outdoor level: Annex B / C / D
pts = []
for c1 in (1, 2, 3, 4):
    for c2 in (0, 1, 2, 3, 4):
        pts.append(O({'method': 'typology', 'cls1': c1, 'cls2': c2, 'fig': 'one', 'pane': 'front', 'alpha': 0}))
cases.append({'id': 'annexB_typology', 'note': 'Annex B.3 classes 1–4 and the two-road correction', 'points': pts})
for fig in FIGS:
    pts = [O({'method': 'site_existing', 'mDay': 66, 'mNight': 58, 'fig': fig, 'pane': pane, 'alpha': al}) for pane in ('front', 'a', 'b', 'c') for al in (0, 10, 15, 30, 37.5, 45)]
    cases.append({'id': 'annexC_' + fig, 'note': 'Annex C.3 figures (%s): 4 panes x α 0–45° (interpolated)' % fig, 'points': pts})
pts = [O({'method': 'site_new', 'mDay': 61, 'mNight': 52, 'fig': 'one', 'pane': 'front', 'alpha': 0, 'vert': v, 'beta': b, 'l': l})
       for v, b, l in (('none', 0, 0), ('roof', 10, 0), ('roof', 15, 0), ('roof', 20, 0), ('roof', 45, 0), ('roof', 60, 0), ('roof', 120, 0), ('above', 0, 0),
                       ('balc15', 0, 2), ('balc15', 0, 3), ('balc16', 0, 2.4), ('balc16', 0, 2.5))]
cases.append({'id': 'annexC_vertical', 'note': 'Annex B.1 (+ 3 dB) and Figures C.12 / C.14 / C.15 / C.16', 'points': pts})
pts = [O({'method': 'map', 'src': s, 'mapKind': k, 'Lden': 66, 'Lday': 64, 'Lnight': ln}) for s in ('road', 'rail', 'air') for k in ('lden', 'lday') for ln in (55, None)]
cases.append({'id': 'annexD_maps', 'note': 'Annex D.4–D.6 noise-map conversions', 'points': pts})
# 6 refusals
cases.append({'id': 'refusals', 'note': 'refused inputs', 'points': [
    P({'V_m3': 0, 'elements': SETS['heavy']}), P({'V_m3': 30, 'elements': []}), P({'V_m3': 30, 'elements': [Vn(30)]}),
    P({'V_m3': 30, 'elements': SETS['heavy'], 'shape': {'mode': 'table', 'shape': 'gallery5', 'los': 'mid', 'alpha': 0.6}}),
    O({'method': 'typology', 'cls1': 6, 'cls2': 0})]})

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'facadesound_ref.json')
json.dump(cases, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(cases), 'cases,', sum(len(c['points']) for c in cases), 'points ->', out)
