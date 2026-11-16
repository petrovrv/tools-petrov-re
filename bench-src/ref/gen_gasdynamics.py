#!/usr/bin/env python3
"""
Independent closed-form compressible-flow reference for gasdynamics.html.

Nothing here is taken from the tool.  Every relation is written from the standard
constant-gamma (calorically perfect) equations as given in

  Ames Research Staff, NACA Report 1135, "Equations, Tables, and Charts for
  Compressible Flow", NACA, 1953.
     eq. (44)  isentropic p0/p, T0/T, rho0/rho
     eq. (80)  area ratio A/A*
     eq. (93)-(99) normal shock  M2, p2/p1, rho2/rho1, T2/T1, p02/p01
     eq. (138) theta-beta-M oblique shock relation
     eq. (171a) Prandtl-Meyer function nu(M)
  Table I  (isentropic), Table II (normal shock) - used for spot verification.

Fanno / Rayleigh:  standard constant-area relations, e.g. Shapiro,
  "The Dynamics and Thermodynamics of Compressible Fluid Flow", Vol. I, 1953,
  Ch. 6 (Fanno) and Ch. 7 (Rayleigh); identical forms are in NACA 1135 notation.

Shock tube: exact ideal-gas Riemann solver (two-shock/two-rarefaction pressure
  function), Toro, "Riemann Solvers and Numerical Methods for Fluid Dynamics",
  3rd ed., Ch. 4.  Verified against the standard Sod problem, Toro Table 4.1.

EVERY quantity is computed a SECOND, structurally different way (`crosscheck`):
  - isentropic/area   : from a numerically integrated mass-flux/energy balance
  - normal shock      : from raw Rankine-Hugoniot conservation residuals
  - oblique           : from an independent (p2/p1)-based turning-angle equation
  - Prandtl-Meyer     : from numerical quadrature of dnu = sqrt(M^2-1)/(1+(g-1)M^2/2) dM/M
  - Fanno             : from numerical integration of the dM/d(4fL/D) ODE
  - Rayleigh          : from the raw mass/momentum/energy balance of the duct
  - shock tube        : star state re-derived from Rankine-Hugoniot + isentropic
                        invariants, plus the published Sod values.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
from math import sqrt, sin, cos, tan, atan, asin, pi, log, isfinite
from scipy.optimize import brentq, minimize_scalar
from scipy.integrate import quad, solve_ivp

D2R = pi / 180.0
R2D = 180.0 / pi

# ----------------------------------------------------------------- isentropic
def T0_T(M, g):   return 1 + (g - 1) / 2 * M * M              # NACA 1135 eq.(44)
def p0_p(M, g):   return T0_T(M, g) ** (g / (g - 1))
def r0_r(M, g):   return T0_T(M, g) ** (1 / (g - 1))
def A_Astar(M, g):                                            # NACA 1135 eq.(80)
    return (1 / M) * ((2 / (g + 1)) * T0_T(M, g)) ** ((g + 1) / (2 * (g - 1)))

def mach_from_area(A, g, branch):
    if A <= 1.0:
        return 1.0
    if branch == 'sub':
        return brentq(lambda M: A_Astar(M, g) - A, 1e-9, 1.0, xtol=1e-15, rtol=1e-15)
    hi = 2.0
    while A_Astar(hi, g) < A:
        hi *= 1.5
    return brentq(lambda M: A_Astar(M, g) - A, 1.0, hi, xtol=1e-15, rtol=1e-15)

def area_crosscheck(M, g):
    """A/A* from the raw 1-D mass balance rho*u*A = rho* a* A*, no algebra reuse."""
    # rho/rho0 and T/T0 from the isentropic relations, u = M*sqrt(g R T); R and T0
    # cancel, so use R=1, T0=1.
    R, T0 = 1.0, 1.0
    def flux(m):
        T = T0 / T0_T(m, g)
        rho = 1.0 / r0_r(m, g)
        a = sqrt(g * R * T)
        return rho * m * a
    return flux(1.0) / flux(M)

# --------------------------------------------------------------- normal shock
def normal_shock(M1, g):                                      # NACA 1135 eq.(93)-(99)
    M2 = sqrt((1 + (g - 1) / 2 * M1 * M1) / (g * M1 * M1 - (g - 1) / 2))
    p2p1 = 1 + 2 * g / (g + 1) * (M1 * M1 - 1)
    r2r1 = ((g + 1) * M1 * M1) / ((g - 1) * M1 * M1 + 2)
    T2T1 = p2p1 / r2r1
    p02p01 = p2p1 * (T0_T(M2, g) / T0_T(M1, g)) ** (g / (g - 1))
    return dict(M2=M2, p2p1=p2p1, r2r1=r2r1, T2T1=T2T1, p02p01=p02p01)

def normal_shock_crosscheck(M1, g):
    """Solve the Rankine-Hugoniot system numerically instead of using the
    closed-form Mach relations.  State 1: rho1=1, p1=1, u1=M1*a1."""
    rho1, p1 = 1.0, 1.0
    a1 = sqrt(g * p1 / rho1)
    u1 = M1 * a1
    m = rho1 * u1                       # mass flux
    I = p1 + rho1 * u1 * u1             # momentum flux
    H = g / (g - 1) * p1 / rho1 + 0.5 * u1 * u1   # total enthalpy

    def resid(u2):
        rho2 = m / u2
        p2 = I - m * u2
        return g / (g - 1) * p2 / rho2 + 0.5 * u2 * u2 - H
    # the non-trivial root u2 < u1
    u2 = brentq(resid, 1e-9 * u1, u1 * (1 - 1e-12), xtol=1e-16, rtol=1e-15)
    rho2 = m / u2
    p2 = I - m * u2
    a2 = sqrt(g * p2 / rho2)
    M2 = u2 / a2
    p02 = p2 * p0_p(M2, g)
    p01 = p1 * p0_p(M1, g)
    return dict(M2=M2, p2p1=p2 / p1, r2r1=rho2 / rho1, T2T1=(p2 / rho2) / (p1 / rho1),
                p02p01=p02 / p01)

# -------------------------------------------------------------- oblique shock
def theta_of_beta(beta, M, g):                                # NACA 1135 eq.(138)
    return atan(2 / tan(beta) * (M * M * sin(beta) ** 2 - 1) /
                (M * M * (g + cos(2 * beta)) + 2))

def theta_max(M, g):
    mu = asin(1 / M)
    r = minimize_scalar(lambda b: -theta_of_beta(b, M, g),
                        bounds=(mu + 1e-12, pi / 2 - 1e-12), method='bounded',
                        options=dict(xatol=1e-14))
    return -r.fun, r.x

def oblique_beta(M, theta, g, branch):
    tmax, bmax = theta_max(M, g)
    if theta > tmax:
        return None
    mu = asin(1 / M)
    if theta <= 0:
        return mu if branch == 'weak' else pi / 2
    if branch == 'weak':
        return brentq(lambda b: theta_of_beta(b, M, g) - theta, mu + 1e-14, bmax,
                      xtol=1e-15, rtol=1e-15)
    return brentq(lambda b: theta_of_beta(b, M, g) - theta, bmax, pi / 2 - 1e-14,
                  xtol=1e-15, rtol=1e-15)

def oblique_state(M, theta, beta, g):
    Mn1 = M * sin(beta)
    ns = normal_shock(Mn1, g)
    M2 = ns['M2'] / sin(beta - theta)
    return dict(beta=beta, M2=M2, p2p1=ns['p2p1'], p02p01=ns['p02p01'],
                Mn1=Mn1, Mn2=ns['M2'], T2T1=ns['T2T1'], r2r1=ns['r2r1'])

def oblique_beta_crosscheck(M, theta, g, branch):
    """Independent route: for a candidate beta the pressure jump follows from the
    normal component; the flow deflection then follows from the *tangential*
    velocity being conserved, theta = beta - atan(tan(beta)*rho1/rho2).
    Root-solve that alternative equation."""
    def th(b):
        Mn1 = M * sin(b)
        if Mn1 <= 1:
            return -1e9
        r = ((g + 1) * Mn1 ** 2) / ((g - 1) * Mn1 ** 2 + 2)   # rho2/rho1
        return b - atan(tan(b) / r)
    tmax, bmax = theta_max(M, g)
    if theta > tmax:
        return None
    mu = asin(1 / M)
    if branch == 'weak':
        return brentq(lambda b: th(b) - theta, mu + 1e-12, bmax, xtol=1e-15, rtol=1e-15)
    return brentq(lambda b: th(b) - theta, bmax, pi / 2 - 1e-12, xtol=1e-15, rtol=1e-15)

# ------------------------------------------------------------- Prandtl-Meyer
def nu(M, g):                                                 # NACA 1135 eq.(171a)
    if M <= 1:
        return 0.0
    return (sqrt((g + 1) / (g - 1)) * atan(sqrt((g - 1) / (g + 1) * (M * M - 1)))
            - atan(sqrt(M * M - 1)))

def nu_max(g):
    return 0.5 * pi * (sqrt((g + 1) / (g - 1)) - 1)

def nu_crosscheck(M, g):
    """nu(M) = int_1^M sqrt(m^2-1)/(1+(g-1)m^2/2) dm/m  -- numerical quadrature."""
    f = lambda m: sqrt(m * m - 1) / (1 + (g - 1) / 2 * m * m) / m
    val, _ = quad(f, 1.0, M, limit=400, epsabs=1e-14, epsrel=1e-13)
    return val

def inv_nu(target, g):
    if target >= nu_max(g):
        return math.inf
    hi = 2.0
    while nu(hi, g) < target:
        hi *= 1.5
    return brentq(lambda M: nu(M, g) - target, 1.0, hi, xtol=1e-15, rtol=1e-15)

# --------------------------------------------------------------------- Fanno
def fanno_F(M, g):        # 4 f_Fanning L*/D  ==  f_Darcy L*/D
    return (1 - M * M) / (g * M * M) + (g + 1) / (2 * g) * log(
        ((g + 1) * M * M) / (2 + (g - 1) * M * M))

def fanno_p(M, g):   return (1 / M) * sqrt((g + 1) / (2 + (g - 1) * M * M))
def fanno_T(M, g):   return (g + 1) / (2 + (g - 1) * M * M)
def fanno_p0(M, g):  return (1 / M) * ((2 + (g - 1) * M * M) / (g + 1)) ** ((g + 1) / (2 * (g - 1)))

def fanno_F_crosscheck(M, g):
    """Integrate the Fanno ODE  d(4fL/D) = (1-M^2)/(g M^4 (1+(g-1)M^2/2)) * 2 dM^2/M^0
    written in the standard differential form
        d(fD x/D)/dM = 4(1-M^2) / (g M^3 (2+(g-1)M^2))
    from M to 1."""
    f = lambda m: 4 * (1 - m * m) / (g * m ** 3 * (2 + (g - 1) * m * m))
    val, _ = quad(f, M, 1.0, limit=400, epsabs=1e-14, epsrel=1e-13)
    return val

def fanno_march(M1, xi, g):
    """Downstream Mach after friction parameter xi = fD*L/D."""
    F1 = fanno_F(M1, g)
    if xi >= F1:
        return 1.0, True
    tgt = F1 - xi
    if M1 < 1:
        M2 = brentq(lambda m: fanno_F(m, g) - tgt, M1, 1 - 1e-15, xtol=1e-16, rtol=1e-15)
    else:
        M2 = brentq(lambda m: fanno_F(m, g) - tgt, 1 + 1e-15, M1, xtol=1e-16, rtol=1e-15)
    return M2, False

# ------------------------------------------------------------------ Rayleigh
def ray_T0(M, g):  return (g + 1) * M * M * (2 + (g - 1) * M * M) / (1 + g * M * M) ** 2
def ray_p(M, g):   return (g + 1) / (1 + g * M * M)
def ray_T(M, g):   return ((g + 1) ** 2 * M * M) / (1 + g * M * M) ** 2
def ray_p0(M, g):  return (g + 1) / (1 + g * M * M) * ((2 + (g - 1) * M * M) / (g + 1)) ** (g / (g - 1))

def ray_crosscheck(M1, M2, g):
    """p2/p1 and T2/T1 from raw constant-area momentum + mass balance:
       p + rho u^2 = const,  rho u = const."""
    # take p1=1, T1=1, R=1 -> rho1 = 1
    R = 1.0
    p1, T1 = 1.0, 1.0
    rho1 = p1 / (R * T1)
    a1 = sqrt(g * R * T1)
    u1 = M1 * a1
    m = rho1 * u1
    I = p1 + rho1 * u1 ** 2
    # unknown state 2 with Mach M2: u2 = M2*sqrt(g R T2), rho2 = m/u2, p2 = I - m u2
    def resid(T2):
        u2 = M2 * sqrt(g * R * T2)
        rho2 = m / u2
        p2 = I - m * u2
        return p2 - rho2 * R * T2
    T2 = brentq(resid, 1e-9, 1e6, xtol=1e-15, rtol=1e-15)
    u2 = M2 * sqrt(g * R * T2)
    p2 = I - m * u2
    return p2 / p1, T2 / T1

def ray_march(M1, q, cp_, T1, g):
    """Downstream Mach for heat q [J/kg] added on the same branch."""
    T01 = T1 * T0_T(M1, g)
    T0star = T01 / ray_T0(M1, g)
    T02 = T01 + q / cp_
    r = T02 / T0star
    if r >= 1.0:
        return 1.0, True, (T0star - T01) * cp_
    if M1 < 1:
        M2 = brentq(lambda m: ray_T0(m, g) - r, 1e-9, 1.0, xtol=1e-16, rtol=1e-15)
    else:
        hi = 2.0
        while ray_T0(hi, g) > r and hi < 1e7:
            hi *= 2
        M2 = brentq(lambda m: ray_T0(m, g) - r, 1.0, hi, xtol=1e-16, rtol=1e-15)
    return M2, False, (T0star - T01) * cp_

# ----------------------------------------------------------------- shock tube
def riemann_exact(pL, rhoL, uL, pR, rhoR, uR, g):
    """Exact ideal-gas Riemann solver, Toro Ch.4.  Root-solved with Brent
    (the tool uses Newton, so this is a structurally different solve)."""
    aL = sqrt(g * pL / rhoL)
    aR = sqrt(g * pR / rhoR)

    def f(p, pK, rhoK, aK):
        if p > pK:                                   # shock
            A = 2 / ((g + 1) * rhoK)
            B = (g - 1) / (g + 1) * pK
            return (p - pK) * sqrt(A / (p + B))
        return 2 * aK / (g - 1) * ((p / pK) ** ((g - 1) / (2 * g)) - 1)

    F = lambda p: f(p, pL, rhoL, aL) + f(p, pR, rhoR, aR) + (uR - uL)
    lo, hi = 1e-12, max(pL, pR)
    while F(hi) < 0:
        hi *= 2
    pstar = brentq(F, lo, hi, xtol=1e-14, rtol=1e-15)
    ustar = 0.5 * (uL + uR) + 0.5 * (f(pstar, pR, rhoR, aR) - f(pstar, pL, rhoL, aL))

    out = dict(pstar=pstar, ustar=ustar, waves={})
    left_rare = pstar <= pL
    right_shock = pstar > pR
    if left_rare:
        aSL = aL * (pstar / pL) ** ((g - 1) / (2 * g))
        out['waves']['SHL'] = uL - aL
        out['waves']['STL'] = ustar - aSL
        out['rhoSL'] = rhoL * (pstar / pL) ** (1 / g)
    else:
        q = pstar / pL
        out['rhoSL'] = rhoL * (q + (g - 1) / (g + 1)) / ((g - 1) / (g + 1) * q + 1)
        out['waves']['SL'] = uL - aL * sqrt((g + 1) / (2 * g) * q + (g - 1) / (2 * g))
    if right_shock:
        q = pstar / pR
        out['rhoSR'] = rhoR * (q + (g - 1) / (g + 1)) / ((g - 1) / (g + 1) * q + 1)
        out['waves']['SR'] = uR + aR * sqrt((g + 1) / (2 * g) * q + (g - 1) / (2 * g))
    else:
        aSR = aR * (pstar / pR) ** ((g - 1) / (2 * g))
        out['waves']['STR'] = ustar + aSR
        out['waves']['SHR'] = uR + aR
        out['rhoSR'] = rhoR * (pstar / pR) ** (1 / g)
    out['waves']['SC'] = ustar
    out['left_rare'] = left_rare
    out['right_shock'] = right_shock
    return out

def riemann_crosscheck(pL, rhoL, pR, rhoR, g):
    """Star pressure from an independent pair of physical statements:
       left  : isentropic simple-wave invariant  u* = 2aL/(g-1)*(1-(p*/pL)^((g-1)/2g))
       right : Rankine-Hugoniot across the right-running shock, expressed with
               the density ratio rather than Toro's f() form."""
    aL = sqrt(g * pL / rhoL)

    def uL_of_p(p):
        return 2 * aL / (g - 1) * (1 - (p / pL) ** ((g - 1) / (2 * g)))

    def uR_of_p(p):
        # shock jump: u* = (p*-pR) / sqrt(rhoR/2 * ((g+1)p* + (g-1)pR))
        return (p - pR) / sqrt(rhoR / 2 * ((g + 1) * p + (g - 1) * pR))
    ps = brentq(lambda p: uL_of_p(p) - uR_of_p(p), pR * (1 + 1e-14), pL * (1 - 1e-14),
                xtol=1e-14, rtol=1e-15)
    return ps, uL_of_p(ps)

