#!/usr/bin/env python3
"""Generate methane_emissions_ref.json reference cases (stdlib only).
Independent re-implementation of the documented equations (Claude, 22.10.2026)."""
import copy
import json
import os

EF = {  # scf/h whole gas per device, category
    "pcHighBleed": (37.3, "pneumatic"), "pcIntermittent": (13.5, "pneumatic"),
    "pcLowBleed": (1.39, "pneumatic"), "pneumaticPump": (13.3, "pneumatic"),
    "leakValve": (0.121, "fugitive"), "leakConnector": (0.017, "fugitive"),
    "leakFlange": (0.017, "fugitive"), "leakOEL": (0.031, "fugitive"),
    "leakPRV": (0.193, "fugitive"), "leakCompSeal": (0.4, "compressor"),
    "recipRodPacking": (11.5, "compressor"), "centrifWetSeal": (2862, "compressor"),
}
GWP = {"AR6_100": 29.8, "AR6_20": 82.5, "AR5_100": 28}
DEFAULTS = {
    "xCH4": 0.85, "hours": 8760,
    "counts": {"pcHighBleed": 0, "pcIntermittent": 10, "pcLowBleed": 5, "pneumaticPump": 2,
               "leakValve": 300, "leakConnector": 1200, "leakFlange": 400, "leakOEL": 20,
               "leakPRV": 15, "leakCompSeal": 0, "recipRodPacking": 8, "centrifWetSeal": 0},
    "tankOil_m3_y": 50000, "blowdowns": [{"volM3": 20, "pKPa": 7000, "tK": 300, "n": 12}],
    "flareGas_kg_y": 500000, "flareXCH4_mass": 0.75, "flareDRE": 0.98,
    "measured_t_y": None, "gwp": "AR6_100", "ogmpLevel": 4, "gasThroughput_t_y": 2e6,
}
CASES = [
    ("default", "Baseline defaults", {}),
    ("oil-wellsite", "Oil wellsite, high-bleed controllers, large tank and flare",
     {"xCH4": 0.7, "counts": {"pcHighBleed": 6, "pcIntermittent": 4, "pcLowBleed": 0,
      "pneumaticPump": 3, "leakValve": 120, "leakConnector": 500, "leakFlange": 100,
      "leakOEL": 10, "leakPRV": 4, "recipRodPacking": 0}, "tankOil_m3_y": 120000,
      "blowdowns": [], "flareGas_kg_y": 2e6, "flareXCH4_mass": 0.6,
      "gasThroughput_t_y": 1.5e5, "ogmpLevel": 3}),
    ("compressor-station", "Compressor station, OGMP L5 measured value reported",
     {"xCH4": 0.93, "counts": {"pcIntermittent": 20, "pcLowBleed": 10, "pneumaticPump": 0,
      "leakValve": 600, "leakConnector": 2500, "leakFlange": 800, "leakOEL": 30,
      "leakPRV": 25, "leakCompSeal": 6, "recipRodPacking": 24, "centrifWetSeal": 2},
      "tankOil_m3_y": 0, "blowdowns": [{"volM3": 150, "pKPa": 7000, "tK": 293, "n": 4}],
      "flareGas_kg_y": 0, "measured_t_y": 400, "ogmpLevel": 5, "gasThroughput_t_y": 8e6}),
    ("gwp20", "Default with AR6 20-year GWP", {"gwp": "AR6_20"}),
    ("ar5-halfyear", "AR5 100-year GWP, half-year operation", {"gwp": "AR5_100", "hours": 4380}),
    ("high-bleed", "25 high-bleed controllers, degraded flare DRE",
     {"counts": {"pcHighBleed": 25}, "flareDRE": 0.95}),
    ("pure-ch4", "Pure methane, no flaring or tanks",
     {"flareGas_kg_y": 0, "tankOil_m3_y": 0, "xCH4": 1.0}),
]


# ideal molar volumes, L/mol: EPA standard conditions 60 F = 288.705556 K, 14.696 psia = 101.32535 kPa;
# ISO 13443:1996 clause 3 standard reference conditions 288.15 K, 101.325 kPa
R = 8.314462618
VM_STD = R * ((60 - 32) * 5 / 9 + 273.15) / (14.696 * 6.894757293168)
VM_ISO = R * 288.15 / 101.325


def merge(over):
    inp = copy.deepcopy(DEFAULTS)
    for k, v in over.items():
        inp[k] = {**inp[k], **v} if k == "counts" else copy.deepcopy(v)
    return inp


def compute(i):
    cat = {"pneumatic": 0.0, "fugitive": 0.0, "compressor": 0.0}
    for dev, (ef, c) in EF.items():
        kg_h = ef * 0.0283168 * 1000 / VM_STD * i["xCH4"] * 16.043 / 1000
        cat[c] += kg_h * i["counts"].get(dev, 0) * i["hours"] / 1000
    tank = 0.25 * i["tankOil_m3_y"] / 1000
    venting = sum(b["pKPa"] * 1000 * b["volM3"] / (8.314462618 * b["tK"]) * i["xCH4"]
                  * 16.043 / 1000 * b["n"] / 1000 for b in i["blowdowns"])
    flaring = i["flareGas_kg_y"] * i["flareXCH4_mass"] * (1 - i["flareDRE"]) / 1000
    total = sum(cat.values()) + tank + venting + flaring
    m = i["measured_t_y"]
    reported = m if i["ogmpLevel"] == 5 and m is not None else total
    return {"total_t_y": total, "reported_t_y": reported,
            "co2e_t_y": reported * GWP[i["gwp"]],
            "intensity_pct": reported / i["gasThroughput_t_y"] * 100,
            "reported_m3_iso_y": reported * 1e6 / 16.043 * VM_ISO / 1000,
            **cat, "tank": tank, "venting": venting, "flaring": flaring}


# ISO 13443:1996 Annex B Eq. (B.1): V(ISO) = V(T2, p2) x 288.15 p2 / (101.325 T2); 1 scf at 60 F / 14.696 psia in m3 (ISO)
SCF_TO_M3_ISO = 0.0283168 * 288.15 * (14.696 * 6.894757293168) / (101.325 * ((60 - 32) * 5 / 9 + 273.15))


def check_scf_route(i, ref):
    # device part by the Eq. B.1 route (scf -> m3 ISO), independent of the mass -> R T / p route used for reported_m3_iso_y
    scf = sum(ef * i["counts"].get(dev, 0) * i["hours"] * i["xCH4"] for dev, (ef, c) in EF.items())
    dev_t = ref["pneumatic"] + ref["fugitive"] + ref["compressor"]
    v_mass = dev_t * 1e6 / 16.043 * VM_ISO / 1000
    v_scf = scf * SCF_TO_M3_ISO
    assert abs(v_scf - v_mass) <= 1e-9 * max(1.0, v_mass), (v_scf, v_mass)


def main():
    out = []
    assert abs(SCF_TO_M3_ISO - 0.0282625) < 2e-7, SCF_TO_M3_ISO
    for cid, note, over in CASES:
        inp = merge(over)
        check_scf_route(inp, compute(inp))
        out.append({"id": cid, "note": note, "inputs": inp, "ref": compute(inp)})
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "methane_emissions_ref.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(len(out))


if __name__ == "__main__":
    main()
