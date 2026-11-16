"""Independent reference for lifttraffic (Lift Traffic Design, round-trip time).

Written from the published method, not from vt-core.js / vt-traffic.js:
  * Up-peak round-trip time (CIBSE Guide D 2020 ch. 4; G. Barney & L. Al-Sharif, Elevator Traffic
    Handbook, 2nd ed. 2016; ISO 8100-32:2020):
      S = N - sum_i (1 - U_i)^P                      (probable stops, unequal populations)
      H = N - sum_{j=1}^{N-1} (sum_{i<=j} U_i)^P     (highest reversal floor, Al-Sharif)
      t_v = d_f / v ; t_s = t_f(d_f) - t_v + t_sd + t_o + t_c
      RTT = 2 H t_v + 2 d_express / v + (S + 1) t_s + 2 P t_p
      INT = RTT / L ; HC5 = 300 P L / RTT ; %POP = 100 HC5 / POP
      AWT = INT (0.4 + (1.8 P/CC - 0.77)^2) for 0.5 <= P/CC (<= 0.8), 0.4 INT below 0.5; flag below_range (< 0.5),
      above_range (> 0.8, formula extrapolated), ok otherwise
      ATT = 0.5 H t_v + d_express / v + 0.5 S t_s + P t_p   (average travel time, Barney ch. 5 / CIBSE D 4.x; the express
      run is added once, one way);  AJT = AWT + ATT
    Here S and H are evaluated as expectations by direct enumeration over floors for unequal populations and
    cross-checked against the classical equal-population closed forms; P = 0.8 CC, CC = floor(Q / 75) (EN 81-20 5.4.2).
  * Flight time over a distance d for a jerk-limited S-curve (R. D. Peters, Ideal lift kinematics, 1996):
      case 1 (rated speed reached):  t = d/v + v/a + a/j
      case 2 (acceleration reached, speed not): v_p from d = v_p (v_p/a + a/j), t = 2 (v_p/a + a/j)
      case 3 (neither): t = 4 (d / (2 j))^(1/3)
    written as closed forms here (the tool integrates a 7-segment jerk profile).
  * Sizing: the same grid (1-8 cars x 630-2000 kg x 1-6 m/s; hospital: bed lifts >= 2500 kg only, ISO 8100-30 class III /
    HTM 08-02), speed counted only if reachable within the travel, fewest cars first, then fully green, then smaller
    load, then slower speed.
  * Zoning: brute force over every contiguous split into 1, 2, 3 zones (>= 2 floors each) and EVERY allocation of
    the cars (>= 2 cars per zone when zoned); ranking verdict, weakest zone %POP, longest interval. Since run 2 the tool
    enumerates the allocations too (D-VT-11), so an exact match is expected by design.
RESTATED TOOL CONVENTIONS (CR-16) — these are NOT independent of the tool; a shared error in them would pass here:
  * the criteria table per building use and the AWT light rule (green <= 0.8 awt_max) — learning assumptions of the tool;
  * the up-peak geometry (D-VT-13): main terminal = served lobby; zone = every served floor above it, also zero-population
    floors (they count for N and d_f); d_f = (top - first zone level) / (n - 1); express = first zone level - main - d_f;
    a one-floor zone uses max(0.1, its height above the main terminal);
  * the sizing grid, its sort order and the hospital minimum load; the zoning ranking key.
Only the formulas above (S, H, RTT, INT, HC5, AWT, ATT, flight time) are restated from the literature; they are also
checked against PUBLISHED worked examples (kind 'published', tolerance 0.5 %, see PUBLISHED below).
Cases: the shared preset buildings (restated here so a silent change shows as drift) + a synthetic grid incl. load
factors 0.4 / 0.5 / 0.6 / 0.8 / 0.9 (every AWT branch) + the published examples.

Run:  python -I bench-src/ref/gen_lifttraffic.py  -> bench-src/ref/lifttraffic_ref.json
"""
import json
import math
import os
import itertools

HERE = os.path.dirname(os.path.abspath(__file__))

