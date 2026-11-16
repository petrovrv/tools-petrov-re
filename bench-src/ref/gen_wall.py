#!/usr/bin/env python3
"""
Independent reference for wallthermalcalculator.html.

Nothing here is derived from the tool's JavaScript. Everything is implemented
from the text of the standards:

  EN ISO 6946:2017  - R = d/lambda; R_T = Rsi + sum(R) + Rse; U = 1/R_T
                      Table 7  : surface resistances by heat-flow direction
                      Table D.1: unventilated air layers (linear interpolation)
                      6.7      : combined method (upper/lower limits) for
                                 inhomogeneous layers
                      6.9.4    : well ventilated air layer -> disregard the layer
                                 and everything outside it, Rse := still air
  EN ISO 13788:2012 - E.1/E.2 saturation vapour pressure, E.3 dew point
                      6.       Glaser: vapour pressure line = greatest convex
                               minorant of the saturation profile in sd-space,
                               g = delta0 * dp/dsd, delta0 = 2e-10 kg/(m s Pa)
                      4.2      internal humidity classes, p_i = p_e + dp
  EN ISO 13786:2017 - A.2 heat transfer matrix of a layer, periodic quantities

Cross-check of the ISO 13788 psat correlation against CoolProp is recorded
separately (crosscheck), not used to grade the tool.
"""
import json, math, cmath, copy

DELTA0 = 2.0e-10          # kg/(m*s*Pa), ISO 13788 6.1

# ---------- ISO 13788 Annex E ------------------------------------------------
def psat(th):
    if th >= 0:
        return 610.5 * math.exp(17.269 * th / (237.3 + th))
    return 610.5 * math.exp(21.875 * th / (265.5 + th))

def th_from_psat(p):
    """inverse of psat by bisection - structurally independent of E.3"""
    lo, hi = -80.0, 120.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if psat(mid) < p: lo = mid
        else: hi = mid
    return 0.5 * (lo + hi)

def dew_point(th, rh):
    return th_from_psat(max(1e-9, rh / 100.0 * psat(th)))

# ---------- ISO 6946 ---------------------------------------------------------
SURFACE = {                       # Table 7
    'roof':  dict(rsi=0.10, rse=0.04, dir='u'),
    'wall':  dict(rsi=0.13, rse=0.04, dir='h'),
    'floor': dict(rsi=0.17, rse=0.04, dir='d'),
}
# Table D.1 - unventilated air layers, high emissivity, m2K/W
AIR_T = [0, 5, 7, 10, 15, 25, 50, 100, 300]
AIR_R = {'u': [0, .11, .13, .15, .16, .16, .16, .16, .16],
         'h': [0, .11, .13, .15, .17, .18, .18, .18, .18],
         'd': [0, .11, .13, .15, .17, .19, .21, .22, .23]}

def air_layer_R(d_mm, direction):
    """Table D.1 with linear interpolation on thickness."""
    xs, ys = AIR_T, AIR_R[direction]
    if d_mm <= xs[0]: return ys[0]
    if d_mm >= xs[-1]: return ys[-1]
    for i in range(1, len(xs)):
        if d_mm <= xs[i]:
            f = (d_mm - xs[i-1]) / (xs[i] - xs[i-1])
            return ys[i-1] + f * (ys[i] - ys[i-1])

def layer_R(L, direction):
    if L.get('cavity'):
        if 'Rfix' in L: return L['Rfix']
        return air_layer_R(L['d'], direction)
    return L['d'] / 1000.0 / L['lam']

def layer_sd(L):
    return L['mu'] * L['d'] / 1000.0

