#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_operatingpoint.py - independent reference generator for the `operatingpoint` tool.

Writes bench-src/ref/operatingpoint_ref.json.

This generator was written WITHOUT reading operatingpoint.html, bench-src/operatingpoint.py
or benchmarks/operatingpoint.json. Every relation below is implemented from the primary
source named in CITATIONS and in the per-relation RELATIONS block, and every root is found
by a root finder implemented in this file (Brent, written out below) and cross-checked by a
second, structurally different route (bisection, and a closed form wherever one exists).

Units: SI only. The top-level "units" dictionary in the emitted JSON names the unit of every
input and expected field; values are never carried in a non-SI unit, and no field name
appears in two different units.

Run:  python3 gen_operatingpoint.py [out.json]
"""

import json
import math
import os
from fractions import Fraction
import subprocess
import sys
import datetime

from CoolProp.CoolProp import PropsSI

# --------------------------------------------------------------------------------------
# 0. Citations. Every relation used below points at one of these.
# --------------------------------------------------------------------------------------

CITATIONS = {
    "colebrook1939":
        "C. F. Colebrook, 'Turbulent Flow in Pipes, with Particular Reference to the "
        "Transition Region between the Smooth and Rough Pipe Laws', Journal of the "
        "Institution of Civil Engineers, Vol. 11, Issue 4, 1939, pp. 133-156 - the "
        "implicit friction-factor law, in the form 1/sqrt(f) = -2 log10(eps/(3.7 D) + "
        "2.51/(Re sqrt(f))).",
    "white_fm7":
        "F. M. White, 'Fluid Mechanics', 7th ed., McGraw-Hill 2011 - Ch. 6: Darcy-Weisbach "
        "head loss h_f = f (L/D) V^2/(2g) (Eq. 6.10), laminar Darcy friction factor "
        "f = 64/Re_D (Eq. 6.12), the Colebrook formula (Eq. 6.48) and the Moody chart "
        "(Fig. 6.13); Ch. 11: turbomachinery, the pump similarity rules and pumps in "
        "series and in parallel.",
    "crane410":
        "Crane Co., 'Flow of Fluids through Valves, Fittings and Pipe', Technical Paper "
        "No. 410 (TP-410), metric edition - Ch. 1 (Darcy formula and the Reynolds number) "
        "and Ch. 2 (the resistance-coefficient K method, h_L = K v^2/(2g), and the "
        "Kv/Cv flow coefficients).",
    "moody1944":
        "L. F. Moody, 'Friction Factors for Pipe Flow', Transactions of the ASME, Vol. 66, "
        "1944, pp. 671-684 - the chart form of the Colebrook law and the fully-rough and "
        "smooth-wall asymptotes used here as closed-form limits.",
    "nikuradse_vk":
        "von Karman-Prandtl fully-rough law 1/sqrt(f) = -2 log10(eps/(3.7 D)) and smooth-wall "
        "law 1/sqrt(f) = 2 log10(Re sqrt(f)) - 0.8, as given in F. M. White, 'Fluid "
        "Mechanics', 7th ed., Ch. 6 (Eqs. 6.38 and 6.64); they are the Re -> inf and "
        "eps -> 0 limits of the Colebrook equation and are used here for hand checks.",
    "karassik":
        "I. J. Karassik, J. P. Messina, P. Cooper, C. C. Heald, 'Pump Handbook', 4th ed., "
        "McGraw-Hill 2008 - Ch. 2 (centrifugal pump head-capacity characteristic and the "
        "affinity laws for speed change and for impeller diameter change within an "
        "unchanged casing) and Ch. 8 (the system head curve as H_static plus a "
        "resistance parabola, and the operating point as its intersection with the "
        "pump curve).",
    "iso17769":
        "ISO 17769-1:2012, 'Liquid pumps and installation - General terms, definitions, "
        "quantities, letter symbols and units - Part 1: Liquid pumps' - the definitions of "
        "pump total head H, rate of flow Q, net positive suction head NPSH, pump input "
        "power and pump efficiency used for the symbols and the sign conventions here.",
    "iso9906":
        "ISO 9906:2012, 'Rotodynamic pumps - Hydraulic performance acceptance tests', "
        "Grade 1/2/3 - the definition of pump total head from the measured pressures and "
        "velocity heads at the reference planes, the hydraulic power P_h = rho g Q H and "
        "the overall efficiency eta = P_h/P, and the translation of a measured curve to "
        "another speed by the affinity relations.",
    "hi_9_6_1":
        "ANSI/HI 9.6.1-2017, 'Rotodynamic Pumps - Guideline for NPSH Margin' - NPSH "
        "available minus NPSH required as the margin, and the margin ratio; used for the "
        "NPSH margin and the cavitation flag.",
    "iso5801":
        "ISO 5801:2017, 'Fans - Performance testing using standardized airways' - fan "
        "total pressure, fan air power P_u = q_V * p_f, and the conversion of a measured "
        "fan characteristic to another speed and another inlet density (the fan laws: "
        "q_V proportional to n, p_f proportional to n^2 rho, P proportional to n^3 rho).",
    "amca201":
        "AMCA Publication 201-02 (R2011), 'Fans and Systems' - the system resistance curve "
        "as a parabola through the origin in fan pressure against volume flow, and the fan "
        "laws applied to a change of speed or of air density.",
    "iec60534_2_1":
        "IEC 60534-2-1:2011, 'Industrial-process control valves - Part 2-1: Flow capacity - "
        "Sizing equations for fluid flow under installed conditions' - the incompressible "
        "turbulent sizing equation, which for the Kv coefficient reduces to "
        "Q = Kv sqrt(dp/bar * 1000/rho) with Q in m3/h, i.e. "
        "dp = (rho/1000) (Q/Kv)^2 bar.",
    "iapws_if97":
        "IAPWS R7-97(2012), 'Revised Release on the IAPWS Industrial Formulation 1997 for "
        "the Thermodynamic Properties of Water and Steam' - liquid-water density (Region 1) "
        "and the saturation-pressure equation (Region 4, Eq. 30); evaluated here through "
        "CoolProp 8.0.0 (HEOS::Water, which implements IAPWS-95 / IF97-consistent "
        "properties).",
    "iapws_r12":
        "IAPWS R12-08, 'Release on the IAPWS Formulation 2008 for the Viscosity of Ordinary "
        "Water Substance' - the dynamic viscosity of liquid water; evaluated here through "
        "CoolProp 8.0.0.",
    "iso2533":
        "ISO 2533:1975, 'Standard Atmosphere' - the specific gas constant of dry air "
        "R = 287.05287 J/(kg K) and the Sutherland viscosity law "
        "mu = beta T^1.5/(T + S) with beta = 1.458e-6 kg/(m s K^0.5) and S = 110.4 K.",
    "brent1973":
        "R. P. Brent, 'Algorithms for Minimization without Derivatives', Prentice-Hall "
        "1973, Ch. 4 - the inverse-quadratic-interpolation / bisection hybrid root finder "
        "implemented as brent_root() in this file.",
    "swamee_jain":
        "P. K. Swamee and A. K. Jain, 'Explicit Equations for Pipe-Flow Problems', Journal "
        "of the Hydraulics Division ASCE, Vol. 102, No. HY5, 1976, pp. 657-664 - the "
        "explicit friction-factor approximation, carried here only as a crosscheck so that "
        "a friction disagreement can be told apart from a Swamee-Jain implementation.",
}

G = 9.80665          # standard acceleration of free fall, m/s2 (ISO 80000-3 / CGPM 1901)
R_AIR = 287.05287    # specific gas constant of dry air, J/(kg K), ISO 2533:1975
SUTH_BETA = 1.458e-6
SUTH_S = 110.4
P0_BAR = 1.0e5       # 1 bar in Pa, the Kv reference differential (IEC 60534-2-1)
RHO0_KV = 1000.0     # Kv reference density, kg/m3 (IEC 60534-2-1)


# --------------------------------------------------------------------------------------
# 1. Root finders, written here so that no intersection in this corpus is found by the
#    same code path twice.
# --------------------------------------------------------------------------------------

EPS = sys.float_info.epsilon


def brent_root(f, a, b, xtol=0.0, rtol=None, maxiter=300):
    """Brent 1973 Ch. 4: inverse quadratic interpolation with a bisection fallback.

    The working tolerance is delta = 2 eps |b| + xtol/2, i.e. a couple of units in the
    last place of the current estimate plus whatever absolute floor the caller asks for.
    A fixed absolute floor below the local floating-point spacing would make the
    termination test unreachable, so the machine term is always present.

    Returns (root, residual, iterations). Raises if the bracket does not change sign.
    """
    fa, fb = f(a), f(b)
    if fa == 0.0:
        return a, 0.0, 0
    if fb == 0.0:
        return b, 0.0, 0
    if fa * fb > 0.0:
        raise ValueError("brent_root: f(a) and f(b) have the same sign")
    if abs(fa) < abs(fb):
        a, b, fa, fb = b, a, fb, fa
    c, fc = a, fa
    d = b - a
    mflag = True
    s = b
    for it in range(1, maxiter + 1):
        if fa != fc and fb != fc:
            # inverse quadratic interpolation
            s = (a * fb * fc / ((fa - fb) * (fa - fc))
                 + b * fa * fc / ((fb - fa) * (fb - fc))
                 + c * fa * fb / ((fc - fa) * (fc - fb)))
        else:
            # secant
            s = b - fb * (b - a) / (fb - fa)
        delta = 2.0 * EPS * abs(b) + 0.5 * xtol
        lo, hi = ((3 * a + b) / 4.0, b) if a < b else (b, (3 * a + b) / 4.0)
        cond = (not (lo < s < hi)
                or (mflag and abs(s - b) >= abs(b - c) / 2.0)
                or (not mflag and abs(s - b) >= abs(c - d) / 2.0)
                or (mflag and abs(b - c) < delta)
                or (not mflag and abs(c - d) < delta))
        if cond:
            s = (a + b) / 2.0
            mflag = True
        else:
            mflag = False
        fs = f(s)
        d, c, fc = c, b, fb
        if fa * fs < 0.0:
            b, fb = s, fs
        else:
            a, fa = s, fs
        if abs(fa) < abs(fb):
            a, b, fa, fb = b, a, fb, fa
        if fs == 0.0 or abs(b - a) <= 2.0 * EPS * abs(b) + 0.5 * xtol:
            return b, fb, it
    raise RuntimeError("brent_root: no convergence in %d iterations" % maxiter)


def bisect_root(f, a, b, iters=200):
    """Plain bisection. Independent of brent_root and used only as its crosscheck."""
    fa, fb = f(a), f(b)
    if fa * fb > 0.0:
        raise ValueError("bisect_root: f(a) and f(b) have the same sign")
    for _ in range(iters):
        m = 0.5 * (a + b)
        fm = f(m)
        if fm == 0.0:
            return m, 0.0
        if fa * fm < 0.0:
            b, fb = m, fm
        else:
            a, fa = m, fm
    m = 0.5 * (a + b)
    return m, f(m)


# --------------------------------------------------------------------------------------
# 2. Friction
# --------------------------------------------------------------------------------------

def f_laminar(re):
    """Darcy friction factor, laminar pipe flow. White 7th ed. Eq. 6.12: f = 64/Re."""
    return 64.0 / re


def f_colebrook(re, rr):
    """Darcy friction factor from the Colebrook-White equation (Colebrook 1939).

    Solved on x = 1/sqrt(f), where the equation is
        x + 2 log10(rr/3.7 + 2.51 x / Re) = 0,
    monotone in x, so a bracket is trivial and the root is unique.
    """
    def g(x):
        return x + 2.0 * math.log10(rr / 3.7 + 2.51 * x / re)
    # bracket: x = 1/sqrt(f); f in (1e-4, 10) covers every physical pipe
    lo, hi = 1.0e-3, 1.0e3
    x, res, _ = brent_root(g, lo, hi, xtol=1e-16, rtol=1e-16)
    xb, resb = bisect_root(g, lo, hi)
    return 1.0 / (x * x), {
        "residual_on_x": res,
        "x": x,
        "dev_brent_vs_bisection_rel_on_f": abs((1.0 / (x * x)) - (1.0 / (xb * xb))) / (1.0 / (x * x)),
    }


def f_fully_rough(rr):
    """Re -> inf limit of Colebrook: 1/sqrt(f) = -2 log10(rr/3.7). Closed form."""
    x = -2.0 * math.log10(rr / 3.7)
    return 1.0 / (x * x)


def f_smooth_prandtl(re):
    """eps -> 0 limit of Colebrook (Prandtl smooth-wall law), solved for f."""
    def g(x):
        return x + 2.0 * math.log10(2.51 * x / re)
    x, _, _ = brent_root(g, 1.0e-3, 1.0e3, xtol=1e-16, rtol=1e-16)
    return 1.0 / (x * x)


def f_swamee_jain(re, rr):
    """Swamee-Jain 1976 explicit approximation. Crosscheck only, never graded."""
    return 0.25 / (math.log10(rr / 3.7 + 5.74 / re ** 0.9)) ** 2


def friction_factor(re, rr):
    """Branched friction factor with the branch recorded.

    Laminar below Re = 2000 (White Eq. 6.12), Colebrook above Re = 4000
    (Colebrook 1939). 2000 <= Re <= 4000 is NOT given a graded value by this corpus:
    the transition region has no single accepted law and the tool's choice there is
    not derivable from any document available to this generator.
    """
    if re < 2000.0:
        return f_laminar(re), "laminar", {}
    if re > 4000.0:
        f, cc = f_colebrook(re, rr)
        return f, "colebrook", cc
    f, cc = f_colebrook(re, rr)
    return f, "transition_ungraded", cc


# --------------------------------------------------------------------------------------
# 3. Fluid properties
# --------------------------------------------------------------------------------------

def water_props(T_K, p_Pa):
    """Liquid water: density and viscosity (IAPWS R7-97 / R12-08 via CoolProp),
    saturation pressure from the Region 4 equation."""
    rho = PropsSI("D", "T", T_K, "P", p_Pa, "Water")
    mu = PropsSI("V", "T", T_K, "P", p_Pa, "Water")
    pv = PropsSI("P", "T", T_K, "Q", 0, "Water")
    return {"rho_kg_m3": rho, "mu_Pa_s": mu, "nu_m2_s": mu / rho, "p_vap_Pa": pv}


def air_props(T_K, p_Pa):
    """Dry air as an ideal gas with the ISO 2533 gas constant and Sutherland viscosity."""
    rho = p_Pa / (R_AIR * T_K)
    mu = SUTH_BETA * T_K ** 1.5 / (T_K + SUTH_S)
    return {"rho_kg_m3": rho, "mu_Pa_s": mu, "nu_m2_s": mu / rho, "p_vap_Pa": None}


# --------------------------------------------------------------------------------------
# 4. Machine characteristic
# --------------------------------------------------------------------------------------

class Curve:
    """Quadratic machine characteristic.

    Pump branch:  H(Q) = H0 + a1 Q + a2 Q^2        [m]      (Karassik Ch. 2)
    Fan branch:   dp(Q) = dp0 + a1 Q + a2 Q^2      [Pa]     (ISO 5801)

    speed_ratio s = n/n_ref and impeller_ratio d = D/D_ref are applied by the affinity
    laws. Two impeller conventions are carried, because they are different physics and
    a tool implements one of them:

      law = "trim"       - impeller cut inside an unchanged casing:
                           Q ~ d,   H ~ d^2,  P ~ d^3      (Karassik Ch. 2)
      law = "similarity" - geometrically similar machine:
                           Q ~ n d^3, H ~ n^2 d^2, P ~ rho n^3 d^5
                           (White 7th ed. Ch. 11; ISO 9906)

    For the fan branch the pressure rise additionally scales with the inlet density,
    dp ~ rho (ISO 5801, AMCA 201).
    """

    def __init__(self, c0, a1, a2, speed=1.0, dia=1.0, law="trim",
                 rho_ratio=1.0, n_units=1, arrangement="single"):
        self.c0, self.a1, self.a2 = c0, a1, a2
        self.s, self.d, self.law = speed, dia, law
        self.rho_ratio = rho_ratio
        self.n = n_units
        self.arrangement = arrangement

    def _single(self, Q):
        """One unit, with speed, impeller and density scaling applied."""
        s, d = self.s, self.d
        if self.law == "trim":
            kq, kh = s * d, s * s * d * d
        elif self.law == "similarity":
            kq, kh = s * d ** 3, s * s * d * d
        else:
            raise ValueError("unknown impeller law " + self.law)
        kh *= self.rho_ratio
        if kq == 0.0 or kh == 0.0:
            # A stopped machine, or one scaled to zero diameter, delivers no head at any
            # flow. Only the refusal is asserted for such a case, never a head value: a
            # stopped machine is a resistance in the line, which this corpus does not model.
            return 0.0
        q = Q / kq
        return kh * (self.c0 + self.a1 * q + self.a2 * q * q)

    def __call__(self, Q):
        if self.arrangement == "single" or self.n == 1:
            return self._single(Q)
        if self.arrangement == "series":
            # identical units in series: heads add at the common flow
            return self.n * self._single(Q)
        if self.arrangement == "parallel":
            # identical units in parallel: flows add at the common head
            return self._single(Q / self.n)
        raise ValueError("unknown arrangement " + self.arrangement)

    def shutoff(self):
        return self(0.0)


def curve_sum_series(curves, Q):
    """Unequal machines in series: heads add at the common flow. White Ch. 11."""
    return sum(c(Q) for c in curves)


def curve_sum_parallel(curves, H, qmax=10.0):
    """Unequal machines in parallel: flows add at the common head. White Ch. 11.

    Each machine's flow at head H is the root of c(q) = H on [0, q_max_c]; a machine
    whose shutoff head is below H contributes zero (it would otherwise motor backwards,
    which this corpus does not model and which is recorded as a note on the case).
    """
    total = 0.0
    per = []
    for c in curves:
        if c(0.0) <= H:
            per.append(0.0)
            continue
        hi = qmax
        while c(hi) > H and hi < 1e6:
            hi *= 2.0
        q, _, _ = brent_root(lambda q: c(q) - H, 0.0, hi, xtol=1e-16, rtol=1e-16)
        per.append(q)
        total += q
    return total, per


# --------------------------------------------------------------------------------------
# 5. System resistance
# --------------------------------------------------------------------------------------

class System:
    """System resistance curve.

    model = "quadratic_resistance":
        pump branch  H_sys(Q) = H_static + C Q^2                       [m]
        fan branch  dp_sys(Q) = dp_static + C_p Q^2                    [Pa]
        The parabola through the static point (Karassik Ch. 8; AMCA 201). C is a
        declared constant, so every intersection with a quadratic curve is a closed
        form and is hand-checkable.

    model = "pipe_segments":
        H_sys(Q) = H_static + sum_i [ f_i L_i/D_i + K_i ] v_i^2/(2 g)   [m]
        with v_i = Q/A_i, Re_i = v_i D_i/nu, f_i from friction_factor().
        Darcy-Weisbach (White Eq. 6.10), resistance coefficients (Crane TP-410 Ch. 2),
        Colebrook friction (Colebrook 1939).

    A valve is carried either as an added resistance coefficient zeta on a named
    segment (Crane TP-410 Ch. 2) or as a flow coefficient Kv (IEC 60534-2-1):
        dp_valve = (rho/1000) (Q[m3/h]/Kv)^2 bar.
    """

    def __init__(self, model, static, C=0.0, segments=None, valve=None,
                 rho=998.0, nu=1.0e-6, branch="pump"):
        self.model = model
        self.static = static
        self.C = C
        self.segments = segments or []
        self.valve = valve
        self.rho, self.nu = rho, nu
        self.branch = branch

    def valve_head(self, Q):
        """Valve contribution, in the unit of the branch (m for pump, Pa for fan)."""
        if not self.valve:
            return 0.0, {}
        v = self.valve
        if v["model"] == "zeta":
            A = math.pi * v["D_m"] ** 2 / 4.0
            u = Q / A
            dp = v["zeta"] * self.rho * u * u / 2.0
        elif v["model"] == "kv":
            if v["Kv_m3_h_bar05"] <= 0.0:
                return float("inf"), {"closed": True}
            Qh = Q * 3600.0
            dp = (self.rho / RHO0_KV) * (Qh / v["Kv_m3_h_bar05"]) ** 2 * P0_BAR
        else:
            raise ValueError("unknown valve model " + v["model"])
        if self.branch == "pump":
            return dp / (self.rho * G), {"dp_valve_Pa": dp}
        return dp, {"dp_valve_Pa": dp}

    def detail(self, Q):
        """Full breakdown at one flow; the head/pressure total is detail['total']."""
        out = {"static": self.static, "segments": [], "valve": 0.0}
        if self.model == "quadratic_resistance":
            out["resistance"] = self.C * Q * Q
            vh, vd = self.valve_head(Q)
            out["valve"] = vh
            out["valve_detail"] = vd
            out["total"] = self.static + out["resistance"] + vh
            return out
        total = 0.0
        for sg in self.segments:
            A = math.pi * sg["D_m"] ** 2 / 4.0
            u = Q / A
            re = u * sg["D_m"] / self.nu
            if re == 0.0:
                f, branch, cc = float("nan"), "zero_flow", {}
                h = 0.0
            else:
                f, branch, cc = friction_factor(re, sg["eps_m"] / sg["D_m"])
                if self.branch == "pump":
                    h = (f * sg["L_m"] / sg["D_m"] + sg["K_sum"]) * u * u / (2.0 * G)
                else:
                    h = (f * sg["L_m"] / sg["D_m"] + sg["K_sum"]) * self.rho * u * u / 2.0
            total += h
            out["segments"].append({
                "id": sg.get("id", "S"), "v_m_s": u, "Re": re, "f_darcy": f,
                "branch": branch, "loss": h,
                "f_swamee_jain": (f_swamee_jain(re, sg["eps_m"] / sg["D_m"])
                                  if re > 4000.0 else None),
                "crosscheck": cc,
            })
        vh, vd = self.valve_head(Q)
        out["valve"] = vh
        out["valve_detail"] = vd
        out["resistance"] = total
        out["total"] = self.static + total + vh
        return out

    def __call__(self, Q):
        return self.detail(Q)["total"]


# --------------------------------------------------------------------------------------
# 6. Operating point
# --------------------------------------------------------------------------------------

def operating_point(curve, system, qhi=None):
    """Intersection of the machine characteristic with the system curve.

    Returns the root from brent_root, the slope of the difference at the root (which is
    what makes the tolerance defensible), and the deviation against bisection.
    """
    g = lambda Q: curve(Q) - system(Q)
    if not math.isfinite(system(0.0)):
        # A shut valve closes the flow path. This is a different refusal from a system the
        # machine merely cannot overcome, and a tool that reports a number here has
        # extrapolated past its own validity rather than refused.
        return {"has_operating_point": False, "refusal": "flow_path_closed",
                "shutoff": curve(0.0), "system_at_zero": None}
    if curve(0.0) == 0.0 and system(0.0) > 0.0:
        # A machine at rest, or one scaled to zero size, is a different refusal from a
        # system whose static head exceeds the shut-off head of a running machine.
        return {"has_operating_point": False,
                "refusal": "machine_delivers_no_head",
                "shutoff": 0.0, "system_at_zero": system(0.0)}
    if g(0.0) <= 0.0:
        return {"has_operating_point": False,
                "refusal": "static_resistance_at_or_above_shutoff",
                "shutoff": curve(0.0), "system_at_zero": system(0.0)}
    hi = qhi or 0.01
    for _ in range(80):
        if g(hi) < 0.0:
            break
        hi *= 2.0
    else:
        return {"has_operating_point": False, "refusal": "no_upper_bracket"}
    Q, res, iters = brent_root(g, 0.0, hi, xtol=1e-18, rtol=1e-16)
    Qb, resb = bisect_root(g, 0.0, hi)
    h = max(Q * 1e-7, 1e-12)
    slope = (g(Q + h) - g(Q - h)) / (2.0 * h)
    return {
        "has_operating_point": True,
        "Q_m3_s": Q, "H_m": curve(Q) if system.branch == "pump" else None,
        "dp_Pa": curve(Q) if system.branch == "fan" else None,
        "residual": res, "iterations": iters,
        "dG_dQ": slope,
        "dev_brent_vs_bisection_rel": abs(Q - Qb) / Q if Q else 0.0,
    }


def closed_form_quadratic_op(c0, a2, static, C):
    """Exact intersection of H = c0 + a2 Q^2 with H = static + C Q^2.

    Q = sqrt((c0 - static)/(C - a2)). Used for the hand-checked cases; a2 < 0 and C > 0,
    so the denominator is positive and the root is unique for c0 > static.
    """
    return math.sqrt((c0 - static) / (C - a2))


def npsh(p_suction_Pa, T_K, rho, p_vap_Pa, v_suction_m_s, z_m=0.0, NPSHr_m=None):
    """NPSH available at the reference plane and the margin.

    NPSHa = (p_abs - p_vap)/(rho g) + v^2/(2g) - z        (ISO 17769-1)
    margin = NPSHa - NPSHr                                (ANSI/HI 9.6.1)
    """
    a = (p_suction_Pa - p_vap_Pa) / (rho * G) + v_suction_m_s ** 2 / (2.0 * G) - z_m
    out = {"NPSHa_m": a}
    if NPSHr_m is not None:
        out["NPSHr_m"] = NPSHr_m
        out["NPSH_margin_m"] = a - NPSHr_m
        out["cavitation"] = bool(a - NPSHr_m < 0.0)
    return out


def power(Q, head_or_dp, rho, eta, branch="pump"):
    """Hydraulic/air power and shaft power.

    pump: P_h = rho g Q H        (ISO 9906)
    fan:  P_u = Q dp_f           (ISO 5801)
    shaft: P = P_h/eta           (ISO 17769-1)
    """
    ph = rho * G * Q * head_or_dp if branch == "pump" else Q * head_or_dp
    return {"P_hydraulic_W": ph, "eta": eta, "P_shaft_W": ph / eta}


class Composite:
    """Two or more unequal machines in series or in parallel.

    series   : heads add at the common flow                    (White 7th ed. Ch. 11)
    parallel : flows add at the common head; the composite head at a given total flow
               is therefore found by solving sum_i q_i(H) = Q for H, which is what this
               class does, so that the intersection with the system curve is found by
               the same operating_point() routine as every other case.
    """

    def __init__(self, curves, mode):
        self.curves, self.mode = curves, mode

    def shutoff(self):
        return (sum(c(0.0) for c in self.curves) if self.mode == "series"
                else max(c(0.0) for c in self.curves))

    def __call__(self, Q):
        if self.mode == "series":
            return curve_sum_series(self.curves, Q)
        hmax = max(c(0.0) for c in self.curves)
        if Q <= 0.0:
            return hmax
        tot = lambda H: curve_sum_parallel(self.curves, H)[0] - Q
        H, _, _ = brent_root(tot, 0.0, hmax * (1.0 - 1e-14), xtol=1e-18, rtol=1e-16)
        return H

    def split(self, H):
        return curve_sum_parallel(self.curves, H)


# --------------------------------------------------------------------------------------
# 7. Tolerance vocabulary. Each entry carries the reason the physics gives for the number.
# --------------------------------------------------------------------------------------

TOL = {
    "exact": {
        "rel": 1e-12,
        "reason": "Closed form on both sides. The whole evaluation is a handful of "
                  "multiplications and one square root, so the only slack is "
                  "double-precision round-off, of order 1e-15 relative. 1e-12 leaves "
                  "three decades over that and asserts no physical slack at all.",
    },
    "colebrook": {
        "rel": 1e-10,
        "reason": "Both sides solve the same implicit Colebrook-White equation. This "
                  "corpus' root is converged on x = 1/sqrt(f) to |residual| < 1e-15 and "
                  "agrees with an independent bisection of the same equation to the value "
                  "recorded in crosscheck. 1e-10 admits any converged iterative solution "
                  "and excludes the Swamee-Jain explicit approximation, whose deviation "
                  "from the Colebrook root is recorded per case as f_swamee_jain so that a "
                  "friction disagreement can be identified rather than guessed at.",
    },
    "root": {
        "rel": 1e-8,
        "reason": "The operating point is a transversal crossing of two smooth curves. "
                  "dG_dQ on the case records |d(H_machine - H_system)/dQ| at the root, and "
                  "the residual recorded there maps to a flow error below 1e-12 relative. "
                  "1e-8 is the band a second solver's own convergence test may occupy "
                  "without any disagreement in the physics.",
    },
    "properties": {
        "rel": 1e-6,
        "reason": "IAPWS R7-97 (water density, saturation pressure) and IAPWS R12-08 "
                  "(viscosity) are definitions, not correlations with scatter, so a "
                  "second implementation of the same formulation agrees to the last few "
                  "digits. 1e-6 covers a different library build or a different "
                  "reference-state convention. A page that computes properties from its "
                  "own polynomial fit will exceed this band; the right record of that is "
                  "the fit's deviation, not a wider tolerance.",
    },
    "flag": {
        "exact_match": True,
        "reason": "A boolean or a refusal string. There is no numeric band: the case either "
                  "reports the state the physics gives or it does not.",
    },
}

UNITS = {
    # inputs
    "T_K": "K", "p_Pa": "Pa", "p_suction_Pa": "Pa", "p_ref_Pa": "Pa",
    "L_m": "m", "D_m": "m", "eps_m": "m", "K_sum": "1", "zeta": "1",
    "Kv_m3_h_bar05": "m3/h/bar^0.5", "H_static_m": "m", "dp_static_Pa": "Pa",
    "C_s2_m5": "s2/m5", "C_Pa_s2_m6": "Pa s2/m6",
    "H0_m": "m", "a1_s_m2": "s/m2", "a2_s2_m5": "s2/m5",
    "dp0_Pa": "Pa", "b1_Pa_s_m3": "Pa s/m3", "b2_Pa_s2_m6": "Pa s2/m6",
    "speed_ratio": "1", "impeller_ratio": "1", "n_units": "1", "eta": "1",
    "Q_m3_s": "m3/s", "z_m": "m", "NPSHr_m": "m", "rho_ratio": "1",
    # properties
    "rho_kg_m3": "kg/m3", "mu_Pa_s": "Pa s", "nu_m2_s": "m2/s", "p_vap_Pa": "Pa",
    # expected
    "Re": "1", "f_darcy": "1", "v_m_s": "m/s", "h_f_m": "m", "dp_f_Pa": "Pa",
    "H_sys_m": "m", "dp_sys_Pa": "Pa", "H_machine_m": "m", "dp_machine_Pa": "Pa",
    "Q_op_m3_s": "m3/s", "Q_op_m3_h": "m3/h", "H_op_m": "m", "dp_op_Pa": "Pa",
    "P_hydraulic_W": "W", "P_shaft_W": "W",
    "NPSHa_m": "m", "NPSH_margin_m": "m", "cavitation": "boolean",
    "has_operating_point": "boolean", "refusal": "string",
    "Q_per_unit_m3_s": "m3/s", "dG_dQ": "s/m2 (pump) or Pa s/m6 (fan)",
    "rel_roughness": "1", "D_suction_m": "m", "P_shaft_reference_W": "W",
    "f_colebrook_if_extended": "1", "f_laminar_if_extended": "1",
    "rho_ref_kg_m3": "kg/m3",
    "h_valve_m": "m", "dp_valve_Pa": "Pa", "shutoff_m": "m", "shutoff_Pa": "Pa",
}

CASES = []


def add(cid, group, note, inputs, expect, tol, relations,
        graded=True, status="pass", crosscheck=None, hand_check=None, extra=None):
    """Append one case. `tol` maps every graded expect key to a tolerance entry."""
    c = {
        "id": cid, "group": group, "note": note, "graded": graded, "status": status,
        "inputs": inputs, "expect": expect, "tol": tol, "relations": relations,
    }
    if crosscheck:
        c["crosscheck"] = crosscheck
    if hand_check:
        c["hand_check"] = hand_check
    if extra:
        c.update(extra)
    CASES.append(c)
    return c


def tolmap(keys, kind):
    return {k: dict(TOL[kind]) for k in keys}


# --------------------------------------------------------------------------------------
# 8. Fluid presets used by the cases
# --------------------------------------------------------------------------------------

W20 = water_props(293.15, 2.0e5)
W60 = water_props(333.15, 3.0e5)
W90 = water_props(363.15, 4.0e5)
A20 = air_props(293.15, 101325.0)
A60 = air_props(333.15, 101325.0)

FLUIDS = {
    "water_20C_2bar": {"name": "water", "T_K": 293.15, "p_Pa": 2.0e5, "props": W20},
    "water_60C_3bar": {"name": "water", "T_K": 333.15, "p_Pa": 3.0e5, "props": W60},
    "water_90C_4bar": {"name": "water", "T_K": 363.15, "p_Pa": 4.0e5, "props": W90},
    "air_20C_1atm":   {"name": "air",   "T_K": 293.15, "p_Pa": 101325.0, "props": A20},
    "air_60C_1atm":   {"name": "air",   "T_K": 333.15, "p_Pa": 101325.0, "props": A60},
}


# The same three liquid states evaluated with the page's OWN declared correlations
# (decision 2 of the 2026-10 round). These are additional keys: the standards presets
# above are untouched, and the relation cases that grade a published friction law against
# a standard keep them.
def _page_props(T_K):
    Tc = T_K - 273.15
    rho = 1000.0 * (1.0 - ((Tc + 288.9414) / (508929.2 * (Tc + 68.12963)))
                    * (Tc - 3.9863) ** 2)
    mu = 2.414e-5 * 10.0 ** (247.8 / (Tc + 133.15))
    pv = (10.0 ** (8.07131 - 1730.63 / (233.426 + Tc))) * 133.322368
    return {"rho_kg_m3": rho, "mu_Pa_s": mu, "nu_m2_s": mu / rho, "p_vap_Pa": pv}


for _k in ("water_20C_2bar", "water_60C_3bar", "water_90C_4bar"):
    _f = FLUIDS[_k]
    FLUIDS[_k + "_page"] = {"name": _f["name"], "T_K": _f["T_K"], "p_Pa": _f["p_Pa"],
                            "props": _page_props(_f["T_K"])}


def fl(key):
    f = FLUIDS[key]
    return {"fluid": key, "fluid_name": f["name"], "T_K": f["T_K"], "p_Pa": f["p_Pa"],
            "rho_kg_m3": f["props"]["rho_kg_m3"], "nu_m2_s": f["props"]["nu_m2_s"]}


# --------------------------------------------------------------------------------------
# 9. Group 1 - laminar friction, f = 64/Re. Closed form, hand-checkable.
# --------------------------------------------------------------------------------------

LAM = [
    ("lam_water20_D50_Q0.05", "water_20C_2bar", 0.050, 5.0e-5, 20.0, 4.5e-5, 0.0),
    ("lam_water20_D50_Q0.07", "water_20C_2bar", 0.050, 7.0e-5, 20.0, 4.5e-5, 0.0),
    ("lam_water90_D40_Q0.015", "water_90C_4bar", 0.040, 1.5e-5, 15.0, 4.5e-5, 2.0),
    ("lam_air20_D200_v0.10",  "air_20C_1atm",   0.200, 0.10 * math.pi * 0.04 / 4, 30.0, 1.5e-4, 0.0),
    ("lam_air60_D250_v0.08",  "air_60C_1atm",   0.250, 0.08 * math.pi * 0.0625 / 4, 25.0, 1.5e-4, 1.5),
    ("lam_water20_D25_Q0.01", "water_20C_2bar", 0.025, 1.0e-5, 10.0, 4.5e-5, 0.0),
]

for cid, fkey, D, Q, L, eps, K in LAM:
    p = FLUIDS[fkey]["props"]
    A = math.pi * D * D / 4.0
    v = Q / A
    re = v * D / p["nu_m2_s"]
    assert re < 2000.0, (cid, re)
    f = f_laminar(re)
    branch = "pump" if FLUIDS[fkey]["name"] == "water" else "fan"
    if branch == "pump":
        hf = (f * L / D + K) * v * v / (2.0 * G)
        exp = {"Re": re, "f_darcy": f, "v_m_s": v, "h_f_m": hf}
    else:
        dpf = (f * L / D + K) * p["rho_kg_m3"] * v * v / 2.0
        exp = {"Re": re, "f_darcy": f, "v_m_s": v, "dp_f_Pa": dpf}
    add(cid, "friction_laminar",
        "Laminar Darcy friction factor and the Darcy-Weisbach loss at Re = %.1f." % re,
        {**fl(fkey), "L_m": L, "D_m": D, "eps_m": eps, "K_sum": K, "Q_m3_s": Q},
        exp, tolmap(list(exp), "exact"),
        ["f_laminar", "darcy_weisbach", "resistance_coefficient"])

# --------------------------------------------------------------------------------------
# 10. Group 2 - turbulent friction from the Colebrook-White equation, and its two limits.
# --------------------------------------------------------------------------------------

TURB = [
    ("cw_Re1e4_rr0",      1.0e4,  0.0),
    ("cw_Re1e4_rr4.5e-4", 1.0e4,  4.5e-4),
    ("cw_Re1e5_rr4.5e-4", 1.0e5,  4.5e-4),
    ("cw_Re1e5_rr1e-3",   1.0e5,  1.0e-3),
    ("cw_Re1e6_rr1e-3",   1.0e6,  1.0e-3),
    ("cw_Re1e6_rr5e-3",   1.0e6,  5.0e-3),
    ("cw_Re1e7_rr5e-3",   1.0e7,  5.0e-3),
    ("cw_Re5e6_rr1e-4",   5.0e6,  1.0e-4),
]

for cid, re, rr in TURB:
    if rr == 0.0:
        f = f_smooth_prandtl(re)
        cc = {"route": "smooth_wall_limit"}
        rels = ["colebrook_white", "smooth_wall_limit"]
    else:
        f, cc = f_colebrook(re, rr)
        cc["f_swamee_jain"] = f_swamee_jain(re, rr)
        cc["dev_colebrook_vs_swamee_jain_rel"] = abs(f - cc["f_swamee_jain"]) / f
        cc["f_fully_rough_limit"] = f_fully_rough(rr)
        rels = ["colebrook_white"]
    add(cid, "friction_turbulent",
        "Colebrook-White Darcy friction factor at Re = %g, eps/D = %g." % (re, rr),
        {"Re": re, "rel_roughness": rr},
        {"f_darcy": f}, tolmap(["f_darcy"], "colebrook"), rels, crosscheck=cc)

# the two closed-form asymptotes, as their own hand-checked cases
for cid, rr in (("cw_fully_rough_rr1e-3", 1.0e-3), ("cw_fully_rough_rr5e-3", 5.0e-3)):
    f = f_fully_rough(rr)
    add(cid, "friction_turbulent",
        "Fully-rough asymptote of Colebrook: 1/sqrt(f) = -2 log10(eps/(3.7 D)); "
        "Re-independent and a closed form.",
        {"rel_roughness": rr, "Re": None},
        {"f_darcy": f}, tolmap(["f_darcy"], "exact"),
        ["fully_rough_limit"],
        hand_check="1/sqrt(f) = -2*log10(%g/3.7) = %.12f ; f = 1/x^2 = %.12f"
                   % (rr, -2.0 * math.log10(rr / 3.7), f))

# transition region: recorded, never graded
for cid, re, rr in (("tr_Re2500_rr4.5e-4", 2500.0, 4.5e-4),
                    ("tr_Re3500_rr1e-3", 3500.0, 1.0e-3)):
    f, cc = f_colebrook(re, rr)
    add(cid, "friction_transition",
        "2000 < Re < 4000. No single accepted friction law exists here and the tool's "
        "choice is not derivable from any document available to this generator. The "
        "Colebrook value and the laminar value are both recorded; neither is asserted.",
        {"Re": re, "rel_roughness": rr},
        {"f_colebrook_if_extended": f, "f_laminar_if_extended": f_laminar(re)},
        {}, ["colebrook_white", "f_laminar"], graded=False, status="info")

# --------------------------------------------------------------------------------------
# 11. Machines and systems used by the remaining groups. Declared once; every case names
#     the key it uses and carries the coefficients in its own inputs.
# --------------------------------------------------------------------------------------

PUMPS = {                        # H0_m, a1_s_m2, a2_s2_m5
    "P1": (25.0, 0.0, -2.0e4),
    "P2": (32.0, 60.0, -3.0e4),
    "P3": (12.0, 0.0, -8.0e4),
    "P4": (48.0, -100.0, -1.5e4),
}
FANS = {                         # dp0_Pa, b1_Pa_s_m3, b2_Pa_s2_m6
    "F1": (900.0, 0.0, -400.0 / 3.0),
    "F2": (1400.0, 200.0, -400.0),
}
SQ = {                           # quadratic system, pump branch: H_static_m, C_s2_m5
    "SQ1": (8.0, 1.5e4),
    "SQ2": (0.0, 3.0e4),
    "SQ3": (20.0, 1.0e4),
    "SQ4": (5.0, 6.0e4),
    "SQ5": (30.0, 1.5e4),        # static head above P1's shutoff: a refusal case
}
FQ = {                           # quadratic system, fan branch: dp_static_Pa, C_Pa_s2_m6
    "FQ1": (0.0, 200.0),
    "FQ2": (100.0, 250.0),
    # FQ3 declares the SAME duct as FQ1, but states its coefficient as the loss at the
    # 20 C reference density, so that dp_sys = C (rho/rho_ref) Q^2. That is the form in
    # which the fan laws leave the operating volume flow unchanged under a density change,
    # and FQ3 is the only fan system in this corpus for which that invariance is asserted.
    "FQ3": (0.0, 200.0),
}
FQ_RHO_SCALED = {"FQ3"}
PS = {                           # pipe-segment systems, pump branch
    "PS1": (8.0, [{"id": "S1", "L_m": 120.0, "D_m": 0.100, "eps_m": 4.5e-5, "K_sum": 6.5}]),
    "PS2": (2.0, [{"id": "S1", "L_m": 40.0, "D_m": 0.080, "eps_m": 4.5e-5, "K_sum": 3.0},
                  {"id": "S2", "L_m": 90.0, "D_m": 0.065, "eps_m": 4.5e-5, "K_sum": 5.5}]),
    "PS3": (15.0, [{"id": "S1", "L_m": 250.0, "D_m": 0.150, "eps_m": 1.5e-4, "K_sum": 12.0}]),
}
DS = {                           # duct systems, fan branch
    "DS1": (150.0, [{"id": "D1", "L_m": 60.0, "D_m": 0.400, "eps_m": 9.0e-5, "K_sum": 4.0}]),
}

REL_SET = {
    "op_quadratic": ["machine_characteristic", "system_curve_parabola", "intersection"],
    "op_pipe": ["machine_characteristic", "darcy_weisbach", "colebrook_white",
                "resistance_coefficient", "intersection"],
}


def machine_inputs(kind, key, speed=1.0, dia=1.0, law="trim", n_units=1,
                   arrangement="single", rho_ratio=1.0, keys=None):
    if keys:
        return {"kind": kind, "units": [
            {"curve": k, "H0_m": PUMPS[k][0], "a1_s_m2": PUMPS[k][1],
             "a2_s2_m5": PUMPS[k][2]} for k in keys],
            "arrangement": arrangement, "speed_ratio": speed,
            "impeller_ratio": dia, "impeller_law": law}
    if kind == "pump":
        c0, a1, a2 = PUMPS[key]
        d = {"kind": "pump", "curve": key, "H0_m": c0, "a1_s_m2": a1, "a2_s2_m5": a2}
    else:
        c0, a1, a2 = FANS[key]
        d = {"kind": "fan", "curve": key, "dp0_Pa": c0, "b1_Pa_s_m3": a1,
             "b2_Pa_s2_m6": a2, "rho_ratio": rho_ratio}
    d.update({"n_units": n_units, "arrangement": arrangement, "speed_ratio": speed,
              "impeller_ratio": dia, "impeller_law": law})
    return d


def system_inputs(skey, valve=None):
    if skey in SQ:
        st, C = SQ[skey]
        d = {"model": "quadratic_resistance", "system": skey,
             "H_static_m": st, "C_s2_m5": C}
    elif skey in FQ:
        st, C = FQ[skey]
        d = {"model": "quadratic_resistance", "system": skey,
             "dp_static_Pa": st, "C_Pa_s2_m6": C}
        if skey in FQ_RHO_SCALED:
            d["C_scales_with_density"] = True
            d["rho_ref_kg_m3"] = A20["rho_kg_m3"]
    elif skey in PS:
        st, segs = PS[skey]
        d = {"model": "pipe_segments", "system": skey, "H_static_m": st, "segments": segs}
    else:
        st, segs = DS[skey]
        d = {"model": "pipe_segments", "system": skey, "dp_static_Pa": st, "segments": segs}
    if valve:
        d["valve"] = valve
    return d


def build_system(skey, fkey, valve=None):
    p = FLUIDS[fkey]["props"]
    branch = "pump" if FLUIDS[fkey]["name"] == "water" else "fan"
    if skey in SQ:
        st, C = SQ[skey]
        return System("quadratic_resistance", st, C=C, valve=valve,
                      rho=p["rho_kg_m3"], nu=p["nu_m2_s"], branch=branch)
    if skey in FQ:
        st, C = FQ[skey]
        if skey in FQ_RHO_SCALED:
            C = C * p["rho_kg_m3"] / A20["rho_kg_m3"]
        return System("quadratic_resistance", st, C=C, valve=valve,
                      rho=p["rho_kg_m3"], nu=p["nu_m2_s"], branch=branch)
    st, segs = (PS[skey] if skey in PS else DS[skey])
    return System("pipe_segments", st, segments=segs, valve=valve,
                  rho=p["rho_kg_m3"], nu=p["nu_m2_s"], branch=branch)


def prop_sensitivity(make_system, curve, qhi):
    """d(ln Q_op)/d(ln rho) and d(ln Q_op)/d(ln nu), by central differences at 1e-3.

    Recorded so that a driver whose page computes its own fluid properties can tell how
    much of a flow deviation a property difference accounts for, without the tolerance
    on the flow being widened to hide it.
    """
    out = {}
    for name in ("rho", "nu"):
        vals = []
        for sgn in (+1.0, -1.0):
            s = make_system()
            base = getattr(s, name)
            setattr(s, name, base * (1.0 + sgn * 1e-3))
            r = operating_point(curve, s, qhi)
            vals.append(r["Q_m3_s"] if r["has_operating_point"] else float("nan"))
        s0 = make_system()
        q0 = operating_point(curve, s0, qhi)["Q_m3_s"]
        out["dlnQ_dln" + name] = (vals[0] - vals[1]) / (2e-3 * q0)
    return out


def op_case(cid, group, note, kind, mkey, skey, fkey, speed=1.0, dia=1.0, law="trim",
            n_units=1, arrangement="single", valve=None, keys=None, eta=None,
            npsh_args=None, hand_check=None, qhi=0.02, rho_ratio=1.0, expect_refusal=None):
    """Build one operating-point case end to end."""
    p = FLUIDS[fkey]["props"]
    branch = "pump" if FLUIDS[fkey]["name"] == "water" else "fan"
    if keys:
        curves = [Curve(*PUMPS[k], speed=speed, dia=dia, law=law) for k in keys]
        curve = Composite(curves, arrangement)
    else:
        c0, a1, a2 = (PUMPS[mkey] if kind == "pump" else FANS[mkey])
        curve = Curve(c0, a1, a2, speed=speed, dia=dia, law=law, rho_ratio=rho_ratio,
                      n_units=n_units, arrangement=arrangement)
    sysm = build_system(skey, fkey, valve)
    r = operating_point(curve, sysm, qhi)

    inputs = {**fl(fkey),
              "machine": machine_inputs(kind, mkey, speed, dia, law, n_units,
                                        arrangement, rho_ratio, keys),
              "system": system_inputs(skey, valve)}
    if eta is not None:
        inputs["eta"] = eta

    if not r["has_operating_point"]:
        exp = {"has_operating_point": False, "refusal": r["refusal"]}
        add(cid, group, note, inputs, exp,
            {k: dict(TOL["flag"]) for k in exp},
            REL_SET["op_quadratic"] if sysm.model == "quadratic_resistance"
            else REL_SET["op_pipe"],
            crosscheck={k: v for k, v in r.items() if k not in exp})
        return

    Q = r["Q_m3_s"]
    exp = {"has_operating_point": True, "Q_op_m3_s": Q, "Q_op_m3_h": Q * 3600.0}
    if branch == "pump":
        exp["H_op_m"] = curve(Q)
        exp["shutoff_m"] = curve(0.0)
    else:
        exp["dp_op_Pa"] = curve(Q)
        exp["shutoff_Pa"] = curve(0.0)

    det = sysm.detail(Q)
    if sysm.model == "pipe_segments":
        for sg in det["segments"]:
            exp["Re_" + sg["id"]] = sg["Re"]
            exp["f_darcy_" + sg["id"]] = sg["f_darcy"]
            exp["v_m_s_" + sg["id"]] = sg["v_m_s"]
    if valve:
        if branch == "pump":
            exp["h_valve_m"] = det["valve"]
        else:
            exp["dp_valve_Pa"] = det["valve"]
    if keys and arrangement == "parallel":
        H = curve(Q)
        _, per = curve.split(H)
        for i, q in enumerate(per):
            exp["Q_m3_s_unit%d" % (i + 1)] = q
    if n_units > 1 and arrangement == "parallel":
        exp["Q_per_unit_m3_s"] = Q / n_units
    if eta is not None:
        pw = power(Q, curve(Q), p["rho_kg_m3"], eta, branch)
        exp["P_hydraulic_W"] = pw["P_hydraulic_W"]
        exp["P_shaft_W"] = pw["P_shaft_W"]
    if npsh_args:
        A = math.pi * npsh_args["D_suction_m"] ** 2 / 4.0
        n = npsh(npsh_args["p_suction_Pa"], FLUIDS[fkey]["T_K"], p["rho_kg_m3"],
                 p["p_vap_Pa"], Q / A, npsh_args.get("z_m", 0.0),
                 npsh_args.get("NPSHr_m"))
        exp.update(n)
        inputs["npsh"] = npsh_args

    exact = (sysm.model == "quadratic_resistance" and not valve)
    # The reference flow is exact wherever `exact` holds (the intersection of two
    # parabolas has a closed form, recorded in crosscheck as closed_form_Q_m3_s). The
    # GRADED band is still TOL["root"], because the page finds its own intersection by
    # its own iteration and this generator cannot read that solver's convergence test.
    # Grading an iterated quantity at 1e-12 would test the page's iteration count, not
    # its physics.
    kind_t = "root"
    tol = {}
    for k in exp:
        if k in ("has_operating_point", "cavitation"):
            tol[k] = dict(TOL["flag"])
        elif k.startswith("f_darcy"):
            tol[k] = dict(TOL["colebrook"])
        elif k in ("shutoff_m", "shutoff_Pa", "NPSHr_m"):
            tol[k] = dict(TOL["exact"])
        else:
            tol[k] = dict(TOL[kind_t])

    cc = {"residual": r["residual"], "iterations": r["iterations"],
          "dG_dQ": r["dG_dQ"],
          "dev_brent_vs_bisection_rel": r["dev_brent_vs_bisection_rel"]}
    if exact and not keys:
        # Identical units with no linear term: the intersection of two parabolas, so an
        # exact closed form exists and is recorded here as the root finder's crosscheck.
        c0, a1, a2 = (PUMPS[mkey] if kind == "pump" else FANS[mkey])
        if a1 == 0.0:
            sr, dr = speed, dia
            kq, kh = ((sr * dr, sr * sr * dr * dr) if law == "trim"
                      else (sr * dr ** 3, sr * sr * dr * dr))
            kh *= rho_ratio
            st, C = (SQ[skey] if skey in SQ else FQ[skey])
            if skey in FQ_RHO_SCALED:
                C = C * p["rho_kg_m3"] / A20["rho_kg_m3"]
            if arrangement == "series" and n_units > 1:
                c0e, a2e = n_units * kh * c0, n_units * kh * a2 / (kq * kq)
            elif arrangement == "parallel" and n_units > 1:
                c0e, a2e = kh * c0, kh * a2 / ((n_units * kq) ** 2)
            else:
                c0e, a2e = kh * c0, kh * a2 / (kq * kq)
            qcf = closed_form_quadratic_op(c0e, a2e, st, C)
            cc["closed_form_Q_m3_s"] = qcf
            cc["dev_root_vs_closed_form_rel"] = abs(Q - qcf) / Q
    if sysm.model == "pipe_segments":
        for sg in det["segments"]:
            if sg["f_swamee_jain"]:
                cc["f_swamee_jain_" + sg["id"]] = sg["f_swamee_jain"]
                cc["dev_colebrook_vs_swamee_jain_rel_" + sg["id"]] = \
                    abs(sg["f_darcy"] - sg["f_swamee_jain"]) / sg["f_darcy"]
    cc["property_sensitivity"] = prop_sensitivity(
        lambda: build_system(skey, fkey, valve), curve, qhi)
    cc["system_head_breakdown"] = {
        "static": det["static"], "resistance": det["resistance"], "valve": det["valve"]}

    c = add(cid, group, note, inputs, exp, tol,
            REL_SET["op_quadratic"] if sysm.model == "quadratic_resistance"
            else REL_SET["op_pipe"],
            crosscheck=cc, hand_check=hand_check)
    # Private, never emitted: the curve, the system builder and the bracket this case was
    # solved with, so decision 2 of the 2026-10 round can re-solve the SAME case with the
    # page's declared water correlations in place of the IAPWS presets, using this
    # generator's own solver rather than a reconstruction of it.
    c["_solver"] = {"curve": curve, "skey": skey, "fkey": fkey, "valve": valve,
                    "qhi": qhi, "branch": branch, "eta": eta, "npsh_args": npsh_args}

# --------------------------------------------------------------------------------------
# 12. Group 3 - the system curve itself, at a prescribed flow.
# --------------------------------------------------------------------------------------

SYSCURVE = [
    ("sys_PS1_Q0.010", "PS1", "water_20C_2bar", 0.010),
    ("sys_PS1_Q0.020", "PS1", "water_20C_2bar", 0.020),
    ("sys_PS1_Q0.030", "PS1", "water_60C_3bar", 0.030),
    ("sys_PS2_Q0.005", "PS2", "water_20C_2bar", 0.005),
    ("sys_PS2_Q0.010", "PS2", "water_90C_4bar", 0.010),
    ("sys_PS3_Q0.040", "PS3", "water_20C_2bar", 0.040),
]
for cid, skey, fkey, Q in SYSCURVE:
    sysm = build_system(skey, fkey)
    det = sysm.detail(Q)
    exp = {"H_sys_m": det["total"]}
    tol = {"H_sys_m": dict(TOL["colebrook"])}
    for sg in det["segments"]:
        exp["Re_" + sg["id"]] = sg["Re"]
        exp["v_m_s_" + sg["id"]] = sg["v_m_s"]
        exp["f_darcy_" + sg["id"]] = sg["f_darcy"]
        exp["h_f_m_" + sg["id"]] = sg["loss"]
        tol["Re_" + sg["id"]] = dict(TOL["exact"])
        tol["v_m_s_" + sg["id"]] = dict(TOL["exact"])
        tol["f_darcy_" + sg["id"]] = dict(TOL["colebrook"])
        tol["h_f_m_" + sg["id"]] = dict(TOL["colebrook"])
    add(cid, "system_curve",
        "System head at a prescribed flow: static head plus Darcy-Weisbach friction with "
        "a Colebrook friction factor plus the resistance coefficients.",
        {**fl(fkey), "system": system_inputs(skey), "Q_m3_s": Q},
        exp, tol, REL_SET["op_pipe"],
        crosscheck={"breakdown": {"static": det["static"], "resistance": det["resistance"]},
                    "f_swamee_jain": {sg["id"]: sg["f_swamee_jain"]
                                      for sg in det["segments"]}})

# --------------------------------------------------------------------------------------
# 13. Group 4 - one pump against one system
# --------------------------------------------------------------------------------------

Q_P1_SQ1 = closed_form_quadratic_op(25.0, -2.0e4, 8.0, 1.5e4)
op_case("op_P1_SQ1_water20", "operating_point_single",
        "One pump against a parabolic system curve. Closed form on both sides.",
        "pump", "P1", "SQ1", "water_20C_2bar",
        hand_check="Q = sqrt((H0 - H_static)/(C - a2)) = sqrt((25 - 8)/(1.5e4 + 2.0e4)) "
                   "= sqrt(17/3.5e4) = sqrt(4.857142857142857e-4) = %.15f m3/s "
                   "= %.9f m3/h ; H = 8 + 1.5e4*Q^2 = %.15f m"
                   % (Q_P1_SQ1, Q_P1_SQ1 * 3600.0, 8.0 + 1.5e4 * Q_P1_SQ1 ** 2))
op_case("op_P1_PS1_water20", "operating_point_single",
        "One pump against a single-pipe system with Colebrook friction.",
        "pump", "P1", "PS1", "water_20C_2bar")
op_case("op_P2_SQ2_water20", "operating_point_single",
        "Pump curve with a non-zero linear term against a system with no static head.",
        "pump", "P2", "SQ2", "water_20C_2bar", qhi=0.03)
op_case("op_P2_PS2_water20", "operating_point_single",
        "Pump curve with a linear term against two pipe segments in series.",
        "pump", "P2", "PS2", "water_20C_2bar", qhi=0.03)
op_case("op_P3_SQ4_water20", "operating_point_single",
        "Small pump, high-resistance system.", "pump", "P3", "SQ4", "water_20C_2bar",
        qhi=0.01)
op_case("op_P4_PS3_water20", "operating_point_single",
        "Large pump with a negative linear term against a 250 m pipe.",
        "pump", "P4", "PS3", "water_20C_2bar", qhi=0.05)
op_case("op_P1_PS1_water60", "operating_point_single",
        "The same pump and pipe at 60 C: density and viscosity from IAPWS move the "
        "friction factor and therefore the operating point.",
        "pump", "P1", "PS1", "water_60C_3bar")
op_case("op_P1_PS1_water90", "operating_point_single",
        "The same pump and pipe at 90 C.",
        "pump", "P1", "PS1", "water_90C_4bar")

# --------------------------------------------------------------------------------------
# 14. Group 5 - affinity law, speed
# --------------------------------------------------------------------------------------

for s in (1.0, 1.1, 0.9, 0.8, 0.7):
    op_case("affinity_speed_s%.2f" % s, "affinity_speed",
            "Speed ratio %.2f applied to the pump curve by the affinity laws "
            "(Q ~ n, H ~ n^2), then intersected with the unchanged system." % s,
            "pump", "P1", "SQ1", "water_20C_2bar", speed=s)

# shut-off head alone: a pure multiplication, graded exactly
s = 0.75
add("affinity_speed_shutoff_s0.75", "affinity_speed",
    "Shut-off head under a speed ratio of 0.75. No intersection is solved: H(0) scales "
    "as n^2 and the check is one multiplication.",
    {"machine": machine_inputs("pump", "P1", speed=s), "Q_m3_s": 0.0},
    {"shutoff_m": s * s * 25.0}, tolmap(["shutoff_m"], "exact"),
    ["affinity_speed"],
    hand_check="H(0) = s^2 * H0 = 0.75^2 * 25 = 0.5625 * 25 = 14.0625 m exactly")

# --------------------------------------------------------------------------------------
# 15. Group 6 - affinity law, impeller
# --------------------------------------------------------------------------------------

for d in (0.95, 0.90, 0.85):
    op_case("affinity_trim_d%.2f" % d, "affinity_impeller",
            "Impeller trim ratio %.2f inside an unchanged casing: Q ~ D, H ~ D^2." % d,
            "pump", "P1", "SQ1", "water_20C_2bar", dia=d, law="trim")
for d in (0.95, 0.90):
    op_case("affinity_similarity_d%.2f" % d, "affinity_impeller",
            "Geometrically similar machine at diameter ratio %.2f: Q ~ n D^3, H ~ n^2 D^2. "
            "This is NOT the trim law and the two give different answers; a tool "
            "implements one of them." % d,
            "pump", "P1", "SQ1", "water_20C_2bar", dia=d, law="similarity")
op_case("affinity_speed_and_trim_s0.9_d0.95", "affinity_impeller",
        "Speed ratio 0.9 and trim ratio 0.95 together.",
        "pump", "P1", "SQ1", "water_20C_2bar", speed=0.9, dia=0.95, law="trim")

# --------------------------------------------------------------------------------------
# 16. Group 7 - machines in series
# --------------------------------------------------------------------------------------

Q_2P1_SQ1 = closed_form_quadratic_op(2 * 25.0, -2 * 2.0e4, 8.0, 1.5e4)
op_case("series_2xP1_SQ1", "series",
        "Two identical pumps in series: heads add at the common flow.",
        "pump", "P1", "SQ1", "water_20C_2bar", n_units=2, arrangement="series",
        hand_check="H_tot(Q) = 2*(25 - 2.0e4 Q^2) = 50 - 4.0e4 Q^2 ; "
                   "50 - 4.0e4 Q^2 = 8 + 1.5e4 Q^2 -> Q = sqrt(42/5.5e4) "
                   "= sqrt(7.636363636363636e-4) = %.15f m3/s ; H = 8 + 1.5e4 Q^2 = %.15f m"
                   % (Q_2P1_SQ1, 8.0 + 1.5e4 * Q_2P1_SQ1 ** 2))
op_case("series_3xP3_SQ3", "series",
        "Three identical small pumps in series against a high static head.",
        "pump", "P3", "SQ3", "water_20C_2bar", n_units=3, arrangement="series", qhi=0.01)
op_case("series_2xP3_SQ3", "series",
        "Two identical small pumps in series against the same system: the flow gain over "
        "three units is the quantity of interest.",
        "pump", "P3", "SQ3", "water_20C_2bar", n_units=2, arrangement="series", qhi=0.01)
op_case("series_P1_P3_SQ1", "series",
        "Two unequal pumps in series.",
        "pump", None, "SQ1", "water_20C_2bar", keys=["P1", "P3"], arrangement="series")
op_case("series_P2_P4_PS3", "series",
        "Two unequal pumps in series against a pipe system with Colebrook friction.",
        "pump", None, "PS3", "water_20C_2bar", keys=["P2", "P4"], arrangement="series",
        qhi=0.06)

# --------------------------------------------------------------------------------------
# 17. Group 8 - machines in parallel
# --------------------------------------------------------------------------------------

# H_tot(Q) = 25 - 2.0e4 (Q/2)^2 = 25 - 5.0e3 Q^2, so the total flow is
# sqrt((25 - 8)/(1.5e4 + 5.0e3)) = sqrt(17/2.0e4).
Q_2P1par = math.sqrt(17.0 / 2.0e4)
op_case("parallel_2xP1_SQ1", "parallel",
        "Two identical pumps in parallel: flows add at the common head.",
        "pump", "P1", "SQ1", "water_20C_2bar", n_units=2, arrangement="parallel",
        qhi=0.04,
        hand_check="H_tot(Q) = 25 - 2.0e4 (Q/2)^2 = 25 - 5.0e3 Q^2 ; "
                   "25 - 5.0e3 Q^2 = 8 + 1.5e4 Q^2 -> Q = sqrt(17/2.0e4) "
                   "= sqrt(8.5e-4) = %.15f m3/s, i.e. %.15f m3/s per pump ; "
                   "H = 8 + 1.5e4 Q^2 = %.15f m"
                   % (Q_2P1par, Q_2P1par / 2.0, 8.0 + 1.5e4 * Q_2P1par ** 2))
op_case("parallel_3xP1_SQ1", "parallel",
        "Three identical pumps in parallel.",
        "pump", "P1", "SQ1", "water_20C_2bar", n_units=3, arrangement="parallel", qhi=0.06)
op_case("parallel_1xP1_SQ1_identity", "parallel",
        "One unit declared in parallel. The composition must be the identity: this case "
        "and op_P1_SQ1_water20 must give the same flow.",
        "pump", "P1", "SQ1", "water_20C_2bar", n_units=1, arrangement="parallel")
op_case("parallel_2xP3_SQ4", "parallel",
        "Two identical small pumps in parallel against a high-resistance system, where "
        "parallel operation buys little flow.",
        "pump", "P3", "SQ4", "water_20C_2bar", n_units=2, arrangement="parallel", qhi=0.02)
op_case("parallel_P1_P3_SQ1", "parallel",
        "Two unequal pumps in parallel. P3 has a 12 m shut-off head, so above 12 m it "
        "carries no flow; the per-unit split is graded.",
        "pump", None, "SQ1", "water_20C_2bar", keys=["P1", "P3"], arrangement="parallel",
        qhi=0.04)
op_case("parallel_P1_P2_PS1", "parallel",
        "Two unequal pumps in parallel against a pipe system with Colebrook friction.",
        "pump", None, "PS1", "water_20C_2bar", keys=["P1", "P2"], arrangement="parallel",
        qhi=0.05)

# --------------------------------------------------------------------------------------
# 18. Group 9 - a throttled valve
# --------------------------------------------------------------------------------------

for z in (0.0, 5.0, 20.0, 100.0):
    op_case("valve_zeta%g_P1_SQ1" % z, "valve",
            "Throttling valve as a resistance coefficient zeta = %g on a DN80 line "
            "(Crane TP-410 Ch. 2: h = zeta v^2/(2g)); zeta = 0 must reproduce "
            "op_P1_SQ1_water20." % z,
            "pump", "P1", "SQ1", "water_20C_2bar",
            valve={"model": "zeta", "zeta": z, "D_m": 0.080})
for kv in (40.0, 12.0):
    op_case("valve_kv%g_P1_SQ1" % kv, "valve",
            "Throttling valve as an IEC 60534-2-1 flow coefficient Kv = %g m3/h/bar^0.5."
            % kv,
            "pump", "P1", "SQ1", "water_20C_2bar",
            valve={"model": "kv", "Kv_m3_h_bar05": kv})
op_case("valve_kv_closed_P1_SQ1", "valve",
        "Valve shut (Kv = 0). No flow is possible and the tool must refuse rather than "
        "return a number.",
        "pump", "P1", "SQ1", "water_20C_2bar",
        valve={"model": "kv", "Kv_m3_h_bar05": 0.0})

KV_HC = 40.0
rho20 = W20["rho_kg_m3"]
dp_hc = (rho20 / RHO0_KV) * 1.0 ** 2 * P0_BAR
add("valve_kv_identity_Q_eq_Kv", "valve",
    "Kv definition at the flow that equals the coefficient numerically: with "
    "Q[m3/h] = Kv, the differential is rho/1000 bar. One multiplication, no solver.",
    {**fl("water_20C_2bar"), "valve": {"model": "kv", "Kv_m3_h_bar05": KV_HC},
     "Q_m3_s": KV_HC / 3600.0},
    {"dp_valve_Pa": dp_hc, "h_valve_m": dp_hc / (rho20 * G)},
    tolmap(["dp_valve_Pa", "h_valve_m"], "exact"),
    ["valve_kv"],
    hand_check="dp = (rho/1000)*(Q/Kv)^2 bar with Q[m3/h] = Kv = 40 -> (Q/Kv) = 1 -> "
               "dp = rho/1000 bar = %.12f/1000 bar = %.12f bar = %.9f Pa ; "
               "h = dp/(rho g) = %.9f/(%.12f*9.80665) = %.15f m"
               % (rho20, rho20 / 1000.0, dp_hc, dp_hc, rho20, dp_hc / (rho20 * G)))

# --------------------------------------------------------------------------------------
# 19. Group 10 - the fan branch
# --------------------------------------------------------------------------------------

op_case("fan_F1_FQ1_air20", "fan",
        "Fan against a parabolic duct resistance, air at 20 C and 101325 Pa.",
        "fan", "F1", "FQ1", "air_20C_1atm", qhi=2.0)
op_case("fan_F1_DS1_air20", "fan",
        "Fan against a 60 m round duct with Colebrook friction, air at 20 C.",
        "fan", "F1", "DS1", "air_20C_1atm", qhi=2.0)
op_case("fan_F2_FQ2_air20", "fan",
        "Fan curve with a positive linear term against a duct with a static component.",
        "fan", "F2", "FQ2", "air_20C_1atm", qhi=2.0)
op_case("fan_F1_FQ1_speed0.8", "fan",
        "Fan law on speed: q_V ~ n, p_f ~ n^2 at constant density (ISO 5801).",
        "fan", "F1", "FQ1", "air_20C_1atm", speed=0.8, qhi=2.0)
RHO_RATIO_60_20 = A60["rho_kg_m3"] / A20["rho_kg_m3"]
op_case("fan_F1_FQ1_air60_density", "fan",
        "Fan law on density with a duct coefficient declared as a constant in Pa s2/m6: "
        "the fan pressure scales by rho60/rho20 while the declared duct loss does not, so "
        "the operating volume flow moves. The size of that move is what is graded.",
        "fan", "F1", "FQ1", "air_60C_1atm", rho_ratio=RHO_RATIO_60_20, qhi=2.0)
op_case("fan_F1_FQ3_air60_invariance", "fan",
        "The same fan and the same duct, with the duct coefficient declared as the loss at "
        "the 20 C reference density so that it scales with the handled density. Both sides "
        "then carry the same density factor and the operating volume flow is unchanged "
        "from fan_F1_FQ1_air20 - the fan-law invariance of volume flow under a density "
        "change (ISO 5801; AMCA Publication 201-02).",
        "fan", "F1", "FQ3", "air_60C_1atm", rho_ratio=RHO_RATIO_60_20, qhi=2.0)
op_case("fan_F1_DS1_air60", "fan",
        "The same fan and duct on 60 C air: here the friction factor also moves with the "
        "viscosity, so the flow does shift.",
        "fan", "F1", "DS1", "air_60C_1atm", rho_ratio=RHO_RATIO_60_20, qhi=2.0)
op_case("fan_F2_FQ2_speed1.15", "fan",
        "Fan law on speed above the reference speed.",
        "fan", "F2", "FQ2", "air_20C_1atm", speed=1.15, qhi=2.5)

# --------------------------------------------------------------------------------------
# 20. Group 11 - NPSH available, NPSH margin, cavitation flag
# --------------------------------------------------------------------------------------

NPSH_CASES = [
    ("npsh_P1_PS1_w20_1.2bar_r3", "water_20C_2bar", 1.2e5, 0.125, 0.0, 3.0),
    ("npsh_P1_PS1_w20_1.0bar_r6", "water_20C_2bar", 1.0e5, 0.125, 0.0, 6.0),
    ("npsh_P1_PS1_w20_1.2bar_z4", "water_20C_2bar", 1.2e5, 0.125, 4.0, 3.0),
    ("npsh_P1_PS1_w60_1.2bar_r3", "water_60C_3bar", 1.2e5, 0.125, 0.0, 3.0),
    ("npsh_P1_PS1_w90_1.2bar_r3", "water_90C_4bar", 1.2e5, 0.125, 0.0, 3.0),
    # 90 C water with the suction below atmospheric: NPSH available falls below the
    # declared NPSH required, the margin goes negative and the cavitation flag must set.
    ("npsh_P1_PS1_w90_0.9bar_r3", "water_90C_4bar", 0.9e5, 0.125, 0.0, 3.0),
]
for cid, fkey, ps, Ds, z, r in NPSH_CASES:
    op_case(cid, "npsh",
            "NPSH available at the suction reference plane and the margin against a "
            "declared NPSH required of %g m (ANSI/HI 9.6.1). NPSHr is taken as a constant "
            "here; a curve NPSHr(Q) is not derivable from the documentation available." % r,
            "pump", "P1", "PS1", fkey,
            npsh_args={"p_suction_Pa": ps, "D_suction_m": Ds, "z_m": z, "NPSHr_m": r})

# --------------------------------------------------------------------------------------
# 21. Group 12 - fluid properties
# --------------------------------------------------------------------------------------

for cid, fkey in (("props_water_20C_2bar", "water_20C_2bar"),
                  ("props_water_60C_3bar", "water_60C_3bar"),
                  ("props_water_90C_4bar", "water_90C_4bar")):
    p = FLUIDS[fkey]["props"]
    add(cid, "fluid_properties",
        "Liquid-water density and viscosity from IAPWS R7-97 and R12-08, and the "
        "saturation pressure from the Region 4 equation, at the stated temperature and "
        "pressure.",
        {"fluid_name": "water", "T_K": FLUIDS[fkey]["T_K"], "p_Pa": FLUIDS[fkey]["p_Pa"]},
        {"rho_kg_m3": p["rho_kg_m3"], "mu_Pa_s": p["mu_Pa_s"],
         "nu_m2_s": p["nu_m2_s"], "p_vap_Pa": p["p_vap_Pa"]},
        tolmap(["rho_kg_m3", "mu_Pa_s", "nu_m2_s", "p_vap_Pa"], "properties"),
        ["water_properties"],
        crosscheck={"library": "CoolProp 8.0.0, HEOS::Water"})

rho_air_hc = 101325.0 / (R_AIR * 293.15)
add("props_air_20C_1atm", "fluid_properties",
    "Dry air as an ideal gas with the ISO 2533 specific gas constant, and the Sutherland "
    "viscosity law with the ISO 2533 constants.",
    {"fluid_name": "air", "T_K": 293.15, "p_Pa": 101325.0},
    {"rho_kg_m3": rho_air_hc, "mu_Pa_s": A20["mu_Pa_s"], "nu_m2_s": A20["nu_m2_s"]},
    tolmap(["rho_kg_m3", "mu_Pa_s", "nu_m2_s"], "exact"),
    ["air_properties"],
    hand_check="rho = p/(R T) = 101325/(287.05287*293.15) = 101325/%.9f = %.15f kg/m3 ; "
               "mu = 1.458e-6*293.15^1.5/(293.15+110.4) = %.6e/%.4f = %.15e Pa s"
               % (R_AIR * 293.15, rho_air_hc,
                  SUTH_BETA * 293.15 ** 1.5, 293.15 + SUTH_S, A20["mu_Pa_s"]))
add("props_air_60C_1atm", "fluid_properties",
    "The same two relations at 60 C, which is the density the fan-law density case uses.",
    {"fluid_name": "air", "T_K": 333.15, "p_Pa": 101325.0},
    {"rho_kg_m3": A60["rho_kg_m3"], "mu_Pa_s": A60["mu_Pa_s"], "nu_m2_s": A60["nu_m2_s"]},
    tolmap(["rho_kg_m3", "mu_Pa_s", "nu_m2_s"], "exact"),
    ["air_properties"])

# --------------------------------------------------------------------------------------
# 22. Group 13 - power and efficiency
# --------------------------------------------------------------------------------------

op_case("power_P1_SQ1_eta0.72", "power",
        "Hydraulic power rho g Q H and shaft power P_h/eta at the operating point "
        "(ISO 9906, ISO 17769-1).",
        "pump", "P1", "SQ1", "water_20C_2bar", eta=0.72)
op_case("power_fan_F1_FQ1_eta0.65", "power",
        "Fan air power q_V p_f and shaft power (ISO 5801).",
        "fan", "F1", "FQ1", "air_20C_1atm", eta=0.65, qhi=2.0)
op_case("power_P1_PS1_eta0.70", "power",
        "The same with a pipe system, so the head carries a Colebrook friction factor.",
        "pump", "P1", "PS1", "water_20C_2bar", eta=0.70)

P_REF = 1.0e4
# 0.8 is not representable in binary, so a double evaluation of 0.8**3 * 1e4 returns
# 5120.000000000001. The relation is rational, so the reference is formed in exact
# rational arithmetic and the stored value is 5120 exactly.
P_AFF_S08 = float(Fraction(4, 5) ** 3 * Fraction(int(P_REF)))
add("power_affinity_speed_s0.8", "power",
    "Affinity law on shaft power: P ~ n^3 at constant density and unchanged efficiency "
    "(Karassik Ch. 2; ISO 9906). One multiplication, no solver.",
    {"machine": machine_inputs("pump", "P1", speed=0.8), "P_shaft_reference_W": P_REF},
    {"P_shaft_W": P_AFF_S08}, tolmap(["P_shaft_W"], "exact"),
    ["affinity_power"],
    hand_check="P/P_ref = s^3 = (4/5)^3 = 64/125 = 0.512 exactly -> "
               "P = 512/1000 * 10000 = 5120 W exactly. Formed as a rational here; a "
               "double evaluation of 0.8**3*1e4 returns 5120.000000000001, which the "
               "1e-12 band admits at 2.2e-16 relative.")

# --------------------------------------------------------------------------------------
# 23. Group 14 - guards. The tool must refuse, not extrapolate.
# --------------------------------------------------------------------------------------

op_case("guard_static_above_shutoff", "guards",
        "Static head 30 m against a pump whose shut-off head is 25 m. There is no "
        "positive-flow intersection; the pump deadheads and the tool must say so.",
        "pump", "P1", "SQ5", "water_20C_2bar")
op_case("guard_speed_zero", "guards",
        "Speed ratio zero. The characteristic collapses to zero head everywhere and no "
        "operating point exists against a system with 8 m of static head.",
        "pump", "P1", "SQ1", "water_20C_2bar", speed=0.0)
op_case("guard_trim_zero", "guards",
        "Impeller ratio zero, the same refusal by a different input.",
        "pump", "P1", "SQ1", "water_20C_2bar", dia=0.0)

# --------------------------------------------------------------------------------------
# 24. Hand check on the laminar case, attached to the case built in group 1.
# --------------------------------------------------------------------------------------

for c in CASES:
    if c["id"] == "lam_water20_D50_Q0.05":
        e, i = c["expect"], c["inputs"]
        c["hand_check"] = (
            "A = pi D^2/4 = pi*0.05^2/4 = %.15e m2 ; v = Q/A = 5.0e-5/%.15e = %.15f m/s ; "
            "Re = v D/nu = %.15f*0.05/%.15e = %.9f ; f = 64/Re = %.15f ; "
            "h_f = (f L/D + K) v^2/(2g) = (%.15f*20/0.05 + 0)*%.15f^2/(2*9.80665) = %.15e m"
            % (math.pi * 0.05 ** 2 / 4.0, math.pi * 0.05 ** 2 / 4.0, e["v_m_s"],
               e["v_m_s"], i["nu_m2_s"], e["Re"], e["f_darcy"], e["f_darcy"],
               e["v_m_s"], e["h_f_m"]))

# --------------------------------------------------------------------------------------
# 25. Relations block - one entry per relation name a case cites.
# --------------------------------------------------------------------------------------

RELATIONS = {
    "f_laminar": {
        "formula": "f = 64/Re_D",
        "citation": "white_fm7",
        "where": "White, Fluid Mechanics, 7th ed., Ch. 6, Eq. 6.12",
    },
    "darcy_weisbach": {
        "formula": "h_f = f (L/D) v^2/(2 g);  dp_f = f (L/D) rho v^2/2",
        "citation": "white_fm7",
        "where": "White, Fluid Mechanics, 7th ed., Ch. 6, Eq. 6.10; Crane TP-410 Ch. 1",
    },
    "resistance_coefficient": {
        "formula": "h_L = K v^2/(2 g), K summed over the fittings of a segment",
        "citation": "crane410",
        "where": "Crane TP-410, Ch. 2 (resistance coefficient K)",
    },
    "colebrook_white": {
        "formula": "1/sqrt(f) = -2 log10( eps/(3.7 D) + 2.51/(Re sqrt(f)) )",
        "citation": "colebrook1939",
        "where": "Colebrook 1939, JICE 11(4) 133-156; White 7th ed. Eq. 6.48; "
                 "chart form in Moody 1944",
    },
    "fully_rough_limit": {
        "formula": "1/sqrt(f) = -2 log10( eps/(3.7 D) )",
        "citation": "nikuradse_vk",
        "where": "von Karman-Prandtl fully-rough law; White 7th ed. Ch. 6, Eq. 6.38",
    },
    "smooth_wall_limit": {
        "formula": "1/sqrt(f) = 2 log10( Re sqrt(f) ) - 0.8",
        "citation": "nikuradse_vk",
        "where": "Prandtl smooth-wall law; White 7th ed. Ch. 6, Eq. 6.64",
    },
    "machine_characteristic": {
        "formula": "pump H(Q) = H0 + a1 Q + a2 Q^2 ;  fan dp(Q) = dp0 + b1 Q + b2 Q^2",
        "citation": "karassik",
        "where": "Karassik, Pump Handbook, 4th ed., Ch. 2 (head-capacity curve); "
                 "ISO 5801 for the fan characteristic",
    },
    "system_curve_parabola": {
        "formula": "H_sys(Q) = H_static + C Q^2 ;  dp_sys(Q) = dp_static + C_p Q^2",
        "citation": "karassik",
        "where": "Karassik, Pump Handbook, 4th ed., Ch. 8 (system head curve); "
                 "AMCA Publication 201-02 for the duct resistance parabola",
    },
    "intersection": {
        "formula": "solve H_machine(Q) - H_system(Q) = 0 for Q > 0",
        "citation": "brent1973",
        "where": "Karassik Ch. 8 for the operating point as the intersection; the root is "
                 "found by brent_root() in this file (Brent 1973 Ch. 4) and crosschecked "
                 "by bisection and, where one exists, by the closed form",
    },
    "affinity_speed": {
        "formula": "Q2/Q1 = n2/n1 ; H2/H1 = (n2/n1)^2 ; P2/P1 = (n2/n1)^3",
        "citation": "karassik",
        "where": "Karassik, Pump Handbook, 4th ed., Ch. 2 (affinity laws); ISO 9906 for "
                 "the translation of a measured curve to another speed; ISO 5801 and "
                 "AMCA 201 for the fan form, where dp and P additionally scale with rho",
    },
    "affinity_trim": {
        "formula": "Q2/Q1 = D2/D1 ; H2/H1 = (D2/D1)^2 ; P2/P1 = (D2/D1)^3",
        "citation": "karassik",
        "where": "Karassik, Pump Handbook, 4th ed., Ch. 2 - impeller cut inside an "
                 "unchanged casing",
    },
    "affinity_similarity": {
        "formula": "Q ~ n D^3 ; H ~ n^2 D^2 ; P ~ rho n^3 D^5",
        "citation": "white_fm7",
        "where": "White, Fluid Mechanics, 7th ed., Ch. 11 - similarity rules for a "
                 "geometrically similar machine",
    },
    "affinity_power": {
        "formula": "P2/P1 = (n2/n1)^3 at constant density and efficiency",
        "citation": "karassik",
        "where": "Karassik, Pump Handbook, 4th ed., Ch. 2; ISO 9906",
    },
    "series": {
        "formula": "H_total(Q) = sum_i H_i(Q)",
        "citation": "white_fm7",
        "where": "White, Fluid Mechanics, 7th ed., Ch. 11 - pumps in series",
    },
    "parallel": {
        "formula": "Q_total(H) = sum_i Q_i(H)",
        "citation": "white_fm7",
        "where": "White, Fluid Mechanics, 7th ed., Ch. 11 - pumps in parallel",
    },
    "valve_zeta": {
        "formula": "h_valve = zeta v^2/(2 g)",
        "citation": "crane410",
        "where": "Crane TP-410, Ch. 2",
    },
    "valve_kv": {
        "formula": "dp_valve[bar] = (rho/1000) (Q[m3/h]/Kv)^2",
        "citation": "iec60534_2_1",
        "where": "IEC 60534-2-1:2011, incompressible turbulent sizing equation in its Kv "
                 "form (Kv in m3/h at 1 bar on water of 1000 kg/m3)",
    },
    "npsh": {
        "formula": "NPSHa = (p_abs - p_vap)/(rho g) + v^2/(2 g) - z ; "
                   "margin = NPSHa - NPSHr",
        "citation": "iso17769",
        "where": "ISO 17769-1:2012 for the definition of NPSH; ANSI/HI 9.6.1-2017 for the "
                 "margin and the cavitation judgement",
    },
    "power": {
        "formula": "pump P_h = rho g Q H ; fan P_u = Q dp_f ; P_shaft = P_h/eta",
        "citation": "iso9906",
        "where": "ISO 9906:2012 (pump hydraulic power and overall efficiency); "
                 "ISO 5801:2017 (fan air power); ISO 17769-1 for the symbols",
    },
    "water_properties": {
        "formula": "rho(T,p), mu(T,p), p_sat(T)",
        "citation": "iapws_if97",
        "where": "IAPWS R7-97(2012) Region 1 and Region 4 Eq. 30; IAPWS R12-08 for mu; "
                 "evaluated through CoolProp 8.0.0",
    },
    "air_properties": {
        "formula": "rho = p/(R T) with R = 287.05287 J/(kg K) ; "
                   "mu = 1.458e-6 T^1.5/(T + 110.4)",
        "citation": "iso2533",
        "where": "ISO 2533:1975",
    },
}


# --------------------------------------------------------------------------------------
# 26. Emit
# --------------------------------------------------------------------------------------

# ---- relations the page declares, added for the page-surface cases (decision 2/3) ----
RELATIONS.update({
    "page_demo_pump_curve": {
        "statement": "H(Q) = r^2 * max(0, h0 - a (Q/(r n))^2) with a = (h0 - hAtRated)/qRated^2, "
                     "r = speed/100 and n units in parallel. Equivalent to H = r^2 h0 - a Q^2/n^2.",
        "source": "operatingpoint.html pumpHead(): the page's own demo characteristic. "
                  "It is the quadratic head-capacity curve of Karassik Ch. 2 with the "
                  "speed affinity law applied to head as r^2 and the parallel "
                  "composition applied to flow as n, both as Karassik Ch. 2 gives them; "
                  "the coefficients h0, hAtRated and qRated are the page's own and carry "
                  "no control.",
        "page_declared": True,
    },
    "page_system_curve": {
        "statement": "H_sys(Q) = (z2 - z1) + (p2 - p1)/(rho g) + f (0.34 L)/D v^2/(2g) "
                     "+ f (0.66 L)/D v^2/(2g) + K(svalve) v^2/(2g) + K(dvalve) v^2/(2g), "
                     "v = Q/(pi D^2/4).",
        "source": "operatingpoint.html sysAt(): Darcy-Weisbach (White 7th ed. Eq. 6.10) "
                  "with a Colebrook friction factor and two resistance coefficients "
                  "(Crane TP-410 Ch. 2), over a single pipe the page splits 34/66 "
                  "between suction and discharge at one diameter and one roughness. The "
                  "34/66 split is the page's own.",
        "page_declared": True,
    },
    "page_water_properties": {
        "statement": "rho = 1000 (1 - ((T+288.9414)/(508929.2 (T+68.12963))) (T-3.9863)^2); "
                     "mu = 2.414e-5 * 10^(247.8/(T+133.15)); "
                     "p_vap = 10^(8.07131 - 1730.63/(233.426+T)) * 133.322368. T in degC.",
        "source": "operatingpoint.html waterProps(T). A Tanaka-form density polynomial, a "
                  "Vogel-form viscosity and the Antoine equation in mmHg. The page "
                  "declares these and this corpus grades them; their deviation from "
                  "IAPWS R7-97 and R12-08 is in page_declared.water_properties and on "
                  "every case that uses them.",
        "page_declared": True,
    },
    "page_air_density": {
        "statement": "rho = p/(287.05 (T + 273.15)), T in degC.",
        "source": "operatingpoint.html airDensity(). The ideal-gas relation with the "
                  "page's own five-decimal gas constant; the ISO 2533 value is "
                  "287.05287 and the deviation is recorded in page_declared.",
        "page_declared": True,
    },
    "page_valve_law": {
        "statement": "K(x) = 0.25/max(0.06, x/100)^4 + 0.2 for an opening x in percent, "
                     "entering the system curve as K v^2/(2g).",
        "source": "operatingpoint.html valveK(). The K method is Crane TP-410 Ch. 2; the "
                  "opening-to-K relation is the page's own illustrative curve and no "
                  "standard this corpus cites gives it.",
        "page_declared": True,
    },
    "page_efficiency_curve": {
        "statement": "eta(Q) = clamp(0.18, etaMax, etaMax (1 - 0.46 x^2)) with "
                     "x = (Q/(r n) - bepQ)/(0.82 bepQ).",
        "source": "operatingpoint.html pumpEta(). The page's own illustrative efficiency "
                  "parabola about its best-efficiency flow; bepQ and etaMax carry no "
                  "control.",
        "page_declared": True,
    },
    "page_power_chain": {
        "statement": "P_h = rho g Q H; P_shaft = P_h/eta; P_electrical = "
                     "P_shaft/(motorEff driveEff).",
        "source": "operatingpoint.html solve(). Hydraulic power and overall efficiency "
                  "are ISO 9906; the motor and drive efficiencies are the page's own and "
                  "carry no control. The pump branch publishes the electrical figure only.",
        "page_declared": True,
    },
    "page_npshr_curve": {
        "statement": "NPSHr(Q) = r^2 (npsh0 + npshK (Q/(r n))^2).",
        "source": "operatingpoint.html npshr(). An illustrative NPSHr parabola scaled by "
                  "the speed affinity law; npsh0 and npshK carry no control.",
        "page_declared": True,
    },
    "page_root_scan": {
        "statement": "The page scans 600 intervals of 0 < Q <= 0.035 r n for a sign "
                     "change of H_machine - H_system and closes each with 75 bisections, "
                     "stopping at |residual| < 1e-11 m or |b - a| < 1e-10 m3/s; it "
                     "publishes the first root, or its noroot refusal when there is none.",
        "source": "operatingpoint.html solve(). This corpus brackets the same residual on "
                  "40 intervals and closes it with Brent's method, written out in the "
                  "generator: the equations are shared and the method is not, which is "
                  "what AGENTS §5.2 requires of a reference.",
        "page_declared": True,
    },
})


# ======================================================================================
# 12. The page's own declared constants and correlations - decision 2 of the 2026-10
#     benchmark-evidence round.
#
# Where operatingpoint.html DECLARES a constant or a correlation, this corpus grades
# against the page's own declaration and records the deviation from the standard it
# would otherwise have used.  The alternative - grading a declared constant against a
# different standard at a band tighter than the difference between them - measures a
# modelling choice and reports it as an error.  AGENTS.md §5.2 ("every criterion comes
# from the tool's own code or from a standard the tool already cites") and
# bench-src/HARNESS.md ("never claim a tool is wrong when the two references disagree
# by more than the tolerance - flag it instead") both require the flag.
#
# Every entry names the line of operatingpoint.html it was read from.  Nothing here is
# a tolerance widening: the band on a page-declared quantity is 1e-12, tighter than the
# band this corpus used before, because both sides now evaluate the same closed form.
# ======================================================================================

PAGE_R_AIR = 287.05          # operatingpoint.html airDensity()
PAGE_G = 9.80665             # operatingpoint.html const G


def page_water_props(Tc):
    """operatingpoint.html waterProps(T): Tanaka-form density, Vogel-form viscosity,
    Antoine saturation pressure in mmHg converted at 133.322368 Pa/mmHg."""
    rho = 1000.0 * (1.0 - ((Tc + 288.9414) / (508929.2 * (Tc + 68.12963)))
                    * (Tc - 3.9863) ** 2)
    mu = 2.414e-5 * 10.0 ** (247.8 / (Tc + 133.15))
    pv = (10.0 ** (8.07131 - 1730.63 / (233.426 + Tc))) * 133.322368
    return rho, mu, pv


def page_air_density(p_Pa, Tc):
    """operatingpoint.html airDensity(): p/(287.05 T), the page's own gas constant."""
    return p_Pa / (PAGE_R_AIR * (Tc + 273.15))


