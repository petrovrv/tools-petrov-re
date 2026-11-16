"""Independent reference for lensdesign.html (tools.petrov.re, optics package).

Oracle: ray-optics (M. Hayford, https://github.com/mjhoptics/ray-optics, v0.9.10, BSD-3) for first-order data,
Seidel sums (Welford convention) and exact real-ray refraction; glass indices from its opticalglass catalogues (SCHOTT).
On top of the oracle this script implements, from the published method and NOT from the page code:
  * chief-ray aiming at the stop centre (secant on the entrance-pupil offset), square pupil grid on the paraxial entrance pupil;
  * RMS spot about the centroid; best focus = scipy minimize_scalar of the summed squared spot deviations;
  * OPD on the reference sphere centred on the chief-ray image point through the paraxial exit pupil (Welford ch. 9),
    piston + tilt removed by least squares, Strehl = |<exp(i 2 pi W)>|^2, MTF = |IFFT(|FFT(P)|^2)| (Goodman ch. 6);
  * the optimiser claim by scipy.optimize.least_squares on the ray errors (Levenberg-Marquardt).
Run:  _opt/lens/venv/Scripts/python -I bench-src/ref/gen_lensdesign.py  ->  bench-src/ref/lensdesign_ref.json
"""
import json, math, pathlib, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
from scipy.optimize import minimize_scalar, least_squares
from rayoptics.optical.opticalmodel import OpticalModel
from rayoptics.raytr.opticalspec import PupilSpec, FieldSpec, WvlSpec
from rayoptics.raytr import raytrace as rt
from rayoptics.parax.thirdorder import compute_third_order
from rayoptics.elem.profiles import Conic, EvenPolynomial

F, d, C = 486.1327, 587.5618, 656.2725
CAT = {'N-BK7': 'Schott', 'SF5': 'Schott', 'N-LAK9': 'Schott', 'N-SF5': 'Schott', 'N-SF11': 'Schott', 'N-BAK4': 'Schott', 'N-SF10': 'Schott'}

# ------------------------------------------------------------------ systems (same prescriptions as the page presets / bench cases)
def S(R, t, m='air', sd=None, stop=False, k=0.0, A=None):
    return dict(R=R, t=t, m=m, sd=sd, stop=stop, k=k, A=A or [])
SYS = {
 'pcxCurved': dict(s=[S(51.5, 3.6, 'N-BK7', 12.7, True), S(None, 97)], epd=24, fields=[0], wl=[d], prim=0, image='best'),
 'pcxFlat': dict(s=[S(None, 3.6, 'N-BK7', 12.7, True), S(-51.5, 97)], epd=24, fields=[0], wl=[d], prim=0, image='best'),
 'bestForm': dict(s=[S(60.02, 4, 'N-BK7', 12.7, True), S(-353.3, 97)], epd=24, fields=[0], wl=[d], prim=0, image='best'),
 'stopDown': dict(s=[S(51.5, 3.6, 'N-BK7', 12.7, True), S(None, 97)], epd=12, fields=[0], wl=[d], prim=0, image='best'),
 'achromat': dict(s=[S(62.8, 4, 'N-BK7', 12.7, True), S(-45.7, 2.5, 'SF5', 12.7), S(-128.2, 97)], epd=24, fields=[0, 2.1, 3], wl=[F, d, C], prim=1, image='best'),
 'singletPoly': dict(s=[S(51.5, 3.6, 'N-BK7', 12.7, True), S(None, 97)], epd=24, fields=[0, 2.1, 3], wl=[F, d, C], prim=1, image='best'),
 'cooke': dict(s=[S(23.713, 4.831, 'N-LAK9'), S(7331.288, 5.86), S(-24.456, 0.975, 'N-SF5', None, True), S(21.896, 4.822), S(86.759, 3.127, 'N-LAK9'), S(-20.4942, 41.2365)],
               epd=12.5, fields=[0, 14, 20], wl=[F, d, C], prim=1, image='fixed'),
 'landscape': dict(s=[S(None, 10.6, 'air', 4.5, True), S(-30, 3, 'N-BK7', 12), S(-18.5, 90)], epd=8, fields=[0, 14, 20], wl=[d], prim=0, image='best'),
 'landscapeAtLens': dict(s=[S(None, 0.5, 'air', 4.5, True), S(-30, 3, 'N-BK7', 12), S(-18.5, 90)], epd=8, fields=[0, 14, 20], wl=[d], prim=0, image='best'),
 # extra bench systems (not presets): a conic + even-asphere plano-convex condenser (learning design), a finite-conjugate relay with an achromat
 'asphere': dict(s=[S(15.0, 6.0, 'N-SF11', 8, True, k=-0.6, A=[-2.0e-6, 1.5e-9]), S(None, 14.0)], epd=12, fields=[0, 3], wl=[d], prim=0, image='fixed'),
 'finite': dict(s=[S(62.8, 4, 'N-BK7', 12.7, True), S(-45.7, 2.5, 'SF5', 12.7), S(-128.2, 180)], epd=None, na=0.02, obj=250.0, fields=[0, 3.0], wl=[F, d, C], prim=1, image='fixed'),
}

