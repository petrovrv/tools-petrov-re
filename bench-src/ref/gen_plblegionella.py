"""Independent reference for plblegionella (Legionella Risk & Dead Legs).

Written from the published method _plb/leg/METHOD.md (plblegionella-1.3), not from plb-legionella.js:
Flemish Legionellabesluit scope and KVE/l levels (BVR 9.2.2007, codex.vlaanderen.be DID 1015749), dead-leg volume / purge time /
3-litre rule (DVGW W 551), W 551 installation class, ordinal screening H x C, control-plan tasks and measures.
In addition (D-PLB-10) ANCHORS: hand-assessed cases whose expected values are literals written from the source texts
(decree articles, W 551 / VDI 6023 / HSG274 statements, hand-computed pipe volumes), not computed by this model;
main() checks that this model reproduces them and the bench checks the page against them.
Output: bench-src/ref/plblegionella_ref.json (list of cases: full inputs + expected values).
Run: python -I bench-src/ref/gen_plblegionella.py
"""
import copy
import json
import math
import os

PIPES = {  # od: wall (mm)
    "copper": {12: 1, 15: 1, 18: 1, 22: 1, 28: 1.5, 35: 1.5, 42: 1.5, 54: 2},
    "stainless": {15: 1, 18: 1, 22: 1.2, 28: 1.2, 35: 1.5, 42: 1.5, 54: 1.5},
    "pex_sdr74": {16: 2.2, 20: 2.8, 25: 3.5, 32: 4.4, 40: 5.5, 50: 6.9, 63: 8.6},
    "multilayer": {16: 2, 20: 2, 26: 3, 32: 3, 40: 3.5, 50: 4, 63: 4.5},
}
BASE = dict(region="be_flanders", establishment="care_home", public_access=True, showers=True, hot_water=True, persons_day=80,
            T_store=60, preheat="none", circulation=True, T_return_min=55, circ_stop_h=0, T_cold_max=18, cold_limit=20,
            aerosol_points=0, special_aerosol=False, n_stagnant=0, flush_days=7, dead_leg_L=3, time_limit_s=60,
            T_store_min=60, T_circ_min=55, circ_stop_max_h=8, samples=[], alert_campaigns_prev=0, same_point_3x=False,
            V_store_L=None, V_pipe_L=None, one_two_family=False, dead_legs=[])
CARE = ("hospital", "care_home", "assisted_living")
# METHOD §3a (r4 Y4-2): fixed DVGW W 551 values, checked apart from the editable design targets
W551 = dict(store_C=60, return_C=55, stop_h=8, pipe_L=3)


def stag_days(x):
    # METHOD §3 (r4 Y4-3): Germany -> VDI/DVGW 6023, water exchanged at the latest every 72 h = 3 d (a shorter input stays);
    # every other region keeps the flushing interval entered
    return min(x["flush_days"], 3) if x["region"] == "de" else x["flush_days"]


def scope_of(x):
    if x["region"] != "be_flanders":
        return "other_region"
    if not x["public_access"]:
        return "none"
    # Art. 1 35°: only systems with nothing but toilets/washbasins without showers are excluded -> also no other aerosol outlet
    if not x["showers"] and not x["special_aerosol"] and x["aerosol_points"] < 1:
        return "none"
    if x["establishment"] in CARE:
        return "high"
    if not x["hot_water"] or x["persons_day"] < 15:
        return "none"
    if x["persons_day"] <= 40:
        return "moderate_exempt"
    return "moderate"


def level_of(x, scope):
    s = x["samples"]
    n = len(s)

    def share(t):
        return sum(1 for v in s if v > t) / n if n else 0.0
    if scope == "high":
        if share(100000) >= 0.3 or x["same_point_3x"] or (share(10000) >= 0.3 and x["alert_campaigns_prev"] >= 2):
            return "report", share(10000)
        if share(10000) >= 0.3:
            return "alert_high", share(10000)
        if share(1000) >= 0.3:
            return "vigilance", share(10000)
        return "none", share(10000)
    if scope == "moderate":
        if share(100000) >= 0.3:
            return "report", share(10000)
        if share(10000) >= 0.3:
            return "alert_high", share(10000)
        return "none", share(10000)
    if n and max(s) > 1000:
        return "above_1000", share(10000)
    return "none", share(10000)


