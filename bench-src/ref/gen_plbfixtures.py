"""Independent reference for plbfixtures (Sanitary Fixture Count).

Written from the published method _plb/fix/METHOD.md (plbfixtures-1.3) and the public sources it cites:
  - Belgian Codex over het welzijn op het werk, Book III Title 1, sanitary facilities (FOD WASO page)
  - ASR A4.1 Sanitaerraeume, Table 2 (BGN reproduction)
  - HSE ACOP L24 (3rd ed. 2013) Tables 1 and 2, para 200 (above 100 people), para 201 (dirty work washbasins), pp. 39-40
  - ASR A4.1 Nr. 4 Abs. 6 (shared rooms "in Betrieben mit bis zu neun Beschaeftigten", time-separated use)
Run 4 (Codex deep review): Y1-3 the nine-employee limit is checked on the establishment = all zones of the project;
Y1-4/Y1-5 showers/washing requested in a method without that rule -> 'incomplete'; L24 para 201 dirty-work washbasins;
Y1-8 the L24 increments above 100 are para 200 (cited, no longer an assumption).
Run 2 (D-PLB-10): EXTERNAL ANCHORS — cases whose expected counts are typed in by hand from the cited table row / reading
example of the standard text (not computed by this file); the script asserts that its own model reproduces them.
Run 2 (D-PLB-6): APPLY cases — "Apply to project" must give max(existing, workplace minimum) and store workplace_min.
Run 3 (X1-3): INPUT RULE cases — a headcount is a whole number 0-100 000; a fraction is rejected (persons_integer),
not rounded; outside the range -> persons_range; such a zone is listed as invalid and not counted.
Not ported from plb-fixtures.js. Output: bench-src/ref/plbfixtures_ref.json
Run: python bench-src/ref/gen_plbfixtures.py
"""
import json
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent / 'plbfixtures_ref.json'


