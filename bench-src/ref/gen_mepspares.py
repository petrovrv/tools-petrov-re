"""Independent reference for mepspares (Critical Spares & Recovery).

Written from the published method, not from mep-spares.js:
  * Base-stock (S-1, S) model with Poisson demand: outstanding resupply orders X ~ Poisson(mu),
    mu = N*lambda*L (Palm's theorem; C. C. Sherbrooke, Optimal Inventory Modeling of Systems,
    2nd ed., 2004, ch. 2). Fill rate = P(X <= k-1); expected backorders EBO(k) = E[(X-k)+];
    mean wait per demand = EBO / (N*lambda) (Little's law, J. D. C. Little, 1961).
    Here the Poisson terms come from lgamma (not a recurrence) and EBO is the direct tail sum
    of its definition (not the finite closed form used in the tool).
  * Credited redundancy with a constant standby hazard r: expected outage during a wait W is
    the integral of P(standby failed at t) = 1 - exp(-r t) over [0, W]; here by Simpson's rule
    (the tool uses the closed form). For a stock option the wait is the two-point mixture
    stated in the tool's documentation (fill -> W0, else W0 + conditional mean backorder delay).
  * Season: one contiguous block of share s per year, failures uniform over the year. The expected
    in-season part of a window and the probability that a window touches the season are computed
    here by numerical integration over the start phase (the tool uses s*W and min(1, s + W/8760)).
  * Costs: holding = rate*price*spares owned; agreement fee; rental = mobilisation x P(touch) +
    day rate x in-season hire days, both per failure; downtime = D x failures/y x in-season outage.
  * Choice: minimum expected annual cost among the enabled options (ties: shorter recovery, then the
    option order none, stock, dedicated, pool, agreement, rental); unpriced downtime: cheapest option
    that meets the tolerable downtime, else the fastest. Stock level: economic optimum = brute-force
    global minimum over k = 1..60,
    service-target k = smallest k with fill >= target, stock = max of both when the target is enforced.
Cases: the tool's six presets (inputs restated here, so a silent change of a preset shows up as drift)
plus a synthetic grid. A Monte Carlo of the (S-1, S) system cross-checks fill rate and mean wait.

Run:  python -I bench-src/ref/gen_mepspares.py  -> bench-src/ref/mepspares_ref.json
"""
import json
import math
import os
import random

HY = 8760.0
ORDER = ["none", "stock", "dedicated", "pool", "agreement", "rental"]


# ---------------------------------------------------------------- Poisson, by definition
def pois(x, mu):
    if mu <= 0:
        return 1.0 if x == 0 else 0.0
    return math.exp(-mu + x * math.log(mu) - math.lgamma(x + 1))


def fill_rate(k, mu):
    if k <= 0:
        return 0.0
    return min(1.0, sum(pois(x, mu) for x in range(0, k)))


def ebo(k, mu):
    """E[(X-k)+] by the tail sum of the definition."""
    if mu <= 0:
        return 0.0
    top = int(mu + 40 * math.sqrt(mu) + 60)
    return sum((x - k) * pois(x, mu) for x in range(k + 1, top + 1))


# ---------------------------------------------------------------- redundancy and season
_OUT = {}


def outage(W, credited, partner_rate_y):
    key = (W, credited, partner_rate_y)
    if key not in _OUT:
        _OUT[key] = _outage(W, credited, partner_rate_y)
    return _OUT[key]


def _outage(W, credited, partner_rate_y):
    if W <= 0:
        return 0.0
    if not credited:
        return W
    r = partner_rate_y / HY
    if r <= 0:
        return 0.0
    n = 2000  # Simpson on [0, W] of 1 - exp(-r t)
    h = W / n
    s = 0.0
    for i in range(n + 1):
        t = i * h
        f = -math.expm1(-r * t)
        s += f * (1 if i in (0, n) else (4 if i % 2 else 2))
    return s * h / 3.0


def season_numeric(s, W, n_phase=20000):
    """(expected in-season hours of a window of length W, probability the window touches the season),
    season = [0, s*HY) repeated every year, window start uniform over the year."""
    if s <= 0:
        return 0.0, 0.0
    if s >= 1:
        return W, 1.0
    tot = 0.0
    touch = 0
    S = s * HY
    for i in range(n_phase):
        a = (i + 0.5) * HY / n_phase
        b = a + W
        ov = 0.0
        y = 0
        while y * HY < b:
            lo, hi = max(a, y * HY), min(b, y * HY + S)
            if hi > lo:
                ov += hi - lo
            y += 1
        tot += ov
        if ov > 0:
            touch += 1
    return tot / n_phase, touch / n_phase


