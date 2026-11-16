"""Independent reference for airbornesound.html (engine acu-air.js), written from the rendered pages of EN ISO 12354-1:2017
(not ported from the JS): §4.4.2 Formula (18)-(21), §4.4.3 b) (Kij mean over 1/3 octaves 250-1000 Hz), d)-e) Formula (22)/(23),
Annex B.4 (B.11)/(B.12), Annex D.2.1 (D.1)/(D.2) and D.2.2 Table D.1, Annex E.3.2-E.3.5, Annex L.1.4 Table L.10 (worked example, printed
results used as external anchor); EN ISO 717-1:2020 Table 3, Table 4 and Annex B (rating of 1/3-octave spectra of the separating element).
r3-fix (CR-6/CR-22/CR-26), written from Fig. E.7 / Formula (10) / Annex J (J.3) / E.3.4, not from the JS: in Fig. E.7 elements 1/3 are the
lightweight double-leaf wall and 2/4 the continuous homogeneous element, K24 (= 3,0 + 14,1 M + 5,7 M2, m2/m1 > 3) is the path along the
homogeneous element past the light wall -> a light separating wall (< 150 kg/m2) has Ff = K24, Fd / Df = K12; a heavy separating element
crossed by a light flanking leaf has Ff = K13 (min 10 dB). Formula (10) Dv,ij,situ >= 0 with a = S/l0 gives Kij >= 10 lg(lf l0 / sqrt(Si Sj)).
Shared reading with the engine (labelled on the page): flanking element areas Si = Sj taken = S of the separating element in that floor;
load on a flexible interlayer not given -> Cc 15; pass / fail decided on the value rounded to 0,1 dB as shown; C of the mass law = -1 dB up to 400 kg/m2, -2 dB above (B.4 says "-1 till -2");
the A-weighted run R'A uses the same lining dR; a wall on flexible interlayers = Ff crosses two joints, Fd / Df one; flanking element
continues through the junction (Annex E element 1-3), the separating element is the perpendicular one.
python -I bench-src/ref/gen_airbornesound.py  ->  bench-src/ref/airbornesound_ref.json"""
import json, math, os
from decimal import Decimal, ROUND_HALF_UP

lg = math.log10
A0, L0 = 10.0, 1.0

# ---------- EN ISO 717-1 (Table 3, Table 4, Annex B Table B.1) ----------
T = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150]
TX = [50, 63, 80] + T + [4000, 5000]
REF = dict(zip(T, [33, 36, 39, 42, 45, 48, 51, 52, 53, 54, 55, 56, 56, 56, 56, 56]))
SP1 = dict(zip(T, [-29, -26, -23, -21, -19, -17, -15, -13, -12, -11, -10, -9, -9, -9, -9, -9]))
SP2 = dict(zip(T, [-20, -20, -18, -16, -15, -14, -13, -12, -11, -9, -8, -9, -10, -11, -13, -15]))
SP1_50 = {**SP1, 50: -40, 63: -36, 80: -33}


def d1(x):
    return Decimal(repr(x)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)


