"""Independent reference for plbbooster (booster set sizing).

Written from the published method _plb/boost/METHOD.md (plbbooster-1.3), not from plb-booster.js.
r4: suction-line loss (Y2-5), utilisation-unit floor of the DIN peak (Y2-3), DIN curve range 0.2-500 l/s (Y2-6).
D-PLB-13: with a direct connection the mains static pressure passes the stopped pumps.
D-PLB-10: ANCHORS below are values computed by hand from the formulas of the cited documents; main() checks the model against them.
Works in SI (Pa, m3/s) and converts at the end; the vessel is found by bisection on the isothermal gas law
(not by the closed form), zones are built by walking the floors top-down.
Output: bench-src/ref/plbbooster_ref.json (list of cases: inputs + expected values).
Run: python -I bench-src/ref/gen_plbbooster.py
"""
import json
import os

G = 9.80665
PA = 101325.0
BAR = 1e5

BASE = dict(floors=8, floor_h=3.6, h_out=1.2, z_pump=-3.5, p_minflow=1.0, dp_dist=0.6, dp_branch=0.25,
            p_sup_min=3.5, p_sup_max=4.5, dp_meter=0.25, dp_app=0.35, p_in_min=1.0, suction_loss_bar=0.0, connection="direct", h_tank=0.5,
            zoning="all", p_max=5.0, q_design=3.5, peak=None, two_largest_lps=None, control="vsd", n_duty=2, n_standby=1, eta=0.55,
            z_max=20, dp_sw=0.5, dp_pre=0.3, f_stop=0.1, vessel_l=0, q_fill=2.0, t_peak=20, t_buf=2,
            v_day=30, price_el=0.30, T_c=10)


def density(t):
    # Tanaka et al. 2001, Metrologia 38, eq. (1)
    a1, a2, a3, a4, a5 = -3.983035, 301.797, 522528.9, 69.34881, 999.97495
    return a5 * (1.0 - (t + a1) ** 2 * (t + a2) / (a3 * (t + a4)))


def peak_flow(sum_qa, a, b, c, qmax):
    # DIN 1988-300 Qs = a (sum Qa)^b - c, not below the largest single draw, not above the sum
    if sum_qa <= 0:
        return 0.0
    q = a * sum_qa ** b - c
    if q < qmax:
        q = qmax
    return min(q, sum_qa)