# ------------------------------------------------------------------ ray-optics model
def build(sysd, wl_ref=None):
    opm = OpticalModel(); sm = opm['seq_model']; osp = opm['optical_spec']
    inf = 'obj' not in sysd
    if inf: osp['pupil'] = PupilSpec(osp, key=['object', 'epd'], value=sysd['epd'])
    else: osp['pupil'] = PupilSpec(osp, key=['object', 'NA'], value=sysd['na'])
    fmax = max(sysd['fields']) or 1.0
    osp['fov'] = FieldSpec(osp, key=['object', 'angle' if inf else 'height'], value=fmax, flds=[0., 1.], is_relative=True)
    wl = sysd['wl']; ref = sysd['prim'] if wl_ref is None else wl_ref
    osp['wvls'] = WvlSpec([(w, 1.0) for w in wl], ref_wl=ref)
    opm.radius_mode = True
    sm.gaps[0].thi = 1e10 if inf else sysd['obj']
    for i, s in enumerate(sysd['s']):
        R = 0.0 if s['R'] is None else s['R']
        if s['m'] == 'air': sm.add_surface([R, s['t']])
        else: sm.add_surface([R, s['t'], s['m'], CAT[s['m']]])
        if s['stop']: sm.set_stop()
        if s['k'] or s['A']:
            c = 0.0 if s['R'] is None else 1.0 / s['R']
            ifc = sm.ifcs[i + 1]                                          # interface 0 is the object, the image is last
            if s['A']: ifc.profile = EvenPolynomial(c=c, cc=s['k'], coefs=[0.0] + list(s['A']))
            else: ifc.profile = Conic(c=c, cc=s['k'])
    opm.update_model()
    return opm

def rindex_list(opm, nm):
    sm = opm['seq_model']
    return [g.medium.rindex(nm) for g in sm.gaps]          # gap i: medium after interface i (gap 0 = object space)

# ------------------------------------------------------------------ own paraxial helpers (independent y-u trace with the oracle's indices)
def yu(sysd, n, y, u):
    rows = []
    for i, s in enumerate(sysd['s']):
        c = 0.0 if s['R'] is None else 1.0 / s['R']
        n1, n2 = n[i], n[i + 1]
        u2 = (n1 * u - y * c * (n2 - n1)) / n2
        rows.append((y, u, u2))
        if i < len(sysd['s']) - 1: y = y + s['t'] * u2
        u = u2
    return rows

def parax_own(sysd, n):
    a = yu(sysd, n, 1.0, 0.0); b = yu(sysd, n, 0.0, 1.0)
    st = [i for i, s in enumerate(sysd['s']) if s['stop']][0]
    zEP = b[st][0] / a[st][0]
    efl = -1.0 / a[-1][2]
    return dict(efl=efl, zEP=zEP, bfl=-a[-1][0] / a[-1][2])

# ------------------------------------------------------------------ real rays through the oracle
class Tracer:
    def __init__(self, sysd):
        self.sysd = sysd; self.inf = 'obj' not in sysd
        self.opm = build(sysd); self.sm = self.opm['seq_model']
        self.fod = self.opm['analysis_results']['parax_data'].fod
        self.zv = np.cumsum([0.0] + [s['t'] for s in sysd['s']])         # vertex z of each surface; zv[-1] = image plane
        # a second model for real rays: ray-optics caches the interface transforms in update_model(), so the object plane of an
        # infinite conjugate is put D mm in front of surface 1 there (any plane crossing the incoming bundle will do)
        self.D = 60.0 if self.inf else sysd['obj']
        self.tm = build(sysd); self.ts = self.tm['seq_model']
        if self.inf: self.ts.gaps[0].thi = self.D; self.tm.update_model()
    def set_image(self, t_last):
        self.ts.gaps[-1].thi = t_last; self.tm.update_model()
        self.zv = np.cumsum([0.0] + [s['t'] for s in self.sysd['s'][:-1]] + [t_last])
    def start(self, p, dvec):
        if self.inf:
            s = (-self.D - p[2]) / dvec[2]
            return np.array([p[0] + s * dvec[0], p[1] + s * dvec[1], 0.0])
        return np.array([p[0], p[1], 0.0])
    def trace(self, p, dvec, nm):
        """global start point p (surface-1 vertex at z = 0) and unit direction -> image point, last-surface point, direction, OPL to the last surface"""
        ray, op, w = rt.trace(self.ts, self.start(p, dvec), np.array(dvec, float), nm)
        n = rindex_list(self.opm, nm)
        k = len(self.sysd['s'])
        # OPL from the start plane to the last refracting surface: sum n_gap * after_dst over gaps 0..k-1
        opl = sum(n[i] * ray[i][2] for i in range(k))
        pl = np.array(ray[k][0]) + np.array([0, 0, self.zv[k - 1]])    # last surface point, global
        dl = np.array(ray[k][1])
        pi = np.array(ray[k + 1][0]) + np.array([0, 0, self.zv[k]])    # image point, global
        return dict(pI=pi, pL=pl, d=dl, opl=opl, nI=n[k])

