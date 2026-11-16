# Independent reference for acousticreqbe (Acoustic Requirements BE).
# Re-typed from the rendered pages of NBN S 01-400-1:2022 (Tab. 1 p. 19, §5.3–5.4 p. 19–20, Tab. 2 + §6.3–6.4 p. 21, Tab. 3 p. 22,
# Tab. 4–6 p. 25, §8.4 + §9.2 p. 26) and NBN S 01-400-3:2026 (§5.2 p. 14–15, Tab. 1–5 p. 16–19, §6.2 p. 20, Tab. 6–10 p. 21–24,
# Tab. 11–12 p. 25–27, Tab. 15–16 p. 32–34, Annex A Tab. A.1 p. 36–37, Tab. B.1 p. 38, Tab. C.1 p. 39, Annex E Tab. E.1 p. 43),
# written as named decision rules — not ported from acu-req.js. Writes bench-src/ref/acousticreqbe_ref.json.
# Shared reading with the engine (not independent): the mapping of the tool's space list onto the table rows/columns where a row
# groups several spaces, the RA,50 / LI,50 applicability (party element towards a protected room), the Note 2 interpretation and
# the εspat row choice (nearest proportion) — these are labelled as interpretation / learning assumption on the page.
# r3-fix (2026-11-08) rules written from the clauses, not from the JS: part 1 Tab. 2 row 2 only for a common circulation on the
# same floor that is not a staircase (otherwise row 1); part 3 §9.3 Tnom ≥ 0,4 s, measured Tnom + 10 %, other furnishing state
# × 0,9 / × 1,1; §9.2 verdict (design: Tab. 15 sufficient; measured: Tnom met → Tab. 15 cancelled, else Tab. 15 + workmanship).
# Further shared readings (labelled la_req_act3 / la_req_conf): the §5.2 +(LAeq,15min − 80) increase only towards dwellings;
# no door relief on a Tab. 2 note 3 / Tab. 4 note 3 value; door relief judged on the sending space's confidentiality.
import json, math, os, itertools
HERE = os.path.dirname(os.path.abspath(__file__))
CL = ['A', 'B', 'C']
cases = []
def case(cid, note, points, anchor=False):
    c = {'id': cid, 'note': note, 'points': points}
    if anchor: c['anchor'] = True
    cases.append(c)
def jround(x): return math.floor(x + 0.5)

# ---------------------------------------------------------------- NBN S 01-400-1 room pairs
PROTECTED = {'bedroom', 'study', 'kitchen', 'living', 'bath'}          # Tab. 1 row 3 / Tab. 2 row 3 room list
NEVER_RECEIVING = {'technical', 'storage', 'laundry', 'garage', 'none', 'attic', 'circulation'}   # §5.4 bullets 1–2 (+ attic = room without function)
NO_IMPACT_TO = {'circulation', 'technical', 'storage', 'laundry', 'garage', 'none', 'attic'}      # §6.4 bullet 1
def s1_pair(cls, rel, send, recv, element='wall', houses=False, noload=False, onebed=False, above=False, laeq=None, laf5=None, samefl=False):
    k = CL.index(cls)
    keff = min(k, 1) if (houses and rel == 'other_dwelling') else k       # §5.3 / §6.3: class B minimum between two new houses
    add = max([0] + [v - 80 for v in (laeq, laf5) if v is not None])     # §5.4 bullet 3
    out = {}
    # airborne Tab. 1
    if recv in NEVER_RECEIVING: da = None
    elif rel == 'same_dwelling':
        da = {'A': 44, 'B': 38, 'C': 34}[cls] if (recv in ('bedroom', 'study') and send in PROTECTED and not onebed) else None
    elif rel == 'other_dwelling':
        da = None if noload else [62, 58, 54][keff] + add
    elif rel == 'circulation_lobby': da = [58, 54, 50][k] + add
    elif rel == 'circulation_1door': da = [44, 44, 40][k] + add
    out['DA'] = da
    if rel == 'other_dwelling' and recv in PROTECTED and not noload: out['RA50'] = [59, 55, 51][keff]
    # impact Tab. 2
    if recv in NO_IMPACT_TO: ln = None
    elif rel == 'same_dwelling':
        ok = recv in ('bedroom', 'study') and send in PROTECTED and (cls != 'C' or above)
        ln = {'A': 54, 'B': 58, 'C': 58}[cls] if ok else None
    elif noload: ln = None
    elif rel in ('circulation_lobby', 'circulation_1door'):
        # Tab. 2 row 2 'common circulation (except staircases) on the same floor'; a staircase / another floor falls under row 1
        ln = [48, 52, 56][k] if samefl else [44, 48, 52][k]
    else: ln = [44, 48, 52][keff]
    out['LnTw'] = ln
    if rel == 'other_dwelling' and element == 'floor' and recv in PROTECTED and not noload: out['LI50'] = [48, 52, 56][keff]
    return out
USES = ['bedroom', 'study', 'living', 'kitchen', 'bath', 'wc', 'storage', 'laundry', 'garage', 'technical', 'circulation', 'none', 'shop', 'horeca', 'office', 'meeting', 'attic']
for rel, samefl in [('other_dwelling', False), ('circulation_lobby', False), ('circulation_lobby', True), ('circulation_1door', False), ('circulation_1door', True), ('same_dwelling', False)]:
    pts = []
    for cls, send, recv, el in itertools.product(CL, ['living', 'bedroom', 'shop', 'circulation', 'wc'], USES, ['wall', 'floor']):
        inp = {'cls': cls, 'relation': rel, 'sendUse': send, 'recvUse': recv, 'element': el}
        if samefl: inp['circSameFloor'] = True
        pts.append({'fn': 'pair', 'input': inp, 'expect': s1_pair(cls, rel, send, recv, el, samefl=samefl)})
    tag = '' if not rel.startswith('circ') else ('-samefloor' if samefl else '-stair-otherfloor')
    case('s1-' + rel + tag, 'NBN S 01-400-1 Tab. 1 / Tab. 2 / §5.4 / §6.4, 3 classes × 5 sending × 17 receiving uses × wall/floor' +
         ('' if not rel.startswith('circ') else (' — Tab. 2 row 2 (same floor, not a staircase)' if samefl else ' — Tab. 2 row 1 (staircase or another floor)')), pts)
