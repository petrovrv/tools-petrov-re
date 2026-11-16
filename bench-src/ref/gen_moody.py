import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
from scipy.optimize import brentq
from CoolProp.CoolProp import PropsSI

# ---------------------------------------------------------------------------
# INDEPENDENT reference implementation.
# Colebrook-White:  1/sqrt(f) = -2 log10( (eps/D)/3.7 + 2.51/(Re sqrt(f)) )
# solved as a root of  g(x) = x + 2 log10( relEps/3.7 + 2.51 x / Re ),  x = 1/sqrt(f)
# with scipy.optimize.brentq to machine precision, PLUS an independent
# fixed-point iteration to 1e-15 as a cross-check.
# ---------------------------------------------------------------------------
def colebrook_brentq(Re, relEps):
    g = lambda x: x + 2.0*math.log10(relEps/3.7 + 2.51*x/Re)
    lo, hi = 1e-6, 1e3
    # g(lo) very negative, g(hi) positive
    x = brentq(g, lo, hi, xtol=1e-15, rtol=8.9e-16, maxiter=500)
    return 1.0/(x*x)

def colebrook_fixedpoint(Re, relEps, tol=1e-15):
    x = -2.0*math.log10(relEps/3.7 + 12.0/Re)   # start
    for _ in range(2000):
        xn = -2.0*math.log10(relEps/3.7 + 2.51*x/Re)
        if abs(xn-x) < tol*max(1.0, abs(x)):
            x = xn; break
        x = xn
    return 1.0/(x*x)

def prandtl_smooth(Re):
    "Prandtl / von Karman-Nikuradse smooth-pipe law 1/sqrt(f)=2log10(Re sqrt f)-0.8"
    g = lambda x: x - (2.0*math.log10(Re/x) - 0.8) if False else None
    # solve 1/sqrt(f) = 2 log10(Re sqrt(f)) - 0.8 ; let y=1/sqrt(f) -> y = 2log10(Re/y)-0.8
    h = lambda y: y - (2.0*math.log10(Re/y) - 0.8)
    y = brentq(h, 1.0, 100.0, xtol=1e-14)
    return 1.0/(y*y)

def von_karman_rough(relEps):
    "Fully rough: 1/sqrt(f) = -2 log10(relEps/3.7)"
    x = -2.0*math.log10(relEps/3.7)
    return 1.0/(x*x)

def f_ref(Re, relEps):
    "Full reference friction factor incl. laminar branch"
    if Re < 2300: return 64.0/Re
    return colebrook_brentq(Re, relEps)

# --- tool's own material / fluid tables (used only to know WHICH physical
# --- state the tool is in; the physics itself is computed independently) ----
MAT_EPS_MM = {'drawn':0.0015,'steel':0.045,'spiral':0.10,'stainless':0.015,
  'sanitary':0.0008,'electropol':0.0004,'galv':0.15,'copper':0.0015,'alu':0.0015,
  'titanium':0.015,'inconel':0.015,'castiron':0.26,'ductile':0.30,'riveted':3.0,
  'pvc':0.0015,'hdpe':0.0015,'pp':0.0015,'pex':0.007,'pvdf':0.0015,'ptfe':0.0015,
  'grp':0.02,'glass':0.0015,'concrete':0.6,'asbestos':0.05,'woodstave':0.5}
DN_MM = {15:15.8,20:21.0,25:27.0,32:35.9,40:41.9,50:53.1,65:68.8,80:80.9,
  100:105.3,125:130.0,150:154.1,200:202.7,250:254.5,300:304.8,350:336.6,
  400:387.4,500:489.0,600:590.6,800:790.0,1000:990.0}

G = 9.80665

def water_props_coolprop(tC, p_bar):
    T = tC+273.15; P = p_bar*1e5
    return PropsSI('D','T',T,'P',P,'Water'), PropsSI('V','T',T,'P',P,'Water')

def air_props_coolprop(tC, p_bar):
    T = tC+273.15; P = p_bar*1e5
    return PropsSI('D','T',T,'P',P,'Air'), PropsSI('V','T',T,'P',P,'Air')

cases = []

