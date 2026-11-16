#!/usr/bin/env python3
"""Reference model for luchtgroepselector.html — written from ASHRAE Handbook Fundamentals
   (2017) chapter 1 and from the energy and mass balances the tool declares, independently
   of the tool's own code. CoolProp 8.0 HAPropsSI is the second, structurally different
   reference used for the crosscheck.
   Usage as a filter: python3 lgs_model.py < answers.json > reference.json
"""
import json, math, sys

from CoolProp.HumidAirProp import HAPropsSI

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




def main():
    payload = json.load(sys.stdin)
    out = []
    for case in payload:
        r = compute(case['answers'])
        r['coolprop'] = coolprop_coils(case['answers'], r)
        out.append({'id': case['id'], 'ref': r})
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
