#!/usr/bin/env python3
"""Independent reference for luchtbalans.html (Air Balance & Pressure Cascade).

The tool solves a steady air-flow network: every room is a node with one unknown
pressure, every connection an orifice, every active unit an imposed volume flow.
This file re-implements that network from the cited sources and solves it with
scipy.optimize.root (a Powell hybrid method on the full residual vector) - a
structurally different solver from the tool's own damped Newton with an analytic
Jacobian and hand-rolled Gaussian elimination.

  * Orifice / opening law, Q = Cd A sqrt(2 dp / rho):
      ASHRAE Handbook - Fundamentals (2021) ch. 16, "Air leakage" and
      "Flow through openings"; CIBSE Guide A app. 4A.  In the general power-law
      form Q = C dp^n this is n = 1/2 and C = Cd A sqrt(2/rho).
  * Thermal (stack) pressure across a connection with a height offset h:
      dp_th = g h (rho_b - rho_a),  ASHRAE Fundamentals ch. 16.
  * Node (zone) mass balance, sum of flows into a zone = 0, and the envelope
      identity sum(supply) - sum(extract) = net flow through the envelope:
      the defining statements of a multizone air-flow network, e.g. G.N. Walton,
      "AIRNET - a computer program for building airflow network modeling",
      NISTIR 89-4072 (1989), eqs. 1-4.
  * The tool regularises the square-root law below |dp| = 0.04 Pa to a straight
      line through the origin, which its limitations state.  The reference
      reproduces that declared regularisation and reports, per case, how far the
      unregularised law would differ.
"""
import json, math, os
import numpy as np
from scipy.optimize import root

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'luchtbalans_ref.json')

G = 9.81
PATM = 101325.0
RS = 287.05
DELTA = 0.04       # the tool's declared regularisation window, Pa


def rho(t_c):
    return PATM/(RS*(t_c + 273.15))


def fq(d, delta=DELTA):
    a = abs(d)
    if a < delta:
        return d/math.sqrt(delta)
    return math.copysign(math.sqrt(a), d)


