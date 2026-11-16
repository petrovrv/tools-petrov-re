# gen_windowclasses.py — independent reference for the windowclasses bench (tools.petrov.re, Glazing & Windows package).
# Written from the norm pages, not from glz-window.js / glazing-core.js:
#   NBN B 25-002-1:2019 §6.5.6 Tab. 2 (p. 31, rendered to PNG and re-typed here row by row as printed: class -> vb0 26/25/24/23 -> roughness),
#   §6.5.7 Tab. 3 + notes 1–4 (p. 32), §6.5.5 (1/225 by calculation), Annex C Fig. C.1 (deflection proportional to pressure),
#   §7.5.4 Tab. 13 / §7.5.5 Tab. 14 + notes (p. 54–55, curtain walls), §7.4.2/7.4.3 wK = 0,80·qp·cp, wU = 1,25·qp·cp,
#   §6.15.2 cases 1–3 and Tab. 11 (p. 48), §6.8.3.3 Method II with the reference indoor climates of Tab. 7 (p. 39) — the minimum fRsi is
#   recomputed here from (θi, θsi) of the table head, not copied from the table; ISO 10077-1:2006 §5.1 eq. (1), Annex E Tab. E.1 / E.2.
#   qp(ze) by EN 1991-1-4:2005 §4.3–4.5 (recommended terrain parameters, Table 4.1; the Belgian ANB:2010 is not available).
# Output: bench-src/ref/windowclasses_ref.json — list of cases {id, note, input (engine input), expect, anchor?}.
# Run: python -I bench-src/ref/gen_windowclasses.py
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
VB = [26, 25, 24, 23]
R = ['0', 'I', 'II', 'III', 'IV']

# ---- Tab. 2 as printed (rows 0, I, II, III, IV; columns vb0 26 25 24 23; '' = grey cell)
TAB2_TXT = {
    'W1': ['  ', '  ', '- - - 3', '- 6 8 9', '15 18 21 26'],
    'W2': ['  ', '  ', '- 3 4 6', '9 11 14 18', '23 28 36 44'],
    'W3': ['  ', '- 3 4 6', '5 6 8 12', '15 19 25 33', '39 48 60 79'],
    'W4': ['8 - - -', '12 17 26 40', '22 31 44 65', '55 75 100 100', '100 100 100 100'],
    'W5': ['42 - - -', '52 81 100 100', '80 100 100 100', '100 100 100 100', '100 100 100 100'],
    'W6': ['133 - - -', '133 133 133 133', '133 133 133 133', '133 133 133 133', '133 133 133 133'],
    'W7': ['167 - - -', '167 167 167 167', '167 167 167 167', '167 167 167 167', '167 167 167 167'],
    'W8': ['200 - - -', '200 200 200 200', '200 200 200 200', '200 200 200 200', '200 200 200 200'],
}
def cells(txt):
    t = txt.split()
    return [None if (x == '-' or x == '') else int(x) for x in (t + ['-'] * 4)[:4]]
TAB2 = {w: {r: cells(TAB2_TXT[w][i]) for i, r in enumerate(R)} for w in TAB2_TXT}

def w_class(ze, vb0, rough):
    j = VB.index(vb0)
    for k in range(1, 9):
        lim = TAB2['W%d' % k][rough][j]
        if lim is not None and ze <= lim:
            return k
    return None

# ---- Tab. 3 (window) and Tab. 14 (curtain wall)
AIR = {1: 3, 2: 3, 3: 3, 4: 3, 5: 4, 6: 4, 7: 4, 8: 4}
WATER = {1: '5A', 2: '6A', 3: '7A', 4: '8A', 5: '9A', 6: 'E750', 7: 'E900', 8: 'E1050'}
WIND = {1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 5}
P1 = {1: 400, 2: 800, 3: 1200, 4: 1600, 5: 2000}
ORDER = ['5A', '6A', '7A', '8A', '9A', 'E750', 'E900', 'E1050']
CW_AIR = {3: 'A3', 4: 'A3', 5: 'A4', 6: 'A4', 7: 'A4', 8: 'A4'}
CW_WATER = {3: 'R5', 4: 'R6', 5: 'R7', 6: 'RE750', 7: 'RE900', 8: 'RE1050'}
CW_ORDER = ['R5', 'R6', 'R7', 'RE750', 'RE900', 'RE1050']

