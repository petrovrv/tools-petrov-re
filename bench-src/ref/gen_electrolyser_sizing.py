#!/usr/bin/env python3
"""Independent reference generator for the electrolyser_sizing tool.

Written by Claude from the published method, not from the JS:
  - reversible voltage, liquid water: E0 = 1.229 - 0.9e-3 (T - 298.15)  (LeRoy, J. Electrochem. Soc. 1980 approximation)
  - reversible voltage, steam (SOEC): E0 = 1.253 - 2.4516e-4 T          (Ni, Leung, Leung, Int. J. Hydrogen Energy 32 (2007))
  - Nernst term (RT/2F) ln(p_H2 p_O2^0.5 / a_H2O), pressures in bar, a_H2O = 1 for liquid water
  - activation overpotential (RT/(alpha F)) asinh(j/(2 j0)), ohmic ASR j
  - Faraday's law m_H2 = eta_F I M_H2 / (2F); water and oxygen from stoichiometry with CoolProp molar masses
  - SOEC steam raising heat from CoolProp/IAPWS: h(saturated vapour, 1 atm) - h(liquid, 15 C, 1 atm)
Run: python gen_electrolyser_sizing.py  -> electrolyser_sizing_ref.json next to this file.
"""
import json
import math
import os

from CoolProp.CoolProp import PropsSI

F = 96485.33212          # C/mol, CODATA 2018
R = 8.314462618          # J/(mol K), CODATA 2018
M_H2 = PropsSI('M', 'Hydrogen')
M_H2O = PropsSI('M', 'Water')
M_O2 = PropsSI('M', 'Oxygen')
# r3 23.10 (Claude): H2 LHV/HHV at 25 C from ISO 6976:2016 Table A.4 gross Hc(25 C) = 285.83 kJ/mol, L(25 C) = 44.013 kJ/mol, M = 2.01588 g/mol (was recalled 119.96/141.78)
_ISO_HC25_H2, _ISO_L25, _ISO_M_H2 = 285.83, 44.013, 2.01588
LHV = (_ISO_HC25_H2 - _ISO_L25) / _ISO_M_H2 * 1e6   # J/kg, 25 C
HHV = _ISO_HC25_H2 / _ISO_M_H2 * 1e6
H_STEAM = PropsSI('H', 'P', 101325.0, 'Q', 1, 'Water') - PropsSI('H', 'T', 288.15, 'P', 101325.0, 'Water')

TECH = {
    'PEM': dict(T=353.15, j=2.0e4, p_c=3.0e6, p_a=1.0e5, ASR=1.2e-5, j0=5.0, alpha=0.5, eta_F=0.99, e_bop=3.0, deg_uV_h=2.0, life_h=60000.0),
    'AEL': dict(T=353.15, j=4.0e3, p_c=1.0e5, p_a=1.0e5, ASR=2.5e-5, j0=1.0, alpha=0.5, eta_F=0.98, e_bop=4.0, deg_uV_h=1.5, life_h=80000.0),
    'SOEC': dict(T=1023.15, j=6.0e3, p_c=1.0e5, p_a=1.0e5, ASR=3.0e-5, j0=2000.0, alpha=0.5, eta_F=1.0, e_bop=3.0, deg_uV_h=8.0, life_h=20000.0),
}
COMMON = dict(P_AC=20e6, eta_rect=0.97, A_cell=0.1, cells_stack=100, FLH=5000.0, U_steam=0.7, x_H2O_in=0.9)


def case_inputs(tech, **over):
    d = dict(COMMON)
    d.update(TECH[tech])
    d['tech'] = tech
    d.update(over)
    return d


def reversible_voltage(d):
    T = d['T']
    nernst = R * T / (2 * F)
    if d['tech'] == 'SOEC':
        e0 = 1.253 - 2.4516e-4 * T
        x_h2o_mean = d['x_H2O_in'] * (1 - 0.5 * d['U_steam'])
        x_h2_mean = 1 - d['x_H2O_in'] + 0.5 * d['x_H2O_in'] * d['U_steam']
        p_c = d['p_c'] / 1e5
        return e0 + nernst * (math.log(x_h2_mean * p_c) + 0.5 * math.log(d['p_a'] / 1e5) - math.log(x_h2o_mean * p_c))
    e0 = 1.229 - 0.9e-3 * (T - 298.15)
    return e0 + nernst * (math.log(d['p_c'] / 1e5) + 0.5 * math.log(d['p_a'] / 1e5))


def cell_voltage(d, j):
    e = reversible_voltage(d)
    act = R * d['T'] / (d['alpha'] * F) * math.asinh(j / (2 * d['j0']))
    ohm = d['ASR'] * j
    return e, act, ohm, e + act + ohm


