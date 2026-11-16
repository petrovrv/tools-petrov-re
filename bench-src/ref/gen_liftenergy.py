"""Independent reference for liftenergy.html (Lift Energy & Efficiency Class).

Written from the published method, not from vt-energy.js:
  * ISO 25745-2:2015 Table 1 (trips per day by usage category), Table 2 (2015 text; Amd.1:2023 not read)
    (percentage of average travel distance), Formulae (1)-(5).
  * ISO 25745-2:2015 Table 3 (average car load %Q, usage categories 1-6), load-factor Formulae (6)-(11)
    (traction 50/40/30 %, hydraulic 0/35/70 %), Table 4 (idle / standby 5 min / standby 30 min time ratios),
    Formulae (12)-(15) (average trip time, non-running energy), Formula (18) and Tables 5-7 (classification),
    Annex B worked example — read in the licensed text 2026-11-06 (bw-r1, D-BW-8), replacing the ISO/DIS tables
    of G. Barney, A. Lorente, "Simplified Energy Calculations for Lifts Based on ISO/DIS 25745-2" (2013); their two
    worked examples stay as cases with their own (DIS) car load entered as an override.
  * VDI 4707 Blatt 1 (March 2009) Tables 1-3 and Eq. 1 (classes, default) — as reprinted in Unholzer, Michl,
    Luetzkendorf, Zukunft Bau "Energiekennwerte von Personenaufzuegen" (2015) Tables 3, 5, 6, 7; certificates
    "Reference: VDI 4707 Part 1 (Issue March 2009)" in the Schindler VDI 4707 brochure (printed inputs + kWh/a).
  * VDI 4707 draft (December 2007), Tables 1-4 and section 4.5 (classes, legacy option).

Output: bench-src/ref/liftenergy_ref.json — a list of cases {id, note, state, expect, published?}.
`state` is written in the page's state vocabulary (window.__liftenergy.state keys); `expect` holds the
values computed here; `published` holds numbers printed in the sources for the worked examples.
Run:  python bench-src/ref/gen_liftenergy.py
"""
import json
import math
import os

# ---- ISO 25745-2:2015 Table 1 ------------------------------------------------------------
TRIPS = {1: 50, 2: 125, 3: 300, 4: 750, 5: 1500, 6: 2500}
UPPER = [(1, 75), (2, 200), (3, 500), (4, 1000), (5, 2000)]  # typical range upper bounds (exclusive)


def category_of(trips):
    for cat, hi in UPPER:
        if trips < hi:
            return cat
    return 6


# ---- ISO 25745-2 Table 2 (2015 text) ---------------------------------------------------
def travel_percent(cat, stops):
    if stops <= 2:
        return 100.0
    if stops == 3:
        return 67.0
    return {1: 49.0, 2: 49.0, 3: 49.0, 4: 44.0, 5: 39.0, 6: 32.0}[cat]


# ---- ISO 25745-2:2015 Table 3: rows by rated load, columns UC 1-3 | 4 | 5 | 6 ----------------
LOAD_TABLE = [(800, (7.5, 9.0, 13.0, 19.0)), (1275, (4.5, 6.0, 8.2, 13.5)), (2000, (3.0, 3.5, 5.0, 9.0)), (float('inf'), (2.0, 2.2, 3.0, 6.0))]


def car_load_percent(cat, rated):
    col = {1: 0, 2: 0, 3: 0, 4: 1, 5: 2, 6: 3}[cat]
    for qmax, vals in LOAD_TABLE:
        if rated <= qmax:
            return vals[col]


# ---- ISO 25745-2:2015 Formulae (6)-(11) --------------------------------------------------------
def load_factor(kind, balance, pct):
    b = str(balance)
    if kind == 'traction':
        if b not in ('50', '40', '30'):
            raise ValueError('unknown traction counterbalance %r (Formulae (6)-(8) cover 50/40/30 %%)' % balance)
        return 1 - pct * {'50': 0.0164, '40': 0.0192, '30': 0.0197}[b]
    if b not in ('0', '35', '70'):
        raise ValueError('unknown hydraulic counterbalance %r (Formulae (9)-(11) cover 0/35/70 %%)' % balance)
    # hydraulic: ISO/DIS sign + (2015 print shows 1 - c*%Q, taken as a misprint, D-BW-10)
    return 1 + pct * {'0': 0.0071, '35': 0.0100, '70': 0.0187}[b]


