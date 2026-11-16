#!/usr/bin/env python3
"""gen_hvacgenselect.py - independent reference for the HVAC generator-shortlist model.

Stdlib only, deterministic. Part 1: model loading, state construction, families, VRF EN378 limit, hard filters.
Writes hvacgenselect_ref.json next to this script.
"""
import copy
import json
import math
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_HERE, "hvacgenselect_model.json"), "r", encoding="utf-8") as _f:
    M = json.load(_f)

CONFIG_IDS = M["CONFIG_IDS"]
TECH = M["TECH"]
CLIMATE = M["CLIMATE"]
REFRIGERANTS = M["REFRIGERANTS"]
WEIGHTS = M["WEIGHTS"]
CONST = M["CONST"]
PRESETS = M["PRESETS"]
DEFAULT_STATE = M["DEFAULT_STATE"]
GENERIC_UNIT_KW = M["GENERIC_UNIT_KW"]

VRF_CONFIGS = ("vrf_2p", "vrf_3p_hr")


def _gt(a, b):
    """None-safe a > b (False if either is None)."""
    return a is not None and b is not None and a > b


def _lt(a, b):
    """None-safe a < b (False if either is None)."""
    return a is not None and b is not None and a < b


def _apply_climate(st, city):
    c = CLIMATE[city]
    st["city"] = city
    st["t_win"] = c["t_win"]
    st["t_sum"] = c["t_sum"]
    st["grid"] = c["grid"]


def build_state(preset, city=None, overrides=None):
    st = copy.deepcopy(DEFAULT_STATE)
    p = PRESETS.get(preset)
    if p is None:
        preset = "office"
        p = PRESETS.get(preset, {})
    for k, v in p.items():
        if k == "aha":
            continue
        st[k] = copy.deepcopy(v)
    st["preset"] = preset
    if city in CLIMATE:
        c = city
    elif p.get("city") in CLIMATE:
        c = p.get("city")
    else:
        c = "brussels"
    _apply_climate(st, c)
    for k, v in (overrides or {}).items():
        st[k] = copy.deepcopy(v)
        if k == "city" and v in CLIMATE:
            _apply_climate(st, v)
    return st


def families(cfg, st):
    fams = list(TECH[cfg].get("families") or [])
    if cfg == "chiller_boiler" and st.get("need") == "cool":
        fams = [f for f in fams if f != "boiler_gas"]
    return fams


def vrf_max_sys_kw(cfg, st):
    t = TECH[cfg]
    ref = REFRIGERANTS.get(t.get("refrigerant"), {})
    pl_fac = CONST["pl_factor"]
    occ = st.get("occupancy")
    fac = pl_fac.get(occ, pl_fac["general"])
    pl = (ref.get("pl") or 0) * fac
    sys_max = CONST["vrf_sys_max_kw"]
    room = st.get("smallest_room_m3")
    if room is None:
        mx = sys_max
    else:
        allowed_kg = pl * room
        pipe = st.get("pipe_m") or 0
        ckw = t.get("charge_kg_kw") or 0
        if ckw <= 0:
            by_room = sys_max
        else:
            by_room = (allowed_kg - CONST["vrf_charge_extra_kg_m"] * pipe) / ckw
        mx = min(sys_max, by_room)
    return mx, mx >= CONST["vrf_sys_min_kw"]


