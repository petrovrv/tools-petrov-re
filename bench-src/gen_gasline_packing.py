#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_gasline_packing.py — independent benchmark harness for tools.petrov.re/gasline_packing.html

WHAT THIS IS
    A second implementation of the lumped gas-line packing/depacking problem, written in
    Python from a first-principles derivation, used to grade the shipping page.  The page's
    JavaScript was read only for input names, units, declared assumptions, the declared
    model boundary (the 1e-9 kg empty-line floor) and the list of reported quantities.
    Nothing was transcribed: the governing relations below are derived in the docstrings
    from a mass balance on the control volume plus one-dimensional isentropic nozzle flow,
    and the numerical route is structurally different from the page's — the page marches
    an explicit RK4 in time, this reference integrates a QUADRATURE IN THE MASS DOMAIN
    (the system is autonomous and one-dimensional, so t(m) is an ordinary integral), with
    an implicit stiff solver (scipy Radau) and closed forms as cross-routes.

DERIVATION (see also the module docstrings on each function)
    Control volume: V = pi D^2 L / 4, held at the input temperature T (declared isothermal),
    ideal gas, so the state closure is  p = m R T / V.
    Mass balance:   dm/dt = mdot_in(p) - mdot_out  ==  f(m).
    Supply orifice: one-dimensional isentropic expansion from the stagnation state
    (p_s, T) to the throat static pressure p.  With  r = p/p_s,
        energy      c_p T_t = c_p T_th + w^2/2,      c_p = gamma R/(gamma-1)
        isentrope   T_th/T_t = r^((gamma-1)/gamma),  rho_th = rho_t r^(1/gamma)
        flux        G = rho_th w = p_s sqrt( 2 gamma / (R T (gamma-1)) )
                                   * sqrt( r^(2/gamma) - r^((gamma+1)/gamma) )
    Maximising G over r gives the critical ratio r* = (2/(gamma+1))^(gamma/(gamma-1))
    and, at and below it, the choked flux
        G* = p_s sqrt(gamma/(R T)) (2/(gamma+1))^((gamma+1)/(2(gamma-1))).
    Cited: A. H. Shapiro, "The Dynamics and Thermodynamics of Compressible Fluid Flow",
    vol. 1 (Ronald Press, 1953), ch. 4 -- eq. 4.14 (T_t/T), eq. 4.15 (p_t/p),
    eq. 4.18/4.19 (critical ratio), eq. 4.21 (mass flux); NACA Report 1135 (1953),
    Table I, isentropic column at M = 1: p/p_t = 0.528282, T/T_t = 0.833333,
    rho/rho_t = 0.633938 for gamma = 1.4.  Real-gas cross-checks via CoolProp 8.0
    (Lemmon et al. air EOS; Setzmann & Wagner methane EOS) against the ideal-gas limit.

    Because f is autonomous and one-dimensional, the exact trajectory is the quadrature
        t(m) = integral from m0 to m of  d(mu) / f(mu),
    which contains no time step at all.  That is the structural independence: the page's
    answer can only be as good as its partition, the reference's answer has no partition.

USAGE
    python3 gen_gasline_packing.py --dir <dir with the page + shared scripts> \
                                   --port 8822 --out gasline_packing.json
    python3 gen_gasline_packing.py --selfcheck      # verify the reference alone
    python3 gen_gasline_packing.py --sabotage       # negative control

Requires: numpy, scipy, CoolProp (pip install CoolProp), node with playwright.
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import threading

import numpy as np
from scipy.integrate import quad, solve_ivp
from scipy.optimize import brentq

# ---------------------------------------------------------------------------------------------
# 0.  Model constants taken from the page's DECLARED model boundary (not from its arithmetic).
# ---------------------------------------------------------------------------------------------

#: The page declares, in its own "empty-line limit" risk note, that the march stops at an
#: inventory of 1e-9 kg rather than at zero and reports the ideal-gas pressure of that
#: threshold mass.  That is a statement about the MODEL, not about the solver, so the
#: reference adopts the same floor; otherwise the two would be solving different problems.
M_FLOOR = 1e-9

TOOL_ID = 'gasline-packing'
PAGE = 'gasline_packing.html'


# ---------------------------------------------------------------------------------------------
# 1.  ORIFICE AND STATE RELATIONS  (derived above; implemented from the derivation)
# ---------------------------------------------------------------------------------------------

def critical_ratio(gamma):
    """r* = (2/(g+1))^(g/(g-1)).  Shapiro vol. 1 eq. 4.19; NACA TR-1135 Table I."""
    return (2.0 / (gamma + 1.0)) ** (gamma / (gamma - 1.0))


def flux_choked(p_s, T, gamma, R):
    """G* = p_s sqrt(g/(R T)) (2/(g+1))^((g+1)/(2(g-1))).  Shapiro eq. 4.21 at M = 1."""
    return p_s * math.sqrt(gamma / (R * T)) * (2.0 / (gamma + 1.0)) ** ((gamma + 1.0) / (2.0 * (gamma - 1.0)))


def flux_subsonic(p_s, T, gamma, R, r):
    """G = p_s sqrt(2g/(R T (g-1)) (r^(2/g) - r^((g+1)/g))).  Assembled as rho_th * w from
    the isentropic stagnation relations, i.e. Shapiro eq. 4.14/4.15 substituted into the
    energy equation -- not from a collected algebraic form."""
    if r >= 1.0:
        return 0.0
    if r <= 0.0:
        return flux_choked(p_s, T, gamma, R)
    z = r ** (2.0 / gamma) - r ** ((gamma + 1.0) / gamma)
    if z <= 0.0:
        return 0.0
    return p_s * math.sqrt(2.0 * gamma / (R * T * (gamma - 1.0)) * z)


def flux(p_s, T, gamma, R, p):
    """Mass flux through the supply orifice, both regimes.  Zero once the line pressure
    reaches or exceeds the supply pressure: the model declares no reverse flow."""
    if not (p_s > 0.0 and T > 0.0):
        return 0.0
    if p >= p_s:
        return 0.0
    r = max(0.0, p / p_s)
    return flux_choked(p_s, T, gamma, R) if r <= critical_ratio(gamma) else flux_subsonic(p_s, T, gamma, R, r)


def mdot_in_of_p(p, s):
    """Supply mass flow at line pressure p.  Cd A G."""
    if not (s['Ain'] > 0.0 and s['Cd'] > 0.0):
        return 0.0
    return s['Cd'] * s['Ain'] * flux(s['pSupply'], s['T'], s['gamma'], s['R'], p)


def volume(s):
    """V = pi D^2 L / 4."""
    return math.pi * s['D'] * s['D'] * s['L'] / 4.0


def m_of_p(p, s):
    """Ideal-gas, isothermal state closure m = p V / (R T)."""
    return p * volume(s) / (s['R'] * s['T'])


def p_of_m(m, s):
    """Inverse of the same closure."""
    return m * s['R'] * s['T'] / volume(s)


def f_of_m(m, s):
    """The governing right-hand side, dm/dt = mdot_in(p(m)) - mdot_out."""
    return mdot_in_of_p(p_of_m(m, s), s) - s['mdotOut']


def mdot_in_max(s):
    """Largest supply flow the orifice can ever deliver: the choked value, reached as p -> 0."""
    if not (s['Ain'] > 0.0 and s['Cd'] > 0.0 and s['pSupply'] > 0.0):
        return 0.0
    return s['Cd'] * s['Ain'] * flux_choked(s['pSupply'], s['T'], s['gamma'], s['R'])


def p_equilibrium(s):
    """Line pressure at which the orifice delivers exactly the withdrawal.

    mdot_in(p) is continuous and strictly decreasing on (0, p_s) -- the choked branch is
    flat on [0, r* p_s] and the subsonic branch falls monotonically to zero at p = p_s --
    so the root is unique when it exists.  It exists iff mdot_out <= mdot_in_max.
    Returned as an algebraic root (Brent on the flux relation), with no time integration.
    """
    qmax = mdot_in_max(s)
    if s['mdotOut'] > qmax:
        return None                      # the line can never hold; it depacks to the floor
    if s['mdotOut'] <= 0.0:
        return s['pSupply']              # only p = p_s makes the inflow vanish
    rc = critical_ratio(s['gamma'])
    p_c = rc * s['pSupply']
    if s['mdotOut'] >= mdot_in_of_p(p_c, s):
        # on the flat choked branch the equation has no isolated root below p_c; the
        # balance is met exactly at (or below) the choke point.
        return p_c if abs(s['mdotOut'] - qmax) < 1e-15 * max(qmax, 1e-30) else p_c
    g = lambda p: mdot_in_of_p(p, s) - s['mdotOut']
    lo, hi = p_c, s['pSupply'] * (1.0 - 1e-15)
    if g(lo) <= 0.0:
        return p_c
    return brentq(g, lo, hi, xtol=1e-15, rtol=8.9e-16, maxiter=400)


def m_equilibrium(s):
    pe = p_equilibrium(s)
    return None if pe is None else m_of_p(pe, s)


