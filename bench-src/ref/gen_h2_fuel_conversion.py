"""Independent reference for h2_fuel_conversion (written by Claude from published data, not a port of the JS).

Calorific values: ISO 6976:2016 method (mass basis, ideal mixing) rebuilt from first principles - standard enthalpies of
combustion at 25 degC from CODATA enthalpies of formation (Cox, Wagman, Medvedev 1989), moved to the combustion reference
temperature with Kirchhoff's law (constant cp at 25 degC, NIST), net value = gross - n(H2O) x enthalpy of vaporisation of
water at that temperature (CoolProp IAPWS-95). Molar masses from IUPAC atomic weights.
Volumes: CoolProp 8.0 Leachman (2009) density of normal hydrogen at 0 and 15 degC, 101.325 kPa, scaled by the molar-mass
ratio (ideal mixing of traces). Methane volume for the natural-gas equivalent: CoolProp methane Z at 15 degC.
Fuel equivalents: Directive (EU) 2018/2001 Annex III LHV; CO2: IPCC 2006 Vol. 2 Table 1.4 defaults, methanol and
methane stoichiometric. Purity: ISO 14687:2019 Table 2 Grade D limits.
Usage: python gen_h2_fuel_conversion.py -> h2_fuel_conversion_ref.json next to this file.
"""
import json, os
import CoolProp.CoolProp as CP

AW = {'H': 1.00794, 'C': 12.0107, 'N': 14.0067, 'O': 15.9994, 'He': 4.002602, 'Ar': 39.948}
FORMULA = {'h2': {'H': 2}, 'ch4': {'C': 1, 'H': 4}, 'co': {'C': 1, 'O': 1}, 'co2': {'C': 1, 'O': 2}, 'n2': {'N': 2},
           'ar': {'Ar': 1}, 'he': {'He': 1}, 'o2': {'O': 2}, 'h2o': {'H': 2, 'O': 1}, 'nh3': {'N': 1, 'H': 3}}
M = {k: sum(AW[a] * n for a, n in f.items()) for k, f in FORMULA.items()}
# CODATA standard enthalpies of formation at 298.15 K, kJ/mol
DHF = {'h2o_l': -285.83, 'co2': -393.51, 'ch4': -74.87, 'co': -110.53, 'nh3': -45.94}
# cp at 298.15 K, J/mol/K (NIST Chemistry WebBook)
CP298 = {'h2o_l': 75.33, 'h2': 28.84, 'o2': 29.38, 'n2': 29.12, 'co2': 37.12, 'ch4': 35.69, 'co': 29.14, 'nh3': 35.06}
# combustion to CO2, liquid water and N2: (reactant coefficients incl. O2, product coefficients, mol H2O formed)
RXN = {
    'h2': ({'h2': 1, 'o2': 0.5}, {'h2o_l': 1}, 1.0),
    'ch4': ({'ch4': 1, 'o2': 2}, {'co2': 1, 'h2o_l': 2}, 2.0),
    'co': ({'co': 1, 'o2': 0.5}, {'co2': 1}, 0.0),
    'nh3': ({'nh3': 1, 'o2': 0.75}, {'n2': 0.5, 'h2o_l': 1.5}, 1.5),
}
IMP = ['h2o', 'nmhc', 'ch4', 'o2', 'he', 'n2', 'ar', 'co2', 'co', 's_tot', 'hcho', 'hcooh', 'nh3', 'halog']
GRADE_D = dict(h2o=5, nmhc=2, ch4=100, o2=5, he=300, n2=300, ar=300, co2=2, co=0.2, s_tot=0.004, hcho=0.2, hcooh=0.2, nh3=0.1, halog=0.05)
RED = {'diesel': (43, 36, 74.1), 'petrol': (43, 32, 69.3), 'lpg': (46, 24, 63.1), 'methanol': (20, 16, 44.0095 / 32.0419 / 0.020)}
BASE = dict(amount=1000, unit='kg', tComb=15, h2o=2, nmhc=0.5, ch4=10, o2=1, he=20, n2=50, ar=5, co2=0.5, co=0.05,
            s_tot=0.001, hcho=0.01, hcooh=0.01, nh3=0.02, halog=0.01)


def gross_molar(sp, T):
    re, pr, _ = RXN[sp]
    dhf = lambda s: DHF.get(s, 0.0)
    dh298 = sum(n * dhf(s) for s, n in pr.items()) - sum(n * dhf(s) for s, n in re.items())
    dcp = sum(n * CP298[s] for s, n in pr.items()) - sum(n * CP298[s] for s, n in re.items())
    return -(dh298 + dcp * 1e-3 * (T - 298.15))


def L_water(T):
    return (CP.PropsSI('H', 'T', T, 'Q', 1, 'Water') - CP.PropsSI('H', 'T', T, 'Q', 0, 'Water')) * M['h2o'] / 1e6  # kJ/mol


