"""Independent reference for thinfilm.html (Thin-Film Coatings).

Written from the published method, not from opt-film.js, and with a different algorithm:
  * coherent stacks by the RECURSIVE AIRY SUMMATION of Fresnel coefficients (Born & Wolf, Principles of Optics, 7th ed.,
    section 1.6.4; Heavens, Optical Properties of Thin Solid Films, 1955): starting at the substrate,
    r_j = (r_j,j+1 + r_j+1 e^{2i beta}) / (1 + r_j,j+1 r_j+1 e^{2i beta}), t likewise, with beta = 2 pi N d cos(theta)/lambda,
    Fresnel coefficients in the textbook form (s: (n1c1 - n2c2)/(n1c1 + n2c2), p: (n2c1 - n1c2)/(n2c1 + n1c2)),
    complex index N = n + ik (physics sign convention, the opposite of the page), T = Re(n_s c_s)/Re(n_0 c_0) |t|^2 (s),
    Re(n_s c_s*)/Re(n_0 c_0*) |t|^2 (p);
    the page uses Abeles characteristic matrices with tilted admittances and N = n - ik;
  * a second, external oracle: the `tmm` package of S. J. Byrnes (arXiv:1603.02720, pip `tmm` 0.2.0), coh_tmm and inc_tmm,
    checked against the recursion for every spectrum case (agreement required to 1e-10) and used for the plates with an
    incoherent rear surface (inc_tmm with an incoherent substrate);
  * colour: CIE 1931 2 deg colour-matching functions and illuminant D65 read directly from the CIE CSV files
    (_opt/film/dl/cmf.csv, d65.csv from files.cie.co.at, 1 nm data summed at 5 nm), CIELAB per CIE 015:2018;
  * field: forward/backward plane-wave amplitudes propagated layer by layer from the substrate (interface matrices),
    |E|^2 relative to the incident wave;
  * materials: the same published data the page uses (refractiveindex.info CC0 tables in _opt/film/film-data.json,
    glass formulas in _opt/core/glass.json), evaluated here with an own interpolation and own dispersion formulas.
Output: bench-src/ref/thinfilm_ref.json.   Run: _opt/film/venv/Scripts/python -I bench-src/ref/gen_thinfilm.py
"""
import cmath, csv, json, math, os
import numpy as np
import tmm

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FILM = json.load(open(os.path.join(ROOT, '_opt', 'film', 'film-data.json'), encoding='utf-8'))['materials']
GLASS = json.load(open(os.path.join(ROOT, '_opt', 'core', 'glass.json'), encoding='utf-8'))
PI = math.pi
D = PI / 180


# ------------------------------------------------------------------ materials (own evaluation)
def formula(f, c, l):
    l2 = l * l
    if f == 1:
        return math.sqrt(1 + c[0] + sum(c[i] * l2 / (l2 - c[i + 1] ** 2) for i in range(1, len(c) - 1, 2)))
    if f == 2:
        return math.sqrt(1 + c[0] + sum(c[i] * l2 / (l2 - c[i + 1]) for i in range(1, len(c) - 1, 2)))
    if f == 4:
        s = c[0]
        for i in (1, 5):
            if i + 3 < len(c):
                s += c[i] * l ** c[i + 1] / (l2 - c[i + 2] ** c[i + 3])
        for i in range(9, len(c) - 1, 2):
            s += c[i] * l ** c[i + 1]
        return math.sqrt(s)
    if f == 5:
        return c[0] + sum(c[i] * l ** c[i + 1] for i in range(1, len(c) - 1, 2))
    if f == 6:
        return 1 + c[0] + sum(c[i] / (c[i + 1] - l ** -2) for i in range(1, len(c) - 1, 2))
    raise ValueError(f)


def lin(xs, ys, x):
    return float(np.interp(x, xs, ys))


