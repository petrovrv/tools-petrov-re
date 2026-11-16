"""Independent reference for plbrainwater (rainwater reuse & infiltration, Flanders).

Written from the published method _plb/rain/METHOD.md (plbrain-1.3), not from plb-rain.js:
  1. synthetic daily rain from the KMI Uccle 1991-2020 monthly normals: two-state Markov chain of
     wet days (persistence r), wet-day amounts 1 mm + exponential excess (r4 Y6-4), Park-Miller minstd generator,
     fixed seed, a calendar month without wet day redrawn (r4 Y6-5), each calendar month scaled to its normal;
  2. daily yield-after-spillage tank balance in the published form Y = min(D, V), V = min(V + Q - Y, S - Y)
     (Jenkins et al. 1978, EN 16941-1 behavioural model), 365-day years, one warm-up year not counted;
  3. DIN 1989-1 simplified tank 6 % of min(yield, demand);
  4. GSV Hemelwater 2023 minimum volumes (rules as listed in METHOD.md section 4);
  5. input rule of METHOD.md section 7 (r3, X3-1): a choice that is given but is not one of the listed ids is refused
     with the error "choice:<field>" (valid: false), never replaced by a default.
Uses integer arithmetic for the generator (Python ints) and numpy-free loops.
Honest scope (D-PLB-10): cases 1..N check consistency with METHOD.md; the cases named "anchor_*" carry expected
values written down by hand from the decree text (BVR 10.02.2023 art. 7 and 8, worked by hand) and from the
DIN 1989-1 simplified formula - literal numbers, not computed by this script - and are cross-checked against it.
Output: bench-src/ref/plbrainwater_ref.json (list of cases: inputs + expected values).
Run: python -I bench-src/ref/gen_plbrainwater.py
"""
import json
import math
import os

MONTH_DAYS = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
# KMI/IRM Uccle normals 1991-2020 (input data of the method, METHOD.md section 1)
UCCLE_P = (75.5, 65.1, 59.3, 46.7, 59.7, 70.8, 76.9, 86.5, 65.3, 67.8, 76.2, 87.4)
UCCLE_N = (13.1, 12.0, 11.3, 9.1, 10.0, 10.2, 10.4, 10.3, 9.6, 10.7, 12.4, 13.8)
# DIN 1989-1:2002-04 Table 3 yield coefficients (Ertragsbeiwerte), decision D-PLB-11
YIELD_COEFF = {"pitched_hard": 0.8, "flat_bare": 0.8, "flat_gravel": 0.6, "green_extensive": 0.5, "green_intensive": 0.3}

BASE = dict(rain="uccle", rain_factor=1.0, seed=20231001, years=30, persistence=0.35,
            roof_m2=120.0, roof_type="pitched_hard", filter_eta=0.9, tank_m3=5.0,
            persons=4.0, wc_lpd=24.0, laundry_lpd=12.0, days_week=7.0, garden_m2=0.0, garden_mm=100.0, other_m3y=0.0,
            water_price=5.5, gsv_on=True, gsv_use="single", units=1, gsv_works="new", existing_roof_m2=0.0,
            existing_paved_m2=0.0, existing_tank=False, green_m2=0.0, green_50=True, paved_m2=30.0, plot_m2=500.0,
            gsv_infiltration="possible", units_connected=1, no_use_justified=False)


class MinStd:
    M = 2147483647

    def __init__(self, seed):
        s = int(abs(seed)) % self.M
        self.x = s if s else 1

    def __call__(self):
        self.x = (self.x * 16807) % self.M
        return self.x / self.M