def ray_start(tr, P, f, px, py, aim):
    R = P['epd'] / 2.0; ex = px * R + aim[0]; ey = py * R + aim[1]; zE = P['zEP']
    if tr.inf:
        th = math.radians(f); dv = np.array([0.0, math.sin(th), math.cos(th)])
        zs = min(0.0, zE) - 10.0; s = (zs - zE) / dv[2]
        return np.array([ex + s * dv[0], ey + s * dv[1], zs]), dv
    o = np.array([0.0, f, -tr.sysd['obj']]); v = np.array([ex, ey, zE]) - o
    return o, v / np.linalg.norm(v)

def first_order(tr, nm):
    n = rindex_list(tr.opm, nm)
    P = parax_own(tr.sysd, n)
    if tr.inf: P['epd'] = tr.sysd['epd']
    else:
        L = tr.sysd['obj']; u = math.tan(math.asin(tr.sysd['na'])); P['epd'] = 2 * u * (L + P['zEP'])
    return P, n

def stop_height(tr, P, n, f, ay, nm):
    """height on the stop surface of the ray aimed at EP offset ay (own: trace through the oracle, read the stop intersection)"""
    p, dv = ray_start(tr, P, f, 0.0, 0.0, (0.0, ay))
    ray, op, w = rt.trace(tr.ts, tr.start(p, dv), dv, nm)
    st = [i for i, s in enumerate(tr.sysd['s']) if s['stop']][0]
    return ray[st + 1][0][1]

def aim(tr, P, n, f, nm):
    if f == 0: return (0.0, 0.0)
    a0, h0 = 0.0, stop_height(tr, P, n, f, 0.0, nm)
    a1 = P['epd'] * 0.01 + 1e-3; h1 = stop_height(tr, P, n, f, a1, nm)
    for _ in range(60):
        if abs(h1) < 1e-13 or h1 == h0: break
        a2 = a1 - h1 * (a1 - a0) / (h1 - h0); a0, h0, a1 = a1, h1, a2; h1 = stop_height(tr, P, n, f, a1, nm)
    return (0.0, a1)

def grid(nr):
    h = 2.0 / (nr - 1); out = []
    for i in range(nr):
        for j in range(nr):
            x, y = -1 + i * h, -1 + j * h
            if x * x + y * y <= 1 + 1e-12: out.append((x, y))
    return out

def spot_data(tr, nr=21, t_last=None):
    sysd = tr.sysd; wl = sysd['wl']; prim = wl[sysd['prim']]
    P, nP = first_order(tr, prim)
    if t_last is not None: tr.set_image(t_last)
    out = []
    for f in sysd['fields']:
        a = aim(tr, P, nP, f, prim)
        p, dv = ray_start(tr, P, f, 0, 0, a); c0 = tr.trace(p, dv, prim)['pI']
        allp = []; per = []
        for nm in wl:
            pts = []
            for g in grid(nr):
                p, dv = ray_start(tr, P, f, g[0], g[1], a)
                r = tr.trace(p, dv, nm); pts.append(r['pI'][:2] - c0[:2])
            pts = np.array(pts); per.append(rms(pts)); allp.append(pts)
        out.append(dict(field=f, rms=rms(np.vstack(allp)), perW=per, chief_y=float(c0[1])))
    return out

def rms(pts):
    c = pts.mean(axis=0); return float(math.sqrt(((pts - c) ** 2).sum(axis=1).mean()))

def best_image(tr, t0):
    """best focus by scalar minimisation (own) of the summed squared deviations, 13-point grid, all fields x wavelengths"""
    sysd = tr.sysd; prim = sysd['wl'][sysd['prim']]; P, nP = first_order(tr, prim)
    tr.set_image(t0)
    bundles = []
    for f in sysd['fields']:
        a = aim(tr, P, nP, f, prim)
        for nm in sysd['wl']:
            rs = []
            for g in grid(13):
                p, dv = ray_start(tr, P, f, g[0], g[1], a); r = tr.trace(p, dv, nm); rs.append((r['pI'][:2], r['d'][:2] / r['d'][2]))
            bundles.append(rs)
    def cost(dz):
        s = 0.0
        for rs in bundles:
            q = np.array([pp + dz * sl for pp, sl in rs]); s += ((q - q.mean(axis=0)) ** 2).sum()
        return s
    res = minimize_scalar(cost, bounds=(-20, 20), method='bounded', options={'xatol': 1e-12})
    return t0 + res.x