def hard_filters(st):
    feasible, excluded, handoff = [], {}, None
    need = st.get("need")
    simul = bool(st.get("simultaneous"))
    t_flow = st.get("t_flow_heat")
    sources = st.get("sources") or []
    for cfg in CONFIG_IDS:
        t = TECH[cfg]
        fams = families(cfg, st)
        codes = []

        def add(code):
            if code not in codes:
                codes.append(code)

        if need == "vent":
            add("VENT_HANDOFF")
            handoff = "luchtgroepselector"
        zone = st.get("atex_zone")
        if st.get("atex_equipment_in_zone") and zone is not None:
            z = str(zone)
            if z in ("0", "20"):
                add("ATEX_ZONE0")
                add("ATEX_IN_ZONE")
            elif z in ("1", "21", "2", "22"):
                add("ATEX_IN_ZONE")
        if st.get("refrigerant_policy") == "natural":
            if cfg in VRF_CONFIGS:
                add("REFRIG_POLICY")
            elif any(f != "boiler_gas" for f in fams):
                ref = REFRIGERANTS.get(t.get("refrigerant")) if t.get("refrigerant") else None
                if not ref or not ref.get("natural"):
                    add("REFRIG_POLICY")
        if cfg in ("hp_mono", "hp_cascade_ht", "boiler_cascade"):
            if need != "heat":
                add("NEED")
        elif cfg == "rev_hp":
            if need != "both":
                add("NEED")
            elif simul:
                add("SIMULTANEOUS")
        elif cfg in ("multifunction_4p", "vrf_3p_hr"):
            if need != "both":
                add("NEED")
            elif not simul:
                add("NOT_SIMULTANEOUS")
        elif cfg == "vrf_2p":
            if need == "both" and simul:
                add("SIMULTANEOUS")
        elif cfg in ("chiller_boiler", "dh_chiller"):
            if need not in ("cool", "both"):
                add("NEED")
        elif cfg == "hybrid_hp_boiler":
            if need == "cool":
                add("NEED")
        if "boiler_gas" in fams:
            if st.get("gas_ban"):
                add("GAS_BAN")
            elif not st.get("gas_available"):
                add("GAS_UNAVAILABLE")
        if cfg == "dh_chiller" and "district" not in sources:
            add("NO_DISTRICT")
        if need != "cool" and t.get("heat") and t_flow is not None:
            if _gt(t_flow, t.get("t_flow_max")):
                add("T_FLOW")
            if cfg == "hp_cascade_ht" and t_flow < 60:
                add("T_FLOW")
        uses_hp_or_vrf = "hp_aw" in fams or "vrf" in fams
        if uses_hp_or_vrf and need != "cool" and _lt(st.get("t_win"), t.get("t_amb_min")):
            add("T_AMB_LOW")
        has_cooling = ("chiller_ac" in fams or "vrf" in fams
                       or ("hp_aw" in fams and bool(t.get("cool"))))
        if need in ("cool", "both") and has_cooling and _gt(st.get("t_sum"), t.get("t_amb_max")):
            add("T_AMB_HIGH")
        if cfg in VRF_CONFIGS:
            if st.get("reliability") in ("critical", "life"):
                add("RELIABILITY")
            if _gt(st.get("pipe_m"), 165):
                add("PIPE_LENGTH")
            if not vrf_max_sys_kw(cfg, st)[1]:
                add("EN378_ROOM")
        kw_avail = st.get("kw_avail")
        if kw_avail is not None:
            H = st.get("load_kw") or 0
            C = st.get("load_cool_kw") or 0
            heat_part = H / ((t.get("scop35") or 3) * 0.6) if need != "cool" and uses_hp_or_vrf else 0
            seer = t.get("seer")
            cool_part = C / (seer * 0.55) if need != "heat" and seer else 0
            boiler_only = bool(fams) and all(f == "boiler_gas" for f in fams)
            inp = max(heat_part, cool_part) + (0.01 * H if boiler_only else 0)
            if inp > kw_avail:
                add("ELECTRICAL")
        if codes:
            excluded[cfg] = codes
        else:
            feasible.append(cfg)
    return feasible, excluded, handoff


def _g(o, k, d=None):
    v = o.get(k) if isinstance(o, dict) else getattr(o, k, None)
    return d if v is None else v


