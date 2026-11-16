#!/usr/bin/env python3
"""Independent analytic reference for heat2d.html (tool id "heat2d").

Everything in this file is derived from closed-form solutions of the heat
equation and implemented here from scratch; nothing is taken from the tool's
own JavaScript.  Series solutions are summed to machine-level convergence and
the transcendental eigenvalue equations are solved with scipy.brentq on
bracketing intervals that are analytically guaranteed to contain exactly one
root.

References (cited in the result artifact):
  [1] F.P. Incropera, D.P. DeWitt, T.L. Bergman, A.S. Lavine,
      "Fundamentals of Heat and Mass Transfer", 6th ed., Wiley 2007
      - eq. 4.19  (two-dimensional rectangular plate, Fourier series)
      - Table 4.1 case 1 (isothermal cylinder buried in a semi-infinite medium)
      - Table 4.1 case 7 (eccentric cylinders)
      - eq. 3.28  (steady radial conduction, cylindrical shell / log law)
      - eq. 5.60/5.61 (one-term and full series, plane wall)
      - eq. 5.52  (semi-infinite solid, constant surface temperature, erf)
      - Table 5.1 (one-term coefficients, plane wall / cylinder / sphere)
  [2] H.S. Carslaw, J.C. Jaeger, "Conduction of Heat in Solids", 2nd ed.,
      Oxford 1959 - Sec. 2.5 (semi-infinite solid), Sec. 3.3-3.5 (slab),
      Sec. 7.6 (cylinder), Sec. 4.4 (buried row of line sources).
  [3] M.M. Yovanovich, "Conduction and Thermal Contact Resistances", in
      W.M. Rohsenow et al. (eds.), Handbook of Heat Transfer, 3rd ed.,
      McGraw-Hill 1998, Ch. 3 - conduction shape factors.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json
import math

import numpy as np
from scipy.optimize import brentq
from scipy.special import erf, erfc, j0, j1, jn_zeros

# ---------------------------------------------------------------- materials
# indices into the tool's MATERIALS array; values restated here independently
MAT = {
    "aluminium": dict(idx=0, k=237.0, rho=2700.0, c=900.0),
    "steel_carbon": dict(idx=5, k=50.0, rho=7850.0, c=470.0),
}
STEEL = MAT["steel_carbon"]
ALPHA_STEEL = STEEL["k"] / (STEEL["rho"] * STEEL["c"])


# ============================================================ 1. plate, 2-D
def plate_theta(x, y, L, H, nterms=20001):
    """Incropera eq. 4.19.  Plate 0<=x<=L, 0<=y<=H.  Three sides at T1, the
    side y=H at T2.  Returns theta = (T-T1)/(T2-T1).

    theta = (2/pi) SUM_n [((-1)^(n+1)+1)/n] sin(n pi x/L) sinh(n pi y/L)
                                                        / sinh(n pi H/L)
    Only odd n survive, giving (4/pi) SUM_odd.  The sinh ratio is evaluated as
        sinh(a y)/sinh(a H) = e^{a(y-H)} (1-e^{-2 a y})/(1-e^{-2 a H})
    which is free of overflow for every a, y, H.
    """
    s = 0.0
    for n in range(1, nterms, 2):
        a = n * math.pi / L
        if a * H > 700 and a * (H - y) > 40:
            r = math.exp(a * (y - H))          # both correction factors -> 1
        else:
            r = (math.exp(a * (y - H)) * (1.0 - math.exp(-2.0 * a * y))
                 / (1.0 - math.exp(-2.0 * a * H)))
        term = math.sin(a * x) * r / n
        s += term
        if n > 200 and abs(term) < 1e-16 * max(abs(s), 1e-30):
            break
    return 4.0 / math.pi * s


# ================================================== 2. steady 1-D composites
def slab_conv(x, L, k, h, Tw, Tinf):
    """Plane slab, x=0 held at Tw, x=L convecting to Tinf with film h.
    q'' = (Tw-Tinf)/(L/k + 1/h);  T(x) = Tw - q'' x/k.  Exact, linear."""
    q = (Tw - Tinf) / (L / k + 1.0 / h)
    return Tw - q * x / k, q


def slab_gen(x, L, k, q3, T1, T2):
    """Uniform volumetric source q3 in a slab, T(0)=T1, T(L)=T2.
    T(x) = -q3 x^2/(2k) + [(T2-T1)/L + q3 L/(2k)] x + T1."""
    return -q3 * x * x / (2 * k) + ((T2 - T1) / L + q3 * L / (2 * k)) * x + T1


# =========================================================== 3. radial / log
def annulus_T(r, r1, r2, T1, T2):
    """Incropera eq. 3.28 - cylindrical shell, T(r1)=T1, T(r2)=T2."""
    return T2 + (T1 - T2) * math.log(r2 / r) / math.log(r2 / r1)


def annulus_Q(r1, r2, T1, T2, k):
    """Heat rate per unit length, W/m."""
    return 2 * math.pi * k * (T1 - T2) / math.log(r2 / r1)


# ======================================================== 4. shape factors
def S_buried_pipe(z, D):
    """Incropera Table 4.1 case 1: isothermal cylinder of diameter D whose
    axis lies a depth z below the isothermal surface of a semi-infinite
    medium.  S/L = 2 pi / arccosh(2 z / D).  Exact (conformal mapping),
    valid for z > D/2."""
    return 2 * math.pi / math.acosh(2 * z / D)


def S_buried_row(z, D, s):
    """Row of parallel isothermal cylinders, diameter D, axis depth z, pitch s,
    below the isothermal surface of a semi-infinite medium (Carslaw & Jaeger
    Sec. 4.4; Yovanovich Handbook of Heat Transfer Ch.3).

    A row of line sources of strength q' at (m s, z) with image sinks at
    (m s, -z) gives, by summing ln|.| over the row,
        T(x,y) = q'/(4 pi k) ln[ (cosh(2pi(y+z)/s) - cos(2pi x/s))
                               / (cosh(2pi(y-z)/s) - cos(2pi x/s)) ]
    which vanishes on y=0.  Expanding about the source and evaluating on
    r = D/2 gives  T_surf = q'/(2 pi k) ln[ (2 s /(pi D)) sinh(2 pi z / s) ],
    hence  S/L = 2 pi / ln[(2 s/(pi D)) sinh(2 pi z/s)].
    Line-source approximation: relative error is O((D/4z)^2) and O((D/2s)^2).
    In the limit s -> infinity it reduces to 2 pi / ln(4 z / D), which is the
    large-z/D limit of the exact case-1 result above.
    """
    return 2 * math.pi / math.log((2 * s / (math.pi * D)) * math.sinh(2 * math.pi * z / s))


def S_buried_row_mfs(z, D, s, nsrc=80, ncol=400, frac=0.55):
    """Same configuration as S_buried_row but WITHOUT the line-source
    approximation: a method-of-fundamental-solutions collocation on the real
    circular boundary.  Sources are placed on a circle of radius 0.55 a inside
    the pipe and their strengths are fitted so that the periodic half-plane
    Green's function
        G(P; P0) = (1/2pi) ln| sin(pi(P - conj(P0))/s) / sin(pi(P - P0)/s) |
    (which is identically zero on y = 0 and s-periodic in x) sums to exactly 1
    on 400 points of the pipe surface.  The residual max|T-1| is ~1e-15, and
    at s -> infinity the method reproduces the exact conformal result
    2 pi / arccosh(2z/D) to seven digits, so this is an essentially exact
    reference.  Returns (S/L, boundary residual)."""
    a = D / 2.0
    th = np.arange(nsrc) * 2 * np.pi / nsrc
    p0 = (frac * a) * np.exp(1j * th) + 1j * z
    thc = np.arange(ncol) * 2 * np.pi / ncol
    pc = a * np.exp(1j * thc) + 1j * z
    A = np.log(np.abs(np.sin(np.pi * (pc[:, None] - np.conj(p0)[None, :]) / s)
                      / np.sin(np.pi * (pc[:, None] - p0[None, :]) / s))) / (2 * np.pi)
    q = np.linalg.lstsq(A, np.ones(ncol), rcond=None)[0]
    return float(q.sum()), float(np.abs(A @ q - 1).max())


def S_eccentric(D1, D2, e):
    """Incropera Table 4.1 case 7: eccentric cylinders, inner diameter D1
    inside outer diameter D2 with axis offset e.
    S/L = 2 pi / arccosh((D1^2 + D2^2 - 4 e^2)/(2 D1 D2)).  Exact."""
    return 2 * math.pi / math.acosh((D1 * D1 + D2 * D2 - 4 * e * e) / (2 * D1 * D2))


def bipolar_eccentric(a1, a2, e):
    """Bipolar-coordinate parameters for an inner circle of radius a1 whose
    centre is offset e from the centre of an outer circle of radius a2.

    With the two poles on the x axis at +-c, the level curves of
        eta(x,y) = ln( |P + c| / |P - c| )
    are circles of radius c/sinh(eta) centred at (c coth eta, 0).  Requiring
    both boundaries to be level curves gives
        c = a1 sinh(eta1) = a2 sinh(eta2),   a1 cosh(eta1) - a2 cosh(eta2) = e
    (coth decreases, so the inner-circle centre lies at smaller pole-frame x
    than the outer-circle centre, by exactly e).  eta is harmonic, so
        T = T2 + (T1-T2) (eta - eta2)/(eta1 - eta2)
    is the exact solution and  S/L = 2 pi/(eta1 - eta2).
    Returns (c, eta1, eta2, x0) with x0 = a2 cosh(eta2) the pole-frame
    abscissa of the outer-circle centre."""
    def res(e2):
        c = a2 * math.sinh(e2)
        e1 = math.asinh(c / a1)
        return a2 * math.cosh(e2) - a1 * math.cosh(e1) - e
    lo, hi = 1e-12, 1.0
    while res(hi) > 0:
        hi *= 2
        if hi > 100:
            raise RuntimeError("no bracket")
    eta2 = brentq(res, lo, hi, xtol=1e-15, rtol=1e-15)
    c = a2 * math.sinh(eta2)
    eta1 = math.asinh(c / a1)
    return c, eta1, eta2, a2 * math.cosh(eta2)


def bipolar_T(x, y, c, x0, eta1, eta2, T1, T2):
    """Temperature at (x,y) in the model frame, where the OUTER circle is
    centred at the origin and the inner circle at x = +e.  The pole frame is
    the mirror image: x_pole = x0 - x."""
    px, py = x0 - x, y
    eta = 0.5 * math.log(((px + c) ** 2 + py * py) / ((px - c) ** 2 + py * py))
    return T2 + (T1 - T2) * (eta - eta2) / (eta1 - eta2)


# ================================================== 5. transient closed forms
def semi_infinite(x, t, alpha, Ts, Ti):
    """Carslaw & Jaeger Sec. 2.5 / Incropera eq. 5.60:
    T(x,t) = Ts + (Ti - Ts) erf( x / (2 sqrt(alpha t)) )."""
    return Ts + (Ti - Ts) * erf(x / (2.0 * math.sqrt(alpha * t)))


def wall_roots(Bi, n):
    """Roots of  zeta tan(zeta) = Bi  (plane wall with convection on one face
    and symmetry/adiabatic on the other).  Root m lies in
    ((m-1)pi, (m-1)pi + pi/2)."""
    out = []
    for m in range(n):
        lo = m * math.pi + 1e-12
        hi = m * math.pi + math.pi / 2 - 1e-12
        f = lambda z: z * math.tan(z) - Bi
        out.append(brentq(f, lo, hi, xtol=1e-15, rtol=1e-15, maxiter=300))
    return out


def wall_series(xstar, Fo, Bi, nterms=200):
    """Exact separation-of-variables solution for a plane wall of half
    thickness L, initially uniform, convecting from |x|=L (Incropera eq.
    5.39a with all terms retained; Carslaw & Jaeger Sec. 3.4):
        theta* = SUM_n C_n exp(-zeta_n^2 Fo) cos(zeta_n x*)
        C_n = 4 sin(zeta_n) / (2 zeta_n + sin(2 zeta_n))
    """
    z = wall_roots(Bi, nterms)
    s = 0.0
    for zn in z:
        Cn = 4 * math.sin(zn) / (2 * zn + math.sin(2 * zn))
        term = Cn * math.exp(-zn * zn * Fo) * math.cos(zn * xstar)
        s += term
        if abs(term) < 1e-17 and zn * zn * Fo > 1:
            break
    return s


def wall_one_term(xstar, Fo, Bi):
    """Heisler / one-term approximation, Incropera eq. 5.43a + Table 5.1."""
    z1 = wall_roots(Bi, 1)[0]
    C1 = 4 * math.sin(z1) / (2 * z1 + math.sin(2 * z1))
    return C1 * math.exp(-z1 * z1 * Fo) * math.cos(z1 * xstar), z1, C1


def cyl_roots(Bi, n):
    """Roots of  zeta J1(zeta)/J0(zeta) = Bi  (infinite cylinder with
    convection).  Root m lies in (j0_{m}, j1_{m}) ... more robustly, between
    the m-th zero of J1 (=0 for m=1) and the m-th zero of J0, where the
    left-hand side rises monotonically from 0 to +infinity."""
    z0 = jn_zeros(0, n)          # zeros of J0
    z1 = np.concatenate(([0.0], jn_zeros(1, n)))   # zeros of J1, with 0
    out = []
    f = lambda z: z * j1(z) - Bi * j0(z)
    for m in range(n):
        lo = z1[m] + 1e-12
        hi = z0[m] - 1e-12
        out.append(brentq(f, lo, hi, xtol=1e-15, rtol=1e-15, maxiter=300))
    return out


def cyl_series(rstar, Fo, Bi, nterms=120):
    """Exact series for an infinite cylinder of radius R, initially uniform,
    convecting from r=R (Carslaw & Jaeger Sec. 7.6; Incropera eq. 5.47a):
        theta* = SUM_n C_n exp(-zeta_n^2 Fo) J0(zeta_n r*)
        C_n = (2/zeta_n) J1(zeta_n) / (J0(zeta_n)^2 + J1(zeta_n)^2)
    """
    z = cyl_roots(Bi, nterms)
    s = 0.0
    for zn in z:
        Cn = (2.0 / zn) * j1(zn) / (j0(zn) ** 2 + j1(zn) ** 2)
        term = Cn * math.exp(-zn * zn * Fo) * j0(zn * rstar)
        s += term
        if abs(term) < 1e-17 and zn * zn * Fo > 1:
            break
    return s


# ================================================================ build ref
def build():
    ref = {"description": __doc__.strip(), "cases": []}

    # ---------------------------------------------------------------- plate
    L, H = 200.0, 100.0            # mm
    T1, T2 = 0.0, 100.0
    def plate_pts(nx):
        """Sample cells whose CENTRES sit closest to the target positions;
        a cell-centred scheme stores T at (i+1/2) dx, not at (i) dx."""
        d = L / nx
        out = []
        for xt in (25.0, 50.0, 100.0, 150.0, 175.0):
            for yt in (25.0, 50.0, 75.0, 90.0):
                i = min(nx - 1, max(0, int(xt / d)))
                j = min(int(round(H / d)) - 1, max(0, int(yt / d)))
                xm, ym = (i + 0.5) * d, (j + 0.5) * d
                th = plate_theta(xm / 1000.0, ym / 1000.0, L / 1000.0, H / 1000.0)
                out.append({"x_mm": xm, "y_mm": ym, "i": i, "j": j,
                            "T": T1 + (T2 - T1) * th})
        return out
    pts = plate_pts(200)
    ref["cases"].append({
        "id": "PLATE-FOURIER",
        "kind": "steady_field",
        "note": ("Rectangular plate 200 x 100 mm, left/right/top edges held at "
                 "0 C, bottom edge at 100 C.  Fourier-series solution, "
                 "Incropera eq. 4.19, 10000 odd terms."),
        "model": plate_model(200),
        "points": pts,
        "dT": T2 - T1,
        "fv_error": fv_plate_error(200, pts),
    })

    # mesh convergence for the same plate
    ref["cases"].append({
        "id": "PLATE-MESH",
        "kind": "mesh_convergence",
        "note": ("Same plate, nx = 30/60/120/240/480.  RMS error over the sample "
                 "points must fall at second order (ratio -> 4 per halving of "
                 "dx).  Points nearer than 15 mm to the two mixed-BC corners "
                 "are excluded because the exact solution is not smooth "
                 "there and the formal order degrades.  nx is kept even so "
                 "that H/dx is an integer: the tool sizes the mesh as "
                 "ny = round(H/dx), so an odd nx would silently change the "
                 "plate height by up to half a cell and contaminate the "
                 "order estimate."),
        "meshes": [30, 60, 120, 240, 480],
        "models": {str(n): plate_model(n) for n in (30, 60, 120, 240, 480)},
        "points_by_mesh": {str(n): [p for p in plate_pts(n)
                                    if not (p["y_mm"] > 80 and
                                            (p["x_mm"] < 30 or p["x_mm"] > 170))]
                           for n in (30, 60, 120, 240, 480)},
        "fv_error_by_mesh": {str(n): fv_plate_error(
                                 n, [p for p in plate_pts(n)
                                     if not (p["y_mm"] > 80 and
                                             (p["x_mm"] < 30 or p["x_mm"] > 170))])
                             for n in (30, 60, 120, 240, 480)},
        "dT": T2 - T1,
        "expected_order": 2.0,
        "csv_quantisation_K": 0.001,
    })

    # steady energy balance of the plate
    ref["cases"].append({
        "id": "PLATE-BALANCE",
        "kind": "energy_balance",
        "note": ("Steady state: the algebraic sum of all boundary heat flows "
                 "must vanish.  Graded as |residual| / (sum of positive "
                 "inflows)."),
        "model": plate_model(200),
        "limit_rel": 1e-3,
    })

    # -------------------------------------------------------- 1-D slab, conv
    Lm, hfilm, Tw, Tinf = 0.100, 500.0, 100.0, 20.0
    k = STEEL["k"]
    sp = []
    dx = 100.0 / 100          # nx=100 over W=100 mm -> dx = 1 mm
    for i in (0, 9, 24, 49, 74, 99):
        xmm = (i + 0.5) * dx
        T, q = slab_conv(xmm / 1000.0, Lm, k, hfilm, Tw, Tinf)
        sp.append({"x_mm": xmm, "y_mm": 10.0, "T": T})
    _, qref = slab_conv(0.0, Lm, k, hfilm, Tw, Tinf)
    ref["cases"].append({
        "id": "SLAB-CONV",
        "kind": "steady_field",
        "note": ("1-D slab 100 mm of carbon steel (k = 50 W/mK): left face "
                 "held at 100 C, right face convecting to 20 C with "
                 "h = 500 W/m2K, top and bottom adiabatic.  The exact "
                 "solution is linear, so a conservative cell-centred finite "
                 "volume scheme must reproduce it to solver round-off."),
        "model": slab_conv_model(),
        "points": sp,
        "dT": Tw - Tinf,
        "flux": {"left": qref * 0.020, "right": -qref * 0.020},   # H = 20 mm
        "flux_note": "W per metre of prism length; domain height 20 mm.",
    })

    # ------------------------------------------------- 1-D slab, generation
    q3 = 2.0e6
    sp = []
    for i in (0, 9, 24, 49, 74, 99):
        xmm = (i + 0.5) * 1.0
        sp.append({"x_mm": xmm, "y_mm": 10.0,
                   "T": slab_gen(xmm / 1000.0, 0.100, k, q3, 0.0, 0.0)})
    ref["cases"].append({
        "id": "SLAB-GEN",
        "kind": "steady_field",
        "note": ("1-D slab 100 mm of carbon steel with uniform volumetric "
                 "source 2 MW/m3, both faces held at 0 C, top and bottom "
                 "adiabatic.  T(x) = q x (L-x) / (2k), peak 50 C at "
                 "mid-plane."),
        "model": slab_gen_model(q3),
        "points": sp,
        "dT": q3 * 0.100 ** 2 / (8 * k),
        "fv_error": fv_slabgen_error(100, sp),
        "flux": {"source": q3 * 0.100 * 0.020,
                 "left": -q3 * 0.100 * 0.020 / 2,
                 "right": -q3 * 0.100 * 0.020 / 2},
    })

    # --------------------------------------------------------- annulus, log
    r1, r2 = 20.0, 80.0          # mm
    Ti_, To_ = 100.0, 0.0
    apts = [{"r_mm": r, "T": annulus_T(r, r1, r2, Ti_, To_)}
            for r in (30.0, 40.0, 50.0, 60.0, 70.0)]
    ref["cases"].append({
        "id": "ANNULUS-LOG",
        "kind": "annulus",
        "note": ("Concentric annulus r1 = 20 mm at 100 C, r2 = 80 mm at 0 C, "
                 "carbon steel.  T(r) = T2 + (T1-T2) ln(r2/r)/ln(r2/r1) "
                 "(Incropera eq. 3.28); Q' = 2 pi k (T1-T2)/ln(r2/r1)."),
        "models": {str(n): annulus_model(n) for n in (200, 350, 500)},
        "meshes": [200, 350, 500],
        "centre_mm": [120.0, 120.0],
        "r1_mm": r1, "r2_mm": r2, "T1": Ti_, "T2": To_,
        "points": apts,
        "dT": Ti_ - To_,
        "Qprime": annulus_Q(r1 / 1000.0, r2 / 1000.0, Ti_, To_, k),
        # A staircase Dirichlet boundary places the prescribed temperature on
        # cell centres, so each boundary radius carries a +-dx/2 uncertainty.
        # Propagating that through the log law bounds the field error by
        #   (dx/2) [ |dT/dr|(r1) + |dT/dr|(r2) ],  |dT/dr| = dT/(r ln(r2/r1)).
        "staircase_bound": {str(n): (0.5 * (240.0 / n)) * (Ti_ - To_) /
                            math.log(r2 / r1) * (1.0 / r1 + 1.0 / r2)
                            for n in (200, 350, 500)},
    })

    # ----------------------------------------------------- eccentric shape f
    D1, D2, ecc = 40.0, 160.0, 30.0     # mm
    cc, e1, e2, x0 = bipolar_eccentric(D1 / 2, D2 / 2, ecc)
    epts = []
    for xm, ym in ((120.0 - 60.0, 120.0), (120.0 - 40.0, 120.0),
                   (120.0 + 60.0, 120.0), (120.0 + 70.0, 120.0),
                   (120.0, 120.0 - 60.0), (120.0, 120.0 - 30.0),
                   (120.0, 120.0 + 40.0), (120.0 + 40.0, 120.0 + 40.0)):
        epts.append({"x_mm": xm, "y_mm": ym,
                     "T": bipolar_T(xm - 120.0, ym - 120.0, cc, x0, e1, e2,
                                    100.0, 0.0)})
    ref["cases"].append({
        "id": "SHAPE-ECCENTRIC",
        "kind": "shape_factor",
        "note": ("Eccentric cylinders, D1 = 40 mm at 100 C offset 30 mm from "
                 "the axis of D2 = 160 mm at 0 C, carbon steel.  The exact "
                 "field is linear in the bipolar coordinate eta = ln(r-/r+); "
                 "the shape factor is S/L = 2 pi/(eta1-eta2), which is "
                 "identically 2 pi / arccosh((D1^2+D2^2-4e^2)/(2 D1 D2)), "
                 "Incropera Table 4.1 case 7.  Q' = (S/L) k dT is recovered "
                 "from the tool's field by summing the discrete face fluxes "
                 "into the inner isothermal disc and extrapolated to dx -> 0 "
                 "in dx^1 (a staircase Dirichlet boundary is first order)."),
        "models": {str(n): eccentric_model(n) for n in (240, 360, 480)},
        "meshes": [240, 360, 480],
        "centre_mm": [120.0, 120.0],
        "r_inner_mm": D1 / 2, "e_mm": ecc,
        "points": epts,
        "SL": S_eccentric(D1, D2, ecc),
        "SL_bipolar": 2 * math.pi / (e1 - e2),
        "grad_inner_per_mm": max(
            abs(bipolar_T(*_off(ecc, 0.0, D1 / 2 + 1e-3, t), cc, x0, e1, e2, 100.0, 0.0) -
                bipolar_T(*_off(ecc, 0.0, D1 / 2 - 1e-3, t), cc, x0, e1, e2, 100.0, 0.0)) / 2e-3
            for t in np.linspace(0, 2 * math.pi, 361)),
        "grad_outer_per_mm": max(
            abs(bipolar_T(*_off(0.0, 0.0, D2 / 2 - 1e-3, t), cc, x0, e1, e2, 100.0, 0.0) -
                bipolar_T(*_off(0.0, 0.0, D2 / 2 - 3e-3, t), cc, x0, e1, e2, 100.0, 0.0)) / 2e-3
            for t in np.linspace(0, 2 * math.pi, 361)),
        "Qprime": S_eccentric(D1, D2, ecc) * k * 100.0,
        "dT": 100.0,
    })

    # ------------------------------------------------------ buried pipe row
    zb, Db, sb = 300.0, 80.0, 1200.0     # mm
    S_mfs, S_res = S_buried_row_mfs(zb, Db, sb)
    ref["cases"].append({
        "id": "SHAPE-BURIED-PIPE",
        "kind": "shape_factor",
        "note": ("Isothermal pipe D = 80 mm, axis 300 mm below an isothermal "
                 "surface.  A finite grid cannot be semi-infinite in x, so "
                 "the side walls are made adiabatic, which by mirror imaging "
                 "is exactly a periodic row of pipes at pitch s = 1200 mm; "
                 "2400 mm down the field is uniform to 1e-5 of the step, so "
                 "the adiabatic bottom is immaterial (verified numerically).  "
                 "Primary reference: method of fundamental solutions on the "
                 "true circular boundary (residual %.1e).  Cross-checks: the "
                 "closed-form line-source row factor "
                 "2 pi / ln[(2 s/(pi D)) sinh(2 pi z/s)], and the exact "
                 "single-pipe factor 2 pi / arccosh(2 z/D) (Incropera Table "
                 "4.1 case 1), which differs because of the row interaction, "
                 "not because either is wrong."
                 % S_res),
        "models": {str(n): buried_model(n) for n in (150, 225, 300)},
        "meshes": [150, 225, 300],
        "SL": S_mfs,
        "SL_mfs_residual": S_res,
        "SL_line_source_row": S_buried_row(zb, Db, sb),
        "SL_single_pipe_exact": S_buried_pipe(zb, Db),
        "crosscheck_rel": abs(S_buried_row(zb, Db, sb) - S_mfs) / S_mfs,
        "Qprime": S_mfs * k * 100.0,
        "dT": 100.0,
    })

    # ------------------------------------- curved convective surface (disc)
    qd, hd, Rd = 1.0e6, 833.3333333333334, 0.060
    disc_meshes = [120, 200, 400]
    ref["cases"].append({
        "id": "SURF-DISC",
        "kind": "curved_surface",
        "note": ("Carbon-steel disc R = 60 mm with a uniform volumetric source "
                 "1 MW/m3 and surface convection h = 833.33 W/m2K to 0 C, "
                 "steady.  Exact: Q' = q pi R^2, T(r) = q R/(2h) + "
                 "q (R^2-r^2)/(4k), so T(0) = 36 + 18 = 54 C.  This isolates "
                 "the treatment of a CURVED convective boundary on a square "
                 "grid: the staircase perimeter of a voxelised circle is 8R "
                 "against a true 2 pi R, i.e. 27 % too long, and must be "
                 "corrected.  The exact voxel area of each mesh is computed "
                 "here independently so the source term can be graded to "
                 "round-off."),
        "models": {str(n): disc_model(n, qd, hd) for n in disc_meshes},
        "meshes": disc_meshes,
        "centre_mm": [100.0, 100.0], "R_mm": 60.0,
        "q3": qd, "h": hd,
        "Qprime_exact": qd * math.pi * Rd * Rd,
        "T_centre_exact": qd * Rd / (2 * hd) + qd * Rd * Rd / (4 * k),
        "T_film_rise": qd * Rd / (2 * hd),
        # half-cell uncertainty in the effective radius of the voxelised disc,
        # propagated through both terms, plus 1 % on the corrected staircase
        # perimeter (the geometric resolution of a voxel convective surface)
        "T_bound": {str(n): 0.5 * (200.0 / n) / 1000.0 * (qd / (2 * hd) + qd * Rd / (2 * k))
                    + 0.01 * qd * Rd / (2 * hd) for n in disc_meshes},
        "voxel_area_m2": {str(n): voxel_disc_area(n, 200.0, 100.0, 100.0, 60.0)
                          for n in disc_meshes},
        "Q_voxel": {str(n): qd * voxel_disc_area(n, 200.0, 100.0, 100.0, 60.0)
                    for n in disc_meshes},
    })

    # -------------------------------------------------------- semi-infinite
    tEnd = 200.0
    tp = []
    for i in (4, 14, 29, 49, 79, 119, 159):
        xmm = (i + 0.5) * 1.0
        tp.append({"x_mm": xmm, "y_mm": 10.0,
                   "T": float(semi_infinite(xmm / 1000.0, tEnd, ALPHA_STEEL,
                                            100.0, 0.0))})
    ref["cases"].append({
        "id": "TRANS-SEMI-INFINITE",
        "kind": "transient_field",
        "note": ("Semi-infinite carbon-steel bar, initially 0 C, left face "
                 "stepped to 100 C at t = 0, read at t = 200 s.  "
                 "T = Ts + (Ti-Ts) erf(x/(2 sqrt(alpha t))), "
                 "alpha = 1.35540e-5 m2/s.  The 400 mm domain is semi-infinite "
                 "to within erfc(3.84) = 5e-8 of the temperature step."),
        "model": semiinf_model(),
        "tEnd": tEnd,
        "points": tp,
        "dT": 100.0,
    })

    # ------------------------------------------------------ plane wall, Bi=1
    Lw = 0.100
    Bi = 1.0
    hw = Bi * k / Lw
    tw = 400.0
    Fo = ALPHA_STEEL * tw / (Lw * Lw)
    wp = []
    for i in (0, 19, 39, 59, 79, 99):
        xmm = (i + 0.5) * 1.0
        xstar = xmm / 100.0
        wp.append({"x_mm": xmm, "y_mm": 10.0,
                   "T": 100.0 * wall_series(xstar, Fo, Bi)})
    ot, z1, C1 = wall_one_term(0.0, Fo, Bi)
    ref["cases"].append({
        "id": "TRANS-WALL",
        "kind": "transient_field",
        "note": ("Plane wall, half thickness L = 100 mm of carbon steel, "
                 "initially 100 C, adiabatic at x = 0 (symmetry plane), "
                 "convecting from x = L to 0 C with h = 500 W/m2K so Bi = 1.  "
                 "Read at t = 400 s, Fo = 0.5422.  Exact series "
                 "theta* = SUM C_n exp(-z_n^2 Fo) cos(z_n x*), "
                 "z_n tan z_n = Bi (200 terms)."),
        "model": wall_model(hw),
        "tEnd": tw,
        "points": wp,
        "dT": 100.0,
        "Bi": Bi, "Fo": Fo,
        "one_term": {"zeta1": z1, "C1": C1, "theta_centre": ot,
                     "series_centre": wall_series(0.0, Fo, Bi),
                     "note": ("Heisler one-term vs full series at the centre; "
                              "Fo > 0.2 so the one-term form is inside its "
                              "stated validity range.")},
    })

    # --------------------------------------------------- infinite cylinder
    R = 0.060                      # m
    Bic = 1.0
    hc = Bic * k / R
    tc = 150.0
    Foc = ALPHA_STEEL * tc / (R * R)
    cp = [{"r_mm": rm, "T": 100.0 * cyl_series(rm / 60.0, Foc, Bic)}
          for rm in (0.0, 10.0, 20.0, 30.0, 40.0, 50.0)]
    z1c = cyl_roots(Bic, 1)[0]
    C1c = (2.0 / z1c) * float(j1(z1c)) / (float(j0(z1c)) ** 2 + float(j1(z1c)) ** 2)
    ref["cases"].append({
        "id": "TRANS-CYLINDER",
        "kind": "transient_radial",
        "note": ("Infinite carbon-steel cylinder R = 60 mm, initially 100 C, "
                 "convecting to 0 C with h = 833.33 W/m2K so Bi = hR/k = 1.  "
                 "A 2-D Cartesian cross-section IS an infinite cylinder, so "
                 "this case is exactly representable.  Read at t = 150 s, "
                 "Fo = 0.5648.  Exact Bessel series "
                 "theta* = SUM C_n exp(-z_n^2 Fo) J0(z_n r*), "
                 "z_n J1(z_n)/J0(z_n) = Bi."),
        "models": {str(n): cylinder_model(n, hc) for n in (120, 200, 300)},
        "meshes": [120, 200, 300],
        "centre_mm": [100.0, 100.0],
        "R_mm": 60.0,
        "tEnd": tc,
        "points": cp,
        "dT": 100.0,
        "Bi": Bic, "Fo": Foc,
        "surface_area_sensitivity_K": abs(
            100 * cyl_series(0.0, Foc, Bic * 1.01) - 100 * cyl_series(0.0, Foc, Bic)),
        "radius_sensitivity_K": {
            str(n): abs(100 * cyl_series(0.0,
                        ALPHA_STEEL * tc / (R + 0.5 * 0.200 / n) ** 2,
                        hc * (R + 0.5 * 0.200 / n) / k)
                        - 100 * cyl_series(0.0, Foc, Bic))
            for n in (120, 200, 300)},
        "one_term": {"zeta1": z1c, "C1": C1c,
                     "theta_centre_one_term": C1c * math.exp(-z1c * z1c * Foc),
                     "series_centre": cyl_series(0.0, Foc, Bic)},
    })

    ref["not_representable"] = {
        "sphere": ("The tool solves the two-dimensional Cartesian heat "
                   "equation on a square grid.  It has no axisymmetric or "
                   "spherical mode, so the Heisler sphere solution cannot be "
                   "set up in it at all and is not benchmarked.  The infinite "
                   "cylinder, by contrast, IS a plane cross-section and is "
                   "benchmarked above."),
        "3d_shape_factors": ("The edge factor S = 0.54 D and the corner "
                             "factor S = 0.15 L (Incropera Table 4.1 cases 8 "
                             "and 9) are three-dimensional constructs - they "
                             "describe the extra conduction along an edge or "
                             "corner of a 3-D wall.  A plane 2-D model has no "
                             "such degree of freedom, so they are not "
                             "benchmarked.  The 2-D shape factors that ARE "
                             "expressible (buried pipe / row, eccentric "
                             "cylinders, cylindrical shell) are benchmarked "
                             "above.")
    }
    return ref


# ------------------------------------------------- project files for the tool
def _base(W, H, nx, bg=None, T0=20.0, Tinf=20.0, h=0.0):
    return {
        "W": W, "H": H, "nx": nx, "bgMat": bg,
        "glob": {"T0": T0, "Tinf": Tinf, "hConv": h, "epsSurf": 0.0,
                 "radiation": False},
        "edges": {"left": {"type": "adiabatic"}, "right": {"type": "adiabatic"},
                  "top": {"type": "adiabatic"}, "bottom": {"type": "adiabatic"}},
        "sim": {"tEnd": 600, "unit": 60, "nFrames": 100, "tol": 0.5},
        "shapes": [], "probes": [],
    }


def plate_model(nx):
    m = _base(200.0, 100.0, nx, bg=STEEL["idx"], T0=0.0, Tinf=0.0)
    m["edges"] = {"left": {"type": "fixed", "T": 0.0},
                  "right": {"type": "fixed", "T": 0.0},
                  "top": {"type": "fixed", "T": 0.0},
                  "bottom": {"type": "fixed", "T": 100.0}}
    return m


def slab_conv_model():
    m = _base(100.0, 20.0, 100, bg=STEEL["idx"], T0=20.0, Tinf=20.0)
    m["edges"] = {"left": {"type": "fixed", "T": 100.0},
                  "right": {"type": "convection", "T": 20.0, "h": 500.0, "eps": 0.0},
                  "top": {"type": "adiabatic"}, "bottom": {"type": "adiabatic"}}
    return m


def slab_gen_model(q3):
    m = _base(100.0, 20.0, 100, bg=None, T0=0.0, Tinf=0.0)
    m["edges"] = {"left": {"type": "fixed", "T": 0.0},
                  "right": {"type": "fixed", "T": 0.0},
                  "top": {"type": "adiabatic"}, "bottom": {"type": "adiabatic"}}
    m["shapes"] = [{"id": "gen", "type": "rect", "x": 0.0, "y": 0.0,
                    "w": 100.0, "h": 20.0, "mat": STEEL["idx"], "q": q3,
                    "fixed": False, "T0": 0.0}]
    return m


def annulus_model(nx):
    """Concentric annulus: outer fixed shell 0 C, active steel ring,
    inner fixed disc 100 C.  Domain 240 x 240 mm centred at 120,120."""
    m = _base(240.0, 240.0, nx, bg=None, T0=0.0, Tinf=0.0)
    c = 120.0
    m["shapes"] = [
        {"id": "outer", "type": "ellipse", "x": c - 110, "y": c - 110,
         "w": 220.0, "h": 220.0, "mat": STEEL["idx"], "fixed": True,
         "fixedTv": 0.0},
        {"id": "ring", "type": "ellipse", "x": c - 80, "y": c - 80,
         "w": 160.0, "h": 160.0, "mat": STEEL["idx"], "fixed": False,
         "T0": 0.0},
        {"id": "inner", "type": "ellipse", "x": c - 20, "y": c - 20,
         "w": 40.0, "h": 40.0, "mat": STEEL["idx"], "fixed": True,
         "fixedTv": 100.0},
    ]
    return m


def eccentric_model(nx):
    """Eccentric cylinders: outer D2 = 160 mm at 0 C, inner D1 = 40 mm at
    100 C offset 30 mm in x.  Domain 240 x 240."""
    m = _base(240.0, 240.0, nx, bg=None, T0=0.0, Tinf=0.0)
    c = 120.0
    m["shapes"] = [
        {"id": "outer", "type": "ellipse", "x": c - 110, "y": c - 110,
         "w": 220.0, "h": 220.0, "mat": STEEL["idx"], "fixed": True,
         "fixedTv": 0.0},
        {"id": "ring", "type": "ellipse", "x": c - 80, "y": c - 80,
         "w": 160.0, "h": 160.0, "mat": STEEL["idx"], "fixed": False,
         "T0": 0.0},
        {"id": "inner", "type": "ellipse", "x": c + 30 - 20, "y": c - 20,
         "w": 40.0, "h": 40.0, "mat": STEEL["idx"], "fixed": True,
         "fixedTv": 100.0},
    ]
    return m


def buried_model(nx):
    """Pipe D = 80 mm, axis 300 mm below the isothermal top surface (0 C).
    Domain 1200 x 2400 mm of carbon steel; sides and bottom adiabatic."""
    m = _base(1200.0, 2400.0, nx, bg=STEEL["idx"], T0=0.0, Tinf=0.0)
    m["edges"] = {"left": {"type": "adiabatic"}, "right": {"type": "adiabatic"},
                  "top": {"type": "fixed", "T": 0.0},
                  "bottom": {"type": "adiabatic"}}
    m["shapes"] = [{"id": "pipe", "type": "ellipse",
                    "x": 600.0 - 40.0, "y": 300.0 - 40.0, "w": 80.0, "h": 80.0,
                    "mat": STEEL["idx"], "fixed": True, "fixedTv": 100.0}]
    return m


def disc_model(nx, q3, h):
    m = _base(200.0, 200.0, nx, bg=None, T0=0.0, Tinf=0.0, h=h)
    m["shapes"] = [{"id": "disc", "type": "ellipse", "x": 40.0, "y": 40.0,
                    "w": 120.0, "h": 120.0, "mat": STEEL["idx"], "q": q3,
                    "fixed": False, "T0": 0.0}]
    return m


def voxel_disc_area(nx, W_mm, cx_mm, cy_mm, R_mm):
    """Exact area (m2 per unit depth) of the set of square cells whose CENTRE
    lies inside the circle - the tool's rasterisation rule."""
    d = W_mm / nx
    ny = int(round(W_mm / d))
    i = np.arange(nx) + 0.5
    j = np.arange(ny) + 0.5
    X, Y = np.meshgrid(i * d, j * d)
    n = int(((X - cx_mm) ** 2 + (Y - cy_mm) ** 2 <= R_mm * R_mm).sum())
    return n * (d / 1000.0) ** 2


