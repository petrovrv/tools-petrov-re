# Independent Python reference for vce_overpressure (r2, written by Claude, 23.10.2026; not a port of the JS).
# Blast-chart data = points digitized from the PUBLISHED charts (copied from _ogh/safety/r2src/curves_raw.py, which documents
# the pixel calibration); evaluated here directly on the raw points (log-log interpolation between digitized points, merge
# rules and 1/r' far-field decay as drawn on the charts), whereas the tool uses a table resampled on its own grid.
# Cases C1-C8: implementation check (tolerance 3 % = resampling of the digitized curves).
# Cases Y1-Y7: published worked example, TNO Yellow Book CPR 14E (2005) 5.6.2-5.6.3, Tables 5.6 and 5.7B (LPG terminal,
# propane, class 10 E = 221 GJ and class 3 E = 187 GJ, pa = 1e5 Pa, aa = 340 m/s); tolerance 10 % (the book reads r' and
# tp' off the charts to 1-2 digits).
# by overlay, see overlay_*.png). Sources:
#  ME_P : TNO Yellow Book CPR 14E, 3rd ed. 2nd rev. print 2005, ch. 5, Fig. 5.8A (scaled peak side-on overpressure),
#         image p.5.35 of PGS2-1997-v0.1-physical-effects.pdf (publicatiereeksgevaarlijkestoffen.nl). Calibration: decade
#         gridlines x 0.1/1/10/100 = px 124.5/390/658/925.5, y 10/1/0.1/0.01/0.001 = px 119/384/644.5/905/1172.5.
#  ME_T : same, Fig. 5.8C (scaled positive phase duration), x 0.1/1/10/100 = px 83.5/296.5/509.5/722.5, y 10/1/0.1 = 23.5/236.5/449.5.
#  BST_P: Baker-Strehlow-Tang curves (Tang & Baker 1999) as reproduced in DNV Phast 'Obstructed Region Explosion Model'
#         Theory (2026) Fig. 6 'Positive', x 0.1/1/10 = px 186/501/816, y 100..0.001 = px 113..538 (85 px/decade).
# Plateaus of ME curves 1-9 are the nominal source strengths (0.01 .. 5 bar). r0' = 0.245 (ME chart start line).
# Estimated reading uncertainty: ME P +-3 %, ME t +-5 %, BST P +-10 % (85 px/decade, dashed lines).
ME_P = {
 1: [(0.245,0.01),(0.55,0.01),(0.62,0.00987),(0.68,0.0095),(0.72,0.00906),(0.75,0.00883),(0.9,0.00737),(1,0.00664),(1.3,0.00515),(1.7,0.00396),(6.5,0.00102)],
 2: [(0.245,0.02),(0.55,0.02),(0.62,0.01993),(0.65,0.01966),(0.68,0.01915),(0.72,0.01857),(0.75,0.01808),(0.9,0.01508),(1,0.01357),(1.3,0.0105),(1.7,0.00817),(2,0.00688),(7,0.00198),(10,0.00138)],
 3: [(0.245,0.05),(0.55,0.0493),(0.62,0.04697),(0.65,0.04574),(0.72,0.04299),(0.75,0.04205),(0.8,0.03953),(0.9,0.03477),(1,0.03114),(1.3,0.02431),(1.5,0.0212),(1.7,0.01873),(2,0.01626),(3,0.01069),(10,0.003308),(30,0.001128)],
 4: [(0.245,0.1),(0.55,0.09825),(0.62,0.09359),(0.65,0.09154),(0.72,0.08758),(0.75,0.08529),(0.85,0.07705),(1.1,0.06123),(1.5,0.04474),(2,0.03357),(3,0.02196),(5,0.01315),(10,0.006475),(20,0.003266),(50,0.00134),(63,0.001)],
 5: [(0.245,0.2),(0.55,0.1966),(0.62,0.1848),(0.65,0.18),(0.68,0.17),(0.75,0.1556),(0.85,0.1381),(1.1,0.1069),(1.5,0.07842),(1.7,0.06838),(2,0.05884),(3,0.0391),(5,0.02326),(10,0.01142),(20,0.005789),(50,0.002365),(95,0.001245)],
 6: [(0.245,0.5),(0.45,0.5),(0.55,0.4823),(0.6,0.4697),(0.65,0.4434),(0.7,0.4318),(0.75,0.4077),(0.8,0.40),(0.85,0.385),(0.9,0.3603),(1,0.324),(1.1,0.2979),(1.2,0.2727),(1.3,0.2507),(1.5,0.2158),(1.7,0.1776),(2,0.1502),(3,0.0868),(4,0.06571)],
 7: [(0.245,1.0),(0.4,1.0),(0.45,0.9825),(0.5,0.9442),(0.55,0.9154),(0.6,0.8491),(0.62,0.816),(0.65,0.7912),(0.68,0.747),(0.7,0.7242),(0.72,0.7084),(0.75,0.6748),(0.8,0.6343),(0.85,0.591),(0.9,0.5176),(1,0.478)],
 8: [(0.245,2.0),(0.4,1.987),(0.45,1.894),(0.5,1.798),(0.6,1.403)],
 9: [(0.245,5.0),(0.33,4.95),(0.38,4.6)],
 10:[(0.245,14.0),(0.25,12.73),(0.27,10.04),(0.3,8.627),(0.4,3.912),(0.45,2.862),(0.5,2.12),(0.55,1.714),(0.6,1.403),(0.65,1.185),(0.7,0.9738),(0.8,0.7437),(0.9,0.5755),(1,0.478),(1.2,0.3524),(1.5,0.2464),(2,0.1591),(2.5,0.1152),(3,0.09359),(4,0.06571),(5,0.05019),(7,0.03447),(10,0.02295),(15,0.01462),(20,0.01064),(30,0.006789),(50,0.003896),(70,0.002703),(95,0.001883)],
}
# far-field continuation: curves 1-5 fall as 1/r' (straight lines of slope -1 on the chart, checked at r' = 10..95);
# curves 6-9 merge with curve 10 (heavy line) at r' ~ 4 / 1 / 0.6 / 0.4.
ME_MERGE = {6: 4, 7: 1, 8: 0.6, 9: 0.38}
ME_T = {
 1: [(0.245,5.6),(0.27,5.548),(0.35,5.144),(0.4,4.926),(0.45,4.717),(0.55,4.67),(100,4.67)],
 2: [(0.245,3.62),(0.3,3.429),(0.35,3.284),(0.45,3.045),(0.5,2.948),(0.55,2.86),(100,2.86)],
 3: [(0.245,2.4),(0.27,2.349),(0.35,2.19),(0.4,2.086),(0.45,2.019),(0.5,1.955),(0.55,1.93),(100,1.93)],
 4: [(0.245,1.5),(0.27,1.476),(0.4,1.296),(0.45,1.255),(0.55,1.21),(3,1.21),(10,1.23),(100,1.23)],
 5: [(0.245,0.9),(0.27,0.8783),(0.4,0.755),(0.45,0.723),(0.55,0.6703),(0.7,0.656),(1.5,0.6703),(4,0.674),(30,0.6962),(100,0.70)],
 6: [(0.245,0.49),(0.27,0.4847),(0.3,0.4692),(0.35,0.4374),(0.4,0.4121),(0.45,0.3926),(0.5,0.3639),(0.55,0.3581),(0.6,0.3562),(0.7,0.3581),(0.8,0.3659),(1,0.3719),(1.2,0.3904),(1.5,0.4011),(2,0.4144),(3,0.4189),(4,0.4303),(5,0.4374)],
 7: [(0.245,0.385),(0.27,0.38),(0.3,0.3679),(0.35,0.3429),(0.4,0.3214),(0.45,0.3013),(0.5,0.2854),(0.55,0.2631),(0.6,0.2575),(0.8,0.2854),(1.2,0.332),(1.5,0.3448),(2.5,0.3926),(4,0.4033)],
 8: [(0.245,0.30),(0.27,0.2996),(0.3,0.2885),(0.35,0.2689),(0.4,0.2534),(0.45,0.2336),(0.5,0.225),(0.6,0.219),(0.7,0.2362),(0.8,0.2453),(1,0.2703),(1.2,0.2869),(1.5,0.3162),(3,0.3821)],
 9: [(0.245,0.235),(0.27,0.2349),(0.3,0.2324),(0.35,0.2274),(0.4,0.203),(0.45,0.1944),(0.5,0.1892),(0.6,0.1892),(0.7,0.203),(0.8,0.2225),(1,0.2466),(1.5,0.2916)],
 10:[(0.245,0.15),(0.25,0.1575),(0.27,0.1644),(0.3,0.1698),(0.35,0.1689),(0.4,0.1609),(0.45,0.1476),(0.5,0.146),(0.55,0.1508),(0.6,0.1575),(0.7,0.1773),(0.8,0.1955),(1,0.2274),(1.2,0.2603),(1.5,0.2916),(2,0.332),(2.5,0.36),(3,0.3821),(4,0.4033),(5,0.4211),(7,0.4421),(10,0.4667),(15,0.4873),(20,0.5034),(30,0.5228),(50,0.54),(70,0.5518),(95,0.5608)],
}
ME_T_MERGE = {6: 5, 7: 4, 8: 3, 9: 1.5}
# BST: curves for Mf >= 1.0 share one envelope beyond their knee; envelope digitized as 'bunch'.
BST_BUNCH = [(0.18,10.5),(0.2,8.5),(0.25,5.2),(0.3,3.078),(0.35,2.05),(0.4,1.461),(0.45,1.209),(0.5,0.96),(0.6,0.7225),(0.8,0.5291),(1,0.40),(1.2,0.3162),(1.5,0.2445),(2,0.1696),(2.5,0.1329),(3,0.1085),(4,0.07225),(10,0.0255)]
BST_P = {
 5.2: [(0.1,20.2),(0.15,20.8),(0.17,20.0),(0.18,10.5)],
 4.0: [(0.1,14.2),(0.15,14.8),(0.17,14.5),(0.19,9.6)],
 3.0: [(0.1,9.5),(0.15,9.9),(0.18,9.9),(0.2,8.5)],
 2.0: [(0.1,5.15),(0.15,5.51),(0.17,5.82),(0.21,5.9),(0.25,4.684),(0.3,3.078)],
 1.4: [(0.1,1.9),(0.3,1.9),(0.35,1.8),(0.45,1.209)],
 1.0: [(0.1,1.22),(0.3,1.21),(0.35,1.15),(0.41,1.0),(0.5,0.96)],
 0.7: [(0.1,0.657),(0.3,0.657),(0.33,0.65),(0.4,0.55),(0.57,0.42),(1,0.31),(1.5,0.2022),(2,0.1347),(2.5,0.1056),(4,0.06225),(10,0.0235)],
 0.35:[(0.1,0.2164),(0.31,0.2164),(0.35,0.2106),(0.4,0.1942),(0.5,0.1651),(0.6,0.1442),(0.8,0.1114),(1,0.093),(1.5,0.06141),(2,0.04559),(2.5,0.0372),(10,0.0098)],
 0.2: [(0.1,0.0666),(0.32,0.0675),(0.4,0.06058),(0.45,0.05585),(0.5,0.0522),(0.8,0.03477),(1,0.0284),(1.2,0.02316),(10,0.003)],
}