# ---- ISO 25745-2:2015 Table 4: R_id, R_st5, R_st30 in % of the non-running time, UC 1..6 -------
TIME_RATIOS = {1: (13, 55, 32), 2: (23, 45, 32), 3: (36, 31, 33), 4: (45, 19, 36), 5: (42, 17, 41), 6: (42, 17, 41)}
# ---- ISO 25745-2:2015 Tables 5 and 6: upper limits of performance levels 1..6 ------------------
RUN_LEVEL = [0.72, 1.08, 1.62, 2.43, 3.65, 5.47]
POWER_LEVEL = [50, 100, 200, 400, 800, 1600]


def level(value, limits):
    for i, lim in enumerate(limits):
        if value <= lim + 1e-12:
            return i + 1
    return len(limits) + 1

LETTERS = 'ABCDEFG'
# ---- VDI 4707 Blatt 1, March 2009 (Zukunft Bau 2015: Table 3 categories, Table 5 standby W, Table 6 travel) ----
V9_STANDBY = [50, 100, 200, 400, 800, 1600]
V9_TRAVEL = [0.56, 0.84, 1.26, 1.89, 2.80, 4.20]
V9_HOURS = {1: 0.2, 2: 0.5, 3: 1.5, 4: 3.0, 5: 6.0}
V9_STANDBY_H = {1: 23.8, 2: 23.5, 3: 22.5, 4: 21.0, 5: 18.0}


def v9_category(hours):
    # Table 3 ranges: <= 0.3 | > 0.3-1 | > 1-2 | > 2-4.5 | > 4.5 h of travel a day
    for cat, hi in ((1, 0.3), (2, 1.0), (3, 2.0), (4, 4.5)):
        if hours <= hi:
            return cat
    return 5


def v9_overall_limits(cat, q, v):
    # Eq. 1: e = e_travel + P_st * t_standby / (Q * v * t_travel); a class limit uses the same-letter limits
    # of Tables 5 and 6 for the lift's own Q and v (Table 7 prints them for 630 kg, 1 m/s)
    s_m = v * V9_HOURS[cat] * 3600
    return [V9_TRAVEL[k] + V9_STANDBY[k] * V9_STANDBY_H[cat] * 1000 / (q * s_m) for k in range(6)]


# ---- VDI 4707 draft 2007 ------------------------------------------------------------------
STANDBY_LIM = [50, 100, 200, 400, 800, 1600]
TRAVEL_LIM = [0.8, 1.2, 1.8, 2.7, 4.0, 6.0]
VDI_HOURS = {1: 0.5, 2: 1.5, 3: 3.0, 4: 6.0}
VDI_STANDBY_H = {1: 23.5, 2: 22.5, 3: 21.0, 4: 18.0}
OVERALL_LIM = {1: [1.45, 2.51, 4.41, 7.92, 14.41, 26.88], 2: [1.01, 1.62, 2.63, 4.37, 7.33, 12.67],
               3: [0.90, 1.39, 2.19, 3.48, 5.56, 9.11], 4: [0.84, 1.28, 1.97, 3.04, 4.67, 7.33]}


def letter(value, limits):
    for i, lim in enumerate(limits):
        if value <= lim + 1e-12:
            return LETTERS[i]
    return 'G'


def vdi_category(hours):
    if hours <= 1:
        return 1
    if hours <= 2:
        return 2
    if hours <= 4.5:
        return 3
    return 4


# Typical specific running energy per drive (the page's learning assumptions are INPUT data here,
# taken from the page's own drive list; the bench checks the method, not these numbers).
TRACTION = {'gearless_regen': True, 'gearless': True, 'geared_vvvf': True, 'geared_2speed': True, 'hydraulic': False}


