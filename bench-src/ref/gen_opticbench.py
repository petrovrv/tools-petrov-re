"""Independent reference for opticbench.html (Optical Bench 3D).

Written from the published methods, NOT ported from opt-trace.js / opt-bench-model.js:
  * refractive index: Sellmeier equation with the SCHOTT data-sheet coefficients of N-BK7 and N-SF11
    (SCHOTT optical glass data sheets, as listed on refractiveindex.info, read 2026-11-13);
  * meridional (2-D) exact ray trace through spheres, conics and planes with the vector form of Snell's law
    (Born & Wolf, Principles of Optics, 7th ed., §3.2; Smith, Modern Optical Engineering, 4th ed., ch. 10);
  * Fresnel power coefficients Rs, Rp (Born & Wolf §1.5.2; Hecht, Optics, 5th ed., §4.6), incoherent plate T = (1-R)/(1+R);
  * minimum deviation of a prism D = 2 asin(n sin(A/2)) - A, grating equation sin(theta_m) = m lambda / Lambda,
    Malus's law, Jones matrices of a half-wave plate (Hecht ch. 8);
  * afocal two-lens telescope from thick-lens paraxial matrices (Smith ch. 2-4).
Writes bench-src/ref/opticbench_ref.json: a list of cases, each with the scene the page must load (or a preset id)
and the expected values with their tolerance.  Run: python bench-src/ref/gen_opticbench.py
"""
import json, math, pathlib

OUT = pathlib.Path(__file__).resolve().parent / 'opticbench_ref.json'
D2R = math.pi / 180

# ---------------------------------------------------------------- glass (SCHOTT Sellmeier, lambda in micrometres)
SELL = {
    'N-BK7': ((1.03961212, 0.231792344, 1.01046945), (0.00600069867, 0.0200179144, 103.560653)),
    'N-SF11': ((1.73759695, 0.313747346, 1.89878101), (0.013188707, 0.0623068142, 155.23629)),
}
def n_glass(mat, nm):
    B, C = SELL[mat]
    l2 = (nm / 1000.0) ** 2
    return math.sqrt(1 + sum(b * l2 / (l2 - c) for b, c in zip(B, C)))

# ---------------------------------------------------------------- Fresnel
def fresnel_R(n1, n2, th_i):
    s = n1 / n2 * math.sin(th_i)
    if s >= 1: return 1.0, 1.0
    th_t = math.asin(s)
    ci, ct = math.cos(th_i), math.cos(th_t)
    rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct)
    rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct)
    return rs * rs, rp * rp

# ---------------------------------------------------------------- 2-D meridional ray trace (z along the axis, y transverse)
def norm(v):
    l = math.hypot(v[0], v[1]); return (v[0] / l, v[1] / l)

def hit_surface(p, d, zv, R, k=0.0):
    """intersection of ray p + t d with the surface z = zv + sag(y) (sphere/conic radius R, R = 0 plane). Returns point and unit normal (pointing to -z side)."""
    if not R:
        t = (zv - p[0]) / d[0]
        q = (p[0] + t * d[0], p[1] + t * d[1])
        return q, (-1.0, 0.0)
    c = 1.0 / R
    # conic: c (y^2 + (1+k) z^2) - 2 z = 0 in local coordinates (z from vertex)
    pz, py = p[0] - zv, p[1]
    a = c * (d[1] ** 2 + (1 + k) * d[0] ** 2)
    b = 2 * c * (py * d[1] + (1 + k) * pz * d[0]) - 2 * d[0]
    cc = c * (py ** 2 + (1 + k) * pz ** 2) - 2 * pz
    if abs(a) < 1e-15: t = -cc / b
    else:
        disc = b * b - 4 * a * cc
        r1, r2 = (-b - math.sqrt(disc)) / (2 * a), (-b + math.sqrt(disc)) / (2 * a)
        cands = [t for t in (r1, r2) if t > 1e-9]
        # the branch that passes through the vertex: |z| small for |y| small
        t = min(cands, key=lambda t: abs((pz + t * d[0]) - (c * (py + t * d[1]) ** 2 / (1 + math.sqrt(max(0.0, 1 - (1 + k) * c * c * (py + t * d[1]) ** 2))))))
    q = (p[0] + t * d[0], p[1] + t * d[1])
    z, y = q[0] - zv, q[1]
    # gradient of F = c(y^2 + (1+k) z^2) - 2 z
    g = (2 * c * (1 + k) * z - 2, 2 * c * y)
    nrm = norm(g)
    if nrm[0] > 0: nrm = (-nrm[0], -nrm[1])
    return q, nrm

