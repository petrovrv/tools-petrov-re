"""Independent reference for meplifecycle (MEP Renewal Planner).

Written from the published method _mep/life/METHOD.md (revision meplifecycle-1.0), not from mep-lifecycle.js.
Class-library typical values are input data (ref/meplifecycle_classes.json, dumped from mep-core.js).
Writes ref/meplifecycle_ref.json: a list of cases {id, note, year, opts, crit, assets, expect}.
Run: python bench-src/ref/gen_meplifecycle.py
"""
import json, math, re, copy, pathlib

HERE = pathlib.Path(__file__).resolve().parent
CLASSES = json.loads((HERE / 'meplifecycle_classes.json').read_text(encoding='utf-8'))

COND_FRAC = {1: 0.10, 2: 0.35, 3: 0.60, 4: 0.90, 5: 1.10}
EVW = {'measured': 1.0, 'documented': 0.8, 'assumed': 0.5, 'unknown': 0.5}
GWP = {'R32': 675, 'R125': 3500, 'R134a': 1430, 'R143a': 4470, 'R1234yf': 0.501, 'R1234ze': 1.37, 'R290': 0.02, 'R600a': 0, 'R717': 0, 'R744': 1}
BLENDS = {'R404A': {'R125': .44, 'R143a': .52, 'R134a': .04}, 'R507A': {'R125': .5, 'R143a': .5}, 'R422D': {'R125': .651, 'R134a': .315, 'R600a': .034},
          'R410A': {'R32': .5, 'R125': .5}, 'R407C': {'R32': .23, 'R125': .25, 'R134a': .52}, 'R513A': {'R1234yf': .56, 'R134a': .44},
          'R454B': {'R32': .689, 'R1234yf': .311}}
KNOWN = set(GWP) | set(BLENDS) | {'R22', 'SF6'}
RANK = {'A': 0, 'B': 1, 'C': 2}


def gwp(code):
    if code == 'R22':
        return 1810.0
    if code in BLENDS:
        return sum(f * GWP[g] for g, f in BLENDS[code].items())
    return float(GWP[code])


def norm(s):
    s = str(s).strip().replace(' ', '')
    if s.upper() == 'SF6':
        return 'SF6'
    m = re.fullmatch(r'[Rr]-?(\d{2,4})([A-Za-z]{0,2})', s)
    if not m:
        return None
    num, suf = m.group(1), m.group(2).upper()
    if suf == 'ZE':
        suf = 'ze'
    elif suf == 'YF':
        suf = 'yf'
    elif num == '134' and suf == 'A':
        suf = 'a'
    c = 'R' + num + suf
    return c if c in KNOWN else None


def refrigerant(a):
    v = a.get('refrigerant')
    if v not in (None, ''):
        return norm(v), 'user'
    text = (a.get('name') or '') + ' ' + (a.get('notes') or '')
    m = re.search(r'\bR-?(\d{2,4}(?:A|a|ze|yf|B|D)?)\b', text)
    if m:
        c = norm('R' + m.group(1))
        if c:
            return c, 'name'
    return None, None


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def hz(t, L, beta=3.0):
    return 0.0 if t <= 0 else beta / L * (t / L) ** (beta - 1)


def peer_credit(a, assets):
    # D-MEP-10 (crit peer rule, METHOD.md): N+1/2N, standby tested <= 12 months; a common-cause tag counts only when a peer
    # (same class and same serves, other id) carries it too; without any peer every declared tag counts
    if a.get('redundancy') not in ('N+1', '2N'):
        return False
    t = a.get('reserve_tested_months')
    if num(t) is None or t > 12:
        return False
    tags = {str(x).strip() for x in (a.get('common_cause') or []) if str(x if x is not None else '').strip()}
    peers = [b for b in assets if b is not a and b.get('id') != a.get('id') and b.get('class') == a.get('class') and b.get('serves') == a.get('serves')]
    if not peers:
        return not tags
    ptags = {str(x).strip() for b in peers for x in (b.get('common_cause') or [])}
    return not (tags & ptags)