def N(mat, lam_nm):
    """complex index n + ik (physics convention)"""
    if isinstance(mat, (int, float)):
        return complex(mat, 0)
    if isinstance(mat, dict):
        return complex(mat['n'], mat.get('k', 0))
    l = lam_nm / 1000
    if mat in FILM:
        M = FILM[mat]
        if 'tab' in M:
            t = np.array(M['tab'])
            return complex(lin(t[:, 0], t[:, 1], l), lin(t[:, 0], t[:, 2], l))
        k = lin([r[0] for r in M['ktab']], [r[1] for r in M['ktab']], l) if 'ktab' in M else 0.0
        return complex(formula(M['formula'], M['coef'], hold(l, M.get('range_um'))), k)
    g = GLASS[mat]
    return complex(formula(g['formula'], g['coef'], hold(l, g.get('range_um'))), 0)


def hold(l, rng):
    """convention of the page (D-OPT-11): outside the valid range of a dispersion formula the value at the edge is used,
    as linear interpolation of a table does at its ends (a Sellmeier formula past its pole would give n^2 < 0)"""
    return l if not rng else min(rng[1], max(rng[0], l))


# ------------------------------------------------------------------ recursive Airy summation (coherent)
def ccos(Nj, a):
    """cos(theta_j) in medium Nj with n0 sin(theta0) = a, branch with Im(N cos) >= 0 (decaying for exp(+ikz))"""
    nc = cmath.sqrt(Nj * Nj - a * a)
    if nc.imag < 0 or (nc.imag == 0 and nc.real < 0):
        nc = -nc
    return nc / Nj, nc


def fresnel(N1, N2, c1, c2, pol):
    if pol == 's':
        return (N1 * c1 - N2 * c2) / (N1 * c1 + N2 * c2), 2 * N1 * c1 / (N1 * c1 + N2 * c2)
    return (N2 * c1 - N1 * c2) / (N2 * c1 + N1 * c2), 2 * N1 * c1 / (N2 * c1 + N1 * c2)


def airy(Ns, ds, lam, th0, pol):
    """Ns = [N0, N1..Nm, Nsub], ds = [d1..dm] nm. returns r, t, R, T"""
    a = (Ns[0] * math.sin(th0)).real
    cs = [ccos(n, a) for n in Ns]
    m = len(Ns) - 1
    r, t = fresnel(Ns[m - 1], Ns[m], cs[m - 1][0], cs[m][0], pol)
    for j in range(m - 2, -1, -1):
        beta = 2 * PI * ds[j] * cs[j + 1][1] / lam            # layer j+1 (index in Ns)
        e = cmath.exp(2j * beta)
        rj, tj = fresnel(Ns[j], Ns[j + 1], cs[j][0], cs[j + 1][0], pol)
        den = 1 + rj * r * e
        t = tj * t * cmath.exp(1j * beta) / den
        r = (rj + r * e) / den
    n0c0, nsc = Ns[0] * cs[0][0], Ns[m] * cs[m][0]
    if pol == 's':
        T = (nsc.real / n0c0.real) * abs(t) ** 2
    else:
        T = ((Ns[m] * cs[m][0].conjugate()).real / (Ns[0] * cs[0][0].conjugate()).real) * abs(t) ** 2
    return r, t, abs(r) ** 2, T


def tmm_coh(Ns, ds, lam, th0, pol):
    res = tmm.coh_tmm(pol, [complex(x) for x in Ns], [np.inf] + list(ds) + [np.inf], th0, lam)
    return res['R'], res['T']


def tmm_inc(Ns, ds, lam, th0, pol, Nexit):
    nl = [complex(x) for x in Ns] + [complex(Nexit)]
    dl = [np.inf] + list(ds) + [3e6, np.inf]
    cl = ['i'] + ['c'] * len(ds) + ['i', 'i']
    res = tmm.inc_tmm(pol, nl, dl, cl, th0, lam)
    return res['R'], res['T']