# ---------- Glaser (ISO 13788 clause 6) --------------------------------------
def convex_minorant(pts, p0, p1):
    """
    pts: list of (sd, psat) for internal surface .. external surface.
    Returns the vertices of the greatest convex minorant of the saturation
    profile between the fixed end pressures p0, p1 (the taut string).
    Recursive max-violation split - structurally different from a monotone
    chain hull.
    """
    P = [(pts[0][0], min(p0, pts[0][1]))] + list(pts[1:-1]) + \
        [(pts[-1][0], min(p1, pts[-1][1]))]

    def rec(i, j):
        # chord from P[i] to P[j]; find interior node with largest violation
        worst, wk = 0.0, -1
        for k in range(i + 1, j):
            f = (P[k][0] - P[i][0]) / (P[j][0] - P[i][0]) if P[j][0] > P[i][0] else 0.0
            line = P[i][1] + f * (P[j][1] - P[i][1])
            v = line - P[k][1]
            if v > worst + 1e-12:
                worst, wk = v, k
        if wk < 0:
            return [P[j]]
        return rec(i, wk) + rec(wk, j)

    return [P[0]] + rec(0, len(P) - 1)

def glaser(nodes_sd, nodes_th, pi, pe):
    pts = list(zip(nodes_sd, [psat(t) for t in nodes_th]))
    hull = convex_minorant(pts, pi, pe)
    interfaces = []
    for i in range(1, len(hull) - 1):
        a, b, c = hull[i-1], hull[i], hull[i+1]
        gin  = DELTA0 * (a[1] - b[1]) / (b[0] - a[0])
        gout = DELTA0 * (b[1] - c[1]) / (c[0] - b[0])
        interfaces.append(dict(sd=b[0], p=b[1], g=gin - gout))
    return dict(hull=hull, interfaces=interfaces,
                condensing=len(interfaces) > 0,
                gTotal=sum(max(0.0, x['g']) for x in interfaces))

# ---------- ISO 13786 --------------------------------------------------------
def mat_layer(d, lam, rho, c, T=86400.0):
    delta = math.sqrt(lam * T / (math.pi * rho * c))
    x = d / delta
    ch, sh, co, si = math.cosh(x), math.sinh(x), math.cos(x), math.sin(x)
    Z11 = complex(ch * co, sh * si)
    Z12 = -(delta / (2 * lam)) * complex(sh * co + ch * si, ch * si - sh * co)
    Z21 = -(lam / delta) * complex(sh * co - ch * si, sh * co + ch * si)
    return [[Z11, Z12], [Z21, Z11]]

def res_layer(R):
    return [[1 + 0j, complex(-R, 0)], [0j, 1 + 0j]]

def mmul(A, B):
    return [[A[0][0]*B[0][0] + A[0][1]*B[1][0], A[0][0]*B[0][1] + A[0][1]*B[1][1]],
            [A[1][0]*B[0][0] + A[1][1]*B[1][0], A[1][0]*B[0][1] + A[1][1]*B[1][1]]]

def dynamic(layers, Rsi, Rse, U, T=86400.0):
    Z = res_layer(Rsi)
    for L in layers:
        Z = mmul(L, Z)
    Z = mmul(res_layer(Rse), Z)
    Z11, Z12, Z22 = Z[0][0], Z[0][1], Z[1][1]
    Y12 = 1.0 / abs(Z12)
    shift = -(T / (2 * math.pi)) * cmath.phase(-1.0 / Z12) / 3600.0
    k1 = (T / (2 * math.pi)) * abs((Z11 - 1) / Z12) / 1000.0
    k2 = (T / (2 * math.pi)) * abs((Z22 - 1) / Z12) / 1000.0
    return dict(Y12=Y12, decrement=Y12 / U, shift=(shift % 24 + 24) % 24,
                kappaIn=k1, kappaOut=k2)

