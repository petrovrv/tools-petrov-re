# gen_glassthickness.py — independent reference for the glassthickness bench (tools.petrov.re, Glazing & Windows package).
# Written from the norms, not ported from glz-thickness.js / glazing-core.js:
#   NBN S 23-002-3:2020 §3.2 / Tab. 1 (class qp), Tab. 2-3 (net cp at 1 and 10 m², log10 in between; e >= 5d -> edge values), §3.2.1 cpi +0,2 / -0,3;
#   NBN S 23-002-2:2020 eq. (100)-(105) (cprob 0,96, gammaQ 1,1), §4.2 eq. (1)(2) fg;d (fg;k 45, gammaM 1,8 / 1,2, fb;k 70 / 120, ksp = kv = 1),
#   Tab. 1 kmod (wind 0,74; insulating-glass pressure 0,635), §4.3 eq. (3)(4) + Tab. 5 omega (wind 0,2 / other 0),
#   §4.4.1.3 eq. (9)(10)(11) phi of a double unit with a* = 28,9·(...)^0,25 and k5 (z1 of §5.2.3), Tab. 7 eq. (6)(7) load sharing,
#   §4.5.3 eq. (25)-(28) triple cavities (solved here as the two cavity balances, direct 2 × 2 solve), §4.4.2 / §4.5.4 delta = phi·p0,
#   the PRINTED extreme isochoric pressures Tab. 24 (double) and Tab. 32 (triple) — the engine instead recombines the Tab. 21 / 29 components,
#   Tab. 39 façade cases (wind + delta accompanying, anticyclone alone), §9.2 (favourable variable action dropped pane by pane),
#   §10.2.1 / §10.2.2 deflection limits (< 5 mm neglected), §5.4 eq. (52)(54) two edges, §8.5.2.1 (2 / 3 edges: delta on the 4-edge model, summed);
#   EN 16612:2019 Annex B eq. (B.1)-(B.8) for the non-linear 4-edge plate (k1, k4 with z1..z4; p* = (A/4h²)²·F/E).
# r2-fix (2026-11-08): hef with d_i to the geometric mid-thickness of the laminate (§4.3 Fig. 1); NBN S 23-002-4:2025 eq. (1)(2)(5)-(7)
#   with Ψp read from the printed Tab. 1.a rows (b on a printed row, λ on the 0,1 grid) and Gint,d of NBN S 23-002-5:2025 Tab. 1
#   (log-linear between the printed temperatures; pane temperatures of the mid-season cyclone 11 / 20,2 °C); single roof panes by
#   §10.5 Tab. 41 + uplift (§9.2) + self-weight alone with Tab. 1 kmod (the roof cp +0,5 / -1,0, sk 0,5, mu 0,8 and s·cos²θ are the
#   tool's learning assumptions, taken over here as inputs); printed Tab. 6 hef values and Tab. 1 kmod as points; 26 tabulated cells of
#   NBN S 23-002-3 / -5 §5 (table / class / zone / size / composition only): the tabulated composition passes and the next thinner
#   composition of the same table row fails at that size.
# Output: bench-src/ref/glassthickness_ref.json. Run: python -I bench-src/ref/gen_glassthickness.py
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
E, NU = 70000.0, 0.23          # MPa
QP = [544, 693, 815, 950, 1086, 1224, 1364]            # NBN S 23-002-3 Tab. 1
CP = {'s1': (-1.30, -1.00), 's2': (-1.60, -1.40), 'p': (1.30, 1.10)}   # Tab. 2 / 3 at A = 1 and 10 m²
CPI = {'suction': 0.2, 'pressure': -0.3}
CPROB2, GQ, GG = 0.96 ** 2, 1.1, 1.1
KMOD = {'wind': 0.74, 'igu': 0.635}
FBK = {'annealed': None, 'heat_strengthened': 70.0, 'toughened': 120.0}
# Tab. 24 (double) / Tab. 32 (triple): [max, min] per cavity, SLS (S) and ULS (U); cyclonic accompanying (a) and anticyclonic dominant (d)
P0 = {'double': {'aS': [[3300, -3180]], 'aU': [[3630, -3495]], 'dS': [[1800, -9420]], 'dU': [[1980, -10360]]},
      'triple': {'aS': [[3300, -3460], [3505, -2640]], 'aU': [[3630, -3805], [3855, -2905]], 'dS': [[1800, -10695], [1800, -7860]], 'dU': [[1980, -11765], [1980, -8645]]}}


