"""Independent reference for doppler.html — SLBW capture resonance Doppler-broadened by psi.

Two structurally different routes are computed for every case:
  A) psi(xi,x) as the defining convolution integral, by adaptive quadrature (scipy.integrate.quad)
  B) psi(xi,x) = (sqrt(pi)*xi/2) * Re w(xi(x+i)/2), the Voigt/Faddeeva form (scipy.special.wofz)
Their mutual deviation is recorded as `crosscheck`.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
import numpy as np
from scipy.special import wofz
from scipy.integrate import quad
from scipy.optimize import brentq, minimize_scalar

# --- evaluated resonance parameters (Derrien et al., ORNL/TM-2005/241 Table 8; ENDF/B-VII/VIII) ---
E0   = 6.673
GN   = 1.476e-3
GG   = 23.00e-3
G    = GN + GG
KB   = 8.617333262e-5
M_U  = 238.0507884
M_N  = 1.00866491595
AR   = M_U/M_N
GJ   = 1.0
FOURPIL2 = 2.603897e6          # eV*barn = 4 pi hbar^2/(2 m_n)
SIGMA0 = FOURPIL2/E0*((AR+1)/AR)**2*GJ*GN/G
SIGPK  = SIGMA0*GG/G

def DeltaD(T): return math.sqrt(4*E0*KB*T/AR)

def psi_wofz(xi, x):
    return (math.sqrt(math.pi)*xi/2.0)*np.real(wofz(xi*(np.asarray(x, float)+1j)/2.0))

def psi_quad(xi, x):
    f = lambda y: math.exp(-0.25*xi*xi*(x-y)**2)/(1.0+y*y)
    R = 60.0/max(xi, 1e-9)
    pts = sorted({-np.inf, min(0.0, x)-R, 0.0, float(x), max(0.0, x)+R, np.inf})
    tot = 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        tot += quad(f, a, b, limit=500, epsabs=1e-15, epsrel=1e-13)[0]
    return xi/(2*math.sqrt(math.pi))*tot

def sigma(E, T, route='w'):
    xi = G/DeltaD(T); x = 2*(np.asarray(E, float)-E0)/G
    p = psi_wofz(xi, x) if route == 'w' else np.array([psi_quad(xi, xx) for xx in np.atleast_1d(x)]).reshape(np.shape(x))
    return SIGPK*np.sqrt(E0/np.asarray(E, float))*p

def peak_of(T):
    r = minimize_scalar(lambda E: -float(sigma(E, T)), bracket=(E0-0.02, E0, E0+0.02),
                        options={'xtol': 1e-15})
    return float(r.x), float(sigma(r.x, T))

def fwhm_of(T):
    Epk, pk = peak_of(T)
    h = pk/2
    lo = brentq(lambda E: float(sigma(E, T))-h, E0-3.0, Epk, xtol=1e-14, rtol=1e-15)
    hi = brentq(lambda E: float(sigma(E, T))-h, Epk, E0+3.0, xtol=1e-14, rtol=1e-15)
    return hi-lo

def area_of(T, a=E0-1.0, b=E0+1.0):
    v = 0.0
    edges = sorted({a, E0-0.5, E0-0.1, E0, E0+0.1, E0+0.5, b})
    for x0, x1 in zip(edges[:-1], edges[1:]):
        v += quad(lambda E: float(sigma(E, T)), x0, x1, limit=500, epsabs=1e-11, epsrel=1e-13)[0]
    return v

SAMPLE_E = [5.700, 6.000, 6.300, 6.500, 6.600, 6.673, 6.750, 6.900, 7.200, 7.600]
TEMPS    = [300, 450, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000]

if __name__ == "__main__":
    cases = []
    for T in TEMPS:
        D = DeltaD(T); xi = G/D
        Epk, pk = peak_of(T)
        fw = fwhm_of(T)
        ar = area_of(T)
        curve_w = {f"{E:.3f}": float(sigma(E, T, 'w')) for E in SAMPLE_E}
        curve_q = {f"{E:.3f}": float(sigma(E, T, 'q')) for E in SAMPLE_E}
        cx = max(abs(curve_w[k]-curve_q[k])/curve_w[k] for k in curve_w)
        cases.append({"T": T, "Delta_D": D, "xi": xi, "E_peak": Epk, "sigma_peak": pk,
                      "fwhm": fw, "area": ar, "sigma": curve_w, "crosscheck_psi_routes": cx})
    ref = {
        "parameters": {"E0": E0, "Gamma_n": GN, "Gamma_gamma": GG, "Gamma": G, "kB": KB,
                       "mass_ratio_A": AR, "g": GJ, "fourpi_lambdabar2_E": FOURPIL2,
                       "sigma_0": SIGMA0, "sigma_peak_0K": SIGPK},
        "sample_energies": SAMPLE_E,
        "area_window": [E0-1.0, E0+1.0],
        "analytic_area_infinite": SIGPK*G*math.pi/2,
        "cases": cases,
    }
    with open(_gp.ref('doppler_ref.json'), "w") as f:
        json.dump(ref, f, indent=1)
    print("sigma_0 = %.2f b, sigma_peak(0K) = %.2f b, Gamma = %.5f eV" % (SIGMA0, SIGPK, G))
    print("analytic infinite area = %.3f barn*eV" % (SIGPK*G*math.pi/2))
    print("%5s %9s %8s %10s %10s %10s %9s" % ("T", "Delta_D", "xi", "peak", "fwhm_meV", "area", "xcheck"))
    for c in cases:
        print("%5d %9.5f %8.5f %10.2f %10.3f %10.4f %9.1e"
              % (c["T"], c["Delta_D"], c["xi"], c["sigma_peak"], c["fwhm"]*1e3, c["area"],
                 c["crosscheck_psi_routes"]))
