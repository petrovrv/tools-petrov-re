"""Independent reference for impactsound.html (engine acu-impact.js), written from the rendered pages of EN ISO 12354-2:2017
(not ported from the JS): §4.1 Formula (3) (L'nT = L'n - 10 lg(0,16 V/(A0 T0)), T0 0,5 s), §4.3.2 Formula (15) direct, (16) flanking,
(18) room below / (19) rooms beside, §4.3.3 c) (half of dLd,w with a floor covering), Annex B.2 (B.5) Ln,eq,0,w = 164 - 35 lg m',
Annex C (C.2) f0 = 160 sqrt(s'/m'), (C.4) wet screed dLw = 13 lg m' - 14,2 lg s' + 20,8, (C.5) dry screed dLw = (-0,21 m' - 5,45) lg s' + 0,46 m' + 23,8,
Annex G.1.3 Table G.10 (worked example of the simplified model, printed results used as external anchor) and Table G.1 (detailed-model
spectrum, rated by EN ISO 717-2 as second anchor: printed L'n,w (CI; CI,50-2500) = 41 (2; 7) dB);
EN ISO 12354-1:2017 Annex B.4 (B.11) Rw = 37,5 lg m' - 42 and Annex E.3.2-E.3.4 Kij (M = lg(m'perp/m'i), flexible: + dl per joint, mean over
1/3 octaves 250-1000 Hz, Cc 20/15/10 by load, fl 110 Hz); EN ISO 717-2:2020 §4.2 Table 3 (reference curve), §4.3 (shift <= 32,0 dB),
Annex A.2.1 (CI over 100-2500 Hz, CI,50-2500 from 50 Hz), §5 Table 4 (Ln,r,0, dLw = 78 - Ln,r,w).
r3-fix (R3-REVIEW CR-8..CR-11, CR-32, CR-29) rules written from the clauses, not from the JS:
- EN ISO 12354-1 E.3.4 a)/b) + Figure E.5 / NOTE 4 (page 46-47 rendered): Kij = Kij,rigid + dl per joint CROSSED; the element 2-4 is continuous,
  1/3 stand on the interlayers. A path along the continuous element crosses no joint: NOTE 4 K24 = 3,7 + 14,1 M + 5,7 M2 (no dl; the printed
  bound of NOTE 4 is not legible and is not applied). A path from the continuous element into a cut one crosses one joint.
- E.3.4 Cc 20 / 15 / 10 by load < 80 / 80-750 / > 750 kN/m2, fl 110 Hz; unknown load -> Cc 15 (tool assumption la_imp_cc).
- EN ISO 12354-2 §4.3.3 e) (page 26): with a floor covering (here: a floating floor, dLw > 0) and a lining on the receiving side of a flanking
  element, half of dRw is used.
- Annex C.2 Figures C.1 (m' 60-160, s' 4-50) / C.2 (m' 15-60, s' 10-50): outside, dLw is an extrapolation -> verdict not determinable (None).
- verdicts compare the value rounded to 0,1 dB (as displayed).
Shared reading with the engine (labelled on the page, not independent): walls of the room below continue through the junction (corner path,
M = lg(m'floor/m'wall)); for rooms beside / diagonal the slab continues and a flexible wall stands on the interlayers (Fig. E.5 element 2-4 =
slab); a soft covering on a floating floor counts as the larger dLw (no addition); the Belgian value L'nT,w is computed without the soft
covering (NBN S 01-400-1 §6.1); a floating floor counts as the "floor covering" of §4.3.3 c) / e); the f0 > 100 Hz flag is a tool rule of thumb.
python -I bench-src/ref/gen_impactsound.py  ->  bench-src/ref/impactsound_ref.json"""
import json, math, os
from decimal import Decimal, ROUND_HALF_UP

lg = math.log10
FAVG = [250, 315, 400, 500, 630, 800, 1000]


# ---------- elements ----------
def Rw_mass(m):           # 12354-1 B.11, valid above 150 kg/m2
    return 37.5 * lg(m) - 42


