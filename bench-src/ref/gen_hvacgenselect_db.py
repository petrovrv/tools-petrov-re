#!/usr/bin/env python3
"""gen_hvacgenselect_db.py - independent reference for the product-series layer of the HVAC shortlist model.

Stdlib only, deterministic. Reads the site's hvac-series.json (data contract PLAN section 1 field names, *_c temperatures)
and the generic layer from gen_hvacgenselect.py. Writes hvacgenselect_db_ref.json next to this script.
"""
import json, math, os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import gen_hvacgenselect as G

ATEX_12 = ('1', '2', '21', '22')
ATEX_0 = ('0', '20')
RELIAB_HI = ('critical', 'life')


def _g(o, k, d=None):
    if isinstance(o, dict):
        return o.get(k, d)
    return getattr(o, k, d)


def _need(st):
    return st.get('need')


def _policy(st):
    return st.get('refrigerant_policy', st.get('policy'))


def load_db(path=None):
    path = path or os.path.join(os.path.dirname(os.path.dirname(G._HERE)), 'hvac-series.json')
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def refrig_of(s):
    ref = s.get('refrigerant')
    if not isinstance(ref, str):
        return None
    name = ''.join(ref.split('/')[0].replace('-', '').split())
    if not name:
        return None
    if name in G.REFRIGERANTS:
        return G.REFRIGERANTS[name]
    if name.upper() in G.REFRIGERANTS:
        return G.REFRIGERANTS[name.upper()]
    return None


def series_matches(s, cfg, st):
    fam = s.get('family')
    if fam not in (_g(G.TECH[cfg], 'families') or []):
        return ['FAMILY']
    codes = []

    def add(c):
        if c not in codes:
            codes.append(c)
    need = _need(st)
    heat = need != 'cool'
    cool = need in ('cool', 'both')
    notes = s.get('notes')
    if isinstance(notes, str) and 'discontinued' in notes.lower():
        add('DISCONTINUED')
    if _policy(st) == 'natural' and fam != 'boiler_gas':
        r = refrig_of(s)
        if r is None or _g(r, 'natural') is not True:
            add('REFRIG_POLICY')
    tfm, tfh = s.get('t_flow_max_c'), st.get('t_flow_heat')
    if heat and fam in ('hp_aw', 'vrf') and tfm is not None and tfh is not None and tfm < tfh:
        add('T_FLOW')
    if heat and cfg == 'hp_cascade_ht' and (tfm is None or tfm < max(60, tfh if tfh is not None else 60)):
        add('T_FLOW')
    tmin, twin = s.get('t_amb_min_c'), st.get('t_win')
    if fam in ('hp_aw', 'vrf') and heat and tmin is not None and twin is not None and tmin > twin:
        add('T_AMB_LOW')
    tmax, tsum = s.get('t_amb_max_c'), st.get('t_sum')
    if cool and fam in ('chiller_ac', 'vrf', 'hp_aw') and tmax is not None and tsum is not None and tmax < tsum:
        add('T_AMB_HIGH')
    if cfg == 'vrf_3p_hr' and s.get('heat_recovery') is not True:
        add('NO_HR')
    mpl, pipe = s.get('max_pipe_length_m'), st.get('pipe_m')
    if fam == 'vrf' and mpl is not None and pipe is not None and pipe > mpl:
        add('PIPE_LENGTH')
    if st.get('atex_equipment_in_zone') and str(st.get('atex_zone')) in ATEX_12 and not s.get('atex'):
        add('ATEX_IN_ZONE')
    cap = s.get('capacity_kw')
    if cap:
        if fam != 'vrf' and heat and cap.get('heat_max') is None and cap.get('cool_max') is None:
            add('NO_CAPACITY')
        if fam == 'chiller_ac' and cap.get('cool_max') is None:
            add('NO_CAPACITY')
    return codes


