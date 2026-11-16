#!/usr/bin/env python3
"""
Independent reference for kinetics.html  (point reactor kinetics).

The delayed-neutron data are READ OUT OF THE TOOL and used verbatim, so that the
mathematics is benchmarked rather than the choice of nuclear data:

    beta_i  = 0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273   (sum 0.006502)
    lambda_i= 0.0124, 0.0305, 0.1110, 0.3010, 1.1400, 3.0100  s^-1

That is Keepin's six-group least-squares fit for thermal fission of U-235
(G.R. Keepin, "Physics of Nuclear Kinetics", Addison-Wesley 1965, Table 4-6),
as reproduced in Duderstadt & Hamilton, "Nuclear Reactor Analysis" (1976) Table 2-3
and Lamarsh & Baratta, "Introduction to Nuclear Engineering" 3rd ed., Table 7.3.

Three structurally different references are computed for every case:
  (1) the inhour equation  rho = w*Lambda + sum_i beta_i w/(w+lambda_i)  solved with brentq
  (2) the dominant eigenvalue of the 7x7 point-kinetics system matrix (numpy.linalg.eig)
  (3) a stiff ODE integration of the full six-group system (scipy solve_ivp, Radau)
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json
import numpy as np
from scipy.optimize import brentq
from scipy.integrate import solve_ivp

BETA = np.array([0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273])
LAM = np.array([0.0124, 0.0305, 0.1110, 0.3010, 1.1400, 3.0100])
beta = BETA.sum()


def inhour(w, Lam):
    return w*Lam + float(np.sum(BETA*w/(w+LAM)))


def omega_root(rho, Lam):
    """(1) dominant (largest) root of the inhour equation."""
    if rho == 0.0:
        return 0.0
    if rho > 0:
        lo, hi = 1e-14, 1.0
        while inhour(hi, Lam) < rho and hi < 1e14:
            hi *= 10
        return brentq(lambda w: inhour(w, Lam)-rho, lo, hi, xtol=1e-16, rtol=1e-15)
    lo, hi = -LAM.min()+1e-13, -1e-16
    return brentq(lambda w: inhour(w, Lam)-rho, lo, hi, xtol=1e-18, rtol=1e-15)


def omega_eig(rho, Lam):
    """(2) dominant eigenvalue of the 7x7 point-kinetics matrix - completely different route."""
    A = np.zeros((7, 7))
    A[0, 0] = (rho-beta)/Lam
    A[0, 1:] = LAM
    for i in range(6):
        A[1+i, 0] = BETA[i]/Lam
        A[1+i, 1+i] = -LAM[i]
    ev = np.linalg.eigvals(A)
    ev = ev[np.abs(ev.imag) < 1e-9].real
    return float(ev.max())


def transient(rho, Lam, t_eval):
    """(3) stiff integration of the full six-group system, n(0)=1, C_i(0)=beta_i/(Lam lam_i)."""
    y0 = np.concatenate(([1.0], BETA/(Lam*LAM)))

    def f(t, y):
        n, C = y[0], y[1:]
        return np.concatenate(([(rho-beta)/Lam*n + float(np.sum(LAM*C))],
                               BETA/Lam*n - LAM*C))
    sol = solve_ivp(f, (0.0, float(max(t_eval))), y0, method='Radau', t_eval=t_eval,
                    rtol=1e-10, atol=1e-14, dense_output=True)
    assert sol.success, sol.message
    return sol


def exact_modal(rho, Lam, t):
    """Exact modal (7-mode) solution: n(t) = sum_k a_k exp(w_k t) from the eigen-decomposition.
       A fourth, purely algebraic check on the transient."""
    A = np.zeros((7, 7))
    A[0, 0] = (rho-beta)/Lam
    A[0, 1:] = LAM
    for i in range(6):
        A[1+i, 0] = BETA[i]/Lam
        A[1+i, 1+i] = -LAM[i]
    w, V = np.linalg.eig(A)
    y0 = np.concatenate(([1.0], BETA/(Lam*LAM)))
    c = np.linalg.solve(V, y0)
    return np.real(V[0] @ (c[:, None]*np.exp(np.outer(w, t))))


def modal_amplitude(rho, Lam):
    """Exact asymptotic amplitude a0 in n(t) -> a0 exp(w0 t) (7-mode decomposition).
       The prompt-jump approximation replaces a0 by beta/(beta-rho)."""
    A = np.zeros((7, 7))
    A[0, 0] = (rho-beta)/Lam
    A[0, 1:] = LAM
    for i in range(6):
        A[1+i, 0] = BETA[i]/Lam
        A[1+i, 1+i] = -LAM[i]
    w, V = np.linalg.eig(A)
    y0 = np.concatenate(([1.0], BETA/(Lam*LAM)))
    c = np.linalg.solve(V, y0)
    k = int(np.argmax(w.real))
    return float((V[0, k]*c[k]).real)


def tool_backward_euler(rho, Lam, tMax, T):
    """Replication of the integration scheme the tool documents in its own caption
       (backward Euler, dt = max(1e-6, Lambda/20) growing by 4 % per step up to
       min(tMax/300, |T|/40)).  This is NOT an independent reference - it is used only to
       explain an observed deviation of the plotted curve from the exact solution."""
    n = 1.0
    C = BETA/(Lam*LAM)
    t = 0.0
    dt = max(1e-6, Lam/20)
    dtMax = tMax/300
    if np.isfinite(T) and abs(T) > 0:
        dtMax = min(dtMax, abs(T)/40)
    dtMax = max(dt, dtMax)
    steps = 0
    ts, ns = [1e-7], [1.0]
    while t < tMax and steps < 6000:
        den = 1+dt*LAM
        Aa = float(np.sum(LAM*C/den))
        Bb = float(np.sum(LAM*dt*(BETA/Lam)/den))
        nN = (n + dt*Aa)/(1 - dt*((rho-beta)/Lam) - dt*Bb)
        C = (C + dt*(BETA/Lam)*nN)/den
        n = nN
        t += dt
        ts.append(t)
        ns.append(n)
        dt = min(dt*1.04, dtMax)
        steps += 1
    return np.array(ts), np.array(ns), steps


cases = []
DOLLARS = [-1.0, -0.8, -0.5, -0.25, -0.1, -0.05, -0.005, 0.005, 0.05, 0.1, 0.2, 0.3,
           0.5, 0.75, 0.9, 0.95, 0.995, 1.0]
LAMBDAS = [1e-5, 1e-4, 1e-3]

for Lam in LAMBDAS:
    for d in DOLLARS:
        rho = d*beta
        w1 = omega_root(rho, Lam)
        w2 = omega_eig(rho, Lam)
        T = float('inf') if w1 == 0 else 1.0/w1
        pj = beta/(beta-rho) if rho < beta else float('inf')
        cases.append(dict(
            id='K_L%g_d%g' % (Lam, d),
            note='rho = %g $ = %.1f pcm, Lambda = %g s' % (d, rho*1e5, Lam),
            inputs=dict(rho_dollar=d, log10_Lambda=round(np.log10(Lam), 6), Lambda=Lam),
            ref=dict(rho_pcm=rho*1e5, omega=w1, period_s=T,
                     doubling_s=(T*np.log(2) if np.isfinite(T) else None),
                     prompt_jump=(pj if np.isfinite(pj) else None),
                     beta_pcm=beta*1e5, beta=beta),
            crosscheck=dict(omega_eig=w2,
                            dev_omega=abs(w2-w1)/max(abs(w1), 1e-30) if w1 != 0 else 0.0)))

# --- prompt-critical boundary: period must collapse towards Lambda-controlled excursion
boundary = []
for Lam in LAMBDAS:
    for d in (0.9, 0.95, 0.99, 0.995, 1.0):      # slider step is 0.005 -> only on-grid values
        rho = d*beta
        w = omega_root(rho, Lam)
        boundary.append(dict(Lambda=Lam, dollar=d, omega=w, period_s=1.0/w,
                             prompt_jump=(beta/(beta-rho) if d < 1 else None)))

# --- transients: n(t)/n0 from the stiff integration, for the plotted curve
trans = []
for (d, Lam) in [(0.2, 1e-4), (0.5, 1e-4), (-0.5, 1e-4), (0.9, 1e-5), (1.0, 1e-4)]:
    rho = d*beta
    w = omega_root(rho, Lam)
    T = 1.0/w
    tMax = (max(0.5, min(20, 12*abs(T))) if d >= 1.0 else min(400, max(20, 6*abs(T))))
    tg = np.unique(np.concatenate([np.logspace(-6, np.log10(tMax), 400), [tMax]]))
    sol = transient(rho, Lam, tg)
    nm = exact_modal(rho, Lam, tg)
    a0 = modal_amplitude(rho, Lam)
    pj = beta/(beta-rho) if d < 1 else None
    # where is the single-mode asymptote good to 1 %?
    tail = tg[np.abs(nm/(a0*np.exp(tg/T))-1) < 0.01]
    tbe, nbe, steps = tool_backward_euler(rho, Lam, tMax, T)
    ex_be = exact_modal(rho, Lam, tbe[1:])
    trans.append(dict(id='TR_d%g_L%g' % (d, Lam), rho_dollar=d, Lambda=Lam, tMax=tMax,
                      period_s=T, prompt_jump=pj, a0=a0,
                      asym_ratio=(a0/pj if pj else None),
                      t_asym_valid_from=(float(tail.min()) if len(tail) else None),
                      t=list(map(float, tg)), n=list(map(float, sol.y[0])),
                      n_modal=list(map(float, nm)),
                      dev_modal=float(np.max(np.abs(sol.y[0]-nm)/np.abs(nm)),),
                      tool_scheme_replication=dict(
                          steps=int(steps), t_end=float(tbe[-1]),
                          n_end=float(nbe[-1]), n_end_exact=float(ex_be[-1]),
                          rel_error_at_end=float((nbe[-1]-ex_be[-1])/ex_be[-1]),
                          max_rel_error=float(np.max(np.abs((nbe[1:]-ex_be)/ex_be))))))

out = dict(cases=cases, boundary=boundary, transients=trans,
           data=dict(BETA=list(BETA), LAM=list(LAM), beta=float(beta)))
with open(_gp.ref('kinetics_ref.json'), 'w') as f:
    json.dump(out, f)
print('cases', len(cases), 'transients', len(trans))
print('max inhour-vs-eigenvalue deviation %.3e' % max(c['crosscheck']['dev_omega'] for c in cases))
print('max Radau-vs-modal deviation       %.3e' % max(t['dev_modal'] for t in trans))
for c in cases[:3]+cases[-3:]:
    print(c['id'], 'T=%.6g s  pj=%s' % (c['ref']['period_s'], c['ref']['prompt_jump']))