def paraxial_image_distance(tr, nm):
    n = rindex_list(tr.opm, nm); sysd = tr.sysd
    if tr.inf: rows = yu(sysd, n, sysd['epd'] / 2, 0.0)
    else:
        P, _ = first_order(tr, nm); L = sysd['obj']; u = math.tan(math.asin(sysd['na'])); rows = yu(sysd, n, u * L, u)
    y, u, u2 = rows[-1]; return -y / u2

def prepared_image(tr):
    sysd = tr.sysd; prim = sysd['wl'][sysd['prim']]
    if sysd['image'] == 'fixed': return sysd['s'][-1]['t']
    t0 = paraxial_image_distance(tr, prim)
    return best_image(tr, t0) if sysd['image'] == 'best' else t0

# ------------------------------------------------------------------ wavefront, Strehl, MTF (own)
def wavefront(tr, fi, N=64):
    sysd = tr.sysd; prim = sysd['wl'][sysd['prim']]; P, n = first_order(tr, prim)
    f = sysd['fields'][fi]; a = aim(tr, P, n, f, prim)
    p, dv = ray_start(tr, P, f, 0, 0, a); ch = tr.trace(p, dv, prim)
    Ip = ch['pI']; zImg = tr.zv[-1]
    # paraxial exit pupil from the last vertex: a ray through the stop centre
    rows = yu(sysd, n, -0.01 * P['zEP'], 0.01); zXP = -rows[-1][0] / rows[-1][2]
    zX = tr.zv[-2] + zXP
    tC = (zX - ch['pL'][2]) / ch['d'][2]; E = ch['pL'] + tC * ch['d']; Rref = np.linalg.norm(Ip - E)
    def opl_sphere(r):
        o = r['pL'] - Ip; dd = r['d']; b = o @ dd; c = o @ o - Rref * Rref; D = b * b - c
        if D < 0: return np.nan
        t1, t2 = -b - math.sqrt(D), -b + math.sqrt(D); t = t1 if abs(t1) < abs(t2) else t2
        return r['opl'] + r['nI'] * t
    W0 = opl_sphere(ch); lam = prim * 1e-6
    W = np.full((N, N), np.nan)
    for j in range(N):
        for i in range(N):
            x = -1 + (i + 0.5) * 2 / N; y = -1 + (j + 0.5) * 2 / N
            if x * x + y * y > 1: continue
            p, dv = ray_start(tr, P, f, x, y, a); r = tr.trace(p, dv, prim)
            W[j, i] = (W0 - opl_sphere(r)) / lam
    m = ~np.isnan(W); X, Y = np.meshgrid(-1 + (np.arange(N) + 0.5) * 2 / N, -1 + (np.arange(N) + 0.5) * 2 / N)
    A = np.stack([np.ones(m.sum()), X[m], Y[m]], axis=1); co, *_ = np.linalg.lstsq(A, W[m], rcond=None)
    Wc = W.copy(); Wc[m] = W[m] - A @ co
    rmsw = float(np.sqrt((Wc[m] ** 2).mean()))
    ph = np.where(m, np.exp(2j * np.pi * np.nan_to_num(Wc)), 0)
    strehl = float(abs(ph.sum()) ** 2 / m.sum() ** 2)
    # MTF: autocorrelation of the pupil function by FFT with 2x zero padding
    M = 2 * N; Pp = np.zeros((M, M), complex); Pp[:N, :N] = ph
    otf = np.fft.ifft2(np.abs(np.fft.fft2(Pp)) ** 2); otf = np.abs(otf) / abs(otf[0, 0])
    # image-space NA from the paraxial marginal ray
    rows_m = yu(sysd, n, P['epd'] / 2, 0.0) if tr.inf else yu(sysd, n, math.tan(math.asin(sysd['na'])) * sysd['obj'], math.tan(math.asin(sysd['na'])))
    naI = abs(n[-1] * math.sin(math.atan(rows_m[-1][2])))
    dnu = (2.0 / N) * naI / lam
    tan = [(s * dnu, float(otf[s % M, 0])) for s in range(N + 1)]
    return dict(rms=rmsw, strehl=strehl, tan=tan, cutoff=2 * naI / lam, naI=naI)

def mtf_at(curve, nu):
    for i in range(1, len(curve)):
        if curve[i][0] >= nu:
            a, b = curve[i - 1], curve[i]; t = (nu - a[0]) / (b[0] - a[0]); return a[1] + t * (b[1] - a[1])
    return 0.0

