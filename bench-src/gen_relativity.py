#!/usr/bin/env python3
# Independent reference generator for the `relativity` benchmark corpus.
#
# Reconstructed 2026-10-03 from the equations and citations the shipped artifact
# benchmarks/relativity.json names, and from the physics -- NOT from
# relativity.html. Nothing in this file was read out of the page's source.
#
# Equations (closed form, special relativity in flat 1+1D spacetime, c = 1):
#   gamma(b)        = 1 / sqrt(1 - b^2)                          Einstein 1905 ss.3
#   phi(b)          = artanh(b) = (1/2) ln((1+b)/(1-b))          Minkowski 1909; Rindler Ch.2
#   Lorentz boost   x' = g (x - b t),  t' = g (t - b x)          Einstein 1905 ss.3
#   interval        dx = xb - xa, dt = tb - ta, ds2 = dt^2 - dx^2  Minkowski 1909
#   simultaneity    dt' = g (dt - b dx) = 0  =>  b = dt / dx,
#                   a frame exists only where |b| < 1            Einstein 1905 ss.2
#   length          L = L0 / gamma = L0 sqrt(1 - b^2)            Einstein 1905 ss.4
#   twin, piecewise inertial, T = Earth-frame time per leg:
#                   t_earth = 2T, tau_trav = 2T/gamma,
#                   difference = 2T (1 - 1/gamma)                Taylor & Wheeler 1992 Ch.4
#   radar, emitter at x = 0, target worldline x(t) = x0 + b t:
#                   outbound null ray x = t - tE meets the target at
#                   t_R = (x0 + tE) / (1 - b),  x_R = x0 + b t_R,
#                   return null ray gives t_A = t_R + x_R,
#                   t_radar = (t_A + tE)/2,  D_radar = (t_A - tE)/2   Taylor & Wheeler 1992 ss.3-4
#                   The construction has no solution for b >= 1, and the page's
#                   own refusal band (1 - b <= 1e-10) is reproduced here so a
#                   refused case is a refused case in both.
#   velocity        w = (u' + v) / (1 + u' v)                     Einstein 1905 ss.5
#
# Arithmetic: decimal.Decimal at 60 significant digits throughout. Every input is
# taken as the exact decimal literal the driver types into the page's own control,
# so the reference answers "what do the equations give for the number the page was
# handed", not "what does binary64 give". Results are emitted as the nearest
# binary64 (JSON has no wider number), which costs ~1e-16 relative -- four orders
# inside the 5e-12 tolerance the artifact states.
#
# Usage: python3 gen_relativity.py > ref/relativity_ref.json

import json
import sys
from datetime import datetime, timezone
from decimal import Decimal, getcontext, localcontext

getcontext().prec = 60

D = Decimal
ONE = D(1)
TWO = D(2)
HALF = D("0.5")


def dec(x):
    """Exact decimal literal of a case input, as typed into the page."""
    if isinstance(x, D):
        return x
    return D(repr(x)) if isinstance(x, float) else D(x)


def dsqrt(x):
    return x.sqrt()


def gamma(b):
    return ONE / dsqrt(ONE - b * b)


def rapidity(b):
    # artanh via the logarithmic identity; Decimal.ln() is correctly rounded
    return HALF * ((ONE + b) / (ONE - b)).ln()


def lorentz(x, t, b):
    g = gamma(b)
    return g * (x - b * t), g * (t - b * x)


def interval(ax, at, bx, bt):
    dx = bx - ax
    dt = bt - at
    return dx, dt, dt * dt - dx * dx


def simultaneity_beta(ax, at, bx, bt):
    dx, dt, _ = interval(ax, at, bx, bt)
    if abs(dx) < D("1e-12"):
        return None
    b = dt / dx
    return b if abs(b) < ONE else None


def length_observed(L0, b):
    return L0 * dsqrt(ONE - b * b)


def twin_times(b, leg):
    g = gamma(abs(b))
    return {
        "earth": TWO * leg,
        "traveller": TWO * leg / g,
        "difference": TWO * leg * (ONE - ONE / g),
    }


def radar_solution(b, x0, te):
    den = ONE - b
    if den <= D("1e-10"):
        return None
    t_reflect = (x0 + te) / den
    x_reflect = x0 + b * t_reflect
    t_receive = t_reflect + x_reflect
    if t_reflect < te or x_reflect < 0:
        return None
    return {
        "emit": te,
        "reflect": t_reflect,
        "receive": t_receive,
        "xReflect": x_reflect,
        "radarTime": (t_receive + te) * HALF,
        "radarDistance": (t_receive - te) * HALF,
    }


def velocity_compose(u, v):
    return (u + v) / (ONE + u * v)


# --------------------------------------------------------------- case vectors
# The 62 case ids and input vectors of benchmarks/relativity.json, verbatim.
GAMMA_BETA = [0, 0.3, -0.3, 0.6, -0.6, 0.8, -0.8,
              0.38461538461538464, 0.9230769230769231, 0.95]
