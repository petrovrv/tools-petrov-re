"""Independent reference for gaussbeam.html (Gaussian Beam & Mode Matching).

Written from the published method, not from opt-gauss.js, and deliberately with different algorithms:
  * propagation uses the PHYSICAL complex beam parameter q (1/q = 1/R - i M^2 lambda0 /(pi n w^2)) with the
    full ABCD matrices of Siegman, Lasers (1986) Table 15.1 / Saleh & Teich, Fundamentals of Photonics, ch. 3:
    free space [[1,d],[0,1]], thin lens [[1,0],[-1/f,1]], plane interface n1->n2 [[1,0],[0,n1/n2]];
    the JS works with the reduced parameter q/n and never forms an interface matrix;
  * thin-lens focusing: S. A. Self, "Focusing of spherical Gaussian beams", Appl. Opt. 22 (1983) 658, eqs (9)-(11);
  * mode overlap: the overlap integral |int E1 E2*|^2 / (int|E1|^2 int|E2|^2) evaluated NUMERICALLY on a 2-D grid
    (the JS uses the closed-form Gaussian integral);
  * ISO 11146-1:2021 section 9: least-squares fit of d^2(z) = a + b z + c z^2 (D4sigma diameters), M^2 = pi d0 Theta /(4 lambda);
  * two-mirror resonator: eigenmode of the round-trip ABCD matrix (Kogelnik & Li, Appl. Opt. 5 (1966) 1550, section 3)
    and the g-parameter closed forms; transverse mode spacing from the round-trip Gouy phase;
  * mode matching: Kogelnik & Li eq. (36) applied twice through an INTERMEDIATE WAIST w_m scanned on a log grid
    (root finding of the total length). opt-gauss.js 0.2.0+ adopted the same intermediate-waist scan, so this method alone
    does not check completeness independently (review R-13). A SECOND, different method checks the count: for every lens-1
    position x1 on a fine grid, lens 2 must sit where the beam after lens 1 and the target beam (propagated back) have the
    same size — a quadratic in x2, solved in closed form — and there the wavefront curvatures must differ by exactly 1/f2;
    the roots of that curvature residual in x1 are bracketed and bisected per root branch, then verified by propagation;
  * Gouy phase from the product of the ABCD factors (A + B/q), psi = -sum arg(A_k + B_k/q_k) (Siegman ch. 20), not from
    arctan of the local q; clipping by a circular aperture: 1 - exp(-2a^2/w^2) and, for an elliptical beam, a 2-D numerical
    integral on a Cartesian grid (the JS uses a polar quadrature);
  * elements in a medium n != 1 (review R-4): physical q with a thin lens [[1,0],[-1/f,1]] where f is the focal length in that
    medium (a collimated beam focuses a distance f behind the lens), including a lens inside a plate.
Output: bench-src/ref/gaussbeam_ref.json — list of {id, kind, note, state, expect, tol}.
Run:  python -I bench-src/ref/gen_gaussbeam.py
"""
import cmath
import json
import math
import os

PI = math.pi
C0 = 299792458.0


# ------------------------------------------------------------------ physical q
def q_from_waist(w0, z_from_waist, lam, M2, n):
    zR = PI * n * w0 * w0 / (M2 * lam)
    return complex(z_from_waist, zR)


def w_of(q, lam, M2, n):
    inv = 1 / q
    return math.sqrt(-M2 * lam / (PI * n * inv.imag))


def R_of(q):
    inv = 1 / q
    return math.inf if abs(inv.real) < 1e-300 else 1 / inv.real


def apply(M, q):
    A, B, C, D = M
    return (A * q + B) / (C * q + D)


def run_system(lam, n0, beam, elements, z_eval):
    """beam: dict w0, z0, M2 (one axis); elements: list of dicts (z, kind, f, t, n, aoi, axis focal already resolved
    as 'fa'). Returns (w, R) at each z in z_eval and the waist list after each cut."""
    cuts = []
    for e in elements:
        cuts.append((e['z'], 'el', e))
        if e['kind'] == 'slab' and e['t'] > 0:
            cuts.append((e['z'] + e['t'], 'exit', e))
    cuts.sort(key=lambda c: (c[0], 0 if c[1] == 'exit' else 1))
    zc = min([beam['z0']] + [c[0] for c in cuts] + list(z_eval)) - 1e-9
    n = n0
    q = q_from_waist(beam['w0'], zc - beam['z0'], lam, beam['M2'], n0)
    states = []          # (zA, qA, n)
    for (zk, typ, e) in cuts:
        states.append((zc, q, n))
        q = apply((1, zk - zc, 0, 1), q)
        zc = zk
        if typ == 'el':
            fa = e['fa']
            if math.isfinite(fa):
                q = apply((1, 0, -1 / fa, 1), q)
            if e['kind'] == 'slab' and e['t'] > 0:
                q = apply((1, 0, 0, n / e['n']), q)     # plane interface n -> n_slab
                n = e['n']
        else:
            q = apply((1, 0, 0, n / n0), q)             # exit face n_slab -> n0
            n = n0
    states.append((zc, q, n))

    def at(z):
        k = 0
        for i, (zA, _, _) in enumerate(states):
            if z >= zA:
                k = i
        zA, qA, nn = states[k]
        qq = apply((1, z - zA, 0, 1), qA)
        return w_of(qq, lam, beam['M2'], nn), R_of(qq)

    vals = [at(z) for z in z_eval]
    waists = []
    for (zA, qA, nn) in states:
        zR = qA.imag
        w0 = math.sqrt(beam['M2'] * lam * zR / (PI * nn))
        waists.append({'z0': zA - qA.real, 'w0': w0, 'zR': zR})
    return vals, waists