def dead_legs(x):
    out = []
    for d in x["dead_legs"]:
        di = d["od"] - 2 * PIPES[d["material"]][d["od"]]
        per_m = math.pi * di ** 2 / 4 / 1000
        vol = per_m * d["L"]
        out.append(dict(id=d["id"], hot=bool(d["hot"]), V_L=vol, t_purge_s=vol / d["q"], L_max_m=x["dead_leg_L"] / per_m,
                        over_volume=bool(d["hot"]) and vol > x["dead_leg_L"], w551_over_3L=bool(d["hot"]) and vol > W551["pipe_L"],
                        stagnant=d["idle_days"] > stag_days(x)))
    return out


def w551_class(x, legs):
    # METHOD §4a: large if store > 400 L or one pipe run heater -> outlet > 3 L; small only when both volumes are known
    if not x["hot_water"]:
        return "n/a"
    if x["one_two_family"]:  # W 551: one- and two-family houses are small installations whatever the volumes
        return "small"
    runs = [l["V_L"] for l in legs if l["hot"]] + ([x["V_pipe_L"]] if x["V_pipe_L"] is not None else [])
    if x["V_store_L"] is not None and x["V_store_L"] > 400:
        return "large"
    if runs and max(runs) > 3:
        return "large"
    if x["V_store_L"] is not None and x["V_pipe_L"] is not None:
        return "small"
    return "unknown"


def screen(x, legs, w551):
    pts = 0
    if x["hot_water"]:
        pts += 0 if x["T_store"] >= x["T_store_min"] else (2 if x["T_store"] >= 55 else 4)
        pts += 2 if x["preheat"] == "unheated" else 0
        if x["circulation"]:
            pts += 0 if x["T_return_min"] >= x["T_circ_min"] else (2 if x["T_return_min"] >= 50 else 4)
            pts += 2 if x["circ_stop_h"] > x["circ_stop_max_h"] else 0
        elif w551 == "large":
            pts += 3
    pts += 3 if x["T_cold_max"] > 25 else (1 if x["T_cold_max"] > x["cold_limit"] else 0)
    pts += min(4, sum(1 for l in legs if l["over_volume"]))
    stag = x["n_stagnant"] + sum(1 for l in legs if l["stagnant"])
    pts += 0 if stag == 0 else (1 if stag <= 5 else (2 if stag <= 20 else 3))
    H = 1 if pts == 0 else (2 if pts <= 3 else (3 if pts <= 7 else 4))
    S = {"hospital": 3, "care_home": 3, "assisted_living": 3, "hotel": 2, "campsite": 2, "pool_sauna": 2}.get(x["establishment"], 1)
    growth = x["hot_water"] and (x["T_store"] < 50 or (x["T_store"] < 55 and S == 3))
    if growth:
        H = max(H, 3)
    a = max(1, x["aerosol_points"]) if x["showers"] else x["aerosol_points"]
    E = (0 if a <= 0 else (1 if a <= 10 else 2)) + (1 if x["special_aerosol"] else 0)
    C = max(1, min(4, S + E - 1))
    return pts, H, C, stag, growth, a


ORDER = ["low", "moderate", "high", "very_high"]


def classify(R):
    if R <= 3:
        return "low"
    if R <= 6:
        return "moderate"
    if R <= 9:
        return "high"
    return "very_high"


def tasks_of(x, scope, lvl, cls, stag, aer):
    t = []
    if x["hot_water"]:
        t.append(("temp_heater", 1, 30, 0.5, False))
    t.append(("temp_sentinel", 1, 30, 1.0, False))
    if stag > 0:
        t.append(("flush", None, stag_days(x), 0.05 * stag, False))
    if aer > 0:
        t.append(("showerheads", 3, 91, 0.1 * aer, False))
    if x["hot_water"]:
        t.append(("heater_service", 12, 365, 4.0, scope == "moderate_exempt"))
    months = {"low": 12, "moderate": 6, "high": 3, "very_high": 1}[cls]
    if lvl in ("alert_high", "report"):
        months = 1
    if scope in ("high", "moderate"):
        t.append(("sampling", months, round(months * 365.25 / 12), 2.0, True))
    elif cls in ("high", "very_high") or lvl == "above_1000":
        t.append(("sampling", months, round(months * 365.25 / 12), 2.0, False))
    t.append(("review", 24, 730, 4.0, False))
    rows = [dict(task_key=k, interval_days=d, hours=round(h * 100) / 100, statutory=s) for k, m, d, h, s in t]
    per_year = sum(round(h * 100) / 100 * (364 / d if k == "flush" else 12 / m) for k, m, d, h, s in t)
    return rows, per_year


