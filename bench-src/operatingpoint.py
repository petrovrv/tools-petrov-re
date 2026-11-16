import json, math, random, re, subprocess, pathlib, statistics
from scipy.optimize import brentq
from scipy.interpolate import PchipInterpolator

ROOT=pathlib.Path(__file__).resolve().parents[1]
HTML=ROOT/'operatingpoint.html'
text=HTML.read_text(encoding='utf-8')
# Extract the final inline application script and cut before DOM event wiring.
start=text.rfind("<script>\n(()=>{'use strict';")
if start<0: raise SystemExit('app script not found')
script=text[start+len('<script>\n'):]
cut=script.find("for(const id of ['speed','dvalve','svalve','z2','diam','temp','length','rough'])$(id).addEventListener")
if cut<0: raise SystemExit('event wiring marker not found')
prefix=script[:cut]

rng=random.Random(20260813)

def pump_state(i):
    return dict(
        speed=rng.uniform(65,115), pumps=rng.choice([1,1,1,2,3]),
        dvalve=rng.uniform(28,100), svalve=rng.uniform(55,100),
        z2=rng.uniform(5,22), diam=rng.uniform(80,140), temp=rng.uniform(8,82),
        length=rng.uniform(30,180), rough=rng.uniform(.01,.25),
    )

def fan_state(i):
    return dict(
        speed=rng.uniform(60,115), fans=rng.choice([1,1,1,2,3]), damper=rng.uniform(35,100),
        filterLoad=rng.uniform(0,85), temp=rng.uniform(-10,45), pressureKPa=rng.uniform(85,105),
        ductLossRef=rng.uniform(80,360), coilLossRef=rng.uniform(60,260),
        systemEffectRef=rng.uniform(0,120),
    )

pump_points=[
 {'q':0.004,'h':42,'eta':.44,'pshaft':2200,'npshr':1.8},
 {'q':0.008,'h':40,'eta':.58,'pshaft':3000,'npshr':2.0},
 {'q':0.012,'h':36.5,'eta':.70,'pshaft':3900,'npshr':2.3},
 {'q':0.016,'h':31.5,'eta':.79,'pshaft':4800,'npshr':2.7},
 {'q':0.020,'h':25.0,'eta':.82,'pshaft':5600,'npshr':3.2},
 {'q':0.024,'h':17.0,'eta':.75,'pshaft':6200,'npshr':4.0},
 {'q':0.028,'h':7.5,'eta':.58,'pshaft':6500,'npshr':5.2},
]
fan_points=[
 {'q':0,'h':780,'eta':.20,'pshaft':900},
 {'q':1,'h':900,'eta':.37,'pshaft':1800},
 {'q':2,'h':1010,'eta':.56,'pshaft':2800},
 {'q':3,'h':1000,'eta':.72,'pshaft':3900},
 {'q':4,'h':920,'eta':.83,'pshaft':4700},
 {'q':5,'h':760,'eta':.79,'pshaft':5200},
 {'q':6,'h':540,'eta':.63,'pshaft':5600},
 {'q':7,'h':250,'eta':.38,'pshaft':5900},
]

cases=[]
for i in range(70): cases.append({'kind':'pump_demo','state':pump_state(i)})
for i in range(30):
    s=pump_state(i); s.update(speed=rng.uniform(80,110),pumps=rng.choice([1,2]),z2=rng.uniform(7,17),diam=rng.uniform(95,135),dvalve=rng.uniform(55,100),svalve=rng.uniform(80,100))
    cases.append({'kind':'pump_import','state':s,'points':pump_points})
for i in range(70): cases.append({'kind':'fan_demo','state':fan_state(i)})
for i in range(30):
    s=fan_state(i); s.update(speed=rng.uniform(75,110),fans=rng.choice([1,2]),damper=rng.uniform(55,100),filterLoad=rng.uniform(0,55))
    cases.append({'kind':'fan_import','state':s,'points':fan_points})

