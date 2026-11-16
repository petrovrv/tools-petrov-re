#!/usr/bin/env python3
"""gen_gas_dispersion.py - reference values for gas dispersion (Gaussian plume with Briggs rural sigmas; Britter-McQuaid continuous). Independent re-implementation (Claude, 23.10.2026); Brent-free plain bisection on a different bracket search (geometric doubling instead of a log grid)."""
import json, math, os
R, MA, G = 8.314462618, 0.028964, 9.81
GAS = {'methane': (.01604, .044), 'natgas': (.0185, .045), 'propane': (.0441, .017),
       'hydrogen': (.002016, .04), 'h2s': (.03408, .04), 'co2': (.04401, None)}
AY = {'A': .22, 'B': .16, 'C': .11, 'D': .08, 'E': .06, 'F': .04}
SZ = {'A': lambda x: .20 * x, 'B': lambda x: .12 * x,
      'C': lambda x: .08 * x * (1 + 2e-4 * x) ** -.5, 'D': lambda x: .06 * x * (1 + 1.5e-3 * x) ** -.5,
      'E': lambda x: .03 * x / (1 + 3e-4 * x), 'F': lambda x: .016 * x / (1 + 3e-4 * x)}
BT = {.1: [(-.55, 0, 1.75), (-.14, .24, 1.88), (None, -.50, 1.78)],
      .05: [(-.68, 0, 1.92), (-.29, .36, 2.16), (-.18, 0, 2.06), (None, -.56, 1.96)],
      .02: [(-.69, 0, 2.08), (-.31, .45, 2.39), (-.16, 0, 2.25), (None, -.54, 2.16)],
      .01: [(-.70, 0, 2.25), (-.29, .49, 2.59), (-.20, 0, 2.45), (None, -.52, 2.35)],
      .005: [(-.67, 0, 2.40), (-.28, .59, 2.80), (-.15, 0, 2.63), (None, -.49, 2.56)],
      .002: [(-.69, 0, 2.6), (-.31, .39, 2.87), (None, -.50, 2.62)]}
DEF = {'gas': 'propane', 'Q_kg_s': 1, 'u10_m_s': 3, 'stab': 'D', 'H_m': 0, 'z_m': 0,
       'T_K': 288.15, 'p_Pa': 101325, 'Ctarget_ppm': 0}
def btab(t, a):
    for ub, m, c in t:
        if ub is None or a <= ub:
            return m * a + c
def beta(r, a):
    r = min(max(r, .002), .1); rs = sorted(BT, reverse=True)
    for hi, lo in zip(rs, rs[1:]):
        if lo <= r <= hi:
            f = (math.log10(r) - math.log10(hi)) / (math.log10(lo) - math.log10(hi))
            bh, bl = btab(BT[hi], a), btab(BT[lo], a)
            return bh + f * (bl - bh)
def plume(x, Q, u, s, H, z):
    sy = AY[s] * x * (1 + 1e-4 * x) ** -.5; sz = SZ[s](x)
    return Q / (2 * math.pi * u * sy * sz) * (math.exp(-(z - H) ** 2 / (2 * sz ** 2)) + math.exp(-(z + H) ** 2 / (2 * sz ** 2)))
def x_gauss(C, ckg):
    if C(1.0) < ckg:
        return None
    lo, x = 0.5, 1.0
    while C(x) >= ckg:
        if x >= 1e4:
            return 1e4
        lo, x = x, min(2 * x, 1e4)
    lo = max(lo, x / 2) if x < 1e4 else lo
    hi = x
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if C(mid) >= ckg: lo = mid
        else: hi = mid
    return 0.5 * (lo + hi)
def compute(i):
    M, lfl = GAS[i['gas']]; p, T, Q, u = i['p_Pa'], i['T_K'], i['Q_kg_s'], i['u10_m_s']
    ct = i['Ctarget_ppm'] * 1e-6 if i['Ctarget_ppm'] else lfl
    rho0, rhoa = p * M / (R * T), p * MA / (R * T)
    ckg = ct * p * M / (R * T) if ct is not None else None
    C = lambda x: plume(x, Q, u, i['stab'], i['H_m'], i['z_m'])
    xg = x_gauss(C, ckg) if ckg is not None else None
    crit, xbm = None, None
    if rho0 > rhoa:
        q0 = Q / rho0; gp = G * (rho0 - rhoa) / rhoa; Dc = math.sqrt(q0 / u)
        crit = (gp * q0 / (u ** 3 * Dc)) ** (1 / 3)
        if crit >= 0.15 and ct is not None:
            a = 0.2 * math.log10(gp ** 2 * q0 / u ** 5)
            xbm = Dc * 10 ** beta(ct, a)
    bm = xbm is not None
    return {'xGauss': xg, 'xTarget': xbm if bm else xg, 'densityCriterion': crit, 'ckg': ckg,
            'rho0': rho0, 'rhoa': rhoa, 'model': 'Britter-McQuaid' if bm else 'Gaussian (Pasquill-Gifford)'}
CASES = [('propane-d3', 'propane D 3 m/s', dict(gas='propane', Q_kg_s=1, stab='D', u10_m_s=3)),
         ('methane-f2', 'methane F 2 m/s', dict(gas='methane', Q_kg_s=2, stab='F', u10_m_s=2)),
         ('h2s-ppm', 'H2S to 100 ppm', dict(gas='h2s', Q_kg_s=0.1, stab='F', u10_m_s=1.5, Ctarget_ppm=100)),
         ('co2-40000', 'CO2 to 40000 ppm', dict(gas='co2', Q_kg_s=5, stab='F', u10_m_s=2, Ctarget_ppm=40000)),
         ('hydrogen-d5', 'hydrogen D 5 m/s', dict(gas='hydrogen', Q_kg_s=0.5, stab='D', u10_m_s=5)),
         ('natgas-a2', 'natural gas A 2 m/s', dict(gas='natgas', Q_kg_s=3, stab='A', u10_m_s=2)),
         ('propane-elevated', 'propane elevated H=10 m', dict(gas='propane', Q_kg_s=0.5, stab='C', u10_m_s=4, H_m=10, z_m=0)),
         ('methane-e3-ppm', 'methane E to 5000 ppm', dict(gas='methane', Q_kg_s=1, stab='E', u10_m_s=3, Ctarget_ppm=5000))]
out = []
for cid, note, ov in CASES:
    inp = dict(DEF, **ov)
    out.append({'id': cid, 'note': note, 'inputs': inp, 'ref': compute(inp)})
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gas_dispersion_ref.json')
with open(path, 'w') as f:
    json.dump(out, f, indent=2)
print(len(out))