def measures_of(x, scope, lvl, legs, w551, growth):
    m = []
    hw, circ = x["hot_water"], x["hot_water"] and x["circulation"]
    # METHOD §5: the design target or, when it is laxer, the fixed W 551 value (60 °C / 55 °C / 8 h) triggers the measure
    if hw and (x["T_store"] < x["T_store_min"] or x["T_store"] < W551["store_C"]):
        m.append("raise_store")
    if hw and x["preheat"] == "unheated":
        m.append("preheat")
    if circ and (x["T_return_min"] < x["T_circ_min"] or x["T_return_min"] < W551["return_C"]):
        m.append("balance")
    if circ and (x["circ_stop_h"] > x["circ_stop_max_h"] or x["circ_stop_h"] > W551["stop_h"]):
        m.append("circ_stop")
    if hw and not x["circulation"] and w551 == "large":
        m.append("add_circ")
    if x["T_cold_max"] > x["cold_limit"]:
        m.append("cold")
    m += ["dead_leg:" + l["id"] for l in legs if l["over_volume"]]
    m += ["dead_leg_w551:" + l["id"] for l in legs if l["w551_over_3L"] and not l["over_volume"]]
    # decree (codex.vlaanderen.be DID 1015749): Art. 9 §2 vigilance, §3 critical review, §5 report = §2 + §3 + 1° notify and stop aerosol use,
    # 2° reduce, 3° restart only below 100 000 KVE/l, 4° >= 3 months intensive sampling; Art. 16 §2 review, §3 notify, inform users, reduce, shut down after 1 month
    if scope == "high" and lvl in ("vigilance", "alert_high", "report"):
        m.append("vigilance")
    if lvl == "alert_high" or (lvl == "report" and scope == "high"):
        m.append("critical_review")
    if lvl == "report" and scope == "high":
        m += ["report_notify", "stop_aerosol", "report_reduce", "restart_samples", "intensive_sampling"]
    elif lvl == "report" and scope == "moderate":
        m += ["report_notify", "inform_users", "report_reduce", "shutdown_1m"]
    if lvl in ("report", "alert_high") or growth or (hw and (x["T_store"] < x["T_store_min"] or (x["circulation"] and x["T_return_min"] < 50))):
        m.append("disinfect")
    return m


# METHOD input rules: yes/no inputs accept true/false, 1/0 and the strings "true"/"false"/"1"/"0" only
YES_NO = ("public_access", "showers", "hot_water", "circulation", "special_aerosol", "same_point_3x", "one_two_family")
TRUE_FORMS, FALSE_FORMS = ("true", "1"), ("false", "0")


def yes_no(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)) and v in (0, 1):
        return bool(v)
    if isinstance(v, str) and v in TRUE_FORMS + FALSE_FORMS:
        return v in TRUE_FORMS
    return None


def input_errors(x):
    return ["bool:" + k for k in YES_NO if yes_no(x[k]) is None]


def expect(x):
    errs = input_errors(x)
    if errs:
        return dict(valid=False, errors=errs)
    x = dict(x, **{k: yes_no(x[k]) for k in YES_NO})
    scope = scope_of(x)
    lvl, sh10 = level_of(x, scope)
    legs = dead_legs(x)
    w551 = w551_class(x, legs)
    pts, H, C, stag, growth, aer = screen(x, legs, w551)
    R = H * C
    c0 = classify(R)
    if growth and ORDER.index(c0) < 2:
        c0 = "high"
    floor = {"vigilance": "moderate", "alert_high": "high", "report": "very_high", "above_1000": "high"}.get(lvl)
    cls = floor if floor and ORDER.index(floor) > ORDER.index(c0) else c0
    tasks, per_year = tasks_of(x, scope, lvl, cls, stag, aer)
    flags = []
    if scope == "moderate_exempt" and x["hot_water"] and x["T_store"] < 60:
        flags.append("exempt_below_60")
    if any(l["over_volume"] for l in legs):
        flags.append("dead_legs_over_volume")
    if growth:
        flags.append("store_growth_range")
    if w551 == "large":
        flags.append("w551_large")
    # r4: fixed W 551 checks apart from the editable targets, Germany 72 h, Art. 9 §5 stop
    if any(l["w551_over_3L"] for l in legs):
        flags.append("w551_dead_leg_3L")
    hw, circ = x["hot_water"], x["hot_water"] and x["circulation"]
    if hw and W551["store_C"] > x["T_store"] >= x["T_store_min"]:
        flags.append("w551_store_target")
    if circ and W551["return_C"] > x["T_return_min"] >= x["T_circ_min"]:
        flags.append("w551_return_target")
    if circ and W551["stop_h"] < x["circ_stop_h"] <= x["circ_stop_max_h"]:
        flags.append("w551_circ_stop_target")
    if x["region"] == "de" and x["flush_days"] > 3:
        flags.append("de_vdi6023_72h")
    if lvl == "report" and scope == "high":
        flags.append("stop_aerosol_now")
    return dict(valid=True, w551_reason="one_two_family" if w551 == "small" and x["one_two_family"] else None, scope=scope, level=lvl, share_10k=sh10, points=pts, H=H, C=C, R=R, class_screen=c0, cls=cls, legs=legs, w551=w551,
                articles=ARTICLES[scope], tasks=tasks, hours_year=per_year, measures=measures_of(x, scope, lvl, legs, w551, growth), flags=flags)


