"""Independent reference for plbwatersaving (water saving & fixture efficiency).

Written from the published method _plb/save/METHOD.md (plbsaving-1.2), not from plb-saving.js.
Round 4 (Y6-2): METHOD §3b fixture inventory -> lines, one line per existing product with its own count; cases with `fixtures`
carry the expected conversion (expect.lines_from_fixtures) so the bench tests the conversion itself, not only explicit lines.
Run 2 (D-PLB-10/16): uses shared between the lines of a class by count; payback only for a positive saving;
single-bowl timed cistern 10 l/h; ANCHORS = values worked by hand from the regulation texts, asserted before the cases.
Product catalogue and default uses are input data of the method (METHOD.md §3-§4).
Output: bench-src/ref/plbwatersaving_ref.json (list of fully explicit cases + expected values).
Run: python -I bench-src/ref/gen_plbwatersaving.py
"""
import json
import os

KWH_M3K = 1.163

# METHOD.md §3: (class, kind, values)
PROD = {
    "wc_9": ("wc", dict(full=9, reduced=9)), "wc_6": ("wc", dict(full=6, reduced=6)),
    "wc_dual_6_3": ("wc", dict(full=6, reduced=3)), "wc_dual_45_3": ("wc", dict(full=4.5, reduced=3)), "wc_dual_4_2": ("wc", dict(full=4, reduced=2)),
    "urinal_timed": ("urinal", dict(litres=0, timed=7.5, timed_single=10)), "urinal_4": ("urinal", dict(litres=4)), "urinal_2": ("urinal", dict(litres=2)),
    "urinal_1": ("urinal", dict(litres=1)), "urinal_waterless": ("urinal", dict(litres=0, opex=60)),
    "tap_12": ("basin", dict(flow=12)), "tap_9": ("basin", dict(flow=9)), "tap_6": ("basin", dict(flow=6)), "aerator_5": ("basin", dict(flow=5)),
    "tap_sensor_4": ("basin", dict(flow=4, dur=10)),
    "shower_rain_16": ("shower", dict(flow=16)), "shower_12": ("shower", dict(flow=12)), "shower_9": ("shower", dict(flow=9)),
    "shower_6": ("shower", dict(flow=6)), "shower_push_8": ("shower", dict(flow=8, dur=180)),
    "ktap_12": ("kitchen", dict(flow=12)), "ktap_8": ("kitchen", dict(flow=8)), "ktap_6": ("kitchen", dict(flow=6)),
    "bath_160": ("bath", dict(litres=160)), "bath_120": ("bath", dict(litres=120)),
    "washer_60": ("washer", dict(litres=60)), "washer_45": ("washer", dict(litres=45)),
    "dw_15": ("dishwasher", dict(litres=15)), "dw_10": ("dishwasher", dict(litres=10)),
}
CAPEX = {"wc_dual_6_3": 350, "wc_dual_45_3": 380, "wc_dual_4_2": 420, "urinal_2": 300, "urinal_1": 450, "urinal_waterless": 250,
         "tap_6": 120, "aerator_5": 10, "tap_sensor_4": 280, "shower_9": 35, "shower_6": 40, "shower_push_8": 220,
         "ktap_8": 15, "ktap_6": 15, "bath_120": 700, "washer_45": 600, "dw_10": 500}
