#!/usr/bin/env python3
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math, itertools, sys
sys.path.insert(0,_gp.REF_DIR)
from tc_model import *

D = dict(fluid='Water', family='power', ptype='rankine', comp='single', axis='Ts',
         pBoiler=12, tSup=540, pReheat=2.5, tReheat=540, nFwh=2, tCondP=33,
         etaT=0.88, etaP=0.80, mdotP=100, tEvap=-10, tCond=40, dSh=5, dSc=5,
         pInter=0, pGC=9, tGC=35, etaC=0.75, mdotR=1, ihx=False, ihxEff=0.5)

cases = []
def add(cid, note, **kw):
    c = dict(D); c.update(kw); cases.append(dict(id=cid, note=note, inputs=c))

# ---------------- power: simple Rankine
n=0
for pB,tS,tC,et,ep in [(12,540,33,0.88,0.80),(8,500,30,0.85,0.75),(20,600,20,0.90,0.85),
                       (3,400,45,0.80,0.70),(16,565,40,1.0,1.0),(6,450,35,0.75,0.65),
                       (0.5,300,50,0.85,0.80),(22,600,15,0.92,0.88)]:
    n+=1; add('rank%02d'%n,'simple Rankine, water',ptype='rankine',pBoiler=pB,tSup=tS,tCondP=tC,etaT=et,etaP=ep)
# ---------------- power: reheat
n=0
for pB,tS,pR,tR,tC,et in [(12,540,2.5,540,33,0.88),(16,565,4,565,30,0.88),(20,600,5,620,33,0.90),
                          (10,500,1.5,480,40,0.85),(24,600,6,600,25,1.0)]:
    n+=1; add('rh%02d'%n,'reheat Rankine, water',ptype='reheat',pBoiler=pB,tSup=tS,pReheat=pR,tReheat=tR,tCondP=tC,etaT=et)
add('rh_clampHi','reheat pressure above the boiler pressure — must be refused, not silently clamped',ptype='reheat',pReheat=30)
add('rh_clampLo','reheat pressure below the condenser pressure — must be refused, not silently clamped',ptype='reheat',pReheat=0.001)
# ---------------- power: regeneration
n=0
for nf,pB,tS,tC in [(1,12,540,33),(2,12,540,33),(3,12,540,33),(2,20,600,30),(3,8,480,40),(1,16,565,25)]:
    n+=1; add('reg%02d'%n,'regenerative Rankine, %d open FWH'%nf,ptype='regen',nFwh=nf,pBoiler=pB,tSup=tS,tCondP=tC)
# ---------------- refrigeration: single stage
n=0
for f,te,tc,sh,sc,ec in [('R134a',-10,40,5,5,0.75),('R717',-25,35,8,3,0.80),('R290',-15,45,5,2,0.72),
                         ('R32',-5,50,10,5,0.70),('R410A',0,45,6,4,0.78),('R600a',-20,40,4,3,0.68),
                         ('R1234yf',-10,40,5,5,0.75),('R134a',5,55,0,0,0.85),('R717',-40,30,10,10,0.65),
                         ('R134a',-30,25,3,1,0.60)]:
    n+=1; add('vcc%02d'%n,'single-stage vapour compression, %s'%f,family='ref',comp='single',fluid=f,
              tEvap=te,tCond=tc,dSh=sh,dSc=sc,etaC=ec)
# ---------------- refrigeration: IHX
n=0
for f,te,tc,eps in [('R134a',-10,40,0.5),('R1234yf',-15,40,0.8),('R290',-20,45,0.3),('R134a',-10,40,0.0),('R600a',-15,40,0.98)]:
    n+=1; add('ihx%02d'%n,'single-stage with internal heat exchanger, %s'%f,family='ref',comp='single',
              fluid=f,tEvap=te,tCond=tc,ihx=True,ihxEff=eps)
# ---------------- refrigeration: two-stage
n=0
for f,te,tc,pi in [('R134a',-30,40,0),('R717',-40,35,0),('R290',-35,45,0.35),('R32',-25,45,0),
                   ('R134a',-30,40,0.25),('R134a',-30,40,99)]:   # the last one is out of range
    n+=1; add('two%02d'%n,('two-stage with flash economiser, %s'%f) if pi!=99 else
              'two-stage: intermediate pressure above the high pressure — must be refused, not silently replaced',
              family='ref',comp='two',fluid=f,tEvap=te,tCond=tc,pInter=pi)
# ---------------- transcritical CO2
n=0
for te,pgc,tgc,ec in [(-10,9,35,0.75),(0,10,32,0.72),(-20,8.5,38,0.70)]:
    n+=1; add('co2t%02d'%n,'transcritical CO2, gas cooler',family='ref',comp='single',fluid='R744',
              tEvap=te,tCond=40,pGC=pgc,tGC=tgc,etaC=ec)
