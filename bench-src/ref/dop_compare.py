import numpy as np, math
from scipy.special import wofz
from scipy.optimize import brentq
from scipy.integrate import quad
E0=6.673; G=0.0265; KB=8.617e-5; A=238.0; S0=21000.0
def psi(xi,x):
    return (math.sqrt(math.pi)*xi/2.0)*np.real(wofz(xi*(np.asarray(x)+1j)/2.0))
def DD(T): return math.sqrt(4*E0*KB*T/A)

# ---- reference sigma: SLBW psi form, sqrt(E0/E) OUTSIDE ----
def sig_ref(E,T):
    xi=G/DD(T); x=2*(np.asarray(E)-E0)/G
    return S0*np.sqrt(E0/np.asarray(E))*psi(xi,x)

# ---- replica of the tool's algorithm (discrete convolution, sqrt inside) ----
GRID_LO,GRID_HI,NG=6.0,7.4,2400
dE=(GRID_HI-GRID_LO)/(NG-1)
Eg=GRID_LO+np.arange(NG)*dE
s0K=S0*np.sqrt(E0/Eg)/(1+(2*(Eg-E0)/G)**2)
def tool_broaden(T):
    s=DD(T)/math.sqrt(2); out=np.zeros(NG)
    half=max(1,math.ceil(5*s/dE)); inv=1/(2*s*s); norm=1/(s*math.sqrt(2*math.pi))
    for i in range(NG):
        lo=max(0,i-half); hi=min(NG-1,i+half)
        d=Eg[i]-Eg[lo:hi+1]
        out[i]=np.sum(s0K[lo:hi+1]*np.exp(-d*d*inv))*norm*dE
    return out
WL,WH=6.3,7.0
def tool_metrics(sig):
    m=(Eg>=WL)&(Eg<=WH); ipk=np.argmax(np.where(m,sig,-1)); peak=sig[ipk]
    h=peak/2
    eL=eR=Eg[ipk]
    for i in range(ipk,0,-1):
        if sig[i]<h:
            t=(h-sig[i])/(sig[i+1]-sig[i]); eL=Eg[i]+t*dE; break
    for i in range(ipk,NG-1):
        if sig[i]<h:
            t=(h-sig[i])/(sig[i-1]-sig[i]); eR=Eg[i]-t*dE; break
    area=0.0
    for i in range(NG-1):
        a,b=Eg[i],Eg[i+1]
        if b<WL or a>WH: continue
        area+=0.5*(sig[i]+sig[i+1])*dE
    return peak,eR-eL,area

# ---- reference metrics (continuum) ----
def ref_metrics(T):
    from scipy.optimize import minimize_scalar
    f=lambda E:-sig_ref(E,T)
    r=minimize_scalar(f,bracket=(E0-0.01,E0,E0+0.01),options={'xtol':1e-14})
    Epk=r.x; peak=sig_ref(Epk,T)
    h=peak/2
    eL=brentq(lambda E:sig_ref(E,T)-h,E0-3,Epk,xtol=1e-14)
    eR=brentq(lambda E:sig_ref(E,T)-h,Epk,E0+3,xtol=1e-14)
    areaW=quad(lambda E:sig_ref(E,T),WL,WH,limit=400,epsabs=1e-10)[0]
    areaInf=quad(lambda E:sig_ref(E,T),1e-3,60,limit=800,epsabs=1e-8)[0]
    return peak,eR-eL,areaW,areaInf

print("analytic infinite area (sqrt outside, ignoring 1/sqrtE variation) = S0*G*pi/2 =",S0*G*math.pi/2)
print(f"{'T':>5} {'peak_tool':>10} {'peak_ref':>10} {'rel':>9} {'fwhm_tool':>9} {'fwhm_ref':>9} {'rel':>9} {'areaW_tool':>10} {'areaW_ref':>10} {'rel':>9} {'areaInf':>9}")
for T in (300,600,900,1200,1800,2400,3000):
    st=tool_broaden(T); pt,ft,at=tool_metrics(st)
    pr,fr,arW,arI=ref_metrics(T)
    print(f"{T:5} {pt:10.1f} {pr:10.1f} {(pt-pr)/pr:9.2e} {ft*1000:9.2f} {fr*1000:9.2f} {(ft-fr)/fr:9.2e} {at:10.2f} {arW:10.2f} {(at-arW)/arW:9.2e} {arI:9.2f}")

print("\n--- curve comparison tool-replica vs psi reference (sqrt(E0/E) inside vs outside) ---")
for T in (300,900,3000):
    st=tool_broaden(T)
    print(f" T={T}")
    for E in (6.30,6.40,6.50,6.60,6.673,6.75,6.85,7.00):
        i=int(round((E-GRID_LO)/dE)); Ei=Eg[i]
        r=sig_ref(Ei,T)
        print(f"   E={Ei:.5f} tool={st[i]:12.4f} ref={r:12.4f} rel={(st[i]-r)/r:+.3e}")