def focal_axis(e, axis):
    f = e.get('f', math.inf)
    k = e['kind']
    if k == 'lens':
        return f
    if k == 'cylx':
        return f if axis == 'x' else math.inf
    if k == 'cyly':
        return f if axis == 'y' else math.inf
    if k == 'mirror':
        c = math.cos(math.radians(e.get('aoi', 0)))
        return f * c if axis == 'x' else f / c
    return math.inf


# --------------------------------------------------------------- page vocabulary
DEF = dict(mode='propagate', view='w', lambda_nm=632.8, n0=1, src='waist', w0_mm=0.4, z0_mm=0, M2=1, div_mrad=1.0,
           astig=False, w0y_mm=0.4, z0y_mm=0, M2y=1, pts=[], elements=[], zStart_mm=0, zEnd_mm=400)


def el(label, kind, z, f=100, t=0, n=1.5, aoi=0, D=0):
    return dict(label=label, kind=kind, z_mm=z, f_mm=f, t_mm=t, n=n, aoi=aoi, D_mm=D)


def to_si(elements):
    out = []
    for e in elements:
        out.append(dict(kind=e['kind'], z=e['z_mm'] / 1000, f=e['f_mm'] / 1000 if e['f_mm'] else math.inf,
                        t=e['t_mm'] / 1000, n=e['n'], aoi=e['aoi']))
    return out


def samples(zs_mm, ze_mm, N=800):
    zA, zB = min(zs_mm, ze_mm) / 1000, max(zs_mm, ze_mm) / 1000
    return [zA + (zB - zA) * i / N for i in range(N + 1)]


cases = []


def prop_case(cid, note, st, check_samples=True):
    s = dict(DEF)
    s.update(st)
    lam = s['lambda_nm'] * 1e-9
    w0 = s['w0_mm'] / 1000
    if s.get('src') == 'div':          # waist from the full-angle far-field divergence: theta = M2 lambda /(pi n w0)
        w0 = s['M2'] * lam / (PI * s['n0'] * s['div_mrad'] / 2000)
    beams = {'x': dict(w0=w0, z0=s['z0_mm'] / 1000, M2=s['M2'])}
    if s.get('astig'):
        beams['y'] = dict(w0=s['w0y_mm'] / 1000, z0=s['z0y_mm'] / 1000, M2=s['M2y'])
    else:
        beams['y'] = dict(beams['x'])
    zs = samples(s['zStart_mm'], s['zEnd_mm'])
    pick = list(range(0, 801, 40))
    exp = {}
    for ax in ('x', 'y'):
        els = to_si(s['elements'])
        for e in els:
            e['fa'] = focal_axis(e, ax)
        vals, waists = run_system(lam, s['n0'], beams[ax], els, [zs[i] for i in pick])
        exp['w_' + ax] = [v[0] for v in vals]
        exp['R_' + ax] = [v[1] if math.isfinite(v[1]) and abs(v[1]) < 1e12 else None for v in vals]
        exp['final_w0_' + ax] = waists[-1]['w0']
        exp['final_z0_' + ax] = waists[-1]['z0']
        exp['final_zR_' + ax] = waists[-1]['zR']
    exp['pick'] = pick
    cases.append(dict(id=cid, kind='propagate', note=note, state=s, expect=exp, tol={'rel': 1e-9, 'abs_m': 1e-12}))


# A. free space
prop_case('free-hene', 'HeNe 632.8 nm, w0 0.4 mm, free propagation 0-4 m', dict(lambda_nm=632.8, w0_mm=0.4, zStart_mm=0, zEnd_mm=4000))
prop_case('free-m2', '1064 nm, M2 1.5, waist 0.2 mm at z = 100 mm', dict(lambda_nm=1064, w0_mm=0.2, z0_mm=100, M2=1.5, zStart_mm=0, zEnd_mm=600))
prop_case('free-co2-medium', 'CO2 10.6 um, w0 3 mm in a medium n = 1 (reference)', dict(lambda_nm=10600, w0_mm=3, zStart_mm=-2000, zEnd_mm=5000))
# B. single lens at several object distances (Self 1983 is checked separately below)
for (s_mm, f_mm, M2) in [(200, 100, 1), (100, 100, 1), (50, 100, 1.3), (1000, 50, 1), (2000, 250, 2.0), (30, -50, 1)]:
    prop_case(f'lens-s{s_mm}-f{f_mm}-m{M2}', f'Thin lens f = {f_mm} mm, input waist {s_mm} mm before it, M2 {M2}',
              dict(lambda_nm=1064, w0_mm=0.5, z0_mm=0, M2=M2, elements=[el('L', 'lens', s_mm, f_mm)], zStart_mm=0, zEnd_mm=s_mm + 3 * abs(f_mm) + 100))
# C. plates, tilted mirrors, cylinders, astigmatic source, two-lens telescopes
prop_case('slab-yag', '1064 nm focus into a 10 mm YAG-like plate n = 1.82 (waist shift t(1-1/n))',
          dict(lambda_nm=1064, w0_mm=1.0, elements=[el('L', 'lens', 50, 100), el('YAG', 'slab', 120, 0, t=10, n=1.82)], zStart_mm=0, zEnd_mm=250))
prop_case('fold-mirror', 'Curved mirror f = 50 mm at 10 deg incidence (tangential/sagittal split)',
          dict(lambda_nm=1064, w0_mm=1, elements=[el('M', 'mirror', 100, 50, aoi=10)], zStart_mm=0, zEnd_mm=220))