def cp_net(sign, zone, geo, A):
    A = max(1.0, min(10.0, A)); key = 'p' if sign == 'pressure' else ('s2' if zone == 2 or geo == 'e_ge_5d' else 's1')
    a, b = CP[key]; return a + (b - a) * math.log10(A)


def fgd(glass, kmod):
    f = kmod * 45.0 / 1.8
    return f if FBK[glass] is None else f + (FBK[glass] - 45.0) / 1.2


def hef(plies, il, omega):
    if len(plies) == 1: return plies[0], plies[0]
    h1, h2, t = plies[0], plies[1], il[0]
    # eq. (3)(4): hm,i = distance from the mid-plane of ply i to the mid-thickness of the laminate (§4.3 Fig. 1)
    H = h1 + t + h2
    d1, d2 = H / 2.0 - h1 / 2.0, H / 2.0 - h2 / 2.0
    hw = (h1 ** 3 + h2 ** 3 + 12 * omega * (h1 * d1 * d1 + h2 * d2 * d2)) ** (1 / 3)
    hsig = min(math.sqrt(hw ** 3 / (h1 + 2 * omega * d1)), math.sqrt(hw ** 3 / (h2 + 2 * omega * d2)))
    return hw, hsig


# NBN S 23-002-4:2025 Tab. 1.a (uniform load, 4 edges): Ψp ×10⁶ [mm⁻²] for the printed rows b = 1500 / 2000 / 2500 mm, λ = 0,1 … 1,0
PSI_ROWS = {1500: [446.445, 115.866, 54.0364, 32.2691, 22.1940, 16.7347, 13.4523, 11.3274, 9.87392, 8.83644],
            2000: [251.125, 65.1744, 30.3955, 18.1514, 12.4841, 9.41325, 7.56690, 6.37166, 5.55408, 4.97050],
            2500: [160.720, 41.7116, 19.4531, 11.6169, 7.98985, 6.02448, 4.84281, 4.07786, 3.55461, 3.18112]}
GINT600 = [(-20, 90.0), (0, 50.0), (10, 4.0), (20, 0.5), (30, 0.3)]   # NBN S 23-002-5:2025 Tab. 1, 600 s


def gint600(T):
    for (t0, g0), (t1, g1) in zip(GINT600, GINT600[1:]):
        if t0 <= T <= t1: return g0 * (g1 / g0) ** ((T - t0) / (t1 - t0))
    raise ValueError(T)


def psi_p(a_m, b_m):
    a, b = round(min(a_m, b_m) * 1000), round(max(a_m, b_m) * 1000)
    j = round(a / b * 10) - 1
    assert b in PSI_ROWS and abs(a / b - (j + 1) / 10) < 1e-9, 'case must sit on a printed Tab. 1.a row / column'
    return PSI_ROWS[b][j] * 1e-6


def hef_part4(plies, il, a_m, b_m, T):
    """eq. (5)-(7) coupling of 2 plies and eq. (1)(2) effective thicknesses"""
    if len(plies) == 1: return plies[0], plies[0], 0.0
    h1, h2, t = plies[0], plies[1], il[0]
    H = h1 + t + h2; d = [H / 2.0 - h1 / 2.0, H / 2.0 - h2 / 2.0]
    s3 = h1 ** 3 + h2 ** 3; sd = h1 * d[0] ** 2 + h2 * d[1] ** 2
    Dabs = E * s3 / (12 * (1 - NU * NU)); Dfull = Dabs + E * sd / (1 - NU * NU)
    eta = 1 / (1 + t * E / (gint600(T) * (1 - NU * NU)) * Dabs / Dfull * h1 * h2 / (h1 + h2) * psi_p(a_m, b_m))
    hw = (1 / (eta / (s3 + 12 * sd) + (1 - eta) / s3)) ** (1 / 3)
    hs = min((1 / (2 * eta * d[i] / (s3 + 12 * sd) + hh / hw ** 3)) ** 0.5 for i, hh in enumerate(plies))
    return hw, hs, eta