RAPIDITY_BETA = [-0.9, -0.6, -0.2, 0.2, 0.6, 0.9]
LORENTZ = [
    (0.6, 4, 5), (0.6, -2, 3), (-0.6, 4, 5), (0.8, 3, 5), (-0.8, -1, 4),
    (0.3, 2.5, 6.25), (0.95, 1.2, 7.5), (-0.95, -2.2, 8.1), (0.6, 0, 1),
    (0.8, 1, 1), (-0.4, 3.3, 2.2), (0.4, -3.3, 2.2),
]
INTERVAL = [
    ((0, 0), (3, 5)), ((-2, 3), (2, 3)), ((-1, 1), (2, 4)),
    ((2.5, -1), (-1.5, 6)), ((0.2, 1.1), (4.8, 2.4)),
]
SIMULTANEITY = [((0, 0), (5, 3)), ((-2, 1), (3, 0)), ((1, 2), (-5, 4))]
LENGTH = [(5, 0.6), (5, 0.8), (3, 0.3), (7, -0.6), (2.5, 0.95), (6, 0)]
TWIN = [(0.8, 3), (0.6, 5), (0.3, 2.5), (-0.8, 4), (0.95, 1.5), (0, 3)]
RADAR = [(0.4, 1.2, 0.7), (0, 2, 1), (-0.4, 2, 0.5), (0.6, 0.8, 0.2),
         (-0.7, 3, 1), (0.85, 0.5, 0.1)]
VELOCITY = [(0.8, 0.8), (0.6, 0.6), (-0.8, 0.6), (0.8, -0.6), (0.3, 0.9),
            (-0.9, -0.5), (0.99, -0.99), (0.5, 0)]


def f(x):
    """Decimal -> nearest binary64 for JSON."""
    return float(x) if isinstance(x, D) else x


def main():
    cases = []

    for i, b in enumerate(GAMMA_BETA):
        cases.append({"id": "gamma_%02d" % i, "note": "gamma",
                      "inputs": {"beta": b},
                      "expect": {"": f(gamma(dec(b)))}})

    for i, b in enumerate(RAPIDITY_BETA):
        cases.append({"id": "rapidity_%02d" % i, "note": "rapidity",
                      "inputs": {"beta": b},
                      "expect": {"": f(rapidity(dec(b)))}})

    for i, (b, x, t) in enumerate(LORENTZ):
        xp, tp = lorentz(dec(x), dec(t), dec(b))
        cases.append({"id": "lorentz_%02d" % i, "note": "lorentz",
                      "inputs": {"beta": b, "ev": {"x": x, "t": t}},
                      "expect": {"x": f(xp), "t": f(tp)}})

    for i, ((ax, at), (bx, bt)) in enumerate(INTERVAL):
        dx, dt, s2 = interval(dec(ax), dec(at), dec(bx), dec(bt))
        cases.append({"id": "interval_%02d" % i, "note": "interval",
                      "inputs": {"a": {"x": ax, "t": at}, "b": {"x": bx, "t": bt}},
                      "expect": {"dx": f(dx), "dt": f(dt), "s2": f(s2)}})

    for i, ((ax, at), (bx, bt)) in enumerate(SIMULTANEITY):
        b = simultaneity_beta(dec(ax), dec(at), dec(bx), dec(bt))
        cases.append({"id": "simultaneity_%02d" % i, "note": "simBeta",
                      "inputs": {"a": {"x": ax, "t": at}, "b": {"x": bx, "t": bt}},
                      "expect": {"": (None if b is None else f(b))}})

    for i, (L0, b) in enumerate(LENGTH):
        cases.append({"id": "length_%02d" % i, "note": "length",
                      "inputs": {"L0": L0, "beta": b},
                      "expect": {"": f(length_observed(dec(L0), dec(b)))}})

    for i, (b, leg) in enumerate(TWIN):
        tw = twin_times(dec(b), dec(leg))
        cases.append({"id": "twin_%02d" % i, "note": "twin",
                      "inputs": {"beta": b, "leg": leg},
                      "expect": {k: f(v) for k, v in tw.items()}})

    for i, (b, x0, te) in enumerate(RADAR):
        r = radar_solution(dec(b), dec(x0), dec(te))
        cases.append({"id": "radar_%02d" % i, "note": "radar",
                      "inputs": {"beta": b, "x0": x0, "te": te},
                      "expect": (None if r is None
                                 else {k: f(v) for k, v in r.items()})})

    for i, (u, b) in enumerate(VELOCITY):
        cases.append({"id": "velocity_%02d" % i, "note": "velocity",
                      "inputs": {"u": u, "beta": b},
                      "expect": {"": f(velocity_compose(dec(u), dec(b)))}})

    out = {
        "tool": "relativity",
        "generator": "bench-src/gen_relativity.py",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "arithmetic": "python decimal.Decimal, 60 significant digits; inputs taken as exact decimal literals; results emitted as nearest binary64",
        "reference": "Closed-form 1+1-dimensional special-relativity equations implemented independently in Python with 60-digit Decimal arithmetic.",
        "citations": [
            "Einstein, A. (1905), “Zur Elektrodynamik bewegter Körper”, Annalen der Physik 17, 891–921: §§1–5 for simultaneity, Lorentz coordinate transformation, length contraction and velocity transformation.",
            "Minkowski, H. (1909; lecture delivered 1908), “Raum und Zeit”, Physikalische Zeitschrift 10, 104–111: invariant spacetime geometry and worldline interpretation.",
            "Taylor, E. F. & Wheeler, J. A. (1992), Spacetime Physics, 2nd ed., W. H. Freeman: invariant interval, proper time, light-signal/radar constructions and the travelling-twin worldline treatment.",
        ],
        "tolerance": "absolute 5e-12 plus relative 5e-12 × max(1, |reference|), widened per quantity to half of the last digit the page prints where the page prints fewer digits than that",
        "cases": cases,
    }
    json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
