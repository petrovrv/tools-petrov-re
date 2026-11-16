"""Independent reference for mvlens.html (Machine-Vision Lens Selector).

Written from the published first-order imaging method, not from the page code:
  * W. J. Smith, Modern Optical Engineering, 4th ed. (2008), ch. 2-6: Gaussian lens equation, paraxial
    ray trace through a thin lens (u' = u - y/f), image-side cone and working f-number, blur circle and
    depth of field;
  * J. W. Goodman, Introduction to Fourier Optics, 4th ed. (2017), sec. 7.4: the incoherent OTF of an
    aberration-free system is the normalised autocorrelation (overlap area) of the pupil; Airy pattern
    first zero at the first root of J1;
  * pixel aperture MTF = |Fourier transform of a uniform pixel| (sampling theory), Nyquist 1/(2p);
  * perspective (pinhole / chief-ray) projection for motion blur and for the size error of an
    entocentric lens; telecentric residual from the chief-ray angle.
Every quantity is obtained by an explicit ray trace or a numerical integral / root search here:
DOF by bisection on the traced blur, MTF by Simpson integration of the pupil overlap, J1 by its integral
representation, motion and perspective by projecting points through the pupil centre.
Sensor geometry is read from _opt/mv/sensors.json (Sony public list, read 2026-11-13).
Writes bench-src/ref/mvlens_ref.json.  Run: python -I bench-src/ref/gen_mvlens.py
"""
import json, math, pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SENS = {s['id']: s for s in json.loads((ROOT / '_opt' / 'mv' / 'sensors.json').read_text(encoding='utf-8'))}
SERIES = [4, 5, 6, 8, 9, 12, 16, 25, 35, 50, 75, 100]
STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32]


def simpson(f, a, b, n=2000):
    if b <= a:
        return 0.0
    n += n % 2
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * f(a + i * h)
    return s * h / 3


def J1(x):  # Bessel J1 from its integral representation J1(x) = 1/pi * int_0^pi cos(t - x sin t) dt
    return simpson(lambda t: math.cos(t - x * math.sin(t)), 0, math.pi, 400) / math.pi


def bisect(f, a, b, it=200):
    fa = f(a)
    for _ in range(it):
        m = 0.5 * (a + b)
        fm = f(m)
        if (fm > 0) == (fa > 0):
            a, fa = m, fm
        else:
            b = m
    return 0.5 * (a + b)


J11 = bisect(J1, 3.0, 4.5)  # first zero of J1


class Lens:
    """thin lens at z = 0, object at z = -s, sensor focused for the object distance s0"""
    def __init__(self, f, N, s0):
        self.f, self.N, self.s0 = f, N, s0
        self.D = f / N
        self.sensor = self.image_of(s0)

    def image_of(self, s):  # paraxial trace of a ray from the axial object point: y = 1 at the lens
        u = 1.0 / s          # slope before the lens (rising towards the lens)
        u2 = u - 1.0 / self.f  # thin-lens refraction u' = u - y/f
        return -1.0 / u2     # where the ray crosses the axis again

    def blur(self, s):  # traced marginal rays from an axial point at distance s, height at the sensor plane
        y = self.D / 2
        u2 = y / s - y / self.f
        return 2 * abs(y + u2 * self.sensor)

    def chief(self, h, s):  # height on the sensor of an object point (h, -s) through the pupil centre
        return -h * self.sensor / s


def sensor(sid, st):
    if sid == 'custom':
        return st['cW_px'] * st['cPitch_um'] / 1000, st['cH_px'] * st['cPitch_um'] / 1000, st['cPitch_um'] / 1000
    s = SENS[sid]
    return s['px'][0] * s['pitch_um'] / 1000, s['px'][1] * s['pitch_um'] / 1000, s['pitch_um'] / 1000