# =========== GROUP 1: raw Colebrook table (tool's own "show table") =========
EPS_TABLE = [5e-2, 2e-2, 6e-3, 2e-3, 6e-4, 2e-4, 5e-5, 1e-5, 1e-6]
RE_TABLE  = [1e4, 1e5, 1e6, 1e7, 1e8]
tbl = []
for e in EPS_TABLE:
    row = []
    for R in RE_TABLE:
        fb = colebrook_brentq(R, e)
        ff = colebrook_fixedpoint(R, e)
        row.append({'Re':R,'eps':e,'f':fb,'crosscheck_rel':abs(fb-ff)/fb})
    tbl.append(row)
cases.append({'id':'colebrook-table','kind':'table','note':
  'Tool "show table" checkbox prints colebrook(Re,eps/D) directly for a 9x5 grid. '
  'Reference: brentq root of the Colebrook-White equation, cross-checked against a '
  'fixed-point iteration to 1e-15.','table':tbl})

# =========== GROUP 2: full hydraulic cases via the main UI ==================
# water table nodes of the tool are on the saturation line; at these T the tool's
# lerp is exact so rho/mu are unambiguous. We ALSO carry the CoolProp values.
W_T   = [0,10,20,30,40,50,60,70,80,90,100,120,140,160,180,200,220,240,260,280,300,320,340,350]
W_RHO = [999.8,999.7,998.2,995.6,992.2,988.0,983.2,977.8,971.8,965.3,958.4,943.1,926.1,
         907.4,886.9,864.7,840.3,813.6,784.0,750.7,712.5,667.1,610.2,574.7]
W_MU  = [x*1e-3 for x in [1.792,1.307,1.002,0.798,0.653,0.547,0.467,0.404,0.355,0.315,
         0.282,0.232,0.1961,0.1704,0.1491,0.1319,0.1198,0.1098,0.1018,0.0932,0.0859,
         0.0783,0.0703,0.0659]]
WTAB = dict(zip(W_T, zip(W_RHO, W_MU)))

def hyd(cid, note, mat, D_mm, v, tC, p_bar, L, sumK, dz=0.0, eta=70.0, g=G,
        fluid='water', expect_regime=None):
    D = D_mm/1000.0
    eps = MAT_EPS_MM[mat]/1000.0
    rho_t, mu_t = WTAB[tC]                       # tool's declared property source
    rho_cp, mu_cp = water_props_coolprop(tC, p_bar)
    Re_t  = rho_t*v*D/mu_t
    Re_cp = rho_cp*v*D/mu_cp
    rel = eps/D
    f = f_ref(Re_t, rel)
    hMaj = f*(L/D)*v*v/(2*g)
    hMin = sumK*v*v/(2*g)
    dpFric = rho_t*g*(hMaj+hMin)
    dpElev = rho_t*g*dz
    dpTot  = dpFric+dpElev
    Q = v*math.pi*D*D/4
    power = Q*dpTot/(eta/100.0)
    return {'id':cid,'kind':'hydraulic','note':note,
      'inputs':{'fluid':fluid,'t':tC,'p':p_bar,'mat':mat,'dcustom':D_mm,'v':v,
                'L':L,'sumK':sumK,'dz':dz,'eta':eta,'g':g},
      'ref':{'Re':Re_t,'f':f,'rho':rho_t,'nu':mu_t/rho_t,'v':v,'Q_m3h':Q*3600,
             'hMaj':hMaj,'hMin':hMin,'hF':hMaj+hMin,'dpFric_bar':dpFric/1e5,
             'dpElev_bar':dpElev/1e5,'dpTot_bar':dpTot/1e5,'power_kW':power/1000,
             'relEps':rel,'kPlus':rel*Re_t*math.sqrt(f/8) if Re_t>=4000 else None},
      'coolprop':{'rho':rho_cp,'mu':mu_cp,'Re':Re_cp,
                  'rho_rel_dev':abs(rho_t-rho_cp)/rho_cp,
                  'mu_rel_dev':abs(mu_t-mu_cp)/mu_cp,
                  'Re_rel_dev':abs(Re_t-Re_cp)/Re_cp},
      'expect_regime':expect_regime if expect_regime else (
          'laminar' if Re_t<2300 else 'critical' if Re_t<4000 else
          'smooth' if rel*Re_t*math.sqrt(f/8)<5 else
          'rough' if rel*Re_t*math.sqrt(f/8)>70 else 'transitional')}