def vessel_by_bisection(v_draw_m3, p0_abs, pon_abs, poff_abs):
    # find total gas volume V with V*p0*(1/pon - 1/poff) = V_draw
    lo, hi = 0.0, 1.0
    while hi * p0_abs * (1.0 / pon_abs - 1.0 / poff_abs) < v_draw_m3:
        hi *= 2.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if mid * p0_abs * (1.0 / pon_abs - 1.0 / poff_abs) < v_draw_m3:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def solve(case):
    c = dict(BASE)
    c.update(PRESETS.get(case.get("preset"), {}))
    c.update({k: v for k, v in case.items() if k in BASE})
    # METHOD 8a: floors and pump counts are whole numbers within their ranges
    for k, lo, hi in (("floors", 1, 80), ("n_duty", 1, 6), ("n_standby", 0, 3)):
        v = c[k]
        if not (lo <= v <= hi) or float(v) != int(v):
            return dict(valid=False, errors=[k])
    # METHOD 2 / 3 (r4): suction loss 0..5 bar; two largest draw-offs of one utilisation unit > 0 and <= 100 l/s when given
    if not (0.0 <= c["suction_loss_bar"] <= 5.0):
        return dict(valid=False, errors=["suction_loss_bar"])
    tl = c["two_largest_lps"]
    if tl is not None and not (0.0 < tl <= 100.0):
        return dict(valid=False, errors=["two_largest_lps"])
    rho = density(c["T_c"])
    rg = rho * G  # Pa per metre
    n = int(c["floors"])
    zp = c["z_pump"]
    if c["h_out"] < zp:  # pump above the lowest outlet: roof-tank system, out of scope
        return dict(valid=False, errors=["z_pump"])
    heights = [i * c["floor_h"] + c["h_out"] - zp for i in range(n)]
    htop = heights[-1]
    fl = []
    p_in_pa = (c["p_sup_min"] - c["dp_meter"] - c["dp_app"]) * BAR + rg * (-zp)
    for i, h in enumerate(heights):
        frac = h / htop if htop > 0 else 1.0
        loss = (c["dp_branch"] + (c["dp_dist"] - c["dp_branch"]) * frac) * BAR
        need = c["p_minflow"] * BAR + rg * h + loss          # at the booster outlet
        avail = p_in_pa - rg * h - loss                       # at the outlet without a pump
        fl.append(dict(h=h, z=i * c["floor_h"] + c["h_out"], loss=loss, need=need, ok=avail >= c["p_minflow"] * BAR - 1e-7))
    fails = [i for i in range(n) if not fl[i]["ok"]]
    if c["connection"] == "indirect" and c["zoning"] == "all":
        first = 0
    elif not fails:
        first = n
    elif c["zoning"] == "split":
        first = fails[0]
    else:
        first = 0
    boosted = list(range(first, n))
    pmax = c["p_max"] * BAR
    out = dict(valid=True, booster_needed=len(boosted) > 0, n_direct=first)
    prv = []
    for i in range(first):
        if c["p_sup_max"] * BAR - rg * fl[i]["z"] > pmax + 1e-7:
            prv.append(i)
    if not boosted:
        out.update(stat_max=max(c["p_sup_max"] * BAR - rg * fl[i]["z"] for i in range(n)) / BAR, p_set=None, dp_boost=0.0, head_m=0.0, q_boost=0.0, prv_floors=prv, zones=[], vessel_l=None, tank_l=None,
                   kwh=0.0, starts_h=None, flags=sorted(set(["booster_not_needed"] + (["mains_static_high"] if prv else []))))
        return out
    pset = max(fl[i]["need"] for i in boosted)
    if pset - c["dp_pre"] * BAR <= 0:  # pre-charge at or below atmospheric
        return dict(valid=False, errors=["dp_pre"])
    # pump inlet at design flow: tank level or mains pressure, less the suction line (METHOD 2, r4 Y2-5)
    if c["connection"] == "indirect":
        inlet = rg * c["h_tank"] - c["suction_loss_bar"] * BAR
    else:
        inlet = p_in_pa - c["suction_loss_bar"] * BAR
    dp = max(0.0, pset - inlet)
    flags = []
    if prv:
        flags.append("mains_static_high")
    if pset - inlet < 0:
        flags.append("inlet_above_set")
    if c["connection"] == "direct" and inlet < c["p_in_min"] * BAR - 1e-7:
        flags.append("inlet_low")
    if c["connection"] == "direct" and inlet <= 0:
        flags.append("inlet_negative")
    if c["connection"] == "indirect" and inlet < -1e-7:
        flags.append("tank_suction_negative")  # below atmospheric at the pump: NPSH check
    if c["n_standby"] < 1:
        flags.append("no_standby")
    share = len(boosted) / n
    if c["peak"]:
        pk = c["peak"]
        x = pk["sumQa"] * share
        q = peak_flow(x, pk["a"], pk["b"], pk["c"], pk.get("maxSingle", 0.0))
        # utilisation unit: at least the two largest draw-offs of one unit, but never more than the sum of design flows
        if tl is not None and min(tl, x) > q:
            q = min(tl, x)
        if x < 0.2 - 1e-9 or x > 500.0 + 1e-9:
            flags.append("din_range")
    else:
        q = c["q_design"]
    if not q > 0:
        return dict(valid=False, errors=["q_zero"])
    q_m3 = q / 1000.0
    q_pump = q_m3 / c["n_duty"]
    poff = pset + c["dp_sw"] * BAR
    nprv_before = len(prv)
    # static source at the pump outlet with the pumps stopped
    src0 = poff
    if c["connection"] == "direct":
        mains_static_at_pump = c["p_sup_max"] * BAR + rg * (-zp)
        if mains_static_at_pump > poff:
            src0 = mains_static_at_pump
            if mains_static_at_pump - rg * fl[first]["h"] > pmax + 1e-7:
                flags.append("inlet_static_high")
    stat = [c["p_sup_max"] * BAR - rg * fl[i]["z"] for i in range(first)] + [src0 - rg * fl[i]["h"] for i in boosted]
    for i in boosted:
        if src0 - rg * fl[i]["h"] > pmax + 1e-7:
            prv.append(i)
    if len(prv) > nprv_before:
        flags.append("prv_floors")
    # zones, walking down from the top floor
    zones = []
    src = src0
    zone_top = n - 1
    bad = False
    i = n - 1
    while i >= first:
        if i == zone_top and src - rg * fl[i]["h"] > pmax + 1e-7:
            bad = True
        if i < zone_top and src - rg * fl[i]["h"] > pmax + 1e-7:
            zones.append((zone_top, i + 1, src))
            zone_top = i
            src = fl[i]["need"]
            continue
        i -= 1
    zones.append((zone_top, first, src))
    if bad:
        flags.append("zone_infeasible")
    if len(zones) > 1:
        flags.append("zones_needed")
    # vessel
    step = q_pump if c["control"] == "cascade" else c["f_stop"] * q_pump
    cycle = 3600.0 / c["z_max"]
    v_draw = step * cycle / 4.0
    pon_a, poff_a, p0_a = pset + PA, poff + PA, pset - c["dp_pre"] * BAR + PA
    v_req = vessel_by_bisection(v_draw, p0_a, pon_a, poff_a)
    starts = None
    if c["vessel_l"] > 0:
        usable = c["vessel_l"] / 1000.0 * p0_a * (1.0 / pon_a - 1.0 / poff_a)
        starts = 3600.0 / (4.0 * usable / step)
        if starts > c["z_max"] + 1e-9:
            flags.append("starts_exceeded")
    tank = None
    if c["connection"] == "indirect":
        tank = (max(0.0, q_m3 - c["q_fill"] / 1000.0) * c["t_peak"] * 60.0 + q_m3 * c["t_buf"] * 60.0) * 1000.0
        if c["q_fill"] <= 0:
            flags.append("no_fill")
        day = c["v_day"] * 1000.0 * share
        if tank > 0 and day / tank < 1 - 1e-12:
            flags.append("tank_stagnation")
    vol_year = c["v_day"] * 365.0 * share
    kwh = vol_year * dp / (c["eta"] * 3.6e6)
    out.update(stat_max=max(stat) / BAR, p_set=pset / BAR, dp_boost=dp / BAR, head_m=dp / rg, q_boost=q, q_pump=q_pump * 1000.0,
               p_shaft_kw=q_pump * dp / c["eta"] / 1000.0, prv_floors=sorted(prv),
               zones=[[z[0], z[1]] for z in zones], vessel_l=v_req * 1000.0, starts_h=starts, tank_l=tank, kwh=kwh,
               eur=kwh * c["price_el"], flags=sorted(set(flags)))
    return out


