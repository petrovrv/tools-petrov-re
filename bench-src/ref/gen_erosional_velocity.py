#!/usr/bin/env python3
"""Independent reference generator: erosional velocity of production piping.
Basis: API RP 14E, 5th ed. (1991, reaffirmed 2013), Sect. 2.5, eq. 2.14  Ve = C / sqrt(rho_m)
with Ve in ft/s, rho_m in lb/ft3 and C the empirical constant; rho_m is the no-slip
gas/liquid mixture density at flowing conditions.
The calculation is done in US field units (lb/s, lb/ft3, ft) and converted back to SI with
the exact definitions 1 ft = 0.3048 m and 1 lb = 0.45359237 kg.
Independent reference: does not import or port the tool under test.
Code written by Claude, 23.10.2026.
"""
import json
import math
import os

FT = 0.3048            # m per ft (exact)
LB = 0.45359237        # kg per lb (exact)
LBFT3 = LB / FT ** 3   # kg/m3 per lb/ft3


def erosion(p):
    """p in SI: mg, ml [kg/s], rhog, rhol [kg/m3], D [m], C [(ft/s)(lb/ft3)^0.5] or None, solids."""
    mg, ml, rg, rl, D = p["mg"], p["ml"], p["rhog"], p["rhol"], p["D"]
    C = 100.0 if p.get("C") is None else p["C"]
    if mg < 0 or ml < 0 or (mg == 0 and ml == 0):
        return None
    if rg <= 0 or rl <= 0 or D <= 0 or C <= 0:
        return None
    # to field units
    Wg, Wl = mg / LB, ml / LB                 # lb/s
    dg, dl = rg / LBFT3, rl / LBFT3           # lb/ft3
    d_ft = D / FT                             # ft
    qg, ql = Wg / dg, Wl / dl                 # ft3/s
    qm = qg + ql
    rho_m = (Wg + Wl) / qm                    # lb/ft3, no-slip
    ve = C / math.sqrt(rho_m)                 # ft/s, API RP 14E eq. 2.14
    vm = qm / (math.pi / 4.0 * d_ft ** 2)     # ft/s
    a_min = qm / ve                           # ft2, flow area at Ve
    d_min = math.sqrt(4.0 * a_min / math.pi)  # ft
    warn = {"exceeds": vm / ve > 1.0, "c150": C > 150.0, "sand": p.get("solids") is True}
    return {
        "C": C,
        "rhom": rho_m * LBFT3,
        "Ve": ve * FT,
        "Vm": vm * FT,
        "ratio": vm / ve,
        "Dmin": d_min * FT,
        "Qm": qm * FT ** 3,
        "lambda": ql / qm,
        "warn": warn,
    }


BASE = dict(mg=10.0, ml=5.0, rhog=60.0, rhol=800.0, D=0.254, C=None, solids=False)

SPECS = [
    ("default", "default two-phase line 10 in, C 100", {}),
    ("gas_only", "dry gas export 12 in, ml = 0", dict(mg=60.0, ml=0.0, rhog=70.0, D=0.3048)),
    ("liquid_only", "liquid-only line 8 in, mg = 0", dict(mg=0.0, ml=80.0, rhol=850.0, D=0.2032)),
    ("gas_well_c150", "gas well flowline 6 in, C 150", dict(mg=20.0, ml=0.5, rhog=90.0, rhol=700.0, D=0.1524, C=150.0)),
    ("oil_c125", "oil production line 12 in, C 125", dict(mg=1.0, ml=50.0, rhog=20.0, rhol=850.0, D=0.3048, C=125.0)),
    ("wet_gas_exceeds", "wet gas 6 in above Ve", dict(mg=40.0, ml=2.0, rhog=50.0, rhol=750.0, D=0.1524)),
    ("c200_warn", "clean inhibited service C 200 (warning C > 150)", dict(mg=30.0, ml=1.0, rhog=100.0, rhol=650.0, D=0.2032, C=200.0)),
    ("sand_flag", "sand-producing well 4 in (warning sand)", dict(mg=8.0, ml=10.0, rhog=80.0, rhol=820.0, D=0.1016, C=100.0, solids=True)),
    ("low_pressure_gas", "low-pressure gas 2 in, rhog 2", dict(mg=0.2, ml=0.01, rhog=2.0, rhol=780.0, D=0.0508)),
    ("dense_phase", "dense gas 16 in, rhog 250", dict(mg=150.0, ml=20.0, rhog=250.0, rhol=600.0, D=0.4064, C=110.0)),
    ("refuse_both_zero", "refuse: mg = ml = 0", dict(mg=0.0, ml=0.0)),
    ("refuse_rhog0", "refuse: rhog = 0", dict(rhog=0.0)),
    ("refuse_D0", "refuse: D = 0", dict(D=0.0)),
    ("refuse_C0", "refuse: C = 0", dict(C=0.0)),
]

cases = []
for cid, note, over in SPECS:
    inp = dict(BASE, **over)
    ref = erosion(inp)
    cases.append({"id": cid, "note": note, "expect": "refuse" if ref is None else "ok", "inp": inp, "ref": ref or {}})
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "erosional_velocity_ref.json")
with open(out, "w") as f:
    json.dump(cases, f, indent=2)
print(len(cases))
