"""Independent reference for plbliftstation (wastewater lifting station, EN 12056-4).

Written from the published method _plb/lift/METHOD.md (plblift-1.2), not from plb-lift.js:
EN 12056-2 inflow, EN 12056-4 rising-main limits and minimum DN, Colebrook solved with scipy brentq,
duty point on the pump parabola with brentq, sump volume V = Qp*Tc/4, EN 12056-4 6.3 (T*Qp of Table 5,
V > rising-main volume, V >= 20 l) and 5.1 (surface water below flood level not in a wastewater plant).
D-PLB-10: ANCHORS below hold values worked by hand (calculator steps in "hand") from the cited formulas and
standard clauses, not from the JS; main() refuses to write the reference unless this model reproduces them.
Provenance stated honestly: consistency with METHOD + 10 external anchors; no published manufacturer sizing example
was available to the author, so none is claimed.
Output: bench-src/ref/plbliftstation_ref.json  (list of cases: inputs + expected values).
Run: python -I bench-src/ref/gen_plbliftstation.py
"""
import json
import math
import os

from scipy.optimize import brentq

G = 9.81
# (OD mm, wall mm, nominal DN) — EN 12201-2 PE100 SDR11, EN ISO 1452-2 PVC-U PN10 (SDR21), EN 10255 medium
SERIES = {
    "pe100": [(32, 2.9, 25), (40, 3.7, 32), (50, 4.6, 40), (63, 5.8, 50), (75, 6.8, 65), (90, 8.2, 80), (110, 10.0, 100), (125, 11.4, 100), (160, 14.6, 150)],
    "pvc10": [(40, 1.9, 32), (50, 2.4, 40), (63, 3.0, 50), (75, 3.6, 65), (90, 4.3, 80), (110, 5.3, 100), (125, 6.0, 100), (160, 7.7, 150)],
    "steel": [(42.4, 3.2, 32), (48.3, 3.2, 40), (60.3, 3.6, 50), (76.1, 3.6, 65), (88.9, 4.0, 80), (114.3, 4.5, 100), (139.7, 5.0, 125), (165.1, 5.0, 150)],
}
DN_MIN = {"faecal": 80, "cutter": 32, "faecalfree": 32}
# EN 12056-4:2000 6.3: minimum useful volume; Table 5 minimum running time by motor power (kW upper bound, seconds)
V_MIN = 20.0
TABLE5 = [(2.5, 2.2), (7.5, 5.5), (float("inf"), 8.5)]
DEF = dict(inflow_mode="du", sum_du=20.0, K=0.5, du_max=2.0, q_ww_lps=1.0, q_c_lps=0.0, rain_area_m2=0.0, rain_r=600.0, rain_C=1.0,
           water="faecal", interrupt="yes", arrangement="single", alternate="yes", series="pe100", dn_mode="auto", od_manual=90.0,
           L_main=20.0, zeta_sum=6.0, rough_mm=0.25, T_w=15.0, depth_m=3.0, loop_m=0.25, pump_mode="req", H0=14.0, Qn=5.0, Hn=9.0,
           z_max=15.0, v_min=0.7, v_max=2.3, V_useful_l=0.0, main_rule="yes", eta=0.35)


def density(t):
    return 999.97495 * (1 - (t + 288.9414) * (t - 3.9863) ** 2 / (508929.2 * (t + 68.12963)))


def viscosity(t):
    return 0.02939e-3 * math.exp(507.88 / (t + 273.15 - 149.3))


def darcy(re, rel):
    if re <= 0:
        return 0.0
    if re < 2300:
        return 64.0 / re
    f = lambda lam: 1 / math.sqrt(lam) + 2 * math.log10(rel / 3.7 + 2.51 / (re * math.sqrt(lam)))
    return brentq(f, 1e-4, 1.0, xtol=1e-15, rtol=1e-14)


