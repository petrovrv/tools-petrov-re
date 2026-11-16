#!/usr/bin/env python3
"""
Independent reference for xenon.html  (Xe-135 transient after shutdown).

Constants are READ OUT OF THE TOOL and used verbatim:
    lambda_I = 2.926e-5 1/s   (t1/2 = 6.58 h)      gamma_I  = 0.0639
    lambda_X = 2.106e-5 1/s   (t1/2 = 9.14 h)      gamma_X  = 0.00237
    sigma_a^Xe = 2.65e-18 cm2 (2.65e6 barn)        Sigma_f  = 0.0616 1/cm,  nu = 2.43

Two structurally different references are computed for every case:
  (1) the closed-form solution of the coupled I-135/Xe-135 equations after shutdown
      (phi = 0), a two-term exponential, with the peak located by brentq on dX/dt
  (2) a direct numerical integration of the same ODE system (scipy solve_ivp, LSODA,
      rtol 1e-12) with the peak located by golden-section search on the dense output
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json
import numpy as np
from scipy.optimize import brentq, minimize_scalar
from scipy.integrate import solve_ivp

lamI, lamX = 2.926e-5, 2.106e-5
gI, gX = 0.0639, 0.00237
sig, Sf, nu = 2.65e-18, 0.0616, 2.43
HR = 3600.0


def Ieq(phi):  return gI*Sf*phi/lamI
def Xeq(phi):  return (gX+gI)*Sf*phi/(lamX+sig*phi)
def rho_pcm(X): return -sig*X/(nu*Sf)*1e5


def X_analytic(t, phi):
    """(1) closed form: X(t) = Xeq e^-lamX t + lamI Ieq/(lamX-lamI) (e^-lamI t - e^-lamX t)."""
    I0, X0 = Ieq(phi), Xeq(phi)
    return X0*np.exp(-lamX*t) + lamI*I0/(lamX-lamI)*(np.exp(-lamI*t)-np.exp(-lamX*t))


def dXdt(t, phi):
    I0, X0 = Ieq(phi), Xeq(phi)
    return (-lamX*X0*np.exp(-lamX*t)
            + lamI*I0/(lamX-lamI)*(-lamI*np.exp(-lamI*t)+lamX*np.exp(-lamX*t)))


def peak_analytic(phi, tmax=72*HR):
    """Peak time from the closed form; 0 if X decreases from the start."""
    if dXdt(0.0, phi) <= 0:
        return 0.0, X_analytic(0.0, phi)
    if dXdt(tmax, phi) > 0:
        return tmax, X_analytic(tmax, phi)      # peak outside the plotted window
    tp = brentq(lambda t: dXdt(t, phi), 0.0, tmax, xtol=1e-9, rtol=1e-15)
    return tp, X_analytic(tp, phi)


def peak_numeric(phi, tmax=72*HR):
    """(2) same peak from a direct stiff integration of dI/dt=-lamI I, dX/dt=lamI I-lamX X."""
    sol = solve_ivp(lambda t, y: [-lamI*y[0], lamI*y[0]-lamX*y[1]],
                    (0.0, tmax), [Ieq(phi), Xeq(phi)], method='LSODA',
                    rtol=1e-12, atol=1e-6, dense_output=True)
    assert sol.success
    if dXdt(0.0, phi) <= 0:
        return 0.0, float(sol.sol(0.0)[1])
    r = minimize_scalar(lambda t: -sol.sol(t)[1], bounds=(0.0, tmax), method='bounded',
                        options=dict(xatol=1e-6))
    return float(r.x), float(-r.fun)


def dead_time(phi, margin_pcm, tmax=72*HR):
    """Window in which |rho_Xe(t)| exceeds the shutdown margin, from the closed form."""
    f = lambda t: abs(rho_pcm(X_analytic(t, phi)))-margin_pcm
    tp, _ = peak_analytic(phi, tmax)
    if f(tp) <= 0:
        return None                                    # never exceeded
    t0 = 0.0 if f(0.0) > 0 else brentq(f, 0.0, tp, xtol=1e-9)
    if f(tmax) > 0:
        return dict(t0=t0/HR, t1=None, dur=None, t1_beyond_window=True,
                    t1_true=None)
    t1 = brentq(f, tp, tmax, xtol=1e-9)
    return dict(t0=t0/HR, t1=t1/HR, dur=(t1-t0)/HR, t1_beyond_window=False)


def dead_time_long(phi, margin_pcm):
    """Same, but with no 72 h horizon - used to detect silent clipping."""
    f = lambda t: abs(rho_pcm(X_analytic(t, phi)))-margin_pcm
    tp, _ = peak_analytic(phi, 72*HR)
    if f(tp) <= 0:
        return None
    t0 = 0.0 if f(0.0) > 0 else brentq(f, 0.0, tp, xtol=1e-9)
    hi = max(tp*2, 100*HR)
    while f(hi) > 0 and hi < 1e9:
        hi *= 2
    t1 = brentq(f, tp, hi, xtol=1e-9)
    return dict(t0=t0/HR, t1=t1/HR, dur=(t1-t0)/HR)


cases = []
PHI = [1e12, 2e12, 3.16e12, 5e12, 1e13, 2e13, 3e13, 5e13, 7e13, 1e14]
MARGIN = [0, 500, 1000, 2000, 3000, 5000, 8000]

for lp in [12.0, 12.3, 12.5, 12.7, 13.0, 13.3, 13.48, 13.7, 13.9, 14.0]:
    phi = 10**lp
    tp1, xp1 = peak_analytic(phi)
    tp2, xp2 = peak_numeric(phi)
    ms = MARGIN if lp in (13.0, 13.48, 14.0) else [3000]
    if lp in (13.9, 14.0):
        ms = ms + [50, 100, 200, 300]      # small margins: does the 72 h horizon clip?
    for m in ms:
        dt = dead_time(phi, m)
        dtl = dead_time_long(phi, m)
        cases.append(dict(
            id='X_p%g_m%g' % (lp, m),
            note='phi = 1e%g n/cm2/s, shutdown margin %g pcm' % (lp, m),
            inputs=dict(log10_phi=lp, phi=phi, margin_pcm=m),
            ref=dict(rho_eq_pcm=rho_pcm(Xeq(phi)), rho_peak_pcm=rho_pcm(xp1),
                     t_peak_h=tp1/HR, Xeq=Xeq(phi), Ieq=Ieq(phi), Xpeak=xp1,
                     peak_over_eq=xp1/Xeq(phi),
                     dead_h=(dt['dur'] if dt else None),
                     dead_t0_h=(dt['t0'] if dt else None),
                     dead_t1_h=(dt['t1'] if dt else None),
                     dead_h_unclipped=(dtl['dur'] if dtl else None),
                     dead_clipped_by_72h_window=bool(dt and dt.get('t1_beyond_window'))),
            crosscheck=dict(t_peak_h_numeric=tp2/HR, rho_peak_pcm_numeric=rho_pcm(xp2),
                            dev_t_peak=abs(tp2-tp1)/max(tp1, 1e-9),
                            dev_rho_peak=abs(xp2-xp1)/xp1)))

# --- threshold flux below which there is no post-shutdown peak at all
phi_thresh = lamX*gX/(gI*sig)
thr = []
for f in (0.5, 0.9, 0.99, 1.0, 1.01, 1.1, 2.0, 10.0):
    phi = f*phi_thresh
    tp, xp = peak_analytic(phi)
    thr.append(dict(phi=phi, ratio_to_threshold=f, t_peak_h=tp/HR,
                    has_peak=bool(tp > 0), dXdt0=dXdt(0.0, phi)))

# --- high-flux asymptote of the peak time
t_peak_inf = np.log(lamI/lamX)/(lamI-lamX)/HR

out = dict(cases=cases,
           threshold=dict(phi_threshold=phi_thresh,
                          derivation='peak exists iff dX/dt(0) = lamI Ieq - lamX Xeq > 0, '
                                     'i.e. phi > lamX gammaX /(gammaI sigma_a)',
                          scan=thr),
           asymptote=dict(t_peak_infinite_flux_h=t_peak_inf,
                          formula='ln(lamI/lamX)/(lamI-lamX)',
                          classical_quoted_h=11.3),
           constants=dict(lamI=lamI, lamX=lamX, gI=gI, gX=gX, sig=sig, Sf=Sf, nu=nu,
                          halflife_I_h=np.log(2)/lamI/HR, halflife_X_h=np.log(2)/lamX/HR))
with open(_gp.ref('xenon_ref.json'), 'w') as f:
    json.dump(out, f, indent=1)

print('cases', len(cases))
print('max closed-form vs solve_ivp deviation: t_peak %.2e, rho_peak %.2e' % (
    max(c['crosscheck']['dev_t_peak'] for c in cases),
    max(c['crosscheck']['dev_rho_peak'] for c in cases)))
print('threshold flux = %.4g n/cm2/s' % phi_thresh)
print('t_peak at infinite flux = %.4f h  (classical quote 11.3 h)' % t_peak_inf)
print('I-135 half life %.3f h, Xe-135 half life %.3f h' % (
    np.log(2)/lamI/HR, np.log(2)/lamX/HR))
for c in cases:
    if c['inputs']['margin_pcm'] == 3000:
        print('%-16s rho_eq %8.1f  rho_pk %8.1f  t_pk %6.3f h  dead %s (unclipped %s)' % (
            c['id'], c['ref']['rho_eq_pcm'], c['ref']['rho_peak_pcm'], c['ref']['t_peak_h'],
            c['ref']['dead_h'], c['ref']['dead_h_unclipped']))