# ------------------------------------------------------------------ cases
def first_order_case(name):
    sysd = SYS[name]; tr = Tracer(sysd); fod = tr.fod
    tl = prepared_image(tr)
    to = compute_third_order(tr.opm)
    k = len(sysd['s'])
    seid = {key: float(to.loc['sum'][col]) for key, col in zip(['SI', 'SII', 'SIII', 'SIV', 'SV'], ['S-I', 'S-II', 'S-III', 'S-IV', 'S-V'])}
    per = [[float(to.iloc[i][col]) for col in ['S-I', 'S-II', 'S-III', 'S-IV', 'S-V']] for i in range(k)] if len(to.index) == k + 1 else None   # rows '1'..'k' then 'sum' (aspheric surfaces get extra rows: totals only)
    prim = sysd['wl'][sysd['prim']]
    n = rindex_list(tr.opm, prim)
    # exit pupil: own paraxial ray through the stop centre (apparent position of the stop seen from image space); ray-optics' exp_dist is kept for information
    P0, _ = first_order(tr, prim); rows = yu(sysd, rindex_list(tr.opm, prim), -0.01 * P0['zEP'], 0.01); zXP = -rows[-1][0] / rows[-1][2]
    e = dict(efl=float(fod.efl), bfl=float(fod.bfl), ffl=float(-fod.ffl), zEP=float(fod.enp_dist), epd=float(2 * fod.enp_radius), zXP=float(zXP), zXP_rayoptics=float(fod.exp_dist),
             imgDist=float(fod.img_dist) if not math.isinf(fod.img_dist) else None, seidel=seid, seidelPer=per, n=[float(v) for v in n[1:]], imageUsed=float(tl))
    if 'obj' in sysd: e['mag'] = float(fod.m)
    return dict(id='parax-' + name, kind='parax', sys=name, expect=e)

def ray_cases():
    out = []
    for name, rays in [('cooke', [((0, 0, -10), 0.0), ((1.5, -3.0, -10), 20.0), ((-2.0, 4.0, -10), -14.0)]),
                       ('asphere', [((0, 5.0, -5), 0.0), ((3.0, -2.0, -5), 3.0)]),
                       ('achromat', [((0, 11.0, -5), 0.0), ((4, 4, -5), 3.0)])]:
        sysd = SYS[name]; tr = Tracer(sysd); tl = prepared_image(tr); tr.set_image(tl)
        for (p, ang) in rays:
            for nm in sysd['wl']:
                th = math.radians(ang); dv = np.array([0.0, math.sin(th), math.cos(th)])
                r = tr.trace(np.array(p, float), dv, nm)
                out.append(dict(id='ray-%s-%g-%g-%g-%g' % (name, p[0], p[1], ang, round(nm)), kind='ray', sys=name,
                                input=dict(p=list(map(float, p)), d=dv.tolist(), nm=nm, imageT=float(tl)),
                                expect=dict(x=float(r['pI'][0]), y=float(r['pI'][1]), dx=float(r['d'][0]), dy=float(r['d'][1]), dz=float(r['d'][2]))))
    return out

def spot_case(name):
    sysd = SYS[name]; tr = Tracer(sysd); tl = prepared_image(tr)
    sp = spot_data(tr, 21, tl)
    return dict(id='spot-' + name, kind='spot', sys=name, expect=dict(imageT=float(tl), rms=[s['rms'] for s in sp], perW=[s['perW'] for s in sp], chief_y=[s['chief_y'] for s in sp]))

def wave_case(name):
    sysd = SYS[name]; tr = Tracer(sysd); tl = prepared_image(tr); tr.set_image(tl)
    out = []
    for fi in range(len(sysd['fields'])):
        w = wavefront(tr, fi)
        out.append(dict(rms=w['rms'], strehl=w['strehl'], mtf=[mtf_at(w['tan'], q * w['cutoff']) for q in (0.1, 0.25, 0.5)], cutoff=w['cutoff']))
    return dict(id='wave-' + name, kind='wave', sys=name, expect=dict(imageT=float(tl), fields=out))

def chroma_case(name):
    tr = Tracer(SYS[name])
    return dict(id='chroma-' + name, kind='chroma', sys=name, expect=dict(FC=paraxial_image_distance(tr, C) - paraxial_image_distance(tr, F)))

def field_case(name):
    """distortion (real vs paraxial chief-ray height on the image plane in use) and T/S focus from pairs of close rays (pupil +-0.02)"""
    sysd = SYS[name]; tr = Tracer(sysd); tl = prepared_image(tr); tr.set_image(tl)
    prim = sysd['wl'][sysd['prim']]; P, n = first_order(tr, prim); fmax = max(sysd['fields'])
    # paraxial chief ray of the full field (own y-u), height on the image plane
    if tr.inf: u0 = math.tan(math.radians(fmax)); rows = yu(dict(sysd, s=sysd['s'][:-1] + [dict(sysd['s'][-1], t=tl)]), n, -u0 * P['zEP'], u0)
    else: u0 = -fmax / (sysd['obj'] + P['zEP']); rows = yu(sysd, n, fmax + u0 * sysd['obj'], u0)
    yk, uk, uk2 = rows[-1]; hP = yk + tl * uk2
    out = []
    for frac in (0.7, 1.0):
        f = fmax * frac; a = aim(tr, P, n, f, prim)
        p, dv = ray_start(tr, P, f, 0, 0, a); y = tr.trace(p, dv, prim)['pI'][1]
        yPar = hP * (math.tan(math.radians(f)) / math.tan(math.radians(fmax)) if tr.inf else frac)
        def cross(px, py, ax):
            p1, d1 = ray_start(tr, P, f, px, py, a); p2, d2 = ray_start(tr, P, f, -px, -py, a)
            r1, r2 = tr.trace(p1, d1, prim), tr.trace(p2, d2, prim)
            s1, s2 = r1['d'][ax] / r1['d'][2], r2['d'][ax] / r2['d'][2]
            return -(r1['pI'][ax] - r2['pI'][ax]) / (s1 - s2)
        out.append(dict(f=f, dist=100 * (y - yPar) / yPar, zT=cross(0, 0.02, 1), zS=cross(0.02, 0, 0)))
    return dict(id='field-' + name, kind='field', sys=name, expect=dict(rows=out))