pts = []
for cls, houses, noload, el, recv in itertools.product(CL, [False, True], [False, True], ['wall', 'floor'], ['bedroom', 'living', 'wc']):
    inp = {'cls': cls, 'relation': 'other_dwelling', 'sendUse': 'living', 'recvUse': recv, 'element': el, 'twoNewHouses': houses, 'noSourceLoad': noload}
    pts.append({'fn': 'pair', 'input': inp, 'expect': s1_pair(cls, 'other_dwelling', 'living', recv, el, houses, noload)})
for cls, onebed, above, recv in itertools.product(CL, [False, True], [False, True], ['bedroom', 'study', 'living']):
    inp = {'cls': cls, 'relation': 'same_dwelling', 'sendUse': 'kitchen', 'recvUse': recv, 'oneBedroom': onebed, 'sendAbove': above}
    pts.append({'fn': 'pair', 'input': inp, 'expect': s1_pair(cls, 'same_dwelling', 'kitchen', recv, onebed=onebed, above=above)})
case('s1-flags', 'two new houses §5.3/§6.3, note a/b (no load), note d (one bedroom), Tab. 2 note c (above)', pts)
pts = []
for rel, laeq, laf5 in itertools.product(['other_dwelling', 'circulation_lobby', 'same_dwelling'], [None, 75, 80, 81, 92, 100], [None, 79, 95]):
    inp = {'cls': 'C', 'relation': rel, 'sendUse': 'living', 'recvUse': 'bedroom', 'LAeq_dB': laeq, 'LAF5_dB': laf5}
    pts.append({'fn': 'pair', 'input': inp, 'expect': s1_pair('C', rel, 'living', 'bedroom', laeq=laeq, laf5=laf5)})
case('s1-activity', '§5.4: + (LAeq,Tm − 80) / + (LAF5,Tm − 80) dB when positive, rooms outside the dwelling only', pts)

# in-situ tolerance §5.4 / §6.4 (and part 3 §5.2 / §6.2): rounded to the unit; 2 dB, 4 dB below 25 m³ except bedrooms
pts = []
for q, req, meas, V, bed in itertools.product(['DA', 'LnTw'], [None], [49.4, 49.6, 50.5, 51.0, 51.5, 52.4, 53.0, 54.5, 55.6, 56.4], [20, 24.9, 25, 40], [True, False]):
    recv = 'bedroom' if bed else 'kitchen'
    lim = 54 if q == 'DA' else 52
    tol = 4 if (V < 25 and not bed) else 2
    m = jround(meas)
    ok = m >= lim - tol if q == 'DA' else m <= lim + tol
    pts.append({'fn': 'check', 'input': {'pair': {'cls': 'C', 'relation': 'other_dwelling', 'sendUse': 'living', 'recvUse': recv, 'element': 'floor'}, 'q': q, 'measured': meas, 'V': V, 'bedroom': bed},
                'expect': {'pass': ok, 'tol': tol, 'rounded': m}})
case('s1-tolerance', '§5.4 / §6.4 in-situ tolerance with rounding', pts)

# ---------------------------------------------------------------- NBN S 01-400-1 façade Tab. 3
def s1_fac(cls, use, day, night, lmax=None, second=False, gallery=False):
    if use not in ('bedroom', 'living', 'kitchen', 'study'): return {'DAtr': None}
    ab = cls in ('A', 'B')
    t = []
    if day is not None: t.append(day - (30 if ab else 34) + (3 if (second and day >= 62) else 0))
    t.append(32 if ab else 28)
    if use == 'bedroom':
        if night is not None: t.append(night - (25 if ab else 28) + (3 if (second and night >= 56) else 0))
        if lmax is not None and lmax >= 70: t.append(34)
    out = {'DAtr': max(t)}
    if gallery: out['D2mA'] = 44 if ab else 40
    return out
pts = []
for cls, use, day, night, lmax, second, gal in itertools.product(CL, ['bedroom', 'living', 'bath'], [50, 60, 62, 70, 77], [45, 56, 65, 72], [None, 75], [False, True], [False, True]):
    inp = {'cls': cls, 'use': use, 'LAday': day, 'LAnight': night, 'LAmax3xNight': lmax, 'secondPane': second, 'gallery': gal}
    pts.append({'fn': 'facade', 'input': inp, 'expect': s1_fac(cls, use, day, night, lmax, second, gal)})
case('s1-facade', 'NBN S 01-400-1 Tab. 3 (notes a, b, c)', pts)

# ---------------------------------------------------------------- NBN S 01-400-1 service equipment Tab. 4–6, §8.2, §8.4
T4 = {('long', 'bedroom'): (25, 25, 28), ('long', 'study'): (25, 25, 28), ('long', 'living'): (29, 29, 32), ('long', 'kitchen'): (29, 29, 32),
      ('long', 'bath'): (32, 32, 35), ('long', 'technical'): (58, 58, 62), ('hood', 'kitchen'): (48, 56, 63), ('hood', 'living'): (39, 47, 54),
      ('sanitary', 'bedroom'): (29, 29, None), ('sanitary', 'study'): (29, 29, None), ('sanitary', 'living'): (34, 34, None),
      ('short', 'bedroom'): (29, 29, 34), ('short', 'study'): (29, 29, 34), ('short', 'living'): (34, 34, 39),}
# Tab. 4 (p. 25): the kitchen is listed only in the long-noise row (séjour, salle à manger, cuisine) and the hood row — not for sanitary / short noise (r3-fix CR-18)
T5 = {('long', 'bedroom'): (24, 24, 24), ('long', 'study'): (24, 24, 24), ('long', 'living'): (26, 26, 29), ('long', 'kitchen'): (26, 26, 29), ('long', 'bath'): (26, 26, 29),
      ('long', 'meeting'): (29, 29, 34), ('long', 'office'): (29, 29, 34),
      ('short', 'bedroom'): (29, 29, 34), ('short', 'study'): (29, 29, 34), ('short', 'living'): (34, 34, 39), ('short', 'kitchen'): (34, 34, 39), ('short', 'bath'): (34, 34, 39),
      ('short', 'meeting'): (34, 34, 39), ('short', 'office'): (34, 34, 39)}
pts = []
for origin, tab in (('own', T4), ('other', T5)):
    kinds = ['long', 'hood', 'sanitary', 'short'] if origin == 'own' else ['long', 'short']
    for kind, room, k in itertools.product(kinds, ['bedroom', 'study', 'living', 'kitchen', 'bath', 'technical', 'meeting'], range(3)):
        if origin == 'own' and room == 'meeting': continue
        v = tab.get((kind, room), 'absent')
        val = None if v == 'absent' else v[k]
        q = 'LAFmaxnT' if kind in ('sanitary', 'short') else 'LAeqnT'
        pts.append({'fn': 'service', 'input': {'cls': CL[k], 'origin': origin, 'kind': kind, 'room': room}, 'expect': {q: val}})