def assess(a, P, o, crit, assets=()):
    cl = CLASSES.get(a.get('class'))
    lu = a.get('economic_life_y')
    if isinstance(lu, list) and len(lu) == 3:
        life = list(lu)
    elif num(lu) and lu > 0:
        life = [lu] * 3
    elif cl:
        life = list(cl['economic_life_y'])
    else:
        life = [15, 20, 25]
    L = life[1]
    user_cost = num(a.get('replacement_cost_eur')) is not None and a['replacement_cost_eur'] >= 0
    C = a['replacement_cost_eur'] if user_cost else (cl['replacement_cost_eur'][1] if cl else 0)
    cost_unknown = not user_cost and not cl
    K = crit.get(a['id']) or a.get('crit_class') or 'B'
    age = max(0, P - a['install_year']) if num(a.get('install_year')) is not None else None
    g = num(a.get('condition'))
    if g is not None:
        g = min(5, max(1, int(math.floor(g + 0.5))))
    floor_applied = False
    if (num(a.get('failures_3y')) or 0) >= o['fail_n'] and (g is None or g < 4):
        g, floor_applied = 4, True
    ev = a.get('evidence') if a.get('evidence') in EVW else 'unknown'
    if g is None:
        w = 0.0
    else:
        w = EVW[ev]
        if floor_applied:
            w = max(w, 0.8)

    def eff(Lx):
        if g is not None and age is not None:
            return w * COND_FRAC[g] * Lx + (1 - w) * age
        if g is None and age is not None:
            return float(age)
        if g is not None:
            return COND_FRAC[g] * Lx
        return COND_FRAC[3] * Lx

    trig = o['trigger'][K]
    e = eff(L)
    drivers = [('trigger_' + K, P + math.floor(trig * L - e), False)]
    code, src = refrigerant(a)
    if code and code != 'SF6':
        G = gwp(code)
        refr = a.get('fgas_category') == 'refrigeration'
        if code == 'R22':
            drivers.append(('hcfc_service_ban', 2015, True))
        elif G >= 2500:
            drivers.append(('art13_3_gwp2500', 2030, True) if refr else ('art13_4_gwp2500', 2032, True))
        elif num(a.get('refrigerant_service_until')) is not None:
            drivers.append(('service_until_user', int(round(a['refrigerant_service_until'])), False))
        elif G >= 1500:
            drivers.append(('quota_scarcity_high', o['sc_high'], False))
        elif G >= 750:
            drivers.append(('quota_scarcity_mid', o['sc_mid'], False))
    if num(a.get('support_end_year')) is not None:
        drivers.append(('support_end', int(round(a['support_end_year'])), False))
    if num(a.get('target_year')) is not None:
        drivers.append(('target_year', int(round(a['target_year'])), True))
    # D-MEP-8: no condition grade -> the age-based trigger is indicative only; another (non-age) driver may govern
    survey = g is None
    pool = drivers[1:] if survey and len(drivers) > 1 else drivers
    gov = pool[0]
    for d in pool[1:]:
        if d[1] < gov[1] or (d[1] == gov[1] and d[2] and not gov[2]):
            gov = d
    unbooked = 'survey_needed' if survey and gov is drivers[0] else ('cost_unknown' if cost_unknown else None)
    due = gov[1]
    hard = min([d[1] for d in drivers if d[2]], default=None)
    others = [d[1] for d in drivers[1:]]
    ys = []
    for Lx in (life[0], life[2]):
        y = min(others) if survey and others else min([P + math.floor(trig * Lx - eff(Lx))] + others)
        ys.append(max(P, y))
    red = peer_credit(a, assets)
    mttr = a['mttr_h'] if num(a.get('mttr_h')) is not None else (cl['mttr_h'][1] if cl else 0)
    E = o['rho'] * C + (0 if red else (num(a.get('downtime_cost_eur_h')) or 0) * mttr)
    return {'id': a['id'], 'K': K, 'L': L, 'C': C, 'e': e, 'grade': g, 'due': due, 'gov': gov[0], 'renewal': max(P, due), 'hard': hard,
            'range': sorted(ys), 'E': E, 'cycle': max(1, math.floor(trig * L)), 'bundle': a.get('bundle'), 'unbooked': unbooked, 'cost_unknown': cost_unknown}


def added(r, f, t, P):
    return sum((hz(r['e'] + (y - P) + 0.5, r['L']) - hz((y - f) + 0.5, r['L'])) * r['E'] for y in range(f, t))