def k_coeffs(lam, ps):
    """EN 16612:2019 Annex B: k1 (stress) and k4 (deflection) of a simply supported plate, lam = a/b <= 1"""
    lam = max(0.1, min(1.0, lam)); r = 1 / lam - 1
    z1 = 192 * (1 - NU * NU) * lam * lam * (0.00406 + 0.00896 * (1 - math.exp(-1.123 * r ** 1.097)))
    z2 = 24 * (0.0447 + 0.0803 * (1 - math.exp(-1.17 * r ** 1.073)))
    z3 = (4.5 * r * r + 4.5) / lam
    z4 = (0.585 - 0.05 * r) / lam
    p = max(1e-3, ps)
    k1 = 1 / (4 * math.sqrt(1 / z2 ** 2 + p * p / (z3 ** 2 + (z4 * p) ** 2)))
    k4 = z1 / (16 * lam * lam) if ps < 1e-9 else math.sqrt((math.sqrt(1 / z1 ** 4 + 4 * ps * ps) - 1 / z1 ** 2) / 2) / (16 * lam * lam * ps)
    return k1, k4


def plate4(a_m, b_m, hs, hw, F_Pa):
    a, b = min(a_m, b_m) * 1000, max(a_m, b_m) * 1000
    F = abs(F_Pa) / 1e6
    ps = (a * b / (4 * hw * hw)) ** 2 * F / E
    k1, k4 = k_coeffs(a / b, ps)
    return k1 * a * a / hs ** 2 * F, k4 * a ** 4 / hw ** 3 * F / E


def plate2(L_m, hs, hw, F_Pa):
    L, F = L_m * 1000, abs(F_Pa) / 1e6
    return 0.75 * L * L / hs ** 2 * F, 60 / 384 * L ** 4 * F / (E * hw ** 3)


def k5(lam):
    lam = max(0.1, min(1.0, lam)); r = 1 / lam - 1
    z1 = 192 * (1 - NU * NU) * lam * lam * (0.00406 + 0.00896 * (1 - math.exp(-1.123 * r ** 1.097)))
    return z1 / (16 * lam * lam) * (0.4198 + 0.22 * math.exp(-6.8 * lam ** 1.33))


def wind_ext(inp, sign, A, place='facade'):
    w = inp['wind']
    qp = QP[w['cls'] - 1] if 'cls' in w else w['qp_Pa']
    net = abs(cp_net(sign, w.get('zone', 1), w.get('geometry', 'e_lt_5d'), A)) * (1 if sign == 'pressure' else -1)
    ci = CPI[sign]
    return (net + ci) * qp, -ci * qp     # outer cpe, inner -cpi (Tab. 39)


def sgn(x): return -1.0 if x < 0 else 1.0