def hard_filters_db(st, db):
    series = db.get('series') or []
    feasible, excluded, handoff = [], {}, None
    need = _need(st)
    vent = need == 'vent'
    zone = str(st.get('atex_zone'))
    in_zone = bool(st.get('atex_equipment_in_zone'))
    sources = st.get('sources') or []
    for cfg in G.CONFIG_IDS:
        t = G.TECH[cfg]
        fams = G.families(cfg, st)
        codes = []

        def add(c):
            if c not in codes:
                codes.append(c)
        if vent:
            add('VENT_HANDOFF')
            handoff = 'luchtgroepselector'
        if in_zone and zone in ATEX_0:
            add('ATEX_ZONE0')
            add('ATEX_IN_ZONE')
        elif in_zone and zone in ATEX_12:
            cert = bool(fams) and all(
                any(s.get('family') == f and s.get('atex') and series_matches(s, cfg, st) == [] for s in series)
                for f in fams)
            if not cert:
                add('ATEX_IN_ZONE')
        if _policy(st) == 'natural' and 'vrf' in fams:
            add('REFRIG_POLICY')
        sim = bool(st.get('simultaneous'))
        if cfg in ('hp_mono', 'hp_cascade_ht', 'boiler_cascade'):
            if need != 'heat':
                add('NEED')
        elif cfg == 'rev_hp':
            if need != 'both':
                add('NEED')
            elif sim:
                add('SIMULTANEOUS')
        elif cfg in ('multifunction_4p', 'vrf_3p_hr'):
            if need != 'both':
                add('NEED')
            elif not sim:
                add('NOT_SIMULTANEOUS')
        elif cfg == 'vrf_2p':
            if need == 'both' and sim:
                add('SIMULTANEOUS')
        elif cfg in ('chiller_boiler', 'dh_chiller'):
            if need not in ('cool', 'both'):
                add('NEED')
        elif cfg == 'hybrid_hp_boiler':
            if need == 'cool':
                add('NEED')
        if 'boiler_gas' in fams:
            if st.get('gas_ban'):
                add('GAS_BAN')
            elif not st.get('gas_available'):
                add('GAS_UNAVAILABLE')
        if cfg == 'dh_chiller' and 'district' not in sources:
            add('NO_DISTRICT')
        tfh = st.get('t_flow_heat')
        if need != 'cool' and _g(t, 'heat') and tfh is not None:
            tmax = _g(t, 't_flow_max')
            if tmax is not None and tfh > tmax:
                add('T_FLOW')
            if cfg == 'hp_cascade_ht' and tfh < 60:
                add('T_FLOW')
        if 'vrf' in fams:
            if st.get('reliability') in RELIAB_HI:
                add('RELIABILITY')
            if not series and st.get('pipe_m') is not None and st.get('pipe_m') > 165:
                add('PIPE_LENGTH')
            _, ok = G.vrf_max_sys_kw(cfg, st)
            if not ok:
                add('EN378_ROOM')
        kwa = st.get('kw_avail')
        if kwa is not None:
            uses = 'hp_aw' in fams or 'vrf' in fams
            lk, lc = st.get('load_kw') or 0, st.get('load_cool_kw') or 0
            seer = _g(t, 'seer')
            hp = lk / ((_g(t, 'scop35') or 3) * 0.6) if need != 'cool' and uses else 0
            cp = lc / (seer * 0.55) if need != 'heat' and seer else 0
            boiler_only = bool(fams) and all(f == 'boiler_gas' for f in fams)
            if max(hp, cp) + (0.01 * lk if boiler_only else 0) > kwa:
                add('ELECTRICAL')
        series_ok = []
        for f in fams:
            passing, fails = [], []
            for s in series:
                if s.get('family') != f:
                    continue
                m = series_matches(s, cfg, st)
                if not m:
                    passing.append(s.get('id'))
                else:
                    fails += [c for c in m if c != 'FAMILY' and c not in fails]
            if not passing:
                add('NO_SERIES')
                for c in fails:
                    add(c)
            else:
                series_ok += [i for i in passing if i not in series_ok]
        if codes:
            excluded[cfg] = codes
        else:
            feasible.append((cfg, series_ok))
    return feasible, excluded, handoff