CRITERIA = {
    'office': dict(hc5_min=12, hc5_good=15, int_max=30, int_good=25, awt_max=25),
    'residential': dict(hc5_min=5, hc5_good=7, int_max=60, int_good=45, awt_max=40),
    'hotel': dict(hc5_min=10, hc5_good=12, int_max=40, int_good=30, awt_max=30),
    'hospital': dict(hc5_min=8, hc5_good=10, int_max=50, int_good=40, awt_max=35),
    'mixed': dict(hc5_min=11, hc5_good=13, int_max=35, int_good=30, awt_max=30),
}
LOADS = [630, 800, 1000, 1275, 1600, 1800, 2000]
SPEEDS = [1.0, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0]
CARS = [1, 2, 3, 4, 5, 6, 7, 8]
MIN_LOAD = {'hospital': 2500}   # bed lift, ISO 8100-30 class III; HTM 08-02 (restated tool convention)


def loads_for(use):
    m = MIN_LOAD.get(use, 0)
    return sorted(set([q for q in LOADS + ([2500] if m else []) if q >= m]))


# ---------------------------------------------------------------- kinematics (Peters closed forms)
def flight(d, v, a, j):
    if d <= 0:
        return 0.0
    a_eff = min(a, math.sqrt(v * j))           # a is not reached before v when v < a^2/j
    d_full = v * v / a_eff + v * a_eff / j
    if d >= d_full:
        return d / v + v / a_eff + a_eff / j
    if d >= 2 * a ** 3 / j ** 2:
        vp = (-a * a / j + math.sqrt((a * a / j) ** 2 + 4 * a * d)) / 2
        return 2 * (vp / a + a / j)
    return 4 * (d / (2 * j)) ** (1.0 / 3.0)


def reach(v, a, j):
    a_eff = min(a, math.sqrt(v * j))
    return v * v / a_eff + v * a_eff / j


def peak_speed(d, v, a, j):
    a_eff = min(a, math.sqrt(v * j))
    if d >= v * v / a_eff + v * a_eff / j:
        return v
    if d >= 2 * a ** 3 / j ** 2:
        return (-a * a / j + math.sqrt((a * a / j) ** 2 + 4 * a * d)) / 2
    return (d * math.sqrt(j) / 2) ** (2.0 / 3.0)


# ---------------------------------------------------------------- S and H
def stops_reversal(pops, P):
    N = len(pops)
    tot = sum(max(0.0, p) for p in pops)
    U = [max(0.0, p) / tot for p in pops]
    # expected number of floors with at least one passenger: sum of P(floor i chosen by someone)
    S = sum(1.0 - (1.0 - u) ** P for u in U)
    # expected highest floor: sum over j of P(highest >= j) = sum_{j=1}^{N} (1 - P(all <= j-1))
    H = 0.0
    cum = 0.0
    for jj in range(1, N + 1):
        H += 1.0 - (cum ** P if jj > 1 else 0.0)
        cum += U[jj - 1]
    return S, H


def equal_closed(N, P):
    S = N * (1 - (1 - 1.0 / N) ** P)
    H = N - sum((i / N) ** P for i in range(1, N))
    return S, H


def light(use, kind, value):
    c = CRITERIA.get(use, CRITERIA['office'])
    if value is None:
        return 'grey'
    if kind == 'hc5':
        return 'green' if value >= c['hc5_good'] else 'amber' if value >= c['hc5_min'] else 'red'
    if kind == 'int':
        return 'green' if value <= c['int_good'] else 'amber' if value <= c['int_max'] else 'red'
    return 'green' if value <= c['awt_max'] * 0.8 else 'amber' if value <= c['awt_max'] else 'red'


def verdict(hc, it):
    if hc == 'red' or it == 'red':
        return 'fails'
    return 'meets' if hc == 'green' and it == 'green' else 'marginal'


