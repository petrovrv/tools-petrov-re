"""Independent reference for plbdrainage (Drainage & Venting, EN 12056-2).

Written from the published method _plb/drain/METHOD.md (plbdrainage-1.5, WC footnotes of Tables 4/7 per plb-r4 N-1, input rules of section 1 per plb-r3; AAV rules of section 4.1: CR-55, branch factor from EN 12056-2:2000 §6.4.3 Table 10 per D-PLB-23), not from plb-drainage.js; plus hand-worked external anchors (ANCHORS):
Qww = K*sqrt(sum DU) floored at the largest DU, Qtot = Qww + Qc + Qp, EN 12056-2 Tables 4/6 (branches), 5/7 (limits, system I),
11/12 (stacks), Table 1 (DN / minimum internal diameter), Prandtl-Colebrook for partly filled drains with the hydraulic diameter
(kb = 1.0 mm, nu = 1.31e-6), filling solved with scipy.optimize.brentq.
Input data: discharge units of EN 12056-2 Table 2 and the drainage pipe series (EN 1329-1, EN 1451-1, EN 1519-1, EN 877) as listed in the method.
Output: bench-src/ref/plbdrainage_ref.json (list of cases: engine input + expected values).
Run: python -I bench-src/ref/gen_plbdrainage.py
"""
import json
import math
import os

from scipy.optimize import brentq

G = 9.81
# EN 12056-2 Table 2 discharge units l/s (systems I, II, III, IV); None = not used in that system
DU = {
    "wc_cistern": (2.0, 1.8, 1.7, 2.0), "wc_flushvalve": (2.5, 2.0, 1.7, 2.5), "urinal_flush": (0.5, 0.3, None, 0.3),
    "urinal_waterless": (0.2, 0.2, None, 0.2), "basin": (0.5, 0.3, 0.3, 0.3), "handbasin_small": (0.5, 0.3, 0.3, 0.3),
    "sink_kitchen": (0.8, 0.6, 1.3, 0.5), "sink_commercial": (0.8, 0.6, 1.3, 0.5), "shower": (0.6, 0.4, 0.4, 0.4),
    "shower_large_head": (0.8, 0.5, 0.4, 0.5), "bath": (0.8, 0.6, 1.3, 0.5), "bidet": (0.5, 0.3, 0.3, 0.3),
    "washing_machine": (0.8, 0.6, 0.6, 0.5), "dishwasher_dom": (0.8, 0.6, 0.2, 0.5), "dishwasher_com": (1.5, 1.2, 1.2, 1.0),
    "drinking_fountain": (0.5, 0.3, 0.3, 0.3), "slop_sink": (2.5, 2.0, 1.7, 2.5), "bedpan_washer": (2.0, 1.8, 1.7, 2.0),
    "floor_drain": (0.8, 0.9, None, 0.6), "cleaner_sink": (0.8, 0.6, 1.3, 0.5),
}
# smallest connection DN (system I, system II)
DNMIN = {
    "wc_cistern": (100, 80), "wc_flushvalve": (100, 80), "urinal_flush": (50, 50), "urinal_waterless": (50, 50), "basin": (40, 30),
    "handbasin_small": (40, 30), "sink_kitchen": (50, 40), "sink_commercial": (50, 50), "shower": (50, 40), "shower_large_head": (50, 50),
    "bath": (50, 40), "bidet": (40, 30), "washing_machine": (50, 40), "dishwasher_dom": (50, 40), "dishwasher_com": (50, 50),
    "drinking_fountain": (40, 30), "slop_sink": (100, 80), "bedpan_washer": (100, 80), "floor_drain": (50, 50), "cleaner_sink": (50, 50),
}
SYS = {"I": 0, "II": 1, "III": 2, "IV": 3}
# pipe series: (dn, od, wall)
SERIES = {
    "pvc_u": [(30, 32, 1.8), (40, 40, 1.8), (50, 50, 1.8), (70, 75, 1.8), (80, 90, 1.8), (100, 110, 2.2), (125, 125, 2.5), (150, 160, 3.2), (200, 200, 3.9)],
    "pp_drain": [(30, 32, 1.8), (40, 40, 1.8), (50, 50, 1.8), (70, 75, 1.9), (80, 90, 2.2), (100, 110, 2.7), (125, 125, 3.1), (150, 160, 3.9)],
    "pe_hd": [(30, 32, 3), (40, 40, 3), (50, 50, 3), (56, 56, 3), (60, 63, 3), (70, 75, 3), (80, 90, 3.5), (100, 110, 4.3), (125, 125, 4.9), (150, 160, 6.2), (200, 200, 6.2)],
    "cast_iron_sml": [(50, 58, 3.5), (70, 78, 3.5), (80, 83, 3.5), (100, 110, 3.5), (125, 135, 4.0), (150, 160, 4.0), (200, 210, 5.0)],
}
DI_MIN = {30: 26, 40: 34, 50: 44, 56: 49, 60: 56, 70: 68, 80: 75, 90: 79, 100: 96, 125: 113, 150: 146, 200: 184, 225: 207, 250: 230, 300: 290}
# EN 12056-2:2000 Table 4 (unventilated) and Table 7 (ventilated) as printed, columns I, II, IV, with the footnote marks of the table (plb-r4 N-1,
# columns II/IV re-read in bw-r1 D-BW-3): "**" no WCs, "***" not more than two WCs and a total change of direction of not more than 90 deg,
# "****" not more than one WC
T4 = {"I": [(0.50, 40, ""), (0.80, 50, ""), (1.00, 60, ""), (1.50, 70, ""), (2.00, 80, "**"), (2.25, 90, "***"), (2.50, 100, "")],
      "II": [(0.40, 30, ""), (0.50, 40, ""), (1.00, 50, ""), (1.50, 60, ""), (2.00, 70, "**"), (2.25, 80, "****"), (2.50, 90, "")],
      "IV": [(0.40, 30, ""), (0.50, 40, ""), (1.00, 50, ""), (1.50, 60, ""), (2.00, 70, "**"), (2.25, 80, "****"), (2.50, 100, "")]}
T7 = {"I": [(0.75, 50, ""), (1.50, 60, ""), (2.25, 70, ""), (3.00, 80, "**"), (3.40, 90, "***"), (3.75, 100, "")],
      "II": [(0.60, 30, ""), (0.75, 40, ""), (1.50, 50, ""), (2.25, 60, ""), (3.00, 70, "**"), (3.40, 80, "****"), (3.75, 90, "")],
      "IV": [(0.60, 30, ""), (0.75, 40, ""), (1.50, 50, ""), (2.25, 60, ""), (3.00, 70, "**"), (3.40, 80, "****"), (3.75, 90, "")]}