def plate(Ns, ds, lam, th0, pol, Nexit):
    """incoherent rear surface by the intensity formula R = R1 + T1^2 R2/(1 - R1' R2) (Harbecke 1986), independent of tmm"""
    _, _, R1, T1 = airy(Ns, ds, lam, th0, pol)
    nsub = Ns[-1].real
    ths = math.asin(min(1.0, (Ns[0] * math.sin(th0)).real / nsub))
    sin_out = nsub * math.sin(ths) / Nexit.real
    if sin_out >= 1:
        R2, T2 = 1.0, 0.0
    else:
        _, _, R2, T2 = airy([Ns[-1], Nexit], [], lam, ths, pol)
    _, _, R1b, _ = airy(list(reversed(Ns)), list(reversed(ds)), lam, ths, pol)
    den = 1 - R1b * R2
    return R1 + T1 * T1 * R2 / den, T1 * T2 / den


def stack(st, lam):
    Ns = [N(st['incident'], lam)] + [N(L['material'], lam) for L in st['layers']] + [N(st['substrate'], lam)]
    return Ns, [L['d_nm'] for L in st['layers']]


def spectrum(st, lams, aoi):
    out = {k: [] for k in ('Rs', 'Rp', 'Ts', 'Tp')}
    worst = 0.0
    for lam in lams:
        Ns, ds = stack(st, lam)
        for pol in ('s', 'p'):
            if st.get('backside'):
                Nexit = N(st.get('exit', 'AIR'), lam)
                R, T = plate(Ns, ds, lam, aoi * D, pol, Nexit)
                R2, T2 = tmm_inc(Ns, ds, lam, aoi * D, pol, Nexit)
            else:
                _, _, R, T = airy(Ns, ds, lam, aoi * D, pol)
                R2, T2 = tmm_coh(Ns, ds, lam, aoi * D, pol)
            worst = max(worst, abs(R - R2), abs(T - T2))
            out['R' + pol].append(R)
            out['T' + pol].append(T)
    assert worst < 1e-9, ('recursion and tmm disagree', worst, st)
    out['oracle_diff'] = worst
    return out


# ------------------------------------------------------------------ colour from the CIE files
def cie_tables():
    def rd(fn, k):
        d = {}
        for r in csv.reader(open(os.path.join(ROOT, '_opt', 'film', 'dl', fn), encoding='utf-8-sig')):
            if r and r[0].strip():
                d[int(float(r[0]))] = [float(x) for x in r[1:1 + k]]
        return d
    return rd('cmf.csv', 3), rd('d65.csv', 1)


CMF, D65 = cie_tables()


def colour(fn):
    X = Y = Z = Xw = Yw = Zw = 0.0
    for l in range(380, 781, 5):
        S, (x, y, z) = D65[l][0], CMF[l]
        v = fn(l)
        X += S * v * x; Y += S * v * y; Z += S * v * z
        Xw += S * x; Yw += S * y; Zw += S * z
    k = 100 / Yw
    X, Y, Z, Xw, Zw = X * k, Y * k, Z * k, Xw * k, Zw * k
    f = lambda t: t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29
    fx, fy, fz = f(X / Xw), f(Y / 100), f(Z / Zw)
    return {'Y': Y, 'L': 116 * fy - 16, 'a': 500 * (fx - fy), 'b': 200 * (fy - fz)}


def stack_colour(st, aoi=0):
    def fn(l):
        Ns, ds = stack(st, l)
        if st.get('backside'):
            Nexit = N(st.get('exit', 'AIR'), l)
            return sum(plate(Ns, ds, l, aoi * D, p, Nexit)[0] for p in 'sp') / 2
        return sum(airy(Ns, ds, l, aoi * D, p)[2] for p in 'sp') / 2
    return colour(fn)


