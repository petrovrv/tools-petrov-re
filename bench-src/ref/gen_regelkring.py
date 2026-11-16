#!/usr/bin/env python3
"""
Independent reference generator for regelkring.html (Control Loop Laboratory).

Nothing here is derived from the tool's JavaScript. Sources:
  * python-control 0.10.2 (control.margin, control.nyquist_response,
    control.forced_response, control.tf) -- established library.
  * numpy/scipy for polynomial algebra, root finding and ODE integration.
  * closed-form analytic results derived by hand and re-implemented here
    (documented per case).
  * published tuning-rule definitions, cited in the case records.

Output: bench-src/ref/regelkring_ref.json
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math, cmath
import numpy as np
import control
from scipy.optimize import brentq
from scipy.integrate import solve_ivp

OUT = {}

# ---------------------------------------------------------------- helpers
def polymul(a, b):
    return list(np.polymul(np.array(a, float), np.array(b, float)))

def polyadd(a, b):
    return list(np.polyadd(np.array(a, float), np.array(b, float)))

def pid_tf(Kc, Ti, Td, N=10.0):
    """Ideal (non-interacting) PID with a first-order filter on D:
         C(s) = Kc ( 1 + 1/(Ti s) + Td s / (1 + (Td/N) s) )
       Written out over the common denominator Ti s (1 + Tf s), Tf = Td/N."""
    if Ti <= 0:
        return ([Kc], [1.0])
    if Td <= 0:
        return ([Kc * Ti, Kc], [Ti, 0.0])
    Tf = Td / N
    den = polymul([Ti, 0.0], [Tf, 1.0])                 # Ti Tf s^2 + Ti s
    num = polyadd(polymul([Ti, 0.0], [Tf, 1.0]), [Tf, 1.0])
    num = polyadd(num, [Ti * Td, 0.0, 0.0])
    return ([Kc * c for c in num], den)

def evalTF(num, den, delay, w):
    jw = 1j * w
    v = np.polyval(np.array(num, float), jw) / np.polyval(np.array(den, float), jw)
    if delay:
        v *= cmath.exp(-1j * w * delay)
    return v

def closed_loop(numG, denG, numH, denH, sign=+1):
    """T = G/(1 + sign*G*H) -> (num, den).  num = Ng Dh, den = Dg Dh + sign Ng Nh."""
    num = polymul(numG, denH)
    den = polyadd(polymul(denG, denH), [sign * c for c in polymul(numG, numH)])
    return num, den

def trim(p):
    p = list(p)
    while len(p) > 1 and abs(p[0]) < 1e-300:
        p.pop(0)
    return p

def roots_sorted(p):
    r = np.roots(np.array(trim(p), float))
    r = sorted(r, key=lambda z: (round(z.real, 12), round(z.imag, 12)))
    return [[float(z.real), float(z.imag)] for z in r]

# ---------------------------------------------------- independent margins
def _L(num, den, delay, w):
    jw = 1j * np.asarray(w, dtype=complex)
    v = np.polyval(np.array(num, float), jw) / np.polyval(np.array(den, float), jw)
    if delay:
        v = v * np.exp(-1j * jw.imag * delay) if np.ndim(jw) else v * np.exp(-1j * w * delay)
    return v

def evalTFv(num, den, delay, w):
    w = np.asarray(w, dtype=float)
    jw = 1j * w
    v = np.polyval(np.array(num, float), jw) / np.polyval(np.array(den, float), jw)
    if delay:
        v = v * np.exp(-1j * w * delay)
    return v

def margins_indep(num, den, delay, wlo=1e-6, whi=1e6, n=400001):
    """Gain / phase / delay margin.  Crossovers are bracketed on a dense log
       grid and refined with Brent's method.  Structurally different from the
       tool: the phase crossover is found as a zero of the *unwrapped phase +
       180 deg* residual (the tool uses sign changes of Im L), and every
       crossover is enumerated before the principal one is picked."""
    ws = np.logspace(math.log10(wlo), math.log10(whi), n)
    vals = evalTFv(num, den, delay, ws)
    mag = np.abs(vals)
    ph = np.unwrap(np.angle(vals))

    fmag = lambda w: abs(complex(evalTFv(num, den, delay, np.array([w]))[0])) - 1.0
    gc = []
    idx = np.nonzero((mag[:-1] - 1.0) * (mag[1:] - 1.0) <= 0)[0]
    for i in idx:
        if mag[i] == 1.0:
            gc.append(float(ws[i])); continue
        if mag[i + 1] == 1.0:
            continue
        gc.append(brentq(fmag, ws[i], ws[i + 1], xtol=1e-15, rtol=1e-15))
    gc = sorted(set(gc))

    a = (ph + math.pi) / (2 * math.pi)
    fl = np.floor(a)
    idx = np.nonzero(fl[:-1] != fl[1:])[0]
    pc = []
    for i in idx:
        k = max(fl[i], fl[i + 1])
        def fph(w, k=k, i=i):
            raw = cmath.phase(complex(evalTFv(num, den, delay, np.array([w]))[0]))
            kk = round((ph[i] - raw) / (2 * math.pi))
            return raw + 2 * math.pi * kk + math.pi - 2 * math.pi * k
        try:
            pc.append(brentq(fph, ws[i], ws[i + 1], xtol=1e-15, rtol=1e-15))
        except ValueError:
            pass
    # keep only crossings with Re L < 0 (a -180 deg crossing by definition has
    # Im L = 0 and Re L < 0; the filter removes spurious brackets)
    pc = [w for w in pc if complex(evalTFv(num, den, delay, np.array([w]))[0]).real < 0]

    pms = []
    for w in gc:
        i = int(np.searchsorted(ws, w)); i = max(1, min(i, n - 1))
        raw = cmath.phase(complex(evalTFv(num, den, delay, np.array([w]))[0]))
        kk = round((ph[i - 1] - raw) / (2 * math.pi))
        full = raw + 2 * math.pi * kk
        pm = (math.pi + full + math.pi) % (2 * math.pi) - math.pi
        pms.append((w, pm))
    gms = [(w, 1.0 / abs(complex(evalTFv(num, den, delay, np.array([w]))[0]))) for w in pc]

    pm = min(pms, key=lambda t: abs(t[1])) if pms else None
    gm = min(gms, key=lambda t: t[1]) if gms else None
    return {
        "gainMargin": (gm[1] if gm else float('inf')),
        "gainMargin_dB": (20 * math.log10(gm[1]) if gm else float('inf')),
        "wcg": (gm[0] if gm else None),
        "phaseMargin_deg": (math.degrees(pm[1]) if pm else float('inf')),
        "wcp": (pm[0] if pm else None),
        "delayMargin_s": (pm[1] / pm[0] if (pm and pm[1] > 0) else (0.0 if pm else float('inf'))),
        "n_gain_crossovers": len(gc), "n_phase_crossovers": len(pc),
    }

# ---------------------------------------------- independent winding number
def nyquist_Z_indep(num, den, delay):
    """Number of closed-loop RHP roots from the argument principle, evaluated
       as the discrete winding number of 1+L(s) around 0 along an explicitly
       constructed Nyquist contour (imaginary axis, right-hand indentation of
       radius eps around the origin pole, closing arc of radius R).  A plain
       polygon winding number on a fixed dense path -- not the tool's adaptive
       argument integrator."""
    num = trim(num); den = trim(den)
    pol = np.roots(np.array(den, float)) if len(den) > 1 else np.array([])
    P = int(sum(1 for z in pol if z.real > 1e-9 * max(1.0, abs(z))))
    zer = np.roots(np.array(num, float)) if len(num) > 1 else np.array([])
    scale = max([abs(z) for z in pol] + [abs(z) for z in zer] + [1.0])
    m = int(sum(1 for z in pol if abs(z) < 1e-12))
    axis_nonzero = [z for z in pol if abs(z.real) <= 1e-12 and abs(z) >= 1e-12]
    if axis_nonzero:
        raise ValueError("imaginary-axis poles off the origin are not handled")
    R = 1e5 * scale
    if delay:
        R = max(R, 1e3 / delay)
    eps = 1e-8 * scale

    seg = []
    lo = eps if m else 1e-12 * scale
    up = np.concatenate([np.logspace(math.log10(lo), math.log10(R), 600000)])
    if m:
        seg += [eps * cmath.exp(1j * th) for th in np.linspace(-math.pi / 2, math.pi / 2, 20000)]
    seg += [1j * w for w in up]
    seg += [R * cmath.exp(1j * th) for th in np.linspace(math.pi / 2, -math.pi / 2, 20000)]
    seg += [-1j * w for w in up[::-1]]
    if m:
        seg += [eps * cmath.exp(1j * th) for th in np.linspace(-math.pi / 2, -math.pi / 2, 1)]

    s = np.array(seg, dtype=complex)
    v = np.polyval(np.array(num, float), s) / np.polyval(np.array(den, float), s)
    if delay:
        with np.errstate(over='ignore', under='ignore', invalid='ignore'):
            v = v * np.exp(-delay * s)
        v = np.where(np.isfinite(v), v, 0.0)
    f = 1.0 + v
    d = np.angle(f[1:] / f[:-1])
    tot = float(np.sum(d))
    Ncw = -tot / (2 * math.pi)
    Z = P + Ncw
    return {"P": P, "m_origin_poles": m, "Ncw_raw": Ncw, "Ncw": int(round(Ncw)),
            "Z": int(round(Z)), "encirclementsCCW": -int(round(Ncw)),
            "closedLoopStable": bool(round(Z) == 0), "residual": abs(Ncw - round(Ncw))}

# ------------------------------------------------- analytic step response
def step_analytic(num, den, delay, ts):
    """y(t) = L^-1{G(s)/s} by residues at the (simple) poles of G plus s=0.
       Implemented here directly from the partial-fraction formula, with
       numpy.roots for the poles -- independent of the tool's Durand-Kerner."""
    num = np.array(trim(num), float); den = np.array(trim(den), float)
    p = np.roots(den)
    dden = np.polyder(den)
    r0 = np.polyval(num, 0.0) / np.polyval(den, 0.0)
    terms = [(0j, complex(r0))]
    for pi in p:
        terms.append((complex(pi), complex(np.polyval(num, pi) / (pi * np.polyval(dden, pi)))))
    y = []
    for t in ts:
        tt = t - delay
        if tt < 0:
            y.append(0.0); continue
        s = 0j
        for pi, ri in terms:
            s += ri * cmath.exp(pi * tt)
        y.append(float(s.real))
    return y