FLOW = {"basin": (15, 0), "shower": (300, 0), "kitchen": (15, 3)}  # duration s, fill l
HOT = {"basin": 0.5, "shower": 0.6, "kitchen": 0.5, "bath": 0.65}
USES = {
    "wc": dict(residential=4.5, office=2.5, school=2, hotel=4, hospital=4, care_home=4.5, sports=1, retail=0.3, restaurant=0.5, industrial=2.5),
    "urinal": dict(office=1.5, school=1.5, sports=1, retail=0.2, restaurant=0.3, industrial=1.5),
    "basin": dict(residential=5, office=3, school=3, hotel=5, hospital=8, care_home=6, sports=1, retail=0.3, restaurant=0.6, industrial=3),
    "shower": dict(residential=0.7, office=0.02, school=0.05, hotel=0.9, hospital=0.5, care_home=0.4, sports=0.8, industrial=0.2),
    "kitchen": dict(residential=3, office=0.5, school=0.2, care_home=1, industrial=0.5),
    "bath": dict(residential=0.15, hotel=0.2, care_home=0.15),
    "washer": dict(residential=0.15, hotel=0.05, care_home=0.3),
    "dishwasher": dict(residential=0.15, office=0.02),
}
DAYS = dict(residential=365, office=230, hotel=365, hospital=365, care_home=365, school=180, sports=300, retail=310, restaurant=310, industrial=230)
GLOBAL = dict(price_water=5.5, price_heat=0.10, eta_dhw=0.85, T_hot=60, T_cold=10, co2_heat=0.202, price_el=0.30, co2_el=0.15,
              dual_full_share=0.25, gw_on=False, gw_share=1, gw_yield=0.9, gw_capex=15000, gw_opex=500, gw_kwh_m3=1.5)


# METHOD §3b: plumbing-core fixture id -> (class, existing product); efficient default product per class
FIX = {"wc_cistern": ("wc", "wc_6"), "wc_flushvalve": ("wc", "wc_6"), "urinal_flush": ("urinal", "urinal_4"),
       "urinal_waterless": ("urinal", "urinal_waterless"), "basin": ("basin", "tap_12"), "handbasin_small": ("basin", "tap_12"),
       "shower": ("shower", "shower_12"), "shower_large_head": ("shower", "shower_rain_16"), "sink_kitchen": ("kitchen", "ktap_12"),
       "bath": ("bath", "bath_160"), "washing_machine": ("washer", "washer_60"), "dishwasher_dom": ("dishwasher", "dw_15")}
EFF = {"wc": "wc_dual_4_2", "urinal": "urinal_2", "basin": "aerator_5", "shower": "shower_6", "kitchen": "ktap_6",
       "bath": "bath_120", "washer": "washer_45", "dishwasher": "dw_10"}
CLASS_ORDER = ["wc", "urinal", "basin", "shower", "kitchen", "bath", "washer", "dishwasher"]


def lines_from_fixtures(by, bt):
    """METHOD §3b: group the inventory by (class, existing product), one line each with its summed count; inside a class the
    larger count first, ties by product id; efficient product = class default unless the existing one needs no more litres per use."""
    groups = {}
    for fid, n in by.items():
        if n > 0 and fid in FIX:
            cls, pid = FIX[fid]
            groups.setdefault(cls, {})
            groups[cls][pid] = groups[cls].get(pid, 0) + n
    out = []
    for cls in CLASS_ORDER:
        for pid, n in sorted(groups.get(cls, {}).items(), key=lambda kv: (-kv[1], kv[0])):
            ln = line(bt, cls, n, pid, EFF[cls])
            if per_use(pid, ln, dict(dual_full_share=0.25)) <= per_use(EFF[cls], ln, dict(dual_full_share=0.25)):
                ln.update(eff=pid, capex=CAPEX.get(pid, 0), opex=PROD[pid][1].get("opex", 0))
            out.append(ln)
    if not any(ln["cls"] == "urinal" for ln in out) and USES["urinal"].get(bt):
        for ln in out:
            if ln["cls"] == "wc":
                ln["uses"] = round(ln["uses"] + USES["urinal"][bt], 3)
    for ln in out:
        ln["uses_set"] = True
    return out


def fixture_case(cid, note, bt, persons, by, **kw):
    lines = lines_from_fixtures(by, bt)
    conv = [dict(cls=x["cls"], count=x["count"], base=x["base"], eff=x["eff"], uses=x["uses"]) for x in lines]
    c = case(cid, note, bt, persons, lines, **kw)
    c["fixtures"] = dict(by)
    c["_conv"] = conv
    return c