def page_valve_k(open_pct):
    """operatingpoint.html valveK(open): K = 0.25/x^4 + 0.2, x = max(0.06, open/100).

    This law is the page's own.  No standard this corpus cites gives it, so there is
    no deviation to record: it is flagged as page-declared with no standard equivalent.
    """
    x = max(0.06, open_pct / 100.0)
    return 0.25 / x ** 4 + 0.2


def _std_water(Tc, p_Pa):
    T = Tc + 273.15
    return (PropsSI("D", "T", T, "P", p_Pa, "Water"),
            PropsSI("V", "T", T, "P", p_Pa, "Water"),
            PropsSI("P", "T", T, "Q", 0, "Water"))


def _rel(a, b):
    return abs(a - b) / abs(b) if b else (0.0 if a == b else float("inf"))


def page_declared_block():
    """The page-declared constants and correlations, each with its deviation from the
    standard this corpus would otherwise have graded against."""
    air = {
        "page_value": PAGE_R_AIR,
        "page_source": "operatingpoint.html airDensity(): "
                       "(F.pressureKPa*1000)/(287.05*(F.temp+273.15))",
        "standard_value": R_AIR,
        "standard": "ISO 2533:1975 specific gas constant of dry air, 287.05287 J/(kg K)",
        "relative_deviation_of_density": R_AIR / PAGE_R_AIR - 1.0,
        "note": "The page rounds the ISO 2533 gas constant to five decimal digits. Air "
                "density therefore differs from the ISO 2533 value by exactly "
                "287.05287/287.05 - 1 at every temperature and pressure. This corpus "
                "grades the page's own declaration and records the figure here.",
    }
    water = []
    for Tc, p in ((5, 101325), (20, 101325), (20, 200000), (40, 101325),
                  (60, 300000), (80, 101325), (90, 400000), (95, 101325)):
        rp, mp, vp = page_water_props(Tc)
        rs, ms, vs = _std_water(Tc, p)
        water.append({
            "T_C": Tc, "p_Pa": p,
            "rho_page_kg_m3": rp, "rho_iapws_kg_m3": rs, "rho_relative_deviation": _rel(rp, rs),
            "mu_page_Pa_s": mp, "mu_iapws_Pa_s": ms, "mu_relative_deviation": _rel(mp, ms),
            "p_vap_page_Pa": vp, "p_vap_iapws_Pa": vs, "p_vap_relative_deviation": _rel(vp, vs),
        })
    return {
        "policy": "Where the page declares a constant or a correlation, this corpus uses "
                  "the page's own and records the deviation from the standard it would "
                  "otherwise have used. Where a quantity has no page declaration, the "
                  "standard is used and the case says which.",
        "g_m_s2": {
            "page_value": PAGE_G, "page_source": "operatingpoint.html: const G=9.80665",
            "standard_value": G,
            "standard": "ISO 80000-3 / CGPM 1901 standard acceleration of free fall",
            "relative_deviation": 0.0,
            "note": "Identical. Recorded so the list of declared constants is complete.",
        },
        "R_air_J_kg_K": air,
        "water_properties": {
            "page_source": "operatingpoint.html waterProps(T), lines 387-389",
            "page_correlations": {
                "rho_kg_m3": "1000*(1 - ((T+288.9414)/(508929.2*(T+68.12963)))*(T-3.9863)^2), "
                             "T in degC - Tanaka-form density polynomial",
                "mu_Pa_s": "2.414e-5 * 10^(247.8/(T+133.15)), T in degC - Vogel-form viscosity",
                "p_vap_Pa": "10^(8.07131 - 1730.63/(233.426+T)) * 133.322368, T in degC - "
                            "Antoine equation in mmHg",
            },
            "standard": "IAPWS R7-97 (density, saturation pressure) and R12-08 (viscosity), "
                        "through CoolProp 8.0.0",
            "deviation_envelope": {
                "rho_relative": [min(w["rho_relative_deviation"] for w in water),
                                 max(w["rho_relative_deviation"] for w in water)],
                "mu_relative": [min(w["mu_relative_deviation"] for w in water),
                                max(w["mu_relative_deviation"] for w in water)],
                "p_vap_relative": [min(w["p_vap_relative_deviation"] for w in water),
                                   max(w["p_vap_relative_deviation"] for w in water)],
            },
            "per_state": water,
            "note": "The page declares three correlations and implements them exactly. "
                    "They are fits, not the IAPWS formulation, so they differ from it by "
                    "the envelope above over the page's own 5-95 degC temperature control "
                    "range. Grading them against IAPWS at 1e-12 - which is what this "
                    "corpus did before this round - reports a declared modelling choice "
                    "as fifteen failures. The deviation is the finding; the page is not "
                    "wrong about what it says it computes.",
        },
        "valve_K": {
            "page_source": "operatingpoint.html valveK(open): "
                           "K = 0.25/max(0.06, open/100)^4 + 0.2",
            "standard": None,
            "flag": "No standard cited by this corpus gives this law. Crane TP-410 Ch. 2 "
                    "gives the K method itself, h_L = K v^2/(2g), which the page follows, "
                    "but the opening-to-K relation is the page's own illustrative curve. "
                    "Graded against the page's own declaration; no deviation figure exists "
                    "to record, and the absence of a standard is itself the flag.",
        },
        "friction_branch": {
            "page_source": "operatingpoint.html frictionFactor(Re,rr): f = 64/Re below "
                           "Re 2300, otherwise a fixed point on the Colebrook form with a "
                           "1e-12 absolute test and 30 iterations",
            "standard": "Colebrook 1939 in the form this corpus uses, 1/sqrt(f) = "
                        "-2 log10(eps/(3.7 D) + 2.51/(Re sqrt f)); White 7th ed. Eq. 6.12 "
                        "for f = 64/Re",
            "relative_deviation": 0.0,
            "note": "The page's two branches are the standard forms and the switch at "
                    "Re = 2300 is within the 2000-4000 band for which no single accepted "
                    "law exists. The reference here solves the same equation by bisection "
                    "instead of by the page's fixed point, which is the independence "
                    "AGENTS §5.2 asks for: shared equations, unshared method.",
        },
    }