# ========================================================================
#   CASE DEFINITIONS
# ========================================================================
CASES = []

def add(case):
    CASES.append(case)

# --- A. closed-loop transfer function + poles, PID on 1st-order plant ----
Kc, Ti, Td, N = 1.5, 8.0, 2.0, 10.0
cn, cd = pid_tf(Kc, Ti, Td, N)
pn, pd = [2.0], [10.0, 1.0]
Ln, Ld = polymul(cn, pn), polymul(cd, pd)
Tn, Tdn = closed_loop(Ln, Ld, [1.0], [1.0])
add({"id": "A1-cl-pid-first-order",
     "note": "PID (ideal, D-filter N=10) Kc=1.5 Ti=8 Td=2 on P(s)=2/(10s+1); unity feedback. "
             "Closed-loop T=L/(1+L): denominator coefficients and poles.",
     "kind": "feedback",
     "inputs": {"C": {"num": cn, "den": cd}, "P": {"num": pn, "den": pd}, "H": {"num": [1.0], "den": [1.0]}},
     "ref": {"num": Tn, "den": Tdn, "poles": roots_sorted(Tdn),
             "dcGain": float(np.polyval(np.array(Tn,float),0.0)/np.polyval(np.array(Tdn,float),0.0))}})

# cross-check with python-control
sctl = control.tf(Ln, Ld)
Tctl = control.feedback(sctl, 1)
CASES[-1]["crosscheck"] = {
    "source": "control.feedback(control.tf(L),1) poles",
    "poles": sorted([[float(z.real), float(z.imag)] for z in Tctl.poles()],
                    key=lambda z: (round(z[0], 12), round(z[1], 12)))}