def mtf_diffraction(nu, lam, Nw):  # normalised overlap of two unit pupils shifted by x = nu*lam*Nw (in diameters)
    x = nu * lam * Nw
    if x >= 1:
        return 0.0
    d = 2 * x  # centre distance in radii
    h = math.sqrt(max(0.0, 1 - (d / 2) ** 2))
    area = simpson(lambda y: max(0.0, 2 * math.sqrt(max(0.0, 1 - y * y)) - d), -h, h, 4000)
    return area / math.pi


def mtf_pixel(nu, p):
    re = simpson(lambda x: math.cos(2 * math.pi * nu * x), -p / 2, p / 2, 400) / p
    return abs(re)


def setup(st, f, N):
    W, H, p = sensor(st['sensorId'], st)
    s = st['wd_mm']
    lam = st['lambda_nm'] * 1e-6
    ln = Lens(f, N, s)
    m = -ln.chief(1.0, s)                       # magnification from the chief ray
    out = {'f': f, 'N': N, 'm': m, 'fovW': W / m, 'fovH': H / m, 'sImg': ln.sensor, 'ext': ln.sensor - f}
    Nw = ln.sensor / ln.D                       # image-side cone: distance / pupil diameter
    out['Nw'] = Nw
    out['umPerPx'] = 1000 * p / m
    out['featPx'] = st['feature_mm'] * m / p if st['feature_mm'] > 0 else None
    out['airy_um'] = 1000 * 2 * J11 / math.pi * lam * Nw
    nyq = 1 / (2 * p)
    out['nyq'] = nyq
    out['cut'] = 1 / (lam * Nw)
    out['mtfDiff'] = mtf_diffraction(nyq, lam, Nw)
    out['mtfPix'] = mtf_pixel(nyq, p)
    c = st['cocPx'] * p
    out['dof_near'] = bisect(lambda z: ln.blur(z) - c, f * 1.0001 + 1e-9, s)
    far_lim = s * 1e6
    out['dof_far'] = bisect(lambda z: c - ln.blur(z), s, far_lim) if ln.blur(far_lim) > c else None
    d = st['depth_mm'] / 2
    geo = 1000 * max(ln.blur(s - d), ln.blur(s + d)) if d > 0 else 0.0
    out['geo_um'] = geo
    out['blur_um'] = math.hypot(geo, out['airy_um'])
    v, t = st['speed_mm_s'], st['exposure_us'] * 1e-6
    if v > 0:
        out['motionPx'] = abs(ln.chief(v * t, s) - ln.chief(0, s)) / p
        out['tMax_us'] = 1e6 * bisect(lambda tt: abs(ln.chief(v * tt, s)) / p - st['blurPx'], 0, 10.0)
    if d > 0 and st['measLen_mm'] > 0:
        L = st['measLen_mm']
        seen = abs(ln.chief(L / 2, s - d) - ln.chief(-L / 2, s - d)) / m  # nearer object, read with nominal m
        out['persp_err_mm'] = seen - L
        out['tele_err_mm'] = 2 * d * math.tan(math.radians(st['teleDeg']))
    return out


def solve(st):
    W, H, p = sensor(st['sensorId'], st)
    s = st['wd_mm']
    covers = []
    for f in SERIES:
        if f >= s:
            continue
        o = setup(st, f, st['N'])
        if o['fovW'] >= st['fovW_mm'] * (1 - 1e-9) and o['fovH'] >= st['fovH_mm'] * (1 - 1e-9):
            covers.append(f)
    rec = max(covers) if covers else None
    mreq = min(W / st['fovW_mm'], H / st['fovH_mm'])
    sp = mreq * s                               # image distance for the required magnification
    f_ideal = s * sp / (s + sp)                 # Gaussian lens equation
    f = rec if st.get('focalSel', 'auto') == 'auto' and rec else (f_ideal if st.get('focalSel', 'auto') == 'auto' else float(st['focalSel']))
    r = {'fIdeal': f_ideal, 'recommended': rec, 'f': f, 'main': setup(st, f, st['N'])}
    if st['depth_mm'] > 0:                      # sharpest f-number by a dense scan of the RSS blur
        best = None
        n = 6000
        for i in range(n + 1):
            N = 0.7 * (64 / 0.7) ** (i / n)
            o = setup_blur(st, f, N)
            if best is None or o < best[1]:
                best = (N, o)
        lo, hi = best[0] / 1.002, best[0] * 1.002   # refine with a ternary search
        for _ in range(80):
            a, b = lo + (hi - lo) / 3, hi - (hi - lo) / 3
            if setup_blur(st, f, a) < setup_blur(st, f, b):
                hi = b
            else:
                lo = a
        Nopt = 0.5 * (lo + hi)
        stop = min(STOPS, key=lambda N: setup_blur(st, f, N))
        r['opt'] = {'N': Nopt, 'blur_um': setup_blur(st, f, Nopt), 'stop': stop, 'stopBlur_um': setup_blur(st, f, stop)}
    return r


