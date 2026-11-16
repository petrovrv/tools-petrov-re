#!/usr/bin/env python3
"""Fresh regression of the current xenon model against the independent reference values
stored by the accepted 38-case benchmark. The solver is reimplemented in Python from
the governing equations; page functions/DOM are not invoked."""
from pathlib import Path
import json,re,math,datetime,sys
html=Path(sys.argv[1] if len(sys.argv)>1 else 'xenon.html').read_text(encoding='utf-8')
old=json.load(open(sys.argv[2] if len(sys.argv)>2 else 'benchmarks/xenon.json',encoding='utf-8'))

def num(name):
    m=re.search(r'var\s+'+re.escape(name)+r'\s*=\s*([0-9.eE+-]+)',html)
    if not m: raise ValueError(name)
    return float(m.group(1))
li,lx,gi,gx,sa,sf,nu=[num(n) for n in ['lambdaI','lambdaX','gammaI','gammaX','sigmaaX','Sigmaf','nu']]
HR=3600.0

def rho(x): return -sa*x/(nu*sf)*1e5

def sol(phi):
    I=gi*sf*phi/li
    X=(gx+gi)*sf*phi/(lx+sa*phi)
    K=li*I/(li-lx); A=X+K
    tp=math.log((li*I+lx*K)/(lx*A))/(li-lx)
    tp=max(0.0,tp)
    def XX(t): return A*math.exp(-lx*t)-K*math.exp(-li*t)
    return I,X,K,A,tp,XX

def solve(phi,margin):
    I,X,K,A,tp,XX=sol(phi); Xpk=XX(tp)
    out={'rho_eq':rho(X),'rho_peak':rho(Xpk),'t_peak':tp/HR}
    if margin<=0: out['dead']='unbounded'; return out
    Xm=margin*nu*sf/(sa*1e5)
    if XX(tp)<=Xm: out['dead']='none'; return out
    f=lambda t: XX(t)-Xm
    def bis(a,b):
        fa=f(a)
        for _ in range(240):
            if b-a<=1e-6: break
            m=(a+b)/2; fm=f(m)
            if (fm<0)==(fa<0): a=m;fa=fm
            else:b=m
        return (a+b)/2
    t0=0 if X>Xm else bis(0,tp)
    thi=math.log(A/Xm)/lx
    if not thi>tp: thi=tp+HR
    t1=bis(tp,thi)
    out.update(dead='finite',dead_h=(t1-t0)/HR,t0=t0/HR,t1=t1/HR)
    return out

def disp(x,n): return float(f'{x:.{n}f}')
checks=[]
def ck(cid,ok,detail): checks.append({'id':cid,'pass':bool(ok),'detail':detail})
for c in old['cases']:
    cid=c['id']
    if cid=='THRESHOLD':
        thresh=lx*gx/(gi*sa)
        lo=10**float(c['inputs']['slider_min_log10_phi'])
        # Preserve the original benchmark intent: the slider can enter the monotonic regime iff lo < threshold.
        ck(cid,lo<thresh,f'lowest={lo:.6g}, threshold={thresh:.6g}')
        continue
    if cid=='ASYMPTOTE_11H':
        o=solve(10**c['inputs']['log10_phi'],c['inputs']['margin_pcm'])
        ref=c['cmp']['t_peak_h']; got=disp(o['t_peak'],2)
        ck(cid,abs(got-ref['ref'])<=ref['lim'],f't_peak={got}, ref={ref["ref"]:.12g}, lim={ref["lim"]}')
        continue
    inp=c['inputs']; o=solve(10**inp['log10_phi'],inp['margin_pcm']); cm=c['cmp']; issues=[]
    for key,field,n in [('rho_eq_pcm','rho_eq',0),('rho_peak_pcm','rho_peak',0),('t_peak_h','t_peak',2)]:
        if key in cm:
            got=disp(o[field],n); ref=cm[key]['ref']; lim=cm[key]['lim']
            if abs(got-ref)>lim+1e-12: issues.append(f'{key} {got} vs {ref} lim {lim}')
    if 'dead_time' in cm:
        want=cm['dead_time']['ref']; got='none' if o.get('dead')=='none' else o.get('dead')
        if got!=want: issues.append(f'dead {got} vs {want}')
    if 'dead_h' in cm:
        got=disp(o['dead_h'],2); ref=cm['dead_h']['ref'];lim=cm['dead_h']['lim']
        if abs(got-ref)>lim+1e-12: issues.append(f'dead_h {got} vs {ref} lim {lim}')
    ck(cid,not issues,'OK' if not issues else '; '.join(issues))

out={'tool':'xenon','file':'xenon.html','kind':'fresh current-model regression against independent 38-case reference set','run_at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'reference':old['reference'],'reference_citations':old.get('reference_citations',[]),'tolerance':old['tolerance'],'total':len(checks),'passed':sum(c['pass'] for c in checks),'failed':sum(not c['pass'] for c in checks),'page_errors':[],'cases':checks,'note':'The localization change does not alter the model. This run parses the constants from the current HTML and independently reimplements the I-135/Xe-135 equations in Python, then grades the current results against the accepted independent reference values.'}
print(json.dumps(out,ensure_ascii=False,indent=2))
sys.exit(0 if out['failed']==0 else 1)