def reference(s):
    kind = 'traction' if TRACTION[s['drive']] else 'hydraulic'
    if s['nd_mode'] == 'trips':
        n_d = float(s['nd'])
        cat = category_of(n_d)
    else:
        cat = int(s['cat'])
        n_d = float(TRIPS[cat])
    ovr = bool(s.get('ovr'))
    pav = float(s['pav']) if ovr else travel_percent(cat, int(round(s['stops'])))
    pct = float(s['pctQ']) if ovr else car_load_percent(cat, s['Q'])
    r_id, r_5, r_30 = TIME_RATIOS[cat]
    rid = float(s['Rid']) if ovr else r_id / 100.0
    rst5 = (1 - rid) * r_5 / (r_5 + r_30)       # a user idle share keeps the Table 4 split of the standby time
    rst30 = (1 - rid) - rst5
    p_st30 = float(s['Pst30']) if s.get('on_st30') else s['Pst']   # Note to 5.3.4: no 30-min level -> same power
    s_rc = float(s['travel_m'])
    s_av = s_rc * pav / 100.0
    k_l = load_factor(kind, s['balance'], pct)
    if s['erc_mode'] == 'measured':
        e_rc = float(s['Erc'])
    else:
        e_rc = s['e_spr'] * s['Q'] * 2 * s_rc / 1000.0
    short = s['erc_mode'] == 'measured' and s.get('Esc', 0) > 0 and s.get('ssc', 0) > 0 and s['ssc'] < s_rc
    if short:
        e_rm = (e_rc - s['Esc']) / (2 * (s_rc - s['ssc']))      # (1)
        e_ssc = (e_rc - e_rm * s_rc * 2) / 2                   # (2)
        e_rav = e_rm * s_av * 2 + e_ssc * 2                    # (3)
    else:
        e_rav = e_rc * s_av / s_rc                             # (4)
    e_rd = k_l * n_d * e_rav / 2                               # (5)
    v, a, j, td = s['v'], s['a'], s['j'], s['td']
    t_av = s_av / v + v / a + a / j + td                       # (13)
    saturated = n_d * t_av / 3600 > 24
    t_nr = max(0.0, 24 - n_d * t_av / 3600)
    e_nr = t_nr * (s['Pid'] * rid + s['Pst'] * rst5 + p_st30 * rst30)   # (15)
    e_d = e_rd + e_nr
    e_y = e_d * s['days'] / 1000
    e_travel = e_rc * 1000 / (s['Q'] * 2 * s_rc)
    hours = n_d * (t_av - td) / 3600
    if s.get('vdi_edition', '2009') == '2007':   # draft 2007 classes (legacy)
        vcat = vdi_category(hours)
        dist = v * VDI_HOURS[vcat] * 3600
        e_spec = (e_travel * s['Q'] * dist + s['Pst'] * VDI_STANDBY_H[vcat] * 1000) / (dist * s['Q'])
        st_lim, tr_lim, ov_lim, st_h = STANDBY_LIM, TRAVEL_LIM, OVERALL_LIM[vcat], VDI_STANDBY_H[vcat]
    else:                                        # VDI 4707 Blatt 1 (2009)
        vcat = v9_category(hours)
        dist = v * V9_HOURS[vcat] * 3600
        e_spec = e_travel + s['Pst'] * V9_STANDBY_H[vcat] * 1000 / (s['Q'] * dist)
        st_lim, tr_lim, ov_lim, st_h = V9_STANDBY, V9_TRAVEL, v9_overall_limits(vcat, s['Q'], v), V9_STANDBY_H[vcat]
    year = (s['Pst'] * st_h + e_travel * s['Q'] * dist / 1000) * s['days'] / 1000
    e_spc = 1000 * k_l * e_rav / (s['Q'] * 2 * s_av)          # (18)
    iso_lim = [RUN_LEVEL[i] * s['Q'] * n_d * s_av / 1000 + POWER_LEVEL[i] * t_nr for i in range(6)]   # Table 7
    return {
        'iso_cls': letter(e_d, iso_lim), 'iso_Espc': e_spc, 'iso_lvl': [level(e_spc, RUN_LEVEL), level(s['Pid'], POWER_LEVEL), level(s['Pst'], POWER_LEVEL), level(p_st30, POWER_LEVEL)],
        'cat': cat, 'nd': n_d, 'pav': pav, 'pctQ': pct, 'kL': k_l, 'Rid': rid, 'Erc': e_rc, 'Erav': e_rav,
        'Erd': e_rd, 't_av': t_av, 'Enr': e_nr, 'Ed': e_d, 'Ey': e_y,
        'vdi_cat': vcat, 'vdi_standby': letter(s['Pst'], st_lim), 'vdi_travel': letter(e_travel, tr_lim),
        'vdi_spec': e_spec, 'vdi_overall': letter(e_spec, ov_lim), 'vdi_year': year, 'saturated': saturated,
    }