def run(inp):
    a, b = min(inp['w_m'], inp['h_m']), max(inp['w_m'], inp['h_m'])
    A, edges = inp['w_m'] * inp['h_m'], inp.get('edges', 4)
    L = inp['h_m'] if inp.get('free_side') == 'h' else inp['w_m']
    g = inp.get('glazing')
    out_cases = []
    part4 = inp.get('laminatedModel') == 'part4'
    if not g and inp.get('tilt_deg', 0) > 15:   # single roof pane, §10.5 Tab. 41 + uplift (§9.2) + self-weight alone
        p = inp['pane']; pl, il = p['plies_mm'], p.get('interlayer_mm', [])
        hw, hs = hef(pl, il, 0.0)                       # ω 0 in a roof (Tab. 5: 0,2 only for façade wind)
        ct = math.cos(math.radians(90 - inp['tilt_deg']))
        gk = 25.0 * sum(pl) * ct
        sn = inp.get('snow', {}); s_ = 0.88 * sn.get('mu', 0.8) * sn.get('sk_kNm2', 0.5) * 1000 * ct * ct
        w = inp['wind']; qp = QP[w['cls'] - 1]
        W, U = CPROB2 * qp * abs(w.get('cp_pressure', 0.5)), CPROB2 * qp * abs(w.get('cp_suction', -1.0))
        km = {'wind': 0.74, 'snow': 0.44, 'self_weight': 0.31}
        rc = [('g_wind', 'wind', GG * gk + GQ * W, gk + W), ('g_snow', 'snow', GG * gk + GQ * s_, gk + s_),
              ('g_wind_snow', 'wind', GG * gk + GQ * W + 0.3 * GQ * s_, gk + W + 0.3 * s_), ('g_snow_wind', 'snow', GG * gk + GQ * s_ + 0.3 * GQ * W, gk + s_ + 0.3 * W),
              ('uplift', 'wind', max(0.0, GQ * U - gk), max(0.0, U - gk)), ('g_only', 'self_weight', GG * gk, gk)]
        ymax = a * 1000 / 125
        for cid, dom, fu, fs in rc:
            sg, _ = plate4(a, b, hs, hw, fu); _, wv = plate4(a, b, hs, hw, fs)
            us = 0 if wv < 5 else wv / ymax
            out_cases.append({'pane': 'single', 'id': cid, 'util': max(sg / fgd(p.get('glass', 'annealed'), km[dom]), us), 'sigma': sg, 'w': wv})
    elif not g:   # single / laminated pane, façade (eq. (100)(101))
        p = inp['pane']; pl, il = p['plies_mm'], p.get('interlayer_mm', [])
        hw, hs = hef_part4(pl, il, a, b, inp.get('glassTemp_C', 11))[:2] if part4 and edges == 4 else hef(pl, il, 0.2)
        d = a * 1000 if edges == 4 else L * 1000
        ymax = d / 125
        for sign in ('suction', 'pressure'):
            o, i = wind_ext(inp, sign, A)
            W = abs(o + i)
            fu, fs = GQ * CPROB2 * W, CPROB2 * W
            if edges == 4: s, _ = plate4(a, b, hs, hw, fu); _, wv = plate4(a, b, hs, hw, fs)
            else: s, _ = plate2(L, hs, hw, fu); _, wv = plate2(L, hs, hw, fs)
            us = 0 if wv < 5 else wv / ymax
            out_cases.append({'pane': 'single', 'id': 'wind_' + sign, 'util': max(s / fgd(p.get('glass', 'annealed'), KMOD['wind']), us), 'sigma': s, 'w': wv})
    else:
        t, panes, cav = g['type'], g['panes'], g['cavity_mm']
        n = len(panes)
        PT = {'double': [11.0, 20.2], 'triple': [10.5, 21.5, 22.0]}[t]                        # NBN S 23-002-5 Tab. 1, mid-season cyclone
        H = ([hef_part4(p['plies_mm'], p.get('interlayer_mm', []), a, b, PT[k])[:2] for k, p in enumerate(panes)] if part4 and edges == 4
             else [hef(p['plies_mm'], p.get('interlayer_mm', []), 0.2) for p in panes])          # wind (ω 0,2 or part 4 η)
        H0 = [hef(p['plies_mm'], p.get('interlayer_mm', []), 0.0) for p in panes]         # climatic (ω 0)
        d = a * 1000 if edges == 4 else L * 1000
        ymax = 15e-7 * d * d + 0.0025 * d + 2.5
        if edges != 4: ymax = min(ymax, 25)
        lam, Am = a / b, a * b
        pos = ['outer', 'middle', 'inner'] if n == 3 else ['outer', 'inner']

        def solve(h, F, p0):
            """cavity balances (eq. (28)): v_i = k5·λ²·A³/(h_i³·E); double: phi of eq. (9)(10) (a* with 28,9), Tab. 7 / eq. (12)"""
            if n == 2:
                h1, h2 = h
                astar = 28.9 * (cav[0] * h1 ** 3 * h2 ** 3 / ((h1 ** 3 + h2 ** 3) * k5(lam))) ** 0.25
                phi = 1 / (1 + (a * 1000 / astar) ** 4)
                d1 = h1 ** 3 / (h1 ** 3 + h2 ** 3); d2 = 1 - d1
                Fd1 = (d1 + phi * d2) * F[0] + (1 - phi) * d1 * F[1] - phi * p0[0]
                Fd2 = (1 - phi) * d2 * F[0] + (d2 + phi * d1) * F[1] + phi * p0[0]
                return [Fd1, Fd2]
            Pa, Ep = 101325.0, 70e9
            v = [k5(lam) * lam * lam * Am ** 3 / ((hh / 1000) ** 3 * Ep) for hh in h]
            V = [Am * s / 1000 for s in cav]
            al = [v[0] * Pa / V[0], v[1] * Pa / V[1]]; ap = [v[1] * Pa / V[0], v[2] * Pa / V[1]]
            # D1 = p01 + al0·(F1 − D1) − ap0·(F2 + D1 − D2);  D2 = p02 + al1·(F2 + D1 − D2) − ap1·(F3 + D2)
            m11, m12, r1 = 1 + al[0] + ap[0], -ap[0], p0[0] + al[0] * F[0] - ap[0] * F[1]
            m21, m22, r2 = -al[1], 1 + al[1] + ap[1], p0[1] + al[1] * F[1] - ap[1] * F[2]
            det = m11 * m22 - m12 * m21
            D1, D2 = (r1 * m22 - m12 * r2) / det, (m11 * r2 - m21 * r1) / det
            return [F[0] - D1, F[1] + D1 - D2, F[2] + D2]

        def resp(h, F, p0):
            hw = [x[0] for x in h]
            if edges == 4:
                return [(sgn(f) * plate4(a, b, h[i][1], h[i][0], f)[0], sgn(f) * plate4(a, b, h[i][1], h[i][0], f)[1]) for i, f in enumerate(solve(hw, F, p0))]
            s3 = sum(x ** 3 for x in hw); Ft = sum(F)
            fin = solve(hw, [0.0] * n, p0)
            res = []
            for i in range(n):
                fe = hw[i] ** 3 / s3 * Ft
                se, we = plate2(L, h[i][1], h[i][0], fe)
                si, wi = plate4(a, b, h[i][1], h[i][0], fin[i])
                res.append((sgn(fe) * se + sgn(fin[i]) * si, sgn(fe) * we + sgn(fin[i]) * wi))
            return res

        cases = []
        for sign in ('suction', 'pressure'):
            o, i = wind_ext(inp, sign, A)
            ext = [o, 0.0, i] if n == 3 else [o, i]
            cases.append(('igu_wind_' + sign, [GQ * CPROB2 * x for x in ext], [CPROB2 * x for x in ext], 'a', KMOD['wind'], H))
        cases.append(('igu_anticyclone', [0.0] * n, [0.0] * n, 'd', KMOD['igu'], H0))
        for cid, Fu, Fs, mode, km, h in cases:
            tu, ts = P0[t][mode + 'U'], P0[t][mode + 'S']
            altU = [[c[0] for c in tu], [c[1] for c in tu]] + ([[0.0] * (n - 1)] if mode == 'a' else [])
            altS = [[c[0] for c in ts], [c[1] for c in ts]] + ([[0.0] * (n - 1)] if mode == 'a' else [])
            RU = [resp(h, Fu, p) for p in altU]; RS = [resp(h, Fs, p) for p in altS]
            for k in range(n):
                s = max(abs(R[k][0]) for R in RU); wv = max(abs(R[k][1]) for R in RS)
                us = 0 if wv < 5 else wv / ymax
                out_cases.append({'pane': pos[k], 'id': cid, 'util': max(s / fgd(panes[k].get('glass', 'annealed'), km), us), 'sigma': s, 'w': wv})
    worst = max(out_cases, key=lambda c: c['util'])
    panes_u = {}
    for c in out_cases: panes_u[c['pane']] = max(panes_u.get(c['pane'], 0), c['util'])
    return {'util': worst['util'], 'governing': worst['id'], 'governing_pane': worst['pane'], 'pane_util': panes_u, 'cases': out_cases}