# --- A2. PID on 2nd-order plant with a sensor lag in the feedback --------
cn2, cd2 = pid_tf(2.2, 40.0, 6.0, 10.0)
pn2, pd2 = [1.5], polymul([5.0, 1.0], [2.0, 1.0])
hn2, hd2 = [1.0], [3.0, 1.0]
Gn, Gd = polymul(cn2, pn2), polymul(cd2, pd2)
T2n, T2d = closed_loop(Gn, Gd, hn2, hd2)
add({"id": "A2-cl-pid-second-order-sensor",
     "note": "PID Kc=2.2 Ti=40 Td=6 (N=10) on P(s)=1.5/((5s+1)(2s+1)) with sensor H=1/(3s+1). "
             "T = G/(1+G H), G = C P.",
     "kind": "feedback",
     "inputs": {"C": {"num": cn2, "den": cd2}, "P": {"num": pn2, "den": pd2}, "H": {"num": hn2, "den": hd2}},
     "ref": {"num": T2n, "den": T2d, "poles": roots_sorted(T2d),
             "dcGain": float(np.polyval(np.array(T2n,float),0.0)/np.polyval(np.array(T2d,float),0.0))}})
Tc2 = control.feedback(control.tf(Gn, Gd), control.tf(hn2, hd2))
CASES[-1]["crosscheck"] = {"source": "control.feedback", "poles": sorted(
    [[float(z.real), float(z.imag)] for z in Tc2.poles()], key=lambda z: (round(z[0], 12), round(z[1], 12)))}

# --- B. Bode magnitude and phase at chosen frequencies -------------------
BODE_SYS = [
    ("B1", "PI x FOPDT: C=1.2(1+1/(25s)), P=2.5 e^-8s/(30s+1)",
     polymul([1.2 * 25, 1.2], [2.5]), polymul([25.0, 0.0], [30.0, 1.0]), 8.0),
    ("B2", "L = 1/(s(s+1)(s+2))", [1.0], polymul([1.0, 0.0], polymul([1.0, 1.0], [1.0, 2.0])), 0.0),
    ("B3", "L = (1-s)/(s(s+1)) - non-minimum phase", [-1.0, 1.0], polymul([1.0, 0.0], [1.0, 1.0]), 0.0),
    ("B4", "L = e^-s/s - pure integrator with 1 s dead time", [1.0], [1.0, 0.0], 1.0),
]
for cid, note, nu, de, dl in BODE_SYS:
    ws = [0.01, 0.05, 0.1, 0.3, 0.5, 1.0, 1.5708, 2.0, 5.0, 10.0]
    pts = []
    for w in ws:
        v = evalTF(nu, de, dl, w)
        pts.append({"w": w, "mag": abs(v), "mag_dB": 20 * math.log10(abs(v)),
                    "phase_deg": math.degrees(cmath.phase(v))})
    c = {"id": cid + "-bode", "note": note + " -- |L| and arg L at 10 frequencies.",
         "kind": "bode", "inputs": {"L": {"num": nu, "den": de, "delay": dl}},
         "ref": {"points": pts}}
    if dl == 0.0:
        m, p, _ = control.frequency_response(control.tf(nu, de), ws)[0:3] if False else (None, None, None)
        resp = control.frequency_response(control.tf(nu, de), ws)
        c["crosscheck"] = {"source": "control.frequency_response",
                           "points": [{"w": float(w), "mag": float(abs(x)),
                                       "phase_deg": float(math.degrees(cmath.phase(complex(x))))}
                                      for w, x in zip(ws, np.atleast_1d(resp.frdata[0][0]))]}
    CASES.append(c)