T6 = T7  # old name kept for the code below (ventilated = Table 7)
T11 = {60: (0.5, 0.7), 70: (1.5, 2.0), 80: (2.0, 2.6), 90: (2.7, 3.5), 100: (4.0, 5.2), 125: (5.8, 7.6), 150: (9.5, 12.4), 200: (16.0, 21.0)}
T12 = {60: (50, 0.7, 0.9), 70: (50, 2.0, 2.6), 80: (50, 2.6, 3.4), 90: (50, 3.5, 4.6), 100: (50, 5.6, 7.3), 125: (70, 7.6, 10.0), 150: (80, 12.4, 18.3), 200: (100, 21.0, 27.3)}
# EN 12056-2:2000 Table 7 Branch/Vent pairs (vent DN of a ventilated branch), plb-r4 Y5-4; column IV printed as column II
T7_VENT = {"I": {50: 40, 60: 40, 70: 50, 80: 50, 90: 60, 100: 60}, "II": {30: 30, 40: 30, 50: 30, 60: 30, 70: 40, 80: 40, 90: 50}}
T7_VENT["IV"] = dict(T7_VENT["II"])
# WC branch minimum DN where the Table 4 / 7 WC rows govern (bw-r1 review CR-2): system I DN 90 (***), system IV DN 80 (****)
WC_BRANCH_MIN = {"I": 90, "IV": 80}
# Table 5 (unventilated, False) / Table 8 (ventilated, True); None = no limit; system II unventilated drop 6.0 m DN > 70, 3.0 m DN <= 70
# (below DN 70 the 3.0 m is an assumption of the tool)
LIM = {"I": {False: dict(L=4.0, bends=3, drop=1.0, slope=1.0), True: dict(L=10.0, bends=None, drop=3.0, slope=0.5)},
       "II": {False: dict(L=10.0, bends=1, drop=6.0, slope=1.5), True: dict(L=None, bends=None, drop=3.0, slope=1.5)},
       "IV": {False: dict(L=10.0, bends=3, drop=1.0, slope=1.0), True: dict(L=10.0, bends=None, drop=3.0, slope=0.5)}}


def inner(p):
    return p[1] - 2 * p[2]


def area_perim(d, hd):
    """circular segment below the water level h = hd*d: half-angle a with cos a = 1 - 2 hd"""
    a = math.acos(1 - 2 * hd)
    r = d / 2
    A = r * r * (a - math.sin(a) * math.cos(a))
    P = 2 * a * r
    return A, P


def q_part(d, hd, J, kb, nu):
    A, P = area_perim(d, hd)
    Dh = 4 * A / P
    s = math.sqrt(2 * G * Dh * J)
    v = -2.0 * s * math.log10(kb / (3.71 * Dh) + 2.51 * nu / (Dh * s))
    return v * A * 1000.0, v, A


def dn_of(idmm):
    best = None
    for dn in sorted(DI_MIN):
        if DI_MIN[dn] <= idmm + 1e-9:
            best = dn
    return best


def pipe_for_dn(ser, dn):
    need = DI_MIN.get(dn, dn * 0.9)
    for p in sorted(ser, key=inner):
        if inner(p) + 1e-9 >= need:
            return p
    return None


RANK = {"branch": 0, "stack": 1, "drain": 2}


def known_dn(ser, dn):
    return dn in DI_MIN or any(p[0] == dn for p in ser)


def note_ok(note, wc, bends=0):
    """footnotes of Tables 4 and 7; '***' also limits the total change of direction to 90 deg, i.e. at most one 90 deg bend"""
    if note == "**":
        return wc == 0
    if note == "***":
        return wc <= 2 and bends * 90 <= 90
    if note == "****":
        return wc <= 1
    return True


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def input_errors(case):
    """METHOD 1 input rules: known fixture types only (the Table 2 list above, a dict lookup by exact name), whole counts 0-10000,
    L and drop >= 0, bends a whole number >= 0, drain gradient (0, 20] %, branch gradient [0, 20] %. Returns the error codes of the method."""
    err = []
    for n in case["nodes"]:
        i = n["id"]
        for f, c in n.get("fixtures", {}).items():
            if f not in DU:
                err.append("fixture:%s:%s" % (i, f))
            if not (is_num(c) and 0 <= c <= 10000 and c == int(c)):
                err.append("count:%s:%s" % (i, f))
        if n["kind"] == "drain" and not (is_num(n.get("slope")) and 0 < n["slope"] <= 20):
            err.append("slope:" + i)
        for k in ("L", "drop"):
            if k in n and n[k] is not None and not (is_num(n[k]) and n[k] >= 0):
                err.append("%s:%s" % (k, i))
        b = n.get("bends")
        if b is not None and not (is_num(b) and b >= 0 and b == int(b)):
            err.append("bends:" + i)
        if n["kind"] == "branch" and n.get("slope") is not None and not (is_num(n["slope"]) and 0 <= n["slope"] <= 20):
            err.append("slope:" + i)
    return err