# ---- EN 1991-1-4 qp
Z = {'0': (0.003, 1), 'I': (0.01, 1), 'II': (0.05, 2), 'III': (0.3, 5), 'IV': (1.0, 10)}
def qp(ze, vb, rough):
    z0, zmin = Z[rough]; z = max(ze, zmin)
    kr = 0.19 * (z0 / 0.05) ** 0.07
    vm = kr * math.log(z / z0) * vb
    Iv = 1.0 / math.log(z / z0)
    return (1 + 7 * Iv) * 0.5 * 1.25 * vm * vm

def window_expect(ze, vb, rough, aircon=False, rain='normal'):
    k = w_class(ze, vb, rough)
    air = 4 if (aircon and k <= 4) else AIR[k]
    water = WATER[k]
    if rain == 'unprotected' and k < 8:
        water = ORDER[ORDER.index(water) + 1]
    altB = None
    if rain in ('protected', 'narrow') and water[-1] == 'A' and int(water[:-1]) <= 7:
        altB = water[:-1] + 'B'
    n = WIND[k]; p = P1[n]
    eqB = max([i for i in P1 if P1[i] <= 1.5 * p] or [0]); eqA = max([i for i in P1 if P1[i] <= 2 * p] or [0])
    return {'W': 'W%d' % k, 'air': air, 'water': water, 'altB': altB, 'wind': 'C%d' % n, 'P1': p, 'P2': p / 2, 'P3': 1.5 * p,
            'eqB': 'B%d' % eqB, 'eqA': 'A%d' % eqA, 'qp': qp(ze, vb, rough), 'above100': ze > 100}

def cw_expect(ze, vb, rough, aircon=False, rain='normal', cp=1.0):
    # NBN B 25-002-1:2019 Tab. 13 (p. 54) starts at CW3 and repeats the Tab. 2 cells of W3–W8 (checked on the rendered page by r2-review, CR-24),
    # so CW = max(3, W of Tab. 2). This is the same shortcut as the engine, not an independent transcription of Tab. 13.
    k = max(3, w_class(ze, vb, rough))
    air = 'A4' if (aircon and k <= 4) else CW_AIR[k]
    water = CW_WATER[k]
    if rain == 'unprotected' and k < 8:
        water = CW_ORDER[CW_ORDER.index(water) + 1]
    q = qp(ze, vb, rough)
    return {'W': 'W%d' % w_class(ze, vb, rough), 'CW': 'CW%d' % k, 'air': air, 'water': water, 'wK': 0.8 * q * cp, 'wU': 1.25 * q * cp, 'qp': q}

cases = []
def site(ze, vb, r): return {'ze_m': ze, 'vb0': vb, 'roughness': r}

# 1. every height cell of Tab. 2: at the printed limit -> that class; 1 m above -> the next class with a cell (or above the table)
seen = set()
for w in TAB2:
    for r in R:
        for j, vb in enumerate(VB):
            lim = TAB2[w][r][j]
            if lim is None or (r, vb, lim) in seen:
                continue
            seen.add((r, vb, lim))
            for ze in (lim, lim + 1):
                if w_class(ze, vb, r) is None:
                    continue
                cases.append({'id': 'tab2-%s-%d-%d' % (r, vb, ze), 'note': 'Tab. 2 cell %s, roughness %s, vb0 %d: ze %d m' % (w, r, vb, ze),
                              'input': {'kind': 'window', 'site': site(ze, vb, r), 'use': 'normal'}, 'expect': {'window': window_expect(ze, vb, r)}})
# the norm's own example (§6.5.6): W4 — roughness I, ze 17 m, vb0 25 equals roughness II, ze 44 m, vb0 24
for (ze, vb, r) in ((17, 25, 'I'), (44, 24, 'II')):
    e = window_expect(ze, vb, r); assert e['W'] == 'W4'
    cases.append({'id': 'norm-example-W4-%s' % r, 'anchor': True, 'note': 'NBN B 25-002-1 §6.5.6 example: both sites are W4', 'input': {'kind': 'window', 'site': site(ze, vb, r)}, 'expect': {'window': e}})

# 2. notes 1–3 over a set of sites
for (ze, vb, r) in ((5, 25, 'II'), (9, 24, 'III'), (30, 23, 'I'), (45, 25, 'IV'), (90, 23, 'I'), (150, 26, 'II'), (190, 23, 'III'), (20, 26, '0')):
    for aircon, rain in ((True, 'normal'), (False, 'unprotected'), (False, 'protected'), (True, 'narrow')):
        cases.append({'id': 'notes-%s-%d-%d-%s-%s' % (r, vb, ze, aircon, rain), 'note': 'Tab. 3 notes (aircon %s, %s)' % (aircon, rain),
                      'input': {'kind': 'window', 'site': site(ze, vb, r), 'aircon': aircon, 'rain': rain}, 'expect': {'window': window_expect(ze, vb, r, aircon, rain)}})