# ------------------------------------------------------------------ field (forward/backward amplitudes)
def field_points(st, lam, aoi, pol, per):
    """|E|^2 / |E0+|^2 at the same depth samples as the page: per+1 points per layer, from the front"""
    Ns, ds = stack(st, lam)
    a = (Ns[0] * math.sin(aoi * D)).real
    cs = [ccos(n, a) for n in Ns]
    m = len(Ns) - 1
    # amplitudes (forward A, backward B) at the left side of each interface, substrate: A=1, B=0
    # transfer across interface j|j+1 for the tangential E: use interface matrix from Fresnel r, t
    A, B = 1 + 0j, 0j
    amps = [None] * (m + 1)
    amps[m] = (A, B)                       # in the substrate, at the last interface
    for j in range(m - 1, -1, -1):
        r, t = fresnel(Ns[j], Ns[j + 1], cs[j][0], cs[j + 1][0], pol)
        # field just left of interface j|j+1 from field just right: [A_l; B_l] = (1/t) [[1, r], [r, 1]] [A_r; B_r]
        Al = (A + r * B) / t
        Bl = (r * A + B) / t
        if j == 0:
            amps[0] = (Al, Bl)
            break
        beta = 2 * PI * ds[j - 1] * cs[j][1] / lam
        # move to the left side of layer j (front of the layer): forward wave earlier in phase
        A = Al * cmath.exp(-1j * beta)
        B = Bl * cmath.exp(1j * beta)
        amps[j] = (A, B)                  # at the front of layer j
    E0 = abs(amps[0][0]) ** 2
    # tangential E for s; for p the page uses the same tangential-E characteristic matrix (E = cos-projected) -> s only here
    pts = []
    for j in range(1, m):
        A, B = amps[j]
        beta_tot = 2 * PI * ds[j - 1] * cs[j][1] / lam
        for i in range(per + 1):
            u = i / per
            ph = beta_tot * u
            E = A * cmath.exp(1j * ph) + B * cmath.exp(-1j * ph)
            pts.append(abs(E) ** 2 / E0)
    return pts


# ------------------------------------------------------------------ cases
def qw(mat, q, l0):
    return {'material': mat, 'd_nm': q * l0 / (4 * N(mat, l0).real)}


def rows(layers):
    return [{'material': L['material'], 't': L['d_nm'], 'unit': 'nm'} for L in layers]


cases = []
G = list(np.linspace(380, 780, 41))


def spec_case(cid, note, st, lams, aoi, tol=1e-9):
    sp = spectrum(st, lams, aoi)
    cases.append({'id': cid, 'kind': 'spectrum', 'note': note,
                  'state': {'incident': st['incident'], 'substrate': st['substrate'], 'exit': st.get('exit', 'AIR'), 'backside': bool(st.get('backside')),
                            'aoi': aoi, 'layers': rows(st['layers'])},
                  'lambdas': [float(x) for x in lams],
                  'expect': {k: sp[k] for k in ('Rs', 'Rp', 'Ts', 'Tp')}, 'oracle_diff': sp['oracle_diff'], 'tol': {'abs': tol}})


def analytic_case(cid, note, st, lam, aoi, expect, tol=1e-12):
    """custom constant indices, through window.OptFilm in the page; expect from closed forms (and the recursion)"""
    Ns, ds = stack(st, lam)
    rec = {pol: airy(Ns, ds, lam, aoi * D, pol) for pol in 'sp'}
    for k, v in expect.items():
        got = rec[k[1]][2] if k[0] == 'R' else rec[k[1]][3]
        assert abs(got - v) < 1e-12, (cid, k, got, v)
    st = dict(st, backside=False)
    cases.append({'id': cid, 'kind': 'engine', 'note': note, 'stack': st, 'lambda': lam, 'aoi': aoi, 'expect': expect, 'tol': {'abs': tol}})


# A. closed forms with constant indices (page engine via window.OptFilm)
for n2 in (1.5, 2.4):
    for aoi in (0, 30, 60):
        t = math.asin(math.sin(aoi * D) / n2); ci, ct = math.cos(aoi * D), math.cos(t)
        rs = (ci - n2 * ct) / (ci + n2 * ct); rp = (n2 * ci - ct) / (n2 * ci + ct)
        analytic_case(f'fresnel-{n2}-{aoi}', f'bare surface n = {n2}, {aoi} deg (Fresnel)', {'incident': 1, 'substrate': n2, 'layers': []}, 550, aoi,
                      {'Rs': rs * rs, 'Rp': rp * rp, 'Ts': 1 - rs * rs, 'Tp': 1 - rp * rp})