def petzval(name):
    tr = Tracer(SYS[name]); sysd = tr.sysd; n = rindex_list(tr.opm, sysd['wl'][sysd['prim']]); p = 0.0
    for i, s in enumerate(sysd['s']):
        c = 0.0 if s['R'] is None else 1.0 / s['R']; p += c * (n[i + 1] - n[i]) / (n[i] * n[i + 1])
    return -1.0 / (p * n[-1]), float(tr.fod.efl)

def optimiser_case():
    """least_squares (own, LM) on the ray errors of the start doublet, EFL target 100 mm, best focus each evaluation"""
    base = SYS['achromat']
    def make(c):
        s = [dict(x) for x in base['s']]
        s[0]['R'], s[1]['R'], s[2]['R'] = 1 / c[0], 1 / c[1], 1 / c[2]
        return dict(base, s=s)
    grid7 = grid(7)
    def resid(c):
        sysd = make(c); tr = Tracer(sysd); prim = sysd['wl'][sysd['prim']]
        tl = best_image(tr, paraxial_image_distance(tr, prim)); tr.set_image(tl)
        P, nP = first_order(tr, prim); r = []
        for f in sysd['fields']:
            a = aim(tr, P, nP, f, prim)
            for nm in sysd['wl']:
                pts = []
                for g in grid7:
                    p, dv = ray_start(tr, P, f, g[0], g[1], a); pts.append(tr.trace(p, dv, nm)['pI'][:2])
                pts = np.array(pts); r.extend((pts - pts.mean(axis=0)).ravel())
        r.append(0.05 * (P['efl'] - 100.0) * math.sqrt(len(r)))
        return np.array(r)
    x0 = np.array([1 / 80.0, -1 / 80.0, -1 / 300.0])
    sol = least_squares(resid, x0, method='lm', xtol=1e-12, ftol=1e-12, max_nfev=400)
    R = [1 / v for v in sol.x]
    return dict(id='aha-optimise', kind='aha', preset='optimise', expect=dict(R=R, catalogue=[62.8, -45.7, -128.2]))

def aha_cases():
    out = []
    def sp(name):
        tr = Tracer(SYS[name]); tl = prepared_image(tr); return spot_data(tr, 21, tl)
    pf, pc, bf, sd_ = sp('pcxFlat')[0]['rms'], sp('pcxCurved')[0]['rms'], sp('bestForm')[0]['rms'], sp('stopDown')[0]['rms']
    out.append(dict(id='aha-pcx-flat', kind='aha', preset='pcx-flat', expect=dict(rms_um=pf * 1e3, other_um=pc * 1e3, ratio=pf / pc)))
    out.append(dict(id='aha-pcx-curved', kind='aha', preset='pcx-curved', expect=dict(rms_um=pc * 1e3, ratio=pf / pc)))
    out.append(dict(id='aha-best-form', kind='aha', preset='best-form', expect=dict(rms_um=bf * 1e3, pcx_um=pc * 1e3, gain=1 - bf / pc)))
    trs = Tracer(SYS['stopDown']); tl = prepared_image(trs); trs.set_image(tl); w = wavefront(trs, 0)
    out.append(dict(id='aha-stop-down', kind='aha', preset='stop-down', expect=dict(rms_um=sd_ * 1e3, ratio=pc / sd_, strehl=w['strehl'])))
    s1 = sp('singletPoly'); a1 = sp('achromat')
    out.append(dict(id='aha-singlet-white', kind='aha', preset='singlet-white', expect=dict(FC=chroma_case('singletPoly')['expect']['FC'], rms_um=s1[0]['rms'] * 1e3)))
    out.append(dict(id='aha-achromat', kind='aha', preset='achromat', expect=dict(FC=chroma_case('achromat')['expect']['FC'], rms_um=a1[0]['rms'] * 1e3, singlet_um=s1[0]['rms'] * 1e3)))
    pzc, fc = petzval('cooke'); pzs, fs = petzval('pcxCurved'); ck = sp('cooke')
    out.append(dict(id='aha-cooke', kind='aha', preset='cooke', expect=dict(petz_over_f=abs(pzc / fc), singlet_petz_over_f=abs(pzs / fs), max_rms_um=max(s['rms'] for s in ck) * 1e3)))
    la, l0 = sp('landscape'), sp('landscapeAtLens')
    trl = Tracer(SYS['landscape']); to = compute_third_order(trl.opm)
    out.append(dict(id='aha-landscape', kind='aha', preset='landscape', expect=dict(edge_um=la[-1]['rms'] * 1e3, atlens_um=l0[-1]['rms'] * 1e3, SII=float(to.loc['sum']['S-II']), SII_atlens=float(compute_third_order(Tracer(SYS['landscapeAtLens']).opm).loc['sum']['S-II']))))
    out.append(optimiser_case())
    return out