runner = prefix + "\nconst __cases="+json.dumps(cases,separators=(',',':'))+";\n" + r'''
const __out=[];
for(const c of __cases){
  if(c.kind.startsWith('pump')){
    S={...defaults,...c.state};
    machine=c.kind==='pump_import'?{mode:'imported',manufacturer:'Benchmark',model:'Synthetic',source:'benchmark',points:c.points,allowExtrap:false,powerKind:'shaft',limits:{}}:{mode:'demo',manufacturer:'demo',model:'Generic demo pump',source:'',points:[],allowExtrap:false,powerKind:'shaft',limits:{}};
    const r=solve();
    __out.push(r&&r.ok?{ok:true,Q:r.Q,H:r.H,eta:r.eta,Ps:r.Ps,Pe:r.Pe,Na:r.Na,Nr:r.Nr,f:r.sy.f,Re:r.sy.Re}: {ok:false,reason:r&&r.reason});
  } else {
    F={...fanDefaults,...c.state};
    fanMachine=c.kind==='fan_import'?{mode:'imported',manufacturer:'Benchmark',model:'Synthetic',source:'benchmark',points:c.points,allowExtrap:false,powerKind:'shaft',limits:{rhoRef:1.2,pressureBasis:'total'}}:{mode:'demo',manufacturer:'demo',model:'Generic backward-curved fan',source:'',points:[],allowExtrap:false,powerKind:'shaft',limits:{rhoRef:1.2,pressureBasis:'total'}};
    const r=fanSolve();
    __out.push(r&&r.ok?{ok:true,Q:r.Q,dp:r.dp,eta:r.eta,Ps:r.Ps,Pe:r.Pe,rho:r.sy.rho,roots:r.roots.length}: {ok:false,reason:r&&r.reason});
  }
}
console.log(JSON.stringify(__out));
})();
'''
jsfile=ROOT/'bench-src'/'operatingpoint_bench_harness.js'
jsfile.write_text(runner,encoding='utf-8')
proc=subprocess.run(['node',str(jsfile)],capture_output=True,text=True,check=True)
page=json.loads(proc.stdout)

G=9.80665
base_pump=dict(speed=100,pumps=1,dvalve=78,svalve=100,z2=15,diam=100,temp=20,length=90,rough=.045,z1=2,p1=101325,p2=101325,pumpZ=1.2,qRated=.014,h0=43,hAtRated=29,bepQ=.0185,etaMax=.82,motorEff=.92,driveEff=.97,npsh0=2.3,npshK=12500)
base_fan=dict(speed=100,fans=1,damper=82,filterLoad=10,temp=20,pressureKPa=101.325,ductLossRef=210,coilLossRef=160,filterLossRef=120,systemEffectRef=45,qRef=4.5,motorEff=.93,driveEff=.97,rhoRef=1.20)
fan_demo=[(0,900,.25),(1,980,.38),(2,1040,.55),(3,1020,.70),(4,930,.82),(5,790,.78),(6,600,.65),(7,320,.40)]

def water(T):
    rho=1000*(1-((T+288.9414)/(508929.2*(T+68.12963)))*(T-3.9863)**2)
    mu=2.414e-5*10**(247.8/(T+133.15))
    pv=10**(8.07131-1730.63/(233.426+T))*133.322368
    return rho,mu,pv

def ff(Re,rr):
    if Re<=0:return 0.0
    if Re<2300:return 64/Re
    f=lambda x: 1/math.sqrt(x)+2*math.log10(rr/3.7+2.51/(Re*math.sqrt(x)))
    return brentq(f,0.005,0.2,xtol=1e-14,rtol=1e-14)

def vk(op):
    x=max(.06,op/100); return .25/x**4+.2

def pchip(points,key):
    pts=[p for p in points if key in p and p[key] is not None]
    return PchipInterpolator([p['q'] for p in pts],[p[key] for p in pts],extrapolate=False) if len(pts)>=2 else None