def pk(bt, s, m=0.3):
    t = {"residential": (1.48, 0.19, 0.94), "office": (0.91, 0.31, 0.38), "hotel": (0.70, 0.48, 0.13)}[bt]
    return dict(a=t[0], b=t[1], c=t[2], sumQa=s, maxSingle=m)


PRESETS = {
    "office_8f": dict(floors=8, floor_h=3.6, p_sup_min=3.5, p_sup_max=4.5, zoning="all", peak=pk("office", 28), v_day=30),
    "office_8f_split": dict(floors=8, floor_h=3.6, p_sup_min=3.5, p_sup_max=4.5, zoning="split", peak=pk("office", 28), v_day=30),
    "office_8f_cascade": dict(floors=8, floor_h=3.6, p_sup_min=3.5, p_sup_max=4.5, zoning="all", peak=pk("office", 28), v_day=30, control="cascade", dp_sw=1.0),
    "tower_20f": dict(floors=20, floor_h=3.0, z_pump=-3, p_sup_min=3.0, p_sup_max=4.0, dp_dist=0.9, zoning="all", peak=pk("residential", 89), v_day=21, n_duty=2),
    "apartments_24": dict(floors=6, floor_h=3.0, z_pump=-3, p_sup_min=3.0, p_sup_max=4.0, dp_dist=0.5, dp_meter=0.2, dp_app=0.2, zoning="all", peak=pk("residential", 26.64), v_day=6.5, n_duty=1),
    "hotel_120_tank": dict(floors=6, floor_h=3.1, z_pump=-3.5, p_sup_min=3.2, p_sup_max=4.2, dp_dist=0.6, connection="indirect", zoning="all", peak=pk("hotel", 95.44), v_day=40, n_duty=2, q_fill=1.5, t_peak=30, t_buf=2),
    "hotel_120_bigtank": dict(floors=6, floor_h=3.1, z_pump=-3.5, p_sup_min=3.2, p_sup_max=4.2, dp_dist=0.6, connection="indirect", zoning="all", peak=pk("hotel", 95.44), v_day=40, n_duty=2, q_fill=0.3, t_peak=120, t_buf=10),
}


