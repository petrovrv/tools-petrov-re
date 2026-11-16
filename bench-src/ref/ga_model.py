#!/usr/bin/env python3
"""Independent reference for gesloten-atmosfeer.html (closed-atmosphere life support).

The coupled ODE system is re-implemented here from the model description and the rate
constants, crew rates and device characteristics READ OUT OF THE PAGE (so what is
benchmarked is the mathematics, not the choice of physiological data), and integrated with
scipy.integrate.solve_ivp at a tight tolerance — a completely different integrator family
(implicit Radau / adaptive LSODA with error control) from the page's fixed-step RK4.

State: [nN2, nO2, nCO2, nH2O, nTR, T_K, cumO2_kg, cumCO2scrubbed_kg, cumCondensate_kg,
        cumEnergy_kWh, cumPotableWater_kg]
"""
import math
import numpy as np
from scipy.integrate import solve_ivp

RGAS = 8.314462618
MM = dict(N2=0.0280134, O2=0.0319988, CO2=0.0440095, H2O=0.0180153, TR=0.050)
CP_AIR, CV_AIR, HFG, RHO_REF = 1005.0, 718.0, 2450e3, 1.2
P_STD, T_STD = 101325.0, 293.15
MOL_PER_NL = P_STD * 1e-3 / (RGAS * T_STD)
FAN_DP, COP_COOL, O2_KWH, COIL_CF, OA_RH = 1200.0, 3.0, 4.5, 0.85, 0.5
OUT_CO2, OUT_O2 = 420e-6, 0.2095
DT_MAX = 10.0
T_LO, T_HI = 180.0, 400.0

def clamp(x, a, b): return a if x < a else (b if x > b else x)
def psat(TC): return 610.94 * math.exp(17.625 * TC / (TC + 243.04))
def xhum(pv, p): return 0.62198 * pv / max(p - pv, 1.0)
def smooth_off(t, tf, ramp): return 0.5 * (1.0 - math.tanh((t - tf) / ramp))

# raw field defaults (value, min, max) exactly as the page declares them
FIELDS = dict(V=1500, N=45, p0=101.3, T0=24, rh0=50, co20=1000, gco2=20, go2=0.84,
              gh2o=0.09, qs=75, gtr=0.5, gwat=3.5, oa=0, toa=18, vs=1200, eta=0.75,
              o2max=1.9, po2set=20, vd=1500, tcoil=12, qc=60, tset=26, qe=45, ua=3000,
              thull=10, vtr=600, etatr=0.6, leak=0.05, so2=200, ssorb=180, sratio=0.5,
              swat=6000, sener=1400, dur=48, fail='none', ftime=6, lkr=2)

def params(**kw):
    """Mirror of the page's readParams(): raw field values in, SI parameters out."""
    f = dict(FIELDS); f.update(kw)
    P = dict(
        V=f['V'], N=int(round(f['N'])), p0=f['p0']*1000.0, T0=f['T0'], rh0=f['rh0'],
        co20=f['co20'], gco2=f['gco2'], go2=f['go2'], gh2o=f['gh2o'], qs=f['qs'],
        gtr=f['gtr'], gwat=f['gwat'], oa=f['oa']/3600.0, toa=f['toa'],
        vs=f['vs']/3600.0, eta=f['eta'], o2max=f['o2max']/3600.0, po2set=f['po2set']*1000.0,
        vd=f['vd']/3600.0, tcoil=f['tcoil'], qc=f['qc']*1000.0, tset=f['tset'],
        qe=f['qe']*1000.0, ua=f['ua'], thull=f['thull'], vtr=f['vtr']/3600.0,
        etatr=f['etatr'], leak=f['leak']/100.0/86400.0, so2=f['so2'], ssorb=f['ssorb'],
        sratio=max(f['sratio'], 0.01), swat=f['swat'], sener=f['sener'],
        dur=f['dur']*3600.0, dtmax=DT_MAX, fail=f['fail'], ftime=f['ftime']*3600.0,
        lkr=f['lkr']/100.0/3600.0)
    P['gco2_mol'] = P['gco2'] * MOL_PER_NL / 3600.0
    P['go2_mol'] = P['go2'] / MM['O2'] / 86400.0
    P['gh2o_mol'] = P['gh2o'] / MM['H2O'] / 3600.0
    P['gtr_mol'] = P['gtr'] * 1e-3 / MM['TR'] / 3600.0
    P['gwat_kg'] = P['gwat'] / 86400.0
    P['rq'] = P['gco2_mol'] / P['go2_mol'] if P['go2_mol'] > 0 else 0.0
    return P