def rain_series(c):
    """daily rain in mm, list of (month, mm) - METHOD.md section 1 (plbrain-1.3)"""
    g = MinStd(c["seed"])
    r = c["persistence"]
    years = int(c["years"])
    first_day = [sum(MONTH_DAYS[:m]) for m in range(12)]
    mean = [UCCLE_P[m] * c["rain_factor"] / UCCLE_N[m] for m in range(12)]
    # threshold c_m = 1 mm when the mean wet-day amount is at least 2 mm, else 0
    floor_mm = [1.0 if mean[m] >= 2.0 else 0.0 for m in range(12)]
    rain = [0.0] * (365 * years)

    def draw_month(year, m, wet):
        pi = UCCLE_N[m] / MONTH_DAYS[m]
        p_ww = pi + r * (1.0 - pi)
        p_dw = pi * (1.0 - r)
        start = year * 365 + first_day[m]
        for k in range(MONTH_DAYS[m]):
            wet = g() < (p_ww if wet else p_dw)
            rain[start + k] = floor_mm[m] + (mean[m] - floor_mm[m]) * -math.log(g()) if wet else 0.0
        return wet

    wet = False
    for year in range(years):
        for m in range(12):
            wet = draw_month(year, m, wet)

    def days_of(m):
        return [y * 365 + first_day[m] + k for y in range(years) for k in range(MONTH_DAYS[m])]

    # r4 Y6-5: a calendar month with no wet day in the whole series is drawn again (every year in order, the generator
    # stream continues, the state entering the month is the stored day before it) until it has a wet day
    for m in range(12):
        tries = 0
        while not any(rain[i] > 0 for i in days_of(m)) and tries < 1000:
            for year in range(years):
                i0 = year * 365 + first_day[m]
                draw_month(year, m, i0 > 0 and rain[i0 - 1] > 0)
            tries += 1
    # scale each calendar month to years x normal x rain factor: the excess above c_m when that is possible
    for m in range(12):
        idx = [i for i in days_of(m) if rain[i] > 0]
        target = years * UCCLE_P[m] * c["rain_factor"]
        total = sum(rain[i] for i in idx)
        base = floor_mm[m] * len(idx)
        for i in idx:
            if target > base and total > base:
                rain[i] = floor_mm[m] + (rain[i] - floor_mm[m]) * (target - base) / (total - base)
            else:
                rain[i] = rain[i] * target / total
    month_of = []
    for _y in range(years):
        for m in range(12):
            month_of += [m] * MONTH_DAYS[m]
    return list(zip(month_of, rain))


def daily_demand(c):
    """(base m3/day all year, garden m3/day 1 Apr - 30 Sep, annual m3)"""
    house = c["persons"] * (c["wc_lpd"] + c["laundry_lpd"]) / 1000.0 * c["days_week"] / 7.0
    other = c["other_m3y"] / 365.0
    garden_year = c["garden_m2"] * c["garden_mm"] / 1000.0
    return house + other, garden_year / 183.0, house * 365.0 + other * 365.0 + garden_year


# day-of-year of 1 April and 30 September in a 365-day year (0-based)
APR1 = sum(MONTH_DAYS[:3])
SEP30 = sum(MONTH_DAYS[:9]) - 1


def tank_roof(c):
    """METHOD 4, simulation roof: roof A_r, plus the existing roof for an extension; green roof not connected"""
    return c["roof_m2"] + (c["existing_roof_m2"] if c["gsv_works"] == "extension" else 0.0)


def balance(c, series, store):
    coef = tank_roof(c) * YIELD_COEFF[c["roof_type"]] * c["filter_eta"] / 1000.0
    base, garden, _ = daily_demand(c)

    def step(vol, mm, doy):
        q = coef * mm
        d = base + (garden if APR1 <= doy <= SEP30 else 0.0)
        y = min(d, vol)
        new = min(vol + q - y, store - y)
        return new, q, d, y, max(0.0, vol + q - y - new)

    vol = 0.0
    for i, (_m, mm) in enumerate(series[:365]):  # warm-up year, not counted
        vol = step(vol, mm, i)[0]
    acc = dict(rain=0.0, q=0.0, d=0.0, y=0.0, o=0.0, od=0, ed=0)
    for i, (_m, mm) in enumerate(series):
        vol, q, d, y, spill = step(vol, mm, i % 365)
        acc["rain"] += mm
        acc["q"] += q
        acc["d"] += d
        acc["y"] += y
        acc["o"] += spill
        if spill > 1e-12:
            acc["od"] += 1
        if vol <= 1e-12:
            acc["ed"] += 1
    n = len(series) / 365.0
    res = {k: v / n for k, v in acc.items()}
    res["coverage"] = res["y"] / res["d"] if res["d"] > 0 else 0.0
    res["efficiency"] = res["y"] / res["q"] if res["q"] > 0 else 0.0
    return res


def din_simplified(c):
    p_year = sum(UCCLE_P) * c["rain_factor"]
    y = tank_roof(c) * YIELD_COEFF[c["roof_type"]] * c["filter_eta"] * p_year / 1000.0
    d = daily_demand(c)[2]
    return 0.06 * min(y, d)