def refract(d, nrm, n1, n2):
    ci = -(d[0] * nrm[0] + d[1] * nrm[1])
    if ci < 0: nrm = (-nrm[0], -nrm[1]); ci = -ci
    mu = n1 / n2
    k = 1 - mu * mu * (1 - ci * ci)
    if k < 0: return None
    f = mu * ci - math.sqrt(k)
    return norm((mu * d[0] + f * nrm[0], mu * d[1] + f * nrm[1]))

def reflect(d, nrm):
    dn = d[0] * nrm[0] + d[1] * nrm[1]
    return (d[0] - 2 * dn * nrm[0], d[1] - 2 * dn * nrm[1])

def trace_lens(h, surfaces, z_start=-50.0, nm=587.6):
    """surfaces: [(zv, R, k, material after)] — returns final point, direction and the product of Fresnel T (unpolarised average per surface)."""
    p, d, n1, Ts, Tp = (z_start, h), (1.0, 0.0), 1.0, 1.0, 1.0
    for zv, R, k, mat in surfaces:
        n2 = n_glass(mat, nm) if mat else 1.0
        q, nr = hit_surface(p, d, zv, R, k)
        th = math.acos(min(1.0, abs(d[0] * nr[0] + d[1] * nr[1])))
        Rs, Rp = fresnel_R(n1, n2, th)
        Ts *= 1 - Rs; Tp *= 1 - Rp                      # meridional ray: the s and p planes stay the same at every surface
        d = refract(d, nr, n1, n2); p = q; n1 = n2
    return p, d, 0.5 * (Ts + Tp)

def y_at(p, d, z): return p[1] + (z - p[0]) * d[1] / d[0]

def best_focus_rms(rays, weights=None):
    """rays: [(p, d)] in 2-D; plane z where the weighted RMS of y about its mean is minimal (closed form)."""
    w = weights or [1.0] * len(rays)
    A = [p[1] - p[0] * d[1] / d[0] for p, d in rays]     # y at z = 0
    Bv = [d[1] / d[0] for p, d in rays]                   # dy/dz
    W = sum(w)
    mA = sum(wi * a for wi, a in zip(w, A)) / W; mB = sum(wi * b for wi, b in zip(w, Bv)) / W
    cab = sum(wi * (a - mA) * (b - mB) for wi, a, b in zip(w, A, Bv)); vb = sum(wi * (b - mB) ** 2 for wi, b in zip(w, Bv)); va = sum(wi * (a - mA) ** 2 for wi, a in zip(w, A))
    s = -cab / vb
    return s, math.sqrt(max(0.0, (va + 2 * s * cab + s * s * vb) / W))

# ---------------------------------------------------------------- scene helpers (the page's scene format; mm, deg)
def S(id, x, y, rz=0, **p):
    base = {'type': 'collimated', 'n': 1, 'D': 0, 'P': 0.001, 'lambdaNm': 587.6, 'pattern': 'fan', 'pol': 'unpolarized'}
    base.update(p)
    return {'id': id, 'kind': 'source', 'pose': {'x': x, 'y': y, 'z': 0, 'rx': 0, 'ry': 0, 'rz': rz}, 'params': base}
def E(id, kind, x, y, rz=0, **p):
    return {'id': id, 'kind': kind, 'pose': {'x': x, 'y': y, 'z': 0, 'rx': 0, 'ry': 0, 'rz': rz}, 'params': p}

cases = []
def case(id, kind, note, scene=None, expect=None, tol=None, preset=None, **extra):
    c = {'id': id, 'kind': kind, 'note': note, 'expect': expect or {}, 'tol': tol or {}}
    if scene is not None: c['scene'] = scene
    if preset: c['preset'] = preset
    c.update(extra)
    cases.append(c)