def head(c, d_mm, q_lps):
    d = d_mm / 1000.0
    hgeo = c["depth_m"] + c["loop_m"] + d
    if q_lps <= 0:
        return hgeo
    a = math.pi * d * d / 4
    v = q_lps / 1000.0 / a
    re = density(c["T_w"]) * v * d / viscosity(c["T_w"])
    lam = darcy(re, c["rough_mm"] / d_mm)
    return hgeo + (lam * c["L_main"] / d + c["zeta_sum"]) * v * v / (2 * G)


def run(c):
    if c["inflow_mode"] == "du":
        raw = c["K"] * math.sqrt(c["sum_du"])
        # EN 12056-2: at least the largest single DU — but only if there is any fixture (CR-49)
        qww = max(raw, c["du_max"]) if c["sum_du"] > 0 else 0.0
    else:
        qww = c["q_ww_lps"]
    qr = c["rain_r"] * c["rain_C"] * c["rain_area_m2"] / 1e4
    qin = qww + qr + c["q_c_lps"]
    pipes = [(od, w, dn, od - 2 * w) for od, w, dn in SERIES[c["series"]]]
    flags = []
    if c["dn_mode"] == "manual":
        pipe = min(pipes, key=lambda p: abs(p[0] - c["od_manual"]))
    else:
        ok = [p for p in pipes if p[2] >= DN_MIN[c["water"]] and qin / 1000 / (math.pi * (p[3] / 1000) ** 2 / 4) <= c["v_max"] + 1e-12]
        if ok:
            pipe = ok[0]
        else:
            pipe = pipes[-1]
            flags.append("no_pipe")
    od, w, dn, di = pipe
    if dn < DN_MIN[c["water"]]:
        flags.append("dn_below_min")
    a = math.pi * (di / 1000) ** 2 / 4
    qreq = max(qin, c["v_min"] * a * 1000)
    hreq = head(c, di, qreq)
    hgeo = head(c, di, 0)
    if c["pump_mode"] == "curve":
        pump = lambda q: c["H0"] - (c["H0"] - c["Hn"]) * (q / c["Qn"]) ** 2
        if c["H0"] <= hgeo:
            flags.append("pump_too_weak")
            qp, hp = 0.0, hgeo
        else:
            qmax = c["Qn"] * math.sqrt(c["H0"] / (c["H0"] - c["Hn"]))
            qp = brentq(lambda q: pump(q) - head(c, di, q), 0.0, qmax, xtol=1e-13)
            hp = head(c, di, qp)
    else:
        qp, hp = qreq, hreq
    vp = qp / 1000 / a
    if qp > 0 and vp < c["v_min"] - 1e-9:
        flags.append("v_low")
    if vp > c["v_max"] + 1e-9:
        flags.append("v_high")
    if c["pump_mode"] == "curve" and "pump_too_weak" not in flags and qp < qin:
        flags.append("pump_below_inflow")
    if c["interrupt"] == "no" and c["arrangement"] == "single":
        flags.append("duplex_required")
    # EN 12056-4: the loop invert must lie ABOVE the backflow level; 0 (at the level) is not enough (CR-48)
    if c["loop_m"] <= 0:
        flags.append("loop_below")
    # D-PLB-12: the default rain intensity is a learning assumption r(5,100) ~ Uccle -> flag while it is in use
    if c["rain_area_m2"] > 0 and c["rain_r"] == 600.0:
        flags.append("rain_r_assumed")
    if c["main_rule"] == "no":
        flags.append("main_rule_off")
    if not qin > 0:
        flags.append("no_inflow")
    # EN 12056-4 5.1: surface water of areas below flood level kept separate from domestic wastewater, own plant outside
    if qr > 0 and qww > 0:
        flags.append("rain_mixed")
    elif qr > 0:
        flags.append("surface_outside")
    alt = 2 if (c["arrangement"] == "duplex" and c["alternate"] == "yes") else 1
    # V = Qp * Tc / 4, Tc = 3600 / (z * alt)  [litres]
    v_starts = qp * (3600.0 / (c["z_max"] * alt)) / 4 if qp > 0 else 0.0
    v_main = a * c["L_main"] * 1000
    # EN 12056-4 6.3 eq. (5): V = T * Qp, T from Table 5 by motor power (estimated as input power rho g Qp Hp / eta)
    p1_kw = density(c["T_w"]) * G * qp / 1000 * hp / c["eta"] / 1000
    t_run = next(t for kw, t in TABLE5 if p1_kw <= kw)
    v_t = t_run * qp
    v_dyn = max(v_starts, v_t)
    # 6.3: V >= 20 l; V strictly greater than the discharge-pipe volume (the requirement is the open limit "> v_main")
    v_req = max(v_dyn, V_MIN, v_main if c["main_rule"] == "yes" else 0.0)
    strict = c["main_rule"] == "yes" and v_main >= max(v_dyn, V_MIN)
    vu = c["V_useful_l"]
    v_used = vu if vu > 0 else v_req
    if vu > 0 and vu < v_dyn - 1e-9:
        flags.append("sump_small")
    if vu > 0 and vu < V_MIN - 1e-9:
        flags.append("sump_min20")
    if vu > 0 and c["main_rule"] == "yes" and vu <= v_main + 1e-9:
        flags.append("sump_le_main")
    # worst cycle at inflow Qp/2: Tc = 4V/Qp
    z_tot = 3600.0 / (4 * v_used / qp) if qp > 0 and v_used > 0 else 0.0
    z_pump = z_tot / alt
    if z_pump > c["z_max"] + 1e-9:
        flags.append("starts_high")
    return {
        "q_in": qin, "q_ww": qww, "q_r": qr, "od": od, "id": di, "dn": dn, "q_req": qreq, "H_req": hreq, "H_geo": hgeo,
        "q_p": qp, "H_p": hp, "v_p": vp, "V_main_l": v_main, "V_starts_l": v_starts, "T_run_s": t_run, "V_T_l": v_t, "V_req_l": v_req,
        "V_req_strict": strict, "q_dw": qww + c["q_c_lps"], "q_sw": qr, "z_worst_pump": z_pump,
        "P1_W": density(c["T_w"]) * G * qp / 1000 * hp / c["eta"], "flags": sorted(flags),
    }