def init_state(P):
    T = P['T0'] + 273.15
    pv = clamp(P['rh0']/100.0*psat(P['T0']), 0, P['p0']*0.9)
    nTot = P['p0']*P['V']/(RGAS*T)
    nH2O = nTot*pv/P['p0']
    nCO2 = nTot*P['co20']*1e-6
    nTR = nTot*5e-6
    nO2 = nTot*OUT_O2
    nN2 = max(nTot - nH2O - nCO2 - nTR - nO2, 0.0)
    return [nN2, nO2, nCO2, nH2O, nTR, T, 0, 0, 0, 0, 0]

def deriv(t, S, P, aux=None):
    nN2, nO2, nCO2 = max(S[0], 0), max(S[1], 0), max(S[2], 0)
    nH2O, nTR = max(S[3], 0), max(S[4], 0)
    Tk = clamp(S[5], 120, 700); TC = Tk - 273.15
    nt = max(nN2+nO2+nCO2+nH2O+nTR, 1e-9)
    p = nt*RGAS*Tk/P['V']
    yO2, yCO2, yH2O, yTR = nO2/nt, nCO2/nt, nH2O/nt, nTR/nt
    pv, pO2 = yH2O*p, yO2*p

    R = 30.0
    av = 1.0 if P['fail'] == 'none' else smooth_off(t, P['ftime'], R)
    avCO2 = av if P['fail'] == 'co2' else 1.0
    avO2 = av if P['fail'] == 'o2' else 1.0
    avDeh = av if P['fail'] == 'deh' else 1.0
    avHeat = av if P['fail'] == 'heat' else 1.0
    leakEx = P['lkr']*(1.0 - smooth_off(t, P['ftime'], R)) if P['fail'] == 'leak' else 0.0

    o2Avail = clamp(nO2/(1e-3*nt), 0, 1)
    gCO2 = P['N']*P['gco2_mol']; gO2 = P['N']*P['go2_mol']*o2Avail
    gH2O = P['N']*P['gh2o_mol']; gTR = P['N']*P['gtr_mol']

    pvOA = OA_RH*psat(P['toa'])
    nInTot = P['p0']*P['oa']/(RGAS*(P['toa']+273.15)) if P['oa'] > 0 else 0.0
    nOutTot = p*P['oa']/(RGAS*Tk) if P['oa'] > 0 else 0.0
    yOAh2o = clamp(pvOA/P['p0'], 0, 1)
    inO2, inCO2, inH2O = nInTot*OUT_O2, nInTot*OUT_CO2, nInTot*yOAh2o
    inN2 = max(nInTot - inO2 - inCO2 - inH2O, 0.0)

    lk = (P['leak'] + leakEx)*nt

    sorbLeft = clamp((P['ssorb']-S[7])/max(0.03*P['ssorb'], 1e-6), 0, 1) if P['ssorb'] > 0 else 0.0
    scrub = P['eta']*P['vs']*(nCO2/P['V'])*avCO2*sorbLeft

    o2Left = clamp((P['so2']-S[6])/max(0.03*P['so2'], 1e-6), 0, 1) if P['so2'] > 0 else 0.0
    demand = clamp((P['po2set']-pO2)/1500.0, 0, 1)
    o2feed = P['o2max']/MM['O2']*demand*avO2*o2Left

    mda = RHO_REF*P['vd']*avDeh
    dhw = max(mda*(xhum(pv, p) - xhum(psat(P['tcoil']), p))*COIL_CF, 0.0)
    dh_mol = dhw/MM['H2O']

    gEff = P['ua']/(RHO_REF*CP_AIR)
    cond = max(gEff*(pv - psat(P['thull']))/(RGAS*Tk), 0.0)
    condKg = cond*MM['H2O']

    trRem = P['etatr']*P['vtr']*(nTR/P['V'])

    mAir = nN2*MM['N2']+nO2*MM['O2']+nCO2*MM['CO2']+nH2O*MM['H2O']+nTR*MM['TR']
    qPeople = P['N']*P['qs']; qEquip = P['qe']
    qHull = P['ua']*(TC-P['thull'])
    qVent = RHO_REF*CP_AIR*P['oa']*(TC-P['toa'])
    qCool = P['qc']*clamp((TC-P['tset'])/1.5, 0, 1)*avHeat
    qDehS = mda*CP_AIR*max(TC-P['tcoil'], 0.0)*COIL_CF
    dT = (qPeople+qEquip-qCool-qHull-qVent-qDehS)/max(mAir*CV_AIR, 1e-6)

    pFan = FAN_DP*(P['vs']+P['vd']+P['vtr']+P['oa'])
    pCool = qCool/COP_COOL
    pO2g = o2feed*MM['O2']*O2_KWH*1e3*3600.0
    pTot = pFan+pCool+pO2g+qEquip

    if aux is not None:
        aux.update(p=p, pv=pv, pO2=pO2, pCO2=yCO2*p, TC=TC, nt=nt, yCO2=yCO2, yO2=yO2, yTR=yTR,
                   rh=100*pv/max(psat(TC), 1e-9), scrub=scrub, o2feed=o2feed, mAir=mAir,
                   qPeople=qPeople, qEquip=qEquip, qHull=qHull, qVent=qVent, qCool=qCool+qDehS,
                   dhw=dhw+condKg, pTot=pTot, sorbLeft=sorbLeft, o2Left=o2Left, trRem=trRem,
                   dTdt=dT, gCO2=gCO2, gO2=gO2, lk=lk, nOutTot=nOutTot, inCO2=inCO2, inO2=inO2)
    return [
        inN2 - nN2/nt*nOutTot - nN2/nt*lk,
        inO2 - nO2/nt*nOutTot - nO2/nt*lk - gO2 + o2feed,
        inCO2 - nCO2/nt*nOutTot - nCO2/nt*lk + gCO2 - scrub,
        inH2O - nH2O/nt*nOutTot - nH2O/nt*lk + gH2O - dh_mol - cond,
        -nTR/nt*nOutTot - nTR/nt*lk + gTR - trRem,
        dT,
        o2feed*MM['O2'],
        scrub*MM['CO2'],
        dhw+condKg,
        pTot/3.6e6,
        P['N']*P['gwat_kg'],
    ]