def line(bt, cls, count, base, eff, **kw):
    ln = dict(cls=cls, count=count, base=base, eff=eff, uses=USES[cls].get(bt, 0), hot_share=HOT.get(cls, 0),
              capex=CAPEX.get(eff, 0), opex=PROD[eff][1].get("opex", 0))
    if cls in FLOW:
        ln["dur_s"], ln["fill_l"] = FLOW[cls]
    ln.update(kw)
    return ln


def case(cid, note, bt, persons, lines, **kw):
    c = dict(GLOBAL)
    c.update(id=cid, note=note, building_type=bt, persons=persons, days=DAYS[bt], lines=lines)
    if not any(ln["cls"] == "urinal" for ln in lines) and USES["urinal"].get(bt):
        for ln in lines:
            if ln["cls"] == "wc" and "uses_set" not in ln:
                ln["uses"] = round(ln["uses"] + USES["urinal"][bt], 3)
    for ln in lines:
        ln.pop("uses_set", None)
    c.update(kw)
    return c


def per_use(pid, ln, c):
    cls, p = PROD[pid]
    if cls == "wc":
        s = c["dual_full_share"]
        return p["full"] * s + p["reduced"] * (1 - s)
    if cls in FLOW:
        dur = p.get("dur", ln["dur_s"])
        return ln["fill_l"] + p["flow"] * dur / 60.0
    return p["litres"]


def share(ln, c):
    # METHOD §2: count of the line / count of all lines of the same class (0 when the class has no fixtures)
    n = sum(x["count"] for x in c["lines"] if x["cls"] == ln["cls"])
    return ln["count"] / n if n > 0 else 0.0


def timed_rate(pid, count):
    # UK WSR 1999 Sch. 2 para 25: one bowl 10 l/h, several bowls 7.5 l/h each
    p = PROD[pid][1]
    if not p.get("timed"):
        return 0.0
    return p["timed_single"] if count == 1 else count * p["timed"]


def volume(pid, ln, c):
    v = c["persons"] * ln["uses"] * c["days"] * per_use(pid, ln, c) * share(ln, c) / 1000.0
    return v + timed_rate(pid, ln["count"]) * 8760 / 1000.0


def payback(capex, eur):
    # METHOD §2 (D-PLB-16): only a positive saving pays back; capex 0 -> 0 years
    return capex / eur if eur > 0 else None


def compute(c):
    dT = c["T_hot"] - c["T_cold"]
    rows = []
    tot = dict(base=0.0, eff=0.0, kwh_b=0.0, kwh_e=0.0, capex=0.0, flush=0.0, src=0.0)
    for i, ln in enumerate(c["lines"]):
        vb, ve = volume(ln["base"], ln, c), volume(ln["eff"], ln, c)
        eb = vb * ln["hot_share"] * KWH_M3K * dT / c["eta_dhw"]
        ee = ve * ln["hot_share"] * KWH_M3K * dT / c["eta_dhw"]
        changed = ln["eff"] != ln["base"]
        capex = ln["count"] * ln["capex"] if changed else 0.0
        dopex = ln["count"] * (ln["opex"] - PROD[ln["base"]][1].get("opex", 0)) if changed else 0.0
        eur = (vb - ve) * c["price_water"] + (eb - ee) * c["price_heat"] - dopex
        pb = payback(capex, eur) if changed else None
        rows.append(dict(cls=ln["cls"], saved_m3=vb - ve, saved_eur=eur, payback_y=pb, base_m3=vb, eff_m3=ve, changed=changed, i=i))
        tot["base"] += vb
        tot["eff"] += ve
        tot["kwh_b"] += eb
        tot["kwh_e"] += ee
        tot["capex"] += capex
        if ln["cls"] in ("wc", "urinal"):
            tot["flush"] += ve
        if ln["cls"] in ("shower", "bath", "basin"):
            tot["src"] += ve
    used = gw_eur = gw_co2 = gw_capex = 0.0
    gw_pb = None
    if c["gw_on"]:
        yld = tot["src"] * c["gw_share"] * c["gw_yield"]
        used = min(yld, tot["flush"])
        kwh_el = used * c["gw_kwh_m3"]
        gw_co2 = kwh_el * c["co2_el"]
        gw_eur = used * c["price_water"] - kwh_el * c["price_el"] - c["gw_opex"]
        gw_capex = c["gw_capex"]
        gw_pb = payback(gw_capex, gw_eur)
    mains = tot["eff"] - used
    saved_kwh = tot["kwh_b"] - tot["kwh_e"]
    saved_eur = sum(r["saved_eur"] for r in rows) + gw_eur
    capex = tot["capex"] + gw_capex
    pd = c["persons"] * c["days"]
    any_change = any(r["changed"] for r in rows) or c["gw_on"]
    changed = [r for r in rows if r["changed"]]
    changed.sort(key=lambda r: (float("inf") if r["payback_y"] is None else r["payback_y"], r["i"]))
    return dict(
        base_m3=tot["base"], eff_m3=tot["eff"], mains_m3=mains, saved_m3=tot["base"] - mains,
        mains_lpd=mains * 1000 / pd, saved_kwh=saved_kwh, saved_co2=saved_kwh * c["co2_heat"] - gw_co2,
        saved_eur=saved_eur, capex=capex, payback_y=payback(capex, saved_eur) if any_change else None, gw_payback_y=gw_pb,
        gw_used_m3=used, flush_l_day=(tot["flush"] - used) * 1000 / c["days"],
        hot_l_day=sum(volume(ln["eff"], ln, c) * ln["hot_share"] for ln in c["lines"]) * 1000 / c["days"],
        order=[r["i"] for r in changed],
        rows=[dict(cls=r["cls"], saved_m3=r["saved_m3"], saved_eur=r["saved_eur"], payback_y=r["payback_y"]) for r in rows],
    )


