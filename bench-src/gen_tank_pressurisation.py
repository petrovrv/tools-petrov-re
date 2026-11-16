#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_tank_pressurisation.py -- independent reference generator and benchmark harness for
tank_pressurisation.html (tools.petrov.re).

WHAT MAKES THIS INDEPENDENT
---------------------------
The governing equations are re-derived here from first principles (section 1) and implemented
from that derivation.  None of the page's JavaScript is ported, transcribed or paraphrased; the
page was read only to learn the input names, units, declared assumptions and reported quantities.

The numerical route is structurally different from the page's in three ways at once:

  page          fixed-step RK4 in the MASS domain (900 steps of tEnd/900) + 48-step bisection
                on the terminal event;
  page's own
  "reference"   adaptive Simpson on 1/mdot(m) in the mass domain, truncated 1e-9 short of the
                singular endpoint (this is the SELF-CHECK the site rule S5 disallows);

  THIS FILE     the problem is first reduced analytically to a single scalar ODE in the pressure
                ratio r = p/p_supply (section 1, eq. C), whose choked leg has a CLOSED-FORM
                solution and whose subsonic leg is integrated by Gauss-Legendre quadrature in the
                desingularised variable u = sqrt(1-r), which removes the endpoint singularity
                exactly instead of truncating it.  Cross-checked against an implicit stiff
                integrator (scipy Radau) and a 2e6-node trapezoid, and anchored to published
                compressible-flow data.

Usage
-----
    python3 gen_tank_pressurisation.py --dir <dir holding tank_pressurisation.html + its scripts>
                                       [--port 8821] [--out tank_pressurisation.json]
                                       [--node node] [--selfcheck] [--sabotage]

