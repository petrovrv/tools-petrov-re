# gen_glassthermalbreak.py — independent reference for the glassthermalbreak bench (tools.petrov.re, Glazing & Windows package).
# Written from the norms, not ported from glz-thermal.js:
#   NBN S 23-002-2:2020 Annex A — he = 4 + 4*v (A.1), iteration of the gap conductances until stable (A.2), closed forms A.3 (double) and
#   A.4 (triple, JA..JD) for the glass temperatures; single glazing = the same balance with one pane.
#   NBN EN 673 eq. (4)-(8) (cited by Annex A; copy not in the campaign): hs = hr + hg, hr = 4*sigma*(1/e1 + 1/e2 - 1)^-1 * Tm^3,
#   hg = Nu*lambda/s, Nu = 0.035*(Gr*Pr)^0.38 >= 1; gas coefficients of ISO 15099 Table B.1 (= ISO 52022-3 Annex F, as published).
#   NBN EN 410 §5.4.6 principle (cited by Annex A): absorbed solar fractions with multiple reflections — solved here as one linear system of
#   forward / backward fluxes (the engine iterates), checked against the EN 410 double-glazing closed form.
#   EN 16612:2019 §8.1 eq. (4), §8.2 eq. (6), Table A.5 ke, kmod = 0.663*t^(-1/16): edge design strength; sigma = E*alphaT*dT*k.
# Learning assumptions shared with the engine and labelled as such on the page and in the bench (FIV 01, the method NBN S 23-002:2007
# §4.4.1.3 refers to, is not available): generic optical data, frame warming share r / cold-mass lag, rebate-depth lag, shadow factors,
# blind optics and gap coupling, restraint factor k = 1, 5 h duration. They are re-typed below from the METHOD table, not imported.
# Output: bench-src/ref/glassthermalbreak_ref.json. Run: python -I bench-src/ref/gen_glassthermalbreak.py
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SIG, P0, RG, GRAV, EPS = 5.67e-8, 101325.0, 8314.51, 9.81, 0.837
E_MPA, ALPHA_T, FGK = 70000.0, 9e-6, 45.0

GAS = {  # lambda(T) = a + bT, mu(T) = a + bT, cp(T) = a + bT, M
    'air': ((2.873e-3, 7.760e-5), (3.723e-6, 4.940e-8), (1002.737, 1.2324e-2), 28.97),
    'argon': ((2.285e-3, 5.149e-5), (3.379e-6, 6.451e-8), (521.9285, 0.0), 39.948),
    'krypton': ((9.443e-4, 2.826e-5), (2.213e-6, 7.777e-8), (248.0907, 0.0), 83.80),
}
# learning assumption: generic products (tau, rho coated side, rho glass side, eps coated side)
COATED = {'extraclear': (0.89, 0.08, 0.08, EPS), 'lowe': (0.62, 0.26, 0.22, 0.037), 'solar': (0.40, 0.36, 0.25, 0.037),
          'solar_strong': (0.30, 0.25, 0.18, 0.05), 'tinted': (0.45, 0.05, 0.05, EPS)}
CLEAR = [(3, .86), (4, .84), (6, .80), (8, .77), (10, .74), (12, .71), (15, .67), (19, .62), (25, .55)]
BLIND = {'light': (0.10, 0.70), 'mid': (0.08, 0.40), 'dark': (0.05, 0.10)}
FRAME = {'light': (0.25, 0.0), 'metal_tb': (0.15, 0.0), 'heavy': (0.0, 6.0)}
SHADEF = {'none': 0.0, 'edge': 1.0, 'strip': 1.25}
KE = {'cut': 0.8, 'seamed': 0.9, 'polished': 1.0}
FBK = {'heat_strengthened': 70.0, 'toughened': 120.0}


def interp(pts, x):
    if x <= pts[0][0]: return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1: return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def optics(p, i, n):
    """(tau, rho seen from outside, rho seen from inside, eps outside face, eps inside face)"""
    if p['optic'] == 'clear':
        t = interp(CLEAR, p['t_mm']); r = 0.08 if p['t_mm'] <= 4 else 0.07
        return (t, r, r, EPS, EPS)
    tau, rc, rg, ec = COATED[p['optic']]
    back = (i == 0) if n > 1 else True   # coating faces the cavity; single glazing: room face
    return (tau, rg, rc, EPS, ec) if back else (tau, rc, rg, ec, EPS)


def gauss(A, b):
    n = len(b); M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[p] = M[p], M[c]
        for r in range(c + 1, n):
            f = M[r][c] / M[c][c]
            for k in range(c, n + 1): M[r][k] -= f * M[c][k]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))) / M[i][i]
    return x