def _off(ex, ey, r, t):
    """(x, y) offset from the outer-circle centre, on a circle of radius r
    centred at (ex, ey)."""
    return (ex + r * math.cos(t), ey + r * math.sin(t))


def semiinf_model():
    m = _base(400.0, 20.0, 400, bg=STEEL["idx"], T0=0.0, Tinf=0.0)
    m["edges"] = {"left": {"type": "fixed", "T": 100.0},
                  "right": {"type": "adiabatic"},
                  "top": {"type": "adiabatic"}, "bottom": {"type": "adiabatic"}}
    m["sim"] = {"tEnd": 200, "unit": 1, "nFrames": 40, "tol": 0.02}
    return m


def wall_model(h):
    m = _base(100.0, 20.0, 100, bg=STEEL["idx"], T0=100.0, Tinf=0.0)
    m["edges"] = {"left": {"type": "adiabatic"},
                  "right": {"type": "convection", "T": 0.0, "h": h, "eps": 0.0},
                  "top": {"type": "adiabatic"}, "bottom": {"type": "adiabatic"}}
    m["sim"] = {"tEnd": 400, "unit": 1, "nFrames": 40, "tol": 0.02}
    return m


def cylinder_model(nx, h):
    m = _base(200.0, 200.0, nx, bg=None, T0=100.0, Tinf=0.0, h=h)
    m["shapes"] = [{"id": "cyl", "type": "ellipse", "x": 40.0, "y": 40.0,
                    "w": 120.0, "h": 120.0, "mat": STEEL["idx"],
                    "fixed": False, "T0": 100.0}]
    m["sim"] = {"tEnd": 150, "unit": 1, "nFrames": 30, "tol": 0.02}
    return m


