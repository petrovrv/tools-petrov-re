#!/usr/bin/env python3
"""Reference generator for the shortcircuit.html benchmark
(benchmark id `iec60909-sequence-fault-kernel-v1`).

WHAT THIS FILE IS
-----------------
An independent implementation, in ohms and complex arithmetic, of the
IEC 60909-0:2016 equations that shortcircuit.html's sequence-fault kernel
claims to implement.  It produces ref/shortcircuit_ref.json: 12 cases, each
with six reference quantities (Ik'', i_p, I_th, I_res, kappa, m).

WHY IT IS A SEPARATE FILE AND NOT gen_electricalnetwork.py
----------------------------------------------------------
bench-src/ref/gen_electricalnetwork.py implements the same standard, but only
the part electricalnetwork.html needs.  Measured against what this page grades:

  given for free            eq. (56) kappa = 1.02 + 0.98 exp(-3 R/X), and
                            eq. (55) i_p = kappa sqrt2 Ik'', both as scalars;
                            eq. (29) Ik'' = c Un / (sqrt3 |Zk|), inside its
                            nodal solver and tied to its own state format.
  NOT covered               eq. (34) only in the Z_2 = Z_1 special case
                            (`Ik2Min = sqrt3/2 Ik`); this page grades the
                            general |Z_1 + Z_2| form with Z_2 != Z_1.
  NOT covered               eq. (52): the header cites it, but the only earth
                            fault it computes is the IEC 60364-4-41 TN/TT
                            loop screening c Un / (sqrt3 |Z_loop|), which is a
                            different equation in a different standard.
  NOT covered at all        the line-to-line-with-earth fault (clause 4.2,
                            double line-to-earth); the earth current;
                            and clause 4.8 eq. (68)/(69) -- the thermal
                            equivalent current I_th and the a.c. factor m.
                            grep -i 'thermal\\|Ith\\|llg' over that file
                            returns nothing in its equation set.

Four of the six graded quantities therefore have no reference in that file, so
this one is written from the standard.  Nothing here imports, transcribes or
reads any JavaScript from shortcircuit.html.

FORMULATION, and why it is not the page's arithmetic restated
-------------------------------------------------------------
The page works in per-unit on a 1 MVA base, assembles a nodal admittance
matrix per sequence, and takes the driving-point impedance as a column of its
inverse through a complex sparse LU.  This reference works in ohms, uses the
published closed forms directly, and never forms a matrix.  The two paths
agree only if both implement the same equations.

EQUATIONS, each with its clause
-------------------------------
  Z from |Z| and X/R        R = |Z|/sqrt(1+(X/R)^2), X = R (X/R).
  4.2  eq. (29)   3-phase   Ik'' = c Un / (sqrt3 |Z_1 + Z_f|)
  4.2  eq. (34)   L-L       Ik2'' = c Un / |Z_1 + Z_2 + 2 Z_f|
  4.2  eq. (52)   L-E       Ik1'' = sqrt3 c Un / |Z_1 + Z_2 + Z_0 + 3 Z_f|
  4.2  L-L-E, with D = Z_1 Z_2 + Z_1 Z_0' + Z_2 Z_0' and Z_0' = Z_0 + 3 Z_f:
                  Ik2E,L2'' = c Un |Z_0' - a   Z_2| / |D|
                  Ik2E,L3'' = c Un |Z_0' - a^2 Z_2| / |D|
                  IkE2E''   = sqrt3 c Un |Z_2| / |D|      (the earth current)
                  a = exp(j 2pi/3).  The graded phase current is the larger of
                  the two faulted-phase currents, which is what a rating is
                  taken from.
  4.3.1.2 eq. (56) kappa = 1.02 + 0.98 exp(-3 R/X)
          Method C: R/X is read at f_c = 0.4 f as (R_c/X_c)(f_c/f).  With a
          single source impedance X_c = 0.4 X and R_c = R, so
          (R_c/X_c)(f_c/f) = (R/0.4X)(0.4) = R/X exactly: for every case here
          Method C and the nominal-frequency ratio are the same number, and
          this file computes both and asserts they agree, so the agreement is
          measured and not assumed.
  4.3.1.2 eq. (55) i_p = kappa sqrt2 Ik''
  4.8  eq. (69)   m = [exp(4 f T_k ln(kappa-1)) - 1] / (2 f T_k ln(kappa-1))
  4.8  eq. (68)   I_th = Ik'' sqrt(m + n)

WHAT THIS REFERENCE DOES NOT ESTABLISH
--------------------------------------
* n, the d.c.-decay factor of eq. (68), is NOT derived here.  IEC 60909-0:2016
  clause 4.8 obtains n from Figure 23 as a function of Ik''/Ik and T_k; the
  page takes n as a user input and so does this reference.  I_th is graded
  with the case's own n, so what is graded in I_th is eq. (68) and m, not n.
* No case here has a rotating machine or a transformer: every case is a
  Thevenin source with gen and motor off, so K_T (6.3.3), the motor impedance
  (6.8), the breaking current I_b (4.5) and the near-generator a.c. decay are
  untouched by this reference and by these 12 cases.
* The 2016 edition is implemented.  The current edition is IEC 60909-0:2026 and
  the equation-by-equation delta is not verified here or anywhere in this tree.
* Z_f is carried through every fault type, but only the 3-phase case exercises
  it (Rf = 20 mOhm).  The 2 Z_f / 3 Z_f terms of eq. (34)/(52) and the Z_0+3Z_f
  of the L-L-E form are implemented and ungraded.
"""
import cmath
import json
import math
import os
import sys