def mono(t, glass='annealed'): return {'plies_mm': [t], 'interlayer_mm': [], 'glass': glass}
def lami(t, il=0.38): return {'plies_mm': [t, t], 'interlayer_mm': [il], 'glass': 'annealed'}
def fac(w, h, cls, zone, **k):
    d = {'w_m': w, 'h_m': h, 'edges': 4, 'tilt_deg': 0, 'wind': {'cls': cls, 'zone': zone, 'geometry': 'e_lt_5d'}}; d.update(k); return d


cases = []
def add(cid, inp, note, anchor=False):
    r = run(inp); c = {'id': cid, 'note': note, 'input': inp, 'expect': r}
    if anchor: c['anchor'] = anchor
    cases.append(c)

# single / laminated façade panes (classes 1 / 4 / 7, zones 1 / 2)
for (w, h) in [(1.2, 1.8), (0.8, 1.2), (2.0, 3.0), (1.5, 1.5)]:
    for t, cls, z in [(4, 1, 1), (6, 4, 1), (6, 4, 2), (8, 7, 2), (10, 7, 1)]:
        add(f'mono-{t}-{w}x{h}-c{cls}z{z}', fac(w, h, cls, z, pane=mono(t)), f'{t} mm annealed {w}×{h} m, class {cls}, zone {z}')
for t in (4, 5, 6):
    add(f'lam-{t}{t}.1-1.5x2.0-c4', fac(1.5, 2.0, 4, 1, pane=lami(t)), f'laminated {t}{t}.1 (ω 0,2) 1,5 × 2,0 m class 4')