# ---------------------------------------------------------------------------------------------
# 2.  THE INDEPENDENT TRAJECTORY:  A QUADRATURE IN THE MASS DOMAIN
# ---------------------------------------------------------------------------------------------
#
# dm/dt = f(m) is autonomous and one-dimensional, so along any interval on which f keeps its
# sign the trajectory is the ordinary integral
#
#       t(m) = INTEGRAL_{m0}^{m}  d(mu) / f(mu),
#
# an expression that contains no time step whatsoever.  Two things then have to be handled:
#
#  * f has a simple zero at the equilibrium inventory m_eq when one exists.  The integrand
#    then behaves as 1/(lambda (m - m_eq)) and t diverges logarithmically: equilibrium is
#    approached but never reached.  Substituting m = m_eq + (m0 - m_eq) e^{-w} turns that
#    into a bounded, analytic integrand in w (dt/dw -> 1/|lambda|), so a fixed ladder of
#    unit-width panels integrates the whole approach to round-off.
#  * When mdot_out = 0 the equilibrium sits at p = p_s, where mdot_in vanishes like
#    sqrt(1 - r); there f ~ C sqrt(m_eq - m) and the SAME substitution gives
#    dt/dw ~ e^{-w/2}, which is integrable to infinity -- equilibrium in finite time.
#    One substitution therefore covers both approach laws without a special case.
#
# Breakpoints are placed where the right-hand side loses smoothness: at the choke transition
# p = r* p_s (where the two flux branches meet with matching value and zero slope, so the
# integrand is C1 but not C2) and at p = p_s (where mdot_in reaches zero).

W_MAX = 745.0          # e^{-745} is the smallest normal double; beyond it m == m_eq exactly
_QK = dict(limit=500, epsabs=0.0, epsrel=1e-13)


def _breakpoint_masses(s):
    """Masses at which f loses smoothness: the choke transition and the supply pressure."""
    out = []
    if s['pSupply'] > 0 and s['Ain'] > 0 and s['Cd'] > 0:
        out.append(m_of_p(critical_ratio(s['gamma']) * s['pSupply'], s))
        out.append(m_of_p(s['pSupply'], s))
    return out


def _quad_dm(a, b, s):
    """Integral of dm/f over [a, b] with the non-smooth masses inserted as panel edges."""
    pts = sorted(x for x in _breakpoint_masses(s) if min(a, b) < x < max(a, b))
    lo, hi = (a, b) if a <= b else (b, a)
    sign = 1.0 if a <= b else -1.0
    edges = [lo] + pts + [hi]
    tot = 0.0
    for u, v in zip(edges[:-1], edges[1:]):
        if v > u:
            tot += quad(lambda mu: 1.0 / f_of_m(mu, s), u, v, **_QK)[0]
    return sign * tot


def _panel_edges(w_a, w_b, m0, m_eq, s):
    """Panel edges inside [w_a, w_b]: unit steps plus the images of the breakpoint masses."""
    edges = {w_a, w_b}
    k = math.ceil(w_a)
    while k < w_b:
        edges.add(float(k)); k += 1
    span = m0 - m_eq
    if span != 0.0:
        for mb in _breakpoint_masses(s):
            q = (mb - m_eq) / span
            if 0.0 < q < 1.0:
                w = -math.log(q)
                if w_a < w < w_b:
                    edges.add(w)
    return sorted(edges)


def _dt_over_panel(w_a, w_b, m0, m_eq, s):
    """Elapsed time accumulated while w runs from w_a to w_b on the approach to m_eq."""
    span = m0 - m_eq

    def integrand(w):
        fv = f_of_m(m_eq + span * math.exp(-w), s)
        return 0.0 if fv == 0.0 else -span * math.exp(-w) / fv

    tot = 0.0
    edges = _panel_edges(w_a, w_b, m0, m_eq, s)
    for a, b in zip(edges[:-1], edges[1:]):
        if b > a:
            tot += quad(integrand, a, b, **_QK)[0]
    return tot


def _m_at_time_equilibrium(t_end, m0, m_eq, s):
    """Invert the w-quadrature: the inventory reached at t_end on the approach to m_eq.

    The ladder is walked once, accumulating elapsed time panel by panel, so the cost is
    linear in the number of panels rather than quadratic.  Two exits: the target time falls
    inside a panel (root-solve inside it), or the span underflows, in which case the
    equilibrium has been reached to double precision and m = m_eq is the exact answer.
    """
    span = m0 - m_eq
    if span == 0.0:
        return m_eq, t_end, True
    w, t, step = 0.0, 0.0, 1.0
    while w < W_MAX:
        w_next = min(W_MAX, w + step)
        dt = _dt_over_panel(w, w_next, m0, m_eq, s)
        if t + dt >= t_end:
            base, w0 = t, w
            g = lambda ww: base + _dt_over_panel(w0, ww, m0, m_eq, s) - t_end
            ws = brentq(g, w, w_next, xtol=1e-13, rtol=8.9e-16, maxiter=200)
            return m_eq + span * math.exp(-ws), t_end, False
        t, w = t + dt, w_next
        step = min(step * 1.7, 48.0)
    # the span has underflowed: the equilibrium has been reached to double precision and the
    # march simply continues to the end of the window.
    return m_eq, t_end, True


def reference(s, t_end=None):
    """Independent solution of the declared model.

    Returns the reported quantities of the page, computed by mass-domain quadrature.
    `elapsed` is the terminal instant: the empty-line event when it occurs inside the
    window, otherwise the window itself.
    """
    t_end = s['tEnd'] if t_end is None else t_end
    V = volume(s)
    m0 = m_of_p(s['p0'], s)
    m_eq = m_equilibrium(s)
    f0 = f_of_m(m0, s)

    emptied = False
    if m0 <= M_FLOOR:
        m_end, t_term = M_FLOOR, 0.0
        emptied = True
    elif f0 == 0.0:
        m_end, t_term = m0, t_end                       # already balanced; nothing moves
    elif m_eq is None or (f0 < 0.0 and m_eq is not None and m_eq <= M_FLOOR):
        # No pressure at which the inlet can meet the withdrawal: the line empties.
        t_empty = _quad_dm(m0, M_FLOOR, s)
        if t_empty <= t_end:
            m_end, t_term, emptied = M_FLOOR, t_empty, True
        else:
            g = lambda m: _quad_dm(m0, m, s) - t_end
            m_end = brentq(g, M_FLOOR, m0, xtol=1e-300, rtol=8.9e-16, maxiter=300)
            t_term = t_end
    else:
        m_end, t_term, _ = _m_at_time_equilibrium(t_end, m0, m_eq, s)

    p_end = p_of_m(m_end, s)
    p_min = min(s['p0'], p_end)                         # monotone trajectory: peak at an end
    return {
        'V': V, 'm0': m0, 'm_eq': m_eq, 'p_eq': (None if m_eq is None else p_of_m(m_eq, s)),
        'p_final': p_end, 'rho_final': m_end / V, 'inventory_final': m_end,
        'inventory_change': m_end - m0,
        'mdot_in_final': mdot_in_of_p(p_end, s),
        'mdot_in_peak': mdot_in_of_p(p_min, s),
        'elapsed': t_term, 'emptied': emptied,
        'mdot_in_max': mdot_in_max(s), 'choked_final': p_end <= critical_ratio(s['gamma']) * s['pSupply'],
    }


# ---------------------------------------------------------------------------------------------
# 3.  CROSS-ROUTES USED ONLY TO VERIFY THE REFERENCE ITSELF
# ---------------------------------------------------------------------------------------------

def reference_radau(s, t_end=None, rtol=1e-12):
    """Second route: implicit stiff time march (scipy Radau, 5th-order collocation) with a
    terminal event at the empty-line floor.  Structurally different from both the page's
    explicit RK4 and from the quadrature above."""
    t_end = s['tEnd'] if t_end is None else t_end
    m0 = m_of_p(s['p0'], s)

    def rhs(t, y):
        return [f_of_m(max(y[0], 0.0), s)]

    def ev(t, y):
        return y[0] - M_FLOOR
    ev.terminal = True
    ev.direction = -1.0

    sol = solve_ivp(rhs, (0.0, t_end), [m0], method='Radau', events=ev,
                    rtol=rtol, atol=max(1e-14 * m0, 1e-18), dense_output=False, max_step=np.inf)
    if sol.t_events[0].size:
        return M_FLOOR, float(sol.t_events[0][0])
    return float(sol.y[0][-1]), t_end


def reference_closed_form_choked(s):
    """Third route, exact where the physics admits it: while the line pressure stays at or
    below r* p_s the inflow is the constant choked value, so dm/dt is a constant and the
    inventory is exactly linear in time.  Returns the emptying instant, or None when the
    trajectory is not choked throughout."""
    rc_p = critical_ratio(s['gamma']) * s['pSupply']
    if s['p0'] > rc_p:
        return None
    rate = mdot_in_max(s) - s['mdotOut']
    if rate >= 0.0:
        return None
    m0 = m_of_p(s['p0'], s)
    return (m0 - M_FLOOR) / (-rate)


# ---------------------------------------------------------------------------------------------
# 4.  VERIFYING THE REFERENCE BEFORE IT IS ALLOWED TO GRADE ANYTHING
# ---------------------------------------------------------------------------------------------
#
# Published anchors, analytic limits derived separately from the solver, convergence under
# refinement, and agreement between three structurally different routes.  The harness refuses
# to grade the page if any of these fails.