def plan(doc, opts, crit):
    o = {'H': 25, 'cap': None, 'carry': False, 'deferA': False, 'trigger': {'A': .9, 'B': 1.0, 'C': 1.15}, 'fail_n': 3, 'rho': .15, 'W': 3, 'sigma': .10,
         'sc_high': 2030, 'sc_mid': 2035}
    o.update(opts)
    P = doc['site']['year']
    allrows = [assess(a, P, o, crit, doc['assets']) for a in doc['assets'] if a.get('id') is not None and a.get('retired') is not True]
    rows = [r for r in allrows if not r['unbooked']]   # survey needed / cost unknown: no money, no bundle, no cap queue
    # bundles
    bundles = []
    tags = {}
    for r in rows:
        if r['bundle']:
            tags.setdefault(r['bundle'], []).append(r)
    for tag in sorted(tags):
        m = tags[tag]
        if len(m) < 2:
            bundles.append({'tag': tag, 'applied': False, 'year': None, 'reason': 'single_member'})
            continue
        best = None
        for Y in sorted({r['renewal'] for r in m}):
            inc = [r for r in m if abs(r['renewal'] - Y) <= o['W'] and not (r['hard'] is not None and Y > max(P, r['hard']))]
            if len(inc) < 2:
                continue
            sav = o['sigma'] * sum(r['C'] for r in inc)
            lost = sum((r['renewal'] - Y) * r['C'] / r['cycle'] for r in inc if Y < r['renewal'])
            risk = sum(added(r, r['renewal'], Y, P) for r in inc if Y > r['renewal'])
            net = sav - lost - risk
            if best is None or net > best['net'] + 1e-9:
                best = {'Y': Y, 'inc': inc, 'net': net, 'saving': sav}
        if best is None:
            bundles.append({'tag': tag, 'applied': False, 'year': None, 'reason': 'outside_window'})
            continue
        ap = best['net'] > 0
        if ap:
            for r in best['inc']:
                r['renewal'] = best['Y']
                r['bundled'] = tag
                r['Cb'] = r['C'] * (1 - o['sigma'])
        bundles.append({'tag': tag, 'applied': ap, 'year': best['Y'], 'net': best['net'], 'saving': best['saving'], 'members': [r['id'] for r in best['inc']]})
    # profile
    H = o['H']
    last = P + H - 1
    need = [0.0] * H
    for r in rows:
        y, k = r['renewal'], 0
        while y <= last:
            need[y - P] += r.get('Cb', r['C']) if k == 0 else r['C']
            y += r['cycle']
            k += 1
    capped, backlog, waiting = list(need), [0.0] * H, [0] * H
    sched = {}
    if o['cap'] is not None:
        B = o['cap']
        items, groups = [], {}
        for r in rows:
            if r.get('bundled'):
                g = groups.get(r['bundled'])
                if g is None:
                    g = groups[r['bundled']] = {'key': 'bundle:' + r['bundled'], 'rows': [], 'year': r['renewal'], 'cost': 0.0, 'cls': 'C', 'forced': False, 'hard': None}
                    items.append(g)
                g['rows'].append(r)
                g['cost'] += r['Cb']
                if RANK[r['K']] < RANK[g['cls']]:
                    g['cls'] = r['K']
                if r['hard'] is not None:
                    hh = max(P, r['hard'])
                    g['hard'] = hh if g['hard'] is None else min(g['hard'], hh)
                if r['K'] == 'A' and not o['deferA']:
                    g['forced'] = True
            else:
                items.append({'key': r['id'], 'rows': [r], 'year': r['renewal'], 'cost': r['C'], 'cls': r['K'], 'forced': r['K'] == 'A' and not o['deferA'],
                              'hard': max(P, r['hard']) if r['hard'] is not None else None})
        queue = [{'it': it, 'due': it['year'], 'k': 0, 'cost': it['cost'], 'done': None} for it in items]
        reserve = 0.0
        capped = [0.0] * H
        for i in range(H):
            y = P + i
            cand = [q for q in queue if q['due'] <= y and q['done'] is None]
            for q in cand:
                it = q['it']
                q['forced'] = it['forced'] or (q['k'] == 0 and it['hard'] is not None and y >= it['hard'])
                if q['k'] == 0:
                    q['rate'] = sum(hz(r['e'] + (y - P) + 0.5, r['L']) * r['E'] for r in it['rows'])
                else:
                    q['rate'] = sum(hz((y - q['due']) + r['cycle'] + 0.5, r['L']) * r['E'] for r in it['rows'])
            # stable multi-key sort (explicit comparator semantics: rate compared only if it differs by > 1e-9)
            import functools

            def cmp(p, q):
                if p['forced'] != q['forced']:
                    return -1 if p['forced'] else 1
                if p['it']['cls'] != q['it']['cls']:
                    return RANK[p['it']['cls']] - RANK[q['it']['cls']]
                if abs(p['rate'] - q['rate']) > 1e-9:
                    return -1 if q['rate'] < p['rate'] else 1
                if p['due'] != q['due']:
                    return p['due'] - q['due']
                return (p['it']['key'] > q['it']['key']) - (p['it']['key'] < q['it']['key'])
            cand.sort(key=functools.cmp_to_key(cmp))
            free = next((q for q in cand if not q['forced']), None)
            avail = B + (reserve if o['carry'] else 0.0)
            spent = 0.0
            for q in cand:
                lumpy = (not q['forced']) and q['cost'] > B + 1e-6 and spent == 0 and not o['carry'] and q is free
                if q['forced'] or lumpy or spent + q['cost'] <= avail + 1e-6:
                    spent += q['cost']
                    q['done'] = y
                    if q['k'] == 0:
                        sched[q['it']['key']] = y
                    cyc = min(r['cycle'] for r in q['it']['rows'])
                    if y + cyc <= last:
                        queue.append({'it': q['it'], 'due': y + cyc, 'k': q['k'] + 1, 'cost': sum(r['C'] for r in q['it']['rows']), 'done': None})
            capped[i] = spent
            reserve = max(0.0, avail - spent) if o['carry'] else 0.0
            wq = [q for q in queue if q['due'] <= y and q['done'] is None]
            backlog[i] = sum(q['cost'] for q in wq)
            waiting[i] = len(wq)
        for it in items:
            for r in it['rows']:
                r['sched'] = sched.get(it['key'])
                r['item_due'] = it['year']
    out = {}
    for r in allrows:
        if r['unbooked']:
            out[r['id']] = {'renewal_year': r['renewal'], 'due_year': r['due'], 'governing': r['gov'], 'range': r['range'], 'eff_age': r['e'], 'grade_used': r['grade'],
                            'cycle_y': r['cycle'], 'scheduled_year': None, 'deferred_years': 0, 'added_risk_eur': 0.0, 'unbooked': r['unbooked']}
            continue
        s = r.get('sched', r['renewal']) if o['cap'] is not None else r['renewal']
        due_i = r.get('item_due', r['renewal'])
        to = s if s is not None else last + 1
        out[r['id']] = {'renewal_year': r['renewal'], 'due_year': r['due'], 'governing': r['gov'], 'range': r['range'], 'eff_age': r['e'], 'grade_used': r['grade'],
                        'cycle_y': r['cycle'], 'scheduled_year': s, 'deferred_years': to - due_i, 'added_risk_eur': added(r, due_i, to, P) if o['cap'] is not None else 0.0,
                        'unbooked': None}
    wall = None
    if o['cap'] is not None:
        for i in range(H):
            if backlog[i] > 0 and (wall is None or backlog[i] > wall['backlog_eur'] + 1e-6):
                wall = {'year': P + i, 'backlog_eur': backlog[i], 'waiting': waiting[i]}
    return {'assets': out, 'need': need, 'capped': capped, 'backlog': backlog, 'total_need': sum(need), 'total_capped': sum(capped), 'wall': wall,
            'bundles': [{k: b.get(k) for k in ('tag', 'applied', 'year')} for b in bundles],
            'survey_needed': [r['id'] for r in allrows if r['unbooked'] == 'survey_needed'],
            'cost_unknown': [r['id'] for r in allrows if r['cost_unknown']]}