add('tough-4-0.5x2.0-c6z2', fac(0.5, 2.0, 6, 2, pane=mono(4, 'toughened')), 'toughened 4 mm, class 6 edge zone (preset)')
add('mono-6-2edges', dict(fac(0.6, 3.0, 4, 1, pane=mono(6)), edges=2, free_side='h'), '6 mm on 2 edges spanning 3 m (eq. (52)(54))')
add('mono-12-2edges', dict(fac(1.0, 1.6, 3, 1, pane=mono(12)), edges=2, free_side='h'), '12 mm on 2 edges spanning 1,6 m')
# double units
dbl = lambda p1, p2, s=16: {'type': 'double', 'panes': [p1, p2], 'cavity_mm': [s]}
for (w, h), (t1, t2), cls, z in [((0.4, 0.5), (4, 4), 4, 1), ((0.5, 0.6), (4, 4), 1, 1), ((0.6, 0.8), (6, 6), 4, 1), ((1.2, 1.8), (6, 6), 4, 1), ((1.2, 1.8), (8, 6), 4, 2),
                                  ((2.0, 2.5), (8, 8), 6, 1), ((1.0, 1.0), (5, 4), 2, 2), ((1.5, 3.0), (10, 8), 7, 1), ((0.3, 0.4), (6, 6), 3, 1)]:
    add(f'dbl-{t1}-16-{t2}-{w}x{h}-c{cls}z{z}', fac(w, h, cls, z, glazing=dbl(mono(t1), mono(t2))), f'double {t1}-16-{t2}, {w}×{h} m, class {cls}, zone {z}')
add('dbl-6-16-44.1-1.2x1.8', fac(1.2, 1.8, 4, 1, glazing=dbl(mono(6), lami(4))), 'double 6-16-44.1 (laminated inner pane, ω 0,2 wind / 0 climate)')
add('dbl-44.1-16-6-0.6x0.9', fac(0.6, 0.9, 5, 2, glazing=dbl(lami(4), mono(6))), 'double 44.1-16-6 small, class 5 zone 2')
add('dbl-6-12-6-0.7x1.0', fac(0.7, 1.0, 3, 1, glazing=dbl(mono(6), mono(6), 12)), 'double 6-12-6 (cavity 12 mm)')
add('dbl-6-16-6-2edges', dict(fac(1.0, 2.0, 4, 1, glazing=dbl(mono(6), mono(6))), edges=2, free_side='h'), 'double on 2 edges: δ split + Δd on the 4-edge model (§8.5.2.1)')
# triple units
tri = lambda p1, p2, p3: {'type': 'triple', 'panes': [p1, p2, p3], 'cavity_mm': [12, 12]}
for (w, h), ts, cls, z in [((1.2, 1.5), (4, 4, 4), 4, 1), ((0.5, 0.7), (4, 4, 4), 4, 1), ((1.0, 2.0), (6, 4, 6), 5, 2), ((2.0, 2.4), (8, 6, 8), 3, 1), ((0.8, 1.0), (6, 4, 4), 1, 1)]:
    add(f'tri-{"-12-".join(map(str, ts))}-{w}x{h}-c{cls}z{z}', fac(w, h, cls, z, glazing=tri(*[mono(t) for t in ts])), f'triple {"-12-".join(map(str, ts))}, {w}×{h} m, class {cls}, zone {z}')
add('tri-6-12-4-12-44.1', fac(1.2, 1.8, 4, 1, glazing=tri(mono(6), mono(4), lami(4))), 'triple 6-12-4-12-44.1')
# external anchors: compositions printed in NBN S 23-002-3:2020 §5 tables at their tabulated size must pass (util <= 1)
for cid, inp, note in [
    ('anchor-t7-c1', fac(3.21, 3.21, 1, 1, glazing=dbl(mono(10), mono(8))), 'NBN S 23-002-3 §5 Tab. 7 (class 1, zone 1, double float + float): 3,21 × 3,21 m → 10+8'),
    ('anchor-t7-c1-b', fac(1.7, 1.7, 1, 1, glazing=dbl(mono(5), mono(4))), 'NBN S 23-002-3 §5 Tab. 7 (class 1, zone 1): 1,70 × 1,70 m → 5+4'),
    ('anchor-t7-c1-c', fac(2.5, 2.75, 1, 1, glazing=dbl(mono(6), mono(6))), 'NBN S 23-002-3 §5 Tab. 7 (class 1, zone 1): 2,50 × 2,75 m → 6+6')]:
    add(cid, inp, note, anchor='util<=1')