def cases():
    out = []
    R = "residential"
    # the six presets of the page (same products and counts)
    out.append(case("apartments_old", "preset: old flats", R, 57, [
        line(R, "wc", 30, "wc_9", "wc_dual_4_2"), line(R, "basin", 30, "tap_12", "aerator_5"), line(R, "shower", 24, "shower_12", "shower_6"),
        line(R, "kitchen", 24, "ktap_12", "ktap_6"), line(R, "bath", 6, "bath_160", "bath_160"), line(R, "washer", 24, "washer_60", "washer_60"),
        line(R, "dishwasher", 24, "dw_15", "dw_15")], price_water=5.5))
    O = "office"
    out.append(case("office_urinals", "preset: office, waterless urinals", O, 600, [
        line(O, "wc", 50, "wc_6", "wc_dual_4_2"), line(O, "urinal", 24, "urinal_4", "urinal_waterless"), line(O, "basin", 58, "tap_9", "aerator_5"),
        line(O, "kitchen", 8, "ktap_12", "ktap_6"), line(O, "shower", 6, "shower_12", "shower_6"), line(O, "dishwasher", 8, "dw_15", "dw_15")], price_water=5))
    S = "school"
    out.append(case("school_timed", "preset: school, timed urinal cisterns", S, 660, [
        line(S, "wc", 30, "wc_6", "wc_6"), line(S, "urinal", 15, "urinal_timed", "urinal_2"), line(S, "basin", 25, "tap_12", "tap_sensor_4")]))
    H = "hotel"
    out.append(case("hotel_rain", "preset: hotel rain heads", H, 180, [
        line(H, "wc", 128, "wc_6", "wc_6"), line(H, "basin", 130, "tap_12", "aerator_5"), line(H, "shower", 98, "shower_rain_16", "shower_9"),
        line(H, "bath", 30, "bath_160", "bath_160")]))
    SP = "sports"
    out.append(case("sports_push", "preset: sports hall push showers", SP, 120, [
        line(SP, "shower", 32, "shower_12", "shower_push_8"), line(SP, "wc", 12, "wc_6", "wc_6"), line(SP, "urinal", 3, "urinal_4", "urinal_2"),
        line(SP, "basin", 16, "tap_12", "aerator_5")]))
    C = "care_home"
    care = [line(C, "wc", 84, "wc_6", "wc_dual_4_2"), line(C, "basin", 84, "tap_12", "aerator_5"), line(C, "shower", 81, "shower_12", "shower_9"),
            line(C, "bath", 3, "bath_160", "bath_160"), line(C, "washer", 3, "washer_60", "washer_60")]
    out.append(case("care_greywater", "preset: care home with greywater", C, 80, care, gw_on=True, gw_capex=25000, gw_opex=600))

    # variations
    import copy
    base = out[0]
    var = [
        ("res_full_share_033", dict(dual_full_share=1 / 3)),
        ("res_heat_pump", dict(eta_dhw=3.0, price_heat=0.30, co2_heat=0.15)),
        ("res_cheap_water", dict(price_water=2.0)),
        ("res_hot55_cold15", dict(T_hot=55, T_cold=15)),
        ("res_greywater", dict(gw_on=True)),
        ("res_greywater_half", dict(gw_on=True, gw_share=0.4, gw_yield=0.8, gw_kwh_m3=2.5)),
        ("res_120_persons", dict(persons=120)),
        ("res_250_days", dict(days=250)),
    ]
    for vid, kw in var:
        c = copy.deepcopy(base)
        c.update(id=vid, note="apartments variant " + ", ".join("%s=%s" % kv for kv in kw.items()))
        c.update(kw)
        out.append(c)
    # small office: waterless urinals do not pay back (cartridges)
    out.append(case("small_office_waterless", "6 urinals, 20 staff, waterless", O, 20, [
        line(O, "urinal", 6, "urinal_2", "urinal_waterless"), line(O, "wc", 3, "wc_6", "wc_dual_6_3")], price_water=4))
    out.append(case("office_urinal_1l", "office, 1 l urinals", O, 300, [
        line(O, "urinal", 12, "urinal_4", "urinal_1"), line(O, "wc", 25, "wc_9", "wc_dual_45_3"), line(O, "basin", 25, "tap_12", "tap_6")]))
    out.append(case("school_timed_only", "timed cisterns kept, sensor taps", S, 300, [
        line(S, "urinal", 20, "urinal_timed", "urinal_timed"), line(S, "basin", 30, "tap_9", "tap_sensor_4"), line(S, "wc", 20, "wc_9", "wc_6")]))
    out.append(case("school_no_urinals", "school without urinals (urinal uses on WCs)", S, 400, [
        line(S, "wc", 30, "wc_9", "wc_dual_4_2"), line(S, "basin", 20, "tap_12", "aerator_5")]))
    out.append(case("hotel_baths", "hotel compact baths + 6 l heads", H, 250, [
        line(H, "bath", 60, "bath_160", "bath_120"), line(H, "shower", 100, "shower_12", "shower_6"), line(H, "wc", 120, "wc_dual_6_3", "wc_dual_4_2"),
        line(H, "washer", 4, "washer_60", "washer_45")], eta_dhw=0.92, price_heat=0.12))
    out.append(case("sports_long_showers", "sports, 7 min showers, 6 l heads", SP, 200, [
        line(SP, "shower", 40, "shower_rain_16", "shower_6", dur_s=420), line(SP, "basin", 20, "tap_12", "tap_sensor_4", dur_s=20)]))
    out.append(case("res_kitchen_fill", "flats: kitchen fill 6 l", R, 40, [
        line(R, "kitchen", 16, "ktap_12", "ktap_8", fill_l=6, dur_s=20), line(R, "dishwasher", 16, "dw_15", "dw_10"), line(R, "washer", 16, "washer_60", "washer_45")]))
    out.append(case("care_gw_deficit", "care home: greywater only from 30 % of rooms", C, 80, copy.deepcopy(care), gw_on=True, gw_share=0.3, gw_capex=12000))
    out.append(case("care_gw_old_wc", "care home: greywater with old 6 l WCs", C, 80,
                    [dict(ln, eff=("wc_6" if ln["cls"] == "wc" else ln["eff"]), capex=(0 if ln["cls"] == "wc" else ln["capex"])) for ln in copy.deepcopy(care)],
                    gw_on=True, gw_capex=25000, gw_opex=600))
    out.append(case("industrial_mix", "industrial, mixed measures", "industrial", 150, [
        line("industrial", "wc", 12, "wc_9", "wc_6"), line("industrial", "urinal", 6, "urinal_timed", "urinal_waterless"),
        line("industrial", "shower", 15, "shower_12", "shower_push_8"), line("industrial", "basin", 12, "tap_12", "aerator_5"),
        line("industrial", "kitchen", 2, "ktap_12", "ktap_6")], price_water=4.5, price_heat=0.08))
    out.append(case("hospital_basins", "hospital, basins only", "hospital", 400, [
        line("hospital", "basin", 300, "tap_9", "tap_sensor_4"), line("hospital", "shower", 200, "shower_9", "shower_6"), line("hospital", "wc", 250, "wc_6", "wc_dual_45_3")],
        eta_dhw=0.9))
    out.append(case("retail_small", "retail, few uses", "retail", 1000, [
        line("retail", "wc", 10, "wc_9", "wc_dual_4_2"), line("retail", "urinal", 4, "urinal_4", "urinal_2"), line("retail", "basin", 10, "tap_12", "aerator_5")]))
    out.append(case("restaurant", "restaurant guests", "restaurant", 300, [
        line("restaurant", "wc", 6, "wc_6", "wc_dual_4_2"), line("restaurant", "urinal", 3, "urinal_4", "urinal_1"), line("restaurant", "basin", 6, "tap_12", "tap_sensor_4")]))
    out.append(case("res_zero_capex", "flats, free products (capex 0)", R, 30, [
        line(R, "shower", 12, "shower_12", "shower_9", capex=0), line(R, "basin", 12, "tap_12", "tap_9")]))
    # run 2 (CR-29): worse product, capex 0 at a loss, count 0, rows sharing a class, single timed bowl, nothing changed
    out.append(case("worse_wc_capex0", "4/2 dual flush replaced by 9 l single flush at no cost: loses money, never pays back", O, 100, [
        line(O, "wc", 10, "wc_dual_4_2", "wc_9", capex=0)]))
    out.append(case("waterless_capex0_loss", "1 l urinals -> waterless for free, cartridges cost more than the water", O, 20, [
        line(O, "urinal", 6, "urinal_1", "urinal_waterless", capex=0), line(O, "wc", 3, "wc_6", "wc_6")], price_water=4))
    out.append(case("count_zero", "WC row with 0 fixtures next to a real row", O, 100, [
        line(O, "wc", 0, "wc_9", "wc_dual_4_2"), line(O, "basin", 8, "tap_12", "aerator_5")]))
    out.append(case("split_rows", "40 WCs: 30 replaced, 10 kept", R, 60, [
        line(R, "wc", 30, "wc_9", "wc_dual_4_2"), line(R, "wc", 10, "wc_9", "wc_9"), line(R, "shower", 20, "shower_12", "shower_9")]))
    out.append(case("single_timed_bowl", "one timed urinal bowl -> sensor 2 l", O, 15, [
        line(O, "urinal", 1, "urinal_timed", "urinal_2"), line(O, "wc", 2, "wc_6", "wc_6")]))
    out.append(case("nothing_changed", "no measure selected", R, 20, [
        line(R, "wc", 8, "wc_6", "wc_6"), line(R, "basin", 8, "tap_9", "tap_9")]))
    out.append(case("greywater_free_loss", "greywater at capex 0 but opex larger than the water saved", R, 10, [
        line(R, "wc", 4, "wc_6", "wc_6"), line(R, "shower", 4, "shower_12", "shower_12")], gw_on=True, gw_capex=0, gw_opex=2000))
    # round 4 (Y6-2): inventory -> lines with mixed existing products of one class
    out.append(fixture_case("fix_mixed_showers", "Codex Y6-2: 6 rain heads 16 l/min + 4 heads 12 l/min, all -> 6 l/min", R, 10,
                            {"shower_large_head": 6, "shower": 4}))
    out.append(fixture_case("fix_mixed_office", "office inventory: two WC types, 3 flush urinals + 2 waterless (kept), basins, two shower types", O, 50,
                            {"wc_cistern": 6, "wc_flushvalve": 2, "urinal_flush": 3, "urinal_waterless": 2, "basin": 5, "handbasin_small": 2,
                             "shower": 1, "shower_large_head": 1}))
    out.append(fixture_case("fix_school_no_urinals", "school inventory without urinals: urinal uses on the WC line", "school", 200,
                            {"wc_cistern": 10, "basin": 6, "bidet": 1}))
    for c in out:
        conv = c.pop("_conv", None)
        c["expect"] = compute(c)
        if conv is not None:
            c["expect"]["lines_from_fixtures"] = conv
    return out