# ------------------------------------------------------------------ cases
def A(id, cls, **kw):
    a = {'id': id, 'class': cls, 'name': '', 'install_year': 2010, 'condition': 3, 'failures_3y': 0, 'evidence': 'documented', 'replacement_cost_eur': 50000,
         'redundancy': 'none', 'reserve_tested_months': None, 'common_cause': [], 'downtime_cost_eur_h': 100, 'mttr_h': 10}
    a.update(kw)
    return a


cases = []


def add(cid, note, assets, opts=None, crit=None, year=2026):
    doc = {'site': {'year': year}, 'assets': copy.deepcopy(assets)}
    crit = crit or {a['id']: 'B' for a in assets}
    js_opts = {}
    o = opts or {}
    if 'cap' in o: js_opts['budget_cap_eur_y'] = o['cap']
    if 'carry' in o: js_opts['carry_over'] = o['carry']
    if 'deferA' in o: js_opts['defer_class_A'] = o['deferA']
    if 'W' in o: js_opts['bundle_window_y'] = o['W']
    if 'sigma' in o: js_opts['bundle_saving_pct'] = o['sigma'] * 100
    if 'trigger' in o: js_opts.update({'trigger_A': o['trigger']['A'], 'trigger_B': o['trigger']['B'], 'trigger_C': o['trigger']['C']})
    if 'sc_high' in o: js_opts['scarcity_high'] = o['sc_high']
    if 'sc_mid' in o: js_opts['scarcity_mid'] = o['sc_mid']
    cases.append({'id': cid, 'note': note, 'year': year, 'opts': js_opts, 'crit': crit, 'assets': assets, 'expect': plan(doc, o, crit)})