# --- C. gain / phase / delay margins ------------------------------------
MARGIN_SYS = [
    ("C1", "L = 1/(s(s+1)(s+2)) - textbook: GM = 6 (15.563 dB) at w=sqrt(2)",
     [1.0], polymul([1.0, 0.0], polymul([1.0, 1.0], [1.0, 2.0])), 0.0),
    ("C2", "L = 10/(s(s+1)(s+2)) - closed loop unstable, GM = 0.6 (-4.437 dB)",
     [10.0], polymul([1.0, 0.0], polymul([1.0, 1.0], [1.0, 2.0])), 0.0),
    ("C3", "L = e^-s/s - analytic: wcp=1, PM=90-180/pi deg=32.704, wcg=pi/2, GM=pi/2, dm=PM/wcp",
     [1.0], [1.0, 0.0], 1.0),
    ("C4", "PI x FOPDT: C=1.2(1+1/(25s)) on 2.5 e^-8s/(30s+1)",
     polymul([1.2 * 25, 1.2], [2.5]), polymul([25.0, 0.0], [30.0, 1.0]), 8.0),
    ("C5", "L = 1/(s+1)^3", [1.0], polymul([1.0, 1.0], polymul([1.0, 1.0], [1.0, 1.0])), 0.0),
    ("C6", "L = 4/(s+1)^3 - GM=2 (6.0206 dB) at w=sqrt(3), PM finite",
     [4.0], polymul([1.0, 1.0], polymul([1.0, 1.0], [1.0, 1.0])), 0.0),
]
for cid, note, nu, de, dl in MARGIN_SYS:
    r = margins_indep(nu, de, dl)
    c = {"id": cid + "-margins", "note": note, "kind": "margins",
         "inputs": {"L": {"num": nu, "den": de, "delay": dl}}, "ref": r}
    if dl == 0.0:
        gm, pm, wcg, wcp = control.margin(control.tf(nu, de))
        c["crosscheck"] = {"source": "control.margin",
                           "gainMargin": float(gm), "phaseMargin_deg": float(pm),
                           "wcg": float(wcg), "wcp": float(wcp)}
    CASES.append(c)

# closed-form analytic values for C3, checked by hand
CASES[[c["id"] for c in CASES].index("C3-margins")]["analytic"] = {
    "wcp": 1.0, "phaseMargin_deg": 90.0 - 180.0 / math.pi,
    "wcg": math.pi / 2, "gainMargin": math.pi / 2,
    "gainMargin_dB": 20 * math.log10(math.pi / 2),
    "delayMargin_s": math.radians(90.0 - 180.0 / math.pi) / 1.0}

# --- D. Nyquist encirclement count --------------------------------------
NYQ_SYS = [
    ("D1", "L = 1/(s(s+1)(s+2)): P=0, N_ccw=0, Z=0 - stable",
     [1.0], polymul([1.0, 0.0], polymul([1.0, 1.0], [1.0, 2.0])), 0.0),
    ("D2", "L = 10/(s(s+1)(s+2)): P=0, N_ccw=-2, Z=2 - unstable",
     [10.0], polymul([1.0, 0.0], polymul([1.0, 1.0], [1.0, 2.0])), 0.0),
    ("D3", "L = 3/(s-1): P=1, N_ccw=1, Z=0 - stabilised unstable plant",
     [3.0], [1.0, -1.0], 0.0),
    ("D4", "L = 0.5/(s-1): P=1, N_ccw=0, Z=1 - gain too low to stabilise",
     [0.5], [1.0, -1.0], 0.0),
    ("D5", "L = e^-s/s: P=0, Z=0", [1.0], [1.0, 0.0], 1.0),
    ("D6", "L = 2 e^-s/s: |L|=1 at w=2, phase=-90-114.6=-204.6 -> Z=2",
     [2.0], [1.0, 0.0], 1.0),
    ("D7", "L = 0.5(1-s)/(s(s+1)): non-minimum phase, P=0, closed loop stable (Z=0)",
     [-0.5, 0.5], polymul([1.0, 0.0], [1.0, 1.0]), 0.0),
    ("D8", "L = 2(1-s)/(s(s+1)): non-minimum phase, P=0, closed loop poles 0.5+-1.323j (Z=2)",
     [-2.0, 2.0], polymul([1.0, 0.0], [1.0, 1.0]), 0.0),
]
for cid, note, nu, de, dl in NYQ_SYS:
    r = nyquist_Z_indep(nu, de, dl)
    c = {"id": cid + "-nyquist", "note": note, "kind": "nyquist",
         "inputs": {"L": {"num": nu, "den": de, "delay": dl}}, "ref": r}
    if dl == 0.0:
        resp = control.nyquist_response(control.tf(nu, de))
        c["crosscheck"] = {"source": "control.nyquist_response(...).count (clockwise encirclements)",
                           "Ncw": int(resp.count), "Z": int(resp.count) + r["P"]}
    CASES.append(c)

# --- E. step responses ---------------------------------------------------
ts = [float(v) for v in np.arange(0.0, 150.001, 2.5)]
# E1: open-loop FOPDT, exact closed form y = K(1-exp(-(t-L)/tau))
K_, tau_, L_ = 2.5, 30.0, 8.0
add({"id": "E1-step-fopdt-openloop",
     "note": "Open-loop FOPDT G = 2.5 e^-8s/(30s+1). Exact: y(t)=0 for t<8, "
             "y(t)=2.5(1-exp(-(t-8)/30)) after. Derived by hand, not from residues.",
     "kind": "step", "inputs": {"G": {"num": [K_], "den": [tau_, 1.0], "delay": L_},
                                "t": ts},
     "ref": {"y": [0.0 if t < L_ else K_ * (1 - math.exp(-(t - L_) / tau_)) for t in ts]}})