def compute(case):
    sysn, K = case["system"], case["K"]
    col = SYS[sysn]
    c2 = 1 if sysn == "II" else 0
    ser = SERIES[case["material"]]
    kb, nu = case.get("kb_mm", 1.0) / 1000.0, case.get("nu", 1.31e-6)
    fill, vmin, smin = case.get("fill_max", 0.5), case.get("v_min", 0.7), case.get("slope_min_pct", 0.5)
    nodes = {n["id"]: n for n in case["nodes"]}
    children = {k: [] for k in nodes}
    for n in case["nodes"]:
        if n["to"]:
            children[n["to"]].append(n["id"])
    out, flags = {}, set()
    missing = set()

    def agg(i):
        n = nodes[i]
        s = dict(du=0.0, mx=0.0, wc=0, qx=n.get("qx", 0.0) or 0.0, dnf=0, dnu=0)
        for f, c in n["fixtures"].items():
            if c <= 0:
                continue
            du = DU[f][col]
            if du is None:
                missing.add(f)
                du = 0.0
            s["du"] += c * du
            s["mx"] = max(s["mx"], du)
            if DNMIN[f][0] >= 100:
                s["wc"] += c
            dm = DNMIN[f][c2]
            if DNMIN[f][0] >= 100 and sysn in WC_BRANCH_MIN:  # WC: Table 4 / 7 WC rows govern in systems I and IV (CR-2)
                dm = WC_BRANCH_MIN[sysn]
            s["dnf"] = max(s["dnf"], dm)
        for k in children[i]:
            cs = agg(k)
            s["du"] += cs["du"]; s["mx"] = max(s["mx"], cs["mx"]); s["wc"] += cs["wc"]; s["qx"] += cs["qx"]
            s["dnf"] = max(s["dnf"], cs["dnf"]); s["dnu"] = max(s["dnu"], out[k]["dn"] or 0)
        qww = max(K * math.sqrt(s["du"]), s["mx"]) if s["du"] > 0 else 0.0
        q = qww + s["qx"]
        r = dict(sum_du=s["du"], q_tot=q, dn=None)
        kind = n["kind"]
        if q <= 0:
            flags.add("no_flow")
        for k in children[i]:
            if RANK[nodes[k]["kind"]] > RANK[kind]:
                flags.add(nodes[k]["kind"] + "_into_" + kind)
        mdn = n.get("dn") or 0
        if mdn and kind != "drain" and not known_dn(ser, mdn):
            flags.add("dn_not_in_series")
            pp = pipe_for_dn(ser, mdn)
            mdn = dn_of(inner(pp)) if pp else mdn
        wcmin = 80 if sysn == "II" else 100
        if kind == "branch":
            vented = n.get("vent") in ("yes", "aav")
            need = max(s["dnf"], s["dnu"])
            if sysn == "III":
                flags.add("branch_tables_I_II")
                r["dn"] = mdn if mdn else (need or None)
            else:
                tab = (T6 if vented else T4)[sysn]
                if mdn:
                    r["dn"] = mdn
                    ok = [t for t in tab if t[1] <= mdn and note_ok(t[2], s["wc"], n.get("bends") or 0)]
                    if not ok or ok[-1][0] < q - 1e-12:
                        flags.add("override_small")
                    if mdn < need:
                        flags.add("dn_below_min")
                else:
                    pick = next((t for t in tab if t[0] + 1e-12 >= q and t[1] >= need and note_ok(t[2], s["wc"], n.get("bends") or 0)), None)
                    if pick is None:
                        flags.add("branch_over_table")
                        r["dn"] = need or None
                    else:
                        r["dn"] = pick[1]
            if n.get("vent") == "yes" and sysn in T7_VENT and r.get("dn") is not None:
                r["vent_dn"] = T7_VENT[sysn].get(r["dn"])
            if sysn in LIM:
                lim = LIM[sysn][vented]
                pre = "vented" if vented else "unvented"
                dmax = 3.0 if (sysn == "II" and not vented and not ((r.get("dn") or 0) > 70)) else lim["drop"]
                if lim["L"] is not None and n.get("L", 0) > lim["L"] + 1e-9:
                    flags.add(pre + "_length")
                if lim["bends"] is not None and n.get("bends", 0) > lim["bends"]:
                    flags.add("unvented_bends")
                if n.get("drop", 0) > dmax + 1e-9:
                    flags.add(pre + "_drop")
                if n.get("slope", 1) + 1e-9 < lim["slope"]:
                    flags.add("branch_slope")
            if n.get("vent") == "aav":  # METHOD 4.1: AAV on a branch, Qa >= f_branch * Qtot of the branch
                f = case.get("aav_branch_factor")
                if f is None or f == "":  # EN 12056-2:2000 6.4.3 Table 10: systems I and IV 1 x Qtot, II and III 2 x Qtot
                    f = {"I": 1, "IV": 1, "II": 2, "III": 2}[sysn]
                r["aav_air_lps"] = f * q
        elif kind == "stack":
            vent = n.get("vent") if n.get("vent") in ("secondary", "aav") else "primary"
            r["vent"] = vent
            need = max(s["dnu"], wcmin if s["wc"] else 0)
            sw = 0 if case["entry"] == "square" else 1
            if vent == "secondary":
                tab = [(dn, T12[dn][1 + sw], T12[dn][0]) for dn in sorted(T12)]
            else:
                tab = [(dn, T11[dn][sw], dn) for dn in sorted(T11)]
            if mdn:
                ok = [t for t in tab if t[0] <= mdn]
                r["dn"] = mdn
                if not ok or ok[-1][1] < q - 1e-12:
                    flags.add("override_small")
                if mdn < need:
                    flags.add("dn_below_min")
                r["vent_dn"] = ok[-1][2] if ok else None
            else:
                pick = next((t for t in tab if t[1] + 1e-12 >= q and t[0] >= need), None)
                if pick is None:
                    flags.add("stack_over_table")
                    r["dn"] = max(need, 200)
                    r["vent_dn"] = None
                else:
                    r["dn"], r["vent_dn"] = pick[0], pick[2]
            if vent != "secondary":
                r["vent_dn"] = r["dn"]
            if vent == "aav":
                r["aav_air_lps"] = case.get("aav_factor", 8) * q  # EN 12056-2:2000 6.5.3: Qa >= 8 x Qtot
        else:
            J = n["slope"] / 100.0
            need = max(s["dnu"], wcmin if s["wc"] else 0, s["dnf"])
            if case.get("buried"):
                if n.get("dn") and n["dn"] < 100:
                    flags.add("buried_dn100")
                need = max(need, 100)
            if n.get("dn") and not known_dn(ser, n["dn"]):
                flags.add("dn_not_in_series")
            if n.get("dn"):
                p = next((x for x in ser if x[0] == n["dn"]), None) or pipe_for_dn(ser, n["dn"])
            else:
                p = None
                mind = DI_MIN.get(need, 0) if need else 0
                for x in sorted(ser, key=inner):
                    if inner(x) + 1e-9 < mind:
                        continue
                    if q_part(inner(x) / 1000.0, fill, J, kb, nu)[0] + 1e-12 >= q:
                        p = x
                        break
                if p is None:
                    flags.add("drain_over_series")
                    p = sorted(ser, key=inner)[-1]
            d = inner(p) / 1000.0
            r["od_mm"], r["dn"] = p[1], dn_of(inner(p))
            cap = q_part(d, fill, J, kb, nu)[0]
            r["q_max"] = cap
            if n.get("dn") and cap < q - 1e-12:
                flags.add("override_small")
            if r["dn"] is not None and r["dn"] < need:
                flags.add("dn_below_min")
            if q > 0:
                if q_part(d, 0.93, J, kb, nu)[0] < q:
                    flags.add("drain_surcharged")
                    r["hd"], r["v"] = None, None
                else:
                    hd = brentq(lambda h: q_part(d, h, J, kb, nu)[0] - q, 1e-7, 0.93, xtol=1e-12)
                    A = area_perim(d, hd)[0]
                    r["hd"], r["v"] = hd, q / 1000.0 / A
                    if r["v"] + 1e-9 < vmin:
                        flags.add("self_cleansing")
            if n["slope"] + 1e-9 < smin:
                flags.add("drain_slope")
        if r["dn"] is not None and s["dnu"] > r["dn"]:
            flags.add("reduction")
        out[i] = r
        return s

    roots = [n["id"] for n in case["nodes"] if not n["to"]]
    tot_du, tot_qx, tot_q = 0.0, 0.0, 0.0
    for rt in roots:
        s = agg(rt)
        tot_du += s["du"]; tot_qx += s["qx"]; tot_q += out[rt]["q_tot"]
    if missing:
        flags.add("du_missing")
    stacks = [i for i in out if nodes[i]["kind"] == "stack"]
    # METHOD 4.1: open vent checked per outlet tree; info flag aav_air whenever an AAV is used
    def tree(i):
        return [i] + [x for k in children[i] for x in tree(k)]
    for rt in roots:
        t = tree(rt)
        has_aav = any(nodes[i].get("vent") == "aav" for i in t)
        open_vent = any(nodes[i]["kind"] == "stack" and nodes[i].get("vent") in ("primary", "secondary", None, "") for i in t)
        if has_aav and not open_vent:
            flags.add("aav_no_open_vent")
    if any(nodes[i].get("vent") == "aav" and nodes[i]["kind"] in ("branch", "stack") for i in nodes):
        flags.add("aav_air")
    if stacks and case["entry"] == "swept":
        flags.add("entry_swept")
    # plb-r4 Y5-2: filling above 0.5 is meant for drains outside the building only (DIN 1986-100) -> warning
    if fill > 0.5 + 1e-9 and any(nodes[i]["kind"] == "drain" for i in nodes):
        flags.add("fill_above_half")
    if any(n["fixtures"].get("wc_flushvalve", 0) > 0 for n in case["nodes"]):
        flags.add("du_flushvalve_assumed")
    return dict(rows=out, sum_du=tot_du, q_tot=tot_q, flags=sorted(flags))