def Ln0_mass(m):          # 12354-2 B.5
    return 164 - 35 * lg(m)


def float_dLw(f):
    t = (f or {}).get('type', 'none')
    if t == 'none':
        return 0.0, None, []
    if t == 'lab':
        return (f['dLw'], None, []) if f.get('dLw') is not None else (0.0, None, ['float_missing'])
    m, s = f.get('m'), f.get('s')
    if not m or not s:
        return 0.0, None, ['float_missing']
    f0 = 160 * math.sqrt(s / m)
    if t == 'wet':
        d, rng = 13 * lg(m) - 14.2 * lg(s) + 20.8, 60 <= m <= 160 and 4 <= s <= 50
    else:
        d, rng = (-0.21 * m - 5.45) * lg(s) + 0.46 * m + 23.8, 15 <= m <= 60 and 10 <= s <= 50
    w = ([] if rng else ['float_range']) + (['f0_high'] if f0 > 100 else [])
    return max(0.0, d), f0, w


CC = {'unknown': 15, 'light': 20, 'medium': 15, 'heavy': 10}


def r1(x):
    return math.floor(x * 10 + 0.5) / 10


def K(junction, path, m_cont, m_perp, joints, Cc=15):
    M = lg(m_perp / m_cont)
    cross = junction.endswith('cross')
    if junction.startswith('flexible') and path == 'straight':     # E.3.4 NOTE 4: along the continuous element, no joint crossed
        return 3.7 + 14.1 * M + 5.7 * M * M, M
    if path == 'straight':
        k = (8.7 + 17.1 * M + 5.7 * M * M) if cross else (5.7 + 14.1 * M + 5.7 * M * M)
    else:
        k = (8.7 + 5.7 * M * M) if cross else (5.7 + 5.7 * M * M)
    if junction.startswith('flexible'):
        k += joints * sum(max(5.0, Cc * lg(f / 110)) for f in FAVG) / len(FAVG)
    return k, M


def wall(e):
    if e.get('src') == 'lab':
        return e['Rw'] if e.get('Rw') is not None else None
    return Rw_mass(e['m']) if e['m'] > 150 else None


# ---------- §4.3 ----------
def expect(inp):
    S, V = inp.get('S_m2'), inp.get('V_m3')
    if not S or not V or S <= 0 or V <= 0:
        return {'ok': False}
    fl = inp['floor']
    if fl.get('src') == 'lab':
        if fl.get('Lneq0w') is None or fl.get('Rw') is None:
            return {'ok': False}
        Ln0, Rf = fl['Lneq0w'], fl['Rw']
    else:
        if fl['m'] <= 150:
            return {'ok': False}
        Ln0, Rf = Ln0_mass(fl['m']), Rw_mass(fl['m'])
    dLf, f0, warn = float_dLw(inp.get('float'))
    cover = inp.get('cover_dLw') or 0
    mode = inp.get('mode', 'below')
    dLd = (inp.get('ceiling_dLd') or 0) if mode == 'below' else 0
    Cc = CC.get(inp.get('flexLoad'), 15)
    rel = {}
    if mode == 'below':
        rel['Dd'] = ('direct', 0.0, 0)
        for n, e in enumerate(inp.get('edges', []), 1):
            if e.get('on') is False:
                continue
            Rj = wall(e)
            if Rj is None:
                return {'ok': False}
            flex = e['junction'].startswith('flexible')
            k, _ = K(e['junction'], 'corner', e['m'], fl['m'], 1 if flex else 0, Cc)
            rel['Df%d' % n] = ('flank', (Rf - Rj) / 2 - k - 10 * lg(S / e['lf']), e.get('dRj') or 0)
    else:
        j = inp['junction']
        if not j.get('lf'):
            return {'ok': False}
        Rj = wall(j)
        if Rj is None:
            return {'ok': False}
        flex = j['junction'].startswith('flexible')
        ks, _ = K(j['junction'], 'straight', fl['m'], j['m'], 0, Cc)
        kc, _ = K(j['junction'], 'corner', fl['m'], j['m'], 1 if flex else 0, Cc)
        g = 10 * lg(S / j['lf'])
        rel['Ff'] = ('flank', -ks - g, j.get('dRfloor') or 0)
        rel['Fd'] = ('flank', (Rf - Rj) / 2 - kc - g, j.get('dRwall') or 0)

    def run(dL):
        dd = dLd / 2 if (dLd and dL > 0) else dLd           # §4.3.3 c)
        # §4.3.3 e): half of dRw on flanking paths with a floor covering
        L = {k: Ln0 - dL + v - (dd if t == 'direct' else 0) - (dr / 2 if (dr > 0 and dL > 0) else dr) for k, (t, v, dr) in rel.items()}
        return 10 * lg(sum(10 ** (x / 10) for x in L.values())), L

    Lbe, Pbe = run(dLf)
    Lall, _ = run(max(dLf, cover))
    corr = 10 * lg(0.032 * V)
    out = {'ok': True, 'LnwBE': Lbe, 'LnTwBE': Lbe - corr, 'LnTw': Lall - corr, 'Lneq0w': Ln0, 'dLw': dLf, 'f0': f0,
           'paths': Pbe, 'dominant': max(Pbe, key=lambda k: Pbe[k]), 'warn_f0': 'f0_high' in warn}
    lab = inp.get('lab') or {}
    out['LI50'] = lab['Lnw'] + lab['CI50'] if lab.get('Lnw') is not None and lab.get('CI50') is not None else None
    tg = inp.get('target') or {}
    nd = 'float_range' in warn       # Annex C.2 figure ranges
    if tg.get('LnTw_max') is not None:
        out['pass_LnTw'] = None if nd else r1(out['LnTwBE']) <= tg['LnTw_max']
    if tg.get('LI50_max') is not None:
        out['pass_LI50'] = None if out['LI50'] is None else r1(out['LI50']) <= tg['LI50_max']
    return out