# ---------- assembly ---------------------------------------------------------
def assembly(case):
    # ISO 6946:2017 6.9.3 - slightly ventilated air layer: R_tot is interpolated
    # between the unventilated and the well ventilated construction on the
    # opening area Av; at the midpoint of the range (Av = 1000 mm2/m) that is
    # the mean of the two bounds.
    layers0 = case['layers']
    si = next((i for i, L in enumerate(layers0)
               if L.get('vent') == 'slight' and L.get('cavity')), -1)
    st = next((i for i, L in enumerate(layers0)
               if L.get('vent') == 'strong' and L.get('cavity')), -1)
    if si >= 0 and (st < 0 or st > si):
        def swap(v):
            c = copy.deepcopy(case)
            c['layers'][si]['vent'] = v
            return c
        nve = assembly(swap('none'))
        ve = assembly(swap('strong'))
        R_T = 0.5 * (nve['R_T'] + ve['R_T'])
        U = 1.0 / R_T
        Uc = U + nve['dU']
        out = dict(nve)
        out.update(R_T=R_T, U=U, Uc=Uc, fRsi=1 - nve['Rsi'] * Uc,
                   thSiDesign=case['te'] + (1 - nve['Rsi'] * Uc) * (case['ti'] - case['te']))
        return out
    typ = case.get('type', 'wall')
    S = SURFACE[typ]
    direction = S['dir']
    Rsi = case.get('rsi') or S['rsi']
    Rse = case.get('rse') or S['rse']
    layers = [dict(L) for L in case['layers']]

    # 6.9.4 well ventilated air layer
    vi = next((i for i, L in enumerate(layers)
               if L.get('vent') == 'strong' and L.get('cavity')), -1)
    if vi >= 0:
        layers = layers[:vi]
        Rse = Rsi

    R = [layer_R(L, direction) for L in layers]
    sd = [layer_sd(L) for L in layers]

    # 6.7 combined method
    framed = [i for i, L in enumerate(layers) if L.get('frac')]
    R_T_1d = Rsi + sum(R) + Rse
    Reff = list(R)
    Rup = Rlo = R_T_1d
    if framed:
        n = len(framed)
        tot = 0.0
        for mask in range(1 << n):
            a, Rp = 1.0, Rsi + Rse + sum(R)
            for j, i in enumerate(framed):
                f = layers[i]['frac'] / 100.0
                Rb = layers[i]['d'] / 1000.0 / layers[i]['framelam']
                if mask >> j & 1:
                    a *= f;  Rp += Rb - R[i]
                else:
                    a *= 1 - f
            tot += a / Rp
        Rup = 1.0 / tot
        for i in framed:
            f = layers[i]['frac'] / 100.0
            Rb = layers[i]['d'] / 1000.0 / layers[i]['framelam']
            Reff[i] = 1.0 / ((1 - f) / R[i] + f / Rb)
        Rlo = Rsi + sum(Reff) + Rse
    R_T = 0.5 * (Rup + Rlo) if framed else R_T_1d
    U = 1.0 / R_T

    dU = sum(b.get('psi', 0) * b.get('qty', 0) if b['kind'] == 'linear'
             else b.get('chi', 0) * b.get('qty', 0) for b in case.get('bridges', []))
    Uc = U + dU

    # temperature profile
    R_prof = Rsi + sum(Reff) + Rse
    ti, te = case['ti'], case['te']
    dth = ti - te
    acc = Rsi
    nodes_th = [ti - dth * Rsi / R_prof]
    nodes_sd = [0.0]
    s = 0.0
    for i in range(len(layers)):
        acc += Reff[i]; s += sd[i]
        nodes_th.append(ti - dth * acc / R_prof)
        nodes_sd.append(s)
    thSi = nodes_th[0]
    thSe = te + dth * Rse / R_prof
    fRsi = 1 - Rsi * Uc
    thSiDesign = te + fRsi * dth

    pi = case['rhi'] / 100.0 * psat(ti)
    pe = case['rhe'] / 100.0 * psat(te)
    gl = glaser(nodes_sd, nodes_th, pi, pe)

    tdew = dew_point(ti, case['rhi'])
    # dew point position
    dewpos = None
    if tdew >= nodes_th[0]:
        dewpos = dict(where='surface', mm=0.0)
    else:
        for i in range(len(layers)):
            a, b = nodes_th[i], nodes_th[i+1]
            if a >= tdew >= b:
                f = (a - tdew) / (a - b) if (a - b) > 1e-9 else 0.0
                mm = sum(layers[k]['d'] for k in range(i)) + f * layers[i]['d']
                dewpos = dict(where='inside', layer=i, mm=mm)
                break
        if dewpos is None:
            dewpos = dict(where='outside', mm=sum(L['d'] for L in layers))

    dyn = None
    if all(('rho' in L and 'c' in L) or L.get('cavity') for L in layers):
        dl = []
        for i, L in enumerate(layers):
            if L.get('cavity'):
                dl.append(res_layer(Reff[i]))
            elif i in framed:
                f = L['frac'] / 100.0
                dl.append(mat_layer(L['d']/1000.0, L['d']/1000.0/Reff[i], 1.0,
                                    (1-f)*L['rho']*L['c'] + f*L['framerho']*L['framec']))
            else:
                dl.append(mat_layer(L['d']/1000.0, L['lam'], L['rho'], L['c']))
        dyn = dynamic(dl, Rsi, Rse, 1.0 / R_prof)

    return dict(Rsi=Rsi, Rse=Rse, R=R, sd=sd, Reff=Reff, R_T=R_T, R_T_1d=R_T_1d,
                Rupper=Rup, Rlower=Rlo, U=U, Uc=Uc, dU=dU, fRsi=fRsi,
                nodes_th=nodes_th, nodes_sd=nodes_sd, thSi=thSi, thSe=thSe,
                thSiDesign=thSiDesign, pi=pi, pe=pe, glaser=gl, tdew=tdew,
                dewpos=dewpos, dyn=dyn,
                mass=sum(L.get('rho', 0) * L['d'] / 1000.0
                         for L in layers if not L.get('cavity')),
                totalD=sum(L['d'] for L in layers))

