#!/usr/bin/env python3
"""Independent reference for mepstrategy (MEP Maintenance Strategy, RCM).

Written from the published method, not ported from mep-strategy.js:
  * RCM decision logic - SAE JA1011 (2009) / JA1012 (2011), J. Moubray RCM II (1997):
    consequences first (hidden / safety-environment / operational / non-operational), then
    on-condition -> scheduled restoration/discard -> failure finding -> default action
    (redesign compulsory for safety, run-to-failure otherwise; class A: redesign desirable).
  * on-condition interval: half of (usable P-F minus response), rounded DOWN to the next practical
    CMMS interval (1, 7, 14, 30, 61, 91, 122, 182, 273, 365 ... days); continuous logging (BMS / dP trend)
    detects within an hour.
  * catch probability: readings every I days with a uniformly random phase; a reading in the window
    [P', F - R] finds the defect with probability d. Evaluated here by direct numerical averaging over
    the phase (20 000 phases), not by a closed form.
  * failure finding: Moubray FFI = 2 U MTBF; exact mean unavailability of a periodically proof-tested
    exponential component U(T) = 1 - (M/T)(1 - exp(-T/M)), inverted here with Newton's method.
  * age replacement (Barlow & Proschan 1965): Weibull life (shape beta, mean = MTBF), long-run cost rate
    C(T) = [Cp R(T) + Cf (1 - R(T))] / integral_0^T R dt, minimised on a dense grid (trapezoid integral);
    safety wear-out uses the safe life where F(T) = U.
  * statutory tests are kept whatever the outcome; a more frequent statutory proof test governs.

Learning-assumption defaults (documented in the tool): U by class A 0.5 %, B 2 %, C 5 %; response
A 3 d, B 7 d, C 21 d; d = 0.9; beta = 3; safety CBM must reach P(catch) >= 0.99; age replacement must
save >= 5 %; planned repair = 0.6 x corrective; 0.5 h per CBM reading, 2 h per planned job, 1 h per test,
labour 75 EUR/h; continuous trends cost 12 reviews a year.

Writes bench-src/ref/mepstrategy_ref.json. Standard library only.
"""
import json, math, os, itertools

PRACTICAL = [1, 7, 14, 30, 61, 91, 122, 182, 273, 365, 548, 730, 1095, 1461, 1826, 2557, 3652]
CONTINUOUS = {"bms_trend", "dp_trend"}
RATE = 75.0
H_CBM, H_TIME, H_FF = 0.5, 2.0, 1.0


def practical(days):
    if days is None or days <= 0:
        return None
    if days < 1:
        return days
    return max(p for p in PRACTICAL if p <= days + 1e-9)


def p_catch_numeric(pfu, interval, response, d, n=20000):
    """average over the phase of P(at least one detecting reading inside [0, W])"""
    W = pfu - response
    if W < 0 or interval <= 0:
        return 0.0
    tot = 0.0
    for i in range(n):
        phi = (i + 0.5) / n * interval
        k = 0 if phi > W + 1e-12 else int(math.floor((W - phi) / interval + 1e-12)) + 1
        tot += 1 - (1 - d) ** k
    return tot / n


def u_exact(T, M):
    x = T / M
    return 1 - (1 - math.exp(-x)) / x if x > 0 else 0.0


def ffi_exact(U, M):
    T = 2 * U * M  # start from Moubray's approximation, Newton on f(T) = u_exact(T) - U
    for _ in range(100):
        x = T / M
        f = u_exact(T, M) - U
        # d/dT [1 - (1 - e^-x)/x] = [ (1-e^-x)/x^2 - e^-x/x ] / M
        df = ((1 - math.exp(-x)) / x ** 2 - math.exp(-x) / x) / M
        step = f / df
        T -= step
        if abs(step) < 1e-14 * max(T, 1):
            break
    return T


def weibull_eta(mean, beta):
    return mean / math.gamma(1 + 1 / beta)