for n, q, k in itertools.product([4, 9, 10, 30], [1, 2, 3], range(3)):
    pts.append({'fn': 'service', 'input': {'cls': CL[k], 'origin': 'common_tech', 'dwellings': n, 'q': q}, 'expect': {'LAeqnT': round((74 if n < 10 else 84) - (round(10 * math.log10(q), 1) if q > 1 else 0), 1)}})
for meas, tonal, V, bed in itertools.product([27.4, 28.6, 29.4, 30.6, 31.4], [False, True], [20, 40], [True, False]):
    lim = 28 + (3 if (V < 25 and not bed) else 1)
    pts.append({'fn': 'service', 'input': {'cls': 'C', 'origin': 'own', 'kind': 'long', 'room': 'bedroom', 'measured': meas, 'tonal': tonal, 'V': V, 'bedroom': bed},
                'expect': {'LAeqnT': 28, 'pass': jround(meas + (5 if tonal else 0)) <= lim}})
case('s1-service', 'NBN S 01-400-1 Tab. 4–6, §8.2 tonal +5 dB, §8.4 −10 lg q and tolerance 1 / 3 dB', pts)

# ---------------------------------------------------------------- NBN S 01-400-3 Annex A Tab. A.1 (p. 36–37), Tab. B.1 / C.1
A1 = {}
def a1(rows):
    for line in rows.strip().split('\n'):
        name, imp, air, sens, conf = line.split(',')
        A1[name.strip()] = (imp.strip(), air.strip(), sens.strip(), conf.strip() == 'yes')
a1('''
student_room,normal,normal,very high,-
common_kitchen,normal,high,normal,-
common_bathroom,normal,high,low,-
cohousing_bedroom,normal,normal,very high,-
hotel_bedroom,normal,normal,very high,-
comfort_hotel_bedroom,normal,normal,extreme,-
hotel_bathroom,normal,normal,normal,-
hospital_bedroom,normal,normal,high,-
longstay_bedroom,normal,normal,very high,-
maternity,normal,high,high,-
healthcare_bathroom,normal,normal,normal,-
retirement_bedroom,normal,normal,very high,-
retirement_bathroom,normal,normal,normal,-
boarding_bedroom,normal,normal,very high,-
coffee_small,normal,normal,low,-
coffee_large,high,high,low,-
private_office,normal,normal,normal,yes
standard_office,normal,normal,normal,-
elementary_office,normal,normal,normal,-
open_plan,normal,normal,normal,-
call_centre,low,high,normal,-
cubicle,low,normal,normal,-
confidential_meeting,normal,normal,normal,yes
standard_meeting,normal,normal,normal,-
conference,normal,high,normal,-
translation_booth,low,normal,high,yes
operating,normal,normal,high,-
obstetric,normal,high,normal,-
examination,normal,normal,normal,yes
consultation,normal,normal,normal,yes
laboratory,normal,normal,normal,-
lab_loud,normal,very high,normal,-
waiting,normal,normal,low,-
service_room,normal,normal,high,-
revalidation,high,high,normal,-
daycare_day,high,high,low,-
daycare_rest,low,normal,high,-
workshop,high,high,low,-
interview,normal,normal,high,yes
court,normal,normal,high,yes
arena,high,very high,low,-
sport_hall,very high,high,low,-
fitness,extreme,high,low,-
dance,very high,high,normal,-
pool,low,high,low,-
wellness,low,normal,normal,-
bowling,extreme,high,low,-
squash,very high,high,low,-
riding,very high,high,low,-
bar,high,very high,low,-
cafeteria,high,high,low,-
restaurant,high,high,low,-
mall,high,normal,low,-
shop,normal,normal,low,-
supermarket,normal,normal,low,-
casino,normal,high,low,-
museum,normal,low,normal,-
library,normal,normal,normal,-
youth_centre,normal,very high,normal,-
playing_area,very high,very high,low,-
cinema,normal,very high,very high,-
disco,very high,very high,low,-
theatre,normal,very high,very high,-
concert,normal,very high,very high,-
multipurpose,high,very high,high,-
community_room,high,high,normal,-
reception,normal,normal,normal,-
lounge,normal,normal,low,-
dining,high,high,low,-
funeral,normal,normal,high,-
atrium,normal,normal,low,-
circulation,normal,normal,very low,-
small_kitchen,normal,high,low,-
large_kitchen,high,high,low,-
fridge,low,normal,very low,-
terrace,normal,-,low,-
restroom,normal,high,low,-
tech_quiet,normal,-,very low,-
tech_loud,normal,-,very low,-
tech_vloud,normal,-,very low,-
printer,normal,normal,low,-
luggage,low,low,very low,-
garbage,low,normal,low,-
laundry,normal,high,low,-
goods_corridor,extreme,low,very low,-
changing,normal,high,low,-
bike_park,normal,normal,low,-
car_park,normal,high,low,-
''')
SENS = ['very low', 'low', 'normal', 'high', 'very high', 'extreme']
B1 = {'low': [None, 28, 32, 36, 40, 44], 'normal': [None, 28, 40, 44, 48, 52], 'high': [None, 32, 44, 48, 52, 56], 'very high': [None, 32, 52, 56, 60, 64]}
B1_CONF = {'low': 6, 'normal': 4, 'high': 3, 'very high': 2}   # number of leading cells carrying note (1)
C1 = {'very low': [None, None, None, 65, 60, 55], 'low': [None, None, 65, 60, 55, 50], 'normal': [None, None, 60, 55, 50, 50],
      'high': [None, None, 55, 50, 45, 40], 'very high': [None, 65, 50, 45, 40, 35], 'extreme': [None, 60, 45, 40, 35, 30]}