prop_case('diode-cyl', 'Astigmatic diode (x 2 um, y 0.5 um waists) collimated by f 4.5 mm + cylinder x 30 mm',
          dict(lambda_nm=808, w0_mm=0.002, w0y_mm=0.0005, astig=True, z0y_mm=0.0, elements=[el('A', 'lens', 4.5, 4.5), el('CX', 'cylx', 60, 30)], zStart_mm=0, zEnd_mm=200))
prop_case('kepler', 'Keplerian x4 telescope +25/+100 mm', dict(elements=[el('a', 'lens', 100, 25), el('b', 'lens', 225, 100)], zStart_mm=0, zEnd_mm=1500))
prop_case('galileo', 'Galilean x4 telescope -25/+100 mm', dict(elements=[el('a', 'lens', 100, -25), el('b', 'lens', 175, 100)], zStart_mm=0, zEnd_mm=1500))
prop_case('n0-water', 'Beam in water (n0 = 1.333): Rayleigh range scales with n', dict(lambda_nm=532, w0_mm=0.05, n0=1.333, zStart_mm=-20, zEnd_mm=20))
# C2. review R-4 / R-14: elements in a medium, a lens inside a plate, divergence-defined source
prop_case('n0-water-lens', 'HeNe 0.4 mm waist focused by f = 100 mm (focal length in water) in water n0 = 1.333',
          dict(lambda_nm=632.8, w0_mm=0.4, n0=1.333, elements=[el('L', 'lens', 200, 100)], zStart_mm=0, zEnd_mm=400))
prop_case('n0-oil-mirror', '1064 nm in n0 = 1.5 through a tilted curved mirror f = 80 mm (15 deg) and a lens f = -40 mm',
          dict(lambda_nm=1064, w0_mm=0.8, n0=1.5, elements=[el('M', 'mirror', 100, 80, aoi=15), el('N', 'lens', 150, -40)], zStart_mm=0, zEnd_mm=400))
prop_case('lens-in-plate', 'Thermal lens f = 150 mm (in the crystal) in the middle of a 60 mm rod n = 1.82',
          dict(lambda_nm=1064, w0_mm=0.6, elements=[el('ROD', 'slab', 50, 0, t=60, n=1.82), el('TL', 'lens', 80, 150)], zStart_mm=0, zEnd_mm=400))
prop_case('div-source', 'Source defined by divergence: 1.2 mrad full angle, M2 1.4 at 808 nm, waist at z = 20 mm',
          dict(lambda_nm=808, src='div', div_mrad=1.2, M2=1.4, z0_mm=20, elements=[el('L', 'lens', 300, 200)], zStart_mm=0, zEnd_mm=700))


# C3. Gouy phase: psi = -sum arg(A_k + B_k/q_k) over the free-space factors (lens factors have A + B/q = 1)
def gouy_case(cid, note, st):
    s = dict(DEF); s.update(st)
    lam = s['lambda_nm'] * 1e-9
    b = dict(w0=s['w0_mm'] / 1000, z0=s['z0_mm'] / 1000, M2=s['M2'])
    zA, zB = min(s['zStart_mm'], s['zEnd_mm']) / 1000, max(s['zStart_mm'], s['zEnd_mm']) / 1000
    els = sorted(to_si(s['elements']), key=lambda e: e['z'])
    q = q_from_waist(b['w0'], zA - b['z0'], lam, b['M2'], 1.0)
    z, psi = zA, 0.0
    for e in els + [dict(kind='end', z=zB, f=math.inf)]:
        d = e['z'] - z
        fac = 1 + d / q                  # A + B/q of free space [[1, d], [0, 1]]
        psi -= cmath.phase(fac)
        q = q + d
        z = e['z']
        if e['kind'] == 'lens':
            q = apply((1, 0, -1 / e['f'], 1), q)
    cases.append(dict(id=cid, kind='gouy', note=note, state=s, expect={'gouy': psi}, tol={'rel': 1e-9}))


gouy_case('gouy-hene100', 'Gouy phase 0-400 mm, HeNe focused by f = 100 mm (one focus: about pi)', dict(lambda_nm=632.8, w0_mm=0.4, elements=[el('L', 'lens', 200, 100)], zStart_mm=0, zEnd_mm=400))
gouy_case('gouy-kepler', 'Gouy phase through the Keplerian x4 telescope (internal focus + output beam), 0-1500 mm', dict(elements=[el('a', 'lens', 100, 25), el('b', 'lens', 225, 100)], zStart_mm=0, zEnd_mm=1500))


# C4. clipping by a circular aperture: circular beam 1 - exp(-2 a^2/w^2); elliptical beam by a 2-D Cartesian integral
def clip_case(cid, note, st):
    s = dict(DEF); s.update(st)
    lam = s['lambda_nm'] * 1e-9
    out = []
    for e in s['elements']:
        if not e['D_mm']:
            continue
        ws = {}
        for ax in ('x', 'y'):
            b = dict(w0=s['w0_mm'] / 1000, z0=s['z0_mm'] / 1000, M2=s['M2'])
            if ax == 'y' and s.get('astig'):
                b = dict(w0=s['w0y_mm'] / 1000, z0=s['z0y_mm'] / 1000, M2=s['M2y'])
            els = to_si([x for x in s['elements'] if x['z_mm'] < e['z_mm']])
            for x in els:
                x['fa'] = focal_axis(x, ax)
            ws[ax] = run_system(lam, s['n0'], b, els, [e['z_mm'] / 1000])[0][0][0]
        a = e['D_mm'] / 2000
        if abs(ws['x'] - ws['y']) <= 1e-9 * ws['x']:
            T = 1 - math.exp(-2 * a * a / ws['x'] ** 2)
        else:
            N = 600; h = 2 * a / N; tot = 0.0
            for i in range(N):
                x = -a + (i + 0.5) * h
                ymax = math.sqrt(max(0.0, a * a - x * x))
                # inner integral over y in closed form: int exp(-2y^2/wy^2) dy = wy sqrt(pi/8) * 2 erf(sqrt2 ymax/wy)
                tot += math.exp(-2 * x * x / ws['x'] ** 2) * ws['y'] * math.sqrt(PI / 8) * 2 * math.erf(math.sqrt(2) * ymax / ws['y']) * h
            T = tot * 2 / (PI * ws['x'] * ws['y'])
        out.append(T)
    cases.append(dict(id=cid, kind='clip', note=note, state=s, expect={'clipT': out}, tol={'abs': 1e-4}))