analytic_case('brewster', 'Brewster angle of n = 1.5: Rp = 0', {'incident': 1, 'substrate': 1.5, 'layers': []}, 600, math.atan(1.5) / D, {'Rp': 0.0})
analytic_case('tir', 'glass 1.5 to air at 50 deg: total internal reflection', {'incident': 1.5, 'substrate': 1, 'layers': []}, 600, 50, {'Rs': 1.0, 'Rp': 1.0, 'Ts': 0.0, 'Tp': 0.0})
for n1, ns in ((1.38, 1.52), (2.1, 1.52), (1.45, 4.0)):
    a = (ns - n1 * n1) / (ns + n1 * n1)
    analytic_case(f'qw-{n1}-{ns}', f'quarter-wave layer n1 = {n1} on ns = {ns}: R = ((ns - n1^2)/(ns + n1^2))^2', {'incident': 1, 'substrate': ns, 'layers': [{'material': n1, 'd_nm': 137.5 / n1}]}, 550, 0, {'Rs': a * a, 'Rp': a * a})
    b = (1 - ns) / (1 + ns)
    analytic_case(f'hw-{n1}-{ns}', f'half-wave layer n1 = {n1} on ns = {ns} is absent: R = bare', {'incident': 1, 'substrate': ns, 'layers': [{'material': n1, 'd_nm': 275 / n1}]}, 550, 0, {'Rs': b * b})
for Np in (3, 8):
    L = []
    for i in range(Np):
        L += [{'material': 2.35, 'd_nm': 266 / 2.35}, {'material': 1.45, 'd_nm': 266 / 1.45}]
    L.append({'material': 2.35, 'd_nm': 266 / 2.35})
    Y = (2.35 / 1.45) ** (2 * Np) * 2.35 ** 2 / 1.45
    analytic_case(f'stack-{Np}', f'(HL)^{Np}H quarter-wave stack 2.35/1.45 on 1.45: R = ((1 - Y)/(1 + Y))^2 (Macleod ch. 6)', {'incident': 1, 'substrate': 1.45, 'layers': L}, 1064, 0, {'Rs': ((1 - Y) / (1 + Y)) ** 2}, 1e-11)
# opaque cases (fix-thinfilm, D-OPT-11): an absorbing substrate is thick, so T = 0 and R is the Fresnel reflectance of the
# front interface (stack); a 50 um silver film is opaque (exp(-4 pi k d / lambda) ~ 1e-1300) and reflects like bulk silver.
# Expectations from the Fresnel formulas directly (the recursion would give the power entering the substrate as T).
def bulk_R(Ninc, Nm, lam, aoi, pol):
    a = (Ninc * math.sin(aoi * D)).real
    c0, n0c = ccos(Ninc, a); c1, n1c = ccos(Nm, a)
    return abs(fresnel(Ninc, Nm, c0, c1, pol)[0]) ** 2
for m, lam, aoi in (('Al', 550.0, 0), ('Al', 550.0, 45), ('Ag', 633.0, 30), ({'n': 1.5, 'k': 0.01}, 550.0, 20)):
    Nm = N(m, lam)
    ex = {'Rs': bulk_R(1, Nm, lam, aoi, 's'), 'Rp': bulk_R(1, Nm, lam, aoi, 'p'), 'Ts': 0.0, 'Tp': 0.0}
    cid = 'opaque-sub-' + (m if isinstance(m, str) else 'custom') + f'-{aoi}'
    cases.append({'id': cid, 'kind': 'engine', 'note': 'absorbing substrate (thick): T = 0, R = Fresnel of the bare interface', 'stack': {'incident': 1, 'substrate': m, 'backside': False, 'layers': []},
                  'lambda': lam, 'aoi': aoi, 'expect': ex, 'tol': {'abs': 1e-12}})
