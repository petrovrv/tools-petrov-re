#!/usr/bin/env python3
"""Independent reference generator for the blue_h2_smr_atr tool.

Written by Claude from the published method, not ported from the JS. The tool solves the reformer
equilibrium on element balances with nested bisection; this script uses reaction extents and a 2-D Newton iteration
(numerical Jacobian; scipy is not used because the local SciPy build is incompatible with NumPy 2).
Method:
  - Reformer outlet equilibrium, reactions CH4 + H2O = CO + 3 H2 (Kp1) and CO + H2O = CO2 + H2 (Kp2),
    Kp1 = exp(-26830/T + 30.114) bar^2, Kp2 = exp(4400/T - 4.036) (Xu & Froment, AIChE J. 35 (1989); Twigg, Catalyst Handbook).
    C2H6/C3H8 are taken as fully pre-reformed to CO + H2; ATR oxygen enters as 2 H2 + O2 -> 2 H2O.
  - Shift: CO + H2O = CO2 + H2 equilibrium at T_shift, methane frozen; PSA recovers R_psa of the H2.
  - Reformer duty: 25 C standard formation enthalpies (NIST-JANAF) plus mean heat capacities 298-1100 K.
  - SMR furnace: tail gas + trim natural gas fired at eta_f; flue gas capture with solvent heat from an NG boiler
    whose flue gas is captured as well; LHV per ISO 6976:2016 at 25 C.
  - Carbon intensity: direct CO2 + upstream NG (g CO2e/MJ LHV) + electricity; low-carbon threshold 3.38 kg CO2e/kg H2
    (70 % below the 94 g CO2e/MJ fossil comparator, EU Delegated Regulation 2023/1185 methodology).
Run: python gen_blue_h2_smr_atr.py -> blue_h2_smr_atr_ref.json next to this file.
"""
import json
import math
import os



def brentq(f, a, b, xtol=1e-15):
    """Bisection root finder (name kept for readability); f(a) and f(b) must differ in sign."""
    fa = f(a)
    for _ in range(200):
        m = 0.5 * (a + b)
        fm = f(m)
        if (fm > 0) == (fa > 0):
            a, fa = m, fm
        else:
            b = m
        if b - a < xtol:
            break
    return 0.5 * (a + b)


def fsolve(fun, x0, xtol=1e-13):
    """Damped 2-D Newton with a forward-difference Jacobian."""
    x = list(x0)
    for _ in range(200):
        r = fun(x)
        h = [1e-7 * max(abs(v), 1e-3) for v in x]
        J = []
        for i in range(2):
            xp = list(x)
            xp[i] += h[i]
            rp = fun(xp)
            J.append([(rp[k] - r[k]) / h[i] for k in range(2)])
        a, b, c, dd = J[0][0], J[1][0], J[0][1], J[1][1]  # dr0/dx0, dr0/dx1, dr1/dx0, dr1/dx1
        det = a * dd - b * c
        dx0 = (-r[0] * dd + b * r[1]) / det
        dx1 = (-a * r[1] + c * r[0]) / det
        lam = 1.0
        while lam > 1e-4:
            xn = [x[0] + lam * dx0, x[1] + lam * dx1]
            rn = fun(xn)
            if all(map(lambda v: v == v, rn)) and abs(rn[0]) + abs(rn[1]) < abs(r[0]) + abs(r[1]) + 1e-300:
                break
            lam *= 0.5
        x = xn
        if abs(lam * dx0) + abs(lam * dx1) < xtol:
            break
    return x

HF = {'ch4': -74.87, 'c2h6': -84.0, 'c3h8': -104.7, 'co2': -393.51, 'n2': 0.0, 'h2': 0.0, 'co': -110.53, 'h2o': -241.83, 'o2': 0.0}  # kJ/mol
CP = {'ch4': 54.0, 'c2h6': 85.0, 'c3h8': 120.0, 'co2': 48.5, 'n2': 30.9, 'h2': 29.7, 'co': 31.6, 'h2o': 37.0, 'o2': 32.5}  # J/(mol K)
# r2 23.10 (Claude): net CV from ISO 6976:2016 Table A.4 gross Hc(25 C) and L(25 C) = 44.013 kJ/mol, Hi = Hc - (nH/2)*L
_HC25, _L25 = {'ch4': (890.58, 4), 'c2h6': (1560.69, 6), 'c3h8': (2219.17, 8), 'h2': (285.83, 2), 'co': (282.98, 0)}, 44.013
LHV = {k: hc - nh / 2.0 * _L25 for k, (hc, nh) in _HC25.items()}  # kJ/mol, ISO 6976:2016, 25 C
# r3 23.10 (Claude): eta_LHV uses H2 LHV(25 C) = LHV['h2'] / M (M = 2.01588 g/mol) instead of the recalled 119.96 MJ/kg
MW = {'ch4': 16.043, 'c2h6': 30.069, 'c3h8': 44.096, 'co2': 44.0095, 'n2': 28.0134}
M_CO2, M_H2, M_O2 = 44.0095e-3, 2.01588e-3, 31.9988e-3