def setup_blur(st, f, N):
    lam = st['lambda_nm'] * 1e-6
    s = st['wd_mm']
    ln = Lens(f, N, s)
    d = st['depth_mm'] / 2
    geo = 1000 * max(ln.blur(s - d), ln.blur(s + d))
    airy = 1000 * 2 * J11 / math.pi * lam * ln.sensor / ln.D
    return math.hypot(geo, airy)


DEF = dict(view='scheme', sensorId='IMX264', cW_px=2448, cH_px=2048, cPitch_um=3.45, cShutter='global', fovW_mm=80, fovH_mm=60, wd_mm=300,
           focalSel='auto', focal_mm=25, N=4, lambda_nm=550, feature_mm=0.2, pxPerFeature=3, cocPx=1, speed_mm_s=0, exposure_us=1000, blurPx=1,
           depth_mm=0, measLen_mm=0, tol_mm=0, teleDeg=0.1, circle_mm=0, cmpOn=False, cmpId='IMX226')


def S(**kw):
    d = dict(DEF)
    d.update(kw)
    return d


cases = []
grid = [
    ('IMX264', 80, 60, 300, 4, 550, 0, 0, 0), ('IMX264', 60, 50, 210, 8, 550, 6, 0, 0), ('IMX273', 200, 150, 400, 4, 625, 0, 1000, 0),
    ('IMX304', 800, 600, 1500, 8, 550, 300, 0, 0), ('IMX250', 40, 30, 200, 8, 550, 2, 0, 20), ('IMX226', 60, 45, 250, 2.8, 550, 0, 0, 0),
    ('IMX226', 60, 45, 250, 11, 450, 0, 0, 0), ('IMX174', 300, 200, 800, 5.6, 850, 50, 500, 0), ('IMX530', 150, 130, 600, 11, 550, 20, 0, 50),
    ('IMX990', 100, 80, 500, 2, 1300, 10, 200, 0), ('IMX287', 30, 22, 120, 4, 525, 1, 0, 10), ('IMX541', 500, 500, 2000, 8, 550, 400, 3000, 0),
    ('IMX392', 25, 15, 100, 2.8, 625, 0.5, 50, 0), ('IMX183', 120, 80, 400, 5.6, 550, 10, 0, 0), ('IMX342', 1000, 750, 3000, 8, 550, 500, 0, 300),
    ('IMX264', 10, 8.5, 60, 4, 550, 0.2, 0, 0), ('IMX547', 45, 38, 160, 16, 550, 4, 20, 30), ('IMX420', 400, 280, 1200, 4, 940, 100, 1500, 0),
]
for i, (sid, W, H, wd, N, lam, depth, v, meas) in enumerate(grid):
    st = S(sensorId=sid, fovW_mm=W, fovH_mm=H, wd_mm=wd, N=N, lambda_nm=lam, depth_mm=depth, speed_mm_s=v, exposure_us=200, measLen_mm=meas, tol_mm=0.01 if meas else 0, feature_mm=W / 400, cocPx=1.5)
    r = solve(st)
    cases.append({'id': 'setup-%02d-%s' % (i + 1, sid), 'kind': 'setup', 'state': st, 'expect': r})
