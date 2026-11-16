"""Independent reference for mepplanner (MEP Maintenance Planner).

Written from the planner's published method (page footer / manifest / _mep/plan-PROGRESS.md decisions),
not ported from mep-planner.js:
  * ISO 8601 weeks (Python datetime.date.fromisocalendar / isocalendar);
  * the horizon is the ISO year: H = 52 or 53 weeks (ISO week of 28 December; QA-1, run 2);
  * a task with interval I days (or M >= 1 calendar months) has Iw = I/7 (or M*H/12) weeks and n = max(1, round(H/Iw))
    work orders per year on the cyclic grid round(p + k*Iw) mod H; p = slot of the next due date, or free;
  * a weekly statutory test therefore falls in every ISO week of the year (also W53);
  * a work order may move floor(tol*Iw) whole weeks (statutory: 0);
  * windows: heating/cooling seasons as ISO-week ranges (wrapping), pre-season = the N weeks before the season,
    shutdown / not shutdown, blackout weeks (routine work only);
  * week load = task hours + travel_h per visit; one visit per (asset, trade, week);
  * budget = hours*rate + travel*rate + materials (% of labour or explicit) + call-out per vendor visit.

Modes
  python gen_mepplanner.py                -> writes mepplanner_ref.json (calendar + deterministic grid cases)
  python gen_mepplanner.py --verify FILE  -> checks page plans dumped by run_mepplanner.mjs, prints JSON
"""
import datetime as dt
import json
import math
import os
import sys

H = 52  # set by calendar() to the ISO weeks of the plan year
HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- calendar
def iso_weeks_in_year(year):
    return dt.date(year, 12, 28).isocalendar()[1]


def calendar(year, start_week):
    global H
    H = iso_weeks_in_year(year)
    monday0 = dt.date.fromisocalendar(year, 1, 1) + dt.timedelta(weeks=start_week - 1)
    out = []
    for s in range(H):
        d = monday0 + dt.timedelta(weeks=s)
        iy, iw, _ = d.isocalendar()
        out.append({"slot": s, "iso_week": iw, "iso_year": iy, "monday": d.isoformat()})
    return out


def in_range(w, a, b):
    return a <= w <= b if a <= b else (w >= a or w <= b)


def allowed_weeks(constraint, o, statutory):
    """set of ISO weeks allowed by the task's window (before blackout for statutory)"""
    heat, cool = o["seasons"]["heating"], o["seasons"]["cooling"]
    pre = o.get("pre_season_weeks", 6)
    shut = o.get("shutdowns", [])
    out = set()
    for w in range(1, 54):
        if constraint == "not_heating":
            ok = not in_range(w, heat["from"], heat["to"])
        elif constraint == "not_cooling":
            ok = not in_range(w, cool["from"], cool["to"])
        elif constraint in ("pre_heating", "pre_cooling"):
            season = heat if constraint == "pre_heating" else cool
            first = (season["from"] - pre - 1) % H + 1
            last = (season["from"] - 2) % H + 1
            ok = in_range(w, first, last)
        elif constraint == "shutdown":
            ok = any(in_range(w, s["from"], s["to"]) for s in shut)
        elif constraint == "not_shutdown":
            ok = not any(in_range(w, s["from"], s["to"]) for s in shut)
        else:
            ok = True
        if ok and not statutory and w in o.get("blackout", []):
            ok = False
        if ok:
            out.add(w)
    return out


def interval_weeks(t):
    if t.get("interval_months") is not None and t["interval_months"] >= 1:  # whole calendar months on the year grid
        return t["interval_months"] * H / 12.0
    return t["interval_days"] / 7.0


def js_round(x):
    """JavaScript Math.round (half up)"""
    return math.floor(x + 0.5)


