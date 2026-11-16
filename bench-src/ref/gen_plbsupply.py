#!/usr/bin/env python3
"""Independent reference for plbsupply (drinking water pipe sizing).

Written from the published method _plb/sup/METHOD.md (plbsupply-1.3): DIN 1988-300 design flows / minimum flow pressures
and peak-flow constants (cited by content, D-PLB-18), EN 806-3 loading units with the Figure B.1 lines (D-BW-5, read independently: log-space interpolation between the figure points), water
density Kell (1975), viscosity IAPWS 2008, Colebrook-White friction (Newton iteration) with the stated laminar /
transition rule, the generated tree and the stated sizing rules. Not a port of plb-supply.js.

D-PLB-10: in addition, EXTERNAL ANCHORS (bottom of this file) were computed by hand from the standard text
(the DIN 1988-300 peak-flow formula and velocity limits, the EN 806-3 / DIN service-pipe velocity of 2 m/s, pipe bores
from EN 1057 / EN 12201 dimensions) — not from this generator and not from the JS. main() asserts that compute()
reproduces them, and they are written into the reference as cases with `anchor` text.

Writes bench-src/ref/plbsupply_ref.json: a list of cases {id, note, input, expect[, anchor]}.
Run: python bench-src/ref/gen_plbsupply.py
"""
import json, math, os, copy

G = 9.80665

# METHOD.md §1 — fixture library of the package (plumbing-core FIXTURES, D-PLB-7): (Qa cold, Qa hot, p_min, LU cold, LU hot)
FIX = {
    'wc_cistern': (0.13, 0, 0.5, 1, 0),
    'wc_flushvalve': (1, 0, 1.2, 15, 0),
    'urinal_flush': (0.3, 0, 1, 3, 0),
    'urinal_waterless': (0, 0, 0, 0, 0),
    'basin': (0.07, 0.07, 1, 1, 1),
    'handbasin_small': (0.07, 0.07, 1, 1, 1),
    'sink_kitchen': (0.07, 0.07, 1, 2, 2),
    'sink_commercial': (0.3, 0.3, 1, 8, 8),
    'shower': (0.15, 0.15, 1, 2, 2),
    'shower_large_head': (0.25, 0.25, 1.5, 4, 4),
    'bath': (0.15, 0.15, 1, 4, 4),
    'bidet': (0.07, 0.07, 1, 1, 1),
    'washing_machine': (0.15, 0, 0.5, 2, 0),
    'dishwasher_dom': (0.07, 0, 0.5, 2, 0),
    'dishwasher_com': (0.15, 0.15, 1, 3, 3),
    'tap_garden': (0.3, 0, 0.5, 5, 0),
    'tap_utility': (0.3, 0, 0.5, 5, 0),
    'drinking_fountain': (0.05, 0, 1, 1, 0),
    'slop_sink': (1, 0, 1.2, 15, 0),
    'bedpan_washer': (0.15, 0.15, 1, 2, 2),
    'eyewash_emergency': (0.1, 0, 1, 1, 0),
    'floor_drain': (0, 0, 0, 0, 0),
    'cleaner_sink': (0.15, 0.15, 1, 2, 2),
}
# §2 DIN 1988-300 peak-flow constants; sports/retail/restaurant/industrial have none (need din_curve or EN 806)
ABC = {'residential': (1.48, 0.19, 0.94), 'care_home': (1.40, 0.14, 0.92), 'hotel': (0.70, 0.48, 0.13),
       'hospital': (0.75, 0.44, 0.18), 'office': (0.91, 0.31, 0.38), 'school': (0.91, 0.31, 0.38)}

def ser(*pairs):
    return [(od, w, od - 2 * w) for od, w in pairs]

# §5 series (OD, wall, ID) and roughness mm
MAT = {
    'copper': (0.0015, ser((12, 1), (15, 1), (18, 1), (22, 1), (28, 1), (35, 1.2), (42, 1.2), (54, 1.5), (64, 2), (76.1, 2), (88.9, 2), (108, 2.5))),
    'stainless': (0.0015, ser((15, 1), (18, 1), (22, 1.2), (28, 1.2), (35, 1.5), (42, 1.5), (54, 1.5), (76.1, 2), (88.9, 2), (108, 2))),
    'multilayer': (0.007, ser((16, 2), (20, 2), (26, 3), (32, 3), (40, 3.5), (50, 4), (63, 4.5))),
    'pe100': (0.007, ser((25, 2.3), (32, 2.9), (40, 3.7), (50, 4.6), (63, 5.8), (75, 6.8), (90, 8.2), (110, 10))),
    'galvanised': (0.15, ser((21.3, 2.6), (26.9, 2.6), (33.7, 3.2), (42.4, 3.2), (48.3, 3.2), (60.3, 3.6), (76.1, 3.6), (88.9, 4), (114.3, 4.5))),
}

BASE = dict(method='din', building_type='residential', din_curve=None, circuit='total', material='copper', service_material='pe100', sizing='pressure',
            T_cold_c=10, T_hot_c=60, p_supply_bar=3.0, p_static_bar=None, friction_allowance_bar=1.0,
            dp_meter_bar=0.3, dp_filter_bar=0.2, dp_backflow_bar=0.1, dp_heater_bar=0.3,
            service_length_m=15, service_zeta=2, main_length_m=20, main_zeta=6, meter_level_m=-1.0,
            floor_height_m=3.0, riser_zeta=1.5, branch_length_m=12, branch_zeta=8, outlet_height_m=1.0,
            vmax={'service': None, 'main': None, 'riser': None, 'branch': None})