# articles listed per scope (METHOD §1, decree text codex.vlaanderen.be DID 1015749)
ARTICLES = {
    "high": ["Art. 4", "Art. 5", "Art. 6 §1, §3", "Art. 6 §4", "Art. 6 §5", "Art. 6 §3", "Art. 7", "Art. 8", "Art. 9 §1", "Art. 9 §2–5", "Art. 10"],
    "moderate": ["Art. 11", "Art. 12", "Art. 13 §1, §3", "Art. 13 §4", "Art. 13 §5", "Art. 13 §3", "Art. 14", "Art. 15", "Art. 16 §1", "Art. 16 §2–3", "Art. 17"],
    "moderate_exempt": ["Art. 11", "Art. 12", "Art. 18", "Art. 18", "Art. 18", "Art. 18"],
    "none": [], "other_region": [],
}


def L(i, hot, mat, od, length, q, idle):
    return dict(id=i, hot=hot, material=mat, od=od, L=length, q=q, idle_days=idle)


PRESETS = {
    "care_home_ok": dict(establishment="care_home", persons_day=80, T_store=62, T_return_min=57, T_cold_max=18, aerosol_points=84, n_stagnant=6,
                         dead_legs=[L("Room 101 shower", True, "multilayer", 16, 4, 0.15, 1), L("Room 214 shower", True, "multilayer", 16, 5, 0.15, 1), L("Kitchen sink", True, "copper", 15, 3, 0.07, 0)]),
    "hotel_winter_wing": dict(establishment="hotel", persons_day=180, T_store=60, T_return_min=55, T_cold_max=19, aerosol_points=98, n_stagnant=40,
                              dead_legs=[L("Wing C riser end", True, "copper", 15, 6, 0.15, 30), L("Room 512 shower", True, "multilayer", 16, 4, 0.15, 30)]),
    "apartments_private": dict(establishment="residential", public_access=False, persons_day=57, T_store=60, T_return_min=51, T_cold_max=18, aerosol_points=24,
                               dead_legs=[L("Flat 6.1 bathroom", True, "multilayer", 16, 7, 0.15, 0), L("Flat 6.4 bathroom", True, "multilayer", 20, 9, 0.15, 0)]),
    "sports_samples": dict(establishment="sports", persons_day=120, T_store=60, T_return_min=53, circ_stop_h=10, T_cold_max=19, aerosol_points=32,
                           samples=[400, 800, 12000, 25000, 600, 15000, 900, 11000, 300, 700], dead_legs=[L("Changing room 4 showers", True, "copper", 22, 8, 0.15, 3)]),
    "bnb_heatpump": dict(establishment="hotel", persons_day=24, T_store=55, T_return_min=55, circulation=False, T_cold_max=18, aerosol_points=6,
                         dead_legs=[L("Room 1 shower", True, "pex_sdr74", 20, 9, 0.15, 2), L("Room 6 shower", True, "pex_sdr74", 20, 14, 0.15, 5)]),
    "school_dead_legs": dict(establishment="school", persons_day=660, T_store=60, T_return_min=56, T_cold_max=21, aerosol_points=8, n_stagnant=3,
                             dead_legs=[L("Gym showers (22 mm)", True, "copper", 22, 10, 0.15, 2), L("Gym showers (15 mm)", True, "copper", 15, 10, 0.15, 2), L("Lab eyewash", False, "copper", 15, 12, 0.2, 60)]),
}