# ---------------------------------------------------------------- deterministic placement (no levelling)
def naive_plan(tasks, o):
    """Placement without levelling, from the rules: undated series take the smallest phase whose every work order
    has an allowed week inside its tolerance; each work order goes to the nearest allowed week (earlier first)."""
    cal = calendar(o["year"], o["start_week"])
    wk_of_slot = [c["iso_week"] for c in cal]
    occ = []
    for t in tasks:
        Iw = interval_weeks(t)
        stat = t.get("kind") == "statutory" or bool(t.get("statutory_id"))
        tol = 0 if stat else math.floor(o["tolerance"] * Iw + 1e-9)
        allowed = allowed_weeks(t.get("constraint"), o, stat)
        ok_slot = [wk_of_slot[s] in allowed for s in range(H)]
        if not any(ok_slot):
            ok_slot = [True] * H
        n = max(1, js_round(H / Iw))

        def noms(p):
            out = []
            for k in range(n):
                x = js_round(p + k * Iw + 1e-9) % H
                if x not in out:
                    out.append(x)
            return out

        def cands(nm):
            c = []
            for d in range(tol + 1):
                for s in ([nm] if d == 0 else [nm - d, nm + d]):
                    if 0 <= s < H and ok_slot[s] and s not in c:
                        c.append(s)
            return c

        if t.get("due_week") is not None:
            a = wk_of_slot.index(t["due_week"])
            p = a
            while p - Iw > -0.5 - 1e-9:
                p -= Iw
            phase = p
        else:
            phases = list(range(max(1, min(H, math.ceil(Iw - 1e-9)))))
            feas = [p for p in phases if all(cands(nm) for nm in noms(p))]
            phase = (feas or phases)[0]
        for k, nm in enumerate(noms(phase)):
            c = cands(nm)
            occ.append({"task_id": t["id"], "asset_id": t["asset_id"], "trade": t["trade"], "hours": t["hours"], "slot": c[0] if c else nm,
                        "statutory": stat, "materials_eur": t.get("materials_eur")})
    return occ


def loads(occ, o):
    hours, visits = {}, {}
    for q in occ:
        hours.setdefault(q["trade"], [0.0] * H)[q["slot"]] += q["hours"]
        key = (q["asset_id"], q["trade"], q["slot"]) if o.get("group_by", "asset") != "none" else (id(q),)
        visits[key] = (q["trade"], q["slot"]) if len(key) > 1 else (q["trade"], q["slot"])
    vcount = {}
    for tr, s in visits.values():
        vcount.setdefault(tr, [0] * H)[s] += 1
    return hours, vcount


def budget(occ, o, rates):
    hours, vcount = loads(occ, o)
    lab = mat = trav = fee = 0.0
    for q in occ:
        r = rates[q["trade"]]
        lab += q["hours"] * r
        mat += q["materials_eur"] if q.get("materials_eur") is not None else q["hours"] * r * o["materials_pct"] / 100.0
    for tr, arr in vcount.items():
        nv = sum(arr)
        trav += nv * o["travel_h"] * rates[tr]
        if tr in o.get("vendor_trades", ["specialist_vendor"]):
            fee += nv * o["vendor_callout_eur"]
    return {"labour_eur": lab, "materials_eur": mat, "travel_eur": trav, "vendor_fees_eur": fee, "total_eur": lab + mat + trav + fee}


# ---------------------------------------------------------------- reference cases
def base_opts(**kw):
    o = {"year": 2026, "start_week": 1, "tolerance": 0.10, "travel_h": 0.5, "materials_pct": 15, "vendor_callout_eur": 150,
         "vendor_trades": ["specialist_vendor"], "group_by": "asset",
         "seasons": {"heating": {"from": 40, "to": 17}, "cooling": {"from": 18, "to": 39}}, "pre_season_weeks": 6,
         "shutdowns": [], "blackout": [], "capacity_h_week": {}, "level": False,
         "rates": {"hvac_mech": 75, "electrician": 70, "plumber": 65, "fire": 80, "controls": 85, "specialist_vendor": 120}}
    o.update(kw)
    return o


def T(i, asset, days, trade, hours, **kw):
    t = {"id": i, "asset_id": asset, "interval_days": days, "trade": trade, "hours": hours, "kind": "time"}
    t.update(kw)
    return t