# fixed focal lengths and a custom sensor
for i, (fsel, wd) in enumerate([('16', 300), ('35', 500), ('50', 220), ('8', 150)]):
    st = S(focalSel=fsel, wd_mm=wd, depth_mm=5, speed_mm_s=300, exposure_us=500, feature_mm=0.15)
    cases.append({'id': 'fixed-%s-mm' % fsel, 'kind': 'setup', 'state': st, 'expect': solve(st)})
st = S(sensorId='custom', cW_px=4000, cH_px=3000, cPitch_um=1.55, fovW_mm=120, fovH_mm=90, wd_mm=350, N=5.6, depth_mm=8)
cases.append({'id': 'custom-sensor', 'kind': 'setup', 'state': st, 'expect': solve(st)})
# MTF curve points (lens and pixel) at a set of frequencies, against the numerical pupil overlap
for Nw, lam, p in [(4.4, 550e-6, 0.00345), (9.0, 550e-6, 0.00185), (17.3, 625e-6, 0.00586), (2.3, 1300e-6, 0.005)]:
    cut = 1 / (lam * Nw)
    nus = [cut * k / 10 for k in range(11)] + [1 / (2 * p)]
    cases.append({'id': 'mtf-Nw%.1f-l%.0f' % (Nw, lam * 1e6), 'kind': 'mtf', 'state': {'Nw': Nw, 'lam': lam, 'p': p, 'nus': nus},
                  'expect': {'diff': [mtf_diffraction(nu, lam, Nw) for nu in nus], 'pix': [mtf_pixel(nu, p) for nu in nus]}})

# preset claims (aha) — expectations computed here, the driver also checks the printed numbers
P = {
 'conveyor': S(sensorId='IMX273', fovW_mm=200, fovH_mm=150, wd_mm=400, N=4, lambda_nm=625, feature_mm=0.6, pxPerFeature=3, speed_mm_s=1000, exposure_us=1000, blurPx=1),
 'pcb': S(view='blur', sensorId='IMX264', fovW_mm=60, fovH_mm=50, wd_mm=210, N=16, lambda_nm=550, feature_mm=0.1, pxPerFeature=3, depth_mm=6),
 'bin': S(sensorId='IMX304', fovW_mm=800, fovH_mm=600, wd_mm=1500, N=8, lambda_nm=550, feature_mm=3, pxPerFeature=3, depth_mm=300, cocPx=2),
 'shaft': S(sensorId='IMX250', fovW_mm=40, fovH_mm=30, wd_mm=200, N=8, lambda_nm=550, feature_mm=0.05, pxPerFeature=3, depth_mm=2, measLen_mm=20, tol_mm=0.01, teleDeg=0.1, cocPx=2),
 'barcode': S(sensorId='IMX304', fovW_mm=600, fovH_mm=450, wd_mm=1500, N=8, lambda_nm=625, feature_mm=0.33, pxPerFeature=2, speed_mm_s=2000, exposure_us=100, blurPx=1, depth_mm=300, cocPx=2),
 'mp': S(view='mtf', sensorId='IMX226', fovW_mm=60, fovH_mm=45, wd_mm=250, N=8, lambda_nm=550, feature_mm=0.1, pxPerFeature=3, cmpOn=True, cmpId='IMX264'),
 'macro': S(sensorId='IMX264', fovW_mm=10, fovH_mm=8.5, wd_mm=60, N=4, lambda_nm=550, feature_mm=0.02, pxPerFeature=3),
}
for pid, st in P.items():
    r = solve(st)
    e = {'state': st, 'f': r['f'], 'main': r['main'], 'opt': r.get('opt')}
    if pid == 'pcb':
        e['blurPx_f16'] = r['main']['blur_um'] / 3.45
        e['blurPx_stop'] = r['opt']['stopBlur_um'] / 3.45
    if pid == 'bin':
        ln = Lens(r['f'], st['N'], st['wd_mm'])
        c = st['cocPx'] * 0.00345
        e['depth_ok'] = ln.blur(st['wd_mm'] - 150) <= c and ln.blur(st['wd_mm'] + 150) <= c
    if pid == 'mp':
        e['mtf_f28'] = setup(dict(st, N=2.8), r['f'], 2.8)['mtfDiff']
    cases.append({'id': 'aha-' + pid, 'kind': 'aha', 'preset': pid, 'state': st, 'expect': e})