def case(cid, **kw):
    g = dict(BASE); g.update(kw)
    T = g['tComb'] + 273.15
    tot = sum(g[k] for k in IMP)
    e = 1e-6
    x = {'h2': 1 - tot * e, 'ch4': (g['ch4'] + g['nmhc']) * e, 'co': g['co'] * e, 'co2': g['co2'] * e, 'n2': g['n2'] * e,
         'ar': g['ar'] * e, 'he': g['he'] * e, 'o2': g['o2'] * e, 'h2o': g['h2o'] * e, 'nh3': g['nh3'] * e}
    Mmix = sum(x[k] * M[k] for k in x)
    Lw = L_water(T)
    Hs_mol = sum(x[k] * gross_molar(k, T) for k in RXN)
    Hi_mol = sum(x[k] * (gross_molar(k, T) - RXN[k][2] * Lw) for k in RXN)
    Hs_mass, Hi_mass = Hs_mol / Mmix * 1000 / 1000, Hi_mol / Mmix * 1000 / 1000   # kJ/mol / g/mol = MJ/kg
    ratio = Mmix / M['h2']
    rhoN = CP.PropsSI('D', 'T', 273.15, 'P', 101325, 'Hydrogen') * ratio
    rhoS = CP.PropsSI('D', 'T', 288.15, 'P', 101325, 'Hydrogen') * ratio
    a, u = g['amount'], g['unit']
    m = {'kg': a, 'Nm3': a * rhoN, 'Sm3': a * rhoS, 'MWh_LHV': a * 3600 / Hi_mass, 'MWh_HHV': a * 3600 / Hs_mass, 'GJ_LHV': a * 1000 / Hi_mass}[u]
    E_GJ = m * Hi_mass / 1000
    ref = {'Hs_mass': Hs_mass, 'Hi_mass': Hi_mass, 'rho_N': rhoN, 'rho_S': rhoS, 'm_kg': m, 'V_N': m / rhoN, 'V_S': m / rhoS,
           'E_LHV_MWh': m * Hi_mass / 3600, 'E_HHV_MWh': m * Hs_mass / 3600, 'E_LHV_GJ': E_GJ}
    for f, (lk, lL, co2) in RED.items():
        ref[f + '_kg'] = E_GJ * 1000 / lk; ref[f + '_L'] = E_GJ * 1000 / lL; ref[f + '_co2_t'] = E_GJ * co2 / 1000
    Hi_ch4 = gross_molar('ch4', T) - 2 * Lw
    Z_ch4 = CP.PropsSI('Z', 'T', 288.15, 'P', 101325, 'Methane')
    Vm = Z_ch4 * 8.314462618 * 288.15 / 101325
    ref['ng_Sm3'] = E_GJ * 1000 / (Hi_ch4 / 1000 / Vm)
    ref['ng_co2_t'] = E_GJ * 1000 / (Hi_ch4 / M['ch4']) * (M['co2'] / M['ch4']) / 1000
    ref['purity_pct'] = 100 - tot * 1e-4
    fails = [k for k in IMP if g[k] > GRADE_D[k]]
    ref['okTotal'] = tot <= 300
    ref['okIndex'] = ref['purity_pct'] >= 99.97
    ref['gradeD'] = not fails and ref['okTotal'] and ref['okIndex']
    ref['gradeA'] = ref['purity_pct'] >= 98.0
    ref['n_fail'] = len(fails) + (0 if ref['okTotal'] else 1)
    return {'id': cid, 'kind': 'solve', 'inputs': kw, 'ref': ref}


ZERO = {k: 0 for k in IMP}
CASES = [
    case('default'),
    case('pure', **ZERO),
    case('electrolytic', h2o=2, nmhc=0, ch4=0, o2=2, he=0, n2=20, ar=2, co2=0, co=0),
    case('smr_psa', h2o=1, nmhc=0.2, ch4=30, o2=0, he=0, n2=100, ar=10, co2=0.5, co=0.1),
    case('co_offspec', co=1),
    case('total_over_300', n2=280, he=50),
    case('industrial_995', ch4=2000, n2=2500, co2=200, co=50, h2o=200),
    case('grade_a_fail', n2=25000),
    case('from_Nm3', amount=11126, unit='Nm3'),
    case('from_Sm3_25C', amount=50000, unit='Sm3', tComb=25),
    case('from_MWh_LHV', amount=33.3, unit='MWh_LHV'),
    case('from_MWh_HHV', amount=100, unit='MWh_HHV', tComb=0),
    case('from_GJ_20C', amount=1200, unit='GJ_LHV', tComb=20),
]

if __name__ == '__main__':
    out = {'tool': 'h2_fuel_conversion', 'generator': 'bench-src/ref/gen_h2_fuel_conversion.py (Claude, 23.10 run12; CODATA + Kirchhoff, CoolProp ' + CP.get_global_param_string('version') + ')', 'cases': CASES}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'h2_fuel_conversion_ref.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(out, fh, indent=1)
    print('wrote', path, len(CASES), 'cases')