# ---------------------------------------------------------------- one evaluation
def two_point(W0, fill, mean_delay, cred, pr):
    if fill >= 1 or mean_delay <= 0:
        return outage(W0, cred, pr)
    cond = mean_delay / max(1e-12, 1 - fill)
    return fill * outage(W0, cred, pr) + (1 - fill) * outage(W0 + cond, cred, pr)


def options_at(c, lam, k_stock, season_cache):
    N, L = c["units"], c["lead_time_days"]
    lt = N * lam
    Lh = L * 24.0
    hc = c["holding_rate"] * c["part_cost_eur"]
    s = c["season_share"]
    D = c["downtime_cost_eur_h"]
    cred, pr = c["redundancy"]["credited"], c["redundancy"]["partner_rate_y"]
    o = c["options"]
    Wn = c["fit_h"] + Lh

    def money(out_ev, holding, fees, events):
        dh = lt * s * out_ev
        de = None if D is None else D * dh
        return {"holding": holding, "fees": fees, "events": events, "downtime_h_y": dh,
                "total": (0.0 if D is None else de) + holding + fees + events}

    res = {}
    on = outage(Wn, cred, pr)
    res["none"] = dict(money(on, 0, 0, 0), recovery_h=Wn, fill=0.0, owned=0)
    # stock k on site
    W0 = c["fit_h"] + o["stock"]["store_h"]
    mu = lt * L / 365.0
    f = fill_rate(k_stock, mu)
    e = ebo(k_stock, mu)
    md = HY * e / lt if lt > 0 else 0.0
    res["stock"] = dict(money(two_point(W0, f, md, cred, pr), hc * k_stock, 0, 0), recovery_h=W0 + md, fill=f, owned=k_stock)
    # dedicated
    kd = o["dedicated"]["k_per_unit"]
    Wd = c["fit_h"] + o["dedicated"]["store_h"]
    mu_u = lam * L / 365.0
    fu = fill_rate(kd, mu_u)
    eu = ebo(kd, mu_u)
    du = HY * eu / lam if lam > 0 else 0.0
    res["dedicated"] = dict(money(two_point(Wd, fu, du, cred, pr), hc * kd * N, 0, 0), recovery_h=Wd + du, fill=fu, owned=kd * N)
    # pool
    M, kp = o["pool"]["sites"], o["pool"]["k"]
    Wp = c["fit_h"] + o["pool"]["transfer_h"]
    mup = M * lt * L / 365.0
    fp = fill_rate(kp, mup) if kp > 0 else 0.0
    ep = ebo(kp, mup)
    dp = HY * ep / (M * lt) if lt > 0 else 0.0
    share = 1.0 / M
    res["pool"] = dict(money(two_point(Wp, fp, dp, cred, pr), hc * kp * share, 0, 0), recovery_h=Wp + dp, fill=fp, owned=kp * share)
    # agreement
    a = o["agreement"]
    Wa = c["fit_h"] + a["delivery_h"]
    p = a["p_on_time"]
    res["agreement"] = dict(money(p * outage(Wa, cred, pr) + (1 - p) * outage(Wn, cred, pr), 0, a["fee_eur_y"], 0),
                            recovery_h=p * Wa + (1 - p) * Wn, fill=p, owned=0)
    # rental
    rr = o["rental"]
    m = rr["mobilise_h"]
    if m < Wn:
        out_r = outage(m, cred, pr) + (1 - rr["cover"]) * (outage(Wn, cred, pr) - outage(m, cred, pr))
        key = (s, Wn, m)
        if key not in season_cache:
            in_season_full, touch = season_numeric(s, Wn)
            in_season_mob, _ = season_numeric(s, m)
            season_cache[key] = (in_season_full - in_season_mob, touch)
        hire_h, touch = season_cache[key]
        ev = lt * (rr["mobilise_eur"] * touch + rr["day_eur"] * hire_h / 24.0)
        res["rental"] = dict(money(out_r, 0, rr["retainer_eur_y"], ev), recovery_h=m, fill=1.0, owned=0, used=True)
    else:
        res["rental"] = dict(money(on, 0, rr["retainer_eur_y"], 0), recovery_h=Wn, fill=0.0, owned=0, used=False)
    return res