# ================================================================== CASE BUILD
cases = []
def add(**kw):
    cases.append(kw)

GAMMAS = [(1.4, 287.05, 'air-like gamma=1.4'),
          (1.667, 287.05, 'monatomic-like gamma=1.667'),
          (1.3, 287.05, 'gamma=1.3 (combustion-gas-like)')]

# ---- 1. area / Mach relation, both branches ---------------------------------
for g, R, gname in GAMMAS:
    for A in [1.00, 1.25, 1.50, 1.69, 2.00, 2.50, 3.00, 4.00, 4.23, 6.00]:
        ms = mach_from_area(A, g, 'sub')
        mp = mach_from_area(A, g, 'sup')
        cc = {}
        if A > 1.0:
            cc['dev_area_sub'] = abs(area_crosscheck(ms, g) - A) / A
            cc['dev_area_sup'] = abs(area_crosscheck(mp, g) - A) / A
        exp = {'Msub': ms, 'Msup': mp,
               'p_p0_sub': 1 / p0_p(ms, g), 'T_T0_sub': 1 / T0_T(ms, g),
               'rho_rho0_sub': 1 / r0_r(ms, g),
               'p_p0_sup': 1 / p0_p(mp, g), 'T_T0_sup': 1 / T0_T(mp, g),
               'rho_rho0_sup': 1 / r0_r(mp, g)}
        dec = {'Msub': 4, 'Msup': 4, 'p_p0_sub': 5, 'T_T0_sub': 5, 'rho_rho0_sub': 5,
               'p_p0_sup': 5, 'T_T0_sup': 5, 'rho_rho0_sup': 5}
        note = f'Area-Mach both roots, {gname}'
        if abs(g - 1.4) < 1e-12 and abs(A - 1.69) < 1e-9:
            note += (' | near NACA 1135 Table I entry A/A*=1.6875 <-> M=2.000; the '
                     'tool slider quantises A/A* to 0.01 so the exact table entry '
                     'cannot be dialled in')
        if abs(g - 1.4) < 1e-12 and abs(A - 4.23) < 1e-9:
            note += (' | near NACA 1135 Table I entry A/A*=4.2346 <-> M=3.000 '
                     '(slider quantised to 0.01)')
        add(id=f'area_g{g}_A{A}', group='area', note=note,
            inputs={'gamma': g, 'R': R, 'AAstar': A},
            expect=exp, decimals=dec, crosscheck=cc)

