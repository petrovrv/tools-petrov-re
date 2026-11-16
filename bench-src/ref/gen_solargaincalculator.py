#!/usr/bin/env python3
"""Independent reference for solargaincalculator.html.

References used (all independent of the tool's own code):
  * NREL Solar Position Algorithm (SPA), Reda & Andreas, NREL/TP-560-34302 rev. 2008,
    as implemented in pvlib-python (pvlib.solarposition.spa_python).  The published
    verification case of Appendix A.5 of that report is reproduced explicitly.
  * Michalsky/NOAA ephemeris (pvlib.solarposition.ephemeris) as the second, mutually
    independent solar-position reference -> `crosscheck`.
  * Ineichen & Perez clear-sky model, Solar Energy 73(3) 151-157 (2002), as implemented
    in pvlib.clearsky.ineichen (with perez_enhancement=True, i.e. the SE 73 312 form).
  * Kasten & Young (1989) relative air mass, pvlib.atmosphere.get_relative_airmass.
  * Perez et al. 1990 anisotropic sky model, pvlib.irradiance.perez (model '1990').
  * Erbs et al. (1982) diffuse fraction, pvlib.irradiance.erbs.
  * Martin & Ruiz (2001) incidence-angle modifier, pvlib.iam.martin_ruiz.
  * Duffie & Beckman, Solar Engineering of Thermal Processes, 4th ed.:
      - eq. (5.4.1) angular dependence of absorptance of flat-black paint (7th-order fit)
      - Brandemuehl & Beckman effective incidence angles for sky- and ground-diffuse
        (eqs. 5.4.2 / 5.4.3)
  * Faiman (2008) module temperature model, pvlib.temperature.faiman.
  * Closed-form projected areas and diffuse view factors for the tool's shapes,
    derived here and implemented independently (see class Shape).
"""
import json, math, base64, os, sys
import numpy as np
import pandas as pd
import pvlib
from pvlib import solarposition, clearsky, irradiance, atmosphere, iam as pviam, temperature

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, 'solargaincalculator_ref.json')
GRID = os.path.join(HERE, 'solargain_climgrid.json')

I0 = 1361.1          # solar constant used by the tool (W/m2)
YEAR = 2025          # the tool's calendar year is hard-wired to 2025

# ---------------------------------------------------------------- climatology
def load_grid():
    g = json.load(open(GRID))
    raw = np.frombuffer(base64.b64decode(g['b64']), dtype=np.uint8)
    n = g['nLat'] * g['nLon'] * 12
    return g, {'kc': raw[0:n], 'tl': raw[n:2*n], 't2': raw[2*n:3*n],
               'ws': raw[3*n:4*n], 'rh': raw[4*n:5*n]}

def grid_lookup(lat, lon):
    """Bilinear lookup of the tool's bundled 10-degree offline climatology.

    This is *input data*, not the physics: the numbers below are the tool's own
    monthly Linke turbidity / clearness grid, decoded here so that the clear-sky
    model can be evaluated with zero free parameters."""
    g, arr = load_grid()
    lat0, lon0, step, nLat, nLon = g['lat0'], g['lon0'], g['step'], g['nLat'], g['nLon']
    l = min(nLat - 1.001, max(0.0, (lat - lat0) / step))
    c = (((lon - lon0) % 360) + 360) % 360 / step
    h, d = int(math.floor(l)), int(math.floor(c))
    u, p = l - h, c - d
    f, x = (d % nLon + nLon) % nLon, ((d % nLon + nLon) % nLon + 1) % nLon
    def w(a, m):
        get = lambda r: float(a[r * 12 + m])
        T, S = get(h*nLon+f), get(h*nLon+x)
        R, Y = get((h+1)*nLon+f), get((h+1)*nLon+x)
        return (T*(1-p)+S*p)*(1-u) + (R*(1-p)+Y*p)*u
    out = {'kc': [], 'TL': [], 'tAir': [], 'wind': [], 'rh': []}
    for m in range(12):
        out['kc'].append(w(arr['kc'], m)/254)
        out['TL'].append(1.5 + w(arr['tl'], m)/254*7.5)
        out['tAir'].append(w(arr['t2'], m)/254*125 - 70)
        out['wind'].append(w(arr['ws'], m)/254*20)
        out['rh'].append(w(arr['rh'], m)/254*100)
    return out

# ---------------------------------------------------------------- solar position
def spa(ts_utc, lat, lon, alt, pressure_pa=None, temp=12.0):
    if pressure_pa is None:
        pressure_pa = atmosphere.alt2pres(alt)
    idx = pd.DatetimeIndex([ts_utc], tz='UTC')
    r = solarposition.spa_python(idx, lat, lon, altitude=alt,
                                 pressure=pressure_pa, temperature=temp, delta_t=69.0)
    d = {k: float(r[k].iloc[0]) for k in r.columns}
    # declination from the exact spherical relation between true elevation and azimuth
    phi, e, A = math.radians(lat), math.radians(d['elevation']), math.radians(d['azimuth'])
    sd = math.sin(phi)*math.sin(e) + math.cos(phi)*math.cos(e)*math.cos(A)
    d['declination'] = math.degrees(math.asin(max(-1.0, min(1.0, sd))))
    return d

def ephem(ts_utc, lat, lon, alt, temp=12.0):
    idx = pd.DatetimeIndex([ts_utc], tz='UTC')
    r = solarposition.ephemeris(idx, lat, lon,
                                pressure=atmosphere.alt2pres(alt), temperature=temp)
    return {k: float(r[k].iloc[0]) for k in r.columns}

# ---------------------------------------------------------------- irradiance
def isa_pressure(alt):
    """US Standard Atmosphere 1976 troposphere barometric formula."""
    return 101325.0*(1 - 2.25577e-5*alt)**5.25588

def rel_airmass(app_zen):
    if app_zen >= 90.0:
        return 40.0
    return float(atmosphere.get_relative_airmass(app_zen, model='kastenyoung1989'))

AM_CAP = 12.0