def saturated(S, P):
    """moles of vapour the gas phase can hold at the current temperature"""
    Tk = clamp(S[5], 120, 700)
    return psat(Tk-273.15)*P['V']/(RGAS*Tk)

def integrate(P, t_eval=None, rtol=1e-11, atol=1e-11, method='LSODA'):
    """Adaptive, error-controlled integration of the same system. Returns (t, Y).
    Saturation of the gas phase is enforced with an event: when the vapour reaches
    saturation the integration is restarted on the constrained system, where the water
    that cannot be held is moved to the condensate accumulator — the dt -> 0 limit of the
    page's per-step projection."""
    S0 = list(init_state(P))
    t0, tend = 0.0, P['dur']
    ts, Ys = [], []
    atol_v = np.array([atol*max(abs(v), 1.0) for v in S0])
    while t0 < tend - 1e-9:
        def ev(t, S):
            return S[3] - saturated(S, P)
        ev.terminal = True
        ev.direction = 1.0
        sat0 = S0[3] - saturated(S0, P)
        if sat0 > -1e-9:            # already on the saturation manifold: constrained system
            def f(t, S):
                d = deriv(t, S, P)
                nsat = saturated(S, P)
                # keep nH2O on the saturation curve: d(nsat)/dT * dT/dt
                Tk = clamp(S[5], 120, 700); TC = Tk-273.15
                dnsatdT = (psat(TC+1e-4)*P['V']/(RGAS*(Tk+1e-4)) - nsat)/1e-4
                dn = dnsatdT*d[5]
                d[8] += (d[3]-dn)*MM['H2O']     # surplus leaves as condensate
                d[3] = dn
                return d
            def ev2(t, S):
                d = deriv(t, S, P)
                nsat = saturated(S, P)
                Tk = clamp(S[5], 120, 700); TC = Tk-273.15
                dnsatdT = (psat(TC+1e-4)*P['V']/(RGAS*(Tk+1e-4)) - nsat)/1e-4
                return d[3] - dnsatdT*d[5]      # leaving the manifold downwards
            ev2.terminal = True; ev2.direction = -1.0
            sol = solve_ivp(f, (t0, tend), S0, method=method, rtol=rtol, atol=atol_v,
                            dense_output=True, events=ev2, max_step=(tend-t0)/50.0)
        else:
            sol = solve_ivp(lambda t, S: deriv(t, S, P), (t0, tend), S0, method=method,
                            rtol=rtol, atol=atol_v, dense_output=True, events=ev,
                            max_step=(tend-t0)/50.0)
        ts.append(sol)
        t0 = sol.t[-1]
        S0 = list(sol.y[:, -1])
        if not sol.status == 1:
            break
    return ts

def solution(P, times):
    """value of the state at the requested times (s)"""
    segs = integrate(P)
    out = np.zeros((11, len(times)))
    for i, t in enumerate(times):
        seg = segs[0]
        for s in segs:
            if t >= s.t[0]-1e-9:
                seg = s
        out[:, i] = seg.sol(min(t, seg.t[-1]))
    return out

def observables(P, S):
    a = {}
    deriv(0.0, list(S), P, a)
    return dict(co2_ppm=a['yCO2']*1e6, o2_pct=a['yO2']*100, pO2_kPa=a['pO2']/1000,
                pCO2_kPa=a['pCO2']/1000, p_kPa=a['p']/1000, TC=a['TC'], rh=a['rh'],
                tr_ppm=a['yTR']*1e6, pv_kPa=a['pv']/1000)
