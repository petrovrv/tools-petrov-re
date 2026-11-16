#!/usr/bin/env python3
"""Independent reference for thermodynamiccycles.html.

Two distinct layers, kept separate on purpose:

 (A) PROPERTY LAYER  — CoolProp 8.0.0 (python).  This is the SAME library the page runs
     in WebAssembly, so it is NOT an independent check of properties.  It is used only to
     confirm the WASM binding is wired correctly (same fluid, same state, same numbers)
     and as the property source for layer (B).

 (B) CYCLE LAYER     — written here from the first and second law and the textbook
     definitions of the components, without looking at how the page implements them.
     The cycle algebra (component work/duty, mass and energy balances, bleed fractions,
     isentropic-efficiency direction, entropy generation, Carnot bound) is independent
     of the property library and is where cycle tools actually go wrong.
"""
import math
import CoolProp.CoolProp as CP
from CoolProp.CoolProp import AbstractState, PropsSI

FLUID = {'Water':'Water','R717':'Ammonia','R134a':'R134a','R1234yf':'R1234yf','R32':'R32',
         'R410A':'R410A','R290':'Propane','R600a':'Isobutane','R744':'CarbonDioxide'}
_AS = {}
def _st(f):
    if f not in _AS:
        _AS[f] = AbstractState('IF97' if f == 'Water' else 'HEOS', FLUID[f])
    return _AS[f]

def _rd(s):
    Q = s.Q()
    return dict(p=s.p()/1e6, T=s.T(), h=s.hmass()/1000.0, s=s.smass()/1000.0,
                v=1.0/s.rhomass(), x=(min(1,max(0,Q)) if -1e-9 <= Q <= 1+1e-9 else None))

def PT(f,p,T):  st=_st(f); st.update(CP.PT_INPUTS,p*1e6,T);          return _rd(st)
def PQ(f,p,q):  st=_st(f); st.update(CP.PQ_INPUTS,p*1e6,q);          return _rd(st)
def QT(f,q,T):  st=_st(f); st.update(CP.QT_INPUTS,q,T);              return _rd(st)
def PS(f,p,sv): st=_st(f); st.update(CP.PSmass_INPUTS,p*1e6,sv*1e3); return _rd(st)
def PH(f,p,hv): st=_st(f); st.update(CP.HmassP_INPUTS,hv*1e3,p*1e6); return _rd(st)
def psat(f,T):  return QT(f,1,T)['p']
def Tcrit(f):   return PropsSI('Tcrit','',0,'',0,FLUID[f])
def pcrit(f):   return PropsSI('Pcrit','',0,'',0,FLUID[f])/1e6

# ---------------------------------------------------------------- component models
# expansion:   w = h_in - h_out ,  eta_s = w_actual / w_isentropic   (0<eta<=1)
# compression: w = h_out - h_in ,  eta_s = w_isentropic / w_actual   (0<eta<=1)
def expand(f, st_in, p_out, eta):
    hs = PS(f, p_out, st_in['s'])['h']
    w_s = st_in['h'] - hs                       # isentropic work extracted, >0
    h_out = st_in['h'] - eta*w_s
    return PH(f, p_out, h_out), w_s, eta*w_s

def compress(f, st_in, p_out, eta):
    hs = PS(f, p_out, st_in['s'])['h']
    w_s = hs - st_in['h']                       # isentropic work required, >0
    h_out = st_in['h'] + w_s/eta
    return PH(f, p_out, h_out), w_s, w_s/eta

# ---------------------------------------------------------------- cycles
def rankine(fluid, pB, tSup, tCond, etaT, etaP, mdot):
    f = fluid
    Tc = tCond+273.15; pC = psat(f,Tc)
    s1 = PQ(f,pC,0)
    s2, wPs, wP = compress(f, s1, pB, etaP)
    s3 = PT(f, pB, tSup+273.15)
    s4, wTs, wT = expand(f, s3, pC, etaT)
    qIn  = s3['h']-s2['h']
    qOut = s4['h']-s1['h']
    wNet = wT-wP
    return dict(pts={'1':s1,'2':s2,'3':s3,'4':s4}, eff=wNet/qIn, wNet=wNet, wT=wT, wP=wP,
                qIn=qIn, qOut=qOut, x_exh=s4['x'], Pnet=mdot*wNet/1000, PT_=mdot*wT/1000,
                Qin=mdot*qIn/1000, Qout=mdot*qOut/1000,
                Tsource=tSup+273.15, Tsink=Tc)