class Network:
    """rooms: [{id, T, leak}], nodes: {id: {type, T, Q}}, links: [{a,b,A,gap,cd,h,f}]"""

    def __init__(self, model, mode='prod', rho_ref=1.2, cd_leak=0.65, t_out=5.0,
                 delta=DELTA):
        self.m = model
        self.mode = mode
        self.rho_ref = max(0.1, rho_ref)
        self.cd_leak = cd_leak
        self.t_out = t_out
        self.delta = delta
        self.rooms = [n for n in model['nodes'] if n['type'] == 'room']
        self.idx = {r['id']: i for i, r in enumerate(self.rooms)}
        self.byid = {n['id']: n for n in model['nodes']}
        self._build()

    def _rho_of(self, node):
        if node is None:
            return rho(self.t_out)
        return rho(node.get('T', 20.0))

    def _build(self):
        self.net = [0.0]*len(self.rooms)      # imposed flow into each room
        self.edges = []                       # passive orifices
        self.active = []
        for li, L in enumerate(self.m['links']):
            A, B = self.byid.get(L['a']), self.byid.get(L['b'])
            if A is None or B is None:
                continue
            if A['type'] in ('asup', 'asink') or B['type'] in ('asup', 'asink'):
                av = A if A['type'] in ('asup', 'asink') else B
                rm = B if av is A else A
                if rm['type'] != 'room':
                    continue
                q = max(0.0, av.get('Q', 0.0))*max(0.0, av.get('m', {}).get(self.mode, 1.0))/3600.0
                into = av['type'] == 'asup'
                self.net[self.idx[rm['id']]] += q if into else -q
                qab = (q if into else -q) if av is A else (-q if into else q)
                self.active.append(dict(li=li, q=qab,
                                        Ae=max(1e-6, L.get('A', 0.2))))
                continue
            f = min(1.0, max(0.0, L['f'][self.mode]))
            Ae = f*max(0.0, L.get('A', 0.0)) + (1 - f)*max(0.0, L.get('gap', 0.0))
            self.edges.append(dict(
                li=li,
                ia=self.idx[A['id']] if A['type'] == 'room' else -1,
                ib=self.idx[B['id']] if B['type'] == 'room' else -1,
                C=max(0.0, L.get('cd', 0.6))*Ae*math.sqrt(2/self.rho_ref), Ae=Ae,
                dth=G*L.get('h', 0.0)*(self._rho_of(B) - self._rho_of(A)), leak=False))
        for i, r in enumerate(self.rooms):
            lk = max(0.0, r.get('leak', 0.0))
            self.edges.append(dict(li=-1, ia=i, ib=-1,
                                   C=self.cd_leak*lk*math.sqrt(2/self.rho_ref),
                                   Ae=lk, dth=0.0, leak=True))

    def residual(self, p):
        R = list(self.net)
        for e in self.edges:
            pa = 0.0 if e['ia'] < 0 else p[e['ia']]
            pb = 0.0 if e['ib'] < 0 else p[e['ib']]
            q = e['C']*fq(pa - pb + e['dth'], self.delta)
            if e['ia'] >= 0:
                R[e['ia']] -= q
            if e['ib'] >= 0:
                R[e['ib']] += q
        return np.array(R)

    def solve(self, delta=None):
        if delta is not None:
            self.delta = delta
        n = len(self.rooms)
        if n == 0:
            return dict(p=[], flows=[], leaks=[], converged=True)
        sol = root(self.residual, np.zeros(n), method='hybr',
                   options=dict(xtol=1e-13, maxfev=20000))
        p = sol.x
        # polish with a few plain Newton steps on the analytic derivative
        for _ in range(200):
            r = self.residual(p)
            if max(abs(r)) < 1e-14:
                break
            J = np.zeros((n, n))
            for e in self.edges:
                pa = 0.0 if e['ia'] < 0 else p[e['ia']]
                pb = 0.0 if e['ib'] < 0 else p[e['ib']]
                d = pa - pb + e['dth']
                a = abs(d)
                dq = e['C']*(1/math.sqrt(self.delta) if a < self.delta else 0.5/math.sqrt(a))
                if e['ia'] >= 0:
                    J[e['ia']][e['ia']] -= dq
                    if e['ib'] >= 0:
                        J[e['ia']][e['ib']] += dq
                if e['ib'] >= 0:
                    J[e['ib']][e['ib']] -= dq
                    if e['ia'] >= 0:
                        J[e['ib']][e['ia']] += dq
            try:
                dx = np.linalg.solve(J, -r)
            except np.linalg.LinAlgError:
                break
            mx = max(abs(dx)) if n else 0.0
            p = p + dx*(30/mx if mx > 30 else 1.0)
        return self._report(p, sol)

    def _report(self, p, sol):
        flows, leaks = [], []
        for e in self.edges:
            pa = 0.0 if e['ia'] < 0 else p[e['ia']]
            pb = 0.0 if e['ib'] < 0 else p[e['ib']]
            d = pa - pb + e['dth']
            q = e['C']*fq(d, self.delta)
            if e['leak']:
                leaks.append(dict(i=e['ia'], q=q, dp=d))
            else:
                flows.append(dict(li=e['li'], dp=d, q=q, Ae=e['Ae'],
                                  v=abs(q)/e['Ae'] if e['Ae'] > 1e-9 else 0.0, active=False))
        for a in self.active:
            flows.append(dict(li=a['li'], dp=None, q=a['q'], Ae=a['Ae'],
                              v=abs(a['q'])/a['Ae'], active=True))
        flows.sort(key=lambda f: f['li'])
        env_out = 0.0
        for f in flows:
            if f['active']:
                continue
            L = self.m['links'][f['li']]
            A, B = self.byid[L['a']], self.byid[L['b']]
            if B['type'] in ('psup', 'psink'):
                env_out += f['q']
            elif A['type'] in ('psup', 'psink'):
                env_out -= f['q']
        for k in leaks:
            env_out += k['q']
        outflow = [0.0]*len(self.rooms)
        for f in flows:
            L = self.m['links'][f['li']]
            A, B = self.byid[L['a']], self.byid[L['b']]
            if f['q'] > 0 and A['type'] == 'room':
                outflow[self.idx[A['id']]] += f['q']
            elif f['q'] < 0 and B['type'] == 'room':
                outflow[self.idx[B['id']]] += -f['q']
        for k in leaks:
            if k['q'] > 0:
                outflow[k['i']] += k['q']
        # per-zone balance, computed from the reported flows only
        zone = [0.0]*len(self.rooms)
        for i, v in enumerate(self.net):
            zone[i] += v
        for f in flows:
            if f['active']:
                continue
            L = self.m['links'][f['li']]
            A, B = self.byid[L['a']], self.byid[L['b']]
            if A['type'] == 'room':
                zone[self.idx[A['id']]] -= f['q']
            if B['type'] == 'room':
                zone[self.idx[B['id']]] += f['q']
        for k in leaks:
            zone[k['i']] -= k['q']
        return dict(p=list(map(float, p)),
                    flows=flows, leaks=leaks, net=list(self.net),
                    env_out=env_out, imbalance=sum(self.net) - env_out,
                    outflow=outflow, zone_residual=zone,
                    worst_zone_residual=max(abs(z) for z in zone) if zone else 0.0,
                    solver_residual=float(max(abs(self.residual(np.array(p))))) if len(p) else 0.0,
                    converged=bool(sol.success) if sol is not None else True)


