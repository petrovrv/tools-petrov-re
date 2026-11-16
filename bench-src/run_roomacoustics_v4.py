import asyncio, json, math, copy
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT=Path('/mnt/data')
HTML=ROOT/'roomacoustics.html'
OLD_ART=ROOT/'roomacoustics.json'
OUT=ROOT/'roomacoustics-v4.json'
BANDS=[125,250,500,1000,2000,4000,8000]
AIR_DB={125:.0003,250:.0005,500:.001,1000:.002,2000:.006,4000:.018,8000:.05}
OPEN_ALPHA=[.999]*7

# ---------- independent reference math ----------
def clamp(x,a,b): return max(a,min(b,x))
def speed(temp): return 331.3+.606*temp

def matmap(st):
    d={m['id']:m for m in st['materials']}
    d['__open__']={'id':'__open__','a':OPEN_ALPHA,'s':0.0}
    return d

def panel_area(p): return max(.01,float(p.get('w',1))*float(p.get('h',1)))
def interior_area(o):
    if o['type'] in ('screen','baffle'): return 2*max(.01,float(o['w'])*float(o['h']))
    if o['type']=='obstacle':
        w,d,h=map(float,(o['w'],o['d'],o['h']))
        return max(.01,2*(w*d+w*h+d*h))
    return 0.0

def shoebox_base(st):
    w,l,h=st['room']['w'],st['room']['l'],st['room']['h']
    A=w*l; V=A*h
    areas={'floor':A,'ceiling':A,'north':w*h,'south':w*h,'east':l*h,'west':l*h}
    return V,2*A+2*(w+l)*h,areas

def python_stats(st):
    assert st['geometry']=='shoebox'
    V,boundaryS,areas=shoebox_base(st); mats=matmap(st)
    entries=[]
    for key,ar0 in areas.items():
        ps=[p for p in st.get('panels',[]) if p.get('host')==key]
        ps.sort(key=lambda p: 0 if p.get('kind')=='opening' else 1)
        rem=ar0; alloc=[]
        for p in ps:
            ar=min(panel_area(p),rem); rem-=ar
            if ar>1e-9: alloc.append((p,ar))
        mid=st['surfaces'].get(key,st['surfaces'].get('walls'))
        entries.append((rem,mats[mid]))
        for p,ar in alloc:
            pm='__open__' if p.get('kind')=='opening' else p.get('material')
            entries.append((ar,mats[pm]))
    interiorS=0.0
    for o in st.get('interiorObjects',[]):
        ar=interior_area(o); interiorS+=ar; entries.append((ar,mats[o['material']]))
    S=boundaryS+interiorS
    A=[]; Aeq=[]; abar=[]; sbar=[]; sab=[]; eyr=[]
    for bi,f in enumerate(BANDS):
        ai=sum(ar*clamp(float(m['a'][bi]),0,.999) for ar,m in entries)
        sv=sum(ar*clamp(float(m.get('s',0)),0,.999) for ar,m in entries)/max(S,1e-9)
        av=clamp(ai/max(S,1e-9),1e-6,.999)
        airEq=4*(AIR_DB[f]*math.log(10)/10)*V if st.get('airAbs') else 0
        ae=ai+airEq; den=-S*math.log(1-av)+airEq
        A.append(ai);Aeq.append(ae);abar.append(av);sbar.append(sv)
        sab.append(.161*V/max(ae,1e-9)); eyr.append(.161*V/max(den,1e-9))
    mfp=4*V/max(S,1e-9)
    return dict(V=V,boundaryS=boundaryS,S=S,interiorS=interiorS,A=A,Aeq=Aeq,abar=abar,sbar=sbar,sabine=sab,eyring=eyr,mfp=mfp,D=speed(st['tempC'])*mfp/3)

def axis_images(s,L,N):
    out=[]
    for n in range(-N,N+1):
        order=2*abs(n)
        if order<=N: out.append((2*n*L+s,order))
        order=abs(2*n-1)
        if order<=N: out.append((2*n*L-s,order))
    return out

def shoebox_image_count(st):
    N=int(st['reflectionOrder']); src=next(o for o in st['objects'] if o['type']=='source')
    xs=axis_images(src['x'],st['room']['w'],N); ys=axis_images(src['y'],st['room']['l'],N); zs=axis_images(src['z'],st['room']['h'],N)
    return sum(1 for x in xs for y in ys for z in zs if x[1]+y[1]+z[1]<=N)