BASE = dict(process='SMR', capture='syngas_flue', cap_t_d=300.0, x_ch4=0.93, x_c2h6=0.04, x_c3h8=0.01, x_co2=0.01, x_n2=0.01,
            SC=3.0, OC=0.55, T_ref=1173.15, p_ref=2.5e6, T_in=773.15, T_shift=473.15, R_psa=0.89, eta_f=0.75,
            r_syn=0.95, r_flue=0.90, e_reb=2.7, eta_boiler=0.9, e_comp=100.0, e_asu=0.25, e_aux=0.5, CI_up=8.0, EF_el=0.25)
ATR = dict(process='ATR', cap_t_d=1000.0, SC=1.5, T_ref=1323.15, p_ref=3.5e6, T_in=873.15, capture='syngas', e_aux=0.7)


def kp1(t):
    return math.exp(-26830.0 / t + 30.114)


def kp2(t):
    return math.exp(4400.0 / t - 4.036)


def reformer(d, steam, o2):
    c2, c3 = d['x_c2h6'], d['x_c3h8']
    init = {'ch4': d['x_ch4'], 'co': 2 * c2 + 3 * c3, 'co2': d['x_co2'],
            'h2': 5 * c2 + 7 * c3 - 2 * o2, 'h2o': steam - 2 * c2 - 3 * c3 + 2 * o2}
    p, t = d['p_ref'] / 1e5, d['T_ref']

    def comp(x):
        e1, e2 = x
        return {'ch4': init['ch4'] - e1, 'co': init['co'] + e1 - e2, 'co2': init['co2'] + e2,
                'h2': init['h2'] + 3 * e1 + e2, 'h2o': init['h2o'] - e1 - e2}

    def eqs(x):
        s = comp(x)
        n = sum(s.values()) + d['x_n2']
        r1 = math.log(max(s['co'], 1e-30)) + 3 * math.log(max(s['h2'], 1e-30)) + 2 * math.log(p / n) - math.log(kp1(t) * max(s['ch4'], 1e-30) * max(s['h2o'], 1e-30))
        r2 = math.log(max(s['co2'], 1e-30)) + math.log(max(s['h2'], 1e-30)) - math.log(kp2(t) * max(s['co'], 1e-30) * max(s['h2o'], 1e-30))
        return [r1, r2]

    sol = fsolve(eqs, [0.8 * init['ch4'], 0.3 * init['ch4']], xtol=1e-13)
    out = comp(sol)
    assert max(abs(v) for v in eqs(sol)) < 1e-9 and min(out.values()) > 0, 'equilibrium did not converge'
    return out


def shift(s, t):
    k = kp2(t)
    f = lambda e: (s['co2'] + e) * (s['h2'] + e) - k * (s['co'] - e) * (s['h2o'] - e)
    e = brentq(f, -s['co2'] + 1e-15, s['co'] - 1e-15, xtol=1e-15)
    return {'ch4': s['ch4'], 'co': s['co'] - e, 'co2': s['co2'] + e, 'h2o': s['h2o'] - e, 'h2': s['h2'] + e}