def clearsky_ineichen(app_zen, TL, alt, E0):
    """Ineichen & Perez (2002) with the SE 73:312 enhancement term, written out
    here and cross-checked against pvlib.clearsky.ineichen.  The enhancement term
    is evaluated with the air mass capped at 12 (apparent elevation about 4 deg);
    that cap is the tool's declared validity limit and is reproduced here because
    above it the published correlation is no longer monotone in solar elevation.
    The extinction terms keep the true air mass."""
    cz = math.cos(math.radians(app_zen))
    if cz <= 0:
        return {'ghi': 0.0, 'dni': 0.0, 'dhi': 0.0, 'airmass_absolute': 0.0,
                'pvlib_ghi_uncapped': 0.0, 'pvlib_dni_uncapped': 0.0}
    amr = rel_airmass(app_zen)
    ama = amr*isa_pressure(alt)/101325.0
    ame = min(ama, AM_CAP)
    fh1, fh2 = math.exp(-alt/8000.0), math.exp(-alt/1250.0)
    cg1, cg2 = 5.09e-5*alt + 0.868, 3.92e-5*alt + 0.0387
    dni_extra = I0*E0
    ghi = max(0.0, cg1*dni_extra*cz*math.exp(-cg2*ama*(fh1 + fh2*(TL - 1)))
                   * math.exp(0.01*ame**1.8))
    b = 0.664 + 0.163/fh1
    bnci = dni_extra*max(0.0, b*math.exp(-0.09*ama*(TL - 1)))
    lim = max(0.0, 1 - (0.1 - 0.2*math.exp(-TL))/(0.1 + 0.882/fh1))
    dni = min(bnci, ghi*lim/max(cz, 1e-6))
    dni = max(0.0, min(dni, dni_extra))
    # cross-check against pvlib with the same absolute air mass (identical below the cap)
    pv = clearsky.ineichen(np.array([app_zen]), np.array([ama]), np.array([float(TL)]),
                           altitude=alt, dni_extra=dni_extra, perez_enhancement=True)
    return {'ghi': ghi, 'dni': dni, 'dhi': max(0.0, ghi - dni*cz),
            'airmass_absolute': ama,
            'pvlib_ghi_uncapped': float(np.asarray(pv['ghi'])[0]),
            'pvlib_dni_uncapped': float(np.asarray(pv['dni'])[0])}

def perez_components(tilt, saz, dhi, dni, dni_extra, zen, sazi, airmass):
    r = irradiance.perez(tilt, saz, dhi, dni, dni_extra, zen, sazi, airmass,
                         model='allsitescomposite1990', return_components=True)
    return {k: float(np.asarray(v)) for k, v in r.items()}

def perez_F1F2(dhi, dni, dni_extra, zen_deg, airmass):
    """Perez 1990 F1/F2 written out directly (independent of pvlib's internals)."""
    if dhi <= 0:
        return 0.0, 0.0
    kappa = 1.041
    z = math.radians(zen_deg)
    eps = ((dhi + dni)/dhi + kappa*z**3)/(1 + kappa*z**3)
    delta = dhi*airmass/dni_extra
    bins = [1, 1.065, 1.23, 1.5, 1.95, 2.8, 4.5, 6.2]
    C = [[-.008,.588,-.062,-.060,.072,-.022],[.130,.683,-.151,-.019,.066,-.029],
         [.330,.487,-.221,.055,-.064,-.026],[.568,.187,-.295,.109,-.152,-.014],
         [.873,-.392,-.362,.226,-.462,.001],[1.132,-1.237,-.412,.288,-.823,.056],
         [1.060,-1.600,-.359,.264,-1.127,.131],[.678,-.327,-.250,.156,-1.377,.251]]
    k = 0
    for i in range(len(bins)-1, -1, -1):
        if eps >= bins[i]:
            k = i; break
    c = C[k]
    F1 = max(0.0, c[0] + c[1]*delta + c[2]*z)
    F2 = c[3] + c[4]*delta + c[5]*z
    return F1, F2

# ---------------------------------------------------------------- IAM / absorptance
DB_POLY = [1, -1.5879e-3, 2.7314e-4, -2.3026e-5, 9.0244e-7, -1.8e-8, 1.7734e-10, -6.9937e-13]

def iam_db(cos_aoi):
    """Duffie & Beckman angular dependence of absorptance, flat-black paint."""
    th = math.degrees(math.acos(min(1.0, max(0.0, cos_aoi))))
    v, p = 0.0, 1.0
    for a in DB_POLY:
        v += a*p; p *= th
    return min(1.0, max(0.0, v))

def iam_mr(cos_aoi, ar):
    """Martin & Ruiz (2001)."""
    c = min(1.0, max(0.0, cos_aoi))
    return min(1.0, max(0.0, (1-math.exp(-c/ar))/(1-math.exp(-1/ar))))

def iam_of(cos_aoi, ar):
    return iam_db(cos_aoi) if ar is None else iam_mr(cos_aoi, ar)

def theta_sky(beta_deg):     # Brandemuehl & Beckman
    return 59.7 - 0.1388*beta_deg + 0.001497*beta_deg**2

def theta_gnd(beta_deg):
    return 90.0 - 0.5788*beta_deg + 0.002693*beta_deg**2

# ---------------------------------------------------------------- shapes
def sunvec(az_deg, zen_deg):
    """Tool's world frame: +y up, azimuth measured from -z (north) towards +x (east)."""
    a, z = math.radians(az_deg), math.radians(zen_deg)
    return (math.sin(a)*math.sin(z), math.cos(z), -math.cos(a)*math.sin(z))

def normal_of(az_deg, tilt_deg):
    a, t = math.radians(az_deg), math.radians(tilt_deg)
    return (math.sin(a)*math.sin(t), math.cos(t), -math.cos(a)*math.sin(t))

