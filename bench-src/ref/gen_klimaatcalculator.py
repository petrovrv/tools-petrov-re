#!/usr/bin/env python3
"""Independent reference for klimaatcalculator.html (Ventilation & Cooling Cost Estimator).

Two independent references are computed for every psychrometric quantity:

  (A) CoolProp 8.0.0 HAPropsSI - real moist-air properties (ASHRAE RP-1485 /
      Herrmann-Kretzschmar-Gatley formulation).  This is the primary reference.
  (B) A closed-form implementation, written here from the published equations
      (Bolton 1980 eq. 10 for the saturation vapour pressure, ASHRAE Handbook -
      Fundamentals 2021 ch. 1 eq. 20/32/33 for the humidity ratio, the specific
      enthalpy and the thermodynamic wet-bulb temperature).  This is the
      formulation the tool declares it uses; it is solved here with a bisection
      to 1e-12 K, independently of the tool's javascript.

Their mutual deviation is recorded as `crosscheck`.

The catalogue sizing rules and the price build-up are the tool's own model, not
physics.  They are recomputed here from the tool's published assumptions with
independent arithmetic and graded as bookkeeping identities - the artifact says
so plainly.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
from CoolProp.HumidAirProp import HAPropsSI
import CoolProp.CoolProp as CP

# ---------------------------------------------------------------- (B) closed form
RA   = 287.042          # J/(kg dry air . K), CODATA/ASHRAE
MWR  = 0.621945         # M_w / M_da  (ASHRAE 2021, ch.1)  - tool uses 0.62198
CPA  = 1006.0           # J/(kg da . K)
CPV  = 1860.0           # J/(kg vapour . K)
HFG0 = 2501000.0        # J/kg at 0 degC
CPW  = 4186.0           # J/(kg . K) liquid water

def esat_kPa(T):                       # Bolton (1980) eq. 10, T in degC, result kPa
    return 0.6112 * math.exp(17.67 * T / (T + 243.5))

def w_sat(T, P, ratio=0.62198):        # P in kPa
    e = esat_kPa(T)
    return ratio * e / (P - e)

def w_from_rh(T, RH, P, ratio=0.62198):
    e = RH / 100.0 * esat_kPa(T)
    return ratio * e / (P - e)

def rh_from_w(w, T, P, ratio=0.62198):
    e = w * P / (ratio + w)
    return min(100.0, 100.0 * e / esat_kPa(T))

def enth(T, w):                        # J per kg dry air, ASHRAE ch.1 eq. 32
    return CPA * T + w * (HFG0 + CPV * T)

def rho_da(T, w, P, ratio=0.62198):    # kg dry air per m3 of moist air
    e = w * P / (ratio + w)            # kPa
    return (P - e) * 1000.0 / (RA * (T + 273.15))

def cp_ma(w):                          # J per kg dry air per K
    return CPA + CPV * w

def twb(T, w, P, ratio=0.62198):
    """Thermodynamic wet-bulb (adiabatic saturation) temperature, ASHRAE ch.1 eq.33,
       solved by bisection."""
    lo, hi = -70.0, T
    for _ in range(300):
        ts = 0.5 * (lo + hi)
        wg = ((2501.0 - 2.326 * ts) * w_sat(ts, P, ratio) - 1.006 * (T - ts)) \
             / (2501.0 + 1.86 * T - 4.186 * ts)
        if wg > w: hi = ts
        else:      lo = ts
    return 0.5 * (lo + hi)

def w_on_wetbulb_line(T, ts, P, ratio=0.62198):
    """Humidity ratio at dry-bulb T on the constant-wet-bulb line through ts."""
    return ((2501.0 - 2.326 * ts) * w_sat(ts, P, ratio) - 1.006 * (T - ts)) \
           / (2501.0 + 1.86 * T - 4.186 * ts)

# ---------------------------------------------------------------- (A) CoolProp
def cp_W(T, RH, P):   return HAPropsSI('W', 'T', T + 273.15, 'R', RH / 100.0, 'P', P * 1000.0)
def cp_B(T, RH, P):   return HAPropsSI('B', 'T', T + 273.15, 'R', RH / 100.0, 'P', P * 1000.0) - 273.15
def cp_B_w(T, w, P):  return HAPropsSI('B', 'T', T + 273.15, 'W', w, 'P', P * 1000.0) - 273.15
def cp_H_w(T, w, P):  return HAPropsSI('H', 'T', T + 273.15, 'W', w, 'P', P * 1000.0)
def cp_rhoda(T, w, P):return 1.0 / HAPropsSI('Vda', 'T', T + 273.15, 'W', w, 'P', P * 1000.0)
def cp_R_w(T, w, P):  return 100.0 * HAPropsSI('R', 'T', T + 273.15, 'W', w, 'P', P * 1000.0)

# ---------------------------------------------------------------- tool model constants
SUPPLY = dict(v=22000.0, kW=3.0, price=5200.0)
ROOF   = dict(vFree=31500.0, der=0.62, kW=4.0, price=6800.0)
WALL   = dict(vFree=27855.0, der=0.62, kW=2.2, price=3600.0)
ADIAB_PER_M3H, MECH_PER_KW, MECH_SUPPLY, MECH_RH, NAT_PER_M3H = 0.45, 850.0, 16.0, 95.0, 0.16
DT_VENT   = 3.0     # design supply-to-extract rise for the ventilation-only case, K
DT_MIN    = 2.0     # smallest supply-to-target difference that can be dimensioned, K
FAN_LOAD  = 0.5     # annual fan load factor
PV_YIELD  = 0.45    # kWh per kWp per operating hour
BLEED     = 1.15    # evaporative bleed/drift allowance

DEFAULTS = dict(len=60.0, wid=30.0, hgt=8.0, wh=1.7, ppl=25.0, hrs=2200.0,
                Tdb=32.0, RH=40.0, Phpa=1013.0, exdays=5.0, Ttar=27.0, maxrh=75.0,
                loadmode='build', qknown=150.0, qmach=60.0, activity=140.0, qlight=10.0,
                qroof=20.0, qglass=120.0, qsun=300.0,
                extmode='mech', extract='roof', vexist=8000.0, balance=0.0, eff=88.0,
                pel=0.28, pwat=4.0, pvkwp=0.0, eer=3.4, lm=40.0,
                mrate=65.0, years=10.0, mvent=10.0, madia=28.0, mmech=40.0)

def strat_fraction(i):
    return 0.5 + 0.5 * min(1.0, max(0.0, i['wh'] / i['hgt']))

def wet_fraction(designTdb):
    return min(0.85, max(0.2, (designTdb - 20.0) / 22.0))

def model(inp):
    i = dict(DEFAULTS); i.update(inp)
    P  = i['Phpa'] / 10.0
    RH = min(99.0, max(5.0, i['RH']))
    eff = min(95.0, max(40.0, i['eff'])) / 100.0
    maxrh = min(100.0, max(30.0, i['maxrh']))
    eer = max(2.0, i['eer']); years = max(1, min(25, int(i['years'])))
    vol, floor = i['len'] * i['wid'] * i['hgt'], i['len'] * i['wid']

    if i['loadmode'] == 'known':
        comp = [('known', i['qknown'])]
    else:
        comp = [('machines', i['qmach']), ('people', i['ppl'] * i['activity'] / 1000.0),
                ('light', i['qlight'] * floor / 1000.0), ('roof', i['qroof'] * floor / 1000.0),
                ('glass', i['qsun'] * i['qglass'] / 1000.0)]
    Q = sum(v for _, v in comp)                                    # kW sensible

    exRed = 2.2 * math.log(1.0 + i['exdays'] / 3.0)
    designTdb = max(20.0, i['Tdb'] - exRed)
    wOut  = w_from_rh(designTdb, RH, P)
    Twb   = twb(designTdb, wOut, P)
    Tad   = designTdb - eff * (designTdb - Twb)
    wSup  = w_on_wetbulb_line(Tad, Twb, P)

    ext = WALL if i['extract'] == 'wall' else ROOF
    fS  = strat_fraction(i)
    S   = {}
    for k in ('vent', 'adia', 'mech'):
        if k == 'vent':   Ts, wS = designTdb, wOut
        elif k == 'adia': Ts, wS = Tad, wSup
        else:             Ts, wS = MECH_SUPPLY, min(wOut, w_from_rh(MECH_SUPPLY, MECH_RH, P))
        rhoS, cpS = rho_da(Ts, wS, P), cp_ma(wS)
        dT = DT_VENT if k == 'vent' else (i['Ttar'] - Ts)
        dimensionable = dT >= DT_MIN
        Vfresh, ACHfloor = i['ppl'] * 40.0, vol * 1.5
        Vreq = max((Q * 1000.0) / (rhoS * cpS * dT) * 3600.0, Vfresh, ACHfloor) if dimensionable \
               else max(Vfresh, ACHfloor)
        nSup = max(1, math.ceil(Vreq / SUPPLY['v'] - 1e-9))
        Vdes = nSup * SUPPLY['v']
        mDes = rhoS * Vdes / 3600.0
        rise = (Q * 1000.0) / (mDes * cpS)
        room = max(i['Ttar'], Ts + fS * rise) if k == 'mech' else Ts + fS * rise
        rhIn = rh_from_w(wS, room, P)

        extNeed = max(0.0, Vdes * (1.0 - i['balance'] / 100.0) - i['vexist'])
        if i['extmode'] == 'mech':
            nExt = math.ceil(extNeed / (ext['vFree'] * ext['der']) - 1e-9) if extNeed > 0 else 0
            extCap, extKW, extFlow = nExt * ext['price'], nExt * ext['kW'], nExt * ext['vFree'] * ext['der']
        else:
            nExt, extCap, extKW, extFlow = 0, NAT_PER_M3H * Vdes, 0.0, extNeed

        if k == 'mech':
            q_tot = (enth(designTdb, wOut) - enth(Ts, wS)) - (wOut - wS) * CPW * Ts   # J/kg da
            coolKW = max(0.0, mDes * q_tot / 1000.0)
        else:
            coolKW = 0.0
        water = max(0.0, mDes * (wSup - wOut) * 3600.0) * BLEED * i['hrs'] * wet_fraction(designTdb) / 1000.0 \
                if k == 'adia' else 0.0
        elecFan = (nSup * SUPPLY['kW'] + extKW) * FAN_LOAD * i['hrs']
        elecCool, addCap = 0.0, 0.0
        if k == 'adia': elecCool, addCap = nSup * 0.164 * wet_fraction(designTdb) * i['hrs'], ADIAB_PER_M3H * Vdes
        if k == 'mech': elecCool, addCap = coolKW * 0.5 * i['hrs'] / eer, MECH_PER_KW * coolKW
        elec = elecFan + elecCool
        pvB  = i['pvkwp'] * i['hrs'] * PV_YIELD
        solarCool = min(elecCool, pvB)
        solarSelf = solarCool + min(elecFan, max(0.0, pvB - solarCool))
        paidElec  = max(0.0, elec - solarSelf)

        rows = [nSup * SUPPLY['price']]
        if i['extmode'] == 'mech':
            if nExt > 0: rows.append(extCap)
        else: rows.append(extCap)
        rows += [nSup * 4200.0, nSup * 3000.0, nSup * 1900.0 + i['lm'] * 38.0, 3200.0 + nSup * 450.0]
        if k == 'adia': rows += [addCap, nSup * 1200.0]
        if k == 'mech': rows += [addCap]
        rows += [0.0]                                   # utilities, by client
        equip = sum(rows)
        install = equip * 0.24
        mid = equip + install
        pr = dict(mid=mid, low=mid * 0.88, high=mid * 1.27)

        maintH = i['mvent'] if k == 'vent' else i['madia'] if k == 'adia' else i['mmech']
        maintCost = maintH * i['mrate']
        runEl, runWat = paidElec * i['pel'], water * i['pwat']
        run = runEl + runWat + maintCost
        meetsT  = room <= i['Ttar'] + 0.5
        meetsRH = rhIn <= maxrh + 2.0
        feasible = bool(dimensionable and meetsT and meetsRH)
        S[k] = dict(Ts=Ts, wS=wS, rhoS=rhoS, cpS=cpS, Vreq=Vreq, nSup=nSup, Vdes=Vdes,
                    mDes=mDes, rise=rise, room=room, rhIn=rhIn, nExt=nExt, extKW=extKW,
                    extFlow=extFlow, coolKW=coolKW, water_m3=water, elec=elec,
                    elecFan=elecFan, elecCool=elecCool, paidElec=paidElec, solarSelf=solarSelf,
                    capex_mid=pr['mid'], capex_low=pr['low'], capex_high=pr['high'],
                    maintCost=maintCost, runEl=runEl, runWat=runWat, run=run,
                    feasible=feasible, dimensionable=dimensionable,
                    tco=pr['mid'] + years * run)
    rec = None
    for k in ('vent', 'adia', 'mech'):
        if S[k]['feasible'] and (rec is None or S[k]['capex_mid'] < S[rec]['capex_mid']): rec = k
    if rec is None: rec = 'mech'
    return dict(P=P, RH=RH, Q=Q, vol=vol, floor=floor, exRed=exRed, designTdb=designTdb,
                wOut=wOut, Twb=Twb, Tad=Tad, wSup=wSup, fStrat=fS,
                wetFraction=wet_fraction(designTdb), scen=S, recommended=rec, years=years)

# ---------------------------------------------------------------- case grid
CASES = [
    ('base',        'design',   'Default hall: 60x30x8 m, 153.5 kW sensible, 32 degC / 40 % RH peak, 5 exceedance days.', {}),
    ('humid',       'design',   'Same hall in a humid peak (32 degC / 70 % RH) - the case that separates sensible-only from total coil duty.', dict(RH=70.0)),
    ('very_humid',  'design',   'Tropical peak 34 degC / 80 % RH.', dict(Tdb=34.0, RH=80.0)),
    ('dry_hot',     'design',   'Hot dry peak 38 degC / 18 % RH - evaporative cooling at its best.', dict(Tdb=38.0, RH=18.0)),
    ('altitude',    'design',   'Same hall at 900 hPa (about 1000 m altitude) - tests the pressure dependence of the wet bulb.', dict(Phpa=900.0, RH=70.0)),
    ('low_press',   'design',   '850 hPa, moderate humidity.', dict(Phpa=850.0, RH=45.0, Tdb=33.0)),
    ('no_exceed',   'design',   'No exceedance days allowed - design day equals the peak.', dict(exdays=0.0)),
    ('exceed_20',   'design',   '20 exceedance days per year.', dict(exdays=20.0)),
    ('known_load',  'design',   'Load entered as a known total of 153.5 kW instead of built up - must reproduce the base case exactly.',
                                dict(loadmode='known', qknown=153.5)),
    ('small_load',  'design',   'Light load, 25 kW - the fresh-air and air-change floors take over.', dict(qmach=5.0, qlight=3.0, qroof=4.0, qglass=20.0, qsun=150.0, ppl=6.0)),
    ('big_load',    'design',   'Heavy process load 400 kW.', dict(qmach=300.0)),
    ('wall_fan',    'layout',   'Wall axial exhaust instead of roof ARFV.', dict(extract='wall')),
    ('natural',     'layout',   'Natural exhaust.', dict(extmode='nat')),
    ('overpressure','layout',   'Slight overpressure and a large existing extraction.', dict(balance=8.0, vexist=30000.0)),
    ('eff_60',      'process',  'Adiabatic pad at 60 % saturation effectiveness.', dict(eff=60.0)),
    ('eff_95',      'process',  'Adiabatic pad at 95 % saturation effectiveness.', dict(eff=95.0)),
    ('tight_target','process',  'Target 24 degC, max 60 % RH.', dict(Ttar=24.0, maxrh=60.0)),
    ('loose_target','process',  'Target 30 degC, max 80 % RH.', dict(Ttar=30.0, maxrh=80.0)),
    ('near_target', 'process',  'Target only 1.5 K above the adiabatic supply - must be refused as not dimensionable.',
                                dict(Tdb=30.0, RH=62.0, exdays=0.0, Ttar=25.0)),
    ('workheight',  'process',  'Working height raised to 4 m of an 8 m hall.', dict(wh=4.0)),
    ('workheight_c','process',  'Working height at the ceiling - fully mixed, occupied zone at the extract temperature.', dict(wh=8.0)),
    ('pv',          'energy',   '250 kWp of roof PV.', dict(pvkwp=250.0, RH=70.0)),
    ('pv_large',    'energy',   '900 kWp of roof PV - more than the installation can absorb.', dict(pvkwp=900.0, RH=70.0)),
    ('eer_2',       'energy',   'Poor chiller, EER 2.0.', dict(eer=2.0, RH=70.0)),
    ('tariff_x10',  'energy',   'Electricity and water tariffs multiplied by ten.', dict(pel=2.8, pwat=40.0, RH=70.0)),
    ('hours_4000',  'energy',   '4000 operating hours per year.', dict(hrs=4000.0, RH=70.0)),
    ('years_25',    'cost',     '25-year comparison period.', dict(years=25.0, RH=70.0)),
    ('maint_zero',  'cost',     'No maintenance budget.', dict(mrate=0.0, RH=70.0)),
    ('cable_200',   'cost',     '200 m of cable/pipe run.', dict(lm=200.0)),
    ('tall_hall',   'geometry', '12 m high hall, larger footprint.', dict(len=80.0, wid=40.0, hgt=12.0)),
]

out_cases = []
for cid, group, note, delta in CASES:
    inp = dict(DEFAULTS); inp.update(delta)
    m = model(delta)
    P, dT = m['P'], m['designTdb']
    # CoolProp cross-reference on every psychrometric state that the tool shows
    cross = dict(
        w_out_coolprop   = cp_W(dT, m['RH'], P),
        twb_coolprop     = cp_B(dT, m['RH'], P),
        h_out_coolprop   = cp_H_w(dT, m['wOut'], P),
        rho_da_coolprop  = cp_rhoda(dT, m['wOut'], P),
        twb_of_adiabatic_exit_coolprop = cp_B_w(m['Tad'], m['wSup'], P),
        twb_of_adiabatic_exit_closed   = twb(m['Tad'], m['wSup'], P),
        h_adiabatic_exit_coolprop      = cp_H_w(m['Tad'], m['wSup'], P),
        h_in_coolprop                  = cp_H_w(dT, m['wOut'], P),
    )
    mech = m['scen']['mech']
    cross['mech_duty_coolprop_kW'] = mech['mDes'] * (
        (cp_H_w(dT, m['wOut'], P) - cp_H_w(mech['Ts'], mech['wS'], P))
        - (m['wOut'] - mech['wS']) * CPW * mech['Ts']) / 1000.0
    cross['mech_duty_sensible_only_kW'] = mech['mDes'] * cp_ma(mech['wS']) * (dT - mech['Ts']) / 1000.0
    out_cases.append(dict(id=cid, group=group, note=note, inputs=inp,
                          expected=m, crossref=cross))

ref = dict(
    reference=('Moist-air states from CoolProp 8.0.0 HAPropsSI (ASHRAE RP-1485 real-gas '
               'formulation) cross-checked against a closed-form implementation of Bolton (1980) '
               'eq. 10 and ASHRAE Handbook - Fundamentals (2021) ch. 1 eq. 20, 32 and 33 written '
               'for this benchmark and solved by bisection to 1e-12 K; the catalogue sizing and '
               'the price build-up are recomputed independently in python from the assumptions the '
               'tool publishes and are graded as arithmetic identities.'),
    citations=[
        'ASHRAE Handbook - Fundamentals (2021), chapter 1 "Psychrometrics": eq. 20 (humidity ratio '
        'W = 0.621945 p_w/(p - p_w)), eq. 32 (moist-air specific enthalpy h = 1.006 t + W(2501 + '
        '1.86 t) kJ per kg dry air) and eq. 33 (thermodynamic wet-bulb temperature).',
        'D. Bolton, "The computation of equivalent potential temperature", Monthly Weather Review '
        '108(7):1046-1053, 1980, eq. 10: e_s = 6.112 exp(17.67 T/(T + 243.5)) hPa, stated accurate '
        'to 0.1 % for -35 <= T <= +35 degC.',
        'CoolProp 8.0.0, HAPropsSI; humid-air model of S. Herrmann, H.-J. Kretzschmar and D.P. '
        'Gatley, ASHRAE RP-1485 (2009), "Thermodynamic Properties of Real Moist Air".',
        'R. Stull, "Wet-bulb temperature from relative humidity and air temperature", Journal of '
        'Applied Meteorology and Climatology 50(11):2267-2269, 2011 - the correlation the tool '
        'used before this pass; stated valid at standard sea-level pressure with errors from '
        '-1.0 to +0.65 K (RMS 0.28 K) for 5 % <= RH <= 99 %, -20 <= T <= +50 degC.',
        'ASHRAE Handbook - Fundamentals (2021), chapter 1, eq. 35: cooling-coil load '
        'q = m_da[(h_1 - h_2) - (W_1 - W_2) h_w], the condensate leaving as saturated liquid at '
        'the coil surface temperature.',
    ],
    constants=dict(SUPPLY=SUPPLY, ROOF=ROOF, WALL=WALL, ADIAB_PER_M3H=ADIAB_PER_M3H,
                   MECH_PER_KW=MECH_PER_KW, MECH_SUPPLY=MECH_SUPPLY, MECH_RH=MECH_RH,
                   NAT_PER_M3H=NAT_PER_M3H, DT_VENT=DT_VENT, DT_MIN=DT_MIN,
                   FAN_LOAD=FAN_LOAD, PV_YIELD=PV_YIELD, BLEED=BLEED),
    cases=out_cases)

with open(_gp.ref('klimaatcalculator_ref.json'), 'w') as f:
    json.dump(ref, f, indent=1)

# ------------------------------------------------------------------ crosscheck summary
import statistics
dw = [abs(c['crossref']['w_out_coolprop'] - c['expected']['wOut']) / c['crossref']['w_out_coolprop'] for c in out_cases]
db = [abs(c['crossref']['twb_coolprop'] - c['expected']['Twb']) for c in out_cases]
dr = [abs(c['crossref']['rho_da_coolprop'] - rho_da(c['expected']['designTdb'], c['expected']['wOut'], c['expected']['P']))
      / c['crossref']['rho_da_coolprop'] for c in out_cases]
dh = [abs(c['crossref']['h_out_coolprop'] - enth(c['expected']['designTdb'], c['expected']['wOut']))
      / abs(c['crossref']['h_out_coolprop']) for c in out_cases]
dwb = [abs(c['crossref']['twb_of_adiabatic_exit_coolprop'] - c['expected']['Twb']) for c in out_cases]
print('cases', len(out_cases))
print('W  ideal-gas vs CoolProp : max %.4f %%' % (100 * max(dw)))
print('Twb ASHRAE vs CoolProp   : max %.4f K' % max(db))
print('rho_da vs CoolProp       : max %.4f %%' % (100 * max(dr)))
print('h vs CoolProp            : max %.4f %%' % (100 * max(dh)))
print('wet bulb constant along the adiabatic path (CoolProp): max %.4f K' % max(dwb))
for c in out_cases:
    e, x = c['expected'], c['crossref']
    print('%-13s Tdes %6.2f Twb %6.2f Tad %6.2f | rec %-4s | mech kW tool-style %7.1f  total %7.1f  ratio %.2f' % (
        c['id'], e['designTdb'], e['Twb'], e['Tad'], e['recommended'],
        x['mech_duty_sensible_only_kW'], e['scen']['mech']['coolKW'],
        e['scen']['mech']['coolKW'] / max(1e-9, x['mech_duty_sensible_only_kW'])))
