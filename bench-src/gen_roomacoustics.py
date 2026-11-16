#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_roomacoustics.py -- reference generator and benchmark harness for roomacoustics.html
(tools.petrov.re).

Rebuild of the harness that used to live at /root/bench3/ref/gen_roomacoustics.py on a machine
that no longer exists.  It re-derives every reference value here, in Python 3 + NumPy, from the
physics the tool declares and from the primary sources cited in CITATIONS -- no stored tool output
is used as a reference -- then drives the shipping page with Playwright and grades it.

What is under test, and what is not
-----------------------------------
199 of the 229 checks are INDEPENDENT PHYSICS: closed-form Sabine (1922) and Eyring (1930)
reverberation, the 4V/S mean free path, area-weighted octave-band absorption and scattering
including the two-sided free baffle and the near-anechoic wall opening, the unfolded image-source
count through the selected order (Allen & Berkley 1979), the diffusion coefficient D = c(4V/S)/3
(Valeau/Picaut/Hodgson 2006) and segment/plane plus segment/OBB intersection under a yaw-pitch-roll
basis.  Nothing about the tool's implementation is assumed for these.

29 checks are SELF-CHECKS (implementation faithfulness).  The diffusion PDE, its Jing-Xiang (2007)
modified Robin boundary factor and D are independent physics, but the grid-sizing rule, the 0.40
stability factor, the 2 ms sample step, the t_end rule, the source-cell placement and the
nearest-cell readout are the tool's own scheme, re-implemented here from its declared description.
They prove the tool integrates the scheme it declares; they do NOT prove the scheme is the right
discretisation of the physics.  They are labelled as such and must not be reported as independent.

1 check is PUBLISHED QUALITATIVE: the I-Simpa long-room configuration publishes no digit-level
table, only that the level falls monotonically along the room.  The trend is graded; the six
receiver energies beside it are graded against this file's own re-derivation.

Scene inputs (the default material library, the room geometry, source/receiver placement) are
INPUTS to the physics, not reference outputs.  The material library and the air-attenuation table
are the tool's own declared defaults, transcribed here so the harness is self-contained.

Usage
-----
    python3 gen_roomacoustics.py --dir <directory holding roomacoustics.html and its scripts>
                                 [--port 8801] [--out roomacoustics.json] [--node <node>]

Requires: numpy, node with playwright installed, and the tool's shipping files in --dir.
"""

import argparse
import base64
import datetime as _dt
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import threading

import numpy as np

SCHEMA = "tools.petrov.re/benchmark-artifact/v1"
BENCHMARK_ID = "roomacoustics-analytic-diffusion-objects-python-v6"

CITATIONS = [
 "W. C. Sabine, Collected Papers on Acoustics, Harvard University Press, 1922 -- T60 = 0.161 V / A.",
 "C. F. Eyring, \"Reverberation time in dead rooms\", J. Acoust. Soc. Am. 1(2), 1930, pp. 217-241 "
 "-- T60 = 0.161 V / (-S ln(1-alpha_bar)).",
 "ISO 3382-2:2008, Acoustics -- Measurement of room acoustic parameters, Part 2: Reverberation time "
 "in ordinary rooms (Sabine/Eyring statistical basis and the 4V/S mean free path).",
 "V. Valeau, J. Picaut, M. Hodgson, \"On the use of a diffusion model for acoustically coupled "
 "rooms\", J. Acoust. Soc. Am. 119(3), 2006, pp. 1504-1513 -- D = c*lambda/3 with lambda = 4V/S.",
 "Y. Jing, N. Xiang, \"On boundary conditions for the diffusion equation in room-acoustic "
 "prediction\", J. Acoust. Soc. Am. 121(6), 2007, pp. 3226-3231 -- modified Robin exchange "
 "coefficient A_M = alpha / [2(2-alpha)] (eq. 12).",
 "J. B. Allen, D. A. Berkley, \"Image method for efficiently simulating small-room acoustics\", "
 "J. Acoust. Soc. Am. 65(4), 1979, pp. 943-950 -- unfolded image lattice and reflection order.",
 "I-Simpa diffusion-model validation, long room 32 x 4 x 4 m, alpha = 0.1, fully diffuse "
 "reflection, source (2,2,2), receivers on the axis at y = 5..30 m: "
 "https://i-simpa.univ-gustave-eiffel.fr/validation/validation-of-the-diffusion-model/long-room "
 "-- published QUALITATIVE behaviour (the level falls monotonically along the room); it publishes "
 "no digit-level table, so it grades the trend, not the values.",
]

# --------------------------------------------------------------------------------------------
# 1.  Tool-declared inputs (scene data, not reference outputs)
# --------------------------------------------------------------------------------------------

BANDS = [125, 250, 500, 1000, 2000, 4000, 8000]

#: the tool's declared approximate octave-band air attenuation, dB/m
AIR_DB_PER_M = {125: .0003, 250: .0005, 500: .001, 1000: .002, 2000: .006, 4000: .018, 8000: .05}

#: the tool's embedded starter material library: id -> (octave-band absorption, scattering)
MATERIALS = {
    'concrete':    ([.01, .01, .02, .02, .02, .03, .04], .05),
    'gypsum':      ([.15, .10, .06, .05, .04, .04, .04], .08),
    'glass':       ([.18, .06, .04, .03, .02, .02, .02], .04),
    'wood':        ([.15, .11, .10, .07, .06, .07, .07], .10),
    'carpet':      ([.08, .24, .57, .69, .71, .73, .73], .20),
    'curtain':     ([.14, .35, .55, .72, .70, .65, .60], .25),
    'mineral':     ([.20, .55, .85, .95, .98, .98, .98], .18),
    'ceilingtile': ([.45, .70, .80, .85, .90, .90, .90], .15),
    'audience':    ([.30, .45, .65, .80, .85, .85, .80], .55),
    '__open__':    ([.999] * 7, 0.0),      # near-anechoic leakage boundary
}


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def speed_of_sound(temp_c):
    """Tool-declared linearised speed of sound."""
    return 331.3 + 0.606 * temp_c


def alpha_of(mat, bi):
    return clamp(MATERIALS[mat][0][bi], 0.0, .999)


def scat_of(mat):
    return clamp(MATERIALS[mat][1], 0.0, .999)


def air_np_per_m(f):
    """dB/m -> energy Nepers/m."""
    return AIR_DB_PER_M[f] * math.log(10.0) / 10.0


# --------------------------------------------------------------------------------------------
# 2.  Statistical reverberation -- Sabine (1922), Eyring (1930), 4V/S mean free path
# --------------------------------------------------------------------------------------------

def surface_patches(sc):
    """Boundary patches as (area, material).  Openings claim boundary area before treatments,
    and both claim it before the base surface they sit on -- a patch replaces area, it does not
    add any."""
    w, l, h = sc['w'], sc['l'], sc['h']
    base = [('floor', w * l), ('ceiling', w * l), ('north', w * h), ('south', w * h),
            ('east', l * h), ('west', l * h)]
    out = []
    for key, area in base:
        ps = [p for p in sc.get('panels', []) if p['host'] == key]
        ps.sort(key=lambda p: 0 if p.get('kind') == 'opening' else 1)
        remaining, alloc = area, []
        for p in ps:
            a = min(max(.01, p['w'] * p['h']), remaining)
            remaining -= a
            if a > 1e-9:
                alloc.append((a, '__open__' if p.get('kind') == 'opening' else p['material']))
        out.append((remaining, sc['surfaces'][key]))
        out.extend(alloc)
    return out


def interior_surface_area(o):
    """Exposed acoustic area of a free-standing interior object.  A screen or a free baffle is
    exposed on BOTH faces; an obstacle exposes the six faces of its box."""
    if o['type'] in ('screen', 'baffle'):
        return 2 * max(.01, o['w'] * o['h'])
    return max(.01, 2 * (o['w'] * o['d'] + o['w'] * o['h'] + o['d'] * o['h']))


def stats(sc):
    w, l, h = sc['w'], sc['l'], sc['h']
    V = w * l * h
    S_bound = 2 * w * l + 2 * h * (w + l)
    interior = [(interior_surface_area(o), o['material']) for o in sc.get('interior', [])]
    S = S_bound + sum(a for a, _ in interior)
    patches = surface_patches(sc) + interior
    c = speed_of_sound(sc.get('tempC', 20))
    out = dict(V=V, S_bound=S_bound, S=S, mfp=4 * V / S, D=c * (4 * V / S) / 3, c=c,
               interior_S=S - S_bound, abar=[], sbar=[], sabine=[], eyring=[])
    for bi, f in enumerate(BANDS):
        A = sum(a * alpha_of(m, bi) for a, m in patches)                  # sum(S_i alpha_i)
        sv = sum(a * scat_of(m) for a, m in patches) / S
        av = clamp(A / S, 1e-6, .999)
        air_eq = 4 * air_np_per_m(f) * V if sc.get('airAbs') else 0.0     # 4 m V
        out['abar'].append(av)
        out['sbar'].append(sv)
        out['sabine'].append(.161 * V / max(A + air_eq, 1e-9))
        out['eyring'].append(.161 * V / max(-S * math.log(1 - av) + air_eq, 1e-9))
    return out


# --------------------------------------------------------------------------------------------
# 3.  Unfolded image-source lattice (Allen & Berkley 1979)
# --------------------------------------------------------------------------------------------

def axis_image_orders(N):
    """Reflection orders of the 1-D unfolded image lattice, keeping |order| <= N.  Each axis
    contributes the even family (2|n|, the images that return through both walls n times) and the
    odd family (|2n-1|, the images mirrored once more)."""
    orders = []
    for n in range(-N, N + 1):
        if 2 * abs(n) <= N:
            orders.append(2 * abs(n))
        if abs(2 * n - 1) <= N:
            orders.append(abs(2 * n - 1))
    return orders


def image_count(N):
    """Number of unfolded image sources (the direct path included) of total order <= N."""
    ox = axis_image_orders(N)
    return sum(1 for a in ox for b in ox for c in ox if a + b + c <= N)


# --------------------------------------------------------------------------------------------
# 4.  Yaw-pitch-roll segment/plane and segment/OBB intersection
# --------------------------------------------------------------------------------------------

def basis(o):
    """Columns of R = Rz(yaw) Ry(pitch) Rx(roll): the object's local x, y, z axes in world space.
    A screen or baffle is the rectangle spanned by (x, z) with normal y; an obstacle is the box
    with half-extents (w/2, d/2, h/2) along (x, y, z)."""
    az, ay, ax = (math.radians(o.get('rot', 0)), math.radians(o.get('pitch', 0)),
                  math.radians(o.get('roll', 0)))
    Rz = np.array([[math.cos(az), -math.sin(az), 0.], [math.sin(az), math.cos(az), 0.], [0., 0., 1.]])
    Ry = np.array([[math.cos(ay), 0., math.sin(ay)], [0., 1., 0.], [-math.sin(ay), 0., math.cos(ay)]])
    Rx = np.array([[1., 0., 0.], [0., math.cos(ax), -math.sin(ax)], [0., math.sin(ax), math.cos(ax)]])
    R = Rz @ Ry @ Rx
    return R[:, 0], R[:, 1], R[:, 2]


def screen_hit(a, b, o):
    """Segment vs finite rectangle: intersect with the carrying plane, then test the two
    in-plane half-extents."""
    ex, ey, ez = basis(o)
    C = np.array([o['x'], o['y'], o['z']], float)
    A = np.array(a, float)
    D = np.array(b, float) - A
    den = float(D @ ey)
    if abs(den) < 1e-10:
        return False                                   # parallel to the plane
    t = float(-((A - C) @ ey) / den)
    if t <= 1e-7 or t >= 1 - 1e-7:
        return False                                   # the crossing is outside the segment
    q = A + D * t - C
    return abs(float(q @ ex)) <= o['w'] / 2 + 1e-8 and abs(float(q @ ez)) <= o['h'] / 2 + 1e-8


def obb_hit(a, b, o):
    """Segment vs oriented bounding box: slab method in the box frame."""
    ex, ey, ez = basis(o)
    C = np.array([o['x'], o['y'], o['z']], float)
    M = np.vstack([ex, ey, ez])                        # world -> local
    A = M @ (np.array(a, float) - C)
    d = M @ (np.array(b, float) - C) - A
    half = np.array([o['w'] / 2, o['d'] / 2, o['h'] / 2])
    t0, t1 = 0.0, 1.0
    for k in range(3):
        if abs(d[k]) < 1e-12:
            if A[k] < -half[k] or A[k] > half[k]:
                return False
            continue
        u, v = (-half[k] - A[k]) / d[k], (half[k] - A[k]) / d[k]
        if u > v:
            u, v = v, u
        t0, t1 = max(t0, u), min(t1, v)
        if t1 < t0:
            return False
    t = clamp(t0, 0, 1)
    if t <= 1e-7:
        t = clamp(t1, 0, 1)
    return 1e-7 < t < 1 - 1e-7


def object_hit(a, b, o):
    return obb_hit(a, b, o) if o['type'] == 'obstacle' else screen_hit(a, b, o)


def direct_path_loss_db(sc):
    """Octave-band insertion loss of the direct source->receiver segment: the sum of the
    user-entered path loss of every interior object the segment actually crosses."""
    s, r = sc['src'], sc['rec']
    a = (s['x'], s['y'], s['z'])
    b = (r['x'], r['y'], r['z'])
    loss = [0.0] * 7
    hit = False
    for o in sc.get('interior', []):
        if object_hit(a, b, o):
            hit = True
            for bi in range(7):
                loss[bi] += clamp(float(o['il'][bi]), 0, 80)
    return loss, hit


def vertical_span_raw(o):
    """Vertical extent used by the tool's interior placement constraint."""
    ex, ey, ez = basis(o)
    if o['type'] == 'obstacle':
        return abs(ex[2]) * o['w'] + abs(ey[2]) * o['d'] + abs(ez[2]) * o['h']
    return abs(ex[2]) * o['w'] + abs(ez[2]) * o['h']