clip_case('clip-iris', 'HeNe 0.4 mm through a 1.0 mm iris at 300 mm and a 25.4 mm lens', dict(lambda_nm=632.8, w0_mm=0.4, elements=[el('I', 'aperture', 300, 0, D=1.0), el('L', 'lens', 500, 100, D=25.4)], zStart_mm=0, zEnd_mm=800))
clip_case('clip-elliptic', 'Elliptical beam (cylinder lens x f = 50 mm) clipped by a 0.8 mm aperture 30 mm behind it',
          dict(lambda_nm=808, w0_mm=0.5, elements=[el('CX', 'cylx', 50, 50, D=0), el('A', 'aperture', 80, 0, D=0.8)], zStart_mm=0, zEnd_mm=200))

# D. Self (1983) closed forms against the page's first waist after a single lens
for (s_mm, f_mm, M2) in [(200, 100, 1), (100, 100, 1), (50, 100, 1.3), (1000, 50, 1)]:
    lam, w0, s_, f = 1064e-9, 0.5e-3, s_mm / 1000, f_mm / 1000
    zR = PI * w0 * w0 / (M2 * lam)
    s2 = 1 / (1 / f - 1 / (s_ + zR * zR / (s_ - f))) if abs(s_ - f) > 1e-15 else f
    m = 1 / math.sqrt((1 - s_ / f) ** 2 + (zR / f) ** 2)
    cases.append(dict(id=f'self-s{s_mm}-f{f_mm}-m{M2}', kind='self', note='Self (1983) eqs (9)-(11): output waist and its distance behind the lens',
                      state=dict(DEF, lambda_nm=1064, w0_mm=0.5, z0_mm=0, M2=M2, elements=[el('L', 'lens', s_mm, f_mm)], zStart_mm=0, zEnd_mm=s_mm + 3 * f_mm + 100),
                      expect={'w0': m * w0, 'z0': s_ + s2}, tol={'rel': 1e-9, 'abs_m': 1e-12}))


# E. fibre coupling: numerical 2-D overlap integral
def overlap_numeric(wx, Rx, wy, Ry, wf, lam, dx, tx):
    k = 2 * PI / lam
    L = 6 * max(wx, wy, wf) + abs(dx)
    N = 801
    h = 2 * L / (N - 1)
    xs = [-L + i * h for i in range(N)]

    def axis(w, R, d, t):
        num = 0j
        n1 = 0.0
        n2 = 0.0
        for x in xs:
            curv = 0.0 if not math.isfinite(R) else k * x * x / (2 * R)
            e1 = cmath.exp(complex(-x * x / (w * w), -curv))
            e2 = cmath.exp(complex(-(x - d) ** 2 / (wf * wf), k * t * x))
            num += e1 * e2.conjugate()
            n1 += abs(e1) ** 2
            n2 += abs(e2) ** 2
        return abs(num) ** 2 / (n1 * n2)
    return axis(wx, Rx, dx, tx) * axis(wy, Ry, 0, 0)


def fibre_case(cid, note, st):
    s = dict(DEF, mode='fibre', fMFD_um=10.4, fAuto=False, fz_mm=60, fdx_um=0, ftilt_mrad=0)
    s.update(st)
    lam = s['lambda_nm'] * 1e-9
    beam = dict(w0=s['w0_mm'] / 1000, z0=s['z0_mm'] / 1000, M2=s['M2'])
    els = to_si(s['elements'])
    for e in els:
        e['fa'] = focal_axis(e, 'x')
    vals, waists = run_system(lam, s['n0'], beam, els, [s['fz_mm'] / 1000])
    w, R = vals[0]
    eta = overlap_numeric(w, R, w, R, s['fMFD_um'] * 1e-6 / 2, lam * s['M2'], s['fdx_um'] * 1e-6, s['ftilt_mrad'] * 1e-3)
    cases.append(dict(id=cid, kind='fibre', note=note, state=s, expect={'eta': eta, 'w_face': w}, tol={'abs_eta': 2e-6, 'rel': 1e-9}))


base_fib = dict(lambda_nm=1550, w0_mm=1.05, z0_mm=0, M2=1, elements=[el('A11', 'lens', 50, 11)], zStart_mm=0, zEnd_mm=80)
lam_, w_in = 1550e-9, 1.05e-3
zR_in = PI * w_in ** 2 / lam_
s_ = 0.05
s2 = 1 / (1 / 0.011 - 1 / (s_ + zR_in ** 2 / (s_ - 0.011)))
zw_mm = (s_ + s2) * 1000
fibre_case('fib-aligned', 'SMF-28 (MFD 10.4 um) at the focus of f = 11 mm, w_in 1.05 mm', dict(base_fib, fz_mm=zw_mm))
fibre_case('fib-lateral-3um', 'same, 3 um lateral offset', dict(base_fib, fz_mm=zw_mm, fdx_um=3))
fibre_case('fib-tilt-20mrad', 'same, 20 mrad tilt', dict(base_fib, fz_mm=zw_mm, ftilt_mrad=20))
fibre_case('fib-defocus-50um', 'same, fibre 50 um behind the waist (curvature + size mismatch)', dict(base_fib, fz_mm=zw_mm + 0.05))
fibre_case('fib-mismatch-f15', 'f = 15 mm lens (spot too large), aligned at its waist', dict(base_fib, elements=[el('L15', 'lens', 50, 15)],
           fz_mm=(0.05 + 1 / (1 / 0.015 - 1 / (0.05 + zR_in ** 2 / (0.05 - 0.015)))) * 1000))