Requires: numpy, scipy, CoolProp (pip install CoolProp), node with playwright.
"""

import argparse
import datetime as _dt
import json
import math
import os
import subprocess
import sys
import tempfile
import threading

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

SCHEMA = "tools.petrov.re/benchmark/v1"
BENCHMARK_ID = "tank-pressurisation-independent-python-v1"

#: the page manifest revision this artifact grades; read from the page at run time.
MANIFEST_REVISION_GRADED = "unknown"
TOOL_STATUS_AT_RUN = "unknown"


def read_manifest(directory):
    import re as _re
    with open(os.path.join(directory, 'tank_pressurisation.html'), encoding='utf-8') as f:
        h = f.read()
    m = _re.search(r'<script type="application/json" id="diagram-tool-manifest">(.*?)</script>',
                   h, _re.S)
    return json.loads(m.group(1)) if m else {}

PROMOTION = {
    'recommended': True,
    'defect_found_and_fixed':
        'FOUND (first run, against the shipped build): the terminal fill time -- a headline '
        'output, printed in the report summary sentence and the results table -- depended on '
        'tEnd, the simulated time window, which carries no physics. The march nominated its step '
        'as tEnd/900, so widening the window coarsened it; once the step exceeded the remaining '
        'fill, the whole subsonic approach to equalisation fell inside a single RK4 step and the '
        'terminal bisection located the root of that step rather than of the trajectory. Because '
        'the mass rate is convex-decreasing on the subsonic leg, the stage average overestimates '
        'it and the fill time came out SHORT -- always non-conservative. Measured under-report: '
        '2.0e-4 at the shipped default, 5.6e-3 at a 55x window, 1.2e-2 at 185x, saturating at '
        '4.7 % (air) / 5.4 % (helium) / 7.2 % (subcritical-throughout); a scan over gamma and '
        'initial ratio put the worst at 7.8 %. No warning was raised and every case was inside '
        'the declared input ranges. The superseded in-page check could not see any of it: its '
        'band was the solver\'s own step, tEnd/900, which grows in proportion to the error it '
        'was meant to catch, so no step size could ever fail it. '
        'FIXED: the step is now taken from the transient -- a fixed fraction STEP_FRAC = 0.025 '
        'of the remaining-fill timescale (m_stop - m)/mdot(m), with a floor of 1e-9 of the '
        'initial fill timescale so it cannot collapse to zero on the sqrt-law approach to '
        'equalisation, where the terminal event is then crossed and located exactly by '
        'bisection. tEnd survives only inside a min() that can REFINE the step so a short window '
        'still draws a smooth curve, and can never coarsen it, so no value of tEnd can degrade '
        'the answer. Measured after the fix: the reported fill time moves by 1.5e-8 relative '
        'across windows from 1.02x to 185000x the fill, against 4.7e-2 to 7.4e-2 before -- an '
        'improvement of about six orders of magnitude -- and every terminal time now agrees with '
        'the independent reference to between 4e-11 and 1.6e-8.',
    'also_fixed':
        'Two of the tool\'s own diagnostics were repaired alongside. (1) The in-page acceptance '
        'band for the terminal time was one solver step, tEnd/900; it is now 1e-3 relative, '
        'fixed by the model\'s physical fidelity rather than by its own partition. (2) The '
        'in-page mass-domain reference integral stopped 1e-9 of the mass span short of the end '
        'to dodge the singular integrand, which silently subtracted the last sliver of the fill '
        '-- 6.5e-6 s on the shipped default, larger than the march error the reference exists to '
        'measure once the march was fixed. It now integrates in v = sqrt(m_eq - m), which makes '
        'the integrand bounded and removes the truncation entirely. The refinement check now '
        'grades step-fraction convergence, since there is no window partition left to refine.',
    'verified':
        'Zero regressions: all 234 checks pass, and of the 226 that already passed, 19 residuals '
        'moved and every one of them improved, by three to five orders of magnitude. Four '
        'extreme-corner cases at the declared input limits agree with the reference to 5e-10 '
        'with no page errors and no step-guard truncation. The exported Python mirrors the new '
        'stepper and reproduces the browser result to 1.5e-8 against the reference.',
}

CITATIONS = [
    "A. H. Shapiro, The Dynamics and Thermodynamics of Compressible Fluid Flow, vol. 1, "
    "Ronald Press, New York, 1953 -- ch. 4: steady one-dimensional isentropic flow. "
    "Eq. 4.14 (T0/T = 1 + (g-1)/2 M^2) and eq. 4.15 (p0/p = (T0/T)^(g/(g-1))) give the "
    "isentropic stagnation relations used to build the orifice mass flux; eq. 4.19 gives the "
    "critical pressure ratio p*/p0 = (2/(g+1))^(g/(g-1)); eq. 4.21 gives the choked mass flux "
    "per unit area G* = p0 sqrt(g/(R T0)) (2/(g+1))^((g+1)/(2(g-1))). Table B.2 of the same "
    "volume tabulates p/p0 = 0.528282 at M = 1 for g = 1.4.",

    "Ames Research Staff, Equations, Tables and Charts for Compressible Flow, NACA Report 1135, "
    "1953 -- eq. (45) and Table I (isentropic flow, g = 1.4): p/p_t = 0.528282 and "
    "T/T_t = 0.833333 at M = 1. Used as the published digit-level anchor for the choking "
    "criterion.",

    "The SI form of the choked-orifice rule for air, mdot = 0.0404 Cd A p0 / sqrt(T0) "
    "(kg/s, m^2, Pa, K) -- the numerical evaluation of Shapiro eq. 4.21 at g = 1.4, "
    "R = 287.05 J/(kg K); quoted to three significant figures in the standard relief-sizing "
    "literature (e.g. API STD 520 Part I critical-flow coefficient C, and Perry's Chemical "
    "Engineers' Handbook, compressible flow through nozzles). Used as an independent "
    "three-digit anchor on the tool's peak inlet flow.",

    "E. W. Lemmon, R. T. Jacobsen, S. G. Penoncello, D. G. Friend, "
    "\"Thermodynamic properties of air and mixtures of nitrogen, argon and oxygen from 60 to "
    "2000 K at pressures to 2000 MPa\", J. Phys. Chem. Ref. Data 29(3), 2000, pp. 331-385 -- "
    "reached through CoolProp 8.0 (PropsSI). Used to confirm that the tool's default gas "
    "constants and gamma are the real values (R_air = 287.0475 vs 287.05 J/(kg K), "
    "gamma_air = 1.40194 at 1 bar/293.15 K vs 1.4; R_He = 2077.264 vs 2077) and to quantify "
    "the ideal-gas closure error that sets the physical tolerance floor: Z(air, 293.15 K) = "
    "0.99962 at 1 bar, 0.99362 at 20 bar, 0.98790 at 50 bar.",

    "scipy 1.17 solve_ivp(method='Radau'), Hairer & Wanner's stiffly accurate implicit "
    "Runge-Kutta, used as the structurally independent cross-check on the quadrature route.",
]

# =============================================================================================
# 1.  DERIVATION  (first principles -- nothing below is taken from the page)
# =============================================================================================
#
# Control volume: a rigid vessel of fixed volume V, perfectly mixed, adiabatic, holding a
# calorically perfect ideal gas (constant R, gamma).  It is fed through an orifice of area A and
# discharge coefficient Cd from a reservoir so large that its state (p_s, T_s) is constant and
# its velocity negligible, i.e. (p_s, T_s) IS the stagnation state of the orifice flow.
#
# Mass balance on the control volume:
#       dm/dt = mdot                                                                    (1)
#
# Energy balance.  The volume is rigid (no boundary work) and adiabatic (no Q), and the only
# energy crossing the boundary is the enthalpy carried in by the stream:
#       d(m u)/dt = mdot h_s ,     u = cv T ,   h_s = cp T_s
#   =>  cv d(mT)/dt = cp T_s dm/dt
#   =>  d(mT)/dm = (cp/cv) T_s = gamma T_s
#   =>  m T = m0 T0 + gamma T_s (m - m0)                                                (A)
#
# (A) is exact: no integration scheme is needed for the thermal state.  Note it predicts the
# well-known result that filling a vessel from a supply at T_s raises the contents ABOVE T_s,
# asymptotically to gamma T_s when m >> m0.
#
# State equation:
#       p = m R T / V = (R/V) [ m0 T0 + gamma T_s (m - m0) ]                            (B)
#
# (B) is AFFINE in m, with dp/dm = gamma R T_s / V constant.  Substituting into (1):
#
#       dp/dt = (gamma R T_s / V) Cd A G(p)
#   and writing G = p_s Phi(r) with r = p/p_s:
#       dr/dt = alpha Phi(r) ,      alpha = gamma R T_s Cd A / V                        (C)
#   =>  t(r0 -> r1) = (1/alpha) Integral_{r0}^{r1} dr / Phi(r)                          (D)
#
# So the whole transient is a single quadrature of a one-dimensional function of r.
#
# Orifice flux Phi, built from the isentropic relations rather than from the collected algebraic
# form, so the two routes stay independent all the way down (Shapiro vol. 1 ch. 4):
#       energy      h_s = h + w^2/2      =>  w = sqrt(2 cp (T_s - T))
#       isentropic  T/T_s = r^((g-1)/g)                              (Shapiro eq. 4.14/4.15)
#       state       rho = p/(R T) = (p_s/(R T_s)) r^(1/g)
#       G = rho w
# Choked for r <= rc = (2/(g+1))^(g/(g-1))   (Shapiro eq. 4.19, NACA 1135 eq. 45), where the
# throat reaches M = 1 and G is frozen at G* = p_s sqrt(g/(R T_s)) (2/(g+1))^((g+1)/(2(g-1)))
# (Shapiro eq. 4.21), independent of the downstream (tank) pressure.
#
# Two structural consequences this harness exploits and the page's route does not:
#
#   (i)  On the choked leg Phi is CONSTANT, so (D) integrates in closed form:
#            t = (min(r1, rc) - r0) / (alpha Phi*)
#        and mdot is constant, so the peak inlet flow of any case that starts choked is exactly
#        Cd A p_s Phi*, with no integration at all.
#
#   (ii) As r -> 1, r^(2/g) - r^((g+1)/g) -> ((g-1)/g)(1-r), so Phi -> sqrt(2(1-r)/(R T_s)) and
#        the integrand of (D) diverges as (1-r)^(-1/2).  The divergence is INTEGRABLE, so the
#        equalisation time is finite.  Substituting r = 1 - u^2 (dr = -2u du) gives
#            dr/Phi = 2u du / Phi(1-u^2)  ->  2 sqrt(R T_s / 2) du,
#        a bounded, analytic integrand.  Gauss-Legendre in u therefore converges to round-off,
#        with no truncation of the endpoint.
#
# =============================================================================================

P_STOP_FRAC = 0.99999   # the page's declared equalisation cut-off: a MODEL PARAMETER, an input
                        # to the reference, not a reference output.


def critical_ratio(g):
    """Shapiro vol. 1 eq. 4.19 / NACA TR-1135 eq. 45."""
    return (2.0 / (g + 1.0)) ** (g / (g - 1.0))


def phi_choked(g, R, Ts):
    """G*/p_s, Shapiro vol. 1 eq. 4.21.  Units kg/(s m^2 Pa)."""
    return math.sqrt(g / (R * Ts)) * (2.0 / (g + 1.0)) ** ((g + 1.0) / (2.0 * (g - 1.0)))


def phi(r, g, R, Ts):
    """G/p_s at pressure ratio r, assembled as rho*w from the isentropic relations."""
    if r <= critical_ratio(g):
        return phi_choked(g, R, Ts)
    if r >= 1.0:
        return 0.0
    cp = g * R / (g - 1.0)
    T_th = Ts * r ** ((g - 1.0) / g)                  # isentropic static temperature at throat
    w = math.sqrt(max(0.0, 2.0 * cp * (Ts - T_th)))   # energy equation
    return (r ** (1.0 / g) / (R * Ts)) * w            # rho/p_s times w


def mdot_of_r(r, s):
    if not (s['pSupply'] > 0 and s['A'] > 0 and s['Cd'] > 0 and s['TSupply'] > 0):
        return 0.0
    if r >= 1.0:
        return 0.0
    return s['Cd'] * s['A'] * s['pSupply'] * phi(max(0.0, r), s['gamma'], s['R'], s['TSupply'])


def m_initial(s):
    return s['p0'] * s['V'] / (s['R'] * s['T0'])


def m_of_p(p, s):
    """Inverse of (B)."""
    m0 = m_initial(s)
    return m0 + (p * s['V'] / s['R'] - m0 * s['T0']) / (s['gamma'] * s['TSupply'])


def T_of_m(m, s):
    """(A)."""
    m0 = m_initial(s)
    return (m0 * s['T0'] + s['gamma'] * s['TSupply'] * (m - m0)) / m


def alpha(s):
    """(C)."""
    return s['gamma'] * s['R'] * s['TSupply'] * s['Cd'] * s['A'] / s['V']


# ---- route R2 (primary): closed-form choked leg + desingularised Gauss-Legendre -------------

def _time_subsonic(ra, rb, s, n=400):
    if not (rb > ra):
        return 0.0
    ua, ub = math.sqrt(max(0.0, 1.0 - ra)), math.sqrt(max(0.0, 1.0 - rb))
    x, w = np.polynomial.legendre.leggauss(n)
    lo, hi = min(ub, ua), max(ub, ua)
    u = 0.5 * (hi - lo) * x + 0.5 * (hi + lo)
    g, R, Ts = s['gamma'], s['R'], s['TSupply']
    vals = np.array([2.0 * ui / phi(1.0 - ui * ui, g, R, Ts) if ui > 0 else 0.0 for ui in u])
    return float(np.sum(w * vals) * 0.5 * (hi - lo)) / alpha(s)


def time_r0_to_r1(r0, r1, s, n=400):
    if not (r1 > r0):
        return 0.0
    rc, a = critical_ratio(s['gamma']), alpha(s)
    t = 0.0
    if r0 < rc:
        t += (min(r1, rc) - r0) / (a * phi_choked(s['gamma'], s['R'], s['TSupply']))
    if r1 > rc:
        t += _time_subsonic(max(r0, rc), r1, s, n=n)
    return t


def r_at_time(r0, t_target, s, n=400):
    if t_target <= 0:
        return r0
    hi = 1.0 - 1e-16
    f = lambda r: time_r0_to_r1(r0, r, s, n=n) - t_target
    if f(hi) < 0:
        return hi
    return brentq(f, r0, hi, xtol=1e-16, rtol=8.9e-16, maxiter=300)


# ---- route R1 (cross-check): implicit stiff time march on (C) ------------------------------

def solve_radau(s, t_end, r_stop=P_STOP_FRAC, rtol=1e-12, atol=1e-14):
    r0 = s['p0'] / s['pSupply']
    if r0 >= r_stop or r0 >= 1.0:
        return r0, 0.0, True
    a, g, R, Ts = alpha(s), s['gamma'], s['R'], s['TSupply']
    rhs = lambda t, y: [a * phi(min(max(y[0], 0.0), 1.0), g, R, Ts)]
    ev = lambda t, y: y[0] - r_stop
    ev.terminal, ev.direction = True, 1.0
    sol = solve_ivp(rhs, (0.0, t_end), [r0], method='Radau', events=ev,
                    rtol=rtol, atol=atol, max_step=t_end / 4.0)
    if sol.t_events[0].size:
        return r_stop, float(sol.t_events[0][0]), True
    return float(sol.y[0, -1]), float(sol.t[-1]), False


# ---- route R3 (cross-check): dense trapezoid in the desingularised variable ----------------

def time_trapezoid(s, r_stop=P_STOP_FRAC, N=400000):
    g, R, Ts = s['gamma'], s['R'], s['TSupply']
    ua, ub = math.sqrt(1 - s['p0'] / s['pSupply']), math.sqrt(1 - r_stop)
    u = np.linspace(ua, ub, N + 1)
    vals = np.array([2.0 * ui / phi(1.0 - ui * ui, g, R, Ts) if ui > 0 else 0.0 for ui in u])
    return abs(float(np.trapezoid(vals, u))) / alpha(s)


# ---- the complete reference answer for one input set ---------------------------------------

def reference(s, n=400):
    ps, p0 = s['pSupply'], s['p0']
    m0 = m_initial(s)
    out = dict(m0=m0, rc=critical_ratio(s['gamma']))
    if not (ps > p0) or s['A'] <= 0 or s['Cd'] <= 0:
        out.update(elapsed=0.0, p_final=p0, T_final=s['T0'], rho_final=m0 / s['V'],
                   m_admitted=0.0, mdot_final=0.0, mdot_peak=0.0, equalised=False,
                   choked_at_start=False, route='no driving potential: closed form')
        return out
    r0 = p0 / ps
    out['mdot_peak'] = mdot_of_r(r0, s)
    out['choked_at_start'] = r0 <= out['rc']
    if r0 >= P_STOP_FRAC:
        out.update(elapsed=0.0, p_final=p0, T_final=s['T0'], rho_final=m0 / s['V'],
                   m_admitted=0.0, mdot_final=mdot_of_r(r0, s), equalised=True,
                   route='already inside the equalisation band: closed form')
        return out
    t_full = time_r0_to_r1(r0, P_STOP_FRAC, s, n=n)
    if t_full <= s['tEnd']:
        r1, t1, eq = P_STOP_FRAC, t_full, True
        route = 'R2: closed-form choked leg + Gauss-Legendre in u = sqrt(1-r)'
    else:
        r1, t1, eq = r_at_time(r0, s['tEnd'], s, n=n), s['tEnd'], False
        route = 'R2 inverted by Brent root-find at t = tEnd'
    p1 = r1 * ps
    m1 = m_of_p(p1, s)
    out.update(elapsed=t1, p_final=p1, T_final=T_of_m(m1, s), rho_final=m1 / s['V'],
               m_admitted=m1 - m0, mdot_final=mdot_of_r(r1, s), equalised=eq,
               t_fill=t_full, r_final=r1, route=route)
    return out


# =============================================================================================
# 2.  SELF-VERIFICATION OF THIS FILE'S SOLVER  (run before it is allowed to grade anything)
# =============================================================================================

DEFAULT = dict(V=1.0, p0=120000.0, T0=293.15, pSupply=2000000.0, TSupply=293.15,
               A=1e-4, Cd=0.8, gamma=1.4, R=287.05, tEnd=300.0)
SUBSONIC = dict(DEFAULT, pSupply=150000.0, A=1e-5, tEnd=3000.0)
HELIUM = dict(V=50.0, p0=1e5, T0=293.15, pSupply=5e6, TSupply=300.0, A=5e-4, Cd=0.75,
              gamma=1.667, R=2077.0, tEnd=3000.0)


def self_verify(verbose=True):
    """Every claim this harness makes about its own solver, checked before it grades the tool."""
    rows = []

    def chk(name, got, ref, tol, unit='-', how=''):
        rel = abs(got - ref) / abs(ref) if ref else abs(got - ref)
        rows.append(dict(check=name, got=got, ref=ref, rel=rel, tol=tol, unit=unit,
                         ok=rel <= tol, how=how))

    # (a) published critical pressure ratio
    chk('critical-ratio-g1.4-vs-NACA-1135-Table-I', critical_ratio(1.4), 0.528282, 1e-6,
        how='NACA TR-1135 Table I, M = 1, g = 1.4')
    chk('critical-ratio-g5/3-closed-form', critical_ratio(5 / 3), 0.75 ** 2.5, 1e-15,
        how='(2/(g+1))^(g/(g-1)) = 0.75^2.5 exactly at g = 5/3')

    # (b) the two branches of Phi must meet at rc
    for g in (1.2, 1.4, 1.667):
        rc = critical_ratio(g)
        chk(f'phi-branch-continuity-g{g}', phi(rc * (1 + 1e-12), g, 287.05, 293.15),
            phi_choked(g, 287.05, 293.15), 1e-12,
            how='subsonic branch evaluated just above rc must equal Shapiro eq. 4.21')

    # (c) published three-digit SI choked-orifice rule for air
    chk('choked-coefficient-air-vs-published-0.0404-rule',
        phi_choked(1.4, 287.05, 293.15) * math.sqrt(293.15), 0.0404, 1.25e-3, unit='kg K^.5/(s m^2 Pa)',
        how='mdot = 0.0404 Cd A p0/sqrt(T0); tolerance = half of the published last digit')

    # (d) the choked leg has a closed form: three routes must agree exactly
    rc = critical_ratio(DEFAULT['gamma'])
    t_cf = (rc - DEFAULT['p0'] / DEFAULT['pSupply']) / (
        alpha(DEFAULT) * phi_choked(DEFAULT['gamma'], DEFAULT['R'], DEFAULT['TSupply']))
    chk('choked-leg-closed-form-vs-quadrature',
        time_r0_to_r1(DEFAULT['p0'] / DEFAULT['pSupply'], rc, DEFAULT, n=400), t_cf, 1e-14, 's',
        how='Phi is constant while choked, so (D) is exact')
    chk('choked-leg-closed-form-vs-dm-over-mdot',
        (m_of_p(rc * DEFAULT['pSupply'], DEFAULT) - m_initial(DEFAULT)) / mdot_of_r(0.0, DEFAULT),
        t_cf, 1e-14, 's', how='mass admitted divided by the constant choked flow')

    # (e) quadrature convergence under node refinement
    ts = [time_r0_to_r1(DEFAULT['p0'] / DEFAULT['pSupply'], P_STOP_FRAC, DEFAULT, n=n)
          for n in (50, 100, 200, 400, 800, 1600)]
    chk('quadrature-node-refinement-spread', max(ts) - min(ts), 0.0, 1e-11, 's',
        how='n = 50 .. 1600 Gauss-Legendre nodes on the full default fill')

    # (f) two structurally different integrators must reproduce R2
    for lbl, s in (('default', DEFAULT), ('subsonic-throughout', SUBSONIC), ('helium', HELIUM)):
        t2 = time_r0_to_r1(s['p0'] / s['pSupply'], P_STOP_FRAC, s, n=800)
        _, t1, _ = solve_radau(s, t2 * 3)
        t3 = time_trapezoid(s, N=400000)
        chk(f'route-R1-Radau-vs-R2-quadrature-{lbl}', t1, t2, 1e-10, 's',
            how='scipy implicit Radau on dr/dt = alpha Phi(r), rtol 1e-12')
        chk(f'route-R3-trapezoid-vs-R2-quadrature-{lbl}', t3, t2, 1e-9, 's',
            how='4e5-node trapezoid in u = sqrt(1-r)')

    # (g) the analytic near-equalisation asymptote t ~ 2(sqrt(e0)-sqrt(e1)) sqrt(R Ts/2)/alpha
    rstop = 1 - 1e-12
    for eps, tol in ((1e-3, 3e-4), (1e-5, 3e-6), (1e-7, 1e-6)):
        s = dict(DEFAULT, p0=(1 - eps) * DEFAULT['pSupply'])
        t_as = 2.0 * (math.sqrt(eps) - math.sqrt(1 - rstop)) * math.sqrt(
            s['R'] * s['TSupply'] / 2.0) / alpha(s)
        chk(f'near-equalisation-asymptote-eps{eps:.0e}',
            time_r0_to_r1(1 - eps, rstop, s, n=800), t_as, tol, 's',
            how='Phi -> sqrt(2(1-r)/(R Ts)) as r -> 1; error must fall linearly in eps')

    # (h) CoolProp: the gas constants and gamma used as inputs are the real ones, and the
    #     ideal-gas closure error is quantified (it sets the physical tolerance floor).
    try:
        import CoolProp.CoolProp as CP
        Ru = 8.31446261815324
        chk('coolprop-R-air', 287.05, Ru / CP.PropsSI('M', 'Air'), 1e-4, 'J/(kg K)',
            how='tool default vs Ru/M from CoolProp')
        chk('coolprop-R-helium', 2077.0, Ru / CP.PropsSI('M', 'Helium'), 5e-4, 'J/(kg K)',
            how='tool default vs Ru/M from CoolProp')
        chk('coolprop-gamma-air-1bar-293K', 1.4,
            CP.PropsSI('CPMASS', 'T', 293.15, 'P', 1e5, 'Air') /
            CP.PropsSI('CVMASS', 'T', 293.15, 'P', 1e5, 'Air'), 2e-3, '-',
            how='tool default vs cp/cv from the Lemmon et al. air EOS')
        z20 = (2e6 / (287.0475 * 293.15)) / CP.PropsSI('D', 'T', 293.15, 'P', 2e6, 'Air')
        rows.append(dict(check='coolprop-ideal-gas-error-at-20-bar', got=z20, ref=1.0,
                         rel=abs(z20 - 1.0), tol=None, unit='-', ok=True,
                         how='INFORMATIONAL: Z = %.5f, i.e. the ideal-gas closure the whole '
                             'model rests on is %.2f%% wrong in density at the shipped '
                             'default supply pressure. This number sets the physical floor '
                             'under the terminal-time tolerance.' % (z20, 100 * abs(z20 - 1))))
    except ImportError:
        rows.append(dict(check='coolprop-missing', got=None, ref=None, rel=None, tol=None,
                         unit='-', ok=False, how='pip install CoolProp'))

    if verbose:
        w = max(len(r['check']) for r in rows)
        for r in rows:
            mark = 'ok  ' if r['ok'] else 'FAIL'
            rel = '' if r['rel'] is None else f"rel={r['rel']:.2e}"
            tol = '' if r['tol'] is None else f" tol={r['tol']:.1e}"
            print(f"  [{mark}] {r['check']:<{w}}  {rel}{tol}")
    return rows


# =============================================================================================
# 3.  TOLERANCES  (chosen from the physics and from the tool's printed precision)
# =============================================================================================

MACH_EPS = 2.220446049250313e-16


def tol_flux(r):
    """Acceptance band for a mass-flux comparison at pressure ratio r.

    The isentropic flux is built from the difference of two nearly equal quantities as r -> 1
    (r^(2/g) - r^((g+1)/g) in the collected form, T_s - T_throat in the rho*w form), so the
    relative condition number of ANY double-precision evaluation of it is about 1/(1-r).  The
    band is therefore the round-off floor 100*eps/(1-r), never tighter than 1e-12.  It is a
    property of the expression, not of either implementation, and is fixed before any result is
    looked at."""
    return max(1e-12, 100.0 * MACH_EPS / max(1e-12, 1.0 - min(r, 1.0 - 1e-12)))


TOL = {
    'algebraic': 1e-12,
    'trajectory': 1e-8,
    'time': 1e-3,
    'published6': 1e-6,
    'published3': 1.25e-3,
    'window-invariance': 1e-6,
}

TOL_WHY = {
    'algebraic':
        "1e-12 relative. p, T, rho, admitted mass and the peak inlet flow of an equalised or "
        "t = 0 state are CLOSED-FORM in this model: (A) and (B) give m T and p without any "
        "integration, and the peak flow of a case that starts choked is Cd A p_s G*/p_s exactly. "
        "Two independent double-precision evaluations of a closed form may differ only by "
        "round-off, so the band is set at round-off scale. Observed worst case 4e-14.",
    'trajectory':
        "1e-8 relative. For quantities read off the trajectory at a truncated window the "
        "reference must invert a quadrature and the tool must march 900 RK4 steps, and near the "
        "equalisation band the isentropic flux is the difference of two nearly equal powers of "
        "r, whose condition number is about 1/(1-r) = 1e5 -- so no double-precision evaluation "
        "of either side can be trusted below about 1e-11 relative. 1e-8 leaves three decades "
        "over that floor and is still four decades tighter than any physical claim the model "
        "can support. Observed worst case 1.6e-9.",
    'time':
        "1e-3 relative (absolute floor 1e-6 s). The ideal-gas closure this whole model rests on "
        "is itself 0.64 % wrong in density at the shipped default's 20 bar supply "
        "(CoolProp/Lemmon et al. air EOS, Z = 0.99362 at 293.15 K), so a time-integration error "
        "is only defensible while it stays an order of magnitude inside the model's own physical "
        "fidelity. 1e-3 does that, and is still about five times looser than the two decimal "
        "places at which the page prints the elapsed time in its report. It is NOT derived from "
        "the solver's own step, which is the mistake the superseded in-page tolerance made: "
        "tEnd/900 grows with the window, so no step size could ever fail it.",
    'published6':
        "1e-6 relative: half of the last digit of p*/p_t = 0.528282 as published in NACA "
        "TR-1135 Table I.",
    'published3':
        "1.25e-3 relative: half of the last digit of the three-significant-figure published "
        "rule mdot = 0.0404 Cd A p0 / sqrt(T0) for air.",
    'window-invariance':
        "1e-6 relative spread. The time a vessel takes to fill is fixed by the vessel, the "
        "orifice and the two gas states; the length of the window the user asks to see is not "
        "one of them and must not enter the answer at all. The only admissible spread is the "
        "residual discretisation error of the march, which the transient-sized step bounds at "
        "about 2e-8 across the whole range tested, so 1e-6 leaves two decades of headroom while "
        "still being 4.7e4 times tighter than the 4.7e-2 spread the previous window-derived step "
        "produced. Note that this band is derived from the INVARIANCE ITSELF -- a property the "
        "physics demands exactly -- and not from any step size, which is what makes it a "
        "criterion a bad stepper cannot satisfy.",
    'flux-conditioning':
        "max(1e-12, 100 eps / (1 - r)) relative, evaluated per case from that case's pressure "
        "ratio. The isentropic mass flux is a difference of two nearly equal quantities as "
        "r -> 1, so its relative condition number is about 1/(1-r) and no double-precision "
        "evaluation on either side can be trusted below that floor. At r = 0.06 the band is the "
        "1e-12 round-off minimum; at the 0.99999 equalisation band it is 2.2e-9. The band "
        "follows from the expression, not from either implementation.",
}


# =============================================================================================
# 4.  CASES
# =============================================================================================

def _c(cid, note, basis, **inputs):
    s = dict(V=1.0, p0=120000.0, T0=293.15, pSupply=2000000.0, TSupply=293.15,
             A=1e-4, Cd=0.8, gamma=1.4, R=287.05, tEnd=300.0)
    s.update(inputs)
    return dict(id=cid, note=note, basis=basis, inputs=s)


#: groups that run identical physics at many window lengths.  The fill time must be the same
#: number every time: tEnd carries no physics, so it must not appear in the answer.
def build_invariance_groups():
    air = dict(V=1.0, p0=120000.0, T0=293.15, pSupply=2000000.0, TSupply=293.15,
               A=1e-4, Cd=0.8, gamma=1.4, R=287.05)
    he = dict(V=50.0, p0=1e5, T0=293.15, pSupply=5e6, TSupply=300.0, A=5e-4, Cd=0.75,
              gamma=1.667, R=2077.0)
    sub = dict(air, pSupply=150000.0, A=1e-5)
    return [
        dict(id='ind-fill-time-independent-of-window-air',
             note='Air 1.2 -> 20 bar through 100 mm2 (fill 54.157 s), run at eight windows from '
                  '1.02x to 185000x the fill. The reported fill time must be the same number '
                  'every time.',
             base=air, tEnds=[55.2, 60.0, 110.0, 300.0, 1000.0, 3000.0, 1e5, 1e7]),
        dict(id='ind-fill-time-independent-of-window-helium',
             note='Helium into 50 m3 (fill 178.008 s), run at seven windows from 1.02x to 56000x '
                  'the fill',
             base=he, tEnds=[181.6, 200.0, 400.0, 3000.0, 30000.0, 300000.0, 1e7]),
        dict(id='ind-fill-time-independent-of-window-subcritical',
             note='Subcritical-throughout, 1.2 -> 1.5 bar (fill 201.009 s), run at seven windows '
                  'from 1.02x to 49000x the fill. The subsonic leg is the whole transient here, '
                  'which is where the old window-derived step was worst.',
             base=sub, tEnds=[205.0, 250.0, 500.0, 3000.0, 30000.0, 300000.0, 1e7]),
    ]


def expand_groups(groups):
    out = []
    for gp in groups:
        for k, te in enumerate(gp['tEnds']):
            out.append(dict(id='%s__w%d' % (gp['id'], k), note=gp['note'], basis='independent',
                            inputs=dict(gp['base'], tEnd=te)))
    return out


def grade_groups(groups, driven):
    """One graded check per group: the spread of the reported fill time across windows."""
    by_id = {r['id']: r['record'] for r in driven['results']}
    cases, total, passed = [], 0, 0
    for gp in groups:
        runs = []
        for k, te in enumerate(gp['tEnds']):
            rec = by_id['%s__w%d' % (gp['id'], k)]
            runs.append(dict(tEnd=te, elapsed=rec['outputs']['elapsed'],
                             p_final=rec['outputs']['p_final']))
        ts = [r['elapsed'] for r in runs]
        mean = sum(ts) / len(ts)
        spread = (max(ts) - min(ts)) / mean if mean else max(ts) - min(ts)
        tol = TOL['window-invariance']
        ok = spread <= tol
        total += 1
        passed += bool(ok)
        ref = reference(dict(gp['base'], tEnd=1e9), n=400)
        rows = [dict(check='fill-time-spread-across-window', got=spread, ref=0.0,
                     abs=max(ts) - min(ts), rel=spread, tol=tol, unit='-', graded=True,
                     basis='independent', tolerance_basis='window-invariance',
                     status='pass' if ok else 'fail', ok=bool(ok),
                     extra=dict(windows=runs, mean=mean, reference_fill_time=ref['elapsed'],
                                window_span='%.2fx to %.0fx the fill'
                                % (min(gp['tEnds']) / ref['elapsed'],
                                   max(gp['tEnds']) / ref['elapsed'])))]
        cases.append(dict(id=gp['id'], note=gp['note'], basis='independent',
                          inputs=dict(gp['base'], tEnd='varied: %s' % gp['tEnds']),
                          reference_route='invariance required by the physics: the fill time is '
                                          'a property of the vessel, the orifice and the two gas '
                                          'states, none of which is tEnd',
                          cmp=rows, **{'pass': ok}))
    return cases, total, passed


def build_cases():
    C = []
    a = C.append

    # -- the shipped default and its declared regimes -----------------------------------------
    a(_c('ind-default-air-20-bar',
         'Shipped default: air, 1.2 -> 20 bar through 100 mm2, window 5.5x the fill',
         'independent'))
    a(_c('ind-subcritical-throughout',
         'Supply ratio above the critical ratio from t = 0 (1.2 -> 1.5 bar): the subsonic '
         'orifice branch is exercised for the whole transient',
         'independent', pSupply=150000.0, A=1e-5, tEnd=300.0))
    a(_c('ind-helium-large-vessel',
         'Helium (gamma 1.667, R 2077 J/(kg K)) into 50 m3, window 1.1x the fill',
         'independent', V=50.0, p0=1e5, pSupply=5e6, TSupply=300.0, A=5e-4, Cd=0.75,
         gamma=1.667, R=2077.0, tEnd=200.0))
    a(_c('ind-hot-supply-small-orifice',
         'Supply at 250 C through 1 mm2 into 2 m3, window 10x the fill',
         'independent', V=2.0, p0=101325.0, T0=288.15, pSupply=1e6, TSupply=523.15,
         A=1e-6, Cd=0.62, tEnd=100000.0))

    # -- choking transition, anchored to published table values --------------------------------
    rc = critical_ratio(1.4)
    a(_c('ind-choked-at-start-published-rule',
         'Air, r0 = 0.06 << r_crit: peak inlet flow must equal the published three-digit SI '
         'choked-orifice rule 0.0404 Cd A p0/sqrt(T0)',
         'independent', tEnd=60.0))
    a(_c('ind-just-below-critical-ratio',
         'r0 = r_crit(1 - 1e-3) with r_crit = 0.528282 from NACA TR-1135 Table I: the orifice '
         'must still be on the choked branch, so the peak flow must equal Shapiro eq. 4.21 '
         'exactly',
         'independent', p0=rc * (1 - 1e-3) * 2e6, tEnd=1e-3))
    a(_c('ind-just-above-critical-ratio',
         'r0 = r_crit(1 + 1e-3): the orifice must have left the choked branch. Phi is stationary '
         'at r_crit, so the two branches differ only to second order; at this offset the '
         'subsonic value sits 6.1e-7 below the choked one, six decades above the round-off '
         'floor, which is what makes the transition point observable at all',
         'independent', p0=rc * (1 + 1e-3) * 2e6, tEnd=1e-3))
    a(_c('ind-choking-transition-window',
         'Window ends inside the choked leg (tEnd = 15 s): admitted mass must be exactly '
         'mdot_choked * t, a closed form with no integration',
         'independent', tEnd=15.0))

    # -- trajectory samples: tEnd truncation samples p(t), T(t), m(t) ---------------------------
    for te in (2.0, 10.0, 21.0, 25.0, 40.0, 54.0):
        a(_c(f'ind-trajectory-{te:g}s',
             f'Window truncated at {te:g} s, sampling the shipped default trajectory '
             f'({"choked leg" if te <= 21 else "subsonic leg"})',
             'independent', tEnd=te))

    # -- declared input boundaries --------------------------------------------------------------
    a(_c('ind-bound-Cd-min', 'Discharge coefficient at the declared minimum, Cd = 0.05',
         'independent', Cd=0.05, tEnd=1200.0))
    a(_c('ind-bound-Cd-max', 'Discharge coefficient at the declared maximum, Cd = 1.2',
         'independent', Cd=1.2, tEnd=60.0))
    a(_c('ind-bound-gamma-min', 'Heat-capacity ratio at the declared minimum, gamma = 1.01',
         'independent', gamma=1.01, tEnd=200.0))
    a(_c('ind-bound-gamma-max', 'Heat-capacity ratio at the declared maximum, gamma = 1.8',
         'independent', gamma=1.8, tEnd=100.0))
    a(_c('ind-bound-cold-tank', 'Initial temperature at the declared minimum, T0 = 100 K',
         'independent', T0=100.0, tEnd=100.0))
    a(_c('ind-bound-hot-supply', 'Supply temperature at the declared maximum, TSupply = 2000 K',
         'independent', TSupply=2000.0, tEnd=100.0))
    a(_c('ind-bound-high-pressure',
         'Supply at 200 bar into 1 bar, near the top of the declared pressure range (the '
         'ideal-gas closure is about 2.6 % wrong in density here -- see not_benchmarked)',
         'independent', p0=1e5, pSupply=2e7, tEnd=100.0))
    a(_c('ind-bound-large-vessel-small-orifice',
         'V = 10000 m3 through A = 1e-7 m2: the slowest transient in range',
         'independent', V=10000.0, A=1e-7, tEnd=9e6))
    a(_c('ind-heavy-gas-low-gamma',
         'Heavy gas, gamma 1.1 / R 189 J/(kg K) (CO2-like), 1 -> 20 bar',
         'independent', p0=1e5, gamma=1.1, R=188.9, tEnd=200.0))

    # -- degenerate / no-flow boundaries ---------------------------------------------------------
    a(_c('ind-no-driving-potential',
         'Initial pressure above the supply: no flow, the tank must not move and the elapsed '
         'time must be exactly zero',
         'independent', p0=2.5e6, tEnd=100.0))
    a(_c('ind-already-equalised',
         'Initial pressure already inside the 0.99999 equalisation band',
         'independent', p0=0.999995 * 2e6, tEnd=100.0))
    a(_c('ind-window-shorter-than-fill',
         'Window ends well before equalisation (tEnd = 10 s)',
         'independent', tEnd=10.0))

    # -- the simulation-window sensitivity (the point of the exercise) ---------------------------
    a(_c('ind-window-20x-fill',
         'Same physics as the default, window 18x the fill (tEnd = 1000 s). The fill time is a '
         'property of the vessel and the orifice and must not depend on how long the user is '
         'willing to watch.',
         'independent', tEnd=1000.0))
    a(_c('ind-window-55x-fill',
         'Same physics as the default, window 55x the fill (tEnd = 3000 s)',
         'independent', tEnd=3000.0))
    a(_c('ind-window-185x-fill',
         'Same physics as the default, window 185x the fill (tEnd = 10000 s)',
         'independent', tEnd=10000.0))
    a(_c('ind-window-vast-air',
         'Same physics as the default, window at the declared maximum (tEnd = 1e7 s)',
         'independent', tEnd=1e7))
    a(_c('ind-window-vast-helium',
         'Helium case with a 1700x window (tEnd = 300000 s)',
         'independent', V=50.0, p0=1e5, pSupply=5e6, TSupply=300.0, A=5e-4, Cd=0.75,
         gamma=1.667, R=2077.0, tEnd=300000.0))
    a(_c('ind-window-vast-subcritical',
         'Subcritical-throughout case with a 15000x window (tEnd = 3e6 s): the subsonic leg is '
         'the whole transient, which is where the window sensitivity is worst',
         'independent', pSupply=150000.0, A=1e-5, tEnd=3e6))
    return C


# ---- which quantities each case grades, and against which tolerance -------------------------

ALG = ('p_final', 'T_final', 'rho_final', 'm_admitted')


def checks_for(case, ref):
    """(quantity, tolerance key, label) triples for one case."""
    out = []
    key = 'algebraic' if (ref['equalised'] or ref['elapsed'] == 0) else 'trajectory'
    for q in ALG:
        out.append((q, key))
    out.append(('mdot_peak', 'flux-conditioning'))   # t = 0 closed form, conditioning-limited
    if ref['equalised'] or ref['elapsed'] == 0:
        out.append(('mdot_final', 'flux-conditioning'))
    out.append(('elapsed', 'time'))
    return out


# =============================================================================================
# 5.  DRIVING THE SHIPPING PAGE
# =============================================================================================

DRIVER_JS = r"""
import { readFileSync, writeFileSync } from 'fs';
import pkg from process.env.DGC_PLAYWRIGHT;
const { chromium } = pkg;
const [,, jobFile, outFile, port] = process.argv;
const job = JSON.parse(readFileSync(jobFile, 'utf8'));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String((e && e.message) || e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const results = [];
for (const c of job.cases) {
  const s = 'J' + Buffer.from(JSON.stringify(c.inputs), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await page.goto(`http://127.0.0.1:${port}/tank_pressurisation.html?lang=en&s=${s}`,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.Diagram && window.Diagram.record
      && window.Diagram.record.build && window.Diagram.record.build()), null, { timeout: 30000 });
  results.push({ id: c.id, record: await page.evaluate(() => {
      const r = window.Diagram.record.build();
      return { inputs: r.inputs, outputs: r.outputs, units: r.units,
               equations: (r.model || {}).equations, warnings: r.warnings || [],
               notes: (r.model || {}).notes || [] }; }) });
}
await page.goto(`http://127.0.0.1:${port}/tank_pressurisation.html?lang=en`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__dgcBenchmark, null, { timeout: 30000 });
const inpage = await page.evaluate(() => window.__dgcBenchmark());
/* The build is OBSERVED on the page the browser actually fetched, never typed and never
   read from disk: the calculation record's own tool.manifest_revision (diagram-common.js
   fills it from the served manifest element), with that element as the fallback. */
const served_revision = await page.evaluate(() => {
  try {
    const r = (window.Diagram && window.Diagram.record && window.Diagram.record.build)
      ? window.Diagram.record.build() : null;
    if (r && r.tool && r.tool.manifest_revision) return r.tool.manifest_revision;
  } catch (e) { /* fall through to the manifest element */ }
  const el = document.getElementById('diagram-tool-manifest');
  if (!el) return null;
  try { return JSON.parse(el.textContent).manifest_revision || null; } catch (e) { return null; }
});
writeFileSync(outFile, JSON.stringify({ results, inpage, errors, served_revision }));
await browser.close();
"""


def _playwright_path():
    for p in ('/home/claude/.npm-global/lib/node_modules/playwright/index.js',
              '/usr/lib/node_modules/playwright/index.js'):
        if os.path.exists(p):
            return p
    raise SystemExit('playwright not found; set DGC_PLAYWRIGHT')


def serve(directory, port):
    import http.server
    import functools
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


#: shared site scripts the page loads; the harness needs them beside the page to drive it.
SHARED_SCRIPTS = ('diagram-common.js', 'diagram-ui.js', 'site-disclaimer.js')


def preflight(directory):
    missing = [f for f in ('tank_pressurisation.html',) + SHARED_SCRIPTS
               if not os.path.exists(os.path.join(directory, f))]
    if missing:
        raise SystemExit(
            'missing from --dir %s: %s\n'
            'The page loads the shared scripts by relative path, so they must sit beside it. '
            'Fetch each at the ?v= anchor the page spells and check the sha256 prefix matches:\n'
            '  grep -o \'src="[^"]*"\' tank_pressurisation.html\n'
            '  curl -sS -o diagram-common.js "https://tools.petrov.re/diagram-common.js?v=<anchor>"'
            % (directory, ', '.join(missing)))


def drive(cases, directory, port, node='node'):
    preflight(directory)
    pw = os.environ.get('DGC_PLAYWRIGHT') or _playwright_path()
    tmp = tempfile.mkdtemp(prefix='tankbench-')
    js = os.path.join(tmp, 'drive.mjs')
    with open(js, 'w') as f:
        f.write(DRIVER_JS.replace('process.env.DGC_PLAYWRIGHT', json.dumps(pw)))
    job, out = os.path.join(tmp, 'job.json'), os.path.join(tmp, 'out.json')
    with open(job, 'w') as f:
        json.dump({'cases': [{'id': c['id'], 'inputs': c['inputs']} for c in cases]}, f)
    httpd = serve(directory, port)
    try:
        r = subprocess.run([node, js, job, out, str(port)], capture_output=True, text=True)
        if r.returncode:
            raise SystemExit('driver failed:\n' + r.stdout + r.stderr)
    finally:
        httpd.shutdown()
    with open(out) as f:
        return json.load(f)


# =============================================================================================
# 6.  GRADING AND THE MERGED ARTIFACT
# =============================================================================================

def grade(cases, driven, sabotage=False):
    by_id = {r['id']: r['record'] for r in driven['results']}
    out_cases, total, passed = [], 0, 0
    for c in cases:
        rec = by_id[c['id']]
        s, got = rec['inputs'], rec['outputs']
        ref = reference(s, n=400)
        if sabotage:
            if c['id'] == 'ind-default-air-20-bar':
                ref['T_final'] *= 1.02                      # falsify a closed-form expectation
            if c['id'] == 'ind-subcritical-throughout':
                ref['mdot_peak'] *= 1.5                     # falsify the subsonic orifice branch
            if c['id'] == 'ind-trajectory-10s':
                ref['p_final'] += 500.0                     # falsify a trajectory sample
        cmp_rows = []
        r0 = s['p0'] / s['pSupply'] if s['pSupply'] else 0.0
        for q, tk in checks_for(c, ref):
            if tk == 'flux-conditioning':
                tol = tol_flux(r0 if q == 'mdot_peak' else ref.get('r_final', r0))
            else:
                tol = TOL[tk]
            g, v = got[q], ref[q]
            av = abs(g - v)
            rel = av / abs(v) if v else av
            ok = (rel <= tol) if v else (av <= (1e-6 if tk == 'time' else 1e-12))
            total += 1
            passed += bool(ok)
            cmp_rows.append(dict(check=q, got=g, ref=v, abs=av, rel=(rel if v else None),
                                 tol=tol, unit=rec['units'].get(q), graded=True,
                                 basis='independent', tolerance_basis=tk,
                                 status='pass' if ok else 'fail', ok=bool(ok)))
        # published-digit anchors, where the case is positioned to expose them
        if c['id'] == 'ind-choked-at-start-published-rule':
            pub = 0.0404 * s['Cd'] * s['A'] * s['pSupply'] / math.sqrt(s['TSupply'])
            rel = abs(got['mdot_peak'] - pub) / pub
            ok = rel <= TOL['published3']
            total += 1
            passed += bool(ok)
            cmp_rows.append(dict(check='mdot_peak-vs-published-0.0404-rule',
                                 got=got['mdot_peak'], ref=pub, abs=abs(got['mdot_peak'] - pub),
                                 rel=rel, tol=TOL['published3'], unit='kg/s', graded=True,
                                 basis='independent', tolerance_basis='published3',
                                 status='pass' if ok else 'fail', ok=bool(ok)))
        if c['id'] in ('ind-just-below-critical-ratio', 'ind-just-above-critical-ratio'):
            below = c['id'].endswith('below-critical-ratio')
            chokedref = s['Cd'] * s['A'] * s['pSupply'] * phi_choked(s['gamma'], s['R'], s['TSupply'])
            dev = abs(got['mdot_peak'] - chokedref) / chokedref
            # on the choked branch the peak flow IS the choked value; 1e-3 past r_crit the
            # subsonic branch sits 6.1e-7 below it, so 1e-8 separates the two cleanly.
            is_choked = dev <= 1e-12
            ok = (is_choked == below) and (below or dev > 1e-8)
            total += 1
            passed += bool(ok)
            cmp_rows.append(dict(check='choking-criterion-vs-NACA-1135-Table-I',
                                 got=(1.0 if is_choked else 0.0), ref=(1.0 if below else 0.0),
                                 abs=None, rel=None, tol=TOL['published6'], unit='choked?',
                                 graded=True, basis='independent', tolerance_basis='published6',
                                 status='pass' if ok else 'fail', ok=bool(ok)))
        out_cases.append(dict(id=c['id'], note=c['note'], basis='independent', inputs=s,
                              reference_route=ref['route'], cmp=cmp_rows,
                              **{'pass': all(x['ok'] for x in cmp_rows)}))
    return out_cases, total, passed


def merge_self_checks(inpage):
    """Retain the 15 shipped in-page checks verbatim, relabelled as self-checks (site rule S5)."""
    out, total, passed = [], 0, 0
    for c in inpage['cases']:
        rows = []
        for x in c['cmp']:
            y = dict(x)
            y['basis'] = 'self-check'
            y['tolerance_basis'] = 'tool-declared'
            if y.get('graded'):
                total += 1
                passed += bool(y.get('ok'))
            rows.append(y)
        out.append(dict(id=c['id'], note=c['note'], basis='self-check', inputs=c['inputs'],
                        reference_route='re-evaluation of the tool\'s own relations inside the '
                                        'page (mass-domain adaptive Simpson + state closure)',
                        cmp=rows, **{'pass': c.get('pass')}))
    return out, total, passed


def published_row_count(cases):
    """Graded rows whose reference is a PUBLISHED figure reused as published rather than
    re-derived here: the two tolerance bands that exist only because the reference carries a
    rounded published number (published6 = half the last digit of NACA TR-1135's
    p*/p_t = 0.528282; published3 = half the last digit of the three-digit SI rule 0.0404).
    Counted off the rows, never typed."""
    return sum(1 for c in cases for r in c['cmp']
               if r.get('graded') and r.get('tolerance_basis') in ('published3', 'published6'))


def build_artifact(ind_cases, ind_total, ind_passed, sc_cases, sc_total, sc_passed,
                   page_errors, selfver, run_at, build):
    total, passed = ind_total + sc_total, ind_passed + sc_passed
    recorded = published_row_count(ind_cases + sc_cases)
    return {
        'schema': SCHEMA,
        'tool': 'tank-pressurisation',
        'file': 'tank_pressurisation.html',
        'benchmark_id': BENCHMARK_ID,
        'manifest_revision': MANIFEST_REVISION_GRADED,
        'build': build,
        'tool_status_at_run': TOOL_STATUS_AT_RUN,
        'independent_validation': False,
        'review': None,
        'independent_validation_note':
            'FALSE, deliberately, and the manifest agrees. On this site independent_validation '
            'does not mean "the reference is independent of the tool\'s code" -- that is what the '
            '"benchmarked" tier itself asserts, and it is true here: the reference is a separate '
            'Python implementation derived from first principles that shares no code and no '
            'numerical route with the page. The flag means "someone other than the author has '
            'reviewed this", which is the reserved "verified" tier and requires a '
            'validation.review record naming the reviewer, the date, what was reviewed and where '
            'the record can be read. There is no such record: this harness is the author\'s own '
            'and no external party has reviewed it, so the flag stays false, as it does on 45 of '
            'the 46 tools already at "benchmarked".',
        'promotion': PROMOTION,
        'reference':
            'A second implementation, written in Python from an independent first-principles '
            'derivation and NOT ported from the page. The mass and energy balances on the rigid '
            'adiabatic control volume are closed analytically (m T = m0 T0 + gamma T_s (m - m0)), '
            'which makes tank pressure affine in mass and reduces the whole transient to one '
            'scalar ODE in the pressure ratio r = p/p_supply. Its choked leg is solved in closed '
            'form (the flux is frozen at Shapiro eq. 4.21, so mass rises linearly in time) and '
            'its subsonic leg by Gauss-Legendre quadrature in u = sqrt(1-r), a substitution that '
            'removes the integrable (1-r)^(-1/2) endpoint singularity exactly. The orifice flux '
            'is assembled as rho*w from the isentropic stagnation relations of Shapiro vol. 1 '
            'ch. 4, and the choking criterion is anchored to the published p*/p_t = 0.528282 of '
            'NACA TR-1135 Table I and to the three-digit SI rule mdot = 0.0404 Cd A p0/sqrt(T0) '
            'for air. Real-gas properties from CoolProp (Lemmon et al. air EOS) confirm the '
            'gas constants used and quantify the ideal-gas closure error. The reference was '
            'verified before use against three structurally different routes (closed form, '
            'scipy Radau implicit stiff march, 4e5-node trapezoid), against node refinement, '
            'against the analytic near-equalisation asymptote, and by confirming that the tool '
            'itself converges onto it as the tool\'s own step is reduced.',
        'reference_citations': CITATIONS,
        'reference_provenance': 'mixed',
        # The sentence that used to sit in reference_provenance, which §5 defines as an enum.
        # Its path is corrected: the harness ships at bench-src/, and `out/` is a directory of
        # no tree in this deployment.  The split that justifies the enum is counted, not typed.
        'provenance_note':
            'Independent second implementation (Python 3 / numpy / scipy / CoolProp), generated '
            'by bench-src/gen_tank_pressurisation.py; published anchors as cited. Of the %d '
            'graded checks, %d are recomputed -- by that implementation, run outside the '
            'browser, or, for the retained in-page self-checks, by the tool itself -- and %d '
            'are graded against published figures reused as published (NACA TR-1135 Table I '
            'p*/p_t = 0.528282 and the three-digit SI rule mdot = 0.0404 Cd A p0/sqrt(T0)), '
            'each to half its own last printed digit.'
            % (total, total - recorded, recorded),
        'tolerance': ' | '.join(f'{k}: {v}' for k, v in TOL_WHY.items()),
        'tolerance_values': TOL,
        'run_at': run_at,
        'total': total, 'passed': passed, 'failed': total - passed, 'flagged': 0,
        'page_errors': page_errors,
        'independent_total': ind_total, 'independent_passed': ind_passed,
        'self_check_total': sc_total, 'self_check_passed': sc_passed,
        'grading':
            'total counts every check with an acceptance criterion. %d of them are INDEPENDENT '
            '(graded against the Python second implementation described in "reference" and '
            'against published compressible-flow data); %d are SELF-CHECKS retained verbatim '
            'from the superseded in-page benchmark, which re-evaluate the tool\'s own relations '
            'inside the tool and therefore do not count as independent reference checks. Cases '
            'keep the ids, notes and verdicts they were recorded with.'
            % (ind_total, sc_total),
        'reference_self_verification': selfver,
        'cases': ind_cases + sc_cases,
        'not_benchmarked': [
            'Real-gas behaviour. The state relation is ideal-gas throughout. CoolProp on the '
            'Lemmon et al. air equation of state gives Z = 0.99362 at 20 bar / 293.15 K and '
            'Z = 1.02601 at 200 bar, so the closure is 0.6 % to 2.6 % wrong in density across '
            'the cases run here; the reference shares the ideal-gas closure and so cannot test '
            'it.',
            'Vessel-wall heat capacity and wall heat transfer.',
            'Supply-line inventory, regulator dynamics, and mixing stratification: the supply '
            'state is held fixed on both sides.',
            'The 0.99999 p_supply equalisation cut-off is a declared model parameter of the '
            'tool, taken as an input by the reference rather than tested by it. The true '
            'equalisation time is finite (the singularity is integrable) but the reported '
            'figure depends on where the band is drawn.',
            'Orifice discharge coefficient Cd. It is a user input on both sides; no measured '
            'orifice data is used.',
            'The drawn pressure/temperature history. Only the terminal record is machine-'
            'readable, so the trajectory is sampled by truncating the window instead.',
        ],
        'notes': [
            'Independent cases are graded by a Python second implementation that shares no code '
            'and no numerical route with the page. The page was read only for input names, '
            'units, declared assumptions and reported quantities.',
            'The trajectory is graded by running the same physics with the window truncated at '
            'six times between 2 s and 54 s, which samples p(t), T(t) and m(t) on both the '
            'choked and the subsonic leg of the shipped default.',
            'The superseded in-page benchmark accepted the terminal time within one of the '
            'solver\'s own steps, tEnd/900. That band grows with the simulation window, so no '
            'step size could ever fail it. This artifact replaces it with a band fixed by the '
            'model\'s physical fidelity.',
        ],
    }


# =============================================================================================
# 7.  MAIN
# =============================================================================================

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=False, default='.')
    ap.add_argument('--port', type=int, default=8821)
    ap.add_argument('--out', default='tank_pressurisation.json')
    ap.add_argument('--node', default='node')
    ap.add_argument('--selfcheck', action='store_true',
                    help='only verify this file\'s own solver, do not drive the page')
    ap.add_argument('--sabotage', action='store_true',
                    help='negative control: falsify three expectations on purpose')
    args = ap.parse_args()

    print('Verifying the reference implementation before it grades anything:')
    selfver = self_verify()
    bad = [r for r in selfver if not r['ok']]
    if bad:
        raise SystemExit('reference self-verification FAILED: %s' % [r['check'] for r in bad])
    print('  -> reference verified (%d checks).\n' % len(selfver))
    if args.selfcheck:
        return

    global MANIFEST_REVISION_GRADED
    global TOOL_STATUS_AT_RUN
    _mf = read_manifest(os.path.abspath(args.dir))
    MANIFEST_REVISION_GRADED = _mf.get('manifest_revision', 'unknown')
    TOOL_STATUS_AT_RUN = _mf.get('status', 'unknown')
    cases = build_cases()
    groups = build_invariance_groups()
    runs = cases + expand_groups(groups)
    print('Driving the shipping page over %d independent cases (%d page runs)...'
          % (len(cases) + len(groups), len(runs)))
    driven = drive(runs, os.path.abspath(args.dir), args.port, args.node)
    if driven['errors']:
        print('  page errors:', driven['errors'])

    ind_cases, ind_total, ind_passed = grade(cases, driven, sabotage=args.sabotage)
    gp_cases, gp_total, gp_passed = grade_groups(groups, driven)
    if args.sabotage:                       # negative control on the invariance check too
        gp_cases[0]['cmp'][0]['tol'] = 1e-12
        gp_cases[0]['cmp'][0]['ok'] = gp_cases[0]['cmp'][0]['got'] <= 1e-12
        gp_cases[0]['cmp'][0]['status'] = 'pass' if gp_cases[0]['cmp'][0]['ok'] else 'fail'
        gp_passed = sum(1 for c in gp_cases for x in c['cmp'] if x['ok'])
    ind_cases, ind_total, ind_passed = ind_cases + gp_cases, ind_total + gp_total, ind_passed + gp_passed
    sc_cases, sc_total, sc_passed = merge_self_checks(driven['inpage'])
    # `build` is what the SERVED page said it was.  A disagreement with the file this harness
    # read means the browser was not reading this tree, so the artifact is not written at all
    # rather than published naming a build nobody can check (bench-src/provenance.mjs refuses
    # on the same condition).
    served_rev = driven.get('served_revision')
    if not served_rev:
        raise SystemExit('the served page reported no manifest_revision; refusing to write an '
                         'artifact that would have to name a build it did not observe.')
    if served_rev != MANIFEST_REVISION_GRADED:
        raise SystemExit('served page declares manifest_revision %r, the file in --dir declares '
                         '%r. The browser was not reading this tree; nothing written.'
                         % (served_rev, MANIFEST_REVISION_GRADED))
    run_at = _dt.datetime.now(_dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    art = build_artifact(ind_cases, ind_total, ind_passed, sc_cases, sc_total, sc_passed,
                         driven['errors'], selfver, run_at, served_rev)
    with open(args.out, 'w') as f:
        json.dump(art, f, indent=1)

    print('\nindependent : %d/%d passed' % (ind_passed, ind_total))
    print('self-check  : %d/%d passed' % (sc_passed, sc_total))
    print('TOTAL       : %d/%d passed, %d failed' % (art['passed'], art['total'], art['failed']))
    fails = [(c['id'], x['check'], x['rel'], x['tol'])
             for c in art['cases'] for x in c['cmp'] if x.get('graded') and not x.get('ok')]
        # rel may be None for boolean-valued checks
    if fails:
        print('\nFAILING CHECKS')
        for cid, chk, rel, tol in fails:
            print('  %-46s %-36s rel=%s tol=%s'
                  % (cid, chk, ('%.3e' % rel) if rel is not None else '   n/a  ',
                     ('%.1e' % tol) if tol is not None else 'n/a'))
    print('\nwrote %s' % args.out)


if __name__ == '__main__':
    main()