class Shape:
    """A shape reduced to a list of (area, normal) flat facets plus, for the curved
    shapes, an exact 1-D/2-D integral for the four aggregate quantities.

    Definitions (matching what the tool computes):
      area     = sum A_i                                 (absorbing facets)
      Kb(s)    = sum A_i max(0, n_i.s) * IAM(n_i.s)      (beam collecting area, m2)
      KbGeo(s) = sum A_i max(0, n_i.s)                   (pure projected area, m2)
      Siso     = sum A_i (1+n_iy)/2 * IAM(cos th_sky(b_i))
      Shor     = sum A_i sqrt(1-n_iy^2) * IAM(cos th_sky(b_i))
      Sgnd     = sum A_i (1-n_iy)/2 * IAM(cos th_gnd(b_i))
      *Geo     = the same without the IAM factor
    """
    def __init__(self, facets):
        self.facets = facets          # list of (area, normal)

    def agg(self, ar):
        Siso = Shor = Sgnd = 0.0
        gIso = gHor = gGnd = area = 0.0
        for A, n in self.facets:
            ny = max(-1.0, min(1.0, n[1]))
            beta = math.degrees(math.acos(ny))
            isk = iam_of(math.cos(math.radians(theta_sky(beta))), ar)
            ign = iam_of(math.cos(math.radians(theta_gnd(beta))), ar)
            Siso += A*(1+ny)/2*isk; gIso += A*(1+ny)/2
            Shor += A*math.sqrt(max(0.0, 1-ny*ny))*isk; gHor += A*math.sqrt(max(0.0, 1-ny*ny))
            Sgnd += A*(1-ny)/2*ign;  gGnd += A*(1-ny)/2
            area += A
        return dict(area=area, Siso=Siso, Shor=Shor, Sgnd=Sgnd,
                    SisoGeo=gIso, ShorGeo=gHor, SgndGeo=gGnd)

    def Kb(self, s, ar):
        kb = kg = 0.0
        for A, n in self.facets:
            c = n[0]*s[0] + n[1]*s[1] + n[2]*s[2]
            if c > 0:
                kb += A*c*iam_of(c, ar); kg += A*c
        return kb, kg

def facets_plane(W, D, tilt, az):
    return Shape([(W*D, normal_of(az, tilt))])

def facets_box(W, D, H, az):
    f = [(W*D, (0.0, 1.0, 0.0))]
    for a, A in ((az, D*H), (az+180, D*H), (az-90, W*H), (az+90, W*H)):
        f.append((A, normal_of(a, 90.0)))
    return Shape(f)

def facets_gable(W, D, pitch, az):
    slope = W*D/(2*math.cos(math.radians(pitch)))
    return Shape([(slope, normal_of(az, pitch)), (slope, normal_of(az+180, pitch))])

def facets_monopitch(W, D, pitch, az):
    slant = math.hypot(W, W*math.tan(math.radians(pitch)))
    return Shape([(slant*D, normal_of(az, pitch))])

def facets_pyramid(W, H, az):
    h = W/2
    beta = math.degrees(math.atan2(H, h))
    A = 0.5*W*math.hypot(H, h)
    return Shape([(A, normal_of(az+k*90, beta)) for k in range(4)])

def _jseg(o, t, lo=3, hi=22):
    """The tool's segment-count rule j(o,t) = clamp(round(o/t), 3, 22)."""
    return max(lo, min(hi, int(round(o/t))))


def _norm(v):
    n = math.sqrt(sum(x*x for x in v)) or 1.0
    return (v[0]/n, v[1]/n, v[2]/n)


class Curved(Shape):
    """The three curved shapes, faceted exactly as the tool declares: a hemisphere
    on max(6, round(10q)) x max(12, round(24q)) patches, a cylinder on
    max(16, round(28q)) x j(H, H/(9q)) plus a top cap of max(3, round(5q)) rings,
    a half-cylinder hangar on max(10, round(18q)) x j(D, D/(9q)).  Each patch keeps
    its exact area and takes its normal at the centroid of its four corners, which
    is what makes the faceted projected area differ slightly from the smooth one.
    Both are computed: `facets` is the faceted set, `exact` the smooth closed form."""

    def __init__(self, kind, R, L, az=0.0, cap=True, q=1.0):
        self.kind, self.R, self.L, self.az, self.cap, self.q = kind, R, L, az, cap, q
        Shape.__init__(self, self._facets())

    def _rot(self, n):
        a = math.radians(self.az)
        ca, sa = math.cos(a), math.sin(a)
        # the tool's Ct(az): x -> (sin a, 0, -cos a), y -> (0,1,0), z -> (cos a, 0, sin a)
        return (n[0]*sa + n[2]*ca, n[1], -n[0]*ca + n[2]*sa)

    def _facets(self):
        R, L, q = self.R, self.L, self.q
        f = []
        if self.kind == 'hemisphere':
            nt = max(6, int(round(10*q)))
            npz = max(12, int(round(24*q)))
            for i in range(nt):
                t0, t1 = i*(math.pi/2)/nt, (i+1)*(math.pi/2)/nt
                for j in range(npz):
                    p0, p1 = j/npz*2*math.pi, (j+1)/npz*2*math.pi
                    def P(t, ph):
                        return (R*math.sin(t)*math.cos(ph), R*math.cos(t), R*math.sin(t)*math.sin(ph))
                    A, K, U, V = P(t0, p0), P(t1, p0), P(t1, p1), P(t0, p1)
                    c = tuple(0.25*(A[k]+K[k]+U[k]+V[k]) for k in range(3))
                    area = R*R*(math.cos(t0)-math.cos(t1))*(p1-p0)
                    f.append((area, _norm(c)))
        elif self.kind == 'cylinder':
            e = max(16, int(round(28*q)))
            h = _jseg(L, L/(9*q))
            for j in range(e):
                p0, p1 = j/e*2*math.pi, (j+1)/e*2*math.pi
                for i in range(h):
                    z0, z1 = i/h*L, (i+1)/h*L
                    def P(ph, z):
                        return (R*math.sin(ph), z, -R*math.cos(ph))
                    A, K, U, V = P(p0, z0), P(p0, z1), P(p1, z1), P(p1, z0)
                    c = tuple(0.25*(A[k]+K[k]+U[k]+V[k]) for k in range(3))
                    area = R*(p1-p0)*(z1-z0)
                    f.append((area, _norm((c[0], 0.0, c[2]))))
            if self.cap:
                nr = max(3, int(round(5*q)))
                for j in range(e):
                    p0, p1 = j/e*2*math.pi, (j+1)/e*2*math.pi
                    for i in range(nr):
                        r0, r1 = i/nr*R, (i+1)/nr*R
                        f.append((0.5*(r1*r1 - r0*r0)*(p1 - p0), (0.0, 1.0, 0.0)))
        elif self.kind == 'hangar':
            e = max(10, int(round(18*q)))
            h = _jseg(L, L/(9*q))
            for j in range(e):
                k0, k1 = j/e*math.pi, (j+1)/e*math.pi
                for i in range(h):
                    z0 = -L/2 + i/h*L
                    z1 = -L/2 + (i+1)/h*L
                    def P(K, z):
                        return (-R*math.cos(K), R*math.sin(K), z)
                    A, K2, U, V = P(k0, z0), P(k1, z0), P(k1, z1), P(k0, z1)
                    c = tuple(0.25*(A[k]+K2[k]+U[k]+V[k]) for k in range(3))
                    area = R*(k1-k0)*(z1-z0)
                    f.append((area, self._rot(_norm((c[0], c[1], 0.0)))))
        return f

    def smooth(self, s, ar):
        """The exact smooth projected area, for the discretisation report."""
        R, L = self.R, self.L
        if self.kind == 'hemisphere':
            sh = max(0.0, s[1])
            return math.pi*R*R*(1 + sh)/2
        if self.kind == 'cylinder':
            hor = math.hypot(s[0], s[2])
            v = 2*R*L*hor
            if self.cap:
                v += math.pi*R*R*max(0.0, s[1])
            return v
        if self.kind == 'hangar':
            a = math.radians(self.az)
            sx = s[0]*math.sin(a) - s[2]*math.cos(a)
            sy = s[1]
            n = 200000
            tot = 0.0
            for i in range(n):
                K = (i + 0.5)*math.pi/n
                c = -math.cos(K)*sx + math.sin(K)*sy
                if c > 0:
                    tot += c
            return R*L*(math.pi/n)*tot
        return 0.0


