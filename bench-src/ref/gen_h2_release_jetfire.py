#!/usr/bin/env python3
"""gen_h2_release_jetfire.py - reference values for H2 jet fire (Abel-Noble, Schefer).
Independent re-implementation of the documented equations (Claude, 22.10.2026);
golden-section throat search (the module uses bisection on dG/dp)."""
import math, json, os

R, B, GAM, LHV = 4124.2, 7.691e-3, 1.40, 119.96e6
CP = GAM * R / (GAM - 1)
FS, TAD, G0 = 0.0283, 2390.0, 9.80665
QS = [(1.58, "r_1_58"), (4.73, "r_4_73"), (6.31, "r_6_31"), (9.5, "r_9_5"), (25.0, "r_25")]
DEF = dict(p_bar=350.0, T0_C=15.0, pamb_bar=1.01325, Tamb_C=15.0, dHole_mm=3.0, Cd=1.0, xRecv_m=5.0, yRecv_m=2.0)
CASES = [
    ("hrs-350", "HRS 350 bar, 3 mm leak", {}),
    ("hrs-700", "HRS 700 bar, 1 mm leak", dict(p_bar=700.0, dHole_mm=1.0)),
    ("pipeline-70", "Pipeline 70 bar, 25 mm hole", dict(p_bar=70.0, dHole_mm=25.0, Cd=0.85)),
    ("tube-trailer-200", "Tube trailer 200 bar, 1/4 in", dict(p_bar=200.0, dHole_mm=6.35)),
    ("cold-100", "Cold gas -40 C, 100 bar", dict(p_bar=100.0, T0_C=-40.0, dHole_mm=5.0, xRecv_m=10.0, yRecv_m=3.0)),
    ("subsonic", "Low pressure subsonic release", dict(p_bar=1.5, dHole_mm=50.0)),
    ("small-20", "Small 20 bar leak, Cd 0.6", dict(p_bar=20.0, dHole_mm=2.0, Cd=0.6)),
]

def rho(p, T):
    return p / (R * T + B * p)

def throat(p0, T0, rho0, pt):
    vb0 = 1.0 / rho0 - B
    vbt = vb0 * (p0 / pt) ** (1.0 / GAM)
    Tt = T0 * (vb0 / vbt) ** (GAM - 1)
    rt = rho(pt, Tt)
    ut = math.sqrt(max(2.0 * (CP * (T0 - Tt) + B * (p0 - pt)), 0.0))
    return rt, ut, rt * ut

def golden_max(f, a, b, tol=1e-12):
    k = (math.sqrt(5) - 1) / 2
    c, d = b - k * (b - a), a + k * (b - a)
    fc, fd = f(c), f(d)
    while (b - a) > tol * abs(b):
        if fc > fd:
            b, d, fd = d, c, fc
            c = b - k * (b - a); fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + k * (b - a); fd = f(d)
    return 0.5 * (a + b)

def compute(i):
    p0, T0 = i["p_bar"] * 1e5, i["T0_C"] + 273.15
    pa, Ta, d = i["pamb_bar"] * 1e5, i["Tamb_C"] + 273.15, i["dHole_mm"] / 1000.0
    rho0 = rho(p0, T0)
    choked = p0 / pa > ((GAM + 1) / 2) ** (GAM / (GAM - 1))
    pt = golden_max(lambda p: throat(p0, T0, rho0, p)[2], 1e-4 * p0, p0) if choked else pa
    rt, ut, G = throat(p0, T0, rho0, pt)
    mdot = i["Cd"] * math.pi * d ** 2 / 4 * G
    ueff = ut + (pt - pa) / (rt * ut) if ut > 0 else ut
    reff = rho(pa, Ta)
    deff = math.sqrt(4 * mdot / (reff * ueff) / math.pi)
    rair = pa / (287.05 * Ta)
    dTr = (TAD - Ta) / Ta
    Fr = ueff * FS ** 1.5 / ((reff / rair) ** 0.25 * math.sqrt(dTr * G0 * deff))
    Ls = 13.5 * Fr ** 0.4 / (1 + 0.07 * Fr ** 2) ** 0.2 if Fr < 5 else 23.0
    Lf = Ls * deff * math.sqrt(reff / rair) / FS
    Wf = 0.17 * Lf
    rF = pa * 0.0247 / (8.314462618 * TAD)
    tau = 1000 * rF * Wf ** 2 * Lf * FS / (3 * reff * deff ** 2 * ueff)
    X = min(max(9.45e-9 * (tau * 0.23 * TAD ** 4) ** 0.47, 0.01), 0.4)
    S = X * mdot * LHV
    r2 = max((i["xRecv_m"] - Lf / 2) ** 2 + i["yRecv_m"] ** 2, 1e-12)
    ref = dict(mdot=mdot, choked=bool(choked), deff=deff, ueff=ueff, Lf=Lf, Xrad=X,
               Srad=S, qRecv=S / (4 * math.pi * r2) / 1000.0)
    for q, k in QS:
        ref[k] = math.sqrt(S / (4 * math.pi * q * 1000.0))
    return ref

def main():
    out = []
    for cid, note, ov in CASES:
        inp = dict(DEF); inp.update(ov)
        out.append({"id": cid, "note": note, "inputs": inp, "ref": compute(inp)})
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "h2_release_jetfire_ref.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    print(len(out))

if __name__ == "__main__":
    main()