def N(i, kind, to, fx, **o):
    n = dict(id=i, kind=kind, to=to, fixtures=fx, L=0, slope=1, bends=0, drop=0, vent="primary" if kind == "stack" else "no", qx=0, dn=0)
    n.update(o)
    return n


FLAT = dict(wc_cistern=1, basin=1, shower=1, bath=1, sink_kitchen=1, dishwasher_dom=1, washing_machine=1)


def mul(d, k):
    return {a: b * k for a, b in d.items()}


def flat_stack(bathL=2.4, bath_vent="no", drain_slope=2):
    return [N("D1", "drain", "", {}, L=18, slope=drain_slope), N("ST1", "stack", "D1", mul(FLAT, 11), L=17),
            N("WC", "branch", "ST1", dict(wc_cistern=1), L=1.2, slope=2, bends=1),
            N("BATH", "branch", "ST1", dict(bath=1), L=bathL, slope=2, bends=3 if bathL > 4 else 2, vent=bath_vent),
            N("BAS", "branch", "BATH", dict(basin=1), L=0.8, slope=2, bends=1), N("SHW", "branch", "BATH", dict(shower=1), L=1.5, slope=2, bends=1),
            N("KIT", "branch", "ST1", dict(sink_kitchen=1), L=3.0, slope=1.5, bends=2), N("DW", "branch", "KIT", dict(dishwasher_dom=1), L=0.6, slope=2),
            N("WM", "branch", "KIT", dict(washing_machine=1), L=1.0, slope=2, bends=1)]


def office(vent="primary", mat="pe_hd"):
    fl = dict(wc_cistern=6, urinal_flush=3, basin=6, handbasin_small=1, sink_kitchen=1, dishwasher_dom=1, cleaner_sink=1)
    return [N("D1", "drain", "", dict(shower=6, wc_cistern=2, basin=2), L=25, slope=1), N("ST1", "stack", "D1", mul(fl, 7), L=29, vent=vent),
            N("WCR", "branch", "ST1", dict(wc_cistern=6), L=6, slope=1, bends=1, vent="yes"), N("URI", "branch", "ST1", dict(urinal_flush=3), L=3, slope=1.5, bends=1),
            N("BAS", "branch", "ST1", dict(basin=6, handbasin_small=1), L=5, slope=1.5, bends=2, vent="yes"),
            N("PAN", "branch", "ST1", dict(sink_kitchen=1, dishwasher_dom=1, cleaner_sink=1), L=3.5, slope=1.5, bends=2)]


def sports(slope=1):
    room = dict(shower=8, wc_cistern=2, basin=3, floor_drain=2)
    return [N("D1", "drain", "", dict(wc_cistern=4, urinal_flush=3, basin=4, sink_kitchen=1, cleaner_sink=1), L=30, slope=slope),
            N("CR12", "drain", "D1", mul(room, 2), L=15, slope=slope), N("CR34", "drain", "D1", mul(room, 2), L=15, slope=slope)]


def kitchen(dn=150, slope=0.5):
    return [N("KD", "drain", "", dict(sink_commercial=3, dishwasher_com=1, handbasin_small=2, floor_drain=4), L=22, slope=slope, dn=dn)]


def C(cid, note, nodes, **o):
    c = dict(id=cid, note=note, system="I", K=0.5, entry="swept", material="pvc_u", buried=False, fill_max=0.5, v_min=0.7, slope_min_pct=0.5, kb_mm=1.0, nu=1.31e-6, aav_factor=8, aav_branch_factor=None, nodes=nodes)
    c.update(o)
    return c