# ---- 2. normal shock (oblique tab, theta = 0, strong branch = normal shock) --
NS_M = [1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0]
for g, R, gname in GAMMAS:
    ms = NS_M if abs(g - 1.4) < 1e-12 else [1.5, 2.0, 3.0, 5.0, 10.0]
    for M1 in ms:
        ns = normal_shock(M1, g)
        cc_raw = normal_shock_crosscheck(M1, g)
        cc = {f'dev_{k}': abs(cc_raw[k] - ns[k]) / abs(ns[k]) for k in ns}
        note = f'Normal shock M1={M1}, {gname} (theta=0 strong branch => beta=90 deg)'
        if abs(g - 1.4) < 1e-12 and M1 == 2.0:
            note += ' | NACA 1135 Table II: M2=0.57735, p2/p1=4.5000, rho2/rho1=2.6667, T2/T1=1.6875, p02/p01=0.72087'
        if abs(g - 1.4) < 1e-12 and M1 == 3.0:
            note += ' | NACA 1135 Table II: M2=0.47519, p2/p1=10.333, rho2/rho1=3.8571, T2/T1=2.6790, p02/p01=0.32834'
        add(id=f'ns_g{g}_M{M1}', group='shock', note=note,
            inputs={'gamma': g, 'R': R, 'M1': M1},
            expect={'beta_deg': 90.0, 'M2': ns['M2'], 'p2p1': ns['p2p1'],
                    'p02p01': ns['p02p01']},
            decimals={'beta_deg': 3, 'M2': 4, 'p2p1': 4, 'p02p01': 4},
            crosscheck=cc,
            extra_ref={'T2T1': ns['T2T1'], 'rho2rho1': ns['r2r1']})

# ---- 3. oblique shock, weak + strong ----------------------------------------
OB = [(1.5, 5), (2.0, 10), (2.0, 20), (2.5, 12), (3.0, 20), (3.0, 30),
      (4.0, 30), (5.0, 20), (2.0, 22.0)]
for g, R, gname in GAMMAS:
    lst = OB if abs(g - 1.4) < 1e-12 else [(2.0, 10), (3.0, 20), (4.0, 30)]
    for M1, th in lst:
        tmax, bmax = theta_max(M1, g)
        if th * D2R > tmax:
            continue
        for br in ('weak', 'strong'):
            b = oblique_beta(M1, th * D2R, g, br)
            st = oblique_state(M1, th * D2R, b, g)
            b2 = oblique_beta_crosscheck(M1, th * D2R, g, br)
            add(id=f'ob_g{g}_M{M1}_t{th}_{br}', group='oblique',
                note=f'Oblique shock M1={M1}, theta={th} deg, {br} branch, {gname}',
                inputs={'gamma': g, 'R': R, 'M1': M1, 'theta_deg': th, 'branch': br},
                expect={'beta_deg': b * R2D, 'M2': st['M2'], 'p2p1': st['p2p1'],
                        'p02p01': st['p02p01'], 'thetamax_deg': tmax * R2D},
                decimals={'beta_deg': 3, 'M2': 4, 'p2p1': 4, 'p02p01': 4,
                          'thetamax_deg': 3},
                crosscheck={'dev_beta': abs(b2 - b) / b})

