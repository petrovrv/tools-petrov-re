import json
import os
import CoolProp
from CoolProp.CoolProp import AbstractState

DEFAULTS = dict(x_h2=1.0, mdot=0.01157, p_in=3e6, T_in=303.15, p_out=9e7, n=3,
                eta_s=0.75, eta_m=0.95, T_ic=308.15, dp_ic=0.01, T_max=408.15)

SPECS = [
    ("defaults", {}),
    ("n4", dict(n=4)),
    ("n5", dict(n=5)),
    ("n6_ok", dict(n=6)),
    ("p2_95_n4", dict(p_in=2e6, p_out=9.5e7, n=4)),
    ("p2_95_n5", dict(p_in=2e6, p_out=9.5e7, n=5)),
    ("pipeline_booster", dict(p_in=3e6, p_out=1e7, n=1, mdot=1.0)),
    ("p05_3_n2", dict(p_in=5e5, p_out=3e6, n=2)),
    ("eta_s_065", dict(eta_s=0.65)),
    ("eta_s_085", dict(eta_s=0.85)),
    ("dp_ic_0", dict(dp_ic=0.0)),
    ("dp_ic_003", dict(dp_ic=0.03)),
    ("T_in_283", dict(T_in=283.15)),
    ("x098_2_20_n2", dict(x_h2=0.98, p_in=2e6, p_out=2e7, n=2)),
    ("x095_2_20_n2", dict(x_h2=0.95, p_in=2e6, p_out=2e7, n=2)),
    ("T_max_473", dict(T_max=473.15)),
]


def make_state(x_h2):
    if x_h2 >= 1.0:
        return AbstractState("HEOS", "Hydrogen")
    st = AbstractState("HEOS", "Hydrogen&Nitrogen")
    st.set_mole_fractions([x_h2, 1.0 - x_h2])
    st.specify_phase(CoolProp.iphase_gas)
    return st


def solve(c):
    st = make_state(c["x_h2"])
    mdot, n = c["mdot"], int(c["n"])
    rs = (c["p_out"] / c["p_in"]) ** (1.0 / n)
    P_tot, Q_ic, T_d_max, T_d1 = 0.0, 0.0, -1e9, None
    p_d_prev = None
    for i in range(1, n + 1):
        if i == 1:
            p_s, T_s = c["p_in"], c["T_in"]
        else:
            p_s, T_s = p_d_prev * (1.0 - c["dp_ic"]), c["T_ic"]
        p_d = c["p_out"] if i == n else c["p_in"] * rs ** i
        st.update(CoolProp.PT_INPUTS, p_s, T_s)
        h_s, s_s = st.hmass(), st.smass()
        st.update(CoolProp.PSmass_INPUTS, p_d, s_s)
        dh = (st.hmass() - h_s) / c["eta_s"]
        st.update(CoolProp.HmassP_INPUTS, h_s + dh, p_d)
        T_d = st.T()
        P_tot += mdot * dh
        T_d_max = max(T_d_max, T_d)
        if i == 1:
            T_d1 = T_d
        if i < n:
            st.update(CoolProp.PT_INPUTS, p_d, T_d)
            h_d = st.hmass()
            st.update(CoolProp.PT_INPUTS, p_d * (1.0 - c["dp_ic"]), c["T_ic"])
            Q_ic += mdot * (h_d - st.hmass())
        p_d_prev = p_d
    st.update(CoolProp.PT_INPUTS, c["p_in"], c["T_in"])
    Z_in, rho_in = st.compressibility_factor(), st.rhomass()
    st.update(CoolProp.PT_INPUTS, c["p_out"], c["T_ic"])
    rho_out = st.rhomass()
    P_shaft = P_tot / c["eta_m"]
    return dict(P_shaft=P_shaft, e_spec_kWh_kg=P_shaft / mdot / 3.6e6,
                T_d_max=T_d_max, Q_ic_total=Q_ic, Z_in=Z_in, rho_in=rho_in,
                rho_out=rho_out, T_d1=T_d1,
                verdict="ok" if T_d_max <= c["T_max"] else "too_hot")


def main():
    cases = []
    for cid, ov in SPECS:
        inp = dict(DEFAULTS)
        inp.update(ov)
        cases.append({"id": cid, "kind": "solve", "inputs": inp, "ref": solve(inp)})
    verdicts = {c["ref"]["verdict"] for c in cases}
    assert "ok" in verdicts and "too_hot" in verdicts, verdicts
    assert next(c for c in cases if c["id"] == "n6_ok")["ref"]["verdict"] == "ok"
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "h2_compressor_ref.json")
    with open(out, "w") as f:
        json.dump({"tool": "h2_compressor",
                   "generator": "bench-src/ref/gen_h2_compressor.py",
                   "cases": cases}, f, indent=1)
    print(f"wrote {len(cases)} cases to {out}")


if __name__ == "__main__":
    main()
