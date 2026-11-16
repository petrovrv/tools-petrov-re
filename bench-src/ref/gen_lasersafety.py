"""Independent reference for lasersafety.html (Laser Safety: MPE, NOHD, class, eyewear) - written from the published method, not from the JS.

Data path: the exposure limits are NOT re-typed here. They are read from lasersafety_directive_annexII.json, a cell-by-cell
transcription of Directive 2006/25/EC Annex II Tables 2.2-2.6 made from the images of the Official Journal text
(Publications Office, CELEX 32006L0025, read 13.11.2026), and the printed formulas are evaluated by a small interpreter below.
The JS engine (opt-laser.js) hard-codes the same law independently, so a transcription or coding slip on either side shows up.

Method (published sources only):
  MPE  - Directive 2006/25/EC Annex II: Table 2.2 (eye, t < 10 s), 2.3 (eye, t >= 10 s, dual visible limits, note b: small
         sources use the thermal limit for 10 s <= t < T1 and the photochemical limit after), 2.4 (skin), 2.5 (C_A, C_B, C_C,
         C_E, T1, T2), 2.6 (repetitive pulses: rule 1 single pulse, rule 2 train average, rule 3 C_P = N^-0.25 for thermal
         limits, pulses within T_min summed). Footnote a: if two limits apply, the more restrictive one.
  NOHD - distance where the exposure averaged over the limiting aperture equals the MPE; Gaussian beam with 1/e diameter
         d(r) = a + phi*r (IEC TR 60825-14 far-field growth). The power inside the aperture is obtained here by numerical
         integration of the Gaussian irradiance profile (Simpson, 2000 panels), not by the closed form; the classic
         formula NOHD = (sqrt(4 P / (pi MPE)) - a) / phi is checked too.
  ENOHD - binoculars collect the beam over D_c = min(D_objective, M x D_aperture) and deliver it into the eye (transmission tau).
  OD   - log10(exposure at the exit averaged over the limiting aperture / MPE).
  LB   - EN 207:2017 scale numbers from DGUV Information 203-042 (2018): LB1 values per band and mode, x10 per step,
         beam diameter >= 1 mm for D and I, trains x N^0.25 with N = pulses in 5 s.
  Class (indicative) - AEL(class 1) = MPE x aperture area over the time base (100 s; 30 000 s below 400 nm), dual visible
         limits both applied; class 2 = 1 mW (400-700 nm); 3R = 5 x class 1 (5 x class 2 visible); 3B = 0.5 W CW 315 nm-1 mm,
         pulsed limits per EMSD Laser Safety Guidance Notes 2005 Table C.6; condition 3 = aperture at 100 mm, condition 1 =
         50 mm at 2 m (302.5-4000 nm); 1M/2M when condition 3 passes and condition 1 fails.

Independence (review R-4, 13.11.2026): truly independent of the JS are the MPE (table interpreter over the transcribed law),
the Gaussian aperture integral, and the 26 published worked examples with FIXED expected values that live in
bench-src/run_lasersafety.mjs (TROS Laserstrahlung Teil 2, OSHA Technical Manual III-6, DGUV 203-042 Anhang 5, Essex/HPA,
TCD, Innsbruck; _opt/laser/published-examples.md). SHARED interpretation (same author, re-typed here, so it cannot catch an
interpretation error): pulse grouping inside T_min (N = groups), the UV-B row between the 1-nm rows (floor), rule 1 with the
single-pulse aperture, the indicative class logic (2001 construction, 1M/2M tests, 3B table), EN 207 details incl. F(d63)
(DGUV 203-042 sec. 5.2: E' = E (d63/mm)^1.7, 100 above 15 mm, for P > 10 W or E > 1e5 W/m2, D mode, 315 nm - 1 mm).

Usage: python -I gen_lasersafety.py  (writes lasersafety_ref.json next to this file)
"""
import json
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
LAW = json.load(open(os.path.join(HERE, 'lasersafety_directive_annexII.json'), encoding='utf-8'))


# ----------------------------------------------------------------------------- Table 2.5 parameters
def C_A(l):
    return 1.0 if l < 700 else (10 ** (0.002 * (l - 700)) if l < 1050 else 5.0)