# F. ISO 11146 fit — synthetic D4sigma data, two plans (published method; data labelled synthetic)
def iso_case(cid, note, ks, w0, z0, M2, lam_nm):
    lam = lam_nm * 1e-9
    zR = PI * w0 * w0 / (M2 * lam)
    pts = []
    for k in ks:
        z = z0 + k * zR
        pts.append(dict(z_mm=round(z * 1000, 4), d_mm=round(2 * w0 * math.sqrt(1 + k * k) * 1000, 6)))
    # least squares of d^2 = a + b z + c z^2 (normal equations, Cramer's rule)
    Z = [p['z_mm'] / 1000 for p in pts]
    D2 = [(p['d_mm'] / 1000) ** 2 for p in pts]
    S = [[sum(z ** (i + j) for z in Z) for j in range(3)] for i in range(3)]
    Y = [sum(d * z ** i for z, d in zip(Z, D2)) for i in range(3)]

    def det(m):
        return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
    d0 = det(S)
    sol = []
    for c in range(3):
        m = [row[:] for row in S]
        for r in range(3):
            m[r][c] = Y[r]
        sol.append(det(m) / d0)
    a, b, c = sol
    zf = -b / (2 * c)
    d0sq = a - b * b / (4 * c)
    Theta = math.sqrt(c)               # full-angle divergence
    M2f = PI * math.sqrt(d0sq) * Theta / (4 * lam)
    cases.append(dict(id=cid, kind='iso', note=note, state=dict(DEF, lambda_nm=lam_nm, src='fit', pts=pts, zStart_mm=0, zEnd_mm=300),
                      expect={'w0': math.sqrt(d0sq) / 2, 'z0': zf, 'M2': M2f}, tol={'rel': 1e-6, 'abs_m': 1e-9}))


iso_case('iso-1064-m13', 'Synthetic ISO plan, 10 planes, M2 1.3 at 1064 nm', [-3.5, -3, -2.5, -0.9, -0.5, 0, 0.4, 0.8, 2.5, 3.2], 0.15e-3, 0.12, 1.3, 1064)
iso_case('iso-633-m105', 'Synthetic plan, 12 planes, M2 1.05 at 632.8 nm', [-4, -3, -2.2, -1, -0.6, -0.2, 0.3, 0.7, 1, 2.1, 3, 4.2], 0.3e-3, 0.4, 1.05, 632.8)


# G. two-mirror cavity — eigenmode of the round-trip matrix
def cavity_case(cid, note, R1, R2, L, lam_nm=1064, n=1.0):
    lam = lam_nm * 1e-9 / n
    f1 = R1 / 2 if R1 else math.inf
    f2 = R2 / 2 if R2 else math.inf

    def mm(a, b):
        return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3])
    P = (1, L, 0, 1)
    M1 = (1, 0, -1 / f1 if math.isfinite(f1) else 0, 1)
    M2 = (1, 0, -1 / f2 if math.isfinite(f2) else 0, 1)
    RT = mm(M1, mm(P, mm(M2, P)))      # start just after mirror 1, go to M2 and back
    A, B, C, D = RT
    g1 = 1 - L / R1 if R1 else 1.0
    g2 = 1 - L / R2 if R2 else 1.0
    exp = {'g1g2': g1 * g2, 'stable': 0 < g1 * g2 < 1, 'FSR': C0 / (2 * n * L)}
    m = (A + D) / 2
    if abs(m) < 1:
        # eigen q: C q^2 + (D - A) q - B = 0, Im q > 0
        disc = cmath.sqrt((D - A) ** 2 + 4 * B * C)
        for sgn in (1, -1):
            q = (-(D - A) + sgn * disc) / (2 * C)
            if q.imag > 0:
                break
        w1 = math.sqrt(-lam / (PI * (1 / q).imag))
        exp.update(w1=w1, w0=math.sqrt(lam * q.imag / PI), z1=-q.real)
        theta = math.acos(m)           # round-trip Gouy phase (mod 2 pi), sign chosen with B
        rt = theta if B > 0 else 2 * PI - theta
        exp['dnuT_frac'] = rt / (2 * PI)
    cases.append(dict(id=cid, kind='cavity', note=note,
                      state=dict(mode='cavity', lambda_nm=lam_nm, R1_mm=(R1 or 1) * 1000, R1flat=not R1, R2_mm=(R2 or 1) * 1000, R2flat=not R2, L_mm=L * 1000, cn=n),
                      expect=exp, tol={'rel': 1e-8}))


cavity_case('cav-symmetric', 'R = 1 m mirrors, L = 0.5 m', 1.0, 1.0, 0.5)
cavity_case('cav-hemi', 'Flat + R = 0.5 m, L = 0.3 m (hemispherical-like)', 0, 0.5, 0.3)
cavity_case('cav-asym', 'R1 = 2 m, R2 = 0.75 m, L = 0.6 m', 2.0, 0.75, 0.6)
cavity_case('cav-edge', 'R = 0.5 m, L = 0.99 m (near concentric)', 0.5, 0.5, 0.99)
cavity_case('cav-unstable', 'R = 0.5 m, L = 1.2 m (unstable)', 0.5, 0.5, 1.2)
cavity_case('cav-glass', 'R = 1 m, L = 0.2 m filled with n = 1.45', 1.0, 1.0, 0.2, 1064, 1.45)