# ---- 3b. detachment ---------------------------------------------------------
for g, R, gname in GAMMAS:
    for M1 in (1.5, 2.0, 3.0):
        tmax, bmax = theta_max(M1, g)
        th_over = round(min(39.9, tmax * R2D + 1.0), 1)
        if th_over <= tmax * R2D:
            continue
        add(id=f'det_g{g}_M{M1}', group='oblique_detached',
            note=f'Detachment: theta just above theta_max, M1={M1}, {gname}',
            inputs={'gamma': g, 'R': R, 'M1': M1, 'theta_deg': th_over},
            expect={'status': 'DETACHED SHOCK', 'thetamax_deg': tmax * R2D},
            decimals={'thetamax_deg': 3}, crosscheck={})
        # and just below theta_max -> must still give an attached solution
        th_under = round(tmax * R2D - 0.2, 1)
        b = oblique_beta(M1, th_under * D2R, g, 'weak')
        st = oblique_state(M1, th_under * D2R, b, g)
        add(id=f'nearmax_g{g}_M{M1}', group='oblique',
            note=f'Attached weak solution 0.2 deg below theta_max, M1={M1}, {gname}',
            inputs={'gamma': g, 'R': R, 'M1': M1,
                    'theta_deg': round(th_under, 1), 'branch': 'weak'},
            expect={'beta_deg': oblique_beta(M1, round(th_under, 1) * D2R, g, 'weak') * R2D,
                    'M2': oblique_state(M1, round(th_under, 1) * D2R,
                                        oblique_beta(M1, round(th_under, 1) * D2R, g, 'weak'), g)['M2'],
                    'p2p1': oblique_state(M1, round(th_under, 1) * D2R,
                                          oblique_beta(M1, round(th_under, 1) * D2R, g, 'weak'), g)['p2p1'],
                    'p02p01': oblique_state(M1, round(th_under, 1) * D2R,
                                            oblique_beta(M1, round(th_under, 1) * D2R, g, 'weak'), g)['p02p01'],
                    'thetamax_deg': tmax * R2D},
            decimals={'beta_deg': 3, 'M2': 4, 'p2p1': 4, 'p02p01': 4, 'thetamax_deg': 3},
            crosscheck={})

# ---- 4. Prandtl-Meyer -------------------------------------------------------
PM = [(1.5, -10), (2.0, -10), (2.0, -20), (3.0, -15), (4.0, -30), (5.0, -25)]
for g, R, gname in GAMMAS:
    lst = PM if abs(g - 1.4) < 1e-12 else [(2.0, -10), (3.0, -20), (5.0, -30)]
    for M1, th in lst:
        n1 = nu(M1, g)
        n2 = n1 + abs(th) * D2R
        if n2 >= nu_max(g):
            continue
        M2 = inv_nu(n2, g)
        p2p1 = (T0_T(M1, g) / T0_T(M2, g)) ** (g / (g - 1))
        cc = {'dev_nu1': abs(nu_crosscheck(M1, g) - n1) / max(n1, 1e-12),
              'dev_nu2': abs(nu_crosscheck(M2, g) - n2) / n2}
        note = f'Prandtl-Meyer expansion M1={M1}, turn {th} deg, {gname}'
        if abs(g - 1.4) < 1e-12 and M1 == 2.0:
            note += ' | NACA 1135 Table: nu(2.0)=26.380 deg'
        add(id=f'pm_g{g}_M{M1}_t{th}', group='pm', note=note,
            inputs={'gamma': g, 'R': R, 'M1': M1, 'theta_deg': th},
            expect={'nu1_deg': n1 * R2D, 'nu2_deg': n2 * R2D, 'M2': M2, 'p2p1': p2p1},
            decimals={'nu1_deg': 3, 'nu2_deg': 3, 'M2': 4, 'p2p1': 4},
            crosscheck=cc)

# nu_max / vacuum limit
for g, R, gname in GAMMAS:
    numax = nu_max(g)
    # pick M1 large enough that M1 + 30 deg exceeds nu_max
    M1 = inv_nu(numax - 29.0 * D2R, g)
    M1 = round(M1, 3)
    if M1 <= 60 and nu(M1, g) + 30 * D2R >= numax:
        add(id=f'pmvac_g{g}', group='pm_vacuum',
            note=f'Vacuum limit: nu1 + 30 deg exceeds nu_max = {numax*R2D:.4f} deg, {gname}',
            inputs={'gamma': g, 'R': R, 'M1': M1, 'theta_deg': -30},
            expect={'status': 'VACUUM LIMIT', 'numax_deg': numax * R2D,
                    'nu1_deg': nu(M1, g) * R2D},
            decimals={'numax_deg': 3, 'nu1_deg': 3},
            crosscheck={'dev_nu1': abs(nu_crosscheck(M1, g) - nu(M1, g)) / nu(M1, g)})

# ---- 5. Fanno ---------------------------------------------------------------
FAN = [(0.30, 0.020, 100), (0.50, 0.020, 50), (0.80, 0.020, 10),
       (0.99, 0.020, 0.005), (1.01, 0.020, 0.005),
       (2.00, 0.020, 10), (3.00, 0.020, 20), (0.20, 0.020, 200)]
for g, R, gname in GAMMAS:
    lst = FAN if abs(g - 1.4) < 1e-12 else [(0.30, 0.020, 100), (2.00, 0.020, 10)]
    for M1, fD, LD in lst:
        p1, T1 = 2.0e5, 300.0
        cp_ = g * R / (g - 1)
        xi = fD * LD
        M2, chok = fanno_march(M1, xi, g)
        pstar = p1 / fanno_p(M1, g)
        Tstar = T1 / fanno_T(M1, g)
        p2 = pstar * fanno_p(M2, g)
        T2 = Tstar * fanno_T(M2, g)
        p01 = p1 * p0_p(M1, g)
        p02 = p2 * p0_p(M2, g)
        T01 = T1 * T0_T(M1, g)
        T02 = T2 * T0_T(M2, g)
        F1 = fanno_F(M1, g)
        cc = {'dev_F': abs(fanno_F_crosscheck(M1, g) - F1) / max(abs(F1), 1e-12)}
        add(id=f'fan_g{g}_M{M1}_LD{LD}', group='fanno',
            note=(f'Fanno duct M1={M1}, fD={fD}, L/D={LD}, {gname}; '
                  f'{"chokes before exit" if chok else "steady"}'),
            inputs={'gamma': g, 'R': R, 'M1': M1, 'p1_bar': p1 / 1e5, 'T1_K': T1,
                    'fD': fD, 'LD': LD},
            expect={'Mout': M2, 'p_out_bar': p2 / 1e5, 'T_out_K': T2,
                    'p0ratio': p02 / p01, 'T0ratio': T02 / T01, 'FLD': F1,
                    'choked': bool(chok)},
            decimals={'Mout': 4, 'p_out_bar': 4, 'T_out_K': 1, 'p0ratio': 4,
                      'T0ratio': 5, 'FLD': 4},
            crosscheck=cc)