add('co2sub','subcritical CO2 (condensing at 25 C)',family='ref',comp='single',fluid='R744',tEvap=-20,tCond=25,dSh=5,dSc=2)
# ---------------- out-of-range / refusal cases
add('gd_condTc','condensing temperature above the critical point (power) — must refuse',ptype='rankine',tCondP=400)
add('gd_sup','superheat above the property-library limit — must refuse',ptype='rankine',tSup=2000)
add('gd_order','evaporating temperature above condensing temperature — must refuse',family='ref',tEvap=50,tCond=40)
add('gd_evapmin','evaporating temperature below the triple point — must refuse',family='ref',fluid='R134a',tEvap=-120)
add('gd_pb','boiler pressure of zero — must refuse',ptype='rankine',pBoiler=0)
add('gd_etaT_gt1','turbine isentropic efficiency above 1 — entropy would fall across the expansion, must refuse',ptype='rankine',etaT=1.2)
add('gd_etaP_zero','pump isentropic efficiency of zero — infinite work, must refuse',ptype='rankine',etaP=0)
add('gd_etaC_gt1','compressor isentropic efficiency above 1 — must refuse',family='ref',fluid='R134a',etaC=1.4)
add('gd_etaT_zero','turbine isentropic efficiency of zero — no work, must refuse',ptype='rankine',etaT=0)
add('gd_liquid_inlet','turbine inlet below the saturation temperature of the boiler pressure (compressed liquid) — must refuse',ptype='rankine',pBoiler=12,tSup=200)
add('gd_ihxEff_gt1','internal-heat-exchanger effectiveness above 1 — must refuse',family='ref',fluid='R134a',ihx=True,ihxEff=1.5)

# ---------------- reference evaluation
def ev(c):
    i = c['inputs']; f = i['fluid']
    if i['family']=='power':
        if i['ptype']=='rankine':
            r = rankine(f,i['pBoiler'],i['tSup'],i['tCondP'],i['etaT'],i['etaP'],i['mdotP'])
        elif i['ptype']=='reheat':
            r = reheat(f,i['pBoiler'],i['tSup'],i['pReheat'],i['tReheat'],i['tCondP'],i['etaT'],i['etaP'],i['mdotP'])
        else:
            r = regen(f,i['pBoiler'],i['tSup'],i['tCondP'],i['nFwh'],i['etaT'],i['etaP'],i['mdotP'])
        out = {'eff_pct':100*r['eff'],'Pnet_MW':r['Pnet'],'Pturb_MW':r['PT_'],
               'Qin_MW':r['Qin'],'Qout_MW':r['Qout']}
        if i['ptype']=='regen': out['bleed_pct']=100*r['bleed']
        else: out['x_exh']=r['x_exh']
        out['carnot_eff'] = carnot_eff(r['Tsource'],r['Tsink'])
    else:
        if i['comp']=='two':
            r = vcc_two(f,i['tEvap'],i['tCond'],i['dSh'],i['dSc'],i['etaC'],i['pInter'],i['mdotR'],i['pGC'],i['tGC'])
        elif i['ihx']:
            r = vcc_ihx(f,i['tEvap'],i['tCond'],i['dSh'],i['dSc'],i['etaC'],i['ihxEff'],i['mdotR'],i['pGC'],i['tGC'])
        else:
            r = vcc(f,i['tEvap'],i['tCond'],i['dSh'],i['dSc'],i['etaC'],i['mdotR'],i['pGC'],i['tGC'])
        out = {'copC':r['copC'],'copH':r['copH'],'Qcool_kW':r['QE'],'Wcomp_kW':r['W'],'Qcond_kW':r['QC'],
               'pE_MPa':r['pE'],'pH_MPa':r['pH']}
        if i['comp']=='two': out['pI_MPa']=r['pI']
        out['carnot_copC'] = carnot_copC(r['Tsource'],r['Tsink'])
    pts = r.get('pts')
    if pts: out['pts'] = {k:{q:v[q] for q in ('p','T','h','s','v','x')} for k,v in pts.items()}
    return out

REFUSE = {'rh_clampHi','rh_clampLo','two06'}   # out-of-range input: a message, not a clamped number
for c in cases:
    if c['id'].startswith('gd_') or c['id'] in REFUSE:
        c['expect'] = 'refuse'; continue
    try:
        c['ref'] = ev(c); c['expect'] = 'value'
    except Exception as e:
        c['ref'] = None; c['expect'] = 'error'; c['ref_error'] = str(e)
        print('REF ERROR', c['id'], e)

import CoolProp
out = sys.argv[1] if len(sys.argv)>1 else _gp.ref('thermodynamiccycles_ref.json')
print(len(cases),'cases, CoolProp',CoolProp.__version__)
json.dump({'tool':'thermodynamiccycles',
           'generated_by':'tcref.py — independent cycle algebra (first/second law, component by component); properties from CoolProp '+CoolProp.__version__,
           'coolprop_version':CoolProp.__version__,'cases':cases}, open(out,'w'), indent=1)