def cdiv(a, b):
    return 0 if a <= 0 else -(-a // b)


# ASR A4.1 Table 2 as (upper bound, low T, low B, high T, high B)
ASR_ROWS = [(5, 1, 1, 2, 1), (10, 1, 1, 3, 1), (25, 2, 1, 4, 2), (50, 3, 1, 6, 2), (75, 5, 2, 7, 3), (100, 6, 2, 9, 3),
            (130, 7, 3, 11, 4), (160, 8, 3, 13, 4), (190, 9, 3, 15, 5), (220, 10, 4, 17, 6), (250, 11, 4, 19, 7)]


def asr_lookup(n, high):
    if n <= 0:
        return 0, 0
    for up, lt, lb, ht, hb in ASR_ROWS:
        if n <= up:
            return (ht, hb) if high else (lt, lb)
    extra = n - 250
    step = 2 if high else 1
    t0, b0 = (19, 7) if high else (11, 4)
    return t0 + step * cdiv(extra, 30), b0 + step * cdiv(extra, 90)


# HSE L24 Table 1: (upper bound, WCs = washbasins); Table 2: (upper bound, WCs, urinals)
L24_1 = [(5, 1), (25, 2), (50, 3), (75, 4), (100, 5)]
L24_2 = [(15, 1, 1), (30, 2, 1), (45, 2, 2), (60, 3, 2), (75, 3, 3), (90, 4, 3), (100, 4, 4)]


def l24_t1(n):
    if n <= 0:
        return 0
    for up, w in L24_1:
        if n <= up:
            return w
    return 5 + cdiv(n - 100, 25)          # L24 para 200: +1 toilet and washbasin per further 25 above 100


def l24_t2(n):
    if n <= 0:
        return 0, 0
    for up, w, u in L24_2:
        if n <= up:
            return w, u
    k = cdiv(n - 100, 50)                 # L24 para 200: men only +1 cubicle per further 50, at least as many extra urinals
    return 4 + k, 4 + k


def l24_dirty(n):
    # L24 para 201: one washbasin per 10 people (or fraction) up to 50, one extra per further 20 (or fraction)
    if n <= 0:
        return 0
    if n <= 50:
        return cdiv(n, 10)
    return 5 + cdiv(n - 50, 20)


def split(n, pct):
    pct = min(100.0, max(0.0, pct))
    f = math.floor(n * pct / 100.0 + 0.5)
    f = min(f, n)
    return f, n - f


def zone(n, o, female=None):
    """One zone. o: method, simultaneity, uk_mode, urinals, accessible, washing, showers, female_pct."""
    if female is None:
        f, m = split(n, o['female_pct'])
    else:
        f, m = female, n - female
    ww = wb = mw = mu = mb = uw = ub = 0
    taps = showers = 0
    missing = []
    meth = o['method']
    if meth == 'be_codex':
        ww = cdiv(f, 15)
        places = cdiv(m, 15)
        mw = min(places, cdiv(m, 25)) if o['urinals'] else places
        mu = places - mw
        wb = cdiv(ww, 4)
        mb = cdiv(mw + mu, 4)
        if o['washing'] in ('per3', 'per5'):
            d = 3 if o['washing'] == 'per3' else 5
            taps = cdiv(f, d) + cdiv(m, d)
        if o['showers']:
            showers = cdiv(f, 6) + cdiv(m, 6)
    elif meth == 'de_asr' and o.get('asr_shared') and o.get('_est', n) <= 9:
        # ASR A4.1 Nr. 4 (6): up to nine employees, one shared set from the Table 2 row for all n
        uw, ub = asr_lookup(n, o['simultaneity'] == 'high')
    elif meth == 'de_asr':
        high = o['simultaneity'] == 'high'
        tf, bf = asr_lookup(f, high)
        tm, bm = asr_lookup(m, high)
        ww, wb = tf, bf
        mw = cdiv(tm, 3) if o['urinals'] else tm
        mu = tm - mw
        mb = bm
    if meth == 'de_asr':
        # ASR A4.1 Nr. 6 wash rooms are not in the method -> requested items are listed as not computed
        if o['washing'] != 'none':
            missing.append('washing')
        if o['showers']:
            missing.append('showers')
    if meth == 'uk_l24':
        if o['uk_mode'] == 'mixed':
            uw = l24_t1(n)
            ub = uw
        else:
            ww = l24_t1(f)
            wb = ww
            if o['urinals']:
                mw, mu = l24_t2(m)
            else:
                mw = l24_t1(m)
            mb = l24_t1(m)
        if o['washing'] != 'none':
            # dirty work: washbasins increased per group to the para 201 count
            if o['uk_mode'] == 'mixed':
                ub = max(ub, l24_dirty(n))
            else:
                wb = max(wb, l24_dirty(f))
                mb = max(mb, l24_dirty(m))
        if o['showers']:
            missing.append('showers')
    acc = 1 if (o['accessible'] and ww + mw + uw > 0) else 0
    return {
        'persons': n, 'female': f, 'male': m,
        'wc_women': ww, 'wc_men': mw, 'wc_mixed': uw, 'urinals': mu,
        'washbasins': wb + mb + ub, 'washing_taps': taps, 'showers': showers, 'accessible_wc': acc,
        'positions': ww + mw + uw + mu,
        'fixtures': {'wc_cistern': ww + mw + uw + acc, 'urinal_flush': mu, 'basin': wb + mb + ub + acc + taps, 'shower': showers},
        'incomplete': missing,
    }


BASE = {'method': 'be_codex', 'simultaneity': 'low', 'uk_mode': 'separate', 'urinals': True, 'accessible': True,
        'washing': 'none', 'showers': False, 'female_pct': 50, 'asr_shared': False}


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def input_error(persons, pct):
    """METHOD.md 'Inputs per zone': N people present = a whole number 0-100 000 (range checked first), p = 0-100 %."""
    if not is_number(persons) or persons < 0 or persons > 100000:
        return 'persons_range'
    if persons != int(persons):
        return 'persons_integer'
    if not is_number(pct) or pct < 0 or pct > 100:
        return 'female_pct_invalid'
    return None


def project(zones, opts):
    o = dict(BASE, **opts)
    rows, valid, vz = [], [], []
    # establishment headcount (ASR A4.1 Nr. 4 (6) "Betriebe"): all valid zones of the project together
    est = 0
    for z in zones:
        if input_error(z['persons'], z.get('female_pct', o['female_pct'])) is None:
            est += int(z['persons'])
    o['_est'] = est
    for z in zones:
        zo = dict(o)
        for k in ('female_pct', 'simultaneity', 'washing', 'showers'):
            if k in z:
                zo[k] = z[k]
        err = input_error(z['persons'], zo['female_pct'])
        if err:
            rows.append({'status': 'invalid', 'errors': [err]})
            continue
        r = zone(int(z['persons']), zo)
        rows.append(r)
        valid.append(r)
        vz.append(z)
    tot = {k: sum(r['fixtures'][k] for r in valid) for k in ('wc_cistern', 'urinal_flush', 'basin', 'shower')}
    tot['positions'] = sum(r['positions'] for r in valid)
    tot['persons'] = sum(r['persons'] for r in valid)
    tot['accessible_wc'] = sum(r['accessible_wc'] for r in valid)
    pooled = None
    mixed_sim = o['method'] == 'de_asr' and any(z.get('simultaneity', o['simultaneity']) != o['simultaneity'] for z in vz)
    if len(valid) > 1 and tot['persons'] > 0 and not mixed_sim:
        F = sum(r['female'] for r in valid)
        pooled = zone(tot['persons'], o, female=F)['positions']
    inc = []
    for r in valid:
        for x in r['incomplete']:
            if x not in inc:
                inc.append(x)
    return {'zones': rows, 'totals': tot, 'pooled_positions': pooled, 'incomplete': inc, 'establishment_persons': est}


OWNED = ('wc_cistern', 'urinal_flush', 'basin', 'shower')


def apply_expect(zones, exp):
    # D-PLB-6: never lower or delete; count = max(existing, minimum) in zones with people; minimum kept as workplace_min
    out = []
    for z, r in zip(zones, exp['zones']):
        fx = dict(z.get('fixtures') or {})
        wm = None
        if r.get('status') != 'invalid' and r['persons'] > 0:
            wm = {}
            for k in OWNED:
                e = fx.get(k, 0)
                e = e if isinstance(e, (int, float)) and e > 0 else 0
                after = max(e, r['fixtures'][k])
                if after > 0 and after != e:
                    fx[k] = after
                wm[k] = r['fixtures'][k]
        out.append({'fixtures': fx, 'workplace_min': wm})
    return out


def case(cid, note, zones, opts, apply=False, anchor=None):
    c = {'id': cid, 'note': note, 'zones': zones, 'opts': dict(BASE, **opts), 'expect': project(zones, opts)}
    if apply:
        c['apply'] = True
        c['expect']['apply'] = apply_expect(zones, c['expect'])
    if anchor:
        # hand values from the standard text; the model must reproduce them, else the reference itself is wrong
        for zi, hand in anchor['hand'].items():
            got = c['expect']['zones'][zi]
            for k, v in hand.items():
                assert got[k] == v, (cid, zi, k, got[k], v)
        c['anchor'] = {'source': anchor['source'], 'clause': anchor['clause'], 'hand': {str(k): v for k, v in anchor['hand'].items()}}
    return c


cases = []
Z = lambda zid, n, pct=50, **kw: dict({'id': zid, 'name': zid, 'persons': n, 'female_pct': pct, 'fixtures': {}}, **kw)
# named cases: the presets' points and the published examples
cases.append(case('preset-floors-vs-pool', '8 floors x 75, Belgium: 48 places vs 41 pooled', [Z('F%d' % i, 75) for i in range(1, 9)], {}))
cases.append(case('preset-urinal-floor', '600 staff 50/50: women 20 WC, men 12 WC + 8 urinals', [Z('C1', 600)], {'accessible': False}))
cases.append(case('preset-urinal-floor-off', 'same without urinals: men 20 WC', [Z('C1', 600)], {'accessible': False, 'urinals': False}))
for m, extra in (('be_codex', {}), ('de_asr', {}), ('uk_l24', {}), ('uk_l24', {'uk_mode': 'mixed'})):
    cases.append(case('three-codes-%s%s' % (m, '-mixed' if extra else ''), '100 people 50/50', [Z('Z1', 100)], dict({'method': m, 'accessible': False}, **extra)))
cases.append(case('asr-example-assembly', 'ASR Abb. 1: 90 men high -> 3 WC + 6 urinals', [Z('A1', 90, 0, simultaneity='high')], {'method': 'de_asr', 'accessible': False}))
cases.append(case('asr-example-office-women', 'ASR Abb. 1: office 15 women -> 2 WC', [Z('O1', 15, 100)], {'method': 'de_asr', 'accessible': False}))
cases.append(case('preset-assembly-vs-office', 'ASR zones high vs low, no pooled comparison', [Z('A1', 90, 0, simultaneity='high'), Z('O1', 90, 0, simultaneity='low')], {'method': 'de_asr', 'accessible': False}))
cases.append(case('preset-split-penalty', '32 staff 16/16 -> 4 places', [Z('Z1', 32)], {'accessible': False}))
cases.append(case('split-single-sex', '32 men -> 3 places', [Z('Z1', 32, 0)], {'accessible': False}))
cases.append(case('preset-workshop', '24 men, taps 1/3 + showers 1/6', [Z('W1', 24, 0)], {'washing': 'per3', 'showers': True, 'accessible': False}))
cases.append(case('workshop-per5', '24 men, taps 1/5', [Z('W1', 24, 0)], {'washing': 'per5', 'accessible': False}))
cases.append(case('asr-beyond-250', '280 women low', [Z('Z1', 280, 100)], {'method': 'de_asr', 'accessible': False}))
cases.append(case('asr-small-men', '8 men low, urinal only recommended', [Z('Z1', 8, 0)], {'method': 'de_asr'}))
cases.append(case('l24-46-men', 'Table 2 row 46-60', [Z('Z1', 46, 0)], {'method': 'uk_l24', 'accessible': False}))
cases.append(case('l24-beyond-100', 'mixed 130 (L24 para 200)', [Z('Z1', 130)], {'method': 'uk_l24', 'uk_mode': 'mixed', 'accessible': False}))
cases.append(case('l24-men-no-urinals', '60 men Table 1', [Z('Z1', 60, 0)], {'method': 'uk_l24', 'urinals': False}))
cases.append(case('accessible-zero', 'zone without people: no accessible WC', [Z('Z1', 0), Z('Z2', 12)], {}))
cases.append(case('odd-split', '25 people 50 % -> 13 women', [Z('Z1', 25)], {}))
cases.append(case('be-boundaries', '15/16/25/26 men', [Z('a', 15, 0), Z('b', 16, 0), Z('c', 25, 0), Z('d', 26, 0)], {'accessible': False}))

# ---- run 2: external anchors (D-PLB-10). Expected values typed by hand from the cited row / example, not computed here ----
NO_ACC = {'accessible': False}
cases.append(case('anchor-asr-abb1-assembly', 'ASR A4.1 Abb. 1 reading example: 90 men, high simultaneity -> 9 places: 3 WC + 6 urinals, 3 washbasins',
                  [Z('A1', 90, 0)], dict(NO_ACC, method='de_asr', simultaneity='high'),
                  anchor={'source': 'ASR A4.1 Sanitaerraeume (2013/2022)', 'clause': 'Nr. 5.2, Tabelle 2 row 76-100 high (9 / 3) and Abb. 1 Ablesebeispiel; 5.2 (4) at least one third toilets',
                          'hand': {0: {'wc_men': 3, 'urinals': 6, 'washbasins': 3}}}))
cases.append(case('anchor-asr-abb1-office', 'ASR A4.1 Abb. 1 reading example: office, 15 women, low simultaneity -> 2 toilets, 1 washbasin',
                  [Z('O1', 15, 100)], dict(NO_ACC, method='de_asr'),
                  anchor={'source': 'ASR A4.1 Sanitaerraeume (2013/2022)', 'clause': 'Nr. 5.2, Tabelle 2 row 11-25 low (2 / 1), Abb. 1',
                          'hand': {0: {'wc_women': 2, 'washbasins': 1}}}))
cases.append(case('anchor-asr-4-6-shared-4', 'ASR A4.1 Nr. 4 (6): 4 employees, shared rooms, low -> Table 2 row 1-5: 1 toilet + 1 washbasin',
                  [Z('S1', 4, 50)], dict(NO_ACC, method='de_asr', asr_shared=True),
                  anchor={'source': 'ASR A4.1 Sanitaerraeume (2013/2022)', 'clause': 'Nr. 4 Abs. 6 (up to nine employees, time-separated use) + Tabelle 2 row 1-5 low (1 / 1)',
                          'hand': {0: {'wc_mixed': 1, 'wc_women': 0, 'wc_men': 0, 'washbasins': 1}}}))
cases.append(case('anchor-asr-4-6-shared-8-high', 'ASR A4.1 Nr. 4 (6): 8 employees, shared, high -> Table 2 row 6-10 high: 3 toilets + 1 washbasin',
                  [Z('S2', 8, 50)], dict(NO_ACC, method='de_asr', simultaneity='high', asr_shared=True),
                  anchor={'source': 'ASR A4.1 Sanitaerraeume (2013/2022)', 'clause': 'Nr. 4 Abs. 6 + Tabelle 2 row 6-10 high (3 / 1)',
                          'hand': {0: {'wc_mixed': 3, 'washbasins': 1}}}))
cases.append(case('anchor-asr-4-6-not-12', 'ASR A4.1 Nr. 4 (6) does not apply to 12 employees: separate rooms 6 women row 6-10 (1/1) + 6 men row 6-10 (1/1)',
                  [Z('S3', 12, 50)], dict(NO_ACC, method='de_asr', asr_shared=True),
                  anchor={'source': 'ASR A4.1 Sanitaerraeume (2013/2022)', 'clause': 'Nr. 4 Abs. 6 (limit nine) + Tabelle 2 row 6-10 low',
                          'hand': {0: {'wc_mixed': 0, 'wc_women': 1, 'wc_men': 1, 'washbasins': 2}}}))
cases.append(case('anchor-l24-t1-mixed-30', 'HSE L24 Table 1: 26-50 people, mixed use -> 3 WCs + 3 washbasins',
                  [Z('M1', 30, 50)], dict(NO_ACC, method='uk_l24', uk_mode='mixed'),
                  anchor={'source': 'HSE ACOP L24 (3rd ed. 2013), HSE FAQ "How many toilets should a workplace have?"', 'clause': 'Table 1 row 26-50 (3 WC, 3 washbasins)',
                          'hand': {0: {'wc_mixed': 3, 'washbasins': 3}}}))
cases.append(case('anchor-l24-t2-men-40', 'HSE L24 Table 2: 31-45 men -> 2 WCs + 2 urinals; washbasins Table 1 row 26-50 -> 3',
                  [Z('M2', 40, 0)], dict(NO_ACC, method='uk_l24'),
                  anchor={'source': 'HSE ACOP L24 (3rd ed. 2013)', 'clause': 'Table 2 row 31-45 (2 WC, 2 urinals); Table 1 row 26-50 for washbasins',
                          'hand': {0: {'wc_men': 2, 'urinals': 2, 'washbasins': 3}}}))
cases.append(case('anchor-be-codex-30w', 'Codex Book III Title 1: 1 WC per 15 women -> 30 women 2 WC; 1 washbasin per 4 WC -> 1',
                  [Z('B1', 30, 100)], dict(NO_ACC),
                  anchor={'source': 'Codex over het welzijn op het werk, Boek III Titel 1 (FOD WASO)', 'clause': 'sanitaire voorzieningen: 1 toilet per 15 vrouwen, 1 wastafel per 4 toiletten',
                          'hand': {0: {'wc_women': 2, 'washbasins': 1}}}))
cases.append(case('anchor-be-codex-45m', 'Codex: 1 place per 15 men -> 45 men 3 places, at least 1 WC per 25 men -> 2 WC + 1 urinal; basins ceil(3/4) = 1',
                  [Z('B2', 45, 0)], dict(NO_ACC),
                  anchor={'source': 'Codex over het welzijn op het werk, Boek III Titel 1 (FOD WASO)', 'clause': 'sanitaire voorzieningen: 1 toilet of urinoir per 15 mannen, ten minste 1 toilet per 25 mannen',
                          'hand': {0: {'wc_men': 2, 'urinals': 1, 'washbasins': 1}}}))

# ---- run 2: Apply to project never lowers or deletes (D-PLB-6, CR-1) ----
cases.append(case('apply-hotel-rooms-kept', 'guest rooms with 24 WC/basins and 10 staff: Apply keeps 24, stores the minimum',
                  [Z('G1', 10, 50, fixtures={'wc_cistern': 24, 'basin': 24, 'shower': 24, 'sink_kitchen': 1}), Z('K1', 0, 50, fixtures={'wc_cistern': 2})], {}, apply=True))
cases.append(case('apply-office-urinals-kept', 'office core with 3 urinals where 1 is required: kept; WC raised where short',
                  [Z('C1', 60, 50, fixtures={'wc_cistern': 1, 'urinal_flush': 3, 'basin': 2}), Z('C2', 20, 0, fixtures={})], {}, apply=True))
cases.append(case('apply-sports-showers-kept', 'changing room showers not required by the workplace rule stay',
                  [Z('S1', 12, 50, fixtures={'shower': 8, 'wc_cistern': 2, 'basin': 4})], {'method': 'de_asr'}, apply=True))

# ---- run 4 (Codex deep review Y1-3, Y1-4, Y1-5, Y1-8): hand values from the source text ----
cases.append(case('anchor-asr-4-6-establishment-2x8', 'Y1-3: one establishment, two cores of 4 women + 4 men, shared on -> 16 employees > 9: separate rooms in each core',
                  [Z('K1', 8, 50), Z('K2', 8, 50)], dict(NO_ACC, method='de_asr', asr_shared=True),
                  anchor={'source': 'ASR A4.1 Sanitaerraeume (2013/2022)', 'clause': 'Nr. 4 Abs. 6 "In Betrieben mit bis zu neun Beschaeftigten" (16 > 9) + Tabelle 2 row 1-5 low (1 / 1) per sex; 5.2 (4) men ceil(1/3) = 1 WC',
                          'hand': {0: {'wc_mixed': 0, 'wc_women': 1, 'wc_men': 1, 'urinals': 0, 'washbasins': 2}, 1: {'wc_mixed': 0, 'wc_women': 1, 'wc_men': 1, 'urinals': 0, 'washbasins': 2}}}))
cases.append(case('asr-4-6-establishment-4-5', 'Y1-3: two zones of 4 and 5 = 9 employees -> shared rooms stay (one set per zone)',
                  [Z('K1', 4, 50), Z('K2', 5, 40)], dict(NO_ACC, method='de_asr', asr_shared=True),
                  anchor={'source': 'ASR A4.1 Sanitaerraeume (2013/2022)', 'clause': 'Nr. 4 Abs. 6 (9 <= 9) + Tabelle 2 row 1-5 low (1 / 1) for all persons of the zone',
                          'hand': {0: {'wc_mixed': 1, 'washbasins': 1}, 1: {'wc_mixed': 1, 'washbasins': 1}}}))
cases.append(case('asr-4-6-establishment-invalid-not-counted', 'Y1-3: 6 valid + 12.5 invalid -> establishment 6 <= 9, shared stays',
                  [Z('K1', 6, 50), Z('K2', 12.5, 50)], dict(NO_ACC, method='de_asr', asr_shared=True, simultaneity='high')))
cases.append(case('anchor-asr-showers-incomplete', 'Y1-4: ASR, 50 women, high, showers requested -> 0 showers computed, result marked incomplete (wash rooms Nr. 6 not modelled)',
                  [Z('D1', 50, 100)], dict(method='de_asr', simultaneity='high', showers=True),
                  anchor={'source': 'ASR A4.1 Sanitaerraeume (2013/2022)', 'clause': 'Tabelle 2 row 26-50 high (6 / 2); Nr. 6 Waschraeume (Tabellen 4, 5.1, 5.2) not in the method',
                          'hand': {0: {'wc_women': 6, 'washbasins': 2, 'showers': 0, 'incomplete': ['showers']}}}))
cases.append(case('asr-washing-incomplete', 'Y1-4: ASR, two zones, project washing 1/3 + one zone showers -> incomplete washing, showers',
                  [Z('D1', 30, 0), Z('D2', 20, 50, showers=True)], dict(method='de_asr', washing='per3')))
cases.append(case('anchor-l24-201-dirty-50w', 'Y1-5: L24 para 201, 50 women doing heavily soiling work -> ceil(50/10) = 5 washbasins (Table 1 alone: 3)',
                  [Z('U1', 50, 100)], dict(NO_ACC, method='uk_l24', washing='per3'),
                  anchor={'source': 'HSE ACOP L24 (3rd ed. 2013), p. 40', 'clause': 'para 201: one washbasin per 10 people up to 50; Table 1 row 26-50 (3 WC)',
                          'hand': {0: {'wc_women': 3, 'washbasins': 5, 'washing_taps': 0, 'incomplete': []}}}))
cases.append(case('anchor-l24-201-dirty-mixed-130', 'Y1-5/Y1-8: L24 mixed, 130 dirty work -> WC 5 + ceil(30/25) = 7 (para 200), basins 5 + ceil(80/20) = 9 (para 201)',
                  [Z('U2', 130, 50)], dict(NO_ACC, method='uk_l24', uk_mode='mixed', washing='per5'),
                  anchor={'source': 'HSE ACOP L24 (3rd ed. 2013), p. 40', 'clause': 'para 200 (+1 toilet and washbasin per further 25 above 100); para 201 (+1 washbasin per further 20 above 50)',
                          'hand': {0: {'wc_mixed': 7, 'washbasins': 9}}}))
cases.append(case('l24-201-dirty-small-groups', 'Y1-5: L24 separate, 8 people 50 % dirty -> per group max(Table 1, ceil(4/10)) = 1 + 1; 6 women: max(2, 1) = 2',
                  [Z('U3', 8, 50), Z('U4', 6, 100)], dict(method='uk_l24', washing='per3')))
cases.append(case('anchor-l24-200-beyond-100', 'Y1-8: L24 para 200 increments, mixed 130 -> 5 + ceil(30/25) = 7 WC and 7 washbasins',
                  [Z('U5', 130, 50)], dict(NO_ACC, method='uk_l24', uk_mode='mixed'),
                  anchor={'source': 'HSE ACOP L24 (3rd ed. 2013), p. 40', 'clause': 'para 200: an additional toilet and washbasin for every 25 people above 100 (or fraction of 25)',
                          'hand': {0: {'wc_mixed': 7, 'washbasins': 7}}}))
cases.append(case('anchor-l24-200-men-160', 'Y1-8: L24 para 200 men only, 160 men -> 4 + ceil(60/50) = 6 cubicles and 6 urinals; washbasins 5 + ceil(60/25) = 8',
                  [Z('U6', 160, 0)], dict(NO_ACC, method='uk_l24'),
                  anchor={'source': 'HSE ACOP L24 (3rd ed. 2013), p. 40', 'clause': 'para 200: men only +1 cubicle per further 50 above 100 with at least an equal number of additional urinals; +1 washbasin per further 25',
                          'hand': {0: {'wc_men': 6, 'urinals': 6, 'washbasins': 8}}}))
cases.append(case('l24-showers-incomplete', 'Y1-4/5: L24 has no shower numbers -> showers requested = incomplete; Belgium zone-level showers unaffected',
                  [Z('U7', 40, 50)], dict(method='uk_l24', showers=True)))

# seeded random projects over all methods and options
rng = random.Random(20261105)
for i in range(40):
    method = rng.choice(['be_codex', 'de_asr', 'uk_l24'])
    opts = {'method': method, 'urinals': rng.random() < 0.8, 'accessible': rng.random() < 0.6,
            'simultaneity': rng.choice(['low', 'high']), 'uk_mode': rng.choice(['separate', 'mixed']),
            'washing': rng.choice(['none', 'none', 'per3', 'per5']), 'showers': rng.random() < 0.3}
    zones = []
    for j in range(rng.randint(1, 4)):
        n = rng.choice([0, rng.randint(1, 30), rng.randint(1, 120), rng.randint(100, 400)])
        z = Z('R%d' % (j + 1), n, rng.choice([0, 20, 35, 50, 50, 65, 100]))
        if method == 'de_asr' and rng.random() < 0.25:
            z['simultaneity'] = rng.choice(['low', 'high'])
        if method == 'be_codex' and rng.random() < 0.2:
            z['washing'] = rng.choice(['none', 'per3', 'per5'])
        zones.append(z)
    cases.append(case('random-%02d' % (i + 1), 'seeded random project', zones, opts))

# ---- run 3 (X1-3): a headcount must be a whole number; invalid zones are listed and not counted ----
cases.append(case('x13-fraction-small', 'Codex review X1-3: 0.4 persons is not rounded to 0 -> invalid persons_integer', [Z('Q1', 0.4)], {'accessible': False}))
cases.append(case('x13-fraction-with-valid', '12.5 persons beside a valid zone of 30: only the 30 are counted, no pooled comparison',
                  [Z('Q1', 12.5), Z('Q2', 30)], {}))
cases.append(case('x13-fraction-de', 'ASR: 7.5 persons invalid; 20 women counted', [Z('Q1', 7.5, 0, simultaneity='high'), Z('Q2', 20, 100)], {'method': 'de_asr'}))
cases.append(case('x13-range-first', '100000.5 is outside the range -> persons_range; -3 -> persons_range; 46 men valid',
                  [Z('Q1', 100000.5), Z('Q2', -3), Z('Q3', 46, 0)], {'method': 'uk_l24', 'accessible': False}))
cases.append(case('x13-pct-invalid', 'share of women 120 % -> female_pct_invalid; 60 counted', [Z('Q1', 10, 120), Z('Q2', 60)], {}))

OUT.write_text(json.dumps(cases, indent=1), encoding='utf-8')
print('plbfixtures reference: %d cases -> %s' % (len(cases), OUT))