SQ3 = math.sqrt(3.0)
A1 = cmath.exp(2j * math.pi / 3.0)          # a
A2 = cmath.exp(-2j * math.pi / 3.0)         # a^2


def z_from_mag_xr(zmag, xr):
    """R and X of an impedance quoted as |Z| and X/R."""
    xr = max(0.0, float(xr))
    r = zmag / math.sqrt(1.0 + xr * xr)
    return complex(r, r * xr)


def kappa_eq56(z):
    """IEC 60909-0:2016, 4.3.1.2 eq. (56)."""
    if z.imag == 0.0:
        return 1.02 + 0.98 * math.exp(-3.0 * float('inf')) if z.real else 2.0
    return 1.02 + 0.98 * math.exp(-3.0 * max(0.0, abs(z.real / z.imag)))


def kappa_method_c(z, f, fc_ratio=0.4):
    """IEC 60909-0:2016, 4.3.1.2 Method C.

    kappa is read with R/X = (R_c/X_c)(f_c/f), R_c and X_c taken at f_c.  For a
    source whose reactance scales with frequency, X_c = (f_c/f) X, so the ratio
    is R/X and Method C collapses onto eq. (56).  Computed the long way here so
    that collapse is a measurement.
    """
    zc = complex(z.real, z.imag * fc_ratio)
    ratio = abs(zc.real / zc.imag) * fc_ratio if zc.imag != 0.0 else float('inf')
    return 1.02 + 0.98 * math.exp(-3.0 * max(0.0, ratio)), ratio


def thermal_m(kap, f, tk):
    """IEC 60909-0:2016, 4.8 eq. (69)."""
    a = math.log(max(1e-9, kap - 1.0))
    d = 2.0 * f * tk * a
    if abs(d) < 1e-10:
        return 2.0
    return math.expm1(4.0 * f * tk * a) / d


def sequence_impedances(c):
    """Z1, Z2, Z0 in ohms for one benchmark case, from its quoted data.

    The case quotes a primary |Z1|/(X/R) pair per IEC case (max/min) and either
    an explicit |Z2|/|Z0| pair with its own X/R, or a ratio Z2/Z1 and Z0/Z1
    applied to the primary impedance.  Both are the ways a network equivalent
    is handed over in practice; the explicit pair wins where it is given.
    """
    mn = c['caseName'] == 'min'
    zm = c['importZMin_Ohm'] if mn else c['importZ_Ohm']
    xr = c['importXRMin'] if mn else c['importXR']
    z1 = z_from_mag_xr(zm, xr)

    z2m = c['importZ2Min_Ohm'] if mn else c['importZ2_Ohm']
    z2xr = c['importXR2Min'] if mn else c['importXR2']
    if z2m > 0 and z2xr >= 0:
        z2 = z_from_mag_xr(z2m, z2xr)
        z2_basis = 'explicit |Z2|, X/R'
    else:
        z2 = z1 * max(0.01, c['importZ2'])
        z2_basis = 'Z2/Z1 ratio on Z1'

    z0m = c['importZ0Min_Ohm'] if mn else c['importZ0_Ohm']
    z0xr = c['importXR0Min'] if mn else c['importXR0']
    if z0m > 0 and z0xr >= 0:
        z0 = z_from_mag_xr(z0m, z0xr)
        z0_basis = 'explicit |Z0|, X/R'
    else:
        z0 = z1 * max(0.01, c['importZ0'])
        z0_basis = 'Z0/Z1 ratio on Z1'
    return z1, z2, z0, z2_basis, z0_basis


