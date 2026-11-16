#!/usr/bin/env python3
"""Build bench-src/ref/wallthermalcalculator_ref.json"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, sys, math
sys.path.insert(0, _gp.REF_DIR)
import gen_wall as G

# material carriers used only to hold rho/c (tool library values, treated as INPUTS)
RHO_C = {'gypsboard': (900, 1000), 'rc': (2400, 840), 'mw035': (35, 1030),
         'brick_solid': (1800, 880), 'eps35': (35, 1450), 'cmu': (1800, 840),
         'pir': (32, 1400), 'cemrend': (1800, 840), 'osb': (650, 1700),
         'softwood': (500, 1600), 'xps': (32, 1450), 'plywood': (700, 1600)}
SOFTWOOD = dict(lam=0.13, rho=500, c=1600)      # library frame material

def L(mat, d, lam=None, mu=None, cavity=False, Rfix=None, vent=None,
      frac=None, framemat=None):
    """one layer: reference dict + tool layer dict"""
    ref = dict(d=d)
    tl = dict(matId=mat, d=d)
    if cavity:
        ref['cavity'] = True
        if Rfix is not None: ref['Rfix'] = Rfix
        ref['mu'] = 1.0
        ref['rho'], ref['c'] = 1.2, 1005
    else:
        ref['lam'] = lam; ref['mu'] = mu
        ref['rho'], ref['c'] = RHO_C[mat]
        tl['lamOverride'] = lam; tl['muOverride'] = mu
    if vent: ref['vent'] = vent; tl['vent'] = vent
    if frac:
        ref['frac'] = frac; ref['framelam'] = SOFTWOOD['lam']
        ref['framerho'] = SOFTWOOD['rho']; ref['framec'] = SOFTWOOD['c']
        tl['frameFrac'] = frac; tl['frameMat'] = framemat or 'softwood'
    return ref, tl

def case(cid, note, layers, ti=20, rhi=50, te=-8, rhe=85, typ='wall',
         bridges=None, rsi=None, rse=None, hclass=2, monthly=None, cites=None):
    ref_layers = [x[0] for x in layers]
    tool_layers = [x[1] for x in layers]
    c = dict(type=typ, ti=ti, rhi=rhi, te=te, rhe=rhe, layers=ref_layers,
             bridges=bridges or [], rsi=rsi, rse=rse, humidityClass=hclass)
    r = G.assembly(c)
    ST = dict(type=typ, mode='heating', ti=ti, rhi=rhi, te=te, rhe=rhe,
              tiCool=26, teCool=32, rhiCool=55, rheCool=45,
              rsi=rsi, rse=rse, humidityClass=hclass,
              layers=tool_layers, bridges=bridges or [],
              orient='S', color='#e6e2d8', absorptance=0.45, albedo=0.2,
              keepTotal=False, snap=True, adjIndex=None,
              normSet='eu', targetU=0.24)
    exp = dict(
        R_T=r['R_T'], U=r['U'], Uc=r['Uc'], fRsi=r['fRsi'],
        thSi=r['thSi'], tdew=r['tdew'],
        theta=r['nodes_th'], psat=[G.psat(t) for t in r['nodes_th']],
        layerR=r['R'], layerSd=r['sd'],
        totalD=r['totalD'], mass=r['mass'],
        condensing=r['glaser']['condensing'],
        gc_day=r['glaser']['gTotal'] * 86400 * 1000,
        dew_where=r['dewpos']['where'], dew_mm=r['dewpos']['mm'],
        theta_e=te,
    )
    if r['dyn']:
        exp.update(kappaIn=r['dyn']['kappaIn'], decrement=r['dyn']['decrement'],
                   shift=r['dyn']['shift'])
    if any(l.get('frac') for l in ref_layers):
        exp.update(Rupper=r['Rupper'], Rlower=r['Rlower'])
    out = dict(id=cid, note=note, project=dict(v=1, ST=ST), expect=exp)
    if cites: out['citations'] = cites
    if monthly:
        te_m, rhe_m = monthly
        ab = G.annual_balance(c, te_m, rhe_m)
        out['project']['CLIM'] = dict(lat=52.1, lon=5.18, place='De Bilt (test)',
                                      monthlyTe=te_m, monthlyRhe=rhe_m)
        out['expect']['annual_peak'] = ab['peak']
        out['expect']['annual_dry'] = ab['endsDry']
        out['monthly'] = dict(te=te_m, rhe=rhe_m)
    return out

CASES = []

# ---- 1. published worked example: solid masonry wall -------------------------
CASES.append(case('pub-solid-masonry',
    'Published worked example: 13 mm lightweight plaster + 100 mm dense concrete '
    'block + 20 mm sand/cement render; published R_T = 0.350 m2K/W, U = 2.86 W/m2K',
    [L('gypsboard', 13, 0.18, 10), L('rc', 100, 1.13, 130), L('cemrend', 20, 1.00, 20)],
    cites=['u-value.com, "How to calculate U-values: the ISO 6946 method with worked '
           'examples", Example 1 (accessed 2026-08-11)']))

# ---- 2. published worked example: insulated cavity wall ----------------------
CASES.append(case('pub-cavity-pir',
    'Published worked example: 15 mm plasterboard + 100 mm medium-density block + '
    '100 mm PIR + 50 mm air cavity (R = 0.18) + 102.5 mm brick; published '
    'R_T = 5.295 m2K/W, U = 0.189 W/m2K',
    [L('gypsboard', 15, 0.21, 10), L('cmu', 100, 0.51, 60), L('pir', 100, 0.022, 100),
     L('air50', 50, cavity=True), L('brick_solid', 102.5, 0.77, 10)],
    cites=['u-value.com, "How to calculate U-values: the ISO 6946 method with worked '
           'examples", Example 2 (accessed 2026-08-11)']))

# ---- 3. roof, upward heat flow, air layer 25 mm ------------------------------
CASES.append(case('roof-upward',
    'Roof, upward heat flow: Rsi = 0.10, Rse = 0.04 (ISO 6946 Table 7); 25 mm '
    'unventilated air layer, upward R = 0.16 (Table D.1)',
    [L('gypsboard', 12.5, 0.25, 10), L('air25', 25, cavity=True),
     L('mw035', 200, 0.035, 1), L('osb', 18, 0.13, 200)],
    typ='roof', ti=20, rhi=50, te=-10, rhe=90))

# ---- 4. floor, downward heat flow -------------------------------------------
CASES.append(case('floor-downward',
    'Floor, downward heat flow: Rsi = 0.17 (Table 7); 50 mm unventilated air '
    'layer, downward R = 0.21 (Table D.1)',
    [L('plywood', 22, 0.15, 150), L('air50', 50, cavity=True),
     L('mw035', 120, 0.035, 1), L('rc', 150, 2.04, 130)],
    typ='floor', ti=20, rhi=50, te=5, rhe=80))

# ---- 5. multilayer wall: full temperature and psat profile -------------------
CASES.append(case('profile-5layer',
    'Five-layer wall - checks R, U, fRsi, the temperature at every interface, '
    'psat at every interface, the dew-point crossing and the ISO 13786 dynamic '
    'response',
    [L('gypsboard', 12.5, 0.25, 10), L('rc', 200, 2.04, 130),
     L('mw035', 140, 0.035, 1), L('air25', 25, cavity=True),
     L('brick_solid', 102.5, 0.81, 10)],
    ti=21, rhi=55, te=-12, rhe=90))

# ---- 6. condensing assembly (internal insulation) ---------------------------
CASES.append(case('glaser-condensing',
    'Internal insulation - vapour pressure line exceeds saturation, so the Glaser '
    'construction has an interior vertex; checks the condensation rate g '
    'and the interface it is placed at',
    [L('gypsboard', 12.5, 0.25, 10), L('eps35', 60, 0.035, 60),
     L('rc', 200, 2.04, 130), L('cemrend', 20, 0.93, 20)],
    ti=20, rhi=60, te=-5, rhe=90))

# ---- 7. combined method with a framed layer ---------------------------------
CASES.append(case('framed-combined',
    'Timber-framed layer, ISO 6946 6.7 combined method: 140 mm mineral wool with '
    '12 % softwood studs (lambda 0.13); checks the upper and lower limits and '
    'their mean',
    [L('gypsboard', 12.5, 0.25, 10),
     L('mw035', 140, 0.035, 1, frac=12), L('osb', 12, 0.13, 200)],
    ti=20, rhi=50, te=-8, rhe=85))

# ---- 8. thermal bridges ------------------------------------------------------
CASES.append(case('bridges',
    'Point and linear thermal bridges added to U (ISO 6946 6.6): '
    'psi = 0.06 W/(m K) x 2.5 m/m2 and chi = 0.004 W/K x 3 /m2',
    [L('gypsboard', 12.5, 0.25, 10), L('rc', 200, 2.04, 130),
     L('xps', 120, 0.032, 150), L('cemrend', 15, 0.93, 20)],
    bridges=[dict(name='lintel', kind='linear', psi=0.06, qty=2.5),
             dict(name='fixing', kind='point', chi=0.004, qty=3)],
    ti=20, rhi=50, te=-8, rhe=85))

# ---- 9. air layer thickness: Table D.1 interpolation ------------------------
CASES.append(case('air-40mm-downward',
    'Unventilated air layer of 40 mm with downward heat flow: ISO 6946 Table D.1 '
    'gives 0.21 at 50 mm and 0.19 at 25 mm, so 40 mm interpolates to 0.204',
    [L('plywood', 22, 0.15, 150), L('air25', 40, cavity=True),
     L('mw035', 100, 0.035, 1), L('rc', 150, 2.04, 130)],
    typ='floor', ti=20, rhi=50, te=5, rhe=80))

# ---- 10. well ventilated cavity ---------------------------------------------
CASES.append(case('well-ventilated',
    'Well ventilated air layer (ISO 6946 6.9.4): the air layer and every layer '
    'outside it are disregarded and Rse is taken equal to the still-air Rsi',
    [L('gypsboard', 12.5, 0.25, 10), L('mw035', 160, 0.035, 1),
     L('osb', 12, 0.13, 200), L('air50', 40, cavity=True, vent='strong'),
     L('brick_solid', 102.5, 0.81, 10)],
    ti=20, rhi=50, te=-8, rhe=85))

# ---- 11. annual moisture balance --------------------------------------------
TE = [3.4, 3.6, 6.3, 9.6, 13.4, 16.0, 18.1, 17.8, 14.7, 10.8, 7.0, 4.1]
RHE = [87, 84, 79, 74, 75, 77, 78, 80, 84, 86, 88, 88]
CASES.append(case('annual-balance',
    'Annual interstitial condensation balance (ISO 13788 clause 6) for a wall '
    'with an interior vapour-tight finish, using a fixed monthly climate supplied '
    'with the project; humidity class 3 (p_i = p_e + dp)',
    [L('gypsboard', 12.5, 0.25, 10), L('eps35', 50, 0.035, 60),
     L('rc', 200, 2.04, 130), L('cemrend', 20, 0.93, 20)],
    ti=20, rhi=55, te=-8, rhe=85, hclass=2, monthly=(TE, RHE)))

# ---- 12. slightly ventilated cavity ------------------------------------------
CASES.append(case('slightly-ventilated',
    'Slightly ventilated air layer (ISO 6946 6.9.3): R_tot interpolated between '
    'the unventilated and the well ventilated construction, Av = 1000 mm2/m',
    [L('gypsboard', 12.5, 0.25, 10), L('mw035', 150, 0.035, 1),
     L('osb', 12, 0.13, 200), L('air50', 40, cavity=True, vent='slight'),
     L('brick_solid', 102.5, 0.81, 10)],
    ti=20, rhi=50, te=-8, rhe=85))

# ---- 13. low emissivity cavity ----------------------------------------------
CASES.append(case('lowe-cavity',
    'Low-emissivity cavity: outside the high-emissivity Table D.1, so it keeps '
    'its own tabulated resistance (0.44 horizontal) at any thickness',
    [L('gypsboard', 12.5, 0.25, 10), L('mw035', 100, 0.035, 1),
     L('air_lowe', 25, cavity=True, Rfix=0.44), L('brick_solid', 102.5, 0.81, 10)],
    ti=20, rhi=50, te=-8, rhe=85))

ref = dict(
    tool='wallthermalcalculator',
    generated_by='gen_wall.py + gen_wall_cases.py (independent python implementation)',
    standards=[
        'EN ISO 6946:2017 - 6.1 (R = d/lambda), 6.6 (thermal bridges), 6.7 '
        '(combined method), 6.9.4 (well ventilated air layers), Table 7 (surface '
        'resistances), Table D.1 (unventilated air layers)',
        'EN ISO 13788:2012 - clause 4.2 (internal humidity classes), clause 6 '
        '(Glaser interstitial condensation and the annual balance), Annex E '
        '(E.1/E.2 saturation vapour pressure, E.3 dew point)',
        'EN ISO 13786:2017 - Annex A (heat transfer matrix, periodic thermal '
        'transmittance, areal heat capacity, time shift)'],
    cases=CASES)

# ---- cross-check of the ISO 13788 Annex E correlation against CoolProp -------
try:
    from CoolProp.CoolProp import PropsSI
    dev = []
    for th in [0.01, 5, 10, 15, 20, 25, 30, 40]:
        iso = G.psat(th)
        iap = PropsSI('P', 'T', th + 273.15, 'Q', 0, 'Water')
        dev.append(dict(theta=th, iso13788=iso, coolprop=iap, rel=(iso - iap) / iap))
    ref['crosscheck'] = dict(
        what='EN ISO 13788 Annex E (E.1) saturation vapour pressure vs CoolProp '
             '8.0.0 (IAPWS-95) saturation pressure of water, 0-40 C',
        max_rel=max(abs(d['rel']) for d in dev),
        points=dev,
        note='E.1 is a fitted Magnus expression, not an equation of state; the '
             'deviation below is the correlation own scatter and is NOT used to '
             'grade the tool - the tool is graded on implementing E.1/E.2 '
             'faithfully. Below 0 C there is no liquid saturation branch in '
             'CoolProp, so E.2 is not cross-checked.')
except Exception as e:
    ref['crosscheck'] = dict(error=str(e))

json.dump(ref, open(_gp.ref('wallthermalcalculator_ref.json'), 'w'), indent=1)
print('cases:', len(CASES))
for c in CASES:
    e = c['expect']
    print(f"{c['id']:22s} R_T={e['R_T']:.4f} U={e['U']:.4f} Uc={e['Uc']:.4f} "
          f"fRsi={e['fRsi']:.4f} cond={e['condensing']} g={e['gc_day']:.3f} "
          f"dew={e['dew_where']}@{e['dew_mm']:.1f}mm "
          f"peak={e.get('annual_peak','-')}")
