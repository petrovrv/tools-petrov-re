"""Reference for plbdhw.html (model plbdhw-1.3 rev 2; r4: exact event boundaries, the design peak = excess above the step mean
once a day at the worst moment, its energy in the daily balance, DVGW 3-litre rule; run 2: DVGW W 551 class).

Consistency with the published method _plb/dhw/METHOD.md (written from the equations, not from plb-dhw.js) plus
external anchors (D-PLB-10): hand-computed cases whose expected values are derived in anchors() by arithmetic from the
energy balance (EN 12831-3 cumulative demand/supply principle), the Ecodesign 814/2013 standing-loss formula and
the DVGW W 551 400 L / 3 L definition, independent of the Model class. The hourly profile shapes are input
data and are read from plbdhw_shapes.json (a dump of PLBDhw.SHAPES). Where the page uses a running (Kadane)
maximum for the cyclic deficit, this file enumerates every cyclic window explicitly; the fixed point and the
bisection are re-derived from the equations.

Writes plbdhw_ref.json: a list of cases {id, note, state, expect}.
Run: python -I bench-src/ref/gen_plbdhw.py
"""
import json
import math
import bisect
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

SHAPES = json.loads(Path(ref('plbdhw_shapes.json')).read_text(encoding='utf-8'))['shapes']
CW = 1.163            # Wh/(L K)
N, DT = 96, 0.25
NOMINAL = [80, 100, 120, 150, 200, 300, 400, 500, 750, 800, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000]
BASE = dict(type='residential', units=55, l_per_unit=70, events=[], t_cold=10, t_use=40, t_store=60, f_use=0.9,
            heater='boiler', mode='power', p_kw=30, v_l=1000, t_hp_max=55, p_boost_kw=0, win_start=0, win_end=0,
            loss_mode='ecodesign', loss_w=100, circ_w=0, q_peak_lps=1.0, t_peak_min=10, v_pipe_l=None)