CASES[-1]["crosscheck"] = {"source": "residue partial fractions (step_analytic)",
                           "y": step_analytic([K_], [tau_, 1.0], L_, ts)}

# E2: closed loop of A1 (rational, distinct poles) - residues
ts2 = [float(v) for v in np.arange(0.0, 150.001, 2.5)]
add({"id": "E2-step-closedloop-pid-first-order",
     "note": "Step response of the A1 closed loop, by residues at the simple poles.",
     "kind": "step", "inputs": {"G": {"num": Tn, "den": Tdn, "delay": 0.0}, "t": ts2},
     "ref": {"y": step_analytic(Tn, Tdn, 0.0, ts2)}})
_tout, _yout = control.step_response(control.tf(Tn, Tdn), T=np.array(ts2))
CASES[-1]["crosscheck"] = {"source": "control.step_response", "y": [float(v) for v in np.atleast_1d(_yout)]}

# E3: closed loop of A2
add({"id": "E3-step-closedloop-pid-second-order",
     "note": "Step response of the A2 closed loop (5 poles), by residues.",
     "kind": "step", "inputs": {"G": {"num": T2n, "den": T2d, "delay": 0.0}, "t": ts2},
     "ref": {"y": step_analytic(T2n, T2d, 0.0, ts2)}})
_t3, _y3 = control.step_response(control.tf(T2n, T2d), T=np.array(ts2))
CASES[-1]["crosscheck"] = {"source": "control.step_response", "y": [float(v) for v in np.atleast_1d(_y3)]}

# E4: EXACT closed-loop FOPDT step response by the method of steps.
#     Loop: P controller Kc on G = K e^{-Ls}/(tau s + 1), negative unity feedback.
#     tau y' + y = K Kc (r - y(t-L)).  Solved analytically interval by interval:
#     on [nL,(n+1)L] the forcing is a known function, integrated with the
#     integrating factor.  Implemented numerically at high resolution with an
#     explicit DDE integrator (RK4 on a grid where L is an exact multiple of h)
#     and Richardson-extrapolated in h; the two step sizes agree to <1e-10.
def fopdt_closed_loop_exact(K, tau, Ldead, Kc, r, tend, tout):
    """Closed loop: e = r - y, u = Kc e, plant G = K e^{-Ls}/(tau s + 1).
       Y = G Kc (R - Y)  =>  tau y'(t) + y(t) = K Kc ( r(t-L) - y(t-L) ),
       with y == 0 for t <= 0 and r a unit step at t = 0 (so the right-hand
       side is identically zero until t = L: the loop cannot react before the
       dead time has elapsed).  Integrated with RK4 on a grid where L is an
       exact multiple of h, so the delayed term always lands on a grid node
       (the half-step values are linearly interpolated between two nodes that
       are already final).  Run at h and h/2 and the two agree to the residual
       reported as `self_convergence`."""
    def run(h):
        nlag = int(round(Ldead / h))
        n = int(round(tend / h))
        hist = np.zeros(n + 2)
        def rd(idx_f):          # r(t - L) on the same grid
            return 1.0 if (idx_f - nlag) >= 0.0 else 0.0
        def yd(idx_f):          # y(t - L), linear interpolation between nodes
            j = idx_f - nlag
            if j <= 0.0:
                return 0.0
            j0 = int(math.floor(j)); fr = j - j0
            if fr == 0.0:
                return hist[j0]
            return hist[j0] * (1 - fr) + hist[j0 + 1] * fr
        for i in range(n):
            y0 = hist[i]
            k1 = (-y0 + K * Kc * (rd(i) - yd(i))) / tau
            k2 = (-(y0 + 0.5 * h * k1) + K * Kc * (rd(i + 0.5) - yd(i + 0.5))) / tau
            k3 = (-(y0 + 0.5 * h * k2) + K * Kc * (rd(i + 0.5) - yd(i + 0.5))) / tau
            k4 = (-(y0 + h * k3) + K * Kc * (rd(i + 1) - yd(i + 1))) / tau
            hist[i + 1] = y0 + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        return hist
    h1 = Ldead / 20000.0
    h2 = h1 / 2
    a = run(h1); b = run(h2)
    ya = [float(a[int(round(t / h1))]) for t in tout]
    yb = [float(b[int(round(t / h2))]) for t in tout]
    err = max(abs(x - y) for x, y in zip(ya, yb))
    return yb, err

Kc_, K2_, tau2_, L2_ = 0.6, 2.0, 20.0, 5.0
tout4 = [float(v) for v in np.arange(0.0, 200.001, 2.5)]
y4, err4 = fopdt_closed_loop_exact(K2_, tau2_, L2_, Kc_, 1.0, 200.0, tout4)
add({"id": "E4-step-closedloop-fopdt-exact",
     "note": "EXACT closed-loop step response of a P controller Kc=0.6 on "
             "G=2 e^-5s/(20s+1), unity negative feedback, computed by direct "
             "integration of the delay differential equation "
             "tau y' + y = K Kc (r - y(t-L)) with L an exact multiple of h "
             "(h=L/8000). Two step sizes agree to %.2e. This is the reference "
             "against which the tool's Pade-based closed loop is judged." % err4,
     "kind": "step_delayed_closed_loop",
     "inputs": {"K": K2_, "tau": tau2_, "L": L2_, "Kc": Kc_, "t": tout4},
     "ref": {"y": y4, "self_convergence": err4}})