# External anchors (D-PLB-10): literals worked out by hand from the regulation texts, not from the JS or from this file's tables.
#  A1-A3 Commission Decision 2013/641/EU, criterion 1 (EU Ecolabel flushing toilets): average flush volume of a dual-flush WC
#        = (full + 3 x reduced) / 4  ->  6/3: 15/4 = 3.75 l; 4.5/3: 13.5/4 = 3.375 l; 4/2: 10/4 = 2.5 l.
#  A4-A5 Water Supply (Water Fittings) Regulations 1999, Sch. 2 para 25(1): automatic urinal cistern <= 10 l/h for a single bowl,
#        <= 7.5 l/h per bowl for two or more  ->  1 bowl all year 10 x 8760 = 87 600 l = 87.6 m3; 4 bowls 4 x 7.5 x 8760 = 262.8 m3.
#  A6    Water: rho 1000 kg/m3, c_p 4.186 kJ/(kg K) (any steam table at 20-60 degC: 4.18-4.19) -> 1 m3 x 50 K = 209 300 kJ = 58.14 kWh;
#        the method constant 1.163 kWh/(m3 K) gives 58.15 kWh (difference 0.02 %).
#  A7    Hand case from METHOD §2 with A3: office 100 persons, 10 WCs, 4 uses/(p d) (2.5 WC + 1.5 urinal uses, no urinals), 230 d,
#        9 l single -> 4/2 dual: dV = 100 x 4 x 230 x (9 - 2.5) / 1000 = 598 m3/a; x 5.5 EUR/m3 = 3289 EUR/a;
#        capex 10 x 420 = 4200 EUR -> payback 4200 / 3289 = 1.2770 a.
#  A1 note (r4 Y6-6): 2013/641/EU criterion 1(c) limits the average to 3.5 l (toilets with full flush <= 4.0 l exempt), so 6/3 l
#        (3.75 l) is NOT an Ecolabel product -> product assumption; 4.5/3 (3.375 l) and 4/2 (full 4.0 l, 2.5 l) conform.
#  A8-A9 Codex Y6-2 case by hand: 10 residents x 0.7 showers/(p d) x 365 d = 2555 showers/a; 6 of 10 heads at 16 l/min, 4 at 12 l/min,
#        5 min: mean (0.6 x 80 + 0.4 x 60) = 72 l -> 2555 x 72 = 183.96 m3/a; all at 6 l/min: 2555 x 30 = 76.65 m3/a; saved 107.31 m3/a.
#  A10   office 50 persons x 1.5 urinal uses x 230 d = 17 250 uses/a; 3 of 5 urinals 4 l -> 2 l: 17 250 x 0.6 x 2 = 20.7 m3/a saved,
#        the 2 waterless ones stay (0 saved).
ANCHORS = [
    ("A1 EU Ecolabel 2013/641/EU average flush 6/3", lambda: per_use("wc_dual_6_3", {}, dict(dual_full_share=0.25)), 3.75, 1e-12),
    ("A2 EU Ecolabel 2013/641/EU average flush 4.5/3", lambda: per_use("wc_dual_45_3", {}, dict(dual_full_share=0.25)), 3.375, 1e-12),
    ("A3 EU Ecolabel 2013/641/EU average flush 4/2", lambda: per_use("wc_dual_4_2", {}, dict(dual_full_share=0.25)), 2.5, 1e-12),
    ("A4 UK WSR 1999 Sch.2 para 25 single bowl, m3/a", lambda: volume("urinal_timed", dict(cls="urinal", count=1, uses=0), dict(persons=1, days=1, lines=[dict(cls="urinal", count=1)])), 87.6, 1e-12),
    ("A5 UK WSR 1999 Sch.2 para 25 four bowls, m3/a", lambda: volume("urinal_timed", dict(cls="urinal", count=4, uses=0), dict(persons=1, days=1, lines=[dict(cls="urinal", count=4)])), 262.8, 1e-12),
    ("A6 heat of 1 m3 water x 50 K, kWh", lambda: KWH_M3K * 50, 58.14, 5e-4),
    ("A7 hand case office WC 9 l -> 4/2: payback a", lambda: compute(case("a7", "", "office", 100, [line("office", "wc", 10, "wc_9", "wc_dual_4_2")], price_water=5.5))["payback_y"], 1.2770, 1e-4),
    ("A1b EU Ecolabel 2013/641/EU 1(c): 6/3 conforms (avg <= 3.5 or full <= 4.0)", lambda: float(ecolabel_wc("wc_dual_6_3")), 0.0, 0),
    ("A1c EU Ecolabel 2013/641/EU 1(c): 4.5/3 conforms", lambda: float(ecolabel_wc("wc_dual_45_3")), 1.0, 0),
    ("A1d EU Ecolabel 2013/641/EU 1(c): 4/2 conforms", lambda: float(ecolabel_wc("wc_dual_4_2")), 1.0, 0),
    ("A8 Codex Y6-2 mixed showers from the inventory: baseline m3/a", lambda: _fix_codex()["base_m3"], 183.96, 1e-9),
    ("A9 Codex Y6-2 mixed showers from the inventory: saved m3/a", lambda: _fix_codex()["saved_m3"], 107.31, 1e-9),
    ("A10 office inventory: flush urinals 4 -> 2 l row saved m3/a", lambda: compute(fixture_case("a10", "", "office", 50, {"urinal_flush": 3, "urinal_waterless": 2}))["rows"][0]["saved_m3"], 20.7, 1e-9),
    ("A7 hand case office WC 9 l -> 4/2: saved m3/a", lambda: compute(case("a7", "", "office", 100, [line("office", "wc", 10, "wc_9", "wc_dual_4_2")], price_water=5.5))["saved_m3"], 598.0, 1e-9),
]