SLEEP = {'student_room', 'cohousing_bedroom', 'hotel_bedroom', 'comfort_hotel_bedroom', 'hospital_bedroom', 'longstay_bedroom', 'retirement_bedroom', 'boarding_bedroom', 'daycare_rest', 'maternity'}
def generic(send, recv, door=False, conf=False, company=False, bldg=False, laeq=None):
    si, ri = A1[send], A1[recv]
    j = SENS.index(ri[2]); confid = conf or si[3]
    # airborne
    if si[1] == '-': da = None
    else:
        v = B1[si[1]][j]
        if confid and j < B1_CONF[si[1]]: v = max(v or 0, 48)
        if v is not None and si[1] == 'low' and j >= 4 and recv in SLEEP: v = max(v, 48)
        da = v
        if da is not None:
            if door and not confid: da -= 4
            if company: da += 4
            # §5.2: the +(LAeq,15min − 80) increase belongs to the requirements towards dwellings (shared reading la_req_act3)
            if bldg: da = max(da, 50)
    ln = C1[si[0]][j]
    if ln is not None:
        if company: ln -= 5
        if bldg: ln = min(ln, 55)
    return {'DA': da, 'LnTw': ln}
names = sorted(A1)
RECVS = ['circulation', 'lounge', 'library', 'service_room', 'cinema', 'comfort_hotel_bedroom', 'hotel_bedroom', 'museum', 'translation_booth']
third = (len(names) + 2) // 3
for gi in range(3):
    grp = names[gi * third:(gi + 1) * third]
    pts = [{'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': 'generic', 'send': s, 'recv': r}, 'expect': generic(s, r)} for s in grp for r in RECVS]
    case('s3-generic-B1-C1-' + 'abc'[gi], f'NBN S 01-400-3 Annex A Tab. A.1 classes → Tab. B.1 (notes 1–2) / Tab. C.1, sending spaces {grp[0]} … {grp[-1]} × 9 receiving spaces', pts)
pts = []
for s, r, door, conf, comp, bldg, laeq in itertools.product(['bar', 'private_office', 'shop', 'fitness', 'museum'], ['cinema', 'library', 'hotel_bedroom', 'lounge'],
                                                           [False, True], [False, True], [False, True], [False, True], [None, 90]):
    inp = {'norm': 'S01-400-3', 'type': 'generic', 'send': s, 'recv': r, 'door': door, 'confidential': conf, 'otherCompany': comp, 'otherBuilding': bldg, 'LAeq_dB': laeq}
    pts.append({'fn': 'pair', 'input': inp, 'expect': generic(s, r, door, conf, comp, bldg, laeq)})
case('s3-generic-rules', '§5.2 / §6.2: door −4 dB (not with confidentiality), other companies +4 / −5 dB, two buildings ≥ 50 / ≤ 55 dB; LAeq 90 gives no increase between non-residential spaces', pts)
# towards a dwelling (§5.2 / §6.2 + Note 2, interpretation: Note 2 only without LAeq)
pts = []
for s, other, laeq in itertools.product(['shop', 'bar', 'fitness', 'restaurant', 'museum', 'goods_corridor'], [False, True], [None, 88]):
    imp, air = A1[s][0], A1[s][1]
    da = (58 if other else 54) + (laeq - 80 if laeq else {'high': 4, 'very high': 8}.get(air, 0))
    ln = (48 if other else 52) - {'high': 5, 'very high': 10, 'extreme': 15}.get(imp, 0)
    pts.append({'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': 'generic', 'send': s, 'recv': 'dwelling', 'dwellingBuilding': 'other' if other else 'same', 'LAeq_dB': laeq}, 'expect': {'DA': da, 'LnTw': ln}})
case('s3-to-dwelling', '§5.2 / §6.2: to a dwelling 54 / 58 dB and 52 / 48 dB, Note 2 production corrections', pts)