PRESETS = {
    "house_basement": dict(inflow_mode="du", sum_du=3.9, K=0.5, du_max=2.0, water="faecal", interrupt="yes", arrangement="single",
                           series="pe100", dn_mode="auto", L_main=12, zeta_sum=6, depth_m=2.6, loop_m=0.25, pump_mode="req", z_max=15, main_rule="yes", V_useful_l=0),
    "office_single": dict(inflow_mode="du", sum_du=60, K=0.5, du_max=2.0, water="faecal", interrupt="no", arrangement="single", alternate="yes",
                          series="pe100", dn_mode="auto", L_main=25, zeta_sum=8, depth_m=3.2, loop_m=0.25, pump_mode="req", z_max=15, main_rule="yes", V_useful_l=0),
    "long_main": dict(inflow_mode="q", q_ww_lps=3.0, water="faecal", interrupt="no", arrangement="duplex", alternate="yes",
                      series="pe100", dn_mode="auto", L_main=140, zeta_sum=10, depth_m=3.5, loop_m=0.3, pump_mode="req", z_max=15, main_rule="yes", V_useful_l=0),
    # plblift-1.2 (Y5-1): the ramp rain is a separate surface-water plant (no wastewater in it), EN 12056-4 5.1
    "ramp_rain": dict(inflow_mode="q", q_ww_lps=0.0, q_c_lps=0.0, rain_area_m2=150, rain_r=600, rain_C=1.0, water="faecalfree", interrupt="no",
                      arrangement="duplex", alternate="yes", series="pvc10", dn_mode="auto", L_main=30, zeta_sum=8, depth_m=3.0, loop_m=0.25, pump_mode="req",
                      z_max=15, main_rule="yes", V_useful_l=0),
    "weak_pump": dict(inflow_mode="du", sum_du=60, K=0.5, du_max=2.0, water="faecal", interrupt="no", arrangement="duplex", alternate="yes",
                      series="pe100", dn_mode="auto", L_main=80, zeta_sum=10, depth_m=4.5, loop_m=0.3, pump_mode="curve", H0=9, Qn=4, Hn=6,
                      z_max=15, main_rule="yes", V_useful_l=400),
}
PRESETS["office_duplex"] = dict(PRESETS["office_single"], arrangement="duplex", alternate="yes")