# H. mode matching: full solution set by the intermediate-waist method (Kogelnik & Li eq. 36 twice)
def match_set(lam, M2, w1, z1, w2, z2, focals, zmin, zmax, gap):
    sols = []
    hi = min(zmax, z2)
    for f1 in focals:
        for f2 in focals:
            wm_max = min(abs(f1) * M2 * lam / (PI * w1), abs(f2) * M2 * lam / (PI * w2))
            grid = [wm_max * 10 ** (-6 + 6 * i / 6000) for i in range(6001)]
            for s1 in (1, -1):
                for s2 in (1, -1):
                    def parts(wm):
                        r1 = math.sqrt(max(0.0, f1 * f1 - (PI * w1 * wm / (M2 * lam)) ** 2))
                        r2 = math.sqrt(max(0.0, f2 * f2 - (PI * wm * w2 / (M2 * lam)) ** 2))
                        d1 = f1 + s1 * (w1 / wm) * r1
                        d1p = f1 + s1 * (wm / w1) * r1
                        d2 = f2 + s2 * (wm / w2) * r2
                        d3 = f2 + s2 * (w2 / wm) * r2
                        x1 = z1 + d1
                        x2 = x1 + d1p + d2
                        return x1, x2, x2 + d3 - z2
                    prev = None
                    for wm in grid:
                        x1, x2, g = parts(wm)
                        if prev is not None and (g == 0 or (g > 0) != (prev[1] > 0)):
                            a, b = prev[0], wm
                            ga = prev[1]
                            for _ in range(200):
                                c = math.sqrt(a * b)
                                gc = parts(c)[2]
                                if (gc > 0) == (ga > 0):
                                    a, ga = c, gc
                                else:
                                    b = c
                            x1, x2, g = parts(math.sqrt(a * b))
                            if abs(g) < 1e-9 and x1 >= zmin - 1e-9 and x2 <= hi + 1e-9 and x2 - x1 >= gap - 1e-9:
                                if not any(s['f1'] == f1 and s['f2'] == f2 and abs(s['x1'] - x1) < 1e-6 and abs(s['x2'] - x2) < 1e-6 for s in sols):
                                    sols.append(dict(f1=f1, f2=f2, x1=x1, x2=x2))
                        prev = (wm, g)
    return sols


def match_set_equal_size(lam, M2, w1, z1, w2, z2, focals, zmin, zmax, gap, N=4000):
    """Second, independent completeness check (review R-13). For lens 1 (f1) at x1 the beam after it has waist (wa, za);
    the target beam propagated backwards has waist (w2, z2). Lens 2 must sit where both beams have the same radius:
    wa^2 (1 + ((z - za)/zRa)^2) = w2^2 (1 + ((z - z2)/zRt)^2) is a quadratic in z. There the thin lens must turn one
    wavefront into the other: r(x1) = 1/R_a(x2) - 1/f2 - 1/R_t(x2) = 0. x1 is scanned on a uniform grid, r is followed per
    root branch (smaller / larger x2), sign changes are bisected and each root is verified by forward propagation."""
    lamE = M2 * lam
    zRt = PI * w2 * w2 / lamE
    hi = min(zmax, z2)
    sols = []

    def after1(f1, x1):
        q = q_from_waist(w1, x1 - z1, lam, M2, 1.0)
        q = apply((1, 0, -1 / f1, 1), q)
        zRa = q.imag
        return x1 - q.real, math.sqrt(lamE * zRa / PI), zRa      # waist position, size, Rayleigh range of the beam after lens 1

    def roots_x2(f1, x1):
        za, wa, zRa = after1(f1, x1)
        A = wa * wa / (zRa * zRa) - w2 * w2 / (zRt * zRt)
        B = -2 * za * wa * wa / (zRa * zRa) + 2 * z2 * w2 * w2 / (zRt * zRt)
        C = wa * wa * (1 + za * za / (zRa * zRa)) - w2 * w2 * (1 + z2 * z2 / (zRt * zRt))
        if abs(A) < 1e-300:
            return [-C / B] if B else []
        D = B * B - 4 * A * C
        if D < 0:
            return []
        sq = math.sqrt(D)
        return sorted([(-B - sq) / (2 * A), (-B + sq) / (2 * A)])

    def invR(z, zw, zR):
        d = z - zw
        return d / (d * d + zR * zR)

    def resid(f1, f2, x1, branch):
        r = roots_x2(f1, x1)
        if len(r) <= branch:
            return None, None
        x2 = r[branch]
        za, wa, zRa = after1(f1, x1)
        return invR(x2, za, zRa) - 1 / f2 - invR(x2, z2, zRt), x2

    for f1 in focals:
        for f2 in focals:
            for br in (0, 1):
                prev = None
                for i in range(N + 1):
                    x1 = zmin + (hi - zmin) * i / N
                    g, x2 = resid(f1, f2, x1, br)
                    if g is None:
                        prev = None
                        continue
                    if prev is not None and (g == 0 or (g > 0) != (prev[1] > 0)):
                        a, ga, b = prev[0], prev[1], x1
                        okb = True
                        for _ in range(80):
                            c = 0.5 * (a + b)
                            gc, _x = resid(f1, f2, c, br)
                            if gc is None:
                                okb = False
                                break
                            if (gc > 0) == (ga > 0):
                                a, ga = c, gc
                            else:
                                b = c
                        if okb:
                            X1 = 0.5 * (a + b)
                            g1, X2 = resid(f1, f2, X1, br)
                            if X2 is not None and X1 >= zmin - 1e-9 and X2 <= hi + 1e-9 and X2 - X1 >= gap - 1e-9:
                                # verify by forward propagation (rejects sign changes at poles of 1/R or branch jumps)
                                q = q_from_waist(w1, X1 - z1, lam, M2, 1.0)
                                q = apply((1, 0, -1 / f1, 1), q)
                                q = q + (X2 - X1)
                                q = apply((1, 0, -1 / f2, 1), q)
                                zw, ww = X2 - q.real, math.sqrt(lamE * q.imag / PI)
                                if abs(ww / w2 - 1) < 1e-6 and abs(zw - z2) < 1e-6 * max(1.0, zRt):
                                    if not any(s['f1'] == f1 and s['f2'] == f2 and abs(s['x1'] - X1) < 1e-6 for s in sols):
                                        sols.append(dict(f1=f1, f2=f2, x1=X1, x2=X2))
                    prev = (x1, g)
    return sols