# ------------------------------------------------------------------ quantities by a DIFFERENT method than the page (review R-5, 2026-11-13)
# The cases above re-implement the page's conventions (aiming secant, start plane, 64-sample OPD grid). The cases below reach the
# same physical quantities by other published routes, so a shared convention error would show up:
#  * on-axis wavefront from the transverse ray aberration: W(M) = ∫ ε dM (Hopkins; Welford ch. 9), M = n′·(direction cosine),
#    reference point on the image plane in use, 4001 meridional rays; RMS and Strehl as continuous pupil integrals (uniform in
#    entrance-pupil coordinates, 2ρ dρ), MTF by DIRECT autocorrelation of the pupil function (no FFT), shear s = ν λ / NA′;
#  * chief-ray aiming by a bracketed root (scipy brentq) of the real ray height on the stop surface;
#  * analytic cases: a stigmatic plano-hyperbolic lens (Strehl 1, MTF = circular-pupil formula, Airy radius 0.61 λ/NA′ = 1.22 λ N),
#    third-order W040 = S_I/(8λ) against the ρ⁴ term fitted to the independent wavefront.
from scipy.optimize import brentq

def onaxis_wave(tr, t_img, nrays=4001):
    sysd = tr.sysd; prim = sysd['wl'][sysd['prim']]; tr.set_image(t_img)
    R = sysd['epd'] / 2.0; h = np.linspace(0.0, R, nrays); eps = np.empty(nrays); M = np.empty(nrays)
    for i, hh in enumerate(h):
        r = tr.trace(np.array([0.0, hh, -5.0]), np.array([0.0, 0.0, 1.0]), prim)
        eps[i] = r['pI'][1]; M[i] = r['nI'] * r['d'][1]
    W = np.concatenate([[0.0], np.cumsum(0.5 * (eps[1:] + eps[:-1]) * np.diff(M))]) / (prim * 1e-6)   # waves
    rho = h / R
    return rho, W

def pupil_stats(rho, W):
    w = 2 * rho; wsum = np.trapezoid(w, rho)
    mean = np.trapezoid(W * w, rho) / wsum
    rms_ = math.sqrt(np.trapezoid((W - mean) ** 2 * w, rho) / wsum)
    E = np.trapezoid(np.exp(2j * np.pi * W) * w, rho) / wsum
    return rms_, float(abs(E) ** 2)

def mtf_direct(rho, W, shears, Ng=700):
    x = (np.arange(Ng) + 0.5) * 2.0 / Ng - 1.0; X, Y = np.meshgrid(x, x)
    def P(xx):
        r = np.sqrt(xx ** 2 + Y ** 2); ins = r <= 1.0
        return np.where(ins, np.exp(2j * np.pi * np.interp(np.minimum(r, 1.0), rho, W)), 0.0)
    norm = (np.abs(P(X)) ** 2).sum(); out = []
    for s in shears:
        out.append(float(abs((P(X + s / 2) * np.conj(P(X - s / 2))).sum()) / norm))
    return out

def na_paraxial(tr):
    sysd = tr.sysd; n = rindex_list(tr.opm, sysd['wl'][sysd['prim']])
    y, u, u2 = yu(sysd, n, sysd['epd'] / 2.0, 0.0)[-1]
    return n[-1] * math.sin(math.atan(abs(u2)))

def wave_indep_case(name):
    sysd = SYS[name]; tr = Tracer(sysd); tl = prepared_image(tr); prim = sysd['wl'][sysd['prim']]
    rho, W = onaxis_wave(tr, tl)
    r_, st = pupil_stats(rho, W); NA = na_paraxial(tr); cut = 2 * NA / (prim * 1e-6)
    qs = [0.1, 0.25]; m = mtf_direct(rho, W, [q * 2.0 for q in qs])        # shear s = ν λ/NA′ = 2 q for ν = q · cut-off
    A = np.vstack([np.ones_like(rho), rho ** 2, rho ** 4, rho ** 6]).T; co = np.linalg.lstsq(A, W, rcond=None)[0]
    return dict(id='wave-indep-' + name, kind='wave-indep', sys=name, expect=dict(imageT=float(tl), rms=r_, strehl=st, cutoff=cut, mtf=m, mtf_at=qs, W040_fit=float(co[2])))