def pump_ref(c):
    s={**base_pump,**c['state']}; imported=c['kind']=='pump_import'; pts=c.get('points') or []
    r=s['speed']/100; n=s['pumps']
    ih=pchip(pts,'h') if imported else None; ie=pchip(pts,'eta') if imported else None; ip=pchip(pts,'pshaft') if imported else None; inn=pchip(pts,'npshr') if imported else None
    if imported: qlo=pts[0]['q']*r*n; qhi=pts[-1]['q']*r*n
    else: qlo=0; qhi=.035*r*n
    def head(Q):
        qb=Q/(r*n)
        if imported: return r*r*float(ih(min(max(qb,pts[0]['q']),pts[-1]['q'])))
        a=(s['h0']-s['hAtRated'])/s['qRated']**2
        return r*r*max(0,s['h0']-a*qb*qb)
    def sy(Q):
        rho,mu,pv=water(s['temp']); D=s['diam']/1000; A=math.pi*D*D/4; v=Q/A; Re=rho*v*D/mu
        f=ff(Re,(s['rough']/1000)/D) if Re>0 else 0
        dyn=v*v/(2*G); hs=f*(s['length']*.34)/D*dyn; hd=f*(s['length']*.66)/D*dyn
        hsv=vk(s['svalve'])*dyn; hdv=vk(s['dvalve'])*dyn; static=(s['z2']-s['z1'])+(s['p2']-s['p1'])/(rho*G)
        return static+hs+hd+hsv+hdv,(rho,mu,pv,f,Re,hs,hd,hsv,hdv)
    def res(q): return head(q)-sy(q)[0]
    try:
        if res(qlo)==0: Q=qlo
        elif res(qlo)*res(qhi)>0:return {'ok':False}
        else: Q=brentq(res,qlo,qhi,xtol=1e-13,rtol=1e-13)
    except Exception:return {'ok':False}
    H=head(Q); rho,mu,pv,f,Re,hs,hd,hsv,hdv=sy(Q)[1]; qb=Q/(r*n)
    if imported:
        qb2=min(max(qb,pts[0]['q']),pts[-1]['q']); eta=float(ie(qb2)) if ie else math.nan; Ps=float(ip(qb2))*r**3*n if ip else rho*G*Q*H/eta; Nr=float(inn(qb2))*r*r if inn else math.nan
    else:
        x=(qb-s['bepQ'])/(s['bepQ']*.82); eta=max(.18,min(s['etaMax'],s['etaMax']*(1-.46*x*x))); Ps=rho*G*Q*H/eta; Nr=r*r*(s['npsh0']+s['npshK']*qb*qb)
    Pe=Ps/(s['motorEff']*s['driveEff']); D=s['diam']/1000; A=math.pi*D*D/4; v=Q/A; dyn=v*v/(2*G)
    Na=s['p1']/(rho*G)+(s['z1']-s['pumpZ'])-hs-hsv-pv/(rho*G)
    return dict(ok=True,Q=Q,H=H,eta=eta,Ps=Ps,Pe=Pe,Na=Na,Nr=Nr,f=f,Re=Re)

def fan_ref(c):
    s={**base_fan,**c['state']}; pts=c.get('points') or [dict(q=q,h=h,eta=e) for q,h,e in fan_demo]; imported=c['kind']=='fan_import'
    r=s['speed']/100; n=s['fans']; rho=s['pressureKPa']*1000/(287.05*(s['temp']+273.15)); rrho=rho/1.2
    ih=pchip(pts,'h'); ie=pchip(pts,'eta'); ip=pchip(pts,'pshaft') if imported else None
    qlo=pts[0]['q']*r*n; qhi=pts[-1]['q']*r*n
    def pres(Q): return float(ih(Q/(r*n)))*r*r*rrho
    def eta(Q): return max(.02,min(1,float(ie(Q/(r*n)))))
    def sys(Q):
        x=Q/s['qRef']; fm=1+2.5*s['filterLoad']/100; dm=1/max(.12,s['damper']/100)**2
        return (s['filterLossRef']*fm+s['coilLossRef']+s['ductLossRef']+60*dm+s['systemEffectRef'])*x*x*rrho
    def res(q): return pres(q)-sys(q)
    grid=[qlo+(qhi-qlo)*i/2500 for i in range(2501)]; roots=[]
    prev=grid[0]; fp=res(prev)
    for q in grid[1:]:
        fq=res(q)
        if math.isfinite(fp) and math.isfinite(fq) and fp*fq<0:
            roots.append(brentq(res,prev,q,xtol=1e-12,rtol=1e-12))
        prev,fp=q,fq
    if not roots:return {'ok':False}
    def stable(q):
        dq=max(1e-5,qhi*1e-5); a=max(qlo,q-dq); b=min(qhi,q+dq); return (res(b)-res(a))/(b-a)<0
    st=[q for q in roots if stable(q)]; Q=(st or roots)[-1]; dp=pres(Q); e=eta(Q)
    if imported and ip is not None: Ps=float(ip(Q/(r*n)))*r**3*rrho*n
    else: Ps=Q*dp/e
    Pe=Ps/(s['motorEff']*s['driveEff'])
    return dict(ok=True,Q=Q,dp=dp,eta=e,Ps=Ps,Pe=Pe,rho=rho,roots=len(roots))