def gsv(c):
    """GSV Hemelwater 2023, METHOD.md section 4 (art. 7, 8, 9)"""
    if not c["gsv_on"]:
        return {"applies": False}
    extension = c["gsv_works"] == "extension"
    # art. 7 par. 6 counted roof
    # first paragraph: horizontal roof of the new building or of the extension (hard + green, raw);
    # second paragraph (extension): + at least 2 x that area, at most the whole existing roof;
    # third paragraph (r4 Y6-1): in the area of paragraphs 1 and 2 the green roof parts >= 50 L/m2 count half
    raw = c["roof_m2"] + c["green_m2"]
    a_t = raw + (min(2.0 * raw, c["existing_roof_m2"]) if extension else 0.0)
    if c["green_50"]:
        a_t -= 0.5 * c["green_m2"]
    a_p = c["paved_m2"]
    if extension:
        a_p += min(2.0 * a_p, c["existing_paved_m2"])
    s_l = c["tank_m3"] * 1000.0
    use = c["gsv_use"]
    required = True
    need_l = 0.0
    if use == "single":
        if extension and c["existing_tank"]:
            rule, required = "existing_tank", False
        elif a_t < 80:
            rule, need_l = "lt80", 5000.0
        elif a_t < 120:
            rule, need_l = "r80_120", 7500.0
        elif a_t < 200:
            rule, need_l = "r120_200", 10000.0
        else:
            rule, need_l = "ge200", 100.0 * a_t
    elif use == "multi":
        if extension and c["existing_tank"]:
            rule, required = "existing_tank", False
        else:
            rule, need_l = "multi", 100.0 * a_t
    else:
        if c["no_use_justified"]:  # r4 Y6-3: the exception must be shown, zero demand alone is not enough
            rule, required = "no_use", False
        elif extension and c["existing_tank"] and 100.0 * a_t < 10000.0:
            rule, required = "existing_lt10000", False
        else:
            rule, need_l = "nodwelling", 100.0 * a_t
    if required and a_t <= 0:
        rule, required, need_l = "no_roof", False, 0.0
    ok = (not required) or s_l + 1e-9 >= need_l
    if use == "single":
        units_min = 1
    elif use == "multi" and required:
        units_min = min(max(1, int(c["units"])), max(1, math.ceil(max(s_l, need_l) / 5000.0 - 1e-9)))
    else:
        units_min = 0
    # art. 8 par. 2 deduction: 30 m2 per connected dwelling with a compliant or existing connected tank
    tank_there = ok if required else rule in ("existing_tank", "existing_lt10000")
    if use == "single":
        n_conn = 1
    elif use == "multi":
        # dwellings connected to the tank: the user's number (default 1), at least units_min when a tank is required
        entered = min(max(1, int(c["units"])), int(c["units_connected"]))
        n_conn = max(units_min, entered) if required else entered
    else:
        n_conn = 0
    gross = a_p + a_t
    ded = min(gross, 30.0 if use == "none" else 30.0 * n_conn) if tank_there else 0.0
    a_i = gross - ded
    out = dict(applies=True, roof_counted_m2=a_t, tank_rule=rule, tank_min_L=need_l, tank_ok=ok, units_min=units_min,
               inf_applies=False, inf_reason="", inf_area_counted_m2=a_i, inf_area_min_m2=0.0, inf_volume_min_L=0.0,
               buffer_applies=False, buffer_volume_L=0.0, buffer_q_ls=0.0)
    if c["plot_m2"] < 120:
        out["inf_reason"] = "plot_lt120"
    elif a_i <= 0:
        out["inf_reason"] = "no_area"
    elif c["gsv_infiltration"] == "possible":
        out.update(inf_applies=True, inf_area_min_m2=0.08 * a_i, inf_volume_min_L=33.0 * a_i)
    else:
        out["inf_reason"] = "impossible"
        if a_i >= 1000:
            out.update(buffer_applies=True, buffer_volume_L=43.0 * a_i, buffer_q_ls=5.0 * a_i / 10000.0)
    return out


# METHOD.md section 7: the allowed ids of each choice (a missing choice takes the default listed in BASE)
CHOICE_IDS = {
    "rain": ("uccle",),
    "roof_type": tuple(YIELD_COEFF),
    "gsv_use": ("single", "multi", "none"),
    "gsv_works": ("new", "extension"),
    "gsv_infiltration": ("possible", "impossible"),
}