# ======================================================================================
# 13. The page's control surface, and the gradeable set rebuilt onto it - decision 3.
#
# Read from operatingpoint.html systemPanel(), which is the only panel that carries the
# pump branch's solver inputs. Every entry is a control a visitor can operate, with the
# range and step the page declares for it. The gradeable set below is generated from
# these controls only, so the coverage figure counts states a reader of the page can
# actually produce.
# ======================================================================================

PAGE_CONTROLS = {
    "speed": {"state_key": "S.speed", "control_id": "f-speed", "type": "range",
              "min": 50, "max": 120, "step": 1, "unit": "%"},
    "pumps": {"state_key": "S.pumps", "control_id": "f-pumps", "type": "select",
              "options": [1, 2, 3], "unit": "units in parallel"},
    "dvalve": {"state_key": "S.dvalve", "control_id": "f-dvalve", "type": "range",
               "min": 10, "max": 100, "step": 1, "unit": "%"},
    "svalve": {"state_key": "S.svalve", "control_id": "f-svalve", "type": "range",
               "min": 10, "max": 100, "step": 1, "unit": "%"},
    "z2": {"state_key": "S.z2", "control_id": "f-z2", "type": "range",
           "min": 0, "max": 32, "step": 0.5, "unit": "m"},
    "diam": {"state_key": "S.diam", "control_id": "f-diam", "type": "range",
             "min": 50, "max": 180, "step": 2, "unit": "mm"},
    "temp": {"state_key": "S.temp", "control_id": "f-temp", "type": "range",
             "min": 5, "max": 95, "step": 1, "unit": "degC"},
    "length": {"state_key": "S.length", "control_id": "f-length", "type": "range",
               "min": 10, "max": 260, "step": 5, "unit": "m"},
    "rough": {"state_key": "S.rough", "control_id": "f-rough", "type": "range",
              "min": 0.005, "max": 0.5, "step": 0.005, "unit": "mm"},
}

