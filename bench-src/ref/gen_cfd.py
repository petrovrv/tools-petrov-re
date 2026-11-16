#!/usr/bin/env python3
"""Independent reference for cfd.html (tool id "cfd").

This is a REDUCED-ORDER indoor solver on a voxel grid, so it is deliberately
NOT graded against a high-fidelity CFD "truth".  What is graded here is what
must be true of any solver at any fidelity:

  * global mass conservation - the sum of inflows equals the sum of outflows;
  * the tracer mass balance - a steady source S with ventilation flow Q must
    give the analytic well-mixed limit C = C_out + S/Q;
  * the room energy balance - at steady state the internal gains equal the
    enthalpy carried out, dT = P / (rho cp Q);
  * the sign of the Boussinesq buoyancy term, and its magnitude through the
    de Vahl Davis differentially heated cavity, where the peak velocity is a
    direct measure of g beta dT;
  * grid and time-step convergence.

The two standard benchmarks are recorded separately as FIDELITY measurements,
not as pass/fail: the reference values are the published tables.

Citations:
  [1] G. de Vahl Davis, "Natural convection of air in a square cavity: a
      bench mark numerical solution", Int. J. Numer. Methods Fluids 3 (1983)
      249-264 - Table I (Richardson-extrapolated benchmark values).
  [2] U. Ghia, K.N. Ghia, C.T. Shin, "High-Re solutions for incompressible
      flow using the Navier-Stokes equations and a multigrid method",
      J. Comput. Phys. 48 (1982) 387-411 - Tables I and II, 129x129 grid.
  [3] ASHRAE Handbook - Fundamentals (2017), Ch. 1: dry-air density and
      specific heat; the reference density 1.2 kg/m3 and cp 1005 J/(kg K)
      used for the well-mixed limits.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json
import math

# ---------------------------------------------------------------- air
RHO = 1.2        # kg/m3, reference dry-air density near 20 C
CP = 1005.0      # J/(kg K)
RHOCP = RHO * CP


def well_mixed_dT(P_W, Q_m3s):
    """Steady, perfectly mixed room: every watt of internal gain leaves in the
    exhaust enthalpy, so T_exhaust - T_supply = P / (rho cp Q).  Exact for the
    exhaust; the volume mean equals it only for perfect mixing."""
    return P_W / (RHOCP * Q_m3s)


def well_mixed_C(C_out_ppm, S_m3s, Q_m3s):
    """Steady tracer: C = C_out + S/Q, in ppm when S and Q are volumetric."""
    return C_out_ppm + 1e6 * S_m3s / Q_m3s


# ------------------------------------------------------- published tables
# de Vahl Davis 1983, Table I: Richardson-extrapolated benchmark solution for
# the differentially heated square cavity, Pr = 0.71, non-dimensionalised with
# alpha/L so that pure conduction gives Nu = 1.
DVD = {
    "1e3": {"umax": 3.649, "zu": 0.813, "wmax": 3.697, "xw": 0.178,
            "Nu": 1.118, "Nu0": 1.117, "Numax": 1.505, "Numin": 0.692,
            "quoted_accuracy": 0.001},
    "1e4": {"umax": 16.178, "zu": 0.823, "wmax": 19.617, "xw": 0.119,
            "Nu": 2.243, "Nu0": 2.238, "Numax": 3.528, "Numin": 0.586,
            "quoted_accuracy": 0.002},
    "1e5": {"umax": 34.73, "zu": 0.855, "wmax": 68.59, "xw": 0.066,
            "Nu": 4.519, "Nu0": 4.509, "Numax": 7.717, "Numin": 0.729,
            "quoted_accuracy": 0.003},
    "1e6": {"umax": 64.63, "zu": 0.850, "wmax": 219.36, "xw": 0.0379,
            "Nu": 8.800, "Nu0": 8.817, "Numax": 17.925, "Numin": 0.989,
            "quoted_accuracy": 0.010},
}

# Ghia, Ghia & Shin 1982, Table I (u on the vertical centreline) and Table II
# (v on the horizontal centreline), 129x129 grid, unit square, lid u = 1.
GHIA_Y = [0.0, 0.0547, 0.0625, 0.0703, 0.1016, 0.1719, 0.2813, 0.4531, 0.5,
          0.6172, 0.7344, 0.8516, 0.9531, 0.9609, 0.9688, 0.9766, 1.0]
GHIA_U = {
    "100": [0.0, -0.03717, -0.04192, -0.04775, -0.06434, -0.10150, -0.15662,
            -0.21090, -0.20581, -0.13641, 0.00332, 0.23151, 0.68717, 0.73722,
            0.78871, 0.84123, 1.0],
    "400": [0.0, -0.08186, -0.09266, -0.10338, -0.14612, -0.24299, -0.32726,
            -0.17119, -0.11477, 0.02135, 0.16256, 0.29093, 0.55892, 0.61756,
            0.68439, 0.75837, 1.0],
    "1000": [0.0, -0.18109, -0.20196, -0.22220, -0.29730, -0.38289, -0.27805,
             -0.10648, -0.06080, 0.05702, 0.18719, 0.33304, 0.46604, 0.51117,
             0.57492, 0.65928, 1.0],
}
GHIA_X = [0.0, 0.0625, 0.0703, 0.0781, 0.0938, 0.1563, 0.2266, 0.2344, 0.5,
          0.8047, 0.8594, 0.9063, 0.9453, 0.9531, 0.9609, 0.9688, 1.0]
GHIA_V = {
    "100": [0.0, 0.09233, 0.10091, 0.10890, 0.12317, 0.16077, 0.17507, 0.17527,
            0.05454, -0.24533, -0.22445, -0.16914, -0.10313, -0.08864,
            -0.07391, -0.05906, 0.0],
    "400": [0.0, 0.18360, 0.19713, 0.20920, 0.22965, 0.28124, 0.30203, 0.30174,
            0.05186, -0.38598, -0.44993, -0.23827, -0.22847, -0.19254,
            -0.15663, -0.12146, 0.0],
    "1000": [0.0, 0.27485, 0.29012, 0.30353, 0.32627, 0.37095, 0.33075,
             0.32235, 0.02526, -0.31966, -0.42665, -0.51550, -0.39188,
             -0.33714, -0.27669, -0.21388, 0.0],
}
# The printed value at x = 0.9063 in the Re = 400 v-column (-0.23827) breaks the
# trend between its neighbours (-0.44993 and -0.22847); it is a well-known
# 2<->3 typographic error for -0.33827.  Excluded from any RMS.
GHIA_SKIP = {"v": {"400": [11]}}


def build():
    # --- the benchmark scene: 4 x 4 x 3 m room, one supply fan, one passive
    #     relief opening, 1 kW of sensible gain and a 0.01 m3/h gas source.
    Q = 720.0 / 3600.0            # m3/s
    P = 1000.0                    # W
    S = 0.01 / 3600.0             # m3/s of tracer gas
    room = {"L": 4, "W": 4, "H": 3}
    vol = room["L"] * room["W"] * room["H"]
    scene = lambda h: {
        "meta": {"name": "conservation benchmark"},
        "room": {**room, "h": h},
        "ambient": {"tOut": 10, "tStart": 10, "U": 0, "rhOut": 50, "rhStart": 50,
                    "co2Out": 400, "aerosolOut": 0, "aerosolStart": 0},
        "groups": [],
        "objects": [
            {"id": 1, "kind": "fan", "name": "supply", "pos": [0, 1.5, 1.0],
             "size": [0.5, 1.0, 1.0], "face": 0, "flow": 720,
             "tSupply": 10, "rhSupply": 50},
            {"id": 2, "kind": "vent", "name": "relief", "pos": [3.5, 1.5, 1.0],
             "size": [1.0, 1.0, 1.0], "face": 1, "zeta": 1.5},
            {"id": 3, "kind": "heat", "name": "load", "pos": [1.5, 1.5, 0],
             "size": [1.0, 1.0, 1.0], "watts": 1000, "blocks": False},
            {"id": 4, "kind": "emit", "name": "gas", "pos": [2.0, 2.0, 0],
             "size": [0.5, 0.5, 0.5], "moist": 0, "gas": 0.01},
        ],
    }
    # --- buoyancy sign scene: sealed room, single hot source on the floor,
    #     one relief opening only.  Warm air must rise.
    buoy_scene = {
        "meta": {"name": "buoyancy sign"},
        "room": {"L": 4, "W": 4, "H": 4, "h": 0.5},
        "ambient": {"tOut": 20, "tStart": 20, "U": 0, "rhOut": 50, "rhStart": 50,
                    "co2Out": 400, "aerosolOut": 0, "aerosolStart": 0},
        "groups": [],
        "objects": [
            {"id": 1, "kind": "vent", "name": "relief", "pos": [3.5, 1.5, 3.0],
             "size": [1.0, 1.0, 1.0], "face": 1, "zeta": 1.5},
            {"id": 2, "kind": "heat", "name": "hot", "pos": [1.5, 1.5, 0],
             "size": [1.0, 1.0, 0.5], "watts": 2000, "blocks": False},
        ],
    }
    return {
        "description": __doc__.strip(),
        "air": {"rho": RHO, "cp": CP, "rho_cp": RHOCP,
                "note": "ASHRAE dry-air reference values; a 0.5 % change in "
                        "rho cp moves the well-mixed limits by 0.5 %, which is "
                        "inside every tolerance used here."},
        "conservation": {
            "scene_by_h": {"0.5": scene(0.5), "1.0": scene(1.0), "0.25": scene(0.25)},
            "Q_m3s": Q, "P_W": P, "S_m3s": S,
            "room_volume_m3": vol,
            "ACH": Q * 3600.0 / vol,
            "T_supply_C": 10.0,
            "dT_wellmixed_K": well_mixed_dT(P, Q),
            "T_wellmixed_C": 10.0 + well_mixed_dT(P, Q),
            "C_out_ppm": 400.0,
            "C_wellmixed_ppm": well_mixed_C(400.0, S, Q),
            "note": ("At steady state the EXHAUST value is exactly the "
                     "well-mixed limit by mass/energy balance, whatever the "
                     "flow field; the VOLUME MEAN equals it only for perfect "
                     "mixing, so the mean is graded with a mixing allowance "
                     "and the balance residual is graded tightly."),
        },
        "buoyancy_sign": {"scene": buoy_scene,
                          "expect": "mean w above the source > 0, air near the "
                                    "ceiling warmer than air near the floor"},
        "fidelity": {"DVD": DVD, "GHIA": {"y": GHIA_Y, "u": GHIA_U,
                                          "x": GHIA_X, "v": GHIA_V,
                                          "skip": GHIA_SKIP}},
        "citations": [
            "G. de Vahl Davis, \"Natural convection of air in a square cavity: "
            "a bench mark numerical solution\", International Journal for "
            "Numerical Methods in Fluids 3 (1983) 249-264, Table I.",
            "U. Ghia, K.N. Ghia, C.T. Shin, \"High-Re solutions for "
            "incompressible flow using the Navier-Stokes equations and a "
            "multigrid method\", Journal of Computational Physics 48 (1982) "
            "387-411, Tables I and II (129x129 grid).",
            "ASHRAE Handbook - Fundamentals (2017), Chapter 1 (dry-air "
            "density and specific heat).",
        ],
    }


if __name__ == "__main__":
    r = build()
    with open(_gp.ref('cfd_ref.json'), "w") as f:
        json.dump(r, f, indent=1)
    c = r["conservation"]
    print("Q =", c["Q_m3s"], "m3/s   ACH =", round(c["ACH"], 2))
    print("well-mixed dT =", round(c["dT_wellmixed_K"], 4), "K  -> T =",
          round(c["T_wellmixed_C"], 3), "C")
    print("well-mixed C  =", round(c["C_wellmixed_ppm"], 3), "ppm")