# r2-fix: part 4 (NBN S 23-002-4 / -5) — single laminated façade panes and a double unit with a laminated inner pane at 20,2 °C
add('p4-55.2-1.2x2.0-c4', dict(fac(1.2, 2.0, 4, 1, pane=lami(5, 0.76)), laminatedModel='part4', glassTemp_C=11), 'part 4: 55.2 1,2 × 2,0 m class 4 (η from Ψp Tab. 1.a, Gint,d 600 s at 11 °C)')
add('p4-44.2-1.5x1.5-c6z2', dict(fac(1.5, 1.5, 6, 2, pane=lami(4, 0.76)), laminatedModel='part4', glassTemp_C=11), 'part 4: 44.2 1,5 × 1,5 m class 6 zone 2')
add('p4-66.2-1.5x2.5-c3-T20', dict(fac(1.5, 2.5, 3, 1, pane=lami(6, 0.76)), laminatedModel='part4', glassTemp_C=20), 'part 4: 66.2 at 20 °C (Gint,d 0,5 MPa)')
add('p4-dbl-6-16-55.2-1.5x2.5-c5', dict(fac(1.5, 2.5, 5, 1, glazing=dbl(mono(6), lami(5, 0.76))), laminatedModel='part4', glassTemp_C=11),
    'part 4 in a double unit: laminated inner pane at 20,2 °C (NBN S 23-002-5 Tab. 1) — review CR-1 case')
add('p4-dbl-8-16-55.2-1.6x2.0-c3', dict(fac(1.6, 2.0, 3, 1, glazing=dbl(mono(8), lami(5, 0.76))), laminatedModel='part4', glassTemp_C=11), 'part 4 double 8-16-55.2 class 3')
# r2-fix: single roof panes (§10.5 Tab. 41)
roof = lambda w, h, cls, pane, tilt=80: {'w_m': w, 'h_m': h, 'edges': 4, 'tilt_deg': tilt, 'wind': {'cls': cls, 'cp_pressure': 0.5, 'cp_suction': -1.0}, 'snow': {'sk_kNm2': 0.5, 'mu': 0.8}, 'pane': pane}
add('roof-8-1.0x1.5-c4', roof(1.0, 1.5, 4, mono(8)), 'roof pane 8 mm, slope 10°, class 4: Tab. 41 cases 1–4, uplift, self-weight alone')
add('roof-44.2-1.0x1.5-c3', roof(1.0, 1.5, 3, lami(4, 0.76)), 'roof 44.2 (ω 0 for every action), slope 10°, class 3')
add('roof-6-0.8x1.2-c6-30', roof(0.8, 1.2, 6, mono(6), 30), 'roof pane 6 mm, slope 60°, class 6')
# r2-fix: printed values — Tab. 6 hef (façade wind ω 0,2; roof ω 0) and Tab. 1 kmod
pts = []
pts.append(('pts-44.2-facade', fac(1.2, 1.8, 4, 1, pane=lami(4, 0.76)), {'wind_suction': {'kmod': 0.74, 'hef_w_mm': 6.19, 'hef_sigma_mm': 6.91}}, 'Tab. 6: 44.2 ω 0,2 → hef;w 6,19 / hef;σ 6,91 mm; Tab. 1 kmod wind 0,74'))
pts.append(('pts-55.1-facade', fac(1.2, 1.8, 4, 1, pane=lami(5, 0.38)), {'wind_pressure': {'hef_w_mm': 7.51, 'hef_sigma_mm': 8.35}}, 'Tab. 6: 55.1 ω 0,2 → 7,51 / 8,35 mm'))
pts.append(('pts-44.1-roof', roof(1.0, 1.5, 4, lami(4, 0.38)), {'g_snow': {'kmod': 0.44, 'hef_w_mm': 5.04, 'hef_sigma_mm': 5.66}, 'g_only': {'kmod': 0.31}, 'g_wind': {'kmod': 0.74, 'hef_w_mm': 5.04}}, 'Tab. 6: 44.1 ω 0 → 5,04 / 5,66 mm; Tab. 1 kmod snow 0,44, self-weight 0,31, wind 0,74'))
pts.append(('pts-33.1-roof', roof(0.8, 1.0, 2, lami(3, 0.38)), {'g_snow': {'hef_w_mm': 3.78, 'hef_sigma_mm': 4.24}}, 'Tab. 6: 33.1 ω 0 → 3,78 / 4,24 mm'))
pts.append(('pts-dbl-anticyclone', fac(1.2, 1.8, 4, 1, glazing=dbl(mono(6), mono(4))), {'igu_anticyclone': {'kmod': 0.635}}, 'Tab. 1: kmod 0,635 for the isochoric pressure (insulating glass)'))
for cid, inp, points, note in pts:
    cases.append({'id': cid, 'note': note, 'input': inp, 'points': points})
