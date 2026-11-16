"""Independent reference for mepmonitoring (Condition Monitoring Advisor).

Written from the published method, not from mep-monitoring.js:
  * P-F interval and the half-window inspection rule: J. Moubray, Reliability-centred
    Maintenance II (1997), ch. 7; NASA RCM Guide for Facilities and Collateral Equipment (2008), 5.2.
  * Detection probability for periodic inspection with random onset phase: the onset of P is
    uniform relative to the inspection calendar; inspections falling inside the detection window
    W each detect with probability p (independent, at most `cap` effective looks).
    Here P(det) is obtained by NUMERICAL averaging over the phase (fine grid, explicit counting of
    the inspection instants inside the window) and cross-checked by Monte Carlo -- not by the
    closed form used in the tool.
  * Economics: expected annual value, benefit = n*lambda*P(det)*c*[(C_fail - C_plan) + D*max(0, MTTR - t_plan)],
    cost = n*(readings*C_read + C_fixed + FA*C_FA); break-even D by bisection on net(D) = 0
    (the tool solves it in closed form).
Cases: the tool's six presets with all their options (inputs restated here from the page's
preset table, so a silent change in the tool's presets shows up as a failure) plus a synthetic
grid of windows, intervals, detection probabilities and look caps.

Run:  python -I bench-src/ref/gen_mepmonitoring.py  -> bench-src/ref/mepmonitoring_ref.json
"""
import json
import math
import os
import random

DAYS_Y = 365.0
ROUTE_MIN, ROUTE_MAX = 7.0, 730.0
SAMPLE = {"online": 1.0 / 24.0, "bms": 1.0 / 96.0}
CAP = {"route": None, "online": 1, "bms": 1}


def p_detect_numeric(W, I, p, cap, n_phase=200000):
    """Average over the phase phi in [0, I): inspections at phi + j*I; count those in [0, W)."""
    if W <= 0 or I <= 0 or p <= 0:
        return 0.0
    acc = 0.0
    for i in range(n_phase):
        phi = (i + 0.5) * I / n_phase
        if phi >= W:
            n = 0
        else:
            n = int(math.floor((W - phi) / I)) + 1  # phi, phi+I, ... < W
            # an inspection exactly at W counts as inside (closed window); measure-zero, ignored
        if cap is not None:
            n = min(n, cap)
        acc += 1.0 - (1.0 - p) ** n
    return acc / n_phase


def p_detect_mc(W, I, p, cap, n=200000, seed=7):
    rng = random.Random(seed)
    hit = 0
    for _ in range(n):
        onset = rng.random() * I          # time from the previous inspection to the onset
        first = I - onset                 # first inspection after onset
        looks = 0
        t = first
        while t < W:
            looks += 1
            t += I
        if cap is not None:
            looks = min(looks, cap)
        detected = any(rng.random() < p for _ in range(looks))
        hit += 1 if detected else 0
    return hit / n


def interval_for(case, opt):
    usable_lo = opt["pf_fraction"] * case["pf_days"][0]
    rec = max(0.0, (usable_lo - case["response_days"]) / 2.0)
    if opt["mode"] == "route":
        if opt.get("interval_days"):
            I = opt["interval_days"]
        else:
            I = min(max(rec, ROUTE_MIN), ROUTE_MAX) if rec > 0 else ROUTE_MIN
    else:
        I = SAMPLE[opt["mode"]]
    return I, rec


def economics(case, opt, I, pf, mtbf, c_read, c_fixed, D, pdet):
    lam = 1.0 / mtbf
    dC = case["corrective_cost_eur"] - case["planned_repair_cost_eur"]
    dh = max(0.0, case["mttr_h"] - case["planned_downtime_h"])
    c = case["consequence_probability"]
    n = case["units"]
    benefit = n * lam * pdet * c * (dC + D * dh)
    readings = DAYS_Y / I
    cost = n * ((readings * c_read if opt["mode"] == "route" else 0.0) + c_fixed
                + case["false_alarms_y"] * case["false_alarm_cost_eur"])
    return benefit, cost