def absorbed(layers):
    """unknowns F0..Fn-1 (flux hitting layer j from outside), B0..Bn-1 (from inside); F0 = 1, B(n-1) = 0"""
    n = len(layers); N = 2 * n; A = [[0.0] * N for _ in range(N)]; b = [0.0] * N
    for j in range(n):
        A[j][j] = 1.0
        if j == 0: b[j] = 1.0
        else:
            t, rf, rb = layers[j - 1][:3]; A[j][j - 1] -= t; A[j][n + j - 1] -= rb
        A[n + j][n + j] = 1.0
        if j < n - 1:
            t, rf, rb = layers[j + 1][:3]; A[n + j][n + j + 1] -= t; A[n + j][j + 1] -= rf
    x = gauss(A, b); F, B = x[:n], x[n:]
    return [(1 - L[0] - L[1]) * F[j] + (1 - L[0] - L[2]) * B[j] for j, L in enumerate(layers)]


def hs_gap(gas, s, e1, e2, t1, t2):
    lam, mu, cp, M = GAS[gas]; Tm = (t1 + t2) / 2 + 273.15; dT = max(abs(t1 - t2), 0.1)
    l = lam[0] + lam[1] * Tm; m = mu[0] + mu[1] * Tm; c = cp[0] + cp[1] * Tm; rho = P0 * M / (RG * Tm)
    hr = 4 * SIG * Tm ** 3 / (1 / e1 + 1 / e2 - 1)
    Nu = max(1.0, 0.035 * (GRAV * s ** 3 * dT * rho ** 2 / (Tm * m ** 2) * m * c / l) ** 0.38)
    return hr + Nu * l / s


def glass_temps(c, I):
    panes, n = c['panes'], len(c['panes'])
    lay = [optics(p, i, n) for i, p in enumerate(panes)]
    bl = BLIND.get(c['blind']['type'])
    layers = lay + ([(bl[0], bl[1], bl[1])] if bl else [])
    A = absorbed(layers); a = A[:n]; ab = A[n] if bl else 0.0
    he = 4 + 4 * c['v']; hi = 3.6 + 4.4 * lay[-1][4] / EPS; Te, Ti = c['Te'], c['Ti']
    th = [10.0 - i for i in range(n)]; tb = Ti
    for _ in range(80):
        hs = [hs_gap(c['cavities'][k]['gas'], c['cavities'][k]['s_mm'] / 1000, lay[k][4], lay[k + 1][3], th[k], th[k + 1]) for k in range(n - 1)]
        if bl:   # nodal network: panes + blind (blind gap coupling = learning assumption)
            gap = c['blind']['gap_mm']; hv = interp([(30, 1.0), (50, 2.0), (100, 3.0), (150, 3.6)], gap)
            hrb = 4 * SIG * ((th[-1] + tb) / 2 + 273.15) ** 3 / (1 / lay[-1][4] + 1 / 0.9 - 1)
            m = n + 1; K = [[0.0] * m for _ in range(m)]; q = [I * x for x in a] + [I * ab + 8 * Ti]
            K[0][0] += he; q[0] += he * Te
            for k in range(n - 1):
                K[k][k] += hs[k]; K[k + 1][k + 1] += hs[k]; K[k][k + 1] -= hs[k]; K[k + 1][k] -= hs[k]
            K[n - 1][n - 1] += hrb + hv; q[n - 1] += hv * Ti; K[n - 1][n] -= hrb; K[n][n - 1] -= hrb; K[n][n] += hrb + 8
            x = gauss(K, q); new, ntb = x[:n], x[n]
        elif n == 1:
            new, ntb = [(I * a[0] + he * Te + hi * Ti) / (he + hi)], tb
        elif n == 2:   # NBN S 23-002-2 A.3
            h = hs[0]; D = hi * he + he * h + hi * h
            new = [(I * a[0] * (hi + h) + I * a[1] * h + he * (hi + h) * Te + hi * h * Ti) / D,
                   (I * a[0] * h + I * a[1] * (he + h) + he * h * Te + hi * (he + h) * Ti) / D]; ntb = tb
        else:          # A.4
            h1, h2 = hs; JA = h1 / (he + h1); JB = (he * Te + I * a[0]) / (he + h1)
            JC = h2 / (h1 + h2 - h1 * JA); JD = (I * a[1] + h1 * JB) / (h1 + h2 - h1 * JA)
            t3 = (I * a[2] + h2 * JD + hi * Ti) / (h2 + hi - h2 * JC); t2 = JC * t3 + JD; new = [JA * t2 + JB, t2, t3]; ntb = tb
        d = max(abs(u - w) for u, w in zip(new, th)); th = new
        if bl: d = max(d, abs(ntb - tb)); tb = ntb
        if d < 1e-6: break
    return th, a