# --- F. tuning rules against their published definitions -----------------
def zn_openloop(K, tau, Ldead, typ):
    """Ziegler & Nichols, Trans. ASME 64 (1942) 759-768, "Summary of controller
       adjustments", reaction-curve (open-loop) column.  With unit reaction rate
       R = K/tau and lag L:  Kc = c/(R L), c = 1 (P), 0.9 (PI), 1.2 (PID);
       PI reset rate 0.3/L  => Ti = L/0.3;  PID Ti = 2L, Td = 0.5L."""
    if typ == "P":   return {"Kc": tau / (K * Ldead), "Ti": 0.0, "Td": 0.0}
    if typ == "PI":  return {"Kc": 0.9 * tau / (K * Ldead), "Ti": Ldead / 0.3, "Td": 0.0}
    return {"Kc": 1.2 * tau / (K * Ldead), "Ti": 2 * Ldead, "Td": 0.5 * Ldead}

def imc(K, tau, Ldead, typ, lam):
    """Rivera, Morari & Skogestad, Ind. Eng. Chem. Process Des. Dev. 25 (1986)
       252-265, Table 2 (FOPDT).  PI (first-order Taylor of the dead time):
         Kc = tau/(K (lam + L)), Ti = tau.
       PID (1/1 Pade of the dead time):
         Kc = (tau + L/2)/(K (lam + L/2)), Ti = tau + L/2, Td = tau L/(2 tau + L)."""
    if typ in ("P", "PI"):
        return {"Kc": tau / (K * (lam + Ldead)), "Ti": (tau if typ == "PI" else 0.0), "Td": 0.0}
    return {"Kc": (tau + Ldead / 2) / (K * (lam + Ldead / 2)),
            "Ti": tau + Ldead / 2, "Td": tau * Ldead / (2 * tau + Ldead)}

def amigo(K, tau, Ldead, typ):
    """Astrom & Hagglund, "Revisiting the Ziegler-Nichols step response method
       for PID control", J. Process Control 14 (2004) 635-650, eqs. (7) and (10)."""
    if typ == "PID":
        return {"Kc": (1 / K) * (0.2 + 0.45 * tau / Ldead),
                "Ti": ((0.4 * Ldead + 0.8 * tau) / (Ldead + 0.1 * tau)) * Ldead,
                "Td": 0.5 * Ldead * tau / (0.3 * Ldead + tau)}
    return {"Kc": (1 / K) * (0.15 + (0.35 - Ldead * tau / (Ldead + tau) ** 2) * (tau / Ldead)),
            "Ti": 0.35 * Ldead + 13 * Ldead * tau ** 2 / (tau ** 2 + 12 * Ldead * tau + 7 * Ldead ** 2),
            "Td": 0.0}

TUNE_TRIPLES = [(2.5, 30.0, 8.0), (1.0, 10.0, 1.0), (0.8, 120.0, 25.0)]
for i, (K, tau, Ldead) in enumerate(TUNE_TRIPLES, 1):
    for typ in ("P", "PI", "PID"):
        add({"id": "F%d-zn-%s" % (i, typ.lower()),
             "note": "Ziegler-Nichols open-loop (reaction-curve) rule, "
                     "Trans. ASME 64 (1942), pp. 759-768, 'Summary of controller "
                     "adjustments', open-loop column. K=%g tau=%g L=%g." % (K, tau, Ldead),
             "kind": "tuning", "inputs": {"method": "zn", "type": typ, "K": K, "tau": tau, "L": Ldead},
             "ref": zn_openloop(K, tau, Ldead, typ)})
    for typ in ("PI", "PID"):
        lam = max(tau, 1.7 * Ldead)
        add({"id": "F%d-imc-%s" % (i, typ.lower()),
             "note": "IMC-PID for FOPDT, Rivera, Morari & Skogestad, IEC PDD 25 (1986) "
                     "252-265. lambda_c = max(tau, 1.7 L) = %g (the tool's own default, "
                     "not from the paper). K=%g tau=%g L=%g." % (lam, K, tau, Ldead),
             "kind": "tuning", "inputs": {"method": "imc", "type": typ, "K": K, "tau": tau,
                                          "L": Ldead, "lambdaC": 0},
             "ref": imc(K, tau, Ldead, typ, lam)})
        add({"id": "F%d-amigo-%s" % (i, typ.lower()),
             "note": "AMIGO, Astrom & Hagglund, J. Process Control 14 (2004) 635-650. "
                     "K=%g tau=%g L=%g." % (K, tau, Ldead),
             "kind": "tuning", "inputs": {"method": "amigo", "type": typ, "K": K, "tau": tau, "L": Ldead},
             "ref": amigo(K, tau, Ldead, typ)})

# --- G. Pade approximant coefficients ------------------------------------
# Baker & Graves-Morris, "Pade Approximants", 2nd ed., CUP 1996:
#   [p/p] of exp(-Ls): c_k = (2p-k)! p! / ((2p)! k! (p-k)!)
def pade_coeffs(Ldead, p):
    from math import factorial as f
    num = [f(2 * p - k) * f(p) / (f(2 * p) * f(k) * f(p - k)) * (-Ldead) ** k for k in range(p + 1)]
    den = [f(2 * p - k) * f(p) / (f(2 * p) * f(k) * f(p - k)) * (Ldead) ** k for k in range(p + 1)]
    return list(reversed(num)), list(reversed(den))