def evaluate(c):
    cache = {}
    rates = sorted(c["rate_y"])
    lam = rates[1]
    st = c["options"]["stock"]
    # economic optimum: brute-force global minimum over k = 1..60 (the tool scans to the first local minimum)
    totals = {k: options_at(c, lam, k, cache)["stock"]["total"] for k in range(1, 61)}
    k_opt = min(totals, key=lambda k: (round(totals[k], 9), k))
    mu = c["units"] * lam * c["lead_time_days"] / 365.0
    k_svc = next((k for k in range(1, 61) if fill_rate(k, mu) >= st["service_target"]), None)
    if st["k"] != "auto":
        k_stock = st["k"]
    elif c["downtime_cost_eur_h"] is None:
        k_stock = k_svc if k_svc is not None else 1
    else:
        k_stock = max(k_opt, k_svc) if (st["enforce_service"] and k_svc is not None) else k_opt
    lv = {name: options_at(c, r, k_stock, cache) for name, r in zip(("lo", "mid", "hi"), rates)}
    enabled = {"none": True}
    for oid in ORDER[1:]:
        enabled[oid] = bool(c["options"][oid]["enabled"])
    if c["units"] < 2:
        enabled["dedicated"] = False
    feas = dict(enabled)
    if not lv["mid"]["rental"]["used"]:
        feas["rental"] = False
    if c.get("obsolete"):
        feas["agreement"] = False

    def best(level):
        cand = [o for o in ORDER if feas[o]]
        if c["downtime_cost_eur_h"] is None:
            tol = c["tolerable_downtime_h"]
            ok = [] if tol is None else [o for o in cand if lv["mid"][o]["recovery_h"] <= tol + 1e-9]
            if ok:
                cand = ok
            else:
                mr = min(lv["mid"][o]["recovery_h"] for o in cand)
                cand = [o for o in cand if lv["mid"][o]["recovery_h"] <= mr + 1e-9]
        return min(cand, key=lambda o: (round(lv[level][o]["total"], 6), lv["mid"][o]["recovery_h"], ORDER.index(o)))

    out = {"k_optimum": k_opt, "k_service": k_svc, "k_stock": k_stock, "best": best("mid"), "best_lo": best("lo"), "best_hi": best("hi"),
           "options": {}}
    for o in ORDER:
        out["options"][o] = {"feasible": feas[o],
                             "total_lo": lv["lo"][o]["total"], "total_mid": lv["mid"][o]["total"], "total_hi": lv["hi"][o]["total"],
                             "holding": lv["mid"][o]["holding"], "downtime_h_y": lv["mid"][o]["downtime_h_y"],
                             "recovery_h": lv["mid"][o]["recovery_h"], "fill": lv["mid"][o]["fill"]}
    return out


# ---------------------------------------------------------------- Monte Carlo of the (S-1, S) system
def mc_base_stock(lam, L, k, T=300000.0, seed=1):
    rnd = random.Random(seed)
    t, n, served, wait = 0.0, 0, 0, 0.0
    arrivals, waiting = [], []
    on_hand = k
    while t < T:
        t += rnd.expovariate(lam)
        while arrivals and arrivals[0] <= t:
            a = arrivals.pop(0)
            if waiting:
                wait += a - waiting.pop(0)
            else:
                on_hand += 1
        n += 1
        arrivals.append(t + L)
        if on_hand > 0:
            on_hand -= 1
            served += 1
        else:
            waiting.append(t)
    return served / n, wait / n


# ---------------------------------------------------------------- cases
def opts(stock=None, dedicated=None, pool=None, agreement=None, rental=None):
    base = {"stock": {"enabled": True, "k": "auto", "store_h": 1, "service_target": 0.95, "enforce_service": True},
            "dedicated": {"enabled": False, "k_per_unit": 1, "store_h": 0.5},
            "pool": {"enabled": False, "sites": 3, "k": 1, "transfer_h": 24},
            "agreement": {"enabled": False, "fee_eur_y": 1000, "delivery_h": 48, "p_on_time": 0.95},
            "rental": {"enabled": False, "mobilise_h": 48, "mobilise_eur": 2500, "day_eur": 300, "cover": 1, "retainer_eur_y": 0}}
    for key, val in (("stock", stock), ("dedicated", dedicated), ("pool", pool), ("agreement", agreement), ("rental", rental)):
        if val:
            base[key].update(val)
    return base


def C(units, rate, cost, lead, fit, D, tol, s, cred, pr, hold, options, obsolete=False):
    return {"units": units, "rate_y": rate, "part_cost_eur": cost, "lead_time_days": lead, "fit_h": fit, "obsolete": obsolete,
            "downtime_cost_eur_h": D, "tolerable_downtime_h": tol, "season_share": s,
            "redundancy": {"credited": cred, "partner_rate_y": pr}, "holding_rate": hold, "options": options}


