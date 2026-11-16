"""Independent reference for reactorstand.html — point-kinetics reactor stand.

The page's physics core is separable from wall time: PLANT_REACTOR.step(t, x, u, d, p, h)
advances the 12-state vector by exactly h seconds of MODEL time and touches no clock, so the
whole plant can be benchmarked deterministically.

Three structurally different routes are implemented here:

 (1) the exact seven-mode modal solution of the six-group point-kinetics equations for a step
     reactivity (no truncation error at any step size), built from the roots of the inhour
     equation found by Brent bisection;
 (2) the same six-group system integrated as a stiff ODE (scipy solve_ivp, Radau, rtol 1e-11);
 (3) the full twelve-state plant — six-group kinetics + I-135/Xe-135 chain + two-node fuel /
     coolant thermal model + outlet lag, with rod, xenon and Doppler reactivity — integrated
     with scipy solve_ivp (Radau, rtol 1e-10) from an initial condition constructed here in
     closed form and handed to the page unchanged.

Routes (1) and (2) are cross-checked against each other; their mutual deviation is recorded.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

# ---- delayed-neutron data (Keepin, thermal fission of U-235) as used by the tool ----
BETA = np.array([0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273])
LAM = np.array([0.0124, 0.0305, 0.1110, 0.3010, 1.1400, 3.0100])
BETA_TOT = float(BETA.sum())                      # 0.006502

LAM_I, LAM_X = 2.926e-5, 2.106e-5                 # 1/s
GAM_I, GAM_X = 0.0639, 0.00237                    # fission yields
SIG_AX, SIG_F, NU = 2.65e-18, 0.0616, 2.43
PCM = 1e-5

iN, iC, iI, iX, iTf, iTc, iTo = 0, 1, 7, 8, 9, 10, 11
NSTATE = 12


# ------------------------------------------------------------------ inhour / modal
def inhour(w, Lam):
    """rho(omega) of the inhour equation, in absolute dk/k."""
    return w*Lam + float(np.sum(BETA*w/(w+LAM)))


def inhour_roots(rho, Lam):
    """All seven roots of F(w) = rho - w*Lam - sum beta_i w/(w+lam_i) = 0."""
    F = lambda w: rho - inhour(w, Lam)
    roots = []
    eps = 1e-13

    def bis(a, b):
        return brentq(F, a, b, xtol=1e-300, rtol=8.9e-16, maxiter=300)

    # one root in each interval (-lam_{i+1}, -lam_i), plus the dominant one
    poles = sorted(-LAM)                     # -3.01 ... -0.0124
    for a, b in zip(poles[:-1], poles[1:]):
        lo, hi = a*(1-eps) + eps*b, b*(1+eps) - eps*a
        lo, hi = a + (b-a)*1e-12, b - (b-a)*1e-12
        roots.append(bis(lo, hi))
    if rho > 0:
        hi = 1.0
        while F(hi) > 0:
            hi *= 10
        roots.append(bis(1e-12, hi))
    elif rho < 0:
        a = -LAM.min()
        lo, hi = a + abs(a)*1e-12, -1e-12
        roots.append(bis(lo, hi))
    else:
        roots.append(0.0)
    # the fastest (prompt) root, below -lam_6
    lo = -LAM.max()*2 - 1
    while F(lo) < 0 and lo > -1e15:
        lo *= 10
    hi = -LAM.max() - (LAM.max()*1e-12)
    roots.append(bis(lo, hi))
    return sorted(roots)


def modal(rho, Lam):
    """Exact n(t) for a step rho from the equilibrium n=1, C_i = beta_i/(Lam lam_i)."""
    w = inhour_roots(rho, Lam)
    a = []
    for wk in w:
        d = wk + LAM
        num_ = Lam + float(np.sum(BETA/d))
        den = Lam + float(np.sum(BETA*LAM/(d*d)))
        a.append(num_/den)
    w = np.array(w)
    a = np.array(a)
    def n(t):
        e = w*t
        return float(np.sum(np.where(e > -745, a*np.exp(np.clip(e, -745, 700)), 0.0)))
    def integral_n(t):
        """INT_0^t n dt', analytic."""
        s = 0.0
        for ak, wk in zip(a, w):
            if wk == 0:
                s += ak*t
            elif wk*t < -700:
                s += ak*(-1.0)/wk
            else:
                s += ak*(math.expm1(wk*t)/wk)
        return s
    return w, a, n, integral_n