def score_all_db(st, feasible, db):
    if not feasible:
        return []
    ms = {cfg: G.metrics(cfg, st) for cfg, _ in feasible}
    hi, lo = ('eff',), ('capex_eur', 'co2_t20', 'foot_m2', 'maint')
    keys = {'eff': 'eff', 'capex_eur': 'capex', 'co2_t20': 'co2', 'foot_m2': 'foot', 'maint': 'maint'}
    rng = {k: (min(m[k] for m in ms.values()), max(m[k] for m in ms.values())) for k in hi + lo}
    w = G.WEIGHTS.get(st.get('priority') or 'lcc', G.WEIGHTS['lcc'])
    by_id = {s.get('id'): s for s in db.get('series') or []}
    env, out = st.get('environment'), []
    for cfg, sok in feasible:
        m, crit = ms[cfg], {}
        for k in hi + lo:
            mn, mx = rng[k]
            v = m[k]
            if mx == mn:
                crit[keys[k]] = 1.0
            else:
                crit[keys[k]] = (v - mn) / (mx - mn) if k in hi else (mx - v) / (mx - mn)
        mg = m.get('noise_margin_db')
        crit['noise'] = 1.0 if mg is None else G._clamp(mg, 0, 10) / 10
        base = sum(w.get(k, 0) * crit[k] for k in ('eff', 'capex', 'co2', 'noise', 'foot', 'maint'))
        ser = [by_id[i] for i in sok if i in by_id]

        def any_opt(n):
            return any((s.get('options') or {}).get(n) is True for s in ser)
        pen, codes = 0.0, []
        if _policy(st) == 'low_gwp' and m.get('gwp') is not None and m['gwp'] > _g(G.CONST, 'gwp_low'):
            codes.append('GWP_HIGH'); pen -= 0.15
        if ser and env in ('coastal', 'industrial') and not any_opt('coil_coating'):
            codes.append('NO_COATING'); pen -= 0.10
        if ser and env == 'desert' and not any_opt('high_ambient'):
            codes.append('NO_HIGH_AMBIENT'); pen -= 0.15
        if mg is not None and mg < 0 and not any_opt('low_noise'):
            codes.append('NOISE'); pen -= 0.20
        if st.get('reliability') in RELIAB_HI:
            single = all(s.get('circuits_min') == 1 for s in ser) if ser else _g(G.TECH[cfg], 'compressors') == 1
            if single:
                codes.append('SINGLE_CIRCUIT'); pen -= 0.20
        out.append({'id': cfg, 'score': G.rnd(base + pen, 4), 'base': G.rnd(base, 4),
                    'criteria': {k: G.rnd(v, 4) for k, v in crit.items()},
                    'penalties': codes, 'series_ok': list(sok)})
    out.sort(key=lambda e: (-e['score'], G.CONFIG_IDS.index(e['id'])))
    return out


import re

_RANGE = re.compile(r'(\d+(?:[.,]\d+)?)\s*-\s*100\s*%')
_RATIO = re.compile(r'(?<![\w-])(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)')
_PCT = re.compile(r'(\d+(?:[.,]\d+)?)\s*%?')


def parse_turndown(txt):
    """Minimum modulation as a fraction of full capacity.

    A modulation range 'x-100 %' wins ('5:1 (18-100 %)' -> 0.18); else a ratio 'a:b' in either order
    ('5:1', '1:17') means min(a,b)/max(a,b); otherwise the first number is a percentage."""
    if txt is None:
        return None
    s = str(txt)
    m = _RANGE.search(s)
    if m:
        return G._clamp(float(m.group(1).replace(',', '.')) / 100.0, 0.0, 1.0)
    m = _RATIO.search(s)
    if m:
        a, b = (float(x.replace(',', '.')) for x in m.groups())
        if a > 0 and b > 0:
            return G._clamp(min(a, b) / max(a, b), 0.0, 1.0)
    m = _PCT.search(s)
    if not m:
        return None
    v = float(m.group(1).replace(',', '.'))
    return G._clamp(v / 100.0, 0.0, 1.0)


