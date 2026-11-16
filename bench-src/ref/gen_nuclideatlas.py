#!/usr/bin/env python3
"""
Independent reference generator for nuclideatlas.html ("nuclideatlas").

The tool declares nuclide-data.js as a dependency and that file is NOT in this
tree, so the page renders "nuclide-data.js is missing." and nothing runs.  The
benchmark therefore drives the page against a reconstructed ground-state
fixture (see build_nuclide_fixture.py), served from a temporary overlay
directory; site is not modified and the deployed data file is not
touched.  What this benchmark tests is the tool's MATHEMATICS, not the deployed
data.

References, all implemented here and independent of the tool's code:

 1. Generalised Bateman solution for branching decay networks, as a sum over
    simple paths, evaluated in 60-digit arithmetic (mpmath).  Cross-checked
    against mpmath's matrix exponential of the same generator at the same
    precision - two structurally different algorithms.  The tool uses a 48th
    order Chebyshev Rational Approximation (CRAM48) in float64.
       H. Bateman, Proc. Cambridge Philos. Soc. 15 (1910) 423.
       M. Pusa, Nucl. Sci. Eng. 182 (2016) 297 (CRAM, for reference only).
 2. Closed-form one-step activation with target burn-up:
       N_t(t) = N0 exp(-(sigma phi + lambda_t) t)
       N_p(t) = sigma phi N0 exp(-lambda_p t) (1 - exp(-d t)) / d,  d = sigma phi + lambda_t - lambda_p
    and N_p(t) -> sigma phi N0 t exp(-lambda_p t) as d -> 0.
 3. Secular and transient equilibrium limits of a two-member chain:
       A_d / A_p -> lambda_d / (lambda_d - lambda_p)
 4. Constant-source accumulation: N(t) = S/lambda (1 - exp(-lambda t)).
 5. Atom conservation: the sum of all members of a closed network is invariant.

Nuclear data (half-lives, decay modes, branching ratios, atomic masses) come
from the IAEA Live Chart of Nuclides / ENSDF snapshot the fixture was built
from, and are quoted per case.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math, os, sys
import mpmath as mp

mp.mp.dps = 60
NA = mp.mpf("6.02214076e23")


def load_fixture(path):
    txt = open(path).read()
    i = txt.index("window.NUCLIDE_DATA=")
    j = txt.rindex(";")
    return json.loads(txt[i+len("window.NUCLIDE_DATA="):j])


def build_network(byKey, roots, depth=64, cut=0.0):
    """Exactly the traversal the tool documents: breadth-first over decay
    daughters that exist in the library and carry a non-zero branch."""
    keys, seen, q = [], set(), [(k, 0) for k in roots]
    while q:
        k, d = q.pop(0)
        if k in seen or k not in byKey:
            continue
        seen.add(k); keys.append(k)
        r = byKey[k]
        if d >= depth:
            continue
        for e in r["decays"]:
            dk = e.get("daughter")
            if dk and dk in byKey and e.get("branch") not in (None, 0) and e["branch"] > cut:
                q.append((dk, d+1))
    idx = {k: i for i, k in enumerate(keys)}
    n = len(keys)
    A = mp.zeros(n, n)
    lam = []
    renorm = {}
    for i, k in enumerate(keys):
        r = byKey[k]
        hl = r["halfLifeSec"]
        l = mp.mpf(0) if (r["stable"] or not hl or hl <= 0) else mp.log(2)/mp.mpf(repr(hl))
        lam.append(l)
        A[i, i] -= l
        if l == 0:
            continue
        # Branching fractions are exclusive probabilities and must sum to one.
        # Evaluated files routinely list a dominant mode at 100 % plus a rare mode
        # at its own percentage, so the raw set sums to slightly more than one;
        # taken literally that creates atoms.  Sets within 2 % of unity are
        # renormalised here, which is the physically correct reading and is
        # independent of what any particular tool does.
        bsum = sum(mp.mpf(repr(e["branch"])) for e in r["decays"]
                   if e.get("branch") not in (None,) and e["branch"] > 0)
        norm = bsum if (bsum > 0 and abs(bsum-1) <= mp.mpf("0.02")) else mp.mpf(1)
        if norm != 1:
            renorm[k] = float(bsum)
        for e in r["decays"]:
            b = e.get("branch")
            if b is None or b <= 0:
                continue
            j = idx.get(e.get("daughter"))
            if j is not None:
                A[j, i] += l*mp.mpf(repr(b))/norm
    return keys, idx, A, lam, renorm


def path_sum(keys, idx, A, lam, N0, t):
    """Generalised Bateman: sum over every simple path of the branch-weighted
    product times the Bateman exponential kernel."""
    n = len(keys)
    adj = {}
    for i in range(n):
        for j in range(n):
            if i != j and A[j, i] != 0:
                adj.setdefault(i, []).append((j, A[j, i]))
    out = [mp.mpf(0)]*n
    tt = mp.mpf(repr(t))

    def kernel(nodes):
        mus = [lam[x] for x in nodes]
        if len(nodes) == 1:
            return mp.e**(-mus[0]*tt)
        acc = mp.mpf(0)
        for i in range(len(nodes)):
            den = mp.mpf(1)
            for m in range(len(nodes)):
                if m != i:
                    den *= (mus[m]-mus[i])
            acc += mp.e**(-mus[i]*tt)/den
        return acc

    def walk(start, node, nodes, prod):
        out[node] += mp.mpf(repr(N0[start]))*prod*kernel(nodes)
        for (j, rate) in adj.get(node, []):
            if j in nodes:
                continue
            walk(start, j, nodes+[j], prod*rate)

    for s in range(n):
        if N0[s]:
            walk(s, s, [s], mp.mpf(1))
    return out


def expm_ref(A, N0, t):
    n = A.rows
    M = mp.expm(A*mp.mpf(repr(t)))
    v = mp.matrix(n, 1)
    for i in range(n):
        v[i] = mp.mpf(repr(N0[i]))
    r = M*v
    return [r[i] for i in range(n)]


def augment_source(A, S):
    n = A.rows
    B = mp.zeros(n+1, n+1)
    for i in range(n):
        for j in range(n):
            B[i, j] = A[i, j]
        B[i, n] = mp.mpf(repr(S[i]))
    return B


def activation(N0, sigma_b, phi, lam_t, lam_p, t_irr, t_cool):
    sigma = mp.mpf(repr(sigma_b))*mp.mpf("1e-24")
    cap = mp.mpf(repr(phi))*sigma
    loss = cap + lam_t
    d = loss - lam_p
    x = mp.mpf(repr(t_irr))
    if cap == 0 or N0 == 0 or x <= 0:
        Np = mp.mpf(0)
    elif d == 0:
        Np = cap*N0*x*mp.e**(-lam_p*x)
    else:
        Np = cap*N0*mp.e**(-lam_p*x)*(1 - mp.e**(-d*x))/d
    Npc = Np*mp.e**(-lam_p*mp.mpf(repr(t_cool)))
    return Np, Npc, Np*lam_p, Npc*lam_p


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    fx = load_fixture(os.path.join(here, "..", "fixtures", "nuclide-data.FIXTURE.js"))
    byKey = {r["key"]: r for r in fx["records"]}

    CHAINS = [
      # id, roots, initial atoms, source atoms/s, times [s]
      ("sr90",  {"Sr-90": 1e20}, {}, [1e3, 1e5, 8.64e4*30, 3.15576e8, 3.15576e9, 3.15576e10]),
      ("ba140", {"Ba-140": 1e18}, {}, [1e4, 1e5, 8.64e5, 8.64e6, 3.0e7]),
      ("cs137", {"Cs-137": 1e22}, {}, [1e6, 3.15576e8, 9.4923e8, 3.15576e9, 3.15576e10]),
      ("mo99",  {"Mo-99": 1e18}, {}, [1e4, 1e5, 2.4e5, 1e6, 1e7]),
      ("th228", {"Th-228": 1e18}, {}, [1e4, 1e6, 1e7, 6.0e7, 6.0e8]),
      ("co60src", {}, {"Co-60": 1e12}, [1e5, 1e7, 1.66344e8, 1e9, 5e9]),
      ("sr90src", {"Sr-90": 1e18}, {"Sr-90": 1e10}, [1e6, 1e8, 1e9, 1e10]),
    ]
    out = {"citations": [
      "H. Bateman, 'The solution of a system of differential equations occurring in the "
      "theory of radioactive transformations', Proc. Cambridge Philos. Soc. 15 (1910) 423.",
      "M. Pusa, 'Higher-Order Chebyshev Rational Approximation Method and Application to "
      "Burnup Equations', Nucl. Sci. Eng. 182 (2016) 297 - the method the tool implements.",
      "IAEA Live Chart of Nuclides / ENSDF, relnsd API, ground-state snapshot "
      "(Extraction_date " + str(fx["source"].get("extracted")) + "), used both to rebuild the "
      "missing data file and as the source of every half-life and branching ratio quoted here.",
      "K. Way and E. P. Wigner / standard secular-equilibrium algebra: A_d/A_p -> "
      "lambda_d/(lambda_d - lambda_p).",
    ], "fixture_source": fx["source"], "chains": [], "activation": [], "equilibrium": []}

    for cid, init, src, times in CHAINS:
        roots = sorted(set(list(init) + list(src)))
        keys, idx, A, lam, renorm = build_network(byKey, roots)
        n = len(keys)
        N0 = [0.0]*n
        for k, v in init.items():
            N0[idx[k]] = v
        S = [0.0]*n
        for k, v in src.items():
            S[idx[k]] = v
        has_src = any(S)
        Aug = augment_source(A, S) if has_src else A
        pts = []
        for t in times:
            if has_src:
                v = expm_ref(Aug, N0 + [1.0], t)[:n]
                cross = None
            else:
                v = expm_ref(A, N0, t)
                ps = path_sum(keys, idx, A, lam, N0, t)
                cross = 0.0
                for a, b in zip(v, ps):
                    if abs(a) > mp.mpf(10)**-40*max(N0):
                        cross = max(cross, float(abs(a-b)/abs(a)))
            pts.append({"t_s": t, "N": [float(x) for x in v], "crosscheck_rel": cross,
                        "sum_atoms": float(sum(v))})
        out["chains"].append({
            "id": cid, "keys": keys, "N0": N0, "S": S,
            "half_lives_s": [byKey[k]["halfLifeSec"] for k in keys],
            "branches": {k: [[e["mode"], e.get("daughter"), e.get("branch")]
                             for e in byKey[k]["decays"]] for k in keys},
            "points": pts,
            "renormalised_branch_sets": renorm,
            "conserved": not has_src and all(
                (byKey[k]["stable"] or
                 all(e.get("daughter") in idx for e in byKey[k]["decays"] if (e.get("branch") or 0) > 0))
                for k in keys),
        })

    ACT = [
      # id, target, product, mass g, flux, sigma b, irradiation h, cooling d
      ("co59", "Co-59", "Co-60", 1.0, 1e13, 37.0, 24.0, 30.0),
      ("co59-long", "Co-59", "Co-60", 1.0, 1e14, 37.0, 8760.0, 0.0),
      ("co59-sat", "Co-59", "Co-60", 2.5, 5e14, 37.0, 87600.0, 365.0),
      ("na23", "Na-23", "Na-24", 0.5, 1e13, 0.53, 6.0, 1.0),
      ("au197", "Au-197", "Au-198", 0.1, 1e12, 98.7, 48.0, 7.0),
      ("zero-flux", "Co-59", "Co-60", 1.0, 0.0, 37.0, 24.0, 30.0),
      ("mo98", "Mo-98", "Mo-99", 1.0, 1e14, 0.13, 168.0, 2.0),
    ]
    for cid, tk, pk, mass, phi, sig, irr_h, cool_d in ACT:
        t, p = byKey[tk], byKey[pk]
        N0 = mp.mpf(repr(mass))/mp.mpf(repr(t["atomicMassU"]))*NA
        lt = mp.mpf(0) if (t["stable"] or not t["halfLifeSec"]) else mp.log(2)/mp.mpf(repr(t["halfLifeSec"]))
        lp = mp.mpf(0) if (p["stable"] or not p["halfLifeSec"]) else mp.log(2)/mp.mpf(repr(p["halfLifeSec"]))
        Np, Npc, Aeoi, Aeoc = activation(N0, sig, phi, lt, lp, irr_h*3600.0, cool_d*86400.0)
        out["activation"].append({
          "id": cid, "target": tk, "product": pk, "mass_g": mass, "flux": phi,
          "sigma_b": sig, "irr_h": irr_h, "cool_d": cool_d,
          "target_atomic_mass_u": t["atomicMassU"],
          "target_half_life_s": t["halfLifeSec"], "product_half_life_s": p["halfLifeSec"],
          "N0_atoms": float(N0), "atoms_eoi": float(Np), "atoms_eoc": float(Npc),
          "activity_eoi_Bq": float(Aeoi), "activity_eoc_Bq": float(Aeoc)})

    # equilibrium limits
    for cid, pk, dk in [("secular-sr90", "Sr-90", "Y-90"),
                        ("transient-ba140", "Ba-140", "La-140"),
                        ("secular-th228", "Th-228", "Ra-224")]:
        lp = math.log(2)/byKey[pk]["halfLifeSec"]
        ld = math.log(2)/byKey[dk]["halfLifeSec"]
        out["equilibrium"].append({
          "id": cid, "parent": pk, "daughter": dk,
          "parent_half_life_s": byKey[pk]["halfLifeSec"],
          "daughter_half_life_s": byKey[dk]["halfLifeSec"],
          "activity_ratio_limit": ld/(ld-lp),
          "kind": "secular" if ld/(ld-lp) < 1.02 else "transient"})

    json.dump(out, open(os.path.join(here, "nuclideatlas_ref.json"), "w"), indent=1)
    worst = max((p["crosscheck_rel"] or 0) for c in out["chains"] for p in c["points"])
    print("chains %d, activation %d, equilibrium %d" %
          (len(out["chains"]), len(out["activation"]), len(out["equilibrium"])))
    print("path-sum vs mpmath.expm worst relative deviation: %.3e" % worst)
    for c in out["chains"]:
        print("  %-9s %2d nuclides  conserved=%s  %s" %
              (c["id"], len(c["keys"]), c["conserved"], ",".join(c["keys"][:8])))
    for e in out["equilibrium"]:
        print("  %-16s A_d/A_p -> %.6f (%s)" % (e["id"], e["activity_ratio_limit"], e["kind"]))


if __name__ == "__main__":
    main()