def solve(c):
    """The six reference quantities for one case."""
    f = float(c['frequency'])
    un = float(c['importV_V'])
    cf = float(c['cMax'] if c['caseName'] == 'max' else c['cMin'])
    zf = complex(max(0.0, float(c['Rf'])), 0.0)
    z1, z2, z0, z2_basis, z0_basis = sequence_impedances(c)
    ft = c['faultType']

    ires = 0.0
    if ft == '3ph':                                   # eq. (29)
        ik = cf * un / (SQ3 * abs(z1 + zf))
        law = "eq. (29)  Ik'' = c Un / (sqrt3 |Z1 + Zf|)"
    elif ft == 'll':                                  # eq. (34)
        ik = cf * un / abs(z1 + z2 + 2.0 * zf)
        law = "eq. (34)  Ik2'' = c Un / |Z1 + Z2 + 2 Zf|"
    elif ft == 'lg':                                  # eq. (52)
        ik = SQ3 * cf * un / abs(z1 + z2 + z0 + 3.0 * zf)
        law = "eq. (52)  Ik1'' = sqrt3 c Un / |Z1 + Z2 + Z0 + 3 Zf|"
        ires = ik                                     # 3 I0 = Ik1'' for an L-E fault
    elif ft == 'llg':
        z0p = z0 + 3.0 * zf
        d = z1 * z2 + z1 * z0p + z2 * z0p
        il2 = cf * un * abs(z0p - A1 * z2) / abs(d)
        il3 = cf * un * abs(z0p - A2 * z2) / abs(d)
        ik = max(il2, il3)
        ires = SQ3 * cf * un * abs(z2) / abs(d)       # IkE2E''
        law = ("clause 4.2 L-L-E  Ik2E'' = c Un |Z0' - a Z2| / |D| (and its a^2 twin), "
               "IkE2E'' = sqrt3 c Un |Z2| / |D|, D = Z1 Z2 + Z1 Z0' + Z2 Z0'")
    else:
        raise ValueError('unknown fault type ' + repr(ft))

    # kappa: eq. (56) on the positive-sequence impedance at the fault point,
    # cross-checked against the Method C route.
    kap = kappa_eq56(z1)
    kap_c, rx_c = kappa_method_c(z1, f)
    if abs(kap - kap_c) > 1e-15 * max(1.0, abs(kap)):
        raise AssertionError('Method C and eq. (56) disagree for %s: %r vs %r'
                             % (c['id'], kap, kap_c))

    ip = kap * math.sqrt(2.0) * ik                    # eq. (55)
    m = thermal_m(kap, f, max(0.001, float(c['thermalTime'])))   # eq. (69)
    n = max(0.0, float(c['thermalN']))
    ith = ik * math.sqrt(max(0.0, m + n))             # eq. (68)

    return {
        'Ik_A': ik, 'ip_A': ip, 'Ith_A': ith, 'Ires_A': ires,
        'kappa': kap, 'm': m,
    }, {
        'law': law,
        'Z1_ohm': [z1.real, z1.imag], 'Z2_ohm': [z2.real, z2.imag],
        'Z0_ohm': [z0.real, z0.imag],
        'Z2_basis': z2_basis, 'Z0_basis': z0_basis,
        'kappa_method_c': kap_c, 'kappa_method_c_RX': rx_c,
        'n_input': n,
    }


# --------------------------------------------------------------- the 12 cases
BASE = {
    'sourceMode': 'thevenin', 'genOn': False, 'motorOn': False, 'Rf': 0,
    'frequency': 50, 'thermalTime': 1, 'thermalN': 1, 'importV_V': 400,
    'cMax': 1.05, 'cMin': 0.95, 'caseName': 'max', 'faultType': '3ph',
    'importZ_Ohm': 0.08, 'importXR': 10, 'importZMin_Ohm': 0.12, 'importXRMin': 8,
    'importZ2': 1, 'importZ0': 3,
    'importZ2_Ohm': -1, 'importXR2': -1, 'importZ2Min_Ohm': -1, 'importXR2Min': -1,
    'importZ0_Ohm': -1, 'importXR0': -1, 'importZ0Min_Ohm': -1, 'importXR0Min': -1,
}