BASE = dict(Q=1000, v=1.6, a=0.8, j=1.0, travel_m=30, stops=10, td=8, drive='gearless', balance='50', n_cars=1,
            nd_mode='category', cat=3, nd=300, days=260, erc_mode='typical', e_spr=0.55, Erc=50, Esc=0, ssc=0,
            Pid=300, Pst=150, on_st30=False, Pst30=100, light_in_standby=True, ovr=False, pav=49, pctQ=4.5, Rid=0.36, vdi_edition='2009')


def case(cid, note, published=None, **kw):
    s = dict(BASE)
    s.update(kw)
    c = {'id': cid, 'note': note, 'state': s, 'expect': reference(s)}
    if published:
        c['published'] = published
    return c


CASES = [
    case('barney-ex1', 'Barney & Lorente 2013 example 1 (traction, office, UC5, DIS %S 33 %)',
         published={'source': 'Barney & Lorente 2013 §5.1', 'Ed': 41676, 'Enr': 4229, 'Erd': 37447, 'tol_rel': 0.006,
                    'why_tol': 'the paper rounds kL to 0.89 and s_av to 25 m (in t_av); with those rounded inputs the '
                               'printed numbers are reproduced to <= 0.05 % (rounded_check)',
                    'rounded_check': {'kL': 0.89, 'sav_tav': 25.0, 'tol_rel': 0.0005}},
         Q=1600, v=2.5, a=1.0, j=1.25, travel_m=75, stops=20, td=8, drive='gearless', nd_mode='trips', nd=1500,
         erc_mode='measured', Erc=170, ovr=True, pav=33, pctQ=7.0, Rid=0.42, Pid=500, Pst=120),
    case('barney-ex2', 'Barney & Lorente 2013 example 2 (hydraulic, residential, UC1, DIS %S 44 %)',
         published={'source': 'Barney & Lorente 2013 §5.2', 'Ed': 1428, 'Enr': 797, 'Erd': 631, 'tol_rel': 0.006,
                    'why_tol': 'the paper rounds kL to 1.05 and s_av to 5.7 m; with those the printed Ed and Erd are reproduced '
                               'to <= 0.05 %, Enr to 0.09 % (797.7 printed as 797)',
                    'rounded_check': {'kL': 1.05, 'sav_tav': 5.7, 'tol_rel': 0.0005, 'tol_rel_Enr': 0.001}},
         Q=500, v=0.6, a=0.3, j=0.5, travel_m=13, stops=5, td=8, drive='hydraulic', balance='0', nd_mode='trips', nd=30,
         erc_mode='measured', Erc=91, ovr=True, pav=44, pctQ=7.5, Rid=0.13, Pid=50, Pst=31, days=365),
    case('vdi-example', 'VDI 4707 draft 2007 §4.7 worked example (320 kg hydraulic, 8.93 mWh/(kg m), 110 W)',
         published={'source': 'VDI 4707 draft 2007 §4.7', 'vdi_spec': 16.05, 'vdi_overall': 'F', 'vdi_standby': 'C', 'vdi_travel': 'G', 'tol_abs': 0.02},
         Q=320, v=0.63, a=0.5, j=0.8, travel_m=11.2, stops=5, drive='hydraulic', balance='0', nd_mode='trips', nd=100,
         erc_mode='typical', e_spr=8.93, Pid=150, Pst=110, days=365, vdi_edition='2007'),
    # certificates issued under VDI 4707 Part 1 (Issue March 2009), Schindler brochure; travel/standby classes and the
    # nominal kWh/a are printed; trips are chosen inside the printed usage category (the page needs a trip count)
    case('vdi2009-cert-cat5', 'Schindler 7000 certificate, VDI 4707-1:2009, usage category 5 (1600 kg, 4 m/s, 294 W, 0.462)',
         published={'source': 'Schindler VDI 4707 brochure, certificate 13.04.2010', 'vdi_year': 25267, 'vdi_overall': 'A', 'vdi_standby': 'D',
                    'vdi_travel': 'A', 'vdi_cat': 5, 'tol_rel': 0.002, 'why_tol': 'printed inputs are rounded (294 W, 0.462 mWh/(kg m))'},
         Q=1600, v=4.0, a=1.0, j=1.5, travel_m=150, stops=30, drive='gearless_regen', nd_mode='trips', nd=1900,
         erc_mode='typical', e_spr=0.462, ovr=True, pav=39, pctQ=7.0, Rid=0.42, Pid=294, Pst=294, days=365),
    case('vdi2009-cert-cat4', 'Schindler 3300 AP certificate, VDI 4707-1:2009, usage category 4 (1000 kg, 1.75 m/s, 71 W, 0.537)',
         published={'source': 'Schindler VDI 4707 brochure, certificate 16.04.2010', 'vdi_year': 4246, 'vdi_standby': 'B', 'vdi_travel': 'A',
                    'vdi_cat': 4, 'tol_rel': 0.001,
                    'why_tol': 'overall class not compared: with the rounded printed 71 W / 0.537 the value is 0.05 % above the A limit (certificate: A)'},
         Q=1000, v=1.75, a=0.8, j=1.0, travel_m=30, stops=10, drive='gearless', nd_mode='trips', nd=1200,
         erc_mode='typical', e_spr=0.537, Pid=71, Pst=71, days=365),
    # 2009 usage categories 1..5 from trips (travel hours), 630 kg / 1 m/s as in Table 7
    case('vdi2009-630-cat1', '630 kg 1 m/s, few trips -> VDI 2009 category 1', Q=630, v=1.0, travel_m=15, stops=6, nd_mode='trips', nd=40, e_spr=0.9, drive='geared_vvvf', Pst=90),
    case('vdi2009-630-cat3', '630 kg 1 m/s -> VDI 2009 category 3', Q=630, v=1.0, travel_m=30, stops=11, nd_mode='trips', nd=320, e_spr=0.9, drive='geared_vvvf', Pst=180),
    case('vdi2009-630-cat5', '630 kg 1 m/s, very busy -> VDI 2009 category 5', Q=630, v=1.0, travel_m=30, stops=11, nd_mode='trips', nd=1900, e_spr=0.5, drive='gearless', Pst=300),
    case('legacy-2007-office', 'the same office lift with the draft-2007 classes', vdi_edition='2007', cat=4, Q=1275, v=2.5, travel_m=60.5, stops=17, e_spr=0.55),
]
# a grid over the table lookups and branches
for cat in range(1, 7):
    CASES.append(case('cat%d-office' % cat, 'usage category %d, 1275 kg gearless, 17 stops' % cat,
                      Q=1275, v=2.5, a=1.0, j=1.5, travel_m=60.5, stops=17, td=7, cat=cat, Pid=400, Pst=250))
