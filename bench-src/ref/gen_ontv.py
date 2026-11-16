#!/usr/bin/env python3
"""
Independent reference for ontvochtiging.html (Dehumidification Method Selector).

Written from the psychrometric mass and energy balances, not from the tool's code.

Property source (primary): ASHRAE Handbook-Fundamentals (2017) Ch.1 -
  saturation pressure over water Eq.(6) and over ice Eq.(5); humidity ratio
  Eq.(20); specific enthalpy Eq.(30) h = 1.006 t + W(2501 + 1.86 t) kJ/kg(da);
  moist-air density from the ideal-gas mixture, Eq.(26)/(28).
Property source (cross-check): CoolProp 8.0.0 HAPropsSI (ASHRAE RP-1485 real
  gas).  Recorded as `crosscheck`, never used to grade the tool.

Balances implemented here:
  room moisture balance      mda (x_room - x_sup) = internal load
  unit water removal         mw = mda (x1 - x_sup)
  cooling coil               q = mda[(h1 - h2) - (x1 - x2) h_w]      (ASHRAE
                             Ch.1, energy balance on a wet coil; h_w is the
                             enthalpy of the water leaving the coil - liquid
                             above 0 C, ice below)
  reheat                     q = mda (h3 - h2)
  desiccant rotor            process side isenthalpic to x_sup;
                             regeneration q = mreg (h(treg,x_out) - h(tout,x_out));
                             moisture balance mreg (x_regout - x_out) = mw
  heat pump                  q_cond = q_evap + P_comp ; t3 from the sensible
                             balance on the condenser
"""
import math, json

RA = 287.042
RATIO = 0.621945
CPA, CPV, HFG = 1.006, 1.86, 2501.0
CW, CICE, HFUS = 4.186, 2.05, 333.6


def pws(t):
    """ASHRAE F-2017 Ch.1 Eq.(5) over ice, Eq.(6) over liquid water. Pa"""
    K = t + 273.15
    if K <= 0:
        return 1e-9
    if t >= 0:
        C = (-5800.2206, 1.3914993, -0.048640239, 4.1764768e-5,
             -1.4452093e-8, 6.5459673)
        return math.exp(C[0] / K + C[1] + C[2] * K + C[3] * K * K
                        + C[4] * K ** 3 + C[5] * math.log(K))
    D = (-5674.5359, 6.3925247, -0.009677843, 6.2215701e-7, 2.0747825e-9,
         -9.484024e-13, 4.1635019)
    return math.exp(D[0] / K + D[1] + D[2] * K + D[3] * K * K + D[4] * K ** 3
                    + D[5] * K ** 4 + D[6] * math.log(K))


def x_from_pv(pv, p):
    q = min(max(pv, 0.0), p * 0.999999)
    return RATIO * q / (p - q)


def pv_from_x(x, p):
    q = max(x, 0.0)
    return p * q / (RATIO + q)


def satx(t, p):
    return x_from_pv(min(pws(t), p * 0.999), p)


def td_from_x(x, p):
    """dew/frost point: invert pws, bisection (no closed form used)"""
    pv = pv_from_x(x, p)
    if pv <= pws(-100):
        return -100.0
    if pv >= pws(100):
        return 100.0
    lo, hi = -100.0, 100.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if pws(mid) < pv:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def h(t, x):
    return CPA * t + x * (HFG + CPV * t)


def t_from_hx(hh, x):
    return (hh - HFG * x) / (CPA + CPV * x)


def rho_da(t, x, p):
    return (p - pv_from_x(x, p)) / (RA * (t + 273.15))


def rh_from_x(t, x, p):
    s = pws(t)
    return 0.0 if s <= 0 else pv_from_x(x, p) / s


def hw(ts):
    """enthalpy of the water leaving the coil, kJ/kg, datum = liquid at 0 C"""
    return CW * ts if ts >= 0 else (-HFUS + CICE * ts)