def cases():
    out = []
    for k in ["house_basement", "office_single", "office_duplex", "long_main", "ramp_rain", "weak_pump"]:
        out.append((k, "preset " + k, PRESETS[k]))
    # inflow variations
    for du, K in [(1, 0.5), (16, 0.5), (100, 0.7), (400, 1.0), (900, 1.2)]:
        out.append((f"du_{du}_K{K}", "EN 12056-2 inflow", dict(inflow_mode="du", sum_du=du, K=K, du_max=2.0)))
    out.append(("rain_cont", "ww + continuous + rain C 0.8", dict(inflow_mode="q", q_ww_lps=1.2, q_c_lps=0.5, rain_area_m2=80, rain_r=250, rain_C=0.8)))
    # pipe series and waters
    for s in ["pe100", "pvc10", "steel"]:
        for wt in ["faecal", "cutter", "faecalfree"]:
            out.append((f"{s}_{wt}", "series x water", dict(inflow_mode="q", q_ww_lps=1.5, series=s, water=wt)))
    for q in [6, 9.5, 10, 18, 35]:
        out.append((f"q{q}", "auto DN up the PE series", dict(inflow_mode="q", q_ww_lps=q)))
    out.append(("manual63", "manual d63 faecal (below DN 80)", dict(inflow_mode="q", q_ww_lps=2, dn_mode="manual", od_manual=63)))
    out.append(("manual110", "manual d110, low velocity", dict(inflow_mode="q", q_ww_lps=3, dn_mode="manual", od_manual=110)))
    out.append(("toolarge", "no pipe keeps 2.3 m/s", dict(inflow_mode="q", q_ww_lps=60)))
    # head variations
    out.append(("deep_rough", "deep, rough, many fittings", dict(inflow_mode="q", q_ww_lps=4, depth_m=8, loop_m=0.5, rough_mm=1.0, zeta_sum=15, L_main=60)))
    out.append(("warm", "warm water 35 °C, smooth", dict(inflow_mode="q", q_ww_lps=4, T_w=35, rough_mm=0.01)))
    out.append(("loopneg", "loop below backflow level", dict(loop_m=-0.2)))
    # pump curves
    for H0, Qn, Hn in [(12, 5, 8), (20, 8, 12), (6, 4, 4), (3, 5, 2)]:
        out.append((f"curve_{H0}_{Qn}_{Hn}", "duty point on parabola", dict(inflow_mode="q", q_ww_lps=3, pump_mode="curve", H0=H0, Qn=Qn, Hn=Hn)))
    # sump
    out.append(("sump_given_small", "given 100 l sump", dict(inflow_mode="q", q_ww_lps=4, V_useful_l=100, main_rule="no")))
    out.append(("sump_given_big", "given 600 l sump duplex alternate", dict(inflow_mode="q", q_ww_lps=4, V_useful_l=600, arrangement="duplex")))
    out.append(("z8_nomain", "z 8/h, no main rule", dict(inflow_mode="q", q_ww_lps=5, z_max=8, main_rule="no")))
    out.append(("duplex_noalt", "duplex without alternation", dict(inflow_mode="q", q_ww_lps=5, arrangement="duplex", alternate="no", interrupt="no")))
    # run 2 rules
    out.append(("du_zero", "sum DU 0: no largest-DU floor (CR-49), no inflow", dict(inflow_mode="du", sum_du=0)))
    out.append(("loop_zero", "loop invert at the backflow level (CR-48)", dict(loop_m=0)))
    out.append(("rain_r_given", "ramp with a site r(5,100) 650 l/(s ha): no assumption flag", dict(inflow_mode="du", sum_du=12, rain_area_m2=150, rain_r=650, water="faecalfree", series="pvc10")))
    out.append(("rain_r_default", "rain area with the default r 600 (D-PLB-12 flag)", dict(inflow_mode="q", q_ww_lps=1.0, rain_area_m2=60)))
    # r4 rules (Y5-1, Y5-3, Y5-5)
    mixed = dict(inflow_mode="du", sum_du=12, K=0.5, du_max=2.0, rain_area_m2=150, rain_r=600, rain_C=1.0, water="faecalfree", interrupt="no",
                 arrangement="duplex", alternate="yes", series="pvc10", L_main=30, zeta_sum=8, depth_m=3.0, loop_m=0.25, pump_mode="req", z_max=15)
    out.append(("ramp_mixed", "old ramp preset: garage wastewater + ramp rain in one plant -> rain_mixed (EN 12056-4 5.1)", mixed))
    out.append(("ramp_ww_only", "the garage wastewater stream of ramp_mixed as its own plant", dict(mixed, rain_area_m2=0)))
    out.append(("rain_only_cont", "surface water + continuous flow, no domestic wastewater: surface plant outside",
                dict(inflow_mode="q", q_ww_lps=0, q_c_lps=0.4, rain_area_m2=40, rain_r=500)))
    small = dict(inflow_mode="q", q_ww_lps=0.1, water="faecalfree", arrangement="duplex", alternate="yes", interrupt="no", series="pe100", L_main=20)
    out.append(("min20_given18", "entered 18 l: above starts and main, below the 20 l minimum", dict(small, V_useful_l=18)))
    out.append(("min20_given20", "entered exactly 20 l: compliant", dict(small, V_useful_l=20)))
    lm = dict(PRESETS["long_main"])
    d = 90 - 2 * 8.2
    vmain_exact = math.pi * (d / 1000) ** 2 / 4 * lm["L_main"] * 1000
    out.append(("main_equal", "entered volume equal to the rising-main volume -> sump_le_main (must be greater)", dict(lm, V_useful_l=vmain_exact)))
    out.append(("main_above", "entered 600 l > rising main 595.6 l: compliant", dict(lm, V_useful_l=600)))
    out.append(("runtime_t5", "z 200/h, no main rule: Table 5 T = 5.5 s (2.5-7.5 kW) governs over the starts limit",
                dict(inflow_mode="q", q_ww_lps=20, depth_m=10, z_max=200, main_rule="no", series="pe100")))
    for a in ANCHORS:
        out.append((a["id"], "external anchor: " + a["source"] + " | hand: " + a["hand"], a["case"]))
    return out