#: Values read off NACA Report 1135 (Ames Research Staff, 1953), Table I, isentropic
#: relations at M = 1 for gamma = 1.4, as printed to six decimals.
NACA_1135_M1 = {'p_over_pt': 0.528282, 'T_over_Tt': 0.833333, 'rho_over_rhot': 0.633938}
#: Half the last printed digit of each, as a relative band.
NACA_TOL = {'p_over_pt': 5e-7 / 0.528282, 'T_over_Tt': 5e-7 / 0.833333,
            'rho_over_rhot': 5e-7 / 0.633938}

#: The three-significant-digit engineering form of the choked-orifice law for air,
#: mdot = 0.0404 Cd A p_t / sqrt(T) (ISO 6358 / Perry's Chemical Engineers' Handbook);
#: half its last digit is 5e-5 on 0.0404.
SI_CHOKED_CONSTANT = 0.0404
SI_CHOKED_TOL = 5e-5 / 0.0404


def self_verify(verbose=True):
    rows, bad = [], 0

    def chk(name, got, ref, tol, how, unit='-'):
        nonlocal bad
        den = max(abs(ref), 1e-300)
        rel = abs(got - ref) / den
        ok = rel <= tol
        if not ok:
            bad += 1
        rows.append({'check': name, 'got': got, 'ref': ref, 'rel': rel, 'tol': tol,
                     'unit': unit, 'basis': how, 'ok': ok})
        if verbose:
            print(('  ok  ' if ok else '  FAIL') + ' %-44s rel %.3e  tol %.1e  %s'
                  % (name, rel, tol, how))
        return ok

    # ---- (a) published anchors -------------------------------------------------------------
    g = 1.4
    chk('naca1135-critical-pressure-ratio', critical_ratio(g), NACA_1135_M1['p_over_pt'],
        NACA_TOL['p_over_pt'], 'NACA TR-1135 Table I, isentropic column at M = 1, gamma = 1.4')
    chk('naca1135-critical-temperature-ratio', 1.0 / (1.0 + (g - 1.0) / 2.0),
        NACA_1135_M1['T_over_Tt'], NACA_TOL['T_over_Tt'],
        'NACA TR-1135 Table I; Shapiro vol. 1 eq. 4.14 at M = 1')
    chk('naca1135-critical-density-ratio', (1.0 / (1.0 + (g - 1.0) / 2.0)) ** (1.0 / (g - 1.0)),
        NACA_1135_M1['rho_over_rhot'], NACA_TOL['rho_over_rhot'],
        'NACA TR-1135 Table I; Shapiro vol. 1 eq. 4.15 at M = 1')
    R_air = 287.05
    chk('si-three-digit-choked-constant',
        math.sqrt(g / R_air) * (2.0 / (g + 1.0)) ** ((g + 1.0) / (2.0 * (g - 1.0))),
        SI_CHOKED_CONSTANT, SI_CHOKED_TOL,
        'mdot = 0.0404 Cd A p_t / sqrt(T) for air, ISO 6358 / Perry 8th ed. eq. 10-25')

    # ---- (b) internal consistency of the two flux branches ---------------------------------
    for gg, RR, TT, ps in ((1.3, 500.0, 288.15, 6e6), (1.4, 287.05, 300.0, 2e5), (1.66, 2077.0, 400.0, 2.2e6)):
        rc = critical_ratio(gg)
        chk('flux-branches-meet-at-r-star-g%.2f' % gg,
            flux_subsonic(ps, TT, gg, RR, rc * (1 - 1e-13)), flux_choked(ps, TT, gg, RR), 1e-11,
            'the subsonic branch evaluated at r* must equal the choked branch (Shapiro eq. 4.21)')
        # r* is where dG/dr vanishes: central difference of the subsonic branch
        h = 1e-6
        d = (flux_subsonic(ps, TT, gg, RR, rc + h) - flux_subsonic(ps, TT, gg, RR, rc - h)) / (2 * h)
        chk('flux-stationary-at-r-star-g%.2f' % gg, 1.0 + d / flux_choked(ps, TT, gg, RR), 1.0, 2e-6,
            'r* is defined by dG/dr = 0; central difference must vanish (Shapiro eq. 4.18)')

    # ---- (c) real-gas context for the model, via CoolProp -----------------------------------
    try:
        from CoolProp.CoolProp import PropsSI
        Ru = PropsSI('GAS_CONSTANT', 'Air')
        R_ml = Ru / PropsSI('M', 'Air')
        chk('coolprop-air-gas-constant', R_ml, 287.0528, 5e-5,
            'R = R_u/M from CoolProp 8.0 (Lemmon et al. air EOS) against the tabulated '
            '287.0528 J/(kg K) for dry air; band is half the last printed digit')
        rho = PropsSI('D', 'P', 1e2, 'T', 288.15, 'Air')
        chk('coolprop-air-ideal-gas-limit', rho, 1e2 / (R_ml * 288.15), 1e-6,
            'at 100 Pa the real-gas density must collapse onto p/(R T) (ideal-gas limit)')
        z_ch4 = 6e6 / (PropsSI('D', 'P', 6e6, 'T', 288.15, 'Methane')
                       * (Ru / PropsSI('M', 'Methane')) * 288.15)
        rows.append({'check': 'coolprop-model-fidelity-context', 'got': z_ch4, 'ref': 1.0,
                     'rel': abs(1 - z_ch4), 'tol': None, 'unit': '-', 'ok': True,
                     'basis': 'context only: Z = %.4f for methane at 6 MPa / 288.15 K, so the '
                              'ideal-gas closure the tool declares is %.1f%% off in density at '
                              'its own default supply pressure. This sizes how much '
                              'discretisation error is defensible; it is not a pass/fail check.'
                              % (z_ch4, 100 * (1 / z_ch4 - 1))})
        if verbose:
            print('  note  ideal-gas closure is %.2f%% off in density at the default 60 bar '
                  '(CoolProp methane, Z = %.4f)' % (100 * (1 / z_ch4 - 1), z_ch4))
    except Exception as exc:                                            # pragma: no cover
        if verbose:
            print('  note  CoolProp unavailable (%s); real-gas anchors skipped' % exc)

    # ---- (d) analytic limits derived separately from the quadrature --------------------------
    zi = {'D': 0.6, 'L': 2000, 'p0': 4e6, 'T': 288.15, 'pSupply': 6e6, 'Ain': 0.0,
          'Cd': 0.8, 'mdotOut': 8.0, 'gamma': 1.3, 'R': 500.0, 'tEnd': 3600.0}
    r = reference(zi)
    chk('analytic-zero-inlet-emptying-instant', r['elapsed'],
        (m_of_p(zi['p0'], zi) - M_FLOOR) / zi['mdotOut'], 1e-13,
        'with A = 0 the orifice delivers nothing, dm/dt = -mdot_out is a constant and the '
        'emptying instant is (m0 - m_floor)/mdot_out exactly')

    ch = {'D': 0.3, 'L': 500, 'p0': 1e6, 'T': 288.15, 'pSupply': 8e6, 'Ain': 1e-4,
          'Cd': 0.8, 'mdotOut': 3.0, 'gamma': 1.3, 'R': 500.0, 'tEnd': 1e6}
    cf = reference_closed_form_choked(ch)
    chk('closed-form-fully-choked-emptying', reference(ch)['elapsed'], cf, 1e-13,
        'while p <= r* p_s the inflow is the constant choked value, so the inventory is '
        'exactly linear in time: t = (m0 - m_floor)/(mdot_out - Cd A G*)')

    # ---- (e) three routes on one nonlinear case ---------------------------------------------
    hard = {'D': 0.6, 'L': 2000, 'p0': 5.9e6, 'T': 288.15, 'pSupply': 6e6, 'Ain': 3e-4,
            'Cd': 0.8, 'mdotOut': 3.0, 'gamma': 1.3, 'R': 500.0, 'tEnd': 1e6}
    q = reference(hard)['elapsed']
    _, tr = reference_radau(hard)
    chk('quadrature-vs-radau-emptying', q, tr, 1e-9,
        'mass-domain quadrature against an implicit stiff time march (scipy Radau, rtol 1e-12)')

    pk = {'D': 0.6, 'L': 2000, 'p0': 4e6, 'T': 288.15, 'pSupply': 6e6, 'Ain': 3e-4,
          'Cd': 0.8, 'mdotOut': 2.0, 'gamma': 1.3, 'R': 500.0, 'tEnd': 1800.0}
    mq = reference(pk)['inventory_final']
    mr, _ = reference_radau(pk)
    chk('quadrature-vs-radau-horizon-state', mq, mr, 1e-9,
        'same two routes on a packing case stopped at the window instead of at an event')

    # ---- (f) convergence of the quadrature under node refinement ----------------------------
    global _QK
    saved = dict(_QK)
    try:
        _QK = dict(limit=800, epsabs=0.0, epsrel=1e-11)
        coarse = reference(hard)['elapsed']
    finally:
        _QK = saved
    chk('quadrature-node-refinement', coarse, q, 1e-10,
        'loosening the quadrature to epsrel 1e-11 must not move the answer by more than the '
        'band claimed for it: the integral, not a step, sets the accuracy')

    # ---- (g) equilibrium root residual and the exponential approach law ---------------------
    pe = p_equilibrium(pk)
    chk('equilibrium-root-residual', mdot_in_of_p(pe, pk), pk['mdotOut'], 1e-13,
        'p_eq solves mdot_in(p) = mdot_out; the residual is an algebraic identity')
    m_eq = m_of_p(pe, pk)
    lam = (f_of_m(m_eq * (1 + 1e-7), pk) - f_of_m(m_eq * (1 - 1e-7), pk)) / (2e-7 * m_eq)
    tau_r = 1.0 / abs(lam)
    t1, t2 = 12.0 * tau_r, 16.0 * tau_r
    d1 = abs(reference(pk, t_end=t1)['inventory_final'] - m_eq)
    d2 = abs(reference(pk, t_end=t2)['inventory_final'] - m_eq)
    chk('exponential-approach-to-equilibrium', math.log(d1 / d2) / (t2 - t1), -lam, 3e-6,
        'near m_eq the residual must decay as exp(lambda t) with lambda = f\'(m_eq) taken by '
        'finite difference; this is a property of the ODE, not of any integrator')

    # ---- (h) physical bound the model cannot violate ----------------------------------------
    rng = np.random.default_rng(20260912)
    worst, worst_s = 0.0, None
    for _ in range(120):
        s = {'D': float(10 ** rng.uniform(-1.5, 0.4)), 'L': float(10 ** rng.uniform(0.5, 4.0)),
             'p0': float(10 ** rng.uniform(4.5, 7.0)), 'T': float(rng.uniform(200, 600)),
             'pSupply': float(10 ** rng.uniform(4.5, 7.0)), 'Ain': float(10 ** rng.uniform(-6, -2)),
             'Cd': float(rng.uniform(0.4, 1.0)), 'mdotOut': float(10 ** rng.uniform(-2, 1.2)),
             'gamma': float(rng.uniform(1.1, 1.7)), 'R': float(rng.uniform(100, 2100)),
             'tEnd': float(10 ** rng.uniform(0, 5))}
        rr = reference(s)
        over = rr['p_final'] / max(s['p0'], s['pSupply']) - 1.0
        if over > worst:
            worst, worst_s = over, s
    chk('reference-never-exceeds-the-driving-pressure', 1.0 + worst, 1.0, 1e-12,
        'with no reverse flow and no heat input the line pressure can never rise above '
        'max(p0, p_supply); checked over 120 pseudo-random legal input sets')

    if verbose:
        print('\nreference self-verification: %d checks, %d failed' % (len(rows), bad))
    return rows, bad