# ---------------------------------------------------------------- NBN S 01-400-3 Tables 1–10 by building type
# each table: receiving columns, sending rows with their member spaces; cell = int | (no door, with door) | '*' | 'nr' | 'tech'
def T(rows): return [(set(r[0].split()), r[1]) for r in rows]
TABLES = {
 'hotel': {
  'airC': [{'hotel_bedroom'}, {'comfort_hotel_bedroom'}, {'standard_office', 'standard_meeting', 'conference'}, {'reception'}, {'restaurant'}],
  'air': T([('circulation', [(48, 38), (52, 40), (40, 32), 'nr', 'nr']), ('hotel_bedroom comfort_hotel_bedroom hotel_bathroom', [48, 52, '*', '*', '*']),
            ('standard_office', [48, 52, 42, '*', '*']), ('standard_meeting', [48, 52, 42, 40, '*']), ('conference', [52, 56, 48, 44, 32]),
            ('pool fitness restaurant large_kitchen laundry car_park', [52, 56, 44, 44, 32]), ('luggage storage', [48, 52, 32, 'nr', 'nr']),
            ('reception shop wellness', [48, 52, 40, 'nr', 'nr']), ('restroom', [52, 56, 44, 40, 32]), ('garbage', [48, 52, 40, 40, 28]), ('technical', ['tech'] * 5)]),
  'impC': [{'hotel_bedroom'}, {'comfort_hotel_bedroom'}, {'standard_office', 'standard_meeting', 'conference', 'reception'}, {'restaurant'}],
  'imp': T([('hotel_bedroom comfort_hotel_bedroom hotel_bathroom', [55, 50, 60, 'nr']),
            ('circulation standard_office standard_meeting conference reception shop restroom laundry technical', [50, 50, 60, 'nr']),
            ('large_kitchen restaurant', [45, 40, 55, 'nr']), ('fitness', [35, 30, 45, 60]), ('pool wellness luggage storage garbage', [55, 50, 65, 'nr'])])},
 'office': {
  'airC': [{'private_office', 'standard_office', 'standard_meeting', 'confidential_meeting', 'conference'}, {'elementary_office', 'cubicle', 'open_plan'}, {'coffee_small', 'coffee_large', 'dining'}, {'circulation'}],
  'air': T([('circulation', [(40, 32), (36, 28), 'nr', 'nr']), ('private_office confidential_meeting', [48, 48, 48, (48, 38)]),
            ('standard_office elementary_office cubicle standard_meeting', [42, 38, '*', '*']), ('open_plan', [(42, 34), (38, 30), '*', '*']),
            ('conference', [48, 48, 48, (48, 38)]), ('coffee_small', [42, 38, 'nr', 'nr']), ('printer', [40, 40, 28, 'nr']),
            ('large_kitchen dining coffee_large', [48, 44, 'nr', 'nr']), ('restroom', [44, 44, 44, 'nr']), ('technical', ['tech'] * 4)]),
  'impC': [{'private_office', 'standard_office', 'elementary_office', 'open_plan', 'cubicle', 'standard_meeting', 'confidential_meeting', 'conference'}, {'coffee_small', 'coffee_large', 'dining'}],
  'imp': T([('circulation private_office standard_office elementary_office cubicle open_plan standard_meeting confidential_meeting conference coffee_small printer restroom technical', [60, 'nr']),
            ('large_kitchen dining coffee_large', [55, 'nr'])])},
 'retirement': {
  'airC': [{'retirement_bedroom', 'living_room'}, {'service_room'}, {'small_community', 'large_community'}, {'dining'}],
  'air': T([('circulation', [(48, 36), (40, 32), 'nr', 'nr']), ('retirement_bedroom living_room retirement_bathroom', [48, '*', '*', '*']),
            ('service_room', [48, 44, '*', '*']), ('small_community', [(52, 40), 48, 32, 32]), ('large_community dining', [52, 48, 32, 32]),
            ('large_kitchen', [52, 48, 44, 'nr']), ('laundry', [52, 48, 44, 44]), ('technical', ['tech'] * 4)]),
  'impC': [{'retirement_bedroom', 'living_room', 'service_room'}, {'small_community', 'large_community', 'dining'}],
  'imp': T([('circulation retirement_bedroom living_room retirement_bathroom service_room laundry technical', [55, 60]),
            ('small_community large_community dining large_kitchen', [50, 55])])},
 'student': {
  'airC': [{'student_room', 'cohousing_bedroom'}, {'comfort_student_room'}],
  'air': T([('circulation', [(48, 32), (48, 36)]), ('student_room comfort_student_room cohousing_bedroom', [48, 48]),
            ('community_room common_kitchen common_sanitary', [52, 52]), ('technical', ['tech', 'tech'])]),
  'impC': [{'student_room', 'comfort_student_room', 'cohousing_bedroom'}],
  'imp': T([('circulation student_room comfort_student_room cohousing_bedroom common_kitchen common_sanitary technical', [55]), ('community_room', [50])])},
 'healthcare': {
  'airC': [{'hospital_bedroom', 'maternity', 'service_room', 'examination', 'consultation', 'confidential_examination', 'operating'}, {'longstay_bedroom'},
           {'laboratory', 'obstetric', 'revalidation', 'small_community'}, {'waiting'}],
  'air': T([('circulation waiting', [(44, 36), (48, 36), (40, 36), 'nr']),
            ('hospital_bedroom longstay_bedroom service_room examination operating laboratory small_community', [44, 48, 40, 28]),
            ('confidential_examination consultation', [48, 48, 48, (48, 38)]), ('obstetric revalidation maternity dining large_kitchen laundry', [48, 52, 44, 32]),
            ('lab_loud', [56, 60, 52, 32]), ('technical', ['tech'] * 4)]),
  'impC': [{'hospital_bedroom', 'maternity', 'service_room', 'examination', 'consultation', 'confidential_examination', 'operating'}, {'longstay_bedroom'},
           {'laboratory', 'obstetric', 'revalidation', 'small_community'}, {'waiting'}],
  'imp': T([('circulation waiting hospital_bedroom longstay_bedroom maternity service_room examination consultation confidential_examination operating obstetric laboratory small_community laundry technical lab_loud', [55, 50, 60, 'nr']),
            ('revalidation dining large_kitchen', [50, 45, 55, 'nr'])])}}
# the tool's space lists (and their Annex A class for the fall-back to B.1 / C.1)
SPACE_A1 = {'storage': 'luggage', 'technical': 'tech_loud', 'living_room': 'retirement_bedroom', 'small_community': 'community_room', 'large_community': 'community_room',
            'comfort_student_room': 'student_room', 'common_sanitary': 'common_bathroom', 'confidential_examination': 'examination'}
SPACES = {
 'hotel': 'circulation hotel_bedroom comfort_hotel_bedroom hotel_bathroom standard_office standard_meeting conference pool fitness restaurant large_kitchen laundry car_park luggage storage reception shop wellness restroom garbage technical',
 'office': 'circulation private_office confidential_meeting standard_office elementary_office cubicle standard_meeting open_plan conference coffee_small printer large_kitchen dining coffee_large restroom technical',
 'retirement': 'circulation retirement_bedroom living_room retirement_bathroom service_room small_community large_community dining large_kitchen laundry technical',
 'student': 'circulation student_room comfort_student_room cohousing_bedroom community_room common_kitchen common_sanitary technical',
 'healthcare': 'circulation waiting hospital_bedroom maternity service_room examination consultation confidential_examination operating longstay_bedroom laboratory obstetric revalidation small_community dining large_kitchen laundry lab_loud technical'}
def cell(rows, cols, s, r):
    ci = [i for i, c in enumerate(cols) if r in c]
    for members, vals in rows:
        if s in members and ci: return vals[ci[0]]
    return None
def typed(ty, s, r, door=False, conf=False, comp=False):
    t = TABLES[ty]; a1s = SPACE_A1.get(s, s); a1r = SPACE_A1.get(r, r)
    confid = conf or A1[a1s][3]
    v = cell(t['air'], t['airC'], s, r)
    if v == '*':
        v = cell(t['air'], t['airC'], r, s)
        if v == '*': v = None
    if v == 'tech' or v == 'nr': da = None
    elif v is None: da = generic(a1s, a1r, door, conf, comp)['DA']
    else:
        if isinstance(v, tuple): da = v[1] if door else v[0]
        else: da = v - 4 if (door and not confid) else v
        if comp and ty == 'office': da = min(da + 4, max(da, 50))     # Tab. 2 last paragraph: every Table 2 value, door values included
    w = cell(t['imp'], t['impC'], s, r)
    if w == 'nr': ln = None
    elif w is None: ln = generic(a1s, a1r, False, False, comp)['LnTw']
    else:
        ln = w
        if comp and ty == 'office': ln = max(ln - 5, min(ln, 50))
    return {'DA': da, 'LnTw': ln}
for ty, sp in SPACES.items():
    sp = sp.split(); pts = []
    for s, r, door in itertools.product(sp, sp, [False, True]):
        pts.append({'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': ty, 'send': s, 'recv': r, 'door': door}, 'expect': typed(ty, s, r, door)})
    if ty == 'office':
        for s, r, conf, comp in itertools.product(sp, ['private_office', 'open_plan', 'coffee_small', 'circulation'], [False, True], [False, True]):
            pts.append({'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': ty, 'send': s, 'recv': r, 'door': True, 'confidential': conf, 'otherCompany': comp}, 'expect': typed(ty, s, r, True, conf, comp)})
    case('s3-' + ty, f'NBN S 01-400-3 {ty}: Tab. {dict(hotel="1/6", office="2/7", retirement="3/8", student="4/9", healthcare="5/10")[ty]} all space pairs with / without a door (fall-back B.1 / C.1)', pts)