# ---------------------------------------------------------------- window self-shading
def window_lit_fraction(W, H, recess, tilt, az, s):
    """Fraction of a recessed glazing that still sees the beam.

    Construction: in the window's own frame (r = horizontal axis in the plane,
    u = up-slope axis, n = outward normal) the shadow of the opening is the
    glazing rectangle displaced by recess*(s.r, s.u)/(s.n)."""
    a, t = math.radians(az), math.radians(tilt)
    n = (math.sin(a)*math.sin(t), math.cos(t), -math.cos(a)*math.sin(t))
    r = (math.cos(a), 0.0, math.sin(a))
    u = (n[1]*r[2]-n[2]*r[1], n[2]*r[0]-n[0]*r[2], n[0]*r[1]-n[1]*r[0])
    cn = sum(n[i]*s[i] for i in range(3))
    if cn <= 0:
        return 0.0
    cr = sum(r[i]*s[i] for i in range(3))
    cu = sum(u[i]*s[i] for i in range(3))
    dw = recess*abs(cr)/cn
    dh = recess*abs(cu)/cn
    return max(0.0, W-dw)*max(0.0, H-dh)/(W*H)

# ---------------------------------------------------------------- the full chain
from zoneinfo import ZoneInfo
import datetime as _dt

def jd_noon_ut(year, doy):
    """Julian day of 12:00 UT on day-of-year `doy` (the tool's dayConstants epoch)."""
    d = _dt.datetime(year, 1, 1, tzinfo=_dt.timezone.utc) + _dt.timedelta(days=doy-1, hours=12)
    return (d - _dt.datetime(2000, 1, 1, 12, tzinfo=_dt.timezone.utc)).total_seconds()/86400.0 + 2451545.0

def tz_offset(tzname, year, doy):
    d = _dt.datetime(year, 1, 1, tzinfo=_dt.timezone.utc) + _dt.timedelta(days=doy-1, hours=12)
    return d.astimezone(ZoneInfo(tzname)).utcoffset().total_seconds()/3600.0

def doy_of(year, month, day):
    return (_dt.date(year, month, day) - _dt.date(year, 1, 1)).days + 1

def refraction_noaa(elev):
    """NOAA atmospheric refraction (deg) -- the correction the tool applies."""
    if elev > 85: return 0.0
    t = math.tan(math.radians(elev))
    if elev > 5:  return (58.1/t - 0.07/t**3 + 8.6e-5/t**5)/3600
    if elev > -0.575:
        return (1735 + elev*(-518.2 + elev*(103.4 + elev*(-12.79 + elev*0.711))))/3600
    return -20.772/t/3600


def kb_on_grid(shape, ar, lat, decl, ha, convex=True):
    """Reproduce the tool's declared bilinear interpolation of the beam collecting
    area on its (declination, hour-angle) table: 49 x 721 nodes for a convex shape
    (1.0 deg in declination, 0.5 deg in hour angle), 25 x 181 otherwise.  The value
    AT each node is computed here from the exact closed-form projected area."""
    nD = 49 if convex else 25
    hStep = 0.5 if convex else 2.0
    nH = int(round(360/hStep)) + 1
    o = min(nD - 1.0001, max(0.0, (decl + 23.44)/46.88*(nD - 1)))
    l = min(nH - 1.0001, max(0.0, (ha + 180.0)/hStep))
    c, h = int(math.floor(o)), int(math.floor(l))
    d, u = o - c, l - h
    def node(ci, hi):
        dj = -23.44 + 46.88*ci/(nD - 1)
        hk = -180.0 + hi*hStep
        phi, dd, H = map(math.radians, (lat, dj, hk))
        m = max(-1.0, min(1.0, math.sin(phi)*math.sin(dd) + math.cos(phi)*math.cos(dd)*math.cos(H)))
        F = 90 - math.degrees(math.acos(m))
        if F <= -1.5:
            return 0.0, 0.0
        P = ((math.degrees(math.atan2(math.sin(H),
              math.cos(H)*math.sin(phi) - math.tan(dd)*math.cos(phi))) + 180) % 360 + 360) % 360
        return shape.Kb(sunvec(P, 90.0 - F), ar)
    n00 = node(c, h); n01 = node(c, h+1); n10 = node(c+1, h); n11 = node(c+1, h+1)
    out = []
    for k in (0, 1):
        v = ((n00[k]*(1-u) + n01[k]*u)*(1-d) + (n10[k]*(1-u) + n11[k]*u)*d)
        out.append(v)
    return out[0], out[1]