# ==========================================================================
# Independent second-order cell-centred finite-volume solver.
# Used ONLY to size the expected discretization error of a *correct* scheme
# on a given mesh, so the tolerance for the mesh-dependent cases can be taken
# from numerical analysis rather than from what makes the tool pass.  The tool
# is always graded against the analytic solution, never against this solver.
# ==========================================================================
import scipy.sparse as _sp
import scipy.sparse.linalg as _spl


def fv_steady(nx, ny, dx, kk, edges, q3=0.0):
    """Cartesian cell-centred FV, uniform square cells of side dx (m).
    edges: dict side -> ('fixed', T) | ('conv', h, Tinf) | ('adia',)
    sides 'L','R','T','B' with 'T' = row 0 (screen top).  Returns T[ny,nx]."""
    n = nx * ny
    A = _sp.lil_matrix((n, n))
    b = np.zeros(n)
    idx = lambda x, y: y * nx + x
    for y in range(ny):
        for x in range(nx):
            i = idx(x, y)
            d = 0.0
            for (xr, yr, side) in ((x - 1, y, 'L'), (x + 1, y, 'R'),
                                   (x, y - 1, 'T'), (x, y + 1, 'B')):
                if 0 <= xr < nx and 0 <= yr < ny:
                    d += kk
                    A[i, idx(xr, yr)] = -kk
                else:
                    e = edges[side]
                    if e[0] == 'fixed':
                        d += 2 * kk
                        b[i] += 2 * kk * e[1]
                    elif e[0] == 'conv':
                        U = dx / (dx / (2 * kk) + 1.0 / e[1])
                        d += U
                        b[i] += U * e[2]
            A[i, i] = d
            b[i] += q3 * dx * dx
    T = _spl.spsolve(A.tocsc(), b)
    return T.reshape(ny, nx)


