import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
from scipy.optimize import brentq
from CoolProp.CoolProp import PropsSI
def colebrook_brentq(Re, relEps):
    g = lambda x: x + 2.0*math.log10(relEps/3.7 + 2.51*x/Re)
    return 1.0/brentq(g,1e-6,1e3,xtol=1e-15,rtol=8.9e-16,maxiter=500)**2
def colebrook_fp(Re, relEps):
    x=-2.0*math.log10(relEps/3.7+12.0/Re)
    for _ in range(4000):
        xn=-2.0*math.log10(relEps/3.7+2.51*x/Re)
        if abs(xn-x)<1e-15*max(1.0,abs(x)): x=xn;break
        x=xn
    return 1.0/(x*x)
def f_ref(Re,rel): return 64.0/Re if Re<2300 else colebrook_brentq(Re,rel)
MAT_EPS_MM = {'drawn':0.0015,'steel':0.045,'spiral':0.10,'stainless':0.015,
  'sanitary':0.0008,'electropol':0.0004,'galv':0.15,'copper':0.0015,'alu':0.0015,
  'titanium':0.015,'inconel':0.015,'castiron':0.26,'ductile':0.30,'riveted':3.0,
  'pvc':0.0015,'hdpe':0.0015,'pp':0.0015,'pex':0.007,'pvdf':0.0015,'ptfe':0.0015,
  'grp':0.02,'glass':0.0015,'concrete':0.6,'asbestos':0.05,'woodstave':0.5}
def wprops(tC,pbar):
    T=tC+273.15; P=pbar*1e5
    return PropsSI('D','T',T,'P',P,'Water'), PropsSI('V','T',T,'P',P,'Water')

d=json.load(open(_gp.ref('moodydiagram_ref.json')))
for c in d['cases']:
    inp=c['inputs'] if 'inputs' in c else None
    if c.get('kind')=='hydraulic':
        D=inp['dcustom']/1000.0; eps=MAT_EPS_MM[inp['mat']]/1000.0; rel=eps/D
        v=inp['v']; L=inp['L']; sumK=inp['sumK']; dz=inp['dz']; eta=inp['eta']; g=inp['g']
        rho,mu=wprops(inp['t'],inp['p'])
        Re=rho*v*D/mu
        f=f_ref(Re,rel)
        hMaj=f*(L/D)*v*v/(2*g); hMin=sumK*v*v/(2*g)
        dpFric=rho*g*(hMaj+hMin); dpElev=rho*g*dz; dpTot=dpFric+dpElev
        Q=v*math.pi*D*D/4; power=Q*dpTot/(eta/100.0)
        kPlus = rel*Re*math.sqrt(f/8) if Re>=4000 else None
        c['ref']={'Re':Re,'f':f,'rho':rho,'nu':mu/rho,'v':v,'Q_m3h':Q*3600,
          'hMaj':hMaj,'hMin':hMin,'hF':hMaj+hMin,'dpFric_bar':dpFric/1e5,
          'dpElev_bar':dpElev/1e5,'dpTot_bar':dpTot/1e5,'power_kW':power/1000,
          'relEps':rel,'kPlus':kPlus}
        c['coolprop']={'rho':rho,'mu':mu,'Re':Re,'crosscheck_colebrook_rel':
                       abs(f-(64.0/Re if Re<2300 else colebrook_fp(Re,rel)))/f}
        c['property_source']='CoolProp (IAPWS-95 / IAPWS R12-08) at the case (T,p) - fully independent of the tool'
        c['expect_regime']=('laminar' if Re<2300 else 'critical' if Re<4000 else
            'smooth' if kPlus<5 else 'rough' if kPlus>70 else 'transitional')
        c['note']=c['note'].replace('(sat-line props)','').replace('  ',' ').strip()
    elif c.get('kind')=='critical':
        D=inp['dcustom']/1000.0; eps=MAT_EPS_MM[inp['mat']]/1000.0; rel=eps/D
        rho,mu=wprops(inp['t'],inp['p']); Re=rho*inp['v']*D/mu
        f_lam=64.0/Re; f_turb=colebrook_brentq(Re,rel)
        tt=(Re-2300.)/(4000.-2300.)
        c['ref']={'Re':Re,'f_laminar_64_Re':f_lam,'f_colebrook':f_turb,
          'f_tool_declared_blend':f_lam*(1-tt)+f_turb*tt,'relEps':rel,'rho':rho}
        c['property_source']='CoolProp (IAPWS-95) at the case (T,p)'
json.dump(d,open(_gp.ref('moodydiagram_ref.json'),'w'),indent=1)
print('regenerated')
for c in d['cases']:
    if c.get('kind')=='hydraulic': print(c['id'],'Re=%.6g f=%.6g rho=%.6g'%(c['ref']['Re'],c['ref']['f'],c['ref']['rho']))