# ---------------------------------------------------------------- NBN S 01-400-3 façade Tab. 11 + Tab. 12
T12 = {'student_room': (34, 28), 'cohousing_bedroom': (34, 28), 'hotel_bedroom': (34, 28), 'comfort_hotel_bedroom': (34, 28), 'hospital_bedroom': (34, 28),
       'longstay_bedroom': (34, 28), 'retirement_bedroom': (34, 28), 'boarding_bedroom': (34, 28), 'maternity': (34, 28), 'hotel_bathroom': (35, None),
       'healthcare_bathroom': (40, None), 'retirement_bathroom': (40, None), 'common_kitchen': (40, None), 'private_office': (37, None), 'standard_office': (37, None),
       'open_plan': (45, None), 'call_centre': (45, None), 'cubicle': (37, None), 'standard_meeting': (37, None), 'confidential_meeting': (37, None), 'conference': (37, None),
       'operating': (40, None), 'obstetric': (40, None), 'examination': (35, None), 'consultation': (35, None), 'laboratory': (45, None), 'lab_loud': (35, None),
       'service_room': (35, None), 'revalidation': (40, None), 'daycare_rest': (40, None), 'interview': (35, None), 'court': (35, None), 'dance': (40, None),
       'wellness': (40, None), 'museum': (35, None), 'library': (35, None), 'youth_centre': (45, None), 'cinema': (30, None), 'theatre': (30, None), 'concert': (25, None),
       'multipurpose': (40, None), 'community_room': (40, None), 'reception': (45, None), 'funeral': (35, None)}
pts = []
for sp, day, night, lmax, second, dayuse in itertools.product(sorted(T12) + ['lounge', 'shop'], [55, 66, 72], [45, 57, 63], [None, 74], [False, True], [False, True]):
    if A1[sp][2] in ('very low', 'low'): e = {'DAtr': None}
    else:
        d, n = T12[sp]; bed = sp in SLEEP and n is not None
        t = [day - d + (3 if second and day > d + 28 else 0), 28]
        if bed: t.append(night - n + (3 if second and night > n + 28 else 0))
        if bed and dayuse: t.append(day - n)
        if bed and lmax is not None and lmax >= 70: t.append(34)
        e = {'DAtr': max(t)}
    pts.append({'fn': 'facade', 'input': {'norm': 'S01-400-3', 'space': sp, 'LAday': day, 'LAnight': night, 'LAmax3xNight': lmax, 'secondPane': second, 'dayUse': dayuse}, 'expect': e})
case('s3-facade', 'NBN S 01-400-3 Tab. 11 (notes 1–2, Note 6) with Tab. 12 indoor levels; sensitivity below normal → none', pts)

# ---------------------------------------------------------------- absorption: part 1 §9.2, part 3 Tab. 15 / 16, Annex E Tab. E.1, Sabine
E1 = {  # Tab. E.1 (a)(b)(c) rows L:W:H 1:1:1 2:1:1 5:1:1 10:1:1 2:2:1 5:2:1 10:2:1 5:5:1 10:5:1 10:10:1; columns αw,ceil 0,4 0,6 0,8 0,9 1
 'a': ['93 92 90 89 88', '92 89 87 86 85', '90 87 84 83 81', '89 86 83 81 80', '88 85 81 80 78', '84 79 75 73 71', '82 76 72 70 68', '74 68 62 60 57', '68 61 55 52 50', '58 50 44 41 39'],
 'b': ['91 92 92 92 91', '91 91 90 90 89', '88 89 88 87 86', '87 88 86 86 85', '91 89 87 85 84', '88 85 81 80 78', '86 82 79 77 75', '81 75 70 68 66', '75 69 63 61 59', '66 59 53 50 48'],
 'c': ['91 90 88 87 86', '88 86 84 83 82', '86 83 81 79 78', '84 82 79 78 76', '83 80 77 76 74', '77 73 70 68 66', '74 70 66 64 62', '64 59 55 53 51', '55 50 46 44 42', '42 38 34 32 31']}
RATIOS = [(1, 1), (2, 1), (5, 1), (10, 1), (2, 2), (5, 2), (10, 2), (5, 5), (10, 5), (10, 10)]
ALPHAS = [0.4, 0.6, 0.8, 0.9, 1.0]
def eps(L, W, H, a, sit):
    l, w = max(L, W) / H, min(L, W) / H
    i = min(range(10), key=lambda k: (abs(math.log(l / RATIOS[k][0])) + abs(math.log(w / RATIOS[k][1])), k))
    row = [int(x) / 100 for x in E1[sit][i].split()]
    a = min(1.0, max(0.4, a))
    for j in range(4):
        if a <= ALPHAS[j + 1] + 1e-12:
            return round(row[j] + (a - ALPHAS[j]) / (ALPHAS[j + 1] - ALPHAS[j]) * (row[j + 1] - row[j]), 3)
pts = []
for sit, (L, W, H), a in itertools.product('abc', [(3, 3, 3), (6, 3, 3), (15, 3, 3), (30, 3, 3), (6, 6, 3), (15, 6, 3), (30, 6, 3), (15, 15, 3), (30, 15, 3), (30, 30, 3), (8, 5, 3), (40, 12, 4)], [0.3, 0.4, 0.5, 0.6, 0.75, 0.85, 0.95, 1.0]):
    pts.append({'fn': 'eps', 'input': [L, W, H, a, sit], 'expect': {'eps': eps(L, W, H, a, sit)}})
case('s3-eps-E1', 'NBN S 01-400-3 Annex E Tab. E.1 εspat (nearest proportion row, linear in αw,ceil)', pts)
pts = []
def r1(x): return math.floor(x * 10 + 0.5) / 10
for SH, S1, a1_, S2, a2 in itertools.product([20, 60], [10, 40], [0.05, 0.3, 0.9], [100], [0.04, 0.1]):
    Adiff = (S1 * a1_ if a1_ > 0.05 else 0) + (S2 * a2 if a2 > 0.05 else 0)
    pts.append({'fn': 'absorption', 'input': {'norm': 'S01-400-1', 'space': 'circulation', 'SH': SH, 'surfaces': [{'S': S1, 'alpha': a1_}, {'S': S2, 'alpha': a2}]},
                'expect': {'Aw': r1(0.3 * SH), 'pass_Aw': r1(Adiff) >= r1(0.3 * SH) - 1e-9}})