def fv_plate_error(nx, pts, L=0.200, H=0.100):
    """Max |FV - Fourier| over pts (which carry their own cell indices)."""
    dx = L / nx
    ny = int(round(H / dx))
    T = fv_steady(nx, ny, dx, STEEL["k"],
                  {'L': ('fixed', 0.0), 'R': ('fixed', 0.0),
                   'T': ('fixed', 0.0), 'B': ('fixed', 100.0)})
    return max(abs(T[p["j"], p["i"]] - p["T"]) for p in pts)


def fv_slabgen_error(nx, pts, L=0.100, Hh=0.020, q3=2.0e6):
    dx = L / nx
    ny = int(round(Hh / dx))
    T = fv_steady(nx, ny, dx, STEEL["k"],
                  {'L': ('fixed', 0.0), 'R': ('fixed', 0.0),
                   'T': ('adia',), 'B': ('adia',)}, q3=q3)
    return max(abs(T[0, int(p["x_mm"] / (dx * 1000))] - p["T"]) for p in pts)


# ==========================================================================
# Query service: the Playwright driver hands over the exact cell-centre
# coordinates it read out of the tool and gets the analytic value back, so
# no closed form is ever duplicated in JavaScript.
#   python3 gen_heat2d.py --answer <in.json> <out.json>
#   in : {"case": "<id>", "pts": [[x_mm, y_mm], ...]}
#   out: {"T": [...]}
# ==========================================================================
def answer(case, pts):
    k = STEEL["k"]
    out = []
    if case in ("PLATE-FOURIER", "PLATE-MESH"):
        for x, y in pts:
            out.append(100.0 * plate_theta(x / 1000.0, y / 1000.0, 0.200, 0.100))
    elif case == "SLAB-CONV":
        for x, y in pts:
            out.append(slab_conv(x / 1000.0, 0.100, k, 500.0, 100.0, 20.0)[0])
    elif case == "SLAB-GEN":
        for x, y in pts:
            out.append(slab_gen(x / 1000.0, 0.100, k, 2.0e6, 0.0, 0.0))
    elif case == "ANNULUS-LOG":
        for x, y in pts:
            r = math.hypot(x - 120.0, y - 120.0)
            out.append(annulus_T(r, 20.0, 80.0, 100.0, 0.0))
    elif case == "SHAPE-ECCENTRIC":
        c, e1, e2, x0 = bipolar_eccentric(20.0, 80.0, 30.0)
        for x, y in pts:
            out.append(bipolar_T(x - 120.0, y - 120.0, c, x0, e1, e2, 100.0, 0.0))
    elif case == "SHAPE-BURIED-PIPE":
        raise SystemExit("SHAPE-BURIED-PIPE is graded on the shape factor only")
    elif case == "TRANS-SEMI-INFINITE":
        for x, y in pts:
            out.append(float(semi_infinite(x / 1000.0, 200.0, ALPHA_STEEL, 100.0, 0.0)))
    elif case == "TRANS-WALL":
        Fo = ALPHA_STEEL * 400.0 / 0.100 ** 2
        for x, y in pts:
            out.append(100.0 * wall_series(x / 100.0, Fo, 1.0))
    elif case == "TRANS-CYLINDER":
        Fo = ALPHA_STEEL * 150.0 / 0.060 ** 2
        for x, y in pts:
            r = math.hypot(x - 100.0, y - 100.0)
            out.append(100.0 * cyl_series(min(r / 60.0, 1.0), Fo, 1.0))
    else:
        raise SystemExit("unknown case " + case)
    return out


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--answer":
        q = json.load(open(sys.argv[2]))
        json.dump({"T": answer(q["case"], q["pts"])}, open(sys.argv[3], "w"))
        raise SystemExit(0)
    r = build()
    with open(_gp.ref('heat2d_ref.json'), "w") as f:
        json.dump(r, f, indent=1)
    print("cases:", [c["id"] for c in r["cases"]])
    print("alpha steel  =", ALPHA_STEEL)
    print("plate  T(100,50) =", plate_theta(0.100, 0.050, 0.200, 0.100) * 100)
    print("annulus Q'       =", annulus_Q(0.020, 0.080, 100, 0, 50))
    print("S/L eccentric    =", S_eccentric(40, 160, 30), 2*math.pi/(bipolar_eccentric(20,80,30)[1]-bipolar_eccentric(20,80,30)[2]))
    print("S/L buried row   =", S_buried_row(300, 80, 1200))
    print("S/L buried single=", S_buried_pipe(300, 80))
    print("wall  zeta1,C1   =", wall_one_term(0, 0.5422, 1.0)[1:])
    print("cyl   zeta1,C1   =", cyl_roots(1.0, 1)[0])