# ---------- ISO 13788 clause 4.2 + clause 6 annual balance -------------------
DP_CLASS = [270.0, 540.0, 810.0, 1080.0, 1350.0]     # dv*Rv*293.15, classes 1..5

def indoor_rh(te, ti, cls, rhe):
    dp = DP_CLASS[cls]
    if te >= 20: d = 0.0
    elif te > 0: d = dp * (1 - te / 20.0)
    else: d = dp
    pi = rhe / 100.0 * psat(te) + d
    return max(0.0, min(100.0, 100.0 * pi / psat(ti)))

def annual_balance(case, monthly_te, monthly_rhe):
    """
    ISO 13788 clause 6.  Per-interface accumulation, 12 months starting at the
    first month that begins to accumulate, evaporation at a wet interface
    computed with p = psat there.
    """
    months = []
    for m in range(12):
        c = copy.deepcopy(case)
        c['te'] = monthly_te[m]
        c['rhe'] = monthly_rhe[m]
        c['rhi'] = indoor_rh(monthly_te[m], case['ti'], case['humidityClass'],
                             monthly_rhe[m])
        months.append(assembly(c))
    secs = 86400 * 30.4

    def start_month():
        for m in range(12):
            if months[m]['glaser']['condensing'] and \
               not months[(m + 11) % 12]['glaser']['condensing']:
                return m
        return 0

    start = start_month()
    acc = {}                      # sd of interface -> kg/m2
    peak = 0.0
    series = [None] * 12
    for k in range(12):
        m = (start + k) % 12
        r = months[m]
        gl = r['glaser']
        gain = 0.0
        # condensation at each hull interface
        wet_now = {}
        for itf in gl['interfaces']:
            g = max(0.0, itf['g']) * secs
            key = round(itf['sd'], 9)
            wet_now[key] = True
            acc[key] = acc.get(key, 0.0) + g
            gain += g
        # evaporation at wet interfaces that are not condensing this month
        dry = 0.0
        for key in list(acc.keys()):
            if key in wet_now or acc[key] <= 0:
                continue
            # locate the node
            idx = min(range(len(r['nodes_sd'])),
                      key=lambda i: abs(r['nodes_sd'][i] - key))
            pc = psat(r['nodes_th'][idx])
            sd_in = max(1e-6, r['nodes_sd'][idx])
            sd_out = max(1e-6, r['nodes_sd'][-1] - r['nodes_sd'][idx])
            gev = DELTA0 * ((pc - r['pi']) / sd_in + (pc - r['pe']) / sd_out)
            ev = max(0.0, gev) * secs
            ev = min(ev, acc[key])
            acc[key] -= ev
            dry += ev
        tot = sum(acc.values())
        peak = max(peak, tot)
        series[m] = dict(m=m, gain=gain * 1000, dry=dry * 1000, acc=tot * 1000)
    return dict(peak=peak * 1000, endsDry=sum(acc.values()) <= 1e-6,
                start=start, series=series,
                anyCond=any(x['glaser']['condensing'] for x in months))