VARIANTS = [
    ("hospital_hot", "care_home_ok", dict(establishment="hospital", T_store=52, T_return_min=48, T_cold_max=27, special_aerosol=True), "hospital, everything wrong -> very high"),
    ("care_vigilance", "care_home_ok", dict(samples=[1500, 2500, 1200, 300, 200, 100, 50, 0, 0, 0]), "30 % > 1000 -> vigilance (Art. 9 §2)"),
    ("care_report_campaigns", "care_home_ok", dict(samples=[15000, 12000, 30000, 100, 100, 100, 100, 100, 100, 100], alert_campaigns_prev=2), "third alert campaign -> report"),
    ("care_report_point", "care_home_ok", dict(same_point_3x=True, samples=[200]), "same point 3x > 10 000 -> report"),
    ("care_alert", "care_home_ok", dict(samples=[15000, 12000, 30000, 100, 100, 100, 100, 100, 100, 100]), "alert high (Art. 9 §3)"),
    ("hotel_no_wing", "hotel_winter_wing", dict(n_stagnant=0, dead_legs=[]), "hotel without the closed wing -> low"),
    ("hotel_report", "hotel_winter_wing", dict(samples=[150000, 120000, 200000, 10, 10, 10, 10, 10, 10, 10]), "moderate report (Art. 16 §3)"),
    ("hotel_vdi72h", "hotel_winter_wing", dict(flush_days=3), "flush interval 72 h"),
    ("hotel_small", "hotel_winter_wing", dict(persons_day=40), "40 persons -> Art. 18 exemption"),
    ("hotel_tiny", "hotel_winter_wing", dict(persons_day=14), "14 persons -> not collective"),
    ("hotel_noshowers", "hotel_winter_wing", dict(showers=False, aerosol_points=0), "only toilets and basins -> outside Art. 1 35°"),
    ("hotel_noshowers_aerosol", "hotel_winter_wing", dict(showers=False), "X2-1 no showers but 98 other aerosol points -> still a watervoorziening"),
    ("hospital_noshowers_spa", "care_home_ok", dict(establishment="hospital", showers=False, special_aerosol=True, aerosol_points=0, persons_day=100), "X2-1 Codex case: no showers, special aerosol source -> high"),
    ("care_bool_strings", "care_home_ok", dict(public_access="1", showers="true", circulation=1, special_aerosol="false", same_point_3x=0), "X2-2 accepted boolean forms"),
    ("care_bool_yes", "care_home_ok", dict(public_access="yes"), "X2-2 'yes' is no boolean -> input error"),
    ("care_bool_null", "care_home_ok", dict(showers=None, hot_water=2, one_two_family="ja"), "X2-2 null / 2 / 'ja' -> three input errors"),
    ("w551_two_family_500", "bnb_heatpump", dict(V_store_L=500, V_pipe_L=6, one_two_family=True, persons_day=8), "X2-5 two-family house, 500 L store -> small"),
    ("w551_not_family_500", "bnb_heatpump", dict(V_store_L=500, V_pipe_L=6, one_two_family=False, persons_day=8), "X2-5 same store, not a one/two-family house -> large"),
    ("hotel_nl", "hotel_winter_wing", dict(region="nl", samples=[1500]), "other region, EU parameter"),
    ("apt_public", "apartments_private", dict(public_access=True, establishment="youth_stay"), "public youth stay -> moderate scope"),
    ("apt_unheated_preheat", "apartments_private", dict(preheat="unheated", T_return_min=49), "solar preheat not heated, return 49"),
    ("apt_long_legs", "apartments_private", dict(dead_legs=[L("Penthouse", True, "multilayer", 26, 12, 0.1, 0), L("Roof tap", False, "copper", 22, 30, 0.2, 90),
                                                           L("Guest bath", True, "copper", 28, 6, 0.15, 10), L("Spa", True, "stainless", 35, 5, 0.3, 0), L("Utility", True, "pex_sdr74", 32, 9, 0.2, 0)]), "five dead legs"),
    ("sports_timer8", "sports_samples", dict(circ_stop_h=8, samples=[]), "8 h stop allowed, no samples"),
    ("sports_cold", "sports_samples", dict(T_cold_max=26, samples=[]), "cold 26 °C"),
    ("bnb_60", "bnb_heatpump", dict(T_store=60), "B&B at 60 °C"),
    ("bnb_45", "bnb_heatpump", dict(T_store=45, persons_day=60), "45 °C, 60 persons"),
    ("school_slow", "school_dead_legs", dict(time_limit_s=15), "15 s purge limit"),
    ("school_2L", "school_dead_legs", dict(dead_leg_L=2), "2 L limit"),
    ("office_private", "school_dead_legs", dict(establishment="office", public_access=False, aerosol_points=2, n_stagnant=25), "office not public, 25 stagnant outlets"),
    ("campsite_spa", "hotel_winter_wing", dict(establishment="campsite", special_aerosol=True, T_store=58, n_stagnant=0), "campsite with whirlpool, 58 °C"),
    ("pool_cold_only", "school_dead_legs", dict(establishment="pool_sauna", hot_water=False, aerosol_points=12), "cold-only installation"),
    ("hospital_45", "care_home_ok", dict(establishment="hospital", T_store=45, circulation=False, aerosol_points=0, n_stagnant=0, dead_legs=[]), "CR-5 hospital 45 °C, showers, no circulation"),
    ("care_54", "care_home_ok", dict(T_store=54), "CR-5 54 °C with susceptible occupants"),
    ("hotel_vdi72h_n", "hotel_winter_wing", dict(flush_days=3, dead_legs=[]), "CR-13 72 h flushing"),
    ("large_no_circ", "bnb_heatpump", dict(V_store_L=500, persons_day=60), "CR-30 500 L store without circulation"),
    ("small_known", "bnb_heatpump", dict(V_store_L=300, V_pipe_L=2.5), "CR-30 small installation"),
    ("y4_care_report_100k", "care_home_ok", dict(samples=[150000, 150000, 150000, 10, 10, 10, 10, 10, 10, 10]), "Y4-1 high-risk report by > 100 000 -> Art. 9 §5 actions"),
    ("y4_limit5_school", "school_dead_legs", dict(dead_leg_L=5), "Y4-2 design limit 5 L: 22 mm leg 3.14 L still over the W 551 3 L"),
    ("y4_store_target55", "care_home_ok", dict(T_store=57, T_store_min=55), "Y4-2 store 57 °C passes a 55 °C target, fails W 551 60 °C"),
    ("y4_return_target50", "sports_samples", dict(T_circ_min=50, samples=[]), "Y4-2 return 53 °C passes a 50 °C target, fails W 551 55 °C"),
    ("y4_stop_target12", "sports_samples", dict(circ_stop_max_h=12, samples=[]), "Y4-2 10 h stop within a 12 h limit, over W 551 8 h"),
    ("y4_de_hotel", "hotel_winter_wing", dict(region="de"), "Y4-3 Germany: flushing every 3 d (VDI/DVGW 6023 72 h)"),
    ("y4_de_flush2", "hotel_winter_wing", dict(region="de", flush_days=2), "Y4-3 Germany with a shorter input interval 2 d -> kept, no flag"),
    ("y4_uk_idle4", "hotel_winter_wing", dict(region="uk", n_stagnant=0, dead_legs=[L("Guest WC", False, "copper", 15, 2, 0.1, 4)]), "Y4-3 UK keeps 7 d: idle 4 d not stagnant"),
]

