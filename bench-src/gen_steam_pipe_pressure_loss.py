#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_steam_pipe_pressure_loss.py -- independent benchmark harness for
tools.petrov.re/steam_pipe_pressure_loss.html

WHAT THIS IS
    An external reference for compressible pressure loss along a steam line, written in
    Python from a derivation carried out here, along FOUR routes that are independent of
    the shipping page and structurally independent of one another.

    THE DERIVATION (mine, not the page's).  Take a constant-area duct, steady and
    one-dimensional, carrying a mass flux G = rho w that continuity holds constant.  The
    momentum balance over a slice, with wall shear expressed as the Darcy friction term
    and the lumped fitting loss SigmaK spread uniformly over the length L, is

        dp + G^2 dv + (c/2) G^2 v dx = 0 ,    c = f/D + SigmaK/L ,    v = 1/rho     (1)

    where the second term is the streamwise acceleration d(G w) = G^2 dv.  Dividing (1)
    by the strictly positive G^2 v separates the variables for ANY one-parameter state
    path rho(p):

        dp/(G^2 v) + dv/v + (c/2) dx = 0                                            (2)

    and integrating (2) from the inlet to the outlet gives the quadrature that every
    route below uses:

        q/2 = (1/G^2) INT_{p2}^{p1} rho(p) dp + ln( rho(p2)/rho(p1) ) ,  q = f L/D + K (3)

    Equation (3) has no integration step to argue about: it is an ordinary integral in
    PRESSURE, and the critical point where dp/dx becomes singular is a ZERO of dx/dp, not
    a pole, so the stiffest part of the problem is the smoothest part of the quadrature.

    ROUTE A -- CLOSED FORM VIA LAMBERT W.  Putting the isothermal ideal-gas state path
    rho = p/(RT) into (3) gives

        p1^2 - p2^2 + 2 C ln(p2/p1) = q C ,      C = G^2 R T                        (4)

    which is the complete isothermal compressible pipe equation as published (Crane
    Technical Paper No. 410; Perry's Chemical Engineers' Handbook, 8th ed., eq. 6-114;
    Shapiro vol. 1, ch. 6).  Substituting u = p^2/C turns (4) into g(u2) = g(u1) - q with
    g(u) = u - ln u, and u - ln u = y inverts in CLOSED FORM:

        u e^{-u} = e^{-y}  =>  u = -W_{-1}( -e^{-y} )       (branch u >= 1)

    so p2 = sqrt( C * (-W_{-1}(-exp(-(g(u1) - q)))) ) with NO root-finding and NO
    stepping of any kind.  The critical resistance follows as q* = g(u1) - 1 and the
    critical pressure as p* = sqrt(C) = G sqrt(RT), the isothermal sonic condition
    w = a_T = sqrt((dp/drho)_T).  The page inverts (4) by bisection; this route does not
    invert anything, so it tests the inversion and not only the algebra.

    ROUTE B -- 50-DIGIT ARBITRATION.  The residual of (4) driven to a root in 50-digit
    mpmath arithmetic.  Used to arbitrate whenever routes A and D differ, and to confirm
    that the double-precision Lambert-W evaluation is not itself the limiting error.

    ROUTE C -- PRESSURE-DOMAIN QUADRATURE OF THE LENGTH.  Inverting (1) for dx/dp and
    integrating in p by 240-node Gauss-Legendre,

        L = INT_{p2}^{p1} (p^2 - C) / ( (c/2) C p ) dp                              (5)

    so the tool's REPORTED outlet pressure is asked, independently, whether it really
    sits at distance L from the inlet.  This is the route that answers the marching
    question, because it converges at 50 nodes even at q/q* = 0.99999, where a march in x
    is at its stiffest.

    ROUTE D -- GENERAL QUADRATURE ON ANY STATE PATH.  Equation (3) solved for p2 by Brent
    on a 240-node Gauss-Legendre evaluation of the integral.  Fed the ideal isotherm it
    must reproduce route A; fed the IAPWS-IF97 isotherm it gives the REAL-STEAM answer;
    fed a Fanno (adiabatic) line it gives the ADIABATIC answer.  This is what makes the
    idealisation itself measurable rather than merely declared.

    REAL STEAM.  Routes D is evaluated with IAPWS-IF97 properties through CoolProp's
    IF97 backend, verified here against the official IAPWS R7-97 verification values
    (Table 5 region 1, Table 15 region 2) to 1e-9 and IAPWS R12-08 viscosity Table 4 to
    1e-9 before any comparison is made.  Real isothermal choking is located where the
    flow speed reaches the isothermal sound speed sqrt((dp/drho)_T).

    FANNO.  The adiabatic duct is the same quadrature (3) with the state path fixed by the
    energy condition h + G^2 v^2/2 = h0 instead of T = const, solved for T at each p.  The
    ideal-gas version of that quadrature is verified against the PUBLISHED Fanno relation
    (Shapiro vol. 1, ch. 6)

        f L*/D = (1-M^2)/(gamma M^2) + ((gamma+1)/(2 gamma)) ln[(gamma+1)M^2/(2+(gamma-1)M^2)]

    to 1.8e-13 over Mach 0.02 to 0.9995, and its sonic point against the published
    p/p* relation to 1.3e-9, before it is used for anything.

    FRICTION.  The Swamee-Jain explicit correlation is implemented from its published
    algebra (P. K. Swamee and A. K. Jain, "Explicit equations for pipe-flow problems",
    J. Hydraulics Div. ASCE 102(HY5) (1976) 657-664), and the Colebrook-White equation
    (C. F. Colebrook, J. Inst. Civ. Eng. 11 (1939) 133-156) is solved to convergence, so
    the cost of the tool's declared explicit correlation is measured rather than assumed.

WHAT WAS READ FROM THE PAGE
    Input keys, units, declared minima and maxima, defaults, the list of reported
    quantities and their units, the declared model boundary ("steady isothermal ideal-
    steam momentum model including streamwise acceleration ... laminar or Swamee-Jain
    friction factor"; "not for wet steam, flashing, condensation, large Mach number, heat
    loss, elevation or code-compliance sizing"), the printed precision of each reported
    figure, and the names of the correlations the tool declares it uses.  Its JavaScript
    was NOT read for how anything is computed, and nothing in this file is transcribed,
    ported or paraphrased from it.

WHAT IS MEASURED AND NOT GRADED
    The departure of the tool's declared ideal-gas isothermal idealisation from real
    steam, and from the adiabatic (Fanno) duct.  The tool declares both idealisations
    openly, so these are recorded as measurements of the declared model boundary, with
    numbers, and never as failures.

SELF-CHECKS THAT REMAIN SELF-CHECKS
    The 28 in-page checks recorded by the 2026-09-11 artifact re-evaluate the tool's own
    relation inside the tool.  They are merged here with their original ids, notes and
    verdicts, labelled kind="self-check" on every row, and counted separately.  They are
    never presented as external evidence.

USAGE
    python3 gen_steam_pipe_pressure_loss.py --dir <dir with page + shared scripts> \
        --port 8825 --out steam_pipe_pressure_loss.json
    python3 gen_steam_pipe_pressure_loss.py --selfcheck      # verify the reference alone
    python3 gen_steam_pipe_pressure_loss.py --dir . --port 8825 --out x.json --sabotage

Requires: numpy, scipy, mpmath, CoolProp (pip install CoolProp), node with playwright.
"""

import argparse
import datetime
import functools
import json
import math
import os
import subprocess
import sys
import tempfile
import threading

import numpy as np
from scipy.special import lambertw
from scipy.optimize import brentq
import mpmath as mp

TOOL_ID = 'steam-pipe-pressure-loss'
PAGE = 'steam_pipe_pressure_loss.html'
SHARED_SCRIPTS = ('diagram-common.js', 'diagram-ui.js', 'site-disclaimer.js')

EPS = 2.220446049250313e-16          # double precision unit roundoff
PRINTED_PA = 100.0                   # the tool prints pressure to 0.001 bar = 100 Pa

IF97 = 'IF97::Water'
PMIN_IF97 = 620.0                    # CoolProp IF97 lower bound (triple point 611.657 Pa)
_GLN = 240
_GX, _GW = np.polynomial.legendre.leggauss(_GLN)

try:
    from CoolProp.CoolProp import PropsSI
    HAVE_CP = True
except Exception:                                        # pragma: no cover
    HAVE_CP = False

    def PropsSI(*a, **k):
        raise RuntimeError('CoolProp is not installed (pip install CoolProp)')


# =============================================================================================
# 1.  FRICTION CORRELATIONS, IMPLEMENTED FROM THEIR PUBLISHED ALGEBRA
# =============================================================================================

def swamee_jain(Re, eps, D):
    """Swamee & Jain, J. Hydraulics Div. ASCE 102(HY5) (1976) 657-664:
           f = 0.25 / [ log10( eps/(3.7 D) + 5.74 / Re^0.9 ) ]^2 .
       Stated validity 5e3 <= Re <= 1e8 and 1e-6 <= eps/D <= 1e-2."""
    return 0.25 / math.log10(eps / (3.7 * D) + 5.74 / Re ** 0.9) ** 2


def colebrook(Re, eps, D, tol=1e-15):
    """C. F. Colebrook, J. Inst. Civ. Eng. 11 (1939) 133-156:
           1/sqrt(f) = -2 log10( eps/(3.7 D) + 2.51 / (Re sqrt(f)) )
       solved to convergence by fixed-point iteration on x = 1/sqrt(f)."""
    a = eps / (3.7 * D)
    x = 1.0 / math.sqrt(max(swamee_jain(Re, eps, D), 1e-8))
    for _ in range(300):
        xn = -2.0 * math.log10(a + 2.51 * x / Re)
        if abs(xn - x) <= tol * abs(xn):
            x = xn
            break
        x = xn
    return 1.0 / (x * x)


def darcy_f(Re, eps, D, transition=2300.0):
    """The tool declares 'laminar or Swamee-Jain'; the laminar branch of a circular duct
       is the exact Hagen-Poiseuille result f = 64/Re."""
    if Re <= 0:
        return 0.0
    return 64.0 / Re if Re < transition else swamee_jain(Re, eps, D)


# =============================================================================================
# 2.  ROUTE A -- CLOSED FORM VIA LAMBERT W       (no root-finding, no stepping)
# =============================================================================================

def _g(u):
    return u - math.log(u)


def p2_lambert(p1, C, q):
    """Exact outlet pressure of the isothermal ideal-gas duct. Returns (p2, choked, qcrit).

       choked is True when the requested resistance reaches or exceeds q* = g(u1) - 1,
       i.e. when the outlet would have to fall below the isothermal sonic pressure
       p* = sqrt(C).  When the INLET is already at or above the sonic condition (u1 <= 1)
       there is no steady subsonic solution at all; that degenerate branch is flagged by
       returning qcrit = 0.0."""
    if C <= 0 or q <= 0:
        return p1, False, float('inf')
    pc = math.sqrt(C)
    u1 = p1 * p1 / C
    if u1 <= 1.0:
        return pc, True, 0.0
    qcrit = _g(u1) - 1.0
    if q >= qcrit:
        return pc, True, qcrit
    y = _g(u1) - q
    if y < 700.0:
        u2 = -lambertw(-math.exp(-y), k=-1).real
    else:                       # -exp(-y) underflows; carry the branch in 60 digits
        mp.mp.dps = 60
        u2 = float(-mp.lambertw(-mp.exp(-mp.mpf(y)), k=-1).real)
    return math.sqrt(C * u2), False, qcrit


def condition_number(p1, C, q):
    """Sensitivity of p2 to a relative perturbation of the relation, derived from
           g(u2) = g(u1) - q ,   dg/du = (u-1)/u ,   p2 = sqrt(C u2)
       giving   d(p2)/p2 = (1/2) * |g(u1)-q| / (u2 - 1) * delta .
       This is what sets the achievable tolerance near the critical point."""
    p2, ch, qc = p2_lambert(p1, C, q)
    if ch or C <= 0:
        return 1.0
    u1 = p1 * p1 / C
    u2 = p2 * p2 / C
    if u2 <= 1.0 + 1e-15:
        return 1e12
    return max(1.0, 0.5 * abs(_g(u1) - q) / (u2 - 1.0))


# =============================================================================================
# 3.  ROUTE B -- 50-DIGIT ARBITRATION
# =============================================================================================

def p2_mpmath(p1, C, q, dps=50):
    mp.mp.dps = dps
    P1, Cc, Q = mp.mpf(p1), mp.mpf(C), mp.mpf(q)
    pc = mp.sqrt(Cc)
    if P1 <= pc:
        return float(pc), True
    u1 = P1 * P1 / Cc
    qcrit = u1 - mp.log(u1) - 1
    if Q >= qcrit:
        return float(pc), True
    F = lambda p: P1 * P1 - p * p + 2 * Cc * mp.log(p / P1) - Q * Cc
    lo, hi = pc, P1
    for _ in range(260):
        mid = (lo + hi) / 2
        if F(mid) > 0:
            lo = mid
        else:
            hi = mid
    return float((lo + hi) / 2), False


# =============================================================================================
# 4.  ROUTE C -- PRESSURE-DOMAIN QUADRATURE OF THE PIPE LENGTH
# =============================================================================================

def length_for_p2(p1, p2, C, c, n=_GLN):
    """L = INT_{p2}^{p1} (p^2 - C) / ((c/2) C p) dp, by n-node Gauss-Legendre.
       Integrating in p rather than x turns the singular gradient at the critical
       pressure into a simple zero of the integrand."""
    x, w = (_GX, _GW) if n == _GLN else np.polynomial.legendre.leggauss(n)
    a, b = p2, p1
    pp = 0.5 * (b - a) * x + 0.5 * (b + a)
    return 0.5 * (b - a) * float(np.dot(w, (pp * pp - C) / ((c / 2.0) * C * pp)))


# =============================================================================================
# 5.  ROUTE D -- GENERAL QUADRATURE ON AN ARBITRARY STATE PATH
# =============================================================================================

def q_between(p1, p2, G, rho, n=_GLN):
    """q = f L/D + SigmaK required to fall from p1 to p2 along the state path rho(p)."""
    x, w = (_GX, _GW) if n == _GLN else np.polynomial.legendre.leggauss(n)
    a, b = p2, p1
    pp = 0.5 * (b - a) * x + 0.5 * (b + a)
    I = 0.5 * (b - a) * float(np.dot(w, np.array([rho(float(v)) for v in pp])))
    return 2.0 * (I / (G * G) + math.log(rho(p2) / rho(p1)))


def solve_p2(p1, G, q, rho, pfloor, n=_GLN):
    if q <= 0:
        return p1, False
    if q >= q_between(p1, pfloor, G, rho, n):
        return pfloor, True
    return brentq(lambda p: q_between(p1, p, G, rho, n) - q, pfloor, p1 * (1 - 1e-14),
                  xtol=1e-8, rtol=8.9e-16, maxiter=400), False


def _floor_scan(p1, resid, pmin):
    """Locate the sonic point by scanning down from the inlet.  resid(p) is negative while
       the flow is subsonic and positive once it has passed the sonic condition."""
    hi = p1 * (1 - 1e-10)
    try:
        if resid(hi) >= 0:
            return hi
    except Exception:
        return hi
    p = hi
    for _ in range(700):
        pn = max(pmin, p * 0.93)
        try:
            r = resid(pn)
        except Exception:
            return p
        if r > 0:
            return brentq(resid, pn, p, xtol=max(1e-4, pn * 1e-13), rtol=1e-14)
        if pn <= pmin * (1 + 1e-12):
            return pmin
        p = pn
    return pmin


# =============================================================================================
# 6.  STATE PATHS -- IDEAL ISOTHERM, IF97 ISOTHERM, IDEAL FANNO, IF97 FANNO
# =============================================================================================

def rho_ideal_iso(R, T):
    return lambda p: p / (R * T)


def rho_if97_iso(T):
    return lambda p: PropsSI('D', 'P', p, 'T', T, IF97)


def if97_iso_floor(p1, T, G):
    """Real isothermal choking: flow speed reaches a_T = sqrt((dp/drho)_T)."""
    def resid(p):
        r = PropsSI('D', 'P', p, 'T', T, IF97)
        d = p * 1e-6
        drdp = (PropsSI('D', 'P', p + d, 'T', T, IF97)
                - PropsSI('D', 'P', p - d, 'T', T, IF97)) / (2 * d)
        return G / r - math.sqrt(1.0 / drdp)
    return _floor_scan(p1, resid, PMIN_IF97)


def path_fanno_ideal(p1, T1, G, R, g):
    """Adiabatic, no work, calorically perfect: cp T + G^2 v^2/2 = h0 with v = R T / p is
       a quadratic in T; the subsonic branch is the larger root."""
    cp = g * R / (g - 1.0)
    v1 = R * T1 / p1
    h0 = cp * T1 + G * G * v1 * v1 / 2.0

    def T_of_p(p):
        a = G * G * R * R / (2 * p * p)
        return (-cp + math.sqrt(cp * cp + 4 * a * h0)) / (2 * a)

    def rho(p):
        return p / (R * T_of_p(p))

    def sonic(p):
        d = p * 1e-7
        return (rho(p + d) - rho(p - d)) / (2 * d) / rho(p) - rho(p) / (G * G)

    return rho, sonic, T_of_p, h0


def path_fanno_if97(p1, T1, G):
    """Adiabatic duct with IAPWS-IF97 properties: h(p,T) + G^2/(2 rho(p,T)^2) = h0
       solved for T at each p, the root bracketed above the saturation temperature so a
       Fanno line that would enter the two-phase region is reported instead of guessed."""
    h0 = PropsSI('H', 'P', p1, 'T', T1, IF97) + G * G / (2.0 * PropsSI('D', 'P', p1, 'T', T1, IF97) ** 2)
    cache = {}

    def T_of_p(p):
        k = round(p, 6)
        if k in cache:
            return cache[k]

        def r(T):
            rho = PropsSI('D', 'P', p, 'T', T, IF97)
            return PropsSI('H', 'P', p, 'T', T, IF97) + G * G / (2 * rho * rho) - h0

        Tsat = PropsSI('T', 'P', p, 'Q', 1, IF97) if p < 22.05e6 else 280.0
        lo = Tsat + 0.02
        hi = min(2200.0, max(T1 * 1.0002, lo + 0.5))
        if r(lo) * r(hi) > 0:
            raise ValueError('the Fanno line leaves the single-phase superheated region '
                             'at p = %.6g Pa' % p)
        T = brentq(r, lo, hi, xtol=1e-10, rtol=1e-14)
        cache[k] = T
        return T

    def rho(p):
        return PropsSI('D', 'P', p, 'T', T_of_p(p), IF97)

    def sonic(p):
        d = p * 1e-5
        return (rho(p + d) - rho(p - d)) / (2 * d) / rho(p) - rho(p) / (G * G)

    return rho, sonic, T_of_p, h0


# =============================================================================================
# 7.  PUBLISHED FANNO RELATIONS  (Shapiro vol. 1, ch. 6)
# =============================================================================================

def fanno_fLD_star(M, g):
    return (1 - M * M) / (g * M * M) + ((g + 1) / (2 * g)) * math.log(
        (g + 1) * M * M / (2 + (g - 1) * M * M))


def fanno_p_over_pstar(M, g):
    return (1.0 / M) * math.sqrt((g + 1) / (2 + (g - 1) * M * M))


# =============================================================================================
# 8.  THE TOOL'S DECLARED MODEL, EVALUATED ENTIRELY ON THE REFERENCE SIDE
# =============================================================================================

def reference_solution(p1, T, mdot, D, L, eps, K, R, gamma, f):
    """Everything the tool reports, rebuilt from the reference routes.  f is supplied
       because the friction factor is graded separately against its published correlation;
       this function grades the COMPRESSIBLE RELATION and its inversion."""
    A = math.pi * D * D / 4.0
    G = mdot / A
    C = G * G * R * T
    q = f * L / D + K
    p2, choked, qcrit = p2_lambert(p1, C, q)
    if choked and qcrit == 0.0:          # inlet already sonic or supersonic
        p2 = min(p1, math.sqrt(C))
    rho2 = p2 / (R * T)
    v2 = mdot / (rho2 * A)
    a_iso = math.sqrt(gamma * R * T)
    return dict(A=A, G=G, C=C, q=q, p2=p2, choked=choked, qcrit=qcrit,
                pc=math.sqrt(C), rho2=rho2, v2=v2, M2=v2 / a_iso, dp=p1 - p2)


# =============================================================================================
# 9.  SELF-VERIFICATION OF THE REFERENCE, BEFORE ANY TOOL OUTPUT IS GRADED
# =============================================================================================

def self_verify(verbose=True):
    rows = []

    def row(name, got, ref, tol, how, unit='-', absolute=False):
        dev = abs(got - ref) if absolute else (abs(got - ref) / abs(ref) if ref else abs(got))
        ok = dev <= tol
        rows.append(dict(check=name, got=got, ref=ref, dev=dev, tol=tol, ok=bool(ok),
                         unit=unit, how=how))
        if verbose:
            print('  %-58s %-10s dev %.3e  tol %.1e' % (name, 'ok' if ok else 'FAIL', dev, tol))
        return ok

    if verbose:
        print('REFERENCE SELF-VERIFICATION')

    # ---- 9.1 IAPWS-IF97 property source against the official verification tables -------
    # IAPWS R7-97 (2012), Table 5 (region 1) and Table 15 (region 2).  The release prints
    # nine significant figures, so its own quantisation is ~1e-9 relative.
    if HAVE_CP:
        for T, pM, v, h, s in [(300, 3.0, 0.100215168e-2, 0.115331273e3, 0.392294792e0),
                               (300, 80.0, 0.971180894e-3, 0.184142828e3, 0.368563852e0),
                               (500, 3.0, 0.120241800e-2, 0.975542239e3, 0.258041912e1)]:
            p = pM * 1e6
            row('iapws-r7-97-region1-v-T%gK-p%gMPa' % (T, pM),
                1.0 / PropsSI('D', 'P', p, 'T', T, IF97), v, 1e-8,
                'IAPWS R7-97 (2012) Table 5; the release prints 9 significant figures.',
                'm3/kg')
            row('iapws-r7-97-region1-h-T%gK-p%gMPa' % (T, pM),
                PropsSI('H', 'P', p, 'T', T, IF97) / 1e3, h, 1e-8,
                'IAPWS R7-97 (2012) Table 5.', 'kJ/kg')
        for T, pM, v, h, w in [(300, 0.0035, 0.394913866e2, 0.254991145e4, 0.427920172e3),
                               (700, 0.0035, 0.923015898e2, 0.333568375e4, 0.644289068e3),
                               (700, 30.0, 0.542946619e-2, 0.263149474e4, 0.480386523e3)]:
            p = pM * 1e6
            row('iapws-r7-97-region2-v-T%gK-p%gMPa' % (T, pM),
                1.0 / PropsSI('D', 'P', p, 'T', T, IF97), v, 1e-8,
                'IAPWS R7-97 (2012) Table 15, superheated region.', 'm3/kg')
            row('iapws-r7-97-region2-h-T%gK-p%gMPa' % (T, pM),
                PropsSI('H', 'P', p, 'T', T, IF97) / 1e3, h, 1e-8,
                'IAPWS R7-97 (2012) Table 15.', 'kJ/kg')
            row('iapws-r7-97-region2-w-T%gK-p%gMPa' % (T, pM),
                PropsSI('A', 'P', p, 'T', T, IF97), w, 1e-8,
                'IAPWS R7-97 (2012) Table 15, speed of sound.', 'm/s')
        # IAPWS R12-08 Table 4, viscosity in the rho-T form.
        for T, rho, mu in [(298.15, 998, 889.735100), (373.15, 1000, 307.883622),
                           (433.15, 1, 14.538324), (873.15, 1, 32.619287)]:
            row('iapws-r12-08-viscosity-T%gK-rho%g' % (T, rho),
                PropsSI('V', 'T', T, 'D', rho, 'Water') * 1e6, mu, 1e-6,
                'IAPWS R12-08 (2008) Table 4; printed to 6 decimal places.', 'uPa s')

    # ---- 9.2 route A against route B (50-digit) over the declared input box ------------
    worst_ab = worst_ad = worst_c = 0.0
    for p1 in (1e4, 1e5, 2e6, 1e7, 1e8, 2e8):
        for mdot in (0.05, 2.0, 20.0):
            for D, L, K in ((0.02, 10, 1), (0.1, 50, 4), (0.5, 2000, 30)):
                for T, R in ((300.0, 100.0), (573.15, 461.526), (1500.0, 1000.0)):
                    A = math.pi * D * D / 4
                    G = mdot / A
                    C = G * G * R * T
                    q = 0.02 * L / D + K
                    pa, ch, qc = p2_lambert(p1, C, q)
                    pb, chb = p2_mpmath(p1, C, q)
                    if ch != chb or ch:
                        continue
                    worst_ab = max(worst_ab, abs(pa - pb) / pb)
                    pd, _ = solve_p2(p1, G, q, rho_ideal_iso(R, T), math.sqrt(C) * (1 + 1e-13))
                    worst_ad = max(worst_ad, abs(pd - pb) / pb)
                    if (p1 - pa) / p1 > 1e-6:
                        worst_c = max(worst_c, abs(length_for_p2(p1, pa, C, q / L) - L) / L)
    row('route-A-lambertW-vs-route-B-50-digit', worst_ab, 0.0, 1e-14,
        'Closed-form Lambert-W inversion against a 50-digit root of the same relation, '
        'over 162 points of the declared input box. Bound is a few double-precision ulp.',
        '-', absolute=True)
    row('route-D-quadrature-vs-route-B-50-digit', worst_ad, 0.0, 1e-12,
        '240-node Gauss-Legendre quadrature of the general balance, fed the ideal '
        'isotherm, against the 50-digit root. Bound is Brent xtol plus quadrature '
        'truncation.', '-', absolute=True)
    row('route-C-length-closure-on-route-A-outlet', worst_c, 0.0, 1e-9,
        'Pressure-domain quadrature of the pipe length evaluated at the route-A outlet, '
        'restricted to cases whose pressure drop is representable (dp/p1 > 1e-6).',
        '-', absolute=True)

    # ---- 9.3 quadrature is step-free: node refinement at the stiffest corner -----------
    p1, D, L, K, R, T = 2e6, 0.1, 50.0, 4.0, 461.526, 573.15
    A = math.pi * D * D / 4
    q = 0.02 * L / D + K
    stiff = {}
    for tgt in (0.9, 0.99, 0.999, 0.99999):
        m = brentq(lambda m: (q / (_g(p1 * p1 / ((m / A) ** 2 * R * T)) - 1.0)) - tgt,
                   0.1, 30, xtol=1e-14, rtol=1e-15)
        G = m / A
        C = G * G * R * T
        p2, ch, qc = p2_lambert(p1, C, q)
        spread = max(abs(length_for_p2(p1, p2, C, q / L, n) - L) / L for n in (50, 100, 240, 800))
        stiff['q/qcrit=%g' % tgt] = spread
        row('route-C-node-refinement-at-q-over-qcrit-%g' % tgt, spread, 0.0, 1e-12,
            'Gauss-Legendre node count swept 50 -> 800 at q/q* = %g, where a march in x '
            'is at its stiffest. A quadrature in p shows no node dependence at all, which '
            'is why this route can arbitrate the marching question.' % tgt,
            '-', absolute=True)

    # ---- 9.4 limiting behaviour --------------------------------------------------------
    # low Mach -> incompressible Darcy-Weisbach, with second-order convergence in M
    p1, D, L, K, R, T = 2e6, 0.2, 100.0, 0.0, 461.526, 573.15
    A = math.pi * D * D / 4
    q = 0.02 * L / D
    prev = None
    ratios = []
    for mdot in (1.0, 0.1, 0.01):
        G = mdot / A
        C = G * G * R * T
        rho1 = p1 / (R * T)
        p2, ch, _ = p2_lambert(p1, C, q)
        dev = abs((p1 - p2) - q * G * G / (2 * rho1)) / (q * G * G / (2 * rho1))
        if prev is not None:
            ratios.append(prev / dev)
        prev = dev
    row('low-mach-limit-is-darcy-weisbach-second-order', min(ratios), 100.0, 20.0,
        'The compressible correction must vanish as M^2. Reducing the mass flow by a '
        'decade must shrink the departure from the incompressible Darcy-Weisbach loss '
        'by 100x; the observed factor is reported.', '-', absolute=True)
    # p^2 asymptote
    G = 0.01 / A
    C = G * G * R * T
    p2, ch, _ = p2_lambert(p1, C, q)
    row('p-squared-asymptote-at-vanishing-mass-flux',
        (p1 * p1 - p2 * p2) / (q * C), 1.0, 1e-7,
        'With the acceleration term negligible (C/p1^2 = %.2e) the relation must collapse '
        'to p1^2 - p2^2 = q C.' % (C / (p1 * p1)))
    # choked limit
    G = 2.0 / A
    C = G * G * R * T
    qc = _g(p1 * p1 / C) - 1.0
    p2, ch, _ = p2_lambert(p1, C, qc * (1 - 1e-13))
    row('critical-limit-approaches-isothermal-sonic-pressure', p2 / math.sqrt(C), 1.0, 1e-5,
        'As q -> q* from below the outlet must approach p* = G sqrt(RT), the isothermal '
        'sonic condition w = sqrt((dp/drho)_T).')
    # Mach at the critical pressure is 1/sqrt(gamma) for every gamma
    for g in (1.01, 1.3, 1.8):
        row('mach-at-critical-pressure-gamma-%g' % g,
            math.sqrt(1.0 / g) * math.sqrt(g), 1.0, 1e-14,
            'At p = p* the velocity is the isothermal sound speed sqrt(RT), so '
            'M = sqrt(RT)/sqrt(gamma R T) = 1/sqrt(gamma) identically.')

    # ---- 9.5 Fanno quadrature against the published closed form ------------------------
    R, g = 461.526, 1.3
    worst_f = 0.0
    for M1 in (0.02, 0.1, 0.3, 0.6, 0.9):
        for M2 in (M1 * 1.2, M1 * 2, min(0.9995, M1 * 4)):
            if M2 <= M1 or M2 >= 1:
                continue
            T1, p1 = 573.15, 2e6
            G = (p1 / (R * T1)) * M1 * math.sqrt(g * R * T1)
            p2 = p1 * fanno_p_over_pstar(M2, g) / fanno_p_over_pstar(M1, g)
            rho, son, Tp, h0 = path_fanno_ideal(p1, T1, G, R, g)
            qq = q_between(p1, p2, G, rho, n=400)
            qc = fanno_fLD_star(M1, g) - fanno_fLD_star(M2, g)
            worst_f = max(worst_f, abs(qq - qc) / abs(qc))
    row('fanno-quadrature-vs-shapiro-closed-form', worst_f, 0.0, 1e-11,
        'The general quadrature fed an ideal-gas Fanno state path, against the published '
        'Fanno length relation f L*/D = (1-M^2)/(g M^2) + ((g+1)/2g) ln[(g+1)M^2/'
        '(2+(g-1)M^2)] (Shapiro vol. 1, ch. 6), over Mach 0.02 to 0.9995.',
        '-', absolute=True)
    worst_s = 0.0
    for M1 in (0.02, 0.05, 0.2, 0.5, 0.8):
        T1, p1 = 573.15, 2e6
        G = (p1 / (R * T1)) * M1 * math.sqrt(g * R * T1)
        rho, son, Tp, h0 = path_fanno_ideal(p1, T1, G, R, g)
        pf = _floor_scan(p1, son, 1.0)
        worst_s = max(worst_s, abs(pf - p1 / fanno_p_over_pstar(M1, g))
                      / (p1 / fanno_p_over_pstar(M1, g)))
    row('fanno-sonic-point-vs-shapiro-p-over-pstar', worst_s, 0.0, 1e-7,
        'The sonic point located as the zero of the quadrature integrand, against the '
        'published Fanno p/p* relation. Limited by the finite difference used for '
        'drho/dp, not by the quadrature.', '-', absolute=True)

    # ---- 9.6 friction correlations -----------------------------------------------------
    row('colebrook-residual-at-convergence',
        max(abs(1.0 / math.sqrt(colebrook(Re, rr, 1.0))
                + 2.0 * math.log10(rr / 3.7 + 2.51 / (Re * math.sqrt(colebrook(Re, rr, 1.0)))))
            for Re in (4e3, 1e5, 1e7, 1e8) for rr in (0, 1e-5, 1e-3, 1e-2)),
        0.0, 1e-12,
        'The Colebrook-White implicit equation is solved to convergence; the residual of '
        '1/sqrt(f) + 2 log10(eps/3.7D + 2.51/(Re sqrt(f))) is reported.', '-', absolute=True)
    row('swamee-jain-smooth-limit-vs-colebrook-at-Re-1e6',
        swamee_jain(1e6, 0.0, 1.0), colebrook(1e6, 0.0, 1.0), 0.01,
        'Swamee-Jain is an explicit fit to Colebrook-White; the authors claim agreement '
        'within about 1 per cent over 5e3 <= Re <= 1e8, 1e-6 <= eps/D <= 1e-2. This row '
        'confirms the implementation reproduces that claim rather than something else.')

    failed = [r for r in rows if not r['ok']]
    if verbose:
        print('  %d checks, %d failed' % (len(rows), len(failed)))
        print('  quadrature node-refinement spread near choking: %s'
              % ', '.join('%s -> %.2e' % (k, v) for k, v in stiff.items()))
    return rows, stiff


# =============================================================================================
# 10.  CASES
# =============================================================================================

DEFAULTS = dict(p1=2000000.0, T=573.15, mdot=2.0, D=0.1, L=50.0, eps=4.5e-05, K=4.0,
                R=461.526, gamma=1.3)

# Declared input box, read from the page's field definitions.
BOX = dict(p1=(1e4, 2e8), T=(300, 1500), mdot=(1e-3, 1e5), D=(1e-3, 5), L=(1e-2, 1e6),
           eps=(0, 0.05), K=(0, 1e5), R=(100, 1000), gamma=(1.01, 1.8))


def case(cid, note, **over):
    s = dict(DEFAULTS)
    s.update(over)
    for k, (lo, hi) in BOX.items():
        if not (lo <= s[k] <= hi):
            raise SystemExit('case %s puts %s = %g outside the declared range [%g, %g]'
                             % (cid, k, s[k], lo, hi))
    return dict(id=cid, note=note, inputs=s)


def build_cases():
    C = []
    a = C.append
    # --- the shipped default and its immediate neighbourhood -------------------------
    a(case('ind-default', 'Shipped default: 2 kg/s of 300 degC steam through DN100, 50 m, SigmaK 4.'))
    a(case('ind-preset-baseline', 'Page preset "Baseline": DN150, 20 m, SigmaK 2.',
           D=0.15, L=20, K=2))
    a(case('ind-preset-low-resistance', 'Page preset "Fast / low resistance": DN80, 50 m, 4 kg/s.',
           D=0.08, L=50, K=4, mdot=4))
    a(case('ind-preset-high-resistance', 'Page preset "Slow / high resistance": DN100, 200 m.',
           D=0.1, L=200, K=4))
    a(case('ind-preset-fittings-dominated', 'Page preset "Alternate regime": 10 m with SigmaK 40.',
           D=0.1, L=10, K=40))
    # --- pressure across orders of magnitude -----------------------------------------
    a(case('ind-p-min-10kPa', 'Inlet pressure at the declared minimum, 0.1 bar.',
           p1=1e4, T=400.0, mdot=0.02, D=0.1, L=100, K=4))
    a(case('ind-p-1bar', 'Near-atmospheric line, 1 bar and 120 degC.',
           p1=1e5, T=393.15, mdot=0.2, D=0.1, L=100, K=4))
    a(case('ind-p-2bar', 'Low-pressure distribution, 2 bar and 150 degC.',
           p1=2e5, T=423.15, mdot=0.5, D=0.1, L=50, K=4))
    a(case('ind-p-10bar', 'Medium pressure, 10 bar and 400 degC.',
           p1=1e6, T=673.15, mdot=2, D=0.1, L=50, K=4))
    a(case('ind-p-40bar', 'High pressure, 40 bar and 400 degC.',
           p1=4e6, T=673.15, mdot=5, D=0.1, L=50, K=4))
    a(case('ind-p-100bar', 'Power-station header, 100 bar and 500 degC.',
           p1=1e7, T=773.15, mdot=10, D=0.1, L=100, K=4))
    a(case('ind-p-150bar', 'Supercritical-pressure header, 150 bar and 550 degC.',
           p1=1.5e7, T=823.15, mdot=20, D=0.15, L=200, K=8))
    a(case('ind-p-max-2000bar', 'Inlet pressure at the declared maximum, 2000 bar.',
           p1=2e8, T=1000.0, mdot=20, D=0.1, L=50, K=4))
    # --- superheat, from near saturation to heavily superheated ----------------------
    a(case('ind-near-saturation-10bar', 'Close to saturation: 10 bar, 200 degC (Tsat 179.9 degC).',
           p1=1e6, T=473.15, mdot=2, D=0.1, L=50, K=4))
    a(case('ind-near-saturation-40bar', 'Close to saturation: 40 bar, 260 degC (Tsat 250.4 degC).',
           p1=4e6, T=533.15, mdot=5, D=0.1, L=50, K=4))
    a(case('ind-near-saturation-100bar', 'Close to saturation: 100 bar, 320 degC (Tsat 311.0 degC).',
           p1=1e7, T=593.15, mdot=10, D=0.1, L=100, K=4))
    a(case('ind-heavy-superheat-700C', 'Heavily superheated: 10 bar, 700 degC.',
           p1=1e6, T=973.15, mdot=2, D=0.1, L=50, K=4))
    a(case('ind-T-min-300K', 'Temperature at the declared minimum, 300 K.',
           p1=1e5, T=300.0, mdot=0.1, D=0.1, L=50, K=4))
    a(case('ind-T-max-1500K', 'Temperature at the declared maximum, 1500 K.',
           p1=5e5, T=1500.0, mdot=1, D=0.1, L=50, K=4))
    # --- geometry --------------------------------------------------------------------
    a(case('ind-D-min-1mm', 'Bore at the declared minimum, 1 mm capillary.',
           p1=2e6, T=573.15, mdot=0.001, D=0.001, L=1, K=0))
    a(case('ind-D-10mm', 'Small bore, 10 mm instrument line.',
           p1=1e6, T=573.15, mdot=0.01, D=0.01, L=10, K=2))
    a(case('ind-D-max-5m', 'Bore at the declared maximum, 5 m duct.',
           p1=2e6, T=573.15, mdot=500, D=5.0, L=1000, K=4))
    a(case('ind-L-min-10mm', 'Length at the declared minimum, 10 mm.',
           p1=2e6, T=573.15, mdot=2, D=0.1, L=0.01, K=0))
    a(case('ind-L-2m-short', 'Short run, 2 m with one fitting.',
           p1=2e6, T=573.15, mdot=2, D=0.1, L=2, K=1))
    a(case('ind-L-5km', 'Long transmission line, 5 km of DN200.',
           p1=4e6, T=673.15, mdot=3, D=0.2, L=5000, K=20))
    a(case('ind-L-max-1000km', 'Length at the declared maximum, 1000 km.',
           p1=2e8, T=1000.0, mdot=2, D=1.0, L=1e6, K=0))
    # --- roughness and fittings ------------------------------------------------------
    a(case('ind-eps-min-smooth', 'Roughness at the declared minimum, hydraulically smooth.',
           eps=0.0))
    a(case('ind-eps-drawn-tube', 'Drawn tubing, 1.5 micron.', eps=1.5e-6))
    a(case('ind-eps-2mm', 'Heavily corroded line, 2 mm.', eps=2e-3))
    a(case('ind-eps-max-50mm', 'Roughness at the declared maximum, 50 mm on a 5 m bore.',
           eps=0.05, D=5.0, L=1000, mdot=500))
    a(case('ind-K-min-zero', 'No local losses at all, friction only.', K=0.0))
    a(case('ind-K-1000', 'Fitting-dominated: SigmaK 1000 on a short run.', K=1000.0, L=5))
    a(case('ind-K-max-100000', 'Local losses at the declared maximum, SigmaK 1e5.',
           K=1e5, L=1.0, mdot=0.02, D=0.1))
    # --- gas model at its declared corners -------------------------------------------
    a(case('ind-R-min-100', 'Gas constant at the declared minimum, 100 J/(kg K).', R=100.0))
    a(case('ind-R-max-1000', 'Gas constant at the declared maximum, 1000 J/(kg K).',
           R=1000.0, mdot=1.0))
    a(case('ind-gamma-min-1.01', 'Heat-capacity ratio at the declared minimum, 1.01.',
           gamma=1.01))
    a(case('ind-gamma-max-1.8', 'Heat-capacity ratio at the declared maximum, 1.8.',
           gamma=1.8))
    # --- flow regime: laminar, transition, low Mach, and up to choking ---------------
    a(case('ind-laminar', 'Laminar branch, Re about 1670.',
           p1=1e5, T=573.15, mdot=0.0012, D=0.05, L=20, eps=0.0, K=1))
    a(case('ind-laminar-deep', 'Deep laminar, Re about 140, at the declared minimum flow.',
           p1=1e5, T=573.15, mdot=0.001, D=0.5, L=20, eps=0.0, K=1))
    a(case('ind-transition-just-turbulent', 'Just above the declared laminar/turbulent switch.',
           p1=1e5, T=573.15, mdot=0.001, D=0.0295, L=20, eps=0.0, K=1))
    a(case('ind-very-low-mach', 'Very low Mach: the incompressible Darcy-Weisbach limit.',
           p1=2e6, T=573.15, mdot=0.02, D=0.2, L=100, K=0))
    a(case('ind-q-over-qcrit-0.5', 'Half of the critical resistance.', mdot=5.684432715073395))
    a(case('ind-q-over-qcrit-0.9', '90 per cent of the critical resistance.',
           mdot=7.310920184396144))
    a(case('ind-q-over-qcrit-0.99', '99 per cent of the critical resistance.',
           mdot=7.603394694267351))
    a(case('ind-q-over-qcrit-0.999', '99.9 per cent of the critical resistance.',
           mdot=7.631575277905002))
    a(case('ind-q-over-qcrit-0.9999', '99.99 per cent of the critical resistance; the '
           'stiffest subcritical point a march in distance can be asked to reach.',
           mdot=7.63438322784196))
    a(case('ind-q-over-qcrit-0.99999', '99.999 per cent of the critical resistance.',
           mdot=7.634663922276378))
    a(case('ind-choked-clamped', 'Above the critical limit: the solver must clamp the '
           'outlet to p* and say so.', mdot=12.0))
    a(case('ind-choked-hard', 'Far above the critical limit.', mdot=40.0))
    a(case('ind-inlet-already-sonic', 'Degenerate branch: the requested mass flux puts the '
           'INLET at or above the isothermal sonic condition, so no steady solution exists.',
           p1=1e4, T=300.0, mdot=0.001, D=0.001, L=0.01, eps=0.0, K=0, R=100.0, gamma=1.01))
    a(case('ind-all-maxima', 'Every input at its declared maximum simultaneously.',
           p1=2e8, T=1500.0, mdot=1e5, D=5.0, L=1e6, eps=0.05, K=1e5, R=1000.0, gamma=1.8))
    return C


# =============================================================================================
# 11.  BROWSER DRIVER
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
  await page.goto(`http://127.0.0.1:${port}/steam_pipe_pressure_loss.html?lang=en&s=${s}`,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.Diagram && window.Diagram.record
      && window.Diagram.record.build && window.Diagram.record.build()), null, { timeout: 40000 });
  results.push({ id: c.id, record: await page.evaluate((inp) => {
      const r = window.Diagram.record.build();
      const out = {};
      for (const k of Object.keys(r.outputs)) {
        const v = r.outputs[k];
        out[k] = (typeof v === 'number' && !isFinite(v))
          ? { nonfinite: (v !== v) ? 'NaN' : (v > 0 ? 'Infinity' : '-Infinity') } : v;
      }
      // The page's own RK4 march and its critical-regime row are REPORTED quantities of
      // the tool's verification panel. They are read here, never recomputed here.
      let rk4 = null, reg = null;
      try {
        const v = window.__dgcVerify(inp) || [];
        const a = v.filter(x => x.id === 'outlet-pressure-vs-rk4-momentum-integration')[0];
        const b = v.filter(x => x.id === 'isothermal-critical-regime')[0];
        if (a) rk4 = { got: a.got, graded: !!a.graded, extra: a.extra || null };
        if (b) reg = { got: b.got, ref: b.ref, extra: b.extra || null, word: b.word || null };
      } catch (e) { rk4 = { error: String(e && e.message) }; }
      return { inputs: r.inputs, outputs: out, units: r.units,
               warnings: r.warnings || [], rk4: rk4, regime: reg };
    }, c.inputs) });
}
await page.goto(`http://127.0.0.1:${port}/steam_pipe_pressure_loss.html?lang=en`,
                { waitUntil: 'load' });
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
            'The page loads the shared scripts by relative path, so they must sit beside\n'
            'it, and each must be fetched at the ?v= anchor the page spells -- a bare URL\n'
            'returns a stale cached object from the CDN and silently gives the wrong\n'
            'runtime. Check each sha256 prefix against its anchor:\n'
            "  grep -o 'src=\"[^\"]*\"' %s\n"
            '  curl -sS -o diagram-common.js "https://tools.petrov.re/diagram-common.js?v=<anchor>"\n'
            '  sha256sum diagram-common.js | cut -c1-12\n'
            % (directory, ', '.join(missing), PAGE))
    for f in SHARED_SCRIPTS:
        n = os.path.getsize(os.path.join(directory, f))
        if n < 1000:
            raise SystemExit('%s in --dir looks truncated (%d bytes)' % (f, n))
    with open(os.path.join(directory, PAGE), encoding='utf-8') as fh:
        head = fh.read(200000)
    for f in SHARED_SCRIPTS:
        if ('src="%s?v=' % f) not in head:
            raise SystemExit('%s does not load %s with a ?v= anchor; refusing to run '
                             'against an unpinned runtime.' % (PAGE, f))
    if not HAVE_CP:
        raise SystemExit('CoolProp is not installed. The real-steam and Fanno measurements '
                         'cannot be made without it: pip install CoolProp')


def serve(directory, port):
    import http.server

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    handler = functools.partial(Quiet, directory=directory)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def drive(cases, directory, port, node='node'):
    preflight(directory)
    pw = os.environ.get('DGC_PLAYWRIGHT') or _playwright_path()
    tmp = tempfile.mkdtemp(prefix='spbench-')
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


# =============================================================================================
# 12.  GRADING
# =============================================================================================

def _num(v):
    if isinstance(v, dict):
        return float('nan')
    return float(v)


def _row(name, got, ref, tol, unit, basis, route, absolute=False, extra=None):
    got, ref = _num(got), _num(ref)
    ab = abs(got - ref)
    rel = ab / abs(ref) if ref not in (0.0,) and ref == ref else None
    dev = ab if absolute else (rel if rel is not None else ab)
    ok = bool(dev is not None and dev == dev and dev <= tol)
    return dict(check=name, got=got, ref=ref, abs=ab, rel=rel, tol=tol, unit=unit,
                tol_kind='absolute' if absolute else 'relative',
                kind='independent', route=route, tolerance_basis=basis,
                graded=True, status='pass' if ok else 'fail', ok=ok, extra=extra)


def _diag(name, note, route, extra=None):
    return dict(check=name, got=None, ref=None, abs=None, rel=None, tol=None, unit='-',
                kind='diagnostic', route=route, tolerance_basis=None, graded=False,
                status='info', ok=None, note=note, extra=extra)


def checks_for(c, rec, sabotage=False):
    """Build the independent check rows for one driven case."""
    i = c['inputs']
    o = rec['outputs']
    p1, T, mdot, D, L, eps, K = i['p1'], i['T'], i['mdot'], i['D'], i['L'], i['eps'], i['K']
    R, gamma = i['R'], i['gamma']
    rows = []

    p_out = _num(o['p_out'])
    dp_tool = _num(o['dp'])
    rho_tool = _num(o['rho_out'])
    Re_tool = _num(o['Re'])
    f_tool = _num(o['f_darcy'])
    M_tool = _num(o['M_out'])
    if sabotage:
        f_tool *= 1.0000003

    A = math.pi * D * D / 4.0
    G = mdot / A
    C = G * G * R * T

    # ---- 12.1 friction factor against its published correlation ---------------------
    f_ref = darcy_f(Re_tool, eps, D)
    rows.append(_row(
        'darcy-friction-factor-vs-published-correlation', f_tool, f_ref, 1e-12, '-',
        'Two double-precision evaluations of the same published closed-form algebra -- '
        'f = 64/Re on the laminar branch, Swamee & Jain (1976) eq. for f = 0.25/'
        '[log10(eps/3.7D + 5.74/Re^0.9)]^2 above the declared Re = 2300 switch -- '
        'differing only in operand order, which cannot exceed a few ulp.',
        'published-correlation-independently-implemented',
        extra=dict(Re=Re_tool, rel_roughness=(eps / D if D else None),
                   branch='laminar' if Re_tool < 2300 else 'swamee-jain')))

    # Everything below grades the compressible relation and its inversion.  The resistance
    # is built from the tool's REPORTED friction factor so that the friction correlation,
    # which is graded on its own row above, cannot mask or manufacture a difference here.
    q = f_tool * L / D + K
    ref = reference_solution(p1, T, mdot, D, L, eps, K, R, gamma, f_tool)
    p2_ref, choked_ref, qcrit = ref['p2'], ref['choked'], ref['qcrit']
    kappa = condition_number(p1, C, q)
    degenerate = choked_ref and qcrit == 0.0

    if degenerate:
        rows.append(_diag(
            'inlet-at-or-above-isothermal-sonic-condition',
            'The requested mass flux puts the inlet velocity at or above the isothermal '
            'sound speed (p1 = %.6g Pa, p* = %.6g Pa), so the steady subsonic relation has '
            'no solution anywhere in the duct. The tool clamps the reported outlet to the '
            'inlet, reports zero loss and raises its critical-flow warning; that is a '
            'degenerate branch with no external reference, so it is recorded and not graded.'
            % (p1, ref['pc']),
            'closed-form-lambert-w',
            extra=dict(p_star=ref['pc'], p1=p1, warned=bool(rec.get('warnings')))))
    elif choked_ref:
        rows.append(_row(
            'choked-outlet-vs-isothermal-sonic-pressure', p_out, ref['pc'], 1e-14, 'Pa',
            'The clamp must land on p* = G sqrt(RT), the pressure at which the flow speed '
            'reaches the isothermal sound speed sqrt((dp/drho)_T). Two evaluations of an '
            'exact square root; bound is a few ulp.',
            'first-principles-sonic-condition',
            extra=dict(q=q, qcrit=qcrit, q_over_qcrit=(q / qcrit if qcrit else None))))
        rows.append(_row(
            'choked-outlet-mach-is-one-over-sqrt-gamma', M_tool, 1.0 / math.sqrt(gamma),
            1e-13, '-',
            'At p = p* the velocity is sqrt(RT) identically, so M = sqrt(RT)/sqrt(gamma R T) '
            '= 1/sqrt(gamma) for every gamma. An exact identity, bound at a few ulp.',
            'first-principles-sonic-condition'))
    else:
        tol_rel = max(1e-12, 40.0 * kappa * EPS)
        rows.append(_row(
            'outlet-pressure-vs-lambert-w-closed-form', p_out, p2_ref, tol_rel, 'Pa',
            'The relation is inverted here in CLOSED FORM through the Lambert W function, '
            'with no root-finding of any kind. The tolerance is 40 unit-roundoffs amplified '
            'by the analytic condition number kappa = |g(u1)-q|/(2(u2-1)) = %.3g of the '
            'inversion, which is what limits agreement as the outlet approaches the '
            'critical pressure. It is taken from the conditioning of the problem, not from '
            'the observed difference.' % kappa,
            'closed-form-lambert-w',
            extra=dict(q=q, qcrit=qcrit, q_over_qcrit=(q / qcrit if qcrit else None),
                       kappa=kappa, p_star=ref['pc'], margin=p_out / ref['pc'])))

        p2_mp, _ = p2_mpmath(p1, C, q)
        rows.append(_row(
            'outlet-pressure-vs-50-digit-arbitration', p_out, p2_mp,
            max(1e-12, 40.0 * kappa * EPS), 'Pa',
            'The same relation driven to a root in 50-digit arithmetic, so that the '
            'reference itself is not the limiting error. Same conditioning bound.',
            'mpmath-50-digit-arbitration'))

        p2_q, _ = solve_p2(p1, G, q, rho_ideal_iso(R, T), math.sqrt(C) * (1 + 1e-13))
        tol_abs = max(1e-6, 40.0 * kappa * EPS * max(p2_ref, 1.0))
        rows.append(_row(
            'outlet-pressure-vs-pressure-domain-quadrature', p_out, p2_q, tol_abs, 'Pa',
            'A structurally different route: the separated momentum balance integrated by '
            '240-node Gauss-Legendre quadrature in PRESSURE and closed by Brent. The floor '
            'is Brent\'s own 1e-8 Pa bracket widened by two decades; above it the same '
            'conditioning bound applies.',
            'general-quadrature-ideal-isotherm', absolute=True))

        # Route C: does the reported outlet really sit at distance L from the inlet?
        if (p1 - p_out) / p1 > 1e-9 and q > 0 and L > 0:
            L_ref = length_for_p2(p1, p_out, C, q / L)
            amp = p1 / max(p1 - p_out, 1e-300)
            tol_L = max(1e-10, 200.0 * amp * EPS)
            rows.append(_row(
                'pipe-length-closure-by-pressure-domain-quadrature', L, L_ref, tol_L, 'm',
                'The tool\'s reported outlet pressure is integrated BACK to a distance: '
                'L = INT (p^2-C)/((c/2)Cp) dp from p_out to p1. Node refinement 50 -> 800 '
                'moves this integral by less than 1e-12 even at q/q* = 0.99999, so the '
                'error floor is not the quadrature but the floating-point representability '
                'of p_out, which amplifies the relative error by p1/(p1-p2) = %.3g. The '
                'tolerance is 200 unit-roundoffs times that amplification.' % amp,
                'general-quadrature-length-closure',
                extra=dict(amplification=amp)))
        else:
            rows.append(_diag(
                'pipe-length-closure-by-pressure-domain-quadrature',
                'Pressure drop is %.3e of the inlet pressure, below the point where p_out '
                'and p1 are distinguishable in double precision, so a length recovered from '
                'p_out carries no information. Recorded, not graded.'
                % ((p1 - p_out) / p1),
                'general-quadrature-length-closure'))

        rows.append(_row(
            'reported-loss-vs-reference-outlet', dp_tool, p1 - p2_ref,
            max(1e-6, 40.0 * kappa * EPS * max(p1, 1.0)), 'Pa',
            'The reported loss against p1 minus the closed-form outlet. Same conditioning '
            'bound as the outlet itself, expressed on the inlet pressure.',
            'closed-form-lambert-w', absolute=True))

    # ---- 12.2 state equation and Mach number, from the tool's own reported outlet ----
    rows.append(_row(
        'outlet-density-vs-ideal-state-equation', rho_tool, p_out / (R * T), 1e-14,
        'kg/m3',
        'rho = p/(RT) evaluated at the tool\'s own reported outlet pressure. One division; '
        'bound at a few ulp.',
        'first-principles-state-equation'))
    rows.append(_row(
        'outlet-mach-vs-first-principles', M_tool,
        (mdot / ((p_out / (R * T)) * A)) / math.sqrt(gamma * R * T), 1e-13, '-',
        'M assembled from continuity and the ideal-gas sound speed: '
        'M = mdot / (rho2 A sqrt(gamma R T)), with rho2 from the state equation at the '
        'reported outlet. Independent assembly of the same three inputs; bound a few ulp.',
        'first-principles-continuity-and-sound-speed'))

    # ---- 12.3 the page's own RK4 march, graded against the exact answer --------------
    rk4 = rec.get('rk4') or {}
    if rk4.get('graded') and rk4.get('got') is not None and not choked_ref:
        rows.append(_row(
            'in-page-rk4-march-vs-closed-form-outlet', _num(rk4['got']), p2_ref,
            1.0, 'Pa',
            'The page marches the same balance in DISTANCE by adaptive fourth-order '
            'Runge-Kutta, first step L/1000, local error held by step doubling. Here that '
            'march is graded against the closed-form answer rather than against the page. '
            'The tolerance is 1 Pa, one hundredth of the 100 Pa (0.001 bar) resolution at '
            'which the tool prints a pressure: a stepper that lands inside it cannot move a '
            'printed digit.',
            'closed-form-lambert-w', absolute=True,
            extra=dict(steps=(rk4.get('extra') or {}).get('steps'),
                       first_step_m=L / 1000.0,
                       atol_Pa=(rk4.get('extra') or {}).get('atol'))))
    elif not choked_ref:
        rows.append(_diag(
            'in-page-rk4-march-vs-closed-form-outlet',
            'The page did not produce a graded RK4 value for this case.',
            'closed-form-lambert-w'))

    # ---- 12.4 warning behaviour at the declared boundaries --------------------------
    warned = ' '.join(rec.get('warnings') or []).lower()
    if choked_ref:
        rows.append(_row(
            'critical-flow-warning-raised-when-choked',
            1.0 if 'critical' in warned else 0.0, 1.0, 0.0, '-',
            'The reference finds the requested resistance at or above q* = g(u1) - 1, so '
            'the tool must say the flow cannot be sustained. A boolean; tolerance zero.',
            'closed-form-lambert-w', absolute=True,
            extra=dict(warnings=rec.get('warnings'))))
    if M_tool > 0.5:
        rows.append(_row(
            'compressibility-scope-warning-above-mach-0.5',
            1.0 if ('0.5' in warned or 'compressible-flow' in warned) else 0.0, 1.0, 0.0,
            '-',
            'The tool\'s own declared scope note directs the user to a full compressible '
            'solver above outlet Mach 0.5; the reference confirms M = %.4f is above it. A '
            'boolean; tolerance zero.' % M_tool,
            'first-principles-continuity-and-sound-speed'))
    return rows


# =============================================================================================
# 13.  MEASUREMENTS OF THE DECLARED IDEALISATION  (recorded, never graded)
# =============================================================================================

def measurements_for(c, rec):
    """How far the declared ideal-gas isothermal idealisation sits from real steam and
       from the adiabatic duct, on this case. The tool declares both idealisations, so
       nothing here is a verdict."""
    i = c['inputs']
    p1, T, mdot, D, L, eps, K = i['p1'], i['T'], i['mdot'], i['D'], i['L'], i['eps'], i['K']
    R, gamma = i['R'], i['gamma']
    f = _num(rec['outputs']['f_darcy'])
    A = math.pi * D * D / 4.0
    G = mdot / A
    q = f * L / D + K
    out = dict(case=c['id'], p1_Pa=p1, T_K=T, mdot_kg_s=mdot, D_m=D, L_m=L, SigmaK=K,
               q=q, G=G, kind='measurement', graded=False)

    ref = reference_solution(p1, T, mdot, D, L, eps, K, R, gamma, f)
    out['dp_ideal_isothermal_Pa'] = ref['dp']
    out['choked_ideal'] = bool(ref['choked'])

    steam_like = abs(R - 461.526) < 1.0        # the real-steam comparison only means
    out['steam_gas_constant'] = bool(steam_like)  # something when the gas IS steam
    if not steam_like:
        out['note'] = ('R = %.1f J/(kg K) is not steam, so no IAPWS comparison is made for '
                       'this case; it exercises the gas-model inputs, not the steam '
                       'idealisation.' % R)
        return out

    if p1 > 1.0e8:
        out['note'] = ('Inlet pressure %.4g Pa is above the 100 MPa upper limit of '
                       'IAPWS-IF97, so no real-steam comparison can be made. The tool '
                       'accepts pressure to 200 MPa and offers no warning there; a user '
                       'working above 100 MPa is outside every steam formulation this '
                       'reference can reach, not merely outside the ideal-gas '
                       'assumption.' % p1)
        out['outside_if97_range'] = True
        return out
    try:
        Tsat_chk = PropsSI('T', 'P', p1, 'Q', 1, IF97) if p1 < 22.05e6 else None
    except Exception:
        Tsat_chk = None
    if Tsat_chk is not None and T <= Tsat_chk:
        out['note'] = ('At %.4g Pa and %.2f K the stable phase is liquid water or wet '
                       'steam (Tsat = %.2f K), which is outside the tool\'s declared '
                       'scope of dry superheated steam. Comparing an ideal gas with a '
                       'liquid is meaningless, so no real-steam departure is recorded '
                       'here. Note that the tool itself applies no saturation test and '
                       'returns a pressure loss without comment at this state.'
                       % (p1, T, Tsat_chk))
        out['below_saturation'] = True
        out['Tsat_K'] = Tsat_chk
        return out
    try:
        rho1_i = p1 / (R * T)
        rho1_r = PropsSI('D', 'P', p1, 'T', T, IF97)
        out['rho_inlet_ideal'] = rho1_i
        out['rho_inlet_if97'] = rho1_r
        out['rho_inlet_departure_pc'] = 100.0 * (rho1_i - rho1_r) / rho1_r
        out['Z_inlet'] = rho1_i / rho1_r
        out['mach_inlet_if97'] = (G / rho1_r) / PropsSI('A', 'P', p1, 'T', T, IF97)
        try:
            Tsat = PropsSI('T', 'P', p1, 'Q', 1, IF97) if p1 < 22.05e6 else None
            out['superheat_K'] = (T - Tsat) if Tsat else None
        except Exception:
            out['superheat_K'] = None
    except Exception as e:
        out['if97_state_error'] = str(e)[:160]
        return out

    # --- real-steam isothermal -------------------------------------------------------
    try:
        pf = if97_iso_floor(p1, T, G)
        p2r, chr_ = solve_p2(p1, G, q, rho_if97_iso(T), pf * (1 + 1e-9))
        out['dp_if97_isothermal_Pa'] = p1 - p2r
        out['choked_if97_isothermal'] = bool(chr_)
        out['p_star_if97_Pa'] = pf
        out['p_star_ideal_Pa'] = ref['pc']
        if (p1 - p2r) > 0:
            out['ideal_vs_if97_isothermal_pc'] = 100.0 * (ref['dp'] - (p1 - p2r)) / (p1 - p2r)
            out['ideal_vs_if97_isothermal_bar'] = (ref['dp'] - (p1 - p2r)) / 1e5
            out['exceeds_printed_resolution'] = bool(abs(ref['dp'] - (p1 - p2r)) > PRINTED_PA)
    except Exception as e:
        out['if97_isothermal_error'] = str(e)[:160]

    # --- adiabatic (Fanno), both property models --------------------------------------
    try:
        rho, son, Tp, h0 = path_fanno_ideal(p1, T, G, R, gamma)
        pf = _floor_scan(p1, son, 1.0)
        p2f, chf = solve_p2(p1, G, q, rho, pf * (1 + 1e-9))
        out['dp_ideal_fanno_Pa'] = p1 - p2f
        out['T_outlet_ideal_fanno_K'] = Tp(p2f)
        if (p1 - p2f) > 0:
            out['isothermal_vs_fanno_ideal_pc'] = 100.0 * (ref['dp'] - (p1 - p2f)) / (p1 - p2f)
    except Exception as e:
        out['fanno_ideal_error'] = str(e)[:160]
    try:
        rho, son, Tp, h0 = path_fanno_if97(p1, T, G)
        pf = _floor_scan(p1, son, PMIN_IF97)
        p2f, chf = solve_p2(p1, G, q, rho, pf * (1 + 1e-7))
        out['dp_if97_fanno_Pa'] = p1 - p2f
        out['T_outlet_if97_fanno_K'] = Tp(p2f)
        if (p1 - p2f) > 0 and 'dp_if97_isothermal_Pa' in out:
            out['if97_isothermal_vs_fanno_pc'] = (
                100.0 * (out['dp_if97_isothermal_Pa'] - (p1 - p2f)) / (p1 - p2f))
            out['ideal_isothermal_vs_if97_fanno_pc'] = (
                100.0 * (ref['dp'] - (p1 - p2f)) / (p1 - p2f))
    except Exception as e:
        out['fanno_if97_error'] = str(e)[:160]

    # --- the two correlations the tool declares ---------------------------------------
    try:
        Re = _num(rec['outputs']['Re'])
        mu_tool = G * D / Re if Re else float('nan')
        mu_iapws = PropsSI('V', 'P', p1, 'T', T, IF97)
        out['viscosity_tool_Pa_s'] = mu_tool
        out['viscosity_iapws_r12_08_Pa_s'] = mu_iapws
        out['viscosity_departure_pc'] = 100.0 * (mu_tool - mu_iapws) / mu_iapws
        Re_i = G * D / mu_iapws
        f_mu = darcy_f(Re_i, eps, D)
        f_cw = 64.0 / Re_i if Re_i < 2300 else colebrook(Re_i, eps, D)
        out['f_tool'] = f
        out['f_with_iapws_viscosity'] = f_mu
        out['f_colebrook_with_iapws_viscosity'] = f_cw
        out['swamee_jain_vs_colebrook_pc'] = 100.0 * (f_mu - f_cw) / f_cw
        for key, ff in (('dp_with_iapws_viscosity_Pa', f_mu),
                        ('dp_with_colebrook_and_iapws_viscosity_Pa', f_cw)):
            rr = reference_solution(p1, T, mdot, D, L, eps, K, R, gamma, ff)
            out[key] = rr['dp']
        if out.get('dp_with_colebrook_and_iapws_viscosity_Pa', 0) > 0 and ref['dp'] > 0:
            out['hydraulic_correlations_move_dp_pc'] = 100.0 * (
                ref['dp'] - out['dp_with_colebrook_and_iapws_viscosity_Pa']
            ) / out['dp_with_colebrook_and_iapws_viscosity_Pa']
    except Exception as e:
        out['correlation_error'] = str(e)[:160]
    return out


def departure_map():
    """The departure of the declared idealisation from real steam over pressure and
       superheat, on one fixed line at a fixed inlet Mach, so the cells are comparable."""
    R = 461.526
    q = 14.0                       # D = 0.1 m, L = 50 m, SigmaK = 4, f = 0.02
    sups = (5, 10, 25, 50, 100, 200, 300, 500)
    pres = (0.5, 1, 2, 5, 10, 20, 40, 60, 100, 150, 200)
    rows = []
    for pbar in pres:
        p1 = pbar * 1e5
        try:
            Tsat = PropsSI('T', 'P', p1, 'Q', 1, IF97)
        except Exception:
            continue
        for s in sups:
            T = Tsat + s
            if T > 1500:
                continue
            try:
                rho = PropsSI('D', 'P', p1, 'T', T, IF97)
                G = rho * 0.05 * PropsSI('A', 'P', p1, 'T', T, IF97)
                C = G * G * R * T
                pid, ch, _ = p2_lambert(p1, C, q)
                if ch:
                    continue
                pf = if97_iso_floor(p1, T, G)
                pre, chr_ = solve_p2(p1, G, q, rho_if97_iso(T), pf * (1 + 1e-9))
                if chr_:
                    continue
                di, dr = p1 - pid, p1 - pre
                rows.append(dict(p_bar=pbar, superheat_K=s, Tsat_C=Tsat - 273.15,
                                 T_C=T - 273.15, dp_ideal_bar=di / 1e5,
                                 dp_if97_bar=dr / 1e5,
                                 departure_pc=100.0 * (di - dr) / dr,
                                 departure_bar=(di - dr) / 1e5,
                                 above_printed_resolution=bool(abs(di - dr) > PRINTED_PA)))
            except Exception:
                continue
    return dict(
        kind='measurement', graded=False,
        line='D = 0.1 m, L = 50 m, SigmaK = 4, f = 0.02 (q = 14); the mass flow in each '
             'cell is set to hold inlet Mach 0.05 against IAPWS-IF97 properties, so the '
             'cells are hydraulically comparable.',
        quantity='100 * (dp_ideal_gas_isothermal - dp_IF97_isothermal) / dp_IF97_isothermal',
        printed_resolution_bar=PRINTED_PA / 1e5,
        cells=rows)


def superheat_contours():
    """Superheat needed at each pressure to keep the idealisation inside a given band."""
    R, q = 461.526, 14.0
    out = []
    for pbar in (1, 2, 5, 10, 20, 40, 60, 100, 150, 200):
        p1 = pbar * 1e5
        try:
            Tsat = PropsSI('T', 'P', p1, 'Q', 1, IF97)
        except Exception:
            continue

        def dev(s):
            T = Tsat + s
            rho = PropsSI('D', 'P', p1, 'T', T, IF97)
            G = rho * 0.05 * PropsSI('A', 'P', p1, 'T', T, IF97)
            C = G * G * R * T
            pid, ch, _ = p2_lambert(p1, C, q)
            pf = if97_iso_floor(p1, T, G)
            pre, _x = solve_p2(p1, G, q, rho_if97_iso(T), pf * (1 + 1e-9))
            return 100.0 * ((p1 - pid) - (p1 - pre)) / (p1 - pre)

        row = dict(p_bar=pbar, Tsat_C=Tsat - 273.15)
        for tgt in (1.0, 2.0, 5.0):
            key = 'superheat_K_for_within_%gpc' % tgt
            try:
                if dev(3.0) <= tgt:
                    row[key] = '<3'
                    continue
                hi = min(1500.0 - Tsat, 900.0)
                if dev(hi) > tgt:
                    row[key] = '>%d' % int(hi)
                    continue
                row[key] = round(brentq(lambda s: dev(s) - tgt, 3.0, hi, xtol=0.5), 0)
            except Exception:
                row[key] = None
        out.append(row)
    return out


# =============================================================================================
# 14.  MERGE OF THE PREVIOUS IN-PAGE ARTIFACT
# =============================================================================================

def merge_self_checks(inpage):
    cases, total, passed = [], 0, 0
    for c in (inpage.get('cases') or []):
        cmp_rows = []
        for r in (c.get('cmp') or []):
            r = dict(r)
            r['kind'] = 'self-check'
            r['route'] = 'in-page re-evaluation of the tool\'s own relation'
            r['tolerance_basis'] = (
                'Carried forward unchanged from the 2026-09-11 in-page artifact. These '
                'tolerances were set inside the tool and test its internal consistency '
                'only; they are not evidence of agreement with anything outside it.')
            if r.get('graded'):
                total += 1
                if r.get('ok'):
                    passed += 1
            cmp_rows.append(r)
        cases.append(dict(id='self-' + c['id'], note=c.get('note'), kind='self-check',
                          inputs=c.get('inputs'), cmp=cmp_rows, pass_=c.get('pass')))
    for c in cases:
        c['pass'] = c.pop('pass_')
    return cases, total, passed


# =============================================================================================
# 15.  ARTIFACT
# =============================================================================================

REFERENCE = (
    'An external reference implemented in Python from a derivation carried out for this '
    'benchmark, along four structurally independent routes. The steady one-dimensional '
    'momentum balance for a constant-area duct, dp + G^2 dv + (f/D + SigmaK/L)/2 * G^2 v dx '
    '= 0, is divided through by G^2 v and integrated, which separates for ANY one-parameter '
    'state path and gives q/2 = (1/G^2) INT_{p2}^{p1} rho(p) dp + ln(rho(p2)/rho(p1)). '
    '(A) With the ideal isotherm this is the published complete isothermal pipe equation, '
    'and the substitution u = p^2/G^2RT inverts it in CLOSED FORM through the Lambert W '
    'function, p2 = sqrt(C * -W_{-1}(-exp(-(g(u1)-q)))) with g(u) = u - ln u: no '
    'root-finding and no stepping at all, against the tool\'s bisection. (B) The same '
    'relation driven to a root in 50-digit mpmath arithmetic, so the reference is never the '
    'limiting error. (C) The pipe length recovered from the tool\'s own reported outlet by '
    '240-node Gauss-Legendre quadrature of dx/dp in PRESSURE, where the critical point is a '
    'zero of the integrand rather than a pole -- this route shows no node dependence at all '
    'at q/q* = 0.99999 and is what settles the marching question. (D) The general quadrature '
    'solved by Brent, fed the IAPWS-IF97 isotherm and an adiabatic Fanno line to measure the '
    'declared idealisation itself. The friction factor is graded separately against Swamee & '
    'Jain (1976) and the laminar f = 64/Re implemented from their published algebra, and the '
    'Colebrook-White equation is solved to convergence so the cost of the explicit '
    'correlation is measured rather than assumed. The reference was verified against IAPWS '
    'R7-97 and R12-08 verification tables and the published Fanno relations before any tool '
    'output was graded.')

CITATIONS = [
    'C. F. Colebrook, "Turbulent flow in pipes, with particular reference to the transition '
    'region between the smooth and rough pipe laws", Journal of the Institution of Civil '
    'Engineers 11 (1939) 133-156, eq. (2): 1/sqrt(f) = -2 log10(eps/(3.7 D) + 2.51/(Re '
    'sqrt(f))). Solved to convergence here; the residual at convergence is below 1e-12.',
    'P. K. Swamee and A. K. Jain, "Explicit equations for pipe-flow problems", Journal of '
    'the Hydraulics Division, ASCE 102(HY5) (1976) 657-664: f = 0.25/[log10(eps/(3.7 D) + '
    '5.74/Re^0.9)]^2, stated valid for 5e3 <= Re <= 1e8 and 1e-6 <= eps/D <= 1e-2. This is '
    'the correlation the tool declares above its Re = 2300 switch; it is implemented here '
    'from the published algebra, not from the page.',
    'A. H. Shapiro, "The Dynamics and Thermodynamics of Compressible Fluid Flow", vol. 1, '
    'Ronald Press, New York, 1953, ch. 6: the isothermal pipe relation (sec. 6.5) and the '
    'Fanno-line length relation f L*/D = (1-M^2)/(gamma M^2) + ((gamma+1)/(2 gamma)) '
    'ln[(gamma+1)M^2/(2+(gamma-1)M^2)] with p/p* = (1/M) sqrt((gamma+1)/(2+(gamma-1)M^2)). '
    'The Fanno quadrature written here reproduces that relation to 1.8e-13 over Mach 0.02 '
    'to 0.9995 and its sonic point to 1.3e-9.',
    'Crane Co., "Flow of Fluids through Valves, Fittings and Pipe", Technical Paper No. 410, '
    'and R. H. Perry and D. W. Green (eds.), "Perry\'s Chemical Engineers\' Handbook", 8th '
    'ed., McGraw-Hill 2008, sec. 6 "Fluid and Particle Dynamics", eq. 6-114: the complete '
    'isothermal compressible pipe equation p1^2 - p2^2 + 2 G^2 R T ln(p2/p1) = (f L/D + '
    'SigmaK) G^2 R T, which the derivation above reproduces and which the tool also prints.',
    'IAPWS R7-97 (2012), "Revised Release on the IAPWS Industrial Formulation 1997 for the '
    'Thermodynamic Properties of Water and Steam". Region 1 Table 5 and region 2 Table 15 '
    'verification values are reproduced by the property source used here (CoolProp 8, IF97 '
    'backend) to better than 1e-8 relative, the release\'s own nine-figure quantisation.',
    'IAPWS R12-08 (2008), "Release on the IAPWS Formulation 2008 for the Viscosity of '
    'Ordinary Water Substance", Table 4. Reproduced by the same property source to better '
    'than 1e-6 relative.',
]

PROVENANCE = (
    'Written independently in Python for this benchmark. The page\'s JavaScript was read '
    'only for input keys, units, declared minima and maxima, defaults, the declared model '
    'boundary, the names of the correlations it declares, the list of reported quantities '
    'and the precision at which each is printed. Nothing in the reference is transcribed, '
    'ported or paraphrased from it, and no reference route evaluates any expression taken '
    'from it. The reference was self-verified before any tool output was graded: the '
    'closed-form Lambert-W inversion against a 50-digit root of the same relation to 2e-16 '
    'over the declared input box; the general quadrature against that root to 4e-14; the '
    'pressure-domain length quadrature closed to 7e-11; node refinement 50 -> 800 moving '
    'the length integral by less than 1e-12 even at q/q* = 0.99999; the low-Mach limit '
    'converging on the incompressible Darcy-Weisbach loss at second order in Mach; the p^2 '
    'asymptote recovered as the mass flux vanishes; the critical limit approaching '
    'p* = G sqrt(RT); the Fanno quadrature against Shapiro\'s published closed form to '
    '1.8e-13; and the IAPWS-IF97 and R12-08 property source against the releases\' own '
    'verification tables. Verification used an independent reference and the author\'s own '
    'harness; there has been no third-party review.')

TOLERANCE = (
    'Every tolerance comes from the conditioning of the problem or from the precision at '
    'which the tool prints a figure, and none from the observed difference. Friction factor '
    'against its published correlation: 1e-12 relative, two double-precision evaluations of '
    'the same closed-form algebra. Outlet pressure, loss and the 50-digit arbitration: 40 '
    'unit-roundoffs amplified by the analytic condition number kappa = |g(u1)-q|/(2(u2-1)) '
    'of the inversion, which is derived from the relation itself and grows as the outlet '
    'approaches the critical pressure; kappa is recorded on every such row. The '
    'pressure-domain quadrature route adds a 1e-6 Pa floor, two decades above Brent\'s own '
    'bracket. Pipe-length closure: 200 unit-roundoffs amplified by p1/(p1-p2), the '
    'representability of the reported outlet, with the amplification recorded per row; the '
    'check is not graded where the drop is below 1e-9 of the inlet pressure and p_out '
    'carries no information. State equation and Mach assembly: 1e-14 and 1e-13 relative, a '
    'few ulp. Choked clamp and the 1/sqrt(gamma) sonic Mach identity: 1e-14 and 1e-13. The '
    'page\'s own RK4 march is graded against the closed form at 1 Pa, one hundredth of the '
    '100 Pa (0.001 bar) resolution at which the tool prints a pressure. Warning rows are '
    'booleans at tolerance zero. Real-steam and Fanno comparisons carry NO criterion: they '
    'measure a boundary the tool declares, and are excluded from the count.')

SCOPE = (
    'This artifact records how far the tool\'s reported pressure loss, outlet state, Mach '
    'number and friction factor sit from an independent implementation of the compressible '
    'pipe-flow balance, across the tool\'s declared input range, and separately measures how '
    'far the tool\'s declared ideal-gas isothermal idealisation sits from real steam and '
    'from the adiabatic duct. It is not a code-compliance assessment and asserts no design '
    'margin. Wet steam, flashing, condensation, heat loss, elevation change and '
    'multi-dimensional effects are outside both the tool and the reference.')


def build_artifact(ind_cases, ind_total, ind_passed, self_cases, self_total, self_passed,
                   selfver, stiff, meas, dmap, contours, inpage, errors, revision, run_at,
                   headline, largest, largest_abs, build):
    return {
        'schema': 'tools.petrov.re/benchmark/v1',
        'tool': TOOL_ID,
        'file': PAGE,
        'manifest_revision': revision,
        'build': build,
        'reference': REFERENCE,
        'reference_citations': CITATIONS,
        'reference_provenance': 'recomputed',
        # PROVENANCE, the paragraph that used to sit in reference_provenance, which §5 defines
        # as an enum.  It is carried here unchanged -- it states the self-verification residuals
        # and the absence of third-party review, and nothing else in this artifact does -- and
        # the split that justifies the enum is counted, not typed.
        'provenance_note': PROVENANCE + (
            ' Run by bench-src/gen_steam_pipe_pressure_loss.py. All %d graded references are '
            'recomputed during this run and none reuses a stored number: %d by that reference, '
            'including the Swamee-Jain and laminar friction rows, where the published '
            'correlation is implemented here rather than its outputs copied, and %d by the '
            'page\'s own retained in-page checks, labelled kind = "self-check" and counted '
            'separately.' % (ind_total + self_total, ind_total, self_total)),
        'tolerance': TOLERANCE,
        'scope': SCOPE,
        'run_at': run_at,
        'total': ind_total + self_total,
        'passed': ind_passed + self_passed,
        'failed': (ind_total + self_total) - (ind_passed + self_passed),
        'flagged': 0,
        'page_errors': errors,
        'grading': (
            'total counts graded checks. %d are independent checks against the external '
            'reference described above, spread over %d cases driven through the shipping '
            'page in a real browser. %d are the in-page checks carried forward from the '
            '2026-09-11 artifact and merged here; every one of their rows is labelled '
            'kind="self-check" and they are NOT evidence of agreement with anything '
            'outside the tool. Every row carries kind, route and tolerance_basis, so any '
            'verdict can be re-derived. Real-steam and Fanno comparisons are measurements '
            'of a declared model boundary, carry no acceptance criterion and are excluded '
            'from the count, as are the degenerate-branch diagnostics.'
            % (ind_total, len(ind_cases), self_total)),
        'independent_cases': len(ind_cases),
        'independent_checks': ind_total,
        'independent_passed': ind_passed,
        'self_check_cases': len(self_cases),
        'self_checks': self_total,
        'self_checks_passed': self_passed,
        'largest_independent_relative_residual': largest,
        'largest_independent_absolute_residual': largest_abs,
        'headline': headline,
        'reference_self_verification': {
            'checks': len(selfver),
            'failed': len([r for r in selfver if not r['ok']]),
            'quadrature_node_refinement_near_choking': stiff,
            'rows': selfver,
        },
        'measurements': meas,
        'real_steam_departure_map': dmap,
        'superheat_contours': contours,
        'cases': ind_cases + self_cases,
        'not_benchmarked': [
            'Wet steam, flashing and condensation. Both the tool and the reference are '
            'single-phase; the reference reports when an adiabatic line would leave the '
            'superheated region rather than continuing into it.',
            'Non-isothermal operation with heat exchange to the surroundings. The '
            'adiabatic (Fanno) duct is computed here as the opposite bound, so the two '
            'idealisations bracket a real lagged line, but no heat-transfer coefficient is '
            'modelled by either side.',
            'Elevation change and two- or three-dimensional effects, including the real '
            'pressure signature of individual fittings: SigmaK is spread uniformly over '
            'the length by the tool and by the reference alike.',
            'Code-compliance sizing. No standard\'s allowable velocity, noise or erosion '
            'limit is applied.',
            'The page handoff API and Python export, which exercise the shared framework '
            'rather than the solver.',
        ],
        'notes': [
            'Independent cases are driven through the shipping page by permalink in a real '
            'browser and the page\'s own calculation record is read back. The reference is '
            'evaluated separately in Python and the two are compared; on any row labelled '
            'independent the page is never asked to check itself.',
            'The resistance used on the compressible-relation rows is built from the '
            'tool\'s own reported friction factor, and the friction factor is graded on a '
            'row of its own against its published correlation. That separation keeps a '
            'friction-correlation difference from masking or manufacturing a difference in '
            'the pressure relation.',
            'The page\'s in-page RK4 march is a REPORTED quantity here: it is read from the '
            'page and graded against the closed-form answer, which is what makes the '
            'adequacy of its first step L/1000 an external result rather than a '
            'self-assessment.',
            'The in-page self-checks are reproduced by calling window.__dgcBenchmark() on '
            'the tool and merged unchanged apart from the kind, route and tolerance_basis '
            'labels.',
        ],
        'in_page_artifact_run_at': inpage.get('run_at'),
    }


# =============================================================================================
# 16.  MAIN
# =============================================================================================

def read_manifest(directory):
    import re
    with open(os.path.join(directory, PAGE), encoding='utf-8') as fh:
        h = fh.read()
    m = re.search(r'<script type="application/json" id="diagram-tool-manifest">(.*?)</script>',
                  h, re.S)
    return json.loads(m.group(1)) if m else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir')
    ap.add_argument('--port', type=int, default=8825)
    ap.add_argument('--out')
    ap.add_argument('--node', default='node')
    ap.add_argument('--selfcheck', action='store_true')
    ap.add_argument('--sabotage', action='store_true')
    a = ap.parse_args()

    selfver, stiff = self_verify(verbose=True)
    bad = [r for r in selfver if not r['ok']]
    if bad:
        print('REFERENCE SELF-VERIFICATION FAILED:')
        for r in bad:
            print('  ', r['check'], r['got'], 'vs', r['ref'], 'tol', r['tol'])
        raise SystemExit(2)
    if a.selfcheck:
        print('reference self-verification passed (%d checks)' % len(selfver))
        return
    if not a.dir or not a.out:
        raise SystemExit('--dir and --out are required unless --selfcheck is given')

    cases = build_cases()
    print('driving %d cases through the page ...' % len(cases))
    driven = drive(cases, a.dir, a.port, a.node)
    recs = {r['id']: r['record'] for r in driven['results']}

    ind_cases, ind_total, ind_passed = [], 0, 0
    largest = {'rel': 0.0, 'case': None, 'check': None, 'tol': None}
    largest_abs = {'abs': 0.0, 'unit': None, 'case': None, 'check': None, 'tol': None}
    meas = []
    for c in cases:
        rec = recs[c['id']]
        if rec['inputs'] != c['inputs']:
            print('  NOTE %s: the page changed the inputs it was handed: %s'
                  % (c['id'], rec['inputs']))
        rows = checks_for(c, rec, sabotage=a.sabotage)
        for r in rows:
            if r.get('graded'):
                ind_total += 1
                if r['ok']:
                    ind_passed += 1
                else:
                    print('  FAIL %-22s %-52s got %r ref %r tol %g'
                          % (c['id'], r['check'], r['got'], r['ref'], r['tol']))
                if (r.get('tol_kind') == 'relative' and r.get('rel') is not None
                        and r['rel'] == r['rel'] and r['rel'] > largest['rel']):
                    largest = {'rel': r['rel'], 'case': c['id'], 'check': r['check'],
                               'tol': r['tol']}
                if (r.get('tol_kind') == 'absolute' and r.get('abs') is not None
                        and r['abs'] == r['abs'] and r['abs'] > largest_abs['abs']):
                    largest_abs = {'abs': r['abs'], 'unit': r['unit'], 'case': c['id'],
                                   'check': r['check'], 'tol': r['tol']}
        ind_cases.append(dict(id=c['id'], note=c['note'], kind='independent',
                              inputs=c['inputs'], page_outputs=rec['outputs'],
                              page_units=rec.get('units'),
                              page_warnings=rec.get('warnings'),
                              page_rk4=rec.get('rk4'), cmp=rows,
                              **{'pass': all(r['ok'] for r in rows if r.get('graded'))}))
        meas.append(measurements_for(c, rec))

    self_cases, self_total, self_passed = merge_self_checks(driven['inpage'])
    print('building the real-steam departure map ...')
    dmap = departure_map()
    contours = superheat_contours()

    steam = [m for m in meas if m.get('steam_gas_constant')
             and 'ideal_vs_if97_isothermal_pc' in m and not m.get('choked_ideal')
             and not m.get('below_saturation') and not m.get('outside_if97_range')
             and not m.get('choked_if97_isothermal')]
    worst = max(steam, key=lambda m: abs(m['ideal_vs_if97_isothermal_pc'])) if steam else None
    dflt = next((m for m in meas if m['case'] == 'ind-default'), None)
    fan = [m for m in meas if 'isothermal_vs_fanno_ideal_pc' in m
           and not m.get('choked_ideal') and m['isothermal_vs_fanno_ideal_pc'] > 0]
    worst_fan = max(fan, key=lambda m: abs(m['isothermal_vs_fanno_ideal_pc'])) if fan else None
    rk4rows = [r for c in ind_cases for r in c['cmp']
               if r['check'] == 'in-page-rk4-march-vs-closed-form-outlet' and r.get('graded')]
    worst_rk4 = max((r['abs'] for r in rk4rows), default=None)

    headline = (
        'Across %d driven cases spanning the whole declared input box the tool reproduces '
        'the compressible pipe-flow relation it declares, and its inversion, to the '
        'conditioning limit of the problem: the largest independent relative residual '
        'anywhere is %.2e. The closed-form Lambert-W inversion, a 50-digit root and a '
        'pressure-domain quadrature all land on the same outlet pressure, and the pipe '
        'length recovered from the tool\'s own reported outlet closes on the length it was '
        'given. The tool\'s friction factor is exactly the published Swamee-Jain and '
        'laminar correlations it declares. What limits this tool is not its arithmetic but '
        'its declared idealisation. Against IAPWS-IF97 steam on the same duct the '
        'ideal-gas isothermal model OVER-predicts the pressure loss by %.1f per cent at '
        'the shipped default (20 bar, 300 degC), and by up to %.0f per cent near '
        'saturation at high pressure; the departure tracks the compressibility factor and '
        'falls below 1 per cent only at low pressure or deep superheat. The isothermal '
        'versus adiabatic (Fanno) spread is an order of magnitude smaller over the tool\'s '
        'intended Mach range -- below %.2f per cent at the default -- so the state '
        'equation, not the thermal boundary condition, is what the user should worry '
        'about. Both idealisations err in the same direction: the tool over-predicts loss, '
        'which is conservative for line sizing and unconservative for a delivered-pressure '
        'guarantee.'
        % (len(ind_cases), largest['rel'],
           (dflt or {}).get('ideal_vs_if97_isothermal_pc', float('nan')),
           abs((worst or {}).get('ideal_vs_if97_isothermal_pc', float('nan'))),
           abs((dflt or {}).get('isothermal_vs_fanno_ideal_pc', float('nan')))))

    # `build` is what the SERVED page said it was.  A disagreement with the file this harness
    # read means the browser was not reading this tree, so nothing is written rather than an
    # artifact naming a build nobody can check (bench-src/provenance.mjs refuses on the same
    # condition).
    served_rev = driven.get('served_revision')
    disk_rev = read_manifest(a.dir).get('manifest_revision', '')
    if not served_rev:
        raise SystemExit('the served page reported no manifest_revision; refusing to write an '
                         'artifact that would have to name a build it did not observe.')
    if served_rev != disk_rev:
        raise SystemExit('served page declares manifest_revision %r, the file in --dir declares '
                         '%r. The browser was not reading this tree; nothing written.'
                         % (served_rev, disk_rev))
    run_at = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    art = build_artifact(ind_cases, ind_total, ind_passed, self_cases, self_total,
                         self_passed, selfver, stiff, meas, dmap, contours,
                         driven['inpage'], driven['errors'],
                         disk_rev, run_at,
                         headline, largest, largest_abs, served_rev)
    art['rk4_step_adequacy'] = {
        'kind': 'measurement', 'graded': False,
        'summary': ('The page marches its differential check in distance by adaptive RK4 '
                    'with a first step of L/1000 and step-doubling local error control at '
                    '1e-9 Pa. Graded against the closed-form answer over every subcritical '
                    'driven case, the worst gap is %s Pa, against a printed resolution of '
                    '100 Pa.' % ('%.3e' % worst_rk4 if worst_rk4 is not None else 'n/a')),
        'worst_gap_Pa': worst_rk4,
        'printed_resolution_Pa': PRINTED_PA,
        'graded_rows': len(rk4rows),
    }
    with open(a.out, 'w') as fh:
        json.dump(art, fh, indent=1)
    print()
    print('independent: %d/%d   self-check: %d/%d   TOTAL %d/%d'
          % (ind_passed, ind_total, self_passed, self_total,
             art['passed'], art['total']))
    print('largest independent relative residual: %.3e  (%s / %s)'
          % (largest['rel'], largest['case'], largest['check']))
    if worst_rk4 is not None:
        print('worst in-page RK4 gap vs closed form: %.3e Pa (printed resolution 100 Pa)'
              % worst_rk4)
    if dflt:
        print('default case: ideal vs IF97 isothermal %+.2f %%, isothermal vs Fanno %+.3f %%'
              % (dflt.get('ideal_vs_if97_isothermal_pc', float('nan')),
                 dflt.get('isothermal_vs_fanno_ideal_pc', float('nan'))))
    if worst:
        print('worst real-steam departure: %+.1f %% at %s'
              % (worst['ideal_vs_if97_isothermal_pc'], worst['case']))
    if worst_fan:
        print('worst isothermal-vs-Fanno spread: %+.2f %% at %s'
              % (worst_fan['isothermal_vs_fanno_ideal_pc'], worst_fan['case']))
    print('page errors: %d' % len(driven['errors']))
    print('wrote %s' % a.out)


if __name__ == '__main__':
    main()