cases = [
    C("apt_stack", "preset: 12 flats, swept entries, drain 2 %", flat_stack()),
    C("apt_square", "preset: square entries, drain 1 %", flat_stack(drain_slope=1), entry="square"),
    C("bath_far", "preset: 5.5 m unvented bath branch", flat_stack(5.5)),
    C("apt_sys2", "preset: system II", flat_stack(), system="II"),
    C("office_core", "preset: office stack primary", office()),
    C("sports_k", "preset: sports hall K 1.0", sports(), K=1.0),
    C("hotel_kitchen", "preset: oversized kitchen drain 0.5 %", kitchen(), K=0.7),
    C("bath_far_aav", "bath branch with AAV", flat_stack(5.5, "aav")),
    C("bath_far_vented", "bath branch vented", flat_stack(5.5, "yes")),
    C("apt_sys3", "system III", flat_stack(), system="III"),
    C("apt_sys4", "system IV", flat_stack(), system="IV"),
    C("apt_K07", "apartments K 0.7", flat_stack(), K=0.7),
    C("apt_K10", "apartments K 1.0", flat_stack(), K=1.0),
    C("apt_pe", "PE-HD series", flat_stack(), material="pe_hd"),
    C("apt_pp", "PP series", flat_stack(), material="pp_drain"),
    C("apt_sml", "cast iron SML", flat_stack(), material="cast_iron_sml"),
    C("apt_fill07", "drain filling 0.7", flat_stack(drain_slope=1), fill_max=0.7),
    C("apt_slope05", "drain 0.5 %", flat_stack(drain_slope=0.5)),
    C("apt_slope03", "drain 0.3 % below minimum", flat_stack(drain_slope=0.3)),
    C("office_sec", "office secondary ventilation", office("secondary")),
    C("office_aav", "office AAV only", office("aav")),
    C("office_square", "office square entries", office(), entry="square"),
    C("office_pvc", "office PVC", office(mat="pvc_u"), material="pvc_u"),
    C("office_K07", "office K 0.7", office(), K=0.7),
    C("sports_K05", "sports hall K 0.5", sports(), K=0.5),
    C("sports_K12", "sports hall K 1.2", sports(), K=1.2),
    C("sports_2pct", "sports hall 2 %", sports(2), K=1.0),
    C("kitchen_auto05", "kitchen auto 0.5 %", kitchen(0, 0.5), K=0.7),
    C("kitchen_auto2", "kitchen auto 2 %", kitchen(0, 2), K=0.7),
    C("kitchen_100_1", "kitchen DN 100 1 %", kitchen(100, 1), K=0.7),
    C("kitchen_vmin05", "kitchen DN 150, v_min 0.5", kitchen(150, 0.5), K=0.7, v_min=0.5),
    C("qx_pump", "pumped flow 2 l/s into the drain", [N("D1", "drain", "", dict(wc_cistern=10, basin=10), L=10, slope=1, qx=2.0)]),
    C("small_override", "DN 80 drain under a WC stack", [N("D1", "drain", "", {}, L=10, slope=1, dn=80), N("S", "stack", "D1", dict(wc_cistern=2))]),
    C("stack_over", "stack beyond Table 11", [N("D1", "drain", "", {}, L=5, slope=3), N("S", "stack", "D1", dict(wc_flushvalve=900))], K=1.0, material="pe_hd"),
    C("branch_over", "branch beyond Table 4", [N("D1", "drain", "", {}, L=5, slope=2), N("B", "branch", "D1", dict(shower=20), L=2)], K=1.0),
    C("urinals_sys3", "urinals without DU in system III", [N("D1", "drain", "", dict(urinal_flush=6, wc_cistern=4), L=8, slope=1)], system="III"),
    C("hospital_slop", "care floor, slop hoppers, K 0.7", [N("D1", "drain", "", {}, L=12, slope=1), N("S", "stack", "D1", dict(wc_cistern=28, basin=28, shower=27, slop_sink=1, bedpan_washer=1), vent="secondary"),
                                                          N("B", "branch", "S", dict(slop_sink=1), L=2.5, slope=1.5, bends=2)], K=0.7, entry="square"),
]

# run 2 rule cases (QA-25, CR-52, CR-53, CR-56, CR-57)
cases += [
    C("dn63_pvc", "manual DN 63 on PVC-U: not a DN of Table 1 nor a series size -> DN 70 (Ø75), flag", [N("D1", "drain", "", {}, L=6, slope=1), N("B", "branch", "D1", dict(shower=2), L=2, slope=2, dn=63)]),
    C("empty_drain", "drain without fixtures or flow", [N("D1", "drain", "", {}, L=5, slope=1)]),
    C("flushvalve", "flush-valve WCs (DU of the 9 l cistern WC, learning assumption)", [N("D1", "drain", "", dict(wc_flushvalve=6, basin=6), L=10, slope=1)]),
    C("stack_into_branch", "a stack discharging into a branch", [N("D1", "drain", "", {}, L=6, slope=1), N("B", "branch", "D1", dict(basin=1), L=1, slope=2), N("S", "stack", "B", dict(wc_cistern=2))]),
    C("buried_small", "buried drain of a basin group: DN 100 minimum (DIN 1986-100)", [N("D1", "drain", "", dict(basin=4), L=8, slope=1)], buried=True),
    C("buried_override", "buried drain forced to DN 50", [N("D1", "drain", "", dict(basin=4), L=8, slope=1, dn=50)], buried=True),
    C("apt_square_default", "12 flats, square entries (new default)", flat_stack(), entry="square"),
]

# run 3 rule cases (CR-55: AAV on branches, open vent per outlet network)
def two_outlets(v1, v2, bv="no"):
    return [N("D1", "drain", "", {}, L=8, slope=1), N("S1", "stack", "D1", mul(FLAT, 4), L=9, vent=v1),
            N("B1", "branch", "S1", dict(bath=1, basin=1), L=5, slope=2, bends=2, vent=bv),
            N("D2", "drain", "", {}, L=8, slope=1), N("S2", "stack", "D2", mul(FLAT, 4), L=9, vent=v2)]
cases += [
    C("aav_branch_factor3", "bath branch with AAV, branch factor 3", flat_stack(5.5, "aav"), aav_branch_factor=3),
    C("aav_branch_stack_factor", "AAV stack factor 6", office("aav"), aav_factor=6),
    C("aav_two_outlets_one_open", "outlet D1 primary stack, outlet D2 AAV stack only: D2 network has no open vent", two_outlets("primary", "aav")),
    C("aav_two_outlets_both_open", "both outlets with open stacks, AAV on a branch of D1", two_outlets("primary", "secondary", "aav")),
    C("aav_two_outlets_none", "both stacks AAV", two_outlets("aav", "aav")),
    C("aav_branch_no_stack", "AAV branch into a drain, no stack in the network", [N("D1", "drain", "", dict(wc_cistern=2), L=10, slope=1),
                                                                                 N("B", "branch", "D1", dict(basin=2, shower=1), L=6, slope=1.5, bends=2, vent="aav")]),
    C("aav_branch_sys2", "system II, AAV branches and a primary stack", flat_stack(5.5, "aav"), system="II"),
    C("aav_branch_sys3", "system III, AAV branch (capacity not checked, Qa still required)", flat_stack(5.5, "aav"), system="III"),
    # D-PLB-23: Table 10 by system vs explicit factor
    C("aav_branch_sys4", "system IV, AAV branches (Table 10: 1 x Qtot)", flat_stack(5.5, "aav"), system="IV"),
    C("aav_branch_override2_sys1", "system I, AAV branch with explicit factor 2 (user override over Table 10)", flat_stack(5.5, "aav"), aav_branch_factor=2),
    C("aav_branch_override1_sys2", "system II, AAV branch with explicit factor 1 (user override over Table 10)", flat_stack(5.5, "aav"), system="II", aav_branch_factor=1),
]