def _p(st, k, d=None):
    v = _g(st, k)
    if v is None:
        v = _g(CONST, k)
    return d if v is None else v


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def metrics(cfg, st):
    t = TECH[cfg]
    need = _g(st, 'need')
    H = (_g(st, 'load_kw') or 0) if need != 'cool' else 0
    C = (_g(st, 'load_cool_kw') or _g(st, 'load_kw') or 0) if need != 'heat' else 0
    kw_main = C if need == 'cool' else (H if need == 'heat' else max(H, C))
    heat_kwh = H * _p(st, 'eflh_heat', 0)
    cool_kwh = C * _p(st, 'eflh_cool', 0)
    s35 = _g(t, 'scop35')
    scop = None
    if s35 is not None:
        tf = _g(st, 't_flow_heat', 35)
        s55 = _g(t, 'scop55')
        if s55 is None:
            s55 = 0.75 * s35
        if tf <= 55:
            scop = s35 + (s55 - s35) * _clamp((tf - 35) / 20.0, 0, 1)
        else:
            scop = max(1.5, s55 * (1 - 0.03 * (tf - 55)))
    elec = gas = dh = 0.0
    if heat_kwh > 0:
        if _g(t, 'dh'):
            dh = heat_kwh
        else:
            bs = _clamp(_g(t, 'boiler_share', 0), 0, 1)
            if scop is None and bs < 1:
                bs = 1
            eta = _g(t, 'eta_boiler')
            eta = eta if eta is not None and eta > 0 else 0.9
            if bs > 0:
                gas = heat_kwh * bs / eta
            if bs < 1:
                elec += heat_kwh * (1 - bs) / scop
    if cool_kwh > 0:
        seer = _g(t, 'seer')
        elec += cool_kwh / seer if seer is not None and seer > 0 else cool_kwh / 3
    hr = _g(t, 'hr_bonus', 0)
    if hr > 0 and _g(st, 'simultaneous'):
        f = 1 - hr * min(heat_kwh, cool_kwh) / max(1, heat_kwh + cool_kwh) * 2
        elec *= max(0.5, f)
    primary = 2.1 * elec + 1.1 * gas + 1.3 * dh
    eff = (heat_kwh + cool_kwh) / max(1, primary)
    ck = _g(t, 'capex_eur_kw', 0)
    if cfg == 'chiller_boiler':
        capex = ck * C + 120 * H
    elif cfg == 'hybrid_hp_boiler':
        capex = ck * kw_main + 120 * H * 0.5
    elif cfg == 'dh_chiller':
        capex = ck * C + 80 * H
    else:
        capex = ck * kw_main
    ref = _g(t, 'refrigerant')
    gwp = _g(REFRIGERANTS[ref], 'gwp', 0) if ref else 0
    charge_kg = _g(t, 'charge_kg_kw', 0) * kw_main
    grid = _g(st, 'grid', 0)
    years = _p(st, 'years', 20)
    co2 = (years * (elec * grid + gas * _p(st, 'gas_kg_kwh', 0) + dh * 0.1) / 1000
           + years * charge_kg * gwp * _p(st, 'leak_rate', 0) / 1000)
    lw = lp = margin = None
    lw_a = _g(t, 'lw_a')
    if lw_a is not None:
        lw = lw_a + 10 * math.log10(max(1, kw_main))
        r = max(1, _g(st, 'noise_dist_m') or 1)
        lp = lw - 20 * math.log10(r) - 8
        if _g(st, 'location') in ('indoor', 'plantroom'):
            lp -= 15
        lim = _g(st, 'noise_limit_dba')
        margin = lim - lp if lim is not None else None
    foot = _g(t, 'foot_m2_kw', 0) * kw_main
    maint = _g(t, 'maint', 0) + (0.1 if gas > 0 else 0) + 0.05 * _g(t, 'compressors', 0) / 4
    return {'kw_main': kw_main, 'heat_kwh': heat_kwh, 'cool_kwh': cool_kwh,
            'elec_kwh': elec, 'gas_kwh': gas, 'dh_kwh': dh, 'scop_eff': scop,
            'eff': eff, 'capex_eur': capex, 'co2_t20': co2, 'lw_db': lw,
            'lp_db': lp, 'noise_margin_db': margin, 'foot_m2': foot,
            'maint': maint, 'gwp': gwp, 'charge_kg': charge_kg}


def rnd(x, d):
    f = 10 ** d
    return math.floor(x * f + 0.5) / f


_CRIT = (('eff', 'eff', True), ('capex', 'capex_eur', False), ('co2', 'co2_t20', False),
         ('noise', None, None), ('foot', 'foot_m2', False), ('maint', 'maint', False))


def _norm(v, lo, hi, high_better):
    if hi == lo:
        return 1.0
    return (v - lo) / (hi - lo) if high_better else (hi - v) / (hi - lo)