# IAPWS 2008 viscosity coefficients (published constants of the release)
H0 = (1.67752, 2.20462, 0.6366564, -0.241605)
H1 = {(0, 0): 5.20094e-1, (0, 1): 2.22531e-1, (0, 2): -2.81378e-1, (0, 3): 1.61913e-1, (0, 4): -3.25372e-2,
      (1, 0): 8.50895e-2, (1, 1): 9.99115e-1, (1, 2): -9.06851e-1, (1, 3): 2.57399e-1,
      (2, 0): -1.08374, (2, 1): 1.88797, (2, 2): -7.72479e-1,
      (3, 0): -2.89555e-1, (3, 1): 1.26613, (3, 2): -4.89837e-1, (3, 4): 6.98452e-2, (3, 6): -4.35673e-3,
      (4, 2): -2.57040e-1, (4, 5): 8.72102e-3,
      (5, 1): 1.20573e-1, (5, 6): -5.93264e-4}


def rho_mu(T):
    # Kell (1975) density at 1 atm
    rho = (999.83952 + 16.945176 * T - 7.9870401e-3 * T ** 2 - 46.170461e-6 * T ** 3 + 105.56302e-9 * T ** 4 - 280.54253e-12 * T ** 5) / (1 + 16.879850e-3 * T)
    Tb, rb = (T + 273.15) / 647.096, rho / 322.0
    mu0 = 100 * math.sqrt(Tb) / sum(h / Tb ** i for i, h in enumerate(H0))
    s1 = sum(h * (1 / Tb - 1) ** i * (rb - 1) ** j for (i, j), h in H1.items())
    return rho, mu0 * math.exp(rb * s1) * 1e-6


def colebrook(Re, rel):
    # Newton on x = 1/sqrt(lambda) (independent of the fixed-point scheme)
    x = 1 / math.sqrt(0.25 / math.log10(rel / 3.7 + 5.74 / Re ** 0.9) ** 2)
    for _ in range(100):
        a = rel / 3.7 + 2.51 * x / Re
        f = x + 2 * math.log10(a)
        df = 1 + 2 / (math.log(10) * a) * 2.51 / Re
        dx = f / df
        x -= dx
        if abs(dx) < 1e-15:
            break
    return 1 / (x * x)


def lam(Re, rel):
    if Re <= 0:
        return 0.0
    if Re < 2300:
        return 64.0 / Re
    if Re < 4000:
        w = (Re - 2300) / 1700.0
        return (1 - w) * 64 / 2300 + w * colebrook(4000, rel)
    return colebrook(Re, rel)


def vmax_of(kind, zeta, longflow, c):
    if c['vmax'].get(kind) is not None:
        return c['vmax'][kind]
    if kind == 'service':
        return 2.0
    if c['method'] == 'en806' or longflow:
        return 2.0
    return 5.0 if zeta < 2.5 else 2.5


def flows(fid, circuit):
    qc, qh, pm, lc, lh = FIX[fid]
    if circuit == 'cold':
        q, lu = qc, lc
    elif circuit == 'hot':
        q, lu = qh, lh
    else:
        q, lu = qc + qh, max(lc, lh)
    return q, lu, (pm if q > 0 else 0)


# METHOD §0.11 (r4, Y2-2): DIN 1988-300 utilisation unit. In one unit the two largest design flows count, after the DIN
# exclusions: no shower when the unit has a bath, only one basin (basin / small hand basin), no bidet, no urinal.
def two_largest(fixtures, circuit):
    vals = []
    basin_seen = False
    for fid, n in fixtures.items():
        if fid in ('bidet', 'urinal_flush'):
            continue
        if fid == 'shower' and fixtures.get('bath', 0) > 0:
            continue
        q = flows(fid, circuit)[0]
        if q <= 0 or n <= 0:
            continue
        if fid in ('basin', 'handbasin_small'):
            if basin_seen:
                continue
            basin_seen, n = True, 1
        vals += [q] * min(n, 2)
    vals.sort(reverse=True)
    return sum(vals[:2])


# EN 806-3:2006 Annex B Figure B.1 as read on the licensed copy (D-BW-5): points (ΣLU, QD l/s) of each line.
# Branch for the highest single LU m (Table 2 values 2, 3, 4, 5, 8, 15) from the diagonal point (m, m/10) to the node
# (300 LU, 1.7 l/s); above the node one line to (5000 LU, 8.9 l/s). m < 2 → 2 LU line, m > 15 → 15 LU line.
FIG_NODE, FIG_END = (300.0, 1.7), (5000.0, 8.9)


def _loglin(x, p, q):
    t = (math.log(x) - math.log(p[0])) / (math.log(q[0]) - math.log(p[0]))
    return math.exp(math.log(p[1]) + t * (math.log(q[1]) - math.log(p[1])))


def fig_b1(slu, lmax):
    m = min(15.0, max(2.0, float(lmax)))
    if slu <= m:
        return 0.1 * slu
    if slu <= FIG_NODE[0]:
        return _loglin(slu, (m, 0.1 * m), FIG_NODE)
    return _loglin(slu, FIG_NODE, FIG_END)