def reheat(fluid, pB, tSup, pR, tRh, tCond, etaT, etaP, mdot):
    f = fluid
    Tc = tCond+273.15; pC = psat(f,Tc)
    pRc = min(max(pR, pC*1.02), pB*0.98)        # the page clamps; mirror it, flagged separately
    s1 = PQ(f,pC,0)
    s2, _, wP = compress(f, s1, pB, etaP)
    s3 = PT(f, pB, tSup+273.15)
    s4, _, wT1 = expand(f, s3, pRc, etaT)
    s5 = PT(f, pRc, tRh+273.15)
    s6, _, wT2 = expand(f, s5, pC, etaT)
    wT = wT1+wT2
    qIn = (s3['h']-s2['h'])+(s5['h']-s4['h'])
    qOut = s6['h']-s1['h']
    wNet = wT-wP
    return dict(pts={'1':s1,'2':s2,'3':s3,'4':s4,'5':s5,'6':s6}, eff=wNet/qIn, wNet=wNet,
                wT=wT, wP=wP, qIn=qIn, qOut=qOut, x_exh=s6['x'], pR_used=pRc,
                Pnet=mdot*wNet/1000, PT_=mdot*wT/1000, Qin=mdot*qIn/1000, Qout=mdot*qOut/1000,
                Tsource=max(tSup,tRh)+273.15, Tsink=Tc)

def regen(fluid, pB, tSup, tCond, n, etaT, etaP, mdot):
    """Ideal-mixing (open) feedwater heaters, geometric pressure staging (the page's design
    choice for the bleed pressures, adopted here so the comparison is of the thermodynamics)."""
    f = fluid
    Tc = tCond+273.15; pC = psat(f,Tc)
    pe = [pC*(pB/pC)**(i/(n+1.0)) for i in range(1,n+1)]     # ascending
    s3 = PT(f, pB, tSup+273.15)
    # turbine, stage by stage, each stage with the same isentropic efficiency
    hext = {}; st = s3; wT_specific = []
    for pk in list(reversed(pe))+[pC]:
        st_out, _, w = expand(f, st, pk, etaT)
        hext[pk] = st_out['h']; st = st_out
    hExh = st['h']; s_exh = st
    # bleed fractions, highest heater first: y_k h_ext + (S-y_k) h_fw_in = S h_f(p_k)
    S = 1.0; y = {}
    order = list(reversed(pe))
    for i,Ph in enumerate(order):
        Pb = order[i+1] if i+1 < len(order) else pC
        h_in = compress(f, PQ(f,Pb,0), Ph, etaP)[0]['h']     # pump from the heater below
        y[Ph] = S*(PQ(f,Ph,0)['h']-h_in)/(hext[Ph]-h_in)
        S -= y[Ph]
    mCond = 1.0-sum(y.values())
    hBF = compress(f, PQ(f,pe[-1],0), pB, etaP)[0]['h']
    # turbine work with the staged flow
    seg = [pB]+list(reversed(pe))+[pC]
    flow = 1.0; wT = 0.0; hb = s3['h']
    for i in range(len(seg)-1):
        pk = seg[i+1]
        wT += flow*(hb-hext[pk]); hb = hext[pk]
        if pk in y: flow -= y[pk]
    # pump work: condensate pump, inter-heater pumps, feed pump
    wP = mCond*(compress(f,PQ(f,pC,0),pe[0],etaP)[0]['h']-PQ(f,pC,0)['h'])
    for k in range(1,n):
        fk = mCond+sum(y[pe[j]] for j in range(k))
        wP += fk*(compress(f,PQ(f,pe[k-1],0),pe[k],etaP)[0]['h']-PQ(f,pe[k-1],0)['h'])
    wP += 1.0*(compress(f,PQ(f,pe[-1],0),pB,etaP)[0]['h']-PQ(f,pe[-1],0)['h'])
    qIn = s3['h']-hBF
    qOut = mCond*(hExh-PQ(f,pC,0)['h'])
    wNet = wT-wP
    return dict(eff=wNet/qIn, wNet=wNet, wT=wT, wP=wP, qIn=qIn, qOut=qOut,
                bleed=sum(y.values()), y=y, pe=pe, mCond=mCond, x_exh=s_exh['x'],
                Pnet=mdot*wNet/1000, PT_=mdot*wT/1000, Qin=mdot*qIn/1000, Qout=mdot*qOut/1000,
                Tsource=tSup+273.15, Tsink=Tc)

def vcc(fluid, tEvap, tCond, dSh, dSc, etaC, mdot, pGC=None, tGC=None):
    f = fluid
    Te = tEvap+273.15; Tc = tCond+273.15
    pE = psat(f,Te)
    trans = Tc >= Tcrit(f)-0.2
    pH = pGC if trans else psat(f,Tc)
    s1 = PT(f,pE,Te+dSh) if dSh > 0 else PQ(f,pE,1)
    s2, _, wC = compress(f, s1, pH, etaC)
    s3 = PT(f,pH,tGC+273.15) if trans else (PT(f,pH,Tc-dSc) if dSc > 0 else PQ(f,pH,0))
    s4 = PH(f,pE,s3['h'])
    qE = s1['h']-s4['h']; qC = s2['h']-s3['h']
    return dict(pts={'1':s1,'2':s2,'3':s3,'4':s4}, copC=qE/wC, copH=qC/wC, qE=qE, wC=wC, qC=qC,
                QE=mdot*qE, W=mdot*wC, QC=mdot*qC, pE=pE, pH=pH,
                Tsource=Te, Tsink=(tGC+273.15 if trans else Tc))

