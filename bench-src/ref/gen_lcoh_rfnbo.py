"""Independent reference for lcoh_rfnbo (written by Claude from the published methods, not a port of the JS).

Cost: levelised cost as the ratio of discounted lifetime costs to discounted lifetime hydrogen output
(IEA Global Hydrogen Review 2024, annex "LCOH methodology"; NREL H2A): year-by-year cash-flow table,
capital spent at year 0, constant yearly operation in years 1..N, stack replaced at the end of the year in
which its operating hours reach the stack life (simulated hour counter), no replacement in the final year.

RFNBO electricity rules: Commission Delegated Regulation (EU) 2023/1184 of 10 February 2023
  Art. 3 direct connection (installation not older than 36 months), Art. 4(1) bidding zone > 90 % renewable
  (hours <= share * 8760), Art. 4(2)/Art. 5 PPA with additionality (36 months, no aid), Art. 4(3) emission
  intensity < 18 gCO2e/MJ, Art. 6 temporal correlation (monthly until 31.12.2029, hourly from 1.1.2030),
  Art. 7 geographic correlation (same bidding zone), Art. 11 transition (electrolysers in operation before
  1.1.2028 exempt from Art. 5(a),(b) until 31.12.2035).
GHG: Commission Delegated Regulation (EU) 2023/1185, Annex part A: renewable electricity = 0, other grid
electricity at the bidding-zone intensity; fossil comparator 94 gCO2e/MJ; RED Art. 25(2) 70 % saving;
hydrogen LHV 120 MJ/kg (RED Annex III).
Usage: python gen_lcoh_rfnbo.py -> lcoh_rfnbo_ref.json next to this file.
"""
import json, math, os

LHV_MJ = 120.0
COMPARATOR = 94.0
LIMIT = COMPARATOR * 0.3

BASE = dict(P_MW=100, capex_kW=2000, opex_pct=3, sec=53, flh=5000, stack_life_h=80000, stack_pct=15,
            elec_price=50, water_L=15, water_price=2, wacc=0.07, life=25,
            source='ppa', res_share=1.0, corr='monthly', same_zone=True, res_age_m=12, res_no_aid=True,
            cod_year=2027, year=2028, grid_res_share=0.95, grid_ef=70, other_kg=0.5)


def cash_flow_lcoh(q):
    capex = q['capex_kW'] * 1000.0 * q['P_MW']
    h2_kg = q['P_MW'] * 1000.0 * q['flh'] / q['sec']
    yearly = {
        'opex': capex * q['opex_pct'] / 100.0,
        'elec': q['P_MW'] * q['flh'] * q['elec_price'],
        'water': h2_kg * q['water_L'] / 1000.0 * q['water_price'],
    }
    pv = {'capex': capex, 'stack': 0.0, 'opex': 0.0, 'elec': 0.0, 'water': 0.0}
    pv_h2 = 0.0
    hours, stacks = 0.0, 0
    for t in range(1, int(q['life']) + 1):
        df = (1.0 + q['wacc']) ** -t
        for k, v in yearly.items():
            pv[k] += v * df
        pv_h2 += h2_kg * df
        hours += q['flh']
        if hours >= q['stack_life_h'] - 1e-6 and t < q['life']:
            pv['stack'] += capex * q['stack_pct'] / 100.0 * df
            stacks += 1
            hours = 0.0
    parts = {k: v / pv_h2 for k, v in pv.items()}
    total = sum(parts.values())
    return total, parts, stacks, h2_kg


def renewable_share(q):
    hourly_needed = q['year'] >= 2030
    corr_ok = q['corr'] == 'hourly' or not hourly_needed
    young = q['res_age_m'] <= 36
    src = q['source']
    if src == 'direct':
        return 1.0 if young else 0.0
    if src == 'ppa':
        transition = q['cod_year'] <= 2027 and q['year'] <= 2035
        additional = transition or (young and q['res_no_aid'])
        return q['res_share'] if (additional and corr_ok and q['same_zone']) else 0.0
    if src == 'grid_res':
        return 1.0 if (q['grid_res_share'] > 0.9 and q['flh'] <= 8760 * q['grid_res_share']) else 0.0
    if src == 'low_ef':
        return q['res_share'] if (q['grid_ef'] < 18 and corr_ok and q['same_zone']) else 0.0
    return 0.0