def strength(glass, edge, dur, gA, gV, char=False):
    km = max(0.25, min(1.0, 0.663 * dur ** (-1 / 16)))
    if char: gA = gV = 1.0
    if glass == 'annealed': return KE[edge] * km * FGK / gA
    return km * FGK / gA + (FBK[glass] - FGK) / gV   # kv = 1 (horizontal toughening), ke only for annealed


def evaluate(c):
    sun, a = glass_temps(c, c['I']); dark, _ = glass_temps(c, 0.0)
    shade = glass_temps(c, c['I'] * c['diffuse'])[0] if c['shade'] != 'none' else None
    r, lag = FRAME[c['frame']['type']]
    if c['frame']['colour'] == 'dark' and c['frame']['type'] != 'heavy': r += 0.10
    lag += min(5.0, 0.2 * max(0.0, c['frame']['cover_mm'] - 15))
    sf = SHADEF[c['shade']]; Ea = E_MPA * ALPHA_T; out = []
    for i, p in enumerate(c['panes']):
        te = dark[i] + r * (sun[i] - dark[i]) - lag; dtf = sun[i] - te
        dts = sf * (sun[i] - shade[i]) if shade else 0.0
        dT = max(dtf, dts, 0.0) + c['extra_K']; sig = Ea * dT * c['k']
        fd = strength(p['glass'], p['edge'], c['duration_h'], c['gammaMA'], c['gammaMv'])
        fk = strength(p['glass'], p['edge'], c['duration_h'], c['gammaMA'], c['gammaMv'], True)
        u, uk = sig / fd, sig / fk
        out.append({'alphaE': a[i], 'theta_c': sun[i], 'theta_edge': te, 'theta_shade': shade[i] if shade else None, 'dT': dT, 'sigma': sig,
                    'fd': fd, 'util': u, 'util_k': uk, 'risk': 'high' if uk > 1 else 'elevated' if u > 1 else 'low' if u > 0.5 else 'negligible'})
    w = max(range(len(out)), key=lambda k: out[k]['util'])
    return {'panes': out, 'worst': w, 'util': out[w]['util'], 'risk': out[w]['risk']}


def case(cid, note, panes, cav=None, **kw):
    c = {'I': 750.0, 'Te': 5.0, 'Ti': 20.0, 'v': 2.0, 'diffuse': 0.15, 'k': 1.0, 'duration_h': 5.0, 'gammaMA': 1.8, 'gammaMv': 1.2, 'extra_K': 0.0,
         'w_m': 1.5, 'h_m': 2.0, 'frame': {'type': 'light', 'colour': 'light', 'cover_mm': 15.0}, 'shade': 'none', 'blind': {'type': 'none', 'gap_mm': 100.0}}
    c.update(kw); c['panes'] = [dict({'glass': 'annealed', 'edge': 'cut'}, **p) for p in panes]
    c['cavities'] = cav if cav is not None else [{'gas': 'argon', 's_mm': 15.0} for _ in panes[1:]]
    return {'id': cid, 'note': note, 'input': c, 'expect': evaluate(c)}