results=[]; passed=0; compared=0
by_kind={}
for idx,(c,p) in enumerate(zip(cases,page)):
    ref=pump_ref(c) if c['kind'].startswith('pump') else fan_ref(c)
    kind=c['kind']; by_kind.setdefault(kind,{'cases':0,'passed':0,'max_rel':0.0,'max_abs':0.0})['cases']+=1
    ok=(bool(p.get('ok'))==bool(ref.get('ok')))
    details={}
    if ok and p.get('ok'):
        keys=['Q','H','eta','Ps','Pe','Na','Nr','f','Re'] if kind.startswith('pump') else ['Q','dp','eta','Ps','Pe','rho']
        for k in keys:
            a=p.get(k); b=ref.get(k)
            if a is None or b is None or not math.isfinite(float(a)) or not math.isfinite(float(b)): continue
            absd=abs(a-b); reld=absd/max(1e-12,abs(b)); details[k]=(absd,reld)
            by_kind[kind]['max_rel']=max(by_kind[kind]['max_rel'],reld); by_kind[kind]['max_abs']=max(by_kind[kind]['max_abs'],absd)
            # Root solvers/interpolation should agree tightly; friction fixed-point vs brentq allowed slightly looser.
            tol=2e-7 if k in ('f','Re') else 5e-7
            if reld>tol and absd>1e-9: ok=False
        if kind.startswith('fan') and p.get('roots')!=ref.get('roots'): ok=False
    if ok:
        passed+=1; by_kind[kind]['passed']+=1
    else:
        results.append({'index':idx,'kind':kind,'page':p,'reference':ref,'diff':details})
    compared+=1

artifact={
 'schema':'tools.petrov.re/benchmark/v1',
 'tool':'operatingpoint.html',
 'benchmark_id':'operatingpoint-independent-python-v1',
 'run_at':'2026-08-13T12:41:27+02:00',
 'reference':{
   'language':'Python 3',
   'root_solver':'scipy.optimize.brentq',
   'curve_interpolation':'scipy.interpolate.PchipInterpolator',
   'colebrook':'implicit Colebrook equation solved by brentq rather than page fixed-point iteration',
   'coverage':['pump generic curve','pump imported PCHIP curve','parallel pumps','Darcy-Weisbach/Colebrook','NPSH','efficiency/power','fan demo PCHIP curve','fan imported PCHIP curve','parallel fans','density scaling','component square-law system curve','stable-root selection'],
   'seed':20260813
 },
 'tolerance':'relative <= 5e-7 for primary outputs; <= 2e-7 for friction/Re, with 1e-9 absolute floor',
 'cases':compared,'passed':passed,'failed':compared-passed,'groups':by_kind,
 'failures':results[:20]
}
(ROOT/'benchmarks'/'operatingpoint.json').write_text(json.dumps(artifact,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'cases':compared,'passed':passed,'failed':compared-passed,'groups':by_kind,'failure_samples':results[:3]},indent=2))
if passed!=compared: raise SystemExit(2)