# ---------------------------------------------------------------------------------------------
# 5.  TOLERANCES  (chosen from the physics and from what the page prints, never from the tool)
# ---------------------------------------------------------------------------------------------
#
# TOL_EXACT   both sides are closed-form arithmetic on the same numbers, so the only admissible
#             difference is double-precision round-off through a handful of operations.
# TOL_MARCH   the page's answer comes from a time march, the reference's from a quadrature that
#             has no time step at all.  1e-5 relative is at least two orders inside what the
#             page prints (line pressures to 0.01 bar, ~2.5e-4 relative at its own default) and
#             roughly four orders inside the fidelity of the declared model itself: the
#             isothermal IDEAL-GAS closure is 12.6 % out in density for methane at the tool's
#             own 60 bar default supply (CoolProp 8.0, Z = 0.8880).  Neither of those numbers
#             can move when the stepper changes, which is the whole point.
# TOL_INVAR   the terminal answer of a case is a property of the line, the gas and the two
#             boundary flows.  The display horizon is not one of them, so the only admissible
#             spread across horizons is residual discretisation noise.  This is an invariance
#             the physics demands exactly; no step size can satisfy it by being generous.
# TOL_BOUND   with no reverse flow through the supply valve and no heat input, the line
#             pressure can never exceed max(p0, p_supply).  A hard physical bound; the slack is
#             round-off only.
TOL_EXACT = 1e-12
TOL_MARCH = 1e-5
TOL_INVAR = 1e-6
TOL_BOUND = 1e-12

TOL_BASIS = {
    'exact': 'closed-form arithmetic on both sides; double-precision round-off only',
    'march': 'the page marches in time, the reference integrates a quadrature in the mass '
             'domain that contains no time step. 1e-5 relative is two orders inside the '
             'precision the page prints and four orders inside the 12.6 % density error the '
             'declared ideal-gas closure itself carries at the tool\'s default 60 bar supply '
             '(CoolProp 8.0 methane, Z = 0.8880)',
    'invariance': 'the terminal answer is a property of the line, the gas and the two boundary '
                  'flows; the simulated-time window is not one of them, so the admissible '
                  'spread across windows is residual discretisation noise only',
    'bound': 'hard physical bound: with no reverse flow and no heat input the line pressure '
             'can never exceed max(p0, p_supply); slack is round-off',
}

DEFAULT = {'D': 0.6, 'L': 2000.0, 'p0': 4e6, 'T': 288.15, 'pSupply': 6e6, 'Ain': 3e-4,
           'Cd': 0.8, 'mdotOut': 2.0, 'gamma': 1.3, 'R': 500.0, 'tEnd': 1800.0}

AIR = {'gamma': 1.4, 'R': 287.05}
HELIUM = {'gamma': 1.66, 'R': 2077.0}
METHANE = {'gamma': 1.3, 'R': 500.0}
CO2 = {'gamma': 1.289, 'R': 188.92}


def case(cid, note, basis=None, **over):
    s = dict(DEFAULT)
    s.update(over)
    return {'id': cid, 'note': note, 'basis': basis or note, 'inputs': s}


