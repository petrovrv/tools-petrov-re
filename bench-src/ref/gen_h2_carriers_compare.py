"""Independent reference for h2_carriers_compare (written by Claude from the published chain method, not a port of the JS).

Method: IEA (2019) The Future of Hydrogen, ch. 3 "Producing hydrogen ... transport" and the annex cost chain - hydrogen
is converted to a carrier (liquefaction, ammonia synthesis, LOHC hydrogenation), stored at the export terminal, shipped,
stored at the import terminal and reconverted (regasification, ammonia cracking, LOHC dehydrogenation).
This reference works BACKWARDS from 1 kg of hydrogen delivered at the import terminal: it walks the chain in reverse,
grossing up the mass at each step (recovery, burnt hydrogen for heat, daily boil-off compounded over the voyage,
conversion yield), then prices each step on the mass that passes through it. Energy efficiency = delivered LHV /
(LHV of hydrogen fed + electricity + external heat). LHV 33.33 kWh/kg.
Usage: python gen_h2_carriers_compare.py -> h2_carriers_compare_ref.json next to this file.
"""
import json, os

LHV = 33.33
BASE = dict(dist=5000, speed=650, P_h2=3.0, elec_price=50, imp_elec=80, heat_price=40, heat_h2=False, eta_burn=0.9)
CARRIER = {
    'lh2': dict(conv_kWh=10, conv_eur=0.9, f_conv=0.99, term_eur=0.4, ship_eur=0.12, bo_day=0.2, rec_heat=0, rec_kWh=0.2, rec_eur=0.1, f_rec=1.0),
    'nh3': dict(conv_kWh=3.5, conv_eur=0.6, f_conv=0.99, term_eur=0.1, ship_eur=0.03, bo_day=0.0, rec_heat=9.0, rec_kWh=0.5, rec_eur=0.6, f_rec=0.95),
    'lohc': dict(conv_kWh=1.0, conv_eur=0.5, f_conv=0.99, term_eur=0.15, ship_eur=0.07, bo_day=0.0, rec_heat=10.5, rec_kWh=0.3, rec_eur=0.5, f_rec=0.97),
}


def chain(g, c):
    k = {key: g[c + '_' + key] for key in CARRIER[c]}
    voyage_days = g['dist'] / g['speed']
    # backwards from 1 kg delivered
    m_out_reconv = 1.0
    burnt_per_kg_recovered = k['rec_heat'] / (LHV * g['eta_burn']) if g['heat_h2'] else 0.0
    m_recovered = m_out_reconv / (1.0 - burnt_per_kg_recovered)       # kg leaving the cracker/dehydrogenator
    m_into_reconv = m_recovered / k['f_rec']                          # kg H2 (in carrier) unloaded
    m_loaded = m_into_reconv / ((1.0 - k['bo_day'] / 100.0) ** voyage_days)   # boil-off compounded daily
    m_fed = m_loaded / k['f_conv']                                    # kg H2 fed to conversion
    ext_heat = 0.0 if g['heat_h2'] else k['rec_heat'] * m_into_reconv
    parts = {
        'production': g['P_h2'] * m_fed,
        'conversion': (k['conv_kWh'] * g['elec_price'] / 1000.0 + k['conv_eur']) * m_fed,
        'terminals': k['term_eur'] * m_fed,
        'shipping': k['ship_eur'] * g['dist'] / 1000.0 * m_fed,
        'reconversion': (k['rec_kWh'] * g['imp_elec'] / 1000.0 + k['rec_eur']) * m_into_reconv + ext_heat * g['heat_price'] / 1000.0,
    }
    total = sum(parts.values())
    energy_in = LHV * m_fed + k['conv_kWh'] * m_fed + k['rec_kWh'] * m_into_reconv + ext_heat
    return {
        'cost': total, 'transport': total - parts['production'], 'eff': LHV / energy_in,
        'deliv': 1.0 / m_fed, 'kWh': energy_in - LHV,
    }


def case(cid, **kw):
    g = dict(BASE)
    for c, d in CARRIER.items():
        for key, v in d.items():
            g[c + '_' + key] = v
    g.update(kw)
    res = {c: chain(g, c) for c in CARRIER}
    ref = {}
    for c, x in res.items():
        ref[c + '_cost'] = x['cost']; ref[c + '_transport'] = x['transport']; ref[c + '_eff'] = x['eff']
        ref[c + '_deliv'] = x['deliv']; ref[c + '_kWh'] = x['kWh']
    best = min(res, key=lambda c: res[c]['cost'])
    ref['best'] = best
    ref['best_cost'] = res[best]['cost']
    ref['days'] = g['dist'] / g['speed']
    return {'id': cid, 'kind': 'solve', 'inputs': kw, 'ref': ref}


CASES = [
    case('default'),
    case('short_1500', dist=1500),
    case('long_15000', dist=15000),
    case('very_long_25000_slow', dist=25000, speed=500),
    case('zero_distance', dist=0),
    case('cheap_heat', heat_price=10),
    case('heat_from_h2', heat_h2=True),
    case('heat_from_h2_eta07', heat_h2=True, eta_burn=0.7, dist=12000),
    case('expensive_power', elec_price=120, imp_elec=150),
    case('cheap_h2', P_h2=1.5, dist=10000),
    case('lh2_low_boiloff', lh2_bo_day=0.05, dist=15000),
    case('lh2_cheap_liquefaction', lh2_conv_kWh=6, lh2_conv_eur=0.5, dist=8000),
    case('nh3_direct_use_like', nh3_rec_heat=0, nh3_rec_kWh=0, nh3_rec_eur=0, nh3_f_rec=1.0),
    case('lohc_better_recovery', lohc_f_rec=0.99, lohc_rec_heat=9.0),
]

if __name__ == '__main__':
    out = {'tool': 'h2_carriers_compare', 'generator': 'bench-src/ref/gen_h2_carriers_compare.py (Claude, 23.10 run12; backward mass balance per kg delivered)', 'cases': CASES}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'h2_carriers_compare_ref.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(out, fh, indent=1)
    print('wrote', path, len(CASES), 'cases')