import json, math, os

def li(pts, x):
    if x <= pts[0][0]: return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            t = (math.log(x) - math.log(x0)) / (math.log(x1) - math.log(x0))
            return math.exp(math.log(y0) + t * (math.log(y1) - math.log(y0)))
    return None

def me_curve_p(s, r):
    if s in ME_MERGE and r >= ME_MERGE[s]: return me_curve_p(10, r)
    v = li(ME_P[s], r)
    if v is None:
        x, y = ME_P[s][-1]; v = y * x / r
    return v

def me_curve_t(s, r):
    if s in ME_T_MERGE and r >= ME_T_MERGE[s]: return me_curve_t(10, r)
    v = li(ME_T[s], r)
    return ME_T[s][-1][1] if v is None else v

def blend(f, s, r):
    lo, hi = int(math.floor(s)), int(math.ceil(s))
    a = f(lo, r)
    if lo == hi: return a
    return math.exp((1 - (s - lo)) * math.log(a) + (s - lo) * math.log(f(hi, r)))

def bst_curve(m, r):
    pts = BST_P[m]
    if m >= 1.0 and r >= pts[-1][0]:
        v = li(BST_BUNCH, r)
        if v is None:
            x, y = BST_BUNCH[-1]; v = y * x / r
        return v
    v = li(pts, r)
    if v is None:
        x, y = pts[-1]; v = y * x / r
    return v