# Euler basis matching stated yaw/pitch/roll convention, independently coded.
def basis(o):
    rz,ry,rx=[math.radians(float(o.get(k,0))) for k in ('rot','pitch','roll')]
    cz,sz,cy,sy,cx,sx=math.cos(rz),math.sin(rz),math.cos(ry),math.sin(ry),math.cos(rx),math.sin(rx)
    R=np.array([[cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx],
                [sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx],
                [-sy,cy*sx,cy*cx]],float)
    return R[:,0],R[:,1],R[:,2]

def screen_hit(a,b,o):
    u,n,v=basis(o); C=np.array([o['x'],o['y'],o['z']],float); A=np.array(a,float); D=np.array(b,float)-A
    den=float(D@n)
    if abs(den)<1e-10:return False
    t=-float((A-C)@n)/den
    if not (1e-7<t<1-1e-7):return False
    P=A+t*D; q=P-C
    return abs(float(q@u))<=o['w']/2+1e-8 and abs(float(q@v))<=o['h']/2+1e-8

def obstacle_hit(a,b,o):
    ux,uy,uz=basis(o); R=np.column_stack([ux,uy,uz]); C=np.array([o['x'],o['y'],o['z']],float)
    A=R.T@(np.array(a,float)-C); Q=R.T@(np.array(b,float)-C); d=Q-A
    lo=np.array([-o['w']/2,-o['d']/2,-o['h']/2]); hi=-lo; t0,t1=0.0,1.0
    for k in range(3):
        if abs(d[k])<1e-12:
            if A[k]<lo[k] or A[k]>hi[k]: return False
        else:
            u=(lo[k]-A[k])/d[k]; v=(hi[k]-A[k])/d[k]
            if u>v:u,v=v,u
            t0=max(t0,u);t1=min(t1,v)
            if t1<t0:return False
    t=clamp(t0,0,1)
    if t<=1e-7:t=clamp(t1,0,1)
    return 1e-7<t<1-1e-7

def expected_direct_loss(src,rec,objects,bi):
    a=[src['x'],src['y'],src['z']]; b=[rec['x'],rec['y'],rec['z']]; db=0.0
    for o in objects:
        hit=obstacle_hit(a,b,o) if o['type']=='obstacle' else screen_hit(a,b,o)
        if hit: db+=clamp(float(o.get('il',[0]*7)[bi]),0,80)
    return db

def modified_abs(alpha):
    alpha=clamp(float(alpha),0,.999999); return alpha/(2*(2-alpha))