def airy_case():
    sysd = dict(s=[S(None, 4.0, 'N-BK7', None, True), S(-25.0, 50.0)], epd=12.0, fields=[0], wl=[d], prim=0, image='fixed')
    tr = Tracer(sysd); nn = rindex_list(tr.opm, d)[1]; f = 25.0 / (nn - 1.0)
    sysd['s'][1]['t'] = f; sysd['s'][1]['k'] = -nn * nn; sysd['epd'] = f / 4.0
    tr = Tracer(sysd); rho, W = onaxis_wave(tr, f)
    r_, st = pupil_stats(rho, W); NA = na_paraxial(tr)
    qs = [0.1, 0.25, 0.5, 0.75]
    mtf_formula = [(2 / math.pi) * (math.acos(q) - q * math.sqrt(1 - q * q)) for q in qs]
    SYS['stigmatic'] = sysd
    return dict(id='airy-stigmatic', kind='airy', sys='stigmatic', expect=dict(airy_um=0.61 * d * 1e-3 / NA, airy_1p22_lambda_N=1.22 * d * 1e-3 / (2 * NA), rms=r_, strehl=st, mtf_at=qs, mtf=mtf_formula, NA=NA))

def aim_indep_case(name):
    sysd = SYS[name]; tr = Tracer(sysd); prim = sysd['wl'][sysd['prim']]; tl = prepared_image(tr); tr.set_image(tl)
    st = [i for i, s in enumerate(sysd['s']) if s['stop']][0]; k = len(sysd['s']); rows = []
    for f in sysd['fields']:
        if f == 0: continue
        th = math.radians(f); dv = np.array([0.0, math.sin(th), math.cos(th)])
        def hs(y0):
            ray, op, w = rt.trace(tr.ts, np.array([0.0, y0, 0.0]), dv, prim); return ray[st + 1][0][1]
        def hsafe(y0):
            try: return hs(y0)
            except Exception: return float('nan')
        ys = np.linspace(-30, 30, 241); hv = [hsafe(y) for y in ys]
        j = next(i for i in range(240) if np.isfinite(hv[i]) and np.isfinite(hv[i + 1]) and hv[i] * hv[i + 1] <= 0)
        y0 = brentq(hs, ys[j], ys[j + 1], xtol=1e-14)
        ray, op, w = rt.trace(tr.ts, np.array([0.0, y0, 0.0]), dv, prim)
        rows.append(dict(f=f, chief_y=float(ray[k + 1][0][1])))
    return dict(id='aim-indep-' + name, kind='aim-indep', sys=name, expect=dict(imageT=float(tl), rows=rows))

def tol_case(name):
    sysd = SYS[name]; tr = Tracer(sysd); prim = sysd['wl'][sysd['prim']]
    t0 = paraxial_image_distance(tr, prim); tb = best_image(tr, t0)       # the nominal is refocused like every trial
    sp = spot_data(tr, 9, tb)
    return dict(id='tol-' + name, kind='tol', sys=name, expect=dict(nominal=[x['rms'] for x in sp]))

def main():
    cases = []
    for nm in ['pcxCurved', 'pcxFlat', 'bestForm', 'achromat', 'cooke', 'landscape', 'asphere', 'finite']:
        cases.append(first_order_case(nm))
    cases += ray_cases()
    for nm in ['pcxCurved', 'achromat', 'cooke', 'landscape', 'asphere', 'finite']:
        cases.append(spot_case(nm))
    for nm in ['stopDown', 'achromat', 'cooke']:
        cases.append(wave_case(nm))
    for nm in ['singletPoly', 'achromat', 'cooke']:
        cases.append(chroma_case(nm))
    for nm in ['cooke', 'landscape', 'finite']:
        cases.append(field_case(nm))
    cases += aha_cases()
    cases.append(airy_case())
    for nm in ['stopDown', 'pcxCurved', 'bestForm']:
        cases.append(wave_indep_case(nm))
    cases.append(aim_indep_case('cooke'))
    for nm in ['singletPoly', 'cooke']:
        cases.append(tol_case(nm))
    systems = {k: dict(v) for k, v in SYS.items()}
    out = dict(generator='bench-src/ref/gen_lensdesign.py', oracle='ray-optics 0.9.10 (first-order data, third-order sums, exact ray refraction; SCHOTT catalogue indices)',
               systems=systems, cases=cases)
    p = pathlib.Path(__file__).with_name('lensdesign_ref.json')
    p.write_text(json.dumps(out, indent=1), encoding='utf-8')
    print(len(cases), 'cases ->', p)

if __name__ == '__main__':
    main()
