#!/usr/bin/env python3
"""Independent reference for protectioncoordination.html.

Everything in this file is written from the standards and published documents
listed below.  No line of it is derived from the tool's own JavaScript, and it
never reads the artifact it is graded against or any file it writes.

IEC 60909-0:2016 "Short-circuit currents in three-phase a.c. systems - Part 0:
Calculation of currents":

  4.2     eq. (29)      three-phase       I_k'' = c U_n / (sqrt3 |Z_k|)
          eq. (31)/(34) line-to-line      I_k2'' = c U_n / |Z_1 + Z_2|
                                          = (sqrt3/2) I_k3'' when Z_2 = Z_1
          eq. (52)      line-to-earth     I_k1'' = sqrt3 c U_n / |Z_1+Z_2+Z_0|
  4.3.1.2 eq. (55)      peak              i_p = kappa sqrt2 I_k''
          eq. (56)      kappa             kappa = 1.02 + 0.98 exp(-3 R/X)
          method C                        R/X = (R_c/X_c)(f_c/f), f_c = 0.4 f
  6.1     eq. (5)       referral          Z_Qt = Z_Q / t_r^2
          eq. (6)       network feeder    Z_Q  = c U_nQ^2 / S_kQ''
  6.2     eq. (7)(8)(9) two-winding transformer
                                          Z_T = (u_kr/100) U_rT^2 / S_rT
                                          R_T = P_krT U_rT^2 / S_rT^2
                                          X_T = sqrt(Z_T^2 - R_T^2)
  6.6     eq. (18)      generator         Z_GK = K_G Z_G,  Z_G = x_d'' U_rG^2/S_rG

EasyPower 11.1 Help, TCC Options, "Characteristic Current Method" (citing
G. Parise, IEEE Trans. Industry Applications 31(1), 1995):
                        i_dc,j(0.5 cycle) = sqrt2 I_j exp(-pi/(X/R)_j)
                        (X/R)_eq = -pi / ln( sum(i_dc,j) / (sqrt2 sum(I_j)) )

Schneider Electric 0100DB2301 "Electrical Distribution Fundamentals Design
Guide", System Protection:
  - a secondary line-to-neutral fault on a delta-wye transformer produces
    57.7 % (= 1/sqrt3) of the maximum three-phase primary phase current;
  - "Add a Generator" / Figure 55: bus 02 carries 19.318 kA before and
    24.672 kA after a 15 MW generator (rated current 926.2 A at 11 kV,
    x_d'' = 19 %), so the generator branch increment is 5.354 kA.
Schneider Electric FA405803: a 400 kVA / 410 V / u_kr = 4 % transformer gives
  I_k'' = I_rT / u_kr on a stiff primary.

WHAT THIS REFERENCE DOES NOT ESTABLISH
--------------------------------------
1. The feeder-impedance convention.  IEC 60909-0:2016 6.1 eq. (6) puts the
   voltage factor inside Z_Q, so that eq. (29) evaluated at the feeder's own
   terminals returns the quoted I_kQ''.  The tool uses Z_Q = U_nQ^2 / S_kQ''
   and applies c only in the equivalent voltage source, so its terminal
   current is c x the quoted value - 13 777.68 A against 13 121.60 A for the
   250 MVA / 11 kV feeder of case `analytic_source_3ph`.  The tool's own
   regression test asserts the factor c, so this is a declared convention and
   not a slip; it is reported here with both numbers, and the cases below take
   the feeder impedance Z_Q = U_nQ^2/S_kQ'' as a stated case INPUT.  What the
   cases grade is eq. (29)/(31)/(34)/(52)/(55)/(56) on that impedance, not the
   mapping (U_n, S_kQ'') -> Z_Q.  With c = 1 the two conventions coincide, and
   cases `transformer_referral`, `parallel_sources` and `dyn_primary_577` all
   run at c = 1.
2. The generator impedance correction K_G of 6.6 eq. (18).  The tool applies
   none, and K_G cannot be computed from its generator inputs because they
   carry no rated power factor.  The generator branch reference below is
   therefore Z_G = x_d'' U^2 / S_rG as entered.
3. Anything outside the short-circuit kernel: time-current curves, the
   grading optimiser, breaking current I_b, the d.c. envelope, CT screening,
   the cable thermal screens and the batch study.
"""
import cmath
import json
import math
import os
import sys

SQ3 = math.sqrt(3.0)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ref',
                   'protectioncoordination_ref.json')