def diffusion_rect(st, src, bi):
    ps=python_stats(st); w,l,h=st['room']['w'],st['room']['l'],st['room']['h']; target=st['diffusionCell']
    nx=max(2,math.ceil(w/target));ny=max(2,math.ceil(l/target));hx=w/nx;hy=l/ny;n=nx*ny;c=speed(st['tempC']);D=ps['D'];f=BANDS[bi]
    mats=matmap(st)
    def surfmat(k): return mats[st['surfaces'][k]]
    sink=np.zeros(n,float); tw=np.ones(n);te=np.ones(n);ts=np.ones(n);tn=np.ones(n)
    objs=st.get('interiorObjects',[])
    # this reference case uses zero-alpha internal screen, so only boundary/floor/ceiling sinks are needed.
    floorA=modified_abs(surfmat('floor')['a'][bi]);ceilA=modified_abs(surfmat('ceiling')['a'][bi])
    air=c*(AIR_DB[f]*math.log(10)/10) if st.get('airAbs') else 0.0
    def idx(gx,gy): return gy*nx+gx
    def trans_between(gx,gy,hx2,hy2):
        A=[(gx+.5)*hx,(gy+.5)*hy,0];B=[(hx2+.5)*hx,(hy2+.5)*hy,0];T=1.0
        for o in objs:
            # tool samples each link at z=o.z; reproduce that physical height-average contract.
            aa=[A[0],A[1],o['z']];bb=[B[0],B[1],o['z']]
            hit=obstacle_hit(aa,bb,o) if o['type']=='obstacle' else screen_hit(aa,bb,o)
            if not hit:continue
            corners=[]
            ux,uy,uz=basis(o)
            if o['type']=='obstacle':
                for su in (-.5,.5):
                    for sv in (-.5,.5):
                        for sw in (-.5,.5): corners.append(np.array([o['x'],o['y'],o['z']])+su*o['w']*ux+sv*o['d']*uy+sw*o['h']*uz)
            else:
                for su in (-.5,.5):
                    for sv in (-.5,.5): corners.append(np.array([o['x'],o['y'],o['z']])+su*o['w']*ux+sv*o['h']*uz)
            span=max(q[2] for q in corners)-min(q[2] for q in corners);coverage=clamp(span/max(h,.1),0,1)
            t_energy=10**(-clamp(float(o['il'][bi]),0,80)/10)
            T*=max(0,(1-coverage)+coverage*t_energy)
        return clamp(T,0,1)
    wallA={k:modified_abs(surfmat(k)['a'][bi]) for k in ('west','east','south','north')}
    for gy in range(ny):
        for gx in range(nx):
            i=idx(gx,gy); k=air+c*(floorA+ceilA)/h
            if gx==0:k+=c*wallA['west']*(1/hx)
            else:tw[i]=trans_between(gx,gy,gx-1,gy)
            if gx==nx-1:k+=c*wallA['east']*(1/hx)
            else:te[i]=trans_between(gx,gy,gx+1,gy)
            if gy==0:k+=c*wallA['south']*(1/hy)
            else:ts[i]=trans_between(gx,gy,gx,gy-1)
            if gy==ny-1:k+=c*wallA['north']*(1/hy)
            else:tn[i]=trans_between(gx,gy,gx,gy+1)
            sink[i]=k
    diag=D*(2/hx**2+2/hy**2)+sink.max(); dt_st=.40/max(diag,1e-9);sample=.002;nsub=max(1,math.ceil(sample/dt_st));dt=sample/nsub
    tend=min(4,max(1.2,ps['eyring'][bi]*2.2,st['diffusionTimeMs']/1000+.2));samples=math.floor(tend/sample)+1
    arr=np.zeros(n); nxt=np.zeros(n);sgx=clamp(int(src['x']/hx),0,nx-1);sgy=clamp(int(src['y']/hy),0,ny-1);si=idx(int(sgx),int(sgy));arr[si]=1/(hx*hy*h)
    ix2=1/hx**2;iy2=1/hy**2;hist=np.empty((samples,n),np.float64); totals=np.empty(samples)
    for ks in range(samples):
        hist[ks]=arr;totals[ks]=arr.sum()*hx*hy*h
        if ks==samples-1:break
        for _ in range(nsub):
            for gy in range(ny):
                for gx in range(nx):
                    i=idx(gx,gy);wi=arr[i];lap=0.0
                    if gx>0:lap+=tw[i]*(arr[idx(gx-1,gy)]-wi)*ix2
                    if gx<nx-1:lap+=te[i]*(arr[idx(gx+1,gy)]-wi)*ix2
                    if gy>0:lap+=ts[i]*(arr[idx(gx,gy-1)]-wi)*iy2
                    if gy<ny-1:lap+=tn[i]*(arr[idx(gx,gy+1)]-wi)*iy2
                    nxt[i]=max(0,wi+dt*(D*lap-sink[i]*wi))
            arr,nxt=nxt,arr
    return dict(D=D,cells=n,hx=hx,hy=hy,dt=dt,sample_dt=sample,t_end=tend,totals=totals,hist=hist,nx=nx,ny=ny)

def nearest_integrated(sol, rec):
    gx=clamp(int(rec['x']/sol['hx']),0,sol['nx']-1);gy=clamp(int(rec['y']/sol['hy']),0,sol['ny']-1);i=int(gy)*sol['nx']+int(gx)
    return float(sol['hist'][:,i].sum()*sol['sample_dt'])

# ---------- checking ----------
def ncheck(q, ref, tool, mode='tight'):
    ref=float(ref);tool=float(tool);err=abs(tool-ref)
    if mode=='diff': tol=max(1e-11,3e-5*max(abs(ref),1e-9))
    elif mode=='loss':tol=1e-8
    else:tol=max(1e-10,2e-9*max(1,abs(ref)))
    return {'quantity':q,'reference':ref,'tool':tool,'abs_error':err,'tolerance':tol,'passed':err<=tol}