def rint(x):
    return int(Decimal(repr(x)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def rate717(bands):
    b = dict(zip(TX if len(bands) == 21 else T, bands))
    X = {f: d1(b[f]) for f in T}
    shift = None
    for s in range(-200, 201):
        if sum(max(Decimal(0), REF[f] + s - X[f]) for f in T) <= 32:
            shift = s
    Rw = REF[500] + shift

    def term(sp):
        if not all(f in b for f in sp):
            return None
        return rint(-10 * lg(sum(10 ** ((sp[f] - float(d1(b[f]))) / 10) for f in sp))) - Rw
    return {'Rw': Rw, 'C': term(SP1), 'Ctr': term(SP2), 'C50': term(SP1_50)}


# ---------- element single numbers ----------
def element(e):
    if e['src'] == 'mass':
        m = e['m']
        if m <= 150:
            return None
        return {'m': m, 'Rw': 37.5 * lg(m) - 42, 'C': -1.0 if m <= 400 else -2.0, 'Ctr': min(-1.0, max(-7.0, 16 - 9 * lg(m))), 'C50': None}
    if e['src'] == 'bands':
        r = rate717(e['bands'])
        return {'m': e['m'], 'Rw': r['Rw'], 'C': r['C'], 'Ctr': r['Ctr'], 'C50': r['C50']}
    return {'m': e['m'], 'Rw': e['Rw'], 'C': e.get('C'), 'Ctr': e.get('Ctr'), 'C50': e.get('C50')}


# ---------- Annex D.2 ----------
CENTRES = [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300]


def lining_dR(spec, m1, Rw):
    if not spec or spec['type'] == 'none':
        return None
    if spec['type'] == 'lab':
        return spec['dR']
    s = 0.111 / spec['d'] if spec['type'] == 'studs' else spec['s']       # MN/m3; (D.2) cavity with porous filling
    f0 = math.sqrt(s * 1e6 * (1 / m1 + 1 / spec['m2'])) / (2 * math.pi)    # (D.1)/(D.2), SI units
    band = [c for c in CENTRES if f0 >= c / 2 ** (1 / 6)][-1]               # 1/3-octave band in which f0 falls
    band = max(band, 31.5)
    if band <= 160:
        return max(0.0, 74.4 - 20 * lg(band) - Rw / 2)                      # Table D.1 first row + NOTE 1
    return {200: -1, 250: -3, 315: -5, 400: -7, 500: -9}.get(band, -10 if band <= 1600 else -5)


def comb(a, b):  # Formula (22)/(23)
    if a is None:
        return 0.0 if b is None else b
    if b is None:
        return a
    hi, lo = max(a, b), min(a, b)
    return lo + hi / 2 if hi < 0 else hi + lo / 2


# ---------- Annex E.3 ----------
FAVG = [250, 315, 400, 500, 630, 800, 1000]


def K(junction, path, mF, mS, edge):
    M = lg(mS / mF)
    if junction in ('rigid_cross', 'flexible_cross'):
        k = 8.7 + 17.1 * M + 5.7 * M * M if path == 'Ff' else 8.7 + 5.7 * M * M          # E.3.2
    elif junction in ('rigid_T', 'flexible_T'):
        k = 5.7 + 14.1 * M + 5.7 * M * M if path == 'Ff' else 5.7 + 5.7 * M * M          # E.3.3
    if junction.startswith('flexible'):                                                   # E.3.4
        load = edge.get('load_kNm2')
        Cc = 15 if load is None else (20 if load < 80 else (15 if load <= 750 else 10))
        n = 2 if path == 'Ff' else 1
        return k + n * sum(max(5.0, Cc * lg(f / 110)) for f in FAVG) / len(FAVG)
    if junction == 'lightweight':                                                         # E.3.5 Fig. E.7, fk 500 Hz
        if path == 'Ff' and mS < 150:                                                     # K24 along the homogeneous element 2-4
            return 3.0 + 14.1 * M + 5.7 * M * M
        if path == 'Ff':                                                                  # K13 along the light flanking leaf 1-3
            return sum(max(10.0, 10 + 20 * M - 3.3 * lg(f / 500)) for f in FAVG) / len(FAVG)
        return sum(10 + 10 * abs(M) + 3.3 * lg(f / 500) for f in FAVG) / len(FAVG)
    return k


# ---------- Formula (18)-(21) ----------
def model(inp, which):
    Ss, sep = inp['S_m2'], element(inp['sep'])

    def v(e, w):
        if w == 'w':
            return e['Rw']
        c = e['C'] if w == 'A' else e['Ctr']
        return None if c is None else e['Rw'] + c
    Rs = v(sep, which)
    if Rs is None:
        return None
    dS = lining_dR(inp['sep'].get('liningS'), sep['m'], sep['Rw'])
    dR_ = lining_dR(inp['sep'].get('liningR'), sep['m'], sep['Rw'])
    paths = {'Dd': Rs + comb(dS, dR_)}
    for n, ed in enumerate(inp.get('edges', []), 1):
        if ed['junction'] == 'dnf':
            dn = ed['Dnf'] if which == 'w' else (ed['Dnf'] + ed['DnfC'] if which == 'A' else ed['Dnf'] + ed['DnfCtr'])
            paths['Ff%d' % n] = dn + 10 * lg(ed.get('llab', 4.5) / ed['lf'] * Ss / A0)
            continue
        el = element(ed)
        RF = v(el, which)
        if RF is None:
            return None
        dF = lining_dR(ed.get('liningF'), el['m'], el['Rw'])
        df = lining_dR(ed.get('liningf'), el['m'], el['Rw'])
        g = 10 * lg(Ss / (L0 * ed['lf']))
        kmin = 10 * lg(ed['lf'] * L0 / math.sqrt(Ss * Ss))                                # Formula (10), Si = Sj = Ss
        Kp = {q: max(kmin, K(ed['junction'], q, el['m'], sep['m'], ed)) for q in ('Ff', 'Fd', 'Df')}
        paths['Ff%d' % n] = RF + comb(dF, df) + Kp['Ff'] + g
        paths['Fd%d' % n] = RF / 2 + Rs / 2 + comb(dF, dR_) + Kp['Fd'] + g
        paths['Df%d' % n] = Rs / 2 + RF / 2 + comb(dS, df) + Kp['Df'] + g
    tau = sum(10 ** (-R / 10) for R in paths.values())
    for i, s in enumerate(inp.get('smalls', []), 1):
        d = s['Dne'] if which == 'w' else s['Dne'] + (s['C'] if which == 'A' else s['Ctr'])
        tau += s.get('n', 1) * A0 / Ss * 10 ** (-d / 10)
        paths['e%d' % i] = -10 * lg(s.get('n', 1) * A0 / Ss * 10 ** (-d / 10))
    return -10 * lg(tau), paths


def expect(inp):
    sep = element(inp['sep'])
    if sep is None or any(e['junction'] != 'dnf' and element(e) is None for e in inp.get('edges', [])):
        return {'ok': False}
    w, A, tr = model(inp, 'w'), model(inp, 'A'), model(inp, 'tr')
    corr = 10 * lg(0.32 * inp['V_m3'] / inp['S_m2'])
    paths = w[1]
    flank = {k: v for k, v in paths.items() if k != 'Dd'}
    dom = max(flank, key=lambda k: 10 ** (-flank[k] / 10)) if flank else 'Dd'
    out = {'ok': True, 'Rpw': w[0], 'DnTw': w[0] + corr, 'RpA': A[0] if A else None, 'DA': A[0] + corr if A else None,
           'DnTtr': tr[0] + corr if tr else None, 'RA50': sep['Rw'] + sep['C50'] if sep['C50'] is not None else None,
           'Rw_sep': sep['Rw'], 'dominant': dom, 'paths': paths}
    tg = inp.get('target') or {}
    if 'DA_min' in tg:
        out['pass_DA'] = None if out['DA'] is None else float(Decimal(repr(out['DA'])).quantize(Decimal('0.1'), ROUND_HALF_UP)) >= tg['DA_min']
    if 'RA50_min' in tg:
        out['pass_RA50'] = None if out['RA50'] is None else out['RA50'] >= tg['RA50_min']
    return out


def fl(j, m, lf, **kw):
    d = {'junction': j, 'm': m, 'src': 'mass', 'lf': lf}
    d.update(kw)
    return d


cases = []


def case(cid, note, inputs, anchor=None, preset=None):
    pts = [{'input': i, 'expect': expect(i)} for i in inputs]
    c = {'id': cid, 'note': note, 'points': pts}
    if anchor:
        c['anchor'] = anchor
    if preset:
        c['preset'] = preset
    cases.append(c)


# 1. EN ISO 12354-1 Annex L.1.4 (Table L.10) — external anchor: printed R'w 57,0 dB and printed path values
L14 = {'S_m2': 20, 'V_m3': 50, 'sep': {'src': 'mass', 'm': 484, 'liningS': {'type': 'lab', 'dR': 10.6}},
       'edges': [fl('rigid_T', 219, 4), fl('rigid_T', 219, 5), fl('rigid_cross', 360, 4), fl('rigid_cross', 360, 5)]}
case('L14', "EN ISO 12354-1 Annex L.1.4 simplified model (Table L.10): floor 484 kg/m2 + floating floor 10,6 dB, 2 external + 2 internal walls", [L14],
     anchor={'Rpw': 57.0, 'tol_Rpw': 0.5, 'paths': {'Dd': 69.3, 'Df1': 76.3, 'Df2': 75.3, 'Df3': 82.7, 'Df4': 81.7, 'Fd1': 65.7, 'Ff1': 64.0, 'Fd2': 64.7,
                                                    'Ff2': 63.0, 'Fd3': 72.1, 'Ff3': 71.9, 'Fd4': 71.1, 'Ff4': 70.9}, 'tol_paths': 0.15}, preset='l14')

# 2. presets (page path checked through the preset buttons)
P1 = {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'mass', 'm': 460}, 'edges': [fl('rigid_cross', 400, 4.6), fl('rigid_cross', 400, 4.6), fl('rigid_T', 180, 2.6), fl('rigid_cross', 180, 2.6)],
      'target': {'DA_min': 54, 'RA50_min': 51}}
case('P1', 'preset flank: 460 kg/m2 party wall, 180 kg/m2 flanking walls rigid', [P1], preset='flank')
P2 = json.loads(json.dumps(P1)); P2['edges'][2]['junction'] = 'flexible_T'; P2['edges'][3]['junction'] = 'flexible_cross'
case('P2', 'preset flex: the same, flanking walls on flexible interlayers', [P2], preset='flex')
P4 = json.loads(json.dumps(P1)); P4['V_m3'] = 25
case('P4', 'preset small room: V 25 m3', [P4], preset='small')
LIN50 = {'type': 'studs', 'm2': 10, 'd': 0.05}
BANDS = [17, 20, 25, 36, 40, 44, 48, 52, 55, 58, 60, 62, 64, 65, 66, 66, 64, 65, 68, 71, 73]
P8 = {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'bands', 'm': 50, 'bands': BANDS},
      'edges': [fl('lightweight', 480 if i < 2 else 300, 4.6 if i < 2 else 2.6, liningF=LIN50, liningf=LIN50) for i in range(4)], 'target': {'DA_min': 58, 'RA50_min': 55}}