# 1 single assets across classes, grades, evidence, ages and criticality classes
classes = ['ahu', 'pump', 'chiller_air', 'boiler_gas', 'ups', 'generator', 'sprinkler_pump', 'emergency_lighting', 'dhw_calorifier', 'lv_switchboard',
           'fan', 'chiller_water', 'cooling_tower', 'heat_pump', 'vrf', 'fcu', 'water_booster', 'fire_alarm', 'transformer', 'bms_controller', 'lift']
evs = ['measured', 'documented', 'assumed', 'unknown']
for i, c in enumerate(classes):
    g = [None, 1, 2, 3, 4, 5][i % 6]
    add('single-%s' % c, 'class %s grade %s' % (c, g), [A('X', c, install_year=1990 + (i * 3) % 35, condition=g, evidence=evs[i % 4], failures_3y=[0, 1, 3, 5][i % 4],
                                                       replacement_cost_eur=None if i % 3 == 0 else 20000 + 5000 * i)], crit={'X': 'ABC'[i % 3]})
add('age-only', 'no condition grade', [A('X', 'ahu', condition=None, install_year=2004)])
add('condition-only', 'no install year', [A('X', 'pump', install_year=None, condition=2)])
add('nothing-known', 'neither', [A('X', 'pump', install_year=None, condition=None, replacement_cost_eur=None)])
add('life-override', 'economic_life_y 12', [A('X', 'ahu', economic_life_y=12, condition=2, install_year=2015)])
add('life-override-3', 'economic_life_y [10,14,18]', [A('X', 'ahu', economic_life_y=[10, 14, 18], condition=3, install_year=2012)])
add('old-healthy', 'aha 1', [A('OLD', 'boiler_gas', install_year=1998, condition=2, evidence='measured')])
add('young-failing', 'aha 1', [A('NEW', 'boiler_gas', install_year=2018, condition=3, failures_3y=4, evidence='measured')])
add('grade-5-overdue', 'overdue', [A('X', 'pump', install_year=1990, condition=5, evidence='measured')])
add('triggers-custom', 'trigger option', [A('X', 'ahu', install_year=2008, condition=3)], opts={'trigger': {'A': .8, 'B': .95, 'C': 1.3}}, crit={'X': 'C'})
# 2 refrigerants
for rf, cat in [('R410A', None), ('R407C', None), ('R134a', None), ('R404A', None), ('R404A', 'refrigeration'), ('R507A', None), ('R422D', 'refrigeration'),
                ('R22', None), ('R32', None), ('R513A', None), ('R454B', None), ('r-410a', None), ('R1234ze', None)]:
    kw = {'refrigerant': rf, 'install_year': 2018, 'condition': 2, 'evidence': 'measured', 'rated_kw': 200}
    if cat: kw['fgas_category'] = cat
    add('refrig-%s%s' % (rf, '-refr' if cat else ''), 'refrigerant %s' % rf, [A('X', 'vrf' if rf in ('R410A', 'r-410a') else 'chiller_air', **kw)], crit={'X': 'C'})