# ---------- EN ISO 717-2 ----------
T = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150]
TX = [50, 63, 80] + T + [4000, 5000]
REF = dict(zip(T, [62, 62, 62, 62, 62, 62, 61, 60, 59, 58, 57, 54, 51, 48, 45, 42]))          # Table 3
LNR0 = dict(zip(T, [67, 67.5, 68, 68.5, 69, 69.5, 70, 70.5, 71, 71.5, 72, 72, 72, 72, 72, 72]))  # Table 4


def d1(x):
    return Decimal(repr(x)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)


def rint(x):
    return int(Decimal(repr(x)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def rate7172(bands):
    b = dict(zip(TX if len(bands) == 21 else T, bands))
    X = {f: d1(b[f]) for f in T}
    shift = None
    for s in range(200, -201, -1):     # lowest curve with unfavourable sum <= 32,0
        if sum(max(Decimal(0), X[f] - (REF[f] + s)) for f in T) <= 32:
            shift = s
    Lw = REF[500] + shift
    lsum = 10 * lg(sum(10 ** (float(X[f]) / 10) for f in T if f <= 2500))
    out = {'Lw': Lw, 'CI': rint(lsum) - 15 - Lw, 'CI50': None}
    if len(bands) == 21:
        l50 = 10 * lg(sum(10 ** (float(d1(b[f])) / 10) for f in TX if 50 <= f <= 2500))
        out['CI50'] = rint(l50) - 15 - Lw
    return out


def dLw(dL):
    Lnr = [LNR0[f] - dL[i] for i, f in enumerate(T)]
    return 78 - rate7172(Lnr)['Lw']


cases = []


def case(cid, note, inputs, anchor=None, preset=None):
    c = {'id': cid, 'note': note, 'points': [{'input': i, 'expect': expect(i)} for i in inputs]}
    if anchor:
        c['anchor'] = anchor
    if preset:
        c['preset'] = preset
    cases.append(c)


def ed(j, m, lf, **kw):
    e = {'junction': j, 'm': m, 'src': 'mass', 'lf': lf}
    e.update(kw)
    return e


# 1. EN ISO 12354-2 Annex G.1.3 (Table G.10) — external anchor: printed L'n,w 39,7 dB and the five path values
G = {'mode': 'below', 'S_m2': 20, 'V_m3': 55, 'floor': {'src': 'mass', 'm': 484}, 'float': {'type': 'wet', 'm': 73.5, 's': 8},
     'edges': [ed('rigid_T', 219, 4), ed('rigid_T', 219, 5), ed('rigid_cross', 360, 4), ed('rigid_cross', 360, 5)]}
case('G13', 'EN ISO 12354-2 Annex G.1.3 simplified model (Table G.10): slab 484 kg/m2 + floating floor 73,5 kg/m2 on s′ 8, 2 external + 2 internal walls', [G],
     anchor={'Lnw': 39.7, 'tol_Lnw': 0.5, 'paths': {'Dd': 37.8, 'Df1': 30.9, 'Df2': 31.9, 'Df3': 24.4, 'Df4': 25.4}, 'tol_paths': 0.1}, preset='g13')

# 2. presets (page path checked through the preset buttons)
WALLS = [ed('rigid_T', 300, 4), ed('rigid_T', 300, 5), ed('rigid_cross', 300, 4), ed('rigid_cross', 300, 5)]
BARE = {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 460}, 'float': {'type': 'none'}, 'cover_dLw': 0, 'ceiling_dLd': 0,
        'edges': WALLS, 'target': {'LnTw_max': 52}}


def mod(base, **kw):
    x = json.loads(json.dumps(base))
    x.update(kw)
    return x


case('P_bare', 'preset bare: bare 20 cm slab, four 300 kg/m2 walls below', [BARE, mod(BARE, floor={'src': 'mass', 'm': 920})], preset='bare')
case('P_float', 'preset float: + 60 mm wet screed 120 kg/m2 on s′ 10', [mod(BARE, float={'type': 'wet', 'm': 120, 's': 10})], preset='float')
case('P_carpet', 'preset carpet: bare slab + soft covering dLw 25 (not counted for the Belgian check)', [mod(BARE, cover_dLw=25)], preset='carpet')
case('P_diag', 'preset diag: room diagonally below, flanking only (Formula (19))',
     [{'mode': 'diagonal', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 460}, 'float': {'type': 'none'}, 'cover_dLw': 0, 'ceiling_dLd': 0,
       'junction': {'junction': 'rigid_cross', 'src': 'mass', 'm': 300, 'lf': 5, 'dRwall': 0, 'dRfloor': 0}, 'target': {'LnTw_max': 52}}], preset='diag')