# turbulent, ordinary steel
cases.append(hyd('h-steel-100','commercial steel DN100-ish, water 20C, 2 m/s','steel',105.3,2.0,20,3.0,100,0.0))
cases.append(hyd('h-steel-100-K','same with minor losses sumK=2 and lift dz=+10 m','steel',105.3,2.0,20,3.0,100,2.0,dz=10.0))
# long line -> large dp so the 3-decimal bar display resolves f finely
cases.append(hyd('h-long-line','2000 m steel line, water 20C, 3 m/s (dp ~ tens of bar)','steel',105.3,3.0,20,10.0,2000,0.0))
cases.append(hyd('h-smooth-big','electropolished, D=4000 mm, v=5 m/s -> eps/D=1e-7, Re~2e7','electropol',4000.0,5.0,20,3.0,1000,0.0))
cases.append(hyd('h-rough-riveted','riveted steel eps=3mm, D=100mm -> eps/D=0.03, fully rough','riveted',100.0,4.0,20,3.0,100,0.0))
cases.append(hyd('h-hot-water','water 200 C (sat-line props), steel, 2 m/s','steel',105.3,2.0,200,20.0,100,0.0))
cases.append(hyd('h-cold-visc','water 0 C, drawn tube D=25mm, v=0.5 m/s','drawn',25.0,0.5,0,3.0,50,0.0))
# laminar
cases.append(hyd('h-laminar','laminar: D=4mm, v=0.05 m/s, water 20C -> Re~200','drawn',4.0,0.05,20,3.0,10,0.0))
cases.append(hyd('h-laminar-2','laminar near the 2300 boundary: D=10mm v=0.2 m/s -> Re~1993','drawn',10.0,0.2,20,3.0,10,0.0))
# very high Re
cases.append(hyd('h-veryhigh-Re','water 20C, D=1000mm, v=10 m/s -> Re ~ 1e7','steel',1000.0,10.0,20,10.0,1000,0.0))

cases.append(hyd('h-veryhigh-Re2','water 20C, D=4000mm, v=25 m/s -> Re ~ 1e8 (top of the Moody chart)','steel',4000.0,25.0,20,10.0,1000,0.0))
cases.append(hyd('h-eps-extreme','riveted eps=3mm in D=50mm -> eps/D=0.06, OUTSIDE the Colebrook range','riveted',50.0,2.0,20,3.0,50,0.0))
cases.append(hyd('h-downhill','downhill leg dz=-20 m: static term must be negative','steel',105.3,2.0,20,3.0,100,0.0,dz=-20.0))

# --- transition-zone cases: the tool BLENDS 64/Re and Colebrook linearly.
# Reference records BOTH the pure branches and the tool's declared blend, so we
# can state exactly what it does rather than assume.
def crit(cid, note, mat, D_mm, v, tC, p_bar, L):
    D = D_mm/1000.; eps = MAT_EPS_MM[mat]/1000.; rho, mu = WTAB[tC]
    Re = rho*v*D/mu; rel = eps/D
    f_lam = 64.0/Re
    f_turb = colebrook_brentq(Re, rel)
    t_ = (Re-2300.)/(4000.-2300.)
    f_blend = f_lam*(1-t_) + f_turb*t_
    return {'id':cid,'kind':'critical','note':note,
      'inputs':{'fluid':'water','t':tC,'p':p_bar,'mat':mat,'dcustom':D_mm,'v':v,'L':L,'sumK':0.0,'dz':0.0,'eta':70.0,'g':G},
      'ref':{'Re':Re,'f_laminar_64_Re':f_lam,'f_colebrook':f_turb,
             'f_tool_declared_blend':f_blend,'relEps':rel,'rho':rho}}
cases.append(crit('c-2500','critical zone Re~2500','drawn',10.0,0.26,20,3.0,10))
cases.append(crit('c-3200','critical zone Re~3200','drawn',10.0,0.33,20,3.0,10))
cases.append(crit('c-3900','critical zone just below 4000','drawn',10.0,0.40,20,3.0,10))

# --- limits ---------------------------------------------------------------
lim = {'id':'limits','kind':'analytic','note':'smooth-pipe and fully-rough limits of Colebrook',
  'smooth':[{'Re':R,'f_colebrook_eps0':colebrook_brentq(R,0.0),
             'f_prandtl':prandtl_smooth(R),
             'rel_dev':abs(colebrook_brentq(R,0.0)-prandtl_smooth(R))/prandtl_smooth(R)}
            for R in [1e4,1e5,1e6,1e7,1e8]],
  'rough':[{'relEps':e,'f_vonkarman':von_karman_rough(e),
            'f_colebrook_Re1e8':colebrook_brentq(1e8,e),
            'rel_dev':abs(colebrook_brentq(1e8,e)-von_karman_rough(e))/von_karman_rough(e)}
           for e in [0.05,0.02,0.006,0.002,0.0006]]}