def build_cases():
    """Single-run cases: the shipped scenarios, both regimes, the choked/unchoked transition,
    each declared input boundary, four gases, and the fast-relaxation corner."""
    C = []
    # ---- the five scenarios the superseded in-page benchmark covered ------------------------
    C += [
        case('ind-shipped-default', 'Shipped default: 600 mm / 2000 m at 40 bar from 60 bar '
             'through 300 mm2, 2 kg/s drawn', 'packing toward an equilibrium, stopped at the window'),
        case('ind-shipped-depack-empty', 'Withdrawal 12 kg/s; the segment empties inside the window',
             'empty-line event well inside the window', mdotOut=12.0, tEnd=3600.0),
        case('ind-shipped-zero-inlet', 'Inlet area zero: pure linear depacking',
             'dm/dt is an exact constant; the march must return a straight line',
             Ain=0.0, mdotOut=8.0, tEnd=3600.0),
        case('ind-shipped-choked-small-line', '300 mm / 500 m at 10 bar from 80 bar through 100 mm2',
             'starts choked, crosses the choke transition while packing',
             D=0.3, L=500.0, p0=1e6, pSupply=8e6, Ain=1e-4, mdotOut=0.5, tEnd=3600.0),
        case('ind-shipped-no-equilibrium', 'Withdrawal 3.4 kg/s above the choked inlet capacity',
             'no equilibrium pressure exists; depacks throughout', mdotOut=3.4, tEnd=7200.0),
    ]
    # ---- regimes ---------------------------------------------------------------------------
    C += [
        case('ind-choked-throughout-empty', 'Line at 20 bar from 80 bar, withdrawal beyond the '
             'choked capacity: the trajectory never leaves the choked branch',
             p0=2e6, pSupply=8e6, Ain=5e-5, mdotOut=2.0, tEnd=2e4),
        case('ind-subcritical-throughout', 'Line at 50 bar from 60 bar: r stays above r* the '
             'whole way, so the subsonic branch governs throughout',
             p0=5e6, mdotOut=1.5, tEnd=3600.0),
        case('ind-choke-transition-while-packing', 'Starts choked at 25 bar, packs through the '
             'choke transition at r* p_s = 32.7 bar', p0=2.5e6, Ain=6e-4, mdotOut=2.0, tEnd=1200.0),
        case('ind-choke-transition-while-depacking', 'Starts subcritical at 55 bar and empties '
             'through the choke transition', p0=5.5e6, mdotOut=2.6, tEnd=3e5),
        case('ind-supply-below-line', 'Line above the supply: the orifice delivers nothing until '
             'the line falls below p_s', p0=7e6, pSupply=5e6, mdotOut=2.0, tEnd=3000.0),
        case('ind-supply-equals-line', 'Line exactly at the supply pressure: inflow starts at zero',
             p0=6e6, mdotOut=1.0, tEnd=3000.0),
        case('ind-no-withdrawal', 'Withdrawal zero: the line packs to the supply pressure, where '
             'the inflow vanishes like sqrt(1 - r) and equilibrium is reached in finite time',
             mdotOut=0.0, tEnd=3000.0),
        case('ind-static-line', 'No inlet area and no withdrawal: nothing moves',
             Ain=0.0, mdotOut=0.0, tEnd=3600.0),
        case('ind-withdrawal-just-below-capacity', 'Withdrawal 2.50 kg/s against a 2.53 kg/s '
             'choked capacity: a very slow approach to a nearly choked equilibrium',
             mdotOut=2.5, tEnd=2e5),
        case('ind-withdrawal-just-above-capacity', 'Withdrawal 2.55 kg/s just above the 2.53 kg/s '
             'choked capacity: the slowest possible emptying', mdotOut=2.55, tEnd=1e6),
        case('ind-near-supply-start-empties', 'Starts at 59 bar of a 60 bar supply and empties; '
             'the inlet flow varies fivefold along the way', p0=5.9e6, mdotOut=3.0, tEnd=1e5),
    ]
    # ---- gases -----------------------------------------------------------------------------
    C += [
        case('ind-gas-air-packing', 'Dry air, gamma 1.4, R 287.05', 'second gas, packing',
             tEnd=2400.0, **AIR),
        case('ind-gas-air-empty', 'Dry air emptying to the floor', 'second gas, terminal event',
             mdotOut=6.0, tEnd=1e4, **AIR),
        case('ind-gas-helium', 'Helium, gamma 1.66, R 2077, 200 mm / 100 m at 400 K',
             'monatomic gas at the top of the declared gamma range',
             D=0.2, L=100.0, T=400.0, p0=2e6, pSupply=2.2e6, Ain=5e-5, Cd=0.9,
             mdotOut=0.2, tEnd=600.0, **HELIUM),
        case('ind-gas-co2', 'Carbon dioxide, gamma 1.289, R 188.92', 'heavy gas, low R',
             mdotOut=1.0, tEnd=3600.0, **CO2),
    ]
    # ---- each declared input boundary --------------------------------------------------------
    C += [
        case('ind-bound-D-min', 'Diameter at the declared minimum, 10 mm', 'input boundary',
             D=0.01, L=100.0, Ain=1e-6, mdotOut=0.002, tEnd=600.0),
        case('ind-bound-D-max', 'Diameter at the declared maximum, 5 m', 'input boundary',
             D=5.0, Ain=1e-2, mdotOut=60.0, tEnd=3600.0),
        case('ind-bound-L-min', 'Length at the declared minimum, 0.1 m', 'input boundary',
             L=0.1, Ain=1e-6, mdotOut=0.002, tEnd=60.0),
        case('ind-bound-L-max', 'Length at the declared maximum, 1000 km', 'input boundary',
             L=1e6, Ain=0.05, mdotOut=400.0, tEnd=1e5),
        case('ind-bound-T-min', 'Temperature at the declared minimum, 150 K', 'input boundary',
             T=150.0, mdotOut=2.0, tEnd=1800.0),
        case('ind-bound-T-max', 'Temperature at the declared maximum, 1500 K', 'input boundary',
             T=1500.0, mdotOut=0.8, tEnd=1800.0),
        case('ind-bound-gamma-min', 'Heat-capacity ratio at the declared minimum, 1.01',
             'input boundary; the subsonic branch is nearly singular there',
             gamma=1.01, mdotOut=1.5, tEnd=1800.0),
        case('ind-bound-gamma-max', 'Heat-capacity ratio at the declared maximum, 1.8',
             'input boundary', gamma=1.8, mdotOut=2.0, tEnd=1800.0),
        case('ind-bound-R-min', 'Specific gas constant at the declared minimum, 50 J/(kg K)',
             'input boundary', R=50.0, mdotOut=6.0, tEnd=3600.0),
        case('ind-bound-R-max', 'Specific gas constant at the declared maximum, 2000 J/(kg K)',
             'input boundary', R=2000.0, mdotOut=0.5, tEnd=3600.0),
        case('ind-bound-Cd-min', 'Discharge coefficient at the declared minimum, 0.05',
             'input boundary', Cd=0.05, mdotOut=0.1, tEnd=7200.0),
        case('ind-bound-Cd-max', 'Discharge coefficient at the declared maximum, 1.2',
             'input boundary', Cd=1.2, mdotOut=3.0, tEnd=3600.0),
        case('ind-bound-p-low', 'Line and supply near the declared minimum pressure',
             'input boundary', p0=1e3, pSupply=1e4, Ain=1e-3, mdotOut=0.001, tEnd=600.0),
        case('ind-bound-p-high', 'Supply at the declared maximum, 1000 bar',
             'input boundary', p0=1e7, pSupply=1e8, Ain=1e-5, mdotOut=1.0, tEnd=3600.0),
        case('ind-bound-tEnd-min', 'Window at the declared minimum, 0.01 s',
             'input boundary; the transient has barely begun', tEnd=0.01),
        case('ind-bound-tEnd-max', 'Window at the declared maximum, 1e7 s, on a case that '
             'empties long before it', 'input boundary at the far end of the window range',
             mdotOut=12.0, tEnd=1e7),
    ]
    # ---- the fast-relaxation corner: a small line behind a large orifice ---------------------
    C += [
        case('ind-fast-relax-short-window', '50 mm / 10 m line behind a 1000 mm2 orifice; the '
             'relaxation time is about 0.5 ms', 'stiff corner, window shorter than a second',
             D=0.05, L=10.0, p0=1e6, Ain=1e-3, mdotOut=0.1, tEnd=1.0),
        case('ind-fast-relax-long-window', 'The same stiff line read after 10 000 s, by which '
             'time it has been at equilibrium for essentially the whole window',
             'stiff corner with a window 2e7 relaxation times long',
             D=0.05, L=10.0, p0=1e6, Ain=1e-3, mdotOut=0.1, tEnd=1e4),
        case('ind-fast-relax-vast-window', 'The same stiff line read at the maximum window',
             'stiff corner at the declared maximum window',
             D=0.05, L=10.0, p0=1e6, Ain=1e-3, mdotOut=0.1, tEnd=1e7),
        case('ind-large-orifice-fast-pack', '600 mm / 2000 m line behind a 0.05 m2 orifice',
             'a second stiff corner, on the shipped geometry', Ain=0.05, mdotOut=2.0, tEnd=1e6),
    ]
    return C


# ---- the case family that could not fail before ----------------------------------------------
#
# One physics, many display horizons.  Every horizon is longer than the transient it contains,
# so the terminal answer must be the SAME NUMBER every time.  The band is an invariance the
# physics demands exactly, not a step size, which is what makes it a test no stepper can pass
# by being generous.

def build_invariance_groups():
    G = []
    G.append({'id': 'ind-invariance-empty-shipped',
              'note': 'Shipped depacking case read at windows from 1.03x to 6000x the emptying '
                      'instant; the emptying instant must not move',
              'quantities': ['elapsed'],
              'inputs': dict(DEFAULT, mdotOut=12.0),
              'windows': [1.03 * 1657.1793150932554, 3600.0, 1e4, 1e5, 1e6, 3e6, 1e7]})
    G.append({'id': 'ind-invariance-empty-near-supply',
              'note': 'A line starting at 59 bar of a 60 bar supply and emptying in 4.1e4 s, '
                      'read at windows from 1.02x to 244x that instant',
              'quantities': ['elapsed'],
              'inputs': dict(DEFAULT, p0=5.9e6, mdotOut=3.0),
              'windows': [4.2e4, 1e5, 3e5, 1e6, 3e6, 1e7]})
    G.append({'id': 'ind-invariance-empty-slowest',
              'note': 'Withdrawal 2.55 kg/s against a 2.53 kg/s choked capacity, the slowest '
                      'emptying the geometry allows, read at windows from 1.3x to 13x',
              'quantities': ['elapsed'],
              'inputs': dict(DEFAULT, mdotOut=2.55),
              'windows': [1e6, 2e6, 3e6, 5e6, 1e7]})
    G.append({'id': 'ind-invariance-empty-zero-inlet',
              'note': 'Pure linear depacking read at windows from 1.02x to 5000x the emptying '
                      'instant; dm/dt is an exact constant so nothing may move at all',
              'quantities': ['elapsed'],
              'inputs': dict(DEFAULT, Ain=0.0, mdotOut=8.0),
              'windows': [2000.0, 3600.0, 1e4, 1e5, 1e6, 1e7]})
    G.append({'id': 'ind-invariance-settled-stiff',
              'note': 'The 50 mm / 10 m line behind a 1000 mm2 orifice, settled at its '
                      'equilibrium pressure within a millisecond and then read at windows '
                      'spanning 2e6x to 2e10x the relaxation time',
              'quantities': ['p_final', 'inventory_final', 'mdot_in_final'],
              'inputs': dict(DEFAULT, D=0.05, L=10.0, p0=1e6, Ain=1e-3, mdotOut=0.1),
              'windows': [1.0, 10.0, 100.0, 1e4, 1e6, 1e7]})
    G.append({'id': 'ind-invariance-settled-shipped-geometry',
              'note': 'The shipped geometry behind a 0.05 m2 orifice, settled at its '
                      'equilibrium pressure inside 100 s and then read at windows spanning '
                      '3x to 1e5x that settling time',
              'quantities': ['p_final', 'inventory_final', 'mdot_in_final'],
              'inputs': dict(DEFAULT, Ain=0.05, mdotOut=2.0),
              'windows': [300.0, 1000.0, 1e4, 1e6, 1e7]})
    return G


def expand_groups(groups):
    """One driven case per (group, window)."""
    out = []
    for g in groups:
        for i, w in enumerate(g['windows']):
            out.append({'id': '%s--w%d' % (g['id'], i), 'note': g['note'],
                        'basis': 'member of the window-invariance family %s' % g['id'],
                        'inputs': dict(g['inputs'], tEnd=float(w)), 'group': g['id']})
    return out


# ---------------------------------------------------------------------------------------------
# 6.  DRIVING THE SHIPPING PAGE
# ---------------------------------------------------------------------------------------------

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
  await page.goto(`http://127.0.0.1:${port}/gasline_packing.html?lang=en&s=${s}`,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.Diagram && window.Diagram.record
      && window.Diagram.record.build && window.Diagram.record.build()), null, { timeout: 40000 });
  results.push({ id: c.id, record: await page.evaluate((inp) => {
      const r = window.Diagram.record.build();
      const v = window.__dgcVerify(inp);
      const pick = id => (v.filter(x => x.id === id)[0] || {});
      return { inputs: r.inputs, outputs: r.outputs, units: r.units,
               elapsed: pick('termination-branch').got,
               termination: pick('termination-branch').word,
               warnings: r.warnings || [], notes: (r.model || {}).notes || [] };
    }, c.inputs) });
}
await page.goto(`http://127.0.0.1:${port}/gasline_packing.html?lang=en`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__dgcBenchmark, null, { timeout: 40000 });
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

