#!/usr/bin/env python3
"""
Independent reference for ductnetwork.html
====================================================
The same two structurally independent python solvers used for the hydraulic
network (a simultaneous nodal Newton via scipy.optimize.root on the unscaled
residuals, and a classical Hardy Cross loop-correction solver), rewritten for
the duct component laws, plus closed-form hand solutions.

Component equations (as documented by the page; heads are metres of air column,
h = p_total_gauge / (rho g)):
  duct    h = (f L/Dh + K) v^2/(2 g),  v = q/A,  Re = v Dh/nu
          rect: A = W H, Dh = 2WH/(W+H);  round: A = pi D^2/4, Dh = D
          f = 64/Re (Re<=2000), Swamee-Jain (Re>=4000), smoothstep blend between
  tee     h = K v^2/(2 g) on that arm (no friction term)
  damper  h = (dp_design/(rho g)) (q/q_design)^2 / c^2,
          c = opening/100 (linear) or 50^(o-1) (equal percentage)
  grille  h = (dp_design/(rho g)) (q/q_design)^n
  fan     h = [P0 s^2 - a q|q|]/(rho g),  a = (P0 - P_rated)/q_rated^2
Edge energy:  h_a + z_a - h_b - z_b + h_fan(q) - h_loss(q) = 0
Node continuity: inflows - outflows - demand = 0

Writes bench-src/ref/ductnetwork_ref.json.
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


def opening_factor(e):
    o = min(1.0, max(0.001, e['opening'] / 100.0))
    return 50.0 ** (o - 1) if e.get('law') == 'equal' else o


def area_dh(e):
    if e.get('shape') == 'round':
        D = e['D'] / 1000.0
        return math.pi * D * D / 4, D
    W, H = e['W'] / 1000.0, e['H'] / 1000.0
    return W * H, 2 * W * H / (W + H)


def edge_loss(e, q, fl):
    """Signed total-pressure loss as metres of air column."""
    aq = abs(q)
    if e['type'] in ('duct', 'tee'):
        A, Dh = area_dh(e)
        v = aq / A
        Re = v * Dh / fl['nu']
        if e['type'] == 'duct':
            f = darcy_f(Re, e['eps'] / 1000.0 / Dh)
            coeff = f * e['L'] / Dh + e['K']
        else:
            coeff = e['K']
        loss = coeff * v * v / (2 * G)
    elif e['type'] == 'damper':
        c = opening_factor(e)
        loss = (e['dpDesign'] / (fl['rho'] * G)) * (aq / (e['Qdesign'] / 3600.0)) ** 2 / (c * c)
    elif e['type'] == 'grille':
        loss = (e['dpDesign'] / (fl['rho'] * G)) * (aq / (e['Qdesign'] / 3600.0)) ** e['n']
    elif e['type'] == 'fan':
        loss = 0.0
    else:
        raise ValueError(e['type'])
    return math.copysign(loss, q) if q != 0 else 0.0


def edge_pump(e, q, fl):
    if e['type'] != 'fan':
        return 0.0
    qr = e['Qrated'] / 3600.0
    a = (e['P0'] - e['Prated']) / (qr * qr)
    s = e['speed'] / 100.0 * fl['speed']
    return (e['P0'] * s * s - a * q * abs(q)) / (fl['rho'] * G)


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
        return n['p'] / (fl['rho'] * G)

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
                [e['Qrated'] / 3600.0 for e in edges if e['type'] == 'fan'] + [1e-4])
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
    h = {root_id: fixed[0]['p'] / (fl['rho'] * G)}
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


def duct(i, a, b, L, W=None, H=None, D=None, eps=0.09, K=0.0):
    if D is not None:
        return dict(id=i, name=i, type='duct', a=a, b=b, shape='round',
                    L=L, W=500, H=300, D=D, eps=eps, K=K)
    return dict(id=i, name=i, type='duct', a=a, b=b, shape='rect',
                L=L, W=W, H=H, D=400, eps=eps, K=K)


AIR = dict(rho=1.204, nu=1.5e-5, load=1.0, speed=1.0)


def NET(nodes, edges, fluid=None):
    return dict(nodes=nodes, edges=edges, fluid=dict(fluid or AIR))


def build_cases():
    C = []

    # 1 ---- one rectangular duct between two prescribed total pressures
    n = [node('N1', fixed=True, p=400.0, x=150, y=300),
         node('N2', fixed=True, p=0.0, x=650, y=300)]
    e = [duct('E1', 'N1', 'N2', L=25.0, W=500, H=300, eps=0.09, K=2.4)]
    C.append(('single_rect_duct',
              'One rectangular duct between prescribed gauge total pressures. Hand '
              'solution: (f L/Dh + K) v^2/(2 g) = dp/(rho g), Dh = 2WH/(W+H).',
              NET(n, e), 'analytic'))

    # 2 ---- one circular duct
    n = [node('N1', fixed=True, p=250.0, x=150, y=300),
         node('N2', fixed=True, p=0.0, x=650, y=300)]
    e = [duct('E1', 'N1', 'N2', L=40.0, D=400, eps=0.09, K=1.2)]
    C.append(('single_round_duct',
              'One circular duct, Dh = D. Same hand solution.',
              NET(n, e), 'analytic'))

    # 3 ---- two ducts in series
    n = [node('N1', fixed=True, p=600.0, x=120, y=300),
         node('N2', x=400, y=300),
         node('N3', fixed=True, p=0.0, x=680, y=300)]
    e = [duct('E1', 'N1', 'N2', L=15.0, W=700, H=400, K=1.0),
         duct('E2', 'N2', 'N3', L=22.0, D=355, K=2.0)]
    C.append(('series_two_ducts',
              'Rectangular and circular duct in series. Hand solution: identical '
              'flow, total loss equals the available pressure.',
              NET(n, e), 'analytic'))

    # 4 ---- two ducts in parallel
    n = [node('N1', fixed=True, p=320.0, x=150, y=300),
         node('N2', fixed=True, p=0.0, x=650, y=300)]
    e = [duct('E1', 'N1', 'N2', L=18.0, W=400, H=250, K=1.5),
         duct('E2', 'N1', 'N2', L=30.0, D=315, K=0.8)]
    C.append(('parallel_two_ducts',
              'Two ducts in parallel across the same pressure difference.',
              NET(n, e), 'analytic'))

    # 5 ---- fan operating point against one duct and a grille
    n = [node('N1', fixed=True, p=0.0, x=120, y=300),
         node('N2', x=380, y=300),
         node('N3', fixed=True, p=0.0, x=680, y=300)]
    e = [dict(id='E1', name='E1', type='fan', a='N1', b='N2',
              P0=700.0, Qrated=6000.0, Prated=430.0, speed=100.0),
         duct('E2', 'N2', 'N3', L=30.0, W=600, H=350, K=3.0)]
    C.append(('fan_operating_point',
              'Fan against one duct between ambient and ambient. Hand solution: '
              'P0 s^2 - a q^2 = rho g (f L/Dh + K) v^2/(2 g).',
              NET(n, e), 'analytic'))

    # 6 ---- grille alone (closed form)
    n = [node('N1', fixed=True, p=45.0, x=150, y=300),
         node('N2', fixed=True, p=0.0, x=650, y=300)]
    e = [dict(id='E1', name='E1', type='grille', a='N1', b='N2',
              Qdesign=2400.0, dpDesign=45.0, n=1.9)]
    C.append(('grille_closed_form',
              'A grille alone: Q = Qd (dp/dp_design)^(1/n) is exact.',
              NET(n, e), 'analytic'))

    # 7 ---- damper alone (closed form, both laws)
    n = [node('N1', fixed=True, p=55.0, x=150, y=300),
         node('N2', fixed=True, p=0.0, x=650, y=300)]
    e = [dict(id='E1', name='E1', type='damper', a='N1', b='N2',
              Qdesign=2800.0, dpDesign=55.0, opening=45.0, law='equal', target=0.0)]
    C.append(('damper_equal_percentage_closed_form',
              'An equal-percentage damper alone: Q = Qd c sqrt(dp/dp_design) with '
              'c = 50^(o-1) is exact.',
              NET(n, e), 'analytic'))

    # 8 ---- tee arm (pure K, no friction)
    n = [node('N1', fixed=True, p=80.0, x=150, y=300),
         node('N2', fixed=True, p=0.0, x=650, y=300)]
    e = [dict(id='E1', name='E1', type='tee', a='N1', b='N2',
              shape='rect', W=450, H=300, D=400, K=1.15)]
    C.append(('tee_arm_closed_form',
              'A tee/fitting arm carries only K v^2/(2 g), no friction term: '
              'v = sqrt(2 dp/(rho K)) exactly.',
              NET(n, e), 'analytic'))

    # 9 ---- one loop
    n = [node('N1', fixed=True, p=500.0, x=120, y=300),
         node('N2', x=380, y=180),
         node('N3', x=380, y=420),
         node('N4', demand=4000.0, x=650, y=300)]
    e = [duct('E1', 'N1', 'N2', L=12.0, W=500, H=300, K=1.0),
         duct('E2', 'N1', 'N3', L=16.0, D=355, K=1.0),
         duct('E3', 'N2', 'N4', L=14.0, W=500, H=300, K=0.6),
         duct('E4', 'N3', 'N4', L=10.0, D=355, K=0.6)]
    C.append(('single_loop',
              'One loop: two parallel duct runs from a plenum to a 4000 m3/h '
              'extract. Solved by Hardy Cross and by the nodal Newton solver.',
              NET(n, e), 'both'))

    # 10 --- classic two-loop grid
    n = [node('A', fixed=True, p=900.0, x=120, y=150),
         node('B', demand=1800.0, x=420, y=150),
         node('C', demand=1200.0, x=720, y=150),
         node('D', demand=1500.0, x=120, y=450),
         node('E', demand=2100.0, x=420, y=450),
         node('F', demand=900.0, x=720, y=450)]
    e = [duct('P1', 'A', 'B', L=20.0, W=800, H=400),
         duct('P2', 'B', 'C', L=18.0, W=500, H=300),
         duct('P3', 'A', 'D', L=14.0, D=630),
         duct('P4', 'B', 'E', L=16.0, D=400),
         duct('P5', 'C', 'F', L=15.0, W=400, H=250),
         duct('P6', 'D', 'E', L=22.0, D=560),
         duct('P7', 'E', 'F', L=19.0, W=400, H=250)]
    C.append(('hardy_cross_two_loop',
              'Classic two-loop distribution grid (one plenum, five extracts, two '
              'independent loops) in the Hardy Cross textbook arrangement.',
              NET(n, e), 'both'))

    # 11 --- the shipped example network of the page
    n = [node('N1', name='Fan inlet / ambient', x=100, y=350, fixed=True, p=0.0),
         node('N2', name='Fan discharge', x=250, y=350),
         node('N3', name='Supply junction', x=420, y=300),
         node('N4', name='A arm', x=575, y=170),
         node('N5', name='A damper out', x=720, y=170),
         node('N6', name='B arm', x=575, y=390),
         node('N7', name='B damper out', x=720, y=390),
         node('N8', name='Room / ambient', x=890, y=285, fixed=True, p=0.0)]
    e = [dict(id='E1', name='SF-101', type='fan', a='N1', b='N2', P0=700.0, Qrated=6000.0, Prated=430.0, speed=100.0),
         dict(id='E2', name='Main duct', type='duct', a='N2', b='N3', shape='rect', L=18.0, W=700, H=400, D=500, eps=0.09, K=1.5),
         dict(id='E3', name='Tee branch A', type='tee', a='N3', b='N4', shape='rect', W=450, H=300, D=400, K=1.15),
         dict(id='E4', name='A damper', type='damper', a='N4', b='N5', Qdesign=2800.0, dpDesign=55.0, opening=100.0, law='linear', target=2400.0),
         dict(id='E5', name='A grille', type='grille', a='N5', b='N8', Qdesign=2400.0, dpDesign=45.0, n=2.0),
         dict(id='E6', name='Tee run B', type='tee', a='N3', b='N6', shape='rect', W=500, H=300, D=400, K=0.65),
         dict(id='E7', name='B damper', type='damper', a='N6', b='N7', Qdesign=3200.0, dpDesign=50.0, opening=100.0, law='linear', target=2800.0),
         dict(id='E8', name='B grille', type='grille', a='N7', b='N8', Qdesign=2800.0, dpDesign=40.0, n=2.0)]
    C.append(('shipped_example_network',
              'The example network shipped with the page: fan, main duct, two tee '
              'arms, two dampers and two grilles discharging to ambient.',
              NET(n, e), 'both'))

    for op in (60.0, 30.0, 10.0):
        e2 = [dict(x) for x in e]
        e2[3] = dict(e2[3], opening=op)
        C.append(('example_damper_%d' % int(op),
                  'The example network with damper A throttled to %g %% opening; '
                  'that branch must lose flow monotonically.' % op,
                  NET([dict(x) for x in n], e2), 'newton'))

    # 12 --- randomly generated meshed duct networks
    rng = random.Random(90210)
    for case in range(4):
        nn = 7 + case
        nodes = [node('R', fixed=True, p=700.0 + 80 * case, x=100, y=100)]
        for i in range(1, nn):
            nodes.append(node('V%d' % i, demand=round(rng.uniform(200.0, 2500.0), 1),
                              z=round(rng.uniform(0.0, 6.0), 2),
                              x=90 + (i % 5) * 180, y=90 + (i // 5) * 180))
        edges, k = [], 1
        for i in range(1, nn):
            j = rng.randrange(0, i)
            if rng.random() < 0.5:
                edges.append(duct('P%d' % k, nodes[j]['id'], nodes[i]['id'],
                                  L=round(rng.uniform(4.0, 40.0), 1),
                                  D=float(rng.choice([200, 250, 315, 400, 500])),
                                  eps=float(rng.choice([0.03, 0.09, 0.9])),
                                  K=round(rng.uniform(0.0, 3.0), 2)))
            else:
                edges.append(duct('P%d' % k, nodes[j]['id'], nodes[i]['id'],
                                  L=round(rng.uniform(4.0, 40.0), 1),
                                  W=float(rng.choice([300, 400, 500, 700])),
                                  H=float(rng.choice([200, 250, 300, 400])),
                                  eps=0.09, K=round(rng.uniform(0.0, 3.0), 2)))
            k += 1
        chords = 0
        while chords < 2 + case:
            a, b = rng.randrange(0, nn), rng.randrange(0, nn)
            if a == b:
                continue
            if any((x['a'], x['b']) in ((nodes[a]['id'], nodes[b]['id']),
                                        (nodes[b]['id'], nodes[a]['id'])) for x in edges):
                continue
            edges.append(duct('P%d' % k, nodes[a]['id'], nodes[b]['id'],
                              L=round(rng.uniform(4.0, 40.0), 1),
                              D=float(rng.choice([200, 250, 315, 400])),
                              eps=0.09, K=round(rng.uniform(0.0, 3.0), 2)))
            k += 1
            chords += 1
        C.append(('random_mesh_%d' % case,
                  'Randomly generated meshed duct network, seed 90210, %d nodes / '
                  '%d components, one plenum and %d extracts.' % (nn, len(edges), nn - 1),
                  NET(nodes, edges), 'both'))
    return C


# --------------------------------------------------------------- hand solutions
def duct_q_for_head(e, dh, fl):
    if dh <= 0:
        return 0.0
    f = lambda q: edge_loss(e, q, fl) - dh
    hi = 1e-6
    while f(hi) < 0 and hi < 1e6:
        hi *= 2
    return brentq(f, 0.0, hi, xtol=1e-16, rtol=8.9e-16)


def analytic(cid, net):
    fl = net['fluid']
    nid = {n['id']: n for n in net['nodes']}
    ed = {e['id']: e for e in net['edges']}
    hh = lambda i: nid[i]['p'] / (fl['rho'] * G) + nid[i]['z']

    if cid in ('single_rect_duct', 'single_round_duct'):
        return {'E1': duct_q_for_head(ed['E1'], hh('N1') - hh('N2'), fl)}
    if cid == 'series_two_ducts':
        avail = hh('N1') - hh('N3')
        f = lambda q: edge_loss(ed['E1'], q, fl) + edge_loss(ed['E2'], q, fl) - avail
        hi = 1e-6
        while f(hi) < 0:
            hi *= 2
        q = brentq(f, 0, hi, xtol=1e-16, rtol=8.9e-16)
        return {'E1': q, 'E2': q}
    if cid == 'parallel_two_ducts':
        dh = hh('N1') - hh('N2')
        return {'E1': duct_q_for_head(ed['E1'], dh, fl),
                'E2': duct_q_for_head(ed['E2'], dh, fl)}
    if cid == 'fan_operating_point':
        fa, dc = ed['E1'], ed['E2']
        static = hh('N3') - hh('N1')
        f = lambda q: edge_pump(fa, q, fl) - static - edge_loss(dc, q, fl)
        hi = fa['Qrated'] / 3600.0 * 5
        q = brentq(f, 0, hi, xtol=1e-16, rtol=8.9e-16)
        return {'E1': q, 'E2': q}
    if cid == 'grille_closed_form':
        e = ed['E1']
        dp = nid['N1']['p'] - nid['N2']['p']
        return {'E1': (e['Qdesign'] / 3600.0) * (dp / e['dpDesign']) ** (1.0 / e['n'])}
    if cid == 'damper_equal_percentage_closed_form':
        e = ed['E1']
        dp = nid['N1']['p'] - nid['N2']['p']
        c = opening_factor(e)
        return {'E1': (e['Qdesign'] / 3600.0) * c * math.sqrt(dp / e['dpDesign'])}
    if cid == 'tee_arm_closed_form':
        e = ed['E1']
        dp = nid['N1']['p'] - nid['N2']['p']
        A, _ = area_dh(e)
        v = math.sqrt(2 * dp / (fl['rho'] * e['K']))
        return {'E1': v * A}
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
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ductnetwork_ref.json')
    json.dump({'generator': 'gen_ductnetwork.py', 'cases': out}, open(p, 'w'))
    print('wrote', p, os.path.getsize(p), 'bytes')


if __name__ == '__main__':
    main()