cases.append(lim)

# --- explicit approximations, for the "is it really Colebrook?" question ---
def haaland(Re, e):
    return 1.0/( -1.8*math.log10((e/3.7)**1.11 + 6.9/Re) )**2
def swamee_jain(Re, e):
    return 0.25/ (math.log10(e/3.7 + 5.74/Re**0.9))**2
approx = [{'Re':R,'relEps':e,'colebrook':colebrook_brentq(R,e),
           'haaland':haaland(R,e),'swamee_jain':swamee_jain(R,e),
           'haaland_rel':abs(haaland(R,e)-colebrook_brentq(R,e))/colebrook_brentq(R,e),
           'swamee_rel':abs(swamee_jain(R,e)-colebrook_brentq(R,e))/colebrook_brentq(R,e)}
          for R in [1e4,1e5,1e6,1e7] for e in [0.0,1e-4,1e-3,1e-2]]
cases.append({'id':'approx-discriminators','kind':'analytic',
  'note':'Colebrook vs Haaland vs Swamee-Jain at the same points; used to decide '
         'which correlation the tool actually implements.','points':approx})

# --- CoolProp property survey for water (independent of the tool) ---------
survey = []
for tC in [0,10,20,40,60,80,100,140,180,200,240,280,300,340]:
    rho_t, mu_t = WTAB[tC]
    for p_bar in [3.0, 10.0, 50.0, 100.0, 200.0, 300.0]:
        try:
            psat = PropsSI('P','T',tC+273.15,'Q',0,'Water')/1e5
        except Exception:
            psat = float('nan')
        if p_bar < psat: continue
        rho_cp, mu_cp = water_props_coolprop(tC, p_bar)
        survey.append({'t':tC,'p_bar':p_bar,'psat_bar':psat,
          'rho_tool_table':rho_t,'rho_coolprop':rho_cp,'rho_rel':abs(rho_t-rho_cp)/rho_cp,
          'mu_tool_table':mu_t,'mu_coolprop':mu_cp,'mu_rel':abs(mu_t-mu_cp)/mu_cp})
cases.append({'id':'water-property-survey','kind':'property',
  'note':'Tool stores saturation-line rho/mu and applies them at any pressure. '
         'CoolProp (IAPWS-95) evaluated at the actual (T,p).','points':survey})


# --- CoolProp property survey for AIR (second fluid the tool offers) -------
air_pts = []
for tC, p_bar in [(-40,1.0),(0,1.0),(20,1.0),(20,7.0),(20,50.0),(20,100.0),(20,200.0),
                  (200,10.0),(400,10.0),(600,10.0),(800,10.0),(500,100.0)]:
    rho_cp, mu_cp = air_props_coolprop(tC, p_bar)
    air_pts.append({'t':tC,'p_bar':p_bar,'rho_coolprop':rho_cp,'mu_coolprop':mu_cp,
                    'nu_coolprop':mu_cp/rho_cp})
cases.append({'id':'air-property-survey','kind':'property',
  'note':'CoolProp (Lemmon et al. 2000 air EOS + transport) at the actual (T,p). '
         'Tool declares +-2% on air properties (+-12% above 100 bar).',
  'points':air_pts})

out = {'generated_by':'bench-src/ref/gen_moody.py',
  'reference':'Colebrook-White solved with scipy brentq to machine precision, '
              'cross-checked against a fixed-point iteration to 1e-15; '
              'Darcy-Weisbach closed form; CoolProp (IAPWS-95 / Lemmon air) for fluid properties.',
  'cases':cases}
json.dump(out, open(_gp.ref('moodydiagram_ref.json'),'w'), indent=1)
print('cases:', len(cases))
print('max crosscheck (brentq vs fixed point):',
      max(c['crosscheck_rel'] for row in tbl for c in row))
print('smooth limit dev colebrook(eps=0) vs Prandtl:', [round(s['rel_dev'],6) for s in lim['smooth']])
print('rough limit dev:', [round(s['rel_dev'],6) for s in lim['rough']])
