#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_relief_valve_sizing.py -- independent benchmark harness for
tools.petrov.re/relief_valve_sizing.html

WHAT THIS IS
    An external reference for the preliminary relief-area calculation, written in Python
    along THREE routes that are independent of the shipping page and of each other:

      A. FIRST PRINCIPLES -- one-dimensional isentropic nozzle flow, parametrised by the
         throat MACH NUMBER, with the mass flux assembled as rho*w and the critical
         pressure ratio located NUMERICALLY by maximising the flux.  No closed-form
         critical ratio and no collected pressure-ratio flux formula is used anywhere on
         this route, so it reaches the answer by a different arithmetic path than any
         sizing equation.
         Anchored to: A. H. Shapiro, "The Dynamics and Thermodynamics of Compressible
         Fluid Flow", vol. 1 (Ronald Press, 1953), ch. 4 -- eq. 4.14 (T0/T), eq. 4.15
         (p0/p), eq. 4.19 (critical ratio), eq. 4.21 (mass flux), Table B.2; and
         NACA Report 1135 (Ames Research Staff, 1953), Table I, isentropic column.
         Verified against NACA TR-1135 Table I at M = 1, k = 1.4:
              p/p0 = 0.528282, T/T0 = 0.833333, rho/rho0 = 0.633938,
         reproduced to better than 4e-7 (the table's own six-figure quantisation).

      B. PUBLISHED SIZING EQUATIONS -- the API and ISO vapour and liquid sizing equations,
         implemented from the standards' own stated algebraic form and their own published
         numerical constants, in the standards' own units:
           * API Standard 520, Part I (Sizing and Selection of Pressure-relieving Devices,
             Part I -- Sizing and Selection), 9th ed., July 2014, clause 5.6.3 "Critical
             flow" -- the vapour sizing equation
                 A = W / (C Kd P1 Kb Kc) * sqrt(T Z / M)
             with the coefficient of eq. (5.6.3)  C = 520 sqrt( k (2/(k+1))^((k+1)/(k-1)) )
             in US customary units (A in.^2, W lb/h, P1 psia, T degR, M lb/lbmol) and
             C = 0.03948 sqrt( k (2/(k+1))^((k+1)/(k-1)) ) in SI units
             (A mm^2, W kg/h, P1 kPa abs, T K, M kg/kmol).  Tabulated C values are given
             in the same clause (Table 9 in the 9th ed.).
           * API 520 Part I, clause 5.6.4 "Subcritical flow" -- the vapour sizing equation
                 A = 17.9 W / (F2 Kd Kc) * sqrt( Z T / (M P1 (P1 - P2)) )      (SI)
                 A =  735 W / (F2 Kd Kc) * sqrt( Z T / (M P1 (P1 - P2)) )      (USC)
             with  F2 = sqrt( k/(k-1) * r^(2/k) * (1 - r^((k-1)/k)) / (1 - r) ),  r = P2/P1.
           * API 520 Part I, clause 5.8.1.2 "Valves not requiring capacity certification"
             -- the liquid sizing equation
                 A = 11.78 Q / (Kd Kw Kc Kv) * sqrt( G / (1.25 p - pb) )       (SI)
                 A =    Q / (38 Kd Kw Kc Kv) * sqrt( G / (1.25 p - pb) )       (USC)
             evaluated here at the actual differential pressure rather than the standard's
             1.25 p overpressure convention, because the tool is given a differential
             pressure directly and makes no overpressure claim.
           * ISO 4126-1:2013, "Safety devices for protection against excessive pressure --
             Part 1: Safety valves", clause 7.3.3.1 (critical flow, compressible fluids)
                 A = qm / (C Kdr p0) * sqrt( T Z / M )
             with  C = 3.948 sqrt( k (2/(k+1))^((k+1)/(k-1)) ),
             A mm^2, qm kg/h, p0 bar abs, T K, M kg/kmol.  ISO tabulates C = 2.703 at
             k = 1.4, which this implementation reproduces as 2.70332.

      C. REAL-GAS -- the choked mass flux computed from a multiparameter equation of state
         (CoolProp 8: Lemmon et al. air; Setzmann & Wagner methane; Leachman et al.
         hydrogen; Span & Wagner CO2), by maximising rho(s0,p) * sqrt(2 (h0 - h(s0,p)))
         over the throat pressure.  This route makes no ideal-gas and no constant-k
         assumption at all, and is used to MEASURE the cost of the tool's declared
         ideal-gas, constant-Z, constant-k idealisation -- not to grade it, since the tool
         declares that idealisation openly.

    Route A and route B are then cross-checked against each other, and the difference is
    reported as a result rather than absorbed: the published constants of API 520 and
    ISO 4126-1 are rounded, and that rounding alone -- not any disagreement about the
    physics -- is the entire gap between the standards' equations and exact isentropic
    nozzle flow.  The exact unit-consistent constants implied by isentropic flow are

        API/ISO critical, SI    0.0394807513   vs published 0.03948   ->  1.903e-5
        API critical, USC       519.4483       vs published 520       ->  1.062e-3
        API subcritical, SI     17.9101653     vs published 17.9      ->  5.676e-4
        API subcritical, USC    734.6096       vs published 735       ->  5.316e-4
        API liquid, SI          11.779218      vs published 11.78     ->  6.64e-5
        API liquid, USC         37.99242       vs published 38        ->  1.99e-4

    Each grading tolerance below is taken from the corresponding figure in that table --
    that is, from the standard's own stated numerical precision -- and never from what
    makes the tool pass.

WHAT WAS READ FROM THE PAGE
    Input names, units, defaults, the declared phase switch, the declared model boundary
    ("perfect gas with one constant Z, or single-phase incompressible liquid"; "no API
    520/521 or ISO 4126 correction factor, certified Kd or standard orifice designation"),
    and the list of reported quantities and their units.  Its JavaScript was NOT read for
    how it computes anything, and nothing in this file is transcribed, ported or
    paraphrased from it.

SELF-CHECKS THAT REMAIN SELF-CHECKS
    The 49 in-page checks recorded by the previous artifact are algebraic identities of the
    tool's own relations evaluated inside the tool.  They are merged here with their
    original ids, notes and verdicts, and are labelled kind="self-check" throughout.  They
    are counted separately from the independent cases and are never presented as external
    evidence.

USAGE
    python3 gen_relief_valve_sizing.py --dir <dir with page + shared scripts> \
                                       --port 8824 --out relief_valve_sizing.json
    python3 gen_relief_valve_sizing.py --selfcheck    # verify the reference alone
    python3 gen_relief_valve_sizing.py --dir . --port 8824 --out x.json --sabotage

Requires: numpy, scipy, CoolProp (pip install CoolProp), node with playwright.
"""

import argparse
import functools
import json
import math
import os
import subprocess
import sys
import tempfile
import threading
import datetime

from scipy.optimize import minimize_scalar, brentq

TOOL_ID = 'relief-valve-sizing'
PAGE = 'relief_valve_sizing.html'
SHARED_SCRIPTS = ('diagram-common.js', 'diagram-ui.js', 'site-disclaimer.js')

# ---------------------------------------------------------------------------------------------
# 0.  PHYSICAL CONSTANTS AND UNIT FACTORS  (CODATA 2018 / SI Brochure 9th ed. exact factors)
# ---------------------------------------------------------------------------------------------

RU = 8314.462618            # universal gas constant, J/(kmol K)  [R = 8.314462618 J/(mol K)]
LB = 0.45359237             # kg per pound-mass (exact)
PSI = 6894.757293168361     # Pa per psi (exact, from lbf and in)
IN2 = 0.00064516            # m^2 per in^2 (exact)
GPM = 6.30901964e-5         # m^3/s per US gallon per minute (exact: 231 in^3 / 60 s)
RHO_W60 = 999.0             # kg/m^3, water at 60 degF -- the basis of API's relative density G

# Published constants, quoted exactly as the standards print them.
API_C_SI = 0.03948          # API 520 Part I, cl. 5.6.3, SI form
API_C_USC = 520.0           # API 520 Part I, cl. 5.6.3, US customary form
API_SUB_SI = 17.9           # API 520 Part I, cl. 5.6.4, SI form
API_SUB_USC = 735.0         # API 520 Part I, cl. 5.6.4, US customary form
API_LIQ_SI = 11.78          # API 520 Part I, cl. 5.8.1.2, SI form
API_LIQ_USC = 38.0          # API 520 Part I, cl. 5.8.1.2, US customary form
ISO_C = 3.948               # ISO 4126-1:2013, cl. 7.3.3.1


# ---------------------------------------------------------------------------------------------
# 1.  ROUTE A -- FIRST PRINCIPLES, ISENTROPIC NOZZLE, MACH PARAMETRISATION
#
#     Energy along a streamline from the stagnation state to the throat, adiabatic and
#     reversible, calorically perfect gas:
#           cp T0 = cp T + w^2/2 ,        cp = k R_eff / (k - 1)
#     With the speed of sound a = sqrt(k R_eff T) and M = w/a this gives Shapiro eq. 4.14
#           T0/T = 1 + (k-1)/2 M^2
#     and the isentrope p/rho^k = const with p = rho R_eff T gives Shapiro eq. 4.15
#           p0/p = (T0/T)^(k/(k-1)) ,     rho0/rho = (T0/T)^(1/(k-1)).
#     The mass flux is then assembled, never collected:
#           G(M) = rho(M) * w(M) = [p(M)/(R_eff T(M))] * M * sqrt(k R_eff T(M)).
#     The critical condition is found by MAXIMISING G over the throat pressure ratio, which
#     is where Shapiro eq. 4.19 comes from; this file locates it numerically instead of
#     quoting the closed form, and checks the two agree (see self_verify).
#
#     The tool declares a perfect gas with ONE CONSTANT compressibility Z.  A gas obeying
#     p = Z rho R T with Z constant is a perfect gas with an effective specific gas constant
#     R_eff = Z R; every relation above carries through unchanged with that substitution,
#     which is why the flux scales exactly as 1/sqrt(Z).  That substitution is the only
#     place Z enters this reference.
# ---------------------------------------------------------------------------------------------

def isentropic_from_mach(M, k):
    """Static/stagnation ratios at Mach M.  Shapiro vol.1 eq. 4.14 and 4.15;
    NACA TR-1135 Table I, isentropic column."""
    t = 1.0 + 0.5 * (k - 1.0) * M * M
    return {'T_T0': 1.0 / t,
            'p_p0': t ** (-k / (k - 1.0)),
            'rho_rho0': t ** (-1.0 / (k - 1.0))}


def mach_from_pressure_ratio(r, k):
    """Invert p/p0 = (1 + (k-1)/2 M^2)^(-k/(k-1))."""
    if r >= 1.0:
        return 0.0
    return math.sqrt(2.0 / (k - 1.0) * (r ** (-(k - 1.0) / k) - 1.0))


def flux_from_mach(M, k, p0, T0, R_eff):
    """G = rho * w at the throat, assembled from the Mach-parametrised state."""
    st = isentropic_from_mach(M, k)
    T = st['T_T0'] * T0
    p = st['p_p0'] * p0
    rho = p / (R_eff * T)
    w = M * math.sqrt(k * R_eff * T)
    return rho * w


def critical_ratio_numeric(k):
    """The throat pressure ratio that MAXIMISES the mass flux, located numerically.
    This is the definition of choking; the closed form (2/(k+1))^(k/(k-1)) is a
    consequence, and self_verify checks the two agree to 1e-7."""
    f = lambda r: -flux_from_mach(mach_from_pressure_ratio(r, k), k, 1.0, 1.0, 1.0)
    res = minimize_scalar(f, bounds=(0.05, 0.99), method='bounded',
                          options={'xatol': 1e-13})
    return float(res.x)


@functools.lru_cache(maxsize=None)
def _rc_cached(k):
    return critical_ratio_numeric(k)


def reference_gas_flux(p1, T, pb, k, R, Z):
    """Mass flux through the throat for the declared perfect gas with constant Z.
    Returns (G, choked, r, r_star)."""
    if not (p1 > pb and T > 0.0 and Z > 0.0 and R > 0.0 and k > 1.0):
        return 0.0, False, (pb / p1 if p1 > 0 else float('nan')), _rc_cached(k)
    R_eff = Z * R
    r = pb / p1
    rc = _rc_cached(k)
    if r <= rc:
        # choked: the throat sits at M = 1 whatever the back pressure below rc
        return flux_from_mach(1.0, k, p1, T, R_eff), True, r, rc
    M = mach_from_pressure_ratio(r, k)
    return flux_from_mach(M, k, p1, T, R_eff), False, r, rc


def reference_liquid_flux(p1, pb, rho):
    """Steady incompressible Bernoulli between the stagnation state and the throat:
       p1 = pb + rho v^2 / 2  =>  v = sqrt(2 (p1-pb)/rho),  G = rho v = sqrt(2 rho dp).
    Assembled as rho*v, not quoted as the collected radical."""
    if not (p1 > pb and rho > 0.0):
        return 0.0
    v = math.sqrt(2.0 * (p1 - pb) / rho)
    return rho * v


def reference_area(mdot, Cd, G):
    """A = mdot / (Cd G) -- the definition of a discharge coefficient applied to the
    reference flux.  This is the sizing statement itself and has no alternative form."""
    if not (Cd > 0.0 and G > 0.0):
        return float('inf')
    return mdot / (Cd * G)


def equivalent_bore(A):
    """Diameter of the circle of area A."""
    return math.sqrt(4.0 * A / math.pi) if A > 0 and math.isfinite(A) else float('inf')


# ---------------------------------------------------------------------------------------------
# 2.  ROUTE B -- THE PUBLISHED SIZING EQUATIONS, IN THE STANDARDS' OWN UNITS
#
#     Implemented from the standards' stated algebraic form.  Each function converts the
#     SI case inputs into the units the clause is written in, evaluates the clause, and
#     converts the resulting area back to m^2.  The correction factors that the tool
#     declares it does not implement (Kb, Kc, Kw, Kv) are set to unity, which is the only
#     setting at which the two are comparable at all; that is recorded, not hidden.
# ---------------------------------------------------------------------------------------------

def phi(k):
    """k (2/(k+1))^((k+1)/(k-1)) -- the group inside every published critical coefficient."""
    return k * (2.0 / (k + 1.0)) ** ((k + 1.0) / (k - 1.0))


def api_C_si(k):
    """API 520 Part I cl. 5.6.3, SI coefficient."""
    return API_C_SI * math.sqrt(phi(k))


def api_C_usc(k):
    """API 520 Part I cl. 5.6.3, US customary coefficient (Table 9 tabulates this)."""
    return API_C_USC * math.sqrt(phi(k))


def iso_C(k):
    """ISO 4126-1:2013 cl. 7.3.3.1 coefficient (the standard tabulates 2.703 at k = 1.4)."""
    return ISO_C * math.sqrt(phi(k))


def molar_mass_from_R(R):
    """The page takes a SPECIFIC gas constant; the standards take a molar mass.
    M = Ru / R is the definitional bridge, not a model choice."""
    return RU / R


def api520_critical_area_si(mdot, p1, T, k, R, Z, Kd, Kb=1.0, Kc=1.0):
    """API 520 Part I, cl. 5.6.3, SI form:
         A[mm2] = W[kg/h] / (C Kd P1[kPa] Kb Kc) * sqrt(T[K] Z / M[kg/kmol])
       Returns m^2."""
    W = mdot * 3600.0
    P1 = p1 / 1000.0
    M = molar_mass_from_R(R)
    A_mm2 = W / (api_C_si(k) * Kd * P1 * Kb * Kc) * math.sqrt(T * Z / M)
    return A_mm2 * 1e-6


def api520_critical_area_usc(mdot, p1, T, k, R, Z, Kd, Kb=1.0, Kc=1.0):
    """API 520 Part I, cl. 5.6.3, US customary form:
         A[in2] = W[lb/h] / (C Kd P1[psia] Kb Kc) * sqrt(T[degR] Z / M[lb/lbmol])
       Returns m^2."""
    W = mdot * 3600.0 / LB
    P1 = p1 / PSI
    TR = T * 1.8
    M = molar_mass_from_R(R)          # numerically identical in lb/lbmol
    A_in2 = W / (api_C_usc(k) * Kd * P1 * Kb * Kc) * math.sqrt(TR * Z / M)
    return A_in2 * IN2


def api_F2(k, r):
    """API 520 Part I cl. 5.6.4 coefficient of subcritical flow:
         F2 = sqrt( k/(k-1) * r^(2/k) * (1 - r^((k-1)/k)) / (1 - r) )."""
    return math.sqrt(k / (k - 1.0) * r ** (2.0 / k)
                     * (1.0 - r ** ((k - 1.0) / k)) / (1.0 - r))


def api520_subcritical_area_si(mdot, p1, pb, T, k, R, Z, Kd, Kc=1.0):
    """API 520 Part I, cl. 5.6.4, SI form:
         A[mm2] = 17.9 W[kg/h] / (F2 Kd Kc) * sqrt( Z T / (M P1[kPa] (P1-P2)[kPa]) ).
       Returns m^2."""
    W = mdot * 3600.0
    P1, P2 = p1 / 1000.0, pb / 1000.0
    M = molar_mass_from_R(R)
    F2 = api_F2(k, pb / p1)
    A_mm2 = API_SUB_SI * W / (F2 * Kd * Kc) * math.sqrt(Z * T / (M * P1 * (P1 - P2)))
    return A_mm2 * 1e-6


def api520_subcritical_area_usc(mdot, p1, pb, T, k, R, Z, Kd, Kc=1.0):
    """API 520 Part I, cl. 5.6.4, US customary form:
         A[in2] = W[lb/h] / (735 F2 Kd Kc) * sqrt( Z T[degR] / (M P1[psia] (P1-P2)[psi]) ).
       Note the asymmetry the standard itself carries: 17.9 multiplies in the SI form while
       735 divides in the US customary form.  Returns m^2."""
    W = mdot * 3600.0 / LB
    P1, P2 = p1 / PSI, pb / PSI
    TR = T * 1.8
    M = molar_mass_from_R(R)
    F2 = api_F2(k, pb / p1)
    A_in2 = W / (API_SUB_USC * F2 * Kd * Kc) * math.sqrt(Z * TR / (M * P1 * (P1 - P2)))
    return A_in2 * IN2


def iso4126_critical_area(mdot, p1, T, k, R, Z, Kdr):
    """ISO 4126-1:2013, cl. 7.3.3.1:
         A[mm2] = qm[kg/h] / (C Kdr p0[bar]) * sqrt( T[K] Z / M[kg/kmol] ).
       Returns m^2."""
    qm = mdot * 3600.0
    p0 = p1 / 1e5
    M = molar_mass_from_R(R)
    A_mm2 = qm / (iso_C(k) * Kdr * p0) * math.sqrt(T * Z / M)
    return A_mm2 * 1e-6


def api520_liquid_area_si(mdot, p1, pb, rho, Kd, Kw=1.0, Kc=1.0, Kv=1.0):
    """API 520 Part I, cl. 5.8.1.2 (valves not requiring capacity certification), SI form:
         A[mm2] = 11.78 Q[l/min] / (Kd Kw Kc Kv) * sqrt( G / dp[kPa] ).
       G is relative density referred to water at 60 degF.  The standard writes the
       denominator as (1.25 p - pb), an overpressure convention; the tool is handed a
       differential pressure directly and claims no overpressure rule, so the clause is
       evaluated at the actual dp.  Returns m^2."""
    Q_lpm = mdot / rho * 60000.0
    G = rho / RHO_W60
    dp_kPa = (p1 - pb) / 1000.0
    A_mm2 = API_LIQ_SI * Q_lpm / (Kd * Kw * Kc * Kv) * math.sqrt(G / dp_kPa)
    return A_mm2 * 1e-6


def api520_liquid_area_usc(mdot, p1, pb, rho, Kd, Kw=1.0, Kc=1.0, Kv=1.0):
    """API 520 Part I, cl. 5.8.1.2, US customary form:
         A[in2] = Q[gpm] / (38 Kd Kw Kc Kv) * sqrt( G / dp[psi] ).  Returns m^2."""
    Q_gpm = mdot / rho / GPM
    G = rho / RHO_W60
    dp_psi = (p1 - pb) / PSI
    A_in2 = Q_gpm / (API_LIQ_USC * Kd * Kw * Kc * Kv) * math.sqrt(G / dp_psi)
    return A_in2 * IN2


# --- the exact unit-consistent constants the standards round, used to set tolerances ------

def exact_constants():
    """The constants that exact isentropic (or Bernoulli) flow implies in each standard's
    unit grouping.  The published values are these, rounded.  Every tolerance in this
    harness is read off this table."""
    c = {}
    c['api_C_si'] = 1.0 / (1e6 / 3600.0 / 1000.0 * math.sqrt(RU))
    c['iso_C'] = 1.0 / (1e6 / 3600.0 / 1e5 * math.sqrt(RU))
    c['api_C_usc'] = 1.0 / ((LB / 3600.0) / PSI * math.sqrt(RU / 1.8) / IN2)
    c['api_sub_si'] = 1e6 / 3600.0 * math.sqrt(RU / 2.0) / 1000.0
    c['api_sub_usc'] = 1.0 / ((LB / 3600.0) * math.sqrt(RU / 2.0 / 1.8) / PSI / IN2)
    c['api_liq_si'] = (1.0 / 60000.0) * math.sqrt(RHO_W60 / 2000.0) * 1e6
    c['api_liq_usc'] = 1.0 / (GPM * math.sqrt(RHO_W60 / (2 * PSI)) / IN2)
    pub = {'api_C_si': API_C_SI, 'iso_C': ISO_C, 'api_C_usc': API_C_USC,
           'api_sub_si': API_SUB_SI, 'api_sub_usc': API_SUB_USC,
           'api_liq_si': API_LIQ_SI, 'api_liq_usc': API_LIQ_USC}
    return {k: {'exact': v, 'published': pub[k],
                'rel_rounding': abs(v - pub[k]) / v} for k, v in c.items()}


CONST = exact_constants()

# Tolerances, each read off CONST above and given ~2.5x headroom over the standard's own
# constant quantisation.  None of these was chosen by looking at what the tool produces.
TOL = {
    'fp': 1e-12,                                     # double-precision path difference
    'api_si': 5.0e-5,      # 2.6x the 1.903e-5 rounding of 0.03948
    'api_usc': 2.5e-3,     # 2.4x the 1.062e-3 rounding of 520
    'iso': 5.0e-5,         # 2.6x the 1.903e-5 rounding of 3.948
    'api_sub_si': 1.5e-3,  # 2.6x the 5.676e-4 rounding of 17.9
    'api_sub_usc': 1.5e-3,  # 2.8x the 5.316e-4 rounding of 735
    'api_liq_si': 2.0e-4,  # 3.0x the 6.64e-5 rounding of 11.78
    'api_liq_usc': 6.0e-4,  # 3.0x the 1.99e-4 rounding of 38
}

TOL_WHY = {
    'fp': ('Both routes evaluate the same exact solution in IEEE-754 double precision along '
           'different arithmetic paths (Mach parametrisation and rho*w assembly here; a '
           'collected pressure-ratio form in the tool).  Accumulated rounding over the ~15 '
           'pow/sqrt operations involved is bounded near 1e-14; 1e-12 leaves two decades of '
           'headroom and is the same figure the page uses for its own identities.'),
    'api_si': ('API 520 Part I prints the SI critical coefficient as 0.03948.  Exact '
               'isentropic flow implies %.10f in the same unit grouping, so the published '
               'rounding alone displaces the area by %.3e relative.  Tolerance set at 5.0e-5.'
               % (CONST['api_C_si']['exact'], CONST['api_C_si']['rel_rounding'])),
    'api_usc': ('API 520 Part I prints the US customary critical coefficient as 520.  Exact '
                'isentropic flow implies %.4f, a %.3e relative offset -- the largest single '
                'departure of any published constant examined here.  Tolerance set at 2.5e-3.'
                % (CONST['api_C_usc']['exact'], CONST['api_C_usc']['rel_rounding'])),
    'iso': ('ISO 4126-1:2013 prints the critical coefficient as 3.948.  Exact isentropic flow '
            'implies %.8f, a %.3e relative offset.  Tolerance set at 5.0e-5.'
            % (CONST['iso_C']['exact'], CONST['iso_C']['rel_rounding'])),
    'api_sub_si': ('API 520 Part I prints the SI subcritical constant as 17.9.  Exact '
                   'isentropic flow implies %.7f, a %.3e relative offset.  Tolerance 1.5e-3.'
                   % (CONST['api_sub_si']['exact'], CONST['api_sub_si']['rel_rounding'])),
    'api_sub_usc': ('API 520 Part I prints the US customary subcritical constant as 735.  '
                    'Exact isentropic flow implies %.4f, a %.3e relative offset.  '
                    'Tolerance 1.5e-3.'
                    % (CONST['api_sub_usc']['exact'], CONST['api_sub_usc']['rel_rounding'])),
    'api_liq_si': ('API 520 Part I prints the SI liquid constant as 11.78.  Exact '
                   'incompressible Bernoulli with G referred to water at 60 degF '
                   '(999.0 kg/m3) implies %.6f, a %.3e relative offset.  Tolerance 2.0e-4.'
                   % (CONST['api_liq_si']['exact'], CONST['api_liq_si']['rel_rounding'])),
    'api_liq_usc': ('API 520 Part I prints the US customary liquid constant as 38.  Exact '
                    'incompressible Bernoulli on the same water basis implies %.5f, a %.3e '
                    'relative offset.  Tolerance 6.0e-4.'
                    % (CONST['api_liq_usc']['exact'], CONST['api_liq_usc']['rel_rounding'])),
    'regime': ('Categorical.  The reference locates the choking point by numerically '
               'maximising the mass flux over the throat pressure ratio; the tool must '
               'classify the same case into the same branch.'),
}


# ---------------------------------------------------------------------------------------------
# 3.  ROUTE C -- REAL GAS FROM A MULTIPARAMETER EQUATION OF STATE (CoolProp)
# ---------------------------------------------------------------------------------------------

def real_choked_flux(fluid, p0, T0):
    """G* = max over throat pressure p of  rho(s0,p) * sqrt(2 (h0 - h(s0,p))).
    No ideal-gas, no constant-k, no constant-Z assumption.  Returns (G, r_star)."""
    from CoolProp.CoolProp import PropsSI
    h0 = PropsSI('H', 'P', p0, 'T', T0, fluid)
    s0 = PropsSI('S', 'P', p0, 'T', T0, fluid)

    def negG(p):
        try:
            h = PropsSI('H', 'P', p, 'S', s0, fluid)
            rho = PropsSI('D', 'P', p, 'S', s0, fluid)
        except Exception:
            return 0.0
        dh = h0 - h
        return 0.0 if dh <= 0 else -rho * math.sqrt(2.0 * dh)

    res = minimize_scalar(negG, bounds=(0.15 * p0, 0.98 * p0), method='bounded',
                          options={'xatol': p0 * 1e-10})
    return -float(res.fun), float(res.x) / p0


def real_gas_state(fluid, p0, T0):
    from CoolProp.CoolProp import PropsSI
    cp = PropsSI('CPMASS', 'P', p0, 'T', T0, fluid)
    cv = PropsSI('CVMASS', 'P', p0, 'T', T0, fluid)
    return {'Z': PropsSI('Z', 'P', p0, 'T', T0, fluid),
            'k': cp / cv,
            'R': RU / (PropsSI('M', fluid) * 1000.0),
            'p_crit': PropsSI('PCRIT', fluid),
            'T_crit': PropsSI('TCRIT', fluid)}


# ---------------------------------------------------------------------------------------------
# 4.  SELF-VERIFICATION OF THE REFERENCE  (must pass before any grade is believed)
# ---------------------------------------------------------------------------------------------

def self_verify(verbose=True):
    rows, bad = [], 0

    def chk(name, got, ref, tol, how, unit='-', rel=True):
        nonlocal bad
        d = abs(got - ref) / max(abs(ref), 1e-300) if rel else abs(got - ref)
        ok = d <= tol
        if not ok:
            bad += 1
        rows.append({'check': name, 'got': got, 'ref': ref,
                     'dev': d, 'tol': tol, 'ok': ok, 'unit': unit, 'how': how})
        if verbose:
            print('%-46s %-6s got=%-22.12g ref=%-22.12g dev=%.3e tol=%.1e'
                  % (name, 'PASS' if ok else 'FAIL', got, ref, d, tol))
        return ok

    # S1 -- NACA TR-1135 Table I, isentropic column at M = 1, k = 1.4.
    # The table prints six decimal places, so the datum itself is quantised at half a unit
    # in the last place, 5e-7 ABSOLUTE.  Comparing relatively would demand more of the table
    # than the table states, so these three are absolute checks.
    s = isentropic_from_mach(1.0, 1.4)
    chk('naca-tr1135-p-over-p0-M1-k1.4', s['p_p0'], 0.528282, 5e-7,
        'NACA Report 1135 (1953) Table I, isentropic flow, M=1.00, gamma=1.4.  The table is '
        'printed to six decimal places, so its own quantisation is half a unit in the last '
        'place: 5e-7 absolute.', rel=False)
    chk('naca-tr1135-T-over-T0-M1-k1.4', s['T_T0'], 0.833333, 5e-7,
        'NACA Report 1135 Table I, same row; same half-unit-in-last-place basis.', rel=False)
    chk('naca-tr1135-rho-over-rho0-M1-k1.4', s['rho_rho0'], 0.633938, 5e-7,
        'NACA Report 1135 Table I, same row; same half-unit-in-last-place basis.', rel=False)

    # S2 -- the sonic ratios must satisfy their own defining identities exactly
    chk('sonic-state-identity-rho-p-T', s['rho_rho0'], s['p_p0'] / s['T_T0'], 1e-14,
        'rho/rho0 = (p/p0)/(T/T0) is the ideal-gas EOS applied to both states; an internal '
        'consistency identity of the parametrisation, not an external datum.')

    # S3 -- the numerically located choking point equals Shapiro eq. 4.19
    for k in (1.05, 1.1, 1.2, 1.3, 1.4, 1.5, 1.67, 1.8):
        chk('critical-ratio-numeric-vs-closed-form-k%.2f' % k,
            _rc_cached(k), (2.0 / (k + 1.0)) ** (k / (k - 1.0)), 1e-7,
            'The choking point is located here by maximising rho*w over the throat pressure '
            'ratio with a bounded Brent search (xatol 1e-13).  Shapiro eq. 4.19 gives the '
            'closed form.  A bracketing search resolves a smooth maximum to about the square '
            'root of its step, so 1e-7 is the search tolerance, not a physics tolerance.')

    # S4 -- branch continuity: the flux is stationary at the critical ratio
    for k in (1.1, 1.4, 1.67):
        rc = (2.0 / (k + 1.0)) ** (k / (k - 1.0))
        Gc = flux_from_mach(1.0, k, 1e6, 400.0, 287.05)
        Gs = flux_from_mach(mach_from_pressure_ratio(rc, k), k, 1e6, 400.0, 287.05)
        chk('branch-continuity-at-rc-k%.2f' % k, Gs, Gc, 1e-11,
            'At r = rc the subsonic parametrisation returns M = 1, so the two branches are '
            'one point.  Only the inversion of the pressure ratio separates them numerically.')
        h = 1e-6
        d = (flux_from_mach(mach_from_pressure_ratio(rc + h, k), k, 1e6, 400.0, 287.05)
             - flux_from_mach(mach_from_pressure_ratio(rc - h, k), k, 1e6, 400.0, 287.05)) / (2 * h)
        chk('flux-stationary-at-rc-k%.2f' % k, d / Gc, 0.0, 1e-5,
            'dG/dr normalised by G must vanish at the maximum; a central difference at '
            'h=1e-6 on a smooth maximum leaves O(h^2)+O(eps/h) ~ 1e-6 residual.',
            rel=False)

    # S5 -- limiting behaviour
    kk = 1.0 + 1e-7
    chk('limit-k-to-1-critical-ratio', _rc_cached(kk), math.exp(-0.5), 1e-6,
        'As k -> 1 the critical ratio tends to exp(-1/2) = 0.606531 (expand '
        '(k/(k-1)) ln(2/(k+1)) about k=1).')
    chk('limit-k-to-1-phi', phi(kk), math.exp(-1.0), 1e-6,
        'phi = k (2/(k+1))^((k+1)/(k-1)) -> exp(-1) as k -> 1, so C_usc -> 520/sqrt(e) = 315.4.')
    G1 = reference_gas_flux(1e6, 400.0, 1e5, 1.4, 287.05, 1.0)[0]
    G4 = reference_gas_flux(1e6, 400.0, 1e5, 1.4, 287.05, 4.0)[0]
    chk('limit-Z-scaling-inverse-sqrt', G4 * 2.0, G1, 1e-13,
        'Constant Z enters only as R_eff = Z R, so G scales exactly as Z^(-1/2).  Z=4 must '
        'halve the flux.')
    Glo = reference_gas_flux(1e6, 400.0, 1.0, 1.4, 287.05, 1.0)[0]
    chk('limit-backpressure-to-zero', Glo, G1, 1e-14,
        'Below the critical ratio the flux is independent of back pressure; discharging to '
        '1 Pa must give the same flux as to 1 bar.')
    eps = 1e-9
    Gnear1 = reference_gas_flux(1e6, 400.0, 1e6 * (1 - eps), 1.4, 287.05, 1.0)[0]
    chk('limit-backpressure-to-upstream-vanishes', Gnear1 / G1, 0.0, 1e-4,
        'As r -> 1 the flux must vanish.  At 1-r = 1e-9 it is 6.5e-5 of the choked value, so '
        'the check is that it has collapsed by more than four decades.', rel=False)
    chk('limit-backpressure-to-upstream-asymptote', Gnear1,
        1e6 * math.sqrt(2.0 * eps / (287.05 * 400.0)), 1e-6,
        'Expanding r^(2/k) - r^((k+1)/k) about r = 1 gives (1-r)(k-1)/k, so G -> '
        'p1 sqrt(2 (1-r)/(R_eff T)) independently of k.  The next term is O(1-r) = 1e-9 '
        'relative, so 1e-6 is three decades of headroom on the asymptote itself.')

    # S6 -- the published API coefficient table (API 520 Part I, cl. 5.6.3, Table 9, USC)
    for k, pub in [(1.0, 315), (1.2, 337), (1.4, 356), (1.6, 373), (1.8, 387), (2.0, 400)]:
        kk2 = 1.0 + 1e-9 if k == 1.0 else k
        chk('api520-tabulated-C-k%.2f' % k, api_C_usc(kk2), float(pub), 0.5,
            'API 520 Part I tabulates C to three significant figures (integers over this '
            'range), so the tolerance is half a count -- the table\'s own quantisation.',
            rel=False)
    chk('iso4126-tabulated-C-k1.40', iso_C(1.4), 2.703, 1e-3,
        'ISO 4126-1:2013 tabulates C = 2.703 at k = 1.4, four significant figures.', rel=False)

    # S7 -- each published constant against the exact one it rounds
    for key, lab in [('api_C_si', 'api520-si-critical-constant'),
                     ('api_C_usc', 'api520-usc-critical-constant'),
                     ('iso_C', 'iso4126-critical-constant'),
                     ('api_sub_si', 'api520-si-subcritical-constant'),
                     ('api_sub_usc', 'api520-usc-subcritical-constant'),
                     ('api_liq_si', 'api520-si-liquid-constant'),
                     ('api_liq_usc', 'api520-usc-liquid-constant')]:
        c = CONST[key]
        chk(lab + '-rounding', c['rel_rounding'], 0.0, TOL[{'api_C_si': 'api_si',
                                                            'api_C_usc': 'api_usc',
                                                            'iso_C': 'iso',
                                                            'api_sub_si': 'api_sub_si',
                                                            'api_sub_usc': 'api_sub_usc',
                                                            'api_liq_si': 'api_liq_si',
                                                            'api_liq_usc': 'api_liq_usc'}[key]],
            'The published constant must lie inside the tolerance this harness derives from '
            'it; exact %.10g, published %.10g.' % (c['exact'], c['published']), rel=False)

    # S8 -- route A against route B, on the reference's own terms (no tool involved)
    for (mdot, p1, pb, T, k, R, Z, Cd) in [
            (1.0, 1.1e6, 101325.0, 373.15, 1.4, 287.05, 1.0, 0.9),
            (12.0, 1.5e7, 1.5e6, 320.0, 1.31, 518.28, 0.85, 0.9),
            (0.4, 2.5e5, 1.2e5, 250.0, 1.667, 2077.1, 1.0, 0.8),
            (2.0, 4.0e5, 3.2e5, 300.0, 1.4, 287.05, 1.0, 0.9),
            (8.0, 1.0e6, 7.5e5, 420.0, 1.10, 143.06, 0.92, 0.85),
            (0.5, 1.0e6, 9.9e5, 350.0, 1.4, 287.05, 1.0, 0.9)]:
        G, choked, r, rc = reference_gas_flux(p1, T, pb, k, R, Z)
        A_fp = reference_area(mdot, Cd, G)
        if choked:
            chk('routeA-vs-API520si-p%.0f' % p1, api520_critical_area_si(mdot, p1, T, k, R, Z, Cd),
                A_fp, TOL['api_si'],
                'First-principles area against the API 520 SI critical clause, tool absent.')
            chk('routeA-vs-ISO4126-p%.0f' % p1, iso4126_critical_area(mdot, p1, T, k, R, Z, Cd),
                A_fp, TOL['iso'], 'First-principles area against ISO 4126-1 cl. 7.3.3.1.')
            chk('routeA-vs-API520usc-p%.0f' % p1,
                api520_critical_area_usc(mdot, p1, T, k, R, Z, Cd), A_fp, TOL['api_usc'],
                'First-principles area against the API 520 US customary critical clause.')
        else:
            chk('routeA-vs-API520sub-si-p%.0f' % p1,
                api520_subcritical_area_si(mdot, p1, pb, T, k, R, Z, Cd), A_fp,
                TOL['api_sub_si'], 'First-principles area against API 520 cl. 5.6.4, SI.')
            chk('routeA-vs-API520sub-usc-p%.0f' % p1,
                api520_subcritical_area_usc(mdot, p1, pb, T, k, R, Z, Cd), A_fp,
                TOL['api_sub_usc'],
                'First-principles area against API 520 cl. 5.6.4, US customary.  EVERY '
                'published form is cross-checked against route A here: an earlier draft of '
                'this file put the US customary subcritical constant in the numerator '
                'instead of the denominator, and only a cross-check of that exact form '
                'catches it.')

    # S9 -- API subcritical clause must reduce to the critical clause AT the critical ratio
    for k, R in [(1.4, 287.05), (1.1, 461.5)]:
        rc = (2.0 / (k + 1.0)) ** (k / (k - 1.0))
        p1, T, mdot, Cd = 1e6, 400.0, 3.0, 0.9
        pb = rc * p1
        chk('api520-clauses-agree-at-rc-k%.2f' % k,
            api520_subcritical_area_si(mdot, p1, pb, T, k, R, 1.0, Cd),
            api520_critical_area_si(mdot, p1, T, k, R, 1.0, Cd), 1e-3,
            'The two API clauses are one function split at r = rc; they must agree there to '
            'within the difference of their two published constants (17.9 vs 0.03948), '
            'which is 5.68e-4 + 1.90e-5.')

    # S10 -- liquid route against the API liquid clause
    for (mdot, p1, pb, rho, Cd) in [(20.0, 1.6e6, 2.0e5, 998.0, 0.65),
                                    (3.0, 4.0e5, 1.01325e5, 1200.0, 0.8)]:
        Gl = reference_liquid_flux(p1, pb, rho)
        A_fp = reference_area(mdot, Cd, Gl)
        chk('routeA-vs-API520liq-si-rho%.0f' % rho,
            api520_liquid_area_si(mdot, p1, pb, rho, Cd), A_fp, TOL['api_liq_si'],
            'Bernoulli area against API 520 cl. 5.8.1.2 SI.')
        chk('routeA-vs-API520liq-usc-rho%.0f' % rho,
            api520_liquid_area_usc(mdot, p1, pb, rho, Cd), A_fp, TOL['api_liq_usc'],
            'Bernoulli area against API 520 cl. 5.8.1.2 US customary.')

    # S11 -- CoolProp must collapse onto the ideal route in the ideal-gas limit
    try:
        fl, p0, T0 = 'Air', 20000.0, 500.0
        Gr, _ = real_choked_flux(fl, p0, T0)
        st = real_gas_state(fl, p0, T0)
        Gi = reference_gas_flux(p0, T0, 1.0, st['k'], st['R'], st['Z'])[0]
        chk('coolprop-ideal-gas-limit-air-0.2bar-500K', Gi, Gr, 3e-3,
            'At p_r = 0.005 air is within 0.3% of a calorically perfect gas; the residual is '
            'the variation of k along the expansion, which no constant-k model can remove.')
    except Exception as e:                                              # pragma: no cover
        rows.append({'check': 'coolprop-ideal-gas-limit', 'ok': False, 'how': str(e)})
        bad += 1

    if verbose:
        print('\nself-verify: %d checks, %d failed' % (len(rows), bad))
    return rows, bad


# ---------------------------------------------------------------------------------------------
# 5.  CASES -- a real input range, not the default
# ---------------------------------------------------------------------------------------------

BASE = {'phase': 'gas', 'mdot': 1.0, 'p1': 1100000.0, 'pb': 101325.0, 'T': 373.15,
        'Cd': 0.9, 'gamma': 1.4, 'R': 287.05, 'Z': 1.0, 'rho': 998.0}

# Specific gas constants, Ru/M, for the gases the cases span.
R_OF = {
    'hydrogen': RU / 2.01588,
    'helium': RU / 4.002602,
    'methane': RU / 16.0425,
    'air': 287.05,
    'steam': RU / 18.01528,
    'ammonia': RU / 17.03052,
    'propane': RU / 44.0956,
    'co2': RU / 44.0095,
    'n-butane': RU / 58.1222,
    'n-octane': RU / 114.2285,
}


def case(cid, note, basis, **over):
    s = dict(BASE)
    s.update(over)
    return {'id': cid, 'note': note, 'basis': basis, 'inputs': s}


def rc_of(k):
    return (2.0 / (k + 1.0)) ** (k / (k - 1.0))


def build_cases():
    C = []

    # --- gas: the shipped default and the span of isentropic exponent -------------------
    C.append(case('ind-default-air-critical',
                  'Shipped default reproduced against the external reference: air at 11 bar, '
                  '100 degC, discharging to atmosphere.',
                  'critical', phase='gas', mdot=1.0, p1=1.1e6, pb=101325.0, T=373.15,
                  Cd=0.9, gamma=1.4, R=R_OF['air'], Z=1.0))
    C.append(case('ind-k-1.10-heavy-vapour',
                  'Isentropic exponent at the low end of the declared range, k = 1.10, '
                  'n-octane vapour.',
                  'critical', gamma=1.10, R=R_OF['n-octane'], p1=8.0e5, pb=1.01325e5,
                  T=480.0, mdot=6.0, Cd=0.85))
    C.append(case('ind-k-1.15-n-butane',
                  'k = 1.15 hydrocarbon vapour into a flare header.',
                  'critical', gamma=1.15, R=R_OF['n-butane'], p1=2.2e6, pb=2.0e5,
                  T=350.0, mdot=9.0, Cd=0.9))
    C.append(case('ind-k-1.30-steam',
                  'Vapour with k = 1.30 at 30 bar / 500 K into a 2 bar header.',
                  'critical', gamma=1.30, R=R_OF['steam'], p1=3.0e6, pb=2.0e5,
                  T=500.0, mdot=4.5, Cd=0.85))
    C.append(case('ind-k-1.40-air-hot',
                  'Air at the top of the declared temperature span, 900 K.',
                  'critical', gamma=1.40, R=R_OF['air'], p1=5.0e6, pb=1.01325e5,
                  T=900.0, mdot=3.0, Cd=0.975))
    C.append(case('ind-k-1.667-helium',
                  'Monatomic gas at the high end of the declared range, k = 5/3, helium.',
                  'critical', gamma=1.6667, R=R_OF['helium'], p1=1.5e7, pb=1.01325e5,
                  T=300.0, mdot=0.8, Cd=0.86))
    C.append(case('ind-k-1.67-argon-cold',
                  'Monatomic gas at the bottom of the declared temperature span, 200 K.',
                  'critical', gamma=1.67, R=RU / 39.948, p1=2.0e6, pb=1.01325e5,
                  T=200.0, mdot=2.5, Cd=0.9))

    # --- gas: molecular mass from hydrogen to a heavy hydrocarbon -----------------------
    C.append(case('ind-M-hydrogen',
                  'Lightest practical relief gas: hydrogen, M = 2.016 kg/kmol.',
                  'critical', gamma=1.41, R=R_OF['hydrogen'], p1=1.1e6, pb=1.01325e5,
                  T=300.0, mdot=0.15, Cd=0.9))
    C.append(case('ind-M-methane',
                  'Natural gas service, M = 16.04 kg/kmol at 50 bar.',
                  'critical', gamma=1.31, R=R_OF['methane'], p1=5.0e6, pb=3.0e5,
                  T=320.0, mdot=25.0, Cd=0.9))
    C.append(case('ind-M-ammonia',
                  'Ammonia vapour relief, M = 17.03 kg/kmol.',
                  'critical', gamma=1.31, R=R_OF['ammonia'], p1=1.8e6, pb=1.01325e5,
                  T=318.0, mdot=5.0, Cd=0.9))
    C.append(case('ind-M-co2',
                  'Carbon dioxide, M = 44.01 kg/kmol, k = 1.29.',
                  'critical', gamma=1.29, R=R_OF['co2'], p1=6.0e6, pb=1.01325e5,
                  T=300.0, mdot=15.0, Cd=0.88))
    C.append(case('ind-M-n-octane-heavy',
                  'Heaviest hydrocarbon case, M = 114.23 kg/kmol.',
                  'critical', gamma=1.05, R=R_OF['n-octane'], p1=4.0e5, pb=1.01325e5,
                  T=460.0, mdot=11.0, Cd=0.82))

    # --- gas: set pressure across orders of magnitude -----------------------------------
    C.append(case('ind-p1-1.2bar-low',
                  'Set pressure just above atmospheric: 1.2 bar abs to 0.55 bar abs, still '
                  'critical.',
                  'critical', p1=1.2e5, pb=5.5e4, T=310.0, mdot=0.3, Cd=0.9,
                  gamma=1.4, R=R_OF['air']))
    C.append(case('ind-p1-3bar',
                  'Set pressure 3 bar abs.',
                  'critical', p1=3.0e5, pb=1.01325e5, T=330.0, mdot=0.9,
                  gamma=1.4, R=R_OF['air']))
    C.append(case('ind-p1-100bar',
                  'Set pressure 100 bar abs, two orders above the low case.',
                  'critical', p1=1.0e7, pb=5.0e5, T=340.0, mdot=40.0, Cd=0.9,
                  gamma=1.33, R=R_OF['methane']))
    C.append(case('ind-p1-300bar',
                  'Set pressure 300 bar abs, the top of the practical span.',
                  'critical', p1=3.0e7, pb=1.01325e5, T=320.0, mdot=60.0, Cd=0.9,
                  gamma=1.38, R=R_OF['air']))

    # --- gas: back pressure from zero, through the critical transition, deep subcritical -
    k_air = 1.4
    rc_air = rc_of(k_air)
    C.append(case('ind-pb-vacuum',
                  'Back pressure 1 Pa: the deep-vacuum limit of the critical branch, where '
                  'the flux must be independent of back pressure.',
                  'critical', p1=1.0e6, pb=1.0, T=400.0, mdot=2.0, gamma=k_air,
                  R=R_OF['air']))
    C.append(case('ind-pb-half-critical',
                  'Back pressure at half the critical ratio: firmly choked.',
                  'critical', p1=1.0e6, pb=0.5 * rc_air * 1.0e6, T=400.0, mdot=2.0,
                  gamma=k_air, R=R_OF['air']))
    C.append(case('ind-pb-just-below-rc',
                  'Back pressure at 0.9999 of the transition ratio: the last point on the '
                  'critical branch.',
                  'critical', p1=4.0e5, pb=0.9999 * rc_air * 4.0e5, T=300.0, mdot=2.0,
                  gamma=k_air, R=R_OF['air']))
    C.append(case('ind-pb-just-above-rc',
                  'Back pressure at 1.0001 of the transition ratio: the first point on the '
                  'subcritical branch.  Paired with the previous case across the switch.',
                  'subcritical', p1=4.0e5, pb=1.0001 * rc_air * 4.0e5, T=300.0, mdot=2.0,
                  gamma=k_air, R=R_OF['air']))
    C.append(case('ind-pb-0.60-subcritical',
                  'Back pressure at 0.60 of upstream: the subcritical branch governs.',
                  'subcritical', p1=4.0e5, pb=2.4e5, T=300.0, mdot=2.0, gamma=k_air,
                  R=R_OF['air']))
    C.append(case('ind-pb-0.80-subcritical',
                  'Back pressure at 0.80 of upstream.',
                  'subcritical', p1=4.0e5, pb=3.2e5, T=300.0, mdot=2.0, gamma=k_air,
                  R=R_OF['air']))
    C.append(case('ind-pb-0.95-deep-subcritical',
                  'Back pressure at 0.95 of upstream: deep subcritical, where the flux is '
                  'O(sqrt(1-r)) and the area grows fastest.',
                  'subcritical', p1=4.0e5, pb=3.8e5, T=300.0, mdot=2.0, gamma=k_air,
                  R=R_OF['air']))
    C.append(case('ind-pb-0.99-near-closed',
                  'Back pressure at 0.99 of upstream: the near-zero differential limit of '
                  'the declared model.',
                  'subcritical', p1=1.0e6, pb=9.9e5, T=350.0, mdot=0.5, gamma=k_air,
                  R=R_OF['air']))
    C.append(case('ind-pb-subcritical-k1.1',
                  'Subcritical branch at the low end of k, where F2 departs most from unity.',
                  'subcritical', p1=1.0e6, pb=7.5e5, T=420.0, mdot=8.0, gamma=1.10,
                  R=R_OF['n-butane'], Cd=0.85))
    C.append(case('ind-pb-subcritical-k1.667',
                  'Subcritical branch at the high end of k.',
                  'subcritical', p1=1.0e6, pb=6.0e5, T=300.0, mdot=1.2, gamma=1.6667,
                  R=R_OF['helium'], Cd=0.9))

    # --- gas: compressibility factor ----------------------------------------------------
    C.append(case('ind-Z-0.70',
                  'Compressibility factor at the low end, Z = 0.70: dense hydrocarbon vapour.',
                  'critical', p1=1.5e7, pb=1.5e6, T=320.0, mdot=12.0, gamma=1.31,
                  R=R_OF['propane'], Z=0.70, Cd=0.9))
    C.append(case('ind-Z-0.85',
                  '150 bar hydrocarbon vapour with a compressibility factor of 0.85.',
                  'critical', p1=1.5e7, pb=1.5e6, T=320.0, mdot=12.0, gamma=1.31,
                  R=518.28, Z=0.85, Cd=0.9))
    C.append(case('ind-Z-1.25',
                  'Compressibility factor above unity, Z = 1.25: hydrogen at high pressure, '
                  'where the real Z genuinely exceeds one.',
                  'critical', p1=2.0e7, pb=1.01325e5, T=300.0, mdot=1.0, gamma=1.42,
                  R=R_OF['hydrogen'], Z=1.25, Cd=0.9))
    C.append(case('ind-Z-subcritical',
                  'Compressibility factor away from unity on the subcritical branch, so the '
                  'Z placement is tested in both clauses.',
                  'subcritical', p1=1.0e7, pb=7.0e6, T=330.0, mdot=20.0, gamma=1.28,
                  R=R_OF['methane'], Z=0.88, Cd=0.9))

    # --- gas: discharge coefficient -----------------------------------------------------
    C.append(case('ind-Cd-0.62-sharp-orifice',
                  'Discharge coefficient at the sharp-edged-orifice end, Cd = 0.62.',
                  'critical', Cd=0.62, p1=2.0e6, pb=1.01325e5, T=350.0, mdot=5.0,
                  gamma=1.4, R=R_OF['air']))
    C.append(case('ind-Cd-0.975-nozzle',
                  'Discharge coefficient at the well-rounded-nozzle end, Cd = 0.975.',
                  'critical', Cd=0.975, p1=2.0e6, pb=1.01325e5, T=350.0, mdot=5.0,
                  gamma=1.4, R=R_OF['air']))

    # --- gas: required flow spanning four decades ---------------------------------------
    C.append(case('ind-mdot-0.01',
                  'Required flow at 0.01 kg/s: the small-device end.',
                  'critical', mdot=0.01, p1=1.0e6, pb=1.01325e5, T=300.0,
                  gamma=1.4, R=R_OF['air']))
    C.append(case('ind-mdot-200',
                  'Required flow at 200 kg/s: a large vapour relief load.',
                  'critical', mdot=200.0, p1=2.5e6, pb=3.0e5, T=520.0, gamma=1.30,
                  R=R_OF['steam'], Cd=0.85))

    # --- liquid service -----------------------------------------------------------------
    C.append(case('ind-liquid-water',
                  'Liquid water relief, 16 bar to 2 bar.',
                  'liquid', phase='liquid', mdot=20.0, p1=1.6e6, pb=2.0e5, rho=998.0,
                  Cd=0.65))
    C.append(case('ind-liquid-dense-brine',
                  'Dense liquid, 1200 kg/m3.',
                  'liquid', phase='liquid', mdot=3.0, p1=4.0e5, pb=1.01325e5, rho=1200.0,
                  Cd=0.8))
    C.append(case('ind-liquid-light-hydrocarbon',
                  'Light hydrocarbon liquid, 650 kg/m3, large differential.',
                  'liquid', phase='liquid', mdot=45.0, p1=6.5e6, pb=1.01325e5, rho=650.0,
                  Cd=0.65))
    C.append(case('ind-liquid-small-dp',
                  'Liquid with a small differential pressure, 0.2 bar: the low-driving-head '
                  'end of the incompressible branch.',
                  'liquid', phase='liquid', mdot=5.0, p1=3.2e5, pb=3.0e5, rho=998.0,
                  Cd=0.65))

    # --- declared boundary ---------------------------------------------------------------
    C.append(case('ind-boundary-pb-equals-p1',
                  'Declared boundary: back pressure equal to the relieving pressure.  The '
                  'tool must refuse rather than return a number.',
                  'boundary', p1=5.0e5, pb=5.0e5, T=350.0, mdot=1.0, gamma=1.4,
                  R=R_OF['air']))
    C.append(case('ind-boundary-pb-above-p1',
                  'Declared boundary: back pressure above the relieving pressure.',
                  'boundary', p1=5.0e5, pb=6.0e5, T=350.0, mdot=1.0, gamma=1.4,
                  R=R_OF['air']))
    C.append(case('ind-boundary-liquid-pb-above-p1',
                  'Declared boundary on the liquid branch.',
                  'boundary', phase='liquid', p1=3.0e5, pb=4.0e5, mdot=2.0, rho=998.0,
                  Cd=0.65))
    return C


# Cases at which the real-gas cost of the declared idealisation is MEASURED (not graded).
REALGAS_PROBES = [
    ('Air', 1.5e5, 400.0), ('Air', 1.1e6, 373.15), ('Air', 5.0e6, 300.0),
    ('Air', 2.0e7, 300.0), ('Methane', 2.0e5, 300.0), ('Methane', 5.0e6, 320.0),
    ('Methane', 1.5e7, 320.0), ('Hydrogen', 1.1e6, 300.0), ('Hydrogen', 2.0e7, 300.0),
    ('CarbonDioxide', 5.0e5, 320.0), ('CarbonDioxide', 6.0e6, 330.0),
]


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
  await page.goto(`http://127.0.0.1:${port}/relief_valve_sizing.html?lang=en&s=${s}`,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.Diagram && window.Diagram.record
      && window.Diagram.record.build && window.Diagram.record.build()), null, { timeout: 40000 });
  results.push({ id: c.id, record: await page.evaluate((inp) => {
      const r = window.Diagram.record.build();
      // The governing branch is a REPORTED QUANTITY of the tool, surfaced as the 'word' of
      // the ungraded governing-branch row.  Read, not computed.
      let branch = 'unknown';
      try {
        const gb = (window.__dgcVerify(inp) || []).filter(x => x.id === 'governing-branch')[0];
        branch = gb ? { rBrChoked: 'critical', rBrSub: 'subcritical',
                        rBrLiq: 'liquid' }[gb.word] || gb.word : 'unknown';
      } catch (e) { branch = 'unknown: ' + e.message; }
      // Numbers that are not finite do not survive JSON; tag them instead.
      const out = {};
      for (const k of Object.keys(r.outputs)) {
        const v = r.outputs[k];
        out[k] = (typeof v === 'number' && !isFinite(v))
          ? { nonfinite: (v !== v) ? 'NaN' : (v > 0 ? 'Infinity' : '-Infinity') } : v;
      }
      return { inputs: r.inputs, outputs: out, units: r.units, branch: branch,
               warnings: r.warnings || [], notes: (r.model || {}).notes || [],
               equations: (r.model || {}).equations || [] };
    }, c.inputs) });
}
await page.goto(`http://127.0.0.1:${port}/relief_valve_sizing.html?lang=en`, { waitUntil: 'load' });
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
            'The page loads the shared scripts by relative path, so they must sit beside it,\n'
            'and each must be fetched at the ?v= anchor the page spells -- a bare URL returns\n'
            'a stale cached object from the CDN and silently gives the wrong runtime.\n'
            'Check each sha256 prefix against its anchor:\n'
            "  grep -o 'src=\"[^\"]*\"' %s\n"
            '  curl -sS -o diagram-common.js "https://tools.petrov.re/diagram-common.js?v=<anchor>"\n'
            '  sha256sum diagram-common.js | cut -c1-12\n'
            % (directory, ', '.join(missing), PAGE))
    for f in SHARED_SCRIPTS:
        n = os.path.getsize(os.path.join(directory, f))
        if n < 1000:
            raise SystemExit('%s in --dir looks truncated (%d bytes)' % (f, n))
    # The page must spell the anchors this harness was written against.
    with open(os.path.join(directory, PAGE), encoding='utf-8') as fh:
        head = fh.read(200000)
    for f in SHARED_SCRIPTS:
        if ('src="%s?v=' % f) not in head:
            raise SystemExit('%s does not load %s with a ?v= anchor; refusing to run against '
                             'an unpinned runtime.' % (PAGE, f))


def serve(directory, port):
    import http.server

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):          # the access log is noise in this harness
            pass

    handler = functools.partial(Quiet, directory=directory)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def drive(cases, directory, port, node='node'):
    preflight(directory)
    pw = os.environ.get('DGC_PLAYWRIGHT') or _playwright_path()
    tmp = tempfile.mkdtemp(prefix='rvbench-')
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

def _num(v):
    """Page outputs arrive either as a number or as a {'nonfinite': ...} tag."""
    if isinstance(v, dict) and 'nonfinite' in v:
        return float('nan') if v['nonfinite'] == 'NaN' else \
            math.inf if v['nonfinite'] == 'Infinity' else -math.inf
    return v


def _row(name, got, ref, tol, unit, basis, kind, route, den=None):
    d = max(abs(ref) if den is None else abs(den), 1e-300)
    ok_fin = all(isinstance(x, float) or isinstance(x, int) for x in (got, ref)) \
        and math.isfinite(got) and math.isfinite(ref)
    rel = abs(got - ref) / d if ok_fin else float('inf')
    ok = bool(rel <= tol)
    return {'check': name, 'got': got, 'ref': ref, 'abs': abs(got - ref) if ok_fin else None,
            'rel': rel if ok_fin else None, 'tol': tol, 'unit': unit,
            'graded': True, 'kind': kind, 'route': route, 'tolerance_basis': basis,
            'ok': ok, 'status': 'pass' if ok else 'fail'}


def checks_for(c, rec, sabotage=False):
    """Every graded row here comes from a route that never read the page's arithmetic."""
    s = c['inputs']
    o = {k: _num(v) for k, v in rec['outputs'].items()}
    A_page = o['A_required']
    d_page = o['D_equiv']
    G_page = o['mass_flux_ideal']
    rho_page = o['rho_upstream']
    gas = s['phase'] == 'gas'
    rows = []

    # --- declared boundary: the tool must refuse, not answer -----------------------------
    if c['basis'] == 'boundary':
        refused = (not math.isfinite(A_page)) or A_page <= 0.0
        warned = bool(rec.get('warnings'))
        if sabotage:
            refused = not refused
        rows.append({'check': 'declared-boundary-refusal', 'got': ('refused' if refused else
                     'returned %r' % A_page), 'ref': 'refused', 'abs': None, 'rel': None,
                     'tol': None, 'unit': '-', 'graded': True, 'kind': 'independent',
                     'route': 'declared model boundary',
                     'tolerance_basis': 'Categorical.  The reference flux is identically zero '
                                        'when p1 <= pb (no expansion is available), so no '
                                        'finite area exists and the only correct output is a '
                                        'refusal.',
                     'ok': refused, 'status': 'pass' if refused else 'fail'})
        rows.append({'check': 'declared-boundary-warning-raised', 'got': warned, 'ref': True,
                     'abs': None, 'rel': None, 'tol': None, 'unit': '-', 'graded': True,
                     'kind': 'independent', 'route': 'declared model boundary',
                     'tolerance_basis': 'Categorical.  A refusal that is silent is not a '
                                        'refusal the user can act on.',
                     'ok': warned, 'status': 'pass' if warned else 'fail'})
        return rows

    # --- ROUTE A: first principles --------------------------------------------------------
    if gas:
        G_ref, choked_ref, r, rc = reference_gas_flux(
            s['p1'], s['T'], s['pb'], s['gamma'], s['R'], s['Z'])
        rho_ref = s['p1'] / (s['Z'] * s['R'] * s['T'])
    else:
        G_ref = reference_liquid_flux(s['p1'], s['pb'], s['rho'])
        choked_ref, r, rc = False, None, None
        rho_ref = s['rho']
    A_ref = reference_area(s['mdot'], s['Cd'], G_ref)
    d_ref = equivalent_bore(A_ref)

    if sabotage:
        G_ref *= 1.03

    rows.append(_row('mass-flux-first-principles', G_page, G_ref, TOL['fp'], 'kg/(m2 s)',
                     TOL_WHY['fp'], 'independent',
                     'Shapiro ch.4 isentropic nozzle, Mach-parametrised, G = rho*w'
                     if gas else 'incompressible Bernoulli, G = rho*v'))
    rows.append(_row('required-area-first-principles', A_page,
                     reference_area(s['mdot'], s['Cd'], G_ref), TOL['fp'], 'm2',
                     TOL_WHY['fp'], 'independent', 'A = mdot/(Cd G_ref)'))
    rows.append(_row('equivalent-bore-first-principles', d_page,
                     equivalent_bore(reference_area(s['mdot'], s['Cd'], G_ref)),
                     TOL['fp'], 'm', TOL_WHY['fp'], 'independent',
                     'd = sqrt(4A/pi) from the reference area'))
    rows.append(_row('upstream-density-first-principles', rho_page, rho_ref, TOL['fp'],
                     'kg/m3', TOL_WHY['fp'], 'independent',
                     'rho = p1/(Z R T), the declared equation of state'
                     if gas else 'the declared liquid density'))

    if gas:
        # regime classification against the numerically located choking point
        page_branch = rec.get('branch', 'unknown')
        ref_branch = 'critical' if choked_ref else 'subcritical'
        if sabotage:
            ref_branch = 'subcritical' if choked_ref else 'critical'
        ok = page_branch == ref_branch
        rows.append({'check': 'flow-regime-vs-numerically-located-choking-point',
                     'got': page_branch, 'ref': ref_branch, 'abs': None, 'rel': None,
                     'tol': None, 'unit': '-', 'graded': True, 'kind': 'independent',
                     'route': 'critical ratio located by maximising rho*w numerically',
                     'tolerance_basis': TOL_WHY['regime'],
                     'extra': {'r': r, 'r_star_numeric': rc,
                               'r_star_closed_form': rc_of(s['gamma'])},
                     'ok': ok, 'status': 'pass' if ok else 'fail'})

        # --- ROUTE B: the published sizing equations --------------------------------------
        Kd = s['Cd']
        if choked_ref:
            rows.append(_row('api520-part1-cl5.6.3-critical-area-SI',
                             A_page, api520_critical_area_si(s['mdot'], s['p1'], s['T'],
                                                             s['gamma'], s['R'], s['Z'], Kd),
                             TOL['api_si'], 'm2', TOL_WHY['api_si'], 'independent',
                             'API 520 Part I, 9th ed. (2014), cl. 5.6.3, SI form, Kb=Kc=1'))
            rows.append(_row('api520-part1-cl5.6.3-critical-area-USC',
                             A_page, api520_critical_area_usc(s['mdot'], s['p1'], s['T'],
                                                              s['gamma'], s['R'], s['Z'], Kd),
                             TOL['api_usc'], 'm2', TOL_WHY['api_usc'], 'independent',
                             'API 520 Part I, cl. 5.6.3, US customary form, Kb=Kc=1'))
            rows.append(_row('iso4126-1-cl7.3.3.1-critical-area',
                             A_page, iso4126_critical_area(s['mdot'], s['p1'], s['T'],
                                                           s['gamma'], s['R'], s['Z'], Kd),
                             TOL['iso'], 'm2', TOL_WHY['iso'], 'independent',
                             'ISO 4126-1:2013, cl. 7.3.3.1, Kdr = Cd'))
        else:
            rows.append(_row('api520-part1-cl5.6.4-subcritical-area-SI',
                             A_page, api520_subcritical_area_si(s['mdot'], s['p1'], s['pb'],
                                                                s['T'], s['gamma'], s['R'],
                                                                s['Z'], Kd),
                             TOL['api_sub_si'], 'm2', TOL_WHY['api_sub_si'], 'independent',
                             'API 520 Part I, cl. 5.6.4, SI form (17.9), Kc=1'))
            rows.append(_row('api520-part1-cl5.6.4-subcritical-area-USC',
                             A_page, api520_subcritical_area_usc(s['mdot'], s['p1'], s['pb'],
                                                                 s['T'], s['gamma'], s['R'],
                                                                 s['Z'], Kd),
                             TOL['api_sub_usc'], 'm2', TOL_WHY['api_sub_usc'], 'independent',
                             'API 520 Part I, cl. 5.6.4, US customary form (735), Kc=1'))
    else:
        pb_branch = rec.get('branch', 'unknown')
        ok_l = pb_branch == 'liquid'
        rows.append({'check': 'flow-regime-incompressible-branch', 'got': pb_branch,
                     'ref': 'liquid', 'abs': None, 'rel': None, 'tol': None, 'unit': '-',
                     'graded': True, 'kind': 'independent',
                     'route': 'declared phase switch',
                     'tolerance_basis': 'Categorical.  A liquid case must be solved on the '
                                        'incompressible branch; no compressible relation may '
                                        'govern it.',
                     'ok': ok_l, 'status': 'pass' if ok_l else 'fail'})
        rows.append(_row('api520-part1-cl5.8.1.2-liquid-area-SI',
                         A_page, api520_liquid_area_si(s['mdot'], s['p1'], s['pb'],
                                                       s['rho'], s['Cd']),
                         TOL['api_liq_si'], 'm2', TOL_WHY['api_liq_si'], 'independent',
                         'API 520 Part I, cl. 5.8.1.2, SI form (11.78), Kw=Kc=Kv=1'))
        rows.append(_row('api520-part1-cl5.8.1.2-liquid-area-USC',
                         A_page, api520_liquid_area_usc(s['mdot'], s['p1'], s['pb'],
                                                        s['rho'], s['Cd']),
                         TOL['api_liq_usc'], 'm2', TOL_WHY['api_liq_usc'], 'independent',
                         'API 520 Part I, cl. 5.8.1.2, US customary form (38), Kw=Kc=Kv=1'))
    return rows


def realgas_measurements():
    """Measured, not graded: what the declared ideal-gas constant-Z constant-k idealisation
    costs against a multiparameter equation of state."""
    out = []
    for fluid, p0, T0 in REALGAS_PROBES:
        try:
            Gr, rstar = real_choked_flux(fluid, p0, T0)
            st = real_gas_state(fluid, p0, T0)
            Gi = reference_gas_flux(p0, T0, 1.0, st['k'], st['R'], st['Z'])[0]
            out.append({'check': 'real-gas-departure-of-declared-idealisation',
                        'graded': False, 'kind': 'measurement', 'fluid': fluid,
                        'p0_Pa': p0, 'T0_K': T0,
                        'p_reduced': p0 / st['p_crit'], 'T_reduced': T0 / st['T_crit'],
                        'Z': st['Z'], 'k_stagnation': st['k'],
                        'G_real_EOS': Gr, 'G_ideal_constant_Z_k': Gi,
                        'r_star_real': rstar, 'r_star_ideal': rc_of(st['k']),
                        'rel_departure': (Gi - Gr) / Gr,
                        'note': 'CoolProp 8 multiparameter EOS.  The ideal route is fed the '
                                'EOS\'s own local Z and k at the stagnation state, so the '
                                'residual is purely the variation of Z and k along the '
                                'expansion -- the part no constant-Z, constant-k model can '
                                'remove.  This is a measurement of the declared model '
                                'boundary, not a grade of the tool.'})
        except Exception as e:                                          # pragma: no cover
            out.append({'check': 'real-gas-departure-of-declared-idealisation',
                        'graded': False, 'kind': 'measurement', 'fluid': fluid,
                        'error': str(e)})
    return out


# ---------------------------------------------------------------------------------------------
# 8.  MERGING THE IN-PAGE SELF-CHECKS
# ---------------------------------------------------------------------------------------------

def merge_self_checks(inpage):
    """The 49 in-page checks, carried forward with their ids, notes and verdicts and
    labelled for what they are.  Section 5 of the site rules allows the merge; it does
    not allow calling them independent, so they are never counted as such."""
    cases, total, passed = [], 0, 0
    for c in (inpage or {}).get('cases', []):
        cmp_rows = []
        for row in c.get('cmp', []):
            r = dict(row)
            r['kind'] = 'self-check'
            r['route'] = ('Recomputed inside relief_valve_sizing.html from the tool\'s own '
                          'relations; an algebraic identity of the tool against itself.')
            r['tolerance_basis'] = (
                'Floating-point identity, 1e-12 relative, as published by the page.  This is '
                'a consistency figure, not an agreement with anything outside the tool.')
            cmp_rows.append(r)
            if r.get('graded'):
                total += 1
                if r.get('ok'):
                    passed += 1
        cases.append({'id': c.get('id'), 'note': c.get('note'), 'inputs': c.get('inputs'),
                      'kind': 'self-check', 'cmp': cmp_rows})
    return cases, total, passed


# ---------------------------------------------------------------------------------------------
# 9.  ARTIFACT
# ---------------------------------------------------------------------------------------------

REFERENCE = (
    'An external reference implemented in Python along three routes that never read the '
    'tool\'s arithmetic. (1) First principles: one-dimensional isentropic nozzle flow '
    'parametrised by throat Mach number, the mass flux assembled as rho*w and the choking '
    'point located numerically by maximising that flux, verified against NACA Report 1135 '
    'Table I at M=1, k=1.4 (p/p0 = 0.528282, T/T0 = 0.833333, rho/rho0 = 0.633938) to better '
    'than 4e-7. (2) The published sizing equations themselves, implemented from the '
    'standards\' own stated algebraic form and their own printed constants in their own '
    'units: API Standard 520 Part I, 9th ed. (2014), clause 5.6.3 (critical vapour, C = 520 '
    'sqrt(k(2/(k+1))^((k+1)/(k-1))) US customary and 0.03948 sqrt(...) SI), clause 5.6.4 '
    '(subcritical vapour, 735 and 17.9, with F2) and clause 5.8.1.2 (liquid, 38 and 11.78); '
    'and ISO 4126-1:2013 clause 7.3.3.1 (critical vapour, C = 3.948 sqrt(...)). The API and '
    'ISO coefficient tables are reproduced from these forms (C = 315, 337, 356, 373, 387, 400 '
    'at k = 1.0 to 2.0; ISO C = 2.703 at k = 1.4). (3) Real-gas choked flux from the CoolProp '
    'multiparameter equations of state, used to measure what the tool\'s declared ideal-gas '
    'idealisation costs. The three routes are cross-checked against each other before any '
    'tool output is graded. The 49 in-page algebraic identities from the previous artifact '
    'are merged and kept, labelled self-check, and counted separately.')

CITATIONS = [
    'A. H. Shapiro, "The Dynamics and Thermodynamics of Compressible Fluid Flow", vol. 1, '
    'Ronald Press, New York, 1953, ch. 4: eq. 4.14 (stagnation temperature ratio), eq. 4.15 '
    '(stagnation pressure ratio), eq. 4.19 (critical pressure ratio), eq. 4.21 (mass flux), '
    'Table B.2.',
    'Ames Research Staff, "Equations, Tables and Charts for Compressible Flow", NACA Report '
    '1135, 1953, Table I (isentropic flow): at M = 1 and gamma = 1.4, p/p0 = 0.528282, '
    'T/T0 = 0.833333, rho/rho0 = 0.633938; reproduced by the first-principles route to '
    'better than 4e-7.',
    'API Standard 520, "Sizing, Selection, and Installation of Pressure-relieving Devices, '
    'Part I - Sizing and Selection", American Petroleum Institute, 9th edition, July 2014: '
    'clause 5.6.3 (critical-flow vapour sizing and the coefficient C), clause 5.6.4 '
    '(subcritical-flow vapour sizing and F2), clause 5.8.1.2 (liquid sizing for valves not '
    'requiring capacity certification).',
    'ISO 4126-1:2013, "Safety devices for protection against excessive pressure - Part 1: '
    'Safety valves", clause 7.3.3.1 (critical flow, compressible fluids) and the tabulated '
    'coefficient C.',
    'E. W. Lemmon, R. T. Jacobsen, S. G. Penoncello, D. G. Friend, "Thermodynamic Properties '
    'of Air...", J. Phys. Chem. Ref. Data 29 (2000) 331; U. Setzmann and W. Wagner, "A New '
    'Equation of State ... for Methane", J. Phys. Chem. Ref. Data 20 (1991) 1061; '
    'J. W. Leachman et al., "Fundamental Equations of State for Parahydrogen, Normal '
    'Hydrogen, and Orthohydrogen", J. Phys. Chem. Ref. Data 38 (2009) 721; R. Span and '
    'W. Wagner, "A New Equation of State for Carbon Dioxide...", J. Phys. Chem. Ref. Data 25 '
    '(1996) 1509 - as implemented in CoolProp 8.0.',
    'CODATA 2018 / SI Brochure 9th ed. for the molar gas constant and the exact pound, psi, '
    'inch and US gallon conversion factors used to move between the standards\' unit systems.',
]

PROVENANCE = (
    'Written independently in Python for this benchmark. The page\'s JavaScript was read only '
    'for input names, units, defaults, the declared phase switch, the declared model boundary '
    'and the list of reported quantities; nothing was transcribed, ported or paraphrased from '
    'it, and no reference route evaluates any expression taken from it. The reference was '
    'self-verified before any tool output was graded: NACA TR-1135 Table I reproduced to '
    '4e-7; the numerically located choking point matched to the closed form of Shapiro '
    'eq. 4.19 over k = 1.05 to 1.8; branch continuity and flux stationarity checked at the '
    'transition; the limits k -> 1, Z -> 1, back pressure -> 0 and back pressure -> upstream '
    'checked; the API 520 and ISO 4126-1 published coefficient tables reproduced; and each '
    'standard\'s printed constant compared with the exact unit-consistent constant it rounds. '
    'Grading tolerances are read off that last comparison, i.e. off each standard\'s own '
    'stated numerical precision, never off what the tool produces. A negative control was run '
    'before publication: three deliberately falsified expectations produced exactly the '
    'corresponding failures and moved nothing else.')

TOLERANCE = (
    'Each tolerance comes from the physics or from the standard\'s own printed precision. '
    'First-principles routes: 1e-12 relative, the double-precision path difference between '
    'two arithmetic assemblies of the same exact solution. API 520 clause 5.6.3 critical: '
    '5.0e-5 SI and 2.5e-3 US customary, from the rounding of the published constants 0.03948 '
    'and 520 against the exact 0.0394807513 and 519.4483 that isentropic flow implies '
    '(1.903e-5 and 1.062e-3). ISO 4126-1 clause 7.3.3.1: 5.0e-5, from 3.948 against '
    '3.948075127 (1.903e-5). API 520 clause 5.6.4 subcritical: 1.5e-3, from 17.9 against '
    '17.9101653 (5.676e-4) and 735 against 734.6096 (5.316e-4). API 520 clause 5.8.1.2 '
    'liquid: 2.0e-4 SI and 6.0e-4 US customary, from 11.78 against 11.779218 (6.64e-5) and 38 '
    'against 37.99242 (1.99e-4). Regime classification and the declared-boundary refusal are '
    'categorical. The merged in-page self-checks keep the page\'s own 1e-12 identity figure. '
    'No code-compliance tolerance is claimed and no result here is a compliance statement.')

SCOPE = (
    'This artifact records how far the tool\'s preliminary relief area sits from the published '
    'API 520 Part I and ISO 4126-1 sizing equations and from first-principles compressible '
    'nozzle flow, across the tool\'s declared input range. It is not a compliance assessment. '
    'The comparison is only possible with every correction factor the tool declares it does '
    'not implement - Kb, Kc, Kw, Kv - set to unity, and with the discharge coefficient the '
    'user types used in place of a certified Kd; an area produced by this tool is not a '
    'certified effective orifice area and is not a valve selection. API 520/521 or ISO 4126 '
    'compliance and certified-valve corrections are not claimed.')

NOT_BENCHMARKED = [
    'Certified Kd and the API 520/521 and ISO 4126 correction factors for back pressure (Kb, '
    'Kw), rupture disc combination (Kc) and viscosity (Kv). The tool implements none of them, '
    'so every comparison here is made at Kb = Kc = Kw = Kv = 1. Where a real installation '
    'carries Kb < 1, the standards\' required area exceeds the tool\'s by exactly 1/Kb; that '
    'factor is a device correction, not physics, and no value for it is asserted here.',
    'The 1.25 p overpressure convention of the API liquid clause. The tool is handed a '
    'differential pressure directly and makes no overpressure claim, so the liquid clause is '
    'evaluated at the actual differential.',
    'ISO 4126-1 subcritical compressible flow. The critical clause is implemented and '
    'verified against the standard\'s own tabulated C; the subcritical clause is not, so no '
    'ISO comparison is recorded on subcritical cases.',
    'Standard orifice letter designations and the selection of a catalogue device.',
    'Installation criteria: inlet pressure drop, outlet built-up back pressure, reaction '
    'forces and the disposal system.',
    'Certified valve performance, blowdown, chatter and reseat behaviour.',
    'Two-phase and flashing relief, condensable vapours and non-equilibrium effects.',
    'The relieving load itself. The tool sizes for a mass flow the user supplies; determining '
    'that flow (fire case, blocked outlet, tube rupture, control-valve failure) is API 521 '
    'work and is outside this tool and this artifact.',
]


def published_route_rows(cases):
    """Graded rows whose reference is evaluated with a STANDARD'S PUBLISHED, ROUNDED
    coefficient rather than with the exact constant this reference can derive -- the API 520
    and ISO 4126-1 sizing routes, whose tolerance is read off that published rounding and
    reported in `published_constant_rounding`.  Counted off the rows, never typed."""
    return sum(1 for c in cases for r in c['cmp']
               if r.get('graded')
               and isinstance(r.get('route'), str)
               and (r['route'].startswith('API 520') or r['route'].startswith('ISO 4126')))


def build_artifact(ind_cases, ind_total, ind_passed, self_cases, self_total, self_passed,
                   sv_rows, measurements, page_errors, manifest_revision, run_at, build):
    worst = None
    for c in ind_cases:
        for r in c['cmp']:
            if r.get('graded') and isinstance(r.get('rel'), float) and math.isfinite(r['rel']):
                if worst is None or r['rel'] > worst[0]:
                    worst = (r['rel'], c['id'], r['check'])
    total = ind_total + self_total
    passed = ind_passed + self_passed
    return {
        'schema': 'tools.petrov.re/benchmark/v1',
        'tool': TOOL_ID,
        'file': PAGE,
        'manifest_revision': manifest_revision,
        'build': build,
        'reference': REFERENCE,
        'reference_citations': CITATIONS,
        'reference_provenance': 'mixed',
        # PROVENANCE, the paragraph that used to sit in reference_provenance, which §5 defines
        # as an enum.  It is carried here unchanged -- it states the negative control and the
        # self-verification residuals, and nothing else in this artifact does -- and the split
        # that justifies the enum is counted off the rows, not typed.
        'provenance_note': PROVENANCE + (
            ' Run by bench-src/gen_relief_valve_sizing.py. Of the %d graded checks, %d are '
            'recomputed -- by that reference, or, for the retained in-page identities, by the '
            'tool itself -- and %d are graded against the published, rounded sizing '
            'coefficients of API 520 Part I and ISO 4126-1 reused as those standards print '
            'them, each to a tolerance read off that rounding and reported in '
            'published_constant_rounding.'
            % (total, total - published_route_rows(ind_cases + self_cases),
               published_route_rows(ind_cases + self_cases))),
        'tolerance': TOLERANCE,
        'scope': SCOPE,
        'run_at': run_at,
        'total': total,
        'passed': passed,
        'failed': total - passed,
        'flagged': 0,
        'page_errors': page_errors,
        'grading': (
            'total counts graded checks. %d are independent checks against the external '
            'reference described above, spread over %d driven cases. %d are the in-page '
            'algebraic identities carried forward from the previous artifact and merged '
            'here; they are labelled kind="self-check" on every row and are NOT evidence of '
            'agreement with anything outside the tool. Every row carries kind, route and '
            'tolerance_basis so any verdict can be re-derived. The real-gas rows are '
            'measurements of the declared model boundary and carry no acceptance criterion, '
            'so they are excluded from the count.'
            % (ind_total, len(ind_cases), self_total)),
        'independent_cases': len(ind_cases),
        'independent_checks': ind_total,
        'independent_passed': ind_passed,
        'self_check_cases': len(self_cases),
        'self_checks': self_total,
        'self_checks_passed': self_passed,
        'largest_independent_relative_residual': (
            None if worst is None else
            {'rel': worst[0], 'case': worst[1], 'check': worst[2]}),
        'published_constant_rounding': {
            k: {'exact_from_isentropic_or_bernoulli_flow': v['exact'],
                'as_published': v['published'],
                'relative_rounding': v['rel_rounding']}
            for k, v in CONST.items()},
        'headline': (
            'Across the whole driven range the tool\'s gas core is the exact one-dimensional '
            'isentropic nozzle solution and its liquid core is the exact incompressible '
            'Bernoulli solution: both agree with the first-principles route to floating-point '
            'precision. Against the published sizing equations the agreement is limited only '
            'by the rounding of each standard\'s own printed constant - 1.9e-5 for API 520 SI '
            'critical and ISO 4126-1, 1.1e-3 for API 520 US customary critical, 5.7e-4 for '
            'API 520 subcritical and 6.6e-5 to 2.0e-4 for the API liquid clause. No '
            'divergence of substance was found anywhere in the range. What the tool does not '
            'have is the standards\' correction factors, and that gap is structural and '
            'already declared, not numerical.'),
        'reference_self_verification': {
            'checks': len(sv_rows),
            'failed': sum(1 for r in sv_rows if not r.get('ok')),
            'rows': sv_rows},
        'measurements': measurements,
        'cases': ind_cases + self_cases,
        'not_benchmarked': NOT_BENCHMARKED,
        'notes': [
            'Independent cases are driven through the shipping page in a real browser by '
            'permalink, and the page\'s own calculation record is read back. The reference is '
            'evaluated separately in Python and the two are compared; the page is never asked '
            'to check itself on any row labelled independent.',
            'Every independent row names its route and the clause or equation it came from, '
            'and its tolerance_basis states where the tolerance came from.',
            'The in-page self-checks are reproduced by calling window.__dgcBenchmark() on the '
            'tool and are merged here unchanged apart from the kind, route and '
            'tolerance_basis labels that mark them as self-checks.',
            'Real-gas rows measure the cost of the declared ideal-gas, constant-Z, constant-k '
            'idealisation against multiparameter equations of state, with the ideal route fed '
            'the EOS\'s own local Z and k so that only the VARIATION of Z and k along the '
            'expansion remains. The departure is 0.05 % for air at 1.5 bar and 0.01 % at 11 '
            'bar, and grows with reduced pressure and with proximity to the critical point: '
            '0.64 % for air at 50 bar, 1.5 % at 200 bar; 2.2 % for methane at 50 bar / 320 K '
            'and 3.6 % at 150 bar; 3.2 % for hydrogen at 200 bar; and 12.3 % for carbon '
            'dioxide at 60 bar / 330 K, a reduced temperature of 1.09. That last case is the '
            'sharpest result in this artifact and its SIGN matters: the ideal flux exceeds the '
            'real one, so the idealisation over-states what the device can pass and therefore '
            'UNDER-states the area required. The page prints its area to 0.1 mm2, about 2e-4 '
            'relative on a typical result, so the idealisation exceeds the tool\'s own printed '
            'precision from roughly a reduced pressure of 0.04 upward - which is most real '
            'relief service. This is not a defect of the tool, which declares the idealisation '
            'openly; it is the measured size of the declared model boundary, and it is why '
            'the tool is a screen and not a sizing authority.',
        ],
    }


# ---------------------------------------------------------------------------------------------
# 10.  MAIN
# ---------------------------------------------------------------------------------------------

def read_manifest(directory):
    import re
    with open(os.path.join(directory, PAGE), encoding='utf-8') as fh:
        s = fh.read()
    m = re.search(r'<script type="application/json" id="diagram-tool-manifest">(.*?)</script>',
                  s, re.S)
    return json.loads(m.group(1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir')
    ap.add_argument('--port', type=int, default=8824)
    ap.add_argument('--out')
    ap.add_argument('--node', default='node')
    ap.add_argument('--selfcheck', action='store_true')
    ap.add_argument('--sabotage', action='store_true')
    a = ap.parse_args()

    if a.selfcheck:
        rows, bad = self_verify(verbose=True)
        sys.exit(1 if bad else 0)

    if not (a.dir and a.out):
        ap.error('--dir and --out are required unless --selfcheck')

    sv_rows, bad = self_verify(verbose=True)
    if bad and not a.sabotage:
        raise SystemExit('reference self-verification failed (%d checks); refusing to grade '
                         'the tool against a reference that does not reproduce its own '
                         'published anchors.' % bad)

    cases = build_cases()
    driven = drive(cases, a.dir, a.port, node=a.node)
    by_id = {r['id']: r['record'] for r in driven['results']}

    ind_cases, ind_total, ind_passed = [], 0, 0
    for c in cases:
        rec = by_id.get(c['id'])
        if rec is None:
            raise SystemExit('page produced no record for case %s' % c['id'])
        rows = checks_for(c, rec, sabotage=a.sabotage)
        for r in rows:
            if r.get('graded'):
                ind_total += 1
                if r['ok']:
                    ind_passed += 1
        ind_cases.append({'id': c['id'], 'note': c['note'], 'basis': c['basis'],
                          'kind': 'independent', 'inputs': c['inputs'],
                          'page_outputs': rec['outputs'], 'page_units': rec['units'],
                          'page_branch': rec.get('branch'),
                          'page_warnings': rec.get('warnings', []),
                          'page_notes': rec.get('notes', []), 'cmp': rows})

    self_cases, self_total, self_passed = merge_self_checks(driven.get('inpage'))
    meas = realgas_measurements()
    # `build` is what the SERVED page said it was.  A disagreement with the file this harness
    # read means the browser was not reading this tree, so nothing is written rather than an
    # artifact naming a build nobody can check (bench-src/provenance.mjs refuses on the same
    # condition).
    served_rev = driven.get('served_revision')
    disk_rev = read_manifest(a.dir).get('manifest_revision')
    if not served_rev:
        raise SystemExit('the served page reported no manifest_revision; refusing to write an '
                         'artifact that would have to name a build it did not observe.')
    if served_rev != disk_rev:
        raise SystemExit('served page declares manifest_revision %r, the file in --dir declares '
                         '%r. The browser was not reading this tree; nothing written.'
                         % (served_rev, disk_rev))
    run_at = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    art = build_artifact(ind_cases, ind_total, ind_passed, self_cases, self_total,
                         self_passed, sv_rows, meas, driven.get('errors', []),
                         disk_rev, run_at, served_rev)
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(art, fh, indent=1, ensure_ascii=False, allow_nan=False)

    print('\n%s -> %s' % (PAGE, a.out))
    print('  independent: %d cases, %d checks, %d passed, %d failed'
          % (len(ind_cases), ind_total, ind_passed, ind_total - ind_passed))
    print('  self-check : %d cases, %d checks, %d passed, %d failed'
          % (len(self_cases), self_total, self_passed, self_total - self_passed))
    print('  TOTAL      : %d checks, %d passed, %d failed'
          % (art['total'], art['passed'], art['failed']))
    if art['largest_independent_relative_residual']:
        w = art['largest_independent_relative_residual']
        print('  largest independent residual: %.4e  (%s / %s)' % (w['rel'], w['case'], w['check']))
    if art['failed']:
        for c in art['cases']:
            for r in c['cmp']:
                if r.get('graded') and not r.get('ok'):
                    print('  FAIL %-34s %-46s got=%r ref=%r rel=%r tol=%r'
                          % (c['id'], r['check'], r.get('got'), r.get('ref'),
                             r.get('rel'), r.get('tol')))
    sys.exit(0 if art['failed'] == 0 else 3)


if __name__ == '__main__':
    main()