# The page's own defaults for every other state key. These carry no control, so a
# visitor always has them at these values; a case that changed one would not be a state
# the page can be put into through its interface.
PAGE_FIXED = {
    "z1": 2, "p1": 101325, "p2": 101325, "pumpZ": 1.2,
    "qRated": 0.014, "h0": 43, "hAtRated": 29, "bepQ": 0.0185, "etaMax": 0.82,
    "motorEff": 0.92, "driveEff": 0.97, "npsh0": 2.3, "npshK": 12500,
}
PAGE_DEFAULTS = dict(speed=100, pumps=1, dvalve=78, svalve=100, z2=15, diam=100,
                     temp=20, length=90, rough=0.045, **PAGE_FIXED)


def _colebrook_bisect(Re, rr):
    """1/sqrt(f) = -2 log10(rr/3.7 + 2.51/(Re sqrt f)), bisected to machine precision.

    The page reaches the same root by a 30-iteration fixed point with a 1e-12 absolute
    test. Bisecting the residual is a different route to the same equation.
    """
    def g(f):
        return 1.0 / math.sqrt(f) + 2.0 * math.log10(rr / 3.7 + 2.51 / (Re * math.sqrt(f)))
    a, b = 1e-5, 0.5
    ga = g(a)
    if ga * g(b) > 0:
        return float("nan")
    for _ in range(200):
        m = 0.5 * (a + b)
        gm = g(m)
        if gm == 0.0 or (b - a) < 4e-17 * m:
            return m
        if ga * gm <= 0:
            b = m
        else:
            a, ga = m, gm
    return 0.5 * (a + b)