MFS = sorted(BST_P)
def bst_ps(mf, r):
    mf = min(max(mf, MFS[0]), MFS[-1])
    for a, b in zip(MFS, MFS[1:]):
        if a <= mf <= b:
            ya = bst_curve(a, r)
            if mf == a: return ya
            w = (math.log(mf) - math.log(a)) / (math.log(b) - math.log(a))
            return math.exp((1 - w) * math.log(ya) + w * math.log(bst_curve(b, r)))

# Pierorazio et al. (2005) flame-speed table as reproduced in DNV Phast OREM theory (2026) Table 2; DDT -> 5.2; 1D -> DDT
_DDT = 5.2
_T2005 = {'2D':   {'high': (0.59, _DDT, _DDT), 'medium': (0.47, 0.66, 1.6), 'low': (0.079, 0.47, 0.66)},
          '2.5D': {'high': (0.47, _DDT, _DDT), 'medium': (0.29, 0.55, 1.0), 'low': (0.053, 0.35, 0.5)},
          '3D':   {'high': (0.36, _DDT, _DDT), 'medium': (0.11, 0.44, 0.5), 'low': (0.026, 0.23, 0.34)},
          '1D':   {r: (_DDT, _DDT, _DDT) for r in ('high', 'medium', 'low')}}
BST_MF = {c: {r: dict(zip(('low', 'medium', 'high'), v)) for r, v in rows.items()} for c, rows in _T2005.items()}
FUELS = {'methane': ('low', 3.2e6), 'propane': ('medium', 3.5e6), 'ethylene': ('high', 3.5e6), 'hydrogen': ('high', 3.2e6)}