# ---- review cases (review/mvlens.md R-4, R-6, R-7, R-12): warnings, image circle / mount, sensor comparison,
# no standard focal length, depth range at the focal plane, wavelength limits of the page (200 / 2500 nm)
# Mount image-circle limits are page DATA (labelled learning assumption in opt-mv.js), restated here as data:
MOUNT_CIRCLE = [('S', 9.0), ('CS', 9.0), ('C', 17.6), ('TFL', 28.5), ('F', 43.3), ('M42', 43.3), ('M72', 90.0)]


def sensor_diag(sid):
    return SENS[sid]['diag_mm']


def lens_format(diag):  # nominal image circle of an optical type = the largest listed Sony diagonal of that type
    by = {}
    for x in SENS.values():
        if not __import__('re').fullmatch(r'IMX\d{3}', x['id']):
            continue
        by[x['type']] = max(by.get(x['type'], 0), x['diag_mm'])
    fits = sorted((c, t) for t, c in by.items() if c >= diag * 0.995)
    return fits[0][1] if fits else None


def warnings(st, r):
    """warning rules of the page contract, evaluated on the traced quantities"""
    W, H, p = sensor(st['sensorId'], st)
    o, w = r['main'], []
    s, d, f = st['wd_mm'], st['depth_mm'] / 2, r['f']
    shutter = SENS[st['sensorId']]['shutter'] if st['sensorId'] != 'custom' else st['cShutter']
    if st['circle_mm'] > 0 and st['circle_mm'] < sensor_diag(st['sensorId']) * 0.995:
        w.append('vignette')
    if shutter == 'rolling' and st['speed_mm_s'] > 0:
        w.append('rolling')
    if o['featPx'] is not None and o['featPx'] < st['pxPerFeature']:
        w.append('feature')
    if st['speed_mm_s'] > 0 and o['motionPx'] > st['blurPx']:
        w.append('motion')
    if d > 0 and s - d <= f:
        w.append('depthRange')
    elif d > 0 and not (o['dof_near'] <= s - d and (o['dof_far'] is None or o['dof_far'] >= s + d)):
        w.append('depth')
    if st.get('focalSel', 'auto') == 'auto' and r['recommended'] is None:
        w.append('nostandard')
    if o['mtfDiff'] == 0:
        w.append('cutoff')
    if not (o['fovW'] >= st['fovW_mm'] * (1 - 1e-9) and o['fovH'] >= st['fovH_mm'] * (1 - 1e-9)):
        w.append('fov')
    if o['m'] > 0.25 and st.get('focalSel', 'auto') == 'auto':
        w.append('macro')
    return sorted(w)


def extra(cid, st, **more):
    r = solve(st)
    e = {'f': r['f'], 'recommended': r['recommended'], 'warn': warnings(st, r)}
    e.update(more)
    cases.append({'id': 'review-' + cid, 'kind': 'extra', 'state': st, 'expect': e})
    return r