def _page_friction(Re, rr):
    if not (Re > 0):
        return 0.0
    if Re < 2300:
        return 64.0 / Re
    return _colebrook_bisect(Re, rr)


def _brentq(f, a, b, tol=1e-15, maxiter=200):
    """Brent's method, written out so the root is neither SciPy's nor the page's."""
    fa, fb = f(a), f(b)
    if fa * fb > 0:
        raise ValueError("root not bracketed")
    if abs(fa) < abs(fb):
        a, b, fa, fb = b, a, fb, fa
    c, fc, d = a, fa, b
    mflag = True
    for _ in range(maxiter):
        if fb == 0.0 or abs(b - a) < tol * max(1.0, abs(b)):
            return b
        if fa != fc and fb != fc:
            s = (a * fb * fc / ((fa - fb) * (fa - fc))
                 + b * fa * fc / ((fb - fa) * (fb - fc))
                 + c * fa * fb / ((fc - fa) * (fc - fb)))
        else:
            s = b - fb * (b - a) / (fb - fa)
        if (not (min(a, b) < s < max(a, b))
                or (mflag and abs(s - b) >= abs(b - c) / 2)
                or (not mflag and abs(s - b) >= abs(c - d) / 2)
                or (mflag and abs(b - c) < tol)
                or (not mflag and abs(c - d) < tol)):
            s = 0.5 * (a + b)
            mflag = True
        else:
            mflag = False
        fs = f(s)
        d, c, fc = c, b, fb
        if fa * fs < 0:
            b, fb = s, fs
        else:
            a, fa = s, fs
        if abs(fa) < abs(fb):
            a, b, fa, fb = b, a, fb, fa
    return b