def size_units(cfg, fam, st, unit_heat, unit_cool, max_sys_kw, inverter, turndown, circuits_min):
    warnings = []
    need = st.get('need')
    H = (st.get('load_kw') or 0) if need != 'cool' else 0
    C = (st.get('load_cool_kw') or st.get('load_kw') or 0) if need != 'heat' else 0
    if fam == 'boiler_gas':
        role, duty, mode = 'boiler', H, 'heat'
    elif fam == 'chiller_ac':
        role, duty, mode = 'chiller', C, 'cool'
    elif fam == 'hp_aw':
        if cfg == 'hybrid_hp_boiler':
            role, duty, mode = 'heat', 0.5 * H, 'heat'
        elif cfg in ('rev_hp', 'multifunction_4p') and need == 'both':
            role, duty, mode = 'both', max(H, C), 'both'
        else:
            role, duty, mode = 'heat', H, 'heat'
    elif fam == 'vrf':
        if need == 'both':
            role, duty, mode = 'both', max(H, C), 'both'
        elif need == 'cool':
            role, duty, mode = 'cool', C, 'cool'
        else:
            role, duty, mode = 'heat', H, 'heat'
    else:
        role, duty, mode = 'heat', H, 'heat'

    h_duty = H if mode == 'both' else (duty if mode == 'heat' else 0)
    c_duty = C if mode == 'both' else (duty if mode == 'cool' else 0)
    need_heat = mode in ('heat', 'both')
    need_cool = mode in ('cool', 'both')
    generic = G.GENERIC_UNIT_KW.get(fam, 100)
    uh, uc = unit_heat, unit_cool
    no_data = False
    if need_heat and (uh is None or uh <= 0):
        uh, no_data = generic, True
    if need_cool and (uc is None or uc <= 0):
        uc, no_data = generic, True
    if no_data:
        warnings.append('NO_CAPACITY_DATA')
    if fam == 'vrf' and max_sys_kw is not None and max_sys_kw > 0:
        if need_heat:
            uh = min(uh, max_sys_kw)
        if need_cool:
            uc = min(uc, max_sys_kw)

    nH = int(math.ceil(h_duty / uh)) if need_heat else 0
    nC = int(math.ceil(c_duty / uc)) if need_cool else 0
    n_base = max(1, nH, nC)
    if mode == 'heat':
        unit_cap = uh
    elif mode == 'cool':
        unit_cap = uc
    else:
        unit_cap = uh if nH >= nC else uc

    rel = st.get('reliability') or 'standard'
    red = st.get('redundancy') or 'N'
    if rel in ('critical', 'life') and red == 'N':
        red = 'N+1'
    if red == '2N':
        units = 2 * n_base
    elif red == 'N+1':
        units = n_base + 1
    else:
        units = n_base
    if rel in ('critical', 'life'):
        units = max(units, 2)
    if rel == 'life' and red != '2N':
        share = G._clamp(st.get('critical_share') or 0, 0, 1)
        units = max(units, n_base + int(math.ceil(n_base * share)))

    boiler = fam == 'boiler_gas'
    circuits_required = None if boiler else {'standard': 1, 'business': 2,
                                             'critical': 2, 'life': 2}.get(rel, 1)
    dual_power = rel == 'life'
    if boiler:
        compressors = 0
    elif circuits_min:
        compressors = max(circuits_min, circuits_required or 1)
    else:
        compressors = circuits_required or 1

    pls = G._clamp(st.get('part_load_share') or 0, 0, 1)
    min_load = pls * duty
    if inverter is True or boiler:
        td = turndown
        if td is None:
            td = 0.2 if boiler else 0.3
            warnings.append('TURNDOWN_ASSUMED')
        unit_min = unit_cap * td
    else:
        unit_min = unit_cap / max(1, compressors)
    ok = True if duty <= 0 else unit_min <= min_load
    if not ok:
        warnings.append('BUFFER_TANK')

    return {'duty_kw': duty, 'role': role, 'mode': mode, 'unit_cap_kw': unit_cap,
            'n_base': n_base, 'units': units, 'redundancy': red,
            'circuits_required': circuits_required, 'dual_power': dual_power,
            'compressors': compressors,
            'part_load': {'min_load_kw': G.rnd(min_load, 2),
                          'unit_min_kw': G.rnd(unit_min, 2), 'ok': ok},
            'warnings': warnings}