GRID_CASES = [
    ("grid_basic", "weekly, monthly (months), quarterly, semi-annual, annual on one asset", [
        T("w", "A", 7, "fire", 1), T("m", "A", 30.4375, "hvac_mech", 1, interval_months=1), T("q", "A", 91, "hvac_mech", 2),
        T("s", "A", 182, "hvac_mech", 1.5), T("a", "A", 365, "specialist_vendor", 6)], base_opts()),
    ("grid_dated", "due weeks anchor the grid; statutory never moves", [
        T("q", "B", 91, "hvac_mech", 2, due_week=10), T("m", "B", 30, "electrician", 1, kind="statutory", statutory_id="x", due_week=3),
        T("a", "C", 365, "plumber", 4, due_week=44)], base_opts()),
    ("grid_seasons", "chiller not in cooling season, boiler not in heating season, pre-season checks", [
        T("ch", "CH", 365, "specialist_vendor", 8, constraint="not_cooling"), T("bl", "BL", 365, "specialist_vendor", 6, constraint="not_heating"),
        T("pc", "CH", 365, "hvac_mech", 3, constraint="pre_cooling"), T("ph", "AHU", 365, "controls", 1.5, constraint="pre_heating")], base_opts()),
    ("grid_shutdown", "shutdown work inside W31-32, thermography outside, blackout W52/W1 for routine work", [
        T("sd", "MSB", 365, "electrician", 8, constraint="shutdown"), T("ir", "MSB", 365, "electrician", 3, constraint="not_shutdown"),
        T("q", "TX", 91, "electrician", 0.5), T("w", "SPR", 7, "fire", 1, kind="statutory", statutory_id="y")],
        base_opts(shutdowns=[{"id": "s", "from": 31, "to": 32}], blackout=[52, 1])),
    ("grid_start27", "plan starting mid-year (W27 2026, 53-week ISO year) with a dated quarterly task", [
        T("q", "D", 91, "hvac_mech", 2, due_week=2), T("a", "D", 365, "hvac_mech", 4, constraint="not_cooling")], base_opts(start_week=27)),
    ("grid_iso53_2026", "ISO long year 2026 (53 weeks): weekly statutory test in every week incl. W53; monthly and quarterly grid", [
        T("w", "SPR", 7, "fire", 0.5, kind="statutory", statutory_id="sprinkler_weekly"), T("m", "A", 30.4375, "hvac_mech", 1, interval_months=1),
        T("q", "A", 91, "hvac_mech", 2), T("a", "A", 365, "hvac_mech", 4, constraint="not_cooling")], base_opts(year=2026)),
    ("grid_iso52_2027", "ISO year 2027 (52 weeks): same tasks", [
        T("w", "SPR", 7, "fire", 0.5, kind="statutory", statutory_id="sprinkler_weekly"), T("m", "A", 30.4375, "hvac_mech", 1, interval_months=1),
        T("q", "A", 91, "hvac_mech", 2), T("a", "A", 365, "hvac_mech", 4, constraint="not_cooling")], base_opts(year=2027)),
    ("grid_budget", "budget: explicit materials, vendor call-out, travel at trade rate, no grouping", [
        T("v", "E", 182, "specialist_vendor", 4), T("e", "E", 365, "electrician", 2, materials_eur=100), T("e2", "E", 91, "electrician", 1)],
        base_opts(group_by="none", travel_h=1.0)),
]