# 3. curtain walls Tab. 13 / 14
for (ze, vb, r, ac, rain, cp) in ((10, 25, 'IV', False, 'normal', 1.0), (12, 25, 'II', True, 'normal', 1.0), (30, 26, '0', True, 'normal', 1.0), (40, 23, 'I', False, 'unprotected', 1.2),
                                   (60, 24, 'III', True, 'unprotected', 0.9), (120, 25, 'II', False, 'normal', 1.3), (180, 23, 'IV', False, 'unprotected', 1.0), (8, 23, 'III', True, 'normal', 1.1)):
    cases.append({'id': 'cw-%s-%d-%d' % (r, vb, ze), 'note': 'curtain wall Tab. 13/14, §7.4', 'input': {'kind': 'curtainwall', 'site': site(ze, vb, r), 'aircon': ac, 'rain': rain, 'cp': cp},
                  'expect': {'cw': cw_expect(ze, vb, r, ac, rain, cp)}})

# 4. §6.15.2 / Tab. 11 impact classes (re-typed: category -> case 1, 2, 3 -> exterior public, exterior not public, interior; '-' none, '*' note (1))
T11 = {'A': '422 422 42-', 'B': '423 423 42-', 'C1': '434 444 43*4', 'C2': '433 434 43*3', 'C3': '433 434 43*3', 'C4': '434 434 43*4', 'C5': '434 434 43*4', 'D': '434 434 43-', 'E': '433 433 43-'}
DROP = {1: 200, 2: 300, 3: 450, 4: 700, 5: 950}
def t11(cat, cs, col):
    s = T11[cat].split()[cs - 1]
    s = s.replace('*', '')   # recommendation flag dropped; reco handled separately
    v = s[col] if col < 2 else s[2:]
    return None if v == '-' else int(v)
for cat in T11:
    for (h, hc, l, he, side) in ((0.2, 1.0, 0, 0, 'public'), (0.2, 4.0, 0, 0, 'private'), (1.0, 4.0, 0, 0, 'public'), (0.85, 6.0, 0.4, 2.0, 'public')):
        H = 0.9
        Hf = h + 0.5 * l
        cs = 3 if (h >= H or (h >= 0.8 and Hf >= 1.0)) else (1 if hc <= 1.5 else 2)
        ext = None if he >= H else t11(cat, cs, 0 if side == 'public' else 1)
        inn = t11(cat, cs, 2)
        cases.append({'id': 'impact-%s-%g-%g-%g' % (cat, h, hc, l), 'note': '§6.15.2 Tab. 11', 'input': {'kind': 'window', 'site': site(10, 25, 'III'),
                      'impact': {'on': True, 'category': cat, 'h_m': h, 'hc_m': hc, 'H_m': H, 'l_m': l, 'he_m': he, 'outside': side}},
                      'expect': {'impact': {'case': cs, 'ext': ext, 'ext_drop': DROP.get(ext), 'int': inn, 'reco': '*' in T11[cat].split()[cs - 1]}}})

# 5. Method II: minimum fRsi recomputed from the reference climates (θi, θsi) of Tab. 7 head, rounded to 2 decimals as the table does
REF = {1: (18, 7), 2: (19, 8.6), 3: (20, 11), 4: (22, 13.7), 5: (26, 19)}
FR = {'metal_nb': 0.35, 'metal_tb': 0.62, 'pvc': 0.72, 'wood': 0.72}                 # learning assumption shared with the page (re-typed)
ED = {'metal_nb': (0.40, 0.45), 'metal_tb': (0.58, 0.66), 'pvc': (0.60, 0.69), 'wood': (0.60, 0.69)}
for cl in range(1, 6):
    for te in (-2, -3, -5, -8):
        for fr, sp, ug in (('metal_nb', 'alu', 2.8), ('metal_tb', 'warm', 1.1), ('pvc', 'alu', 1.0)):
            ti, tsi = REF[cl]
            mn = round((tsi - te) / (ti - te) + 1e-9, 2)
            fe = ED[fr][1 if sp == 'warm' else 0]
            items = {'frame': FR[fr], 'edge': fe, 'glass': 1 - ug * 0.13}
            cases.append({'id': 'frsi-%d-%d-%s' % (cl, te, fr), 'note': 'Method II Tab. 7 class %d, θe %d' % (cl, te), 'input': {'kind': 'window', 'site': site(10, 25, 'III'),
                          'condensation': {'on': True, 'climate': cl, 'theta_e': te, 'frame': fr, 'spacer': sp, 'Ug': ug}},
                          'expect': {'cond': {'min': mn, 'items': {k: {'f': v, 'ok': v >= mn - 1e-9, 'theta_si': te + v * (ti - te)} for k, v in items.items()}}}})