def cost_rate_curve(mean, beta, Cp, Cf, n=30000):
    eta = weibull_eta(mean, beta)
    Tmax = 3 * eta
    h = Tmax / n
    integ = 0.0
    prevR = 1.0
    best = None
    for i in range(1, n + 1):
        t = i * h
        R = math.exp(-((t / eta) ** beta))
        integ += 0.5 * (prevR + R) * h
        prevR = R
        c = (Cp * R + Cf * (1 - R)) / integ
        if best is None or c < best[1]:
            best = (t, c)
    return eta, best


def cost_rate_at(T, mean, beta, Cp, Cf, n=20000):
    eta = weibull_eta(mean, beta)
    h = T / n
    integ = sum(0.5 * (math.exp(-((i * h / eta) ** beta)) + math.exp(-(((i + 1) * h / eta) ** beta))) * h for i in range(n))
    R = math.exp(-((T / eta) ** beta))
    return (Cp * R + Cf * (1 - R)) / integ


def decide(case):
    cls = case["cls"]
    U = case.get("u_tol", {"A": 0.005, "B": 0.02, "C": 0.05}[cls])
    R = case.get("response_days", {"A": 3, "B": 7, "C": 21}[cls])
    d = case.get("p_detect", 0.9)
    beta = case.get("beta", 3.0)
    ev, safe, pat = case["evident"], case["safety"], case["pattern"]
    pf, M = case.get("pf_days"), case["mtbf_y"]
    tech = case.get("tech")
    frac = case.get("pf_fraction", 0.5)
    cread = case.get("cost_read", 0.0)
    access = case.get("access", True)
    Ccorr = case["corrective_eur"]
    Cp = case["planned_eur"]
    Cf = Ccorr + case.get("downtime_eur_h", 0) * case.get("mttr_h", 0)
    lam = 1 / M
    rtf = lam * Cf
    hidden = not ev
    must = safe  # safety/environment, evident or hidden (multiple failure)
    out = {"rtf_cost_y": rtf}

    # consequence
    if hidden:
        cons = "hidden_safety" if safe else "hidden"
    elif safe:
        cons = "safety"
    elif cls in ("A", "B"):
        cons = "operational"
    else:
        cons = "non_operational"
    out["consequence"] = cons

    # on-condition
    cbm_ok, cbm = False, {}
    if pf and pf > 0 and tech and access:
        pfu = pf * frac
        cont = tech in CONTINUOUS
        if pfu - R > 0:
            Icalc = 1 / 24 if cont else (pfu - R) / 2
            if cont or Icalc >= 1:
                I = Icalc if cont else practical(Icalc)
                pc = p_catch_numeric(pfu, I, R, d) if not cont else p_catch_numeric(pfu, I, R, d, n=2000)
                reads = 12 if cont else 365 / I
                cost = reads * (cread + (0 if cont else H_CBM * RATE))
                total = cost + lam * (pc * (Cp + H_TIME * RATE) + (1 - pc) * Cf)
                worth = pc >= 0.99 - 1e-9 if must else total < rtf
                cbm = {"interval_days": I, "interval_calc_days": Icalc, "p_catch": pc, "total_y": total, "margin": (total - rtf) / rtf if not must else (pc - 0.99) * 100}
                cbm_ok = worth
    out["cbm"] = cbm

    # scheduled restoration / discard
    time_ok, tim = False, {}
    if pat == "wearout":
        if must:
            eta = weibull_eta(M, beta)
            sl = eta * (-math.log(1 - U)) ** (1 / beta) * 365
            tim = {"safe_life_days": sl, "interval_days": practical(sl)}
            time_ok = sl >= 1
        else:
            eta, (Topt, cmin) = cost_rate_curve(M, beta, Cp + H_TIME * RATE, Cf)
            interior = Topt < 2.95 * eta
            # the task runs at the practical interval (T* rounded down): its cost and saving are taken there
            Ip = practical(Topt * 365)
            cI = cost_rate_at(Ip / 365, M, beta, Cp + H_TIME * RATE, Cf)
            saving = 1 - cI / rtf
            tim = {"T_opt_days": Topt * 365, "interval_days": Ip, "total_y": cI, "cost_opt_y": cmin, "saving": saving}
            time_ok = interior and saving >= 0.05
    out["time"] = tim

    # failure finding
    ff_ok, ff = False, {}
    if hidden:
        ffi = 2 * U * M * 365
        ff = {"ffi_days": ffi, "ffi_exact_days": ffi_exact(U, M) * 365, "interval_days": practical(ffi)}
        ffmin = case.get("ff_min_days", 7)
        ff_ok = ffi >= ffmin
        if not ff_ok:
            # below the practical minimum of the test: keep the statutory test proving this failure mode,
            # otherwise the test at its minimum interval, and report the unavailability that results
            keep = case.get("statutory_days", ffmin)
            ff["interim_days"] = keep
            ff["u_interim"] = u_exact(keep / 365, M)
        if case.get("since_test_y") is not None:
            ff["p_failed_now"] = 1 - math.exp(-case["since_test_y"] / M)
    out["ff"] = ff

    if cbm_ok:
        kind, interval, comp = "cbm", cbm["interval_days"], False
    elif time_ok:
        kind, interval, comp = "time", tim["interval_days"], False
    elif hidden and ff_ok:
        kind, interval, comp = "ff", ff["interval_days"], False
    elif hidden:
        kind, interval, comp = "redesign", None, must
    elif must:
        kind, interval, comp = "redesign", None, True
    elif cls == "A":
        kind, interval, comp = "redesign", None, False
    else:
        kind, interval, comp = "rtf", None, False
    out.update(kind=kind, interval_days=interval, compulsory=comp)

    # user's inspection interval
    ui = case["insp_days"]
    if pf and pf > 0 and tech and access:
        out["p_catch_user"] = p_catch_numeric(pf * frac, ui, R, d)
    if hidden:
        out["u_user"] = u_exact(ui / 365, M)
    stat = case.get("statutory_days")
    if stat is not None and kind == "ff" and stat < ff["ffi_days"]:
        out["statute_governs"] = True
        out["interval_days"] = stat  # the statute sets the interval; the FFI stays as information
    return out


