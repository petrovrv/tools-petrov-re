"""Independent reference for hrs_refuelling (written by Claude from the published method, not a port of the JS).

Hydrogen properties: CoolProp 8.0 'Hydrogen' (normal hydrogen, Leachman et al. 2009 EOS) - an independent implementation of
the EOS that ogh-core.js evaluates. Fill model (single-zone tank, e.g. Monde et al. 2012; SAE J2601:2020 / ISO 19880-1:2020
limits): target density = SOC x rho(NWP, 15 degC); first law for the open tank with throttled inflow
  m1 u1 + Cw (T1 - T0) = m0 u0 + (m1 - m0) h_in,  h_in = h(T_precool, 1.25 NWP)
solved for T1 at fixed density with the Illinois regula-falsi method; time = (p1 - p0) / APRR; precooling duty = m_fill [h(T_amb) - h(T_pc)] at 1.25 NWP.
r3 23.10 (Claude): single station bank at p_bank (no cascade; flow only while p_bank > p_tank, SAE J2601:2020 / ISO 19880-1:2020).
If the full fill ends above p_bank, the end state is found from the end-of-fill temperature T1: an outer Illinois root on T1 with
rho_b = CoolProp density at (T1, p_bank) and the first law m_b u(T1, rho_b) + Cw (T1 - T0) = m0 u0 + (m_b - m0) h_in, m_b = rho_b V.
Usage: python gen_hrs_refuelling.py -> hrs_refuelling_ref.json next to this file.
"""
import json, os
import CoolProp.CoolProp as CP


def illinois(f, a, b, tol=1e-11, itmax=200):
    """Illinois variant of regula falsi (Dowell & Jarratt 1971); bracket [a, b] must change sign."""
    fa, fb = f(a), f(b)
    if fa * fb > 0:
        raise ValueError('no sign change')
    side = 0
    for _ in range(itmax):
        c = (a * fb - b * fa) / (fb - fa)
        fc = f(c)
        if abs(b - a) < tol or fc == 0:
            return c
        if fc * fb > 0:
            b, fb = c, fc
            if side == -1:
                fa *= 0.5
            side = -1
        else:
            a, fa = c, fc
            if side == 1:
                fb *= 0.5
            side = 1
    return c

F = 'Hydrogen'
BASE = dict(cls='H70', V_L=141, p0_MPa=10, T_amb=25, T_pc=-40, aprr=20, soc=100, wall_kJK=30, cop=1.5, fills_day=100)
NWP = {'H70': 70e6, 'H35': 35e6}


def u_TD(T, D):
    return CP.PropsSI('U', 'T', T, 'D', D, F)


def case(cid, **kw):
    g = dict(BASE); g.update(kw)
    nwp = NWP[g['cls']]; mop = 1.25 * nwp
    V = g['V_L'] / 1000.0; T0 = g['T_amb'] + 273.15; Tpc = g['T_pc'] + 273.15
    rho100 = CP.PropsSI('D', 'T', 288.15, 'P', nwp, F)
    rho0 = CP.PropsSI('D', 'T', T0, 'P', g['p0_MPa'] * 1e6, F)
    u0 = CP.PropsSI('U', 'T', T0, 'P', g['p0_MPa'] * 1e6, F)
    h_in = CP.PropsSI('H', 'T', Tpc, 'P', mop, F)
    h_amb = CP.PropsSI('H', 'T', T0, 'P', mop, F)
    rho1 = rho100 * g['soc'] / 100.0
    m0, m1 = rho0 * V, rho1 * V
    rhs = m0 * u0 + (m1 - m0) * h_in
    def T_end(cw):
        return illinois(lambda T: m1 * u_TD(T, rho1) + cw * (T - T0) - rhs, 120.0, 700.0)
    Tad = T_end(0.0); Tw = T_end(g['wall_kJK'] * 1000.0)
    p_ad = CP.PropsSI('P', 'T', Tad, 'D', rho1, F); p_w = CP.PropsSI('P', 'T', Tw, 'D', rho1, F)
    pb = g.get('p_bank', 0) * 1e5; limited = pb > 0 and p_w > pb
    if limited:
        cw = g['wall_kJK'] * 1000.0
        def bal(T):  # first law at the bank-limited end state (T, p_bank)
            rb = CP.PropsSI('D', 'T', T, 'P', pb, F); mb = rb * V
            return mb * u_TD(T, rb) + cw * (T - T0) - (m0 * u0 + (mb - m0) * h_in)
        Tw = illinois(bal, T0 - 60.0, Tw + 5.0)
        rho1 = CP.PropsSI('D', 'T', Tw, 'P', pb, F); m1 = rho1 * V; rhs = m0 * u0 + (m1 - m0) * h_in
        Tad = T_end(0.0); p_w = pb; p_ad = CP.PropsSI('P', 'T', Tad, 'D', rho1, F)
    m_fill = m1 - m0
    t_min = (p_w / 1e6 - g['p0_MPa']) / g['aprr']
    mdot = 1000.0 * m_fill / (60.0 * t_min)
    Q = m_fill * (h_amb - h_in) / 3.6e6
    T_end_C = Tw - 273.15
    okT = T_end_C <= 85.0; okP = p_w <= mop; okM = g['V_L'] > 500 or mdot <= 60.0
    ref = {
        'rho100': rho100, 'm_cap': rho100 * V, 'm0': m0, 'm1': m1, 'm_fill': m_fill, 'soc0': 100.0 * rho0 / rho100,
        'T_ad': Tad - 273.15, 'p_ad_MPa': p_ad / 1e6, 'T_end': T_end_C, 'p_end_MPa': p_w / 1e6,
        't_min': t_min, 'mdot_gs': mdot, 'q_pc_kJkg': (h_amb - h_in) / 1000.0, 'Q_pc_kWh': Q, 'E_chill_kWh': Q / g['cop'],
        'E_chill_kWh_kg': Q / g['cop'] / m_fill, 'kg_day': m_fill * g['fills_day'], 'E_chill_day': Q / g['cop'] * g['fills_day'],
        'okT': okT, 'okP': okP, 'okM': okM, 'pass': okT and okP and okM,
    }
    if 'p_bank' in g:
        ref.update({'p_bank_MPa': pb / 1e6, 'bank_limited': limited, 'soc_end': 100.0 * rho1 / rho100})
    return {'id': cid, 'kind': 'solve', 'inputs': kw, 'ref': ref}


CASES = [
    case('default'),
    case('hot_40', T_amb=40),
    case('cold_0', T_amb=0, p0_MPa=5),
    case('t20_precool', T_pc=-20),
    case('adiabatic_wall0', wall_kJK=0),
    case('big_wall', wall_kJK=80),
    case('soc_95', soc=95),
    case('small_tank_60L', V_L=60, p0_MPa=2, aprr=28),
    case('h35_car', cls='H35', V_L=150, p0_MPa=2, T_pc=-20),
    case('h35_bus', cls='H35', V_L=1500, p0_MPa=5, aprr=10, T_pc=-20),
    case('high_start_50', p0_MPa=50),
    case('fast_ramp', aprr=40),
    case('bank_700_limited', p_bank=700),
    case('bank_900_not_limited', p_bank=900),
]

if __name__ == '__main__':
    out = {'tool': 'hrs_refuelling', 'generator': 'bench-src/ref/gen_hrs_refuelling.py (Claude, 23.10 run12; CoolProp ' + CP.get_global_param_string('version') + ' Leachman H2, Illinois root)', 'cases': CASES}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hrs_refuelling_ref.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(out, fh, indent=1)
    print('wrote', path, len(CASES), 'cases')
