"""Independent reference for mepcriticality.html (model mepcriticality-1.0).

Written from the published method _mep/crit/METHOD.md (consequence table, likelihood bands, class rule,
redundancy credit), not from mep-criticality.js. Class-library typical values are input data and are read
from mepcriticality_classes.json (a dump of MEPCore.CLASSES[*].typical).

Writes mepcriticality_ref.json: a list of cases {id, note, year, asset, expect}.
Run: python -I bench-src/ref/gen_mepcriticality.py
"""
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
try:
    from genpaths import ref  # type: ignore
except Exception:  # pragma: no cover - standalone use
    def ref(name):
        return HERE / name

LIB = json.loads(Path(ref('mepcriticality_classes.json')).read_text(encoding='utf-8'))['classes']

# ---- METHOD.md tables ----
SAFETY = {  # class: (base, {served function: value})
    'ahu': (1, {'healthcare': 4, 'lab': 3}), 'fan': (1, {'healthcare': 3, 'lab': 4}), 'pump': (1, {'healthcare': 2}),
    'chiller_air': (1, {'healthcare': 3}), 'chiller_water': (1, {'healthcare': 3}), 'heat_pump': (1, {'healthcare': 3}),
    'cooling_tower': (4, {}), 'boiler_gas': (3, {}), 'vrf': (1, {}), 'fcu': (1, {}), 'dhw_calorifier': (4, {}),
    'water_booster': (2, {'healthcare': 3}), 'sprinkler_pump': (5, {}), 'fire_alarm': (5, {}), 'emergency_lighting': (4, {}),
    'ups': (1, {'healthcare': 5}), 'generator': (2, {'healthcare': 5}), 'lv_switchboard': (3, {}), 'transformer': (3, {}),
    'bms_controller': (1, {}), 'lift': (3, {'healthcare': 4}),
}
ENV_BASE = {'cooling_tower': 2, 'generator': 2, 'transformer': 2}
REFRIGERANT = {'chiller_air', 'chiller_water', 'heat_pump', 'vrf'}
FIXED_SERVICE = {'sprinkler_pump': 2, 'fire_alarm': 2, 'emergency_lighting': 1}
IMPORTANCE = {'server_room': 5, 'healthcare': 5, 'lab': 4, 'production': 4, 'retail': 3, 'residential': 3, 'office': 2, 'education': 2, 'common': 1}
SCOPE = {'vrf': -1, 'bms_controller': -1, 'fcu': -2}
ORDER = {'A': 3, 'B': 2, 'C': 1}
HIDDEN = {'ups', 'generator', 'sprinkler_pump', 'fire_alarm', 'emergency_lighting'}
TOL_TYPICAL = {'server_room': 0.25, 'healthcare': 0.5, 'lab': 4, 'production': 2, 'retail': 4, 'residential': 12, 'office': 24, 'education': 24, 'common': 72}
BANDS = [1000, 10000, 50000, 250000]
REPAIR_SHARE = 0.15