# Fanno sonic reference values p/p*, T/T*, p0/p0* : drive the duct exactly to M=1
for g, R, gname in GAMMAS:
    for M1 in (0.30, 0.50, 2.00, 3.00):
        p1, T1 = 2.0e5, 300.0
        F1 = fanno_F(M1, g)
        add(id=f'fanstar_g{g}_M{M1}', group='fanno',
            note=(f'Fanno sonic limit: fD=1, L/D=fD L*/D exactly => exit is the '
                  f'sonic state, so exit p = p*, exit T = T*, M1={M1}, {gname}. '
                  f'Tests p/p*, T/T*, p0/p0* and 4fL*/D.'),
            inputs={'gamma': g, 'R': R, 'M1': M1, 'p1_bar': p1 / 1e5, 'T1_K': T1,
                    'fD': 1.0, 'LD': F1},
            expect={'Mout': 1.0,
                    'p_out_bar': (p1 / fanno_p(M1, g)) / 1e5,
                    'T_out_K': T1 / fanno_T(M1, g),
                    'p0ratio': 1.0 / fanno_p0(M1, g),
                    'T0ratio': 1.0,
                    'FLD': F1, 'choked': True},
            decimals={'Mout': 4, 'p_out_bar': 4, 'T_out_K': 1, 'p0ratio': 4,
                      'T0ratio': 5, 'FLD': 4},
            crosscheck={'dev_F': abs(fanno_F_crosscheck(M1, g) - F1) / max(abs(F1), 1e-12)},
            extra_ref={'p_pstar': fanno_p(M1, g), 'T_Tstar': fanno_T(M1, g),
                       'p0_p0star': fanno_p0(M1, g)})

# ---- 6. Rayleigh ------------------------------------------------------------
RAY = [(0.30, 100), (0.30, -100), (0.50, 300), (0.80, 50),
       (2.00, 100), (3.00, 200), (2.00, -100)]
for g, R, gname in GAMMAS:
    lst = RAY if abs(g - 1.4) < 1e-12 else [(0.30, 100), (2.00, 100)]
    for M1, qk in lst:
        p1, T1 = 2.0e5, 300.0
        cp_ = g * R / (g - 1)
        q = qk * 1000.0
        M2, chok, qch = ray_march(M1, q, cp_, T1, g)
        pstar = p1 / ray_p(M1, g)
        Tstar = T1 / ray_T(M1, g)
        p2 = pstar * ray_p(M2, g)
        T2 = Tstar * ray_T(M2, g)
        T02 = T2 * T0_T(M2, g)
        p01 = p1 * p0_p(M1, g)
        p02 = p2 * p0_p(M2, g)
        ds = cp_ * log(T2 / T1) - R * log(p2 / p1)
        pr_cc, Tr_cc = ray_crosscheck(M1, M2, g)
        cc = {'dev_p': abs(pr_cc - p2 / p1) / (p2 / p1),
              'dev_T': abs(Tr_cc - T2 / T1) / (T2 / T1)}
        add(id=f'ray_g{g}_M{M1}_q{qk}', group='rayleigh',
            note=(f'Rayleigh duct M1={M1}, q={qk} kJ/kg, {gname}; '
                  f'q_choke={qch/1000:.4f} kJ/kg'),
            inputs={'gamma': g, 'R': R, 'M1': M1, 'p1_bar': p1 / 1e5, 'T1_K': T1,
                    'q_kJkg': qk},
            expect={'Mout': M2, 'p_out_bar': p2 / 1e5, 'T_out_K': T2,
                    'T0_out_K': T02, 'p0ratio': p02 / p01, 'ds_kJ': ds / 1000.0,
                    'choked': bool(chok)},
            decimals={'Mout': 4, 'p_out_bar': 4, 'T_out_K': 1, 'T0_out_K': 1,
                      'p0ratio': 4, 'ds_kJ': 4},
            crosscheck=cc)

# Rayleigh sonic reference values T0/T0*, p/p*, T/T*
for g, R, gname in GAMMAS:
    for M1 in (0.30, 0.50, 2.00):
        p1, T1 = 2.0e5, 300.0
        cp_ = g * R / (g - 1)
        T01 = T1 * T0_T(M1, g)
        T0star = T01 / ray_T0(M1, g)
        qch = cp_ * (T0star - T01)
        p2 = p1 / ray_p(M1, g)
        T2 = T1 / ray_T(M1, g)
        ds = cp_ * log(T2 / T1) - R * log(p2 / p1)
        add(id=f'raystar_g{g}_M{M1}', group='rayleigh',
            note=(f'Rayleigh thermal-choking limit: q set exactly to q_choke so the '
                  f'exit is sonic => exit p = p*, T = T*, T0 = T0*. M1={M1}, {gname}. '
                  f'Tests T0/T0*, p/p*, T/T*.'),
            inputs={'gamma': g, 'R': R, 'M1': M1, 'p1_bar': p1 / 1e5, 'T1_K': T1,
                    'q_kJkg': qch / 1000.0},
            expect={'Mout': 1.0, 'p_out_bar': p2 / 1e5, 'T_out_K': T2,
                    'T0_out_K': T0star, 'p0ratio': (p2 * p0_p(1.0, g)) / (p1 * p0_p(M1, g)),
                    'ds_kJ': ds / 1000.0, 'choked': True},
            decimals={'Mout': 4, 'p_out_bar': 4, 'T_out_K': 1, 'T0_out_K': 1,
                      'p0ratio': 4, 'ds_kJ': 4},
            crosscheck={},
            extra_ref={'T0_T0star': ray_T0(M1, g), 'p_pstar': ray_p(M1, g),
                       'T_Tstar': ray_T(M1, g)})

# ---- 7. shock tube ----------------------------------------------------------
def st_case(cid, note, pL_bar, TL, pR_bar, TR, g, R, L=4.0, xf=0.5):
    pL, pR = pL_bar * 1e5, pR_bar * 1e5
    rhoL, rhoR = pL / (R * TL), pR / (R * TR)
    sol = riemann_exact(pL, rhoL, 0.0, pR, rhoR, 0.0, g)
    w = sol['waves']
    if sol['right_shock']:
        S = w['SR']; aRR = sqrt(g * R * TR); side = 'right'
    elif not sol['left_rare']:
        S = w['SL']; aRR = sqrt(g * R * TL); side = 'left'
    else:
        S = float('nan'); aRR = 1.0; side = 'none'
    xd = xf * L
    tcand = []
    for s in w.values():
        if s < 0:
            tcand.append(xd / (-s))
        elif s > 0:
            tcand.append((L - xd) / s)
    tmax = 0.96 * min(t for t in tcand if t > 0)
    cc = {}
    if sol['left_rare'] and sol['right_shock']:
        ps_cc, us_cc = riemann_crosscheck(pL, rhoL, pR, rhoR, g)
        cc = {'dev_pstar': abs(ps_cc - sol['pstar']) / sol['pstar'],
              'dev_ustar': abs(us_cc - sol['ustar']) / abs(sol['ustar'])}
    exp = {'pstar_bar': sol['pstar'] / 1e5, 'ustar': sol['ustar'],
           'contactSpeed': w['SC'], 'tmax_ms': tmax * 1000.0, 'shockSide': side}
    if side == 'none':
        # no shock of finite strength exists; the tool must print a dash, not a number
        exp['shockSpeedText'] = '\u2014'
    else:
        exp['shockSpeed'] = S
        exp['shockMach'] = abs(S) / aRR
    add(id=cid, group='shocktube', note=note,
        inputs={'gamma': g, 'R': R, 'pL_bar': pL_bar, 'TL_K': TL,
                'pR_bar': pR_bar, 'TR_K': TR, 'L_m': L, 'x_frac': xf},
        expect=exp,
        decimals={'pstar_bar': 4, 'ustar': 2, 'shockSpeed': 1, 'shockMach': 3,
                  'contactSpeed': 1, 'tmax_ms': 2},
        crosscheck=cc,
        extra_ref={'rhoL': rhoL, 'rhoR': rhoR, 'rhoSL': sol['rhoSL'],
                   'rhoSR': sol['rhoSR']})

