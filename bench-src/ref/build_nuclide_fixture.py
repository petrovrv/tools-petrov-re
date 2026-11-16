#!/usr/bin/env python3
"""
Build a TEST FIXTURE stand-in for nuclide-data.js, the data file that
nuclideatlas.html declares as a dependency but that is NOT present
in this tree.  Without it the page renders "nuclide-data.js is missing." and
nothing can be exercised.

Source: IAEA Live Chart of Nuclides, relnsd API,
        https://nds.iaea.org/relnsd/v1/data?fields=ground_states&nuclides=all
        (the CSV carries Extraction_date 2023-10-18, the same snapshot date the
        tool's manifest quotes for its bundled data, so the fixture reproduces
        the ground-state layer the deployed file was built from).

This file is a benchmark fixture only.  It is NOT deployed to site and it
does not claim to reproduce the deployed file's NDLab metastable, decay-gamma
or fission-yield overlays, which are absent here.

Daughter products are inferred from the compact decay-mode notation exactly the
way the tool documents that it does: no ENSDF level schemes are reconstructed,
and spontaneous fission is not expanded.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import csv, json, os, sys

SYM = {}          # Z -> symbol, filled from the table itself

# (dZ, dN) for every decay mode in the snapshot's vocabulary.
# Cluster emissions are handled separately from their (Z, A).
DELTA = {
 "B-":   (+1, -1),  "2B-":  (+2, -2),
 "EC":   (-1, +1),  "B+":   (-1, +1), "EC+B+": (-1, +1),
 "2EC":  (-2, +2),  "2B+":  (-2, +2),
 "A":    (-2, -2),
 "P":    (-1,  0),  "2P":   (-2,  0),
 "N":    ( 0, -1),  "2N":   ( 0, -2),
 "B-N":  (+1, -2),  "B-2N": (+1, -3), "B-3N": (+1, -4),
 "B-4N": (+1, -5),  "B-5N": (+1, -6), "B-6N": (+1, -7), "B-7N": (+1, -8),
 "B-P":  ( 0, -1),
 "B-A":  (-1, -3),
 "ECP":  (-2, +1),  "B+P":  (-2, +1),
 "EC2P": (-3, +1),  "B+2P": (-3, +1),
 "ECA":  (-3, -1),  "B+A":  (-3, -1),
 "IT":   ( 0,  0),
}
CLUSTER = {   # emitted nucleus -> (Z, A)
 "14C": (6, 14), "24NE": (10, 24), "22NE": (10, 22), "25NE": (10, 25),
 "28MG": (12, 28), "34SI": (14, 34), "20O": (8, 20), "23F": (9, 23),
 "30MG": (12, 30), "MG": (12, 24), "NE": (10, 24), "SI": (14, 34), "C": (6, 14),
}
# modes with no single daughter the tool would follow
NO_DAUGHTER = {"SF", "SF+EC+B+", "ECSF", "B-SF", "B+SF"}


def clean_mode(m):
    m = (m or "").strip()
    m = m.replace("{+", "").replace("}", "")
    return m


def daughter(z, n, mode):
    m = clean_mode(mode).upper()
    if not m or m in NO_DAUGHTER:
        return None
    if m in DELTA:
        dz, dn = DELTA[m]
        return (z+dz, n+dn)
    # cluster emission written either as "14C" or as "Ne"/"Mg"/"Si"
    key = m.replace("-", "")
    if key in CLUSTER:
        cz, ca = CLUSTER[key]
        return (z-cz, n-(ca-cz))
    return None


def num(x):
    x = (x or "").strip()
    if x == "":
        return None
    try:
        v = float(x)
    except ValueError:
        return None
    return v


def main(src, out):
    rows = list(csv.DictReader(open(src)))
    for r in rows:
        z = int(float(r["z"]))
        if r["symbol"] and z not in SYM:
            SYM[z] = r["symbol"].strip()
    byZN = {}
    for r in rows:
        z, n = int(float(r["z"])), int(float(r["n"]))
        byZN[(z, n)] = r

    def key_of(z, n):
        s = SYM.get(z)
        if not s:
            return None
        return "%s-%d" % (s[0].upper()+s[1:].lower(), z+n)

    records = []
    extraction = ""
    for r in rows:
        z, n = int(float(r["z"])), int(float(r["n"]))
        a = z+n
        sym = (r["symbol"] or "").strip()
        sym = sym[0].upper()+sym[1:].lower() if sym else "?"
        hl_txt = (r["half_life"] or "").strip()
        stable = hl_txt.upper() == "STABLE"
        hls = num(r["half_life_sec"])
        extraction = r.get("Extraction_date") or extraction
        decays = []
        for i in (1, 2, 3):
            mode = clean_mode(r["decay_%d" % i])
            if not mode:
                continue
            pct = num(r["decay_%d_%%" % i])
            d = daughter(z, n, mode)
            dk = None
            if d and d[0] >= 0 and d[1] >= 0 and d in byZN:
                dk = key_of(*d)
            if clean_mode(mode).upper() == "IT":
                dk = None          # ground-state-only fixture: IT has no target here
            decays.append({
                "mode": mode,
                "daughter": dk,
                "branch": (pct/100.0) if pct is not None else None,
                "branchQualified": pct is not None,
                "sourcePercent": pct,
            })
        am = num(r["atomic_mass"])
        rec = {
            "key": "%s-%d" % (sym, a), "Z": z, "N": n, "A": a, "symbol": sym,
            "stable": stable,
            "halfLife": None if stable else num(r["half_life"]),
            "halfLifeUnit": None if stable else ((r["unit_hl"] or "").strip() or None),
            "halfLifeSec": None if stable else hls,
            "halfLifeUncertaintySec": num(r["unc_hls"]),
            "spinParity": (r["jp"] or "").strip() or None,
            "abundance": num(r["abundance"]),
            "atomicMassU": (am/1e6) if am is not None else None,
            "massExcessKeV": num(r["massexcess"]),
            "bindingKeVPerNucleon": num(r["binding"]),
            "QbetaMinusKeV": num(r["qbm"]),
            "QalphaKeV": num(r["qa"]),
            "SnKeV": num(r["sn"]),
            "SpKeV": num(r["sp"]),
            "state": "gs", "stateKind": None,
            "dataProvenance": "IAEA LiveChart ground_states (fixture)",
            "tags": [],
            "decays": decays,
        }
        records.append(rec)

    data = {
        "source": {"name": "IAEA Live Chart of Nuclides — ground states "
                           "(BENCHMARK FIXTURE, not the deployed data file)",
                   "extracted": extraction,
                   "url": "https://nds.iaea.org/relnsd/v1/data?fields=ground_states&nuclides=all"},
        "magicNumbers": [2, 8, 20, 28, 50, 82, 126],
        "records": records,
        "metastables": [],
        "qa": {"qualifiedGroundStateBranchSets":
               sum(1 for r in records
                   if r["decays"] and all(d["branchQualified"] for d in r["decays"])),
               "missingPercentGroundStateBranchSets":
               sum(1 for r in records
                   if r["decays"] and not all(d["branchQualified"] for d in r["decays"])),
               "inconsistentGroundStateBranchSets": 0},
    }
    with open(out, "w") as fh:
        fh.write("/* BENCHMARK FIXTURE — reconstructed from the IAEA Live Chart API.\n"
                 "   Not the deployed nuclide-data.js; no metastable, gamma or fission overlay. */\n")
        fh.write("window.NUCLIDE_DATA=")
        json.dump(data, fh, separators=(",", ":"))
        fh.write(";\n")
    nd = sum(1 for r in records for d in r["decays"] if d["daughter"])
    print("records %d, stable %d, decay edges with a daughter %d, orphan modes %d"
          % (len(records), sum(1 for r in records if r["stable"]), nd,
             sum(1 for r in records for d in r["decays"] if not d["daughter"])))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
