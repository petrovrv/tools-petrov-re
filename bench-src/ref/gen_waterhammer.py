#!/usr/bin/env python3
"""
Independent reference for waterhammer.html
====================================================
A structurally independent Method-of-Characteristics solver for the
reservoir -> (pump) -> uniform elastic pipe -> valve -> tailwater system,
written from the governing equations only.

Governing equations (Wylie & Streeter, "Fluid Transients in Systems", 1993,
ch. 3; Chaudhry, "Applied Hydraulic Transients", 3rd ed., ch. 3):

    dH/dt + (a^2/(gA)) dQ/dx           = 0            (continuity)
    dQ/dt + gA dH/dx + f Q|Q| /(2 D A) = 0            (momentum)

integrated along dx/dt = +-a.  With Courant number 1 (dt = dx/a) the
characteristics land exactly on grid points, so:

    C+ : H_P = Cp - B Q_P ,  Cp = H(j-1) + B Q(j-1) - R Q(j-1)|Q(j-1)|
    C- : H_P = Cm + B Q_P ,  Cm = H(j+1) - B Q(j+1) + R Q(j+1)|Q(j+1)|
    B  = a/(g A),   R = f dx /(2 g D A^2)

Boundaries
    upstream   : constant-head reservoir, optionally with a pump whose head
                 is H0 s^2 - k Q|Q|,  k = (H0-Href)/Qref^2, s = exp(-(t-ttrip)/tau)
                 and an optional ideal check valve (Q clipped at 0).
    downstream : orifice valve to a tailwater reservoir,
                 Q = Cv(t) sqrt(H - Htail), Cv calibrated from the steady state.

Friction factor: f = 64/Re for Re < 2000, Colebrook-White solved to machine
precision by Brent's method for Re >= 4000, with a smoothstep blend in
between (the blend region is avoided by every benchmark case).

No cavitation model is exercised: every case is checked to stay above vapour
pressure, so the DVCM / threshold branches are inert.

This file writes bench-src/ref/waterhammer_ref.json.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math, os
import numpy as np
from scipy.optimize import brentq

G = 9.80665


# ----------------------------------------------------------------- friction
def colebrook(Re, rel):
    """Colebrook-White, exact root of 1/sqrt(f) = -2 log10(rel/3.7 + 2.51/(Re sqrt f))."""
    if Re <= 0:
        return float('nan')
    if Re < 2000:
        return 64.0 / Re
    rel = max(0.0, rel)
    g = lambda x: x + 2.0 * math.log10(rel / 3.7 + 2.51 * x / Re)
    return 1.0 / brentq(g, 1.0, 200.0, xtol=1e-15, rtol=8.9e-16) ** 2


def darcy_f(Re, rel):
    if Re <= 0:
        return 0.0
    if Re < 2000:
        return 64.0 / Re
    turb = colebrook(Re, rel)
    if Re >= 4000:
        return turb
    lam = 64.0 / Re
    t = (Re - 2000.0) / 2000.0
    s = t * t * (3 - 2 * t)
    return lam * (1 - s) + turb * s


# ------------------------------------------------- unsteady friction kernels
# Published coefficient tables (data, not the tool's code):
#   ZL_*  : Urbanowicz & Zarzycki (2012), 26-exponential approximation of the
#           Zielke laminar weighting function W(tau) = sum m_k exp(-n_k tau).
#   VB_*  : the 16-exponential approximation of tau^(-1/2) used with the
#           Vardy & Brown turbulent kernel W(tau) = A* exp(-B* tau)/sqrt(tau).
ZL_M = np.array([1, 1, 1, 1, 1, 2.141, 4.544, 7.566, 11.299, 16.531, 24.794,
                 36.229, 52.576, 78.150, 113.873, 165.353, 247.915, 369.561,
                 546.456, 818.871, 1209.771, 1770.756, 2651.257, 3968.686,
                 5789.566, 8949.468])
ZL_N = np.array([26.3744, 70.8493, 135.0198, 218.9216, 322.5544, 499.148,
                 1072.543, 2663.013, 6566.001, 15410.459, 35414.779, 80188.189,
                 177078.960, 388697.936, 850530.325, 1835847.582, 3977177.832,
                 8721494.927, 19120835.527, 42098544.558, 92940512.285,
                 203458923.000, 445270063.893, 985067938.878, 2166385706.058,
                 4766167206.672])
VB_M = np.array([5.03362, 6.4876, 10.7735, 19.904, 37.4754, 70.7117, 133.460,
                 251.933, 476.597, 902.22, 1602.04, 2894.84, 5085.55, 9190.11,
                 16118.6, 29117.3])
VB_N = np.array([4.78793, 51.0897, 210.868, 765.03, 2731.01, 9731.44, 34668.5,
                 123511, 440374, 1578229, 5481659, 18255921, 59753474,
                 192067361, 616415963, 1945566788])


def zielke_exact(tau):
    """Zielke (1968) laminar weighting function, both published branches."""
    if tau >= 0.02:
        return sum(math.exp(-n * tau) for n in
                   (26.3744, 70.8493, 135.0198, 218.9216, 322.5544))
    return (0.282095 * tau ** -0.5 - 1.25 + 1.057855 * tau ** 0.5
            + 0.9375 * tau + 0.396696 * tau ** 1.5 - 0.351563 * tau ** 2)


def vb_smooth_coeffs(Re):
    """Vardy & Brown smooth-pipe turbulent weighting coefficients."""
    Astar = 1.0 / (2 * math.sqrt(math.pi))
    kappa = math.log10(15.29 * Re ** -0.0567)
    return Astar, Re ** kappa / 12.86


def vb_rough_coeffs(Re, rel):
    """Vardy & Brown (2004) fully-rough turbulent weighting coefficients."""
    return 0.0103 * math.sqrt(Re) * rel ** 0.39, 0.352 * Re * rel ** 0.41


class Unsteady:
    """Recursive (Trikha/Kagawa/Vitkovsky) evaluation of

        J_u = (16 nu a dt) / (g D^2 A) * sum_k y_k ,
        y_k <- exp(-lam_k dtau) y_k + scale*m_k*exp(-lam_k dtau/2) dQ ,
        dtau = 4 nu dt / D^2 ,

    which is the reach-length form of the unsteady wall-shear head loss
    4 tau_w /(rho g D) * dx with tau_w = (4 rho nu / D) * conv(dV/dt, W).
    """

    def __init__(self, c, dt, A, M, N_, scale=1.0, shift=0.0, dynamic=False):
        self.M, self.Nk = np.asarray(M), np.asarray(N_)
        self.scale, self.shift, self.dynamic = scale, shift, dynamic
        self.dtau = 4 * c['nu'] * dt / (c['D'] ** 2)
        self.coeff = 16 * c['nu'] * dt * c['a'] / (c['D'] ** 2 * A * G)
        self.A, self.nu, self.D = A, c['nu'], c['D']
        n = c['N'] + 1
        self.yR = np.zeros((n, len(self.M)))
        self.yL = np.zeros((n, len(self.M)))
        if not dynamic:
            lam = self.Nk + shift
            self.decay = np.exp(-lam * self.dtau)
            self.gain = scale * self.M * np.exp(-lam * self.dtau / 2)

    def _coef_for(self, q):
        Re = abs(q) * self.D / (self.A * self.nu)
        Recr, = (2320,)
        Bcrit = vb_smooth_coeffs(Recr)[1]
        shift = (vb_smooth_coeffs(max(Recr, abs(Re)))[1] - Bcrit) if abs(Re) > Recr else 0.0
        lam = np.maximum(1e-12, self.Nk + shift)
        return np.exp(-lam * self.dtau), self.M * np.exp(-lam * self.dtau / 2)

    def headR(self, j):
        return self.coeff * self.yR[j].sum()

    def headL(self, j):
        return self.coeff * self.yL[j].sum()

    def update(self, j, dqR, qR, dqL, qL):
        if self.dynamic:
            d, g_ = self._coef_for(qR)
            self.yR[j] = d * self.yR[j] + g_ * dqR
            d, g_ = self._coef_for(qL)
            self.yL[j] = d * self.yL[j] + g_ * dqL
        else:
            self.yR[j] = self.decay * self.yR[j] + self.gain * dqR
            self.yL[j] = self.decay * self.yL[j] + self.gain * dqL


def make_unsteady(c, dt, A, Re0):
    m = c.get('frictionModel', 'quasi')
    if m == 'quasi':
        return None
    rel = c['eps'] / c['D']
    if m == 'zielke':
        return Unsteady(c, dt, A, ZL_M, ZL_N, 1.0, 0.0)
    if m == 'universal':
        return Unsteady(c, dt, A, ZL_M, ZL_N, 1.0, 0.0, dynamic=True)
    if m == 'vardy':
        As, Bs = vb_smooth_coeffs(Re0)
        return Unsteady(c, dt, A, VB_M, VB_N, As, Bs)
    if m == 'vardyRough':
        As, Bs = vb_rough_coeffs(Re0, rel)
        return Unsteady(c, dt, A, VB_M, VB_N, As, Bs)
    raise ValueError('unknown friction model ' + m)


# ----------------------------------------------------------------- geometry
def z_at(c, x):
    if c.get('elevMode') == 'profile':
        pts = c['elevProfile']
        if x <= pts[0][0]:
            return pts[0][1]
        if x >= pts[-1][0]:
            return pts[-1][1]
        for i in range(1, len(pts)):
            if x <= pts[i][0]:
                x0, z0 = pts[i - 1]
                x1, z1 = pts[i]
                return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
    return c['z0'] + (c['z1'] - c['z0']) * x / c['L']


# ------------------------------------------------------------------- events
def valve_opening(c, t):
    if not c.get('valveEvent'):
        return 1.0
    if t <= c['valveStart']:
        return 1.0
    if c['valveClose'] <= 1e-9:
        return c['valveFinal']
    u = min(1.0, max(0.0, (t - c['valveStart']) / c['valveClose']))
    law = c.get('valveLaw', 'linear')
    if law == 'cosine':
        u = 0.5 - 0.5 * math.cos(math.pi * u)
    elif law == 'power':
        u = u ** c['valveExp']
    return 1.0 - (1.0 - c['valveFinal']) * u


def pump_speed(c, t):
    if not c.get('pumpOn'):
        return 0.0
    if not c.get('pumpTrip') or t <= c['tripTime']:
        return 1.0
    return math.exp(-(t - c['tripTime']) / max(c['coastTau'], 1e-6))


def pump_head(c, Q, s):
    if not c.get('pumpOn'):
        return 0.0
    k = (c['pumpH0'] - c['pumpHr']) / c['pumpQr'] ** 2
    return c['pumpH0'] * s * s - k * Q * abs(Q)


# ------------------------------------------------------------------- solver
def run(c):
    L, D, a, N = c['L'], c['D'], c['a'], c['N']
    A = math.pi * D * D / 4
    B = a / (G * A)
    rel = c['eps'] / D
    dx = L / N
    dt = dx / a
    steps = int(math.floor(c['T'] / dt + 1e-10))
    x = np.array([j * dx for j in range(N + 1)])
    z = np.array([z_at(c, xi) for xi in x])

    # ---- steady state
    V0 = c['Q0'] / A
    Re0 = V0 * D / c['nu']
    f0 = darcy_f(Re0, rel)
    hf = f0 * L / D * V0 * V0 / (2 * G)
    hup = c['Hres'] + pump_head(c, c['Q0'], 1.0)
    hend = hup - hf
    dValve = hend - c['Htail']
    if dValve <= 1e-6:
        raise ValueError('inconsistent initial operating point')
    kval = c['Q0'] / math.sqrt(dValve)

    H = np.array([hup - hf * j / N for j in range(N + 1)])
    Q = np.full(N + 1, c['Q0'])
    uf = make_unsteady(c, dt, A, Re0)

    def pressure(j, h):
        return c['rho'] * G * (h - z[j]) / 1e5

    gmax = {'p': -1e300, 'j': 0, 't': 0.0}
    gmin = {'p': 1e300, 'j': 0, 't': 0.0}
    hist = []           # (t, j, p) of every new running extremum candidate
    pmin = np.full(N + 1, 1e300)
    pmax = np.full(N + 1, -1e300)

    def extrema(t):
        for j in range(N + 1):
            p = pressure(j, H[j])
            if p < pmin[j]:
                pmin[j] = p
            if p > pmax[j]:
                pmax[j] = p
            if p < gmin['p']:
                gmin.update(p=p, j=j, t=t)
            if p > gmax['p']:
                gmax.update(p=p, j=j, t=t)
            hist.append((t, j, p))

    store_every = max(1, math.ceil(steps / 520))
    frames, times = [], []

    def store(t):
        frames.append(H.copy())
        times.append(t)

    extrema(0.0)
    store(0.0)

    hvap = z + (c['pvap'] - c['patm']) / (c['rho'] * G)
    cav_hit = False

    for step in range(1, steps + 1):
        t = step * dt
        Cp = np.zeros(N + 1)
        Cm = np.zeros(N + 1)
        for j in range(1, N + 1):
            q = Q[j - 1]
            Re = abs(q) / A * D / c['nu']
            R = darcy_f(Re, rel) * dx / (2 * G * D * A * A)
            Ju = uf.headR(j - 1) if uf else 0.0
            Cp[j] = H[j - 1] + B * q - R * q * abs(q) - Ju
        for j in range(0, N):
            q = Q[j + 1]
            Re = abs(q) / A * D / c['nu']
            R = darcy_f(Re, rel) * dx / (2 * G * D * A * A)
            Ju = uf.headL(j + 1) if uf else 0.0
            Cm[j] = H[j + 1] - B * q + R * q * abs(q) + Ju

        Hn = np.zeros(N + 1)
        Qn = np.zeros(N + 1)

        # upstream boundary
        s = pump_speed(c, t)
        if not c.get('pumpOn'):
            Hn[0] = c['Hres']
            Qn[0] = (c['Hres'] - Cm[0]) / B
        else:
            k = (c['pumpH0'] - c['pumpHr']) / c['pumpQr'] ** 2
            # Cm0 + B q = Hres + H0 s^2 - k q|q|   (assume q >= 0 branch first)
            const = Cm[0] - c['Hres'] - c['pumpH0'] * s * s
            fn = lambda q: Cm[0] + B * q - (c['Hres'] + c['pumpH0'] * s * s - k * q * abs(q))
            lo, hi = -50 * max(c['Q0'], 1e-6), 50 * max(c['Q0'], 1e-6)
            q = brentq(fn, lo, hi, xtol=1e-14, rtol=8.9e-16)
            if c.get('checkMode') == 'ideal' and q < 0:
                Qn[0] = 0.0
                Hn[0] = Cm[0]
            else:
                Qn[0] = q
                Hn[0] = Cm[0] + B * q
        # interior
        for j in range(1, N):
            Hn[j] = (Cp[j] + Cm[j]) / 2
            Qn[j] = (Cp[j] - Cm[j]) / (2 * B)
        # downstream valve
        alpha = valve_opening(c, t)
        if alpha < 1e-6:
            Qn[N] = 0.0
            Hn[N] = Cp[N]
        else:
            Cv = kval * alpha
            fn = lambda q: (Cp[N] - B * q) - c['Htail'] - math.copysign(1.0, q if q != 0 else 1.0) * (q / Cv) ** 2
            span = max(abs(Cp[N] - c['Htail']), 1.0)
            qhi = Cv * math.sqrt(span) + abs(Cp[N] - c['Htail']) / B + 10 * c['Q0'] + 1
            q = brentq(fn, -qhi, qhi, xtol=1e-15, rtol=8.9e-16)
            Qn[N] = q
            Hn[N] = Cp[N] - B * q

        if uf:
            for j in range(N + 1):
                uf.update(j, Qn[j] - Q[j], Qn[j], Qn[j] - Q[j], Qn[j])
        H, Q = Hn, Qn
        extrema(t)
        if np.any(H < hvap):
            cav_hit = True
        if step % store_every == 0 or step == steps:
            store(t)

    # times at which the global extremum is attained to within 1e-9 relative
    # (an instantaneously closed valve gives a nearly flat plateau, so the
    # argmax is degenerate and the tie-break is arbitrary)
    tie_max = sorted({round(t, 12) for (t, j, p) in hist
                      if abs(p - gmax['p']) <= 1e-9 * max(1.0, abs(gmax['p'])) and j == gmax['j']})
    tie_min = sorted({round(t, 12) for (t, j, p) in hist
                      if abs(p - gmin['p']) <= 1e-9 * max(1.0, abs(gmin['p'])) and j == gmin['j']})
    return dict(tie_max=tie_max, tie_min=tie_min,
                dx=dx, dt=dt, steps=steps, Tsim=steps * dt, x=x, z=z,
                frames=frames, times=times, kval=kval, hup=hup, hf=hf, f0=f0,
                Re0=Re0, V0=V0, B=B, A=A,
                globalMax=gmax, globalMin=gmin,
                pmin=pmin, pmax=pmax, cav=cav_hit)


# -------------------------------------------------------------------- cases
BASE = dict(
    L=1200, D=0.6, eps=0.045e-3, a=1000, z0=0, z1=0, elevMode='linear',
    rho=998, nu=1.004e-6, patm=101325, pvap=2340, Q0=0.28,
    Hres=200, Htail=140, pumpOn=False, checkMode='none',
    valveEvent=True, valveStart=0.5, valveClose=0.0, valveFinal=0.0,
    valveLaw='linear', valveExp=2, N=100, T=5.0,
)


def case(cid, note, **over):
    c = dict(BASE)
    c.update(over)
    return dict(id=cid, note=note, cfg=c)


CASES = [
    case('instant_closure_no_pump',
         'Instantaneous valve closure, reservoir only. First-step head rise at the valve '
         'must equal the Joukowsky value a*V0/g exactly.'),
    case('gradual_2s_linear',
         'Linear 2 s closure (Tc >> 2L/a = 2.4 s is not satisfied; Tc ~ 2L/a).',
         valveClose=2.0),
    case('slow_10s_cosine',
         'Slow smooth-cosine 10 s closure; Michaud regime 2LV0/(g Tc).',
         valveClose=10.0, valveLaw='cosine', T=14.0),
    case('power_law_closure',
         'Power-law closure, exponent 2.5, partial closure to 8 % opening.',
         valveClose=3.0, valveLaw='power', valveExp=2.5, valveFinal=0.08, T=12.0),
    case('laminar_oil',
         'Laminar oil line, Re ~ 1000, f = 64/Re exactly; no Colebrook involved.',
         L=200, D=0.1, a=1200, nu=1e-4, Q0=math.pi * 0.1 ** 2 / 4 * 1.0,
         Hres=220, Htail=150, valveClose=0.0, N=40, T=2.0),
    case('rough_pipe_highRe',
         'Rough pipe eps/D = 5e-3, Re ~ 1.3e6, fully-rough-dominant Colebrook branch.',
         eps=3e-3, Q0=0.6, Hres=340, Htail=140, valveClose=1.0, T=8.0),
    case('sloping_pipe',
         'Linear rise z0=0 -> z1=40 m; checks p = rho g (H - z) along the pipe.',
         z0=0, z1=40, Hres=250, Htail=160, valveClose=1.5, T=8.0),
    case('elevation_profile',
         'Piecewise-linear profile with an intermediate high point at x=600 m.',
         elevMode='profile', elevProfile=[(0, 0), (600, 45), (1200, 10)],
         Hres=260, Htail=170, valveClose=1.5, T=8.0),
    case('pump_running_closure',
         'Pump in service (quadratic curve) with a 2 s linear valve closure.',
         pumpOn=True, pumpH0=195, pumpQr=0.28, pumpHr=170, Hres=10, Htail=140,
         checkMode='ideal', valveClose=2.0, T=10.0),
    case('pump_trip_ideal_check',
         'Pump trip with exponential coast-down and an ideal check valve; '
         'the downstream valve stays open.',
         pumpOn=True, pumpH0=195, pumpQr=0.28, pumpHr=170, Hres=10, Htail=140,
         pumpTrip=True, tripTime=0.5, coastTau=1.5, checkMode='ideal',
         valveEvent=False, T=10.0, Q0=0.20),
    case('zielke_laminar_unsteady',
         'Zielke laminar unsteady friction (26-term Urbanowicz-Zarzycki recursive '
         'convolution) on the laminar oil line, Re ~ 1000.',
         L=200, D=0.1, a=1200, nu=1e-4, Q0=math.pi * 0.1 ** 2 / 4 * 1.0,
         Hres=220, Htail=150, valveClose=0.0, N=40, T=2.0,
         frictionModel='zielke'),
    case('universal_laminar_equals_zielke',
         'Universal Zielke<->Vardy-Brown weighting on the same laminar line: below '
         'Re_cr = 2320 the coefficient shift is zero, so it must reproduce Zielke exactly.',
         L=200, D=0.1, a=1200, nu=1e-4, Q0=math.pi * 0.1 ** 2 / 4 * 1.0,
         Hres=220, Htail=150, valveClose=0.0, N=40, T=2.0,
         frictionModel='universal'),
    case('vardy_brown_smooth_turbulent',
         'Frozen smooth-wall Vardy-Brown unsteady friction, Re ~ 5.9e5, eps/D = 1.7e-6.',
         eps=1e-6, valveClose=0.5, T=6.0, frictionModel='vardy'),
    case('universal_turbulent',
         'Universal weighting with the coefficient shift updated from the local '
         'Reynolds number, same smooth pipe.',
         eps=1e-6, valveClose=0.5, T=6.0, frictionModel='universal'),
    case('vardy_brown_fully_rough',
         'Fully-rough Vardy-Brown asymptote, eps/D = 5e-3, Re ~ 2e5, partial closure '
         'to 20 % opening.',
         L=800, D=0.2, eps=1.0e-3, a=1000, rho=998, nu=1e-6,
         Q0=math.pi * 0.2 ** 2 / 4 * 1.0, Hres=220, Htail=212,
         valveStart=1.0, valveClose=0.2, valveFinal=0.20, valveLaw='cosine',
         N=80, T=3.0, frictionModel='vardyRough'),
    case('fine_grid_N200',
         'Same as the instantaneous case but N=200 (grid refinement).',
         N=200, T=5.0),
]


def main():
    out = []
    for cs in CASES:
        c = cs['cfg']
        r = run(c)
        rec = dict(cs)
        rec['ref'] = dict(
            dx=r['dx'], dt=r['dt'], steps=r['steps'], Tsim=r['Tsim'],
            V0=r['V0'], Re0=r['Re0'], f0=r['f0'], hf=r['hf'], kval=r['kval'],
            joukowsky_dH=c['a'] * r['V0'] / G,
            joukowsky_bar=c['rho'] * c['a'] * r['V0'] / 1e5,
            round_trip=2 * c['L'] / c['a'],
            globalMax=r['globalMax'], globalMin=r['globalMin'],
            tie_max=r['tie_max'], tie_min=r['tie_min'],
            times=list(r['times']),
            x=list(r['x']), z=list(r['z']),
            frames=[list(map(float, fr)) for fr in r['frames']],
            pmin=list(map(float, r['pmin'])), pmax=list(map(float, r['pmax'])),
            cavitated=bool(r['cav']),
        )
        out.append(rec)
        print(f"{cs['id']:26s} steps={r['steps']:5d} frames={len(r['frames']):4d} "
              f"Hmax={r['globalMax']['p']:.4f} bar Hmin={r['globalMin']['p']:.4f} bar "
              f"cav={r['cav']}")
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'waterhammer_ref.json')
    with open(path, 'w') as fh:
        json.dump({'generator': 'gen_waterhammer.py',
                   'description': 'Independent MOC (Courant=1) reference for waterhammer.html',
                   'cases': out}, fh)
    print('wrote', path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