case('P8', 'preset ra50: lightweight double wall rated from 1/3-octave bands 50-5000 Hz on masonry walls lined both sides, class B targets', [P8], preset='ra50')
P7 = {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'lab', 'm': 25, 'Rw': 53, 'C': -4, 'Ctr': -11},
      'edges': [{'junction': 'dnf', 'Dnf': 47, 'DnfC': -2, 'DnfCtr': -6, 'llab': 4.5, 'lf': 4.6}, fl('lightweight', 400, 4.6), fl('lightweight', 400, 2.6), fl('lightweight', 400, 2.6)]}
case('P7', 'preset ceiling: stud wall up to a continuous suspended ceiling (Dn,f,w 47 dB)', [P7], preset='ceiling')

# 3. grid: separating mass x junction type, points over flanking mass and room volume
for ms in (200, 300, 460, 600):
    for j in ('rigid_cross', 'rigid_T', 'flexible_cross', 'flexible_T'):
        pts = []
        for mf in (160, 250, 400):
            for V in (30, 60):
                pts.append({'S_m2': 11, 'V_m3': V, 'sep': {'src': 'mass', 'm': ms},
                            'edges': [fl('rigid_cross', 380, 4.2), fl('rigid_cross', 380, 4.2), fl(j, mf, 2.6), fl(j, mf, 2.6)]})
        case('G_%d_%s' % (ms, j), 'grid m′s %d kg/m2, walls %s' % (ms, j), pts)