def _page_pump_head(S, Q):
    r, n = S["speed"] / 100.0, S["pumps"]
    qb = Q / (r * n)
    a = (S["h0"] - S["hAtRated"]) / S["qRated"] ** 2
    return r * r * max(0.0, S["h0"] - a * qb * qb)


def _page_eta(S, Q):
    r, n = S["speed"] / 100.0, S["pumps"]
    qb = Q / (r * n)
    x = (qb - S["bepQ"]) / (S["bepQ"] * 0.82)
    return max(0.18, min(S["etaMax"], S["etaMax"] * (1 - 0.46 * x * x)))


def _page_npshr(S, Q):
    r, n = S["speed"] / 100.0, S["pumps"]
    qb = Q / (r * n)
    return r * r * (S["npsh0"] + S["npshK"] * qb * qb)


def _page_system(S, Q):
    rho, mu, pv = page_water_props(S["temp"])
    D = S["diam"] / 1000.0
    A = math.pi * D * D / 4.0
    v = Q / A
    Re = rho * v * D / mu
    rr = (S["rough"] / 1000.0) / D
    f = _page_friction(Re, rr)
    Ls, Ld = S["length"] * 0.34, S["length"] * 0.66
    dyn = v * v / (2 * PAGE_G)
    hs, hd = f * Ls / D * dyn, f * Ld / D * dyn
    hsv, hdv = page_valve_k(S["svalve"]) * dyn, page_valve_k(S["dvalve"]) * dyn
    static = (S["z2"] - S["z1"]) + (S["p2"] - S["p1"]) / (rho * PAGE_G)
    return dict(H=static + hs + hd + hsv + hdv, static=static, hs=hs, hd=hd, hsv=hsv,
                hdv=hdv, f=f, Re=Re, v=v, rho=rho, mu=mu, pv=pv, rr=rr, dyn=dyn)


def page_solve(S):
    """The operating point over the page's input surface.

    Bracketed on a deliberately coarse 40-interval sign scan and then closed by Brent;
    the page scans 600 intervals and bisects 75 times. Returns None where the page's own
    scan would find no sign change, which is its `noroot` refusal.
    """
    qmax = 0.035 * (S["speed"] / 100.0) * S["pumps"]

    def res(q):
        return _page_pump_head(S, q) - _page_system(S, q)["H"]

    lo = hi = None
    qa, fa = 1e-9, None
    fa = res(qa)
    for i in range(1, 41):
        qb = qmax * i / 40.0
        fb = res(qb)
        if math.isfinite(fa) and math.isfinite(fb) and fa * fb < 0:
            lo, hi = qa, qb
            break
        qa, fa = qb, fb
    if lo is None:
        return None
    Q = _brentq(res, lo, hi)
    z = _page_system(S, Q)
    H = _page_pump_head(S, Q)
    eta = _page_eta(S, Q)
    Ph = z["rho"] * PAGE_G * Q * H
    Ps = Ph / eta
    Pe = Ps / (S["motorEff"] * S["driveEff"])
    Na = (S["p1"] / (z["rho"] * PAGE_G) + (S["z1"] - S["pumpZ"])
          - (z["hs"] + z["hsv"]) - z["pv"] / (z["rho"] * PAGE_G))
    Nr = _page_npshr(S, Q)
    out = dict(Q=Q, H=H, eta=eta, Ps=Ps, Pe=Pe, Na=Na, Nr=Nr, margin=Na - Nr,
               residual=abs(res(Q)))
    out.update({k: z[k] for k in ("static", "hs", "hd", "hsv", "hdv", "f", "Re", "v",
                                  "rho", "mu", "pv", "rr", "dyn")})
    return out


# ---- tolerances for the page surface -------------------------------------------------
#
# The page closes its operating point by bisection and stops at |b - a| < 1e-10 m3/s or
# |H_machine - H_system| < 1e-11 m, whichever comes first. The flow step is therefore the
# one criterion the page states about its own convergence, and it is ABSOLUTE in m3/s.
#
# Every other quantity the page publishes is a smooth function of that flow at a fixed
# state, so its band is that step carried through its own derivative:
#
#     band(y) = MARGIN * PAGE_Q_STEP * |dy/dQ|
#
# with the derivative taken by central difference on the reference at the root and
# recorded per case in crosscheck.sensitivity, so a reader can recompute the band. This
# is the §5.2 prescription - "state the criterion against the solver's own step" - and it
# is why a flat relative band is wrong here: the controls span Q from 2.6e-4 to 7.0e-2
# m3/s, so a band flat in relative terms is 270 times tighter at one end than the other,
# and a band flat in metres ignores that NPSHa is a difference of two heads of order 10 m
# whose loss terms scale as Q^2 (AGENTS §5.2: "a tolerance written as an absolute on a
# dimensional quantity will be broken by a case at another scale").
#
# MARGIN is 4: the page's step bounds the half-width of its final bracket, and the
# reference's own bracket contributes the same order again, so two steps are possible in
# principle and 4 leaves a factor of two over that. It is not fitted to anything: at the
# time it was chosen the worst measured flow deviation over all page-surface cases was
# 3.78e-11 m3/s, which is below ONE step.
PAGE_Q_STEP = 1e-10        # m3/s, operatingpoint.html solve(): |b - a| < 1e-10
PAGE_H_STEP = 1e-11        # m,    operatingpoint.html solve(): |residual| < 1e-11
PAGE_TOL_MARGIN = 4.0
PAGE_FP_REL = 1e-13        # binary64 floor: neither side is exact arithmetic

TOL_PAGE = {
    "flow": {
        "rel": 1e-8, "abs": PAGE_Q_STEP,
        "reason": "The page closes its operating point with a bisection that stops at "
                  "|H_machine - H_system| < 1e-11 m or |b - a| < 1e-10 m3/s, whichever "
                  "comes first. The absolute band is that second test, which is the "
                  "solver's own step; the relative band carries it across the two and a "
                  "half decades of flow the controls span (2.6e-4 to 7.0e-2 m3/s), "
                  "because an absolute band alone would be broken at one end or vacuous "
                  "at the other (AGENTS §5.2). The reference closes the same residual "
                  "with Brent from a coarser bracket and records its own residual per "
                  "case.",
    },
    "head": {
        "rel": 1e-8, "abs": 1e-9,
        "reason": "Head follows the flow through the machine parabola, whose slope at "
                  "the root is recorded per case as dH_dQ. The page's residual test is "
                  "1e-11 m of head, and the absolute band is two decades over that.",
    },
    "friction": {
        "rel": 1e-9,
        "reason": "The page solves the Colebrook form by a fixed point stopped at "
                  "|f_next - f| < 1e-12 absolute, which at f near 0.018 is 5.6e-11 "
                  "relative. The reference bisects the same equation to machine "
                  "precision. 1e-9 is the page's own convergence test with a decade and "
                  "a half of margin for the flow difference that feeds the Reynolds "
                  "number, and it still excludes the Swamee-Jain approximation, whose "
                  "deviation is recorded per case as a crosscheck.",
    },
    "algebraic": {
        "rel": 1e-8,
        "reason": "Efficiency, power, the loss breakdown, NPSH required and the Reynolds "
                  "number are closed-form functions of the flow and of page-declared "
                  "constants, so each inherits the flow's band and adds only round-off.",
    },
    "margin": {
        "rel": 1e-8, "abs": 1e-8,
        "reason": "The NPSH margin is a difference of two heads and crosses zero inside "
                  "the control ranges, where a relative band is meaningless. The "
                  "absolute band is in metres and is the flow band carried through the "
                  "suction-side algebra; the relative band governs away from the "
                  "crossing.",
    },
    "property": {
        "rel": 1e-12,
        "reason": "Both sides evaluate the page's own declared correlation (see "
                  "page_declared), so only double-precision round-off separates them. "
                  "The deviation of that correlation from IAPWS R7-97/R12-08 is recorded "
                  "as a crosscheck on every case that uses it, and is a flag, not a "
                  "failure (AGENTS §5.2, HARNESS.md).",
    },
    "refusal": {
        "exact_match": True,
        "reason": "The page either publishes an operating point or publishes none. The "
                  "corpus asserts which, and nothing numeric.",
    },
}


def _swamee_jain(Re, rr):
    return 0.25 / (math.log10(rr / 3.7 + 5.74 / Re ** 0.9)) ** 2