def vertical_span(o):
    """max - min z over the object's corners."""
    ex, ey, ez = basis(o)
    if o['type'] != 'obstacle':
        pts = [(-o['w'] / 2, 0, -o['h'] / 2), (o['w'] / 2, 0, -o['h'] / 2),
               (o['w'] / 2, 0, o['h'] / 2), (-o['w'] / 2, 0, o['h'] / 2)]
    else:
        pts = [(sx * o['w'] / 2, sy * o['d'] / 2, sz * o['h'] / 2)
               for sz in (-1, 1) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    zs = [o['z'] + ex[2] * p[0] + ey[2] * p[1] + ez[2] * p[2] for p in pts]
    return max(zs) - min(zs)


def constrain_interior(o, room_h):
    """The tool's declared interior placement constraint, re-stated here: the extents are clamped
    to their declared ranges first, then the centre height is clamped so the object's vertical span
    fits inside the room.  This is scene NORMALISATION -- what the model must look like before
    anything reads it -- not a graded result.  The generator applies it to every scene so the
    pushed scene is the scene the tool computes from; the one scenario that deliberately pushes an
    object outside the constraint is graded against the constrained form, which is what the tool
    is required to compute."""
    o = dict(o)
    o['rot'] = float(o.get('rot', 0)) % 360
    o['pitch'] = clamp(float(o.get('pitch', 0)), -180, 180)
    o['roll'] = clamp(float(o.get('roll', 0)), -180, 180)
    o['w'] = clamp(float(o['w']), .1, 100)
    o['h'] = clamp(float(o['h']), .1, room_h * 2)
    o['d'] = clamp(float(o['d']), .05, 100)
    span = max(.05, vertical_span_raw(o))
    lo = min(room_h, span / 2)
    o['z'] = clamp(float(o['z']), lo, max(lo, room_h - span / 2))
    o['il'] = [clamp(float(x), 0, 80) for x in o['il']]
    return o


def constrain_z(o, room_h):
    return constrain_interior(o, room_h)['z']


# --------------------------------------------------------------------------------------------
# 5.  Diffusion equation -- explicit finite-volume integration
# --------------------------------------------------------------------------------------------
#
#   dw/dt = D grad^2 w - sigma w ,   D = c*lambda/3,  lambda = 4V/S      (Valeau et al. 2006)
#
# Boundary loss enters each edge cell as a sink through the Jing-Xiang modified Robin exchange
# coefficient A_M = alpha/[2(2-alpha)] (Jing & Xiang 2007, eq. 12); floor and ceiling absorption
# becomes a local height-averaged sink because the model is height-averaged in 2-D.
#
# The grid-sizing rule, the 0.40 stability factor, the 2 ms sample step, the t_end rule, the
# source-cell placement and the nearest-cell readout below are the TOOL'S declared scheme,
# re-implemented from its description.  Checks that depend on them are self-checks.

def modified_absorption(alpha):
    a = clamp(float(alpha), 0.0, .999999)
    return a / (2 * (2 - a))


def diffusion_grid(sc):
    w, l, target = sc['w'], sc['l'], sc['diffusionCell']
    nx = max(2, math.ceil(w / target))
    ny = max(2, math.ceil(l / target))
    hx, hy, n = w / nx, l / ny, nx * ny
    gx = np.tile(np.arange(nx), ny)
    gy = np.repeat(np.arange(ny), nx)
    idx = np.arange(n)
    return dict(nx=nx, ny=ny, hx=hx, hy=hy, n=n, gx=gx, gy=gy,
                cx=(gx + .5) * hx, cy=(gy + .5) * hy,
                nW=np.where(gx > 0, idx - 1, -1), nE=np.where(gx < nx - 1, idx + 1, -1),
                nS=np.where(gy > 0, idx - nx, -1), nN=np.where(gy < ny - 1, idx + nx, -1))


def nearest_cell(g, x, y):
    ix = min(max(int(math.floor(x / g['hx'])), 0), g['nx'] - 1)
    iy = min(max(int(math.floor(y / g['hy'])), 0), g['ny'] - 1)
    return iy * g['nx'] + ix


def _gather(arr, idx):
    return np.where(idx >= 0, arr[np.where(idx >= 0, idx, 0)], 0.0)


def link_transmission(sc, ax, ay, bx, by, bi, h):
    """Height-averaged empirical transmission of the face between two cell centres."""
    T = 1.0
    for o in sc.get('interior', []):
        z = o['z']
        if object_hit((ax, ay, z), (bx, by, z), o):
            cov = clamp(vertical_span(o) / max(h, .1), 0.0, 1.0)
            te = 10.0 ** (-clamp(float(o['il'][bi]), 0, 80) / 10.0)
            T *= max(0.0, (1 - cov) + cov * te)
    return clamp(T, 0.0, 1.0)


def interior_sink(sc, x, y, bi, g, h):
    """Local height-averaged absorption sink of the interior objects covering this cell."""
    c = speed_of_sound(sc.get('tempC', 20))
    cell_a = max(g['hx'] * g['hy'], 1e-9)
    total = 0.0
    for o in sc.get('interior', []):
        alpha = alpha_of(o['material'], bi)
        if alpha <= 0:
            continue
        th = math.radians(o.get('rot', 0))
        ca, sa = math.cos(th), math.sin(th)
        if o['type'] in ('screen', 'baffle'):
            du = (x - o['x']) * ca + (y - o['y']) * sa
            dn = -(x - o['x']) * sa + (y - o['y']) * ca
            if abs(du) <= o['w'] / 2 + g['hx'] and abs(dn) <= max(g['hx'], g['hy']) * .7:
                foot = max(o['w'] * max(g['hx'], g['hy']), cell_a)
                total += c * modified_absorption(alpha) * (2 * o['w'] * o['h'] / foot) / max(h, .1)
        else:
            qx = ca * (x - o['x']) + sa * (y - o['y'])
            qy = -sa * (x - o['x']) + ca * (y - o['y'])
            if abs(qx) <= o['w'] / 2 + g['hx'] / 2 and abs(qy) <= o['d'] / 2 + g['hy'] / 2:
                foot = max(o['w'] * o['d'], cell_a)
                total += c * modified_absorption(alpha) * (interior_surface_area(o) / foot) / max(h, .1)
    return total


def diffusion_solve(sc, bi, st=None, float32_history=False, float32_links=False):
    st = st or stats(sc)
    g = diffusion_grid(sc)
    n, hx, hy = g['n'], g['hx'], g['hy']
    h = max(sc['h'], .1)
    c = st['c']
    D = c * st['mfp'] / 3.0
    air = c * air_np_per_m(BANDS[bi]) if sc.get('airAbs') else 0.0

    S = sc['surfaces']
    sink = np.full(n, air + c * (modified_absorption(MATERIALS[S['floor']][0][bi])
                                 + modified_absorption(MATERIALS[S['ceiling']][0][bi])) / h)
    if sc.get('interior'):
        for i in range(n):
            sink[i] += interior_sink(sc, g['cx'][i], g['cy'][i], bi, g, h)
    am = {k: modified_absorption(MATERIALS[S[k]][0][bi]) for k in ('north', 'south', 'east', 'west')}
    sink[g['gx'] == 0] += c * am['west'] / hx                 # one face per boundary side,
    sink[g['gx'] == g['nx'] - 1] += c * am['east'] / hx        # corner cells collect two
    sink[g['gy'] == 0] += c * am['south'] / hy
    sink[g['gy'] == g['ny'] - 1] += c * am['north'] / hy
    max_sink = float(sink.max())

    tW = np.ones(n); tE = np.ones(n); tS = np.ones(n); tN = np.ones(n)
    if sc.get('interior'):
        for i in range(n):
            for arr, nb in ((tW, g['nW']), (tE, g['nE']), (tS, g['nS']), (tN, g['nN'])):
                j = nb[i]
                if j >= 0:
                    t = link_transmission(sc, g['cx'][i], g['cy'][i],
                                          g['cx'][j], g['cy'][j], bi, h)
                    arr[i] = float(np.float32(t)) if float32_links else t

    diag = D * (2 / (hx * hx) + 2 / (hy * hy)) + max_sink
    sample_dt = .002
    n_sub = max(1, math.ceil(sample_dt / (.40 / max(diag, 1e-9))))
    dt = sample_dt / n_sub
    t_end = min(4.0, max(1.2, st['eyring'][bi] * 2.2, sc['diffusionTimeMs'] / 1000 + .2))
    samples = int(math.floor(t_end / sample_dt)) + 1

    w = np.zeros(n)
    si = nearest_cell(g, sc['src']['x'], sc['src']['y'])
    w[si] = 1.0 / max(hx * hy * h, 1e-12)                     # unit energy in the source cell
    cell_vol, ix2, iy2 = hx * hy * h, 1.0 / (hx * hx), 1.0 / (hy * hy)
    mW = (g['nW'] >= 0).astype(float); mE = (g['nE'] >= 0).astype(float)
    mS = (g['nS'] >= 0).astype(float); mN = (g['nN'] >= 0).astype(float)

    hist = np.empty((samples, n), dtype=np.float32 if float32_history else np.float64)
    totals = np.empty(samples)
    for ks in range(samples):
        hist[ks] = w
        totals[ks] = float((w * cell_vol).sum())
        if ks == samples - 1:
            break
        for _ in range(n_sub):
            lap = (tW * mW * (_gather(w, g['nW']) - w) * ix2
                   + tE * mE * (_gather(w, g['nE']) - w) * ix2
                   + tS * mS * (_gather(w, g['nS']) - w) * iy2
                   + tN * mN * (_gather(w, g['nN']) - w) * iy2)
            w = np.maximum(0.0, w + dt * (D * lap - sink * w))
    return dict(grid=g, D=D, dt=dt, sample_dt=sample_dt, n_sub=n_sub, t_end=t_end,
                samples=samples, hist=hist, totals=totals, source_cell=si)


def receiver_integral(sol, rec):
    ri = nearest_cell(sol['grid'], rec['x'], rec['y'])
    return float(np.sum(sol['hist'][:, ri].astype(np.float64)) * sol['sample_dt'])


# --------------------------------------------------------------------------------------------
# 6.  Scenes
# --------------------------------------------------------------------------------------------
# Scene inputs are INPUTS to the physics.  The material library and the base room are the tool's
# own declared defaults; every other number here is chosen by this harness to exercise a specific
# piece of physics, and is stated in full so the scene is reproducible without the tool.

DEF_SURF = dict(floor='carpet', ceiling='ceilingtile', north='gypsum', south='gypsum',
                east='glass', west='gypsum')
WOOD_SURF = dict.fromkeys(('floor', 'ceiling', 'north', 'south', 'east', 'west'), 'wood')
CEILING_CLOUD = dict(id='P1', kind='treatment', name='Ceiling cloud', host='ceiling',
                     material='mineral', x=4, y=5, u=2, z=2.2, w=2.4, h=1.4, rot=0)

SRC = lambda x, y, z: dict(x=x, y=y, z=z, Lw=[90.0] * 7)
RCV = lambda x, y, z: dict(x=x, y=y, z=z)


def _obj(oid, typ, x, y, z, w, h, d, material, il, rot=0, pitch=0, roll=0):
    return dict(id=oid, type=typ, name=oid, x=x, y=y, z=z, w=w, h=h, d=d,
                rot=rot, pitch=pitch, roll=roll, material=material, il=list(il))


#: octave-band insertion-loss vectors used by the intersection scenes (user inputs, not predictions)
IL_SCREEN = [0, 5, 10, 15, 20, 25, 30]
IL_OBSTACLE = [3, 6, 9, 12, 15, 18, 21]


def _shoebox(w, l, h, air):
    return dict(w=w, l=l, h=h, surfaces=dict(DEF_SURF), panels=[dict(CEILING_CLOUD)], interior=[],
                airAbs=air, tempC=20, reflectionOrder=3, analysisBand=1000, lateModel='off',
                diffusionCell=.65, diffusionTimeMs=120,
                src=SRC(w * .25, l * .3, 1.5), receivers=[RCV(w * .75, l * .6, 1.2)])


def _barrier_base(interior):
    """8 x 10 x 3.2 room, bare of treatments, one source and one receiver facing each other down
    the y axis at a constant height, so the direct segment is (4,2,1.5) -> (4,8,1.5)."""
    return dict(w=8, l=10, h=3.2, surfaces=dict(DEF_SURF), panels=[], interior=interior,
                airAbs=False, tempC=20, reflectionOrder=3, analysisBand=1000, lateModel='off',
                diffusionCell=.65, diffusionTimeMs=120,
                src=SRC(4, 2, 1.5), receivers=[RCV(4, 8, 1.5)])


def build_scenes():
    sc = []
    # --- closed-form statistics over five room shapes ------------------------------------------
    for cid, grp, (w, l, h, air) in (
            ('default-air', 'default', (8, 10, 3.2, True)),
            ('wide-dry', 'wide', (12, 9, 3, False)),
            ('tall-air', 'tall', (7.5, 13, 4.2, True)),
            ('large-dry', 'large', (15, 18, 5, False)),
            ('compact-air', 'compact', (9, 8, 2.8, True))):
        sc.append(dict(id=cid, group=grp, kind='statistics', scene=_shoebox(w, l, h, air),
                       note='closed-form Sabine/Eyring/mean-free-path/image-count statistics'))

    # --- two-sided free baffle adds exposed area to the statistical sum ------------------------
    baffle = _obj('I1', 'baffle', 4, 5, 1.5, w=3.0, h=2.0, d=.12, material='mineral', il=[0] * 7)
    s = dict(w=8, l=10, h=3.2, surfaces=dict(DEF_SURF), panels=[dict(CEILING_CLOUD)],
             interior=[baffle], airAbs=False, tempC=20, reflectionOrder=3, analysisBand=1000,
             lateModel='off', diffusionCell=.65, diffusionTimeMs=120,
             src=SRC(2, 3, 1.5), receivers=[RCV(6, 6, 1.2)])
    sc.append(dict(id='free-baffle-statistics', group='free', kind='baffle', scene=s,
                   note='two-sided free-baffle area added to the statistical absorption sum'))

    # --- near-anechoic wall opening claims boundary area before the base surface ---------------
    s = dict(w=8, l=10, h=3.2, surfaces=dict(DEF_SURF),
             panels=[dict(CEILING_CLOUD),
                     dict(id='P2', kind='opening', name='Wall opening', host='north',
                          material='__open__', x=4, y=10, u=4, z=1.6, w=2.0, h=2.0, rot=0)],
             interior=[], airAbs=False, tempC=20, reflectionOrder=3, analysisBand=1000,
             lateModel='off', diffusionCell=.65, diffusionTimeMs=120,
             src=SRC(2, 3, 1.5), receivers=[RCV(6, 6, 1.2)])
    sc.append(dict(id='wall-opening-statistics', group='wall', kind='opening', scene=s,
                   note='opening claims boundary area before the base surface; alpha = 0.999'))

    # --- yaw-pitch-roll intersection ----------------------------------------------------------
    # Each pair differs ONLY in the rotation (or in a height the rotation reinterprets), so a
    # basis that is built wrongly changes the graded answer.
    for cid, o, why in (
        ('screen-hit',
         _obj('I1', 'screen', 4, 5, 1.5, w=2.0, h=2.0, d=.1, material='concrete', il=IL_SCREEN),
         'unrotated screen squarely across the direct segment'),
        ('screen-yaw90',
         _obj('I1', 'screen', 4, 5, 1.5, w=2.0, h=2.0, d=.1, material='concrete', il=IL_SCREEN,
              rot=90),
         'yaw 90 turns the screen plane parallel to the segment: no crossing'),
        ('screen-roll90',
         _obj('I1', 'screen', 4, 5, 1.5, w=2.0, h=2.0, d=.1, material='concrete', il=IL_SCREEN,
              roll=90),
         'roll 90 lays the screen flat, normal vertical: no crossing'),
        ('screen-pitch-hit',
         _obj('I1', 'screen', 4, 5, 1.5, w=1.0, h=2.0, d=.1, material='concrete', il=IL_SCREEN,
              pitch=90),
         'pitch 90 swaps the in-plane extents; the 1.0 m extent is now vertical and still covers '
         'the 1.5 m path height'),
        ('screen-pitch90-miss',
         _obj('I1', 'screen', 4, 5, 2.2, w=1.0, h=2.0, d=.1, material='concrete', il=IL_SCREEN,
              pitch=90),
         'same screen raised to z = 2.2: under pitch 90 its vertical extent is w = 1.0 m, so it '
         'clears the path -- unpitched, the h = 2.0 m extent would still cross it'),
    ):
        o = dict(o)
        o['z'] = constrain_z(o, 3.2)
        sc.append(dict(id=cid, group='screen', kind='barrier', scene=_barrier_base([o]),
                       note='independent segment/plane intersection with a yaw-pitch-roll basis, '
                            'octave-band insertion loss -- ' + why))

    for cid, o, why in (
        ('obstacle-hit',
         _obj('I1', 'obstacle', 5.0, 5, 1.5, w=3.0, h=1.5, d=.4, material='wood', il=IL_OBSTACLE),
         'long axis across the segment: the slab test crosses the box'),
        ('obstacle-yaw90-miss',
         _obj('I1', 'obstacle', 5.0, 5, 1.5, w=3.0, h=1.5, d=.4, material='wood', il=IL_OBSTACLE,
              rot=90),
         'yaw 90 turns the long axis along the segment; the remaining 0.4 m width sits beside it'),
    ):
        o = dict(o)
        o['z'] = constrain_z(o, 3.2)
        sc.append(dict(id=cid, group='obstacle', kind='barrier', scene=_barrier_base([o]),
                       note='independent segment/OBB intersection with a yaw-pitch-roll basis, '
                            'octave-band insertion loss -- ' + why))

    # --- diffusion: published I-Simpa long-room configuration ----------------------------------
    s = dict(w=4, l=32, h=4, surfaces=dict(WOOD_SURF), panels=[], interior=[],
             airAbs=False, tempC=20, reflectionOrder=3, analysisBand=500, lateModel='diffusion',
             diffusionCell=.5, diffusionTimeMs=120,
             src=SRC(2, 2, 2), receivers=[RCV(2, y, 2) for y in (5, 10, 15, 20, 25, 30)])
    sc.append(dict(id='isimpa-long-room', group='isimpa', kind='isimpa', scene=s,
                   note='independently re-solved 2D height-averaged finite-volume diffusion; '
                        'published I-Simpa long-room configuration (alpha = 0.1 at 500 Hz, which '
                        'is what the wood preset carries in that band)'))

    # --- interior placement normalisation ------------------------------------------------------
    # Pushes a free baffle 50 m tall into a 3.2 m room.  The tool's declared constraint clamps the
    # extent to 2 x the room height (6.4 m), so the scene it must compute from is the constrained
    # one -- and the statistical quantities below separate the two placements by a factor of ~1.8
    # in mean free path.  Graded on the calculation record as it stands the moment
    # Diagram.whenReady() resolves, i.e. on the FIRST calculation after the scene is pushed, which
    # is the calculation that used to be able to run before the constraint was applied.
    raw = _obj('I1', 'baffle', 4, 5, 1.5, w=3.0, h=50.0, d=.12, material='mineral', il=[0] * 7)
    model = constrain_interior(raw, 3.2)
    common = dict(w=8, l=10, h=3.2, surfaces=dict(DEF_SURF), panels=[dict(CEILING_CLOUD)],
                  airAbs=False, tempC=20, reflectionOrder=3, analysisBand=1000, lateModel='off',
                  diffusionCell=.65, diffusionTimeMs=120,
                  src=SRC(2, 3, 1.5), receivers=[RCV(6, 6, 1.2)])
    sc.append(dict(id='interior-placement-normalised', group='placement', kind='placement',
                   scene=dict(common, interior=[model]),
                   push_scene=dict(common, interior=[raw]),
                   companion=dict(id='interior-placement-companion', group='placement',
                                  kind='companion', scene=dict(common, interior=[model]),
                                  note='the same scene pushed already constrained'),
                   grade_at_ready=True,
                   note='an interior object pushed outside its declared placement constraint '
                        '(h = 50 m in a 3.2 m room, clamped to 6.4 m): the first calculation must '
                        'already use the constrained scene it reports'))

    # --- diffusion: a full-height screen at 0 dB and at 20 dB insertion loss -------------------
    for cid, il in (('diffusion-screen-il0', 0.0), ('diffusion-screen-il20', 20.0)):
        o = _obj('I1', 'screen', 1.0, 6.0, 1.5, w=2.0, h=3.0, d=.1,
                 material='concrete', il=[il] * 7)
        o['z'] = constrain_z(o, 3.0)
        s = dict(w=2, l=12, h=3, surfaces=dict(DEF_SURF), panels=[], interior=[o],
                 airAbs=False, tempC=20, reflectionOrder=3, analysisBand=1000,
                 lateModel='diffusion', diffusionCell=1.0, diffusionTimeMs=120,
                 src=SRC(1, 2, 1.5), receivers=[RCV(1, 10, 1.5)])
        sc.append(dict(id=cid, group='diffusion-screen', kind='diffscreen', scene=s,
                       note='independent finite-volume solve in a 2 x 12 x 3 m corridor, '
                            'full-width full-height screen at %g dB insertion loss' % il))
    return sc


def probe_scenes():
    """Not graded.  Two pushes of the SAME screen: one at a height the tool's own interior
    placement constraint rejects (z = 0.3, corrected to z = 1.0), one already at the corrected
    height.  If the first calculation after the rejected push differs from the calculation of the
    corrected push, while the record reports the corrected placement, then the numbers on screen
    were computed from geometry the same record calls corrected."""
    out = []
    for pid, z in (('probe-placement-rejected', 0.3), ('probe-placement-corrected', 1.0)):
        o = _obj('I1', 'screen', 4, 5, z, w=2.0, h=2.0, d=.1, material='concrete',
                 il=IL_SCREEN, pitch=90)
        out.append(dict(id=pid, group='probe', kind='barrier', scene=_barrier_base([o]),
                        note='interior placement probe, pushed z = %g' % z))
    return out


# --------------------------------------------------------------------------------------------
# 7.  Reference values and tolerances
# --------------------------------------------------------------------------------------------

TOL_NOTE = {
 'tight': 'abs <= max(1e-10, 2e-9*max(1,|reference|)) -- closed form the tool claims to implement '
          'exactly, so double-precision agreement is the criterion',
 'loss':  'abs <= 1e-8 dB -- path loss is a sum of user-entered octave-band constants over the '
          'intersected objects; only the intersection test and the sum are under test',
 'diff':  'rel <= 3e-5 (floor 1e-11) -- same explicit finite-volume discretisation, but the tool '
          'stores its energy-density history in Float32 and its link-transmission coefficients in '
          'Float32, so the two integrations separate at about 1e-8 relative',
 'bool':  'exact',
}

INDEP = 'independent_physics'
INVAR = 'model_invariance'
SELF = 'implementation_faithfulness'
PUBQ = 'published_qualitative'


def tol_for(family, ref):
    if family == 'tight':
        return max(1e-10, 2e-9 * max(1.0, abs(ref)))
    if family == 'loss':
        return 1e-8
    if family == 'diff':
        return max(1e-11, 3e-5 * abs(ref))
    return None


def references(case):
    """Every reference value for one scene, re-derived here.  Returns a list of
    (quantity, reference, tolerance_family, classification)."""
    sc = case['scene']
    st = stats(sc)
    bi = BANDS.index(sc['analysisBand'])
    out = []

    def add(q, v, fam, cls):
        out.append((q, v, fam, cls))

    if case['kind'] in ('statistics',):
        add('volume_m3', st['V'], 'tight', INDEP)
        add('surface_m2', st['S'], 'tight', INDEP)
        add('mean_free_path_m', st['mfp'], 'tight', INDEP)
        add('diffusion_coefficient_m2_s', st['D'], 'tight', INDEP)
        add('early_reflection_count', float(image_count(sc['reflectionOrder'])), 'tight', INDEP)
        add('mean_scattering_1000', st['sbar'][3], 'tight', INDEP)
        for b in BANDS:
            add('rt60_sabine_s[%d]' % b, st['sabine'][BANDS.index(b)], 'tight', INDEP)
        for b in BANDS:
            add('rt60_eyring_s[%d]' % b, st['eyring'][BANDS.index(b)], 'tight', INDEP)

    elif case['kind'] == 'baffle':
        add('interior_surface_m2', st['interior_S'], 'tight', INDEP)
        add('total_surface_m2', st['S'], 'tight', INDEP)
        add('mean_free_path_m', st['mfp'], 'tight', INDEP)
        for i, b in enumerate(BANDS):
            add('rt60_sabine_s[%d]' % b, st['sabine'][i], 'tight', INDEP)
            add('rt60_eyring_s[%d]' % b, st['eyring'][i], 'tight', INDEP)

    elif case['kind'] == 'opening':
        add('boundary_surface_m2', st['S_bound'], 'tight', INDEP)
        add('total_surface_m2', st['S'], 'tight', INDEP)
        for i, b in enumerate(BANDS):
            add('mean_absorption[%d]' % b, st['abar'][i], 'tight', INDEP)
            add('rt60_sabine_s[%d]' % b, st['sabine'][i], 'tight', INDEP)
            add('rt60_eyring_s[%d]' % b, st['eyring'][i], 'tight', INDEP)

    elif case['kind'] == 'barrier':
        loss, hit = direct_path_loss_db(dict(sc, rec=sc['receivers'][0]))
        for i, b in enumerate(BANDS):
            add('path_loss_db[%d]' % b, loss[i], 'loss', INDEP)
        # the tool exposes no intersection flag; its side of this check is read as "some band
        # shows non-zero direct path loss", which the IL vectors above make decisive.
        add('intersection_expected', hit, 'bool', INDEP)

    elif case['kind'] == 'placement':
        o = sc['interior'][0]
        add('echoed_interior_extent_h_m', o['h'], 'tight', INDEP)
        add('interior_surface_m2', st['interior_S'], 'tight', INDEP)
        add('total_surface_m2', st['S'], 'tight', INDEP)
        add('mean_free_path_m', st['mfp'], 'tight', INDEP)
        for i, b in enumerate(BANDS):
            add('rt60_sabine_s[%d]' % b, st['sabine'][i], 'tight', INDEP)
            add('rt60_eyring_s[%d]' % b, st['eyring'][i], 'tight', INDEP)
        add('first_calculation_equals_corrected_push', True, 'bool', INVAR)

    elif case['kind'] in ('isimpa', 'diffscreen'):
        sol = diffusion_solve(sc, bi, st)
        g = sol['grid']
        add('D', sol['D'], 'diff', INDEP)                       # D = c(4V/S)/3 is independent physics
        add('cells', float(g['n']), 'diff', SELF)
        add('hx', g['hx'], 'diff', SELF)
        add('hy', g['hy'], 'diff', SELF)
        add('dt', sol['dt'], 'diff', SELF)
        add('t_end', sol['t_end'], 'diff', SELF)
        add('total_energy_start', sol['totals'][0], 'diff', SELF)
        add('total_energy_end', sol['totals'][-1], 'diff', SELF)
        if case['kind'] == 'isimpa':
            vals = [receiver_integral(sol, r) for r in sc['receivers']]
            for r, v in zip(sc['receivers'], vals):
                add('integrated_y%d' % round(r['y']), v, 'diff', SELF)
            add('published_behavior_level_decreases_with_distance',
                all(vals[i] > vals[i + 1] for i in range(len(vals) - 1)), 'bool', PUBQ)
        else:
            add('receiver_integrated_energy_density_time',
                receiver_integral(sol, sc['receivers'][0]), 'diff', SELF)
    return out


# --------------------------------------------------------------------------------------------
# 8.  Driving the shipping page
# --------------------------------------------------------------------------------------------

def tool_state(case):
    """The scene as the tool's own state object, pushed through its permalink codec.  A case may
    push a scene that differs from the one it is graded against -- that is how the placement case
    delivers an object outside its constraint."""
    sc = case.get('push_scene') or case['scene']
    w, l, h = sc['w'], sc['l'], sc['h']
    objects = [dict(id='S1', type='source', name='Source 1', x=sc['src']['x'], y=sc['src']['y'],
                    z=sc['src']['z'], Lw=list(sc['src']['Lw']), dir='omni', angle=0)]
    for i, r in enumerate(sc['receivers']):
        objects.append(dict(id='R%d' % (i + 1), type='receiver', name='Receiver %d' % (i + 1),
                            x=r['x'], y=r['y'], z=r['z']))
    return dict(
        geometry='shoebox',
        room=dict(w=w, l=l, h=h,
                  poly=[dict(x=0, y=0), dict(x=w, y=0), dict(x=w, y=l), dict(x=0, y=l)]),
        snap=True, snapStep=.25,
        surfaces=dict(sc['surfaces'], walls=sc['surfaces']['north']),
        edgeMaterials=[sc['surfaces']['north']] * 4,
        panels=[dict(p) for p in sc['panels']],
        interiorObjects=[dict(o) for o in sc['interior']],
        selectedPanel=(sc['panels'][0]['id'] if sc['panels'] else None),
        selectedReflection=0,
        objects=objects, selected='R1',
        reflectionOrder=sc['reflectionOrder'], tempC=sc['tempC'],
        diffuseTail=sc['lateModel'] != 'off', lateModel=sc['lateModel'],
        diffusionCell=sc['diffusionCell'], diffusionTimeMs=sc['diffusionTimeMs'],
        mixMode='scatter', mixReflections=4, airAbs=bool(sc['airAbs']),
        analysisBand=str(sc['analysisBand']),
        mapMetric='SPL', mapHeight=1.2, mapResolution='fast',
        referenceRows=[], referenceName='', view='edit')


def encode_state(obj):
    """The tool's permalink codec, plain-base64url branch ('J' tag), which decodeState accepts."""
    raw = json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    return 'J' + base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')



DRIVER_TEMPLATE = r"""
import pkg from '%(pw)s';
const { chromium } = pkg;
import fs from 'fs';
const scenes = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outPath = process.argv[3];
const mode = process.argv[4] || 'normal';
const base = process.argv[5];
const lang = process.argv[6] || 'en';

const EXTRACT = () => {
  const r = window.Diagram.record.build();
  if (!r) return null;
  const o = r.outputs, i = r.inputs;
  return {
    rev: r.tool.manifest_revision, status: r.tool.status,
    o: { volume_m3: o.volume_m3, boundary_surface_m2: o.boundary_surface_m2,
         total_effective_surface_m2: o.total_effective_surface_m2,
         interior_surface_m2: o.interior_surface_m2, surface_m2: o.surface_m2,
         mean_absorption: o.mean_absorption, mean_scattering: o.mean_scattering,
         rt60_sabine_s: o.rt60_sabine_s, rt60_eyring_s: o.rt60_eyring_s,
         early_reflection_count: o.early_reflection_count,
         mean_free_path_m: o.mean_free_path_m,
         diffusion_coefficient_m2_s: o.diffusion_coefficient_m2_s,
         diffusion: o.diffusion, diffusion_receiver: o.diffusion_receiver,
         diffusion_receivers: o.diffusion_receivers,
         selected_pair_direct_path_loss_db: o.selected_pair_direct_path_loss_db,
         receiver_spl_db: o.receiver_spl_db, C50_db: o.C50_db, EDT_s: o.EDT_s },
    i: { room: i.room, surfaces: i.surfaces, interior: i.interior_acoustic_objects,
         openings: i.openings, treatments: i.local_treatments, objects: i.objects,
         reflection_order: i.reflection_order, air_attenuation: i.air_attenuation,
         late_field_model: i.late_field_model, analysis_band: i.analysis_band,
         diffusion_cell_target_m: i.diffusion_cell_target_m,
         temperature_C: i.temperature_C,
         diffusion_snapshot_time_ms: i.diffusion_snapshot_time_ms }
  };
};

/* The window in which a stale first calculation is visible is one animation frame wide, so it
   cannot be sampled reliably from outside the page: by the time Diagram.whenReady() resolves a
   later cycle may already have healed it. This runs at document-start and latches the FIRST
   calculation record the page ever produces. */
const CAPTURE_FIRST = `(() => {
  let captured = false;
  const tick = () => {
    if (!captured) {
      try {
        const r = window.Diagram && window.Diagram.record && window.Diagram.record.build();
        if (r) { captured = true; window.__firstRecord = r; }
      } catch (e) {}
    }
    if (!captured) setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
})()`;

const slim = r => {
  if (!r) return null;
  const o = r.outputs, i = r.inputs;
  return {
    rev: r.tool.manifest_revision, status: r.tool.status,
    o: { volume_m3: o.volume_m3, boundary_surface_m2: o.boundary_surface_m2,
         total_effective_surface_m2: o.total_effective_surface_m2,
         interior_surface_m2: o.interior_surface_m2, surface_m2: o.surface_m2,
         mean_absorption: o.mean_absorption, mean_scattering: o.mean_scattering,
         rt60_sabine_s: o.rt60_sabine_s, rt60_eyring_s: o.rt60_eyring_s,
         early_reflection_count: o.early_reflection_count,
         mean_free_path_m: o.mean_free_path_m,
         diffusion_coefficient_m2_s: o.diffusion_coefficient_m2_s,
         diffusion: o.diffusion, diffusion_receiver: o.diffusion_receiver,
         diffusion_receivers: o.diffusion_receivers,
         selected_pair_direct_path_loss_db: o.selected_pair_direct_path_loss_db,
         receiver_spl_db: o.receiver_spl_db, C50_db: o.C50_db, EDT_s: o.EDT_s },
    i: { room: i.room, surfaces: i.surfaces, interior: i.interior_acoustic_objects,
         openings: i.openings, treatments: i.local_treatments, objects: i.objects,
         reflection_order: i.reflection_order, air_attenuation: i.air_attenuation,
         late_field_model: i.late_field_model, analysis_band: i.analysis_band,
         diffusion_cell_target_m: i.diffusion_cell_target_m,
         temperature_C: i.temperature_C,
         diffusion_snapshot_time_ms: i.diffusion_snapshot_time_ms }
  };
};

let b = await chromium.launch({ args: ['--no-sandbox'] });
let ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const results = {};
const pageErrors = [], consoleErrors = [];
const relaunch = async () => {
  try { await b.close(); } catch (e) {}
  b = await chromium.launch({ args: ['--no-sandbox'] });
  ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
};
for (const s of scenes) {
 for (let attempt = 0; ; attempt++) {
  try {
  const p = await ctx.newPage();
  await p.addInitScript(CAPTURE_FIRST);
  if (mode === 'nocompute')
    await p.route(u => /diagram-compute[^/]*\.js(\?|$)/.test(u.href), r => r.abort());
  const pe = [], ce = [];
  p.on('pageerror', e => pe.push(String(e.message).slice(0, 300)));
  p.on('console', m => { if (m.type() === 'error') ce.push(m.text().slice(0, 300)); });
  await p.goto(base + '/roomacoustics.html?lang=' + lang + '&s=' + s.state, { waitUntil: 'load', timeout: 90000 });
  await p.evaluate(() => window.Diagram.whenReady(30000));
  const atReady = await p.evaluate(EXTRACT);
  const first_rec = slim(await p.evaluate(() => window.__firstRecord || null));
  let prev = null, cur = null, polls = 0;
  for (; polls < 60; polls++) {
    cur = await p.evaluate(EXTRACT);
    const ok = cur && (!s.needs_diffusion || (cur.o.diffusion && cur.o.diffusion_receiver));
    if (ok && prev && JSON.stringify(prev) === JSON.stringify(cur)) break;
    prev = ok ? cur : null;
    await p.waitForTimeout(400);
  }
  const first = cur;
  await p.waitForTimeout(600);
  const again = await p.evaluate(EXTRACT);
  const status = await p.evaluate(() =>
    (typeof window.__diagramComputeStatus === 'function'
      ? window.__diagramComputeStatus() : window.__diagramComputeStatus) || null);
  results[s.id] = { rec: first, rec_at_ready: atReady, rec_first: first_rec,
                    settled_repeat_identical: JSON.stringify(first) === JSON.stringify(again),
                    first_calculation_identical: JSON.stringify(first_rec) === JSON.stringify(first),
                    at_ready_identical: JSON.stringify(atReady) === JSON.stringify(first),
                    polls, compute: status, page_errors: pe, console_errors: ce,
                    attempts: attempt + 1 };
  pageErrors.push(...pe.map(x => s.id + ': ' + x));
  consoleErrors.push(...ce.map(x => s.id + ': ' + x));
  await p.close();
  break;
  } catch (err) {
   if (attempt >= 2) throw err;
   process.stderr.write('retrying ' + s.id + ' after: ' + String(err && err.message) + '\n');
   await relaunch();
  }
 }
}
await b.close();
fs.writeFileSync(outPath, JSON.stringify({ results, page_errors: pageErrors,
                                           console_errors: consoleErrors }, null, 1));
"""


def run_driver(cases, node, pw_path, base_url, workdir, mode, lang='en'):
    scenes = [dict(id=c['id'], state=encode_state(tool_state(c)),
                   needs_diffusion=c['kind'] in ('isimpa', 'diffscreen')) for c in cases]
    sp = os.path.join(workdir, 'scenes-%s.json' % mode)
    op = os.path.join(workdir, 'tool-%s.json' % mode)
    dp = os.path.join(workdir, 'drive-%s.mjs' % mode)
    with open(sp, 'w') as f:
        json.dump(scenes, f)
    with open(dp, 'w') as f:
        f.write(DRIVER_TEMPLATE % dict(pw=pw_path))
    last = None
    for attempt in range(3):
        try:
            subprocess.run([node, dp, sp, op, mode, base_url, lang], check=True)
            with open(op) as f:
                return json.load(f)
        except subprocess.CalledProcessError as e:      # a browser that died mid-pass
            last = e
            sys.stderr.write('driver pass %s failed (attempt %d), retrying\n' % (mode, attempt + 1))
    raise last


# --------------------------------------------------------------------------------------------
# 9.  Reading the tool side and grading
# --------------------------------------------------------------------------------------------

def tool_values(case, rec, companion_match=None):
    """Pull the graded quantities out of the tool's calculation record."""
    o = rec['o']
    sc = case['scene']
    v = {}
    if case['kind'] == 'statistics':
        v['volume_m3'] = o['volume_m3']
        v['surface_m2'] = o['surface_m2']
        v['mean_free_path_m'] = o['mean_free_path_m']
        v['diffusion_coefficient_m2_s'] = o['diffusion_coefficient_m2_s']
        v['early_reflection_count'] = float(o['early_reflection_count'])
        v['mean_scattering_1000'] = o['mean_scattering'][3]
        for i, b in enumerate(BANDS):
            v['rt60_sabine_s[%d]' % b] = o['rt60_sabine_s'][i]
        for i, b in enumerate(BANDS):
            v['rt60_eyring_s[%d]' % b] = o['rt60_eyring_s'][i]
    elif case['kind'] == 'baffle':
        v['interior_surface_m2'] = o['interior_surface_m2']
        v['total_surface_m2'] = o['total_effective_surface_m2']
        v['mean_free_path_m'] = o['mean_free_path_m']
        for i, b in enumerate(BANDS):
            v['rt60_sabine_s[%d]' % b] = o['rt60_sabine_s'][i]
            v['rt60_eyring_s[%d]' % b] = o['rt60_eyring_s'][i]
    elif case['kind'] == 'opening':
        v['boundary_surface_m2'] = o['boundary_surface_m2']
        v['total_surface_m2'] = o['total_effective_surface_m2']
        for i, b in enumerate(BANDS):
            v['mean_absorption[%d]' % b] = o['mean_absorption'][i]
            v['rt60_sabine_s[%d]' % b] = o['rt60_sabine_s'][i]
            v['rt60_eyring_s[%d]' % b] = o['rt60_eyring_s'][i]
    elif case['kind'] == 'placement':
        v['echoed_interior_extent_h_m'] = float(rec['i']['interior'][0]['h'])
        v['interior_surface_m2'] = o['interior_surface_m2']
        v['total_surface_m2'] = o['total_effective_surface_m2']
        v['mean_free_path_m'] = o['mean_free_path_m']
        for i, b in enumerate(BANDS):
            v['rt60_sabine_s[%d]' % b] = o['rt60_sabine_s'][i]
            v['rt60_eyring_s[%d]' % b] = o['rt60_eyring_s'][i]
        v['first_calculation_equals_corrected_push'] = bool(companion_match)

    elif case['kind'] == 'barrier':
        loss = o['selected_pair_direct_path_loss_db']
        for i, b in enumerate(BANDS):
            v['path_loss_db[%d]' % b] = float(loss[i]) + 0.0
        v['intersection_expected'] = any(abs(float(x)) > 1e-9 for x in loss)
    else:
        d = o['diffusion']
        v['D'] = d['D']
        v['cells'] = float(d['cells'])
        v['hx'] = d['hx']
        v['hy'] = d['hy']
        v['dt'] = d['dt']
        v['t_end'] = d['t_end']
        v['total_energy_start'] = d['total_energy_start']
        v['total_energy_end'] = d['total_energy_end']
        if case['kind'] == 'isimpa':
            by_id = {r['id']: r for r in o['diffusion_receivers']}
            vals = []
            for i, r in enumerate(sc['receivers']):
                x = by_id['R%d' % (i + 1)]['integrated_energy_density_time']
                vals.append(x)
                v['integrated_y%d' % round(r['y'])] = x
            v['published_behavior_level_decreases_with_distance'] = \
                all(vals[i] > vals[i + 1] for i in range(len(vals) - 1))
        else:
            v['receiver_integrated_energy_density_time'] = \
                o['diffusion_receiver']['integrated_energy_density_time']
    return v


def echo_check(case, rec):
    """Did the tool echo back the scene that was pushed?  Guards against grading numbers computed
    from geometry the tool silently corrected."""
    sc = case['scene']
    i = rec['i']
    problems = []
    for k, want in (('w', sc['w']), ('l', sc['l']), ('h', sc['h'])):
        if abs(float(i['room'][k]) - want) > 1e-9:
            problems.append('room.%s %r != %r' % (k, i['room'][k], want))
    for k, want in sc['surfaces'].items():
        if i['surfaces'].get(k) != want:
            problems.append('surfaces.%s %r != %r' % (k, i['surfaces'].get(k), want))
    if bool(i['air_attenuation']) != bool(sc['airAbs']):
        problems.append('air_attenuation %r' % (i['air_attenuation'],))
    if int(i['reflection_order']) != int(sc['reflectionOrder']):
        problems.append('reflection_order %r' % (i['reflection_order'],))
    if str(i['analysis_band']) != str(sc['analysisBand']):
        problems.append('analysis_band %r' % (i['analysis_band'],))
    if i['late_field_model'] != sc['lateModel']:
        problems.append('late_field_model %r' % (i['late_field_model'],))
    if abs(float(i['diffusion_cell_target_m']) - sc['diffusionCell']) > 1e-12:
        problems.append('diffusion_cell_target_m %r' % (i['diffusion_cell_target_m'],))
    got = i['interior'] or []
    if len(got) != len(sc['interior']):
        problems.append('interior object count %d != %d' % (len(got), len(sc['interior'])))
    else:
        for a, b in zip(got, sc['interior']):
            for k in ('x', 'y', 'z', 'w', 'h', 'd', 'rot', 'pitch', 'roll'):
                if abs(float(a[k]) - float(b[k])) > 1e-9:
                    problems.append('interior %s.%s %r != %r' % (b['id'], k, a[k], b[k]))
            if a['material'] != b['material']:
                problems.append('interior %s.material %r' % (b['id'], a['material']))
            if [float(x) for x in a['il']] != [float(x) for x in b['il']]:
                problems.append('interior %s.il %r' % (b['id'], a['il']))
    n_open = len(i['openings'] or [])
    n_treat = len(i['treatments'] or [])
    want_open = sum(1 for p in sc['panels'] if p.get('kind') == 'opening')
    if n_open != want_open or n_treat != len(sc['panels']) - want_open:
        problems.append('panels echoed %d openings / %d treatments' % (n_open, n_treat))
    return problems


def grade(reference, tool, family):
    if family == 'bool':
        ok = bool(reference) == bool(tool)
        return ok, 0.0 if ok else 1.0, None, 0.0 if ok else 1.0
    ref = float(reference)
    got = float(tool)
    abs_err = abs(got - ref)
    rel = abs_err / abs(ref) if ref != 0 else (0.0 if abs_err == 0 else float('inf'))
    tol = tol_for(family, ref)
    return abs_err <= tol, rel, tol, abs_err


def recommended_status(total, passed, indep, self_, pubq, worst, findings, invar=0):
    """The site's published ladder defines `benchmarked` as: every benchmark case passes against a
    reference INDEPENDENT OF THE TOOL'S OWN CODE, cited, with a tolerance chosen from the physics.
    That is the criterion applied here, not "all cases pass"."""
    open_defect = any(f.get('reproduces_on_this_build') and not f.get('fixed') for f in findings)
    ok = (passed == total and indep >= 200 and not open_defect)
    why = []
    if passed != total:
        why.append('%d of %d checks fail.' % (total - passed, total))
    if self_:
        why.append(
            'DISCLOSED, NOT COUNTED: %d of the %d checks have no reference independent of the '
            'tool\'s own code: they '
            're-implement the tool\'s declared diffusion discretisation (grid-sizing rule, 0.40 '
            'stability factor, 2 ms sample step, t_end rule, source-cell placement, nearest-cell '
            'readout) and therefore prove only that the tool integrates its own scheme correctly. '
            'They are labelled on every check and are not counted towards the tier.'
            % (self_, total))
    if pubq:
        why.append(
            'DISCLOSED, NOT COUNTED: %d check grades a published qualitative trend rather than a '
            'value, because the published source carries no digit-level table.' % pubq)
    if invar:
        why.append(
            'DISCLOSED, NOT COUNTED: %d check compares the tool with itself across two pushes of '
            'the same scene, to pin the interior placement contract against regression.' % invar)
    if open_defect:
        why.append(
            'A priority-1 defect reproduces on this build: the first calculation after a scene '
            'change can be computed from an interior-object placement the same record reports as '
            'corrected. No graded check moves because of it, but a tool that can present a wrong '
            'number as right should not be labelled "Benchmark tested".')
    why.append('No measured validation exists; the PTB/Bork round-robin the manifest names as '
               'pending is still pending, and the absolute late-field calibration is unvalidated.')
    return {
        'status': 'benchmarked' if ok else 'prototype',
        'ladder_criterion':
            'Every benchmark case passes against a reference independent of the tool\'s own code, '
            'cited, with a tolerance chosen from the physics. Still the author\'s own harness, so '
            'independent validation stays No. (tools.petrov.re/validation.html)',
        'evidence': '%d/%d checks pass on the shipping build. %d are independent physics and are '
                    'what the tier rests on; %d are labelled self-checks of the tool\'s own '
                    'declared diffusion scheme, %d grades a published qualitative trend and %d is '
                    'a model-invariance check -- those %d are disclosed beside the independent '
                    'cases and do not count towards the tier. Worst relative error %.3e.'
                    % (passed, total, indep, self_, pubq, invar, self_ + pubq + invar,
                       worst['rel']),
        'justification': ' '.join(why),
        'independent_validation': False,
        'artifact_action': 'replace benchmarks/roomacoustics.json with this result; it was '
                           'executed against the build that ships and its harness is reproducible.',
        'manifest_action': ('status -> `benchmarked`; independent_validation stays false (this is '
                            'still the author\'s own harness).') if ok else
                           'status stays `prototype`; independent_validation stays false.',
    }


def continuity(path, refs):
    """Compare this generator's re-derived references with the frozen references of an earlier
    artifact, for the case/quantity pairs both carry.  Continuity evidence only -- nothing here is
    used as a reference."""
    try:
        with open(path) as f:
            old = json.load(f)
    except Exception as e:
        return {'available': False, 'reason': str(e)}
    frozen = {}
    for r in old.get('results', []):
        for c in r.get('checks', []):
            frozen[(r.get('case'), c.get('quantity'))] = c.get('reference')
    mine = {(cid, q): v for cid, lst in refs.items() for q, v, _f, _c in lst}
    shared = [k for k in mine if k in frozen]
    exact, moved, worst = 0, [], 0.0
    for k in shared:
        a, b = mine[k], frozen[k]
        if isinstance(a, bool) or isinstance(b, bool):
            if bool(a) == bool(b):
                exact += 1
            else:
                moved.append({'case': k[0], 'quantity': k[1], 'now': a, 'then': b})
            continue
        a, b = float(a), float(b)
        rel = abs(a - b) / abs(b) if b else abs(a - b)
        worst = max(worst, rel)
        if rel == 0.0:
            exact += 1
        elif rel > 1e-9:
            moved.append({'case': k[0], 'quantity': k[1], 'now': a, 'then': b, 'rel': rel})
    return {
        'available': True, 'artifact': os.path.basename(path),
        'note': 'the reference values re-derived by this generator against the frozen reference '
                'values of the earlier artifact, for the case/quantity pairs both carry. Scenes '
                'this generator defines differently are simply absent from the comparison. '
                'Nothing here is used as a reference.',
        'compared': len(shared), 'bit_identical': exact,
        'worst_relative_deviation': worst, 'moved': moved[:20],
        'only_in_this_run': sorted('%s/%s' % k for k in mine if k not in frozen)[:40],
        'only_in_previous': sorted('%s/%s' % k for k in frozen if k not in mine)[:40],
    }


# --------------------------------------------------------------------------------------------
# 10.  Main
# --------------------------------------------------------------------------------------------

def serve(directory, port):
    import http.server
    import functools
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dir', required=True, help='directory holding the shipping files')
    ap.add_argument('--port', type=int, default=8801)
    ap.add_argument('--out', default='roomacoustics.json')
    ap.add_argument('--node', default=shutil.which('node') or 'node')
    ap.add_argument('--playwright',
                    default='/home/claude/.npm-global/lib/node_modules/playwright/index.js')
    ap.add_argument('--no-serve', action='store_true',
                    help='assume --dir is already served on --port')
    ap.add_argument('--work', default=None, help='scratch directory for driver files')
    ap.add_argument('--compare-artifact', default=None,
                    help='an earlier artifact of this tool; its frozen reference values are '
                         'compared with the ones re-derived here, for continuity only')
    args = ap.parse_args(argv)

    cases = build_scenes()
    drive_cases = cases + [c['companion'] for c in cases if c.get('companion')]
    sys.stderr.write('deriving %d reference values ...\n' % sum(len(references(c)) for c in cases))
    refs = {c['id']: references(c) for c in cases}
    total_checks = sum(len(v) for v in refs.values())

    httpd = None if args.no_serve else serve(os.path.abspath(args.dir), args.port)
    workdir = args.work or tempfile.mkdtemp(prefix='roomacoustics-bench-')
    os.makedirs(workdir, exist_ok=True)
    base_url = 'http://127.0.0.1:%d' % args.port
    run_at = _dt.datetime.now(_dt.timezone.utc).isoformat()
    probe_raw = None
    try:
        runs_raw = {}
        for mode, label in (('normal', 'shipped configuration (compute runtime reachable), run 1'),
                            ('repeat', 'shipped configuration, run 2 (determinism repeat)'),
                            ('nocompute', 'diagram-compute*.js aborted -- main-thread solver only')):
            sys.stderr.write('driving the page (%s) ...\n' % mode)
            runs_raw[mode] = run_driver(drive_cases, args.node, args.playwright, base_url, workdir,
                                        'nocompute' if mode == 'nocompute' else 'normal'
                                        if mode == 'normal' else 'repeat')
        for lang in ('de', 'uk'):
            sys.stderr.write('driving the page (lang=%s) ...\n' % lang)
            runs_raw['lang-' + lang] = run_driver(drive_cases, args.node, args.playwright,
                                                  base_url, workdir, 'lang-' + lang, lang)
        sys.stderr.write('probing the interior placement path ...\n')
        probe_raw = run_driver(probe_scenes(), args.node, args.playwright, base_url, workdir,
                               'probe')
    finally:
        if httpd:
            httpd.shutdown()

    extra_crosscheck = {}
    if args.compare_artifact:
        extra_crosscheck['continuity_with_previous_artifact'] = continuity(
            args.compare_artifact, refs)

    primary = runs_raw['normal']['results']
    build = None
    for r in primary.values():
        if r['rec']:
            build = r['rec']['rev']
            break

    # ---- grade -----------------------------------------------------------------------------
    case_rows, results, groups = [], [], {}
    passed = failed = 0
    worst = dict(rel=-1.0, case=None, quantity=None, ref=None, tol=None)
    tool_by_case = {}
    for c in cases:
        rec = primary[c['id']]['rec_first' if c.get('grade_at_ready') else 'rec']
        if rec is None:
            raise SystemExit('the page produced no calculation record for %s' % c['id'])
        companion_match = None
        if c.get('companion'):
            # "the result must equal the result from the corrected position": the outputs of the
            # FIRST calculation after the rejected push, against the outputs of a push that was
            # already constrained.
            other = primary[c['companion']['id']]['rec_first']
            companion_match = (other is not None
                               and json.dumps(rec['o'], sort_keys=True)
                               == json.dumps(other['o'], sort_keys=True))
        tv = tool_values(c, rec, companion_match)
        tool_by_case[c['id']] = tv
        echo = echo_check(c, rec)
        cmp_map, cpass, cworst = {}, True, 0.0
        for q, ref, fam, cls in refs[c['id']]:
            got = tv[q]
            ok, rel, tol, abs_err = grade(ref, got, fam)
            cpass = cpass and ok
            cworst = max(cworst, rel if rel != float('inf') else 1.0)
            if rel > worst['rel'] and fam != 'bool':
                worst = dict(rel=rel, case=c['id'], quantity=q, ref=ref, tol=tol)
            passed += 1 if ok else 0
            failed += 0 if ok else 1
            entry = dict(got=got, ref=ref, tol=tol, rel=rel, abs_error=abs_err, ok=ok,
                         tolerance_family=fam, ref_source='recomputed', classification=cls)
            cmp_map[q] = entry
            case_rows.append(dict(id='%s/%s' % (c['id'], q), case=c['id'], group=c['group'],
                                  quantity=q, note=c['note'], inputs=c['scene'],
                                  got=got, ref=ref, tol=tol, rel=rel, ok=ok, pass_=ok,
                                  worst_rel=rel, ref_source='recomputed', classification=cls))
        if echo:
            cpass = False
        results.append(dict(id=c['id'], case=c['id'], group=c['group'], note=c['note'],
                            passed=cpass, **{'pass': cpass}, worst_rel=cworst,
                            inputs=c['scene'], pushed_state_echoed=(not echo),
                            echo_problems=echo,
                            settled_repeat_identical=primary[c['id']]['settled_repeat_identical'],
                            first_calculation_identical=primary[c['id']]['first_calculation_identical'],
                            polls_to_settle=primary[c['id']]['polls'],
                            cmp=cmp_map))
        g = groups.setdefault(c['group'], dict(cases=0, passed=0, checks=0, checks_passed=0))
        g['cases'] += 1
        g['passed'] += 1 if cpass else 0
        g['checks'] += len(cmp_map)
        g['checks_passed'] += sum(1 for e in cmp_map.values() if e['ok'])

    for row in case_rows:
        row['pass'] = row.pop('pass_')

    # ---- cross-run invariance ----------------------------------------------------------------
    def leaves(runres):
        out = {}
        for c in cases:
            rec = runres[c['id']]['rec_first' if c.get('grade_at_ready') else 'rec']
            if rec is None:
                continue
            match = None
            if c.get('companion'):
                other = runres[c['companion']['id']]['rec_first']
                match = (other is not None
                         and json.dumps(rec['o'], sort_keys=True)
                         == json.dumps(other['o'], sort_keys=True))
            for q, v in tool_values(c, rec, match).items():
                out['%s/%s' % (c['id'], q)] = v
        return out

    base_leaves = leaves(primary)

    def diff_against(other):
        o = leaves(other)
        diffs = [k for k in base_leaves
                 if k not in o or json.dumps(o[k]) != json.dumps(base_leaves[k])]
        return dict(leaves=len(base_leaves), differing=len(diffs), identical=not diffs,
                    examples=diffs[:8])

    determinism = dict(repeat_run=diff_against(runs_raw['repeat']['results']))
    language_check = {
        'note': 'the same 17 scenarios booted at ?lang=de and ?lang=uk beside the graded ?lang=en '
                'run: page errors, and whether every graded value is identical',
        'languages': ['en', 'de', 'uk'],
        'page_errors': {m: len(runs_raw[m]['page_errors']) for m in
                        ('normal', 'lang-de', 'lang-uk')},
        'outputs_identical': {m: diff_against(runs_raw[m]['results'])
                              for m in ('lang-de', 'lang-uk')}}
    ab = diff_against(runs_raw['nocompute']['results'])

    # ---- the 0.161 Sabine constant the tool declares, against the exact one -----------------
    c20 = speed_of_sound(20)
    exact = 24 * math.log(10) / c20
    crosscheck = {'sabine_constant': {
        'note': 'the tool declares and uses the textbook constant 0.161; the exact Sabine constant '
                'is 24 ln(10)/c(T). Both are computed here; the tool is graded against the form it '
                'declares, and the deviation below is the size of that modelling choice.',
        'temperature_C': 20, 'c_m_s': c20,
        'constant_declared': 0.161, 'constant_exact': exact,
        'rel_deviation': abs(0.161 - exact) / exact}}
    # ---- is the residual on the diffusion cases the tool's Float32 history, or physics? -------
    storage = {}
    for c in cases:
        if c['kind'] not in ('isimpa', 'diffscreen'):
            continue
        sc_ = c['scene']
        bi_ = BANDS.index(sc_['analysisBand'])
        st_ = stats(sc_)
        f32 = diffusion_solve(sc_, bi_, st_, float32_history=True, float32_links=True)
        tv = tool_by_case[c['id']]
        ent = {}
        for i, r in enumerate(sc_['receivers']):
            q = ('integrated_y%d' % round(r['y'])) if c['kind'] == 'isimpa' \
                else 'receiver_integrated_energy_density_time'
            got = float(tv[q])
            f64v = float([v for qq, v, _f, _c in refs[c['id']] if qq == q][0])
            f32v = receiver_integral(f32, r)
            ent[q] = {'tool': got, 'reference_float64_history': f64v,
                      'reference_float32_stores': f32v,
                      'rel_tool_vs_float64': abs(got - f64v) / abs(f64v) if f64v else 0.0,
                      'rel_tool_vs_float32_stores': abs(got - f32v) / abs(f32v) if f32v else 0.0}
        storage[c['id']] = ent
    crosscheck['diffusion_storage_precision'] = {
        'note': 'the tool stores its energy-density history AND its link-transmission '
                'coefficients in Float32. Re-running the same finite-volume integration here in '
                'plain Float64, and again with both of those stores narrowed to Float32, shows '
                'which of the two the tool reproduces. Agreement with the Float32 variant at '
                'round-off, against a ~1e-8 separation from the Float64 variant, means the whole '
                'residual on the diffusion cases is the tool\'s storage choice and not a '
                'disagreement about the physics. The GRADED reference is the Float64 one, so the '
                'tool is never graded against an emulation of its own arithmetic.',
        'per_case': storage}

    if extra_crosscheck:
        crosscheck.update(extra_crosscheck)

    # ---- open defect probe (not graded) ------------------------------------------------------
    findings = []
    if probe_raw is not None:
        pr = probe_raw['results']
        a = pr['probe-placement-rejected']['rec_first']
        b = pr['probe-placement-corrected']['rec_first']
        if a and b:
            za = float((a['i']['interior'] or [{}])[0].get('z', float('nan')))
            zb = float((b['i']['interior'] or [{}])[0].get('z', float('nan')))
            spl_a, spl_b = a['o']['receiver_spl_db'], b['o']['receiver_spl_db']
            d_spl = max(abs(float(x) - float(y)) for x, y in zip(spl_a, spl_b))
            d_c50 = abs(float(a['o']['C50_db']) - float(b['o']['C50_db']))
            reproduces = abs(za - zb) < 1e-9 and d_spl > 1e-6
            findings.append({
                'id': 1,
                'severity': 'wrong number presented as right (self-correcting after one '
                            'recalculation)',
                'title': 'The first calculation after a scene change can be computed from interior '
                         'geometry the same record reports as corrected: drawInteriorObjects() '
                         'calls constrainInterior() on every interior object, and runCycle() calls '
                         'calculate() BEFORE renderAll().',
                'where': 'roomacoustics.html runCycle(): "calculate();renderAll();" -- '
                         'drawInteriorObjects(), reached from renderAll(), is where the interior '
                         'placement constraint is applied.',
                'probe': {'pushed_z_rejected': 0.3, 'pushed_z_corrected': 1.0,
                          'echoed_z_rejected_push': za, 'echoed_z_corrected_push': zb,
                          'max_receiver_spl_difference_db': d_spl,
                          'C50_difference_db': d_c50,
                          'receiver_spl_db_rejected_push': spl_a,
                          'receiver_spl_db_corrected_push': spl_b,
                          'read': 'the FIRST calculation record the page produces, latched from '
                                  'inside the page at document-start; the stale window is one '
                                  'animation frame wide and cannot be sampled reliably from '
                                  'outside the page',
                          'settled_rejected_push':
                              pr['probe-placement-rejected']['rec']['o']['receiver_spl_db'],
                          'first_calculation_identical_to_settled': {
                              'rejected_push':
                                  pr['probe-placement-rejected']['first_calculation_identical'],
                              'corrected_push':
                                  pr['probe-placement-corrected']['first_calculation_identical']}},
                'judgement': ('Reproduces on this build: both pushes are reported with the same, '
                              'corrected placement, yet the first calculation after the rejected '
                              'push differs by %.3f dB in receiver SPL and %.3f dB in C50. Any '
                              'project-JSON load, permalink, preset or undo that delivers an '
                              'interior object outside its placement constraint therefore shows '
                              'one set of numbers computed from the rejected placement, labelled '
                              'with the accepted one. It heals on the next recalculation.'
                              % (d_spl, d_c50)) if reproduces else
                             ('Does not reproduce on this build: the two pushes agree to %.3e dB.'
                              % d_spl),
                'reproduces_on_this_build': reproduces,
                'affects_graded_checks': False,
                'affects_graded_checks_note':
                    'every graded scene is pushed with the placement constraint already applied, '
                    'and the pushed scene is checked against the echoed scene for all %d '
                    'scenarios (echo_failures below); all %d scenarios also produce an identical '
                    'record on a second read.' % (len(cases), len(cases)),
                'fixed': False,
            })

    indep = sum(1 for r in case_rows if r['classification'] == INDEP)
    self_ = sum(1 for r in case_rows if r['classification'] == SELF)
    pubq = sum(1 for r in case_rows if r['classification'] == PUBQ)
    invar = sum(1 for r in case_rows if r['classification'] == INVAR)

    art = {
        'schema': SCHEMA,
        'tool': 'roomacoustics',
        'file': 'roomacoustics.html',
        'benchmark_id': BENCHMARK_ID,
        'run_at': run_at,
        'build': build,
        # The same observed string under the name catalog.php also looks for.  `build` is read
        # off the calculation record of the page the browser fetched (r.tool.manifest_revision),
        # so neither field is typed here.
        'manifest_revision': build,
        'served_from': base_url + '/roomacoustics.html',
        # A published provenance string names a path in the deployment, never the path on the
        # machine that happened to run it: the deployed artifact carries
        # '/home/claude/live-2026-10-15/bench-src/gen_roomacoustics.py', a container path that
        # tells a reader nothing, and running a copy of this file from a scratch directory would
        # publish that directory. Derived from this file's own name, the way ref/genpaths.py's
        # label() does it for the reference generators.
        'driver': 'bench-src/' + os.path.basename(__file__),
        'reference': {
            'language': 'Python 3 + NumPy',
            'generator': os.path.basename(__file__),
            'method':
                'Every one of the %d reference values is re-derived in this generator from the '
                'physics the tool declares and from the primary sources cited below -- closed-form '
                'Sabine/Eyring/mean-free-path/image-source statistics, an independently coded '
                'yaw-pitch-roll segment/plane and segment/OBB intersection, and an independently '
                'coded explicit finite-volume integration of the diffusion PDE with the Jing-Xiang '
                'modified Robin boundary factor. No stored tool output is used as a reference.'
                % total_checks,
            'input_provenance':
                'The scene inputs (the embedded starter material library, the octave-band air '
                'attenuation table, room geometry, source/receiver placement, insertion-loss '
                'vectors) are inputs to the physics, not reference outputs. The material and air '
                'tables are the tool\'s own declared defaults, transcribed into this generator so '
                'it runs without the tool; every other scene number is chosen by the generator and '
                'stated in full in each case\'s `inputs`.',
        },
        'reference_provenance': 'recomputed',
        'provenance_note':
            '%d of the %d reference values are numbers recomputed in this generator from the '
            'declared physics and the cited sources; the remaining %d is the model-invariance '
            'row, whose reference is not a recomputed number but the assertion that the first '
            'calculation after a rejected push equals the tool\'s own output for the corrected '
            'position. No case reuses a stored tool output or a frozen recorded value, so no '
            'case carries ref_source "recorded".'
            % (total_checks - invar, total_checks, invar),
        'reference_citations': CITATIONS,
        'tolerance': TOL_NOTE,
        'total': total_checks,
        'passed': passed,
        'failed': failed,
        'cases': case_rows,
        'scenario_count': len(cases),
        'scenario_passed': sum(1 for r in results if r['passed']),
        'results': results,
        'groups': groups,
        'reference_source_counts': {'recomputed': total_checks},
        'strict_relative_grading': {
            'note': 'relative error of every numeric check, independent of the declared floors',
            'numeric_checks': sum(1 for r in case_rows if r['tol'] is not None),
            'worst_relative_error': worst,
        },
        'validation_scope': {
            'independent_physics': {
                'checks': indep,
                'what':
                    'Graded against closed forms taken from their primary statements and '
                    'implemented in the generator: Sabine and Eyring reverberation, the 4V/S mean '
                    'free path, area-weighted octave-band absorption and scattering including the '
                    'two-sided free baffle and the near-anechoic wall opening, the unfolded '
                    'image-source count through order 3, the diffusion coefficient D = c(4V/S)/3, '
                    'and segment/plane plus segment/OBB intersection under a yaw-pitch-roll basis. '
                    'Nothing about the tool\'s implementation is assumed.',
                'groups': ['default', 'wide', 'tall', 'large', 'compact', 'free', 'wall',
                           'screen', 'obstacle', 'placement'],
            },
            'implementation_faithfulness': {
                'checks': self_,
                'what':
                    'The diffusion cases. The PDE, its boundary factor A_M = alpha/[2(2-alpha)] '
                    'and D are independent physics, but the grid-sizing rule, the 0.40 stability '
                    'factor, the 2 ms sample step, the t_end rule, the source-cell placement and '
                    'the nearest-cell readout are the tool\'s own scheme, re-implemented in the '
                    'generator from its declared description. These checks prove the tool '
                    'integrates the scheme it declares; they do NOT prove the scheme is the right '
                    'discretisation of the physics. They are self-checks and are not counted as '
                    'independent evidence.',
                'quantities': ['cells', 'hx', 'hy', 'dt', 't_end', 'total_energy_start',
                               'total_energy_end', 'integrated_y*',
                               'receiver_integrated_energy_density_time'],
            },
            'model_invariance': {
                'checks': invar,
                'what':
                    'The tool compared with itself across two pushes of the same scene, one of '
                    'them outside the declared interior placement constraint. There is no external '
                    'reference for this check and it is not counted as independent evidence; it '
                    'exists to pin the contract that the scene the tool reports is the scene it '
                    'computed from, so the placement defect cannot come back unnoticed. The '
                    'seventeen closed-form quantities graded beside it in the same scenario ARE '
                    'independent.',
            },
            'published_qualitative': {
                'checks': pubq,
                'what':
                    'The I-Simpa long-room configuration publishes no digit-level table, only the '
                    'behaviour that the level falls monotonically along the room. That trend is '
                    'graded; the six receiver energies beside it are graded against this '
                    'generator\'s own re-derivation, not against any published number.',
            },
            'not_covered': [
                'No measured validation. The PTB/Bork round-robin the manifest names as pending is '
                'still pending; nothing here compares the tool to a measured room.',
                'The absolute calibration of the late field is normalised to the hybrid room-term '
                'budget; the diffusion solve sets the distribution, and no check here validates '
                'the absolute level.',
                'The RIR/EDC synthesis, the auralization and the WAV export are stochastic and '
                'ungraded.',
                'Polygon (non-shoebox) geometry, the SPL/metric map ensemble, local treatment '
                'reflection coefficients and the measurement-reference import are not exercised by '
                'these %d scenarios.' % len(cases),
                'Receiver SPL, C50/C80/D50/Ts/EDT/T20/T30 and the air-absorption table itself are '
                'not graded here.',
            ],
        },
        'language_check': language_check,
        'determinism': dict(determinism, first_calculation_vs_settled={
            'note': 'whether the FIRST calculation record the page produces -- latched from inside '
                    'the page at document-start, one animation frame wide -- is identical to the '
                    'settled record',
            'scenarios': len(cases),
            'identical': sum(1 for c in cases if primary[c['id']]['first_calculation_identical']),
            'differing': [c['id'] for c in cases
                          if not primary[c['id']]['first_calculation_identical']]}),
        'worker_vs_mainthread_ab': ab,
        'runs': {mode: dict(label=label,
                            page_errors=runs_raw[mode]['page_errors'],
                            console_errors=runs_raw[mode]['console_errors'],
                            backends={c['id']: (runs_raw[mode]['results'][c['id']]['compute'] or {})
                                      .get('backend') for c in cases},
                            fallback_reasons={c['id']: (runs_raw[mode]['results'][c['id']]['compute']
                                                        or {}).get('fallbackReason')
                                              for c in cases
                                              if (runs_raw[mode]['results'][c['id']]['compute']
                                                  or {}).get('fallbackReason')})
                 for mode, label in (
                     ('normal', 'shipped configuration (compute runtime reachable), run 1'),
                     ('repeat', 'shipped configuration, run 2 (determinism repeat)'),
                     ('nocompute', 'diagram-compute*.js aborted -- main-thread solver only'),
                     ('lang-de', 'shipped configuration booted at ?lang=de'),
                     ('lang-uk', 'shipped configuration booted at ?lang=uk'))},
        'solver_provenance': {
            'note': 'which backend the page reported while the diffusion cases were solved. '
                    '"workers:N" = solved off the main thread through the compute runtime; '
                    '"cpu" = the runtime was unreachable and the PDE was solved synchronously on '
                    'the main thread.',
            'per_case': {c['id']: {mode: (runs_raw[mode]['results'][c['id']]['compute'] or {})
                                   .get('backend')
                                   for mode in ('normal', 'repeat', 'nocompute')}
                         for c in cases if c['kind'] in ('isimpa', 'diffscreen')},
        },
        'crosscheck': crosscheck,
        'findings': findings,
        'page_errors': runs_raw['normal']['page_errors'],
        'browser_errors': runs_raw['normal']['console_errors'],
        'failures': [dict(case=r['case'], quantity=r['quantity'], got=r['got'], ref=r['ref'],
                          tol=r['tol'], rel=r['rel']) for r in case_rows if not r['ok']],
        'echo_failures': [dict(case=r['id'], problems=r['echo_problems'])
                          for r in results if r['echo_problems']],
        'recommended_status': recommended_status(total_checks, passed, indep, self_, pubq,
                                                 worst, findings, invar),
    }

    with open(args.out, 'w') as f:
        json.dump(art, f, indent=1)
    sys.stderr.write('%d/%d checks passed; worst relative error %.3e (%s / %s)\n'
                     % (passed, total_checks, worst['rel'], worst['case'], worst['quantity']))
    sys.stderr.write('wrote %s\n' % args.out)
    return 0 if failed == 0 and not art['echo_failures'] else 1


if __name__ == '__main__':
    sys.exit(main())
