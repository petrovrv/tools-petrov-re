import numpy as np, math
from scipy.special import wofz
from scipy.integrate import quad

# ---- parameters as read out of doppler.html ----
E0=6.673; GAMMA=0.0265; KB=8.617e-5; A=238.0; SIG0=21000.0

# Route B: Voigt / Faddeeva
def psi_w(xi,x):
    z=xi*(x+1j)/2.0
    return (math.sqrt(math.pi)*xi/2.0)*np.real(wofz(z))
# Route A: direct quadrature of the defining convolution integral
def psi_q(xi,x):
    f=lambda y: math.exp(-0.25*xi*xi*(x-y)**2)/(1.0+y*y)
    tot=0.0
    # split at the two peaks (y=0 Lorentzian, y=x Gaussian)
    pts=sorted(set([-np.inf,min(0,x)-40/max(xi,1e-9),0,x,max(0,x)+40/max(xi,1e-9),np.inf]))
    for a,b in zip(pts[:-1],pts[1:]):
        tot+=quad(f,a,b,limit=400,epsabs=1e-14,epsrel=1e-13)[0]
    return xi/(2*math.sqrt(math.pi))*tot

def DeltaD(T,E0=E0,A=A): return math.sqrt(4*E0*KB*T/A)

for T in (300,900,1800,3000):
    D=DeltaD(T); xi=GAMMA/D
    for x in (0,1,5,20):
        a=psi_q(xi,x); b=psi_w(xi,x)
        print(f"T={T} xi={xi:.5f} x={x:2} psi_quad={a:.12e} psi_wofz={b:.12e} rel={abs(a-b)/b:.2e}")