for (cid, note, st) in [
    ('match-hene', 'HeNe 0.35 mm waist at z = 0 into a 100 um waist at z = 600 mm, 11 catalogue focal lengths, lenses 50-600 mm, gap >= 10 mm',
     dict(lambda_nm=632.8, w0_mm=0.35, z0_mm=0, tW0_um=100, tZ0_mm=600, mzMin_mm=50, mzMax_mm=600, mGap_mm=10, focals='-100 -50 -25 25 50 75 100 150 200 250 300')),
    ('match-1064-expand', '1064 nm 0.5 mm waist into a 2 mm waist at z = 1 m (expansion), 7 focal lengths',
     dict(lambda_nm=1064, w0_mm=0.5, z0_mm=0, tW0_um=2000, tZ0_mm=1000, mzMin_mm=20, mzMax_mm=900, mGap_mm=5, focals='-50 -25 25 50 100 150 200'))]:
    s = dict(DEF, mode='match', expM=4)
    s.update(st)
    lam = s['lambda_nm'] * 1e-9
    foc = [float(v) / 1000 for v in s['focals'].split()]
    sols = match_set(lam, 1.0, s['w0_mm'] / 1000, s['z0_mm'] / 1000, s['tW0_um'] * 1e-6, s['tZ0_mm'] / 1000, foc,
                     s['mzMin_mm'] / 1000, s['mzMax_mm'] / 1000, s['mGap_mm'] / 1000)
    alt = match_set_equal_size(lam, 1.0, s['w0_mm'] / 1000, s['z0_mm'] / 1000, s['tW0_um'] * 1e-6, s['tZ0_mm'] / 1000, foc,
                               s['mzMin_mm'] / 1000, s['mzMax_mm'] / 1000, s['mGap_mm'] / 1000)
    same = lambda a, b: a['f1'] == b['f1'] and a['f2'] == b['f2'] and abs(a['x1'] - b['x1']) < 1e-6 and abs(a['x2'] - b['x2']) < 1e-6
    miss = [r for r in sols if not any(same(r, a) for a in alt)]
    extra = [a for a in alt if not any(same(r, a) for r in sols)]
    print(cid, 'intermediate-waist', len(sols), 'equal-size method', len(alt), 'missing', len(miss), 'extra', len(extra))
    assert not miss and not extra, (cid, miss[:3], extra[:3])
    cases.append(dict(id=cid, kind='match', note=note + f'; complete set confirmed by a second method (equal beam size at lens 2): {len(alt)} solutions',
                      state=s, expect={'solutions': sols, 'count': len(sols), 'count_equal_size_method': len(alt)}, tol={'pos_m': 1e-6}))


# I. preset "aha" claims — each preset's state is restated here and the page's preset must equal it
def waists_of(st, ax='x'):
    s = dict(DEF); s.update(st)
    lam = s['lambda_nm'] * 1e-9
    beam = dict(w0=s['w0_mm'] / 1000, z0=s['z0_mm'] / 1000, M2=s['M2'])
    els = to_si(s['elements'])
    for e in els:
        e['fa'] = focal_axis(e, ax)
    return run_system(lam, s['n0'], beam, els, [0.0])[1]


def P(label, kind, z, f, **kw):
    d = dict(label=label, kind=kind, z_mm=z, f_mm=f, t_mm=0, n=1.5, aoi=0, D_mm=25.4); d.update(kw); return d