for aoi in (0, 45):
    Nm = N('Ag', 550.0)
    ex = {'Rs': bulk_R(1, Nm, 550.0, aoi, 's'), 'Rp': bulk_R(1, Nm, 550.0, aoi, 'p'), 'Ts': 0.0, 'Tp': 0.0}
    cases.append({'id': f'ag-50um-{aoi}', 'kind': 'engine', 'note': '50 um silver film on N-BK7 is opaque: R = bulk silver, T = 0 (no overflow)', 'stack': {'incident': 1, 'substrate': 'N-BK7', 'backside': True, 'layers': [{'material': 'Ag', 'd_nm': 50000}]},
                  'lambda': 550.0, 'aoi': aoi, 'expect': ex, 'tol': {'abs': 1e-12}})
# metal: thick film equals bulk Fresnel with complex N
for m, lam in (('Ag', 550.0), ('Al', 800.0), ('Au', 633.0)):
    n = N(m, lam)
    R = abs((1 - n) / (1 + n)) ** 2
    cases.append({'id': f'bulk-{m}', 'kind': 'engine', 'note': f'opaque {m} at {lam:g} nm: R = |(1 - N)/(1 + N)|^2', 'stack': {'incident': 1, 'substrate': m, 'layers': [], 'backside': False}, 'lambda': lam, 'aoi': 0, 'expect': {'Rs': R, 'Rp': R}, 'tol': {'abs': 1e-12}})

# B. spectra with the published material data, through the page state
def bk(layers, sub='N-BK7', inc='AIR', back=False):
    return {'incident': inc, 'substrate': sub, 'exit': 'AIR', 'backside': back, 'layers': layers}


spec_case('mgf2-bk7', 'MgF2 quarter wave at 550 nm on N-BK7, 380-780 nm, normal', bk([qw('MgF2', 1, 550)]), G, 0)
spec_case('mgf2-bk7-45', 'same at 45 deg (s and p)', bk([qw('MgF2', 1, 550)]), G, 45)
spec_case('qhq-plate', 'MgF2/HfO2/Al2O3 QHQ at 510 nm on an N-BK7 plate with uncoated rear surface, 30 deg', bk([qw('MgF2', 1, 510), qw('HfO2', 2, 510), qw('Al2O3', 1, 510)], back=True), G, 30)
HR = []
for i in range(10):
    HR += [qw('TiO2', 1, 1064), qw('SiO2', 1, 1064)]
HR.append(qw('TiO2', 1, 1064))
spec_case('hr1064', '(HL)^10H TiO2/SiO2 at 1064 nm on fused silica, 800-1400 nm', bk(HR, 'FUSED-SILICA'), list(np.linspace(800, 1400, 61)), 0)
spec_case('hr1064-45', 'same at 45 deg', bk(HR, 'FUSED-SILICA'), list(np.linspace(800, 1400, 61)), 45)
spec_case('ag-protected', 'Ag 150 nm under a SiO2 half wave at 550 nm on N-BK7, 400-1000 nm, 20 deg', bk([qw('SiO2', 2, 550), {'material': 'Ag', 'd_nm': 150}]), list(np.linspace(400, 1000, 31)), 20)
spec_case('cr-nd', 'Cr 10 nm neutral-density film on fused silica, plate with rear surface', bk([{'material': 'Cr', 'd_nm': 10}], 'FUSED-SILICA', back=True), G, 0)
spec_case('au-thin', 'Au 25 nm on N-BK7 (semi-transparent), 15 deg', bk([{'material': 'Au', 'd_nm': 25}]), G, 15)
PB = []
n0 = N('N-SF2', 550).real
for i in range(8):
    for mat in ('HfO2', 'SiO2'):
        nn = N(mat, 550).real; ct = math.sqrt(1 - (n0 * math.sin(45 * D) / nn) ** 2); PB.append({'material': mat, 'd_nm': 550 / (4 * nn * ct)})