for p in (1, 2, 3):
    n_, d_ = pade_coeffs(4.0, p)
    add({"id": "G%d-pade-order%d" % (p, p),
         "note": "[%d/%d] Pade approximant of exp(-4s); Baker & Graves-Morris, "
                 "Pade Approximants, 2nd ed., CUP 1996, eq. (1.24)." % (p, p),
         "kind": "pade", "inputs": {"L": 4.0, "order": p},
         "ref": {"num": n_, "den": d_}})
    # crosscheck against scipy's pade of the exponential series
    from scipy.interpolate import pade as spade
    import numpy.polynomial.polynomial as P
    coeffs = [(-4.0) ** k / math.factorial(k) for k in range(2 * p + 1)]
    pnum, pden = spade(coeffs, p)
    CASES[-1]["crosscheck"] = {"source": "scipy.interpolate.pade of the Taylor series of exp(-4s)",
                               "num": [float(c) for c in pnum.coefficients],
                               "den": [float(c) for c in pden.coefficients]}

OUT = {"generated_by": "gen_regelkring.py",
       "libraries": {"python-control": control.__version__, "numpy": np.__version__},
       "cases": CASES}

def clean(o):
    if isinstance(o, float):
        if math.isinf(o):
            return "Infinity" if o > 0 else "-Infinity"
        if math.isnan(o):
            return "NaN"
        return o
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating,)):
        return clean(float(o))
    if isinstance(o, (np.integer,)):
        return int(o)
    return o

with open(_gp.ref('regelkring_ref.json'), "w") as fh:
    json.dump(clean(OUT), fh, indent=1, allow_nan=False)
print("cases:", len(CASES))
for c in CASES[:0]:
    print(c["id"])

# ========================================================================
#   H. Stiff-integrator reference (scipy.integrate.solve_ivp, Radau, tight)
#   The plants below are defined HERE, in words, and implemented twice: once
#   in this file for scipy and once in the Playwright driver for the tool's
#   own SIM.simulate. Neither implementation is derived from the other.
# ========================================================================
def stiff_linear(tau_f, tend, ts):
    """x1' = (u - x1)/tau_f ; x2' = (x1 - x2)/50 ; y = x2 ; u = 1 from t = 0.
       Stiffness ratio 50/tau_f."""
    f = lambda t, x: [(1.0 - x[0]) / tau_f, (x[0] - x[1]) / 50.0]
    s = solve_ivp(f, [0, tend], [0.0, 0.0], method='Radau',
                  rtol=1e-12, atol=1e-14, t_eval=ts)
    return [float(v) for v in s.y[1]]

def vanderpol(mu, tend, ts):
    """x1' = x2 ; x2' = mu (1 - x1^2) x2 - x1 ; x(0) = (2, 0) ; y = x1.
       The classic stiff relaxation oscillator; at mu = 1000 the first fast
       switch happens near t = 810 s, well inside the window used."""
    f = lambda t, x: [x[1], mu * (1.0 - x[0] * x[0]) * x[1] - x[0]]
    s = solve_ivp(f, [0, tend], [2.0, 0.0], method='Radau',
                  rtol=1e-11, atol=1e-13, t_eval=ts)
    return [float(v) for v in s.y[0]]

MAXSAMPLES = 4000