add('refrig-from-name', 'designation in the name', [A('X', 'chiller_air', name='Chiller (R410A 40 kg)', install_year=2016, condition=2)])
add('refrig-user-horizon', 'refrigerant_service_until', [A('X', 'vrf', refrigerant='R410A', refrigerant_service_until=2034, install_year=2020, condition=1)])
add('scarcity-options', 'scarcity horizons changed', [A('X', 'vrf', refrigerant='R410A', install_year=2020, condition=1), A('Y', 'chiller_water', refrigerant='R134a', install_year=2020, condition=1)],
    opts={'sc_high': 2028, 'sc_mid': 2031})
add('support-end', 'support_end_year', [A('X', 'bms_controller', support_end_year=2027, install_year=2020, condition=2)])
add('target-year', 'target_year hard', [A('X', 'ahu', target_year=2029, install_year=2020, condition=1)])
add('tie-hard-soft', 'equal years: hard wins', [A('X', 'heat_pump', refrigerant='R404A', support_end_year=2032, install_year=2024, condition=1)], crit={'X': 'C'})
# 3 caps
wall_assets = [A('A%d' % i, ['ahu', 'boiler_gas', 'pump', 'chiller_water', 'water_booster'][i % 5], install_year=1999, condition=3, failures_3y=i % 3,
                 replacement_cost_eur=[90000, 80000, 25000, 220000, 30000][i % 5]) for i in range(10)]
for cap in (None, 60000, 100000, 150000, 300000):
    add('wall-cap-%s' % cap, 'campus 1999 with cap %s' % cap, wall_assets, opts={} if cap is None else {'cap': cap})
add('wall-carry', 'reserve fund', wall_assets, opts={'cap': 100000, 'carry': True})
mix = [A('A1', 'ups', install_year=2012, condition=4, replacement_cost_eur=80000), A('B1', 'ahu', install_year=2005, condition=4, replacement_cost_eur=70000, downtime_cost_eur_h=500),
       A('B2', 'ahu', install_year=2005, condition=4, replacement_cost_eur=70000, downtime_cost_eur_h=50), A('C1', 'pump', install_year=2008, condition=4, replacement_cost_eur=20000),
       A('R', 'heat_pump', refrigerant='R22', install_year=2010, condition=2, replacement_cost_eur=30000)]
mixcrit = {'A1': 'A', 'B1': 'B', 'B2': 'B', 'C1': 'C', 'R': 'C'}
add('mix-cap', 'forced A + hard date + B/C order', mix, opts={'cap': 100000}, crit=mixcrit)
add('mix-cap-deferA', 'class A deferrable', mix, opts={'cap': 100000, 'deferA': True}, crit=mixcrit)
add('mix-cap-small', 'tight cap', mix, opts={'cap': 40000}, crit=mixcrit)
add('lumpy', 'single renewal above the cap', [A('BIG', 'chiller_water', install_year=1995, condition=4, replacement_cost_eur=400000), A('S', 'pump', install_year=1995, condition=4, replacement_cost_eur=10000)],
    opts={'cap': 100000})
add('redundancy-credit', 'credited redundancy removes downtime from E', [A('X', 'pump', redundancy='N+1', reserve_tested_months=6, install_year=2000, condition=4, downtime_cost_eur_h=5000),
                                                                          A('Y', 'pump', redundancy='N+1', reserve_tested_months=30, install_year=2000, condition=4, downtime_cost_eur_h=5000)],
    opts={'cap': 10000})
# 4 bundles
fw = [A('AHU-N', 'ahu', install_year=2002, condition=3, failures_3y=1, replacement_cost_eur=90000, downtime_cost_eur_h=150, bundle='fw'),
      A('AHU-S', 'ahu', install_year=2009, condition=3, replacement_cost_eur=90000, downtime_cost_eur_h=150, bundle='fw'),
      A('FW-1', 'fan', install_year=2004, condition=3, failures_3y=1, replacement_cost_eur=60000, downtime_cost_eur_h=150, bundle='fw'),
      A('CAL-1', 'dhw_calorifier', install_year=2010, condition=3, replacement_cost_eur=15000)]