for V in [500, 1500, 1581, 2000, 10000]:
    pts.append({'fn': 'absorption', 'input': {'norm': 'S01-400-1', 'space': 'atrium', 'V': V}, 'expect': {'T': round(max(1.5, math.log10(V / 50)), 2)}})
T16F = {'meeting': lambda V, N: 0.8, 'conference': lambda V, N: 0.35 * math.log10(1.25 * V), 'sport_hall': lambda V, N: min(math.log10(V / 50), 2.4),
        'dance': lambda V, N: 1.2, 'bar': lambda V, N: 0.25 * V / N, 'restaurant': lambda V, N: 0.13 * V / N, 'museum': lambda V, N: max(1, math.log10(V / 50)),
        'library': lambda V, N: 1.0, 'reception': lambda V, N: math.log10(V / 20), 'atrium': lambda V, N: math.log10(V / 20), 'exhibition': lambda V, N: 0.18 * V / N,
        'open_plan': lambda V, N: 0.6, 'court': lambda V, N: 0.35 * math.log10(1.25 * V), 'playing_area': lambda V, N: min(math.log10(V / 50), 2.4)}
T15F = {'sport': None, 'circulation': ('SH', 0.3), 'cafe': ('N', 0.65), 'restaurant': ('N', 1.25), 'reception': ('N', 0.9)}
case('s1-absorption', 'NBN S 01-400-1 §9.2: common circulation Aw ≥ 0,3·SH (αw > 0,05 only), atrium T ≤ max(1,5 s; lg(V/50))', pts)
pts = []
TFLOOR = 0.4   # §9.3 'The requirements for Tnom must never be lower than 0,4 s'
for sp16, V, N in itertools.product(sorted(T16F), [150, 900, 6000], [20, 80]):
    pts.append({'fn': 'absorption', 'input': {'norm': 'S01-400-3', 'space16': sp16, 'V': V, 'N': N}, 'expect': {'Tnom': round(max(TFLOOR, T16F[sp16](V, N)), 2)}})
case('s3-tnom-tab16', 'NBN S 01-400-3 Tab. 16 Tnom limits for 14 space kinds × V × N, with the §9.3 floor 0,4 s', pts)
pts = []
for sp16, V, N in [('restaurant', 150, 80), ('restaurant', 100, 50), ('bar', 60, 50), ('sport_hall', 80, 1), ('playing_area', 60, 1), ('reception', 30, 1),
                   ('atrium', 40, 1), ('exhibition', 100, 60), ('conference', 4, 1), ('dining_room', 80, 60), ('restaurant', 400, 80), ('reception', 60, 1)]:
    pts.append({'fn': 'absorption', 'input': {'norm': 'S01-400-3', 'space16': sp16, 'V': V, 'N': N}, 'expect': {'Tnom': round(max(TFLOOR, T16F.get(sp16, lambda V, N: 0.25 * V / N)(V, N)), 2)}})
case('s3-tnom-floor-9.3', 'NBN S 01-400-3 §9.3: Tnom requirements never lower than 0,4 s (small rooms, many persons)', pts)
pts = []
for sp15, SH, N, S1, a1_, ceil in itertools.product(sorted(T15F), [50], [40, 80], [120, 180], [0.5, 0.9], [None, (30, 6, 3, 'a'), (12, 10, 3, 'b')]):
    A = S1 * a1_; e = eps(ceil[0], ceil[1], ceil[2], a1_, ceil[3]) if ceil else 1; Aeff = A * e
    inp = {'norm': 'S01-400-3', 'space15': sp15, 'V': 600, 'SH': SH, 'N': N, 'surfaces': [{'S': S1, 'alpha': a1_}, {'S': 300, 'alpha': 0.03}],
           'ceilingOnly': {'L': ceil[0], 'W': ceil[1], 'H': ceil[2], 'alphaCeil': a1_, 'situation': ceil[3]} if ceil else None}
    if T15F[sp15] is None: ex = {'alphaEff': 0.2, 'achieved_alphaEff': round(Aeff / (S1 + 300), 3)}
    else:
        q, k = T15F[sp15]; need = r1(k * (SH if q == 'SH' else N)); ex = {'Aeff': need, 'achieved_Aeff': r1(Aeff), 'pass_Aeff': r1(Aeff) >= need - 1e-9}
    ex['T_est'] = round(0.16 * 600 / Aeff, 2)
    pts.append({'fn': 'absorption', 'input': inp, 'expect': ex})
case('s3-absorption-tab15', 'NBN S 01-400-3 Tab. 15 design absorption with Annex E (Aeff = εspat·Adiff); Sabine T = 0,16 V / Aeff', pts)

# §9.2 / §9.3 verdict, written from the clause: design → Tab. 15 is sufficient; measured Tnom ≤ 1,1 × limit (× 0,9 if the requirement is for the
# unfurnished space and it was measured furnished, × 1,1 for the reverse) → passes and Tab. 15 is cancelled; otherwise passes only if Tab. 15 is met
# (with correct workmanship). Without a Tab. 15 row the Sabine estimate is compared with the Tnom limit (learning assumption).
FURN = {'open_plan', 'bedroom', 'maternity', 'call_centre', 'daycare_day'}
def verdict(sp15, sp16, V, N, Aeff, Tm, other):
    need = None
    if sp15: q, k = T15F[sp15]; need = r1(k * N)
    lim = max(TFLOOR, T16F[sp16](V, N)) if sp16 else None
    lim = round(lim, 2) if lim is not None else None
    p15 = (r1(Aeff) >= need - 1e-9) if need is not None else None
    if Tm is not None and lim is not None:
        adj = (1.1 if sp16 in FURN else 0.9) if other else 1.0
        if Tm <= lim * adj * 1.1 + 1e-9: return True, 'meas_tnom'
        if p15: return True, 'meas_t15_work'
        return False, 'meas_fail'
    if p15 is not None: return p15, 'design_t15'
    T = round(0.16 * V / Aeff, 2)
    return T <= lim + 1e-9, 'sabine_t16'
