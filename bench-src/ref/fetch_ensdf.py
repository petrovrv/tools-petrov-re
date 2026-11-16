#!/usr/bin/env python3
"""Fetch half-lives, decay modes/branchings and mean beta/gamma energies per
decay from the IAEA Live Chart of Nuclides (relnsd API, ENSDF-derived) and
cache them in decayheat_ensdf.json."""
import csv, io, json, os, sys, time, urllib.request

BASE = "https://nds.iaea.org/relnsd/v1/data?"
HDR  = {"User-Agent": "Mozilla/5.0 (benchmark harness)"}

NUCS = ["137cs","90sr","90y","144ce","144pr","106ru","106rh","134cs",
        "154eu","155eu","125sb","85kr","3h","14c","99tc","129i","60co","63ni",
        "241pu","241am","237np","233pa","242cm","244cm","238pu","239pu","240pu",
        "234u","235u","238u","243am","239np","147pm","151sm","95zr","95nb",
        "239u","138cs","142la","140la","135i","132i","133i","92y","97nb","92sr",
        "97zr","91sr","156eu","103ru","91y","140ba","89sr","143pr","141ce","131i",
        "137ba","134i","136cs","93zr","79se","126sn","94nb","242am","245cm",
        "246cm","243cm","236u","232u","233u","231pa","230th","229th","226ra"]

def get(q):
    for attempt in range(4):
        try:
            r = urllib.request.Request(BASE+q, headers=HDR)
            with urllib.request.urlopen(r, timeout=90) as fh:
                return fh.read().decode("utf-8", "replace")
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(3)

def rows(txt):
    if not txt or txt.strip() in ("", "[]"):
        return []
    rd = csv.DictReader(io.StringIO(txt))
    return [r for r in rd if any(v for v in r.values())]

def num(x):
    try:
        return float(x)
    except Exception:
        return None

def main():
    out = {}
    for nu in NUCS:
        rec = {}
        gs = rows(get("fields=ground_states&nuclides="+nu))
        if not gs:
            print("no ground state for", nu); continue
        g = gs[0]
        rec["half_life_s"] = num(g.get("half_life_sec"))
        rec["unc_half_life_s"] = num(g.get("unc_hls"))
        rec["decays"] = []
        for k in (1, 2, 3):
            d = g.get("decay_%d" % k)
            p = num(g.get("decay_%d_%%" % k))
            if d and p is not None:
                rec["decays"].append([d.strip(), p])
        rec["symbol"] = g.get("symbol"); rec["z"] = num(g.get("z")); rec["n"] = num(g.get("n"))
        rec["qbm_keV"] = num(g.get("qbm")); rec["qa_keV"] = num(g.get("qa")); rec["qec_keV"] = num(g.get("qec"))
        rec["A"] = (num(g.get("z")) or 0) + (num(g.get("n")) or 0)
        rec["energy_keV"] = num(g.get("energy"))
        # mean beta energy per decay (sum over beta- branches of the parent g.s.)
        for rt, key in (("bm", "mean_beta_minus_MeV"), ("bp", "mean_beta_plus_MeV")):
            rr = rows(get("fields=decay_rads&nuclides=%s&rad_types=%s" % (nu, rt)))
            s = 0.0; got = False
            for r in rr:
                if num(r.get("p_energy")) not in (0.0, None):
                    continue                      # only decays of the selected level
                e = num(r.get("mean_energy")); i = num(r.get("intensity_beta"))
                if e is None or i is None:
                    continue
                s += e*i/100.0; got = True
            rec[key] = s/1000.0 if got else 0.0
            if rt == "bm":
                sn = 0.0; itot = 0.0
                for r in rr:
                    if num(r.get("p_energy")) not in (0.0, None):
                        continue
                    en = num(r.get("anti_nu_mean_energy")); i = num(r.get("intensity_beta"))
                    if en is None or i is None:
                        continue
                    sn += en*i/100.0; itot += i/100.0
                rec["mean_antinu_MeV"] = sn/1000.0
                rec["beta_intensity_total"] = itot
        # mean gamma energy per decay and photons per decay (gammas + x-rays)
        for rt, ek, ik, gk, pk in (("g", "energy", "intensity", "mean_gamma_MeV", "gamma_per_decay"),
                                   ("x", "energy", "intensity", "mean_xray_MeV", "xray_per_decay")):
            rr = rows(get("fields=decay_rads&nuclides=%s&rad_types=%s" % (nu, rt)))
            s = 0.0; nph = 0.0; got = False
            for r in rr:
                if num(r.get("p_energy")) not in (0.0, None):
                    continue
                e = num(r.get(ek)); i = num(r.get(ik))
                if e is None or i is None:
                    continue
                s += e*i/100.0/1000.0; nph += i/100.0; got = True
            rec[gk] = s if got else 0.0
            rec[pk] = nph if got else 0.0
        # conversion / Auger electrons per decay
        rr = rows(get("fields=decay_rads&nuclides=%s&rad_types=e" % nu))
        s = 0.0
        for r in rr:
            if num(r.get("p_energy")) not in (0.0, None):
                continue
            e = num(r.get("energy")); i = num(r.get("intensity"))
            if e is None or i is None:
                continue
            s += e*i/100.0/1000.0
        rec["mean_electron_MeV"] = s
        # mean alpha energy per decay
        rr = rows(get("fields=decay_rads&nuclides=%s&rad_types=a" % nu))
        s = 0.0
        for r in rr:
            if num(r.get("p_energy")) not in (0.0, None):
                continue
            e = num(r.get("energy")); i = num(r.get("intensity"))
            if e is None or i is None:
                continue
            s += e*i/100.0/1000.0
        rec["mean_alpha_MeV"] = s
        out[nu] = rec
        print("%-8s T=%.5g s  b-=%.4f  g=%.4f (%.3f ph)  a=%.4f  decays=%s" %
              (nu, rec["half_life_s"] or float('nan'), rec["mean_beta_minus_MeV"],
               rec["mean_gamma_MeV"], rec["gamma_per_decay"], rec["mean_alpha_MeV"],
               rec["decays"]))
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "decayheat_ensdf.json"), "w") as fh:
        json.dump(out, fh, indent=1)

if __name__ == "__main__":
    main()