def choice_errors(c):
    errs = []
    for field, ids in CHOICE_IDS.items():
        v = c.get(field)
        if v is None or v == "":
            continue  # missing -> default, not an error
        if not isinstance(v, str) or v not in ids:
            errs.append("choice:" + field)
    return errs


def compute(c):
    errs = choice_errors(c)
    if errs:
        return {"valid": False, "errors": errs}
    s = rain_series(c)
    b = balance(c, s, c["tank_m3"])
    exp = dict(rain_mm=b["rain"], inflow=b["q"], demand=b["d"], yield_=b["y"], overflow=b["o"], overflow_days=b["od"],
               empty_days=b["ed"], coverage=b["coverage"], efficiency=b["efficiency"], savings_eur=b["y"] * c["water_price"],
               din_V_m3=din_simplified(c))
    exp["yield"] = exp.pop("yield_")
    exp["gsv"] = gsv(c)
    return exp


PRESETS = {
    "house_gsv": dict(roof_m2=120, tank_m3=10, persons=4, paved_m2=30, plot_m2=500),
    "house_garden": dict(roof_m2=119, tank_m3=7.5, persons=4, garden_m2=200, garden_mm=150, paved_m2=30, plot_m2=600),
    "green_roof": dict(roof_m2=60, green_m2=60, green_50=True, tank_m3=7.5, persons=4, paved_m2=25, plot_m2=450),
    "apartments_24": dict(roof_m2=450, tank_m3=45, gsv_use="multi", units=24, persons=22, wc_lpd=24, laundry_lpd=12, paved_m2=200, plot_m2=1500),
    "office_buffer": dict(roof_m2=900, roof_type="flat_gravel", tank_m3=90, gsv_use="none", units=0, persons=600, wc_lpd=15, laundry_lpd=0,
                          days_week=5, other_m3y=50, paved_m2=1200, plot_m2=4000, gsv_infiltration="impossible"),
    "house_extension": dict(roof_m2=30, tank_m3=5, gsv_works="extension", existing_tank=True, existing_roof_m2=110, paved_m2=20,
                            existing_paved_m2=60, persons=4, plot_m2=700),
}


