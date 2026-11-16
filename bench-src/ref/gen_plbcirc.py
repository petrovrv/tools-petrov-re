"""Independent reference for plbcirc (DHW circulation & balancing).

Written from the published method _plb/circ/METHOD.md (plbcirc-1.3), not from plb-circ.js:
DVGW W 553 proportional split, exponential pipe cooling, mixing of returns, Darcy-Weisbach/Colebrook,
thermostatic valves solved per leaf, unbalanced network solved with scipy.optimize.fsolve.
External anchors (D-PLB-10, CR-23): three cases worked by hand from the standard formulas (EN ISO 12241 cylindrical
layer, GEG Anlage 8 thicknesses, DVGW W 553 circulation flow V = Q/(c_p dT) with the proportional split, exponential
cooling of a pipe, thermostatic valve balance); their hand results are typed in as literals (ANCHORS below), the
generator stops if its own model disagrees, and the bench checks the page against them as well.
Output: bench-src/ref/plbcirc_ref.json  (list of cases: inputs + expected values [+ anchor]).
Run: python -I bench-src/ref/gen_plbcirc.py
"""
import json
import math
import os
import warnings

warnings.filterwarnings("ignore")
from scipy.optimize import brentq, fsolve  # noqa: E402

CP = 4184.0
SERIES = {
    # EN 1057 sizes as used by the package (plumbing-core MATERIALS.copper: R250 half-hard 28x1.5 ... 54x2)
    "cu": (0.0015, [(12, 1), (15, 1), (18, 1), (22, 1), (28, 1.5), (35, 1.5), (42, 1.5), (54, 2), (76.1, 2), (88.9, 2), (108, 2.5)]),
    "ss": (0.0015, [(15, 1), (18, 1), (22, 1.2), (28, 1.2), (35, 1.5), (42, 1.5), (54, 1.5), (76.1, 2), (88.9, 2), (108, 2)]),
    "ml": (0.007, [(16, 2), (20, 2), (26, 3), (32, 3), (40, 3.5), (50, 4), (63, 4.5)]),
}
DEF = dict(material="cu", method="split", dT_basis="loop", T_out=60.0, dT_design=5.0, T_set=57.0, T_min=55.0, lambda_ins=0.035, h_o=9.0,
           fittings_pct=40.0, dp_valve_min_kpa=3.0, dp_fixed_kpa=5.0, vmax=0.5, kv_min=0.1, hours_day=24.0,
           eff_heat=0.9, price_heat=0.10, co2_heat=0.2, pump_eta=0.25, price_el=0.30)


def nearest(mat, od):
    return min(SERIES[mat][1], key=lambda p: abs(p[0] - od))


def thickness(kind, di, custom):
    if kind == "none":
        return 0.0
    if kind == "custom":
        return float(custom)
    if di <= 22:
        t = 20.0
    elif di <= 35:
        t = 30.0
    elif di <= 100:
        t = di
    else:
        t = 100.0
    return t / 2 if kind == "geg50" else t


def u_lin(od_mm, s_mm, lam, h):
    do = od_mm * 1e-3
    if s_mm <= 0:
        return math.pi * h * do
    D = do + 2 * s_mm * 1e-3
    R = math.log(D / do) / (2 * math.pi * lam) + 1 / (h * math.pi * D)   # K m / W per metre
    return 1 / R


def density(t):
    return 1000 * (1 - (t + 288.9414) / (508929.2 * (t + 68.12963)) * (t - 3.9863) ** 2)


def viscosity(t):
    return 2.414e-5 * 10 ** (247.8 / (t + 133.15))


def darcy(re, rr):
    def cole(r):
        f = 0.02
        for _ in range(200):
            f_new = (-2 * math.log10(rr / 3.7 + 2.51 / (r * math.sqrt(f)))) ** -2
            if abs(f_new - f) < 1e-15:
                break
            f = f_new
        return f_new
    if re <= 0:
        return 0.0
    if re < 2300:
        return 64 / re
    if re < 4000:
        w = (re - 2300) / 1700
        return (1 - w) * 64 / 2300 + w * cole(4000.0)
    return cole(re)