# 1 tilted plate: lateral shift and two-surface Fresnel transmission (ghost reflections not followed)
for th in (20, 45, 60):
    n = n_glass('N-BK7', 587.6); t = 10.0; a = th * D2R
    shift = t * math.sin(a) * (1 - math.cos(a) / math.sqrt(n * n - math.sin(a) ** 2))
    Rs, Rp = fresnel_R(1, n, a)
    T = 0.5 * ((1 - Rs) ** 2 + (1 - Rp) ** 2)
    case('plate-%d' % th, 'detector', 'N-BK7 plate 10 mm tilted %d°: lateral shift t sinθ(1 − cosθ/√(n² − sin²θ)) and Fresnel T for unpolarised light' % th,
         scene=[S('S', 0, 0), E('W', 'window', 60, 0, th, D=60, t=t, material='N-BK7'), E('SC', 'screen', 200, 0, 0, W=60, H=60)],
         expect={'abs_cx': shift, 'share': T}, tol={'abs_cx': 1e-9, 'share': 1e-9}, det='SC')

# 2 window at normal incidence with ghost reflections followed: incoherent T = (1 − R)/(1 + R)
for lam in (486.1, 656.3):
    n = n_glass('N-BK7', lam); R = ((n - 1) / (n + 1)) ** 2
    case('window-ghosts-%d' % int(lam), 'detector', 'N-BK7 window at normal incidence, multiple reflections followed: T = (1 − R)/(1 + R), λ = %s nm' % lam,
         scene=[S('S', 0, 0, lambdaNm=lam), E('W', 'window', 60, 0, 0, D=25.4, t=5, material='N-BK7'), E('PM', 'powermeter', 150, 0, 0, D=20)],
         expect={'share': (1 - R) / (1 + R)}, tol={'share': 5e-6}, det='PM', ghosts=True)

# 3 Brewster angle: p passes without reflection loss, s loses (1 − Rs) per face
n = n_glass('N-BK7', 632.8); thB = math.atan(n)
Rs, Rp = fresnel_R(1, n, thB)
for pol, want in (('p', 1.0), ('s', (1 - Rs) / (1 + Rs))):
    case('brewster-' + pol, 'detector', 'Window at Brewster’s angle arctan n = %.3f°, %s-polarised, ghosts followed' % (thB / D2R, pol),
         scene=[S('S', 0, 0, type='laser', w0=0.5, lambdaNm=632.8, pol='linear', polAngle=0 if pol == 'p' else 90), E('W', 'window', 80, 0, round(thB / D2R, 6), D=25.4, t=5, material='N-BK7'), E('PM', 'powermeter', 180, 0, 0, D=20)],
         expect={'share': want}, tol={'share': 5e-4 if pol == 's' else 1e-9}, det='PM', ghosts=True)

# 4 ideal thin lens imaging: 1/s + 1/s' = 1/f, magnification −s'/s
f, so = 100.0, 150.0; si = 1 / (1 / f - 1 / so)
case('thinlens-image', 'detector', 'Point object 5 mm off-axis, 150 mm in front of an ideal lens f = 100 mm: image at s′ = %.1f mm, height −10 mm' % si,
     scene=[S('S', 0, 5, type='point', n=11, halfAngle=3), E('L', 'thinlens', so, 0, 0, f=f, D=50), E('SC', 'screen', so + si, 0, 0, W=40, H=40)],
     expect={'cx': -5 * si / so, 'rms': 0.0}, tol={'cx': 1e-9, 'rms': 1e-9}, det='SC')

# 5 mirrors: exact reflected ray height on a transparent screen at the paraxial focal plane
for k, label in ((0, 'sphere'), (-1, 'parabola')):
    for h in (5.0, 12.0):
        R = 200.0
        q, nr = hit_surface((0.0, h), (1.0, 0.0), 300.0, -R, k)        # mirror vertex at z=300, concave towards the source: centre at 300 − R
        d = reflect((1.0, 0.0), nr)
        y = y_at(q, d, 300 - R / 2)
        case('mirror-%s-%g' % (label, h), 'detector', 'Concave %s R = 200 mm, ray at h = %g mm: height of the reflected ray in the paraxial focal plane' % (label, h),
             scene=[S('S', 0, h), E('M', 'mirror', 300, 0, 0, R=R, k=k, D=40), E('SC', 'screen', 300 - R / 2, 0, 180, W=60, H=60, transparent=True)],
             expect={'abs_cx': abs(y)}, tol={'abs_cx': 1e-9}, det='SC', firstHit=True)