def up_peak(pops, n, Q, v, a, j, df, ex, to, tc, tsd, tp, lf=0.8, CC=None):
    CC = int(math.floor(Q / 75.0 + 1e-9)) if CC is None else CC
    P = lf * CC
    S, H = stops_reversal(pops, P)
    tv = df / v
    tf1 = flight(df, v, a, j)
    ts = tf1 - tv + tsd + to + tc
    rtt = 2 * H * tv + 2 * ex / v + (S + 1) * ts + 2 * P * tp
    POP = sum(pops)
    INT = rtt / n
    HC5 = 300 * P * n / rtt
    pct = 100 * HC5 / POP
    r = P / CC
    awt = 0.4 * INT if r < 0.5 else INT * (0.4 + (1.8 * r - 0.77) ** 2)
    flag = 'below_range' if r < 0.5 else 'above_range' if r > 0.8 + 1e-9 else 'ok'
    att = 0.5 * H * tv + ex / v + 0.5 * S * ts + P * tp
    return dict(S=S, H=H, RTT=rtt, INT=INT, HC5=HC5, pctPOP=pct, AWT=awt, awt_flag=flag, ATT=att, AJT=awt + att, P=P, CC=CC, POP=POP,
                travel=2 * H * tv + 2 * ex / v, stops=(S + 1) * (tf1 - tv + tsd), doors=(S + 1) * (to + tc), transfer=2 * P * tp)


# ---------------------------------------------------------------- preset buildings restated
def r2(x):
    return math.floor(x * 100 + 0.5) / 100


def stack(k0, k1, level0, step, role, pop):
    return [('F%d' % k, r2(level0 + (k - k0) * step), role, pop) for k in range(k0, k1 + 1)]


CAR = dict(Q=1275, v=2.5, a=1.0, j=1.5, to=2.0, tc=3.0, tsd=0.5)


def car(**kw):
    c = dict(CAR)
    c.update(kw)
    return c


def preset_buildings():
    B = {}
    f15 = [('P-1', -3.5, 'parking', 0), ('F0', 0.0, 'lobby', 0), ('F1', 4.5, 'canteen', 0)] + stack(2, 15, 8.25, 3.75, 'office', 100)
    B['office15'] = dict(use='office', presence=0.85, floors=f15, tp=1.2, groups=[('A', [f[0] for f in f15], 6, car())])
    f30 = [('F0', 0.0, 'lobby', 0)] + stack(1, 30, 4.5, 3.75, 'office', 90)
    B['office30_zoned'] = dict(use='office', presence=0.85, floors=f30, tp=1.2, groups=[
        ('L', ['F0'] + ['F%d' % k for k in range(1, 16)], 6, car(v=2.5)),
        ('H', ['F0'] + ['F%d' % k for k in range(16, 31)], 6, car(v=4.0))])
    B['office30_onegroup'] = dict(use='office', presence=0.85, floors=f30, tp=1.2, groups=[('A', [f[0] for f in f30], 12, car(v=4.0))])
    fr = [('F0', 0.0, 'lobby', 0)] + stack(1, 10, 3.2, 3.0, 'residential', 25)
    rc = car(Q=630, v=1.0, a=0.7, j=1.0, to=2.5, tc=3.5)
    B['residential10'] = dict(use='residential', presence=0.9, floors=fr, tp=1.2, groups=[('A', [f[0] for f in fr], 1, rc)])
    B['residential10_2'] = dict(use='residential', presence=0.9, floors=fr, tp=1.2, groups=[('A', [f[0] for f in fr], 2, rc)])
    fh = [('F0', 0.0, 'lobby', 0), ('F1', 5.0, 'canteen', 0)] + stack(2, 20, 8.5, 3.3, 'hotel', 36)
    B['hotel20'] = dict(use='hotel', presence=0.8, floors=fh, tp=1.2, groups=[('A', [f[0] for f in fh], 4, car())])
    fho = [('F0', 0.0, 'lobby', 0)] + stack(1, 8, 5.0, 4.2, 'ward', 60)
    B['hospital8'] = dict(use='hospital', presence=1.0, floors=fho, tp=2.0, groups=[('A', [f[0] for f in fho], 3, car(Q=2500, v=1.6, a=0.8, j=1.0, to=3.5, tc=5.0))])
    fc = [('F0', 0.0, 'lobby', 0)] + stack(1, 12, 4.5, 3.75, 'office', 100) + [('F13', 49.5, 'canteen', 0)]
    B['campus_canteen'] = dict(use='office', presence=0.85, floors=fc, tp=1.2, groups=[('A', [f[0] for f in fc], 5, car())])
    return B