INS_CLASSES = ("none", "geg50", "geg100", "custom")   # METHOD 2 / 8a
INS_DEFAULT = "geg100"


def input_errors(case):
    """METHOD 8a input rule for the insulation class (r3 X2-3): missing (None / '') -> geg100;
    a present value outside the four classes is a validation error ins:<section id>, never replaced."""
    errs = []
    for s in case["sections"]:
        v = s.get("ins")
        if v in (None, ""):
            continue
        if v not in INS_CLASSES:
            errs.append("ins:%s" % s["id"])
    return errs


def compute(case):
    p = dict(DEF)
    p.update({k: v for k, v in case.items() if k != "sections"})
    secs = {s["id"]: dict(s) for s in case["sections"]}
    eps = SERIES[p["material"]][0]
    children = {k: [] for k in secs}
    root = None
    for k, s in secs.items():
        if s.get("parent") in (None, ""):
            root = k
        else:
            children[s["parent"]].append(k)
    pre = []

    def visit(k):
        pre.append(k)
        for c in children[k]:
            visit(c)
    visit(root)
    leaves = [k for k in pre if not children[k]]
    tp = p["T_out"] - 2.5
    rho, mu = density(tp), viscosity(tp)
    Tm = p["T_out"] - p["dT_design"] / 2
    geo = {}
    for k in pre:
        s = secs[k]
        fo, fw = nearest(p["material"], s["odf"])
        ro, rw = nearest(p["material"], s["odr"])
        di_f, di_r = fo - 2 * fw, ro - 2 * rw
        lam = p["lambda_ins"] if s["ins"] == "custom" else 0.035
        Uf = u_lin(fo, thickness(s["ins"], di_f, s.get("ins_mm", 0)), lam, p["h_o"])
        Ur = u_lin(ro, thickness(s["ins"], di_r, s.get("ins_mm", 0)), lam, p["h_o"])
        geo[k] = dict(Uf=Uf, Ur=Ur, df=di_f * 1e-3, dr=di_r * 1e-3, Lf=s["Lf"], Lr=s["Lr"], Ta=s["Ta"], parent=s.get("parent"))
        geo[k]["Qd"] = Uf * s["Lf"] * (Tm - s["Ta"])

    def subloss(k):
        return geo[k]["Qd"] + sum(subloss(c) for c in children[k])
    QW = subloss(root)
    m_flowrule = QW / (CP * p["dT_design"])

    # W 553 proportional split: share of every child = its subtree flow-pipe design loss (fractions of the root flow)
    frac = {root: 1.0}
    for k in pre:
        cs = children[k]
        if cs:
            ls = [subloss(c) for c in cs]
            tot = sum(ls)
            for c, l in zip(cs, ls):
                frac[c] = frac[k] * (l / tot if tot > 0 else 1 / len(cs))

    def flows(leafm):
        m = {}
        for k in reversed(pre):
            m[k] = sum(m[c] for c in children[k]) if children[k] else leafm[k]
        return m

    def cool(t_in, ta, UL, m):
        return ta + (t_in - ta) * math.exp(-UL / (m * CP)) if m > 0 else ta

    def thermal(m):
        T = {}
        for k in pre:
            g = geo[k]
            t_in = p["T_out"] if g["parent"] in (None, "") else T[g["parent"]]["fe"]
            T[k] = {"fi": t_in, "fe": cool(t_in, g["Ta"], g["Uf"] * g["Lf"], m[k])}
        for k in reversed(pre):
            g = geo[k]
            if children[k]:
                ri = sum(m[c] * T[c]["ro"] for c in children[k]) / m[k]
            else:
                ri = T[k]["fe"]
            T[k]["ri"] = ri
            T[k]["ro"] = cool(ri, g["Ta"], g["Ur"] * g["Lr"], m[k])
        return T

    def pipe_dp(m, d, L):
        if m <= 0 or L <= 0:
            return 0.0
        v = m / rho / (math.pi * d * d / 4)
        re = rho * v * d / mu
        return darcy(re, eps * 1e-3 / d) * L / d * rho * v * v / 2

    def seg_dp(k, m):
        g = geo[k]
        return (1 + p["fittings_pct"] / 100) * (pipe_dp(m, g["df"], g["Lf"]) + pipe_dp(m, g["dr"], g["Lr"]))

    def paths(m):
        P = {}
        for k in pre:
            par = geo[k]["parent"]
            P[k] = (0.0 if par in (None, "") else P[par]) + seg_dp(k, m[k])
        return P

    def split_of(mroot):
        return {k: mroot * frac[k] for k in pre}

    def root_flow_for(t_target):
        # METHOD §3 (r4 Y3-1): the mixed return into the heater equals t_target with the proportional split;
        # the return grows with the root flow, so Brent's method on [tiny, large] has one root
        f = lambda mr: thermal(split_of(mr))[root]["ro"] - t_target
        mr = brentq(f, 1e-7, 50.0, xtol=1e-18, rtol=1e-15, maxiter=500)
        while f(mr) < 0:  # the design return must not sit a rounding step below its own target
            mr *= 1 + 1e-14
        return mr

    m_loop = root_flow_for(p["T_out"] - p["dT_design"])
    m_design = m_flowrule if p["dT_basis"] == "flow" else m_loop
    m_ret_min = root_flow_for(p["T_min"])
    split = split_of(m_design)

    meth = p["method"]
    if meth == "split":
        m = split
    elif meth == "thermo":
        # METHOD §4: the leaf flow is limited to the flow giving v_max in the narrower loop pipe (valve wide open)
        cap = {k: p["vmax"] * rho * math.pi * min(geo[k]["df"], geo[k]["dr"]) ** 2 / 4 for k in leaves}
        lm = {k: min(split[k], cap[k]) for k in leaves}
        for _ in range(2000):
            m = flows(lm)
            T = thermal(m)
            change = 0.0
            for k in leaves:
                g = geo[k]
                if T[k]["fi"] - g["Ta"] <= (p["T_set"] - g["Ta"]) * (1 + 1e-9):
                    new = cap[k]   # setpoint unreachable: valve wide open, flow at v_max (METHOD §4)
                else:
                    new = min(cap[k], (g["Uf"] * g["Lf"] + g["Ur"] * g["Lr"]) / (CP * math.log((T[k]["fi"] - g["Ta"]) / (p["T_set"] - g["Ta"]))))
                change = max(change, abs(new - lm[k]) / new)
                lm[k] = 0.5 * (lm[k] + new)
            if change < 1e-12:
                break
        m = flows(lm)
    else:
        n = len(leaves)
        scale = m_design

        def eqs(x):
            q = {k: max(xi, 1e-9) * scale for k, xi in zip(leaves, x)}
            P = paths(flows(q))
            out = [(P[leaves[i]] - P[leaves[-1]]) / 1000 for i in range(n - 1)]
            out.append(sum(x) - 1.0)
            return out
        x0 = [split[k] / scale for k in leaves]
        x = fsolve(eqs, x0, xtol=1e-13, maxfev=20000)
        m = flows({k: xi * scale for k, xi in zip(leaves, x)})

    T = thermal(m)
    P = paths(m)
    index = max(leaves, key=lambda k: P[k])
    if meth == "none":
        dp_pump = P[index] + p["dp_fixed_kpa"] * 1e3
    else:
        dp_pump = P[index] + (p["dp_valve_min_kpa"] + p["dp_fixed_kpa"]) * 1e3
    QW_design, m_design_out = QW, m_design
    loss = sum(m[k] * CP * ((T[k]["fi"] - T[k]["fe"]) + (T[k]["ri"] - T[k]["ro"])) for k in pre)
    leaf_out = {}
    for k in leaves:
        e = {"V_lph": m[k] / rho * 3.6e6, "m_kgs": m[k], "T_f_end": T[k]["fe"], "T_r_out": T[k]["ro"]}
        if meth != "none":
            dpv = P[index] + p["dp_valve_min_kpa"] * 1e3 - P[k]
            e["kv"] = (m[k] / rho * 3600) / math.sqrt(dpv / 1e5)
        leaf_out[k] = e
    tmin = min(min(T[k]["fe"], T[k]["ro"]) for k in pre)
    below = sorted(k for k in pre if min(T[k]["fe"], T[k]["ro"]) < p["T_min"] - 1e-9)
    hours = p["hours_day"] * 365
    deliv = loss * hours / 1000 / p["eff_heat"]
    pump_kwh = dp_pump * (m[root] / rho) / p["pump_eta"] * hours / 1000
    return {
        "V_total_lph": m[root] / rho * 3.6e6,
        "m_total_kgs": m[root],
        "m_return_min_kgs": m_ret_min,
        "return_below_min": bool(T[root]["ro"] < p["T_min"] - 1e-9),
        "QW_design_W": QW_design,
        "T_return": T[root]["ro"],
        "T_min_seen": tmin,
        "Q_loss_W": loss,
        "dp_pump_kpa": dp_pump / 1000,
        "total_eur": deliv * p["price_heat"] + pump_kwh * p["price_el"],
        "below_min": below,
        "index_leaf": index,
        "leaves": leaf_out,
    }