# 6 Thorlabs LA1509 (R 51.5, CT 3.6, N-BK7): exact marginal rays at the catalogue back focal plane, both orientations
for flip in (False, True):
    for h in (2.0, 8.0):
        z0 = 100 - 1.8
        surf = [(z0, 51.5, 0, 'N-BK7'), (z0 + 3.6, 0, 0, None)] if not flip else [(z0, 0, 0, 'N-BK7'), (z0 + 3.6, -51.5, 0, None)]
        p, d, T = trace_lens(h, surf, nm=587.6)
        zs = 100 + 1.8 + 97.3 if not flip else 100 + 1.8 + 100.0
        case('la1509-%s-%g' % ('flat' if flip else 'curved', h), 'detector', 'LA1509 %s first, ray at h = %g mm: exact height on a plane %.1f mm behind the lens centre' % ('flat side' if flip else 'curved side', h, zs - 100),
             scene=[S('S', 0, h), E('L', 'lens', 100, 0, 0, stock='LA1509', flip=flip), E('SC', 'screen', zs, 0, 0, W=60, H=60)],
             expect={'abs_cx': abs(y_at(p, d, zs)), 'share': T}, tol={'abs_cx': 1e-9, 'share': 1e-9}, det='SC')

# 7 prism minimum deviation (searched by the driver through the page) and grating orders
for mat in ('N-BK7', 'N-SF11'):
    for lam in (486.1, 587.6, 656.3):
        n = n_glass(mat, lam)
        case('mindev-%s-%d' % (mat, int(lam)), 'mindev', 'Equilateral %s prism, λ = %s nm: minimum deviation 2 asin(n/2) − 60°' % (mat, lam),
             scene=[S('S', 0, -4, lambdaNm=lam), E('P', 'prism', 80, 0, -26, shape='equilateral', a=25, material=mat, ar=True), E('SC', 'screen', 80, 120, 90, W=400, H=60, transparent=True)],
             expect={'dev_deg': (2 * math.asin(n * math.sin(30 * D2R)) - 60 * D2R) / D2R}, tol={'dev_deg': 1e-6})
for lpmm in (300, 600, 1200):
    for lam in (450.0, 632.8):
        Lam = 1e6 / lpmm
        orders = [m for m in range(-5, 6) if abs(m * lam / Lam) < 1]
        case('grating-%d-%d' % (lpmm, int(lam)), 'grating', 'Transmission grating %d l/mm, λ = %s nm at normal incidence: sin θm = mλ/Λ for every propagating order' % (lpmm, lam),
             scene=[S('S', 0, 0, lambdaNm=lam), E('G', 'grating', 50, 0, 0, lpmm=lpmm, mode='transmit', W=25, H=25, maxOrder=5), E('SC', 'screen', 60, 0, 0, W=2000, H=60, transparent=True)],
             expect={'sines': sorted(m * lam / Lam for m in orders)}, tol={'sines': 1e-12})

# 8 polarisation: Malus, half-wave plate, fibre acceptance
for ang in (0, 30, 45, 60, 90):
    case('malus-%d' % ang, 'detector', 'Unpolarised light through polarisers at 0° and %d°: T = ½ cos²θ' % ang,
         scene=[S('S', 0, 0), E('P1', 'polarizer', 40, 0, 0, angle=0), E('P2', 'polarizer', 80, 0, 0, angle=ang), E('PM', 'powermeter', 120, 0, 0, D=20)],
         expect={'share': 0.5 * math.cos(ang * D2R) ** 2}, tol={'share': 1e-12}, det='PM')
for pa, want in ((45, 1.0), (-45, 0.0), (0, 0.5)):
    # Jones: HWP with fast axis at 22.5° turns 0° linear into 45° linear; an analyser at pa transmits cos²(45° − pa)
    case('hwp-%d' % pa, 'detector', 'Linear 0° through λ/2 at 22.5° then an analyser at %d°: T = cos²(45° − %d°)' % (pa, pa),
         scene=[S('S', 0, 0, type='laser', w0=0.5, lambdaNm=632.8, pol='linear', polAngle=0), E('H', 'waveplate', 40, 0, 0, waves=0.5, angle=22.5, lambda0Nm=632.8), E('A', 'polarizer', 80, 0, 0, angle=pa), E('PM', 'powermeter', 120, 0, 0, D=20)],
         expect={'share': math.cos((45 - pa) * D2R) ** 2}, tol={'share': 1e-12}, det='PM')