# D-PLB-10 external anchors: numbers worked by hand (calculator steps in "hand") from the cited formulas; tolerance 0.3 %.
ANCHORS = [
    dict(id="anchor_en12056_2_qww", source="EN 12056-2:2000 clause 6.3 Qww = K sqrt(sum DU), K 0.5 (intermittent use, dwellings/offices)",
         hand="sqrt(60) = 7.74597; 0.5 * 7.74597 = 3.8730 l/s (> largest DU 2.0, so K sqrt(DU) governs)",
         case=dict(inflow_mode="du", sum_du=60, K=0.5, du_max=2.0), expect=dict(q_in=3.8730)),
    dict(id="anchor_en12056_2_du_floor", source="EN 12056-2:2000 clause 6.3: Qww at least the largest single DU (WC 9 l = 2.0 l/s, system I)",
         hand="0.5 * sqrt(3.9) = 0.9874 l/s < 2.0 -> Qww = 2.0 l/s",
         case=dict(PRESETS["house_basement"]), expect=dict(q_in=2.0)),
    dict(id="anchor_en12056_4_vmin", source="EN 12056-4:2000 rising main 0.7 m/s minimum, DN 80 minimum for faecal water; EN 12201-2 PE100 SDR11 d90 x 8.2 (ID 73.6 mm)",
         hand="A = pi * 0.0736^2 / 4 = 4.25447e-3 m2; Q = 0.7 * 4.25447e-3 = 2.9781 l/s (inflow 2.0 l/s gives only 0.47 m/s)",
         case=dict(PRESETS["house_basement"]), expect=dict(q_req=2.9781, od=90)),
    dict(id="anchor_sump_tc4", source="on/off sump: worst cycle at inflow Qp/2, Tc = 4V/Qp, V = Qp*3600/(4z) (Jones et al., Pumping Station Design, 3rd ed.)",
         hand="V = 900 * 2.9781 / 15 = 178.69 l; rising main 4.25447e-3 * 12 m = 51.05 l < 178.69 -> V = 178.69 l, z_worst = 15/h",
         case=dict(PRESETS["house_basement"]), expect=dict(V_req_l=178.69, z_worst_pump=15.0)),
    dict(id="anchor_darcy_swamee_jain", source="Darcy-Weisbach with the Swamee-Jain (1976) explicit friction factor, water 15 C nu 1.1385e-6 m2/s",
         hand="v 0.7 m/s, Re = 0.7*0.0736/1.1385e-6 = 45 253; e/d = 0.25/73.6 = 0.003397; lambda = 0.25/log10(e/3.7d + 5.74/Re^0.9)^2 = 0.02993; "
              "v2/2g = 0.024975 m; hf = 0.02993*12/0.0736*0.024975 = 0.1219 m; fittings 6*0.024975 = 0.1498 m; H = 2.6+0.25+0.0736+0.1219+0.1498 = 3.1953 m",
         case=dict(PRESETS["house_basement"]), expect=dict(H_req=3.1953)),
    dict(id="anchor_duty_closed_form", source="duty point of a parabolic pump curve H = H0 - k Q2 on a fittings-dominated system H = Hg + c Q2 (closed form Q = sqrt((H0-Hg)/(k+c)))",
         hand="k = (12-8)/5^2 = 0.16 m/(l/s)2; Hg = 3+0.25+0.0736 = 3.3236 m; lambda ~ 0.025 (Moody, Re ~ 1e5, e/d 0.0034) -> "
              "c = (0.025*0.5/0.0736 + 20)/(2*9.81*(4.25447e-3)^2)/1e6 = 0.056795 m/(l/s)2; Q = sqrt(8.6764/0.216795) = 6.3262 l/s; H = 12-0.16*6.3262^2 = 5.5966 m",
         case=dict(inflow_mode="q", q_ww_lps=1.0, L_main=0.5, zeta_sum=20, pump_mode="curve", H0=12, Qn=5, Hn=8), expect=dict(q_p=6.3262, H_p=5.5966)),
    dict(id="anchor_din1986_100_ramp", source="DIN 1986-100 rain below the backflow level Qr = r(5,100) C A / 10 000 with r 600 l/(s ha) (D-PLB-12), EN ISO 1452-2 PVC-U PN10; "
         "EN 12056-4:2000 5.1 separate surface-water plant (no wastewater in it)",
         hand="Qr = 600*1.0*150/10 000 = 9.0 l/s = Qin; d75 ID 67.8: v = 0.009/(pi*0.0678^2/4) = 2.49 > 2.3; d90 ID 81.4: v = 0.009/(pi*0.0814^2/4) = 1.729 m/s -> d90",
         case=dict(PRESETS["ramp_rain"]), expect=dict(q_in=9.0, od=90), flags_has=["surface_outside"], flags_not=["rain_mixed"]),
    dict(id="anchor_en12056_4_s51_mixed", source="EN 12056-4:2000 5.1: surface water below flood level kept separate from domestic wastewater, pumped by a plant outside the building",
         hand="garage DU 12: Qww = max(0.5*sqrt(12) = 1.732, 2.0) = 2.0 l/s; ramp Qr = 600*150/10 000 = 9.0 l/s; both > 0 in one plant -> not compliant (two streams 2.0 + 9.0)",
         case=dict(inflow_mode="du", sum_du=12, K=0.5, du_max=2.0, rain_area_m2=150, rain_r=600, water="faecalfree", series="pvc10", arrangement="duplex", interrupt="no"),
         expect=dict(q_dw=2.0, q_sw=9.0, q_in=11.0), flags_has=["rain_mixed"]),
    dict(id="anchor_en12056_4_s63_min20", source="EN 12056-4:2000 6.3: minimum useful volume 20 l; EN 12201-2 PE100 SDR11 d40 x 3.7 (ID 32.6 mm)",
         hand="A = pi*0.0326^2/4 = 8.3469e-4 m2; Qp = 0.7*A = 0.58428 l/s (> inflow 0.1); starts V = 900*0.58428/(15*2) = 17.53 l; main 8.3469e-4*20 m = 16.69 l; "
              "T*Qp = 2.2*0.584 = 1.29 l -> V = max(17.53, 16.69, 1.29, 20) = 20 l",
         case=dict(inflow_mode="q", q_ww_lps=0.1, water="faecalfree", arrangement="duplex", alternate="yes", interrupt="no", series="pe100", L_main=20),
         expect=dict(V_starts_l=17.53, V_main_l=16.69, V_req_l=20.0)),
    dict(id="anchor_en12056_4_s63_gt_main", source="EN 12056-4:2000 6.3: useful volume greater than the volume of the discharge pipework between non-return valve and backflow loop",
         hand="PE d90 ID 73.6: A = 4.25447e-3 m2; main 140 m -> 595.63 l; starts 900*3.0/(15*2) = 90 l; entered 595 l <= 595.63 -> sump_le_main (starts satisfied, no sump_small)",
         case=dict(PRESETS["long_main"], V_useful_l=595), expect=dict(V_main_l=595.63, V_starts_l=90.0, V_req_l=595.63),
         flags_has=["sump_le_main"], flags_not=["sump_small"]),
]