case('P_stiff', 'preset stiff: wet screed on s′ 50 (f0 > 100 Hz)', [mod(BARE, float={'type': 'wet', 'm': 120, 's': 50})], preset='stiff')

# 3. grid: slab mass x floating floor x walls x volume
FLOATS = [('none', {'type': 'none'}), ('wet120s10', {'type': 'wet', 'm': 120, 's': 10}), ('wet80s30', {'type': 'wet', 'm': 80, 's': 30}),
          ('dry40s20', {'type': 'dry', 'm': 40, 's': 20}), ('lab25', {'type': 'lab', 'dLw': 25})]
for m in (200, 300, 460, 600):
    for fid, ff in FLOATS:
        pts = []
        for wm, wj in ((180, 'rigid_T'), (300, 'rigid_cross'), (450, 'flexible_cross')):
            for V in (30, 75):
                pts.append({'mode': 'below', 'S_m2': 18, 'V_m3': V, 'floor': {'src': 'mass', 'm': m}, 'float': ff,
                            'edges': [ed(wj, wm, 4.5), ed('rigid_T', 250, 4), ed(wj, wm, 4.5), ed('flexible_T', 220, 4)], 'target': {'LnTw_max': 52}})
        case('G_%d_%s' % (m, fid), 'grid slab %d kg/m2, floating %s, walls 180-450 kg/m2 rigid / flexible, V 30 / 75 m3' % (m, fid), pts)