for h in (2.0, 2.5):
    f, NA = 10.0, 0.22
    sin_t = h / math.hypot(h, f)
    case('fibre-na-%g' % h, 'coupled', 'Ray at h = %g mm through an ideal lens f = 10 mm onto a fibre (core 50 µm, NA 0.22): sin θ = %.4f → %s' % (h, sin_t, 'coupled' if sin_t <= NA else 'rejected'),
         scene=[S('S', 0, h), E('L', 'thinlens', 20, 0, 0, f=f, D=20), E('F', 'fiber', 30, 0, 0, coreD=0.05, NA=NA, Dferrule=2.5)],
         expect={'share': 1.0 if sin_t <= NA else 0.0}, tol={'share': 1e-12}, det='F')

# 9 Michelson: optical path difference 2 ΔL
for dL in (0.3164, 5.0, 12.5):
    case('michelson-%g' % dL, 'paths', 'Michelson with arm 2 longer by %g mm: ΔOPL = 2ΔL' % dL,
         scene=[S('S', 0, 0, type='laser', w0=0.5, lambdaNm=632.8, pol='linear', polAngle=45), E('BS', 'bscube', 100, 0, 0, a=25.4, R=0.5), E('M1', 'mirror', 200, 0, 0, D=25.4),
                E('M2', 'mirror', 100, 100 + dL, 90, D=25.4), E('SC', 'screen', 100, -100, -90, W=25, H=25)],
         expect={'dOPL': 2 * dL, 'P_each': 0.25}, tol={'dOPL': 1e-9, 'P_each': 1e-12}, det='SC')

# ---------------------------------------------------------------- preset claims (the page computes them; the reference recomputes the physics)
# pcx: fan of 21 rays across Ø20 mm through LA1509 both ways, best-focus RMS ratio
def pcx(flip):
    z0 = 100 - 1.8
    surf = [(z0, 51.5, 0, 'N-BK7'), (z0 + 3.6, 0, 0, None)] if not flip else [(z0, 0, 0, 'N-BK7'), (z0 + 3.6, -51.5, 0, None)]
    rays, w = [], []
    for i in range(21):
        h = -10 + 20 * i / 20
        p, d, T = trace_lens(h, surf, nm=632.8); rays.append((p, d)); w.append(T)
    return best_focus_rms(rays, w)[1]
a, b = pcx(False), pcx(True)
case('aha-pcx', 'aha', 'Preset: plano-convex orientation', preset='pcx', expect={'ratio': b / a, 'rmsCurvedFirst_um': a * 1e3, 'rmsFlatFirst_um': b * 1e3}, tol={'ratio': 2e-3, 'rmsCurvedFirst_um': 2e-3, 'rmsFlatFirst_um': 2e-3})

# expanders: afocal spacing of thick lenses from paraxial matrices (catalogue radii and thickness)
def thick(R1, R2, CT, n):
    # paraxial system matrix [[A,B],[C,D]] acting on (y, n u); refraction power (n2 - n1)/R
    def refr(n1, n2, R): return [[1, 0], [-(n2 - n1) / R if R else 0, 1]]
    def tr(t, nn): return [[1, t / nn], [0, 1]]
    def mm(X, Y): return [[X[0][0] * Y[0][0] + X[0][1] * Y[1][0], X[0][0] * Y[0][1] + X[0][1] * Y[1][1]], [X[1][0] * Y[0][0] + X[1][1] * Y[1][0], X[1][0] * Y[0][1] + X[1][1] * Y[1][1]]]
    return mm(refr(n, 1, R2), mm(tr(CT, n), refr(1, n, R1)))
def afocal_gap(L1, L2):
    """distance between lens centres that makes the pair afocal (C = 0)"""
    def C_of(sep):
        tr = [[1, sep - L1[2] / 2 - L2[2] / 2], [0, 1]]
        A = thick(*L1); B = thick(*L2)
        X = [[tr[0][0] * A[0][0] + tr[0][1] * A[1][0], tr[0][0] * A[0][1] + tr[0][1] * A[1][1]], [A[1][0], A[1][1]]]
        return B[1][0] * X[0][0] + B[1][1] * X[1][0]
    lo, hi = 1.0, 400.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if C_of(lo) * C_of(mid) <= 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2