def C_B(l):
    return 1.0 if l < 450 else 10 ** (0.02 * (l - 450))


def C_C(l):
    return 1.0 if l < 1150 else (10 ** (0.018 * (l - 1150)) if l < 1200 else 8.0)


def C_E(alpha_mrad):
    if alpha_mrad <= 1.5:
        return 1.0
    if alpha_mrad <= 100:
        return alpha_mrad / 1.5
    return alpha_mrad ** 2 / (1.5 * 100)


def T1(l):
    return 10.0 if l < 450 else (10 * 10 ** (0.02 * (l - 450)) if l < 500 else 100.0)


def T2(alpha_mrad):
    if alpha_mrad <= 1.5:
        return 10.0
    if alpha_mrad >= 100:
        return 100.0
    return 10 * 10 ** ((alpha_mrad - 1.5) / 98.5)


# ----------------------------------------------------------------------------- formula interpreter for the transcribed cells
def evaluate(expr, l, t, alpha):
    """Evaluate a cell such as '18 * t^0.75 * C_A C_E' or '40; if t < 2.6e-9 then 5.6e3 * t^0.25' or '...; max 1000'."""
    env = {'t': t, 'C_A': C_A(l), 'C_B': C_B(l), 'C_C': C_C(l), 'C_E': C_E(alpha), 'T2': T2(alpha)}
    parts = [p.strip() for p in expr.split(';')]
    cap = None
    alt = None
    for extra in parts[1:]:
        m = re.match(r'max\s+([0-9.eE+-]+)$', extra)
        if m:
            cap = float(m.group(1))
            continue
        m = re.match(r'if t < ([0-9.eE+-]+) then (.+)$', extra)
        if m:
            alt = (float(m.group(1)), m.group(2))
            continue
        raise ValueError('cell not understood: ' + expr)

    def calc(e):
        e = e.replace('^', '**')
        e = re.sub(r'(C_[ABCE])\s+(?=C_)', r'\1 * ', e)        # juxtaposed factors 'C_A C_E'
        for k in sorted(env, key=len, reverse=True):
            e = re.sub(r'\b' + k + r'\b', repr(env[k]), e)
        if not re.fullmatch(r'[0-9eE.+\-*/() ]+', e):
            raise ValueError('unsafe cell ' + e)
        return eval(e, {'__builtins__': {}}, {})

    if alt and t < alt[0]:
        v = calc(alt[1])
    else:
        v = calc(parts[0])
    if cap is not None:
        v = min(v, cap)
    return v


def rows(table):
    return LAW[table]


def in_band(lo, hi, l):
    """Bands as printed; 180-302 covers up to 302.5. Single-nanometre UV-B rows: between two printed rows the lower
    (more protective) one applies, i.e. row [n,n] covers n <= l < n+1 and the 303 nm row also 302.5-303 (decision of the
    fix of review R-9, 13.11.2026; the law prints the rows without stating the interval)."""
    if lo == hi:
        return (302.5 if lo == 303 else lo) <= l < lo + 1
    if hi == 302:
        return lo <= l < 302.5
    return lo <= l < hi or (hi == 1e6 and l == hi)


def to_H(q, v, t):
    return v if q == 'H' else v * t


def candidates(table, l, t, alpha):
    out = []
    for r in rows(table):
        lo, hi = r['lambda_nm']
        t0, t1 = r['t_s']
        if not in_band(lo, hi, l):
            continue
        if not (t0 <= t < t1 or (t1 == 3e4 and t == t1) or (t0 == 0 and t < t1)):
            continue
        cond = r.get('condition')
        if cond:
            small = alpha <= 1.5
            if cond.startswith('alpha < 1.5') and not small:
                continue
            if cond.startswith('alpha > 1.5'):
                if small:
                    continue
                if 't <= T2' in cond and not t <= T2(alpha):
                    continue
                if 't > T2' in cond and not t > T2(alpha):
                    continue
        out.append(r)
    return out