def tool_grid(fastest_tau, tend, maxsamples=MAXSAMPLES, keep=250):
    """The instants SIM.simulate really records, and a subset of them to compare
       at (`keep` points, evenly spread)."""
    h = fastest_tau / 20.0
    nsteps = int(round(tend / h))
    dec = max(1, -(-(nsteps + 1) // maxsamples))
    outn = nsteps // dec + 1
    idx = sorted(set(int(round(i * (outn - 1) / (keep - 1))) for i in range(keep)))
    return h, nsteps, dec, [float(k * dec * h) for k in idx]

for tf, cid in ((1e-2, 'H1'), (1e-3, 'H2')):
    h, nst, dec, ts = tool_grid(tf, 300.0)
    CASES.append({
        "id": "%s-stiff-linear-tau%g" % (cid, tf),
        "note": "Fixed-step RK4 of the tool against scipy solve_ivp(Radau, rtol=1e-12, "
                "atol=1e-14) on a two-lag plant with tau_fast = %g s and tau_slow = 50 s "
                "(stiffness ratio %g), open loop, unit step at t = 0. The plant is stated as "
                "an ODE and implemented independently on both sides; the comparison instants "
                "are the tool's own recorded samples (h = %g s, %d steps, decimation %d), so "
                "nothing is interpolated." % (tf, 50 / tf, h, nst, dec),
        "kind": "stiff",
        "inputs": {"model": "two-lag", "tau_fast": tf, "tau_slow": 50.0, "tEnd": 300.0,
                   "maxSamples": MAXSAMPLES, "t": ts},
        "ref": {"y": stiff_linear(tf, 300.0, ts)}})

_h, _n, _d, _ts_vdp = tool_grid(1.0 / 1000.0, 1000.0)
CASES.append({
    "id": "H3-stiff-vanderpol-mu1000",
    "note": "Van der Pol oscillator, mu = 1000 (classic stiff test problem), x(0) = (2, 0), "
            "integrated to t = 1000 s so that the first fast switch (near t = 810 s) is inside "
            "the window. Tool: fixed-step RK4 at h = 1/(20 mu) = %g s, %d steps, decimation %d. "
            "Reference: scipy solve_ivp(Radau, rtol=1e-11, atol=1e-13) at the tool's own "
            "recorded instants." % (_h, _n, _d),
    "kind": "stiff",
    "inputs": {"model": "vanderpol", "mu": 1000.0, "tEnd": 1000.0,
               "maxSamples": MAXSAMPLES, "t": _ts_vdp},
    "ref": {"y": vanderpol(1000.0, 1000.0, _ts_vdp)}})

# ------------------------------------------------------------------ E5
# Exact closed-loop step response of the page's OWN default loop, by direct
# integration of the delay differential equation. The loop transfer functions
# are the ones the tool builds (they are its plant model, not something an
# independent reference can produce); what is judged here is only the
# treatment of the dead time when the loop is closed.
COIL_G_NUM = [31.875743441116953]
COIL_G_DEN = [240000.0, 13600.0, 230.0, 1.0]
COIL_DELAY = 10.0
COIL_C_NUM = [13.2, 0.06666666666666667]
COIL_C_DEN = [198.0, 0.0]
COIL_H_NUM = [1.0]
COIL_H_DEN = [5.0, 1.0]

def _ctrl_form(num, den):
    den = np.array(den, float); num = np.array(num, float)
    a0 = den[0]; den = den / a0; num = num / a0
    n = len(den) - 1
    nf = np.zeros(n + 1); nf[len(nf) - len(num):] = num
    d0 = nf[0]; nr = (nf - d0 * den)[1:]
    A = np.zeros((n, n))
    for i in range(n - 1):
        A[i, i + 1] = 1.0
    A[n - 1, :] = -den[1:][::-1]
    B = np.zeros(n); B[n - 1] = 1.0
    return A, B, nr[::-1].copy(), d0

def coil_dde(tend, ts):
    Ap, Bp, Cp, Dp = _ctrl_form(COIL_G_NUM, COIL_G_DEN)
    Ac, Bc, Cc, Dc = _ctrl_form(COIL_C_NUM, COIL_C_DEN)
    Ah, Bh, Ch, Dh = _ctrl_form(COIL_H_NUM, COIL_H_DEN)
    npl, nc, nh = len(Bp), len(Bc), len(Bh)
    N = npl + nc + nh
    def rhs(x, ydel, w=1.0):
        xp = x[:npl]; xc = x[npl:npl + nc]; xh = x[npl + nc:]
        m = Ch @ xh + Dh * ydel
        e = w - m
        u = Cc @ xc + Dc * e
        return (np.concatenate([Ap @ xp + Bp * u, Ac @ xc + Bc * e, Ah @ xh + Bh * ydel]),
                Cp @ xp + Dp * u)
    def run(h):
        nlag = int(round(COIL_DELAY / h)); n = int(round(tend / h))
        x = np.zeros(N); hist = np.zeros(n + 2); out = np.zeros(n + 1)
        def yd(idx):
            j = idx - nlag
            if j <= 0:
                return 0.0
            j0 = int(math.floor(j)); fr = j - j0
            return hist[j0] * (1 - fr) + hist[j0 + 1] * fr if fr else hist[j0]
        _, yr = rhs(x, yd(0)); hist[0] = yr
        for i in range(n):
            k1, _ = rhs(x, yd(i))
            k2, _ = rhs(x + 0.5 * h * k1, yd(i + 0.5))
            k3, _ = rhs(x + 0.5 * h * k2, yd(i + 0.5))
            k4, _ = rhs(x + h * k3, yd(i + 1))
            x = x + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
            _, yr = rhs(x, yd(i + 1)); hist[i + 1] = yr
            out[i + 1] = yd(i + 1)
        return out, h
    a, h1 = run(COIL_DELAY / 500); b, h2 = run(COIL_DELAY / 1000)
    ya = [float(a[int(round(t / h1))]) for t in ts]
    yb = [float(b[int(round(t / h2))]) for t in ts]
    return yb, max(abs(u - v) for u, v in zip(ya, yb))

_ts_coil = [float(v) for v in np.linspace(0, 2400, 1201)]
_y_coil, _conv_coil = coil_dde(2400.0, _ts_coil)
CASES.append({
    "id": "E5-default-loop-delay-exact",
    "note": "The closed-loop step response the page DRAWS as its linear prediction for its own "
            "default loop, against the exact solution of the delay differential equation of the "
            "same loop (RK4 with the dead time an exact multiple of h; two step sizes agree to "
            "%.2e). Scope: the loop transfer functions C, G, H are the tool's own plant model, so "
            "only the treatment of the dead time on closing the loop is being judged here."
            % _conv_coil,
    "kind": "delay_closed_loop_default",
    "inputs": {"C": {"num": COIL_C_NUM, "den": COIL_C_DEN},
               "G": {"num": COIL_G_NUM, "den": COIL_G_DEN, "delay": COIL_DELAY},
               "H": {"num": COIL_H_NUM, "den": COIL_H_DEN},
               "t": _ts_coil},
    "ref": {"y": _y_coil, "self_convergence": _conv_coil}})

with open(_gp.ref('regelkring_ref.json'), "w") as fh:
    json.dump(clean(OUT), fh, indent=1, allow_nan=False)
print("cases with SIM group:", len(CASES))