def case(cid, note, **kw):
    st = dict(BASE)
    st.update(kw)
    st['id'] = cid
    st['note'] = note
    return st


def cases():
    return [
        case('3ph-max-xr10',
             "Three-phase maximum case, eq. (29) with c_max = 1.05 and X/R = 10: the "
             "baseline every other case is a one-assumption step away from."),
        case('3ph-min-xr8', caseName='min',
             note="The same network on its minimum data set: c_min = 0.95, |Z1| min and "
                  "X/R min. Checks that the min case reads the min impedance pair and the "
                  "min voltage factor, and that kappa follows the min X/R."),
        case('ll-symmetric', faultType='ll',
             note="Line-to-line with Z2 = Z1, where eq. (34) must reduce to (sqrt3/2) Ik3''."),
        case('ll-asymmetric', faultType='ll', importZ2_Ohm=0.11, importXR2=4,
             note="Line-to-line with an explicitly quoted negative-sequence impedance "
                  "unequal to Z1: the general |Z1 + Z2| form of eq. (34), which the "
                  "sqrt3/2 shortcut cannot reach."),
        case('lg-sequence', faultType='lg', importZ2_Ohm=0.09, importXR2=6,
             importZ0_Ohm=0.25, importXR0=3,
             note="Line-to-earth with all three sequence impedances quoted explicitly, "
                  "eq. (52), and the residual current 3 I0 = Ik1''."),
        case('llg-sequence', faultType='llg', importZ2_Ohm=0.09, importXR2=6,
             importZ0_Ohm=0.25, importXR0=3,
             note="Line-to-line-with-earth on the same sequence data: the faulted-phase "
                  "current is the larger of Ik2E,L2'' and Ik2E,L3'', and the earth current "
                  "IkE2E'' is separately graded and is NOT equal to the phase current."),
        case('3ph-rf20mohm', Rf=0.02,
             note="Three-phase through a 20 mOhm fault resistance: the only case that "
                  "exercises Z_f, and it reduces Ik'' without touching kappa, because "
                  "eq. (56) is read on the source impedance, not on Z1 + Z_f."),
        case('thermal-200ms', thermalTime=0.2, thermalN=0.7,
             note="Clause 4.8 on a 200 ms fault with n = 0.7: m rises by a factor five "
                  "against the 1 s case while Ik'' and i_p are unchanged, so the case "
                  "isolates eq. (69) and eq. (68)."),
        case('pure-reactive', importZ_Ohm=0.1, importXR=1e12,
             note="A numerically pure reactance (X/R = 1e12). kappa must approach its "
                  "ceiling of 2 and m its ceiling of 2, which is where eq. (69) is a 0/0 "
                  "limit and an implementation that does not take the limit carefully "
                  "loses all its digits."),
        case('resistive-rich', importZ_Ohm=0.1, importXR=0.5,
             note="The other end: X/R = 0.5, kappa just above 1.02 and m near zero, where "
                  "ln(kappa-1) is large and negative."),
        case('690v', importV_V=690, importZ_Ohm=0.06, importXR=12,
             note="690 V system voltage, to check that Un enters eq. (29) linearly and "
                  "that nothing in the kernel is pinned to 400 V."),
        case('lg-min-sequence', faultType='lg', caseName='min',
             importZ2Min_Ohm=0.14, importXR2Min=5, importZ0Min_Ohm=0.3, importXR0Min=2.5,
             note="Line-to-earth on the minimum data set with explicit minimum sequence "
                  "impedances: checks that the min branch of every one of the three "
                  "sequence lookups is taken, not just the primary one."),
    ]


REFERENCE = (
    "Independent Python complex-arithmetic implementation of the cited "
    "IEC 60909-0:2016 sequence-fault equations, written in ohms from the published "
    "closed forms. It constructs Z1/Z2/Z0 from |Z| and X/R, applies the equivalent "
    "voltage source c Un/sqrt3 at the fault point for 3-phase, line-line, "
    "line-earth and line-line-earth faults, the Method-C peak factor and the "
    "clause 4.8 thermal factor. No JavaScript from shortcircuit.html is imported, "
    "transcribed or read; the page solves a per-unit nodal admittance system with a "
    "complex sparse LU, this reference forms no matrix."
)