TZ = {'brussels':'Europe/Brussels','rome':'Europe/Brussels','quito':'Europe/Brussels',
      'svalbard':'Europe/Brussels','sydney':'Europe/Brussels'}

def erbs_kd(kt):
    if kt <= 0.22: return 1 - 0.09*kt
    if kt <= 0.80: return 0.9511 - 0.1604*kt + 4.388*kt*kt - 16.638*kt**3 + 12.336*kt**4
    return 0.165

def chain(case, shape, ar, alpha, albedo, scenario='clear', eps=0.9, kind='plane',
          tzname='Europe/Brussels', d_decl=0.0, d_eot=0.0, d_E0=0.0, snow_auto=True,
          quality=1.0):
    """Predict everything the tool records for one instant, from independent
    references only.  The tool's own timezone rule (IANA zone of the site kept from
    the previous pick) and its bundled offline Linke-turbidity grid are treated as
    inputs, not as physics."""
    lat, lon, alt = case['lat'], case['lon'], case['alt']
    doy = doy_of(YEAR, case['month'], case['day'])
    tz  = tz_offset(tzname, YEAR, doy)
    t_noon = _dt.datetime(YEAR, 1, 1, tzinfo=_dt.timezone.utc) + _dt.timedelta(days=doy-1, hours=12)
    t_inst = _dt.datetime(YEAR, 1, 1, tzinfo=_dt.timezone.utc) + _dt.timedelta(days=doy-1,
                                                                              hours=case['hour']-tz)
    sp_noon = spa(t_noon, lat, lon, alt)
    sp_inst = spa(t_inst, lat, lon, alt)
    ep_inst = ephem(t_inst, lat, lon, alt)
    # how far the two independent solar-position references disagree at this instant
    disagree = max(abs(sp_inst['apparent_elevation'] - ep_inst['apparent_elevation']),
                   abs(((sp_inst['azimuth'] - ep_inst['azimuth'] + 540) % 360) - 180)
                   * math.cos(math.radians(min(89.0, abs(sp_inst['apparent_elevation'])))))
    decl = sp_noon['declination'] + d_decl
    eot  = sp_noon['equation_of_time'] + d_eot
    E0_nrel = float(1.0/pvlib.solarposition.nrel_earthsun_distance(
                        pd.DatetimeIndex([t_noon], tz='UTC')).iloc[0]**2)
    E0_spencer = float(irradiance.get_extra_radiation(
        pd.DatetimeIndex([t_noon], tz='UTC'), method='spencer', solar_constant=1.0).iloc[0])
    e0_spread = abs(E0_spencer - E0_nrel)/E0_nrel
    E0 = E0_nrel*(1.0 + d_E0)
    ha   = (case['hour'] - tz + eot/60 + lon/15 - 12)*15.0
    phi, dec, H = map(math.radians, (lat, decl, ha))
    cz = max(-1.0, min(1.0, math.sin(phi)*math.sin(dec) + math.cos(phi)*math.cos(dec)*math.cos(H)))
    elev = 90 - math.degrees(math.acos(cz))
    azim = (math.degrees(math.atan2(math.sin(H),
             math.cos(H)*math.sin(phi) - math.tan(dec)*math.cos(phi))) + 360 + 180) % 360
    solar_time = (ha/15 + 12 + 24) % 24

    # sunrise / sunset: the tool evaluates declination and E at local noon
    t_lnoon = _dt.datetime(YEAR, 1, 1, tzinfo=_dt.timezone.utc) + _dt.timedelta(days=doy-1,
                                                                                hours=12-tz)
    sp_ln = spa(t_lnoon, lat, lon, alt)
    d2, e2 = sp_ln['declination'] + d_decl, sp_ln['equation_of_time'] + d_eot
    l2 = math.radians(d2)
    noon = 12 - e2/60 - lon/15 + tz
    den = math.cos(phi)*math.cos(l2)
    cw = (math.cos(math.radians(90.833)) - math.sin(phi)*math.sin(l2))/den if den != 0 else 1e18
    if cw < -1:   sunrise, sunset, polar = 0.0, 24.0, 'day'
    elif cw > 1:  sunrise, sunset, polar = None, None, 'night'
    else:
        half = math.degrees(math.acos(cw))/15
        sunrise, sunset, polar = noon - half, noon + half, None

    clim = grid_lookup(lat, lon)
    TL, kc = clim['TL'][case['month']-1], clim['kc'][case['month']-1]
    t_air = clim['tAir'][case['month']-1]
    if snow_auto and t_air < 0:
        albedo = 0.70            # the tool's automatic snow albedo below 0 degC

    cs_diag = {}
    if elev <= -0.9:
        zen_app, ghi, dni, dhi = 90.0, 0.0, 0.0, 0.0
        elev_app = elev
    else:
        elev_app = elev + refraction_noaa(elev)
        zen_app  = max(0.0, 90 - elev_app)
        cs = clearsky_ineichen(zen_app, TL, alt, E0)
        ghi, dni, dhi = cs['ghi'], cs['dni'], cs['dhi']
        cs_diag = {'pvlib_ghi_uncapped': cs['pvlib_ghi_uncapped'],
                   'pvlib_dni_uncapped': cs['pvlib_dni_uncapped'],
                   'airmass_absolute': cs['airmass_absolute']}
        if scenario != 'clear':
            ghi = ghi*kc
            czz = math.cos(math.radians(zen_app))
            if ghi <= 0 or czz <= 0.001:
                dni, dhi = 0.0, max(0.0, ghi)
            else:
                kt = min(1.0, max(0.0, ghi/(I0*E0*czz)))
                kd = min(1.0, max(0.02, erbs_kd(kt)))
                dhi = ghi*kd
                dni = (ghi - dhi)/czz
                if dni > I0*E0:
                    dni = I0*E0; dhi = max(0.0, ghi - dni*czz)

    amr = rel_airmass(zen_app)
    F1, F2 = perez_F1F2(dhi, dni, I0*E0, zen_app, amr)
    b = max(math.cos(math.radians(zen_app)), math.cos(math.radians(85.0)))
    # The tool evaluates the beam collecting area at the GEOMETRIC sun direction
    # (its Kb table is indexed by declination and hour angle), while the irradiance
    # itself uses the refracted, apparent zenith.
    s = sunvec(azim, 90.0 - elev)
    Kb, KbGeo = shape.Kb(s, ar)
    mesh_err = None
    if hasattr(shape, 'smooth'):
        sm = shape.smooth(s, ar)
        mesh_err = abs(KbGeo - sm)/max(sm, 1e-12)
    Kb_grid, KbGeo_grid = kb_on_grid(shape, ar, lat, decl, ha, convex=(kind != 'window'))
    ag = shape.agg(ar)
    beam   = dni*Kb_grid + dhi*F1/b*Kb_grid
    sky    = dhi*(1-F1)*ag['Siso'] + dhi*F2*ag['Shor']
    ground = albedo*ghi*ag['Sgnd']
    incident = max(0.0, beam + sky + ground)
    poaPower = max(0.0, dni*KbGeo_grid + dhi*F1/b*KbGeo_grid + dhi*(1-F1)*ag['SisoGeo']
                        + dhi*F2*ag['ShorGeo'] + albedo*ghi*ag['SgndGeo'])
    beam_exact = dni*Kb + dhi*F1/b*Kb
    incident_exact = max(0.0, beam_exact + sky + ground)

    # cross-check of the same transposition against pvlib's own Perez implementation
    if kind == 'plane' and dhi > 0:
        tilt = math.degrees(math.acos(max(-1.0, min(1.0, shape.facets[0][1][1]))) )
        nrm = shape.facets[0][1]
        saz = (math.degrees(math.atan2(nrm[0], -nrm[2])) + 360) % 360
        pz = perez_components(tilt, saz, dhi, dni, I0*E0, zen_app, azim, amr)
        pv_sky = float(pz['poa_sky_diffuse'])
        own = (dhi*(1-F1)*ag['SisoGeo'] + dhi*F2*ag['ShorGeo'] + dhi*F1/b*KbGeo)/ag['area']
        xcheck = {'pvlib_perez_sky_diffuse': pv_sky, 'own_perez_sky_diffuse': own,
                  'components': {k: float(v) for k, v in pz.items()}}
    else:
        xcheck = {}

    return dict(
        tz=tz, doy=doy,
        solar_declination=decl, equation_of_time=eot, E0=E0, hour_angle=ha,
        sun_elevation=elev, sun_azimuth=azim, solar_time=solar_time,
        sunrise=sunrise, sunset=sunset, polar=polar,
        elev_apparent=elev_app, zenith_apparent=zen_app, airmass=amr,
        linke_turbidity=TL, clearness_index=kc, air_temperature=t_air, albedo=albedo,
        E0_nrel=E0_nrel, E0_spencer=E0_spencer, E0_reference_spread=e0_spread,
        clearsky_pvlib_uncapped=cs_diag,
        ghi=ghi, dni=dni, dhi=dhi, F1=F1, F2=F2,
        Kb=Kb_grid, KbGeo=KbGeo_grid, Kb_exact=Kb, KbGeo_exact=KbGeo,
        table_interpolation_error=abs(Kb_grid-Kb)/max(Kb, 1e-12),
        mesh_faceting_error=mesh_err,
        incident_exact=incident_exact, area=ag['area'],
        Siso=ag['Siso'], Shor=ag['Shor'], Sgnd=ag['Sgnd'],
        SisoGeo=ag['SisoGeo'], ShorGeo=ag['ShorGeo'], SgndGeo=ag['SgndGeo'],
        beam_component=beam, sky_diffuse_component=sky, ground_reflected_component=ground,
        incident_power=incident, absorbed_power=alpha*incident,
        poa_irradiance=poaPower/ag['area'], poa_after_incidence_angle=incident/ag['area'],
        collecting_area=ag['area'],
        spa_instant_elevation=sp_inst['apparent_elevation'],
        spa_instant_azimuth=sp_inst['azimuth'],
        solpos_reference_disagreement_deg=disagree,
        ephemeris_instant_elevation=ep_inst['apparent_elevation'],
        ephemeris_instant_azimuth=ep_inst['azimuth'],
        crosscheck=xcheck)

