#!/usr/bin/env python3
"""Independent reference for verwarmenkoelenselector.html (Heating & Cooling System Selector).

Standards implemented here from their published equations, not from the tool's code:

  EN 442-2 emitter characteristic
      Phi = Phi_50 * (dT_ln / dT_ln,50)^n,
      dT_ln = (theta_V - theta_R) / ln((theta_V - theta_i)/(theta_R - theta_i)),
      dT_ln,50 = 49.83 K at the 75/65/20 test point.
      The arithmetic-mean variant is computed alongside so the report can show what
      the wrong convention would give.

  EN 1264 embedded surface heating
      basic characteristic q = 8.92 (theta_F,m - theta_i)^1.1 W/m2 and its inversion,
      floor surface caps 29 / 35 / 33 degC (occupied zone / peripheral / bathroom).

Everything else in the tool (Carnot quality factors, capacity derating, coverage,
buffer and expansion sizing, degree-day balance) is closed-form arithmetic that is
recomputed here independently and graded as an identity.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math

# ---------------------------------------------------------------- EN 442-2
DT_NOM_LOG = 10.0 / math.log(55.0 / 45.0)          # 49.8329... K at 75/65/20
DT_NOM_ARI = 50.0
EXPONENT = {'radiator': 1.30, 'convector': 1.35, 'vloerconvector': 1.35,
            'ventilo': 1.00, 'luchtverwarmer': 1.00, 'paneel': 1.25, 'plafondpaneel': 1.25}

def dt_log(tv, tr, ti):
    a, b = tv - ti, tr - ti
    if a <= 0 or b <= 0: return 0.0
    if abs(a - b) < 1e-6: return a
    return (a - b) / math.log(a / b)

def dt_ari(tv, tr, ti):
    return 0.5 * (tv + tr) - ti

def emitter_factor(tv, tr, ti, kind):
    d = dt_log(tv, tr, ti)
    return 0.0 if d <= 0 else (d / 49.83) ** EXPONENT.get(kind, 1.3)

def emitter_factor_ari(tv, tr, ti, kind):
    d = dt_ari(tv, tr, ti)
    return 0.0 if d <= 0 else (d / DT_NOM_ARI) ** EXPONENT.get(kind, 1.3)

# ---------------------------------------------------------------- EN 1264
def surface_output(ts, ti):
    d = ts - ti
    return 8.92 * d ** 1.1 if d > 0 else 0.0

def surface_excess(q):
    return (q / 8.92) ** (1.0 / 1.1) if q > 0 else 0.0

R_SCREED = 0.045 / 1.2
SURFACE_LIMIT = {'vloer_verblijf': 29.0, 'vloer_rand': 35.0, 'vloer_badkamer': 33.0,
                 'wand': 40.0, 'plafond': 27.0}

def medium_temp(q, ti, R=0.09, spacing=0.15):
    if q <= 0: return ti
    f = max(0.5, 1 + (spacing - 0.15) * 1.2)
    return ti + surface_excess(q) + q * (max(0.0, R) + R_SCREED) * f

# ---------------------------------------------------------------- hydraulics / plant
RHO, CP = 1000.0, 4.187
def flow(kW, dT, glycol=0.0):
    if dT <= 0: return 0.0
    cp = CP * (1 - 0.0045 * glycol)
    rho = RHO * (1 + 0.0009 * glycol)
    return kW / (rho * cp * dT) * 3600.0

HP_QUALITY = {'lucht_water': 0.42, 'grond_boring': 0.50, 'grond_horizontaal': 0.48,
              'water_water': 0.52, 'afvoerlucht': 0.40, 'lucht_lucht': 0.40, 'hybride': 0.42}
AIR = ('lucht_water', 'lucht_lucht', 'hybride')
CAP_SLOPE, CAP_MAX, CAP_MIN = 0.022, 1.05, 0.35

def cop(t_source, t_sink, kind='lucht_water'):
    Ts, To = t_sink + 273.15, t_source + 273.15
    if Ts <= To: return 8.0
    c = HP_QUALITY.get(kind, 0.42) * Ts / (Ts - To)
    if kind in AIR and -8 < t_source < 7: c *= 0.88
    return max(1.0, min(c, 8.0))

def cap_factor(t_out, kind='lucht_water'):
    if kind not in AIR: return 1.0
    return max(CAP_MIN, min(CAP_MAX, 1 + (t_out - 7) * CAP_SLOPE))

def bivalent(load, t_design, t_room, hp7, kind):
    UA = load / (t_room - t_design) if (t_room - t_design) > 0 else 0.0
    if UA <= 0 or hp7 <= 0: return UA, t_design
    if kind not in AIR:
        p = t_room - hp7 / UA
    else:
        t_hi = 7 + (CAP_MAX - 1) / CAP_SLOPE
        t_lo = 7 + (CAP_MIN - 1) / CAP_SLOPE
        p = t_room - CAP_MAX * hp7 / UA
        if p < t_hi:
            p = (UA * t_room - hp7 * (1 - 7 * CAP_SLOPE)) / (UA + CAP_SLOPE * hp7)
            if p < t_lo: p = t_room - CAP_MIN * hp7 / UA
    if p > t_room: p = t_room
    if p < t_design: p = t_design
    return UA, p

def coverage(t_biv, t_design, t_room):
    if t_biv <= t_design: return 1.0
    span = (t_room - t_design) or 1.0
    x = (t_room - t_biv) / span
    return max(0.0, min(1.0, 1 - max(0.0, x) ** 2.6 * 0.55))

def buffer_volume(kW, mode, min_run=6.0, dt=5.0):
    if mode == 'geen': return 0
    return round(kW * min_run * 60.0 / (RHO / 1000.0 * CP * dt))

def expansion(vol, t_max=60.0, p_static=1.5, p_max=3.0):
    e = max(0.005, 0.00035 * (t_max - 10.0) + 0.0005)
    p0, pe = p_static + 0.3, p_max - 0.5
    return round(vol * e * ((pe + 1) / max(0.1, pe - p0)) * 1.1)

def dhw(persons, lpp=40.0, t_cold=10.0, t_store=55.0):
    daily_l = persons * lpp
    return daily_l, daily_l * (t_store - t_cold) * 1.163 / 1000.0

def annual(load, t_design, t_room, dd, cop_season):
    UA = load / (t_room - t_design) if (t_room - t_design) > 0 else 0.0
    heat = UA * dd * 24.0
    return UA, heat, (heat / cop_season if cop_season > 0 else 0.0)

# ---------------------------------------------------------------- case grid
DEF = dict(geb_area=180.0, bel_basis='specifiek', bel_spec_heat=45.0, bel_spec_cool=45.0,
           bel_cooling='ja', cnd_t_design=-8.0, cnd_t_room=20.0, cnd_t_room_cool=25.0,
           cnd_degree_days=2000.0, reg_t_flow=45.0, reg_t_return=40.0,
           reg_t_flow_cool=12.0, reg_t_return_cool=18.0, reg_glycol_pct=0.0,
           afg_types=['radiator'], afg_vloer_share=100.0, afg_vloer_coverage=80.0,
           afg_vloer_r=0.09, afg_vloer_spacing=0.15, afg_bestaand='ja',
           opw_type='lucht_water', opw_hp_kw=10.0, dhw_persons=4.0, dhw_l_person=40.0,
           dhw_t_cold=10.0, dhw_t_store=55.0, hyd_buffer='in_serie', hyd_min_run=6.0,
           hyd_buffer_dt=5.0, hyd_p_static=1.5, hyd_p_max=3.0, hyd_head_kpa=40.0)

REGIMES = [(75, 65), (70, 50), (60, 50), (55, 45), (50, 40), (45, 40), (45, 35), (45, 30),
           (40, 35), (38, 32), (35, 30), (35, 28), (30, 25), (28, 24)]
KINDS = ['radiator', 'convector', 'vloerconvector', 'paneel', 'ventilo', 'luchtverwarmer']

cases = []

# 1. the EN 442 law over regimes and emitter types
for tv, tr in REGIMES:
    for kind in KINDS:
        cases.append(dict(
            id='en442/%d_%d/%s' % (tv, tr, kind), group='en442',
            note='EN 442-2 derating of a %s at %d/%d/20 from the 75/65/20 rating.' % (kind, tv, tr),
            inputs=dict(DEF, reg_t_flow=float(tv), reg_t_return=float(tr), afg_types=[kind]),
            expected=dict(dt_log=dt_log(tv, tr, 20.0), dt_ari=dt_ari(tv, tr, 20.0),
                          factor=emitter_factor(tv, tr, 20.0, kind),
                          factor_arithmetic=emitter_factor_ari(tv, tr, 20.0, kind),
                          exponent=EXPONENT[kind],
                          required_nominal=(DEF['geb_area'] * DEF['bel_spec_heat'] / 1000.0)
                                           / emitter_factor(tv, tr, 20.0, kind)
                                           if emitter_factor(tv, tr, 20.0, kind) > 0 else None)))

# 2. EN 1264 floor heating
FLOORS = [(180.0, 45.0, 100.0, 80.0, 0.09, 0.15), (180.0, 70.0, 60.0, 80.0, 0.09, 0.15),
          (180.0, 70.0, 100.0, 60.0, 0.15, 0.15), (250.0, 30.0, 100.0, 90.0, 0.02, 0.10),
          (120.0, 90.0, 100.0, 80.0, 0.05, 0.20), (300.0, 25.0, 100.0, 100.0, 0.09, 0.15)]
for i, (area, spec, share, cov, R, sp) in enumerate(FLOORS):
    load = area * spec / 1000.0
    area_eff = area * (share / 100.0) * (cov / 100.0)
    q = load * 1000.0 * (share / 100.0) / area_eff if area_eff > 0 else 0.0
    cases.append(dict(
        id='en1264/floor%d' % (i + 1), group='en1264',
        note='EN 1264 floor heating: %.0f m2 at %.0f W/m2, %.0f %% share, %.0f %% laid area, '
             'covering R = %.2f m2K/W, spacing %.2f m.' % (area, spec, share, cov, R, sp),
        inputs=dict(DEF, geb_area=area, bel_spec_heat=spec, afg_types=['vloer'],
                    afg_vloer_share=share, afg_vloer_coverage=cov, afg_vloer_r=R,
                    afg_vloer_spacing=sp),
        expected=dict(area_eff=area_eff, q_need=q,
                      q_max=surface_output(SURFACE_LIMIT['vloer_verblijf'], 20.0),
                      t_surface=20.0 + surface_excess(q),
                      t_medium=medium_temp(q, 20.0, R, sp),
                      ok=q <= surface_output(SURFACE_LIMIT['vloer_verblijf'], 20.0))))

# 3. plant, hydraulics and the annual balance
PLANTS = [
    ('base', dict()),
    ('cold_design', dict(cnd_t_design=-15.0, bel_spec_heat=60.0)),
    ('ground', dict(opw_type='grond_boring', opw_source_t=5.0)),
    ('water', dict(opw_type='water_water', opw_source_t=10.0, reg_t_flow=40.0, reg_t_return=35.0)),
    ('undersized', dict(opw_hp_kw=4.0, bel_spec_heat=70.0)),
    ('oversized', dict(opw_hp_kw=25.0)),
    ('hot_regime', dict(reg_t_flow=60.0, reg_t_return=45.0)),
    ('glycol', dict(reg_glycol_pct=30.0)),
    ('big_dhw', dict(dhw_persons=12.0, dhw_t_store=60.0)),
    ('many_dd', dict(cnd_degree_days=3200.0, cnd_t_room=21.0)),
]
for cid, delta in PLANTS:
    A = dict(DEF); A.update(delta)
    load = A['geb_area'] * A['bel_spec_heat'] / 1000.0
    cool = A['geb_area'] * A['bel_spec_cool'] / 1000.0
    dT = max(0.5, A['reg_t_flow'] - A['reg_t_return'])
    dTc = max(0.5, A['reg_t_return_cool'] - A['reg_t_flow_cool'])
    src = A.get('opw_source_t', A['cnd_t_design'] if A['opw_type'] == 'lucht_water' else 5.0)
    cop_d = cop(src, A['reg_t_flow'], A['opw_type'])
    cop_m = cop(7.0, A['reg_t_flow'] - 8.0, A['opw_type'])
    cop_s = 0.3 * cop_d + 0.7 * cop_m
    UA, biv = bivalent(load, A['cnd_t_design'], A['cnd_t_room'], A['opw_hp_kw'], A['opw_type'])
    cap = A['opw_hp_kw'] * cap_factor(A['cnd_t_design'], A['opw_type'])
    _, heat, elec = annual(load, A['cnd_t_design'], A['cnd_t_room'], A['cnd_degree_days'], cop_s)
    daily_l, daily_kwh = dhw(A['dhw_persons'], A['dhw_l_person'], A['dhw_t_cold'], A['dhw_t_store'])
    sysv = round(load * 12)
    cases.append(dict(
        id='plant/%s' % cid, group='plant',
        note='Generator, hydraulics and degree-day balance: %s.' % cid,
        inputs=A,
        expected=dict(load=load, cool=cool, flow_heat=flow(load, dT, A['reg_glycol_pct']),
                      flow_cool=flow(cool, dTc, A['reg_glycol_pct']),
                      cop_design=cop_d, cop_mild=cop_m, cop_season=cop_s,
                      cop_dhw=cop(src, A['dhw_t_store'] + 5.0, A['opw_type']),
                      capacity_at_design=cap, backup=max(0.0, load - cap),
                      UA=UA, bivalent_point=biv,
                      coverage=coverage(biv, A['cnd_t_design'], A['cnd_t_room']),
                      buffer=buffer_volume(min(A['opw_hp_kw'], load), A['hyd_buffer'],
                                           A['hyd_min_run'], A['hyd_buffer_dt']),
                      defrost=round(A['opw_hp_kw'] * 12) if A['opw_type'] in ('lucht_water', 'hybride') else 0,
                      system_volume=sysv,
                      expansion=expansion(sysv, A['reg_t_flow'] + 10.0, A['hyd_p_static'], A['hyd_p_max']),
                      dhw_daily_l=daily_l, dhw_daily_kwh=daily_kwh,
                      heat_kwh=heat, elec_kwh=elec,
                      pump_power=flow(load, dT, A['reg_glycol_pct']) * A['hyd_head_kpa'] / 3.6 / 0.45 / 1000.0)))

ref = dict(
    reference=('EN 442-2 emitter characteristic Phi = Phi_50 (dT_ln/49.83)^n with the logarithmic '
               'mean excess temperature, and the EN 1264 basic characteristic q = 8.92 '
               '(theta_F,m - theta_i)^1.1 with its inversion and the standard floor surface caps, '
               'both implemented in python from the published equations; the plant, hydraulic and '
               'degree-day arithmetic is recomputed independently as closed-form identities.'),
    citations=[
        'EN 442-2, "Radiators and convectors - Part 2: Test methods and rating": nominal thermal '
        'output measured at 75/65/20 degC and converted with Phi = Phi_50 (dT_ln/dT_ln,50)^n.',
        'P. Sarbu et al. / L. Bagi et al., "Can we still trust in EN 442? New operating definitions '
        'for radiators, Part 1 and Part 2", REHVA Journal (2022): states the EN 442-2 conversion as '
        'Phi = Phi_50 (dT_ln/dT_ln,50)^n and the design point "75-65-20 degC, which means 50 K '
        '(dT_ln = 49.83 K) over-temperature"; reports measured exponents n = 1.26...1.35 and '
        'deviations up to about 10 % at reduced mass flow / increased spread. '
        'https://www.rehva.eu/rehva-journal/chapter/'
        'can-we-still-trust-in-en-442-new-operating-definitions-for-radiators-'
        'part-2-model-based-analysis-and-results',
        'buildingservicestutor.com, "Hydronic balancing step 4: calculate radiator output": '
        'confirms the logarithmic excess temperature convention and the 75/65/20 reference, and '
        'quotes n = 1.3 for panel radiators, 1.26 for towel radiators. '
        'https://www.buildingservicestutor.com/calculate-radiator-output/',
        'DIN EN 1264 basic characteristic curve for floor heating, q = 8.92 (theta_F,m - theta_i)^1.1 '
        'W/m2, as quoted at https://www.hilfreiche-tools.de/waermestromdichte-fussbodenheizung/',
        'EN 1264 floor surface temperature limits 29 degC (occupied zone), 35 degC (peripheral '
        'zone) and 33 degC (bathrooms), as quoted in Uponor, "Underfloor heating and cooling - '
        'planning principles", https://brandportal.uponor.com/m/7187327a41365ace/original/'
        'TI-planning-principles-UFHC-EN-1186660-v1.pdf',
    ],
    constants=dict(DT_NOM_LOG=DT_NOM_LOG, DT_NOM_USED_BY_TOOL=49.83, DT_NOM_ARI=DT_NOM_ARI,
                   EXPONENT=EXPONENT, R_SCREED=R_SCREED, SURFACE_LIMIT=SURFACE_LIMIT,
                   HP_QUALITY=HP_QUALITY),
    cases=cases)
with open(_gp.ref('verwarmenkoelenselector_ref.json'), 'w') as f:
    json.dump(ref, f, indent=1)

print('cases', len(cases))
print('dT_ln at 75/65/20 = %.5f K (tool uses 49.83)' % DT_NOM_LOG)
worst = max(abs(c['expected']['factor'] - c['expected']['factor_arithmetic'])
            / max(c['expected']['factor'], 1e-9) for c in cases if c['group'] == 'en442')
print('largest LMTD-vs-AMTD gap over the regime grid: %.2f %%' % (100 * worst))
for c in cases[:1] + [x for x in cases if x['group'] == 'en1264']:
    e = c['expected']
    if 't_medium' in e:
        print('%-18s q=%6.1f W/m2  t_surface=%5.2f  t_medium=%5.2f  medium>surface: %s'
              % (c['id'], e['q_need'], e['t_surface'], e['t_medium'], e['t_medium'] > e['t_surface']))