def _page_sensitivity(S, Q):
    """|dy/dQ| at the operating point for every quantity the page publishes.

    Central difference on the reference at fixed state. The machine head is
    differentiated on the machine curve, which is what the page publishes as head_m;
    the loss terms, Reynolds number and friction factor on the system side.
    """
    h = 1e-7 * Q
    def at(q):
        z = _page_system(S, q)
        r_, n_ = S["speed"] / 100.0, S["pumps"]
        qb = q / (r_ * n_)
        x = (qb - S["bepQ"]) / (S["bepQ"] * 0.82)
        eta = max(0.18, min(S["etaMax"], S["etaMax"] * (1 - 0.46 * x * x)))
        H = _page_pump_head(S, q)
        Ph = z["rho"] * PAGE_G * q * H
        Pe = Ph / eta / (S["motorEff"] * S["driveEff"])
        Na = (S["p1"] / (z["rho"] * PAGE_G) + (S["z1"] - S["pumpZ"])
              - (z["hs"] + z["hsv"]) - z["pv"] / (z["rho"] * PAGE_G))
        Nr = _page_npshr(S, q)
        return {
            "Q_op_m3_s": q, "Q_op_m3_h": q * 3600.0, "H_op_m": H,
            "efficiency": eta, "electrical_power_W": Pe,
            "NPSHa_m": Na, "NPSHr_m": Nr, "NPSH_margin_m": Na - Nr,
            "Re": z["Re"], "f_darcy": z["f"],
            "loss_static_m": z["static"], "loss_suction_pipe_m": z["hs"],
            "loss_suction_valve_m": z["hsv"], "loss_discharge_pipe_m": z["hd"],
            "loss_discharge_valve_m": z["hdv"],
        }
    hi, lo = at(Q + h), at(Q - h)
    return {k: abs(hi[k] - lo[k]) / (2 * h) for k in hi}


def _page_band(key, dydq, value):
    """The band for one published quantity: the page's own flow step through this
    quantity's own derivative, expressed both ways so neither scale breaks it."""
    if key == "has_operating_point":
        return dict(TOL_PAGE["refusal"])
    a = PAGE_TOL_MARGIN * PAGE_Q_STEP * dydq
    if a <= 0 or not math.isfinite(a):
        a = PAGE_FP_REL * max(abs(value), 1.0)
    r = a / abs(value) if value else None
    out = {"abs": a,
           "reason": "The page converges its flow to |b - a| < %g m3/s; this quantity's "
                     "derivative with respect to the flow at this operating point is "
                     "%.6g (recorded in crosscheck.sensitivity), so %g x that step "
                     "bounds it. The relative form is the same number divided by the "
                     "value, carried so neither a small nor a large scale breaks the "
                     "band (AGENTS §5.2)."
                     % (PAGE_Q_STEP, dydq, PAGE_TOL_MARGIN)}
    if r is not None:
        out["rel"] = max(r, PAGE_FP_REL)
    return out


def _page_case(cid, group, note, controls, hand_check=False):
    """One page-surface case: a state reachable through the nine controls, with every
    quantity the page publishes for it."""
    S = dict(PAGE_DEFAULTS)
    S.update(controls)
    for k, v in controls.items():
        if k not in PAGE_CONTROLS:
            raise AssertionError("case %s sets %s, which is not a page control" % (cid, k))
        spec = PAGE_CONTROLS[k]
        if spec["type"] == "select":
            assert v in spec["options"], (cid, k, v)
        else:
            assert spec["min"] <= v <= spec["max"], (cid, k, v)
            steps = (v - spec["min"]) / spec["step"]
            assert abs(steps - round(steps)) < 1e-9, (cid, k, v, "off the control step")
    r = page_solve(S)
    inputs = {"page_state": dict(S), "controls_set": dict(controls)}
    rho, mu, pv = page_water_props(S["temp"])
    rs, ms, vs = _std_water(S["temp"], S["p1"])
    props_crosscheck = {
        "note": "The page declares its own water correlations; this corpus grades them "
                "and records their deviation from IAPWS here.",
        "rho_iapws_kg_m3": rs, "rho_relative_deviation": _rel(rho, rs),
        "mu_iapws_Pa_s": ms, "mu_relative_deviation": _rel(mu, ms),
        "p_vap_iapws_Pa": vs, "p_vap_relative_deviation": _rel(pv, vs),
    }
    if r is None:
        add(cid, group, note, inputs,
            {"has_operating_point": False},
            {"has_operating_point": dict(TOL_PAGE["refusal"])},
            ["page_demo_pump_curve", "page_system_curve", "page_root_scan"],
            crosscheck={"properties": props_crosscheck,
                        "shutoff_head_m": (S["speed"] / 100.0) ** 2 * S["h0"],
                        "static_head_m": (S["z2"] - S["z1"])
                                         + (S["p2"] - S["p1"]) / (rho * PAGE_G),
                        "why": "No sign change on 0 < Q <= 0.035 r n: the static head "
                               "exceeds the shut-off head at this speed."},
            hand_check=hand_check)
        return
    # H_machine(Q) = r^2 h0 - a Q^2 / n^2 with a = (h0 - hAtRated)/qRated^2,
    # so the machine-curve slope at the root is -2 a Q / n^2.
    a = (S["h0"] - S["hAtRated"]) / S["qRated"] ** 2
    dH_dQ = -2.0 * a * r["Q"] / S["pumps"] ** 2
    expect = {
        "has_operating_point": True,
        "Q_op_m3_s": r["Q"], "Q_op_m3_h": r["Q"] * 3600.0,
        "H_op_m": r["H"],
        "efficiency": r["eta"],
        "electrical_power_W": r["Pe"],
        "NPSHa_m": r["Na"], "NPSHr_m": r["Nr"], "NPSH_margin_m": r["margin"],
        "Re": r["Re"], "f_darcy": r["f"],
        "loss_static_m": r["static"], "loss_suction_pipe_m": r["hs"],
        "loss_suction_valve_m": r["hsv"], "loss_discharge_pipe_m": r["hd"],
        "loss_discharge_valve_m": r["hdv"],
    }
    sens = _page_sensitivity(S, r["Q"])
    tol = {k: _page_band(k, sens.get(k, 0.0), expect[k]) for k in expect}
    # The flow's own band is the page's step itself, not a derivative of it.
    tol["Q_op_m3_s"] = dict(TOL_PAGE["flow"])
    tol["Q_op_m3_h"] = dict(TOL_PAGE["flow"],
                            abs=TOL_PAGE["flow"]["abs"] * 3600.0,
                            rel=TOL_PAGE["flow"]["rel"])
    # The static head does not depend on the flow at all; it is closed-form in the
    # state and the page's own density, so only round-off separates the two.
    tol["loss_static_m"] = {"rel": 1e-12, "abs": 1e-9,
                            "reason": "Static head is (z2 - z1) + (p2 - p1)/(rho g), "
                                      "closed form in the state and the page's own "
                                      "declared density, with no dependence on the "
                                      "flow. Only double-precision round-off separates "
                                      "the two evaluations."}
    cc = {
        "properties": props_crosscheck,
        "reference_residual_m": r["residual"],
        "dH_dQ_m_per_m3_s": dH_dQ,
        "f_swamee_jain": _swamee_jain(r["Re"], r["rr"]) if r["Re"] >= 2300 else None,
        "f_swamee_jain_relative_deviation":
            _rel(_swamee_jain(r["Re"], r["rr"]), r["f"]) if r["Re"] >= 2300 else None,
        "friction_branch": "laminar f = 64/Re" if r["Re"] < 2300 else "colebrook",
        "velocity_m_s": r["v"],
        "relative_roughness": r["rr"],
        "cavitating": r["margin"] < 0,
        "sensitivity": {
            "note": "|dy/dQ| at this operating point, by central difference on the "
                    "reference. Each graded band is %g x the page's own flow step of %g "
                    "m3/s times the entry here, so every band in this case is "
                    "recomputable from these numbers."
                    % (PAGE_TOL_MARGIN, PAGE_Q_STEP),
            "d_dQ": sens,
        },
    }
    add(cid, group, note, inputs, expect, tol,
        ["page_demo_pump_curve", "page_system_curve", "page_water_properties",
         "page_valve_law", "colebrook_white", "darcy_weisbach", "page_root_scan",
         "npsh", "page_efficiency_curve", "page_power_chain"],
        crosscheck=cc, hand_check=hand_check)


# ---- the gradeable set ---------------------------------------------------------------
# One block per control, then the interaction and boundary blocks. Every state below is
# produced by moving the nine controls of systemPanel() within their declared ranges and
# on their declared steps; _page_case asserts both.

_page_case("page_baseline", "page_baseline",
           "The page's own defaults, unchanged. The state a visitor sees on first load.",
           {}, hand_check=True)

for _v in (50, 60, 65, 80, 90, 110, 120):
    _page_case("page_speed_%d" % _v, "page_speed",
               "Speed control at %d %%; every other control at its default." % _v,
               {"speed": _v}, hand_check=(_v == 60))

for _v in (2, 3):
    _page_case("page_pumps_x%d" % _v, "page_pumps",
               "%d identical units in parallel." % _v, {"pumps": _v},
               hand_check=(_v == 2))

for _v in (10, 15, 20, 27, 40, 60, 100):
    _page_case("page_dvalve_%d" % _v, "page_dvalve",
               "Discharge valve %d %% open: the throttling control." % _v,
               {"dvalve": _v}, hand_check=(_v == 10))

for _v in (10, 25, 50, 75):
    _page_case("page_svalve_%d" % _v, "page_svalve",
               "Suction valve %d %% open: moves the loss term that enters NPSHa." % _v,
               {"svalve": _v})

for _v in (0, 4.0, 8.0, 23.0, 28.0, 31.5, 32):
    _page_case("page_z2_%s" % str(_v).replace(".", "p"), "page_z2",
               "Destination elevation %s m: the static head." % _v, {"z2": _v})

for _v in (50, 70, 90, 120, 150, 180):
    _page_case("page_diam_%d" % _v, "page_diam",
               "Pipe diameter %d mm: moves velocity, Reynolds number and the friction "
               "factor together." % _v, {"diam": _v}, hand_check=(_v == 50))

for _v in (5, 20, 40, 60, 80, 90, 95):
    _page_case("page_temp_%d" % _v, "page_temp",
               "Water temperature %d degC: exercises the page's three declared water "
               "correlations over the control's full range." % _v, {"temp": _v},
               hand_check=(_v in (5, 95)))

for _v in (10, 30, 60, 150, 210, 260):
    _page_case("page_length_%d" % _v, "page_length",
               "Total pipe length %d m, split 34/66 by the page between suction and "
               "discharge." % _v, {"length": _v})

for _v in (0.005, 0.015, 0.045, 0.1, 0.25, 0.5):
    _page_case("page_rough_%s" % str(_v).replace(".", "p"), "page_rough",
               "Absolute roughness %s mm: moves the relative roughness in the Colebrook "
               "law from the smooth-wall end towards the fully-rough end." % _v,
               {"rough": _v}, hand_check=(_v == 0.5))

# The five states the page's own example buttons produce. applyPreset() resets to the
# defaults and then sets exactly these, so each is a control state a visitor reaches
# with one click. The `hot` preset also sets S.z1 = 0.8, which no control carries; it is
# recorded in spec_against_page and that preset is generated here at the default z1
# instead, because z1 = 0.8 is not reachable by any control.
_page_case("page_preset_throttle", "page_presets",
           "The page's 'throttle' example: discharge valve 27 %.", {"dvalve": 27})
_page_case("page_preset_static", "page_presets",
           "The page's 'static' example: destination 23 m at 65 % speed.",
           {"z2": 23.0, "speed": 65})
_page_case("page_preset_suction", "page_presets",
           "The page's 'suction' example: suction valve 28 %.", {"svalve": 28})
_page_case("page_preset_parallel", "page_presets",
           "The page's 'parallel' example: two units.", {"pumps": 2})
_page_case("page_preset_hot_controls_only", "page_presets",
           "The page's 'hot' example at 88 degC. The preset also sets the source "
           "elevation to 0.8 m, which no control carries, so this case is the reachable "
           "part of it and the rest is a spec_against_page finding.", {"temp": 88})

# States with no operating point. The page's scan finds no sign change on
# 0 < Q <= 0.035 r n and publishes its `noroot` refusal; the corpus asserts the absence
# and nothing numeric.
_page_case("page_noroot_speed50", "page_refusal",
           "Speed 50 %: shut-off head 0.25*43 = 10.75 m against a 13 m static head.",
           {"speed": 50}, hand_check=True)
_page_case("page_noroot_speed55_z2_32", "page_refusal",
           "Speed 55 % with the destination at 32 m.", {"speed": 55, "z2": 32})
_page_case("page_noroot_speed70_z2_32", "page_refusal",
           "Speed 70 % with the destination at 32 m: shut-off 21.07 m against 30 m "
           "static.", {"speed": 70, "z2": 32})
_page_case("page_noroot_dvalve10_speed60_z2_28", "page_refusal",
           "Throttled to 10 % at 60 % speed against a 26 m static head.",
           {"dvalve": 10, "speed": 60, "z2": 28.0})

# Cavitating states: NPSHa below NPSHr, which the page reports as a negative margin and
# a cavitation warning. The margin crosses zero inside the temperature control range, so
# this block is where the absolute band in TOL_PAGE["margin"] is load-bearing.
_page_case("page_cav_t88_sv28", "page_cavitation",
           "88 degC with the suction valve at 28 %.", {"temp": 88, "svalve": 28})
_page_case("page_cav_t95_sv10", "page_cavitation",
           "95 degC with the suction valve at its 10 % minimum.",
           {"temp": 95, "svalve": 10})
_page_case("page_cav_t90_L260_sv15", "page_cavitation",
           "90 degC over the full 260 m pipe with the suction valve at 15 %.",
           {"temp": 90, "length": 260, "svalve": 15})
_page_case("page_cav_t80_d50", "page_cavitation",
           "80 degC through the 50 mm pipe: the velocity head dominates the suction "
           "loss.", {"temp": 80, "diam": 50})

# The friction regime, at the two ends the controls can reach. The measured Reynolds
# envelope over the whole nine-control box is 4.46e3 to 2.90e6; the page's laminar
# branch f = 64/Re is below that envelope and is recorded in spec_against_page as
# unreachable rather than graded here.
_page_case("page_fric_lowRe", "page_friction_regime",
           "The lowest Reynolds number the controls reach: 50 mm pipe, 260 m, 5 degC, "
           "60 % speed, suction valve 10 %.",
           {"diam": 50, "length": 260, "temp": 5, "speed": 60, "svalve": 10},
           hand_check=True)
_page_case("page_fric_highRe", "page_friction_regime",
           "The highest Reynolds number the controls reach: three units at 120 %, "
           "10 m of pipe, 95 degC, both valves open.",
           {"pumps": 3, "speed": 120, "length": 10, "temp": 95, "dvalve": 100,
            "z2": 0}, hand_check=True)
_page_case("page_fric_smooth", "page_friction_regime",
           "Relative roughness at the smooth-wall end: 0.005 mm in a 180 mm pipe.",
           {"rough": 0.005, "diam": 180})
_page_case("page_fric_rough", "page_friction_regime",
           "Relative roughness at the fully-rough end: 0.5 mm in a 50 mm pipe.",
           {"rough": 0.5, "diam": 50})

# Interaction states. Each moves three or more controls at once, so a defect that
# cancels on a one-at-a-time sweep is still reached.
_PAGE_COMBOS = [
    ("page_combo_parallel_throttled", {"pumps": 2, "dvalve": 20, "z2": 23.0},
     "Two units throttled to 20 % against a 21 m static head."),
    ("page_combo_parallel3_long", {"pumps": 3, "length": 260, "diam": 150},
     "Three units over 260 m of 150 mm pipe."),
    ("page_combo_hot_fast_rough", {"temp": 90, "speed": 115, "rough": 0.3},
     "90 degC at 115 % speed through rough pipe."),
    ("page_combo_cold_slow_smooth", {"temp": 5, "speed": 70, "rough": 0.005,
                                     "z2": 8.0},
     "5 degC at 70 % speed through smooth pipe to an 8 m destination."),
    ("page_combo_small_pipe_open", {"diam": 50, "dvalve": 100, "svalve": 100,
                                    "z2": 0},
     "50 mm pipe with both valves fully open and no static lift."),
    ("page_combo_big_pipe_throttled", {"diam": 180, "dvalve": 12, "svalve": 20},
     "180 mm pipe throttled hard on both sides."),
    ("page_combo_max_static_max_speed", {"z2": 32, "speed": 120, "diam": 120},
     "The destination at its 32 m maximum with the speed at its 120 % maximum."),
    ("page_combo_short_cold_parallel", {"length": 10, "temp": 5, "pumps": 2,
                                        "diam": 70},
     "Two units over the shortest pipe at the lowest temperature."),
    ("page_combo_long_hot_single", {"length": 260, "temp": 95, "diam": 90,
                                    "rough": 0.15},
     "One unit over the longest pipe at the highest temperature."),
    ("page_combo_all_min_but_speed", {"dvalve": 10, "svalve": 10, "z2": 0,
                                      "diam": 50, "temp": 5, "length": 10,
                                      "rough": 0.005},
     "Every control at its minimum except the speed, which stays at 100 %."),
    ("page_combo_all_max_but_z2", {"dvalve": 100, "svalve": 100, "diam": 180,
                                   "temp": 95, "length": 260, "rough": 0.5,
                                   "speed": 120, "pumps": 3},
     "Every control at its maximum except the destination elevation."),
    ("page_combo_mid_everything", {"speed": 85, "pumps": 2, "dvalve": 55,
                                   "svalve": 60, "z2": 16.0, "diam": 120,
                                   "temp": 50, "length": 135, "rough": 0.25},
     "All nine controls away from their defaults and away from their limits."),
]
for _cid, _ctl, _note in _PAGE_COMBOS:
    _page_case(_cid, "page_combined", _note, _ctl)


# ======================================================================================
# 14. Decisions 2 and 3 applied to the cases that existed before this round.
#
# Nothing is deleted. A case the page's controls cannot produce keeps its numbers, its
# citations and its id, and is recorded as an ungraded diagnostic with the control that
# is missing named (AGENTS §5.2: "an item that reports the state of a solved case rather
# than testing it is a diagnostic: graded:false, status info, recorded with its status
# and left out of the pass count"; and §5: "a recorded case is never restated as freshly
# measured and never dropped to tidy the file").
# ======================================================================================