# ---------------------------------------------------------------- case builders
SHAPES = {
 'plane':      dict(fields=dict(width=4.0, depth=3.0, tilt=35.0, azimuth=180.0, roll=0.0, mount=1.0)),
 'box':        dict(fields=dict(width=5.0, depth=5.0, height=3.0, azimuth=0.0), mode='exterior'),
 'gable':      dict(fields=dict(width=8.0, depth=10.0, pitch=30.0, azimuth=90.0)),
 'monopitch':  dict(fields=dict(width=6.0, depth=4.0, pitch=20.0, azimuth=180.0)),
 'pyramid':    dict(fields=dict(width=6.0, height=4.0, azimuth=0.0)),
 'hemisphere': dict(fields=dict(radius=3.0, tilt=0.0, azimuth=0.0, roll=0.0)),
 'cylinder':   dict(fields=dict(radius=2.0, height=8.0)),
 'hangar':     dict(fields=dict(radius=5.0, depth=20.0, azimuth=90.0)),
}

def shape_model(kind, f, az_override=None):
    az = f.get('azimuth', 0.0) if az_override is None else az_override
    if kind == 'plane':     return facets_plane(f['width'], f['depth'], f['tilt'], az)
    if kind == 'box':       return facets_box(f['width'], f['depth'], f['height'], az)
    if kind == 'gable':     return facets_gable(f['width'], f['depth'], f['pitch'], az)
    if kind == 'monopitch': return facets_monopitch(f['width'], f['depth'], f['pitch'], az)
    if kind == 'pyramid':   return facets_pyramid(f['width'], f['height'], az)
    if kind == 'hemisphere':return Curved('hemisphere', f['radius'], 0.0, q=1.0)
    if kind == 'cylinder':  return Curved('cylinder', f['radius'], f['height'], q=1.0)
    if kind == 'hangar':    return Curved('hangar', f['radius'], f['depth'], az=az, q=1.0)
    raise KeyError(kind)

