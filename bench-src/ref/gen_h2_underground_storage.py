#!/usr/bin/env python3
"""Independent reference generator for the h2_underground_storage tool (salt cavern).

Written by Claude from the published method, not ported from the JS:
  - pressure window from the lithostatic pressure at the casing shoe, p_max = f_max rho_rock g z, p_min = f_min rho_rock g z,
    rock temperature T = T_surf + grad_T z (Caglayan et al., Int. J. Hydrogen Energy 45 (2020) 6793);
  - isothermal hydrogen inventory with CoolProp 8 HEOS density (Leachman et al. 2009 normal hydrogen);
  - withdrawal limited by an allowed pressure drop per day, evaluated as a centred density difference at mid pressure;
  - energy on the LHV basis, 119.96 MJ/kg;
  - R2 (D-r2-1): optional compressor discharge p_inj at the wellhead (0 = not limiting). The pressure at the casing shoe is
    found by integrating the static gas column dp/dz = rho(p, T(z)) g with RK4 down the geothermal profile (CoolProp
    density at every step; the tool uses a mean-density closed form instead), and p_max = min(f_max p_lith, p_shoe).
Run: python gen_h2_underground_storage.py -> h2_underground_storage_ref.json next to this file.
"""
import json
import os

from CoolProp.CoolProp import PropsSI

G = 9.80665
# r3 23.10 (Claude): H2 LHV/HHV at 25 C from ISO 6976:2016 Table A.4 gross Hc(25 C) = 285.83 kJ/mol, L(25 C) = 44.013 kJ/mol, M = 2.01588 g/mol (was recalled 119.96/141.78)
_ISO_HC25_H2, _ISO_L25, _ISO_M_H2 = 285.83, 44.013, 2.01588
LHV = (_ISO_HC25_H2 - _ISO_L25) / _ISO_M_H2 * 1e6
BASE = dict(V=500000.0, z=1000.0, rho_rock=2200.0, f_max=0.8, f_min=0.24, T_surf=283.15, grad_T=0.025, dp_day=1.0e6, n_cyc=4.0, p_inj=0.0)


def rho(t, p):
    return PropsSI('D', 'T', t, 'P', p, 'Hydrogen')


def shoe_pressure(p_wh, d, n=200):
    # static hydrogen column from the wellhead to the casing shoe, RK4 in depth
    h = d['z'] / n
    p = p_wh
    def f(zz, pp):
        return rho(d['T_surf'] + d['grad_T'] * zz, pp) * G
    for i in range(n):
        zz = i * h
        k1 = f(zz, p)
        k2 = f(zz + h / 2, p + h / 2 * k1)
        k3 = f(zz + h / 2, p + h / 2 * k2)
        k4 = f(zz + h, p + h * k3)
        p += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    return p


def solve(d):
    p_lith = d['rho_rock'] * G * d['z']
    p_rock, p_lo = d['f_max'] * p_lith, d['f_min'] * p_lith
    t = d['T_surf'] + d['grad_T'] * d['z']
    p_shoe = shoe_pressure(d['p_inj'], d) if d['p_inj'] > 0 else None
    limited = p_shoe is not None and p_shoe < p_rock
    p_hi = p_shoe if limited else p_rock
    r_hi, r_lo = rho(t, p_hi), rho(t, p_lo)
    working_rock = d['V'] * (rho(t, p_rock) - r_lo)
    working = d['V'] * (r_hi - r_lo)
    cushion = d['V'] * r_lo
    p_mid = 0.5 * (p_hi + p_lo)
    step = min(d['dp_day'], p_hi - p_lo)
    per_day = d['V'] * (rho(t, p_mid + step / 2) - rho(t, p_mid - step / 2))
    days = working / per_day
    cycles_max = 365.0 / (2 * days)
    throughput = min(d['n_cyc'], cycles_max) * working
    warn = limited or (d['n_cyc'] > cycles_max) or d['f_min'] < 0.2 or d['f_max'] > 0.85 or d['z'] < 500 or d['z'] > 1800
    return {
        'p_max': p_hi, 'p_max_lith': p_rock, 'p_shoe_inj': p_shoe, 'wg_loss': 1 - working / working_rock, 'p_min': p_lo, 'T': t, 'rho_max': r_hi, 'rho_min': r_lo,
        'm_wg_t': working / 1000, 'm_cush_t': cushion / 1000, 'cushion_ratio': cushion / (d['V'] * r_hi),
        'E_wg_GWh': working * LHV / 3.6e12, 'mdot_max_t_d': per_day / 1000, 'days_empty': days, 'cyc_max': cycles_max,
        'thr_t_y': throughput / 1000, 'thr_GWh_y': throughput * LHV / 3.6e12, 'verdict': 'check' if warn else 'ok',
    }


SPECS = [
    ('default_500k_1000m', {}),
    ('shallow_600m', dict(V=300000.0, z=600.0)),
    ('deep_1500m', dict(V=750000.0, z=1500.0)),
    ('fast_cycling_check', dict(n_cyc=20.0, dp_day=1.5e6, f_min=0.3)),
    ('very_fast_cycling_check', dict(n_cyc=40.0)),
    ('rock_2300', dict(rho_rock=2300.0)),
    ('low_fmin_check', dict(f_min=0.15)),
    ('high_fmax_check', dict(f_max=0.9)),
    ('shallow_400m_check', dict(z=400.0)),
    ('deep_2000m_check', dict(z=2000.0)),
    ('warm_gradient', dict(grad_T=0.035)),
    ('cold_surface', dict(T_surf=278.15)),
    ('slow_rate', dict(dp_day=0.5e6)),
    ('small_cavern', dict(V=100000.0)),
    ('seasonal_1_cycle', dict(n_cyc=1.0)),
    ('narrow_window', dict(f_min=0.5, f_max=0.7)),
    ('p_inj_200bar_not_limiting', dict(p_inj=2.0e7)),
    ('p_inj_150bar_limited_check', dict(p_inj=1.5e7)),
    ('p_inj_200bar_deep_limited_check', dict(V=750000.0, z=1500.0, p_inj=2.0e7)),
]


def main():
    cases = []
    for cid, over in SPECS:
        d = dict(BASE)
        d.update(over)
        cases.append({'id': cid, 'kind': 'solve', 'inputs': d, 'ref': solve(d)})
    out = {'tool': 'h2_underground_storage', 'generator': 'bench-src/ref/gen_h2_underground_storage.py',
           'note': 'independent of ogh-h2prod.js; CoolProp %s HEOS density' % __import__('CoolProp').__version__, 'cases': cases}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'h2_underground_storage_ref.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    print('wrote', path, len(cases), 'cases')


if __name__ == '__main__':
    main()
