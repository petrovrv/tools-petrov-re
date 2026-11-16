#!/usr/bin/env python3
"""Independent reference generator: dent strain per ASME B31.8-2022 Nonmandatory Appendix R (SI, m)."""
import json, math, os

DEFAULTS = dict(D=0.6096, t=0.0127, d=0.012, L=0.30, R1=0.25, R2=0.40, epsLim=0.06, depthLim=0.06)

SPECS = [
    ("base_defaults", {}),
    ("D324_dD01", dict(D=0.3239, t=0.00953, dD=0.01, L=0.15, R1=0.12, R2=0.30)),
    ("D324_dD03_thin", dict(D=0.3239, t=0.00635, dD=0.03, L=0.25, R1=0.10, R2=0.50)),
    ("D324_dD05_R1neg", dict(D=0.3239, t=0.00953, dD=0.05, L=0.40, R1=-0.30, R2=0.80)),
    ("D324_dD08_depth_repair", dict(D=0.3239, dD=0.08, L=0.80, R1=0.14, R2=1.50)),
    ("D324_R2_010_strain_repair", dict(D=0.3239, dD=0.04, L=0.20, R1=0.13, R2=0.10)),
    ("D610_dD01_L10", dict(dD=0.01, L=1.0, R1=0.28, R2=2.0)),
    ("D610_dD02_L01", dict(dD=0.02, L=0.10)),
    ("D610_R2_010_strain_repair", dict(R2=0.10)),
    ("D610_R1neg_strain_repair", dict(R1=-0.15)),
    ("D610_R1neg_mild", dict(R1=-1.0, R2=1.0)),
    ("D610_dD055_near_limit", dict(dD=0.055, L=0.60, R1=0.29, R2=1.2)),
    ("D610_dD07_depth_repair", dict(dD=0.07, L=0.90, R1=0.29, R2=1.8)),
    ("D610_thin_R2_015", dict(t=0.00635, R2=0.15)),
    ("D610_thick_R2_020", dict(t=0.0191, R2=0.20)),
    ("D610_dD08_R2_010_both_repair", dict(dD=0.08, L=0.50, R2=0.10)),
    ("D1067_dD01", dict(D=1.067, t=0.0159, dD=0.01, L=0.50, R1=0.45, R2=1.0)),
    ("D1067_dD04", dict(D=1.067, t=0.0159, dD=0.04, L=0.80, R1=0.40, R2=0.60)),
    ("D1067_dD05_shortL", dict(D=1.067, dD=0.05, L=0.30)),
    ("D1067_dD08_depth_repair", dict(D=1.067, t=0.0191, dD=0.08, L=1.0, R1=0.45, R2=2.0)),
    ("D1067_R1neg_strain_repair", dict(D=1.067, t=0.0254, dD=0.03, L=0.60, R1=-0.30, R2=0.50)),
]

def solve(p):
    R0 = p["D"] / 2.0
    e1 = (p["t"] / 2.0) * (1.0 / R0 - 1.0 / p["R1"])
    e2 = -(p["t"] / 2.0) / p["R2"]
    e3 = 0.5 * (p["d"] / p["L"]) ** 2
    k = 2.0 / math.sqrt(3.0)
    ei = k * math.sqrt(e1 ** 2 + e1 * (e2 + e3) + (e2 + e3) ** 2)
    eo = k * math.sqrt(e1 ** 2 - e1 * (-e2 + e3) + (-e2 + e3) ** 2)
    em = max(ei, eo)
    dD = p["d"] / p["D"]
    ok = em <= p["epsLim"] and dD <= p["depthLim"]
    return dict(eps1=e1, eps2=e2, eps3=e3, eps_i=ei, eps_o=eo, eps_max=em, d_D=dD,
                verdict="acceptable" if ok else "repair")

def build(cid, over):
    over = dict(over)
    frac = over.pop("dD", None)
    p = dict(DEFAULTS, **over)
    if frac is not None:
        p["d"] = round(frac * p["D"], 6)
    return {"id": cid, "kind": "solve", "inputs": p, "ref": solve(p)}

def main():
    cases = [build(cid, o) for cid, o in SPECS]
    by_strain = [c for c in cases if c["ref"]["eps_max"] > c["inputs"]["epsLim"]]
    by_depth = [c for c in cases if c["ref"]["d_D"] > c["inputs"]["depthLim"]]
    assert by_strain and by_depth, "need repair cases by strain and by depth"
    out = {"tool": "dent_strain", "generator": "bench-src/ref/gen_dent_strain.py", "cases": cases}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dent_strain_ref.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(len(cases))

if __name__ == "__main__":
    main()