for q in (630, 800, 1000, 1600, 2500):
    CASES.append(case('load-%d' % q, 'rated load %d kg, UC4' % q, Q=q, cat=4))
for stops in (2, 3, 4):
    CASES.append(case('stops-%d' % stops, '%d stopping floors, UC5' % stops, stops=stops, cat=5, travel_m=3.2 * (stops - 1)))
for drv, bal in (('geared_2speed', '40'), ('geared_vvvf', '50'), ('hydraulic', '0'), ('hydraulic', '35'), ('hydraulic', '70'), ('gearless_regen', '50')):
    e = {'geared_2speed': 1.6, 'geared_vvvf': 0.9, 'hydraulic': 5.0, 'gearless_regen': 0.4}[drv]
    CASES.append(case('drive-%s-%s' % (drv, bal), '%s, counterbalance %s' % (drv, bal), drive=drv, balance=bal, e_spr=e, cat=2, v=1.0 if drv != 'hydraulic' else 0.63, travel_m=12 if drv == 'hydraulic' else 30, stops=5 if drv == 'hydraulic' else 10))
for nd in (40, 180, 650, 1800, 1999, 2000, 4000):
    CASES.append(case('trips-%d' % nd, 'known trips %d/day' % nd, nd_mode='trips', nd=nd))