def kinetics_eig(rho, Lam, ts):
    """Route 2: eigen-decomposition of the 7x7 point-kinetics system matrix.

    Structurally independent of route (1): the growth rates come from numpy.linalg.eig
    instead of Brent roots of the inhour equation, and the amplitudes from solving the
    eigenvector system for the initial condition instead of from Laplace residues.
    """
    A = np.zeros((7, 7))
    A[0, 0] = (rho - BETA_TOT)/Lam
    A[0, 1:] = LAM
    for i in range(6):
        A[1+i, 0] = BETA[i]/Lam
        A[1+i, 1+i] = -LAM[i]
    wv, V = np.linalg.eig(A)
    y0 = np.concatenate(([1.0], BETA/(Lam*LAM)))
    c = np.linalg.solve(V, y0)
    y = np.zeros((7, len(ts)))
    for k, t in enumerate(ts):
        e = np.where(np.real(wv*t) > -745, np.exp(np.clip(np.real(wv*t), -745, 700)), 0.0)
        y[:, k] = np.real(V @ (c*e))
    return y, np.sort(np.real(wv))


# ------------------------------------------------------------------ full plant
def thermal_of(p, w):
    a0 = max(p['dTfull'] - 0.5*p['dTcool'], 1e-6)
    g0 = 0.5*p['dTcool']/a0
    tf0 = max(p['tauF'], 1e-6)
    phi = min(max(p.get('filmFrac', 0.05), 0.0), 1.0)
    ww = w if (isinstance(w, float) and w > 0.02) else 1.0
    k = 1.0 if (phi == 0 or ww == 1) else ((1-phi) + phi*ww**-0.8)
    return {'a': a0*k, 'g': g0/k, 'tf': tf0*k, 'tc': max(p['tauC'], 1e-6)}


def tau_out(p):
    v = p.get('tauOut')
    if isinstance(v, (int, float)) and math.isfinite(v):
        return v if v > 0 else 0.0
    return 2*max(p.get('tauC', 2), 1e-6)


def rho_pcm(x, u, p):
    """Rod (linear bank, tipWorth = 0) + xenon + Doppler; alphaC = alphaVoid = 0."""
    ctrl = p['rhoSpan']*(min(max(u, 0.0), 1.0) - 0.5)
    xe = -SIG_AX*x[iX]/(NU*SIG_F)*1e5
    dop = p['alphaD']*(x[iTf] - p['Tref'])
    return ctrl + xe + dop


def plant_rhs(p, u, Tin, flow):
    th = thermal_of(p, flow)
    tauO = tau_out(p)
    def f(t, x):
        dx = np.zeros(NSTATE)
        rho = rho_pcm(x, u, p)*PCM
        n = x[iN]
        phi = p['phiNom']*n
        C = x[iC:iC+6]
        dx[iN] = ((rho - BETA_TOT)/p['Lambda'])*n + float(np.sum(LAM*C))
        dx[iC:iC+6] = (BETA/p['Lambda'])*n - LAM*C
        dx[iI] = GAM_I*SIG_F*phi - LAM_I*x[iI]
        dx[iX] = GAM_X*SIG_F*phi + LAM_I*x[iI] - LAM_X*x[iX] - SIG_AX*phi*x[iX]
        dx[iTf] = (-(x[iTf] - x[iTc]) + th['a']*n)/th['tf']
        dx[iTc] = (th['g']*(x[iTf] - x[iTc]) - flow*(x[iTc] - Tin))/th['tc']
        dx[iTo] = ((2*x[iTc] - Tin) - x[iTo])/tauO if tauO > 0 else 2*dx[iTc]
        return dx
    return f