def score_all(st, feasible):
    ids = list(feasible)
    if not ids:
        return []
    ms = {c: metrics(c, st) for c in ids}
    rng = {}
    for k, mk, _ in _CRIT:
        if mk:
            vals = [ms[c][mk] for c in ids]
            rng[k] = (min(vals), max(vals))
    w = WEIGHTS.get(_g(st, 'priority'), WEIGHTS['lcc'])
    gwp_low = _p(st, 'gwp_low', 750)
    out = []
    for c in ids:
        m, t = ms[c], TECH[c]
        crit, base = {}, 0.0
        for k, mk, hb in _CRIT:
            if mk:
                n = _norm(m[mk], rng[k][0], rng[k][1], hb)
            else:
                mg = m['noise_margin_db']
                n = 1.0 if mg is None else _clamp(mg, 0, 10) / 10.0
            crit[k] = n
            base += _g(w, k, 0) * n
        pen = []
        if _g(st, 'refrigerant_policy') == 'low_gwp' and m['gwp'] > gwp_low:
            pen.append(('GWP_HIGH', -0.15))
        if m['noise_margin_db'] is not None and m['noise_margin_db'] < 0:
            pen.append(('NOISE', -0.20))
        if _g(st, 'reliability') in ('critical', 'life') and _g(t, 'compressors') == 1:
            pen.append(('SINGLE_CIRCUIT', -0.20))
        out.append({'id': c, 'score': rnd(base + sum(v for _, v in pen), 4),
                    'base': rnd(base, 4),
                    'criteria': {k: rnd(v, 4) for k, v in crit.items()},
                    'penalties': [p for p, _ in pen], 'metrics': m})
    idx = lambda c: CONFIG_IDS.index(c) if c in CONFIG_IDS else len(CONFIG_IDS)
    out.sort(key=lambda e: (-e['score'], idx(e['id'])))
    return out


def top_gap(ranked):
    if not ranked:
        return 0
    if len(ranked) == 1:
        return 1
    return rnd(ranked[0]['score'] - ranked[1]['score'], 4)


def size_generic(cfg, fam, st):
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
    uh = uc = GENERIC_UNIT_KW[fam]
    if fam == 'vrf':
        mx = vrf_max_sys_kw(cfg, st)[0]
        if mx and mx > 0:
            if mode in ('heat', 'both'):
                uh = min(uh, mx)
            if mode in ('cool', 'both'):
                uc = min(uc, mx)
    nH = int(math.ceil(h_duty / uh)) if mode in ('heat', 'both') else 0
    nC = int(math.ceil(c_duty / uc)) if mode in ('cool', 'both') else 0
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
        cs = _clamp(st.get('critical_share') or 0, 0, 1)
        units = max(units, n_base + int(math.ceil(n_base * cs)))
    boiler = fam == 'boiler_gas'
    circuits = None if boiler else {'standard': 1, 'business': 2, 'critical': 2, 'life': 2}.get(rel, 1)
    compressors = 0 if boiler else circuits
    td = 0.2 if boiler else 0.3
    unit_min = unit_cap * td
    min_load = _clamp(st.get('part_load_share') or 0, 0, 1) * duty
    ok = True if duty <= 0 else unit_min <= min_load
    return {'family': fam, 'role': role, 'units': units, 'n_base': n_base,
            'unit_cap_kw': unit_cap, 'circuits': circuits, 'compressors': compressors,
            'redundancy': red, 'dual_power': rel == 'life', 'part_load_ok': ok,
            'min_load_kw': rnd(min_load, 2), 'unit_min_kw': rnd(unit_min, 2)}


_MKEYS = ('kw_main', 'elec_kwh', 'gas_kwh', 'dh_kwh', 'scop_eff', 'eff', 'capex_eur',
          'co2_t20', 'lp_db', 'noise_margin_db', 'foot_m2', 'maint', 'charge_kg')


def solve(case):
    st = build_state(case['preset'], case.get('city'), case.get('set') or {})
    feasible, excluded, handoff = hard_filters(st)
    ranked = score_all(st, feasible)
    top = ranked[0]['id'] if ranked else None
    sizing = [size_generic(top, f, st) for f in families(top, st)] if top else []
    return {
        'feasible': feasible,
        'excluded': {k: sorted(v) for k, v in excluded.items()},
        'handoff': handoff,
        'top': top,
        'gap': top_gap(ranked),
        'ranking': [r['id'] for r in ranked],
        'scores': {r['id']: r['score'] for r in ranked},
        'base': {r['id']: r['base'] for r in ranked},
        'criteria': {r['id']: r['criteria'] for r in ranked},
        'penalties': {r['id']: r['penalties'] for r in ranked},
        'metrics': {r['id']: {k: r['metrics'][k] for k in _MKEYS} for r in ranked},
        'sizing': sizing,
    }


def _c(cid, preset, city=None, s=None, note=''):
    return {'id': cid, 'preset': preset, 'city': city, 'set': s or {}, 'note': note}