# 6. ISO 10077-1 eq. (1)
PSI = {('wood_pvc', 'alu'): (0.06, 0.08), ('metal_tb', 'alu'): (0.08, 0.11), ('metal_nb', 'alu'): (0.02, 0.05),
       ('wood_pvc', 'warm'): (0.05, 0.06), ('metal_tb', 'warm'): (0.06, 0.08), ('metal_nb', 'warm'): (0.01, 0.04)}
for (w, h, bf, uf, ug, fr, sp, lowe) in ((1.2, 1.5, 0.1, 1.4, 1.1, 'wood_pvc', 'warm', True), (1.2, 1.5, 0.11, 2.2, 1.1, 'metal_tb', 'warm', True), (0.8, 1.2, 0.12, 5.9, 2.8, 'metal_nb', 'alu', False),
                                          (2.0, 2.4, 0.09, 1.0, 0.6, 'wood_pvc', 'warm', True), (1.0, 1.0, 0.13, 1.6, 1.0, 'metal_tb', 'alu', True), (3.0, 2.2, 0.08, 1.3, 1.1, 'wood_pvc', 'alu', False)):
    Ag = (w - 2 * bf) * (h - 2 * bf); Af = w * h - Ag; lg = 2 * ((w - 2 * bf) + (h - 2 * bf)); psi = PSI[(fr, sp)][1 if lowe else 0]
    cases.append({'id': 'uw-%g-%g-%s-%s' % (w, h, fr, sp), 'note': 'ISO 10077-1 eq. (1) with Annex E Ψg', 'input': {'kind': 'window', 'site': site(10, 25, 'III'),
                  'uw': {'on': True, 'w_m': w, 'h_m': h, 'bf_m': bf, 'Uf': uf, 'Ug': ug, 'frame': fr, 'spacer': sp, 'lowe': lowe}},
                  'expect': {'uw': {'Uw': (Ag * ug + Af * uf + lg * psi) / (w * h), 'psi': psi}}})

# 7. §6.5.5 calculation route: simply supported profile, deflection 5·q·L⁴/(384·E·I) at P1 of the required class vs L/225 and L/300
for (ze, vb, r, L, b, E, I) in ((45, 25, 'IV', 2.7, 1.35, 70, 95), (9, 25, 'II', 2.4, 1.2, 70, 60), (30, 26, '0', 3.0, 1.5, 210, 40), (120, 23, 'I', 3.2, 1.6, 70, 300)):
    e = window_expect(ze, vb, r); p = e['P1']
    wm = 5 * p * b * L ** 4 / (384 * E * 1e9 * I * 1e-8)
    cases.append({'id': 'profile-%s-%d-%g' % (r, ze, I), 'note': '§6.5.5 calculation route', 'input': {'kind': 'window', 'site': site(ze, vb, r), 'route': 'calc',
                  'profile': {'span_m': L, 'width_m': b, 'E_GPa': E, 'I_cm4': I}}, 'expect': {'window': e, 'profile': {'w_mm': wm * 1000, 'ok225': wm <= L / 225, 'ok300': wm <= L / 300}}})

# 8. hand anchor: house in bocage, ze 9 m, vb0 25 -> W4 (read in Tab. 2: W3 ends at 6 m, W4 at 31 m) -> Tab. 3: air 3, 8A (450 Pa), C2 (800/400/1200)
cases.append({'id': 'hand-house-bocage-9m', 'anchor': True, 'note': 'hand reading of Tab. 2 / Tab. 3', 'input': {'kind': 'window', 'site': site(9, 25, 'II')},
              'expect': {'window': dict(window_expect(9, 25, 'II'), W='W4', air=3, water='8A', wind='C2', P1=800)}})
assert cases[-1]['expect']['window'] == window_expect(9, 25, 'II')

with open(os.path.join(HERE, 'windowclasses_ref.json'), 'w', encoding='utf-8') as f:
    json.dump(cases, f, indent=0)
print(len(cases), 'cases')