# Why each pre-existing group cannot be reached through the nine controls. The key is
# the test applied to the case's inputs; the value is the control that is absent.
_NO_CONTROL = {
    "prescribed_flow":
        "The case prescribes the flow or the Reynolds number as an input and grades the "
        "loss at it. The page has no flow control: it publishes losses only at the "
        "operating point its own solver finds. There is no control, and no combination "
        "of the nine, that imposes a flow.",
    "declared_resistance":
        "The case declares the system as a resistance parabola C Q^2. The page's system "
        "is always Darcy-Weisbach with a Colebrook friction factor and two valve "
        "coefficients, so its resistance is not a constant C and cannot be set to one.",
    "impeller_ratio":
        "The case applies the impeller-trim affinity law. The page has a speed control "
        "(f-speed, 50-120 %) and no impeller-diameter control.",
    "series":
        "The case composes units in series. The page's f-pumps select offers x1 x2 x3 in "
        "parallel only.",
    "unequal_units":
        "The case composes units with different characteristics. The page's parallel "
        "units are identical copies of the one curve.",
    "linear_curve_term":
        "The case's machine curve carries a linear term a1. The page's demo curve is "
        "H = r^2 (h0 - a qb^2), with no control for h0, for a or for a linear term; a "
        "pasted curve is interpolated with PCHIP and cannot reproduce a declared "
        "parabola exactly.",
    "valve_coefficient":
        "The case declares the valve as a resistance coefficient zeta or an IEC "
        "60534-2-1 Kv. The page's valves are an opening percentage carrying its own "
        "K(x) = 0.25/x^4 + 0.2 law, and it has no zeta and no Kv control.",
    "fan_parabola":
        "The case is a fan operating point against a declared parabola. The fan branch's "
        "characteristic is a PCHIP interpolation of pasted or illustrative points and "
        "cannot be a parabola, and its system curve carries no friction factor.",
    "zero_speed":
        "The case sets the speed ratio or the impeller ratio to zero. The page's speed "
        "control floors at 50 %.",
    "not_published_shutoff":
        "The case grades the shut-off head. The page publishes no shut-off head: there "
        "is no tile for it, and Diagram.record.build() carries no curve for the demo "
        "machine.",
    "not_published_shaft_power":
        "The case grades shaft power. The pump branch publishes electrical_power_W only.",
}


def _why_unreachable(c):
    """Return the _NO_CONTROL key for a case the nine controls cannot produce, or None."""
    i = c["inputs"]
    g = c["group"]
    ek = set(c["expect"])
    if g in ("friction_laminar", "friction_turbulent", "friction_transition",
             "system_curve"):
        return "prescribed_flow"
    if i.get("fluid_name") == "air" and g != "fluid_properties":
        return "fan_parabola"
    if i.get("valve"):
        return "valve_coefficient"
    m = i.get("machine")
    if m:
        if m.get("speed_ratio") == 0 or m.get("impeller_ratio") == 0:
            return "zero_speed"
        if isinstance(m.get("units"), list):
            return "unequal_units"
        if m.get("curves") and len(m["curves"]) > 1:
            return "unequal_units"
        if m.get("arrangement") == "series":
            return "series"
        if m.get("impeller_ratio", 1) != 1:
            return "impeller_ratio"
        if m.get("a1_s_m2", 0) != 0:
            return "linear_curve_term"
    s = i.get("system")
    if s and s.get("model") != "pipe_segments":
        return "declared_resistance"
    if s and len(s.get("segments", [])) != 1:
        return "prescribed_flow"
    if ek and ek <= {"shutoff_m", "shutoff_Pa"}:
        return "not_published_shutoff"
    if ek and ek <= {"P_shaft_W", "P_hydraulic_W"}:
        return "not_published_shaft_power"
    if not s:
        return "not_published_shutoff"
    return None


def apply_round_decisions():
    """Carry decisions 2 and 3 over the cases that existed before this round.

    Returns the spec_against_page finding, built from what the pass actually found
    rather than written out by hand.
    """
    # ---- decision 2: a page-declared constant or correlation is graded as declared ----
    for c in CASES:
        if c["group"] != "fluid_properties":
            continue
        Tc = c["inputs"]["T_K"] - 273.15
        p = c["inputs"]["p_Pa"]
        std = dict(c["expect"])
        if c["inputs"]["fluid_name"] == "water":
            rho, mu, pv = page_water_props(Tc)
            c["expect"] = {"rho_kg_m3": rho, "mu_Pa_s": mu, "nu_m2_s": mu / rho,
                           "p_vap_Pa": pv}
            c["note"] = ("Liquid-water density, viscosity and saturation pressure from "
                         "the page's own declared correlations at %g degC. The page "
                         "states a Tanaka-form density polynomial, a Vogel-form "
                         "viscosity and the Antoine equation; this case grades those, "
                         "and records their deviation from IAPWS R7-97 and R12-08 as a "
                         "crosscheck." % Tc)
            c["relations"] = ["page_water_properties"]
        else:
            rho = page_air_density(p, Tc)
            c["expect"] = {"rho_kg_m3": rho}
            c["note"] = ("Dry-air density from the page's own declared gas constant "
                         "R = 287.05 J/(kg K) at %g degC. The deviation from the ISO "
                         "2533 value 287.05287 is recorded as a crosscheck; it is "
                         "exactly 287.05287/287.05 - 1 at every state." % Tc)
            c["relations"] = ["page_air_density"]
        c["tol"] = {k: dict(TOL_PAGE["property"]) for k in c["expect"]}
        dev = {k: _rel(c["expect"][k], std[k]) for k in c["expect"] if k in std}
        c["crosscheck"] = dict(c.get("crosscheck") or {}, standard_reference={
            "note": "The value this case graded against before the 2026-10 "
                    "benchmark-evidence round, and the deviation of the page's own "
                    "declaration from it. The deviation is a flag, not a failure: the "
                    "page declares what it computes and computes it (AGENTS §5.2, "
                    "HARNESS.md).",
            # Name only the standard the keys this case GRADES are measured against.
            # The air cases grade density alone since the 2026-10 round, so the
            # Sutherland viscosity law is named only when a viscosity is graded.
            "standard": ("IAPWS R7-97 and R12-08 through CoolProp 8.0.0"
                         if c["inputs"]["fluid_name"] == "water"
                         else ("ISO 2533:1975 specific gas constant of dry air, "
                               "287.05287 J/(kg K), and the ISO 2533 Sutherland "
                               "viscosity law"
                               if any(k in c["expect"] for k in ("mu_Pa_s", "nu_m2_s"))
                               else "ISO 2533:1975 specific gas constant of dry air, "
                                    "287.05287 J/(kg K)")),
            "standard_values": {k: std[k] for k in c["expect"] if k in std},
            "relative_deviation": dev,
            "worst_relative_deviation": max(dev.values()) if dev else 0.0,
            "previous_tolerance": "1e-12 relative (air), 1e-6 relative (water)",
        })
        c["graded"] = True
        c["status"] = "pass"

    # ---- decision 2, continued: the reachable derived cases are re-solved on the
    #      page's declared water correlations, with this generator's own solver and the
    #      same curve, system and bracket the case was built with. Only the property
    #      inputs change; the method does not.
    regrounded = []
    for c in CASES:
        if c["group"] not in ("operating_point_single", "npsh", "power"):
            continue
        if _why_unreachable(c):
            continue                      # an unreachable case is a diagnostic, not regraded
        sv = c.get("_solver")
        if not sv or not sv["fkey"].startswith("water"):
            continue
        pk = sv["fkey"] + "_page"
        if pk not in FLUIDS:
            continue
        std_exp = dict(c["expect"])
        sysm = build_system(sv["skey"], pk, sv["valve"])
        r = operating_point(sv["curve"], sysm, sv["qhi"])
        assert r["has_operating_point"], c["id"]
        Q = r["Q_m3_s"]
        pp = FLUIDS[pk]["props"]
        exp = dict(c["expect"])
        exp["Q_op_m3_s"] = Q
        exp["Q_op_m3_h"] = Q * 3600.0
        if "H_op_m" in exp:
            exp["H_op_m"] = sv["curve"](Q)
        det = sysm.detail(Q)
        if sysm.model == "pipe_segments":
            for sg in det["segments"]:
                for k, v in (("Re_", sg["Re"]), ("f_darcy_", sg["f_darcy"]),
                             ("v_m_s_", sg["v_m_s"]), ("h_f_m_", sg.get("h_f_m"))):
                    kk = k + sg["id"]
                    if kk in exp and v is not None:
                        exp[kk] = v
        if "NPSHr_m" in exp and sv["npsh_args"]:
            exp["NPSHr_m"] = sv["npsh_args"]["NPSHr_m"]
        c["expect"] = exp
        dev = {k: _rel(exp[k], std_exp[k])
               for k in exp if k in std_exp and isinstance(exp[k], float)
               and isinstance(std_exp[k], float) and std_exp[k] != 0}
        c["crosscheck"] = dict(c.get("crosscheck") or {}, page_property_regrounding={
            "note": "Re-solved with the page's own declared water correlations in place "
                    "of the IAPWS presets this corpus grades its friction laws against, "
                    "using the same curve, system and bracket. The page declares what it "
                    "computes; grading it against a formulation it does not cite reported "
                    "a modelling choice as an error (AGENTS §5.2, HARNESS.md).",
            "properties_used": dict(pp),
            "properties_iapws": dict(FLUIDS[sv["fkey"]]["props"]),
            "expectation_shift_relative": dev,
            "worst_expectation_shift": max(dev.values()) if dev else 0.0,
            "standard_expectation": {k: std_exp[k] for k in dev},
        })
        c["note"] = c["note"] + (" Solved on the page's own declared water correlations; "
                                 "the shift from the IAPWS presets is in crosscheck.")
        c["inputs"] = {**c["inputs"], "fluid": pk,
                       "rho_kg_m3": pp["rho_kg_m3"], "nu_m2_s": pp["nu_m2_s"]}
        regrounded.append(c["id"])

    # ---- decision 3: a case the controls cannot produce becomes a diagnostic ---------
    found = {}
    for c in CASES:
        # The page-surface cases are reachable by construction, and the property cases
        # were just re-grounded on the page's own declarations; neither is a candidate.
        if c["group"].startswith("page_") or c["group"] == "fluid_properties":
            continue
        why = _why_unreachable(c)
        if not why:
            continue
        c["graded"] = False
        c["status"] = "info"
        c["not_reachable_on_page"] = {
            "missing": why,
            "reason": _NO_CONTROL[why],
            "kept_because": "The expected values are recomputed from the citations and "
                            "remain correct as a statement about the relations. They "
                            "are not a statement about this page, so they are recorded "
                            "and left out of the pass count.",
        }
        found.setdefault(why, []).append(c["id"])

    # Property cases are graded on the page's own declarations and must not have been
    # swept into the diagnostics.
    for c in CASES:
        if c["group"] == "fluid_properties":
            assert c["graded"], c["id"]

    return {
        "regrounded_on_page_properties": regrounded,
        "finding": "The specification this corpus was generated from describes inputs "
                   "the page gives a visitor no control for. An input a visitor cannot "
                   "reach is not a thing the tool does, so the cases that need one are "
                   "recorded as ungraded diagnostics and the coverage figure is counted "
                   "over the page's own input surface instead.",
        "page_input_surface": "systemPanel() of operatingpoint.html: nine controls, "
                              "listed with their ranges and steps in page_controls. The "
                              "machine panel adds a pasted characteristic and the limits "
                              "panel adds an acceptance envelope; neither is a solver "
                              "input for the demo machine.",
        "state_keys_with_no_control": {
            "keys": sorted(PAGE_FIXED),
            "note": "Solver state the page carries but exposes no control for. A "
                    "permalink or a handoff payload can set p1, D, L and T; z1, p2, "
                    "pumpZ, the demo-curve coefficients (qRated, h0, hAtRated), the "
                    "efficiency curve (bepQ, etaMax), the drive chain (motorEff, "
                    "driveEff) and the NPSHr curve (npsh0, npshK) can be set by no "
                    "control, no preset and no handoff quantity. The page's own 'hot' "
                    "example sets z1 = 0.8, so one preset reaches a value its controls "
                    "cannot.",
        },
        "unreachable_page_code": {
            "laminar_friction_branch":
                "frictionFactor() returns 64/Re below Re 2300. The Reynolds number "
                "measured over the whole nine-control box is 4.46e3 at its lowest "
                "(50 mm pipe, 260 m, 5 degC, 60 % speed, suction valve 10 %) and "
                "2.90e6 at its highest, so no control combination enters the laminar "
                "branch. The six laminar cases in this corpus grade a relation the page "
                "implements and no visitor can reach.",
        },
        "by_missing_control": {k: {"cases": len(v), "ids": v,
                                   "reason": _NO_CONTROL[k]}
                               for k, v in sorted(found.items())},
        "total_ungradeable": sum(len(v) for v in found.values()),
    }


def git_or_hash():
    try:
        h = subprocess.check_output(
            ["sha256sum", os.path.abspath(__file__)], text=True).split()[0]
        return h
    except Exception:
        return None


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "ref", "operatingpoint_ref.json")

    # Decisions 2 and 3 of the 2026-10 benchmark-evidence round, applied to the cases
    # built above. This must run before anything counts them.
    spec_against_page = apply_round_decisions()

    graded = [c for c in CASES if c["graded"]]
    hand = [c["id"] for c in CASES if c.get("hand_check")]
    page_cases = [c for c in CASES if c["group"].startswith("page_")]
    comparisons = sum(len(c["expect"]) for c in graded)
    groups = {}
    for c in CASES:
        groups[c["group"]] = groups.get(c["group"], 0) + 1

    doc = {
        "tool": "operatingpoint",
        "schema": "tools.petrov.re/bench-ref/operatingpoint/v1",
        "generator": "bench-src/gen_operatingpoint.py",
        "generator_sha256": git_or_hash(),
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
                                 .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "reference_provenance": "recomputed",
        "provenance_note":
            "Every expected value in this file is recomputed from the relations in the "
            "relations block, implemented in gen_operatingpoint.py from the primary "
            "sources in citations. No value is copied from the tool, from an earlier "
            "artifact or from a stored reference. The generator was written without "
            "reading operatingpoint.html, bench-src/operatingpoint.py or "
            "benchmarks/operatingpoint.json.",
        "reference_line":
            "Independent python implementation of the pump and fan operating point: a "
            "quadratic machine characteristic with the affinity laws for speed and for "
            "impeller diameter, series and parallel composition, a system curve built "
            "either as a declared resistance parabola or from Darcy-Weisbach losses with "
            "a Colebrook-White friction factor and Crane TP-410 resistance coefficients, "
            "a valve as either a resistance coefficient or an IEC 60534-2-1 Kv, NPSH to "
            "ISO 17769-1 with the ANSI/HI 9.6.1 margin, and power to ISO 9906 and "
            "ISO 5801. Water properties come from IAPWS R7-97 and R12-08 through "
            "CoolProp 8.0.0; air is an ideal gas with the ISO 2533 gas constant and the "
            "ISO 2533 Sutherland viscosity law. Every curve intersection is found by a "
            "Brent root finder written out in the generator and crosschecked against an "
            "independent bisection of the same residual and, where one exists, against "
            "the closed form.",
        "tolerance_line":
            "Four bands, each named on the case and each carrying its reason: 1e-12 "
            "relative where both sides are closed-form arithmetic (affinity "
            "multiplications, the Kv definition, the ideal-gas density, f = 64/Re, the "
            "fully-rough friction limit, shut-off head); 1e-10 relative on a Colebrook "
            "friction factor, which both sides obtain from the same implicit equation and "
            "which this band separates from the Swamee-Jain approximation, recorded per "
            "case as a crosscheck; 1e-8 relative on any quantity the page obtains by "
            "iterating to a curve intersection, because the page's own convergence test is "
            "not readable from outside it and 1e-12 there would grade its iteration count "
            "rather than its physics; 1e-6 relative on a fluid property, which covers a "
            "different build of the same IAPWS formulation and not a polynomial fit. "
            "Booleans and refusal strings are matched exactly. No band was chosen to make "
            "anything pass: nothing in this file has ever been run against the tool.",
        "citations": CITATIONS,
        "relations": RELATIONS,
        "units": UNITS,
        "constants": {"g_m_s2": G, "R_air_J_kg_K": R_AIR,
                      "sutherland_beta": SUTH_BETA, "sutherland_S_K": SUTH_S,
                      "kv_reference_dp_Pa": P0_BAR, "kv_reference_rho_kg_m3": RHO0_KV},
        "fluid_presets": {k: {"name": v["name"], "T_K": v["T_K"], "p_Pa": v["p_Pa"],
                              **v["props"]} for k, v in FLUIDS.items()},
        "machines": {"pumps": {k: {"H0_m": v[0], "a1_s_m2": v[1], "a2_s2_m5": v[2]}
                               for k, v in PUMPS.items()},
                     "fans": {k: {"dp0_Pa": v[0], "b1_Pa_s_m3": v[1], "b2_Pa_s2_m6": v[2]}
                              for k, v in FANS.items()}},
        "page_declared": page_declared_block(),
        "page_controls": PAGE_CONTROLS,
        "page_state_without_control": PAGE_FIXED,
        "spec_against_page": spec_against_page,
        "counts": {"cases": len(CASES), "graded": len(graded),
                   "ungraded_diagnostics": len(CASES) - len(graded),
                   "graded_comparisons": comparisons,
                   "page_surface_cases": len(page_cases),
                   "hand_checked": len(hand), "by_group": groups},
        "hand_checked_cases": hand,
        "not_benchmarked": [
            "The transition region 2000 < Re < 4000: no single accepted friction law "
            "exists and the tool's choice there is not derivable from any document "
            "available to this generator. Two cases record both candidate values and "
            "grade neither.",
            "NPSH required as a function of flow. NPSHr is declared as a constant per "
            "case; the shape of NPSHr(Q) that the tool uses is not documented anywhere "
            "this generator could read.",
            "Efficiency as a function of flow. Efficiency is declared as a constant per "
            "case; an eta(Q) curve is not documented.",
            "Two-phase, compressible or cavitating operation. The liquid branch is "
            "incompressible and the fan branch uses an incompressible duct loss with a "
            "density correction, which is the ISO 5801 convention below about 3 kPa.",
            "The page's own display rounding. display_assumptions records what was "
            "inferred about printed precision and from where; it is a hint for the "
            "driver, not a graded quantity.",
        ],
        "display_assumptions": {
            "source": "_docs/CHANGES-v4.17.md, which quotes this tool's result tiles as "
                      "Q 67,2 / H 18,1 / NPSH margin 2,52 and the chart subtitle as "
                      "0.0183 on the same page",
            "inferred_decimals": {"Q_op_m3_h": 1, "H_op_m": 1, "NPSH_margin_m": 2,
                                  "f_darcy": 4},
            "caveat": "Inferred, not read from the page. A driver that reads a printed "
                      "tile must grade it at half the last printed digit and must record "
                      "the decimal count it actually observed.",
        },
        "cases": CASES,
    }
    for c in CASES:
        c.pop("_solver", None)            # private build-time handles, never published
    with open(out, "w") as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=True)
        fh.write("\n")
    print("wrote %s: %d cases (%d graded, %d diagnostics, %d hand-checked)"
          % (out, len(CASES), len(graded), len(CASES) - len(graded), len(hand)))
    for g, n in sorted(groups.items()):
        print("  %-24s %3d" % (g, n))


if __name__ == "__main__":
    main()
