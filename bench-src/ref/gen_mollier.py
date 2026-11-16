#!/usr/bin/env python3
"""
Independent reference for mollier.html  (Mollier i-d / psychrometric chart).

PRIMARY reference : own implementation of the ASHRAE Handbook - Fundamentals (2017),
                    Chapter 1 "Psychrometrics" moist-air formulation
                    (Hyland & Wexler 1983 saturation pressure, ideal gas-mixture
                    humidity ratio / enthalpy / specific volume, Eq. 33/35 thermodynamic
                    wet bulb, Eq. 3 standard-atmosphere pressure).
CROSSCHECK        : CoolProp 8.0 HAPropsSI (ASHRAE RP-1485 real-gas formulation of
                    Herrmann/Kretzschmar/Gatley, includes the water-vapour enhancement
                    factor f that the ideal-gas ASHRAE equations omit).

Both are written here; the mutual deviation is stored per case as `crosscheck`.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
from scipy.optimize import brentq
from CoolProp.HumidAirProp import HAPropsSI

# ---------------------------------------------------------------- ASHRAE (ideal gas)
def pws(t):
    """Saturation pressure of water vapour [Pa]. ASHRAE 2017 Ch.1 Eq.5 (ice, -100..0 C),
    Eq.6 (liquid water, 0..200 C).  == Hyland & Wexler (1983)."""
    T = t + 273.15
    if t < 0.0:
        C = (-5.6745359e3, 6.3925247, -9.677843e-3, 6.2215701e-7,
             2.0747825e-9, -9.484024e-13, 4.1635019)
        lnp = C[0]/T + C[1] + C[2]*T + C[3]*T**2 + C[4]*T**3 + C[5]*T**4 + C[6]*math.log(T)
    else:
        C = (-5.8002206e3, 1.3914993, -4.8640239e-2, 4.1764768e-5,
             -1.4452093e-8, 6.5459673)
        lnp = C[0]/T + C[1] + C[2]*T + C[3]*T**2 + C[4]*T**3 + C[5]*math.log(T)
    return math.exp(lnp)

MW = 0.621945          # Mw/Mda
def W_of_pw(pw, P):  return MW*pw/(P-pw)          # Eq. 20
def pw_of_W(W, P):   return P*W/(MW+W)            # Eq. 20 inverted
def Wsat(t, P):      return W_of_pw(min(pws(t), 0.999*P), P)
def h_of(t, W):      return 1.006*t + W*(2501.0 + 1.86*t)      # Eq. 30 (kJ/kg dry air)
def v_of(t, W, P):   return 0.287042*(t+273.15)*(1+1.607858*W)/(P/1000.0)  # Eq. 26
def RH_of(t, W, P):  return pw_of_W(W, P)/pws(t)                # Eq. 24 (ideal, f=1)
def W_of_RH(t, rh, P): return W_of_pw(rh*pws(t), P)

def twb_eq33(t, W, P):
    """ASHRAE Eq.33 - thermodynamic wet-bulb (adiabatic saturation) ABOVE freezing."""
    def f(ts):
        Ws = Wsat(ts, P)
        return ((2501.0-2.326*ts)*Ws - 1.006*(t-ts))/(2501.0+1.86*t-4.186*ts) - W
    return brentq(f, -80.0, t+1e-9, xtol=1e-12, rtol=1e-14)

def twb_eq35(t, W, P):
    """ASHRAE Eq.35 - thermodynamic wet-bulb (ice bulb) BELOW freezing."""
    def f(ts):
        Ws = Wsat(ts, P)
        return ((2830.0-0.24*ts)*Ws - 1.006*(t-ts))/(2830.0+1.86*t-2.1*ts) - W
    return brentq(f, -80.0, min(t, -1e-12), xtol=1e-12, rtol=1e-14)

def twb_ashrae(t, W, P):
    """ASHRAE convention: Eq.33 while t* >= 0, else Eq.35."""
    ts = twb_eq33(t, W, P)
    if ts >= 0.0:
        return ts
    try:
        return twb_eq35(t, W, P)
    except ValueError:
        return ts

def tdp(W, P):
    """Dew/frost point by direct inversion of pws (ice branch below 0 C == ASHRAE Eq.40)."""
    pw = pw_of_W(W, P)
    if pw <= pws(-90.0):
        return -90.0
    return brentq(lambda t: pws(t)-pw, -90.0, 100.0, xtol=1e-12, rtol=1e-14)

def tdp_ashrae_corr(W, P):
    """ASHRAE 2017 Ch.1 Eq.39 / Eq.40 explicit dew-point correlations (crosscheck)."""
    pw_kpa = pw_of_W(W, P)/1000.0
    a = math.log(pw_kpa)
    td40 = 6.09 + 12.608*a + 0.4959*a*a
    td39 = (6.54 + 14.526*a + 0.7389*a*a + 0.09486*a**3 + 0.4569*pw_kpa**0.1984)
    return td39 if td40 >= 0 else td40

def alt_to_kpa(z):
    """ASHRAE 2017 Ch.1 Eq.3 (standard atmosphere, -5000..11000 m)."""
    return 101.325*(1-2.25577e-5*z)**5.2559

def isa_pressure(z):
    """ISA barometric formula from first principles (troposphere, structurally different):
       p = p0 (1 - L z/T0)^(g M/(R L)),  p0=101325 Pa, T0=288.15 K, L=0.0065 K/m,
       g=9.80665, M=0.0289644 kg/mol, R=8.31432 J/mol/K."""
    p0, T0, L, g, M, R = 101325.0, 288.15, 0.0065, 9.80665, 0.0289644, 8.31432
    return p0*(1-L*z/T0)**(g*M/(R*L))/1000.0

def state(t, W, P):
    return dict(t=t, W=W, d=W*1000.0, rh=RH_of(t, W, P)*100.0, h=h_of(t, W),
                wb=twb_eq33(t, W, P), wb_ashrae=twb_ashrae(t, W, P),
                dp=tdp(W, P), v=v_of(t, W, P), pw=pw_of_W(W, P))

# ---------------------------------------------------------------- CoolProp crosscheck
def cp_state(t, W, P):
    T = t+273.15
    try:
        return dict(rh=HAPropsSI('R', 'T', T, 'P', P, 'W', W)*100.0,
                    h=HAPropsSI('H', 'T', T, 'P', P, 'W', W)/1000.0,
                    wb=HAPropsSI('B', 'T', T, 'P', P, 'W', W)-273.15,
                    dp=HAPropsSI('D', 'T', T, 'P', P, 'W', W)-273.15,
                    v=HAPropsSI('V', 'T', T, 'P', P, 'W', W))
    except Exception as e:
        return dict(err=str(e)[:80])

def cp_W_from_RH(t, rh, P):
    return HAPropsSI('W', 'T', t+273.15, 'P', P, 'R', rh)

# ---------------------------------------------------------------- build cases
cases = []

def add_state_case(cid, note, t, hmode, hval, P_kpa=101.325, alt=None, expect=None):
    P = P_kpa*1000.0
    if alt is not None:
        P = alt_to_kpa(alt)*1000.0
    if hmode == 'h_rh':
        W = W_of_RH(t, hval/100.0, P)
    elif hmode == 'h_d':
        W = hval/1000.0
    elif hmode == 'h_dp':
        W = Wsat(hval, P)
    elif hmode == 'h_wb':
        Ws = Wsat(hval, P)
        W = max(0.0, ((2501.0-2.326*hval)*Ws-1.006*(t-hval))/(2501.0+1.86*t-4.186*hval))
    elif hmode == 'h_h':
        W = max(0.0, (hval-1.006*t)/(2501.0+1.86*t))
    Wsatv = Wsat(t, P)
    fog = W > Wsatv
    Wc = min(W, Wsatv)
    st = state(t, Wc, P)
    cs = cp_state(t, Wc, P)
    cc = {}
    for k in ('rh', 'h', 'wb', 'dp', 'v'):
        if k in cs:
            ref = st['wb_ashrae'] if k == 'wb' else st[k]
            cc['dev_'+k] = abs(cs[k]-ref)/max(abs(ref), 1e-9) if k not in ('wb', 'dp', 'rh') \
                else abs(cs[k]-ref)
            cc['cp_'+k] = cs[k]
    c = dict(id=cid, kind='state', note=note,
             inputs=dict(t=t, hmode=hmode, hval=hval, P_kpa=round(P/1000.0, 6),
                         alt=alt),
             ref=dict(d=st['d'], rh=st['rh'], h=st['h'], wb=st['wb_ashrae'], dp=st['dp'],
                      v=st['v'], pw=st['pw'],
                      wb_eq33_waterbulb=st['wb'], W=Wc),
             crosscheck=cc, fog=fog)
    if expect:
        c['expect'] = expect
    cases.append(c)

# --- (A) reference/standard state points at 101.325 kPa
grid_t = [-20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60]
grid_rh = [0, 10, 30, 50, 80, 100]
n = 0
for t in grid_t:
    for rh in grid_rh:
        if rh == 0 and t not in (-20, 0, 20, 60):
            continue
        if rh == 100 and t > 45:      # W_sat huge, off-chart; keep chart-relevant
            continue
        n += 1
        add_state_case('S%02d' % n, 't=%g C, RH=%g%%, 101.325 kPa' % (t, rh),
                       t, 'h_rh', rh)

# --- (B) reduced pressure via explicit kPa
for pk in (80.0, 60.0, 90.0):
    for (t, rh) in ((20, 50), (35, 40), (-10, 60)):
        n += 1
        add_state_case('P%02d' % n, 't=%g C, RH=%g%%, p=%g kPa' % (t, rh, pk),
                       t, 'h_rh', rh, P_kpa=pk)

# --- (C) altitude input
for z in (0, 500, 1500, 3000, 5000):
    n += 1
    add_state_case('A%04d' % z, 'altitude %g m -> p; t=20 C RH=50%%' % z,
                   20, 'h_rh', 50, alt=z)

# --- (D) other humidity input modes
add_state_case('M_d',  'humidity given as d=10 g/kg at 30 C',   30, 'h_d', 10)
add_state_case('M_dp', 'humidity given as dew point 12 C at 30 C', 30, 'h_dp', 12)
add_state_case('M_wb', 'humidity given as wet bulb 20 C at 30 C', 30, 'h_wb', 20)
add_state_case('M_h',  'humidity given as enthalpy 60 kJ/kg at 30 C', 30, 'h_h', 60)
add_state_case('M_dpneg', 'dew point -15 C at 5 C (frost point branch)', 5, 'h_dp', -15)

# --- (E) fog / supersaturation: RH > 100 must not give a nonsense state
add_state_case('F_rh120', 'RH = 120 % requested at 20 C (fog region)', 20, 'h_rh', 120,
               expect='clamp_or_refuse')
add_state_case('F_d40', 'd = 40 g/kg at 20 C (W > Wsat, fog)', 20, 'h_d', 40,
               expect='clamp_or_refuse')

# --- altitude conversion table (checked separately, no DOM)
alt_table = [{'z': z, 'ashrae_kpa': alt_to_kpa(z), 'isa_kpa': isa_pressure(z),
              'dev': abs(alt_to_kpa(z)-isa_pressure(z))/isa_pressure(z)}
             for z in (0, 500, 1000, 1500, 2000, 3000, 5000)]

# ---------------------------------------------------------------- processes
def props(t, W, P):
    return state(t, min(W, Wsat(t, P)), P)

proc = []

def A_state(P=101325.0):
    """The 'Start' state used for every process test: 30 C / 50 % RH."""
    t = 30.0
    W = W_of_RH(t, 0.5, P)
    return t, W

P0 = 101325.0

# heating to 45 C, flow 1000 m3/h
tA, WA = A_state()
hA, vA = h_of(tA, WA), v_of(tA, WA, P0)
md = (1000.0/3600.0)/vA                      # kg dry air / s
tf = 45.0
proc.append(dict(id='PR_heat', kind='process', type='heat', note='sensible heating 30->45 C',
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), tf=tf),
                 ref=dict(t2=tf, d2=WA*1000.0, h2=h_of(tf, WA), rh2=RH_of(tf, WA, P0)*100.0,
                          dh=h_of(tf, WA)-hA, power_kW=md*(h_of(tf, WA)-hA),
                          m_dry=md, moisture_kgh=0.0)))

# cooling below dew point (tool: exits saturated at tf)
tf = 8.0
dpA = tdp(WA, P0)
W2 = Wsat(tf, P0)
h2 = h_of(tf, W2)
cond = WA-W2
# energy balance WITH condensate leaving at tf (correct 1st law):
Q_full = md*((h2-hA) - (WA-W2)*4.186*tf)
proc.append(dict(id='PR_cool', kind='process', type='cool',
                 note='cooling 30C/50%% to 8 C (below dew point %.2f C) - exits saturated' % dpA,
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), tf=tf),
                 ref=dict(t2=tf, d2=W2*1000.0, h2=h2, rh2=100.0, dh=h2-hA,
                          power_kW=md*(h2-hA), power_kW_with_condensate=Q_full,
                          cond_gkg=cond*1000.0, m_dry=md,
                          moisture_kgh=md*(W2-WA)*3600.0, dp_A=dpA)))

# cooling coil with ADP + bypass factor
adp, bf = 9.0, 0.15
Wadp = Wsat(adp, P0)
t2 = adp + bf*(tA-adp)
W2c = Wadp + bf*(WA-Wadp)
proc.append(dict(id='PR_coil', kind='process', type='coil',
                 note='cooling+dehum, ADP=9 C, BF=0.15',
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), adp=adp, bf=bf),
                 ref=dict(t2=t2, d2=W2c*1000.0, h2=h_of(t2, W2c), rh2=RH_of(t2, W2c, P0)*100.0,
                          dh=h_of(t2, W2c)-hA, power_kW=md*(h_of(t2, W2c)-hA),
                          power_kW_with_condensate=md*((h_of(t2, W2c)-hA)-(WA-W2c)*4.186*adp),
                          cond_gkg=(WA-W2c)*1000.0, m_dry=md,
                          moisture_kgh=md*(W2c-WA)*3600.0)))

# adiabatic (evaporative) humidification, eff 0.85, feed water 15 C
eff, tw = 0.85, 15.0
def adiab_sat(tA, WA, P, tw):
    hA = h_of(tA, WA)
    def tof(W): return (hA + (W-WA)*4.186*tw - 2501.0*W)/(1.006+1.86*W)
    f = lambda W: RH_of(tof(W), W, P)-1.0
    Ws = brentq(f, WA, WA+0.08, xtol=1e-14)
    return tof, Ws
tof, Ws = adiab_sat(tA, WA, P0, tw)
W2a = WA + eff*(Ws-WA)
t2a = tof(W2a)
proc.append(dict(id='PR_adiab', kind='process', type='adiab',
                 note='adiabatic humidification eff=0.85, feed water 15 C',
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), eff=eff, tw=tw),
                 ref=dict(t2=t2a, d2=W2a*1000.0, h2=h_of(t2a, W2a),
                          rh2=RH_of(t2a, W2a, P0)*100.0,
                          W_sat_line=Ws*1000.0, t_sat_line=tof(Ws),
                          dh=h_of(t2a, W2a)-hA, power_kW=md*(h_of(t2a, W2a)-hA),
                          # exact water-injection energy balance check:
                          dh_expected=(W2a-WA)*4.186*tw,
                          m_dry=md, moisture_kgh=md*(W2a-WA)*3600.0,
                          twb_A=twb_eq33(tA, WA, P0))))

# adiabatic with feed water AT the wet-bulb temperature -> must follow the twb line
twb_A = twb_eq33(tA, WA, P0)
tof2, Ws2 = adiab_sat(tA, WA, P0, twb_A)
W2b = WA + 1.0*(Ws2-WA)
proc.append(dict(id='PR_adiab_wb', kind='process', type='adiab',
                 note='adiabatic humidification eff=1.0, feed water = t_wb -> saturation at t_wb',
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), eff=1.0,
                             tw=round(twb_A, 2)),
                 ref=dict(t2=tof2(Ws2), d2=Ws2*1000.0, rh2=100.0,
                          t_wb_A=twb_A, t2_should_equal_twb=twb_A)))

# mixing of two airstreams, 1000 m3/h of A (30/50) with 30 % of total of B (5 C / 80 %)
tB, WB = 5.0, W_of_RH(5.0, 0.8, P0)
vB = v_of(tB, WB, P0)
pct = 30.0
mB = md*pct/(100.0-pct)
Wm = (md*WA+mB*WB)/(md+mB)
hm = (md*hA+mB*h_of(tB, WB))/(md+mB)
tm = (hm-2501.0*Wm)/(1.006+1.86*Wm)
proc.append(dict(id='PR_mix', kind='process', type='mix',
                 note='mix 30C/50% with 5C/80%, second stream = 30 % of total (dry-air basis)',
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'),
                             b=dict(t=tB, rh=80), pct=pct),
                 ref=dict(t2=tm, d2=Wm*1000.0, h2=hm, rh2=RH_of(tm, Wm, P0)*100.0,
                          m_dryA=md, m_dryB=mB,
                          combined_m3h=(md+mB)*v_of(tm, Wm, P0)*3600.0,
                          dh=hm-hA,
                          # adiabatic mixing: no power crosses the boundary.  What the tool
                          # prints in the "Power" column is (mA+mB)(h_mix-h_A) = mB(h_B-h_A):
                          power_kW_true=0.0,
                          power_kW_tool_convention=mB*(h_of(tB, WB)-hA))))

# mixing that lands in the fog region: -5 C sat + 35 C sat, 50/50
tB2, WB2 = -5.0, Wsat(-5.0, P0)
tA2, WA2 = 35.0, Wsat(35.0, P0)
Wm2 = 0.5*(WA2+WB2)
hm2 = 0.5*(h_of(tA2, WA2)+h_of(tB2, WB2))
tm2 = (hm2-2501.0*Wm2)/(1.006+1.86*Wm2)
proc.append(dict(id='PR_mix_fog', kind='process', type='mix',
                 note='50/50 mix of saturated 35 C and saturated -5 C -> lands in the fog region',
                 inputs=dict(start=dict(t=tA2, rh=100, flow=1000, unit='m3h'),
                             b=dict(t=tB2, rh=100), pct=50.0),
                 ref=dict(t_ideal=tm2, d_ideal=Wm2*1000.0, h_ideal=hm2,
                          rh_ideal=RH_of(tm2, Wm2, P0)*100.0,
                          Wsat_at_tm=Wsat(tm2, P0)*1000.0,
                          fog=RH_of(tm2, Wm2, P0) > 1.0),
                 expect='fog'))

# --- sensible cooling that stays above the dew point (no condensation)
tf = 25.0
proc.append(dict(id='PR_cool_sens', kind='process', type='cool',
                 note='cooling 30C/50%% to 25 C (above dew point %.2f C) - no condensation' % dpA,
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), tf=tf),
                 ref=dict(t2=tf, d2=WA*1000.0, h2=h_of(tf, WA), rh2=RH_of(tf, WA, P0)*100.0,
                          power_kW=md*(h_of(tf, WA)-hA), moisture_kgh=0.0)))

# --- cooling coil whose ADP is ABOVE the entering dew point -> the coil must run DRY
adp2, bf2 = 22.0, 0.15
proc.append(dict(id='PR_coil_dry', kind='process', type='coil',
                 note='cooling coil with ADP = 22 C, above the entering dew point %.2f C: a real '
                      'coil surface stays dry, so W must not change (d2 = d1) and t2 = ADP + BF (t1-ADP)' % dpA,
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), adp=adp2, bf=bf2),
                 ref=dict(t2=adp2+bf2*(tA-adp2), d2=WA*1000.0,
                          h2=h_of(adp2+bf2*(tA-adp2), WA), rh2=RH_of(adp2+bf2*(tA-adp2), WA, P0)*100.0,
                          d2_if_wet_model_applied=(Wsat(adp2, P0)+bf2*(WA-Wsat(adp2, P0)))*1000.0,
                          power_kW=md*(h_of(adp2+bf2*(tA-adp2), WA)-hA), moisture_kgh=0.0),
                 expect='dry_coil'))

# --- steam humidification asked to LOWER the relative humidity (impossible)
proc.append(dict(id='PR_steam_down', kind='process', type='steam',
                 note='steam (isothermal) humidification asked for phi_final = 30 % while the '
                      'entering air is already at 50 % - the tool must refuse or warn',
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), rhf=30.0),
                 ref=dict(t2=tA, d2=WA*1000.0, rh2=50.0),
                 expect='warn'))

# --- dehumidification asked for a final d ABOVE the entering d (impossible)
proc.append(dict(id='PR_dehum_up', kind='process', type='dehum',
                 note='dehumidification asked for d_final = 20 g/kg while the entering air is at '
                      '%.2f g/kg - the tool must refuse or warn' % (WA*1000.0),
                 inputs=dict(start=dict(t=tA, rh=50, flow=1000, unit='m3h'), df=20.0),
                 ref=dict(t2=tA, d2=WA*1000.0, rh2=50.0),
                 expect='warn'))

out = dict(states=cases, processes=proc, alt_table=alt_table,
           notes=dict(
               enthalpy_datum='h = 1.006 t + W (2501 + 1.86 t) kJ/kg dry air; zero for dry air '
                              'and for saturated liquid water at 0 C (ASHRAE / CoolProp share '
                              'this datum: HAPropsSI H = 0 for dry air at 0 C).',
               twb='ASHRAE Eq.33 is the *thermodynamic* (adiabatic-saturation) wet bulb with '
                   'constant specific heats, not an empirical approximation.'))
with open(_gp.ref('mollier_ref.json'), 'w') as f:
    json.dump(out, f, indent=1)
print('states', len(cases), 'processes', len(proc))
print('alt dev max %.3e' % max(a['dev'] for a in alt_table))
print('25C/50%:', json.dumps({k: round(v, 5) for k, v in cases[0]['ref'].items()}))