SHARED_SCRIPTS = ('diagram-common.js', 'diagram-ui.js', 'site-disclaimer.js')


def _playwright_path():
    for p in ('/home/claude/.npm-global/lib/node_modules/playwright/index.js',
              '/usr/lib/node_modules/playwright/index.js'):
        if os.path.exists(p):
            return p
    raise SystemExit('playwright not found; set DGC_PLAYWRIGHT to its index.js')


def preflight(directory):
    """Fail immediately, with the fix, rather than letting the driver time out."""
    missing = [f for f in (PAGE,) + SHARED_SCRIPTS
               if not os.path.exists(os.path.join(directory, f))]
    if missing:
        raise SystemExit(
            'missing from --dir %s: %s\n'
            'The page loads the shared scripts by relative path, so they must sit beside it,\n'
            'and each must be fetched at the ?v= anchor the page spells -- a bare URL returns a\n'
            'stale cached object.  Check the sha256 prefix against the anchor:\n'
            '  grep -o \'src="[^"]*"\' %s\n'
            '  curl -sS -o diagram-common.js "https://tools.petrov.re/diagram-common.js?v=<anchor>"\n'
            '  sha256sum diagram-common.js | cut -c1-12\n'
            % (directory, ', '.join(missing), PAGE))
    for f in SHARED_SCRIPTS:
        if os.path.getsize(os.path.join(directory, f)) < 1000:
            raise SystemExit('%s in --dir looks truncated (%d bytes)'
                             % (f, os.path.getsize(os.path.join(directory, f))))


def serve(directory, port):
    import http.server
    import functools
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def drive(cases, directory, port, node='node'):
    preflight(directory)
    pw = os.environ.get('DGC_PLAYWRIGHT') or _playwright_path()
    tmp = tempfile.mkdtemp(prefix='glbench-')
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
    with open(out) as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------------------------
# 7.  GRADING
# ---------------------------------------------------------------------------------------------

def _row(name, got, ref, tol, unit, basis, kind, den=None):
    d = max(abs(ref) if den is None else abs(den), 1e-300)
    rel = abs(got - ref) / d
    return {'check': name, 'got': got, 'ref': ref, 'abs': abs(got - ref), 'rel': rel,
            'tol': tol, 'unit': unit, 'graded': True, 'tolerance_basis': basis,
            'kind': kind, 'ok': rel <= tol, 'status': 'pass' if rel <= tol else 'fail'}


def checks_for(c, rec, sabotage=False):
    s = c['inputs']
    o = dict(rec['outputs'])
    elapsed = rec['elapsed']
    r = reference(s)
    if sabotage and c['id'] == 'ind-shipped-default':
        r = dict(r, p_final=r['p_final'] * 1.004)
    if sabotage and c['id'] == 'ind-gas-helium':
        r = dict(r, mdot_in_peak=r['mdot_in_peak'] * 1.5)
    m0 = r['m0']
    rows = [
        _row('p_final', o['p_final'], r['p_final'], TOL_MARCH, 'Pa', TOL_BASIS['march'], 'march'),
        _row('inventory_final', o['inventory_final'], r['inventory_final'], TOL_MARCH, 'kg',
             TOL_BASIS['march'], 'march', den=max(abs(r['inventory_final']), 1e-9 * m0)),
        _row('inventory_change', o['inventory_change'], r['inventory_change'], TOL_MARCH, 'kg',
             TOL_BASIS['march'] + '; referred to the initial inventory so a near-zero change is '
             'not graded against itself', 'march', den=max(abs(r['inventory_change']), 1e-6 * m0)),
        _row('mdot_in_final', o['mdot_in_final'], r['mdot_in_final'], TOL_MARCH, 'kg/s',
             TOL_BASIS['march'], 'march', den=max(abs(r['mdot_in_final']), 1e-9 * max(s['mdotOut'], 1e-9))),
        _row('elapsed', elapsed, r['elapsed'], TOL_MARCH, 's', TOL_BASIS['march'], 'march',
             den=max(abs(r['elapsed']), 1e-12)),
        # state closure: rho must satisfy the same ideal-gas relation as the reported pressure
        _row('rho_final_state_closure', o['rho_final'] * s['R'] * s['T'], o['p_final'],
             TOL_EXACT, 'Pa', TOL_BASIS['exact'], 'exact'),
        _row('inventory_from_pressure', o['p_final'] * r['V'] / (s['R'] * s['T']),
             o['inventory_final'], TOL_EXACT, 'kg', TOL_BASIS['exact'], 'exact',
             den=max(abs(o['inventory_final']), 1e-9 * m0)),
        # the peak inlet flow of a monotone trajectory is attained at an endpoint
        _row('mdot_in_peak', o['mdot_in_peak'], r['mdot_in_peak'], TOL_MARCH, 'kg/s',
             'the trajectory is monotone and mdot_in falls monotonically with line pressure, so '
             'the peak is the endpoint value mdot_in(min(p0, p_final)); ' + TOL_BASIS['march'],
             'march', den=max(abs(r['mdot_in_peak']), 1e-9 * max(s['mdotOut'], 1e-9))),
        # the bound the divergence found on the shipped build violates
        _row('pressure_never_exceeds_driving', min(1.0, o['p_final'] / max(s['p0'], s['pSupply'])),
             1.0 if o['p_final'] >= max(s['p0'], s['pSupply']) else
             min(1.0, o['p_final'] / max(s['p0'], s['pSupply'])),
             TOL_BOUND, '-', TOL_BASIS['bound'], 'bound'),
    ]
    # the bound row above is written so that "got" equals "ref" exactly unless the page
    # exceeded the driving pressure, in which case the ratio is clipped at 1 and the
    # difference is the full excess.
    excess = o['p_final'] / max(s['p0'], s['pSupply']) - 1.0
    rows[-1] = {'check': 'pressure_never_exceeds_driving', 'got': o['p_final'],
                'ref': max(s['p0'], s['pSupply']), 'abs': max(0.0, excess) * max(s['p0'], s['pSupply']),
                'rel': max(0.0, excess), 'tol': TOL_BOUND, 'unit': 'Pa', 'graded': True,
                'tolerance_basis': TOL_BASIS['bound'], 'kind': 'bound',
                'ok': excess <= TOL_BOUND, 'status': 'pass' if excess <= TOL_BOUND else 'fail'}
    if r['p_eq'] is not None:
        rows.append({'check': 'equilibrium_pressure_reference', 'got': None, 'ref': r['p_eq'],
                     'abs': None, 'rel': None, 'tol': None, 'unit': 'Pa', 'graded': False,
                     'tolerance_basis': 'reported, not graded: the pressure at which the '
                                        'independent orifice relation delivers exactly the '
                                        'withdrawal', 'kind': 'context', 'ok': None,
                     'status': 'info'})
    rows.append({'check': 'terminal_regime', 'got': ('choked' if r['choked_final'] else 'subsonic'),
                 'ref': rec.get('termination'), 'abs': None, 'rel': None, 'tol': None, 'unit': '-',
                 'graded': False, 'tolerance_basis': 'reported, not graded', 'kind': 'context',
                 'ok': None, 'status': 'info'})
    return rows, r


def grade_singles(cases, driven, sabotage=False):
    by_id = {r['id']: r['record'] for r in driven['results']}
    out, total, passed = [], 0, 0
    for c in cases:
        rec = by_id[c['id']]
        rows, r = checks_for(c, rec, sabotage=sabotage)
        for x in rows:
            if x['graded']:
                total += 1
                passed += 1 if x['ok'] else 0
        out.append({'id': c['id'], 'note': c['note'], 'basis': c['basis'], 'inputs': c['inputs'],
                    'reference': {k: r[k] for k in ('p_final', 'inventory_final',
                                                    'inventory_change', 'mdot_in_final',
                                                    'mdot_in_peak', 'elapsed', 'emptied',
                                                    'p_eq', 'mdot_in_max')},
                    'cmp': rows, 'pass': all(x['ok'] for x in rows if x['graded'])})
    return out, total, passed


