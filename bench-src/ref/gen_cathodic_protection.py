#!/usr/bin/env python3
"""Independent reference generator: galvanic bracelet-anode CP design of a coated pipeline (DNV-RP-F103 / DNV-RP-B401 / ISO 15589-2). SI units."""
import json, math, os

DEFAULTS = dict(D=0.3239, Lp=10000, tf=25, icm=0.05, icf=0.05, a=0.001, b=0.0003, eps=2000, u=0.80, Ec=-0.80, Ea=-1.05, rho=1.3, anodeMass=150, anodeArea=0.6)

def solve(p):
    Ac = math.pi * p["D"] * p["Lp"]
    fcm = min(1.0, p["a"] + 0.5 * p["b"] * p["tf"])
    fcf = min(1.0, p["a"] + p["b"] * p["tf"])
    Icm = Ac * fcm * p["icm"]
    Icf = Ac * fcf * p["icf"]
    M = Icm * p["tf"] * 8760 / (p["u"] * p["eps"])
    Nm = max(1, math.ceil(M / p["anodeMass"]))
    Raf = 0.315 * p["rho"] / math.sqrt(p["anodeArea"])
    Iaf = (p["Ec"] - p["Ea"]) / Raf
    Nc = max(1, math.ceil(Icf / Iaf))
    N = max(Nm, Nc)
    return dict(Ac=Ac, fcm=fcm, fcf=fcf, Icm=Icm, Icf=Icf, M=M, Nm=Nm, Nc=Nc, N=N, governing="mass" if Nm >= Nc else "current", spacing=p["Lp"] / N, Raf=Raf, Iaf=Iaf)

OVERRIDES = [
    ("base_defaults", {}),
    ("D_small_6in", dict(D=0.1683)),
    ("D_24in", dict(D=0.6096)),
    ("D_42in", dict(D=1.067)),
    ("Lp_short_1km", dict(Lp=1000)),
    ("Lp_long_50km", dict(Lp=50000)),
    ("tf_10y", dict(tf=10)),
    ("tf_40y", dict(tf=40)),
    ("ic_low_0p02", dict(icm=0.02, icf=0.02)),
    ("ic_high_0p13", dict(icm=0.13, icf=0.13)),
    ("rho_seawater_0p3", dict(rho=0.3)),
    ("rho_high_5", dict(rho=5.0)),
    ("anode_mass_30", dict(anodeMass=30)),
    ("anode_mass_400", dict(anodeMass=400)),
    ("anode_area_0p2", dict(anodeArea=0.2)),
    ("anode_area_2p0", dict(anodeArea=2.0)),
    ("coating_a0p01_b0p001", dict(a=0.01, b=0.001)),
    ("coating_a0p01_b0p001_tf40", dict(a=0.01, b=0.001, tf=40)),
    ("fc_clamp_to_1", dict(a=0.1, b=0.05, tf=40)),
    ("mass_seawater_big_area", dict(rho=0.3, anodeArea=2.0)),
    ("mass_seawater_long_life", dict(rho=0.3, tf=40)),
    ("mass_seawater_small_anodes", dict(rho=0.3, anodeArea=2.0, tf=40, anodeMass=50)),
    ("mass_large_long_line", dict(rho=0.3, anodeArea=1.5, tf=30, D=1.067, Lp=50000)),
]

def main():
    cases = []
    for cid, ov in OVERRIDES:
        inp = dict(DEFAULTS); inp.update(ov)
        cases.append({"id": cid, "kind": "solve", "inputs": inp, "ref": solve(inp)})
    out = {"tool": "cathodic_protection", "generator": "bench-src/ref/gen_cathodic_protection.py", "cases": cases}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cathodic_protection_ref.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    nmass = sum(1 for c in cases if c["ref"]["governing"] == "mass")
    print(f"{len(cases)} cases written to {path}; mass-governed: {nmass}")

if __name__ == "__main__":
    main()