def comb(n, L0, od0, odr0, Lm, odm, odrm, Lr, odR, odrR, insM, insR, TaM, TaR, extra=0.0, ins_mm=0.0):
    s = [dict(id="M0", parent=None, Lf=L0, odf=od0, Lr=L0, odr=odr0, ins=insM, ins_mm=ins_mm, Ta=TaM)]
    for i in range(1, n + 1):
        prev = "M0" if i == 1 else "M%d" % (i - 1)
        if i < n:
            s.append(dict(id="M%d" % i, parent=prev, Lf=Lm, odf=odm, Lr=Lm, odr=odrm, ins=insM, ins_mm=ins_mm, Ta=TaM))
        s.append(dict(id="R%d" % i, parent=prev, Lf=Lr, odf=odR, Lr=Lr + extra, odr=odrR, ins=insR, ins_mm=ins_mm, Ta=TaR))
    return s


def cases():
    out = []
    apt = comb(4, 6, 42, 22, 10, 35, 18, 19.2, 28, 15, "geg100", "geg100", 15, 22)
    apt_long = comb(4, 6, 42, 22, 18, 35, 15, 19.2, 28, 15, "geg100", "geg100", 15, 22)
    out.append(dict(id="apt24_w553", note="preset: W 553 flow-pipe rule 5 K, return below 55 (hard fail)", method="split", dT_basis="flow", sections=apt))
    out.append(dict(id="apt24_dt25", note="preset: 2.5 K on the flow pipes", method="split", dT_basis="flow", dT_design=2.5, sections=apt))
    out.append(dict(id="apt24_loop", note="preset (r4 Y3-1): 5 K over the whole loop, return 55.0 C", method="split", dT_basis="loop", sections=apt))
    out.append(dict(id="apt24_none", note="preset: no regulating valves (flow-pipe rule total)", method="none", dT_basis="flow", sections=apt_long))
    out.append(dict(id="apt24_thermo", note="preset: thermostatic 57 C", method="thermo", dT_basis="flow", T_set=57, sections=apt_long))
    out.append(dict(id="old_bare_basement", note="preset: bare stainless basement mains (flow-pipe rule)", material="ss", method="split", dT_basis="flow",
                    sections=comb(3, 8, 54, 28, 15, 42, 22, 16, 28, 18, "none", "geg100", 15, 22)))
    out.append(dict(id="hotel_timer", note="preset: hotel, thermostatic, 14 h/day", method="thermo", T_set=57, hours_day=14,
                    sections=comb(6, 10, 54, 28, 12, 42, 22, 28, 28, 15, "geg100", "geg100", 18, 24)))
    # single loops
    for i, (L, od, ins, ta, dT) in enumerate([(20, 22, "geg100", 20, 5), (50, 28, "geg50", 15, 5), (80, 35, "none", 20, 3),
                                              (35, 18, "custom", 25, 4), (120, 42, "geg100", 10, 5), (10, 15, "geg100", 20, 2)]):
        out.append(dict(id="single_%d" % (i + 1), note="one loop %s m %s mm %s" % (L, od, ins), method="split", dT_design=dT,
                        sections=[dict(id="A", parent=None, Lf=L, odf=od, Lr=L, odr=15, ins=ins, ins_mm=25, Ta=ta)]))
    # materials, methods on two-riser and three-riser combs
    k = 0
    for mat in ("cu", "ss", "ml"):
        for meth in ("split", "thermo", "none"):
            k += 1
            od = {"cu": (35, 28, 22, 15), "ss": (35, 28, 22, 15), "ml": (40, 32, 26, 16)}[mat]
            secs = comb(2 + k % 3, 5 + k, od[0], od[2], 8 + k, od[1], od[3], 12 + 2 * k, od[2], od[3], "geg100", "geg50" if k % 2 else "geg100", 16, 22)
            out.append(dict(id="comb_%s_%s" % (mat, meth), note="comb %s %s" % (mat, meth), material=mat, method=meth, T_set=56.5,
                            sections=secs))
    # parameter variations on the apartment block
    var = [dict(T_out=65), dict(T_out=62, dT_design=4), dict(fittings_pct=0), dict(fittings_pct=100), dict(h_o=6), dict(h_o=12),
           dict(dp_valve_min_kpa=10, dp_fixed_kpa=0), dict(hours_day=16, eff_heat=0.95, price_heat=0.12), dict(method="thermo", T_set=56),
           dict(method="thermo", T_set=58.5), dict(method="none", T_out=63), dict(material="ss"), dict(material="ml")]
    for i, v in enumerate(var):
        c = dict(id="apt_var_%02d" % (i + 1), note="apartment block, " + ", ".join("%s=%s" % kv for kv in v.items()), method="split",
                 sections=apt if v.get("method") != "none" else apt_long)
        c.update(v)
        if c.get("material") == "ml":
            c["sections"] = comb(4, 6, 50, 26, 10, 40, 20, 19.2, 32, 16, "geg100", "geg100", 15, 22)
        out.append(c)
    # a branched tree (risers with two floor branches each)
    tree = [dict(id="P", parent=None, Lf=4, odf=42, Lr=4, odr=22, ins="geg100", Ta=18),
            dict(id="A", parent="P", Lf=12, odf=35, Lr=12, odr=18, ins="geg100", Ta=18),
            dict(id="B", parent="P", Lf=25, odf=28, Lr=25, odr=15, ins="geg50", Ta=18),
            dict(id="A1", parent="A", Lf=9, odf=22, Lr=9, odr=15, ins="geg100", Ta=22),
            dict(id="A2", parent="A", Lf=21, odf=22, Lr=21, odr=15, ins="geg100", Ta=22),
            dict(id="B1", parent="B", Lf=15, odf=22, Lr=16, odr=15, ins="none", Ta=24)]
    for meth in ("split", "thermo", "none"):
        out.append(dict(id="tree_" + meth, note="branched tree " + meth, method=meth, T_set=56, sections=tree))
    # CR-31: thermostatic setpoint 0.1 K below the outlet on a long bare loop -> flow capped at v_max
    out.append(dict(id="thermo_cap_vmax", note="thermostatic 59.9 C, 200 m bare 22 mm: flow limited by v_max", method="thermo", T_set=59.9,
                    sections=[dict(id="A", parent=None, Lf=200, odf=22, Lr=200, odr=15, ins="none", Ta=20)]))
    # CR-33: a size between series sizes is computed with the nearest series size (26 -> 28 x 1.5)
    out.append(dict(id="od_snapped", note="flow pipe 26 mm entered, computed as 28 x 1.5", method="split",
                    sections=[dict(id="A", parent=None, Lf=30, odf=26, Lr=30, odr=15, ins="geg100", Ta=20)]))
    # r3 X2-3: insulation class must be one of the four METHOD classes; missing -> geg100 (METHOD 8a)
    out.append(dict(id="ins_missing_default", note="insulation class omitted -> geg100 (same as single_1)", method="split", dT_design=5,
                    sections=[dict(id="A", parent=None, Lf=20, odf=22, Lr=20, odr=15, Ta=20)]))
    out.append(dict(id="bad_ins_bare", note="invalid input: insulation 'bare' is not a METHOD class -> ins:A", method="split",
                    sections=[dict(id="A", parent=None, Lf=100, odf=22, Lr=100, odr=15, ins="bare", Ta=20)]))
    out.append(dict(id="bad_ins_case", note="invalid input: 'GEG100' (wrong case) on one riser of a tree -> ins:B only", method="split",
                    sections=[dict(id="P", parent=None, Lf=4, odf=42, Lr=4, odr=22, ins="geg100", Ta=18),
                              dict(id="A", parent="P", Lf=12, odf=28, Lr=12, odr=15, ins="geg50", Ta=18),
                              dict(id="B", parent="P", Lf=25, odf=28, Lr=25, odr=15, ins="GEG100", Ta=18)]))
    out.extend(anchor_cases())
    for c in out:
        c.setdefault("dT_basis", "loop")
        for s in c["sections"]:
            s.setdefault("ins_mm", 0)
        errs = input_errors(c)
        if errs:
            c["expect"] = dict(valid=False, errors=errs)
            continue
        c["expect"] = compute(dict(c, sections=[dict(s, ins=INS_DEFAULT if s.get("ins") in (None, "") else s["ins"]) for s in c["sections"]]))
        for k, (val, tol) in c.get("anchor", {}).items():
            got = c["expect"][k] if "." not in k else c["expect"]["leaves"][k.split(".")[0]][k.split(".")[1]]
            assert abs(got - val) <= tol * abs(val), (c["id"], k, got, val)
    return out