CASES.append(case('short-cycle', 'measured reference and short cycle -> ISO Formulae (1)-(3)', erc_mode='measured', Erc=95, Esc=52, ssc=12, travel_m=40, stops=14, cat=3))
CASES.append(case('override', 'overridden table values', ovr=True, pav=37.5, pctQ=8.0, Rid=0.5, cat=4))
CASES.append(case('saturated', 'more trips than 24 h allow (category 5, slow lift)', nd_mode='trips', nd=1900, travel_m=90, stops=30, v=0.4))
CASES.append(case('iso-annex-b', 'ISO 25745-2:2015 Annex B example (1500 kg traction, 750 trips, short cycle, Pst5 300 / Pst30 120 W) -> class B',
                  published={'source': 'ISO 25745-2:2015 Annex B (annex prints 18/37 % standby ratios, Table 4 cat 4 has 19/36)', 'Erd': 30315, 'Ed': 36427, 'tol_rel': 0.004, 'iso_cls': 'B'},
                  Q=1500, v=2.5, a=1.0, j=1.25, travel_m=75, stops=20, td=8, drive='gearless', balance='50', nd_mode='trips', nd=750,
                  erc_mode='measured', Erc=170, Esc=120, ssc=50, Pid=500, Pst=300, on_st30=True, Pst30=120, days=365))
CASES.append(case('traction-30', 'traction lift counterbalanced to 30 % (Formula (8)), UC5', balance='30', cat=5, Q=630))
CASES.append(case('st30-cat6', 'usage category 6 from Tables 1-4 with a separate 30-min standby power', cat=6, on_st30=True, Pst30=40, Q=1275, v=2.5, travel_m=60.5, stops=17))
CASES.append(case('cat6-override', 'category 6 with user %Q and idle ratio', cat=6, ovr=True, pav=32, pctQ=8.0, Rid=0.4, Q=1275, v=2.5, travel_m=60.5, stops=17))
CASES.append(case('ovr-st30', 'user idle ratio with a separate 30-min standby power (rescaled R_st5/R_st30 split)', cat=3, ovr=True, pav=40, pctQ=7.5, Rid=0.5, on_st30=True, Pst30=40, Pst=120))
CASES.append(case('idle-free', 'zero standing power', Pid=0, Pst=0, cat=1, days=365))

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, 'liftenergy_ref.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(CASES, f, indent=1)
    # self-check against the printed numbers
    for c in CASES:
        p = c.get('published')
        if not p:
            continue
        if 'iso_cls' in p:
            print('%-18s iso_cls  ref %s published %s' % (c['id'], c['expect']['iso_cls'], p['iso_cls']))
            assert c['expect']['iso_cls'] == p['iso_cls'], c['id']
        for k in ('Ed', 'Enr', 'Erd', 'vdi_spec', 'vdi_year'):
            if k in p:
                tol = p.get('tol_abs', abs(p[k]) * p.get('tol_rel', 0))
                d = abs(c['expect'][k] - p[k])
                print('%-18s %-8s ref %.3f published %.3f %s' % (c['id'], k, c['expect'][k], p[k], 'ok' if d <= tol else 'OFF'))
                assert d <= tol, (c['id'], k)
        rc = p.get('rounded_check')
        if rc:
            # recompute the printed example with the paper's own rounded inputs (CR-27)
            st = c['state']
            e_rav = st['Erc'] * st['pav'] / 100.0
            e_rd = rc['kL'] * st['nd'] * e_rav / 2
            t_av = rc['sav_tav'] / st['v'] + st['v'] / st['a'] + st['a'] / st['j'] + st['td']
            e_nr = (24 - st['nd'] * t_av / 3600) * (st['Pid'] * st['Rid'] + st['Pst'] * (1 - st['Rid']))
            got = {'Erd': e_rd, 'Enr': e_nr, 'Ed': e_rd + e_nr}
            p['rounded_got'] = got
            for k in ('Erd', 'Enr', 'Ed'):
                tol = rc.get('tol_rel_' + k, rc['tol_rel'])
                rel = abs(got[k] - p[k]) / p[k]
                ok = rel <= tol or abs(got[k] - p[k]) <= 0.5  # printed to whole Wh
                print('%-18s %-8s rounded inputs %.2f published %d rel %.5f %s' % (c['id'], k, got[k], p[k], rel, 'ok' if ok else 'OFF'))
                assert ok, (c['id'], k, rel)
    for c in CASES:
        if c['expect'].get('saturated'):
            print('saturation flag expected:', c['id'])
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(CASES, f, indent=1)
    print('%d cases -> %s' % (len(CASES), out))