def solve(d):
    ng = {k: d['x_' + k] for k in ('ch4', 'c2h6', 'c3h8', 'co2', 'n2')}
    carbon = {'ch4': 1, 'c2h6': 2, 'c3h8': 3, 'co2': 1, 'n2': 0}
    nc_ng = sum(ng[k] * carbon[k] for k in ng)
    lhv_ng = sum(ng[k] * LHV.get(k, 0.0) for k in ng) * 1e3  # J/mol
    m_ng = sum(ng[k] * MW[k] for k in ng) / 1000  # kg/mol
    n_hc_c = nc_ng - d['x_co2']
    steam = d['SC'] * n_hc_c
    o2 = d['OC'] * n_hc_c if d['process'] == 'ATR' else 0.0
    out = reformer(d, steam, o2)
    dt_out, dt_in = d['T_ref'] - 298.15, d['T_in'] - 298.15
    h_out = sum(n * (HF[k] * 1e3 + CP[k] * dt_out) for k, n in out.items()) + d['x_n2'] * CP['n2'] * dt_out
    h_in = sum(ng[k] * (HF[k] * 1e3 + CP[k] * dt_in) for k in ng) + steam * (HF['h2o'] * 1e3 + CP['h2o'] * dt_in) + o2 * CP['o2'] * dt_in
    q_ref = h_out - h_in
    sh = shift(out, d['T_shift'])
    h2 = d['R_psa'] * sh['h2']
    cap_syn = 0.0 if d['capture'] == 'none' else d['r_syn'] * sh['co2']
    tail_h2, tail_co2 = sh['h2'] - h2, sh['co2'] - cap_syn
    tail_lhv = (tail_h2 * LHV['h2'] + sh['ch4'] * LHV['ch4'] + sh['co'] * LHV['co']) * 1e3
    trim = max(0.0, (q_ref / d['eta_f'] - tail_lhv) / lhv_ng) if d['process'] == 'SMR' else 0.0
    flue = tail_co2 + sh['ch4'] + sh['co'] + trim * nc_ng
    boil, cap_flue = 0.0, 0.0
    if d['capture'] == 'syngas_flue':
        q_mol = d['e_reb'] * 1e6 * M_CO2  # J per mol CO2 regenerated
        # boiler heat = solvent heat for (flue + boiler) CO2 captured
        boil = brentq(lambda b: d['eta_boiler'] * b * lhv_ng - d['r_flue'] * (flue + b * nc_ng) * q_mol, 0.0, 5.0, xtol=1e-15)
        cap_flue = d['r_flue'] * (flue + boil * nc_ng)
    gen = sh['co2'] + sh['ch4'] + sh['co'] + (trim + boil) * nc_ng
    cap = cap_syn + cap_flue
    mol_ng_per_kg = (1.0 / M_H2) / h2
    e_ng = (1 + trim + boil) * mol_ng_per_kg * lhv_ng / 1e6
    co2c = cap * mol_ng_per_kg * M_CO2
    co2e = (gen - cap) * mol_ng_per_kg * M_CO2
    el = d['e_aux'] + d['e_comp'] * co2c / 1000 + (d['e_asu'] * o2 * mol_ng_per_kg * M_O2 if d['process'] == 'ATR' else 0.0)
    ci = co2e + e_ng * d['CI_up'] / 1000 + el * d['EF_el']
    return {
        'X_ch4': 1 - out['ch4'] / nc_ng, 'h2_per_mol_ng': h2, 'Q_ref_kJ_mol': q_ref / 1e3, 'trim_frac': trim, 'boiler_frac': boil,
        'e_ng_MJ_kg': e_ng, 'ng_kg_kg': (1 + trim + boil) * mol_ng_per_kg * m_ng, 'eta_LHV': LHV['h2'] / 2.01588 / e_ng, 'el_kWh_kg': el,
        'co2_gen_kg_kg': gen * mol_ng_per_kg * M_CO2, 'co2_cap_kg_kg': co2c, 'co2_emit_kg_kg': co2e, 'cap_rate': cap / gen,
        'CI_kg_kg': ci, 'co2_cap_t_d': co2c * d['cap_t_d'], 'verdict': 'low_carbon' if ci <= 3.38 else 'above_threshold',
    }


SPECS = [
    ('smr_default_flue_capture', {}),
    ('smr_grey', dict(capture='none')),
    ('smr_syngas_only', dict(capture='syngas')),
    ('smr_850C', dict(T_ref=1123.15)),
    ('smr_SC_2p5', dict(SC=2.5)),
    ('smr_SC_4', dict(SC=4.0)),
    ('smr_15bar', dict(p_ref=1.5e6)),
    ('smr_pure_methane', dict(x_ch4=1.0, x_c2h6=0.0, x_c3h8=0.0, x_co2=0.0, x_n2=0.0)),
    ('smr_low_psa', dict(R_psa=0.80)),
    ('smr_high_shift_T', dict(T_shift=623.15, capture='syngas')),
    ('smr_low_eta_f', dict(eta_f=0.6)),
    ('smr_high_reboiler_heat', dict(e_reb=3.6)),
    ('atr_default', dict(ATR)),
    ('atr_OC_0p6', dict(ATR, OC=0.6)),
    ('atr_grey', dict(ATR, capture='none')),
    ('atr_SC_1', dict(ATR, SC=1.0, CI_up=20.0)),
]


def main():
    cases = []
    for cid, over in SPECS:
        d = dict(BASE)
        d.update(over)
        cases.append({'id': cid, 'kind': 'solve', 'inputs': d, 'ref': solve(d)})
    out = {'tool': 'blue_h2_smr_atr', 'generator': 'bench-src/ref/gen_blue_h2_smr_atr.py',
           'note': 'independent of ogh-h2prod.js (reaction extents + 2-D Newton)', 'cases': cases}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blue_h2_smr_atr_ref.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    print('wrote', path, len(cases), 'cases')


if __name__ == '__main__':
    main()