def cases():
    out = []

    def add(cid, note, base=None, **kw):
        c = dict(BASE)
        if base:
            c.update(PRESETS[base])
        c.update(kw)
        c["id"] = cid
        c["note"] = note
        out.append(c)

    for k in PRESETS:
        add(k, "preset " + k, base=k)
    for v in (0, 1, 2.5, 5, 15):
        add("house_V%s" % v, "house, tank %s m3" % v, base="house_gsv", tank_m3=v)
    for a in (79.9, 80, 150, 200, 260):
        add("house_roof_%s" % a, "one dwelling, roof %s m2" % a, base="house_gsv", roof_m2=a, tank_m3=10)
    for rt in ("flat_bare", "flat_gravel", "green_extensive", "green_intensive"):
        add("roof_" + rt, "roof type " + rt, base="house_gsv", roof_type=rt)
    add("dry_year", "rain factor 0.75 with garden", base="house_garden", rain_factor=0.75)
    add("wet_coast", "rain factor 1.1", base="house_gsv", rain_factor=1.1, tank_m3=3)
    add("indep_days", "persistence 0", base="house_garden", persistence=0.0)
    add("persist_06", "persistence 0.6", base="house_garden", persistence=0.6)
    add("seed_other", "another seed, 50 years", base="house_garden", seed=12345, years=50)
    add("filter_08", "filter efficiency 0.8", base="house_gsv", filter_eta=0.8, tank_m3=4)
    add("office_5d", "office 5 days a week, infiltration possible", base="office_buffer", gsv_infiltration="possible")
    add("school_like", "large roof, small demand", roof_m2=1500, roof_type="flat_bare", tank_m3=30, gsv_use="none", persons=300,
        wc_lpd=6, laundry_lpd=0, days_week=5, paved_m2=800, plot_m2=8000)
    add("no_demand", "no use: infiltrate", gsv_use="none", persons=0, wc_lpd=0, laundry_lpd=0, roof_m2=300, tank_m3=0, paved_m2=200, plot_m2=2000)
    add("multi_7", "Codex example: 7 flats, 110 m2, 11 m3", gsv_use="multi", units=7, roof_m2=110, tank_m3=11, persons=16)
    add("multi_2", "two-family house, 110 m2, 11 m3", gsv_use="multi", units=2, roof_m2=110, tank_m3=11, persons=5)
    add("multi_short", "24 flats, tank too small", base="apartments_24", tank_m3=30)
    add("green_not50", "green roof < 50 L/m2 counts fully", base="green_roof", green_50=False)
    add("ext_no_tank", "extension, no existing tank", base="house_extension", existing_tank=False, existing_roof_m2=40, tank_m3=5)
    add("nodw_ext_small", "no dwelling, extension < 10 000 L, existing tank", gsv_use="none", gsv_works="extension", existing_tank=True,
        roof_m2=30, existing_roof_m2=500, tank_m3=20, persons=20, wc_lpd=15, laundry_lpd=0, days_week=5, paved_m2=0, plot_m2=3000)
    add("nodw_ext_big", "no dwelling, extension >= 10 000 L, existing tank", gsv_use="none", gsv_works="extension", existing_tank=True,
        roof_m2=40, existing_roof_m2=500, tank_m3=20, persons=20, wc_lpd=15, laundry_lpd=0, days_week=5, paved_m2=0, plot_m2=3000)
    add("small_plot", "plot below 120 m2", base="house_gsv", roof_m2=60, tank_m3=5, paved_m2=10, plot_m2=110)
    add("buffer_small", "infiltration impossible below 1000 m2", base="house_gsv", gsv_infiltration="impossible")
    add("gsv_off", "GSV check off", base="house_gsv", gsv_on=False)
    add("multi_ext_conn4", "several dwellings, extension, existing tank, 4 dwellings connected", gsv_use="multi", units=6, units_connected=4,
        gsv_works="extension", existing_tank=True, roof_m2=40, existing_roof_m2=300, paved_m2=50, existing_paved_m2=100, persons=12, plot_m2=900)
    add("green_ext_conn", "extensive green roof connected to the tank (DIN 1989-1 e 0.5)", base="house_gsv", roof_type="green_extensive")
    # r3 X3-1 (Codex): the obligation found with the correct choice, and the same inputs with a typo -> refused, no buffer dropped
    x31 = dict(roof_m2=900, paved_m2=1200, plot_m2=4000, gsv_use="none")
    add("x31_buffer_impossible", "X3-1 Codex inputs, infiltration impossible -> buffer 43 L/m2", gsv_infiltration="impossible", **x31)
    add("x31_typo_infiltration", "X3-1 typo 'impossble' in gsv_infiltration -> input error", gsv_infiltration="impossble", **x31)
    add("x31_bad_use", "X3-1 unknown building use -> input error", base="house_gsv", gsv_use="office")
    add("x31_bad_works", "X3-1 unknown kind of works -> input error", base="house_extension", gsv_works="renovation")
    add("x31_bad_roof", "X3-1 roof type that is not a listed id -> input error", base="house_gsv", roof_type="constructor")
    add("x31_bad_rain", "X3-1 rain station without data -> input error", base="house_gsv", rain="ostend")
    # r4 cases (Codex pass 6)
    add("y61_ext_green", "Y6-1 extension 60 m2 green roof + 120 m2 existing roof, 10 m3", roof_m2=0, green_m2=60, green_50=True,
        gsv_works="extension", existing_roof_m2=120, tank_m3=10, paved_m2=0)
    add("y61_ext_mixed", "Y6-1 extension 20 m2 hard + 40 m2 green, existing roof 500 m2 (cap 2 x 60)", roof_m2=20, green_m2=40,
        gsv_works="extension", existing_roof_m2=500, tank_m3=10, paved_m2=15, existing_paved_m2=100)
    add("y63_empty_nodwelling", "Y6-3 empty non-residential building, demand 0, exception not shown -> 15 000 L", gsv_use="none", units=0,
        roof_m2=150, persons=0, other_m3y=0, tank_m3=0, paved_m2=0)
    add("y63_justified", "Y6-3 same, no use demonstrated (art. 7 par. 3) -> infiltrate", gsv_use="none", units=0, roof_m2=150, persons=0,
        other_m3y=0, tank_m3=0, paved_m2=0, no_use_justified=True)
    add("no_demand_justified", "no use demonstrated: infiltrate", gsv_use="none", persons=0, wc_lpd=0, laundry_lpd=0, roof_m2=300, tank_m3=0,
        paved_m2=200, plot_m2=2000, no_use_justified=True)
    add("y65_seed165_1y", "Y6-5 one year, seed 165: dry April redrawn", years=1, seed=165, roof_m2=100, filter_eta=0.9)
    add("y64_low_factor", "Y6-4 rain factor 0.3: mean wet-day amount < 2 mm, plain exponential", base="house_gsv", rain_factor=0.3)
    for a in ANCHORS:
        add(a["id"], a["note"], **a["inputs"])
        out[-1]["anchor"] = a["expect"]
    return out