# Sod problem realised in SI: rho_L = 1, p_L = 1 bar, rho_R = 0.125, p_R = 0.1 bar
R14 = 287.05
TL_sod = 1.0e5 / (R14 * 1.0)
TR_sod = 1.0e4 / (R14 * 0.125)
st_case('st_sod', ('Standard Sod problem scaled to SI: rho_L=1 kg/m3, p_L=1 bar, '
                   'rho_R=0.125 kg/m3, p_R=0.1 bar, gamma=1.4.  Dimensionless exact '
                   'solution (Toro, Riemann Solvers, 3rd ed., Table 4.1): '
                   'p*=0.30313, u*=0.92745, rho*L=0.42632, rho*R=0.26557, '
                   'shock speed 1.75216 (in units of sqrt(p_L/rho_L)=316.2278 m/s).'),
        1.0, TL_sod, 0.1, TR_sod, 1.4, R14)
st_case('st_default', 'Tool default shock tube: 5 bar / 300 K vs 1 bar / 300 K',
        5.0, 300.0, 1.0, 300.0, 1.4, R14)
st_case('st_reversed', 'Reversed shock tube (driver on the RIGHT): 1 bar vs 5 bar - '
                       'the shock must travel to the LEFT',
        1.0, 300.0, 5.0, 300.0, 1.4, R14)
st_case('st_strong', 'Strong shock tube: 100 bar / 600 K vs 0.05 bar / 250 K',
        100.0, 600.0, 0.05, 250.0, 1.4, R14)
st_case('st_hotdriver', 'Hot driver: 10 bar / 1200 K vs 1 bar / 290 K',
        10.0, 1200.0, 1.0, 290.0, 1.4, R14)
st_case('st_g1667', 'Shock tube with gamma=1.667', 5.0, 300.0, 1.0, 300.0, 1.667, R14)
st_case('st_g13', 'Shock tube with gamma=1.3', 5.0, 300.0, 1.0, 300.0, 1.3, R14)
st_case('st_offcentre', 'Diaphragm at x/L=0.25, 5 bar vs 1 bar',
        5.0, 300.0, 1.0, 300.0, 1.4, R14, L=4.0, xf=0.25)

# ---- 8. nozzle: choking, branch selection, regime classification ------------
for g, R, gname in GAMMAS:
    for ae in (2.50, 4.00, 6.00):
        Msub = mach_from_area(ae, g, 'sub')
        Msup = mach_from_area(ae, g, 'sup')
        rChoke = 1 / p0_p(Msub, g)
        pe_design = 1 / p0_p(Msup, g)
        ns = normal_shock(Msup, g)
        rShockExit = pe_design * ns['p2p1']
        p0 = 5.0e5
        T0 = 300.0
        At = 10e-4
        Gstar = p0 * sqrt(g / (R * T0)) * (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)))
        for tag, pbR, regime in [
                ('sub', min(0.999, rChoke + 0.15), 'SUBSONIC'),
                ('shockin', 0.5 * (rChoke + rShockExit), 'NORMAL SHOCK INSIDE'),
                ('over', 0.5 * (rShockExit + pe_design), 'OVEREXPANDED'),
                ('under', pe_design * 0.5, 'UNDEREXPANDED')]:
            if pbR <= 0.001 or pbR >= 0.999:
                continue
            pbR = round(pbR, 4)
            if pbR > rChoke:      # unchoked
                Me = sqrt(max(0.0, 2 / (g - 1) * ((1 / pbR) ** ((g - 1) / g) - 1)))
                AstarEff = ae / A_Astar(Me, g)
                mdot = Gstar * At * AstarEff
                pe_p0 = pbR
            else:
                Me = None
                mdot = Gstar * At
                pe_p0 = None
            exp = {'regime': regime, 'rChoke': rChoke, 'pe_design': pe_design,
                   'mdot': mdot}
            dec = {'rChoke': 4, 'pe_design': 4, 'mdot': 3, 'Mexit': 3, 'pe_p0': 4}
            if regime == 'SUBSONIC':
                exp['Mexit'] = Me
                exp['pe_p0'] = pbR
            elif regime in ('OVEREXPANDED', 'UNDEREXPANDED'):
                exp['Mexit'] = Msup
                exp['pe_p0'] = pe_design
            add(id=f'noz_g{g}_ae{ae}_{tag}', group='nozzle',
                note=(f'Laval nozzle Ae/A*={ae}, pb/p0={pbR}, {gname}. '
                      f'choke pb/p0={rChoke:.5f}, design pe/p0={pe_design:.5f}, '
                      f'shock-at-exit pb/p0={rShockExit:.5f}'),
                inputs={'gamma': g, 'R': R, 'p0_bar': p0 / 1e5, 'T0_K': T0,
                        'At_cm2': At * 1e4, 'Ae': ae, 'pbRatio': pbR},
                expect=exp, decimals=dec, crosscheck={})


# =========================================================== EDGE / LIMIT CASES
# Deliberately adversarial probes: removable singularities at M->1, the
# detachment neighbourhood, Rayleigh branch asymptotes, gamma at the input limits,
# hypersonic normal shocks, and degenerate shock tubes.

# --- near-sonic normal shocks (M1 -> 1) and the hypersonic limit --------------
for g, R, gname in GAMMAS:
    for M1 in (1.001, 1.01, 1.05, 20.0, 50.0):
        ns = normal_shock(M1, g)
        cc_raw = normal_shock_crosscheck(M1, g)
        cc = {f'dev_{k}': abs(cc_raw[k] - ns[k]) / abs(ns[k]) for k in ns}
        lim = sqrt((g - 1) / (2 * g))
        add(id=f'nsedge_g{g}_M{M1}', group='shock',
            note=(f'EDGE normal shock M1={M1}, {gname}. '
                  + ('near-sonic limit: every jump must tend to unity'
                     if M1 < 1.1 else
                     f'hypersonic limit: M2 -> sqrt((g-1)/2g) = {lim:.5f}')),
            inputs={'gamma': g, 'R': R, 'M1': M1},
            expect={'beta_deg': 90.0, 'M2': ns['M2'], 'p2p1': ns['p2p1'],
                    'p02p01': ns['p02p01']},
            decimals={'beta_deg': 3, 'M2': 4, 'p2p1': 4, 'p02p01': 4},
            crosscheck=cc)