def breakeven(case, opt, I, pf, mtbf, c_read, c_fixed, pdet):
    f = lambda D: (lambda b, c: b - c)(*economics(case, opt, I, pf, mtbf, c_read, c_fixed, D, pdet))
    if pdet <= 0:
        return None, "never"
    if f(0.0) >= 0:
        return 0.0, "always"
    dh = max(0.0, case["mttr_h"] - case["planned_downtime_h"])
    if dh <= 0:
        return None, "never"
    lo, hi = 0.0, 1.0
    while f(hi) < 0:
        hi *= 2.0
        if hi > 1e12:
            return None, "never"
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) < 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi), "finite"


def costs(opt):
    if opt["mode"] == "route":
        return opt["cost_per_reading_eur"], [0.0, 0.0, 0.0]
    return [0.0, 0.0, 0.0], opt["fixed_eur_y"]


def evaluate(case, opt):
    I, rec = interval_for(case, opt)
    cap = CAP[opt["mode"]]
    cr, cf = costs(opt)
    combos = {  # lo = pessimistic for net, hi = optimistic
        "lo": (case["pf_days"][0], case["mtbf_y"][2], cr[2], cf[2]),
        "mid": (case["pf_days"][1], case["mtbf_y"][1], cr[1], cf[1]),
        "hi": (case["pf_days"][2], case["mtbf_y"][0], cr[0], cf[0]),
    }
    out = {"interval_days": I, "recommended_interval_days": rec, "readings_per_year": DAYS_Y / I}
    for k, (pf, mtbf, c_read, c_fixed) in combos.items():
        W = opt["pf_fraction"] * pf - case["response_days"]
        pdet = p_detect_numeric(W, I, opt["pod"], cap, n_phase=2000 if opt["mode"] != "route" else 50000)
        b, c = economics(case, opt, I, pf, mtbf, c_read, c_fixed, case["downtime_cost_eur_h"], pdet)
        out["p_detect_" + k] = pdet
        out["net_eur_y_" + k] = b - c
        out["cost_eur_y_" + k] = c
        if k == "mid":
            be, kind = breakeven(case, opt, I, pf, mtbf, c_read, c_fixed, pdet)
            out["breakeven_downtime_eur_h_mid"] = be
            out["breakeven_kind_mid"] = kind
    return out


# --- the six presets of the page, restated --------------------------------------------------------
def C(pf, mtbf, resp, corr, plan, D, mttr, pdt, cp=1.0, units=1, fa=0.0, fac=0.0):
    return {"pf_days": pf, "mtbf_y": mtbf, "response_days": resp, "corrective_cost_eur": corr,
            "planned_repair_cost_eur": plan, "downtime_cost_eur_h": D, "mttr_h": mttr,
            "planned_downtime_h": pdt, "consequence_probability": cp, "units": units,
            "false_alarms_y": fa, "false_alarm_cost_eur": fac, "safety": False}


def R(id_, tech, I, pod, frac, cpr):
    return {"id": id_, "technique": tech, "mode": "route", "interval_days": I, "pod": pod,
            "pf_fraction": frac, "cost_per_reading_eur": cpr}


def O(id_, tech, mode, pod, frac, fixed):
    return {"id": id_, "technique": tech, "mode": mode, "pod": pod, "pf_fraction": frac, "fixed_eur_y": fixed}