# warnings in combination (rolling shutter + motion + feature + vignette), cut-off, fov with a fixed focal, macro
extra('warn-rolling-motion', S(sensorId='IMX226', fovW_mm=300, fovH_mm=220, wd_mm=600, N=8, speed_mm_s=500, exposure_us=1000, feature_mm=0.2, pxPerFeature=3, circle_mm=6))
extra('warn-cutoff', S(sensorId='IMX226', fovW_mm=60, fovH_mm=45, wd_mm=250, N=16))
extra('warn-fov-fixed', S(sensorId='IMX264', fovW_mm=80, fovH_mm=60, wd_mm=300, focalSel='50'))
extra('warn-macro', S(sensorId='IMX264', fovW_mm=10, fovH_mm=8.5, wd_mm=60, N=4))
# image circle and mounts for small, 2/3", 1.1", APS-C and medium-format sensors
for sid in ['IMX287', 'IMX264', 'IMX304', 'IMX342', 'IMX411'] if 'IMX411' in SENS else ['IMX287', 'IMX264', 'IMX304', 'IMX342']:
    dg = sensor_diag(sid)
    extra('circle-' + sid, S(sensorId=sid), diag=dg, format=lens_format(dg), mounts=[m for m, c in MOUNT_CIRCLE if c >= dg * 0.995])
# sensor comparison (mp preset): each sensor with its own ideal focal length
st = S(sensorId='IMX226', fovW_mm=60, fovH_mm=45, wd_mm=250, N=8, lambda_nm=550, cmpOn=True, cmpId='IMX264')
cmp = {}
for sid in ['IMX226', 'IMX264']:
    W, H, p = sensor(sid, st)
    mreq = min(W / 60, H / 45); sp = mreq * 250; fi = 250 * sp / (250 + sp)
    o = setup(dict(st, sensorId=sid), fi, 8)
    cmp[sid] = {'f': fi, 'm': o['m'], 'cutObj': o['cut'] * o['m'], 'nyqObj': o['nyq'] * o['m'], 'mtfSys': o['mtfDiff'] * o['mtfPix']}
a, b = cmp['IMX226'], cmp['IMX264']
W, H, p = sensor('IMX226', st)
nu = b['nyqObj'] / a['m']                       # 12 MP set-up at the finest object frequency the 5 MP one samples
a['mtfAtB'] = mtf_diffraction(nu, 550e-6, setup(dict(st, sensorId='IMX226'), a['f'], 8)['Nw']) * mtf_pixel(nu, p)
extra('compare-mp', st, cmp=cmp, gain=a['cutObj'] / b['nyqObj'] - 1)
# working distance shorter than every standard focal length that would cover: ideal value used, warning
extra('nostandard-wd3', S(wd_mm=3, fovW_mm=80, fovH_mm=60))
# depth range just inside / beyond 2 (s - f) (PCB field, auto focal 25 mm at WD 210 mm)
rp = solve(S(sensorId='IMX264', fovW_mm=60, fovH_mm=50, wd_mm=210, N=16))
lim = 2 * (210 - rp['f'])
extra('depth-inside', S(sensorId='IMX264', fovW_mm=60, fovH_mm=50, wd_mm=210, N=16, depth_mm=round(lim * 0.98, 6)), depthMax=lim)
extra('depth-beyond', S(sensorId='IMX264', fovW_mm=60, fovH_mm=50, wd_mm=210, N=16, depth_mm=500), depthMax=lim, noOpt=True)
# wavelength limits of the page field
for lam in (200, 2500):
    st = S(sensorId='IMX990', fovW_mm=100, fovH_mm=80, wd_mm=500, N=4, lambda_nm=lam, depth_mm=10, feature_mm=0.25, cocPx=1.5)
    cases.append({'id': 'lambda-%d-nm' % lam, 'kind': 'setup', 'state': st, 'expect': solve(st)})
# bin preset blur numbers (R-4): diffraction alone and the total at f/8
rb = solve(P['bin'])
for c in cases:
    if c['id'] == 'aha-bin':
        c['expect']['airyPx'] = rb['main']['airy_um'] / 3.45
        c['expect']['blurPx'] = rb['main']['blur_um'] / 3.45
        c['expect']['stopBlurPx'] = rb['opt']['stopBlur_um'] / 3.45
    if c['id'] == 'aha-mp':
        c['expect']['cmp'] = cmp

(HERE / 'mvlens_ref.json').write_text(json.dumps(cases, indent=1), encoding='utf-8')
print(len(cases), 'cases; J1 first zero', J11)
