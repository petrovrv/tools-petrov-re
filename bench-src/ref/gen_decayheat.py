#!/usr/bin/env python3
"""
Independent reference generator for decayheat.html  (tool id "decayheat").

Everything written here is computed from published data or from closed-form
mathematics implemented in this file; none of it is taken from the tool.

REFERENCE 1 -- ANSI/ANS-5.1-1979, "Decay Heat Power in Light Water Reactors",
   Table 1 (thermal fission of U-235), Table 2 (thermal fission of Pu-239),
   Table 3 (fast fission of U-238): 23-term exponential fits of the
   fission-product decay-heat shape function.  Transcribed from Westinghouse
   WCAP-16009-NP-A Tables 8-1 (NRC ADAMS accession ML050910161), which
   reproduces the 1979 standard verbatim.
        f(t, T) = SUM_i (alpha_i/lambda_i) exp(-lambda_i t) [1 - exp(-lambda_i T)]
   [MeV per fission] for constant fission rate over T seconds and t seconds of
   cooling.  Decay power  P_d = R f(t,T) * 1.602176634e-13 W,  R = fission rate.
   Sanity check of the transcription: SUM alpha_i/lambda_i is the total
   fission-product decay energy per fission and must come out near the
   independently known 13.2 / 10.9 / 16.2 MeV for U-235 / Pu-239 / U-238.

REFERENCE 2 -- Way & Wigner, Phys. Rev. 73 (1948) 1318:
   P/P0 = 0.0622 (t^-0.2 - (t+T)^-0.2).  Order-of-magnitude cross-check only;
   its own scatter against the standard is recorded, not graded.

REFERENCE 3 -- Bateman equations for branching decay chains.  Two structurally
   different implementations, both written here:
      (a) generalised path-sum Bateman in 50-digit arithmetic (mpmath);
      (b) matrix exponential of the same transition matrix (scipy.linalg.expm).
   Their mutual deviation is recorded as the crosscheck.

REFERENCE 4 -- IAEA Nuclear Data Section, S. Simakov, M. Verpelli, N. Otsuka,
   "Update of the nuclear data for the neutron emissions for actinides of
   interest in safeguards" (2015-03-13), Table 1: spontaneous-fission neutron
   yields in n/(s g) with 1 sigma uncertainties.

REFERENCE 5 -- IAEA Live Chart of Nuclides (relnsd API) / ENSDF: half-lives,
   decay modes and branching ratios, Q values, mean beta / anti-neutrino /
   gamma / X-ray / conversion-electron / alpha energies per decay.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math, os

MEV_J = 1.602176634e-13
NA    = 6.02214076e23
YR    = 3.15576e7

# ----------------------------------------------------------- ANSI/ANS-5.1-1979
ANS = {
 "U235": [
  (6.5057e-01, 2.2138e+01), (5.1264e-01, 5.1587e-01), (2.4384e-01, 1.9594e-01),
  (1.3850e-01, 1.0314e-01), (5.5440e-02, 3.3656e-02), (2.2225e-02, 1.1681e-02),
  (3.3088e-03, 3.5870e-03), (9.3015e-04, 1.3930e-03), (8.0943e-04, 6.2630e-04),
  (1.9567e-04, 1.8906e-04), (3.2535e-05, 5.4988e-05), (7.5595e-06, 2.0958e-05),
  (2.5232e-06, 1.0010e-05), (4.9948e-07, 2.5438e-06), (1.8531e-07, 6.6361e-07),
  (2.6608e-08, 1.2290e-07), (2.2398e-09, 2.7213e-08), (8.1641e-12, 4.3714e-09),
  (8.7797e-11, 7.5780e-10), (2.5131e-14, 2.4786e-10), (3.2176e-16, 2.2384e-13),
  (4.5038e-17, 2.4600e-14), (7.4791e-17, 1.5699e-14)],
 "Pu239": [
  (2.0830e-01, 1.0020e+01), (3.8530e-01, 6.4330e-01), (2.2130e-01, 2.1860e-01),
  (9.4600e-02, 1.0040e-01), (3.5310e-02, 3.7280e-02), (2.2920e-02, 1.4350e-02),
  (3.9460e-03, 4.5490e-03), (1.3170e-03, 1.3280e-03), (7.0520e-04, 5.3560e-04),
  (1.4320e-04, 1.7300e-04), (1.7650e-05, 4.8810e-05), (7.3470e-06, 2.0060e-05),
  (1.7470e-06, 8.3199e-06), (5.4810e-07, 2.3580e-06), (1.6710e-07, 6.4500e-07),
  (2.1122e-08, 1.2780e-07), (2.9960e-09, 2.4660e-08), (5.7030e-11, 9.3780e-09),
  (5.7030e-11, 7.4500e-10), (4.1380e-14, 2.4260e-10), (1.0880e-15, 2.2100e-13),
  (2.4540e-17, 2.6400e-14), (7.5570e-17, 1.3800e-14)],
 "U238": [
  (1.2311e+00, 3.2881e+00), (1.1486e+00, 9.3805e-01), (7.0701e-01, 3.7073e-01),
  (2.5209e-01, 1.1118e-01), (7.1870e-02, 3.6143e-02), (2.8291e-02, 1.3272e-02),
  (6.8382e-03, 5.0133e-03), (1.2322e-03, 1.3655e-03), (6.8409e-04, 5.5158e-04),
  (1.6975e-04, 1.7873e-04), (2.4182e-05, 4.9032e-05), (6.6356e-06, 1.7058e-05),
  (1.0075e-06, 7.0465e-06), (4.9894e-07, 2.3190e-06), (1.6352e-07, 6.4480e-07),
  (2.3355e-08, 1.2649e-07), (2.8094e-09, 2.5548e-08), (3.6236e-11, 8.4782e-09),
  (5.7030e-11, 7.5130e-10), (4.4963e-14, 2.4188e-10), (3.6654e-16, 2.2739e-13),
  (5.6293e-17, 9.0536e-14), (7.1602e-17, 5.6098e-15)],
}
# recoverable energy per fission used to turn operating power into a fission
# rate.  These are the values the tool itself declares (E_FISSION), quoted here
# so that the comparison is about the decay-heat shape function and not about
# the Q-value convention; a 1 % change in Q moves the reference by 1 %.
Q_MEV = {"U235": 202.5, "Pu239": 211.5, "U238": 205.9}

def ans_f(t, T, nuc="U235"):
    s = 0.0
    for a, l in ANS[nuc]:
        fac = 1.0 if T == math.inf else -math.expm1(-l*T)
        s += (a/l)*math.exp(-l*t)*fac
    return s

def way_wigner(t, T):
    return 0.0622*(t**-0.2 - (t+T)**-0.2)

# ----------------------------------------------------------------- Bateman
def chain_reference(nucs, edges, N0, times, mu):
    """Generalised Bateman for an acyclic decay network.

    (a) path-sum closed form in 50-digit arithmetic:
        for every simple path j -> ... -> k the contribution to N_k(t) is
            N0_j * prod(rate along path) * sum_i exp(-mu_i t)/prod_{m!=i}(mu_m-mu_i)
        with mu the total removal constants of the nuclides on the path.
    (b) matrix exponential of the same generator, in float64.
    """
    import mpmath as mp
    import numpy as np
    from scipy.linalg import expm
    mp.mp.dps = 50
    idx = {n: i for i, n in enumerate(nucs)}
    n = len(nucs)
    # mu[i] is the TOTAL decay constant of nuclide i, including branches that
    # leave the sub-network being modelled: a chain member that decays on to a
    # nuclide outside the set is still removed at its own rate.

    # enumerate simple paths
    adj = {}
    for a, b, r, br in edges:
        adj.setdefault(a, []).append((b, r))
    paths = []            # (start, end, [nodes], rate_product)
    def walk(node, nodes, prod):
        paths.append((nodes[0], node, list(nodes), prod))
        for b, r in adj.get(node, []):
            if b in nodes:
                continue                      # acyclic by construction
            walk(b, nodes+[b], prod*r)
    for s in nucs:
        walk(s, [s], 1.0)

    out = []
    for t in times:
        # (a) path-sum, high precision
        Na = [mp.mpf(0) for _ in range(n)]
        for s, e, nodes, prod in paths:
            if N0[idx[s]] == 0.0:
                continue
            mus = [mp.mpf(repr(mu[idx[x]])) for x in nodes]
            if len(nodes) == 1:
                Na[idx[e]] += mp.mpf(repr(N0[idx[s]]))*mp.e**(-mus[0]*t)
                continue
            acc = mp.mpf(0)
            for i in range(len(nodes)):
                den = mp.mpf(1)
                for m in range(len(nodes)):
                    if m == i:
                        continue
                    den *= (mus[m]-mus[i])
                acc += mp.e**(-mus[i]*t)/den
            Na[idx[e]] += mp.mpf(repr(N0[idx[s]]))*mp.mpf(repr(prod))*acc
        # (b) matrix exponential, float64
        A = np.zeros((n, n))
        for i, nn in enumerate(nucs):
            A[i, i] = -mu[i]
        for a, b, r, br in edges:
            A[idx[b], idx[a]] += r
        Nb = expm(A*t) @ np.array(N0, dtype=float)
        cross = 0.0
        for i in range(n):
            a_, b_ = float(Na[i]), float(Nb[i])
            if abs(a_) > 1e-30*max(N0):
                cross = max(cross, abs(a_-b_)/abs(a_))
        out.append({"t_s": t,
                    "N": [float(x) for x in Na],
                    "N_expm": [float(x) for x in Nb],
                    "crosscheck_rel": cross})
    return out

# ------------------------------------------------------ SF neutron yields
IAEA_SF = {
 "Th232": (7.126e-08, 2.375e-08), "U232": (3.866e-02, 8.328e-03),
 "U234": (6.782e-03, 9.044e-04), "U235": (1.074e-05, 3.068e-06),
 "U236": (4.276e-03, 2.235e-04), "U238": (1.355e-02, 1.003e-04),
 "Pu238": (2.591e+03, 6.560e+01), "Pu239": (1.605e-02, 4.012e-03),
 "Pu240": (1.031e+03, 1.796e+01), "Pu242": (1.723e+03, 2.891e+01),
 "Am241": (1.143e+00, 2.858e-01), "Cm242": (1.980e+07, 4.516e+05),
 "Cm244": (1.100e+07, 6.620e+05), "Cf252": (2.305e+12, 7.185e+09),
}

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ensdf = json.load(open(os.path.join(here, "decayheat_ensdf.json")))
    chp   = json.load(open(os.path.join(here, "decayheat_chainparams.json")))

    ref = {
      "generated_by": "gen_decayheat.py",
      "citations": [
        "ANSI/ANS-5.1-1979, Decay Heat Power in Light Water Reactors, Tables 1-3 "
        "(23-term fission-product shape functions for thermal U-235, thermal Pu-239, "
        "fast U-238); coefficients transcribed from Westinghouse WCAP-16009-NP-A "
        "Tables 8-1, NRC ADAMS ML050910161.",
        "K. Way and E. P. Wigner, 'The Rate of Decay of Fission Products', "
        "Phys. Rev. 73 (1948) 1318.",
        "S. Simakov, M. Verpelli, N. Otsuka, 'Update of the nuclear data for the "
        "neutron emissions for actinides of interest in safeguards', IAEA Nuclear "
        "Data Section, 2015-03-13, Table 1 (SF neutron yields, n/s/g).",
        "IAEA Live Chart of Nuclides / ENSDF, relnsd API "
        "(https://nds.iaea.org/relnsd/v1/data), retrieved 2026-08-11.",
        "H. Bateman, 'The solution of a system of differential equations occurring "
        "in the theory of radioactive transformations', Proc. Cambridge Philos. "
        "Soc. 15 (1910) 423.",
      ],
      "ans51_coefficients": {k: [list(x) for x in v] for k, v in ANS.items()},
      "ans51_total_MeV_per_fission": {k: sum(a/l for a, l in v) for k, v in ANS.items()},
      "Q_MeV_per_fission": Q_MEV,
      "sf_yield_n_per_s_g": {k: v[0] for k, v in IAEA_SF.items()},
      "sf_yield_unc": {k: v[1] for k, v in IAEA_SF.items()},
      "ensdf": ensdf,
    }

    # ANS-5.1 decay-heat fraction after INFINITE irradiation, standard cooling times
    ref["ans51_infinite"] = {
      nuc: {("%g" % t): {"f_MeV_per_fission": ans_f(t, math.inf, nuc),
                         "P_over_P0": ans_f(t, math.inf, nuc)/Q_MEV[nuc]}
            for t in [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8]}
      for nuc in ANS}

    # fission-product decay heat for the irradiation histories the driver sets
    CFG = [
      # id, fissile, spectral index s, hump d, irradiation years, power MW, HM kg
      ("u235-1y",    "U235",  0.30, 0.02, 1.0,     10.0, 1000.0),
      ("u235-30d",   "U235",  0.30, 0.02, 0.0821355, 10.0, 1000.0),
      ("u235-10y",   "U235",  0.30, 0.02, 10.0,    10.0, 1000.0),
      ("pu239-1y",   "Pu239", 0.30, 0.02, 1.0,     10.0, 1000.0),
      ("u238-7d",    "U238",  1.00, 0.60, 0.02,    10.0, 1000.0),
    ]
    cases = []
    for cid, fis, s, d, Ty, P0, hm in CFG:
        T = Ty*YR
        R = P0*1e6/(Q_MEV[fis]*MEV_J)
        for t in [10.0, 30.0, 100.0, 300.0, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6, 3e6, 1e7]:
            cases.append({
              "id": "%s-t%g" % (cid, t), "cfg": cid, "fissile": fis,
              "s": s, "d": d, "T_years": Ty, "T_s": T, "P0_MW": P0, "hm_kg": hm,
              "Q_MeV": Q_MEV[fis], "fission_rate_per_s": R, "t_s": t,
              "ans51_fp_heat_W": R*ans_f(t, T, fis)*MEV_J,
              "ans51_fraction_of_P0": ans_f(t, T, fis)/Q_MEV[fis],
              "way_wigner_W": P0*1e6*way_wigner(t, T),
              "way_wigner_over_ans": (P0*1e6*way_wigner(t, T))/(R*ans_f(t, T, fis)*MEV_J),
            })
    ref["fp_decay_heat_cases"] = cases

    # Bateman chains, pure single-nuclide initial conditions
    TIMES = {
      "sr90":  [1e3, 1e5, 1e7, 1e8, 1e9, 1e10],
      "cs137": [1e2, 1e3, 1e5, 1e7, 1e9, 1e10],
      "ru106": [1e1, 1e2, 1e4, 1e6, 1e7, 1e8],
      "ce144": [1e2, 1e3, 1e5, 1e6, 1e7, 1e8],
      "pu241": [1e6, 1e8, 1e9, 1e10, 1e12, 1e14],
      "cm242": [1e5, 1e7, 1e8, 1e10, 1e12, 1e14],
      "zr95":  [1e4, 1e5, 1e6, 1e7, 1e8, 1e9],
    }
    chains = []
    for cid, spec in chp.items():
        nucs = spec["ids"]
        edges = [tuple(e) for e in spec["edges"]]
        N0 = [1.0e24 if i == 0 else 0.0 for i in range(len(nucs))]
        chains.append({"id": cid, "nuclides": nucs, "N0": N0,
                       "edges": [list(e) for e in edges],
                       "lambda": [spec["lam"][x] for x in nucs],
                       "points": chain_reference(nucs, edges, N0, TIMES[cid],
                                                 [spec["lam"][x] for x in nucs])})
    ref["bateman_chains"] = chains

    json.dump(ref, open(os.path.join(here, "decayheat_ref.json"), "w"), indent=1)

    print("ANS-5.1 total FP decay energy [MeV/fission]:",
          {k: round(v, 3) for k, v in ref["ans51_total_MeV_per_fission"].items()})
    print("infinite-irradiation P/P0, U-235:")
    for k, v in ref["ans51_infinite"]["U235"].items():
        print("   t=%-8s f=%9.4f MeV/fis   P/P0=%.5f" % (k, v["f_MeV_per_fission"], v["P_over_P0"]))
    worst = max(p["crosscheck_rel"] for c in chains for p in c["points"])
    print("Bateman path-sum vs expm, worst relative deviation: %.3e" % worst)
    print("Way-Wigner / ANS-5.1 ratio range: %.2f .. %.2f" %
          (min(c["way_wigner_over_ans"] for c in cases),
           max(c["way_wigner_over_ans"] for c in cases)))

if __name__ == "__main__":
    main()
