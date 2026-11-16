#!/usr/bin/env python3
"""Independent reference generator for the h2_storage_vessel tool (CoolProp 8, Leachman EOS)."""
import json
import math
import os

from CoolProp.CoolProp import PropsSI

FLUID = 'Hydrogen'
M = 2.01588e-3
R = 8.314462618
# r3 23.10 (Claude): H2 LHV/HHV at 25 C from ISO 6976:2016 Table A.4 gross Hc(25 C) = 285.83 kJ/mol, L(25 C) = 44.013 kJ/mol, M = 2.01588 g/mol (was recalled 119.96/141.78)
_ISO_HC25_H2, _ISO_L25, _ISO_M_H2 = 285.83, 44.013, 2.01588
LHV_MJ_KG = (_ISO_HC25_H2 - _ISO_L25) / _ISO_M_H2

DEFAULTS = dict(type='IV', V=0.32, p_max=5e7, p_min=2e6, T=288.15, m_target=500,
                D_i=0.5, UTS=8.6e8, BR=2.25, m_empty=250)
TYPE_I = dict(type='I', V=0.05, p_max=2e7, p_min=1e6, D_i=0.229, BR=2.5, m_empty=60, m_target=100)

SPECS = [
    ('defaults', {}),
    ('type_I_200bar', dict(TYPE_I)),
    ('type_I_300bar', dict(TYPE_I, p_max=3e7)),
    ('type_I_350bar_check', dict(TYPE_I, p_max=3.5e7)),
    ('type_II_450bar', dict(type='II', p_max=4.5e7)),
    ('type_III_300bar_tube_trailer', dict(type='III', p_max=3e7, V=0.35, p_min=3e6, m_target=1000)),
    ('type_III_200bar', dict(type='III', p_max=2e7)),
    ('type_IV_700bar', dict(p_max=7e7)),
    ('type_IV_950bar_buffer', dict(p_max=9.5e7, V=0.1, p_min=2e7, m_target=60)),
    ('type_IV_T_233K', dict(T=233.15)),
    ('type_IV_T_358K', dict(T=358.15)),
    ('type_IV_T_373K_check', dict(T=373.15)),
    ('p_min_zero', dict(p_min=0.0)),
    ('p_min_high_ratio_check', dict(p_min=3e7, p_max=5e7)),
    ('type_III_T_253K', dict(type='III', T=253.15)),
    ('type_I_large_V_low_p', dict(type='I', V=2.0, p_max=5e6, p_min=5e5)),
]


def solve(inp):
    T, V, p_max, p_min = inp['T'], inp['V'], inp['p_max'], inp['p_min']
    rho_max = PropsSI('D', 'T', T, 'P', p_max, FLUID)
    Z_max = PropsSI('Z', 'T', T, 'P', p_max, FLUID)
    rho_min = PropsSI('D', 'T', T, 'P', p_min, FLUID) if p_min > 0 else 0.0
    rho_ig_max = p_max * M / (R * T)
    m_full = rho_max * V
    m_res = rho_min * V
    m_use = m_full - m_res
    N = int(math.ceil(inp['m_target'] / m_use))
    p_burst_min = inp['BR'] * p_max
    t_wall = p_burst_min * inp['D_i'] / (2 * inp['UTS']) if inp['type'] == 'I' else None
    check = (Z_max > 1.2
             or (inp['type'] == 'I' and p_max > 3e7)
             or (inp['type'] == 'IV' and not (233.15 <= T <= 358.15))
             or p_min / p_max > 0.5)
    ref = dict(rho_max=rho_max, rho_min=rho_min, Z_max=Z_max,
               ideal_err=rho_ig_max / rho_max - 1, m_full=m_full, m_use=m_use,
               util=m_use / m_full, N=N, V_total=N * V,
               gravimetric=m_full / (m_full + inp['m_empty']), volumetric=m_full / V,
               p_burst_min=p_burst_min, E_use_MWh=N * m_use * LHV_MJ_KG / 3600,
               verdict='check' if check else 'ok')
    if t_wall is not None:
        ref['t_wall'] = t_wall
    return ref


def main():
    cases = []
    for cid, over in SPECS:
        inp = dict(DEFAULTS, **over)
        cases.append({'id': cid, 'kind': 'solve', 'inputs': inp, 'ref': solve(inp)})
    verdicts = {c['ref']['verdict'] for c in cases}
    assert verdicts == {'ok', 'check'}, verdicts
    out = {'tool': 'h2_storage_vessel',
           'generator': 'bench-src/ref/gen_h2_storage_vessel.py',
           'cases': cases}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'h2_storage_vessel_ref.json')
    with open(path, 'w') as f:
        json.dump(out, f, indent=1)
    print(f'{len(cases)} cases written to {path}')


if __name__ == '__main__':
    main()