nr = n_glass('N-BK7', 632.8)
# catalogue prescriptions (Thorlabs public pages, collected by the core unit into _opt/core/stock.json — data only, no page code)
STOCK = {x['id']: x for x in json.loads((pathlib.Path(__file__).resolve().parents[2] / '_opt' / 'core' / 'stock.json').read_text(encoding='utf-8'))}
LA1131 = (STOCK['LA1131']['R1'], 0.0, STOCK['LA1131']['CT'], nr)
LA1433f = (0.0, -STOCK['LA1433']['R1'], STOCK['LA1433']['CT'], nr)          # LA1433 turned round (flat side first)
LC1715 = (STOCK['LC1715']['R1'], 0.0, STOCK['LC1715']['CT'], nr)
def afocal_mag(L1, L2):
    """beam magnification |A| of the afocal pair at its afocal spacing (review R-16: computed, not given)"""
    sep = afocal_gap(L1, L2)
    tr = [[1, sep - L1[2] / 2 - L2[2] / 2], [0, 1]]
    A = thick(*L1); B = thick(*L2)
    X = [[tr[0][0] * A[0][0] + tr[0][1] * A[1][0], tr[0][0] * A[0][1] + tr[0][1] * A[1][1]], [A[1][0], A[1][1]]]
    return abs(B[0][0] * X[0][0] + B[0][1] * X[1][0])
case('aha-expanders', 'aha', 'Preset: Kepler vs Galileo — afocal lens spacing and beam magnification from thick-lens matrices', preset='expanders',
     expect={'lengthKepler_mm': afocal_gap(LA1131, LA1433f), 'lengthGalilean_mm': afocal_gap(LC1715, LA1433f), 'magKepler': afocal_mag(LA1131, LA1433f), 'magGalilean': afocal_mag(LC1715, LA1433f), 'keplerInverts': True},
     tol={'lengthKepler_mm': 0.1, 'lengthGalilean_mm': 0.1, 'magKepler': 0.012, 'magGalilean': 0.012}, needs_stock=['LA1131', 'LA1433', 'LC1715'])
case('aha-filter4f', 'aha', 'Preset: 4f spatial filter — 1° stray light focuses f·tan 1° = %.2f mm from the axis, the 0.1 mm pinhole radius blocks it' % (100.1 * math.tan(D2R)), preset='filter4f',
     expect={'strayTransmitted': 0.0}, tol={'strayTransmitted': 1e-12}, bounds={'mainTransmitted': [0.97, 1.0]})   # AR-coated AC254-100-A (R-7): no Fresnel loss in the model
# fringes per µm of mirror travel from the optical path of the arm itself (out and back in air), not from the page's formula
def arm_opl(L): return 2 * L * 1.0
fr_um = (arm_opl(105.001) - arm_opl(105.0)) / 632.8e-6
case('aha-michelson', 'aha', 'Preset: Michelson ΔOPL = 2 × 5 mm', preset='michelson', expect={'dOPL_mm': 10.0, 'twiceArmDifference_mm': 10.0, 'fringesPerMirrorMicron': fr_um}, tol={'dOPL_mm': 1e-9, 'twiceArmDifference_mm': 1e-12, 'fringesPerMirrorMicron': 1e-9})
case('aha-machzehnder', 'aha', 'Preset: Mach–Zehnder with cubes — equal glass in both arms', preset='machzehnder', expect={'dOPL_out1_mm': 0.0, 'dOPL_out2_mm': 0.0, 'P_out1': 0.5, 'P_out2': 0.5}, tol={'dOPL_out1_mm': 1e-9, 'dOPL_out2_mm': 1e-9, 'P_out1': 1e-9, 'P_out2': 1e-9})
# prism: dispersion at the incidence of minimum deviation for N-SF11 at 587.6 nm; N-BK7 in the same prism position
i0 = math.asin(n_glass('N-SF11', 587.6) * math.sin(30 * D2R))
def dev(mat, lam):
    n = n_glass(mat, lam); r1 = math.asin(math.sin(i0) / n); r2 = 60 * D2R - r1
    return (i0 + math.asin(n * math.sin(r2)) - 60 * D2R) / D2R
case('aha-prism', 'aha', 'Preset: prism spectrum width 400–700 nm at the minimum-deviation incidence of N-SF11 (587.6 nm)', preset='prism',
     expect={'spreadSF11_deg': dev('N-SF11', 400) - dev('N-SF11', 700), 'spreadBK7_deg': dev('N-BK7', 400) - dev('N-BK7', 700)}, tol={'spreadSF11_deg': 5e-3, 'spreadBK7_deg': 5e-3})
