#!/usr/bin/env python3
"""Independent reference generator: pipeline corrosion defect FFS (ASME B31G-2012, DNV-RP-F101 2019).
Written from the standards' equations. Stdlib only. SI units (m, Pa)."""
import json, math, os

DEFAULTS = dict(D=0.6096, t=0.0127, d=0.005, L=0.2, SMYS=359e6, SMTS=455e6, MAOP=7e6,
                F=0.72, T=1.0, safetyClass='medium', StD=0.08, alphaU=0.96, fuTemp=0.0, F2=0.9)
GAMMA_M = {'low': 0.79, 'medium': 0.74, 'high': 0.70}
STD_PTS = [0.0, 0.04, 0.08, 0.16]
EPS_D = [0.0, 0.0, 1.0, 2.0]
GAMMA_D = {'low': [1, 1, 1.2, 1.2], 'medium': [1, 1, 1.28, 1.38], 'high': [1, 1, 1.32, 1.58]}

def interp(x, xs, ys):
    if x <= xs[0]: return float(ys[0])
    if x >= xs[-1]: return float(ys[-1])
    for i in range(len(xs) - 1):
        if xs[i] <= x <= xs[i + 1]:
            return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i])

def b31g_orig(p, L):
    D, t, dt = p['D'], p['t'], p['d'] / p['t']
    z = L * L / (D * t); sflow = 1.1 * p['SMYS']
    if z <= 20:
        M = math.sqrt(1 + 0.8 * z)
        sf = sflow * (1 - 2.0 / 3.0 * dt) / (1 - (2.0 / 3.0) * dt / M)
    else:
        sf = sflow * (1 - dt)
    return 2 * sf * t / D

def b31g_mod(p, L):
    D, t, dt = p['D'], p['t'], p['d'] / p['t']
    z = L * L / (D * t); sflow = min(p['SMYS'] + 68.95e6, p['SMTS'])
    M = math.sqrt(1 + 0.6275 * z - 0.003375 * z * z) if z <= 50 else 0.032 * z + 3.3
    sf = sflow * (1 - 0.85 * dt) / (1 - 0.85 * dt / M)
    return 2 * sf * t / D

def lallow(p):
    ps = lambda L: b31g_mod(p, L) * p['F'] * p['T']
    lo, hi = 0.0, 50 * math.sqrt(p['D'] * p['t'])
    if ps(hi) >= p['MAOP']: return None
    if ps(lo) < p['MAOP']: return 0.0
    while hi - lo > 1e-9:
        mid = 0.5 * (lo + hi)
        if ps(mid) >= p['MAOP']: lo = mid
        else: hi = mid
    return 0.5 * (lo + hi)

def solve(p):
    D, t, d, L = p['D'], p['t'], p['d'], p['L']; dt = d / t
    z = L * L / (D * t)
    pf_o = b31g_orig(p, L); pf_m = b31g_mod(p, L)
    ps_o = pf_o * p['F'] * p['T']; ps_m = pf_m * p['F'] * p['T']
    Q = math.sqrt(1 + 0.31 * (L / math.sqrt(D * t)) ** 2)
    pfB = 2 * t * p['SMTS'] * (1 - dt) / ((D - t) * (1 - dt / Q)); psB = pfB * p['F'] * p['F2']
    sc = p['safetyClass']; gm = GAMMA_M[sc]
    gd = interp(p['StD'], STD_PTS, GAMMA_D[sc]); ed = interp(p['StD'], STD_PTS, EPS_D)
    fu = (p['SMTS'] - p['fuTemp']) * p['alphaU']; ds = dt + ed * p['StD']
    pcorr = 0.0 if gd * ds >= 1 else gm * 2 * t * fu * (1 - gd * ds) / ((D - t) * (1 - gd * ds / Q))
    safe = [ps_o, ps_m, pcorr, psB]; n_ok = sum(1 for s in safe if s >= p['MAOP'])
    verdict = 'acceptable' if n_ok == 4 else ('reject' if n_ok == 0 else 'marginal')
    ref = dict(Pf_orig_MPa=pf_o / 1e6, Psafe_orig_MPa=ps_o / 1e6, Pf_mod_MPa=pf_m / 1e6,
               Psafe_mod_MPa=ps_m / 1e6, Pcorr_MPa=pcorr / 1e6, PfB_MPa=pfB / 1e6,
               PsafeB_MPa=psB / 1e6, Q=Q, z=z)
    la = lallow(p)
    if la is not None: ref['Lallow_mm'] = la * 1000.0
    ref['verdict'] = verdict
    return ref

PRESETS = [
    ('x52_24in', {}),
    ('x65_32in_dnv', dict(D=0.8128, t=0.0191, SMYS=448e6, SMTS=531e6, d=0.25 * 0.0191, L=0.2, MAOP=15e6)),
    ('x42_shallow_long', dict(D=0.3239, t=0.00635, SMYS=290e6, SMTS=414e6, d=0.0015, L=1.0, MAOP=5e6)),
    ('x70_deep_short', dict(D=1.067, t=0.0159, SMYS=483e6, SMTS=565e6, d=0.011, L=0.05, MAOP=10e6)),
    ('x60_reject', dict(D=0.508, t=0.00953, SMYS=414e6, SMTS=517e6, d=0.006, L=0.5, MAOP=9e6)),
]

def build_cases():
    cases = [(cid, dict(DEFAULTS, **ov)) for cid, ov in PRESETS]
    base = dict(DEFAULTS)
    for dt in [0.1, 0.3, 0.5, 0.7]:
        for L in [0.02, 0.1, 0.3, 0.8, 2.0]:
            cid = 'sweep_dt%02d_L%04d' % (round(dt * 100), round(L * 1000))
            cases.append((cid, dict(base, d=dt * base['t'], L=L)))
    x65 = dict(DEFAULTS, **PRESETS[1][1])
    cases.append(('x65_32in_dnv_sc_low', dict(x65, safetyClass='low')))
    cases.append(('x65_32in_dnv_sc_high', dict(x65, safetyClass='high')))
    cases.append(('x65_32in_dnv_std_0p04', dict(x65, StD=0.04)))
    cases.append(('x65_32in_dnv_std_0p12', dict(x65, StD=0.12)))
    return cases

def main():
    out = {'tool': 'corrosion_defect_ffs', 'generator': 'gen_corrosion_defect_ffs.py', 'cases': []}
    for cid, p in build_cases():
        ref = solve(p)
        out['cases'].append({'id': cid, 'kind': 'solve', 'inputs': p, 'ref': ref})
        la = ref.get('Lallow_mm')
        print('%-26s Pso=%7.3f Psm=%7.3f Pcorr=%7.3f PsB=%7.3f Lallow=%s -> %s' % (
            cid, ref['Psafe_orig_MPa'], ref['Psafe_mod_MPa'], ref['Pcorr_MPa'], ref['PsafeB_MPa'],
            'unbounded' if la is None else '%.3f mm' % la, ref['verdict']))
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corrosion_defect_ffs_ref.json')
    with open(path, 'w') as f:
        json.dump(out, f, indent=2)
    print('wrote %d cases -> %s' % (len(out['cases']), path))

if __name__ == '__main__':
    main()