# External anchors (D-PLB-10): values worked by hand from the text of EN 12056-2:2000, NOT from METHOD or the page.
# Each anchor: case + literal expected values; the generator asserts compute() against them and the bench checks the page.
FLAT12 = mul(FLAT, 12)  # Table 2, system I: WC 2.0 + basin 0.5 + shower 0.6 + bath 0.8 + sink 0.8 + dishwasher 0.8 + washing machine 0.8 = 6.3 DU per flat
# plb-r3 X3-2 / X3-3: invalid inputs -> valid false with the expected error codes (METHOD 1 input rules)
def stack_branch(**geo):
    return [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6), N("B", "branch", "ST", dict(basin=1), L=1, slope=2, bends=1, **geo)]


INVALID = [
    C("invalid_fixture_constructor", "X3-2: fixture id 'constructor' is not a fixture type", [N("D1", "drain", "", dict(constructor=1), L=6, slope=1)]),
    C("invalid_fixture_tostring_branch", "X3-2: fixture id 'toString' on a branch", [N("D1", "drain", "", {}, L=6, slope=1), N("B", "branch", "D1", dict(toString=1, basin=1), L=1, slope=2)]),
    C("invalid_branch_geometry_negative", "X3-3 Codex case: basin branch L -5, bends -2, drop -1, slope -3", [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6),
        N("B", "branch", "ST", dict(basin=1), L=-5, bends=-2, drop=-1, slope=-3)]),
    C("invalid_bends_fractional", "X3-3: 1.5 bends", stack_branch()[:2] + [N("B", "branch", "ST", dict(basin=1), L=1, slope=2, bends=1.5)]),
    C("invalid_drain_length_negative", "X3-3: drain L -10 m", [N("D1", "drain", "", dict(wc_cistern=1), L=-10, slope=1)]),
]
for c in INVALID:
    c["expect"] = dict(valid=False, errors=input_errors(c))
    assert c["expect"]["errors"], c["id"]