# Regulation (EU) 2024/573 Annex IV (OJ L 2024/573), transcribed independently from the Official Journal text:
# (family, point, min GWP (0 = any fluorinated gas), capacity band lower bound exclusive, upper bound inclusive, year from 1 Jan)
ANNEX_IV = [
    ('chiller_ac', '7(a)', 2500, None, None, 2020), ('chiller_ac', '7(b)', 150, None, 12, 2027),
    ('chiller_ac', '7(c)', 0, None, 12, 2032), ('chiller_ac', '7(d)', 750, 12, None, 2027),
    ('hp_aw', '8(b)', 150, None, 12, 2027), ('hp_aw', '8(c)', 0, None, 12, 2032),
    ('hp_aw', '8(d)', 150, 12, 50, 2027), ('hp_aw', '8(e)', 150, 50, None, 2030),
    ('vrf', '9(c)', 150, None, 12, 2029), ('vrf', '9(d)', 0, None, 12, 2035),
    ('vrf', '9(e)', 750, 12, None, 2029), ('vrf', '9(f)', 150, 12, None, 2033),
]


def first_ban_year(fam, ref, gwp_fallback, unit_kw):
    r = refrig_of({'refrigerant': ref})
    if r is not None and _g(r, 'natural') is True:
        return None
    gwp = _g(r, 'gwp') if r is not None and _g(r, 'gwp') is not None else gwp_fallback
    if gwp is None:
        return None
    years = [y for (f, _pt, lim, lo, hi, y) in ANNEX_IV
             if f == fam and gwp >= lim and (lo is None or unit_kw > lo) and (hi is None or unit_kw <= hi)]
    return min(years) if years else None


def fgas_warning(s, fam, unit_kw, st):
    year = st.get('delivery_year') or 2027
    y = first_ban_year(fam, s.get('refrigerant'), s.get('gwp'), unit_kw)
    if y is None or y > year:
        return None
    for a in s.get('refrigerant_alt') or []:
        ya = first_ban_year(fam, a.get('refrigerant'), a.get('gwp'), unit_kw)
        if ya is None or ya > year:
            return 'FGAS_ALT'
    return 'FGAS_BAN'


def series_for(cfg, series_ok, st, db):
    fams = G.families(cfg, st)
    vrf_max = G.vrf_max_sys_kw(cfg, st)[0] if 'vrf' in fams else None
    ok_ids = set(series_ok or [])
    out = []
    for f in fams:
        entries = []
        for s in db.get('series', []):
            if s.get('family') != f or s.get('id') not in ok_ids:
                continue
            if series_matches(s, cfg, st) != []:
                continue
            cap = s.get('capacity_kw') or {}
            cm = s.get('circuits_min')
            sz = size_units(cfg, f, st, cap.get('heat_max'), cap.get('cool_max'),
                            vrf_max if f == 'vrf' else None, s.get('inverter'),
                            parse_turndown(s.get('turndown')), cm)
            warns = list(sz['warnings'])
            if (cm is not None and sz['circuits_required']
                    and cm < sz['circuits_required'] and not sz['units'] >= 2):
                warns.append('CIRCUITS')
            fw = fgas_warning(s, f, sz['unit_cap_kw'], st)
            if fw:
                warns.append(fw)
            entries.append({
                'family': f, 'series_id': s.get('id'), 'units': sz['units'],
                'n_base': sz['n_base'], 'unit_cap_kw': sz['unit_cap_kw'],
                'circuits': sz['circuits_required'], 'compressors': sz['compressors'],
                'redundancy': sz['redundancy'], 'dual_power': sz['dual_power'],
                'part_load_ok': sz['part_load']['ok'],
                'min_load_kw': sz['part_load']['min_load_kw'],
                'unit_min_kw': sz['part_load']['unit_min_kw'],
                'warnings': warns,
                '_name': (s.get('manufacturer') or '') + ' ' + (s.get('series') or '')})
        entries.sort(key=lambda e: (len(e['warnings']), e['units'],
                                    e['_name'].casefold(), e['series_id']))
        for e in entries:
            e.pop('_name', None)
        out.extend(entries)
    return out


