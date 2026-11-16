#!/usr/bin/env python3
"""
Independent reference for hydraulicnetwork.html
=========================================================
Two structurally independent solvers for the steady incompressible pipe-network
problem, written from the governing equations only:

  * `solve_newton`   - simultaneous nodal formulation, unknowns are the edge
                       flows q_i [m3/s] and the free-node pressure heads h_j [m],
                       solved with scipy.optimize.root (Powell hybrid) on the
                       unscaled residuals.
  * `solve_hardy_cross` - the classical loop-correction method (Cross 1936):
                       a spanning tree carries a continuity-feasible initial
                       flow, one fundamental loop per chord, and each loop is
                       corrected by dQ = -sum(h_L) / sum(|dh_L/dq|) until the
                       loop head imbalance vanishes.  Only used for networks with
                       a single fixed-head node, where no pseudo-loop is needed.

Where both apply, their mutual deviation is recorded as `crosscheck`.

Component equations (as documented by the page, SI internally):
  pipe   h = (f L/D + K) v^2 / (2 g),  f = 64/Re (Re<=2000),
         Swamee-Jain f = 0.25 / log10(eps/(3.7 D) + 5.74/Re^0.9)^2 (Re>=4000),
         smoothstep blend between
  valve  dp[bar] = SG (Q[m3/h]/Kv)^2,  h = dp/(rho g)
  hx     h = (dp_design[Pa]/(rho g)) (Q/Q_design)^n
  pump   H = H0 s^2 - a Q|Q|,  a = (H0 - H_rated)/Q_rated^2
Edge energy:  h_a + z_a - h_b - z_b + H_pump(q) - h_loss(q) = 0
Node continuity: sum of inflows - sum of outflows - demand = 0

Several cases also carry a closed-form hand solution (`analytic`) obtained by
1-D root finding on a single scalar equation, independent of both solvers.

Writes bench-src/ref/hydraulicnetwork_ref.json.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math, os, random
import numpy as np
from scipy.optimize import brentq, root

G = 9.80665


# --------------------------------------------------------------- correlations
def swamee_jain(Re, rel):
    return 0.25 / math.log10(rel / 3.7 + 5.74 / Re ** 0.9) ** 2


def darcy_f(Re, rel):
    if not Re > 0:
        return 0.0
    if Re <= 2000:
        return 64.0 / Re
    turb = swamee_jain(Re, rel)
    if Re >= 4000:
        return turb
    lam = 64.0 / Re
    t = (Re - 2000.0) / 2000.0
    s = t * t * (3 - 2 * t)
    return lam * (1 - s) + turb * s


def kv_eff(e):
    o = min(1.0, max(0.001, e['opening'] / 100.0))
    return e['Kv'] * (50.0 ** (o - 1) if e.get('law') == 'equal' else o)


def edge_loss(e, q, fl):
    """Signed head loss [m] across the edge for volumetric flow q [m3/s]."""
    aq = abs(q)
    sg = fl['rho'] / 1000.0
    if e['type'] == 'pipe':
        D = e['D'] / 1000.0
        A = math.pi * D * D / 4
        v = aq / A
        Re = v * D / fl['nu']
        f = darcy_f(Re, e['eps'] / 1000.0 / D)
        loss = (f * e['L'] / D + e['K']) * v * v / (2 * G)
    elif e['type'] == 'valve':
        loss = 1e5 * sg * (aq * 3600.0 / kv_eff(e)) ** 2 / (fl['rho'] * G)
    elif e['type'] == 'hx':
        loss = (e['dpDesign'] * 1000.0 / (fl['rho'] * G)) * (aq / (e['Qdesign'] / 3600.0)) ** e['n']
    elif e['type'] == 'pump':
        loss = 0.0
    else:
        raise ValueError(e['type'])
    return math.copysign(loss, q) if q != 0 else 0.0


def edge_pump(e, q, fl):
    if e['type'] != 'pump':
        return 0.0
    qr = e['Qrated'] / 3600.0
    a = (e['H0'] - e['Hrated']) / (qr * qr)
    s = e['speed'] / 100.0 * fl['speed']
    return e['H0'] * s * s - a * q * abs(q)


def edge_head(e, q, fl):
    """Head gained from a to b: pump head minus signed loss."""
    return edge_pump(e, q, fl) - edge_loss(e, q, fl)


# ------------------------------------------------------------ nodal Newton
def solve_newton(net):
    nodes, edges, fl = net['nodes'], net['edges'], net['fluid']
    nid = {n['id']: n for n in nodes}
    free = [n for n in nodes if not n['fixed']]
    fi = {n['id']: k for k, n in enumerate(free)}
    E, N = len(edges), len(free)

    def fixed_head(n):
        return n['p'] * 1000.0 / (fl['rho'] * G)

    def head(n, v):
        return fixed_head(n) if n['fixed'] else v[E + fi[n['id']]]

    def residual(v):
        r = np.zeros(N + E)
        for k, n in enumerate(free):
            bal = -n['demand'] * fl['load'] / 3600.0
            for i, e in enumerate(edges):
                if e['b'] == n['id']:
                    bal += v[i]
                if e['a'] == n['id']:
                    bal -= v[i]
            r[k] = bal
        for i, e in enumerate(edges):
            a, b = nid[e['a']], nid[e['b']]
            r[N + i] = head(a, v) + a['z'] - head(b, v) - b['z'] + edge_head(e, v[i], fl)
        return r

    scale = max([abs(n['demand']) / 3600.0 for n in nodes] +
                [e['Qrated'] / 3600.0 for e in edges if e['type'] == 'pump'] + [1e-4])
    hs = [fixed_head(n) for n in nodes if n['fixed']] or [0.0]
    best, bestn = None, np.inf
    rng = random.Random(20260811)
    for attempt in range(60):
        v0 = np.zeros(N + E)
        for i, e in enumerate(edges):
            v0[i] = scale * (0.3 if attempt == 0 else rng.uniform(-1.5, 1.5))
        for k in range(N):
            v0[E + k] = (sum(hs) / len(hs)) * (1.0 if attempt == 0 else rng.uniform(0.5, 1.5))
        sol = root(residual, v0, method='hybr', tol=1e-14,
                   options={'xtol': 1e-14, 'maxfev': 40000})
        rn = float(np.max(np.abs(residual(sol.x))))
        if rn < bestn:
            bestn, best = rn, sol.x
        if bestn < 1e-13 * max(1.0, scale):
            break
    if not bestn < 1e-10 * max(1.0, scale, max(abs(np.array(hs)))):
        raise RuntimeError('reference newton did not converge: %g' % bestn)
    v = best
    return {'q': {e['id']: float(v[i]) for i, e in enumerate(edges)},
            'h': {n['id']: float(head(n, v)) for n in nodes},
            'residual': bestn}


# --------------------------------------------------------- Hardy Cross loops
def solve_hardy_cross(net, tol=1e-14, itmax=4000):
    """Classical loop-correction method; single fixed-head node only."""
    nodes, edges, fl = net['nodes'], net['edges'], net['fluid']
    fixed = [n for n in nodes if n['fixed']]
    if len(fixed) != 1:
        return None
    nid = {n['id']: n for n in nodes}
    ids = [n['id'] for n in nodes]
    E = len(edges)

    # spanning tree (BFS) over the undirected graph
    adj = {i: [] for i in ids}
    for k, e in enumerate(edges):
        adj[e['a']].append((e['b'], k))
        adj[e['b']].append((e['a'], k))
    root_id = fixed[0]['id']
    parent, parent_edge, order, seen = {}, {}, [], {root_id}
    stack = [root_id]
    tree = set()
    while stack:
        u = stack.pop()
        order.append(u)
        for v, k in adj[u]:
            if v not in seen:
                seen.add(v)
                parent[v], parent_edge[v] = u, k
                tree.add(k)
                stack.append(v)
    if len(seen) != len(ids):
        raise RuntimeError('network is not connected')
    chords = [k for k in range(E) if k not in tree]

    # fundamental loop of each chord: chord a->b plus the tree path b->a
    def path_to_root(x):
        out = []
        while x != root_id:
            out.append((parent_edge[x], x))
            x = parent[x]
        return out

    loops = []
    for k in chords:
        e = edges[k]
        pa, pb = path_to_root(e['a']), path_to_root(e['b'])
        sa = {t[0] for t in pa}
        sb = {t[0] for t in pb}
        common = sa & sb
        pa = [t for t in pa if t[0] not in common]
        pb = [t for t in pb if t[0] not in common]
        loop = [(k, +1)]
        # chord a->b, then back from b to the junction along the tree (child->parent,
        # i.e. against a stored parent->child edge), then out to a (parent->child)
        for ek, child in pb:
            ee = edges[ek]
            loop.append((ek, -1 if ee['b'] == child else +1))
        for ek, child in pa:
            ee = edges[ek]
            loop.append((ek, +1 if ee['b'] == child else -1))
        loops.append(loop)

    # continuity-feasible starting flows: chords carry an arbitrary flow, the
    # tree is then solved leaf-inwards
    q = np.zeros(E)
    scale = max([abs(n['demand']) / 3600.0 for n in nodes] + [1e-4])
    for k in chords:
        q[k] = 0.37 * scale
    for u in reversed(order):
        if u == root_id:
            continue
        k = parent_edge[u]
        e = edges[k]
        net_in = -nid[u]['demand'] * fl['load'] / 3600.0
        for kk, ee in enumerate(edges):
            if kk == k:
                continue
            if ee['b'] == u:
                net_in += q[kk]
            if ee['a'] == u:
                net_in -= q[kk]
        q[k] = -net_in if e['b'] == u else net_in

    for it in range(itmax):
        worst = 0.0
        for loop in loops:
            num = 0.0
            den = 0.0
            for k, s in loop:
                e = edges[k]
                hl = -edge_head(e, q[k], fl)          # loss - pump, in loop sense
                num += s * hl
                dq = 1e-8 * max(1.0, abs(q[k]))
                der = (-edge_head(e, q[k] + dq, fl) + edge_head(e, q[k] - dq, fl)) / (2 * dq)
                den += abs(der)
            if den <= 0:
                continue
            dQ = -num / den
            worst = max(worst, abs(num))
            for k, s in loop:
                q[k] += s * dQ
        if worst < tol:
            break
    # recover heads from the tree
    h = {root_id: fixed[0]['p'] * 1000.0 / (fl['rho'] * G)}
    for u in order:
        if u == root_id:
            continue
        k = parent_edge[u]
        e = edges[k]
        p = parent[u]
        if e['a'] == p:
            h[u] = h[p] + nid[p]['z'] + edge_head(e, q[k], fl) - nid[u]['z']
        else:
            h[u] = h[p] + nid[p]['z'] - edge_head(e, -q[k], fl) - nid[u]['z']
    return {'q': {e['id']: float(q[i]) for i, e in enumerate(edges)},
            'h': {k: float(v) for k, v in h.items()},
            'loop_imbalance': worst, 'iterations': it, 'loops': len(loops)}


# --------------------------------------------------------------- hand solutions
def pipe_q_for_head(e, dh, fl):
    """Flow through one pipe for a given available head, by 1-D root finding."""
    if dh <= 0:
        return 0.0
    f = lambda q: edge_loss(e, q, fl) - dh
    hi = 1e-6
    while f(hi) < 0 and hi < 1e4:
        hi *= 2
    return brentq(f, 0.0, hi, xtol=1e-16, rtol=8.9e-16)


# ------------------------------------------------------------------- networks
def node(i, **kw):
    d = dict(id=i, name=i, x=100, y=100, z=0.0, demand=0.0, fixed=False, p=0.0)
    d.update(kw)
    return d


def pipe(i, a, b, L, D, eps=0.045, K=0.0):
    return dict(id=i, name=i, type='pipe', a=a, b=b, L=L, D=D, eps=eps, K=K)


FLUID = dict(rho=998.0, nu=1.004e-6, load=1.0, speed=1.0)


def NET(nodes, edges, fluid=None):
    return dict(nodes=nodes, edges=edges, fluid=dict(fluid or FLUID))


def build_cases():
    C = []

    # 1 ------- one pipe between two prescribed pressures (hand solution)
    n = [node('N1', fixed=True, p=400.0, x=150, y=300),
         node('N2', fixed=True, p=100.0, x=650, y=300)]
    e = [pipe('E1', 'N1', 'N2', L=120.0, D=80.0, eps=0.045, K=4.5)]
    C.append(('single_pipe_two_reservoirs',
              'One pipe between two prescribed pressures. Hand solution: '
              '(f L/D + K) v^2/(2 g) = dp/(rho g), solved for q by bisection.',
              NET(n, e), 'analytic'))

    # 2 ------- two pipes in series
    n = [node('N1', fixed=True, p=500.0, x=120, y=300),
         node('N2', x=400, y=300),
         node('N3', fixed=True, p=120.0, z=6.0, x=680, y=300)]
    e = [pipe('E1', 'N1', 'N2', L=80.0, D=100.0, K=2.0),
         pipe('E2', 'N2', 'N3', L=140.0, D=65.0, K=6.0)]
    C.append(('series_two_pipes',
              'Two pipes in series between prescribed pressures with an elevation '
              'change. Hand solution: the same q in both, total loss = available head.',
              NET(n, e), 'analytic'))

    # 3 ------- two pipes in parallel
    n = [node('N1', fixed=True, p=450.0, x=150, y=300),
         node('N2', fixed=True, p=150.0, x=650, y=300)]
    e = [pipe('E1', 'N1', 'N2', L=90.0, D=65.0, K=3.0),
         pipe('E2', 'N1', 'N2', L=150.0, D=50.0, K=1.5)]
    C.append(('parallel_two_pipes',
              'Two pipes in parallel between the same prescribed pressures: each '
              'carries the flow its own resistance allows for the identical head.',
              NET(n, e), 'analytic'))

    # 4 ------- series/parallel combination
    n = [node('N1', fixed=True, p=520.0, x=120, y=300),
         node('N2', x=380, y=300),
         node('N3', fixed=True, p=140.0, x=680, y=300)]
    e = [pipe('E1', 'N1', 'N2', L=60.0, D=100.0, K=2.0),
         pipe('E2', 'N2', 'N3', L=110.0, D=65.0, K=4.0),
         pipe('E3', 'N2', 'N3', L=180.0, D=50.0, K=2.5)]
    C.append(('series_parallel',
              'One pipe in series with two parallel pipes. Hand solution: nested '
              '1-D root finding on the junction head.',
              NET(n, e), 'analytic'))

    # 5 ------- pump operating point against one pipe and a static lift
    n = [node('N1', fixed=True, p=0.0, z=0.0, x=120, y=300),
         node('N2', x=380, y=300),
         node('N3', fixed=True, p=0.0, z=15.0, x=680, y=300)]
    e = [dict(id='E1', name='E1', type='pump', a='N1', b='N2',
              H0=32.0, Qrated=40.0, Hrated=24.0, speed=100.0),
         pipe('E2', 'N2', 'N3', L=90.0, D=80.0, K=5.0)]
    C.append(('pump_operating_point',
              'Pump lifting through one pipe to a 15 m higher open tank. Hand '
              'solution: H0 - a q^2 = dz + (f L/D + K) v^2/(2 g).',
              NET(n, e), 'analytic'))

    # 6 ------- valve alone (exact closed form)
    n = [node('N1', fixed=True, p=300.0, x=150, y=300),
         node('N2', fixed=True, p=180.0, x=650, y=300)]
    e = [dict(id='E1', name='E1', type='valve', a='N1', b='N2',
              Kv=14.0, opening=100.0, law='linear', target=0.0)]
    C.append(('valve_kv_closed_form',
              'A single valve between prescribed pressures: Q[m3/h] = Kv sqrt(dp[bar]/SG) '
              'is exact, no iteration needed.',
              NET(n, e), 'analytic'))

    # 7 ------- heat exchanger alone (exact closed form)
    n = [node('N1', fixed=True, p=260.0, x=150, y=300),
         node('N2', fixed=True, p=200.0, x=650, y=300)]
    e = [dict(id='E1', name='E1', type='hx', a='N1', b='N2',
              Qdesign=10.0, dpDesign=25.0, n=1.85)]
    C.append(('hx_power_law_closed_form',
              'A single heat exchanger between prescribed pressures: '
              'Q = Qd (dp/dp_design)^(1/n) is exact.',
              NET(n, e), 'analytic'))

    # 8 ------- one loop, hand-checkable
    n = [node('N1', fixed=True, p=600.0, x=120, y=300),
         node('N2', x=380, y=180),
         node('N3', x=380, y=420),
         node('N4', demand=25.0, x=650, y=300)]
    e = [pipe('E1', 'N1', 'N2', L=70.0, D=80.0, K=2.0),
         pipe('E2', 'N1', 'N3', L=95.0, D=65.0, K=2.0),
         pipe('E3', 'N2', 'N4', L=85.0, D=80.0, K=1.0),
         pipe('E4', 'N3', 'N4', L=60.0, D=65.0, K=1.0)]
    C.append(('single_loop',
              'One loop: two parallel branches from a reservoir to a 25 m3/h '
              'demand. Solved by Hardy Cross and by the nodal Newton solver.',
              NET(n, e), 'both'))

    # 9 ------- classic two-loop Hardy Cross network
    n = [node('A', fixed=True, p=550.0, x=120, y=150),
         node('B', demand=30.0, x=420, y=150),
         node('C', demand=20.0, x=720, y=150),
         node('D', demand=25.0, x=120, y=450),
         node('E', demand=35.0, x=420, y=450),
         node('F', demand=15.0, x=720, y=450)]
    e = [pipe('P1', 'A', 'B', L=300.0, D=150.0, K=0.0),
         pipe('P2', 'B', 'C', L=250.0, D=100.0, K=0.0),
         pipe('P3', 'A', 'D', L=200.0, D=125.0, K=0.0),
         pipe('P4', 'B', 'E', L=200.0, D=100.0, K=0.0),
         pipe('P5', 'C', 'F', L=200.0, D=80.0, K=0.0),
         pipe('P6', 'D', 'E', L=300.0, D=125.0, K=0.0),
         pipe('P7', 'E', 'F', L=250.0, D=80.0, K=0.0)]
    C.append(('hardy_cross_two_loop',
              'Classic two-loop distribution grid (one source, five demands, two '
              'independent loops) in the Hardy Cross textbook arrangement.',
              NET(n, e), 'both'))

    # 10 ------ the shipped example network of the page
    n = [node('N1', name='Plant return', x=135, y=340, fixed=True, p=150.0),
         node('N2', name='Pump discharge', x=300, y=340),
         node('N3', name='Supply header', x=470, y=220, z=4.0),
         node('N4', name='Branch A', x=710, y=155, z=7.0),
         node('N5', name='Branch B', x=710, y=340, z=3.0),
         node('N6', name='Return header', x=470, y=475, z=1.0)]
    e = [dict(id='E1', name='P-101', type='pump', a='N1', b='N2', H0=20.0, Qrated=12.0, Hrated=13.0, speed=100.0),
         pipe('E2', 'N2', 'N3', L=38.0, D=65.0, K=3.0),
         pipe('E3', 'N3', 'N4', L=48.0, D=40.0, K=5.0),
         dict(id='E4', name='A coil', type='hx', a='N4', b='N6', Qdesign=4.2, dpDesign=22.0, n=2.0),
         pipe('E5', 'N3', 'N5', L=36.0, D=50.0, K=4.0),
         dict(id='E6', name='B control valve', type='valve', a='N5', b='N6', Kv=8.0, opening=100.0, law='linear', target=5.8),
         pipe('E7', 'N6', 'N1', L=42.0, D=65.0, K=4.0)]
    C.append(('shipped_example_network',
              'The example network shipped with the page: pump, four pipes, a heat '
              'exchanger and a control valve in a closed circulating loop.',
              NET(n, e), 'both'))

    # 10b ----- same network with the valve throttled (monotonicity)
    for op in (60.0, 30.0, 10.0):
        e2 = [dict(x) for x in e]
        e2[5] = dict(e2[5], opening=op)
        C.append(('example_valve_%d' % int(op),
                  'The example network with the control valve throttled to %g %% '
                  'opening; the branch flow must fall monotonically.' % op,
                  NET([dict(x) for x in n], e2), 'newton'))

    # 11 ------ randomly generated meshed networks
    rng = random.Random(4711)
    for case in range(4):
        nn = 7 + case
        nodes = [node('R', fixed=True, p=500.0 + 40 * case, x=100, y=100)]
        for i in range(1, nn):
            nodes.append(node('V%d' % i, demand=round(rng.uniform(2.0, 22.0), 3),
                              z=round(rng.uniform(0.0, 8.0), 2),
                              x=90 + (i % 5) * 180, y=90 + (i // 5) * 180))
        edges, k = [], 1
        for i in range(1, nn):                     # spanning tree
            j = rng.randrange(0, i)
            edges.append(pipe('P%d' % k, nodes[j]['id'], nodes[i]['id'],
                              L=round(rng.uniform(40.0, 320.0), 1),
                              D=float(rng.choice([50, 65, 80, 100, 125, 150])),
                              eps=float(rng.choice([0.0015, 0.045, 0.15, 0.5])),
                              K=round(rng.uniform(0.0, 6.0), 2)))
            k += 1
        chords = 0
        while chords < 2 + case:                   # add meshes
            a, b = rng.randrange(0, nn), rng.randrange(0, nn)
            if a == b:
                continue
            if any((x['a'], x['b']) in ((nodes[a]['id'], nodes[b]['id']),
                                        (nodes[b]['id'], nodes[a]['id'])) for x in edges):
                continue
            edges.append(pipe('P%d' % k, nodes[a]['id'], nodes[b]['id'],
                              L=round(rng.uniform(40.0, 320.0), 1),
                              D=float(rng.choice([50, 65, 80, 100, 125])),
                              eps=0.045, K=round(rng.uniform(0.0, 4.0), 2)))
            k += 1
            chords += 1
        C.append(('random_mesh_%d' % case,
                  'Randomly generated meshed network, seed 4711, %d nodes / %d pipes, '
                  'one source and %d demands.' % (nn, len(edges), nn - 1),
                  NET(nodes, edges), 'both'))
    return C


# --------------------------------------------------------------- hand solutions
def analytic(cid, net):
    fl = net['fluid']
    nid = {n['id']: n for n in net['nodes']}
    ed = {e['id']: e for e in net['edges']}
    hh = lambda i: nid[i]['p'] * 1000.0 / (fl['rho'] * G) + nid[i]['z']

    if cid == 'single_pipe_two_reservoirs':
        q = pipe_q_for_head(ed['E1'], hh('N1') - hh('N2'), fl)
        return {'E1': q}
    if cid == 'series_two_pipes':
        avail = hh('N1') - hh('N3')
        f = lambda q: edge_loss(ed['E1'], q, fl) + edge_loss(ed['E2'], q, fl) - avail
        hi = 1e-6
        while f(hi) < 0:
            hi *= 2
        return {'E1': brentq(f, 0, hi, xtol=1e-16, rtol=8.9e-16)} | \
               {'E2': brentq(f, 0, hi, xtol=1e-16, rtol=8.9e-16)}
    if cid == 'parallel_two_pipes':
        dh = hh('N1') - hh('N2')
        return {'E1': pipe_q_for_head(ed['E1'], dh, fl),
                'E2': pipe_q_for_head(ed['E2'], dh, fl)}
    if cid == 'series_parallel':
        def imbalance(h2):
            q1 = pipe_q_for_head(ed['E1'], hh('N1') - h2, fl)
            dh = h2 - hh('N3')
            return q1 - pipe_q_for_head(ed['E2'], dh, fl) - pipe_q_for_head(ed['E3'], dh, fl)
        h2 = brentq(imbalance, hh('N3') + 1e-12, hh('N1') - 1e-12, xtol=1e-15, rtol=8.9e-16)
        dh = h2 - hh('N3')
        return {'E1': pipe_q_for_head(ed['E1'], hh('N1') - h2, fl),
                'E2': pipe_q_for_head(ed['E2'], dh, fl),
                'E3': pipe_q_for_head(ed['E3'], dh, fl)}
    if cid == 'pump_operating_point':
        pu, pi = ed['E1'], ed['E2']
        static = hh('N3') - hh('N1')
        f = lambda q: edge_pump(pu, q, fl) - static - edge_loss(pi, q, fl)
        hi = pu['Qrated'] / 3600.0 * 4
        return {'E1': brentq(f, 0, hi, xtol=1e-16, rtol=8.9e-16),
                'E2': brentq(f, 0, hi, xtol=1e-16, rtol=8.9e-16)}
    if cid == 'valve_kv_closed_form':
        dp_bar = (nid['N1']['p'] - nid['N2']['p']) / 100.0
        sg = fl['rho'] / 1000.0
        return {'E1': kv_eff(ed['E1']) * math.sqrt(dp_bar / sg) / 3600.0}
    if cid == 'hx_power_law_closed_form':
        e = ed['E1']
        dp = (nid['N1']['p'] - nid['N2']['p']) * 1000.0
        return {'E1': (e['Qdesign'] / 3600.0) * (dp / (e['dpDesign'] * 1000.0)) ** (1.0 / e['n'])}
    return None


def main():
    out = []
    for cid, note, net, kind in build_cases():
        rec = {'id': cid, 'note': note, 'net': net}
        nw = solve_newton(net)
        rec['newton'] = nw
        cross = None
        if kind in ('both',):
            hc = solve_hardy_cross(net)
            if hc:
                rec['hardy_cross'] = hc
                cross = max(abs(hc['q'][k] - nw['q'][k]) for k in nw['q'])
        an = analytic(cid, net) if kind == 'analytic' else None
        if an:
            rec['analytic'] = an
            cross = max(abs(an[k] - nw['q'][k]) for k in an)
        rec['crosscheck_max_abs_q_m3s'] = cross
        out.append(rec)
        qs = ', '.join('%s=%.6f' % (k, v * 3600) for k, v in list(nw['q'].items())[:4])
        print('%-28s res=%.2e cross=%s  %s' % (cid, nw['residual'],
              ('%.2e' % cross) if cross is not None else '   -   ', qs))
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hydraulicnetwork_ref.json')
    json.dump({'generator': 'gen_hydraulicnetwork.py', 'cases': out}, open(p, 'w'))
    print('wrote', p, os.path.getsize(p), 'bytes')


if __name__ == '__main__':
    main()