# ---------------------------------------------------------------- load model
def load(P, tdreq, scale=1.0):
    p = P['press'] * 1000.0
    pv_out = min(P['rhout'] / 100.0 * pws(P['tout']), p * 0.98)
    x_out = x_from_pv(pv_out, p)
    x_room = satx(tdreq, p)
    rho_out = rho_da(P['tout'], x_out, p)
    rho_room = rho_da(P['troom'], x_room, p)
    mda = P['flow'] / 3600.0 * rho_room
    phi = P['phi'] / 100.0
    L = dict(p=p, x_out=x_out, x_room=x_room, mda=mda, phi=phi, tdreq=tdreq)
    L['people'] = scale * P['np'] * P['gp'] / 1000.0 / 3600.0
    L['prod'] = scale * P['prod'] / 3600.0
    L['leak'] = scale * P['ach'] * P['vol'] / 3600.0 * rho_out * (x_out - x_room)
    L['door'] = scale * P['adoor'] * P['kdoor'] * (P['dopen'] / 60.0) * rho_out * (x_out - x_room)
    L['make'] = mda * phi * (x_out - x_room)
    L['internal'] = L['people'] + L['prod'] + L['leak'] + L['door']
    L['x_sup'] = x_room - L['internal'] / mda
    L['x1'] = (1 - phi) * x_room + phi * x_out
    L['t1'] = (1 - phi) * P['troom'] + phi * P['tout']
    L['mw'] = mda * (L['x1'] - L['x_sup'])
    L['total'] = L['internal'] + L['make']
    L['h1'] = h(L['t1'], L['x1'])
    L['h3'] = h(P['troom'], max(L['x_sup'], 0.0))
    L['td_sup'] = td_from_x(L['x_sup'], p) if L['x_sup'] > 0 else -100.0
    L['above'] = tdreq > P['troom'] + 1e-9
    L['ok'] = (L['x_sup'] > 0) and (L['mw'] > 0) and not L['above']
    return L


# ---------------------------------------------------------------- coil
def coil(P, L, surf_limit, condensate=True):
    p, bf = L['p'], P['bf']
    R = {}
    R['x_floor'] = bf * L['x1']
    R['xs_need'] = (L['x_sup'] - bf * L['x1']) / (1 - bf)
    R['bypass_fail'] = R['xs_need'] <= 1e-9
    R['ts_req'] = -100.0 if R['bypass_fail'] else td_from_x(R['xs_need'], p)
    R['x_ach'] = min(bf * L['x1'] + (1 - bf) * satx(surf_limit, p), L['x1'])
    R['td_ach'] = td_from_x(max(R['x_ach'], 1e-12), p)
    R['limit_fail'] = R['bypass_fail'] or (R['ts_req'] < surf_limit)
    ts = surf_limit if R['limit_fail'] else R['ts_req']
    R['ts'] = ts
    R['t2'] = bf * L['t1'] + (1 - bf) * ts
    R['x2'] = R['x_ach'] if R['limit_fail'] else L['x_sup']
    R['h2'] = h(R['t2'], R['x2'])
    R['mw'] = L['mda'] * (L['x1'] - R['x2'])
    # energy balance on the wet coil, with the condensate/frost carried away
    R['qc'] = L['mda'] * (L['h1'] - R['h2'])
    if condensate:
        R['qc'] -= R['mw'] * hw(ts)
    R['qh'] = L['mda'] * (L['h3'] - R['h2'])
    return R


def cop_cool(t_evap, t_cond, frac):
    dT = max((t_cond + 273.15) - (t_evap + 273.15), 3.0)
    return max(frac * (t_evap + 273.15) / dT, 0.2)


def fan_kw(P, extra):
    return P['flow'] / 3600.0 * (P['dpfan'] + extra) / (P['etafan'] / 100.0) / 1000.0


def src_temp(P, mode):
    return {'elec': 900 if P['s_el'] else -273,
            'gas': 900 if P['s_gas'] else -273,
            'hw': P['thw'] if P['s_hw'] else -273,
            'rec': P['trec'] if P['s_rec'] else -273,
            'cond': 900}.get(mode, -273)