def grade_groups(groups, driven, sabotage=False):
    by_id = {r['id']: r['record'] for r in driven['results']}
    out, total, passed = [], 0, 0
    for g in groups:
        members, rows = [], []
        for i, w in enumerate(g['windows']):
            rec = by_id['%s--w%d' % (g['id'], i)]
            vals = dict(rec['outputs'])
            vals['elapsed'] = rec['elapsed']
            members.append({'tEnd': float(w), 'values': {q: vals[q] for q in g['quantities']}})
        tol = 1e-12 if (sabotage and g['id'] == 'ind-invariance-empty-shipped') else TOL_INVAR
        for q in g['quantities']:
            vs = [m['values'][q] for m in members]
            lo, hi = min(vs), max(vs)
            den = max(abs(lo), abs(hi), 1e-300)
            spread = (hi - lo) / den
            ok = spread <= tol
            total += 1
            passed += 1 if ok else 0
            rows.append({'check': 'window_invariance:' + q, 'got': hi, 'ref': lo,
                         'abs': hi - lo, 'rel': spread, 'tol': tol, 'unit': '-', 'graded': True,
                         'tolerance_basis': TOL_BASIS['invariance'], 'kind': 'invariance',
                         'ok': ok, 'status': 'pass' if ok else 'fail',
                         'extra': {'windows': [m['tEnd'] for m in members], 'values': vs}})
        # each member is also graded against the independent reference in its own right
        ref0 = reference(dict(g['inputs'], tEnd=float(g['windows'][-1])))
        for q in g['quantities']:
            rv = ref0[q]
            vs = [m['values'][q] for m in members]
            worst = max(abs(v - rv) / max(abs(rv), 1e-300) for v in vs)
            ok = worst <= TOL_MARCH
            total += 1
            passed += 1 if ok else 0
            rows.append({'check': 'window_family_vs_reference:' + q, 'got': None, 'ref': rv,
                         'abs': None, 'rel': worst, 'tol': TOL_MARCH, 'unit': '-', 'graded': True,
                         'tolerance_basis': TOL_BASIS['march'] + '; worst member of the family',
                         'kind': 'march', 'ok': ok, 'status': 'pass' if ok else 'fail'})
        out.append({'id': g['id'], 'note': g['note'], 'inputs': g['inputs'],
                    'windows': [m['tEnd'] for m in members], 'members': members,
                    'cmp': rows, 'pass': all(x['ok'] for x in rows)})
    return out, total, passed


# ---------------------------------------------------------------------------------------------
# 7b.  BROWSER / PYTHON-EXPORT PARITY
# ---------------------------------------------------------------------------------------------
#
# The page ships a standard-library Python export of its own model. It carried the same
# window-sized step the browser did, so it is checked here too: the exported script is pulled
# out of the page, executed, and compared both with what the browser returned and with the
# independent reference. The two implementations share equations and step rule, so the only
# admissible difference between them is language-level floating point; 1e-6 relative is an
# order inside the 1e-5 band the tool as a whole is held to, so parity at this level means the
# export reproduces every digit the tool is graded on.
TOL_PARITY = 1e-6
PARITY_BASIS = ('the exported script and the browser evaluate the same equations, the same '
                'transient-sized step rule and the same terminal-event bisection, so the only '
                'admissible difference is language-level floating point; 1e-6 relative is an '
                'order inside the 1e-5 band the marched quantities themselves are held to')


def extract_python_export(directory):
    with open(os.path.join(directory, PAGE), encoding='utf-8') as f:
        html = f.read()
    m = re.search(r'python:function\(\)\{return \{code:("(?:[^"\\]|\\.)*")', html)
    if not m:
        raise SystemExit('could not find the python export block in %s' % PAGE)
    return json.loads(m.group(1))


def grade_python_export(cases, driven, directory, sabotage=False):
    code = extract_python_export(directory)
    by_id = {r['id']: r['record'] for r in driven['results']}
    out, total, passed = [], 0, 0
    for c in cases:
        s = c['inputs']
        ns = {'math': math, 'INPUTS': dict(s)}
        exec(code, ns)                                    # noqa: S102 - the page's own export
        got = ns['compute']()
        if sabotage and c['id'] == 'ind-shipped-depack-empty':
            got = dict(got, elapsed=got['elapsed'] * 1.001)
        rec, ref = by_id[c['id']], reference(s)
        rows = []
        for q, unit in (('p_final', 'Pa'), ('inventory_final', 'kg'), ('mdot_in_final', 'kg/s'),
                        ('mdot_in_peak', 'kg/s')):
            rows.append(_row('export_vs_browser:' + q, got[q], rec['outputs'][q], TOL_PARITY,
                             unit, PARITY_BASIS, 'parity',
                             den=max(abs(rec['outputs'][q]), 1e-12 * abs(ref['m0']))))
        rows.append(_row('export_vs_browser:elapsed', got['elapsed'], rec['elapsed'], TOL_PARITY,
                         's', PARITY_BASIS, 'parity', den=max(abs(rec['elapsed']), 1e-12)))
        rows.append(_row('export_vs_reference:p_final', got['p_final'], ref['p_final'],
                         TOL_MARCH, 'Pa', TOL_BASIS['march'], 'march'))
        rows.append(_row('export_vs_reference:elapsed', got['elapsed'], ref['elapsed'],
                         TOL_MARCH, 's', TOL_BASIS['march'], 'march',
                         den=max(abs(ref['elapsed']), 1e-12)))
        for x in rows:
            total += 1
            passed += 1 if x['ok'] else 0
        out.append({'id': 'ind-export-' + c['id'], 'note': 'Python export of ' + c['id'] + ': '
                    + c['note'], 'inputs': s, 'cmp': rows,
                    'pass': all(x['ok'] for x in rows)})
    return out, total, passed


#: the input sets the export parity is checked on: both terminations, both regimes, the
#: choke transition, the stiffest corner and the widest window.
PARITY_CASE_IDS = ('ind-shipped-default', 'ind-shipped-depack-empty', 'ind-shipped-zero-inlet',
                   'ind-shipped-choked-small-line', 'ind-near-supply-start-empties',
                   'ind-fast-relax-vast-window', 'ind-large-orifice-fast-pack',
                   'ind-bound-tEnd-max')


# ---------------------------------------------------------------------------------------------
# 8.  THE MERGED ARTIFACT
# ---------------------------------------------------------------------------------------------

def merge_self_checks(inpage):
    """Carry the superseded in-page benchmark through as LABELLED SELF-CHECKS.

    These re-evaluate the tool's own relations inside the tool, so they establish internal
    consistency and nothing more.  Their ids, notes and verdicts are kept unchanged; only the
    label is added.  Site rule section 5 allows the artifact to be a merge; it does not allow a
    self-check to be counted as an independent reference, so they are counted separately.
    """
    cases, total, passed = [], 0, 0
    for c in inpage.get('cases', []):
        rows = []
        for x in c.get('cmp', []):
            y = dict(x)
            y['reference_kind'] = 'self-check'
            if y.get('graded'):
                total += 1
                passed += 1 if y.get('ok') else 0
            rows.append(y)
        cases.append({'id': 'self-' + c['id'], 'note': c.get('note'), 'inputs': c.get('inputs'),
                      'cmp': rows, 'pass': c.get('pass'), 'reference_kind': 'self-check'})
    return cases, total, passed


def read_manifest(directory):
    with open(os.path.join(directory, PAGE), encoding='utf-8') as f:
        html = f.read()
    m = re.search(r'<script type="application/json" id="diagram-tool-manifest">(.*?)</script>',
                  html, re.S)
    return json.loads(m.group(1)) if m else {}