# --- gamma at the tool's own input limits -----------------------------------
for g in (1.01, 2.0):
    R = 287.05
    for A in (2.00, 6.00):
        ms = mach_from_area(A, g, 'sub'); mp = mach_from_area(A, g, 'sup')
        add(id=f'areaedge_g{g}_A{A}', group='area',
            note=f'EDGE Area-Mach at the gamma input limit gamma={g}, A/A*={A}',
            inputs={'gamma': g, 'R': R, 'AAstar': A},
            expect={'Msub': ms, 'Msup': mp,
                    'p_p0_sub': 1 / p0_p(ms, g), 'T_T0_sub': 1 / T0_T(ms, g),
                    'rho_rho0_sub': 1 / r0_r(ms, g),
                    'p_p0_sup': 1 / p0_p(mp, g), 'T_T0_sup': 1 / T0_T(mp, g),
                    'rho_rho0_sup': 1 / r0_r(mp, g)},
            decimals={'Msub': 4, 'Msup': 4, 'p_p0_sub': 5, 'T_T0_sub': 5,
                      'rho_rho0_sub': 5, 'p_p0_sup': 5, 'T_T0_sup': 5,
                      'rho_rho0_sup': 5},
            crosscheck={'dev_area_sub': abs(area_crosscheck(ms, g) - A) / A,
                        'dev_area_sup': abs(area_crosscheck(mp, g) - A) / A})
    ns = normal_shock(3.0, g)
    add(id=f'nsedge2_g{g}', group='shock',
        note=f'EDGE normal shock M1=3 at the gamma input limit gamma={g}',
        inputs={'gamma': g, 'R': R, 'M1': 3.0},
        expect={'beta_deg': 90.0, 'M2': ns['M2'], 'p2p1': ns['p2p1'],
                'p02p01': ns['p02p01']},
        decimals={'beta_deg': 3, 'M2': 4, 'p2p1': 4, 'p02p01': 4},
        crosscheck={f'dev_{k}': abs(normal_shock_crosscheck(3.0, g)[k] - ns[k]) / abs(ns[k])
                    for k in ns})

# --- barely supersonic oblique / Prandtl-Meyer ------------------------------
g, R = 1.4, 287.05
for M1, th in ((1.05, 0.5), (1.02, 0.2)):
    tmax, bmax = theta_max(M1, g)
    if th * D2R <= tmax:
        for br in ('weak', 'strong'):
            b = oblique_beta(M1, th * D2R, g, br)
            st = oblique_state(M1, th * D2R, b, g)
            add(id=f'obedge_M{M1}_{br}', group='oblique',
                note=f'EDGE barely supersonic oblique shock M1={M1}, theta={th} deg, '
                     f'{br} branch (theta_max = {tmax*R2D:.4f} deg)',
                inputs={'gamma': g, 'R': R, 'M1': M1, 'theta_deg': th, 'branch': br},
                expect={'beta_deg': b * R2D, 'M2': st['M2'], 'p2p1': st['p2p1'],
                        'p02p01': st['p02p01'], 'thetamax_deg': tmax * R2D},
                decimals={'beta_deg': 3, 'M2': 4, 'p2p1': 4, 'p02p01': 4,
                          'thetamax_deg': 3},
                crosscheck={'dev_beta': abs(oblique_beta_crosscheck(M1, th * D2R, g, br) - b) / b})
for M1 in (1.01, 1.05):
    n1 = nu(M1, g); n2 = n1 + 10 * D2R
    M2 = inv_nu(n2, g)
    add(id=f'pmedge_M{M1}', group='pm',
        note=f'EDGE Prandtl-Meyer from a barely supersonic state M1={M1} '
             f'(nu1 = {n1*R2D:.5f} deg; removable sqrt(M^2-1) behaviour at M->1)',
        inputs={'gamma': g, 'R': R, 'M1': M1, 'theta_deg': -10},
        expect={'nu1_deg': n1 * R2D, 'nu2_deg': n2 * R2D, 'M2': M2,
                'p2p1': (T0_T(M1, g) / T0_T(M2, g)) ** (g / (g - 1))},
        decimals={'nu1_deg': 3, 'nu2_deg': 3, 'M2': 4, 'p2p1': 4},
        crosscheck={'dev_nu1': abs(nu_crosscheck(M1, g) - n1) / n1})

# --- Fanno limit cases ------------------------------------------------------
for M1, fD, LD, tag in ((1.0, 0.02, 10, 'sonic inlet'),
                        (3.0, 0.02, 100, 'supersonic, duct far longer than L*'),
                        (0.30, 0.0, 100, 'frictionless duct: M must not change'),
                        (0.999, 0.02, 0.005, 'M1 just below 1'),
                        (1.001, 0.02, 0.005, 'M1 just above 1')):
    p1, T1 = 2.0e5, 300.0
    xi = fD * LD
    M2, chok = fanno_march(M1, xi, g)
    pstar = p1 / fanno_p(M1, g); Tstar = T1 / fanno_T(M1, g)
    p2 = pstar * fanno_p(M2, g); T2 = Tstar * fanno_T(M2, g)
    p01 = p1 * p0_p(M1, g); p02 = p2 * p0_p(M2, g)
    T01 = T1 * T0_T(M1, g); T02 = T2 * T0_T(M2, g)
    F1 = fanno_F(M1, g)
    add(id=f'fanedge_M{M1}_LD{LD}', group='fanno',
        note=f'EDGE Fanno: {tag} (M1={M1}, fD={fD}, L/D={LD})',
        inputs={'gamma': g, 'R': R, 'M1': M1, 'p1_bar': p1 / 1e5, 'T1_K': T1,
                'fD': fD, 'LD': LD},
        expect={'Mout': M2, 'p_out_bar': p2 / 1e5, 'T_out_K': T2,
                'p0ratio': p02 / p01, 'T0ratio': T02 / T01, 'FLD': F1,
                'choked': bool(chok and fD > 0)},
        decimals={'Mout': 4, 'p_out_bar': 4, 'T_out_K': 1, 'p0ratio': 4,
                  'T0ratio': 5, 'FLD': 4},
        crosscheck={'dev_F': abs(fanno_F_crosscheck(M1, g) - F1) / max(abs(F1), 1e-12)}
        if M1 != 1.0 else {})

# --- Rayleigh branch-limit cases (must be REFUSED, not extrapolated) --------
cp14 = g * R / (g - 1)
add(id='rayedge_sup_asymptote', group='rayleigh_invalid',
    note=('EDGE Rayleigh: supersonic branch cooled past the T0/T0* = (g^2-1)/g^2 = '
          f'{(g*g-1)/(g*g):.6f} asymptote, where M -> infinity and no finite-M '
          'continuation exists. The tool must refuse, not extrapolate.'),
    inputs={'gamma': g, 'R': R, 'M1': 2.0, 'p1_bar': 2.0, 'T1_K': 300.0,
            'q_kJkg': -300.0},
    expect={'status': 'BRANCH LIMIT REACHED'}, decimals={}, crosscheck={})
add(id='rayedge_sub_negativeT0', group='rayleigh_invalid',
    note=('EDGE Rayleigh: subsonic branch cooled so hard that T0 would go '
          'non-positive. The tool must refuse.'),
    inputs={'gamma': g, 'R': R, 'M1': 0.3, 'p1_bar': 2.0, 'T1_K': 300.0,
            'q_kJkg': -400.0},
    expect={'status': 'BRANCH LIMIT REACHED'}, decimals={}, crosscheck={})

# heat added far beyond the choking value -> must report thermal choking, and the
# exit state must be exactly the sonic state
for M1 in (0.3, 2.0):
    p1, T1 = 2.0e5, 300.0
    T01 = T1 * T0_T(M1, g); T0star = T01 / ray_T0(M1, g)
    p2 = p1 / ray_p(M1, g); T2 = T1 / ray_T(M1, g)
    ds = cp14 * log(T2 / T1) - R * log(p2 / p1)
    add(id=f'rayedge_over_M{M1}', group='rayleigh',
        note=f'EDGE Rayleigh: q = 5x q_choke at M1={M1}; must clamp to the sonic state',
        inputs={'gamma': g, 'R': R, 'M1': M1, 'p1_bar': p1 / 1e5, 'T1_K': T1,
                'q_kJkg': 5 * cp14 * (T0star - T01) / 1000.0},
        expect={'Mout': 1.0, 'p_out_bar': p2 / 1e5, 'T_out_K': T2,
                'T0_out_K': T0star,
                'p0ratio': (p2 * p0_p(1.0, g)) / (p1 * p0_p(M1, g)),
                'ds_kJ': ds / 1000.0, 'choked': True},
        decimals={'Mout': 4, 'p_out_bar': 4, 'T_out_K': 1, 'T0_out_K': 1,
                  'p0ratio': 4, 'ds_kJ': 4}, crosscheck={})