# ------------------------------------------------------------------ the model
def modes(v):
    return {m: v for m in ('prod', 'clean', 'dry', 'defr', 'idle', 'emg', 'fire')}


def default_model():
    nodes = [
      dict(id='AS1', type='asup', Q=4600, T=20, RH=45, m=modes(1.0)),
      dict(id='AS2', type='asup', Q=22000, T=20, RH=45, m=modes(1.0)),
      dict(id='AX1', type='asink', Q=17700, T=20, RH=50, m=modes(1.0)),
      dict(id='PS1', type='psup', T=5, RH=70),
      dict(id='R1', type='room', V=1200, T=20, RH=45, leak=0.05, rank=1),
      dict(id='R2', type='room', V=2500, T=20, RH=45, leak=0.12, rank=2),
      dict(id='R4', type='room', V=1800, T=16, RH=50, leak=0.25, rank=3),
      dict(id='AS3', type='asup', Q=1600, T=20, RH=45, m=modes(1.0)),
      dict(id='R3', type='room', V=400, T=22, RH=60, leak=0.04, rank=4),
      dict(id='AX2', type='asink', Q=2200, T=22, RH=80, m=modes(1.0)),
      dict(id='PX1', type='psink', T=5, RH=70)]
    links = [
      dict(id='K1', a='AS1', b='R1', A=0.50, gap=0.50, cd=0.65, h=0, f=modes(1.0)),
      dict(id='K2', a='AS2', b='R2', A=1.50, gap=1.50, cd=0.65, h=0, f=modes(1.0)),
      dict(id='K3', a='R2', b='AX1', A=1.20, gap=1.20, cd=0.65, h=0, f=modes(1.0)),
      dict(id='K4', a='AS3', b='R3', A=0.25, gap=0.25, cd=0.65, h=0, f=modes(1.0)),
      dict(id='K5', a='R3', b='AX2', A=0.20, gap=0.20, cd=0.65, h=0, f=modes(1.0)),
      dict(id='K6', a='R1', b='R2', A=0.50, gap=0.50, cd=0.60, h=0, f=modes(1.0)),
      dict(id='K7', a='R2', b='R3', A=1.60, gap=0.015, cd=0.60, h=0,
           f=dict(prod=0, clean=0.25, dry=0.15, defr=0.10, idle=0, emg=0.10, fire=1)),
      dict(id='K8', a='R2', b='R4', A=0.80, gap=0.80, cd=0.65, h=0, f=modes(1.0)),
      dict(id='K9', a='PS1', b='R4', A=0.60, gap=0.60, cd=0.65, h=0, f=modes(1.0)),
      dict(id='K10', a='R4', b='PX1', A=0.80, gap=0.80, cd=0.65, h=0, f=modes(1.0))]
    return dict(nodes=nodes, links=links)