def design_flow(zones, c, circuit):
    sq = slu = qmax = lmax = qcont = pmin = 0.0
    pfix = None
    units, floor2 = 0, 0.0
    for z in zones:
        if not z.get('simultaneous') and any(flows(f, circuit)[0] > 0 for f in z['fixtures']):
            units += z.get('units', 1)
            floor2 = two_largest(z['fixtures'], circuit)
        for fid, n in z['fixtures'].items():
            q, lu, pm = flows(fid, circuit)
            if q <= 0:
                continue
            cnt = n * z.get('units', 1)
            if z.get('simultaneous'):
                qcont += cnt * q
            else:
                sq += cnt * q
                slu += cnt * lu
            qmax = max(qmax, q)
            lmax = max(lmax, lu)
            if pm > pmin:
                pmin, pfix = pm, fid
        qcont += z.get('q_cont_lps', 0)
    if c['method'] == 'en806':
        d = 0.0 if slu <= 0 else min(0.1 * slu, max(0.1 * lmax, fig_b1(slu, lmax)))
    else:
        a, b, cc = ABC[c.get('din_curve') or c['building_type']]
        d = 0.0 if sq <= 0 else min(sq, max(qmax, a * sq ** b - cc))
        # only rooms with dwelling-like use are utilisation units: flats, hotel rooms, care-home and hospital ward rooms
        if c['building_type'] in ('residential', 'care_home', 'hotel', 'hospital') and units == 1 and floor2 > d:
            d = min(sq, floor2)
    return d + qcont, pmin, pfix, qcont


def compute(c):
    zones = c['zones']
    app = c['dp_meter_bar'] + c['dp_filter_bar'] + c['dp_backflow_bar'] + (c['dp_heater_bar'] if c['circuit'] == 'hot' else 0)
    # service + main carry cold + hot (upstream of the heater tee), at the cold temperature
    segs = [dict(id='SVC', kind='service', parent=None, L=c['service_length_m'], dz=0.0, zeta=c['service_zeta'], zones=zones, app=0.0, circ='total', T=c['T_cold_c']),
            dict(id='MAIN', kind='main', parent='SVC', L=c['main_length_m'], dz=0.0, zeta=c['main_zeta'], zones=zones, app=app, circ='total', T=c['T_cold_c'])]
    # METHOD §0.12 (r4, Y2-1): downstream of the tee the 'total' circuit is two systems — cold (suffix .C) and hot (.H, the
    # water-heater loss at the start of its first riser); a system only serves zones with a draw-off (or continuous flow) on it
    if c['circuit'] == 'total':
        systems = [('cold', '.C', 0.0), ('hot', '.H', c['dp_heater_bar'])]
    else:
        systems = [(c['circuit'], '', 0.0)]
    for circ, sfx, heater in systems:
        zs = [z for z in zones if c['circuit'] != 'total' or z.get('q_cont_lps', 0) > 0 or any(flows(f, circ)[0] > 0 for f in z['fixtures'])]
        if not zs:
            continue
        T = c['T_hot_c'] if circ == 'hot' else c['T_cold_c']
        fmax = max(z['floor'] for z in zs)
        fmin = min(0, min(z['floor'] for z in zs))
        prev, zp, a0 = 'MAIN', c['meter_level_m'], heater
        for f in range(fmin, fmax + 1):
            up = [z for z in zs if z['floor'] >= f]
            if not up:
                break
            zf = f * c['floor_height_m'] + c['outlet_height_m']
            rid = 'R%d%s' % (f, sfx)
            segs.append(dict(id=rid, kind='riser', parent=prev, L=abs(zf - zp), dz=zf - zp, zeta=c['riser_zeta'], zones=up, app=a0, circ=circ, T=T))
            prev, zp, a0 = rid, zf, 0.0
        for z in zs:
            segs.append(dict(id='B-' + z['id'] + sfx, kind='branch', parent='R%d%s' % (z['floor'], sfx), L=c['branch_length_m'], dz=0.0, zeta=c['branch_zeta'], zones=[z], app=0.0, circ=circ, T=T))
    for s in segs:
        s['q'], s['pmin'], s['pfix'], qc = design_flow(s['zones'], c, s['circ'])
        s['mat'] = c['service_material'] if s['kind'] == 'service' else c['material']
        s['vmax'] = vmax_of(s['kind'], s['zeta'], qc > 0, c)
        s['rho'], mu = rho_mu(s['T'])
        s['nu'] = mu / s['rho']
    idx = {s['id']: s for s in segs}

    def path(i):
        p = []
        while i:
            p.insert(0, i)
            i = idx[i]['parent']
        return p

    def od(s):
        return MAT[s['mat']][1][s['k']][0]

    def raise_feeders(s):
        # a pipe is never larger (OD) than its feeder of the same material
        while s['parent']:
            p = idx[s['parent']]
            if p['mat'] != s['mat'] or od(p) >= od(s):
                break
            n = len(MAT[p['mat']][1])
            while p['k'] < n - 1 and od(p) < od(s):
                p['k'] += 1
            s = p

    # velocity sizing
    for s in segs:
        ser_ = MAT[s['mat']][1]
        s['k'] = len(ser_) - 1
        for j, (_, _, di) in enumerate(ser_):
            if s['q'] / 1000 / (math.pi * (di / 1000) ** 2 / 4) <= s['vmax'] + 1e-9:
                s['k'] = j
                break
    for s in reversed(segs[1:]):
        raise_feeders(s)

    def run():
        for s in segs:
            eps, ser_ = MAT[s['mat']]
            di = ser_[s['k']][2] / 1000
            v = s['q'] / 1000 / (math.pi * di * di / 4)
            Re = v * di / s['nu']
            l = lam(Re, eps / 1000 / di)
            dyn = s['rho'] * v * v / 2
            s['v'] = v
            s['dp'] = (l / di * dyn * s['L'] + s['zeta'] * dyn) / 1e5
            s['dpg'] = s['rho'] * G * s['dz'] / 1e5
            pin = idx[s['parent']]['pe'] if s['parent'] else c['p_supply_bar']
            s['pe'] = pin - s['app'] - s['dp'] - s['dpg']

    def worst():
        w = None
        for s in segs:
            if s['kind'] != 'branch':
                continue
            m = s['pe'] - s['pmin']
            if w is None or m < w[1] - 1e-12:
                w = (s['id'], m)
        return w

    run()
    w0 = worst()
    smin = min(c['p_supply_bar'] - sum(idx[i]['app'] + idx[i]['dpg'] for i in path(b['id'])) - b['pmin'] for b in segs if b['kind'] == 'branch')
    offset = 0.0 if smin >= 0 else -smin + c['friction_allowance_bar']
    steps = 0
    if c['sizing'] == 'pressure':
        for _ in range(3000):
            wid, m = worst()
            if m + offset >= 0:
                break
            best, bdp = None, -1
            for i in path(wid):
                s = idx[i]
                if s['k'] >= len(MAT[s['mat']][1]) - 1:
                    continue
                if s['dp'] > bdp + 1e-12:
                    best, bdp = s, s['dp']
            if best is None:
                break
            best['k'] += 1
            steps += 1
            raise_feeders(best)
            run()
    wid, m = worst()
    boost = m < -1e-9
    # METHOD §0.13 (r4, Y2-4): a segment whose largest size still exceeds its velocity limit is unsized
    unsized = []
    for s in segs:
        di = MAT[s['mat']][1][s['k']][2] / 1000
        if s['q'] / 1000 / (math.pi * di * di / 4) > s['vmax'] + 1e-9:
            unsized.append(s['id'])
    rho_c = rho_mu(c['T_cold_c'])[0]
    return {
        'q_design_lps': segs[0]['q'],
        'q_circuit_lps': design_flow(zones, c, c['circuit'])[0],
        'sizes': {s['id']: '%s×%s' % (fmt(MAT[s['mat']][1][s['k']][0]), fmt(MAT[s['mat']][1][s['k']][1])) for s in segs},
        'worst_branch': wid, 'worst_margin_bar': m, 'worst_fixture': idx[wid]['pfix'], 'worst_p_bar': idx[wid]['pe'],
        'booster': boost, 'head_m': (-m * 1e5 / (rho_c * G)) if boost else 0.0,
        'static_feasible': smin >= 0, 'upsized_steps': steps, 'initial_worst_margin_bar': w0[1], 'static_margin_bar': smin,
        'unsized': unsized, 'ok': (not boost) and not unsized,
    }