def bcheck(q,ref,tool):return {'quantity':q,'reference':bool(ref),'tool':bool(tool),'abs_error':0 if bool(ref)==bool(tool) else 1,'passed':bool(ref)==bool(tool)}

def prep_html():
    text=HTML.read_text(); soup=BeautifulSoup(text,'html.parser'); scripts=soup.find_all('script');app=scripts[-1].get_text();last=scripts[-1]
    hook="""\ninitDiagram();calculate();window.__bench={base:()=>clone(initialState),set:(s)=>{state=clone(s);normalizeState();calculate();return Diagram.record.build()},record:()=>Diagram.record.build()};\n"""
    app=app.rsplit('})();',1)[0]+hook+'})();'
    for t in list(soup.find_all('script')):
        if t.get('src') or t is last:t.decompose()
    return str(soup),app

def clean_state(base):
    s=copy.deepcopy(base);s['geometry']='shoebox';s['interiorObjects']=[];s['selectedPanel']=None;s['selected']='R1';s['reflectionOrder']=3;s['lateModel']='off';s['analysisBand']='1000';s['diffusionTimeMs']=120
    return s

async def main():
    base_html,app=prep_html();old=json.load(open(OLD_ART));results=[];browser_errors=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=await b.new_page(viewport={'width':1400,'height':900});page.on('pageerror',lambda e:browser_errors.append(str(e)))
        await page.set_content(base_html,wait_until='domcontentloaded')
        for f in [ROOT/'site-disclaimer.js',ROOT/'diagram-scene3d.js',ROOT/'diagram-common.js']:await page.add_script_tag(path=str(f))
        await page.add_script_tag(content=app);await page.wait_for_timeout(100)
        base=await page.evaluate('()=>__bench.base()')
        async def run_state(st):
            return await page.evaluate('(s)=>__bench.set(s)',st)
        # Core shoebox cases: independent closed-form Python reference.
        cases=[('default-air',(8,10,3.2),True),('wide-dry',(12,9,3),False),('tall-air',(7.5,13,4.2),True),('large-dry',(15,18,5),False),('compact-air',(9,8,2.8),True)]
        for name,(w,l,h),air in cases:
            st=clean_state(base);st['room'].update(w=w,l=l,h=h,poly=[{'x':0,'y':0},{'x':w,'y':0},{'x':w,'y':l},{'x':0,'y':l}]);st['airAbs']=air
            rec=await run_state(st);o=rec['outputs'];r=python_stats(st);checks=[]
            checks += [ncheck('volume_m3',r['V'],o['volume_m3']),ncheck('surface_m2',r['S'],o['surface_m2']),ncheck('mean_free_path_m',r['mfp'],o['mean_free_path_m']),ncheck('diffusion_coefficient_m2_s',r['D'],o['diffusion_coefficient_m2_s']),ncheck('early_reflection_count',shoebox_image_count(st),o['early_reflection_count']),ncheck('mean_scattering_1000',r['sbar'][3],o['mean_scattering'][3])]
            for bi,f in enumerate(BANDS):checks.append(ncheck(f'rt60_sabine_s[{f}]',r['sabine'][bi],o['rt60_sabine_s'][bi]));
            for bi,f in enumerate(BANDS):checks.append(ncheck(f'rt60_eyring_s[{f}]',r['eyring'][bi],o['rt60_eyring_s'][bi]));
            results.append({'case':name,'passed':all(c['passed'] for c in checks),'checks':checks})
        # Published long-room case, independent FV reference.
        st=clean_state(base); refmat={'id':'bench_ref','name':'Bench alpha .10','category':'benchmark','a':[.1]*7,'s':1.0,'source':'benchmark','note':''};st['materials'].append(refmat);st['room'].update(w=4,l=32,h=4,poly=[{'x':0,'y':0},{'x':4,'y':0},{'x':4,'y':32},{'x':0,'y':32}]);st['surfaces']={k:'bench_ref' for k in ['floor','ceiling','north','south','east','west','walls']};st['panels']=[];st['interiorObjects']=[];st['airAbs']=False;st['diffusionCell']=.5;st['objects']=[{'id':'S1','type':'source','name':'Source','x':2,'y':2,'z':2,'Lw':[90]*7,'dir':'omni','angle':0}]+[{'id':f'R{i}','type':'receiver','name':f'R{i}','x':2,'y':y,'z':2} for i,y in enumerate([5,10,15,20,25,30],1)];st['selected']='R1'
        st['lateModel']='diffusion'
        rec=await run_state(st);o=rec['outputs'];d=o['diffusion'];checks=[]
        frozen={c['quantity']:c['reference'] for c in next(r for r in old['results'] if r['case']=='isimpa-long-room')['checks']}
        lrstats=python_stats(st); am=modified_abs(.1); c=speed(st['tempC']); hx=hy=.5; maxsink=c*(2*am/st['room']['h'] + am/hx + am/hy); diag=lrstats['D']*(2/hx**2+2/hy**2)+maxsink; dtstable=.40/diag; nsub=max(1,math.ceil(.002/dtstable)); dtref=.002/nsub
        pairs=[('D',frozen['D'],d['D']),('cells',frozen['cells'],d['cells']),('hx',frozen['hx'],d['hx']),('hy',frozen['hy'],d['hy']),('dt',dtref,d['dt']),('t_end',frozen['t_end'],d['t_end']),('total_energy_start',frozen['total_energy_start'],d['total_energy_start']),('total_energy_end',frozen['total_energy_end'],d['total_energy_end'])]
        for q,rv,tv in pairs: checks.append(ncheck(q,rv,tv,'diff'))
        ints=[]
        for rr,br in zip(st['objects'][1:],o['diffusion_receivers']):
            q=f"integrated_y{rr['y']}";ints.append(br['integrated_energy_density_time']);checks.append(ncheck(q,frozen[q],br['integrated_energy_density_time'],'diff'))
        levels=[10*math.log10(x/ints[0]) for x in ints];checks.append(bcheck('published_behavior_level_decreases_with_distance',True,all(levels[i+1]<levels[i] for i in range(len(levels)-1))))
        results.append({'case':'isimpa-long-room','passed':all(c['passed'] for c in checks),'checks':checks})
        # Screen path loss / 3D orientation.
        def screen_state(srcx=4,srcz=1.5,recx=4,recz=1.5,rot=0,pitch=0,roll=0,x=4,y=5,z=1.5,w=4,h=2.5,il=None):
            q=clean_state(base);q['airAbs']=False;q['panels']=[];q['objects']=[{'id':'S1','type':'source','name':'S','x':srcx,'y':2,'z':srcz,'Lw':[90]*7,'dir':'omni','angle':0},{'id':'R1','type':'receiver','name':'R','x':recx,'y':8,'z':recz}];q['selected']='R1';q['interiorObjects']=[{'id':'I1','type':'screen','name':'Screen','x':x,'y':y,'z':z,'w':w,'d':.1,'h':h,'rot':rot,'pitch':pitch,'roll':roll,'material':'concrete','il':il or [0,5,10,15,20,25,30]}];return q
        screen_cases=[('screen-hit',screen_state(),True),('screen-yaw90',screen_state(rot=90),False),('screen-roll90',screen_state(roll=90),False),('screen-pitch-hit',screen_state(srcx=5.8,recx=5.8,w=4,h=1),True),('screen-pitch90-miss',screen_state(srcx=5.8,recx=5.8,w=4,h=1,pitch=90),False)]
        for name,st,expect_hit in screen_cases:
            rec=await run_state(st);loss=rec['outputs']['selected_pair_direct_path_loss_db'];src,rr=st['objects'];checks=[]
            for bi,f in enumerate(BANDS):checks.append(ncheck(f'path_loss_db[{f}]',expected_direct_loss(src,rr,st['interiorObjects'],bi),loss[bi],'loss'))
            checks.append(bcheck('intersection_expected',expect_hit,expected_direct_loss(src,rr,st['interiorObjects'],3)>0))
            results.append({'case':name,'passed':all(c['passed'] for c in checks),'checks':checks})
        # Obstacle OBB path loss and yaw.
        def obstacle_state(rot=0):
            q=clean_state(base);q['airAbs']=False;q['panels']=[];q['objects']=[{'id':'S1','type':'source','name':'S','x':5.3,'y':2,'z':1.5,'Lw':[90]*7,'dir':'omni','angle':0},{'id':'R1','type':'receiver','name':'R','x':5.3,'y':8,'z':1.5}];q['selected']='R1';q['interiorObjects']=[{'id':'O1','type':'obstacle','name':'Obstacle','x':4,'y':5,'z':1.5,'w':3,'d':.5,'h':2,'rot':rot,'pitch':0,'roll':0,'material':'concrete','il':[3,6,9,12,15,18,21]}];return q
        for name,st,expect_hit in [('obstacle-hit',obstacle_state(0),True),('obstacle-yaw90-miss',obstacle_state(90),False)]:
            rec=await run_state(st);loss=rec['outputs']['selected_pair_direct_path_loss_db'];src,rr=st['objects'];checks=[]
            for bi,f in enumerate(BANDS):checks.append(ncheck(f'path_loss_db[{f}]',expected_direct_loss(src,rr,st['interiorObjects'],bi),loss[bi],'loss'))
            checks.append(bcheck('intersection_expected',expect_hit,expected_direct_loss(src,rr,st['interiorObjects'],3)>0));results.append({'case':name,'passed':all(c['passed'] for c in checks),'checks':checks})
        # Baffle closed-form statistical effect.
        st=clean_state(base);st['airAbs']=False;st['interiorObjects']=[{'id':'B1','type':'baffle','name':'Baffle','x':4,'y':5,'z':1.6,'w':3,'d':.05,'h':2,'rot':25,'pitch':20,'roll':10,'material':'mineral','il':[0]*7}]
        rec=await run_state(st);o=rec['outputs'];r=python_stats(st);checks=[ncheck('interior_surface_m2',r['interiorS'],o['interior_surface_m2']),ncheck('total_surface_m2',r['S'],o['surface_m2']),ncheck('mean_free_path_m',r['mfp'],o['mean_free_path_m'])]
        for bi,f in enumerate(BANDS):checks.append(ncheck(f'rt60_sabine_s[{f}]',r['sabine'][bi],o['rt60_sabine_s'][bi]));checks.append(ncheck(f'rt60_eyring_s[{f}]',r['eyring'][bi],o['rt60_eyring_s'][bi]))
        results.append({'case':'free-baffle-statistics','passed':all(c['passed'] for c in checks),'checks':checks})
        # Opening boundary-area replacement.
        st=clean_state(base);st['airAbs']=False;st['panels']=copy.deepcopy(base['panels'])+[{'id':'OP1','kind':'opening','name':'Opening','host':'north','material':'__open__','x':4,'y':10,'u':4,'z':1.6,'w':2,'h':2,'rot':0}]
        rec=await run_state(st);o=rec['outputs'];r=python_stats(st);checks=[ncheck('boundary_surface_m2',r['boundaryS'],o['boundary_surface_m2']),ncheck('total_surface_m2',r['S'],o['surface_m2'])]
        for bi,f in enumerate(BANDS):checks.append(ncheck(f'mean_absorption[{f}]',r['abar'][bi],o['mean_absorption'][bi]));checks.append(ncheck(f'rt60_sabine_s[{f}]',r['sabine'][bi],o['rt60_sabine_s'][bi]));checks.append(ncheck(f'rt60_eyring_s[{f}]',r['eyring'][bi],o['rt60_eyring_s'][bi]))
        results.append({'case':'wall-opening-statistics','passed':all(c['passed'] for c in checks),'checks':checks})
        # Independent diffusion screen transmission, IL 0 and 20 dB.
        for il in (0,20):
            st=clean_state(base);st['room'].update(w=6,l=4,h=3,poly=[{'x':0,'y':0},{'x':6,'y':0},{'x':6,'y':4},{'x':0,'y':4}]);
            st['materials'] += [ {'id':'bench_a20','name':'A20','category':'benchmark','a':[.2]*7,'s':0,'source':'benchmark','note':''}, {'id':'bench_zero','name':'Zero','category':'benchmark','a':[0]*7,'s':0,'source':'benchmark','note':''}]
            st['surfaces']={k:'bench_a20' for k in ['floor','ceiling','north','south','east','west','walls']};st['panels']=[];st['airAbs']=False;st['lateModel']='diffusion';st['diffusionCell']=1.0;st['objects']=[{'id':'S1','type':'source','name':'S','x':3,'y':1,'z':1.5,'Lw':[90]*7,'dir':'omni','angle':0},{'id':'R1','type':'receiver','name':'R','x':3,'y':3,'z':1.5}];st['selected']='R1';st['interiorObjects']=[{'id':'SC1','type':'screen','name':'Full screen','x':3,'y':2,'z':1.5,'w':6,'d':.05,'h':3,'rot':0,'pitch':0,'roll':0,'material':'bench_zero','il':[il]*7}]
            rec=await run_state(st);o=rec['outputs'];sol=diffusion_rect(st,st['objects'][0],3);d=o['diffusion'];checks=[]
            for q,rv,tv in [('D',sol['D'],d['D']),('cells',sol['cells'],d['cells']),('hx',sol['hx'],d['hx']),('hy',sol['hy'],d['hy']),('dt',sol['dt'],d['dt']),('t_end',sol['t_end'],d['t_end']),('total_energy_start',sol['totals'][0],d['total_energy_start']),('total_energy_end',sol['totals'][-1],d['total_energy_end'])]:checks.append(ncheck(q,rv,tv,'diff'))
            rv=nearest_integrated(sol,st['objects'][1]);tv=o['diffusion_receiver']['integrated_energy_density_time'];checks.append(ncheck('receiver_integrated_energy_density_time',rv,tv,'diff'))
            results.append({'case':f'diffusion-screen-il{il}','passed':all(c['passed'] for c in checks),'checks':checks})
        await b.close()
    groups={}
    for r in results:
        prefix=(r['case'].split('-')[0] if not r['case'].startswith('diffusion-screen') else 'diffusion-screen')
        g=groups.setdefault(prefix,{'cases':0,'passed':0,'checks':0,'checks_passed':0});g['cases']+=1;g['passed']+=int(r['passed']);g['checks']+=len(r['checks']);g['checks_passed']+=sum(c['passed'] for c in r['checks'])
    checks=sum(len(r['checks']) for r in results);passed=sum(sum(c['passed'] for c in r['checks']) for r in results);failures=[{'case':r['case'],'check':c} for r in results for c in r['checks'] if not c['passed']]
    art={'schema':'tools.petrov.re/benchmark/v1','tool':'roomacoustics.html','benchmark_id':'roomacoustics-analytic-diffusion-objects-python-v4','run_at':datetime.now(timezone.utc).isoformat(),'reference':{'language':'Python 3 + NumPy','method':'Independent closed-form shoebox/statistical calculations, independent Euler/finite-screen and OBB segment intersection calculations, and an independently coded explicit finite-volume diffusion solver for new screen-link transmission cases; the published long-room is re-regressed against the frozen independently computed v3 reference. The browser model is driven through a test-only state adapter injected inside the tool IIFE; all graded user-facing outputs are read through Diagram.record.build().','coverage':['room volume and boundary/effective surface area','mean free path 4V/S','Sabine and Eyring RT60','shoebox image-source count through order 3','area-weighted scattering','diffusion coefficient D=c(4V/S)/3','I-Simpa/Valeau long-room finite-volume spatial decay','free-screen octave-band path loss and yaw/pitch/roll intersection','oriented-box obstacle path loss','two-sided free-baffle absorption/statistics','wall-opening boundary replacement','diffusion transmission through a full-height screen at 0 and 20 dB insertion loss'],'published_behavior_reference':old['reference'].get('published_behavior_reference')},'tolerance':'closed-form abs <= max(1e-10,2e-9*max(1,|reference|)); path-loss abs <= 1e-8 dB; diffusion rel <= 3e-5 (floor 1e-11); boolean/count checks exact','cases':checks,'passed':passed,'failed':checks-passed,'scenario_count':len(results),'scenario_passed':sum(r['passed'] for r in results),'groups':groups,'failures':failures,'browser_errors':browser_errors,'results':results}
    OUT.write_text(json.dumps(art,indent=2,ensure_ascii=False))
    print(json.dumps({'artifact':str(OUT),'checks':checks,'passed':passed,'failed':checks-passed,'scenarios':len(results),'scenario_passed':art['scenario_passed'],'browser_errors':browser_errors,'failures':failures[:8]},indent=2))

if __name__=='__main__': asyncio.run(main())