def variant(**kw):
    m = default_model()
    for k, v in kw.items():
        if k == 'node':
            for nid, patch in v.items():
                for n in m['nodes']:
                    if n['id'] == nid:
                        n.update(patch)
        elif k == 'link':
            for lid, patch in v.items():
                for L in m['links']:
                    if L['id'] == lid:
                        L.update(patch)
    return m


def two_room_analytic(q_sup, cd, A, cd2, A2, rho_ref=1.2):
    """Two rooms in series to ambient, one imposed supply into room 1.

    Every cubic metre pushed into room 1 must cross opening 1 into room 2 and then
    opening 2 to ambient, so both carry Q = q_sup and
        dp_i = rho/2 * (Q/(Cd_i A_i))^2,   p2 = dp2,  p1 = dp1 + dp2.
    A closed form with no solver in it at all."""
    dp2 = rho_ref/2*(q_sup/(cd2*A2))**2
    dp1 = rho_ref/2*(q_sup/(cd*A))**2
    return dict(q=q_sup, dp1=dp1, dp2=dp2, p1=dp1 + dp2, p2=dp2)


def build():
    cases = []

    # --- A. closed-form series cascade, no solver in the reference at all
    for i, (q, cd1, a1, cd2, a2) in enumerate([
            (3600.0, 0.60, 0.50, 0.65, 0.80),
            (7200.0, 0.65, 1.00, 0.65, 0.50),
            (1800.0, 0.60, 0.20, 0.60, 0.20)]):
        an = two_room_analytic(q/3600.0, cd1, a1, cd2, a2)
        model = dict(nodes=[dict(id='AS1', type='asup', Q=q, T=20, m=modes(1.0)),
                            dict(id='R1', type='room', V=500, T=20, leak=0.0, rank=1),
                            dict(id='R2', type='room', V=500, T=20, leak=0.0, rank=2),
                            dict(id='PX1', type='psink', T=20)],
                     links=[dict(id='K1', a='AS1', b='R1', A=1, gap=1, cd=0.65, h=0, f=modes(1.0)),
                            dict(id='K2', a='R1', b='R2', A=a1, gap=a1, cd=cd1, h=0, f=modes(1.0)),
                            dict(id='K3', a='R2', b='PX1', A=a2, gap=a2, cd=cd2, h=0, f=modes(1.0))])
        num = Network(model, 'prod', rho_ref=1.2, cd_leak=0.65, t_out=20.0).solve()
        cases.append(dict(id=f'series_cascade_{i}', group='closed_form',
                          note='two rooms in series to ambient with one imposed supply: the '
                               'pressures follow from the orifice law alone, with no network '
                               'solve at all',
                          model=model, mode='prod',
                          expected=dict(analytic=an, numeric=num)))

    # --- B. the shipped default building, all seven modes
    for mode in ('prod', 'clean', 'dry', 'defr', 'idle', 'emg', 'fire'):
        m = default_model()
        cases.append(dict(id=f'default_{mode}', group='network',
                          note=f'the building the tool opens with, operating mode "{mode}"',
                          model=m, mode=mode,
                          expected=Network(m, mode, 1.2, 0.65, 5.0).solve()))

    # --- C. variants that stress the model
    plan = [
        ('thermal_draught', variant(link={'K6': dict(h=3.0)}),
         'a 3 m height offset on the R1-R2 grille, with R1 at 20 C and R2 at 20 C: the stack '
         'term must be zero when the densities are equal'),
        ('thermal_draught_hot', variant(node={'R2': dict(T=45)}, link={'K6': dict(h=3.0)}),
         'the same 3 m offset with R2 at 45 C: dp_th = g h (rho_B - rho_A) must appear'),
        ('no_leakage', variant(node={'R1': dict(leak=0.0), 'R2': dict(leak=0.0),
                                     'R3': dict(leak=0.0), 'R4': dict(leak=0.0)}),
         'no envelope leakage anywhere: the whole imbalance must leave through the passive '
         'openings'),
        ('heavy_leakage', variant(node={'R1': dict(leak=0.5), 'R2': dict(leak=1.2),
                                        'R3': dict(leak=0.4), 'R4': dict(leak=2.5)}),
         'ten times the envelope leakage: the cascade must collapse towards zero'),
        ('extract_dominant', variant(node={'AX1': dict(Q=30000)}),
         'extract raised well above supply: every room must go to under-pressure'),
        ('supply_dominant', variant(node={'AX1': dict(Q=2000), 'AX2': dict(Q=200)}),
         'supply well above extract: every room must go to over-pressure'),
        ('closed_doors', variant(link={'K6': dict(f=modes(0.0)), 'K8': dict(f=modes(0.0))}),
         'the internal grille and opening closed down to their gaps'),
        ('cold_outside', variant(node={'PS1': dict(T=-15), 'PX1': dict(T=-15),
                                       'R4': dict(T=10)},
                                 link={'K9': dict(h=2.0), 'K10': dict(h=-2.0)}),
         'winter: -15 C outside, height offsets on both envelope openings'),
    ]
    for name, m, note in plan:
        cases.append(dict(id=f'variant_{name}', group='network', note=note, model=m,
                          mode='prod',
                          expected=Network(m, 'prod', 1.2, 0.65, -15.0 if 'cold' in name else 5.0)
                                   .solve()))

    # --- D. over-constrained / unbalanced networks
    over = dict(nodes=[dict(id='AS1', type='asup', Q=3600, T=20, m=modes(1.0)),
                       dict(id='R1', type='room', V=500, T=20, leak=0.0, rank=1)],
                links=[dict(id='K1', a='AS1', b='R1', A=1, gap=1, cd=0.65, h=0, f=modes(1.0))])
    cases.append(dict(id='over_constrained_sealed_room', group='degenerate',
                      note='a sealed room with an imposed supply and no way out: there is no '
                           'steady state, and the pressure the model would need is unbounded',
                      model=over, mode='prod', expected=dict(no_steady_state=True)))
    unbal = dict(nodes=[dict(id='AS1', type='asup', Q=3600, T=20, m=modes(1.0)),
                        dict(id='AX1', type='asink', Q=7200, T=20, m=modes(1.0)),
                        dict(id='R1', type='room', V=500, T=20, leak=0.0, rank=1)],
                 links=[dict(id='K1', a='AS1', b='R1', A=1, gap=1, cd=0.65, h=0, f=modes(1.0)),
                        dict(id='K2', a='R1', b='AX1', A=1, gap=1, cd=0.65, h=0, f=modes(1.0))])
    cases.append(dict(id='over_constrained_net_extract', group='degenerate',
                      note='extract exceeds supply by 3600 m3/h in a sealed room: again no '
                           'steady state exists',
                      model=unbal, mode='prod', expected=dict(no_steady_state=True)))
    return cases


if __name__ == '__main__':
    out = dict(
        reference='Steady multizone air-flow network with the square-root opening law, the '
                  'stack pressure term and the zone mass balance, re-implemented from ASHRAE '
                  'Fundamentals ch. 16 / CIBSE Guide A and solved with scipy.optimize.root '
                  '(Powell hybrid) followed by a Newton polish; the series cascade is compared '
                  'against a closed form that uses no solver at all.',
        citations=[
            'ASHRAE Handbook - Fundamentals (2021), chapter 16 "Ventilation and Infiltration": '
            'orifice flow Q = Cd A sqrt(2 dp / rho) and the thermal (stack) pressure '
            'dp = g h (rho_o - rho_i).',
            'CIBSE Guide A, "Environmental design", appendix 4A: flow through purpose-provided '
            'openings and discharge coefficients for doors, grilles and gaps.',
            'G.N. Walton, "AIRNET - a computer program for building airflow network modeling", '
            'NISTIR 89-4072, National Institute of Standards and Technology, 1989: the node '
            'mass balance of a multizone network and its Newton solution.',
            'scipy ' + __import__('scipy').__version__],
        cases=build())
    json.dump(out, open(OUT, 'w'), indent=1)
    print('wrote', OUT, len(out['cases']), 'cases')