def presets():
    """the seven teaching cases of the tool, restated here from their published inputs"""
    P = []
    P.append(dict(id="filter_dp", cls="B", evident=True, safety=False, pattern="wearout", pf_days=45, mtbf_y=0.5, tech="dp_trend", pf_fraction=0.9, cost_read=20,
                  corrective_eur=900, planned_eur=350, downtime_eur_h=0, mttr_h=0, insp_days=1))
    P.append(dict(id="standby_never", cls="B", evident=False, safety=False, pattern="hidden", pf_days=None, mtbf_y=8, tech=None,
                  corrective_eur=1800, planned_eur=1080, downtime_eur_h=0, mttr_h=8, since_test_y=6, insp_days=91))
    P.append(dict(id="fcu_rtf", cls="C", evident=True, safety=False, pattern="wearout", pf_days=60, mtbf_y=12, tech="vibration", pf_fraction=0.7, cost_read=25,
                  corrective_eur=450, planned_eur=300, downtime_eur_h=0, mttr_h=3, insp_days=19))
    P.append(dict(id="switchboard_redesign", cls="A", evident=True, safety=True, pattern="random", pf_days=90, mtbf_y=25, tech="ir_thermography", pf_fraction=0.8, cost_read=250,
                  access=False, corrective_eur=40000, planned_eur=24000, downtime_eur_h=20000, mttr_h=24, insp_days=30))
    P.append(dict(id="sprinkler_statutory", cls="A", evident=False, safety=True, pattern="hidden", pf_days=None, mtbf_y=10, tech=None,
                  corrective_eur=6000, planned_eur=3600, downtime_eur_h=0, mttr_h=24, statutory_days=7, insp_days=30))
    P.append(dict(id="ups_battery", cls="A", evident=False, safety=False, pattern="wearout", pf_days=180, mtbf_y=5, tech="battery_impedance", pf_fraction=0.8, cost_read=150,
                  corrective_eur=8000, planned_eur=4800, downtime_eur_h=20000, mttr_h=2, insp_days=61))
    P.append(dict(id="chiller_pf", cls="A", evident=True, safety=False, pattern="random", pf_days=120, mtbf_y=15, tech="vibration", pf_fraction=0.7, cost_read=25,
                  corrective_eur=45000, planned_eur=18000, downtime_eur_h=2000, mttr_h=72, insp_days=30))
    P.append(dict(id="chiller_pf_quarterly", base="chiller_pf", cls="A", evident=True, safety=False, pattern="random", pf_days=120, mtbf_y=15, tech="vibration", pf_fraction=0.7, cost_read=25,
                  corrective_eur=45000, planned_eur=18000, downtime_eur_h=2000, mttr_h=72, insp_days=90))
    P.append(dict(id="switchboard_with_ir", base="switchboard_redesign", cls="A", evident=True, safety=True, pattern="random", pf_days=90, mtbf_y=25, tech="ir_thermography", pf_fraction=0.8, cost_read=250,
                  access=True, corrective_eur=40000, planned_eur=24000, downtime_eur_h=20000, mttr_h=24, insp_days=30))
    # D-MEP-9: emergency lighting battery autonomy (full rated-duration discharge, minimum 30 d between tests)
    P.append(dict(id="el_battery_A", cls="A", evident=False, safety=True, pattern="hidden", pf_days=None, mtbf_y=4, tech=None, class_id="emergency_lighting", fm_key="battery_duration",
                  corrective_eur=1500, planned_eur=900, downtime_eur_h=0, mttr_h=4, ff_min_days=30, statutory_days=365, insp_days=365))
    P.append(dict(id="el_battery_B", cls="B", evident=False, safety=True, pattern="hidden", pf_days=None, mtbf_y=4, tech=None, class_id="emergency_lighting", fm_key="battery_duration",
                  corrective_eur=1500, planned_eur=900, downtime_eur_h=0, mttr_h=4, ff_min_days=30, statutory_days=365, insp_days=30))
    P.append(dict(id="hidden_min_no_statute", cls="A", evident=False, safety=False, pattern="hidden", pf_days=None, mtbf_y=5, tech=None,
                  corrective_eur=8000, planned_eur=4800, downtime_eur_h=0, mttr_h=2, ff_min_days=30, insp_days=30))
    return P


