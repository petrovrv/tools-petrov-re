#!/usr/bin/env python3
"""Independent reference for luchtgroepselector.html.

Two halves, graded differently:

  A. NUMERIC — the live calculation behind the questionnaire: psychrometric states,
     air flow, heat recovery, mixing, coil duties with the sensible/latent split and
     condensate, humidification, face velocity and fan power.  Two independent
     references are computed for every psychrometric quantity:

       ref1  the ASHRAE Handbook - Fundamentals (2017) ch. 1 formulation, written out
             here from the equation numbers (5)/(6), (20), (22), (28), (32), (33) and
             the perfect-gas relations, independently of the tool's code;
       ref2  CoolProp 8.0 HAPropsSI (ASHRAE RP-1485 real-fluid model).

     Their mutual deviation is recorded as `crosscheck`.  The tool states that it
     implements the ASHRAE formulation, so ref1 is the grading reference and ref2 is
     the sanity check: where the two disagree by more than the tolerance the case is
     FLAGGED, never graded.

     Air flow, coil duties and fan power are graded against a closed-form energy and
     mass balance written here (Q = m_da (h1 - h2), m_da = V/v, P = V dp / eta), which
     is what the tool claims to implement.

  B. DATA INTEGRITY — the questionnaire itself: schema of every question, profile and
     rule, no dangling reference, and the five lazily loaded language packs against the
     inline Dutch base.  That half is a data-integrity benchmark and is labelled as such.

Output: bench-src/ref/luchtgroepselector_ref.json
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math, os, re

from CoolProp.HumidAirProp import HAPropsSI

OUT = _gp.ref('luchtgroepselector_ref.json')
SITE = _gp.SITE_ROOT

# --------------------------------------------------------------------------- ref1
# ASHRAE Handbook - Fundamentals (2017), chapter 1 "Psychrometrics".
P0 = 101325.0          # Pa
RA = 287.042           # J/(kg K)  dry air gas constant, ASHRAE ch.1
CPA = 1.006            # kJ/(kg K) dry air
CPV = 1.86             # kJ/(kg K) water vapour
HFG = 2501.0           # kJ/kg     latent heat of vaporisation at 0 C


def p_atm(alt=0.0):
    """ASHRAE ch.1 eq. (3): standard atmosphere."""
    return P0 * (1 - 2.25577e-5 * alt) ** 5.2559


def p_ws(t):
    """Saturation pressure over ice (eq. 5, t < 0 C) and over liquid water (eq. 6)."""
    T = t + 273.15
    if t < 0:
        ln = (-5674.5359 / T + 6.3925247 - 9.677843e-3 * T + 6.2215701e-7 * T * T
              + 2.0747825e-9 * T ** 3 - 9.484024e-13 * T ** 4 + 4.1635019 * math.log(T))
    else:
        ln = (-5800.2206 / T + 1.3914993 - 0.048640239 * T + 4.1764768e-5 * T * T
              - 1.4452093e-8 * T ** 3 + 6.5459673 * math.log(T))
    return math.exp(ln)


def w_from_rh(t, rh, p=P0):
    """eq. (20) combined with the definition of relative humidity."""
    pw = max(0.0, min(rh / 100.0, 1.0)) * p_ws(t)
    return 0.621945 * pw / max(p - pw, 1.0)


def rh_from_w(t, w, p=P0):
    pw = p * w / (0.621945 + w)
    return max(0.0, min(100.0, 100.0 * pw / p_ws(t)))


def h_moist(t, w):
    """eq. (30): h = 1.006 t + W (2501 + 1.86 t), kJ per kg dry air."""
    return CPA * t + w * (HFG + CPV * t)


def t_from_h(h, w):
    return (h - w * HFG) / (CPA + CPV * w)


def v_moist(t, w, p=P0):
    """eq. (26): v = Ra T (1 + 1.607858 W) / p, m3 per kg dry air."""
    return RA * (t + 273.15) * (1 + 1.607858 * w) / p


def rho_moist(t, w, p=P0):
    return (1 + w) / v_moist(t, w, p)


def dew_point(t, w, p=P0):
    """Inversion of the saturation curve at the partial pressure of the vapour."""
    pw = p * w / (0.621945 + w)
    if pw <= 0:
        return -100.0
    lo, hi = -80.0, 100.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if p_ws(mid) < pw:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def wet_bulb(t, w, p=P0):
    """eq. (33) solved for the thermodynamic wet-bulb temperature:
       W = ((2501 - 2.326 t*) Ws* - 1.006 (t - t*)) / (2501 + 1.86 t - 4.186 t*)"""
    lo, hi = -60.0, t
    for _ in range(200):
        wb = 0.5 * (lo + hi)
        ws = w_from_rh(wb, 100.0, p)
        wc = ((HFG - 2.326 * wb) * ws - CPA * (t - wb)) / (HFG + CPV * t - 4.186 * wb)
        if wc > w:
            hi = wb
        else:
            lo = wb
    return 0.5 * (lo + hi)


def state(t, rh, p=P0):
    w = w_from_rh(t, rh, p)
    return dict(t=t, rh=rh, w=w, h=h_moist(t, w), v=v_moist(t, w, p), rho=rho_moist(t, w, p),
                td=dew_point(t, w, p), twb=wet_bulb(t, w, p), p=p)


def state_w(t, w, p=P0):
    return dict(t=t, rh=rh_from_w(t, w, p), w=w, h=h_moist(t, w), v=v_moist(t, w, p),
                rho=rho_moist(t, w, p), td=dew_point(t, w, p), twb=wet_bulb(t, w, p), p=p)


def mix(s1, m1, s2, m2, p=P0):
    m = m1 + m2
    if m <= 0:
        return s1
    w = (s1['w'] * m1 + s2['w'] * m2) / m
    hh = (s1['h'] * m1 + s2['h'] * m2) / m
    return state_w(t_from_h(hh, w), w, p)


# --------------------------------------------------------------------------- ref2
def cp_state(t, rh, p=P0):
    """CoolProp HAPropsSI, ASHRAE RP-1485 real-fluid humid-air model."""
    T = t + 273.15
    R = max(min(rh / 100.0, 1.0), 0.0)
    w = HAPropsSI('W', 'T', T, 'P', p, 'R', R)
    return dict(
        w=w,
        h=HAPropsSI('Hha', 'T', T, 'P', p, 'W', w) / 1000.0,   # kJ per kg dry air
        v=HAPropsSI('Vda', 'T', T, 'P', p, 'W', w),            # m3 per kg dry air
        td=HAPropsSI('D', 'T', T, 'P', p, 'W', w) - 273.15,
        twb=HAPropsSI('B', 'T', T, 'P', p, 'W', w) - 273.15,
        pws=HAPropsSI('P_w', 'T', T, 'P', p, 'R', 1.0),
    )


def cp_state_w(t, w, p=P0):
    T = t + 273.15
    return dict(
        h=HAPropsSI('Hha', 'T', T, 'P', p, 'W', w) / 1000.0,
        v=HAPropsSI('Vda', 'T', T, 'P', p, 'W', w),
        td=HAPropsSI('D', 'T', T, 'P', p, 'W', w) - 273.15,
        twb=HAPropsSI('B', 'T', T, 'P', p, 'W', w) - 273.15,
        rh=HAPropsSI('R', 'T', T, 'P', p, 'W', w) * 100.0,
    )


rep = {'psychrometrics': [], 'cases': [], 'crosscheck': {}}

# --------------------------------------------------------------- 1. psychrometrics
GRID = [(-20, 90, 0), (-15, 90, 0), (-8, 90, 0), (-5, 80, 0), (0, 80, 0), (5, 70, 0),
        (10, 60, 0), (15, 55, 0), (18, 50, 0), (20, 40, 0), (21, 35, 0), (22, 50, 0),
        (24, 60, 0), (25, 55, 0), (26, 45, 0), (28, 50, 0), (30, 40, 0), (32, 55, 0),
        (35, 30, 0), (38, 25, 0), (40, 20, 0), (16, 92, 0), (12, 95, 0), (30, 70, 0),
        (20, 50, 500), (20, 50, 1000), (25, 55, 1500), (30, 40, 2000)]
worst = {}
for t, rh, alt in GRID:
    p = p_atm(alt)
    s1 = state(t, rh, p)
    s2 = cp_state(t, rh, p)
    ent = {'t': t, 'rh': rh, 'altitude': alt, 'p': p, 'ashrae': s1, 'coolprop': s2}
    dev = {}
    dev['w'] = abs(s1['w'] - s2['w']) / max(abs(s2['w']), 1e-9)
    dev['h_abs_kJ_per_kg'] = abs(s1['h'] - s2['h'])       # absolute: h passes through zero
    dev['v'] = abs(s1['v'] - s2['v']) / max(abs(s2['v']), 1e-9)
    dev['td'] = abs(s1['td'] - s2['td'])
    dev['twb'] = abs(s1['twb'] - s2['twb'])
    dev['pws'] = abs(p_ws(t) - s2['pws']) / max(s2['pws'], 1e-9)
    ent['crosscheck'] = dev
    for k, x in dev.items():
        worst[k] = max(worst.get(k, 0.0), x)
    rep['psychrometrics'].append(ent)
rep['crosscheck']['psychrometrics_worst'] = worst

# --------------------------------------------------------------- 2. full cases
DEF = dict(
    cnd_altitude=0, cnd_oda_t_w=-8, cnd_oda_rh_w=90, cnd_oda_t_s=30, cnd_oda_rh_s=40,
    cnd_ida_t_w=21, cnd_ida_rh_w=35, cnd_ida_t_s=25, cnd_ida_rh_s=55,
    air_t_sup_w=20, air_t_sup_s=16, air_rh_leave=92,
)
WTW_DEFAULT_ETA = {'plaat_kruis': 55, 'plaat_tegenstroom': 80, 'rotor_cond': 78,
                   'rotor_sorptie': 78, 'twincoil': 50, 'warmtepijp': 55, 'geen': 0}
WTW_MOISTURE = {'plaat_kruis': False, 'plaat_tegenstroom': False, 'rotor_cond': False,
                'rotor_sorptie': True, 'twincoil': False, 'warmtepijp': False, 'geen': False}


def num(A, k, d=0.0):
    v = A.get(k)
    if v is None or v == '':
        return d
    try:
        return float(str(v).replace(',', '.'))
    except ValueError:
        return d


def compute(A):
    """Independent re-implementation of the tool's stated model, from the energy and
       mass balances it declares, using the ASHRAE psychrometrics above."""
    out = {}
    p = p_atm(num(A, 'cnd_altitude', 0))
    st = {
        'p': p,
        'odaW': state(num(A, 'cnd_oda_t_w', -8), num(A, 'cnd_oda_rh_w', 90), p),
        'odaS': state(num(A, 'cnd_oda_t_s', 30), num(A, 'cnd_oda_rh_s', 40), p),
        'idaW': state(num(A, 'cnd_ida_t_w', 21), num(A, 'cnd_ida_rh_w', 35), p),
        'idaS': state(num(A, 'cnd_ida_t_s', 25), num(A, 'cnd_ida_rh_s', 55), p),
    }
    out['states'] = st

    # ---- air flow
    basis = A.get('flw_basis', 'personen')
    cand = {}
    cand['personen'] = num(A, 'flw_persons') * num(A, 'flw_q_person', 36)
    cand['oppervlak'] = num(A, 'flw_area') * num(A, 'flw_q_area', 3.6)
    vol = num(A, 'flw_volume') or num(A, 'flw_area') * num(A, 'flw_height', 3)
    cand['voud'] = vol * num(A, 'flw_ach')
    cand['proces'] = num(A, 'flw_process_extract')
    dT = num(A, 'flw_dt_supply', 8)
    cand['last'] = (num(A, 'flw_q_sens') / (1.2 * 1005 * dT)) * 3600 if dT > 0 else 0.0
    supply = num(A, 'flw_supply_override') or cand.get(basis, 0.0) or 0.0
    supply = round(supply)
    bal = A.get('flw_balance', 'gebalanceerd')
    pct = num(A, 'flw_unbalance_pct', 0 if bal == 'gebalanceerd' else 10)
    extract = supply
    if bal == 'overdruk':
        extract = supply * (1 - pct / 100)
    if bal == 'onderdruk':
        extract = supply * (1 + pct / 100)
    extract = round(num(A, 'flw_extract_override') or extract)
    flow = {'basis': basis, 'candidates': cand, 'supply': supply, 'extract': extract,
            'unbalance': supply - extract, 'roomVolume': vol,
            'achResult': (supply / vol) if vol > 0 else None,
            'perPerson': (supply / num(A, 'flw_persons')) if num(A, 'flw_persons') > 0 else None,
            'minPct': num(A, 'flw_min_pct', 100)}
    flow['minFlow'] = round(supply * flow['minPct'] / 100)
    out['flow'] = flow

    # ---- heat recovery
    typ = A.get('wtw_type', 'plaat_tegenstroom')
    active = typ != 'geen' and A.get('wtw_needed') != 'nee'
    eta = num(A, 'wtw_eta', WTW_DEFAULT_ETA.get(typ, 0))
    etaX = num(A, 'wtw_eta_x', 65) if (active and WTW_MOISTURE[typ]) else 0.0
    rec = {'type': typ, 'active': active, 'eta': eta, 'etaX': etaX,
           'moistureTransfer': WTW_MOISTURE[typ]}
    if not active:
        rec['supAfterW'] = st['odaW']
        rec['supAfterS'] = st['odaS']
        rec['frostRisk'] = False
        rec['preheatDeltaT'] = 0.0
        rec['exhaustOut'] = None
    else:
        e, ex = eta / 100.0, etaX / 100.0
        tW = st['odaW']['t'] + e * (st['idaW']['t'] - st['odaW']['t'])
        wW = st['odaW']['w'] + ex * (st['idaW']['w'] - st['odaW']['w'])
        rec['supAfterW'] = state_w(tW, wW, p)
        tEha = st['idaW']['t'] - e * (st['idaW']['t'] - st['odaW']['t'])
        rec['exhaustOut'] = tEha
        frost_limit = num(A, 'wtw_frost_limit', -12 if WTW_MOISTURE[typ] else -1)
        rec['frostLimitT'] = frost_limit
        rec['frostRisk'] = tEha < frost_limit
        if rec['frostRisk'] and e > 0:
            oda_min = st['idaW']['t'] - (st['idaW']['t'] - frost_limit) / e
            rec['preheatDeltaT'] = max(0.0, oda_min - st['odaW']['t'])
            rec['odaMin'] = oda_min
        else:
            rec['preheatDeltaT'] = 0.0
        if st['odaS']['t'] > st['idaS']['t']:
            tS = st['odaS']['t'] - e * (st['odaS']['t'] - st['idaS']['t'])
            wS = st['odaS']['w'] - ex * (st['odaS']['w'] - st['idaS']['w'])
            rec['supAfterS'] = state_w(tS, wS, p)
            rec['summerRecovery'] = True
        else:
            rec['supAfterS'] = st['odaS']
            rec['summerRecovery'] = False
    out['recovery'] = rec

    # ---- mixing
    share = num(A, 'sec_mixing_pct', 0)
    if A.get('sec_mixing') == 'ja' and share > 0:
        f = share / 100.0
        entryW = mix(rec['supAfterW'], 1 - f, st['idaW'], f, p)
        entryS = mix(rec['supAfterS'], 1 - f, st['idaS'], f, p)
    else:
        entryW, entryS = rec['supAfterW'], rec['supAfterS']
    out['mixed'] = {'winter': entryW, 'summer': entryS, 'share': share}

    # ---- coils: pure energy and mass balance on the dry-air mass flow
    vSup = flow['supply'] / 3600.0
    mW = vSup / entryW['v']
    mS = vSup / entryS['v']
    c = {'mDotW': mW, 'mDotS': mS, 'vSup': vSup}
    c['preheat'] = 0.0
    if rec['preheatDeltaT'] > 0 and (A.get('wtw_frost') or 'voorverwarming') == 'voorverwarming':
        mOda = vSup / st['odaW']['v']
        c['preheat'] = mOda * (CPA + CPV * st['odaW']['w']) * rec['preheatDeltaT']
    tSupW = num(A, 'air_t_sup_w', 20)
    c['heating'] = 0.0 if A.get('air_heat') == 'nee' else \
        max(0.0, mW * (CPA + CPV * entryW['w']) * (tSupW - entryW['t']))
    c['heatLeave'] = state_w(tSupW, entryW['w'], p)
    tSupS = num(A, 'air_t_sup_s', 16)
    if A.get('air_cool') == 'nee':
        c.update(cooling=0.0, coolSens=0.0, coolLat=0.0, condensate=0.0, shr=1.0,
                 dehumidifying=False, coolLeave=entryS)
    else:
        rh_leave = num(A, 'air_rh_leave', 92)
        w_sat_leave = w_from_rh(tSupS, rh_leave, p)
        w_leave = entryS['w']
        if A.get('air_dehum') == 'ja' or entryS['w'] > w_sat_leave:
            w_leave = min(entryS['w'], w_sat_leave)
        if A.get('air_w_leave_override'):
            w_leave = num(A, 'air_w_leave_override') / 1000.0
        leave = state_w(tSupS, w_leave, p)
        c['coolLeave'] = leave
        c['cooling'] = max(0.0, mS * (entryS['h'] - leave['h']))
        c['coolSens'] = max(0.0, mS * (CPA + CPV * entryS['w']) * (entryS['t'] - leave['t']))
        c['coolLat'] = max(0.0, c['cooling'] - c['coolSens'])
        c['condensate'] = max(0.0, mS * (entryS['w'] - w_leave) * 3600.0)
        c['shr'] = c['coolSens'] / c['cooling'] if c['cooling'] > 0 else 1.0
        c['dehumidifying'] = c['coolLat'] > 0.01
    t_reheat = num(A, 'air_t_reheat', 0)
    c['reheat'] = (mS * (CPA + CPV * c['coolLeave']['w']) * (t_reheat - tSupS)
                   if (A.get('air_reheat') == 'ja' and t_reheat > tSupS) else 0.0)
    if A.get('air_humid') and A.get('air_humid') != 'nee':
        rh_min = num(A, 'cnd_ida_rh_min', 35)
        w_target = w_from_rh(num(A, 'cnd_ida_t_w', 21), rh_min, p)
        w_in = c['heatLeave']['w']
        c['humidWater'] = max(0.0, mW * (w_target - w_in) * 3600.0)
        c['humidPower'] = max(0.0, mW * (w_target - w_in) * HFG) if A.get('air_humid') == 'stoom' else 0.0
    else:
        c['humidWater'] = 0.0
        c['humidPower'] = 0.0
    out['coils'] = c

    # ---- geometry (only the parts that are a closed form)
    vt = num(A, 'bat_face_vel_target', 2.2)
    g = {'faceAreaTarget': (vSup / vt) if vt > 0 else 0.0}
    wIn, hIn = num(A, 'cas_face_w'), num(A, 'cas_face_h')
    if wIn > 0 and hIn > 0:
        g['faceW'], g['faceH'] = wIn, hIn
    else:
        ratio = num(A, 'cas_face_ratio', 1.4)
        g['faceW'] = math.sqrt(g['faceAreaTarget'] * ratio)
        g['faceH'] = g['faceAreaTarget'] / max(g['faceW'], 1e-6)
    g['faceArea'] = g['faceW'] * g['faceH']
    g['faceVelocity'] = vSup / g['faceArea'] if g['faceArea'] > 0 else 0.0
    g['faceVelocityExtract'] = (flow['extract'] / 3600.0) / g['faceArea'] if g['faceArea'] > 0 else 0.0
    out['geometry'] = g

    # ---- fan power: P = V dp / eta, and the three SFP definitions
    eta_f = num(A, 'fan_efficiency', 0.62)
    out['fan_inputs'] = {'eta': eta_f, 'espSup': num(A, 'fan_esp_sup', 250),
                         'espExt': num(A, 'fan_esp_ext', 250)}

    # ---- annual energy (degree-day estimate, as declared)
    hours = num(A, 'flw_hours', num(A, 'com_hours', 3000))
    dd = num(A, 'com_degree_days', 2000)
    capacity = vSup * 1.2 * 1.005
    op = min(1.0, hours / 8760.0)
    out['energy'] = {'hours': hours,
                     'heatNoRecovery': capacity * dd * 24 * op,
                     'heatWithRecovery': capacity * dd * 24 * op * (1 - eta / 100.0),
                     'recoverySaving': capacity * dd * 24 * op * (eta / 100.0)}
    return out


def coolprop_coils(A, r):
    """the same coil duties recomputed with CoolProp enthalpies — the crosscheck"""
    p = r['states']['p']
    eW, eS = r['mixed']['winter'], r['mixed']['summer']
    vSup = r['flow']['supply'] / 3600.0
    out = {}
    try:
        vW = HAPropsSI('Vda', 'T', eW['t'] + 273.15, 'P', p, 'W', eW['w'])
        vS = HAPropsSI('Vda', 'T', eS['t'] + 273.15, 'P', p, 'W', eS['w'])
        mW, mS = vSup / vW, vSup / vS
        hW_in = HAPropsSI('Hha', 'T', eW['t'] + 273.15, 'P', p, 'W', eW['w']) / 1000.0
        hW_out = HAPropsSI('Hha', 'T', r['coils']['heatLeave']['t'] + 273.15, 'P', p,
                           'W', r['coils']['heatLeave']['w']) / 1000.0
        if A.get('air_heat') == 'nee':
            out['heating'] = 0.0
        else:
            out['heating'] = max(0.0, mW * (hW_out - hW_in))
        hS_in = HAPropsSI('Hha', 'T', eS['t'] + 273.15, 'P', p, 'W', eS['w']) / 1000.0
        cl = r['coils']['coolLeave']
        hS_out = HAPropsSI('Hha', 'T', cl['t'] + 273.15, 'P', p, 'W', cl['w']) / 1000.0
        out['cooling'] = max(0.0, mS * (hS_in - hS_out))
        out['condensate'] = max(0.0, mS * (eS['w'] - cl['w']) * 3600.0)
    except Exception as exc:                                      # pragma: no cover
        out['error'] = str(exc)
    return out


CASES = [
    ('office_winter_summer', dict(DEF, prj_profile='kantoor', flw_basis='personen',
        flw_persons=120, flw_q_person=36, flw_area=900, flw_height=3,
        wtw_type='plaat_tegenstroom', wtw_eta=80, fan_esp_sup=250, fan_esp_ext=250,
        fan_efficiency=0.62, bat_face_vel_target=2.2, cas_face_ratio=1.4)),
    ('office_area_basis', dict(DEF, flw_basis='oppervlak', flw_area=1200, flw_q_area=4.5,
        flw_height=3.2, wtw_type='plaat_kruis', wtw_eta=55)),
    ('ach_basis', dict(DEF, flw_basis='voud', flw_area=800, flw_height=3, flw_ach=6,
        wtw_type='rotor_cond', wtw_eta=78)),
    ('process_extract_basis', dict(DEF, flw_basis='proces', flw_process_extract=9500,
        wtw_type='geen')),
    ('thermal_load_basis', dict(DEF, flw_basis='last', flw_q_sens=45000, flw_dt_supply=9,
        wtw_type='plaat_tegenstroom', wtw_eta=75)),
    ('overpressure_balance', dict(DEF, flw_basis='personen', flw_persons=80, flw_q_person=40,
        flw_balance='overdruk', flw_unbalance_pct=15)),
    ('underpressure_balance', dict(DEF, flw_basis='personen', flw_persons=80, flw_q_person=40,
        flw_balance='onderdruk', flw_unbalance_pct=12)),
    ('vav_minimum', dict(DEF, flw_basis='personen', flw_persons=200, flw_q_person=36,
        flw_variable='co2', flw_min_pct=35)),
    ('sorption_rotor_moisture', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=4,
        wtw_type='rotor_sorptie', wtw_eta=78, wtw_eta_x=65)),
    ('frost_deep_winter', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=4,
        cnd_oda_t_w=-20, cnd_oda_rh_w=90, wtw_type='plaat_tegenstroom', wtw_eta=85,
        wtw_frost_limit=-1)),
    ('frost_rotor_no_preheat', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=4,
        cnd_oda_t_w=-20, wtw_type='rotor_sorptie', wtw_eta=80, wtw_eta_x=70)),
    ('recirculation_30pct', dict(DEF, flw_basis='personen', flw_persons=150, flw_q_person=36,
        sec_mixing='ja', sec_mixing_pct=30, wtw_type='plaat_tegenstroom', wtw_eta=78)),
    ('hot_humid_dehumidification', dict(DEF, flw_basis='voud', flw_area=666.667, flw_height=3, flw_ach=8,
        cnd_oda_t_s=32, cnd_oda_rh_s=70, air_t_sup_s=12, air_dehum='ja', air_rh_leave=92)),
    ('dehumidify_with_reheat', dict(DEF, flw_basis='voud', flw_area=666.667, flw_height=3, flw_ach=8,
        cnd_oda_t_s=32, cnd_oda_rh_s=70, air_t_sup_s=11, air_dehum='ja',
        air_reheat='ja', air_t_reheat=18)),
    ('steam_humidifier', dict(DEF, flw_basis='personen', flw_persons=100, flw_q_person=36,
        air_humid='stoom', cnd_ida_rh_min=40, cnd_ida_t_w=22)),
    ('adiabatic_humidifier', dict(DEF, flw_basis='personen', flw_persons=100, flw_q_person=36,
        air_humid='adiabatisch', cnd_ida_rh_min=40)),
    ('no_heating_no_cooling', dict(DEF, flw_basis='voud', flw_area=500, flw_height=3, flw_ach=5,
        air_heat='nee', air_cool='nee')),
    ('altitude_1500m', dict(DEF, cnd_altitude=1500, flw_basis='voud', flw_area=666.667, flw_height=3,
        flw_ach=6, cnd_oda_t_s=30, cnd_oda_rh_s=45)),
    ('altitude_2500m', dict(DEF, cnd_altitude=2500, flw_basis='voud', flw_area=666.667, flw_height=3,
        flw_ach=6)),
    ('high_face_velocity', dict(DEF, flw_basis='voud', flw_area=1666.67, flw_height=3, flw_ach=10,
        bat_face_vel_target=3.2, cas_face_ratio=1.8)),
    ('fixed_casing_face', dict(DEF, flw_basis='voud', flw_area=1333.33, flw_height=3, flw_ach=8,
        cas_face_w=1.9, cas_face_h=1.3)),
    ('low_fan_efficiency', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=6,
        fan_efficiency=0.45, fan_esp_sup=400, fan_esp_ext=350)),
    ('high_esp', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=6,
        fan_esp_sup=700, fan_esp_ext=600, fan_efficiency=0.68)),
    ('degree_day_energy', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=6,
        com_degree_days=2600, flw_hours=4000, wtw_type='plaat_tegenstroom', wtw_eta=82)),
    ('no_recovery', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=6, wtw_type='geen')),
    ('recovery_switched_off', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=6,
        wtw_type='plaat_tegenstroom', wtw_needed='nee')),
    ('summer_free_cooling', dict(DEF, flw_basis='voud', flw_area=1000, flw_height=3, flw_ach=6,
        cnd_oda_t_s=22, cnd_ida_t_s=25, wtw_type='plaat_tegenstroom', wtw_eta=80)),
    ('supply_override', dict(DEF, flw_basis='personen', flw_persons=10, flw_q_person=36,
        flw_supply_override=12000, flw_extract_override=11000)),
    ('leaving_humidity_override', dict(DEF, flw_basis='voud', flw_area=666.667, flw_height=3, flw_ach=8,
        cnd_oda_t_s=31, cnd_oda_rh_s=60, air_t_sup_s=14, air_w_leave_override=8.5)),
    ('cold_dry_climate', dict(DEF, flw_basis='voud', flw_area=833.333, flw_height=3, flw_ach=5,
        cnd_oda_t_w=-25, cnd_oda_rh_w=70, cnd_oda_t_s=24, cnd_oda_rh_s=35,
        wtw_type='plaat_tegenstroom', wtw_eta=85)),
]
for cid, A in CASES:
    r = compute(A)
    cp = coolprop_coils(A, r)
    dev = {}
    for k in ('heating', 'cooling', 'condensate'):
        if k in cp and r['coils'].get(k) is not None:
            dev[k] = abs(r['coils'][k] - cp[k]) / max(abs(cp[k]), 1e-6) if cp[k] else abs(r['coils'][k] - cp[k])
    rep['cases'].append({'id': cid, 'answers': A, 'ref': r, 'coolprop': cp, 'crosscheck': dev})
rep['crosscheck']['coil_worst'] = {
    k: max((c['crosscheck'].get(k, 0.0) for c in rep['cases']), default=0.0)
    for k in ('heating', 'cooling', 'condensate')}

# --------------------------------------------------------------- 3. language packs
BASEDIR = SITE
packs = {}
for code in ['en', 'de', 'fr', 'ru', 'uk']:
    f = os.path.join(BASEDIR, 'luchtgroepselector-lang-%s.json' % code)
    packs[code] = json.load(open(f, encoding='utf8'))


def flatten(o, prefix=''):
    out = {}
    if isinstance(o, dict):
        for k, v in o.items():
            out.update(flatten(v, prefix + ('.' if prefix else '') + str(k)))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            out.update(flatten(v, prefix + '[%d]' % i))
    else:
        out[prefix] = o
    return out


rep['language_packs'] = {'codes': list(packs), 'keys': {c: len(flatten(p)) for c, p in packs.items()}}

json.dump(rep, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('wrote', OUT)
print('psychrometric crosscheck (ASHRAE vs CoolProp):')
for k, v in worst.items():
    print('   %-5s worst %.4g %s' % (k, v, 'K' if k in ('td', 'twb') else 'relative'))
print('coil crosscheck worst:', rep['crosscheck']['coil_worst'])
print('cases', len(rep['cases']), 'language packs', rep['language_packs']['keys'])