add('bundle-fanwall', 'bundle applied', fw)
add('bundle-window0', 'window 0', fw, opts={'W': 0})
add('bundle-saving0', 'saving 0 -> not applied', fw, opts={'sigma': 0.0})
add('bundle-with-cap', 'bundle under a cap', fw, opts={'cap': 120000})
add('bundle-single', 'single member', [A('X', 'ahu', bundle='solo')])
add('bundle-failing-member', 'a poor member excluded by the window', [A('P', 'fan', install_year=2008, condition=4, failures_3y=2, evidence='measured', bundle='b'),
                                                                     A('Q', 'ahu', install_year=2009, condition=2, bundle='b'), A('R', 'ahu', install_year=2009, condition=2, bundle='b')])
# 5 run 2: survey needed (D-MEP-8), cost unknown (QA-26), peer-rule credit (D-MEP-10)
add('survey-boiler-2006', 'QA-3: no grade, evidence unknown -> survey needed, no money', [A('B06', 'boiler_gas', install_year=2006, condition=None, evidence='unknown'), A('K', 'pump', install_year=2010, condition=3)])
add('survey-under-cap', 'survey item stays out of the cap queue', [A('B06', 'boiler_gas', install_year=2006, condition=None, evidence='unknown'), A('K', 'pump', install_year=2000, condition=4),
                                                                   A('M', 'ahu', install_year=2000, condition=4)], opts={'cap': 60000})
add('survey-legal-date', 'no grade but HCFC ban governs and books money', [A('HP22', 'heat_pump', install_year=2003, condition=None, evidence='unknown', refrigerant='R22')])
add('survey-target-year', 'no grade but a decision year governs', [A('T', 'ahu', install_year=2000, condition=None, target_year=2029)])
add('survey-scarcity', 'no grade, R410A scarcity horizon governs', [A('V', 'vrf', install_year=2005, condition=None, refrigerant='R410A')])
add('cost-unknown', 'unknown class without cost: not in the profile', [A('U', 'nope', install_year=2000, condition=4, evidence='measured', replacement_cost_eur=None), A('K', 'pump', install_year=2000, condition=4)],
    opts={'cap': 30000})
add('survey-bundle', 'a survey member drops out of its bundle', [A('X1', 'ahu', install_year=2002, condition=3, bundle='b'), A('X2', 'ahu', install_year=2003, condition=None, bundle='b'),
                                                                 A('X3', 'fan', install_year=2004, condition=3, bundle='b')])
add('credit-peers-separate', 'N+1 pumps on separate buses: credited', [A('P1', 'pump', serves='s', redundancy='N+1', reserve_tested_months=6, common_cause=['bus_A'], install_year=2000, condition=4, downtime_cost_eur_h=5000),
                                                                       A('P2', 'pump', serves='s', redundancy='N+1', reserve_tested_months=6, common_cause=['bus_B'], install_year=2000, condition=4, downtime_cost_eur_h=5000)],
    opts={'cap': 10000})
add('credit-peers-shared', 'N+1 pumps on one bus: not credited', [A('P1', 'pump', serves='s', redundancy='N+1', reserve_tested_months=6, common_cause=['bus_A'], install_year=2000, condition=4, downtime_cost_eur_h=5000),
                                                                  A('P2', 'pump', serves='s', redundancy='N+1', reserve_tested_months=6, common_cause=['bus_A'], install_year=2000, condition=4, downtime_cost_eur_h=5000)],
    opts={'cap': 10000})
add('credit-no-peer-tag', 'no peer: every declared tag counts', [A('P1', 'pump', serves='s', redundancy='N+1', reserve_tested_months=6, common_cause=['bus_A'], install_year=2000, condition=4, downtime_cost_eur_h=5000),
                                                                 A('Q', 'ahu', serves='s', install_year=2000, condition=4, common_cause=['bus_A'])], opts={'cap': 10000})
add('plan-year-2030', 'other plan year', wall_assets[:4], year=2030, opts={'cap': 90000})

(HERE / 'meplifecycle_ref.json').write_text(json.dumps(cases, indent=1), encoding='utf-8')
print('meplifecycle_ref.json', len(cases), 'cases')