pts = []
for sp, V, N, S1, a1_, Tm, other in itertools.product([('restaurant', 'restaurant'), ('reception', 'reception'), (None, 'open_plan'), (None, 'meeting')],
                                                     [540, 2000], [80], [120, 180], [0.3, 0.6], [None, 0.5, 0.9, 0.97, 2.2], [False, True]):
    sp15, sp16 = sp
    if other and Tm is None: continue
    Aeff = S1 * a1_
    pv, basis = verdict(sp15, sp16, V, N, Aeff, Tm, other)
    inp = {'norm': 'S01-400-3', 'space15': sp15 or '', 'space16': sp16, 'V': V, 'N': N, 'surfaces': [{'S': S1, 'alpha': a1_}], 'T_measured': Tm, 'measOther': other}
    pts.append({'fn': 'absorption', 'input': inp, 'expect': {'verdict': pv, 'basis': basis}})
case('s3-absorption-verdict-9.2', 'NBN S 01-400-3 §9.2 a)/b) and §9.3: design → Tab. 15 decides; measured Tnom + 10 % (other furnishing state × 0,9 / × 1,1) → Tab. 15 cancelled, else Tab. 15 + workmanship', pts)

# §5.2 activity increase only towards dwellings (shared reading la_req_act3) — healthcare / office / hotel tables and B.1
pts = []
for ty, s_, r_, laeq in itertools.product(['healthcare'], ['lab_loud', 'examination', 'dining'], ['hospital_bedroom', 'laboratory'], [None, 84, 95]):
    pts.append({'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': ty, 'send': s_, 'recv': r_, 'LAeq_dB': laeq}, 'expect': typed(ty, s_, r_)})
for s_, other, laeq, laf5 in itertools.product(['bar', 'shop'], [False, True], [84, 95], [None, 99]):
    add = max([0] + [v - 80 for v in (laeq, laf5) if v is not None])
    imp = A1[s_][0]
    pts.append({'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': 'generic', 'send': s_, 'recv': 'dwelling', 'dwellingBuilding': 'other' if other else 'same', 'LAeq_dB': laeq, 'LAF5_dB': laf5},
                'expect': {'DA': (58 if other else 54) + add, 'LnTw': (48 if other else 52) - {'high': 5, 'very high': 10, 'extreme': 15}.get(imp, 0)}})
case('s3-activity-dwellings-only', '§5.2: +(LAeq,15min − 80) / +(LAF5,15min − 80) dB towards dwellings; none between non-residential spaces (Tables 1–5 contain the production)', pts)

# special notes that replace the table value: Tab. 4 note 3 (34 dB, same unit), Tab. 2 note 3 (42 dB, mobile partition), Tab. 9 note 5 — no door relief on them
pts = []
for door, unit in itertools.product([False, True], [False, True]):
    for s_, r_ in [('student_room', 'student_room'), ('student_room', 'comfort_student_room'), ('cohousing_bedroom', 'student_room'), ('community_room', 'student_room')]:
        base = typed('student', s_, r_, door)
        da = 34 if (unit and s_ in ('student_room', 'cohousing_bedroom', 'comfort_student_room')) else base['DA']
        ln = None if (unit and s_ in ('student_room', 'cohousing_bedroom', 'comfort_student_room')) else base['LnTw']
        pts.append({'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': 'student', 'send': s_, 'recv': r_, 'door': door, 'sameUnit': unit}, 'expect': {'DA': da, 'LnTw': ln}})
for door, mob in itertools.product([False, True], [False, True]):
    base = typed('office', 'conference', 'standard_office', door)
    pts.append({'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': 'office', 'send': 'conference', 'recv': 'standard_office', 'door': door, 'mobilePartition': mob},
                'expect': {'DA': 42 if mob else base['DA'], 'LnTw': base['LnTw']}})
case('s3-note-overrides', 'NBN S 01-400-3 Tab. 4 note 3 (34 dB within one unit), Tab. 9 note 5, Tab. 2 note 3 (42 dB with a mobile partition); no door relief on them (shared reading)', pts)

# part 3 in-situ tolerance §5.2 / §6.2 (rounded; 2 dB, 4 dB below 25 m³ except bedrooms)
pts = []
for q, meas, V, bed in itertools.product(['DA', 'LnTw'], [43.4, 45.6, 46.4, 47.5, 49.6, 52.4, 55.6, 57.4], [20, 40], [True, False]):
    pair = {'norm': 'S01-400-3', 'type': 'hotel', 'send': 'hotel_bedroom', 'recv': 'hotel_bedroom'} if bed else {'norm': 'S01-400-3', 'type': 'office', 'send': 'standard_office', 'recv': 'standard_office'}
    req = typed(pair['type'], pair['send'], pair['recv'])[q]
    tol = 4 if (V < 25 and not bed) else 2
    m = jround(meas)
    ok = m >= req - tol if q == 'DA' else m <= req + tol
    pts.append({'fn': 'check', 'input': {'pair': pair, 'q': q, 'measured': meas, 'V': V, 'bedroom': bed}, 'expect': {'pass': ok, 'tol': tol, 'rounded': m}})
case('s3-tolerance', 'NBN S 01-400-3 §5.2 / §6.2 in-situ tolerance with rounding (2 dB, 4 dB below 25 m³ except bedrooms)', pts)

# ---------------------------------------------------------------- anchors: values printed in the norms' own text (not table cells)
anch = [
 {'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': 'generic', 'send': 'shop', 'recv': 'dwelling', 'dwellingBuilding': 'same'}, 'expect': {'DA': 54, 'LnTw': 52}},
 {'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': 'generic', 'send': 'shop', 'recv': 'dwelling', 'dwellingBuilding': 'other'}, 'expect': {'DA': 58, 'LnTw': 48}},
 {'fn': 'pair', 'input': {'norm': 'S01-400-3', 'type': 'generic', 'send': 'museum', 'recv': 'museum', 'otherBuilding': True}, 'expect': {'DA': 50, 'LnTw': 55}},
 {'fn': 'absorption', 'input': {'norm': 'S01-400-1', 'space': 'atrium', 'V': 800}, 'expect': {'T': 1.5}}]
case('anchors-norm-text', 'values stated in the running text: part 3 §5.2 / §6.2 (54 / 58 dB, 52 / 48 dB to dwellings; ≥ 50 / ≤ 55 dB between two buildings), part 1 §9.2 atrium 1,5 s', anch, anchor=True)

with open(os.path.join(HERE, 'acousticreqbe_ref.json'), 'w', encoding='utf-8') as f:
    json.dump(cases, f, indent=0, ensure_ascii=False)
print(len(cases), 'cases,', sum(len(c['points']) for c in cases), 'points')