# 4. linings (Formula (22)/(23), Annex D)
base = {'S_m2': 12, 'V_m3': 45, 'sep': {'src': 'mass', 'm': 250}, 'edges': [fl('rigid_T', 300, 4.5), fl('rigid_T', 300, 4.5), fl('rigid_cross', 200, 2.7), fl('rigid_cross', 200, 2.7)]}
lin = []
for sS in (None, {'type': 'lab', 'dR': 8}, {'type': 'direct', 'm2': 20, 's': 10}, {'type': 'studs', 'm2': 10, 'd': 0.05}):
    for sR in (None, {'type': 'studs', 'm2': 25, 'd': 0.1}, {'type': 'lab', 'dR': -3}):
        x = json.loads(json.dumps(base))
        if sS: x['sep']['liningS'] = sS
        if sR: x['sep']['liningR'] = sR
        lin.append(x)
case('LIN_sep', 'linings on the separating element, both sides (Table D.1, Formula (22))', lin)
lin2 = []
for lF in (None, {'type': 'lab', 'dR': 6}, {'type': 'studs', 'm2': 10, 'd': 0.05}, {'type': 'direct', 'm2': 15, 's': 30}):
    for lf_ in (None, {'type': 'studs', 'm2': 10, 'd': 0.07}, {'type': 'lab', 'dR': -4}):
        x = json.loads(json.dumps(base))
        for e in x['edges'][2:]:
            if lF: e['liningF'] = lF
            if lf_: e['liningf'] = lf_
        x['sep']['liningR'] = {'type': 'lab', 'dR': 5}
        lin2.append(x)