# ---------------------------------------------------------------- external anchors, worked by hand (D-PLB-10)
def anchor_cases():
    """Hand calculations (pencil + pocket calculator), written out so that they can be checked without this code.

    A1  (flow-pipe rule, dT_basis = flow) one loop, copper 22x1 flow / 15x1 return, 20 m each, GEG Anlage 8 row 1 (d_i <= 22 mm: 20 mm at lambda 0.035),
        h_o = 9 W/(m2 K), Ta = 20 C, outlet 60 C, W 553 dT = 5 K.
        EN ISO 12241 cylinder: U' = pi / (ln(D/d)/(2 lambda) + 1/(h_o D))
          flow   D = 22 + 2*20 = 62 mm: ln(62/22) = 1.03609; /0.07 = 14.8013; 1/(9*0.062) = 1.79211; U'f = pi/16.5934 = 0.189328 W/(m K)
          return D = 15 + 40 = 55 mm:   ln(55/15) = 1.29928; /0.07 = 18.5612; 1/(9*0.055) = 2.02020; U'r = pi/20.5814 = 0.152642 W/(m K)
        W 553: design loss of the flow pipe at the mean 57.5 C: Q = 0.189328 * 20 * 37.5 = 141.996 W
               circulation flow m = Q/(c_p dT) = 141.996/(4184*5) = 6.78756e-3 kg/s  (m c_p = 28.3992 W/K)
        exponential cooling: U'L/(m c_p) = 5/37.5 = 0.133333 -> T_flow,end = 20 + 40 e^-0.133333 = 55.0069 C
               return: U'L/(m c_p) = 3.05285/28.3992 = 0.107498 -> T_return = 20 + 35.0069 e^-0.107498 = 51.4390 C
        energy balance: loss = 28.3992 * (60 - 51.4390) = 243.13 W
        -> 51.44 C < 55 C: the flow-pipe rule alone does NOT meet W 551 / the W 553 preface ("Abkühlung ... zwischen
           Austritt Trinkwassererwärmer und Zirkulationseintritt ... von 5 K"); the engine must flag return_below_min (hard).
    A1L (whole loop, dT_basis = loop, r4 Y3-1) same loop, return into the heater = 60 - 5 = 55 C:
        55 - 20 = 40 exp(-(U'f Lf + U'r Lr)/(m c_p)) -> m = (3.78655 + 3.05285)/(4184 ln(40/35))
          ln(8/7) = 0.133531; 4184*0.133531 = 558.695; m = 6.83940/558.695 = 0.0122417 kg/s (Codex hand value 0.01224)
        m c_p = 51.2193 W/K; flow end: 3.78655/51.2193 = 0.073928 -> 20 + 40 e^-0.073928 = 57.1495 C
        loss = 51.2193 * 5 = 256.10 W; V = 0.0122417 kg/s / 984.7 kg/m3 (57.5 C) * 3.6e6 = 44.76 L/h
        The same 0.0122417 kg/s is the flow the flow-pipe case A1 reports as needed for a 55 C return (m_return_min).
    A2  W 553 proportional split, bare copper 15x1 everywhere (U' = pi h_o d = pi*9*0.015 = 0.424115 W/(m K)),
        root P 10 m, risers A 20 m and B 10 m (flow pipe lengths), Ta 20 C: q = 0.424115*37.5 = 15.9043 W/m,
        Q = 159.04 + 318.09 + 159.04 = 636.17 W -> m = 636.17/20920 = 0.0304098 kg/s; split A:B = 318.09:159.04 = 2:1
        -> m_A = 0.0202732, m_B = 0.0101366 kg/s. P end: e^-(4.24115/127.235) = e^-1/30 -> 58.6886 C;
        A and B ends: e^-0.1 -> 20 + 38.6886*0.904837 = 55.0069 C (each riser ends at ~55 C: the point of W 553).
    A3  A1 network with a thermostatic valve set to 57 C at the loop end: steady state of the two exponential pipes
        T_set - Ta = (T_out - Ta) exp(-(U'f Lf + U'r Lr)/(m c_p)) ->
        m = (3.78655 + 3.05285)/(4184 ln(40/37)) = 6.83940/(4184*0.0779615) = 0.0209675 kg/s; loss = m c_p (60-57) = 263.18 W.
    """
    a1 = [dict(id="A", parent=None, Lf=20, odf=22, Lr=20, odr=15, ins="geg100", Ta=20)]
    a2 = [dict(id="P", parent=None, Lf=10, odf=15, Lr=10, odr=15, ins="none", Ta=20),
          dict(id="A", parent="P", Lf=20, odf=15, Lr=20, odr=15, ins="none", Ta=20),
          dict(id="B", parent="P", Lf=10, odf=15, Lr=10, odr=15, ins="none", Ta=20)]
    T = 0.002  # relative tolerance of the hand arithmetic (5-6 significant digits, temperatures in C)
    return [
        dict(id="anchor_A1_single_loop", note="external anchor (hand): EN ISO 12241 U', GEG Anlage 8, W 553 flow-pipe rule, exponential cooling; return 51.44 C < 55 C = hard fail",
             method="split", sections=a1,
             dT_basis="flow",
             anchor={"QW_design_W": (141.996, T), "m_total_kgs": (6.78756e-3, T), "A.T_f_end": (55.0069, T),
                     "T_return": (51.4390, T), "Q_loss_W": (243.13, T), "m_return_min_kgs": (0.0122417, T)}),
        dict(id="anchor_A1L_whole_loop", note="external anchor (hand, r4 Y3-1): 5 K over the whole loop, return 55.0 C into the heater",
             method="split", dT_basis="loop", sections=a1,
             anchor={"m_total_kgs": (0.0122417, T), "A.T_f_end": (57.1495, T), "T_return": (55.0, T), "Q_loss_W": (256.10, T),
                     "V_total_lph": (44.76, T)}),
        dict(id="anchor_A2_w553_split", note="external anchor (hand): W 553 proportional split 2:1, risers end at 55.0 C",
             method="split", dT_basis="flow", sections=a2,
             anchor={"QW_design_W": (636.17, T), "m_total_kgs": (0.0304098, T), "A.m_kgs": (0.0202732, T),
                     "B.m_kgs": (0.0101366, T), "A.T_f_end": (55.0069, T), "B.T_f_end": (55.0069, T)}),
        dict(id="anchor_A3_thermostatic", note="external anchor (hand): thermostatic valve 57 C, analytic loop flow",
             method="thermo", T_set=57, sections=a1,
             anchor={"m_total_kgs": (0.0209675, T), "A.T_r_out": (57.0, T), "Q_loss_W": (263.18, T)}),
    ]


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    data = cases()
    with open(os.path.join(here, "plbcirc_ref.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    print("plbcirc_ref.json: %d cases" % len(data))