def mpe_eye(l, t, alpha=0.0, dual=False):
    """Radiant exposure H (J/m2) at duration t; also returns the kind ('thermal'/'photochemical')."""
    t = min(t, 3e4)
    t_eff = max(t, 1e-13)
    table = 'table_2_2_eye_short_lt_10s' if t_eff < 10 else 'table_2_3_eye_long_ge_10s'
    cs = candidates(table, l, t_eff, alpha)
    if not cs:
        raise ValueError('no row for %g nm %g s' % (l, t))
    vals = []
    for r in cs:
        v = to_H(r['quantity'], evaluate(r['formula'], l, t_eff, alpha), t_eff)
        photo = r['lambda_nm'] == [400, 600]
        vals.append((v, 'photochemical' if photo else 'thermal', r))
    if table.startswith('table_2_3') and 400 <= l < 600 and alpha <= 1.5 and not dual:
        # Table 2.3 note b: small sources -> thermal for 10 s <= t < T1, photochemical after
        want = 'thermal' if t_eff < T1(l) else 'photochemical'
        vals = [x for x in vals if x[1] == want]
    return min(vals, key=lambda x: x[0])


def mpe_skin(l, t):
    t = min(t, 3e4)
    cs = candidates('table_2_4_skin', l, t, 0.0)
    for r in cs:
        if r.get('quantity') is None:            # 'Same as eye exposure limits'
            return mpe_eye(l, t, 0.0)
        return (to_H(r['quantity'], evaluate(r['formula'], l, t, 0.0), t), 'thermal', r)
    raise ValueError('no skin row')


def t_min(l):
    for r in LAW['table_2_6_repetitive_exposure']['T_min']:
        lo, hi = r['lambda_nm']
        if lo < l <= hi or (l == lo and lo == 315):
            return r['T_min_s']
    return None


def is_thermal(l, kind, t):
    if kind == 'photochemical':
        return False
    if l < 302.5:
        return False
    if l < 315:            # UV-B: the constant rows are photochemical, the 5.6e3 t^0.25 branch thermal
        return False
    if l < 400:
        return t < 10
    return True


def mpe_train(l, tau, prf, T, alpha, organ='eye'):
    rules, N = train_rules(l, tau, prf, T, alpha, organ)
    gov = min(rules, key=lambda k: rules[k])
    return rules[gov], gov, N