# ---------- D-PLB-10 external anchors: literals from the source texts, not computed by this model ----------
ANCHORS = [
    dict(id="A1_hospital_45C", base="care_home_ok",
         over=dict(establishment="hospital", T_store=45, circulation=False, aerosol_points=0, n_stagnant=0, dead_legs=[]),
         expect=dict(scope="high", class_min="high"),
         source="Legionellabesluit Art. 1 18° (hospital = high-risk establishment, scope high, Art. 4–10); 45 °C lies in the growth range 25–50 °C "
                "(HSG274 Part 2 §2.3; DVGW W 551 §6: store outlet >= 60 °C) -> a hand assessor rates a hospital store at 45 °C at least HIGH"),
    dict(id="A2_hospital_dead_leg", base="care_home_ok",
         over=dict(establishment="hospital", aerosol_points=200, n_stagnant=0, dead_legs=[dict(id="Ward shower", hot=True, material="copper", od=28, L=9.8, q=0.15, idle_days=0)]),
         expect=dict(class_min="high", legs={"Ward shower": dict(V_L=4.8106, over_volume=True)}),
         source="Hand: copper EN 1057 28x1.5 -> d = 25 mm; V = pi/4 * 0.25^2 dm2 * 98 dm = 4.81 L > 3 L (DVGW W 551 §5.3 3-litre rule); "
                "200 aerosol points at a hospital -> at least HIGH"),
    dict(id="A3_copper22_10m", base="school_dead_legs",
         over=dict(dead_legs=[dict(id="Gym", hot=True, material="copper", od=22, L=10, q=0.15, idle_days=0)]),
         expect=dict(legs={"Gym": dict(V_L=3.1416, t_purge_s=20.944, over_volume=True)}),
         source="Hand: copper 22x1 -> d = 20 mm; V = pi/4 * 0.2^2 dm2 * 100 dm = 3.142 L (> 3 L, W 551); purge 3.142 L / 0.15 l/s = 20.9 s"),
    dict(id="A4_bnb_art18", base="bnb_heatpump", over=dict(),
         expect=dict(scope="moderate_exempt", articles_include=["Art. 11", "Art. 12", "Art. 18"]),
         source="Legionellabesluit Art. 18: moderate-risk establishment with never more than 40 persons/day is exempt from Art. 13–17 only; "
                "Art. 11 (BBT for new installations) and Art. 12 (renovation) still apply"),
    dict(id="A5_hotel_alert", base="hotel_winter_wing", over=dict(samples=[12000, 15000, 20000, 500, 500, 500, 500, 500, 500, 500]),
         expect=dict(scope="moderate", level="alert_high"),
         source="Legionellabesluit Art. 16 §2: >= 30 % of the samples > 10 000 KVE/l in a moderate-risk establishment -> monthly sampling (3 of 10 = 30 %)"),
    dict(id="A6_care_vigilance", base="care_home_ok", over=dict(samples=[1500, 2000, 1100, 100, 100, 100, 100, 100, 100, 100]),
         expect=dict(scope="high", level="vigilance"),
         source="Legionellabesluit Art. 9 §2: high-risk establishment, >= 30 % of the samples > 1 000 KVE/l -> heightened vigilance"),
    dict(id="A7_flush_72h", base="hotel_winter_wing", over=dict(flush_days=3),
         expect=dict(flush_interval_days=3),
         source="VDI/DVGW 6023-1 (2022) §4.3 / DVGW W 551: complete water exchange at least every 72 h -> flushing task every 3 days"),
    dict(id="A8_w551_large_store", base="bnb_heatpump", over=dict(V_store_L=500),
         expect=dict(w551="large"),
         source="DVGW W 551 (2004) §3: large installation = store > 400 L or > 3 L in a pipe run between heater outlet and draw-off point"),
    dict(id="A9_w551_two_family", base="bnb_heatpump", over=dict(V_store_L=500, one_two_family=True),
         expect=dict(w551="small"),
         source="DVGW W 551 (2004) §3: installations in one- and two-family houses are small installations, whatever the store and pipe volume"),
    dict(id="A10_art1_35_spa", base="care_home_ok", over=dict(establishment="hospital", showers=False, special_aerosol=True, aerosol_points=0),
         expect=dict(scope="high"),
         source="Legionellabesluit Art. 1 35°: a watervoorziening excludes only 'de systemen waarop alleen toiletten of wastafels zonder douchesystemen "
                "aangesloten zijn' -> a hospital system with a whirlpool/spa is covered; Art. 1 18° -> high"),
    dict(id="A11_bool_yes", base="care_home_ok", over=dict(public_access="yes"),
         expect=dict(valid=False, errors=["bool:public_access"]),
         source="METHOD input rules: yes/no inputs are true/false (1/0, 'true'/'false', '1'/'0'); 'yes' is an input error, never false"),
    # r4 anchors (Y4-1..3): literals from the decree text, the DVGW and VDI statements and a hand pipe volume
    dict(id="A12_art9_5_report", base="care_home_ok", over=dict(establishment="hospital", samples=[150000, 150000, 150000, 10, 10, 10, 10, 10, 10, 10]),
         expect=dict(scope="high", level="report", measures_include=["report_notify", "stop_aerosol", "report_reduce", "restart_samples", "intensive_sampling"],
                     flags_include=["stop_aerosol_now"]),
         source="Legionellabesluit Art. 9 §4 3° (3 of 10 = 30 % > 100 000 KVE/l -> melding) and §5: 1° 'brengt de afdeling Toezicht Volksgezondheid onmiddellijk op de hoogte "
                "en het gebruik van aerosolproducerende installaties wordt stopgezet'; 2° measures in consultation; 3° restart only when representative samples < 100 000 KVE/l; "
                "4° 'minstens gedurende drie maanden gevolgd volgens een intensief staalnameplan' (codex.vlaanderen.be DID 1015749, read 06.11.2026)"),
    dict(id="A13_art16_3_report", base="hotel_winter_wing", over=dict(samples=[150000, 120000, 200000, 10, 10, 10, 10, 10, 10, 10]),
         expect=dict(scope="moderate", level="report", measures_include=["report_notify", "inform_users", "report_reduce", "shutdown_1m"], measures_exclude=["stop_aerosol"]),
         source="Legionellabesluit Art. 16 §3 (moderate risk): notify the Afdeling Toezicht Volksgezondheid at once, inform the users and advise susceptible persons not to use it, "
                "measures in consultation, out of service if not < 100 000 KVE/l one month after the report; no immediate stop of aerosol use in this article"),
    dict(id="A14_w551_3L_limit5", base="school_dead_legs",
         over=dict(dead_leg_L=5, dead_legs=[dict(id="Hot run", hot=True, material="copper", od=22, L=13, q=0.15, idle_days=0)]),
         expect=dict(legs={"Hot run": dict(V_L=4.0841, over_volume=False, w551_over_3L=True)}, flags_include=["w551_dead_leg_3L"], measures_include=["dead_leg_w551:Hot run"]),
         source="Hand: copper 22x1 -> d = 20 mm; V = pi/4 * 0.2^2 dm2 * 130 dm = 4.084 L <= design limit 5 L but > 3 L: DVGW 'Zirkulationssysteme sind erforderlich, "
                "wenn das Rohrleitungsvolumen zwischen Austritt am Trinkwassererwärmer und einer Entnahmestelle mehr als 3 Liter beträgt' (dvgw.de Heizungsraum, read 06.11.2026)"),
    dict(id="A15_de_72h_idle4", base="hotel_winter_wing",
         over=dict(region="de", n_stagnant=0, dead_legs=[dict(id="Guest WC", hot=False, material="copper", od=15, L=2, q=0.1, idle_days=4)]),
         expect=dict(legs={"Guest WC": dict(stagnant=True)}, flush_interval_days=3, flags_include=["de_vdi6023_72h"]),
         source="VDI 6023: 'sämtliches in einer Trinkwasser-Installation enthaltene Wasser [muss] nach spätestens 72 Stunden ausgetauscht sein' (vdi.de, read 06.11.2026) "
                "-> an outlet idle 4 d > 3 d is stagnant; flushing every 3 d"),
    dict(id="A16_w551_store_target", base="care_home_ok", over=dict(T_store=57, T_store_min=55),
         expect=dict(measures_include=["raise_store"], flags_include=["w551_store_target"]),
         source="DVGW: 'Das erwärmte Trinkwasser am Ausgang des zentralen Trinkwassererwärmers muss 60 °C haben' (dvgw.de Heizungsraum) -> 57 °C fails W 551 "
                "even though it meets a user target of 55 °C"),
]