AHA = []
st = dict(mode='propagate', lambda_nm=632.8, src='waist', w0_mm=0.4, z0_mm=0, M2=1, astig=False, elements=[P('L1', 'lens', 200, 100)], zStart_mm=0, zEnd_mm=400)
W = waists_of(st)[-1]
AHA.append(('hene100', st, {'shift_mm': (W['z0'] - 0.3) * 1000, 'w0_um': W['w0'] * 1e6}, 'waist 1.6 mm behind the focal plane (claim: 1.5-1.7 mm), ~50 um'))
st = dict(mode='propagate', lambda_nm=1064, src='waist', w0_mm=2.5, z0_mm=0, M2=1.3, astig=False, elements=[P('F100', 'lens', 50, 100)], zStart_mm=0, zEnd_mm=200)
W13 = waists_of(st)[-1]; W1 = waists_of(dict(st, M2=1))[-1]
AHA.append(('m2spot', st, {'ratio': W13['w0'] / W1['w0'], 'w0_m1_um': W1['w0'] * 1e6}, 'spot 1.30x of M2 = 1, which is 13.5 um'))
st = dict(mode='propagate', lambda_nm=1064, src='waist', w0_mm=2, z0_mm=0, M2=1, astig=False, elements=[P('F20', 'lens', 50, 20)], zStart_mm=0, zEnd_mm=90)
A20 = waists_of(st)[-1]; A40 = waists_of(dict(st, elements=[P('F20', 'lens', 50, 40)]))[-1]
AHA.append(('harder', st, {'spot_ratio': A20['w0'] / A40['w0'], 'zR_ratio': A20['zR'] / A40['zR']}, 'f 20 vs 40: spot 0.5x, Rayleigh range 0.25x'))
st = dict(mode='propagate', lambda_nm=632.8, src='waist', w0_mm=0.4, z0_mm=0, M2=1, astig=False, elements=[P('−25', 'lens', 100, -25, D_mm=12.7), P('+100', 'lens', 175, 100)], zStart_mm=0, zEnd_mm=1500)
G_ = waists_of(st)
AHA.append(('galileo', st, {'length_mm': 75.0, 'internal_real': 0.100 <= G_[1]['z0'] <= 0.175, 'mag': G_[-1]['w0'] / G_[0]['w0']}, 'no real internal waist, 75 mm long, x4 waist'))
st = dict(mode='propagate', lambda_nm=632.8, src='waist', w0_mm=0.4, z0_mm=0, M2=1, astig=False, elements=[P('+25', 'lens', 100, 25, D_mm=12.7), P('PH', 'aperture', 125.1, 0, D_mm=0.05), P('+100', 'lens', 225, 100)], zStart_mm=0, zEnd_mm=1500)
K_ = waists_of(st)
AHA.append(('kepler', st, {'length_mm': 125.0, 'internal_w0_um': K_[1]['w0'] * 1e6, 'internal_real': 0.100 <= K_[1]['z0'] <= 0.225, 'mag': K_[-1]['w0'] / K_[0]['w0']}, 'internal waist 12.5 um, 125 mm long, x4'))
st = dict(mode='fibre', lambda_nm=1550, src='waist', w0_mm=1.05, z0_mm=0, M2=1, astig=False, elements=[P('A11', 'lens', 50, 11, D_mm=5.5)], zStart_mm=0, zEnd_mm=80, fMFD_um=10.4, fAuto=True, fdx_um=3, ftilt_mrad=0)
Wf = waists_of(st)[-1]
lam = 1550e-9
vals, _ = run_system(lam, 1, dict(w0=1.05e-3, z0=0, M2=1), [dict(kind='lens', z=0.05, f=0.011, t=0, n=1.5, aoi=0, fa=0.011)], [Wf['z0']])
e0 = overlap_numeric(vals[0][0], vals[0][1], vals[0][0], vals[0][1], 5.2e-6, lam, 0, 0)
e3 = overlap_numeric(vals[0][0], vals[0][1], vals[0][0], vals[0][1], 5.2e-6, lam, 3e-6, 0)
AHA.append(('smf28', st, {'eta0': e0, 'loss3_dB': -10 * math.log10(e3)}, 'aligned > 99 %, 3 um offset costs ~1.4 dB'))
st = dict(mode='match', lambda_nm=632.8, src='waist', w0_mm=0.35, z0_mm=0, M2=1, astig=False, elements=[], zStart_mm=0, zEnd_mm=700, tW0_um=100, tZ0_mm=600, mzMin_mm=50, mzMax_mm=600, mGap_mm=10, expM=4, focals='-100 -50 -25 25 50 75 100 150 200 250 300')
ms = match_set(632.8e-9, 1.0, 0.35e-3, 0.0, 100e-6, 0.6, [float(v) / 1000 for v in st['focals'].split()], 0.05, 0.6, 0.01)
AHA.append(('match', st, {'count': len(ms), 'min_len_mm': min(0.6 - m['x1'] for m in ms) * 1000, 'max_len_mm': max(0.6 - m['x1'] for m in ms) * 1000}, 'dozens of exact solutions, path 90 to 540 mm'))
st = dict(mode='propagate', lambda_nm=1064, src='waist', w0_mm=1, z0_mm=0, M2=1, astig=False, elements=[P('M50', 'mirror', 100, 50, aoi=10)], zStart_mm=0, zEnd_mm=220)
AHA.append(('fold', st, {'split_mm': (waists_of(st, 'y')[-1]['z0'] - waists_of(st, 'x')[-1]['z0']) * 1000}, 'x and y waists 1.5 mm apart'))
st = dict(mode='cavity', lambda_nm=1064, R1_mm=500, R1flat=False, R2_mm=500, R2flat=False, L_mm=990, cn=1)
def w_mirror(R, L, lam=1064e-9):
    g = 1 - L / R
    return math.sqrt(lam * L / PI * math.sqrt(1 / ((1 - g * g))))
AHA.append(('edge', st, {'spot_ratio': w_mirror(0.5, 0.99) / w_mirror(0.5, 0.5)}, 'mirror spots ~3x those of the confocal cavity'))
AHA.append(('iso', dict(mode='propagate', lambda_nm=1064, src='fit', astig=False, elements=[], zStart_mm=0, zEnd_mm=300), {'M2': 1.3}, 'fit returns M2 = 1.3'))
for pid, st, exp, note in AHA:
    cases.append(dict(id='aha-' + pid, kind='aha', preset=pid, note=note, state=st, expect=exp, tol={'rel': 1e-6}))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gaussbeam_ref.json')
with open(out, 'w', encoding='utf-8') as fh:
    json.dump(cases, fh, indent=1)
print('gaussbeam_ref.json', len(cases), 'cases;', ', '.join(f"{c['id']}={c['expect'].get('count', '')}" for c in cases if c['kind'] == 'match'))