def distance(f, ps, r0, r1):
    if ps > f(r0) or ps <= f(r1): return None
    n = 4001
    rs = [r0 * ((r1 / r0) ** (i / (n - 1))) for i in range(n)]
    idx = max(i for i, r in enumerate(rs) if f(r) >= ps)
    lo, hi = math.log(rs[idx]), math.log(rs[min(idx + 1, n - 1)])
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if f(math.exp(mid)) >= ps: lo = mid
        else: hi = mid
    return math.exp(lo)

def compute(inp):
    react, ev = FUELS[inp['fuel']]
    p0, s = inp['p0_Pa'], inp['strength']
    E = inp['V_m3'] * inp['fill'] * ev
    c0 = math.sqrt(1.4 * 287.05 * inp['T_K'])
    L = (E / p0) ** (1 / 3)
    r = inp['R_m'] / L
    mf = BST_MF[inp['conf']][react][inp['cong']]
    rme = max(r, 0.245)
    dP = blend(me_curve_p, s, rme) * p0
    tpos = blend(me_curve_t, s, rme) * L / c0
    out = dict(E_J=E, L_m=L, c0_m_s=c0, Mf=mf, me_dP_Pa=dP, me_tpos_s=tpos,
               me_impulse_Pa_s=0.5 * dP * tpos, bst_dP_Pa=bst_ps(mf, max(r, 0.1)) * p0)
    for i, t in enumerate(inp['thresholds_Pa']):
        d1 = distance(lambda x: blend(me_curve_p, s, max(x, 0.245)), t / p0, 0.2, 100.0)
        d2 = distance(lambda x: bst_ps(mf, x), t / p0, 0.1, 100.0)
        out['R_ME_%d' % i] = None if d1 is None else d1 * L
        out['R_BST_%d' % i] = None if d2 is None else d2 * L
    return out

DEF = dict(fuel='propane', V_m3=1000, fill=1, strength=7, conf='3D', cong='medium', R_m=100,
           p0_Pa=101325, T_K=288.15, thresholds_Pa=[3450, 6900, 13800, 20700, 34500])
CASES = [
    ('C1', 'base propane 3D medium', {}),
    ('C2', 'methane 2D low congestion', {'fuel': 'methane', 'conf': '2D', 'cong': 'low'}),
    ('C3', 'ethylene 1D high congestion', {'fuel': 'ethylene', 'conf': '1D', 'cong': 'high'}),
    ('C4', 'hydrogen 2.5D high, strength 10', {'fuel': 'hydrogen', 'conf': '2.5D', 'cong': 'high', 'strength': 10}),
    ('C5', 'fractional strength 5.5', {'strength': 5.5}),
    ('C6', 'half fill', {'fill': 0.5}),
    ('C7', 'near field R=20 m', {'R_m': 20}),
    ('C8', 'far field R=800 m, T=303.15 K', {'R_m': 800, 'T_K': 303.15}),
]
TOL_IMPL = 0.03
out = []
for cid, note, ov in CASES:
    inp = dict(DEF, **ov)
    out.append({'id': cid, 'note': note, 'tol': TOL_IMPL, 'inputs': inp, 'ref': compute(inp)})

# Published worked example (Yellow Book CPR 14E 2005, 5.6.2 Table 5.6 and 5.6.3 Table 5.7B):
# (id, class, E [J], r [m], Ps [kPa], tp [ms], is [Pa s])
YB = [('Y1', 10, 221e9, 92, 100, 68, 3403), ('Y2', 10, 221e9, 131, 50, 87, 2184), ('Y3', 10, 221e9, 229, 20, 122, 1210),
      ('Y4', 10, 221e9, 385, 10, 146, 730), ('Y5', 10, 221e9, 682, 5, 168, 419),
      ('Y6', 3, 187e9, 72, 5, 734, 1834), ('Y7', 3, 187e9, 136, 3, 734, 1100)]
T_AA = 340.0 ** 2 / (1.4 * 287.05)   # temperature giving the book's aa = 340 m/s
for cid, cls, E, R, ps, tp, imp in YB:
    inp = dict(DEF, V_m3=E / 3.5e6, strength=cls, R_m=R, p0_Pa=1e5, T_K=T_AA)
    out.append({'id': cid, 'note': 'Yellow Book CPR14E 2005 %s: class %d, E %.0f GJ, r %d m'
                % ('Table 5.6' if cls == 10 else 'Table 5.7B', cls, E / 1e9, R),
                'tol': 0.10, 'published': True, 'inputs': inp,
                'ref': {'me_dP_Pa': ps * 1e3, 'me_tpos_s': tp / 1e3, 'me_impulse_Pa_s': imp}})
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vce_overpressure_ref.json')
with open(path, 'w') as fh:
    json.dump(out, fh, indent=2)
print(len(out))
