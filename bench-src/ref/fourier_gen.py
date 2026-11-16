#!/usr/bin/env python3
"""
Independent reference for fourier_series.html (tool id: fourier-series).

Convention used throughout (identical to the tool's reconstruct()):
    f(x) = a0 + sum_{n>=1} [ a_n cos(nx) + b_n sin(nx) ],   period 2*pi
    a0 = (1/2pi) INT_0^2pi f dx          (the MEAN, i.e. classical a0/2)
    a_n = (1/pi) INT_0^2pi f cos(nx) dx
    b_n = (1/pi) INT_0^2pi f sin(nx) dx

Two independent derivations per coefficient:
  (A) sympy symbolic integration of the piecewise target definition
  (B) mpmath high-precision numerical quadrature with the discontinuities
      supplied as break points
Their mutual deviation is stored as `crosscheck`.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json
import sympy as sp
import mpmath as mp

mp.mp.dps = 30
x = sp.symbols('x', real=True)
n = sp.symbols('n', integer=True, positive=True)
pi = sp.pi

# ---------------------------------------------------------------- targets
# each target: list of (expr, lo, hi) pieces covering [0, 2pi)
def pieces(kind, D=None):
    if kind == 'square':
        return [(sp.Integer(1), 0, pi), (sp.Integer(-1), pi, 2 * pi)]
    if kind == 'sawtooth':
        return [(x / pi, 0, pi), (x / pi - 2, pi, 2 * pi)]
    if kind == 'triangle':
        # (2/pi)*asin(sin x) written piecewise
        return [(2 * x / pi, 0, pi / 2), (2 - 2 * x / pi, pi / 2, 3 * pi / 2),
                (2 * x / pi - 4, 3 * pi / 2, 2 * pi)]
    if kind == 'pulse':
        d = sp.Rational(D)
        return [(sp.Integer(1), 0, 2 * pi * d), (sp.Integer(0), 2 * pi * d, 2 * pi)]
    if kind == 'halfsine':
        return [(sp.sin(x), 0, pi), (sp.Integer(0), pi, 2 * pi)]
    raise ValueError(kind)

def target_num(kind, xv, D=None):
    t = mp.fmod(mp.fmod(xv, 2 * mp.pi) + 2 * mp.pi, 2 * mp.pi)
    if kind == 'square':   return mp.mpf(1) if t < mp.pi else mp.mpf(-1)
    if kind == 'sawtooth': return t / mp.pi if t < mp.pi else t / mp.pi - 2
    if kind == 'triangle': return (2 / mp.pi) * mp.asin(mp.sin(xv))
    if kind == 'pulse':    return mp.mpf(1) if t < 2 * mp.pi * D else mp.mpf(0)
    if kind == 'halfsine': return mp.sin(xv) if mp.sin(xv) > 0 else mp.mpf(0)

# ------------------------------------------------------- (A) symbolic a_n,b_n
def coeffs_symbolic(kind, N, D=None):
    P = pieces(kind, D)
    a0 = sum(sp.integrate(e, (x, lo, hi)) for e, lo, hi in P) / (2 * pi)
    out = []
    for k in range(1, N + 1):
        a = sum(sp.integrate(e * sp.cos(k * x), (x, lo, hi)) for e, lo, hi in P) / pi
        b = sum(sp.integrate(e * sp.sin(k * x), (x, lo, hi)) for e, lo, hi in P) / pi
        out.append((sp.nsimplify(sp.simplify(a)), sp.nsimplify(sp.simplify(b))))
    return sp.simplify(a0), out

# ------------------------------------------------------- (B) numeric a_n,b_n
def coeffs_numeric(kind, N, D=None):
    brk = [0, mp.pi, 2 * mp.pi]
    if kind == 'triangle': brk = [0, mp.pi / 2, 3 * mp.pi / 2, 2 * mp.pi]
    if kind == 'pulse':    brk = [0, 2 * mp.pi * D, 2 * mp.pi]
    f = lambda t: target_num(kind, t, D)
    a0 = mp.quad(f, brk) / (2 * mp.pi)
    out = []
    for k in range(1, N + 1):
        a = mp.quad(lambda t: f(t) * mp.cos(k * t), brk) / mp.pi
        b = mp.quad(lambda t: f(t) * mp.sin(k * t), brk) / mp.pi
        out.append((a, b))
    return a0, out

def mean_square(kind, D=None):
    brk = [0, mp.pi, 2 * mp.pi]
    if kind == 'triangle': brk = [0, mp.pi / 2, 3 * mp.pi / 2, 2 * mp.pi]
    if kind == 'pulse':    brk = [0, 2 * mp.pi * D, 2 * mp.pi]
    f = lambda t: target_num(kind, t, D)
    return mp.quad(lambda t: f(t) ** 2, brk) / (2 * mp.pi)

# ------------------------------------------------------------------- cases
CASES = [
    ('square_N1',    'square',   1,   None),
    ('square_N8',    'square',   8,   None),
    ('square_N51',   'square',   51,  None),
    ('sawtooth_N10', 'sawtooth', 10,  None),
    ('triangle_N9',  'triangle', 9,   None),
    ('pulse_D50_N9', 'pulse',    9,   0.50),
    ('pulse_D25_N12','pulse',    12,  0.25),
    ('pulse_D10_N20','pulse',    20,  0.10),
    ('pulse_D95_N15','pulse',    15,  0.95),
    ('halfsine_N10', 'halfsine', 10,  None),
]

out = []
for cid, kind, N, D in CASES:
    a0s, cs = coeffs_symbolic(kind, N, D)
    a0n, cn = coeffs_numeric(kind, N, D)
    a0 = float(a0s)
    harm, dev = [], [abs(float(a0s) - float(a0n))]
    for k, ((a, b), (an, bn)) in enumerate(zip(cs, cn), start=1):
        af, bf = float(a), float(b)
        dev.append(abs(af - float(an))); dev.append(abs(bf - float(bn)))
        amp = (af * af + bf * bf) ** 0.5
        import math
        harm.append({'n': k, 'a': af, 'b': bf, 'amp': amp,
                     'phase_deg': math.degrees(math.atan2(af, bf)),
                     'a_sym': str(a), 'b_sym': str(b)})
    MS = float(mean_square(kind, D))
    Epart = a0 ** 2 + sum(h['amp'] ** 2 / 2 for h in harm)
    out.append({'id': cid, 'wave': kind, 'N': N, 'duty': D,
                'a0_mean': a0, 'harmonics': harm,
                'mean_square': MS, 'parseval_partial_energy': Epart,
                'parseval_tail': MS - Epart,
                'crosscheck_max_abs': max(dev)})
    print(f"{cid:15s} a0={a0: .6f} MS={MS:.6f} Epart={Epart:.6f} tail={MS-Epart:.3e} "
          f"crosscheck={max(dev):.2e}")

# ---- Gibbs reference: square wave partial sums, fine grid ------------------
gib = []
for N in (7, 15, 51, 99):
    M = (N + 1) // 2
    bs = [(k, 4.0 / (k * mp.pi)) for k in range(1, N + 1, 2)]
    S = lambda t: sum(bk * mp.sin(k * t) for k, bk in bs)
    xpk = mp.pi / (N + 1)                       # analytic location of 1st peak
    peak = S(xpk)
    over = (peak - 1) / 2 * 100                 # % of the jump (jump = 2)
    gib.append({'N': N, 'x_peak': float(xpk), 'peak_value': float(peak),
                'overshoot_pct_of_jump': float(over)})
    print(f"Gibbs N={N:3d} x_peak={float(xpk):.5f} peak={float(peak):.6f} "
          f"overshoot={float(over):.4f}% of jump")
WG = float((2 / mp.pi) * mp.si(mp.pi))
print(f"Wilbraham-Gibbs limit: peak -> {WG:.9f}, overshoot -> {(WG-1)/2*100:.6f}% of jump")

with open(_gp.ref('fourier_series_ref.json'), 'w') as f:
    json.dump({'cases': out, 'gibbs': gib,
               'gibbs_limit_peak': WG,
               'gibbs_limit_overshoot_pct_of_jump': (WG - 1) / 2 * 100}, f, indent=1)