def draw_kwh(s):
    """METHOD §3.1: litres per 15-min step, then kWh."""
    litres = [0.0] * N
    sh = SHAPES[s['type']]
    tot = s['units'] * s['l_per_unit']
    for i in range(N):
        litres[i] += tot * sh[i // 4] / 4.0
    for e in s['events']:
        start, dur, vol = e['start_h'] % 24.0, e['dur_h'], e['litres']
        if dur <= 0 or vol <= 0:
            continue
        # unwrap the event onto a 3-day axis and fold back
        for day in (-1, 0, 1, 2):
            a, b = start + 24 * day, start + 24 * day + dur
            for i in range(N):
                lo, hi = i * DT, (i + 1) * DT
                ov = min(hi, b) - max(lo, a)
                if ov > 0:
                    litres[i] += vol / dur * ov
    e_per_l = CW * (s['t_use'] - s['t_cold']) / 1000.0
    return [x * e_per_l for x in litres], litres


def avail(s):
    a, b = s['win_start'] % 24, s['win_end'] % 24
    out = []
    for i in range(N):
        t = (i + 0.5) * DT
        if a == b:
            out.append(1)
        elif a < b:
            out.append(1 if a <= t < b else 0)
        else:
            out.append(1 if (t >= a or t < b) else 0)
    return out


def ecodesign(V, te):
    return 0.0 if V <= 0 else (16.66 + 8.33 * V ** 0.4) * max(0.0, te - 20.0) / 45.0


def cyclic_max_deficit(x):
    """max over every cyclic window (length 1..N) of the window sum, at least 0 — brute force with prefix sums."""
    xx = x + x
    pre = [0.0]
    for v in xx:
        pre.append(pre[-1] + v)
    best = 0.0
    for j in range(N):
        for k in range(j + 1, j + N + 1):
            w = pre[k] - pre[j]
            if w > best:
                best = w
    return best


class Model:
    def __init__(self, s):
        self.s = s
        self.D, self.L = draw_kwh(s)
        self.A = avail(s)
        self.h = sum(self.A) * DT
        hp = s['heater'] == 'heatpump'
        self.flags = []
        te = s['t_store']
        if hp and s['t_store'] > s['t_hp_max'] and not s['p_boost_kw'] > 0:
            te = s['t_hp_max']
            self.flags.append('hp_cannot_reach')
        self.te = te
        a = (s['t_hp_max'] - s['t_cold']) / (te - s['t_cold']) if (hp and te > s['t_hp_max']) else 1.0
        self.a = min(1.0, max(0.0, a))
        self.pinst = s['q_peak_lps'] * 3600 * CW * (s['t_use'] - s['t_cold']) / 1000.0
        # METHOD §3.7 (1.3 rev 2): excess power of the peak in step i = max(0, P_inst - D_i/dt) where the step draws, 0 where it
        # does not, P_inst everywhere if the day has no draw at all; the peak lasts T = t_peak/60 h once a day
        self.T = s['t_peak_min'] / 60.0 if (self.pinst > 0 and s['t_peak_min'] > 0) else 0.0
        anyd = any(d > 1e-12 for d in self.D)
        self.ex = [(max(0.0, self.pinst - d / DT) if d > 1e-12 else 0.0) if anyd else self.pinst for d in self.D] if self.T > 0 else [0.0] * N
        self._pieces = self.breakpoints()
        self.cands = self.peak_starts()
        # Y3-3: the daily balance carries the largest excess energy the one daily peak can bring
        self.epk = max([self.excess(t, t + self.T) for t in self.cands] + [0.0]) if self.T > 0 else 0.0
        e_per_l = CW * (s['t_use'] - s['t_cold']) / 1000.0
        self.lpk = self.epk / e_per_l if e_per_l > 0 else 0.0
        self.eday = sum(self.D) + self.epk

    def peff(self, p):
        a = self.a
        if a >= 1:
            return p
        if a <= 0:
            return self.s['p_boost_kw']
        return min(p / a, self.s['p_boost_kw'] / (1 - a))

    def breakpoints(self):
        """METHOD §3.1/§3.7 (1.3): one day split at every 15-min step boundary and every draw-event start/end (wrapped);
        inside a piece the base draw (hourly share, uniform in the hour), the event draws and the availability are constant."""
        s = self.s
        pts = {round(i * DT, 12) for i in range(N + 1)}
        for e in s['events']:
            if e['dur_h'] > 0 and e['litres'] > 0:
                pts.add(round(e['start_h'] % 24.0, 12))
                pts.add(round((e['start_h'] + e['dur_h']) % 24.0, 12))
        pts = sorted(pts)
        e_per_l = CW * (s['t_use'] - s['t_cold']) / 1000.0
        sh = SHAPES[s['type']]
        pieces = []
        for a, b in zip(pts[:-1], pts[1:]):
            if b - a < 1e-9:
                continue
            mid = 0.5 * (a + b)
            step = min(N - 1, int(mid // DT))
            kw = s['units'] * s['l_per_unit'] * sh[step // 4] * e_per_l
            for e in s['events']:
                if e['dur_h'] <= 0 or e['litres'] <= 0:
                    continue
                st = e['start_h'] % 24.0
                if any(st + 24 * d < mid < st + 24 * d + e['dur_h'] for d in (-1, 0, 1)):
                    kw += e['litres'] / e['dur_h'] * e_per_l
            pieces.append((a, b, kw, self.A[step]))
        return pieces

    def excess(self, a, b):
        """excess energy of the peak between a and b (h, may pass midnight): sum over the 15-min steps of e_i * overlap"""
        tot, t = 0.0, a
        while t < b - 1e-12:
            i = int(math.floor(t / DT + 1e-9))
            end = min(b, (i + 1) * DT)
            tot += self.ex[i % N] * (end - t)
            t = end
        return tot

    def peak_starts(self):
        """candidate starts in [0, 24): every breakpoint and every breakpoint minus T (the value is piecewise linear in the start
        with kinks only there)"""
        if self.T <= 0:
            return [0.0]
        out = set()
        for a, b, kw, av in self._pieces:
            for t in (a, a - self.T):
                out.add(round(t % 24.0, 10))
        return sorted(out)

    def parts(self, pe, lkw):
        """METHOD §3.7 (rev 2): for every candidate start tau the day is simulated over two laps with the peak at tau (and its
        copy one day later); the depletion is the running deficit d = max(0, d + net) evaluated at every breakpoint (net is
        piecewise constant, so this is exact); E = the largest depletion over all starts. day/peak split at the maximum: the
        excess of the peak inside the window since the last reset, the rest is the day part."""
        T = self.T
        best = (0.0, 0.0, 0.0)
        base = []
        for lap in (0, 1):
            for a, b, kw, av in self._pieces:
                base.append((a + 24 * lap, b + 24 * lap, kw + lkw - pe * av))
        for tau in self.cands:
            cuts = sorted({tau, tau + T, tau + 24, tau + 24 + T} if T > 0 else set())
            d, start = 0.0, 0.0
            for a, b, rate in base:
                pts = [a] + [c for c in cuts if a < c < b] + [b]
                for u, v in zip(pts[:-1], pts[1:]):
                    m = 0.5 * (u + v)
                    inpk = T > 0 and (tau < m < tau + T or tau + 24 < m < tau + 24 + T)
                    x = rate * (v - u) + (self.ex[int(m // DT) % N] * (v - u) if inpk else 0.0)
                    if d + x <= 0:
                        d, start = 0.0, v
                    else:
                        d += x
                        if d > best[0] + 1e-12:
                            pk = 0.0
                            if T > 0:
                                for p0 in (tau, tau + 24):
                                    lo, hi = max(start, p0), min(v, p0 + T)
                                    if hi > lo:
                                        pk += self.excess(lo, hi)
                            best = (d, d - pk, pk)
        return best

    def estore(self, pe, lkw):
        return self.parts(pe, lkw)[0]

    def kwh_per_l(self):
        return CW * (self.te - self.s['t_cold']) * self.s['f_use'] / 1000.0

    def loss_w(self, V):
        return self.s['loss_w'] if self.s['loss_mode'] == 'given' else ecodesign(V, self.te)

    def volume(self, pe):
        V = 0.0
        for _ in range(200):
            lkw = (self.loss_w(V) + self.s['circ_w']) / 1000.0
            if pe * self.h <= self.eday + 24 * lkw + 1e-12:
                return None
            Vn = self.estore(pe, lkw) / self.kwh_per_l()
            if abs(Vn - V) < 1e-9:
                V = Vn
                break
            V = Vn
        return V

    def power(self, V):
        lkw = (self.loss_w(V) + self.s['circ_w']) / 1000.0
        cap = V * self.kwh_per_l()
        if self.h <= 0:
            return None, lkw
        lo = (self.eday + 24 * lkw) / self.h
        if self.estore(lo, lkw) <= cap + 1e-12:
            return lo, lkw
        hi = max(2 * lo, 1.0)
        while self.estore(hi, lkw) > cap + 1e-12:
            hi *= 2
            if hi > 1e6:
                return None, lkw
        while hi - lo > 1e-10 * hi:
            m = 0.5 * (lo + hi)
            if self.estore(m, lkw) > cap:
                lo = m
            else:
                hi = m
        return hi, lkw


def nominal(V):
    for x in NOMINAL:
        if x >= V - 1e-9:
            return x
    return math.ceil(V / 1000.0) * 1000


def expect(state):
    s = dict(BASE)
    s.update(state)
    s['events'] = [{k: _number(v) for k, v in e.items()} for e in state.get('events', [])]  # numeric strings are read (METHOD §4)
    m = Model(s)
    out = dict(daily_volume_l=sum(m.L) + m.lpk, daily_energy_kwh=m.eday, peak_volume_l=m.lpk, peak_energy_kwh=m.epk, p_inst_kw=m.pinst, t_store_eff_c=m.te, hp_share=m.a,
               hours_available=m.h)
    if s['mode'] == 'volume':
        pe, lkw = m.power(s['v_l'])
        feasible = pe is not None
        if feasible and 0 < m.a < 1 and s['p_boost_kw'] / (1 - m.a) < pe - 1e-9:
            feasible = False
        V = s['v_l']
        out.update(p_eff_kw=pe, p_main_kw=(pe * m.a if pe is not None else None), store_loss_w=m.loss_w(V))
    else:
        pe = m.peff(s['p_kw'])
        V = m.volume(pe)
        feasible = V is not None
        lkw = (m.loss_w(V if V is not None else 0) + s['circ_w']) / 1000.0
        out.update(p_eff_kw=pe, p_main_kw=s['p_kw'])
        if feasible:
            out['store_loss_w'] = m.loss_w(V)
    out['feasible'] = feasible
    out['p_min_kw'] = (m.eday + 24 * lkw) / m.h if m.h > 0 else None
    if feasible:
        lkw = (m.loss_w(V) + s['circ_w']) / 1000.0
        E, day, peak = m.parts(pe, lkw)
        out['governs'] = 'none' if E <= 1e-12 else ('day' if peak <= 1e-12 else ('peak' if day <= 1e-12 else 'combined'))
        out['v_store_l'] = V
        out['e_store_kwh'] = V * m.kwh_per_l()
        out['v_nominal_l'] = s['v_l'] if s['mode'] == 'volume' else (0 if V <= 1e-9 else nominal(V))
        out['loss_kw'] = lkw
        out['loss_share'] = 24 * lkw / (m.eday + 24 * lkw) if (m.eday + 24 * lkw) > 0 else 0.0
        out['booster_kwh_day'] = (m.eday + 24 * lkw) * (1 - m.a)
        net = pe - lkw
        out['reheat_h'] = V * CW * (m.te - s['t_cold']) / 1000.0 / net if net > 0 else None
        out['mixed_capacity_l'] = V * s['f_use'] * (m.te - s['t_cold']) / (s['t_use'] - s['t_cold'])
    vs = out.get('v_nominal_l') if feasible else None
    vp = s.get('v_pipe_l')
    if s.get('one_two_family') is True:   # METHOD §4 (1.2, X2-5): one- and two-family houses are small installations
        out['w551_class'], out['w551_reason'] = 'small', 'one_two_family'
    else:
        out['w551_class'] = 'large' if ((vs is not None and vs > 400) or (vp is not None and vp > 3)) else ('unknown' if vp is None else 'small')
    flags = list(m.flags)
    if vp is not None and vp > 3:   # METHOD §4 (1.3, Y3-4): the 3-litre rule applies to every installation
        flags.append('w551_pipe_3l')
    if m.te < 60:
        flags.append('legionella_below_60')
    out['flags'] = sorted(set(flags))
    return out


SHOWERS = [dict(start_h=h, dur_h=0.5, litres=1600) for h in (11, 13, 15, 17, 19, 21)]
NAMED = [
    ('apartments_24', 'preset: 24 flats, 30 kW boiler', dict(type='residential', units=57, l_per_unit=70, heater='boiler', p_kw=30, q_peak_lps=1.2, t_peak_min=10)),
    ('office_8f', 'preset: office, losses dominate', dict(type='office', units=600, l_per_unit=2, heater='boiler', p_kw=15, circ_w=2000, q_peak_lps=0.5, t_peak_min=10)),
    ('hotel_120', 'preset: hotel at the knee', dict(type='hotel', units=180, l_per_unit=100, heater='boiler', p_kw=65, q_peak_lps=3.0, t_peak_min=10)),
    ('hotel_120_30kw', 'hotel below the knee: day deficit governs', dict(type='hotel', units=120, l_per_unit=150, heater='boiler', p_kw=30, q_peak_lps=3.0, t_peak_min=10)),
    ('sports_hall', 'preset: shower peaks', dict(type='sports', units=0, l_per_unit=0, events=SHOWERS, heater='boiler', p_kw=40, q_peak_lps=3.0, t_peak_min=15)),
    ('care_hp', 'preset: heat pump alone holds 55 °C', dict(type='care', units=80, l_per_unit=110, heater='heatpump', p_kw=40, t_hp_max=55, p_boost_kw=0, q_peak_lps=2.0, t_peak_min=10)),
    ('care_hp_boost', 'preset: heat pump + booster 60 °C', dict(type='care', units=80, l_per_unit=110, heater='heatpump', p_kw=40, t_hp_max=55, p_boost_kw=9, q_peak_lps=2.0, t_peak_min=10)),
    ('care_hp_small_boost', 'booster limits the heat pump', dict(type='care', units=80, l_per_unit=110, heater='heatpump', p_kw=40, t_hp_max=55, p_boost_kw=2, q_peak_lps=2.0, t_peak_min=10)),
    ('flat_night', 'preset: electric night tariff 22-7', dict(type='residential', units=2.5, l_per_unit=70, heater='electric', p_kw=2.4, win_start=22, win_end=7, q_peak_lps=0.15, t_peak_min=10)),
    ('flat_allday', 'same flat, heater always available', dict(type='residential', units=2.5, l_per_unit=70, heater='electric', p_kw=2.4, q_peak_lps=0.15, t_peak_min=10)),
    ('apt_volume_1000', 'volume mode: 1000 L -> power', dict(type='residential', units=55, l_per_unit=70, mode='volume', v_l=1000, q_peak_lps=1.2)),
    ('hotel_volume_500', 'volume mode: 500 L hotel', dict(type='hotel', units=120, l_per_unit=150, mode='volume', v_l=500, q_peak_lps=3.0)),
    ('apt_given_loss', 'given standing loss 250 W + circulation 800 W', dict(type='residential', units=55, l_per_unit=70, p_kw=30, loss_mode='given', loss_w=250, circ_w=800, q_peak_lps=1.2)),
    ('infeasible', 'heater below the daily average', dict(type='residential', units=55, l_per_unit=70, p_kw=3, q_peak_lps=1.2)),
    ('midnight_event', 'event across midnight', dict(type='flat', units=0, l_per_unit=0, events=[dict(start_h=23.5, dur_h=1.25, litres=600)], p_kw=8, q_peak_lps=0.3)),
    ('school_store55', 'school, store at 55 °C (legionella flag)', dict(type='school', units=600, l_per_unit=4, t_store=55, p_kw=10, q_peak_lps=0.6)),
    ('district_65', 'district heating store 65 °C, f 0.75', dict(type='residential', units=120, l_per_unit=60, heater='district', t_store=65, f_use=0.75, p_kw=50, q_peak_lps=2.0)),
]


def random_cases(n, seed=20261105):
    rnd = random.Random(seed)
    out = []
    types = ['residential', 'office', 'hotel', 'care', 'school', 'sports']
    for k in range(n):
        t = rnd.choice(types)
        st = dict(type=t, units=rnd.choice([10, 24, 55, 80, 120, 300]), l_per_unit=rnd.choice([3, 20, 50, 70, 110, 150]),
                  t_cold=rnd.choice([8, 10, 12]), t_use=rnd.choice([38, 40, 45]), t_store=rnd.choice([55, 60, 65]),
                  f_use=rnd.choice([0.7, 0.8, 0.9, 0.95]), q_peak_lps=rnd.choice([0.3, 0.8, 1.5, 3.0]), t_peak_min=rnd.choice([5, 10, 15]),
                  circ_w=rnd.choice([0, 500, 1500]))
        if t == 'sports':
            st['events'] = [dict(start_h=rnd.choice([17.0, 18.25, 19.5, 20.75]), dur_h=rnd.choice([0.25, 0.5, 1.0]), litres=rnd.choice([400, 800, 1600]))]
        heater = rnd.choice(['boiler', 'electric', 'heatpump', 'district'])
        st['heater'] = heater
        if heater == 'heatpump':
            st['t_hp_max'] = rnd.choice([50, 55, 60])
            st['p_boost_kw'] = rnd.choice([0, 3, 6, 12])
        if rnd.random() < 0.3:
            st['win_start'], st['win_end'] = rnd.choice([(22, 7), (1, 6), (10, 16)])
        if rnd.random() < 0.25:
            st['loss_mode'] = 'given'
            st['loss_w'] = rnd.choice([60, 150, 400])
        # power around 1.2 .. 6 x the daily average so most cases are feasible
        s = dict(BASE)
        s.update(st)
        m = Model(s)
        avg = (m.eday + 24 * (st['circ_w'] + 100) / 1000.0) / max(m.h, 1)
        if rnd.random() < 0.3:
            st['mode'] = 'volume'
            st['v_l'] = rnd.choice([150, 300, 500, 1000, 2000])
        else:
            st['p_kw'] = round(max(1.0, avg * rnd.choice([1.2, 1.6, 2.5, 4, 6])), 1)
        out.append(('rnd-%02d' % k, 'seeded random', st))
    return out


# ---- input rules (METHOD §4 Validation, plbdhw-1.2: X2-4 events, X2-5 one_two_family) ----
def _number(v):
    """a number or a numeric string -> float; None when absent/empty; 'bad' otherwise"""
    if v is None or v == '':
        return None
    if isinstance(v, bool):
        return 'bad'
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else 'bad'
    if isinstance(v, str):
        try:
            x = float(v.strip())
        except ValueError:
            return 'bad'
        return x if math.isfinite(x) else 'bad'
    return 'bad'


def input_errors(state):
    """Errors of the two rules added in 1.2 (the other ranges are not exercised by these cases).
    Each event i needs start, duration and litres: absent -> missing:events:i, not a number -> type:events:i,
    outside 0 <= start < 24, 0 < duration <= 24, litres >= 0 -> range:events:i. one_two_family is true/false
    (1/0 and 'true'/'false'/'1'/'0' from forms); anything else -> type:one_two_family."""
    errs = []
    for i, e in enumerate(state.get('events', [])):
        if not isinstance(e, dict):
            errs.append('type:events:%d' % i)
            continue
        vals, kinds = {}, set()
        for k in ('start_h', 'dur_h', 'litres'):
            x = _number(e.get(k))
            if x is None:
                kinds.add('missing')
            elif x == 'bad':
                kinds.add('type')
            else:
                vals[k] = x
        if kinds:
            errs += ['%s:events:%d' % (kd, i) for kd in sorted(kinds)]
            continue
        if not (0 <= vals['start_h'] < 24) or not (0 < vals['dur_h'] <= 24) or vals['litres'] < 0:
            errs.append('range:events:%d' % i)
    if 'one_two_family' in state:
        v = state['one_two_family']
        if not (v is None or v == '' or v in (True, False) and isinstance(v, bool) or v in ('true', 'false', '1', '0')
                or (type(v) is int and v in (0, 1))):
            errs.append('type:one_two_family')
    return sorted(errs)


def input_cases():
    ev = dict(start_h=7, dur_h=1, litres=600)
    base = dict(FLAT0, p_kw=10)
    out = []
    for cid, note, events, err in [
        ('x24_start_text', 'X2-4: start "bad" is an error, not midnight (Codex repro)', [dict(start_h='bad', dur_h=1, litres=100)], 'type:events:0'),
        ('x24_start_missing', 'X2-4: second event without a start', [ev, dict(dur_h=1, litres=100)], 'missing:events:1'),
        ('x24_start_24', 'X2-4: start 24 h is outside [0, 24)', [dict(start_h=24, dur_h=1, litres=100)], 'range:events:0'),
        ('x24_start_negative', 'X2-4: negative start', [ev, dict(start_h=-1, dur_h=1, litres=100)], 'range:events:1'),
        ('x24_dur_zero', 'X2-4: duration 0', [dict(start_h=8, dur_h=0, litres=100)], 'range:events:0'),
        ('x24_dur_missing', 'X2-4: duration missing (no default in the method)', [dict(start_h=8, litres=100)], 'missing:events:0'),
        ('x24_litres_negative', 'X2-4: negative litres', [dict(start_h=8, dur_h=1, litres=-50)], 'range:events:0'),
    ]:
        st = dict(base, events=events)
        e = input_errors(st)
        assert e == [err], (cid, e)
        out.append((cid, note, st, dict(valid=False, errors=e)))
    # a numeric-string event is read as the number: same result as the numeric event (A1 energy balance)
    st = dict(base, events=[dict(start_h='7', dur_h='1', litres='600')])
    assert input_errors(st) == []
    out.append(('x24_numeric_strings', 'X2-4: numeric strings are read, start 7 h stays 7 h', st, dict(valid=True, **expect(dict(st, events=[ev])))))
    # X2-5: 500 L store and a 5 L pipe run in a one-/two-family house -> small; the same without the input -> large
    st = dict(type='residential', units=4, l_per_unit=70, mode='volume', v_l=500, v_pipe_l=5, q_peak_lps=0.3)
    out.append(('x25_one_two_family', 'X2-5: DVGW W 551 one-/two-family house = small regardless of 500 L / 5 L', dict(st, one_two_family=True),
                dict(valid=True, w551_class='small', w551_reason='one_two_family', feasible=True)))
    out.append(('x25_not_one_two_family', 'X2-5: same store, not a one-/two-family house -> large', dict(st, one_two_family=False),
                dict(valid=True, w551_class='large', feasible=True)))
    stb = dict(st, one_two_family='yes')
    out.append(('x25_strict_boolean', 'X2-5: one_two_family "yes" is an input error', stb, dict(valid=False, errors=input_errors(stb))))
    return out


# ---- external anchors (D-PLB-10): expected values by hand arithmetic, not by Model ----
C = 1.163  # Wh/(L K), DIN 4708 / EN 15316-3 conventional constant
FLAT0 = dict(type='flat', units=0, l_per_unit=0, loss_mode='given', loss_w=0, circ_w=0, f_use=1.0, q_peak_lps=0)


def anchors():
    out = []
    # A1 one draw of 600 L at 40 C between 07:00 and 08:00, 10 kW heater always on, no losses, store 60 C, f = 1.
    # Energy balance over the draw hour: demand 600*1.163*(40-10)/1000 = 20.934 kWh, heater gives 10 kWh ->
    # store must hold 10.934 kWh = 10 934 / (1.163*(60-10)) L = 188.03 L; reheat 10.934 kWh / 10 kW = 1.0934 h.
    e1 = 600 * C * 30 / 1000 - 10.0
    st = dict(FLAT0, events=[dict(start_h=7, dur_h=1, litres=600)], p_kw=10)
    out.append(('anchor_A1_event', 'hand: one 600 L draw against 10 kW (energy balance, EN 12831-3 cumulative principle)', st,
                dict(feasible=True, v_store_l=e1 * 1000 / (C * 50), v_nominal_l=200, reheat_h=e1 / 10, governs='day', p_eff_kw=10.0)))
    # A2 as A1 plus a design peak 0.25 L/s for 10 min (rev 2: the excess above the step's mean draw, once a day, worst moment).
    # P_inst = 0.25*3600*1.163*30/1000 = 31.401 kW; steps 07-08 draw 20.934 kW -> excess 10.467 kW; other steps draw nothing -> 0.
    # Worst: the peak inside the draw hour, where the store already runs down: E = 10.934 + 10.467/6 = 12.6785 kWh -> 218.03 L
    # -> 300 L (combined); daily energy 20.934 + 1.7445 = 22.6785 kWh (+ 50 L at 40 C). 1.2 gave 12.0008 kWh (step-end sampling).
    pinst = 0.25 * 3600 * C * 30 / 1000
    exc = (pinst - 600 * C * 30 / 1000) / 6
    e2 = e1 + exc
    st = dict(st, q_peak_lps=0.25, t_peak_min=10)
    out.append(('anchor_A2_event_burst', 'hand: A1 + 0.25 L/s x 10 min peak: excess above the draw-hour mean, inside the deficit (r4 rev 2)', st,
                dict(feasible=True, v_store_l=e2 * 1000 / (C * 50), v_nominal_l=300, governs='combined', p_inst_kw=pinst,
                     daily_volume_l=600 + exc / (C * 30 / 1000), daily_energy_kwh=600 * C * 30 / 1000 + exc)))
    # A3 no profile draw, only the design burst 0.15 L/s for 10 min; heater allowed 01:00-02:00 only.
    # Outside the window A_i = 0: the store must hold the whole burst 0.15*3600*1.163*30/1000*10/60 = 3.1401 kWh = 54.0 L.
    e3 = 0.15 * 3600 * C * 30 / 1000 * 10 / 60
    st = dict(FLAT0, q_peak_lps=0.15, t_peak_min=10, p_kw=5, win_start=1, win_end=2)
    out.append(('anchor_A3_burst_offwindow', 'hand: burst outside the heater window counts in full (CR-4)', st,
                dict(feasible=True, v_store_l=e3 * 1000 / (C * 50), governs='peak', hours_available=1.0)))
    # A4 electric night tariff 22-07 (9 h), 200 L/day at 40 C drawn evenly, 3 kW: the 15 h without heating
    # consume 200*1.163*30/1000*15/24 = 4.36125 kWh -> V = 200*30*15/24/50 = 75.0 L exactly.
    st = dict(FLAT0, type='flat', units=1, l_per_unit=200, p_kw=3, win_start=22, win_end=7, heater='electric')
    out.append(('anchor_A4_night_tariff', 'hand: 15 h without heating carried by the store', st,
                dict(feasible=True, v_store_l=200 * 30 * 15 / 24 / 50, v_nominal_l=80, governs='day')))
    # A5 Ecodesign (EU) 814/2013 Annex II: S <= 16.66 + 8.33*V^0.4 W at 45 K; V = 200 L, store 65 C (test condition):
    # 200^0.4 = 8.32553 -> S = 86.0117 W; volume mode, no draw: the minimum heater power equals the loss 0.0860 kW.
    # Mixed-water capacity of the same 200 L, f 0.9, 65/10/40: 200*0.9*55/30 = 330 L. Small store, 2 L pipe -> W 551 small.
    S5 = 16.66 + 8.33 * 200 ** 0.4
    st = dict(type='flat', units=0, l_per_unit=0, loss_mode='ecodesign', circ_w=0, f_use=0.9, q_peak_lps=0, t_store=65, mode='volume', v_l=200, v_pipe_l=2)
    out.append(('anchor_A5_ecodesign_200', 'hand: Ecodesign 814/2013 standing-loss limit, mixing, W 551 small', st,
                dict(feasible=True, store_loss_w=S5, p_eff_kw=S5 / 1000, mixed_capacity_l=200 * 0.9 * 55 / 30, w551_class='small')))
    # A6/A7 DVGW W 551: 500 L store -> large installation regardless of the pipe; 300 L with a 4 L pipe run -> large.
    st = dict(FLAT0, mode='volume', v_l=500, v_pipe_l=1)
    out.append(('anchor_A6_w551_store', 'DVGW W 551 definition: store > 400 L = large installation', st, dict(feasible=True, w551_class='large')))
    st = dict(FLAT0, mode='volume', v_l=300, v_pipe_l=4)
    out.append(('anchor_A7_w551_pipe', 'DVGW W 551 definition: > 3 L in a pipe run = large installation', st, dict(feasible=True, w551_class='large')))
    # ---- r4 deep review (Codex Y3-2/Y3-3/Y3-4), by hand ----
    # Y3-2 one 160 L draw in 10 min at 40 C, 5 kW, 10 -> 40 C, store 60 C, no losses, f = 1: during the draw the store loses
    # 160*1.163*30/1000 - 5/6 = 5.5824 - 0.8333 = 4.7491 kWh -> 4749.07/(1.163*50) = 81.67 L -> 100 L nominal.
    # Step-end sampling (1.2) saw 5.5824 - 1.25 = 4.3324 kWh -> 74.5 L -> 80 L (undersized).
    e32 = 160 * C * 30 / 1000 - 5.0 / 6
    st = dict(FLAT0, events=[dict(start_h=7, dur_h=1.0 / 6, litres=160)], p_kw=5)
    out.append(('r4_y32_draw_in_step', 'hand (Y3-2): 160 L in 10 min against 5 kW, integrated at the event end, not at the step end', st,
                dict(feasible=True, e_store_kwh=e32, v_store_l=e32 * 1000 / (C * 50), v_nominal_l=100, governs='day')))
    st = dict(FLAT0, events=[dict(start_h=7 + 1.0 / 6, dur_h=1.0 / 6, litres=160)], p_kw=5)
    out.append(('r4_y32_draw_across_step', 'hand (Y3-2): the same draw 07:10-07:20 across a step boundary', st,
                dict(feasible=True, e_store_kwh=e32, v_nominal_l=100)))
    # Y3-2 the same draw plus a design peak 160/600 L/s x 10 min (rev 2: excess above the step mean, once a day). P_inst =
    # 0.26667*3600*1.163*30/1000 = 33.494 kW; step 07:00-07:15 draws 5.5824 kWh / 0.25 h = 22.3296 kW -> excess 11.1648 kW;
    # all other steps draw nothing -> no peak there. Worst: inside the event: 4.7491 + 11.1648/6 = 6.6099 kWh -> 113.67 L -> 120 L
    # (1.2: 7.8315 kWh / 150 L, rev 1: 10.3315 kWh / 200 L). Daily volume 160 + 1.8608/0.03489 = 213.33 L.
    pI = 160.0 / 600 * 3600 * C * 30 / 1000
    exc = (pI - 160 * C * 30 / 1000 / 0.25) / 6
    e32b = e32 + exc
    st = dict(FLAT0, events=[dict(start_h=7, dur_h=1.0 / 6, litres=160)], p_kw=5, q_peak_lps=160.0 / 600, t_peak_min=10)
    out.append(('r4_y32_peak_excess', 'hand (Y3-2 rev 2): design peak = excess above the step mean, once, at the worst moment', st,
                dict(feasible=True, e_store_kwh=e32b, v_store_l=e32b * 1000 / (C * 50), v_nominal_l=120, governs='combined',
                     peak_energy_kwh=exc, daily_volume_l=160 + exc / (C * 30 / 1000))))
    st = dict(st, t_peak_min=0)
    out.append(('r4_y32_peak_in_profile', 'hand (Y3-2): peak already in the profile, t_peak = 0: store from the event only', st,
                dict(feasible=True, e_store_kwh=e32, v_nominal_l=100, p_inst_kw=160.0 / 600 * 3600 * C * 30 / 1000, daily_volume_l=160.0)))
    # Y3-3 no base draw, peak 0.15 L/s x 10 min daily = 3.1401 kWh, 0.1 kW heater, no losses: 2.4 kWh/d < 3.1401 -> infeasible;
    # minimum continuous power 3.1401/24 = 0.130838 kW. An 80 L store (4.652 kWh >= 3.1401) needs exactly that average.
    e33 = 0.15 * 3600 * C * 30 / 1000 * 10 / 60
    st = dict(FLAT0, q_peak_lps=0.15, t_peak_min=10, p_kw=0.1)
    out.append(('r4_y33_peak_infeasible', 'hand (Y3-3): no profile, so the whole peak is excess; above the heater energy -> infeasible, minimum 0.13084 kW', st,
                dict(feasible=False, daily_energy_kwh=e33, p_min_kw=e33 / 24, daily_volume_l=90.0)))
    st = dict(FLAT0, q_peak_lps=0.15, t_peak_min=10, mode='volume', v_l=80)
    out.append(('r4_y33_peak_volume', 'hand (Y3-3): an 80 L store needs the daily average 0.13084 kW', st,
                dict(feasible=True, p_eff_kw=e33 / 24, p_main_kw=e33 / 24)))
    # Y3-4 one-family house, 500 L store, 5 L uncirculated pipe run: W 551 small, but the 3-litre rule (DVGW: applies to all
    # installations, also one- and two-family houses) is failed -> flag w551_pipe_3l.
    st = dict(type='residential', units=4, l_per_unit=70, mode='volume', v_l=500, v_pipe_l=5, q_peak_lps=0.3, one_two_family=True)
    out.append(('r4_y34_one_family_3l', 'DVGW (Y3-4): one-family house = small class, 5 L > 3 L pipe rule still flagged', st,
                dict(feasible=True, w551_class='small', w551_reason='one_two_family', flags=['w551_pipe_3l'])))
    return out


def main():
    cases = []
    for cid, note, st in NAMED + random_cases(40):
        cases.append(dict(id=cid, note=note, state=st, expect=expect(st)))
    bad = 0
    for cid, note, st, hand in anchors():
        model = expect(st)
        for k, v in hand.items():
            mv = model.get(k)
            okk = (abs(mv - v) <= 1e-6 * max(1, abs(v))) if isinstance(v, float) and isinstance(mv, (int, float)) else mv == v
            if not okk:
                bad += 1
                print('ANCHOR MISMATCH', cid, k, 'hand', v, 'method', mv)
        cases.append(dict(id=cid, note=note, state=st, expect=hand, anchor=True))
    print('anchors: %d mismatches' % bad)
    for cid, note, st, exp in input_cases():
        if exp.get('valid'):
            model = expect(st)
            for k, v in exp.items():
                if k != 'valid' and model.get(k) != v:
                    raise SystemExit('INPUT CASE MISMATCH %s %s' % (cid, k))
        cases.append(dict(id=cid, note=note, state=st, expect=exp))
    Path(ref('plbdhw_ref.json')).write_text(json.dumps(cases, indent=1), encoding='utf-8')
    print('plbdhw_ref.json: %d cases' % len(cases))


if __name__ == '__main__':
    main()