# 4. rooms beside / diagonal (Formula (19)) with linings in the receiving room
case('SIDE', 'rooms beside and diagonally below, rigid / flexible cross and T, linings dR', [
    {'mode': md, 'S_m2': 16, 'V_m3': 45, 'floor': {'src': 'mass', 'm': fm}, 'float': {'type': 'wet', 'm': 100, 's': 15} if fl else {'type': 'none'},
     'junction': {'junction': jj, 'src': 'mass', 'm': wm, 'lf': 4.2, 'dRwall': dr, 'dRfloor': dr}}
    for md in ('beside', 'diagonal') for fm in (350, 500) for jj, wm in (('rigid_cross', 250), ('rigid_T', 400), ('flexible_cross', 300), ('flexible_T', 200))
    for fl, dr in ((False, 0), (True, 5))])
# 5. lab values, ceiling lining, covering combinations, LI,50
case('LAB', 'lab floor and walls, ceiling lining (dLd halved with a covering), covering on a floating floor, LI,50 from lab values', [
    {'mode': 'below', 'S_m2': 15, 'V_m3': 40, 'floor': {'src': 'lab', 'm': 400, 'Lneq0w': 72, 'Rw': 56}, 'float': {'type': 'lab', 'dLw': 20}, 'ceiling_dLd': 8,
     'edges': [ed('rigid_cross', 250, 3.5, src='lab', Rw=48, dRj=4)]},
    {'mode': 'below', 'S_m2': 15, 'V_m3': 40, 'floor': {'src': 'lab', 'm': 400, 'Lneq0w': 72, 'Rw': 56}, 'ceiling_dLd': 8, 'edges': []},
    {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 400}, 'float': {'type': 'lab', 'dLw': 28}, 'cover_dLw': 20, 'edges': WALLS},
    {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 400}, 'float': {'type': 'lab', 'dLw': 18}, 'cover_dLw': 26, 'edges': WALLS,
     'target': {'LnTw_max': 52}},
    {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 400}, 'edges': [], 'lab': {'Lnw': 48, 'CI50': 5}, 'target': {'LI50_max': 52}},
    {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 400}, 'edges': [], 'target': {'LI50_max': 52, 'LnTw_max': 60}},
    {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 400}, 'edges': [ed('rigid_T', 100, 4, src='lab', Rw=40)]}])
case('REFUSE', 'lightweight floor or wall below 150 kg/m2 by the mass law, missing geometry / junction length / lab values are refused', [
    {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 120}, 'edges': []},
    {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 400}, 'edges': [ed('rigid_T', 100, 4)]},
    {'mode': 'below', 'S_m2': 0, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 400}},
    {'mode': 'beside', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 400}, 'junction': {'junction': 'rigid_T', 'm': 300}},
    {'mode': 'below', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'lab', 'm': 400}}])

# 5b. r3-fix cases written from the clauses (R3-REVIEW CR-8, CR-9, CR-10, CR-11, CR-32)
FX = {'mode': 'beside', 'S_m2': 20, 'V_m3': 50, 'floor': {'src': 'mass', 'm': 460}, 'float': {'type': 'none'},
      'junction': {'junction': 'flexible_cross', 'src': 'mass', 'm': 300, 'lf': 5, 'dRwall': 0, 'dRfloor': 0}, 'target': {'LnTw_max': 52}}
case('E34_JOINTS', 'EN ISO 12354-1 E.3.4 Fig. E.5 / NOTE 4: flexible wall on a continuous slab, rooms beside / diagonal — along the slab no joint (K24), into the wall one joint; slab 300-600, wall 150-450, cross / T',
     [mod(FX, mode=md, floor={'src': 'mass', 'm': fm}, junction={'junction': jj, 'src': 'mass', 'm': wm, 'lf': 5, 'dRwall': 0, 'dRfloor': 0})
      for md in ('beside', 'diagonal') for fm in (300, 460, 600) for wm in (160, 300, 450) for jj in ('flexible_cross', 'flexible_T')])
