#!/usr/bin/env python3
"""Independent reference corpus generator for the economics layer of a CCUS cost tool.

Implemented from textbook project-finance definitions (real terms, EUR), stdlib only.
Writes ccuscost_ref.json next to this script.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_ccuscost_solve import CASES as SOLVE_CASES  # noqa: E402

LO_R, HI_R, TOL = -0.99, 1.0, 1e-13


def crf(r, n):
    return 1.0 / n if r == 0 else r / (1.0 - (1.0 + r) ** -n)


def interp(path, year):
    pts = sorted(path)
    if year <= pts[0][0]:
        return float(pts[0][1])
    if year >= pts[-1][0]:
        return float(pts[-1][1])
    for (y0, p0), (y1, p1) in zip(pts, pts[1:]):
        if y0 <= year <= y1:
            return p0 + (p1 - p0) * (year - y0) / (y1 - y0)


def npv(nets, r):
    return sum(n / (1.0 + r) ** t for t, n in enumerate(nets))


def irr(nets):
    lo, hi = LO_R, HI_R
    flo, fhi = npv(nets, lo), npv(nets, hi)
    if flo == 0:
        return lo
    if fhi == 0:
        return hi
    if (flo > 0) == (fhi > 0):
        return None
    while hi - lo > TOL:
        mid = 0.5 * (lo + hi)
        fm = npv(nets, mid)
        if fm == 0:
            return mid
        if (fm < 0) == (flo < 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return 0.5 * (lo + hi)


def payback(nets, B):
    cum = 0.0
    for t, n in enumerate(nets):
        before = cum
        cum += n
        if t >= B and before < 0 and cum >= 0:
            return (t - B) + (-before) / n
    return None


def evaluate(p):
    B, L, r = p["build_years"], p["life"], p["disc"]
    assert len(p["spend"]) == B and abs(sum(p["spend"]) - 1.0) < 1e-12
    assert p["t_avoided"] <= p["t_stored"]
    nets, costs, ts, ta, tr = [], [], [], [], []
    for t in range(B + L):
        year = p["cod"] - B + t
        if t < B:
            cx = p["capex"] * p["spend"][t]
            g = p["grant_frac"] * cx
            nets.append(-cx + g)
            costs.append(cx - g)
            ts.append(0.0); ta.append(0.0); tr.append(0.0)
            continue
        k = t - B + 1
        price = interp(p["price_path"], year)
        c = p["opex_fixed"] + p["opex_var"] + p["ts_cost"]
        rev = p["t_avoided"] * price if p["ets"] else 0.0
        cf = p["ccfd"]
        if cf is not None and k <= cf["years"]:
            rev += cf["share"] * p["t_avoided"] * (cf["strike"] - price)
        rev += p["t_removed"] * p["removal_price"]
        nets.append(rev - c)
        costs.append(c)
        ts.append(p["t_stored"]); ta.append(p["t_avoided_total"]); tr.append(p["t_removed"])
    pv_cost = npv(costs, r)
    disc_nets = [n / (1.0 + r) ** t for t, n in enumerate(nets)]
    return {
        "npv": npv(nets, r),
        "irr": irr(nets),
        "payback": payback(nets, B),
        "disc_payback": payback(disc_nets, B),
        "lcoc_stored": pv_cost / npv(ts, r),
        "lcoc_avoided": pv_cost / npv(ta, r),
        "lcoc_removed": pv_cost / npv(tr, r) if p["t_removed"] > 0 else None,
    }


CENTRAL = [[2030, 145], [2040, 220], [2050, 300]]
BASE = dict(cod=2030, build_years=3, spend=[0.3, 0.4, 0.3], capex=400e6, grant_frac=0.0,
            life=25, disc=0.08, t_stored=1.0e6, t_avoided=0.9e6, t_avoided_total=0.9e6,
            t_removed=0.0, t_bio=0.0, opex_fixed=16e6, opex_var=30e6, ts_cost=35e6,
            price_path=CENTRAL, ets=True, removal_price=0.0, fa_mode="none", ccfd=None)

AMMONIA = dict(build_years=2, spend=[0.5, 0.5], capex=120e6, t_stored=0.5e6, t_avoided=0.48e6,
               t_avoided_total=0.48e6, opex_fixed=1.5e6, opex_var=3e6, ts_cost=15e6)

CASES = [
    ("cement_central", "Cement 1 Mt/y, 400 MEUR, B=3, L=25, r=8%, central ETS path", {}),
    ("ammonia_fast", "High-purity ammonia CO2, low capex, fast payback", AMMONIA),
    ("never_payback", "Low ETS path, high opex: cumulative never turns positive",
     dict(price_path=[[2030, 60], [2050, 80]], opex_var=45e6)),
    ("ets_off", "Cement, no ETS revenue: pure cost, no payback, IRR None", dict(ets=False)),
    ("ccfd_180_grant30", "Cement, two-sided CCfD strike 180 for 15 y + 30% capex grant",
     dict(grant_frac=0.3, ccfd={"strike": 180.0, "years": 15, "share": 1.0})),
    ("ccfd_strike_below", "CCfD strike 120 below market price: payback to state for 20 y",
     dict(ccfd={"strike": 120.0, "years": 20, "share": 1.0})),
    ("beccs_removal", "BECCS CHP, t_removed>0, removal credits 150 EUR/t",
     dict(capex=350e6, t_stored=0.8e6, t_bio=0.65e6, t_removed=0.6e6, t_avoided=0.15e6,
          t_avoided_total=0.75e6, ts_cost=28e6, opex_var=25e6, removal_price=150.0)),
    ("build_1y", "Cement, single construction year", dict(build_years=1, spend=[1.0])),
    ("build_4y", "Cement, four construction years, uniform spend",
     dict(build_years=4, spend=[0.25] * 4)),
    ("disc_zero", "Cement, r=0 (undiscounted NPV/LCOC, payback == disc_payback)", dict(disc=0.0)),
    ("disc_12", "Cement, r=12%", dict(disc=0.12)),
    ("custom_path_early_cod", "4-point custom path, COD 2028 before first point (flat start)",
     dict(cod=2028, price_path=[[2030, 100], [2035, 160], [2040, 200], [2045, 250]])),
    ("life_15", "Cement, 15-year operating life", dict(life=15)),
    ("payback_first_year", "Ammonia, 30 MEUR, B=1: payback within first operating year",
     dict(AMMONIA, build_years=1, spend=[1.0], capex=30e6)),
]

CRF_CASES = [("crf_8_25", "r=8%, n=25", 0.08, 25), ("crf_0_20", "r=0 -> 1/n", 0.0, 20),
             ("crf_12_15", "r=12%, n=15", 0.12, 15), ("crf_5_1", "n=1 -> 1+r", 0.05, 1)]


def fmt(x, spec):
    return "None" if x is None else format(x, spec)


def main():
    corpus = []
    for cid, note, over in CASES:
        inp = dict(BASE)
        inp.update(over)
        corpus.append({"id": cid, "kind": "cashflow", "note": note, "inputs": inp,
                       "ref": evaluate(inp)})
    for cid, note, r, n in CRF_CASES:
        corpus.append({"id": cid, "kind": "crf", "note": note, "inputs": {"r": r, "n": n},
                       "ref": {"crf": crf(r, n)}})
    corpus.extend(SOLVE_CASES)
    pfy = next(c for c in corpus if c["id"] == "payback_first_year")["ref"]["payback"]
    if pfy is None or pfy >= 1.0:
        raise SystemExit("payback_first_year case does not pay back within year 1")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ccuscost_ref.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(corpus, f, indent=2)
    print(f"{len(corpus)} cases -> {out}")
    for c in corpus:
        ref = c["ref"]
        if c["kind"] == "solve":
            print(f"  {c['id']:<24} {ref['method']:<6} lcoc_simple={ref['lcoc_simple']:.3f}"
                  f"  metric_t={ref['metric_t']:.1f}  cpa={fmt(ref['cost_per_t_avoided'], '.3f')}")
        elif c["kind"] == "crf":
            print(f"  {c['id']:<24} crf={ref['crf']:.10f}")
        else:
            print(f"  {c['id']:<24} npv={ref['npv'] / 1e6:10.2f} MEUR  irr={fmt(ref['irr'], '.6f')}"
                  f"  pb={fmt(ref['payback'], '.4f')}  dpb={fmt(ref['disc_payback'], '.4f')}"
                  f"  lcoc_s={ref['lcoc_stored']:.2f}  lcoc_a={ref['lcoc_avoided']:.2f}"
                  f"  lcoc_r={fmt(ref['lcoc_removed'], '.2f')}")


if __name__ == "__main__":
    main()
