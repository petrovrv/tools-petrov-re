#!/usr/bin/env python3
"""Reference corpus generator for the web CO2 property calculator.

Reference values are computed with CoolProp, HEOS backend, IIR reference state:
Span & Wagner (1996) equation of state, Laesecke & Muzny (2017) viscosity,
Huber et al. (2016) thermal conductivity. The reference is independent of the
tool code under test.
"""
import json
import math
import os
from CoolProp.CoolProp import PropsSI, PhaseSI

F = 'CO2'
TC_K = 304.1282
T_GRID = [-50, -20, 0, 20, 30, 31.5, 35, 40, 60, 100, 200, 400, 700]
P_GRID = [1, 10, 30, 60, 74, 80, 100, 150, 250, 500]
SAT_T = [-55, -40, -20, 0, 10, 20, 25, 30]
PT_OUT = {'rho': ('D', 1.0), 'h': ('H', 1e-3), 's': ('S', 1e-3), 'cp': ('C', 1e-3),
          'w': ('A', 1.0), 'mu': ('V', 1e6), 'k': ('L', 1e3)}


def finite(d):
    if not all(math.isfinite(v) for v in d.values()):
        raise ValueError('non-finite value')
    return d


def pt_case(T_C, p_bar):
    T, p = T_C + 273.15, p_bar * 1e5
    if T < TC_K:
        psat = PropsSI('P', 'T', T, 'Q', 0, F)
        if abs(p - psat) <= 0.003 * psat:
            return None
    ref = finite({k: PropsSI(o, 'T', T, 'P', p, F) * f for k, (o, f) in PT_OUT.items()})
    phase = PhaseSI('T', T, 'P', p, F)
    return {'id': f'pT-{T_C}C-{p_bar}bar', 'note': f'pT grid point, phase {phase}',
            'mode': 'pT', 'T_C': T_C, 'p_bar': p_bar, 'expect': 'value',
            'phase': phase, 'ref': ref}


def sat_case(T_C):
    T = T_C + 273.15
    hL = PropsSI('H', 'T', T, 'Q', 0, F) / 1e3
    hV = PropsSI('H', 'T', T, 'Q', 1, F) / 1e3
    ref = finite({'psat': PropsSI('P', 'T', T, 'Q', 0, F) / 1e5,
                  'rhoL': PropsSI('D', 'T', T, 'Q', 0, F),
                  'rhoV': PropsSI('D', 'T', T, 'Q', 1, F),
                  'hL': hL, 'hV': hV, 'dh': hV - hL})
    return {'id': f'sat-{T_C}C', 'note': 'saturation at given T (Q=0/Q=1)',
            'mode': 'satT', 'T_C': T_C, 'expect': 'value', 'ref': ref}


REFUSALS = [
    {'id': 'refuse-pT--80C-10bar', 'note': 'below triple point 216.592 K',
     'mode': 'pT', 'T_C': -80, 'p_bar': 10, 'expect': 'refuse', 'ref': {}},
    {'id': 'refuse-pT-20C-10000bar', 'note': 'above 800 MPa EOS limit',
     'mode': 'pT', 'T_C': 20, 'p_bar': 10000, 'expect': 'refuse', 'ref': {}},
    {'id': 'refuse-sat-35C', 'note': 'above critical temperature 304.1282 K',
     'mode': 'satT', 'T_C': 35, 'expect': 'refuse', 'ref': {}},
]


def main():
    cases = []
    for T_C in T_GRID:
        for p_bar in P_GRID:
            try:
                c = pt_case(T_C, p_bar)
            except Exception:
                continue
            if c:
                cases.append(c)
    for T_C in SAT_T:
        try:
            cases.append(sat_case(T_C))
        except Exception:
            continue
    cases.extend(REFUSALS)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'co2props_ref.json')
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(cases, fh, indent=1, allow_nan=False)
    print(len(cases))


if __name__ == '__main__':
    main()
