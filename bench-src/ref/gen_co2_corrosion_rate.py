#!/usr/bin/env python3
"""Independent reference generator: CO2 corrosion rate of carbon steel, de Waard-Milliams 1991/1995 (stdlib only)."""
import json, os
from math import log10
DEFAULTS = dict(T=333.15, P=50e5, yCO2=0.02, U=2.0, Dh=0.3, life=25, CA_avail=0.0, Fcorr=1.0)
def solve(p):
    T, Pbar = p["T"], p["P"] / 1e5
    pCO2 = p["yCO2"] * Pbar
    a = 10 ** (Pbar * (0.0031 - 1.4 / T)); fCO2 = a * pCO2
    V91 = 10 ** (5.8 - 1710 / T + 0.67 * log10(fCO2))
    Tscale = 2400 / (6.7 + 0.6 * log10(fCO2))
    Fscale = min(1.0, 10 ** (2400 / T - 2400 / Tscale)) if T > Tscale else 1.0
    V91s = V91 * Fscale
    Vr = 10 ** (4.93 - 1119 / T + 0.58 * log10(pCO2))
    Vm = 2.45 * p["U"] ** 0.8 / p["Dh"] ** 0.2 * pCO2
    V95s = Fscale / (1 / Vr + 1 / Vm)
    Vdes = max(V91s, V95s) * p["Fcorr"]; Vinh = Vdes * (1 - p["CA_avail"]); CA = Vinh * p["life"]
    gov = "dWM 1991" if V91s >= V95s else "dWM 1995"
    return dict(pCO2=pCO2, fCO2=fCO2, V91=V91, Tscale=Tscale, Fscale=Fscale, V91s=V91s, Vr=Vr, Vm=Vm,
                V95s=V95s, Vdes=Vdes, Vinh=Vinh, CA=CA, governing=gov)
OVERRIDES = [
    ("c01_default", {}),
    ("c02_cold_lowP", dict(T=278.15, P=10e5, yCO2=0.005)),
    ("c03_cold_highU", dict(T=283.15, U=5.0, Dh=0.1)),
    ("c04_mild", dict(T=298.15, P=20e5, yCO2=0.05)),
    ("c05_lowU_bigpipe", dict(T=313.15, U=0.5, Dh=0.8)),
    ("c06_inhib85", dict(T=323.15, P=80e5, yCO2=0.03, CA_avail=0.85)),
    ("c07_inhib90", dict(T=343.15, P=60e5, yCO2=0.04, CA_avail=0.9)),
    ("c08_fcorr05", dict(T=318.15, P=40e5, yCO2=0.1, Fcorr=0.5)),
    ("c09_hot_hp_a", dict(T=373.15, P=100e5, yCO2=0.05)),
    ("c10_hot_hp_b", dict(T=393.15, P=150e5, yCO2=0.1)),
    ("c11_hot_hp_c", dict(T=363.15, P=80e5, yCO2=0.1, U=3.0)),
    ("c12_hot_hp_d", dict(T=353.15, P=150e5, yCO2=0.2, Dh=0.2)),
    ("c13_hot_mid", dict(T=383.15, P=50e5, yCO2=0.02, U=4.0)),
    ("c14_hot_hp_inh", dict(T=373.15, P=120e5, yCO2=0.15, CA_avail=0.9)),
    ("c15_hot_hp_fc", dict(T=393.15, P=100e5, yCO2=0.2, Fcorr=0.5, U=1.0)),
    ("c16_warm_lowP", dict(T=348.15, P=10e5, yCO2=0.01, U=1.5, Dh=0.5)),
    ("c17_highCO2", dict(T=303.15, P=30e5, yCO2=0.2, U=2.5)),
    ("c18_smallpipe", dict(T=328.15, P=70e5, yCO2=0.008, Dh=0.1, U=5.0)),
    ("c19_hot_inh85", dict(T=363.15, P=140e5, yCO2=0.05, CA_avail=0.85, Dh=0.6)),
    ("c20_mixed", dict(T=338.15, P=90e5, yCO2=0.06, U=0.8, Dh=0.4, life=30)),
]
cases = []
for cid, ov in OVERRIDES:
    inp = {**DEFAULTS, **ov}
    cases.append({"id": cid, "kind": "solve", "inputs": inp, "ref": solve(inp)})
out = {"tool": "co2_corrosion_rate", "generator": "bench-src/ref/gen_co2_corrosion_rate.py", "cases": cases}
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "co2_corrosion_rate_ref.json"), "w") as f:
    json.dump(out, f, indent=1)
print(len(cases), sum(c["ref"]["Fscale"] < 1 for c in cases))