def case(cid, **kw):
    q = dict(BASE)
    q.update(kw)
    total, parts, stacks, h2_kg = cash_flow_lcoh(q)
    f = renewable_share(q)
    el_MJ_per_MJ_h2 = q['sec'] * 3.6 / LHV_MJ
    e_el = (1 - f) * el_MJ_per_MJ_h2 * q['grid_ef']
    e_ot = q['other_kg'] * 1000.0 / LHV_MJ
    e = e_el + e_ot
    rfnbo = f > 0 and e_ot <= LIMIT
    ref = {
        'lcoh': total, 'lcoh_MWh': total / (LHV_MJ / 3.6) * 1000.0,
        'c_capex': parts['capex'], 'c_stack': parts['stack'], 'c_opex': parts['opex'],
        'c_elec': parts['elec'], 'c_water': parts['water'],
        'm_t': h2_kg / 1000.0, 'E_GWh': q['P_MW'] * q['flh'] / 1000.0, 'eff_lhv': LHV_MJ / 3.6 / q['sec'],
        'stacks': stacks, 'f_ren': f, 'e_elec': e_el, 'e_other': e_ot, 'e_tot': e, 'e_kg': e * LHV_MJ / 1000.0,
        'saving_pct': 100.0 * (1 - e / COMPARATOR), 'rfnbo': rfnbo, 'rfnbo_share_pct': 100.0 * f if rfnbo else 0.0,
    }
    return {'id': cid, 'kind': 'solve', 'inputs': kw, 'ref': ref}


CASES = [
    case('default'),
    case('pv_ppa', source='ppa', flh=2000, elec_price=35),
    case('wind_hourly_2030', source='ppa', flh=4000, elec_price=55, corr='hourly', year=2030, cod_year=2029),
    case('wind_monthly_2030_fails', source='ppa', flh=4000, elec_price=55, corr='monthly', year=2030, cod_year=2029),
    case('ppa_old_plant_after_transition', source='ppa', cod_year=2029, year=2029, res_age_m=60),
    case('ppa_subsidised_plant', source='ppa', cod_year=2029, year=2029, res_no_aid=False),
    case('ppa_old_plant_in_transition', source='ppa', cod_year=2026, year=2030, corr='hourly', res_age_m=120),
    case('ppa_other_zone', source='ppa', same_zone=False),
    case('ppa_partial_70', source='ppa', res_share=0.7),
    case('direct_new', source='direct', res_age_m=6, flh=3500, elec_price=40),
    case('direct_old', source='direct', res_age_m=48),
    case('zone_95_8000h', source='grid_res', flh=8000, elec_price=45, grid_res_share=0.95),
    case('zone_95_8500h_fails', source='grid_res', flh=8500, elec_price=45, grid_res_share=0.95),
    case('zone_88_fails', source='grid_res', flh=6000, grid_res_share=0.88),
    case('low_ef_15', source='low_ef', grid_ef=15, flh=7000, elec_price=60),
    case('low_ef_25_fails', source='low_ef', grid_ef=25, flh=7000, elec_price=60),
    case('grid_mix', source='grid', flh=8000, elec_price=80, grid_ef=70),
    case('high_other_emissions', other_kg=3.6),
    case('wacc0_life20', wacc=0.0, life=20, flh=7000),
    case('stack_7000h', flh=7000, stack_life_h=60000, stack_pct=20, capex_kW=1200, opex_pct=2.5, sec=50),
]

if __name__ == '__main__':
    out = {'tool': 'lcoh_rfnbo', 'generator': 'bench-src/ref/gen_lcoh_rfnbo.py (Claude, 23.10 run12; DCF + DA 2023/1184/1185 rules)', 'cases': CASES}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lcoh_rfnbo_ref.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(out, fh, indent=1)
    print('wrote', path, len(CASES), 'cases')
