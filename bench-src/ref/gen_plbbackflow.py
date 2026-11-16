"""Independent reference for plbbackflow (EN 1717 backflow protection selector).

Written from the published method _plb/bf/METHOD.md (plbbackflow-1.4), not from the page code:
  - fluid category: override -> library value -> question chain (pathogens 5, toxic 4, less toxic 3,
    changed 2, else 1; 'unknown' counts as yes; unanswered -> no category)
  - matrix cells X / o / - / dom per unit and category (EN 1717:2000 as reproduced, METHOD.md section 3)
  - exclusion rules in the published order, preferred unit (typical devices first, then the published order),
    air gap >= max(3 d, 20 mm), booster when an air gap is preferred and the appliance needs pressure.
The library of applications is read from the "Library data" table of METHOD.md (input data of the method).

Honest scope (D-PLB-10, CR-27): the sweeps are a CONSISTENCY check with METHOD (same matrix re-typed). Independent of it:
  - SYR_CHECK: second published source, SYR guide "Drinking water protection in installations" (Hans Sasserath GmbH & Co. KG,
    pp. 3-10): device per category and practical examples per category, compared with the matrix and the library;
  - ANCHORS: 14 connection points worked by hand from the Honeywell/Resideo EN 1717 brochure, ch. 7 pp. 37-44 (quoted per anchor):
    which devices the text admits / rules out, booster. Asserted here and checked on the page by run_plbbackflow.mjs.

Run:  python bench-src/ref/gen_plbbackflow.py   -> bench-src/ref/plbbackflow_ref.json
"""
import itertools
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
METHOD = os.path.join(ROOT, '_plb', 'bf', 'METHOD.md')

# --- section 3 of the method: matrix, heights, drain, open outlet, hose ------------------------------
MATRIX = {
    'AA': 'XXXXX', 'AB': 'XXXXX', 'AC': 'XXX--', 'AD': 'XXXXX', 'AF': 'XXXX-', 'AG': 'XXX--',
    'BA': 'XXXX-', 'CA': 'XXX--', 'DA': 'ooo--', 'DB': 'oooo-', 'DC': 'ooooo',
    'EA': 'XX---', 'EB': 'dom', 'EC': 'XX---', 'ED': 'dom', 'GA': 'XXX--', 'GB': 'XXXX-',
    'HA': 'XXo--', 'HB': 'oo---', 'HC': 'dom', 'HD': 'XXo--', 'LA': 'oo---', 'LB': 'XXo--',
}
ORDER = ['AA', 'AB', 'AC', 'AD', 'AF', 'AG', 'BA', 'CA', 'DA', 'DB', 'DC', 'EA', 'EB', 'EC', 'ED', 'GA', 'GB', 'HA', 'HB', 'HC', 'HD', 'LA', 'LB']
HEIGHT = {'DB': 150, 'DC': 150, 'HA': 200, 'HB': 250, 'HD': 250}
DRAIN = {'BA', 'CA', 'GA', 'GB'}
OPEN_OUTLET = {'DB', 'DC'}
PREFERENCE = ['EA', 'EC', 'HD', 'HA', 'CA', 'GA', 'DC', 'DB', 'BA', 'GB', 'AA', 'AB', 'AD', 'AC', 'AF', 'AG', 'LB', 'DA', 'HB', 'LA']
QUESTIONS = [('path', 5), ('toxic', 4), ('harm', 3), ('change', 2)]


def cell(unit, cat):
    m = MATRIX[unit]
    if m is None:
        return None
    if m == 'dom':
        return 'dom'
    return m[cat - 1]


def read_library():
    text = open(METHOD, encoding='utf-8').read()
    part = text.split('### Library data')[1]
    lib = {}
    for line in part.splitlines():
        m = re.match(r'^\|\s*([a-z_]+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*(yes|no)\s*\|\s*(yes|no)\s*\|\s*(yes|no)\s*\|\s*(yes|no)\s*\|', line)
        if not m or m.group(1) == 'app':
            continue
        c = m.group(2).strip()
        typ = m.group(3).strip()
        lib[m.group(1)] = {
            'cat': None if c == 'questions' else int(c),
            'typical': [] if typ == '—' else typ.split(),
            'hose': m.group(4) == 'yes', 'bp': m.group(5) == 'yes', 'needp': m.group(6) == 'yes', 'integ': m.group(7) == 'yes',
        }
    return lib