def src_on(P, mode):
    return {'elec': P['s_el'], 'gas': P['s_gas'], 'hw': P['s_hw'],
            'rec': P['s_rec'], 'cond': P['s_el']}.get(mode, False)


def reheat_energy(P, qh, cond_avail):
    m = P['reheat']
    if not src_on(P, m):
        return dict(err='srcoff')
    if src_temp(P, m) < P['troom'] + 10:
        return dict(err='nosrc')
    if m == 'cond':
        d = max(0.0, qh - cond_avail)
        return dict(site=d, el=d)
    if m == 'elec':
        return dict(site=qh, el=qh)
    if m == 'gas':
        return dict(site=qh / 0.9, el=0.0)
    return dict(site=qh, el=0.0)


# ---------------------------------------------------------------- methods
def m_cool(P, L, condensate=True):
    C = coil(P, L, P['adpmin'], condensate)
    R = dict(id='m1', C=C, td_ach=C['td_ach'], ok=False)
    if C['bypass_fail'] or C['limit_fail']:
        R['reason'] = 'limit'
        return R
    te = C['ts_req'] - P['appr']
    cop = cop_cool(te, P['tcond'], P['etac'] / 100.0)
    pcool = C['qc'] / cop
    fan = fan_kw(P, 250)
    RH = reheat_energy(P, C['qh'], C['qc'] + pcool)
    if 'err' in RH:
        R['reason'] = RH['err']
        return R
    R.update(ok=True, qc=C['qc'], qh=C['qh'], mw=C['mw'], ts=C['ts_req'], te=te,
             cop=cop, el=pcool + fan + RH['el'], site=pcool + fan + RH['site'])
    R['e'] = R['site'] / (R['mw'] * 3600.0)
    R['frost'] = C['ts_req'] - P['adpmin']
    return R


def m_freeze(P, L, condensate=True):
    C = coil(P, L, P['tsfzlim'], condensate)
    R = dict(id='m2', C=C, td_ach=C['td_ach'], ok=False)
    if C['bypass_fail'] or C['limit_fail']:
        R['reason'] = 'limit'
        return R
    mw = C['mw']
    frosting = C['ts_req'] < 0
    t_dry = P['mice'] / mw if mw > 1e-12 else 1e9
    t_def = P['tdef'] * 60.0
    if frosting and t_dry < t_def:
        R['reason'] = 'cycle'
        R['t_dry'] = t_dry / 60.0
        return R
    te = C['ts_req'] - P['appr']
    cop = cop_cool(te, P['tcond'], P['etac'] / 100.0)
    pcool = C['qc'] / cop
    e_def = (P['mice'] * (HFUS + CICE * max(0 - C['ts_req'], 0) + CW * 5)
             / (t_dry + t_def) / (P['etadef'] / 100.0)) if frosting else 0.0
    fan = fan_kw(P, 350)
    RH = reheat_energy(P, C['qh'], C['qc'] + pcool)
    if 'err' in RH:
        R['reason'] = RH['err']
        return R
    R.update(ok=True, qc=C['qc'], qh=C['qh'] + e_def, mw=mw, ts=C['ts_req'],
             te=te, cop=cop, e_def=e_def, t_dry=t_dry / 60.0,
             el=pcool + fan + e_def + RH['el'],
             site=pcool + fan + e_def + RH['site'])
    R['e'] = R['site'] / (R['mw'] * 3600.0)
    R['frost'] = C['ts_req'] - P['tsfzlim']
    return R