def solve_db(case, db):
    st = G.build_state(case.get('preset'), case.get('city'), case.get('set') or {})
    feasible, excluded, handoff = hard_filters_db(st, db)
    ranked = score_all_db(st, feasible, db)
    top = ranked[0] if ranked else None
    if not ranked:
        gap = 0
    elif len(ranked) == 1:
        gap = 1
    else:
        gap = G.rnd(ranked[0]['score'] - ranked[1]['score'], 4)
    return {
        'feasible': [c for c, _ in feasible],
        'series_ok': {c: ids for c, ids in feasible},
        'excluded': {c: sorted(codes) for c, codes in excluded.items()},
        'handoff': handoff,
        'top': top['id'] if top else None,
        'gap': gap,
        'ranking': [r['id'] for r in ranked],
        'scores': {r['id']: r['score'] for r in ranked},
        'base': {r['id']: r['base'] for r in ranked},
        'criteria': {r['id']: r['criteria'] for r in ranked},
        'penalties': {r['id']: r['penalties'] for r in ranked},
        'series': series_for(top['id'], top['series_ok'], st, db) if top else [],
    }


CASES_DB = list(G.CASES) + [
    {'id': 'db_coastal_office', 'preset': 'office', 'city': None,
     'set': {'environment': 'coastal'}, 'note': 'Coastal corrosion filter'},
    {'id': 'db_desert_madrid', 'preset': 'office', 'city': 'madrid',
     'set': {'environment': 'desert'}, 'note': 'Desert/high ambient filter'},
    {'id': 'db_vrf_pipe_190', 'preset': 'office', 'city': None,
     'set': {'pipe_m': 190, 'priority': 'compact'}, 'note': 'VRF long piping'},
    {'id': 'db_atex2', 'preset': 'warehouse', 'city': None,
     'set': {'atex_zone': '2', 'atex_equipment_in_zone': True}, 'note': 'ATEX zone 2'},
    {'id': 'db_cascade_90', 'preset': 'school', 'city': None,
     'set': {'t_flow_heat': 90, 'gas_ban': True}, 'note': 'High-temp 90 C, no gas'},
    {'id': 'db_natural_heat', 'preset': 'warehouse', 'city': None,
     'set': {'refrigerant_policy': 'natural', 'gas_ban': True},
     'note': 'Natural refrigerants, no gas'},
    {'id': 'db_helsinki_hp', 'preset': 'school', 'city': 'helsinki',
     'set': {'gas_ban': True}, 'note': 'Cold climate HP'},
    {'id': 'db_noise_lownoise', 'preset': 'office', 'city': None,
     'set': {'noise_limit_dba': 40, 'noise_dist_m': 15}, 'note': 'Low noise limit'},
    {'id': 'db_fgas_2030_hp', 'preset': 'school', 'city': None,
     'set': {'gas_ban': True, 'delivery_year': 2030}, 'note': 'F-gas Annex IV 8(e): R32 monoblock HP > 50 kW delivered 2030'},
    {'id': 'db_fgas_2026_hp', 'preset': 'school', 'city': None,
     'set': {'gas_ban': True, 'delivery_year': 2026}, 'note': 'F-gas: delivery 2026, before the 2027 bans'},
    {'id': 'db_fgas_vrf_2029', 'preset': 'office', 'city': None,
     'set': {'pipe_m': 190, 'priority': 'compact', 'delivery_year': 2029}, 'note': 'F-gas Annex IV 9(e): R410A VRF > 12 kW delivered 2029'},
    {'id': 'db_fgas_chiller_alt', 'preset': 'data_center', 'city': None,
     'set': {'delivery_year': 2027}, 'note': 'F-gas 7(d): R134a chillers with listed low-GWP variants'},
]


def main():
    db = load_db()
    cases = []
    for c in CASES_DB:
        cases.append({'id': c['id'], 'preset': c.get('preset'), 'city': c.get('city'),
                      'set': c.get('set') or {}, 'note': c.get('note'),
                      'ref': solve_db(c, db)})
    out = {'data_version': db.get('version'), 'data_date': db.get('data_date'),
           'cases': cases}
    path = os.path.join(G._HERE, 'hvacgenselect_db_ref.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1, allow_nan=False)
    print('%d cases written to %s' % (len(cases), path))


if __name__ == '__main__':
    main()