def ecolabel_wc(pid):
    # 2013/641/EU criterion 1: full <= 6.0 l; reduced <= 3.0 l; average (1 full + 3 reduced)/4 <= 3.5 l unless full <= 4.0 l
    p = PROD[pid][1]
    avg = (p["full"] + 3 * p["reduced"]) / 4.0
    return p["full"] <= 6.0 and p["reduced"] <= 3.0 and (avg <= 3.5 or p["full"] <= 4.0)


def _fix_codex():
    return compute(fixture_case("a8", "", "residential", 10, {"shower_large_head": 6, "shower": 4}))


def check_anchors():
    res = []
    for name, f, exp, tol in ANCHORS:
        got = f()
        ok = abs(got - exp) <= tol * max(1.0, abs(exp))
        res.append(dict(anchor=name, got=got, exp=exp, ok=ok))
        assert ok, "anchor failed: %s got %r exp %r" % (name, got, exp)
    return res


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    anchors = check_anchors()
    data = cases()
    with open(os.path.join(here, "plbwatersaving_ref.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    with open(os.path.join(here, "plbwatersaving_anchors.json"), "w", encoding="utf-8") as f:
        json.dump(anchors, f, indent=1)
    print("plbwatersaving_ref.json: %d cases; external anchors %d/%d" % (len(data), sum(a["ok"] for a in anchors), len(anchors)))