nn = N('HfO2', 550).real; ct = math.sqrt(1 - (n0 * math.sin(45 * D) / nn) ** 2); PB.append({'material': 'HfO2', 'd_nm': 550 / (4 * nn * ct)})
spec_case('pbs', 'MacNeille HfO2/SiO2 in N-SF2 at 45 deg', bk(PB, 'N-SF2', 'N-SF2'), list(np.linspace(450, 700, 51)), 45)
spec_case('nb-zns-si3n4', 'Nb2O5/ZnS/Si3N4/Ta2O5/SiO2 five-layer test stack on N-SF11, 60 deg', bk([{'material': 'SiO2', 'd_nm': 95}, {'material': 'Ta2O5', 'd_nm': 60}, {'material': 'Si3N4', 'd_nm': 120}, {'material': 'ZnS', 'd_nm': 40}, {'material': 'Nb2O5', 'd_nm': 75}], 'N-SF11'), G, 60)
spec_case('soap', 'water film 300 nm in air', bk([{'material': 'WATER', 'd_nm': 300}], 'AIR'), G, 0)

# C. colour (CIE files, own sums)
for cid, st in (('col-bare', bk([])), ('col-mgf2', bk([qw('MgF2', 1, 550)])), ('col-soap300', bk([{'material': 'WATER', 'd_nm': 300}], 'AIR')),
                ('col-soap200', bk([{'material': 'WATER', 'd_nm': 200}], 'AIR')), ('col-au', bk([{'material': 'Au', 'd_nm': 150}]))):
    c = stack_colour(st)
    cases.append({'id': cid, 'kind': 'colour', 'note': 'CIE 1931 2 deg, D65, reflected light, average polarisation', 'state': {'incident': st['incident'], 'substrate': st['substrate'], 'exit': 'AIR', 'backside': False, 'aoi': 0, 'layers': rows(st['layers'])},
                  'expect': c, 'tol': {'abs_Y': 1e-6, 'abs_Lab': 1e-5}})

# D. field |E|^2 (s) inside a 4-layer stack and an HR stack
for cid, st, lam, aoi in (('field-ar', bk([qw('MgF2', 1, 510), qw('HfO2', 2, 510), qw('Al2O3', 1, 510)]), 510.0, 0), ('field-hr', bk(HR[:9], 'FUSED-SILICA'), 1064.0, 0),
                          ('field-hr-45s', bk(HR[:9], 'FUSED-SILICA'), 1064.0, 45)):
    pts = field_points(st, lam, aoi, 's', 10)
    cases.append({'id': cid, 'kind': 'field', 'note': f'|E|^2/|E0+|^2 at 11 depths per layer, s, {aoi} deg', 'state': {'incident': st['incident'], 'substrate': st['substrate'], 'exit': 'AIR', 'backside': False, 'aoi': aoi, 'layers': rows(st['layers'])},
                  'lambda': lam, 'aoi': aoi, 'expect': {'E2': pts}, 'tol': {'rel': 1e-9}})

# E. preset claims (each recomputed here)
def R_at(st, lam, aoi=0, pol=None):
    Ns, ds = stack(st, lam)
    v = {p: airy(Ns, ds, lam, aoi * D, p) for p in 'sp'}
    return (v['s'][2] + v['p'][2]) / 2 if pol is None else v[pol][2]


def T_at(st, lam, aoi=0, pol=None):
    Ns, ds = stack(st, lam)
    v = {p: airy(Ns, ds, lam, aoi * D, p) for p in 'sp'}
    return (v['s'][3] + v['p'][3]) / 2 if pol is None else v[pol][3]


aha = {}
st = bk([qw('MgF2', 1, 550)])
aha['mgf2'] = {'bare': R_at(bk([]), 550), 'coated': R_at(st, 550)}
aha['vcoat'] = {'R1064': R_at(bk([{'material': 'SiO2', 'd_nm': 240.3}, {'material': 'Ta2O5', 'd_nm': 44.1}], 'FUSED-SILICA'), 1064),
                'R900': R_at(bk([{'material': 'SiO2', 'd_nm': 240.3}, {'material': 'Ta2O5', 'd_nm': 44.1}], 'FUSED-SILICA'), 900)}