def zone_of(b, served):
    fl = [f for f in b['floors'] if f[0] in served]
    main = [f for f in fl if f[2] == 'lobby'][0]
    above = [f for f in fl if f[1] > main[1]]
    return main, above


def zone_geometry(main, block):
    if len(block) > 1:
        df = (block[-1][1] - block[0][1]) / (len(block) - 1)
    else:
        df = max(0.1, block[0][1] - main[1])
    ex = max(0.0, block[0][1] - main[1] - df)
    return df, ex


def group_case(b, g):
    gid, served, n, c = g
    main, above = zone_of(b, served)
    pops = [f[3] * b['presence'] for f in above]
    df, ex = zone_geometry(main, above)
    r = up_peak(pops, n, c['Q'], c['v'], c['a'], c['j'], df, ex, c['to'], c['tc'], c['tsd'], b['tp'])
    r['lights'] = dict(hc5=light(b['use'], 'hc5', r['pctPOP']), int=light(b['use'], 'int', r['INT']), awt=light(b['use'], 'awt', r['AWT']))
    r['verdict'] = verdict(r['lights']['hc5'], r['lights']['int'])
    return r, main, above, pops, df, ex


def sizing(b, g):
    gid, served, n, c = g
    main, above = zone_of(b, served)
    pops = [f[3] * b['presence'] for f in above]
    df, ex = zone_geometry(main, above)
    travel = above[-1][1] - main[1]
    feas = []
    for nn in CARS:
        for q in loads_for(b['use']):
            for v in SPEEDS:
                r = up_peak(pops, nn, q, v, c['a'], c['j'], df, ex, c['to'], c['tc'], c['tsd'], b['tp'])
                hc, it = light(b['use'], 'hc5', r['pctPOP']), light(b['use'], 'int', r['INT'])
                vd = verdict(hc, it)
                ok_reach = travel >= reach(v, c['a'], c['j'])
                if vd != 'fails' and ok_reach:
                    feas.append((nn, 0 if vd == 'meets' else 1, q, v))
    feas.sort()
    best = feas[0] if feas else None
    return dict(n_feasible=len(feas), best=None if not best else dict(n=best[0], load=best[2], speed=best[3]))


VR = {'meets': 2, 'marginal': 1, 'fails': 0}


def zoning(b, g, speed_high=None, cars_total=None, min_cars=2, min_floors=2):
    gid, served, n, c = g
    main, above = zone_of(b, served)
    N = len(above)
    nt = cars_total or n
    vh = speed_high or c['v']
    out = {}
    for k in (1, 2, 3):
        if k * min_floors > N or (k > 1 and k * min_cars > nt):
            continue
        best = None
        for cuts in itertools.combinations(range(1, N), k - 1):
            bounds = (0,) + cuts + (N,)
            blocks = [above[bounds[i]:bounds[i + 1]] for i in range(k)]
            if any(len(bl) < min_floors or sum(f[3] for f in bl) <= 0 for bl in blocks):
                continue
            zs = []
            for i, bl in enumerate(blocks):
                df, ex = zone_geometry(main, bl)
                pops = [f[3] * b['presence'] for f in bl]
                zs.append((pops, df, ex, c['v'] if i == 0 else vh))
            m0 = 1 if k == 1 else min_cars
            for alloc in itertools.product(range(m0, nt + 1), repeat=k):
                if sum(alloc) != nt:
                    continue
                pcts, ints = [], []
                for (pops, df, ex, v), L in zip(zs, alloc):
                    r = up_peak(pops, L, c['Q'], v, c['a'], c['j'], df, ex, c['to'], c['tc'], c['tsd'], b['tp'])
                    pcts.append(r['pctPOP'])
                    ints.append(r['INT'])
                pmin, imax = min(pcts), max(ints)
                vd = verdict(light(b['use'], 'hc5', pmin), light(b['use'], 'int', imax))
                key = (VR[vd], round(pmin, 9), -round(imax, 9))
                if best is None or key > best[0]:
                    best = (key, dict(k=k, verdict=vd, pct_min=pmin, INT_max=imax, cars=list(alloc), splits=[bl[0][0] + '-' + bl[-1][0] for bl in blocks]))
        if best:
            out[str(k)] = best[1]
    return out