PRESETS = {
    "chiller_board": C(1, [0.05, 0.1, 0.2], 450, 112, 6, 2000, 8, 1, False, 0.5, 0.25,
                       opts(agreement={"enabled": True, "fee_eur_y": 2500, "delivery_h": 72, "p_on_time": 0.9},
                            rental={"enabled": True, "mobilise_h": 36, "mobilise_eur": 6000, "day_eur": 900})),
    "tx_2n": C(2, [0.004, 0.01, 0.02], 90000, 280, 48, 6000, 0.05, 1, True, 0.01, 0.15,
               opts(stock={"k": 1, "store_h": 0, "enforce_service": False}, pool={"enabled": True, "sites": 4, "k": 1, "transfer_h": 72},
                    rental={"enabled": True, "mobilise_h": 72, "mobilise_eur": 25000, "day_eur": 800})),
    "boiler_rental": C(1, [0.05, 0.1, 0.2], 30000, 60, 24, 300, 24, 0.55, False, 0.2, 0.2,
                       opts(stock={"store_h": 2, "enforce_service": False},
                            rental={"enabled": True, "mobilise_h": 24, "mobilise_eur": 2500, "day_eur": 180})),
    "ahu_pool": C(5, [0.04, 0.08, 0.15], 2500, 42, 4, 150, 24, 1, False, 0.3, 0.25,
                  opts(dedicated={"enabled": True, "k_per_unit": 1, "store_h": 0.5},
                       agreement={"enabled": True, "fee_eur_y": 1500, "delivery_h": 48, "p_on_time": 0.9})),
    "fa_obsolete": C(6, [0.03, 0.06, 0.12], 400, 120, 3, None, 0, 1, False, 0.1, 0.25,
                     opts(agreement={"enabled": True, "fee_eur_y": 800, "delivery_h": 24, "p_on_time": 0.9}), obsolete=True),
    "ups_pool": C(2, [0.02, 0.05, 0.1], 7000, 35, 1, 10000, 0.001, 1, True, 0.05, 0.2,
                  opts(stock={"store_h": 0.5, "enforce_service": False}, pool={"enabled": True, "sites": 3, "k": 1, "transfer_h": 6},
                       agreement={"enabled": True, "fee_eur_y": 3000, "delivery_h": 8, "p_on_time": 0.95})),
}


def main():
    cases = []
    for pid, c in PRESETS.items():
        cases.append({"id": pid, "kind": "preset", "preset": pid, "case": c, "ref": evaluate(c)})
    g = 0
    for units in (1, 5):
        for rate in (0.05, 0.5):
            for lead in (14, 120):
                for D in (100, 5000):
                    for cred in (False, True):
                        for s in (1.0, 0.5):
                            o = opts(dedicated={"enabled": True}, pool={"enabled": True, "sites": 3, "k": 1, "transfer_h": 24},
                                     agreement={"enabled": True, "fee_eur_y": 1200, "delivery_h": 48, "p_on_time": 0.9},
                                     rental={"enabled": True, "mobilise_h": 48, "mobilise_eur": 3000, "day_eur": 400, "cover": 0.8})
                            c = C(units, [rate / 2, rate, rate * 2], 3000, lead, 6, D, 24, s, cred, 0.3, 0.25, o)
                            cases.append({"id": "grid/%d" % g, "kind": "grid", "case": c, "ref": evaluate(c)})
                            g += 1
    # stress: large fleets, long lead times and expensive outages push the optimum to tens of spares
    for i, (units, rate, lead, D, cost) in enumerate(((20, 2.0, 180, 50000, 800), (40, 1.0, 120, 5000, 200), (10, 0.3, 365, 200000, 5000), (3, 5.0, 60, 1000, 50))):
        c = C(units, [rate / 2, rate, rate * 2], cost, lead, 4, D, 8, 1.0, False, 0.3, 0.25,
              opts(stock={"enforce_service": False}, dedicated={"enabled": True}, pool={"enabled": True, "sites": 2, "k": 5, "transfer_h": 12}))
        cases.append({"id": "stress/%d" % i, "kind": "stress", "case": c, "ref": evaluate(c)})
    mc = []
    for lam, L, k in ((3.0, 0.5, 2), (0.4, 42 / 365.0, 1), (6.0, 0.25, 3)):
        f_mc, w_mc = mc_base_stock(lam, L, k)
        mu = lam * L
        mc.append({"lambda": lam, "L_y": L, "k": k, "fill_mc": f_mc, "fill_poisson": fill_rate(k, mu),
                   "wait_mc_y": w_mc, "wait_little_y": ebo(k, mu) / lam})
    out = {"generator": "bench-src/ref/gen_mepspares.py", "method": __doc__.strip().splitlines()[0],
           "n_cases": len(cases), "cases": cases, "mc_crosscheck": mc}
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "mepspares_ref.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print("cases", len(cases), "mc", [(round(m["fill_mc"] - m["fill_poisson"], 4), round(m["wait_mc_y"] / m["wait_little_y"] - 1, 4)) for m in mc])


if __name__ == "__main__":
    main()