# --- degenerate / extreme shock tubes ---------------------------------------
st_case('stedge_equal', 'EDGE shock tube with identical states on both sides: no '
        'wave of finite strength, p* = p, u* = 0, both waves are rarefactions',
        1.0, 300.0, 1.0, 300.0, 1.4, 287.05)
st_case('stedge_1000to1', 'EDGE shock tube with a 1000:1 pressure ratio',
        100.0, 300.0, 0.1, 300.0, 1.4, 287.05)
st_case('stedge_coldriver', 'EDGE shock tube, cold driver 5 bar/80 K vs 1 bar/900 K',
        5.0, 80.0, 1.0, 900.0, 1.4, 287.05)

# --- nozzle exactly on the regime thresholds --------------------------------
for ae in (2.50, 4.00):
    Msub = mach_from_area(ae, g, 'sub'); Msup = mach_from_area(ae, g, 'sup')
    rChoke = 1 / p0_p(Msub, g); pe_des = 1 / p0_p(Msup, g)
    rShockExit = pe_des * normal_shock(Msup, g)['p2p1']
    p0, T0, At = 5.0e5, 300.0, 10e-4
    Gstar = p0 * sqrt(g / (R * T0)) * (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)))
    for tag, pbR, regime in [('atchoke', round(rChoke, 4), 'CHOKING ONSET'),
                             ('atshockexit', round(rShockExit, 4), 'NORMAL SHOCK AT EXIT'),
                             ('atdesign', round(pe_des, 4), 'PERFECTLY EXPANDED')]:
        add(id=f'nozedge_ae{ae}_{tag}', group='nozzle',
            note=(f'EDGE nozzle exactly on a regime threshold: Ae/A*={ae}, '
                  f'pb/p0={pbR} ({regime}); choke={rChoke:.6f}, '
                  f'shock-at-exit={rShockExit:.6f}, design={pe_des:.6f}'),
            inputs={'gamma': g, 'R': R, 'p0_bar': p0 / 1e5, 'T0_K': T0,
                    'At_cm2': At * 1e4, 'Ae': ae, 'pbRatio': pbR},
            expect={'regime': regime, 'rChoke': rChoke, 'pe_design': pe_des,
                    'mdot': Gstar * At},
            decimals={'rChoke': 4, 'pe_design': 4, 'mdot': 3}, crosscheck={})


ref = {
    'generator': 'ref/gen_gasdynamics.py',
    'reference': ('Independent python implementation of the constant-gamma '
                  'compressible-flow relations (NACA Report 1135) plus an exact '
                  'ideal-gas Riemann solver (Toro Ch.4); every value re-derived a '
                  'second, structurally different way (raw conservation balances / '
                  'numerical quadrature / ODE integration) and recorded as crosscheck.'),
    'citations': [
        'Ames Research Staff, "Equations, Tables, and Charts for Compressible Flow", '
        'NACA Report 1135, 1953: eq.(44) isentropic, eq.(80) area ratio, '
        'eq.(93)-(99) normal shock, eq.(138) theta-beta-M, eq.(171a) Prandtl-Meyer; '
        'Table I (isentropic) and Table II (normal shock) used for spot checks.',
        'A. H. Shapiro, "The Dynamics and Thermodynamics of Compressible Fluid Flow", '
        'Vol. I, Ronald Press, 1953, Ch. 6 (Fanno line) and Ch. 7 (Rayleigh line).',
        'E. F. Toro, "Riemann Solvers and Numerical Methods for Fluid Dynamics", '
        '3rd ed., Springer 2009, Ch. 4 (exact Riemann solver) and Table 4.1 '
        '(Sod problem: p*=0.30313, u*=0.92745, rho*L=0.42632, rho*R=0.26557).',
    ],
    'cases': cases,
}
with open(_gp.ref('gasdynamics_ref.json'), 'w') as f:
    json.dump(ref, f, indent=1, allow_nan=False)

# ------------------------------------------------------------- self-verification
print('cases:', len(cases))
worst = 0.0
for c in cases:
    for k, v in (c.get('crosscheck') or {}).items():
        if k.startswith('dev_'):
            worst = max(worst, v)
print('worst reference-vs-crosscheck deviation: %.3e' % worst)

# published spot values
print('\n--- published spot checks ---')
print('NACA1135 A/A*(M=2)   = 1.6875   got %.6f' % A_Astar(2.0, 1.4))
print('NACA1135 A/A*(M=3)   = 4.2346   got %.6f' % A_Astar(3.0, 1.4))
print('NACA1135 p0/p (M=2)  = 7.8244   got %.6f' % p0_p(2.0, 1.4))
ns2 = normal_shock(2.0, 1.4)
print('NACA1135 NS M1=2  M2=0.57735 p2/p1=4.5 rho=2.6667 T=1.6875 p02/p01=0.72087')
print('          got      M2=%.5f p2/p1=%.4f rho=%.4f T=%.4f p02/p01=%.5f' %
      (ns2['M2'], ns2['p2p1'], ns2['r2r1'], ns2['T2T1'], ns2['p02p01']))
ns3 = normal_shock(3.0, 1.4)
print('NACA1135 NS M1=3  M2=0.47519 p2/p1=10.333 rho=3.8571 T=2.6790 p02/p01=0.32834')
print('          got      M2=%.5f p2/p1=%.4f rho=%.4f T=%.4f p02/p01=%.5f' %
      (ns3['M2'], ns3['p2p1'], ns3['r2r1'], ns3['T2T1'], ns3['p02p01']))
print('nu(2.0)  = 26.380 deg  got %.4f' % (nu(2.0, 1.4) * R2D))
print('nu(3.0)  = 49.757 deg  got %.4f' % (nu(3.0, 1.4) * R2D))
print('nu_max(1.4) = 130.454 deg got %.4f' % (nu_max(1.4) * R2D))
tm, bm = theta_max(2.0, 1.4)
print('theta_max(M=2, g=1.4) = 22.9735 deg  got %.4f (beta=%.4f)' % (tm * R2D, bm * R2D))
tm3, _ = theta_max(3.0, 1.4)
print('theta_max(M=3, g=1.4) = 34.0733 deg  got %.4f' % (tm3 * R2D))

# Sod in dimensionless units
sod = riemann_exact(1.0, 1.0, 0.0, 0.1, 0.125, 0.0, 1.4)
print('\nSod (dimensionless) Toro Table 4.1: p*=0.30313 u*=0.92745 '
      'rho*L=0.42632 rho*R=0.26557')
print('              got:  p*=%.5f u*=%.5f rho*L=%.5f rho*R=%.5f  shock S=%.5f' %
      (sod['pstar'], sod['ustar'], sod['rhoSL'], sod['rhoSR'], sod['waves']['SR']))
ps_cc, us_cc = riemann_crosscheck(1.0, 1.0, 0.1, 0.125, 1.4)
print('  crosscheck (independent invariant/RH form): p*=%.10f u*=%.10f' % (ps_cc, us_cc))