def train_rules(l, tau, prf, T, alpha, organ='eye'):
    f = (lambda tt: mpe_eye(l, tt, alpha)) if organ == 'eye' else (lambda tt: mpe_skin(l, tt))
    single = f(tau)
    N = max(1, int(math.floor(prf * T + 1e-9)))
    rules = {1: single[0], 2: f(T)[0] / N}
    if N > 1 and is_thermal(l, single[1], tau):
        tm = t_min(l)
        n, Hg, Neff = 1, single[0], N
        if tm and prf * tm > 1:
            n = int(math.ceil(prf * tm))
            Hg = f(tm)[0] / n
            Neff = max(1, N // n)
        rules[3] = min(single[0], Hg) * Neff ** -0.25
    return rules, N


# ----------------------------------------------------------------------------- beams
def power_fraction(d, D):
    """Fraction of a Gaussian (1/e irradiance diameter d) inside a centred aperture of diameter D, by Simpson integration of
    2 pi r I(r) with I = exp(-(2 r / d)^2)."""
    w = d / 2.0
    R = D / 2.0
    tot = math.pi * w * w                       # integral of exp(-r^2/w^2) 2 pi r dr over the plane
    if R > 12 * w:
        return 1.0
    n = 2000
    h = R / n
    s = 0.0
    for i in range(n + 1):
        r = i * h
        g = 2 * math.pi * r * math.exp(-(r / w) ** 2)
        s += g * (1 if i in (0, n) else (4 if i % 2 else 2))
    return s * h / 3 / tot


def averaged(Q, a, phi, r, D, Dc=None, tau=1.0):
    d = a + phi * r
    Dcol = Dc if (Dc and Dc > D) else D
    return Q * tau * power_fraction(d, Dcol) / (math.pi * D * D / 4)


def hazard_distance(Q, lim, a, phi, D, Dc=None, tau=1.0):
    if averaged(Q, a, phi, 0, D, Dc, tau) <= lim:
        return 0.0
    lo, hi = 0.0, 1.0
    while averaged(Q, a, phi, hi, D, Dc, tau) > lim:
        hi *= 2
    for _ in range(100):
        mid = (lo + hi) / 2
        if averaged(Q, a, phi, mid, D, Dc, tau) > lim:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def classic(Q, lim, a, phi, gain=1.0):
    d = math.sqrt(4 * Q * gain / (math.pi * lim))
    return 0.0 if d <= a else (d - a) / phi


def aperture_eye(l, t):
    if 400 <= l < 1400:
        return 7e-3
    if l >= 1e5:
        return 11e-3
    return 1e-3 if t <= 0.3 else (1.5e-3 * t ** 0.375 if t < 10 else 3.5e-3)


def auto_T(l):
    return 0.25 if 400 <= l <= 700 else (3e4 if l < 400 else 10.0)


# ----------------------------------------------------------------------------- EN 207 (DGUV 203-042)
LB1 = [{'D': 0.01, 'I': 3e2, 'R': 3e2, 'M': 3e11}, {'D': 1e2, 'I': 0.05, 'R': 0.05, 'M': 1.5e-3}, {'D': 1e4, 'I': 1e3, 'R': 1e3, 'M': 1e12}]
M_IRR = [True, False, True]


def lb(l, mode, tau, P, Q, prf, a):
    band = 0 if l <= 315 else (1 if l <= 1400 else 2)
    m = 'D' if mode == 'cw' or tau >= 0.25 else ('I' if tau >= 1e-6 else ('R' if tau >= 1e-9 else 'M'))
    D = max(a, 1e-3) if m in ('D', 'I') else a
    A = math.pi * D * D / 4
    if m == 'D':
        Pd = P if mode == 'cw' else Q * prf
        v = Pd / A
        # DGUV 203-042 (2018) sec. 5.2: 315 nm - 1 mm, d63 >= 1 mm and (P > 10 W or E > 1e5 W/m2):
        # E' = E * F(d63), F = (d63/mm)^1.7 for 1-15 mm, 100 above 15 mm
        dmm = a * 1000
        if l > 315 and dmm >= 1 and (Pd > 10 or v > 1e5):
            v *= dmm ** 1.7 if dmm <= 15 else 100.0
    elif m == 'M' and M_IRR[band]:
        v = Q / tau / A
    else:
        v = Q / A
    if mode == 'rep' and m != 'D':
        v *= max(1.0, prf * 5) ** 0.25
    n = 1
    while LB1[band][m] * 10 ** (n - 1) < v * (1 - 1e-12):
        n += 1
    return m, n


# ----------------------------------------------------------------------------- indicative class
def classify(c):
    l, mode = c['lambda'], c['mode']
    a, phi = c['a'], c['phi']
    if c.get('def') == '1/e2':
        a, phi = a / math.sqrt(2), phi / math.sqrt(2)
    tb = 3e4 if (l < 400 or c.get('intended')) else 100.0
    D = aperture_eye(l, tb)
    A = math.pi * D * D / 4
    P1 = mpe_eye(l, tb, c.get('alpha', 0) * 1e3, dual=True)[0] * A / tb
    Q1 = None
    Pavg = c['P'] if mode == 'cw' else (0.0 if mode == 'single' else c['Q'] * c['prf'])
    if mode == 'single':
        Dp = aperture_eye(l, c['tau'])
        Q1 = mpe_eye(l, c['tau'], c.get('alpha', 0) * 1e3, dual=True)[0] * math.pi * Dp * Dp / 4
    elif mode == 'rep':
        Dp = aperture_eye(l, c['tau'])
        Q1 = mpe_train(l, c['tau'], c['prf'], tb, c.get('alpha', 0) * 1e3)[0] * math.pi * Dp * Dp / 4

    def acc(Dap, z):
        f = power_fraction(a + phi * z, Dap)
        return Pavg * f, (None if mode == 'cw' else c['Q'] * f)

    def within(ae, lim):
        if lim is None:
            return False
        P, Q = ae
        if lim[0] is not None and P > lim[0] * (1 + 1e-9):
            return False
        if lim[1] is not None and Q is not None and Q > lim[1] * (1 + 1e-9):
            return False
        return True

    ae3 = acc(D, 0.1)
    ae1 = acc(50e-3, 2.0) if 302.5 <= l <= 4000 else ae3
    vis = 400 <= l <= 700
    L1 = (P1, Q1)
    L2 = (1e-3, Q1) if vis else None
    L3R = (5e-3, None if Q1 is None else 5 * Q1) if vis else ((5 * P1, None if Q1 is None else 5 * Q1) if l >= 302.5 else None)
    pulsed = mode != 'cw' and c.get('tau', 1) < 0.25
    if l < 302.5:
        L3B = (1.5e-3, 3.8e-4 if pulsed else None)
    elif l < 315:
        c2 = 10 ** (0.2 * (l - 295))
        L3B = (5e-5 * c2, 1.25e-5 * c2 if pulsed else None)
    else:
        q = None
        if pulsed:
            tau = c['tau']
            q = 0.125 if l < 400 else (0.03 if tau < 0.06 else 0.5 * tau) if l < 700 else (0.03 * C_A(l) if l < 1050 else (0.15 if l < 1400 else 0.125))
        L3B = (0.5, q)
    if within(ae3, L1) and within(ae1, L1):
        return '1'
    if within(ae3, L1) and within(ae1, L3B):
        return '1M'
    if L2 and within(ae3, L2) and within(ae1, L2):
        return '2'
    if L2 and within(ae3, L2):
        return '2M'
    if L3R and within(ae3, L3R) and within(ae1, L3R):
        return '3R'
    if within(ae3, L3B) and within(ae1, L3B):
        return '3B'
    return '4'


# ----------------------------------------------------------------------------- full case
def assess(c):
    l, mode = c['lambda'], c['mode']
    a, phi = c['a'], c['phi']
    if c.get('def') == '1/e2':
        a, phi = a / math.sqrt(2), phi / math.sqrt(2)
    alpha = c.get('alpha', 0) * 1e3
    T = c.get('T') or auto_T(l)
    De = aperture_eye(l, c['tau'] if mode == 'single' else T)
    if mode == 'cw':
        lim = mpe_eye(l, T, alpha)[0] / T
        Q = c['P']
        gov = None
    elif mode == 'single':
        lim = mpe_eye(l, c['tau'], alpha)[0]
        Q = c['Q']
        gov = None
    else:
        lim, gov, _ = mpe_train(l, c['tau'], c['prf'], T, alpha)
        Q = c['Q']
    nohd = hazard_distance(Q, lim, a, phi, De)
    ratio = averaged(Q, a, phi, 0, De) / lim
    if mode == 'rep':
        # every rule with its own limiting aperture: rule 1 (single pulse) with the aperture of the pulse duration,
        # rules 2 and 3 with that of the exposure duration; worst exit ratio governs, NOHD = largest of the three (review R-10)
        rules, _ = train_rules(l, c['tau'], c['prf'], T, alpha)
        best = None
        nohd = 0.0
        for k in sorted(rules):
            Dk = aperture_eye(l, c['tau']) if k == 1 else De
            rk = averaged(Q, a, phi, 0, Dk) / rules[k]
            nohd = max(nohd, hazard_distance(Q, rules[k], a, phi, Dk))
            if best is None or rk > best[0] * (1 + 1e-12):
                best = (rk, rules[k], Dk)
        ratio, lim, De = best
    out = {'mpe': lim, 'T': T, 'NOHD': nohd, 'NOHD_classic': classic(Q, lim, a, phi),
           'ratio': ratio, 'governing': gov}
    out['OD'] = math.log10(out['ratio']) if out['ratio'] > 1 else 0.0
    if c.get('optics'):
        o = c['optics']
        Dc = min(o['Dobj'], o['M'] * De)
        out['ENOHD'] = max(out['NOHD'], hazard_distance(Q, lim, a, phi, De, Dc, o.get('tau', 1.0))) if 302.5 <= l <= 4000 else out['NOHD']
    m, n = lb(l, mode, c.get('tau', 1.0), c.get('P', 0), c.get('Q', 0), c.get('prf', 0), a)
    out['LB'] = m + ' LB' + str(n)
    out['cls'] = classify(c)
    return out


def main():
    cases = []
    # 1. MPE grid, eye (point and 10 mrad source) and skin
    lams = [250, 305, 308, 313, 355, 405, 445, 488, 532, 633, 780, 905, 1064, 1175, 1310, 1450, 1550, 2000, 2940, 10600]
    ts = [1e-12, 1e-10, 5e-9, 1e-6, 1e-4, 0.01, 0.25, 1, 50, 300, 2e4]
    for l in lams:
        for t in ts:
            cases.append({'id': 'mpe-eye-%g-%g' % (l, t), 'kind': 'mpe', 'organ': 'eye', 'lambda': l, 't': t, 'alpha': 0,
                          'expect': {'H': mpe_eye(l, t, 0.0)[0]}})
            if 400 <= l < 1400 and t >= 1e-6:
                cases.append({'id': 'mpe-eye-ext-%g-%g' % (l, t), 'kind': 'mpe', 'organ': 'eye', 'lambda': l, 't': t, 'alpha': 10e-3,
                              'expect': {'H': mpe_eye(l, t, 10.0)[0]}})
            cases.append({'id': 'mpe-skin-%g-%g' % (l, t), 'kind': 'mpe', 'organ': 'skin', 'lambda': l, 't': t, 'alpha': 0,
                          'expect': {'H': mpe_skin(l, t)[0]}})
    # 2. pulse trains
    for (l, tau, prf, T) in [(1064, 1e-8, 10, 10), (532, 1e-9, 1e6, 0.25), (1064, 1e-8, 1e5, 10), (905, 1e-7, 1e4, 10),
                             (355, 1e-8, 100, 3e4), (250, 1e-8, 100, 10), (1550, 1e-8, 1e3, 10), (10600, 1e-6, 1e3, 10), (633, 1e-3, 50, 0.25)]:
        H, g, N = mpe_train(l, tau, prf, T, 0.0)
        cases.append({'id': 'train-%g-%g-%g' % (l, tau, prf), 'kind': 'train', 'lambda': l, 'tau': tau, 'prf': prf, 'T': T,
                      'expect': {'H': H, 'governing': g, 'N': N}})
    # 3. full assessments (inputs in SI; the driver feeds them through the page)
    full = [
        {'id': 'pointer532', 'lambda': 532, 'mode': 'cw', 'P': 5e-3, 'a': 1e-3, 'phi': 1.2e-3},
        {'id': 'hene633', 'lambda': 633, 'mode': 'cw', 'P': 1e-3, 'a': 0.7e-3, 'phi': 1.2e-3},
        {'id': 'hene633-10s', 'lambda': 633, 'mode': 'cw', 'P': 1e-3, 'a': 0.7e-3, 'phi': 1.2e-3, 'T': 10},
        {'id': 'fibre1064', 'lambda': 1064, 'mode': 'cw', 'P': 10, 'a': 5e-3, 'phi': 1e-3},
        {'id': 'diode445', 'lambda': 445, 'mode': 'cw', 'P': 5, 'a': 2e-3, 'phi': 3e-3},
        {'id': 'qswitch1064', 'lambda': 1064, 'mode': 'rep', 'Q': 0.1, 'tau': 1e-8, 'prf': 10, 'a': 6e-3, 'phi': 0.5e-3},
        {'id': 'co2_10600', 'lambda': 10600, 'mode': 'cw', 'P': 100, 'a': 10e-3, 'phi': 2e-3},
        {'id': 'er1550', 'lambda': 1550, 'mode': 'cw', 'P': 2, 'a': 3e-3, 'phi': 1e-3},
        {'id': 'binoculars', 'lambda': 532, 'mode': 'cw', 'P': 5e-3, 'a': 1e-3, 'phi': 1.2e-3, 'optics': {'M': 7, 'Dobj': 0.05, 'tau': 1}},
        {'id': 'class1_1064', 'lambda': 1064, 'mode': 'cw', 'P': 1.5e-3, 'a': 1e-3, 'phi': 1e-3},
        {'id': 'single-ns-532', 'lambda': 532, 'mode': 'single', 'Q': 1e-3, 'tau': 5e-9, 'a': 3e-3, 'phi': 0.8e-3},
        {'id': 'uv355-rep', 'lambda': 355, 'mode': 'rep', 'Q': 1e-4, 'tau': 1e-8, 'prf': 1e3, 'a': 1e-3, 'phi': 1e-3, 'T': 10},
        {'id': 'diode905-1e2', 'lambda': 905, 'mode': 'cw', 'P': 0.05, 'a': 2e-3, 'phi': 2e-3, 'def': '1/e2'},
        {'id': 'c1-633', 'lambda': 633, 'mode': 'cw', 'P': 0.3e-3, 'a': 1e-3, 'phi': 1e-3},
        {'id': 'c2-633', 'lambda': 633, 'mode': 'cw', 'P': 0.9e-3, 'a': 1e-3, 'phi': 1e-3},
        {'id': 'c3R-633', 'lambda': 633, 'mode': 'cw', 'P': 4e-3, 'a': 1e-3, 'phi': 1e-3},
        {'id': 'c3B-633', 'lambda': 633, 'mode': 'cw', 'P': 0.3, 'a': 1e-3, 'phi': 1e-3},
        {'id': 'c1M-633', 'lambda': 633, 'mode': 'cw', 'P': 2e-3, 'a': 20e-3, 'phi': 0.05e-3},
        {'id': 'c2M-633', 'lambda': 633, 'mode': 'cw', 'P': 8e-3, 'a': 25e-3, 'phi': 0.05e-3},
        {'id': 'c1-1550', 'lambda': 1550, 'mode': 'cw', 'P': 8e-3, 'a': 1e-3, 'phi': 1e-3},
        {'id': 'c3R-1550', 'lambda': 1550, 'mode': 'cw', 'P': 30e-3, 'a': 1e-3, 'phi': 1e-3},
        {'id': 'c3B-pulsed-532', 'lambda': 532, 'mode': 'single', 'Q': 0.02, 'tau': 1e-8, 'a': 2e-3, 'phi': 1e-3},
        {'id': 'c4-pulsed-532', 'lambda': 532, 'mode': 'single', 'Q': 0.05, 'tau': 1e-8, 'a': 2e-3, 'phi': 1e-3},
    ]
    # review fixes 13.11.2026: UV-B between the 1-nm rows (R-9), per-rule apertures outside 400-1400 nm (R-10),
    # optical aids up to 4000 nm (R-11)
    for (l, t) in [(303.6, 100), (302.7, 100), (303.6, 1.0), (313.9, 100), (308.4, 3e4)]:
        cases.append({'id': 'mpe-eye-uvb-%g-%g' % (l, t), 'kind': 'mpe', 'organ': 'eye', 'lambda': l, 't': t, 'alpha': 0,
                      'expect': {'H': mpe_eye(l, t, 0.0)[0]}})
    full += [
        {'id': 'rep1550-small', 'lambda': 1550, 'mode': 'rep', 'Q': 1e-3, 'tau': 1e-8, 'prf': 1, 'a': 0.3e-3, 'phi': 1e-3, 'T': 10},
        {'id': 'rep2940-small', 'lambda': 2940, 'mode': 'rep', 'Q': 2e-3, 'tau': 1e-4, 'prf': 5, 'a': 0.4e-3, 'phi': 2e-3, 'T': 10},
        {'id': 'eryag2940-optics', 'lambda': 2940, 'mode': 'cw', 'P': 1, 'a': 2e-3, 'phi': 1e-3, 'optics': {'M': 7, 'Dobj': 0.05, 'tau': 1}},
    ]
    for c in full:
        r = assess(c)
        cases.append({'id': 'case-' + c['id'], 'kind': 'assess', 'input': c, 'expect': r})
    out = os.path.join(HERE, 'lasersafety_ref.json')
    json.dump({'generator': 'bench-src/ref/gen_lasersafety.py', 'law': LAW['url'], 'law_read': LAW['read_date'], 'cases': cases}, open(out, 'w', encoding='utf-8'), indent=1)
    print('lasersafety_ref.json:', len(cases), 'cases')


if __name__ == '__main__':
    main()