PRESETS = {
    "pump_vibration": (C([7, 14, 28], [3, 6, 10], 2, 9000, 2500, 300, 24, 4, fa=0.2, fac=150), [
        R("vib_route_m", "vibration", 30, 0.9, 0.8, [25, 40, 70]),
        R("vib_route_w", "vibration", 7, 0.9, 0.8, [25, 40, 70]),
        O("vib_online", "vibration", "online", 0.9, 0.8, [600, 1000, 1600]),
        R("us_route_m", "ultrasound_airborne", 30, 0.75, 0.85, [10, 20, 40])]),
    "lv_thermography": (C([30, 120, 365], [15, 40, 80], 7, 25000, 800, 200, 48, 0), [
        R("ir_annual", "ir_thermography", 365, 0.95, 0.7, [250, 400, 700]),
        R("ir_6m", "ir_thermography", 182, 0.95, 0.7, [250, 400, 700]),
        O("ir_online", "ir_thermography", "online", 0.85, 0.6, [900, 1500, 2500])]),
    "ahu_dp_bms": (C([20, 45, 90], [0.5, 1, 2], 3, 600, 350, 50, 4, 1, fa=0.5, fac=40), [
        O("dp_bms", "dp_trend", "bms", 0.95, 0.9, [0, 30, 100]),
        R("dp_gauge_m", "dp_trend", 30, 0.9, 0.9, [10, 15, 25])]),
    "ups_battery": (C([60, 120, 240], [3, 5, 8], 14, 6000, 5000, 20000, 4, 0, cp=0.3, fa=0.1, fac=300), [
        R("discharge_annual", "performance_test", 365, 0.98, 1.0, [1500, 2500, 4000]),
        R("impedance_q", "battery_impedance", 91, 0.8, 0.8, [150, 250, 400]),
        O("impedance_online", "battery_impedance", "online", 0.8, 0.8, [800, 1200, 2000])]),
    "chiller_oil": (C([90, 180, 365], [8, 15, 25], 14, 40000, 8000, 150, 336, 24, fa=0.2, fac=200), [
        R("oil_annual", "oil_analysis", 365, 0.7, 0.7, [40, 70, 120]),
        R("oil_q", "oil_analysis", 91, 0.7, 0.7, [40, 70, 120]),
        R("vib_q", "vibration", 91, 0.9, 0.5, [25, 40, 70])]),
    "fcu_rtf": (C([7, 21, 45], [8, 12, 20], 7, 450, 300, 20, 4, 2), [
        R("us_q", "ultrasound_airborne", 91, 0.7, 0.7, [8, 12, 20]),
        O("vib_online_fcu", "vibration", "online", 0.85, 0.8, [60, 120, 250])]),
}


def main():
    cases = []
    for pid, (case, opts) in PRESETS.items():
        for o in opts:
            cases.append({"id": pid + "/" + o["id"], "kind": "preset", "preset": pid, "case": case, "option": o,
                          "ref": evaluate(case, o)})
    # synthetic grid: windows and intervals around the interesting ratios, auto interval, units, caps
    grid = 0
    for pf in (10, 40, 150):
        for frac in (0.5, 0.9):
            for I in (None, 7, 30, 91):
                for pod in (0.6, 1.0):
                    case = C([pf * 0.5, pf, pf * 2], [2, 5, 12], 3, 5000, 1500, 400, 12, 2, units=3, fa=0.3, fac=100)
                    o = R("g%d" % grid, "vibration", I, pod, frac, [20, 35, 60])
                    cases.append({"id": "grid/%d" % grid, "kind": "grid", "case": case, "option": o, "ref": evaluate(case, o)})
                    grid += 1
    # Monte Carlo cross-check of the numeric phase average on a few points
    mc = []
    for (W, I, p, cap) in ((9.2, 30, 0.9, None), (37.5, 30, 0.9, None), (82, 91, 0.8, None), (45, 30, 0.5, None), (100, 1 / 24, 0.9, 1)):
        a = p_detect_numeric(W, I, p, cap, 200000 if cap is None else 20000)
        b = p_detect_mc(W, I, p, cap, 100000 if cap is None else 20000)
        mc.append({"W": W, "I": I, "pod": p, "cap": cap, "numeric": a, "monte_carlo": b, "abs_diff": abs(a - b)})
    out = {"generator": "bench-src/ref/gen_mepmonitoring.py", "method": __doc__.strip().splitlines()[0],
           "n_cases": len(cases), "cases": cases, "mc_crosscheck": mc}
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "mepmonitoring_ref.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print("cases", len(cases), "mc max diff", max(m["abs_diff"] for m in mc))


if __name__ == "__main__":
    main()