ANCHORS = [
    # A1 EN 12056-2 6.3.1 eq. (1) Qww = K*sqrt(sum DU): 12 x 6.3 = 75.6 DU, K 0.5 (dwellings) -> 4.3474 l/s;
    #    Table 11 primary ventilation: DN 100 swept 5.2 >= 4.35 -> DN 100; square 4.0 < 4.35 -> DN 125
    (C("anchor_t11_swept", "EXTERNAL ANCHOR A1a: EN 12056-2 eq. (1) + Table 11 swept, 12 flats", [N("D1", "drain", "", {}, L=10, slope=2), N("S", "stack", "D1", FLAT12, L=17)]),
     dict(sum_du=75.6, q_tot=4.347413, rows=dict(S=dict(dn=100)))),
    (C("anchor_t11_square", "EXTERNAL ANCHOR A1b: EN 12056-2 eq. (1) + Table 11 square, 12 flats", [N("D1", "drain", "", {}, L=10, slope=2), N("S", "stack", "D1", FLAT12, L=17)], entry="square"),
     dict(sum_du=75.6, q_tot=4.347413, rows=dict(S=dict(dn=125)))),
    # A2 72 WCs (2.0 DU): 144 DU, K 0.5 -> 6.0 l/s. Table 11 swept: DN 100 5.2 < 6 <= DN 125 7.6 -> 125; square DN 125 5.8 < 6 -> DN 150;
    #    Table 12 secondary swept: DN 100 7.3 >= 6 -> DN 100 / vent DN 50; square DN 100 5.6 < 6 -> DN 125 / vent DN 70; K 1.0 -> 12 l/s, Table 11 swept DN 150 12.4 -> DN 150
    (C("anchor_t11_6lps", "EXTERNAL ANCHOR A2a: 6.0 l/s primary swept", [N("D1", "drain", "", {}, L=10, slope=2), N("S", "stack", "D1", dict(wc_cistern=72))]),
     dict(sum_du=144.0, q_tot=6.0, rows=dict(S=dict(dn=125)))),
    (C("anchor_t11_6lps_sq", "EXTERNAL ANCHOR A2b: 6.0 l/s primary square", [N("D1", "drain", "", {}, L=10, slope=2), N("S", "stack", "D1", dict(wc_cistern=72))], entry="square"),
     dict(sum_du=144.0, q_tot=6.0, rows=dict(S=dict(dn=150)))),
    (C("anchor_t12_6lps", "EXTERNAL ANCHOR A2c: 6.0 l/s secondary swept (Table 12)", [N("D1", "drain", "", {}, L=10, slope=2), N("S", "stack", "D1", dict(wc_cistern=72), vent="secondary")]),
     dict(sum_du=144.0, q_tot=6.0, rows=dict(S=dict(dn=100, vent_dn=50)))),
    (C("anchor_t12_6lps_sq", "EXTERNAL ANCHOR A2d: 6.0 l/s secondary square (Table 12)", [N("D1", "drain", "", {}, L=10, slope=2), N("S", "stack", "D1", dict(wc_cistern=72), vent="secondary")], entry="square"),
     dict(sum_du=144.0, q_tot=6.0, rows=dict(S=dict(dn=125, vent_dn=70)))),
    (C("anchor_t11_K1", "EXTERNAL ANCHOR A2e: K 1.0 -> 12 l/s primary swept", [N("D1", "drain", "", {}, L=10, slope=3), N("S", "stack", "D1", dict(wc_cistern=72))], K=1.0),
     dict(sum_du=144.0, q_tot=12.0, rows=dict(S=dict(dn=150)))),
    # A3 Table 4 / Table 7 system I, 10 showers (0.6 DU): 6 DU -> 0.5*sqrt(6) = 1.2247 l/s; unvented: DN 60 1.0 < 1.22 <= DN 70 1.5 (no WC) -> DN 70; vented: DN 60 1.5 -> DN 60
    (C("anchor_t4_showers", "EXTERNAL ANCHOR A3a: Table 4 unvented branch, 10 showers", [N("D1", "drain", "", {}, L=6, slope=1), N("B", "branch", "D1", dict(shower=10), L=3, slope=1, bends=1)]),
     dict(sum_du=6.0, q_tot=1.224745, rows=dict(B=dict(dn=70)))),
    (C("anchor_t6_showers", "EXTERNAL ANCHOR A3b: Table 7 vented branch, 10 showers (DN 60/40)", [N("D1", "drain", "", {}, L=6, slope=1), N("B", "branch", "D1", dict(shower=10), L=3, slope=1, bends=1, vent="yes")]),
     dict(sum_du=6.0, q_tot=1.224745, rows=dict(B=dict(dn=60, vent_dn=40)))),
    # A4 6.3.1: if Qww < the largest single DU, the largest DU is the design flow: one WC 0.5*sqrt(2) = 0.71 < 2.0 -> 2.0 l/s
    (C("anchor_qww_floor", "EXTERNAL ANCHOR A4: Qww floored at the largest DU (one WC)", [N("D1", "drain", "", dict(wc_cistern=1), L=4, slope=2)]),
     dict(sum_du=2.0, q_tot=2.0, rows=dict(D1=dict(dn=100)))),
    # A5 Annex B, Prandtl-Colebrook for a FULL pipe (kb 1.0 mm, nu 1.31e-6): at h/d = 0.5 the hydraulic radius equals the full-pipe d/4,
    #    so v(0.5) = v_full and Q(0.5) = Q_full/2. PVC-U 110x2.2 (d 105.6 mm), J 1 %: sqrt(2gdJ) = 0.143940, v = 0.73631 m/s, Q = 3.2244 l/s
    (C("anchor_annexB_half", "EXTERNAL ANCHOR A5: Annex B full-pipe formula, 110 mm PVC-U at 1 %, 3.22 l/s -> h/d 0.50", [N("D1", "drain", "", {}, L=10, slope=1, qx=3.22)]),
     dict(sum_du=0.0, q_tot=3.22, rows=dict(D1=dict(dn=100, od_mm=110, q_max=3.224410, hd=0.5, v=0.73631)))),
    # A6 AAV on a stack, EN 12056-2:2000 6.5.3 Qa >= 8 * Qtot; numbers from the worked example of the Durgo guide "Dimensioning in accordance with EN 12056" (3-storey flats, system II DU):
    #    3 baths 0.6, 8 washing machines 0.6 (the guide: 4 x 1.2 for <= 12 kg), 4 basins 0.3, 4 WCs 1.8, 3 dishwashers 0.6, 4 sinks 0.6 = 19.2 DU;
    #    Qww = 0.5*sqrt(19.2) = 2.19089 l/s (> largest DU 1.8), Qa = 8 * 2.19089 = 17.527 l/s (guide: 17.5 l/s). Table 11 swept DN 80 2.6 l/s >= 2.19, WC min DN 80 (system II) -> DN 80.
    #    As in the guide the stack is vented only by the AAV, so the network also raises aav_no_open_vent (METHOD 4.1).
    (C("anchor_aav_stack_durgo", "EXTERNAL ANCHOR A6: AAV stack Qa = 8 x Qtot, Durgo worked example (sum DU 19.2, 17.5 l/s)",
       [N("D1", "drain", "", {}, L=10, slope=2), N("S", "stack", "D1", dict(bath=3, washing_machine=8, basin=4, wc_cistern=4, dishwasher_dom=3, sink_kitchen=4), L=9, vent="aav")], system="II"),
     dict(sum_du=19.2, q_tot=2.190890, rows=dict(S=dict(dn=80, aav_air_lps=17.527125)))),
    # A7 AAV on a branch, EN 12056-2:2000 6.4.3 Table 10, system I: Qa >= 1 x Qtot. 10 showers (system I 0.6 DU) -> 6 DU,
    #    0.5*sqrt(6) = 1.224745 l/s (> largest DU 0.6), Table 7 (ventilated) DN 60 1.5 l/s, Qa = 1 x 1.224745 = 1.224745 l/s
    (C("anchor_aav_branch_t10_sys1", "EXTERNAL ANCHOR A7: EN 12056-2 Table 10, system I AAV branch Qa = 1 x Qtot, 10 showers", [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6),
        N("B", "branch", "ST", dict(shower=10), L=3, slope=1, bends=1, vent="aav")]),
     dict(sum_du=6.0, q_tot=1.224745, rows=dict(B=dict(dn=60, aav_air_lps=1.224745)))),
    # A8 Table 10, system III: Qa >= 2 x Qtot. 10 showers (Table 2 system III 0.4 DU) -> 4 DU, 0.5*sqrt(4) = 1.0 l/s (> 0.4), Qa = 2.0 l/s
    (C("anchor_aav_branch_t10_sys3", "EXTERNAL ANCHOR A8: EN 12056-2 Table 10, system III AAV branch Qa = 2 x Qtot, 10 showers", [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6),
        N("B", "branch", "ST", dict(shower=10), L=3, slope=1, bends=1, vent="aav")], system="III"),
     dict(sum_du=4.0, q_tot=1.0, rows=dict(B=dict(aav_air_lps=2.0)))),
    # A9 Table 10, system IV: Qa >= 1 x Qtot. 10 showers (system IV 0.4 DU) -> 4 DU -> 1.0 l/s, Qa = 1.0 l/s
    (C("anchor_aav_branch_t10_sys4", "EXTERNAL ANCHOR A9: EN 12056-2 Table 10, system IV AAV branch Qa = 1 x Qtot, 10 showers", [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6),
        N("B", "branch", "ST", dict(shower=10), L=3, slope=1, bends=1, vent="aav")], system="IV"),
     dict(sum_du=4.0, q_tot=1.0, rows=dict(B=dict(aav_air_lps=1.0)))),
    # plb-r4 N-1: footnotes of EN 12056-2:2000 Table 4 / Table 7 (** no WCs, *** <= 2 WCs and <= 90 deg change of direction, **** <= 1 WC).
    # A10 system II unvented branch, 2 WCs (Table 2 system II 1.8 DU): 3.6 DU, 0.5*sqrt(3.6) = 0.949 < 1.8 -> Qtot 1.8 l/s; WC needs DN >= 80 (system II);
    #     Table 4 II: DN 80**** (2.25 l/s) allows one WC only -> next row 2.50 l/s DN 90
    (C("anchor_t4_sys2_two_wc", "EXTERNAL ANCHOR A10: Table 4 system II, unvented branch with 2 WCs -> DN 90 (DN 80 only for one WC)",
       [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6), N("B", "branch", "ST", dict(wc_cistern=2), L=2, slope=1.5)], system="II"),
     dict(sum_du=3.6, q_tot=1.8, rows=dict(B=dict(dn=90)))),
    # A11 same with one WC: 1.8 DU -> 1.8 l/s, Table 4 II DN 80**** -> DN 80
    (C("anchor_t4_sys2_one_wc", "EXTERNAL ANCHOR A11: Table 4 system II, unvented branch with 1 WC -> DN 80",
       [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6), N("B", "branch", "ST", dict(wc_cistern=1), L=2, slope=1.5)], system="II"),
     dict(sum_du=1.8, q_tot=1.8, rows=dict(B=dict(dn=80)))),
    # A12 system I unvented, 30 showers (0.6 DU): 18 DU -> 0.5*sqrt(18) = 2.121320 l/s; Table 4 I: DN 90*** (2.25) needs a total change of direction <= 90 deg:
    #     one 90 deg bend -> DN 90; two bends -> next row DN 100 (2.50)
    (C("anchor_t4_sys1_dn90_one_bend", "EXTERNAL ANCHOR A12a: Table 4 system I DN 90*** with one 90 deg bend",
       [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6), N("B", "branch", "ST", dict(shower=30), L=3, slope=1, bends=1)]),
     dict(sum_du=18.0, q_tot=2.121320, rows=dict(B=dict(dn=90)))),
    (C("anchor_t4_sys1_dn90_two_bends", "EXTERNAL ANCHOR A12b: Table 4 system I, two 90 deg bends exceed the DN 90*** limit -> DN 100",
       [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6), N("B", "branch", "ST", dict(shower=30), L=3, slope=1, bends=2)]),
     dict(sum_du=18.0, q_tot=2.121320, rows=dict(B=dict(dn=100)))),
    # A13 system II ventilated branch with 2 WCs: 1.8 l/s; Table 7 II: 70/40** no WC, 80/40**** one WC only -> 90/50 (3.75 l/s) -> DN 90
    (C("anchor_t7_sys2_two_wc", "EXTERNAL ANCHOR A13: Table 7 system II, ventilated branch with 2 WCs -> DN 90",
       [N("D1", "drain", "", {}, L=6, slope=1), N("ST", "stack", "D1", {}, L=6), N("B", "branch", "ST", dict(wc_cistern=2), L=2, slope=1.5, vent="yes")], system="II"),
     dict(sum_du=3.6, q_tot=1.8, rows=dict(B=dict(dn=90)))),
    # A14 (bw-r1 D-BW-3) Table 4 column IV: 10 showers (system IV 0.4 DU) -> 4 DU -> 1.0 l/s -> DN 50 (Qmax 1.00) on an unventilated branch
    (C("anchor_t4_sys4_showers", "EXTERNAL ANCHOR A14: Table 4 system IV column, 10 showers -> DN 50", [N("D1", "drain", "", {}, L=6, slope=1),
        N("B", "branch", "D1", dict(shower=10), L=3, slope=1, bends=1)], system="IV"),
     dict(sum_du=4.0, q_tot=1.0, rows=dict(B=dict(dn=50)))),
    # A15 (bw-r1 D-BW-3) Table 5 system II limits: unventilated branch 8 m (<= 10 m ok), 2 bends (> 1), gradient 1.2 % (< 1.5 %) -> unvented_bends + branch_slope
    (C("anchor_t5_sys2_limits", "EXTERNAL ANCHOR A15: Table 5 system II limits (10 m, 1 bend, 1.5 %)", [N("D1", "drain", "", {}, L=6, slope=1),
        N("B", "branch", "D1", dict(shower=10), L=8, slope=1.2, bends=2)], system="II"),
     dict(sum_du=4.0, q_tot=1.0, flags_has=["unvented_bends", "branch_slope"], flags_not=["unvented_length", "unvented_drop"], rows=dict(B=dict(dn=50)))),
    # A16 (bw-r1 CR-2) Table 4 system IV, footnote ****: one WC on an unventilated branch, one bend -> DN 80 (Qtot = WC DU <= 2.25 l/s)
    (C("anchor_t4_sys4_one_wc", "EXTERNAL ANCHOR A16: Table 4 system IV, unvented branch with 1 WC -> DN 80 (footnote ****)", [N("D1", "drain", "", {}, L=6, slope=1),
        N("B", "branch", "D1", dict(wc_cistern=1), L=2, slope=1.5, bends=1)], system="IV"),
     dict(sum_du=2.0, q_tot=2.0, rows=dict(B=dict(dn=80)))),
    # A17 (bw-r1 CR-2) Table 4 system I, footnote ***: one WC, one 90 deg bend -> DN 90; two bends -> DN 100
    (C("anchor_t4_sys1_one_wc", "EXTERNAL ANCHOR A17a: Table 4 system I, unvented branch with 1 WC and one bend -> DN 90 (footnote ***)", [N("D1", "drain", "", {}, L=6, slope=1),
        N("B", "branch", "D1", dict(wc_cistern=1), L=2, slope=1, bends=1)]),
     dict(sum_du=2.0, q_tot=2.0, rows=dict(B=dict(dn=90)))),
    (C("anchor_t4_sys1_one_wc_two_bends", "EXTERNAL ANCHOR A17b: Table 4 system I, 1 WC and two bends exceed footnote *** -> DN 100", [N("D1", "drain", "", {}, L=2, slope=1),
        N("B", "branch", "D1", dict(wc_cistern=1), L=2, slope=1, bends=2)]),
     dict(sum_du=2.0, q_tot=2.0, rows=dict(B=dict(dn=100)))),
]
TOL = dict(q_tot=1e-5, q_max=5e-3, v=5e-3, aav_air_lps=1e-5)
for c, hand in ANCHORS:
    r = compute(c)
    assert abs(r["sum_du"] - hand["sum_du"]) < 1e-9, (c["id"], r["sum_du"])
    assert abs(r["q_tot"] - hand["q_tot"]) <= 1e-5 * max(1, hand["q_tot"]), (c["id"], r["q_tot"])
    for rid, vals in hand["rows"].items():
        for k, x in vals.items():
            g = r["rows"][rid][k]
            if k == "hd":
                assert abs(g - x) <= 0.002, (c["id"], k, g)
            elif isinstance(x, float):
                assert abs(g - x) <= TOL.get(k, 1e-6) * abs(x), (c["id"], k, g, x)
            else:
                assert g == x, (c["id"], rid, k, g, x)
    for fl in hand.get("flags_has", []):
        assert fl in r["flags"], (c["id"], fl, r["flags"])
    for fl in hand.get("flags_not", []):
        assert fl not in r["flags"], (c["id"], fl, r["flags"])
    c["anchor"] = True
    cases.append(c)
print("external anchors:", len(ANCHORS), "pass")

for c in cases:
    assert not input_errors(c), (c["id"], input_errors(c))
    r = compute(c)
    exp = dict(sum_du=r["sum_du"], q_tot=r["q_tot"], flags=r["flags"], rows={})
    for i, x in r["rows"].items():
        e = dict(dn=x["dn"], q_tot=x["q_tot"], sum_du=x["sum_du"])
        for k in ("hd", "v", "q_max", "vent_dn", "aav_air_lps", "od_mm"):
            if k in x:
                e[k] = x[k]
        exp["rows"][i] = e
    c["expect"] = exp

cases += INVALID
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "plbdrainage_ref.json"), "w", encoding="utf-8") as f:
    json.dump(cases, f, indent=1, ensure_ascii=False)
print("plbdrainage_ref.json:", len(cases), "cases")