def known(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def typical(cls, field):
    t = LIB.get(cls, {}).get('typical', {}).get(field)
    return t if isinstance(t, list) and len(t) == 3 else None


def pick3(asset, field, variant):
    """value under variant 'opt' / 'typ' / 'pes' (METHOD: resolution of unknowns)"""
    v = asset.get(field)
    if known(v):
        return v
    if field == 'tolerable_downtime_h':
        m = TOL_TYPICAL.get(asset.get('serves'))
        if m is None:
            return None
        return {'opt': m * 4, 'typ': m, 'pes': m / 4}[variant]
    t = typical(asset.get('class'), field)
    if not t:
        return None
    return {'opt': t[0], 'typ': t[1], 'pes': t[2]}[variant]


def clamp(x, lo=1, hi=5):
    return lo if x < lo else hi if x > hi else x


def credited(asset, peer_tags=None):
    """METHOD: credit only for N+1/2N, standby tested <= 12 months, no common cause.
    peer_tags None = no peer known (every tag counts); else only tags the peers share."""
    red = asset.get('redundancy') or 'none'
    if red not in ('N+1', '2N'):
        return 0
    tm = asset.get('reserve_tested_months')
    cc = [str(c).strip() for c in (asset.get('common_cause') or []) if str(c).strip()]
    if peer_tags is not None:
        cc = [c for c in cc if c in peer_tags]
    if not known(tm) or tm > 12 or cc:
        return 0
    return 2 if red == '2N' else 1


def failures_band(f):
    if f <= 0:
        return 1
    if f == 1:
        return 2
    if f == 2:
        return 3
    if f <= 4:
        return 4
    return 5


def age_band(r):
    return 1 if r < 0.5 else 2 if r < 0.8 else 3 if r < 1.0 else 4 if r < 1.3 else 5


def evaluate(asset, year, variant='typ', override=None, peer_tags=None, no_credit=False):
    cls = asset.get('class')
    serves = asset.get('serves') if asset.get('serves') in IMPORTANCE else 'common'
    base, by = SAFETY.get(cls, (1, {}))
    safety = by.get(serves, base)
    env = ENV_BASE.get(cls, 1)
    q = asset.get('refrigerant_charge_t_co2e')
    if cls in REFRIGERANT and known(q):
        env = max(env, 4 if q >= 500 else 3 if q >= 50 else 2 if q >= 5 else 1)
    rep = pick3(asset, 'mttr_h', variant)
    tol = pick3(asset, 'tolerable_downtime_h', variant)
    steps = 0 if no_credit else credited(asset, peer_tags)
    if cls in FIXED_SERVICE:
        service = FIXED_SERVICE[cls]
    else:
        service = IMPORTANCE[serves] + SCOPE.get(cls, 0)
        if rep is None or tol is None:
            ratio = None
        elif tol > 0:
            ratio = rep / tol
        else:
            ratio = float('inf') if rep > 0 else 0.0
        if ratio is None:
            service += 1 if variant == 'pes' else 0
        elif ratio <= 0.5:
            service -= 1
        elif ratio > 1:
            service += 1
        service = clamp(service)
    if steps:
        service = clamp(service - steps)
    dc = asset.get('downtime_cost_eur_h')
    # METHOD (D-MEP-7): the outage stays in the financial event even with a credited standby
    outage = rep if rep is not None else 0
    repl = pick3(asset, 'replacement_cost_eur', variant)
    event = (dc * outage if known(dc) else 0) + (REPAIR_SHARE * repl if repl is not None else 0)
    fin = 1 + sum(1 for b in BANDS if event >= b)
    scores = {'safety': safety, 'environment': env, 'service': service, 'financial': fin}
    for k, v in (override or {}).items():
        if isinstance(v, int) and 1 <= v <= 5:
            scores[k] = v
    # likelihood
    c = asset.get('condition')
    lc = int(round(c)) if known(c) else {'opt': 2, 'typ': 3, 'pes': 4}[variant]
    f = asset.get('failures_3y')
    lf = failures_band(f) if known(f) else {'opt': 1, 'typ': 2, 'pes': 3}[variant]
    le = max(clamp(lc), lf)
    L = le
    # METHOD (QA-19): the register's economic life (number or [lo, mid, hi]) before the class typical
    el = asset.get('economic_life_y')
    if known(el) and el > 0:
        life_mid = el
    elif isinstance(el, list) and len(el) == 3 and known(el[1]) and el[1] > 0:
        life_mid = el[1]
    else:
        t = typical(cls, 'economic_life_y')
        life_mid = t[1] if t else None
    iy = asset.get('install_year')
    if known(iy) and life_mid:
        ab = age_band(max(0, year - iy) / life_mid)
        if ab > le:
            L = min(ab, le + 1)
    if cls in HIDDEN:
        tm = asset.get('reserve_tested_months')
        if not known(tm) or tm > 12:
            L = max(L, 3)
    C = max(scores.values())
    P = C * L
    if P >= 15 or scores['safety'] >= 4 or scores['environment'] >= 4 or (C == 5 and L >= 2):
        k = 'A'
    elif P >= 8 or C >= 4:
        k = 'B'
    else:
        k = 'C'
    if steps:
        # METHOD cap: at most one letter below the class without the credit
        base_k = evaluate(asset, year, variant, override, peer_tags, no_credit=True)['class']
        if ORDER[base_k] - ORDER[k] > 1:
            k = 'B' if base_k == 'A' else 'C'
    return {'class': k, 'priority': P, 'consequence': C, 'likelihood': L, 'scores': scores, 'credited': bool(steps)}


def expect(asset, year, override=None, peer_tags=None):
    t = evaluate(asset, year, 'typ', override, peer_tags)
    o = evaluate(asset, year, 'opt', override, peer_tags)
    p = evaluate(asset, year, 'pes', override, peer_tags)
    ks = sorted([t['class'], o['class'], p['class']], key=lambda x: ORDER[x])
    t['class_best'] = ks[0]
    t['class_worst'] = ks[-1]
    return t


def blank(**kw):
    a = {'id': 'X', 'class': 'pump', 'serves': 'office', 'install_year': None, 'redundancy': 'none', 'reserve_tested_months': None,
         'common_cause': [], 'downtime_cost_eur_h': None, 'tolerable_downtime_h': None, 'mttr_h': None, 'lead_time_days': None,
         'replacement_cost_eur': None, 'condition': None, 'failures_3y': None, 'refrigerant_charge_t_co2e': None, 'evidence': 'documented'}
    a.update(kw)
    return a


def main():
    YEAR = 2026
    cases = []

    def add(cid, note, asset, override=None):
        cases.append({'id': cid, 'note': note, 'year': YEAR, 'asset': asset, 'override': override, 'expect': expect(asset, YEAR, override)})

    pump = dict(install_year=2018, mttr_h=8, lead_time_days=14, replacement_cost_eur=6000, condition=2, failures_3y=0)
    add('same-pump-office', 'office pump', blank(id='P-OFF', serves='office', tolerable_downtime_h=24, downtime_cost_eur_h=50, **pump))
    add('same-pump-server', 'same pump in a server room', blank(id='P-SRV', serves='server_room', tolerable_downtime_h=0.25, downtime_cost_eur_h=5000, **pump))
    add('n1-tested', 'N+1 tested 6 months', blank(id='P-N1', serves='server_room', tolerable_downtime_h=0.25, downtime_cost_eur_h=5000, redundancy='N+1', reserve_tested_months=6, **pump))
    add('n1-stale', 'N+1 tested 30 months ago', blank(id='P-ST', serves='server_room', tolerable_downtime_h=0.25, downtime_cost_eur_h=5000, redundancy='N+1', reserve_tested_months=30, **pump))
    add('n1-unknown-test', 'N+1 test unknown', blank(id='P-UT', serves='server_room', tolerable_downtime_h=0.25, downtime_cost_eur_h=5000, redundancy='N+1', **pump))
    add('2n-tested', '2N tested', blank(id='P-2N', serves='server_room', tolerable_downtime_h=0.25, downtime_cost_eur_h=5000, redundancy='2N', reserve_tested_months=2, **pump))
    add('common-feeder', 'N+1 chillers on one feeder', blank(id='CH-01', **{'class': 'chiller_water'}, serves='lab', install_year=2015, redundancy='N+1', reserve_tested_months=3,
        common_cause=['LV-2 section B'], tolerable_downtime_h=2, downtime_cost_eur_h=3000, mttr_h=24, condition=2, failures_3y=1, refrigerant_charge_t_co2e=180))
    add('separate-feeders', 'N+1 chillers, independent', blank(id='CH-01b', **{'class': 'chiller_water'}, serves='lab', install_year=2015, redundancy='N+1', reserve_tested_months=3,
        tolerable_downtime_h=2, downtime_cost_eur_h=3000, mttr_h=24, condition=2, failures_3y=1, refrigerant_charge_t_co2e=180))
    add('ups-untested', 'UPS green lamp, never tested', blank(id='UPS-A', **{'class': 'ups'}, serves='office', install_year=2023, tolerable_downtime_h=4, downtime_cost_eur_h=500, mttr_h=6, replacement_cost_eur=30000, condition=1, failures_3y=0))
    add('ups-tested', 'UPS tested 4 months ago', blank(id='UPS-B', **{'class': 'ups'}, serves='office', install_year=2023, reserve_tested_months=4, tolerable_downtime_h=4, downtime_cost_eur_h=500, mttr_h=6, replacement_cost_eur=30000, condition=1, failures_3y=0))
    add('boiler-old', 'old healthy boiler', blank(id='B-1996', **{'class': 'boiler_gas'}, install_year=1996, tolerable_downtime_h=24, downtime_cost_eur_h=100, mttr_h=12, replacement_cost_eur=40000, condition=2, failures_3y=0))
    add('boiler-new', 'new failing boiler', blank(id='B-2023', **{'class': 'boiler_gas'}, install_year=2023, tolerable_downtime_h=24, downtime_cost_eur_h=100, mttr_h=12, replacement_cost_eur=40000, condition=3, failures_3y=4))
    add('cooling-tower-2n', 'redundancy never lowers safety', blank(id='CT', **{'class': 'cooling_tower'}, redundancy='2N', reserve_tested_months=1, condition=1, failures_3y=0, install_year=2024, mttr_h=24, tolerable_downtime_h=24, downtime_cost_eur_h=0, replacement_cost_eur=70000))
    add('refrigerant-600', '600 t CO2e', blank(id='C6', **{'class': 'chiller_water'}, refrigerant_charge_t_co2e=600, condition=2, failures_3y=0, install_year=2020, mttr_h=24, tolerable_downtime_h=24))
    add('tolerable-zero', 'no interruption acceptable', blank(id='SPR', **{'class': 'sprinkler_pump'}, serves='common', install_year=2010, redundancy='N+1', reserve_tested_months=0.25, tolerable_downtime_h=0, condition=3, failures_3y=0))
    add('all-unknown-lab-pump', 'only class and function known', blank(id='U', serves='lab', evidence='unknown'))
    add('override-safety', 'safety set by hand', blank(id='CT2', **{'class': 'cooling_tower'}, condition=2, failures_3y=0, install_year=2020, mttr_h=8, tolerable_downtime_h=24), override={'safety': 2})
    add('override-service-up', 'service set higher by hand', blank(id='FCU', **{'class': 'fcu'}, condition=2, failures_3y=0, install_year=2020, mttr_h=4, tolerable_downtime_h=24), override={'service': 5})
    add('healthcare-ahu', 'AHU in healthcare', blank(id='AHU-H', **{'class': 'ahu'}, serves='healthcare', install_year=2012, mttr_h=16, tolerable_downtime_h=1, condition=3, failures_3y=1))
    add('econ-life-register', 'register economic life 40 y beats the class typical', blank(id='P-EL', install_year=2006, economic_life_y=40, condition=2, failures_3y=0, **{k: v for k, v in pump.items() if k not in ('install_year', 'condition', 'failures_3y')}))
    add('econ-life-triple', 'register economic life as [lo, mid, hi]', blank(id='P-EL3', install_year=2006, economic_life_y=[30, 40, 50], condition=2, failures_3y=0, **{k: v for k, v in pump.items() if k not in ('install_year', 'condition', 'failures_3y')}))
    add('econ-life-short', 'register economic life 10 y raises the age band', blank(id='P-EL10', install_year=2014, economic_life_y=10, condition=2, failures_3y=0, **{k: v for k, v in pump.items() if k not in ('install_year', 'condition', 'failures_3y')}))
    add('fcu-local', 'local fan coil', blank(id='FCU-1', **{'class': 'fcu'}, serves='office', install_year=2015, mttr_h=4, tolerable_downtime_h=24, condition=4, failures_3y=2))

    rng = random.Random(20261105)
    classes = sorted(SAFETY.keys())
    serves = sorted(IMPORTANCE.keys())
    reds = ['none', 'none', 'N+1', '2N']
    for i in range(60):
        cls = classes[i % len(classes)]
        a = blank(id='R%02d' % i, **{'class': cls}, serves=rng.choice(serves))
        def maybe(val, p=0.75):
            return val if rng.random() < p else None
        a['install_year'] = maybe(rng.randint(1985, 2025))
        a['redundancy'] = rng.choice(reds)
        a['reserve_tested_months'] = maybe(rng.choice([0, 3, 6, 11, 12, 13, 24, 48]), 0.7)
        a['common_cause'] = rng.choice([[], [], [], ['feeder-A'], ['bms-1', 'header']])
        a['downtime_cost_eur_h'] = maybe(rng.choice([0, 20, 100, 400, 1500, 6000, 20000]), 0.7)
        a['tolerable_downtime_h'] = maybe(rng.choice([0, 0.25, 1, 4, 8, 24, 72]), 0.7)
        a['mttr_h'] = maybe(rng.choice([1, 2, 4, 8, 16, 24, 72]), 0.7)
        a['lead_time_days'] = maybe(rng.choice([2, 7, 30, 90]), 0.6)
        a['replacement_cost_eur'] = maybe(rng.choice([800, 5000, 25000, 120000, 600000]), 0.6)
        a['condition'] = maybe(rng.randint(1, 5), 0.8)
        a['failures_3y'] = maybe(rng.choice([0, 0, 1, 2, 3, 5, 8]), 0.8)
        if cls in REFRIGERANT:
            a['refrigerant_charge_t_co2e'] = maybe(rng.choice([2, 8, 60, 700]), 0.8)
        ov = None
        if i % 13 == 7:
            ov = {rng.choice(['safety', 'environment', 'service', 'financial']): rng.randint(1, 5)}
        add('random-%02d' % i, 'seeded random asset %s / %s' % (cls, a['serves']), a, ov)

    def peers_of(assets, a):
        return [b for b in assets if b is not a and b.get('class') == a.get('class') and b.get('serves') == a.get('serves')]

    def add_register(cid, note, assets):
        exp = []
        for a in assets:
            ps = peers_of(assets, a)
            pt = None
            if (a.get('redundancy') or 'none') != 'none' and ps:
                pt = sorted({str(t).strip() for b in ps for t in (b.get('common_cause') or []) if str(t).strip()})
            exp.append(expect(a, YEAR, None, pt))
        cases.append({'id': cid, 'note': note, 'year': YEAR, 'assets': assets, 'expect_rows': exp})

    ups = dict(install_year=2022, redundancy='2N', reserve_tested_months=3, condition=2, failures_3y=0, mttr_h=6, tolerable_downtime_h=0.25, downtime_cost_eur_h=50000)
    add_register('reg-ups-separate-buses', '2N UPS on separate buses: credited on service, the outage keeps the financial score (D-MEP-7)',
                 [blank(id='UPS-A', **{'class': 'ups'}, serves='server_room', common_cause=['bus_A'], **ups), blank(id='UPS-B', **{'class': 'ups'}, serves='server_room', common_cause=['bus_B'], **ups)])
    add_register('reg-ups-same-bus', '2N UPS on one bus: not credited',
                 [blank(id='UPS-A', **{'class': 'ups'}, serves='server_room', common_cause=['bus_A'], **ups), blank(id='UPS-B', **{'class': 'ups'}, serves='server_room', common_cause=['bus_A'], **ups)])
    chd = dict(install_year=2015, redundancy='N+1', reserve_tested_months=3, tolerable_downtime_h=2, downtime_cost_eur_h=3000, mttr_h=24, condition=2, failures_3y=1, refrigerant_charge_t_co2e=180)
    add_register('reg-chillers-one-feeder', 'two chillers and their switchboard share LV-2 section B',
                 [blank(id='CH-01', **{'class': 'chiller_water'}, serves='lab', common_cause=['LV-2 section B'], **chd), blank(id='CH-02', **{'class': 'chiller_water'}, serves='lab', common_cause=['LV-2 section B'], **chd),
                  blank(id='LV-2', **{'class': 'lv_switchboard'}, serves='lab', install_year=2015, tolerable_downtime_h=2, downtime_cost_eur_h=3000, mttr_h=12, condition=2, failures_3y=0, common_cause=['LV-2 section B'])])
    add_register('reg-tag-other-class', 'tag shared only with another class is not a common cause of the pair',
                 [blank(id='P-A', serves='server_room', common_cause=['feed_1'], redundancy='N+1', reserve_tested_months=6, tolerable_downtime_h=0.25, downtime_cost_eur_h=5000, **pump),
                  blank(id='P-B', serves='server_room', common_cause=['feed_2'], redundancy='N+1', reserve_tested_months=6, tolerable_downtime_h=0.25, downtime_cost_eur_h=5000, **pump),
                  blank(id='AHU-X', **{'class': 'ahu'}, serves='server_room', common_cause=['feed_1'], install_year=2015, mttr_h=8, tolerable_downtime_h=1, condition=3, failures_3y=0)])
    add_register('reg-solo-n1-tag', 'N+1 declared, standby not in the register, tag counts',
                 [blank(id='P-S', serves='lab', common_cause=['bms-1'], redundancy='N+1', reserve_tested_months=2, tolerable_downtime_h=4, downtime_cost_eur_h=800, **pump)])
    rng2 = random.Random(4711)
    for i in range(6):
        cls = rng2.choice(['pump', 'ahu', 'chiller_air', 'boiler_gas', 'ups', 'generator'])
        sv = rng2.choice(['server_room', 'healthcare', 'office', 'lab'])
        tags = [['f1'], ['f1'], ['f2'], [], ['f1', 'h1']]
        assets = []
        for k in range(3):
            assets.append(blank(id='G%d-%d' % (i, k), **{'class': cls}, serves=sv, install_year=rng2.randint(2000, 2024), redundancy=rng2.choice(['N+1', '2N', 'none']),
                                reserve_tested_months=rng2.choice([None, 3, 10, 20]), common_cause=rng2.choice(tags), mttr_h=rng2.choice([4, 12, 48]),
                                tolerable_downtime_h=rng2.choice([0.25, 4, 24]), downtime_cost_eur_h=rng2.choice([None, 100, 5000]), condition=rng2.randint(1, 5), failures_3y=rng2.choice([0, 1, 3])))
        add_register('reg-random-%d' % i, 'seeded random group of three %s / %s' % (cls, sv), assets)

    out = Path(ref('mepcriticality_ref.json'))
    out.write_text(json.dumps(cases, indent=1), encoding='utf-8')
    counts = {'A': 0, 'B': 0, 'C': 0}
    for c in cases:
        for e in ([c['expect']] if 'expect' in c else c['expect_rows']):
            counts[e['class']] += 1
    print('mepcriticality reference: %d cases -> %s %s' % (len(cases), out, counts))


if __name__ == '__main__':
    main()