MATERIALS = {'collector_black': (0.95, 0.88, 0.17), 'black_paint': (0.95, 0.90, None),
             'red_tile': (0.70, 0.90, None), 'glass_double': (0.76, 0.84, 0.17)}
ALBEDO = {'grass': 0.23, 'sand': 0.38, 'concrete': 0.28, 'asphalt_g': 0.11}

def build():
    cases = []

    # ---- A. published SPA verification case (Reda & Andreas, NREL/TP-560-34302 A.5)
    t = pd.DatetimeIndex(['2003-10-17 19:30:30'], tz='UTC')
    r = solarposition.spa_python(t, 39.742476, -105.1786, altitude=1830.14,
                                 pressure=82000, temperature=11, delta_t=67)
    cases.append({'id': 'spa_published_testcase', 'group': 'reference_selfcheck',
                  'note': 'pvlib reproduces the worked example of NREL/TP-560-34302 rev. 2008, '
                          'Appendix A.5 (2003-10-17 12:30:30 LST, tz -7, lat 39.742476, '
                          'lon -105.1786, 1830.14 m, 820 mbar, 11 C, dT 67 s)',
                  'inputs': {}, 'expected': {
                      'apparent_zenith': {'ref': float(r['apparent_zenith'].iloc[0]),
                                          'published': 50.11162},
                      'azimuth': {'ref': float(r['azimuth'].iloc[0]), 'published': 194.34024},
                      'apparent_elevation': {'ref': float(r['apparent_elevation'].iloc[0]),
                                             'published': 39.888378}}})

    # ---- B. solar geometry, irradiance, transposition, shapes
    sites = [
        ('brussels', 50.851, 4.352, 28.0),
        ('rome',     41.900, 12.500, 21.0),
        ('quito',     0.000, -78.500, 2850.0),
        ('svalbard', 78.223, 15.649, 30.0),
        ('sydney',  -33.869, 151.209, 19.0),
    ]
    dates = [(3, 20), (6, 21), (9, 23), (12, 21), (1, 15), (8, 5)]
    hours = [7.0, 9.0, 10.5, 12.0, 14.0, 16.0, 18.0]

    plan = []
    # A grid over site / date / hour with the reference plane
    for si, (nm, la, lo, al) in enumerate(sites):
        for di, (mo, dy) in enumerate(dates):
            h = hours[(si + di) % len(hours)]
            plan.append(dict(id=f'geom_{nm}_{mo:02d}{dy:02d}_{h:04.1f}', group='chain',
                             site=(nm, la, lo, al), month=mo, day=dy, hour=h,
                             shape='plane', fields=SHAPES['plane']['fields'],
                             material='collector_black', land='grass', scenario='clear'))
    # every shape at one common instant, clear sky
    for kind in SHAPES:
        plan.append(dict(id=f'shape_{kind}', group='shape',
                         site=('brussels', 50.851, 4.352, 28.0), month=6, day=21, hour=13.0,
                         shape=kind, fields=SHAPES[kind]['fields'],
                         mode=SHAPES[kind].get('mode'),
                         material='collector_black', land='grass', scenario='clear'))
    # tilt / azimuth sweep on the plane
    for tilt, az in [(0.0, 180.0), (15.0, 135.0), (60.0, 225.0), (90.0, 180.0), (120.0, 90.0)]:
        f = dict(SHAPES['plane']['fields']); f['tilt'] = tilt; f['azimuth'] = az
        plan.append(dict(id=f'tilt{int(tilt)}_az{int(az)}', group='transposition',
                         site=('brussels', 50.851, 4.352, 28.0), month=5, day=10, hour=15.0,
                         shape='plane', fields=f, material='collector_black',
                         land='grass', scenario='clear'))
    # materials / albedo / all-sky scenario
    for mat, land, sc in [('black_paint', 'sand', 'clear'), ('red_tile', 'asphalt_g', 'average'),
                          ('glass_double', 'concrete', 'average'),
                          ('collector_black', 'grass', 'average')]:
        plan.append(dict(id=f'mat_{mat}_{land}_{sc}', group='chain',
                         site=('rome', 41.9, 12.5, 21.0), month=7, day=15, hour=11.0,
                         shape='plane', fields=SHAPES['plane']['fields'],
                         material=mat, land=land, scenario=sc))
    # low-sun behaviour (the air-mass cap) and polar cases
    for nm, la, lo, al, mo, dy, h in [('svalbard', 78.223, 15.649, 30.0, 4, 5, 2.0),
                                      ('svalbard', 78.223, 15.649, 30.0, 6, 21, 0.5),
                                      ('brussels', 50.851, 4.352, 28.0, 12, 21, 8.6),
                                      ('sydney', -33.869, 151.209, 19.0, 6, 21, 17.0)]:
        plan.append(dict(id=f'lowsun_{nm}_{mo:02d}{dy:02d}_{h}', group='lowsun',
                         site=(nm, la, lo, al), month=mo, day=dy, hour=h,
                         shape='plane', fields=SHAPES['plane']['fields'],
                         material='collector_black', land='grass', scenario='clear'))

    for c in plan:
        nm, la, lo, al = c['site']
        alpha, eps, ar = MATERIALS[c['material']]
        sh = shape_model(c['shape'], c['fields'])
        case = dict(lat=la, lon=lo, alt=al, month=c['month'], day=c['day'], hour=c['hour'])
        ref = chain(case, sh, ar, alpha, ALBEDO[c['land']], scenario=c['scenario'],
                    eps=eps, kind=c['shape'])
        # Per-case tolerance: propagate the disagreement between the two independent
        # solar-position references (NREL SPA and the Michalsky/NOAA ephemeris in
        # pvlib) through the whole chain.  A quantity is graded against SPA with the
        # spread the two references themselves produce - never tighter, never looser.
        dd = max(ref['solpos_reference_disagreement_deg'], 0.01)
        de = 0.10
        cdp = chain(case, sh, ar, alpha, ALBEDO[c['land']], scenario=c['scenario'],
                    eps=eps, kind=c['shape'], d_decl=dd, d_eot=0.0)
        cdm = chain(case, sh, ar, alpha, ALBEDO[c['land']], scenario=c['scenario'],
                    eps=eps, kind=c['shape'], d_decl=-dd, d_eot=0.0)
        cep = chain(case, sh, ar, alpha, ALBEDO[c['land']], scenario=c['scenario'],
                    eps=eps, kind=c['shape'], d_decl=0.0, d_eot=de)
        cem = chain(case, sh, ar, alpha, ALBEDO[c['land']], scenario=c['scenario'],
                    eps=eps, kind=c['shape'], d_decl=0.0, d_eot=-de)
        d0 = ref['E0_reference_spread']
        c0p = chain(case, sh, ar, alpha, ALBEDO[c['land']], scenario=c['scenario'],
                    eps=eps, kind=c['shape'], d_E0=d0)
        c0m = chain(case, sh, ar, alpha, ALBEDO[c['land']], scenario=c['scenario'],
                    eps=eps, kind=c['shape'], d_E0=-d0)
        tol = {}
        for q in ('sun_elevation', 'sun_azimuth', 'solar_time', 'sunrise', 'sunset',
                  'solar_declination', 'equation_of_time', 'ghi', 'dni', 'dhi',
                  'beam_component', 'sky_diffuse_component', 'ground_reflected_component',
                  'incident_power', 'absorbed_power', 'poa_irradiance',
                  'poa_after_incidence_angle'):
            v0 = ref.get(q)
            if not isinstance(v0, (int, float)):
                continue
            sp = (max(abs((cdp.get(q) or 0) - v0), abs((cdm.get(q) or 0) - v0))
                  + max(abs((cep.get(q) or 0) - v0), abs((cem.get(q) or 0) - v0))
                  + max(abs((c0p.get(q) or 0) - v0), abs((c0m.get(q) or 0) - v0)))
            rel = sp/max(abs(v0), 1e-12)
            tol[q] = {'abs': sp, 'rel': max(rel, 2e-9)}
        ref['tolerance'] = tol
        ref['solpos_spread'] = {'d_declination_deg': dd, 'd_eot_min': de,
                                'd_earth_sun_distance_rel': d0}
        cases.append({'id': c['id'], 'group': c['group'],
                      'note': f"{c['shape']} at {nm}, {c['month']:02d}-{c['day']:02d} "
                              f"{c['hour']:.1f} h local, {c['scenario']} sky, "
                              f"{c['material']} on {c['land']}",
                      'inputs': {'site': [nm, la, lo, al], 'month': c['month'], 'day': c['day'],
                                 'hour': c['hour'], 'shape': c['shape'], 'fields': c['fields'],
                                 'mode': c.get('mode'),
                                 'material': c['material'], 'land': c['land'],
                                 'scenario': c['scenario']},
                      'expected': ref})
    return cases