def solve(d):
    tech = d['tech']
    e_rev, act, ohm, v = cell_voltage(d, d['j'])
    dv = d['deg_uV_h'] * 1e-6 * d['life_h']
    u_tn = 1.285 if tech == 'SOEC' else 1.481
    kwh_per_kg_per_volt = 2 * F / (M_H2 * d['eta_F']) / 3.6e6

    def e_system(volt):
        return kwh_per_kg_per_volt * volt / d['eta_rect'] + d['e_bop']

    e_dc = kwh_per_kg_per_volt * v
    e_sys, e_avg, e_eol = e_system(v), e_system(v + dv / 2), e_system(v + dv)
    h2_kg_s = d['P_AC'] / (e_sys * 3.6e6)
    p_dc = h2_kg_s * e_dc * 3.6e6
    current = p_dc / v
    n_cells = math.ceil(current / (d['j'] * d['A_cell']))
    warnings = []
    j = d['j']
    if tech == 'PEM' and (j < 5e3 or j > 4e4):
        warnings.append('pem j range')
    if tech == 'AEL' and (j < 1e3 or j > 1e4):
        warnings.append('ael j range')
    if tech == 'SOEC' and v > 1.5:
        warnings.append('soec voltage')
    if tech != 'SOEC' and v > 2.2:
        warnings.append('voltage')
    if d['FLH'] / 8760 < 0.25:
        warnings.append('low FLH')
    if d['life_h'] / d['FLH'] < 5:
        warnings.append('stack life')
    return {
        'E_rev': e_rev, 'eta_act': act, 'eta_ohm': ohm, 'V_cell': v, 'V_eol': v + dv,
        'e_dc_kWh_kg': e_dc, 'e_sys_kWh_kg': e_sys, 'e_sys_avg_kWh_kg': e_avg, 'e_sys_eol_kWh_kg': e_eol,
        'eta_sys_LHV': LHV / 3.6e6 / e_sys, 'eta_sys_HHV': HHV / 3.6e6 / e_sys,
        'mdot_kg_h': h2_kg_s * 3600, 'm_year_t': d['P_AC'] / 1000 * d['FLH'] / e_avg / 1000,  # kWh/y / (kWh/kg) = kg/y -> t/y
        'P_DC': p_dc, 'I_total': current, 'N_cells': n_cells, 'N_stacks': math.ceil(n_cells / d['cells_stack']),
        'Q_stack': (v - u_tn) * current, 'water_kg_h': h2_kg_s * M_H2O / M_H2 * 3600, 'o2_kg_h': h2_kg_s * 0.5 * M_O2 / M_H2 * 3600,
        'e_steam_th_kWh_kg': (M_H2O / M_H2 * H_STEAM / 3.6e6) if tech == 'SOEC' else 0.0,
        'verdict': 'check' if warnings else 'ok',
    }


SPECS = [
    ('pem_default', case_inputs('PEM')),
    ('pem_low_j', case_inputs('PEM', j=1.0e4)),
    ('pem_high_j_check', case_inputs('PEM', j=4.5e4)),
    ('pem_60C', case_inputs('PEM', T=333.15)),
    ('pem_atmospheric', case_inputs('PEM', p_c=1.0e5)),
    ('pem_balanced_30bar', case_inputs('PEM', p_a=3.0e6)),
    ('pem_solar_2000h_check', case_inputs('PEM', P_AC=5e6, FLH=2000.0)),
    ('pem_poor_membrane', case_inputs('PEM', ASR=2.5e-5)),
    ('ael_100MW', case_inputs('AEL', P_AC=100e6, A_cell=2.5, cells_stack=300, FLH=6000.0)),
    ('ael_pressurised_30bar', case_inputs('AEL', p_c=3.0e6, p_a=3.0e6)),
    ('ael_high_j', case_inputs('AEL', j=8.0e3)),
    ('ael_70C', case_inputs('AEL', T=343.15)),
    ('soec_10MW_check', case_inputs('SOEC', P_AC=10e6, A_cell=0.01, cells_stack=100, FLH=7500.0)),
    ('soec_850C', case_inputs('SOEC', T=1123.15, A_cell=0.01, FLH=4000.0)),
    ('soec_high_utilisation', case_inputs('SOEC', U_steam=0.85, A_cell=0.01, FLH=4000.0)),
    ('soec_high_j_check', case_inputs('SOEC', j=1.5e4, A_cell=0.01, FLH=4000.0)),
]


def main():
    out = {'tool': 'electrolyser_sizing', 'generator': 'bench-src/ref/gen_electrolyser_sizing.py',
           'note': 'independent of ogh-h2prod.js; CoolProp %s for molar masses and steam enthalpy' % __import__('CoolProp').__version__,
           'cases': []}
    for cid, inp in SPECS:
        out['cases'].append({'id': cid, 'kind': 'solve', 'inputs': inp, 'ref': solve(inp)})
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'electrolyser_sizing_ref.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    print('wrote', path, len(out['cases']), 'cases')


if __name__ == '__main__':
    main()