# ------------------------------------------------------------------ impedances
def polar(mag, xr):
    """An impedance of magnitude `mag` with the reactance/resistance ratio `xr`.

    Written in polar form on purpose: the tool splits the magnitude in
    rectangular form (r = mag/sqrt(1+xr^2), x = r xr).  Building the same
    impedance from its angle gives the same number through a different
    sequence of floating-point operations, so an agreement here is an
    agreement about the physics and not about the arithmetic order.
    """
    th = math.atan(abs(xr))
    return cmath.rect(mag, th)


def z_feeder(U, Sk_MVA, xr):
    """Network feeder, in the tool's convention: |Z_Q| = U_nQ^2 / S_kQ''.
    See note 1 in the module docstring: IEC 6.1 eq. (6) carries c as well."""
    return polar(U * U / (Sk_MVA * 1e6), xr)


def z_feeder_iec(U, Sk_MVA, xr, c):
    """Network feeder exactly as IEC 60909-0:2016 6.1 eq. (6) writes it."""
    return polar(c * U * U / (Sk_MVA * 1e6), xr)


def refer(z, from_U, to_U):
    """IEC 60909-0:2016 6.1 eq. (5): Z_Qt = Z_Q / t_r^2."""
    return z * (to_U / from_U) ** 2


def z_transformer(U2, Sn_kVA, uk_pct, Pk_kW):
    """IEC 60909-0:2016 6.2 eq. (7)-(9), on the U2 side, without K_T."""
    S = Sn_kVA * 1000.0
    zb = U2 * U2 / S
    zt = uk_pct / 100.0 * zb
    rt = Pk_kW * 1000.0 * U2 * U2 / (S * S)
    xt = math.sqrt(max(0.0, zt * zt - rt * rt))
    return complex(rt, xt)


def z_generator(U, Sn_kVA, xd_pct, xr):
    """Z_G = x_d'' U^2 / S_rG, IEC 6.6 without the K_G correction (note 2)."""
    return polar(xd_pct / 100.0 * U * U / (Sn_kVA * 1000.0), xr)


def at_04f(z):
    """The same impedance with its reactance taken to f_c = 0.4 f."""
    return complex(z.real, 0.4 * z.imag)


def par(a, b):
    """Two impedances in parallel, as a product over a sum - the tool sums
    admittances instead, so this is a second route to the same number."""
    return (a * b) / (a + b)


# ------------------------------------------------------------------- currents
def ik3(c, U, z):
    """IEC 60909-0:2016 4.2 eq. (29)."""
    return c * U / (SQ3 * abs(z))


def ik2(c, U, z1, z2):
    """IEC 60909-0:2016 4.2 eq. (31)/(34)."""
    return c * U / abs(z1 + z2)


def ik1(c, U, z1, z2, z0):
    """IEC 60909-0:2016 4.2 eq. (52)."""
    return SQ3 * c * U / abs(z1 + z2 + z0)


def kappa_method_c(z_at_04f):
    """IEC 60909-0:2016 4.3.1.2 method C + eq. (56).
    R/X is taken from the equivalent impedance reduced at f_c = 0.4 f and
    scaled back by f_c/f, then kappa = 1.02 + 0.98 exp(-3 R/X)."""
    rx = abs(z_at_04f.real / z_at_04f.imag) * 0.4
    return 1.02 + 0.98 * math.exp(-3.0 * max(0.0, rx)), rx


def peak(kappa, ik):
    """IEC 60909-0:2016 4.3.1.2 eq. (55)."""
    return math.sqrt(2.0) * kappa * ik


def ccm_equivalent_xr(branches):
    """EasyPower / Parise Characteristic Current Method.
    `branches` is a list of (I_j, (X/R)_j)."""
    sum_ac = sum(i for i, _ in branches)
    sum_dc = sum(math.sqrt(2.0) * i * math.exp(-math.pi / xr) for i, xr in branches)
    ratio = sum_dc / (math.sqrt(2.0) * sum_ac)
    return -math.pi / math.log(ratio), sum_ac, sum_dc


# ------------------------------------------------------------- tool state dicts
def G(**over):
    g = dict(gradingMargin=.20, maxClear=5, Rf=0, earthing='TN-S', groundR=.20,
             tempMax=20, tempMin=80, cMax=1.05, cMin=.95, frequency=50,
             breakingTime=.1, applyKT=False)
    g.update(over)
    return g