def vcc_ihx(fluid, tEvap, tCond, dSh, dSc, etaC, eps, mdot, pGC=None, tGC=None):
    f = fluid
    Te = tEvap+273.15; Tc = tCond+273.15
    pE = psat(f,Te); trans = Tc >= Tcrit(f)-0.2
    pH = pGC if trans else psat(f,Tc)
    eps = min(max(eps,0),0.98)
    s6 = PT(f,pE,Te+dSh) if dSh > 0 else PQ(f,pE,1)          # evaporator outlet
    s3 = PT(f,pH,tGC+273.15) if trans else (PT(f,pH,Tc-dSc) if dSc > 0 else PQ(f,pH,0))
    q = eps*(PT(f,pE,s3['T'])['h']-s6['h'])                  # enthalpy-based effectiveness
    s1 = PH(f,pE,s6['h']+q)
    s2, _, wC = compress(f, s1, pH, etaC)
    s4 = PH(f,pH,s3['h']-q)
    s5 = PH(f,pE,s4['h'])
    qE = s6['h']-s5['h']; qC = s2['h']-s3['h']
    return dict(pts={'1':s1,'2':s2,'3':s3,'4':s4,'5':s5,'6':s6}, copC=qE/wC, copH=qC/wC,
                qE=qE, wC=wC, qC=qC, QE=mdot*qE, W=mdot*wC, QC=mdot*qC, pE=pE, pH=pH, q_ihx=q,
                Tsource=Te, Tsink=(tGC+273.15 if trans else Tc))

def vcc_two(fluid, tEvap, tCond, dSh, dSc, etaC, pInter, mdot, pGC=None, tGC=None):
    """Two-stage with a flash tank / open economiser at p_i.  Reference flow = 1 kg/s through
    the evaporator; high-stage flow follows from the flash-tank mass balance."""
    f = fluid
    Te = tEvap+273.15; Tc = tCond+273.15
    pE = psat(f,Te); trans = Tc >= Tcrit(f)-0.2
    pH = pGC if trans else psat(f,Tc)
    pI = pInter if (pInter > pE*1.01 and pInter < pH*0.99) else math.sqrt(pE*pH)
    s1 = PT(f,pE,Te+dSh) if dSh > 0 else PQ(f,pE,1)
    s2, _, w_lp = compress(f, s1, pI, etaC)
    s5 = PT(f,pH,tGC+273.15) if trans else (PT(f,pH,Tc-dSc) if dSc > 0 else PQ(f,pH,0))
    s6 = PH(f,pI,s5['h'])                                    # throttle into the flash tank
    x = min(max(s6['x'] if s6['x'] is not None else 0.0,0.0),1.0)
    s7 = PQ(f,pI,0); s9 = PQ(f,pI,1)
    m = 1.0/(1.0-x)                                          # high-stage flow per kg evaporator
    h3 = (s2['h']+(m-1.0)*s9['h'])/m                         # adiabatic mixing at p_i
    s3 = PH(f,pI,h3)
    s4, _, w_hp = compress(f, s3, pH, etaC)
    s8 = PH(f,pE,s7['h'])
    qE = s1['h']-s8['h']; W = w_lp+m*w_hp; qC = m*(s4['h']-s5['h'])
    return dict(pts={'1':s1,'2':s2,'3':s3,'4':s4,'5':s5,'6':s6,'7':s7,'8':s8,'9':s9},
                copC=qE/W, copH=qC/W, qE=qE, wC=W, qC=qC, QE=mdot*qE, W=mdot*W, QC=mdot*qC,
                pE=pE, pI=pI, pH=pH, x_flash=x, m_high=m,
                Tsource=Te, Tsink=(tGC+273.15 if trans else Tc))

# ---------------------------------------------------------------- second-law helpers
def carnot_eff(Th,Tc): return 1.0-Tc/Th
def carnot_copC(Tc,Th): return Tc/(Th-Tc)

if __name__ == '__main__':
    r = rankine('Water',12,540,33,0.88,0.80,100)
    print('rankine eff %.5f  wnet %.3f  qin %.3f  x %.4f' % (r['eff'],r['wNet'],r['qIn'],r['x_exh']))
    print('balance qin-qout-wnet = %.3e' % (r['qIn']-r['qOut']-r['wNet']))
    print('carnot', carnot_eff(r['Tsource'],r['Tsink']))
    g = regen('Water',12,540,33,2,0.88,0.80,100)
    print('regen eff %.5f bleed %.4f' % (g['eff'],g['bleed']), 'balance', g['qIn']-g['qOut']-g['wNet'])
    v = vcc('R134a',-10,40,5,5,0.75,1)
    print('vcc copC %.4f copH %.4f' % (v['copC'],v['copH']), 'bal', v['qE']+v['wC']-v['qC'])
    t = vcc_two('R134a',-10,40,5,5,0.75,0,1)
    print('two copC %.4f' % t['copC'], 'bal', t['qE']+t['wC']-t['qC'])
    i = vcc_ihx('R134a',-10,40,5,5,0.75,0.5,1)
    print('ihx copC %.4f' % i['copC'], 'bal', i['qE']+i['wC']-i['qC'])