case('LIN_flank', 'linings on the flanking walls (Formula (23)) + a lining on the receiving side of the separating wall', lin2)
case('LIN_range', 'lining on a heavy element Rw > 60 (outside D.2.2 range, still computed) and resonance at 200-500 Hz',
     [dict(base, sep={'src': 'mass', 'm': 700, 'liningR': {'type': 'direct', 'm2': 8, 's': 200}}),
      dict(base, sep={'src': 'mass', 'm': 200, 'liningR': {'type': 'direct', 'm2': 10, 's': 100}}),
      dict(base, sep={'src': 'mass', 'm': 200, 'liningR': {'type': 'direct', 'm2': 5, 's': 400}})])

# 5. lab values, lightweight walls, Dn,f, small elements, flexible load classes
case('LAB', 'lab Rw (C; Ctr) for all elements', [
    {'S_m2': 10, 'V_m3': v, 'sep': {'src': 'lab', 'm': 300, 'Rw': 55, 'C': -1, 'Ctr': -5, 'C50': -3},
     'edges': [dict(fl('rigid_cross', mf, 3.5), src='lab', Rw=rw, C=-1, Ctr=-4) for mf, rw in ((250, 50), (250, 50), (150, 44), (120, 41))]} for v in (25, 40, 80)])
case('LIGHT', 'lightweight double wall (lab) on homogeneous flanking elements (E.3.5)', [
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'lab', 'm': m, 'Rw': rw, 'C': -3, 'Ctr': -9, 'C50': c50},
     'edges': [fl('lightweight', 420, 4.5), fl('lightweight', 420, 4.5), fl('lightweight', mf, 2.7), fl('lightweight', mf, 2.7)]}
    for m, rw, c50, mf in ((30, 52, -9, 200), (45, 58, -7, 300), (60, 63, -6, 160))])
BAND2 = [25, 28, 30, 33, 37, 41, 44, 47, 50, 52, 54, 56, 57, 58, 58, 58, 57, 57, 59, 62, 64]
case('BANDS', '1/3-octave spectra 50-5000 Hz and 100-3150 Hz of the separating element (EN ISO 717-1 + Annex B)', [
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'bands', 'm': 60, 'bands': BAND2}, 'edges': [fl('lightweight', 400, 4.5), fl('lightweight', 250, 2.7)]},
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'bands', 'm': 60, 'bands': BAND2[3:19]}, 'edges': [fl('lightweight', 400, 4.5), fl('lightweight', 250, 2.7)]},
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'bands', 'm': 200, 'bands': BANDS}, 'edges': [fl('rigid_T', 300, 4.5)]}])
case('DNF', 'lightweight flanking element through Dn,f,w (Formula (21)), lab length 4,5 / 2,5 m', [
    {'S_m2': s, 'V_m3': 50, 'sep': {'src': 'lab', 'm': 40, 'Rw': 56, 'C': -3, 'Ctr': -9},
     'edges': [{'junction': 'dnf', 'Dnf': dn, 'DnfC': -2, 'DnfCtr': -5, 'llab': ll, 'lf': lf}, fl('lightweight', 350, 4.0)]}
    for s, dn, ll, lf in ((10, 48, 4.5, 4.0), (14, 55, 4.5, 5.0), (8, 52, 2.5, 3.0))])