CITATIONS = [
    "IEC 60909-0:2016, clause 4.2 - equivalent voltage source and initial symmetrical "
    "short-circuit currents for balanced and unbalanced faults; eq. (29) three-phase, "
    "eq. (34) line-to-line, eq. (52) line-to-earth",
    "IEC 60909-0:2016, clause 4.2 - line-to-line short circuit with earth connection: "
    "Ik2E'' = c Un |Z0 - a Z2| / |Z1 Z2 + Z1 Z0 + Z2 Z0| and the earth current "
    "IkE2E'' = sqrt3 c Un |Z2| / |Z1 Z2 + Z1 Z0 + Z2 Z0|",
    "IEC 60909-0:2016, clause 4.3.1.2, equations (55)-(56) - ip = kappa sqrt(2) Ik'' and "
    "kappa = 1.02 + 0.98 exp(-3 R/X), read by Method C at fc = 0.4 f",
    "IEC 60909-0:2016, clause 4.8, equations (68)-(69) - thermal equivalent "
    "short-circuit current Ith = Ik'' sqrt(m + n) and the a.c. factor "
    "m = [exp(4 f Tk ln(kappa-1)) - 1] / (2 f Tk ln(kappa-1))",
]

TOLERANCE = {
    "currents": "abs(error) <= 1e-6 A + 1e-10*|reference|",
    "kappa": "abs(error) <= 1e-12",
    "thermal_m": "abs(error) <= 1e-12",
    "basis": "Both implementations evaluate closed-form analytical equations in "
             "IEEE-754 double precision; tolerance covers floating-point evaluation "
             "order only and is far tighter than the UI display resolution.",
}

NOT_BENCHMARKED = [
    "n, the d.c. factor of eq. (68): clause 4.8 reads it from Figure 23 as a function of "
    "Ik''/Ik and Tk, the page takes it as a user input, and so does this reference. What "
    "eq. (68) is graded on is the sqrt(m + n) combination with the case's own n.",
    "The breaking current Ib (clause 4.5), the steady-state current Ik (4.6) and the "
    "near-generator a.c. decay: the page computes Ib only for a 3-phase maximum case with "
    "a source breakdown, and no case here has a machine to decay.",
    "The transformer impedance correction K_T (6.3.3), the motor locked-rotor impedance "
    "(6.8) and the transformer zero-sequence vector-group construction: every case here is "
    "a Thevenin equivalent with gen and motor off, so the kernel's network mode is "
    "untouched by these 12 cases.",
    "The Z_f terms of eq. (34), eq. (52) and the L-L-E form are implemented in this "
    "reference and exercised by no case: only the 3-phase case quotes a fault resistance.",
    "IEC 60909-0:2026 is the current edition. This is the 2016 equation set; the "
    "edition delta is not verified by this benchmark.",
    "I_res for a 3-phase or line-to-line fault is a structural zero (no earth path in the "
    "boundary conditions), not an independently computed quantity. It is graded, because a "
    "kernel that leaked a residual current into a balanced fault would be wrong, but a "
    "pass there is weaker evidence than a pass on the two earth-fault cases.",
]


def build():
    out = {
        'benchmark_id': 'iec60909-sequence-fault-kernel-v1',
        'tool': 'shortcircuit',
        'file': 'shortcircuit.html',
        'generator': 'bench-src/ref/gen_shortcircuit.py',
        'reference': REFERENCE,
        'citations': CITATIONS,
        'tolerance': TOLERANCE,
        'not_benchmarked': NOT_BENCHMARKED,
        'graded_quantities': ['Ik_A', 'ip_A', 'Ith_A', 'Ires_A', 'kappa', 'm'],
        'cases': [],
    }
    for c in cases():
        ref, detail = solve(c)
        state = {k: v for k, v in c.items() if k not in ('id', 'note')}
        out['cases'].append({
            'id': c['id'], 'note': c['note'],
            'fault_type': c['faultType'], 'case': c['caseName'],
            'state': state, 'reference': ref, 'detail': detail,
        })
    return out


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    dest = os.environ.get('SC_REF_OUT') or os.path.join(here, 'shortcircuit_ref.json')
    doc = build()
    with open(dest, 'w') as f:
        json.dump(doc, f, indent=1)
        f.write('\n')
    print('wrote %s: %d cases, %d graded quantities'
          % (dest, len(doc['cases']), 6 * len(doc['cases'])))
