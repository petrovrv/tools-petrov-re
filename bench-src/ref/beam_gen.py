#!/usr/bin/env python3
"""
Independent reference for beam_diagrams.html (tool id: beam-diagrams).

Three independent computations per case:
  A) "exact"  : closed-form Macaulay / analytic integration of the statically
                determinate beam (derived here, verified against classic results).
  B) "numeric": completely separate implementation - dense-grid cumulative
                trapezoidal integration of w(x) -> V(x) -> M(x) with the
                reactions obtained from scipy.integrate.quad.  Used only as a
                crosscheck of (A).
  C) "twin"   : a faithful re-implementation *of the tool's own algorithm*
                (600-point piecewise sampling + midpoint quadrature, and the
                exact side-handling rules found in buildDiagrams()).  Used to
                attribute any tool<->exact deviation to sampling/quadrature
                rather than to a wrong formula.
Sign conventions follow the tool:
  P  : downward positive
  M0 : applied couple, counter-clockwise positive
  R  : upward positive
  V(x) = sum of upward forces left of x        (shear)
  M(x) = sagging positive
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
import numpy as np
from scipy.integrate import quad
from scipy.optimize import brentq

# ----------------------------------------------------------------- load model
def dist_intensity(ld, t):
    if ld["type"] == "udl":
        return ld["w"] if (ld["a"] - 1e-12 <= t <= ld["b"] + 1e-12) else 0.0
    if ld["type"] == "tri":
        a, b = ld["a"], ld["b"]
        if t < a - 1e-12 or t > b + 1e-12 or b == a:
            return 0.0
        return ld["w1"] + (ld["w2"] - ld["w1"]) * (t - a) / (b - a)
    return 0.0

def total_intensity(loads, t):
    return sum(dist_intensity(l, t) for l in loads)

def dist_resultant(ld):
    """exact total downward force and centroid of one distributed load"""
    a, b = ld["a"], ld["b"]
    if ld["type"] == "udl":
        F = ld["w"] * (b - a)
        return F, (a + b) / 2.0
    w1, w2 = ld["w1"], ld["w2"]
    F = (w1 + w2) * (b - a) / 2.0
    if abs(w1 + w2) < 1e-15:
        return 0.0, (a + b) / 2.0
    xbar = a + (b - a) * (w1 + 2 * w2) / (3.0 * (w1 + w2))
    return F, xbar

def dist_int0(ld, x):
    """exact  int_0^x w(t) dt   (downward positive)"""
    a, b = ld["a"], ld["b"]
    u = min(max(x, a), b)
    if u <= a:
        return 0.0
    if ld["type"] == "udl":
        return ld["w"] * (u - a)
    w1, w2 = ld["w1"], ld["w2"]
    s = (w2 - w1) / (b - a)
    U = u - a
    return w1 * U + s * U * U / 2.0

def dist_int1(ld, x):
    """exact  int_0^x w(t)*(x-t) dt"""
    a, b = ld["a"], ld["b"]
    u = min(max(x, a), b)
    if u <= a:
        return 0.0
    X = x - a
    U = u - a
    if ld["type"] == "udl":
        return ld["w"] * (X * U - U * U / 2.0)
    w1, w2 = ld["w1"], ld["w2"]
    s = (w2 - w1) / (b - a)
    return w1 * (X * U - U * U / 2.0) + s * (X * U * U / 2.0 - U ** 3 / 3.0)

# ---------------------------------------------------------------- (A) exact
def reactions_exact(case):
    L, sup, loads = case["L"], case["supType"], case["loads"]
    sumP = 0.0        # total downward point force
    sumF = 0.0        # total downward distributed force
    pts = []          # (x, downward magnitude)
    mos = []          # (x, CCW couple)
    dists = []        # (F, xbar)
    for ld in loads:
        if ld["type"] == "point":
            sumP += ld["P"]; pts.append((ld["x"], ld["P"]))
        elif ld["type"] == "moment":
            mos.append((ld["x"], ld["M"]))
        else:
            F, xb = dist_resultant(ld); sumF += F; dists.append((F, xb))
    Wtot = sumP + sumF

    def Mext_about(xs):
        m = 0.0
        for x, P in pts:  m += -P * (x - xs)
        for x, M0 in mos: m += M0
        for F, xb in dists: m += -F * (xb - xs)
        return m

    if sup in ("cantL", "cantR"):
        xs = 0.0 if sup == "cantL" else L
        return {"kind": "fixed", "xs": xs, "R": Wtot, "Mr": -Mext_about(xs)}
    xa = case.get("supA", 0.0) if sup == "overhang" else 0.0
    xb = case.get("supB", L) if sup == "overhang" else L
    Rb = -Mext_about(xa) / (xb - xa)
    Ra = Wtot - Rb
    return {"kind": "two", "xa": xa, "xb": xb, "Ra": Ra, "Rb": Rb}

def make_VM_exact(case, R):
    """returns V(x,side), M(x,side) using exact integration"""
    loads = case["loads"]
    up = []    # (x, upward force)
    mos = []   # (x, CCW couple)
    if R["kind"] == "fixed":
        up.append((R["xs"], R["R"])); mos.append((R["xs"], R["Mr"]))
    else:
        up.append((R["xa"], R["Ra"])); up.append((R["xb"], R["Rb"]))
    for ld in loads:
        if ld["type"] == "point":  up.append((ld["x"], -ld["P"]))
        if ld["type"] == "moment": mos.append((ld["x"], ld["M"]))

    def V(x, side="R"):
        v = -sum(dist_int0(l, x) for l in loads if l["type"] in ("udl", "tri"))
        for xf, F in up:
            if (xf <= x + 1e-9) if side == "R" else (xf < x - 1e-9):
                v += F
        return v

    def M(x, side="R"):
        m = -sum(dist_int1(l, x) for l in loads if l["type"] in ("udl", "tri"))
        for xf, F in up:
            if xf < x - 1e-9:
                m += F * (x - xf)
        for xm, M0 in mos:
            inc = (xm <= x + 1e-9) if side == "R" else (xm < x - 1e-9)
            if inc:
                m += -M0
        return m
    return V, M, up, mos

def extremes_exact(case, R, V, M, up, mos):
    L = case["L"]
    brk = {0.0, L}
    for xf, _ in up:  brk.add(min(max(xf, 0.0), L))
    for xm, _ in mos: brk.add(min(max(xm, 0.0), L))
    for ld in case["loads"]:
        if "a" in ld: brk.add(min(max(ld["a"], 0.0), L)); brk.add(min(max(ld["b"], 0.0), L))
    bp = sorted(brk)
    cand = []
    for x in bp:
        # a section exists only INSIDE the beam: at x=0 take the right-hand
        # limit, at x=L the left-hand limit, elsewhere both sides.
        if abs(x) < 1e-12:            cand.append((x, "R"))
        elif abs(x - L) < 1e-12:      cand.append((x, "L"))
        else: cand.append((x, "L")); cand.append((x, "R"))
    # interior zeros of V -> stationary points of M ; interior zeros of w -> stationary V
    for i in range(len(bp) - 1):
        x0, x1 = bp[i], bp[i + 1]
        if x1 - x0 < 1e-12: continue
        xs = np.linspace(x0 + 1e-9, x1 - 1e-9, 4001)
        vs = np.array([V(x) for x in xs])
        for k in range(len(xs) - 1):
            if vs[k] == 0.0:
                cand.append((xs[k], "R"))
            elif vs[k] * vs[k + 1] < 0:
                r = brentq(lambda z: V(z), xs[k], xs[k + 1], xtol=1e-14)
                cand.append((r, "R"))
        ws = np.array([total_intensity(case["loads"], x) for x in xs])
        for k in range(len(ws) - 1):
            if ws[k] * ws[k + 1] < 0:
                r = brentq(lambda z: total_intensity(case["loads"], z), xs[k], xs[k + 1], xtol=1e-12)
                cand.append((r, "R"))
        for f in (0.25, 0.5, 0.75):
            cand.append((x0 + (x1 - x0) * f, "R"))
    Mv = [(M(x, s), x) for x, s in cand]
    Vv = [(V(x, s), x) for x, s in cand]
    Mmax, xMmax = max(Mv); Mmin, xMmin = min(Mv)
    Qmax, xQmax = max(Vv); Qmin, xQmin = min(Vv)
    xMmax = min(x for v, x in Mv if abs(v - Mmax) < 1e-9)
    xMmin = min(x for v, x in Mv if abs(v - Mmin) < 1e-9)
    xQmax = min(x for v, x in Vv if abs(v - Qmax) < 1e-9)
    xQmin = min(x for v, x in Vv if abs(v - Qmin) < 1e-9)

    def regions(f, val, tol):
        """intervals (possibly degenerate) on which f attains `val`"""
        regs = []
        for i in range(len(bp) - 1):
            x0, x1 = bp[i], bp[i + 1]
            if x1 - x0 < 1e-12: continue
            probe = np.linspace(x0, x1, 9)[1:-1]
            if all(abs(f(x, "R") - val) <= tol for x in probe):
                regs.append([x0, x1])
        for x, sd in cand:
            if abs(f(x, sd) - val) <= tol:
                regs.append([x, x])
        regs.sort()
        merged = []
        for r in regs:
            if merged and r[0] <= merged[-1][1] + 1e-9:
                merged[-1][1] = max(merged[-1][1], r[1])
            else:
                merged.append(list(r))
        return merged

    sM = max(abs(Mmax), abs(Mmin), 1e-9); sQ = max(abs(Qmax), abs(Qmin), 1e-9)
    return dict(Mmax=Mmax, xMmax=xMmax, Mmin=Mmin, xMmin=xMmin,
                Qmax=Qmax, xQmax=xQmax, Qmin=Qmin, xQmin=xQmin,
                regMmax=regions(M, Mmax, 1e-9 * sM), regMmin=regions(M, Mmin, 1e-9 * sM),
                regQmax=regions(V, Qmax, 1e-9 * sQ), regQmin=regions(V, Qmin, 1e-9 * sQ))

# ------------------------------------------------------- (B) independent num
def numeric_reference(case):
    """dense-grid, quad-based, structurally different implementation"""
    L, sup, loads = case["L"], case["supType"], case["loads"]
    brkpts = [0.0, L]
    for ld in loads:
        if "a" in ld: brkpts += [ld["a"], ld["b"]]
    brkpts = sorted(set(min(max(b, 0.0), L) for b in brkpts))
    wfun = lambda t: total_intensity(loads, t)
    Fd = quad(wfun, 0, L, points=brkpts, limit=400)[0]
    Md = quad(lambda t: wfun(t) * t, 0, L, points=brkpts, limit=400)[0]
    sumP = sum(l["P"] for l in loads if l["type"] == "point")
    sumPx = sum(l["P"] * l["x"] for l in loads if l["type"] == "point")
    sumM0 = sum(l["M"] for l in loads if l["type"] == "moment")
    Wtot = Fd + sumP
    if sup in ("cantL", "cantR"):
        xs = 0.0 if sup == "cantL" else L
        Mr = (Md - Fd * xs) + (sumPx - sumP * xs) - sumM0
        res = {"kind": "fixed", "xs": xs, "R": Wtot, "Mr": Mr}
    else:
        xa = case.get("supA", 0.0) if sup == "overhang" else 0.0
        xb = case.get("supB", L) if sup == "overhang" else L
        MA = -(sumPx - sumP * xa) + sumM0 - (Md - Fd * xa)
        Rb = -MA / (xb - xa)
        res = {"kind": "two", "xa": xa, "xb": xb, "Ra": Wtot - Rb, "Rb": Rb}
    # V, M by cumulative trapezoid on a dense grid, jumps handled by segment
    N = 400001
    x = np.linspace(0, L, N)
    w = np.array([wfun(t) for t in x])
    V = -np.concatenate(([0.0], np.cumsum((w[1:] + w[:-1]) / 2 * np.diff(x))))
    up = ([(res["xs"], res["R"])] if res["kind"] == "fixed"
          else [(res["xa"], res["Ra"]), (res["xb"], res["Rb"])])
    up += [(l["x"], -l["P"]) for l in loads if l["type"] == "point"]
    mos = ([(res["xs"], res["Mr"])] if res["kind"] == "fixed" else [])
    mos += [(l["x"], l["M"]) for l in loads if l["type"] == "moment"]
    for xf, F in up:
        # interior-limit convention: a force applied exactly at x=L acts on no
        # section of the beam, so it is not added at the last grid point
        if xf >= L - 1e-12:
            continue
        V += np.where(x >= xf - 1e-12, F, 0.0)
    M = np.concatenate(([0.0], np.cumsum((V[1:] + V[:-1]) / 2 * np.diff(x))))
    # correct the constant: integrate from 0 with M(0+) = -sum couples at 0
    M += -sum(m for xm, m in mos if xm <= 1e-12)
    for xm, m in mos:
        if xm > 1e-12:
            M += np.where(x > xm + 1e-12, -m, 0.0)
    return res, dict(Mmax=M.max(), Mmin=M.min(), Qmax=V.max(), Qmin=V.min(),
                     xMmax=x[M.argmax()], xMmin=x[M.argmin()],
                     xQmax=x[V.argmax()], xQmin=x[V.argmin()])

# -------------------------------------------- (C) digital twin of the tool
def jsround(v):
    return math.floor(v + 0.5)

def twin(case, R):
    """re-implementation of buildDiagrams()+analyze() with exact load math"""
    L, loads = case["L"], case["loads"]
    Nn = 600
    dx = L / Nn
    up = []; mos = []
    if R["kind"] == "fixed":
        up.append((R["xs"], R["R"])); mos.append((R["xs"], R["Mr"]))
    else:
        up.append((R["xa"], R["Ra"])); up.append((R["xb"], R["Rb"]))
    for ld in loads:
        if ld["type"] == "point":  up.append((ld["x"], -ld["P"]))
        if ld["type"] == "moment": mos.append((ld["x"], ld["M"]))

    def shearAt(x, side):
        n = max(2, jsround(x / dx)); h = x / n
        integ = sum(total_intensity(loads, (i + 0.5) * h) * h for i in range(n))
        q = -integ
        for xf, F in up:
            if (xf <= x + 1e-9) if side == "R" else (xf < x - 1e-9):
                q += F
        return q

    def momentAt(x, side):
        n = max(2, jsround(x / dx)); h = x / n
        integ = sum((-total_intensity(loads, (i + 0.5) * h)) * (x - (i + 0.5) * h) * h
                    for i in range(n))
        m = integ
        for xf, F in up:
            if xf < x - 1e-9: m += F * (x - xf)
        for xm, M0 in mos:
            if xm < x - 1e-9: m += -M0     # NOTE: tool ignores `side` here
        return m

    brk = {0.0, L}
    for xf, _ in up:  brk.add(min(max(xf, 0.0), L))
    for xm, _ in mos: brk.add(min(max(xm, 0.0), L))
    for ld in loads:
        if "a" in ld: brk.add(min(max(ld["a"], 0.0), L)); brk.add(min(max(ld["b"], 0.0), L))
    bp = sorted(brk)
    perSeg = max(4, jsround(Nn / max(1, len(bp) - 1)))
    xs = []; Q = []; Mv = []
    for s in range(len(bp) - 1):
        x0, x1 = bp[s], bp[s + 1]
        for i in range(perSeg + 1):
            x = x0 + (x1 - x0) * i / perSeg
            side = "R" if i == 0 else ("L" if i == perSeg else "R")
            xs.append(x); Q.append(shearAt(x, side)); Mv.append(momentAt(x, side))
    iMx = int(np.argmax(Mv)); iMn = int(np.argmin(Mv))
    iQx = int(np.argmax(Q));  iQn = int(np.argmin(Q))
    return dict(Mmax=Mv[iMx], xMmax=xs[iMx], Mmin=Mv[iMn], xMmin=xs[iMn],
                Qmax=Q[iQx], xQmax=xs[iQx], Qmin=Q[iQn], xQmin=xs[iQn])

# ------------------------------------------------------------------- cases
C = []
def case(id, note, L, supType, loads, supA=None, supB=None, probes=None):
    c = dict(id=id, note=note, L=L, supType=supType, loads=loads)
    if supA is not None: c["supA"] = supA
    if supB is not None: c["supB"] = supB
    c["probes"] = probes or []
    C.append(c)

P = lambda p, x: {"type": "point", "P": p, "x": x}
U = lambda w, a, b: {"type": "udl", "w": w, "a": a, "b": b}
T = lambda w1, w2, a, b: {"type": "tri", "w1": w1, "w2": w2, "a": a, "b": b}
Mo = lambda m, x: {"type": "moment", "M": m, "x": x}

case("ss_point_center", "simply supported, central point load: R=P/2, Mmax=PL/4",
     6, "simple", [P(10, 3)], probes=[1.5, 3.0, 4.5])
case("ss_point_offset", "simply supported, point load at a: R_A=Pb/L, Mmax=Pab/L",
     8, "simple", [P(12, 2)], probes=[1.0, 2.0, 5.0])
case("ss_udl_full", "simply supported, full UDL: R=wL/2, Mmax=wL^2/8",
     6, "simple", [U(5, 0, 6)], probes=[1.5, 3.0, 4.5])
case("ss_udl_partial", "simply supported, partial UDL over [2,6] of L=10",
     10, "simple", [U(4, 2, 6)], probes=[2.0, 4.0, 6.0, 8.0])
case("ss_tri_full", "simply supported, triangular 0->w: R_A=wL/6, R_B=wL/3, Mmax=wL^2/(9*sqrt3)",
     6, "simple", [T(0, 9, 0, 6)], probes=[2.0, 3.0, 4.0])
case("ss_tri_partial", "simply supported, triangular 0->6 kN/m over [4,10] of L=10",
     10, "simple", [T(0, 6, 4, 10)], probes=[3.0, 5.0, 8.0])
case("ss_trap_full", "simply supported, trapezoidal 3->9 kN/m full span",
     9, "simple", [T(3, 9, 0, 9)], probes=[3.0, 4.5, 6.0])
case("cantL_tip_point", "cantilever fixed left, tip point load: M_fixed=-PL, V=P",
     4, "cantL", [P(8, 4)], probes=[0.0, 2.0, 4.0])
case("cantL_udl_full", "cantilever fixed left, full UDL: M_fixed=-wL^2/2",
     5, "cantL", [U(6, 0, 5)], probes=[0.0, 2.5, 5.0])
case("cantR_tip_point", "cantilever fixed right, point load at free end x=0",
     4, "cantR", [P(8, 0)], probes=[0.0, 2.0, 4.0])
case("cantL_udl_partial", "cantilever fixed left, UDL over [2,5] of L=6",
     6, "cantL", [U(5, 2, 5)], probes=[0.0, 2.0, 5.0, 6.0])
case("ss_moment_mid", "simply supported, applied CCW couple M0 at midspan",
     6, "simple", [Mo(10, 3)], probes=[1.5, 4.5])
case("ss_moment_quarter", "simply supported, applied CCW couple M0=15 at x=2 of L=8",
     8, "simple", [Mo(15, 2)], probes=[1.0, 5.0])
case("overhang_point_on_overhang", "overhanging beam, point load on the 2 m overhang",
     8, "overhang", [P(10, 8)], supA=0, supB=6, probes=[3.0, 6.0, 7.0])
case("overhang_udl_full", "double overhang, symmetric full UDL",
     10, "overhang", [U(5, 0, 10)], supA=2, supB=8, probes=[1.0, 2.0, 5.0, 8.0])
case("overhang_asym", "overhang, asymmetric: tip load + partial UDL",
     9, "overhang", [P(14, 9), U(3, 1, 5)], supA=1, supB=7, probes=[1.0, 4.0, 7.0])
case("superpos_A", "superposition part A: point load alone",
     6, "simple", [P(10, 2)], probes=[2.0, 4.0])
case("superpos_B", "superposition part B: full UDL alone",
     6, "simple", [U(4, 0, 6)], probes=[2.0, 4.0])
case("superpos_AB", "superposition: A+B applied together, must equal A+B",
     6, "simple", [P(10, 2), U(4, 0, 6)], probes=[2.0, 4.0])
case("ss_two_points", "simply supported, two asymmetric point loads",
     10, "simple", [P(8, 2.5), P(12, 7)], probes=[2.5, 5.0, 7.0])

# ------------------------------------------------------------------- build
out = []
for c in C:
    R = reactions_exact(c)
    V, M, up, mos = make_VM_exact(c, R)
    ex = extremes_exact(c, R, V, M, up, mos)
    Rn, exn = numeric_reference(c)
    tw = twin(c, R)
    # crosscheck: analytic vs independent numeric
    dev = []
    if R["kind"] == "fixed":
        dev.append(abs(R["R"] - Rn["R"]) / max(abs(R["R"]), 1e-9))
        dev.append(abs(R["Mr"] - Rn["Mr"]) / max(abs(R["Mr"]), 1e-9))
    else:
        dev.append(abs(R["Ra"] - Rn["Ra"]) / max(abs(R["Ra"]), 1e-9))
        dev.append(abs(R["Rb"] - Rn["Rb"]) / max(abs(R["Rb"]), 1e-9))
    for k in ("Mmax", "Mmin", "Qmax", "Qmin"):
        sc = max(abs(ex[k]), 1e-9)
        if sc > 1e-6:
            dev.append(abs(ex[k] - exn[k]) / sc)
    Lc = c["L"]
    table = []
    for i in range(22):
        x = Lc * i / 21.0
        if i == 0:      sides = ["R"]
        elif i == 21:   sides = ["L"]
        else:           sides = ["L", "R"]
        Vs = [V(x, sd) for sd in sides]; Ms = [M(x, sd) for sd in sides]
        table.append({"i": i, "x": x, "V": Vs, "M": Ms,
                      "ambiguous": (max(Vs) - min(Vs) > 1e-9) or (max(Ms) - min(Ms) > 1e-9)})
    probe = table
    scaleM = max(abs(ex["Mmax"]), abs(ex["Mmin"]), 1e-9)
    scaleQ = max(abs(ex["Qmax"]), abs(ex["Qmin"]), 1e-9)
    # global equilibrium data (independent of the tool)
    sumP_down = sum(l["P"] for l in c["loads"] if l["type"] == "point")
    sumMload = sum(-l["P"] * l["x"] for l in c["loads"] if l["type"] == "point") \
             + sum(l["M"] for l in c["loads"] if l["type"] == "moment")
    for l in c["loads"]:
        if l["type"] in ("udl", "tri"):
            F, xb = dist_resultant(l); sumP_down += F; sumMload += -F * xb
    rec = {"id": c["id"], "note": c["note"],
           "equil": {"sumP_down": sumP_down, "sumMload_ccw": sumMload},
           "inputs": {k: c[k] for k in ("L", "supType", "loads") },
           "table_ref": probe, "scaleM": scaleM, "scaleQ": scaleQ,
           "exact": {}, "twin": tw,
           "crosscheck_max_rel": max(dev)}
    if "supA" in c: rec["inputs"]["supA"] = c["supA"]; rec["inputs"]["supB"] = c["supB"]
    if R["kind"] == "fixed":
        rec["exact"] = {"R": R["R"], "Mr": R["Mr"], "xs": R["xs"], **ex}
    else:
        rec["exact"] = {"Ra": R["Ra"], "Rb": R["Rb"], "xa": R["xa"], "xb": R["xb"], **ex}
    out.append(rec)

with open(_gp.ref('beam_diagrams_ref.json'), "w") as f:
    json.dump(out, f, indent=1)

print("cases:", len(out))
for r in out:
    print(f"{r['id']:28s} crosscheck={r['crosscheck_max_rel']:.2e}  "
          f"Mmax={r['exact']['Mmax']:9.4f}@{r['exact']['xMmax']:.4f} "
          f"Mmin={r['exact']['Mmin']:9.4f}@{r['exact']['xMmin']:.4f} "
          f"Qmax={r['exact']['Qmax']:8.4f} Qmin={r['exact']['Qmin']:8.4f}")