case('SMALL', 'small technical elements (transfer grille, vent) in Formula (18)', [
    {'S_m2': 12, 'V_m3': 40, 'sep': {'src': 'mass', 'm': 400}, 'edges': [fl('rigid_cross', 300, 4.5), fl('rigid_T', 220, 2.7)],
     'smalls': [{'Dne': d, 'C': -1, 'Ctr': -3, 'n': n}]} for d, n in ((45, 1), (55, 2), (65, 3))])
case('FLEXLOAD', 'flexible interlayers with load classes (E.3.4 Cc 20 / 15 / 10)', [
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'mass', 'm': 350}, 'edges': [fl('flexible_T', 200, 2.6, load_kNm2=ld), fl('flexible_cross', 200, 2.6, load_kNm2=ld)]}
    for ld in (50, 400, 900, None)])
for c in cases[-1:]:
    for pt in c['points']:
        if pt['input']['edges'][0].get('load_kNm2') is None:
            for e in pt['input']['edges']:
                e.pop('load_kNm2', None)
            pt['expect'] = expect(pt['input'])
# r3-fix: E.3.5 both geometries, Formula (10) floor, Kij over M -1..+1 (lab flanking elements so any mass is allowed), rounding at the limit
case('E35', 'E.3.5: light separating wall on continuous homogeneous flanking (Ff K24) and heavy separating element crossed by light leaves (Ff K13)', [
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'lab', 'm': ms, 'Rw': rw, 'C': -3, 'Ctr': -9},
     'edges': [dict(fl('lightweight', mf, lf), src='lab', Rw=rf, C=-1, Ctr=-5) for mf, rf, lf in edges]}
    for ms, rw, edges in ((30, 52, ((300, 50, 4.6), (150, 42, 2.6))), (60, 60, ((200, 47, 4.6), (600, 58, 2.6))), (100, 55, ((350, 52, 4.6),)),
                          (400, 56, ((40, 45, 4.6), (25, 40, 2.6))), (600, 60, ((60, 50, 4.6),)))])
case('KGRID', 'Kij grid over M = -1 ... +1 for rigid cross / T and the lightweight junction (separating 460 or 46 kg/m2)', [
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'lab', 'm': ms, 'Rw': 58 if ms > 150 else 50, 'C': -1, 'Ctr': -5},
     'edges': [dict(fl(j, round(ms / 10 ** M, 3), 4.0), src='lab', Rw=50, C=-1, Ctr=-5)]}
    for ms, j in ((460, 'rigid_cross'), (460, 'rigid_T'), (46, 'lightweight'), (460, 'lightweight')) for M in (-1, -0.5, 0, 0.5, 1)])
case('KMIN', 'Formula (10) in-situ floor of Kij (K24 below 10 lg(lf l0 / S)), small and large separating areas', [
    {'S_m2': s, 'V_m3': 50, 'sep': {'src': 'lab', 'm': 20, 'Rw': 50, 'C': -2, 'Ctr': -6}, 'edges': [fl('lightweight', 600, lf)]}
    for s, lf in ((12, 4), (6, 2.5), (30, 5), (12, 2.6))])
case('ROUND', 'DA at the limit: pass / fail on the value rounded to 0,1 dB', [
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'lab', 'm': 300, 'Rw': 54, 'C': c, 'Ctr': -5}, 'target': {'DA_min': 54}} for c in (-1.29, -1.31, -1.2)])
case('REFUSE', 'mass law below its range (B.11: m′ > 150 kg/m2) is refused, not extrapolated', [
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'mass', 'm': 140}},
    {'S_m2': 12, 'V_m3': 50, 'sep': {'src': 'mass', 'm': 300}, 'edges': [fl('rigid_T', 100, 3)]}])

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'airbornesound_ref.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(cases, f, indent=1)
print('cases', len(cases), 'points', sum(len(c['points']) for c in cases), '->', out)