# ---------------------------------------------------------------- published worked examples (CR-16)
# Each entry: the inputs and the results exactly as printed in the source; checked against the tool at 0.5 %.
CIBSE_SRC = ('CIBSE Guide D 2025, ch. 3 (R. Peters / CIBSE Society of Vertical Transportation): official up-peak calculation '
             'spreadsheet "cibse-guide-4-2025-uppeak-calculation.xlsx", sheet "Input and Results" B5:C42 and C47:C56 '
             '(Guide D 2025 Fig. 3.4 "Example 2: spreadsheet implementing sections 3.4 to 3.6"), '
             'https://www.cibse.org/media/rgrpbvqg/cibse-guide-4-2025-uppeak-calculation.xlsx')
# Office, N = 14 floors of equal population (U = 672), d_f = 3.89 m, 1000 kg, v 2.5 m/s, a 0.8 m/s2, j 0.5 m/s3, t_sd 0.5 s,
# t_o 1.8 s, t_c 2.8 s, t_p 1 s, no express zone, L = 5 cars; P = 8.064 from the demand (80.64 persons / 5 min, 10 intervals).
# Convention of the sheet: t_f(1) = (32 d_f / j)^(1/3) + t_sd (Peters case C incl. start delay) and t_s = t_c + t_sd + t_f(1)
# + t_o - t_v, so t_sd counts twice; the tool (t_s = t_f - t_v + t_sd + t_o + t_c with t_f without delay) reproduces the
# sheet with start_delay_s = 2 x 0.5 = 1.0 s. Stated, not hidden: it is the only adjustment.
_CIBSE_IN = dict(populations=[48.0] * 14, n_cars=5, rated_load_kg=1000, speed=2.5, accel=0.8, jerk=0.5, floor_height_m=3.89,
                 express_m=0.0, door_open_s=1.8, door_close_s=2.8, start_delay_s=1.0, transfer_s=1.0)
PUBLISHED = [
    dict(id='cibse_d_2025_uppeak', source=CIBSE_SRC, inputs=dict(_CIBSE_IN, P=8.064),
         ref=dict(t_s=10.334857655628067, S=6.298226383292417, H=12.907602471534553, RTT=131.7225897012919,
                  INT=26.344517940258378, HC5=91.82935157462491, pctPOP=13.665082079557278),
         note='%UPPHC printed as the fraction 0.13665082079557278 -> 13.665 %'),
    dict(id='cibse_d_2025_uppeak_improved', source=CIBSE_SRC, inputs=dict(_CIBSE_IN, P=7.064),
         ref=dict(S=5.705782258930295, H=12.721950899887457, RTT=123.0220163161304, INT=24.604403263226082),
         note='"improved design" rows (P derated by 1); the sheet\'s capacity of this row (80.44) uses another P basis and is not compared'),
]