case('E34_LOAD', 'EN ISO 12354-1 E.3.4 Cc by load on the interlayer (unknown -> 15, < 80 -> 20, 80-750 -> 15, > 750 -> 10), room below and beside',
     [mod(m0, flexLoad=ld) for ld in ('unknown', 'light', 'medium', 'heavy') for m0 in (
         mod(BARE, edges=[ed('flexible_cross', 300, 4), ed('flexible_T', 250, 5), ed('rigid_cross', 300, 4), ed('rigid_T', 300, 5)]), FX)])
case('S433E', 'EN ISO 12354-2 §4.3.3 e): lining on the receiving side of a flanking element — half of dRw with a floor covering (floating floor), full without',
     [mod(FX, float=ff, junction={'junction': jj, 'src': 'mass', 'm': 300, 'lf': 5, 'dRwall': dw, 'dRfloor': df})
      for ff in ({'type': 'none'}, {'type': 'wet', 'm': 120, 's': 10}, {'type': 'lab', 'dLw': 22}) for jj in ('rigid_cross', 'flexible_T') for dw, df in ((10, 15), (6, 0), (0, 8))]
     + [mod(BARE, float=ff, edges=[ed('rigid_cross', 300, 4, dRj=8), ed('rigid_T', 300, 5, dRj=12), ed('rigid_cross', 300, 4), ed('rigid_T', 300, 5, dRj=4)], ceiling_dLd=6)
        for ff in ({'type': 'none'}, {'type': 'wet', 'm': 120, 's': 10})])
case('C2_RANGE', 'EN ISO 12354-2 Annex C.2 Fig. C.1 (m′ 60-160, s′ 4-50) / Fig. C.2 (m′ 15-60, s′ 10-50): inside the figure the verdict is given, outside it is not determinable; a lab dLw always decides',
     [mod(BARE, float={'type': t, 'm': m, 's': sv}) for t, m, sv in (('wet', 60, 4), ('wet', 160, 50), ('wet', 59, 10), ('wet', 161, 10), ('wet', 120, 3.9),
      ('wet', 120, 51), ('dry', 15, 10), ('dry', 60, 50), ('dry', 200, 10), ('dry', 80, 10), ('dry', 40, 9), ('wet', 120, 0.5))]
     + [mod(BARE, float={'type': 'lab', 'dLw': 45})])
L0 = expect(BARE)['LnTwBE']
case('ROUND', 'verdict on the displayed 0,1 dB value: limits just at, above and below the rounded L′nT,w',
     [mod(BARE, target={'LnTw_max': lim}) for lim in (math.floor(L0 * 10 + 0.5) / 10, math.floor(L0 * 10 + 0.5) / 10 - 0.1, math.floor(L0) , math.ceil(L0))])

# 6. EN ISO 717-2 through the shared core the page loads
G1 = [58.6, 57.0, 55.9, 54.0, 51.9, 49.6, 47.1, 44.3, 41.4, 38.6, 35.9, 33.3, 30.4, 27.8, 25.3, 22.7, 20.4, 18.2, 15.4, 12.5, 9.8]
rating = [{'kind': 'rate', 'bands': G1, 'expect': rate7172(G1)}]
for f0, k in ((46.2, 30), (70, 30), (100, 40)):
    dL = [round(k * lg(f / f0), 1) if f > f0 else 0.0 for f in T]
    rating.append({'kind': 'dLw', 'dL': dL, 'expect': {'dLw': dLw(dL)}})
cases.append({'id': 'R7172', 'note': 'EN ISO 717-2 rating of the Annex G.1 Table G.1 total spectrum (printed L′n,w (CI; CI,50-2500) = 41 (2; 7) dB) and dLw of three floating floors (C.1 / C.3 slopes) on the reference floor (§5 Table 4)',
              'rating': rating, 'points': [], 'anchor717': {'Lw': 41, 'CI': 2, 'CI50': 7}})

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'impactsound_ref.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(cases, f, indent=1)
print('cases', len(cases), 'points', sum(len(c['points']) + len(c.get('rating', [])) for c in cases), '->', out)
print('G13', round(cases[0]['points'][0]['expect']['LnwBE'], 2), 'R7172', rating[0]['expect'], [r['expect'] for r in rating[1:]])