def grid():
    """a parametric sweep through every branch of the decision diagram"""
    out = []
    n = 0
    combos = itertools.product(["A", "B", "C"], [True, False], [False, True], ["wearout", "random"], [None, 40, 150], [2, 12])
    for cls, ev, safe, pat, pf, M in combos:
        n += 1
        if not ev and pat == "random" and pf is not None:
            pat = "hidden"
        tech = None if pf is None else ("vibration" if n % 3 else "bms_trend")
        c = dict(id="g%03d" % n, cls=cls, evident=ev, safety=safe, pattern=pat, pf_days=pf, mtbf_y=M, tech=tech, pf_fraction=0.7, cost_read=30,
                 corrective_eur=[800, 5000, 30000][n % 3], downtime_eur_h=[0, 100, 1000][(n // 3) % 3], mttr_h=8, insp_days=[14, 30, 61, 120][n % 4])
        c["planned_eur"] = round(c["corrective_eur"] * 0.6)
        if not ev and n % 4 == 0:
            c["since_test_y"] = 3.0
        out.append(c)
    return out


def main():
    cases = presets() + grid()
    ref = []
    skipped = 0
    for c in cases:
        r = decide(c)
        # a case whose decision sits within 2 % of a cost tie is not a fair test of either side
        m = r["cbm"].get("margin") if r["cbm"] else None
        if m is not None and abs(m) < 0.02 and not c["id"].startswith(("filter", "standby", "fcu", "switch", "sprinkler", "ups", "chiller")):
            skipped += 1
            continue
        if r["time"] and r["time"].get("saving") is not None and abs(r["time"]["saving"] - 0.05) < 0.01:
            skipped += 1
            continue
        ref.append({"id": c["id"], "inputs": c, "expect": r})
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "mepstrategy_ref.json"), "w", encoding="utf-8") as f:
        json.dump({"generator": "bench-src/ref/gen_mepstrategy.py", "method": __doc__.strip().splitlines()[0], "skipped_near_ties": skipped, "cases": ref}, f, indent=1)
    print("mepstrategy reference: %d cases (%d near-tie cases skipped)" % (len(ref), skipped))


if __name__ == "__main__":
    main()