def check_anchor(a, e):
    x = a["expect"]
    errs = []
    if x.get("valid") is False:
        return [] if (not e["valid"] and e["errors"] == x["errors"]) else ["errors"]
    if not e["valid"]:
        return ["valid"]
    if "scope" in x and e["scope"] != x["scope"]:
        errs.append("scope")
    if "level" in x and e["level"] != x["level"]:
        errs.append("level")
    if "class_min" in x and ORDER.index(e["cls"]) < ORDER.index(x["class_min"]):
        errs.append("class_min")
    if "w551" in x and e["w551"] != x["w551"]:
        errs.append("w551")
    for art in x.get("articles_include", []):
        if art not in e["articles"]:
            errs.append("article " + art)
    if "flush_interval_days" in x:
        f = [t for t in e["tasks"] if t["task_key"] == "flush"]
        if not f or f[0]["interval_days"] != x["flush_interval_days"]:
            errs.append("flush")
    for k in x.get("measures_include", []):
        if k not in e["measures"]:
            errs.append("measure " + k)
    for k in x.get("measures_exclude", []):
        if k in e["measures"]:
            errs.append("no measure " + k)
    for k in x.get("flags_include", []):
        if k not in e["flags"]:
            errs.append("flag " + k)
    for lid, lx in x.get("legs", {}).items():
        g = [l for l in e["legs"] if l["id"] == lid]
        if not g:
            errs.append("leg " + lid)
            continue
        for k, v in lx.items():
            if isinstance(v, bool):
                if g[0][k] != v:
                    errs.append(lid + "." + k)
            elif abs(g[0][k] - v) > 1e-3 * max(1, abs(v)):
                errs.append(lid + "." + k)
    return errs


def full(base_id, over):
    x = copy.deepcopy(BASE)
    x.update(copy.deepcopy(PRESETS[base_id]))
    x.update(copy.deepcopy(over))
    return x


def main():
    cases = []
    for k in PRESETS:
        x = full(k, {})
        cases.append(dict(id=k, preset=k, note="preset", inputs=x, expect=expect(x)))
    for cid, base, over, note in VARIANTS:
        x = full(base, over)
        cases.append(dict(id=cid, preset=base, note=note, inputs=x, expect=expect(x)))
    bad = 0
    for a in ANCHORS:
        x = full(a["base"], a["over"])
        e = expect(x)
        errs = check_anchor(a, e)
        if errs:
            bad += 1
            print("ANCHOR FAIL", a["id"], errs)
        cases.append(dict(id=a["id"], preset=a["base"], note="external anchor", inputs=x, expect=e, anchor=a["expect"], anchor_source=a["source"]))
    print("anchors:", len(ANCHORS) - bad, "/", len(ANCHORS), "reproduced by the model")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plblegionella_ref.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False, indent=1)
    print("plblegionella_ref.json:", len(cases), "cases")


if __name__ == "__main__":
    main()