def cases():
    out = []
    for k, v in PRESETS.items():
        out.append(dict(id="preset_" + k, preset=k, note="preset " + k, **v))
    for fl in (3, 5, 12, 16, 30):
        out.append(dict(id="floors_%d" % fl, preset="office_8f", note="office, %d floors, input flow" % fl, floors=fl, floor_h=3.4, peak=None, q_design=2.5 + fl * 0.1))
    for ps in (1.5, 2.5, 4.0, 6.0):
        out.append(dict(id="supply_%g" % ps, preset="office_8f", note="minimum supply %g bar, split zoning" % ps, p_sup_min=ps, p_sup_max=ps + 1.5, zoning="split"))
    for ctl, sw in (("vsd", 0.3), ("cascade", 0.8), ("cascade", 1.5)):
        out.append(dict(id="ctl_%s_%g" % (ctl, sw), preset="office_8f", note="%s, switch band %g bar" % (ctl, sw), control=ctl, dp_sw=sw))
    for nd, ns in ((1, 1), (3, 1), (4, 0)):
        out.append(dict(id="pumps_%d_%d" % (nd, ns), preset="office_8f", note="%d duty + %d standby" % (nd, ns), n_duty=nd, n_standby=ns))
    for vl in (50, 200, 800):
        out.append(dict(id="vessel_%d" % vl, preset="office_8f_cascade", note="installed vessel %d L" % vl, vessel_l=vl, control="cascade", dp_sw=1.0, peak=pk("office", 28)))
    for t in (4, 20, 35):
        out.append(dict(id="temp_%d" % t, preset="tower_20f", note="water %d °C" % t, T_c=t, floors=20, floor_h=3.0, z_pump=-3, p_sup_min=3.0, p_sup_max=4.0, dp_dist=0.9, peak=pk("residential", 89), v_day=21))
    out.append(dict(id="tower_split_cascade", preset="tower_20f", note="tower, split zoning, cascade", floors=20, floor_h=3.0, z_pump=-3, p_sup_min=3.0, p_sup_max=4.0, dp_dist=0.9, peak=pk("residential", 89), v_day=21, zoning="split", control="cascade", dp_sw=1.0))
    out.append(dict(id="tower_pmax6", preset="tower_20f", note="tower, 6 bar static limit", floors=20, floor_h=3.0, z_pump=-3, p_sup_min=3.0, p_sup_max=4.0, dp_dist=0.9, peak=pk("residential", 89), v_day=21, p_max=6.0))
    out.append(dict(id="hotel_tank_split", preset="hotel_120_tank", note="hotel break tank, split zoning", floors=6, floor_h=3.1, z_pump=-3.5, p_sup_min=3.2, p_sup_max=4.2, dp_dist=0.6, connection="indirect", zoning="split", peak=pk("hotel", 95.44), v_day=40, q_fill=1.5, t_peak=30))
    out.append(dict(id="no_booster", preset="office_8f", note="3 floors at 4.5 bar — no booster", floors=3, floor_h=3.0, z_pump=0, p_sup_min=4.5, p_sup_max=5.8, peak=None))
    # D-PLB-13 (QA-1 / CR-7): mains night pressure above the cut-out pressure, direct connection
    out.append(dict(id="static_mains_7bar", preset="office_8f", note="QA-1: p_sup 3.0 / 7.0 bar, direct, all floors boosted", p_sup_min=3.0, p_sup_max=7.0, peak=None, q_design=3.5))
    out.append(dict(id="static_mains_8bar_split", preset="office_8f", note="CR-7: split zoning, mains night pressure 8 bar", p_sup_min=3.0, p_sup_max=8.0, zoning="split"))
    out.append(dict(id="static_mains_indirect", preset="hotel_120_tank", note="break tank: the mains night pressure does not reach the floors", p_sup_max=8.0))
    # refused inputs (CR-45, CR-46, QA-24)
    out.append(dict(id="invalid_q_zero", preset="apartments_24", note="DIN curve below zero, no largest single draw-off", peak=dict(pk("residential", 0.01), maxSingle=0.0)))
    out.append(dict(id="invalid_pump_above", preset="office_8f", note="pump 5 m above the ground-floor outlets", z_pump=5.0))
    out.append(dict(id="invalid_precharge", preset="apartments_24", note="pre-charge drop larger than the cut-in pressure", dp_pre=3.0, p_minflow=0.5, dp_dist=0.1, dp_branch=0.1, floors=1, floor_h=3.0, z_pump=0, h_out=1.2, p_sup_min=0.5, p_sup_max=1.0, dp_meter=0, dp_app=0))
    # X1-2 (run 3): fractional pump counts are refused
    out.append(dict(id="invalid_standby_half", preset="office_8f", note="X1-2: half a standby pump", n_standby=0.5))
    out.append(dict(id="invalid_duty_fraction", preset="office_8f", note="X1-2: 1.5 duty pumps", n_duty=1.5))
    for a in ANCHORS:
        out.append(dict(id=a["id"], preset="office_8f", note="external anchor: " + a["source"] + " | hand: " + a["hand"], **a["case"]))
    # r4 Y2-3 / Y2-5 / Y2-6
    out.append(dict(id="unit_office_many", preset="office_8f", note="Y2-3: office, many units - curve above the two largest (0.44 l/s) governs", two_largest_lps=0.44))
    out.append(dict(id="unit_input_flow", preset="office_8f", note="Y2-3: input design flow - the unit floor applies only to the DIN curve", peak=None, q_design=0.3, two_largest_lps=0.44))
    out.append(dict(id="unit_above_sum", preset="office_8f", note="Y2-3: two largest 0.8 l/s above the bathroom sum 0.57 -> capped at the sum", floors=1, p_sup_min=1.0, p_sup_max=1.5, peak=dict(pk("residential", 0.57, 0.30), bt="residential"), two_largest_lps=0.80))
    out.append(dict(id="suction_mains_03", preset="office_8f", note="Y2-5: direct, 0.3 bar suction line", suction_loss_bar=0.3))
    out.append(dict(id="suction_mains_low", preset="office_8f", note="Y2-5: direct, 2.5 bar suction loss -> inlet below 1 bar", suction_loss_bar=2.5))
    out.append(dict(id="suction_tank_02", preset="hotel_120_tank", note="Y2-5: break tank 0.5 m, 0.2 bar suction (Codex example 36.020 -> 38.060 m) -> below atmospheric", suction_loss_bar=0.2))
    out.append(dict(id="din_range_low", preset="office_8f", note="Y2-6: one floor, residential sum 0.15 l/s below the curve range", floors=1, p_sup_min=1.0, p_sup_max=1.5, peak=dict(pk("residential", 0.15, 0.10), bt="residential")))
    out.append(dict(id="invalid_suction", preset="office_8f", note="Y2-5: suction loss 6 bar out of range", suction_loss_bar=6.0))
    out.append(dict(id="invalid_two_largest", preset="office_8f", note="Y2-3: two largest -0.1 l/s (0 means not used on the page)", two_largest_lps=-0.1))
    out.append(dict(id="low_inlet", preset="office_8f", note="weak mains 1.4 bar with meter and BA loss", p_sup_min=1.4, p_sup_max=2.5, dp_meter=0.3, dp_app=0.6, z_pump=0))
    return out