def build_artifact(ind_cases, ind_total, ind_passed, grp_cases, grp_total, grp_passed,
                   par_cases, par_total, par_passed,
                   sc_cases, sc_total, sc_passed, manifest_revision, page_errors, run_at,
                   selfcheck_rows, build):
    total = ind_total + grp_total + par_total + sc_total
    passed = ind_passed + grp_passed + par_passed + sc_passed
    return {
        'schema': 'tools.petrov.re/benchmark/v1',
        'tool': TOOL_ID, 'file': PAGE, 'manifest_revision': manifest_revision,
        'build': build,
        'reference':
            'An independent second implementation of the declared model, written in Python from '
            'a first-principles derivation (mass balance on the line volume; one-dimensional '
            'isentropic orifice flow assembled as rho*w from the stagnation relations) and '
            'solved by a structurally different route: because dm/dt = f(m) is autonomous and '
            'one-dimensional, the trajectory is the quadrature t(m) = integral dm/f(m), which '
            'contains no time step at all. Cross-routes: an implicit stiff time march '
            '(scipy Radau, rtol 1e-12) and closed forms on the choked branch. Anchored to '
            'published compressible-flow data. The tool\'s JavaScript was read only for input '
            'names, units, declared assumptions, the declared 1e-9 kg empty-line floor and the '
            'list of reported quantities; nothing was transcribed.',
        'reference_citations': [
            'A. H. Shapiro, "The Dynamics and Thermodynamics of Compressible Fluid Flow", '
            'vol. 1, Ronald Press, New York, 1953, ch. 4: eq. 4.14 (T_t/T), eq. 4.15 (p_t/p), '
            'eq. 4.18-4.19 (the critical pressure ratio r* = (2/(g+1))^(g/(g-1))), '
            'eq. 4.21 (mass flux per unit area at the throat).',
            'Ames Research Staff, "Equations, Tables and Charts for Compressible Flow", '
            'NACA Report 1135, 1953, Table I, isentropic column at M = 1 for gamma = 1.4: '
            'p/p_t = 0.528282, T/T_t = 0.833333, rho/rho_t = 0.633938. Reproduced by the '
            'reference to 4.0e-7, 4.0e-7 and 2.3e-7 relative, inside half the last printed digit.',
            'The three-significant-digit engineering form of the choked-orifice law for air, '
            'mdot = 0.0404 Cd A p_t / sqrt(T) (ISO 6358; Perry\'s Chemical Engineers\' Handbook '
            '8th ed. eq. 10-25). The reference gives 0.0404149, 3.7e-4 relative from the '
            'published three-digit constant.',
            'CoolProp 8.0 (Lemmon et al. air EOS; Setzmann & Wagner methane EOS), used to '
            'confirm the reference collapses onto the ideal-gas limit at low pressure and to '
            'size the fidelity of the declared closure: Z = 0.8880 for methane at 6 MPa and '
            '288.15 K, so the tool\'s own ideal-gas assumption is 12.6 % out in density at its '
            'default supply pressure.',
            'scipy 1.17 solve_ivp with the Radau IIA implicit collocation method, rtol 1e-12, '
            'used as an independent second numerical route to the same equations.'],
        'reference_provenance': 'recomputed',
        # The sentence that used to sit in reference_provenance, which §5 defines as an enum.
        # Its path is corrected: the harness ships at bench-src/, and `out/` is a directory of
        # no tree in this deployment.  The split that justifies the enum is counted, not typed.
        'provenance_note':
            'Independent second implementation, external to the page '
            '(bench-src/gen_gasline_packing.py); the in-page self-checks are carried through '
            'separately and labelled as such. All %d graded references are recomputed during '
            'this run and none reuses a stored or published number: %d by that external '
            'implementation, which shares no code with the page, and %d by the page\'s own '
            'retained in-page self-checks, labelled reference_kind = "self-check" and counted '
            'separately; the published anchors are reported under reference_self_verification '
            'and carry no graded case.'
            % (total, ind_total + grp_total + par_total, sc_total),
        'independent_validation': False,
        'independent_validation_note':
            'The reference shares no code with the tool and was derived and written separately, '
            'which is what the benchmarked tier asserts. It is still the author\'s own harness: '
            'no third party has reviewed it, so independent_validation stays false and no '
            'validation.review record exists.',
        'review': None,
        'tolerance':
            'Four bands, each fixed by the physics or by what the page prints, none by any step '
            'size. (1) Closed-form identities -- the ideal-gas state closure p = m R T / V and '
            'the density the page reports from it -- are exact arithmetic on both sides and are '
            'held to 1e-12 relative. (2) Marched quantities (terminal pressure, inventory, '
            'inventory change, inlet flow, peak inlet flow, terminal instant) are held to 1e-5 '
            'relative: that is two orders inside what the page prints (line pressures to 0.01 '
            'bar, about 2.5e-4 relative at its own default) and four orders inside the 12.6 % '
            'density error the declared ideal-gas closure itself carries at the default 60 bar '
            'supply (CoolProp 8.0 methane, Z = 0.8880). (3) The window-invariance families are '
            'held to a 1e-6 relative spread: the terminal answer is a property of the line, the '
            'gas and the two boundary flows, and the simulated-time window is not one of them, '
            'so the only admissible spread is residual discretisation noise. (4) The line '
            'pressure may never exceed max(p0, p_supply); that is a hard consequence of having '
            'no reverse flow and no heat input, and carries round-off slack only.',
        'run_at': run_at,
        'total': total, 'passed': passed, 'failed': total - passed, 'flagged': 0,
        'page_errors': page_errors,
        'counts': {
            'independent_single_case_checks': ind_total,
            'independent_window_invariance_checks': grp_total,
            'python_export_parity_checks': par_total,
            'independent_total': ind_total + grp_total + par_total,
            'independent_passed': ind_passed + grp_passed + par_passed,
            'self_check_total': sc_total, 'self_check_passed': sc_passed,
        },
        'grading':
            'total counts every check carrying an acceptance criterion. %d of them are external '
            'to the page: %d single-case checks against the independent Python reference over %d '
            'input sets, %d window-invariance checks over %d families, and %d checks over %d '
            'input sets on the page\'s own Python export, compared both with the browser and '
            'with the independent reference. The remaining %d are the superseded in-page checks, '
            'retained with their ids and verdicts and labelled reference_kind = "self-check" '
            'because they re-evaluate the tool\'s own relations inside the tool. Rows marked '
            'graded = false report the state of a solved case and carry no criterion.'
            % (ind_total + grp_total + par_total, ind_total, len(ind_cases), grp_total,
               len(grp_cases), par_total, len(par_cases), sc_total),
        'reference_self_verification': selfcheck_rows,
        'cases': ind_cases + grp_cases + par_cases + sc_cases,
        'not_benchmarked': [
            'Distributed line dynamics: axial pressure gradient, line friction and wave '
            'propagation. The model is a single lumped control volume by declaration.',
            'Thermal behaviour. The control volume is isothermal at the input temperature, so '
            'neither the heat of compression while packing nor the cooling while depacking is '
            'modelled or checked.',
            'Real-gas compressibility. The reference deliberately solves the same ideal-gas '
            'closure the tool declares, so the 12.6 % density error that closure carries for '
            'methane at 6 MPa is measured (CoolProp) but not corrected: both sides share it.',
            'Discharge-coefficient physics. Cd is an input to both sides, not a modelled '
            'quantity.',
            'The convergence ORDER of the RK4 stepper. The harness measures whether the '
            'shipped step is converged and whether the answer is invariant to the window, but '
            'does not fit a rate.'],
        'notes': [
            'Regenerate with: python3 gen_gasline_packing.py --dir <dir holding %s and the '
            'three shared scripts at their ?v= anchors> --port 8822 --out gasline_packing.json'
            % PAGE,
            'The reference verifies itself before it is allowed to grade anything: %d checks '
            'covering the published anchors, two analytic limits derived separately, agreement '
            'between three structurally different routes, convergence under node refinement, '
            'the exponential approach law at equilibrium and the physical pressure bound over '
            '120 pseudo-random legal input sets. The harness refuses to run if any of them '
            'fails.' % len(selfcheck_rows),
            'The window-invariance families are the check the superseded artifact could not '
            'make: its acceptance band for the terminal pressure was the pressure one solver '
            'step moves, with dt = tEnd/800, so the band grew in proportion to the error source '
            'and no step size could ever fail it.'],
    }


# ---------------------------------------------------------------------------------------------
# 9.  ENTRY POINT
# ---------------------------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--dir', default='.', help='directory holding %s and the shared scripts' % PAGE)
    ap.add_argument('--port', type=int, default=8822)
    ap.add_argument('--out', default='gasline_packing.json')
    ap.add_argument('--node', default='node')
    ap.add_argument('--selfcheck', action='store_true',
                    help='verify the reference alone and exit')
    ap.add_argument('--sabotage', action='store_true',
                    help='negative control: falsify three expectations and confirm exactly '
                         'those fail')
    args = ap.parse_args()

    import warnings
    from scipy.integrate import IntegrationWarning
    warnings.simplefilter('ignore', IntegrationWarning)

    print('verifying the reference before it grades anything ...')
    rows, bad = self_verify(verbose=True)
    if bad:
        raise SystemExit('reference self-verification failed (%d checks); refusing to grade' % bad)
    if args.selfcheck:
        return

    singles = build_cases()
    groups = build_invariance_groups()
    driven_cases = singles + expand_groups(groups)
    print('\ndriving %s with %d input sets on port %d ...' % (PAGE, len(driven_cases), args.port))
    driven = drive(driven_cases, args.dir, args.port, node=args.node)
    if driven['errors']:
        print('PAGE ERRORS: %s' % driven['errors'][:5])

    ind_cases, ind_total, ind_passed = grade_singles(singles, driven, sabotage=args.sabotage)
    grp_cases, grp_total, grp_passed = grade_groups(groups, driven, sabotage=args.sabotage)
    par_cases, par_total, par_passed = grade_python_export(
        [c for c in singles if c['id'] in PARITY_CASE_IDS], driven, args.dir,
        sabotage=args.sabotage)
    sc_cases, sc_total, sc_passed = merge_self_checks(driven['inpage'])
    manifest = read_manifest(args.dir)
    run_at = driven['inpage'].get('run_at')

    # `build` is what the SERVED page said it was.  A disagreement with the file this harness
    # read means the browser was not reading this tree, so nothing is written rather than an
    # artifact naming a build nobody can check (bench-src/provenance.mjs refuses on the same
    # condition).
    served_rev = driven.get('served_revision')
    if not served_rev:
        raise SystemExit('the served page reported no manifest_revision; refusing to write an '
                         'artifact that would have to name a build it did not observe.')
    if served_rev != manifest.get('manifest_revision', ''):
        raise SystemExit('served page declares manifest_revision %r, the file in --dir declares '
                         '%r. The browser was not reading this tree; nothing written.'
                         % (served_rev, manifest.get('manifest_revision', '')))

    art = build_artifact(ind_cases, ind_total, ind_passed, grp_cases, grp_total, grp_passed,
                         par_cases, par_total, par_passed, sc_cases, sc_total, sc_passed,
                         manifest.get('manifest_revision', ''), driven['errors'], run_at, rows,
                         served_rev)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(art, f, indent=1, ensure_ascii=False)

    print('\n%-56s %s' % ('artifact', args.out))
    print('%-56s %d / %d' % ('independent single-case checks', ind_passed, ind_total))
    print('%-56s %d / %d' % ('independent window-invariance checks', grp_passed, grp_total))
    print('%-56s %d / %d' % ('python-export parity checks', par_passed, par_total))
    print('%-56s %d / %d' % ('retained in-page self-checks', sc_passed, sc_total))
    print('%-56s %d / %d' % ('TOTAL', art['passed'], art['total']))
    if art['failed']:
        print('\nfailing checks:')
        for c in art['cases']:
            for x in c['cmp']:
                if x.get('graded') and not x.get('ok'):
                    print('  %-44s %-34s rel %.4e  tol %.1e'
                          % (c['id'], x['check'], x['rel'] or 0.0, x['tol']))
    return 0 if art['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main() or 0)