def equilibrium(p, pct, Tin=290.0, flow=1.0):
    """Closed-form steady state and the rod position that makes it critical."""
    n0 = pct/100.0
    phi0 = p['phiNom']*n0
    Ieq = GAM_I*SIG_F*phi0/LAM_I
    Xeq = (GAM_X + GAM_I)*SIG_F*phi0/(LAM_X + SIG_AX*phi0)
    th = thermal_of(p, flow)
    Tc = Tin + th['g']*th['a']*n0/flow
    Tf = Tc + th['a']*n0
    Tout = Tin + 2*th['g']*th['a']*n0/flow
    rXe = -SIG_AX*Xeq/(NU*SIG_F)*1e5
    rD = p['alphaD']*(Tf - p['Tref'])
    demand = -(rXe + rD)
    u0 = demand/p['rhoSpan'] + 0.5
    x = np.zeros(NSTATE)
    x[iN] = n0
    x[iC:iC+6] = BETA*n0/(p['Lambda']*LAM)
    x[iI], x[iX], x[iTf], x[iTc], x[iTo] = Ieq, Xeq, Tf, Tc, Tout
    return {'x': x, 'u0': u0, 'n0': n0, 'Ieq': Ieq, 'Xeq': Xeq, 'Tf': Tf, 'Tc': Tc,
            'Tout': Tout, 'rhoXe': rXe, 'rhoDoppler': rD, 'rhoCtrl': demand}


DEFAULTS = {'Lambda': 1e-4, 'rhoSpan': 8000, 'phiNom': 3.0e13, 'alphaD': -2.5,
            'tauF': 6, 'dTfull': 320, 'Tref': 290, 'dTcool': 30, 'tauC': 2,
            'flow': 1, 'Tin0': 290, 'alphaC': 0, 'alphaVoid': 0, 'Tsat': 0,
            'tipWorth': 0, 'worthTip': 0, 'followerWorth': 0, 'filmFrac': 0.05}

# -------------------------------------------------------------- benchmark case lists
KIN_CASES = []                                   # (rho_dollar, Lambda)
for lam in (1e-5, 1e-4, 1e-3):
    for d in (-1.0, -0.5, -0.1, 0.1, 0.3, 0.5, 0.9):
        KIN_CASES.append((d, lam))
KIN_TIMES = [0.01, 0.1, 1.0, 10.0, 60.0, 300.0]

FULL_CASES = [
    {'id': 'load_drop_rod', 'pct': 100, 'du_pcm': -200, 'horizon': 300},
    {'id': 'rod_out_50pcm', 'pct': 100, 'du_pcm': 50, 'horizon': 600},
    {'id': 'half_power', 'pct': 50, 'du_pcm': 100, 'horizon': 200},
    {'id': 'scram_xenon_pit', 'pct': 100, 'du_pcm': -4000, 'horizon': 3600*12},
    {'id': 'steady_hold', 'pct': 100, 'du_pcm': 0, 'horizon': 3600},
]