# D-PLB-10 external anchors: numbers worked by hand (calculator steps in "hand") from the formulas of the cited documents,
# rho(10 degC) = 999.7026 kg/m3 (Tanaka 2001 table) -> rho g = 0.0980379 bar/m.
ANCHORS = [
    dict(id="anchor_balance_10f", source="EN 806-2 / DIN 1988-500 pressure balance p_set = p_minFl + rho g h + losses, 10 floors x 3 m",
         case=dict(floors=10, floor_h=3.0, h_out=1.0, z_pump=0.0, p_minflow=1.0, dp_dist=0.6, dp_branch=0.6, p_sup_min=2.5, p_sup_max=3.0,
                   dp_meter=0.2, dp_app=0.3, peak=None, q_design=2.0, n_duty=2, n_standby=1, control="vsd", f_stop=0.1, z_max=20, dp_sw=0.5, dp_pre=0.3, T_c=10),
         hand="h_top = 9*3.0+1.0 = 28 m; 28*0.0980379 = 2.7451 bar; p_set = 1.0+2.7451+0.6 = 4.3451 bar; inlet = 2.5-0.2-0.3 = 2.0 bar; dp = 2.3451 bar; H = 2.3451/0.0980379 = 23.920 m",
         expect=dict(p_set=4.3451, dp_boost=2.3451, head_m=23.920), tol=2e-4),
    dict(id="anchor_vessel_boyle", source="isothermal gas law (Boyle-Mariotte) for the membrane vessel, drawdown Q T/4 at z = 20 starts/h",
         case=dict(floors=10, floor_h=3.0, h_out=1.0, z_pump=0.0, p_minflow=1.0, dp_dist=0.6, dp_branch=0.6, p_sup_min=2.5, p_sup_max=3.0,
                   dp_meter=0.2, dp_app=0.3, peak=None, q_design=2.0, n_duty=2, n_standby=1, vessel_l=0, control="vsd", f_stop=0.1, z_max=20, dp_sw=0.5, dp_pre=0.3, T_c=10),
         hand="Q_step = 0.1*2.0/2 = 0.1 l/s; T = 3600/20 = 180 s; V_d = 0.1*180/4 = 4.5 L; absolute p0 = 4.0451+1.01325 = 5.0584, p_on = 5.3584, p_off = 5.8584 bar; V = 4.5/(5.0584*(1/5.3584-1/5.8584)) = 4.5/(5.0584*0.015928) = 55.85 L",
         expect=dict(vessel_l=55.85), tol=1e-3),
    dict(id="anchor_din_peak_office", source="DIN 1988-300 peak-flow formula Qs = a (sum Qa)^b - c, office constants a 0.91, b 0.31, c 0.38",
         case=dict(floors=8, floor_h=3.6, p_sup_min=2.0, p_sup_max=3.0, zoning="all", peak=dict(a=0.91, b=0.31, c=0.38, sumQa=28.0, maxSingle=0.3, bt="office")),
         hand="ln 28 = 3.33220; *0.31 = 1.03298; e^1.03298 = 2.80940; *0.91 = 2.55655; -0.38 = 2.1766 l/s",
         expect=dict(q_boost=2.1766), tol=2e-4),
    dict(id="anchor_static_qa1", source="DIN 1988-200 5 bar static limit, mains night pressure through the stopped pumps (D-PLB-13), QA-1 defaults p_sup 3.0/7.0 bar",
         case=dict(floors=8, floor_h=3.6, h_out=1.2, z_pump=-3.5, p_sup_min=3.0, p_sup_max=7.0, peak=None, q_design=3.5, T_c=10),
         hand="ground-floor outlet 1.2 m above the supply reference: 7.0 - 1.2*0.0980379 = 6.8824 bar > 5 bar -> PRV on floor 0",
         expect=dict(stat_max=6.8824), tol=2e-4),
    # r4 anchors
    dict(id="anchor_din300_unit_bathroom", source="DIN 1988-300 utilisation unit (KELOX handbook / SHK Profi 8/2012): peak of one unit = sum of its two largest draw-offs; Codex Y2-3 example",
         case=dict(floors=1, floor_h=3.0, h_out=1.2, z_pump=-3.5, p_sup_min=1.0, p_sup_max=1.5, n_duty=2, peak=dict(a=1.48, b=0.19, c=0.94, sumQa=0.57, maxSingle=0.30, bt="residential"), two_largest_lps=0.44),
         hand="curve: ln 0.57 = -0.562119; *0.19 = -0.106803; e^ = 0.898697; *1.48 = 1.330071; -0.94 = 0.3901 l/s < two largest 0.44 -> Q = 0.44 l/s, 0.22 l/s per duty pump",
         expect=dict(q_boost=0.44, q_pump=0.22), tol=1e-9),
    dict(id="anchor_shk_two_units_4b", source="SHK Profi 8/2012 DIN 1988-300 example 2 (bathroom + kitchen, residential): riser section 4b = 1.48 (0.32)^0.19 - 0.94 = 0.25 l/s, below the sum of the two units' peaks 0.32",
         case=dict(floors=1, floor_h=3.0, h_out=1.2, z_pump=-3.5, p_sup_min=1.0, p_sup_max=1.5, n_duty=1, peak=dict(a=1.48, b=0.19, c=0.94, sumQa=0.32, maxSingle=0.15, bt="residential"), two_largest_lps=0.22),
         hand="ln 0.32 = -1.139434; *0.19 = -0.216492; e^ = 0.805346; *1.48 = 1.191912; -0.94 = 0.2519 l/s (source: 0.25) > largest unit 0.15+0.07 = 0.22 -> curve",
         expect=dict(q_boost=0.25), tol=5e-3),
    dict(id="anchor_suction_10f", source="EN 806-2 / DIN 1988-500 pressure balance with a 0.3 bar suction line (pump inlet = mains - meter - apparatus - suction)",
         case=dict(floors=10, floor_h=3.0, h_out=1.0, z_pump=0.0, p_minflow=1.0, dp_dist=0.6, dp_branch=0.6, p_sup_min=2.5, p_sup_max=3.0,
                   dp_meter=0.2, dp_app=0.3, suction_loss_bar=0.3, peak=None, q_design=2.0, n_duty=2, n_standby=1, control="vsd", f_stop=0.1, z_max=20, dp_sw=0.5, dp_pre=0.3, T_c=10),
         hand="p_set = 4.3451 bar (anchor_balance_10f); inlet = 2.5-0.2-0.3-0.3 = 1.7 bar; dp = 2.6451 bar; H = 2.6451/0.0980379 = 26.981 m",
         expect=dict(p_set=4.3451, dp_boost=2.6451, head_m=26.981), tol=2e-4),
    dict(id="anchor_din_range_3000", source="DIN 1988-300 curve, residential, sum Qa 3000 l/s outside the validity range 0.2-500 l/s (KELOX handbook) -> flag din_range",
         case=dict(peak=dict(a=1.48, b=0.19, c=0.94, sumQa=3000.0, maxSingle=0.3, bt="residential")),
         hand="ln 3000 = 8.006368; *0.19 = 1.521210; e^ = 4.57794; *1.48 = 6.77535; -0.94 = 5.835 l/s (value outside the curve range, flagged)",
         expect=dict(q_boost=5.835), tol=2e-4),
]


def check_anchors():
    bad = 0
    for a in ANCHORS:
        r = solve(dict(a["case"]))
        if a["id"] == "anchor_din_range_3000" and "din_range" not in r["flags"]:
            bad += 1
            print("ANCHOR MISMATCH", a["id"], "flag din_range missing")
        for k, v in a["expect"].items():
            if abs(r[k] - v) > a["tol"] * max(abs(v), 1.0):
                bad += 1
                print("ANCHOR MISMATCH", a["id"], k, r[k], v)
    return bad


def main():
    if check_anchors():
        raise SystemExit("external anchors do not match the model")
    print("external anchors:", len(ANCHORS), "match")
    res = []
    for c in cases():
        res.append(dict(c, expect=solve(c)))
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "plbbooster_ref.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1, ensure_ascii=False)
    print("plbbooster_ref.json:", len(res), "cases")


if __name__ == "__main__":
    main()