CASES = [
    _c('p_office', 'office', note='preset defaults'),
    _c('p_hotel', 'hotel', note='preset defaults'),
    _c('p_school', 'school', note='preset defaults'),
    _c('p_hospital', 'hospital', note='preset defaults'),
    _c('p_data_center', 'data_center', note='preset defaults'),
    _c('p_pool', 'pool', note='preset defaults'),
    _c('p_warehouse', 'warehouse', note='preset defaults'),
    _c('p_industry', 'industry', note='preset defaults'),
    _c('p_offshore', 'offshore', note='preset defaults'),
    _c('t1_office_brussels', 'office', 'brussels',
       {'need': 'both', 'load_kw': 300, 'simultaneous': False, 'location': 'roof',
        'refrigerant_policy': 'low_gwp', 'priority': 'lcc'}, 'office roof, low-GWP, LCC'),
    _c('t2_hospital_madrid', 'hospital', 'madrid',
       {'need': 'both', 'simultaneous': True, 'reliability': 'critical', 'redundancy': 'N+1'},
       'critical hospital, simultaneous H/C'),
    _c('t3_school_warsaw_ht', 'school', 'warsaw',
       {'need': 'heat', 't_flow_heat': 70, 'gas_ban': True}, 'high-temp heat, gas ban'),
    _c('t4_dc_stockholm', 'data_center', 'stockholm',
       {'need': 'cool', 'reliability': 'life', 'redundancy': '2N'}, 'life-critical DC, 2N'),
    _c('t5_hotel_athens_vrf', 'hotel', 'athens',
       {'load_kw': 80, 'load_cool_kw': 80, 'need': 'both', 'simultaneous': True, 'pipe_m': 60,
        'smallest_room_m3': 30, 'occupancy': 'general', 'refrigerant_policy': 'any',
        'priority': 'compact', 'reliability': 'standard', 'redundancy': 'N'},
       'small hotel, VRF charge limits'),
    _c('t6_industry_atex1', 'industry', None,
       {'atex_zone': '1', 'atex_equipment_in_zone': True, 'refrigerant_policy': 'natural'},
       'ATEX zone 1, natural refrigerants'),
    _c('v_vent', 'office', None, {'need': 'vent'}, 'ventilation only'),
    _c('v_atex0', 'warehouse', None, {'atex_zone': '0', 'atex_equipment_in_zone': True},
       'ATEX zone 0'),
    _c('v_helsinki_lowamb', 'warehouse', 'helsinki', {}, 'low ambient'),
    _c('v_seville_highamb', 'office', 'seville', {'t_sum': 48}, 'high ambient'),
    _c('v_kw_avail', 'office', None, {'kw_avail': 60}, 'electrical capacity limit'),
    _c('v_district', 'office', None, {'sources': ['air', 'district']}, 'district heating available'),
    _c('v_gas_unavail_heat', 'school', None, {'gas_available': False}, 'no gas supply'),
    _c('v_priority_capex', 'office', None, {'priority': 'capex'}, 'priority capex'),
    _c('v_priority_co2', 'office', None, {'priority': 'co2'}, 'priority co2'),
    _c('v_priority_compact', 'office', None, {'priority': 'compact'}, 'priority compact'),
    _c('v_noise_tight', 'office', None, {'noise_limit_dba': 35, 'noise_dist_m': 10},
       'tight noise limit'),
    _c('v_indoor_plantroom', 'pool', None, {'location': 'indoor'}, 'indoor plant room'),
    _c('v_flow_80', 'school', None, {'t_flow_heat': 80, 'gas_ban': True},
       '80 C flow, gas ban'),
    _c('v_life_cs', 'hospital', None,
       {'reliability': 'life', 'redundancy': 'N+1', 'critical_share': 0.6},
       'life safety, critical share 0.6'),
    _c('v_vrf_restricted', 'hotel', None,
       {'occupancy': 'restricted', 'smallest_room_m3': 60, 'pipe_m': 40, 'load_kw': 100,
        'load_cool_kw': 100, 'reliability': 'standard'}, 'VRF restricted occupancy'),
    _c('v_cool_only_gwp', 'data_center', None,
       {'refrigerant_policy': 'any', 'reliability': 'business', 'redundancy': 'N+1'},
       'cool only, any refrigerant'),
]


def main():
    out = [{'id': c['id'], 'preset': c['preset'], 'city': c['city'], 'set': c['set'],
            'note': c['note'], 'ref': solve(c)} for c in CASES]
    path = os.path.join(_HERE, 'hvacgenselect_ref.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1, allow_nan=False)
    print(len(out))


if __name__ == '__main__':
    main()