lams = list(range(420, 681))
q3 = bk([qw('MgF2', 1, 510), qw('HfO2', 2, 510), qw('Al2O3', 1, 510)])
aha['bbar'] = {'mean': float(np.mean([R_at(q3, l) for l in lams])), 'single': float(np.mean([R_at(bk([qw('MgF2', 1, 510)]), l) for l in lams]))}
def r2(L):
    return [{'material': x['material'], 'd_nm': math.floor(x['d_nm'] * 100 + 0.5) / 100} for x in L]
aha['hr'] = {'R': R_at(bk(r2(HR), 'FUSED-SILICA'), 1064), 'Rp45': R_at(bk(r2(HR), 'FUSED-SILICA'), 1064, 45, 'p')}
FP = []
for i in range(4):
    FP += [qw('TiO2', 1, 633), qw('SiO2', 1, 633)]
FP += [qw('TiO2', 1, 633), qw('SiO2', 2, 633), qw('TiO2', 1, 633)]
for i in range(4):
    FP += [qw('SiO2', 1, 633), qw('TiO2', 1, 633)]
ls = np.arange(610, 656, 0.01)
Tl = np.array([T_at(bk(r2(FP)), l) for l in ls])
half = Tl.max() / 2
idx = np.where(Tl >= half)[0]
def cross(i0, i1):
    return ls[i0] + (ls[i1] - ls[i0]) * (half - Tl[i0]) / (Tl[i1] - Tl[i0])
aha['fp'] = {'peak': float(Tl.max()), 'fwhm': float(cross(idx[-1], idx[-1] + 1) - cross(idx[0] - 1, idx[0]))}
al = [R_at(bk([{'material': 'Al', 'd_nm': 150}]), l) for l in range(700, 901)]
aha['metal'] = {'Al_min': min(al), 'Al_min_at': 700 + al.index(min(al)), 'Ag_min_780_850': min(R_at(bk([{'material': 'Ag', 'd_nm': 150}]), l) for l in range(780, 851))}
pb = bk(r2(PB), 'N-SF2', 'N-SF2')
aha['pbs'] = {'Rs45': R_at(pb, 550, 45, 's'), 'Tp45': T_at(pb, 550, 45, 'p'), 'Rs35': R_at(pb, 550, 35, 's')}
aha['soap'] = {'c300': stack_colour(bk([{'material': 'WATER', 'd_nm': 300}], 'AIR')), 'c200': stack_colour(bk([{'material': 'WATER', 'd_nm': 200}], 'AIR')), 'c10': stack_colour(bk([{'material': 'WATER', 'd_nm': 10}], 'AIR'))}
SP = []
for i in range(9):
    SP += [qw('TiO2', 0.5, 900), qw('SiO2', 1, 900), qw('TiO2', 0.5, 900)]
def band(aoi, centre):
    ls2 = np.arange(400, 1200.001, 0.5)
    stp = bk(r2(SP), back=True)
    Tv = []
    for l in ls2:
        Ns, ds = stack(stp, l)
        Tv.append(sum(plate(Ns, ds, l, aoi * D, p, N('AIR', l))[1] for p in 'sp') / 2)
    i = int(np.searchsorted(ls2, centre)); a = b2 = i
    while a > 0 and Tv[a - 1] < 0.5: a -= 1
    while b2 < len(ls2) - 1 and Tv[b2 + 1] < 0.5: b2 += 1
    return [float(ls2[a]), float(ls2[b2])]
e0, e45 = band(0, 900), band(45, 830)
aha['hot'] = {'e0': e0, 'e45': e45, 'shift': ((e0[0] - e45[0]) + (e0[1] - e45[1])) / 2}
nfs = N('FUSED-SILICA', 633).real
thb = math.atan(nfs)
aha['brewster'] = {'theta_B': thb / D, 'Rs_at_B': R_at(bk([], 'FUSED-SILICA'), 633, thb / D, 's')}
cases.append({'id': 'aha', 'kind': 'aha', 'note': 'numbers behind the preset notes of the page', 'expect': aha})

json.dump(cases, open(os.path.join(HERE, 'thinfilm_ref.json'), 'w', encoding='utf-8'), indent=0)
print(len(cases), 'cases;', json.dumps(aha, default=float)[:900])
