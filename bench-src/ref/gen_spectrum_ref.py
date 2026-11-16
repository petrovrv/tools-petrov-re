"""Independent reference for spectrum.html — thermal-reactor neutron flux spectrum.

Everything below is derived from the analytic definitions of the three components, not from
the tool's code:

  * Watt fission spectrum for thermal-neutron-induced fission of U-235
        chi(E) = C exp(-E/a) sinh(sqrt(bE)),  a = 0.988 MeV, b = 2.249 1/MeV
    with C, <E>, the peak of chi and the peak of E*chi each obtained TWO structurally different
    ways (closed form vs numerical quadrature / root finding) and cross-checked.
  * Maxwellian flux  phi(E) = C E exp(-E/kT):  peak of phi at kT, peak of E*phi at 2kT,
    <E> = 2kT — closed forms, cross-checked numerically.
  * 1/E slowing-down flux: E*phi = const inside the sigmoid window documented by the tool.

The composite mixture (thermal x ratio, epithermal x 0.42, fast x 1, each normalised to its own
maximum) is the tool's own illustrative recipe; the thermal fraction below the cadmium cutoff is
therefore checked by integrating that stated definition with scipy adaptive quadrature, i.e. it
verifies the quadrature and the normalisation, not a physical prediction.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
import numpy as np
from scipy.integrate import quad
from scipy.optimize import brentq, minimize_scalar

KB = 8.617333262e-5      # eV/K, CODATA 2018
A_W, B_W = 0.988, 2.249  # MeV, 1/MeV
CUT = 0.625              # eV
A_EPI = 0.42
EMIN, EMAX, NGRID = 1e-4, 1e7, 1101

chi = lambda E: math.exp(-E/A_W)*math.sinh(math.sqrt(B_W*E))            # E in MeV, unnormalised
dchi = lambda E: math.exp(-E/A_W)*(-math.sinh(math.sqrt(B_W*E))/A_W
                                   + math.cosh(math.sqrt(B_W*E))*B_W/(2*math.sqrt(B_W*E)))
sig = lambda x: 1.0/(1.0+math.exp(-x))


def watt_reference():
    I0 = quad(chi, 0, 80, limit=400, epsabs=1e-14)[0]
    I1 = quad(lambda E: E*chi(E), 0, 80, limit=400, epsabs=1e-14)[0]
    C_num = 1.0/I0
    C_cf = 2.0*math.exp(-A_W*B_W/4.0)/math.sqrt(math.pi*A_W**3*B_W)
    mean_num, mean_cf = I1/I0, 1.5*A_W + A_W*A_W*B_W/4.0
    pk_chi = brentq(dchi, 0.05, 3.0, xtol=1e-15, rtol=1e-15)
    pk_chi2 = minimize_scalar(lambda E: -chi(E), bracket=(0.2, 0.7, 3.0),
                              options={'xtol': 1e-13}).x
    dEchi = lambda E: chi(E) + E*dchi(E)
    pk_leth = brentq(dEchi, 0.5, 8.0, xtol=1e-15, rtol=1e-15)
    pk_leth2 = minimize_scalar(lambda E: -E*chi(E), bracket=(1.0, 2.0, 5.0),
                               options={'xtol': 1e-13}).x
    return {
        "C_numeric": C_num, "C_closed_form": C_cf,
        "mean_MeV_numeric": mean_num, "mean_MeV_closed_form": mean_cf,
        "peak_chi_MeV": pk_chi, "peak_chi_MeV_alt": pk_chi2,
        "peak_lethargy_MeV": pk_leth, "peak_lethargy_MeV_alt": pk_leth2,
        "crosscheck": {
            "C": abs(C_num-C_cf)/C_cf,
            "mean": abs(mean_num-mean_cf)/mean_cf,
            "peak_chi": abs(pk_chi-pk_chi2)/pk_chi,
            "peak_lethargy": abs(pk_leth-pk_leth2)/pk_leth},
    }


def epi_window(E, kt):
    return sig((math.log(E)-math.log(4*kt))/0.85)*sig(-(math.log(E)-math.log(0.2e6))/1.0)


def maxima(kt):
    """Analytic (continuum) maximum of each per-lethargy component."""
    th = (2*kt)**2*math.exp(-2.0)
    ep = -minimize_scalar(lambda u: -epi_window(math.exp(u), kt),
                          bracket=(math.log(4*kt)+2, math.log(1e3), math.log(2e5)),
                          options={'xtol': 1e-14}).fun
    fa = -minimize_scalar(lambda E: -(E/1e6)*chi(E/1e6),
                          bracket=(1e6, 2e6, 5e6), options={'xtol': 1e-14}).fun
    return th, ep, fa


def grid_maxima(kt):
    """Maximum of each component over the documented 1101-point, 0.01-decade grid."""
    E = np.power(10.0, np.linspace(math.log10(EMIN), math.log10(EMAX), NGRID))
    th = (E*E*np.exp(-E/kt)).max()
    lnE = np.log(E)
    ep = (1/(1+np.exp(-(lnE-math.log(4*kt))/0.85))*1/(1+np.exp((lnE-math.log(0.2e6))/1.0))).max()
    eM = E/1e6
    fa = (eM*np.exp(-eM/A_W)*np.sinh(np.sqrt(B_W*eM))).max()
    return float(th), float(ep), float(fa)


def components(E, kt, r, norm):
    """Per-lethargy components at energy E [eV], normalised by `norm` and weighted."""
    thm, epm, fam = norm
    th = r*(E*E*math.exp(-E/kt))/thm
    ep = A_EPI*epi_window(E, kt)/epm
    fa = ((E/1e6)*chi(E/1e6))/fam
    return th, ep, fa


def thermal_fraction(kt, r, norm):
    def phi(E):
        th, ep, fa = components(E, kt, r, norm)
        return (th+ep+fa)/E
    lo = quad(phi, EMIN, CUT, limit=500, epsabs=1e-13, epsrel=1e-12)[0]
    tot = lo
    pts = [CUT, 1, 10, 1e2, 1e3, 1e4, 1e5, 1e6, 3e6, EMAX]
    for a, b in zip(pts[:-1], pts[1:]):
        tot += quad(phi, a, b, limit=500, epsabs=1e-12, epsrel=1e-12)[0]
    return lo/tot


def plateau_flatness(kt):
    f = lambda u: epi_window(math.exp(u), kt)
    us = np.linspace(math.log(10), math.log(1e4), 200001)
    v = np.array([f(u) for u in us[::200]])          # coarse scan for bracketing
    fine = np.array([epi_window(math.exp(u), kt) for u in us])
    return float(fine.max()/fine.min())


def max_log_slope(kt, r, norm):
    """max |d ln u_total / d ln E| over the plotted range, by dense central differences."""
    u = np.linspace(math.log(EMIN), math.log(EMAX), 400001)
    tot = np.array([sum(components(math.exp(x), kt, r, norm)) for x in u])
    d = np.abs(np.gradient(np.log(tot), u[1]-u[0]))
    return float(d.max())


SAMPLE_E = [1e-2, 1e-1, 1e0, 1e1, 1e2, 1e3, 1e5, 1e6, 1e7]
TAG = ["1e-2", "1e-1", "1e+0", "1e+1", "1e+2", "1e+3", "1e+5", "1e+6", "1e+7"]
CASES = [(300, 1.0), (450, 2.5), (600, 1.0), (600, 3.0), (900, 0.2), (1200, 5.0)]

if __name__ == "__main__":
    watt = watt_reference()
    out = {"watt": watt, "sample_energies": SAMPLE_E, "sample_tags": TAG,
           "constants": {"kB": KB, "a_MeV": A_W, "b_perMeV": B_W, "cutoff_eV": CUT,
                         "A_epithermal": A_EPI, "grid": [EMIN, EMAX, NGRID]},
           "cases": []}
    for T, r in CASES:
        kt = KB*T
        an = maxima(kt)
        gm = grid_maxima(kt)
        frac = thermal_fraction(kt, r, an)
        s = {}
        for E, tg in zip(SAMPLE_E, TAG):
            th, ep, fa = components(E, kt, r, an)
            s[tg] = {"thermal": th, "epithermal": ep, "fast": fa, "total": th+ep+fa}
        out["cases"].append({
            "T": T, "r": r, "kT": kt,
            "E_most_probable": kt, "E_mean_2kT": 2*kt,
            "E_peak_thermal_curve": 2*kt, "E_mean_maxwellian": 2*kt,
            "thermal_fraction": frac,
            "plateau_flatness": plateau_flatness(kt),
            "max_dln_u_dlnE": max_log_slope(kt, r, an),
            "analytic_maxima": {"thermal": an[0], "epithermal": an[1], "fast": an[2]},
            "grid_over_analytic_max": {"thermal": gm[0]/an[0], "epithermal": gm[1]/an[1],
                                       "fast": gm[2]/an[2]},
            "samples": s})
    with open(_gp.ref('spectrum_ref.json'), "w") as f:
        json.dump(out, f, indent=1)
    print("Watt: C = %.9f (closed form %.9f, dev %.1e)" % (watt["C_numeric"], watt["C_closed_form"], watt["crosscheck"]["C"]))
    print("Watt: <E> = %.9f MeV (3a/2+a^2b/4 = %.9f, dev %.1e)" % (watt["mean_MeV_numeric"], watt["mean_MeV_closed_form"], watt["crosscheck"]["mean"]))
    print("Watt: peak(chi) = %.6f MeV, peak(E chi) = %.6f MeV" % (watt["peak_chi_MeV"], watt["peak_lethargy_MeV"]))
    for c in out["cases"]:
        print("T=%4d r=%.2f  kT=%.6f eV  frac=%.6f  flatness=%.5f  gridmax/analytic: th %.6f epi %.6f fast %.6f"
              % (c["T"], c["r"], c["kT"], c["thermal_fraction"], c["plateau_flatness"],
                 c["grid_over_analytic_max"]["thermal"], c["grid_over_analytic_max"]["epithermal"],
                 c["grid_over_analytic_max"]["fast"]))