if __name__ == '__main__':
    out = {'constants': {'beta': list(BETA), 'lambda': list(LAM), 'beta_tot': BETA_TOT,
                         'LAM_I': LAM_I, 'LAM_X': LAM_X, 'GAM_I': GAM_I, 'GAM_X': GAM_X,
                         'SIG_AX': SIG_AX, 'SIG_F': SIG_F, 'NU': NU},
           'defaults': DEFAULTS, 'kinetics_times': KIN_TIMES,
           'kinetics': [], 'full': []}

    for d, lam in KIN_CASES:
        rho = d*BETA_TOT
        w, a, n, In = modal(rho, lam)
        wdom = max(w)
        # keep the horizon where n stays representable: omega*t <= 25
        tmax = min(300.0, 25.0/wdom) if wdom > 0 else 300.0
        times = sorted(set(round(min(t, tmax), 6) for t in KIN_TIMES))
        ys, wv = kinetics_eig(rho, lam, times)
        nm = [n(t) for t in times]
        cross = max(abs(ys[0, k]-nm[k])/max(nm[k], 1e-300) for k in range(len(times)))
        cross_w = max(abs(wk-wr)/max(abs(wr), 1e-30) for wk, wr in zip(wv, sorted(w)))
        # precursor balance:  d/dt (n + sum C_i) = rho/Lambda * n
        C0 = BETA/(lam*LAM)
        bal = []
        for k, t in enumerate(times):
            lhs = (nm[k] + sum(ys[1:, k])) - (1.0 + float(C0.sum()))
            rhs_ = rho/lam*In(t)
            bal.append({'t': t, 'lhs': lhs, 'rhs': rhs_,
                        'rel': abs(lhs-rhs_)/max(abs(rhs_), 1e-30)})
        tA = max(30.0, times[-1]*0.6)
        tB = times[-1]
        period_window = (tB - tA)/math.log(n(tB)/n(tA))
        out['kinetics'].append({
            'rho_dollar': d, 'Lambda': lam, 'rho': rho,
            'omega': max(w), 'period': 1/max(w),
            'period_window': period_window, 'window': [tA, tB],
            'roots': list(w), 'amplitudes': list(a),
            'times': times,
            'n': nm, 'sumC': [float(sum(ys[1:, k])) for k in range(len(times))],
            'int_n': [In(t) for t in times],
            'prompt_jump': BETA_TOT/(BETA_TOT-rho),
            'crosscheck_modal_vs_eig': cross,
            'crosscheck_roots_vs_eigenvalues': cross_w,
            'balance': bal})

    for c in FULL_CASES:
        p = dict(DEFAULTS)
        eq = equilibrium(p, c['pct'])
        u = eq['u0'] + c['du_pcm']/p['rhoSpan']
        f = plant_rhs(p, u, p['Tin0'], p['flow'])
        T = c['horizon']
        ts = [T*k/4 for k in range(1, 5)]
        s = solve_ivp(f, (0, T), eq['x'], method='Radau', t_eval=ts,
                      rtol=1e-10, atol=[1e-14]+[1e-12]*6+[1e-3, 1e-3, 1e-9, 1e-9, 1e-9])
        s2 = solve_ivp(f, (0, T), eq['x'], method='LSODA', t_eval=ts,
                       rtol=1e-11, atol=1e-13)
        cross = float(np.max(np.abs(s.y[iN]-s2.y[iN])/np.abs(s.y[iN])))
        out['full'].append({'id': c['id'], 'pct': c['pct'], 'du_pcm': c['du_pcm'],
                            'u': u, 'u0': eq['u0'], 'horizon': T, 't_eval': ts,
                            'x0': list(eq['x']),
                            'equilibrium': {k: (list(v) if k == 'x' else v)
                                            for k, v in eq.items()},
                            'y': [list(s.y[:, k]) for k in range(len(ts))],
                            'crosscheck_radau_vs_lsoda': cross})

    with open(_gp.ref('reactorstand_ref.json'), 'w') as fh:
        json.dump(out, fh, indent=1)
    print('%-8s %-8s %-12s %-12s %-10s %s' % ('rho$', 'Lambda', 'period', 'n(300s)', 'xcheck', 'balance_rel'))
    for k in out['kinetics']:
        print('%-8.2f %-8.0e %-12.5g %-12.6g %-10.1e %.1e'
              % (k['rho_dollar'], k['Lambda'], k['period'], k['n'][-1],
                 k['crosscheck_modal_vs_eig'], max(b['rel'] for b in k['balance'])))
    for c in out['full']:
        print('%-22s n(end)=%.6g  Tf=%.4f  X=%.6g  xcheck=%.1e'
              % (c['id'], c['y'][-1][iN], c['y'][-1][iTf], c['y'][-1][iX],
                 c['crosscheck_radau_vs_lsoda']))
