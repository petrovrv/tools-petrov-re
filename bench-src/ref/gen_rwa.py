#!/usr/bin/env python3
"""Independent reference for RWA_calculator.html (Smoke & Heat Exhaust, NBN S 21-208-1).

What is and is not verifiable here is stated plainly, because NBN S 21-208-1 itself is a
paid national standard whose text could not be obtained for this pass.

Verified against a primary/secondary source:
  * the large-fire plume  Mf = Ce . P . Y^(3/2)  with Ce = 0.188 for large spaces
    (BRE Report BR258, Morgan & Gardner, "Design approaches for smoke control in atrium
    buildings"), which is the Thomas/Hinkley large-fire entrainment correlation;
  * the plugholing form  M_crit = beta (g D^5 T0 U / T^2)^(1/2)  - the FORM is confirmed by
    BR258, the COEFFICIENT is not: BR258 gives beta = 1.3 (near a wall) and 1.8 (away from
    a wall) while the tool uses 2.  That disagreement is flagged, never graded;
  * the inlet air velocity limit of 5 m/s and the rule that the aerodynamic inlet area
    should be at least equal to the aerodynamic extract area (SCA/Smoke Control Association,
    "Guidance for the design of smoke ventilation systems for single storey buildings",
    1994, sections 12.4 and 15.3);
  * the simplified 2 % aerodynamic rule and its conditions - one smoke compartment of at
    most 2000 m2, no goods stacked above 70 % of the height, inlet openings below the smoke
    layer (Belgian Royal Decree annex 6, as quoted in a Belgian RWA product guide).

Derived from first principles for this benchmark (not taken from the tool):
  the aerodynamic free area of natural ventilators.  Writing the steady two-orifice
  buoyancy balance - the same mass flow through the inlet at ambient density and through
  the vent at smoke density, the buoyancy head g.db.(rho0 - rhoc) split between the two
  resistances - gives

      M^2 [ 1/(Av Cv)^2 rhoc + 1/(Ai Ci)^2 rho0 ] = 2 g db (rho0 - rhoc)

  and, with rhoc = rho0 T0/Tc and rho0 - rhoc = rho0 theta/Tc,

      Av Cv = (M/rho0) sqrt( (Tc^2 + Sk^2 T0 Tc) / (2 g db theta T0) ),  Sk = AvCv/AiCi,

  which is solved here in closed form (a quadratic in AvCv) and, as a second and
  structurally different reference, by a scipy root find on the mass-flow balance itself.

NOT verifiable for this pass (recorded, not graded): the NBN fire-geometry tables of
section 4, the sprinkler temperature caps, the 1.4 db^2 critical ventilator area, the
L <= 3 m / D >= 3 db ventilator rules, the 60 m reservoir length, the 1-per-400 m2 vent
count and the 3 % geometric variant.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
from scipy.optimize import brentq

RHO, G, CE = 1.225, 9.81, 0.188
CP_SMOKE = 1.0                      # kJ/(kg.K) - the value that makes theta = Qc/Mf exact
V_INLET_MAX = 5.0

def plume(Wf, Y):
    """Large-fire plume mass flow, BR258 / Thomas: Mf = Ce P Y^(3/2)."""
    return CE * Wf * Y ** 1.5

def theta_rise(Qc, Mf):
    return 0.0 if (Qc == 0 or Mf == 0) else Qc / (Mf * CP_SMOKE)

def avcv_closed(Mf, T0, Tc, db, theta, AiCi=None):
    """Analytic solution of the two-orifice balance.  AiCi=None -> the Sk = 1 case."""
    K = (Mf / RHO) ** 2 / (2 * G * db * theta * T0)
    if AiCi is None:
        return math.sqrt(K * (Tc * Tc + T0 * Tc))
    d = 1.0 - K * T0 * Tc / (AiCi * AiCi)
    if d <= 0:
        return None                        # inlet too small: no steady solution
    return Tc * math.sqrt(K / d)

def avcv_network(Mf, T0, Tc, db, AiCi):
    """Second reference: solve the two-orifice mass balance numerically for Av Cv."""
    rho_c = RHO * T0 / Tc
    head = G * db * (RHO - rho_c)
    def mdot(a):
        return math.sqrt(2 * head / (1.0 / (a * a * rho_c) + 1.0 / (AiCi * AiCi * RHO)))
    lo, hi = 1e-6, 1e6
    if mdot(hi) < Mf:
        return None
    return brentq(lambda a: mdot(a) - Mf, lo, hi, xtol=1e-14, rtol=1e-15)

def avcv_multi(Mf, T0, Tc, db, theta, Ai, Ci, n):
    """n equal reservoirs: the inlet of one reservoir is the supplementary inlet plus the
       vents of the other n-1 reservoirs.  Self-consistent, solved directly."""
    def resid(a):
        AiCi = Ai * Ci + (n - 1) * a
        b = avcv_closed(Mf, T0, Tc, db, theta, AiCi)
        return 1e9 if b is None else b - a
    lo = avcv_closed(Mf, T0, Tc, db, theta)           # Sk = 1 value, an upper bound
    return brentq(resid, 1e-9, lo, xtol=1e-14, rtol=1e-15)

def smoke_volume(Mf, T0, Tc):
    return Mf / RHO * Tc / T0

def m_crit_form(db, T0, Tc, beta):
    """Plugholing: beta (g D^5 T0 U / T^2)^(1/2), BR258 form."""
    return beta / Tc * math.sqrt(G * db ** 5 * T0 * (Tc - T0))

# ---------------------------------------------------------------- fire geometry (tool's tables)
LOW = {1: (9.0, 12.0, 0.8), 2: (20.0, 18.0, 0.8), 3: (36.0, 24.0, 0.8), 4: (81.0, 36.0, 0.8)}

def fire_rack(hst, reekb, spr):
    x = 0.18 * hst
    if spr == 'inrekken':
        Af, Wf, al = 2 / 3 * hst * (reekb + x), reekb + 4 * x, 0.5
    elif spr == 'onderdak':
        Af, Wf, al = 4 / 3 * hst * (reekb + x), 2 * (reekb + 4 * x), 0.8
    else:
        Af, Wf, al = 81.0, 36.0, 0.8
    if spr != 'geen':
        Af, Wf = min(max(Af, 9.0), 81.0), min(max(Wf, 12.0), 36.0)
    return Af, Wf, al

def fire_bulk(hst, spr):
    if spr == 'geen':
        return (81.0, 36.0, 0.8) if hst <= 3 else (0.0, 0.0, 0.8)
    al = 0.5 if spr == 'inrekken' else 0.8
    if hst <= 3: return 36.0, 24.0, al
    if hst <= 4: return 81.0, 36.0, al
    return 0.0, 0.0, al

def solve(c):
    """Full reference solution for one case."""
    hc, area, Y = c['hc'], c['area'], c['Y']
    db = hc - Y
    o = dict(db=db, AvCvKrit=1.4 * db * db, Lmax=min(db, 3.0), Dmin=3 * db, area=area)
    if c.get('buildingType') in ('2pct', '3pct'):
        f = 0.02 if c['buildingType'] == '2pct' else 0.03
        o['required'] = f * area
        o['applicable'] = (area <= 2000 and c['glen'] <= 60 and c['gbre'] <= 60
                           and c['poort'] <= 0.7 * hc and c['hst'] <= 0.7 * hc
                           and c['reservoirs'] == 1 and c['method'] == 'natural')
        o['simplified'] = True
        return o
    o['simplified'] = False
    sc = c['fireScenario']
    if c.get('buildingType') == 'hs':
        Af, Wf, al = 81.0, 36.0, 0.8
    elif sc.startswith('low'):
        Af, Wf, al = LOW[int(sc[-1])]
    elif sc == 'rack':
        Af, Wf, al = fire_rack(c['hst'], c['reekb'], c['sprinklers'])
    else:
        Af, Wf, al = fire_bulk(c['hst'], c['sprinklers'])
    qf = 250.0 if c['method'] == 'natural' else 500.0
    Mf = plume(Wf, Y)
    Qc = al * qf * Af
    T0 = c['tAmb'] + 273.15
    theta = theta_rise(Qc, Mf)
    spr_on = c['sprinklers'] != 'geen'
    spr_t = float(c['sprinklerTemp']) if spr_on else None
    if c['method'] == 'natural' and spr_on and spr_t is not None:
        theta = min(1.5 * spr_t - c['tAmb'], theta)
    Tc = ((spr_t + c['tAmb'] + theta) / 2 + 273.15) if (spr_on and spr_t is not None) else T0 + theta
    o.update(Af=Af, Wf=Wf, alpha=al, qf=qf, Mf=Mf, Qc=Qc, T0K=T0, theta=theta, Tc=Tc)
    Ci, Ai, n = c['Ci'], c['Ai'], c['reservoirs']
    if c['method'] == 'natural':
        a_eq = avcv_closed(Mf, T0, Tc, db, theta)                  # Sk = 1
        o['AvCvMin'] = a_eq
        if n > 1:
            a = avcv_multi(Mf, T0, Tc, db, theta, Ai, Ci, n)
            AiCi = Ai * Ci + (n - 1) * a
        else:
            AiCi = Ai * Ci
            if AiCi <= a_eq:
                AiCi = a_eq
            a = avcv_closed(Mf, T0, Tc, db, theta, AiCi)
        o['AiCi'] = AiCi
        o['required'] = a
        # Second, structurally different reference: the two-orifice mass balance solved
        # numerically.  Its buoyancy head is g db (rho0 - rhoc), i.e. it uses Tc - T0.  The
        # published vent equation carries theta explicitly, and the sprinkler model of the
        # tool sets Tc from an averaged expression in which Tc - T0 is NO LONGER theta, so
        # the two references separate exactly there.  That separation is recorded, never
        # graded away.
        o['AvCv_network'] = avcv_network(Mf, T0, Tc, db, AiCi)
        o['theta_consistent'] = abs((Tc - T0) - theta) < 1e-9
    else:
        V = smoke_volume(Mf, T0, Tc)
        o['V'] = V
        o['Vinlet'] = Mf / RHO
        o['required'] = V
        o['inletArea'] = V / V_INLET_MAX / Ci
        o['inletAreaMassBalance'] = (Mf / RHO) / V_INLET_MAX / Ci
        vc = m_crit_form(db, T0, Tc, 2.0)
        o['Vcrit_raw_beta2'] = vc
        o['Vcrit'] = min(vc, V)
        o['Vcrit_beta13'] = m_crit_form(db, T0, Tc, 1.3)
        o['Vcrit_beta18'] = m_crit_form(db, T0, Tc, 1.8)
    return o

BASE = dict(method='natural', buildingType='storage', hc=10.0, area=400.0, glen=20.0,
            gbre=20.0, reservoirs=1, poort=3.0, hst=3.0, Y=4.5, fireScenario='low1',
            reekb=1.5, sprinklers='geen', sprinklerTemp='68', tAmb=15.0, Ci=0.5, Ai=0.0,
            hw=1.5, hl=1.5, cv=0.6, mesh='none')

CASES = []
def add(cid, group, note, **d):
    CASES.append(dict(id=cid, group=group, note=note, inputs=dict(BASE, **d)))

for k in (1, 2, 3, 4):
    add('natural/low%d' % k, 'natural', 'Low-pile usage category %d, default hall.' % k,
        fireScenario='low%d' % k)
for Y in (3.0, 4.0, 5.0, 6.0, 7.0):
    add('natural/Y%.0f' % Y, 'natural',
        'Smoke-free height %.1f m in a 10 m hall - the plume and the layer depth both move.' % Y, Y=Y)
for hc in (6.0, 8.0, 14.0, 20.0):
    add('natural/hc%.0f' % hc, 'natural', 'Ceiling height %.1f m.' % hc, hc=hc, Y=min(4.5, hc - 1.5))
for t in (-5.0, 0.0, 25.0, 35.0):
    add('natural/tamb%+.0f' % t, 'natural', 'Ambient temperature %.0f degC.' % t, tAmb=t)
for Ai in (5.0, 15.0, 40.0, 100.0):
    add('natural/inlet%.0f' % Ai, 'natural',
        'Supplementary geometric inlet %.0f m2 at Ci = 0.5 - drives the inlet-resistance term.' % Ai, Ai=Ai)
for n in (2, 3, 5):
    add('natural/res%d' % n, 'natural',
        '%d equal smoke reservoirs: the inlet of one reservoir is fed through the vents of the '
        'others, so the area is a self-consistent solution.' % n, reservoirs=n, Ai=10.0)
add('natural/rack_none', 'natural', 'High racks, no sprinklers.', fireScenario='rack', hst=6.0, sprinklers='geen')
add('natural/rack_roof', 'natural', 'High racks, sprinklers under the roof.', fireScenario='rack', hst=6.0,
    sprinklers='onderdak', sprinklerTemp='68')
add('natural/rack_inrack', 'natural', 'High racks, in-rack sprinklers (convective fraction 0.5).',
    fireScenario='rack', hst=6.0, sprinklers='inrekken', sprinklerTemp='68')
add('natural/bulk_low', 'natural', 'Bulk stacking 2.5 m with sprinklers.', fireScenario='bulk', hst=2.5,
    sprinklers='onderdak', sprinklerTemp='68')
add('natural/bulk_mid', 'natural', 'Bulk stacking 3.5 m with sprinklers.', fireScenario='bulk', hst=3.5,
    sprinklers='onderdak', sprinklerTemp='68')
add('natural/hs', 'natural', 'High storage without sprinklers, fixed 9x9 m fire.', buildingType='hs')
add('natural/big', 'natural', 'Large reservoir 40 x 45 m.', glen=45.0, gbre=40.0, area=1800.0)
for m in ('mechanical',):
    for Y in (3.5, 4.5, 6.0):
        add('mech/Y%.1f' % Y, 'mechanical',
            'Mechanical extraction, smoke-free height %.1f m; fuel power doubles to 500 kW/m2.' % Y,
            method=m, Y=Y)
    add('mech/rack', 'mechanical', 'Mechanical extraction with high racks under roof sprinklers.',
        method=m, fireScenario='rack', hst=6.0, sprinklers='onderdak', sprinklerTemp='68')
    add('mech/tall', 'mechanical', 'Mechanical extraction in a 20 m hall.', method=m, hc=20.0, Y=6.0)
add('simplified/2pct', 'simplified', 'Simplified 2 % aerodynamic rule, conditions met.',
    buildingType='2pct')
add('simplified/3pct', 'simplified', 'Simplified 3 % geometric rule.', buildingType='3pct')
add('simplified/2pct_na', 'simplified',
    'Simplified 2 % rule outside its conditions (2500 m2) - must be refused.',
    buildingType='2pct', glen=50.0, gbre=50.0, area=2500.0)
add('simplified/2pct_stack', 'simplified',
    'Simplified 2 % rule with goods stacked above 70 % of the height - must be refused.',
    buildingType='2pct', hst=8.0)

for c in CASES:
    c['expected'] = solve(c['inputs'])

ref = dict(
    reference=('Large-fire plume Mf = 0.188 P Y^1.5 (BR258 / Thomas), the natural-ventilator '
               'area derived from the steady two-orifice buoyancy balance and solved both in '
               'closed form and by a scipy root find on the mass balance, the ideal-gas smoke '
               'volume flow, and the BR258 plugholing form - all implemented in python for this '
               'benchmark.'),
    citations=[
        'BRE Report BR258, G.O. Hansell and H.P. Morgan, "Design approaches for smoke control '
        'in atrium buildings": large-fire plume Mf = Ce P Y^(3/2) kg/s with Ce = 0.188 for large '
        'spaces (0.337 for small rooms), P the perimeter of the fire and Y the height from the '
        'base of the fire to the smoke layer; critical exhaust rate MCRIT = beta (g D^5 T0 U/T^2)^(1/2) '
        'with beta = 1.3 near a wall and 1.8 away from a wall.',
        'Smoke Control Association, "Guidance for the design of smoke ventilation systems for '
        'single storey buildings" (SVAIND3.394, 1994): section 12.4 "The design inlet velocity '
        'shall not exceed 5.0 m/s"; section 15.3 "the preferred aerodynamic area of inlet should '
        'be at least equal to the aerodynamic area of extract". '
        'https://groupscs.co.uk/wp-content/uploads/2020/10/'
        'SCA-guidance-for-smoke-ventilation-of-single-story-buildings-1994.pdf',
        'Belgian Royal Decree basic standards, annex 6, as quoted in the Belgian RWA guide '
        '"Gids voor CE-gekeurde Rook en Warmte Afvoersystemen": aerodynamic RWA area = 2 % of '
        'the roof area for a single smoke compartment of at most 2000 m2, with the smoke layer '
        'at most 30 % of the height, no goods stacked above 70 % of the height and inlet '
        'openings below the smoke layer. '
        'https://www.plastiekvw.be/Assets/Documents/Producten/Dak/1.1-Lichtkoepels/'
        '1.1.3-Opengaande-systemen/Technische-fiche/Doc-RWA-rook-en-warmte-afvoersystemen.pdf',
        'The natural-ventilator area equation Av Cv = (Mf/rho0) sqrt((Tc^2 + Sk^2 T0 Tc)/'
        '(2 g db theta T0)) is derived in bench-src/ref/gen_rwa.py from the two-orifice '
        'buoyancy balance; it is not quoted from a standard, and the derivation is reproduced '
        'in the docstring of that file.',
        'scipy 1.17.1 (brentq, xtol 1e-14) for the second, network-based solution.',
        'NBN S 21-208-1 "Brandbeveiliging van gebouwen - Ontwerp en berekening van rook- en '
        'warmteafvoerinstallaties (RWA) - Deel 1" is a paid national standard; its text could '
        'NOT be obtained for this pass. Nothing here is claimed to be benchmarked against it.',
    ],
    constants=dict(RHO=RHO, G=G, CE=CE, CP_SMOKE=CP_SMOKE, V_INLET_MAX=V_INLET_MAX),
    cases=CASES)
with open(_gp.ref('rwa_ref.json'), 'w') as f:
    json.dump(ref, f, indent=1)

wc = wi = 0.0
for c in CASES:
    e = c['expected']
    if e.get('AvCv_network'):
        d = abs(e['AvCv_network'] - e['required']) / e['required']
        if e.get('theta_consistent'): wc = max(wc, d)
        else: wi = max(wi, d)
print('cases', len(CASES))
print('closed form vs network root find, theta consistent with Tc: worst %.3e' % wc)
print('  ... sprinklered cases where the model decouples theta from Tc: up to %.1f %%' % (100 * wi))
b = [c for c in CASES if c['id'] == 'mech/Y4.5'][0]['expected']
print('plugholing at default: beta=2 -> %.2f m3/s, beta=1.8 -> %.2f, beta=1.3 -> %.2f'
      % (b['Vcrit'], b['Vcrit_beta18'], b['Vcrit_beta13']))
print('mech inlet: hot-volume basis %.2f m2 vs mass-balance basis %.2f m2 (ratio %.2f)'
      % (b['inletArea'], b['inletAreaMassBalance'], b['inletArea'] / b['inletAreaMassBalance']))