def m_desiccant(P, L, condensate=True):
    p = L['p']
    td_floor = min(-10.0, max(-75.0, -35 - 0.75 * (P['treg'] - 80)))
    x_floor = satx(td_floor, p)
    x_ideal = x_floor + (1 - P['etarot']) * (L['x1'] - x_floor)
    x_rot = max(x_ideal + (P['carry'] / 100.0) * (L['x1'] - x_ideal), 1e-9)
    R = dict(id='m3', ok=False, td_ach=td_from_x(x_rot, p), x_rot=x_rot,
             td_floor=td_floor)
    if x_rot > L['x_sup']:
        R['reason'] = 'floor'
        return R
    if not src_on(P, P['regsrc']) or src_temp(P, P['regsrc']) < P['treg']:
        R['reason'] = 'src'
        return R
    mw = L['mda'] * (L['x1'] - L['x_sup'])
    eff = max(1 - P['purge'] / 100.0, 1e-6)
    need = max(mw, 0.0) / (P['dxreg'] / 1000.0)
    tot = need / eff
    fmin, fmax = P['fregmin'] / 100.0 * L['mda'], P['fregmax'] / 100.0 * L['mda']
    if fmin > fmax:
        R['reason'] = 'regrng'
        return R
    if tot > fmax:
        R['reason'] = 'regmax'
        return R
    m_reg = min(max(tot, min(fmin, fmax)), fmax)
    dx_reg = mw / m_reg
    h_reg_in = h(P['treg'], L['x_out'])
    q_reg = m_reg * (h_reg_in - h(P['tout'], L['x_out']))
    x_reg_out = L['x_out'] + dx_reg
    t_reg_ex = t_from_hx(h_reg_in, x_reg_out)
    rh_ex = rh_from_x(t_reg_ex, x_reg_out, p)
    if rh_ex > 1:
        R['reason'] = 'regsat'
        return R
    t2r = t_from_hx(L['h1'], L['x_sup'])
    q_post = L['mda'] * (h(t2r, L['x_sup']) - L['h3'])
    te_post = P['troom'] - 8 - P['appr']
    cop_post = cop_cool(te_post, P['tcond'], P['etac'] / 100.0)
    p_post = q_post / cop_post if q_post > 0 else 0.0
    fan = fan_kw(P, 450) + m_reg / max(L['mda'], 1e-9) * fan_kw(P, 300)
    reg_site = q_reg / 0.9 if P['regsrc'] == 'gas' else q_reg
    R.update(ok=True, qc=max(q_post, 0.0), qh=q_reg, mw=mw, m_reg=m_reg,
             dx_reg=dx_reg, t_reg_ex=t_reg_ex, rh_ex=rh_ex, t2r=t2r,
             el=p_post + fan + (q_reg if P['regsrc'] == 'elec' else 0.0),
             site=p_post + fan + reg_site,
             water_balance=m_reg * (x_reg_out - L['x_out']) - mw)
    R['e'] = R['site'] / (R['mw'] * 3600.0)
    return R


def m_heatpump(P, L, condensate=True):
    C = coil(P, L, P['tehp'], condensate)
    R = dict(id='m4', C=C, td_ach=C['td_ach'], ok=False)
    if C['bypass_fail'] or C['limit_fail']:
        R['reason'] = 'limit'
        return R
    te = C['ts_req'] - P['appr']
    cpm = CPA + CPV * max(L['x_sup'], 0.0)
    pc, t3 = C['qc'] / 3.0, P['troom']
    for _ in range(12):
        tc = t3 + 12
        cop = cop_cool(te, tc, P['etachp'] / 100.0)
        pc = C['qc'] / cop
        t3 = C['t2'] + (C['qc'] + pc) / (L['mda'] * cpm)
    fan = fan_kw(P, 250)
    R.update(ok=True, qc=C['qc'], qh=C['qc'] + pc, mw=C['mw'], ts=C['ts_req'],
             te=te, t3=t3, pc=pc, el=pc + fan, site=pc + fan)
    R['e'] = R['site'] / (R['mw'] * 3600.0)
    R['frost'] = C['ts_req'] - P['tehp']
    return R


METHODS = [m_cool, m_freeze, m_desiccant, m_heatpump]


def run_all(P, tdreq=None, scale=1.0, condensate=True):
    L = load(P, P['tdreq'] if tdreq is None else tdreq, scale)
    if not L['ok']:
        return L, [dict(id='m%d' % (i + 1), ok=False, reason='load')
                   for i in range(4)]
    return L, [f(P, L, condensate) for f in METHODS]