def fmt(x):
    return ('%g' % x)


def flats(floors, per, fx=None, start=0):
    f0 = {'wc_cistern': 1, 'basin': 1, 'shower': 1, 'sink_kitchen': 1, 'washing_machine': 1, 'dishwasher_dom': 1}
    return [dict(id='F%d' % f, floor=f, units=per, fixtures=dict(fx or f0)) for f in range(start, floors)]


def case(cid, note, zones, **kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    c['zones'] = zones
    return dict(id=cid, note=note, input=c, expect=compute(c))


# METHOD.md §7 (plbsupply-1.2, X1-1): floors, units and fixture counts are counts — whole numbers, never rounded.
# floor -5..300, units 1..100 000, fixture count 0..100 000; a fraction or an out-of-range value is an input error.
def count_errors(c):
    errs = []
    for i, z in enumerate(c['zones']):
        zid = z.get('id') or 'Z%d' % (i + 1)
        whole = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and float(v).is_integer()
        if z.get('floor') is not None and not (whole(z['floor']) and -5 <= z['floor'] <= 300):
            errs.append('range:zone.floor:' + zid)
        if z.get('units') is not None and not (whole(z['units']) and 1 <= z['units'] <= 100000):
            errs.append('range:zone.units:' + zid)
        for fid, n in z['fixtures'].items():
            if n is not None and not (whole(n) and 0 <= n <= 100000):
                errs.append('fixture_count:%s:%s' % (zid, fid))
    return errs


def bad_case(cid, note, zones, **kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    c['zones'] = zones
    errs = count_errors(c)
    assert errs, cid
    return dict(id=cid, note=note, input=c, expect={'valid': False, 'errors': errs})


def office(fv=False):
    fx = {'wc_flushvalve' if fv else 'wc_cistern': 8, 'urinal_flush': 3, 'basin': 8, 'sink_kitchen': 1, 'dishwasher_dom': 1}
    return [dict(id='O%d' % f, floor=f, units=1, fixtures=dict(fx)) for f in range(8)]


def hotel():
    z = [dict(id='H%d' % f, floor=f, units=20, fixtures={'wc_cistern': 1, 'basin': 1, 'shower': 1}) for f in range(1, 7)]
    z.append(dict(id='H0', floor=0, units=1, fixtures={'wc_cistern': 6, 'basin': 6, 'urinal_flush': 2, 'sink_kitchen': 4, 'dishwasher_dom': 2}))
    return z


def sports():
    return [dict(id='S1', floor=0, units=1, simultaneous=True, fixtures={'shower': 16}),
            dict(id='S2', floor=0, units=1, fixtures={'wc_cistern': 6, 'urinal_flush': 4, 'basin': 6, 'sink_kitchen': 2})]



# ---- D-PLB-10 external anchors, computed by hand (pocket calculator) from the standard text, not by compute() ----
# A1  DIN 1988-300 peak flow, hotel constants a=0.70 b=0.48 c=0.13: 20 rooms x (shower 0.15+0.15, basin 0.07+0.07, WC 0.13)
#     sum Qa = 20 x 0.57 = 11.4 l/s; ln 11.4 = 2.43361, x0.48 = 1.16813, e^ = 3.21606, x0.70 = 2.25124, -0.13 = 2.1212 l/s.
#     Velocity sizing (DIN 1988-300 velocity limits): service 2 m/s -> d_i >= sqrt(4q/(pi v)) = 36.7 mm -> PE100 50x4.6 (d_i 40.8; 40x3.7 has 32.6);
#     basement main, valves zeta 6 >= 2.5 -> 2.5 m/s -> d_i >= 32.9 mm -> copper 42x1.2 (d_i 39.6; 35x1.2 has 32.6 -> 2.54 m/s);
#     r4 (Y2-1): downstream of the heater tee the cold and the hot system are separate. Cold per room 0.35 -> sum 7.0 l/s:
#     ln 7 = 1.94591, x0.48 = 0.93404, e^ = 2.54475, x0.70 = 1.78132, -0.13 = 1.6513 l/s; hot per room 0.22 -> 4.4 l/s:
#     ln 4.4 = 1.48160, x0.48 = 0.71117, e^ = 2.03645, x0.70 = 1.42551, -0.13 = 1.2955 l/s.
#     cold branch 2.5 m/s -> d_i >= 29.0 mm -> 35x1.2 (32.6; 28x1 has 26.0); hot branch -> 25.7 mm -> 28x1 (26.0);
#     risers zeta 1.5 -> 5 m/s -> 20.5 / 18.2 mm -> 28x1 / 22x1, raised to the branch OD (35x1.2 / 28x1) because a pipe is not
#     smaller than the pipe it feeds (METHOD §0.5).
# A2  (r4, replaces the single bathroom with a shower next to a bath, which DIN treats as one utilisation unit - Y2-2)
#     DIN 1988-300 residential a=1.48 b=0.19 c=0.94, two flats each WC 0.13 + shower 0.30 + kitchen sink 0.14: sum Qa = 1.14 l/s;
#     ln 1.14 = 0.131028, x0.19 = 0.024895, e^ = 1.025208, x1.48 = 1.517308, -0.94 = 0.5773 l/s (two units: sum of unit peaks 0.88
#     is larger than the curve, so the curve governs). Service 2 m/s -> d_i >= 19.2 mm -> PE100 25x2.3 (20.4); main 2.5 m/s
#     -> 17.1 mm -> copper 22x1 (18x1 has 16.0).
# A4  (r4, Y2-2) DIN 1988-300 utilisation unit, SHK Profi 8/2012 example 1 (TS 3: bath 0.15 + basin 0.07 = 0.22 l/s cold):
#     one flat with bath + basin, cold circuit. Branch: two largest cold = 0.22 l/s (curve 1.48 x 0.22^0.19 - 0.94 = 0.170 only);
#     service + main carry cold + hot: two largest = bath 0.30 + basin 0.14 = 0.44 l/s (curve 0.326). Service 2 m/s -> 16.7 mm
#     -> PE100 25x2.3; main 2.5 m/s -> 15.0 mm -> 18x1 (16.0); branch 2.5 m/s at 0.22 l/s -> 10.6 mm -> 15x1 (13.0; 12x1 has 10.0).
# A5  (r4, Y2-4) 15 l/s continuous + one utility tap 0.30 l/s = 15.3 l/s; service pipe 2 m/s (long-duration flow) needs
#     d_i >= sqrt(4 x 0.0153 / (pi x 2)) = 98.7 mm; the largest PE100 bore is 110x10 = 90 mm -> v = 2.405 m/s: no size of the
#     series meets the limit -> segment SVC unsized (flag no_size_v:SVC), verdict not OK.
# A6  (r4, Y2-1) worked example of METHOD §0.12: one shower on the ground floor, 2.0 bar, meter level 0, outlet 1 m:
#     static reserve of the hot path = 2.0 - (0.3+0.2+0.1) - 0.3 heater - 983.2 x 9.80665 x 1 / 1e5 - 1.0 = 0.0036 bar
#     (the cold path keeps 0.302 bar; the old combined check without the heater also kept 0.302 bar and reported +0.095 bar).
# A3  10 team showers used at once (no simultaneity): q = 10 x 0.30 = 3.00 l/s; flow > 15 min -> 2 m/s also in the main
#     (DIN 1988-300 velocity limits): d_i >= 43.7 mm -> service PE100 63x5.8 (51.4; 50x4.6 has 40.8), main copper 54x1.5 (51.0; 42x1.2 has 39.6).
# A4  EN 806-3 Fig. B.1 (D-BW-5): 6 flats x (bath 4, sink 2, washing machine 2, basin 1, WC 1 LU) = 60 LU, highest single 4 LU.
#     4 LU line from (4, 0.4) to (300, 1.7): exponent ln(1.7/0.4)/ln(75) = 1.44692/4.31749 = 0.33513;
#     QD = 0.4 x 15^0.33513 = 0.4 x e^(0.33513 x 2.70805) = 0.4 x e^0.90755 = 0.4 x 2.47817 = 0.9913 l/s.
#     EN 806-3 §4.4 / method velocity 2 m/s everywhere: d_i >= sqrt(4 x 0.9913e-3/(pi x 2)) = 25.1 mm -> PE100 32x2.9 (26.2; 25x2.3 has 20.4),
#     copper 28x1 (26.0; 22x1 has 20.0) for main, riser and branch.
ANCHORS = [
    dict(id='anchor-hotel-din', note='external anchor A1: DIN 1988-300 hotel peak flow and velocity limits by hand', q=2.1212,
         anchor='hand calculation from the DIN 1988-300 peak-flow formula (hotel constants) and the velocity limits; pipe bores from EN 12201 / EN 1057 dimensions',
         zones=[dict(id='H', floor=0, units=20, fixtures={'shower': 1, 'basin': 1, 'wc_cistern': 1})], kw=dict(building_type='hotel', sizing='velocity', p_supply_bar=4.0),
         sizes={'SVC': '50×4.6', 'MAIN': '42×1.2', 'R0.C': '35×1.2', 'B-H.C': '35×1.2', 'R0.H': '28×1', 'B-H.H': '28×1'}),
    dict(id='anchor-flat-din', note='external anchor A2 (r4): DIN 1988-300 residential peak flow of two flats, sum Qa = 1.14 l/s', q=0.5773,
         anchor='hand calculation: Qs = 1.48 x 1.14^0.19 - 0.94 (residential constants); two utilisation units, curve below the sum of unit peaks; velocity limits 2 / 2.5 m/s',
         zones=[dict(id='W', floor=0, units=2, fixtures={'wc_cistern': 1, 'shower': 1, 'sink_kitchen': 1})], kw=dict(building_type='residential', sizing='velocity'),
         sizes={'SVC': '25×2.3', 'MAIN': '22×1'}),
    dict(id='anchor-unit-two-largest', note='external anchor A4 (r4, Y2-2): DIN 1988-300 utilisation unit - bath + basin, two largest draw-offs', q=0.44, q_circuit=0.22,
         anchor='SHK Profi 8/2012 (DIN 1988-300 utilisation units, example 1 TS 3: bath 0.15 + basin 0.07 = 0.22 l/s cold) - secondary source quoting DIN; total 0.30 + 0.14 = 0.44 l/s',
         zones=[dict(id='U', floor=0, units=1, fixtures={'bath': 1, 'basin': 1})], kw=dict(building_type='residential', circuit='cold', sizing='velocity'),
         sizes={'SVC': '25×2.3', 'MAIN': '18×1', 'B-U': '15×1'}),
    dict(id='anchor-no-size-v', note='external anchor A5 (r4, Y2-4): 15.3 l/s exceeds 2 m/s even in PE100 110x10', q=15.3, unsized=['SVC'],
         anchor='hand calculation: d_i >= sqrt(4 q / (pi v)) = 98.7 mm at 2 m/s (DIN 1988-300 service pipe and long-duration flow) > 90 mm, the largest PE100 SDR 11 bore',
         zones=[dict(id='P', floor=0, units=1, q_cont_lps=15.0, fixtures={'tap_utility': 1})], kw=dict(building_type='office', circuit='cold', sizing='velocity'),
         sizes={'SVC': '110×10'}),
    dict(id='anchor-showers-2ms', note='external anchor A3: simultaneous showers, 2 m/s for flows longer than 15 min', q=3.0,
         anchor='hand calculation: 10 x 0.30 l/s without simultaneity; 2 m/s limit for long-duration flow (DIN 1988-300 velocity limits)',
         zones=[dict(id='S', floor=0, units=1, simultaneous=True, fixtures={'shower': 10})], kw=dict(building_type='sports', din_curve='school', sizing='velocity'),
         sizes={'SVC': '63×5.8', 'MAIN': '54×1.5'}),
    dict(id='anchor-flats-en806-fig', note='external anchor A4: EN 806-3 Figure B.1, 60 LU with highest single 4 LU, by hand', q=0.9913,
         anchor='hand calculation from EN 806-3:2006 Annex B Fig. B.1 (4 LU line to 300 LU / 1.7 l/s) and the 2 m/s velocity of the simplified method; bores from EN 12201 / EN 1057',
         zones=[dict(id='F', floor=0, units=6, fixtures={'bath': 1, 'basin': 1, 'wc_cistern': 1, 'sink_kitchen': 1, 'washing_machine': 1})],
         kw=dict(building_type='residential', method='en806', sizing='velocity'),
         sizes={'SVC': '32×2.9', 'MAIN': '28×1', 'R0.C': '28×1', 'B-F.C': '28×1'}),
]


def main():
    cs = [
        case('flats24-4bar', 'preset: 24 flats, 4 bar — upsizing the critical path avoids a booster', flats(6, 4), p_supply_bar=4.0),
        case('flats24-3bar', 'preset: 24 flats, 3 bar — height + meter/filter/backflow need a booster', flats(6, 4), p_supply_bar=3.0),
        case('flats24-velocity', 'preset: velocity-only sizing asks for a large booster', flats(6, 4), p_supply_bar=4.0, sizing='velocity'),
        case('flats24-multilayer', 'preset: multilayer pipe', flats(6, 4), p_supply_bar=4.0, material='multilayer'),
        case('office-cistern', 'preset: office 8 floors, cisterns, cold', office(), building_type='office', p_supply_bar=4.0, circuit='cold', floor_height_m=3.6),
        case('office-flushvalve', 'preset: office 8 floors, flush valves', office(True), building_type='office', p_supply_bar=4.0, circuit='cold', floor_height_m=3.6),
        case('hotel120', 'preset: hotel 120 rooms', hotel(), building_type='hotel', p_supply_bar=3.5),
        case('hotel120-as-flats', 'hotel fixtures with residential constants', hotel(), building_type='residential', p_supply_bar=3.5),
        case('sports-showers', 'preset: team showers simultaneous (sports hall: no DIN constants, school curve chosen explicitly)', sports(), building_type='sports', din_curve='school', p_supply_bar=3.0, floor_height_m=4.0, main_length_m=30),
        case('sports-diversified', 'same showers wrongly diversified', [dict(z, simultaneous=False) for z in sports()], building_type='sports', din_curve='school', p_supply_bar=3.0, floor_height_m=4.0, main_length_m=30),
        case('flats-en806', 'EN 806-3 option', flats(6, 4), p_supply_bar=4.0, method='en806'),
        case('flats-hot', 'hot circuit incl. heater loss', flats(6, 4), p_supply_bar=4.0, circuit='hot'),
        case('flats-cold', 'cold circuit', flats(6, 4), p_supply_bar=4.0, circuit='cold'),
        case('house-1', 'single house, two floors', [dict(id='G', floor=0, units=1, fixtures={'wc_cistern': 1, 'sink_kitchen': 1, 'washing_machine': 1, 'tap_garden': 1}),
                                                   dict(id='U', floor=1, units=1, fixtures={'wc_cistern': 1, 'basin': 2, 'shower': 1, 'bath': 1})],
             p_supply_bar=3.0, service_length_m=10, main_length_m=5, branch_length_m=8),
        case('house-en806', 'single house, EN 806-3 option', [dict(id='G', floor=0, units=1, fixtures={'wc_cistern': 1, 'sink_kitchen': 1, 'washing_machine': 1, 'tap_garden': 1}),
                                                             dict(id='U', floor=1, units=1, fixtures={'wc_cistern': 1, 'basin': 2, 'shower': 1, 'bath': 1})],
             p_supply_bar=3.0, service_length_m=10, main_length_m=5, branch_length_m=8, method='en806'),
        case('stainless-hospital', 'hospital ward block, stainless', [dict(id='W%d' % f, floor=f, units=1, fixtures={'wc_cistern': 12, 'basin': 16, 'shower': 12, 'sink_kitchen': 2, 'tap_utility': 2}) for f in range(5)],
             building_type='hospital', material='stainless', p_supply_bar=4.5, floor_height_m=3.8),
        case('galvanised-school', 'school, galvanised steel', [dict(id='K%d' % f, floor=f, units=1, fixtures={'wc_cistern': 10, 'urinal_flush': 6, 'basin': 12, 'tap_utility': 1}) for f in range(3)],
             building_type='school', material='galvanised', p_supply_bar=3.5, floor_height_m=3.5),
        case('care-home', 'care home 4 floors', [dict(id='C%d' % f, floor=f, units=20, fixtures={'wc_cistern': 1, 'basin': 1, 'shower': 1}) for f in range(4)],
             building_type='care_home', p_supply_bar=3.5),
        case('tower-12', '12 floors, 5 bar', flats(12, 4), p_supply_bar=5.0),
        case('tower-12-low', '12 floors, 3.5 bar', flats(12, 4), p_supply_bar=3.5),
        case('flats-highfloor', 'zones only on floors 3-5 (riser passes empty floors)', flats(6, 4, start=3), p_supply_bar=4.0),
        case('cont-flow', 'office with a 0.5 l/s process flow', [dict(z, q_cont_lps=0.5 if z['id'] == 'O0' else 0) for z in office()], building_type='office', p_supply_bar=4.0, circuit='cold', floor_height_m=3.6),
        case('vmax-low', 'velocity limits 1.5 m/s everywhere', flats(6, 4), p_supply_bar=4.0, sizing='velocity', vmax={'service': 1.5, 'main': 1.5, 'riser': 1.5, 'branch': 1.5}),
        case('hotel-core-fixtures', 'hotel with large shower heads and a commercial kitchen (fixtures only in the package library)', [dict(id='H%d' % f, floor=f, units=20, fixtures={'wc_cistern': 1, 'basin': 1, 'shower_large_head': 1}) for f in range(1, 5)] + [dict(id='K0', floor=0, units=1, fixtures={'sink_commercial': 4, 'dishwasher_com': 2, 'cleaner_sink': 2})], building_type='hotel', p_supply_bar=4.0),
        case('care-bedpan', 'care home with bedpan washers and slop sinks', [dict(id='C%d' % f, floor=f, units=1, fixtures={'wc_cistern': 20, 'basin': 20, 'shower': 20, 'bedpan_washer': 2, 'slop_sink': 1}) for f in range(4)], building_type='care_home', p_supply_bar=4.0),
        case('basement', 'basement zone on floor -1 (riser starts in the basement)', [dict(id='KB', floor=-1, units=1, fixtures={'wc_cistern': 2, 'basin': 2, 'tap_utility': 1})] + flats(4, 2), p_supply_bar=3.5),
        case('office-hot', 'office hot circuit: service and main carry cold + hot', office(), building_type='office', p_supply_bar=4.5, circuit='hot', floor_height_m=3.6),
        case('restaurant-en806', 'restaurant (no DIN constants) with the EN 806-3 method', [dict(id='R0', floor=0, units=1, fixtures={'sink_commercial': 3, 'dishwasher_com': 1, 'wc_cistern': 4, 'basin': 4, 'urinal_flush': 2})], building_type='restaurant', method='en806', p_supply_bar=3.0, service_length_m=10, main_length_m=10),
        case('long-service', '60 m service pipe', flats(4, 2), p_supply_bar=3.0, service_length_m=60),
        case('high-zeta', 'branches with Σζ 20', flats(4, 2), p_supply_bar=3.5, branch_zeta=20),
        case('warm-cold', 'cold water at 25 °C', flats(6, 4), p_supply_bar=4.0, T_cold_c=25),
        case('flush-house', 'small house with a flush-valve WC', [dict(id='G', floor=0, units=1, fixtures={'wc_flushvalve': 1, 'basin': 1})], p_supply_bar=2.5, service_length_m=10, main_length_m=5, branch_length_m=6),
        # r4 Y2-1: METHOD §0.12 worked example - 'total' checks the cold and the hot system downstream of the heater tee
        case('y21-shower-total', 'r4 Y2-1: one ground-floor shower, 2.0 bar, default total circuit - the hot path behind the heater governs', [dict(id='Z1', floor=0, units=1, fixtures={'shower': 1})],
             p_supply_bar=2.0, service_length_m=5, main_length_m=5, branch_length_m=2, service_zeta=1, main_zeta=1, branch_zeta=1, riser_zeta=0.2, meter_level_m=0.0),
        case('y21-shower-velocity', 'r4 Y2-1: same, velocity sizing - hot path short of pressure, booster', [dict(id='Z1', floor=0, units=1, fixtures={'shower': 1})],
             p_supply_bar=2.0, service_length_m=5, main_length_m=5, branch_length_m=2, service_zeta=1, main_zeta=1, branch_zeta=1, riser_zeta=0.2, meter_level_m=0.0, sizing='velocity'),
        case('y21-office-coldonly', 'r4 Y2-1: total circuit, zones with cold draw-offs only -> no hot system', [dict(id='W%d' % f, floor=f, units=1, fixtures={'wc_cistern': 4, 'urinal_flush': 2}) for f in range(3)],
             building_type='office', p_supply_bar=3.5),
        # r4 Y2-2: utilisation unit floor (two largest after the DIN exclusions)
        case('y22-bathroom', 'r4 Y2-2: one bathroom shower + basin + WC, total 0.57 l/s -> 0.44 l/s (curve 0.390)', [dict(id='U', floor=0, units=1, fixtures={'shower': 1, 'basin': 1, 'wc_cistern': 1})]),
        case('y22-exclusions', 'r4 Y2-2: one flat with bath, shower, 2 basins, bidet - exclusions in the two-largest pick', [dict(id='U', floor=1, units=1, fixtures={'bath': 1, 'shower': 1, 'basin': 2, 'bidet': 1, 'wc_cistern': 1})], circuit='cold'),
        case('y22-house-units', 'r4 Y2-2: small flat WC + basin - every segment serves one unit', [dict(id='G', floor=0, units=1, fixtures={'wc_cistern': 1, 'basin': 1})], p_supply_bar=3.0),
        # r4 Y2-4: no size within the velocity limit
        case('y24-unsized', 'r4 Y2-4: 15 l/s process flow - service pipe unsized at 2 m/s', [dict(id='P', floor=0, units=1, q_cont_lps=15.0, fixtures={'tap_utility': 1})], building_type='office', circuit='cold'),
        case('allowance-0', 'booster case, zero friction allowance', flats(6, 4), p_supply_bar=3.0, friction_allowance_bar=0.0),
        # X1-1: fractional counts are input errors (no rounding that could undersize the pipe)
        bad_case('bad-fixture-fraction', 'X1-1: 1.9 showers in a zone -> fixture_count error, not 1 shower',
                 [dict(id='Z1', floor=0, units=1, fixtures={'shower': 1.9})]),
        bad_case('bad-units-fraction', 'X1-1: 2.5 identical units -> range:zone.units error, not 3 units',
                 [dict(id='Z1', floor=0, units=2.5, fixtures={'wc_cistern': 1, 'basin': 1, 'shower': 1})]),
        bad_case('bad-floor-fraction', 'X1-1: floor 1.5 -> range:zone.floor error, not floor 2',
                 [dict(id='Z1', floor=1.5, units=1, fixtures={'wc_cistern': 1, 'basin': 1})]),
    ]
    for a in ANCHORS:
        c = copy.deepcopy(BASE)
        c.update(a['kw'])
        c['zones'] = a['zones']
        got = compute(c)
        assert abs(got['q_design_lps'] - a['q']) <= 5e-4 * max(1, a['q']), (a['id'], got['q_design_lps'], a['q'])
        for k, v in a['sizes'].items():
            assert got['sizes'][k] == v, (a['id'], k, got['sizes'][k], v)
        exp = {'q_design_lps': a['q'], 'sizes': a['sizes']}
        if 'q_circuit' in a:
            assert abs(got['q_circuit_lps'] - a['q_circuit']) <= 5e-4, (a['id'], got['q_circuit_lps'])
            exp['q_circuit_lps'] = a['q_circuit']
        if 'unsized' in a:
            assert got['unsized'] == a['unsized'] and not got['ok'], (a['id'], got['unsized'])
            exp['unsized'] = a['unsized']
        cs.append(dict(id=a['id'], note=a['note'], anchor=a['anchor'], input=c, expect=exp))
    # A6 (Y2-1 worked example): hand static reserve of the hot path, and the hot branch governs
    y = next(x for x in cs if x['id'] == 'y21-shower-velocity')['expect']
    assert abs(y['static_margin_bar'] - 0.0036) < 1e-4 and y['worst_branch'] == 'B-Z1.H' and y['booster'], y
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'plbsupply_ref.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(cs, f, indent=1, ensure_ascii=False)
    print('plbsupply ref: %d cases (%d external anchors, %d invalid inputs) -> %s' % (len(cs), len(ANCHORS), sum(1 for x in cs if x['expect'].get('valid') is False), out))


if __name__ == '__main__':
    main()