Lam = 1e6 / 600
w1 = (math.asin(700 / Lam) - math.asin(400 / Lam)) / D2R; w2 = (math.asin(1400 / Lam) - math.asin(800 / Lam)) / D2R
case('aha-grating', 'aha', 'Preset: grating order widths 400–700 nm, 600 l/mm', preset='grating', expect={'width1_deg': w1, 'width2_deg': w2, 'gratingEquation': True}, tol={'width1_deg': 1e-9, 'width2_deg': 1e-9})
case('aha-brewster', 'aha', 'Preset: Brewster window', preset='brewster', expect={'Tp': 1.0, 'Ts': (1 - Rs) / (1 + Rs), 'brewster_deg': round(thB / D2R, 3)}, tol={'Tp': 1e-6, 'Ts': 5e-4, 'brewster_deg': 1e-9})
case('aha-malus', 'aha', 'Preset: Malus', preset='malus', expect={'T60': 0.125, 'Tcrossed': 0.0, 'Tcrossed45between': 0.125}, tol={'T60': 1e-12, 'Tcrossed': 1e-12, 'Tcrossed45between': 1e-12})
case('aha-isolator', 'aha', 'Preset: λ/4 + PBS isolator', preset='isolator', expect={'backToLaser': 0.0, 'sidePort': 1.0}, tol={'backToLaser': 1e-12, 'sidePort': 1e-9})
# fibre: plano-hyperbolic lens (stigmatic, focus R/(n−1) behind the vertex); the FULL Gaussian beam (review R-6), accepted while sin θ ≤ NA
n_f = n_glass('N-BK7', 632.8); R_f = 11 * (n_f - 1); k_f = -n_f * n_f
def sag_f(h): c = 1 / R_f; return c * h * h / (1 + math.sqrt(1 - (1 + k_f) * c * c * h * h))
def sin_at(h): return h / math.hypot(h, 11.0 + sag_f(h))
def fibre_share(w):
    # accepted rays form a disk r ≤ h* (sin θ grows with h); the Gaussian power inside it is 1 − exp(−2 h*² / w²), the aperture Ø9 mm clips at 4.5 mm
    lo, hi = 0.0, 4.5
    for _ in range(200):
        mid = (lo + hi) / 2
        if sin_at(mid) <= 0.22: lo = mid
        else: hi = mid
    h_acc = lo if sin_at(4.5) > 0.22 else 4.5
    return 1 - math.exp(-2 * h_acc * h_acc / (w * w))
case('aha-fiber', 'aha', 'Preset: fibre NA — full Gaussian beam (closed form) against the 199-ray sampling of the page (clip 2.5 w)', preset='fiber',
     expect={'coupled3mm': fibre_share(1.5), 'coupled8mm': fibre_share(4.0), 'sinThetaAtW8mm': sin_at(4.0)}, tol={'coupled3mm': 5e-3, 'coupled8mm': 0.015, 'sinThetaAtW8mm': 1e-9})
# Newton: spherical mirror R 1200, filled Ø140 pupil, best-focus RMS radius (dense polar sampling of the pupil)
def sphere_rms():
    R = 1200.0; pts = []
    for i in range(1, 121):
        h = 70 * math.sqrt((i - 0.5) / 120)        # equal-area rings
        q, nr_ = hit_surface((0.0, h), (1.0, 0.0), 700.0, -R, 0)
        d = reflect((1.0, 0.0), nr_)
        pts.append((q, d))
    # rotational symmetry: the radial ray fan with ring weights gives the 2-D RMS radius about the axis at the best plane
    best = None
    for k in range(4001):
        z = 700 - 600 + 2.0 - 4.0 * k / 4000
        r2 = sum(y_at(q, d, z) ** 2 for q, d in pts) / len(pts)
        if best is None or r2 < best[0]: best = (r2, z)
    return math.sqrt(best[0])
rms_s = sphere_rms()
case('aha-newton', 'aha', 'Preset: Newtonian — parabola stigmatic, sphere RMS ≈ 7 Airy radii of the f/4.3 beam (dense pupil sampling)', preset='newton',
     expect={'rmsParabola_um': 0.0, 'rmsSphere_um': rms_s * 1e3, 'airyRadius_um': 1.22 * 550e-6 * (600 / 140) * 1e3}, tol={'rmsParabola_um': 1e-6, 'rmsSphere_um': 0.6, 'airyRadius_um': 1e-9})   # working f-number of the 140 mm beam (R-11)

OUT.write_text(json.dumps(cases, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(cases), 'cases ->', OUT)