def _check_published():
    """the reference's own formulas must reproduce the published numbers (independent of the tool)"""
    for e in PUBLISHED:
        i = e['inputs']
        cc = int(i['rated_load_kg'] // 75)
        r = up_peak(i['populations'], i['n_cars'], i['rated_load_kg'], i['speed'], i['accel'], i['jerk'], i['floor_height_m'], i['express_m'],
                    i['door_open_s'], i['door_close_s'], i['start_delay_s'], i['transfer_s'], lf=i['P'] / cc, CC=cc)
        r['t_s'] = flight(i['floor_height_m'], i['speed'], i['accel'], i['jerk']) - i['floor_height_m'] / i['speed'] + i['start_delay_s'] + i['door_open_s'] + i['door_close_s']
        for k, v in e['ref'].items():
            assert abs(r[k] - v) <= 1e-6 * abs(v), (e['id'], k, r[k], v)


def published_case(e):
    return dict(id='published:' + e['id'], kind='published', source=e['source'], inputs=e['inputs'], ref=e['ref'], note=e.get('note', ''))


def main():
    _check_published()
    cases = []
    B = preset_buildings()
    for pid, b in B.items():
        for g in b['groups']:
            r, mn, above, pops, df, ex = group_case(b, g)
            ref = dict(S=r['S'], H=r['H'], RTT=r['RTT'], INT=r['INT'], HC5=r['HC5'], pctPOP=r['pctPOP'], AWT=r['AWT'],
                       awt_flag=r['awt_flag'], ATT=r['ATT'], AJT=r['AJT'], travel=r['travel'], stops=r['stops'], doors=r['doors'], transfer=r['transfer'], verdict=r['verdict'])
            ref['sizing'] = sizing(b, g)
            ref['zoning'] = zoning(b, g)
            cases.append(dict(id=pid + ':' + g[0], kind='preset', preset=pid, group=g[0],
                              restated=dict(use=b['use'], presence=b['presence'], transfer_s=b['tp'], floors=[list(f) for f in b['floors']], served=g[1], cars=g[2], car=g[3]),
                              ref=ref))
    # synthetic grid on VTCore.upPeak directly
    for N in (5, 12, 25):
        for shape in ('equal', 'rising'):
            pops = [80.0] * N if shape == 'equal' else [40.0 + 10.0 * i for i in range(N)]
            for v, a, j in ((1.0, 0.8, 1.0), (2.5, 1.0, 1.5), (6.0, 1.2, 2.0)):
                for df, ex in ((3.3, 0.0), (4.5, 40.0)):
                    for Q, n, lf in ((630, 2, 0.8), (1600, 6, 0.6), (1000, 3, 0.4), (1275, 4, 0.5), (2000, 8, 0.9)):
                        inp = dict(populations=pops, n_cars=n, rated_load_kg=Q, P=lf * int(Q // 75), speed=v, accel=a, jerk=j, floor_height_m=df, express_m=ex,
                                   door_open_s=1.8, door_close_s=2.9, start_delay_s=0.4, transfer_s=1.1)
                        r = up_peak(pops, n, Q, v, a, j, df, ex, 1.8, 2.9, 0.4, 1.1, lf=lf)
                        if shape == 'equal':
                            Se, He = equal_closed(N, r['P'])
                            assert abs(Se - r['S']) < 1e-9 and abs(He - r['H']) < 1e-9, 'closed forms'
                        cases.append(dict(id='grid:N%d:%s:v%g:df%g:ex%g:Q%d:lf%g' % (N, shape, v, df, ex, Q, lf), kind='grid', inputs=inp,
                                          ref=dict(S=r['S'], H=r['H'], RTT=r['RTT'], INT=r['INT'], HC5=r['HC5'], pctPOP=r['pctPOP'], AWT=r['AWT'],
                                                   awt_flag=r['awt_flag'], ATT=r['ATT'], AJT=r['AJT'])))
    for ex_ in PUBLISHED:
        cases.append(published_case(ex_))
    kin = []
    for v, a, j in ((1.0, 0.7, 1.0), (1.6, 0.8, 1.0), (2.5, 1.0, 1.5), (4.0, 1.0, 1.5), (6.0, 1.2, 2.0), (0.63, 1.0, 1.0)):
        for d in (0.2, 1.0, 3.0, 3.75, 4.5, 7.5, 15.0, 37.5, 120.0):
            kin.append(dict(v=v, a=a, j=j, d=d, t=flight(d, v, a, j), vp=peak_speed(d, v, a, j)))
    out = dict(generator='bench-src/ref/gen_lifttraffic.py', cases=cases, kinematics=kin)
    with open(os.path.join(HERE, 'lifttraffic_ref.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)
    print('cases', len(cases), 'kinematics', len(kin))


if __name__ == '__main__':
    main()