def main():
    SOL = {'optic': 'solar', 't_mm': 6}; LOW = {'optic': 'lowe', 't_mm': 4}; CL4 = {'optic': 'clear', 't_mm': 4}
    cases = []
    # hand case (anchor): single clear 6 mm, I 600, Te 0, Ti 20, v 1 -> he 8, hi 8.0 (3,6 + 4,4), alpha 0.13:
    # he = 4 + 4*1 = 8, hi = 3.6 + 4.4 = 8.0 (EN 673, uncoated room face), alpha = 1 - 0.80 - 0.07 = 0.13:
    # theta = (600*0.13 + 8*0 + 8*20)/(8 + 8) = (78 + 160)/16 = 14.875 C; dark: 160/16 = 10.0 C; dT (r 0.25) = 0.75*4.875 = 3.656 K
    hc = case('hand-single', 'hand case single clear 6 mm (same model, not an external datum)', [{'optic': 'clear', 't_mm': 6}], I=600.0, Te=0.0, v=1.0)
    th = 14.875; assert abs(hc['expect']['panes'][0]['theta_c'] - th) < 1e-9; assert abs(hc['expect']['panes'][0]['dT'] - 3.65625) < 1e-9
    hc['anchor'] = True; cases.append(hc)
    # EN 410 double closed form check of the flux solve
    L1, L2 = optics(SOL, 0, 2), optics(LOW, 1, 2); A = absorbed([L1, L2]); den = 1 - L1[2] * L2[1]
    assert abs(A[0] - ((1 - L1[0] - L1[1]) + (1 - L1[0] - L1[2]) * L1[0] * L2[1] / den)) < 1e-12 and abs(A[1] - (1 - L2[0] - L2[1]) * L1[0] / den) < 1e-12
    # presets of the page (r2 PLAN §5)
    D30 = {'type': 'dark', 'gap_mm': 30.0}
    cases.append(case('p-balcony-shade', 'preset 1: solar IGU, strip shadow, dark blind 30 mm', [SOL, LOW], shade='strip', blind=D30))
    cases.append(case('p-balcony-shade-hs', 'preset 1b: same, both panes heat-strengthened', [dict(SOL, glass='heat_strengthened'), dict(LOW, glass='heat_strengthened')], shade='strip', blind=D30))
    cases.append(case('p-open-sun', 'preset 2: no shade, light blind 100 mm', [SOL, LOW], blind={'type': 'light', 'gap_mm': 100.0}))
    cases.append(case('p-clear-lowe-pvc', 'preset 3: clear low-e, light PVC frame', [CL4, LOW]))
    cases.append(case('p-heavy-reveal', 'preset 4: heavy concrete reveal, rebate 30 mm', [CL4, LOW], frame={'type': 'heavy', 'colour': 'light', 'cover_mm': 30.0}))
    cases.append(case('p-toughened', 'preset 5: both panes toughened', [dict(SOL, glass='toughened'), dict(LOW, glass='toughened')], shade='strip', blind=D30))
    cases.append(case('p-tinted-8', 'preset 6: body-tinted 8 mm single, dark thermally broken frame, edge shadow', [{'optic': 'tinted', 't_mm': 8}], cav=[],
                      w_m=1.2, h_m=1.5, frame={'type': 'metal_tb', 'colour': 'dark', 'cover_mm': 15.0}, shade='edge'))
    # grid: glazing x situation x irradiance x glass/edge
    GLZ = {'single-clear6': ([{'optic': 'clear', 't_mm': 6}], None), 'single-tinted8': ([{'optic': 'tinted', 't_mm': 8}], None),
           'dbl-clear-lowe': ([CL4, LOW], None), 'dbl-solar-lowe': ([SOL, LOW], [{'gas': 'argon', 's_mm': 16.0}]),
           'dbl-strong-air': ([{'optic': 'solar_strong', 't_mm': 8}, {'optic': 'clear', 't_mm': 6}], [{'gas': 'air', 's_mm': 12.0}]),
           'tri-solar': ([SOL, {'optic': 'clear', 't_mm': 4}, LOW], [{'gas': 'argon', 's_mm': 12.0}, {'gas': 'krypton', 's_mm': 10.0}])}
    SIT = {'plain': {}, 'strip-dark30': {'shade': 'strip', 'blind': D30}, 'edge-light100': {'shade': 'edge', 'blind': {'type': 'light', 'gap_mm': 100.0}},
           'heavy30': {'frame': {'type': 'heavy', 'colour': 'light', 'cover_mm': 30.0}}, 'mid50-dark-alu': {'blind': {'type': 'mid', 'gap_mm': 50.0}, 'frame': {'type': 'metal_tb', 'colour': 'dark', 'cover_mm': 12.0}}}
    GE = [('annealed', 'cut'), ('annealed', 'polished'), ('heat_strengthened', 'cut')]
    k = 0
    for g, (pn, cav) in GLZ.items():
        for s, kw in SIT.items():
            I = [500.0, 750.0, 950.0][k % 3]; glass, edge = GE[k % 3]; k += 1
            extra = {'Te': [-5.0, 5.0, 15.0][k % 3], 'v': [1.0, 2.0, 4.0][(k // 3) % 3]}
            cases.append(case(f'{g}-{s}', f'{g}, {s}, I {I:.0f}, {glass}/{edge}', [dict(p, glass=glass, edge=edge) for p in pn], cav=cav if cav is not None else None, I=I, **extra, **kw))
    # parameter sweeps on one unit (k, duration, gammas, extra dT)
    for i, (kk, dur, gA, ex) in enumerate([(0.7, 5.0, 1.8, 0.0), (1.0, 1.0, 1.8, 0.0), (1.0, 5.0, 1.0, 0.0), (1.0, 12.0, 1.6, 5.0)]):
        cases.append(case(f'sweep-{i}', f'k {kk}, t {dur} h, gammaMA {gA}, extra {ex} K', [SOL, LOW], k=kk, duration_h=dur, gammaMA=gA, extra_K=ex, shade='edge'))
    with open(os.path.join(HERE, 'glassthermalbreak_ref.json'), 'w', encoding='utf-8') as f:
        json.dump(cases, f, ensure_ascii=False, indent=1)
    print(f'{len(cases)} cases written')


if __name__ == '__main__':
    main()
