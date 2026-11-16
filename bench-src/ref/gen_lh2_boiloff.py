#!/usr/bin/env python3
"""Independent reference generator for the lh2_boiloff tool.

Written by Claude from the published method, not ported from the JS:
  - saturated para-hydrogen properties straight from CoolProp 8 (Leachman et al. 2009 para EOS) at the tank pressure
    (the tool interpolates a 0.25 bar table);
  - ortho-para self-conversion dx_o/dt = -k x_o^2 (Scott, Denton and Nicholls 1957 rate constant ~0.0114 1/h),
    conversion heat 2 theta R / M with theta = 85.25 K (rigid rotor, J = 1 -> 0);
  - vented constant-pressure tank, dm/dt = -(Q_leak + m dH k x_o^2) / h_fg (Petitpas, LLNL-TR-750685, 2018),
    solved semi-analytically: with B(t) = (dH/h_fg)(x_o0 - x_o(t)),
    m(t) = exp(-B(t)) [m0 - (Q/h_fg) * integral_0^t exp(B(s)) ds], the integral by composite Simpson;
  - heat leak q times the area of a sphere or of a flat-ended cylinder with L = 3 D (side pi D L plus two ends pi D^2/4).
Run: python gen_lh2_boiloff.py -> lh2_boiloff_ref.json next to this file.
"""
# r3 23.10 (Claude): H2 LHV/HHV at 25 C from ISO 6976:2016 Table A.4 gross Hc(25 C) = 285.83 kJ/mol, L(25 C) = 44.013 kJ/mol, M = 2.01588 g/mol (was recalled 119.96/141.78)
_ISO_HC25_H2, _ISO_L25, _ISO_M_H2 = 285.83, 44.013, 2.01588
LHV_MJ_KG = (_ISO_HC25_H2 - _ISO_L25) / _ISO_M_H2
import json
import math
import os

from CoolProp.CoolProp import PropsSI

R, M_H2, THETA = 8.314462618, 2.01588e-3, 85.25
BASE = dict(V=100.0, fill=0.9, p=1.2e5, shape='sphere', q=1.0, xp0=0.95, k=0.0114, t_store=30.0)


def area(shape, v):
    if shape == 'sphere':
        r = (3 * v / (4 * math.pi)) ** (1 / 3)
        return 4 * math.pi * r * r
    d = (4 * v / (3 * math.pi)) ** (1 / 3)   # cylinder with length 3 D
    return math.pi * d * (3 * d) + 0.5 * math.pi * d * d


def solve(d):
    rho_l = PropsSI('D', 'P', d['p'], 'Q', 0, 'ParaHydrogen')
    h_fg = PropsSI('H', 'P', d['p'], 'Q', 1, 'ParaHydrogen') - PropsSI('H', 'P', d['p'], 'Q', 0, 'ParaHydrogen')
    a = area(d['shape'], d['V'])
    q_leak = d['q'] * a
    dh = 2 * THETA * R / M_H2
    xo0 = 1 - d['xp0']
    m0 = d['fill'] * d['V'] * rho_l
    hours = d['t_store'] * 24

    def xo(t):
        return xo0 / (1 + d['k'] * xo0 * t)

    def big_b(t):
        return dh / h_fg * (xo0 - xo(t))

    n = 20000
    step = hours / n
    acc = 0.0
    for i in range(n + 1):
        w = 1 if i in (0, n) else (4 if i % 2 else 2)
        acc += w * math.exp(big_b(i * step))
    integral = acc * step / 3
    m_end = math.exp(-big_b(hours)) * (m0 - q_leak * 3600 / h_fg * integral)
    lost = m0 - m_end
    bor_leak = q_leak * 86400 / h_fg / m0 * 100
    bor_conv = dh * d['k'] * xo0 ** 2 * 24 / h_fg * 100
    warn = d['xp0'] < 0.9 or bor_leak + bor_conv > 1 or d['p'] > 4e5
    return {'rho_l': rho_l, 'h_fg': h_fg, 'A': a, 'Q_leak': q_leak, 'm0_kg': m0, 'bor_leak_pct_d': bor_leak, 'bor_conv_pct_d': bor_conv,
            'bor_total_pct_d': bor_leak + bor_conv, 'm_end_kg': m_end, 'lost_kg': lost, 'lost_pct': lost / m0 * 100,
            'lost_conv_only_kg': m0 * (1 - math.exp(-big_b(hours))), 'xp_end': 1 - xo(hours), 'E_lost_MWh': lost * LHV_MJ_KG / 3600,
            'verdict': 'check' if warn else 'ok'}


SPECS = [
    ('default_100m3_sphere', {}),
    ('normal_fill_check', dict(xp0=0.25)),
    ('large_sphere_4700', dict(V=4700.0, q=0.15, t_store=90.0)),
    ('trailer_cylinder_check', dict(V=50.0, shape='cylinder', q=3.0, p=3e5, t_store=10.0)),
    ('para_998', dict(xp0=0.998)),
    ('para_100', dict(xp0=1.0)),
    ('half_converted_check', dict(xp0=0.6, t_store=7.0)),
    ('p_1bar', dict(p=1.0e5)),
    ('p_2p35bar', dict(p=2.35e5)),
    ('p_5bar_check', dict(p=5.0e5)),
    ('fill_50pct', dict(fill=0.5)),
    ('no_leak', dict(q=0.0)),
    ('no_conversion', dict(k=0.0)),
    ('fast_k', dict(k=0.02)),
    ('one_year', dict(t_store=365.0, V=1000.0, q=0.3)),
    ('small_dewar_check', dict(V=1.0, q=2.0, t_store=5.0)),
]


def main():
    cases = []
    for cid, over in SPECS:
        d = dict(BASE)
        d.update(over)
        cases.append({'id': cid, 'kind': 'solve', 'inputs': d, 'ref': solve(d)})
    out = {'tool': 'lh2_boiloff', 'generator': 'bench-src/ref/gen_lh2_boiloff.py',
           'note': 'independent of ogh-h2prod.js; CoolProp %s ParaHydrogen; semi-analytic ODE solution' % __import__('CoolProp').__version__, 'cases': cases}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lh2_boiloff_ref.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    print('wrote', path, len(cases), 'cases')


if __name__ == '__main__':
    main()