def _full(over):
    c = dict(DEF)
    c.update(over)
    for k, v in DEF.items():
        if isinstance(v, float):
            c[k] = float(c[k])
    return c


def check_anchors():
    bad = 0
    for a in ANCHORS:
        r = run(_full(a["case"]))
        for k, v in a["expect"].items():
            ok = r[k] == v if k == "od" else abs(r[k] - v) <= 3e-3 * abs(v)
            if not ok:
                bad += 1
                print("ANCHOR MISMATCH", a["id"], k, r[k], v)
        for f in a.get("flags_has", []):
            if f not in r["flags"]:
                bad += 1
                print("ANCHOR FLAG MISSING", a["id"], f, r["flags"])
        for f in a.get("flags_not", []):
            if f in r["flags"]:
                bad += 1
                print("ANCHOR FLAG UNEXPECTED", a["id"], f, r["flags"])
    return bad


def main():
    if check_anchors():
        raise SystemExit("external anchors do not match the model")
    print("external anchors:", len(ANCHORS), "match")
    res = []
    for cid, note, over in cases():
        c = dict(DEF)
        c.update(over)
        for k, v in DEF.items():
            if isinstance(v, float):
                c[k] = float(c[k])
        e = run(c)
        res.append(dict(id=cid, note=note, inputs=over, expect=e))
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plbliftstation_ref.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    print(f"plbliftstation_ref.json: {len(res)} cases")


if __name__ == "__main__":
    main()