LIB = read_library()


def chain(answers):
    answers = answers or {}
    for qid, cat in QUESTIONS:
        a = answers.get(qid)
        if a not in ('yes', 'no', 'unknown'):
            return None
        if a in ('yes', 'unknown'):
            return cat
    return 1


def flag(v, default):
    if v == 'yes':
        return True
    if v == 'no':
        return False
    return default


def number(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x and abs(x) != float('inf') else None


N_MAX = 10000   # METHOD 1.3 section 1: n is a whole number 1..10 000


def count(v):
    """METHOD 1.3 section 1 (X2-6): missing/empty -> 1; a number or numeric text that is a whole number 1..N_MAX; else None (error n)."""
    if v is None or v == '':
        return 1
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        return None
    if isinstance(v, str) and v.strip() == '':
        return None
    x = number(v)
    if x is None or x != int(x) or not (1 <= x <= N_MAX):
        return None
    return int(x)


def evaluate(p):
    errors = []
    n = count(p.get('n'))
    if n is None:
        errors.append('n')
    a = p.get('app')
    if a in LIB:
        app = LIB[a]
    else:
        app = LIB['custom']
        if a not in (None, ''):
            errors.append('app')
    custom = app is LIB['custom']
    # METHOD 1.1 section 1: custom point, unanswered back-pressure / needs-pressure = yes (worst case), flag bp_assumed
    bp = flag(p.get('bp'), None if custom else app['bp'])
    needp = flag(p.get('needp'), None if custom else app['needp'])
    bp_assumed = bp is None or needp is None
    bp = True if bp is None else bp
    needp = True if needp is None else needp
    hose = flag(p.get('hose'), app['hose'])
    drain = flag(p.get('drain'), True)
    h = p.get('height_mm')
    if h in ('', None):
        h = None
    else:
        h = number(h)
        if h is None or h < 0:
            errors.append('height_mm')
            h = None
    d = p.get('d_mm')
    if d in ('', None):
        d = 15.0
    else:
        d = number(d)
        if d is None or d <= 0:
            errors.append('d_mm')
            d = 15.0
    ov = p.get('cat', 'auto')
    ovn = None if ov in ('auto', '', None) else number(ov)
    if ov not in ('auto', '', None) and not (ovn is not None and ovn == int(ovn) and 1 <= ovn <= 5):
        errors.append('cat')
        ovn = None
    if ovn is not None:
        cat = int(ovn)
    elif app['cat'] is not None:
        cat = app['cat']
    else:
        cat = chain(p.get('answers'))
    out = {'cat': cat, 'adm': [], 'pref': None, 'booster': False, 'gap': None, 'excl': {}, 'integrated': False, 'gap_insufficient': False,
           'bp_assumed': bp_assumed, 'errors': sorted(errors), 'n': n}
    if cat is None or cat == 1:
        return out
    gap_req = max(3.0 * d, 20.0)
    for u in ORDER:
        c = cell(u, cat)
        why = None
        if c is None:
            why = 'not_in_table'
        elif c == '-':
            why = 'category'
        elif c == 'dom':
            why = 'domestic_only'
        elif c == 'o' and bp:
            why = 'backpressure'
        elif u in OPEN_OUTLET and needp:
            why = 'needs_open_outlet'
        elif u.startswith('H') and not hose:
            why = 'hose_only'
        elif u in DRAIN and not drain:
            why = 'no_drain'
        elif u in HEIGHT and h is not None and not (h > HEIGHT[u]):
            why = 'height'
        elif u.startswith('A') and h is not None and h < gap_req:
            why = 'air_gap'      # METHOD 1.4 section 4 rule 9 (Y4-5): known gap below max(3 d, 20 mm)
        if why:
            out['excl'][u] = why
        else:
            out['adm'].append(u)
    def choose(adm):
        x = next((t for t in app['typical'] if t in adm), None)
        return x if x is not None else next((u for u in PREFERENCE if u in adm), None)
    pref = choose(out['adm'])
    out['pref'] = pref
    # METHOD 1.4 rule 9: the point relies on a too-small air gap when, without the air_gap exclusions, an air gap would be chosen
    lifted = choose(out['adm'] + [u for u, w in out['excl'].items() if w == 'air_gap'])
    out['gap_insufficient'] = bool(lifted and lifted != pref and lifted.startswith('A'))
    if pref and pref.startswith('A'):
        out['gap'] = max(3.0 * d, 20.0)
        out['booster'] = needp
    out['integrated'] = bool(pref and app['integ'] and app['typical'] and pref == app['typical'][0])
    out['adm'] = sorted(out['adm'])
    return out


def pt(pid, app, **kw):
    p = {'id': pid, 'n': kw.pop('n', 1), 'app': app, 'cat': 'auto', 'bp': 'auto', 'needp': 'auto', 'hose': 'auto', 'drain': 'yes', 'height_mm': '', 'd_mm': 15}
    p.update(kw)
    return p


def case(cid, note, points):
    exp = {p['id']: evaluate(p) for p in points}
    # METHOD 1.3 section 1 / 7: a point with an invalid n is listed but not counted in any total
    cats = [e['cat'] for e in exp.values() if e['cat'] and e['n'] is not None]
    units = sum(e['n'] for e in exp.values() if e['n'] is not None and e['pref'])
    # METHOD 1.4 section 7 (Y4-4): points per category = sum of n of the counted points with that category
    counts = [sum(e['n'] for e in exp.values() if e['n'] is not None and e['cat'] == c) for c in (1, 2, 3, 4, 5)]
    return {'id': cid, 'note': note, 'points': points, 'expect': {'points': exp, 'max_cat': max(cats) if cats else 0, 'n_points': len(points), 'units_total': units,
                                                                  'counts': counts, 'points_total': sum(counts)}}


cases = []
# 1. the seven presets as published on the page (points with their conditions)
PRESETS = {
    'apartments': [pt('WC', 'wc_cistern', n=24), pt('Basin', 'basin_fixed', n=24), pt('Kitchen', 'tap_pullout', height_mm=300, n=24), pt('Shower', 'bath_shower_dom', height_mm=300, n=24),
                   pt('WM', 'washing_machine', n=24), pt('Heater', 'dhw_heater'), pt('Heating', 'heating_fill'), pt('Garden', 'garden_tap', height_mm=400, n=2), pt('Rain', 'rain_topup', d_mm=20)],
    'heating': [pt('Fill-1', 'heating_fill'), pt('Fill-2', 'heating_fill', drain='no'), pt('Solar', 'heating_additive')],
    'dental': [pt('Chair-1', 'dental_chair'), pt('Chair-2', 'dental_chair'), pt('Basin', 'basin_fixed'), pt('Steriliser', 'custom', needp='yes', bp='yes', answers={'path': 'unknown'}), pt('Heater', 'dhw_heater')],
    'care': [pt('Shower-home', 'bath_shower_dom', height_mm=300), pt('Shower-care', 'shower_care', height_mm=300), pt('Bedpan', 'custom', answers={'path': 'yes'}, needp='no', bp='no', height_mm=400), pt('WC', 'wc_flushvalve', height_mm=400)],
    'garden': [pt('Hose', 'garden_tap', height_mm=400), pt('Hose-low', 'garden_tap', height_mm=180), pt('Washer', 'pressure_washer'), pt('Irrigation', 'irrigation'), pt('Pond', 'pond_fill', d_mm=20)],
    'industry': [pt('Galvanic', 'galvanic_bath', height_mm=300), pt('Press', 'printing_press'), pt('Press-nodrain', 'printing_press', drain='no'), pt('Lab', 'lab_chemical'), pt('Standpipe', 'standpipe')],
    'bar': [pt('Coffee', 'coffee_machine'), pt('Glasswasher', 'glass_washer', d_mm=12), pt('Softener', 'softener'), pt('Dishwasher', 'washing_machine'),
            pt('Mop', 'custom', hose='yes', bp='no', needp='no', height_mm=300, answers={'path': 'no', 'toxic': 'no', 'harm': 'yes'})],
}
for k, pts in PRESETS.items():
    cases.append(case('preset_' + k, 'preset ' + k, pts))

# 2. every library application x category override x back-pressure x needed pressure x drain
for app in LIB:
    pts = []
    for c, bp, np_, dr in itertools.product(['auto', '2', '3', '4', '5'], ['yes', 'no'], ['yes', 'no'], ['yes', 'no']):
        if app == 'custom' and c == 'auto':
            continue
        pts.append(pt('%s-%s%s%s%s' % (app[:6], c[0], bp[0], np_[0], dr[0]), app, cat=c, bp=bp, needp=np_, drain=dr))
    cases.append(case('sweep_' + app, 'conditions sweep ' + app, pts))

# 3. height sweeps around the 150 / 200 / 250 mm rules, hose yes/no, categories 2-5
pts = []
for h, hose, c in itertools.product([0, 100, 150, 151, 199, 200, 201, 249, 250, 251, 400, ''], ['yes', 'no'], ['2', '3', '4', '5']):
    pts.append(pt('h%s-%s-%s' % (h if h != '' else 'u', hose[0], c), 'custom', cat=c, bp='no', needp='no', hose=hose, height_mm=h))
cases.append(case('heights', 'height rules DB/DC 150, HA 200, HB/HD 250 mm (strictly greater)', pts))

# 4. air-gap bore
pts = [pt('d%s' % d, 'rain_topup', d_mm=d) for d in [4, 6, 6.67, 8, 10, 12, 15, 20, 25, 32, 50, 100]]
pts += [pt('dp%s' % d, 'dental_chair', d_mm=d) for d in [5, 15, 40]]
cases.append(case('airgap', 'air gap max(3 d, 20 mm) and booster', pts))

# 5. the question chain, every combination of answers (including unanswered)
pts = []
vals = ['', 'yes', 'no', 'unknown']
for i, (a, b, c, d) in enumerate(itertools.product(vals, vals, vals, vals)):
    ans = {k: v for k, v in zip(['path', 'toxic', 'harm', 'change'], [a, b, c, d]) if v}
    pts.append(pt('q%03d' % i, 'custom', answers=ans, bp='no', needp='no', hose='no'))
cases.append(case('questions', 'question chain: first yes decides, unknown = yes, unanswered = no category', pts))

# 6. hose devices under back-pressure and needed pressure
pts = []
for app, bp, np_, h in itertools.product(['garden_tap', 'tap_pullout', 'bath_shower_dom', 'shower_care'], ['yes', 'no'], ['yes', 'no'], [150, 220, 300, '']):
    pts.append(pt('%s-%s%s%s' % (app[:5], bp[0], np_[0], h if h != '' else 'u'), app, bp=bp, needp=np_, height_mm=h))
cases.append(case('hoses', 'hose outlets: HA/HB/HD vs back-pressure and height', pts))

# 7. D-PLB-17: custom points with back-pressure / needs-pressure unanswered (QA-2/CR-16) and D-PLB-14 input errors (QA-22/CR-61)
pts = []
for c, bp, np_ in itertools.product(['auto', '2', '3', '4', '5'], ['auto', 'yes', 'no'], ['auto', 'yes', 'no']):
    pts.append(pt('c%s-%s%s' % (c[0], bp[0], np_[0]), 'custom', cat=c, bp=bp, needp=np_, answers={'path': 'yes'} if c == 'auto' else None))
pts += [pt('qa2-a', 'custom', answers={'path': 'yes'}), pt('qa2-b', 'custom', answers={'path': 'no', 'toxic': 'yes'})]
pts += [pt('e-d', 'basin_fixed', d_mm=-10), pt('e-d0', 'rain_topup', d_mm=0), pt('e-h', 'garden_tap', height_mm=-5), pt('e-app', 'no_such_app'),
        pt('e-cat', 'wc_cistern', cat='2.5'), pt('e-cat0', 'heating_fill', cat='0'), pt('e-dtxt', 'rain_topup', d_mm='abc')]
for x in pts:
    if x.get('answers') is None:
        x.pop('answers', None)
cases.append(case('custom_worst_case', 'custom point: unanswered back-pressure / needs pressure = yes (D-PLB-17); invalid inputs -> point errors (D-PLB-14)', pts))
e = cases[-1]['expect']['points']
assert e['qa2-a']['cat'] == 5 and 'DC' not in e['qa2-a']['adm'] and e['qa2-a']['booster'] and e['qa2-a']['bp_assumed'], 'QA-2 a'
assert e['qa2-b']['cat'] == 4 and 'DC' not in e['qa2-b']['adm'] and 'DB' not in e['qa2-b']['adm'] and e['qa2-b']['pref'] == 'BA', 'QA-2 b'
assert e['e-d']['errors'] == ['d_mm'] and e['e-cat']['errors'] == ['cat'] and e['e-app']['errors'] == ['app'] and e['e-h']['errors'] == ['height_mm']

# 7b. X2-6 (Codex r3): number of points n — whole number 1..10 000, missing/empty = 1, never rounded; invalid -> error n, not counted
pts = [pt('n-0', 'wc_cistern', n=0), pt('n-neg', 'rain_topup', n=-3), pt('n-frac', 'basin_fixed', n=2.5), pt('n-frac-txt', 'garden_tap', n='1.5'),
       pt('n-big', 'dhw_heater', n=10001), pt('n-txt', 'heating_fill', n='abc'), pt('n-bool', 'washing_machine', n=True),
       pt('n-ok-txt', 'dhw_heater', n='24'), pt('n-ok-max', 'wc_cistern', n=10000), pt('n-empty', 'heating_fill', n=''), pt('n-null', 'basin_fixed', n=None)]
cases.append(case('x2_6_point_count', 'X2-6: n must be a whole number 1..10 000 (missing -> 1); 0, negative, fractional, > 10 000, text, true -> error n, point not counted', pts))
e = cases[-1]['expect']
assert all(e['points'][i]['errors'] == ['n'] and e['points'][i]['n'] is None for i in ('n-0', 'n-neg', 'n-frac', 'n-frac-txt', 'n-big', 'n-txt', 'n-bool'))
assert e['points']['n-ok-txt']['n'] == 24 and e['points']['n-ok-max']['n'] == 10000 and e['points']['n-empty']['n'] == 1 and e['points']['n-null']['n'] == 1
pts = [pt('cat5-n0', 'rain_topup', n=0), pt('cat2', 'dhw_heater', n=3)]
cases.append(case('x2_6_not_counted', 'X2-6: a category-5 point with n = 0 is not counted - the highest category stays 2 and only the 3 valid units are counted', pts))
assert cases[-1]['expect']['max_cat'] == 2 and cases[-1]['expect']['units_total'] == 3

# 7c. Y4-4 (Codex r4): category totals count connection points, a row adds its n (hand-worked)
pts = [pt('G24', 'garden_tap', n=24, height_mm=400), pt('WC10', 'wc_cistern', n=10), pt('H2', 'dhw_heater', n=2), pt('bad', 'rain_topup', n=0), pt('Q', 'custom', n=7)]
cases.append(case('y4_4_counts_points', 'Y4-4: 24 garden taps -> category 3 = 24 (not 1); WC x10 -> category 5 = 10; heater x2 -> category 2 = 2; n = 0 and an unanswered custom point are not counted', pts))
assert cases[-1]['expect']['counts'] == [0, 2, 24, 0, 10] and cases[-1]['expect']['points_total'] == 36, cases[-1]['expect']['counts']
# apartments preset by hand: cat 3 = 24 basin + 24 kitchen + 24 shower + 2 garden + 1 heating fill = 75; cat 5 = 24 WC + 24 WM + 1 rain = 49; cat 2 = 1 heater
assert cases[0]['id'] == 'preset_apartments' and cases[0]['expect']['counts'] == [0, 1, 75, 0, 49], cases[0]['expect']['counts']

# 7d. Y4-5 (Codex r4): known height below the air gap max(3 d, 20 mm) (Resideo brochure p. 34: "3-fold inside diameter of the inlet pipe") -> air gaps
#     excluded, not preferred, not integrated; hand-worked: d 15 -> 45 mm, d 6 -> 20 mm floor, d 20 -> 60 mm
pts = [pt('wc-h0', 'wc_cistern', height_mm=0), pt('wc-h44', 'wc_cistern', height_mm=44), pt('wc-h45', 'wc_cistern', height_mm=45), pt('wc-hu', 'wc_cistern'),
       pt('wc-d6-h19', 'wc_cistern', d_mm=6, height_mm=19), pt('wc-d6-h20', 'wc_cistern', d_mm=6, height_mm=20),
       pt('basin-h10', 'basin_fixed', height_mm=10), pt('basin-h60', 'basin_fixed', height_mm=60), pt('heat-h0', 'heating_fill', height_mm=0),
       pt('dent-d20-h50', 'dental_chair', d_mm=20, height_mm=50), pt('dent-d20-h60', 'dental_chair', d_mm=20, height_mm=60),
       pt('rain-d20-h59', 'rain_topup', d_mm=20, height_mm=59), pt('care-h30', 'shower_care', height_mm=30)]
cases.append(case('y4_5_air_gap_height', 'Y4-5: an air gap known to be below max(3 d, 20 mm) is excluded (air_gap), not preferred and not integrated; equal is enough', pts))
e = cases[-1]['expect']['points']
assert e['wc-h0']['pref'] is None and not e['wc-h0']['integrated'] and e['wc-h0']['gap_insufficient'] and e['wc-h0']['excl']['AA'] == 'air_gap', 'Y4-5 Codex repro'
assert e['wc-h44']['pref'] is None and e['wc-h45']['pref'] == 'AA' and e['wc-h45']['integrated'] and e['wc-hu']['integrated'] and not e['wc-h45']['gap_insufficient']
assert e['wc-d6-h19']['gap_insufficient'] and e['wc-d6-h20']['pref'] == 'AA'
assert e['basin-h10']['pref'] == 'CA' and not e['basin-h10']['integrated'] and e['basin-h10']['gap_insufficient'] and e['basin-h60']['integrated']
assert e['heat-h0']['pref'] == 'CA' and not e['heat-h0']['gap_insufficient'] and e['heat-h0']['excl']['AA'] == 'air_gap'
assert e['dent-d20-h50']['gap_insufficient'] and e['dent-d20-h60']['pref'] == 'AA' and e['dent-d20-h60']['gap'] == 60.0 and e['rain-d20-h59']['gap_insufficient']

# 8. SECOND SOURCE (CR-27): SYR guide, pp. 3-10 (typed from the guide, not from METHOD)
SYR_DEVICE = {2: ['EA'], 3: ['CA'], 4: ['BA'], 5: ['AA', 'AB']}          # p. 3 "fluid categories ... device required"
SYR_EXAMPLES = [                                                          # pp. 4, 6, 10 "Practical examples"
    ('bath_shower_dom', 3, 'Domestic bath and rinse water (p. 4)'),
    ('heating_fill', 3, 'Filling and refilling heating systems without inhibitors (p. 4)'),
    ('heating_additive', 4, 'Backfeeding devices as in heating systems with inhibitors (p. 6)'),
    ('pressure_washer', 4, 'High-pressure cleaner with water containing additives (p. 6)'),
    ('standpipe', 4, 'Temporary water connection via standpipe (p. 6)'),
    ('lab_chemical', 4, 'Water supply for chemical and photographic laboratories (p. 6)'),
    ('rain_topup', 5, 'Rainwater systems (p. 10)'),
    ('pond_fill', 5, 'Cattle troughs (p. 10; trough filling)'),
    ('pool_fill', 5, 'Swimming and bathing pools in public areas (p. 10)'),
]
SYR_CHECK = []
for c, devs in SYR_DEVICE.items():
    for u in devs:
        SYR_CHECK.append({'check': '%s is X in category %d' % (u, c), 'ok': cell(u, c) == 'X'})
for u, c in [('EA', 3), ('CA', 4), ('BA', 5)]:
    SYR_CHECK.append({'check': '%s is not X in category %d (the guide names a stronger device there)' % (u, c), 'ok': cell(u, c) != 'X'})
for app, c, txt in SYR_EXAMPLES:
    SYR_CHECK.append({'check': 'library %s = category %d: %s' % (app, c, txt), 'ok': LIB[app]['cat'] == c})
assert all(x['ok'] for x in SYR_CHECK), [x for x in SYR_CHECK if not x['ok']]

# 9. EXTERNAL ANCHORS (D-PLB-10): worked by hand from the Resideo brochure text, ch. 7 (quotes shortened)
ANCHORS = [
    ('A-galvanic', 'galvanic_bath', {}, {'cat': 4, 'must': ['AA', 'BA', 'GB', 'DB', 'DC']},
     'p. 38: galvanic water category 4; free outlet AA, system separator BA, GB and - no back-pressure - pipe interrupters DB and DC may be used'),
    ('A-press', 'printing_press', {}, {'cat': 4, 'must': ['AA', 'BA', 'GB'], 'mustnot': ['DB', 'DC']},
     'p. 39: printing presses category 4, need the water pressure: pipe interruptor not possible; AA with booster, BA or GB'),
    ('A-meat', 'meat_machine', {}, {'cat': 5, 'must': ['AA'], 'mustnot': ['DC', 'DB', 'BA', 'EA'], 'booster': True},
     'p. 39: meat machine as category 5; under pressure no way to avoid a booster with atmospheric pre-vessel (free outlet)'),
    ('A-pond', 'pond_fill', {}, {'cat': 5, 'must': ['DC', 'AA']},
     'p. 39: fish pond category 5; refilling only via DC or AA'),
    ('A-glass', 'glass_washer', {}, {'cat': 5, 'must': ['AA'], 'mustnot': ['BA', 'DC'], 'booster': True},
     'p. 40: glass washer bottom rinse category 5; free outlet AA combined with a booster'),
    ('A-pharmacy', 'lab_chemical', {}, {'cat': 4, 'must': ['GB', 'BA']},
     'p. 40: pharmacy laboratory = chemical laboratory, category 4; GB or BA'),
    ('A-biolab', 'lab_bio', {}, {'cat': 5, 'pref_family': 'A', 'mustnot': ['BA'], 'booster': True},
     'p. 40: bacteriological laboratory category 5; free outlet AA and downstream booster'),
    ('A-dental', 'dental_chair', {}, {'cat': 5, 'pref_family': 'A', 'mustnot': ['BA'], 'booster': True},
     'pp. 40-41: dental chair without mark of conformity: water via a free outlet into a container, pump to the chair'),
    ('A-careshower', 'shower_care', {'height_mm': 300}, {'cat': 5, 'mustnot': ['HD', 'HA'], 'pref_family': 'A'},
     'p. 41: hospital / nursing-home bath water category 5; HD insufficient; hose arranged so the head cannot reach the water'),
    ('A-pullout', 'tap_pullout', {'height_mm': 300}, {'cat': 3, 'must': ['HD']},
     'p. 42: washstand / kitchen fitting with extractable shower head, domestic: category 3, HD minimum'),
    ('A-flushvalve', 'wc_flushvalve', {}, {'cat': 5, 'pref': 'DC', 'integrated': True},
     'p. 42: WC cistern water category 5; flushing valves protected by an integrated DC'),
    ('A-heatfill', 'heating_fill', {}, {'cat': 3, 'must': ['GA', 'CA'], 'mustnot': ['EA']},
     'p. 42: heating fill (not atmospheric): to DIN EN 1717 at least GA or CA; a check valve is DIN 1988-4 practice only'),
    ('A-hpwasher', 'pressure_washer', {}, {'cat': 4, 'must': ['GB'], 'mustnot': ['HD', 'HA']},
     'p. 44: high-pressure cleaner with detergent category 4; must be connected via GB, not to the HD garden tap'),
    ('A-standpipe', 'standpipe', {}, {'cat': 4, 'must': ['BA'], 'mustnot': ['HA', 'HB']},
     'p. 38: standpipe: HA / HB give only moderate protection (class 2); integrated system separator BA up to category 4'),
]


def anchor_ok(r, x):
    bad = []
    if r['cat'] != x['cat']:
        bad.append('cat')
    for u in x.get('must', []):
        if u not in r['adm']:
            bad.append('must ' + u)
    for u in x.get('mustnot', []):
        if u in r['adm']:
            bad.append('mustnot ' + u)
    if 'booster' in x and r['booster'] != x['booster']:
        bad.append('booster')
    if 'pref' in x and r['pref'] != x['pref']:
        bad.append('pref')
    if 'pref_family' in x and not (r['pref'] or '').startswith(x['pref_family']):
        bad.append('pref_family')
    if 'integrated' in x and r['integrated'] != x['integrated']:
        bad.append('integrated')
    return bad


apts, aexp = [], {}
for aid, app, kw, x, quote in ANCHORS:
    p = pt(aid, app, **kw)
    apts.append(p)
    aexp[aid] = {'check': x, 'source': 'Honeywell/Resideo EN 1717 brochure ch. 7, ' + quote}
    bad = anchor_ok(evaluate(p), x)
    assert not bad, (aid, bad)
cases.append(dict(case('anchors_resideo_ch7', 'external anchors: 14 points worked by hand from the Resideo EN 1717 brochure ch. 7 (pp. 37-44)', apts), anchor=aexp))

# 8. CR-60: AF / AG ratings from WaterRegsUK / WRAS (AF <= cat 4, AG <= cat 3, back-siphonage and back-pressure);
#    CR-62: garden sprayer (hose with fertiliser / pesticide) category 4
pts = [pt('wr-c%d' % c, 'custom', cat=str(c), bp='yes', needp='no', hose='no') for c in (2, 3, 4, 5)]
pts += [pt('gs', 'garden_sprayer'), pt('gs-nodrain', 'garden_sprayer', drain='no'), pt('gt', 'garden_tap', height_mm=400)]
cases.append(case('wras_af_ag', 'AF admissible up to category 4, AG up to 3 (WaterRegsUK / WRAS ratings); garden sprayer category 4', pts))
e = cases[-1]['expect']['points']
assert 'AF' in e['wr-c4']['adm'] and 'AF' not in e['wr-c5']['adm'] and 'AG' in e['wr-c3']['adm'] and 'AG' not in e['wr-c4']['adm'], 'WRAS AF/AG'
assert e['wr-c5']['excl']['AF'] == 'category' and e['gs']['cat'] == 4 and e['gs']['pref'] == 'BA' and 'HD' not in e['gs']['adm'], 'garden sprayer'

json.dump({'source': 'SYR guide "Drinking water protection in installations" (Hans Sasserath GmbH & Co. KG), pp. 3-10',
           'scope': 'device per category and practical examples per category vs the matrix X cells and the library categories; o cells, H/L families and height rules are not covered by this source',
           'checks': SYR_CHECK, 'total': len(SYR_CHECK), 'passed': sum(1 for x in SYR_CHECK if x['ok'])},
          open(os.path.join(HERE, 'plbbackflow_xcheck.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('second source (SYR):', sum(1 for x in SYR_CHECK if x['ok']), '/', len(SYR_CHECK), '; anchors', len(ANCHORS), 'asserted')

out = os.path.join(HERE, 'plbbackflow_ref.json')
json.dump(cases, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('plbbackflow_ref.json:', len(cases), 'cases,', sum(len(c['points']) for c in cases), 'points')