def generate():
    cases = []
    for y, sw in [(2025, 1), (2026, 1), (2026, 27), (2027, 1), (2028, 40), (2032, 1)]:
        cal = calendar(y, sw)
        cases.append({"id": "calendar_%d_w%d" % (y, sw), "kind": "calendar", "year": y, "start_week": sw,
                      "ref": {"iso_weeks": [c["iso_week"] for c in cal], "mondays": [c["monday"] for c in cal]}})
    for cid, note, tasks, o in GRID_CASES:
        occ = naive_plan(tasks, o)
        hours, vcount = loads(occ, o)
        cal = calendar(o["year"], o["start_week"])
        slots = {}
        for q in occ:
            slots.setdefault(q["task_id"], []).append(cal[q["slot"]]["iso_week"])
        b = budget(occ, o, o["rates"])
        cases.append({"id": cid, "kind": "grid", "note": note, "tasks": tasks, "opts": o,
                      "ref": {"weeks_by_task": {k: sorted(v) for k, v in slots.items()},
                              "hours_by_trade": {k: round(sum(v), 6) for k, v in hours.items()},
                              "visits": sum(sum(v) for v in vcount.values()),
                              "budget_total_eur": round(b["total_eur"], 4)}})
    out = {"tool": "mepplanner", "generator": "bench-src/ref/gen_mepplanner.py", "python": sys.version.split()[0], "cases": cases}
    with open(os.path.join(HERE, "mepplanner_ref.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print("mepplanner_ref.json: %d cases" % len(cases))


# ---------------------------------------------------------------- verification of levelled page plans
def verify_plan(case):
    """case = {id, tasks (engine input), opts (resolved by the page), levelled, naive, aha}"""
    o, P, N = case["opts"], case["levelled"], case["naive"]
    fails = []
    cal = calendar(o["year"], o["start_week"])
    wk_of_slot = [c["iso_week"] for c in cal]
    tasks = {t["id"]: t for t in P["tasks"]}
    codes = {}
    for c in P["conflicts"]:
        codes.setdefault(c["code"], []).append(c)
    skip_window = {c.get("task_id") for c in P["conflicts"] if c["code"] in ("no_allowed_week", "no_shutdown_window")}
    # a: calendar of each work order
    for q in P["occurrences"]:
        if not (0 <= q["slot"] < H) or q["iso_week"] != wk_of_slot[q["slot"]] or q["date"] != cal[q["slot"]]["monday"]:
            fails.append("calendar " + q["id"])
    by_task = {}
    for q in P["occurrences"]:
        by_task.setdefault(q["task_id"], []).append(q)
    for tid, qs in by_task.items():
        t = tasks[tid]
        Iw = interval_weeks(t)
        stat = bool(t.get("statutory"))
        sub = t["interval_days"] < 7
        tolw = 0 if (stat or sub) else math.floor(o["tolerance"] * Iw + 1e-9)
        allowed = allowed_weeks(t.get("constraint"), o, stat)
        for q in qs:
            # b, c: statutory unshifted, tolerance
            if stat and q["shift_w"] != 0:
                fails.append("statutory moved " + q["id"])
            if not q.get("unreachable") and abs(q["slot"] - q["nominal_slot"]) > tolw:
                fails.append("tolerance %s shift %d > %d" % (q["id"], q["slot"] - q["nominal_slot"], tolw))
            # d: window
            if tid not in skip_window and not q.get("unreachable") and q["iso_week"] not in allowed:
                fails.append("window %s W%d (%s)" % (q["id"], q["iso_week"], t.get("constraint")))
        # e: grid count and spacing
        multi = Iw > H + 1.5
        if not sub and not multi:
            n = max(1, js_round(H / Iw))
            if len(qs) != n:
                fails.append("count %s %d != %d" % (tid, len(qs), n))
            noms = sorted(q["nominal_slot"] for q in qs)
            if len(noms) > 1:
                gaps = [(noms[(i + 1) % len(noms)] - noms[i]) % H for i in range(len(noms))]
                lo, hi = math.floor(Iw) - 1, math.ceil(Iw) + 1
                if any(g < lo or g > hi for g in gaps[:-1]):
                    fails.append("grid spacing %s %s (Iw %.2f)" % (tid, gaps, Iw))
        # e2: QA-1 - a weekly (or more frequent) statutory test occurs in every ISO week of the plan year
        if stat and t["interval_days"] <= 7 + 1e-9:
            got = sorted({q["slot"] for q in qs})
            if got != list(range(H)):
                fails.append("weekly statutory %s misses weeks %s" % (tid, [wk_of_slot[s] for s in range(H) if s not in got][:5]))
        # f: hours conservation
        exp_h = t["hours"] * (len(qs) if not sub else 1)
        got_h = sum(q["hours"] for q in qs) if not sub else qs[0]["hours"] * 1
        if not sub and abs(exp_h - got_h) > 1e-6:
            fails.append("hours %s" % tid)
    # g: weekly loads and visits
    trades = P["trades"]
    for tr in trades:
        for s in range(H):
            hh = sum(q["hours"] for q in P["occurrences"] if q["trade"] == tr and q["slot"] == s)
            if abs(hh - P["weeks"][s]["hours"][tr]) > 0.011:
                fails.append("week hours %s W%d" % (tr, wk_of_slot[s]))
    groups = set()
    for q in P["occurrences"]:
        if o["group_by"] == "none":
            groups.add((q["id"], q["trade"], q["slot"]))
        elif o["group_by"] == "location":
            groups.add((q["visit"],))
        else:
            groups.add((q["asset_id"], q["trade"], q["slot"]))
    if o["group_by"] != "location" and len(groups) != P["metrics"]["visits"]:
        fails.append("visits %d != %d" % (len(groups), P["metrics"]["visits"]))
    for tr in trades:
        for s in range(H):
            nv = len({g for g in groups if len(g) == 3 and g[1] == tr and g[2] == s}) if o["group_by"] != "location" else None
            if nv is not None and abs(nv * o["travel_h"] - P["weeks"][s]["travel"][tr]) > 0.011:
                fails.append("travel %s W%d" % (tr, wk_of_slot[s]))
    # h: capacity conflicts
    cap = o.get("capacity_h_week", {})
    want = set()
    for tr, c in cap.items():
        if tr not in trades:
            continue
        for s in range(H):
            if P["weeks"][s]["hours"][tr] + P["weeks"][s]["travel"][tr] > c + 1e-9:
                want.add((tr, wk_of_slot[s]))
    got = {(c["trade"], c["iso_week"]) for c in codes.get("capacity", [])}
    if want != got:
        fails.append("capacity conflicts %s vs %s" % (sorted(want), sorted(got)))
    for c in codes.get("capacity", []):
        sh = sum(q["hours"] for q in P["occurrences"] if q["trade"] == c["trade"] and q["iso_week"] == c["iso_week"] and q["statutory"])
        if (sh >= c["limit"] - 1e-9) != bool(c.get("statutory_driven")):
            fails.append("statutory_driven flag W%d" % c["iso_week"])
    # i: budget
    rates = {tr: P["budget"]["by_trade"][tr]["rate_eur_h"] for tr in P["budget"]["by_trade"]}
    lab = sum(q["hours"] * rates[q["trade"]] for q in P["occurrences"])
    mat = 0.0
    for q in P["occurrences"]:
        t = tasks[q["task_id"]]
        if t.get("materials_eur") is not None:
            mat += t["materials_eur"] * (7.0 / t["interval_days"] if q.get("sub_weekly") else 1.0)
        else:
            mat += q["hours"] * rates[q["trade"]] * o["materials_pct"] / 100.0
    trav = sum(o["travel_h"] * rates[v["trade"]] for v in P["visits"])
    fee = sum(o["vendor_callout_eur"] for v in P["visits"] if v["trade"] in o["vendor_trades"])
    tot = lab + mat + trav + fee
    if abs(tot - P["budget"]["total_eur"]) > max(0.05, 1e-6 * tot):
        fails.append("budget %.2f vs %.2f" % (tot, P["budget"]["total_eur"]))
    # j: levelling never worse
    if P["metrics"]["peak_total"] > N["metrics"]["peak_total"] + 1e-9:
        fails.append("levelled peak above naive")
    if P["metrics"]["overload_hours"] > N["metrics"]["overload_hours"] + 1e-9:
        fails.append("levelled overload above naive")
    stl = sorted((q["id"], q["slot"]) for q in P["occurrences"] if q["statutory"])
    stn = sorted((q["id"], q["slot"]) for q in N["occurrences"] if q["statutory"])
    if stl != stn:
        fails.append("statutory weeks differ naive/levelled")
    # k: the preset's teaching point
    aha = case.get("aha")
    if aha == "quarterly_peak" and not P["metrics"]["peak_total"] <= 0.5 * N["metrics"]["peak_total"]:
        fails.append("aha: peak not halved")
    if aha == "grouping" and not P["metrics"]["visits"] <= 0.75 * P["metrics"]["occurrences"]:
        fails.append("aha: grouping saves < 25 % of visits")
    if aha == "statutory_locked":
        cc = codes.get("capacity", [])
        if not cc or not all(c.get("statutory_driven") for c in cc):
            fails.append("aha: remaining overload not purely statutory")
    if aha == "chiller_winter" and len(codes.get("window_unreachable", [])) != 3:
        fails.append("aha: expected 3 summer anniversaries flagged")
    if aha == "chiller_winter_rebaselined":
        heat = o["seasons"]["heating"]
        ch = [q for q in P["occurrences"] if "chiller_major" in q["id"]]
        if len(ch) != 2 or not all(in_range(q["iso_week"], heat["from"], heat["to"]) for q in ch):
            fails.append("aha: chiller service not in the heating season")
    if aha == "shutdown":
        sd = [q for q in P["occurrences"] if "shutdown_service" in q["id"]]
        ir = [q for q in P["occurrences"] if "ir_load" in q["id"]]
        if not sd or not all(q["iso_week"] in (31, 32) for q in sd) or any(q["iso_week"] in (31, 32) for q in ir):
            fails.append("aha: shutdown / on-load placement")
    return {"id": case["id"], "pass": not fails, "fails": fails[:20],
            "peak_naive": N["metrics"]["peak_total"], "peak_levelled": P["metrics"]["peak_total"],
            "overload_naive": N["metrics"]["overload_hours"], "overload_levelled": P["metrics"]["overload_hours"],
            "visits": P["metrics"]["visits"], "occurrences": P["metrics"]["occurrences"], "budget_total_eur": P["budget"]["total_eur"]}


def verify(path):
    with open(path, encoding="utf-8") as f:
        dump = json.load(f)
    print(json.dumps([verify_plan(c) for c in dump["cases"]]))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--verify":
        verify(sys.argv[2])
    else:
        generate()