# External anchors (D-PLB-10): expected values written by hand, not computed by this script.
ANCHORS = [
    # r4 Y6-1, BVR 10.02.2023 art. 7 par. 6 (three paragraphs), by hand: extension with 60 m2 green roof (>= 50 L/m2) against an
    # existing 120 m2 roof: raw 60 + min(2 x 60, 120) = 180 m2, green part halved: 180 - 30 = 150 m2 -> one dwelling par. 1
    # 120 <= 150 < 200 -> 10 000 L (10 m3 tank complies); art. 8: 150 m2 - 30 m2 (compliant tank, one dwelling) = 120 m2 -> 3 960 L
    dict(id="anchor_y61_art7p6", note="anchor: decree art. 7 par. 6, extension 60 m2 green + 120 m2 existing -> 150 m2, 10 000 L",
         inputs=dict(roof_m2=0, green_m2=60, green_50=True, gsv_works="extension", existing_roof_m2=120, tank_m3=10, paved_m2=0),
         expect={"gsv.roof_counted_m2": 150, "gsv.tank_min_L": 10000, "gsv.tank_ok": True, "gsv.inf_volume_min_L": 3960}),
    # r4 Y6-3, art. 7 par. 3: no dwelling, 150 m2 roof, no use not demonstrated -> 100 L/m2 x 150 = 15 000 L, no tank -> not ok
    dict(id="anchor_y63_art7p3", note="anchor: decree art. 7 par. 3, 150 m2, exception not shown -> 15 000 L",
         inputs=dict(gsv_use="none", units=0, roof_m2=150, persons=0, other_m3y=0, tank_m3=0, paved_m2=0),
         expect={"gsv.tank_min_L": 15000, "gsv.tank_ok": False}),
    # r4 Y6-5: one year; every month meets its KMI normal, so annual rain = 837.2 mm and inflow = 100 x 0.8 x 0.9 x 0.8372 = 60.2784 m3
    dict(id="anchor_y65_inflow", note="anchor: one year, seed 165 -> rain 837.2 mm, inflow 60.2784 m3 (sum of normals)",
         inputs=dict(years=1, seed=165, roof_m2=100, filter_eta=0.9),
         expect={"rain_mm": 837.2, "inflow": 60.2784}),
    # BVR 10.02.2023 art. 7 par. 2 (several dwellings): 100 L per m2 counted roof, at least one dwelling connected per started
    # 5000 L. Two-family house, 110 m2 roof: 110 x 100 = 11 000 L; 11 000 / 5000 = 2.2 -> 3 started blocks, but only 2 dwellings exist -> 2.
    dict(id="anchor_art7_2flats", note="anchor: decree art. 7 par. 2, 2 flats, 110 m2 -> 11 000 L, 2 dwellings connected",
         inputs=dict(gsv_use="multi", units=2, roof_m2=110, tank_m3=11, persons=5, paved_m2=0, plot_m2=100),
         expect={"gsv.tank_min_L": 11000, "gsv.units_min": 2, "gsv.tank_ok": True}),
    # same roof, 7 flats: 11 000 L, 3 dwellings (3 started blocks of 5000 L)
    dict(id="anchor_art7_7flats", note="anchor: decree art. 7 par. 2, 7 flats, 110 m2 -> 11 000 L, 3 dwellings connected",
         inputs=dict(gsv_use="multi", units=7, roof_m2=110, tank_m3=11, persons=16, paved_m2=0, plot_m2=100),
         expect={"gsv.tank_min_L": 11000, "gsv.units_min": 3, "gsv.tank_ok": True}),
    # art. 7 par. 1 table, one dwelling, roof 150 m2 -> 10 000 L; a 7.5 m3 tank does not comply
    dict(id="anchor_art7_single150", note="anchor: decree art. 7 par. 1, one dwelling, 150 m2 roof -> 10 000 L, 7 500 L tank short",
         inputs=dict(gsv_use="single", roof_m2=150, tank_m3=7.5, paved_m2=0, plot_m2=100),
         expect={"gsv.tank_min_L": 10000, "gsv.tank_ok": False}),
    # art. 8: one dwelling, 100 m2 roof + 50 m2 new paving, compliant 7 500 L tank, plot 400 m2:
    # counted area 150 - 30 = 120 m2; infiltration area >= 8 % = 9.6 m2; buffer volume >= 33 L/m2 = 3 960 L
    dict(id="anchor_art8_house", note="anchor: decree art. 8, 100 m2 roof + 50 m2 paving, compliant tank -> 120 m2, 9.6 m2, 3 960 L",
         inputs=dict(gsv_use="single", roof_m2=100, tank_m3=7.5, paved_m2=50, plot_m2=400),
         expect={"gsv.inf_area_counted_m2": 120, "gsv.inf_area_min_m2": 9.6, "gsv.inf_volume_min_L": 3960}),
    # art. 9: no dwelling, infiltration impossible, 900 m2 roof + 1 200 m2 paving, tank 90 m3 (compliant, 100 L/m2):
    # counted 2 100 - 30 = 2 070 m2 >= 1 000 -> buffer 43 x 2 070 = 89 010 L, outflow 5 l/s/ha x 0.207 ha = 1.035 l/s
    dict(id="anchor_art9_office", note="anchor: decree art. 9, 2 070 m2 counted -> 89 010 L buffer, 1.035 l/s",
         inputs=dict(gsv_use="none", units=0, roof_m2=900, roof_type="flat_gravel", tank_m3=90, persons=600, wc_lpd=15, laundry_lpd=0,
                     days_week=5, paved_m2=1200, plot_m2=4000, gsv_infiltration="impossible"),
         expect={"gsv.buffer_volume_L": 89010, "gsv.buffer_q_ls": 1.035, "gsv.tank_min_L": 90000}),
    # DIN 1989-1 simplified method (6 % of the smaller of annual yield and demand), by hand:
    # roof 150 m2 hard pitched e 0.8, filter 0.9, KMI Uccle sum of the monthly normals 837.2 mm/a -> 150 x 0.8 x 0.9 x 0.8372 = 90.4176 m3/a;
    # demand 4 persons x (24 + 12) L/d x 365 = 52.56 m3/a -> V = 0.06 x 52.56 = 3.1536 m3
    dict(id="anchor_din1989_house", note="anchor: DIN 1989-1 simplified method by hand, 150 m2, 4 persons -> 3.1536 m3",
         inputs=dict(roof_m2=150, tank_m3=4, persons=4, wc_lpd=24, laundry_lpd=12),
         expect={"din_V_m3": 3.1536, "rain_mm": 837.2}),
    # DIN 1989-1 with an extensive green roof e 0.5 (Table 3): 200 m2 x 0.5 x 0.9 x 0.8372 = 75.348 m3/a < demand of
    # 6 persons x 36 L/d x 365 = 78.84 m3/a -> V = 0.06 x 75.348 = 4.52088 m3 (yield-limited)
    dict(id="anchor_din1989_green", note="anchor: DIN 1989-1 simplified, extensive green roof e 0.5 -> 4.52088 m3",
         inputs=dict(roof_m2=200, roof_type="green_extensive", tank_m3=5, persons=6, wc_lpd=24, laundry_lpd=12, paved_m2=0),
         expect={"din_V_m3": 4.52088}),
]


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    data = cases()
    for c in data:
        c["expect"] = compute(c)
        if c["expect"].get("valid") is False:
            continue
        for k, v in c.pop("anchor", {}).items():  # hand anchors must agree with the method implementation
            got = c["expect"]["gsv"][k[4:]] if k.startswith("gsv.") else c["expect"][k]
            ok = got == v if isinstance(v, bool) else abs(got - v) <= 1e-6 * max(1.0, abs(v))
            if not ok:
                raise SystemExit("anchor %s %s: hand %r, method %r" % (c["id"], k, v, got))
            c.setdefault("anchors", {})[k] = v
    with open(os.path.join(here, "plbrainwater_ref.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    print("plbrainwater_ref.json: %d cases" % len(data))