def utility(**over):
    e = dict(id='SRC', type='utility', parent=None, name='Utility', U=11000,
             SkMax=250, SkMin=250, xr=10, z2factor=1, z0r=1.0, z0x=1.0,
             z0enabled=True)
    e.update(over)
    return e


def transformer(**over):
    e = dict(type='transformer', Sn=1000, U1=11000, U2=400, uk=6, Pk=0,
             z0factor=1.0, vectorGroup='Dyn11', zeroSeqMode='auto',
             neutralR=0, neutralX=0, inrush=8, inrushTime=.12)
    e.update(over)
    return e


def state(elements, target, ftype, globals_=None, case='max'):
    return dict(version=8, scenario='normal',
                globals=globals_ or G(),
                elements=elements,
                fault=dict(type=ftype, case=case, target=target, pos=1))


# ===========================================================================
def build():
    cases = []

    # ---------------------------------------------------- 1 utility-only 3-phase
    U1, SK1, XR1, C1 = 11000.0, 250.0, 10.0, 1.05
    z1_a = z_feeder(U1, SK1, XR1)
    ik_a = ik3(C1, U1, z1_a)
    kap_a, rx_a = kappa_method_c(at_04f(z1_a))
    ip_a = peak(kap_a, ik_a)
    xr_eq_a, _, _ = ccm_equivalent_xr([(ik_a, XR1)])
    el_a = [utility(U=U1, SkMax=SK1, SkMin=SK1, xr=XR1),
            dict(id='B0', type='bus', parent='SRC', name='MV bus')]
    cases.append(dict(
        id='analytic_source_3ph',
        note='Closed-form one-source IEC equivalent-voltage-source kernel.',
        inputs=dict(U_V=U1, Sk_MVA=SK1, c=C1, X_over_R=XR1,
                    Z_Q_ohm=abs(z1_a)),
        runs=[dict(key='3ph', state=state(el_a, 'B0', '3ph', G(cMax=C1)))],
        expect={
            'Ik_kA':  dict(ref=ik_a / 1000.0, tol_abs=0.005, run='3ph',
                           quantity='Ik', clause='IEC 60909-0:2016 4.2 eq. (29)'),
            'kappa':  dict(ref=kap_a, tol_abs=0.0005, run='3ph',
                           quantity='kappa',
                           clause='IEC 60909-0:2016 4.3.1.2 eq. (56), method C R/X at f_c=0.4f'),
            'ip_kA':  dict(ref=ip_a / 1000.0, tol_abs=0.005, run='3ph',
                           quantity='ip', clause='IEC 60909-0:2016 4.3.1.2 eq. (55)'),
            'ccm_xr': dict(ref=xr_eq_a, tol_abs=0.005, run='3ph',
                           quantity='ccm_xr',
                           clause='EasyPower 11.1 / Parise CCM, single branch'),
        },
        aux=dict(methodC_RX=rx_a)))

    # ---------------------------------------------------- 2 utility-only L-L
    ik2_a = ik2(C1, U1, z1_a, z1_a)
    cases.append(dict(
        id='analytic_source_ll',
        note='For Z2=Z1, IEC line-line current is sqrt(3)/2 of three-phase current.',
        inputs=dict(U_V=U1, Sk_MVA=SK1, c=C1, X_over_R=XR1, Z_Q_ohm=abs(z1_a)),
        runs=[dict(key='ll', state=state(el_a, 'B0', 'll', G(cMax=C1)))],
        expect={
            'Ik_kA': dict(ref=ik2_a / 1000.0, tol_abs=0.005, run='ll',
                          quantity='Ik',
                          clause='IEC 60909-0:2016 4.2 eq. (31)/(34)'),
            'ratio_to_3ph': dict(ref=SQ3 / 2.0, tol_abs=0.0008, run='ll',
                                 quantity='ratio_to_3ph',
                                 against='analytic_source_3ph',
                                 clause='IEC 60909-0:2016 4.2 eq. (34), Z_2 = Z_1'),
        }))

    # ---------------------------------------- 3 finite feeder through transformer
    U1b, U2b, SKb, XRb, Cb = 11000.0, 410.0, 10000.0, 10.0, 1.0
    SNb, UKb, PKb = 400.0, 4.0, 0.0
    z_q = refer(z_feeder(U1b, SKb, XRb), U1b, U2b)
    z_t = z_transformer(U2b, SNb, UKb, PKb)
    z1_b = z_q + z_t
    ik_b = ik3(Cb, U2b, z1_b)
    irt = SNb * 1000.0 / (SQ3 * U2b)
    el_b = [utility(U=U1b, SkMax=SKb, SkMin=SKb, xr=XRb),
            transformer(id='T1', parent='SRC', name='T1 400 kVA',
                        Sn=SNb, U1=U1b, U2=U2b, uk=UKb, Pk=PKb),
            dict(id='B0', type='bus', parent='T1', name='LV bus')]
    cases.append(dict(
        id='transformer_referral',
        note='Finite utility source impedance referred through 11 kV/410 V ratio '
             'and added to 4% transformer impedance.',
        inputs=dict(U1_V=U1b, U2_V=U2b, Sk_MVA=SKb, X_over_R=XRb, Sn_kVA=SNb,
                    uk_pct=UKb, Pk_kW=PKb, c=Cb,
                    Z_Qt_ohm=abs(z_q), Z_T_ohm=abs(z_t)),
        runs=[dict(key='3ph', state=state(el_b, 'B0', '3ph', G(cMax=Cb, cMin=Cb)))],
        expect={
            'Ik_kA': dict(ref=ik_b / 1000.0, tol_abs=0.005, run='3ph',
                          quantity='Ik',
                          clause='IEC 60909-0:2016 6.1 eq. (5) + 6.2 eq. (7)-(9) + 4.2 eq. (29)'),
        },
        crosscheck=dict(
            name='Schneider FA405803 stiff-primary approximation I_rT/u_kr',
            published_kA=irt / (UKb / 100.0) / 1000.0,
            closed_form_kA=ik_b / 1000.0,
            relative_difference=abs(ik_b - irt / (UKb / 100.0)) / (irt / (UKb / 100.0)),
            graded=False)))

    # -------------------------------------------------- 4 two sources at one bus
    Uc, SKc, XRuc, Cc = 11000.0, 250.0, 3.0, 1.0
    SNG, XDG, XRG = 1000.0, 12.0, 18.0
    z_u = z_feeder(Uc, SKc, XRuc)
    z_g = z_generator(Uc, SNG, XDG, XRG)
    i_u = ik3(Cc, Uc, z_u)
    i_g = ik3(Cc, Uc, z_g)
    z_p = par(z_u, z_g)
    ik_c = ik3(Cc, Uc, z_p)
    xr_eq_c, sum_ac_c, sum_dc_c = ccm_equivalent_xr([(i_u, XRuc), (i_g, XRG)])
    kap_c, rx_c = kappa_method_c(par(at_04f(z_u), at_04f(z_g)))
    ip_c = peak(kap_c, ik_c)
    el_c = [utility(U=Uc, SkMax=SKc, SkMin=SKc, xr=XRuc),
            dict(id='B0', type='bus', parent='SRC', name='MV bus'),
            dict(id='G1', type='generator', parent='B0', name='Generator',
                 Sn=SNG, xd=XDG, x2=20, x0=6, xr=XRG, grounding='grounded-wye',
                 neutralR=0, neutralX=0, enabled=True, IkP=0)]
    cases.append(dict(
        id='parallel_sources',
        note='Independent phasor sum of two source currents at a common 11 kV '
             'bus; CCM is evaluated from the two branch magnitudes/XR values.',
        inputs=dict(U_V=Uc, c=Cc, utility_Sk_MVA=SKc, utility_XR=XRuc,
                    generator_Sn_kVA=SNG, generator_xd_pct=XDG,
                    generator_XR=XRG, Z_utility_ohm=abs(z_u),
                    Z_generator_ohm=abs(z_g)),
        runs=[dict(key='3ph', state=state(el_c, 'B0', '3ph', G(cMax=Cc, cMin=Cc)))],
        expect={
            'Ik_kA':        dict(ref=ik_c / 1000.0, tol_abs=0.005, run='3ph',
                                 quantity='Ik',
                                 clause='IEC 60909-0:2016 4.2 eq. (29) on the parallel equivalent'),
            'utility_kA':   dict(ref=i_u / 1000.0, tol_abs=0.005, run='3ph',
                                 quantity='branch_xr3',
                                 clause='IEC 60909-0:2016 4.2 eq. (29) on the feeder branch alone'),
            'generator_kA': dict(ref=i_g / 1000.0, tol_abs=0.0005, run='3ph',
                                 quantity='branch_xr18',
                                 clause='IEC 60909-0:2016 4.2 eq. (29) on the generator branch alone'),
            'ccm_xr':       dict(ref=xr_eq_c, tol_abs=0.005, run='3ph',
                                 quantity='ccm_xr',
                                 clause='EasyPower 11.1 / Parise CCM over the two branches'),
            'kappa':        dict(ref=kap_c, tol_abs=0.0005, run='3ph',
                                 quantity='kappa',
                                 clause='IEC 60909-0:2016 4.3.1.2 eq. (56), method C on the 0.4f parallel equivalent'),
            'ip_kA':        dict(ref=ip_c / 1000.0, tol_abs=0.005, run='3ph',
                                 quantity='ip',
                                 clause='IEC 60909-0:2016 4.3.1.2 eq. (55)'),
        },
        aux=dict(branch_xr=[XRuc, XRG], ccm_sum_ac=sum_ac_c,
                 ccm_sum_dc=sum_dc_c, methodC_RX=rx_c)))

    # ------------------------------------- 5 Dyn11 secondary L-G, primary phase
    Ud1, Ud2, SKd, XRd, Cd = 11000.0, 400.0, 1e8, 10.0, 1.0
    SNd, UKd, PKd = 1000.0, 6.0, 0.0
    z_qd = refer(z_feeder(Ud1, SKd, XRd), Ud1, Ud2)
    z_td = z_transformer(Ud2, SNd, UKd, PKd)
    z1_d = z_qd + z_td
    z0_d = z_td                      # Dyn11: the grounded star is a local shunt
    i3_d = ik3(Cd, Ud2, z1_d)
    ilg_d = ik1(Cd, Ud2, z1_d, z1_d, z0_d)
    tr = Ud2 / Ud1
    prim_3ph = i3_d * tr
    prim_lg = ilg_d / SQ3 * tr       # one delta winding carries the L-N current
    ratio_exact = prim_lg / prim_3ph
    el_d = lambda: [utility(U=Ud1, SkMax=SKd, SkMin=SKd, xr=XRd),
                    dict(id='QHV577', type='breaker', parent='SRC',
                         name='HV test CB'),
                    transformer(id='T1', parent='QHV577', name='T1 1000 kVA',
                                Sn=SNd, U1=Ud1, U2=Ud2, uk=UKd, Pk=PKd,
                                vectorGroup='Dyn11', zeroSeqMode='auto',
                                z0factor=1, neutralR=0, neutralX=0),
                    dict(id='Q0', type='breaker', parent='T1', name='Main CB',
                         In=1600, Icu=50, Ii=15, Isd=5, tsd=.35),
                    dict(id='B0', type='bus', parent='Q0', name='Main LV bus')]
    gd = G(cMax=Cd, cMin=Cd, Rf=0, groundR=0)
    cases.append(dict(
        id='dyn_primary_577',
        note='Schneider 0100DB2301 states a secondary L-N fault on a delta-wye '
             'transformer produces 57.7% of the maximum three-phase primary '
             'phase current.',
        inputs=dict(vector_group='Dyn11', secondary_fault='L-G', c=Cd,
                    U1_V=Ud1, U2_V=Ud2, Sn_kVA=SNd, uk_pct=UKd, Pk_kW=PKd,
                    Sk_MVA=SKd, device='QHV577 on the 11 kV side',
                    I_LG_primary_A=prim_lg, I_3ph_primary_A=prim_3ph),
        runs=[dict(key='3ph', state=state(el_d(), 'B0', '3ph', gd)),
              dict(key='lg', state=state(el_d(), 'B0', 'lg', gd))],
        expect={
            'primary_phase_ratio': dict(
                ref=1.0 / SQ3, tol_abs=0.002, run='lg',
                quantity='primary_phase_ratio', device='QHV577',
                clause='Schneider Electric 0100DB2301, System Protection: '
                       'secondary L-N fault gives 57.7% of the maximum '
                       'three-phase primary phase current',
                ref_exact=ratio_exact,
                ref_exact_note='(1/sqrt3) x 3|Z_1| / |2 Z_1 + Z_0| for the finite '
                               'feeder of this case; the published 57.7% is its '
                               'Z_Q -> 0 limit'),
        },
        aux=dict(Z1_ohm=abs(z1_d), Z0_ohm=abs(z0_d),
                 I_3ph_secondary_A=i3_d, I_LG_secondary_A=ilg_d)))

    # --------------------------------- 6 Schneider Figure 55 generator increment
    Ue1, Ue2, SKe, XRe, Ce = 110000.0, 11000.0, 3810.512, 1000.0, 1.1
    SNe, UKe, PKe = 45000.0, 12.5, 0.0
    IRG, XDGE, XRGE = 926.2, 19.0, 1000.0
    SRG_kVA = SQ3 * Ue2 * IRG / 1000.0
    z_qe = refer(z_feeder(Ue1, SKe, XRe), Ue1, Ue2)
    z_te = z_transformer(Ue2, SNe, UKe, PKe)
    z_ue = z_qe + z_te
    z_ge = z_generator(Ue2, SRG_kVA, XDGE, XRGE)
    i_ue = ik3(Ce, Ue2, z_ue)
    i_ge = ik3(Ce, Ue2, z_ge)
    ik_e = ik3(Ce, Ue2, par(z_ue, z_ge))
    PUB_BEFORE, PUB_AFTER = 19.318, 24.672
    PUB_INC = PUB_AFTER - PUB_BEFORE
    el_e = [utility(U=Ue1, SkMax=SKe, SkMin=SKe, xr=XRe),
            transformer(id='T1', parent='SRC', name='T 45 MVA', Sn=SNe,
                        U1=Ue1, U2=Ue2, uk=UKe, Pk=PKe),
            dict(id='B0', type='bus', parent='T1', name='Bus 02'),
            dict(id='GFIG55', type='generator', parent='B0', name='Gen 01',
                 Sn=SRG_kVA, xd=XDGE, x2=XDGE, x0=6, xr=XRGE,
                 grounding='blocked', neutralR=0, neutralX=0, enabled=True,
                 IkP=0)]
    cases.append(dict(
        id='schneider_generator_increment',
        note='Schneider 0100DB2301 Add a Generator / Figure 55 publishes '
             '19.318 kA before and 24.672 kA after the 15 MW generator; the '
             'branch increment is therefore 5.354 kA. Only the generator '
             'increment is graded; the total remains an explicit convention '
             'cross-check.',
        inputs=dict(published_before_kA=PUB_BEFORE, published_after_kA=PUB_AFTER,
                    U_V=Ue2, c=Ce, generator_rated_A=IRG,
                    generator_Sn_kVA=SRG_kVA, generator_xd_pct=XDGE,
                    generator_XR=XRGE, utility_Sk_MVA=SKe, utility_U_V=Ue1,
                    transformer_Sn_kVA=SNe, transformer_uk_pct=UKe),
        runs=[dict(key='3ph', state=state(el_e, 'B0', '3ph',
                                          G(cMax=Ce, cMin=Ce)))],
        expect={
            'generator_kA': dict(ref=PUB_INC, tol_rel=0.005, run='3ph',
                                 quantity='branch_generator',
                                 clause='Schneider Electric 0100DB2301 Figure 55 '
                                        'published branch increment 24.672-19.318 kA',
                                 ref_closed_form=i_ge / 1000.0,
                                 ref_closed_form_note="c I_rG / x_d\u2033 from "
                                        "IEC 6.6 Z_G (no K_G); equals 1.1 x 926.2 / 0.19 A"),
        },
        crosscheck=dict(
            name='Schneider 0100DB2301 Figure 55 bus 02 total',
            published_before_kA=PUB_BEFORE,
            published_after_kA=PUB_AFTER,
            closed_form_utility_kA=i_ue / 1000.0,
            closed_form_total_kA=ik_e / 1000.0,
            relative_difference_before=abs(i_ue / 1000.0 - PUB_BEFORE) / PUB_BEFORE,
            relative_difference_after=abs(ik_e / 1000.0 - PUB_AFTER) / PUB_AFTER,
            graded=False)))

    ref = dict(
        reference_line=(
            'Independent closed-form complex-impedance implementation of selected '
            'IEC 60909-0:2016 kernels, the EasyPower/Parise legacy CCM equation '
            'set, and three Schneider Electric published cross-checks, written '
            'from the standard and the published documents by '
            'bench-src/gen_protectioncoordination.py; no Protection Coordination '
            'Studio code is imported and the generator never reads the artifact '
            'or the page.'),
        citations=[
            "IEC 60909-0:2016, 4.2 eq. (29) - I_k'' = c U_n/(sqrt(3)|Z_k|)",
            "IEC 60909-0:2016, 4.2 eq. (31)/(34) - I_k2'' = c U_n/|Z_1+Z_2| = (sqrt(3)/2) I_k3'' when Z_2 = Z_1",
            "IEC 60909-0:2016, 4.2 eq. (52) - I_k1'' = sqrt(3) c U_n/|Z_1+Z_2+Z_0|",
            "IEC 60909-0:2016, 4.3.1.2 eq. (55)-(56) and method C - i_p = kappa sqrt(2) I_k'', kappa = 1.02 + 0.98 exp(-3 R/X), R/X = (R_c/X_c)(f_c/f) at f_c = 0.4 f",
            "IEC 60909-0:2016, 6.1 eq. (5)-(6) - network feeder impedance and its referral",
            "IEC 60909-0:2016, 6.2 eq. (7)-(9) - two-winding transformer Z_T, R_T, X_T",
            "IEC 60909-0:2016, 6.6 eq. (18) - Z_G = x_d'' U_rG^2/S_rG; the K_G correction is NOT applied, see reference_limits",
            "EasyPower 11.1 Help, TCC Options, Characteristic Current Method - i_dc(0.5 cycle) and equivalent X/R equations; cites G. Parise, IEEE Trans. Industry Applications 31(1), 1995",
            "Schneider Electric 0100DB2301 Electrical Distribution Fundamentals Design Guide, System Protection - delta-wye secondary L-N fault gives 57.7% of maximum three-phase primary fault current",
            "Schneider Electric 0100DB2301, System Protection, Add a Generator / Figure 55 - bus 02 19.318 kA before and 24.672 kA after adding the 15 MW generator (926.2 A rated, x_d'' = 19%)",
            "Schneider Electric FA405803 - 400 kVA / 410 V / u_kr 4% transformer, I_k'' = I_rT/u_kr on a stiff primary",
        ],
        tolerance_line=(
            'The tolerances of the 2026-08-12 artifact are kept unchanged so that '
            'a verdict can be compared with it: current KPIs +-0.005 kA, kappa '
            '+-0.0005, CCM X/R +-0.005, the L-L/3-phase ratio +-0.0008 absolute, '
            'the 57.7% transformer ratio +-0.002 absolute, and the Schneider '
            'generator increment 0.5% relative because the published diagram '
            'values and generator data are rounded. No tolerance was widened; the '
            'observed deviation is recorded next to every graded value.'),
        reference_limits=[
            "IEC 60909-0:2016 6.1 eq. (6) writes Z_Q = c U_nQ^2/S_kQ\u2033, so eq. (29) "
            "at the feeder terminals returns the quoted I_kQ\u2033. The tool uses "
            "Z_Q = U_nQ^2/S_kQ\u2033 and applies c only in the equivalent voltage "
            "source, which makes its terminal current c x the quoted value: "
            "13 777.68 A against 13 121.60 A for the 250 MVA / 11 kV feeder of "
            "analytic_source_3ph. The tool's own regression test asserts the factor "
            "c, so this is a declared convention and not a slip. The cases here "
            "take Z_Q = U_nQ^2/S_kQ\u2033 as a stated case input and grade only "
            "eq. (29)/(31)/(34)/(52)/(55)/(56) on it; the mapping "
            "(U_n, S_kQ\u2033) -> Z_Q is NOT established by this benchmark. The four "
            "cases that run at c = 1 are unaffected, because there the two "
            "conventions coincide.",
            "The generator impedance correction K_G of IEC 60909-0:2016 6.6 "
            "eq. (18) is not applied by the tool and cannot be computed from its "
            "generator inputs, which carry no rated power factor. The generator "
            "branch reference is Z_G = x_d\u2033 U^2/S_rG as entered, so K_G is NOT "
            "established.",
            "The six networks are the fixtures of the tool's own regression tests. "
            "A fixture is an input, not a reference: every reference value above is "
            "computed in this file from the cited clause, and none of them is read "
            "back from the tool.",
        ],
        cases=cases)
    return ref


def main():
    ref = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(ref, fh, indent=1, sort_keys=False)
        fh.write('\n')
    n = sum(len(c['expect']) for c in ref['cases'])
    print('wrote %s: %d cases, %d graded quantities' % (OUT, len(ref['cases']), n))
    for c in ref['cases']:
        for k, v in c['expect'].items():
            print('  %-30s %-20s ref=%r' % (c['id'], k, v['ref']))


if __name__ == '__main__':
    sys.exit(main())