if __name__ == '__main__':
    out = {'reference': 'pvlib-python (NREL SPA, Ineichen-Perez clear sky, Perez 1990 '
                        'transposition, Erbs decomposition, Kasten-Young air mass, Martin-Ruiz '
                        'IAM, Faiman cell temperature) plus closed-form projected areas and '
                        'diffuse view factors derived and implemented independently in this file',
           'citations': [
             'I. Reda and A. Andreas, "Solar Position Algorithm for Solar Radiation Applications", '
             'NREL/TP-560-34302, rev. January 2008 - verification example of Appendix A.5',
             'P. Ineichen and R. Perez, "A new airmass independent formulation for the Linke '
             'turbidity coefficient", Solar Energy 73(3):151-157, 2002',
             'R. Perez et al., "Modeling daylight availability and irradiance components from '
             'direct and global irradiance", Solar Energy 44(5):271-289, 1990 (coefficient set '
             'of Table 6)',
             'D.G. Erbs, S.A. Klein, J.A. Duffie, "Estimation of the diffuse radiation fraction '
             'for hourly, daily and monthly-average global radiation", Solar Energy 28(4):293-302, 1982',
             'F. Kasten and A.T. Young, "Revised optical air mass tables and approximation '
             'formula", Applied Optics 28(22):4735-4738, 1989',
             'N. Martin and J.M. Ruiz, "Calculation of the PV modules angular losses under field '
             'conditions by means of an analytical model", Solar Energy Materials & Solar Cells '
             '70(1):25-38, 2001',
             'J.A. Duffie and W.A. Beckman, "Solar Engineering of Thermal Processes", 4th ed., '
             'Wiley 2013 - angular dependence of absorptance of flat-black paint (7th-order fit) '
             'and the Brandemuehl-Beckman effective incidence angles for sky- and ground-diffuse',
             'D. Faiman, "Assessing the outdoor operating temperature of photovoltaic modules", '
             'Progress in Photovoltaics 16(4):307-315, 2008',
             'W. Holtzclaw / NOAA ESRL Global Monitoring Laboratory Solar Calculator, based on '
             'J. Meeus, "Astronomical Algorithms", 2nd ed., Willmann-Bell 1998 - the low-precision '
             'solar position algorithm the tool implements',
             'pvlib-python v' + pvlib.__version__],
           'cases': build()}
    json.dump(out, open(OUT, 'w'), indent=1)
    print('wrote', OUT, len(out['cases']), 'cases')