# r2-fix: tabulated cells of NBN S 23-002-3 / -5 §5 — tabulated composition passes, next thinner of the same row fails
def tab_panes(cell, il):
    out = []
    for q in cell.split('+'):
        n = len(q)
        if n % 2 == 0 and q[:n // 2] == q[n // 2:]: out.append(lami(int(q[:n // 2]), il))
        else: out.append(mono(int(q)))
    return out
def tab_input(x, cell):
    p5 = x['kind'].startswith('p5'); il = 0.76 if p5 else 0.38
    d = fac(x['a'], round(x['a'] * x['ba'], 3), x['cls'], x['zone'])
    if p5: d.update(laminatedModel='part4', glassTemp_C=11)
    ps = tab_panes(cell, il)
    if len(ps) == 1: d['pane'] = ps[0]
    else: d['glazing'] = {'type': 'triple' if len(ps) == 3 else 'double', 'panes': ps, 'cavity_mm': [12, 12] if len(ps) == 3 else [16]}
    return d
TAB = [["p3-mono", 4, 1, 1, 1.6, 1.5, "8", "6"], ["p3-mono", 37, 4, 2, 1.5, 1.5, "10", "8"], ["p3-mono", 70, 7, 1, 1.5, 1.3, "10", "8"], ["p3-lam", 5, 1, 1, 1.6, 1.5, "55", "44"], ["p3-lam", 38, 4, 2, 1.5, 1.5, "66", "55"], ["p3-lam", 60, 6, 1, 1.5, 1.4, "66", "55"], ["p3-lam", 60, 6, 2, 1.6, 1.5, "88", "66"], ["p5-lam", 2, 1, 1, 1.8, 1.5, "44", "33"], ["p5-lam", 17, 4, 2, 1.6, 1.5, "55", "44"], ["p5-lam", 27, 6, 1, 1.6, 1.5, "55", "44"], ["p5-lam", 27, 6, 2, 1.4, 1.5, "55", "44"], ["p3-dbl", 7, 1, 1, 1.5, 1.5, "6+5", "5+5"], ["p3-dbl", 40, 4, 2, 1.5, 1.5, "8+6", "8+5"], ["p3-dbl", 73, 7, 1, 1.5, 1.5, "8+8", "8+6"], ["p3-dbl-lam", 8, 1, 1, 1.5, 1.5, "5+44", "4+44"], ["p3-dbl-lam", 41, 4, 2, 1.6, 1.5, "8+55", "8+44"], ["p3-dbl-lam", 74, 7, 1, 1.5, 1.5, "8+55", "8+44"], ["p3-tri", 12, 1, 1, 1.5, 1.5, "6+4+4", "5+4+4"], ["p3-tri", 45, 4, 2, 1.5, 1.5, "8+4+6", "8+4+5"], ["p3-tri", 78, 7, 1, 1.5, 1.5, "10+5+6", "8+4+5"], ["p5-dbl-lam", 3, 1, 1, 1.5, 1.5, "5+33", "4+33"], ["p5-dbl-lam", 18, 4, 2, 1.5, 1.5, "8+44", "6+44"], ["p5-dbl-lam", 33, 7, 1, 1.4, 1.5, "8+44", "6+44"], ["p5-tri-lam", 5, 1, 1, 1.6, 1.5, "4+4+44", "4+4+33"], ["p5-tri-lam", 20, 4, 2, 1.5, 1.5, "6+4+55", "6+4+44"], ["p5-tri-lam", 35, 7, 1, 1.5, 1.4, "6+4+55", "6+4+44"]]
for kind, tab, cls, zone, a_, ba, cell, left in TAB:
    x = {'kind': kind, 'cls': cls, 'zone': zone, 'a': a_, 'ba': ba}
    part = '5' if kind.startswith('p5') else '3'
    cases.append({'id': f'table-p{part}-t{tab}-c{cls}z{zone}-{a_}x{ba}', 'note': f'NBN S 23-002-{part}:{"2025" if part == "5" else "2020"} §5 Tab. {tab} (class {cls}, zone {zone}): {a_} m, b/a {ba} → {cell}; next thinner {left} fails',
                  'input': tab_input(x, cell), 'input_thinner': tab_input(x, left), 'anchor': 'table'})

json.dump(cases, open(os.path.join(HERE, 'glassthickness_ref.json'), 'w'), indent=0)
print(len(cases), 'cases;', sum(len(c['expect']['cases']) for c in cases if 'expect' in c), 'pane-case values;', sum(1 for c in cases if c.get('anchor') == 'table'), 'table cells')
