"""Independent reference for liftwait.html (Lift Waiting Time Simulator) - written from the published method, not from the JS.

Three families of cases (written to bench-src/ref/liftwait_ref.json, driven by bench-src/run_liftwait.mjs):

1. analytic - one car, one passenger, closed form.
   Kinematics: rest-to-rest jerk-limited run (Peters 1996, as used in CIBSE Guide D 2020 ch. 3 / ISO 8100-32):
     rated speed reached:  T = d/v + v/a' + a'/j, a' = min(a, sqrt(v*j))
     speed not reached, acceleration reached: peak speed vp from d = vp*(vp/a + a/j), T = 2*(vp/a + a/j)
     neither reached: T = (32*d/j)**(1/3)
   Waiting time (CIBSE Guide D / ISO 8100-32): hall call registration -> doors of the car begin to open.
   Car idle at its home floor with doors closed: wait = start delay + T(home -> origin); 0 if origin = home.
   Ride (transit): doors begin to open at origin -> doors begin to open at destination
     = t_open + max(dwell, n_transfers*t_p + 0.8) + t_close + start delay + T(origin -> destination),
   the stop rule of the simulator's published method (_vt/sim/METHOD.md): doors stay open at least `door_dwell_s` after
   fully open and >= 0.8 s after the last transfer; transfers t_p each, out first then in.
2. batch - one car at the main floor, N people arrive together at t = 1 s, all going up; the car takes at most
   round(0.8 * CC) per trip (CC = floor(rated load / 75 kg), EN 81-20), boards in arrival order, serves the destinations in
   ascending order, returns to the main floor for the next batch. Every passenger's wait and ride in closed form.
3. hc5 - statistical: a saturated morning up-peak (constant 20-25 % of the population per 5 min, all incoming) through the
   page itself; the simulator's achieved 5-minute handling capacity (best 5-min window of completed journeys, % of the
   present population) against the classical round-trip-time formula (CIBSE Guide D 2020 ch. 3; Barney & Al-Sharif,
   Elevator Traffic Handbook 2nd ed. 2016): S = N - sum (1 - U_i)^P, H = N - sum_{j=1}^{N-1} (sum_{i<=j} U_i)^P,
   RTT = 2 H t_v + (S + 1) t_s + 2 P t_p, t_s = T(1 floor) - t_v + t_o + t_c + t_sd, HC5 = 300 P L / RTT, P = 0.8 CC.
   The formula ignores dwell, reopenings and the peak-window selection, so the tolerance is +-15 % (observed 1-12 % on these cases, run 2).
   Building data for these cases are input data dumped from vt-core.js presets into liftwait_presets.json.

Usage: python -I gen_liftwait.py  (writes liftwait_ref.json next to this file)
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def run_time(d, v, a, j):
    """Rest-to-rest jerk-limited run time over distance d (m)."""
    if d <= 0:
        return 0.0
    ap = min(a, math.sqrt(v * j))
    d_full = v * (v / ap + ap / j)
    if d >= d_full:
        return d / v + v / ap + ap / j
    if a * a / j <= v:  # acceleration a can be reached for some peak speed below v
        vp = (a / 2.0) * (-a / j + math.sqrt((a / j) ** 2 + 4.0 * d / a))
        if vp >= a * a / j:
            return 2.0 * (vp / a + a / j)
    return (32.0 * d / j) ** (1.0 / 3.0)


def building(n_floors, h, car, home=0, main=0):
    floors = []
    for i in range(n_floors):
        floors.append({"id": "F%d" % i, "label": str(i), "level_m": round(i * h, 3), "role": "lobby" if i == main else "office",
                       "population": 0 if i == main else 50, "entrance": i == main, "entrance_share": 1.0 if i == main else 0,
                       "attractor_share": 0})
    c = dict(car)
    c.update({"id": "A1", "home": "F%d" % home, "in_service": True})
    return {"schema": "tools.petrov.re/vertical-transport/v1", "revision": 1,
            "building": {"name": "bench", "use": "office", "floors": floors, "presence": 1.0},
            "groups": [{"id": "A", "name": "", "served": [f["id"] for f in floors], "express_zone": False, "cars": [c],
                        "call_system": "updown", "dispatch": "collective", "parking": "stay", "load_limit": 0.8}],
            "traffic": {"template": "custom", "arrival_pct_5min": 1, "duration_min": 10, "start": "08:00",
                        "mix": {"incoming": 1, "outgoing": 0, "interfloor": 0}, "transfer_s": car.get("_tp", 1.2),
                        "both_buttons_share": 0, "group_size": {"mean": 1}},
            "modules": {}}


CARS = {
    "office": {"rated_load_kg": 1275, "speed": 2.5, "accel": 1.0, "jerk": 1.5, "door_open_s": 2.0, "door_close_s": 3.0, "start_delay_s": 0.5, "door_dwell_s": 2.0},
    "fast": {"rated_load_kg": 1600, "speed": 6.0, "accel": 1.2, "jerk": 1.8, "door_open_s": 1.8, "door_close_s": 2.6, "start_delay_s": 0.3, "door_dwell_s": 1.5},
    "resi": {"rated_load_kg": 630, "speed": 1.0, "accel": 0.7, "jerk": 1.0, "door_open_s": 2.5, "door_close_s": 3.5, "start_delay_s": 0.5, "door_dwell_s": 3.0},
    "bed": {"rated_load_kg": 2500, "speed": 1.6, "accel": 0.8, "jerk": 1.0, "door_open_s": 3.5, "door_close_s": 5.0, "start_delay_s": 0.5, "door_dwell_s": 4.0},
}
TP = 1.2


def clean(car):
    return {k: v for k, v in car.items() if not k.startswith("_")}


def analytic_cases():
    out = []
    spec = [  # (name, car, floors, height, home, origin, dest, t)
        ("office one floor up", "office", 16, 3.75, 0, 0, 1, 5.0),
        ("office lobby to 15", "office", 16, 3.75, 0, 0, 15, 5.0),
        ("office called to 10, ride down", "office", 16, 3.75, 0, 10, 0, 5.0),
        ("office called to 1, ride to 2", "office", 16, 3.75, 0, 1, 2, 7.3),
        ("office parked at 8, call from 3", "office", 16, 3.75, 8, 3, 12, 4.2),
        ("fast tower 40 floors", "fast", 41, 4.0, 0, 0, 40, 5.0),
        ("fast called to 25, ride to 2", "fast", 41, 4.0, 0, 25, 2, 2.5),
        ("fast two floors", "fast", 41, 4.0, 10, 12, 10, 3.0),
        ("residential to 10", "resi", 11, 2.9, 0, 0, 10, 5.0),
        ("residential called to 7, ride down", "resi", 11, 2.9, 0, 7, 0, 5.0),
        ("bed lift one floor", "bed", 9, 4.2, 0, 1, 2, 5.0),
        ("bed lift called to 8, ride to 0", "bed", 9, 4.2, 4, 8, 0, 5.0),
    ]
    for name, ck, nf, h, home, o, d, t in spec:
        c = CARS[ck]
        doc = building(nf, h, clean(c), home=home)
        lv = [f["level_m"] for f in doc["building"]["floors"]]
        wait = 0.0 if o == home else c["start_delay_s"] + run_time(abs(lv[o] - lv[home]), c["speed"], c["accel"], c["jerk"])
        ride = c["door_open_s"] + max(c["door_dwell_s"], 1 * TP + 0.8) + c["door_close_s"] + c["start_delay_s"] + run_time(abs(lv[d] - lv[o]), c["speed"], c["accel"], c["jerk"])
        out.append({"id": "analytic-%02d" % (len(out) + 1), "kind": "analytic", "note": name, "doc": doc, "seed": 1,
                    "passengers": [{"id": 1, "t": t, "origin": o, "dest": d}],
                    "expect": [{"id": 1, "wait": round(wait, 6), "transit": round(ride, 6)}]})
    return out


def batch_up(nf, h, ck, dests):
    c = CARS[ck]
    lv = [i * h for i in range(nf)]
    cap = int(math.floor(c["rated_load_kg"] / 75.0))
    board = int(math.floor(0.8 * cap + 0.5))
    T = lambda a, b: run_time(abs(lv[b] - lv[a]), c["speed"], c["accel"], c["jerk"])
    t0 = 1.0
    pax = [{"id": i + 1, "t": t0, "origin": 0, "dest": dd} for i, dd in enumerate(dests)]
    res = {}
    queue = list(pax)
    t_open = t0  # doors begin to open at the main floor (car idle there)
    while queue:
        trip, queue = queue[:board], queue[board:]
        for p in trip:
            res[p["id"]] = {"id": p["id"], "wait": t_open - p["t"]}
        n_in = len(trip)
        t = t_open + c["door_open_s"] + max(c["door_dwell_s"], n_in * TP + 0.8) + c["door_close_s"]
        here = 0
        stops = sorted(set(p["dest"] for p in trip))
        for k, s in enumerate(stops):
            t += c["start_delay_s"] + T(here, s)
            here = s
            outs = [p for p in trip if p["dest"] == s]
            for p in outs:
                res[p["id"]]["transit"] = t - t_open
            t += c["door_open_s"] + max(c["door_dwell_s"], len(outs) * TP + 0.8) + c["door_close_s"]
        if queue:
            t += c["start_delay_s"] + T(here, 0)
            t_open = t
    return pax, [dict(id=r["id"], wait=round(r["wait"], 6), transit=round(r["transit"], 6)) for r in sorted(res.values(), key=lambda r: r["id"])]


def batch_cases():
    out = []
    spec = [
        ("5 people, office, mixed floors", 16, 3.75, "office", [3, 7, 7, 12, 15]),
        ("14 people fill one office car", 16, 3.75, "office", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
        ("20 people, two trips", 16, 3.75, "office", [15, 2, 9, 9, 4, 11, 6, 13, 8, 3, 14, 5, 10, 7, 12, 2, 5, 9, 15, 1]),
        ("9 residents, two trips of 6 + 3", 11, 2.9, "resi", [10, 4, 7, 2, 9, 5, 8, 3, 6]),
        ("30 people, three trips, fast car", 41, 4.0, "fast", [((i * 7) % 40) + 1 for i in range(30)]),
        ("6 people, bed lift", 9, 4.2, "bed", [8, 1, 5, 3, 3, 6]),
    ]
    for name, nf, h, ck, dests in spec:
        doc = building(nf, h, clean(CARS[ck]), home=0)
        pax, exp = batch_up(nf, h, ck, dests)
        out.append({"id": "batch-%02d" % (len(out) + 1), "kind": "batch", "note": name, "doc": doc, "seed": 1, "passengers": pax, "expect": exp})
    return out


def main_terminal(floors, served):
    """D-VT-13 restated (same definition as VTCore.mainTerminal): the served floor with role lobby; otherwise the served
    entrance floor with the largest entrance_share; otherwise the lowest served floor."""
    idx = [i for i, f in enumerate(floors) if f["id"] in served]
    for i in idx:
        if floors[i].get("role") == "lobby":
            return i
    ent = [i for i in idx if floors[i].get("entrance")]
    return max(ent, key=lambda i: floors[i].get("entrance_share", 1) or 0) if ent else idx[0]


def up_peak_formula(doc, P=None):
    """Classical up-peak round trip of group 0. Geometry per D-VT-13 (as VTCore.upPeakGeometry): the zone is EVERY served
    floor above the main terminal, also floors without population (e.g. a canteen: U_i = 0, it still counts for N and the
    interfloor height d_f); express run = level(first zone floor) - level(main) - d_f. P defaults to 0.8 CC."""
    floors = doc["building"]["floors"]
    g = doc["groups"][0]
    served = set(g["served"])
    car = g["cars"][0]
    L = sum(1 for c in g["cars"] if c.get("in_service", True))
    main = main_terminal(floors, served)
    zone = [i for i, f in enumerate(floors) if i > main and f["id"] in served]
    pres = doc["building"].get("presence", 1.0)
    pops = [max(0.0, floors[i].get("population", 0) or 0) * pres for i in zone]
    total = sum(pops)
    U = [p / total for p in pops]
    N = len(zone)
    CC = int(math.floor(car["rated_load_kg"] / 75.0))
    if P is None:
        P = 0.8 * CC
    S = N - sum((1 - u) ** P for u in U)
    cum, H = 0.0, float(N)
    for jx in range(N - 1):
        cum += U[jx]
        H -= cum ** P
    lv = [f["level_m"] for f in floors]
    df = (lv[zone[-1]] - lv[zone[0]]) / (N - 1) if N > 1 else lv[zone[0]] - lv[main]
    express = max(0.0, lv[zone[0]] - lv[main] - df)
    tv = df / car["speed"]
    tf1 = run_time(df, car["speed"], car["accel"], car["jerk"])
    ts = tf1 - tv + car["door_open_s"] + car["door_close_s"] + car["start_delay_s"]
    tp = doc["traffic"].get("transfer_s", 1.2)
    RTT = 2 * H * tv + 2 * express / car["speed"] + (S + 1) * ts + 2 * P * tp
    present = sum((f.get("population", 0) or 0) for f in floors) * pres
    HC5 = 300.0 * P * L / RTT
    INT = RTT / L
    return {"S": S, "H": H, "RTT": RTT, "INT": INT, "HC5_persons": HC5, "HC5_pct": 100.0 * HC5 / present, "present": present, "P": P, "CC": CC, "L": L}


def awt_band_cases():
    """Unsaturated up-peak: arrivals A persons/5 min below the handling capacity. The car load P that balances the arrival
    rate solves 300 P L / RTT(P) = A (bisection); the CIBSE Guide D / Barney up-peak estimate is
    AWT = INT (0.4 + (1.8 P/CC - 0.77)^2), valid for 0.5 <= P/CC <= 0.8. It is an empirical fit to simulations of a
    conventional group, so the band is wide (+-35 %); the check is that the simulator lands in the same regime, not a match."""
    pres = json.load(open(os.path.join(HERE, "liftwait_presets.json"), encoding="utf-8"))
    out = []
    for b, share in [("office15", 0.8), ("office15", 0.85)]:
        doc = pres[b]
        f80 = up_peak_formula(doc)
        A = share * f80["HC5_persons"]
        lo, hi = 1.0, f80["P"]
        for _ in range(60):
            mid = (lo + hi) / 2
            if 300.0 * mid * f80["L"] / up_peak_formula(doc, mid)["RTT"] < A:
                lo = mid
            else:
                hi = mid
        f = up_peak_formula(doc, (lo + hi) / 2)
        x = f["P"] / f["CC"]
        awt = f["INT"] * (0.4 + (1.8 * x - 0.77) ** 2)
        pct = 100.0 * A / f["present"]
        d = json.loads(json.dumps(doc))
        d["traffic"] = {"template": "custom", "arrival_pct_5min": round(pct, 4), "duration_min": 60, "start": "08:00", "mix": {"incoming": 1, "outgoing": 0, "interfloor": 0},
                        "transfer_s": 1.2, "both_buttons_share": 0, "group_size": {"mean": 1}}
        for g in d["groups"]:
            g["call_system"], g["dispatch"], g["parking"] = "updown", "collective", "lobby"
        out.append({"id": "awt-%02d" % (len(out) + 1), "kind": "awt", "note": "%s unsaturated up-peak at %d %% of HC5 (%.2f %%/5 min, all incoming), collective, 60 min; P/CC = %.2f" % (b, round(share * 100), pct, x),
                    "doc": d, "seeds": [1, 2, 3],
                    "expect": {"awt": round(awt, 4), "tol_rel": 0.35, "valid": 0.5 <= x <= 0.8, "formula": {k: round(v, 4) for k, v in f.items()}}})
    return out


def hc5_cases():
    pres = json.load(open(os.path.join(HERE, "liftwait_presets.json"), encoding="utf-8"))
    out = []
    for b, pct in [("office15", 20), ("office15", 25), ("hotel20", 25)]:
        doc = pres[b]
        f = up_peak_formula(doc)
        d = json.loads(json.dumps(doc))
        d["traffic"] = {"template": "custom", "arrival_pct_5min": pct, "duration_min": 60, "start": "08:00", "mix": {"incoming": 1, "outgoing": 0, "interfloor": 0},
                        "transfer_s": 1.2, "both_buttons_share": 0, "group_size": {"mean": 1}}
        for g in d["groups"]:
            g["call_system"], g["dispatch"], g["parking"] = "updown", "collective", "lobby"
        out.append({"id": "hc5-%02d" % (len(out) + 1), "kind": "hc5", "note": "%s saturated up-peak %d %%/5 min (all incoming, constant), collective, 60 min" % (b, pct),
                    "doc": d, "seed": 1,
                    "expect": {"hc5_pct": round(f["HC5_pct"], 4), "tol_rel": 0.15, "formula": {k: round(v, 4) for k, v in f.items()}}})
    return out


def multi_cases():
    """D-VT-11: 2-3 car cases (nearest, collective lobby batches, destination-control batches, the CR-1 all-full repro).
    Input data (building, cars, fixed passenger list) come from _vt/sim/ref_cases/*.json; the expected board / alight
    times of every passenger are computed here by _vt/sim/ref_multi.py, the sim unit's independent event simulation written
    from the textbook rules (not ported from vt-sim.js). The VTSim numbers stored in those files are NOT used.
    Shared conventions (ref_multi.py header): METHOD.md stop timing; waiting cars react on the 0.1 s controller grid."""
    import glob
    import subprocess
    import sys
    sim = os.path.normpath(os.path.join(HERE, "..", "..", "_vt", "sim"))
    files = sorted(f for f in glob.glob(os.path.join(sim, "ref_cases", "*.json")) if not f.endswith("summary.json"))
    if not files:
        return []
    ref = json.loads(subprocess.run([sys.executable, "-I", os.path.join(sim, "ref_multi.py")] + files, check=True, capture_output=True, text=True).stdout)
    out = []
    for f in files:
        c = json.load(open(f, encoding="utf-8"))
        R = ref[c["name"]]
        exp = [{"id": p["id"], "board_t": round(R[str(p["id"])]["board_t"], 6), "alight_t": None if R[str(p["id"])].get("alight_t") is None else round(R[str(p["id"])]["alight_t"], 6),
                "wait": round(R[str(p["id"])]["wait"], 6), "car": "A%d" % (R[str(p["id"])]["car"] + 1)} for p in c["pax"]]
        out.append({"id": "multi-%02d" % (len(out) + 1), "kind": "multi", "note": "%s (%d cars, %s, %d passengers) vs _vt/sim/ref_multi.py" % (c["name"], len(c["cars"]), c["mode"], len(c["pax"])),
                    "doc": c["doc"], "seed": 1, "dt": c.get("dt", 0.1), "passengers": c["pax"],
                    "expect": exp, "tol": {"board_s": c.get("dt", 0.1) + 1e-6, "alight_s": c.get("dt", 0.1) + 1e-6, "awt_rel": 0.02}})
    return out


def main():
    cases = analytic_cases() + batch_cases() + hc5_cases() + awt_band_cases() + multi_cases()
    json.dump(cases, open(os.path.join(HERE, "liftwait_ref.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("liftwait_ref.json: %d cases" % len(cases))


if __name__ == "__main__":
    main()
